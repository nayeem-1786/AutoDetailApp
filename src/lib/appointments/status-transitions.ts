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
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
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
