/**
 * Conversation lookup/creation helper for system SMS logging.
 * Ensures every customer-facing SMS has a conversation in the messaging thread.
 *
 * Never throws — returns null on error. Logging must not break SMS sends.
 *
 * Session #150 (Class (a) Item #1) — added `reactivateIfClosed` below; the
 * canonical reactivation primitive that closed/archived conversations get
 * routed through when new activity arrives. See the helper's jsdoc for the
 * AI-context invariant it relies on.
 */

import { normalizePhone } from '@/lib/utils/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any };

/**
 * Find an existing conversation by phone number, or create one.
 * If a conversation exists but has no customer_id and one is provided, backfills it.
 * Handles unique constraint races (concurrent creates for the same phone).
 *
 * Phase Normalization-1: normalizes phone to E.164 at the boundary so callers
 * that pass display-formatted or partially-normalized strings can't create
 * shadow conversations that fragment threads. Returns null on unparseable input
 * (same as any other failure — never throws, per existing contract).
 */
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  phone: string,
  customerId?: string | null
): Promise<string | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    console.warn(`[ConversationHelper] Refused to create conversation for invalid phone: ${JSON.stringify(phone)}`);
    return null;
  }

  try {
    // Look up existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id, customer_id')
      .eq('phone_number', normalized)
      .single();

    if (existing) {
      // Backfill customer_id if missing
      if (customerId && !existing.customer_id) {
        await supabase
          .from('conversations')
          .update({ customer_id: customerId })
          .eq('id', existing.id)
          .is('customer_id', null);
      }
      // Class (a) Item #1 (Session #150) — belt-and-suspenders reactivation
      // on the existing-row path. Every caller that reuses this helper
      // (`sms.ts` chokepoint + quote-reminders cron) benefits without a
      // per-caller change. Default banner ('automated_activity') is the
      // right choice because every existing caller is system-initiated.
      // The chokepoint at `sms.ts` ALSO calls `reactivateIfClosed`
      // explicitly after its conversation update — that's defense for the
      // `options.conversationId`-provided code path where this helper is
      // skipped. The second call is a cheap no-op (status already 'open').
      await reactivateIfClosed(supabase, existing.id);
      return existing.id;
    }

    // Create new conversation
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        phone_number: normalized,
        customer_id: customerId || null,
        is_ai_enabled: true,
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_channel: 'sms',
        unread_count: 0,
      })
      .select('id')
      .single();

    if (created) return created.id;

    // Unique constraint race — another process created it first. Retry select.
    if (createErr?.code === '23505') {
      const { data: retried } = await supabase
        .from('conversations')
        .select('id')
        .eq('phone_number', normalized)
        .single();
      return retried?.id || null;
    }

    console.error('[ConversationHelper] Failed to create conversation:', createErr);
    return null;
  } catch (err) {
    console.error('[ConversationHelper] Unexpected error:', err);
    return null;
  }
}

