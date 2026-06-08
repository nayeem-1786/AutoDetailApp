/**
 * Admin appointment cancel route.
 *
 * Phase 3 Theme D.1 (AC-9 foundation, 2026-06-07): orchestration delegated to
 * `cancelAppointmentOrchestrated` in `src/lib/appointments/cancel-orchestration.ts`.
 * Pre-D.1 this route did only `appointments.status='cancelled'` + audit +
 * inline waitlist scan. The orchestrator now handles money movement (Pathway A
 * Stripe refund or Pathway B customer credit), job cancellation cascade, and
 * audit logging atomically. This route retains:
 *
 *  - Auth + permission gates (`appointments.cancel`, plus `appointments.waive_fee`
 *    when a non-zero fee is provided)
 *  - Body validation via the extended `appointmentCancelSchema`
 *  - Waitlist auto-notify side effect (admin-only; not part of orchestration
 *    because it's a downstream customer-marketing path, not a cancel side effect)
 *  - Dollars→cents fee conversion at the boundary (legacy `cancellation_fee`
 *    column → orchestrator's `cancellation_fee_cents` input)
 *
 * Customer notification defaults to TRUE on the admin path (pre-D.1 behavior:
 * `sendCancellationNotifications` always fired). Operator can opt out via
 * `notify_customer: false` in the body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentCancelSchema } from '@/lib/utils/validation';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { getRequestIp } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { cancelAppointmentOrchestrated } from '@/lib/appointments/cancel-orchestration';
import { toCents } from '@/lib/utils/money';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.cancel');
    if (denied) return denied;

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

    // Permission check: setting a cancellation fee requires appointments.waive_fee
    const hasFeeDollars =
      data.cancellation_fee !== undefined && data.cancellation_fee !== null;
    const hasFeeCents =
      data.cancellation_fee_cents !== undefined &&
      data.cancellation_fee_cents !== null;
    if (hasFeeDollars || hasFeeCents) {
      const feeDenied = await requirePermission(employee.id, 'appointments.waive_fee');
      if (feeDenied) return feeDenied;
    }

    // Resolve effective fee in cents. `_cents` wins when both are provided
    // (Money-Unify: callers should prefer the typed-cents shape post-D.1).
    // Feature-flag gating preserved from pre-D.1: when CANCELLATION_FEE flag
    // is disabled, the operator-typed fee is dropped silently per the pre-D.1
    // contract (audit `3e633156` Target A.2).
    const feeEnabled = await isFeatureEnabled(FEATURE_FLAGS.CANCELLATION_FEE);
    let effectiveFeeCents: number | null = null;
    if (feeEnabled) {
      if (hasFeeCents) {
        effectiveFeeCents = data.cancellation_fee_cents as number;
      } else if (hasFeeDollars) {
        effectiveFeeCents = toCents(data.cancellation_fee as number);
      }
    }

    const supabase = createAdminClient();

    // Delegate to the canonical orchestrator. Pre-D.1 callers that don't pass
    // `pathway` get `'refund'` — semantically backward-compatible (the pre-D.1
    // path didn't do refunds, but if it had, refund would have been the
    // intent).
    const result = await cancelAppointmentOrchestrated(supabase, {
      appointmentId: id,
      pathway: data.pathway ?? 'refund',
      reason: data.cancellation_reason,
      cancellation_fee_cents: effectiveFeeCents,
      notifyCustomer: data.notify_customer ?? true,
      cancelledBy: 'staff_admin',
      actor: {
        userId: employee.auth_user_id,
        userEmail: employee.email,
        employeeName:
          [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
          null,
        employeeId: employee.id,
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

    // --- Waitlist notification on cancellation ---
    // Admin-only side effect; preserved unchanged from pre-D.1. Best-effort,
    // never blocks the response.
    const waitlistEnabled = await isFeatureEnabled(FEATURE_FLAGS.WAITLIST);

    if (waitlistEnabled) {
      try {
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
          const serviceIds = apptServices.map(
            (s: { service_id: string }) => s.service_id
          );

          const { data: waitlistMatches } = await supabase
            .from('waitlist_entries')
            .select(
              'id, customer_id, service_id, customer:customers!customer_id(first_name, last_name, phone), service:services!service_id(name)'
            )
            .in('service_id', serviceIds)
            .eq('status', 'waiting')
            .or(
              `preferred_date.eq.${apptDetail.scheduled_date},preferred_date.is.null`
            );

          if (waitlistMatches && waitlistMatches.length > 0) {
            const slotDateStr = new Date(
              apptDetail.scheduled_date + 'T00:00:00'
            ).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            type WaitlistRow = {
              id: string;
              customer_id: string;
              service_id: string;
              customer: {
                first_name: string | null;
                last_name: string | null;
                phone: string | null;
              } | null;
              service: { name: string | null } | null;
            };

            for (const entry of waitlistMatches as unknown as WaitlistRow[]) {
              await supabase
                .from('waitlist_entries')
                .update({
                  status: 'notified',
                  notified_at: new Date().toISOString(),
                })
                .eq('id', entry.id);

              const phone = entry.customer?.phone;
              const serviceName =
                entry.service?.name ?? 'your requested service';
              if (phone) {
                const firstName = entry.customer?.first_name ?? undefined;
                const smsFallback = `Hi ${firstName ?? 'there'}, good news — a spot just opened for ${serviceName} on ${slotDateStr}! Reply or call to book.`;
                const smsResult = await renderSmsTemplate(
                  'waitlist_slot_available',
                  {
                    service_name: serviceName,
                    appointment_date: slotDateStr,
                    first_name: firstName,
                    last_name: entry.customer?.last_name ?? undefined,
                  },
                  smsFallback
                );

                if (smsResult.isActive) {
                  await sendSms(phone, smsResult.body, {
                    logToConversation: true,
                    customerId: entry.customer_id,
                    notificationType: 'waitlist_slot_available',
                    contextId: id,
                  });
                }
              }
            }
          }
        }
      } catch (waitlistErr) {
        console.error(
          'Waitlist auto-notify failed (non-blocking):',
          waitlistErr
        );
      }
    }

    return NextResponse.json({
      success: true,
      appointment_id: result.appointment_id,
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
    });
  } catch (err) {
    console.error('Appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
