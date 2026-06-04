# Today view vs Schedule view — Conceptual Audit

> Read-only conceptual Component Behavior audit, 2026-06-03. Branch:
> `audit/today-vs-schedule-conceptual-model`. Memory #29 type 3
> (Component Behavior). Sibling to the day's tactical audits
> (`b0efd95f` state machine, `d3671c82` consequence map, `d1eb1e24`
> Edit-in-POS, `b346d34b` parity, `d6091ff3` manual-amount + no_show)
> but REFRAMES rather than extends them.
>
> **No source / migration / test changes. No fix recommendations.
> The audit's purpose is to surface the picture so the operator can
> decide architectural direction before any further fix session
> fires.**

---

## Executive summary

POS > Jobs has two scope surfaces (`Today` and `Schedule`) and a
date-navigation arrow inside Today. They look like overlapping views
of the same data, but they are NOT — Today reads the **`jobs`**
table (materialized work execution), Schedule reads the
**`appointments`** table (booking lifecycle). Item 15e Phase 1A
established the load-bearing invariant that **future-dated
appointments are NEVER materialized into job rows**: populate is
server-gated to today-or-past. The operator's June 4 reproduction
(confirmed June 4 appointment visible in Schedule, invisible in
Today's forward-arrow navigation) is the **direct, intentional
consequence** of that invariant — Today's forward-arrow queries the
`jobs` table, no job exists for June 4 yet, so the list is correctly
empty. The forward-arrow in Today was inherited from the pre-15e
single-date-navigator and was not redesigned when Schedule scope
landed; it now serves a narrow purpose (review *past* materialized
jobs) that the UI does not surface to the operator. The
non-overlap-by-design between Today and Schedule is correct under
the Item 15e architecture; the **operator's perception of overlap**
comes from (a) the forward-arrow's continued existence creating an
expectation it's a "future preview" when it is structurally a "past
review" affordance, and (b) the POS bottom-nav still carrying an
**Appointments tab as a third near-duplicate** of the Schedule scope
(Item 15e Phase 3 nav-retirement did not ship).

The architecture matches the operator's intuited mental model
("Today = active work, Schedule = future waiting to become active")
**only when the forward-arrow is interpreted as a backward-only
affordance**. The forward-arrow's directional behavior is the seam
where the mental model fractures.

---

## Target A — The intended conceptual model

### A.1 — What Today view is FOR (intent)

**Source of intent:** the original POS Jobs queue predates Item 15e
(`src/app/pos/jobs/components/job-queue.tsx` references at lines
`74-93` STATUS_CONFIG/PRIORITY date back to Phase 8 jobs schema).
Item 15e (`docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md`,
2026-05-27) reframed it as the **single day-of operations surface**
in §TL;DR ¶1: "POS Jobs is already the day-of operations surface for
both booked appointments and walk-ins."

Today scope shows **materialized JOB rows** — the operational work
execution records the floor staff drive through the
`scheduled → intake → in_progress → pending_approval → completed → closed`
workflow. The scope's purpose is **"what work is happening / has
happened on a given calendar day."** It is single-date-navigable
because the floor's mental unit IS the day.

Evidence:

- Endpoint reads `jobs` table joined to `appointments` for schedule
  metadata, NOT `appointments` directly
  (`src/app/api/pos/jobs/route.ts:37-95`).
- Default date = today PST (`src/app/api/pos/jobs/route.ts:27-35`).
- Filter pills: All / My Jobs / Unassigned — operational worker
  bucketing (`src/app/pos/jobs/components/job-queue.tsx:907-925`).
- Polling: 5s active / 60s past
  (`src/app/pos/jobs/components/job-queue.tsx:427-428, 556-561`)
  — live operational state, not booking pipeline.
- Init effect calls `populateFromAppointments(date)` then
  `fetchJobs(date)` (`job-queue.tsx:711-723`) — materializes any
  appointments for that date (or skip if future) before reading.
- View modes: List + Timeline
  (`job-queue.tsx:927-953, 1027-1040`). Timeline is a calendar/grid
  of the day's work — operational, not pipeline.

### A.2 — What Schedule view is FOR (intent)

Item 15e §TL;DR ¶3 explicitly frames it: *"POS Jobs gains a
**date-scope toggle (Today / Upcoming)**… where future-dated
appointments render directly from the appointments table without
being materialized into job rows."* The shipped name is "Schedule";
the design name was "Upcoming."

Schedule scope shows **future-only APPOINTMENTS** (the booking
records, not the work execution records) — the forward-looking
calendar view of what's coming up. The scope's purpose is **"what
booked work is waiting to happen."** It is range-navigable (date
pills) because the booking-pipeline mental unit is a window, not a
day.

Evidence:

- Endpoint reads `appointments` table directly
  (`src/app/api/pos/jobs/schedule/route.ts:96-116`).
- Hard future floor — clamps `from` to **tomorrow** even if a
  caller passes today
  (`schedule/route.ts:82-90`).
- Excludes `cancelled`, `no_show`, `completed`
  (`schedule/route.ts:12, :114`) — only "actionable upcoming rows."
- Filters out appointments that ALREADY have a materialized job
  (`schedule/route.ts:131-141`) — explicit no-double-counting against
  Today.
- Endpoint comment at `:24-27` codifies the invariant: **"PURE READ.
  It NEVER calls populate, NEVER writes the `jobs` table, and has
  ZERO side effects."**
- Init in client never calls populate when scope is Schedule
  (`job-queue.tsx:711-723` GATE A; populate function itself short-
  circuits if `scopeRef.current !== 'today'` at `job-queue.tsx:580`
  GATE C).
