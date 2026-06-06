# Quote → POS Lifecycle Architecture

**Version:** 1.1
**Locked:** 2026-06-04 10:30 PST (v1.0); 2026-06-05 21:30 PST (v1.1)
**Status:** LIVING — updated session-by-session
**Scope:** POS lifecycle architecture (Quote → Appointment → Job → POS Transaction)

**v1.1 captures the comprehensive operator decision-lock session of 2026-06-05, executed after all four Phase 0 foundational audits (0.1–0.4) and two targeted post-Phase-0 audits (webhook receivers identity, refund/credit/cancellation-fee) completed and merged. New ACs added: AC-12 through AC-15. ACs already refined in v1.0.x line via audit completions: AC-5 (pre-task RESOLVED by webhook receivers audit), AC-9 (verified implementation scope per refund audit). New Phase 1 session added: Session 1.8 (waitlist silent-drop fix). Phased Plan Overview status table updated to reflect Phase 0 completion. All six audit deliverables linked from Reference Index.**

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

**Pre-task before execution:** ~~Phase 0.1 audit verifies n8n receiver idempotency for `appointment_confirmed` and `appointment_completed` webhooks. If receiver is not idempotent, opening MEDIUM transitions (currently 8 per consequence map) requires source-side idempotency guards added before loosening proceeds.~~ **RESOLVED** by the Webhook Receivers Identity audit (`f5e714a8`, 2026-06-05): no n8n receiver exists in production — `business_settings.n8n_webhook_urls` is seeded with all-null values and no admin UI populates it; `fireWebhook` is silently no-op at `webhook.ts:40` for every event. **Customer-facing duplicate-SMS risk via the webhook chain cannot occur** because the chain terminates with no HTTP request. Session 1.5 (un-materialize cascade in PATCH for `confirmed → pending` + `in_progress → pending`) and the 8 MEDIUM transitions per the consequence map are UNBLOCKED for the webhook concern specifically. **Forward caveat:** if Smart Details ever wires a receiver, source-side idempotency tokens will need to be added across the 25 fire sites — but that is contingent on future receiver configuration, not Session 1.5's structural change. The 2 SAFE transitions remain unaffected by any of this.

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

