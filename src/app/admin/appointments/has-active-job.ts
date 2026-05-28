import type { AppointmentWithRelations } from '@/lib/appointments/types';

// Item 15e Phase 2C-β-2 / Session #110: derive `has_active_job` from the joined
// `jobs` relation so the Appointment dialog Save intercept knows whether
// reverting an earlier status should un-materialize the job. Mirrors the
// canonical terminal set in `lifecycle-sync.ts` (TERMINAL_JOB_STATUSES). The raw
// `jobs` value (used only for this derivation) is discarded so it never leaks
// into the dialog.
//
// Extracted from `page.tsx` (Session #110): Next.js page files may only export
// the default component + reserved fields, so a named `withHasActiveJob` export
// broke the build — it lives here instead and is imported by the page.
//
// Cardinality: `jobs.appointment_id` has a UNIQUE constraint (migration
// 20260329000002), so Supabase/PostgREST infers 1:1 and returns the embedded
// `jobs` relation as a SINGLE OBJECT `{id, status}` (or null) — NOT an array.
// `asRelationArray` normalizes the legitimate shapes before iterating, fixing
// the production "(intermediate value).some is not a function" crash. See
// CLAUDE.md "Supabase relation cardinality".
const TERMINAL_JOB_STATUSES = ['completed', 'closed', 'cancelled'];

/** Normalize a Supabase embedded relation that may be returned as a single
 *  object (1:1 / UNIQUE-FK inference), null, or an array, into an array. */
export function asRelationArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return [];
  return [value as T];
}

export function withHasActiveJob(rows: unknown[]): AppointmentWithRelations[] {
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const jobs = asRelationArray<{ status: string }>(row.jobs);
    const hasActiveJob = jobs.some((j) => !TERMINAL_JOB_STATUSES.includes(j.status));
    const { jobs: _drop, ...rest } = row;
    void _drop;
    return { ...rest, has_active_job: hasActiveJob } as unknown as AppointmentWithRelations;
  });
}
