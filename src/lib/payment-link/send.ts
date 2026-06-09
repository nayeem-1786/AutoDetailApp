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
    };

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
      `id, status, payment_status, total_amount,
       scheduled_date, scheduled_start_time, payment_link_token,
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
  if (txIds.length > 0) {
    const { data: pays, error: paysErr } = await admin
      .from('payments')
      .select('amount')
      .in('transaction_id', txIds);
    if (paysErr) {
      throw new Error(`existing-payments lookup failed: ${paysErr.message}`);
    }
    paidCents = (pays ?? []).reduce(
      (sum, p) => sum + toCents(Number(p.amount)),
      0
    );
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

  return {
    success: true,
    channels,
    payment_link_token: token,
    pay_url: payUrl,
    ...(errors.length > 0 ? { partial_errors: errors } : {}),
  };
}
