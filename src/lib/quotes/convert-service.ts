import { SupabaseClient } from '@supabase/supabase-js';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';
import { resolveManualDiscountAmount } from './manual-discount';
import {
  enrichItemsWithTierMeta,
  formatServicesSummary,
} from './services-summary';
import { generateAppointmentNumber } from '@/lib/utils/appointment-number';
import type { ConvertQuoteInput } from '@/lib/utils/validation';

// Item 15g Layer 15g-v — re-export for backward compatibility. The function
// originated here in Layer 15g-ii; extraction to a dedicated module lets
// client-bundle consumers (`modifier-display.ts` → POS quote-detail) reach
// the resolver without dragging convert-side dependencies through the
// bundler.
export { resolveManualDiscountAmount } from './manual-discount';

type ConvertQuoteResult =
  | {
      success: true;
      appointment: unknown;
      serviceNames: string;
      /**
       * Phase 3 Theme F (F.7): true on the idempotent race-loss path — the
       * quote was already linked to a converted appointment by a concurrent
       * caller; the returned `appointment` is the race-winner's existing row
       * fetched fresh (not a new INSERT). Existing callers that don't read
       * this field continue to work; voice-agent + Theme C may opt into
       * checking it to suppress duplicate downstream side effects (e.g., a
       * second confirmation SMS).
       */
      already_converted?: boolean;
    }
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

  // Phase 3 Theme F (F.7) — race idempotency guard. If a concurrent caller
  // already converted this quote (the canonical signal is the
  // `converted_appointment_id` FK, set in the canonical post-INSERT UPDATE
  // below AND now also by the walk-in seam per F.2), return success with
  // the race-winner's appointment row instead of failing. This converts
  // what was previously a 400 "already-converted" rejection into a
  // transparent idempotent return — foundational for Theme C's
  // customer-accept auto-conversion, where an operator-vs-customer race on
  // the same quote must collapse to one appointment and both callers must
  // get a non-error response. The `status === 'converted'` ∧
  // `converted_appointment_id IS NULL` corner (the historical walk-in
  // shape pre-F.2) still falls through to the legacy 400 — a converted
  // quote with no FK is a true gap, not a race, and surfacing it loudly
  // is the right behavior.
  if (quote.converted_appointment_id) {
    const { data: existingAppt } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', quote.converted_appointment_id)
      .maybeSingle();
    if (existingAppt) {
      return {
        success: true,
        appointment: existingAppt,
        serviceNames: '',
        already_converted: true,
      };
    }
    // The FK points at a row that no longer exists (very rare: appointment
    // hard-deleted post-conversion). Fall through to the legacy guard;
    // surfacing the inconsistency is safer than silently re-converting.
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

  // Phase 3 Theme A (AC-10 v1.4): appointment_number is NOT NULL — generate
  // it before the INSERT so the row can satisfy the constraint. The converted
  // appointment gets its own A-XXXXX identifier (distinct from the source
  // quote's Q-XXXXX); they remain linked via quotes.converted_appointment_id.
  const appointmentNumber = await generateAppointmentNumber(supabase);
  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      appointment_number: appointmentNumber,
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

  // Update quote status to converted. Phase 3 Theme F (F.7) — the
  // `.is('converted_appointment_id', null)` filter is the second arm of the
  // race guard (the first arm is the pre-INSERT check above): if a
  // concurrent caller wrote `converted_appointment_id` between our pre-check
  // and now, this UPDATE matches zero rows and our newly-inserted
  // appointment becomes an orphan. Detect that by selecting the updated row
  // and, if the FK now points elsewhere, roll back our INSERT and return
  // the race-winner's appointment instead. Without this second arm the
  // first arm only catches the easy case (already-converted at start).
  const { data: updatedRows, error: updateErr } = await supabase
    .from('quotes')
    .update({
      status: 'converted',
      converted_appointment_id: appointment.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .is('converted_appointment_id', null)
    .select('converted_appointment_id');

  if (updateErr) {
    console.error('Error updating quote status:', updateErr.message);
  }

  if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
    // Race lost — another caller's INSERT + UPDATE landed first. Our
    // appointment is now an orphan; delete it and return the race-winner.
    // (ON DELETE CASCADE on appointment_services.appointment_id cleans up
    // the join rows we just inserted; mirrors the rollback at
    // pos/jobs/route.ts:648 for the walk-in helper failure path.)
    await supabase.from('appointments').delete().eq('id', appointment.id);

    const { data: raceWinner } = await supabase
      .from('quotes')
      .select('converted_appointment_id')
      .eq('id', quoteId)
      .maybeSingle();
    if (raceWinner?.converted_appointment_id) {
      const { data: winningAppt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', raceWinner.converted_appointment_id)
        .maybeSingle();
      if (winningAppt) {
        return {
          success: true,
          appointment: winningAppt,
          serviceNames: '',
          already_converted: true,
        };
      }
    }
    // The race winner doesn't have a recoverable appointment — surface
    // the inconsistency instead of silently returning our just-deleted row.
    return {
      success: false,
      error: 'Concurrent conversion detected; please retry',
      status: 409,
    };
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

  // Theme G — Session 1.7's conditional `appointment_confirmed` outbound
  // webhook fire is removed alongside the whole fireWebhook surface. Smart
  // Details has no n8n receiver wired (audit f5e714a8). Session 1.7's
  // bug-class (misleading-customer events fired for pending rows) is
  // structurally prevented now: there is no outbound webhook to mis-fire.
  // Customer-facing dispatch on actual confirmation lives at admin/POS
  // PATCH + the Stripe webhook's pending → confirmed flip (Theme B.1).

  return { success: true, appointment, serviceNames };
}

