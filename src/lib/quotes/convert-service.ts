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
  // coupon when no `job.quote_id` bridge exists. `quote.coupon` is runtime-only
  // state (see `src/app/pos/types.ts` QuoteState) — the DB row carries only
  // `coupon_code`, so `coupon_discount`/`discount_amount` resolve to 0 here;
  // checkout re-derives the discount through `/api/pos/coupons/validate`.
  // Layer 15g-ii will add `quotes.coupon_discount` so we can persist a snapshot.
  const quoteIsMobile = !!quote.is_mobile;
  const quoteMobileSurcharge = Number(quote.mobile_surcharge ?? 0);
  const couponDiscount =
    Number(
      (quote as { coupon?: { discount?: number | null } }).coupon?.discount ?? 0
    ) || 0;
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
      discount_amount: couponDiscount,
      total_amount: Number(quote.total_amount ?? 0) - couponDiscount,
      job_notes: quote.notes,
      coupon_code: quote.coupon_code ?? null,
      coupon_discount: couponDiscount || null,
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
