import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVoiceCallEnd } from '@/lib/services/voice-post-call';
import { extractServicesFromTranscript } from '@/lib/utils/service-extraction';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

// Session VPC-1: retry state machine constants. Cron cadence is */2 min, so a
// 5-minute window admits ~2-3 retry attempts before terminal timeout. Customer
// expectation set by agent ("within a minute or two") makes anything past 5 min
// a missed promise — failed_no_phone surfaces it for diagnostics.
const RETRY_WINDOW_MS = 5 * 60 * 1000;
const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface ElevenLabsConversation {
  conversation_id: string;
  status: string;
  start_time_unix_secs?: number;
}

interface ElevenLabsConversationDetail {
  conversation_id: string;
  status: string;
  metadata?: Record<string, string>;
  analysis?: {
    transcript_summary?: string;
    call_successful?: string;
    data_collection_results?: Record<string, { value: string }>;
  };
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, string>;
  };
  transcript?: Array<{ role: string; message: string }>;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * GET /api/cron/voice-calls-poll
 * Polls the ElevenLabs Conversational AI API for recently completed calls.
 * Safety net for calls where the agent didn't invoke finalize_call.
 *
 * Session VPC-1 retry state machine: when a conversation's data has not yet
 * been finalized by ElevenLabs (no phone available), the cron tracks it as
 * `status='awaiting_data'` and retries on each subsequent poll until phone
 * extraction succeeds (`status='completed'`) or the 5-minute hard timeout
 * fires (`status='failed_no_phone'`).
 *
 * Auth: x-api-key (CRON_API_KEY)
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    return NextResponse.json({
      success: true,
      message: 'ElevenLabs API key or agent ID not configured, skipping',
    });
  }

  const admin = createAdminClient();

  try {
    // ---------------------------------------------------------------------
    // Step A — process awaiting_data retries
    // ---------------------------------------------------------------------
    const retryCutoff = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
    const { data: pendingRetries } = await admin
      .from('voice_call_log')
      .select('id, elevenlabs_conversation_id, retry_count')
      .eq('status', 'awaiting_data')
      .gt('first_attempted_at', retryCutoff);

    let retriedSucceeded = 0;
    let retriedStillPending = 0;
    let processedFromNew = 0;
    let skippedFromNew = 0;

    for (const row of pendingRetries || []) {
      const detail = await fetchConversationDetail(row.elevenlabs_conversation_id);
      if (!detail) continue; // logged inside helper

      const phone = extractPhone(detail);
      const nextAttempt = (row.retry_count ?? 0) + 1;

      if (!phone) {
        await admin
          .from('voice_call_log')
          .update({ retry_count: nextAttempt, last_attempted_at: new Date().toISOString() })
          .eq('id', row.id);
        console.log(
          `[VoicePoll] No phone yet for ${row.elevenlabs_conversation_id}, attempt ${nextAttempt} (will retry)`
        );
        retriedStillPending++;
        continue;
      }

      console.log(
        `[VoicePoll] Phone available on retry for ${row.elevenlabs_conversation_id} (attempt ${nextAttempt}), processing now`
      );
      // Bump retry counters before claim/process; processVoiceCallEnd will
      // upgrade status to 'processing' then 'completed'.
      await admin
        .from('voice_call_log')
        .update({ retry_count: nextAttempt, last_attempted_at: new Date().toISOString() })
        .eq('id', row.id);

      const result = await processConversation(admin, detail, phone);
      if (result.skipped) skippedFromNew++; else retriedSucceeded++;
    }

    // ---------------------------------------------------------------------
    // Step B — sweep timed-out awaiting_data rows to terminal failed_no_phone
    // ---------------------------------------------------------------------
    const { data: timedOutRows } = await admin
      .from('voice_call_log')
      .update({
        status: 'failed_no_phone',
        skip_reason: 'exceeded_5min_timeout',
        last_attempted_at: new Date().toISOString(),
      })
      .eq('status', 'awaiting_data')
      .lte('first_attempted_at', retryCutoff)
      .select('elevenlabs_conversation_id, retry_count');

    let timedOut = 0;
    for (const row of timedOutRows || []) {
      timedOut++;
      console.log(
        `[VoicePoll] ${row.elevenlabs_conversation_id} exceeded 5min timeout, marking failed_no_phone (final retry_count: ${row.retry_count ?? 0})`
      );
    }

    // ---------------------------------------------------------------------
    // Step C — process new conversations (cursor-driven)
    // ---------------------------------------------------------------------
    const { data: pollSetting } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'last_voice_poll_at')
      .maybeSingle();

    let lastPollAt: string;
    if (pollSetting?.value) {
      try {
        lastPollAt = JSON.parse(pollSetting.value);
      } catch {
        lastPollAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      }
    } else {
      lastPollAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    }

    const lastPollUnix = Math.floor(new Date(lastPollAt).getTime() / 1000);

    const listUrl = `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${ELEVENLABS_AGENT_ID}`;
    const listResponse = await fetch(listUrl, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(15000),
    });

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      console.error(`[VoicePoll] ElevenLabs API error ${listResponse.status}:`, errText);
      return NextResponse.json({
        success: false,
        error: `ElevenLabs API returned ${listResponse.status}`,
      }, { status: 502 });
    }

    const listData = await listResponse.json();
    const conversations: ElevenLabsConversation[] = listData.conversations || [];

    const newConversations = conversations.filter((c) => {
      if (!c.start_time_unix_secs) return true;
      return c.start_time_unix_secs > lastPollUnix;
    });

    for (const conv of newConversations) {
      // Skip anything we already track (in any state — completed, processing,
      // awaiting_data, failed_no_phone, or legacy 'processed').
      const { data: existing } = await admin
        .from('voice_call_log')
        .select('id')
        .eq('elevenlabs_conversation_id', conv.conversation_id)
        .maybeSingle();

      if (existing) {
        skippedFromNew++;
        continue;
      }

      const detail = await fetchConversationDetail(conv.conversation_id);
      if (!detail) continue;

      const phone = extractPhone(detail);

      if (!phone) {
        // Begin retry tracking instead of inserting a permanent block row.
        const { error: insertErr } = await admin.from('voice_call_log').insert({
          elevenlabs_conversation_id: conv.conversation_id,
          phone: null,
          source: 'poll',
          status: 'awaiting_data',
          // first_attempted_at + retry_count default via migration; explicit for clarity
          first_attempted_at: new Date().toISOString(),
          retry_count: 0,
          last_attempted_at: new Date().toISOString(),
        });
        if (insertErr) {
          console.error(
            `[VoicePoll] Failed to insert awaiting_data for ${conv.conversation_id}:`,
            insertErr
          );
        } else {
          console.log(
            `[VoicePoll] No phone yet for ${conv.conversation_id}, attempt 1 (will retry)`
          );
        }
        skippedFromNew++;
        continue;
      }

      const result = await processConversation(admin, detail, phone);
      if (result.skipped) skippedFromNew++; else processedFromNew++;
    }

    // ---------------------------------------------------------------------
    // Step E — prune failed_no_phone rows older than 30 days
    // (Strict status filter prevents touching active retries.)
    // ---------------------------------------------------------------------
    const failedRetentionCutoff = new Date(Date.now() - FAILED_RETENTION_MS).toISOString();
    const { data: prunedRows } = await admin
      .from('voice_call_log')
      .delete()
      .eq('status', 'failed_no_phone')
      .lt('first_attempted_at', failedRetentionCutoff)
      .select('id');
    const prunedCount = prunedRows?.length ?? 0;
    if (prunedCount > 0) {
      console.log(`[VoicePoll] Pruned ${prunedCount} failed_no_phone rows older than 30 days`);
    }

    // ---------------------------------------------------------------------
    // Step D — advance the cursor
    // ---------------------------------------------------------------------
    const now = new Date().toISOString();
    const { data: existingSetting } = await admin
      .from('business_settings')
      .select('id')
      .eq('key', 'last_voice_poll_at')
      .maybeSingle();

    if (existingSetting) {
      await admin
        .from('business_settings')
        .update({ value: JSON.stringify(now) })
        .eq('key', 'last_voice_poll_at');
    } else {
      await admin.from('business_settings').insert({
        key: 'last_voice_poll_at',
        value: JSON.stringify(now),
        category: 'voice',
      });
    }

    const totalProcessed = processedFromNew + retriedSucceeded;
    console.log(
      `[VoicePoll] Done — ${totalProcessed} processed (${processedFromNew} new, ${retriedSucceeded} via retry), ` +
      `${retriedStillPending} pending, ${timedOut} timed out, ${skippedFromNew} skipped, ` +
      `${newConversations.length} listed`
    );

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      processedFromNew,
      retriedSucceeded,
      retriedStillPending,
      timedOut,
      skipped: skippedFromNew,
      total: newConversations.length,
    });
  } catch (err) {
    console.error('[VoicePoll] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchConversationDetail(
  conversationId: string
): Promise<ElevenLabsConversationDetail | null> {
  const detailUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`;
  const detailResponse = await fetch(detailUrl, {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY! },
    signal: AbortSignal.timeout(15000),
  });
  if (!detailResponse.ok) {
    console.error(
      `[VoicePoll] Failed to fetch detail for ${conversationId}: ${detailResponse.status}`
    );
    return null;
  }
  return detailResponse.json();
}

function extractPhone(detail: ElevenLabsConversationDetail): string | undefined {
  const dynVars = detail.conversation_initiation_client_data?.dynamic_variables || {};
  const dataCollection = detail.analysis?.data_collection_results || {};
  return (
    dynVars['customer_phone'] ||
    detail.metadata?.['phone'] ||
    dataCollection['phone']?.value
  );
}

/**
 * Extract every other field from the ElevenLabs detail payload and dispatch
 * processVoiceCallEnd. Returns { skipped } so the caller can tally outcomes.
 *
 * Phone is passed in (caller has already asserted it's available) so we don't
 * re-derive it.
 */
async function processConversation(
  admin: AdminClient,
  detail: ElevenLabsConversationDetail,
  phone: string
): Promise<{ skipped: boolean }> {
  const dynVars = detail.conversation_initiation_client_data?.dynamic_variables || {};
  const dataCollection = detail.analysis?.data_collection_results || {};

  // Transcript summary
  let transcriptSummary = detail.analysis?.transcript_summary || '';
  if (!transcriptSummary && detail.transcript) {
    transcriptSummary = detail.transcript
      .map((t) => `${t.role}: ${t.message}`)
      .join('\n')
      .substring(0, 3000);
  }

  // Agent-only transcript (catalog names) for service extraction fallback
  const agentTranscript = (detail.transcript || [])
    .filter((t) => t.role === 'agent' && t.message)
    .map((t) => t.message)
    .join(' ');

  const customerName = dynVars['customer_name'] || undefined;

  // Vehicle info from customer_summary, fallback to transcript extractor
  let vehicleMake: string | undefined;
  let vehicleModel: string | undefined;
  let vehicleYear: number | undefined;
  let vehicleColor: string | undefined;

  const customerSummary = dynVars['customer_summary'] || '';
  const vehicleMatch = customerSummary.match(
    /VEHICLES:\n\s+(\d{4})?\s*(\w+)?\s+(\w[\w-]+)\s+([\w\s-]+?)(?:\s*\(|$)/m
  );
  if (vehicleMatch) {
    vehicleYear = vehicleMatch[1] ? parseInt(vehicleMatch[1], 10) : undefined;
    vehicleColor = sanitizeVehicleField(vehicleMatch[2]) ?? undefined;
    vehicleMake = sanitizeVehicleField(vehicleMatch[3]) ?? undefined;
    vehicleModel = sanitizeVehicleField(vehicleMatch[4]?.trim()) ?? undefined;
  }

  if (!vehicleMake && !vehicleModel && transcriptSummary) {
    const { extractVehicleFromTranscript } = await import('@/lib/services/voice-post-call');
    const extracted = extractVehicleFromTranscript(transcriptSummary);
    if (extracted) {
      vehicleMake = sanitizeVehicleField(extracted.vehicleMake) ?? undefined;
      vehicleModel = sanitizeVehicleField(extracted.vehicleModel) ?? undefined;
      vehicleYear = extracted.vehicleYear ? parseInt(extracted.vehicleYear, 10) || undefined : undefined;
      vehicleColor = sanitizeVehicleField(extracted.vehicleColor) ?? undefined;
    }
  }

  // Customer interest — data_collection or transcript-keyword inference
  let customerInterest: string | undefined;
  if (dataCollection['customer_interest']?.value) {
    customerInterest = dataCollection['customer_interest'].value;
  } else if (transcriptSummary) {
    const lower = transcriptSummary.toLowerCase();
    const interestedKeywords = ['interested in booking', 'confirmed their interest', 'wants to schedule', 'would like to book', 'agreed to', 'ready to book'];
    const notInterestedKeywords = ['declined', 'not interested', 'just asking', 'just inquiring', 'changed their mind', 'decided against'];
    if (interestedKeywords.some((kw) => lower.includes(kw))) {
      customerInterest = 'interested';
    } else if (notInterestedKeywords.some((kw) => lower.includes(kw))) {
      customerInterest = 'not_interested';
    } else {
      customerInterest = 'interested';
    }
  }

  // Customer type — data_collection or transcript-keyword inference
  let customerType: string | undefined;
  if (dataCollection['customer_type']?.value) {
    customerType = dataCollection['customer_type'].value;
  } else if (transcriptSummary) {
    const lower = transcriptSummary.toLowerCase();
    const professionalKeywords = ['dealership', 'dealer', 'fleet', 'wholesale', 'my shop', 'our shop', 'body shop', 'commercial', 'multiple vehicles'];
    customerType = professionalKeywords.some((kw) => lower.includes(kw)) ? 'professional' : 'enthusiast';
  }

  // Appointment booked — data_collection or conversation_history scan
  let appointmentBooked = false;
  if (dataCollection['appointment_booked']?.value === 'true') {
    appointmentBooked = true;
  } else {
    const convHistory = dynVars['system__conversation_history'] || '';
    if (convHistory.includes('"tool_name"') && convHistory.includes('appointment')) {
      try {
        const parsed = JSON.parse(convHistory);
        const entries = parsed?.entries || [];
        appointmentBooked = entries.some(
          (e: { tool_requests?: Array<{ tool_name: string }> }) =>
            e.tool_requests?.some((tr) =>
              tr.tool_name === 'create_appointment' || tr.tool_name === 'book_appointment'
            )
        );
      } catch {
        // ignore parse failure — leave false
      }
    }
  }

  // Services discussed — data_collection or transcript matching
  let servicesDiscussed: string[] = [];
  const dcServices = dataCollection['services_discussed']?.value;
  if (dcServices && typeof dcServices === 'string' && dcServices.trim()) {
    servicesDiscussed = dcServices.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (servicesDiscussed.length === 0 && (transcriptSummary || agentTranscript)) {
    servicesDiscussed = await extractServicesFromTranscript(
      admin,
      transcriptSummary,
      agentTranscript || undefined
    );
    if (servicesDiscussed.length > 0) {
      console.log(`[VoicePoll] Extracted services from transcript: [${servicesDiscussed.join(', ')}]`);
    }
  }

  const result = await processVoiceCallEnd({
    phone,
    transcriptSummary: transcriptSummary || undefined,
    servicesDiscussed,
    customerName,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleColor,
    customerInterest,
    customerType,
    appointmentBooked,
    durationSeconds: detail.call_duration_secs,
    elevenlabsConversationId: detail.conversation_id,
    source: 'poll',
  });

  return { skipped: result.skipped === true };
}
