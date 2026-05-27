# Item 15e Phase 2 Follow-up — Status Sync Audit (2026-05-27)

> **Type:** read-only diagnostic audit. No source/migration/test changes.
> **Branch:** `audit/phase-2-status-sync-and-unmaterialize`
> **Question:** Why does editing `appointment.status` in admin/POS NOT propagate
> to `jobs.status`, and how should we (a) let operators un-materialize a job when
> reverting `confirmed → pending`, and (b) reconcile the two status fields going
> forward? Scopes three implementation paths (A narrow / B full sync / C phased)
> and recommends one. File:line references as of commit `ccf18b39` (Phase 2B merge).

---

## Context

Phase 2B (merged `ccf18b39`) wired the admin `AppointmentDetailDialog` into the
POS Jobs **Schedule** scope. During production testing the operator edited
appointment `2099ffa8-b791-49b8-a3c3-5c408c2106f9` from `confirmed → pending` in
admin and observed two simultaneous truths for one entity:

- **Live DB confirms** (queried this session via service-role REST):
  `appointments.status = 'pending'`, but its job
  (`4b02e4f2-c2c7-4aa2-a106-3804ff9b52cc`) `jobs.status = 'scheduled'`,
  `transaction_id = NULL`.
- POS Jobs **Today** scope shows "Scheduled" (reads `jobs.status`).
- Admin Appointments + POS **Schedule** pill show "Pending" (read
  `appointments.status`).

The operator surfaced two needs: a **specific** one (un-materialize the job when
reverting `confirmed → pending`) and an **architectural** one (bidirectional sync
between `appointment.status` and `jobs.status`).

**Inherited locked decisions (treated as constraints, not options):**
1. Un-materialize = **Option B (hard-delete the `jobs` row)**; appointment row preserved, status reverted.
2. Guard threshold: `job.status < 'in_progress'` → free un-materialize; `>= 'in_progress'` → type-to-confirm modal.
3. Type-to-confirm: operator types "DELETE"; modal must enumerate deleted data accurately.
4. Affordance on BOTH surfaces: admin Appointment dialog + POS job-detail ("Revert to Pending").
5. Permission: reuse `appointments.cancel` (verify against runtime `permissions`, not seed).
6. Bidirectional sync intent: appointment edits → jobs, and job lifecycle → appointment.

---

## TL;DR