**Implementation TBD:** Phase 3 session. Customer credit infrastructure does not exist — verified by refund/credit audit `3e633156`. See [AC-14](#ac-14-cancellation-fee-policy) for the cancellation fee policy locked in v1.1 and [AC-15](#ac-15-customer-credit-infrastructure) for the credit infrastructure build-from-scratch commitment locked in v1.1.

**Verified current state (refund/credit audit `3e633156`, 2026-06-05):**
- **Pathway A — PARTIALLY IMPLEMENTED:** the refund engine exists at `/api/pos/refunds` (756 lines, full `stripe.refunds.create` integration, partial-amount support, LIFO close-out resolution) but is **NOT WIRED to any cancel endpoint**. Operator does 3 manual steps today: cancel appointment → un-materialize (via Revert button) → navigate to POS > Transactions and click Issue Refund separately. The un-materialize cascade gap is also the AC-2.1 orphan-gap. Cancel SMS template carries no refund-confirmation chip.
- **Pathway B — ESSENTIALLY UNIMPLEMENTED at the schema level:** no `customer_credits` table, no `customers.credit_balance` column. The only "credit" is `transactions.deposit_credit` (per-transaction memo applied only at SAME-appointment close-out via `appointments.deposit_amount`). No cross-appointment transfer mechanism. Operator's stated "deposit-retained-as-credit" workflow works only when they EDIT the same appointment rather than truly cancelling it. **Closed by [AC-15](#ac-15-customer-credit-infrastructure) (v1.1).**
- **Cancellation fee — DECORATIVE ONLY:** `appointments.cancellation_fee` column persisted by admin cancel (feature-flag + permission gated) but operator-typed per cancel (NO `$50` default, NO global config, NO `FEE_AMOUNT` constant — verified). NO code path reads it later to compute refund or deduct from deposit. ~~The fee's pathway (A subtype / B subtype / its own Pathway C / reporting-only) is unresolved in the locked AC-9 text and surfaced as decision F.5 in the audit.~~ **Resolved by [AC-14](#ac-14-cancellation-fee-policy) (v1.1):** fee belongs to Pathway A by default; toggleable per cancel; default $50 in `business_settings`.
- **Customer self-cancel within 24h window** does NOT auto-refund — status-flip only.

**Rationale:**
- **Operator input:** *"how do we handle partial payments for this scenario?"* — flagged as concern requiring design
- **Architectural:** preserves the principle that money decisions are operator-explicit, not buried in cancel logic
- **Audit-verified:** refund/credit audit `3e633156` confirmed components exist for Pathway A but require orchestration; Pathway B requires net-new `customer_credits` table + cancel-issue + checkout-apply logic + UI affordance + SMS chip. Six open operator decisions (F.1–F.6) await resolution before Phase 3 detailing.

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

### AC-12: Customer-accept auto-conversion to pending appointment with SLA alerting

**Commitment:** When a customer clicks "Accept" on a quote (via SMS/email link → `POST /api/quotes/[id]/accept`), the system automatically creates an appointment row at `status='pending'` and writes `quotes.status='converted'` + `quotes.converted_appointment_id=<new appointment id>`. Lifecycle engine adds an SLA rule: if a pending appointment originating from quote-accept has no staff confirmation (status not advanced beyond `pending`) within a configurable threshold (initial value: 4 business hours), alert operator via SMS/notification.

**Current state (per Phase 0.2 audit `dcf511df` F.8):** customer accept sets `quotes.status='accepted'` and notifies staff via *"Our team will reach out shortly to schedule"* (literal copy at `src/app/api/quotes/[id]/accept/route.ts:97`/`:101`). **No appointment row is created.** Customer momentum is preserved only by manual operator follow-up; if staff misses the notification the conversion drops silently.

**Implementation scope (Phase 3):**
- Extend `POST /api/quotes/[id]/accept` to invoke `convertQuote` (per `src/lib/quotes/convert-service.ts:31-243`) with `{ appointmentStatus: 'pending', channel: 'customer_accept' }` after the status update at `:64-70`
- Adopt a placeholder `scheduled_date` strategy at convert time (operator decision F.6 in Phase 0.2 audit applies — TBD: same-day, next-business-day, or NULL until operator schedules)
- Add SLA rule to lifecycle engine: query `appointments WHERE channel='customer_accept' AND status='pending' AND created_at < NOW() - INTERVAL '4 hours'`; fire `staff_sla_alert` template
- New `channel` enum value: `customer_accept` (or reuse existing — TBD at planning)

**Rationale:**
- **Operator input (2026-06-05 decision-locking session):** customer-accept staying manual creates a frictionless gap; auto-conversion preserves customer momentum while SLA alerting prevents dropped conversions.
- **Audit finding (Phase 0.2 audit `dcf511df` F.8):** identified the current silent customer-accept behavior as a real product gap.
- **Codebase fact:** `convertQuote` already accepts the `appointmentStatus: 'pending'` override path (`convert-service.ts:24-29`); no new architecture needed at the conversion layer.

---

### AC-13: Mobile Phase 4 minimum-scope path

**Commitment:** Phase 4 implements the minimum-scope path identified in Phase 0.4. Specifically:

- Mobile detailer uses personal device with same PIN auth (no separate mobile app)
- IP whitelist policy: **disabled for `/pos/*` routes**; admin routes remain whitelisted
- Same job-detail UI; no mobile-specific variant
- Mobile checkout via payment link only (Stripe Terminal remains LAN-locked)
- Start Intake fires from detailer's phone at customer site (Pattern B from Phase 0.4 Target E.1)

**Explicitly deferred (NOT in initial Phase 4):**
- Job-specific access tokens
- Dispatch-state enum or assignment workflow
- Photo bandwidth optimization
- Biometric / separate auth path

If real-world Phase 4 usage surfaces friction (dispatch coordination problems, photo upload latency, security incidents), revisit the deferred items as separate refinement sessions.

**Rationale:**
- **Audit finding (Phase 0.4 audit `e10e23a5`):** near-zero infrastructure exists for mobile detailers but most architecture incidentally works — PWA manifest scoped to `/pos`, camera capture already wired (`src/app/pos/jobs/components/photo-uploader.tsx`), offline cash queue already implemented.
- **Operator input (2026-06-05 decision-locking session):** *"Lock in the minimum scope path, we can expand later."*
- **Architectural principle:** avoids speculative scope; observation-driven refinement.

---

### AC-14: Cancellation fee policy

**Commitment:**

- **Default cancellation fee value** stored in `business_settings` (initial value: **$50**)
- **Per-appointment override** available to admin/operator at cancel time via the existing `appointments.cancellation_fee` column
- **Fee deduction is operator-toggleable per cancel** (default ON; operator can waive at cancel-time UI)
- **Cancellation fee semantically belongs to Pathway A (Cancel & Refund):** `refund_amount = paid_amount - fee`
- **Pathway B (Cancel & Retain credit) does not typically apply a fee** — customer is staying, so retention waives the fee by default (operator may toggle on for edge cases)
- **Refund UI shows breakdown** before confirm: `Paid: $X | Fee: $Y | Refund: $Z`

**Current state (per refund/credit/cancellation-fee audit `3e633156`):** `appointments.cancellation_fee` column is **decorative**. The admin cancel endpoint persists the operator-typed value but no code path reads it later to apply against refund amount. There is NO `$50` default, NO global config setting, NO `FEE_AMOUNT` constant — verified by the audit.

**Implementation scope (Phase 3):**
- New `business_settings` row `cancellation_fee_default_amount` (numeric, default $50)
- Cancel-endpoint payload extension: `apply_fee?: boolean` (defaults to true), `fee_amount?: number` (defaults to setting)
- Orchestration in cancel endpoint: when `payment_status IN ('partial', 'paid')` AND `apply_fee=true`, compute `refund_amount = paid_amount - fee_amount` and pass to refund engine
- Cancel SMS template: add `cancellation_fee_amount` chip to existing `appointment_cancelled` template; render conditionally per `apply_fee`
- Cancel dialog UI: surface "Apply cancellation fee" toggle + show breakdown preview

**Rationale:**
- **Audit finding (`3e633156`):** `appointments.cancellation_fee` exists but is decorative (gap #3 in the inventory; surfaced as decision F.5 in the audit).
- **Operator input (2026-06-05 decision-locking session):** fixed default with per-appointment override; operator-toggleable; breakdown shown.
- **Architectural cleanliness:** keeps fee policy in `business_settings` (consistent with deposit_default_amount, quote_validity_days), avoids per-call magic numbers.

---

### AC-15: Customer credit infrastructure

**Commitment:** Customer credit system is Phase 3 build-from-scratch work. The current operator workflow ("deposit retained as credit, applied to new ticket") works only because the operator edits the SAME appointment rather than truly cancelling it — that's a workaround, not a credit system. Phase 3 closes this gap with real infrastructure:

**Architectural shape (locked; schema details decided at implementation):**

- New table: `customer_credits` (or equivalent) with columns including `id`, `customer_id`, `amount_cents`, `source_appointment_id` (FK to the cancelled appointment), `created_at`, `applied_to_transaction_id` (nullable), `applied_at` (nullable), `notes`
- **Credit-creation logic** at cancel-time (Pathway B): when operator chooses "Cancel & Retain credit," compute credit amount from `paid_amount - cancellation_fee` (fee waived by default per AC-14), write `customer_credits` row, mark cancellation reason with credit reference, notify customer with credit balance
- **Credit-application logic** at new-ticket checkout: query open credits for customer at POS register-tab load; allow operator to apply as discount line item; on apply, mark `applied_to_transaction_id` + `applied_at`
- **Operator UI affordances:** Admin > Customer > Credits tab showing balance + history; POS register Apply Credit affordance during checkout
- **Manual credit adjustments:** admin-only UI to add or revoke credit (audit-logged)
- **Expiration policy DEFERRED to refinement** after basic system ships — initial implementation treats credits as non-expiring

**Current state (per refund/credit/cancellation-fee audit `3e633156`):** customer-level credit infrastructure DOES NOT EXIST. No `customer_credits` table; no `customers.credit_balance` column. The only "credit" primitive is `transactions.deposit_credit` (per-transaction memo applied only at SAME-appointment close-out via `appointments.deposit_amount`). No cross-appointment transfer mechanism. Operator's stated "deposit-retained-as-credit" workflow works only when they EDIT the same appointment rather than truly cancelling it.

**Rationale:**
- **Audit finding (`3e633156`):** customer-level credit infrastructure does not exist; Pathway B is unimplemented at the schema level.
- **Operator input (2026-06-05 decision-locking session):** *"lock the architectural shape now; expiration policy refinement after basic system ships."*
- **Closes a real architectural gap** — Pathway B was committed in AC-9 (v1.0) but has no schema underpinning today.

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
- **SMS / Phone agent booking flow audit (Phase 0.1, `69b15b0f`):** `docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md` — 4 production booking paths (not 3); voice-agent + SMS-AI-v2 share the same 13-tool surface at `/api/voice-agent/*`; both hardcode `'pending'` at `voice-agent/appointments/route.ts:516`/`:290`; zero payment infrastructure on agent paths; informs AC-11 enforcement scope; 6 open operator decisions (F.1–F.6); Memory #30 boundary verified clean
- **Quote → Appointment conversion audit (Phase 0.2, `dcf511df`):** `docs/dev/QUOTE_TO_APPOINTMENT_CONVERSION_AUDIT.md` — 6 wired conversion paths route through 2 architectural seams (canonical `convertQuote()` + walk-in atomic-create); 8 dimensions of seam divergence; customer accept does NOT auto-create appointment (informs AC-12); `convertQuote` fires `appointment_confirmed` unconditionally (fixed by Session 1.7 `f87aca58`); 8 open operator decisions (F.1–F.8)
- **Populate dependencies audit (Phase 0.3, `98a5f30d`):** `docs/dev/POPULATE_DEPENDENCIES_AUDIT.md` — `populate` is the lazy materialization trigger today; informs AC-3 (Start Intake redesign) migration scope; identifies what currently depends on pre-materialized today's jobs vs what can read from `appointments` directly
- **Mobile detailer access audit (Phase 0.4, `e10e23a5`):** `docs/dev/MOBILE_DETAILER_ACCESS_AUDIT.md` — near-zero infrastructure exists; most architecture incidentally works (PWA scoped to `/pos`, camera capture, offline cash queue); identifies minimum-scope path locked as [AC-13](#ac-13-mobile-phase-4-minimum-scope-path)
- **Webhook receivers identity audit (`f5e714a8`, post-Phase-0):** `docs/dev/WEBHOOK_RECEIVERS_IDENTITY_AUDIT.md` — resolves Phase 0.1 Target E.3 BLOCKED verdict; finds no webhook receiver exists in production (`business_settings.n8n_webhook_urls` all-null since seed); 25 `fireWebhook` sites silently no-op; customer SMS is direct via `sendSms`, not webhook-mediated; **AC-5 / Session 1.5 UNBLOCKED**
- **Refund / credit / cancellation-fee audit (`3e633156`, post-Phase-0):** `docs/dev/REFUND_CREDIT_CANCELLATION_FEE_AUDIT.md` — informs AC-9 implementation scoping; 4 cancel endpoints inventoried, NONE invoke refund/credit/fee-deduction; refund engine (`/api/pos/refunds`, 756 lines) exists in isolation but NOT wired to cancel; **`customer_credits` table DOES NOT EXIST** — Pathway B is unimplemented at the schema level; `cancellation_fee` column is decorative (no money-movement reader); 6 open operator decisions (F.1–F.6) including fee semantics (Pathway A subtype / B subtype / Pathway C)

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
| **Phase 0** | Foundational audits (0.1–0.4) + 2 targeted post-Phase-0 audits (webhook receivers, refund/credit/cancellation-fee) | None — audits run first | `[x]` **Complete** (all 4 Phase 0 audits + 2 targeted audits merged 2026-06-05) |
| **Phase 1** | Foundation + cleanup (drift fixes, safe state-machine openings, tab retirement, Session 1.7 webhook gate, Session 1.8 / 1.8.1 waitlist silent-drop) | None — philosophy-independent | `[x]` **Complete** — all 10 sessions merged: 1.1 (`1658914a`), 1.2 (`412a404b`), 1.2.1 (`7d4d815a`), 1.3 (`a7a57949`), 1.4 (`44c8ea05`), 1.5 (`04921ad1`), 1.6 (`cfa9cfa4`), 1.7 (`f87aca58`), 1.8 (`3c118b2d`), 1.8.1 (`c2294d6b`) |
| **Phase 2** | Lifecycle architecture (Start Intake redesign, forward-arrow, terminal-state filters) | Phase 0.3 + 0.1 audits complete | `[~]` **In progress** — Session 2.1 (`a5d2a0d6`) + 2.2 (`f25bb87d`) + 2.3 (`269b94f7`) merged 2026-06-06 PDT; AC-3 + AC-8 complete |
| **Phase 3** | Cross-cutting (pending/confirmed semantic [AC-11], unified ticket number [AC-10], Quote→Appointment formalized [AC-12], cancellation fee [AC-14], customer credits [AC-15], cancel-with-payment [AC-9]) | Phase 0.1 + 0.2 audits + refund/credit audit complete | `[ ]` Not started — **ready to detail** (Phase 0.1, 0.2, refund audits informed) |
| **Phase 4** | Mobile detailer architecture — minimum-scope path per [AC-13](#ac-13-mobile-phase-4-minimum-scope-path) | Phase 0.4 audit complete | `[ ]` Not started — **ready to detail** (Phase 0.4 audit informed; AC-13 locked) |

**Phase 1 ships in parallel with all other work.** Phases 2–4 are now unblocked for detailing.

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

**Status:** `[x]` **Complete — merged to main at `1658914a` on 2026-06-06 12:53 PDT**
**Source:** Parity audit b346d34b Session A
**Estimated scope:** ~20-35 prod lines / 4 files / +5-8 tests
**Actual scope:** ~29 prod lines / 3 prod files (dialog + admin dashboard + POS job-queue) / +13 test cases across 2 new + 1 modified test files / +1 CHANGELOG entry / +1 doc status flip
**Memory #8 budget:** Comfortable (honored)

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
- `[x]` Operator decision: Q1 dashboard mount fix shape — **read-only prop** (LOCKED Option A; in-prompt confirmation)
- `[x]` Operator decision: Q2 prop unification — **unify into `hostContext`** (LOCKED Option A; clean removal of mobileModalMode + modifierVariant per Memory #2; only 2 call sites used the legacy props)

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

**Linked prompt:** session-1-1.md

**Completion:** Merged at `1658914a` on 2026-06-06 12:53 PDT. Both findings closed. HIGH bug (un-materialize `context="admin"` hardcode at line 625) fixed by threading from new `hostContext` prop — POS Schedule un-materialize now correctly routes through `posFetch` to POS endpoint with POS auth. No-op anti-pattern (`onSave={async () => false}` + `onCancel={() => {}}` at dashboard mount) replaced by `readOnly={true}` flag (Q1 LOCKED Option A); dashboard quick-peek now hides Save Changes + Cancel Appointment buttons and disables editable fields (Status select, both notes textareas, mobile pencil, Enable Mobile button). Prop unification (Q2 LOCKED Option A — clean removal): legacy `mobileModalMode` + `modifierVariant` collapsed into single `hostContext?: 'admin' | 'pos'` prop, threaded to `<EditMobileModal mode>` + `<ModifierSummary variant>` + `<UnMaterializeConfirmationDialog context>`. `returnToPath` stays separate per Concern 2 (parameterizes URL, not host). Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings) / build clean / 181 test files / 2986 tests passing pre-merge (was 179 / 2973; +2 files / +13 cases); post-merge 183 files / 3008 tests passing (includes Session 1.5 + 1.8.1 increments). Memory #11 verification at execution time: line 625 hardcode + lines 688-689 no-ops + POS Schedule prop pass-through at job-queue.tsx:1234-1236 all confirmed; `UnMaterializeConfirmationDialog.context` prop already typed `'admin' | 'pos'` so no upstream extension required. Memory #29 surfaced finding: `src/app/admin/appointments/page.tsx` doesn't pass legacy props (relies on defaults); no source change needed there. Parallel-merge resolution: ran alongside Sessions 1.5 + 1.8.1; merge order 1.8.1 → 1.5 → 1.1; CHANGELOG conflict on Session 1.1 merge resolved by keeping all three entries (minimal-diff placement per Memory #29 — same-day batch grouping).

---

### Session 1.2 — Admin/POS PATCH endpoint symmetry

**Status:** `[x]` **Complete — merged to main at `412a404b` on 2026-06-06 13:48 PDT**
**Source:** Parity audit b346d34b Session B
**Estimated scope:** ~12-18 prod lines / 2 files / +3-4 tests
**Actual scope:** ~12 prod-logic lines / 2 prod files / +4 test cases + mock extension / +1 CHANGELOG entry / +1 doc status flip
**Memory #8 budget:** Comfortable (honored)

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
- `[x]` Verify Session 1.1 merged (prop shape stable) — merged at `1658914a` on 2026-06-06 12:53 PDT

**Primary files:**
- `src/app/api/appointments/[id]/route.ts` (3 drift fixes)
- `src/app/admin/appointments/page.tsx` (raw fetch → adminFetch swap)

**Evidence citations:**
- Drift #10 in parity audit b346d34b Target C: `jobs.assigned_staff_id` cascade missing (`appointments/[id]/route.ts:113` vs `pos/appointments/[id]/route.ts:323-329`)
- Drift #9: `employee_id` missing from `buildChangeDetails` (`appointments/[id]/route.ts:174`)
- Drift #11: `employee_id: '' → null` normalization missing
- Drift #15: raw `fetch()` usage at `admin/appointments/page.tsx:253, :278`

**Related sessions:**
- Depends on: Session 1.1 (prop shape stability) ✓
- Unblocks: Session 1.3 (parity contract test will assert endpoint symmetry — the four mirrored behaviors are now stable to reference by name in the contract test)

**Linked prompt:** session-1-2.md

**Completion:** Merged at `412a404b` on 2026-06-06 13:48 PDT. All four locked drifts closed via mechanical mirroring of POS PATCH as canonical. Drift #9 closed by adding `employee_id` to admin's `current` SELECT (so the from-value is available) AND to the `buildChangeDetails` field list. Drift #10 closed by adding the unconditional `jobs.update({ assigned_staff_id }).eq('appointment_id', id)` cascade block after the appointment UPDATE — mirrors POS at :377-383 byte-for-byte. Drift #11 closed by `data.employee_id === '' ? null : data.employee_id` normalization at the update-payload construction AND in the cascade thread (defense layer for non-page direct callers; page-level `handleSave` already pre-normalizes). Drift #15 closed by swapping raw `fetch()` → `adminFetch()` at `handleSave` + `handleCancelConfirm` in the admin appointments page. Memory #11 verification at execution time: audit-cited line numbers shifted post-Sessions 1.1 + 1.5 (POS cascade now at :377-383 not :323-329; POS normalization at :358 not :304; POS field list at :444-452 not :386; admin page sites unchanged at :253 + :278). Memory #29 surfaced finding (NOT fixed this session): admin PATCH lacks permission gating on `employee_id`-only changes — admin's `isReschedule` predicate excludes `employee_id`, while POS's includes it. Fifth drift in the same family; deferred per locked 4-drift scope; flagged as potential follow-on micro-session. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings, unchanged) / build clean / 183 test files / 3012 tests passing (was 3008; +4 new drift-fix cases). Mock infrastructure extended: `state.jobUpdates` array now captures `jobs.update().eq()` calls; `state.appointment` shape gains `employee_id`; jobs mock branch now exposes both `select().eq().maybeSingle()` (existing cascade-check path) AND `update().eq()` (new cascade-write path).

---

### Session 1.2.1 — Admin PATCH `employee_id` permission symmetry

**Status:** `[x]` **Complete — merged to main at `90a3f4e9` on 2026-06-06 14:08 PDT**
**Source:** Session 1.2's Memory #29 surfaced finding (deferred per that session's locked 4-drift scope)
**Estimated scope:** ~3-5 prod lines / 1 file / +1-2 tests
**Actual scope:** ~1 prod-logic line + 12 doc-comment lines / 1 prod file (`route.ts`) / +2 test cases / +1 CHANGELOG entry / +1 doc status flip
**Memory #8 budget:** Tiny (honored)

**Issue:** Admin PATCH's `isReschedule` predicate at `src/app/api/appointments/[id]/route.ts:38-40` excluded `data.employee_id`, so an admin user without `appointments.reschedule` permission could still reassign a detailer via this endpoint. POS PATCH's predicate at `/api/pos/appointments/[id]/route.ts:160-164` correctly included it; the POS in-source comment *"mirrors admin route's grouping; employee_id is gated under reschedule"* was aspirational — admin diverged in practice.

**Solution:** +1 line on the predicate (`|| data.employee_id !== undefined`). Mirrors POS exactly. No new gate, no new permission key — `appointments.reschedule` is the same key POS uses on the same axis.

**Pre-tasks:**
- `[x]` Verify Session 1.2 merged (`412a404b`, 2026-06-06 13:48 PDT) — predicate location stable

**Primary files:**
- `src/app/api/appointments/[id]/route.ts` (extend `isReschedule` predicate)
- `src/app/api/appointments/[id]/__tests__/patch.test.ts` (+2 cases — denied 403 + granted regression guard)

**Evidence citations:**
- Session 1.2 CHANGELOG entry (Memory #29 surfaced finding paragraph): *"admin PATCH allows employee_id-only changes WITHOUT permission gating — admin's isReschedule predicate excludes data.employee_id, while POS's includes it. A fifth drift in the same family"*
- Admin route.ts:38-40 — `isReschedule` predicate
- POS route.ts:160-164 — POS `isReschedule` predicate (includes `employee_id`)

**Related sessions:**
- Surfaced from: Session 1.2 (`412a404b`)
- Unblocks: Session 1.3 (`a7a57949`) — permission-axis symmetry now actually true across all three gates (reschedule, update_status, add_notes), so the parity contract test can assert per-field-group permission parity without conditional logic for the `employee_id` quirk

**Linked prompt:** session-1-2-1.md

**Completion:** Merged at `90a3f4e9` on 2026-06-06 14:08 PDT. Drift #5 (the 5th in the admin/POS PATCH symmetry family) closed. Predicate now includes `data.employee_id !== undefined` — admin user without `appointments.reschedule` permission can no longer reassign a detailer via PATCH. Tests: Drift #5 denied (403 + zero updates/cascade/audit when `rescheduleDenied=true`) + Drift #5 granted regression guard (200 + all side effects when `rescheduleDenied=false`; closes the over-broad-gate door). Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings, unchanged) / build clean / pre-merge 3014 tests passing; post-merge 185 test files / 3027 tests passing (includes Session 1.3's +13 cases). **Parallel-merge handling:** Session 1.2.1 ran alongside Session 1.3 in a separate worktree; merge order to main was Session 1.3 first, Session 1.2.1 second. The published merge commit `90a3f4e9` for this branch (its `Merge:` line resolves to `a7a57949 689cf3ce` — Session 1.3 merge + Session 1.2.1 docs branch tip) ALSO bundles Session 1.3's lifecycle-architecture-doc status flip in the same diff because of an accidental MERGE_MSG carry-over (the commit message reads as Session 1.3's doc closeout). The CHANGELOG entries are correctly distinct and chronologically ordered (1.3 first, 1.2.1 second on top). Memory note for future readers: `90a3f4e9` serves as both Session 1.3's doc-closeout commit AND Session 1.2.1's merge — non-cleanly labeled but content-correct.

**Drift #5 is the LAST known permission-axis asymmetry between admin and POS PATCH on the appointment-edit surface.** The `appointments.update_status` and `appointments.add_notes` gates are now symmetric across both endpoints (same key, same field set, same scope).

---

### Session 1.3 — Cross-cutting parity contract + status permission gate

**Status:** `[x]` **Complete — merged to main at `a7a57949` on 2026-06-06 14:05 PDT**
**Source:** Parity audit b346d34b Session C
**Estimated scope:** ~15-25 prod lines + ~30-40 test lines / 4-5 files / +6-8 tests
**Actual scope:** ~25 prod lines + ~370 test lines / 4 prod files / 2 new test files / +13 test cases
**Memory #8 budget:** Comfortable (honored)

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
- `[x]` Sessions 1.1 (`1658914a`), 1.2 (`412a404b`), 1.5 (`04921ad1`) merged
- `[x]` Operator decision Q5 — explicit `canUpdateStatus` prop pattern (matches the existing `canReschedule` / `canCancel` / `canAddNotes` trio shape)

**Primary files (actuals):**
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — MOD. `+canUpdateStatus?: boolean` prop (default `true`); conditional render: editable `<Select>` when true, read-only `<dd>` block when false.
- `src/app/admin/appointments/page.tsx` — MOD. `usePermission('appointments.update_status')`; threaded into BOTH dialog mounts (detailer-degraded + canonical full-perms).
- `src/app/pos/jobs/components/job-queue.tsx` — MOD. `usePosPermission('appointments.update_status')`; threaded into the Schedule-scope dialog mount.
- `src/app/admin/page.tsx` — MOD. `canUpdateStatus={false}` for defense-in-depth on the dashboard quick-peek mount (readOnly={true} already dominates).
- `src/app/__tests__/admin-pos-dialog-parity.test.tsx` — NEW. 7 cases: parity equivalence (modulo documented divergences), `canUpdateStatus` regression net, `hostContext` POS-only, `returnToPath` POS-only, no-readOnly canonical regression, no-op-handler-shape regression, source readability sanity. Source-parsing test mirroring `sale-vs-quotes-shared-prop-parity.test.tsx`; string-literal-aware extractor handles `returnToPath="/pos/jobs"` correctly.
- `src/app/admin/appointments/components/__tests__/appointment-detail-dialog-can-update-status.test.tsx` — NEW. 6 cases: defaults, explicit true, explicit false, save-button-still-visible-when-false, orthogonal composition with readOnly={true}, readOnly dominates.

**Evidence citations:**
- Parity audit b346d34b Target B.12 (status permission gate absent)
- Parity audit Concern 1 (parity contract test pattern)
- Precedent test mirrored: `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`

**Related sessions:**
- Depends on: Sessions 1.1, 1.2 (prop shape and endpoint symmetry stable) — 1.1 satisfied at `1658914a`, 1.2 satisfied at `412a404b`

**Linked prompt:** Session 1.3 prompt (operator-supplied in 2026-06-06 PDT session)

**Completion:** Merged to main at `a7a57949` on 2026-06-06 14:05 PDT. Both layers of the audit findings closed: (1) `canUpdateStatus` prop wired in both hosts, dialog renders the field as read-only when permission is denied (no 403-on-Save action surface); (2) source-parsing parity contract test at `src/app/__tests__/admin-pos-dialog-parity.test.tsx` mirrors the canonical Smart Details precedent and pins future drift. Sanity-checked: removing `canUpdateStatus` from the POS host triggers the expected 2 test failures (parity equivalence + explicit regression). Memory #2 honored — mirrored the precedent's source-parsing approach rather than inventing a render-introspection variant. Memory #11 honored — verified each line number / function signature against current main before editing. Memory #8 honored — 4 prod files, 2 test files, within budget. Verification: tsc 0 errors / lint 0 errors (97 baseline warnings unchanged) / build clean / 185 test files / 3025 tests passing (was 183 / 3012 — +2 test files, +13 tests).

---

### Session 1.4 — Open SAFE state machine transitions

**Status:** `[x]` **Complete — merged to main at `44c8ea05` on 2026-06-06 11:03 PDT**
**Source:** State machine audit b0efd95f + consequence map d3671c82 Target E.1
**Estimated scope:** ~10 prod lines / 2 files / +2-3 tests
**Actual scope:** ~12 prod lines / 2 prod files (`status-transitions.ts` + PATCH test) / +2 test cases / +1 CHANGELOG entry / +1 doc status flip
**Memory #8 budget:** Tiny (honored)

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
- Unblocks: Session 1.5 (state machine loosening pattern established + in-source comment style at `STATUS_TRANSITIONS` documents AC-5 citations for future readers)

**Linked prompt:** session-1-4.md

**Completion:** Merged at `44c8ea05` on 2026-06-06 11:03 PDT. Both SAFE transitions opened in the map; +2 PATCH test cases pin the new behavior; existing `completed → pending` terminal regression test preserved as the over-loosening sanity check. Memory #11 note: the brief identified line 261-264 of `patch.test.ts` as asserting `in_progress → no_show` blocked, but on inspection that test asserts `completed → pending` blocked — the `in_progress → no_show`-blocked assertion was not in the file pre-session; surfaced and resolved by adding +2 NEW positive-case tests rather than flipping a non-existent one. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings) / build clean / 179 test files / 2973 tests passing (was 2971). Admin PATCH symmetry deliberately NOT touched — that's Session 1.5's territory per the locked plan.

---

### Session 1.5 — Wire un-materialize cascade into PATCH for backward reverts

**Status:** `[x]` **Complete — merged to main at `04921ad1` on 2026-06-06 12:47 PDT**
**Source:** State machine audit b0efd95f Q1 + consequence map d3671c82 Target E.3
**Estimated scope:** ~20-30 prod lines / 2 files / +4-6 tests
**Actual scope:** ~115 prod lines (status-transitions 14 + POS PATCH ~50 + admin PATCH ~50) / 3 prod files / +16 test cases (7 added to existing POS test file + 9 in new admin test file)
**Memory #8 budget:** Comfortable (honored)

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
- `[x]` Phase 0.1 audit complete (`69b15b0f`, 2026-06-05) — surfaced the BLOCKED verdict
- `[x]` Webhook receivers identity audit complete (`f5e714a8`, 2026-06-05) — **UNBLOCKED** per [AC-5](#ac-5-state-machine-loosening-2-safe-2-with-cascade) pre-task resolution. No n8n receiver exists; `fireWebhook` is silently no-op; duplicate-customer-SMS via webhook chain cannot occur. Session 1.5 may proceed without source-side idempotency work for the webhook concern specifically.
- `[x]` Verify Session 1.4 merged (state machine loosening pattern in place) — merged at `44c8ea05` on 2026-06-06 11:03 PDT

**Primary files:**
- `src/lib/appointments/status-transitions.ts` (open the 2 transitions)
- `src/app/api/pos/appointments/[id]/route.ts:236-251` (wire cascade)
- `src/app/api/appointments/[id]/route.ts` (mirror for symmetry)

**Evidence citations:**
- Consequence map d3671c82 Target E.3: *"Open with server-side compensating logic"*
- `lifecycle-sync.ts:59-72` — `jobStatusForAppointmentStatus` returns `delete_job` (already coded)
- State machine audit b0efd95f Q1: un-materialize cascade into PATCH (recommended)

**Related sessions:**
- Depends on: Session 1.4 (state machine loosening pattern) — satisfied at `44c8ea05`
- ~~Depends on: Phase 0.1 audit (n8n idempotency check)~~ — **resolved** by webhook receivers identity audit (`f5e714a8`); no receiver exists, idempotency is vacuous

**Linked prompt:** Session 1.5 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** Merged to main at `04921ad1` on 2026-06-06 12:47 PDT. Implementation followed the locked scope: STATUS_TRANSITIONS map opens `confirmed → pending` + `in_progress → pending`; POS PATCH wires `executeUnMaterialize` via the `pos/appointments/[id]/route.ts` STATUS_TRANSITIONS block; admin PATCH gains both the STATUS_TRANSITIONS guard (was permissive pre-1.5) AND the cascade wiring (admin/POS symmetry per AC-5). Cascade is INVOKED (Memory #2), not reimplemented — the ordering invariant in `executeUnMaterialize` is the seam. The two endpoints' cascade-call sites are byte-symmetric apart from actor + source labeling (`'pos'` vs `'admin'`). Cascade error propagation (422 / 409 / 404) bubbles up to the PATCH caller with the structured payload the dedicated `/unmaterialize` endpoint already emits. `confirmString` is NOT extended into PATCH — callers needing the confirm-required path use the dedicated `/unmaterialize` endpoint. Verification: tsc 0 errors / lint 0 errors (97 baseline warnings) / build clean / 181 test files / 2994 tests passing (was 180 / 2978 — +1 file, +16 tests).

---

### Session 1.6 — Retire POS > Appointments tab

**Status:** `[x]` **Complete — merged to main at `cfa9cfa4` on 2026-06-06 14:21 PDT**
**Source:** Item 15e Phase 3 (never shipped) + conceptual audit 26521e5a Target G.4
**Estimated scope:** ~10-20 prod lines (mostly removal) / 2-3 files / minimal test changes
**Memory #8 budget:** Comfortable — actual: 20 prod lines added (middleware redirect block) + 7 lines removed (bottom-nav entry + CalendarDays import), plus 404 lines of deletions (page.tsx + appointments-view.tsx + its test)

**Issue:** POS bottom nav still renders both `Jobs` and `Appointments` tabs at `src/app/pos/components/bottom-nav.tsx:195-206`. The Appointments tab is a third near-duplicate surface alongside Today + Schedule scopes within POS > Jobs. Item 15e Phase 3 (retire and absorb POS Appointments tab) was scoped but never shipped.

**Solution (as implemented):**
1. Removed the Appointments tab nav entry from `pos/components/bottom-nav.tsx` (lines 201-206 — the `label: 'Appointments'` array entry) + the now-unused `CalendarDays` lucide-react import
2. Added permanent 308 redirect for `/pos/appointments` (and `/pos/appointments/*` sub-paths) → `/pos/jobs?scope=schedule` in `src/middleware.ts` (placed before host-routing so it short-circuits regardless of host). 308 not 302 because the relocation is permanent and browser-cacheable.
3. **Option a (page deletion):** Deleted `src/app/pos/appointments/page.tsx` + its empty parent dir; deleted `src/app/pos/components/appointments/appointments-view.tsx` + its test + emptied `__tests__` dir. Verified `AppointmentsView` had no other consumers.
4. **Sibling dialogs KEPT** — `cancel-appointment-dialog.tsx`, `reschedule-appointment-dialog.tsx`, `types.ts` are imported by `pos/jobs/components/{job-queue,change-time-button,job-detail}.tsx` and stay.

**Why:**
- Eliminates the third overlap surface per [AC-4](#ac-4-pos--jobs-as-unified-surface-pos--appointments-tab-retires)
- Closes Item 15e Phase 3 work
- Reduces operator surface confusion (operator's stated concern: too many surfaces overlap)

**Pre-tasks:**
- `[x]` Verify Sessions 1.1-1.3 merged (dialog stability) — 1.1 at `1658914a`, 1.2 at `412a404b`, 1.2.1 at `7d4d815a`, 1.3 at `a7a57949` — all confirmed at session start
- `[x]` Grep verify: any code outside `/pos/appointments` references it directly? — `grep -rln "/pos/appointments" src/ --include="*.tsx" --include="*.ts"` returned 53 matches; after filtering `/api/pos/appointments/*` (out of scope — API surface, not page surface), only **2 page-route references remained**, both in `bottom-nav.tsx`. Both removed.

**Primary files (actuals):**
- `src/app/pos/components/bottom-nav.tsx` — MOD. −7 prod lines (tab entry + CalendarDays import)
- `src/middleware.ts` — MOD. +13 prod lines (redirect block + comment block citing AC-4 + audit hash)
- `src/app/pos/appointments/page.tsx` — DELETED (12-line Suspense wrapper around `<AppointmentsView />`)
- `src/app/pos/appointments/` — empty dir REMOVED
- `src/app/pos/components/appointments/appointments-view.tsx` — DELETED (392 lines; only consumer was the deleted page)
- `src/app/pos/components/appointments/__tests__/appointments-view.test.tsx` — DELETED (129 lines / 4 tests; tied to deleted view)
- `src/app/pos/components/appointments/__tests__/` — empty dir REMOVED

**Tests added:**
- `src/__tests__/middleware.test.ts` — NEW (78 lines, 4 cases): exact `/pos/appointments` → 308 with `?scope=schedule` + `updateSession` never called (proves redirect short-circuits before auth); sub-paths `/pos/appointments/123` → same target; false-prefix `/pos/appointmentsfoo` does NOT redirect; adjacent POS routes (`/pos/jobs`, `/pos/jobs?scope=schedule`, `/pos/transactions`, `/pos`) do NOT redirect. Uses `vi.hoisted` for the `updateSession` mock to avoid factory-hoisting reference errors.
- `src/app/pos/components/__tests__/bottom-nav.test.tsx` — NEW (71 lines, 3 cases): regression-locks the absence of the Appointments label + the `/pos/appointments` href + asserts the four canonical tabs (Transactions, Quotes, Sale, Jobs) still render. Stubs `window.matchMedia` for the BottomNav's PWA-standalone + fullscreen capability detection effect (jsdom doesn't implement it).

**Evidence citations:**
- Conceptual audit 26521e5a Target C.5: *"POS bottom nav still renders both Jobs and Appointments tabs"*
- Item 15e Phase 3 scope (referenced in conceptual audit but never shipped)
- Bottom-nav source location at session start: `src/app/pos/components/bottom-nav.tsx:201-206` (the brief cited :195-206 — the array entry was actually at :201-206 with the array start at :176; non-material drift per Memory #11)

**Out of scope (explicit):**
- Did NOT refactor `pos/components/appointments/` directory naming (still hosts the dialogs used by Jobs; rename is cosmetic and risks import churn across `job-queue.tsx`, `change-time-button.tsx`, `job-detail.tsx` — out of scope per brief)
- Did NOT touch Admin > Appointments (stays per locked architecture)
- Did NOT modify `pos/jobs/` to compensate for the removed tab (Schedule scope already absorbs the functionality)
- Did NOT touch the `/api/pos/appointments/*` API routes (those serve cancel/reschedule/load flows still used by POS > Jobs and admin)
- Sub-path `/pos/appointments/123` (legacy deep links) — redirect drops the ID and routes to bare `?scope=schedule`. No per-appointment surface on Schedule today; users can search/filter on Jobs. Deemed acceptable per brief's silence on per-ID preservation.

**Related sessions:**
- Depends on: Sessions 1.1-1.3 (dialog work stable; Schedule scope is the absorbing surface) — all merged before this session
- Unblocks: Phase 2 sessions on unified Jobs surface

**Linked prompt:** Session 1.6 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** Merged to main at `cfa9cfa4` on 2026-06-06 14:21 PDT. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings — unchanged in modified files) / build clean (middleware bundle 82 kB) / 186 test files / 3030 tests passing (net +3 vs pre-1.6 — +4 middleware + 3 bottom-nav − 4 deleted appointments-view).

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

### Session 1.8 — Waitlist notification silent-drop fix

**Status:** `[x]` **Complete — merged to main at `3c118b2d` on 2026-06-06 11:11 PDT**
**Source:** Webhook receivers identity audit (`f5e714a8`, post-Phase-0) — Target D.4 surfaced finding
**Estimated scope:** ~10-20 prod lines / 2 files / +3-5 tests
**Memory #8 budget:** Tiny

**Issue:** `src/app/api/appointments/[id]/cancel/route.ts:147-158` is the ONLY location in the codebase where `fireWebhook` is the SOLE dispatch channel for a customer-facing notification (no parallel `sendSms`). The in-source comment at `:147` literally says *"Webhook for n8n to handle actual SMS sending"*. The webhook fires `fireWebhook('appointment_cancelled', { …, waitlist_notified: […] })` — **piggybacked on the `appointment_cancelled` event with a `waitlist_notified` array payload**. With no n8n receiver wired (per audit `f5e714a8`), waitlisted customers are marked `notified` in the DB (`waitlist_entries.status='notified'`, `notified_at=now()` at `:140-145`) but **receive no SMS**. Customer-facing silent-drop bug.

**Solution:** Replace the dead webhook with direct `sendSms` calls to each waitlisted customer:
1. After the `waitlist_entries` UPDATE at `:140-145`, iterate the `waitlistMatches` array and dispatch SMS per customer
2. Use a new or existing `waitlist_slot_available` SMS template (verify `src/lib/sms/generated-contracts.ts` for an existing template; add via the canonical migration + `scripts/regen-sms-contracts.ts` workflow per CLAUDE.md Rule 9 if not present)
3. Mirror the direct-dispatch pattern from `POST /api/pos/jobs/[id]/complete` `sendCompletionNotifications` (`:243-262`) — `renderSmsTemplate(slug, vars, fallback)` + `sendSms(phone, body, { logToConversation: true, customerId, notificationType: 'waitlist_slot_available', contextId: appointment.id })`
4. Keep the existing `fireWebhook('appointment_cancelled', { waitlist_notified: … })` call as-is (it costs nothing in current state and remains correct semantics if a receiver is ever wired) OR delete it as cleanup — operator decision

**Why:**
- Closes a customer-facing silent-drop bug. Waitlist functionality currently appears to work from the operator perspective (`waitlist_entries.status='notified'`) but customers never receive the SMS.
- The fix is small, mirrors an existing pattern, and is independent of Sessions 1.1–1.6 or 1.7.

**Pre-tasks:**
- `[x]` Webhook receivers identity audit complete (`f5e714a8`, 2026-06-05) — surfaces the gap
- `[x]` Verified `waitlist_slot_available` SMS template did NOT exist; added via migration `20260606105901_seed_waitlist_slot_available_sms_template.sql` + `sms-contracts.source.ts` edit + codegen, per CLAUDE.md Rule 9

**Primary files (actuals):**
- `src/app/api/appointments/[id]/cancel/route.ts` — MOD. +2 imports (`sendSms`, `renderSmsTemplate`), ~+50 lines for the dispatch loop + the embed-shape type + comments; pre-1.8 `fireWebhook` call retained alongside as forward-compat side-channel
- `src/lib/sms/sms-contracts.source.ts` — MOD. +4 lines (new `waitlist_slot_available` slug entry)
- `src/lib/sms/generated-contracts.ts` + `src/lib/sms/palette.ts` — codegen output (auto-regenerated by `npx tsx scripts/regen-sms-contracts.ts`)
- `supabase/migrations/20260606105901_seed_waitlist_slot_available_sms_template.sql` — NEW. Idempotent `INSERT ... ON CONFLICT (slug) DO NOTHING`
- `src/app/api/appointments/[id]/__tests__/cancel.test.ts` — NEW. 5 cases (per-customer SMS dispatch, empty-waitlist no-op, no-phone silent skip, forward-compat webhook fires alongside SMS, inactive-template skips SMS)

**Evidence citations:**
- Webhook receivers identity audit `f5e714a8`: Target D.4 — *"only case where the webhook fire is the SOLE dispatch channel for a customer-facing message"*
- `src/app/api/appointments/[id]/cancel/route.ts:147-158` — the dead-webhook block (pre-fix)
- `src/app/api/pos/jobs/[id]/complete/route.ts:243-262` — the direct-dispatch pattern mirrored

**Out of scope:**
- Did NOT modify `fireWebhook` itself or the n8n receiver question (that's a separate architectural decision per [AC-5](#ac-5-state-machine-loosening-2-safe-2-with-cascade) forward caveat)
- Did NOT change waitlist eligibility logic or the matching query at `route.ts:131-140` (pre-fix line range)

**Surfaced finding (NOT FIXED in 1.8 per Memory #29 targeted-fix scope):** Grep audit during this session found a second `fireWebhook` sole-dispatch site at `src/app/api/waitlist/[id]/route.ts:80` (admin PATCH waitlist entry → `notified`). The audit's claim of "ONLY" was almost correct; this is a sibling operator-initiated path with the same shape. The cancel-triggered path fixed here is the higher-volume case; the admin PATCH path is lower-volume and should be folded into a follow-up session (1.8.1) or wider audit.

**Related sessions:**
- Independent — can ship anytime
- Forward-compatible with any future n8n receiver wiring (the `fireWebhook` call is retained alongside `sendSms`)

**Linked prompt:** Session 1.8 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** 2026-06-06 PST — merge hash filled in post-merge below this entry

---

### Session 1.8.1 — Admin waitlist PATCH silent-drop fix

**Status:** `[x]` **Complete — merged to main at `c2294d6b` on 2026-06-06 12:40 PDT**
**Source:** Session 1.8 (`3c118b2d`) — surfaced finding ("NOT FIXED in 1.8 per Memory #29 targeted-fix scope") promoted to its own Phase 1 session per the Document Maintenance Rule "new session identified"
**Estimated scope:** ~10-15 prod lines / 2 files / +3-4 tests
**Memory #8 budget:** Tiny

**Issue:** `src/app/api/waitlist/[id]/route.ts:80` — the admin waitlist PATCH endpoint fires `fireWebhook('appointment_cancelled', { event: 'waitlist_notified', ... })` as the SOLE dispatch channel for the customer notification when an operator manually transitions a waitlist entry to `status='notified'` via the admin UI. With no n8n receiver wired in production (per webhook receivers identity audit `f5e714a8`), the row is marked `notified` + `notified_at=now()` in `waitlist_entries` but **the customer never receives an SMS**. Same customer-facing silent-drop bug class as Session 1.8; lower volume (operator-initiated vs. cancel-triggered) but identical failure mode.

**Solution:** Mirror Session 1.8's direct-dispatch pattern at `src/app/api/appointments/[id]/cancel/route.ts:174-194`:
1. Read customer phone + first/last name from the existing `customer:customers!customer_id(...)` embed (already in the PATCH route's select at `:37`)
2. Read the waitlist entry's `preferred_date` as the slot date (admin PATCH has no freed-appointment date; `preferred_date` is the natural value and is what the existing webhook payload already sends)
3. Skip SMS gracefully if phone OR `preferred_date` is missing (row still flips to `notified`; admin can follow up directly). Phone-null is the canonical Session 1.8 skip; date-null is added because `appointment_date` is required by the template contract.
4. Otherwise format the date with `toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })` (identical to Session 1.8 line 145-147), render via `renderSmsTemplate('waitlist_slot_available', vars, fallback)`, and dispatch via `sendSms(phone, body, { logToConversation: true, customerId, notificationType: 'waitlist_slot_available', contextId: id })`
5. Retain the pre-1.8.1 `fireWebhook` call alongside as forward-compat side-channel (per Session 1.8's same precedent)

**Why:**
- Closes the sibling sole-dispatch site Session 1.8 surfaced but deferred per Memory #29 targeted-fix scope. The customer-facing silent-drop bug class is now closed across both surfaces (cancel-triggered + admin-initiated).
- Reuses the `waitlist_slot_available` template introduced by Session 1.8 unchanged — per Memory #2, same SMS content, no need for a separate template. No migration, no `sms-contracts.source.ts` edit, no codegen this session.

**Pre-tasks:**
- `[x]` Session 1.8 merged to main (`3c118b2d`) — establishes the direct-dispatch pattern, the SMS template, and the codegen state this session reuses
- `[x]` Verified `waitlist_slot_available` slug present in `src/lib/sms/sms-contracts.source.ts:281-284` and codegen output current

**Primary files (actuals):**
- `src/app/api/waitlist/[id]/route.ts` — MOD. +2 imports (`sendSms`, `renderSmsTemplate`), +~30 lines for the dispatch block + comments; pre-1.8.1 `fireWebhook` call retained
- `src/app/api/waitlist/[id]/__tests__/route.test.ts` — NEW. 6 cases: SMS dispatch on notify, no-phone silent skip, no-`preferred_date` silent skip, forward-compat webhook fires alongside SMS, inactive-template skips SMS, non-notified transitions cause no notify side effects

**Evidence citations:**
- Session 1.8 `CHANGELOG.md` entry — explicit surface finding ("admin PATCH waitlist entry → notified has the SAME shape")
- `src/app/api/appointments/[id]/cancel/route.ts:174-194` — the direct-dispatch pattern mirrored
- `src/lib/sms/sms-contracts.source.ts:281-284` — `waitlist_slot_available` slug contract (required: `service_name`, `appointment_date`; optional: `first_name`, `last_name`, `business_name`, `business_phone`)

**Out of scope:**
- Did NOT modify the `waitlist_slot_available` template (reused unchanged from Session 1.8 — Memory #2)
- Did NOT touch the cancel-route fix from Session 1.8
- Did NOT modify `fireWebhook` itself or the n8n receiver question
- Did NOT change the PATCH endpoint's status-transition validation or any other code path

**Memory #29 audit (THIRD sole-dispatch site search):** Searched for any additional `fireWebhook` sole-dispatch site during this session. Grep across `src/app/api` for `fireWebhook(` paired with no parallel `sendSms` in the same handler — **none found beyond the two now addressed**. The customer-facing silent-drop bug class is closed across both surfaces with this session. No Session 1.8.2 surfaced.

**Related sessions:**
- Independent — could ship anytime; ran in parallel with Sessions 1.1 and 1.5 (different file scope; no conflicts)
- Forward-compatible with any future n8n receiver wiring (the `fireWebhook` call is retained alongside `sendSms`)

**Linked prompt:** Session 1.8.1 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** 2026-06-06 12:40 PDT — merged at `c2294d6b`. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings unchanged) / build clean / 181 test files / 2984 tests passing (was 2978; +6 new).

---

## Phase 2 — Lifecycle Architecture

**Pre-task:** Phase 0.3 audit complete (`98a5f30d`, 2026-06-05) — **CLEAN** migration verdict; only POS Jobs Today scope itself depends on populate.

**Themes (high-level):**
- Start Intake as materialization trigger (per [AC-3](#ac-3-start-intake-as-materialization-trigger))
- Forward-arrow disposition (per [AC-8](#ac-8-forward-arrow-in-today-scope-routes-to-schedule-when-crossing-today))
- Terminal-state filter affordances (per [AC-7](#ac-7-terminal-states-viewable-via-filter-hidden-by-default))
- Populate redesign or removal (gated by Phase 0.3 findings — CLEAN verdict)
- Unified Jobs surface refinement (post-tab-retirement)

**Approximate session count:** 4-6 sessions, ~200-400 prod lines total.

---

### Session 2.1 — Start Intake server-side materialization endpoint

**Status:** `[x]` **Complete — merged to main at `a5d2a0d6` on 2026-06-06 PDT**
**Source:** [AC-3](#ac-3-start-intake-as-materialization-trigger) (the biggest architectural shift in Phase 2)
**Estimated scope:** ~80-120 prod lines / 3-4 files / +8-12 tests
**Actual scope:** ~280 prod lines (helper 210 + endpoint 70) / 3 files (helper extended, endpoint new, test new) / +19 tests
**Memory #8 budget:** Comfortable upper end (helper-extraction Option a + 19 tests pushed total above the estimate's nominal upper bound; honored intent — single seam, fully tested)

**Issue:** AC-3 commits to operator-pressing-Start-Intake as the canonical materialization event, replacing the current implicit `populate`-on-Today-scope-mount behavior. The reverse direction (`executeUnMaterialize`) was implemented in Phase 2C; the forward direction (`materializeJobFromAppointment`) was the missing seam.

**Solution (as implemented):**
1. **New helper `materializeJobFromAppointment` in `src/lib/appointments/lifecycle-sync.ts`** — forward-direction counterpart to `executeUnMaterialize`. Gates: 404 not_found / 422 future_date / 422 invalid_status. INSERT job @ status='intake' + work_started_at=NOW FIRST, then UPDATE appointment→in_progress. Idempotent via fast-path SELECT + `upsert(ignoreDuplicates: true)` + race-recovery SELECT. Mirrors populate's column reads + walk-in's job INSERT shape (Memory #2).
2. **New endpoint `POST /api/pos/jobs/start-intake`** — thin orchestration over the helper. Auth (`authenticatePosRequest`) → permission (`appointments.update_status`) → validate `appointment_id` body field → delegate to helper → shape response (201 first-time / 200 idempotent / 422 with `appointment_date` or `appointment_status` field / 4xx/5xx).
3. **Walk-in atomic create unchanged** — `pos/jobs/route.ts:147-536` keeps inline implementation. The appointment+job atomic shape is structurally distinct from the appointment-already-exists shape; refactoring walk-in to share the helper is out of scope this session. Both paths converge at the `jobs.appointment_id` UNIQUE constraint.

**Why:**
- Foundation for Session 2.2 (client-side Start Intake button wiring + Today scope appointment visibility)
- Establishes the forward seam in `lifecycle-sync.ts` (symmetry with `executeUnMaterialize`)
- Unblocks Session 2.5 (populate retirement) — populate's behavior is now also available via the explicit materialization primitive

**Pre-tasks:**
- `[x]` Phase 0.3 audit complete (`98a5f30d`, 2026-06-05) — CLEAN migration verdict
- `[x]` Sessions 1.4 + 1.5 merged (state machine + cascade pattern in place) — `44c8ea05` + `04921ad1`
- `[x]` Session 1.6 merged (POS > Appointments tab retired) — `cfa9cfa4`

**Primary files:**
- `src/lib/appointments/lifecycle-sync.ts` (MOD — appended `materializeJobFromAppointment` helper + types)
- `src/app/api/pos/jobs/start-intake/route.ts` (NEW — endpoint)
- `src/app/api/pos/jobs/start-intake/__tests__/route.test.ts` (NEW — 19 tests)

**Evidence citations:**
- AC-3: *"Operator pressing 'Start Intake' on a confirmed (or in_progress) appointment is the canonical materialization event."*
- Lifecycle audit `2293fb3d` Target B.2: *"the only call site in the repo is the init effect on Today scope mount and the Refresh button"* — establishes populate's current implicit role
- Populate dependencies audit `98a5f30d`: CLEAN migration scope verdict
- `pos/jobs/route.ts:470-490` walk-in job INSERT — Memory #2 reuse pattern
- `populate/route.ts:42-47` future-date gate / `:65` status filter / `:169-171` upsert idempotency — Memory #2 reuse patterns

**Related sessions:**
- Depends on: Phase 0.3 audit (`98a5f30d`); Sessions 1.4/1.5 (state machine groundwork); Session 1.6 (tab retirement)
- Unblocks: Session 2.2 (client-side wiring + appointment visibility in Today scope)
- Unblocks: Session 2.5 (populate retirement)

**Linked prompt:** Session 2.1 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** Merged to main at `a5d2a0d6` on 2026-06-06 PDT. Implementation followed the locked scope with Option a chosen (helper extraction) — `materializeJobFromAppointment` lives in `lifecycle-sync.ts` alongside `executeUnMaterialize` as the forward/reverse seam pair. Helper signature: `(supabase, appointmentId, { trigger, actor, source, ipAddress })` returning `{ ok, httpStatus, error?, jobId?, appointmentId?, alreadyMaterialized?, appointmentDate?, appointmentStatus? }`. Gates byte-symmetric with `executeUnMaterialize`'s guard shape; ordering REVERSED (INSERT job first, then UPDATE appointment — the populate re-materialization invariant doesn't apply to the forward direction). Idempotency layered: fast-path SELECT returns 200 with `alreadyMaterialized: true`; upsert + recovery SELECT covers the TOCTOU race; the UNIQUE constraint on `jobs.appointment_id` is the load-bearing DB-layer safety net regardless. Endpoint permission `appointments.update_status` reuses the same key state-machine transitions use in PATCH. Memory #11 verified at execution time: `populate.ts:42-47, :65, :169-171` + `pos/jobs/route.ts:470-490` + `lifecycle-sync.ts:208-368` + `:59-72` all confirmed against current main. Memory #2 honored: services snapshot construction (incl. mobile-fee append) reuses populate's pattern verbatim; job column set mirrors walk-in's INSERT. No deviations from scope. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings — 0 new) / build clean (start-intake route registered at 1.24 kB) / 187 test files / 3049 tests passing (was 186 / 3030 — +1 file, +19 tests). No findings to surface — walk-in atomic create's behaviors all matched the Phase 0 audit's descriptions.

---

### Session 2.2 — Today scope absorbs un-started appointments + Start Intake client wiring

**Status:** `[x]` **Complete — merged to main at `f25bb87d` on 2026-06-06 PDT**
**Source:** [AC-3](#ac-3-start-intake-as-materialization-trigger) second half (operator-facing UI for the Session 2.1 server primitive); Phase 0.3 audit Shape α decision
**Estimated scope:** ~100-150 prod lines / 4-5 files / +10-15 tests
**Actual scope:** ~500 prod lines (route extension 117 + job-queue integration 72 + new component 275 + type 32) / 4 prod files / +25 tests across 3 new test files
**Memory #8 budget:** BUDGET PUSHED — actual ≈3.3× the estimated nominal upper bound. Overrun concentrated in the new component (render JSX + popup modal + 3 fetch paths + error branching). Surfacing transparently per Memory #8 discipline. No scope creep — every line traces to the locked AC-3 second-half scope; the Memory #2 reuse path (sibling type + shared formatters) prevented a larger overrun

**Issue:** AC-3 commits to operator-pressing-Start-Intake as the canonical materialization event. Session 2.1 delivered the server primitive (`POST /api/pos/jobs/start-intake`); Session 2.2 surfaces it in the operator UI. Without 2.2, the endpoint exists but no operator surface invokes it.

**Solution (as implemented):**
1. **Today endpoint extension** (`src/app/api/pos/jobs/route.ts`) — `GET` now returns a new `unstarted_appointments` field alongside the existing `data` array. Only fires when `targetDate === today_pst`; status filter mirrors populate at `populate/route.ts:65` exactly; dedup pattern mirrors populate at `populate/route.ts:76-90` and Schedule at `schedule/route.ts:131-141`; non-fatal error path defaults to `[]` rather than 500-ing the whole response.
2. **New type** `PosUnstartedAppointment` (`src/app/pos/jobs/components/schedule-types.ts`) — sibling of `PosScheduleEntry` with `scope: 'today_unstarted'` discriminator. Same field shape for Memory #2 reuse.
3. **New component** `UnstartedAppointmentCard` (`src/app/pos/jobs/components/unstarted-appointment-card.tsx`) — self-contained card with Start Intake button + future-date popup. Distinct visual treatment from job cards (dashed blue border, "Not Started" badge, no timer/photo/addon UI — none apply pre-materialization).
4. **Job-queue integration** — new state + extraction in `fetchJobs` + `pollJobs`; new "Not Started — Confirmed for today" strip rendered ABOVE both timeline + list views in Today scope; suppressed when empty or past-date.

Future-date popup is a defense-in-depth path: the Today endpoint already filters to today's date, but the popup wires the PATCH-date + retry affordance for race cases (date shift between fetch and click, PST midnight clock skew). Confirm → PATCH `scheduled_date: today_pst` → retry Start Intake.

**Coexistence with populate (until Session 2.5):** populate still runs on Today-scope mount, materializing today's confirmed appointments at `status='scheduled'` BEFORE the un-started query fires. So the un-started strip is practically empty in steady state. Session 2.5 retires populate; from then on, the strip becomes the canonical surface and operators rely on Start Intake to materialize.

**Why:**
- Closes AC-3 (both halves now landed)
- Foundation for Session 2.5 — populate can now be retired without losing operator visibility into un-started appointments
- Establishes the appointment-card-with-action pattern other Phase 2 sessions can reuse (Session 2.4 terminal-state filter affordances may extend the same primitive)

**Pre-tasks:**
- `[x]` Session 2.1 merged (server endpoint exists) — `a5d2a0d6`
- `[x]` Phase 0.3 audit complete — `98a5f30d` (Shape α: Today scope absorbs un-started appointments alongside materialized jobs)

**Primary files:**
- `src/app/api/pos/jobs/route.ts` (MOD — Today GET extension)
- `src/app/pos/jobs/components/schedule-types.ts` (MOD — new sibling type)
- `src/app/pos/jobs/components/unstarted-appointment-card.tsx` (NEW — card + popup)
- `src/app/pos/jobs/components/job-queue.tsx` (MOD — fetch + render integration)

**Test files:**
- `src/app/api/pos/jobs/__tests__/today-unstarted-appointments.test.ts` (NEW — 10 tests)
- `src/app/pos/jobs/components/__tests__/unstarted-appointment-card.test.tsx` (NEW — 11 tests)
- `src/app/pos/jobs/components/__tests__/job-queue-today-unstarted.test.tsx` (NEW — 4 tests)

**Evidence citations:**
- AC-3 (second half): *"Operator opens Today scope → sees confirmed appointments for today (un-started) + active jobs (started). Operator presses Start Intake on an un-started appointment → server materializes the job + sets job.status='intake' atomically."*
- Phase 0.3 audit `98a5f30d` Shape α decision: un-started appointments surface alongside materialized jobs in Today scope; no separate dual-pane UX needed
- `populate/route.ts:65, :76-90, :169-171` — status filter + dedup + upsert idempotency patterns mirrored
- `schedule/route.ts:131-141` — dedup pattern mirrored
- Session 2.1 endpoint contract — error code shapes `future_date` / `invalid_status` consumed correctly by the client

**Related sessions:**
- Depends on: Session 2.1 (`a5d2a0d6`); Phase 0.3 audit (`98a5f30d`)
- Unblocks: Session 2.5 (populate retirement is now safe — operator visibility preserved via the new strip)
- Parallel-safe with: Session 2.3 (forward-arrow) and Session 2.4 (terminal-state filters)

**Linked prompt:** Session 2.2 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** Merged to main at `f25bb87d` on 2026-06-06 PDT. Implementation followed the locked scope. Today endpoint extension preserves backward compatibility — existing `data` field unchanged; new `unstarted_appointments` field is silently ignored by older clients. The wide-SELECT mirrors `schedule/route.ts`'s shape (Memory #2). Memory #11 verified at execution time: `pos/jobs/route.ts:15-141` GET boundaries + `populate/route.ts:42-47, :65, :169-171` + `schedule/route.ts:131-141` + `job-queue.tsx` Today render branch (1059-1287) all confirmed against current main. The future-date popup is wired as a defense-in-depth path — the Today endpoint already filters to today's date, so the popup should never fire in steady state, but the PATCH-date + retry path hardens the surface against race cases. **Timeline-mode lane integration deferred** — the un-started strip renders ABOVE the timeline view (not as in-lane blocks). Reason: timeline expects `JobListItem[]` with timer/work_started_at semantics; injecting un-started appointments as pseudo-jobs would break invariants. The strip-above approach gives operators visibility on both list and timeline views without a type union refactor. Verification gates: tsc 0 errors / lint 0 errors (97 baseline warnings — 0 new) / build clean / 190 test files / 3074 tests passing (was 187 / 3049 — +3 files, +25 tests). **Memory #8 budget pushed** — actual ~500 prod lines vs estimated ≤150, concentrated in the new component (render JSX + popup + 3 fetch paths + error branching). Surfacing transparently. No scope creep — every line traces to the locked AC-3 second-half scope.

**AC-3 STATUS:** Both halves landed (Session 2.1 server + Session 2.2 client). AC-3 commitment is now fulfilled.

---

### Session 2.3 — Forward-arrow routes to Schedule on today-crossing

**Status:** `[x]` **Complete — merged to main at `269b94f7` on 2026-06-06 PDT**
**Source:** [AC-8](#ac-8-forward-arrow-in-today-scope-routes-to-schedule-when-crossing-today) (whole AC); Today vs Schedule conceptual audit `26521e5a` Targets G.1, E.1, A.4

**Issue:** Under Item 15e Phase 1A's populate-future-date guard, Today's forward-arrow into future dates was structurally inert — `fetchJobs(date)` returns an empty list and the "Upcoming — [date]" banner shows above an empty content area. Schedule scope is the canonical surface for future-dated appointments. The arrow's pre-15e single-date-navigator behavior survived three sessions of Item 15e refactoring (Phase 1B scope toggle, N+1 pills, N+2 filters) without being redesigned — the conceptual audit identified it as "vestigial UI that the Item 15e arc made structurally redundant for future dates without removing." Operator perception: forward arrow invites navigation, the empty list reads as a bug.

**Scope:**
- Update the forward-arrow handler in `src/app/pos/jobs/components/job-queue.tsx` so that when `addDays(selectedDate, 1) > today` AND the `pos_jobs_unified_schedule` flag is ON, the handler:
  1. Flips scope to `'schedule'` via `handleScopeChange('schedule')` (persists to localStorage)
  2. Pins the date intent as a single-day "Other" range via `setScheduleFilter({ selectedPills: ['other'], otherRange: { from: nextDate, to: nextDate } })`
  3. Pushes the URL `?sched_pills=other&sched_from=<nextDate>&sched_to=<nextDate>` (drops `?date=`) via `router.push` — push rather than replace so browser-back returns to Today scope
- Past-date forward navigation (yesterday → today, -3d → -2d) stays within Today scope via `setDate(nextDate)` — the legacy "scroll through past jobs" affordance is preserved
- Back arrow unchanged
- Flag-OFF gate via `scheduleScopeEnabled` — if the flag is rolled back, the handler falls through to legacy `setDate(nextDate)` so the URL doesn't change to a scope the UI can't render
- New test file `__tests__/job-queue-forward-arrow.test.tsx` (5 tests) locks: forward-from-today routes (push + URL shape + scope flip + no extra replace), forward-from-yesterday + forward-from-(-3) stay in Today, back arrow unchanged, flag-OFF disables routing

**Out of scope:**
- Schedule scope behavior unchanged (already accepts `sched_from`/`sched_to` via "Other" pill)
- Back arrow unchanged
- Date-picker input behavior unchanged (operator picks a specific date directly; AC-8 is forward-arrow-only per the audit framing)
- No new affordances, banners, or copy changes

**Pre-flight verified (Memory #11):**
- Forward-arrow site: `job-queue.tsx:894-900` (Next day button)
- Back-arrow site: `job-queue.tsx:861-867` (Previous day button) — unchanged
- Scope state + persistence: `job-queue.tsx:281-291` (`handleScopeChange`)
- Schedule filter state + URL writer: `job-queue.tsx:308-339` (`setScheduleFilter` + `handleScheduleFilterChange`)
- Feature flag: `FEATURE_FLAGS.POS_JOBS_UNIFIED_SCHEDULE` at `src/lib/utils/constants.ts:277`

**Dependencies:**
- Depends on: Phase 0.3 audit (`98a5f30d`) and Today vs Schedule conceptual audit (`26521e5a`)
- Parallel-safe with: Session 2.4 (terminal-state filter affordances)

**Linked prompt:** Session 2.3 prompt (operator-supplied in 2026-06-06 PST session)

**Completion:** Merged to main at `269b94f7` on 2026-06-06 PDT. Implementation followed the locked scope exactly. The single new callback `handleForwardArrow` reuses the existing `handleScopeChange` + `setScheduleFilter` + `router.push` primitives (Memory #2) — no new URL utilities, no new date helpers. The flag gate (`scheduleScopeEnabled`) is byte-symmetric with the scope toggle's flag gate at the same component scope — flag rollback restores legacy forward-arrow behavior without touching this code. Verification gates: tsc 0 errors / lint 0 errors (1 pre-existing baseline warning unchanged — `lastPollAt` from prior session) / 191 test files / 3079 tests passing (was 190 / 3074 — +1 file, +5 tests). 33 production lines / 1 prod file / 1 test file — well within the Memory #8 budget. No deviations from scope. No findings to surface.

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

### 2026-06-05 21:30 PST — Comprehensive decision-lock session (v1.1)

Following completion of all four Phase 0 audits (0.1 through 0.4) plus two targeted post-Phase-0 audits (webhook receivers identity, refund/credit/cancellation-fee), operator locked the next-phase architectural commitments. Document bumped from v1.0 to v1.1.

**New architectural commitments added:**
- **AC-12:** Customer-accept auto-conversion to pending appointment with SLA alerting (informs Phase 3; addresses Phase 0.2 audit F.8)
- **AC-13:** Mobile Phase 4 minimum-scope path (locks Phase 4 detailing scope; per Phase 0.4 audit)
- **AC-14:** Cancellation fee policy — default in `business_settings`, per-appointment override, operator-toggleable, semantically Pathway-A (per refund audit `3e633156` F.5)
- **AC-15:** Customer credit infrastructure — `customer_credits` table greenfield, create-at-cancel + apply-at-checkout + admin visibility, expiration policy deferred (closes refund audit's schema-level Pathway B gap)

**ACs refined by audit completion (already merged in pre-v1.1 doc updates):**
- **AC-5:** Pre-task on n8n receiver idempotency RESOLVED — webhook receivers identity audit (`f5e714a8`) verified no receiver exists; `fireWebhook` is silently no-op; Session 1.5 UNBLOCKED for the webhook concern specifically (forward caveat preserved)
- **AC-9:** Implementation scope verified — refund/credit/cancellation-fee audit (`3e633156`) confirmed Pathway A is partially implemented (refund engine exists in isolation, NOT orchestrated with cancel endpoints) and Pathway B is essentially unimplemented at the schema level (no `customer_credits`); cross-references to AC-14 (fee policy) + AC-15 (credit infrastructure) added

**New Phase 1 session added:**
- **Session 1.8:** Waitlist notification silent-drop fix — replaces dead `fireWebhook('appointment_cancelled', { waitlist_notified: … })` with direct `sendSms` loop; surfaced by webhook receivers identity audit Target D.4

**Reference Index** linked all 6 audit deliverables (4 Phase 0 + 2 targeted post-Phase-0). **Phased Plan Overview** status table updated: Phase 0 → `[x]` complete; Phase 1 → `[~]` in progress (Session 1.7 done); Phases 2–4 → `[ ]` ready to detail.

**Critical findings from audits informing the v1.1 locks:**
- Webhook system has no receiver in production — `business_settings.n8n_webhook_urls` seeded with all-null values across 2 migrations; no admin UI populates it; 25 `fireWebhook` sites silently no-op. Session 1.7's conditional gate fix (`f87aca58`) was correct discipline but did not produce customer-visible change in current state.
- **Waitlist notifications are the ONLY case** where `fireWebhook` is the SOLE dispatch channel — real customer-facing silent-drop bug (addressed by Session 1.8).
- Customer credit infrastructure does not exist — operator's stated "credit retained" workflow is an edit-same-row workaround that does not survive a true cancel (AC-15 closes the schema gap).
- `appointments.cancellation_fee` column exists but is decorative — no code path reads it to apply against refund (AC-14 closes the orchestration gap).
- AC-5's pre-task on webhook idempotency was vacuous — no receiver to be non-idempotent (Session 1.5 UNBLOCKED).
- Customer-facing "end job" SMS uses direct `sendSms` from `POST /api/pos/jobs/[id]/complete:243-262` — not webhook-mediated — so the operator-described flow works correctly in current production state.

**Forward caveat:** if Smart Details ever wires a webhook receiver (n8n or otherwise), source-side idempotency tokens must be added across the 25 `fireWebhook` sites. This is contingent future work, not Phase 1–4 scope.

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

**END OF DOCUMENT v1.1**

*Next action: operator review. Once locked, Phase 0 audits can be drafted and fired. Phase 1 sessions can ship in parallel with Phase 0 audits running.*
