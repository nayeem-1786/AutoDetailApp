# Appointment ↔ Job Materialization Lifecycle — Foundational Audit

> Read-only foundational Component Behavior audit, 2026-06-03.
> Branch: `audit/appointment-to-job-materialization-lifecycle`.
> Memory #29 type 3 (Component Behavior).
>
> **Foundation work.** Sits BELOW the conceptual audit
> (`TODAY_VS_SCHEDULE_CONCEPTUAL_AUDIT.md`, merge `26521e5a`) and the
> day's tactical pile (`b0efd95f` state machine, `d3671c82`
> consequence map, `d1eb1e24` Edit-in-POS, `b346d34b` parity,
> `f73661b7` manual-amount + no_show). Everything else stacks on
> this model — Today vs Schedule, the forward-arrow, dialog parity,
> state-machine asymmetry — and the operator needs the complete
> materialization picture before deciding architectural direction.
>
> **No source / migration / test changes. No fix recommendations.
> No operator-decision pre-resolution.** The audit's deliverable IS
> the model.

---

## Executive summary

`appointments` is the BOOKING ledger; `jobs` is the WORK EXECUTION
ledger. They are TWO TABLES, 1:1 paired by `jobs.appointment_id`
(`UNIQUE` constraint; ON DELETE SET NULL). Forward materialization
(`appointments → jobs`) happens exactly two ways: **eager** on
walk-in creation (`POST /api/pos/jobs`) and **on-demand lazy** when
an operator opens POS > Jobs in Today scope (the init effect calls
`/api/pos/jobs/populate`). Populate is server-gated to today-or-past
and only materializes `confirmed`/`in_progress` appointments. **No
cron schedules materialization** — the materialization step is
strictly operator-triggered or eagerly-walk-in-triggered. Reverse
un-materialization (`jobs → appointments`) is operator-initiated
via the dialog Save intercept when reverting an earlier lifecycle
state (`confirmed → pending`), implemented by the canonical
`executeUnMaterialize` seam in `src/lib/appointments/lifecycle-sync.ts`.
Beyond materialization, the two tables' status fields drift
**independently** for the entire operational workflow — POS job
status updates (start-intake, start-work, complete) write
`jobs.status` only and DO NOT cascade to `appointments.status`; the
appointment status PATCH writes `appointments.status` only and DOES
NOT (currently) cascade forward to `jobs.status` (that's Item 15h's
future work). The only existing cross-table syncs are: (1)
un-materialize (reverse `confirmed/in_progress → pending`),
(2) POS job cancel (cascades `jobs.status='cancelled'` →
`appointments.status='cancelled'`), and (3) walk-in creation
(creates both rows atomically). Everything else is single-table.

The lifecycle has **6 conceptual stages** (booked / confirmed-waiting
/ day-of-materialized / active-work / terminal / un-materialized-
reverse) with **3 forward triggers**, **2 reverse triggers**, and
**4 load-bearing invariants** the code enforces. There are
parallel "walk-in" paths that skip the booking phase entirely. The
operator's June 4 puzzle from #151 is a Stage 1 (booked, not yet
materialized) appointment visible only in Schedule scope because
the Stage 2 transition has not happened.

---

## Target A — The two tables

### A.1 — `appointments` (booking ledger)

**Schema** (DB_SCHEMA.md:148-210; created by
`supabase/migrations/20260201000015_create_appointments.sql:1-45`,
extended by 8+ later migrations):

| Lifecycle-relevant column | Type | Default / Constraint | Role |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| `customer_id` | UUID | NOT NULL, FK → customers(id) ON DELETE RESTRICT | Owner |
| `vehicle_id` | UUID | FK → vehicles(id) ON DELETE SET NULL | Booked vehicle |
| `employee_id` | UUID | FK → employees(id) ON DELETE SET NULL | Assigned detailer at booking |
| **`status`** | `appointment_status` enum | NOT NULL, DEFAULT `'pending'` | **Lifecycle axis** |
| `channel` | `appointment_channel` enum | NOT NULL, DEFAULT `'walk_in'` | Origin (online / phone / walk_in / portal) |
| `scheduled_date` | DATE | NOT NULL | Day-of |
| `scheduled_start_time` | TIME | NOT NULL | Start time |
| `scheduled_end_time` | TIME | NOT NULL | End time (drives `estimated_pickup_at` on materialization) |
| `actual_start_time` | TIMESTAMPTZ | — | (unused on POS path — jobs.work_started_at owns this) |
| `actual_end_time` | TIMESTAMPTZ | — | (unused on POS path) |
| `is_mobile` / `mobile_*` columns | various | various | Mobile-service snapshot |
| `payment_status` | `payment_status` enum | NOT NULL, DEFAULT `'pending'` | Money axis (pending/partial/paid/refunded/partial_refund) |
| `stripe_payment_intent_id` | TEXT | — | Deposit PI from booking |
| `subtotal` / `tax_amount` / `discount_amount` / `total_amount` | NUMERIC | DEFAULTs | Booking-time totals snapshot |
| `cancellation_fee` | NUMERIC | — | Admin-only on cancel (POS path locked out, Item 15b) |
| `cancellation_reason` | TEXT | — | Set on cancel |
| `job_notes` | TEXT | — | Customer-facing notes from booking |
| `internal_notes` | TEXT | — | Staff notes (also pulled into job at materialization? Not yet — see Target B.5) |
| `created_at` / `updated_at` | TIMESTAMPTZ | DEFAULT now() | Standard |
| `payment_type` | TEXT | `deposit` / `pay_on_site` / `full` | Booking-time choice |
| `deposit_amount` | NUMERIC | — | Deposit paid at booking |
| `coupon_code` / `coupon_discount` | TEXT / NUMERIC | — | Booking-time coupon |
| `reminder_sent_at` | TIMESTAMPTZ | — | T-1d reminder sent (cron) |
| `payment_link_token` / `payment_link_sent_at` / `payment_link_paid_at` / `payment_link_amount_cents` | various | — | Pay-link feature |
| `mobile_zone_name_snapshot` | TEXT | — | Mobile zone label (1:1 copied into `jobs.services` JSONB on materialization) |
| `loyalty_points_redeemed` / `loyalty_discount` | INTEGER / NUMERIC | NOT NULL, DEFAULT 0 / 0 | Loyalty snapshot |
| `manual_discount_value` / `manual_discount_label` | NUMERIC / TEXT | — | Manual discount snapshot (`appointments_manual_discount_coherent` CHECK) |

**Status enum** (`supabase/migrations/20260201000001_create_enums.sql:7`):
```
appointment_status = ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
```

**Constraints** (DB_SCHEMA.md:194-198):
- `appointments_manual_discount_coherent` — manual_discount_value AND label must coexist (or both NULL).
- `appointments_mobile_consistency` — `is_mobile=false ↔ surcharge=0`; `is_mobile=true → surcharge>0`.
- `appointments_payment_type_check` — `payment_type ∈ {deposit, pay_on_site, full}`.
- `payment_link_amount_cents_check` — `≥ 50` cents (the Stripe minimum, duplicated at the DB layer per CLAUDE.md Rule 20).
- `appointments_payment_link_token_unique` — partial UNIQUE on non-null tokens.

**Companion table:** `appointment_services` (1:N join; created in the
same migration, `:31-38`). Stores the per-service tier + price-at-
booking snapshot. ON DELETE CASCADE from appointments. Extended with
`quantity` column in `20260526182120_appointment_services_add_quantity.sql`
(D48 / Item 15e Phase 1).

### A.2 — `jobs` (work execution ledger)

**Schema** (DB_SCHEMA.md:1202-1249; created by
`supabase/migrations/20260212000003_phase8_jobs_schema.sql:10-47`,
extended by 7+ later migrations):

