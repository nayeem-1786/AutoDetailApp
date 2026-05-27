> **REFRAMED 2026-05-27 (post-merge of audit `1927d4b2`).** Originally drafted
> as "POS Appointments Modal Parity Audit" framing — landed on main 2026-05-27
> as part of the SMS-AI v2 audit-and-validate arc's final session. Operator
> review surfaced a scope reframe within minutes of merge: POS Appointments
> tab is being retired in favor of POS Jobs as the unified day-of operations
> surface, absorbing the original Item 15d intent.
>
> This document is preserved (renamed from
> `ITEM_15E_POS_APPOINTMENTS_MODAL_PARITY_AUDIT.md`) as the **Admin Appointment
> capability reference inventory** (Target 1) + reuse pattern map (Target 3)
> + D45/D46/D48 interaction analysis (Target 5) + Workstream K walk-in
> baseline (Target 8). The new audit at
> `docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md` (landing in the
> session after this reframing prep) will reference these sections.
>
> **Sections still valid (use as reference):**
> - **Target 1:** Admin Appointment Dialog capability inventory (17 mutable +
>   9 readonly = 26 capabilities at
>   `src/app/admin/appointments/components/appointment-detail-dialog.tsx`)
> - **Target 3:** Shared infrastructure patterns + reuse recommendations
>   (Pattern C architecture; 5 helpers already shared:
>   `<EditMobileModal>`, `<ModifierSummary>`, `<PaymentMismatchBanner>`,
>   `composeLineItems`, `formatChannelLabel`; 1 extraction needed at
>   `/api/appointments/[id]/route.ts:11-187` → new
>   `src/lib/appointments/update-appointment.ts`)
> - **Target 5:** D45/D46/D47/D48 interactions (16th visual surface flagged
>   — 3 POS appointment endpoints need `quantity` SELECT widening)
> - **Target 8:** Workstream K walk-in identity interaction (Admin channel-
>   label drift noted; POS has zero channel awareness today)
>
> **Sections OBSOLETED by reframing (do NOT use as reference):**
> - **Target 2:** POS Appointments View current state — factually accurate for
>   current code, but the gap analysis assumed POS Appointments tab persists.
>   New audit reframes against POS Jobs unification.
> - **Target 6:** Item 15c interaction — assumed POS Appointments tab persists
> - **Target 7:** Item 15d implication — Item 15d is being ABSORBED into 15e,
>   not downstream
> - **Target 9:** Implementation scope estimate (3 phases / 6-9 hours) —
>   obsolete; new audit produces phased plan against unification scope
> - **Target 10:** Verification plan — obsolete (different phases)
> - **Target 11:** Open operator decisions (11 decisions) — obsolete; new
>   audit reformulates the decision set against unification direction

---

# Item 15e — POS Appointments Modal Capability Parity Audit (2026-05-27)

> Read-only diagnostic audit. NO source code changes, NO migrations, NO test
> changes. Surfaces evidence for operator decisions before Item 15e fires.

## TL;DR

The "POS Appointments Modal" referenced by Item 15e is, in current code, the
**`<RescheduleAppointmentDialog>`** mounted by
`src/app/pos/components/appointments/appointments-view.tsx:371-380`.
Today it exposes a **4-field subset** of the Admin Appointment Detail Dialog:
date, start time, end time, assigned detailer — plus a sibling
`<CancelAppointmentDialog>` (Item 15b) on the row's trailing trash icon. That
is the **entire** mutable surface POS currently offers against an existing
appointment.

The Admin Appointment Detail Dialog
(`src/app/admin/appointments/components/appointment-detail-dialog.tsx`, 567
lines) exposes **17 distinct capabilities** across status changes, scheduling,
detailer assignment, notes (job + internal), modifier display, mobile-service
toggle/edit/enable, payment-mismatch detection, channel display, cancellation
detail readout, and "Edit in POS" deep-link. POS currently has **5** of those
(date/start/end/detailer/cancel). The parity gap is **12 capabilities**, of
which:
- **9 should land in POS** (rebuild the modal as a full detail view —
  status, notes ×2, mobile service edit + enable, modifier display, channel
  pill, deposit/balance readout, payment-mismatch banner, cancellation reason
  readout)
- **2 already have a canonical alternative path** (Edit Services →
  `/pos?source=appointment&id=…` deep-link per Item 15f Layer 8e; Send
  Confirmation does NOT currently exist on Admin's surface either, only auto-
  fires from quote-book — see Target 4 for the "don't add to either" call)
- **1 is data-only** (vehicle info — already in the row card; just needs
  surfacing in the detail modal)

The architectural recommendation is **Pattern C — both surfaces routed through
a shared library function** for every cascade-aware operation. Two of the
mutation endpoints (services PUT, mobile-service PATCH) already do this via
`src/lib/appointments/service-edit.ts` and the shared
`<EditMobileModal mode='pos'|'admin'>` component. Three others (status update,
notes update, single-row PATCH) currently have an admin-only endpoint at
`/api/appointments/[id]` PATCH with no POS variant; Item 15e must add a
parallel POS endpoint that wraps the same Zod schema + audit log + webhook
suppression policy.

**D48 surface adoption gap surfaced:** the POS Appointments view list and
detail GET endpoints (`/api/pos/appointments` + `/api/pos/appointments/[id]`
+ `/api/pos/appointments/[id]/reschedule` response) **do NOT include
`quantity`** in their `appointment_services(…)` SELECT. This is the **16th
D46/D48 visual surface** flagged for adoption — independent of Item 15e but
discovered during this audit.

**Implementation scope estimate:** 3 phased sessions (~6-9 hours total).
Roughly Phase A — endpoints + data plumbing (1 session); Phase B — UI
rebuild from `<RescheduleAppointmentDialog>` to `<PosAppointmentDetailDialog>`
(1 session); Phase C — service-edit affordance + tests + D48 quantity
adoption fold-in (1 session).

**11 well-framed operator decisions surfaced (Target 11)** — none blocking,
4 substantive (modal scope, notify policy, service-edit affordance choice,
D48 fold-in) and 7 minor.

## Capability parity matrix (the central artifact)

