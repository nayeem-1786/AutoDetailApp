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
import type { AppointmentStatus } from '@/lib/supabase/types';
import {
  editServicesBodySchema,
  buildJobServicesJsonb,
  computeTotalsForServiceEdit,
  type EditServicesItem,
} from './edit-services';
import { isServiceEditableStatus } from './status-transitions';

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
  // Item 15f Phase 1 Layer 8c: read coupon_code + loyalty_points_redeemed +
  // manual_discount_label too so the audit-log "before" snapshot is complete.
  coupon_code: string | null;
  coupon_discount: number | string | null;
  loyalty_points_redeemed: number | string | null;
  loyalty_discount: number | string | null;
  manual_discount_value: number | string | null;
  manual_discount_label: string | null;
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

  // ---- 0a. Modifier-edit payload (Item 15f Phase 1 Layer 8c) ----
  //
  // `.optional().nullable()` means three states per field:
  //   - field omitted  → preserve appointment's existing column value
  //   - field = null   → clear the column (write null)
  //   - field = value  → write the value
  //
  // The cascade endpoint NEVER touches `customers.loyalty_points_balance`,
  // `loyalty_ledger`, or `coupons.use_count`. Pre-transaction modifier edits
  // are snapshot-only per `docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md`
  // §3 — the actual customer-state writes happen at transaction commit, not
  // here. This invariant is the reason "remove loyalty redemption" doesn't
  // require restoration logic in this code path.
  const modifierEdit = {
    couponCodeProvided: 'coupon_code' in parsed.data,
    couponDiscountProvided: 'coupon_discount' in parsed.data,
    loyaltyPointsProvided: 'loyalty_points_to_redeem' in parsed.data,
    loyaltyDiscountProvided: 'loyalty_discount' in parsed.data,
    manualValueProvided: 'manual_discount_value' in parsed.data,
    manualLabelProvided: 'manual_discount_label' in parsed.data,
    couponCode: parsed.data.coupon_code ?? null,
    couponDiscount: parsed.data.coupon_discount ?? null,
    loyaltyPoints: parsed.data.loyalty_points_to_redeem ?? null,
    loyaltyDiscount: parsed.data.loyalty_discount ?? null,
    manualValue: parsed.data.manual_discount_value ?? null,
    manualLabel: parsed.data.manual_discount_label ?? null,
  };
  const anyModifierEdit =
    modifierEdit.couponCodeProvided ||
    modifierEdit.couponDiscountProvided ||
    modifierEdit.loyaltyPointsProvided ||
    modifierEdit.loyaltyDiscountProvided ||
    modifierEdit.manualValueProvided ||
    modifierEdit.manualLabelProvided;

  // ---- 1. Fetch the appointment so we know totals + state ----
  //
  // Item 15g Layer 15g-iii: SELECT includes the per-modifier columns
  // (`coupon_discount`, `loyalty_discount`, `manual_discount_value`) so the
  // recompute can use the canonical sum instead of trusting the combined
  // `discount_amount` (which a separate code path may have drifted).
  //
  // Item 15f Phase 1 Layer 8c: SELECT widened to include `coupon_code`,
  // `loyalty_points_redeemed`, `manual_discount_label` so the audit "before"
  // snapshot is complete when modifier edits are accepted. When the payload
  // includes new modifier values, the appointment UPDATE writes them; when
  // omitted, the existing column value carries through unchanged (Layer
  // 15g-iii preservation contract).
  const { data: appointmentRaw, error: apptErr } = await supabase
    .from('appointments')
    .select(
      'id, status, subtotal, total_amount, tax_amount, discount_amount, is_mobile, mobile_surcharge, mobile_zone_name_snapshot, coupon_code, coupon_discount, loyalty_points_redeemed, loyalty_discount, manual_discount_value, manual_discount_label'
    )
    .eq('id', id)
    .single();

  if (apptErr || !appointmentRaw) {
    throw new ServiceEditError('NOT_FOUND', 404, 'Appointment not found');
  }
  const appointment = appointmentRaw as AppointmentRow;

  // Item 15f Phase 1 Layer 8d-bis (Audit Finding #5): refuse terminal
  // statuses — `completed` / `cancelled` / `no_show`. Lockstep with the
  // load endpoint (`src/app/api/pos/appointments/[id]/load/route.ts`) AND
  // the dialog's "Edit in POS" render gate via the shared predicate in
  // `status-transitions.ts` (single source of truth).
  // `appointment.status` is typed as `string` on AppointmentRow (loose DB
  // row shape); cast to the narrow union to satisfy the predicate. Any
  // out-of-union value would fail the check anyway (predicate returns
  // false on a status not in the editable set).
  if (!isServiceEditableStatus(appointment.status as AppointmentStatus)) {
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

  // ---- 5. Resolve effective modifier values for totals + write ----
  //
  // For each modifier column, decide which value to use:
  //   - Payload provided a value (including `null`) → use payload value
  //   - Payload omitted the field → use the appointment's existing column
  //
  // The result is fed to `computeTotalsForServiceEdit` so the recomputed
  // `discount_amount` + `total_amount` honor the operator's edits. The same
  // effective values are also written back to the appointment row in step 8
  // for the columns the payload explicitly touched.
  const effectiveCouponDiscount = modifierEdit.couponDiscountProvided
    ? modifierEdit.couponDiscount
    : appointment.coupon_discount != null
      ? Number(appointment.coupon_discount)
      : null;
  const effectiveLoyaltyDiscount = modifierEdit.loyaltyDiscountProvided
    ? modifierEdit.loyaltyDiscount
    : appointment.loyalty_discount != null
      ? Number(appointment.loyalty_discount)
      : null;
  const effectiveManualValue = modifierEdit.manualValueProvided
    ? modifierEdit.manualValue
    : appointment.manual_discount_value != null
      ? Number(appointment.manual_discount_value)
      : null;

  // Item 15g Layer 15g-iii / Item 15f Phase 1 Layer 8c: pass per-modifier
  // values so the helper sums them canonically and `totals.discountAmount`
  // becomes the authoritative combined value we write back. Edit payload
  // overrides take precedence; omitted modifiers fall through to existing
  // appointment values.
  //
  // Layer 8c subtlety: `computeTotalsForServiceEdit` falls back to the
  // helper's `discountAmount` input when ALL three per-modifier values
  // are null. That's correct for the legacy 15g-iii "services-only edit
  // on a pre-15g-ii row" case (appointment's per-modifier cols are null
  // but the legacy combined `discount_amount` is non-zero). But when the
  // operator explicitly cleared every modifier (making each effective
  // value null), the resulting discount should be 0 — not the stale
  // pre-edit legacy combined value. We feed `0` to the fallback when
  // `anyModifierEdit` is true, so the cleared state surfaces correctly.
  const totals = computeTotalsForServiceEdit({
    services: newServices.map((s) => ({
      price_at_booking: s.price_at_booking,
    })),
    mobileSurcharge: Number(appointment.mobile_surcharge ?? 0),
    discountAmount: anyModifierEdit
      ? 0
      : Number(appointment.discount_amount ?? 0),
    taxAmount: Number(appointment.tax_amount ?? 0),
    couponDiscount: effectiveCouponDiscount,
    loyaltyDiscount: effectiveLoyaltyDiscount,
    manualDiscountValue: effectiveManualValue,
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

  // ---- 8. Update appointment totals + (optionally) modifier columns ----
  //
  // Item 15g Layer 15g-iii: writes back `discount_amount` so the combined
  // column stays in sync with the per-modifier snapshot. When the payload
  // does NOT touch a modifier, its column carries through unchanged
  // (preservation contract).
  //
  // Item 15f Phase 1 Layer 8c: when the payload DOES touch a modifier (via
  // `modifierEdit.*Provided` checks above), the column is written —
  // including writing `null` to clear it. This is the entire mutation
  // surface for modifier edits; per the loyalty reversibility audit, no
  // customer-balance or ledger writes happen here.
  const apptUpdatePayload: Record<string, unknown> = {
    subtotal: totals.subtotal,
    total_amount: totals.totalAmount,
    discount_amount: totals.discountAmount,
    updated_at: new Date().toISOString(),
  };
  if (modifierEdit.couponCodeProvided) {
    apptUpdatePayload.coupon_code = modifierEdit.couponCode;
  }
  if (modifierEdit.couponDiscountProvided) {
    apptUpdatePayload.coupon_discount = modifierEdit.couponDiscount;
  }
  if (modifierEdit.loyaltyPointsProvided) {
    // Schema column is `loyalty_points_redeemed`; payload field is
    // `loyalty_points_to_redeem` to mirror the booking-wizard naming. Map
    // here. INTEGER NOT NULL DEFAULT 0 — when clearing, write 0 (the
    // schema doesn't allow null per the booking-wizard contract).
    apptUpdatePayload.loyalty_points_redeemed = modifierEdit.loyaltyPoints ?? 0;
  }
  if (modifierEdit.loyaltyDiscountProvided) {
    // Schema column is NUMERIC NOT NULL DEFAULT 0. Same null→0 mapping.
    apptUpdatePayload.loyalty_discount = modifierEdit.loyaltyDiscount ?? 0;
  }
  if (modifierEdit.manualValueProvided) {
    apptUpdatePayload.manual_discount_value = modifierEdit.manualValue;
  }
  if (modifierEdit.manualLabelProvided) {
    apptUpdatePayload.manual_discount_label = modifierEdit.manualLabel;
  }

  const { error: apptUpdateErr } = await supabase
    .from('appointments')
    .update(apptUpdatePayload)
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
  //
  // Item 15f Phase 1 Layer 8c: `field` becomes `services_and_modifiers`
  // when the payload includes modifier edits (otherwise stays `services`
  // for back-compat with existing audit consumers / dashboards). The
  // `modifiers_before` / `modifiers_after` slices are present only when
  // any modifier field was provided so services-only edits don't pollute
  // the audit payload with constant six-key noise.
  const modifiersBefore = anyModifierEdit
    ? {
        coupon_code: appointment.coupon_code,
        coupon_discount:
          appointment.coupon_discount != null
            ? Number(appointment.coupon_discount)
            : null,
        loyalty_points_redeemed:
          appointment.loyalty_points_redeemed != null
            ? Number(appointment.loyalty_points_redeemed)
            : null,
        loyalty_discount:
          appointment.loyalty_discount != null
            ? Number(appointment.loyalty_discount)
            : null,
        manual_discount_value:
          appointment.manual_discount_value != null
            ? Number(appointment.manual_discount_value)
            : null,
        manual_discount_label: appointment.manual_discount_label,
      }
    : undefined;
  const modifiersAfter = anyModifierEdit
    ? {
        coupon_code: modifierEdit.couponCodeProvided
          ? modifierEdit.couponCode
          : appointment.coupon_code,
        coupon_discount: modifierEdit.couponDiscountProvided
          ? modifierEdit.couponDiscount
          : appointment.coupon_discount != null
            ? Number(appointment.coupon_discount)
            : null,
        loyalty_points_redeemed: modifierEdit.loyaltyPointsProvided
          ? modifierEdit.loyaltyPoints ?? 0
          : appointment.loyalty_points_redeemed != null
            ? Number(appointment.loyalty_points_redeemed)
            : null,
        loyalty_discount: modifierEdit.loyaltyDiscountProvided
          ? modifierEdit.loyaltyDiscount ?? 0
          : appointment.loyalty_discount != null
            ? Number(appointment.loyalty_discount)
            : null,
        manual_discount_value: modifierEdit.manualValueProvided
          ? modifierEdit.manualValue
          : appointment.manual_discount_value != null
            ? Number(appointment.manual_discount_value)
            : null,
        manual_discount_label: modifierEdit.manualLabelProvided
          ? modifierEdit.manualLabel
          : appointment.manual_discount_label,
      }
    : undefined;

  logAudit({
    userId: input.actor.authUserId,
    userEmail: input.actor.email,
    employeeName: input.actor.name,
    action: 'update',
    entityType: 'booking',
    entityId: id,
    entityLabel: `Appointment #${id.slice(0, 8)}`,
    details: {
      field: anyModifierEdit ? 'services_and_modifiers' : 'services',
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
      ...(modifiersBefore !== undefined && { modifiers_before: modifiersBefore }),
      ...(modifiersAfter !== undefined && { modifiers_after: modifiersAfter }),
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
