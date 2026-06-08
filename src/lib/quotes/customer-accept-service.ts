// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme C.2 — customer-accept orchestrator (AC-12 completion)
//
// Implements `processCustomerAccept` per locked architecture decisions in
// `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md` v1.5 (post Theme C.1 / F /
// G) and the Phase 3.0.3 audit (`54aa996a`):
//
//   • G.2 LOCKED option β — orchestrator helper wraps `convertQuote()`.
//     The `POST /api/quotes/[id]/accept` handler is now a thin wrapper around
//     this function. Future callers (e.g., a future "operator accepts on
//     customer's behalf" surface) can reuse the orchestrator directly.
//
//   • G.1 LOCKED option α — placeholder date strategy uses `quote.valid_until`
//     as the `scheduled_date` placeholder (semantically meaningful: it's the
//     deadline staff has to schedule the work before the quote expires).
//     `placeholder_date=TRUE` (Theme C.1 column) signals downstream readers
//     this is not a real schedule slot. Placeholder time is 09:00–10:00 PT
//     (business-open hour, 60-minute fallback duration when no service-derived
//     duration is available).
//
//   • G.7 staff-notification: SLA template `pending_appointment_sla_alert`
//     (Theme C.1 seed) REPLACES the prior `quote_accepted_staff_notify` inline
//     fire. The new template reflects the new auto-conversion semantics
//     ("appointment created, awaiting confirmation"). Dispatch is gated by
//     `isWithinBusinessHours()` — outside the 8am–8pm window the lifecycle
//     engine's SLA pass (Theme C.2 lifecycle-engine block) takes over and
//     catches up on the next business-hours tick. Staff email is preserved
//     (async by nature; useful for record-keeping).
//
//   • Race protection: Theme F's F.7 idempotency guard inside `convertQuote()`
//     plus Theme C.1's UNIQUE partial index `appointments_quote_id_uniq`
//     together form a two-layer defense. The orchestrator returns
//     `already_converted: true` on the F.7 race-loss path so the route can
//     respond with the existing appointment row.
//
// IMPORTANT: NO `fireWebhook` reintroduction. Theme G (`851639ef`) removed the
// entire outbound webhook subsystem. Smart Details has no n8n receiver wired;
// cross-contamination from sibling Nayeem businesses (121 Media, Lomita
// Notary use n8n; Smart Details does not) is structurally prevented. Staff
// alerts dispatch via inline `sendSms()` only.
// ──────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';
import { convertQuote } from './convert-service';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, isWithinBusinessHours } from '@/lib/data/business-hours';
import { formatCurrency } from '@/lib/utils/format';
import { logAudit } from '@/lib/services/audit';
import {
  enrichItemsWithTierMeta,
  formatServicesSummary,
} from './services-summary';

// Default placeholder schedule window. The customer accepts BEFORE picking a
// slot; the operator confirms-or-edits at first touch. Time is PT and the
// row is tagged `scheduled_date_placeholder=TRUE` so calendar/scheduler
// readers know to skip it. Duration mirrors the 60-minute fallback used by
// the existing walk-in atomic-create at `pos/jobs/route.ts:328`. The end
// time is DERIVED inside `convertQuote` via `addMinutesToTime(start,
// duration)` so we don't duplicate it here.
const PLACEHOLDER_TIME_START = '09:00';
const PLACEHOLDER_DURATION_MINUTES = 60;

