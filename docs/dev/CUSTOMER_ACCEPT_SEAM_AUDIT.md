# Customer-Accept Seam Audit — Phase 3.0.3 Pre-task for AC-12

**Type:** Targeted Component Behavior (Memory #29 type 3) — read-only foundational audit
**Date:** 2026-06-06 (PST)
**Scope:** Current-state customer-accept flow; identify implementation seams for AC-12 auto-conversion + SLA alerting
**Pre-task for:** AC-12 (Customer-accept auto-conversion to pending appointment with SLA alerting) — Phase 3 Theme C
**Read-only — no source, migration, or test changes**

---

## Executive Summary

The customer-accept endpoint at `POST /api/quotes/[id]/accept` (`src/app/api/quotes/[id]/accept/route.ts`, 227 lines) today is a pure-status flip: it validates the access token, flips `quotes.status='accepted'` + `accepted_at=NOW`, fires a customer SMS + staff SMS + staff email, and a `quote_accepted` webhook (silent no-op in production per Phase 0 receiver audit). **No appointment row is created** — confirming Phase 0.2 F.8. Customer momentum is preserved only by manual operator follow-up.

The customer-facing accept UI (`src/app/(public)/quote/[token]/accept-button.tsx`) is **payment-less by design today** — customer clicks "Accept Quote" → confirmation modal → `POST /accept` → "Thank you! We will contact you shortly to schedule." There is no payment widget, no date/time picker, no scheduling fields. This simplifies AC-12 scoping (no AC-11 payment-vs-status interaction in the existing UI) but constrains Theme C if pay-at-accept is added later.

**The biggest implementation surprise: the placeholder problem is structurally forced.** `convertQuote` requires `{ date, time, duration_minutes }` (Zod-validated `convertSchema` at `validation.ts:722-727`); the customer-accept request has NONE of these. The `appointments` table requires `scheduled_date`, `scheduled_start_time`, `scheduled_end_time` as **NOT NULL** columns with no defaults (`DB_SCHEMA.md:158-160`). Making these nullable is a heavyweight schema change cascading across every appointments reader. So Theme C MUST adopt a non-null placeholder strategy at convert time, OR introduce schema migration to support nullable scheduled fields — see Target B.3 for the option landscape.

**Channel enum gap:** `appointment_channel` enum currently has 4 values (`online, phone, walk_in, portal` — `supabase/migrations/20260201000001_create_enums.sql:8`). **`customer_accept` is NOT one of them.** AC-12's commitment text (`channel: 'customer_accept'`) requires either an enum addition (small migration) or reuse of an existing value (overloads semantics).

**Lifecycle engine architecture supports SLA alerting structurally, but the existing engine is customer-marketing oriented** — its `action` enum is `sms|email|both`, rules carry `coupon_*` fields, and the `trigger_condition` 'after_quote_accepted' already exists and fires customer marketing on accept. The engine pattern is "schedule-once at trigger time, fire at scheduled_for" — not "keep checking until staff acts." AC-12's SLA semantic ("alert if no staff action within N hours") needs a different pattern. Two architectural options (Target D.3): extend the engine with a new self-clearing trigger, or build a dedicated SLA checker cron.

**Business hours infrastructure is well-supported** by `src/lib/data/business-hours.ts` (`getBusinessHours()` + `isWithinBusinessHours()`) — backs the operator-locked 8am–8pm immediate alert vs after-hours queue distinction cleanly.

**Seven open operator decisions surfaced** (G.1–G.7).

---

## Table of Contents

1. [Target A — current customer-accept flow](#target-a--current-customer-accept-flow)
2. [Target B — convertQuote integration shape + placeholder problem](#target-b--convertquote-integration-shape--placeholder-problem)
3. [Target C — status semantic boundary (AC-11/AC-12 interaction)](#target-c--status-semantic-boundary-ac-11ac-12-interaction)
4. [Target D — SLA alerting integration](#target-d--sla-alerting-integration)
5. [Target E — cross-cutting integration risks](#target-e--cross-cutting-integration-risks)
6. [Target F — best-in-class assessment + integration approaches](#target-f--best-in-class-assessment--integration-approaches)
7. [Target G — open operator decisions](#target-g--open-operator-decisions)
8. [File:line reference index](#fileline-reference-index)

---

## Target A — Current customer-accept flow

### A.1 — The endpoint

- **Path:** `POST /api/quotes/[id]/accept` (`src/app/api/quotes/[id]/accept/route.ts:14-226`)
- **Auth:** Public; the request body must carry an `access_token` matching `quotes.access_token` (`:21-25, :48-50`). This is the same 6-char alphanumeric token the quote SMS/email link carries (generated at quote creation: `src/lib/quotes/quote-service.ts:138-141`, 56.8B possible combinations).
- **Request shape:** `{ access_token: string }` only (`:20-21`). No payment fields, no date/time, no service overrides.
- **Response:** `{ success: true, quote: <updated quote row> }` on 200; `{ error: string }` on 4xx/500.

### A.2 — Server-side actions today

The handler performs these operations in order:

1. **Validate access_token presence** (`:23-25`) — 400 if missing/non-string.
2. **Fetch quote with customer + items embed** (`:30-41`) — 404 if not found or soft-deleted.
3. **Validate token match** (`:48-50`) — 403 if mismatch.
4. **Validate quote status** (`:52-58`) — 400 if not in `('sent', 'viewed')`. Cannot accept a draft, expired, or already-accepted/converted quote.
5. **UPDATE quote row** (`:61-70`): `status='accepted'`, `accepted_at=NOW`, `updated_at=NOW`.
6. **Fire webhook** (`:78`): `fireWebhook('quote_accepted', { ...quote, status, accepted_at })` — fire-and-forget. **Silent no-op in production** per Phase 0 webhook receivers audit (`f5e714a8`) — no n8n receiver is wired.
7. **Customer SMS** (`:80-118`): renders `quote_accepted_single` or `quote_accepted_multi` template (single chosen when items.length===1 AND item has name); falls back to inline prose. Sends via `sendSms()` with `notificationType='quote_accepted'`, `contextId=<quote.id>`. Logs to `quote_communications` table.
8. **Staff SMS** (`:120-179`): renders `quote_accepted_staff_notify` template with `customer_name`, `quote_number`, `service_total`, `services`, `customer_phone`, `customer_email`, `last_name`. Routes to `staffResult.recipientPhones` (template-configured) OR falls back to `biz.phone`. Fire-and-forget per recipient.
9. **Staff email** (`:181-216`): renders text + HTML email with quote summary + customer contact + admin URL + literal CTA text *"Next step: Convert this quote to an appointment in POS."* Sends to `biz.email`.

### A.3 — What the handler does NOT do today

Verified by reading the handler in full:

- **No `appointment` row is created.** No INSERT into `appointments`; no call to `convertQuote()` (`src/lib/quotes/convert-service.ts:31-260`).
- **No `quotes.converted_appointment_id` write.** That column (`DB_SCHEMA.md:2094`) stays NULL on customer-accept flow.
- **No lifecycle_executions inserted directly.** The lifecycle engine's `after_quote_accepted` trigger handler (`src/app/api/cron/lifecycle-engine/route.ts:534-578`) runs on its next cron pass and schedules customer-marketing executions (per existing `quoteAcceptedRules`), but no staff-SLA execution is inserted.
- **No payment processing.** No Stripe PI creation, no charge, no `transactions` row.
- **No appointment_services rows.** Quote items stay as `quote_items` only.
- **No staff acknowledgment tracking.** No column writes that record "operator saw this" — staff awareness depends entirely on the SMS/email firing successfully and being read.

### A.4 — Customer post-accept experience

From `src/app/(public)/quote/[token]/accept-button.tsx`:

- **Customer-facing UI: payment-less, scheduling-less.** The component renders a single "Accept Quote" button (`:84-91`). Click → confirmation modal asking "Confirm acceptance of this {totalAmount} estimate? We'll reach out to schedule your appointment." (`:55-61`). Confirm → POST → success state.
- **Success state copy** (`:43-49`): *"Quote Accepted! Thank you! We will contact you shortly to schedule your appointment."*
- **No follow-up customer-facing interactions** until staff converts manually. Customer has no way to track status, no portal page surfacing the pending quote, no scheduled-date-pending indicator. The customer-facing path effectively goes dark from the customer's perspective until staff initiates contact.
- **Customer SMS confirmation** (per A.2 step 7): the customer DOES receive an SMS — *"Thanks {first_name}! Your quote for {item_name} has been accepted. Our team will reach out shortly to schedule your appointment."* This is the customer's only post-accept signal.

---

## Target B — convertQuote integration shape + placeholder problem

### B.1 — Required inputs

`convertQuote(supabase, quoteId, data, options?)` signature (`src/lib/quotes/convert-service.ts:31-36`):

- **`supabase`** — `SupabaseClient` (caller provides)
- **`quoteId`** — `string` (`:32`)
- **`data: ConvertQuoteInput`** — Zod-validated by `convertSchema` (`src/lib/utils/validation.ts:722-727`):
  - `date: string` matching `/^\d{4}-\d{2}-\d{2}$/` (YYYY-MM-DD)
  - `time: string` matching `/^\d{2}:\d{2}$/` (HH:MM)
  - `duration_minutes: number` integer ≥ 1
  - `employee_id: string` UUID — **optional + nullable** (auto-assigned via `findAvailableDetailer` if absent, `:67-71`)
- **`options?: ConvertQuoteOptions`** (`:24-29`):
  - `appointmentStatus?: 'confirmed' | 'pending'` — default `'confirmed'`
  - `channel?: string` — default `'phone'`

The function then inserts the appointment row with `scheduled_date=data.date`, `scheduled_start_time=data.time`, `scheduled_end_time=addMinutesToTime(time, duration_minutes)` (`:128-138`).

### B.2 — Which inputs does customer-accept HAVE today?

From the customer-accept request body (`accept/route.ts:20-21`):

| Required input | Available at customer-accept? | Notes |
|---|---|---|
| `quoteId` | ✅ via URL params | `params.id` |
| `date` | ❌ | Customer doesn't pick date at accept time |
| `time` | ❌ | Customer doesn't pick time |
| `duration_minutes` | ⚠️ derivable | Sum of `services.base_duration_minutes` for items with `service_id`; products + custom items have no duration. Helper exists nowhere — would need to be computed at convert time |
| `employee_id` | ❌ | Staff assigns later |
| `appointmentStatus` | ✅ Theme C locks 'pending' (per AC-12) | Modulo C.1 payment branch |
| `channel` | ⚠️ enum gap | AC-12 says `'customer_accept'`; not in enum |

The three NOT-NULL appointment columns (`scheduled_date`, `scheduled_start_time`, `scheduled_end_time` — `DB_SCHEMA.md:158-160`) all depend on data the customer hasn't provided.

### B.3 — The placeholder problem

The appointments table requires `scheduled_date`, `scheduled_start_time`, and `scheduled_end_time` as NOT NULL with no defaults (`DB_SCHEMA.md:158-160`). The customer-accept conversion needs values for all three. Three structural option families surface:

#### B.3.a — `scheduled_date` placeholder strategy

**(α) Use `quote.valid_until::DATE`** — the quote's expiration date.
- **Pros:** semantically meaningful (gives staff an implicit deadline — the quote expires that day); already a populated column on most quotes (set by `quote-service.ts:139-141` via business_settings); no migration needed.
- **Cons:** may be far in the future for quotes with long validity (operator decision F.6 in Phase 0.2 audit suggested up to 10 days default); the appointment would surface as "scheduled" for that distant date on POS Schedule scope until staff edits it — possibly confusing.

**(β) Use `quote.created_at::DATE + N business days`** — a configurable buffer relative to quote creation.
- **Pros:** more proximate; configurable per business preference; predictable position on operator's schedule view.
- **Cons:** if customer accepts late (e.g., on day 8 of a 10-day quote), the placeholder lands in the past — appointments table has no past-date constraint but downstream readers (POS Schedule scope, populate predecessor) treated past-dated rows inconsistently before Phase 2; risk of off-by-one operator confusion.

**(γ) Use `NOW()::DATE + 1` (tomorrow)** — same-pattern placeholder, regardless of quote details.
- **Pros:** uniform behavior; predictable for staff (any customer-accept appointment defaults to tomorrow).
- **Cons:** if customer accepts at 11:59pm PST, the placeholder is tomorrow but the SLA alert (if 4-hour threshold) might fire midday — semantic mismatch; ignores quote.valid_until context.

**(δ) Use `quote.created_at::DATE` (the quote's creation date)** — "we'll schedule it for the same date you got the quote."
- **Pros:** trivially derivable; clearly a placeholder (operator sees "scheduled for the past" and immediately knows to update).
- **Cons:** semantically wrong — appointment can't actually have happened in the past; conflicts with `populate`-style historical-completion reasoning (per Phase 0.3 audit Target B).

**(ε) Migrate `scheduled_date` to nullable** — drop NOT NULL.
- **Pros:** no semantic forcing — represents "no date yet" honestly.
- **Cons:** cascading reader audit required — every code path that reads `scheduled_date` assumes it's non-null today. Phase 0.3 confirmed 13+ downstream `jobs` consumers (lifecycle engine, checkout, receipts, etc.); similar `appointments` reader audit not done but volume likely matches. High risk of subtle nullability bugs across surfaces. Schema migration changing NOT NULL → NULL also has its own concurrency implications during deploy.

**(ζ) Hybrid — placeholder in DB + a new `scheduled_date_placeholder: boolean` column** — distinguish placeholder dates from operator-set ones.
- **Pros:** keeps non-null structurally; gives explicit signal for "needs scheduling" badge in operator UI; SLA query can filter on `WHERE scheduled_date_placeholder=true`.
- **Cons:** new column requires migration; new write site every time staff updates the date (must flip placeholder→false); risk of drift if a code path forgets the flip.

#### B.3.b — `scheduled_start_time` placeholder strategy

Same shape as B.3.a. Most natural pairing: a time placeholder like `'09:00:00'` (business open) regardless of date strategy. The hybrid (ζ) approach above unifies this — one `placeholder_pending: boolean` column covers both date + time.

#### B.3.c — `scheduled_end_time` placeholder strategy

Derived: `scheduled_start_time + duration_minutes` where `duration_minutes` is computed from the quote items' service durations at convert time (see B.2 row 4). If duration is uncomputable (custom items only), a 60-minute fallback matches the existing `populate` pattern at `populate/route.ts:126` and walk-in atomic-create at `pos/jobs/route.ts:328`.

#### B.3.d — `employee_id` placeholder strategy

`employee_id` is **already nullable** (FK ON DELETE SET NULL — `DB_SCHEMA.md:155`). `convertQuote` already passes `null` to `findAvailableDetailer` if not provided (`convert-service.ts:67-71`). For customer-accept at midnight when no shift is active, `findAvailableDetailer` will return null and the appointment will have `employee_id=NULL` — operator must assign at first-touch. This is structurally clean; no new design needed.

### B.4 — Customer-accept-specific status logic

Per AC-12, customer-accept creates `status='pending'`. `convertQuote` already supports this via `options.appointmentStatus='pending'` (`:25, :134`), and the webhook gate at `:255-257` (Session 1.7) correctly suppresses `appointment_confirmed` for pending rows. Three integration patterns surface:

- **Direct call:** `convertQuote(supabase, quoteId, { date: PLACEHOLDER, time: PLACEHOLDER, duration_minutes: COMPUTED }, { appointmentStatus: 'pending', channel: 'customer_accept' })`. Requires the caller (accept endpoint) to compute placeholders.
- **New helper:** `convertQuoteOnCustomerAccept(supabase, quoteId)` that wraps `convertQuote` with customer-accept-specific defaults (placeholder strategy, channel, status). Cleaner separation; the accept endpoint stays thin.
- **Signature extension:** add `source: 'customer_accept' | 'operator' | 'walk_in'` flag to `ConvertQuoteOptions`; `convertQuote` itself computes placeholders based on source. Most encapsulated but couples placeholder policy to the conversion seam.

No clear winner; trade-offs in F.2 below.

---

## Target C — Status semantic boundary (AC-11/AC-12 interaction)

### C.1 — What if customer pays at acceptance?

**Current state: payment-less UI.** `accept-button.tsx` (verified in A.4 above) renders only an Accept button and a confirmation modal. There is no payment widget, no `<PaymentElement>`, no Stripe init. The customer cannot pay at acceptance today.

The only customer-facing payment flow is the parallel pay-link path (`/pay/[token]` per Phase 3.0.2 audit `10421f23`) — entirely separate from quote acceptance. Pay-link is operator-initiated; accept is customer-initiated. No shared UI surface.

### C.2 — Conflict with AC-11

Because there is no pay-at-accept flow today, AC-11 vs AC-12 does NOT conflict in the current shipped state:
- AC-11 says: payment → confirmed. No payment is taken at accept; AC-11 is satisfied by silence (no `confirmed` claim made).
- AC-12 says: customer-accept → pending. The auto-conversion would consistently set `status='pending'` because no payment receipt exists.

**Forward implication:** if Theme C ever adds pay-at-accept to the customer UI (as Phase 0.2 F.7 alluded to), AC-11 would re-engage and the conversion logic would need a payment-receipt branch (`status='confirmed'` if `payment_intent.succeeded` at accept time, else `'pending'`). This is out of scope for AC-12's first-cut implementation per current UI but worth surfacing as a Theme C forward-question.

### C.3 — Channel enum gap

AC-12's commitment text specifies `channel: 'customer_accept'`. The `appointment_channel` enum at `supabase/migrations/20260201000001_create_enums.sql:8` defines four values: `'online'`, `'phone'`, `'walk_in'`, `'portal'`. **No `'customer_accept'` value exists.**

Three options surface:

1. **Add new enum value `'customer_accept'`** via migration (`ALTER TYPE appointment_channel ADD VALUE 'customer_accept'`). Minimal change; preserves semantic clarity. New value is forward-compatible.
2. **Reuse existing `'online'`** — accept happens via online link click. Overloads `'online'` semantics (currently only public booking via `/book` uses this — `book/route.ts:574`). Defensible because "online quote accept" is online, but loses the auto-conversion source signal.
3. **Reuse existing `'portal'`** — currently unused by any code path verified by grep. Could be repurposed for customer-accept conversions. Semantic stretch (`'portal'` historically implied authenticated customer portal).

Theme C scope question: which option?

---

## Target D — SLA alerting integration

### D.1 — Lifecycle engine current shape

Source: `src/app/api/cron/lifecycle-engine/route.ts` (1183 lines).

- **Cron cadence:** every 10 minutes per `CLAUDE.md` cron table. Five-phase execution per invocation (`:36-49`): Phase 0/0.5 (drip), Phase 1 (schedule), Phase 2 (execute), Phase 3 (drip execution).
- **Rule storage:** `lifecycle_rules` table (`DB_SCHEMA.md:1283-1306`). Columns: `trigger_condition` (text, defaults `'service_completed'`), `delay_days`, `delay_minutes`, `action` enum (`sms|email|both`), `sms_template`, `email_subject`, `email_template`, `coupon_*` fields, `is_active`, etc.
- **Execution storage:** `lifecycle_executions` table (`DB_SCHEMA.md:1252+`); indexed by `(lifecycle_rule_id, customer_id, created_at)` for dedup at `:1273`.
- **Existing trigger conditions (handlers):** `service_completed` (`:215`), `after_transaction`, `after_work_completed`, `after_appointment_booked`, `after_appointment_cancelled`, `after_quote_accepted` (`:534-578`).
- **Pattern:** Phase 1 scans for new trigger events within a 24-hour lookback window (`:58`); for each match, inserts a `lifecycle_executions` row with `status='pending'` and `scheduled_for = triggered_at + delay`. Phase 2 polls `WHERE status='pending' AND scheduled_for <= now` and dispatches.
- **Customer-facing only:** all existing actions dispatch via `sendMarketingSms()` (`:3`) or `sendEmail()` (`:4`), gated by `SMS_MARKETING` / `EMAIL_MARKETING` feature flags (`:159-164`). Skips sending if both flags off.

### D.2 — Adding the AC-12 SLA rule

AC-12's commitment: "if a pending appointment originating from quote-accept has no staff confirmation (status not advanced beyond pending) within a configurable threshold (initial value: 4 business hours), alert operator via SMS/notification."

**Query shape under the current engine pattern:**
```sql
SELECT id, customer_id, created_at FROM appointments
WHERE channel = 'customer_accept'     -- requires C.3 enum addition
  AND status = 'pending'              -- not yet acknowledged
  AND created_at <= NOW() - INTERVAL '4 hours'  -- past threshold
  AND id NOT IN (SELECT appointment_id FROM lifecycle_executions
                  WHERE lifecycle_rule_id = $sla_rule AND status IN ('sent', 'pending'))  -- dedup
```

**Structural mismatch with the current engine:**
- The current engine's `action` enum is `sms|email|both` — customer-marketing flavored. A staff SLA alert would dispatch via the existing `quote_accepted_staff_notify`-style templates (with `recipient_type='staff'` per `DB_SCHEMA.md:2707`). Whether the engine's dispatch loop honors `recipient_type` correctly is unverified — the existing `sendMarketingSms` path uses customer phone (`:3`), not staff phone.
- The engine is "schedule-once at trigger, fire at scheduled_for" — for SLA, we want "scan every N minutes for newly-past-threshold rows that haven't been alerted yet." This is closer to the engine's Phase 1 query loop, but the lookback window is 24 hours — a 4-hour SLA threshold runs comfortably inside that, but a longer threshold (e.g., 24h itself, or future operator-configurable values like "next business day") would not.
- **Marketing flag gating** (`SMS_MARKETING` / `EMAIL_MARKETING`) is wrong for staff alerts — staff SLA shouldn't be silenced by a customer-marketing kill switch.

### D.3 — Real-time vs cron-driven alerting

Per the operator's locked principle (referenced in the audit prompt: "immediate during 8am–8pm, queue for 8am next morning if after-hours"):

**Two architectural options:**

**(α) Synchronous fire-on-accept + cron-driven re-check.** The accept endpoint, after creating the pending appointment, checks `isWithinBusinessHours()` (existing helper at `src/lib/data/business-hours.ts:31-48`):
- **If within hours:** dispatch staff SMS immediately via the existing `quote_accepted_staff_notify` pattern (`accept/route.ts:158-179`). The acknowledgment expectation is "staff sees within minutes."
- **If outside hours:** queue an alert. Existing engine could schedule it via a new `after_pending_customer_accept` trigger with `scheduled_for=next 8am PST`. New cron OR engine extension.
- **Re-check after threshold:** if appointment still pending after 4 business hours, fire escalation. This is the "SLA" portion proper — a separate cron OR engine pass.

**(β) Pure cron-driven, no synchronous fire.** The accept endpoint just creates the pending appointment. A new cron (or new lifecycle engine pass) runs every 10 minutes:
- Query for `pending` appointments matching the SLA criteria.
- For each match, dispatch staff SMS via `sendSms` (not `sendMarketingSms` — bypasses marketing flag).
- Insert `lifecycle_executions` row with `lifecycle_rule_id=<sla_rule>`, `appointment_id`, `status='sent'` to dedup future passes.

Trade-offs: (α) is more responsive within business hours but adds complexity to the accept endpoint (two dispatch paths); (β) is simpler architecturally but introduces up-to-10-minute latency between accept and first staff alert.

**Time-of-day infrastructure already exists:**
- `getBusinessHours()` returns `business_settings.business_hours` JSONB (per-day open/close, PST-aware) — `business-hours.ts:13-29`
- `isWithinBusinessHours(hours)` returns boolean — `business-hours.ts:31-48`
- Both helpers handle PST/PDT correctly via `toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })` (`:34`)

### D.4 — Staff notification mechanism

The existing staff-notification pattern (per accept endpoint `:120-179`):

- **Template-driven via `renderSmsTemplate(slug, vars, fallback)`.** The slug carries `recipient_type='staff'` (`DB_SCHEMA.md:2698, 2707`) and `recipient_phones: TEXT[]` (`:2699`).
- **Recipient routing:** `result.recipientPhones?.length ? result.recipientPhones : (biz.phone ? [biz.phone] : [])` (`accept/route.ts:173`). Per-template explicit phone list with fallback to `business_settings.business_phone` (via `getBusinessInfo()`).
- **Dispatch:** `for (const phone of phones) sendSms(phone, body)` — fire-and-forget per recipient (`:174-178`).
- **Templates already wired with `recipient_type='staff'`:** `booking_staff_notify`, `booking_staff_notify_quote_request`, `booking_staff_notify_specialty`, `quote_accepted_staff_notify` (per `src/lib/sms/generated-contracts.ts:32-43`).

**For AC-12 SLA alerts, a new template would follow this pattern.** Suggested slug: `pending_appointment_sla_alert` (or similar). Required chips: `customer_name`, `customer_phone`, `appointment_age_hours` (or `accepted_at_hint`), `quote_number`, `services`, `admin_url`. Optional chips: `last_name`, `vehicle_description`.

Reuse of `quote_accepted_staff_notify` for the SLA alert is NOT recommended — that template fires at accept time and re-firing it would be confusing ("Quote accepted!" 4h later is a stale signal). Theme C scope question (G.4) is whether to introduce a new slug or layer SLA into an existing one.

---

## Target E — Cross-cutting integration risks

### E.1 — Token-based access

- **Access token shape:** 6-char alphanumeric (`A-Za-z0-9`), generated via `crypto.getRandomValues(new Uint8Array(6))` at quote creation (`quote-service.ts:139-141`). 56.8B combinations per token.
- **Token storage:** stored in `quotes.access_token` (TEXT, not unique-indexed but indexed `idx_quotes_access_token` per `DB_SCHEMA.md:2123`); never expires unless the quote is deleted.
- **Token-replay attack:** The handler's status guard at `:52-58` (rejects accepts on quotes not in `'sent'`/`'viewed'`) is the only replay defense. After first successful accept, `quote.status='accepted'`, so the second accept returns 400 *"Cannot accept a quote with status 'accepted'"*. **Idempotent at the quote level.** A customer who clicks Accept twice would NOT create two appointments under AC-12 conversion, BECAUSE the second call returns 400 before convertQuote is invoked.
- **Token expiration:** `quotes.valid_until` is checked nowhere in the handler — an expired quote (where `quote.status='expired'` per the expiry cron) would fail the status guard, but a quote past `valid_until` with `status='sent'` would still be acceptable. The Phase 0.2 audit's F.4 surfaced this; Theme C may want to address explicitly.

### E.2 — Race condition: customer-accept vs operator-conversion

Phase 0.2 audit (`dcf511df`) F.7 surfaced this race: customer accepts the quote in their SMS link AT THE SAME MOMENT operator converts in POS via `/api/quotes/[id]/convert`.

**Current guard state (verified):**
- `convertQuote` rejects on `status === 'expired' || status === 'converted'` (`convert-service.ts:56-62`). It does NOT reject on `status === 'accepted'`.
- The accept handler rejects on `status NOT IN ('sent', 'viewed')` (`accept/route.ts:53-58`). It does NOT consider `'accepted'` an early-exit.

**Race window:**
- T0: Quote status='sent'.
- T1 (operator path): POS Convert calls `convertQuote` → creates appointment → updates quote to `'converted'` (`:194-201`).
- T1' (customer path, ~same instant): Customer Accept calls `accept` → updates quote to `'accepted'`.

The races interact via the row update. Postgres default isolation (READ COMMITTED) means whichever transaction commits second sees the other's effect. If operator's UPDATE wins first, quote is `'converted'`, but customer's UPDATE then overwrites it back to `'accepted'`. The appointment row from operator's path still exists, but the quote no longer references it via `quotes.converted_appointment_id` semantically (the customer's UPDATE doesn't touch that column, so the FK stays). Customer sees "accepted" success; operator sees their convert succeeded but the quote-detail UI is now confusingly in `'accepted'` state.

**Under AC-12 auto-conversion, this gets worse:** both paths call `convertQuote`, both try to INSERT an appointment for the same quote, both UPDATE `quotes.converted_appointment_id`. If both succeed, TWO appointments exist for one quote, with `converted_appointment_id` pointing at whichever wrote second.

**Implications for Theme C:** an explicit idempotency guard in `convertQuote` (or in the accept handler) is needed. Options: row-level lock on `quotes` (`FOR UPDATE`) at start of conversion; status-check-then-update with optimistic concurrency (UPDATE ... WHERE status IN ('sent','viewed') RETURNING — if 0 rows returned, abort); or a UNIQUE constraint on `quotes.converted_appointment_id` (already exists implicitly via FK semantics but doesn't prevent two appointments per quote).

### E.3 — Notification storm risk

- **Spam at the accept side:** the accept handler dispatches one staff SMS per call. If 10 customers accept in the same minute, 10 SMS dispatch — no batching. Per-template throttle isn't implemented.
- **Lifecycle engine duplicate alerts:** AC-12's SLA query (Target D.2) is dedup'd via `lifecycle_executions` (the engine's existing pattern). A pending appointment matched twice on consecutive cron passes would not re-alert if the prior execution row exists with `status IN ('pending', 'sent')`. This works structurally, but requires Theme C to wire the dedup correctly.
- **Cross-cutting:** if AC-12 also fires the existing `quote_accepted_staff_notify` template synchronously at accept time AND the SLA pass fires later, staff get two SMS for one customer-accept event with no relationship signal between them.

---

## Target F — Best-in-class assessment + integration approaches

### F.1 — Is the current customer-accept handler best-in-class?

| Dimension | Rating | Notes |
|---|---|---|
| Token security | acceptable | 56.8B combinations is ample; lack of expiration is forward concern (E.1) |
| Idempotency | acceptable | Status guard at `:52-58` prevents double-accept; idempotent under steady state |
| Error handling | acceptable | Each non-DB-write step is try/catch wrapped; non-blocking failures logged |
| Customer-facing UX post-accept | needs improvement | Customer goes dark; no portal page surfacing the pending quote/appointment; no scheduled-date tracker. Theme C consideration |
| Test coverage | unverified — recommend grep | Audit did not load tests; quote-service tests cover convertQuote but not the accept endpoint specifically |
| Logging | acceptable | Non-blocking failures use `console.error` with module prefix; SMS-delivery results stored in `quote_communications` |

### F.2 — AC-12 implementation: extend or refactor?

**(α) Extend existing handler** — add `convertQuote` call + SLA alert dispatch inside the accept handler.

- **Pros:** smallest code change; the handler stays the seam; clear single-file diff.
- **Cons:** handler grows from 227 to ~350+ lines; placeholder-strategy logic mixed with SMS dispatch; harder to unit-test in isolation; the staff-notification block at `:120-179` may now have two purposes (existing "you got a quote-accept" + new "auto-conversion happened — please schedule"). The two messages might want to be different templates or merged.

**(β) Refactor to orchestrator** — extract `processCustomerAccept(quoteId): Promise<{ quote, appointment, staffAlertResult }>` that handles all customer-accept side effects; the handler becomes a thin wrapper around it.

- **Pros:** testable in isolation; reusable from other paths (e.g., if a future "operator accepts on customer's behalf" surfaces); clear separation of policy (placeholder strategy, SLA scheduling) from HTTP concerns.
- **Cons:** more file movement; conventional refactor risk; if any existing path mistakenly forgets to call `processCustomerAccept` and writes directly to `quotes.status='accepted'`, the auto-conversion silently doesn't happen.

**(γ) Database trigger / function** — `AFTER UPDATE OF status ON quotes WHEN NEW.status='accepted'` fires a trigger that does the conversion.

- **Pros:** uniform side effect regardless of which code path updates `quotes.status='accepted'`; no application-level "remember to call X."
- **Cons:** DB triggers are harder to debug and version (already have the dormant `generate_quote_number()` precedent surfaced in Phase 3.0.1); placeholder-strategy logic in pl/pgSQL is awkward; SMS dispatch can't run in DB (would need NOTIFY-LISTEN or similar to wake an application worker); race-with-payment-path is harder to coordinate.

No clear winner; Theme C scope question. (β) appears closest to "best-in-class, no patch work" framing per the operator's principle, but Phase 0.2 audit's stated minimum scope (extend `POST /api/quotes/[id]/accept` to invoke `convertQuote`) implies (α) is acceptable. Theme C decides.

### F.3 — Schema migration scope

For AC-12 to fully meet its commitment, the following schema changes may be needed:

| Migration | Reason | Risk |
|---|---|---|
| `ALTER TYPE appointment_channel ADD VALUE 'customer_accept'` | Per C.3 — distinguish auto-converted appointments | Low (additive enum value; no breakage on existing readers) |
| `ALTER TABLE appointments ADD COLUMN scheduled_date_placeholder BOOLEAN DEFAULT false` (option ζ from B.3.a) | Distinguishes placeholder dates from operator-set ones; SLA queries filter on it | Low (additive column with default; existing readers ignore it) |
| `ALTER TABLE appointments ADD COLUMN staff_acknowledged_at TIMESTAMPTZ` | SLA defined as "no staff confirmation within N hours"; needs an explicit acknowledgment timestamp distinct from `updated_at` | Medium (every code path that "acknowledges" an appointment must set this — drift risk) |
| `INSERT INTO sms_templates (slug, recipient_type, ...) VALUES ('pending_appointment_sla_alert', 'staff', ...)` | New staff alert template | Low (seed migration) |
| `INSERT INTO lifecycle_rules` for the SLA rule | If using engine extension path (Target D) | Low (data migration) |

If chosen B.3 option is (ε) **migrate `scheduled_date` to nullable**, this is a higher-risk migration cascading across all readers. Audit did not enumerate readers; recommend a separate dedicated audit before committing to (ε).

---

## Target G — Open operator decisions

### G.1 — Placeholder strategy for scheduled_date / scheduled_start_time / scheduled_end_time

Six structural options surveyed (B.3.a (α)–(ζ)). The decision space:
- Keep NOT NULL with a placeholder strategy (α/β/γ/δ/ζ) — non-trivial choice but no schema migration
- Migrate to nullable (ε) — needs heavy reader audit first

Each option's trade-offs documented in B.3. No pre-resolution.

### G.2 — `convertQuote` integration: direct call vs new helper vs signature extension

Three options in B.4. No pre-resolution.

### G.3 — Channel enum strategy

Per C.3: add `'customer_accept'`, reuse `'online'`, or reuse `'portal'`. No pre-resolution.

### G.4 — SLA threshold value + escalation policy

AC-12 commitment text: "configurable threshold (initial value: 4 business hours)." Open subquestions:
- Should "business hours" be `business_settings.business_hours` (per-day open/close) or a separate config?
- Single threshold or multi-tier (e.g., 4h → SMS, 8h → SMS + email, 24h → owner phone call)?
- Does "no staff confirmation" mean status change OR any operator-side touch (viewed in POS, edited any field)?

No pre-resolution.

### G.5 — Schema columns needed

Per F.3. The minimum set:
- `appointment_channel`enum value (small)
- `scheduled_date_placeholder` (if option ζ)
- `staff_acknowledged_at` (if SLA needs explicit tracking distinct from `updated_at`)
- New SMS template seed

Operator picks which of these to include. No pre-resolution.

### G.6 — Customer-facing post-accept experience

Current state (per A.4) leaves customer dark after accept. Theme C scope question:
- Is the current "Thank you! We will contact you shortly" UX sufficient?
- Or should AC-12 surface the auto-created appointment to the customer (e.g., a portal page at `/my-appointments` showing pending status)?
- Should the customer SMS confirmation be updated to mention the pending appointment (e.g., "Quote accepted! Your appointment is being scheduled — expect a call from us within 24 hours")?

No pre-resolution.

### G.7 — Notification deduplication strategy

Per E.3:
- Should AC-12 introduce a staff-SMS rate-limiting layer (e.g., "batch SMS if more than N customer-accepts within M minutes")?
- Should the existing `quote_accepted_staff_notify` synchronous fire be SUPPRESSED in favor of letting the SLA cron alone handle staff notification (avoid double-fire at accept time + at threshold)?
- Or is the synchronous fire kept and the SLA alert is purely a "this slipped through" net?

No pre-resolution.

---

## File:line reference index

### Customer-accept endpoint

- `src/app/api/quotes/[id]/accept/route.ts:14-226` — full POST handler (227 lines)
- `src/app/api/quotes/[id]/accept/route.ts:23-25` — access_token validation
- `src/app/api/quotes/[id]/accept/route.ts:48-50` — token match check
- `src/app/api/quotes/[id]/accept/route.ts:52-58` — status guard (accepts from `'sent'`/`'viewed'` only)
- `src/app/api/quotes/[id]/accept/route.ts:61-70` — quote UPDATE (status='accepted', accepted_at, updated_at)
- `src/app/api/quotes/[id]/accept/route.ts:78` — `quote_accepted` webhook fire (silent no-op in prod)
- `src/app/api/quotes/[id]/accept/route.ts:80-118` — customer SMS dispatch
- `src/app/api/quotes/[id]/accept/route.ts:120-179` — staff SMS dispatch via `quote_accepted_staff_notify` template
- `src/app/api/quotes/[id]/accept/route.ts:181-216` — staff email dispatch
- `src/app/api/quotes/[id]/accept/route.ts:196, :210` — literal "Convert this quote to an appointment in POS" CTA copy

### Customer-facing accept UI

- `src/app/(public)/quote/[token]/accept-button.tsx:11-97` — full component
- `src/app/(public)/quote/[token]/accept-button.tsx:22-26` — POST to accept endpoint
- `src/app/(public)/quote/[token]/accept-button.tsx:43-49` — success state copy
- `src/app/(public)/quote/[token]/accept-button.tsx:55-78` — confirmation modal
- `src/app/(public)/quote/[token]/page.tsx` — 433-line public quote view (not deeply audited; render-only)

### convertQuote seam

- `src/lib/quotes/convert-service.ts:31-260` — full function
- `src/lib/quotes/convert-service.ts:24-29` — `ConvertQuoteOptions` (appointmentStatus, channel)
- `src/lib/quotes/convert-service.ts:56-62` — expired/converted-status guard
- `src/lib/quotes/convert-service.ts:67-71` — employee_id auto-assignment via `findAvailableDetailer`
- `src/lib/quotes/convert-service.ts:128-158` — appointment INSERT
- `src/lib/quotes/convert-service.ts:134-135` — status + channel defaulting
- `src/lib/quotes/convert-service.ts:194-205` — quote → `'converted'` + `converted_appointment_id` write
- `src/lib/quotes/convert-service.ts:255-257` — Session 1.7 conditional webhook gate (only fires for `'confirmed'`)
- `src/lib/utils/validation.ts:722-727` — `convertSchema` Zod definition

### Schema

- `docs/dev/DB_SCHEMA.md:148-210` — full `appointments` table
- `docs/dev/DB_SCHEMA.md:155` — `employee_id` (NULLABLE)
- `docs/dev/DB_SCHEMA.md:157` — `channel` (NOT NULL DEFAULT 'walk_in')
- `docs/dev/DB_SCHEMA.md:158-160` — `scheduled_date`, `scheduled_start_time`, `scheduled_end_time` (ALL NOT NULL, no defaults)
- `docs/dev/DB_SCHEMA.md:3225` — `appointment_channel` enum values
- `supabase/migrations/20260201000001_create_enums.sql:8` — `appointment_channel` enum definition
- `docs/dev/DB_SCHEMA.md:2078-2128` — full `quotes` table
- `docs/dev/DB_SCHEMA.md:2098` — `quotes.access_token` (TEXT, not unique)
- `docs/dev/DB_SCHEMA.md:2094` — `quotes.converted_appointment_id` FK
- `docs/dev/DB_SCHEMA.md:2123` — `idx_quotes_access_token` index

### Lifecycle engine

- `src/app/api/cron/lifecycle-engine/route.ts:1-1183` — full file
- `src/app/api/cron/lifecycle-engine/route.ts:50-191` — main GET handler with 5-phase execution
- `src/app/api/cron/lifecycle-engine/route.ts:107-138` — Phase 1 trigger handler dispatch
- `src/app/api/cron/lifecycle-engine/route.ts:114, :137` — `after_quote_accepted` rule handler
- `src/app/api/cron/lifecycle-engine/route.ts:534-578` — `scheduleFromQuoteAccepted` function
- `src/app/api/cron/lifecycle-engine/route.ts:158-172` — `SMS_MARKETING`/`EMAIL_MARKETING` flag gating
- `docs/dev/DB_SCHEMA.md:1252-1276` — `lifecycle_executions` table + dedup index
- `docs/dev/DB_SCHEMA.md:1283-1306` — `lifecycle_rules` table

### Business hours infrastructure

- `src/lib/data/business-hours.ts:1-48` — full helper file
- `src/lib/data/business-hours.ts:13-29` — `getBusinessHours()` reader
- `src/lib/data/business-hours.ts:31-48` — `isWithinBusinessHours()` predicate (PST-aware)

### Staff-notification mechanism

- `src/lib/sms/render-sms-template.ts:80-141` — template cache + `recipient_type`/`recipient_phones` resolution
- `docs/dev/DB_SCHEMA.md:2698-2699, :2707` — `sms_templates.recipient_type`/`recipient_phones` columns + CHECK
- `src/lib/sms/generated-contracts.ts:32-43` — existing staff_notify slugs (booking_staff_notify, quote_accepted_staff_notify, etc.)

### Webhook + receiver state

- `src/lib/utils/webhook.ts:7` — `quote_accepted` webhook event name
- Phase 0 webhook receivers audit `f5e714a8` (referenced; not loaded) — confirms all `fireWebhook` sites are silent no-ops in production

### Prior audits informing this one

- `docs/dev/QUOTE_TO_APPOINTMENT_CONVERSION_AUDIT.md` (Phase 0.2, `dcf511df`) — F.8 surfaced "customer accept does NOT auto-create appointment" gap; F.7 surfaced operator-vs-customer convert race
- `docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md` (Phase 0.1, `69b15b0f`) — context for agent-created appointment status patterns
- `docs/dev/WEBHOOK_RECEIVERS_IDENTITY_AUDIT.md` (post-Phase-0, `f5e714a8`) — confirms `quote_accepted` webhook fires no-op
- `docs/dev/STRIPE_WEBHOOK_PAYMENT_LINK_AUDIT.md` (Phase 3.0.2, `10421f23`) — payment-link infrastructure separate from quote accept; no shared customer UI today
- `docs/dev/NUMBERING_STRATEGY_AUDIT.md` (Phase 3.0.1, `249c2673`) — context for any identifier work AC-12 may touch

### Locked lifecycle architecture

- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:500-516` — AC-12 commitment text + current implementation scope
- `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:476-496` — AC-11 commitment (status semantic)

---

**End of audit.** This document is descriptive (Memory #29 type 3); it contains NO fix recommendations, NO implementation session plans, and NO operator-decision pre-resolutions. Phase 3 Theme C planning consumes these findings.