| Lifecycle-relevant column | Type | Default / Constraint | Role |
|---|---|---|---|
| `id` | UUID | PK | Primary key |
| **`appointment_id`** | UUID | UNIQUE, FK → appointments(id) ON DELETE SET NULL | **The link** (NULL for legacy pre-Phase-0a walk-ins) |
| `transaction_id` | UUID | FK → transactions(id) ON DELETE SET NULL | Set on checkout |
| `customer_id` | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | Denormalized for fast queries |
| `vehicle_id` | UUID | FK → vehicles(id) ON DELETE SET NULL | Denormalized |
| `assigned_staff_id` | UUID | FK → employees(id) ON DELETE SET NULL | Operational assignment (separate from booking detailer) |
| **`status`** | TEXT | NOT NULL, DEFAULT `'scheduled'`, CHECK enum | **Operational axis** |
| `services` | JSONB | NOT NULL, DEFAULT `'[]'` | Snapshot of services + prices + names (separate from appointment_services join — materialization snapshots) |
| `work_started_at` / `work_completed_at` | TIMESTAMPTZ | — | Driven by start-work / complete endpoints |
| `timer_seconds` / `timer_paused_at` | INTEGER / TIMESTAMPTZ | DEFAULT 0 / — | Live timer |
| `intake_started_at` / `intake_completed_at` | TIMESTAMPTZ | — | Intake phase |
| `intake_notes` | TEXT | — | Operator-edited (separate from `appointments.job_notes`) |
| `estimated_pickup_at` / `actual_pickup_at` / `pickup_notes` | TIMESTAMPTZ / TIMESTAMPTZ / TEXT | — | Pickup metadata |
| `created_at` / `updated_at` | TIMESTAMPTZ | DEFAULT now() | Standard |
| `created_by` | UUID | FK → employees(id) ON DELETE SET NULL | Operator who triggered materialization OR walk-in creation |
| `gallery_token` | TEXT | UNIQUE | Public photo gallery share token |
| `cancellation_reason` / `cancelled_at` / `cancelled_by` | TEXT / TIMESTAMPTZ / UUID | — | Set on cancel (`/api/pos/jobs/[id]/cancel`) |
| `quote_id` | UUID | FK → quotes(id) | Set on quote-to-job conversion (walk-in from quote) |

**Status enum (CHECK constraint, not Postgres ENUM)** (`jobs_status_check`,
DB_SCHEMA.md:1234):
```
jobs.status ∈ {'scheduled', 'intake', 'in_progress', 'pending_approval', 'completed', 'closed', 'cancelled'}
```

**Critical constraint** (`supabase/migrations/20260329000002_jobs_appointment_id_unique_constraint.sql`):
```sql
ALTER TABLE jobs ADD CONSTRAINT jobs_appointment_id_unique UNIQUE (appointment_id);
```

Full UNIQUE (replacing the earlier partial UNIQUE INDEX from
`20260212000008_jobs_unique_appointment_id.sql`). The full constraint
allows multiple NULLs (PostgreSQL default), so legacy walk-in jobs
with `appointment_id IS NULL` are unaffected. It exists specifically
so Supabase JS `.upsert({ onConflict: 'appointment_id' })` can dedup
on concurrent populate calls — Supabase doesn't support `ON CONFLICT
... WHERE` for partial indexes.

**Companion tables:** `job_photos` (CASCADE), `job_addons` (CASCADE).

### A.3 — The relationship

**1:1, optional on jobs side.**

- **A → J (forward):** an appointment may have 0 or 1 jobs.
  Future-dated/pending appointments have 0 jobs; same-day
  confirmed/in_progress appointments have 1 job after materialization.
- **J → A (reverse):** a job typically has 1 appointment
  (`jobs.appointment_id`). Legacy pre-Phase-0a walk-in jobs may have
  `appointment_id IS NULL` (`src/app/api/pos/jobs/route.ts:66-79`).
  Post-Phase-0a walk-ins always carry a synthetic appointment, so
  `appointment_id` is non-null for all new walk-ins
  (`src/app/api/pos/jobs/route.ts:383-415` eager INSERT pattern).
- **Cardinality enforcement:** the UNIQUE constraint guarantees a
  given appointment can have at most one job. Re-materialization is
  prevented by populate's idempotent `.upsert(..., ignoreDuplicates: true)`
  (`src/app/api/pos/jobs/populate/route.ts:169-171`).
- **Can a job exist without an appointment?** Only legacy
  pre-Phase-0a walk-ins. New code always pairs them.
- **Can an appointment have MULTIPLE jobs over time?** No — UNIQUE
  blocks it. Un-materialize deletes the job row entirely, so a
  re-materialize on the next populate creates a fresh job. Whether
  this is "the same job" or "a new job" is a matter of philosophy;
  the DB sees a fresh `jobs.id`.

---

## Target B — The forward direction (materialization)

### B.1 — The `populate` endpoint

**File:** `src/app/api/pos/jobs/populate/route.ts:1-194`.
**HTTP:** `POST` with body `{ date?: 'YYYY-MM-DD' }` (defaults to
today PST).
**Auth:** HMAC `authenticatePosRequest` (no permission check — any
authenticated POS user can trigger).

**Step-by-step** (`:30-189`):

1. **Resolve target date** (`:30-33`) — body `date` or today PST.
2. **The future-date gate** (`:42-47`) — the load-bearing invariant:
   ```ts
   if (targetDate > today) {
     console.log(`[populate] skipped — future date ${targetDate}`);
     return NextResponse.json({
       data: { created: 0, jobs: [], skipped: 'future_date' },
     });
   }
   ```
   Comment at `:35-41`: *"Populate materializes jobs for TODAY's (or
   past) work only. A FUTURE-dated appointment must NEVER become a
   job row early."*
3. **Find candidate appointments** (`:50-65`) — `appointments` rows
   where `scheduled_date = targetDate` AND `status IN ('confirmed',
   'in_progress')`. **Pending appointments are NOT materialized.**
4. **De-dup against existing jobs** (`:77-90`) — query `jobs` with
   `appointment_id IN candidateIds`, build a Set, filter candidates
   to those NOT already materialized.
5. **Fetch services** (`:96-121`) — `appointment_services` joined
   to `services` for the new appointment IDs; group by appointment.
6. **Build job insert rows** (`:123-164`) — per appointment:
   - Compute `estimated_pickup_at` from `scheduled_end_time` +
     PST offset (`:127-135`).
   - Append the mobile-fee synthetic services entry to the JSONB
     snapshot when `is_mobile=true && mobile_surcharge>0` (`:138-152`).
   - Build `{appointment_id, customer_id, vehicle_id,
     assigned_staff_id, services, status: 'scheduled',
     estimated_pickup_at, created_by}`.
7. **Idempotent upsert** (`:169-171`) — `.upsert(jobInserts,
   {onConflict: 'appointment_id', ignoreDuplicates: true})`. The
   UNIQUE constraint at the DB layer makes concurrent populate calls
   safe.
8. **Return** (`:184-189`) — `{data: {created, jobs}}`.

**What the new job row starts with:**
- `status = 'scheduled'`.
- `services` = JSONB snapshot of `[{id, name, price}, ...]` plus the
  synthetic mobile-fee entry when applicable.
- `assigned_staff_id` = the appointment's `employee_id` (copied 1:1).
- `estimated_pickup_at` = `scheduled_date + scheduled_end_time` in
  PST.
- `created_by` = the authenticated POS user.

**What populate does NOT copy from the appointment:**
- `internal_notes` — NOT copied. `intake_notes` starts as NULL.
- `job_notes` — NOT copied. The job has its own `intake_notes`.
- Mobile zone/address details — NOT directly. Reconstructed at read
  time via the embedded appointment join (`job-detail.tsx:846-855`).
- Modifier snapshot (coupon/loyalty/manual) — NOT copied to the job;
  remains on the appointment and is re-read at checkout via
  `/api/pos/jobs/[id]/checkout-items`.
- `total_amount`, deposits — NOT copied. The job's totals are
  composed at render from `services` JSONB + appointment joins.

**What populate does NOT change on the source appointment:**
- `appointments.status` STAYS the same. Materialization does NOT
  flip the appointment's status. So a `confirmed` appointment with
  a job still reads `confirmed` on the appointment row.
  (This matters for the conceptual model: `appointments.status`
  alone tells you NOTHING about whether a job exists. The
  derivation has to join.)

### B.2 — When does populate run?

**Cron schedule:** NONE.

`src/lib/cron/scheduler.ts:107-122` registers 14 cron tasks
(lifecycle-engine, quote-reminders, stock-alerts, qbo-sync,
theme-activation, google-reviews, cleanup-orders,
cleanup-idempotency, cleanup-audit-log, booking-reminders,
conversation-summaries, voice-calls-poll,
cleanup-verification-codes, process-scheduled). **None of them
call `/api/pos/jobs/populate`.**

**API call (operator-triggered):** the **only** call site in the
repo is `src/app/pos/jobs/components/job-queue.tsx:574-601`
(`populateFromAppointments(date)`), invoked from:
- the init effect on Today scope mount (`:711-723`) — fires on
  scope=today AND on date change;
- the Refresh button (`:766-772`).

Other files that mention `/api/pos/jobs/populate` only do so in
docstrings/comments (`job-detail.tsx:844`,
`flag-issue-flow.tsx:49`, `lib/appointments/edit-services.ts:12,141`,
`lib/utils/mobile-service-edit.ts:71`,
`lib/utils/compose-line-items.ts:61-96`), describing the schema or
the JSONB shape it produces — not callers.

**Eager (atomic, not via populate):** walk-in creation at
`src/app/api/pos/jobs/route.ts:147-536` creates both an
`appointments` row (`channel='walk_in'`, `status='in_progress'`,
`scheduled_date=today`) and a `jobs` row (`status='scheduled'`,
`appointment_id=<new>`) in one transaction (`:383-415` appointment
INSERT, `:470-490` job INSERT). This is parallel to populate, not
through it.

### B.3 — What populate REFUSES to do

| Refusal | Where | Behavior |
|---|---|---|
| **Future-dated** | `populate/route.ts:42-47` | Returns `{created: 0, skipped: 'future_date'}` with 200 OK. Logs `[populate] skipped — future date YYYY-MM-DD` |
| **Pending** appointments | `:65` (`.in('status', ['confirmed', 'in_progress'])`) | Not selected → not materialized. No log. Silently ignored. |
| **Cancelled / no_show / completed** appointments | `:65` | Not selected. Silently ignored. |
| **Already-materialized** appointments | `:77-90` + `:169-171` (idempotent upsert) | De-duped in app code AND at DB layer. Returns `{created: 0}` if all were already materialized. |

The gate is also enforced **client-side** by 3 defensive checks
(GATE A/B/C) in `job-queue.tsx` so the populate function is never
called from Schedule scope:
- GATE A (`:711-718`) — init effect short-circuits before populate
  when `effectiveScope === 'schedule'`.
- GATE B (`:763-769`) — Refresh button skips populate when scope is
  Schedule.
- GATE C (`:574-580`) — populate function ITSELF reads
  `scopeRef.current` and aborts if not 'today'.

Tests at `src/app/api/pos/jobs/populate/__tests__/route.test.ts:136-186`
lock the future-date gate semantics (incl. an `in_progress` future
appointment being skipped — the gate is date-based AND
status-agnostic).

### B.4 — End-to-end trace: booking → materialization

**Trace 1: customer books online for tomorrow at 2pm (pays deposit).**

1. Customer completes public booking with deposit.
2. `POST /api/book` (`src/app/api/book/route.ts:567-595`):
   - INSERTs `appointments` row with `status='confirmed'`
     (`initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'`,
     `:559`).
   - INSERTs `appointment_services` rows.
   - Records deposit transaction.
   - No `jobs` row is created.
