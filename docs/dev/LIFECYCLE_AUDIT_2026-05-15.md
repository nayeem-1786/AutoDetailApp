# Lifecycle Audit — Quote → Appointment → Job

**Date:** 2026-05-15
**Author:** read-only audit (no code or schema changes)
**Purpose:** Establish a shared picture of how a customer ticket moves through Quote → Appointment → Job → Transaction in the current codebase, what surfaces touch each stage, and where operators have to switch surfaces to finish one customer's work. Input for a follow-on design conversation about a potential merged "Tickets" view (Roadmap Item 15, not drafted).
**Scope:** code at HEAD on `main`, commit `2eedaae4` (Item 12 — POS footer Appointments tab + reschedule). No external systems beyond what the codebase already integrates with.
**What this is NOT:** a redesign proposal, a fix for any specific bug, or a sprint plan.

---

## 1. Data Model

### 1.1 The four core tables

| Table | Purpose | Key columns (selected) | FKs out |
|---|---|---|---|
| **`quotes`** (`docs/dev/DB_SCHEMA.md:2064`) | Pre-sale priced offer. May or may not have a customer; may or may not become an appointment. | `id`, `quote_number` (unique), `customer_id` (nullable), `vehicle_id`, `status` (`draft`/`sent`/`viewed`/`accepted`/`expired`/`converted`), `subtotal`/`tax_amount`/`total_amount`, `valid_until`, `sent_at`/`viewed_at`/`accepted_at`, `converted_appointment_id`, `access_token`, `deleted_at` (soft delete), `coupon_code`, `is_mobile`/`mobile_zone_id`/`mobile_address`/`mobile_surcharge`/`mobile_zone_name_snapshot` | `customer_id → customers`, `vehicle_id → vehicles`, `converted_appointment_id → appointments`, `mobile_zone_id → mobile_zones`, `created_by → employees` |
| **`appointments`** (`docs/dev/DB_SCHEMA.md:144`) | Scheduled service slot — start, end, detailer, money, mobile context. Source of truth for **time**. | `id`, `customer_id` (NOT NULL), `vehicle_id`, `employee_id`, `status` (`pending`/`confirmed`/`in_progress`/`completed`/`cancelled`/`no_show` — enum `appointment_status`), `channel` (`online`/`phone`/`walk_in`/`portal` — enum `appointment_channel`), `scheduled_date`, `scheduled_start_time`, `scheduled_end_time`, `actual_start_time`/`actual_end_time`, `is_mobile`/`mobile_zone_id`/`mobile_address`/`mobile_surcharge`/`mobile_zone_name_snapshot`, `payment_status` (`pending`/`partial`/`paid`/`refunded`/`partial_refund`), `subtotal`/`tax_amount`/`discount_amount`/`total_amount`, `payment_type` (`deposit`/`pay_on_site`/`full`), `deposit_amount`, `payment_link_*`, `job_notes`, `internal_notes`, `cancellation_fee`, `cancellation_reason`, `reminder_sent_at` | `customer_id → customers`, `vehicle_id → vehicles`, `employee_id → employees`, `mobile_zone_id → mobile_zones` |
| **`appointment_services`** (`docs/dev/DB_SCHEMA.md:126`) | Join row pairing an appointment with one service line. | `id`, `appointment_id`, `service_id`, `price_at_booking`, `tier_name` | `appointment_id → appointments (CASCADE)`, `service_id → services (RESTRICT)` |
| **`jobs`** (`docs/dev/DB_SCHEMA.md:1193`) | Operational ticket once a detailer touches the work. Source of truth for **timer**, **intake**, **completion**, **photos**, **add-ons**. | `id`, `appointment_id` (**UNIQUE**, ON DELETE SET NULL), `transaction_id`, `customer_id` (NOT NULL), `vehicle_id`, `quote_id`, `assigned_staff_id`, `status` (`scheduled`/`intake`/`in_progress`/`pending_approval`/`completed`/`closed`/`cancelled` — TEXT with CHECK), `services` (**JSONB snapshot** — `[{id,name,price,is_mobile_fee?}]`), `work_started_at`/`work_completed_at`, `timer_seconds`/`timer_paused_at`, `intake_started_at`/`intake_completed_at`, `intake_notes`, `estimated_pickup_at`/`actual_pickup_at`, `pickup_notes`, `gallery_token` (unique), `cancellation_reason`/`cancelled_at`/`cancelled_by`, `created_by` | `appointment_id → appointments (SET NULL)`, `transaction_id → transactions (SET NULL)`, `customer_id → customers (CASCADE)`, `vehicle_id → vehicles (SET NULL)`, `assigned_staff_id → employees (SET NULL)`, `quote_id → quotes`, `cancelled_by → employees`, `created_by → employees` |
| **`transactions`** (`docs/dev/DB_SCHEMA.md:2909`) | Money record — what was tendered, refunded, voided. | `id`, `receipt_number` (unique), `square_transaction_id` (unique), `appointment_id`, `customer_id`, `vehicle_id`, `employee_id`, `status` (`open`/`completed`/`voided`/`refunded`/`partial_refund` — enum), `subtotal`/`tax_amount`/`tip_amount`/`discount_amount`/`total_amount`, `payment_method`, `coupon_id`, `loyalty_points_earned`/`redeemed`/`loyalty_discount`, `transaction_date`, `qbo_*`, `deposit_credit`, `access_token` | `appointment_id → appointments (SET NULL)`, `customer_id → customers (SET NULL)`, `vehicle_id`, `employee_id`, `coupon_id` |

### 1.2 Supporting children

| Table | Belongs to | Notes |
|---|---|---|
| `quote_items` | `quotes` | Per-line quote breakdown (service or product). |
| `quote_communications` | `quotes` | SMS/email send log per quote (channel + recipient + status). |
| `job_addons` (`DB_SCHEMA.md:1119`) | `jobs` | "Flag an issue" entries. Holds `authorization_token` (UNIQUE), `status` (`pending`/`approved`/`declined`/`expired`), `expires_at`, `message_to_customer`, `photo_ids` UUID[], `issue_type`/`issue_description`, `customer_notified_via`. |
| `job_photos` (`DB_SCHEMA.md:1159`) | `jobs` | `phase` (`intake`/`progress`/`completion`), `zone`, `image_url`, `annotation_data` JSONB. |
| `transaction_items` | `transactions` | Line items, including service-from-job and product-from-checkout. |

### 1.3 Are these truly separate tables, or states of one entity?

**They are four physically separate tables wired in a directed chain `quotes → appointments → jobs → transactions`, with optional shortcuts**:

- `quotes.converted_appointment_id` points forward to `appointments.id` (`SET NULL` on delete).
- `appointments.id` is referenced by `jobs.appointment_id` **with a UNIQUE constraint** (`jobs_appointment_id_unique`, `DB_SCHEMA.md:1237`) — at most one job per appointment.
- `jobs.appointment_id` is **nullable** (legacy pre-Phase 0a walk-ins; Phase 0a now eagerly creates a synthetic `appointments` row with `channel='walk_in'` for every walk-in job, per `src/app/api/pos/jobs/route.ts:322-339`).
- `jobs.quote_id` is a **direct shortcut** from job → quote (used by "Create Job from Quote" in POS to carry products + coupon through to checkout without going through an appointment first; see `src/app/pos/components/quotes/quote-detail.tsx:187-247` and `src/app/pos/components/quotes/quote-ticket-panel.tsx:640-787`).
- `transactions.appointment_id` is the canonical link from money back to the appointment; `jobs.transaction_id` is the inverse pointer set at checkout.

