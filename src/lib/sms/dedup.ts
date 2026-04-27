// SMS dedup cross-check helper.
//
// Purpose: prevent duplicate outbound SMS sends from retry-prone or
// polling-backup sources. The voice-agent post-call pipeline is the original
// motivating call site (Session 2D.2): the finalize-call tool path, the
// call-complete webhook path, and the voice-calls-poll cron path can all fire
// processVoiceCallEnd for the same call. The existing voice_call_log dedup
// keys on elevenlabs_conversation_id and is bypassed entirely when that key
// is missing (see voice-post-call.ts:54). This helper catches duplicates that
// slip past that primary dedup.
//
// Implementation note: queries the `messages` table (joined to `conversations`
// to filter by phone) rather than `sms_delivery_log`. Reason: notificationType
// lives in `messages.metadata->>'notificationType'` (with a dedicated index,
// `idx_messages_metadata_notification_type`); `sms_delivery_log` has no
// notification_type column — its `source` column is too coarse to distinguish
// notification types within the 'transactional' bucket.
//
// Caller requirement: the original sendSms() call MUST have been invoked with
// `logToConversation: true`. Without it, no `messages` row is written and this
// helper has nothing to find. All in-tree call sites that this helper currently
// guards do this — verified at wiring time. Future call sites must do the same.
//
// Defensive on errors: returns false on any query failure. We prefer a
// duplicate over a missed send when the dedup query itself can't run (e.g.,
// transient DB issue). The unique-key checks downstream (e.g., voice_call_log
// constraint) are still in place as additional defense in depth.
//
// Future call sites: Session 3D voice-info-* slug migrations will introduce
// additional notification types (voice_info_quote_link, voice_info_booking_link,
// etc.) that have the same retry/poll-backup duplicate-send risk and should
// adopt this helper.

import type { SupabaseClient } from '@supabase/supabase-js';

interface IsRecentDuplicateSmsParams {
  /** E.164-normalized phone number (matches conversations.phone_number) */
  phone: string;
  /** notificationType value as it appears in messages.metadata->>'notificationType' */
  notificationType: string;
  /** Lookback window in minutes. Default 5. */
  withinMinutes?: number;
  /** Admin Supabase client (service role) — RLS would otherwise block the cross-check */
  supabase: SupabaseClient;
}

/**
 * Returns true when an outbound message with the given notificationType has
 * been sent to the given phone within the lookback window. Returns false on
 * no match OR on any query error (allow-on-failure).
 */
export async function isRecentDuplicateSms(
  params: IsRecentDuplicateSmsParams,
): Promise<boolean> {
  const { phone, notificationType, supabase } = params;
  const withinMinutes = params.withinMinutes ?? 5;

  try {
    // Step 1: resolve phone → conversation_id. Single-row lookup; conversations
    // are unique per phone_number in practice (the inbound webhook + voice
    // pipelines find-or-create on phone).
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('phone_number', phone)
      .maybeSingle();

    if (convErr) {
      console.error('[isRecentDuplicateSms] conversation lookup failed:', convErr.message);
      return false;
    }
    if (!conv) {
      // No conversation exists for this phone — there cannot be a recent
      // outbound message to dedup against.
      return false;
    }

    // Step 2: query messages for a recent outbound row with matching
    // notificationType. Uses idx_messages_metadata_notification_type for the
    // metadata path filter and conversation_id+created_at for the rest.
    const sinceIso = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
    const { data: existing, error: msgErr } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('direction', 'outbound')
      .eq('metadata->>notificationType', notificationType)
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();

    if (msgErr) {
      console.error('[isRecentDuplicateSms] messages lookup failed:', msgErr.message);
      return false;
    }

    return existing !== null;
  } catch (err) {
    console.error('[isRecentDuplicateSms] unexpected error:', err);
    return false;
  }
}
