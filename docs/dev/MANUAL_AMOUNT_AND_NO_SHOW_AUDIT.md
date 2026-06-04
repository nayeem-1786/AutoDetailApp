# Manual Amount Persistence + No Show Schedule Disappearance + Parity Overlap

> Read-only Targeted audit, 2026-06-03. Branch:
> `audit/manual-amount-and-no-show-disappearance`.
> Memory #29 type 1 (Targeted) — two operator-reported symptoms
> surfaced while verifying Edit-in-POS fix (#150, `4a03d8ea`),
> plus an explicit overlap check against the comprehensive parity
> audit (`b346d34b`).
>
> **Operator's report:**
>
> - **Issue 1:** Sale-tab manual amount entry (keypad "Add to Ticket")
>   appears in the cart but vanishes on Save Changes. Catalog services
>   persist normally.
> - **Issue 2:** Changing status `confirmed → no_show` via the dialog
>   removes the appointment from Schedule view entirely.
> - **Issue 2a:** The Schedule's "All Statuses" filter dropdown
>   doesn't actually show "all" — terminal statuses can't appear.

---

## TL;DR

- **Issue 1 root cause:** `ticket-actions.tsx:196-198` silently
  filters `itemType !== 'service'` rows out of the Save Changes
  payload. Custom (manual) amount items have
  `itemType === 'custom'` (per `pos/types.ts:16`), so they're
  dropped at client serialization. Server schema at
  `lib/appointments/edit-services.ts:28-35` requires a UUID
  `service_id` per item; it would 400 the custom row anyway. The
  documented limitation (in-source comment at `:192-194`) covers
  products + mobile_fee but does NOT mention custom amounts — and
  the keypad/surcharge entry paths in `register-tab.tsx:253-271`
  are NOT edit-mode-gated (unlike product favorites at `:103-108`),
  so the operator can add custom items in edit mode but they're
  silently dropped on save. **Silent-drop pattern, no toast, no
  warning.** Test coverage absent.
- **Issue 2 root cause:** `pos/jobs/schedule/route.ts:12, :114`
  hard-excludes `cancelled, no_show, completed` from the Schedule
  endpoint's result set ("only actionable upcoming rows" — Item
  15e Phase 1A LOCKED architecture). When the operator transitions
  to `no_show` via the dialog, the next `fetchSchedule()` call
  (triggered by `handleSaveAppointment` at `job-queue.tsx:685`)
  returns results minus this appointment. The card vanishes. This
  is documented INTENTIONAL behavior per the Item 15e POS jobs
  unified-operations audit. **Whether the operator wants it to
  STAY intentional is the Q1 decision** (Target F).
