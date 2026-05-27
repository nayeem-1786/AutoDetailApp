# Item 15e Phase 2 — AppointmentDetailDialog Reuse Verification (2026-05-27)

> **Type:** read-only verification audit. No source/migration/test changes.
> **Branch:** `audit/item-15e-phase-2-reuse-verification`
> **Question:** *If and how* can the admin `AppointmentDetailDialog` be reused in
> the POS Jobs **Schedule** scope (Item 15e Phase 2)? The operator has locked
> "reuse the admin dialog" (Phase 2 Decision A revisited); this audit produces
> the feasibility evidence and a concrete implementation shape — and honestly
> surfaces where reuse is more work than it looks.

---

## TL;DR

**Feasibility verdict: `reuse-with-moderate-adjustments`.** The admin
`AppointmentDetailDialog` is genuinely reusable, but not drop-in. Two facts make
reuse viable: (1) its **save/cancel are prop callbacks** (`onSave`, `onCancel` —
`appointment-detail-dialog.tsx:57-58`), so the component is *already decoupled*
from the admin write API at the data boundary — the parent supplies the
persistence; (2) of its 20 import sources, **only one is admin-coupled**
(`../types` for `STATUS_TRANSITIONS` + `AppointmentWithRelations`,
`appointment-detail-dialog.tsx:32-33`). Everything else is a shared path.

**The work splits into mechanical adaptation + one genuinely new server endpoint.**
Mechanical: (a) parameterize three hardcoded admin assumptions — the "Edit in POS"
`router.push('/pos?…&returnTo=/admin/appointments')` button (`:210-214`),
`EditMobileModal mode="admin"` (`:534`), and `ModifierSummary variant="admin"`
(`:326`); (b) add `dark:` variants across the dialog body (~370 lines of JSX use
light-only grays — POS **Rule #10** — but the `<Dialog>` primitive itself adapts
via `bg-ui-bg` theme tokens, and adding `dark:` is a **no-op in admin** so it
cannot regress the admin surface); (c) lift the one shared type to
`src/lib/appointments/` with a re-export from admin `../types` (low blast radius —
only the dialog imports `STATUS_TRANSITIONS`; `AppointmentWithRelations` is
imported by 5 admin files that a re-export keeps working untouched).

**The only genuinely new server work** is that POS has **no status-change endpoint
and no notes endpoint**. POS already has `reschedule` (date/time/employee only),
`cancel`, `services`, `mobile-service`, `load`, `notify`, and `send-payment-link`
under `/api/pos/appointments/[id]/*` — but the admin dialog's *primary* control is
the **Status dropdown** (`:434-451`), plus job/internal notes, and neither has a
POS backing route. The admin route `/api/appointments/[id]` cannot be reused: it
authenticates via **cookie-based Supabase session** (`getEmployeeFromSession` →
`auth.getUser()`), which a POS request — authenticated by the `X-POS-Session` HMAC
token — never satisfies (it returns 401). Recommended: build **one combined
`PATCH /api/pos/appointments/[id]`** mirroring the admin route's field set, with
`authenticatePosRequest` + per-field `checkPosPermission`. **No role-defaults
migration is needed** — `appointments.update_status` / `add_notes` / `reschedule`
already grant the correct matrix to POS roles, and `checkPosPermission` reads the
same `permissions` table.