// Humanize a delta in milliseconds to a short staff-readable phrase used in
// the `accepted_at_human` chip of `pending_appointment_sla_alert`. Output
// shapes match the seed template's sample ("12 minutes ago") and the
// idiomatic staff-SMS terseness.
export function humanizeAcceptedAgo(deltaMs: number): string {
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface ProcessCustomerAcceptInput {
  /** UUID of the accepted quote. */
  quoteId: string;
}

export type ProcessCustomerAcceptResult =
  | {
      success: true;
      quote: Record<string, unknown>;
      appointment_id: string;
      /**
       * True when `convertQuote` returned `already_converted` — the F.7 idempotency
       * race-loss path. The orchestrator treats this as a successful no-op and
       * suppresses the SMS/email side effects (the original-accept caller already
       * fired them). The route returns 200 with the existing appointment row.
       */
      already_converted: boolean;
      /** True only when business-hours-gated inline SLA SMS attempt was executed. */
      sla_alert_fired_immediately: boolean;
    }
  | { success: false; error: string; status: number };

/**
 * Customer-accept orchestrator (AC-12). Validates the quote, flips status to
 * 'accepted', auto-creates a pending appointment via `convertQuote`, and
 * dispatches the configured customer + staff notifications.
 *
 * Callers (currently: `POST /api/quotes/[id]/accept`) are responsible for
 * any auth/token validation upstream. This function assumes the caller has
 * already verified the customer owns the access token.
 */
export async function processCustomerAccept(
  supabase: SupabaseClient,
  input: ProcessCustomerAcceptInput
): Promise<ProcessCustomerAcceptResult> {
  const { quoteId } = input;

  // ───────────── Step 1: Fetch quote (status, items, customer) ─────────────
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select(
      `
      *,
      customer:customers(id, first_name, last_name, phone, email),
      items:quote_items(*)
    `
    )
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !quote) {
    return { success: false, error: 'Quote not found', status: 404 };
  }

  // Status guard — only sent/viewed quotes are acceptable. Theme F's F.7
  // guard plus the C.1 UNIQUE index handle the converted/race cases below;
  // this guard catches the "customer clicked the link twice fast" case
  // where the second call sees status='accepted'.
  if (
    quote.status !== 'sent' &&
    quote.status !== 'viewed' &&
    quote.status !== 'accepted'
  ) {
    return {
      success: false,
      error: `Cannot accept a quote with status "${quote.status}"`,
      status: 400,
    };
  }

  // ───────────── Step 2: Flip quote → 'accepted' + accepted_at ─────────────
  // Preserves existing semantics: the column tracks customer-side
  // acknowledgment timing independently of the conversion outcome. The
  // subsequent `convertQuote` UPDATE transitions status from 'accepted'
  // to 'converted' — a few hundred millis later. The intermediate
  // 'accepted' status is transient; the durable record is `accepted_at`
  // (set here) + `converted_appointment_id` (set by convertQuote).
  //
  // The `after_quote_accepted` lifecycle rule queries `status='accepted'`
  // with a 24h lookback window; in practice, the 'accepted' status is
  // overwritten ~milliseconds later by 'converted', so a cron pass between
  // the two UPDATEs is vanishingly unlikely to fire. Operators with
  // `after_quote_accepted` rules should migrate them to
  // `after_appointment_booked` — that handler filters `channel != 'walk_in'`
  // and `customer_accept` channel passes that filter, so the lifecycle
  // catches the new auto-converted appointments naturally.
  //
  // If `quote.status === 'accepted'` already (idempotent re-call within
  // the same HTTP cycle, or token-replayed), we still update accepted_at
  // and proceed — convertQuote's F.7 guard handles the conversion idempotency.
  const acceptedAtIso = new Date().toISOString();
  if (quote.status !== 'accepted') {
    const { error: acceptErr } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: acceptedAtIso,
        updated_at: acceptedAtIso,
      })
      .eq('id', quoteId);

    if (acceptErr) {
      console.error('[customer-accept] Quote status flip failed:', acceptErr.message);
      return { success: false, error: 'Failed to accept quote', status: 500 };
    }
  }

  // ───────────── Step 3: Auto-create pending appointment ─────────────
  // Placeholder strategy per G.1 LOCKED option α — `scheduled_date =
  // quote.valid_until` (the deadline staff has to schedule before the quote
  // expires). Time is the placeholder business-open window. `placeholderDate`
  // flag = TRUE so calendar/scheduler readers know to skip this row when
  // computing availability.
  //
  // `valid_until` is a DATE column (YYYY-MM-DD) on quotes (per
  // `quote-service.ts:172`); convertQuote's Zod schema also expects
  // YYYY-MM-DD. If the quote has no valid_until (legacy or misconfigured),
  // fall back to today's date — the placeholder flag still signals staff
  // intervention.
  const placeholderDate =
    (quote.valid_until as string | null) ?? new Date().toISOString().slice(0, 10);

  const conversion = await convertQuote(
    supabase,
    quoteId,
    {
      date: placeholderDate,
      time: PLACEHOLDER_TIME_START,
      duration_minutes: PLACEHOLDER_DURATION_MINUTES,
      employee_id: null,
    },
    {
      appointmentStatus: 'pending',
      channel: 'customer_accept',
      placeholderDate: true,
    }
  );

  if (!conversion.success) {
    console.error('[customer-accept] convertQuote failed:', conversion.error);
    return {
      success: false,
      error: conversion.error,
      status: conversion.status,
    };
  }

  const appointment = conversion.appointment as { id: string };
  const alreadyConverted = conversion.already_converted === true;

  // On the F.7 race-loss path the original-accept caller already fired
  // customer/staff notifications; firing them a second time would
  // confuse staff ("Quote accepted!" twice) and risk customer-side
  // duplicate SMS. Short-circuit before the dispatch blocks.
  if (alreadyConverted) {
    logAudit({
      action: 'update',
      entityType: 'quote',
      entityId: quoteId,
      entityLabel: `Quote ${quote.quote_number ?? quoteId.slice(0, 8)} customer-accept (idempotent race-loss)`,
      details: {
        event: 'customer_accept',
        appointment_id: appointment.id,
        already_converted: true,
      },
      source: 'api',
    });
    return {
      success: true,
      quote: quote as Record<string, unknown>,
      appointment_id: appointment.id,
      already_converted: true,
      sla_alert_fired_immediately: false,
    };
  }

  // ───────────── Step 4: Customer acknowledgment SMS (preserved) ─────────────
  // The customer's only signal that the accept landed. Templates are the
  // existing `quote_accepted_single` / `quote_accepted_multi` slugs; fallback
  // prose unchanged. `logToConversation: true` writes to sms_conversations +
  // sms_delivery_log via the canonical sendSms() chokepoint per CLAUDE.md
  // Rule #9 normalization contract.
  const customer = quote.customer as {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  const customerSmsDispatched = await dispatchCustomerSms(
    supabase,
    quote as Record<string, unknown>,
    customer,
    quoteId
  );

  // ───────────── Step 5: Staff SLA alert (business-hours-gated) ─────────────
  let slaAlertFiredImmediately = false;
  const hours = await getBusinessHours();
  const businessHoursNow = hours ? isWithinBusinessHours(hours) : false;

  if (businessHoursNow) {
    try {
      slaAlertFiredImmediately = await dispatchSlaAlertSms(
        supabase,
        quote as Record<string, unknown>,
        customer,
        acceptedAtIso,
        appointment.id
      );
    } catch (err) {
      // Best-effort: a failed staff alert never blocks the customer's
      // success response. The lifecycle engine's SLA pass picks up the
      // unacknowledged pending appointment on the next business-hours tick.
      console.error('[customer-accept] Inline SLA alert failed (non-blocking):', err);
    }
  }
  // else: outside business hours — the lifecycle engine SLA pass catches
  // this appointment on the next business-hours tick (typically 8am PT
  // the next morning, when the cron resumes firing inside hours and the
  // appointment is already past the 2h threshold).

  // ───────────── Step 6: Staff email (preserved, async record-keeping) ─────────────
  await dispatchStaffEmail(
    supabase,
    quote as Record<string, unknown>,
    customer,
    quoteId
  ).catch((err) =>
    console.error('[customer-accept] Staff email failed (non-blocking):', err)
  );

  // ───────────── Step 7: Audit log ─────────────
  logAudit({
    action: 'update',
    entityType: 'quote',
    entityId: quoteId,
    entityLabel: `Quote ${quote.quote_number ?? quoteId.slice(0, 8)} customer-accept`,
    details: {
      event: 'customer_accept',
      appointment_id: appointment.id,
      already_converted: false,
      customer_sms_dispatched: customerSmsDispatched,
      sla_alert_fired_immediately: slaAlertFiredImmediately,
      business_hours_now: businessHoursNow,
    },
    source: 'api',
  });

  return {
    success: true,
    quote: quote as Record<string, unknown>,
    appointment_id: appointment.id,
    already_converted: false,
    sla_alert_fired_immediately: slaAlertFiredImmediately,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal dispatch helpers (extracted from the pre-Theme-C.2 inline handler).
// Kept module-local so the route layer cannot dispatch SMS/email without
// going through the orchestrator. Returning a boolean lets the caller log
// dispatch attempts in audit_log without re-throwing.
// ──────────────────────────────────────────────────────────────────────────────

async function dispatchCustomerSms(
  supabase: SupabaseClient,
  quote: Record<string, unknown>,
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null,
  quoteId: string
): Promise<boolean> {
  if (!customer?.phone) return false;

  const items = (quote.items as Array<{ item_name: string }> | undefined) ?? [];
  // Per Session 2A.5 typed-render rule — split into the two narrowed slugs.
  // The customer-side message points at the new auto-conversion semantics:
  // a pending appointment exists and staff will confirm the date/time.
  const result =
    items.length === 1 && items[0]?.item_name
      ? await renderSmsTemplate(
          'quote_accepted_single',
          {
            first_name: customer.first_name,
            item_name: items[0].item_name,
            last_name: customer.last_name || undefined,
            vehicle_description: undefined,
          },
          `Thanks ${customer.first_name}! Your quote for ${items[0].item_name} has been accepted. Our team will reach out shortly to confirm your appointment date and time.`
        )
      : await renderSmsTemplate(
          'quote_accepted_multi',
          {
            first_name: customer.first_name,
            last_name: customer.last_name || undefined,
          },
          `Thanks ${customer.first_name}! Your quote has been accepted. Our team will reach out shortly to confirm your appointment date and time.`
        );

  if (!result.isActive) return false;

  const smsResult = await sendSms(customer.phone, result.body, {
    logToConversation: true,
    customerId: customer.id,
    notificationType: 'quote_accepted',
    contextId: quoteId,
  });
  await supabase.from('quote_communications').insert({
    quote_id: quoteId,
    channel: 'sms',
    sent_to: customer.phone,
    status: smsResult.success ? 'sent' : 'failed',
    error_message: smsResult.success ? null : 'SMS delivery failed',
  });
  return smsResult.success;
}

async function dispatchSlaAlertSms(
  supabase: SupabaseClient,
  quote: Record<string, unknown>,
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null,
  acceptedAtIso: string,
  appointmentId: string
): Promise<boolean> {
  const rawItems = (quote.items as Array<{
    service_id: string | null;
    item_name: string;
    tier_name: string | null;
    quantity: number;
    unit_price: number | string;
    total_price?: number | string | null;
  }> | undefined) ?? [];
  const enriched = await enrichItemsWithTierMeta(
    supabase,
    rawItems.map((i) => ({
      service_id: i.service_id,
      item_name: i.item_name,
      tier_name: i.tier_name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      total_price: i.total_price,
    }))
  );
  const services = formatServicesSummary(enriched) || 'Services';
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`.trim()
    : 'Customer';
  const acceptedAtHuman = humanizeAcceptedAgo(
    Date.now() - new Date(acceptedAtIso).getTime()
  );

  // Per Theme C.1 seed, every chip is REQUIRED (loud-fail-safe staff alert).
  // Fallback prose mirrors the template body so silenced templates still
  // surface intent if the operator disabled the template at admin time.
  const fallback = `⏰ Customer-accepted quote awaiting confirmation.\nQuote ${quote.quote_number} from ${customerName} for ${services}.\nAccepted ${acceptedAtHuman}.\nPlease confirm or follow up.`;
  const result = await renderSmsTemplate(
    'pending_appointment_sla_alert',
    {
      quote_number: String(quote.quote_number ?? ''),
      customer_name: customerName,
      services,
      accepted_at_human: acceptedAtHuman,
    },
    fallback
  );

  if (!result.isActive) return false;

  // Recipient resolution mirrors the post-Session-#139 self-send-safe
  // pattern: prefer template-configured `recipient_phones`; fall back to
  // an empty list + console.warn (NOT to biz.phone, which IS the
  // business's Twilio number — would cause self-send). The seed migration
  // writes `recipient_phones=NULL` intentionally so operator configures
  // recipients via admin UI before alerts can land.
  const recipients: string[] = result.recipientPhones?.length
    ? result.recipientPhones
    : [];

  if (recipients.length === 0) {
    console.warn(
      `[customer-accept] SLA alert dropped — no recipient_phones configured for "pending_appointment_sla_alert" template ` +
        `(appointment ${appointmentId}). Configure via Admin → SMS Templates.`
    );
    return false;
  }

  // Fire-and-forget per recipient; await of `Promise.allSettled` returns
  // even if one recipient send fails so subsequent ones still attempt.
  const results = await Promise.allSettled(
    recipients.map((phone) => sendSms(phone, result.body))
  );
  return results.some(
    (r) => r.status === 'fulfilled' && r.value && r.value.success === true
  );
}

async function dispatchStaffEmail(
  supabase: SupabaseClient,
  quote: Record<string, unknown>,
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null,
  quoteId: string
): Promise<void> {
  const biz = await getBusinessInfo();
  if (!biz.email) return;

  // Enrich items for the services summary (same shape as the SLA SMS).
  const rawItems = (quote.items as Array<{
    service_id: string | null;
    item_name: string;
    tier_name: string | null;
    quantity: number;
    unit_price: number | string;
    total_price?: number | string | null;
  }> | undefined) ?? [];
  const enriched = await enrichItemsWithTierMeta(
    supabase,
    rawItems.map((i) => ({
      service_id: i.service_id,
      item_name: i.item_name,
      tier_name: i.tier_name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      total_price: i.total_price,
    }))
  );
  const serviceList = formatServicesSummary(enriched) || 'Services';
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`.trim()
    : 'Customer';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const adminUrl = `${appUrl}/admin/quotes/${quoteId}`;

  // Updated CTA copy reflects the new flow — staff confirms an EXISTING
  // pending appointment rather than creating one from scratch in POS.
  const subject = `Quote #${quote.quote_number} Accepted — ${customerName}`;
  const textBody = [
    `Quote #${quote.quote_number} has been accepted!`,
    '',
    `Customer: ${customerName}`,
    customer?.phone ? `Phone: ${customer.phone}` : '',
    customer?.email ? `Email: ${customer.email}` : '',
    `Services: ${serviceList}`,
    `Total: ${formatCurrency(Number(quote.total_amount))}`,
    '',
    `View in admin: ${adminUrl}`,
    '',
    'A pending appointment has been auto-created. Confirm the date/time in admin to advance status.',
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `<div style="font-family: sans-serif; max-width: 500px;">
<h2 style="color: #1e3a5f;">Quote Accepted!</h2>
<p><strong>Quote #${quote.quote_number}</strong></p>
<p><strong>Customer:</strong> ${customerName}</p>
${customer?.phone ? `<p><strong>Phone:</strong> ${customer.phone}</p>` : ''}
${customer?.email ? `<p><strong>Email:</strong> ${customer.email}</p>` : ''}
<p><strong>Services:</strong> ${serviceList}</p>
<p><strong>Total:</strong> ${formatCurrency(Number(quote.total_amount))}</p>
<br/>
<a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1e3a5f; color: #fff; text-decoration: none; border-radius: 6px;">View Quote in Admin</a>
<br/><br/>
<p style="color: #6b7280; font-size: 14px;">A pending appointment has been auto-created. Confirm the date/time in admin to advance status.</p>
</div>`;

  await sendEmail(biz.email, subject, textBody, htmlBody);
}
