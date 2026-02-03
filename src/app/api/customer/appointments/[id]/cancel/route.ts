import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch appointment with ownership check
    const { data: appointment, error: fetchErr } = await admin
      .from('appointments')
      .select('id, status, scheduled_date, scheduled_start_time, customer_id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (fetchErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Status check
    if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is ${appointment.status}` },
        { status: 400 }
      );
    }

    // 24-hour advance cancellation window
    const appointmentDateTime = new Date(
      `${appointment.scheduled_date}T${appointment.scheduled_start_time}`
    );
    const now = new Date();
    const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil < APPOINTMENT.CANCELLATION_WINDOW_HOURS) {
      return NextResponse.json(
        {
          error: `Appointments must be cancelled at least ${APPOINTMENT.CANCELLATION_WINDOW_HOURS} hours in advance.`,
          too_late: true,
        },
        { status: 400 }
      );
    }

    // Cancel the appointment
    const { error: updateErr } = await admin
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: 'Cancelled by customer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Cancel appointment error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 });
    }

    // Fire cancellation webhook
    fireWebhook('appointment_cancelled', {
      event: 'appointment.cancelled',
      timestamp: new Date().toISOString(),
      appointment: {
        id,
        cancellation_reason: 'Cancelled by customer',
        cancelled_by: 'customer',
        customer_id: customer.id,
      },
    }, admin).catch(err => console.error('Webhook fire failed:', err));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Customer cancel appointment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
