/**
 * Canonical cancellation-reason chip set — Session #147 Commit B extraction.
 *
 * Originally a module-local const inside
 * `src/app/pos/jobs/components/job-detail.tsx` (the job-cancel modal). Moved
 * here so the new CancelAppointmentDialog chip pattern (both Mode A and
 * Mode B per the locked design) and the existing job-cancel modal both
 * source from a single location.
 *
 * The five-option set + `'Other'` fallback is the operator-validated proven
 * UX from daily job-cancel use. Adding/removing/renaming options here
 * propagates to every surface that reads from this module.
 *
 * `Other` MUST stay last (UI expects it as the trailing option so the
 * conditional textarea fallback renders below the chip list). The
 * `isOtherReason` helper is the canonical predicate — never compare to the
 * literal string at call sites.
 */

export const CANCELLATION_REASONS = [
  'Customer no-show',
  'Created by mistake',
  'Customer changed mind',
  'Schedule conflict',
  'Other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** True when the operator selected the free-text fallback chip. */
export function isOtherReason(reason: string | null | undefined): boolean {
  return reason === 'Other';
}