/**
 * Reactivates a closed or archived conversation when new activity arrives.
 *
 * Pre-#150 the codebase had THREE inline reactivation implementations —
 * Twilio inbound (`webhooks/twilio/inbound/route.ts:399-428`), the
 * operator-typed reply endpoint (`messaging/conversations/[id]/messages/
 * route.ts:155-157`), and voice-post-call (`services/voice-post-call.ts:
 * 262-277`). Plus 10+ paths that should have reactivated but didn't,
 * notably the canonical `sendSms({logToConversation:true})` chokepoint
 * (`src/lib/utils/sms.ts:185-195`) — the cause of the operator's #150
 * bug observation (closed conversations receiving payment-link SMS
 * stayed Closed).
 *
 * This helper is the single primitive all 5 sites now route through.
 *
 * ── INVARIANT (Class (a) Item #1, Session #150) ──
 *
 * The system banner written by this helper carries NO
 * `metadata.notificationType`. That field is the discriminator the AI
 * context filter at `webhooks/twilio/inbound/route.ts:540-545` uses to
 * decide what enters Claude's conversation history. Status markers
 * (this banner, pg_cron auto-close, manual close audit) MUST stay out
 * of AI context; customer-facing notifications (payment links, receipts,
 * quote reminders) DO carry `notificationType` and DO enter AI context —
 * the contract is documented at the filter site.
 *
 * Future system-banner writers MUST follow the same rule: if the banner
 * is a STATUS MARKER (operator-only context, customer didn't receive
 * it), omit `metadata.notificationType`. If it's a customer-facing
 * notification, set it.
 *
 * @returns `{wasReactivated}` — true only when the conversation was in
 *   `'closed'` or `'archived'` and is now `'open'`. No-ops (already open)
 *   return `{wasReactivated: false}` with no writes.
 *
 * @param options.banner — controls banner insertion:
 *   - `'customer_re_engaged'` → `"Conversation reopened — customer re-engaged"`
 *      (customer-initiated reactivation: inbound SMS, inbound voice call)
 *   - `'automated_activity'` → `"Conversation reopened — automated activity"`
 *      (system-initiated: outbound system SMS via chokepoint)
 *   - `null` → flip status, insert NO banner (operator-typed reply path —
 *      the operator's own typed `messages` row is the boundary marker)
 *   - omitted → defaults to `'automated_activity'` (safer default — most
 *      callers are system-outbound)
 *
 * Never throws. Status-write failures and banner-insert failures log to
 * console but do not propagate (logging must not break the calling SMS
 * send / inbound webhook / route response). Same fire-and-forget contract
 * as `logAudit` (see `src/lib/services/audit.ts`).
 */
export interface ReactivateIfClosedResult {
  wasReactivated: boolean;
}

const REACTIVATION_BANNER_BODIES = {
  customer_re_engaged: 'Conversation reopened — customer re-engaged',
  automated_activity: 'Conversation reopened — automated activity',
} as const;