**The gap is real, and it is not a one-off — it is systemic.** A scan of all 7
currently non-terminal jobs (joined to their appointments) found **6 of 7 in a
state where `appointment.status` and `jobs.status` disagree** in some way, and
**2 are actively dangerous**: one `pending → scheduled` (the operator's test) and
one **`cancelled → scheduled`** (a cancelled appointment whose job is still live
and would show as bookable work in POS Today). Three more are
`completed → scheduled/intake` (appointment marked done, job never progressed).
Only **one** pairing (`confirmed → scheduled`) is the "correct" freshly-materialized
state.

**Exactly one direction of sync exists today, and it is partial.** The POS
job-cancel endpoint (`api/pos/jobs/[id]/cancel/route.ts:145-154`) updates the
linked `appointments.status='cancelled'`. **Nothing else syncs.** In particular:
admin/POS appointment status edits never touch `jobs` (the reported gap); job
complete/start-work/intake/generic-PATCH never touch `appointments`; and even
admin **appointment**-cancel does NOT cancel the linked job (the source of the
live `cancelled → scheduled` row). So "bidirectional sync" today is one partial
edge (`job-cancel → appointment-cancel`); every other transition pair is
unsynced.

**The two enums are not 1:1.** `AppointmentStatus` (6 values) and `JobStatus`
(7 values) overlap on `in_progress`, `completed`, `cancelled` but diverge
everywhere else: `JobStatus` adds the operational sub-states `intake`,
`pending_approval`, `closed` (POS workflow granularity), and `appointment`'s
`pending` / `confirmed` / `no_show` have no direct job equivalent (`pending`/
`confirmed` map to the materialization boundary; `no_show` has no job state).
The mapping is therefore **directional and lossy**, which is the core reason a
naive "mirror the field" sync is wrong.

**Option B (hard delete) is safe but has two cleanup obligations.** Deleting a
`jobs` row CASCADE-deletes `job_photos` and `job_addons` rows
(`20260212000003_phase8_jobs_schema.sql:80,129`) and SET-NULLs
`lifecycle_executions.job_id` (`20260428000005_*:24`). Timer data + intake notes
live as columns **on the jobs row** and die with it. **Two things do NOT cascade:**
(1) **Supabase Storage objects** for `job_photos` (the rows vanish, the image
files in the bucket are orphaned), and (2) a linked **transaction**
(`jobs.transaction_id` is an FK-OUT with `ON DELETE SET NULL`, so the transaction
row survives but the job↔transaction link is lost). The DELETE-confirmation modal
must enumerate photos + addons + timer/intake, and un-materialize should be
**blocked outright when `transaction_id IS NOT NULL`** (money attached).

**A load-bearing re-materialization invariant governs the whole feature.**
`populate` (`api/pos/jobs/populate/route.ts:64-90`) materializes jobs from
appointments with status `confirmed` or `in_progress` for today/past dates, and
**dedups on existing `jobs.appointment_id`** (UNIQUE constraint,
`20260329000002_*:21`). Therefore un-materialize MUST revert `appointment.status`
to a **non-materializing** value (`pending`) in the same operation — otherwise the
next Today-scope load re-creates the very job that was just deleted. This is why
"un-materialize" and "revert to pending" are inseparable: they are two halves of
one atomic action.

**Permission reality differs from seed.** The seed grants `appointments.cancel`
to admin/super_admin only (`20260212000003_*` companion seed; cashier/detailer
false). **The live `permissions` table grants it to ALL FOUR roles** (queried
this session: cashier=true, detailer=true). So "reuse `appointments.cancel`"
(Decision 5) currently means **every POS role, including detailer, can
un-materialize** — including the destructive `>= in_progress` path. That is a
decision the operator must confirm (Target 12).

**Recommended path: C (phased) — ship narrow un-materialize now (Phase 2C),
track full bidirectional sync as a new roadmap item (Item 15h).** Path A's
un-materialize is genuinely a *subset* of Path B's sync (it is the
`confirmed → pending` reverse edge), so building it as a small shared helper
(`src/lib/appointments/lifecycle-sync.ts`) with the re-materialization invariant
baked in creates the seam Path B extends rather than throwaway work. Path A alone
does **not** fix the `cancelled → scheduled` or `completed → scheduled` divergences
the DB scan found — those need Path B — but it delivers the operator's immediate
need safely and surfaces the full-sync scope as explicit, separately-estimated
work rather than smuggling a large architecture change into a "bug fix."

---

## Detailed findings per target

### Target 1 — Status enum mapping

| | `AppointmentStatus` | `JobStatus` |
|---|---|---|
| **Defined** | `src/lib/supabase/types.ts:9` | `src/lib/supabase/types.ts:1043` |
| **Values** | `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show` | `scheduled`, `intake`, `in_progress`, `pending_approval`, `completed`, `closed`, `cancelled` |
| **DB CHECK** | (appointments table) | `20260212000003_phase8_jobs_schema.sql:21-22` |

**Conceptual mapping (directional, lossy):**

| appointment.status | natural job.status | Notes |
|---|---|---|
| `pending` | *(no job)* | Pre-materialization. A job existing here = divergence (the bug). |
| `confirmed` | `scheduled` | The materialization boundary — `populate` creates a `scheduled` job. |
| `in_progress` | `intake` / `in_progress` | Job is being worked. `intake` (POS sub-state) has no appointment equivalent. |
| `completed` | `completed` / `closed` | `closed` = completed + paid (POS sub-state); no appointment equivalent. |
| `cancelled` | `cancelled` | Direct match. |
| `no_show` | *(no direct equiv)* | Appointment-only. No job state means "no_show"; closest is leave-as-is or cancel. |
| *(none)* | `pending_approval` | Job-only (mid-service addon authorization). No appointment equivalent. |

