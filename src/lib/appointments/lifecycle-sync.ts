import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentStatus, JobStatus } from '@/lib/supabase/types';
import { logAudit } from '@/lib/services/audit';

/**
 * Appointment ↔ Job lifecycle-sync seam (Item 15e Phase 2C).
 *
 * This module is the canonical entry point for reconciling the two status
 * fields that describe one entity: `appointments.status` (lifecycle axis) and
 * `jobs.status` (operational axis). The Phase 2 follow-up audit
 * (docs/dev/ITEM_15E_PHASE_2_STATUS_SYNC_AUDIT.md) established that these fields
 * are NOT mirror images — the mapping is directional and lossy — and that the
 * full bidirectional sync is its own scoped work (Path B / Item 15h).
 *
 * **Phase 2C implements exactly ONE action: `delete_job` (un-materialize).**
 * It is the `confirmed/in_progress → pending` reverse edge: when an operator
 * reverts an appointment to `pending` and a job has already been materialized,
 * the job row is hard-deleted (Option B) and the appointment is reverted to
 * `pending`. Endpoints MUST go through `executeUnMaterialize` rather than
 * issuing `DELETE FROM jobs` directly — this is the seam Item 15h extends with
 * the remaining forward cases (`materialize`, `set_job_status`) and the reverse
 * mapping (`appointmentStatusForJobStatus`).
 *
 * LOAD-BEARING re-materialization invariant: `populate`
 * (`/api/pos/jobs/populate`) materializes appointments whose status is
 * `confirmed` or `in_progress` and dedups on the UNIQUE `jobs.appointment_id`.
 * Therefore un-materialize MUST leave the appointment in a NON-materializing
 * status (`pending`). `executeUnMaterialize` guarantees this by writing the
 * appointment status FIRST, then deleting the job (see ordering note there) —
 * so even without a multi-statement DB transaction, the dangerous state
 * (materializable appointment + absent job) never exists.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Forward mapping (appointment.status change → job action)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The action the forward sync can take on the linked job. Phase 2C uses only
 * `none` and `delete_job`. Item 15h will add `materialize` and
 * `set_job_status` (and a parallel `appointmentStatusForJobStatus` for the
 * reverse direction). New cases must be ADDED here without changing the meaning
 * of the existing ones.
 */
export type LifecycleSyncAction =
  | { kind: 'none' }
  | { kind: 'delete_job'; reason: 'un_materialize' };

/**
 * Forward sync: given an appointment's NEW status, the linked job's current
 * status, and whether a job exists, decide what should happen to the job.
 *
 * Phase 2C scope: only the un-materialize case (revert to `pending` with an
 * existing job) returns an action; everything else is `none` (Item 15h fills in
 * the rest). This deliberately covers the walk-in pairing (synthetic
 * `in_progress` appointment + `scheduled` job): a walk-in is never reverted to
 * `pending` by this path, so it returns `none` and is left untouched.
 */
export function jobStatusForAppointmentStatus(
  newApptStatus: AppointmentStatus,
  currentJobStatus: JobStatus | null,
  hasJob: boolean
): LifecycleSyncAction {
  if (!hasJob || currentJobStatus === null) return { kind: 'none' };

  if (newApptStatus === 'pending') {
    return { kind: 'delete_job', reason: 'un_materialize' };
  }

  // All other transitions are Item 15h territory.
  return { kind: 'none' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle ordering helper (used by the admin Save intercept in Phase 2C-β)
// ─────────────────────────────────────────────────────────────────────────────

// Lifecycle rank along the forward (pending → completed) axis. Only the
// "forward" appointment states are ranked; `cancelled` / `no_show` are NOT
// earlier-state reverts (they have their own flows) and are excluded.
const APPT_LIFECYCLE_RANK: Partial<Record<AppointmentStatus, number>> = {
  pending: 0,
  confirmed: 1,
  in_progress: 2,
  completed: 3,
};

/**
 * Is `newStatus` an EARLIER lifecycle state than `currentStatus` (a backward
 * revert)? Used by the admin dialog to decide whether a Save is an
 * un-materialize candidate. Returns false for `cancelled`/`no_show` (not ranked
 * — those route through the cancel flow, not un-materialize) and for forward or
 * same-state moves.
 */
export function isEarlierState(
  newStatus: AppointmentStatus,
  currentStatus: AppointmentStatus
): boolean {
  const a = APPT_LIFECYCLE_RANK[newStatus];
  const b = APPT_LIFECYCLE_RANK[currentStatus];
  if (a === undefined || b === undefined) return false;
  return a < b;
}

// ─────────────────────────────────────────────────────────────────────────────
// Un-materialize executor
// ─────────────────────────────────────────────────────────────────────────────

// Jobs at/after this point on the operational axis require an explicit
// type-to-confirm ("DELETE") before un-materialize. `scheduled` / `intake` are
// below the threshold (free, after a standard UI confirm).
const CONFIRM_REQUIRED_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'in_progress',
  'pending_approval',
]);

