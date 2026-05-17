import { SupabaseClient } from '@supabase/supabase-js';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';
import type { ConvertQuoteInput } from '@/lib/utils/validation';

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
  const finalTotal = Math.max(
    0,
    Number(quote.total_amount ?? 0) - totalDiscount
  );

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
    }) => ({
      appointment_id: appointment.id,
      service_id: item.service_id,
      price_at_booking: item.unit_price,
      tier_name: item.tier_name || null,
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

  // Build service names from quote items for caller use (SMS, logging)
  const serviceNames = serviceItems
    .map((item: { item_name?: string; service_id: string }) => item.item_name || 'Service')
    .join(', ');

  // Fire webhook for appointment confirmation
  fireWebhook('appointment_confirmed', appointment, supabase).catch(() => {});

  return { success: true, appointment, serviceNames };
}

/**
 * Item 15g Layer 15g-ii — resolve the manual-discount dollar amount from
 * the quote's persisted (type, value, subtotal). Returns null when no
 * coherent manual discount is set. Mirrors the client-side reducer math
 * at `quote-reducer.ts` so the appointment receives the same dollar
 * amount the cashier saw at quote time.
 */
function resolveManualDiscountAmount(
  type: 'dollar' | 'percent' | null | undefined,
  value: number | null | undefined,
  subtotal: number
): number | null {
  if (!type || value == null || !(value > 0)) return null;
  if (type === 'dollar') {
    return Math.min(value, subtotal);
  }
  // percent
  const pct = Math.min(value, 100);
  return Math.round(((subtotal * pct) / 100) * 100) / 100;
}
