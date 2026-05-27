# Item 15e — POS Jobs Unified Operations View Audit (2026-05-27)

> Read-only diagnostic audit. NO source code changes, NO migrations, NO test
> changes. Surfaces evidence for operator decisions before Item 15e (new
> framing) fires. Produces options for Target 12 — the operator locks the
> decisions; this audit recommends leanings with evidence.

## Context

This is the **second** audit for Item 15e, written under a reframed scope.

- The **first** audit (2026-05-27, session #98, merge `1927d4b2`) framed Item
  15e as **"POS Appointments Modal Capability Parity with Admin"** — close the
  gap between the POS Appointments tab's 5-capability reschedule/cancel surface
  and the Admin Appointment Detail Dialog's 26 capabilities. It is preserved,
  renamed, at `docs/dev/ITEM_15E_ADMIN_APPOINTMENT_CAPABILITY_REFERENCE.md`.
- Within minutes of that merge, the operator **reframed** the item (session
  #99 reframing prep, merge `21436695`): the POS Appointments tab is "not
  truly functional" and should be **retired and absorbed** into an expanded
  **POS Jobs** surface, which becomes the canonical day-of operations view
  where booked appointments, walk-ins, and jobs coexist. Item 15d ("Today's
  Tickets" Combined View) was **absorbed** into 15e in the same reframe.

This audit answers the reframed questions. It **references** the preserved
capability inventory (Admin's 26 capabilities, the shared-helper map, the D48
interaction, the walk-in baseline — Targets 1, 3, 5, 8 of the reference doc)
rather than re-deriving them. It asks a **different** central question:

> Given how POS Jobs is already built, what does "unify appointments +
> walk-ins + jobs under POS Jobs" actually require — and should the POS
> Appointments tab be retired, completed, or kept as a slim schedule preview?

---

## TL;DR

**1. The unification is ~70–80% already built. POS Jobs is already the
day-of operations surface for both booked appointments and walk-ins.** The
single most important finding of this audit: at the data layer there is no
"three-type" problem to solve. Every POS job is backed by exactly one
`appointments` row (1:1 via `jobs.appointment_id`, nullable only for legacy
pre-Phase-0a rows — `supabase/migrations/20260212000003_phase8_jobs_schema.sql:10-47`).
A **walk-in is not a separate entity** — it is a synthetic `appointments`
row with `channel='walk_in'`, created eagerly by `POST /api/pos/jobs`
(`src/app/api/pos/jobs/route.ts:383-415`) alongside its job
(`:470-490`). Booked appointments become jobs via `POST /api/pos/jobs/populate`
when they reach `status IN ('confirmed','in_progress')`
(`src/app/api/pos/jobs/populate/route.ts:40-55`). The POS Jobs queue
**already renders booked-jobs and walk-in-jobs in one merged list** with an
origin badge — purple scheduled-time pill vs. amber "Walk-In" pill
(`src/app/pos/jobs/components/job-queue.tsx:654-665`). The job detail surface
(`src/app/pos/jobs/components/job-detail.tsx`, 1968 lines) **already exposes**
the rich capability set the first audit wanted to *add* to the Appointments
tab: status workflow (`:1410-1515`), mobile-service enable/edit via the shared
`<EditMobileModal mode='pos'>` (`:1120-1140`), `<ModifierSummary>` discount
display (`:984-1030`), `<PaymentMismatchBanner>` (`:1145-1152`), notes
(`:1214-1240`), customer/vehicle edit (`:1330-1403`), reassignment
(`:1541-1624`), payment-link send (`:1518-1525`), cancel (`:1529-1537`), and
the **same** `<RescheduleAppointmentDialog>` via `<ChangeTimeButton>`
(`:1171-1176`). The "parity gap" the first audit scoped against the
Appointments tab is, in large part, **already closed inside Jobs**.

**2. The real problem is duplication, not a missing surface.** POS has two
day-of surfaces that overlap (`bottom-nav.tsx:196-206` registers both `/pos/jobs`
and `/pos/appointments` as sibling tabs). The POS Appointments list shows
**all non-cancelled appointments with no channel filter**
(`src/app/api/pos/appointments/route.ts:83` — only `.neq('status','cancelled')`),
so a walk-in appears **simultaneously** in the Appointments tab (as a synthetic
appointment row) **and** in Jobs (as its job). A booked appointment for today,
once confirmed and populated, appears in **both** the Appointments tab and Jobs.
That double-surfacing is the operator's "not truly functional / confusing"
complaint. The Appointments tab's only **non-redundant** capability is the
**forward-looking, multi-day schedule view** (date presets: today /
today+tomorrow / 7d / month / custom — `appointments-view.tsx` header) — a
read-mostly "what's coming up" list that Jobs does not cleanly provide today
(Jobs is single-date-navigable and *materializes* jobs for whatever date you
land on via `populatedDates` dedup + populate — `job-queue.tsx:411-413`).

**3. Recommendation: RETIRE-and-ABSORB, with the forward-looking schedule
re-homed inside Jobs as an "Upcoming/Schedule" scope.** The operator's lean is
supported by the evidence: keeping two surfaces perpetuates the duplication,
and the day-of capability set already lives in Jobs. The single capability
that must be deliberately re-homed (not lost) is the multi-day forward schedule.
Recommended shape: POS Jobs gains a **date-scope toggle (Today / Upcoming)** or
a third view-mode (alongside the existing List / Timeline modes —
`job-queue.tsx:533-559`) where **future-dated appointments render directly from
the `appointments` table without being materialized into job rows**, offering
reschedule + cancel + a read-mostly detail; **day-of** continues to render
materialized jobs with the full job-detail surface. This collapses two tabs
into one with a clear "today's work" vs "upcoming schedule" distinction.

**4. There is no "three coequal types" model — there are two orthogonal
facets.** Framing the model as appointments + walk-ins + jobs is a false
trichotomy given the schema. The unified entity is the **job/appointment pair**.
It has two independent facets: an **origin** facet (booked vs walk-in —
`appointments.channel`) and a **lifecycle** facet (upcoming → active → awaiting
payment → done/cancelled — `jobs.status`). The recommended view model is
**lifecycle-segmented with an origin badge + origin filter**, which is close to
what Jobs already does. POS operates on `jobs.status` as the operational
status; `appointments.status` is the booking-lifecycle mirror — this
distinction matters for Targets 4 and 5.

**5. The detail surface should be ONE polymorphic view — the existing
`job-detail.tsx`, extended — not a new `<PosAppointmentDetailDialog>` and not
three specialized dialogs.** Because job-detail already handles booked and
walk-in jobs with channel-aware affordances (`isWalkIn` at `job-detail.tsx:681`
gates cancel-notification flow at `:861, :1689`), the unification's "detail
modal" is a *generalization of job-detail*, not a new component. The first
audit's recommended `<PosAppointmentDetailDialog>` is now **redundant** — that
recommendation (Target 9 of the reference doc) is obsoleted by the reframe.
The only genuinely new detail need is a **slim read-mostly view for
upcoming-not-yet-materialized appointments** (reschedule/cancel only), which can
reuse the existing `<RescheduleAppointmentDialog>` + `<CancelAppointmentDialog>`.

**6. The D48 `quantity` fold-in target shifts.** The reference audit flagged
3 POS appointment endpoints needing `quantity` added to their
`appointment_services(…)` SELECT (still confirmed absent —
`src/app/api/pos/appointments/route.ts:79`, `[id]/route.ts:51`,
`[id]/reschedule/route.ts` response). But **job-detail renders `job.services`
JSONB (a snapshot)**, not `appointment_services`. So the quantity widening only
matters for the **upcoming-appointment** detail path (which reads
`appointment_services`), not the day-of job-detail path. This narrows the D48
relevance and is a Phase-scoping input (Target 5 + Target 12 #11).

**7. Workstream K coordination is lighter than it first appears, and fully
parallelizable.** WK's orphan problem is **POS receipt-send transactions** with
no customer association (ROADMAP `:375-422`) — a *transaction/receipt* surface
concern. POS **job** walk-ins already carry a `customer_id` at creation
(`route.ts:383-415` requires it). So Jobs unification and WK Sessions 2–4 touch
adjacent-but-distinct surfaces (Jobs detail → checkout → receipt-send, where WK
hooks in). They can proceed in **parallel**; the interface is the existing
`appointments.channel='walk_in'` + `customer_id` linkage. This audit proposes
the interface, not K's identity-resolution logic (per hard rule).

**8. Phasing: 5 phases, ~9–14 hours CC if retire wins.** Phase 0 decision lock
→ Phase 1 forward-schedule scope in Jobs (the one real gap) → Phase 2
reschedule/cancel/detail on upcoming rows → Phase 3 nav retirement +
soft-deprecation → Phase 4 WK touchpoints (parallelizable) → Phase 5
verification + ROADMAP closure. **~13 operator decisions surfaced in Target 12**
— 4 substantive (retire-vs-complete-vs-hybrid lock; forward-schedule home;
detail surface generalization; naming), the rest minor.

---

## Phase 0 — Retire-vs-Complete decision (Target 0)

This is the load-bearing decision. The audit evaluates three options against
evidence, then states a lean.

### Current reality (the evidence base)

| Fact | Evidence |
|---|---|
| Jobs and Appointments are **separate tabs** in the POS footer nav | `src/app/pos/components/bottom-nav.tsx:196-200` (Jobs) + `:201-206` (Appointments) |
| A job is **always** 1:1 with an appointment (legacy nulls aside) | `jobs.appointment_id` FK, `supabase/migrations/20260212000003_phase8_jobs_schema.sql:10-47`; GET join `src/app/api/pos/jobs/route.ts:37-45` |
| Walk-ins are **synthetic appointments** (`channel='walk_in'`), not a separate table | `src/app/api/pos/jobs/route.ts:383-415` (INSERT), `:470-490` (job link); no `walkins` table, no `/api/walkins/` dir |
| Booked appointments **auto-materialize** into jobs when confirmed | `src/app/api/pos/jobs/populate/route.ts:40-55` (`status IN ('confirmed','in_progress')`); UNIQUE on `appointment_id` makes it idempotent |
| Jobs queue **already merges** booked + walk-in jobs with an origin badge | `job-queue.tsx:654-665` (purple scheduled pill vs amber "Walk-In" pill) |
| Job detail **already exposes** status / mobile / modifier / payment-mismatch / notes / customer-vehicle / reassign / payment-link / cancel / change-time | `job-detail.tsx:1410-1515, 1120-1140, 984-1030, 1145-1152, 1214-1240, 1330-1403, 1541-1624, 1518-1525, 1529-1537, 1171-1176` |
| POS Appointments tab exposes **only** reschedule (date/start/end/detailer) + cancel | `appointments-view.tsx` (row→reschedule dialog), `reschedule-appointment-dialog.tsx:142-187`, `cancel-appointment-dialog.tsx` |
| POS Appointments list shows **walk-ins too** (no channel filter) | `src/app/api/pos/appointments/route.ts:83` (`.neq('status','cancelled')` only) |
| Appointments tab's **unique** value is the forward-looking multi-day list | `appointments-view.tsx` date presets (today / +tomorrow / 7d / month / custom); Jobs is single-date-navigable (`job-queue.tsx:433-475`) |

### Option A — RETIRE + ABSORB (operator lean; audit lean ✅)

Retire the POS Appointments tab; POS Jobs becomes the single day-of operations
surface; the forward-looking schedule is re-homed inside Jobs.

- **Pros:** eliminates the double-surfacing of every walk-in and every
  populated booked appointment; one mental model ("everything happening, by
  day"); the day-of capability set already lives in Jobs; honors the canonical
  single-surface direction; removes a confusing near-duplicate.
- **Cons / required work:** the multi-day forward schedule must be re-homed in
  Jobs (the one capability Jobs lacks cleanly today); reschedule/cancel of
  *future* appointments must work **without** materializing them as jobs
  (otherwise navigating Jobs to a future date prematurely creates job rows —
  see Target 3 + Risk matrix); nav-retirement migration must not strand
  operators mid-workflow.
- **Cost:** ~9–14 hours CC across 5 phases (Target 9). Most of the *capability*
  work is already done; the spend is on the forward-schedule scope, the
  not-yet-materialized detail path, and the nav retirement.

### Option B — COMPLETE the Appointments tab (the reference audit's plan)

Build `<PosAppointmentDetailDialog>` on the Appointments tab to reach parity
with Admin (the first audit's 3-phase, ~6–9h plan).

- **Pros:** the reference audit already designed it; less conceptual change.
- **Cons:** **entrenches the duplication** — you'd have two full day-of detail
  surfaces (job-detail AND a new appointment-detail dialog) rendering
  overlapping data for the same underlying records; the walk-in double-surfacing
  remains; you maintain two surfaces forever; Item 15d's "one combined view"
  intent stays unmet. This directly contradicts the operator's reframed
  direction.
- **Cost:** ~6–9h to build the parity dialog, then the duplication tax is
  permanent.

### Option C — HYBRID (keep Appointments tab as a slim read-only schedule)

Keep the Appointments tab but **strip it to a forward-looking, read-mostly
schedule preview** (no day-of editing); POS Jobs owns all day-of operations +
editing.

- **Pros:** preserves a dedicated "upcoming schedule" surface without building
  a forward-schedule mode inside Jobs; smaller blast radius than full retire.
- **Cons:** still two tabs; still double-surfaces *today's* appointments (an
  upcoming row for today is also a job); the boundary "read-only here, editable
  there" is itself a source of operator confusion; doesn't deliver the "one
  surface" goal.
- **Cost:** ~3–5h (strip the tab to read-only, add a slim detail). Cheapest,
  but least aligned with the stated goal.

### Audit lean: **Option A (retire + absorb)** — with the explicit caveat that
the forward-looking multi-day schedule is a **real capability** that must be
re-homed inside Jobs (not dropped). The evidence supports retire: the
duplication is concrete and observable, the day-of capability set is already in
Jobs, and the only thing Appointments uniquely provides (the upcoming schedule)
is re-homeable as a Jobs scope/view-mode. Option C is the safe fallback if the
operator wants the smallest change; Option B is **not recommended** because it
permanently entrenches the very duplication the reframe set out to remove.

**Decision surfaced for lock: Target 12 #1.**

---

## Detailed findings per target

### Target 1 — POS Jobs current capability inventory

**Surfaces** (`src/app/pos/jobs/`):

| File | Lines | Role |
|---|---|---|
| `page.tsx` | 337 | Entry; routes queue ↔ detail via `?jobId=`; restores ticket context on checkout |
| `components/job-queue.tsx` | 754 | Host list/timeline; date nav; polling; filters; card affordances |
| `components/job-detail.tsx` | 1968 | Full day-of detail surface (the de-facto unified detail view) |
| `components/job-timeline.tsx` | 814 | Calendar/timeline view; draggable reschedule |
| `components/change-time-button.tsx` | 151 | Reschedule affordance → reuses `<RescheduleAppointmentDialog>` |
| `components/flag-issue-flow.tsx` | 893 | Addon creation |
| `components/job-timer.tsx` | 127 | Timer control |
| `components/zone-picker.tsx` / `photo-*.tsx` | — | Intake/progress/completion photo capture |

**Host view (`job-queue.tsx`):**
- Dual view-mode (List `:577-750` / Timeline `:562-575`), persisted to
  localStorage; toggle at `:533-559`.
- Single-date navigation (prev/next/date-picker/Today) at `:433-475`, synced to
  `?date=`.
- Filter pills: All / My Jobs / Unassigned at `:514-531`.
- "New Walk-in" button (gated on `canCreateWalkIn`) at `:421-429`, routes to the
  quote builder in walk-in mode.
- Polling: 5s active / 60s past (`:213-214`); change-highlight ring (`:328-331`).
- Card shows: customer + vehicle (`:629-636`), services + total (`:638-648`),
  **origin badge** (scheduled-time purple vs Walk-In amber, `:654-665`), status
  badge (`:666-668`), pickup/overdue (`:670-679`), timer (`:686-696`), photo
  progress (`:697-702`), addon status (`:707-716`), assignee (`:719-723`),
  checkout button / Paid badge (`:726-744`).

**Detail view (`job-detail.tsx`) — capability inventory** (parallels the
Admin Appointment Dialog inventory in the reference doc Target 1):

| # | Capability | Evidence | In Admin Dialog? |
|---|---|---|---|
| 1 | Status workflow: Start Intake → Start Work → Complete → Checkout/Close-out | `:1410-1505` | partial (Admin sets `appointment.status`; Jobs drives `job.status` workflow) |
| 2 | Cancel job (channel-aware: walk-in immediate vs appointment notify-flow) | `:1529-1537`, `:665-735`, `:1627-1696` | ✓ (via cancel dialog) |
| 3 | Send payment link (amount → channel modal) | `:1518-1525`, `:1720-1743` | ❌ (Admin has no payment-link) |
| 4 | Mobile-service display + enable/edit via `<EditMobileModal mode='pos'>` | `:1042-1140` | ✓ |
| 5 | Modifier summary (coupon/loyalty/manual) via `<ModifierSummary>` | `:984-1030` | ✓ |
| 6 | Payment-mismatch banner via `<PaymentMismatchBanner>` | `:1145-1152` | ✓ |
| 7 | Notes (`intake_notes`) edit | `:1214-1240` | ✓ (job + internal notes) |
| 8 | Customer edit (CustomerLookup) | `:1330-1356` | ✗ (Admin readonly) |
| 9 | Vehicle edit / link / create | `:1377-1393` | ✗ (Admin readonly) |
| 10 | Reassign detailer | `:1541-1624` | ✓ |
| 11 | Change time (reschedule) via `<ChangeTimeButton>` → `<RescheduleAppointmentDialog>` | `:1171-1176` | ✓ |
| 12 | Timer display (work_started/completed) | `:1195-1210` | ✗ |
| 13 | Photo capture (intake/progress/completion zones) | zone-picker flow | ✗ |
| 14 | Addon flag-issue + resend | `:1243-1317`, `:1451-1458` | ✗ |
| 15 | Walk-in detection (`isWalkIn`) gating cancel/notify | `:681`, `:861`, `:1689` | n/a (channel pill only) |

**Data model — the critical finding:** A **Job** (`jobs` table) is the
POS-facing **work execution** record; an **Appointment** (`appointments` table)
is the **booking** record. They are **different rows, 1:1 linked** via
`jobs.appointment_id`. `jobs.status` (`scheduled → intake → in_progress →
pending_approval → completed → closed → cancelled`) is the **operational**
status POS drives; `appointments.status` (`pending → confirmed → in_progress →
completed → cancelled`) is the booking-lifecycle mirror. The jobs FK is
nullable only for **legacy pre-Phase-0a** walk-ins
(`src/app/api/pos/jobs/route.ts:66-79` fallback branch). `job.services` is a
**JSONB snapshot** (`migration :10-47`), distinct from `appointment_services`
join rows — relevant to Target 5's D48 analysis.

### Target 2 — Walk-in current handling

- **Origination:** `POST /api/pos/jobs` (`route.ts:147-536`). It **eagerly
  creates a synthetic appointment** with `channel='walk_in'`, `status='in_progress'`,
  today's date, and a required `customer_id` (`:383-415`), then links a job to
  it (`:470-490`). Comment at `:341-415`: *"Phase 0a: eager appointment creation
  for walk-ins … jobs.appointment_id is always non-null."* Entry point: the
  "New Walk-in" button (`job-queue.tsx:421-429`) → quote builder in walk-in mode.
- **Representation:** **NOT a separate table.** Walk-in = `appointments` row
  with `channel='walk_in'`. Modifier snapshot (coupon/loyalty/manual discount)
  carried from quote at creation (`route.ts:365-379`, Item 15g Layer 15g-ii).
- **Surfacing today:** walk-in jobs appear in the **Jobs queue** with the amber
  "Walk-In" badge (`job-queue.tsx:660-664`); walk-in appointments **also**
  appear in the **POS Appointments tab** (no channel filter,
  `appointments/route.ts:83`) rendered identically to booked rows — the
  double-surfacing. Admin dashboard counts them (`src/app/admin/page.tsx:221`);
  Admin calendar shows a channel pill (`day-appointments-list.tsx`).
- **`channel === 'walk_in'` checks:** `job-detail.tsx:681` (`isWalkIn` —
  no appointment_id OR channel walk_in), gating cancel-notify suppression at
  `:861, :1689`; the synthetic INSERT at `pos/jobs/route.ts:390`; admin
  dashboard `:221`; admin dialog channel label; quote→job forwarding in
  `quote-ticket-panel.tsx`; refund sibling logic in `refund-summary.tsx`.
- **Workstream K (ROADMAP `:375-422`):** orphan problem = **POS receipt-send
  transactions** with no CRM association (7 of 9 orphans were receipt sends).
  Session 1 = read-only diagnostic (⚪ not started). Sessions 2–4 = at-sale
  identity resolution (receipt-send flow), retroactive admin tooling, SMS-reply
  customer creation. **All ⚪ not started.** Note: WK targets *transaction*
  orphans, whereas POS **job** walk-ins already carry `customer_id` — the two
  concerns are adjacent, not identical (see Target 7).

### Target 3 — Three-type unified data model

**There is no three-type problem.** The schema collapses it to one entity (the
job/appointment pair) with two orthogonal facets:

- **Origin facet** — booked vs walk-in (`appointments.channel`).
- **Lifecycle facet** — upcoming → active → awaiting-payment → done/cancelled
  (`jobs.status`).

The brief's four candidate view models, evaluated:

| Model | iPad usability | Discoverability | Data-shape cost | Verdict |
|---|---|---|---|---|
| **Filter pills** (All / Appts / Walk-ins / Jobs) | good | medium — "Jobs" vs "Appts" pills reinforce the false trichotomy | low (already have filter infra `job-queue.tsx:514-531`) | partial — keep an **origin** filter (booked/walk-in), drop the type framing |
| **Segmented sections** (Upcoming / Active / Walk-ins) | medium (vertical scroll on iPad portrait) | high | low | mixing a lifecycle section (Upcoming/Active) with an origin section (Walk-ins) is incoherent |
| **Status/lifecycle list** (Scheduled / In-Progress / Awaiting Payment / Done) | good | high — matches operator mental model ("what needs doing") | low (status already on the card `:666-668`) | ✅ **recommended spine** |
| **Time-based** (by time-of-day, type tags) | good (already the Timeline mode `:562-575`) | medium | low | keep as the existing Timeline view-mode option |

**Recommendation:** lifecycle-segmented list (status spine) + an **origin badge**
(already at `:654-665`) + an **origin filter** (booked / walk-in / all), plus a
**date-scope** control distinguishing **Today** (materialized jobs) from
**Upcoming** (future appointments rendered directly, not materialized). Keep the
Timeline view-mode for time-of-day scanning. This is an evolution of the
existing queue, not a rebuild. **Decision: Target 12 #2.**

### Target 4 — Detail surface architecture

**Recommendation: ONE polymorphic surface = the existing `job-detail.tsx`,
generalized — not a new `<PosAppointmentDetailDialog>`, not three dialogs.**

- job-detail already handles **booked + walk-in** jobs with channel-aware
  affordances (`:681, :861, :1689`). It is *already* the polymorphic detail
  surface; the first audit's `<PosAppointmentDetailDialog>` recommendation is
  obsoleted by the reframe.
- **Shared fields across all rows:** customer, vehicle, services, total/deposit/
  balance (`amount_due_cents` computed at `pos/jobs/[id]/route.ts`), modifiers,
  mobile-service, channel/origin, schedule (date/time/detailer), notes.
- **Lifecycle-specific affordances:** *upcoming* (not yet a job) → reschedule +
  cancel + read-mostly detail; *active* (materialized job) → the full
  intake/work/complete/payment/addon surface; *done/closed* → readonly + receipt.
- **The one genuinely new need:** a **slim detail for upcoming-not-yet-
  materialized appointments**. Two sub-options:
  - **A (recommended):** reuse `<RescheduleAppointmentDialog>` +
    `<CancelAppointmentDialog>` + a read-mostly info panel for upcoming rows;
    **lazy-materialize** the job (run populate for that appointment) only when
    the operator starts day-of work. Keeps job rows from being created days
    early.
  - **B:** build a thin `<PosUpcomingAppointmentDetail>` panel. More code; only
    warranted if the upcoming view needs richer editing than reschedule/cancel.

**Polymorphic > specialized** because: (a) job-detail is already polymorphic;
(b) three dialogs triples maintenance and re-introduces the duplication;
(c) the shared-field surface dominates the type-specific surface.
**Decision: Target 12 #3 + #4.**

### Target 5 — Shared-helper reuse map (delta from reference audit)

The reference audit (Target 3) listed 5 shared helpers + 1 needed extraction.
**Delta under the unified-Jobs framing:**

| Helper | Reference-audit status | Unified-Jobs delta |
|---|---|---|
| `<EditMobileModal mode='pos'\|'admin'>` | shared; "mount in new POS appt dialog" | **Already mounted in job-detail** (`:1120-1140`). No new work. |
| `<ModifierSummary variant>` | shared; "mount with variant='pos'" | **Already mounted in job-detail** (`:984-1030`). No new work. |
| `<PaymentMismatchBanner>` | shared; "mount" | **Already mounted in job-detail** (`:1145-1152`). No new work. |
| `<RescheduleAppointmentDialog>` | Item 15c canonical narrow path | **Already reused** by `<ChangeTimeButton>` in job-detail (`:1171-1176`) AND by the Appointments tab. Becomes the upcoming-row reschedule path post-retire. |
| `composeLineItems` / `attachTierMetaToItems` / `renderTierToken` | "adopt in new POS detail modal" | **Re-targeted:** job-detail renders `job.services` JSONB, not `appointment_services`. Tier rendering applies to the **upcoming-appointment** detail (which reads `appointment_services`), not day-of job-detail. |
| `formatChannelLabel(channel, 'pos')` | "adopt in row card + modal" | Still applies — origin badge already distinguishes walk-in (`:654-665`) but via `scheduledTime` presence, not the shared label; adopting `formatChannelLabel` would make it channel-accurate. Minor. |
| `appointmentUpdateSchema` (`validation.ts:491`) | new POS PATCH wraps it | Relevant **only if** the unified surface edits `appointment.status/notes`. POS edits `job.status` + `intake_notes` instead — so this may be **out of scope** unless upcoming-appointment status editing is wanted (Target 12 #9). |
| `update-appointment.ts` extraction (admin PATCH `:11-187`) | **NEW work** — extract + POS sibling | **Possibly unneeded** under retire framing: the day-of surface drives `job.status` (existing `PATCH /api/pos/jobs/[id]`), not `appointment.status`. The extraction is only needed if upcoming-appointment editing requires the admin appointment PATCH semantics. **Re-scope decision: Target 12 #9.** |
| `STATUS_TRANSITIONS` (admin types path) | lift to lib | Relevant only if POS edits `appointment.status`. Likely **moot** for `job.status` (job has its own workflow). |

**D48 quantity widening:** still confirmed absent from the 3 POS appointment
endpoints (`appointments/route.ts:79`, `[id]/route.ts:51`, reschedule response),
but its relevance is **narrowed** to the upcoming-appointment detail path
(`appointment_services` render), not day-of job-detail (`job.services` JSONB).
Fold it into the phase that builds the upcoming detail, if that path renders a
tiered services list. **No new extractions required for the core retire path** —
the heavy reuse is already in place inside job-detail. **This is the single
biggest delta from the reference audit:** most of its "NEW work" (extraction,
new dialog, helper mounting) is already done or re-scoped away.

### Target 6 — Service-edit affordance in unified Jobs

Item 15f Layer 8e established **POS as the canonical service editor** (bespoke
modals deleted; service editing routes through the POS Sale/ticket flow). In
the unified Jobs world the operator is **already inside POS**, so:

- **Recommended:** service editing for a day-of job stays on the **existing
  checkout→ticket-context path** (`page.tsx` restores ticket context from
  `/api/pos/jobs/[id]/checkout-items`; the register is the canonical editor).
  No new deep-link is needed — a self-referential `/pos?source=appointment…`
  from within POS is awkward. The affordance is "Edit in Sale" routing to the
  register with the job's items pre-loaded (mechanism already exists).
- This **differs** from the reference audit's Target 6 answer (which proposed an
  Admin-style deep-link button) precisely because, in the unified context, the
  operator never left POS. **Decision: Target 12 #5.**

### Target 7 — Workstream K coordination

- **Surfaces barely overlap.** WK's orphans are **receipt-send transactions**
  (ROADMAP `:375-422`); POS **job** walk-ins already carry `customer_id` at
  creation (`pos/jobs/route.ts:383-415`). So Jobs unification does **not** need
  to solve WK's orphan problem.
- **Proposed interface (not K's logic):** the unified Jobs surface reads
  `appointments.channel` + `appointments.customer_id`. If a walk-in ticket ever
  presents without a real customer (placeholder), Jobs renders an "identify
  customer" affordance that **invokes whatever resolution flow WK Session 2
  builds** in the checkout/receipt path. Jobs provides the *entry point*; K
  provides the *resolution*.
- **Dependency order: none hard.** Recommend **parallel** execution. WK ships
  identity resolution in the receipt/checkout flow; Jobs unification ships the
  day-of surface. The soft coordination point is the walk-in badge/indicator
  (already present at `job-queue.tsx:660-664`). **Neither blocks the other.**
- **Hard rule honored:** this audit does **not** pre-design K's identity
  resolution. **Decision: Target 12 #10.**

### Target 8 — Admin Appointments page interaction (what stays in Admin)

Admin Appointments page is **NOT** going away. Boundary map:

| Capability | Admin Appointments | Unified POS Jobs |
|---|---|---|
| Month/calendar grid, multi-day planning | ✅ stays Admin | ❌ (POS gets Today/Upcoming scopes, not a full month grid) |
| Cancellation **fee** / `waive_fee` | ✅ Admin-only (`pos/.../cancel/route.ts:33-34` locks it out of POS) | ❌ (locked out, Item 15b) |
| Bulk operations, audit-log views, purge, permissions | ✅ Admin-only | ❌ |
| Status / notes / reschedule / cancel of a single appointment | ✅ | ✅ (day-of via job; upcoming via reschedule/cancel) |
| Service editing | deep-links **to POS** (Item 15f Layer 8e) | native (ticket flow) |
| Historical / past-date browsing | ✅ Admin | partial (Jobs date-nav to past, read-mostly) |

- **Does Admin deep-link to POS Jobs for anything new?** Not required. Admin →
  POS deep-link stays **service-edit only**. No new Admin→Jobs deep-link
  proposed. **Decision: Target 12 #12 (optional).**

### Target 9 — Implementation phasing

**If RETIRE wins (recommended):**

| Phase | Scope | Est. CC | Files (scope) | Depends on | Test scope | Operator UAT |
|---|---|---|---|---|---|---|
| **0** | Decision lock (this audit) + retire plan sign-off | — | docs only | — | — | review audit |
| **1** | Add **date-scope** to Jobs (Today vs Upcoming); render future appointments **directly from `appointments`** without materializing jobs; gate `populate` to today/active only | ~2.5–3.5h | `job-queue.tsx`, `pos/jobs/page.tsx`, possibly a new `GET /api/pos/jobs/upcoming` or reuse `GET /api/pos/appointments` with a today-floor | Phase 0 | +10–16 vitest (scope toggle, no-materialize invariant, date floor) | navigate Jobs → Upcoming shows future appts; navigating does NOT create job rows |
| **2** | Reschedule + cancel + slim read-mostly detail on **upcoming** rows (reuse `<RescheduleAppointmentDialog>` + `<CancelAppointmentDialog>`); lazy-materialize on "start work"; D48 quantity fold-in **if** upcoming detail renders tiered services | ~2.5–3.5h | `job-queue.tsx`, new `pos-upcoming-detail` (slim) or dialog reuse, 3 appt-endpoint SELECT widenings (D48), `types.ts` | Phase 1 | +12–18 (upcoming reschedule/cancel, lazy-materialize, quantity render) | reschedule a future appt from Jobs; cancel it; start work → it becomes a job |
| **3** | **Retire** the Appointments tab: soft-deprecate (banner → repoint `/pos/appointments` → `/pos/jobs?scope=upcoming`) → remove the nav tab; feature-flag the unified scope | ~1.5–2.5h | `bottom-nav.tsx:201-206`, `pos/appointments/page.tsx` (redirect), feature flag | Phase 2 | +6–10 (redirect, flag-gating, nav) | Appointments tab gone (or redirects); everything reachable from Jobs |
| **4** | WK touchpoints: walk-in "identify customer" entry point in Jobs (invokes WK Session 2 resolution); **parallelizable** with WK | ~1–2h | `job-detail.tsx` (entry point only), coordinate with WK | none hard (parallel) | +4–8 | walk-in ticket shows identify affordance; resolution round-trips |
| **5** | Verification + cross-surface parity + iPad portrait/landscape + ROADMAP closure | ~1.5–2h | tests + 3 doc updates | Phases 1–4 | +8–12 integration | full UAT script (below) |

**Total: ~9–14h CC across 5 phases.** Each implementation phase must respect
Memory #8 (split sessions >300 lines / >3 files) — Phases 1, 2, 5 will likely
each be their own session.

**If COMPLETE wins:** revert to the reference audit's 3-phase ~6–9h plan
(`ITEM_15E_ADMIN_APPOINTMENT_CAPABILITY_REFERENCE.md` Target 9) — build
`<PosAppointmentDetailDialog>` on the Appointments tab — and accept permanent
two-surface duplication. **Not recommended.**

### Target 10 — Migration strategy (if retire)

- **No data migration needed.** Nothing lives "only in" the Appointments view —
  it reads the shared `appointments` table that Jobs also uses. Retiring the
  tab is a **UI/nav** change, not a data change.
- **Soft-deprecation sequence (recommended):**
  1. Ship the unified Jobs scope behind a **feature flag** (`business_settings`,
     `isFeatureEnabled()`); operators can opt in.
  2. Add an info banner on the Appointments tab: "Appointments now live in
     Jobs → Upcoming."
  3. Repoint `/pos/appointments` to redirect to `/pos/jobs?scope=upcoming`
     (route-level redirect; keeps any bookmarks/muscle-memory working).
  4. Remove the Appointments nav entry (`bottom-nav.tsx:201-206`) once adoption
     is confirmed.
- **Hard removal in one ship is NOT recommended** — operators have muscle memory
  for the tab; the redirect step prevents a jarring "tab vanished" moment.
- **Decision: Target 12 #6 (flag + soft-deprecate vs hard remove).**

### Target 11 — Verification plan

**Phase 1 (date-scope, no premature materialization):**
- Navigate Jobs → Upcoming → future appointments listed; **assert zero new
  `jobs` rows created** for those future dates (the critical invariant).
- Today scope still shows materialized jobs with full detail.

**Phase 2 (upcoming editing):**
- Reschedule a future appointment from Jobs Upcoming → `PATCH
  /api/pos/appointments/[id]/reschedule` fires; `notification_suppressed:true`
  audit row (`reschedule/route.ts:189-208`); list updates inline.
- Cancel a future appointment → `POST /api/pos/appointments/[id]/cancel`;
  notify-off default honored.
- "Start work" on an upcoming row → job lazily materializes (populate for that
  one appointment) → full job-detail opens.
- Tiered services render quantity correctly **if** D48 fold-in lands.

**Phase 3 (retirement):**
- Feature flag OFF → old Appointments tab still present (rollback safety).
- Flag ON → `/pos/appointments` redirects to `/pos/jobs?scope=upcoming`; nav
  tab removed.

**Phase 4 (WK):**
- Walk-in ticket renders "identify customer" entry point; invoking it reaches
  WK's resolution flow (mocked until WK Session 2 ships).

**Phase 5 (cross-surface + iPad):**
- Admin Appointment Dialog edit vs POS Jobs edit produce identical DB state for
  the same input (cross-surface parity).
- iPad **portrait** (single-column) and **landscape** (2-col) layouts both
  usable; tap targets ≥ 44px (consistent with `job-queue.tsx:437` h-11 nav
  buttons).

### Target 12 — Open operator decisions

| # | Decision | Audit lean | Rationale |
|---|---|---|---|
| 1 | **Retire vs Complete vs Hybrid** (Phase 0 lock) | **Retire + absorb** | Day-of capability already in Jobs; duplication is the real problem; only the forward schedule must be re-homed. |
| 2 | **View model** for the unified list | **Lifecycle-segmented + origin badge + origin filter + Today/Upcoming scope** | Matches operator mental model; evolves the existing queue. |
| 3 | **Detail surface**: extend job-detail (polymorphic) vs new dialog vs 3 dialogs | **Extend job-detail (polymorphic)** | Already polymorphic; avoids re-introducing duplication. |
| 4 | **Upcoming-appointment detail**: reuse reschedule/cancel + lazy-materialize, vs build a slim panel | **Reuse + lazy-materialize** | Less code; prevents premature job creation. |
| 5 | **Service-edit affordance**: ticket-flow "Edit in Sale" vs deep-link | **Ticket-flow (already canonical)** | Already inside POS; deep-link would be self-referential. |
| 6 | **Migration**: feature-flag + soft-deprecate + redirect vs hard remove | **Flag + soft-deprecate + redirect** | No data migration; protects operator muscle memory. |
| 7 | **Naming**: keep "Jobs", or rename to "Tickets" / "Operations" / "Today" | **Operator call** (lean: keep "Jobs" + scope labels) | "Jobs" is established; scope labels (Today/Upcoming) carry the new meaning. Renaming touches nav + docs + muscle memory. |
| 8 | **Origin filter** exposure (booked / walk-in / all) | **Yes, add it** | Cheap (filter infra exists `:514-531`); useful for scanning walk-ins. |
| 9 | **Appointment-status / notes editing in POS** at all? (drives whether `update-appointment.ts` extraction + `STATUS_TRANSITIONS` lift + `appointmentUpdateSchema` are needed) | **Lean: NOT needed** — POS drives `job.status`; appointment.status is the booking mirror | If operators never need to set `appointment.status` from POS, the reference audit's biggest "NEW work" items drop out entirely. **Confirm with operator.** |
| 10 | **WK ordering**: parallel vs sequential | **Parallel** | Surfaces are adjacent, not identical; neither blocks the other. |
| 11 | **D48 quantity fold-in** timing | **Only if upcoming detail renders tiered services; fold into Phase 2** | Day-of job-detail uses `job.services` JSONB, not `appointment_services`. |
| 12 | **Admin → POS Jobs deep-link** for anything beyond service-edit | **No** (keep deep-link service-edit-only) | No demonstrated need; avoids scope creep. |
| 13 | **Permission model**: Jobs uses `pos.jobs.*` + `appointments.*` (mixed); reconcile for the unified surface | **Mirror existing keys; do not invent new ones** | Upcoming reschedule/cancel keep `appointments.reschedule` / `appointments.cancel`; day-of keeps `pos.jobs.*`. Document the mapping. |

---

## Risk matrix

| Risk | Severity | Mitigation |
|---|---|---|
| **Premature job materialization** — navigating Jobs to a future date creates job rows via populate (`populatedDates` + populate, `job-queue.tsx:411-413`) | **High** | Phase 1 must gate `populate` to today/active dates; Upcoming scope reads `appointments` directly. Verification asserts zero new `jobs` rows for future dates. This is the central technical risk of retire. |
| Retiring the tab strands operators mid-workflow | Medium | Soft-deprecate: banner → redirect → remove (Target 10). Feature flag for rollback. |
| Losing the forward-looking multi-day schedule | Medium | Explicitly re-homed as the Upcoming scope (Phase 1). Not dropped. |
| Walk-in double-surfacing persists if only half-retired | Medium | Retire removes the Appointments tab entirely; walk-ins surface once (in Jobs). |
| WK coordination thrash if treated as sequential | Low | Declared parallel; interface = channel + customer_id; Jobs provides entry point only. |
| D48 quantity rendered in wrong path | Low | Scoped to upcoming-appointment detail (`appointment_services`), not job-detail (`job.services`). |
| iPad portrait layout regresses on a denser unified list | Medium | Phase 5 portrait/landscape UAT; reuse existing card layout that already works on iPad. |
| Permission-key drift (mixed `pos.jobs.*` + `appointments.*`) | Low | Mirror existing keys (Target 12 #13); no new keys. |
| `appointment.status` editing assumed but unwanted → wasted extraction work | Medium | Resolve Target 12 #9 **before** Phase 1 — it determines whether `update-appointment.ts` extraction is in scope at all. |

---

## Reference to capability inventory

This audit deliberately does **not** re-derive the Admin Appointment Dialog
capability inventory, the shared-helper catalog, the D48 surface list, or the
walk-in baseline. Those live in
`docs/dev/ITEM_15E_ADMIN_APPOINTMENT_CAPABILITY_REFERENCE.md`:

- **Target 1** — Admin Appointment Dialog: 17 mutable + 9 readonly = 26
  capabilities (`appointment-detail-dialog.tsx`).
- **Target 3** — shared-helper map (`<EditMobileModal>`, `<ModifierSummary>`,
  `<PaymentMismatchBanner>`, `composeLineItems`, `formatChannelLabel`, +
  `update-appointment.ts` extraction).
- **Target 5** — D45/D46/D47/D48 interactions (3 POS endpoints needing
  `quantity`).
- **Target 8** — Workstream K walk-in baseline.

The reference doc's **Targets 2, 6, 7, 9, 10, 11 are obsoleted** by this
reframe (per its own preamble) — most notably its `<PosAppointmentDetailDialog>`
recommendation and its 3-phase parity plan, both superseded here.

---

## Verification of audit hard rules

- [x] NO `src/` changes (read-only audit)
- [x] NO migrations
- [x] NO test changes
- [x] Only new file = this audit deliverable + 3 standard doc updates (CHANGELOG, ROADMAP, FILE_TREE)
- [x] Every finding cites `file:line` evidence
- [x] Target 12 surfaces options for the operator to lock, NOT a pre-picked plan
- [x] Phase 0 retire-vs-complete is evidence-based (not a deferral to operator)
- [x] Item 15f canonical service editor preserved (Target 6)
- [x] D43–D50 SMS-AI v2 architecture untouched
- [x] D45/D46 helpers recommended for reuse, not refactor
- [x] Workstream K coordination is collaborative + parallel (Target 7) — not "K stops" or "15e stops"
- [x] Does NOT pre-design Workstream K's identity resolution — proposes the interface only

## Captured for future (not Item 15e scope)

- **Legacy null-appointment walk-in branch** (`pos/jobs/route.ts:66-79`) can be
  retired once all pre-Phase-0a walk-ins close out — a cleanup follow-up, not
  15e work.
- **Origin badge keys off `scheduledTime` presence, not `channel`**
  (`job-queue.tsx:654-665`) — adopting `formatChannelLabel(channel,'pos')` would
  make it channel-accurate. Minor; fold into Phase 2 if convenient.
- **Admin Appointment Dialog tier-render + channel-label drift** — carried
  forward from the reference audit's "captured for future"; still out of 15e
  scope.
