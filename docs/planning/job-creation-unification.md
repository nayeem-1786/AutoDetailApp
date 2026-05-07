# Job & Appointment Creation Unification

Captured: 2026-05-05
Author: Nayeem Khan (synthesised by Claude Code during active session)

## Status

Planning. NOT started. Captured 5/5/26 during active session. Pending design decisions before implementation begins.

## Problem

Smart Details has six paths that create jobs and/or appointments. Each evolved organically. Records appear inconsistently in downstream views. Different cards, fields, actions, and orderings on Job Detail vs Appointment Detail vs Walk-In Detail vs Convert-to-Job result page. Major source of staff confusion and bug surface.

## Six Creation Paths

### 1. Online Booking Wizard (customer-facing)

Path: `/book`

Customer picks date and time. Customer optionally pays deposit or full. Status on create: Confirmed (if paid) or Pending (if no payment). Visible in: Admin Appointments, POS Jobs (if Confirmed and date is today).

### 2. Voice AI Agent (phone-driven)

ElevenLabs voice agent collects request from caller. AI captures date/time and service info. No payment captured (limitation: voice agent has no way to send payment link yet). Status on create: Pending (always — no payment). Visible in: Admin Appointments only — NOT in POS until Confirmed.

### 3. Quote → Convert to Appointment

Staff creates quote in POS. Staff clicks "Convert to Appointment" button. Modal opens with date/time picker. Staff picks future date and time. Status on create: Confirmed (or Pending depending on payment requirements). Visible in: Admin Appointments + POS Jobs (when date arrives).

### 4. Quote → Create Job

Staff creates quote in POS. Staff clicks "Create Job" button (instead of Convert to Appointment). Semantic: "do this NOW, customer is here". NO date picker — automatically dated for today. Status on create: Confirmed, immediately in-progress workflow. Visible in: POS Jobs (today).

### 5. POS + New Walk-In

Staff clicks "+ New Walk-In" in POS. Walk-in wizard: customer → vehicle → services. NO date picker — automatically dated for today. Status on create: Confirmed, immediately in-progress workflow. Visible in: POS Jobs (today). KNOWN BUG #3A: currently dates for tomorrow instead of today (separate fix in progress).

### 6. (Future) Voice AI Agent + Payment Link

Voice agent captures request. Agent sends customer a Stripe payment link via SMS. Customer pays via link. Webhook confirms payment, appointment auto-promoted from Pending → Confirmed. Not yet implemented — captured here for planning.

## Why This Needs Unification

### Symptoms

- Job Detail does NOT allow editing the appointment date directly (must use a separate modal)
- `created_at` is being conflated with appointment time — these are distinct concepts and should be distinct fields:
  - `created_at` = when the database row was inserted
  - `appointment_date` + `appointment_time` = when the service is scheduled to happen
  - These can legitimately differ (record created Tuesday for Friday appointment)
- Different cards, fields, actions, and orderings on Job Detail vs Appointment Detail vs Walk-In Detail vs Convert-to-Job result page
- Payment Link / Deposit button exists on Appointments page but NOT on Job Detail
- Inconsistent edit affordances — some fields editable in some views, not others

### Root Cause Hypothesis

Each path was built when the relevant feature was needed, with the simplest data model and UI for that path. There was no single shared "Job/Appointment Detail" component, so each path's downstream view evolved independently. The underlying data model (appointments table) is roughly shared, but the UI layer is not.

## Vision

### Goal: Single Shared Detail Component

ONE Job/Appointment Detail component that renders any record, regardless of how it was created. Fields and actions determined by:

- The status of the record (Pending, Confirmed, In-Progress, Completed, etc.)
- The role/permissions of the viewing user
- The system settings (e.g., admin photo requirement toggle)

NOT determined by:

- Which creation path produced the record
- Whether the record was originally a quote
- Whether a payment was captured at creation

### Goal: Distinct Time Fields

Database (and UI) should clearly separate:

- `created_at` (immutable — record creation timestamp)
- `appointment_date` (editable, when service is scheduled — date in PST)
- `appointment_time` (editable, scheduled time)
- `intake_started_at`, `intake_completed_at`, `work_started_at`, `work_completed_at` (workflow timestamps)

