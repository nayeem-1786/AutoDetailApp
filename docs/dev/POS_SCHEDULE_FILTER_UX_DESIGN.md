# POS > Jobs > Schedule — Filter UX Design

> Session #147, 2026-06-03. Read-only audit + design. Branch:
> `audit/pos-schedule-filter-ux-design`. Memory #29 type 3
> (Component Behavior).
>
> **Deliverable type:** design spec + per-session implementation plan.
> No code, no migrations, no tests written in this session.
> Operator approves the design + Target F decisions before any build
> session fires.

## Executive summary

The POS > Jobs > **Schedule** tab (post-#146 flag-flip) currently
ships zero filters and zero search — it renders all upcoming
appointments in a 30-day window as a flat card list. The Admin >
Appointments page (the parity reference) ships three filters
(search by name/phone, status single-select, detailer single-select)
plus a calendar/week-tabs date navigator on top of the same data
shape. This design ports the three filters to Schedule with one
iPad-tuned change (filter chrome becomes a **horizontal scroll bar of
large date-pill cards** instead of a calendar sidebar), and **two
load-bearing constraints inherited from the Schedule endpoint must
be honored**: (1) the endpoint clamps `from` to **tomorrow** —
"Today" is structurally not a Schedule-scope filter (it lives on
the Today scope and uses a different endpoint), and (2) the
endpoint excludes `completed | cancelled | no_show` server-side, so
the status dropdown has only **3 valid values** (`pending`,
`confirmed`, `in_progress`). The implementation plan splits the
build into **3 sessions** (~5 files / ~200-300 lines each, all
Memory #8 safe): Session N+1 ships the filter bar shell + date
pills (the bulk), N+2 ships the status + detailer dropdowns + the
debounced search input wired to the existing `useTableState` hook,
N+3 is optional polish (a11y, edge cases, contract tests).
Operator decisions in Target F are non-blocking nice-to-haves; one
(default-state on page load) DOES need locking before N+1 fires.

---

## Critical constraints discovered (read first)

Two constraints fall out of the Schedule endpoint
(`src/app/api/pos/jobs/schedule/route.ts`) that shape the entire
filter design. The operator's stated "Today, Tomorrow, This Week,
Next Week, This Month, Next 30 Days, Other" pill list MUST be
reconciled against them:

### Constraint X1 — "Today" is structurally not a Schedule filter

`schedule/route.ts:82-90` enforces a **hard future floor**:

```ts
// Hard floor: the Schedule scope is FUTURE-only. Even if a caller passes a
// `from` at/below today, clamp to tomorrow so this endpoint can never
// surface a today/past appointment (and so Phase 2's lazy-materialize can
// never be offered against one).
const effectiveFrom = from <= today ? addDaysPst(today, 1) : from;
if (effectiveFrom > to) {
  // Requested window is entirely today/past → nothing in the Schedule scope.
  return NextResponse.json({ data: [] });
}
```

This is a **load-bearing invariant of Item 15e Phase 1B** — the
Schedule scope is FUTURE-only; "Today" is owned by the Today scope
(which uses a different endpoint, `/api/pos/jobs`, and renders jobs,
not pre-materialized appointments). Adding a "Today" pill to the
Schedule filter UX would either (a) be a no-op because the server
clamps it away, or (b) require collapsing the Today/Schedule scope
distinction the 15e arc just shipped.

**Design resolution:** drop "Today" from the date-pill list. The
operator's verbal request for "Today" is satisfied by the existing
Today/Schedule scope toggle the user is already in
(`job-queue.tsx:641-668` — tapping "Today" pulls them out of the
Schedule scope into the Today scope, which IS the today view). If
the operator wants both side-by-side, that's a different
architectural change (combined "Today + upcoming" view) and is
explicitly out of scope here.

### Constraint X2 — Status dropdown has only 3 valid values

`schedule/route.ts:12` plus `:114`:

```ts
const EXCLUDED_STATUSES = ['cancelled', 'no_show', 'completed'];
// ...
.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
```

The Schedule endpoint **never returns** `completed`, `cancelled`,
or `no_show` appointments — those are not "actionable upcoming
rows" (the comment at `:11` puts it that way). The 3 status values
that CAN appear are: `pending`, `confirmed`, `in_progress`.

**Design resolution:** the status dropdown lists exactly those 3
(plus an "All Statuses" default), not the full 6 the Admin page
shows (`appointment-filters.tsx:39-45`). This is intentional, not
a parity gap — the Schedule scope is by-design future-actionable,
and excluded statuses are dead rows for this surface.

### Constraint X3 — Max date range is 31 days

`schedule/route.ts:8`:

```ts
const MAX_RANGE_DAYS = 31;
```

A request with `to - from > 31` is rejected with 400. The operator's
"This Month / Next Month / Next 30 Days" pills must all resolve to
ranges ≤ 31 days. "This Month" is at most 30 days (Apr/Jun/Sept/Nov)
or 31 (most others). Fits.

"Next Month" (which the operator did not explicitly request but
could be a future pill) would also fit. "This Year" or wider does
NOT fit and would require an endpoint change.

---

## Part 1 — Admin > Appointments: current behavior (TARGET A)

Primary file: `src/app/admin/appointments/page.tsx` (557 lines).

### A.1 — Page structure

- **Default view (calendar-permission users — super_admin, admin, cashier):** the page mounts with `currentMonth = new Date()` (`page.tsx:41`) and `selectedDate = new Date()` (`:42`). It fetches the **entire month's appointments** via direct browser-client Supabase query (`:129-190`), then renders a 2-column layout: schedule view on the left (Day/Week tabs), calendar sidebar on the right.
- **Default view (detailer-only users, no `appointments.view_calendar`):** the page shorts out at `:302-349` to show **today's appointments only** with no calendar — a simplified detailer surface.
- **Per-row fields rendered** (`day-appointments-list.tsx:64-101`): start-end time, status badge, channel pill ("Walk-In" / "Online" / etc.), customer name, services list, vehicle description, detailer name.
- **Sort order** (`day-appointments-list.tsx:40-42`): by `scheduled_start_time` ASC. Cancelled rows are intentionally NOT excluded — they show with a `destructive`-variant badge.
- **Pagination strategy:** none — the entire month renders in memory; `filteredAppointments` is a single `useMemo` (`:65-90`). Volume range is bounded by month size (~30-150 rows typical for Smart Details based on the business profile).

### A.2 — Filters present

Three filter affordances, all in `<AppointmentFilters>`
(`appointment-filters.tsx` — 63 lines):

| Filter | Component | File:line | Filters on |
| --- | --- | --- | --- |
| **Search** | `<SearchInput>` from `@/components/ui/search-input` | `appointment-filters.tsx:28-33` | Customer first+last name OR phone (string `includes`, lowercase, `page.tsx:80-87`) |
| **Status** | `<Select>` single-select dropdown | `appointment-filters.tsx:34-46` | `status` exact match; values: `all` / `pending` / `confirmed` / `in_progress` / `completed` / `cancelled` / `no_show` |
| **Detailer** | `<Select>` single-select dropdown | `appointment-filters.tsx:47-59` | `employee_id` exact match (or `unassigned` → `!a.employee_id`); options pulled from `employees` table (`page.tsx:192-200`) filtered to `status = 'active'` |

Filter state lives in three `useState` calls (`page.tsx:57-59`).
Filter logic runs in a single `useMemo` (`:65-90`) — all
client-side, all operating on the already-fetched
`appointments` array.

There is also a **calendar/Week-tabs date navigator** at the right
sidebar (`appointment-calendar.tsx`) — strictly a "pick a day to
view" navigator, not a filter. It changes `selectedDate`, which
drives `filteredSelectedDayAppointments` (`:104-111`).

### A.3 — Search behavior

- **Input:** real-time (`page.tsx:59` — `useState('')` directly bound to the input `onChange`).
- **No debounce.** The filter runs on every keystroke via the `useMemo` at `:65-90`. Because filtering is client-side over an in-memory month of ~30-150 rows, the per-keystroke cost is negligible. There is no `useTableState` hook on this page.
- **Filter fields:** customer first_name + last_name (concatenated, lowercased) + customer phone. **Vehicle make/model is NOT searched today** — gap callout for Target C.
- **Server-side or client-side:** client-side, over the month's pre-fetched data.
- **Performance characteristics:** acceptable at current volumes. Would not scale to "all-time appointments" or month-spans > a few hundred rows.

### A.4 — Interactions

- **Row tap** (`day-appointments-list.tsx:67-101`) → opens `<AppointmentDetailDialog>` via `handleAppointmentSelect` (`page.tsx:232-235`).
- **Dialog actions** (`appointment-detail-dialog.tsx` — same component the POS Schedule reuses post-Phase 2B):
  - Save (PATCH `/api/appointments/:id` from admin context, `page.tsx:246-274`).
  - Cancel (opens `<CancelAppointmentDialog>`, `page.tsx:237-240`).
  - Reschedule (gated on `canReschedule`).
  - Add notes (gated on `canAddNotes`).
- **Stat-card click** — clicking the "Pending" stat card toggles the status filter to `pending` (`page.tsx:242-244, :386-389`).
- **Date selection** — tapping a day in the calendar sidebar selects it (`page.tsx:228-230` + `:524-526`). Week-view day cards also navigate (`:462-465`).
- **Tab switching** — Day ↔ Week tabs (`page.tsx:62`, `:409-433`). No URL persistence; lost on refresh.
- **Stats fetch** — separate endpoint `/api/admin/appointments/stats` (`:114-127`); not duplicated in the appointments fetch.

### A.5 — Strengths and gaps (admin-side)

**Strengths to carry over:**
- Single-select status + detailer dropdowns are the right shape for Schedule (operator confirmed).
- Real-time client-side search over an in-memory window is the right shape for the data volume — no need for server-side search.
- Reuse of `<AppointmentDetailDialog>` cross-context is already proven (admin + POS Schedule both mount it as of Phase 2B).

**Gaps that don't translate to POS / iPad:**
- The `<Select>` element renders as a tiny dropdown (`h-9`, `select.tsx:11`) optimized for mouse interaction. iPad operators want LARGE touch targets — the operator's "card-style touch boxes" preference is explicitly aimed at fixing this.
- The calendar sidebar (`appointment-calendar.tsx`, ~340px wide) won't fit alongside the Schedule list on an iPad portrait orientation. Date selection on POS Schedule needs a different surface.
- Search doesn't include vehicle make/model — a real operator pain point because customers identify themselves by vehicle on phone calls ("the silver F-150").
- Status dropdown shows all 6 statuses including dead ones (cancelled / completed / no_show); not relevant on POS Schedule per Constraint X2 above.

---

## Part 2 — POS > Jobs > Schedule: current state (TARGET B)

Primary file: `src/app/pos/jobs/components/job-queue.tsx` (~1147
lines). Schedule-specific code paths concentrated at:

- B.1 endpoint + scope state: `:253` (flag read), `:260`
  (`effectiveScope` derivation), `:271-272` (`scheduleEntries`,
  `scheduleLoading` state), `:474-489` (`fetchSchedule` callback).
- B.2 rendering: `:806-812` (`<ScheduleScopeList>` swap-in),
  `:1045-1146` (the component definition).
- B.3 interactions: `:495-572` (card tap → fetch → dialog mount;
  save handler; cancel handler).

### B.1 — Post-15e Schedule scope behavior

- **Default view:** when the operator taps "Schedule" in the
  top-bar scope toggle (rendered iff
  `scheduleScopeEnabled` is true, `:641-668`), the
  Today-scope chrome unmounts (`:673`) and
  `<ScheduleScopeList>` renders at `:806-812`.
- **Data window:** tomorrow → tomorrow+30 days (`:477-478`,
  `fetchSchedule` computes `from = getTodayPst()+1` and
  `to = from+30`). The server clamps the floor to tomorrow per
  Constraint X1.
- **Visual treatment:** **flat vertical scrolling card list**
  (`:1078-1144`). Each card shows customer name + vehicle +
  services + total + status pill + "Schedule" indigo badge +
  date label · time. One card per appointment row, sorted by the
  endpoint's `scheduled_date` ASC + `scheduled_start_time` ASC.
- **Empty state** (`:1069-1077`): "No upcoming appointments — The
  next 30 days are clear." with a calendar icon. No empty-state
  CTA.
- **Loading state** (`:1062-1068`): a centered spinner.

### B.2 — Current interactions

- **Card tap** (`:1095-1106` → `handleScheduleCardTap` at
  `:495-524`): parallel-fetches `/api/pos/appointments/:id` +
  `/api/pos/staff/available`, then mounts the reused admin
  `<AppointmentDetailDialog>` with POS context props at
  `:1007-1026`.
- **Dialog onSave** (`handleSaveAppointment`, `:535-559`):
  PATCH `/api/pos/appointments/:id` (the Phase 2A endpoint),
  on success closes the dialog and re-fetches the Schedule
  list.
- **Dialog onCancel** (`handleCancelAppointment`, `:564-572`):
  closes the detail dialog and opens the POS
  `<CancelAppointmentDialog>` (`:1030-1040`).
- **Refresh button** (`:609-627`): per `:614`, when scope is
  schedule, Refresh re-fetches the Schedule endpoint (NOT
  populate — GATE B per the Phase 1B invariant comment).

No other interactions are wired on Schedule.

### B.3 — Current filters / search

**None of any kind.** The Schedule list renders the full
`scheduleEntries` array verbatim. No search input. No status
filter. No detailer filter. No date pills. The 30-day window is
fixed and not operator-configurable from the UI.

The endpoint itself accepts one server-side filter today
(`channel`, `schedule/route.ts:64, :118`), but it is unwired —
the client does not pass it (`fetchSchedule` only sets `from`
and `to`, `:479`).

---

## Part 3 — Gap analysis (TARGET C)

| # | Admin capability | Present on Schedule today? | Parity gap that blocks Admin removal? | Disposition |
| --- | --- | --- | --- | --- |
| C1 | Search by customer name | ❌ No | YES | Add to Schedule (D.5 — extended to vehicle per operator request) |
| C2 | Search by customer phone | ❌ No | YES | Add to Schedule (D.5) |
| C3 | Search by vehicle make/model | ❌ No (admin doesn't have it either — admin gap) | N/A on Schedule (this is admin's gap); BUT operator wants it on Schedule | Add to Schedule (D.5) — improves on admin |
| C4 | Status single-select dropdown | ❌ No | YES | Add to Schedule (D.3) — restricted to 3 values per Constraint X2 |
| C5 | Detailer single-select dropdown | ❌ No | YES | Add to Schedule (D.4) |
| C6 | "Pending" stat-card click → toggles status filter | ❌ No | NO — pure admin convenience; out of scope | Don't port. Leave to a future enhancement if operator asks. |
| C7 | Date navigation (calendar sidebar) | ❌ No (fixed 30-day window) | YES — operator can't focus on a subset of days | Replaced by **date-pill row** on Schedule (D.2) — different visual paradigm, same capability |
| C8 | Day / Week view tabs | ❌ No | NO — Schedule is a flat list by design; week-view doesn't add value when 30 days are scrolled | Don't port. |
| C9 | Stats cards (Today / This Week / Pending / New / Booked revenue) | ❌ No | NO — Today + This Week stats aren't on the Schedule scope (Today belongs to Today scope per X1); Pending stat is the only one that could apply | Don't port. Optionally surface a "Pending count" pill in the filter bar in a future session if operator asks. |
| C10 | Channel pill on each card ("Walk-In" / "Online" / etc.) | ❌ No (admin has it via `formatChannelLabel`) | Minor — useful but not blocking | Optional polish, defer to Session N+3 |
| C11 | Detail dialog (view + edit) | ✅ Already shipped via Phase 2B | N/A | Already at parity |
| C12 | Cancel from list | ✅ Via dialog → POS CancelAppointmentDialog handoff | N/A | Already at parity |
| C13 | URL-persistent filter state | ❌ Admin has none either; Schedule has scope persisted in localStorage but not filters | NO blocking — operator hasn't asked | Use `useTableState` if convenient (gets URL persistence for free) |
| C14 | "Cancelled / Completed / No-Show" status visibility | ❌ No (server excludes per X2) | NO — by design | Don't port. Document the exclusion in a tooltip or empty-state hint if confusion arises. |

**Parity-blocking gaps:** C1, C2, C4, C5, C7. **Operator
explicit add:** C3 (vehicle search — improves on admin).
**Five capabilities** must land before Admin > Appointments can
be retired in favor of POS Schedule.

**Out-of-scope intentionally:** C6, C8, C9, C10 (polish), C14 (by-design).

---

## Part 4 — Locked design specification (TARGET D)

### D.1 — Filter bar layout

The filter bar lives **above the Schedule list, below the
Today/Schedule scope toggle**, at the top of the Schedule-scope
content region (replacing today's empty space where Today-scope
shows date navigation at `job-queue.tsx:676-708`). It is a
single horizontal container that flows top-down at narrow widths
into stacked rows.

```
┌──────────────────────────────────────────────────────────────────┐
│   [Today]   [Schedule]                                  (scope)  │  ← existing scope toggle
├──────────────────────────────────────────────────────────────────┤
│   🔍 Search customer, phone, vehicle...           [✕]           │  ← search bar (D.5)
├──────────────────────────────────────────────────────────────────┤
│   ┌────────┐ ┌────────┐ ┌────────────┐ ┌────────────┐ ┌──────┐  │
│   │Tomorrow│ │This Wk │ │ Next Week  │ │ Next 30 Day│ │ Other│  │  ← date pills (D.2) — horizontal scroll on iPad
│   └────────┘ └────────┘ └────────────┘ └────────────┘ └──────┘  │
├──────────────────────────────────────────────────────────────────┤
│   Status: [All Statuses ▾]      Detailer: [All Detailers ▾]     │  ← dropdowns (D.3 + D.4)
├──────────────────────────────────────────────────────────────────┤
│   ─ Schedule list ─                                             │
│   [ appointment card ]                                          │
│   [ appointment card ]                                          │
└──────────────────────────────────────────────────────────────────┘
```

- **iPad touch targets:** date pills are `min-height: 56px`
  (matching the Today scope's date nav buttons at `:679`); dropdown
  triggers are `h-11` (44px touch target, iOS Apple HIG minimum);
  search input is `h-11` (matches dropdowns) — overrides the
  `h-9` default in `SearchInput`/`Select` for this surface only,
  via Tailwind class override on the wrappers (no primitive
  changes).
- **Mobile/portrait orientation:** the date-pill row scrolls
  horizontally (`overflow-x-auto`, momentum scrolling enabled by
  default on iOS). Status + detailer dropdowns stack vertically
  below a sm: breakpoint (mirrors `appointment-filters.tsx:27`
  `flex flex-col gap-3 sm:flex-row` pattern).
- **Spacing:** `gap-2` between pills, `py-3` between filter rows.
  Matches the dark-mode tokens already in `job-queue.tsx`
  (`bg-gray-50 dark:bg-gray-800` outer surface).

### D.2 — Date pills design

**The operator's verbal "Today, Tomorrow, This Week, Next Week,
This Month, Next 30 Days, Other" list — reconciled against the
endpoint constraints:**

| Pill | from (PST) | to (PST) | Honors X1 (≥ tomorrow)? | Honors X3 (≤ 31 days)? |
| --- | --- | --- | --- | --- |
| **~~Today~~** | ~~today~~ | ~~today~~ | ❌ **Removed** — see X1 | N/A |
| **Tomorrow** | tomorrow | tomorrow | ✅ | ✅ (1 day) |
| **This Week** | tomorrow | end-of-this-week (Sun, PST) | ✅ | ✅ (≤ 6 days) |
| **Next Week** | start-of-next-week (Mon) | end-of-next-week (Sun) | ✅ | ✅ (7 days) |
| **This Month** | tomorrow | end-of-this-month | ✅ | ✅ (≤ 30 days) |
| **Next 30 Days** | tomorrow | tomorrow+30 | ✅ | ✅ (30 days) |
| **Other (custom)** | operator-picked | operator-picked | client-side gates to ≥ tomorrow | client-side gates to ≤ 31 days |

**Visual treatment** (operator-stated preference):
- Each pill is a **card-style touch box**, not a thin chip. Wraps
  `<TogglePill>` (`src/components/ui/toggle-pill.tsx`) with custom
  size + content overrides: rounded-lg, `min-w-[100px]`,
  `min-h-[56px]`, `flex-col items-center`, label above subtle
  date-range hint (e.g., "Tomorrow / Jun 4" or "Next Week / Jun 9-15").
- **Inactive state:** `bg-white dark:bg-gray-900`,
  `border border-gray-200 dark:border-gray-700`,
  `text-gray-700 dark:text-gray-300`.
- **Active state:** `border-blue-500 bg-blue-50 text-blue-700`
  (light) / `border-blue-400 bg-blue-900/30 text-blue-300`
  (dark). Mirrors the active state on the Day/Week tabs in admin
  (`page.tsx:415-418`).

**Multi-select behavior (operator-locked):**
- Multiple pills can be active simultaneously; the effective
  date range is the **union** of selected pills' ranges.
- Tap an active pill → toggles it off.
- If all pills are off, the displayed range is the default
  (`Next 30 Days`).

**"Other (custom)" pill — design contract:**
- Tap → opens a **single-date-or-range picker drawer below the
  pill row** (not a modal, to avoid losing the scroll context).
- Picker uses two native `<input type="date">` fields ("From" and
  "To") — mirrors the existing POS pattern at
  `reschedule-appointment-dialog.tsx:145`. iPad Safari renders
  the native iOS date picker.
- "From" defaults to tomorrow; "To" defaults to today + 30 days.
- Validation: From ≥ tomorrow; To ≤ today + 31 days; From ≤ To.
  Disable the Apply button until valid.
- **Coexists with the other pills.** When "Other" is active, its
  range is added to the union (same as Tomorrow + This Week +
  Other = the union of all three). If the operator wants
  "Other ONLY," they tap to deactivate the other pills.
  Recommend a tiny "Clear all dates" link below the pill row
  when ≥ 2 pills are active.

**Range computation:** centralized in a pure helper
`computeScheduleDateRange(activePillIds, customDateRange):
{from: string, to: string}` to live in
`src/app/pos/jobs/utils/` (new file). The helper returns the
**union envelope** — i.e. the earliest `from` across active pills
and the latest `to` across active pills. The server fetch uses
this single envelope (it does not support disjoint ranges); the
client-side filter then refines to the union of the actual day
ranges. This is the only subtlety: a multi-pill selection
fetches the bounding envelope and trims client-side.

### D.3 — Status dropdown

- **Component:** the existing `<Select>` from
  `src/components/ui/select.tsx` with size override `className="h-11"`.
- **Position:** left-of-detailer in the third filter row.
- **Values (per Constraint X2):**
  - `all` — "All Statuses" (default)
  - `pending` — "Pending"
  - `confirmed` — "Confirmed"
  - `in_progress` — "In Progress"
- **Source of truth for labels:** `APPOINTMENT_STATUS_LABELS` from
  `src/lib/utils/constants.ts:116-123` (filtered to the 3
  Schedule-allowed values).
- **Why no `completed / cancelled / no_show`:** the server excludes
  them (`schedule/route.ts:12, :114`). Listing them in the
  dropdown would be misleading — they'd always return zero rows.
  If the operator later wants to see them on Schedule, that's a
  separate decision (would require relaxing
  `EXCLUDED_STATUSES`).

### D.4 — Detailer dropdown

- **Component:** the existing `<Select>` from
  `src/components/ui/select.tsx` with size override `className="h-11"`.
- **Position:** right-of-status in the third filter row.
- **Values:**
  - `all` — "All Detailers" (default)
  - `unassigned` — "Unassigned" (mirrors admin pattern at
    `appointment-filters.tsx:58`)
  - One option per detailer, rendered as
    `"{first_name} {last_name}"`, sorted by `first_name`.
- **Data source:** `/api/pos/staff/available` (`route.ts` at
  `src/app/api/pos/staff/available/route.ts`). Already used by
  Phase 2B's dialog-mount (`job-queue.tsx:499-516`). The endpoint
  returns active + bookable staff with today's job counts; the
  filter dropdown ignores the counts (uses only `id`,
  `first_name`, `last_name`).
- **Caching:** fetch once on Schedule-scope mount; reuse the
  result across renders. The fetch already happens on every
  card tap; lifting it to a Schedule-scope-mount-once is a tiny
  refactor.

### D.5 — Search bar

- **Component:** the existing `<SearchInput>` from
  `src/components/ui/search-input.tsx` with size override
  `className="h-11"`.
- **Position:** top filter row, full-width within the filter bar.
- **Placeholder:** "Search customer, phone, vehicle..."
- **Match fields** (per operator + parity gap C3):
  - `customer.first_name`
  - `customer.last_name`
  - Full name (concatenated `${first} ${last}`)
  - `customer.phone` (raw + normalized — match against both shapes so "424" matches "+14244010094" as well as the formatted display)
  - `vehicle.make`
  - `vehicle.model`
- **Match semantics:** lowercase, partial substring (`includes`).
  OR across fields (any field hits → match). Case-insensitive.
- **Debounce:** 300ms via `useTableState`'s `debouncedSearch`
  (`useTableState.ts:21, :147-150`) — already a Smart Details
  standard; no new debouncing infrastructure needed.
- **Clear button:** built into `<SearchInput>` (the `X` button at
  `search-input.tsx:32-43`).
- **Empty-result state:** "No appointments match your filters."
  with a "Clear all filters" link below — mirrors the existing
  empty-state at `:1069-1077` visually, with copy adjusted for the
  filtered case.

### D.6 — Combined filter logic

**Within-category** (multiple date pills selected):
- **OR** — union of date ranges, server fetches the envelope,
  client trims to the union of actual day-ranges if disjoint.

**Across categories** (date AND status AND detailer AND search):
- **AND** — all categories must match for a row to render. Empty
  category (`all` value, no pills selected → defaults to Next 30
  Days, empty search) is a pass.

**Active-filter indicator:** a small text line at the right edge
of the filter bar shows count + clear: `"3 filters active · Clear"`
(only shown when ≥ 1 filter is non-default). Clear resets all
four controls to defaults (no pills active besides default,
status `all`, detailer `all`, empty search).

### D.7 — State management

**State location:** `useTableState` hook
(`src/lib/hooks/useTableState.ts`) drives `search` (debounced via
the hook), `filters` (status, detailer, dateRange), and provides
URL-param persistence for free. The hook is already a Smart
Details standard pattern.

**Default state on Schedule-scope mount** (depends on Target F.1
operator decision):
- **Option A (recommended):** `dateRange = "Next 30 Days"`,
  `status = all`, `detailer = all`, `search = ""`. Matches current
  Schedule behavior (no filtering) on first mount; familiar.
- **Option B:** `dateRange = "This Week"`. More "today-ish" feel
  but might surprise an operator expecting the full 30 days.

**Default state on Schedule-scope reentry** (returning from
another POS tab or page):
- Filter values persist via `useTableState`'s URL-param sync
  (`useTableState.ts:152-179`) — operator returns to the same
  filters that were active when they left. Date-pill selections,
  status, detailer, and search query all preserved across
  navigation.
- Operator-stated preference for this behavior is open in Target
  F.2.

**Local-storage fallback:** none. URL-only persistence is the
existing `useTableState` contract; introducing a localStorage
fallback would deviate from the hook. If operator wants
post-refresh persistence beyond URL, that's a Target F decision.

---

## Part 5 — Implementation plan (TARGET E)

Three sessions, each Memory #8 safe (≤5 files / ≤300 lines net
per session). Sequencing is linear — each session builds on the
prior. Plus one optional retirement session for Admin >
Appointments removal.

### Session N+1 — Filter bar shell + date pills

**Scope:** ship the visible filter bar with search input
(unwired client-side filter for now), date-pill row with all
the pills, "Other" date-range drawer, and the
`computeScheduleDateRange` helper. Wire `fetchSchedule` to use
the computed envelope. Default behavior = Option A from D.7
(unless Target F.1 says otherwise).

**Files to be touched:** 5

1. `src/app/pos/jobs/components/job-queue.tsx` — wire the new
   `<ScheduleFilters>` above the Schedule list; pass props;
   thread `fetchSchedule` to take the envelope from the hook
   state. (~50-80 lines net.)
2. `src/app/pos/jobs/components/schedule-filters.tsx` (NEW) —
   the filter bar shell with search + pill row + custom drawer.
   Reuses `<SearchInput>`, `<TogglePill>` (wrapped to enlarge),
   `<Input type="date">`. (~150-200 lines.)
3. `src/app/pos/jobs/utils/compute-schedule-range.ts` (NEW) —
   pure helper computing `{from, to}` envelope from active pill
   IDs + custom range. ~40-60 lines.
4. `src/app/pos/jobs/utils/__tests__/compute-schedule-range.test.ts`
   (NEW) — unit tests pinning each pill's PST-date math + the
   union envelope rule + the X1 floor + the X3 max-31-day
   ceiling. ~80-120 lines.
5. `docs/CHANGELOG.md` — session entry.

**Estimated time:** ~2-3 hours. Largest session of the three;
date-math is the bulk.

**Test additions:**
- `compute-schedule-range.test.ts` (above): 8-10 contract tests
  for each pill + the union + boundary cases.
- Snapshot test on `<ScheduleFilters>` rendering (optional polish
  — could defer to N+3).

**Risks:**
- PST timezone math is subtle. Lean on existing helpers from
  `src/lib/utils/pst-date.ts` (`getTodayPst`, `addDaysPst`,
  etc., already imported by `schedule/route.ts`).
- The custom-range drawer's date-input UX on iPad needs
  smoke-testing — native iOS picker behavior varies by Safari
  version. Acceptable risk; falls back to manual typing if the
  picker misbehaves.

### Session N+2 — Status dropdown + detailer dropdown + search wiring

**Scope:** add the two single-select dropdowns to the filter
bar; wire the debounced search to client-side filtering of the
fetched list; implement the AND-across-categories logic;
empty-result + clear-all-filters affordances.

**Files to be touched:** 4

1. `src/app/pos/jobs/components/schedule-filters.tsx` — add the
   status + detailer `<Select>` widgets; wire the search
   `onChange` to the `useTableState` hook. (~80-100 lines net.)
2. `src/app/pos/jobs/components/job-queue.tsx` — accept the
   filter values from the new hook integration; thread them
   into `<ScheduleScopeList>`; fetch detailers on Schedule
   mount via `/api/pos/staff/available`. (~50-80 lines net.)
3. `src/app/pos/jobs/components/__tests__/schedule-filters.test.tsx`
   (NEW) — render tests for: search updates the visible list
   (with debounce advancement); status filter narrows; detailer
   filter narrows; combined filters AND together; clear-all
   resets all four controls; empty-result state shows. ~120-180
   lines.
4. `docs/CHANGELOG.md` — session entry.

**Estimated time:** ~1.5-2 hours.

**Test additions:** the new test file above. Locks the
filter-combination contract before it can drift.

**Risks:**
- The `useTableState` hook reads from URL query params on mount
  — verify this is compatible with the existing
  `/pos/jobs?date=...` URL pattern. (`job-queue.tsx:314-325`
  uses `searchParams` directly for the date param.) The hook's
  default-skipping logic (`useTableState.ts:88-94`) should make
  this non-conflicting.

### Session N+3 (optional) — Polish + a11y + edge cases

**Scope (deferrable):**
- ARIA labels on the date pills (`aria-pressed`, `aria-label`).
- Channel pill on each Schedule card (parity gap C10 from Target
  C).
- "Pending" stat-card quick filter (parity gap C6) — IF operator
  asks. Defer if not requested.
- Snapshot/visual regression tests on the filter bar.
- A "Save current filter view" affordance (out of scope unless
  operator asks).

**Files to be touched:** 2-3.

**Estimated time:** ~1 hour. Pure polish; can be merged into N+2
if the test budget allows.

**Defer to operator decision.** N+3 is optional and only ships
if the operator explicitly wants the polish.

### Session N+4 (FINAL) — Retire Admin > Appointments page

**Triggers when:** parity gaps C1-C7 are verified shipped on
Schedule; operator confirms the POS Schedule is the new
canonical surface.

**Scope:**
- Delete or redirect `src/app/admin/appointments/page.tsx`.
  (Redirect is safer — operators with bookmarks land
  somewhere sensible.)
- Update admin nav links to point to `/pos/jobs?scope=schedule`
  (or remove the link).
- Remove `<AppointmentStats>`, `<AppointmentFilters>`,
  `<AppointmentCalendar>` if no other consumers.
  `<AppointmentDetailDialog>` STAYS — POS Schedule reuses it
  per Phase 2B.
- Update CLAUDE.md if any reference to the page exists in
  Critical Rules or Project Structure (verify).

**Files to be touched:** ~4-6. Bigger than #N+1-#N+3 because of
the nav rewiring; might need its own Memory #8 split.

**Estimated time:** ~1.5-2 hours.

**Risks:**
- Any other surface that links to `/admin/appointments` (deep
  links from old emails, marketing campaigns, voice agent
  responses) becomes broken. Audit before delete; prefer
  redirect over delete.
- The detailer permission path (`page.tsx:302-349`) is a
  simplified detailer-only view. If detailers don't have POS
  access, removing the admin route breaks their workflow.
  Verify detailers have POS PIN access before retiring.

---

## Part 6 — Open operator decisions (TARGET F)

The audit cannot pre-resolve these. The operator must lock
before N+1 fires (F.1 in particular is blocking).

### F.1 — Default date-pill state on Schedule-scope mount (BLOCKING N+1)

When the operator first opens (or returns to) Schedule, which
pill is active by default?

- **(a)** "Next 30 Days" active — matches today's behavior
  (the full 30-day fetch). Familiar. **Audit's recommendation.**
- **(b)** "This Week" active — narrower, more
  immediate-actionability framing.
- **(c)** "Tomorrow" active — narrowest; "what's next."
- **(d)** No pill active — show all 30 days (effectively same as
  (a) but with no pill highlighted). Risks operator confusion
  ("why does nothing show as selected when the data IS scoped?").

### F.2 — Filter persistence across POS navigation

When the operator leaves Schedule (taps Today, navigates to
Sale, switches to another POS tab) and returns:

- **(a)** Persist filters via URL params (the `useTableState`
  default). Audit's recommendation — zero extra work.
- **(b)** Reset filters on every Schedule-scope re-mount.
  Simpler mental model but loses context across rapid tab
  switching.

### F.3 — "Other (custom)" range — single date or range?

The operator's prompt phrased "Other (custom date or date
range)" which suggests range support is wanted, but they may
prefer a single-date-only variant if range UX feels heavy.

- **(a)** Range (From + To). Audit's recommendation. Two
  date inputs side by side.
- **(b)** Single date only (just "On this day"). Simpler;
  operator picks one specific day. Less powerful but iPad-
  friendlier.
- **(c)** Both — let the operator pick one date (just From) and
  if To is left blank, default it to From. Polish; possibly
  overkill.

### F.4 — Filter bar position on iPad portrait orientation

- **(a)** Above the Schedule list, fixed (always visible while
  scrolling). Audit's recommendation. Operator can re-filter
  without scrolling back to top.
- **(b)** Above the list, scrolling away with content. Saves
  screen real estate at the cost of needing to scroll up to
  re-filter.
- **(c)** Collapsible "Filters" button that opens a drawer.
  Cleanest list view but adds a tap to refile. Operator's
  earlier "card-style touch boxes" framing suggests they want
  filters VISIBLE, leaning against (c).

### F.5 — Should "Pending" stat-card-style quick filter exist?

The admin page lets operators tap a "Pending" stat card to
auto-toggle the status filter (`page.tsx:242-244`). Schedule
could surface a small "X pending" pill above the filter bar
that, when tapped, toggles status to `pending`.

- **(a)** Don't port. Operator can use the status dropdown.
  Audit's recommendation — keeps filter UX clean.
- **(b)** Port as a small badge next to the active-filter
  indicator. Optional polish for N+3.

### F.6 — Detailer dropdown — show only bookable detailers, or all active employees?

`/api/pos/staff/available` returns only `status='active' AND
bookable_for_appointments=true` (`staff/available/route.ts:22-25`).

- **(a)** Use the existing endpoint's filter (bookable only).
  Audit's recommendation — matches Phase 2B's dialog
  semantics; avoids showing detailers that can't be assigned
  anyway.
- **(b)** Show all active employees, including non-bookable.
  Useful only if the operator wants to filter rows by historical
  assignment. Unlikely on a future-only Schedule scope.

---

## Hard-rules verification

- ✅ Worktree isolation — performed in
  `~/Claude/SmartDetails/wt-schedule-filter-audit` on branch
  `audit/pos-schedule-filter-ux-design`, base `402ff372`
  (#146 flag-flip merge).
- ✅ No source / migration / test changes — read-only.
- ✅ File:line citations on every Target A / B / C claim.
- ✅ Memory #11 — verified against actual code, not theorized
  from #146 summary or prior audits.
- ✅ Memory #29 — Component Behavior type. Intended-behavior
  model FIRST (Target A defines admin contract), then
  comparison (Target B), then gap inventory (Target C). Stayed
  at component-behavior altitude; did not stray into
  system-architectural redesign.
- ✅ Memory #2 — design reuses existing primitives:
  `<SearchInput>`, `<Select>`, `<TogglePill>`, `<Input
  type="date">`, `useTableState`. No new component libraries
  proposed.
- ✅ Memory #8 — implementation plan respects ≤5 files / ≤300
  lines per session; N+1 is the biggest at ~330 lines worst-case
  across 4 source files + 1 doc.
- ✅ Operator-locked preferences honored: additive date pills,
  click-again-to-toggle-off, single-select status, single-select
  detailer, card-style touch boxes. NOT re-litigated.
- ✅ Two endpoint constraints (X1, X2) and one capacity ceiling
  (X3) called out up-front as design-shaping facts, not buried.

---

## Cross-references

- `docs/dev/POS_JOBS_UNIFIED_SCHEDULE_FLAG_FLIP_PREFLIGHT.md` —
  #146 pre-flight; documents the 12 gates the flag controls and
  the Phase 1B load-bearing invariant the Schedule endpoint
  enforces.
- `src/app/admin/appointments/page.tsx` — primary admin source
  for Target A.
- `src/app/admin/appointments/components/appointment-filters.tsx`
  — the existing filter component this design mirrors with iPad
  adaptations.
- `src/app/pos/jobs/components/job-queue.tsx` — primary POS
  source for Target B + the insertion site for the new
  `<ScheduleFilters>`.
- `src/app/api/pos/jobs/schedule/route.ts` — Schedule endpoint;
  source of constraints X1, X2, X3.
- `src/app/api/pos/staff/available/route.ts` — detailer data
  source for D.4.
- `src/lib/hooks/useTableState.ts` — the canonical
  search + filter + URL-persistence hook the design reuses.
- `src/components/ui/search-input.tsx` /
  `src/components/ui/select.tsx` /
  `src/components/ui/toggle-pill.tsx` — the three UI primitives
  the design reuses.
- `src/lib/utils/constants.ts:116-123` —
  `APPOINTMENT_STATUS_LABELS`, the source of truth for status
  labels.
- `src/lib/utils/pst-date.ts` — PST date helpers the
  `computeScheduleDateRange` helper will lean on.
- CLAUDE.md Rules 2 (PST timezone), 11 (component reuse), 22
  (canonical engines + no bespoke implementations), 29
  (Memory entries).
