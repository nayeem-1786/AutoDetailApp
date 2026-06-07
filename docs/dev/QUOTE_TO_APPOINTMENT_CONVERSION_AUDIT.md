# Quote → Appointment Conversion Architecture — Phase 0.2 Audit

> Read-only Component Behavior audit (Memory #29 type 3), 2026-06-05.
> Branch: `audit/phase-0-2-quote-to-appointment-conversion`.
>
> Phase 0.2 of the locked QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE plan
> (v1.0, locked 2026-06-04). Feeds AC-10 (unified ticket number) and
> unblocks Phase 3 sessions on Quote → Appointment formalization.
>
> Sibling to Phase 0.1 (SMS/Phone agent booking) and Phase 0.3
> (populate dependencies); ran in parallel. The materialization
> audit (2293fb3d) sits directly downstream — its Stage 2
> (`appointments`) is what this audit's conversion paths produce.
>
> **No source / migration / test changes. No fix recommendations.
> No operator-decision pre-resolution.** The audit's deliverable IS
> the current-state model of the Quote → Appointment seam.

---

## Executive summary

Quote → Appointment conversion exists in **six wired paths** but routes through **two architecturally distinct seams** — the canonical `convertQuote()` service at `src/lib/quotes/convert-service.ts:31-243` (used by POS operator-initiated, voice-agent, and a dormant admin endpoint) and the walk-in atomic-create path at `src/app/api/pos/jobs/route.ts:147-536` (used by the "Create Job" POS operator paths, which bypass `convertQuote` entirely and produce a synthetic walk-in appointment). The two seams differ on **8 entity-write dimensions** including channel (`phone` vs `walk_in`), appointment status (`confirmed` vs `in_progress`), scheduled date (operator-picked vs `now`), webhook fired (`appointment_confirmed` vs none), payment_type (NULL vs `pay_on_site`), and — critically — the **`quotes.converted_appointment_id` FK is only populated by the `convertQuote` seam**, leaving the walk-in seam with a one-directional link (`jobs.quote_id` → `quotes.id` only). Customer-facing "Accept Quote" via the SMS/email link does **NOT** create an appointment; it sets `quotes.status='accepted'` and routes staff to perform the conversion manually in POS. Conversion-time data carry-forward via `convertQuote` covers customer/vehicle, totals, mobile snapshot, all three modifier types (coupon/loyalty/manual), and per-line tier + quantity; it intentionally drops `valid_until`, `internal_notes`, products-only line items, and `quote_communications`/`quote_activities` history. The walk-in seam covers a subset and synthesizes the rest from the request body. Quote `quote_number` format is **Q-NNNN** (variable digits, `TEXT UNIQUE`); appointments currently have no `*_number` column — AC-10's appointment-spine identifier is greenfield.

---

## Target A — All Quote → Appointment conversion paths

Six wired paths. Two architectural seams. The path table below distinguishes triggers from seams.

### A.1 — POS operator "Convert to Appointment" button (canonical seam)

- **Trigger:** Operator presses **Convert to Appointment** on POS > Quotes > quote-detail. Renders for quote.status ∈ {`draft`, `sent`, `viewed`, `accepted`} when operator has `quotes.convert` permission (`src/app/pos/components/quotes/quote-detail.tsx:378-383`, `:425-430`, `:458-463`).
- **UI flow:** Click → opens `<QuoteBookDialog>` (`src/components/quotes/quote-book-dialog.tsx:32-251`) → operator picks date (defaults to today PST), time (defaults to now rounded to next 15-min slot, `:53-61`), duration (default `defaultDuration || 60`, derived from `quote.items` durations at `src/app/pos/components/quotes/quote-detail.tsx:283-315`), and optional employee assignment (defaults to auto-assign via `findAvailableDetailer`).
- **Endpoint:** `POST /api/pos/quotes/[id]/convert` (`src/app/api/pos/quotes/[id]/convert/route.ts:9-63`).
- **Auth:** POS HMAC (`authenticatePosRequest`) + permission check `quotes.convert` (`:14-23`).
- **Validation:** `convertSchema` at `src/lib/utils/validation.ts:722-727` — `date` (YYYY-MM-DD regex), `time` (HH:MM regex), `duration_minutes` (int ≥ 1), optional `employee_id` (UUID).
- **Seam:** `convertQuote()` at `src/lib/quotes/convert-service.ts:31-243` with default options (`appointmentStatus='confirmed'`, `channel='phone'`).
- **Audit log:** Yes — `logAudit({action: 'update', entityType: 'quote', details: {converted_to: 'job'}})` (`src/app/api/pos/quotes/[id]/convert/route.ts:45-56`). NB the label is `Quote #{id8} converted` and the `details.converted_to: 'job'` is a misnomer — this path creates an Appointment, not a Job.
- **Auto-notify:** After success, the dialog fires-and-forgets `POST /api/pos/appointments/{id}/notify` with `{method: 'both'}` when the quote's customer has email or phone (`src/components/quotes/quote-book-dialog.tsx:124-135`).

### A.2 — Customer "Accept Quote" via SMS/email link (NOT a conversion path)

- **Trigger:** Customer on `/(public)/quote/[token]` page (`src/app/(public)/quote/[token]/page.tsx`) clicks **Accept Quote** button (`accept-button.tsx:84-95`).
- **UI flow:** Click → in-component confirm step (`accept-button.tsx:52-82`) → click "Yes, Accept" → POST.
- **Endpoint:** `POST /api/quotes/[id]/accept` (`src/app/api/quotes/[id]/accept/route.ts:14-226`).
- **Auth:** Public — gated by `access_token` body field that must equal `quotes.access_token` (`:47-50`).
- **Pre-state gate:** Only `quote.status ∈ {sent, viewed}` accepted; otherwise 400 (`:53-58`).
- **Writes:**
  1. `quotes.status='accepted'` + `accepted_at = NOW()` + `updated_at = NOW()` (`:61-70`).
  2. Webhook `quote_accepted` fired (`:78`).
  3. Customer SMS ack via `quote_accepted_single` template (single-item quote) or `quote_accepted_multi` template (multi-item) — both seeded with a hard-coded fallback if template inactive (`:91-117`). Logged to `quote_communications` and `sms_delivery_log`.
  4. Staff SMS via `quote_accepted_staff_notify` template + staff email — message routes to `biz.phone` fallback if template's `recipientPhones` empty (`:173`). The staff email body literally states *"Next step: Convert this quote to an appointment in POS."* (`:196, :210`).
- **Architectural fact:** **NO `appointments` row is created on accept.** The flow is intent-signaling only — customer's confirmation surface displays *"Quote Accepted! Thank you! We will contact you shortly to schedule your appointment."* (`accept-button.tsx:42-49`). Conversion is **staff-deferred** to POS path A.1 or A.3.
- **Idempotency:** Stale-page double-click → second POST fails the status gate at `:53-58` (status is now `accepted`, not `sent`/`viewed`) → 400 `Cannot accept a quote with status "accepted"`. Client UI shows error in confirming step.

### A.3 — POS operator "Create Job" button (walk-in atomic-create seam from quote-detail)

- **Trigger:** Operator presses **Create Job** on POS > Quotes > quote-detail. Renders for quote.status ∈ {`draft`, `sent`, `viewed`, `accepted`} when operator has `pos.jobs.manage` permission AND `quote.customer` is set (`src/app/pos/components/quotes/quote-detail.tsx:384-398`, `:431-445`, `:464-478`).
- **UI flow:** Click → `handleCreateJobFromQuote` at `quote-detail.tsx:219-280`. No dialog — direct dispatch.
- **Two sequential network calls:**
  1. `POST /api/pos/jobs` with `{customer_id, vehicle_id, services, quote_id, notes}` (`:243-253`). Walk-in atomic create.
  2. `PATCH /api/pos/quotes/{quote.id}` with `{status: 'converted'}` (`:261-265`) — fire-and-not-awaited-on-failure (errors caught only by the try/catch block).
- **Seam:** `POST /api/pos/jobs/route.ts:147-536` — the same atomic appointment+job create used for pure walk-ins. **`convertQuote` is NOT called.**
- **Idempotency:** Endpoint guards at `route.ts:297-310` — if any `jobs.quote_id = X` exists, 409 *"A job has already been created from this quote"*.
- **Architectural divergence (key finding):**
  - `quotes.converted_appointment_id` is **NEVER populated** on this path (`POST /api/pos/jobs` doesn't write the quote table; `PATCH /api/pos/quotes/{id}` only sets `status`).
  - `jobs.quote_id` IS populated (`:481`) → backward link only.
  - No `appointment_confirmed` webhook fires on this path (the `convertQuote` path's `:240` is not reached).
  - The quote-detail UI is aware: when `quote.status === 'converted' && !quote.converted_appointment_id`, it renders the badge *"Converted to job"* (vs *"Converted to appointment"*) at `quote-detail.tsx:493`. So the codebase already distinguishes the two outcomes downstream.

### A.4 — POS operator "Create Job" from quote-builder walk-in mode

- **Trigger:** Operator presses **New Walk-in** on POS > Jobs (`src/app/pos/jobs/page.tsx:324`, `src/app/pos/jobs/components/job-queue.tsx:782-786`). Routes to `/pos/quotes?mode=builder&walkIn=true`, opening `<QuoteBuilder walkInMode />` with `<QuoteTicketPanel walkInMode />`.
- **UI flow:** In walk-in mode the ticket-panel hides the "Save Draft" / "Send Quote" pair (`quote-ticket-panel.tsx:1126-1144`) and shows a single **Create Job** button (`:1116-1125`) that invokes `handleCreateJob` at `:725-880`.
- **Endpoint sequence:**
  1. If quote was already auto-saved (has `quoteId`): `PATCH /api/pos/quotes/{savedQuoteId}` setting `status: 'converted'` + full items/mobile/modifiers payload (`:762-782`).
  2. If no `quoteId` yet: `POST /api/pos/quotes` creating the quote at `status='converted'` immediately (`:784-806`).
  3. Then: `POST /api/pos/jobs` with `{customer_id, vehicle_id, services, quote_id: savedQuoteId, notes, ...mobilePayload, ...modifiersPayload}` (`:829-841`).
- **Seam:** Same as A.3 — `POST /api/pos/jobs/route.ts:147-536` atomic walk-in create.
- **Distinction from A.3:** A.3 starts from an EXISTING quote in any of the four pre-conversion statuses; A.4 creates the quote and the job together. Both share the same backend seam and the same `quotes.converted_appointment_id = NULL` outcome.
- **Modifier-snapshot forwarding:** A.4 forwards the modifier payload (coupon/loyalty/manual) into the synthetic appointment via `route.ts:185-196, :365-413` (Item 15g Layer 15g-ii). A.3 does NOT forward modifiers — its body shape at `quote-detail.tsx:243-253` omits them — leaving any modifier on the quote outside the appointment row on the A.3 path (but still discoverable via `jobs.quote_id → quotes` join).

### A.5 — Voice-agent appointment creation with quote_id

- **Trigger:** ElevenLabs voice agent passes `quote_id` (or `quote_number` like `"Q-0023"`) to its appointment-creation endpoint after the customer agrees to book during the call.
- **Endpoint:** `POST /api/voice-agent/appointments` (`src/app/api/voice-agent/appointments/route.ts:200-310+`).
- **Auth:** ElevenLabs webhook signature.
- **Quote-number resolution:** When `quote_id` matches `^Q-\d+$/i`, the route SELECTs `quotes.id WHERE quote_number = UPPER(input)` (`:219-236`); 404 if not found.
- **Seam:** `convertQuote()` at `src/lib/quotes/convert-service.ts:31-243` with explicit options `{appointmentStatus: 'pending', channel: 'phone'}` (`:284-292`).
- **Duration:** Sum of `services.base_duration_minutes` for the quote's service items, fallback 60 (`:255-278`).
- **Date/time:** From request body (`date`, `normalizedTime`) — operator-equivalent.
- **Distinction from A.1:** Same seam, different status. Voice-agent appointments default to **pending** (`status='pending'`) per AC-11 intent — payment is not collected in the voice flow — while POS A.1 defaults to **confirmed**.
- **Webhook coordination quirk:** `convertQuote` unconditionally fires `appointment_confirmed` at `convert-service.ts:240`, even when `options.appointmentStatus === 'pending'`. The webhook name is fixed; the status carried in the payload reflects the actual pending state. Downstream n8n flows reading the event name may not distinguish.

### A.6 — Admin `/api/quotes/[id]/convert` endpoint (dormant)

- **Endpoint:** `POST /api/quotes/[id]/convert` (`src/app/api/quotes/[id]/convert/route.ts:8-47`).
- **Auth:** Admin session via `getEmployeeFromSession` + `requirePermission('quotes.convert')` (`:13-19`).
- **Seam:** `convertQuote()` with default options (`appointmentStatus='confirmed'`, `channel='phone'`) — same as A.1.
- **Status in source:** Functionally implemented and wired to call `convertQuote`. The shared `<QuoteBookDialog>` is parameterized to accept `apiBasePath="/api/quotes"` (`src/components/quotes/quote-book-dialog.tsx:21`). **But no caller in the source tree passes `apiBasePath="/api/quotes"`** — the only usage is `apiBasePath="/api/pos/quotes"` at `src/app/pos/components/quotes/quote-detail.tsx:781`. Admin Quotes UI (`src/app/admin/quotes/[id]/page.tsx`) and the slide-over (`quote-slide-over.tsx`) contain no convert wiring per the grep at the audit's call-site sweep.
- **Implication:** The admin endpoint is currently a no-op surface. CLAUDE.md's "Quotes are READ-ONLY in admin" rule is consistent with this — convert is a write action. Whether the endpoint should be deleted, kept dormant for future re-enablement, or wired in remains an open question (surfaced as F-Admin in Target F).

### Path summary table

| Path | Trigger | Endpoint | Seam | Quote status after | Appt status | Appt channel | Appt scheduled_date | `converted_appointment_id` populated? | `jobs.quote_id` populated? | Webhook |
|---|---|---|---|---|---|---|---|---|---|---|
| A.1 | POS operator click | `POST /api/pos/quotes/[id]/convert` | `convertQuote` | `converted` | `confirmed` | `phone` | operator-picked | ✅ yes | n/a (no job) | `appointment_confirmed` |
| A.2 | Customer accepts via link | `POST /api/quotes/[id]/accept` | accept-only | `accepted` | (no appt) | — | — | — | — | `quote_accepted` |
| A.3 | POS "Create Job" from existing quote | `POST /api/pos/jobs` + side PATCH | walk-in atomic | `converted` | `in_progress` | `walk_in` | today PST, now+0min | ❌ no | ✅ yes | none |
| A.4 | POS "New Walk-in" + ticket-panel | `POST /api/pos/jobs` after quote save | walk-in atomic | `converted` | `in_progress` | `walk_in` | today PST, now+0min | ❌ no | ✅ yes | none |
| A.5 | Voice-agent | `POST /api/voice-agent/appointments` | `convertQuote` | `converted` | `pending` | `phone` | agent-supplied | ✅ yes | n/a (no job) | `appointment_confirmed` (fires despite pending) |
| A.6 | Admin (dormant) | `POST /api/quotes/[id]/convert` | `convertQuote` | `converted` | `confirmed` | `phone` | (no caller) | (would be ✅) | n/a | `appointment_confirmed` |

---

## Target B — Data carry-forward

### B.1 — Field-by-field mapping (canonical `convertQuote` seam, paths A.1 / A.5 / A.6)

Source: `src/lib/quotes/convert-service.ts:128-158`. Quote SELECT at `:40-50` (`SELECT *, items:quote_items(*)`).

| Quote field | Appointment field | Carried? | Notes |
|---|---|---|---|
| `customer_id` | `customer_id` | ✅ | `:131` |
| `vehicle_id` | `vehicle_id` | ✅ | `:132` |
| (n/a — not from quote) | `employee_id` | computed | From `data.employee_id` input or `findAvailableDetailer` auto-assign (`:67-71`) |
| (n/a — caller option) | `status` | constant | `options?.appointmentStatus ?? 'confirmed'` (`:134`) |
| (n/a — caller option) | `channel` | constant | `options?.channel ?? 'phone'` (`:135`) |
| (n/a — caller input) | `scheduled_date` | input | `data.date` (`:136`) |
| (n/a — caller input) | `scheduled_start_time` | input | `data.time` (`:137`) |
| (n/a — derived) | `scheduled_end_time` | derived | `addMinutesToTime(time, duration_minutes)` (`:64, :138`) |
| `is_mobile` | `is_mobile` | ✅ | `:91, :139` |
| `mobile_zone_id` | `mobile_zone_id` | ✅ (null-gated) | Null when `is_mobile=false` (`:140`) |
| `mobile_address` | `mobile_address` | ✅ (null-gated) | Null when `is_mobile=false` (`:141`) |
| `mobile_surcharge` | `mobile_surcharge` | ✅ (zero-gated) | 0 when `is_mobile=false` (`:142`) |
| `mobile_zone_name_snapshot` | `mobile_zone_name_snapshot` | ✅ (null-gated) | Null when `is_mobile=false` (`:143`) |
| (n/a — constant) | `payment_status` | constant | `'pending'` (`:144`) — quote-conversion does not carry deposit state |
| `subtotal` | `subtotal` | ✅ | `:145` |
| `tax_amount` | `tax_amount` | ✅ | `:146` |
| (computed from 3 modifier sources) | `discount_amount` | derived | `couponDiscount + loyaltyDiscount + (manualDiscountValue ?? 0)` (`:117, :147`) |
| `total_amount` | `total_amount` | ✅ (clamped) | `Math.max(0, Number(quote.total_amount ?? 0))` (`:126, :148`). Layer 15g-v note (`:118-125`): writers now persist quotes.total_amount NET of modifiers; the legacy double-subtract was removed. |
| `notes` | `job_notes` | ✅ (renamed) | `:149` — quote `notes` (free-text intake) → appt `job_notes` |
| `coupon_code` | `coupon_code` | ✅ | `:150` |
| `coupon_discount` (or runtime `quote.coupon.discount`) | `coupon_discount` | ✅ (null when 0) | `:99-101, :151` — prefers DB column, falls back to runtime coupon shape |
| `loyalty_points_to_redeem` | `loyalty_points_redeemed` | ✅ (renamed) | `:104, :152` |
| `loyalty_discount` | `loyalty_discount` | ✅ | `:105, :153` |
| `manual_discount_type` + `manual_discount_value` | `manual_discount_value` | ✅ (resolved) | Resolved to dollar amount via `resolveManualDiscountAmount(type, value, subtotal)` (`:110-114, :154`); the `dollar`/`percent` discriminator is collapsed at conversion time — only the dollar amount survives |
| `manual_discount_label` | `manual_discount_label` | ✅ (null-gated) | Null when `manual_discount_value === null` (`:155`) |
| `valid_until` | — | ❌ | Quote-specific; not carried |
| `accepted_at` | — | ❌ | Quote-stage timestamp |
| `viewed_at` | — | ❌ | Quote-stage timestamp |
| `sent_at` | — | ❌ | Quote-stage timestamp |
| `access_token` | — | ❌ | Quote-stage public-link token |
| `follow_up_status` | — | ❌ | Quote-stage marketing flag |
| `last_activity_at` | — | ❌ | Quote-stage |
| `created_by` (employee FK) | — | ❌ | Quote authorship; appointment captures its own audit log entry via the route caller |
| `source` (`pos`/`admin`/`sms_agent`/etc.) | — | ❌ | Appointment `channel` is set by caller option, not derived from quote `source` |
| `internal_notes` | — | ❌ | Quote has its own `internal_notes` (`DB_SCHEMA.md:2089` shows `notes` only — internal_notes is not on quotes; staff-side notes live in `quote_activities`); appointment's `internal_notes` left NULL by `convertQuote` |
| (n/a) | `payment_type` | — | NOT set by convertQuote → DB default (NULL). Appointment payment_type CHECK (`DB_SCHEMA.md:197`) is conditional and NULL is allowed |
| (n/a) | `deposit_amount` | — | NOT set → NULL |
| (n/a) | `stripe_payment_intent_id` | — | NOT set → NULL. Quote conversion is post-quote-acceptance; no payment intent attached at this seam |
| (n/a) | `cancellation_fee` / `cancellation_reason` | — | Lifecycle-state columns; NULL on creation |
| (n/a) | `reminder_sent_at` / `payment_link_*` | — | Lifecycle/feature columns; NULL on creation |

### B.2 — Service-level carry-forward (`convertQuote` seam)

Source: `src/lib/quotes/convert-service.ts:165-191`.

`quote_items` rows with `service_id IS NOT NULL` → `appointment_services` rows (1:1 by row).

| `quote_items` column | `appointment_services` column | Carried? |
|---|---|---|
| `service_id` | `service_id` | ✅ |
| `unit_price` | `price_at_booking` | ✅ (renamed, no recalculation) |
| `tier_name` | `tier_name` | ✅ |
| `quantity` | `quantity` | ✅ (default 1 if undefined, `:181`) |
| `item_name` | — | ❌ (denormalized snapshot column on quotes; not on appt_services) |
| `product_id` | — | ❌ (product line items dropped — see B.3) |
| `notes` | — | ❌ (line-item notes dropped at conversion) |
| `standard_price` | — | ❌ (display-only, regenerated by render-time logic) |
| `pricing_type` | — | ❌ (display-only) |
| `total_price` | — | ❌ (recomputed downstream from price × quantity) |

**Snapshot semantics:** Conversion is a **snapshot**, not a live recompute. `price_at_booking` carries the unit price as it stood at quote time, regardless of any subsequent `service_pricing` row update. The canonical `resolveServicePrice` engine (CLAUDE.md Rule 22) is **NOT** re-invoked at conversion time. This matches the audit's hypothesis from the prior materialization audit (2293fb3d Target A.1 — `appointments.subtotal`/`appointment_services.price_at_booking` as booking-time totals snapshot).

**Service-summary side-effect:** Conversion enriches the service rows with tier metadata via `enrichItemsWithTierMeta` (`:219-237`) and composes `serviceNames` via `formatServicesSummary` for the caller's downstream SMS/email use (issue 39 multi-tier rendering). This computed string is returned in the success result but NOT persisted on either entity.

### B.3 — Data NOT carried (canonical seam)

| Source | Reason |
|---|---|
| `quote_items` with `product_id IS NOT NULL, service_id IS NULL` | The `serviceItems` filter at `:166-168` excludes them. Products on a quote are dropped silently from the appointment. NB the POS quote-detail's "Create Job" flow (A.3) treats products differently — it toasts *"Products will be added at checkout"* (`quote-detail.tsx:270`), surfacing the implicit bridge via `jobs.quote_id`. The convertQuote seam has no such surfacing. |
| `quote_communications` (full history table) | Quote-stage comms ledger; not joined into appointment. |
| `quote_activities` (activity log) | Quote-stage activity ledger; not joined. |
| `quotes.valid_until` | Quote-specific; appointment has no equivalent expiry. |
| `quotes.access_token` | Public quote link token. |
| `quotes.follow_up_status` / `last_activity_at` | Quote-stage marketing/CRM flags. |
| `quotes.deleted_at` | The convertQuote SELECT already filters `.is('deleted_at', null)` (`:49`) so a soft-deleted quote 404s before conversion logic runs. |

### B.4 — Walk-in seam carry-forward (paths A.3 / A.4)

The walk-in atomic-create path (`POST /api/pos/jobs`) does NOT read from the quote at all. The client builds the request body from the local quote state. This is a structural difference: A.1 / A.5 / A.6 derive from the persisted quote row; A.3 / A.4 derive from the client-side reducer state (which should match the persisted row after auto-save, but the source of truth differs).

Walk-in appointment INSERT shape (`src/app/api/pos/jobs/route.ts:383-414`):

| Field | Source on walk-in path | Notes vs canonical |
|---|---|---|
| `customer_id` | request body | same |
| `vehicle_id` | request body | same |
| `employee_id` | request body or auto-assign | same |
| `status` | constant `'in_progress'` | **differs** — canonical is `'confirmed'` (or caller-overridden `'pending'`) |
| `channel` | constant `'walk_in'` | **differs** — canonical is `'phone'` (or caller-overridden) |
| `scheduled_date` | computed `pstDate` (today) | **differs** — canonical uses caller-supplied `date` |
| `scheduled_start_time` | computed `apptStartTime` (now, minute-precision) | **differs** — canonical uses caller-supplied `time` |
| `scheduled_end_time` | computed (start + 60min) | **differs** — canonical uses `addMinutesToTime(time, duration_minutes)` |
| `is_mobile` / `mobile_*` | request body, server re-validates zone surcharge if `mobile_zone_id` (`:252-273`) | canonical trusts `quote.mobile_*` as snapshot; walk-in re-fetches zone for surcharge validation |
| `payment_status` | constant `'pending'` | same |
| `subtotal` | computed `servicesTotal + mobileSurcharge` | canonical uses `quote.subtotal` directly (may include tax-exclusive subtotal already) |
| `tax_amount` | constant `0` | **differs** — canonical carries `quote.tax_amount` |
| `discount_amount` | computed from request modifier fields | canonical uses same formula but from quote columns |
| `total_amount` | `Math.max(0, subtotal − discount)` | canonical uses `Math.max(0, quote.total_amount)` (already net of modifiers) |
| `payment_type` | constant `'pay_on_site'` | **differs** — canonical leaves NULL |
| `deposit_amount` | constant `null` | same |
| `job_notes` | request body `notes` | same |
| `internal_notes` | constant `null` | same |
| `coupon_code` / `coupon_discount` / `loyalty_*` / `manual_*` | request body modifier payload | A.4 forwards them; **A.3's request body OMITS them** (see `quote-detail.tsx:243-253` shape), so A.3 silently drops any modifier on the quote |

In addition, the walk-in seam writes:

- `appointment_services` rows via `:436-453` using the request `services` array (NOT joined to `quote_items`). On A.3 the client maps from `quote.items` filtered by `service_id` (`quote-detail.tsx:225-240`), shape `{id, name, price, quantity, tier_name}`. A.4 uses the same filter (`quote-ticket-panel.tsx:733-815`).
- `jobs` row at `route.ts:470-490` with `quote_id` populated, `services` JSONB snapshot containing the same service array plus an optional `is_mobile_fee` synthetic row when `is_mobile && mobileSurcharge > 0` (`:458-467`).

---

## Target C — Status logic on conversion

### C.1 — Quote status updates

**Canonical seam (A.1 / A.5 / A.6):**

- `convert-service.ts:194-205` issues `UPDATE quotes SET status='converted', converted_appointment_id=appointment.id, updated_at=NOW() WHERE id=quoteId`.
- `quotes.converted_appointment_id` IS populated with the new appointment's PK (`DB_SCHEMA.md:2094`: `FK → appointments(id) ON DELETE SET NULL`).
- The UPDATE comes **after** the appointment INSERT succeeds, and any error is `console.error`'d but does NOT roll back the appointment (`:203-205`). Result: an appointment row could exist with a quote that did NOT flip to `converted` if the UPDATE fails. This is a known non-atomic seam.

**Walk-in seam (A.3 / A.4):**

- Server endpoint `/api/pos/jobs` does NOT touch `quotes.status` or `quotes.converted_appointment_id`. The client sequences a separate `PATCH /api/pos/quotes/{id}` to set `status='converted'` (A.3: `quote-detail.tsx:261-265`; A.4: handled in the save step before the job POST, `quote-ticket-panel.tsx:762-806`).
- `quotes.converted_appointment_id` stays NULL on these paths. The UI distinguishes via the badge text branch at `quote-detail.tsx:493` (`'Converted to appointment'` vs `'Converted to job'`).

**Customer-accept path (A.2):**

- `accept/route.ts:61-70` sets `status='accepted'` + `accepted_at`. **NOT** `converted`. The customer's intent is captured; the quote does not enter the terminal-for-quote `converted` state until a staff path (A.1/A.3/A.4/A.5) fires.

**Pre-conditions:**

- `convertQuote` guards: `quote.status === 'expired' || === 'converted'` → 400 *"Expired or already-converted quotes cannot be converted to appointments"* (`convert-service.ts:56-62`). Allowed source statuses are `draft | sent | viewed | accepted`.
- Walk-in seam guards via idempotency: existing `jobs.quote_id = X` → 409 (`route.ts:297-310`). Status is NOT directly inspected.
- Accept guards: `quote.status === 'sent' || === 'viewed'` (`accept/route.ts:53-58`).

### C.2 — Appointment status assignment

**Path-by-path:**

- **A.1 (POS operator):** `'confirmed'` (default in `convertQuote`). Per AC-11 this is INCONSISTENT with the payment-driven rule because the POS operator may convert without a payment commitment having occurred. The operator is implicitly **committing** the date/time on the customer's behalf — the codebase accepts this as `confirmed` without a payment gate.
- **A.5 (voice-agent):** `'pending'` (explicit option). Aligns with AC-11 — voice-agent does not collect payment.
- **A.3 / A.4 (walk-in):** `'in_progress'`. Skips both `pending` and `confirmed` because the customer is on-site and the operator is starting work immediately. Same code path as a pure walk-in.
- **A.6 (admin dormant):** would be `'confirmed'` if invoked.

**AC-11 cross-reference:** The locked AC-11 says `confirmed` requires "payment or deposit received" — the canonical seam's `confirmed` default at A.1 does NOT enforce a payment check. Whether this is a deviation from the locked semantic or an operator-trust-boundary intentional exception (the POS operator can be presumed to have collected payment by side channel) is an open question (Target F.1 below).

### C.3 — Quote → Walk-in path specifically

The walk-in-from-quote path (A.3 / A.4) routes through the **same** `POST /api/pos/jobs` endpoint as a pure walk-in (no quote). The endpoint distinguishes via the presence of the `quote_id` request field, which only affects:

1. The idempotency check at `:297-310`.
2. The `jobs.quote_id` FK population at `:481`.
3. The modifier-payload forwarding from the quote (A.4 path only — A.3 omits modifiers from its request body).

The appointment shape produced is identical to a pure walk-in (status='in_progress', channel='walk_in', scheduled_date=today, payment_type='pay_on_site'). The atomic-create + service-row-insert + rollback handling (`:436-453`, `:492-498`) is shared. The synthetic-appointment introduction (Phase 0a comment block at `:341-353`) does not differentiate quote-bridged from pure walk-ins.

**Confirmed:** Walk-in-from-quote is **NOT** a separate code path. It's the pure walk-in endpoint with `quote_id` set. The appointment lineage is indistinguishable from a pure walk-in at the appointment-row level; the linkage exists only at the job row via `jobs.quote_id`.

---

## Target D — Customer-facing quote acceptance flow

### D.1 — The customer experience

1. Customer receives quote link via SMS or email (sent during quote creation or via the resend flow — outside this audit's scope).
2. Customer opens `https://{app}/quote/{access_token}` → renders `src/app/(public)/quote/[token]/page.tsx:148-432`.
3. First-view auto-mark: if `status === 'sent'` and `viewed_at IS NULL`, the page does an in-line UPDATE on render setting `status='viewed'` + `viewed_at=NOW()` (`page.tsx:62-75`).
4. Customer reads totals, services breakdown, business contact info.
5. Customer presses **Accept Quote** if visible (gated by `canAccept = status ∈ {sent, viewed}` at `:156, :426`).
6. Button opens an in-component confirm prompt: *"Confirm acceptance of this {totalAmount} estimate? We'll reach out to schedule your appointment."* (`accept-button.tsx:52-82`).
7. Customer presses **Yes, Accept** → POST.
8. On success, the page renders: *"Quote Accepted! Thank you! We will contact you shortly to schedule your appointment."* (`accept-button.tsx:42-49`).

**Payment collection:** None. The customer-facing quote page contains NO payment UI — no Stripe element, no deposit prompt, no card field. Acceptance is a **commitment-of-intent**, not a payment.

**Date/time selection:** None. The customer cannot pick a date or time on the quote page. Scheduling is staff-deferred.

### D.2 — The post-acceptance handoff

Per `accept/route.ts:80-219`:

- Customer SMS via `quote_accepted_single` / `quote_accepted_multi` template (literal customer-facing text: *"Thanks {first_name}! Your quote has been accepted. Our team will reach out shortly to schedule."*). Logged to `quote_communications` and `sms_delivery_log`.
- Staff SMS via `quote_accepted_staff_notify` template. The template's `recipientPhones` controls routing; falls back to `biz.phone`.
- Staff email to `biz.email` with explicit body line: *"Next step: Convert this quote to an appointment in POS."* (`:196`).
- Quote-stage status appears as `accepted` in the POS quote-list filter, and on quote-detail the badge renders `STATUS_BADGE_CONFIG.accepted` (orange — `quote-detail.tsx:81-89` palette, applied at `:325`). The detail page surfaces **Convert to Appointment** (primary), **Edit**, and **Create Job** action buttons at `:450-480`.

**Staff-selected date/time:** Yes — staff opens POS > Quotes > {Q-NNNN} → presses **Convert to Appointment** (Path A.1) → fills the QuoteBookDialog with date / time / duration / optional employee → confirms. The customer is contacted out-of-band (the staff email/SMS notification explicitly says "reach out").

**Customer-side selected date/time:** NOT supported. There is no customer-facing date-picker on the quote acceptance flow. (The booking wizard at `/book` is a separate surface that bypasses quotes entirely.)

### D.3 — Idempotency

**Double-click on Accept (same session):** The `<AcceptQuoteButton>` component manages local state (`accepting`, `accepted`, `confirming`, `error`) so the button is disabled (`disabled={accepting}`) while the request is in flight (`accept-button.tsx:66, :73`). On success the entire component re-renders as the green "Quote Accepted!" panel, removing the button entirely.

**Stale-page double-accept (across reloads / two tabs):** Second POST hits `accept/route.ts:53-58` and 400s with *`Cannot accept a quote with status "accepted"`* because the status gate only admits `sent` or `viewed`. The error surfaces in the in-component confirm step's error block. The user sees a clear failure rather than a silent duplicate.

**Two appointments?** Cannot happen — accept does not create an appointment.

**Convert-after-accept idempotency:** `convertQuote` guards on `status ∈ {expired, converted}` (`:56-62`). A quote that's already `accepted` is convertible (designed-for path). A quote that's already `converted` cannot be re-converted → second attempt returns the existing `converted_appointment_id` only by inspection; there's no helper that returns the prior appointment automatically.

**Walk-in seam idempotency:** A.3 / A.4 are guarded by the `jobs.quote_id` uniqueness check at `route.ts:297-310` (409 *"A job has already been created from this quote"*). But this only prevents a second JOB from being created — it does NOT prevent two staff members on two POS tabs from one creating an appointment (via A.1) and another creating a walk-in job (via A.3). The two seams are not cross-aware: A.1 doesn't check for an existing `jobs.quote_id`; A.3/A.4 don't check for `quotes.converted_appointment_id IS NOT NULL` (the `convertQuote` guard at `:56-62` for `status='converted'` is NOT invoked on the walk-in seam because the walk-in seam doesn't call `convertQuote`). A staff race here could produce an orphan appointment (from A.1) plus a walk-in appointment+job (from A.3) with `quotes.converted_appointment_id` pointing at the A.1 appointment and `jobs.quote_id` pointing at the A.3 path's quote — both real, neither winning.

---

## Target E — Cross-reference with locked architecture

### E.1 — Stage 1 → Stage 2 transitions

Locked architecture (`QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:96-110` Stage 1 exit transitions) lists three paths:

1. *"→ Stage 2 (Appointment) via 'Convert to Appointment' action; sets `quotes.status='converted'` and writes `quotes.converted_appointment_id`"* — **MATCHES A.1, A.5, A.6** (canonical seam).
2. *"→ Stage 2 (Appointment) directly via 'Walk-In from Quote' if same-day (atomic appointment + job create)"* — **MATCHES A.3, A.4** but with caveat: `quotes.converted_appointment_id` is NOT written on this path (the operator UI shows *"Converted to job"* in this case). The locked doc's wording on this point is silent — it lists two routes to Stage 2 without distinguishing whether both populate the FK.
3. *"Expired or abandoned: stays in Quote stage indefinitely with status `expired` or `sent`"* — **CONFIRMED** by `convertQuote` guard at `:56` rejecting `expired` quotes outright and quote-detail's expired-status renderer showing only **Re-Quote** (`quote-detail.tsx:482-488`).

**Additional path the audit reveals:** A.2 customer-accept is **NOT a Stage 2 transition** — it's an intra-Stage-1 status flip (`sent`/`viewed` → `accepted`). The locked Stage 1 status enum at `QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:81-93` lists `accepted` correctly. But the doc's "Capabilities" subsection at `:96-99` says *"Customer accepts via link (status → accepted); Operator converts accepted quote to Appointment"* — implying a two-step. This is what the code does. The audit confirms the lifecycle doc on this point.

### E.2 — AC-10 (unified ticket number) implications

The locked AC-10 (`QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:429-446`) commits to:

- Quote `quote_number` (Q-XXXX) preserved as pre-conversion artifact.
- New appointment `appointment_number` (A-XXXX) issued at appointment creation.
- Customer sees Q-XXXX during quote phase; A-XXXX from appointment forward.

**Current state at the conversion seam:**

1. **`quote_number` is already unique-indexed** (`DB_SCHEMA.md:2127`) and used as a customer-facing identifier throughout the quote-stage UI (e.g., POS quote-detail at `quote-detail.tsx:347`, public quote page at `:96`, staff email subject at `accept/route.ts:184`, voice-agent quote lookup `Q-23` → UUID resolution at `voice-agent/appointments/route.ts:220-235`).

2. **`appointments.appointment_number` does NOT exist.** Confirmed by the lifecycle doc's own note at `:130` (*"No `appointment_number` column currently exists. This is a gap to address in Phase 3"*) and by direct grep of the appointments table schema (`DB_SCHEMA.md:148-210` shows no such column). AC-10's spine identifier is **greenfield** — Phase 3 will introduce both the column, a generator, the UNIQUE constraint, and the display sites.

3. **ID-level linkage today is purely FK-based:**
   - `quotes.converted_appointment_id` → `appointments.id` (UUID) — populated by canonical seam only.
   - `jobs.quote_id` → `quotes.id` (UUID) — populated by walk-in seam only.
   - These two FKs are **complementary, not redundant** — canonical seam writes the first; walk-in seam writes the second. Phase 3 will likely need a normalization decision: either (a) make the walk-in seam ALSO write `quotes.converted_appointment_id`, (b) keep the asymmetry and treat `jobs.quote_id` as the walk-in-path bridge, or (c) introduce the appointment_number identifier and let both seams converge on display via that.

4. **No "Q-XXXXX → A-XXXXX" linkage UI today.** The POS quote-detail when `status='converted'` only renders the static text *"Converted to appointment"* or *"Converted to job"* — no clickable jump to the converted appointment. The converted appointment, on its side, has no visible reference to its source quote (no UI surface looks up `WHERE converted_appointment_id = X` from the appointment row). This is a current-state gap, not a regression — it's just absent.

5. **Format note:** `quote_number` format is **Q-NNNN** with variable digits (the voice-agent lookup regex at `voice-agent/appointments/route.ts:220` is `/^Q-\d+$/i`). The audit did not exhaustively trace the generator, but `quote_number` is `TEXT UNIQUE` (`DB_SCHEMA.md:2082`) — no DB-level format constraint. Recent operator refinement (per session prompt) commits A-XXXXX to 5 digits starting at A-10000. Quote-number format compatibility with that is not relevant — they're different namespaces.

### E.3 — Identifier format note

- Quote: `quote_number` — `TEXT UNIQUE`, observed format `Q-NNNN` with variable digit width (1+ digits). No DB-level format constraint. Generated at quote creation (generator not traced in this audit; not on the conversion seam).
- Appointment (current): no `*_number` column; only UUID `id`.
- Appointment (post-AC-10): operator commits to `A-XXXXX` 5-digit, starting at `A-10000`. Implementation is Phase 3.
- Job: no `*_number` column; only UUID `id`. AC-10 commits to job inheriting the appointment's `A-XXXXX`.
- Receipt: `receipt_number` (SD-XXXXXX), unrelated to quote/appointment numbering.

---

## Target F — Open operator decisions surfaced (NOT pre-resolved)

### F.1 — A.1's `confirmed` default vs AC-11's payment-driven semantic

The canonical `convertQuote` defaults the new appointment to `status='confirmed'` when called from POS path A.1. AC-11 LOCKED at `:450-464` says: *"`confirmed` = deposit or full payment received via online booking, or operator manually confirms after collecting payment"*. The current implementation does NOT enforce a payment check at A.1 — the operator is implicitly trusted to have collected payment (or to be exercising operator-trust override).

**Question for operator:** Should A.1 require a payment-collected signal before setting `confirmed`, or is operator-trust the locked semantic at the POS surface (mirroring how POS skips other customer-facing guards)? If the former, what does the QuoteBookDialog UI need to add (a payment-link step, a "payment collected y/n" toggle, a hard payment intent check)?

### F.2 — A.3/A.4's missing `quotes.converted_appointment_id`

**Status:** CLOSED 2026-06-07 by Phase 3 Theme F (merge `__MERGE_HASH_F__`). Walk-in seam (`src/app/api/pos/jobs/route.ts`) now writes the canonical converted triplet (`status='converted'` + `converted_appointment_id=appointment.id` + `updated_at`) after the materialize helper succeeds, with `.is('converted_appointment_id', null)` filter for cross-seam race idempotency. FK semantics unified across both seams; `jobs.quote_id` retained as the secondary bridge.

The walk-in seam paths leave `quotes.converted_appointment_id = NULL` even when a job has been created and the quote is marked `converted`. The UI already accommodates this with a branch in the badge text (`quote-detail.tsx:493`). Whether this asymmetry is intentional or a drift gap is unresolved.

**Question for operator:** Should the walk-in seam ALSO populate `quotes.converted_appointment_id` to unify the FK semantics, or is `jobs.quote_id` the canonical bridge for the walk-in path and `quotes.converted_appointment_id` exclusively for the staff-scheduled path?

### F.3 — A.3's modifier-payload omission vs A.4's forwarding

**Status:** CLOSED 2026-06-07 by Phase 3 Theme F (merge `__MERGE_HASH_F__`). A.3 path (`quote-detail.tsx handleCreateJobFromQuote`) now forwards the same 7-field modifier snapshot as A.4 — coupon_code, coupon_discount, loyalty_points_to_redeem, loyalty_discount, manual_discount_type, manual_discount_value, manual_discount_label — read directly from the persisted quote row. Server side already accepted these (A.4 used them pre-F.3); fix was client-side only. The two seams now produce byte-identical appointment rows for the same quote.

Path A.3 (Create Job from quote-detail) does NOT forward modifier columns (coupon/loyalty/manual) into the synthetic walk-in appointment — its request body at `quote-detail.tsx:243-253` includes only `{customer_id, vehicle_id, services, quote_id, notes}`. Path A.4 (New Walk-in via builder) DOES forward modifiers (`quote-ticket-panel.tsx:825-841` modifier payload comment). The asymmetry means a quote with a $20 manual discount converted via A.3 produces an appointment with `manual_discount_value=NULL`; the same quote converted via A.4 produces an appointment with `manual_discount_value=20`.

**Question for operator:** Should A.3 align with A.4 (forward modifiers) so the appointment-row truth matches the quote? Note that the walk-in atomic seam's `subtotal/discount/total` math is then derived from the request payload, not from the quote's persisted columns — so A.3 would also need to forward subtotal/tax/total or trust the server to recompute.

### F.4 — A.5's `appointment_confirmed` webhook firing on `pending` status

`convertQuote` unconditionally fires `appointment_confirmed` at `:240`, even when `options.appointmentStatus === 'pending'` (path A.5 voice-agent). The webhook name is fixed at the function level; the payload carries the actual status. n8n / lifecycle consumers reading the event NAME may not distinguish.

**Question for operator:** Should the webhook name vary by appointment status at convertQuote time (e.g., `appointment_pending` vs `appointment_confirmed`), or do downstream consumers read the status off the payload and the event name is informational only? AC-5 pre-task already references n8n receiver idempotency for `appointment_confirmed` — does this finding interact with that audit's scope?

### F.5 — A.6 dormant admin endpoint

**Status:** CLOSED 2026-06-07 by Phase 3 Theme F (merge `__MERGE_HASH_F__`). `src/app/api/quotes/[id]/convert/route.ts` deleted; pre-deletion grep across `src/` confirmed zero callers. Resolution path: DELETION (consistent with CLAUDE.md's "Quotes are READ-ONLY in admin" rule). The `<QuoteBookDialog>` apiBasePath parameterization remains in place (only POS instantiates it post-F.5; the parameterization is now vestigial but harmless to retain for future expansion if admin convert ever returns under different rules).

`POST /api/quotes/[id]/convert` is fully implemented but has no caller in the source tree. The shared `<QuoteBookDialog>`'s parameterization (`apiBasePath="/api/quotes"` vs `/api/pos/quotes"`) suggests it was once wired or intended to be.

**Question for operator:** Should A.6 be deleted (CLAUDE.md's "Quotes are READ-ONLY in admin" rule supports this), kept dormant for a future re-enablement, or wired into a new admin convert surface? Per the locked architecture's "Admin retains full power as the back-office surface" out-of-scope note at `:62-63`, dormancy may be inconsistent with the locked principle.

### F.6 — Quote → already-converted re-quote semantics

**Status:** CLOSED (deep-link half) 2026-06-07 by Phase 3 Theme F (merge `__MERGE_HASH_F__`). "View Appointment" link added to POS `quote-detail.tsx` + admin `quote-slide-over.tsx` action bars on the `status='converted' AND converted_appointment_id != null` branch, routing to `/admin/appointments?id=<uuid>`; admin appointments page adds a single-shot `?id=<uuid>` deep-link receiver useEffect that fetches the row, jumps the calendar to its date, opens the detail dialog, and strips the param via `history.replaceState`. The Re-Quote-on-`converted` half of the question is DEFERRED (operator did not lock that behavior; the current empty-action-bar on the Re-Quote axis remains intentional pending product decision).

When a quote is in status `converted`, the only operator action available is **Re-Quote** (per `quote-detail.tsx:482-488`, but this branch is gated to `expired` status only). On `converted` the action bar is empty (`:490-495` renders only the "Converted" badge). There is no "view the converted appointment" jump, no "copy this quote into a new draft" affordance.

**Question for operator:** Should `converted` status surface a deep-link to the converted appointment? Should the **Re-Quote** affordance also apply to `converted` (for the "customer changed their mind, rebuild a quote" case)? Or is the current empty-action-bar intentional (forces operator to navigate via customer / appointments)?

### F.7 — Race between A.1 and A.3 on the same quote

**Status:** CLOSED 2026-06-07 by Phase 3 Theme F (merge `__MERGE_HASH_F__`). `convertQuote()` carries a two-arm race idempotency guard: Arm 1 (pre-INSERT) refetches the quote and short-circuits to `already_converted: true` if `converted_appointment_id` is already set; Arm 2 (post-INSERT) uses `.is('converted_appointment_id', null).select(...)` on the UPDATE — zero matched rows triggers an orphan-rollback (`appointments.delete()` cleans appointment_services via ON DELETE CASCADE), then re-fetches and returns the race-winner. The cross-seam half is closed by F.2: any seam touching a quote now writes `converted_appointment_id`, so a subsequent convertQuote call sees the FK and routes through Arm 1 regardless of which seam (canonical or walk-in) raced first. The walk-in seam retains its own `jobs.quote_id` UNIQUE guard (409 reject) as a complementary stop. Foundational for AC-12 / Theme C customer-accept auto-conversion: the operator-vs-customer race is now safe to collapse to one appointment.

A.1 (operator schedules via QuoteBookDialog) and A.3 (operator presses Create Job) are simultaneously available on the quote-detail action bar for the same statuses. Two staff on two POS tabs could fire both. A.1's `convertQuote` guard against `status='converted'` does NOT block A.3 (which doesn't call `convertQuote`); A.3's `jobs.quote_id` uniqueness does NOT block A.1 (no job is created on A.1). Result: an A.1 appointment with `quotes.converted_appointment_id` populated, plus an A.3 walk-in appointment+job with `jobs.quote_id` populated, both referencing the same quote.

**Question for operator:** Is this race a real concern (do operators routinely have two POS sessions on the same quote)? If so, should the conversion endpoints cross-check the OTHER seam's idempotency signal before proceeding?

### F.8 — Customer-accept without follow-through

Per A.2's design, a customer can accept a quote and the staff handoff is via SMS + email saying *"Next step: Convert this quote to an appointment in POS"*. If staff misses the notification, the quote sits at `accepted` indefinitely with no enforcement.

**Question for operator:** Is there an SLA / lifecycle-engine rule that should auto-escalate stale `accepted` quotes (e.g., reminder after 24h, auto-conversion to pending appointment after 48h)? The audit did not find such a rule in the lifecycle engine.

---

## File:line reference index

### Conversion seams (source)

| Path | File | Range |
|---|---|---|
| Canonical `convertQuote` service | `src/lib/quotes/convert-service.ts` | 31-243 |
| Quote fetch | `src/lib/quotes/convert-service.ts` | 40-50 |
| Pre-status guard | `src/lib/quotes/convert-service.ts` | 56-62 |
| Modifier resolution | `src/lib/quotes/convert-service.ts` | 91-117 |
| Appointment INSERT | `src/lib/quotes/convert-service.ts` | 128-158 |
| appointment_services INSERT | `src/lib/quotes/convert-service.ts` | 165-191 |
| Quote status update | `src/lib/quotes/convert-service.ts` | 194-205 |
| Webhook fire | `src/lib/quotes/convert-service.ts` | 240 |
| Walk-in atomic create (`POST /api/pos/jobs`) | `src/app/api/pos/jobs/route.ts` | 147-536 |
| Walk-in quote idempotency guard | `src/app/api/pos/jobs/route.ts` | 297-310 |
| Walk-in appointment INSERT | `src/app/api/pos/jobs/route.ts` | 383-414 |
| Walk-in appointment_services INSERT | `src/app/api/pos/jobs/route.ts` | 436-453 |
| Walk-in jobs INSERT | `src/app/api/pos/jobs/route.ts` | 470-490 |
| Customer accept endpoint | `src/app/api/quotes/[id]/accept/route.ts` | 14-226 |
| Accept status gate | `src/app/api/quotes/[id]/accept/route.ts` | 53-58 |
| Accept status update | `src/app/api/quotes/[id]/accept/route.ts` | 61-70 |
| Accept staff notification ("Next step: Convert this quote…") | `src/app/api/quotes/[id]/accept/route.ts` | 121-219 |

### Endpoints (wrappers)

| Path | File | Range |
|---|---|---|
| POS convert endpoint | `src/app/api/pos/quotes/[id]/convert/route.ts` | 9-63 |
| Admin convert endpoint (dormant) | `src/app/api/quotes/[id]/convert/route.ts` | 8-47 |
| Voice-agent appointment endpoint (with quote_id branch) | `src/app/api/voice-agent/appointments/route.ts` | 200-310+ |
| `convertSchema` | `src/lib/utils/validation.ts` | 722-727 |

### UI surfaces

| Surface | File | Range |
|---|---|---|
| POS quote-detail page | `src/app/pos/components/quotes/quote-detail.tsx` | full file |
| Convert button (draft) | `src/app/pos/components/quotes/quote-detail.tsx` | 378-383 |
| Convert button (sent/viewed) | `src/app/pos/components/quotes/quote-detail.tsx` | 425-430 |
| Convert button (accepted) | `src/app/pos/components/quotes/quote-detail.tsx` | 458-463 |
| Create Job button (multiple statuses) | `src/app/pos/components/quotes/quote-detail.tsx` | 384-398, 431-445, 464-478 |
| `handleCreateJobFromQuote` | `src/app/pos/components/quotes/quote-detail.tsx` | 219-280 |
| Converted-state badge branch ("appointment" vs "job") | `src/app/pos/components/quotes/quote-detail.tsx` | 491-495 |
| QuoteBookDialog | `src/components/quotes/quote-book-dialog.tsx` | full file |
| Dialog POST | `src/components/quotes/quote-book-dialog.tsx` | 105-114 |
| Auto-notify side effect | `src/components/quotes/quote-book-dialog.tsx` | 124-135 |
| POS quote-ticket-panel walk-in mode | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | full file |
| `handleCreateJob` (walk-in) | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | 725-880 |
| Create Job button (walk-in mode) | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | 1116-1125 |
| New Walk-in nav (POS Jobs) | `src/app/pos/jobs/page.tsx` | 324 |
| New Walk-in button | `src/app/pos/jobs/components/job-queue.tsx` | 782-786 |
| Public quote page | `src/app/(public)/quote/[token]/page.tsx` | full file |
| canAccept gate | `src/app/(public)/quote/[token]/page.tsx` | 156, 426 |
| First-view auto-mark | `src/app/(public)/quote/[token]/page.tsx` | 62-75 |
| Accept button component | `src/app/(public)/quote/[token]/accept-button.tsx` | full file |
| Confirm step copy | `src/app/(public)/quote/[token]/accept-button.tsx` | 52-82 |
| Success state copy | `src/app/(public)/quote/[token]/accept-button.tsx` | 42-49 |

### DB schema anchors

| Topic | Anchor |
|---|---|
| `quotes` table | `docs/dev/DB_SCHEMA.md:2077-2128` |
| `quotes.status` enum | `docs/dev/DB_SCHEMA.md:2085, 3236` |
| `quotes.converted_appointment_id` FK | `docs/dev/DB_SCHEMA.md:2094` |
| `quotes.quote_number` UNIQUE | `docs/dev/DB_SCHEMA.md:2082, 2127` |
| `quote_items` table | `docs/dev/DB_SCHEMA.md:2052-2074` |
| `quote_communications` | `docs/dev/DB_SCHEMA.md:2023-2049` |
| `quote_activities` | `docs/dev/DB_SCHEMA.md:2003-2020` |
| `appointments` table | `docs/dev/DB_SCHEMA.md:148-210` |
| `appointment_services` table | `docs/dev/DB_SCHEMA.md:126-145` |
| `appointments.payment_type` CHECK | `docs/dev/DB_SCHEMA.md:197` |
| `jobs.quote_id` FK | `docs/dev/DB_SCHEMA.md:1231` |
| `jobs.appointment_id` UNIQUE | `docs/dev/DB_SCHEMA.md:1207, 1246` |

### Architectural commitments referenced

| AC | Lifecycle doc anchor |
|---|---|
| Stage 1 Quote | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:77-110` |
| Stage 2 Appointment | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:112-149` |
| Walk-in sub-state | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:215-227` |
| AC-10 unified ticket number | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:429-446` |
| AC-11 pending vs confirmed | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:450-464` |

---

**End of audit.**
