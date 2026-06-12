/**
 * Payment-link send — shared orchestration helper (Phase 3 Theme B.2).
 *
 * Owns the core orchestration that was previously inlined in the POS route
 * `src/app/api/pos/appointments/[id]/send-payment-link/route.ts`. Two callers
 * delegate to this helper:
 *
 *   1. POS operator route (`POST /api/pos/appointments/[id]/send-payment-link`,
 *      POS session auth) — the operator UI's two-step amount-picker flow.
 *   2. Voice-agent route (`POST /api/voice-agent/send-payment-link`,
 *      Bearer voice_agent_api_key auth) — the 14th SMS AI v2 / phone agent
 *      tool, added by this theme.
 *
 * Memory #2: the shared helper is what unblocks Theme B.2 without duplicating
 * the 250+ lines of orchestration (token mint, balance compute, multi-channel
 * dispatch, post-send stamp). Both routes are thin auth + body validation +
 * delegate shells around this function.
 *
 * Auth boundary: the helper itself does NOT authenticate. Each caller route
 * runs its own auth check first; the helper assumes its caller has already
 * established trust (operator session OR voice-agent api key).
 *
 * Return shape mirrors the legacy route response so callers can pass the
 * helper output through to their HTTP response with at most a minor reshape.
 * Error cases carry both an HTTP status hint AND an error message so callers
 * can map directly to NextResponse.json(... , { status }).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSms } from '@/lib/utils/sms';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';
import { toCents, fromCents, STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';
import { logAudit } from '@/lib/services/audit';
import type { AuditSource } from '@/lib/supabase/types';

const TOKEN_LENGTH = 16;
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_RETRIES = 3;

export type PaymentLinkMethod = 'email' | 'sms' | 'both';
export type PaymentLinkChannelStatus = 'sent' | 'skipped' | 'failed';

export interface PaymentLinkChannelsResult {
  email?: PaymentLinkChannelStatus;
  sms?: PaymentLinkChannelStatus;
}

/**
 * Actor context for the audit_log row written on every successful send
 * (Item 5, Session #149). Mirrors `CancelOrchestrationActor` in
 * `src/lib/appointments/cancel-orchestration.ts` byte-for-byte in shape —
 * `triggeredBy` discriminates the actor class, identity fields are
 * populated for operator-authenticated routes and omitted for the voice
 * agent (no per-user identity exists on a Bearer-api-key auth boundary).
 *
 * `actorSourceFor` (defined below in this module) translates `triggeredBy`
 * → `AuditSource`: `'operator' → 'pos'` (always — the operator route is
 * POS-only) and `'voice_agent' → 'api'` (matches the established
 * specialty-callback + Stripe-webhook precedent of `'api'` for
 * machine-initiated / non-session events).
 */
export interface SendPaymentLinkActor {
  triggeredBy: 'operator' | 'voice_agent';
  userId?: string | null;
  userEmail?: string | null;
  employeeName?: string | null;
  ipAddress?: string | null;
}

