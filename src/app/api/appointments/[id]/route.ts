import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentUpdateSchema } from '@/lib/utils/validation';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = appointmentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Permission check: reschedule requires appointments.reschedule
    const isReschedule = data.scheduled_date !== undefined ||
      data.scheduled_start_time !== undefined ||
      data.scheduled_end_time !== undefined;
    if (isReschedule) {
      const denied = await requirePermission(employee.id, 'appointments.reschedule');
      if (denied) return denied;
    }

    // Permission check: status changes require appointments.update_status
    if (data.status !== undefined) {
      const denied = await requirePermission(employee.id, 'appointments.update_status');
      if (denied) return denied;
    }

    const supabase = createAdminClient();

    // Fetch current appointment
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, status, scheduled_date, scheduled_start_time, scheduled_end_time')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Overlap check if date/time is changing
    const newDate = data.scheduled_date || current.scheduled_date;
    const newStart = data.scheduled_start_time || current.scheduled_start_time;
    const newEnd = data.scheduled_end_time || current.scheduled_end_time;

    const dateChanged = newDate !== current.scheduled_date;
    const timeChanged =
      newStart !== current.scheduled_start_time ||
      newEnd !== current.scheduled_end_time;

    if (dateChanged || timeChanged) {
      // Add buffer to end time for overlap check
      const endWithBuffer = addMinutesToTime(newEnd, APPOINTMENT.BUFFER_MINUTES);

      const { data: overlapping } = await supabase
        .from('appointments')
        .select('id')
        .eq('scheduled_date', newDate)
        .neq('id', id)
        .neq('status', 'cancelled')
        .lt('scheduled_start_time', endWithBuffer)
        .gt('scheduled_end_time', newStart)
        .limit(1);

      if (overlapping && overlapping.length > 0) {
        return NextResponse.json(
          { error: 'This time slot conflicts with another appointment' },
          { status: 409 }
        );
      }
    }

    // Build update payload (only include provided fields)
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.status !== undefined) update.status = data.status;
    if (data.scheduled_date !== undefined) update.scheduled_date = data.scheduled_date;
    if (data.scheduled_start_time !== undefined) update.scheduled_start_time = data.scheduled_start_time;
    if (data.scheduled_end_time !== undefined) update.scheduled_end_time = data.scheduled_end_time;
    if (data.employee_id !== undefined) update.employee_id = data.employee_id;
    if (data.job_notes !== undefined) update.job_notes = data.job_notes;
    if (data.internal_notes !== undefined) update.internal_notes = data.internal_notes;

    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id)
      .select('id, status')
      .single();

    if (updateErr) {
      console.error('Appointment update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update appointment' },
        { status: 500 }
      );
    }

    // Fire webhooks based on status changes
    if (data.status && data.status !== current.status) {
      const webhookPayload = {
        event: '',
        timestamp: new Date().toISOString(),
        appointment: { id, status: data.status },
      };

      if (data.status === 'confirmed') {
        fireWebhook('appointment_confirmed', { ...webhookPayload, event: 'appointment.confirmed' }, supabase).catch(err =>
          console.error('Webhook fire failed:', err)
        );
      } else if (data.status === 'completed') {
        fireWebhook('appointment_completed', { ...webhookPayload, event: 'appointment.completed' }, supabase).catch(err =>
          console.error('Webhook fire failed:', err)
        );
      }
    }

    // Fire rescheduled webhook if date/time changed
    if (dateChanged || timeChanged) {
      fireWebhook('appointment_rescheduled', {
        event: 'appointment.rescheduled',
        timestamp: new Date().toISOString(),
        appointment: {
          id,
          old_date: current.scheduled_date,
          old_start_time: current.scheduled_start_time,
          new_date: newDate,
          new_start_time: newStart,
        },
      }, supabase).catch(err => console.error('Webhook fire failed:', err));
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('Appointment PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