export async function reactivateIfClosed(
  supabase: SupabaseClient,
  conversationId: string,
  options?: {
    banner?: 'customer_re_engaged' | 'automated_activity' | null;
  }
): Promise<ReactivateIfClosedResult> {
  // `banner` value semantics:
  //   undefined → use default ('automated_activity')
  //   null      → flip status, insert no banner
  //   'customer_re_engaged' | 'automated_activity' → flip status + insert banner
  const bannerOption =
    options?.banner === undefined ? 'automated_activity' : options.banner;

  try {
    const { data: conversation, error: readErr } = await supabase
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .single();

    if (readErr || !conversation) {
      console.error(
        '[ConversationHelper] reactivateIfClosed: status read failed',
        { conversationId, error: readErr?.message }
      );
      return { wasReactivated: false };
    }

    if (conversation.status !== 'closed' && conversation.status !== 'archived') {
      return { wasReactivated: false };
    }

    // Session #150 (post-deploy verification) — silent-no-op defense.
    //
    // Pre-fix bug: visual verification of Scenario 1 surfaced a real anomaly
    // — the operator confirmed the helper's UPDATE returned `error: null`
    // but 0 rows affected (status stayed `'closed'` despite the
    // pre-fix code returning `{wasReactivated: true}` and writing a
    // banner). The exact PostgREST mechanism (transient quirk? row-lock
    // contention with the chokepoint's preceding UPDATE? service-role
    // edge case?) is opaque without a runtime trace, BUT the defense is
    // the same regardless: force PostgREST to return the updated row via
    // `.select()`, then verify both row count + post-update status before
    // treating the reactivation as successful.
    //
    // `.select('id, status')` after the UPDATE sets the
    // `Prefer: return=representation` header, which makes PostgREST
    // include the updated rows in the response. Without `.select()`,
    // supabase-js returns `{data: null, error: null}` even when 0 rows
    // matched — the silent-no-op surface that pre-fix code couldn't detect.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('conversations')
      .update({ status: 'open' })
      .eq('id', conversationId)
      .select('id, status');

    if (updateErr) {
      console.error(
        '[ConversationHelper] reactivateIfClosed: status update errored',
        { conversationId, error: updateErr.message }
      );
      return { wasReactivated: false };
    }

    // 0-row UPDATE detection. `error: null` from PostgREST does not
    // guarantee a row was affected — the row may have been concurrently
    // deleted, locked, or hit a SDK-level edge case. Without this guard
    // the banner would still insert, surfacing as the "banner appears but
    // status stays closed" Scenario-1 production bug.
    if (!updatedRows || updatedRows.length === 0) {
      console.error(
        '[ConversationHelper] reactivateIfClosed: UPDATE affected 0 rows (silent no-op)',
        { conversationId }
      );
      return { wasReactivated: false };
    }

    // Post-update status mismatch detection. Defense against the edge case
    // where PostgREST returns a row but the persisted status is not `'open'`
    // (e.g., a concurrent transaction immediately overwrote it). If the row
    // we just wrote does not show `status='open'`, treat the reactivation
    // as failed and skip the banner so we don't surface a "reopened"
    // notice for a conversation that's actually still in a non-open state.
    if (updatedRows[0].status !== 'open') {
      console.error(
        '[ConversationHelper] reactivateIfClosed: post-UPDATE status is not open',
        {
          conversationId,
          observedStatus: updatedRows[0].status,
        }
      );
      return { wasReactivated: false };
    }

    if (bannerOption !== null) {
      // Status-marker contract: NO metadata.notificationType. The AI
      // context filter at webhooks/twilio/inbound/route.ts:540-545 reads
      // notificationType presence as the "include in Claude history" signal.
      const { error: bannerErr } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        body: REACTIVATION_BANNER_BODIES[bannerOption],
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
        // metadata intentionally omitted (status marker, NOT customer notification)
      });
      if (bannerErr) {
        console.error(
          '[ConversationHelper] reactivateIfClosed: banner insert failed',
          { conversationId, banner: bannerOption, error: bannerErr.message }
        );
        // Status flip succeeded; banner write failed. Don't roll back —
        // partial success is preferable to leaving the conversation Closed.
      }
    }

    return { wasReactivated: true };
  } catch (err) {
    console.error('[ConversationHelper] reactivateIfClosed: unexpected error', {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { wasReactivated: false };
  }
}

/**
 * AI history inclusion predicate (Class (a) Item #1, Session #150).
 *
 * Returns `true` when a `messages` row should enter Claude's SMS-turn
 * context, `false` when it must be excluded. The companion contract to
 * `reactivateIfClosed`'s status-marker banner write — both refer to the
 * `metadata.notificationType` field as the "include in AI context" signal.
 *
 * Pre-#150 the filter at `webhooks/twilio/inbound/route.ts:540-541`
 * excluded only `(sender_type='system' AND channel='voice')`. That
 * permitted SMS status markers (pg_cron auto-close banners, reactivation
 * banners, manual close audit, staff-notification audits) into AI context
 * — the prompt-poisoning vector the operator's #150 audit caught.
 *
 * Refined predicate:
 *   - sender_type !== 'system' → always include (customer/staff/AI messages)
 *   - sender_type === 'system' AND channel === 'voice' → always exclude
 *     (voice-call summaries, voice-channel system events — pre-#150 behavior)
 *   - sender_type === 'system' AND channel === 'sms':
 *       - WITH metadata.notificationType → include (customer received this
 *         as a real SMS and may have replied; payment links, receipts,
 *         quote reminders, voice-agent SMS dispatches)
 *       - WITHOUT metadata.notificationType → exclude (pure status marker,
 *         customer never received it)
 *
 * Exported separately from the call site so tests can lock the contract
 * without spinning up the full Twilio webhook surface.
 */
export interface AiHistoryFilterMessage {
  sender_type: string;
  channel: string;
  metadata?: { notificationType?: unknown } | null;
}

export function shouldIncludeInAiHistory(msg: AiHistoryFilterMessage): boolean {
  if (msg.sender_type !== 'system') return true;
  if (msg.channel === 'voice') return false;
  if (!msg.metadata?.notificationType) return false;
  return true;
}