- **Issue 2a root cause:** Schedule filter dropdown at
  `job-queue.tsx:991` labels its `value=""` option "All Statuses"
  but the X2 LOCKED constraint (Session #149) restricts the
  dropdown to 3 options (pending/confirmed/in_progress) because
  the server-excluded set (`cancelled/completed/no_show`) cannot
  be in the data. The in-source comment at `:992-993` calls out
  the design but the label "All Statuses" misleads the operator
  into expecting all 6. **Label/architecture mismatch.** This is
  **the SAME dropdown the operator referred to** — confirmed via
  the report's framing ("after No Show, doesn't show all").
- **Overlap with parity audit (`b346d34b`):** **NONE for Issue 1**
  (Sale-tab cascade endpoint — outside dialog parity scope). **NONE
  for Issue 2 or 2a** (Schedule endpoint + filter — outside dialog
  parity scope). Parity Q3's PATCH-cancellation silence /
  status-override-UX / activity-log-surface concerns are all
  distinct dimensions; none cover the Schedule endpoint filter or
  the Sale-tab cascade. **Issues 1+2/2a are INDEPENDENT findings
  warranting their own sessions.**
- **Recommended sequencing:** Issue 1 (Session α) → Issue 2/2a
  (Session β, bundled — same product surface). Parity Sessions
  A/B/C as previously recommended (no fold). Issue 1 first because
  it's a silent-drop class regression (highest "future operator
  surprise" risk per the operator's framing). Issue 2/2a second
  because it requires Target F operator decisions before any code
  fires.

---

## Target A — Issue 1: manual ticket amount not persisting

### A.1 — Where manual amount is entered

`src/app/pos/components/register-tab.tsx:253-271` —
`handleAddToTicket` handler tied to the "Add to Ticket" button
below the keypad. Operator types digits → `cents` state
accumulates (`:242-247`) → click button → dispatch.

### A.2 — Where it gets stored in client state

`register-tab.tsx:262-267` dispatches `ADD_CUSTOM_ITEM` to the
ticket reducer:

```ts
dispatch({
  type: 'ADD_CUSTOM_ITEM',
  name: note.trim() || 'Custom Item',
  price: dollars,
  isTaxable: false,
});
```

The reducer creates a `TicketItem` with `itemType: 'custom'`
(per the type definition at `pos/types.ts:14-56`, item types are
the literal union `'product' | 'service' | 'custom'`). The cart
displays the row immediately and the success toast `"Added $X"`
fires (`:268`). From the operator's POV the item is "in the
ticket."

### A.3 — Save payload construction

`src/app/pos/components/ticket-actions.tsx:181-220` —
`handleSaveChanges`:

```ts
// Lines 196-198 (the critical filter):
const serviceItems = ticket.items.filter(
  (i) => i.itemType === 'service' && i.serviceId
);
if (serviceItems.length === 0) {
  toast.error('At least one service is required to save');
  return;
}
```

Then the payload body at `:211-218`:

```ts
body: JSON.stringify({
  services: serviceItems.map((i) => ({
    service_id: i.serviceId!,
    price_at_booking: i.totalPrice,
    tier_name: i.tierName,
  })),
  ...buildModifierPayload(),
}),
```

### A.4 — Is the manual amount in the payload?

**NO.** Two-line filter at `:196-198` strips every non-`service`
item. Custom rows (`itemType === 'custom'`), product rows
(`itemType === 'product'`), and mobile-fee synthetics never
appear in `services[]`. The payload contains ONLY catalog service
rows + the six modifier fields. The cart's custom $20 is
discarded between the cart UI and the network request.

### A.5 — Server-side acceptance

`POST /api/pos/appointments/[id]/services` (and the admin
sibling) call `executeServiceEdit` from `lib/appointments/service-edit.ts`,
which Zod-validates via `editServicesBodySchema`. Even if the
client included a custom row, the schema at
`lib/appointments/edit-services.ts:28-35` requires every entry's
`service_id` to be a valid UUID:

```ts
export const serviceEditItemSchema = z.object({
  service_id: z.string().uuid({ message: 'Invalid service id' }),
  price_at_booking: z.number()....,
  tier_name: z.string()...,
});
```

A custom row with `service_id: null` would fail Zod and the
endpoint would 400. So the server CAN'T accept the row even if
the client sent it — the cascade endpoint is architecturally
service-only by design.

### A.6 — Validation rejection: silent?

Two-tier silent drop:
1. Client filter strips before any network call (`:196-198`).
   No toast acknowledges the drop.
2. Hypothetically server would Zod-400 with structured error.

So today it's NEVER server-rejected — only client-dropped.

### A.7 — Catalog vs custom path

| Action | Reducer dispatch | Item shape | Save filter | Result |
| --- | --- | --- | --- | --- |
| Add catalog service from picker/favorites/search | `ADD_SERVICE` | `itemType: 'service'`, `serviceId: <uuid>` | Passes filter | Persists |
| Add catalog product from favorites (in edit mode) | gated at `register-tab.tsx:103-108` — toast.info, dispatch skipped | n/a | n/a | Never enters cart |
| Add custom amount via keypad | `ADD_CUSTOM_ITEM` | `itemType: 'custom'`, `serviceId: null` | **Fails filter — silent drop** | Cart shows it, save discards |
| Add surcharge favorite | `ADD_CUSTOM_ITEM` (line `register-tab.tsx:216-221`) | Same as keypad custom | **Same silent drop** | Same UX bug — likely a sibling instance |

### A.8 — Root cause classification

**Client-side payload omission via silent filter + missing
edit-mode entry-point gate.** The Layer 8d-bis pattern that
gated *product* favorites in edit mode (`register-tab.tsx:103-108`,
4th surface added per CHANGELOG 2026-05-17) was the right shape;
it's been EXTENDED to product favorites but not to keypad-custom
entry or surcharge favorites. Operator sees the row added → save
toast says "Changes saved" (`ticket-actions.tsx:235`) →
appointment reloads → amount gone.

### A.9 — Fix shape recommendation

**Option A (defensive, smallest):** mirror the
`register-tab.tsx:103-108` pattern at the keypad's
`handleAddToTicket` (`:253-271`) AND at the surcharge favorite
branch (`:203-224`). When `ticket.editMode === true`, refuse the
add with a toast: "Custom amounts can only be added at checkout.
Save your service changes first, then add custom items during
checkout." Matches the existing product-gate copy byte-for-byte.

Scope: ~10 lines in 1 file (`register-tab.tsx`) + 2 test cases
(keypad gate + surcharge gate, mirroring the existing
`register-tab-favorites-gating.test.tsx` pattern).

**Option B (loud, more disruptive):** at save time
(`ticket-actions.tsx:196-202`), surface a confirmation prompt if
non-service items would be dropped. "You have $X in custom items
that won't be saved. Continue with services-only, or cancel and
remove them first?" Adds operator workflow friction; mirrors how
some POS apps handle mixed-cart save.

Scope: ~30 lines in 1 file + 4 test cases.

**Option C (architectural, large):** extend the cascade endpoint
to accept custom items. Requires:
- `appointment_services` table schema change (nullable `service_id`,
  add `item_name` + `price` columns, OR a new
  `appointment_custom_items` table)
- Migration to add the new shape
- `editServicesBodySchema` widened with a discriminated union
- Server cascade logic updated
- Client filter removed
- Re-thinking how custom items interact with vehicle reprice,
  coupons, loyalty, manual discount math, modifier preservation,
  and the existing `services.length >= 1` minimum
- Re-thinking the Sale-vs-Quotes parity (Quotes path likely has
  the same silent-drop)

Scope: ~150-300 lines + migration + several tests. A small product
decision with a big implementation tail.

**Recommended:** **Option A immediate** (closes the silent-drop
class today). Operator decides whether to schedule Option C as a
follow-on after Sessions A/B/C of the parity arc.

---

## Target B — Issue 2: no_show vanishes from Schedule

### B.1 — Schedule endpoint excluded statuses

`src/app/api/pos/jobs/schedule/route.ts:12`:

```ts
const EXCLUDED_STATUSES = ['cancelled', 'no_show', 'completed'];
```

Applied at `:114`:

```ts
.not('status', 'in', `(${EXCLUDED_STATUSES.join(',')})`)
```

Three terminal statuses are removed at the database query layer
before any client filter runs.

### B.2 — Does the row actually leave the result set?

Yes. When PATCH `confirmed → no_show` writes the row, the next
`fetchSchedule()` (invoked by `handleSaveAppointment` at
`job-queue.tsx:685`) issues a fresh `GET /api/pos/jobs/schedule`,
which now excludes the row via `.not('status', 'in', ...)`. The
client's `setScheduleEntries` swaps in a list without it; React
re-renders the Schedule scope list minus the card.

### B.3 — Intentional or drift?

**Documented INTENTIONAL** per the comment block at
`schedule/route.ts:11`: *"Statuses excluded from the Schedule
scope — only actionable upcoming rows."* And per the file-level
docstring at `:14-27` citing the Item 15e Phase 1A LOCKED
architecture ("Returns FUTURE appointments that have NOT been
materialized into a job yet"). Cancelled / completed / no_show =
terminal = nothing further to do via Schedule scope.

Whether that intent matches the OPERATOR'S MENTAL MODEL is a
different question (Target F Q1). The architecture's stated
purpose is "actionable next steps"; the operator may want
"review past + present in one place."

### B.4 — What does the operator want? (OPERATOR DECIDES)

Two reasonable interpretations from the operator's report:

- **(a)** No Show appointments should remain visible in Schedule
  with a "No Show" pill so operators can review them, undo (per
  the consequence map Q3 `no_show → *` discussion), or fold them
  into history awareness. The Schedule then becomes "all
  appointments in the date range, sorted by status."
- **(b)** No Show is correctly terminal and disappearing from
  Schedule is correct behavior. Operator review happens via Admin
  > Appointments (where all 6 statuses ARE visible). The Schedule
  is a "today/tomorrow action surface" and SHOULD stay that way.

The audit does not pre-resolve. **Operator decides which model
matches their workflow.** Both have valid arguments:

- (a) reduces cognitive load (one place to see everything within
  a window); matches the operator's expressed expectation.
- (b) preserves the LOCKED Item 15e architecture; keeps the
  Schedule fast (smaller result set); aligns with the X2 dropdown
  constraint that's already shipped.

### B.5 — Fix shapes if operator chooses (a)

- **Option A — drop the EXCLUDED_STATUSES filter:**
  remove `:114` and the `EXCLUDED_STATUSES` constant. All 6
  statuses surface. Touches 1 file, ~5 lines. Breaks the X2 LOCKED
  filter constraint — the dropdown would need to add 3 more
  options (cancelled/completed/no_show). Schedule list grows by
  the terminal-status count in the window.

- **Option B — make EXCLUDED_STATUSES caller-configurable:**
  add a `?include_terminal=true` query param; default false
  (today's behavior); when true, drop the exclusion. The X2
  dropdown adds an "All (incl. terminal)" toggle that switches the
  param. Two new test cases. ~15 prod lines.

- **Option C — exclude only `cancelled` and `completed`,
  include `no_show`:** treat no_show as a "should-have-shown-up"
  category that stays visible for follow-up. Halfway between (a)
  and (b). ~3 prod lines. Schedule dropdown adds a "No Show"
  option. Aligns with the per-transition consequence map's
  finding that `no_show → *` is a real operator workflow.

**Recommended IF operator picks (a):** Option C — it matches
the operator's narrative (no_show was the reported case, not
cancelled or completed) and minimally disturbs the X2 architecture.

### B.6 — UI behavior at the moment of save

The dialog does NOT optimistically remove the row from the cached
Schedule list before the fetch. The flow:

1. Operator picks `no_show` in the dialog status dropdown → Save
   Changes.
2. `handleSaveAppointment` (`job-queue.tsx:671-695`) calls POS
   PATCH → success.
3. `closeDetailDialog()` then `await fetchSchedule()` at `:684-685`.
4. `fetchSchedule()` overwrites `scheduleEntries` with the new
   server result (sans the no_show row).
5. React re-renders Schedule list minus the row.

So the operator sees the dialog close, then a brief loading
flash, then the list redrawn without their appointment. No
animation, no confirmation, no "moved to: [link]" affordance.

**Fix shape orthogonal to B.5:** if (b) stays (Schedule is
intentionally terminal-free), add a toast after a status change
to `cancelled` / `completed` / `no_show` from POS Schedule:
"Appointment moved out of Schedule view (now [status]). Open
Admin > Appointments to review." Touches `job-queue.tsx`
`handleSaveAppointment` at `:686`. ~6 lines + 1 test.

---

## Target C — Issue 2a: "All Statuses" doesn't show all

### C.1 — What the dropdown offers

`job-queue.tsx:991-996`:

```tsx
<option value="">All Statuses</option>
{/* X2 LOCKED — only 3 valid Schedule statuses (server excludes
    cancelled/completed/no_show; offering them would be misleading). */}
<option value="pending">{APPOINTMENT_STATUS_LABELS.pending}</option>
<option value="confirmed">{APPOINTMENT_STATUS_LABELS.confirmed}</option>
<option value="in_progress">{APPOINTMENT_STATUS_LABELS.in_progress}</option>
```

Four options. The empty-value default labels "All Statuses." The
operator's expectation per the report ("doesn't show every status
option") is that "All" means all 6.

### C.2 — Reality

The dropdown can't add cancelled/completed/no_show because the
data source (`/api/pos/jobs/schedule`) never returns rows with
those statuses. Adding them as options would surface "filter that
always returns 0 results" — misleading per the X2 LOCKED
constraint.

**The label is the actual issue.** "All Statuses" is technically
true (all THAT-CAN-EXIST-HERE), but operator parsing reads it as
"every status in the universe."

### C.3 — Which dropdown is the operator referring to?

Two candidates:
- **Schedule filter dropdown** (`job-queue.tsx:991`) — labels its
  default option literally "All Statuses." Renders only 3
  selectable statuses per X2 LOCKED.
- **Dialog status-change dropdown** (`appointment-detail-dialog.tsx:480-495`)
  — recommended + Override optgroup, shows all 6 options.

**Verdict: the Schedule filter dropdown.** Three signals:
1. Only it carries the literal label "All Statuses" (the dialog
   uses status labels directly without an "All" pseudo-option).
2. The report context "after No Show, doesn't show all" fits
   "operator was filtering Schedule to find the row after status
   change" — a filter-dropdown verb, not a status-change verb.
3. The dialog's dropdown shows 6 statuses already; complaining
   "doesn't show all" against a 6-option list is incoherent.

### C.4 — Fix shape recommendation

The fix shape depends on Target F Q1's answer to "should no_show
appointments stay visible in Schedule":

- **If Q1 = (a) keep no_show visible:** the X2 LOCKED constraint
  partially loosens. Add a no_show option to the dropdown AND
  drop no_show from EXCLUDED_STATUSES (Target B Option C). Label
  stays "All Statuses" — and now means it.
- **If Q1 = (b) keep no_show hidden:** rename "All Statuses" →
  "All Active" or "All Open" or "Active Statuses." ~1 line change
  in `job-queue.tsx:991`. The dropdown still shows 3 options; the
  label now matches.

**Independent of Q1, recommended:** the rename or some clarifying
label even if (a) is chosen, because cancelled/completed would
still be filtered. The label "All" is always at least slightly
inaccurate as long as ANY status is excluded.

---

## Target D — Overlap check against parity audit (`b346d34b`)

### D.1 — Is Issue 1 (manual amount) covered by parity audit?

**NO.** The parity audit's scope is the
`AppointmentDetailDialog` + its host PATCH endpoints + cancel
endpoints + un-materialize seam. Issue 1 lives in the **Sale-tab
edit flow** — `ticket-actions.tsx`, `register-tab.tsx`,
`lib/appointments/edit-services.ts`, and the
`/api/pos/appointments/[id]/services` cascade endpoint. None are
in the parity audit's surface map.

The parity audit's Target B.6 (Service edit path) explicitly
states: *"Save Changes in the Sale tab dispatches to
/api/pos/appointments/[id]/services and on success
router.push(returnToPath)"* — but treats the Sale tab as a
downstream consumer of the dialog's deep-link, not as a parity
target itself. **Issue 1 is a Sale-tab cascade endpoint behavior
gap, not a dialog parity drift.**

Verdict: **INDEPENDENT.**

### D.2 — Is Issue 2 (no_show disappearance) covered?

**NO.** The parity audit covers status changes via the dialog's
PATCH path. Once PATCH succeeds, the audit moves on. The
DOWNSTREAM Schedule-list refetch behavior — what the Schedule
endpoint's filter returns — is the Item 15e Phase 1A
`schedule/route.ts` design, separate from dialog parity.

Closest parity-audit overlap candidates:
- **Parity B.3 (status dropdown)** — covers the dialog's
  status-change dropdown's recommended/override grouping. This is
  about the SCHEDULE FILTER dropdown — different component, same
  surface (POS Schedule scope).
- **Parity B.11 (audit log surface POS gap)** — covers the
  audit_log UI. Different.
- **Parity Q3 (PATCH-cancellation silence)** — covers the silent
  cancel via PATCH. Different — Issue 2 is about successful PATCH
  to no_show; nothing silent about the write itself.

Verdict: **INDEPENDENT.** Issue 2 is a Schedule endpoint filter
design question, not a dialog parity question.

### D.3 — Is Issue 2a (All Statuses) covered?

**NO.** Same reasoning as D.2 — Schedule filter dropdown is a POS
Schedule list concern, not a dialog parity concern. The parity
audit's status-dropdown discussion is about the DIALOG's status
chooser.

Verdict: **INDEPENDENT.**

### D.4 — Overlap summary

Zero overlap between Issues 1+2+2a and the parity audit. The
parity arc Sessions A/B/C (per `b346d34b` Target G) cover dialog
behavior + PATCH endpoint symmetry + a parity contract test;
none of those sessions naturally absorb Issues 1+2+2a.

**Recommendation:** **DO NOT fold Issues 1+2+2a into the parity
arc.** They are separate sessions targeting different surfaces.

---

## Target E — Recommended sequencing

### E.1 — Standalone vs folded

**Standalone.** Per D.4. Neither Issue 1 nor Issue 2/2a shares a
surface with the parity arc.

### E.2 — Priority ordering

| Priority | Issue | Reasoning |
| --- | --- | --- |
| 1 (highest) | **Issue 1** — manual amount silent drop | Silent-drop class regression. Operator's framing in the parity audit prompt was "missing a divergence means it'll surface later as a customer-facing surprise — exactly the pattern the operator is trying to break." Issue 1 is the same shape (silent feature suppression in the Sale-tab save flow). Fix is small (Option A ~10 lines). |
| 2 | **Issue 2 + 2a** — Schedule terminal-status visibility | Requires Target F Q1 operator decision before any code fires. Cannot be built without it. Lower urgency because operator can still see no_show appointments via Admin > Appointments. |
| 3 | Parity Sessions A/B/C | Per `b346d34b` Target G recommendations; unchanged. |
| 4 | Optional Issue 1 follow-on (Option C — cascade endpoint accepts custom items) | Architectural; defer until product decision made and the smaller fixes stabilize. |

### E.3 — Recommended session-by-session sequence

| Session | Branch | Scope | Memory #8 |
| --- | --- | --- | --- |
| **α (NOW)** | `fix/sale-tab-edit-mode-gate-custom-items` | Issue 1 Option A: gate keypad-custom + surcharge favorite in edit mode (mirror existing product-favorite gate at `register-tab.tsx:103-108`). 1 prod file + 1 test file. ~10-15 prod lines. | ✅ |
| **β** | `fix/schedule-no-show-and-all-statuses-label` | Issue 2/2a per operator Q1 decision: either (a) loosen EXCLUDED_STATUSES + add no_show to dropdown OR (b) rename label to "All Active". Includes the orthogonal "moved-out-of-Schedule" toast (Target B.6) regardless of Q1. 1-2 prod files + 2-3 test cases. ~10-20 prod lines. | ✅ |
| A (parity) | per `b346d34b` G.2 | un-materialize context fix + dashboard mount + unified hostContext prop. ~20-35 prod lines. | ✅ |
| B (parity) | per `b346d34b` G.2 | admin/POS PATCH symmetry. ~12-18 prod lines. | ✅ |
| C (parity) | per `b346d34b` G.2 | parity contract test + canUpdateStatus prop. | ✅ |

Sessions α and β can land BEFORE A/B/C without coupling — they
touch different files. Or they can interleave; no dependency.

---

## Target F — Open operator decisions

**Q1 — Schedule no_show visibility.** Should `no_show`
appointments remain visible in the Schedule list (a) or correctly
disappear when status flips to terminal (b)?

- (a) preserves operator review of the just-changed appointment +
  fits the operator's expressed expectation
- (b) preserves the LOCKED Item 15e Phase 1A architecture +
  matches the X2 LOCKED filter constraint

If (a), should the same treatment apply to `cancelled` and
`completed`, or only `no_show`?

Recommended: (a) for `no_show` ONLY (Target B Option C — minimum
architectural disturbance, matches the reported case).

**Q2 — Issue 1 fix shape.** Option A (gate the entry point —
keypad + surcharge favorite in edit mode), Option B (warn at save
time), or Option C (extend the cascade endpoint to accept custom
items)?

Recommended: **Option A immediate** (closes the silent-drop class
today + leaves Option C for separate product-decision session).

**Q3 — Issue 2a label.** Independent of Q1, should the dropdown
label "All Statuses" be renamed to something more accurate (e.g.,
"All Active") even if Q1 = (a)? Recommended: yes — Schedule
filter dropdown should never label something "All" while any
exclusion exists.

**Q4 — Issue 1 Option C scheduling.** If Option A is taken now,
should the cascade-endpoint-extension (Option C, ~150-300 lines +
migration + schema change) be scheduled as a separate follow-on
session, or accepted as a permanent limitation? Recommended:
schedule as a follow-on after Sessions A/B/C stabilize.

---

## Hard-rules verification

- ✅ Worktree isolation:
  `~/Claude/SmartDetails/wt-manual-amount-audit`, branch
  `audit/manual-amount-and-no-show-disappearance`, base `b346d34b`.
- ✅ No source / migration / test changes — read-only.
- ✅ Memory #11 — every claim cites file:line. The Issue 1
  filter (`:196-198`), the Issue 2 EXCLUDED_STATUSES (`:12, :114`),
  the Issue 2a dropdown render (`:991-996`).
- ✅ Memory #29 Targeted — scope confined to the two reported
  issues + the explicit overlap check. Did NOT expand into
  sibling silent-drop class sweeps (surcharge favorite in
  register-tab IS a sibling but only flagged in Target A.7's table,
  not expanded into its own audit).
- ✅ Operator-decision items in Target F left unresolved.

---

## Cross-references

- Issue 1 sources:
  - `src/app/pos/components/ticket-actions.tsx:192-202` (silent
    filter), `:181-244` (full handleSaveChanges).
  - `src/app/pos/components/register-tab.tsx:103-108` (existing
    product-favorite edit-mode gate — the pattern to mirror),
    `:253-271` (keypad handleAddToTicket — NOT gated), `:216-224`
    (surcharge favorite — also NOT gated).
  - `src/app/pos/types.ts:14-56` (TicketItem shape; `itemType`
    union includes 'custom').
  - `src/lib/appointments/edit-services.ts:28-35` (Zod schema —
    `service_id` required UUID).
- Issue 2/2a sources:
  - `src/app/api/pos/jobs/schedule/route.ts:11-12`
    (EXCLUDED_STATUSES + comment), `:114` (filter application),
    `:14-27` (Item 15e Phase 1A LOCKED docstring).
  - `src/app/pos/jobs/components/job-queue.tsx:685` (fetchSchedule
    after PATCH), `:991-996` (filter dropdown render — "All
    Statuses" label + X2 LOCKED comment).
- Parity audit overlap reference:
  - `docs/dev/ADMIN_POS_DIALOG_PARITY_AUDIT.md` (b346d34b) §B.3,
    §B.6, §B.11, §Q3.
- Architectural context:
  - `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` (b0efd95f)
    — status-dropdown UX mismatch carry-forward.
  - `docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md`
    (d3671c82) — no_show → * is an operator workflow per Q6.
  - `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md` (d1eb1e24,
    RESOLVED #150) — Edit-in-POS flow that surfaced both issues
    during operator UAT.
  - `CHANGELOG.md` Session #149 — X2 LOCKED dropdown constraint
    documentation.