| # | Capability | Admin (Detail Dialog) | POS (Reschedule/Cancel/View) | Reuse pattern | Parity action |
|---|---|---|---|---|---|
| 1 | View customer name | ✓ `appointment-detail-dialog.tsx:223-225, 231-234` | ✓ row card `appointments-view.tsx:321-323`; reschedule dialog `:135-137` | — | none — already parity |
| 2 | View customer phone | ✓ `:235-237` (formatPhone) | ❌ not shown in modal | Pattern B (data already on `PosAppointment.customer.phone`) | ADD to detail modal |
| 3 | View customer email | ✓ `:238-240` | ❌ not shown in modal | Pattern B (data on `PosAppointment.customer.email`) | ADD to detail modal |
| 4 | View vehicle (Y/M/M + color) | ✓ `:250-260` cleanVehicleDescription + color | ✓ row card `:324-332` Y/M/M only (no color) | Pattern B (color already on `PosAppointment.vehicle.color`) | ADD color to detail modal |
| 5 | View booked-by channel | ✓ `:243-248` CHANNEL_LABELS | ❌ no channel display in POS | Pattern B (shared `formatChannelLabel(channel, 'pos')` already exists at `src/lib/utils/format-channel.ts`; used by admin day-list `:80-84`) | ADD via shared helper |
| 6 | View total amount | ✓ `:262-265` formatCurrency | ❌ not shown | Pattern B | ADD |
| 7 | View deposit + balance | ✓ `:267-277` formatCurrency conditional | ❌ not shown | Pattern B | ADD |
| 8 | View services list w/ tier label + qty | ✓ `:289-313` `composeLineItems` + plain mapping (does NOT call `renderTierToken` — admin's own gap) | ❌ row card shows comma-joined names only `:333-339`; reschedule dialog hides services entirely | Pattern C (`composeLineItems` shared; `attachTierMetaToItems` + `renderTierToken` already shared) | ADD detail list + adopt D46 helpers (also fix admin's gap — see Target 5) |
| 9 | View modifier summary (coupon/loyalty/manual discount) | ✓ `:319-327` `<ModifierSummary variant='admin'>` | ❌ not shown | Pattern C (`src/components/appointments/modifier-summary.tsx` is the shared component; `variant='pos'` already exists at `:53-57` for POS theming) | ADD with `variant='pos'` |
| 10 | Edit status (pending → confirmed → in_progress → completed → no_show; cancelled via dialog) | ✓ `:432-450` Select with recommended/override grouping | ❌ no status field in any POS surface | Pattern C (admin uses generic `PATCH /api/appointments/[id]`; needs parallel `PATCH /api/pos/appointments/[id]/route.ts` reading shared `appointmentUpdateSchema` from `src/lib/utils/validation.ts:491` + shared status-transition map at `src/app/admin/appointments/types.ts`) | ADD with new POS PATCH endpoint |
| 11 | Edit date | ✓ `:469-470` HTML date input | ✓ `reschedule-appointment-dialog.tsx:142-150` | Pattern C (POS endpoint `/api/pos/appointments/[id]/reschedule` is the canonical narrowed path; admin endpoint `/api/appointments/[id]` is broader; Item 15e ADDs `/api/pos/appointments/[id]` PATCH for the full edit set — keeps reschedule as the narrow path) | none for the date field itself — but UX merges into a single modal |
| 12 | Edit start time | ✓ `:472-473` | ✓ reschedule `:153-160` | — | merge into unified modal |
| 13 | Edit end time | ✓ `:475-476` | ✓ reschedule `:162-169` | — | merge into unified modal |
| 14 | Edit assigned detailer | ✓ `:453-464` Select w/ role labels | ✓ reschedule `:173-187` Select w/ role labels | — | merge into unified modal |
| 15 | Edit job notes | ✓ `:481-489` textarea, `disabled={!canAddNotes}` | ❌ not exposed in POS | Pattern C (admin PATCH writes via shared `appointmentUpdateSchema`; new POS PATCH wraps same schema) | ADD |
| 16 | Edit internal notes | ✓ `:491-499` textarea, `disabled={!canAddNotes}` | ❌ not exposed in POS | Pattern C (same as #15) | ADD |
| 17 | Edit Services (cascade to job) | ✓ `:206-221` "Edit in POS" deep-link (Layer 8d-bis); bespoke modal deleted Layer 8e | **POS Appointments → POS Sale via deep-link already works** (Item 15f Phase 1 Layer 8b drain), but the POS Appointments modal itself has no "Edit Services" button — it only triggers via the Admin deep-link, or via POS Jobs card `:588-604` | Pattern C (`src/lib/appointments/service-edit.ts` is the cascade helper; both `/api/admin/appointments/[id]/services` and `/api/pos/appointments/[id]/services` call it) | ADD "Edit in POS Sale" button to POS appointment detail modal (deep-link to `/pos?source=appointment&id=…&returnTo=/pos` — same shape as admin's; URL already short-circuits since we're already in POS) — see Target 6 + Q3 |
| 18 | Mobile-service display (zone + surcharge + address) | ✓ `:335-385` w/ pencil edit + MapPin icon | ❌ not exposed in POS Appointments (POS Jobs has it via `job-detail.tsx:1893+`) | Pattern C (`<EditMobileModal mode='pos'\|'admin'>` already supports both surfaces; PATCH endpoints at `/api/admin/appointments/[id]/mobile-service` + `/api/pos/appointments/[id]/mobile-service` already symmetric) | ADD modal mount with `mode='pos'` |
| 19 | Mobile-service "Enable" affordance (non-mobile → mobile conversion) | ✓ `:392-407` dashed-border button | ❌ not in POS Appointments (POS Jobs has it `:1122+`) | Pattern C (same modal + endpoints) | ADD |
| 20 | Payment-mismatch banner (after mobile/services edit) | ✓ `:409-418` `<PaymentMismatchBanner>` | ❌ not in POS Appointments (POS Jobs `:621-652` has it) | Pattern C (`src/components/jobs/payment-mismatch-banner.tsx` is already shared) | ADD |
| 21 | Cancellation reason / fee readout (when status = 'cancelled') | ✓ `:421-429` red bg readout | ❌ not in POS Appointments (cancelled rows are server-filtered from POS list `/api/pos/appointments/route.ts:83`, so this rarely surfaces; but operator who opens the modal from a deep-link to a cancelled appt sees nothing) | Pattern B | ADD readonly readout |
| 22 | Cancel appointment | ✓ `:503-515` footer button → routes to `<CancelAppointmentDialog>` (admin variant — w/ optional fee field) | ✓ trash icon `:350-360` → `<CancelAppointmentDialog>` (POS variant — no fee field, `notify_customer` checkbox defaults OFF) | Pattern B (POS dialog `pos/components/appointments/cancel-appointment-dialog.tsx`; endpoints share `sendCancellationNotifications` + `fireWebhook('appointment_cancelled')` paths) | none — already parity (different field surface by design — see Target 4) |
| 23 | Set cancellation fee on cancel | ✓ `admin/.../cancel-appointment-dialog.tsx:102-115` gated on `appointments.waive_fee` | ❌ NOT exposed on POS cancel dialog (explicitly out-of-scope per `pos/.../cancel/route.ts:33-34`: *"appointments.waive_fee is admin-only"*) | — | **KEEP OUT of POS** (Target 4 lock #1) |
| 24 | Trigger auto-notify of customer on cancel | ✓ admin cancel fires `sendCancellationNotifications` unconditionally on success | ✓ POS cancel gated on `notify_customer` checkbox (default OFF) | Pattern B | none — divergence is intentional (Item 15b acceptance) |
| 25 | Audit-log write on every mutation | ✓ `/api/appointments/[id]` `:166-177` `logAudit({source:'admin'})` | ✓ POS PATCH endpoints log `source:'pos'` | Pattern C | none |
| 26 | "Send Confirmation" / customer SMS+email | ❌ NOT on Admin Appointment Dialog (only auto-fires from `quote-book-dialog.tsx:126` post-booking) | ❌ NOT on POS Appointments | — (auto-only) | **NOT a parity gap** — neither surface exposes it manually. Operator question Q-NOTIFY (Target 11 #2) decides whether to add to BOTH or NEITHER. |
| 27 | "Send Payment Link" | ❌ NOT on Admin Appointment Dialog | ❌ NOT on POS Appointments (POS Jobs has it via `job-detail.tsx:1744`) | — | OUT of Item 15e scope per Item 15e roadmap (payment-link is a job-card responsibility) |

**Capability rollup:** Admin = 17 mutable + 9 readonly = 26 unique features.
POS Appointments currently exposes 5 (date/start/end/detailer/cancel). POS
deltas-in: trash icon row-affordance (1 — covered in #22). **Net parity gap to
close = 13 ADD rows (rows 2-10 + 15-21) + 1 conditional ADD (row 17 — see
Target 6).**

## Architectural reuse pattern recommendation

| Layer | Recommendation | Evidence |
|---|---|---|
| Cascade service-edit | **Pattern C** — both Admin + POS routes call `editAppointmentServices` from `src/lib/appointments/service-edit.ts`. | Already in place; no work needed in Item 15e beyond the deep-link UI affordance. |
| Mobile-service edit/enable | **Pattern C** — shared `<EditMobileModal mode='pos'\|'admin'>` at `src/components/jobs/edit-mobile-modal.tsx`. | Already in place; POS Appointments just needs to mount it with `mode='pos'`. |
| Modifier summary display | **Pattern C** — shared `<ModifierSummary variant='admin'\|'pos'>` at `src/components/appointments/modifier-summary.tsx:53-57`. | Already in place. |
| Payment-mismatch banner | **Pattern C** — shared `<PaymentMismatchBanner>` at `src/components/jobs/payment-mismatch-banner.tsx`. | Already in place. |
| Status / notes / detailer PATCH (the full Item 15e UX combine) | **Pattern C (NEW work)** — extract the admin PATCH body of `/api/appointments/[id]/route.ts:11-187` into a new `src/lib/appointments/update-appointment.ts` helper; both `/api/appointments/[id]` and new `/api/pos/appointments/[id]` PATCH wrap it. Mirrors `service-edit.ts` extraction pattern from Item 15f Phase 1 Layer 8a. | Admin endpoint already exists at `:11-187`; needs extraction + POS sibling. Audit log adds `source:'pos'` + `notification_suppressed` flag (matches `pos/reschedule/route.ts:189-208` precedent). |
| List endpoint SELECT widening (D48 quantity adoption) | **Independent fold-in** — widen `appointment_services(…)` SELECT to include `quantity` in 3 POS endpoints (list, single GET, reschedule response). Tier_label resolution via `attachTierMetaToItems` only fires in the detail modal render path; the row card shows comma-joined names and doesn't need it. | See Target 5 for the 3 file locations. |
| Channel pill rendering | **Pattern C** — `formatChannelLabel(channel, 'pos'\|'admin')` at `src/lib/utils/format-channel.ts` is already shared and surface-aware. | Used by `admin/.../day-appointments-list.tsx:83`. POS just adopts it. |

### Pattern A (POS calls Admin endpoint) is NOT recommended

POS calls Admin endpoint directly would cross the auth surface boundary
(POS uses HMAC `authenticatePosRequest`, Admin uses session
`getEmployeeFromSession`). The audit log `source` column would also lose
fidelity. Pattern C extraction is the right architectural choice.

## Detailed findings per target

### Target 1: Admin Appointment Dialog capability inventory

Source: `src/app/admin/appointments/components/appointment-detail-dialog.tsx`
(567 lines).

**Header + actions:**
- `:194-226` `DialogHeader` — title "Appointment Details" + customer name
  subtitle.
- `:206-221` "Edit in POS" button (top-right, conditional on
  `canEditServices`) — deep-link to `/pos?source=appointment&id=…&returnTo=/admin/appointments`. Layer 8d-bis canonical pattern.
- `:223-225` Title "Appointment Details".
- `:228-278` Read-only `<dl>` grid: Customer + phone/email; Booked-by channel;
  Vehicle (Y/M/M + color); Total; Deposit + balance.

**Body — services + modifiers + mobile:**
- `:289-313` Services list via `composeLineItems` — synthetic mobile-fee row
  inserted (Phase Mobile-1.7 contract). Note: this code path does NOT call
  `attachTierMetaToItems` / `renderTierToken` — admin appointment dialog
  displays service name + price only, no tier sub-text. This is an admin-side
  gap (separate from Item 15e — see Target 5).
- `:319-327` `<ModifierSummary variant='admin'>` — coupon / loyalty / manual
  discount block.
- `:335-385` Mobile-service info card (zone name + surcharge + address) with
  pencil edit button (Phase Mobile-1.9).
- `:392-407` "Enable mobile service" dashed-border button for non-mobile
  appointments.
- `:409-418` `<PaymentMismatchBanner>` after mobile/services edit if
  `mismatch_amount >= 0.005`.
- `:421-429` Cancellation reason + fee red-bg readout (when status
  ='cancelled').

**Form (editable fields, all on one `<form>` with `Save Changes` button):**
- `:434-451` Status `<Select>` — recommended + override status groups.
- `:453-464` Detailer `<Select>` — gated on `canReschedule`.
- `:467-479` Date / Start / End `<Input type=date|time>` — gated on
  `canReschedule`.
- `:481-489` Job Notes `<textarea>` — gated on `canAddNotes`.
- `:491-499` Internal Notes `<textarea>` — gated on `canAddNotes`.

**Footer actions:**
- `:503-515` Cancel button (destructive variant, opens
  `<CancelAppointmentDialog>` external to dialog).
- `:516-518` Close.
- `:519-521` Save Changes (submits `detail-edit-form`).

**Permission props (passed from parent host):**
- `:59-62` `canReschedule`, `canCancel`, `canAddNotes?` — defaults to true for
  notes only.

**Mutation API:**
- Save → `onSave(id, AppointmentUpdateInput)` → page-level calls `PATCH
  /api/appointments/[id]` (`page.tsx:250-264`).
- Cancel → opens `<CancelAppointmentDialog>` → `POST /api/appointments/[id]/cancel` (`page.tsx:275-289`).
- Mobile → modal owns its own PATCH against
  `/api/admin/appointments/[id]/mobile-service`.

**Total capability count: 17 mutable + 9 readonly = 26 distinct features.**

### Target 2: POS Appointments View current state + parity matrix

Source: `src/app/pos/components/appointments/appointments-view.tsx` (392
lines), `reschedule-appointment-dialog.tsx` (208 lines),
`cancel-appointment-dialog.tsx` (180 lines), `types.ts` (37 lines).

**Host view (`appointments-view.tsx`):**
- Date-range filters (today / today+tomorrow / 7d / this month / custom).
- Refresh button.
- List grouped by date with relative-day labels (Today / Tomorrow /
  Yesterday).
- Per-row card (`:298-361`): time range + status pill + customer name +
  vehicle Y/M/M (no color) + comma-joined service names + employee name +
  trailing cancel-trash icon (gated on `appointments.cancel`).
- Click row → opens `<RescheduleAppointmentDialog>` (NOT a detail view).
- Click trash → opens `<CancelAppointmentDialog>` (Item 15b).

**Reschedule dialog (`reschedule-appointment-dialog.tsx`):**
- Header: customer name + Y/M/M (no color).
- 4 editable fields: date, start time, end time, assigned detailer.
- Yellow disclaimer banner `:189-193`: *"Customer is not automatically
  notified when you reschedule from POS."*
- "Save Changes" → `PATCH /api/pos/appointments/[id]/reschedule` (returns
  joined `PosAppointment` for in-place row replacement).

**Cancel dialog (`cancel-appointment-dialog.tsx`):**
- Required: cancellation reason textarea.
- Optional: `notify_customer` checkbox (default OFF per Item 15b).
- Yellow disclaimer banner conditional on notify checkbox.
- "Cancel Appointment" → `POST /api/pos/appointments/[id]/cancel`.

**What's MISSING vs Admin Dialog (rows 2-3, 5-10, 15-21 in parity matrix):**
- Customer phone + email
- Vehicle color
- Booked-by channel pill
- Total / deposit / balance readout
- Services list with tier label + quantity (also misses D46/D48 helpers)
- Modifier summary (coupon / loyalty / manual)
- Status edit
- Job notes edit
- Internal notes edit
- Mobile-service display / edit / enable
- Payment-mismatch banner
- Cancellation reason readout for already-cancelled rows
- "Edit in POS Sale" deep-link affordance (Item 15f Phase 1 Layer 8e canonical
  service-edit surface)

**What's PRESENT in POS but NOT in Admin (delta in the other direction):**
- Row-level trash icon (Admin only has the button inside the dialog).
- Date-range filter presets (Admin uses calendar grid w/ month navigation
  instead).

Both deltas are appropriate to retain (iPad-fast affordances).

### Target 3: Shared infrastructure patterns + reuse recommendations

| Capability | Shared lib path | Status | Item 15e action |
|---|---|---|---|
| Cascade service-edit | `src/lib/appointments/service-edit.ts` (`editAppointmentServices`, `ServiceEditError`) | ✅ already shared | No work; just route the new deep-link button through `/pos?source=appointment&id=…` |
| Mobile-service edit | `<EditMobileModal mode='pos'\|'admin'>` at `src/components/jobs/edit-mobile-modal.tsx` | ✅ already shared | Mount in new POS appointment detail modal with `mode='pos'` |
| Mobile-service / address PATCH endpoints | `/api/{admin\|pos}/appointments/[id]/mobile-service` (3 sites: GET zones, PATCH mobile-service, PATCH mobile-address) | ✅ already symmetric | No work |
| Modifier summary display | `<ModifierSummary variant='admin'\|'pos'>` at `src/components/appointments/modifier-summary.tsx:53-57` | ✅ already shared with variant | Mount with `variant='pos'` |
| Payment-mismatch banner | `<PaymentMismatchBanner>` at `src/components/jobs/payment-mismatch-banner.tsx` | ✅ already shared | Mount |
| Compose line items (mobile-fee synthesis) | `composeLineItems()` at `src/lib/utils/compose-line-items.ts` | ✅ already shared | Adopt in new POS detail modal |
| Tier rendering | `attachTierMetaToItems()` + `renderTierToken()` at `src/lib/quotes/{attach-tier-meta,tier-display}.ts` | ✅ already shared | Adopt in new POS detail modal (closes Target 5 / 16th D46 surface) |
| Channel pill label | `formatChannelLabel(channel, 'pos'\|'admin')` at `src/lib/utils/format-channel.ts` | ✅ already shared | Adopt in row card AND detail modal |
| Status transitions / recommended-vs-override grouping | `STATUS_TRANSITIONS` at `src/app/admin/appointments/types.ts` | ⚠️ admin-scoped types path | Lift to `src/lib/appointments/status-transitions.ts` OR import the admin-path constant directly (1-line decision — see Target 11 #6) |
| Status validation schema | `appointmentUpdateSchema` at `src/lib/utils/validation.ts:491` | ✅ already shared | New POS PATCH wraps the same schema |
| Single-row PATCH endpoint | `/api/appointments/[id]/route.ts:11-187` admin-only PATCH (status, scheduling, employee, notes) | ❌ NO POS variant exists | **NEW WORK** — extract handler body to `src/lib/appointments/update-appointment.ts` helper; admin route + new POS route both wrap. See Target 9 Phase A. |
| Audit log writes | `logAudit({source:'admin'\|'pos'})` at `src/lib/services/audit.ts` (already infrastructure-shared) | ✅ already shared | POS variant calls with `source:'pos'` |
| Status change webhooks (`appointment_confirmed`, `appointment_completed`, `appointment_rescheduled`) | `fireWebhook(name, payload, supabase)` at `src/lib/utils/webhook.ts` | ✅ already shared | **DECISION POINT (Q-NOTIFY)** — does POS PATCH fire the same status-change webhooks Admin does? Item 12 (reschedule) and Item 15b (cancel) both **suppress** the webhook with `notification_suppressed:true` audit-log flag. Continuing that pattern for status changes too is the conservative default; opting in via per-save checkbox is the symmetric option. See Target 11 #2. |

### Target 4: Capabilities that DON'T belong in POS

| # | Admin capability | Recommend keep-out from POS | Rationale |
|---|---|---|---|
| 1 | **Cancellation fee** (admin/.../cancel-appointment-dialog.tsx:102-115) | KEEP OUT (already locked) | Per `pos/.../cancel/route.ts:33-34`: *"appointments.waive_fee is admin-only"*. Item 15b shipped POS cancel with this exclusion intentionally. No reason to revisit. |
| 2 | **Webhook auto-fire on status change** | KEEP SUPPRESSED in POS (recommend) | Item 12 + Item 15b established a "POS doesn't auto-notify by default" pattern. Status changes from POS (e.g., confirmed → in_progress → completed) should record `notification_suppressed:true` unless operator opts in per save. Symmetric with reschedule/cancel. See Target 11 #2. |
| 3 | **Cascade override / force-write to terminal appointments** | NO opt-out exposed in either surface | The cascade helper `editAppointmentServices` refuses terminal-status appointments. Neither surface should expose a bypass; this isn't a parity question. |
| 4 | **"Send Confirmation" manual trigger** | DEBATABLE — Target 11 #3 surfaces this | Neither Admin nor POS currently exposes a "Send Confirmation" button against an existing appointment. The `/api/{admin\|pos}/appointments/[id]/notify` endpoints exist and are called by `quote-book-dialog.tsx:126` automatically post-booking. If operators want manual re-send (e.g., "customer says they didn't get the SMS"), it should land in BOTH surfaces, not just POS. **This is not a 15e gap** — it's a separate audit if operator wants it. |
| 5 | **Booking source / channel rewrite** | KEEP OUT | Neither surface exposes this; `appointments.channel` is set on creation and not editable. No change for 15e. |
| 6 | **Hard delete / purge** | KEEP OUT | Admin Purge admin tool exists separately (`docs/dev/ROADMAP-13-ITEMS.md` Workstream J Session 1 reference); should remain admin-only. Not in scope for 15e. |
| 7 | **Permission/role assignment UI** | KEEP OUT | Admin-only by design; out of any POS scope. |
| 8 | **Bulk operations** | KEEP OUT | Neither surface exposes; out of 15e scope. |
| 9 | **Audit log views** | KEEP OUT | Admin-only design. |
| 10 | **Raw JSON / debug panels** | KEEP OUT | Neither surface exposes; out of scope. |

### Target 5: D45/D46/D47/D48 interactions

D48 (`appointment_services.quantity` schema + conversion-flow propagation —
shipped 2026-05-26 via session #93, commit `d4e2fd97`) widened the
`appointment_services` SELECT in 4 customer-facing surfaces. The POS
Appointments view did NOT receive this fold-in (it's a non-customer-facing
admin-internal view, so D48's scope-targeted at-the-time was correct). However,
Item 15e's new detail modal WILL render the services list — at that point the
list endpoint needs to surface `quantity` for the new render path to use
`renderTierToken({tier_name, tier_label, qty_label, quantity})`.

**3 POS endpoints need their `appointment_services(…)` SELECT widened (one
line each):**

| File | Current | Item 15e change |
|---|---|---|
| `src/app/api/pos/appointments/route.ts:79` | `appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))` | ADD `quantity` |
| `src/app/api/pos/appointments/[id]/route.ts:51` | (same) | ADD `quantity` |
| `src/app/api/pos/appointments/[id]/reschedule/route.ts:217` (response re-fetch) | (same) | ADD `quantity` |

**Type widening:** `PosAppointmentService` at
`src/app/pos/components/appointments/types.ts:8-17` needs `quantity: number`
added.

**Render adoption:** the new POS detail modal calls `attachTierMetaToItems`
+ `renderTierToken` (already shared, no new work in the helper layer). This is
the **16th visual surface** to adopt D46.

**Admin Appointment Dialog also lacks tier render (separate gap):** the admin
dialog's services list `appointment-detail-dialog.tsx:289-313` shows service
name + price only — no tier sub-text, no quantity rendering. Closing this in
the same Item 15e session would be a small +1 admin-side fix, but it's
strictly out-of-Item-15e-scope per audit hard rules ("don't recommend
capabilities to add to Admin"). Flagging as a captured follow-up only.

D45 / D47 / D49 / D50 are SMS-AI-v2 prompt and tool changes — they do NOT
touch any of Item 15e's surface area.

### Target 6: Item 15c Change Time interaction

**Resolution:** Item 15c shipped to BOTH POS Jobs Card (`change-time-button.tsx`)
AND POS Appointments View (tap-row → reschedule dialog — line 304 of
`appointments-view.tsx`). Both reuse `<RescheduleAppointmentDialog>` from
`src/app/pos/components/appointments/reschedule-appointment-dialog.tsx`.

**Item 15e implication:** Date + start + end fields already exist in the POS
modal — they just need to be merged into the new unified detail modal alongside
the new status / notes / detailer / mobile / modifier fields. Item 15c's
canonical reschedule dialog can be:

- **Option A (recommended):** absorbed into the new
  `<PosAppointmentDetailDialog>` component. The narrow reschedule dialog stays
  as the entry point from POS Jobs Card `<ChangeTimeButton>` (which fetches
  the appointment via `/api/pos/appointments/[id]` and opens the dialog —
  changing this to open the full detail modal would expose status/notes/
  modifier edit from a Jobs Card context, which is feature creep).
- **Option B:** delete the narrow reschedule dialog entirely; both POS
  Appointments and POS Jobs Card use the full detail modal. Risk: Jobs Card's
  Change Time UX becomes heavier (more fields visible, more cognitive load
  for a narrow time-only edit).

**Recommend Option A.** Keep `<RescheduleAppointmentDialog>` for the narrow
Jobs Card entry point; build `<PosAppointmentDetailDialog>` for the POS
Appointments tap-row entry point. Both write through the same
`/api/pos/appointments/[id]/reschedule` for the date/time/detailer subset,
plus the new `/api/pos/appointments/[id]` PATCH for status/notes.

### Target 7: Item 15d implication / future-proofing

Item 15d ("Today's Tickets" Combined View) is read-only — rows link out to
existing edit surfaces (quote → quote editor; appointment → appointment
dialog; job → job card; transaction → receipt). For 15d's appointment rows
to render with full information, the row data shape needs to include enough
to draw a useful row card; the new POS detail modal then opens on click.

**Pre-staging recommended:**

1. **`PosAppointment` type shape stability** — after 15e ships, downstream
   consumers (15d row builders) read the same `PosAppointment` shape. Don't
   add Item 15e-internal fields to the type that 15d would have to ignore.
2. **`GET /api/pos/appointments` list endpoint payload** — keep the list
   endpoint's response shape additive-only (D48 quantity addition fits this);
   15d's query layer will likely call this same endpoint with a today-only
   filter.
3. **A standalone data hook for "all today's items"** — explicitly OUT of
   15e scope. 15d adds its own hook fetching quotes + appointments + jobs +
   transactions. Don't build a "today's everything" hook in 15e — that's a
   premature abstraction.

**Conclusion:** 15e doesn't need to pre-build for 15d. Both work against the
same `PosAppointment` shape via the same endpoints. The Item 15e detail modal
is the canonical "edit surface for an appointment" — 15d's row click routes
to it.

### Target 8: Workstream K walk-in identity interaction

**Walk-in surfacing in current code:**
- Admin appointments page (`page.tsx:142`) `SELECT *` already pulls
  `channel`. Day-list (`day-appointments-list.tsx:80-84`) renders the channel
  pill via `formatChannelLabel(channel, 'admin')`.
- Admin Appointment Dialog (`appointment-detail-dialog.tsx:37-42, 246-247`)
  renders "Booked By" via the local `CHANNEL_LABELS` map (`walk_in:
  'Staff (Walk-in)'`). This is a **fork of** the shared `formatChannelLabel`
  helper — local map at `:37-42` does not call the shared function. Minor
  drift, captured for cleanup follow-up but not a 15e issue.
- POS Appointments view has NO channel awareness — neither row card nor
  reschedule dialog renders the channel.
- POS Jobs Card (`job-detail.tsx:114, 681, 861, 1689`) DOES check
  `channel === 'walk_in'` for cancel-flow gating (suppresses notification
  dialog for walk-ins; the SMS template assumes booked-appointment phrasing).

**Workstream K interaction:**
- WK Sessions 2-4 are about RESOLVING walk-in customer identity at sale time
  (POS receipt-send flow) + retroactively (admin tooling) + via SMS reply
  (agent-side). They do NOT touch the POS Appointments view directly.
- 15e's only walk-in-related work: render a channel pill in the row card +
  detail modal via shared `formatChannelLabel(appt.channel, 'pos')`. No
  conflict with WK; same channel column, same helper.
- **Recommend:** as part of 15e's row card + detail modal channel pill
  rendering, MIGRATE the admin dialog's local `CHANNEL_LABELS` map (`:37-42`)
  to call `formatChannelLabel(channel, 'admin')` too. This closes the minor
  drift identified above. **OPT-IN — see Target 11 #7.** Out of strict 15e
  scope per hard rules; offer as 1-line fold-in.

**No coordination required with WK Sessions 2-4 in either direction.**

### Target 9: Implementation scope estimate + phased structure

**Recommended split: 3 phased sessions (~6-9 hours total CC time).**

#### Phase A — Endpoints + data plumbing (~1.5-2 hours)

**Deliverables:**
1. Widen 3 POS endpoint SELECTs to include `quantity` in
   `appointment_services(…)` (Target 5 fold-in).
2. Widen `PosAppointmentService` type at `types.ts:8-17` to add
   `quantity: number`.
3. Extract admin PATCH body at `/api/appointments/[id]/route.ts:11-187` into
   new `src/lib/appointments/update-appointment.ts` helper (mirrors Item 15f
   Layer 8a's `service-edit.ts` extraction). Helper accepts the same
   `appointmentUpdateSchema`-validated input, runs overlap check + permission
   checks + UPDATE + audit-log write + webhook fire. Source-aware: `source`
   param controls whether webhook fires (admin: yes; pos: gated on
   `notify_customer` flag in input).
4. Add new POS PATCH route `/api/pos/appointments/[id]/route.ts` wrapping the
   helper with `authenticatePosRequest` + `checkPosPermission` chains. Same
   permission gates as admin (status → `appointments.update_status`; notes
   → `appointments.add_notes`; reschedule → `appointments.reschedule`).
5. (Optional) Lift `STATUS_TRANSITIONS` from admin-types path to
   `src/lib/appointments/status-transitions.ts` if Target 11 #6 chooses
   "lift".

**Files affected (estimate):** 3 endpoint SELECT widenings (~3 lines each),
1 type-file edit, 1 new helper module (~150-200 lines extracted from admin
route), 1 admin route refactor (~40 lines reduced), 1 new POS route (~80
lines), 1 type-shape update.

**Test scope:** +12-18 new vitest cases (POS PATCH endpoint coverage —
permission gates, source=pos audit log, notify-off invariant, overlap check,
status transition validation).

#### Phase B — UI rebuild (~2-3 hours)

**Deliverables:**
1. New `src/app/pos/components/appointments/pos-appointment-detail-dialog.tsx`
   (~400-500 lines) — mirrors Admin Appointment Dialog structure section by
   section, with iPad-responsive layout (single-column on narrow viewports,
   2-column grid on iPad landscape).
2. POS Appointments view `appointments-view.tsx:304, 371-380` updated — row
   click opens new detail dialog instead of bare reschedule dialog. Cancel
   trash icon still opens narrow cancel dialog (unchanged).
3. Mount shared components:
   - `<EditMobileModal mode='pos'>` for mobile edit/enable.
   - `<ModifierSummary variant='pos'>` for discount display.
   - `<PaymentMismatchBanner>` after mobile/services save.
4. New detail dialog uses `composeLineItems` + `attachTierMetaToItems` +
   `renderTierToken` for services list (closes 16th D46 surface).
5. Channel pill via shared `formatChannelLabel(channel, 'pos')`.
6. Per-field permission gating mirroring admin: `appointments.update_status`
   gates status `<Select>`; `appointments.reschedule` gates date/time/detailer;
   `appointments.add_notes` gates both notes textareas.
7. Notify-off behavior — single `notify_customer` checkbox at form bottom
   (default OFF) governing the new POS PATCH endpoint's webhook fire.
8. Keep `<RescheduleAppointmentDialog>` (Item 15c canonical narrow path) for
   POS Jobs Card entry point only.

**Files affected (estimate):** 1 new component (~450 lines), 1 host view
edit (~10 lines), no other src edits.

**Test scope:** +15-25 new vitest cases (component tests for permission
gating, modifier display, mobile modal mount, payment-mismatch surfacing,
notify-off invariant, status select recommended/override grouping).

#### Phase C — Service-edit affordance + final tests + closing (~1.5-2 hours)

**Deliverables:**
1. Add "Edit Services in Sale" button to new detail dialog (mirrors admin's
   "Edit in POS" deep-link `:206-221`) — routes to
   `/pos?source=appointment&id=…&returnTo=/pos` (the POS-internal `returnTo`
   is the POS dashboard since we're already in POS, not admin).
2. Per-field permission gating final pass — verify status select hides
   `cancelled` when user lacks `appointments.cancel` (mirrors admin
   `:152-156`).
3. End-to-end integration tests covering the full edit flow (status change
   + notes change + reschedule combined) similar to Item 15f Phase 1 Layer 8f
   pattern.
4. ROADMAP update: Item 15e → `✅ done`; Item 15d status review (does it
   still need separate work given 15e ships full detail modal? Operator
   decision deferred per audit Target 11 #8).

**Files affected:** 1 component edit, 1-2 new test files, 3 doc updates
(ROADMAP, CHANGELOG, possibly FILE_TREE).

**Test scope:** +5-10 integration tests joining list → detail → save flows.

**Total estimate:** ~6-9 hours CC implementation across 3 sessions.

### Target 10: Verification plan

Each Phase ships with operator-facing verification steps. Listed by phase:

**Phase A:**
- Endpoint test: `GET /api/pos/appointments?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  returns rows where `appointment_services[*].quantity` is present.
- Endpoint test: `GET /api/pos/appointments/[id]` includes `quantity`.
- Endpoint test: `PATCH /api/pos/appointments/[id]` accepts status change +
  emits audit log row with `source:'pos'` and `notification_suppressed: true`
  (when `notify_customer` is false).
- Regression check: `PATCH /api/appointments/[id]` (admin) produces identical
  DB state for the same input as the new POS PATCH (cross-surface
  verification).

**Phase B:**
- Open POS Appointments → tap a row → new detail dialog appears with all
  fields populated.
- Cashier role (lacks `appointments.update_status` per role-defaults) sees
  status select disabled / hidden; cashier with status permission can edit.
- Detailer role (lacks `appointments.reschedule`) sees date/time/detailer
  read-only.
- Mobile-service section: tap pencil → `<EditMobileModal>` opens with
  `mode='pos'`; save → row updates inline + payment-mismatch banner appears
  if total ≠ paid.
- Modifier summary: appointments with coupon / loyalty / manual discount
  applied show the block; appointments without it hide it (parity with
  Admin's `<ModifierSummary>` behavior).
- Tier rendering: an appointment with `tier_name='per_row'` + `quantity=2`
  renders as `"(2 Rows)"` next to the service name.

**Phase C:**
- New detail dialog → "Edit Services in Sale" button → opens POS Sale tab in
  edit mode with the appointment's services + modifiers pre-loaded → save
  changes → row updates in POS Appointments list inline (no full refetch).
- Cancelled appointment opened via deep-link (e.g., from 15d's future Today's
  Tickets row) shows cancellation reason red-bg readout.
- Status transition: pending → confirmed → in_progress → completed all save
  successfully + audit log row records the transition + webhook does NOT fire
  (unless notify_customer checked).

### Target 11: Open operator decisions

1. **Modal scope locking (Q-SCOPE):** confirm Item 15e ships the full 13-row
   parity matrix above (rows 2-10 + 15-21), OR scope to a narrower set.
   Audit's leaning: full set. Single session would violate Memory #8; phased
   plan in Target 9 handles this.

2. **Notify policy on status changes (Q-NOTIFY):** when operator changes
   status from POS (e.g., pending → confirmed), does the
   `appointment_confirmed` webhook fire?
   - **Option α (recommended — symmetric with Item 12 + 15b):** default OFF;
     single `notify_customer` checkbox at form bottom gates the webhook fire.
     Audit log records `notification_suppressed: <bool>`.
   - **Option β:** mirror admin's auto-fire behavior — status change always
     fires webhook. Risk: POS UX divergence (cancel + reschedule are notify-
     off, status would be notify-on — incoherent).
   - Audit leans α.

3. **Manual "Send Confirmation" button (Q-MANUAL-NOTIFY):** neither Admin nor
   POS currently exposes a manual "Send Confirmation" button (only auto-fires
   from quote-book post-booking). If operators want this for "customer says
   they didn't get the SMS" scenarios, it should land in BOTH surfaces, not
   just POS. Audit leans: **defer to a separate audit / item** — out of
   strict Item 15e scope.

4. **Service-edit affordance UX (Q-SERVICE-EDIT):**
   - **Option A (recommended):** add "Edit Services in Sale" button to new
     POS detail dialog, deep-link to `/pos?source=appointment&id=…&returnTo=/pos`
     — mirrors Admin's "Edit in POS" pattern.
   - **Option B:** rebuild a service-edit experience inside the POS detail
     dialog using `useServicePicker` (the original Item 15e acceptance
     criteria). Risk: contradicts Item 15a/15f Layer 8e closure ("bespoke
     modal deleted; canonical surface is POS edit-via-deep-link"). Recommend
     **A** to preserve canonical-engine principle.

5. **D48 fold-in timing (Q-D48-FOLDIN):** add the 3-endpoint quantity SELECT
   widening as part of Item 15e Phase A, OR ship as a standalone D51-style
   fold-in before/after? Audit leans: include in Phase A — it's a 3-line
   change that the new detail modal needs to render correctly. No reason to
   sequence separately.

6. **STATUS_TRANSITIONS lift (Q-LIFT-STATUS):** `STATUS_TRANSITIONS` lives at
   `src/app/admin/appointments/types.ts` today; new POS detail modal needs
   it. Options:
   - Import from admin path (1-line decision; admin types remain
     authoritative — minor cross-tree coupling).
   - Lift to `src/lib/appointments/status-transitions.ts` (clean separation;
     +1 file + 2 imports updated).
   - Audit leans: **lift** for canonical-engine cleanliness.

7. **Admin channel-label cleanup (Q-CHANNEL-CLEANUP):** Admin Appointment
   Dialog has its own `CHANNEL_LABELS` map (`:37-42`) parallel to the shared
   `formatChannelLabel()` helper. Out of strict Item 15e scope; offered as
   1-line fold-in.
   - Audit leans: **defer** — keep 15e tight.

8. **Item 15d revival decision (Q-15D-AFTER):** after Item 15e ships full
   detail modal, does Item 15d still need separate work? Today, the rationale
   for 15d is "operators have no single view showing today's quotes +
   appointments + jobs + transactions." 15e doesn't address that; it just
   improves the appointment surface. 15d stays as a separate item.
   - Audit leans: **keep deferred; revisit operationally after 15e UAT**.

9. **Mobile audit on existing POS Jobs Card (Q-JOB-CARD-IMPACT):** POS Jobs
   Card already mounts `<EditMobileModal mode='pos'>` + `<ModifierSummary>`
   etc. Item 15e doesn't touch POS Jobs Card. Verify in-session that 15e
   doesn't accidentally affect Jobs Card rendering (e.g., type changes to
   `PosAppointment` cascade?).
   - Audit leans: **verify in Phase A** — no expected breakage since
     `quantity` is a new optional field, but worth a regression check.

10. **Permission key for status edit in POS (Q-STATUS-PERM):** Admin uses
    `appointments.update_status` for status edits. POS PATCH should mirror
    this. The role-defaults (`src/lib/utils/role-defaults.ts`) currently
    grant `appointments.update_status` to admin/cashier/super_admin and deny
    detailer. Verify role-defaults file is the canonical source; no new
    permission keys introduced.
    - Audit leans: **mirror admin exactly**.

11. **iPad landscape vs portrait responsive (Q-IPAD-LAYOUT):** Admin
    Appointment Dialog assumes desktop (2-column grid via `grid-cols-2`).
    iPad portrait is narrower. Recommend POS detail dialog use single-column
    by default with `sm:grid-cols-2` for iPad landscape and up.
    - Audit leans: **single-column-first, sm:2-col upscaling**.

## Risk matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Phase A endpoint extraction introduces a regression in admin PATCH | Medium | Phase A test pass requires admin PATCH golden tests stay green; cross-surface integration test compares DB state of admin vs POS PATCH for identical input. |
| New POS detail modal accidentally exposes admin-only fields | Low | Audit Target 4 lock list keeps `cancellation_fee` + `purge` etc. out. Permission gating per-field mirrors admin. |
| `STATUS_TRANSITIONS` lift breaks admin imports | Low | If lifted, admin types re-exports from the new lib path (one-line backward-compat shim) until admin migrates. |
| D48 fold-in breaks PosAppointment downstream consumers | Low | `quantity: number` is additive; existing consumers ignore it. Type-check + lint gates catch any narrow-shape assertion. |
| Service-edit deep-link from POS-internal context loops awkwardly | Medium | Verify `returnTo=/pos` returns operator to the dashboard, not back to the appointment list (which would feel like a no-op). Consider `returnTo=/pos/appointments` or back-stack handling. |
| iPad layout regresses on small/portrait viewport | Medium | Phase B test uses iPad portrait/landscape viewport simulation; `sm:` breakpoint pinned. |
| Mobile-service modifier-save cascade rewrites loyalty/coupon in unexpected way | Low | Existing modifier-preservation contract (Item 15g Layer 15g-iii) covers this; POS detail modal doesn't add new mutation paths. |
| Walk-in appointment opened via deep-link (no customer_id) crashes | Low | `PosAppointment` type's customer is non-optional; walk-ins post-Phase-0a have a synthetic `customer_id`. Legacy null-customer walk-ins fail server-side before reaching client. |
| Audit-log write fails silently in new POS PATCH | Low | `logAudit` already throws on supabase error; helper extraction preserves this. |

## Verification of audit hard rules

- [x] NO `src/` changes (read-only audit)
- [x] NO migrations
- [x] NO test changes
- [x] Only new file = audit deliverable + 3 standard doc updates
- [x] Every finding cites `file:line` evidence
- [x] Target 11 surfaces options for operator to lock, NOT a pre-picked plan
- [x] No "add to admin" capability recommendations (one-direction audit)
- [x] D43-D50 SMS-AI v2 architecture untouched
- [x] D45/D46 helpers recommended for reuse, not refactor

## Captured for future (not Item 15e scope)

- **Admin Appointment Dialog tier rendering gap:** `appointment-detail-dialog.tsx:289-313` services list does NOT use `attachTierMetaToItems` + `renderTierToken`. Service name + price only — no tier sub-text. 1-line fold-in deferred. Not in 15e scope.
- **Admin Appointment Dialog channel-label drift:** local `CHANNEL_LABELS` map at `:37-42` parallel to shared `formatChannelLabel()`. 3-line cleanup deferred.
- **`useServicePicker` hook adoption gap:** the canonical hook
  (`src/lib/services/use-service-picker.ts`) is currently only consumed by its
  own tests + index re-export. The Item 15f Phase 1 closure pivoted operator
  service-edit surfaces to POS deep-link; the hook remains canonical for
  any FUTURE in-modal service editor (e.g., booking widget at
  `step-service-select.tsx` already imports from `@/lib/services`). Not a
  15e gap; documented for future-state visibility.
