import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVoiceCallEnd } from '@/lib/services/voice-post-call';
import { extractServicesFromTranscript } from '@/lib/utils/service-extraction';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

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

/**
 * GET /api/cron/voice-calls-poll
 * Polls the ElevenLabs Conversational AI API for recently completed calls.
 * Safety net for calls where the agent didn't invoke finalize_call.
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

  // Clean up old entries logged without a phone (pre-fix for customer_phone key).
  // These block reprocessing of real calls. Only delete poll entries older than 1 hour.
  await admin.from('voice_call_log')
    .delete()
    .is('phone', null)
    .eq('source', 'poll')
    .lt('processed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  // Read last poll timestamp
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

  try {
    // List recent conversations from ElevenLabs
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

    // Filter to conversations newer than last poll
    const newConversations = conversations.filter((c) => {
      if (!c.start_time_unix_secs) return true; // include if no timestamp
      return c.start_time_unix_secs > lastPollUnix;
    });

    let processed = 0;
    let skipped = 0;

    for (const conv of newConversations) {
      // Check if already processed
      const { data: existing } = await admin
        .from('voice_call_log')
        .select('id')
        .eq('elevenlabs_conversation_id', conv.conversation_id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Fetch conversation detail for transcript/summary
      const detailUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`;
      const detailResponse = await fetch(detailUrl, {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(15000),
      });

      if (!detailResponse.ok) {
        console.error(`[VoicePoll] Failed to fetch detail for ${conv.conversation_id}: ${detailResponse.status}`);
        continue;
      }

      const detail: ElevenLabsConversationDetail = await detailResponse.json();
      const dynVars = detail.conversation_initiation_client_data?.dynamic_variables || {};
      const dataCollection = detail.analysis?.data_collection_results || {};

      // -----------------------------------------------------------------
      // 1. Phone extraction
      // -----------------------------------------------------------------
      const phone =
        dynVars['customer_phone'] ||
        detail.metadata?.['phone'] ||
        dataCollection['phone']?.value;

      if (!phone) {
        console.warn(`[VoicePoll] No phone found for conversation ${conv.conversation_id}`);
        await admin.from('voice_call_log').insert({
          elevenlabs_conversation_id: conv.conversation_id,
          phone: null,
          source: 'poll',
        });
        skipped++;
        continue;
      }

      // -----------------------------------------------------------------
      // 2. Transcript summary
      // -----------------------------------------------------------------
      let transcriptSummary = detail.analysis?.transcript_summary || '';
      if (!transcriptSummary && detail.transcript) {
        transcriptSummary = detail.transcript
          .map((t) => `${t.role}: ${t.message}`)
          .join('\n')
          .substring(0, 3000);
      }

      // -----------------------------------------------------------------
      // 3. Build agent-only transcript for service extraction fallback
      // Agent messages use exact catalog names from get_services tool.
      // User messages have STT errors ("on-deck cord" → Honda Accord).
      // -----------------------------------------------------------------
      const agentTranscript = (detail.transcript || [])
        .filter((t) => t.role === 'agent' && t.message)
        .map((t) => t.message)
        .join(' ');

      // -----------------------------------------------------------------
      // 4. Customer name
      // -----------------------------------------------------------------
      const customerName = dynVars['customer_name'] || undefined;

      // -----------------------------------------------------------------
      // 5. Vehicle info — parse from customer_summary, fallback to
      //    extractVehicleFromTranscript inside processVoiceCallEnd
      // -----------------------------------------------------------------
      let vehicleMake: string | undefined;
      let vehicleModel: string | undefined;
      let vehicleYear: number | undefined;
      let vehicleColor: string | undefined;

      const customerSummary = dynVars['customer_summary'] || '';
      // Format: "VEHICLES:\n  2016 Silver Honda Accord (sedan)"
      const vehicleMatch = customerSummary.match(
        /VEHICLES:\n\s+(\d{4})?\s*(\w+)?\s+(\w[\w-]+)\s+([\w\s-]+?)(?:\s*\(|$)/m
      );
      if (vehicleMatch) {
        vehicleYear = vehicleMatch[1] ? parseInt(vehicleMatch[1], 10) : undefined;
        vehicleColor = sanitizeVehicleField(vehicleMatch[2]) ?? undefined;
        vehicleMake = sanitizeVehicleField(vehicleMatch[3]) ?? undefined;
        vehicleModel = sanitizeVehicleField(vehicleMatch[4]?.trim()) ?? undefined;
      }

      // Fallback: extract vehicle from transcript summary if customer_summary
      // didn't have it (new callers have no VEHICLES section)
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

      // -----------------------------------------------------------------
      // 6. Customer interest — infer from transcript summary keywords
      // -----------------------------------------------------------------
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
          customerInterest = 'interested'; // default: better to send a quote than miss a lead
        }
      }

      // -----------------------------------------------------------------
      // 7. Customer type — infer from transcript
      // -----------------------------------------------------------------
      let customerType: string | undefined;
      if (dataCollection['customer_type']?.value) {
        customerType = dataCollection['customer_type'].value;
      } else if (transcriptSummary) {
        const lower = transcriptSummary.toLowerCase();
        const professionalKeywords = ['dealership', 'dealer', 'fleet', 'wholesale', 'my shop', 'our shop', 'body shop', 'commercial', 'multiple vehicles'];
        customerType = professionalKeywords.some((kw) => lower.includes(kw)) ? 'professional' : 'enthusiast';
      }

      // -----------------------------------------------------------------
      // 8. Appointment booked — check conversation_history for tool calls
      // -----------------------------------------------------------------
      let appointmentBooked = false;
      if (dataCollection['appointment_booked']?.value === 'true') {
        appointmentBooked = true;
      } else {
        // Check conversation_history for create_appointment tool call
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
            // JSON parse failed — leave as false
          }
        }
      }

      // -----------------------------------------------------------------
      // 9. Services discussed — Option C (data_collection) + Option D (transcript matching)
      // -----------------------------------------------------------------
      let servicesDiscussed: string[] = [];

      // Option C: ElevenLabs data_collection_results
      const dcServices = dataCollection['services_discussed']?.value;
      if (dcServices && typeof dcServices === 'string' && dcServices.trim()) {
        servicesDiscussed = dcServices.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      // Option D fallback: extract from transcript_summary + agent transcript
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

      // -----------------------------------------------------------------
      // 10. Call processVoiceCallEnd with all extracted data
      // -----------------------------------------------------------------
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
        elevenlabsConversationId: conv.conversation_id,
        source: 'poll',
      });

      if (result.skipped) {
        skipped++;
      } else {
        processed++;
      }
    }

    // Update last poll timestamp
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

    console.log(`[VoicePoll] Done — ${processed} processed, ${skipped} skipped, ${newConversations.length} total`);

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      total: newConversations.length,
    });
  } catch (err) {
    console.error('[VoicePoll] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
