import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processVoiceCallEnd } from '@/lib/services/voice-post-call';
import type { SupabaseClient } from '@supabase/supabase-js';

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

      // Extract phone from dynamic variables or metadata
      const phone =
        dynVars['customer_phone'] ||
        detail.metadata?.['phone'] ||
        dataCollection['phone']?.value;

      if (!phone) {
        console.warn(`[VoicePoll] No phone found for conversation ${conv.conversation_id}`);
        // Still log it to prevent re-processing
        await admin.from('voice_call_log').insert({
          elevenlabs_conversation_id: conv.conversation_id,
          phone: null,
          source: 'poll',
        });
        skipped++;
        continue;
      }

      // Build transcript summary from analysis or concatenated messages
      let transcriptSummary = detail.analysis?.transcript_summary || '';
      if (!transcriptSummary && detail.transcript) {
        transcriptSummary = detail.transcript
          .map((t) => `${t.role}: ${t.message}`)
          .join('\n')
          .substring(0, 3000);
      }

      // -------------------------------------------------------------------
      // Extract customer name from dynamic_variables (set at call initiation)
      // -------------------------------------------------------------------
      const customerName = dynVars['customer_name'] || undefined;

      // -------------------------------------------------------------------
      // Extract vehicle info from dynamic_variables.customer_summary
      // The summary includes lines like "VEHICLES:\n  2016 Silver Honda Accord (sedan)"
      // -------------------------------------------------------------------
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
        vehicleColor = vehicleMatch[2] || undefined;
        vehicleMake = vehicleMatch[3] || undefined;
        vehicleModel = vehicleMatch[4]?.trim() || undefined;
      }

      // -------------------------------------------------------------------
      // Extract services discussed — Option C (data_collection) + Option D (transcript matching)
      // -------------------------------------------------------------------

      // Try Option C first: ElevenLabs data_collection_results
      const servicesStr = dataCollection['services_discussed']?.value || '';
      let servicesArr = servicesStr
        ? servicesStr.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

      // Option D fallback: match service names from transcript_summary against DB
      if (servicesArr.length === 0 && transcriptSummary) {
        servicesArr = await extractServicesFromSummary(admin, transcriptSummary);
        if (servicesArr.length > 0) {
          console.log(`[VoicePoll] Extracted services from transcript_summary: [${servicesArr.join(', ')}]`);
        }
      }

      const result = await processVoiceCallEnd({
        phone,
        transcriptSummary: transcriptSummary || undefined,
        servicesDiscussed: servicesArr,
        customerName,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
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

// ---------------------------------------------------------------------------
// Option D: Extract service names from transcript summary by matching
// against active services in the database (case-insensitive).
// The transcript_summary is generated by ElevenLabs and uses exact service
// names from the agent's responses (which come from our get_services tool).
// ---------------------------------------------------------------------------

async function extractServicesFromSummary(
  supabase: SupabaseClient,
  summary: string
): Promise<string[]> {
  try {
    const { data: services } = await supabase
      .from('services')
      .select('name')
      .eq('is_active', true);

    if (!services || services.length === 0) return [];

    const summaryLower = summary.toLowerCase();
    const matched: string[] = [];

    // Sort by name length descending so "Signature Complete Detail" matches
    // before "Complete" would as a substring of something else
    const sorted = [...services].sort((a, b) => b.name.length - a.name.length);

    for (const svc of sorted) {
      if (summaryLower.includes(svc.name.toLowerCase())) {
        matched.push(svc.name);
      }
    }

    return matched;
  } catch (err) {
    console.error('[VoicePoll] Failed to extract services from summary:', err);
    return [];
  }
}
