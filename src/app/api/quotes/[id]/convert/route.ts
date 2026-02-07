import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { addMinutesToTime, findAvailableDetailer } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';
import { z } from 'zod';

const convertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  duration_minutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute'),
  employee_id: z.string().uuid().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = convertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, time, duration_minutes, employee_id } = parsed.data;
    const supabase = createAdminClient();

    // Fetch quote with items
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select(
        `
        *,
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.status === 'expired' || quote.status === 'converted') {
      return NextResponse.json(
        { error: 'Expired or already-converted quotes cannot be converted to appointments' },
        { status: 400 }
      );
    }

    const endTime = addMinutesToTime(time, duration_minutes);
    const endTimeWithBuffer = addMinutesToTime(time, duration_minutes + APPOINTMENT.BUFFER_MINUTES);

    // Auto-assign detailer if none provided
    let assignedEmployeeId = employee_id ?? null;
    if (!assignedEmployeeId) {
      assignedEmployeeId = await findAvailableDetailer(supabase, date, time, endTimeWithBuffer);
    }

    // Create the appointment
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        customer_id: quote.customer_id,
        vehicle_id: quote.vehicle_id,
        employee_id: assignedEmployeeId,
        status: 'confirmed',
        channel: 'phone',
        scheduled_date: date,
        scheduled_start_time: time,
        scheduled_end_time: endTime,
        is_mobile: false,
        mobile_surcharge: 0,
        payment_status: 'pending',
        subtotal: quote.subtotal,
        tax_amount: quote.tax_amount,
        discount_amount: 0,
        total_amount: quote.total_amount,
        job_notes: quote.notes,
      })
      .select('*')
      .single();

    if (apptErr || !appointment) {
      console.error('Error creating appointment:', apptErr?.message);
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
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
      .eq('id', id);

    if (updateErr) {
      console.error('Error updating quote status:', updateErr.message);
    }

    // Fire webhook for appointment confirmation
    fireWebhook('appointment_confirmed', appointment, supabase).catch(() => {});

    return NextResponse.json({
      success: true,
      appointment,
    });
  } catch (err) {
    console.error('Quote convert error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
