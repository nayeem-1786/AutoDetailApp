import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import {
  editServicesBodySchema,
  buildJobServicesJsonb,
  computeTotalsForServiceEdit,
  type EditServicesItem,
} from '@/lib/appointments/edit-services';

/**
 * PUT /api/admin/appointments/[id]/services — Item 15a (Wave 1.5)
 *
 * Replace the full `appointment_services` row set for an appointment with
 * the supplied list, recompute totals, and (if a `jobs` row is linked via
 * `jobs.appointment_id`) sync the `jobs.services` JSONB snapshot so the
 * detailer sees the up-to-date list at intake. Closes lifecycle-audit
 * gaps §10 #1 and #11.
 *
 * Permission: `appointments.reschedule` — same role distribution that
 * gates date/time/detailer changes (granted to admin/cashier/super_admin;
 * detailer denied). Service edits are conceptually a "scope mutation"
 * adjacent to reschedule; reusing the key keeps role-defaults aligned
 * without a migration.
 *
 * Notification suppression: this endpoint never sends SMS/email and
 * never fires the `appointment_rescheduled` webhook (consistent with the
 * Item 12 POS reschedule path; operator manages customer comms manually).
 *
 * Cascade rollback strategy: Supabase JS client has no first-class
 * transaction wrapper. We follow the manual rollback pattern used by
 * `/api/pos/jobs/route.ts:381-453` (walk-in creation):
 *
 *   1. Snapshot the pre-edit `appointment_services` rows.
 *   2. Snapshot the pre-edit appointment totals.
 *   3. Snapshot the linked job's `services` JSONB (if any).
 *   4. Delete old appointment_services rows.
 *   5. Insert new ones — on failure, restore the snapshot (step 4 is
 *      reversed) and return 500.
 *   6. Update appointment subtotal/total — on failure, reverse step 5
 *      (delete inserted + re-insert snapshot) and return 500.
 *   7. Update linked job's `services` JSONB if present — on failure,
 *      reverse step 6 (restore old totals) AND step 5 (rebuild
 *      appointment_services) and return 500.
 *
 * Out-of-scope (deferred): editing services on `completed`/`cancelled`
 * appointments — guarded with a 400. The job-level "Edit Services" modal
 * on the POS Jobs card remains the way to mutate `jobs.services` once
 * intake is done; this endpoint is for the pre-completion appointment.
 */

interface ServiceRow {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(
      employee.id,
      'appointments.reschedule'
    );
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = editServicesBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const newServices: EditServicesItem[] = parsed.data.services;

    const supabase = createAdminClient();

    // ---- 1. Fetch the appointment so we know totals + state ----
    //
    // Item 15g Layer 15g-iii: SELECT now includes the per-modifier columns
    // (`coupon_discount`, `loyalty_discount`, `manual_discount_value`) so the
    // recompute can use the canonical sum instead of trusting the combined
    // `discount_amount` (which a separate code path may have drifted). The
    // per-modifier columns themselves stay unwritten by this endpoint — only
    // `subtotal` / `total_amount` / `discount_amount` change.
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select(
        'id, status, subtotal, total_amount, tax_amount, discount_amount, is_mobile, mobile_surcharge, mobile_zone_name_snapshot, coupon_discount, loyalty_discount, manual_discount_value'
      )
      .eq('id', id)
      .single();

