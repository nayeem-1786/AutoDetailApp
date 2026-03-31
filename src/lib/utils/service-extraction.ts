import { type SupabaseClient } from '@supabase/supabase-js';

/**
 * Extract service names from text by matching against active services in the DB.
 *
 * Used by the polling cron when finalize_call never fires and services_discussed
 * isn't available from structured data. Scans ElevenLabs transcript_summary first
 * (clean, concise), then falls back to agent-only transcript messages (which use
 * exact catalog names from the get_services tool response).
 *
 * Services are sorted by name length descending so "Signature Complete Detail"
 * matches before shorter substrings like "Complete" or "Detail".
 */
export async function extractServicesFromTranscript(
  supabase: SupabaseClient,
  transcriptSummary: string,
  agentTranscript?: string
): Promise<string[]> {
  try {
    const { data: services } = await supabase
      .from('services')
      .select('name')
      .eq('is_active', true);

    if (!services || services.length === 0) return [];

    // Sort by name length descending to prevent substring false positives
    const sorted = [...services].sort((a, b) => b.name.length - a.name.length);

    // Pass 1: scan transcript_summary (ElevenLabs auto-generated, uses exact names)
    const summaryLower = transcriptSummary.toLowerCase();
    const matched: string[] = [];

    for (const svc of sorted) {
      if (summaryLower.includes(svc.name.toLowerCase())) {
        matched.push(svc.name);
      }
    }

    if (matched.length > 0) return matched;

    // Pass 2: scan agent-only transcript (agent always uses exact catalog names)
    if (agentTranscript) {
      const agentLower = agentTranscript.toLowerCase();
      for (const svc of sorted) {
        if (agentLower.includes(svc.name.toLowerCase())) {
          matched.push(svc.name);
        }
      }
    }

    return matched;
  } catch (err) {
    console.error('[extractServicesFromTranscript] Failed:', err);
    return [];
  }
}
