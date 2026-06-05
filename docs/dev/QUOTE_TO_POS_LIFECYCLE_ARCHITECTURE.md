# Quote → POS Lifecycle Architecture

**Version:** 1.0
**Locked:** 2026-06-04 10:30 PST
**Status:** LIVING — updated session-by-session
**Scope:** POS lifecycle architecture (Quote → Appointment → Job → POS Transaction)

---

## Table of Contents

1. [Document Purpose](#document-purpose)
2. [Scope and Out-of-Scope](#scope-and-out-of-scope)
3. [Stage Definitions (LOCKED)](#stage-definitions-locked)
4. [Architectural Commitments (LOCKED)](#architectural-commitments-locked)
5. [Reference Index](#reference-index)
6. [Phased Plan Overview](#phased-plan-overview)
7. [Phase 0 — Foundational Audits](#phase-0--foundational-audits)
8. [Phase 1 — Foundation and Cleanup](#phase-1--foundation-and-cleanup)
9. [Phase 2 — Lifecycle Architecture (STUB)](#phase-2--lifecycle-architecture-stub)
10. [Phase 3 — Cross-cutting Commitments (STUB)](#phase-3--cross-cutting-commitments-stub)
11. [Phase 4 — Mobile Architecture (STUB)](#phase-4--mobile-architecture-stub)
12. [Decisions Log](#decisions-log)
13. [Document Maintenance Rules](#document-maintenance-rules)

---

## Document Purpose

This document is the **single source of truth** for the POS lifecycle architecture. It captures:

1. **Locked architectural decisions** with rationale (operator input quoted, or codebase fact with file:line)
2. **Phased execution plan** with session-by-session breakdown
3. **Checklists** for pre-tasks, audits, and session completion
4. **Decisions log** preserving history of reversed or refined decisions

This document is **referenced by every session prompt** in the Phase 0–4 plan. Updates to this document are part of every session's documentation-update step. See [Document Maintenance Rules](#document-maintenance-rules).

This document is NOT:
- A replacement for primary audit docs — those stay as source-of-truth evidence
- A code reference — `FILE_TREE.md` and `DB_SCHEMA.md` serve that
- A tactical changelog — `CHANGELOG.md` serves that
- A UX design doc — UX vocabulary verification is per-session

---

## Scope and Out-of-Scope

### In scope

- POS lifecycle: Quote → Appointment → Job → POS Transaction
- Stage transitions, status semantics, cross-table sync rules
- Operator-facing capabilities at each lifecycle stage
- Cleanup of accumulated drift (parity audit findings, state-machine asymmetry)
- Mobile detailer access architecture (Phase 4)

### Out of scope (explicit)

These were considered and deliberately excluded:

1. **Item 15h — Job status drives appointment status (write-side cascade).** REJECTED. Status independence is the locked architectural commitment (see [AC-1](#ac-1-status-independence-philosophy-a-refined)). Customer-facing stale-status concerns are solved via read-side derivations or joins, not write-side cascades.

2. **Admin > Appointments retirement.** OUT OF SCOPE. Admin retains full power as the back-office surface; POS Schedule is operator-scoped, not a full replacement.

3. **Customer-facing notification architecture (SMS templates, email content, lifecycle rule configuration).** Separate architectural concern. Lifecycle engine rules are referenced where relevant but not redesigned here.

4. **Quotes feature redesign** (beyond conversion to Appointment). Quote system improvements outside the Quote → Appointment handoff are separate.

5. **Reporting and analytics.** Conversion tracking infrastructure (unified ticket number, journey IDs) is in scope; report design is not.

---

## Stage Definitions (LOCKED)

The lifecycle has FOUR primary stages and TWO sub-states. Each stage has a defined entity, status set, transition rules, and operator-facing surface.

### Stage 1: Quote

**Entity:** `quotes` table row.

**Status enum** (`quote_status`, source: `DB_SCHEMA.md:3236`):
```
draft | sent | viewed | accepted | expired | converted
```

**Meaning of each status:**
- `draft` — operator built quote; not yet sent to customer
- `sent` — quote dispatched to customer via SMS/email
- `viewed` — customer opened the quote link
- `accepted` — customer accepted (signals intent to proceed)
- `expired` — past `valid_until` timestamp
- `converted` — became an appointment (`converted_appointment_id` FK populated)

**Identifier:** `quote_number` (Q-XXXX format), UNIQUE constraint (`DB_SCHEMA.md:2078, 2122`).

**Capabilities:**
- Create, edit, send, resend
- Customer accepts via link (status → accepted)
- Operator converts accepted quote to Appointment (status → converted; creates appointment row)

**Exit transitions:**
- → Stage 2 (Appointment) via "Convert to Appointment" action; sets `quotes.status='converted'` and writes `quotes.converted_appointment_id`
- → Stage 2 (Appointment) directly via "Walk-In from Quote" if same-day (atomic appointment + job create)
- Expired or abandoned: stays in Quote stage indefinitely with status `expired` or `sent`

**Rationale for stage existence:**
- **Codebase fact:** `quotes` table exists with full lifecycle enum and `converted_appointment_id` FK (`DB_SCHEMA.md:2073-2123`)
- **Operator input:** *"Lifecycle begins in a few ways: QUOTES: Human using POS to create a Quote or, via SMS, or Phone agent sends customer quote → either customer clicks sms/email link to accept the quote, which converts the quote into an appointment"*

---

### Stage 2: Appointment

**Entity:** `appointments` table row.

**Status enum** (`appointment_status`, source: `supabase/migrations/20260201000001_create_enums.sql:7`):
```
pending | confirmed | in_progress | completed | cancelled | no_show
```

**Meaning of each status:**

- **`pending`** — Booking exists; no payment commitment yet. Reached when customer books online and selects "Pay Onsite" (no deposit collected), or when SMS/phone agent creates an appointment without payment collection. Pending forces staff to contact customer to finalize.
- **`confirmed`** — Payment or deposit received. Date/time locked. Customer is financially committed.
- **`in_progress`** — Job has been materialized (operator pressed Start Intake). See Stage 3.
- **`completed`** — Terminal. Job execution complete. (Currently only set manually; Item 15h NOT in scope — see [Out of Scope](#scope-and-out-of-scope).)
- **`cancelled`** — Terminal. Booking terminated by customer or operator.
- **`no_show`** — Terminal. Customer did not arrive.

**Identifier:** **No `appointment_number` column currently exists.** This is a gap to address in Phase 3 (unified ticket number scheme).

**Capabilities (operator-facing on POS):**
- View details (POS > Jobs > Schedule for future; POS > Jobs > Today for materialized)
- Edit services (Sale-tab deep-link via "Edit in POS" button)
- Change status (subject to STATUS_TRANSITIONS state machine — see [AC-5](#ac-5-state-machine-loosening-2-safe-2-with-cascade))
- Reschedule date/time
- Cancel (via POS Cancel dialog)
- Send payment link
- Send confirmation

**Exit transitions:**
- → Stage 3 (Job) via operator pressing Start Intake on POS > Jobs (per [AC-3](#ac-3-start-intake-as-materialization-trigger))
- → Stage 3 (Job) via walk-in atomic create (POST /api/pos/jobs creates both rows together)
- → Terminal: cancelled, completed, no_show

**Rationale for Pending vs Confirmed semantic:**
- **Codebase fact:** Booking route at `src/app/api/book/route.ts:559` sets `initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'` — confirms payment-driven status assignment is already partially implemented
- **Operator input:** *"Pending is when a booking occurred online without a deposit or full payment, or scheduled via sms or phone agent...A payment or deposit signifies customer is serious and date/time for the appointment is confirmed"*

---

### Stage 3: Job

**Entity:** `jobs` table row, 1:1 paired with `appointments` row via `jobs.appointment_id` (UNIQUE constraint, source: `supabase/migrations/20260329000002_jobs_appointment_id_unique_constraint.sql`).

**Status enum** (`jobs_status_check`, source: `DB_SCHEMA.md:1234`):
```
scheduled | intake | in_progress | pending_approval | completed | closed | cancelled
```

**Meaning of each status:**

- **`scheduled`** — Job materialized; not yet started.
  > **TO VERIFY in Phase 0.3 audit:** Per [AC-3](#ac-3-start-intake-as-materialization-trigger), Start Intake becomes the materialization trigger. This may eliminate the `scheduled` state (or repurpose it for the walk-in atomic-create path).
- **`intake`** — Operator started intake phase; vehicle accepted; photos and notes taken.
- **`in_progress`** — Active detailing work; timer running.
- **`pending_approval`** — Flagged for customer authorization (addon flag-issue flow awaiting customer response).
- **`completed`** — Work done; not yet paid (job awaits checkout).
- **`closed`** — Paid. `transaction_id` FK populated.
- **`cancelled`** — Job aborted by operator.

**Identifier:** **No `job_number` column currently exists.** Gap to address in Phase 3.

**Capabilities (operator-facing on POS > Jobs):**
- Timer (work_started_at, work_completed_at, paused timing)
- Photo capture (intake, progress, completion)
- Addon flag-issue + customer notification
- Status workflow progression (Start Intake → Start Work → Complete)
- Reassign detailer
- Send payment link
- Revert to Pending (un-materialize) — gated by transaction_linked, terminal, confirm_required guards
- Checkout (Completed → register flow → status='closed')

**Exit transitions:**
- → Stage 4 (Terminal: closed) via Checkout completing
- → Stage 4 (Terminal: cancelled) via job cancel — cascades to `appointments.status='cancelled'`
- → Stage R (Un-materialized, back to Appointment Pending) via Revert button or dialog Save intercept

**Rationale for separate job ledger:**
- **Codebase fact:** Two separate tables with independent status enums (`DB_SCHEMA.md:148-210` for appointments; `DB_SCHEMA.md:1202-1249` for jobs); cross-table syncs are intentionally rare and explicit (lifecycle audit 2293fb3d Target D.3)
- **Architectural commitment:** [AC-1 Status Independence](#ac-1-status-independence-philosophy-a-refined)

---

### Stage 4: POS Transaction (Terminal)

**Entity:** `transactions` table row, linked to job via `jobs.transaction_id` FK.

**Identifier:** `receipt_number` (SD-XXXXXX format), UNIQUE constraint (`DB_SCHEMA.md:2933, 2976`).

**Meaning:** Financial record. Job is paid. Transaction captures payment method, refund history, line items.

**Capabilities:**
- Refund (via transaction surface — separate from job/appointment edit flow)
- Receipt reprint
- Read-only journey reference

**No exit transitions in normal operation.** Transactions are permanent records. Refunds adjust state but do not transition entities backward.

**Rationale:**
- **Codebase fact:** Transactions table independent of appointments/jobs; `receipt_number` (SD-XXXXXX) already implemented; refunds handled at transaction layer not appointment/job layer

---

### Sub-state: Walk-in (parallel path)

**Trigger:** Operator presses "New Walk-in" button on POS or "Convert to Walk-in" from POS > Quotes (same-day only).

**Behavior:** Atomic `INSERT` pair — creates appointments row (`channel='walk_in'`, `status='in_progress'`, `scheduled_date=today`) + jobs row (`status='scheduled'`, linked via `appointment_id`) in one transaction (source: `src/app/api/pos/jobs/route.ts:147-536`).

**Skips:** Stage 1 (Quote — optionally), Stage 2 (Appointment Pending/Confirmed booking phase). Lands directly at Stage 3 active work.

**Rationale:**
- **Codebase fact:** Walk-in flow already implemented as atomic create (`pos/jobs/route.ts:383-415` appointment INSERT, `:470-490` job INSERT)
- **Operator input:** *"Appointments can bypass the need for a quote entirely if customer is in the store, walk-ins (same day service requested)"*

---

### Sub-state: Un-materialized (reverse from Stage 3 → Stage 2)

**Trigger:** Operator presses "Revert to Pending" button on POS > Jobs > job-detail, OR dialog Save intercept fires when reverting status to earlier state with active job.

**Behavior:** `executeUnMaterialize` (`src/lib/appointments/lifecycle-sync.ts:208-368`):
1. Guards: transaction_linked → 409; terminal → 409; in_progress/pending_approval without confirmString → 422
2. UPDATE `appointments.status='pending'` FIRST
3. DELETE `FROM jobs WHERE id=<job>` (CASCADE removes photos, addons)
4. Best-effort Storage cleanup
5. Audit log entry; no webhook

**Post-state:** Appointment back at Stage 2 Pending; job row gone; photos and addons gone.

**Re-materialization:** Operator confirms appointment back to confirmed → next Start Intake (or populate, pre-redesign) creates a FRESH job (new `jobs.id`).

**Rationale:**
- **Codebase fact:** `executeUnMaterialize` is the canonical reverse seam (lifecycle audit 2293fb3d Target C.1)
- **Operator input:** *"Inside jobs, there is a button to set it back to Pending and undo the creation of the Job"*

---

## Architectural Commitments (LOCKED)

Each commitment below is LOCKED — changes require operator approval and trigger a session pause per [Document Maintenance Rules](#document-maintenance-rules).

### AC-1: Status independence (Philosophy A Refined)

**Commitment:** `appointments.status` and `jobs.status` are independent axes tracking different concerns. Appointment status tracks the customer's booking lifecycle; job status tracks the floor staff's operational lifecycle. Cross-table syncs are explicit, ceremonial, and rare.

**Customer-facing queries that need operational state read from `jobs` (or join). Booking queries read from `appointments`. Item 15h (write-side cascades) is REJECTED.**

**Rationale:**
- **Codebase fact:** The two tables have separate status enums with no overlapping values except surface terms; cross-table syncs are documented as intentionally limited (lifecycle audit 2293fb3d Target D.3: *"the only currently-implemented cross-table syncs are: (1) un-materialize, (2) POS job cancel, (3) walk-in creation"*)
- **Codebase fact:** Job status workflow (Start Intake → Start Work → Complete → Close) does NOT cascade to appointments today (lifecycle audit Target B.4: *"Through the entire flow, appointments.status stayed at confirmed. The appointment status is the BOOKING lifecycle; the job status is the OPERATIONAL lifecycle."*)
- **Operator alignment:** *"each stage should have its own set of status independence (well defined, meaningful for that stage)"*

---

### AC-2: Three explicit cross-table syncs (no others)

**Commitment:** The codebase commits to exactly THREE cross-table syncs between appointments and jobs:

1. **Un-materialize (reverse):** `appointments.status='pending'` FIRST, then DELETE job. Source: `lifecycle-sync.ts:292-316`.
2. **POS job cancel (forward cascade):** `jobs.status='cancelled'` + cascade `appointments.status='cancelled'`. Source: `pos/jobs/[id]/cancel/route.ts:148-154`.
3. **Walk-in atomic create:** Both rows inserted in one transaction. Source: `pos/jobs/route.ts:383-498`.

**Plus one new sync added in Phase 1 (per [AC-2.1](#ac-21-appointment-cancel-cascades-via-un-materialize-when-job-exists)):**

4. **Appointment cancel with active job:** Appointment cancel triggers un-materialize automatically when a job exists. Closes the cross-table orphan gap.

No other cross-table writes are permitted without an architectural-commitment update.

**Rationale:**
- **Lifecycle audit 2293fb3d Target G.4** identified the orphan gap (POS appointment cancel writes only `appointments.status='cancelled'`, leaving the job at its prior status)
- **Consistency:** the four explicit syncs cover the lifecycle's structural needs without conflating ledgers

---

### AC-2.1: Appointment cancel cascades via un-materialize when job exists

**Commitment:** When an appointment is cancelled and a job row exists, the cancel flow automatically invokes `executeUnMaterialize` before marking the appointment cancelled. This closes the orphan gap identified in the lifecycle audit.

**Implementation note:** Cancel-with-partial-payment requires operator decision at cancel time — see [AC-9](#ac-9-cancel-with-partial-payment-decision-pathways).

**Rationale:**
- **Lifecycle audit 2293fb3d G.4:** *"POS appointment cancel writes appointments.status='cancelled' only and leaves jobs untouched. POS job cancel cascades both ways. Should both cancel paths behave symmetrically?"*
- **Operator alignment:** *"Job → APPOINTMENT (Current already exists Revert to Pending and only when Start Intake has NOT been started. If it has, Job must be cancelled..."* — operator recognized the need for cancel-after-intake handling

---

### AC-3: Start Intake as materialization trigger

**Commitment:** Operator pressing "Start Intake" on a confirmed (or in_progress) appointment is the canonical materialization event. This **replaces** the current implicit populate-on-Today-scope-mount behavior.

**Gates:**
- Start Intake disabled for `appointment.scheduled_date > today` (future-dated). UI shows popup with two options:
  - "Move appointment to today and start now" (re-dates the appointment + materializes)
  - "Cancel — customer not yet here" (no action)
- Start Intake disabled for `appointment.status NOT IN (confirmed, in_progress)` (e.g., pending requires confirmation first)

**Walk-in path unchanged:** atomic appointment + job create stays as the parallel path.

**Effect on `populate` endpoint:** Phase 2 will redesign or remove. The existing `populate` cron-less, init-effect-triggered model is engineering-convenient but architecturally implicit. Start Intake is product-design-explicit.

**Pre-task before Phase 2 execution:** Phase 0.3 audit must verify what currently depends on populate having pre-materialized today's jobs (daily summary counts, list rendering, glance views).

**Rationale:**
- **Operator input:** *"When does an appointment become a Job? I believe it should be triggered when the detailer clicks on the 'Start Intake' button. This 'changes' the ticket from Confirmed to → active status 'in progress'."*
- **Operator input on gating:** *"any future appointment in the Jobs page that clicks this button, it should be gated to show a pop up message to move appointment to today and start job? or at the very least not allow the start intake for future dates greater than today"*
- **Architectural improvement:** explicit operator-initiated materialization is cleaner than the current implicit-via-populate model (lifecycle audit 2293fb3d Target B.2: *"the only call site in the repo is the init effect on Today scope mount and the Refresh button"*)

---

### AC-4: POS > Jobs as unified surface; POS > Appointments tab retires

**Commitment:** POS > Jobs becomes the unified surface for both Stage 2 (booked appointments) and Stage 3 (materialized jobs). Internal flags or scope toggle separate views, but the operator sees one bottom-nav tab.

POS > Appointments tab is removed from POS bottom navigation. Existing routes redirect to `/pos/jobs?scope=schedule` for backward compatibility.

**Effect on Today/Schedule scopes:** Both stay, but the conceptual model is unified — Schedule scope shows Stage 2 entities (booked); Today scope shows Stage 3+ entities (materialized + terminal same-day). Cards visually identify which stage they're in.

**Rationale:**
- **Operator input:** *"Jobs are Appointments, at least visually from the POS > Jobs page. No Appointment tab needed. Flags can separate 'Job' from 'Appointment'."*
- **Codebase fact:** Item 15e Phase 3 (retire and absorb POS Appointments tab) was scoped but never shipped (conceptual audit 26521e5a Target C.5: *"POS bottom nav still renders both Jobs and Appointments tabs"*)

---

### AC-5: State machine loosening — 2 SAFE + 2 with cascade

**Commitment:** The current `STATUS_TRANSITIONS` map is loosened deliberately, NOT removed wholesale:

**Opened without conditions (SAFE per consequence map d3671c82 Target D.1, D.3):**
- `pending → in_progress`
- `in_progress → no_show`

**Opened with `executeUnMaterialize` cascade wired into PATCH:**
- `confirmed → pending` (when `has_active_job=true`)
- `in_progress → pending` (when `has_active_job=true`)

**Kept blocked:**
- `completed → *` (money-attached terminal; reverting needs explicit un-completion path; out of scope)
- `cancelled → *` (terminal; un-cancellation needs notification path; out of scope)
- `no_show → *` except via dialog redirect to /cancel where allowed

**Admin/POS PATCH symmetry:** Both endpoints share the loosened map. Admin's current permissiveness is corrected; the two converge per Phase 1.2.

**Pre-task before execution:** Phase 0.1 audit verifies n8n receiver idempotency for `appointment_confirmed` and `appointment_completed` webhooks. If receiver is not idempotent, opening MEDIUM transitions (currently 8 per consequence map) requires source-side idempotency guards added before loosening proceeds. The 2 SAFE transitions are unaffected by the n8n question.

**Rationale:**
- **Consequence map d3671c82 Target E:** explicit risk classification per transition (2 SAFE, 8 MEDIUM, 11 HIGH, 0 CRITICAL)
- **Codebase fact:** `executeUnMaterialize` cascade for the 2 backward-revert transitions is ALREADY CODED but not wired into PATCH (lifecycle audit 2293fb3d cites `lifecycle-sync.ts:59-72` returning `delete_job` action — just not invoked from PATCH)
- **Operator alignment:** *"in_progress → no_show blocked"* was reported as a real workflow gap (audit b0efd95f, operator-reported error #2)

---

### AC-6: Customer-facing comms keyed to appointment

**Commitment:** All customer-facing communications (confirmation SMS, reminder SMS, cancellation SMS, completion notification, review request) are keyed to the APPOINTMENT entity, not the job. Customer doesn't know jobs exist; they know they have an appointment.

**Implication:** Item 15h (job status drives appointment status) becomes unnecessary because comms read from the appointment side, where status reflects booking lifecycle, not operational state.

**Operational notifications** (e.g., flag-issue mid-job notifications to customer) are exceptions because they reference an event during work — but they're still triggered by job-level actions and reference appointment identifiers in the customer-facing copy.

**Rationale:**
- **Operator alignment:** *"end of job notifications are sent to the customer (already working)"* — confirms current implementation already routes through appointment-side
- **Architectural cleanliness:** decouples customer-facing semantics from operational implementation

---

### AC-7: Terminal states viewable via filter, hidden by default

**Commitment:** Terminal-state appointments (cancelled, completed, no_show) are NOT shown by default in POS > Jobs Today or Schedule scopes. Operator can opt in via a filter affordance to view them for review/recovery action.

**Filter shape:** TBD in Phase 2 — likely an explicit toggle ("Show completed", "Show cancelled", "Show no-show") or a stage-specific filter pill.

**Default Today scope behavior:** unchanged (currently excludes `cancelled` per `src/app/api/pos/jobs/route.ts:47`).

**Default Schedule scope behavior:** unchanged (excludes `cancelled, no_show, completed` per `src/app/api/pos/jobs/schedule/route.ts:12`).

**Rationale:**
- **Operator input:** *"Terminal states (appointment-side): completed / cancelled / no_show. These should also be able to be viewed using filters from the Job panel view, not shown by default."*

---

### AC-8: Forward-arrow in Today scope routes to Schedule when crossing today

**Commitment:** When operator presses the forward arrow on Today scope and navigation would cross into tomorrow or later, the UI routes to Schedule scope (preserving the date intent). The forward-arrow is no longer empty for future dates.

**Past-date navigation:** Unchanged. Forward arrow continues to navigate by 1 day backward into past dates within Today scope.

**Rationale:**
- **Conceptual audit 26521e5a Target G.1, E.1, A.4:** identifies the forward-arrow as the seam where mental model fractures; option (b) "auto-route to Schedule scope when crossing today" recommended
- **Operator alignment:** *"I'm getting confused and I feel like we are building without a real structured plan, that solves the main pain point and does not overlap"* — surfaced the forward-arrow confusion

---

### AC-9: Cancel-with-partial-payment decision pathways

**Commitment:** When an appointment with `payment_status='partial'` or `deposit_amount > 0` is cancelled (whether before or after materialization), the operator chooses at cancel time between two pathways:

**Pathway A — Cancel & Refund:**
- Refund deposit/partial payment to original payment method
- If job exists: un-materialize (job row deleted, photos/addons removed)
- Appointment marked cancelled with `cancellation_reason`
- Customer notified of cancellation + refund

**Pathway B — Cancel & Retain (Credit):**
- Apply deposit/partial payment as credit to customer's account for future booking
- If job exists: job marked `cancelled` (NOT deleted — preserves audit trail of work attempted)
- Appointment marked cancelled with reference to retained credit
- Customer notified of cancellation + credit balance

**Implementation TBD:** Phase 3 session. Customer credit infrastructure may not exist yet — see Phase 0 pre-task.

**Rationale:**
- **Operator input:** *"how do we handle partial payments for this scenario?"* — flagged as concern requiring design
- **Architectural:** preserves the principle that money decisions are operator-explicit, not buried in cancel logic

---

### AC-10: Unified ticket number scheme (TBD detail, principle locked)

**Commitment:** The unified identifier strategy uses the **appointment as the spine**. Specifically:

- Quotes keep `quote_number` (Q-XXXX) — pre-conversion artifact
- Appointments get a new `appointment_number` (A-XXXX) — issued when row is created (either via quote conversion or direct booking)
- Jobs inherit the appointment's A-XXXX (no separate prefix) — operationally tied
- Transactions keep `receipt_number` (SD-XXXXXX) — financial record

Customer-facing identifier across the lifecycle: **A-XXXX**. Customer sees Q-XXXX during quote phase; A-XXXX from appointment creation forward.

**Linkage:** `quotes.converted_appointment_id` already exists (`DB_SCHEMA.md:2090`) — provides forward link. `appointments` will need new `appointment_number` column with UNIQUE + format generation (Phase 3).

**Rationale:**
- **Operator input:** *"creating a universal ticket number that connects Quotes, Appointments, Jobs, POS transactions into one clean linked unified system"*
- **Codebase fact:** appointments and jobs currently have NO `*_number` column (verified via DB_SCHEMA.md grep, 2026-06-04)
- **Codebase fact:** `quote_number` and `receipt_number` already implemented with UNIQUE constraints
- **Architectural choice (Option γ from operator discussion):** appointment-spine is cleanest because appointment is the only entity that exists across all lifecycle paths (online, SMS, phone, walk-in via quote, walk-in direct)

---

### AC-11: Pending vs Confirmed semantic enforcement (payment-driven)

**Commitment:** Appointment `status='pending'` vs `status='confirmed'` is semantically defined by payment commitment:

- `pending` = no payment commitment received (online with pay-onsite selected, SMS agent without payment collection, phone agent without payment collection)
- `confirmed` = deposit or full payment received via online booking, or operator manually confirms after collecting payment

**All three booking paths (online, SMS agent, phone agent) align on this rule.** Phase 0.1 audit confirms current state of SMS/phone agent booking flows; Phase 2 session implements alignment if gaps exist.

**Operator manual transitions:** Operator pressing "Confirm" on a pending appointment should ideally tie to a payment-collected event. Phase 2 session decides whether to enforce this strictly or allow operator override with audit log.

**Rationale:**
- **Operator input:** *"What makes an Appointment pending vs confirmed? Pending is when a booking occurred online without a deposit or full payment, or scheduled via sms or phone agent...A payment or deposit signifies customer is serious and date/time for the appointment is confirmed"*
- **Codebase fact:** Online booking already implements this rule at `src/app/api/book/route.ts:559` (`initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'`)

---

## Reference Index

### Primary audit documents (evidence base)

- **State machine audit (b0efd95f):** `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` — 6×6 transition matrix, source of state machine, admin/POS asymmetry
- **Consequence map (d3671c82):** `docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md` — per-transition fire effects, risk ranking (2 SAFE / 8 MEDIUM / 11 HIGH / 0 CRITICAL)
- **Edit-in-POS audit (d1eb1e24, fixed #150 / 4a03d8ea):** `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md` — Day-1 UX gap fix via parameterized returnToPath
- **Dialog parity audit (b346d34b):** `docs/dev/ADMIN_POS_DIALOG_PARITY_AUDIT.md` — 21 dimensions / 8 intentional / 6 drift / 4 ambiguous; 3-session fix arc proposed
- **Today vs Schedule conceptual (26521e5a):** `docs/dev/TODAY_VS_SCHEDULE_CONCEPTUAL_AUDIT.md` — forward-arrow seam; intentional non-overlap between scopes
- **Manual amount + no_show audit (f73661b7):** `docs/dev/MANUAL_AMOUNT_AND_NO_SHOW_AUDIT.md` — Sale-tab edit silent drop; no_show Schedule exclusion
- **Materialization lifecycle audit (2293fb3d):** `docs/dev/APPOINTMENT_TO_JOB_MATERIALIZATION_LIFECYCLE_AUDIT.md` — foundational lifecycle model; 6 stages; 4 invariants

### Critical architectural code sites

| Topic | Path |
|---|---|
| State machine source | `src/lib/appointments/status-transitions.ts:15-22` |
| State machine enforcement (POS) | `src/app/api/pos/appointments/[id]/route.ts:236-251` |
| State machine NOT enforced (admin) | `src/app/api/appointments/[id]/route.ts:104-130` |
| Lifecycle sync seam | `src/lib/appointments/lifecycle-sync.ts:1-368` |
| executeUnMaterialize | `src/lib/appointments/lifecycle-sync.ts:208-368` |
| Un-materialize ordering invariant | `src/lib/appointments/lifecycle-sync.ts:292-316` |
| jobStatusForAppointmentStatus | `src/lib/appointments/lifecycle-sync.ts:59-72` |
| APPT_LIFECYCLE_RANK | `src/lib/appointments/lifecycle-sync.ts:81-86` |
| isEarlierState | `src/lib/appointments/lifecycle-sync.ts:95-103` |
| Populate endpoint | `src/app/api/pos/jobs/populate/route.ts:1-194` |
| Populate future-date gate | `src/app/api/pos/jobs/populate/route.ts:42-47` |
| Populate status filter | `src/app/api/pos/jobs/populate/route.ts:65` |
| Populate idempotent upsert | `src/app/api/pos/jobs/populate/route.ts:169-171` |
| Schedule endpoint (PURE READ) | `src/app/api/pos/jobs/schedule/route.ts:24-27` |
| Schedule EXCLUDED_STATUSES | `src/app/api/pos/jobs/schedule/route.ts:12, :114` |
| Schedule materialization dedup | `src/app/api/pos/jobs/schedule/route.ts:131-141` |
| Today endpoint | `src/app/api/pos/jobs/route.ts:15-141` |
| Today excludeStatuses | `src/app/api/pos/jobs/route.ts:47` |
| Walk-in atomic INSERT pair | `src/app/api/pos/jobs/route.ts:147-536` |
| Booking-route initial status | `src/app/api/book/route.ts:559` |
| Dialog component (shared) | `src/app/admin/appointments/components/appointment-detail-dialog.tsx` |
| Dialog Save earlier-state intercept | `src/app/admin/appointments/components/appointment-detail-dialog.tsx:219-228` |
| Un-materialize context HARDCODE (BUG) | `src/app/admin/appointments/components/appointment-detail-dialog.tsx:625` |
| /admin dashboard no-op mount | `src/app/admin/page.tsx:688-689` |
| POS Schedule scope render | `src/app/pos/jobs/components/job-queue.tsx` |
| POS job-detail (Today scope) | `src/app/pos/jobs/components/job-detail.tsx` |
| POS Revert button | `src/app/pos/jobs/components/job-detail.tsx:399-417` |
| POS appointment cancel (no cascade) | `src/app/api/pos/appointments/[id]/cancel/route.ts:106-113` |
| POS job cancel (cascades to appointment) | `src/app/api/pos/jobs/[id]/cancel/route.ts:148-154` |
| Cron scheduler (no populate caller) | `src/lib/cron/scheduler.ts:107-122` |

### DB schema anchors

| Topic | DB_SCHEMA.md anchor |
|---|---|
| appointments table | `DB_SCHEMA.md:148-210` |
| appointment_status enum | `DB_SCHEMA.md:3231` |
| jobs table | `DB_SCHEMA.md:1202-1249` |
| jobs_status_check | `DB_SCHEMA.md:1234` |
| jobs.appointment_id UNIQUE | `supabase/migrations/20260329000002` |
| quotes table | `DB_SCHEMA.md:2073-2123` |
| quote_status enum | `DB_SCHEMA.md:3236` |
| quotes.converted_appointment_id FK | `DB_SCHEMA.md:2090` |
| quote_number UNIQUE | `DB_SCHEMA.md:2078, 2122` |
| transactions table | `DB_SCHEMA.md:2928+` |
| transactions.receipt_number UNIQUE | `DB_SCHEMA.md:2933, 2976` |

---

## Phased Plan Overview

| Phase | Theme | Pre-task | Status |
|---|---|---|---|
| **Phase 0** | Foundational audits | None — audits run first | `[ ]` Not started |
| **Phase 1** | Foundation + cleanup (drift fixes, safe state-machine openings, tab retirement) | None — philosophy-independent | `[ ]` Not started |
| **Phase 2** | Lifecycle architecture (Start Intake redesign, forward-arrow, terminal-state filters) | Phase 0.3 + 0.1 audits complete | `[ ]` Not started |
| **Phase 3** | Cross-cutting (pending/confirmed semantic, unified ticket number, Quote→Appointment formalized, cancel-with-payment) | Phase 0.1 + 0.2 audits complete | `[ ]` Not started |
| **Phase 4** | Mobile detailer architecture | Phase 0.4 audit complete | `[ ]` Not started |

**Phases 1 can ship in parallel with Phase 0 audits running.** Phases 2-4 are gated on Phase 0 completion.

---

## Phase 0 — Foundational Audits

Pre-tasks before Phases 2-4 can execute in detail. Each is read-only.

### Phase 0.1 — SMS / Phone agent booking flow audit

**Status:** `[x]` Complete — 2026-06-05 (PST), merge `69b15b0f`
**Estimated time:** 60-90 minutes
**Deliverable:** [`docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md`](SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md) (~530 lines)

**Questions to answer:**
- How do SMS agents (Twilio + AI) create appointments? Do they create Quotes that customers convert, or Appointments directly?
- How do Phone agents (ElevenLabs Tom / Retell AI) create appointments? Same question.
- What status do agent-created appointments start at (pending vs confirmed)?
- Do agents collect payment / send payment links? If yes, how does the payment flow tie to status?
- Are the three booking paths (online, SMS, phone) consistent on the pending/confirmed semantic rule from [AC-11](#ac-11-pending-vs-confirmed-semantic-enforcement-payment-driven)?

**Why this audit first:** [AC-11](#ac-11-pending-vs-confirmed-semantic-enforcement-payment-driven) requires alignment across all three booking paths. Phase 2 cannot implement enforcement until current state is known.

**Pre-task checklist:**
- `[x]` Draft audit prompt
- `[x]` Audit executed, deliverable merged (`69b15b0f`)
- `[ ]` Findings reviewed; gaps surfaced for Phase 3 sessions (AC-11 enforcement scope)

**Headline findings:**
- **Four** production booking paths exist, not three: online booking (`/api/book`), SMS agent legacy v1 (the `[GENERATE_QUOTE]`-block path in the Twilio inbound webhook), SMS AI v2 (Anthropic tool-use agent dispatched fire-and-forget from the same Twilio webhook), and Phone agent Tom (ElevenLabs). SMS v2 and Tom share the same **13-tool** backing surface at `/api/voice-agent/*` — the two LLMs are configured separately but converge on identical server-side primitives.
- AC-11 verdict per path: **online ALIGNED** (`book/route.ts:559` ties status to `payment_intent_id`); **legacy v1 UNDEFINED at agent layer** (creates quotes only, never appointments) but **MISALIGNED downstream** at the operator-conversion seam (`convertQuote` default `'confirmed'` regardless of payment); **v2 and Tom both MISALIGNED** — `voice-agent/appointments/route.ts:516` hardcodes `'pending'` on the direct branch and `:290` forces `'pending'` on the quote branch; no condition can produce `'confirmed'`.
- **Zero payment infrastructure** on agent paths. No `payment_intent_id` / payment-link primitive in `/api/voice-agent/*` or `src/lib/sms-ai/**`. Agents cannot produce a `'confirmed'` appointment under any condition — alignment work requires new payment-link tool, post-payment webhook tie-in, AND the status-pin swap.
- `convertQuote` fires `appointment_confirmed` webhook **unconditionally** (`convert-service.ts:240`) regardless of actual row status — semantic ambiguity at the wire layer when called from voice-agent path with `appointmentStatus: 'pending'` (corroborates Phase 0.2 F.4).
- Quote acceptance via `/api/quotes/[id]/accept` sets `quotes.status='accepted'` but does **NOT** create an appointment; customer is told *"Our team will reach out shortly to schedule"* (`accept/route.ts:97/101`). Operator-mediated conversion via `/api/quotes/[id]/convert` defaults to `'confirmed'` (matches Phase 0.2 A.1 finding).
- v2 SMS bookings via the shared endpoint write `channel='phone'` (hardcoded at `voice-agent/appointments/route.ts:517`) — operator cannot distinguish v2 SMS bookings from Tom bookings at the row level.
- **n8n idempotency verdict (AC-5 / Session 1.5 gate): BLOCKED** — operator must verify n8n receiver flows for `appointment_confirmed` and `appointment_completed` before Session 1.5 can fire. `fireWebhook` (`webhook.ts:20-52`) carries zero dedup tokens; re-fire structurally possible from 4+ sites enumerated in Target E.3. Session 1.4 (2 SAFE transitions) is unaffected.
- Memory #30 boundary verified clean: no "Ashley" / "Retell AI" references in Smart Details code; `ELEVENLABS_AGENT_ID` is env-supplied (no literal agent ID in source); "Tom" persona is hardcoded only at `voice-agent/initiation/route.ts:314` (greeting) and `sms-ai/system-prompt.ts:41` (SMS persona).
- 6 open operator decisions surfaced (F.1–F.6) covering: v2 appointment-creation philosophy, Phone agent payment-link timing, operator-facing pending→confirmed workflow, `appointment_confirmed` fire-condition split (status-tied vs unconditional), v2 `channel` write semantics, and quote-acceptance auto-create question.

---

### Phase 0.2 — Quote → Appointment conversion architecture audit

**Status:** `[x]` Complete — 2026-06-05 (PST), merge `dcf511df`
**Estimated time:** 30-45 minutes
**Deliverable:** `docs/dev/QUOTE_TO_APPOINTMENT_CONVERSION_AUDIT.md` (~515 lines)

**Questions to answer:**
- What is the current "Convert to Appointment" flow in POS > Quotes? (file paths, endpoint, status writes)
- When a customer accepts a quote via SMS/email link, what creates the appointment?
- How is `quotes.converted_appointment_id` populated? When?
- Does the conversion preserve all quote data (services, mobile config, modifiers) into the appointment?
- Is there a "Convert to Walk-In" path (same-day → atomic appointment + job)?
- What status does the resulting appointment land at (pending vs confirmed)?

**Why this audit:** Quote is a real lifecycle stage per [Stage 1](#stage-1-quote); the conversion is currently undocumented in any audit.

**Pre-task checklist:**
- `[x]` Draft audit prompt
- `[x]` Audit executed, deliverable merged (`dcf511df`)
- `[ ]` Findings reviewed; gaps surfaced for Phase 3 sessions

**Headline findings:**
- 6 wired conversion paths route through 2 architectural seams: canonical `convertQuote()` (POS A.1 + voice-agent A.5 + dormant admin A.6) and walk-in atomic-create (POS Create Job A.3 + walk-in builder A.4).
- The two seams differ on 8 dimensions including channel (`phone` vs `walk_in`), appointment status (`confirmed`/`pending` vs `in_progress`), scheduled date (operator-picked vs today/now), webhook fired (`appointment_confirmed` vs none), and — critically — `quotes.converted_appointment_id` FK populated only by the canonical seam. Walk-in seam leaves it NULL and the quote-detail UI accommodates with a `"Converted to job"` badge branch (`quote-detail.tsx:493`).
- Customer "Accept Quote" via SMS/email link does NOT create an appointment — it sets `quotes.status='accepted'` and routes staff to manually convert in POS via a staff SMS + email saying *"Next step: Convert this quote to an appointment in POS"* (literal copy at `accept/route.ts:196`).
- Modifier carry-forward asymmetry: A.4 walk-in-builder forwards coupon/loyalty/manual; A.3 walk-in-from-quote omits them silently (surfaced as F.3).
- `convertQuote` fires `appointment_confirmed` webhook unconditionally, even on voice-agent's `pending` path A.5 (F.4).
- A.1 sets `confirmed` WITHOUT enforcing a payment check — surfaces an AC-11 alignment question (F.1).
- A.1 vs A.3 cross-seam race possible: neither seam checks the other's idempotency signal (F.7).
- Admin convert endpoint A.6 exists but has no caller in source (dormant; F.5).
- 8 open operator decisions (F.1–F.8) surfaced for Phase 3 sessions on Quote → Appointment formalization, AC-10 (unified ticket number — `appointment_number` is greenfield), and AC-11 (payment-driven semantic).

---

### Phase 0.3 — Populate dependencies audit

**Status:** `[x]` Complete — 2026-06-05 (PST), merge `98a5f30d`
**Estimated time:** 30 minutes
**Deliverable:** [`docs/dev/POPULATE_DEPENDENCIES_AUDIT.md`](POPULATE_DEPENDENCIES_AUDIT.md)

**Questions to answer:**
- What currently depends on `populate` having pre-materialized today's jobs BEFORE the operator hits Start Intake?
- Specifically:
  - Daily summary card counts (totalJobs / unassigned / totalRevenue / completedCount in POS Jobs Today header)
  - Today scope list rendering (what does it show when no jobs exist yet for today?)
  - Any operator-glance views needing "today's expected work" before vehicles arrive
- Can these views be re-pointed to read `appointments` for today's expected work when no job exists yet?
- Are there any read paths that JOIN jobs to appointments that would break if jobs don't exist?

**Why this audit:** [AC-3](#ac-3-start-intake-as-materialization-trigger) requires `populate` to be redesigned or removed. This audit determines whether the migration is clean (single session) or compound (multi-session migration with view rewrites).

**Migration scope verdict:** **CLEAN** — single session. Only the POS Jobs Today scope itself (Today endpoint + 4-card daily summary + list/timeline + `/api/pos/staff/available` `job_count_today`) depends on populate. 13 downstream `jobs` consumers (lifecycle-engine cron, checkout link, receipts, appointment→job joins, mobile-service cascades, reschedule cascade, etc.) are naturally preserved by AC-3 because they operate on jobs by `id` / `customer_id` / `transaction_id` or on post-Start-Intake statuses (`completed` / `closed`). No reports, no admin home dependence, no webhooks. The 4 load-bearing invariants from the lifecycle audit (2293fb3d Target E.4) are unchanged.

**Open operator decisions surfaced (no pre-resolution):** F.1 daily summary semantic (expected vs started), F.2 list visibility for un-started appointments, F.3 manual "Materialize Now" affordance, F.4 populate removal vs admin-only retention vs cron recharter, F.5 `jobs.status='scheduled'` legitimacy post-AC-3 (incl. walk-in atomic create), F.6 `staff/available` `job_count_today` semantic.

**Pre-task checklist:**
- `[x]` Draft audit prompt
- `[x]` Audit executed, deliverable merged (`98a5f30d`)
- `[ ]` Findings reviewed; migration scope locked (operator action)

---

### Phase 0.4 — Mobile detailer access architecture audit

**Status:** `[x]` Complete — 2026-06-05 (PST), merge `e10e23a5`
**Estimated time:** 45-75 minutes
**Deliverable:** `docs/dev/MOBILE_DETAILER_ACCESS_AUDIT.md` (~504 lines)

**Questions to answer:**
- How does a mobile detailer currently access POS at the customer site? (Options to investigate: token-based hotlink, mobile-device PIN login, dedicated mobile app, pre-authorization before leaving shop)
- What does the operator currently do when running a mobile appointment?
- Are there existing mobile-specific code paths (beyond mobile-service infrastructure for surcharge/zones)?
- What's the right architectural approach for Start Intake when the detailer is at the customer's site?

**Why this audit:** Mobile flow is a known gap. [AC-3](#ac-3-start-intake-as-materialization-trigger) Start Intake design must account for mobile access; without this audit, Phase 4 cannot be detailed.

**Pre-task checklist:**
- `[x]` Draft audit prompt
- `[x]` Audit executed, deliverable merged (`e10e23a5`)
- `[ ]` Findings reviewed; Phase 4 sessions detailed

**Headline findings:**
- **There is essentially NO mobile-detailer-specific infrastructure.** Same PIN auth, same `/pos` surface, same role-permission matrix, same job-detail UI serve both shop-bench and at-customer-site detailers.
- **Three pieces of infrastructure incidentally support mobile use, none designed for it:** PWA manifest scoped to `/pos` (`public/manifest.json`), camera-capture file input (`photo-capture.tsx:123-130` with `capture="environment"`), and the IndexedDB offline cash queue (`src/lib/pos/offline-queue.ts`).
- **Production architecture actively works AGAINST off-shop mobile access:** IP whitelist enforced at middleware (`src/middleware.ts:31-42` for `app.` domain) gates ALL POS by IP when enabled; Stripe Terminal LAN-DNS dependency (CLAUDE.md Critical Rule) means in-person card swipe is NOT POSSIBLE off the shop's network.
- **The detailer role's permission defaults (`src/lib/utils/role-defaults.ts:308-406`) already exclude card processing** — pre-implementing the "mobile detailer cannot close transaction" pattern. Natural mobile payment path is the existing `SendPaymentLinkDialog` flow (customer pays from their phone via Stripe Checkout URL).
- **No "detailer dispatched" / "en route" / "arrived" state exists** in `jobs.status` enum or any column — `grep` found only React Redux vocabulary usage. Pattern C (Hybrid dispatch+arrived) in Target E would require new schema.
- **Five Phase 4 architectural options enumerated evenhandedly in Target D** with codebase-feasibility evidence: (1) bring iPad, (2) personal device with same PIN, (3) job-specific hotlink, (4) dedicated mobile app, (5) hybrid shop-side + site-side.
- **Three Start Intake firing patterns enumerated in Target E** (A: shop-side, B: detailer-side, C: hybrid with dispatch state) — locked AC-3 doesn't choose A/B/C, leaves it to Phase 4.
- **7 open operator decisions surfaced (F.1–F.7):** device strategy, IP whitelist policy, job-specific access tokens, mobile checkout strategy, detailer-phone auth (PIN vs biometric vs per-device), photo bandwidth/compression, dispatch/en-route state addition.
- **Architectural conclusion:** Phase 4 can be built on the existing surface with two anchor decisions to lock: (1) IP whitelist policy for off-shop access (F.2), (2) Start Intake firing location per AC-3 (E.1). NO new entity or auth flow is structurally required for the basic workflow.

---

## Phase 1 — Foundation and Cleanup

These sessions are **philosophy-independent** — they're real drift bugs, safe state-machine openings, and structural cleanup. Can ship in parallel with Phase 0 audits running.

### Session 1.1 — Close no-op suppression patterns + HIGH parity finding

**Status:** `[ ]` Not started
**Source:** Parity audit b346d34b Session A
**Estimated scope:** ~20-35 prod lines / 4 files / +5-8 tests
**Memory #8 budget:** Comfortable

**Issue:** Two `onEditInPos`-shaped no-op suppression patterns remain post-#150:
1. **HIGH severity bug:** `<UnMaterializeConfirmationDialog context="admin" />` hardcoded at `appointment-detail-dialog.tsx:625`. When POS Schedule operator triggers un-materialize, modal hits admin endpoint via `adminFetch` → 401 → admin login redirect → operator booted from POS.
2. **No-op anti-pattern:** `/admin` dashboard mount at `admin/page.tsx:688-689` passes `onSave={async () => false}` and `onCancel={() => {}}` — visible-but-inert Save button on quick-peek surface.

**Solution:**
1. Add `hostContext?: 'admin' | 'pos'` prop to dialog (default `'admin'`). This unifies `mobileModalMode`, `modifierVariant`, and a new `unmaterializeContext` axis into one prop per parity audit Concern 2. Forward to `UnMaterializeConfirmationDialog` via prop, not hardcode.
2. Fix `/admin` dashboard mount: either add `readOnly?: boolean` prop and pass `readOnly={true}` (recommended per parity audit Q1), OR wire real handlers. Operator decision required.

**Why:**
- Closes a HIGH severity bug that breaks POS un-materialize flow ([AC-2](#ac-2-three-explicit-cross-table-syncs-no-others))
- Eliminates the no-op suppression anti-pattern that operator flagged repeatedly as "patch-work"
- Establishes the `hostContext` unified-prop pattern for future host-divergence needs

**Pre-tasks:**
- `[ ]` Operator decision: Q1 dashboard mount fix shape — read-only prop (recommended) OR wire real handlers
- `[ ]` Operator decision: Q2 prop unification — unify mobileModalMode + modifierVariant + unmaterializeContext into hostContext (recommended) OR keep separate

**Primary files:**
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` (line 625 hardcode + prop addition)
- `src/app/pos/jobs/components/job-queue.tsx` (replace mobileModalMode + modifierVariant with hostContext)
- `src/app/admin/page.tsx` (lines 688-689 dashboard mount fix)
- `src/app/admin/appointments/page.tsx` (consistency check on detailer view mount)

**Evidence citations:**
- `appointment-detail-dialog.tsx:625` — hardcoded `context="admin"` (parity audit b346d34b Target D Finding 1)
- `admin/page.tsx:688-689` — no-op handlers (parity audit b346d34b Target D Finding 2)
- Parity audit Session A scope: ~20-35 prod lines, 4 files, +5-8 tests

**Related sessions:**
- Unblocks: Session 1.2 (PATCH symmetry depends on dialog prop shape being stable)
- Unblocks: Session 1.3 (parity contract test asserts hostContext forwarding)

**Linked prompt:** TBD — drafted as Phase 1 begins

**Completion:** TBD

---

### Session 1.2 — Admin/POS PATCH endpoint symmetry

**Status:** `[ ]` Not started
**Source:** Parity audit b346d34b Session B
**Estimated scope:** ~12-18 prod lines / 2 files / +3-4 tests
**Memory #8 budget:** Comfortable

**Issue:** Admin PATCH endpoint at `src/app/api/appointments/[id]/route.ts` has 3 unintentional drifts vs POS PATCH:
1. Missing `jobs.assigned_staff_id` cascade when `employee_id` changes (POS cascades at `pos/appointments/[id]/route.ts:323-329`)
2. Missing `employee_id` in `audit_log` diff (POS includes it at `:386`)
3. Missing `employee_id: '' → null` normalization at update payload (POS normalizes at `:304`)

Plus admin uses raw `fetch()` instead of `adminFetch` at `admin/appointments/page.tsx:253, :278` — bypasses session-expiry redirect.

**Solution:**
1. Add `jobs.assigned_staff_id` cascade block to admin PATCH mirroring POS pattern
2. Add `'employee_id'` to admin's `buildChangeDetails` field list (line ~174)
3. Add `employee_id === '' ? null : ...` normalization at admin update payload (line ~113)
4. Swap raw `fetch` → `adminFetch` at admin handlers

**Why:**
- Closes 3 real drift bugs that cause data inconsistency (detailer reassignment doesn't propagate to jobs; audit log doesn't capture employee changes)
- Aligns Admin PATCH with POS PATCH for consistency
- Establishes adminFetch pattern usage per CLAUDE.md Rule [check current rule number for fetch pattern]

**Pre-tasks:**
- `[ ]` Verify Session 1.1 merged (prop shape stable)

**Primary files:**
- `src/app/api/appointments/[id]/route.ts` (3 drift fixes)
- `src/app/admin/appointments/page.tsx` (raw fetch → adminFetch swap)

**Evidence citations:**
- Drift #10 in parity audit b346d34b Target C: `jobs.assigned_staff_id` cascade missing (`appointments/[id]/route.ts:113` vs `pos/appointments/[id]/route.ts:323-329`)
- Drift #9: `employee_id` missing from `buildChangeDetails` (`appointments/[id]/route.ts:174`)
- Drift #11: `employee_id: '' → null` normalization missing
- Drift #15: raw `fetch()` usage at `admin/appointments/page.tsx:253, :278`

**Related sessions:**
- Depends on: Session 1.1 (prop shape stability)
- Unblocks: Session 1.3 (parity contract test will assert endpoint symmetry)

**Linked prompt:** TBD

**Completion:** TBD

---

### Session 1.3 — Cross-cutting parity contract + status permission gate

**Status:** `[ ]` Not started
**Source:** Parity audit b346d34b Session C
**Estimated scope:** ~15-25 prod lines + ~30-40 test lines / 4-5 files / +6-8 tests
**Memory #8 budget:** Comfortable

**Issue:**
1. Dialog accepts `canReschedule`, `canCancel`, `canAddNotes` props but NOT a `canUpdateStatus` prop. Operator without `appointments.update_status` permission sees the status dropdown, picks a new status, hits Save → 403 toast. Useless action surface.
2. No parity contract test exists to assert admin and POS hosts pass equivalent prop sets to the shared dialog. Drift will continue to be caught only at runtime.

**Solution:**
1. Add `canUpdateStatus?: boolean` prop to dialog (default `true` for backward compat). When `false`, render status as read-only `<dd>` block (mirrors customer/vehicle pattern).
2. Wire both hosts to pass current `canUpdateStatus` permission state.
3. Create new test at `src/app/__tests__/admin-pos-dialog-parity.test.tsx` — source-contract test asserting both hosts pass equivalent prop sets (minus documented host-context props).

**Why:**
- Closes the missing permission gate so users without status permission don't see useless dropdown
- Establishes a durable parity contract — future drift becomes test failure, not runtime surprise
- Precedent exists at `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx` (parity audit b346d34b Concern 1)

**Pre-tasks:**
- `[ ]` Verify Sessions 1.1, 1.2 merged
- `[ ]` Operator decision: Q5 status permission gate shape — explicit prop (recommended) OR always-read-only-unless-grant pattern

**Primary files:**
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` (add canUpdateStatus prop + render gate)
- `src/app/admin/appointments/page.tsx` (wire permission)
- `src/app/pos/jobs/components/job-queue.tsx` (wire permission)
- `src/app/admin/page.tsx` (dashboard mount — pass false if readOnly)
- NEW `src/app/__tests__/admin-pos-dialog-parity.test.tsx` (parity contract test)

**Evidence citations:**
- Parity audit b346d34b Target B.12 (status permission gate absent)
- Parity audit Concern 1 (parity contract test pattern)
- Precedent test: `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`

**Related sessions:**
- Depends on: Sessions 1.1, 1.2 (prop shape and endpoint symmetry stable)

**Linked prompt:** TBD

**Completion:** TBD

---

### Session 1.4 — Open SAFE state machine transitions

**Status:** `[ ]` Not started
**Source:** State machine audit b0efd95f + consequence map d3671c82 Target E.1
**Estimated scope:** ~10 prod lines / 2 files / +2-3 tests
**Memory #8 budget:** Tiny

**Issue:** `STATUS_TRANSITIONS` at `src/lib/appointments/status-transitions.ts:15-22` blocks two transitions that the consequence map (d3671c82) classified SAFE:
1. `pending → in_progress` — no PATCH-side effects; no idempotency concerns
2. `in_progress → no_show` — operator-reported error #2; no webhook fires (no_show isn't in WebhookEvent union)

**Solution:** Update `STATUS_TRANSITIONS`:

```typescript
pending: ['confirmed', 'in_progress', 'cancelled', 'no_show'],   // +in_progress
confirmed: ['in_progress', 'cancelled', 'no_show'],              // unchanged
in_progress: ['completed', 'cancelled', 'no_show'],              // +no_show
completed: [],
cancelled: [],
no_show: [],
```

Update the test at `src/app/api/pos/appointments/[id]/__tests__/patch.test.ts:261-264` to reflect the new permitted transitions.

**Why:**
- Closes operator-reported error #2 (`in_progress → no_show`) with zero compensating logic required (per [AC-5](#ac-5-state-machine-loosening-2-safe-2-with-cascade))
- Both transitions are SAFE per per-transition consequence map (no webhook fires, no idempotency concerns)

**Pre-tasks:**
- None — these are SAFE per consequence map d3671c82 Target D.1, D.3
- (Phase 0.1 n8n idempotency audit applies to MEDIUM transitions, not these two SAFE ones)

**Primary files:**
- `src/lib/appointments/status-transitions.ts` (the map)
- `src/app/api/pos/appointments/[id]/__tests__/patch.test.ts` (locked test update)

**Evidence citations:**
- Consequence map d3671c82 Target E.1: *"Open without conditions (2 transitions)"*
- State machine audit b0efd95f: operator-reported error #2 (`in_progress → no_show`)

**Related sessions:**
- Independent — can ship anytime
- Unblocks: Session 1.5 (state machine loosening pattern established)

**Linked prompt:** TBD

**Completion:** TBD

---

### Session 1.5 — Wire un-materialize cascade into PATCH for backward reverts

**Status:** `[ ]` Not started
**Source:** State machine audit b0efd95f Q1 + consequence map d3671c82 Target E.3
**Estimated scope:** ~20-30 prod lines / 2 files / +4-6 tests
**Memory #8 budget:** Comfortable

**Issue:** Two backward-revert transitions are HIGH risk only because PATCH doesn't invoke the existing un-materialize cascade:
1. `confirmed → pending` (operator-reported error #1)
2. `in_progress → pending`

When `has_active_job=true`, the dialog Save intercept correctly routes to `executeUnMaterialize`. But raw PATCH (scripts, tests, future API callers) bypasses the dialog and leaves orphan jobs.

The cascade is ALREADY CODED — `lifecycle-sync.ts:59-72`'s `jobStatusForAppointmentStatus` returns `delete_job` action for these transitions — just not invoked from PATCH.

**Solution:**
1. Open `confirmed → pending` and `in_progress → pending` in `STATUS_TRANSITIONS`
2. In POS PATCH handler at `pos/appointments/[id]/route.ts:236-251`, when target status is `pending` AND `appointment.has_active_job=true`, invoke `executeUnMaterialize` cascade before completing the PATCH
3. Mirror in admin PATCH for symmetry (per [AC-5](#ac-5-state-machine-loosening-2-safe-2-with-cascade))
4. Tests: verify cascade fires; verify orphan-job state is prevented

**Why:**
- Closes operator-reported error #1 (`confirmed → pending`) safely
- Eliminates the orphan-job race for non-dialog callers
- Uses existing `executeUnMaterialize` infrastructure — no new architecture, just wiring

**Pre-tasks:**
- `[ ]` Phase 0.1 audit complete (verifies n8n receiver idempotency — relevant for `appointment_confirmed` webhook re-fire if customer goes pending → confirmed → pending → confirmed)
- `[ ]` Verify Session 1.4 merged (state machine loosening pattern in place)

**Primary files:**
- `src/lib/appointments/status-transitions.ts` (open the 2 transitions)
- `src/app/api/pos/appointments/[id]/route.ts:236-251` (wire cascade)
- `src/app/api/appointments/[id]/route.ts` (mirror for symmetry)

**Evidence citations:**
- Consequence map d3671c82 Target E.3: *"Open with server-side compensating logic"*
- `lifecycle-sync.ts:59-72` — `jobStatusForAppointmentStatus` returns `delete_job` (already coded)
- State machine audit b0efd95f Q1: un-materialize cascade into PATCH (recommended)

**Related sessions:**
- Depends on: Session 1.4 (state machine loosening pattern)
- Depends on: Phase 0.1 audit (n8n idempotency check)

**Linked prompt:** TBD

**Completion:** TBD

---

### Session 1.6 — Retire POS > Appointments tab

**Status:** `[ ]` Not started
**Source:** Item 15e Phase 3 (never shipped) + conceptual audit 26521e5a Target G.4
**Estimated scope:** ~10-20 prod lines (mostly removal) / 2-3 files / minimal test changes
**Memory #8 budget:** Comfortable

**Issue:** POS bottom nav still renders both `Jobs` and `Appointments` tabs at `src/app/pos/components/bottom-nav.tsx:195-206`. The Appointments tab is a third near-duplicate surface alongside Today + Schedule scopes within POS > Jobs. Item 15e Phase 3 (retire and absorb POS Appointments tab) was scoped but never shipped.

**Solution:**
1. Remove the Appointments tab nav entry from `pos/components/bottom-nav.tsx`
2. Route `/pos/appointments` → `/pos/jobs?scope=schedule` (backward compat for any bookmarks/deep-links)
3. Verify no other route or code path depends on `/pos/appointments` rendering
4. Optionally: delete the `/pos/appointments` page if it becomes truly orphaned (or keep redirect-only for safety)

**Why:**
- Eliminates the third overlap surface per [AC-4](#ac-4-pos--jobs-as-unified-surface-pos--appointments-tab-retires)
- Closes Item 15e Phase 3 work
- Reduces operator surface confusion (operator's stated concern: too many surfaces overlap)

**Pre-tasks:**
- `[ ]` Verify Sessions 1.1-1.3 merged (dialog stability)
- `[ ]` Grep verify: any code outside `/pos/appointments` references it directly?

**Primary files:**
- `src/app/pos/components/bottom-nav.tsx:195-206` (remove tab entry)
- `src/app/pos/appointments/page.tsx` (delete or redirect)
- `next.config.js` or middleware (redirect rule, if needed)

**Evidence citations:**
- Conceptual audit 26521e5a Target C.5: *"POS bottom nav still renders both Jobs and Appointments tabs"*
- Item 15e Phase 3 scope (referenced in conceptual audit but never shipped)

**Related sessions:**
- Depends on: Sessions 1.1-1.3 (dialog work stable; Schedule scope is the absorbing surface)
- Unblocks: Phase 2 sessions on unified Jobs surface

**Linked prompt:** TBD

**Completion:** TBD

---

### Session 1.7 — Fix `convertQuote` unconditional `appointment_confirmed` webhook fire

**Status:** `[x]` Complete — 2026-06-05 (PST), merge `f87aca58`
**Source:** Phase 0.1 audit (`69b15b0f`, Target E.3 + F.4) + Phase 0.2 audit (`0b9684db`, F.4) — same bug surfaced independently by both audits
**Estimated scope:** ~18 prod lines / ~110 test lines / 2 files (actual: 1 src + 1 test + CHANGELOG entry)
**Memory #8 budget:** Tiny — within bounds

**Issue:** `convertQuote` at `src/lib/quotes/convert-service.ts:240` fired the `appointment_confirmed` n8n webhook **unconditionally**, regardless of whether the resulting row landed at `status='confirmed'` or `status='pending'`. Voice-agent + SMS AI v2 invoke `convertQuote` with `appointmentStatus: 'pending'` (per `voice-agent/appointments/route.ts:290`'s hardcoded `{ appointmentStatus: 'pending', channel: 'phone' }`). Row landed at pending. Webhook fired anyway. Downstream n8n consumers sent "Your appointment is confirmed" notifications to customers whose appointments had **not** been confirmed (no payment received, no staff review).

**Solution:** wrap the `fireWebhook` call in `if (appointment.status === 'confirmed') { … }`. Mirrors the public booking route's pattern at `src/app/api/book/route.ts:921-929` — single source of truth for the "status → webhook" tie. The condition reads the WRITTEN status on the appointment row (returned from the INSERT at `:128-158`), not the call-site's intent — so it correctly gates on the actual outcome regardless of caller default vs override. In-source comment block at the gate documents the bug history + the AC-11 scope boundary.

**Why:**
- Closes a customer-facing bug actively producing misleading "appointment confirmed" SMS for pending appointments
- Stops the wire-layer semantic ambiguity (`appointment_confirmed` event for a `status='pending'` row) that Phase 0.1 Target E.3 flagged as one of the four sources that complicate the n8n idempotency question
- Pattern-mirror to `book/route.ts:921-929` — no new architecture, just wiring consistency

**Pre-tasks:**
- `[x]` Phase 0.1 + 0.2 audits merged (provide the F.4 evidence)
- No code dependency on Sessions 1.1–1.6 — this fix is at a different seam and runs in parallel with Phase 0.4

**Primary files:**
- `src/lib/quotes/convert-service.ts:240-258` (MOD, +17/−1 — conditional wrap + 15-line in-source comment block)
- `src/lib/quotes/__tests__/convert-service.test.ts` (MOD, +~110 / +4 cases — pin conditional contract)
- `docs/CHANGELOG.md` (Session 1.7 entry)

**Evidence citations:**
- Phase 0.1 audit (`69b15b0f`) Target E.3 row 1 + Target F.4 — *"`convertQuote` fires `appointment_confirmed` webhook UNCONDITIONALLY (`convert-service.ts:240`) regardless of resulting status"*
- Phase 0.2 audit (`0b9684db`) F.4 — same finding, independently surfaced
- `src/app/api/book/route.ts:921-929` — the mirrored conditional-fire pattern

**Out of scope (Phase 3 work this session does NOT touch):**
- Does NOT change the voice-agent hardcoded `'pending'` write at `voice-agent/appointments/route.ts:516`/`:290` — AC-11 enforcement requires the payment-link primitive
- Does NOT change POS A.1's default `'confirmed'` write in `convertQuote:134` (Phase 0.2 F.1)
- Does NOT add an `appointment_pending` webhook event
- Does NOT modify `fireWebhook` itself — only the call site

**Verification gates:**
- `npx tsc --noEmit` → 0 errors
- `npm run lint` → 0 errors / 97 baseline warnings (Money-Unify + phone-display ongoing migrations, none on touched files)
- `npm run build` → clean
- `npx vitest run` → 2971/2971 passing across 179 files (+4 new in `convert-service.test.ts`, 24 total)
- Post-merge verify on main: convert-service test file passes (24/24)

**Related sessions:**
- Independent of Sessions 1.1–1.6 (different seam)
- Forward-compatible with Phase 3 AC-11 work — if a future session changes the operator default to `'pending'`, the gate continues to do the right thing automatically (it keys on the WRITTEN status)

**Linked prompt:** Session prompt above this entry in conversation log (2026-06-05 PST)

**Completion:** 2026-06-05 PST, merge `f87aca58`

---

## Phase 2 — Lifecycle Architecture (STUB)

**Pre-task:** Phase 0.3 audit must complete before this phase can be detailed.

**Themes (high-level):**
- Start Intake as materialization trigger (per [AC-3](#ac-3-start-intake-as-materialization-trigger))
- Forward-arrow disposition (per [AC-8](#ac-8-forward-arrow-in-today-scope-routes-to-schedule-when-crossing-today))
- Terminal-state filter affordances (per [AC-7](#ac-7-terminal-states-viewable-via-filter-hidden-by-default))
- Populate redesign or removal (gated by Phase 0.3 findings)
- Unified Jobs surface refinement (post-tab-retirement)

**Approximate session count:** 4-6 sessions, ~200-400 prod lines total.

**To be detailed after Phase 0.3 audit.**

---

## Phase 3 — Cross-cutting Commitments (STUB)

**Pre-task:** Phase 0.1 + Phase 0.2 audits must complete before this phase can be detailed.

**Themes (high-level):**
- Pending vs Confirmed semantic enforcement across all three booking paths (per [AC-11](#ac-11-pending-vs-confirmed-semantic-enforcement-payment-driven))
- Unified ticket number scheme — implement `appointment_number` (A-XXXX) column + generation (per [AC-10](#ac-10-unified-ticket-number-scheme-tbd-detail-principle-locked))
- Quote → Appointment conversion formalized (depends on Phase 0.2 findings)
- Cancel-with-partial-payment pathways A and B (per [AC-9](#ac-9-cancel-with-partial-payment-decision-pathways))
- SMS/Phone agent payment link integration (depends on Phase 0.1 findings)
- Manual amount silent-drop fix — Option C cascade endpoint extension (manual amount audit f73661b7 Q2)

**Approximate session count:** 5-8 sessions, ~300-500 prod lines total.

**To be detailed after Phase 0.1 and 0.2 audits.**

---

## Phase 4 — Mobile Architecture (STUB)

**Pre-task:** Phase 0.4 audit must complete before this phase can be detailed.

**Themes (high-level):**
- Mobile detailer access mechanism (TBD per audit findings)
- Mobile-specific Start Intake flow
- Mobile photo capture / timer / addon handling

**Approximate session count:** 2-4 sessions, scope unknown until audit returns.

**To be detailed after Phase 0.4 audit.**

---

## Decisions Log

Format: each entry preserves history. Reversed decisions show original (strikethrough) + new rationale below.

### 2026-06-04 10:30 PST — Initial document locked

All architectural commitments AC-1 through AC-11 locked at v1.0. No prior decisions to preserve.

Stage definitions for Quote, Appointment, Job, POS Transaction, Walk-in sub-state, and Un-materialized sub-state locked.

Phase 0-1 plans detailed; Phases 2-4 stubbed.

---

## Document Maintenance Rules

### Update triggers

This document is updated in the following situations:

1. **Session completion:** When any session in Phase 0-4 lands, the session block is updated with `[x]` status, merge commit hash, completion date (PST timezone), and any deviations noted.

2. **Decision changes:** If an architectural commitment (AC-N) needs revision, the session pauses (per [Decision Precedence Rule A](#decision-precedence)). Original rationale stays with strikethrough; new rationale added below; version bumps to next minor (v1.0 → v1.1).

3. **Audit returns:** When a Phase 0 audit deliverable merges, the relevant Phase entry updates its `[ ]` pre-task checkbox to `[x]` with the deliverable path noted. Dependent sessions may be drafted in detail after this.

4. **New session identified:** If during planning a new session emerges that fits an existing Phase, add it with `[ ]` status. If it doesn't fit any existing Phase, escalate to operator before adding.

### Decision precedence

**Rule A — Architectural decisions (AC-N items):** if a session uncovers a finding that contradicts an architectural commitment, the session pauses, this document is updated, the decision is revisited with operator.

**Rule B — Tactical implementation details:** if a session uncovers a finding that contradicts only the session's specifics (not an AC-N), the session may proceed with the new approach. The session block in this document is updated with deviation notes at completion.

### Session prompt requirements

Every session prompt MUST:

1. Reference this document as the authoritative source
2. Reference the specific session block (e.g., "Session 1.4 per QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md")
3. Reference any AC-N commitments invoked
4. Include in its documentation-update step: "Update QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md session 1.4 status to [x] with merge hash and date"

### Rationale field rules (re-stated)

Every architectural commitment and stage definition has a Rationale field. The Rationale MUST cite ONE of:

- **Operator input** (direct quote, dated to conversation)
- **Codebase fact** (with file:line citation)
- **Audit finding** (with audit identifier and target reference, e.g., "Consequence map d3671c82 Target E.1")

The phrase "because Claude recommended" is NEVER a valid rationale. If Claude's recommendation isn't backed by one of the above three sources, it gets reframed to one that is, OR the rationale field is left blank and the commitment is downgraded to WORKING (not LOCKED) status.

### Versioning

Document version bumps:

- **v1.x** (minor) — architectural commitments refined; new sessions added; stages clarified
- **v2.0** (major) — structural reorganization; Phase boundaries redrawn; entire stages added/removed

Every session that lands references the document version it was prompted against. The version is in the document header. Conflicts between session execution and document state are resolved per Decision Precedence rules.

### Sunset condition

This document remains LIVING until all four phases are complete. After Phase 4 closes, the document is preserved as historical record of the architectural arc and the final state of architectural commitments. New post-Phase-4 work proceeds against the document as reference but does not modify it further (decisions log may still accept entries for traceability).

---

**END OF DOCUMENT v1.0**

*Next action: operator review. Once locked, Phase 0 audits can be drafted and fired. Phase 1 sessions can ship in parallel with Phase 0 audits running.*