**Phase 1B is already compatible.** Schedule scope renders its own dedicated
flat list (`ScheduleScopeList`) that *overrides* the List/Timeline `viewMode`
toggle entirely (the toggle chrome isn't even rendered in Schedule scope), so
Phase 2 does **not** need to add Timeline support for Schedule rows. There is a
working **template** for the entire mount-and-wire pattern:
`pos/jobs/components/change-time-button.tsx` already fetches a full
`PosAppointment` from the existing POS `GET /api/pos/appointments/[id]` and mounts
a *reused* dialog inside the Jobs surface, gated on
`usePosPermission('appointments.reschedule')`.

**Estimate: ~3–4.5h, likely its own session** (Memory #8: >3 files / >300 lines).
**Honest fallback:** the prior audit's Phase 2 plan reused the **slim** POS
dialogs (`reschedule-appointment-dialog.tsx` + `cancel-appointment-dialog.tsx`),
which are *already* POS-wired, dark-mode-correct, and used inside Jobs — needing
**no** dark-mode retrofit, **no** type lift, and **no** new status endpoint. They
do not give a unified status + notes + mobile + modifier panel. The operator's
choice between "rich single-panel reuse (admin dialog)" and "two slim dialogs
(less work, narrower capability)" is the central open decision below.

---

## Detailed findings per question

### Q1: viewMode internal scope

**The premise in the prompt is mis-attributed.** `appointment-detail-dialog.tsx`
is **567 lines** (not ~700+), and contains **no `viewMode` reference anywhere**
(grep confirms; the only `STATUS_TRANSITIONS` hits in the file are the import at
`:32` and the use at `:156`). The `viewMode: 'list' | 'timeline'` at "line 202"
with "usage at 647-678" is **`job-queue.tsx`** (POS side) — state declared at
`job-queue.tsx:24,202-211`, toggle chrome at `:642-667`. It is not the dialog.

**The admin `AppointmentDetailDialog` is a pure single-appointment detail panel.**
Its responsibilities (`appointment-detail-dialog.tsx`):
- Read-only header + info grid: customer, booked-by channel, vehicle, total,
  deposit/balance (`:222-278`).
- Services list via shared `composeLineItems` + `ModifierSummary` (`:289-328`).
- Mobile-service card + "Enable mobile" entry point (`:335-407`).
- Payment-mismatch banner (`:409-418`) and cancellation info (`:421-429`).
- Editable form: status, assigned detailer, date, start/end time, job notes,
  internal notes (`:432-500`).
- Footer: Cancel Appointment / Close / Save Changes (`:502-522`).

It contains **no day-level list and no list/timeline switching**. Those concerns
live in *separate* admin files (`appointment-calendar.tsx`,
`day-appointments-list.tsx`, `appointments/page.tsx`). **Conclusion:** the dialog
is cleanly single-purpose; there are no admin-page list concerns embedded that
would fail to translate to POS. The "internal view-mode" worry does not apply to
this component.

### Q2: Dialog prop signature + callback contract

Prop type `AppointmentDetailDialogProps` (`:52-62`):

| Prop | Required | Type | Notes |
|---|---|---|---|
| `open` | ✅ | `boolean` | |
| `onOpenChange` | ✅ | `(open: boolean) => void` | close = `onOpenChange(false)` |
| `appointment` | ✅ | `AppointmentWithRelations \| null` | renders null-guard at `:149` |
| `employees` | ✅ | `Pick<Employee,'id'\|'first_name'\|'last_name'\|'role'>[]` | detailer dropdown source |
| `onSave` | ✅ | `(id: string, data: AppointmentUpdateInput) => Promise<boolean>` | parent persists; returns success |
| `onCancel` | ✅ | `(appointment: AppointmentWithRelations) => void` | parent opens its own cancel dialog |
| `canReschedule` | ✅ | `boolean` | gates date/time/detailer fields + service-edit |
| `canCancel` | ✅ | `boolean` | gates cancel button + `cancelled` status option |
| `canAddNotes` | optional (`= true`) | `boolean` | gates notes textareas + mobile-edit pencil |

**Callback contract:**
- `onSave` (`:171-190`): on submit, builds `{ ...data, employee_id: data.employee_id || null }`, calls `await onSave(id, payload)`; **closes the dialog only when it returns `true`**. The save status is owned by the parent. **Special case:** if the chosen status is `cancelled` (and wasn't already), it short-circuits — closes the dialog and calls `onCancel(appointment)` instead of `onSave` (`:175-183`).
- `onCancel` (`:508-511`, `:175-183`): the dialog never cancels directly; it closes itself then hands off to the parent's cancel flow (admin wires this to `<CancelAppointmentDialog>`).
- `onOpenChange(false)`: close.

**Context dependencies (the admin-coupled bits):**
- `useRouter` (`:75`) is used **only** by the "Edit in POS" button (`:206-221`), which does `router.push('/pos?source=appointment&id=${id}&returnTo=${encodeURIComponent('/admin/appointments')}')`. The `returnTo=/admin/appointments` is hardcoded and admin-specific. **In a POS context this button is nonsensical** (you're already in POS) and the returnTo is wrong → must hide or repurpose in POS.
- `EditMobileModal` mounted with `mode="admin"` hardcoded (`:534`). The modal already supports `mode: 'pos' | 'admin'` (`edit-mobile-modal.tsx:59`) and switches its auth surface (`posFetch` vs `fetch`, mobile-zones endpoint) accordingly (`:177-178,267-270`). Must pass `mode="pos"` in POS.
- `ModifierSummary` mounted with `variant="admin"` hardcoded (`:326`). The component already supports `variant: 'admin' | 'pos'` (`modifier-summary.tsx:57`) with dark-mode classes in the pos path (`:87+`). Must pass `variant="pos"` in POS.

No admin-page state is consumed beyond the imported types; `employees` is a prop.

### Q3: PATCH auth model

`PATCH /api/appointments/[id]` (`route.ts`):
- **Auth:** `getEmployeeFromSession(request)` (`route.ts:16`) → cookie-based
  Supabase auth: `createClient()` (server cookie client) → `supabase.auth.getUser()`
  → active-employee lookup, plus IP-whitelist when `request` is passed
  (`get-employee.ts:33-57`). This is the **admin** model.
- **Permission keys (per-field):** reschedule fields → `appointments.reschedule`
  (`route.ts:38-41`); `status` → `appointments.update_status` (`:44-47`); notes →
  `appointments.add_notes` (`:50-54`). Each via `requirePermission` →
  `checkPermission`.
- **Does it honor POS sessions? No.** POS authenticates with the `X-POS-Session`
  HMAC token (`pos/api-auth.ts:20-23`, verified by `verifyPosToken`). POS requests
  carry **no Supabase auth cookie**, so `auth.getUser()` returns no user and
  `getEmployeeFromSession` returns `null` → the route 401s for any POS caller.
- **Broadening it to accept POS = not recommended.** It would require dual-auth in
  one route and reconciling two IP-whitelist paths; it also crosses the
  established architecture boundary (admin routes = cookie auth; POS routes =
  HMAC + `checkPosPermission`). The codebase already follows the parallel-endpoint
  pattern.

**Existing POS appointment-mutation surface** (all `authenticatePosRequest` +
`checkPosPermission`):

| Endpoint | Method | Scope | Permission |
|---|---|---|---|
| `/api/pos/appointments/[id]/reschedule` | PATCH | date/start/end/employee **only** (no status/notes/services); suppresses rescheduled webhook | `appointments.reschedule` (`reschedule/route.ts:78-83`) |
| `/api/pos/appointments/[id]/cancel` | POST | sets `status='cancelled'` + reason; no fee field | `appointments.cancel` (`cancel/route.ts:73`) |
| `/api/pos/appointments/[id]/services` | — | service edit (ticket flow) | `pos.jobs.manage` |
| `/api/pos/appointments/[id]/load` | GET | TicketState-shaped drain payload (read) | `pos.jobs.manage` |
| `/api/pos/appointments/[id]/mobile-service`, `/mobile-address`, `/notify`, `/send-payment-link` | various | as named | various |
| `/api/pos/appointments/[id]` | GET | full joined `PosAppointment` (used by `change-time-button.tsx:77`) | — |
| `/api/pos/appointments?start_date&end_date` | GET | list, **returns `AppointmentWithRelations` shape** (`route.ts:17,72-80`) | `appointments.view_today` |

**The gap:** there is **no POS endpoint that performs a general status change**
(pending→confirmed, →in_progress, →completed, →no_show) and **no POS notes
endpoint**. `cancel` is the only status mutation, as a special case. The admin
dialog's central control (Status dropdown) + notes have nothing to POST to in POS.
**Recommendation:** add **one combined `PATCH /api/pos/appointments/[id]`**
mirroring the admin route's accepted fields (`appointmentUpdateSchema`) with POS
HMAC auth + per-field `checkPosPermission('appointments.update_status' /
'.reschedule' / '.add_notes')`, so the dialog's single `onSave` call maps to a
single endpoint. (Alternative: fan `onSave` out to the existing `reschedule`
endpoint + two new narrow endpoints — more wiring, more round-trips.)

### Q4: Role-defaults review

From `supabase/seed.sql:179-198` (and identically `migration
20260211000007_roles_permissions_foundation.sql:284-303`):

| Permission | super_admin | admin | cashier | detailer |
|---|:---:|:---:|:---:|:---:|
| `appointments.reschedule` | ✅ | ✅ | ✅ | ❌ |
| `appointments.cancel` | ✅ | ✅ | ❌ | ❌ |
| `appointments.update_status` | ✅ | ✅ | ✅ | ✅ |
| `appointments.add_notes` | ✅ | ✅ | ✅ | ✅ |

**POS roles are these same role names.** `checkPosPermission`
(`pos/check-permission.ts`) reads the **same `permissions` table** as the admin
`checkPermission` (employee override → role default → deny). So **no role-defaults
change is needed for Phase 2** — the keys already grant: status/notes to all four
roles, reschedule to cashier+ (detailer denied), cancel to admin+ only. The
existing POS `reschedule` endpoint already proves these keys resolve for POS
sessions (`reschedule/route.ts:78-89`). A new combined POS PATCH simply reuses
`update_status` / `add_notes` / `reschedule` — all seeded.

### Q5: STATUS_TRANSITIONS portability

- **Structure** (`appointments/types.ts:22-29`): `Record<AppointmentStatus,
  AppointmentStatus[]>` mapping each status to its valid next states. Pure data,
  zero admin-context coupling — universally applicable. The dialog uses it to
  build the "recommended" vs "override" status option groups (`:156-157`).
- **Importers (verified):** besides the definition, **only the dialog** imports
  `STATUS_TRANSITIONS`. (`STATUS_DOT_COLORS` is imported by `appointment-calendar.tsx`
  — admin-only, irrelevant to Phase 2.) `AppointmentWithRelations` is imported by
  5 admin files — `admin/page.tsx`, `appointments/page.tsx`,
  `day-appointments-list.tsx`, `cancel-appointment-dialog.tsx`, `appointment-calendar.tsx`
  — plus the dialog itself.
- **Recommendation:** lift `STATUS_TRANSITIONS` (and, to give POS a shared
  appointment type, `AppointmentWithRelations`) into `src/lib/appointments/`
  (e.g. `status-transitions.ts` + a shared types module) and **re-export from
  admin `../types`** for backward compatibility. **Blast radius: low** — with the
  re-export, none of the 5 admin importers need editing. Only the dialog's import
  path changes (and it becomes shared, not admin-relative).

### Q6: Imports portability

All 20 import sources in `appointment-detail-dialog.tsx`:

| Import | Status |
|---|---|
| `react` (`:3`) | ✅ portable |
| `next/navigation` → `useRouter` (`:4`) | ✅ portable **but admin-coupled usage** (hardcoded `returnTo=/admin/appointments`, `:210-214`) |
| `react-hook-form` (`:5`) | ✅ |
| `@hookform/resolvers/zod` (`:6`) | ✅ |
| `lucide-react` (`:7`) | ✅ |
| `@/components/ui/dialog` (`:8-16`) | ✅ (theme-token primitive — adapts to dark) |
| `@/components/ui/button` (`:17`) | ✅ |
| `@/lib/utils/vehicle-helpers` (`:18`) | ✅ |
| `@/components/ui/input` (`:19`) | ✅ |
| `@/components/ui/select` (`:20`) | ✅ |
| `@/components/ui/form-field` (`:21`) | ✅ |
| `@/lib/utils/format` → `formatCurrency`, `formatPhone` (`:22`) | ✅ (legacy dollars OK — appointments family not yet Money-Unified) |
| `@/lib/utils/validation` → `appointmentUpdateSchema` (`:23`) | ✅ (this is also the natural POS PATCH body schema) |
| `@/lib/utils/compose-line-items` (`:24`) | ✅ |
| `@/lib/utils/constants` → `APPOINTMENT_STATUS_LABELS`, `ROLE_LABELS` (`:25`) | ✅ |
| `@/components/jobs/edit-mobile-modal` (`:26-29`) | ✅ (supports `mode="pos"`; currently passed `"admin"`) |
| `@/components/jobs/payment-mismatch-banner` (`:30`) | ✅ (verify dark variants when reused) |
| `@/components/appointments/modifier-summary` (`:31`) | ✅ (supports `variant="pos"` w/ dark; currently `"admin"`) |
| `../types` → `STATUS_TRANSITIONS`, `AppointmentWithRelations` (`:32-33`) | ⚠️ **admin-coupled** — the one import to lift (Q5) |
| `@/lib/supabase/types` → `AppointmentStatus`, `Employee` (`:34`) | ✅ |

**Net: exactly one structurally admin-coupled import** (`../types`), plus one
portable-import-with-admin-usage (`useRouter`).

### Q7: Phase 1B view-mode + scope interaction

- `viewMode: 'list' | 'timeline'` — local state, localStorage `pos-jobs-view`
  (`job-queue.tsx:24,202-211`).
- `scope: 'today' | 'schedule'` — separate local state, localStorage
  `pos-jobs-scope`, flag-gated via `effectiveScope` (`:25,217-228`).
- **The List/Timeline toggle chrome renders only inside the `{effectiveScope ===
  'today' && (…)}` block** (`:539-668`; toggle at `:642-667`). So in Schedule
  scope **the view toggle is not even shown**.
- **Content render** (`:672-867`): `effectiveScope === 'schedule'` →
  `<ScheduleScopeList>` (`:672-677`), which **ignores `viewMode` entirely**. Only
  in Today scope does `viewMode === 'timeline'` ? `<JobTimeline>` : list branch.
- **So if `scope==='schedule'` AND `viewMode==='timeline'` today:** the timeline
  branch is unreachable — `ScheduleScopeList` wins. `viewMode` simply persists in
  the background and is restored when scope flips back to Today.

**Conclusion:** Schedule scope **already overrides** `viewMode` with its own
dedicated flat-list render — a deliberate Phase 1B design. **Phase 2 does NOT need
to add Timeline support for Schedule scope.** The detail dialog is orthogonal to
`viewMode`: it mounts over whichever scope render is active. No integration work
against the toggle is required.

### Q8: Pending visual distinction infrastructure

- **Today list** per-card styling: `job-queue.tsx:735-740` (border + highlight
  ring); status pill at `:782-784` via `STATUS_CONFIG[job.status].color` — but
  that map is keyed on **`JobStatus`** (scheduled/intake/in_progress/…), not
  appointment status.
- **`ScheduleScopeList` card:** `:918-924` static border; a generic indigo
  **"Schedule" badge** at `:946-949` + date/time. **No per-appointment-status
  styling today.**
- **The data is already present:** `PosScheduleEntry.status: AppointmentStatus`
  exists on every entry (`schedule-types.ts`), surfaced proactively in Phase 1A.
  **No endpoint widening is needed** to drive pending distinction.
- **Reusable styling pattern:** the existing indigo badge demonstrates the pill
  approach; admin ships `APPOINTMENT_STATUS_LABELS` (constants) for labels and
  `STATUS_DOT_COLORS` (`appointments/types.ts:32-39`) for colored dots. Phase 2
  can add a status pill/dot to the Schedule card keyed on `entry.status` (e.g.
  amber for `pending`, blue for `confirmed`), **with `dark:` variants per Rule
  #10** (the surrounding card already uses `dark:` throughout). Lifting
  `STATUS_DOT_COLORS` alongside `STATUS_TRANSITIONS` (Q5) would let both surfaces
  share the color taxonomy, but a small POS-local map is also acceptable.

### Q9: Dialog mounting pattern in POS

- **There is no dialog host in `job-queue.tsx` today.** Job detail uses a
  **full-screen view-swap**, not a modal: `pos/jobs/page.tsx` holds a `view` state
  machine (`{mode:'queue'} | {mode:'detail',jobId}`, `page.tsx:22`) and swaps the
  whole queue out for `<JobDetail>` on `onSelectJob` (`page.tsx:310,325`).
- **`AppointmentDetailDialog` is a modal `<Dialog>`** (fixed-inset overlay,
  `dialog.tsx:104-128`) — it can mount anywhere; it does not need the view-swap.
- **Where state should live:** the `scheduleEntries` already live in `JobQueue`
  (`:235`), so the simplest mount point is `JobQueue` itself. Replace
  `ScheduleScopeList`'s `onTapPlaceholder` (`:676`, currently a "coming in Phase 2"
  toast) with `onSelectAppointment(id)`; store a `selectedAppointmentId` in
  `JobQueue`; **fetch the full appointment** via the existing POS
  `GET /api/pos/appointments/[id]` (returns the full `PosAppointment` shape);
  mount the dialog; **on save, close + call `fetchSchedule()`** to refresh the
  list (`:423-438`).
- **Working template:** `pos/jobs/components/change-time-button.tsx` *already does
  this exact pattern* inside the Jobs surface — it fetches a single `PosAppointment`
  from `/api/pos/appointments/[id]` + `/api/pos/staff/available` in parallel
  (`:77-78`), gates on `usePosPermission('appointments.reschedule')` (`:62`), and
  mounts a **reused** dialog (`RescheduleAppointmentDialog`) unmodified (Rule #11,
  documented at `:18-26`). Phase 2 is the same pattern, scaled to the full detail
  dialog and a `staff/available`-style employees source.

### Q10: Risks I haven't surfaced

1. **Dark mode is the largest mechanical cost (Rule #10).** The dialog **body**
   uses light-only grays with **zero `dark:` variants** across ~370 lines — the
   info `<dl>` (`text-gray-900/500`), service rows, the mobile card
   (`bg-gray-50 border-gray-200`, `:336`), the textareas (`bg-white`, `:487,497`),
   the cancellation block (`bg-red-50`, `:422`), etc. The `<Dialog>` **primitive**
   *does* adapt (it uses `bg-ui-bg` / `text-ui-text` theme tokens, `dialog.tsx:119,137`),
   but the inner content does not. **Mitigating fact:** adding `dark:` variants is a
   **no-op in admin** (admin never enters `.dark`), so making the *single* component
   dual-context is safe and does not require a fork.
2. **Missing POS status/notes endpoint = the real server work (see Q3).** Decide
   **webhook policy**: the admin route fires `appointment_confirmed` /
   `appointment_completed` / `appointment_rescheduled` webhooks (`route.ts:132-164`);
   the POS reschedule endpoint *deliberately suppresses* the rescheduled webhook
   (Item 12 design, `reschedule/route.ts:28-34`). A POS status endpoint should
   likely follow the POS "operator manages comms directly" convention (suppress, or
   make it explicit). **→ operator decision.**
3. **"Edit in POS" button is nonsensical in POS** (`:206-221`) — already in POS,
   and `returnTo=/admin/appointments` is wrong. Must hide in POS (or repurpose to
   the in-POS service-edit ticket drain). The `canEditServices` gate (`:166-169`)
   that controls it implies service-edit-via-POS, which in POS is the native
   ticket flow, not a deep-link.
4. **Data-shape: `PosScheduleEntry` (list) ≠ `AppointmentWithRelations` (prop).**
   The Schedule list shape lacks `is_mobile`, the `mobile_*` snapshot fields, the
   coupon/loyalty/manual modifier columns, `job_notes`/`internal_notes`,
   `cancellation_*`, and uses `detailer` rather than `employee`; its `vehicle` Pick
   omits `size_class`. So the list shape **cannot** feed the dialog directly — fetch
   the full appointment on tap (existing `GET /api/pos/appointments/[id]`) or widen
   the schedule endpoint. **`PosAppointment`** (`pos/components/appointments/types.ts`)
   *is* effectively `AppointmentWithRelations` (both `extends Appointment` with the
   same customer/vehicle-incl-`size_class`/employee/services joins; only a minor
   nullability diff on `service`). Lifting one shared type (Q5) lets both surfaces
   agree and prevents two near-identical types drifting.
5. **Hardcoded `EditMobileModal mode` + `ModifierSummary variant`** (Q2) — small,
   but both must be parameterized or the mobile-edit POSTs to the wrong auth
   surface and the modifier block renders light-only.
6. **`onSave` payload schema.** The dialog calls `onSave(id, AppointmentUpdateInput)`
   (`appointmentUpdateSchema`, shared). A combined POS PATCH should accept that same
   schema so `onSave` stays one call.
7. **Cancel handoff.** The admin dialog delegates cancel to a parent `onCancel`
   (admin's `<CancelAppointmentDialog>`). POS already ships its own
   `pos/components/appointments/cancel-appointment-dialog.tsx` (HMAC + dark). Wire
   the POS parent's `onCancel` to the **POS** cancel dialog — trivial (it's a prop).
8. **POS auth-expiry plumbing.** The dialog itself doesn't fetch (save/cancel are
   props; `EditMobileModal` already uses `posFetch` in pos mode), but the POS
   parent's `onSave`/`onCancel` handlers and the on-tap appointment fetch **must use
   `posFetch`** (401 → `/pos/login?reason=session_expired`), not `fetch`.
9. **iOS input zoom (Rule #16).** The notes textareas use `text-sm` (`:487,497`),
   `<16px` → iOS zooms on focus. POS is staff-facing on iPad (lower tolerance than
   customer-facing), but worth bumping to `text-base sm:text-sm` when adapting.

---

## Recommended Phase 2 architecture

**Reuse the admin `AppointmentDetailDialog` as a single dual-context component**
(do not fork), with these changes:

**Component (make it context-agnostic — admin behavior unchanged):**
1. Add optional props to absorb the three admin assumptions, e.g.
   `mobileModalMode?: 'admin' | 'pos'` (default `'admin'`, passed to
   `EditMobileModal`), `modifierVariant?: 'admin' | 'pos'` (default `'admin'`),
   and either an `onEditInPos?: () => void` callback or an `editInPosHref?: string`
   — when absent in POS, render nothing. This keeps `useRouter` out of the POS path.
2. Add `dark:` variants throughout the body (no-op for admin, required for POS).
3. Change its `../types` import to the lifted shared module.

**Shared lift:**
4. Move `STATUS_TRANSITIONS` (+ `AppointmentWithRelations`, optionally
   `STATUS_DOT_COLORS`) to `src/lib/appointments/` and re-export from admin
   `../types` (no admin importer edits).

**Server (the only new endpoint):**
5. Add `PATCH /api/pos/appointments/[id]` — `authenticatePosRequest` +
   `appointmentUpdateSchema` + per-field `checkPosPermission`
   (`update_status` / `reschedule` / `add_notes`), overlap check mirroring the
   admin route, **webhook policy per operator decision** (recommend suppress, à la
   POS reschedule). Returns the full joined appointment (same select as the POS
   reschedule endpoint's response, `reschedule/route.ts:210-220`). **No
   role-defaults migration** (Q4).

**POS wiring (follow `change-time-button.tsx`):**
6. In `job-queue.tsx`: `ScheduleScopeList` `onTapPlaceholder` → `onSelectAppointment(id)`;
   add `selectedAppointmentId` state + on-tap fetch via
   `GET /api/pos/appointments/[id]` (with a `staff/available`-style employees
   source); mount `<AppointmentDetailDialog … mobileModalMode="pos"
   modifierVariant="pos" />`; wire `onSave` → the new POS PATCH (via `posFetch`),
   `onCancel` → POS `cancel-appointment-dialog.tsx`; on success close +
   `fetchSchedule()`.
7. Gate the dialog's `canReschedule` / `canCancel` / `canAddNotes` from
   `usePosPermission('appointments.reschedule' / '.cancel' / '.add_notes')`.

**Pending distinction (Q8):** add a status pill/dot keyed on `entry.status` to the
`ScheduleScopeList` card (dark-aware). No endpoint change.

---

## Implementation scope estimate

| Area | Files | Effort |
|---|---|---|
| Lift shared type/consts + admin re-export | `src/lib/appointments/*` (new), `admin/appointments/types.ts` | ~0.25h |
| Parameterize dialog (3 props) + dark-mode pass | `admin/appointments/components/appointment-detail-dialog.tsx` | ~1.25h (dark pass is the bulk) |
| New combined POS PATCH endpoint + tests | `api/pos/appointments/[id]/route.ts` (new) + `__tests__` | ~1.25h |
| Mount + wire in JobQueue (state, fetch, dialog, cancel, refetch) + Schedule status pill | `pos/jobs/components/job-queue.tsx`, possibly `pos/jobs/page.tsx` | ~1h |
| Vitest: dialog dual-context render, POS PATCH permission matrix, mount/close/refetch invariant, status-pill | (per-area) | included above |
| **Total** | **~5–6 files** (exceeds Memory #8 — split if needed) | **~3–4.5h** |

This likely warrants **its own session** (Memory #8: >3 files / >300 lines). A
clean split: **Session A** = shared lift + dialog parameterization + dark mode +
POS PATCH endpoint (server + component); **Session B** = JobQueue mount/wire +
status pill + integration tests.

---

## Open operator decisions

1. **Rich reuse vs slim dialogs (the central call).** Reuse the admin
   `AppointmentDetailDialog` (status + notes + mobile + modifier summary + services
   display in one panel; ~3–4.5h incl. dark-mode retrofit + new POS status
   endpoint) — **OR** reuse the already-POS-wired, already-dark, already-in-Jobs
   slim dialogs (`reschedule-appointment-dialog.tsx` + `cancel-appointment-dialog.tsx`;
   no dark retrofit, no type lift, no new endpoint) and accept that Schedule rows
   get reschedule + cancel only (no status-change, no notes). The operator has
   leaned "reuse admin dialog"; this audit confirms it is feasible and the extra
   capability (status + notes editing on upcoming appointments) is the justification
   — but the slim path is genuinely less work if that capability isn't needed yet.
2. **Webhook policy for POS status changes** (Risk #2): suppress customer
   notifications (matching POS reschedule convention) or fire confirmed/completed
   webhooks as admin does?
3. **Status-change scope on upcoming rows:** which transitions should POS expose in
   Schedule scope? (e.g. allow pending→confirmed and →no_show, but route
   →in_progress/→completed through the existing "start work" / job materialization
   path rather than a raw status flip.)

---

*Read-only audit. Findings feed directly into the Phase 2 implementation prompt;
file:line references are precise as of commit `78f6cd68` (Phase 1B merge).*