    if (apptErr || !appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    if (
      appointment.status === 'completed' ||
      appointment.status === 'cancelled'
    ) {
      return NextResponse.json(
        {
          error: `Cannot edit services on an appointment with status "${appointment.status}"`,
        },
        { status: 400 }
      );
    }

    // ---- 2. Snapshot existing appointment_services rows for rollback ----
    const { data: existingServicesRaw, error: existingErr } = await supabase
      .from('appointment_services')
      .select('id, service_id, price_at_booking, tier_name')
      .eq('appointment_id', id);

    if (existingErr) {
      console.error('Existing services fetch failed:', existingErr.message);
      return NextResponse.json(
        { error: 'Failed to read existing services' },
        { status: 500 }
      );
    }

    const existingServices: ServiceRow[] = (existingServicesRaw ?? []).map(
      (r) => ({
        id: r.id,
        service_id: r.service_id,
        price_at_booking: Number(r.price_at_booking),
        tier_name: r.tier_name,
      })
    );

    // ---- 3. Resolve service names — needed for jobs.services JSONB cascade ----
    const serviceIds = Array.from(new Set(newServices.map((s) => s.service_id)));
    const { data: serviceLookup, error: lookupErr } = await supabase
      .from('services')
      .select('id, name, is_active')
      .in('id', serviceIds);

    if (lookupErr) {
      console.error('Service lookup failed:', lookupErr.message);
      return NextResponse.json(
        { error: 'Failed to validate services' },
        { status: 500 }
      );
    }

    const lookupById = new Map<string, { name: string; is_active: boolean }>();
    for (const row of serviceLookup ?? []) {
      lookupById.set(row.id, { name: row.name, is_active: row.is_active });
    }

    for (const item of newServices) {
      const found = lookupById.get(item.service_id);
      if (!found) {
        return NextResponse.json(
          { error: `Unknown service id ${item.service_id}` },
          { status: 400 }
        );
      }
      if (!found.is_active) {
        return NextResponse.json(
          { error: `Service "${found.name}" is no longer active` },
          { status: 400 }
        );
      }
    }

    // ---- 4. Snapshot the linked job's services JSONB for rollback ----
    const { data: linkedJob } = await supabase
      .from('jobs')
      .select('id, services')
      .eq('appointment_id', id)
      .maybeSingle();

    const linkedJobId: string | null = linkedJob?.id ?? null;
    const linkedJobServicesSnapshot = linkedJob?.services ?? null;

    // ---- 5. Compute new totals ----
    //
    // Item 15g Layer 15g-iii: pass per-modifier values so the helper sums
    // them canonically and `totals.discountAmount` becomes the authoritative
    // combined value we write back. Falls through to the legacy combined
    // `discount_amount` input only when all three are null (i.e., this
    // appointment pre-dates the 15g-ii migration's snapshot writes).
    const totals = computeTotalsForServiceEdit({
      services: newServices.map((s) => ({
        price_at_booking: s.price_at_booking,
      })),
      mobileSurcharge: Number(appointment.mobile_surcharge ?? 0),
      discountAmount: Number(appointment.discount_amount ?? 0),
      taxAmount: Number(appointment.tax_amount ?? 0),
      couponDiscount:
        appointment.coupon_discount != null
          ? Number(appointment.coupon_discount)
          : null,
      loyaltyDiscount:
        appointment.loyalty_discount != null
          ? Number(appointment.loyalty_discount)
          : null,
      manualDiscountValue:
        appointment.manual_discount_value != null
          ? Number(appointment.manual_discount_value)
          : null,
    });

    // ---- 6. Delete old appointment_services rows ----
    const { error: deleteErr } = await supabase
      .from('appointment_services')
      .delete()
      .eq('appointment_id', id);

    if (deleteErr) {
      console.error('Delete existing services failed:', deleteErr.message);
      return NextResponse.json(
        { error: 'Failed to clear existing services' },
        { status: 500 }
      );
    }

    // ---- 7. Insert new appointment_services rows ----
    const insertPayload = newServices.map((s) => ({
      appointment_id: id,
      service_id: s.service_id,
      price_at_booking: s.price_at_booking,
      tier_name: s.tier_name ?? null,
    }));

    const { error: insertErr } = await supabase
      .from('appointment_services')
      .insert(insertPayload);

    if (insertErr) {
      console.error('Insert new services failed:', insertErr.message);
      // Rollback: restore snapshot rows (preserve original ids).
      if (existingServices.length > 0) {
        await supabase.from('appointment_services').insert(
          existingServices.map((s) => ({
            id: s.id,
            appointment_id: id,
            service_id: s.service_id,
            price_at_booking: s.price_at_booking,
            tier_name: s.tier_name,
          }))
        );
      }
      return NextResponse.json(
        { error: 'Failed to add new services' },
        { status: 500 }
      );
    }

    // ---- 8. Update appointment totals ----
    //
    // Item 15g Layer 15g-iii: also write back `discount_amount` so the
    // combined column stays in sync with the per-modifier snapshot. The
    // per-modifier columns (`coupon_discount` / `loyalty_discount` /
    // `manual_discount_value`) are deliberately NOT touched here — they
    // survive the cascade unchanged. Layer 15g-iii's UI surfacing renders
    // off those per-modifier columns, so preserving them is the contract.
    const { error: apptUpdateErr } = await supabase
      .from('appointments')
      .update({
        subtotal: totals.subtotal,
        total_amount: totals.totalAmount,
        discount_amount: totals.discountAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (apptUpdateErr) {
      console.error('Appointment total update failed:', apptUpdateErr.message);
      // Rollback: remove the rows we just inserted, restore the snapshot.
      await supabase
        .from('appointment_services')
        .delete()
        .eq('appointment_id', id);
      if (existingServices.length > 0) {
        await supabase.from('appointment_services').insert(
          existingServices.map((s) => ({
            id: s.id,
            appointment_id: id,
            service_id: s.service_id,
            price_at_booking: s.price_at_booking,
            tier_name: s.tier_name,
          }))
        );
      }
      return NextResponse.json(
        { error: 'Failed to update appointment totals' },
        { status: 500 }
      );
    }

    // ---- 9. Cascade to jobs.services JSONB if a job is linked ----
    if (linkedJobId) {
      const resolved = newServices.map((s) => ({
        service_id: s.service_id,
        service_name: lookupById.get(s.service_id)?.name ?? 'Service',
        price_at_booking: s.price_at_booking,
      }));
      const newJobServices = buildJobServicesJsonb({
        resolved,
        isMobile: appointment.is_mobile,
        mobileSurcharge: Number(appointment.mobile_surcharge ?? 0),
        mobileZoneNameSnapshot: appointment.mobile_zone_name_snapshot,
      });

      const { error: jobUpdateErr } = await supabase
        .from('jobs')
        .update({ services: newJobServices, updated_at: new Date().toISOString() })
        .eq('id', linkedJobId);

      if (jobUpdateErr) {
        console.error(
          `Linked job ${linkedJobId} services sync failed:`,
          jobUpdateErr.message
        );
        // Rollback: restore appointment totals, restore appointment_services
        // rows. Job snapshot is left as-is on the rare failure (best effort)
        // — operator will see a 500 and can retry.
        await supabase
          .from('appointments')
          .update({
            subtotal: Number(appointment.subtotal),
            total_amount: Number(appointment.total_amount),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        await supabase
          .from('appointment_services')
          .delete()
          .eq('appointment_id', id);
        if (existingServices.length > 0) {
          await supabase.from('appointment_services').insert(
            existingServices.map((s) => ({
              id: s.id,
              appointment_id: id,
              service_id: s.service_id,
              price_at_booking: s.price_at_booking,
              tier_name: s.tier_name,
            }))
          );
        }
        return NextResponse.json(
          { error: 'Failed to sync linked job services' },
          { status: 500 }
        );
      }
    }

    // ---- 10. Audit log ----
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
        field: 'services',
        before: existingServices.map((s) => ({
          service_id: s.service_id,
          price_at_booking: s.price_at_booking,
          tier_name: s.tier_name,
        })),
        after: newServices.map((s) => ({
          service_id: s.service_id,
          price_at_booking: s.price_at_booking,
          tier_name: s.tier_name ?? null,
        })),
        subtotal_before: Number(appointment.subtotal),
        subtotal_after: totals.subtotal,
        total_before: Number(appointment.total_amount),
        total_after: totals.totalAmount,
        cascaded_to_job_id: linkedJobId,
        notification_suppressed: true,
      },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    // ---- 11. Re-fetch + return ----
    const { data: refreshed, error: refreshErr } = await supabase
      .from('appointments')
      .select(`
        id, status, subtotal, total_amount, tax_amount, discount_amount,
        is_mobile, mobile_surcharge, mobile_zone_name_snapshot,
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
      `)
      .eq('id', id)
      .single();

    if (refreshErr || !refreshed) {
      // Update succeeded; selecting back failed. Return totals + a marker
      // so the UI can refetch on its own.
      return NextResponse.json({
        data: {
          id,
          subtotal: totals.subtotal,
          total_amount: totals.totalAmount,
        },
        cascaded_to_job_id: linkedJobId,
      });
    }

    // Use snapshot snapshot for fallback — _ marker to satisfy lint without
    // changing public response shape.
    void linkedJobServicesSnapshot;

    return NextResponse.json({
      data: refreshed,
      cascaded_to_job_id: linkedJobId,
    });
  } catch (err) {
    console.error('Appointment services PUT error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
