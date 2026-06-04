# Admin / POS Dialog Parity — Comprehensive Behavior Audit

> Read-only Component Behavior audit, 2026-06-03. Branch:
> `audit/admin-pos-dialog-parity-comprehensive`.
> Memory #29 type 3 (Component Behavior).
>
> **Operator's framing:** the shared `AppointmentDetailDialog` is
> intended to deliver identical behavior across admin and POS hosts.
> Three operator-reported symptoms have already surfaced divergences
> (`b0efd95f` state machine, `d3671c82` PATCH-cancellation gap,
> `d1eb1e24` Edit-in-POS Day-1 gap fixed in `4a03d8ea`). Each was
> patched on encounter. This audit catches up the structural
> framing: enumerate every divergence, classify intentional vs
> drift, recommend a fix arc.

---

## Executive summary

- **21 dialog-related behavior dimensions** mapped across the two
  hosts (Targets B.1 – B.13, ~21 numbered observations).
- **Classification:** **8 INTENTIONAL DESIGN** (state machine,
  cancel UX, mobile-modal mode, modifier variant, returnToPath
  parameterization, cancel endpoint scope, waitlist suppression,
  audit-source flag) / **6 UNINTENTIONAL DRIFT** (un-materialize
  context hardcode, employee_id missing from admin audit diff,
  jobs.assigned_staff_id sync admin gap, dashboard `onSave=async()=>false`
  no-op, admin `fetch()` vs POS `posFetch` 401-redirect, status-dropdown
  has no canUpdateStatus gate) / **7 SHARED VERTICAL (NOT host
  divergence)** — including 2 prior audit findings still partly open
  (PATCH-cancellation silence; status override-optgroup UX
  mismatch).
