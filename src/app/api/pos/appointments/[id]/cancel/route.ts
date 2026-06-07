import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendCancellationNotifications } from '@/lib/email/send-cancellation-email';

const TERMINAL_STATUSES = ['completed', 'cancelled'];

const cancelSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .min(1, 'Cancellation reason is required'),
  // notify_customer defaults to false — the POS cancel flow is operator-driven
  // and suppresses customer notifications by construction (Roadmap Item 15b,
  // matches the Item 12 reschedule pattern). When the operator explicitly
  // checks the "Notify customer" box, the dialog passes `true` and the
  // existing cancellation SMS/email + cancellation webhook fire.
  notify_customer: z.boolean().optional().default(false),
});

/**
 * POST /api/pos/appointments/[id]/cancel
 *
 * POS-side cancel of an appointment from the POS Appointments view
 * (Roadmap Item 15b). Modelled on the Item 12 reschedule endpoint:
 *  - HMAC POS auth + `appointments.cancel` permission gate
 *  - Scope intentionally narrower than the admin POST at
 *    /api/appointments/[id]/cancel:
 *    - No cancellation fee field (fee waiver gated by `appointments.waive_fee`,
 *      not exposed in POS — `appointments.waive_fee` is admin-only).
 *    - No waitlist auto-notification (waitlist is itself a customer-notifying
 *      side-channel — keep POS strict "no customer contact" by construction
 *      when `notify_customer=false`).
 *  - `notify_customer` defaults to false. When false: skip
 *    `sendCancellationNotifications`. When true: fire it (parity with admin
 *    cancel for the customer-facing side effects).
 *    (Theme G — outbound n8n webhook removed; Smart Details has no receiver
 *    wired, so the pre-Theme-G paired `fireWebhook('appointment_cancelled')`
 *    has been deleted alongside its 22 sibling fire sites.)
 *  - Audit row always records `notification_suppressed: !notify_customer`
 *    + `source: 'pos'`.
 *
 * Permission: `appointments.cancel` (existing — admin and super_admin only by
 * default; cashier denied per audit §9.1).
 */
export async function POST(
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
    const parsed = cancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const supabase = createAdminClient();

    const canCancel = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.cancel'
    );
    if (!canCancel) {
      return NextResponse.json(
        { error: "You don't have permission to cancel appointments" },
        { status: 403 }
      );
    }

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

    if (TERMINAL_STATUSES.includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is already ${current.status}` },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: data.cancellation_reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('POS appointment cancel failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to cancel appointment' },
        { status: 500 }
      );
    }

    // Notification dispatch — strictly gated by the operator's checkbox.
    // When false, suppress every customer-facing side effect (direct
    // notifications AND the cancellation webhook, since downstream n8n
    // flows on that event may also notify the customer).
    if (data.notify_customer) {
      // Theme G — `appointment_cancelled` outbound webhook removed (no n8n
      // receiver in Smart Details; audit f5e714a8). Customer SMS/email
      // dispatch is inline via `sendCancellationNotifications`.
      sendCancellationNotifications(id, data.cancellation_reason).catch((err) =>
        console.error('Cancellation notifications failed (non-blocking):', err)
      );
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'delete',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: {
        reason: data.cancellation_reason,
        notification_suppressed: !data.notify_customer,
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
    console.error('POS appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