export interface SendPaymentLinkInput {
  /** Service-role Supabase client — caller establishes auth context first. */
  admin: SupabaseClient;
  /** Appointment id to send the payment link for. */
  appointmentId: string;
  /** Which channels to dispatch. Caller is responsible for validating shape. */
  method: PaymentLinkMethod;
  /**
   * Optional custom amount in cents. When omitted, the helper falls back to
   * the full remaining balance — same legacy semantic the POS route carried
   * before extraction. Must be an integer >= STRIPE_MIN_AMOUNT_CENTS when
   * provided; caller pre-validates the shape, helper re-validates against
   * the recomputed remaining (never trusts a stale UI / hallucinated agent
   * value).
   */
  amountCents?: number | null;
  /**
   * Item 3 (Session #149, post-#146 audit) — re-send-after-paid guard.
   *
   * When the appointment carries `payment_link_paid_at IS NOT NULL` (the
   * previous link cycle was consumed by a customer payment), the helper
   * returns a structured 409 carrying `code: 'previous_link_paid'` and the
   * prior payment's `amount_cents` + `paid_at` so the caller can surface a
   * confirmation modal to the operator BEFORE re-issuing. Passing
   * `confirmResend: true` bypasses this guard — the operator has explicitly
   * acknowledged the prior payment and intends a new link cycle (the
   * canonical multi-link "deposit + balance" flow uses this path).
   *
   * Designed-flow rationale: the codebase explicitly supports multi-link
   * partial-then-rest cycles (PaymentLinkAmountModal's 25/50/75 presets,
   * the webhook's per-PI idempotency, the `payment-link-status-flip`
   * locked test). A hard block would break that flow; the confirmation
   * surface is the protection layer (audit's Shape B decision).
   */
  confirmResend?: boolean;
  /**
   * Item 5 (Session #149) — actor context for the audit_log row written on
   * every successful send. REQUIRED. See `SendPaymentLinkActor` jsdoc for
   * shape semantics. Mirrors cancel-orchestration's input contract.
   */
  actor: SendPaymentLinkActor;
}

/**
 * Item 3 — the structured 409 payload the caller bubbles up to the client
 * (POS dialog parses `code === 'previous_link_paid'` and renders the
 * confirmation modal; voice-agent route adds `instructions_for_agent` so
 * the LLM gets the same surface via the existing structured-error
 * passthrough in `voiceAgentFetch`).
 */
export interface PreviousLinkPaidInfo {
  /** Most recent payment row's amount in cents (the actual paid amount).
   *  Null only when payments rows exist but carry no amount (degenerate). */
  amount_cents: number | null;
  /** ISO timestamp of the prior link's paid event (appointments.payment_link_paid_at). */
  paid_at: string;
}

export type SendPaymentLinkResult =
  | {
      success: true;
      channels: PaymentLinkChannelsResult;
      payment_link_token: string;
      pay_url: string;
      partial_errors?: string[];
    }
  | {
      success: false;
      /** HTTP status hint the caller should surface (400/404/409/422/500). */
      status: number;
      /** Operator-facing error message. */
      error: string;
      /** When the dispatch step itself failed across all channels. */
      channels?: PaymentLinkChannelsResult;
      /** Per-channel failure messages — populated when channels is set. */
      errors?: string[];
      /** Item 3 structured-code discriminator. Currently the only value is
       *  `'previous_link_paid'` (the re-send-after-paid guard at the
       *  pre-stamp validation step). Callers branch on this to render the
       *  confirmation modal vs. a generic error toast. */
      code?: 'previous_link_paid';
      /** Item 3 — populated alongside code='previous_link_paid'. */
      previous_payment?: PreviousLinkPaidInfo;
    };

/**
 * Translate `SendPaymentLinkActor.triggeredBy` → `audit_log.source`
 * enum value. Mirrors `actorSourceFor` in
 * `src/lib/appointments/cancel-orchestration.ts:850-865`.
 *
 *   `'operator'` → `'pos'`  (POS operator surface — only operator caller today)
 *   `'voice_agent'` → `'api'` (matches specialty-callback + Stripe-webhook
 *      no-session-actor precedent; deliberately NOT a new 'voice_agent'
 *      source value — that's a separate future commit per Session #149 Q8)
 *
 * Exported for the helper's own use AND for any future caller that needs
 * to log a related audit row at the same source.
 */
