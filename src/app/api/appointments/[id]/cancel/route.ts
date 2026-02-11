import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentCancelSchema } from '@/lib/utils/validation';
import { fireWebhook } from '@/lib/utils/webhook';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';

const TERMINAL_STATUSES = ['completed', 'cancelled'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = appointmentCancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    // Fetch current appointment
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Guard terminal states
    if (TERMINAL_STATUSES.includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is already ${current.status}` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: data.cancellation_reason,
        cancellation_fee: data.cancellation_fee ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status')
      .single();

    if (updateErr) {
      console.error('Appointment cancel failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to cancel appointment' },
        { status: 500 }
      );
    }

    // Fire cancellation webhook
    fireWebhook('appointment_cancelled', {
      event: 'appointment.cancelled',
      timestamp: new Date().toISOString(),
      appointment: {
        id,
        cancellation_reason: data.cancellation_reason,
        cancellation_fee: data.cancellation_fee ?? null,
      },
    }, supabase).catch(err => console.error('Webhook fire failed:', err));

    // --- Waitlist notification on cancellation ---
    // Check if waitlist feature is enabled
    const waitlistEnabled = await isFeatureEnabled(FEATURE_FLAGS.WAITLIST);

    if (waitlistEnabled) {
      // Get the cancelled appointment's services and date
      const { data: apptServices } = await supabase
        .from('appointment_services')
        .select('service_id')
        .eq('appointment_id', id);

      const { data: apptDetail } = await supabase
        .from('appointments')
        .select('scheduled_date')
        .eq('id', id)
        .single();

      if (apptServices && apptDetail) {
        const serviceIds = apptServices.map((s: { service_id: string }) => s.service_id);

        // Find waitlist entries matching any of these services + date (or no date preference)
        const { data: waitlistMatches } = await supabase
          .from('waitlist_entries')
          .select('id, customer_id, service_id, customer:customers!customer_id(first_name, last_name, phone)')
          .in('service_id', serviceIds)
          .eq('status', 'waiting')
          .or(`preferred_date.eq.${apptDetail.scheduled_date},preferred_date.is.null`);

        // Auto-notify matching waitlist entries (update status, fire webhook)
        if (waitlistMatches && waitlistMatches.length > 0) {
          for (const entry of waitlistMatches) {
            await supabase
              .from('waitlist_entries')
              .update({ status: 'notified', notified_at: new Date().toISOString() })
              .eq('id', entry.id);
          }

          // Webhook for n8n to handle actual SMS sending
          fireWebhook('appointment_cancelled', {
            appointment_id: id,
            date: apptDetail.scheduled_date,
            waitlist_notified: waitlistMatches.map((w: { id: string; customer_id: string; service_id: string }) => ({
              id: w.id,
              customer_id: w.customer_id,
              service_id: w.service_id,
            })),
          }, supabase).catch((err) =>
            console.error('Waitlist notification webhook failed:', err)
          );
        }
      }
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('Appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
