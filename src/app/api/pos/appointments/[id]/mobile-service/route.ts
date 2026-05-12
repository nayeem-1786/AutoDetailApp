import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import {
  resolveMobileFields,
  MobileFieldsError,
} from '@/lib/utils/resolve-mobile-fields';
import { toCents } from '@/lib/utils/refund-math';
import type { JobServiceSnapshot } from '@/lib/supabase/types';
import {
  applyMobileEditToJobServices,
  computeAppointmentDelta,
  computePaidCentsForAppointment,
} from '@/lib/utils/mobile-service-edit';

/**
 * PATCH /api/pos/appointments/[id]/mobile-service
 *
 * Phase Mobile-1.9 — full mobile picker edit endpoint. Replaces the
 * Phase Mobile-1.6 address-only edit when the cashier needs to change
 * the toggle / zone / custom-pricing / address on a job after creation.
 *
 * Body shape (all fields optional; `is_mobile` is the gate):
 *   {
 *     is_mobile: boolean,
 *     mobile_zone_id?: string | null,        // null on Custom path or off
 *     mobile_surcharge?: number,             // dollars
 *     mobile_address?: string,
 *     mobile_zone_name_snapshot?: string,    // label for Custom path
 *     is_custom?: boolean                    // distinguishes Custom path from
 *                                            //   "no zone selected" (Phase 1.2)
 *   }
 *
 * Server-side flow (LOCKED-6, Phase 1.9):
 *   1. Auth (HMAC POS) + permission gate (pos.jobs.manage — same gate
 *      the Phase 1.6 mobile-address endpoint uses).
 *   2. Re-fetch the zone and re-validate the client-supplied surcharge
 *      against the LIVE zone surcharge (Option α — snapshot at save
 *      time from the live `mobile_zones` row, see `docs/sessions/
 *      mobile-fee-fix.md`). Custom path bypasses this check; the
 *      cashier-supplied surcharge is bounded 0 < x ≤ $500.
 *   3. Atomic update: `appointments` row (all five mobile fields +
 *      subtotal/total delta) AND `jobs.services` JSONB (re-materialize
 *      the mobile entry — toggle on appends, toggle off removes, zone
 *      change rewrites name + price).
 *   4. Compute payment mismatch: new appointment.total_amount minus
 *      sum of payments for this appointment's transactions. Returned
 *      to the client so the picker can render the warning banner.
 *   5. Audit log entry with before/after of all four mobile fields.
 *
 * Mobile fee is non-taxable (LOCKED-2 Phase 1) so the surcharge delta
 * adjusts subtotal and total but leaves tax_amount and discount_amount
 * alone. This keeps the math invariant for tax-bearing appointments
 * (e.g. online booking).
 *
 * transaction_items rows are NOT modified — those are historical
 * records of what was charged (LOCKED-9 Phase 1.9). Admin reconciles
 * any payment mismatch via existing refund/payment flows.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const canManage = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.jobs.manage'
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to edit job details" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // Resolve + validate the mobile fields (zone re-fetch, surcharge
    // re-validation, Custom-path bounds, address presence + length).
    let resolved;
    try {
      resolved = await resolveMobileFields(supabase, {
        is_mobile: body?.is_mobile === true,
        mobile_zone_id: body?.mobile_zone_id ?? null,
        mobile_address: body?.mobile_address ?? null,
        mobile_surcharge: body?.mobile_surcharge ?? null,
        mobile_zone_name_snapshot: body?.mobile_zone_name_snapshot ?? null,
        is_custom: body?.is_custom === true,
      });
    } catch (err) {
      if (err instanceof MobileFieldsError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Load the current appointment so we know what we're updating from
    // and can compute the delta. Subtotal/total drive the recompute;
    // mobile_* fields drive the audit before/after.
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select(
        'id, is_mobile, mobile_zone_id, mobile_address, mobile_surcharge, mobile_zone_name_snapshot, subtotal, total_amount'
      )
      .eq('id', id)
      .single();
    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    const { newSubtotal, newTotal } = computeAppointmentDelta({
      currentSubtotal: Number(current.subtotal),
      currentTotal: Number(current.total_amount),
      currentSurcharge: Number(current.mobile_surcharge ?? 0),
      newSurcharge: resolved.surcharge,
    });

    const apptUpdate = {
      is_mobile: resolved.isMobile,
      mobile_zone_id: resolved.zoneId,
      mobile_address: resolved.address,
      mobile_surcharge: resolved.surcharge,
      mobile_zone_name_snapshot: resolved.snapshotName,
      subtotal: newSubtotal,
      total_amount: newTotal,
      updated_at: new Date().toISOString(),
    };

    const { error: apptUpdateErr } = await supabase
      .from('appointments')
      .update(apptUpdate)
      .eq('id', id);
    if (apptUpdateErr) {
      console.error('Appointment mobile update failed:', apptUpdateErr.message);
      return NextResponse.json(
        { error: 'Failed to update mobile service' },
        { status: 500 }
      );
    }

    // Sync jobs.services JSONB for every job linked to this appointment.
    // Idempotent — re-materializes the mobile entry from the resolved
    // fields regardless of prior state (toggle on appends, toggle off
    // removes, zone change rewrites). One appointment can have multiple
    // jobs over its lifetime (rare but the schema allows it via SET
    // NULL), so update all matches.
    const { data: linkedJobs, error: jobsFetchErr } = await supabase
      .from('jobs')
      .select('id, services')
      .eq('appointment_id', id);
    if (jobsFetchErr) {
      console.error('Linked jobs fetch failed:', jobsFetchErr.message);
      // Don't fail the request — the appointment update succeeded and
      // the JSONB is a display-side mirror; the composer reads
      // `appointment.is_mobile + mobile_surcharge` as a fallback, but
      // we still log this so the staff inconsistency is visible.
    }
    for (const job of linkedJobs ?? []) {
      const updatedServices = applyMobileEditToJobServices({
        services: (job.services ?? []) as JobServiceSnapshot[],
        isMobile: resolved.isMobile,
        surcharge: resolved.surcharge,
        snapshotName: resolved.snapshotName,
      });
      const { error: jobUpdErr } = await supabase
        .from('jobs')
        .update({ services: updatedServices })
        .eq('id', job.id);
      if (jobUpdErr) {
        console.error(
          `Job ${job.id} services JSONB sync failed:`,
          jobUpdErr.message
        );
      }
    }

    // Compute payment mismatch. Uses cents internally to dodge float
    // drift (mirrors `attachAmountDueCents` in /api/pos/jobs/[id]).
    const paidCents = await computePaidCentsForAppointment(supabase, id);
    const totalCents = toCents(newTotal);
    const mismatchAmount = (totalCents - paidCents) / 100;

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: {
        field: 'mobile_service',
        before: {
          is_mobile: current.is_mobile,
          mobile_zone_id: current.mobile_zone_id,
          mobile_address: current.mobile_address,
          mobile_surcharge: Number(current.mobile_surcharge ?? 0),
          mobile_zone_name_snapshot: current.mobile_zone_name_snapshot,
          total_amount: Number(current.total_amount),
        },
        after: {
          is_mobile: resolved.isMobile,
          mobile_zone_id: resolved.zoneId,
          mobile_address: resolved.address,
          mobile_surcharge: resolved.surcharge,
          mobile_zone_name_snapshot: resolved.snapshotName,
          total_amount: newTotal,
        },
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({
      data: {
        is_mobile: resolved.isMobile,
        mobile_zone_id: resolved.zoneId,
        mobile_address: resolved.address,
        mobile_surcharge: resolved.surcharge,
        mobile_zone_name_snapshot: resolved.snapshotName,
        subtotal: newSubtotal,
        total_amount: newTotal,
      },
      mismatch_amount: mismatchAmount,
    });
  } catch (err) {
    console.error('Mobile service PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
