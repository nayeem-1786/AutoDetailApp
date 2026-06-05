# Populate Dependencies — Foundational Audit (Phase 0.3)

> Read-only Component Behavior audit, 2026-06-05.
> Branch: `audit/phase-0-3-populate-dependencies`.
> Memory #29 type 3 (descriptive, current-state).
>
> Phase 0.3 of the locked QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE v1.0
> (`docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md`). Gates Phase 2's
> AC-3 implementation (Start Intake as materialization trigger
> replaces the implicit populate-on-mount).
>
> **No source / migration / test changes. No fix recommendations.
> No operator-decision pre-resolution.** The audit's deliverable is
> the dependency inventory + migration scope verdict.

---

## Executive summary

Populate is **structurally shallow** in the codebase. Its only function
is to UPSERT `jobs` rows from today-or-past confirmed/in_progress
appointments at `/api/pos/jobs/populate`
(`src/app/api/pos/jobs/populate/route.ts:1-194`). The lifecycle audit
2293fb3d's claim that there are exactly two call sites
(`job-queue.tsx:711-723` init effect; `:763-779` Refresh button) is
**confirmed verbatim**, plus the function-level GATE C at
`job-queue.tsx:574-580`. No cron, no webhook, no admin surface, no
report, no API endpoint outside the POS Jobs Today scope page invokes
populate. Removing or repurposing it is a single-component concern.

Dependency-side, ONE direct downstream user of "today's jobs exist
because populate ran" exists in production: the POS Jobs **Today scope**
itself — its 4-card daily summary (`totalJobs / unassigned /
totalRevenue / completedCount`, `job-queue.tsx:747-754`), its list/timeline
render, and its filter pills. Every other `jobs`-table reader in the
codebase either (a) operates on a known `job_id` (job-detail GET,
addons, photos, timer, checkout-items, cancel, complete, start-work,
reschedule, link-transaction), (b) operates on a known `customer_id`
or `transaction_id` (receipt-data, job-addons, transactions linking,
pending-addons-for-customer), or (c) reads `jobs` filtered by a
post-Start-Intake status (`closed`/`completed` for lifecycle-engine
rules; `in_progress`/`intake` for staff-busy display) — none of which
depend on populate having materialized today's full set in advance.