The DB layer treats them as **separate entities with independent lifecycles**, not "states of one entity":

- A quote can exist without ever becoming an appointment (status remains `draft`/`sent`/`viewed`/`expired`).
- An appointment can exist without a job (booked far in advance, or job not yet "populated" — see §2.2).
- A job can exist without an appointment (legacy pre-Phase 0a walk-ins still in flight).
- A transaction can exist without a job (e.g., pure product sale through the register).

### 1.4 Where does customer / vehicle / service data live across the chain?

- **Customer + vehicle**: FK only — every row in `quotes`, `appointments`, `jobs`, `transactions` carries `customer_id` and `vehicle_id` (with the same nullability rules per table above). Nothing is duplicated; everything joins back to `customers` and `vehicles`.
- **Services on a quote**: rows in `quote_items` (with `service_id` FK + `unit_price` + `tier_name` + free-form `item_name`).
- **Services on an appointment**: rows in `appointment_services` (with `service_id` FK + `price_at_booking` + `tier_name`).
- **Services on a job**: **`jobs.services` JSONB column** — a snapshot of `[{id, name, price, is_mobile_fee?}]`. This is materialized at job-create time from `appointment_services` (see `src/app/api/pos/jobs/populate/route.ts:99-111` and `src/app/api/pos/jobs/route.ts:381-408`). After that point, the JSONB is what the POS UI reads. **Mobile fee appears as a synthetic row with `id: null`, `is_mobile_fee: true`** (e.g., `src/app/api/pos/jobs/populate/route.ts:130-142`).
- **Money on the appointment** (`appointments.subtotal/tax_amount/discount_amount/total_amount`) is the source of truth for what's owed; `appointments.payment_status` tracks paid-state.
- **Money on the transaction** is the source of truth for what was tendered (with tip, refund, loyalty redemption, deposit_credit).

**Implication:** Services live in three places along the chain (`quote_items`, `appointment_services`, `jobs.services` JSONB). The JSONB on `jobs` is denormalized on purpose — POS reads it directly without joining — and **`jobs.services` does not auto-sync** if `appointment_services` is edited downstream. (No code path mutates `appointment_services` after job creation today; if one were added, the job snapshot would drift.)

---

## 2. State Transitions

### 2.1 Quote → Appointment

- **Service-layer entry point:** `convertQuote()` in `src/lib/quotes/convert-service.ts:19`.
- **HTTP entry points:**
  - POS: `POST /api/pos/quotes/[id]/convert` (`src/app/api/pos/quotes/[id]/convert/route.ts:9`). Permission gate: `quotes.convert`.
  - Admin (cookie auth): `POST /api/quotes/[id]/convert` (`src/app/api/quotes/[id]/convert/route.ts:8`). Permission gate: `quotes.convert`.
  - Voice agent: also calls `convertQuote()` (covered by `ConvertQuoteOptions.appointmentStatus = 'pending'`).
- **What happens (`convert-service.ts:19-146`):**
  1. Fetch quote with `quote_items`, reject if `expired` or `converted`.
  2. Compute `endTime` from `time + duration_minutes`; auto-assign detailer via `findAvailableDetailer()` if none provided.
  3. INSERT into `appointments` with `status='confirmed'` (POS/admin) or `'pending'` (voice agent), `channel='phone'` by default. Mobile fields are mirrored from the quote.
  4. INSERT one row per service item into `appointment_services` (filtered to items with non-null `service_id`).
  5. UPDATE quote `status='converted'`, set `converted_appointment_id`.
  6. Fire-and-forget webhook `appointment_confirmed`.
- **Status indicators after transition:** `quotes.status = 'converted'`, `quotes.converted_appointment_id` set, `appointments.status = 'confirmed' | 'pending'`.

### 2.2 Appointment → Job

There are **two distinct entry points** that materialize a `jobs` row from an `appointments` row:

#### (a) Bulk daily populate

- **Entry point:** `POST /api/pos/jobs/populate` (`src/app/api/pos/jobs/populate/route.ts:12`).
- **Trigger UI:** the "Refresh" button in the POS Jobs queue header (`src/app/pos/jobs/components/job-queue.tsx:409-420`) calls `populateFromAppointments(selectedDate)`. This is called automatically when the Jobs tab is opened for a date (`populatedDates.current.delete(...)` followed by the fetch loop).
- **What happens:** Pulls all `appointments` for the target PST date with `status IN ('confirmed', 'in_progress')` that don't yet have a matching `jobs` row, then UPSERTs `jobs` rows with `status='scheduled'`, copying `customer_id`/`vehicle_id`/`employee_id`/services and computing `estimated_pickup_at` from `scheduled_end_time` (`populate/route.ts:39-167`). Uses `onConflict: 'appointment_id', ignoreDuplicates: true` for idempotency against the UNIQUE constraint.
- **Result:** `jobs.status = 'scheduled'`, `jobs.appointment_id` set.

#### (b) Walk-in (eager appointment + job creation)

- **Entry point:** `POST /api/pos/jobs` (`src/app/api/pos/jobs/route.ts:147`). Permission gate: `pos.jobs.manage`.
- **Trigger UI:** "New Walk-in" button on POS Jobs queue (`job-queue.tsx:421-429`) routes the operator through a customer-lookup / catalog flow that ultimately POSTs here. Also called from the POS Quote builder's "Create Job" path (`src/app/pos/components/quotes/quote-ticket-panel.tsx:737-748` and `quote-detail.tsx:211-221`) — this path passes `quote_id`.
- **What happens (Phase 0a, `jobs/route.ts:322-453`):**
  1. INSERT a synthetic `appointments` row with `channel='walk_in'`, `status='in_progress'`, `scheduled_date=today PST`, `scheduled_start_time = NOW PST`, `payment_type='pay_on_site'`.
  2. INSERT `appointment_services` rows mirroring the requested services. If this fails, the appointment is deleted (rollback).
  3. INSERT the `jobs` row with `status='scheduled'`, snapshotted `services` JSONB, `appointment_id` pointing at the synthetic appointment, optional `quote_id`.
  4. Roll back the synthetic appointment on `jobs` INSERT failure.
- **Result:** `jobs.status = 'scheduled'`, `appointments.channel = 'walk_in'`, `appointments.status = 'in_progress'`.

### 2.3 Job status progression

`jobs.status` advances through:
`scheduled` → `intake` → (`intake_completed_at` set) → `in_progress` → `completed` → `closed` (after checkout) → terminal.

Transitions and their endpoints:

| From | To | Endpoint | UI button |
|---|---|---|---|
| `scheduled` | `intake` | `PATCH /api/pos/jobs/[id]` with `status: 'intake'` | "Start Intake" (`job-detail.tsx:1366-1372`) |
| `intake` | `in_progress` | `POST /api/pos/jobs/[id]/start-work` (`api/pos/jobs/[id]/start-work/route.ts`) | "Start Work" (`job-detail.tsx:1383-1392`) |
| `in_progress` | `completed` | `POST /api/pos/jobs/[id]/complete` (`api/pos/jobs/[id]/complete/route.ts`) | "Complete Job" (`job-detail.tsx:1415-1421`) — passes through zone picker if photos enabled |
| `completed` | `closed` | side effect of checkout — `POST /api/pos/transactions` updates `jobs.status = 'closed'` and `jobs.transaction_id` (`api/pos/transactions/route.ts:633-645`) | "Checkout" / "Close Out" (`job-detail.tsx:1444-1458`) |
| any except `completed`/`closed`/`cancelled` | `cancelled` | `POST /api/pos/jobs/[id]/cancel` | "Cancel Job" (`job-detail.tsx:1482-1491`) — permission-gated |

