import type { AppointmentStatus } from '@/lib/supabase/types';

/**
 * Valid next-states for each appointment status.
 *
 * Pure data with zero UI-context coupling — shared between the admin
 * Appointment detail dialog and the POS Schedule-scope detail dialog
 * (Item 15e Phase 2). The admin `appointments/types.ts` re-exports this
 * for backward compatibility, so existing admin importers need no edits.
 *
 * The map drives the dialog's "recommended" vs "override" status option
 * groups and is enforced server-side by both the admin PATCH
 * (`/api/appointments/[id]`) and the POS PATCH (`/api/pos/appointments/[id]`).
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // Session 1.4 — 2 SAFE transitions opened per AC-5 (consequence map
  // d3671c82 Target E.1): `pending → in_progress` and `in_progress → no_show`.
  // No PATCH-side webhook fires for `in_progress` or `no_show`, and no
  // cron/reminder eligibility flip requires a compensating cascade.
  //
  // Session 1.5 — 2 BACKWARD-REVERT transitions opened per AC-5 (consequence
  // map d3671c82 Target E.3 + state machine audit b0efd95f Q1):
  // `confirmed → pending` (operator-reported error #1) and
  // `in_progress → pending`. These two are the "with cascade" half of AC-5's
  // "2 SAFE + 2 with cascade" — both POS and admin PATCH endpoints invoke
  // `executeUnMaterialize` from `lifecycle-sync.ts` before completing the
  // status revert when a materialized job exists. The cascade's ordering
  // invariant (appointment status → pending FIRST, then DELETE job) is
  // documented at `executeUnMaterialize` lines 197-202 and guarantees the
  // dangerous "materializable appointment + absent job" state never exists,
  // so the populate endpoint cannot re-materialize a half-deleted pair.
  //
  // Admin/POS symmetry (AC-5 commitment): both PATCH endpoints share this
  // map AND share the cascade. The admin PATCH was previously permissive
  // (no STATUS_TRANSITIONS guard at all); Session 1.5 added the guard to
  // close that asymmetry alongside the cascade wiring.
  pending: ['confirmed', 'in_progress', 'cancelled', 'no_show'],
  confirmed: ['pending', 'in_progress', 'cancelled', 'no_show'],
  in_progress: ['pending', 'completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/**
 * Statuses whose services CANNOT be edited via the shared cascade helper.
 * Single source of truth — used by both the server cascade
 * (`lib/appointments/service-edit.ts`) and the client "Edit in POS" render
 * gate (`appointment-detail-dialog.tsx`'s `canEditServices`). The set
 * mirrors the load-endpoint refusal at
 * `src/app/api/pos/appointments/[id]/load/route.ts` so all three surfaces
 * stay lockstep (per Item 15f Phase 1 Layer 8d-bis Audit Finding #5).
 * Per the appointment + job status flow audit (2026-05-17) §6.4,
 * `no_show` is terminal — the customer didn't arrive, so editing
 * services is semantically nonsensical.
 */
export const SERVICE_EDIT_TERMINAL_STATUSES: ReadonlyArray<AppointmentStatus> = [
  'completed',
  'cancelled',
  'no_show',
];

/** True when the appointment's services may be edited (status is not terminal). */
export function isServiceEditableStatus(status: AppointmentStatus): boolean {
  return !SERVICE_EDIT_TERMINAL_STATUSES.includes(status);
}