// Terminal job states cannot be un-materialized at all: `completed`/`closed`
// carry finished work (and typically a transaction), and `cancelled` means the
// appointment is already cancelled — reverting to `pending` is meaningless.
const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'closed',
  'cancelled',
]);

const JOB_PHOTOS_BUCKET = 'job-photos';

export type UnMaterializeError =
  | 'not_found'
  | 'transaction_linked'
  | 'terminal'
  | 'confirm_required'
  | 'unknown';

/** Enumeration of the data that un-materialize will (or would) delete. Returned
 *  on the `confirm_required` path so the UI can render an accurate modal, and on
 *  success so the caller can report what was removed. */
export interface UnMaterializeData {
  jobId: string;
  jobStatus: JobStatus;
  photoCount: number;
  addonCount: number;
  timerSeconds: number;
  hasIntakeNotes: boolean;
  /** True when this job's status is at/above the type-to-confirm threshold. */
  confirmRequired: boolean;
}

export interface UnMaterializeResult {
  ok: boolean;
  /** HTTP status the endpoint should return directly. */
  httpStatus: number;
  error?: UnMaterializeError;
  /** Data enumeration — present on `confirm_required` and on success. */
  data?: UnMaterializeData;
  deletedPhotos?: number;
  deletedAddons?: number;
  storageFilesDeleted?: number;
}

export interface UnMaterializeActor {
  userId: string | null;
  userEmail: string | null;
  employeeName: string | null;
}

export interface UnMaterializeOptions {
  /** Required for jobs at/above the confirm threshold. Must equal exactly
   *  "DELETE" (case-sensitive) for the operation to proceed. */
  confirmString?: string;
  actor: UnMaterializeActor;
  source: 'admin' | 'pos';
  ipAddress: string | null;
}

/**
 * Atomically un-materialize the job linked to `appointmentId` and revert the
 * appointment to `pending`. The canonical implementation of the
 * `delete_job` action.
 *
 * Flow:
 *  1. Load the appointment + its job (by `appointment_id`) + photo/addon counts
 *     + the job's storage paths. 404 if either is missing (there is nothing to
 *     un-materialize without a job — a plain status edit goes through PATCH).
 *  2. Guard `transaction_linked` (409) when `jobs.transaction_id IS NOT NULL`:
 *     money is attached; deleting the job would orphan the transaction link.
 *  3. Guard `terminal` (409) for completed/closed/cancelled jobs.
 *  4. Guard `confirm_required` (422, WITH the data enumeration) when the job is
 *     at/above the confirm threshold and `confirmString !== "DELETE"`.
 *  5. **Ordering (the re-materialization invariant): UPDATE the appointment to
 *     `pending` FIRST, then DELETE the job.** Supabase JS has no multi-statement
 *     transaction, but this ordering makes the invariant hold regardless: the
 *     only unsafe state is "materializable appointment + absent job", which this
 *     order never produces. A failed DELETE after a successful UPDATE leaves the
 *     benign, recoverable `pending`+job state (never re-materialization).
 *  6. Best-effort Storage cleanup of `job_photos` objects (main + `_thumb`).
 *     Failures are logged, NOT rolled back (DB is already consistent).
 *  7. Fire-and-forget audit row (`action: 'delete'`, `entityType: 'job'`,
 *     `details.reason: 'un_materialize'`, `previous_job_status`). No webhooks.
 */