**Migration scope verdict: CLEAN.** Phase 2's AC-3 implementation is a
single-session concern — replace populate's role with Start Intake +
re-point the Today scope's data fetch from `from('jobs') WHERE
appointment_id IN (today_appts)` to a UNION-style read of
`appointments WHERE scheduled_date=today AND status IN (confirmed,
in_progress, ...) LEFT JOIN jobs` so pre-intake confirmed appointments
appear with affordance to Start Intake. **No reports, no crons, no
admin views, no API endpoints need migration work.** Two open
operator decisions (F.1, F.2) govern UX shape; one (F.4) governs
whether to keep populate as an admin-only manual affordance.

The four load-bearing invariants documented by the lifecycle audit
(2293fb3d Target E.4) are **unchanged** by AC-3:

1. Future appointments never become job rows — Start Intake is
   operator-initiated and operator-day-of, preserves the invariant by
   construction.
2. At most 1 job per appointment — UNIQUE constraint at the DB layer,
   independent of how the row is created.
3. Un-materialize ordering — unchanged seam (`lifecycle-sync.ts:292-316`).
4. Schedule scope is PURE READ — unchanged.

---

## Target A — Direct readers of `jobs` table (today scope)

### A.1 — The Today endpoint

**File:** `src/app/api/pos/jobs/route.ts:15-141` (GET handler).

**What it reads** (`:51-94`):

1. **Step 1** (`:51-55`) — query `appointments` for today's IDs
   (`scheduled_date = targetDate`). Always runs.
2. **Step 2a** (`:58-64`) — query `jobs` filtered by
   `appointment_id IN dateAptIds` AND `status NOT IN ('cancelled')`.
   **Empty when no job rows exist for today's appointments** (i.e.,
   pre-populate state).
3. **Step 2b** (`:71-79`) — query `jobs` for legacy walk-ins
   (`appointment_id IS NULL`, `created_at` in today's PST window). Pre-Phase-0a
   carryover; new walk-ins eager-create appointment so `appointment_id`
   is non-null.
4. Merge + enrich with `estimated_duration_minutes` from
   `services.base_duration_minutes` (`:108-134`).

**What it displays:** drives the entire POS Jobs Today scope state
via `job-queue.tsx:464-481` `fetchJobs`.

**Behavior when zero jobs exist for today (pre-Start-Intake):**

- Today endpoint returns `data: []` after the merge.
- `job-queue.tsx`'s `summary` memo (`:747-754`) renders
  `totalJobs=0`; the entire summary bar is hidden by the
  `summary.totalJobs > 0` gate (`:884`).
- The list/timeline shows the empty-state copy at `:1047-1058`:
  *"No jobs scheduled for {date}. No appointments or walk-ins for
  this date."*
- This empty-state is **operator-misleading** today: it's identical
  to "actually nothing booked." There's no signal that confirmed
  appointments exist but haven't been materialized.

**Today endpoint dependence on populate:** the endpoint itself does NOT
call populate; it only READS `jobs`. The dependence is indirect — the
init effect at `job-queue.tsx:711-723` calls populate FIRST, then
`fetchJobs`, so by the time the operator sees the page, jobs typically
exist.

### A.2 — Daily summary cards

**File:** `src/app/pos/jobs/components/job-queue.tsx:746-754, 883-905`.

The 4 summary cards are computed entirely from the `jobs` state
(post-`fetchJobs`):

| Card | Source | Pre-intake value |
|---|---|---|
| `totalJobs` | `nonCancelled.length` over `jobs` state | 0 (no jobs exist) |
| `unassigned` | `nonCancelled.filter(j => !j.assigned_staff).length` | 0 |
| `totalRevenue` | sum of `j.services[].price` over non-cancelled | $0 |
| `completedCount` | `j.status === 'completed' OR 'closed'` count | 0 |

**All four cards collapse to zero if no jobs are materialized for
today.** The entire summary bar is hidden by the gate at
`job-queue.tsx:884` (`!loading && summary.totalJobs > 0`), so the
operator sees no bar at all rather than misleading zeros.

**Operator expectation pre-intake:** the operator, looking at POS at
8:00 AM on a day with 5 confirmed appointments + 0 started intakes,
currently sees an empty surface. With populate running on mount, those
5 appointments became 5 `scheduled` job rows, so the summary correctly
shows "5 jobs, 0 unassigned, $X revenue, 0/5 complete." With AC-3,
those 5 appointments DON'T become jobs until the operator does Start
Intake — so the summary at 8:00 AM would say "0 jobs" unless the
summary's data source is re-pointed to `appointments` for the unstarted
portion.

### A.3 — List/timeline rendering

**List mode** (`job-queue.tsx:1041-1215`):
- Maps over `sortedJobs` (derived from `jobs` state).
- Shows `Customer / Vehicle / Services / Status pill / Time pill /
  Scheduled time pill / Walk-In badge / Timer / Photo progress /
  Addon badge / Assigned staff / Checkout button / Paid badge`.
- Pre-intake state: zero job rows → empty-state copy at `:1047-1058`.

**Timeline mode** (`src/app/pos/jobs/components/job-timeline.tsx`):
- Receives `jobs` array from parent (`job-queue.tsx:1028-1040`).
- Buckets by assigned_staff lane (`__unassigned__` lane for
  null `assigned_staff_id`, `:422, 436`).
- Pre-intake: empty timeline.

**Are appointment rows for today visible in Today scope?** No. The
Today endpoint queries `jobs` (filtered by today's appointment IDs);
the appointments themselves are joined onto each job row via
`appointment:appointments!jobs_appointment_id_fkey(scheduled_start_time,
channel)` (`pos/jobs/route.ts:43`) but only as embedded fields on
existing jobs — never independently rendered. Appointments without
jobs are simply absent.

### A.4 — Counts and badges elsewhere

**POS bottom nav** — does NOT show a job count badge. Verified by grep
of `src/app/pos/components/bottom-nav.tsx` for `job_count` / `totalJobs`
(no matches in count-display context).

**Job-detail "reassign detailer" modal** (`job-detail.tsx:183, 1660`) —
shows `staff.job_count_today` per detailer. Source:
`/api/pos/staff/available` (`src/app/api/pos/staff/available/route.ts:44-50`)
which counts `jobs` per detailer where `status IN ('scheduled', 'intake',
'in_progress', 'pending_approval')` AND `created_at` in today's PST
window. **Includes the `scheduled` state, so it depends on populate
having materialized the day's `scheduled` rows to show the correct
"3 jobs today" badge per detailer.**

**POS Jobs Schedule scope (Stage 1, the other surface)** — does NOT
read jobs for counts. It reads appointments via
`/api/pos/jobs/schedule` (`schedule/route.ts:96-141`) and uses jobs
ONLY to DROP appointments that have a job (the dedup at `:131-141`).
No populate dependence; explicitly documented as PURE READ at `:24-27`.

**Admin > Jobs list** (`src/app/admin/jobs/page.tsx` + `src/app/api/admin/jobs/route.ts:48-92`)
— paginated table, filter-driven (status / staff / customer / vehicle /
date range). No "today's expected count" surface. Date filter is
operator-driven via `dateFrom`/`dateTo` query params; no auto-today.
Independent of populate.

**Admin home dashboard** (`src/app/admin/page.tsx:74-101, 213-222`) —
reads `appointments` for today's counts (pending / confirmed /
in_progress / completed / walk-ins / booked), NOT `jobs`. Independent of
populate. **Currently the only "today's expected work" surface that's
already appointment-sourced.**

---

## Target B — What other surfaces depend on materialized jobs

### B.1 — Reports / analytics

`src/app/admin/reports/payments/page.tsx` — payments aggregation by
method/platform. Reads `payments` + `transactions`. **No `jobs`
reads.** Independent of populate.

Only one report directory exists today (`src/app/admin/reports/`).
The single payments report does not depend on jobs at all.

### B.2 — Cron-driven aggregates

Per `src/lib/cron/scheduler.ts:107-122`, 14 cron tasks registered.
Grep for `from('jobs')` across `src/app/api/cron`:

- **`lifecycle-engine` (every 10 min)** —
  - Phase 1A: `scheduleFromCompletedJobs` reads `jobs.status='closed'`
    with `updated_at >= lookbackWindow`
    (`src/app/api/cron/lifecycle-engine/route.ts:215-264`).
  - Phase 1C: `scheduleFromWorkCompleted` reads `jobs.status='completed'`
    with `work_completed_at >= lookbackWindow` (`:357-409`).
  - Phase 2: per-execution lookup of `jobs.assigned_staff.first_name`
    when `exec.job_id` is populated (`:1022-1033`).
  - **All three job statuses (`closed`, `completed`) are post-Start-Intake-
    Start-Work-Complete.** They can only be reached after the operator
    has manually transitioned a job through its workflow. They do NOT
    depend on populate having materialized at start of day — they
    depend on the job existing when the operator does the work.
- All other crons (quote-reminders, stock-alerts, qbo-sync,
  booking-reminders, conversation-summaries, voice-calls-poll, plus
  cleanups + theme-activation + process-scheduled + google-reviews +
  cleanup-orders / -idempotency / -audit-log / -verification-codes)
  do NOT read `jobs` at all. Verified by grep of
  `src/app/api/cron/*/route.ts` for `from('jobs')`.

**Cron-aggregate verdict:** lifecycle-engine is the only cron consumer,
and its dependency is on the post-work job statuses — naturally
preserved under AC-3 (jobs created by Start Intake transition through
the same workflow → same `completed` / `closed` states → same cron
matches).

### B.3 — Webhook / notification paths

Grep `src/app/api/webhooks` for `from('jobs')`: no matches in webhook
receivers. The Stripe webhook
(`src/app/api/webhooks/stripe/route.ts:213-225` per lifecycle audit
2293fb3d) flips `appointments.payment_status`, not jobs.

**Webhook verdict:** no surface depends on populate having run.

### B.4 — Joins from appointments to jobs

Several surfaces JOIN `appointments` to `jobs` for enrichment:

1. **`withHasActiveJob` derivation**
   (`src/app/admin/appointments/has-active-job.ts:30-38`) — joins
   `jobs(id, status)` onto an appointment to compute
   `has_active_job: boolean`. Reads through the embedded relation
   (1:1 via UNIQUE FK).
   **Pre-intake (no job row):** `jobs` is `null` →
   `asRelationArray` returns `[]` → `hasActiveJob=false`. The dialog
   Save earlier-state intercept at `appointment-detail-dialog.tsx:219-228`
   correctly does NOT fire because there's nothing to un-materialize.
   **Not a regression** — `has_active_job=false` is the correct value
   for a pre-intake confirmed appointment.

2. **POS appointment GET**
   (`src/app/api/pos/appointments/[id]/route.ts:71-92`) — same
   pattern, joins jobs and derives `has_active_job`. Same conclusion.

3. **POS appointment PATCH cascade** (`pos/appointments/[id]/route.ts:323-329`)
   — when `employee_id` changes, propagate to
   `jobs.assigned_staff_id WHERE appointment_id = id`. Pre-intake:
   updates 0 rows. **Not a regression** — the next Start Intake will
   read the updated `appointments.employee_id` and seed the job with
   the correct staff.

4. **Service-edit linked-job snapshot**
   (`src/lib/appointments/service-edit.ts:319-323, 498-510`) — looks up
   the linked job by `appointment_id` to mirror services into the
   `jobs.services` JSONB. Pre-intake (no job): `linkedJobId` is null,
   the job sync block is gated and skipped. **Not a regression** —
   when the operator does Start Intake later, the materialized job
   will read the appointment's current services into its JSONB at
   creation.

5. **Schedule endpoint dedup** (`schedule/route.ts:131-141`) — reads
   `jobs.appointment_id` to drop materialized appointments from
   Schedule scope. Pre-intake: no job → appointment stays visible in
   Schedule. **Consistent with AC-3** — fewer materialized jobs means
   more appointments stay in Schedule scope.

6. **Mobile-service routes** (`/api/admin/appointments/[id]/mobile-service`
   `:109, 123`; `/api/pos/appointments/[id]/mobile-service` `:163, 181`)
   — cascade mobile-service changes onto the linked job's `services`
   JSONB. Pre-intake: no job row → cascade no-ops, the appointment-level
   update still succeeds. **Not a regression.**

7. **Appointment reschedule cascade**
   (`/api/pos/appointments/[id]/reschedule/route.ts:184`) — updates
   `jobs.estimated_pickup_at` WHERE `appointment_id = id`. Pre-intake:
   0 rows updated. **Not a regression** — Start Intake later reads the
   appointment's new `scheduled_end_time` to seed `estimated_pickup_at`.

**Join verdict:** every join from `appointments → jobs` gracefully
degrades to "no job" with no broken queries and no user-facing
errors. The behavioral semantic is preserved.

---

## Target C — Migration scope decision

### C.1 — Categorization

| # | Dependency | Surface | Category |
|---|---|---|---|
| A.1 | Today endpoint reads `jobs` for today's appointment IDs (`pos/jobs/route.ts:51-94`) | POS Jobs Today scope core | **CLEAN-RE-POINTABLE** |
| A.2 | 4-card daily summary (`job-queue.tsx:747-754`) | POS Jobs Today header | **CLEAN-RE-POINTABLE** |
| A.3 | List/timeline body (`job-queue.tsx:1041-1215`, `job-timeline.tsx`) | POS Jobs Today body | **CLEAN-RE-POINTABLE** |
| A.4 | `staff/available` job_count_today (`staff/available/route.ts:44-50`) | Reassign-detailer modal | **CLEAN-RE-POINTABLE** (count `scheduled` state from `appointments` + `jobs` UNION) |
| B.1 | Reports — none | — | (no dependency) |
| B.2 | Lifecycle-engine reads `closed` / `completed` jobs | Cron | **REQUIRES-JOB-EXISTENCE** (naturally preserved by AC-3) |
| B.3 | Webhooks — none | — | (no dependency) |
| B.4.1 | `withHasActiveJob` derivation | Admin appointments dialog | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| B.4.2 | POS appointment GET `has_active_job` | POS Schedule detail | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| B.4.3 | POS PATCH `assigned_staff_id` cascade | POS Schedule detail | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| B.4.4 | service-edit linked-job snapshot | Sale-tab edit | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| B.4.5 | Schedule endpoint dedup | POS Schedule list | **REQUIRES-JOB-EXISTENCE** (intentional — un-materialized stays visible) |
| B.4.6 | Mobile-service cascade onto job services | Admin/POS mobile edit | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| B.4.7 | Reschedule cascade onto `estimated_pickup_at` | POS reschedule | **REQUIRES-JOB-EXISTENCE** (naturally preserved) |
| — | `pos/transactions` post-checkout link | Checkout flow | **REQUIRES-JOB-EXISTENCE** (post-work; naturally preserved) |
| — | `assign-detailer` busy-detection from `jobs.status IN (in_progress, intake)` | Online booking router | **REQUIRES-JOB-EXISTENCE** (active states, naturally preserved) |
| — | `vehicle-count` baseline+completed | Public homepage stat | **REQUIRES-JOB-EXISTENCE** (post-completed; naturally preserved) |
| — | `receipt-data` cross-receipt linkage | Receipt rendering | **REQUIRES-JOB-EXISTENCE** (post-checkout; naturally preserved) |
| — | `pending-addons-for-customer` | AI prompt context | **REQUIRES-JOB-EXISTENCE** (active states; naturally preserved) |
| — | Public gallery `jobs/[token]/photos` | Customer-share | **REQUIRES-JOB-EXISTENCE** (post-completion; naturally preserved) |

**Counts:**

- CLEAN-RE-POINTABLE: **4** (the Today endpoint, the daily summary, the
  list/timeline body, and the reassign-detailer count)
- REQUIRES-JOB-EXISTENCE: **13** (all downstream of the job actually
  existing — naturally preserved by AC-3 because Start Intake creates
  the job before any of these are reached)
- DEAD-CODE: **0**
- UNCLEAR: **0** (all dependencies are unambiguously categorized)

### C.2 — Migration shape

**CLEAN-RE-POINTABLE (4 sites):**

The shape of the migration depends on operator decision F.2 (should
the Today scope list show today's confirmed appointments that haven't
started intake yet?). Two plausible code shapes:

- **Shape α — append appointment-rows to the Today scope:** extend
  `pos/jobs/route.ts` GET to also fetch today's
  `appointments WHERE scheduled_date=today AND status IN
  (confirmed, in_progress) AND id NOT IN (SELECT appointment_id
  FROM jobs WHERE appointment_id IS NOT NULL)`, return these as
  "pending-intake" entries with a `kind: 'appointment'` discriminator.
  The summary cards count both kinds. List/timeline renders both with
  visible `Start Intake` affordance on appointment-kind rows.
  Approximate scope: ~80-120 prod lines across 3 files
  (`pos/jobs/route.ts`, `job-queue.tsx`, `job-timeline.tsx`) + type
  changes + ~6-10 tests.

- **Shape β — re-point the Today endpoint to appointments primarily:**
  rewrite the Today endpoint to read `appointments WHERE
  scheduled_date=today AND status IN (confirmed, in_progress, ...)`
  with a `LEFT JOIN jobs` for operational state. Every row becomes
  an appointment with optional job-state. The summary derives from
  the appointment count + the join state. Larger code change but
  arguably cleaner architecturally — appointments are the spine
  per AC-10. Approximate scope: ~150-200 prod lines, similar file
  set, +12-18 tests.

`staff/available`'s `job_count_today` (A.4) is a separate, smaller
re-point: count today's appointments-with-detailer + currently-active
jobs as a single bookable-load metric. ~10-15 prod lines.

**REQUIRES-JOB-EXISTENCE (13 sites):** **no migration work.** They
read `jobs` filtered by `id`, `customer_id`, `transaction_id`, or
post-Start-Intake statuses. The new architecture (Start Intake →
materializes job → operator does work → job reaches completed/closed)
preserves the data path identically. The lifecycle-engine cron, the
checkout link, the receipts, the public gallery, the addon flow, the
mobile-service cascades, the reschedule cascade — all of them are
naturally unaffected.

**DEAD-CODE:** none identified. The populate function itself becomes
candidate-for-removal (or candidate-for-keep-as-admin-affordance per
F.4); 3 in-source defensive comments (gates A/B/C in `job-queue.tsx`)
become candidate-for-removal alongside.

### C.3 — Total scope estimate

**Verdict: CLEAN migration.** Phase 2's AC-3 implementation is a
**single session** of moderate scope. Estimate:

- Shape α: ~80-120 prod lines + ~6-10 tests + ~10-15 lines for
  `staff/available` → **one session**.
- Shape β: ~150-200 prod lines + ~12-18 tests + ~10-15 lines for
  `staff/available` → still **one session**, larger.

**No multi-session migration is required** because:

1. No reports depend on populate.
2. No crons depend on populate's pre-day materialization timing.
3. No admin surface depends on populate (admin home reads
   `appointments` already; admin Jobs list is operator-filter-driven).
4. No webhooks depend on populate.
5. Appointment → job joins all degrade gracefully when no job exists.

The remaining work is purely in the POS Jobs Today scope itself —
the surface populate was built to serve. Once that's re-pointed,
populate becomes either fully removable (`/api/pos/jobs/populate/`
route + its tests + the 3 defensive gates in `job-queue.tsx`) or
kept as an admin-only manual affordance per F.4.

The four invariants of the materialization model
(2293fb3d Target E.4) are preserved by Start Intake's day-of /
status-of gates per AC-3.

---

## Target D — Eager walk-in pathway verification

### D.1 — Walk-in independence from populate

**File:** `src/app/api/pos/jobs/route.ts:147-536` (the walk-in POST
handler).

Walk-in flow does NOT call populate at any point:

- Pre-walk-in: no populate involvement (operator presses "New Walk-In"
  button at `job-queue.tsx:780-788`).
- During walk-in: atomic INSERT pair (appointments at `pos/jobs/route.ts:383-415`,
  job at `:470-490`).
- Post-walk-in: no populate involvement; UI refresh via `fetchJobs`
  not `populateFromAppointments`.

**Removing populate has zero effect on the walk-in path.**

### D.2 — Walk-in visibility on Today scope without populate

After a walk-in completes the atomic INSERT pair:

- `jobs.appointment_id` is non-null (the synthetic walk-in appointment).
- `appointments.scheduled_date` is today PST (synthetic value).
- `jobs.created_at` is now() in today's PST window.

When the Today endpoint runs (`pos/jobs/route.ts:51-94`):

- Step 1 finds the synthetic appointment's ID in today's appointment
  set.
- Step 2a finds the walk-in job via `appointment_id IN [synthetic_id]`.
- The job is returned in the response.

**The walk-in path is self-sufficient for Today scope visibility.**
It does NOT depend on populate having run beforehand. This is strong
evidence the AC-3 architecture works: Start Intake will produce the
same self-sufficient job-creation result for non-walk-in appointments.

---

## Target E — Caller verification + post-AC-3 behavior

### E.1 — Populate's only callers (re-verified)

Cross-checking against the lifecycle audit 2293fb3d Target B.2:

| Caller | File:line | Notes |
|---|---|---|
| Init effect on Today scope mount | `src/app/pos/jobs/components/job-queue.tsx:711-723` | GATE A — short-circuits in Schedule scope (`:715-718`); calls `populateFromAppointments(selectedDate)` then `fetchJobs(selectedDate)`. |
| Refresh button | `src/app/pos/jobs/components/job-queue.tsx:762-779` | GATE B — short-circuits in Schedule scope (`:766-769`); calls `populateFromAppointments(selectedDate)` then `fetchJobs(selectedDate)` after invalidating `populatedDates` dedup. |
| `populateFromAppointments` function | `src/app/pos/jobs/components/job-queue.tsx:574-601` | GATE C — function-level scope guard (`:580`). The actual `posFetch('/api/pos/jobs/populate', ...)` call site at `:585`. |

**No other call sites exist.** Grep across `src/` for
`/api/pos/jobs/populate` returned only these and documentation
comments in 5 files (`job-detail.tsx:844`, `flag-issue-flow.tsx:49`,
`lib/appointments/edit-services.ts:12,141`,
`lib/utils/mobile-service-edit.ts:71`,
`lib/utils/compose-line-items.ts:61-96`) — all describing the JSONB
shape populate produces, none invoking it.

**Cron-scheduler grep:** `src/lib/cron/scheduler.ts:107-122` registers
14 cron tasks; none reference populate. Same as 2293fb3d found.

### E.2 — Init effect behavior post-AC-3

If populate is removed, the init effect (`job-queue.tsx:711-723`)
becomes:

```ts
async function init() {
  if (effectiveScope === 'schedule') {
    await fetchSchedule();
    return;
  }
  await fetchJobs(selectedDate); // (was: populate then fetchJobs)
}
```

The Schedule branch is unchanged. The Today branch loses the
populate call; `fetchJobs` becomes the sole data fetch. If F.2 is
LOCKED to "show today's confirmed appointments alongside started
jobs," the Today endpoint's GET must be extended (Shape α or β
above); `fetchJobs` retains the same name but its server-side
implementation widens.

`populatedDates` ref (`job-queue.tsx:424`) becomes dead code (used
only by `populateFromAppointments` for cross-mount dedup).
`populating` state and the spinner on Refresh button become dead.
`populateFromAppointments` function and GATE C comment become dead.

### E.3 — Refresh button behavior post-AC-3

The Refresh button (`job-queue.tsx:762-779`) currently calls
populate → fetchJobs. Post-AC-3 it calls only fetchJobs. Behavior
is preserved (re-poll today's appointments and any materialized
jobs). The button is still useful — operator may have added a
new appointment via admin / SMS / phone agent and wants to see it
in the Today scope without waiting for the next 5-second poll.

GATE B (`:766-769`) becomes a no-op short-circuit (Schedule scope
calls `fetchSchedule` instead of `fetchJobs`) — equivalent to today
minus the populate skip.

---

## Target F — Open operator decisions

These are surfaced honestly. No pre-resolution.

### F.1 — Daily summary semantic post-AC-3

The 4-card daily summary (totalJobs / unassigned / totalRevenue /
completedCount) at `job-queue.tsx:884-905` is currently sourced from
materialized jobs. Two semantics for post-AC-3:

- **Option (i):** show "today's expected count" — counts every
  confirmed/in_progress appointment for today (whether intake started
  or not). The 4 cards become forward-looking.
- **Option (ii):** show "today's started jobs only" — counts only
  jobs that have been materialized (post-Start-Intake). Operator
  sees zeros at start of day, climbing as intakes start.

Tradeoff: (i) gives operator full day-glance immediately on opening
POS — same operational utility as today's populate-on-mount. (ii) is
strictly truthful to the new architecture but reduces start-of-day
operator awareness.

### F.2 — Today scope list visibility for un-started appointments

Should the Today scope list (the list/timeline body) render today's
confirmed appointments that have NOT yet had Start Intake pressed,
with a visible "Start Intake" affordance on each row?

- **Option (i) — yes:** mirrors the operator's mental model that
  "today's queue" includes both started + expected work. Mirrors
  the W3 Public-Booking pattern (visible-but-suppressed-affordance).
  Requires Shape α or β per C.2.
- **Option (ii) — no:** Today scope shows ONLY started work; expected
  work stays in Schedule scope. Requires the conceptual model from
  AC-4 to absorb "today's expected" into Schedule (which today's
  endpoint hard-clamps to tomorrow+) OR a third scope.

Tradeoff: (i) preserves today's operator UX flow but blurs the
Today / Schedule distinction. (ii) keeps the scopes conceptually
crisp but the operator must navigate Schedule → tap appointment →
Start Intake → return to Today. (ii) is closer to AC-4's "unified
surface" framing if Schedule absorbs today's un-started.

### F.3 — Manual "Materialize Now" affordance

Beyond Start Intake (which materializes + transitions job.status to
`intake`), should there be a separate manual "Materialize Now"
affordance that pre-stages a job row at `status='scheduled'` BEFORE
the vehicle arrives — e.g., operator wants to assign a detailer or
review services in the job-detail view ahead of time?

- **Option (i) — yes:** preserves an option-to-stage pattern from
  today's populate-on-mount UX (Stage 2 of the lifecycle survives,
  just operator-triggered instead of mount-implicit).
- **Option (ii) — no:** Start Intake is the single materialization
  affordance; pre-staging happens at the appointment level. Stage 2
  collapses into Stage 3 — `scheduled` becomes a transient state that
  exists only between the INSERT and the same-transaction status-flip.

Tradeoff: (i) preserves the existing `scheduled` job status as a
meaningful operator-facing state. (ii) simplifies the job lifecycle
to `intake → in_progress → completed → closed | cancelled` and removes
a status that's currently unused by any cron/report/UI other than
populate's INSERT default.

### F.4 — Populate removal vs admin-only debug retention

Should `/api/pos/jobs/populate` be removed entirely, or kept as an
admin-only debug/recovery endpoint?

- **Option (i) — remove entirely:** route + tests +
  `populateFromAppointments` + `populatedDates` + GATE A/B/C all
  deleted. Cleanest. Recovery cases (operator needs to bulk-materialize
  for some reason) are handled by hitting Start Intake N times via UI.
- **Option (ii) — keep as admin-only:** the route stays alive,
  re-gated to require admin permission (e.g., a new
  `pos.jobs.bulk_materialize` key). Manual affordance in admin
  Jobs page. Operator can pre-stage a whole day if needed (e.g.,
  testing, training, recovery).
- **Option (iii) — keep but recharter as cron** (G.1 from 2293fb3d):
  populate runs on a 6 AM PST cron, materializes the day's
  confirmed/in_progress appointments. Restores today's "operator sees
  full glance on open" UX but couples back to an implicit-time-based
  materialization. Inverts the AC-3 commitment ("operator-initiated
  materialization is cleaner than implicit").

Tradeoff: (i) is the most architecturally pure. (ii) keeps a safety
valve. (iii) regresses on AC-3's explicit-trigger commitment.

### F.5 — `jobs.status='scheduled'` legitimacy post-AC-3

If Start Intake is the ONLY materialization trigger AND it
simultaneously creates the job row AND transitions it to
`status='intake'`, then `status='scheduled'` becomes structurally
unreachable except via the walk-in atomic create
(`pos/jobs/route.ts:470-490` writes `status='scheduled'`).

- **Sub-decision F.5a:** should walk-ins still create
  `status='scheduled'` and require a separate Start Intake press,
  or should they atomically land at `status='intake'`?
- **Sub-decision F.5b:** should `scheduled` be removed from
  `jobs_status_check` (and the related per-action endpoints) entirely
  in Phase 2, or kept for walk-in's transient state?

Tradeoff: removing `scheduled` is a small migration (CHECK constraint +
several `start-intake` endpoint guards). Keeping it for walk-in
preserves the existing UX (operator confirms walk-in registration
then presses Start Intake when the vehicle is staged). Pre-resolution
deferred.

### F.6 — `staff/available` `job_count_today` semantic

Today the modal shows "X jobs today" per detailer. If F.1 is locked
to (ii) (show only started work), the count must include both started
jobs AND the detailer's assigned confirmed appointments — otherwise
the count is misleadingly low at start of day. Same architectural
shape as F.1.

---

## File:line reference index

| Topic | Path |
|---|---|
| **Populate** | |
| Populate endpoint | `src/app/api/pos/jobs/populate/route.ts:1-194` |
| Populate future-date gate (Inv 1) | `src/app/api/pos/jobs/populate/route.ts:42-47` |
| Populate status filter | `src/app/api/pos/jobs/populate/route.ts:65` |
| Populate idempotent upsert (Inv 2 enforcement) | `src/app/api/pos/jobs/populate/route.ts:169-171` |
| **Populate callers (only)** | |
| `populateFromAppointments` function + GATE C | `src/app/pos/jobs/components/job-queue.tsx:574-601` |
| Init effect call + GATE A | `src/app/pos/jobs/components/job-queue.tsx:711-723` |
| Refresh button call + GATE B | `src/app/pos/jobs/components/job-queue.tsx:762-779` |
| `populating` state + `populatedDates` ref | `src/app/pos/jobs/components/job-queue.tsx:423-424` |
| `scopeRef` mirror (for GATE C) | `src/app/pos/jobs/components/job-queue.tsx:281-285` |
| **Today endpoint** | |
| Today GET handler | `src/app/api/pos/jobs/route.ts:15-141` |
| Today step 1: appointment IDs for date | `src/app/api/pos/jobs/route.ts:51-55` |
| Today step 2a: jobs IN today's appts | `src/app/api/pos/jobs/route.ts:58-64` |
| Today step 2b: legacy walk-in jobs | `src/app/api/pos/jobs/route.ts:66-79` |
| Today excludeStatuses (`'cancelled'`) | `src/app/api/pos/jobs/route.ts:47` |
| Today duration enrichment | `src/app/api/pos/jobs/route.ts:108-134` |
| **Today scope UI** | |
| Daily summary memo | `src/app/pos/jobs/components/job-queue.tsx:746-754` |
| Daily summary render + gate | `src/app/pos/jobs/components/job-queue.tsx:883-905` |
| List render + empty state | `src/app/pos/jobs/components/job-queue.tsx:1041-1058` |
| List body | `src/app/pos/jobs/components/job-queue.tsx:1059-1215` |
| Timeline lane bucketing | `src/app/pos/jobs/components/job-timeline.tsx:422-436` |
| `fetchJobs` callback | `src/app/pos/jobs/components/job-queue.tsx:464-481` |
| **Walk-in pathway** | |
| Walk-in POST handler | `src/app/api/pos/jobs/route.ts:147-536` |
| Walk-in atomic appointment INSERT | `src/app/api/pos/jobs/route.ts:383-415` |
| Walk-in atomic job INSERT | `src/app/api/pos/jobs/route.ts:470-490` |
| Walk-in rollback on job INSERT failure | `src/app/api/pos/jobs/route.ts:492-498` |
| Walk-in button | `src/app/pos/jobs/components/job-queue.tsx:780-788` |
| **Cross-table consumers** | |
| `withHasActiveJob` derivation | `src/app/admin/appointments/has-active-job.ts:30-38` |
| POS appointment GET has_active_job | `src/app/api/pos/appointments/[id]/route.ts:71-92` |
| POS PATCH assigned_staff cascade | `src/app/api/pos/appointments/[id]/route.ts:323-329` |
| Service-edit linked-job snapshot | `src/lib/appointments/service-edit.ts:319-323` |
| Service-edit linked-job update | `src/lib/appointments/service-edit.ts:498-510` |
| Mobile-service POS cascade onto jobs | `src/app/api/pos/appointments/[id]/mobile-service/route.ts:163, 181` |
| Mobile-service admin cascade onto jobs | `src/app/api/admin/appointments/[id]/mobile-service/route.ts:109, 123` |
| Appointment reschedule jobs cascade | `src/app/api/pos/appointments/[id]/reschedule/route.ts:184` |
| Schedule scope dedup (`jobs.appointment_id`) | `src/app/api/pos/jobs/schedule/route.ts:131-141` |
| **Staff availability** | |
| `staff/available` today's-jobs count | `src/app/api/pos/staff/available/route.ts:44-50` |
| `job_count_today` display | `src/app/pos/jobs/components/job-detail.tsx:183, 1660` |
| `findAvailableDetailer` busy detection | `src/lib/utils/assign-detailer.ts:107-118` |
| **Crons (the only `jobs` reader)** | |
| Cron registrations | `src/lib/cron/scheduler.ts:107-122` |
| Lifecycle scheduleFromCompletedJobs (`status='closed'`) | `src/app/api/cron/lifecycle-engine/route.ts:215-264` |
| Lifecycle scheduleFromWorkCompleted (`status='completed'`) | `src/app/api/cron/lifecycle-engine/route.ts:357-409` |
| Lifecycle exec detailer-lookup | `src/app/api/cron/lifecycle-engine/route.ts:1022-1033` |
| **Reports + admin home** | |
| Admin home today's-counts (appointments only) | `src/app/admin/page.tsx:74-101, 213-222` |
| Admin Jobs list (filter-driven) | `src/app/api/admin/jobs/route.ts:48-92` |
| Reports — payments (no jobs reads) | `src/app/admin/reports/payments/page.tsx` |
| **Related (REQUIRES-JOB-EXISTENCE downstream)** | |
| job-detail GET | `src/app/api/pos/jobs/[id]/route.ts:84-92` |
| `pos/transactions` post-checkout job link | `src/app/api/pos/transactions/route.ts:631-650` |
| `receipt-data` cross-receipt linkage | `src/lib/data/receipt-data.ts:170, 198` |
| `vehicle-count` (post-completed jobs) | `src/lib/data/vehicle-count.ts:45-48` |
| `pending-addons-for-customer` | `src/lib/services/job-addons.ts:249-258` |
| Public gallery (`gallery_token`) | `src/app/jobs/[token]/photos/page.tsx:19, 56` |
| **Lifecycle audit cross-references** | |
| Lifecycle audit Target B.1 (populate step-by-step) | `docs/dev/APPOINTMENT_TO_JOB_MATERIALIZATION_LIFECYCLE_AUDIT.md` |
| Lifecycle audit Target B.2 (when populate runs) | `docs/dev/APPOINTMENT_TO_JOB_MATERIALIZATION_LIFECYCLE_AUDIT.md` |
| Lifecycle audit Target E.4 (4 invariants) | `docs/dev/APPOINTMENT_TO_JOB_MATERIALIZATION_LIFECYCLE_AUDIT.md` |
| Architecture doc AC-3 | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:299-318` |

---

**End of audit.**