- No polling (`job-queue.tsx:557` — "Schedule scope is not
  live-polled").

### A.3 — What the forward-arrow navigation in Today view is FOR (intent)

This is the seam the operator's reframing exposed. **The
forward-arrow predates Item 15e and was not redesigned when Schedule
landed.** It was the pre-15e single-date-navigator that let an
operator scroll through days of materialized jobs (`job-queue.tsx`
forward/backward chevrons at `:829-868`).

Under the Item 15e architecture, the forward-arrow's behavior is:

- Navigate to a date.
- Init effect fires (`useEffect` at `:711-723`): calls
  `populateFromAppointments(date)` then `fetchJobs(date)`.
- `populateFromAppointments(date)` POSTs `/api/pos/jobs/populate`
  with `date`.
- Server populate route checks `if (targetDate > today) { return
  { created: 0, skipped: 'future_date' } }` — line `:42-47`.
- `fetchJobs(date)` queries `jobs` table for that date.
- For **today / past**: shows materialized jobs as expected.
- For **future**: shows an empty list (no jobs were materialized,
  and the Today endpoint reads jobs not appointments).

The CHANGELOG and Item 15e audit do not state an explicit intent for
the forward-arrow under the new architecture. The infrastructure
suggests its only USEFUL purpose post-15e is **navigating to
*past* dates to review completed/closed jobs** — the part of the
arrow that points forward into the future is now structurally
inert (it always produces "No jobs for [date]" for any future date
beyond the same-day, because populate refuses to materialize).

There is a "Past/Future date indicator" banner at
`job-queue.tsx:872-881` that distinguishes past vs upcoming dates
with different visual treatment (gray vs blue banners) — this
hints the *original* designers intended forward navigation to be
meaningful, but the Item 15e populate-gate retroactively neutered
it without a corresponding UI change.

### A.4 — The intended relationship between Today's forward-arrow and Schedule view

Under the Item 15e architecture, the answer is **(iii) overlapping
unintentionally — drift between two separately-built features.**

- The forward-arrow shipped first (Phase 8 jobs schema, 2026-02-12)
  and meant "show me jobs for date X."
- Item 15e Phase 1A (2026-05-27, Session #103) added populate's
  future-date guard.
- Item 15e Phase 1B added the Today/Schedule scope toggle
  (Session #105).
- The flag (`pos_jobs_unified_schedule`) was OFF in production
  from 2026-05-27 → 2026-06-03 (Session #146, today,
  `supabase/migrations/20260603000000_enable_pos_jobs_unified_schedule.sql`).
- N+1 (#148) and N+2 (#149) added pills + filters to Schedule.

The forward-arrow was not part of any of those sessions' change
sets. It exists today as **vestigial UI** that the Item 15e arc
made structurally redundant for future dates without removing.

Item 15e Phase 1's verification plan
(`ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md:497-499`)
explicitly tests *"navigating Jobs to a future date does NOT create
job rows"* — confirming the populate-gate is intended — but does
not address whether the forward-arrow itself should *exist* for
future dates given that gate.

---

## Target B — What each surface ACTUALLY shows

### B.1 — Today view (actual behavior, file:line)

| Attribute | Behavior | Evidence |
|---|---|---|
| Default date | Today PST | `job-queue.tsx:247-249` (`getTodayPst()` + `searchParams.get('date')` fallback) |
| Date range | Single day | `job-queue.tsx:464-481` `fetchJobs(date)` queries by single `date=` |
| Navigation | Prev/next chevrons (single-day step), date picker, "Today" jump button | `job-queue.tsx:828-868` |
| Forward-arrow into future | Allowed; navigates by 1 day | `job-queue.tsx:862-868` (no future guard in UI) |
| Past/Future indicator banner | Gray "X days ago" for past; blue "Upcoming — [date]" for future | `job-queue.tsx:872-881` |
| Data source | `GET /api/pos/jobs?filter=X&date=Y` | `job-queue.tsx:464-481`; server at `src/app/api/pos/jobs/route.ts:15-141` |
| Data table | `jobs` joined to `appointments` for scheduled_time | `src/app/api/pos/jobs/route.ts:37-45` (`appointment:appointments!jobs_appointment_id_fkey(...)`) |
| Two-step query shape | (a) appointments on date → ids; (b) jobs with appointment_id in ids; (c) walk-in fallback: jobs with appointment_id NULL + created_at in date's PST window | `src/app/api/pos/jobs/route.ts:51-94` |
| Status filter (server) | Excludes `cancelled` only | `src/app/api/pos/jobs/route.ts:47` (`excludeStatuses = ['cancelled']`) |
| Includes `no_show`? | Inferred yes — `no_show` is an appointment status, not a job status; `jobs.status` ∈ scheduled/intake/in_progress/pending_approval/completed/closed/cancelled (`src/app/pos/jobs/components/job-queue.tsx:74-92`) | n/a |
| Filter pills (UI) | All / My Jobs / Unassigned (operator scope) | `job-queue.tsx:907-925` |
| View modes | List + Timeline | `job-queue.tsx:927-953, 1027-1040` |
| Pre-fetch step | `populateFromAppointments(date)` → POST `/api/pos/jobs/populate` | `job-queue.tsx:574-601, 711-723` |
| Populate effect on future date | Server skips, returns `{ created: 0, skipped: 'future_date' }` | `src/app/api/pos/jobs/populate/route.ts:42-47` |
| Polling | 5s for today/future; 60s for past | `job-queue.tsx:427-428, 556-561` |
| Daily summary | totalJobs / unassigned / totalRevenue / completedCount | `job-queue.tsx:747-754, 884-905` |
| Card content | Customer + vehicle + services + total + status pill + scheduled time (purple) OR Walk-In (amber) + pickup time + timer + photo progress + addon badge + assignee | `job-queue.tsx:1061-1213` (List view) |
| Card tap | Opens `JobDetail` (full job execution surface) | `src/app/pos/jobs/page.tsx:322-327` (`onSelectJob`) |
| Available actions | Status workflow (intake → work → complete), checkout, addon, cancel job (channel-aware), reschedule via change-time button, customer/vehicle edit, photo capture, timer, payment-link send, reassign, un-materialize (revert to pending) | `src/app/pos/jobs/components/job-detail.tsx` (1968 lines) |

### B.2 — Schedule view (actual behavior, file:line)

| Attribute | Behavior | Evidence |
|---|---|---|
| Default date range | Tomorrow → Tomorrow+30 days (per default `next_30_days` pill) | `job-queue.tsx:297-307` (default state) + `src/lib/utils/schedule-date-range.ts` computes from pill |
| Hard future floor | Endpoint clamps `from` to tomorrow even if caller passes today/past | `src/app/api/pos/jobs/schedule/route.ts:82-90` |
| Hard ceiling | 31 days | `schedule/route.ts:8` (`MAX_RANGE_DAYS`) |
| Navigation | 6 date pills (Tomorrow / This Week / Next Week / This Month / Next 30 Days / Other custom range) | `src/app/pos/jobs/components/schedule-pill-row.tsx` (Session #148) |
| Data source | `GET /api/pos/jobs/schedule?from=Y&to=Z` | `job-queue.tsx:607-625`; server at `src/app/api/pos/jobs/schedule/route.ts` |
| Data table | `appointments` directly | `schedule/route.ts:96-116` |
| Status filter (server) | Excludes `cancelled, no_show, completed` | `schedule/route.ts:12, :114` |
| De-duplication against Today | Drops appointments that already have a materialized job | `schedule/route.ts:131-141` |
| Status filter (UI) | All Statuses / Pending / Confirmed / In Progress (3 actionable values + "all") | `job-queue.tsx:985-997` |
| Detailer filter (UI) | All / Unassigned / [bookable employees] | `job-queue.tsx:998-1017` |
| Search (UI) | Debounced 300ms; OR within (first/last/phone/make/model); case-insensitive substring | `job-queue.tsx:967-974, 334-345`; helper `src/lib/utils/schedule-entry-matches.ts` |
| Filter combination | AND across categories (status AND detailer AND search AND date pills) | `src/lib/utils/schedule-entry-matches.ts` |
| Pre-fetch step | None — `fetchSchedule()` only (init effect short-circuits before populate) | `job-queue.tsx:711-718` (GATE A) + `:574-580` (GATE C in populate function itself) |
| Polling | None — "Schedule scope is not live-polled" | `job-queue.tsx:557` |
| Card content | Customer + vehicle + services + total + status pill (pending/confirmed/in_progress) + "Schedule" badge + date/time | `job-queue.tsx:1290-1354` (`ScheduleScopeList`) |
| Card tap | Opens `AppointmentDetailDialog` (the reused admin dialog with POS context props) | `job-queue.tsx:631-660, 1221-1238` |
| Available actions | Status edit (limited by `STATUS_TRANSITIONS` server-side on POS PATCH), reschedule, cancel (POS cancel dialog), notes, "Edit in POS" deep-link to Sale tab (after #150) | `job-queue.tsx:671-708`; `AppointmentDetailDialog` in `src/app/admin/appointments/components/appointment-detail-dialog.tsx` |
| Visibility scope | `appointments.view_today` permission | `schedule/route.ts:44-55` |

---

## Target C — Overlap and divergence

### C.1 — Date-range overlap (Today's forward-arrow vs Schedule's tomorrow)

**Today's forward-arrow → tomorrow** and **Schedule's "Tomorrow"
pill** point at the same calendar date. They show DIFFERENT data:

- Today's forward-arrow to tomorrow → empty list (populate skipped
  for future date; `jobs` table has no row).
- Schedule's "Tomorrow" pill → tomorrow's `appointments` rows.

**By design** under Item 15e — they're two different surfaces on
two different tables. **By operator perception** — overlap, because
the date is the same and the UI does not explain why one is empty
while the other is populated.

### C.2 — Data-type overlap

| Date | Today scope shows | Schedule scope shows |
|---|---|---|
| Past dates | Materialized jobs for that date (read from `jobs`) | Nothing — endpoint clamps to tomorrow+ |
| Today | Materialized jobs for today; populate materializes any new confirmed/in_progress appointments | Nothing — server clamps |
| Tomorrow+ | Empty (no jobs for future dates by populate-gate) | Future appointments (read from `appointments`), minus any already-materialized |

**No data overlap by design.** The de-duplication in
`schedule/route.ts:131-141` ensures an appointment cannot appear in
BOTH simultaneously (it appears in Schedule when un-materialized; it
disappears from Schedule and appears in Today as a job the moment
populate runs against it).

### C.3 — Status filter divergence

| Status | Today endpoint | Schedule endpoint |
|---|---|---|
| `pending` | included | included |
| `confirmed` | included | included |
| `in_progress` | included | included |
| `completed` | included | EXCLUDED |
| `no_show` | included (appointment status; not directly applied — jobs query) | EXCLUDED |
| `cancelled` | EXCLUDED | EXCLUDED |

(Note: Today's "status" axis is conceptually `jobs.status`, not
`appointments.status`. The endpoint's `excludeStatuses = ['cancelled']`
filter at `src/app/api/pos/jobs/route.ts:47` is applied to `jobs.status`,
which has values `scheduled/intake/in_progress/pending_approval/completed/closed/cancelled`
per `job-queue.tsx:74-92`. The `pending` / `confirmed` / `no_show` /
appointment-level statuses don't directly apply to Today's jobs filter
— they're booking-lifecycle states. Today shows the OPERATIONAL state.)

This divergence is **intentional** under Item 15e —
`docs/dev/MANUAL_AMOUNT_AND_NO_SHOW_AUDIT.md` (`d6091ff3`) Issue 2
landed today: a confirmed→no_show transition removes the
appointment from Schedule's data set entirely. The operator
reported that as a bug; the audit documented it as "INTENTIONAL
behavior per the Item 15e POS jobs unified-operations audit."

### C.4 — Action overlap

| Action | Today (JobDetail) | Schedule (AppointmentDetailDialog) |
|---|---|---|
| View customer/vehicle/services | ✓ | ✓ |
| Edit notes | ✓ (intake_notes) | ✓ (job_notes / internal_notes) — different fields |
| Reschedule | ✓ via `<ChangeTimeButton>` → `<RescheduleAppointmentDialog>` | ✓ via shared dialog → `<RescheduleAppointmentDialog>` (same dialog under the hood, gated by `appointments.reschedule` permission) |
| Cancel | ✓ channel-aware (walk-in immediate vs notify-flow) | ✓ → POS `<CancelAppointmentDialog>` (Item 15b — no waive_fee, no cancellation_fee) |
| Status edit | ✓ via job-status workflow (scheduled → intake → in_progress → pending_approval → completed → closed) | ✓ via appointment-status dropdown (pending → confirmed → in_progress → completed + override optgroup) — DIFFERENT axis (`b0efd95f` state machine audit) |
| Reassign detailer | ✓ | ✓ |
| Mobile-service enable/edit | ✓ via `<EditMobileModal mode='pos'>` | ✓ via shared dialog mounted modifier |
| Modifier summary (coupon/loyalty/manual) | ✓ via `<ModifierSummary>` | ✓ |
| Payment-mismatch banner | ✓ | ✓ |
| Edit services (Sale-tab deep-link) | n/a (already in POS; checkout flow IS the editor) | ✓ via "Edit in POS" button → `/pos?source=appointment` (post-#150) |
| Send payment link | ✓ | ✗ (admin/POS asymmetry per parity audit `b346d34b`) |
| Customer/vehicle edit | ✓ (CustomerLookup, vehicle relink/create) | ✗ in shared dialog (admin host: readonly; POS host: same) |
| Timer (work_started/completed) | ✓ | ✗ (no job exists yet) |
| Photo capture (intake/progress/completion) | ✓ | ✗ (no job exists yet) |
| Addon flag-issue + resend | ✓ | ✗ (no job exists yet) |
| Checkout | ✓ (Completed → Checkout button → register) | ✗ |
| Un-materialize (Revert to Pending) | ✓ via `<UnMaterializeConfirmationDialog>` (Item 15e Phase 2C-β-2) | n/a (nothing to un-materialize) |

The overlap is partial — shared affordances exist for what's
conceptually shared (customer/vehicle/services/reschedule/cancel),
but each surface has a tail of affordances unique to its lifecycle
stage. The dialogs are NOT the same component on the two surfaces.

### C.5 — A third near-overlapping surface still exists in nav

**POS bottom nav still renders both `Jobs` and `Appointments`
tabs** (`src/app/pos/components/bottom-nav.tsx:195-206`). Item 15e
Phase 3 (retire/absorb of `/pos/appointments`) is structurally
**not shipped**. The Appointments tab remains a near-duplicate
of the Schedule scope (with different filter semantics and a
non-cancelled-only data set per `MANUAL_AMOUNT_AND_NO_SHOW_AUDIT.md`
cross-references). This is OUTSIDE this audit's stated scope but
must be acknowledged: there are NOT two surfaces overlapping —
there are THREE (Today / Schedule / Appointments).

---

## Target D — The June 4 appointment visibility puzzle

### D.1 — Reproduction in code

Sequence at 2026-06-03 (today = `2026-06-03` PST):

1. Operator creates an appointment on June 4 (`scheduled_date =
   '2026-06-04'`), `status = 'confirmed'`.
2. Operator navigates to POS > Jobs.
3. **Schedule scope path (visible ✓):**
   - Effective scope = `'schedule'` (flag flipped today, Session #146).
   - Default pills: `['next_30_days']`.
   - `computeScheduleDateRange(['next_30_days'], null, '2026-06-03')`
     → `{ from: '2026-06-04', to: '2026-07-04' }` (tomorrow + 30 days).
   - `fetchSchedule()` → `GET /api/pos/jobs/schedule?from=2026-06-04&to=2026-07-04`.
   - Server: status `confirmed` passes `EXCLUDED_STATUSES` filter
     (`schedule/route.ts:12, :114`).
   - Server: appointment has no job row → passes the materialization
     filter (`:131-141`).
   - Returns the June 4 appointment. **Visible.**
4. **Today scope path with forward-arrow to June 4 (invisible ✗):**
   - Effective scope = `'today'` (operator switches the toggle to Today).
   - Default date = today = `2026-06-03`.
   - Operator taps the forward chevron → `setDate('2026-06-04')`
     (`job-queue.tsx:862-868`).
   - URL updates to `?date=2026-06-04`.
   - Init effect fires (`:711-723`):
     - `populateFromAppointments('2026-06-04')` → POST
       `/api/pos/jobs/populate` body `{ date: '2026-06-04' }`.
     - Server (`src/app/api/pos/jobs/populate/route.ts:42-47`):
       `targetDate ('2026-06-04') > today ('2026-06-03')` →
       `console.log('[populate] skipped — future date 2026-06-04')` +
       returns `{ created: 0, skipped: 'future_date' }`. No job created.
     - `fetchJobs('2026-06-04')` → `GET /api/pos/jobs?filter=all&date=2026-06-04`.
     - Server (`src/app/api/pos/jobs/route.ts:51-94`): finds the
       appointment on June 4 → queries `jobs` table for that
       appointment_id → **no job row exists** → returns empty.
   - UI shows: **"No jobs scheduled for Thursday, June 4"** with
     subtitle "No appointments or walk-ins for this date"
     (`job-queue.tsx:1047-1057`).

### D.2 — The gap

| Question | Answer | Evidence |
|---|---|---|
| Does Today's forward fetch query `jobs` only? | YES — reads `jobs` joined to `appointments` for schedule metadata; the join is filter-only, not data-source | `src/app/api/pos/jobs/route.ts:37-94` |
| Is the June 4 appointment materialized into a job yet? | NO | `populate/route.ts:42-47` server-rejects all future dates |
| When does materialization happen? | (a) On-demand when Today scope is loaded for today/past dates (operator opens POS Jobs); (b) Eagerly on walk-in creation (`POST /api/pos/jobs`). Future dates: **never proactively** | `populate/route.ts:42-47`; `route.ts:383-490` |
| Is there a cron that materializes future appointments? | NO. `lifecycle-engine`, `booking-reminders`, `quote-reminders`, `qbo-sync`, etc. do not call populate. | `find src/app/api/cron -type f` + grep for `populate`/`materializ` returns no cron callers |
| What triggers June 4's materialization? | Operator opens POS Jobs on the morning of June 4 → Today scope's init effect calls populate with `date=2026-06-04`, which on that day = today → server proceeds, creates the job | `job-queue.tsx:711-723`; `populate/route.ts:42-47` |
| What about a walk-in for "tomorrow"? | Not a real case — walk-ins are eagerly created with `scheduled_date = today PST` | `src/app/api/pos/jobs/route.ts:315-415` |

### D.3 — Classification of the behavior

**INTENTIONAL** per Item 15e Phase 1A (the load-bearing
re-materialization invariant). Documented at three sites in code:

- `populate/route.ts:35-47` — *"FUTURE-dated appointment must NEVER
  become a job row early."*
- `schedule/route.ts:24-27` — *"PURE READ. It NEVER calls populate,
  NEVER writes the `jobs` table, and has ZERO side effects."*
- `job-queue.tsx:574-601` (GATE C) — *"never materialize jobs in
  Schedule scope, even if invoked outside the gated init effect."*

…and at one additional site at the dialog/dialog-mount level:

- `lib/appointments/lifecycle-sync.ts:24-31` — *"LOAD-BEARING
  re-materialization invariant: populate materializes appointments
  whose status is confirmed or in_progress and dedups on the UNIQUE
  jobs.appointment_id. Therefore un-materialize MUST leave the
  appointment in a NON-materializing status (pending)."*

The architecture is consistent and self-aware about the invariant.
**But the operator's mental model is also consistent**: they're
confused not by a bug but by a forward-arrow that *invites* the
exploration the architecture then refuses to reward. The UI's
"Past/Future date indicator" banner at `job-queue.tsx:872-881` even
labels future dates with a blue "Upcoming — [date]" hint — sending
the operator into a state where the data layer guarantees emptiness.

**Tier the classification:** the **populate gate + Schedule scope**
are intentional. The **forward-arrow's continued existence in Today
scope** is, against this architecture, **ambiguous**:

- It may be intentional vestigial behavior (useful for past dates
  only — review completed jobs).
- It may be unintentional vestigial behavior (no one redesigned it
  when scope landed).
- The architecture imposes no judgment.

This is an **operator decision to make**, not an audit verdict.

---

## Target E — Architectural questions for operator

The audit surfaces these. It does NOT pre-resolve them. Some of them
may reframe the prior audits (Target F); some may close fix queues
that no longer matter; some may open new ones.

### E.1 — Should Today's forward-arrow navigation EXIST?

If Schedule scope is the canonical "future view" with a richer set
of pills + filters + a 31-day window + the appointment-detail dialog
flow, is the Today forward-arrow:

- (a) Useful AS-IS for past-date review only (keep, accept the empty-
  state misdirection for future dates),
- (b) Useful if redesigned to forward-route to Schedule scope when
  operator taps forward past today,
- (c) Vestigial and removable (replace with a "Yesterday" button
  symmetric to "Today" jump),
- (d) Useful if it surfaced UN-materialized appointments INSIDE
  Today scope alongside materialized jobs (radically different
  model — see E.3 below).

### E.2 — If Today's forward-arrow stays, should it show APPOINTMENTS (not just jobs)?

This is the most direct match to the operator's mental model
("preview of upcoming work"). If Today's forward-arrow on a future
date queried `appointments` instead of `jobs`, the June 4 puzzle
disappears immediately:

- Forward-arrow to June 4 → shows the June 4 appointment.
- Tap card → opens AppointmentDetailDialog (same as Schedule).

But it conflicts with the **scope toggle's whole reason to exist**.
Today is the operational surface (jobs); Schedule is the booking
surface (appointments). Making Today show appointments-on-future-
dates merges the two scopes' purposes and partially undoes Item 15e
Phase 1.

### E.3 — Should the operator's mental model ("Today = active, Schedule = future waiting") be canonical?

The phrasing of "Today = active work, Schedule = future waiting to
become active" matches Item 15e's design exactly. **The architecture
already implements this model.** What's misaligned is not the
mental model vs the architecture — it's the **forward-arrow's
UI affordance** vs the architecture's data semantics.

A canonical commitment to the model implies: **the forward-arrow
in Today should not exist for future dates.** Either it disappears
past today, or tapping it on a future date routes the operator to
Schedule scope at the right pill/range.

### E.4 — When does materialization (appointment → job) happen, and is the timing automatic enough?

Today's behavior:

- Eager: walk-in creation.
- On-demand: operator opens POS Jobs in Today scope on the date
  in question.
- Never: cron / scheduled task.

**Implications:**

- A booked appointment on June 4 stays an appointment row until June
  4, when the first POS Jobs Today view of that day triggers its
  materialization.
- If no operator opens POS Jobs that day (e.g., a same-day no-show
  before opening hours), the appointment never becomes a job. That's
  acceptable — `appointments.status` workflow can still close it
  out — but it means the `jobs` table is "lazy" not "complete."

This isn't broken, but the operator may want to consider:

- Should there be a daily cron that materializes that day's
  appointments at, say, 6:00 AM PST? (Pros: `jobs` table has
  complete coverage; admin reports / dashboards reading `jobs` see
  the day's expected work. Cons: violates the "lazy-materialize"
  invariant in a benign way.)
- Should materialization be advertised to the operator (toast,
  status indicator) so they know the transition happened?
- Should an operator be able to *manually* materialize a future
  appointment to do day-of work preparation? (Pros: matches the
  intuited forward-arrow purpose. Cons: re-introduces the
  "premature-materialization" risk Item 15e Phase 1A spent
  load-bearing guards preventing.)

### E.5 — Is there a SIMPLER architecture given Today + Schedule + Today's forward-arrow + Admin > Appointments + POS > Appointments?

Counting surfaces that show appointment/job data on the POS side:

1. POS > Jobs > Today scope
2. POS > Jobs > Today forward-arrow (future dates — structurally
   inert post-15e)
3. POS > Jobs > Schedule scope
4. POS > Appointments tab (still in bottom nav — Item 15e Phase 3
   not shipped)
5. (Admin > Appointments — outside POS but a fifth full surface
   for the operator who switches contexts)

Item 15e's Recommendation 3 was explicit: **retire and absorb POS
Appointments tab.** That step has not landed. The Schedule scope's
existence implies a partial retire (the Appointments tab is now
redundant), but the tab remains visible — meaning the operator's
"too many surfaces" intuition is accurate.

A simpler architecture could be:

- One forward-navigable Today scope that internally swaps data
  source based on date (jobs for today/past, appointments for
  future).
- No separate Schedule scope; the pills + filters + range
  navigation become the Today scope's date-range navigator.
- POS Appointments tab retired.

OR:

- Keep the scope toggle but make the forward-arrow ALWAYS route to
  Schedule scope when crossing into the future (a one-way bridge).
- Remove the forward-arrow's "Upcoming — [date]" banner; replace
  with a "Switch to Schedule view" prompt.
- POS Appointments tab retired.

Both are wider refactors than the day's individual audit fix arcs.
**The operator should decide the destination before any fix arc
fires** — otherwise the fix arcs (parity, state machine,
consequence map, etc.) accumulate against a moving target.

---

## Target F — Prior audits cross-referenced against the conceptual model

This is the explicit reframing target. For each prior audit on the
recent timeline, the audit notes whether the conceptual model
**reframes** or **leaves intact** that audit's findings.

### F.1 — `b0efd95f` State-machine audit (`docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md`)

**Original finding:** Admin PATCH and POS PATCH both write
`appointments.status` but only POS enforces `STATUS_TRANSITIONS`;
admin allows any forward/backward jump. Operator hits "Cannot
change from confirmed to pending" on POS, silently succeeds on Admin.

**Reframed in light of the conceptual model:**
- POS PATCH is invoked from the **Schedule scope** (appointment-detail
  dialog → save → PATCH).
- Admin PATCH is invoked from Admin Appointments page (same dialog,
  different host).
- The shared dialog now serves BOTH hosts, but the host's PATCH
  endpoints differ.
- Under Item 15e Phase 1A the Schedule scope is the canonical POS
  surface for appointment editing. So the asymmetry **matters more
  than it did pre-15e** — the Schedule scope is now a daily
  operational tab, not a fringe edit surface.

**Does the conceptual model change the finding's significance?**
Yes — UPWARD. The Schedule scope makes the POS PATCH the daily-use
path; the asymmetry the audit flagged is hit MORE often, not less.
The fix arc the audit surfaced (state-machine source of truth +
parity at PATCH) is reinforced by the conceptual model.

### F.2 — `d3671c82` Consequence map (`docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md`)

**Original finding:** PATCH endpoints emit `appointment_confirmed`
and `appointment_completed` webhooks but not `appointment_cancelled`.
Status transitions have transition-specific side effects (audit
log, lifecycle engine, booking reminders) that the audit mapped per
transition pair.

**Reframed:**
- Schedule scope's `handleSaveAppointment` calls POS PATCH
  (`job-queue.tsx:671-695`) → all the consequence-map transitions
  apply on the Schedule scope side.
- Today scope's job-status workflow drives `jobs.status`, NOT
  `appointments.status` directly (except via `executeUnMaterialize`
  reverse path). So the consequence-map applies primarily to
  Schedule scope edits.

**Does the conceptual model change the finding's significance?**
Slightly downward for Today scope (most operator status work there
is on `jobs.status`, owned by the per-action endpoints `/start-work`
`/complete` `/cancel`, not PATCH). Unchanged for Schedule scope.
The audit's per-transition consequence detail remains correct and
actionable. The `appointment_cancelled` webhook gap remains real
on BOTH surfaces.

### F.3 — `d1eb1e24` Edit-in-POS audit (`docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md`, fixed in `4a03d8ea` Session #150)

**Original finding + fix:** The "Edit in POS" button on the
Schedule-scope dialog was wired as a no-op; #150 wired it through
the `returnToPath` prop with `/pos/jobs` as the return path, so the
operator can edit services on an upcoming appointment via the Sale
tab.

**Reframed:**
- This button makes sense **only for Schedule scope** (future
  appointment, no materialized job yet, so editing services in the
  Sale tab and saving back is the only "edit services" path).
- For Today scope, editing services on a materialized job goes
  through the checkout/ticket-restore flow at `pos/jobs/page.tsx`
  `handleCheckout` (`:55-306`) — different mechanism.

**Does the conceptual model change the finding's significance?**
No — the fix correctly targeted the Schedule scope and is consistent
with the conceptual model (the Schedule scope IS the Sale-tab-bridge
surface). One follow-on the conceptual model surfaces: **the same
button is currently rendered on the Today scope's job-detail too**
(when applicable). For a materialized job the deep-link is
redundant with the existing Checkout→register flow. Worth a
secondary verification pass.

### F.4 — `b346d34b` Comprehensive parity audit (`docs/dev/ADMIN_POS_DIALOG_PARITY_AUDIT.md`)

**Original finding:** 21 dialog-behavior dimensions across the
shared `AppointmentDetailDialog` host pairs. 8 intentional / 6
drift / 7 shared-vertical. Fix arc: 3 sessions ~70-110 lines.

**Reframed:**
- The dialog is mounted in two host contexts: admin Appointments
  page + POS Schedule scope. Under the conceptual model, the POS
  mount serves the **upcoming-appointment** lifecycle stage; the
  admin mount serves any lifecycle stage (past + current + future).
- The "scoped parity" model the parity audit identified (admin =
  full back-office, POS = operator-scoped) directly matches the
  conceptual model's "Schedule scope = future appointments, narrow
  affordance set" framing.
- The audit's HIGH-severity un-materialize-context-hardcode finding
  acquires particular weight: un-materialize is a Today-scope
  affordance (Schedule has no job to un-materialize), but the dialog
  is mounted in BOTH scopes; the hardcode breaks the POS revert
  flow that Today scope relies on.

**Does the conceptual model change the finding's significance?**
The drift findings are still drift; the intentional ones are
correctly intentional. The conceptual model **does not invalidate**
the parity audit's 8/6/7 split. But the prioritization of the HIGH
severity un-materialize fix is reinforced — un-materialize is a
core Today-scope affordance, and the dialog hardcode reaches into
the wrong host.

### F.5 — `f73661b7 / d6091ff3` Manual amount + no_show + parity overlap (`docs/dev/MANUAL_AMOUNT_AND_NO_SHOW_AUDIT.md`)

**Original findings:**

- **Issue 1** (manual amount): Sale-tab edit-mode silently drops
  `itemType='custom'` items. Today-scope checkout flow.
- **Issue 2** (no_show disappears): `confirmed → no_show` removes
  appointment from Schedule. Schedule-scope side effect.
- **Issue 2a** (filter label): "All Statuses" misleads because only
  3 actionable statuses exist on Schedule.

**Reframed:**
- Issue 1 is Today-scope concern (Sale-tab is reached from
  checkout, which is Today scope's terminal action). Conceptual
  model unchanged.
- Issue 2 is **the most directly conceptual-model-affected finding**.
  The Schedule endpoint's `EXCLUDED_STATUSES` is the conceptual
  model expressed as a filter — "Schedule shows only actionable
  upcoming rows; `no_show` rows are dead for this surface." The
  operator's "disappearance" complaint is a complaint about the
  conceptual model itself, not a bug. The fix decision (whether
  `no_show` should stay on Schedule) is **a conceptual-model
  decision**, not a tactical bug fix.
- Issue 2a is correctly a UI labeling bug — the dropdown should
  say "All Actionable Statuses" or list the three options without
  an "All" sentinel.

**Does the conceptual model change the finding's significance?**
Issue 2's classification shifts from "bug to fix" to "conceptual-
model decision the operator must make." Issue 2a is unchanged.

### F.6 — Cross-cutting: do the prior audits' fix queues need re-prioritization?

**Yes, but mildly.**

- The state-machine asymmetry (F.1) and the parity audit's
  un-materialize HIGH (F.4) get marginally higher priority because
  the Schedule scope is the canonical daily Schedule editing surface
  now.
- The manual-amount issue (F.5 Issue 1) is unchanged in priority.
- The no_show disappearance (F.5 Issue 2) gets **lower** priority
  as a "bug" and **higher** priority as a "conceptual-model
  decision."
- The Edit-in-POS fix (F.3) is already shipped and correctly scoped.

**The fix arcs themselves are not contradicted by the conceptual
model. They proceed against the same architecture. What changes
is the order and the framing of one finding (no_show as a model
decision, not a bug).**

---

## Target G — Open operator decisions

The audit does not pre-resolve any of these. They are the
operator's to lock; downstream fix planning depends on them.

### G.1 — Forward-arrow direction (E.1)

Should the Today scope's forward-arrow:

- (i) Stay as-is, accepting that it shows empty results for any
  future date (architecturally consistent, UX-misleading).
- (ii) Auto-route forward navigation past today INTO Schedule scope
  (one-way bridge — preserves the "navigate forward" gesture but
  delivers the right data).
- (iii) Be removed entirely past today (forward arrow disabled for
  dates ≥ tomorrow; "Switch to Schedule" prompt instead).
- (iv) Be redesigned to render `appointments` directly on future
  dates (collapses the scope distinction).

### G.2 — Schedule scope's `no_show` exclusion (E.3 / F.5 Issue 2)

Should the Schedule endpoint's `EXCLUDED_STATUSES` continue to
remove `no_show` rows from the result set?

- (i) Keep — `no_show` is dead-row for upcoming work (intentional).
- (ii) Remove — the operator wants to see no-show appointments on
  Schedule so they can take recovery action (reschedule prompt,
  customer outreach, lifecycle action).
- (iii) Keep but add a separate "Recent no-shows" panel.

### G.3 — Materialization timing (E.4)

Should the appointment → job materialization step be:

- (i) Stay on-demand only (current behavior — operator opens POS
  Jobs that day).
- (ii) Add a daily cron at e.g. 6:00 AM PST that materializes the
  day's confirmed/in_progress appointments.
- (iii) Eager-materialize on appointment booking (radical — moves
  the materialization step BEFORE the day-of, potentially undermining
  the 15e Phase 1A invariant).
- (iv) Eager-materialize n hours before the appointment's
  scheduled_start_time (smoother but adds clock logic to populate).

### G.4 — POS > Appointments tab status (E.5 / C.5)

Item 15e recommended retire + absorb. The Schedule scope is the
intended replacement. Should the POS > Appointments tab be:

- (i) Retired now (delete the nav entry; route `/pos/appointments`
  to `/pos/jobs?scope=schedule`).
- (ii) Soft-deprecated (banner + redirect, then nav entry removed in
  a later session).
- (iii) Kept as-is (defer the Phase 3 retire indefinitely).
- (iv) Repurposed (different framing, not just retire).

### G.5 — Scope toggle name / discoverability (B.1 / B.2)

The toggle currently shows "Today" and "Schedule" pills above the
date nav (when flag-enabled). Are these labels right? Alternative
framings the operator may want to consider:

- (i) Keep "Today / Schedule" — matches the conceptual model.
- (ii) "Today / Upcoming" — matches the Item 15e Phase 1B design
  name + maps to operator vocabulary.
- (iii) "Active / Upcoming" — matches the lifecycle vocabulary.
- (iv) Other.

### G.6 — The "Past/Future date indicator" banner (B.1)

The blue "Upcoming — [date]" banner at `job-queue.tsx:877-881`
appears in Today scope when navigating to a future date. It does
not warn the operator the list will be empty. Should it:

- (i) Stay as-is (no signal).
- (ii) Add an explanation ("Future appointments live in Schedule
  view — switch to see them").
- (iii) Add a CTA button (navigate to Schedule scope with date
  pre-selected).
- (iv) Become irrelevant if G.1 (forward-arrow direction) is
  resolved.

### G.7 — Edit-in-POS button on Today-scope job-detail (F.3 follow-on)

Today scope's `<JobDetail>` for a materialized job has the
checkout/ticket-restore flow as the canonical edit path. Does the
"Edit in POS" button render there too? If yes, is the deep-link
redundant with checkout? **Verification pass — not a decision
yet.**

### G.8 — Whether to consolidate fix arcs

The day's audit pile (`b0efd95f` / `d3671c82` / `d1eb1e24` /
`b346d34b` / `f73661b7`) and this conceptual audit overlap in
scope. Should the operator:

- (i) Hold all fix arcs until G.1-G.6 are decided, then plan one
  combined fix arc.
- (ii) Ship the unambiguous fixes (parity audit drift, state-machine
  source-of-truth) now; hold the conceptual-model-dependent ones
  (no_show, forward-arrow, scope toggle).
- (iii) Plan each fix arc against the conceptual-model-as-is
  (status quo); revisit only if a model decision changes.

---

## Architectural attribution

The conceptual model in this audit is not new — it is the model
**Item 15e Phase 1A** locked on 2026-05-27 in
`docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md`. What is
new is the operator's mental model coming into contact with the
architecture and surfacing the **forward-arrow** as the seam where
expectations and code diverge. The forward-arrow has existed since
Phase 8 (2026-02-12) and survived every subsequent session
including the entire Item 15e arc and the #146 flag flip. Its
behavior was never explicitly redesigned; it was implicitly
neutered for future dates by the populate-gate.

The operator's framing — "I'm getting confused and I feel like we
are building without a real structured plan" — is **accurate as
applied to the Today forward-arrow specifically.** Item 15e Phase 1
had a structured plan for Schedule scope; it did not have one for
the Today forward-arrow under that new architecture. That blind
spot is what the operator is sensing.

This audit makes the blind spot visible. The fix is the operator's
to direct.

---

## File:line reference index

For navigation back to evidence:

| Topic | Path |
|---|---|
| Today data fetch (jobs query) | `src/app/api/pos/jobs/route.ts:15-141` |
| Today walk-in fallback | `src/app/api/pos/jobs/route.ts:71-94` |
| Today's excluded statuses (cancelled only) | `src/app/api/pos/jobs/route.ts:47` |
| Schedule data fetch (appointments query) | `src/app/api/pos/jobs/schedule/route.ts:35-173` |
| Schedule's hard future floor | `src/app/api/pos/jobs/schedule/route.ts:82-90` |
| Schedule's excluded statuses (cancelled, no_show, completed) | `src/app/api/pos/jobs/schedule/route.ts:12, :114` |
| Schedule's materialization de-dup | `src/app/api/pos/jobs/schedule/route.ts:131-141` |
| Populate (materialize) endpoint + future-date guard | `src/app/api/pos/jobs/populate/route.ts:12-194` (guard at `:42-47`) |
| Lifecycle-sync seam (un-materialize) | `src/lib/appointments/lifecycle-sync.ts:1-368` |
| Today's forward-arrow chevron | `src/app/pos/jobs/components/job-queue.tsx:862-868` |
| Today's "Upcoming — [date]" banner | `src/app/pos/jobs/components/job-queue.tsx:877-881` |
| Scope toggle (Today/Schedule pills) | `src/app/pos/jobs/components/job-queue.tsx:792-820` |
| Scope toggle flag gate | `src/app/pos/jobs/components/job-queue.tsx:269-285` |
| Scope-Today init effect | `src/app/pos/jobs/components/job-queue.tsx:711-723` |
| Scope-Schedule init (fetchSchedule) | `src/app/pos/jobs/components/job-queue.tsx:607-625, 711-718` |
| Schedule's date-range envelope helper | `src/lib/utils/schedule-date-range.ts` |
| Schedule's date pills component | `src/app/pos/jobs/components/schedule-pill-row.tsx` |
| Schedule's per-row filter predicate | `src/lib/utils/schedule-entry-matches.ts` |
| Schedule card → dialog open | `src/app/pos/jobs/components/job-queue.tsx:631-708, 1221-1252` |
| Today card → JobDetail open | `src/app/pos/jobs/page.tsx:322-327` |
| POS bottom nav (Jobs + Appointments tabs) | `src/app/pos/components/bottom-nav.tsx:195-206` |
| Item 15e Phase 1 invariant doc | `docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md` |
| Schedule filter UX design doc | `docs/dev/POS_SCHEDULE_FILTER_UX_DESIGN.md` |
| Flag-flip pre-flight | `docs/dev/POS_JOBS_UNIFIED_SCHEDULE_FLAG_FLIP_PREFLIGHT.md` |
| Flag-flip migration (today) | `supabase/migrations/20260603000000_enable_pos_jobs_unified_schedule.sql` |
| State-machine audit | `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` |
| Consequence map audit | `docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md` |
| Edit-in-POS button audit | `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md` |
| Parity audit | `docs/dev/ADMIN_POS_DIALOG_PARITY_AUDIT.md` |
| Manual amount + no_show audit | `docs/dev/MANUAL_AMOUNT_AND_NO_SHOW_AUDIT.md` |
