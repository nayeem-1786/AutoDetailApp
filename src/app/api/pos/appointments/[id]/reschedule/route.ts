import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { logAudit, getRequestIp, buildChangeDetails } from '@/lib/services/audit';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const rescheduleSchema = z.object({
  scheduled_date: z.string().regex(DATE_RE, 'Invalid date format').optional(),
  scheduled_start_time: z.string().regex(TIME_RE, 'Invalid time format').optional(),
  scheduled_end_time: z.string().regex(TIME_RE, 'Invalid time format').optional(),
  employee_id: z
    .union([z.string().uuid(), z.literal('')])
    .nullable()
    .optional(),
});

/**
 * PATCH /api/pos/appointments/[id]/reschedule
 *
 * POS-side reschedule of an appointment from the new POS Appointments view
 * (Item 12). Scope is intentionally narrower than the admin PATCH at
 * /api/appointments/[id]:
 *  - Updates ONLY date, start time, end time, and assigned detailer.
 *  - Does NOT change status, services, customer, vehicle, or notes.
 *  - **Notification suppression**: this path does NOT fire any
 *    `appointment_rescheduled` webhook. By design (Item 12 acceptance criteria)
 *    the operator manages customer communication directly when rescheduling
 *    from the POS. The admin PATCH still fires the webhook on its path.
 *  - Same overlap check as admin (409 on conflict). Operator can adjust and
 *    retry.
 *
 * Permission: appointments.reschedule (existing key — granted to cashier,
 * admin, super_admin by default; detailer denied).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = rescheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const hasAnyChange =
      data.scheduled_date !== undefined ||
      data.scheduled_start_time !== undefined ||
      data.scheduled_end_time !== undefined ||
      data.employee_id !== undefined;

    if (!hasAnyChange) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const canReschedule = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.reschedule'
    );
    if (!canReschedule) {
      return NextResponse.json(
        { error: "You don't have permission to reschedule appointments" },
        { status: 403 }
      );
    }

    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select(
        'id, status, scheduled_date, scheduled_start_time, scheduled_end_time, employee_id'
      )
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    if (current.status === 'cancelled' || current.status === 'completed') {
      return NextResponse.json(
        {
          error: `Cannot reschedule an appointment with status "${current.status}"`,
        },
        { status: 400 }
      );
    }

    const newDate = data.scheduled_date ?? current.scheduled_date;
    const newStart = data.scheduled_start_time ?? current.scheduled_start_time;
    const newEnd = data.scheduled_end_time ?? current.scheduled_end_time;

    const dateChanged = newDate !== current.scheduled_date;
    const timeChanged =
      newStart !== current.scheduled_start_time ||
      newEnd !== current.scheduled_end_time;

    if (dateChanged || timeChanged) {
      // End time must be after start time
      if (newEnd <= newStart) {
        return NextResponse.json(
          { error: 'End time must be after start time' },
          { status: 400 }
        );
      }

      // Match the admin PATCH overlap rule: BUFFER_MINUTES added to end time.
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

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.scheduled_date !== undefined) update.scheduled_date = data.scheduled_date;
    if (data.scheduled_start_time !== undefined)
      update.scheduled_start_time = data.scheduled_start_time;
    if (data.scheduled_end_time !== undefined) update.scheduled_end_time = data.scheduled_end_time;
    if (data.employee_id !== undefined) {
      update.employee_id = data.employee_id === '' ? null : data.employee_id;
    }

    const { error: updateErr } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id);

    if (updateErr) {
      console.error('POS reschedule update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update appointment' },
        { status: 500 }
      );
    }

    // Keep jobs.assigned_staff_id in sync if a detailer change happened — the
    // existing /api/pos/jobs/[id]/reschedule route does the inverse sync.
    if (data.employee_id !== undefined) {
      const newEmployeeId = data.employee_id === '' ? null : data.employee_id;
      await supabase
        .from('jobs')
        .update({ assigned_staff_id: newEmployeeId })
        .eq('appointment_id', id);
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: {
        ...buildChangeDetails(current, update, [
          'scheduled_date',
          'scheduled_start_time',
          'scheduled_end_time',
          'employee_id',
        ]),
        notification_suppressed: true,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    const { data: updated } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color, size_class),
        employee:employees!employee_id(id, first_name, last_name, role),
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
      `)
      .eq('id', id)
      .single();

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('POS reschedule PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
