import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getRequestIp } from '@/lib/services/audit';
import { cancelAppointmentOrchestrated } from '@/lib/appointments/cancel-orchestration';

const cancelSchema = z.object({
  cancellation_reason: z
    .string()
    .trim()
    .min(1, 'Cancellation reason is required'),
  // notify_customer defaults to false — POS path is operator-driven and
  // suppresses customer notifications by construction unless the operator
  // explicitly opts in via the dialog's "Notify customer" checkbox.
  notify_customer: z.boolean().optional().default(false),
  // D.1 — pathway selector. Defaults to 'refund' (BC).
  pathway: z.enum(['refund', 'credit']).optional(),
  // D.1 — fee in cents (Money-Unify Rule #20). POS dialog wires this when the
  // operator chooses Pathway A. Optional; omitted = no fee deduction.
  cancellation_fee_cents: z
    .number()
    .int('Must be an integer')
    .min(0, 'Must be 0 or greater')
    .optional()
    .nullable(),
});

/**
 * POST /api/pos/appointments/[id]/cancel
 *
 * POS-side cancel of an appointment.
 *
 * Phase 3 Theme D.1 (AC-9 foundation, 2026-06-07): orchestration delegated to
 * `cancelAppointmentOrchestrated`. Pre-D.1 this route only flipped status and
 * conditionally dispatched notifications. Post-D.1 it gains:
 *
 *   - Pathway A (Stripe refund minus optional fee) when `pathway === 'refund'`
 *   - Pathway B (full paid amount as customer credit) when `pathway === 'credit'`
 *   - Job cascade (active job marked cancelled) — replaces the orphan gap
 *     identified by audit `3e633156` Target A.1
 *
 * Cancel-time fees on the POS path: previously the POS endpoint had NO fee
 * field (admin-only by explicit design comment per pre-D.1 line 33-37). Post-
 * D.1 the orchestrator accepts a cents-typed fee, and the POS dialog wires
 * the operator-entered value. POS fee gating uses the same `appointments.cancel`
 * permission (no separate `appointments.waive_fee` check — POS operators with
 * cancel authority are trusted to set fees; this matches the broader POS-trust
 * boundary established by the HMAC auth at the route entry).
 *
 * Permission: `appointments.cancel` (existing).
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

    const result = await cancelAppointmentOrchestrated(supabase, {
      appointmentId: id,
      pathway: data.pathway ?? 'refund',
      reason: data.cancellation_reason,
      cancellation_fee_cents: data.cancellation_fee_cents ?? null,
      notifyCustomer: data.notify_customer,
      cancelledBy: 'staff_pos',
      actor: {
        userId: posEmployee.auth_user_id,
        userEmail: posEmployee.email,
        employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
        employeeId: posEmployee.employee_id,
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

    // Re-fetch the now-cancelled appointment with the relations the POS UI
    // expects in `data`. The orchestrator returns only the canonical result
    // shape; surface-specific data shapes stay at the route layer.
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

    return NextResponse.json({
      data: updated,
      cancel_result: {
        pathway: result.pathway,
        job_cancelled: result.job_cancelled,
        amount_paid_cents: result.amount_paid_cents,
        ...(result.pathway === 'refund'
          ? {
              refund_amount_cents: result.refund_amount_cents ?? 0,
              stripe_refund_id: result.stripe_refund_id ?? null,
              cancellation_fee_cents: result.cancellation_fee_cents ?? 0,
            }
          : {
              credit_id: result.credit_id ?? null,
              credit_amount_cents: result.credit_amount_cents ?? 0,
            }),
      },
    });
  } catch (err) {
    console.error('POS appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
