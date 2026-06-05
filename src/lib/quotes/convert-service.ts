import { SupabaseClient } from '@supabase/supabase-js';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';
import { resolveManualDiscountAmount } from './manual-discount';
import {
  enrichItemsWithTierMeta,
  formatServicesSummary,
} from './services-summary';
import type { ConvertQuoteInput } from '@/lib/utils/validation';

// Item 15g Layer 15g-v — re-export for backward compatibility. The function
// originated here in Layer 15g-ii; extraction to a dedicated module lets
// client-bundle consumers (`modifier-display.ts` → POS quote-detail) reach
// the resolver without dragging convert-side dependencies through the
// bundler.
export { resolveManualDiscountAmount } from './manual-discount';

type ConvertQuoteResult =
  | { success: true; appointment: unknown; serviceNames: string }
  | { success: false; error: string; status: number; details?: unknown };

/** Options to customize conversion behavior for different callers (POS, admin, voice agent). */
export interface ConvertQuoteOptions {
  /** Override appointment status. Default: 'confirmed' (POS/admin). Voice agent uses 'pending'. */
  appointmentStatus?: 'confirmed' | 'pending';
  /** Override channel. Default: 'phone'. */
  channel?: string;
}

export async function convertQuote(
  supabase: SupabaseClient,
  quoteId: string,
  data: ConvertQuoteInput,
  options?: ConvertQuoteOptions
): Promise<ConvertQuoteResult> {
  const { date, time, duration_minutes, employee_id } = data;

  // Fetch quote with items
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select(
      `
      *,
      items:quote_items(*)
    `
    )
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !quote) {
    return { success: false, error: 'Quote not found', status: 404 };
  }

  if (quote.status === 'expired' || quote.status === 'converted') {
    return {
      success: false,
      error: 'Expired or already-converted quotes cannot be converted to appointments',
      status: 400,
    };
  }

  const endTime = addMinutesToTime(time, duration_minutes);
  const endTimeWithBuffer = addMinutesToTime(time, duration_minutes + APPOINTMENT.BUFFER_MINUTES);

  // Auto-assign detailer if none provided
  let assignedEmployeeId = employee_id ?? null;
  if (!assignedEmployeeId) {
    assignedEmployeeId = await findAvailableDetailer(supabase, date, time, endTimeWithBuffer);
  }

  // Create the appointment. Mobile fields propagate from the quote — quote
  // builder captures them once, conversion mirrors them onto the appointment
  // so the subsequent close-out (defensive injection in /api/pos/transactions)
  // materializes the mobile_fee transaction_items row automatically.
  //
  // Item 15g Layer 15g-i: propagate `coupon_code` from the quote so the
  // checkout-items fallback (POS Jobs card → register) can re-validate the
  // coupon when no `job.quote_id` bridge exists.
  //
  // Item 15g Layer 15g-ii: extends Layer 15g-i with full modifier propagation.
  // The quote row now persists `coupon_discount`, `loyalty_points_to_redeem`,
  // `loyalty_discount`, and `manual_discount_*` (via the schema migration in
  // this same layer). Conversion snapshots all three modifiers onto the
  // appointment so the entire chain (Quote → Appointment → Job → Transaction)
  // preserves them through to checkout. `appointment.discount_amount` is the
  // sum of all three for compatibility with existing analytics readers; the
  // dedicated per-modifier columns preserve provenance for the receipt and
  // admin dialog.
  const quoteIsMobile = !!quote.is_mobile;
  const quoteMobileSurcharge = Number(quote.mobile_surcharge ?? 0);

  // Coupon: prefer the persisted `quotes.coupon_discount` snapshot (Layer
  // 15g-ii); fall back to runtime `quote.coupon.discount` for callers that
  // hydrate the quote (still relevant for the immediate POS convert path).
  const runtimeCoupon =
    (quote as { coupon?: { discount?: number | null } }).coupon?.discount ?? null;
  const couponDiscount = Number(
    quote.coupon_discount ?? runtimeCoupon ?? 0
  ) || 0;

  // Loyalty: snapshot points + dollar value from the quote.
  const loyaltyPoints = Number(quote.loyalty_points_to_redeem ?? 0) || 0;
  const loyaltyDiscount = Number(quote.loyalty_discount ?? 0) || 0;

  // Manual discount: compute the resolved dollar amount once. Appointment
  // schema stores the dollar value (not the type/% pair) — applying %
  // against the quote subtotal is the canonical interpretation.
  const manualDiscountValue = resolveManualDiscountAmount(
    quote.manual_discount_type ?? null,
    Number(quote.manual_discount_value ?? 0) || null,
    Number(quote.subtotal ?? 0) || 0
  );
  const manualDiscountLabel = quote.manual_discount_label ?? null;

  const totalDiscount = couponDiscount + loyaltyDiscount + (manualDiscountValue ?? 0);
  // Item 15g Layer 15g-v: writers now persist `quotes.total_amount` net of
  // all modifiers (createQuote/updateQuote call `computeQuoteTotals`). The
  // previous workaround here — `Number(quote.total_amount) - totalDiscount`
  // — double-subtracted modifiers and is now removed. `Math.max(0, …)` is
  // kept as defense-in-depth in case a legacy modifier-bearing quote with a
  // pre-fix `total_amount` is converted before its next auto-save corrects
  // the column (such quotes self-heal on next edit per the Layer 15g-ii
  // auto-save hashing modifier columns).
  const finalTotal = Math.max(0, Number(quote.total_amount ?? 0));

  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      customer_id: quote.customer_id,
      vehicle_id: quote.vehicle_id,
      employee_id: assignedEmployeeId,
      status: options?.appointmentStatus ?? 'confirmed',
      channel: options?.channel ?? 'phone',
      scheduled_date: date,
      scheduled_start_time: time,
      scheduled_end_time: endTime,
      is_mobile: quoteIsMobile,
      mobile_zone_id: quoteIsMobile ? (quote.mobile_zone_id ?? null) : null,
      mobile_address: quoteIsMobile ? (quote.mobile_address ?? null) : null,
      mobile_surcharge: quoteIsMobile ? quoteMobileSurcharge : 0,
      mobile_zone_name_snapshot: quoteIsMobile ? (quote.mobile_zone_name_snapshot ?? null) : null,
      payment_status: 'pending',
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      discount_amount: totalDiscount,
      total_amount: finalTotal,
      job_notes: quote.notes,
      coupon_code: quote.coupon_code ?? null,
      coupon_discount: couponDiscount || null,
      loyalty_points_redeemed: loyaltyPoints,
      loyalty_discount: loyaltyDiscount,
      manual_discount_value: manualDiscountValue,
      manual_discount_label: manualDiscountValue !== null ? manualDiscountLabel : null,
    })
    .select('*')
    .single();

  if (apptErr || !appointment) {
    console.error('Error creating appointment:', apptErr?.message);
    return { success: false, error: 'Failed to create appointment', status: 500 };
  }

  // Create appointment_services from quote items that have a service_id
  const serviceItems = (quote.items || []).filter(
    (item: { service_id: string | null }) => item.service_id
  );

  if (serviceItems.length > 0) {
    const apptServices = serviceItems.map((item: {
      service_id: string;
      unit_price: number;
      tier_name: string | null;
      quantity?: number;
    }) => ({
      appointment_id: appointment.id,
      service_id: item.service_id,
      price_at_booking: item.unit_price,
      tier_name: item.tier_name || null,
      quantity: item.quantity ?? 1,
    }));

    const { error: svcErr } = await supabase
      .from('appointment_services')
      .insert(apptServices);

    if (svcErr) {
      console.error('Error creating appointment services:', svcErr.message);
    }
  }

  // Update quote status to converted
  const { error: updateErr } = await supabase
    .from('quotes')
    .update({
      status: 'converted',
      converted_appointment_id: appointment.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId);

  if (updateErr) {
    console.error('Error updating quote status:', updateErr.message);
  }

  // Build service names from quote items for caller use (SMS, logging).
  // D45 (Issue 39): compose via formatServicesSummary so multi-tier
  // same-service quotes (post-D43 contract) render as e.g.
  // "Hot Shampoo Extraction (2 Rows + Floor Mats)" rather than
  // "Hot Shampoo Extraction, Hot Shampoo Extraction" in every
  // downstream SMS/email that consumes `result.serviceNames`
  // (`voice-agent/appointments/route.ts:311` cascades from here).
  // The quote_items SELECT above (`*`) already carries
  // service_id / item_name / tier_name / quantity / unit_price /
  // total_price; enrichItemsWithTierMeta loads tier_label /
  // qty_label / pricing_model in two batched queries (warn-only on
  // failure so conversion stays best-effort).
  const enrichedSummary = await enrichItemsWithTierMeta(
    supabase,
    serviceItems.map((item: {
      service_id: string;
      item_name?: string;
      tier_name?: string | null;
      quantity?: number;
      unit_price: number | string;
      total_price?: number | string | null;
    }) => ({
      service_id: item.service_id,
      item_name: item.item_name || 'Service',
      tier_name: item.tier_name ?? null,
      quantity: item.quantity ?? 1,
      unit_price: Number(item.unit_price),
      total_price: item.total_price,
    })),
  );
  const serviceNames = formatServicesSummary(enrichedSummary);

  // Fire webhook for appointment confirmation — Session 1.7 (2026-06-05):
  // gated on the RESULTING appointment status, not the call site's intent.
  // Pre-#1.7 this fired UNCONDITIONALLY, which surfaced independently in
  // Phase 0.1 (audit 69b15b0f, F.4) + Phase 0.2 (audit 0b9684db, F.4) as
  // a customer-facing bug: voice-agent + SMS AI v2 invoke this helper with
  // `appointmentStatus: 'pending'` (`voice-agent/appointments/route.ts:290`
  // hardcodes pending on the quote-conversion branch per Phase 0.1
  // finding), the row lands at pending, but the `appointment_confirmed`
  // webhook fired anyway — downstream n8n consumers then sent "confirmed"
  // notifications for a row whose actual status was pending. The condition
  // mirrors the public booking route's pattern at
  // `src/app/api/book/route.ts:921-929` (single source of truth for the
  // status→webhook tie). This closes the immediate misleading-customer
  // behavior; full AC-11 alignment (payment-driven semantic across all
  // booking paths + payment-link primitive for agents) is separate
  // Phase 3 work and not in scope here.
  if (appointment.status === 'confirmed') {
    fireWebhook('appointment_confirmed', appointment, supabase).catch(() => {});
  }

  return { success: true, appointment, serviceNames };
}