function actorSourceFor(triggeredBy: 'operator' | 'voice_agent'): AuditSource {
  switch (triggeredBy) {
    case 'operator':
      return 'pos';
    case 'voice_agent':
      return 'api';
  }
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function formatScheduledTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.padStart(2, '0')} ${period}`;
}

/**
 * Send a payment link for an appointment via the chosen channel(s).
 *
 * Validation chain (return-before-mutation):
 *   1. amount_cents shape (when provided) — caller may pre-check; helper enforces
 *   2. appointment exists
 *   3. appointment not cancelled / no_show / already paid
 *   4. customer exists with addresses on the requested channels
 *   5. remaining balance > 0
 *   6. amount_cents (when provided) <= recomputed remaining
 *
 * Side effects on success: mints/reuses payment_link_token; dispatches via
 * `sendTemplatedEmail` + `sendSms`; stamps `payment_link_sent_at` +
 * `payment_link_paid_at=NULL` + `payment_link_amount_cents`. Webhook
 * reconciliation (Theme B.1) handles the post-payment status flip.
 */
export async function sendPaymentLink(
  input: SendPaymentLinkInput
): Promise<SendPaymentLinkResult> {
  const { admin, appointmentId, method, amountCents: rawAmountCents } = input;

  // Re-validate amount_cents shape defensively. Callers SHOULD validate too;
  // the helper enforces the contract so a misbehaving caller can't bypass it.
  let chosenAmountCents: number | null = null;
  if (rawAmountCents !== undefined && rawAmountCents !== null) {
    if (
      typeof rawAmountCents !== 'number' ||
      !Number.isInteger(rawAmountCents) ||
      rawAmountCents < STRIPE_MIN_AMOUNT_CENTS
    ) {
      return {
        success: false,
        status: 422,
        error: `amount_cents must be an integer >= ${STRIPE_MIN_AMOUNT_CENTS}`,
      };
    }
    chosenAmountCents = rawAmountCents;
  }

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select(
      // Item 3 (#149): payment_link_paid_at + payment_link_amount_cents added
      // to the projection so the pre-stamp guard can branch on the prior
      // link's consumed state without a second round trip.
      `id, status, payment_status, total_amount,
       scheduled_date, scheduled_start_time, payment_link_token,
       payment_link_paid_at, payment_link_amount_cents,
       customer:customers(id, first_name, last_name, phone, email)`
    )
    .eq('id', appointmentId)
    .maybeSingle();

  if (apptErr) {
    console.error('[payment-link/send] appt lookup failed', {
      id: appointmentId,
      error: apptErr.message,
    });
    return { success: false, status: 500, error: 'Lookup failed' };
  }
  if (!appt) {
    return { success: false, status: 404, error: 'Appointment not found' };
  }

  if (appt.status === 'cancelled' || appt.status === 'no_show') {
    return {
      success: false,
      status: 409,
      error: `Appointment is ${appt.status}; cannot send payment link`,
    };
  }
  if (appt.payment_status === 'paid') {
    return {
      success: false,
      status: 409,
      error: 'Appointment is already paid',
    };
  }

  const customer = appt.customer as unknown as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  if (!customer) {
    return {
      success: false,
      status: 422,
      error: 'No customer associated with appointment',
    };
  }

  // Strict 422 when a requested channel has no destination on file. Operator
  // UI is expected to gate the send button; voice-agent dispatcher cannot
  // gate this preemptively, so this is a real error path on the agent path.
  if ((method === 'email' || method === 'both') && !customer.email) {
    return {
      success: false,
      status: 422,
      error: 'Customer has no email address on file',
    };
  }
  if ((method === 'sms' || method === 'both') && !customer.phone) {
    return {
      success: false,
      status: 422,
      error: 'Customer has no phone number on file',
    };
  }

  // Remaining balance in cents — same math as the webhook + customer pay page.
  const totalCents = toCents(Number(appt.total_amount));
  const { data: txs, error: txsErr } = await admin
    .from('transactions')
    .select('id')
    .eq('appointment_id', appt.id);
  if (txsErr) {
    throw new Error(`existing-transactions lookup failed: ${txsErr.message}`);
  }
  const txIds = (txs ?? []).map((t) => t.id);
  let paidCents = 0;
  // Item 3 (#149) — most recent payment row, used as the canonical
  // `previous_payment.amount_cents` value in the 409 'previous_link_paid'
  // response shape. Reading the payments table is the authoritative source
  // for "what did the customer actually pay" — `payment_link_amount_cents`
  // stores what the operator CHOSE for the link, which is usually but not
  // always equal (and is null when the operator chose full-remaining).
  let mostRecentPaymentCents: number | null = null;
  if (txIds.length > 0) {
    const { data: pays, error: paysErr } = await admin
      .from('payments')
      .select('amount, created_at')
      .in('transaction_id', txIds)
      .order('created_at', { ascending: false });
    if (paysErr) {
      throw new Error(`existing-payments lookup failed: ${paysErr.message}`);
    }
    const payRows = pays ?? [];
    paidCents = payRows.reduce(
      (sum, p) => sum + toCents(Number(p.amount)),
      0
    );
    if (payRows.length > 0 && payRows[0]?.amount != null) {
      mostRecentPaymentCents = toCents(Number(payRows[0].amount));
    }
  }
  const remainingCents = Math.max(0, totalCents - paidCents);
  if (remainingCents <= 0) {
    return {
      success: false,
      status: 409,
      error: 'Nothing left to pay on this appointment',
    };
  }

  // Server-side overpayment guard. Never trust the caller's view of
  // "remaining" — staff could be looking at stale UI; agents could
  // hallucinate. Recompute and reject anything > remaining.
  if (chosenAmountCents !== null && chosenAmountCents > remainingCents) {
    return {
      success: false,
      status: 422,
      error: `amount_cents (${chosenAmountCents}) exceeds remaining balance (${remainingCents})`,
    };
  }

  // Item 3 (#149) — re-send-after-paid guard. Runs BEFORE token mint +
  // dispatch so a guarded re-send does not actually send anything. The
  // pre-existing line-175 guard (payment_status === 'paid') already blocks
  // the fully-paid case, and the line-241 (remainingCents <= 0) guard
  // catches stale-cache cases — those are NOT this guard's responsibility.
  //
  // The state this guard alone catches: `payment_status='partial'` AND
  // `payment_link_paid_at IS NOT NULL` (the previous link cycle was
  // consumed but there's still balance owed). Without this guard the
  // post-send stamp at line ~440 unconditionally wipes
  // `payment_link_paid_at` → the customer-facing pay page sees the URL
  // as fresh again and the customer can pay the same amount twice if the
  // operator forgets / miscommunicates. Confirmation modal is the operator
  // intent capture; `confirmResend: true` is the explicit bypass for the
  // designed deposit+balance flow.
  if (appt.payment_link_paid_at && !input.confirmResend) {
    return {
      success: false,
      status: 409,
      error: 'Previous payment link was already paid. Confirm to send a new link.',
      code: 'previous_link_paid',
      previous_payment: {
        amount_cents: mostRecentPaymentCents,
        paid_at: appt.payment_link_paid_at as string,
      },
    };
  }

  // Effective link amount: explicit choice, or fall back to full remaining.
  const linkAmountCents = chosenAmountCents ?? remainingCents;

  // Token: reuse existing or mint new with retry on unique-violation.
  let token: string | null = appt.payment_link_token ?? null;
  if (!token) {
    let lastErr: string | undefined;
    for (let attempt = 0; attempt < TOKEN_RETRIES; attempt++) {
      const candidate = generateToken();
      const { error: updErr } = await admin
        .from('appointments')
        .update({ payment_link_token: candidate })
        .eq('id', appt.id)
        .is('payment_link_token', null);

      if (updErr) {
        // 23505 (unique_violation) on the partial unique index — retry with
        // a fresh candidate. Anything else surfaces as 500.
        lastErr = updErr.message;
        continue;
      }

      // Update succeeded OR no rows matched (parallel writer beat us). Re-read
      // to get the canonical value. The is_null guard guarantees we never
      // overwrite a winning concurrent write.
      const { data: re } = await admin
        .from('appointments')
        .select('payment_link_token')
        .eq('id', appt.id)
        .maybeSingle();
      token = re?.payment_link_token ?? null;
      if (token) break;
    }
    if (!token) {
      console.error('[payment-link/send] token generation exhausted', {
        id: appointmentId,
        error: lastErr,
      });
      return {
        success: false,
        status: 500,
        error: 'Could not generate payment link token',
      };
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const payUrl = `${appUrl}/pay/${token}`;

  const linkAmountDollars = fromCents(linkAmountCents);
  // amount_due chip is the bare formatted dollar figure (e.g. "1.00"). The
  // SMS template body has the literal "$" before {amount_due}; the email
  // button text "Pay ${amount_due}" composes the same way. Chip carries the
  // chosen link amount (may be < remaining for partial-deposit flows).
  const amountDueChip = linkAmountDollars.toFixed(2);

  const dateStr = new Date(
    `${appt.scheduled_date}T${appt.scheduled_start_time}`
  ).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  const timeStr = formatScheduledTime(appt.scheduled_start_time);

  const channels: PaymentLinkChannelsResult = {};
  const errors: string[] = [];
  const shouldEmail = method === 'email' || method === 'both';
  const shouldSms = method === 'sms' || method === 'both';

  // ── Email ──
  if (shouldEmail && customer.email) {
    try {
      const result = await sendTemplatedEmail(customer.email, 'payment_link_sent', {
        first_name: customer.first_name ?? undefined,
        amount_due: amountDueChip,
        pay_url: payUrl,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
      });
      if (result.usedTemplate && result.success) {
        channels.email = 'sent';
      } else {
        channels.email = 'failed';
        errors.push(
          result.error ||
            (!result.usedTemplate
              ? 'payment_link_sent email template missing or not customized'
              : 'Email send failed')
        );
      }
    } catch (err) {
      channels.email = 'failed';
      errors.push(err instanceof Error ? err.message : 'Email send threw');
    }
  }

  // ── SMS ──
  if (shouldSms && customer.phone) {
    try {
      const business = await getBusinessInfo();
      const fallback = customer.first_name
        ? `Hi ${customer.first_name},\nYour ${business.name} payment link for $${amountDueChip}: ${payUrl}`
        : `Your ${business.name} payment link for $${amountDueChip}: ${payUrl}`;

      const rendered = await renderSmsTemplate(
        'payment_link_sent',
        {
          first_name: customer.first_name ?? undefined,
          amount_due: amountDueChip,
          pay_url: payUrl,
        },
        fallback
      );

      if (!rendered.isActive) {
        channels.sms = 'skipped';
        errors.push('payment_link_sent SMS template is inactive');
      } else {
        const result = await sendSms(customer.phone, rendered.body, {
          customerId: customer.id,
          source: 'transactional',
          notificationType: 'payment_link_sent',
          contextId: appt.id,
          logToConversation: true,
        });
        if (result.success) {
          channels.sms = 'sent';
        } else {
          channels.sms = 'failed';
          errors.push(result.error);
        }
      }
    } catch (err) {
      channels.sms = 'failed';
      errors.push(err instanceof Error ? err.message : 'SMS send threw');
    }
  }

  const sentCount =
    (channels.email === 'sent' ? 1 : 0) + (channels.sms === 'sent' ? 1 : 0);

  if (sentCount === 0) {
    console.error('[payment-link/send] all channels failed', {
      id: appointmentId,
      method,
      channels,
      errors,
    });
    return {
      success: false,
      status: 500,
      error: 'All channels failed',
      channels,
      errors,
    };
  }

  // At least one channel succeeded. Persist the link amount and reset
  // payment_link_paid_at so a subsequent webhook event for THIS link isn't
  // short-circuited by the (legacy) paid_at guard. The webhook now uses
  // per-PI idempotency, but the reset keeps the column meaning consistent:
  // payment_link_paid_at = "is the *current* outstanding link paid?".
  // payment_link_amount_cents stores the chosen amount (NULL when caller
  // omitted amount_cents → "use full remaining at pay time").
  //
  // Item 3 invariant: the Item-3 guard above ensures we only reach this
  // point when either `payment_link_paid_at` was null OR the caller
  // explicitly passed `confirmResend: true` to acknowledge a new link
  // cycle. The wipe is correct in both cases.
  const { error: stampErr } = await admin
    .from('appointments')
    .update({
      payment_link_sent_at: new Date().toISOString(),
      payment_link_paid_at: null,
      payment_link_amount_cents: chosenAmountCents,
    })
    .eq('id', appt.id);
  if (stampErr) {
    console.error('[payment-link/send] failed to stamp payment_link_sent_at', {
      id: appointmentId,
      error: stampErr.message,
    });
    // Don't fail the response — the customer-facing send already succeeded.
  }

  // Item 5 (#149) — audit_log row written inside the helper (Option H,
  // mirrors `cancelAppointmentOrchestrated` precedent at
  // `src/lib/appointments/cancel-orchestration.ts:790-816`). Fire-and-forget
  // (`logAudit` is itself try/catch and never throws); failures log to
  // console but don't block the operator-facing success response.
  //
  // PII / bearer-credential omissions (LOCKED per Session #149 audit Option A):
  //   - payment_link_token / pay_url NOT logged — token IS the bearer
  //     credential for /pay/${token}; anyone with audit_log read would
  //     become a payment-link bearer. Operators reach the token via the
  //     appointment row, gated by their actual permissions.
  //   - customer.phone / customer.email NOT logged — payment-link send is
  //     for a customer ALREADY in the system. customer_id is sufficient
  //     for forensic correlation; PII belongs on the customer record.
  //
  // Schema choices (LOCKED per Session #149 audit):
  //   - action: 'update' + details.event: 'payment_link_sent' — mirrors
  //     stripe webhook payment_link confirm at route.ts:278-290; stays
  //     inside the AuditAction TS union without an extension.
  //   - entity_type: 'booking' — matches cancel-orchestration; same entity
  //     consistently labelled across its lifecycle events.
  //   - source via actorSourceFor — 'operator' → 'pos', 'voice_agent' →
  //     'api' (no new 'voice_agent' source value introduced here; that's
  //     a separately-scoped commit per audit Q8).
  const tokenReused = appt.payment_link_token != null;
  const auditChannelsDispatched: string[] = [];
  if (channels.email === 'sent') auditChannelsDispatched.push('email');
  if (channels.sms === 'sent') auditChannelsDispatched.push('sms');
  await logAudit({
    userId: input.actor.userId ?? null,
    userEmail: input.actor.userEmail ?? null,
    employeeName: input.actor.employeeName ?? null,
    action: 'update',
    entityType: 'booking',
    entityId: appt.id,
    entityLabel: `Appointment #${appt.id.slice(0, 8)} (payment link $${amountDueChip} via ${method})`,
    details: {
      event: 'payment_link_sent',
      amount_cents: linkAmountCents,
      chosen_amount_cents: chosenAmountCents,
      remaining_cents_at_send: remainingCents,
      method,
      channels,
      channels_dispatched: auditChannelsDispatched,
      partial_errors: errors.length > 0 ? errors : null,
      trigger:
        input.actor.triggeredBy === 'operator'
          ? 'operator_send'
          : 'voice_agent_send',
      token_reused: tokenReused,
      customer_id: customer.id,
      scheduled_date: appt.scheduled_date,
      appointment_total_cents: totalCents,
    },
    ipAddress: input.actor.ipAddress ?? null,
    source: actorSourceFor(input.actor.triggeredBy),
  });

  return {
    success: true,
    channels,
    payment_link_token: token,
    pay_url: payUrl,
    ...(errors.length > 0 ? { partial_errors: errors } : {}),
  };
}