3. **Day Before (today, before midnight):**
   - `booking-reminders` cron fires daily at 8 AM PST
     (`scheduler.ts:117`).
   - Endpoint reads `appointments WHERE scheduled_date = tomorrow
     AND status IN ('pending','confirmed') AND reminder_sent_at IS NULL`
     (`src/app/api/cron/booking-reminders/route.ts:23-32`).
   - Sends SMS/email reminder. Writes `reminder_sent_at = now()`.
   - **Does NOT mutate `appointments.status`. Does NOT touch jobs.**
4. **Day-Of (tomorrow becomes today):**
   - Operator opens POS > Jobs.
   - Today scope is the default; init effect fires
     (`job-queue.tsx:711-723`).
   - `populateFromAppointments('today-PST')` →
     `POST /api/pos/jobs/populate {date: 'today-PST'}`.
   - Server: today date — proceeds (`:42-47` not triggered).
   - Server: finds the confirmed appointment for today, no existing
     job → INSERTs a `jobs` row with `status='scheduled'`,
     `appointment_id=<the appt>`, `assigned_staff_id=<from
     appointment.employee_id>`, `estimated_pickup_at = today +
     scheduled_end_time` in PST (`:124-164`).
   - `fetchJobs('today-PST')` reads the new job; UI shows it.
5. Operator presses Start Intake →
   `PATCH /api/pos/jobs/[id]` (or `/intake`) — writes
   `jobs.status='intake'`, sets `intake_started_at`.
   **Does NOT cascade to `appointments.status`** (stays `confirmed`).
6. Start Work → `POST /api/pos/jobs/[id]/start-work` writes
   `jobs.status='in_progress'`, `work_started_at=now()`.
   `appointments.status` stays `confirmed`.
7. Complete → `POST /api/pos/jobs/[id]/complete` writes
   `jobs.status='completed'`, `work_completed_at=now()`.
   **Does NOT update `appointments.status`**. The two diverge here.
8. Checkout → operator clicks Checkout button → loads
   ticket-context from `/api/pos/jobs/[id]/checkout-items` → runs
   the register flow → `POST /api/pos/transactions` creates a
   transaction → `POST /api/pos/jobs/[id]/link-transaction` writes
   `jobs.transaction_id`, transitions `jobs.status='closed'`.

**Through the entire flow, `appointments.status` stayed at
`confirmed`. The appointment status is the BOOKING lifecycle; the
job status is the OPERATIONAL lifecycle.**

### B.5 — Edge cases

**E1. Appointment created same-day, AFTER operator opened POS Jobs.**

- Populate already ran during init for today.
- New appointment (status=confirmed) lands.
- Materialization does NOT auto-fire. The new appointment is in
  `appointments` but no job exists.
- **Next trigger:** operator presses Refresh (`job-queue.tsx:763-779`)
  OR navigates away+back. Both call `populate` again, which now
  materializes the new one.
- **If neither happens:** the appointment is invisible to POS Jobs
  Today scope but visible in POS > Appointments tab (since that
  reads appointments directly). Schedule scope also can't show it
  (server clamps `from` to tomorrow). So the new appointment is in
  a "POS Jobs blind spot" until refresh.

**E2. Appointment created with status=pending (pay-on-site
booking).**

- `POST /api/book` writes `status='pending'` when no
  `payment_intent_id` (`:559`).
- Populate filters to `confirmed | in_progress` (`:65`), so
  `pending` is NOT materialized — even if it's same-day.
- Operator must manually confirm the appointment (via dialog) to
  `status='confirmed'`. THEN populate will materialize on next run.
- Until confirmed, the appointment sits in Schedule scope
  (Schedule's filter allows `pending`/`confirmed`/`in_progress`,
  `src/app/api/pos/jobs/schedule/route.ts:12`).

**E3. Status changes confirmed → cancelled AFTER materialization.**

- Operator opens the dialog, changes status to cancelled, saves.
- The dialog routes to the cancel flow (`appointment-detail-dialog.tsx:204-211`).
- `POST /api/pos/appointments/[id]/cancel` writes
  `appointments.status='cancelled'`
  (`src/app/api/pos/appointments/[id]/cancel/route.ts:106-113`).
- **The job row stays untouched.** The cancel endpoint does NOT
  cascade to jobs (verified via grep — no `from('jobs')` in
  POS or admin appointment-cancel routes).
- Result: appointment is cancelled but the job row is orphaned at
  whatever job-status it was at (likely `scheduled` or `intake`).
- **This is a finding** — appointment.status=cancelled does NOT
  drive job.status=cancelled. The job's lifecycle continues
  independently until the operator opens it and acts.

**E4. Status changes pending → confirmed → cancelled all before
populate fires.**