**Takeaway:** the fields are **not** mirror images. `JobStatus` is finer-grained
on the operational axis (`intake`, `pending_approval`, `closed`); `AppointmentStatus`
is finer-grained on the lifecycle axis (`pending`, `confirmed`, `no_show`). Any
sync must be a **deliberate mapping table**, not a field copy.

### Target 2 — Job creation paths

Two paths create `jobs` rows:

**(A) `populate` — materialization from appointments**
(`src/app/api/pos/jobs/populate/route.ts`):
- **Trigger:** POS Today-scope load / Refresh for today or a past date
  (`job-queue.tsx` init + refresh; gated to `scope==='today'` since Phase 1B).
- **Source filter:** appointments with `status IN ('confirmed','in_progress')` on
  the target date (`:64-65`); future dates short-circuit (`:42-47`, Phase 1A gate).
- **Dedup:** skips appointments that already have a job (`:76-90`); UNIQUE on
  `jobs.appointment_id` (`20260329000002_*:21`) is the DB backstop.
- **Initial `jobs.status`:** `'scheduled'` (`:160`).
- **Touches `appointment.status`?** No — pure read of appointments, write to jobs only.

**(B) Walk-in synthetic appointment + job**
(`src/app/api/pos/jobs/route.ts` POST):
- **Trigger:** "New Walk-in" in POS Jobs.
- Creates a **synthetic appointment** with `status='in_progress'`, `channel='walk_in'`
  (`:384-399`), then a **job** with `status='scheduled'` (`:471-478`).
- **Designed status mismatch at birth:** appointment `in_progress` vs job
  `scheduled`. (Walk-ins are "happening now" appointments; the job still starts at
  `scheduled` and the detailer advances it.) Any sync logic must not "correct"
  this pairing.
- Rollback on failure deletes the synthetic appointment (`:443`, `:494`);
  `appointment_services` rows CASCADE with the appointment.

No other code path inserts into `jobs` (verified: admin has GET-only job routes —
`api/admin/jobs/route.ts`, `api/admin/jobs/[id]/route.ts`).

### Target 3 — Status edit paths

**Writers of `appointment.status`:**

| Path | Writes appt.status | Writes jobs.status? | Should it? |
|---|---|---|---|
| Admin PATCH `api/appointments/[id]/route.ts:109` | any value | **No** (no `jobs` write at all) | Yes (the gap) |
| POS PATCH `api/pos/appointments/[id]/route.ts:275` | any value | **No** — only `assigned_staff_id` sync (`:301-308`), never `status` | Yes (the gap) |
| Admin appt cancel `api/appointments/[id]/cancel/route.ts:77` | `cancelled` | **No** | Yes — leaves `cancelled → scheduled` orphans (found live) |
| POS appt cancel `api/pos/appointments/[id]/cancel/route.ts` | `cancelled` | **No** | Yes |
| Walk-in create `api/pos/jobs/route.ts:389` | `in_progress` (new row) | n/a (creates the job) | n/a |
| POS **job**-cancel `api/pos/jobs/[id]/cancel/route.ts:147-154` | `cancelled` (reverse sync) | (writes jobs first) | already syncs ✅ |

**Writers of `jobs.status`:**

| Path | Writes jobs.status | Writes appt.status? | Should it? |
|---|---|---|---|
| `populate` `:160` | `scheduled` (new rows) | No | n/a (creation) |
| start-work `api/pos/jobs/[id]/start-work/route.ts:52-53` | `in_progress` | **No** | Yes (job→appt forward) |
| complete `api/pos/jobs/[id]/complete/route.ts:87-88` | `completed` | **No** | Yes (job→appt forward) |
| cancel `api/pos/jobs/[id]/cancel/route.ts:104-105` | `cancelled` | **Yes → `cancelled`** (`:147-154`) | already syncs ✅ |
| generic job PATCH `api/pos/jobs/[id]/route.ts:113,189` | any (incl. `intake`, `status`) | **No** | Yes (job→appt forward) |
| checkout/link-transaction (sets `transaction_id`, may set `closed`) | varies | No | depends |

**No cron writes either status field** as a lifecycle transition (lifecycle-engine
`:668` `status:'pending'` is execution-context, not appointment; booking-reminders
writes only `reminder_sent_at` `:101`).