export async function executeUnMaterialize(
  supabase: SupabaseClient,
  appointmentId: string,
  options: UnMaterializeOptions
): Promise<UnMaterializeResult> {
  try {
    // 1a. Appointment must exist.
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('id', appointmentId)
      .single();

    if (apptErr || !appt) {
      return { ok: false, httpStatus: 404, error: 'not_found' };
    }

    // 1b. The materialized job for this appointment must exist.
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, status, transaction_id, timer_seconds, intake_notes')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (jobErr || !job) {
      return { ok: false, httpStatus: 404, error: 'not_found' };
    }

    const jobStatus = job.status as JobStatus;

    // 2. Transaction guard — money attached.
    if (job.transaction_id !== null && job.transaction_id !== undefined) {
      return { ok: false, httpStatus: 409, error: 'transaction_linked' };
    }

    // 3. Terminal guard.
    if (TERMINAL_JOB_STATUSES.has(jobStatus)) {
      return { ok: false, httpStatus: 409, error: 'terminal' };
    }

    // Collect the data enumeration (counts + storage paths) up front.
    const [{ count: photoCount }, { count: addonCount }, photoRows] =
      await Promise.all([
        supabase
          .from('job_photos')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id),
        supabase
          .from('job_addons')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id),
        supabase.from('job_photos').select('storage_path').eq('job_id', job.id),
      ]);

    const storagePaths = ((photoRows.data ?? []) as Array<{ storage_path: string | null }>)
      .map((r) => r.storage_path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);

    const confirmRequired = CONFIRM_REQUIRED_JOB_STATUSES.has(jobStatus);

    const data: UnMaterializeData = {
      jobId: job.id,
      jobStatus,
      photoCount: photoCount ?? 0,
      addonCount: addonCount ?? 0,
      timerSeconds: Number(job.timer_seconds ?? 0),
      hasIntakeNotes: typeof job.intake_notes === 'string' && job.intake_notes.trim().length > 0,
      confirmRequired,
    };

    // 4. Type-to-confirm guard for at/above-threshold jobs.
    if (confirmRequired && options.confirmString !== 'DELETE') {
      return { ok: false, httpStatus: 422, error: 'confirm_required', data };
    }

    // 5a. Revert the appointment FIRST (re-materialization invariant).
    const { error: apptUpdErr } = await supabase
      .from('appointments')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', appointmentId);

    if (apptUpdErr) {
      console.error('[un_materialize] appointment revert failed:', apptUpdErr.message);
      return { ok: false, httpStatus: 500, error: 'unknown' };
    }

    // 5b. Delete the job (CASCADE removes job_photos + job_addons rows;
    //     lifecycle_executions.job_id is SET NULL).
    const { error: jobDelErr } = await supabase.from('jobs').delete().eq('id', job.id);

    if (jobDelErr) {
      // Appointment is already 'pending' (non-materializable) — the safe,
      // recoverable partial state. The operator can retry; populate will NOT
      // re-create the job because the appointment is no longer confirmed.
      console.error(
        '[un_materialize] job delete failed after appointment revert (recoverable):',
        jobDelErr.message
      );
      return { ok: false, httpStatus: 500, error: 'unknown', data };
    }

    // 6. Best-effort Storage cleanup (main + thumbnail). Never rolls back the DB.
    let storageFilesDeleted = 0;
    if (storagePaths.length > 0) {
      const allPaths = storagePaths.flatMap((p) => [p, p.replace('.jpg', '_thumb.jpg')]);
      const { error: storageErr } = await supabase.storage
        .from(JOB_PHOTOS_BUCKET)
        .remove(allPaths);
      if (storageErr) {
        console.error(
          '[un_materialize] storage cleanup failed (non-blocking); orphaned objects may remain:',
          storageErr.message
        );
      } else {
        storageFilesDeleted = allPaths.length;
      }
    }

    // 7. Audit (fire-and-forget; no webhooks fire on un-materialize).
    logAudit({
      userId: options.actor.userId,
      userEmail: options.actor.userEmail,
      employeeName: options.actor.employeeName,
      action: 'delete',
      entityType: 'job',
      entityId: job.id,
      entityLabel: `Job #${job.id.slice(0, 8)} (un-materialized)`,
      details: {
        reason: 'un_materialize',
        appointment_id: appointmentId,
        previous_job_status: jobStatus,
        previous_appointment_status: appt.status,
        deleted_photos: data.photoCount,
        deleted_addons: data.addonCount,
      },
      ipAddress: options.ipAddress,
      source: options.source,
    });

    return {
      ok: true,
      httpStatus: 200,
      data,
      deletedPhotos: data.photoCount,
      deletedAddons: data.addonCount,
      storageFilesDeleted,
    };
  } catch (err) {
    console.error('[un_materialize] unexpected error:', err);
    return { ok: false, httpStatus: 500, error: 'unknown' };
  }
}