- Booking creates `status='pending'`.
- Operator confirms via dialog: `status='confirmed'` (no
  materialization yet; populate hasn't run for that date).
- Customer cancels: dialog → cancel flow → `status='cancelled'`.
- Result: appointment ends at `cancelled`. **Job was never
  created.** When operator opens POS Jobs Today scope for that
  date, populate filters to `confirmed | in_progress` so the
  cancelled appointment is skipped. No job orphan.

**E5. Status changes confirmed → in_progress on the dialog (manual
flip).**

- Operator changes appointment status from confirmed to in_progress
  via the dialog.
- POS PATCH allows it (`STATUS_TRANSITIONS.confirmed = [in_progress,
  cancelled, no_show]`,
  `src/lib/appointments/status-transitions.ts:17`).
- If no job exists yet: next populate run will materialize
  (populate accepts `confirmed | in_progress`,
  `populate/route.ts:65`).
- If a job already exists: nothing changes on the job
  (`jobStatusForAppointmentStatus` returns `{kind: 'none'}` for
  this transition,
  `src/lib/appointments/lifecycle-sync.ts:59-72` — Item 15h
  territory).

**E6. Walk-in flow (no booking phase).**

- Operator presses "New Walk-in" → quote builder → creates the
  walk-in job.
- `POST /api/pos/jobs` (`src/app/api/pos/jobs/route.ts:147-536`):
  - Atomically INSERTs an `appointments` row with
    `channel='walk_in'`, `status='in_progress'`,
    `scheduled_date=today PST`, `scheduled_start_time/end_time` =
    rounded clock.
  - INSERTs `appointment_services` rows.
  - INSERTs a `jobs` row with `status='scheduled'`,
    `appointment_id=<new>`.
  - Rolls back the appointment if the job INSERT fails (`:492-498`).
- **The walk-in path SKIPS Stages 1 and 2 of the lifecycle entirely.**
  The pair appears in Stage 3 immediately.

**E7. Re-materialization after un-materialize.**

- Operator hits "Revert to Pending" on a materialized job →
  un-materialize executes: `appointments.status='pending'` first,
  then `DELETE FROM jobs WHERE id=<job>`
  (`lib/appointments/lifecycle-sync.ts:292-316`).
- Job row is gone. Appointment is `pending`.
- If operator later changes appointment back to `confirmed`, next
  populate run will INSERT a NEW job row (fresh `id`,
  `created_at=now()`). Photos / addons / timer state from the
  prior job were CASCADE-deleted; they don't come back. The new
  job starts fresh at `status='scheduled'`.

---

## Target C — The reverse direction (un-materialization)

### C.1 — `executeUnMaterialize` step by step

**File:** `src/lib/appointments/lifecycle-sync.ts:208-368`. Canonical
seam — both admin and POS un-materialize endpoints call this; it owns
all guards, ordering, Storage cleanup, and audit
(`src/app/api/appointments/[id]/unmaterialize/route.ts:53` and
`src/app/api/pos/appointments/[id]/unmaterialize/route.ts:65`).

**Step-by-step:**

1. **Load appointment** (`:215-223`) — 404 if missing.
2. **Load the job for this appointment** (`:226-234`) — 404 if no
   job exists (un-materialize is only meaningful when a job is
   present).
3. **Guard: transaction_linked** (`:239-241`) — 409 if
   `jobs.transaction_id IS NOT NULL`. Money attached; can't delete.
4. **Guard: terminal** (`:244-246`) — 409 if
   `job.status ∈ {completed, closed, cancelled}`. Finished work.
5. **Collect data enumeration** (`:248-264`) — photo count, addon
   count, timer_seconds, intake_notes presence, storage paths. Used
   by the type-to-confirm modal and the success response.
6. **Dry-run preview** (`:283-285`) — if `options.dryRun`, return
   `{ok: true, data}` without mutating. The UI uses this to render
   the deletion enumeration BEFORE the operator confirms.
7. **Guard: confirm_required** (`:288-290`) — 422 if
   `job.status ∈ {in_progress, pending_approval}` AND
   `confirmString !== "DELETE"`. The modal handles this round-trip.
8. **The load-bearing ordering** (`:292-316`):
   - **First** UPDATE `appointments.status = 'pending'`
     (`:293-296`). If this fails, NO job delete is attempted; the
     appointment stays at its old status; **safe rollback by
     omission**.
   - **Then** DELETE `FROM jobs WHERE id = <jobId>` (`:305`).
     CASCADE removes `job_photos` + `job_addons`.
     `lifecycle_executions.job_id` is SET NULL.
     If this fails, the appointment is already `pending` (a
     non-materializable status), so populate will NOT re-create the
     job on a later run. Safe partial state.
9. **Storage cleanup** (`:319-333`) — best-effort
   `supabase.storage.remove([...storagePaths,
   ...storagePaths.map(_thumb)])`. Failures are logged, never
   rolled back. Orphaned Storage objects are an acceptable cost vs
   transactional DB consistency.
10. **Audit log** (`:336-354`) — fire-and-forget
    `action: 'delete'`, `entityType: 'job'`,
    `details.reason: 'un_materialize'`. **No webhooks fire.**
11. **Return** (`:356-363`) — `{ok: true, data, deletedPhotos,
    deletedAddons, storageFilesDeleted}`.

### C.2 — Trigger conditions

**The un-materialize is OPERATOR-ONLY** and reaches the seam through
two distinct UI affordances:

**Trigger 1: dialog Save intercept (admin path; POS Schedule path).**

`src/app/admin/appointments/components/appointment-detail-dialog.tsx:200-228`
(shared dialog):

```ts
if (
  data.status !== undefined &&
  data.status !== appointment.status &&
  isEarlierState(data.status, appointment.status) &&
  appointment.has_active_job === true
) {
  setPendingFormData(data);
  setShowUnMaterializeModal(true);
  return;
}
```

Fires ONLY when:
- The Save data carries a new status.
- The new status differs from current.
- `isEarlierState(new, current)` returns true (i.e., a backward
  revert along the linear lifecycle: pending←confirmed←in_progress←completed).
- `appointment.has_active_job === true` (derived by
  `withHasActiveJob` from the embedded `jobs` relation;
  `src/app/admin/appointments/has-active-job.ts:30-38`).

`isEarlierState` (`lifecycle-sync.ts:95-103`) excludes `cancelled` /
`no_show` (those are NOT ranked in `APPT_LIFECYCLE_RANK`). So a
forward-state operator changing to `cancelled` or `no_show` does NOT
trigger un-materialize — those route through the cancel flow or
the normal PATCH instead.

After the modal confirms, it POSTs to
`/api/pos/appointments/[id]/unmaterialize` (POS host) or
`/api/appointments/[id]/unmaterialize` (admin host)
(`src/components/appointments/un-materialize-confirmation-dialog.tsx:68-72`).

**Trigger 2: explicit "Revert to Pending" button (POS only).**

`src/app/pos/jobs/components/job-detail.tsx:399-417,
829-835, 935+, 2021-2030`:

```ts
const canRevertToPending =
  canUnMaterialize &&
  !['completed', 'closed', 'cancelled'].includes(job.status) &&
  job.transaction_id == null;
```

Permission: `appointments.cancel` (`job-detail.tsx:252` — Item 15e
Phase 2C-β-2 Decision 2; no new permission key). The button is
visible only when the job has no linked transaction (the
transaction_linked guard would 409 the request, so hide upstream).

Both triggers converge on the same modal
(`UnMaterializeConfirmationDialog`), which calls one of the two
endpoints, which both call `executeUnMaterialize`.

**No automatic un-materialize anywhere.** No cron triggers it. No
indirect path. It's strictly operator-initiated.

### C.3 — Un-materialize CANNOT do

| Refusal | Cause | HTTP / message |
|---|---|---|
| Appointment missing | `:215-223` | 404 `not_found` |
| Job missing for this appointment | `:226-234` | 404 `not_found` |
| Job has linked transaction | `:239-241` | 409 `transaction_linked` |
| Job status is `completed` / `closed` / `cancelled` | `:244-246` | 409 `terminal` |
| Job at `in_progress` / `pending_approval` without confirmString | `:288-290` | 422 `confirm_required` (with data enumeration so modal can render the type-to-confirm field) |

### C.4 — End-to-end reverse trace

**Trace: operator un-materializes a confirmed in-progress job.**

State before: appointment `status=confirmed`, job `status=in_progress`,
photos x 3, addons x 1, no transaction.

1. Operator opens job in POS > Jobs > job-detail.
2. Clicks "Revert to Pending"
   (`job-detail.tsx:399`).
3. `handleRevertClick` fetches the appointment
   (`/api/pos/appointments/[job.appointment_id]`), then opens
   `UnMaterializeConfirmationDialog`
   (`job-detail.tsx:415-416`).
4. Dialog opens; immediately POSTs dry-run
   (`un-materialize-confirmation-dialog.tsx:95`):
   `POST /api/pos/appointments/[id]/unmaterialize {dryRun: true}`.
5. Server runs guards (`lifecycle-sync.ts:215-285`):
   - Appointment found.
   - Job found.
   - No transaction.
   - Not terminal.
   - Collects enumeration: 3 photos, 1 addon, timer 8 minutes,
     has intake_notes.
   - Returns `{ok: true, data: {confirmRequired: true (because
     in_progress), ...}}`.
6. UI renders the enumeration. Type-to-confirm field shown because
   `confirmRequired=true`.
7. Operator types "DELETE" + clicks Revert.
8. Dialog POSTs again (without `dryRun`) + `confirmString: 'DELETE'`.
9. Server (`lifecycle-sync.ts:288-316`):
   - Guards pass (confirmString matches).
   - UPDATE `appointments SET status='pending', updated_at=now()
     WHERE id=<appt>` → success.
   - DELETE `FROM jobs WHERE id=<job>` → CASCADE removes 3 photo
     rows + 1 addon row + `lifecycle_executions.job_id` set NULL.
10. Storage cleanup (`:319-333`) — best-effort remove 6 paths
    (3 photos + 3 thumbnails). Logged but never rolled back.
11. Audit row written (`:336-354`).
12. Returns 200 with `{data: enumeration, deletedPhotos: 3,
    deletedAddons: 1, storageFilesDeleted: 6}`.
13. Modal closes, calls `onSuccess`, UI refreshes.

State after: appointment `status=pending`, no job. Photos +
addons gone. Operator can now further edit the appointment, or
re-confirm to allow next populate to materialize a fresh job.

---

## Target D — Status lifecycles (both tables)

### D.1 — Appointment status lifecycle

**Enum:** `pending | confirmed | in_progress | completed | cancelled | no_show`.

**Allowed transitions** (`src/lib/appointments/status-transitions.ts:15-22`,
ENFORCED server-side on POS PATCH at
`src/app/api/pos/appointments/[id]/route.ts:240-251`; NOT enforced on
admin PATCH per `b0efd95f` audit):

```
pending     → confirmed | cancelled | no_show
confirmed   → in_progress | cancelled | no_show
in_progress → completed | cancelled
completed   → ∅
cancelled   → ∅
no_show     → ∅
```

ASCII diagram:

```
   pending ──→ confirmed ──→ in_progress ──→ completed
      │           │              │
      └─→ no_show ┘              │
      │                          │
      └─────────→ cancelled ←────┘
```

**Meaning of each status:**

- **`pending`** — created (online booking with pay-on-site OR
  internal manual create) but customer hasn't been confirmed.
  Booking-reminders cron WILL send a T-1d reminder
  (`booking-reminders/route.ts:31`).
  Populate WILL NOT materialize.
- **`confirmed`** — customer locked in (deposit paid OR operator
  confirmed). Reminder cron WILL fire. Populate WILL materialize
  on the day-of.
- **`in_progress`** — only reached via dialog status flip (manual)
  OR walk-in creation (which seeds `appointments.status='in_progress'`
  at creation,
  `src/app/api/pos/jobs/route.ts:389`). Populate WILL materialize.
  This is the only appointment status where a walk-in starts.
- **`completed`** — Item 15h territory. Currently NOT auto-driven by
  job completion (per Target B.4 end-to-end trace). The
  `appointments.status` reaches `completed` only if an operator
  manually flips it via dialog OR admin manually sets it (admin
  PATCH doesn't enforce STATUS_TRANSITIONS, so any state → completed
  is possible).
- **`cancelled`** — terminal. Set by POS appointment cancel, POS job
  cancel (cascade), admin cancel, or dialog Save → cancel-flow
  redirect.
- **`no_show`** — terminal. Customer didn't arrive. Reachable from
  `pending` or `confirmed`. NOT a backward revert per
  `APPT_LIFECYCLE_RANK` exclusion
  (`lifecycle-sync.ts:81-86`), so dialog Save to no_show goes
  through normal PATCH, not un-materialize. **Per the conceptual
  audit `f73661b7` Issue 2**: a `confirmed → no_show` transition
  removes the appointment from Schedule view's data set
  (`EXCLUDED_STATUSES = ['cancelled', 'no_show', 'completed']`,
  `src/app/api/pos/jobs/schedule/route.ts:12`).

### D.2 — Job status lifecycle

**CHECK constraint set** (`jobs_status_check`, DB_SCHEMA.md:1234):
`scheduled | intake | in_progress | pending_approval | completed | closed | cancelled`.

**No central STATUS_TRANSITIONS table for jobs.** Each per-action
endpoint enforces its own transition:

- `start-intake` (PATCH `/api/pos/jobs/[id]` or dedicated route) —
  requires `status='scheduled'`, sets `status='intake'`,
  `intake_started_at=now()`.
- `start-work` (`src/app/api/pos/jobs/[id]/start-work/route.ts:34`)
  — requires `status='intake'`, sets `status='in_progress'`,
  `work_started_at=now()`, may set `intake_completed_at`.
- `complete` (`src/app/api/pos/jobs/[id]/complete/route.ts:50`) —
  requires `status='in_progress'`, sets `status='completed'`,
  `work_completed_at=now()`.
- `link-transaction` (called by checkout flow) — sets
  `transaction_id` and `status='closed'`.
- `cancel` (`src/app/api/pos/jobs/[id]/cancel/route.ts:64-126`) —
  requires `status ∈ scheduled | intake | in_progress |
  pending_approval` (per `CANCELLABLE_EARLY` / `CANCELLABLE_LATE`
  constants in that file), sets `status='cancelled'`,
  `cancellation_reason`, `cancelled_at`, `cancelled_by`. Also
  cascades to `appointments.status='cancelled'` (`:148-154`) when
  `appointment_id` present.
- `pending_approval` — set by the addon flag-issue flow when a
  pending addon needs customer authorization.

ASCII diagram:

```
   scheduled ─→ intake ─→ in_progress ─→ pending_approval
                                    │           │
                                    └→ completed → closed (on checkout)
                                          
   (any of scheduled/intake/in_progress/pending_approval) ─→ cancelled
```

**Meaning of each status:**

- **`scheduled`** — materialized but not yet started. The default
  state after populate or walk-in creation.
- **`intake`** — operator has started the intake phase (photos +
  notes). Vehicle accepted.
- **`in_progress`** — active detailing work. Timer runs.
- **`pending_approval`** — flagged for customer authorization
  (addon-issue flow, awaiting customer response).
- **`completed`** — work done; not yet paid.
- **`closed`** — paid. Reached via checkout's link-transaction
  step.
- **`cancelled`** — operator cancelled the job.

### D.3 — Cross-table interactions

**Forward (appointment → job):**

| When `appointments.status` changes to… | What happens to the job? |
|---|---|
| `pending` (from confirmed/in_progress) AND job exists | **Un-materialize fires via dialog intercept** — job is DELETED, appointment status persists at `pending`. The only currently-implemented forward sync. |
| `confirmed` (from pending) | Nothing immediate. Next populate run (on the appointment's date, if today/past) will materialize. |
| `in_progress` (from confirmed) | Nothing immediate. Populate accepts in_progress same as confirmed. |
| `completed` (manually flipped) | Nothing immediate. Item 15h territory. Job status unchanged. |
| `cancelled` (via cancel endpoint) | **Nothing in the job.** The cancel endpoint writes only the appointment status. Job stays at whatever job.status was. |
| `no_show` | **Nothing in the job.** Appointment becomes invisible to Schedule (excluded status). Job is unaffected. |

**Reverse (job → appointment):**

| When `jobs.status` changes to… | What happens to the appointment? |
|---|---|
| `intake` / `in_progress` / `pending_approval` / `completed` (via per-action endpoints) | **Nothing.** The endpoints write only the job status. The appointment status stays. |
| `closed` (via link-transaction at checkout) | **Nothing direct.** The transaction is recorded; appointment's `payment_status` may flip via the payment side-effect but `appointments.status` doesn't change. |
| `cancelled` (via POS job cancel) | **Cascades** — `POST /api/pos/jobs/[id]/cancel` writes `appointments.status='cancelled'` at `cancel/route.ts:148-154`. Only cross-table cascade in the forward direction. |

**The only currently-implemented cross-table syncs are:**

1. **un-materialize** (`appointments.status='pending'` set first,
   then job deleted) — `lifecycle-sync.ts:292-316`.
2. **POS job cancel** (`jobs.status='cancelled'` + cascade
   `appointments.status='cancelled'`) —
   `src/app/api/pos/jobs/[id]/cancel/route.ts:101-126, 145-154`.
3. **Walk-in creation** (atomic INSERT of paired appointment + job) —
   `src/app/api/pos/jobs/route.ts:383-498`.

**Reframing the b0efd95f / d3671c82 audits in this lifecycle
frame:**

- The state-machine asymmetry (b0efd95f) is on the
  `appointments.status` axis only. It does NOT affect job status —
  the per-action job endpoints have their own status guards.
- The consequence map (d3671c82) covers the PATCH consequences
  (webhooks, audit log, lifecycle engine triggers) on the
  appointment axis. It does NOT cover the per-action job endpoints
  (which have their own consequences — start-work fires a
  `job_in_progress` analog? — separately).
- The dialog parity audit (b346d34b) HIGH severity un-materialize
  hardcode is on the cross-table sync seam — specifically the
  un-materialize trigger, NOT the lifecycle-sync canonical seam
  itself.

**Item 15h is the documented future work** for filling in
`materialize` and `set_job_status` (forward direction beyond just
the un-materialize case) and `appointmentStatusForJobStatus` (the
reverse mapping). `src/lib/appointments/lifecycle-sync.ts:39-43`:
*"Phase 2C uses only `none` and `delete_job`. Item 15h will add
`materialize` and `set_job_status` (and a parallel
`appointmentStatusForJobStatus` for the reverse direction)."*

---

## Target E — The complete lifecycle picture

### E.1 — The 6 stages

```
┌───────────────────────────────────────────────────────────────────┐
│ Stage 1: BOOKED (future)                                         │
│  - appointments row exists                                       │
│  - status: pending OR confirmed                                  │
│  - jobs row: DOES NOT EXIST                                      │
│  - Visible in: Schedule scope (if status ≠ excluded);            │
│                Admin Appointments; POS Appointments tab          │
│  - INVISIBLE in: POS Jobs Today scope                            │
│  - Capabilities: edit services (via Sale-tab deep-link),         │
│                  change status (forward only on POS),            │
│                  reschedule, cancel, send payment link,          │
│                  send confirmation                               │
│  - Auto-fire: T-1d booking-reminders SMS/email                   │
└───────────────────────────────────────────────────────────────────┘
              ↓ (operator changes confirmed → in_progress
                 OR day-of arrives + populate runs OR walk-in flow)

┌───────────────────────────────────────────────────────────────────┐
│ Stage 2: MATERIALIZED (day-of, paired)                           │
│  - appointments row: status confirmed OR in_progress             │
│  - jobs row: status='scheduled' (default)                        │
│  - 1:1 paired via jobs.appointment_id                            │
│  - Visible in: POS Jobs Today scope (the canonical surface);     │
│                Admin Appointments still visible                  │
│  - REMOVED from: Schedule scope (the dedup filter at             │
│                  schedule/route.ts:131-141)                      │
│  - Capabilities: Today-scope chrome (timer, photos, addons,      │
│                  status workflow, checkout, un-materialize)      │
└───────────────────────────────────────────────────────────────────┘
              ↓ (operator: Start Intake → Start Work)

┌───────────────────────────────────────────────────────────────────┐
│ Stage 3: ACTIVE WORK                                             │
│  - appointments.status unchanged (still confirmed / in_progress) │
│  - jobs.status: intake → in_progress → pending_approval          │
│  - Photos accumulate; timer runs; addons may flag                │
│  - Capabilities: photo capture, timer, addon flag-issue,         │
│                  reassign detailer, send payment link,           │
│                  un-materialize (with confirm gate)              │
└───────────────────────────────────────────────────────────────────┘
              ↓ (operator: Complete → Checkout)

┌───────────────────────────────────────────────────────────────────┐
│ Stage 4: TERMINAL                                                │
│  - jobs.status: completed → closed (when transaction linked)     │
│  - appointments.status: STAYS at confirmed/in_progress           │
│    UNLESS operator manually flips it                             │
│  - Job has transaction_id pointing to the payment                │
│  - Capabilities: review only, refund via transaction surface     │
│  - Schedule scope: excludes completed; Today scope: shows past   │
│                                                                  │
│  Sub-state: NO_SHOW                                              │
│    - appointment.status='no_show' (operator-triggered)           │
│    - job: may or may not exist depending on when no_show was set │
│    - Excluded from Schedule scope                                │
│    - Day-of POS Jobs Today scope: if job exists, still visible   │
│      (Today excludes only 'cancelled')                           │
│                                                                  │
│  Sub-state: CANCELLED                                            │
│    - Both appointment AND job: status='cancelled' (when via      │
│      POS job cancel — cascade)                                   │
│    - OR appointment-only (when via POS/admin appointment cancel) │
│      — the job, if any, keeps its prior status (orphan)          │
└───────────────────────────────────────────────────────────────────┘

              ↑ (REVERSE: dialog Save earlier-state intercept
                 OR Revert to Pending button)

┌───────────────────────────────────────────────────────────────────┐
│ Stage R: UN-MATERIALIZED                                         │
│  - Triggered by: dialog Save (status→earlier with active job)    │
│                  OR explicit "Revert to Pending" button (POS)    │
│  - executeUnMaterialize seam:                                    │
│    1. Guards (transaction_linked / terminal / confirm_required)  │
│    2. UPDATE appointments SET status='pending' FIRST             │
│    3. DELETE FROM jobs WHERE id=<job>                            │
│    4. Best-effort Storage cleanup of job_photos                  │
│    5. CASCADE removes job_photos + job_addons + lifecycle exec   │
│       backrefs (SET NULL)                                        │
│    6. Audit log entry; no webhook                                │
│  - Post-state: appointment back at Stage 1 (pending);            │
│                job row gone; photos/addons gone                  │
│  - Re-materialization possible: operator confirms → next         │
│    populate creates a FRESH job (new jobs.id)                    │
└───────────────────────────────────────────────────────────────────┘
```

### E.2 — The 3 forward triggers

1. **Walk-in atomic create** — `POST /api/pos/jobs` creates
   appointment + job pair in one INSERT pair. Skips Stages 1.
   Lands directly in Stage 2 with appointment.status='in_progress'
   and job.status='scheduled'.

2. **Operator opens Today scope** — `job-queue.tsx:711-723` init
   effect calls populate. Same-day confirmed/in_progress
   appointments → Stage 2.

3. **Operator presses Refresh in Today scope** — same as #2 but
   bypasses the populatedDates dedup (`job-queue.tsx:770`).

### E.3 — The 2 reverse triggers

1. **Dialog Save with earlier-state status change AND has_active_job**
   — `appointment-detail-dialog.tsx:219-228` intercepts before
   PATCH, opens UnMaterializeConfirmationDialog, modal POSTs to
   `/api/[pos/]appointments/[id]/unmaterialize`.

2. **Explicit "Revert to Pending" button on POS job-detail** —
   `job-detail.tsx:399-417`, calls the same modal directly.

### E.4 — The 4 load-bearing invariants

1. **Future appointments NEVER become job rows** — populate's
   future-date gate at `populate/route.ts:42-47` PLUS the 3
   client-side defensive gates A/B/C in `job-queue.tsx`. Documented
   as "load-bearing" at 4 separate in-source sites.

2. **A given appointment can have at most 1 job at a time** — the
   UNIQUE constraint on `jobs.appointment_id`
   (`20260329000002_jobs_appointment_id_unique_constraint.sql`).
   Idempotent populate (`onConflict: 'appointment_id',
   ignoreDuplicates: true`) makes concurrent calls safe.

3. **Un-materialize never leaves the appointment in a
   re-materializable state with a missing job** — the ordering at
   `lifecycle-sync.ts:292-316`: appointment first reverts to
   `pending` (a non-materializable status), THEN the job is
   deleted. A failed DELETE leaves the benign state (appointment
   pending + job exists at prior status), never the dangerous state
   (appointment confirmed + no job → would re-materialize on next
   populate).

4. **Schedule scope NEVER triggers materialization** — populate is
   the only path that creates jobs from appointments, and it's
   gated to today/past + Today-scope client gates. Schedule scope's
   GET is documented as "PURE READ" with "ZERO side effects" at
   `src/app/api/pos/jobs/schedule/route.ts:24-27`.

### E.5 — The parallel walk-in lifecycle (skip Stages 1+2)

```
   (walk-in creation)
       ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ Eager atomic INSERT pair                                     │
   │ - appointments: channel='walk_in', status='in_progress',     │
   │                 scheduled_date=today, scheduled_time=now     │
   │ - jobs: status='scheduled', appointment_id=<new>,            │
   │         created_by=<operator>                                │
   └──────────────────────────────────────────────────────────────┘
       ↓
   Stage 3 (active work, same as booked flow)
       ↓
   Stage 4 (terminal)
```

Walk-ins SKIP:
- T-1d reminders (no Stage 1; reminder cron filters to scheduled_date=tomorrow).
- Booking confirmation emails.
- Pay-link flow (typically — walk-ins pay at checkout).

Walk-ins DIFFER:
- `appointments.channel='walk_in'` — used by cancel-notification
  guard (no "Rebook appointment" wording for a walk-in who never
  booked) and by job-detail `isWalkIn` derivation.
- Suppressed status pill on the Today scope card (amber "Walk-In"
  badge instead of purple scheduled-time pill —
  `job-queue.tsx:1120-1130`).

### E.6 — Visibility matrix by stage

| Stage | POS Jobs Today | POS Jobs Schedule | POS Appointments tab | Admin Appointments |
|---|---|---|---|---|
| 1 (Booked, pending) | ✗ (no job) | ✓ if status passes filter | ✓ (no channel filter) | ✓ |
| 1 (Booked, confirmed) | ✗ (no job, future date) | ✓ | ✓ | ✓ |
| 2 (Materialized, scheduled job) | ✓ today's date | ✗ (dedup filter at schedule/route.ts:131-141) | ✓ | ✓ |
| 3 (Active work) | ✓ | ✗ (still materialized) | ✓ | ✓ |
| 4 (Completed/closed) | ✓ if same day | ✗ (excluded statuses include completed) | ✓ (non-cancelled only) | ✓ |
| 4 (No-show) | ✓ if job exists same day | ✗ (excluded) | ✓ (non-cancelled only) | ✓ |
| 4 (Cancelled) | ✗ (excluded from Today endpoint) | ✗ (excluded) | ✗ (excluded) | ✓ |
| R (Un-materialized → pending) | ✗ (no job) | ✓ (back at Stage 1) | ✓ | ✓ |

(Per the conceptual audit, POS Appointments tab is a known
overlap surface — Item 15e Phase 3 retire not shipped.)

---

## Target F — Cross-reference: prior audits in the lifecycle frame

### F.1 — State machine (`b0efd95f`)

**The state machine is the appointment.status axis ONLY.** Stage 1
→ Stage 2 → Stage 4 transitions on the appointment ledger. The
asymmetry (POS PATCH enforces, admin PATCH does not) is a
cross-host concern for who can violate the state machine. **In the
lifecycle frame, the state machine governs appointment-status
moves; the job-status moves are governed by per-action endpoint
guards (start-work, complete, etc.), not STATUS_TRANSITIONS.**

The audit's Q1 ("Cannot change confirmed → pending") is an
attempted **reverse-direction Stage 2 → Stage 1** revert. The POS
PATCH blocks it explicitly because STATUS_TRANSITIONS doesn't
permit reverse. The dialog Save intercept catches this case earlier
and routes to un-materialize INSTEAD of attempting the blocked
PATCH. So if the operator reverts via the dialog, the un-materialize
path runs; if they try a raw PATCH (curl), they hit the 400.

The audit's Q2 ("Cannot change in_progress → no_show") is a
**Stage 3 → Stage 4 (no_show)** transition. STATUS_TRANSITIONS only
allows `in_progress → completed | cancelled`. So `no_show` from
in_progress requires the override optgroup in the dialog (admin
only — POS PATCH rejects). The lifecycle model exposes this: the
no_show terminal is reachable from pending/confirmed but not from
in_progress under the strict machine. The operator's case (customer
walked out mid-job) bends the state machine.

### F.2 — Consequence map (`d3671c82`)

**Consequences are appointment-ledger PATCH-only.** Stage 2/3
transitions on the appointment side trigger webhooks
(`appointment_confirmed`, `appointment_completed`). The job
operational lifecycle does not (yet) trigger appointment-side
webhooks — the consequences are job-scoped (audit log,
lifecycle-engine reads `jobs.work_completed_at` for review/loyalty
triggers, etc.). **The consequence map is the appointment axis of
the lifecycle; a sibling map for the job axis would be Item 15h
territory.**

### F.3 — Edit-in-POS (`d1eb1e24`, fixed `#150`)

**Stage 1 only.** The "Edit in POS" button on the shared dialog
is meaningful for Stage 1 appointments (not yet materialized — no
ticket to edit). Once materialized (Stage 2+), the operator edits
via the Today-scope job-detail's checkout flow instead. The fix in
#150 wired the deep-link with `returnToPath='/pos/jobs'` so a Stage
1 appointment can be pulled into the Sale tab, services edited, and
saved back. **The button is structurally a Stage 1 affordance.**

### F.4 — Dialog parity (`b346d34b`)

**Dialog covers Stages 1, 2 (limited), 4.** The shared
AppointmentDetailDialog is the surface for:
- Stage 1 appointments (Schedule scope + Admin Appointments) →
  status edit, reschedule, cancel, edit services, send payment
  link.
- Stage 2/3 appointments (admin Appointments page, since POS
  Jobs Today uses the job-detail surface) → the dialog still
  works but the operator usually goes through job-detail instead.
- Stage 4 (no_show / cancelled / completed) — read-mostly via the
  dialog (admin); terminal statuses block most edits via
  `SERVICE_EDIT_TERMINAL_STATUSES`
  (`status-transitions.ts:36-40`).

The HIGH severity un-materialize-context-hardcode finding sits at
the **Stage 2 → Stage R reverse transition**. The dialog is mounted
in both admin and POS hosts; the hardcoded `context="admin"` breaks
the POS revert flow's endpoint routing
(`un-materialize-confirmation-dialog.tsx:69-71`).

### F.5 — Manual amount + no_show (`f73661b7`)

**Issue 1 (manual amount silent-drop):** Stage 2/3 — Sale-tab
edit-mode of a materialized job/appointment. The `itemType='custom'`
row is dropped at Save Changes. Lifecycle: Stage 3 capability gap
(operator can add a manual amount but it doesn't persist).

**Issue 2 (no_show disappearance from Schedule):** Stage 1 →
Stage 4(no_show) transition. The Schedule view's EXCLUDED_STATUSES
removes the row from the data set as soon as the transition lands.
**This is a lifecycle visibility decision: should no_show
appointments be visible during Stage 4?** The audit reframed it as
a conceptual-model decision, which it remains.

**Issue 2a (filter label):** Stage 1 capability surface issue — the
Schedule filter dropdown label "All Statuses" misleads because the
3 actionable Stage 1 statuses are the only possible values.

### F.6 — Today vs Schedule conceptual (`26521e5a`)

**Today scope = Stages 2/3/4 (materialized). Schedule scope =
Stage 1 (un-materialized future).** The forward-arrow in Today
shows Stages 2/3/4 for the navigated date (empty for any future
date because Stage 2 transition has not happened). The June 4
puzzle is a Stage 1 appointment that the operator expected to see
in the Today forward-arrow but couldn't because the forward-arrow
queries Stage 2+. The seam the conceptual audit identified is the
forward-arrow advertising navigation into a stage transition that
hasn't happened.

---

## Target G — Open operator questions

The audit does NOT pre-resolve any of these. They are surfaced for
the operator to consider given the full lifecycle picture.

### G.1 — Should populate be available as a cron?

Currently materialization is operator-triggered (Today scope mount /
Refresh) or walk-in eager. Should there be a daily 6:00 AM PST
materialize-cron so the `jobs` table is consistent without
requiring a POS open? Would simplify reports/dashboards that read
`jobs` for "today's expected work."

Tradeoff: the operator-trigger pattern keeps the `jobs` table
"lazy" — only created when needed. The cron pattern creates job
rows even for days no one opens POS Jobs (e.g., closed days). Both
respect the future-date invariant.

### G.2 — Should operators be able to manually materialize?

Today the operator has no UI affordance to say "materialize this
specific future appointment now." If the customer arrives 2 hours
early for a tomorrow appointment, the operator must either:
- Manually create a walk-in (loses the original appointment link).
- Wait until tomorrow / change the appointment to today.
- Reschedule the appointment to today.

A manual materialize affordance would close this gap — but tests
the invariant. If a same-day materialize is the only case, then
"change appointment date to today + open Today scope" already
covers it.

### G.3 — Should un-materialize be exposed more broadly?

Today's triggers (dialog Save earlier-state intercept + POS
job-detail Revert button) are both operator-initiated. There is no
automatic un-materialize path. Should there be:
- A cron that un-materializes jobs whose appointment was cancelled
  (closing the cross-table orphan gap from POS appointment cancel)?
- A "Revert" affordance on admin too (currently the dialog Save
  intercept is the only admin path)?

### G.4 — Should cancel cascade in both directions consistently?

Currently:
- **POS JOB cancel** cascades to appointment.status='cancelled'.
- **POS APPT cancel** does NOT cascade to job.status (job stays at
  prior state).
- **Admin cancel** — similar to POS appt cancel (does not cascade
  to job).

This is the cross-table orphan gap. Should appointment cancel
trigger un-materialize automatically when a job exists? Or should
the existing job's status flip to 'cancelled' independently of
un-materialize?

### G.5 — Should the job status workflow drive appointment status?

Today the operator marks job=completed but appointment.status stays
at confirmed/in_progress. So a customer-facing query reading
`appointments.status` shows the wrong picture for completed jobs.
Item 15h is documented future work for exactly this — should it
be prioritized?

If yes: which job-status transitions should drive which
appointment-status moves?
- job→intake: app→in_progress?
- job→in_progress: app→in_progress?
- job→completed: app→completed?
- job→closed: app→completed (already at completed if step above)?

### G.6 — Are the 4 load-bearing invariants still correct?

Each is enforced by code and tests. Are they intended?
- Inv 1: no premature materialization — intentional (Item 15e).
- Inv 2: at most 1 job per appointment — structural (UNIQUE).
- Inv 3: un-materialize ordering — intentional (recovery safety).
- Inv 4: Schedule scope is PURE READ — intentional (Item 15e).

If any of these become inconvenient for the operator's mental
model (e.g., "I want to manually materialize tomorrow's appointment
TODAY so I can pre-stage"), the invariant must be deliberately
softened rather than worked around.

### G.7 — Should walk-in appointments be visible in Schedule at all?

Walk-in flow creates `appointments.channel='walk_in'`,
`scheduled_date=today`. Schedule's hard-clamp to tomorrow+ means
walk-ins never appear there. **But should they?** The walk-in
appointment row IS a Stage 2 entity, not a Stage 1. Schedule's
"future appointments" framing intentionally excludes today; walk-ins
are by definition today; so they fall outside. This is consistent.
Verify the operator's mental model matches.

### G.8 — Cross-table sync philosophy

Two end-state philosophies the operator could choose:

- **Philosophy A:** appointments + jobs are independent ledgers with
  intentional minimal coupling. Status fields are independent.
  Cross-table actions (un-materialize, walk-in create) are explicit
  ceremonies. Item 15h doesn't ship; cascade gaps stay as-is.

- **Philosophy B:** appointments + jobs are two views of one entity.
  Status fields should ALWAYS reflect the same state. Item 15h
  ships in full: appointment.status changes drive job.status
  changes; job.status changes drive appointment.status changes; the
  cascade gaps close.

Today the codebase is at "Philosophy A with one forward sync
(un-materialize) and one cascade (POS job cancel) and one atomic
pair (walk-in)." It's a hybrid. The operator's intent could be
either; the code doesn't commit yet.

---

## File:line reference index

| Topic | Path |
|---|---|
| `appointments` table create | `supabase/migrations/20260201000015_create_appointments.sql:1-45` |
| `appointment_status` enum | `supabase/migrations/20260201000001_create_enums.sql:7` |
| `jobs` table create | `supabase/migrations/20260212000003_phase8_jobs_schema.sql:10-47` |
| `jobs.appointment_id` UNIQUE | `supabase/migrations/20260329000002_jobs_appointment_id_unique_constraint.sql` |
| `jobs` columns (canonical schema doc) | `docs/dev/DB_SCHEMA.md:1202-1249` |
| `appointments` columns (canonical schema doc) | `docs/dev/DB_SCHEMA.md:148-210` |
| Populate endpoint (forward) | `src/app/api/pos/jobs/populate/route.ts:1-194` |
| Populate future-date gate | `src/app/api/pos/jobs/populate/route.ts:42-47` |
| Populate status filter | `src/app/api/pos/jobs/populate/route.ts:65` |
| Populate idempotent upsert | `src/app/api/pos/jobs/populate/route.ts:169-171` |
| Populate-caller (only) | `src/app/pos/jobs/components/job-queue.tsx:574-601` |
| Init effect (populate trigger) | `src/app/pos/jobs/components/job-queue.tsx:711-723` |
| Defensive gates A/B/C | `src/app/pos/jobs/components/job-queue.tsx:574-580, 711-723, 763-779` |
| Walk-in atomic INSERT pair | `src/app/api/pos/jobs/route.ts:147-536` (appt at 383-415, job at 470-490) |
| Lifecycle-sync seam | `src/lib/appointments/lifecycle-sync.ts:1-368` |
| `jobStatusForAppointmentStatus` | `src/lib/appointments/lifecycle-sync.ts:59-72` |
| `isEarlierState` | `src/lib/appointments/lifecycle-sync.ts:95-103` |
| `APPT_LIFECYCLE_RANK` | `src/lib/appointments/lifecycle-sync.ts:81-86` |
| `executeUnMaterialize` | `src/lib/appointments/lifecycle-sync.ts:208-368` |
| Un-materialize ordering (the invariant) | `src/lib/appointments/lifecycle-sync.ts:292-316` |
| Admin un-materialize endpoint | `src/app/api/appointments/[id]/unmaterialize/route.ts` |
| POS un-materialize endpoint | `src/app/api/pos/appointments/[id]/unmaterialize/route.ts` |
| Un-materialize dialog (shared) | `src/components/appointments/un-materialize-confirmation-dialog.tsx` |
| Dialog Save earlier-state intercept | `src/app/admin/appointments/components/appointment-detail-dialog.tsx:219-228` |
| `withHasActiveJob` derivation | `src/app/admin/appointments/has-active-job.ts` |
| POS Revert button + handler | `src/app/pos/jobs/components/job-detail.tsx:399-417, 829-835` |
| STATUS_TRANSITIONS source | `src/lib/appointments/status-transitions.ts:15-22` |
| POS appointment PATCH (enforces) | `src/app/api/pos/appointments/[id]/route.ts:236-251` |
| POS appointment cancel (no cascade) | `src/app/api/pos/appointments/[id]/cancel/route.ts:106-113` |
| POS job cancel (cascades to appt) | `src/app/api/pos/jobs/[id]/cancel/route.ts:101-126, 145-154` |
| POS job start-work (no cascade) | `src/app/api/pos/jobs/[id]/start-work/route.ts:34` |
| POS job complete (no cascade) | `src/app/api/pos/jobs/[id]/complete/route.ts:50` |
| Public booking initial status | `src/app/api/book/route.ts:559, 567-595` |
| Cron scheduler registrations | `src/lib/cron/scheduler.ts:107-122` |
| Booking-reminders (no status change) | `src/app/api/cron/booking-reminders/route.ts:23-32, 100-101` |
| Stripe webhook payment_status flip | `src/app/api/webhooks/stripe/route.ts:213-225` |
| Schedule endpoint (PURE READ) | `src/app/api/pos/jobs/schedule/route.ts:24-27` |
| Schedule dedup of materialized | `src/app/api/pos/jobs/schedule/route.ts:131-141` |
| Today endpoint | `src/app/api/pos/jobs/route.ts:15-141` |
| Item 15e operations audit (intent doc) | `docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md` |
| Item 15e Phase 2 status-sync audit | `docs/dev/ITEM_15E_PHASE_2_STATUS_SYNC_AUDIT.md` |
| Today vs Schedule conceptual | `docs/dev/TODAY_VS_SCHEDULE_CONCEPTUAL_AUDIT.md` |
| Appointment-job flow audit (May 17) | `docs/dev/APPOINTMENT_JOB_STATUS_FLOW_AUDIT_2026-05-17.md` |