- **No-op suppression instances:** **2 found.** `onEditInPos` is
  GONE (replaced by `returnToPath` in #150); `context="admin"` is
  STILL hardcoded (Target D Finding 1 — a `"admin"` literal acts
  like the prior `onEditInPos` no-op in that it suppresses the
  intended host-context plumbing); `/admin` dashboard mount passes
  `onSave={async () => false}` (Target D Finding 2 — a literal
  failure-stub that disables Save while leaving the button
  rendered).
- **Host inference anti-patterns:** **0 found.** The dialog doesn't
  sniff its host. All host differences flow through explicit props.
- **Severity distribution among drift findings (6):** **1 HIGH**
  (un-materialize hardcode — POS revert flow silently broken on the
  10-second-edge-case path that matters); **2 SIGNIFICANT** (jobs
  assigned_staff sync admin gap; status update permission gate
  absent from dialog); **3 MODERATE** (audit-log employee_id;
  admin raw fetch; dashboard inert Save).
- **Fix arc recommendation:** **3 sessions, ~70-110 net production
  lines total.** Session A bundles the HIGH + the no-op patterns
  (un-materialize context, dashboard onSave); Session B bundles the
  PATCH endpoint symmetry (assigned_staff sync, audit-log diff,
  raw-fetch→adminFetch, optional canUpdateStatus prop); Session C
  is the cross-cutting parity contract test + the prior-audit
  follow-ons (PATCH-cancellation silence resolution per consequence
  map Q5 + status override UX mismatch per state-machine audit Q6).

---

## Target A — Intended parity model

### A.1 — Two possible models

**(a) Full parity:** dialog, PATCH contract, side effects, comms
all identical between admin and POS. Any divergence is a bug.

**(b) Scoped parity:** dialog UI identical; PATCH endpoints
intentionally differ where the role-trust boundary differs.
Admin = full back-office; POS = operator-scoped on the floor.

### A.2 — The codebase uses model (b) — explicitly

Evidence:

1. **`docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` (b0efd95f)
   §B.3 Decision 3:** the POS PATCH enforces `STATUS_TRANSITIONS`
   server-side; the admin PATCH does NOT. Commit message: "STATUS_TRANSITIONS
   enforced server-side — the admin route relies on the dialog's
   group split to suggest valid transitions, while POS enforces
   strictly." Locked decision, not an oversight.

2. **`src/app/api/pos/appointments/[id]/cancel/route.ts:25-47`
   docstring:** "Scope intentionally narrower than the admin POST at
   /api/appointments/[id]/cancel" — explicitly enumerates the
   narrower POS scope (no cancellation_fee, no waitlist
   auto-notification, notify_customer defaults to off).

3. **`src/app/admin/appointments/components/appointment-detail-dialog.tsx:67-79`
   prop docstring (post-#150):** "context-mode props. Default to
   admin behavior so the admin surface is byte-identical; POS
   callers (Phase 2B) override them."

4. **`mobile-service`/`mobile-zones`/`unmaterialize` endpoint
   duplication:** every cross-cutting flow has a parallel pair —
   `/api/{admin/pos}/...` — sharing a `lib/` executor seam
   (`executeUnMaterialize` in `lib/appointments/lifecycle-sync.ts`).
   Pattern: shared logic, divergent auth surface.

### A.3 — The model's principle

**Dialog UI is fully shared (model a within the component);
endpoints + side-effect surfaces are scoped per host (model b at
the API boundary).** Context differences flow through the dialog
as explicitly typed props (`mobileModalMode`, `modifierVariant`,
`returnToPath`, `canReschedule`, `canCancel`, `canAddNotes`) — not
through host inference and not through no-op suppression.

This principle makes the dialog's INTERNAL behavior the same
across hosts (Save closes on success, status dropdown renders the
same options, un-materialize intercept fires the same), but the
endpoints behind `onSave` / `onCancel` / `onSuccess` callbacks can
diverge by design.

### A.4 — When divergence is NOT acceptable

The principle implies a clear test for drift: **if two host mounts
produce DIFFERENT customer-facing or data-shape side effects from
the SAME operator action, that's a bug, even if it routes through
different endpoints.** Examples:

- Operator clicks Save on a status change → either both hosts fire
  the webhook or neither does. (TODAY: both fire — IDENTICAL.)
- Operator clicks "Edit in POS" → either both hosts navigate to
  the Sale-tab edit flow or neither does. (POST-#150: both
  navigate, with different returnTo paths — INTENTIONAL.)
- Operator clicks revert-to-pending with an active job → either
  both hosts execute the un-materialize seam or neither does.
  (TODAY: admin yes, POS attempts but hits wrong endpoint with
  wrong auth — BUG, see B.5 + Target D Finding 1.)

The audit's drift findings (Target C) apply this test.

---

## Target B — Complete divergence inventory

The dialog renders 6 logical blocks: (header + Edit-in-POS), (read-only
info: customer/vehicle/total), (services + modifier summary),
(mobile-service card), (cancellation-info banner), (editable form:
status + employee + date/time + notes), (footer: Cancel +
Close + Save). Plus 3 mounted child dialogs: `EditMobileModal`,
`UnMaterializeConfirmationDialog`, host's `CancelAppointmentDialog`.

### B.1 — Dialog props passed by each host

Admin has THREE mount sites; POS has ONE.

| Prop | Admin /admin (dashboard) | Admin /admin/appointments (detailer view, when !canViewFullCalendar) | Admin /admin/appointments (calendar view) | POS /pos/jobs (Schedule scope) | Status |
| --- | --- | --- | --- | --- | --- |
| `open` | state | state | state | state | IDENTICAL |
| `onOpenChange` | setter | setter | setter | setter | IDENTICAL |
| `appointment` | from list | from list | from list | from fetch | IDENTICAL data shape (`AppointmentWithRelations`) |
| `employees` | `[]` (empty array) | real list | real list | real list (bookable subset) | DIVERGENT (dashboard empty) |
| `onSave` | `async () => false` (literal failure) | real `handleSave` → admin PATCH | real `handleSave` → admin PATCH | real `handleSaveAppointment` → POS PATCH | DIVERGENT (dashboard inert; admin/POS endpoint pair) |
| `onCancel` | `() => {}` (no-op) | real `handleCancelClick` → opens admin CancelAppointmentDialog | real `handleCancelClick` → opens admin CancelAppointmentDialog | real `handleCancelAppointment` → opens POS CancelAppointmentDialog | DIVERGENT (dashboard no-op; admin/POS use TWO different cancel dialog COMPONENTS) |
| `canReschedule` | `false` | `false` | real perm | real perm | DIVERGENT (dashboard + detailer view false) |
| `canCancel` | `false` | `false` | real perm | real perm | DIVERGENT (same as above) |
| `canAddNotes` | `true` (default — prop omitted) | real perm | real perm | real perm | DIVERGENT (dashboard implicit default; others gate) |
| `mobileModalMode` | `'admin'` (default) | `'admin'` (default) | `'admin'` (default) | `'pos'` | INTENTIONAL (per Phase 2A docstring) |
| `modifierVariant` | `'admin'` (default) | `'admin'` (default) | `'admin'` (default) | `'pos'` | INTENTIONAL (styling-only) |
| `returnToPath` | `'/admin/appointments'` (default) | `'/admin/appointments'` (default) | `'/admin/appointments'` (default) | `'/pos/jobs'` | INTENTIONAL (post-#150) |

**Citations:** admin/page.tsx:683-692; admin/appointments/page.tsx:336-346, :534-544; pos/jobs/components/job-queue.tsx:1218-1237.

### B.2 — Dialog render branches

The dialog has **NO** `if (host === 'admin')` or equivalent
host-inference conditionals. All branching is on:

- `canReschedule` (gates date/time/employee fields :498-524 and the
  `canEditServices` derivation :198)
- `canCancel` (gates the status `'cancelled'` option :182-184 and the
  footer Cancel button :187-188, :548-560)
- `canAddNotes` (disables note textareas :531, :541 and gates mobile
  edit affordance :387, :437)
- `appointment.status` (gates Edit-in-POS button :253 via
  `isServiceEditableStatus`; cancellation-info banner :466; status
  recommended-vs-override grouping :185-186)
- `appointment.is_mobile` / `mobileOverride` (gates mobile card vs
  Enable button :380, :437)
- `appointment.deposit_amount > 0` (gates deposit display :312)
- `appointment.cancellation_reason` (gates cancellation banner)
- `appointment.has_active_job` (gates un-materialize modal trigger
  inside `onSubmit` :219-224)

All branches are prop-driven or appointment-data-driven. No host
sniffing.

### B.3 — Status dropdown behavior

Per `b0efd95f` (state-machine audit) and `d3671c82` (consequence
map):

- Dialog renders **all 6 statuses** for any user with `canCancel`
  or whose appointment is already cancelled; otherwise filters out
  `cancelled` (line :182-184). Splits into "recommended" (current
  + STATUS_TRANSITIONS forward set) + "Override" optgroup
  (everything else) at :181-186, :478-495.
- Admin PATCH accepts every status. POS PATCH enforces
  `STATUS_TRANSITIONS` server-side and 400s on Override picks.
- The audit's Target B.4 Q3 carryforward: same dropdown, two
  server contracts.

**Status:** DIVERGENT BY DESIGN (Phase 2A Decision 3) but **the UX
mismatch on POS is still real** — operator picks an Override
option, hits Save, gets a 400 toast. The audit's Q6 surfaced this
already; no fix has landed.

### B.4 — PATCH endpoint contract

Comparing `/api/appointments/[id]` (admin) vs
`/api/pos/appointments/[id]` (POS) line-by-line.

| Dimension | Admin PATCH | POS PATCH | Status |
| --- | --- | --- | --- |
| Auth surface | `getEmployeeFromSession` (cookie) | `authenticatePosRequest` (HMAC) | INTENTIONAL |
| Permission keys | `appointments.reschedule` / `appointments.update_status` / `appointments.add_notes` | same three | IDENTICAL |
| Permission enforcement | `requirePermission` per field group | `checkPosPermission` per field group | IDENTICAL semantics, different APIs |
| Body schema | `appointmentUpdateSchema` | `appointmentUpdateSchema` (same) | IDENTICAL |
| Overlap check | yes (`scheduled_date` + `addMinutesToTime` + BUFFER_MINUTES) | yes (identical logic) | IDENTICAL |
| Status-transition enforcement | NONE | `STATUS_TRANSITIONS` check at :240-251 | DIVERGENT BY DESIGN |
| Update payload | status, scheduled_date, scheduled_start_time, scheduled_end_time, employee_id, job_notes, internal_notes | same 7 fields | IDENTICAL |
| `employee_id: '' → null` normalization | NO (`update.employee_id = data.employee_id` at :113 — passes empty string through) | YES (`data.employee_id === '' ? null : ...` at :304) | DIVERGENT |
| Cascade to `jobs.assigned_staff_id` on employee_id change | NONE | YES at :323-329 | **DIVERGENT — DRIFT** |
| Webhook fires (`appointment_confirmed`, `appointment_completed`, `appointment_rescheduled`) | YES (:140-148, :152-164) | YES (:340-352, :355-371) | IDENTICAL |
| Audit log entry | `logAudit` with `action='update'`, `entityType='booking'`, `source='admin'` | same, `source='pos'` | IDENTICAL pattern; source flag is INTENTIONAL |
| Audit log `details` diff fields | `['status', 'scheduled_date', 'scheduled_start_time', 'scheduled_end_time', 'job_notes', 'internal_notes']` (6 fields) | same set PLUS `'employee_id'` (7 fields) | **DIVERGENT — DRIFT** |
| Response shape | `{ success: true, appointment: { id, status } }` | full `PosAppointment` shape with joined customer/vehicle/employee/services | DIVERGENT (POS richer — host wants full re-render) |

**Two unintentional drift findings here.** Both surfaced in
Target F.

### B.5 — Cancellation path

**Admin** (`/admin/appointments`):
1. Operator clicks "Cancel Appointment" footer button OR changes
   status dropdown to `cancelled`.
2. Dialog calls `onCancel(appointment)` → host's `handleCancelClick`
   (admin/appointments/page.tsx:237-240) opens the admin
   `<CancelAppointmentDialog>` (admin variant, 146 lines).
3. Admin cancel dialog: form with `cancellation_reason` (required) +
   optional `cancellation_fee` (feature-flag + permission gated).
4. Operator submits → `handleCancelConfirm` (page.tsx:276-299) calls
   `fetch('/api/appointments/${id}/cancel', POST, ...)`.
5. Admin cancel endpoint: writes status=cancelled, ALWAYS fires
   `sendCancellationNotifications` + `appointment_cancelled` webhook +
   waitlist auto-notify cascade.

**POS** (`/pos/jobs` Schedule scope):
1. Operator clicks "Cancel Appointment" footer button OR changes
   status dropdown to `cancelled`.
2. Dialog calls `onCancel(appointment)` → host's
   `handleCancelAppointment` (job-queue.tsx:700-708) closes the
   detail dialog and opens the POS `<CancelAppointmentDialog>` (POS
   variant — DIFFERENT COMPONENT, 179 lines).
3. POS cancel dialog: textarea for `cancellation_reason` (required) +
   `notify_customer` checkbox (DEFAULT OFF) + amber UX banner.
4. Operator submits → dialog calls `posFetch` directly to
   `/api/pos/appointments/${id}/cancel`.
5. POS cancel endpoint: writes status=cancelled. When
   `notify_customer=true`: fires `sendCancellationNotifications` +
   `appointment_cancelled` webhook (parity with admin for these
   two). When `notify_customer=false`: writes the row silently. **Waitlist
   auto-notify NEVER fires from POS** (explicitly excluded at
   `pos/appointments/[id]/cancel/route.ts:35-37`).

**Status:** DIVERGENT BY DESIGN. The two CancelAppointmentDialog
components (different files, different prop interfaces, different
UX) are intentionally separate per Item 15b. Admin = full-power +
waitlist; POS = operator-scoped, opt-in notifications, no waitlist.

**Sibling vertical bug (NOT a host divergence):** the PATCH path
to `status=cancelled` is silent in BOTH endpoints — neither fires
the cancellation webhook / notifications / waitlist on a direct
PATCH. The dialog dispatches to `onCancel` only when the cancel
button or status='cancelled' submit fires; non-dialog callers
(scripts, future API consumers) can hit PATCH directly and
silently cancel. Surfaced in the consequence map's Q5; not a
parity drift — both hosts share the gap.

### B.6 — Service edit path

Post-#150:

- Both hosts: "Edit in POS" button → `router.push(/pos?source=appointment&id=...&returnTo=${returnToPath})`.
- Admin default `returnToPath='/admin/appointments'`; POS Schedule
  passes `returnToPath='/pos/jobs'`.
- Drain hook (`use-edit-mode-drain.ts`) consumes the URL params,
  fetches the appointment via `/api/pos/appointments/[id]/load`
  (the same POS-authed endpoint regardless of which host initiated
  the deep-link, since POS Sale tab can only call POS-authed
  endpoints).
- Save Changes in the Sale tab dispatches to
  `/api/pos/appointments/[id]/services` and on success
  `router.push(returnToPath)`.

**Status:** ALIGNED post-#150. The asymmetry is the load-endpoint
auth: admin's deep-link landing at `/pos` only works if the
operator also has POS PIN access (since `/api/pos/appointments/[id]/load`
requires POS HMAC). The audit flagged this in the prior fix
deliberation but didn't trigger because admin users with edit
permission generally have POS access too (operator-only environment).

### B.7 — Notify / customer SMS

**No notify button in the dialog itself.** The "send confirmation"
flow lives on separate endpoint pairs (`/api/{admin,pos}/appointments/[id]/notify`)
invoked by OTHER UI (the appointments list row actions, not the
detail dialog).

**Status:** NOT REACHABLE FROM THE DIALOG — outside this audit's
scope. The PATCH-status-change-fires-webhook path IS reachable;
covered in B.4 (IDENTICAL).

### B.8 — Reschedule (date/time/employee changes)

**Admin** and **POS** flow:
1. Operator edits date / start time / end time / employee fields
   in the dialog form.
2. Form submit → dialog `onSubmit` → `onSave(id, payload)` → host's
   handler → `fetch`/`posFetch` PATCH endpoint.
3. PATCH endpoints both check overlap (`addMinutesToTime` +
   BUFFER_MINUTES), both update the row, both fire
   `appointment_rescheduled` webhook on date/time change.

**Differences:**

- POS additionally cascades `jobs.assigned_staff_id` on
  `employee_id` change (line :323-329) — admin does NOT (DRIFT,
  see Target F).
- POS normalizes `employee_id: '' → null` (:304); admin does not
  (passes `''` through as truthy → coerces to null at DB FK constraint;
  silent same-effect, but the admin path is fragile if FK changes).

**Status:** functionally near-identical for reschedule itself;
DRIFT on the secondary jobs-table cascade.

### B.9 — Customer / vehicle editing

**Both hosts:** customer + vehicle fields are read-only in the
dialog (rendered as `<dl>` at :273-323; no inputs, no edit
affordances). The mobile-service card (:380-430) is the only
"edit-this-appointment" affordance besides the form fields.

**Status:** IDENTICAL.

### B.10 — Waitlist / availability triggers

- Admin cancel via dialog → admin /cancel endpoint → fires
  waitlist auto-notify cascade (yes, when feature flag enabled).
- POS cancel via dialog → POS /cancel endpoint → NEVER fires
  waitlist (explicitly excluded by design).

**Status:** DIVERGENT BY DESIGN (Item 15b).

### B.11 — Activity log / audit-trail surface

- Both hosts produce `audit_log` rows on PATCH (B.4) and on cancel
  (admin /cancel writes `action='delete'`, `details.reason`; POS
  /cancel writes the same with `notification_suppressed` flag).
- **Audit-log surface UI lives only on the admin side**
  (`/admin/settings/audit-log/page.tsx`). POS has no audit-log
  surface; operators don't see past changes from within the POS
  context.

**Status:** DIVERGENT — DESIGN ACCEPTABLE (audit log is admin-only
UI by convention) but moderate UX gap if a detailer is on the
floor and wants to see "who last touched this appointment."

### B.12 — Permission gating in the dialog

The dialog accepts THREE permission props: `canReschedule`,
`canCancel`, `canAddNotes`. It does NOT accept a
`canUpdateStatus` prop. Status dropdown ALWAYS renders.

- Admin host wires `usePermission('appointments.update_status')` →
  result is NEVER passed to the dialog. The server enforces.
- POS host same (`usePosPermission('appointments.update_status')`
  at job-queue.tsx:NOT passed to the dialog either).

So a user without status-update permission still SEES the
dropdown, gets a 403 on save. The other three permission gates
have UI affordances; status doesn't.

**Status:** DIVERGENT PATTERN INSIDE THE DIALOG (status gated
differently from sibling permissions). DRIFT — see Target F.

### B.13 — Mobile / tablet specific behaviors

- POS uses `modifierVariant='pos'` for dark-aware styling on
  `<ModifierSummary>` (parameterized).
- POS uses `mobileModalMode='pos'` to route the `<EditMobileModal>`
  to POS auth + POS mobile-zones endpoint (parameterized).
- Touch-target sizing is provided by the underlying primitives
  (Select, Input, Button) — no host-specific touch-size override
  in the dialog itself.
- POS-side surfaces add `text-base sm:text-sm` to prevent iOS auto-zoom
  on inputs; the dialog's own inputs DON'T use this pattern
  (admin form fields at :515, :518, :521 use plain `Input` which
  doesn't enforce the rule). The cancel dialog's textarea (POS
  variant) DOES use `text-base sm:text-sm` at :133. So if the
  dialog is mounted in POS Schedule on iPad, the inputs may zoom
  on focus.

**Status:** MOSTLY IDENTICAL; iPad input-zoom is a minor drift in
the dialog's own form fields. Not severity-relevant for this
audit's "behavior parity" framing.

---

## Target C — Classify each divergence

For each divergence from Target B, classify and cite evidence.

| # | Dimension | From B.x | Classification | Evidence |
| --- | --- | --- | --- | --- |
| 1 | STATUS_TRANSITIONS server enforcement | B.3, B.4 | **INTENTIONAL DESIGN** | b0efd95f §B.3 Decision 3; `pos/appointments/[id]/route.ts:115-122` docstring |
| 2 | Cancel dialog component split (admin vs POS) | B.5 | **INTENTIONAL DESIGN** | `pos/appointments/[id]/cancel/route.ts:25-47` docstring; Item 15b |
| 3 | Cancel endpoint scope (fee, waitlist, notify_customer) | B.5, B.10 | **INTENTIONAL DESIGN** | Same docstring + Item 15b |
| 4 | `mobileModalMode` prop parameterization | B.1, B.13 | **INTENTIONAL DESIGN** | Dialog docstring :67-79 |
| 5 | `modifierVariant` prop parameterization | B.1, B.13 | **INTENTIONAL DESIGN** | Same |
| 6 | `returnToPath` prop parameterization | B.1, B.6 | **INTENTIONAL DESIGN** | Post-#150, CHANGELOG #150 + audit `d1eb1e24` |
| 7 | Auth surface (cookie vs HMAC) | B.4 | **INTENTIONAL DESIGN** | Architectural; each PATCH targets its host's auth |
| 8 | Audit log `source` flag ('admin' vs 'pos') | B.4 | **INTENTIONAL DESIGN** | Tags origin per audit row |
| 9 | `employee_id` missing from admin PATCH audit_log diff | B.4 | **UNINTENTIONAL DRIFT** | Admin sets `update.employee_id` at :113 but omits it from `buildChangeDetails` at :174; POS includes it at :386 |
| 10 | `jobs.assigned_staff_id` cascade on employee_id change | B.4, B.8 | **UNINTENTIONAL DRIFT** | POS cascades at :323-329; admin doesn't; no design comment |
| 11 | `employee_id: '' → null` normalization | B.4 | **UNINTENTIONAL DRIFT** | POS normalizes at :304; admin doesn't at :113; functionally same (FK accepts ''→ silent fail or coerce) but inconsistent contract |
| 12 | `UnMaterializeConfirmationDialog` `context="admin"` hardcoded | (new — not in B.1-13 grid; introduced here) | **UNINTENTIONAL DRIFT (BUG)** | `appointment-detail-dialog.tsx:625` — literal "admin" regardless of host; POS un-materialize hits wrong endpoint with wrong auth (`adminFetch`) → 401 in POS context |
| 13 | `/admin` dashboard `onSave={async () => false}` | B.1 | **UNINTENTIONAL DRIFT (no-op anti-pattern)** | `admin/page.tsx:688` — Save renders but never succeeds; mirrors the prior `onEditInPos` no-op pattern fixed in #150 |
| 14 | `/admin` dashboard `onCancel={() => {}}` | B.1 | **UNINTENTIONAL DRIFT (no-op anti-pattern)** | `admin/page.tsx:689` — same shape as #13; Cancel button does nothing if shown (it's not shown since canCancel=false, but dialog→cancel-status path silently fails) |
| 15 | Admin uses raw `fetch()` instead of `adminFetch` | B.5 | **UNINTENTIONAL DRIFT** | `admin/appointments/page.tsx:253, :278` uses bare `fetch`; canonical admin pattern is `adminFetch` (auto-redirect on 401 per CLAUDE.md key patterns) |
| 16 | Status update permission gate absent from dialog | B.12 | **UNINTENTIONAL DRIFT** | Dialog has canReschedule / canCancel / canAddNotes but no canUpdateStatus; status dropdown always renders even when server will 403 |
| 17 | Status override-optgroup UX mismatch on POS | B.3 | **AMBIGUOUS** (DESIGN but UX-incomplete) | Per b0efd95f Q6 — locked design but operator hits the toast |
| 18 | Audit log surface UI POS gap | B.11 | **AMBIGUOUS** (acceptable per convention; not a bug) | No design comment; audit log in admin-only UI |
| 19 | iPad input-zoom on dialog form fields | B.13 | **AMBIGUOUS (minor)** | Dialog doesn't use `text-base sm:text-sm` on `<Input>`; if POS mounts on iPad, inputs zoom on focus per CLAUDE.md Rule 16 |
| 20 | PATCH-cancellation silent gap | B.5 (footnote) | **SHARED VERTICAL — NOT host drift** | Both PATCH endpoints have it (per consequence map Q5); this is a parity-INVERTED issue (both same; both wrong) |
| 21 | Dashboard mount overall pattern | B.1 | **AMBIGUOUS** (Dashboard read-only intent unclear) | Could be a deliberate "view-only" design (then Save shouldn't render) or drift (then onSave should call handleSave); operator decides |

**Summary:** 8 INTENTIONAL / 6 UNINTENTIONAL / 4 AMBIGUOUS / 3
shared vertical (or NOT host drift). Two AMBIGUOUS items have
prior-audit open questions (b0efd95f Q6, d3671c82 Q5).

---

## Target D — No-op suppression pattern inventory

Phase 2B's `onEditInPos={() => { /* no-op */ }}` was the
type-specimen of this anti-pattern. The audit framing: an
explicitly-set falsy-equivalent callback/value that disables a
feature while leaving its UI affordance rendered.

### Finding 1 — `context="admin"` hardcode in dialog → un-materialize modal

`src/app/admin/appointments/components/appointment-detail-dialog.tsx:625`:

```tsx
<UnMaterializeConfirmationDialog
  open={showUnMaterializeModal}
  onOpenChange={...}
  appointment={appointment}
  context="admin"  // ← HARDCODE — regardless of host
  onSuccess={...}
/>
```

The `UnMaterializeConfirmationDialog` (`src/components/appointments/un-materialize-confirmation-dialog.tsx:40, :68-83`) uses `context` to select between the admin un-materialize endpoint (`/api/appointments/[id]/unmaterialize` + `adminFetch`) and the POS one (`/api/pos/appointments/[id]/unmaterialize` + `posFetch`). Both endpoints exist and both call the same `executeUnMaterialize` seam.

**Effect when POS Schedule mounts the dialog:** operator reverts
status from `confirmed`/`in_progress` to `pending` with
`has_active_job=true` → dialog's `onSubmit` opens the
UnMaterializeConfirmationDialog → modal hits
`/api/appointments/[id]/unmaterialize` via `adminFetch`. In a POS
context the operator has no admin cookie session; `adminFetch`
gets a 401 → triggers admin-login redirect → operator booted out of
POS to the admin login page.

**Why this is a no-op-equivalent:** the literal `"admin"` acts
like the prior `onEditInPos` no-op — it suppresses the host
context's proper routing while leaving the UI affordance (the
un-materialize confirmation modal) rendered. The modal renders +
spins on its dry-run + 401s + redirects.

**Test coverage of the broken behavior:**
`src/app/admin/appointments/components/__tests__/appointment-detail-dialog-unmaterialize.test.tsx:107`
asserts `context).toBe('admin')` — which locks the broken behavior
positionally for admin AND implicitly for POS (since the prop is
unconditional). A regression-locking test for the POS path doesn't
exist.

### Finding 2 — `/admin` dashboard's `onSave={async () => false}` + `onCancel={() => {}}`

`src/app/admin/page.tsx:688-689`:

```tsx
<AppointmentDetailDialog
  ...
  onSave={async () => false}
  onCancel={() => {}}
  canReschedule={false}
  canCancel={false}
/>
```

Two literal no-ops in the same mount. Effect:

- Save button renders (no `canEditStatus`/`canSave` gate). Operator
  clicks → `await onSave(...)` returns `false` → saving state
  resets → dialog stays open with no toast, no error, no state
  change. UX: spinner blinks once, nothing happens.
- Status dropdown renders (no canUpdateStatus prop). Operator can
  pick a new status, click Save → same nothing.
- Notes textareas render and accept input (canAddNotes default
  `true`). Operator can type → click Save → input discarded.
- onCancel no-op is dormant only because `canCancel=false` hides
  the Cancel button AND the status='cancelled' path is filtered
  out (per :182-184). But: if an operator-recovery path ever
  triggers the cancel intercept, it silently fails.

**Why this is the no-op anti-pattern:** literal no-op stubs that
intentionally disable behavior while leaving UI affordances
rendered. Mirror image of the Phase 2B `onEditInPos` no-op fixed
in #150.

**Possible intent:** the dashboard wants a view-only quick-peek of
today's appointments. If so, the right pattern is either (a)
hide the Save button via a new `readOnly?: boolean` prop, or (b)
do `onSave` for real and forward to the admin appointments page.
Currently the implementation lies to itself.

### Finding 3 (none) — `onEditInPos`

Removed in #150 (CHANGELOG #150 + commit `4a03d8ea`). Verified
absent from `src/` via grep; the dialog no longer accepts the
prop, the POS host no longer passes it.

### Total no-op suppression instances: **2** (Findings 1 + 2).

---

## Target E — Host inference anti-pattern inventory

Search for patterns where the dialog (or its children) sniffs
host instead of being driven by props:

| Anti-pattern | Found? | Evidence |
| --- | --- | --- |
| URL pathname / pathname check | NO | `useRouter()` is imported but only used for `router.push` (Edit-in-POS deep-link, post-#150). No `usePathname()` or `window.location` reads. |
| Context provider sniff | NO | The dialog doesn't consume `usePosAuth` / `usePosPermission` / `useAuth`. Auth + permission state is passed in via props. |
| Component-name / parent-name inspection | NO | No `displayName` checks or React reflection. |
| Window object inspection | NO | `typeof window === 'undefined'` guards exist only inside the host (`job-queue.tsx`'s localStorage reads), not in the dialog. |
| Render-tree provider override | NO | The dialog renders a flat tree; no `<Provider value={...}>` override. |

**Total host-inference anti-patterns:** **0.** The dialog is
properly prop-driven. The `mobileModalMode` / `modifierVariant` /
`returnToPath` props are the parameterization pattern; this
audit's Finding 1 (the `context="admin"` literal) is the only gap
left in that pattern — and it's a hardcode bug, not host
inference.

---

## Target F — Severity ranking of unintentional drift

Six drift findings from Target C (#9, #10, #11, #12, #13, #14, #15, #16) plus
two AMBIGUOUS-but-actionable from #17 (POS status UX) and #21
(dashboard mount). Re-ordered by impact:

### F.1 — HIGH (1 finding)

| # | Drift | Why HIGH | Recommended scope |
| --- | --- | --- | --- |
| #12 | `UnMaterializeConfirmationDialog` `context="admin"` hardcoded | POS operator revert → 401 / forced redirect / data integrity edge (the orphan-job race the un-materialize seam EXISTS to prevent — and which #150's prereq audit flagged as "wire the cascade into PATCH" Q1). The bug is rare-trigger but high-severity-when-triggered: it lands a POS user on the admin login page after a status edit. | Make the dialog `context`-aware via a new prop `unmaterializeContext?: 'admin' \| 'pos'` (or piggyback on `mobileModalMode`'s shape and unify into a single `hostContext?: 'admin' \| 'pos'`). POS host passes `'pos'`. ~5 prod lines + 1 regression test asserting the prop forwards. |

### F.2 — SIGNIFICANT (2 findings)

| # | Drift | Why SIGNIFICANT | Recommended scope |
| --- | --- | --- | --- |
| #10 | `jobs.assigned_staff_id` cascade missing on admin PATCH | Admin reassigns the detailer → the `jobs` row's assigned staff stays stale. Operator sees outdated assignment in POS Today scope. Detailer thinks they're not assigned to a job they actually own. Real customer-impact via mis-assignment. | Mirror the POS cascade at admin PATCH `:113` — when `data.employee_id !== undefined`, run the same `supabase.from('jobs').update({ assigned_staff_id }).eq('appointment_id', id)` block. ~6 prod lines. |
| #16 | Status update permission gate absent from dialog | Operator without `appointments.update_status` sees the status dropdown, picks a new status, clicks Save, gets a 403 toast. Useless action surface. | Add `canUpdateStatus?: boolean` prop (default `true` for backward compat). When false, render the status field as a read-only `<dd>` (mirror customer/vehicle pattern). Both hosts wire to the existing permission state. ~12 prod lines. |

### F.3 — MODERATE (3 findings)

| # | Drift | Why MODERATE | Recommended scope |
| --- | --- | --- | --- |
| #9 | Admin PATCH audit_log diff missing `employee_id` | Operator reassigns detailer → audit log doesn't show the change → "who reassigned this and when?" can't be answered from the audit log surface. | Add `'employee_id'` to the `buildChangeDetails` field list at `appointments/[id]/route.ts:174`. ~1 line. |
| #15 | Admin handlers use raw `fetch()` instead of `adminFetch` | Session expiry mid-edit doesn't redirect; operator sees a silent failure toast instead of being routed to login. Inconsistent with CLAUDE.md "Key Patterns" `adminFetch` usage. | Swap `fetch` → `adminFetch` at admin/appointments/page.tsx:253, :278. ~2 lines (plus import). |
| #13 | `/admin` dashboard `onSave=async()=>false` (and #14's onCancel no-op) | Visible-but-inert Save button on the dashboard's quick-peek. Mirror of Phase 2B onEditInPos pattern. | Operator decides between (a) read-only mode prop hiding the form entirely, OR (b) wire real handler. Either ~5-15 lines. |

### F.4 — MINOR / SHARED-VERTICAL (carried for tracking, not new fix scope)

| # | Item | Source |
| --- | --- | --- |
| #11 | `employee_id: '' → null` admin normalization | Functionally harmless; consistency win |
| #17 | POS status override-optgroup UX | Open from b0efd95f Q6 |
| #18 | Audit log surface POS gap | Convention-acceptable |
| #19 | iPad input-zoom on dialog | Per Rule 16 — separate sweep |
| #20 | PATCH-cancellation silence | Open from d3671c82 Q5 (BOTH PATCH endpoints) |

---

## Target G — Fix arc recommendation

### G.1 — Total fix scope estimate

Across the 6 drift findings + 2 AMBIGUOUS-but-actionable items:

- HIGH (F.1, 1 finding): ~5 prod lines + 1 test
- SIGNIFICANT (F.2, 2 findings): ~18 prod lines + 2-3 tests
- MODERATE (F.3, 3 findings): ~3-18 prod lines + 2-3 tests
- Cross-cutting parity contract (Target G.3): ~30-50 lines of test
  infrastructure

**Total: ~70-110 net production lines + ~50 test lines, spread
across ~6-8 files.** Inside Memory #8's per-session ≤4 files /
≤50 line budget IF split into ≥3 sessions.

### G.2 — Session-by-session breakdown

#### Session A — Close the no-op anti-patterns + HIGH

**Goal:** eliminate every `onEditInPos`-shaped pattern. The
no-op-suppression class of bug is what the operator's framing
targets; closing all instances in one session breaks the pattern
once.

**Files (4 prod):**
- `appointment-detail-dialog.tsx` — replace `context="admin"`
  hardcode with prop forwarding. Add `unmaterializeContext?:
  'admin' \| 'pos'` (default `'admin'`). Recommend rolling into a
  unified `hostContext?: 'admin' \| 'pos'` prop that REPLACES
  `mobileModalMode` AND `modifierVariant` AND
  `unmaterializeContext` — three props that all switch on the same
  axis become one. (Memory #2 single source of truth.) Defaults
  `'admin'`.
- `pos/jobs/components/job-queue.tsx` — replace
  `mobileModalMode="pos"` + `modifierVariant="pos"` with the
  unified `hostContext="pos"`.
- `admin/page.tsx` — fix dashboard mount: either add a new
  `readOnly?: boolean` prop to the dialog and pass `readOnly={true}`,
  OR wire the dashboard's `onSave` to the real handler. Operator
  picks (Target H).
- `admin/appointments/page.tsx` — if `readOnly` is added, wire it
  for the detailer view too (currently uses `canReschedule=false`
  + `canCancel=false` + real `handleSave` — same intent expressed
  differently; consistency win).

**Tests:** new POS un-materialize test (was missing); admin
test re-pinned to the new prop name; readOnly tests if that path
chosen.

**Scope: ~20-35 prod lines, 4 files, +5-8 tests.**

#### Session B — Admin/POS PATCH endpoint symmetry

**Goal:** match the admin PATCH to POS PATCH on the three drifts
that affect data correctness or audit coverage.

**Files (2 prod):**
- `appointments/[id]/route.ts` — (a) add `employee_id` to
  `buildChangeDetails`; (b) add the
  `jobs.assigned_staff_id` cascade block mirroring
  `pos/appointments/[id]/route.ts:323-329`; (c) add `employee_id ===
  '' ? null` normalization at the update payload (#11).
- `admin/appointments/page.tsx` — swap raw `fetch` → `adminFetch`
  for the PATCH and cancel calls (#15).

**Tests:** admin PATCH route test for the cascade + audit-diff;
admin page-level test for adminFetch (or accept that the existing
fetch-mock pattern in tests still works).

**Scope: ~12-18 prod lines, 2 files, +3-4 tests.**

#### Session C — Cross-cutting parity contract + status permission

**Goal:** prevent the next drift from being a customer-facing
surprise. Add the parity contract test that asserts both hosts
forward equivalent props to the dialog.

**Files (1 prod + 1 test):**
- `appointment-detail-dialog.tsx` — add `canUpdateStatus?: boolean`
  prop (default `true`) gating the status dropdown render.
- New `src/app/__tests__/admin-pos-dialog-parity.test.tsx` —
  source-contract test asserting every prop the admin host passes
  to the dialog (minus documented host-context props like
  `hostContext`, `returnToPath`, `employees`) is also passed by
  the POS host, AND that the four host-context props (`hostContext`,
  `returnToPath`, `employees` shape, `canUpdateStatus`) are
  forwarded with appropriate values.
- Status permission wiring at admin/appointments/page.tsx +
  job-queue.tsx + admin/page.tsx (dashboard).

**Scope: ~15-25 prod lines + 30-40 test lines, 4-5 files
touched, +6-8 tests.**

#### Sessions left for separate audits

- d3671c82 Q5 (PATCH-cancellation silence) — operator decides
  shape; either close the silent path with a server-side redirect
  to /cancel endpoint, OR cascade notifications into PATCH.
- b0efd95f Q6 (POS status override-optgroup UX) — disable
  override options on the POS surface OR show a warning banner.
- iPad input-zoom (#19) — global sweep, not specific to the dialog.

### G.3 — Cross-cutting concerns

#### Concern 1 — A parity contract test should exist

Today no test asserts "admin and POS pass equivalent prop sets to
the dialog." The three drifts caught by operator at runtime (state
machine, PATCH-cancellation, Edit in POS) were all preventable
with a test that compared the two mounts' prop shape. **Session
C's parity contract test is the durable structural win.**

Precedent: the Sale-vs-Quotes parity sweep (`SALE_VS_QUOTES_PARITY_SWEEP.md`,
session #120 / #121) shipped a similar source-contract test at
`src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`
that verified prop wiring matches between Sale and Quotes panels.
Same shape applies here.

#### Concern 2 — The "hostContext" unified prop pattern

The dialog currently has 3 props that switch on the same axis:
`mobileModalMode`, `modifierVariant`, and (post-Session A)
`unmaterializeContext`. Plus `returnToPath` and `employees`'
realness all signal the same admin-vs-POS distinction. Memory #2
single-source-of-truth: unify into ONE `hostContext: 'admin' \| 'pos'`
prop. The dialog reads `hostContext` and forwards as appropriate.
`returnToPath` stays separate (it parameterizes a URL, not a
host); the other three collapse.

(Or keep them separate, but commit to no FURTHER per-axis props.
Operator decides shape in Session A.)

#### Concern 3 — Should the endpoints unify?

Today admin and POS PATCH endpoints duplicate ~150 lines each of
near-identical body schema, overlap check, update payload,
webhook fire, audit log. The shared executor pattern
(`executeUnMaterialize` + `service-edit.ts`'s cascade helper)
shows the right shape: thin auth wrappers over one canonical
executor.

Refactoring the two PATCH endpoints into one
`updateAppointment()` seam + two thin wrappers is the most
durable fix — it makes Session B's three drifts impossible to
re-introduce because the implementation is shared. But this is a
~150-line refactor (estimate) touching both endpoints + the shared
seam, which exceeds Memory #8 per-session budget and adds risk.

**Recommendation:** Sessions A-C land first as they're additive +
small. The shared `updateAppointment` seam is a separate
follow-on session at ~150 lines, AFTER the small drift fixes
stabilize. Operator decides when to spend that.

### G.4 — Recommended parity STANDARD for the codebase

Based on Target A.3's principle:

> **Dialog UI is fully shared. Host context flows via explicitly
> typed props. Endpoints (and their side-effect surfaces) are
> scoped per host where the role-trust boundary differs — and
> ONLY there. Anywhere else, endpoints must produce equivalent
> data shapes and customer-facing effects from equivalent operator
> actions.**

Concrete codification (for CLAUDE.md Rule 11 / 22 follow-on, NOT
in this audit's scope but flagged for future):

1. Shared dialogs MUST NOT accept no-op-equivalent props
   (`() => {}`, `async () => false`, hardcoded `"admin"`). Host
   differences MUST be explicit (a `readOnly` prop, a `hostContext`
   prop, a parameterized callback handler).
2. Per-axis prop proliferation (`mobileModalMode` + `modifierVariant`
   + `unmaterializeContext`) is a smell; collapse to one
   `hostContext` prop when the axis is the same.
3. Shared dialogs MUST have a parity contract test asserting both
   hosts pass equivalent prop sets (minus documented host-context
   props).
4. Two endpoints sharing the same body shape and 80%+ of their
   logic SHOULD share an executor seam.

---

## Target H — Open operator decisions

The audit cannot resolve these without operator input.

**Q1 — Session A's dashboard mount fix shape.** The `/admin`
dashboard mounts the dialog with `onSave=async()=>false` +
`onCancel=()=>{}` + `canReschedule=false` + `canCancel=false`
+ omits `canAddNotes` (defaults true → notes editable). The two
plausible intents:

- (a) **View-only quick-peek** — operator just glanced at the
  appointment; no editing intended. Fix: add `readOnly?: boolean`
  prop to the dialog; dashboard passes `readOnly={true}` →
  status dropdown, notes textareas, footer Save button all hidden.
  Operator sees the read-only `<dl>` block + read-only services
  + read-only mobile-service card. Click footer Close to dismiss.
- (b) **Editable, just lacks elevated permissions** — fix: wire
  real handlers (forward to the admin /appointments handlers via
  navigation OR mount the admin context's `handleSave`).

Recommended: (a) (view-only) — the dashboard is a glance surface;
edits belong in the appointments page.

**Q2 — Session A's prop unification scope.** Should
`mobileModalMode` + `modifierVariant` + new `unmaterializeContext`
collapse into ONE `hostContext?: 'admin' \| 'pos'` prop (Concern 2),
or stay as separate axis-specific props? Recommended: unify. Memory
#2.

**Q3 — Carry-forward from prior audits.** Two open prior-audit
questions are flagged here for the cross-cutting Session C:
- d3671c82 Q5 (PATCH-cancellation silence — both hosts) — close
  via server-side redirect OR cascade notifications?
- b0efd95f Q6 (POS status override-optgroup UX) — disable the
  options OR show a warning banner?

Operator can fold these into Session C or defer to separate
sessions.

**Q4 — Endpoint unification timing.** Concern 3's
`updateAppointment` seam is a ~150-line refactor. Land it after
Sessions A-C stabilize? Or never, accepting the duplication?
Operator decides.

**Q5 — Status update permission UI gate (Session C, F.2 #16).**
Two shapes:
- Add `canUpdateStatus?: boolean` prop (default `true` for
  backward compat). When `false`, render status as a read-only
  `<dd>`.
- Make status dropdown ALWAYS read-only unless the form has at
  least one permission grant (avoids new prop). Less explicit but
  simpler.

Recommended: explicit prop (consistency with sibling permission
props).

---

## Hard-rules verification

- ✅ Worktree isolation: `~/Claude/SmartDetails/wt-parity-audit`,
  branch `audit/admin-pos-dialog-parity-comprehensive`, base `4a03d8ea`.
- ✅ No source / migration / test changes — read-only.
- ✅ Memory #11 — every divergence cites file:line.
- ✅ Memory #29 type 3 — Target A (intended-behavior model)
  precedes Target B (divergence inventory). Targets C-H build on
  A's principle.
- ✅ Inventory completeness — 21 dimensions mapped + 2 no-op
  findings + 0 host-inference (verified by negative-grep + manual
  read of the dialog).
- ✅ Did NOT pre-resolve Target H questions.
- ✅ Found divergences in OTHER shared components flagged but not
  expanded: `CancelAppointmentDialog` (TWO components, not one
  shared) is documented at B.5 as intentional split; `EditMobileModal`
  is correctly parameterized (B.13); `UnMaterializeConfirmationDialog`
  has the hardcode bug (Finding 1). No silent expansion into other
  shared components beyond these direct collaborators of the
  dialog.

---

## Cross-references

- Prior audits (evidence base):
  - `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` (b0efd95f)
  - `docs/dev/APPOINTMENT_STATUS_PER_TRANSITION_CONSEQUENCE_MAP.md` (d3671c82)
  - `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md` (d1eb1e24, RESOLVED #150)
- Dialog: `src/app/admin/appointments/components/appointment-detail-dialog.tsx:57-83` (props), `:178-198` (gate derivation), `:200-235` (onSubmit + intercepts), `:237-635` (render), `:625` (un-materialize hardcode).
- Hosts:
  - `src/app/admin/page.tsx:683-692` (dashboard mount — view-only inert)
  - `src/app/admin/appointments/page.tsx:336-346` (detailer view mount), `:534-544` (calendar view mount), `:246-274` (handleSave — raw fetch), `:276-299` (handleCancelConfirm — raw fetch)
  - `src/app/pos/jobs/components/job-queue.tsx:238-243` (POS permission reads), `:671-695` (handleSaveAppointment — posFetch), `:700-708` (handleCancelAppointment), `:1218-1237` (POS dialog mount)
- PATCH endpoints:
  - `src/app/api/appointments/[id]/route.ts:11-187` (admin)
  - `src/app/api/pos/appointments/[id]/route.ts:133-414` (POS)
- Cancel endpoints:
  - `src/app/api/appointments/[id]/cancel/route.ts:14-184` (admin)
  - `src/app/api/pos/appointments/[id]/cancel/route.ts:25-180` (POS)
- Cancel dialogs (TWO components):
  - `src/app/admin/appointments/components/cancel-appointment-dialog.tsx:1-146`
  - `src/app/pos/components/appointments/cancel-appointment-dialog.tsx:1-179`
- Un-materialize:
  - `src/components/appointments/un-materialize-confirmation-dialog.tsx:40, :68-83` (context-driven endpoint + auth)
  - `src/app/api/appointments/[id]/unmaterialize/route.ts:14-86` (admin)
  - `src/app/api/pos/appointments/[id]/unmaterialize/route.ts` (POS — parallel)
  - `src/lib/appointments/lifecycle-sync.ts:208-368` (shared executor)
- Test files:
  - `src/app/admin/appointments/components/__tests__/appointment-detail-dialog-unmaterialize.test.tsx:107` (locks the `context='admin'` hardcode in admin context; no POS analog)
  - `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` (post-#150 dialog parity coverage)
  - `src/app/pos/jobs/components/__tests__/job-queue-schedule-scope.test.tsx:297-310` (POS host mount asserts)
- Other shared components (flagged, NOT audited deeper):
  - `EditMobileModal` (`src/components/jobs/edit-mobile-modal.tsx:59, :176-200, :266-290`) — properly parameterized via `mode` prop.
  - `ModifierSummary` (`src/components/appointments/modifier-summary.tsx:53-87`) — properly parameterized via `variant` prop.
  - `PaymentMismatchBanner` — same in both contexts.