If `created_at` is currently doing double-duty as appointment time, this needs to be untangled in a migration. Reference rule 1 of CLAUDE.md: timezone is `America/Los_Angeles`, never UTC.

### Goal: Editable on Job Detail

Job Detail page should support editing of:

- `appointment_date` and `appointment_time` (with permission gate — e.g., manager-approved)
- assigned_employee
- service line items (add/remove/modify)
- vehicle (in case wrong vehicle was selected)
- customer notes
- Possibly more — defined in design phase

### Goal: Payment Link / Deposit Button on Job Detail

Same affordance as Admin Appointments. Allows staff to send a Stripe payment link to the customer for deposit or balance. Should integrate with the existing Stripe flow.

### Goal: Unified Walk-In + Quote → Create Job

Functionally identical in intent: "do this service today, customer is here." Different starting points (walk-in starts blank, Quote→Create Job starts pre-populated from quote). The handler that creates the resulting record should be ONE shared function with optional pre-population.

## Open Questions (require user decisions before implementation)

1. Should there be ONE Detail page or separate Job Detail vs Appointment Detail vs Quote Detail? Recommendation TBD. Reference: CLAUDE.md says "Quotes are READ-ONLY in admin. All creation/editing via POS builder deep-links" — this constraint may shape the answer.
2. Should `appointment_date`/`appointment_time` be editable directly on the page or via a modal?
3. Permission model: who can edit which fields? Manager-only for date changes? Detailer can edit own jobs?
4. When a Pending appointment becomes Confirmed (via payment link click), should the Detail page change appearance, or stay the same?
5. Migration: if `created_at` is currently used as appointment time, what's the safe transition path? Add new columns and backfill, then deprecate old usage?
6. What happens to historical records with the wrong `appointment_date` (Bug #3A artifacts)? Auto-correct? Flag for manual review? Leave alone?
7. Can the existing appointments table accommodate this, or is a refactored schema needed? Reference: `docs/dev/DB_SCHEMA.md`.

## Estimated Scope

Multi-session initiative spanning approximately 8–10 CC sessions across 1–2 weeks of focused work:

1. Comprehensive audit of all 6 paths (data + UI) — 1 session, no code
2. Design specification — written, not coded — 1 session
3. Migration: distinguish `created_at` from `appointment_date` + `appointment_time` if conflated — 1 session
4. Backend: shared "create today's job" helper consumed by Walk-In + Quote→Create Job — 1 session
5. Frontend: unified Job/Appointment Detail component — 2 sessions
6. Edit affordances on Detail page (with permission gates) — 1 session
7. Payment Link / Deposit button integration on Detail page — 1 session
8. Testing across all 6 paths — 1 session
9. Cleanup of duplicate components / dead code paths — 1 session
10. Documentation updates — final session

Could overlap with Phase 13 (Full QA) per CLAUDE.md build phase status.

## Status of Related Bugs

- Bug #3A (Walk-In creates appointment dated for tomorrow): currently being fixed as a NARROW fix, separately from this unification. Once shipped, walk-in records will be correctly dated. This unblocks staff while the larger unification is still in planning.
- Bug #5 (Pending appointments invisible in POS): may be partially addressed by this unification once a unified Detail page exists. Still needs a POS Appointments tab as a separate visibility surface.
- Bug #6B (manual_discount + loyalty_redemption persistence): unrelated to unification. Will ship independently.

## Implementation Sequence (proposed)

1. NARROW fix Bug #3A (walk-in date) — done first, separate session
2. Capture this planning doc — current session
3. Comprehensive audit across all 6 paths — separate session, no code
4. Design spec session — review audit findings, make decisions on Open Questions
5. Implementation begins — only after design spec is approved by user

## Author Notes

Captures Nayeem's vision after observing inconsistencies in production usage during 5/5/26 working session. Should be reviewed and updated whenever decisions are made or new flows are added.

## Original User Notes (Captured 5/5/26)

These notes are preserved verbatim from the user's original observations. They describe the problem in the user's own words and provide the source intent for the structured sections above. If any section above appears to conflict with these notes, the notes take precedence and the structured section should be updated.

> The Quote → Convert-to-Job path creates an appointment for today, regardless of whether the appointment is during business hours. So the Walk-In path must be using some other path. Good time to unify this as both seem to do the same thing, only different is that the walk-in starts with selecting a customer → select vehicle → select services or products but the Create Job uses the info already stored in the Quote.

> Another thing that is important to notate is that the Job Detail does not allow you to edit the Date. In fact it doesn't record either path as the appointment time (we need to use the shared appointment modal to select current date and time, then store this data as appointment time as that is separate field than Created, which I believe is currently being uses as the appointment time. But this distinction should be clear as both times can be different).

> Let's audit what info is present, discuss what should be editable, and button for Payment Link / Deposit button. Like it functions in the appointments page. Question why are the data sets, order, cards, and items different between, Walk-Ins, Quotes, Converted to Appointment, Create Job, Booked online, or by phone AI agent. Let's figure out what each of these paths looks like in the POS, then figure out how to unify them, and build ONE share component (if possible).

## Day-Boundary Semantics (Open Question)

When a single service appointment crosses midnight, where does it "belong" operationally?

USER DECISION (5/6/26): Use BUSINESS DAY model. Any job/appointment STARTED before midnight (during business hours or after-close work) belongs to the start day for all operational, scheduling, and accounting purposes. Detailer hours, intake records, and the Timeline view all anchor to the start day. Records DO NOT split or duplicate across days.

REVENUE RECOGNITION: Revenue is recognized on the date it was COLLECTED, not the date the work was performed. A walk-in started 11:50 PM Monday, paid 12:30 AM Tuesday → revenue counts on Tuesday. (This is independent of the business-day operational anchor.)

Decisions needed during unification design phase:
- Audit how scheduled_date, appointment_date, and estimated_pickup_at interact for spanning records
- Confirm the Timeline view renders the start-day correctly without duplicating on the end-day
- Audit dashboard, reports, and detailer-hours-worked queries to ensure business-day model is honored
- Migration: any existing records that violate this model

Bug #9 (Walk-In/Convert-to-Job 15-min rounding) addresses the rounding edge case where estimated_pickup_at wraps past midnight. It does not change the business-day anchoring policy.

## Multi-Day Services (Open Question)

Some Smart Details services take longer than a single business day:
- RV details: 8-12 hours
- Full ceramic coatings: 8-12 hours, sometimes more
- Other multi-stage premium services

Constraints:
- A detailer realistically works no more than 8 hours per day
- Service may legitimately need to span 1-3 days
- Customer drops off vehicle once, picks up once at end
- Daily cap is operational, not necessarily contractual

Possible data models (decision deferred to design phase):

Option A: Single appointment with multiple "work session" records
- One appointments row, multiple job_sessions rows
- Each session = one calendar day's work
- Pros: single appointment for customer-facing display, payment, loyalty
- Cons: new table, new query patterns

Option B: Single appointment spanning multiple calendar days
- One appointments row with start_date and end_date
- No splitting of database records
- Daily Timeline rendering computes which portion of work happens each day
- Pros: simpler data model
- Cons: harder to track "what work happened Day 1 vs Day 2", no per-day detailer assignment if different detailers work different days

Option C: Multiple linked appointments (one per day)
- Each calendar day has its own appointments row
- Linked via parent_appointment_id or similar
- Daily detailer assignment, daily intake/completion possible
- Pros: clean per-day operational model
- Cons: customer-facing has to aggregate across rows, payment / loyalty / coupon need to know about the link

Open questions for design phase:
- Which option? Or hybrid?
- Customer drop-off and pick-up flow: still single intake (Day 1) and single completion (Day N)?
- Photos: one set at intake (Day 1), one set at completion (Day N), OR per-day photo sets?
- Detailer assignment: same detailer all days, or can it vary?
- What happens if Day 2 needs to be rescheduled (sickness, equipment failure)?
- Payment timing: deposit at start, balance at completion?
- Loyalty/coupons: applied once at start, once at end, or per session?
- Booking impact: does a multi-day service block a specific bay/spot for those days, or just a detailer's time?
- How does this interact with the Timeline view — does Day 2 start at 9 AM (or wherever continuation makes sense)?

USER PREFERENCE (5/6/26): Lean toward splitting visible work across multiple business days for accurate detailer scheduling and Timeline visibility. Don't show 12 hours of work as a single block on one day.
