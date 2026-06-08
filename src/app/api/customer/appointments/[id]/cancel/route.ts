import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APPOINTMENT } from '@/lib/utils/constants';
import { getRequestIp } from '@/lib/services/audit';
import { cancelAppointmentOrchestrated } from '@/lib/appointments/cancel-orchestration';

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

/**
 * POST /api/customer/appointments/[id]/cancel
 *
 * Customer self-serve cancel.
 *
 * Phase 3 Theme D.1 (AC-9 foundation, 2026-06-07): orchestration delegated to
 * `cancelAppointmentOrchestrated`. Customer self-cancel ALWAYS uses Pathway A
 * (Stripe refund); the customer cannot choose Pathway B (operator's decision
 * since credit is a relational gesture that needs operator awareness — audit
 * F.6 framing). No cancellation fee on this path; the 24-hour window is the
 * fee-equivalent gate (cancellations within 24 hours are rejected entirely).
 *
 * Pre-D.1 this route only flipped status — leaving any deposit money stranded
 * on the cancelled appointment with no automated refund. Post-D.1 the
 * customer's deposit is automatically refunded via Stripe.
 *
 * Notification: always TRUE — the customer initiated; they get the
 * confirmation SMS + email.
 */
export async function POST(
  request: NextRequest,
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

    // Fetch appointment with ownership check + status + timing for the 24h
    // window gate. The orchestrator does its own existence/cancellable check
    // but this route owns the ownership gate (the customer must own the
    // appointment).
    const { data: appointment, error: fetchErr } = await admin
      .from('appointments')
      .select('id, status, scheduled_date, scheduled_start_time, customer_id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (fetchErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is ${appointment.status}` },
        { status: 400 }
      );
    }

    // 24-hour advance cancellation window — customer-portal-only gate.
    const appointmentDateTime = new Date(
      `${appointment.scheduled_date}T${appointment.scheduled_start_time}`
    );
    const now = new Date();
    const hoursUntil =
      (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil < APPOINTMENT.CANCELLATION_WINDOW_HOURS) {
      return NextResponse.json(
        {
          error: `Appointments must be cancelled at least ${APPOINTMENT.CANCELLATION_WINDOW_HOURS} hours in advance.`,
          too_late: true,
        },
        { status: 400 }
      );
    }

    const result = await cancelAppointmentOrchestrated(admin, {
      appointmentId: id,
      pathway: 'refund',
      reason: 'Cancelled by customer',
      // Phase 3 Theme D.2 (AC-14): customer self-cancel is explicit-waive
      // (`0`), NOT default-from-business-settings. The 24h advance window
      // gate above IS the fee policy for this surface — customers who
      // cancel in time get a full refund; customers who try to cancel too
      // late are rejected entirely. Pre-D.2 this field was `null` which
      // collapsed to 0; D.2 promotes nullish to "read default", so the
      // explicit `0` is now required to preserve the documented "no fee
      // on this path" contract.
      cancellation_fee_cents: 0,
      notifyCustomer: true,
      cancelledBy: 'customer',
      actor: {
        userId: user.id,
        userEmail: user.email ?? null,
        employeeName: null,
        // Customer self-cancel is not employee-attributed; refunds.processed_by
        // is NULL on this path, which is acceptable per the existing refund
        // engine's pattern for non-staff-driven refunds.
        employeeId: null,
      },
      ipAddress: getRequestIp(request),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.message,
          error_code: result.error,
          ...(result.partial_state ? { partial_state: result.partial_state } : {}),
        },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json({
      success: true,
      appointment_id: result.appointment_id,
      refund_amount_cents: result.refund_amount_cents ?? 0,
      stripe_refund_id: result.stripe_refund_id ?? null,
      amount_paid_cents: result.amount_paid_cents,
    });
  } catch (err) {
    console.error('Customer cancel appointment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
