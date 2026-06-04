# "Edit in POS" Button — Targeted Audit (POS > Jobs > Schedule)

> Read-only Targeted audit, 2026-06-03. Branch:
> `audit/edit-in-pos-button-broken-from-schedule`.
> Memory #29 type 1 (Targeted).
>
> **Operator's report:** on POS > Jobs > Schedule, tapping an
> appointment card opens the dialog. Inside the dialog, the "Edit in
> POS" button does nothing when tapped. The button was built to let
> operators pull an upcoming appointment INTO the active POS ticket
> flow — for adding/removing services when the customer calls to
> modify the appointment.
>
> **STATUS — ✅ RESOLVED (Session #150, 2026-06-03).** All 3 operator
> decisions LOCKED + applied per Target F: Q1 Option 2 (parameterized
> `returnToPath` prop replaces the `onEditInPos` no-op suppression);
> Q2 (`no_show` added to `canEditServices` exclusion via the new
> shared `isServiceEditableStatus` predicate in `status-transitions.ts`,
> lockstep with the load-endpoint refusal set in `service-edit.ts`);
> Q3 (POS Schedule scope test strengthened to assert
> `returnToPath === '/pos/jobs'`; dialog-level tests added covering
> render-gate + URL contract for both contexts). Fix scope: 4 prod
> files / +26 net production lines (under Memory #8 ≤50 target),
> 2 test files, +5 net test cases; tsc 0, lint 0err/97warn,
> 2967/2967 tests, build clean. See `docs/CHANGELOG.md` Session #150
> for the full file-by-file breakdown.

---

## TL;DR

- **Root cause:** the dialog renders the button when `canEditServices && appointment` is truthy (`appointment-detail-dialog.tsx:247`). Its click handler is `onEditInPos ? onEditInPos() : router.push(deep-link)` (`:250-258`). The POS Schedule host passes `onEditInPos={() => { /* no-op */ }}` (`job-queue.tsx:1233-1235`). Because the prop is set, the truthy branch runs the no-op → click does nothing.
- **The no-op is deliberate.** Phase 2B commit `ad4f6269` introduced it with the explicit comment *"already in POS — suppresses the admin deep-link button."* The dialog's prop docstring (`:67-75`) codifies the same intent: "pass a no-op to suppress the deep-link in a POS context."
- **The button has NEVER worked from POS Schedule.** This is not a regression — it was wired this way at Phase 2B (its first POS mount, `ad4f6269`, before #146).
- **But the design conflates two things.** "Suppress the deep-link" was a UX assumption ("we're already in POS, no need to navigate"); the button's PURPOSE — open the appointment in the Sale tab so its services can be added/removed via the ticket flow — is exactly what the operator wants from POS Schedule too. The deep-link `/pos?source=appointment&id=...` IS the canonical edit-services path, and it works just as well from `/pos/jobs` as from `/admin/appointments` (the destination is the same drain hook + same Sale tab; only `returnTo` differs).
- **Fix scope:** small. Either (a) hide the button in POS context if "no edit-in-POS from POS" is the desired UX, or (b) wire POS to use the same deep-link with `returnTo=/pos/jobs`. **Operator decides** (Target F, Q1).

---

## Target A — Where is the button?

### A.1 — File:line of the button render

`src/app/admin/appointments/components/appointment-detail-dialog.tsx:247-264`:

```tsx
{canEditServices && appointment && (
  <button
    type="button"
    onClick={() =>
      onEditInPos
        ? onEditInPos()
        : router.push(
            `/pos?source=appointment&id=${appointment.id}&returnTo=${encodeURIComponent(
              '/admin/appointments'
            )}`
          )
    }
    className="absolute right-12 top-4 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
  >
    <MonitorSmartphone className="h-4 w-4" />
    <span>Edit in POS</span>
  </button>
)}
```

### A.2 — What component renders it?

`AppointmentDetailDialog` — the shared admin/POS dialog at the file above. Per the prior state-machine audit (`docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` B.3, commit `c2f7e265` Phase 2A), this dialog is reused dual-context: mounted by both the admin appointments page AND the POS Jobs Schedule scope (via `job-queue.tsx:1219`).

### A.3 — Is it wrapped in any conditional?

Yes — `canEditServices && appointment` (`:247`). `canEditServices` is derived at `:191-194`:

```tsx
const canEditServices =
  canReschedule &&
  appointment.status !== 'completed' &&
  appointment.status !== 'cancelled';
```

So the button renders when ALL of:
1. `appointment` is non-null (parent passes a real row).
2. `canReschedule === true` (parent passes the `appointments.reschedule` permission grant — in POS, sourced from `usePosPermission('appointments.reschedule')` at `job-queue.tsx:238`).
3. Appointment status is NOT `completed` and NOT `cancelled`. Importantly: `pending`, `confirmed`, `in_progress`, and `no_show` ALL satisfy this gate. (Note: `no_show` slipping through here is inconsistent with the service-edit refusal at `lib/appointments/service-edit.ts:242-251` which DOES block `no_show` — see "Adjacent observation" at the end of Target E.)

### A.4 — Does it appear in BOTH admin and POS contexts, or is it POS-only?

Both. The dialog component is one source-of-truth (`appointment-detail-dialog.tsx`); the button render-conditional doesn't gate on host context — only on permission + status. The button is visible in both surfaces whenever `canEditServices` evaluates true. The HANDLER behaves differently per host: admin runs `router.push(deep-link)`; POS runs the no-op.

---

## Target B — What does the click handler do?

### B.1 — Is there a click handler attached?

Yes. `onClick={() => onEditInPos ? onEditInPos() : router.push(...)}` at `appointment-detail-dialog.tsx:250-258`.

### B.2 — What does the handler do step-by-step?

The handler is a ternary on the `onEditInPos` prop:

| Branch | When | Behavior |
| --- | --- | --- |
| `onEditInPos()` | When `onEditInPos` is truthy (any function, including no-op) | Calls the prop. |
| `router.push(...)` | When `onEditInPos` is `undefined` or otherwise falsy | Navigates to `/pos?source=appointment&id=${appointment.id}&returnTo=${encodeURIComponent('/admin/appointments')}` via Next.js `useRouter`. |

**In the POS Schedule mount:** `onEditInPos` IS set (to a no-op) at `job-queue.tsx:1233-1235`:

```tsx
onEditInPos={() => {
  /* no-op: already in POS — suppresses the admin deep-link button */
}}
```

So the truthy branch fires → no-op runs → click produces zero observable effects.

**The deep-link destination (router.push branch):** the `/pos?source=appointment&id=<uuid>&returnTo=<path>` URL is consumed by the `useEditModeDrain` hook at `src/app/pos/hooks/use-edit-mode-drain.ts:14-32`:

```ts
/**
 * When the operator lands at `/pos?source=appointment&id=<uuid>&returnTo=...`
 * (or `source=job`), this hook fetches the source record via its POS-authed
 * load endpoint and dispatches `ENTER_EDIT_MODE` so the Sale tab opens with
 * the record's services + customer + vehicle + modifiers pre-populated.
 */
```

So in the admin path the deep-link does exactly what the operator described — it opens the appointment in the POS Sale tab with services pre-loaded, ready for add/remove. **This same deep-link would work identically from POS Schedule** (`/pos/jobs` → `/pos?source=...` is same-origin internal nav; the drain hook does not care which page initiated the navigation).

### B.3 — Does the handler have any guards that might prevent execution?

Not in the handler itself. The only gate is the parent conditional on `canEditServices && appointment` for whether the button RENDERS. Once rendered, the handler is unconditionally wired and unconditionally executes (the prop guard is the only branch).

There is NO host-context awareness in the handler — the dialog doesn't know if it's mounted by admin or POS; it just reacts to the `onEditInPos` prop's presence.

### B.4 — Error handling?

None. The no-op cannot throw. The admin-path `router.push` is fire-and-forget; navigation failures (e.g., the destination throwing during render) would surface via Next.js error boundaries, not the dialog. There's no toast, no console log, no telemetry on the button's path.

---

## Target C — Reproduce the failure

### C.1 — Operator POV vs code POV

**Operator POV:**

1. Open POS, go to Jobs, switch to Schedule scope.
2. Tap an upcoming appointment card.
3. Dialog opens with appointment details + the "Edit in POS" button visible at top-right.
4. Tap "Edit in POS."
5. **Nothing happens.** No navigation, no toast, no visible state change.

**Code POV (line-by-line):**

1. Tap triggers the button's `onClick` at `appointment-detail-dialog.tsx:250`.
2. The arrow function evaluates `onEditInPos ? onEditInPos() : router.push(...)`.
3. `onEditInPos` is the function passed by the POS host (`job-queue.tsx:1233-1235`); the function reference is truthy.
4. The truthy branch executes `onEditInPos()` — which is `() => { /* no-op: already in POS — suppresses the admin deep-link button */ }`.
5. The no-op completes (returns `undefined`); React re-renders nothing because no state changed.
6. The user sees zero visible response.

### C.2 — Possible failure modes (each evaluated)

| Failure mode | Verdict | Evidence |
| --- | --- | --- |
| Handler is null/undefined (no onClick wired) | **REJECTED** | The onClick IS wired at `:250`. The handler runs; it just runs a no-op. |
| Handler runs but throws silently | **REJECTED** | The no-op has no body; it cannot throw. Console-clean confirmed by code reading. |
| Handler navigates, destination 404s | **REJECTED** | Admin path's deep-link navigates and renders POS Sale tab (verified at `use-edit-mode-drain.ts:14-32`). POS path doesn't navigate at all. |
| Handler navigates, destination doesn't render appointment | **REJECTED for admin** (the drain hook fetches `/api/pos/appointments/${id}` and dispatches `ENTER_EDIT_MODE`; this is the working admin path). N/A for POS — no navigation happens. |
| Handler is conditional on prop/state POS Schedule doesn't provide | **THIS IS IT.** The conditional `onEditInPos ?` flips behavior based on the prop. POS provides a no-op for the prop, deliberately. |
| Button is behind a transparent overlay / pointer-events: none | **REJECTED** | Button styling at `:259` is straightforward (`absolute right-12 top-4`, no overlays, no `pointer-events: none`). Admin tests (`edit-services-disabled.test.tsx:101-104`) assert `disabled === false` and `aria-disabled !== 'true'`. |
| aria-disabled / disabled attribute | **REJECTED** | No `disabled` attribute on the button (`:248-263`); the styling has no disabled state. |

**Single root cause:** prop-driven branch in the click handler. POS Schedule's no-op disables the deep-link by design.

---

## Target D — Context awareness

### D.1 — Does the dialog render differently per host context?

Yes — via three context props introduced in Phase 2A (`c2f7e265`) and documented at `appointment-detail-dialog.tsx:67-79`:

- `mobileModalMode: 'admin' | 'pos'` — switches the `<EditMobileModal>`'s auth backend (admin `adminFetch` vs POS `posFetch` + POS mobile-zones endpoint).
- `modifierVariant: 'admin' | 'pos'` — switches `<ModifierSummary>` dark-aware styling.
- `onEditInPos?: () => void` — **OVERRIDES the "Edit in POS" button's CLICK BEHAVIOR**. The dialog's docstring (`:72-75`) says:

  > When provided, it is called instead of the admin router.push deep-link. When the prop is explicitly set (even to a no-op) the default admin deep-link is not used; pass a no-op to suppress the deep-link in a POS context.

**Critical observation:** the prop overrides BEHAVIOR but NOT the button's VISUAL render condition. The button still renders whenever `canEditServices && appointment` evaluates true — regardless of whether the handler is real or no-op. So a UX of "visible button that does nothing" is exactly what the prop's docstring authorizes.

### D.2 — Is there a prop or context value POS Schedule doesn't pass?

POS Schedule passes ALL the context props it should:

| Prop | POS Schedule value | File:line |
| --- | --- | --- |
| `mobileModalMode` | `"pos"` | `job-queue.tsx:1231` |
| `modifierVariant` | `"pos"` | `job-queue.tsx:1232` |
| `onEditInPos` | `() => { /* no-op */ }` | `job-queue.tsx:1233-1235` |

This is the canonical POS mount shape. The test at `job-queue-schedule-scope.test.tsx:300-302` asserts the prop shape:

```ts
expect(lastDetailProps?.mobileModalMode).toBe('pos');
expect(lastDetailProps?.modifierVariant).toBe('pos');
expect(typeof lastDetailProps?.onEditInPos).toBe('function');
```

Test 2's `typeof onEditInPos === 'function'` assertion is satisfied trivially by the no-op. **The test suite does NOT lock down what the button DOES — only that the prop is a function.** A regression in the prop shape would be caught; a regression in the button's UX (i.e., "button does nothing") would NOT be caught because that's the locked behavior.

### D.3 — Was the button originally built for admin, and is the POS context missing required setup?

Yes and partially. Git archaeology:

| Commit | Date | What |
| --- | --- | --- |
| `c89e941e` | (pre-Phase 2A) | "feat(pos): source-side affordances for edit-via-POS + Layer 8c polish (Phase 1 Layer 8d)" — introduces the deep-link drain hook. Button is rendered as an inline text link inside the Services block. |
| `b87bc2ce` | 2026-05-17 | "fix(pos): Phase 1 Layer 8d UAT fixes ... Edit-in-POS button (Layer 8d-bis)" — promotes the in-Services text link to a top-right button styled to match the admin shell's "Open POS" pattern. **At this point the dialog is admin-only.** |
| `c2f7e265` | Item 15e Phase 2A | "shared lift + dialog parameterize + POS PATCH endpoint" — adds the `onEditInPos?: () => void` prop and the docstring at `:67-75`. **Establishes the "POS pass no-op to suppress" pattern.** |
| `ad4f6269` | Item 15e Phase 2B | "Item 15e Phase 2B — mount admin dialog in POS Jobs Schedule scope + status pill" — POS host first mounts the dialog and passes `onEditInPos={() => {}}` per the Phase 2A pattern. **This is the commit that wires up the broken-from-Schedule UX.** |

**The button has never had a working POS path.** Phase 2A added the prop to suppress it; Phase 2B used the suppression as designed. Neither phase considered whether the operator might want to use the button FROM the Schedule scope. The recent N+1 / N+2 filter work (Sessions #148, #149, commits `871821ef`, `2af562c6`) didn't touch this code.

---

## Target E — Recommended fix scope

The audit's job is to identify WHY nothing happens — the fix scope follows from operator's call on Q1 (Target F). Both options are small.

### Option 1 — Hide the button in POS context entirely

If the operator confirms "no Edit-in-POS button needed when already in POS," the fix is purely visual.

**Change:** add a `showEditInPos?: boolean` prop (default `true`) to the dialog. Gate the button render on that prop:

```tsx
{showEditInPos && canEditServices && appointment && (...)
```

POS Schedule mount passes `showEditInPos={false}` (and can also drop the no-op `onEditInPos` since it's redundant once the button is hidden).

**Files touched:** `appointment-detail-dialog.tsx` (+2 lines), `job-queue.tsx` (1 line change). Plus admin test additions (assert the button visibility when prop unspecified vs false) and POS test additions (assert button is NOT visible). ~10-15 lines total.

**UX impact:** operator no longer sees the button on POS Schedule. They have to use a different path to edit services on a future appointment (e.g., navigate to admin Appointments? — Q-Operator below).

### Option 2 — Wire POS to actually deep-link into the Sale tab (RECOMMENDED)

If the operator confirms "I want the button to open this appointment in the Sale tab from POS Schedule too," the fix wires the same deep-link with a POS-appropriate `returnTo`.

**Change:** the POS host passes a real handler instead of a no-op:

```tsx
// job-queue.tsx
const router = useRouter(); // already imported at :4
// ...
onEditInPos={() => {
  router.push(
    `/pos?source=appointment&id=${selectedAppointment.id}&returnTo=${encodeURIComponent('/pos/jobs')}`
  );
}}
```

Or, more idiomatic — pass `undefined` so the dialog's default `router.push` runs, and PARAMETERIZE the `returnTo` via a new prop:

```tsx
// dialog
returnToPath?: string;  // default '/admin/appointments'
// ...
router.push(
  `/pos?source=appointment&id=${appointment.id}&returnTo=${encodeURIComponent(returnToPath ?? '/admin/appointments')}`
)
```

POS Schedule mount passes `returnToPath="/pos/jobs"` and drops the `onEditInPos` no-op entirely.

**Files touched:** `appointment-detail-dialog.tsx` (+1 prop + ~3 line handler change), `job-queue.tsx` (drop no-op, add returnToPath). Plus admin test re-pin (default returnTo unchanged), POS test (new — clicking dispatches deep-link with `/pos/jobs` returnTo). ~15-25 lines total.

**UX impact:** matches operator's stated workflow. Tap "Edit in POS" → navigate to /pos with the appointment drained into the Sale tab. After Save the Layer 8c "Save Changes → router.push(returnTo)" navigation returns to `/pos/jobs`. The same drain + edit + save flow that works from admin works from POS Schedule.

**Verification the drain hook accepts this:**
- `use-edit-mode-drain.ts:36-37` validates `id` is UUID — passes.
- `isSafeInternalPath` at `use-edit-mode-drain.ts:52-66` validates `returnTo` is same-origin (must start with `/`, no protocol-relative, no dangerous schemes). `/pos/jobs` passes.
- The hook fetches `/api/pos/appointments/${id}/load` (POS-authed) — works in both admin (via cookie session bridging to POS HMAC? — verify; admin's "Edit in POS" landed working per existing test) and POS contexts.

**Recommendation:** Option 2 with the `returnToPath` prop variant — cleaner, less ad-hoc, matches Phase 2A's existing prop pattern.

### Test coverage to add (regression-lock)

Either option needs:
- A POS-context test asserting the new behavior (button hidden OR button navigates with `/pos/jobs` returnTo).
- An admin-context test asserting the existing behavior is unchanged (button still navigates to `/pos?...&returnTo=/admin/appointments`). The current `edit-services-disabled.test.tsx:106-128` test covers admin; verify it still passes after the prop addition.
- For Option 2: drain-hook verification that `/pos?source=appointment&id=...&returnTo=/pos/jobs` round-trips end-to-end via UAT (the existing `edit-services-deep-link.test.ts` covers `source=job` deep-link contract; add `source=appointment` from POS).

### Adjacent observation (not part of this audit's scope)

`canEditServices` at `:191-194` excludes `completed` and `cancelled` but NOT `no_show`. The service-edit cascade at `lib/appointments/service-edit.ts:242-251` refuses ALL THREE terminal statuses (`completed`, `cancelled`, `no_show`). So the button is visible on `no_show` appointments but clicking would (if the handler worked) deep-link to POS → drain hook would 400 at `/api/pos/appointments/${id}/load` because `no_show` is in that endpoint's refusal set (per `b87bc2ce` Fix 3). **Not introduced by this audit; flagged for visibility.** If Option 2 is taken, add `no_show` to `canEditServices`'s exclusion list to keep the button render-gate lockstep with the load-endpoint refusal set.

---

## Target F — Open operator decisions

**Q1 — What should the "Edit in POS" button do FROM POS Schedule?** This is the only blocking decision.

Three plausible answers; pick one:

- (a) **Hide it entirely.** Option 1 above. Operator uses admin path or some other route to edit services on a future appointment from the POS context. Smallest change, but removes operator affordance the audit was prompted by.
- (b) **Same behavior as admin — deep-link to /pos with services pre-loaded.** Option 2 above. Operator's stated workflow ("pull an upcoming appointment INTO the active POS ticket flow"). Matches admin UX byte-for-byte.
- (c) **Different POS-native behavior** (e.g., navigate to the existing Sale tab in-page without a full URL nav). Larger change; only relevant if there's a reason in-page state preservation matters (e.g., a half-built ticket the operator doesn't want to lose). The current deep-link discards in-progress ticket state — verify this isn't a concern for the operator.

The audit recommends (b). Operator confirms.

**Q2 — If (b), should the dialog also surface the button on `no_show` appointments?** Currently it does (since `canEditServices` excludes only completed/cancelled), but the destination endpoint would 400. Either tighten `canEditServices` to include `no_show` in the exclusion set, OR add the analogous load-endpoint terminal refusal at the click-handler level. Adjacent to Q1 but operator should confirm UX preference.

**Q3 — Tests in the schedule-scope suite (job-queue-schedule-scope.test.tsx:300-302) currently lock the prop SHAPE (it's a function) but not its semantic behavior.** After the fix, should the test suite assert the SEMANTIC behavior (e.g., "calling onEditInPos triggers router.push with /pos/jobs returnTo") rather than just the prop shape? Recommended yes — the prop-shape assertion was satisfied trivially by the broken no-op.

---

## Hard-rules verification

- ✅ Worktree isolation: `~/Claude/SmartDetails/wt-edit-in-pos-audit`, branch `audit/edit-in-pos-button-broken-from-schedule`, base `d3671c82`.
- ✅ No source / migration / test changes — read-only.
- ✅ Memory #11 — every claim cites file:line. Handler trace was line-by-line from the click through the prop branch through the no-op definition. Git archaeology proved the "never worked from POS" finding, not assumed.
- ✅ Memory #29 Targeted — confined to the "Edit in POS" button's click path. Did NOT expand into:
  - The dialog's other context props (`mobileModalMode`, `modifierVariant`) which are working as designed (cited for context only).
  - The drain hook (`use-edit-mode-drain.ts`) which is working in admin context (cited as the destination, not audited).
  - The Phase 2B suite of dialog props broadly (each is its own concern; only `onEditInPos` was in scope).
  - The `no_show`-in-`canEditServices` gap (surfaced in Target E "Adjacent observation" and Target F Q2 but not expanded).
- ✅ Honest finding on history: the button **has never functioned** from POS Schedule. This is not a regression. Surfaced plainly in TL;DR and Target D.3.

---

## Cross-references

- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:67-79` — `onEditInPos?: () => void` prop docstring (the suppress-with-no-op pattern).
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:191-194` — `canEditServices` derivation.
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:247-264` — button render + handler.
- `src/app/pos/jobs/components/job-queue.tsx:22-26` — POS host mount-shape comment.
- `src/app/pos/jobs/components/job-queue.tsx:238-240` — POS permission reads (`canReschedule`, `canCancel`, `canAddNotes`).
- `src/app/pos/jobs/components/job-queue.tsx:1218-1237` — POS dialog mount.
- `src/app/pos/jobs/components/job-queue.tsx:1233-1235` — the no-op `onEditInPos`.
- `src/app/pos/hooks/use-edit-mode-drain.ts:12-32` — drain hook docstring (what the deep-link does).
- `src/app/pos/hooks/use-edit-mode-drain.ts:52-66` — `isSafeInternalPath` validator (proves `/pos/jobs` returnTo would be accepted).
- `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx:85-128` — admin tests asserting the deep-link click contract.
- `src/app/pos/jobs/components/__tests__/job-queue-schedule-scope.test.tsx:297-305` — POS test asserting prop shape (NOT semantic behavior).
- `src/lib/appointments/service-edit.ts:242-251` — load-endpoint terminal refusal (cited in adjacent observation re: `no_show`).
- Commit `c89e941e` — original Layer 8d that introduced the deep-link drain + in-Services text link.
- Commit `b87bc2ce` — Layer 8d-bis that promoted the link to the top-right button.
- Commit `c2f7e265` — Phase 2A that introduced the `onEditInPos` suppress-prop pattern.
- Commit `ad4f6269` — Phase 2B that mounted the dialog in POS Schedule with the no-op.