`pending_approval` is a defined enum value (`jobs_status_check`) but I did not find any code path that transitions a job INTO it; it appears reserved (see also `getPendingAddonsForCustomer` in `src/lib/services/job-addons.ts:258`).

### 2.4 Can transitions go backward?

- **Quote → "un-convert":** No code path reverts a quote's `status='converted'` or clears `converted_appointment_id`.
- **Job → revert to scheduled:** No backward transition. Status edits are forward-only via the dedicated endpoints. The `PATCH /api/pos/jobs/[id]` route accepts a `status` field but there is no UI control to set a job back to `scheduled` once it's `in_progress`.
- **Appointment → "un-cancel":** Admin appointment editor can switch `status` through the dropdown (`src/app/admin/appointments/components/appointment-detail-dialog.tsx:360-376`). The "Override" optgroup allows reverting to non-terminal statuses, gated by the dialog's `recommendedStatuses`/`overrideStatuses` derivation.
- **Job → revert from cancelled:** No backward transition.

---

## 3. The Quote-to-Appointment / Quote-to-Job Conversion

User's quote: *"on quote the actual ticket gets taken back into the actual ticket creation systems."*

There are **two** conversion outcomes available on a POS quote, each reusing different parts of the booking/ticket plumbing:

### 3.1 "Convert to Appointment" (creates an appointment, no job yet)

- **UI entry:** `src/app/pos/components/quotes/quote-detail.tsx:347-351` ("Convert to Appointment" button, gated on `quotes.convert`).
- **Dialog:** `<QuoteBookDialog>` at `src/components/quotes/quote-book-dialog.tsx:32`. 4 fields: date, time, duration (default = sum of service durations), assigned detailer (`Auto-assign` by default).
- **API call:** `POST {apiBasePath}/{quoteId}/convert` where `apiBasePath` is `/api/pos/quotes` (POS) or `/api/quotes` (admin). Both routes delegate to `convertQuote()` in `src/lib/quotes/convert-service.ts:19`.
- **Carried over:** `customer_id`, `vehicle_id`, mobile fields (`is_mobile`, `mobile_zone_id`, `mobile_address`, `mobile_surcharge`, `mobile_zone_name_snapshot`), pricing totals, quote notes → `appointments.job_notes`, services from `quote_items` → `appointment_services`.
- **Added:** `scheduled_date`, `scheduled_start_time`, `scheduled_end_time`, `employee_id`, `status` (`confirmed` for POS/admin), `channel` (`phone`).
- **NOT carried:** products in the quote (only items with non-null `service_id` become appointment_services); coupons; loyalty redemption.
- **Side effect:** Fire-and-forget webhook `appointment_confirmed`, auto-send confirmation SMS+email via `/api/pos/appointments/[id]/notify` (called from `quote-book-dialog.tsx:124-138`).

### 3.2 "Create Job from Quote" (creates an appointment + job today, skips date picker)

This is the "ticket gets taken back into the actual ticket creation systems" path the user described. There are two implementations of it:

- **From the quote builder panel** (`src/app/pos/components/quotes/quote-ticket-panel.tsx:640-787`, function `handleCreateJob`): performs a quote save (status → `converted`) then directly `POST /api/pos/jobs` with the quote's customer/vehicle/services + `quote_id`. Surfaces toasts about products + coupon "carrying over to checkout."
- **From the quote detail page** (`src/app/pos/components/quotes/quote-detail.tsx:187-247`, function `handleCreateJobFromQuote`): same shape — `POST /api/pos/jobs` with `quote_id`, then PATCH quote `status='converted'`.

Both paths reuse `POST /api/pos/jobs` (`src/app/api/pos/jobs/route.ts:147`) — the same endpoint as a normal walk-in. The endpoint:

1. Performs duplicate-quote-to-job check via `quote_id` (`jobs/route.ts:277-291`) — returns 409 if a job already exists for the quote.
2. Creates the synthetic Phase 0a `appointments` row (`channel='walk_in'`, `status='in_progress'`, `scheduled_date=today PST`).
3. Inserts `appointment_services`.
4. Inserts the `jobs` row with `quote_id` set.
5. Resolves a save-to-customer mobile-address prompt action (`resolveMobileAddressAction`).

**Carried over:**

