/**
 * Item 15f Phase 1 Layer 8a — shared cascade helper for editing the
 * service list on an appointment.
 *
 * Extracted from the inline body of
 * `src/app/api/admin/appointments/[id]/services/route.ts` (Item 15a) so the
 * SAME cascade behavior can be invoked from both the admin route and the
 * new POS-authed variant (`/api/pos/appointments/[id]/services`). The
 * routes become thin auth + response-shaping wrappers; this module owns:
 *
 *   - Zod validation (`editServicesBodySchema`).
 *   - Pre-edit snapshots (appointment, appointment_services, jobs.services).
 *   - Service-lookup validation (unknown / inactive guards).
 *   - Total recompute via the canonical `computeTotalsForServiceEdit`
 *     helper (Item 15g Layer 15g-iii: passes per-modifier columns so the
 *     cascade preserves coupon / loyalty / manual discount).
 *   - Atomic-ish cascade with manual rollback (Supabase JS has no first-class
 *     transaction wrapper; the rollback pattern mirrors
 *     `/api/pos/jobs/route.ts:381-453`).
 *   - Audit log emission (`source` tag distinguishes admin vs POS callers).
 *   - Final re-fetch + cascaded_to_job_id reporting.
 *
 * Auth is the caller's responsibility — this module is auth-agnostic. It
 * accepts an `actor` describing who initiated the edit (for the audit row)
 * and a `source` flag for the audit `source` column. The admin route gates
 * on `appointments.reschedule`; the POS route gates on `pos.jobs.manage`
 * (per audit §6).
 *
 * Notification suppression is inherited from Item 15a: this code path
 * NEVER fires SMS / email / `appointment_rescheduled` webhooks. The audit
 * row is tagged `notification_suppressed: true`.
 *
 * Errors are surfaced as `ServiceEditError` with a `code` + `httpStatus`
 * the route layer maps to a NextResponse. Unknown errors bubble (route
 * catches as 500).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/services/audit';
import {
  editServicesBodySchema,
  buildJobServicesJsonb,
  computeTotalsForServiceEdit,
  type EditServicesItem,
} from './edit-services';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Identity of the person making the edit. Both admin and POS auth paths
 * resolve to the same employee shape under different field names; the
 * route normalizes to this interface before calling the helper.
 */
export interface ServiceEditActor {
  /** `employees.id` UUID — same in both admin (`employee.id`) and POS (`posEmployee.employee_id`) callers. */
  employeeId: string;
  /** `auth.users.id` UUID. */
  authUserId: string;
  /** Display email. May be null on some legacy POS sessions. */
  email: string | null;
  /** Full display name "First Last" or null when both halves are missing. */
  name: string | null;
}

/** Distinguishes the audit row's `source` column. */
export type ServiceEditSource = 'admin' | 'pos';

export interface EditAppointmentServicesInput {
  appointmentId: string;
  /** Raw JSON body — validated by `editServicesBodySchema` inside the helper. */
  body: unknown;
  actor: ServiceEditActor;
  source: ServiceEditSource;
  /** Client IP address for the audit row. Null when not available. */
  ipAddress: string | null;
}

export interface EditAppointmentServicesResult {
  /**
   * Refreshed appointment row with joined `appointment_services` + nested
   * `service` rows. On the rare re-fetch failure path, falls back to a slim
   * `{ id, subtotal, total_amount }` shape so the UI can re-query on its own.
   */
  data: unknown;
  /** ID of the linked job row whose `services` JSONB was cascaded, or null when no job is linked yet. */
  cascadedToJobId: string | null;
}

/**
 * Error codes emitted by the helper. The route layer maps these to HTTP
 * status codes via `ServiceEditError.httpStatus`.
 */
export type ServiceEditErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'INVALID_STATUS'
  | 'UNKNOWN_SERVICE'
  | 'INACTIVE_SERVICE'
  | 'CASCADE_FAILED';