### Target 4 — Existing partial sync behavior (LOAD-BEARING)

**Exactly one sync edge exists, and it is partial:**

- ✅ **POS job-cancel → appointment-cancel** (`api/pos/jobs/[id]/cancel/route.ts:145-154`):
  cancelling a job sets the linked `appointments.status='cancelled'` +
  `cancellation_reason`, and sends customer SMS/email directly
  (`renderSmsTemplate('appointment_cancelled')`, `:255`).

**Everything else does NOT sync:**
- ❌ Job **complete** → appointment stays whatever it was (found live:
  `completed → scheduled/intake` pairs exist because admin marked the appt completed
  while the job stayed, OR the job was completed while the appt stayed `confirmed`).
- ❌ Job **start-work** / **intake** / generic PATCH → appointment unchanged.
- ❌ Appointment status edit (admin or POS) → job unchanged (**the reported gap**).
- ❌ Appointment **cancel** (admin or POS) → job unchanged (**source of the live
  `cancelled → scheduled` orphan** — a cancelled appointment with a live job).

**Conclusion:** bidirectional sync does **not** exist. One direction of one
transition (job-cancel → appt-cancel) is implemented. Both directions of every
other transition must be built for Path B. Un-materialize (Path A) is a brand-new
edge not currently covered by anything.

### Target 5 — Schema relationships and cascade

**`jobs` table** (`20260212000003_phase8_jobs_schema.sql:10-47`):
- FK **out**: `appointment_id → appointments(id) ON DELETE SET NULL` (`:14`),
  `transaction_id → transactions(id) ON DELETE SET NULL` (`:15`),
  `customer_id → customers(id) ON DELETE CASCADE` (`:16`), `vehicle_id`,
  `assigned_staff_id`, `created_by` (all SET NULL).
- UNIQUE on `appointment_id` (`20260329000002_jobs_appointment_id_unique_constraint.sql:21`).

**FK *into* `jobs.id` (what gets deleted/orphaned when a job row is hard-deleted):**

| Referencing table | Column | ON DELETE | Effect of deleting the job |
|---|---|---|---|
| `job_photos` | `job_id` | **CASCADE** (`:80`) | Photo **rows** deleted. **Storage objects orphaned** (not auto-removed). |
| `job_addons` | `job_id` | **CASCADE** (`:129`) | Addon requests deleted (incl. live `authorization_token`s). |
| `lifecycle_executions` | `job_id` | **SET NULL** (`20260428000005_*:24`) | Execution history preserved; link nulled. |

**Data that lives ON the jobs row (dies with it):** `timer_seconds`,
`work_started_at/completed_at`, `timer_paused_at`, `intake_started_at/completed_at`,
**`intake_notes`**, `estimated_pickup_at`, `actual_pickup_at`, `pickup_notes`,
`services` JSONB, `gallery_token`.

**Two non-cascading obligations for Option B:**
1. **Supabase Storage cleanup** — `job_photos.storage_path` files are NOT removed
   by the DB CASCADE. Un-materialize must either delete them explicitly or
   knowingly orphan them (recommend explicit delete via storage API in the same
   handler).
2. **Transaction guard** — `jobs.transaction_id` is FK-OUT `SET NULL`, so deleting
   a job leaves the transaction row intact but **unlinked**. A job with
   `transaction_id IS NOT NULL` has money attached → un-materialize must be
   **blocked** (not just confirmed). The live test job has `transaction_id=NULL`,
   so the common case is clean.