- Customer + vehicle (FK).
- Service items only (products dropped; products instead carry into the checkout cart via the quote's `quote_id` linkage — see `/api/pos/jobs/[id]/checkout-items/route.ts`).
- Mobile fields (built by `buildMobilePayload(quote)` at `quote-ticket-panel.tsx:675`).
- Coupon: not embedded in the job; surfaced as a toast for the cashier and applied at checkout via the quote's `quote_id`.
- Quote notes → `intake_notes`.

**Added at job creation:**

- `assigned_staff_id` via `findAvailableDetailer()` if not provided.
- `estimated_pickup_at` defaulting to "now rounded up to the next 15-min slot" via `getNowPstRoundedTo15()`.
- `status: 'scheduled'`.

**What "ticket creation system" is reused:** The same `POST /api/pos/jobs` endpoint that walk-in tickets use. So the "Create Job from Quote" path is literally walk-in creation with an extra `quote_id` carried forward and the quote's items pre-populated. The POS register's `<TicketPanel>` (Sale tab) is **NOT** what the quote builder reuses — the quote builder has its own `<QuoteTicketPanel>` (`src/app/pos/components/quotes/quote-ticket-panel.tsx`) that shares the customer-lookup, catalog browser, mobile-fee picker, and validation primitives but maintains its own state in `<QuoteContext>` (`src/app/pos/context/quote-context.tsx`).

---

## 4. The Mid-Job "Flag an Issue" Flow

User's note: *"for in-progress jobs to add a service is already built out, called flag an issue with the customer and they get notified and approval process complete with notifications via SMS approval flow, etc."*

### 4.1 Entry point + UI flow

- **UI entry:** "Flag Issue" button on the POS Jobs detail card, **only visible when `job.status === 'in_progress'`** and `pos.jobs.flag_issue` permission is granted (`src/app/pos/jobs/components/job-detail.tsx:1405-1413`).
- **Component:** `<FlagIssueFlow>` at `src/app/pos/jobs/components/flag-issue-flow.tsx:100`. Multi-step wizard with the following steps (`Step` type at line 74): `issue-type` → `zone-select` → `photo` → `catalog` → `discount` → `delay` → `message` → `preview`.
- **Steps:**
  1. **Issue type** (`flag-issue-flow.tsx:277-346`): pick from `ISSUE_TYPES` (e.g., scratches, water_spots, paint_damage, pet_hair_stains, interior_stains, odor, headlight_haze, wheel_damage, tar_sap_overspray, other), with free-text override on "Other."
  2. **Zone select** (`flag-issue-flow.tsx:351-387`): pick a body zone from `EXTERIOR_ZONES ∪ INTERIOR_ZONES`.
  3. **Photo** (`flag-issue-flow.tsx:392-402`): `<PhotoCapture>` records the issue with annotation overlay (`AnnotationOverlay`).
  4. **Catalog** (`flag-issue-flow.tsx:407-520`): pick a service (already-added services are blocked via `addedServiceIds`), product, or custom description+price.
  5. **Discount** (`flag-issue-flow.tsx:525-590`): optional dollar discount; UI displays `finalPrice = max(0, price - discount)`.
  6. **Delay** (`flag-issue-flow.tsx:595-666`): optional pickup-delay in minutes. Auto-fills with service's `base_duration_minutes`.
  7. **Message** (`flag-issue-flow.tsx:671-751`): pick one of three templates or custom-write. Templates interpolate `{issue}`, `{vehicle}`, `{friendly_service}`, `{price}`.
  8. **Preview** (`flag-issue-flow.tsx:756-890`): mock authorization page + annotated photo + price block + "Will be sent via: SMS/Email" notice. Send button → `handleSend()`.

### 4.2 API endpoints involved

- **Create the addon + send notifications:** `POST /api/pos/jobs/[id]/addons` (`src/app/api/pos/jobs/[id]/addons/route.ts:60`). Permission gate: `pos.jobs.flag_issue`. Job must be `in_progress` or 400. Steps:
  1. Read `addon_auth_expiration_minutes` from `business_settings` (default 30 min).
  2. Mint `crypto.randomUUID()` as `authorization_token`.
  3. INSERT `job_addons` row (`status='pending'`, `expires_at`, `photo_ids`, `pickup_delay_minutes`, `customer_notified_via: []`).
  4. If `pickup_delay_minutes > 0` and the job has `estimated_pickup_at`, UPDATE the job's `estimated_pickup_at += delay`.
  5. Build the customer URL: `${NEXT_PUBLIC_APP_URL}/authorize/${token}`.
  6. Send SMS via `renderSmsTemplate('addon_authorization', …)` + `sendSms()` (slug-driven, customer-facing transactional, logged to conversation, `notificationType: 'addon_authorization_request'`).
  7. Send HTML email via `sendEmail()` with annotated-photo URL (via `getAnnotatedPhotoUrl()`), CTA buttons.
  8. UPDATE addon row with `customer_notified_via: ['sms','email']` (whichever succeeded).
- **List addons + auto-expire stale ones:** `GET /api/pos/jobs/[id]/addons` (`addons/route.ts:17`). On every read, UPDATEs any pending+expired rows to `status='expired'`.
- **Resend a declined/expired addon:** `POST /api/pos/jobs/[id]/addons/[addonId]/resend` (`api/pos/jobs/[id]/addons/[addonId]/resend/route.ts`). UI button visible per-addon in the Jobs card (`job-detail.tsx:1240-1253`).

### 4.3 Customer approval mechanism (public, no auth)

- **Customer-facing page:** `/authorize/[token]` (`src/app/authorize/[token]/page.tsx:43` resolves the token by querying `job_addons.authorization_token`).
- **Approve API:** `POST /api/authorize/[token]/approve` (`src/app/api/authorize/[token]/approve/route.ts:10`) → delegates to `approveAddon(addonId)` in `src/lib/services/job-addons.ts:83`.
- **Decline API:** `POST /api/authorize/[token]/decline` → delegates to `declineAddon(addonId)` in `src/lib/services/job-addons.ts:172`.
- **`approveAddon()` (`job-addons.ts:83-166`):**
  1. Validate addon is still `pending` and not past `expires_at` (auto-expires on read).
  2. UPDATE `job_addons.status = 'approved'`, set `responded_at`.
  3. Send confirmation SMS via `renderSmsTemplate('addon_approved', …)`.
- **`declineAddon()` (`job-addons.ts:172-244`):** Same shape, status `declined`, slug `addon_declined`.

### 4.4 What happens to the job once approved / declined

Approval is recorded **on the addon row**, not on the job. The job's `status` does **not** change — it remains `in_progress`. The cashier sees the new status in the Jobs card's "Add-ons / Issues Flagged" panel (`job-detail.tsx:1197-1272`) and via `setInterval`-driven polling (the card re-fetches on focus and periodically).

**Downstream effects of an approved addon:**

- Surfaced as an item at checkout via `/api/pos/jobs/[id]/checkout-items` — the approved addon's service/product is included alongside the original job services in the cart that materializes into the register.
- Counted toward the appointment's `payment_status` indirectly through the eventual transaction total.
- Pickup-time delay is already applied to `jobs.estimated_pickup_at` at addon-create time (§4.2 step 4) — approval doesn't re-apply it.

**Declined / expired addons:** No state change beyond the addon row itself. Resend control is exposed on the Jobs card (`job-detail.tsx:1240-1253`).

### 4.5 SMS / notification touchpoints (summary)

| Event | Channel | Template slug | Audit row |
|---|---|---|---|
| Addon authorization sent | SMS + Email | `addon_authorization` (`addons/route.ts:247-269`) | `customer_notified_via: ['sms','email']` |
| Addon approved | SMS | `addon_approved` (`job-addons.ts:148-161`) | conversation log entry (`notificationType: 'addon_approved'`) |
| Addon declined | SMS | `addon_declined` (`job-addons.ts:226-238`) | conversation log entry (`notificationType: 'addon_declined'`) |

---

## 5. POS Surfaces — Entity × Edit-Capability Matrix

Each row is a POS surface; columns are categories of edit. Cells: ✅ = supported, ❌ = not supported, P = permission-gated. The "Entity shown" column names the primary entity, with secondary joins in parentheses.

| Surface | File | Entity shown | Add service | Remove service | Change date/time | Change detailer | Change customer | Change vehicle | Change mobile zone/addr | Reschedule | Cancel | Start/complete | Permission |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Register / Sale tab** (cart) | `src/app/pos/page.tsx` → `<RegisterTab>` (`src/app/pos/components/register-tab.tsx`) | Ticket (in-flight, not persisted as quote/appt/job until commit) | ✅ | ✅ | n/a | n/a | ✅ | ✅ | ✅ | n/a | n/a | Checkout → creates Transaction | `pos.checkout.process` (cart access ungated; pricing changes gated) |
| **Quotes — List** | `src/app/pos/quotes/page.tsx` → `<QuoteList>` (`src/app/pos/components/quotes/quote-list.tsx`) | `quotes` rows | ❌ | ❌ | n/a | n/a | n/a | n/a | n/a | n/a | ❌ (in-list) | n/a | view: ungated; create: `quotes.create` |
| **Quotes — Builder** | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | `quotes` draft (in-flight) | ✅ | ✅ | n/a (date= valid_until only) | n/a | ✅ | ✅ | ✅ | n/a | ✅ delete | "Create Job" / "Convert to Appointment" | `quotes.create`, `quotes.send`, `quotes.convert`, `pos.jobs.manage` |
| **Quotes — Detail** | `src/app/pos/components/quotes/quote-detail.tsx` | `quotes` row + `quote_items` + `quote_communications` | ❌ (use Edit → Builder) | ❌ | n/a | n/a | n/a | n/a | n/a | n/a | ✅ soft-delete (drafts only) | "Create Job" / "Convert to Appointment" | as above |
| **Jobs — Queue (list + timeline)** | `src/app/pos/jobs/components/job-queue.tsx` (+ `job-timeline.tsx`) | `jobs` for selected date | ❌ | ❌ | drag-and-drop on timeline → `PATCH /api/pos/jobs/[id]/reschedule` (P) | drag-and-drop on timeline (P) | ❌ | ❌ | ❌ | partial (drag only) | ❌ | "New Walk-in" → creates job (P) | `pos.jobs.view` (queue), `pos.jobs.manage` (drag + walk-in) |
| **Jobs — Detail card** | `src/app/pos/jobs/components/job-detail.tsx` | `jobs` row (+ joined appointment, addons, photos) | ✅ via Edit Services modal (P) | ✅ via Edit Services modal (P) | ❌ (use POS Appointments tab) | ✅ Reassign Detailer modal (P) | ✅ "Customer" tile → CustomerLookup (P) | ✅ "Vehicle" tile → VehicleSelector (P) | ✅ EditMobileModal (P) | ❌ from this card | ✅ "Cancel Job" (P; admin-only for in_progress/pending_approval) | ✅ Start Intake / Start Work / Complete / Checkout | `pos.jobs.view`, `pos.jobs.manage`, `pos.jobs.cancel`, `pos.jobs.flag_issue` |
| **Jobs — Flag Issue wizard** | `src/app/pos/jobs/components/flag-issue-flow.tsx` | Creates a `job_addons` row | ✅ adds *future* service via approval | n/a | n/a | n/a | n/a | n/a | n/a | applies pickup delay | n/a | n/a | `pos.jobs.flag_issue` |
| **Appointments tab** (new — Roadmap Item 12) | `src/app/pos/components/appointments/appointments-view.tsx` | `appointments` in date range | ❌ | ❌ | ✅ via RescheduleAppointmentDialog (P) | ✅ same dialog (P) | ❌ | ❌ | ❌ | ✅ explicit (P) | ❌ (must use Admin) | ❌ | `appointments.view_today` (read), `appointments.reschedule` (write) |
| **Transactions — List + Detail** | `src/app/pos/transactions/page.tsx`, `[id]/page.tsx` | `transactions` | ❌ | ❌ | n/a | n/a | ❌ (Item 8 in roadmap) | n/a | n/a | n/a | Refund flow (`refund/` dir) | n/a | `reports.*` views |
| **End-of-Day** | `src/app/pos/end-of-day/page.tsx` | Drawer / EOD reconciliation | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | EOD permissions |

### Matrix: Jobs card edit operations in detail

What the **Jobs card** (`src/app/pos/jobs/components/job-detail.tsx`) supports today (when `isEditable = canManageJobs && status NOT IN [completed, closed, cancelled]`, line 500):

| Edit | Supported | Endpoint | Notes |
|---|---|---|---|
| Change assigned detailer | ✅ | `PATCH /api/pos/jobs/[id]` with `assigned_staff_id` (`job-detail.tsx:479-497`) | Modal pulls list from `/api/pos/staff/available` |
| Add/remove services | ✅ | `PATCH /api/pos/jobs/[id]` with `services` array (`job-detail.tsx:588-592`) | Pulls catalog from `/api/pos/services`; bulk re-snapshot |
| Change customer | ✅ | `PATCH /api/pos/jobs/[id]` with `customer_id, vehicle_id: null` (`job-detail.tsx:528-531`) | Resets vehicle to null on customer change |
| Change vehicle | ✅ | `PATCH /api/pos/jobs/[id]` with `vehicle_id` (`job-detail.tsx:550-553`) | Pulls customer's vehicles from `/api/pos/customers/[id]/vehicles` |
| Edit intake notes | ✅ | `PATCH /api/pos/jobs/[id]` with `intake_notes` (`job-detail.tsx:599-602`) | Free-text |
| Mobile zone / surcharge / address | ✅ | `<EditMobileModal mode="admin">` → `PATCH /api/pos/appointments/[id]/mobile-service` (Phase Mobile-1.9) | Triggers payment-mismatch banner if total changes |
| Reassign timer / pause | ✅ | `POST /api/pos/jobs/[id]/timer` (`<JobTimer>`) | Timer in header |
| Send payment link | ✅ | Two-step modal → `POST /api/pos/appointments/[id]/send-payment-link` | Only when appointment-linked + unpaid + has contact (`job-detail.tsx:814-821`) |
| Change `scheduled_date` / `scheduled_start_time` | ❌ from this card | n/a | Use POS Appointments tab or Admin Appointments |
| Cancel job | ✅ (gated) | `POST /api/pos/jobs/[id]/cancel` (`job-detail.tsx:680-695`) | `canCancel` only for early statuses (`scheduled`/`intake`) for cashier; in_progress/pending_approval = admin only (`job-detail.tsx:643-651`) |
| Flag an issue | ✅ | `POST /api/pos/jobs/[id]/addons` | `in_progress` only; `pos.jobs.flag_issue` |
| Start intake | ✅ | `PATCH /api/pos/jobs/[id]` `status: 'intake'` | Status: `scheduled` only |
| Start work | ✅ | `POST /api/pos/jobs/[id]/start-work` | Status: `intake` with `intake_completed_at` set |
| Complete job | ✅ | `POST /api/pos/jobs/[id]/complete` | Status: `in_progress` |
| Checkout / Close Out | ✅ | navigates to register with pre-filled cart from `/api/pos/jobs/[id]/checkout-items` | Status: `completed`; "Close Out" label when `appointment.amount_due_cents === 0` |

---

## 6. Admin Surfaces — Same Matrix

| Surface | File | Entity shown | Add service | Remove service | Change date/time | Change detailer | Change customer | Change vehicle | Change mobile zone/addr | Cancel | Permission |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Admin — Quotes list** | `src/app/admin/quotes/page.tsx` | `quotes` (read-only — drilldown opens slide-over) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | (soft-delete) | `quotes.create` to access |
| **Admin — Quote detail / slide-over** | `src/app/admin/quotes/[id]/page.tsx`, `src/app/admin/quotes/components/quote-slide-over.tsx` | `quotes` row | ❌ read-only | ❌ | n/a | n/a | n/a | n/a | n/a | ❌ (soft-delete only) | `quotes.create` |
| **Admin — Appointments page** | `src/app/admin/appointments/page.tsx` (+ `AppointmentDetailDialog`) | `appointments` | ❌ (display only via `appointment_services` join) | ❌ | ✅ via dialog (P) | ✅ via dialog (P) | ❌ | ❌ | ✅ EditMobileModal `mode="admin"` (P) | ✅ explicit (P) | `appointments.view_today/view_calendar/reschedule/cancel/waive_fee/update_status/add_notes/manage_schedule` |
| **Admin — Appointments scheduling** | `src/app/admin/appointments/scheduling/page.tsx` | employee schedules + blocked dates | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `appointments.manage_schedule` |
| **Admin — Appointments waitlist** | `src/app/admin/appointments/waitlist/page.tsx` | waitlist entries | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `appointments.view_today` |
| **Admin — Jobs (Service Records) list** | `src/app/admin/jobs/page.tsx` | `jobs` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `pos.jobs.view` |
| **Admin — Job detail** | `src/app/admin/jobs/[id]/page.tsx` | `jobs` (read-only except photo feature-toggle) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | `pos.jobs.view` |
| **Admin — Transactions list** | `src/app/admin/transactions/page.tsx` | `transactions` | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | `reports.*` |

### What Admin Appointments offers that POS Appointments doesn't (and vice versa)

| Capability | Admin | POS |
|---|---|---|
| Calendar grid + month picker | ✅ (`AppointmentCalendar`) | ❌ (date-range list only) |
| Day / week tabs | ✅ | ❌ |
| Stats cards (today / week / pending / new bookings / booked revenue) | ✅ (`AppointmentStats`) | ❌ |
| Status + employee + search filters | ✅ (`AppointmentFilters`) | ❌ (date-only) |
| Edit `scheduled_date` + `scheduled_start_time` + `scheduled_end_time` + `employee_id` | ✅ | ✅ (Item 12) |
| Edit `status` directly (with Recommended / Override groups) | ✅ | ❌ |
| Edit `job_notes` + `internal_notes` | ✅ | ❌ |
| Cancel appointment (with reason + fee + customer notify) | ✅ (`CancelAppointmentDialog` → `POST /api/appointments/[id]/cancel`) | ❌ |
| Mobile picker (zone/addr/surcharge) | ✅ (Phase Mobile-1.9 shared modal) | ❌ |
| Auto-notify customer on date/time change | ✅ (admin endpoint fires `appointment_rescheduled` webhook) | ❌ (deliberately suppressed — POS-dedicated endpoint, audit row records `notification_suppressed: true`) |
| View walk-in appointments alongside booked | ✅ (Phase 0a-2 — channel badge) | ✅ |
| See cancelled appointments | ✅ | ❌ (server-side excluded) |

---

## 7. The Jobs Card — Focused Deep-Dive

**File:** `src/app/pos/jobs/components/job-detail.tsx` (2008 LOC).
**Backing endpoint:** `GET /api/pos/jobs/[id]` (`src/app/api/pos/jobs/[id]/route.ts`).

### 7.1 Field inventory (sections of the card, top to bottom)

1. **Header block** (`job-detail.tsx:828-892`):
   - Customer name (truncated).
   - Channel pill: "Appointment" purple if `appointment_id && appointment.channel !== 'walk_in'`; otherwise "Walk-In" amber (`job-detail.tsx:843-866`).
   - Status pill from `STATUS_CONFIG` (scheduled/intake/in_progress/completed/closed/cancelled).
   - Vehicle string (`formatVehicle(job.vehicle)`).
   - `<JobTimer>` in header when `showTimer === true`.
2. **Intake completed banner** (when `status='intake'` and `intake_completed_at` set but `work_started_at` null).
3. **Assigned Detailer** tile (tappable if `canManageJobs && status NOT IN [completed,closed,cancelled]`).
4. **Services** tile (tappable to open Edit Services modal; shows mobile fee via `composeLineItems`).
5. **Mobile Service** tile (visible only when `appointment.is_mobile`): zone + surcharge + address with pencil → `<EditMobileModal>`. Or "+Enable" affordance if non-mobile + editable.
6. **Payment mismatch banner** (`<PaymentMismatchBanner>`) — non-blocking warning after mobile edit when new total ≠ paid amount.
7. **Timing** tile (`job-detail.tsx:1124-1166`): Created, Est. Pickup, Intake Started, Intake Completed, Work Started, Work Completed.
8. **Notes** tile (tappable to edit `intake_notes`).
9. **Add-ons / Issues Flagged** section (`job-detail.tsx:1197-1272`): per-addon status pill (pending/approved/declined/expired), price, discount, pickup delay, "Re-send" button for expired/declined.
10. **Pending Addons Alert** (orange pulsing banner with count).
11. **Customer** tile (tappable to swap customer; resets vehicle to null on swap).
12. **Vehicle** tile (tappable to swap among customer's vehicles).
13. **Action button bar** (footer; varies by status — see action inventory below).

### 7.2 Action inventory (footer buttons, by status)

- `scheduled`: "Start Intake" (`PATCH … status:intake`).
- `intake` (intake not completed, photos feature enabled): "Continue Intake" → zone picker.
- `intake` (intake completed): "Start Work" (`POST /api/pos/jobs/[id]/start-work`).
- `in_progress`: row of "Photos" + "Flag Issue", then full-width "Complete Job".
- `pending_approval`: "View Photos" (read-only).
- `completed`: full-width "Checkout" (or "Close Out" if `amount_due_cents === 0`).
- `closed`: green "Paid" indicator (no action).
- `cancelled`: "This job is cancelled" text (no action).
- Cross-status, footer-bottom:
  - "Send Payment Link" (visible when appointment-linked, unpaid, customer has contact info).
  - "Cancel Job" (visible per `canCancel` derivation at `job-detail.tsx:643-651`).

### 7.3 What edit operations work, what don't

**Works:**

- Change customer (resets vehicle).
- Change vehicle.
- Add / remove services (re-snapshots `jobs.services` JSONB).
- Reassign detailer (also syncs `appointments.employee_id`).
- Edit intake notes.
- Edit mobile zone / surcharge / address (via the shared Phase 1.9 picker).
- Start intake, start work, complete job.
- Send payment link (two-step amount + channel modal).
- Cancel job (permission-gated by status).
- Flag an issue (`in_progress` only).
- Reschedule via drag-and-drop on the parent **Jobs Timeline** view, not from inside the card.

**Doesn't work from the Jobs card:**

- Change `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` — there is no time picker in the card. The user must navigate to the POS Appointments tab (new in Item 12) or the Admin Appointments page.
- Direct `status` override (e.g., setting `completed` back to `in_progress`). The card's buttons advance status forward only.
- Cancel the underlying appointment without cancelling the job.

### 7.4 Cross-surface navigation

The Jobs card has **no** link to the appointment view, the quote view, or the transaction view. It is a leaf surface:

- After checkout, the cart navigates the operator to `/pos` (register) and the job's `status` becomes `closed` (`api/pos/transactions/route.ts:633`), but there's no UI breadcrumb on the card pointing at the transaction.
- The appointment's id is implicitly used by sub-modals (mobile picker, payment link), but neither the appointment ID nor a "View appointment" link is rendered.
- The quote id is sometimes used as a duplicate-guard at job-creation time (`jobs/route.ts:277-291`), but is not surfaced.

---

## 8. The Appointments Surfaces (Admin and POS)

### 8.1 Admin Appointments page

**File:** `src/app/admin/appointments/page.tsx` (554 LOC) + components in `src/app/admin/appointments/components/` (appointment-calendar, day-appointments-list, appointment-detail-dialog, cancel-appointment-dialog, appointment-stats, appointment-filters).

**Field inventory of `<AppointmentDetailDialog>`** (`src/app/admin/appointments/components/appointment-detail-dialog.tsx`):

- Customer (name + phone + email — display only).
- Vehicle (display only).
- Total (and Deposit Collected if paid).
- Services list (display only; rendered via shared `composeLineItems`).
- Mobile Service card (zone + surcharge + address; editable via `<EditMobileModal mode="admin">` when `appointments.add_notes`).
- "Enable mobile service" affordance for non-mobile appointments.
- Payment mismatch banner (shared with POS Jobs).
- Cancellation info block (when `status='cancelled'`).
- Editable fields (gated by `canReschedule`/`canAddNotes`):
  - `status` Select (Recommended + Override optgroups).
  - `employee_id` Select.
  - `scheduled_date` / `scheduled_start_time` / `scheduled_end_time` inputs.
  - `job_notes` textarea.
  - `internal_notes` textarea.
- Footer: "Cancel Appointment" (when `showCancelButton`), "Close", "Save Changes".

**Backing API:** `PATCH /api/appointments/[id]` (`src/app/api/appointments/[id]/route.ts`), with branched permission gates by which fields the patch touches (`appointments.reschedule`, `appointments.update_status`, `appointments.add_notes`). Cancellation goes through `POST /api/appointments/[id]/cancel`.

**Admin appointments page does NOT support:** adding/removing services (services are read-only in the dialog); editing the customer or vehicle on the appointment.

### 8.2 POS Appointments tab (Roadmap Item 12, commit `2eedaae4`)

**File:** `src/app/pos/components/appointments/appointments-view.tsx` (322 LOC) + `reschedule-appointment-dialog.tsx` (207 LOC) + `types.ts`.

**Field inventory:**

- Header: "Appointments" title + Refresh button.
- Date filters: "Today", "Today + Tomorrow", "Next 7 Days" presets + custom From/To inputs (capped at 31 days server-side).
- Grouped list by date with "Today/Tomorrow/Yesterday" relative labels.
- Per-appointment row: start–end time, status pill, customer name, vehicle (cleaned), services CSV, assigned employee name.

**RescheduleAppointmentDialog fields:**

- `scheduled_date` (date input).
- `scheduled_start_time` + `scheduled_end_time` (time inputs side-by-side).
- `employee_id` (Select with "Unassigned" + all bookable staff from `/api/pos/staff/available`).
- Static amber notice: "Customer is **not** automatically notified."
- Footer: Cancel / Save Changes.

**Backing API:**

- `GET /api/pos/appointments` (`src/app/api/pos/appointments/route.ts`) — date-range, joined with customer/vehicle/employee/services, **excludes cancelled** server-side.
- `PATCH /api/pos/appointments/[id]/reschedule` (`src/app/api/pos/appointments/[id]/reschedule/route.ts`) — accepts only `scheduled_date`, `scheduled_start_time`, `scheduled_end_time`, `employee_id`. Permission: `appointments.reschedule`. **No webhook fired** (notification suppression by construction; audit row records `notification_suppressed: true`). Syncs `jobs.assigned_staff_id` when detailer changes.

### 8.3 Compare Admin Appointments vs POS Appointments

See §6 table. Key differences:

- POS lacks: status edit, notes edit, mobile picker, cancel, calendar view, stats, filters, customer auto-notify.
- POS gains: a focused 4-field reschedule with explicit no-notify amber notice, designed for iPad-fast operator use.
- Both share: date/time/detailer reschedule; the same `appointments.reschedule` permission.

---

## 9. Permissions Inventory

All permission keys defined in `supabase/migrations/20260211000007_roles_permissions_foundation.sql` (foundation) and `20260212000003_phase8_jobs_schema.sql` (jobs), with `20260212000007_consolidate_job_permissions.sql` merging `pos.jobs.create_walkin` into `pos.jobs.manage`.

### 9.1 `appointments.*`

| Key | Action gated | super_admin | admin | cashier | detailer |
|---|---|---|---|---|---|
| `appointments.view_today` | See today's schedule (incl. POS Appointments tab read) | ✓ | ✓ | ✓ | ✓ |
| `appointments.view_calendar` | Access full calendar view | ✓ | ✓ | ✓ | ✗ |
| `appointments.create` | Book new appointments | ✓ | ✓ | ✓ | ✗ |
| `appointments.reschedule` | Change date/time/detailer | ✓ | ✓ | ✓ | ✗ |
| `appointments.cancel` | Cancel existing appointments | ✓ | ✓ | ✗ | ✗ |
| `appointments.waive_fee` | Override cancellation fee | ✓ | ✓ | ✗ | ✗ |
| `appointments.update_status` | Change appointment status | ✓ | ✓ | ✓ | ✓ |
| `appointments.add_notes` | Add notes to appointments (also gates mobile-picker edits) | ✓ | ✓ | ✓ | ✓ |
| `appointments.manage_schedule` | Edit employee weekly schedules + blocked dates | ✓ | ✓ | ✗ | ✗ |

### 9.2 `pos.jobs.*`

| Key | Action gated | super_admin | admin | cashier | detailer |
|---|---|---|---|---|---|
| `pos.jobs.view` | View Jobs tab + queue + Admin Jobs list | ✓ | ✓ | ✓ | ✓ |
| `pos.jobs.manage` | Start intake, begin work, complete jobs, create walk-ins, edit job fields (after `create_walkin` was consolidated in) | ✓ | ✓ | ✗ | ✓ |
| `pos.jobs.flag_issue` | Create mid-service upsell requests | ✓ | ✓ | ✗ | ✓ |
| `pos.jobs.cancel` | Cancel jobs in early status (scheduled/intake) | (defaults — check `role-defaults.ts`) | | | |

`pos.jobs.cancel` is referenced by `<JobDetail>` (`job-detail.tsx:227`). For `in_progress`/`pending_approval` status, the card additionally restricts cancel to `ADMIN_ROLES` regardless of the permission (`job-detail.tsx:649-650`).

### 9.3 `quotes.*`

| Key | Action gated | super_admin | admin | cashier | detailer |
|---|---|---|---|---|---|
| `quotes.create` | Create new quotes | ✓ | ✓ | ✓ | ✗ |
| `quotes.send` | Send quotes via SMS/email | ✓ | ✓ | ✓ | ✗ |
| `quotes.convert` | Convert accepted quotes (POS + admin convert routes both check this) | ✓ | ✓ | ✓ | ✗ |

### 9.4 `tickets.*`

No permission keys matching `tickets.*` exist in the codebase. The word "ticket" is used colloquially in code (e.g., `<TicketPanel>`, `<HeldTicketsPanel>`, `quote-ticket-panel.tsx`) but is **not a persisted entity** — it's the in-flight cart on the POS Sale tab, or shorthand for "one customer's session." There is no `tickets` table and no permissions namespaced under `tickets`.

---

## 10. Gap Inventory — Friction Points for Operators

| # | Operator goal | Where they can do it today | Friction |
|---|---|---|---|
| 1 | Edit services on a scheduled appointment that hasn't become a job yet | **Nowhere directly.** Admin Appointments dialog shows services read-only. POS Appointments tab doesn't expose services edit. POS Jobs Edit Services modal only exists once a job row is created (i.e., after job populate fires or walk-in is created). | To edit services pre-job, operator must cancel the appointment + rebook, or wait for the job to materialize and then edit services on the job (which only mutates `jobs.services` JSONB — `appointment_services` rows are not updated). |
| 2 | Reschedule a job that hasn't started yet (status `scheduled`) | POS Appointments tab (Item 12) ✅ — edits the underlying appointment, syncs detailer back to job. POS Jobs Timeline drag-and-drop ✅ (only same-day reschedule). Admin Appointments ✅. Jobs card ❌. | Operator working from the Jobs card has to leave the card to change time. Drag-and-drop only works on today's timeline. Cross-day reschedule from the Jobs surface requires switching to POS Appointments or Admin. |
| 3 | Reschedule a job after detailer started (status `intake` or `in_progress`) | Same as #2, but timeline drag is restricted to `scheduled/intake/in_progress` (DRAGGABLE_STATUSES, `api/pos/jobs/[id]/reschedule/route.ts:6`). POS Appointments reschedule rejects `completed` (`reschedule.test.ts` cites this). | Same surface-switch friction. |
| 4 | Cancel an appointment without going to Admin | **Nowhere in POS.** POS Appointments tab has no cancel control. POS Jobs card has "Cancel Job" but that cancels the *job*, not the appointment. (Walk-ins skip the notification dialog because their appointment is synthetic.) | A cashier needs to switch to Admin (or call an admin) to formally cancel a booked appointment with fee + reason + customer notify. |
| 5 | Add a new service mid-job | "Flag Issue" wizard (`flag-issue-flow.tsx`) ✅ — already builds out SMS+email approval flow with `addon_authorization` template, photo capture, discount, pickup-delay. Status must be `in_progress`. | **Works as user described.** Operator-friendly, customer-approval-driven. Confirmed: this matches the user's description of the flow being already built. |
| 6 | Re-assign detailer after job started | POS Jobs card "Assigned Detailer" tile ✅ (any non-terminal status with `pos.jobs.manage`). POS Appointments tab ✅. Admin Appointments dialog ✅. POS timeline drag ✅. | None — multiple surfaces already support this. |
| 7 | Change the customer on a completed walk-in transaction | Item 8 in the roadmap (separate work). Today: not supported on any surface. | Already known; out of scope of this audit. |
| 8 | See all of today's tickets regardless of stage in one view | **No single view.** Operator must check: POS Quotes for outstanding quotes, POS Jobs for in-progress / scheduled, POS Appointments for upcoming-but-no-job-yet, POS Transactions for completed/refunded. | Cross-surface mental model. Highest-friction observation. |
| 9 | See a customer's full ticket history in one view | Customer portal (account) shows their transactions + appointments. Admin Customers detail page joins `transactions`, but jobs/quotes are scattered across other admin pages. | Customer-centric history requires switching across `/admin/customers/[id]`, `/admin/quotes`, `/admin/jobs`. |
| 10 | Edit `scheduled_date` / time directly from the Jobs card | Not supported (§7.3). | Must switch to POS Appointments or Admin Appointments. |
| 11 | Add services to an appointment that already has a job, and have it reflect in both `appointment_services` and `jobs.services` | Partially supported: editing services on the Jobs card mutates `jobs.services` JSONB only — `appointment_services` rows are not synced. | Admin/reporting that reads `appointment_services` will diverge from what the operator sees in POS for that job. (Today no UI mutates `appointment_services` post-conversion, so this is theoretical until someone adds such a control.) |
| 12 | Cancel the appointment when a job is already in flight (and refund accordingly) | Admin only. POS Jobs "Cancel Job" cascades to the appointment indirectly only via the cancel-job endpoint's audit + notify side effects; the appointment's `status` is set by the same endpoint per its internal logic. | Cross-surface escalation needed in some flows. |

---

## 11. Architectural Observations

### 11.1 Are Jobs and Appointments truly separate concerns or two views of the same thing?

They are **conceptually separate concerns** that share a 1:1 link in the common case (and 0:1 in the edge cases: future appointments without a job yet, legacy pre-Phase 0a walk-in jobs without an appointment). The separation is intentional:

- **Appointments** answers "what is the customer expecting to happen and when?" — date, time, detailer assignment, money owed, payment method, mobile context.
- **Jobs** answers "what is the detailer actually doing right now?" — intake checklist, timer, in-progress notes, photo documentation, mid-service issues, completion timestamps.

The fields overlap in two places only:
- `customer_id` / `vehicle_id` / `employee_id` (FKs, same data).
- `services`: `appointment_services` rows (the booking) vs `jobs.services` JSONB (the snapshot the detailer works against).

The split is **operationally meaningful**, but the codebase already treats them as one ticket in several places:

- The Jobs card joins the appointment (`job-detail.tsx` SELECT pulls `appointment:appointments!jobs_appointment_id_fkey(scheduled_start_time, channel)` etc.) and renders mobile fields, payment-link, amount-due all from the joined appointment.
- The POS Jobs queue filters by appointment date (`api/pos/jobs/route.ts:50-94`) for booked jobs, and falls back to job `created_at` date for legacy walk-ins.
- Phase 0a's eager appointment-creation for walk-ins means **every job has an appointment in normal operation**, which means the data model already says "one ticket = one appointment + one job."

So in practice, *for an operator's day*, the merge is already implicit. What's split is the **UI**: two tabs, two URLs, two mental models.

### 11.2 Implications of merging into one Tickets view (Roadmap Item 15)

**What would need to change:**

- A single "Tickets" surface would need to discriminate cleanly between stages: pre-job (booking-only), pre-checkout (job-active), and post-checkout (closed). The current Jobs queue already does this for its own scope; extending it to encompass booked-but-not-yet-job appointments is the bulk of the work.
- The state machine view: today the entry to the chain is a Quote OR a direct booking OR a walk-in; the merged view needs to show all three entry types as "ticket types" without re-tabling the underlying schema.
- Permissions: many `appointments.*` keys would need to map to "view this ticket in this stage" semantics. `appointments.view_calendar` vs `pos.jobs.view` are differently distributed today (calendar denied to detailers; jobs granted). A merged view would either pick the union (broaden detailer visibility) or split visibility per stage (effectively re-creating the tab split).
- Cancel semantics: cancelling a "ticket" pre-job means cancelling the appointment (with fee/notify); cancelling a ticket post-job-creation means cancelling the job (which may already involve refunds). The same UI button would need to choose the right action based on stage.

**What would NOT need to change** if instead the team kept Jobs and Appointments separate but filled the cross-surface gaps:

- The DB schema. The 1:1 link via `jobs.appointment_id` (UNIQUE) already supports either model.
- The Flag-an-Issue flow (works as-is, lives on the job).
- The Quote → Appointment / Quote → Job conversion paths.
- The checkout / payment-link / mobile-picker flows.

**Concrete minimal-surface-friction interventions** that would close most of the §10 gaps without merging:

1. Add an "Edit Services" control to the Admin Appointment dialog (mutates `appointment_services` + cascades to `jobs.services` if a job already exists). Closes #1 and #11.
2. Add a "Cancel Appointment" control to the POS Appointments tab (calls existing `/api/appointments/[id]/cancel` with appropriate guards). Closes #4.
3. Add a "Change time" affordance to the Jobs card that opens the same reschedule dialog the POS Appointments tab uses. Closes #10 (and reduces #2/#3 surface-switch friction).
4. A "Today's tickets" combined view (could be a tab on Jobs or a new top-level surface) listing appointments AND jobs for today with stage discriminator. Closes #8 — and is a low-risk prototype for what a full merge would feel like.

### 11.3 Other observations worth noting

- **The 1:1 UNIQUE constraint on `jobs.appointment_id`** is a strong design statement that the codebase expects one ticket = one (synthetic or booked) appointment + at most one job. Any merged view would inherit this assumption.
- **`jobs.services` denormalization** (JSONB snapshot copied from `appointment_services` at populate time) is a deliberate operational choice — POS reads work without joins, and add-ons (`job_addons`) live on the job, not the appointment, so the operator's "what is on this ticket right now" answer is in `jobs.services + approved job_addons`. Changing this would have ripple effects across receipts, refund plans, and the AI auto-responder.
- **Phase 0a eager-appointment for walk-ins** already eliminated `jobs.appointment_id IS NULL` as a normal-operation case. Going forward, the merged view can treat `appointment` as always-present and skip the legacy branch entirely.
- **The "ticket" word is overloaded in code**: in POS Register it means the in-flight cart; in colloquial use here it means the per-customer transactional unit. A merged view should pick one definition (likely the latter) and rename the in-flight cart surface if needed.

---

*End of audit. No code changes, no migrations, no schema edits performed.*
