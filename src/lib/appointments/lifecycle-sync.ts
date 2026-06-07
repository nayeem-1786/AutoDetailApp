import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentStatus, JobStatus, JobServiceSnapshot } from '@/lib/supabase/types';
import { logAudit } from '@/lib/services/audit';
import { getTodayPst, pstStartOfDayLiteral } from '@/lib/utils/pst-date';

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
 * LOAD-BEARING re-materialization invariant: pre-Session-2.5, `populate`
 * (`/api/pos/jobs/populate`) auto-materialized confirmed / in-progress
 * appointments on every POS-Today-scope mount, racing against operator
 * status edits. Un-materialize had to leave the appointment in a NON-
 * materializing status (`pending`) so the next mount wouldn't immediately
 * re-create the job behind the operator's back. Session 2.5 retired
 * populate; materialization is now operator-initiated via Start Intake
 * (`POST /api/pos/jobs/start-intake`, the Session 2.1 endpoint that
 * wraps `materializeJobFromAppointment` below). The re-materialization
 * race is structurally gone — only an explicit operator action can
 * re-materialize a reverted appointment. The pending-state invariant
 * is still useful (it gates the Start Intake endpoint's status check)
 * but it's no longer the load-bearing safety net it once was.
 * `executeUnMaterialize` writes the appointment status FIRST, then
 * deletes the job — defense-in-depth ordering preserved.
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
  /** Phase 2C-β: when true, run the guards + collect the data enumeration but
   *  perform NO mutation (no appointment revert, no job delete, no Storage
   *  cleanup, no audit). The un-materialize confirmation modal calls this first
   *  to preview exactly what will be deleted, then re-POSTs without `dryRun` to
   *  execute. Guards still fire (a transaction-linked/terminal job surfaces its
   *  409 here too), so the modal can show a block immediately. */
  dryRun?: boolean;
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

    // Dry-run preview (Phase 2C-β): the confirmation modal calls this first to
    // render the exact deletion enumeration. Guards above (not_found /
    // transaction_linked / terminal) have already returned, so a blocked job
    // surfaces its error even in dry-run. Mutate nothing; the modal then
    // re-POSTs without `dryRun` (and with confirmString) to execute.
    if (options.dryRun) {
      return { ok: true, httpStatus: 200, data };
    }

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
      // recoverable partial state. The operator can retry; Start Intake
      // (Session 2.1) and `materializeJobFromAppointment` below both gate
      // on `confirmed|in_progress` so the partial state cannot silently
      // re-materialize. (Pre-Session-2.5 the same invariant was enforced
      // by `populate`'s status filter.)
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

// ─────────────────────────────────────────────────────────────────────────────
// Forward materialization (Session 2.1 — AC-3 server primitive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Errors `materializeJobFromAppointment` can return. `future_date` and
 * `invalid_status` are 422 (gate violations the operator can resolve); the
 * appointment-not-found case is 404. `unknown` is 500.
 */
export type MaterializeError =
  | 'not_found'
  | 'future_date'
  | 'invalid_status'
  | 'unknown';

export interface MaterializeResult {
  ok: boolean;
  httpStatus: number;
  error?: MaterializeError;
  /** Present on success — the newly-created or pre-existing job id. */
  jobId?: string;
  /** Echoed for caller convenience. */
  appointmentId?: string;
  /** True on the idempotent re-call path (job already existed). */
  alreadyMaterialized?: boolean;
  /** Present on `future_date` — the appointment's scheduled_date, so the client
   *  can render the "Move to today?" popup with the actual date. */
  appointmentDate?: string;
  /** Present on `invalid_status` — the appointment's current status, so the
   *  client can render a specific message. */
  appointmentStatus?: AppointmentStatus;
}

export interface MaterializeActor {
  userId: string | null;
  userEmail: string | null;
  employeeName: string | null;
  /** Required for `jobs.created_by`. */
  employeeId: string;
}

export interface MaterializeOptions {
  /** Materialization trigger — branches the initial job state + audit detail:
   *   - 'start_intake' — operator pressed Start Intake on an EXISTING confirmed
   *     appointment. Job lands at status='intake' with work_started_at=NOW(),
   *     and the appointment advances from 'confirmed' to 'in_progress'.
   *   - 'walk_in' — caller (POST /api/pos/jobs) JUST INSERTed a synthetic
   *     `channel='walk_in'` appointment in 'in_progress' state on TODAY. Job
   *     lands at status='scheduled' with no work_started_at/intake_started_at
   *     (walk-in stays in a transient pre-intake stage until the operator
   *     presses Start Intake on the resulting job card). Appointment status is
   *     NOT advanced (already in_progress by construction); the existing
   *     `if (apptStatus === 'confirmed')` check naturally skips the UPDATE.
   *  Future triggers (lazy-mount, batch backfill) can extend this union. */
  trigger: 'start_intake' | 'walk_in';
  actor: MaterializeActor;
  source: 'admin' | 'pos';
  ipAddress: string | null;
  /** walk_in only — forwarded to jobs.quote_id when this walk-in came from a
   *  quote conversion (quote-ticket-panel handleCreateJob). Unused / null for
   *  start_intake (Start Intake operates on appointments that were never
   *  attached to a quote at conversion time). */
  quoteId?: string | null;
  /** walk_in only — forwarded to jobs.intake_notes from the create-request
   *  body. Unused / null for start_intake (the operator captures intake notes
   *  inside the intake form, not at materialization time). */
  intakeNotes?: string | null;
  /** walk_in only — overrides the appointment-derived `estimated_pickup_at`
   *  calc. Walk-in computes its own rounded-to-15-min NOW value (e.g.,
   *  14:07 → 14:15) rather than deriving from scheduled_end_time the way
   *  Start Intake does. */
  estimatedPickupAtOverride?: string | null;
  /** walk_in only — base services snapshot supplied by the caller (no
   *  mobile-fee entry; the helper still appends a mobile-fee row from the
   *  appointment row when applicable). Bypasses the appointment_services +
   *  services join the helper would otherwise perform — walk-in already has
   *  the services in memory from the create-request body, and using the join
   *  would round-trip unnecessarily. */
  servicesSnapshot?: JobServiceSnapshot[];
}

/**
 * Forward-direction materialization: given an existing appointment id, create
 * the linked `jobs` row and (for `start_intake`) advance
 * `appointments.status='in_progress'`. The canonical counterpart to
 * `executeUnMaterialize` (the reverse direction).
 *
 * AC-3 commitment (Session 2.1): operator pressing "Start Intake" is the
 * canonical materialization event for a confirmed appointment. This helper is
 * the server primitive that powers `POST /api/pos/jobs/start-intake`.
 *
 * Session 2.1.1 (Memory #29 closure): the walk-in atomic-create path at
 * `pos/jobs/route.ts` now also routes its job-creation step through this
 * helper, with `trigger: 'walk_in'`. Walk-in still inserts the synthetic
 * appointment + `appointment_services` rows inline (deeply walk-in-specific
 * shape: `channel='walk_in'`, synthetic time fields, mobile + modifier
 * snapshots, payment_status defaults). After those INSERTs commit, the
 * helper takes over for the job INSERT + audit emission. Both triggers
 * converge at the `jobs.appointment_id` UNIQUE constraint and share this
 * one audit-row writer (no inline `logAudit` at the walk-in call site).
 *
 * Gates (return-before-mutation):
 *  1. **404 not_found** — appointment row does not exist.
 *  2. **422 future_date** — `appointment.scheduled_date > today` (PST). The
 *     materialization concept maps to "operator at site, about to start work";
 *     a future date violates that. (Pre-Session-2.5 the same gate lived in
 *     `populate/route.ts`; this helper is now the canonical site.)
 *  3. **422 invalid_status** — `appointment.status NOT IN ('confirmed',
 *     'in_progress')`. Pending appointments must be confirmed first; terminal
 *     appointments (completed/cancelled/no_show) cannot be re-materialized.
 *
 * Idempotency:
 *  - Two concurrent callers pressing Start Intake on the same appointment must
 *    result in ONE job, not two. The `jobs.appointment_id` UNIQUE constraint
 *    (migration `20260329000002`) is the load-bearing safety net.
 *  - First, a SELECT checks for an existing job — if found, returns 200 with
 *    `alreadyMaterialized: true` and the existing `jobId` (cheap fast path).
 *  - The INSERT uses `upsert({ ignoreDuplicates: true })` so a TOCTOU race
 *    silently no-ops at the DB layer; a follow-up SELECT recovers the row that
 *    won the race.
 *
 * Ordering:
 *  - INSERT job FIRST (status='intake', work_started_at=NOW), then UPDATE
 *    `appointment.status='in_progress'`. Reverse of `executeUnMaterialize`'s
 *    ordering (which writes appointment FIRST then deletes the job). The
 *    re-materialization race that populate created — and that drove
 *    `executeUnMaterialize`'s reverse ordering — is gone post-Session-2.5
 *    (materialization is operator-initiated, not mount-effect-initiated). The
 *    safe ordering here is the one that leaves no partial state if the
 *    appointment UPDATE fails: a job row paired with a `confirmed`
 *    appointment is a benign, retryable state (the operator can re-press
 *    Start Intake; the idempotent path returns the same job and re-attempts
 *    the appointment update).
 */
export async function materializeJobFromAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  options: MaterializeOptions
): Promise<MaterializeResult> {
  try {
    // 1. Fetch appointment — column set kept narrow to what the snapshot needs
    //    (this is the canonical SELECT for materialization post-Session-2.5).
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select(
        'id, customer_id, vehicle_id, employee_id, scheduled_date, scheduled_end_time, status, is_mobile, mobile_surcharge, mobile_zone_name_snapshot'
      )
      .eq('id', appointmentId)
      .single();

    if (apptErr || !appt) {
      return { ok: false, httpStatus: 404, error: 'not_found' };
    }

    // 2. Future-date gate: materialization is for TODAY or PAST work only;
    //    a future-dated appointment must NEVER become a job row early.
    //    Client uses the returned `appointmentDate` to render the "Move to
    //    today?" popup. (Pre-Session-2.5 the same gate lived in `populate`;
    //    this helper is now the canonical site.)
    const today = getTodayPst();
    if (appt.scheduled_date > today) {
      return {
        ok: false,
        httpStatus: 422,
        error: 'future_date',
        appointmentDate: appt.scheduled_date as string,
      };
    }

    // 3. Status gate: only confirmed/in_progress appointments can be
    //    materialized. Pending requires confirmation first; terminal states
    //    are out of scope.
    const apptStatus = appt.status as AppointmentStatus;
    if (apptStatus !== 'confirmed' && apptStatus !== 'in_progress') {
      return {
        ok: false,
        httpStatus: 422,
        error: 'invalid_status',
        appointmentStatus: apptStatus,
      };
    }

    // 4. Idempotency fast path — return the existing job if one already exists.
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (existingJob) {
      return {
        ok: true,
        httpStatus: 200,
        jobId: existingJob.id as string,
        appointmentId,
        alreadyMaterialized: true,
      };
    }

    // 5. Resolve the base services snapshot. Two paths:
    //    - walk_in: caller passes `servicesSnapshot` from the create-request
    //      body (already in memory; bypasses the join round-trip).
    //    - start_intake / fallback: fetch appointment_services + services name
    //      via PostgREST join. (Shape lifted from the retired `populate`
    //      endpoint (Session 2.5); this is the canonical join.)
    let baseServices: JobServiceSnapshot[];
    if (options.servicesSnapshot !== undefined) {
      baseServices = options.servicesSnapshot;
    } else {
      const { data: aptServices } = await supabase
        .from('appointment_services')
        .select(
          'service_id, price_at_booking, service:services!appointment_services_service_id_fkey(id, name)'
        )
        .eq('appointment_id', appointmentId);

      baseServices = (aptServices ?? []).map((svc) => {
        const service = svc.service as unknown as { id: string; name: string } | null;
        return {
          id: svc.service_id as string,
          name: service?.name ?? 'Unknown Service',
          price: Number(svc.price_at_booking),
        };
      });
    }

    // Append mobile-fee entry to the JSONB snapshot when the appointment is
    // mobile (Option D2 materialization — uniform across both triggers;
    // pre-2.1.1 the same append lived inline at the walk-in call site).
    const mobileSurchargeNum = Number(appt.mobile_surcharge ?? 0);
    const services: JobServiceSnapshot[] =
      appt.is_mobile && mobileSurchargeNum > 0
        ? [
            ...baseServices,
            {
              id: null,
              name: (appt.mobile_zone_name_snapshot as string) || 'Mobile Service Fee',
              price: mobileSurchargeNum,
              is_mobile_fee: true,
            },
          ]
        : baseServices;

    // 6. Compute estimated_pickup_at from scheduled_end_time + scheduled_date
    //    in PST/PDT context. (Calc lifted from the retired `populate`
    //    endpoint at Session 2.5; this is now the canonical site.)
    let estimatedPickup: string | null = null;
    if (appt.scheduled_end_time) {
      const dateTimeStr = `${appt.scheduled_date}T${appt.scheduled_end_time}`;
      const offsetStr = pstStartOfDayLiteral(appt.scheduled_date as string).slice(-6);
      const dt = new Date(dateTimeStr + offsetStr);
      if (!isNaN(dt.getTime())) {
        estimatedPickup = dt.toISOString();
      }
    }

    // 7. INSERT job (idempotent via upsert + UNIQUE constraint on appointment_id).
    //    Trigger branches the initial state:
    //    - start_intake: status='intake' + work_started_at=NOW + intake_started_at=NOW
    //      (operator pressing Start Intake IS the start of work tracking;
    //      skips the legacy 'scheduled' intermediate state the retired
    //      `populate` endpoint used).
    //    - walk_in: status='scheduled' + NULL timestamps (transient pre-intake
    //      stage; the operator advances to 'intake' via Start Intake on the
    //      resulting job card). estimated_pickup_at uses the caller-supplied
    //      rounded-to-15-min NOW value rather than the scheduled_end_time calc.
    //      quote_id + intake_notes forwarded from the create-request body.
    const nowIso = new Date().toISOString();
    const isStartIntake = options.trigger === 'start_intake';
    const jobInsert = {
      appointment_id: appointmentId,
      customer_id: appt.customer_id,
      vehicle_id: appt.vehicle_id,
      assigned_staff_id: appt.employee_id,
      services,
      status: isStartIntake ? ('intake' as const) : ('scheduled' as const),
      work_started_at: isStartIntake ? nowIso : null,
      intake_started_at: isStartIntake ? nowIso : null,
      estimated_pickup_at: options.estimatedPickupAtOverride ?? estimatedPickup,
      created_by: options.actor.employeeId,
      quote_id: options.quoteId ?? null,
      intake_notes: options.intakeNotes ?? null,
    };

    const { data: upserted, error: insertErr } = await supabase
      .from('jobs')
      .upsert([jobInsert], { onConflict: 'appointment_id', ignoreDuplicates: true })
      .select('id');

    if (insertErr) {
      console.error('[materialize] job insert failed:', insertErr.message);
      return { ok: false, httpStatus: 500, error: 'unknown' };
    }

    // Resolve the canonical job id. If upsert won the race, `upserted[0].id`
    // is the new row. If a concurrent caller won, `upserted` is an empty array
    // (ignoreDuplicates), so re-SELECT to recover the winner's row id.
    let jobId: string | undefined = upserted?.[0]?.id as string | undefined;
    let raceWinnerReturned = false;
    if (!jobId) {
      const { data: raceWinner } = await supabase
        .from('jobs')
        .select('id')
        .eq('appointment_id', appointmentId)
        .maybeSingle();
      jobId = raceWinner?.id as string | undefined;
      raceWinnerReturned = true;
    }

    if (!jobId) {
      console.error('[materialize] job id missing after upsert + recovery select');
      return { ok: false, httpStatus: 500, error: 'unknown' };
    }

    // 8. Advance appointment.status='in_progress' if it was 'confirmed'. The
    //    'in_progress' branch is a no-op write (already in_progress — covers
    //    the re-materialize-after-cancel-job edge case symmetrically).
    if (apptStatus === 'confirmed') {
      const { error: apptUpdErr } = await supabase
        .from('appointments')
        .update({ status: 'in_progress', updated_at: nowIso })
        .eq('id', appointmentId);

      if (apptUpdErr) {
        // Recoverable partial state — the job row exists paired with a
        // 'confirmed' appointment. The next Start Intake press hits the
        // idempotent fast path, returns the same job, and retries the update.
        console.error(
          '[materialize] appointment status update failed (recoverable):',
          apptUpdErr.message
        );
        return { ok: false, httpStatus: 500, error: 'unknown', jobId, appointmentId };
      }
    }

    // 9. Audit (fire-and-forget; mirrors executeUnMaterialize's audit shape).
    //    `customer_id` is included for parity with the pre-2.1.1 inline
    //    walk-in audit (which carried it alongside services_count); also
    //    useful for cross-customer audit-row aggregation. The entityLabel
    //    suffix is trigger-specific so the human-readable label distinguishes
    //    the two creation paths at a glance in the admin audit-log viewer.
    logAudit({
      userId: options.actor.userId,
      userEmail: options.actor.userEmail,
      employeeName: options.actor.employeeName,
      action: 'create',
      entityType: 'job',
      entityId: jobId,
      entityLabel: `Job #${jobId.slice(0, 8)} (${isStartIntake ? 'materialized' : 'walk-in'})`,
      details: {
        trigger: options.trigger,
        appointment_id: appointmentId,
        previous_appointment_status: apptStatus,
        services_count: baseServices.length,
        race_winner_returned: raceWinnerReturned,
        customer_id: appt.customer_id,
      },
      ipAddress: options.ipAddress,
      source: options.source,
    });

    return {
      ok: true,
      httpStatus: 201,
      jobId,
      appointmentId,
      alreadyMaterialized: false,
    };
  } catch (err) {
    console.error('[materialize] unexpected error:', err);
    return { ok: false, httpStatus: 500, error: 'unknown' };
  }
}
