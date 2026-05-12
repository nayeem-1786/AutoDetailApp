import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
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
 * PATCH /api/admin/appointments/[id]/mobile-service
 *
 * Admin counterpart to /api/pos/appointments/[id]/mobile-service. Same
 * body shape, same validation, same atomic appointment + jobs.services
 * update, same mismatch_amount response. Auth swaps from HMAC POS to
 * session-based admin; permission gate is `appointments.add_notes`
 * (mirrors the existing edit pattern on the appointment dialog — see
 * Phase Mobile-1.6 LOCKED-C precedent).
 *
 * See the POS endpoint comment block for the full flow rationale and
 * the LOCKED decisions referenced from Phase Mobile-1.9.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.add_notes');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const supabase = createAdminClient();

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

    const { error: apptUpdateErr } = await supabase
      .from('appointments')
      .update({
        is_mobile: resolved.isMobile,
        mobile_zone_id: resolved.zoneId,
        mobile_address: resolved.address,
        mobile_surcharge: resolved.surcharge,
        mobile_zone_name_snapshot: resolved.snapshotName,
        subtotal: newSubtotal,
        total_amount: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (apptUpdateErr) {
      console.error('Appointment mobile update failed:', apptUpdateErr.message);
      return NextResponse.json(
        { error: 'Failed to update mobile service' },
        { status: 500 }
      );
    }

    const { data: linkedJobs, error: jobsFetchErr } = await supabase
      .from('jobs')
      .select('id, services')
      .eq('appointment_id', id);
    if (jobsFetchErr) {
      console.error('Linked jobs fetch failed:', jobsFetchErr.message);
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

    const paidCents = await computePaidCentsForAppointment(supabase, id);
    const totalCents = toCents(newTotal);
    const mismatchAmount = (totalCents - paidCents) / 100;

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName:
        [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
        null,
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
      source: 'admin',
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
