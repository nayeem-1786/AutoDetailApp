# Appointment Status State-Machine — Targeted Audit

> Read-only targeted audit, 2026-06-03. Branch:
> `audit/appointment-status-state-machine-transition-matrix`.
> Memory #29 type 1 (Targeted).
>
> **Operator's reported errors on POS > Schedule edit dialog:**
>
> ```
> "Cannot change status from "confirmed" to "pending""
> "Cannot change status from "in_progress" to "no_show""
> ```
>
> Both are reasonable operator workflows (customer un-confirming;
> customer no-shows mid-job) that the state machine rejects.
> Audit's job: enumerate every blocked transition, identify
> WHERE/WHY the machine exists, and identify what depends on it.
> Operator decides scope of fix AFTER seeing the full picture.

---

## TL;DR

- The state machine lives in **one file** —
  `src/lib/appointments/status-transitions.ts:15-22` — as a pure
  `Record<AppointmentStatus, AppointmentStatus[]>` map.
- Enforced server-side on **the POS PATCH only**
  (`/api/pos/appointments/[id]:236-251`); the admin PATCH at
  `/api/appointments/[id]` does **NOT** enforce it.
- The shared `<AppointmentDetailDialog>` offers **all 6 statuses**
  as options (current + STATUS_TRANSITIONS forward set as
  "recommended"; the rest under an "Override" optgroup at
  `appointment-detail-dialog.tsx:478-493`). The UI never disables
  the override options.
- **Mismatch**: same dialog → admin host accepts override picks;
  POS host rejects them. Operator using the POS Schedule scope
  hits the error message; the same edit on the admin page silently
  succeeds.
- **Of 36 transition pairs: 6 self-transitions (allowed as no-ops),
  9 forward/lateral allowed, 21 blocked.** Including both errors
  the operator reported.
- One downstream side-effect to watch: webhook firings
  (`appointment_confirmed` / `appointment_completed`) fire on
  every status TRANSITION TO those values — round-trip status
  changes (confirmed→pending→confirmed) would re-fire the
  webhook. Lifecycle engine + booking reminders are NOT impacted
  (they branch off `jobs.status` / `reminder_sent_at`, not
  `appointments.status`).
- Three fix shapes surfaced in Target E. Operator picks.

---

## Target A — Full 6×6 transition matrix

Computed from `STATUS_TRANSITIONS` at
`src/lib/appointments/status-transitions.ts:15-22`:

```ts
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};
```

Plus self-transitions: enforced at
`src/app/api/pos/appointments/[id]/route.ts:240` —
`if (data.status && data.status !== current.status)` short-circuits,
so any `current === target` POST is a server-side no-op (allowed).

