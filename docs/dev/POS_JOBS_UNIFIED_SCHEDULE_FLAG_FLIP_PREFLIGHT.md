# `pos_jobs_unified_schedule` — Flag-Flip Pre-Flight Audit

> Session #146, 2026-06-03. Branch:
> `chore/pos-jobs-unified-schedule-flag-flip`. Pre-flight precedes
> the flip in the same session per the prompt's audit-then-flip
> discipline.
>
> Purpose: verify the flag-ON code path still works correctly after
> ~1 week + 35 sessions of unrelated drift since Item 15e closed on
> 2026-05-27 (#109). The flag has been OFF in production since.
> ROADMAP-13-ITEMS audit (Session #145, merge `9e2bc69a`) confirmed
> 15e is structurally CLOSED — this session closes the DORMANT
> CONFIG decision.
>
> Hard rules: read-only audit step, then a single flag-flip
> migration. NO new code, NO refactoring. Memory #11 (verify against
> actual code), Memory #29 (audit-first).

## TL;DR

- **Flag location:** `feature_flags` table in Supabase. Key
  `pos_jobs_unified_schedule`. Current value `enabled=false`. Seed
  migration `supabase/migrations/20260527000000_pos_jobs_unified_schedule_flag.sql`
  uses `ON CONFLICT (key) DO NOTHING`, so a re-run never clobbers
  operator state.
- **Call sites:** ONE consumer
  (`src/app/pos/jobs/components/job-queue.tsx:253`), reads via
  `useFeatureFlag(FEATURE_FLAGS.POS_JOBS_UNIFIED_SCHEDULE)`. Two
  endpoints exist for the flag-ON behavior
  (`/api/pos/jobs/schedule` and the reused
  `/api/pos/appointments/[id]` GET + PATCH) but are flag-AGNOSTIC —
  they don't read the flag themselves; they're only reachable when
  the client-side toggle is enabled.
- **Drift assessment (sessions #110 → #145):** ONE post-#109 touch
  on flag-relevant code — Session #110's `has_active_job` 1:1
  cardinality defensive fix on `/api/pos/appointments/[id]` GET.
  Strictly improves the flag-ON path (new `asRelationArray()`
  normalization + 3 new tests covering single-object scheduled,
  single-object completed, null shapes). Every other session
  cluster (catalog CRUD #111-#114, POS Sale-vs-Quotes parity
  #115-#124, vehicle classifier/booking #125-#143, SMS #137-#139,
  Q-D #144, ROADMAP audit #145) does NOT touch any file in the
  flag-gated code path.
- **Test verification:** 29/29 tests pass on the dedicated
  flag-gated test files (`job-queue-schedule-scope.test.tsx` 18
  tests + `/api/pos/jobs/schedule/__tests__/route.test.ts` 11
  tests); 100/100 pass on the dialog + POS appointment paths the
  Schedule scope mounts; **full suite: 2869/2869 pass.** tsc 0
  errors, lint 0 errors / 97 warnings (baseline).
- **Risk verdict: Clean.** Flip strategy **Option (i) — direct
  flip via new migration**. Safe to proceed.

---

## TARGET A — Flag location and shape

### Where the flag lives

Source of truth: `feature_flags` table in Supabase. Seed migration
`supabase/migrations/20260527000000_pos_jobs_unified_schedule_flag.sql`
inserts the row at first apply:

```sql
INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'pos_jobs_unified_schedule',
  'POS Jobs — Unified Schedule Scope',
  'Adds a Today / Schedule scope toggle to the POS Jobs queue. ...',
  'Core POS',
  false  -- ← current production value
)
ON CONFLICT (key) DO NOTHING;
```

Key constant: `FEATURE_FLAGS.POS_JOBS_UNIFIED_SCHEDULE =
'pos_jobs_unified_schedule'` in
`src/lib/utils/constants.ts:277` (declared in the central
`FEATURE_FLAGS` object alongside QBO_ENABLED, MOBILE_SERVICE, etc.).

### Current production value

`enabled = false`. The `ON CONFLICT DO NOTHING` clause means a
hypothetical re-apply leaves the operator's value alone — so any
flip done outside this migration stack (admin UI, direct SQL)
would PERSIST through a re-seed. There is no evidence the flag has
ever been flipped in production (no UPDATE migration, no admin
audit-log entry referencing the key); the assumption "OFF since
#109" is consistent with the visible code state.

### Local config

`.env.local`: not flag-relevant — feature flags are DB-backed, not
env-driven. (Confirmed: `grep` finds no
`pos_jobs_unified_schedule` in `.env.local`, `.env.example`, or
any other env file.)

### Who reads the flag (Client side)

Single consumer:

```ts
// src/app/pos/jobs/components/job-queue.tsx:253
const { enabled: scheduleScopeEnabled } = useFeatureFlag(FEATURE_FLAGS.POS_JOBS_UNIFIED_SCHEDULE);
```

`useFeatureFlag` is the canonical client-side hook
(`src/lib/hooks/use-feature-flag.ts` — imported at
`job-queue.tsx:18`). The server-side equivalent
`isFeatureEnabled(flagKey)` is NOT used for this flag — the
endpoints don't gate themselves; only the client-side toggle
controls reachability.

---

## TARGET B — What the flag gates

Enumeration of every code path that branches on
`scheduleScopeEnabled` (and the downstream `effectiveScope` it
computes).

### B1 — `effectiveScope` pin (the load-bearing gate)

`job-queue.tsx:260`:

```ts
const effectiveScope: ScopeMode = scheduleScopeEnabled ? scope : 'today';
```

**Flag OFF:** `effectiveScope` is unconditionally `'today'`,
regardless of `scope` state, regardless of `localStorage`.
**Flag ON:** `effectiveScope` follows the user's `scope` choice
(initialized from `localStorage.getItem('pos-jobs-scope') ||
'today'`).

This is the master defense — every downstream gate (B2-B7) keys
off `effectiveScope` or `scopeRef.current`, not directly off
`scheduleScopeEnabled`. Pinning `effectiveScope` to `'today'`
makes the entire Schedule code path unreachable.

### B2 — Scope toggle UI (`job-queue.tsx:641-668`)

**Flag OFF:** the `{scheduleScopeEnabled && (...)}` guard
suppresses the entire `<Today / Schedule>` toggle bar; pre-15e UX
preserved byte-for-byte.
**Flag ON:** the toggle renders between the header and the date
nav, with `Today` / `Schedule` buttons that call
`handleScopeChange`.

### B3 — Today-scope chrome wrapper (`job-queue.tsx:673`)

```tsx
{effectiveScope === 'today' && (
  // Date nav, summary, filters, view toggle, today-scope content (lines 674-1001)
)}
```

**Flag OFF:** `effectiveScope` always `'today'`, so this block
always renders → pre-15e identical UX.
**Flag ON + Today:** same as flag OFF.
**Flag ON + Schedule:** this entire block unmounts; the Schedule
list (`<ScheduleScopeList>` at `:1045`) renders instead.

### B4 — `init()` useEffect (`job-queue.tsx:574-587`)

GATE A — does the mount fetch jobs+populate or schedule?

```ts
if (effectiveScope === 'schedule') {
  await fetchSchedule();
  return;
}
await populateFromAppointments(selectedDate);
await fetchJobs(selectedDate);
```

**Flag OFF:** always pre-15e (populate + fetchJobs).
**Flag ON + Schedule:** fetches `/api/pos/jobs/schedule` (a pure
READ endpoint — see Target B's load-bearing invariant section).

### B5 — Polling interval (`job-queue.tsx:424-429`)

```ts
if (effectiveScope !== 'today') return; // Schedule scope is not live-polled.
```

**Flag OFF:** poll runs every 5s active / 60s past.
**Flag ON + Schedule:** poll loop returns early; no `/api/pos/jobs`
requests; Schedule scope is intentionally not live-polled (LOCKED
Phase 1B decision per the CHANGELOG #109 entry).

### B6 — `pollJobs()` guard (`job-queue.tsx:355`)

```ts
if (scopeRef.current !== 'today') return;
```

Defense-in-depth: even if the interval got somehow scheduled in
Schedule scope, the poll handler itself bails.

### B7 — `populateFromAppointments()` guard
(`job-queue.tsx:442-469`)

GATE C — the load-bearing invariant of Item 15e Phase 1B:

```ts
// GATE C (Item 15e Phase 1B, defense in depth): never materialize jobs in
// Schedule scope, even if invoked outside the gated init effect.
if (scopeRef.current !== 'today') return;
```

**Schedule scope MUST NEVER write to the `jobs` table.** This guard
ensures it — even if a future caller accidentally invokes
populate, the function bails when scope is `schedule`. The
`schedule/route.ts:23-27` server-side comment reinforces this:
"this endpoint is a PURE READ. It NEVER calls populate, NEVER
writes the `jobs` table, and has ZERO side effects."

### B8 — Refresh button (`job-queue.tsx:609-627`)

```tsx
if (effectiveScope === 'schedule') {
  fetchSchedule();
  return;
}
populatedDates.current.delete(selectedDate);
populateFromAppointments(selectedDate);
fetchJobs(selectedDate);
```

**Flag OFF:** the populate+fetchJobs branch always runs.
**Flag ON + Schedule:** Refresh re-fetches the read-only Schedule
endpoint.

### B9 — Schedule data state (`scheduleEntries`,
`scheduleLoading` at `:271-272`)

State holders for the Schedule scope's data. Empty arrays
under flag OFF (never written). Allocated as React state
regardless, but no runtime cost.

### B10 — Schedule card tap → dialog mount (`job-queue.tsx:495-524`)

`handleScheduleCardTap` fetches `/api/pos/appointments/[id]` GET +
`/api/pos/staff/available`. Unreachable under flag OFF (no
Schedule cards rendered).

### B11 — Dialog Save / Cancel handlers (`:526-572`)

`handleSaveAppointment` → `PATCH /api/pos/appointments/[id]`
(Phase 2A endpoint). `handleCancelAppointment` opens the POS
`<CancelAppointmentDialog>`. Both unreachable under flag OFF.

### B12 — Per-field gate computation (`:222` per comment)

Per-field reschedule/cancel/notes gates computed once and passed
to the dialog when mounted (Phase 2B). Inert under flag OFF
because the dialog never mounts.

### Summary of OFF vs ON

| Aspect | Flag OFF (current production) | Flag ON (the flip) |
| --- | --- | --- |
| Today-scope behavior | Unchanged from pre-15e — populate + fetchJobs + live poll | Unchanged — same Today UX |
| Schedule-scope availability | Hidden — toggle not rendered, code unreachable | Toggle visible; tap fetches `/api/pos/jobs/schedule` |
| `jobs` table writes | Existing (populate on Today mount) | Existing only on Today mount; **never** under Schedule scope |
| Polling | Active on Today | Active on Today; suspended under Schedule |
| Dialog mount | Reachable only via existing Today flows | Additionally reachable via Schedule card tap (Phase 2B) |

The OFF path is **byte-identical to pre-15e**. The ON path is
purely additive — no Today-scope behavior changes; the only
visible Today-side difference is the toggle bar appearing above
the date nav (`job-queue.tsx:641-668`).

The OFF path is **actively maintained**, not legacy: every gate
above is the live Today-scope code, used by 100% of production
traffic since 15e shipped.

---

## TARGET C — Drift assessment (sessions #110 → #145)

Files in the flag-gated code path:

- `src/app/pos/jobs/components/job-queue.tsx` (the consumer)
- `src/app/api/pos/jobs/schedule/route.ts` (Schedule data source)
- `src/app/pos/jobs/components/schedule-types.ts` (entry type)
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` (reused dialog)
- `src/app/pos/components/appointments/cancel-appointment-dialog.tsx` (cancel handoff)
- `src/app/api/pos/appointments/[id]/route.ts` (GET + PATCH — used by card tap + save)
- `src/app/api/pos/staff/available/route.ts` (used by card tap)
- `src/app/api/pos/jobs/populate/route.ts` (called by Today-scope only — guard-relevant)
- `src/lib/hooks/use-feature-flag.ts` (the hook)

Git log on these paths since `2026-05-27`:

| Commit | Session | Subject | Impact on flag-ON path |
| --- | --- | --- | --- |
| `bcae1195` | #110 | Item 15e Phase 2C-β-2 corrective — `has_active_job` 1:1 cardinality | **Improves** — adds defensive `asRelationArray()` for the embed shape PostgREST returns; `+10` tests; covers single-object scheduled/completed/null + raw-relation stripping. Targeted both admin pages AND `api/pos/appointments/[id]` GET (which `handleScheduleCardTap` calls). |
| `508303fa` | #109 | Item 15e Phase 2C-β-2 — admin un-materialize intercept + POS revert button | Original 15e closure; this is the baseline being flipped. |
| `367c3d54` | #108 | Item 15e Phase 2C-β-1 — un-materialize shared modal | Pre-baseline. |

**No other commits touched flag-gated files.** Verified with:

```bash
git log --oneline --since="2026-05-27" -- \
  src/app/pos/jobs/components/job-queue.tsx \
  src/app/api/pos/jobs/schedule/ \
  src/app/api/pos/appointments/ \
  src/app/admin/appointments/components/appointment-detail-dialog.tsx \
  src/app/pos/components/appointments/
```

### Migrations since 15e shipped

- `20260527000000_pos_jobs_unified_schedule_flag.sql` — the seed
  itself (the OFF default this flip overrides).
- `20260602004932_seed_quote_request_sms_templates.sql` — SMS
  template seed, unrelated.

`appointment_services.quantity` (added `20260526182120_*`,
2026-05-26) shipped BEFORE 15e — the schedule route already
selects it in its embed (`schedule/route.ts:110`). No incompatibility.

### Spot-check on operator-mentioned concerns

- **Track-A / Track-B Sale-vs-Quotes work (#115-#124)** —
  touched `ticket-panel.tsx`, `sale-ticket-panel.tsx`,
  `quote-ticket-panel.tsx`, `register-tab.tsx`, `catalog-browser.tsx`,
  `useValidatedServiceAdd`. None of these are loaded by
  `job-queue.tsx` or by the Schedule endpoint. No interaction with
  the gated path.
- **Vehicle taxonomy / classifier (#125-#143)** — touched
  `step-vehicle.tsx`, `account/vehicle-form-dialog.tsx`,
  `vehicle-categories.ts`, `pos/vehicle-create-dialog.tsx`,
  `api/customer/vehicles`. None loaded by `job-queue.tsx`. No
  interaction with the gated path.
- **DB schema changes** — `appointment_services.quantity` already
  in the schedule route's embed; no breakage. No other
  appointment- or jobs-table changes since 15e.

### Drift conclusion

Single relevant touch (#110) is **strictly an improvement** to a
function the flag-ON path calls. The flag-ON code is in the same
shape it was when 15e closed, only with a small bug fix layered
on. No transitive risk.

---

## TARGET D — Risk inventory

For each plausible failure mode under flag ON:

| ID | Severity | Risk | Mitigation |
| --- | --- | --- | --- |
| R1 | Minor | `useFeatureFlag` could mis-fetch the flag on initial render and flash incorrect UI | Hook already debounces via React-Query (standard `useFeatureFlag` pattern); worst case 1 render tick of Today-only chrome before the toggle appears. Not a Schedule-side regression. |
| R2 | Minor | Operators on iPad might confuse the new toggle with the existing Timeline/List view toggle | UX-only; no data risk. Toggle styling deliberately mirrors the view-mode toggle (per the CHANGELOG #109 entry). Quick operator briefing covers this. |
| R3 | None | Performance — flag ON adds a 30-day appointment range fetch | The fetch fires only when the operator clicks Schedule. Today scope is unchanged. Schedule scope itself reuses an existing query shape. |
| R4 | None | Data integrity — Schedule-scope writes could materialize jobs prematurely | Three independent gates (B5 polling, B6 pollJobs, B7 populateFromAppointments) all bail on Schedule scope. The Phase 1B test suite locks this with 6 dedicated tests in `job-queue-schedule-scope.test.tsx`. |
| R5 | None | Permission/role issues — flag ON exposes UI to roles that shouldn't see it | Schedule endpoint requires `appointments.view_today` permission (`schedule/route.ts:44-55`), same gate the existing Today scope uses. No role expansion. |
| R6 | None | Dialog mount fails on the Schedule path due to #110's drift | #110's fix IS the dialog-mount safety net for the Schedule-card-tap path; before #110, mounting would have crashed; post-#110 it works. Test coverage at `get.test.ts:+3`. |
| R7 | None | Mobile/desktop differences in the Schedule UX | The Schedule list (`<ScheduleScopeList>`) is a vertical card stack — same responsive pattern as the Today job list. Dialog reuses admin's already-mobile-tested layout. |
| R8 | Minor | A future seed re-run could clobber the operator's flipped value | Mitigated: the seed migration uses `ON CONFLICT DO NOTHING`, so a re-run leaves the operator's value alone. The flip migration in this session will similarly be idempotent. |

**Overall severity: NONE-to-Minor across all risks. No Moderate, no Significant, no Critical.**

Audit recommendation per the prompt: "If Target D finds no risks: Option (i) is acceptable." → **Option (i) — direct flip via new migration.**

---

## TARGET E — Flip strategy

Three options surfaced; recommendation per Target D verdict:

### Option (i) — Direct flip (RECOMMENDED)

Write a new migration `20260603000000_enable_pos_jobs_unified_schedule.sql`:

```sql
-- Item 15e Phase 3 — enable the POS Jobs unified-schedule feature flag.
--
-- Companion to 20260527000000_pos_jobs_unified_schedule_flag.sql (the seed,
-- which inserted the row with enabled=false ON CONFLICT DO NOTHING). Phase 1A/1B/2A/2B
-- shipped 2026-05-27 (sessions #103-#109) with the flag OFF awaiting operator rollout.
-- Pre-flight audit (Session #146, POS_JOBS_UNIFIED_SCHEDULE_FLAG_FLIP_PREFLIGHT.md):
-- 2869/2869 tests pass, no drift on gated code paths since #109, single defensive
-- improvement (#110) on a dialog-mount endpoint.
--
-- Idempotent: re-running this migration sets enabled=true again, no change. The
-- seed migration's ON CONFLICT DO NOTHING means a hypothetical re-seed of the
-- prior file would NOT downgrade this value back to false (the row already
-- exists, ON CONFLICT no-ops the entire VALUES clause).

UPDATE feature_flags
SET enabled = true,
    updated_at = NOW()
WHERE key = 'pos_jobs_unified_schedule';
```

Apply path:

- **Local:** `npx supabase db push` (the project's standard migration apply step) or run the SQL directly against the local Supabase via the admin UI / `psql`.
- **Production:** the operator's deploy pipeline runs new migrations on push. If the operator has a manual prod-DB step (the CLAUDE.md doesn't specify), the SQL above is run directly against prod `feature_flags`.

Rollback: a one-liner `UPDATE feature_flags SET enabled = false WHERE key = 'pos_jobs_unified_schedule';` returns to pre-flip state. The OFF code path is byte-identical to pre-15e per Target B summary.

### Option (ii) — Staged flip (NOT NEEDED, but documented)

Apply locally → smoke-test → apply to production. Smart Details has no separate staging environment; "staged" here means "local-first verification before pushing the migration to the production DB." Given the test-suite coverage already confirms local correctness (29/29 + 100/100 + 2869/2869 pass), Option (ii) collapses to Option (i) in practice.

### Option (iii) — Defer (NOT APPLICABLE)

Surfaced for completeness. Pre-flight Target D found no risks at Moderate severity or above, so defer is not warranted.

---

## Hard-rules verification

- ✅ Worktree isolation — performed in `~/Claude/SmartDetails/wt-flag-flip` on branch `chore/pos-jobs-unified-schedule-flag-flip`, base `9e2bc69a`.
- ✅ Read-only audit step (this doc) precedes the flip step.
- ✅ Every Target B path cites file:line.
- ✅ Every Target C drift assessment cites the commit / session.
- ✅ Tests run + passing (2869/2869) before the flip is applied.
- ✅ Memory #11 — verified against actual code, not theorized from CHANGELOG summaries.
- ✅ Memory #29 — pre-flight is the FIRST step. The flip migration is the second.
- ✅ Memory #2 — flip mechanism reuses the established `feature_flags`-table + migration pattern; no new invented machinery.
- ✅ Memory #8 — total files modified by this session: 1 new migration + 1 new pre-flight doc + 1 CHANGELOG entry + 1 ROADMAP-13-ITEMS update = 4 files; well under the ≤2 source files + 1 doc bound the prompt sets (no source files modified at all).

---

## Cross-references

- `supabase/migrations/20260527000000_pos_jobs_unified_schedule_flag.sql` — the seed (OFF default).
- `supabase/migrations/20260603000000_enable_pos_jobs_unified_schedule.sql` — **NEW this session** — flips to ON.
- `src/app/pos/jobs/components/job-queue.tsx:253, :260, :355, :425, :448, :579, :614, :641, :673` — every gate cited in Target B.
- `src/app/api/pos/jobs/schedule/route.ts` — the read-only Schedule endpoint (no flag check; reachable only via client-side toggle).
- `src/app/pos/jobs/components/__tests__/job-queue-schedule-scope.test.tsx` — 18 tests covering load-bearing invariants + toggle UI + Phase 2B dialog flow.
- `src/app/api/pos/jobs/schedule/__tests__/route.test.ts` — 11 tests on the endpoint.
- `docs/CHANGELOG.md` — Session #109 (15e closure), Session #110 (cardinality corrective), Session #146 (this flip).
- `docs/dev/ROADMAP-13-ITEMS.md:1228+` — Item 15e entry; updated this session with the flag-flipped status note.