export class ServiceEditError extends Error {
  readonly code: ServiceEditErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(
    code: ServiceEditErrorCode,
    httpStatus: number,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ServiceEditError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Internal types — pre-edit snapshots used for rollback
// ---------------------------------------------------------------------------

interface ServiceRow {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
}

interface AppointmentRow {
  id: string;
  status: string;
  subtotal: number | string;
  total_amount: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  is_mobile: boolean;
  mobile_surcharge: number | string | null;
  mobile_zone_name_snapshot: string | null;
  coupon_discount: number | string | null;
  loyalty_discount: number | string | null;
  manual_discount_value: number | string | null;
}

// ---------------------------------------------------------------------------
// editAppointmentServices — the cascade
// ---------------------------------------------------------------------------

export async function editAppointmentServices(
  supabase: SupabaseClient,
  input: EditAppointmentServicesInput
): Promise<EditAppointmentServicesResult> {
  // ---- 0. Validate input ----
  const parsed = editServicesBodySchema.safeParse(input.body);
  if (!parsed.success) {
    throw new ServiceEditError(
      'INVALID_INPUT',
      400,
      'Invalid data',
      parsed.error.flatten()
    );
  }
  const newServices: EditServicesItem[] = parsed.data.services;
  const id = input.appointmentId;

  // ---- 1. Fetch the appointment so we know totals + state ----
  //
  // Item 15g Layer 15g-iii: SELECT includes the per-modifier columns
  // (`coupon_discount`, `loyalty_discount`, `manual_discount_value`) so the
  // recompute can use the canonical sum instead of trusting the combined
  // `discount_amount` (which a separate code path may have drifted). The
  // per-modifier columns themselves stay unwritten by this endpoint — only
  // `subtotal` / `total_amount` / `discount_amount` change.
  const { data: appointmentRaw, error: apptErr } = await supabase
    .from('appointments')
    .select(
      'id, status, subtotal, total_amount, tax_amount, discount_amount, is_mobile, mobile_surcharge, mobile_zone_name_snapshot, coupon_discount, loyalty_discount, manual_discount_value'
    )
    .eq('id', id)
    .single();

  if (apptErr || !appointmentRaw) {
    throw new ServiceEditError('NOT_FOUND', 404, 'Appointment not found');
  }
  const appointment = appointmentRaw as AppointmentRow;

  if (
    appointment.status === 'completed' ||
    appointment.status === 'cancelled'
  ) {
    throw new ServiceEditError(
      'INVALID_STATUS',
      400,
      `Cannot edit services on an appointment with status "${appointment.status}"`
    );
  }

  // ---- 2. Snapshot existing appointment_services rows for rollback ----
  const { data: existingServicesRaw, error: existingErr } = await supabase
    .from('appointment_services')
    .select('id, service_id, price_at_booking, tier_name')
    .eq('appointment_id', id);

  if (existingErr) {
    console.error('Existing services fetch failed:', existingErr.message);
    throw new ServiceEditError(
      'CASCADE_FAILED',
      500,
      'Failed to read existing services'
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
    throw new ServiceEditError(
      'CASCADE_FAILED',
      500,
      'Failed to validate services'
    );
  }

  const lookupById = new Map<string, { name: string; is_active: boolean }>();
  for (const row of serviceLookup ?? []) {
    lookupById.set(row.id, { name: row.name, is_active: row.is_active });
  }

  for (const item of newServices) {
    const found = lookupById.get(item.service_id);
    if (!found) {
      throw new ServiceEditError(
        'UNKNOWN_SERVICE',
        400,
        `Unknown service id ${item.service_id}`
      );
    }
    if (!found.is_active) {
      throw new ServiceEditError(
        'INACTIVE_SERVICE',
        400,
        `Service "${found.name}" is no longer active`
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
  void linkedJob?.services; // snapshot reference retained for future rollback symmetry

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
    throw new ServiceEditError(
      'CASCADE_FAILED',
      500,
      'Failed to clear existing services'
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
    throw new ServiceEditError(
      'CASCADE_FAILED',
      500,
      'Failed to add new services'
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
    await rollbackAppointmentServices(supabase, id, existingServices);
    throw new ServiceEditError(
      'CASCADE_FAILED',
      500,
      'Failed to update appointment totals'
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
      await rollbackAppointmentServices(supabase, id, existingServices);
      throw new ServiceEditError(
        'CASCADE_FAILED',
        500,
        'Failed to sync linked job services'
      );
    }
  }

  // ---- 10. Audit log ----
  //
  // Source-tagged so admin and POS edits are distinguishable in the audit
  // trail. `notification_suppressed: true` mirrors Item 15a's contract —
  // this endpoint never fires SMS / email / webhooks.
  logAudit({
    userId: input.actor.authUserId,
    userEmail: input.actor.email,
    employeeName: input.actor.name,
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
    ipAddress: input.ipAddress ?? '',
    source: input.source,
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
    // Update succeeded; selecting back failed. Return totals + a marker so
    // the UI can refetch on its own.
    return {
      data: {
        id,
        subtotal: totals.subtotal,
        total_amount: totals.totalAmount,
      },
      cascadedToJobId: linkedJobId,
    };
  }

  return { data: refreshed, cascadedToJobId: linkedJobId };
}

// ---------------------------------------------------------------------------
// Helper: rollback appointment_services to a snapshot
// ---------------------------------------------------------------------------

async function rollbackAppointmentServices(
  supabase: SupabaseClient,
  appointmentId: string,
  snapshot: ServiceRow[]
): Promise<void> {
  await supabase
    .from('appointment_services')
    .delete()
    .eq('appointment_id', appointmentId);
  if (snapshot.length > 0) {
    await supabase.from('appointment_services').insert(
      snapshot.map((s) => ({
        id: s.id,
        appointment_id: appointmentId,
        service_id: s.service_id,
        price_at_booking: s.price_at_booking,
        tier_name: s.tier_name,
      }))
    );
  }
}