| From \ To       | → **pending** | → **confirmed** | → **in_progress** | → **completed** | → **cancelled** | → **no_show** |
| --- | --- | --- | --- | --- | --- | --- |
| **pending**     | ➖ self (allowed) | ✅ allowed | ❌ blocked | ❌ blocked | ✅ allowed | ✅ allowed |
| **confirmed**   | ❌ blocked **(operator error #1)** | ➖ self (allowed) | ✅ allowed | ❌ blocked | ✅ allowed | ✅ allowed |
| **in_progress** | ❌ blocked | ❌ blocked | ➖ self (allowed) | ✅ allowed | ✅ allowed | ❌ blocked **(operator error #2)** |
| **completed**   | ❌ blocked | ❌ blocked | ❌ blocked | ➖ self (allowed) | ❌ blocked | ❌ blocked |
| **cancelled**   | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked | ➖ self (allowed) | ❌ blocked |
| **no_show**     | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked | ➖ self (allowed) |

**Citations:**

- **✅ Allowed** cells trace to entries in
  `status-transitions.ts:16-18` (the only three rows with non-empty
  next-state arrays).
- **❌ Blocked** cells trace to the enforcement at
  `pos/appointments/[id]/route.ts:240-251` — `allowed.includes(data.status)`
  is the gate; rows from `:19-21` have `[]` so every change away
  from terminal states is rejected.
- **➖ Self** cells trace to the early-exit at
  `pos/appointments/[id]/route.ts:240` —
  `data.status !== current.status` short-circuits, so a self-POST
  doesn't even reach the `STATUS_TRANSITIONS` check.

**Tallies (excluding 6 self-cells):**

- ✅ Allowed: **9** (pending→3, confirmed→3, in_progress→2, plus the
  self diagonals).
- ❌ Blocked: **21**.

The operator's two reported errors are both **explicitly blocked**:

- `confirmed → pending`: not in `STATUS_TRANSITIONS.confirmed = ['in_progress', 'cancelled', 'no_show']`.
- `in_progress → no_show`: not in `STATUS_TRANSITIONS.in_progress = ['completed', 'cancelled']`.

---

## Target B — State machine source identification

### B.1 — File:line of the validation logic

- **The map** — `src/lib/appointments/status-transitions.ts:15-22`.
- **Server-side enforcement (POS)** —
  `src/app/api/pos/appointments/[id]/route.ts:236-251`:

  ```ts
  if (data.status && data.status !== current.status) {
    const allowed = STATUS_TRANSITIONS[current.status as AppointmentStatus] ?? [];
    if (!allowed.includes(data.status)) {
      return NextResponse.json(
        { error: `Cannot change status from "${current.status}" to "${data.status}"` },
        { status: 400 }
      );
    }
  }
  ```

- **Server-side enforcement (admin) — DOES NOT EXIST.** The admin
  PATCH at `src/app/api/appointments/[id]/route.ts:109` writes
  `update.status = data.status` directly with NO transition check
  in the surrounding handler (confirmed by reading the full file's
  PATCH branch — no `STATUS_TRANSITIONS` import, no allowed-list
  guard).

### B.2 — Pure data vs inline conditionals

**Pure data.** The map is a TypeScript `Record` literal at
`status-transitions.ts:15-22`, no inline conditionals. The
enforcement at the PATCH site is a single `.includes()` check.

### B.3 — When introduced (git blame)

Sequence from `git log --oneline -S "STATUS_TRANSITIONS"`:

| Commit | Message | What changed |
| --- | --- | --- |
| `44b6fd06` | Add admin appointments calendar view with edit and cancel | Initial admin appointments UI — no state machine. |
| `025cfc37` | Replace expandable cards with detail+edit popup dialog | Dialog introduced. |
| `e0258b22` | "Allow all status options in appointment status dropdown" | Earlier than the state machine — every status was offered. |
| `83e66102` | "Show recommended status transitions with override option" | **`STATUS_TRANSITIONS` introduced inside the admin dialog as a UI suggestion** — recommended group + Override optgroup. **No server enforcement at this point.** |
| `c2f7e265` | feat: Item 15e Phase 2A — shared lift + dialog parameterize + POS PATCH endpoint | **Lifted the map to `src/lib/appointments/status-transitions.ts` + ADDED server enforcement on the NEW POS PATCH endpoint only.** Admin PATCH was deliberately NOT hardened. |

The POS-only enforcement is Item 15e Phase 2A's "Decision 3" —
documented in the POS PATCH header at `route.ts:115-122`:

> "STATUS_TRANSITIONS enforced server-side — the admin route relies
> on the dialog's group split to suggest valid transitions, while
> POS enforces strictly."

### B.4 — Documentation

Two in-source locations:

- `status-transitions.ts:3-14` — module header explaining the map drives
  the dialog's "recommended" vs "override" grouping AND is enforced
  on the POS PATCH.
- `pos/appointments/[id]/route.ts:115-122` — Decision 3 rationale on
  the POS PATCH.

There is **no architectural decision record** (`docs/adr/`) for the
state machine's transition values themselves (e.g., why
`confirmed → pending` is excluded). The decisions appear baked
into commit `83e66102` without a paired discussion doc.

### B.5 — Role-aware?

**No.** The `STATUS_TRANSITIONS` enforcement is universal across
all PATCH callers regardless of role. The `appointments.update_status`
permission is checked SEPARATELY at:

- Admin PATCH: `/api/appointments/[id]/route.ts:43-46`
- POS PATCH: `/api/pos/appointments/[id]/route.ts` (checked via
  `permissionGuard`, comment at `:120-122` notes per-field gating).

A user with `appointments.update_status` permission still hits
the STATUS_TRANSITIONS block on POS. The two gates are independent.

---

## Target C — Downstream dependency inventory

For each consumer of `appointments.status`, document whether
loosening transitions could cause double-fire / lifecycle drift.

### C.1 — Webhook firings on status changes (BOTH PATCH endpoints)

`src/app/api/appointments/[id]/route.ts:132-149` (admin) AND
`src/app/api/pos/appointments/[id]/route.ts:331-353` (POS) both
fire the same webhooks on status change:

```ts
if (data.status && data.status !== current.status) {
  if (data.status === 'confirmed') {
    fireWebhook('appointment_confirmed', ...);
  } else if (data.status === 'completed') {
    fireWebhook('appointment_completed', ...);
  }
}
```

- **Trigger:** every transition WHERE the target value is
  `confirmed` OR `completed` (independent of where it came from).
- **Forward-only assumption?** No explicit. The fire condition is
  "target became {confirmed,completed} AND differs from prior."
- **Round-trip risk:** YES.
  `confirmed → pending → confirmed` re-fires
  `appointment_confirmed`. Similarly `completed → in_progress →
  completed` re-fires `appointment_completed`. **If n8n flows on
  the receiving side are not idempotent, loosening transitions
  may cause double-actions (e.g., double confirmation SMS to
  customer, double review-request, etc.).** Recommend operator
  audit n8n flows before picking Option (i).

### C.2 — Lifecycle engine review-request triggers

`src/app/api/cron/lifecycle-engine/route.ts:204-205` carries an
explicit comment:

> "Admin-manual `appointments.status='completed'` overrides still
> do NOT trigger because no jobs row is touched by that path."

Review-request automation gates on:

- `jobs.status='completed'` (`route.ts:377`)
- `transactions.status='completed'` (`route.ts:299`)

NOT on `appointments.status`. **NOT IMPACTED** by loosening
appointment-status transitions.

### C.3 — Booking reminders cron

`src/app/api/cron/booking-reminders/route.ts:31` queries:

```ts
.in('status', ['pending', 'confirmed'])
.is('reminder_sent_at', null);
```

The `reminder_sent_at` one-shot guard makes this idempotent across
status round-trips. **NOT IMPACTED.**

### C.4 — Voice agent post-call status updates

Voice agent webhooks (`elevenlabs/call-complete/route.ts`,
`cron/voice-calls-poll/route.ts`) — verified by grep:

```
grep -n "appointment.*status\|update.*status\|appointments.*update" \
  src/app/api/webhooks/elevenlabs/call-complete/route.ts \
  src/app/api/cron/voice-calls-poll/route.ts
# (no matches)
```

Voice agent CREATES appointments (POST) but doesn't PATCH status.
**NOT IMPACTED.**

### C.5 — Cancel endpoint (independent gate)

`src/app/api/pos/appointments/[id]/cancel/route.ts:10, :99-103`:

```ts
const TERMINAL_STATUSES = ['completed', 'cancelled'];
// ...
if (TERMINAL_STATUSES.includes(current.status)) {
  return NextResponse.json(
    { error: `Cannot cancel an appointment that is already ${current.status}` },
    { status: 400 }
  );
}
```

**SEPARATE state machine** in the cancel endpoint — not the
STATUS_TRANSITIONS map. Says: can't cancel an already-cancelled or
already-completed appointment. **Loosening STATUS_TRANSITIONS does
NOT affect this endpoint.**

### C.6 — Customer self-edit endpoint (independent gate)

`src/app/api/customer/appointments/[id]/route.ts:6, :151-154`:

```ts
const EDITABLE_STATUSES = ['pending', 'confirmed'];
// ...
if (!EDITABLE_STATUSES.includes(appointment.status)) {
  return NextResponse.json(
    { error: `Cannot edit an appointment that is ${appointment.status}` },
    { status: 400 }
  );
}
```

Customer portal self-edit (reschedule, etc.) is gated to
`pending|confirmed` only. **Separate constraint; NOT IMPACTED.**

### C.7 — Un-materialize modal intercept (dialog-level)

`src/app/admin/appointments/components/appointment-detail-dialog.tsx:215-224`
intercepts SAVE when:

1. status is changing, AND
2. target is an EARLIER state per `isEarlierState`
   (`src/lib/appointments/lifecycle-sync.ts:81-103` — ranks only
   forward states `pending=0, confirmed=1, in_progress=2,
   completed=3`; `cancelled` and `no_show` are deliberately NOT
   ranked), AND
3. `appointment.has_active_job === true`.

When all three hold, the dialog opens the un-materialize modal
instead of submitting the form. This is **already an explicit
"backward revert" path** in the codebase (Phase 2C-β-2). It
demonstrates that backward reverts ARE a recognized operator
workflow — but the existing path only covers reverts along the
forward axis (e.g., `completed → in_progress`); it doesn't cover
e.g. `confirmed → pending` (both have the same active-job risk if
a job has been materialized).

**Loosening transitions interacts with this intercept**: the
dialog code path checks `isEarlierState` BEFORE the form submits,
so the intercept still fires regardless of whether the server
PATCH would accept the transition. No new gap introduced.

### C.8 — POS PATCH test (locked behavior)

`src/app/api/pos/appointments/[id]/__tests__/patch.test.ts:261-264`:

```ts
it('rejects an invalid status transition (completed → pending)', async () => {
  state.appointment!.status = 'completed';
  const res = await PATCH(makeReq({ status: 'pending' }), { params });
  expect(res.status).toBe(400);
});
```

Loosening will require updating or removing this test.

### C.9 — Other state machines (orthogonal — surfaced for context only)

- `src/app/api/waitlist/[id]/route.ts:5` — `VALID_STATUS_TRANSITIONS`
  for waitlist entries. Same pattern, different domain.
- `src/app/api/admin/purchase-orders/[id]/route.ts:124-125` — purchase order
  status transitions.
- `src/app/api/admin/inventory/counts/[id]/transition/route.ts:54-55` — inventory
  count transitions.

These are independent of the appointment state machine.

---

## Target D — UI/server mismatch

### D.1 — What the dialog OFFERS

The shared `<AppointmentDetailDialog>` at
`appointment-detail-dialog.tsx:478-493` offers **all 6 statuses**:

```tsx
<Select id="detail-status" {...register('status')}>
  {recommendedStatuses.map((s) => (
    <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s]}</option>
  ))}
  {overrideStatuses.length > 0 && (
    <optgroup label="Override">
      {overrideStatuses.map((s) => (
        <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s]}</option>
      ))}
    </optgroup>
  )}
</Select>
```

Where (`:181-182`):

- `recommendedStatuses = [current, ...STATUS_TRANSITIONS[current]]`
  filtered by `availableStatuses`.
- `overrideStatuses = availableStatuses.filter(s => !recommended.includes(s))`.

Only `cancelled` is conditionally filtered out at `:178-180` when
the user lacks `appointments.cancel` permission. The other 5
statuses are always offered.

### D.2 — What each server would REJECT

| Surface | What's rejected |
| --- | --- |
| **Admin PATCH** (`/api/appointments/[id]`) | Nothing transition-wise. Accepts every status in the dropdown. The full "Override" optgroup works silently. |
| **POS PATCH** (`/api/pos/appointments/[id]`) | Every option in the "Override" optgroup. The 5 statuses Phase 2A introduced this gate for. |

This is THE mismatch the operator hit. Same dialog component, two
different server contracts.

### D.3 — Client-side guard?

**None.** The dialog renders the Override optgroup as plain
`<option>` elements with no `disabled` attribute and no
host-context awareness. The operator on POS sees the same
dropdown the admin user sees; the rejection only surfaces after
form submit via the toast at the host (`onSave` error path in
`job-queue.tsx`'s `handleSaveAppointment`).

The dialog has props for `canReschedule` / `canCancel` /
`canAddNotes` (per-field permission gates), but NO `restrictTransitions`
or equivalent prop that the POS host could set to disable the
override group. Adding one would be a small change.

---

## Target E — Three fix shapes (operator decides scope)

**Option (i) — Loosen state machine: allow all transitions.**

- **Change:** delete the STATUS_TRANSITIONS enforcement at
  `pos/appointments/[id]/route.ts:236-251`. Optionally also drop
  the map itself (admin PATCH already doesn't use it server-side;
  dialog could keep the "recommended" UI grouping by retaining the
  map data even with no server gate).
- **Files:** 1 PATCH endpoint + 1 test update (test #261-264) + optional 1
  dialog comment. ~15-25 lines.
- **Downstream risks:**
  - **MEDIUM:** `appointment_confirmed` / `appointment_completed`
    webhooks may double-fire on round-trips (C.1). Operator audit
    of n8n flows recommended.
  - **NONE:** lifecycle engine, booking reminders, voice agent, cancel
    endpoint, customer self-edit, un-materialize intercept all unaffected
    (C.2-C.7).
- **Customer expectations:** none disrupted. Restores the
  pre-Phase-2A admin-dialog behavior (commit `e0258b22` era: "Allow
  all status options").
- **Session estimate:** ~1 hour.

**Option (ii) — Loosen to a reasonable set, keep guardrails.**

- **Change:** rewrite the STATUS_TRANSITIONS map to allow the
  reverts the operator wants while keeping terminal-state blocks.
  Likely shape:

  ```ts
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['pending', 'in_progress', 'cancelled', 'no_show'],          // +pending
  in_progress: ['confirmed', 'completed', 'cancelled', 'no_show'],         // +confirmed, +no_show
  completed: [],   // terminal — kept (un-materialize modal handles backward)
  cancelled: [],   // terminal — kept (cancel-from-cancelled is its own block)
  no_show: ['pending', 'confirmed', 'in_progress'],                        // ??? — operator decides
  ```
- **Files:** 1 map file + 1-2 test updates. ~10-20 lines.
- **Downstream risks:**
  - **LOW-MEDIUM:** still some webhook re-fire risk on `confirmed`
    if `confirmed → pending → confirmed` is now allowed. Plus
    new ones if `in_progress → confirmed → in_progress` is allowed
    (no webhook on in_progress today, so this one is moot — webhooks
    only fire on `confirmed` + `completed`).
  - The `completed → *` and `cancelled → *` blocks STAY, preserving
    the un-materialize modal as the canonical "un-do completion"
    path (C.7).
- **Customer expectations:** none disrupted; matches the
  operator's two reported errors directly.
- **Session estimate:** ~1-1.5 hours.
- **Decision required:** what should `no_show → *` look like?
  Currently no_show is terminal; loosening here is a separate Q.

**Option (iii) — Role-based override.**

- **Change:** the STATUS_TRANSITIONS check at
  `pos/appointments/[id]/route.ts:236-251` becomes:

  ```ts
  const isOverrideAllowed =
    posEmployee.role === 'super_admin' || posEmployee.role === 'admin';
  if (!isOverrideAllowed && data.status && data.status !== current.status) {
    const allowed = STATUS_TRANSITIONS[...] ?? [];
    if (!allowed.includes(data.status)) return /* 400 */;
  }
  ```

- **Files:** 1 PATCH endpoint + new test cases for role-bypass. ~25-40 lines.
- **Downstream risks:** identical to Option (i) but only when the
  bypass role is the editor. Smaller blast radius if non-bypass
  roles are the majority of editors.
- **Customer expectations:** none.
- **Session estimate:** ~1.5-2 hours.
- **Decision required:** which roles bypass? `super_admin` only?
  `super_admin + admin`? Should the admin PATCH similarly require
  role-based gating to stay symmetric, or stay permissive?
- **Consideration:** Smart Details has primarily one staff editor
  (the operator). Role-based override is over-engineered for a
  single-staff environment but appropriate if multi-staff editing
  is expected in the medium term.

---

## Target F — Open operator decisions

1. **Q1 — n8n webhook idempotency.** Are the `appointment_confirmed`
   and `appointment_completed` n8n flows idempotent? If not,
   loosening (any option) may cause spurious downstream actions
   (e.g., double confirmation SMS to the customer). C.1's risk
   estimate hinges on this.

2. **Q2 — Admin/POS symmetry.** Loosening only the POS gate
   (Options i, ii, iii) means admin PATCH (which already accepts
   everything) and POS PATCH would converge. Acceptable, OR should
   the admin PATCH be similarly gated to enforce a (more permissive)
   contract symmetrically? Both endpoints share the same dialog.

3. **Q3 — `no_show` exit semantics.** Currently `no_show` is
   terminal. Operator's second error (`in_progress → no_show`)
   suggests no_show should be reachable from in_progress, but
   reverse direction (e.g., `no_show → confirmed` — the customer
   showed up an hour late) is an open question.

4. **Q4 — Interaction with the un-materialize modal.** Phase 2C-β-2's
   modal intercepts backward reverts along the forward axis when an
   active job exists. If transitions loosen, should the modal continue
   to intercept (it's an operator-helpful prompt), or should the
   loosening route around it? Recommend keeping the intercept — it's
   a separate affordance, fires at the dialog layer, and provides
   useful confirmation before deleting job records.

5. **Q5 — Audit-log expectations.** Both PATCH endpoints write
   `logAudit` (admin `:166-177`, POS at similar position) with
   `details` capturing status diffs. The audit log captures the
   transition regardless of whether it's "forward" or "backward."
   Loosening doesn't require audit-log schema changes, but the
   operator may want to ensure the admin Activity Log surfaces
   backward reverts visibly (current UI may presume forward-only).

6. **Q6 — Client-side UX polish.** Independent of Options (i)/(ii)/(iii),
   the dialog could be updated to disable Override options on the POS
   surface (closer to the locked design contract), OR to show a
   warning banner when an Override option is picked. The current
   "fail at submit" UX is not great even when the rejection is
   intentional. Operator decides whether this UX-only fix lands
   in the same session as the server change or as a follow-up.

---

## Hard-rules verification

- ✅ Worktree isolation — performed in
  `~/Claude/SmartDetails/wt-status-machine-audit` on branch
  `audit/appointment-status-state-machine-transition-matrix`, base `55af36e7`.
- ✅ No source / migration / test changes — read-only.
- ✅ File:line citations on every Target A / B / C / D claim.
- ✅ Memory #11 — the matrix was built from the actual
  `STATUS_TRANSITIONS` map + the actual PATCH `.includes()` check;
  no inference from error message text.
- ✅ Memory #29 Targeted scope — confined to the state machine
  defined in `STATUS_TRANSITIONS`. The separate `EDITABLE_STATUSES`
  (customer self-edit) and `TERMINAL_STATUSES` (cancel endpoint)
  state machines are flagged in C.5/C.6 but not expanded — they
  are orthogonal constraints with their own UX contracts and would
  belong to separate audits if operator wants to revisit them.
- ✅ Three fix shapes presented even-handedly; no pre-resolution.

---

## Cross-references

- `src/lib/appointments/status-transitions.ts:15-22` — the map.
- `src/app/api/pos/appointments/[id]/route.ts:236-251` — POS PATCH enforcement.
- `src/app/api/appointments/[id]/route.ts:104-130` — admin PATCH (no enforcement).
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:178-182, :478-493` — dialog status select; recommended vs override grouping.
- `src/lib/appointments/lifecycle-sync.ts:81-103` — `APPT_LIFECYCLE_RANK` + `isEarlierState` (the un-materialize modal's gate).
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:215-224` — un-materialize intercept.
- `src/app/api/appointments/[id]/route.ts:132-149` — admin status-change webhook fire.
- `src/app/api/pos/appointments/[id]/route.ts:331-353` — POS status-change webhook fire.
- `src/app/api/cron/lifecycle-engine/route.ts:204-205, :299, :377` — review-request triggers off jobs/transactions (not appointments).
- `src/app/api/cron/booking-reminders/route.ts:31` — reminder gate.
- `src/app/api/pos/appointments/[id]/cancel/route.ts:10, :99-103` — cancel endpoint's separate terminal block.
- `src/app/api/customer/appointments/[id]/route.ts:6, :151-154` — customer self-edit gate.
- `src/app/api/pos/appointments/[id]/__tests__/patch.test.ts:261-264` — locked transition-rejection test.