**The DELETE-confirmation modal (Decision 3) must enumerate:** N photos (+ "photo
files will be permanently deleted"), N addon requests, timer/work duration,
intake notes (if present). It must **refuse** if a transaction is linked.

### Target 6 — Display source-of-truth per surface

| Surface | Reads | Citation | Confirms operator? |
|---|---|---|---|
| POS Jobs **Today** card | `jobs.status` via `STATUS_CONFIG[job.status]` | `job-queue.tsx:849,917-918` | ✅ job.status |
| POS Jobs **Schedule** pill (Phase 2B) | `appointment.status` via `getAppointmentStatusPillClasses(entry.status)` | `job-queue.tsx:~1128` | ✅ appointment.status |
| POS **job-detail** header | `jobs.status` via `STATUS_CONFIG[job.status]` | `job-detail.tsx:790` | ✅ job.status |
| Admin Appointments **day list** | `appointment.status` via `APPOINTMENT_STATUS_LABELS[appt.status]` | `day-appointments-list.tsx:77-78` | ✅ appointment.status |
| Admin Appointment **dialog** | `appointment.status` (Status `<select>` default) | `appointment-detail-dialog.tsx` (form reset to `appointment.status`) | ✅ appointment.status |

**Confirms the operator's observation.** Note a Phase-2B-specific wrinkle: the
POS Schedule pill reads **appointment**.status while the POS Today card reads
**job**.status, so **within POS** the same materialized appointment can display
two different labels depending on which scope you are viewing — the Schedule pill
agrees with admin, the Today card does not. Phase 2B did not create the
divergence, but it made it visible inside one product surface.

### Target 7 — Path A: Narrow un-materialize

**Scope:** one new action handling `confirmed/in_progress → pending` reversion with
hard-delete of the job.

- **New endpoint(s):** `POST /api/pos/appointments/[id]/unmaterialize` (HMAC +
  `checkPosPermission`) and an admin equivalent `POST /api/appointments/[id]/unmaterialize`
  (cookie + `requirePermission`). *Or* fold into the existing PATCH routes when
  the transition is `→ pending` and a job exists (less explicit; not recommended).
- **Action (atomic, single handler):**
  1. Load job by `appointment_id`; if none, just set status (no-op delete).
  2. **Guard:** if `job.transaction_id IS NOT NULL` → 409 (money attached).
  3. **Threshold (Decision 2):** `job.status` in (`scheduled`,`intake`) → proceed;
     `>= in_progress` → require `confirm: "DELETE"` body flag.
  4. Explicitly delete `job_photos` Storage objects (Target 5 obligation #1).
  5. `DELETE FROM jobs WHERE id = …` (CASCADE removes `job_photos`/`job_addons`
     rows; SET NULL on `lifecycle_executions`).
  6. `UPDATE appointments SET status='pending'` — **mandatory** (re-materialization
     invariant; otherwise `populate` recreates the job).
  7. Audit row (`source`, `previous_job_status`, deleted-counts), `entityType:'job'`, action `'delete'`.
- **UI (Decision 4):** admin dialog — when admin selects `pending` (or another
  non-materializing earlier state) and a job exists, intercept Save → confirm
  modal. POS job-detail — "Revert to Pending" button gated on the threshold modal.
- **Permission:** `appointments.cancel` (see Target 12 — currently granted to all
  roles at runtime).
- **Webhooks:** none (Target 10).
- **Tests:** endpoint permission/guard/threshold matrix; CASCADE + storage cleanup;
  re-materialization invariant (after un-materialize, a Today-scope populate must
  NOT recreate the job); transaction-guard 409.

**Estimate:** ~3-4 production files (POS endpoint, admin endpoint, shared helper,
+ 2 UI surfaces) + tests; ~250-350 lines; **likely its own session, may split per
Memory #8.** Does **not** address `cancelled → scheduled` or `completed → scheduled`.

### Target 8 — Path B: Full bidirectional sync

**Scope:** a canonical mapping library + wiring on every status writer.

- **`src/lib/appointments/lifecycle-sync.ts`** — two pure functions:
  - `jobStatusForAppointmentStatus(apptStatus, currentJobStatus, hasJob)` → an
    *action*: `none` | `materialize` | `set_job_status(x)` | `delete_job` (un-materialize).
  - `appointmentStatusForJobStatus(jobStatus, currentApptStatus)` → `none` | `set_appt_status(x)`.
  - The mapping must encode the lossy/directional rules from Target 1 (e.g.
    `intake`/`pending_approval` job states map **back** to appointment
    `in_progress`; `closed` → `completed`; walk-in `in_progress`-appt + `scheduled`-job
    is a tolerated pairing, not a correction target).
- **Wire forward (appt → job):** admin PATCH (`api/appointments/[id]`), POS PATCH
  (`api/pos/appointments/[id]`), both cancel endpoints.
- **Wire reverse (job → appt):** start-work, complete, generic job PATCH (status),
  job-cancel (already partial — fold into the helper).
- **Un-materialize** becomes the `delete_job` action of the forward mapping
  (`confirmed → pending` with active job) — i.e. Path A is a strict subset.
- **Webhook de-duplication** (Target 10) is mandatory here: completing a job and
  syncing the appointment to `completed` must not fire BOTH the job-completion
  notifications AND the `appointment_completed` webhook.
- **Tests:** every transition pair in both directions; webhook-once invariant;
  walk-in pairing tolerated; concurrent edit race.

**Estimate:** ~6-9 files, ~500-800 lines, **2-3 sessions (clearly Memory #8 split).**
Resolves all divergences found in the DB scan.

### Target 9 — Path C: Un-materialize now, sync later (phased)

- **Phase 2C** = ship Path A, but build step 6's status write through a **thin
  seam** (`src/lib/appointments/lifecycle-sync.ts` with just the `delete_job`/
  `materialize` cases implemented). The endpoint calls the helper; the helper is
  later expanded for Path B.
- **New roadmap item (Item 15h)** = Path B's full mapping + wiring + webhook
  dedup, built by filling in the helper's remaining cases and wiring the other
  writers.
- **Invariants Path A must preserve so Path B builds cleanly:**
  1. Un-materialize ALWAYS reverts `appointment.status` to a non-materializing
     value in the same transaction (the re-materialization invariant). Path B's
     forward mapping depends on this being the single definition of "un-materialize."
  2. The Storage-cleanup + transaction-guard logic lives in the helper/handler,
     not the UI, so Path B reuses it.
  3. No webhook fires on un-materialize (so Path B's webhook-dedup work starts
     from a clean "reversions are silent" baseline).
- **Technical debt introduced by shipping A first:** minimal — the only risk is
  two endpoints (`/unmaterialize`) that Path B might prefer to fold into PATCH;
  that is a cheap later consolidation, not a rewrite. Path A does NOT fix the
  `cancelled → scheduled` / `completed → *` divergences, so those remain visible
  until Item 15h — that is the explicit cost of phasing.

### Target 10 — Webhook implications

**Current webhook firing:**
- `appointment_confirmed` / `appointment_completed`: fire from **admin** PATCH
  (`api/appointments/[id]/route.ts:140-148`) and **POS** PATCH (Phase 2A,
  `api/pos/appointments/[id]/route.ts:~318`).
- `appointment_cancelled`: fires from admin appt-cancel (`:100`, `:148`) and POS
  appt-cancel (Phase 2A).
- **Job complete** fires `sendCompletionNotifications` (job-level customer SMS/email,
  `complete/route.ts:124`) — **NOT** the `appointment_completed` webhook.
- **Job cancel** sends `appointment_cancelled` **SMS/email directly**
  (`cancel/route.ts:255`) — **NOT** the n8n `appointment_cancelled` webhook.

**Per path:**
- **Path A (un-materialize):** fires **nothing**. Reverting to `pending` is
  returning to the original pre-confirmation state; no customer-facing event.
  (Confirm in Target 12.)
- **Path B (full sync):** **webhook duplication is the central risk.** If admin
  edits `appointment.status='completed'` → today that fires `appointment_completed`
  webhook. If a sync also drove `jobs.status='completed'`, and the reverse path or
  job-complete also notified, the customer could receive two "done" messages.
  Likewise job-complete → appt `completed` must NOT additionally fire
  `appointment_completed` if job-completion notifications already fired.
  **Recommended policy:** designate **one** owner per event — appointment-status
  edits own the appointment_* webhooks; job lifecycle owns job-completion
  notifications; the sync helper sets the *other* field **without** re-firing the
  peer's notification (pass a `suppressWebhook`/`syncOrigin` flag through the
  write).

### Target 11 — Risk matrix

| Risk | Path A | Path B |
|---|---|---|
| **Data loss** (hard delete) | Photos/addons/timer/intake gone; mitigated by threshold modal + transaction-block + Storage cleanup | same, across more triggers |
| **Storage orphans** | Real — must delete `job_photos` files explicitly | same |
| **Re-materialization** (job reappears) | Mitigated by mandatory `→ pending` revert | must hold across all forward mappings |
| **Webhook duplication** | None (fires nothing) | **High** — needs single-owner + suppress flag |
| **Race condition** (admin edit ∥ POS detailer action) | Low (narrow surface) | **Medium** — concurrent appt-edit + job-advance; last-writer-wins on each field could re-diverge; consider a transaction/recompute |
| **Walk-in mispairing** | N/A | Must tolerate `in_progress`-appt + `scheduled`-job (designed) |
| **Permission over-grant** | `appointments.cancel` is runtime-granted to ALL roles incl. detailer → detailer can hard-delete | same |
| **Test coverage** | Moderate (matrix + invariant) | Large (full pair matrix + webhook-once) |
| **Migration** | None (uses existing schema) | None expected (logic-only); possibly a `sync_origin` audit column |

### Target 12 — Open operator decisions

**Path-independent:**
1. **Permission grant reality (Decision 5):** runtime `appointments.cancel` is
   granted to **all four roles** (cashier + detailer included), diverging from the
   seed (admin+ only). Reusing it means **detailer can un-materialize / hard-delete
   jobs**, including the `>= in_progress` destructive path. Confirm: keep as-is, or
   introduce a narrower key, or tighten the runtime grant?
2. **Transaction-linked jobs:** confirm un-materialize is **blocked** (409) when
   `jobs.transaction_id IS NOT NULL` (recommended) vs. allowed-with-extra-confirm.
3. **Storage objects:** explicitly delete `job_photos` files on un-materialize
   (recommended) vs. knowingly orphan them.
4. **Webhook on un-materialize:** confirm **none** (recommended).

**Path B specific (defer unless choosing B now):**
5. `cancelled → confirmed` re-edit: re-create a fresh job, or only allow if no job
   ever existed?
6. Detailer-initiated job-cancel → appointment `cancelled` (current) vs `no_show`?
7. `completed`/`no_show` appointment edits with a live job: sync action?
8. Webhook single-owner policy (Target 10) sign-off.

**UI placement:**
9. Admin dialog: intercept on Save-with-earlier-status (recommended) vs a separate
   "Revert/Un-materialize" button.
10. POS job-detail: "Revert to Pending" button placement + threshold-modal copy.

---

## Recommended path

**Path C.** Ship the operator's immediate, specific need — un-materialize on
`confirmed → pending` — as **Phase 2C** (Path A built behind a thin
`lifecycle-sync.ts` seam with the re-materialization invariant, transaction-guard,
Storage cleanup, and the type-to-confirm modal). Track the full bidirectional
reconciliation — which the DB scan proves is needed (the live `cancelled →
scheduled` and `completed → scheduled` rows) — as a **new roadmap item (Item 15h)**
that extends the same helper.

**Rationale:** (1) the operator's need is narrow and urgent; Path A delivers it in
one session. (2) Un-materialize is a strict subset of bidirectional sync, so doing
it first as a shared helper is not throwaway work — it is Path B's first case. (3)
Full sync carries real webhook-duplication and race complexity (Target 10/11) that
deserves its own scoped session, not a rushed bundle. (4) Phasing makes the
remaining divergence explicit and separately estimated rather than implied.

The operator locks the path + Target 12 decisions in conversation before any
implementation session.

---

## Verification of audit hard rules

- ✅ No source code in `src/` modified (read-only investigation).
- ✅ No migrations created or changed.
- ✅ No test files changed.
- ✅ Only new files: this audit + the 3 standard doc updates (CHANGELOG, ROADMAP
  ledger, FILE_TREE).
- ✅ Every finding cites file:line (or migration:line / live-DB query).
- ✅ Produces options for Target 12; does not unilaterally lock the plan.
- ✅ Existing arc preserved (Phase 1/2 untouched); D43-D50 / D45-D48 not referenced
  or altered.
- ✅ Live-DB SQL run (via service-role REST) confirmed the gap, the runtime
  permission grant, and the systemic divergence (6/7 non-terminal jobs).
