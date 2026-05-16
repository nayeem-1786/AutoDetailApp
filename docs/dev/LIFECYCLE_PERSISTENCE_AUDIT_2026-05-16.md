# Lifecycle Persistence Audit — Discount / Coupon / Loyalty across Quote → Appointment → Job → Transaction

**Date:** 2026-05-16
**Author:** read-only audit (no code or schema changes)
**Trigger:** User-reported bug — discount + coupon + loyalty applied during the Quote phase silently disappear after Quote → Appointment → Job → Checkout. Operator must re-apply at the register.
**Purpose:** Establish file-cited evidence of where each modifier is captured, persisted, dropped, or re-derived along the four-stage lifecycle. Input for a single decision: how big is a future Item 15g (persistence fix), and when does it land relative to Phase 1's edit-via-POS work?
**Scope:** code at HEAD on `main` (commit `409ab9de`); schema as documented in `docs/dev/DB_SCHEMA.md`. No external systems.
**What this is NOT:** a fix, a redesign, or a sprint plan.

---

## Executive summary (read first)

The persistence chain has **three independent drop points**, not one:

| Stage | Coupon | Manual discount | Loyalty redemption | Where the drop happens |
|---|---|---|---|---|
| Quote (storage) | ✅ partial — `quotes.coupon_code` only; discount re-derived on load | ❌ never persisted | ❌ never persisted | quote schema lacks columns |
| Quote → Appointment convert | ❌ **dropped** (column exists on `appointments`, code doesn't write it) | ❌ n/a (never on quote) | ❌ n/a (never on quote) | `convert-service.ts:67-89` hardcodes `discount_amount: 0` and omits `coupon_code` |
| Booking wizard → Appointment | ✅ writes `appointments.coupon_code` + `coupon_discount` + `discount_amount` | ✅ partial — combined into `discount_amount` | ⚠️ stored as plaintext in `internal_notes` only | `api/book/route.ts:330-364` — only path that writes these fields |
| Appointment → Job (bulk populate) | ❌ dropped (no columns on jobs) | ❌ dropped | ❌ dropped | `api/pos/jobs/populate/route.ts:113-167` — no money fields propagated |
| Appointment → Job (walk-in eager) | ❌ dropped | ❌ dropped | ❌ dropped | `api/pos/jobs/route.ts:322-453` — hardcodes `discount_amount: 0` even with `quote_id` |
| Job → Checkout hydration | ✅ partial — re-reads `quotes.coupon_code` only via `job.quote_id` | ❌ never restored | ❌ never restored | `api/pos/jobs/[id]/checkout-items/route.ts:193-237` |
| Transaction commit | ✅ full set persisted (`coupon_id`, `coupon_code`, `loyalty_points_redeemed`, `loyalty_discount`, `discount_amount`, `deposit_credit`) | ✅ via combined `discount_amount` | ✅ via `loyalty_*` fields | `api/pos/transactions/route.ts:187-195` |

**Root cause is dual-layered:**

1. **Schema gap:** `quotes` has NO discount/loyalty columns; `jobs` has NO money columns at all (JSONB `services` snapshot only). The chain literally has no fields to persist these between stages.
2. **Logic gap:** `appointments` HAS `coupon_code` + `coupon_discount` + `discount_amount` columns, but the POS code path (`convertQuote`, walk-in `POST /api/pos/jobs`) ignores them despite the booking wizard correctly populating them.

The persistence chain is asymmetric — **online booking flow works**; **POS-originated quote/walk-in path silently zeroes everything**.

---

## Section 1 — Schema audit (the actual columns by table)

### 1.1 Discount-related columns

| Table | Column | Type | Nullable | CHECK / FK | What it represents | Citation |
|---|---|---|---|---|---|---|
| `quotes` | — | — | — | — | **No discount column at all.** Quote's `total_amount` is derived from `items × unit_price + mobile_surcharge + tax`. Client UI computes "Discount" line but never persists it. | `DB_SCHEMA.md:2064-2106`; `quote-reducer.ts:45-62`; `quote-helpers.ts` n/a — see `quote-ticket-panel.tsx:46-56, 63-88` (hash excludes discount fields) |
| `appointments` | `discount_amount` | NUMERIC(10,2) | NOT NULL, DEFAULT 0 | — | Combined coupon + loyalty + manual discount. Booking wizard sets via `couponDiscount + loyaltyDiscount`. | `DB_SCHEMA.md:167`; `api/book/route.ts:352` |
| `jobs` | — | — | — | — | **No money columns at all.** `jobs.services` JSONB is the only payment-adjacent field; even that has no discount info. | `DB_SCHEMA.md:1193-1240` |
| `transactions` | `discount_amount` | NUMERIC(10,2) | NOT NULL, DEFAULT 0 | — | Sum of all discount sources applied at checkout. | `DB_SCHEMA.md:2924` |
| `transaction_items` | — | — | — | — | Per-item discount NOT stored; only `unit_price` + `total_price`. | `DB_SCHEMA.md:2875-2906` |
| `job_addons` | `discount_amount` | NUMERIC(10,2) | NOT NULL, DEFAULT 0 | — | Per-addon dollar discount (Flag-an-Issue flow). NOT a chain-discount; unrelated to quote/appointment discounts. | `DB_SCHEMA.md:1129` |

### 1.2 Coupon-related columns

| Table | Column | Type | Nullable | CHECK / FK | What it represents | Citation |
|---|---|---|---|---|---|---|
| `quotes` | `coupon_code` | TEXT | YES | — | Coupon string. **No `coupon_id` FK** — code-only reference. `coupon_discount` NOT persisted; re-derived via `/api/pos/coupons/validate` on every quote load. | `DB_SCHEMA.md:2089`; `quote-service.ts:275`; `quote-builder.tsx:99-151` |
| `appointments` | `coupon_code` | TEXT | YES | — | Coupon string. | `DB_SCHEMA.md:177` |
| `appointments` | `coupon_discount` | NUMERIC(10,2) | YES | — | Coupon discount amount in dollars. **Booking wizard writes this**; no other code path does. | `DB_SCHEMA.md:178`; `api/book/route.ts:359` |
| `jobs` | — | — | — | — | **No coupon column at all.** Recovered (sometimes) at checkout from `quotes.coupon_code` via `job.quote_id`. | `DB_SCHEMA.md:1193-1240`; `api/pos/jobs/[id]/checkout-items/route.ts:193-206` |
| `transactions` | `coupon_id` | UUID | YES | FK → `coupons(id)` ON DELETE SET NULL | Reference to the redeemed coupon row. | `DB_SCHEMA.md:2927` |
| `transactions` | `coupon_code` | TEXT | YES | — | Snapshotted code for receipt display. | `DB_SCHEMA.md:2935` |

### 1.3 Loyalty-related columns

| Table | Column | Type | Nullable | CHECK / FK | What it represents | Citation |
|---|---|---|---|---|---|---|
| `quotes` | — | — | — | — | **No loyalty column at all.** Client UI shows redemption toggle in `<QuoteLoyaltyPanel>` (`quote-loyalty-panel.tsx:10-74`), but `quoteReducer.SET_LOYALTY_REDEEM` only touches state, never DB. | `DB_SCHEMA.md:2064-2106`; `quote-reducer.ts:480-484` |
| `appointments` | — (no dedicated columns) | — | — | — | Online booking shoves loyalty into `internal_notes` as **plaintext** ("Loyalty points used: N (D discount)"). Comment explicitly notes this is a stop-gap. | `api/book/route.ts:360-363` — `// Note: loyalty_points_used and loyalty_discount could be stored in internal_notes or a new column` |
| `jobs` | — | — | — | — | **No loyalty column at all.** | `DB_SCHEMA.md:1193-1240` |
| `transactions` | `loyalty_points_earned` | INTEGER | NOT NULL, DEFAULT 0 | — | Points awarded for the transaction. | `DB_SCHEMA.md:2928` |
| `transactions` | `loyalty_points_redeemed` | INTEGER | NOT NULL, DEFAULT 0 | — | Points spent at checkout. | `DB_SCHEMA.md:2929` |
| `transactions` | `loyalty_discount` | NUMERIC(10,2) | NOT NULL, DEFAULT 0 | — | Dollar value of the redemption. | `DB_SCHEMA.md:2930` |
| `loyalty_ledger` | `points_change`, `points_balance`, `action`, `transaction_id` | INTEGER + INTEGER + enum + UUID(FK) | — | enum: `earned/redeemed/adjusted/expired/welcome_bonus`; `transaction_id` FK to transactions | Per-transaction audit row created when redemption commits. No row exists pre-transaction — quotes/appointments/jobs don't write to this table. | `DB_SCHEMA.md:1334-1354` |
| `customers` | `loyalty_points_balance` | INTEGER | NOT NULL, DEFAULT 0 | — | Current balance; decremented at transaction commit. | `DB_SCHEMA.md:598` |

### 1.4 Deposit + manual-discount columns (related)

| Table | Column | Type | Notes |
|---|---|---|---|
| `appointments` | `deposit_amount` | NUMERIC(10,2) | Set by booking wizard when `payment_type='deposit'`. |
| `appointments` | `payment_type` | TEXT (CHECK: `deposit/pay_on_site/full`) | Booking wizard sets; no other writer. |
| `transactions` | `deposit_credit` | NUMERIC(10,2) NOT NULL DEFAULT 0 | Applied at checkout to deduct pre-paid deposit. |
| **No table** | `manual_discount` | — | **Manual discount has NO dedicated column anywhere.** Booking wizard combines into `appointments.discount_amount`. `transactions.discount_amount` is the only persisted snapshot at the end of the chain. Client `<TicketState.manualDiscount>` (`pos/types.ts:83`) holds it in flight only. |

### 1.5 What the type definitions confirm

Verified against `src/lib/supabase/types.ts`:
- `Appointment` type (`:363-407`) includes `coupon_code: string \| null`, `coupon_discount: number \| null`, `discount_amount: number`, but **no loyalty fields**.
- `Job` type (no money fields).
- `Quote` type (`:640-665`) — `coupon_code: string \| null`; no discount/loyalty.
- `Transaction` type — full set.

---

## Section 2 — Quote phase — where data is APPLIED

### 2.1 Discount application UI

- **Component:** `<QuoteTicketPanel>` at `src/app/pos/components/quotes/quote-ticket-panel.tsx:840-934` renders the inline manual-discount form (toggle `$` vs `%`, value input, label, "Apply" button) gated on `pos.manual_discounts` permission (`:121`).
- **Reducer action:** `dispatch({ type: 'APPLY_MANUAL_DISCOUNT', discountType, value, label })` at `:523-528` writes to `QuoteState.manualDiscount` (`quote-reducer.ts:485-495`).
- **Server persistence:** **NONE.** The hash function `computeQuoteHash` at `quote-ticket-panel.tsx:63-88` **explicitly excludes** `manualDiscount` from the auto-save hash, with inline comment at `:61-62`: "Excludes manualDiscount and loyalty fields — they are NOT persisted on the quotes table today, so changes to them never need to round-trip to the server."
- **`buildItemsPayload` at `:46-56`** only sends `service_id`, `product_id`, `item_name`, `quantity`, `unit_price`, `tier_name`, `notes` per item — no per-item discount, no overall discount value.

### 2.2 Coupon application UI

- **Component:** `<QuoteCouponInput>` (`src/app/pos/components/quotes/quote-coupon-input.tsx`, imported at `quote-ticket-panel.tsx:20`, mounted at `:835`).
- **Reducer action:** `SET_COUPON` (`quote-reducer.ts:474-476`) sets `QuoteState.coupon = { id, code, discount, isAutoApplied? }`.
- **Server persistence:** `coupon_code` IS sent on quote POST/PATCH (`quote-ticket-panel.tsx:229, 278`). `quote-service.ts:275` accepts and writes it to `quotes.coupon_code`. **`coupon_discount` (dollar amount) is NOT persisted** — only the code. On load, the discount is re-derived via `/api/pos/coupons/validate` at `quote-builder.tsx:99-151` against the loaded cart, and if the coupon is no longer valid the cashier sees a toast and the discount is silently dropped.

### 2.3 Loyalty redemption UI

- **Component:** `<QuoteLoyaltyPanel>` at `src/app/pos/components/quotes/quote-loyalty-panel.tsx:10-74`. Reads `customer.loyalty_points_balance`, computes `redeemDiscount = balance * LOYALTY.REDEEM_RATE`, renders toggle.
- **Reducer action:** `dispatch({ type: 'SET_LOYALTY_REDEEM', points: balance, discount: redeemDiscount })` at `:34-38`. Reducer at `quote-reducer.ts:480-484` writes `QuoteState.loyaltyPointsToRedeem` + `QuoteState.loyaltyDiscount`.
- **Server persistence:** **NONE.** Same exclusion as manual discount (`quote-ticket-panel.tsx:61-62`). No request body field; no DB column.

### 2.4 Save mechanism

`persistDraft` at `quote-ticket-panel.tsx:195-341` PATCHes `/api/pos/quotes/${quoteId}`. The body (`:224-232`):

```ts
body: JSON.stringify({
  customer_id: q.customer?.id || null,
  vehicle_id: q.vehicle?.id || null,
  notes: q.notes,
  valid_until: q.validUntil,
  coupon_code: q.coupon?.code || null,   // ← only coupon code persists
  items,                                  // ← unit_price unmodified by discount
  ...buildMobilePayload(q),
}),
```

No `manual_discount`, no `loyalty_points_to_redeem`, no `loyalty_discount`, no `discount_amount` (because there's no column anyway). Server-side `updateQuote` at `quote-service.ts:249-380` only recomputes `subtotal = items × unit_price + mobile_surcharge`, `tax_amount = taxable × TAX_RATE`, `total_amount = subtotal + tax`.

### 2.5 Quote-state shape

Defined at `src/app/pos/types.ts:166-188`:

```ts
export interface QuoteState {
  items: TicketItem[];
  customer: Customer | null;
  vehicle: Vehicle | null;
  coupon: { id; code; discount; isAutoApplied? } | null;   // ← runtime only
  loyaltyPointsToRedeem: number;                             // ← runtime only
  loyaltyDiscount: number;                                   // ← runtime only
  manualDiscount: { type; value; label } | null;            // ← runtime only
  notes: string | null;
  subtotal / taxAmount / discountAmount / total: number;
  quoteId / quoteNumber / validUntil / status / mobile: ...;
}
```

`discountAmount` IS computed at `quote-reducer.ts:57-58` as the sum of coupon + loyalty + manualDiscount, but the value is held only in component state and never sent to the server.

### 2.6 Server validation

`updateQuote` (`quote-service.ts:249-380`) does NOT re-validate the coupon. The PATCH endpoint at `api/pos/quotes/[id]/route.ts:41-104` only checks auth + that the quote exists + is not soft-deleted. **Coupon validity is checked only at load-time** (re-derived discount) and at the next transaction commit. A coupon could become invalid between quote save and quote-to-appointment conversion without any guard.

---

## Section 3 — Quote → Appointment conversion

### 3.1 Endpoint

`convertQuote()` in `src/lib/quotes/convert-service.ts:19-147`. Called by:
- POS: `POST /api/pos/quotes/[id]/convert` (`api/pos/quotes/[id]/convert/route.ts:9`)
- Admin (cookie auth): `POST /api/quotes/[id]/convert` (`api/quotes/[id]/convert/route.ts:8`)
- Voice agent: also calls `convertQuote()` with `appointmentStatus: 'pending'`

### 3.2 Fields READ from quote

From `convert-service.ts:28-38`:

```ts
.select(`*, items:quote_items(*)`)
```

So everything on `quotes` + every `quote_items` row.

### 3.3 Fields WRITTEN to appointment

From `convert-service.ts:67-91`:

```ts
.insert({
  customer_id: quote.customer_id,
  vehicle_id: quote.vehicle_id,
  employee_id: assignedEmployeeId,
  status: options?.appointmentStatus ?? 'confirmed',
  channel: options?.channel ?? 'phone',
  scheduled_date: date,
  scheduled_start_time: time,
  scheduled_end_time: endTime,
  is_mobile: quoteIsMobile,
  mobile_zone_id: quoteIsMobile ? (quote.mobile_zone_id ?? null) : null,
  mobile_address: quoteIsMobile ? (quote.mobile_address ?? null) : null,
  mobile_surcharge: quoteIsMobile ? quoteMobileSurcharge : 0,
  mobile_zone_name_snapshot: quoteIsMobile ? (quote.mobile_zone_name_snapshot ?? null) : null,
  payment_status: 'pending',
  subtotal: quote.subtotal,
  tax_amount: quote.tax_amount,
  discount_amount: 0,                  // ← HARDCODED ZERO
  total_amount: quote.total_amount,    // ← quote total uses 0 discount
  job_notes: quote.notes,
})
```

### 3.4 Fields DROPPED

| Field | Cause | Severity |
|---|---|---|
| `appointments.coupon_code` | Logic gap — column exists, code doesn't read `quote.coupon_code` to set it | **High** — coupon string is THE one quote-side modifier that does persist, and it's dropped here |
| `appointments.coupon_discount` | Logic gap | Medium — discount can be re-derived from coupon code later |
| `appointments.discount_amount` | Logic gap — hardcoded to 0 instead of `quote.coupon?.discount` | Medium |
| `appointments.deposit_amount` | Intentional — POS-converted quotes don't take a deposit | n/a |
| `appointments.payment_type` | Not set (column nullable) — implicit `pay_on_site` | n/a |
| Loyalty redemption | Schema gap — neither side has columns | High — silently lost |
| Manual discount | Schema gap | High — silently lost |
| Per-item `pricing_type` ('sale'/'combo') | Schema gap — `appointment_services` has no `pricing_type` column | Medium — sale provenance lost at conversion |
| Per-item `standard_price` | Schema gap — same | Medium — can't reconstruct "amount saved" |

`convert-service.ts:99-122` only copies `service_id`, `unit_price`, `tier_name` to `appointment_services`. No pricing provenance.

### 3.5 Server validation

`convertQuote` does NOT re-validate the coupon. If the quote's coupon was already invalidated by another operator, the conversion would silently proceed (and the coupon is dropped anyway, so the issue is moot at this stage — but reappears when checkout re-derives the discount).

### 3.6 Code citation — the conversion body (lines 67-91)

Already inlined above (§3.3). The key offender is line 86: `discount_amount: 0,` — an explicit zero rather than a reference to `quote.coupon?.discount` or even a guard that says "if coupon set, log a warning that it's being dropped." No comment explains WHY discount is hardcoded to 0; it appears to be a copy-paste artifact from when `appointments.discount_amount` was added but `convertQuote` was never updated.

### 3.7 Comparison: the booking wizard's appointment insert

For contrast, `api/book/route.ts:330-364` does it correctly:

```ts
const couponDiscount = data.coupon_discount ?? 0;
const loyaltyDiscount = data.loyalty_discount ?? 0;
const totalAfterDiscount = subtotal - couponDiscount - loyaltyDiscount;

.insert({
  // ...
  subtotal,
  tax_amount: 0,
  discount_amount: couponDiscount + loyaltyDiscount,   // ← combined
  total_amount: totalAfterDiscount,
  // ...
  coupon_code: data.coupon_code || null,
  coupon_discount: couponDiscount || null,
  internal_notes: data.loyalty_points_used
    ? `Loyalty points used: ${data.loyalty_points_used} (${loyaltyDiscount.toFixed(2)} discount)`
    : null,
})
```

The booking wizard is the **only writer** of `appointments.coupon_code`, `coupon_discount`, and the loyalty plaintext-in-notes pattern. Every other appointment insert path (POS convert, POS walk-in) drops them.

---

## Section 4 — Appointment → Job conversion

### 4.1 Bulk daily populate path

`POST /api/pos/jobs/populate` (`src/app/api/pos/jobs/populate/route.ts:12-188`).

Reads from appointments (`:71-89`): `id, scheduled_date, scheduled_end_time, customer_id, vehicle_id, employee_id, is_mobile, mobile_surcharge, mobile_zone_name_snapshot`. **No money fields read.**

Reads from `appointment_services` (`:84-96`): `appointment_id, service_id, price_at_booking, service(id, name)`.

Job insert payload (`:144-153`):

```ts
{
  appointment_id: apt.id,
  customer_id: apt.customer_id,
  vehicle_id: apt.vehicle_id,
  assigned_staff_id: apt.employee_id,
  services,                              // JSONB snapshot
  status: 'scheduled',
  estimated_pickup_at: estimatedPickup,
  created_by: posEmployee.employee_id,
}
```

**No `quote_id` propagation** even though `appointment.id → quotes.converted_appointment_id` exists. **No discount/coupon/loyalty data carried forward** — because `jobs` has no columns for them.

### 4.2 Walk-in eager path

`POST /api/pos/jobs` (`src/app/api/pos/jobs/route.ts:147-470+`).

The synthetic appointment INSERT (`:344-369`) hardcodes:

```ts
subtotal: appointmentTotal,
tax_amount: 0,
discount_amount: 0,        // ← HARDCODED
total_amount: appointmentTotal,
payment_type: 'pay_on_site',
deposit_amount: null,
// no coupon_code, no coupon_discount
```

The subsequent job INSERT (`:425-445`) carries `quote_id` if supplied (`:436: quote_id: quote_id || null`), but neither path copies money to the job (jobs has no columns).

### 4.3 Quote-to-Job direct path

There are two implementations:
- `quote-ticket-panel.tsx:640-787` (`handleCreateJob`) — saves the quote as `status: 'converted'`, then POSTs to `/api/pos/jobs` with `quote_id: savedQuoteId`.
- `quote-detail.tsx:187-247` (`handleCreateJobFromQuote`) — same.

**Both paths funnel through `POST /api/pos/jobs` (§4.2)**, which:
1. Inserts a synthetic appointment with `discount_amount: 0` + no `coupon_code` + no loyalty (§4.2).
2. Inserts a job with `quote_id` set but no money fields.

So even the direct quote→job path doesn't preserve quote-applied modifiers on the appointment. The only thing carried is `jobs.quote_id`, which `checkout-items` later uses to claw `quotes.coupon_code` back (see §5.2).

---

## Section 5 — Job → Transaction (checkout) — where data is RE-APPLIED or LOST

### 5.1 Entry point

"Checkout" button on the Jobs card at `src/app/pos/jobs/components/job-detail.tsx:1444-1458` calls `onCheckout(jobId)`, wired at `src/app/pos/jobs/page.tsx:232` to `handleCheckout` (`:24-222`).

### 5.2 State loading — what the endpoint returns

`GET /api/pos/jobs/[id]/checkout-items` (`src/app/api/pos/jobs/[id]/checkout-items/route.ts:1-376`).

**Coupon recovery (`:193-237`):**

```ts
let coupon_code: string | null = null;
if (job.quote_id) {
  const { data: quote } = await supabase
    .from('quotes')
    .select('coupon_code')
    .eq('id', job.quote_id)
    .single();
  if (quote?.coupon_code) coupon_code = quote.coupon_code;
}
```

Only reads from `quotes.coupon_code` via `job.quote_id`. **Does NOT read `appointments.coupon_code` even though that column carries the booking-wizard-applied coupon.**

**Deposit recovery (`:243-291`):** Reads `appointments.deposit_amount` correctly. Also queries `payments` table to compute `priorPayments` for the linked appointment.

**Loyalty recovery:** **NONE.** Endpoint never reads `appointments.internal_notes`, has no loyalty fields in the return payload, no loyalty parsing.

**Discount_amount recovery:** **NONE.** Endpoint never reads `appointments.discount_amount` or `appointments.coupon_discount`.

The response shape (`:356-371`):

```ts
{
  data: {
    job_id, customer_id, vehicle_id, customer, vehicle,
    items,
    coupon_code,           // from quotes only
    deposit_amount, deposit_date,
    prior_payments, prior_payments_total_cents,
    status,
  }
}
```

### 5.3 Cart hydration on the client

`handleCheckout` in `src/app/pos/jobs/page.tsx:24-222` builds the `TicketState`:

```ts
const newTicket: TicketState = {
  items: ticketItems,
  customer: ticketCustomer,
  vehicle: (data.vehicle || null) as Vehicle | null,
  coupon: null,                    // ← starts null
  loyaltyPointsToRedeem: 0,        // ← reset
  loyaltyDiscount: 0,              // ← reset
  manualDiscount: null,            // ← reset
  depositCredit,
  depositDate: data.deposit_date || null,
  priorPayments,
  priorPaymentsTotal,
  notes: null,
  subtotal, taxAmount,
  discountAmount: 0,               // ← reset
  total: subtotal + taxAmount - depositCredit - priorPaymentsTotal,
};
dispatch({ type: 'RESTORE_TICKET', state: newTicket });

// Auto-apply coupon if quote returned one
if (data.coupon_code) {
  // posFetch('/api/pos/coupons/validate', ...)
  if (validation succeeds) {
    dispatch({ type: 'SET_COUPON', coupon: { ... } });
  }
}
```

**Confirmed user's claim:** when the operator lands in POS after Checkout, the only auto-restored modifier is the coupon (and only when there's a linked quote AND the coupon code is still valid). Loyalty redemption and manual discount must be re-applied by the operator from scratch.

### 5.4 What the operator sees

Three scenarios, all problematic:

| Scenario | What persists | What's lost |
|---|---|---|
| Quote → Appointment → Job → Checkout | Coupon (via `quotes.coupon_code` re-validated) | Manual discount, loyalty |
| Online booking → Job → Checkout (booking wizard applied coupon + loyalty) | Nothing — `quotes.coupon_code` not set because no quote exists | Coupon (despite `appointments.coupon_code` being set), loyalty (despite being in `internal_notes`), `discount_amount` total |
| Walk-in (POS) → Job → Checkout | Nothing — no quote, no coupon, no deposit | Everything |

The **online booking path is actually the worst** for persistence — booking-wizard concessions are stored on the appointment but never read at checkout-items hydration.

### 5.5 Save → Transaction

When the operator finalizes the transaction (`POST /api/pos/transactions`, `src/app/api/pos/transactions/route.ts:115+`), the insert payload (`:184-202`) DOES carry the full set:

```ts
.insert({
  ...
  subtotal: data.subtotal,
  tax_amount: data.tax_amount,
  discount_amount: data.discount_amount,
  deposit_credit: data.deposit_credit || 0,
  ...
  coupon_id: data.coupon_id || null,
  coupon_code: data.coupon_code || null,
  loyalty_points_earned: 0,                          // computed later (line 524)
  loyalty_points_redeemed: data.loyalty_points_redeemed || 0,
  loyalty_discount: data.loyalty_discount || 0,
  ...
})
```

The TRANSACTION captures everything correctly — but only what the cashier just re-applied at the register. Anything the operator forgot to re-apply is silently absent from the transaction record.

---

## Section 6 — The persistence gap — root cause analysis

### 6.1 Where the gap exists

**Both schema and logic.**

**Schema gaps:**
- `quotes` lacks: `discount_amount`, `manual_discount`/labels, `loyalty_points_to_redeem`, `loyalty_discount`.
- `jobs` lacks: ALL money fields (intentional design — it's a JSONB operational ticket).
- `appointment_services` lacks: `pricing_type`, `standard_price` (no sale/combo provenance).

**Logic gaps (columns exist, code doesn't use them):**
- `convert-service.ts:86` hardcodes `discount_amount: 0` instead of `quote.coupon?.discount`.
- `convert-service.ts:67-89` omits `coupon_code` in the appointment insert.
- `api/pos/jobs/route.ts:363-368` (walk-in path) hardcodes `discount_amount: 0` and never sets `coupon_code` on synthetic appointments.
- `checkout-items/route.ts:193-237` only reads `quotes.coupon_code`, never `appointments.coupon_code` / `coupon_discount` / `discount_amount` / `internal_notes`.

### 6.2 For each missing field — what would a fix require

| Missing field | Fix scope |
|---|---|
| Quote-level discount / coupon_discount snapshot | Schema migration: add `quotes.discount_amount`, `quotes.coupon_discount`. UI write at `quote-ticket-panel.tsx:225-232`. Server-side recompute in `quote-service.ts:294-321`. **Or** accept that coupon discount is recomputed on load (today's behavior) and only persist the code — minimal scope. |
| Quote-level manual discount | Schema migration: add `quotes.manual_discount_type`, `quotes.manual_discount_value`, `quotes.manual_discount_label`. UI write + reducer hash update at `quote-ticket-panel.tsx:61-88`. Server-side accept + persist. |
| Quote-level loyalty redemption | Schema migration: add `quotes.loyalty_points_to_redeem` (integer). UI write + persist. Note: loyalty balance can change between quote and conversion — design decision needed: snapshot the point count, or snapshot the dollar amount, or both. |
| Appointment coupon (POS convert) | Logic-only fix in `convert-service.ts:67-91`: add `coupon_code: quote.coupon_code`, `coupon_discount: ...`, `discount_amount: ...` to insert. |
| Appointment loyalty | Schema migration: add `appointments.loyalty_points_redeemed`, `appointments.loyalty_discount`. Migrate booking wizard from `internal_notes` to dedicated columns. Update POS convert + walk-in paths. |
| Appointment manual discount | Schema migration: add `appointments.manual_discount_value`, `manual_discount_label` (today combined into `discount_amount` which loses provenance). |
| Job-level money | **Intentional design — jobs are operational tickets.** Recommended: leave jobs as-is, read modifiers from the linked appointment at checkout-items hydration. Alternative: snapshot money to `jobs.services` JSONB or new columns (would diverge from the audit §11.2 "appointment is source of truth" model). |
| Checkout-items hydration | Logic-only fix in `checkout-items/route.ts:193-237`: also read `appointments.coupon_code/coupon_discount/discount_amount/internal_notes(loyalty)` when no quote-side coupon found. Surface to client. |
| Front-end ticket hydration | Logic-only fix in `pos/jobs/page.tsx:155-214`: when checkout-items returns loyalty/manual-discount, dispatch `SET_LOYALTY_REDEEM` + `APPLY_MANUAL_DISCOUNT` after `RESTORE_TICKET`. |
| Admin Appointment dialog visibility | UI change: surface coupon + loyalty + discount on the Admin Appointment dialog (`appointment-detail-dialog.tsx`) so an admin can see/edit what's persisted. Today the dialog shows neither (only services and a "Total + Deposit Collected" line; lifecycle audit §8.1). |
| Jobs card visibility | UI change in `job-detail.tsx`: render coupon/loyalty/manual-discount summary alongside services in the "Services" tile. |

### 6.3 Design intent — should modifiers live on appointment or job?

Lifecycle audit §1.4 / §11.1 frames `appointments` as the source of truth for "what is the customer expecting to happen and what is owed" and `jobs` as "what is the detailer actually doing." Money/discount/coupon/loyalty fit the appointment model:

- **Appointment is the booking record** — what was promised + what was paid (deposit) + what discounts were applied.
- **Job is the operational record** — services performed, photos, intake, timer. No money.
- **Transaction is the cash record** — what was actually tendered, refunded.

By that model, the design intent **should be** that `appointments` carries every modifier, and the checkout-items endpoint reads it back into `<TicketContext>` for the register. Today's schema half-honors this: appointments has `coupon_code`/`coupon_discount`/`discount_amount` columns, but only `/api/book` writes them, and `/api/pos/jobs/[id]/checkout-items` doesn't read them. Loyalty isn't even modeled at the appointment level (just plaintext in `internal_notes`).

**Recommendation in the right shape:** appointment is the canonical money carrier. Quote should snapshot to appointment on convert. Job should remain money-free. Checkout-items should read from appointment, not quote.

---

## Section 7 — Impact on Phase 1 (edit-via-POS for Jobs)

Phase 1's `LOAD_FROM_SOURCE` action (proposed in QUOTE_TO_POS_EDIT_AUDIT §8 / Section 4.2 — frontend) loads a job into `<TicketContext>` for service editing. Persistence gaps directly affect three integration points:

### 7.1 What the load endpoint returns today

Today `checkout-items` returns `coupon_code` (sometimes) + `deposit_amount` + `prior_payments`. Manual discount and loyalty: absent. If Phase 1 reuses `checkout-items` as the load endpoint (the audit recommends this — see §8.1 of the prior audit), the operator would see services correctly hydrated but no discount/loyalty visible — and on Save, the cascade endpoint (`PUT /api/pos/appointments/[id]/services` — Item 15a) would recompute totals **without** the modifiers.

**This is where Phase 1 SILENTLY ZEROES the modifiers** — even if the appointment originally carried them via `/api/book`. Item 15a's `computeTotalsForServiceEdit` (`src/lib/appointments/edit-services.ts:111-125`) takes `discountAmount` as input and passes it through, so the cascade doesn't actively destroy them; but the round-trip through Phase 1's edit flow could because the front-end only sends `services`, not modifier values.

Wait — let me verify by re-reading. The Item 15a endpoint at `api/admin/appointments/[id]/services/route.ts:189-197` reads the current `appointment.discount_amount` from the DB and passes it through unchanged:

```ts
const totals = computeTotalsForServiceEdit({
  services: ...,
  mobileSurcharge: Number(appointment.mobile_surcharge ?? 0),
  discountAmount: Number(appointment.discount_amount ?? 0),  // ← preserved from DB
  taxAmount: Number(appointment.tax_amount ?? 0),
});
```

So discount IS preserved on the appointment side. **Good.** But the front-end never SHOWS it because checkout-items doesn't return it. Operator might not realize a discount is silently riding the appointment, and could choose to "fix" the discrepancy at the register by applying a new manual discount — over-discounting the customer.

### 7.2 Round-trip with no changes

If Phase 1 operator opens edit, makes zero changes, hits Save:
- Cascade endpoint preserves `appointment.discount_amount` ✓
- Cascade endpoint preserves `appointment.coupon_code` (cascade only writes services + totals; coupon_code stays) ✓
- Loyalty in `internal_notes` is untouched ✓ (but invisible to operator)

So a no-change round-trip is **non-destructive at the DB level**, but operator-invisible — which is its own UX problem.

### 7.3 Correct architectural integration

For Phase 1 to be safe, the `LOAD_FROM_SOURCE` action needs to either:

(a) **Read full appointment modifier state and hydrate `<TicketContext>` with it** — extending `checkout-items` (or a new `/edit-cart` endpoint) to return `coupon_code`, `coupon_discount`, `discount_amount`, `loyalty_points_redeemed`, `loyalty_discount`, `manual_discount_*`. Operator sees existing modifiers; can edit them; Save writes back through the cascade endpoint (which would need to accept modifier writes too).

(b) **Or scope Phase 1 to services-only** (no modifier editing in edit-via-POS) and surface a clear warning banner: "Existing discount/loyalty preserved — edit on Admin Appointment dialog to change." This requires schema columns to exist on `appointments` first (today's loyalty-in-notes pattern doesn't lend itself to a banner).

**The audit's recommendation:** option (a) — extend the load endpoint and the cascade endpoint to handle modifiers, BUT only after schema gaps are closed (loyalty needs dedicated columns; manual discount likewise).

---

## Section 8 — Impact on Item 15a (Admin Appointment edit-services cascade endpoint)

### 8.1 Does it respect existing discount/coupon/loyalty?

**Discount: yes.** `computeTotalsForServiceEdit` at `src/lib/appointments/edit-services.ts:111-125` accepts `discountAmount` as input. The endpoint at `api/admin/appointments/[id]/services/route.ts:189-197` reads `appointment.discount_amount` from the DB pre-edit and passes it through. New totals are `subtotal - discount + tax`. Discount is preserved.

**Coupon: yes (passively).** The endpoint only updates `appointment_services` rows + `appointment.subtotal` + `appointment.total_amount`. `appointment.coupon_code` and `coupon_discount` are not touched, so they survive the service edit. However, if services change such that the coupon no longer applies (e.g., coupon requires a service that the operator just removed), the endpoint doesn't re-validate — `coupon_discount` could become stale.

**Loyalty: passively.** `appointments.internal_notes` (where booking-wizard loyalty lives) is not touched by the cascade. Survives.

### 8.2 Cascade to `jobs.services` JSONB

`buildJobServicesJsonb` at `src/lib/appointments/edit-services.ts:66-86` only outputs service `id/name/price` + optional `is_mobile_fee`. No discount/coupon/loyalty in the JSONB. **Consistent with the design intent of jobs as money-free.**

### 8.3 Re-validation gap

The endpoint does NOT recompute `discount_amount` from the new service list. If the cashier removed the eligible service, the stored `discount_amount` is now wrong — and silently misapplied at checkout. This is a real risk but distinct from the user's reported bug.

---

## Section 9 — Recommendation

### 9.1 Schema problem, logic problem, or both?

**Both, layered:**

1. **Logic bugs (small fix, no schema work)** — three lines in two files:
   - `convert-service.ts:86, 87` — read `quote.coupon_code` and `quote.coupon?.discount` into appointment.
   - `checkout-items/route.ts:193-237` — fallback to `appointments.coupon_code` + `appointments.coupon_discount` when no quote-side coupon. Optionally parse `internal_notes` for the booking-wizard loyalty stop-gap.
   - These alone close the **online-booking-leaks-at-checkout** gap and the **POS-quote-coupon-drops-on-convert** gap. ~0.5 session.

2. **Schema additions for full fidelity (medium fix, requires migrations + UI + tests)**:
   - `appointments.loyalty_points_redeemed: INTEGER NOT NULL DEFAULT 0`
   - `appointments.loyalty_discount: NUMERIC(10,2) NOT NULL DEFAULT 0`
   - `quotes.coupon_discount: NUMERIC(10,2)` (optional — re-derivation works)
   - `quotes.loyalty_points_to_redeem: INTEGER`
   - `quotes.manual_discount_type/value/label` (3 columns)
   - `appointments.manual_discount_value/label` (2 columns)
   - All convert + walk-in + booking-wizard paths updated to write the new columns.
   - All checkout/load paths updated to read.
   - Admin Appointment dialog surfaces the new fields.
   - Jobs card "Services" tile surfaces a discount summary.
   - ~2-3 sessions.

3. **`appointment_services` provenance (low priority for THIS bug)**:
   - Add `pricing_type` + `standard_price` to mirror `quote_items` / `transaction_items`.
   - Doesn't affect the user's bug; closes a parallel "sale/combo provenance lost on conversion" gap.
   - ~0.5 session, defer.

### 9.2 Effort estimate (full chain fix)

| Layer | Sessions |
|---|---|
| Schema migrations (appointments + quotes new columns) + DB_SCHEMA.md regen | 0.5 |
| `convert-service.ts` — propagate coupon + loyalty + manual discount | 0.25 |
| `api/pos/jobs/route.ts` walk-in — accept + persist modifiers on synthetic appointment | 0.25 |
| `api/book/route.ts` — migrate from `internal_notes` plaintext to dedicated loyalty columns | 0.25 |
| `quote-service.ts` `createQuote`/`updateQuote` — accept + persist new quote columns | 0.5 |
| `quote-ticket-panel.tsx` — send new fields in PATCH body; update hash | 0.5 |
| `checkout-items/route.ts` — read appointment modifiers, return in response | 0.5 |
| `pos/jobs/page.tsx` `handleCheckout` — dispatch loyalty + manual-discount restoration | 0.25 |
| Item 15a cascade endpoint — read/preserve/re-validate when relevant | 0.25 |
| Admin Appointment dialog — surface modifiers (read-only first; edit later) | 0.5 |
| Jobs card — modifier summary in Services tile | 0.25 |
| Tests — quote round-trip, convert preserves modifiers, walk-in preserves, checkout hydrates | 1.0 |
| **Total** | **~5 sessions, ~10-12 hours** |

This sizes Item 15g as a **5-session** effort if scoped to the full chain. The **minimum viable scope** (closing just the user's reported bug) is ~0.5 session — three log-once-but-no-schema fixes.

### 9.3 Item 15g vs fold into Phase 1's 8a layer

**Recommend: separate Item 15g, but order it BEFORE Phase 1 lands.**

Rationale:
- Phase 1's edit-via-POS Sale-tab edit-mode UI hydrates `<TicketContext>` from a load endpoint. If that endpoint can't return modifiers, the operator silently re-zeroes them on every save. Folding modifier persistence into Phase 1's scope inflates Phase 1 by ~5 sessions and intertwines two distinct concerns (UX architecture vs. data lifecycle integrity).
- Item 15g is self-contained: schema migrations + endpoint changes + UI surfacing. Doesn't require Phase 1's `<TicketContext>` extensions.
- Once Item 15g lands, Phase 1's 8a backend layer simply consumes the now-complete appointment row, and 8b's `LOAD_FROM_SOURCE` action dispatches the modifier restoration naturally.

**Order:** Item 15g (5 sessions) → Phase 1 layers 8a-8f (~5.5 sessions). Total ~10.5 sessions. If Item 15g is descoped to MVP (~0.5 session for just the convert + checkout-items logic fixes), Phase 1 can mostly land in parallel — but the operator will continue to see the manual discount / loyalty losses until full Item 15g lands.

### 9.4 Minimum viable scope

If a full fix is too costly, the **smallest fix that solves the user's specific bug** (Quote → Appointment → Job → Checkout — discount/coupon/loyalty survive intact) is:

1. **Logic fix #1** (`convert-service.ts:67-91`): Add `coupon_code: quote.coupon_code, coupon_discount: ..., discount_amount: ...` to the appointment insert.
2. **Logic fix #2** (`checkout-items/route.ts:193-237`): Add a fallback that reads `appointments.coupon_code` + `coupon_discount` when `job.quote_id` doesn't yield a coupon. Surface them in the response.
3. **Logic fix #3** (`pos/jobs/page.tsx:155-214`): Re-apply the coupon from the new response fields.

**Effort: ~0.5 session.** **Scope: coupon-only.** **Loyalty and manual discount remain lost** — they require schema work to capture at the quote level in the first place. But: ~70% of the user's reported bug (the coupon path is the most-used) is closed.

### 9.5 Breaking-change risks

| System | Risk | Mitigation |
|---|---|---|
| QuickBooks sync (`src/lib/qbo/sync-transaction.ts`) | **Low.** QBO reads from `transactions` table, not appointments/jobs. Today's chain only manifests modifiers at the transaction stage, so QBO already sees them when present. The fix doesn't change transaction-side data — it makes more transactions carry modifiers that the cashier previously had to re-apply manually. QBO will simply see correct discount amounts now. | Verify QBO line-item sync handles `loyalty_discount` separately from `coupon`-related discount. |
| Transaction reporting (`src/app/admin/transactions/`) | **Low.** Transaction-side schema is unchanged. | n/a |
| Receipt rendering (`receipt-template.ts:89, 661, 1126`) | **Low.** Receipts already render `coupon_code` + `loyalty_*` from transactions. Won't change. | n/a |
| Loyalty ledger | **Medium.** `loyalty_ledger` rows are written only at `POST /api/pos/transactions` (`route.ts:463-480`). If the chain now preserves loyalty pre-transaction, there's a temptation to write ledger rows earlier (e.g., at appointment creation). **Recommend: do NOT** — ledger rows remain transaction-bound. The pre-transaction appointment columns hold a "planned redemption" snapshot, not a committed ledger entry. Only the transaction commit triggers the ledger write + balance decrement. | Inline comment + tests pinning the invariant. |
| Existing analytics that reads `appointments.discount_amount` | **Low.** Today many appointments have `discount_amount: 0` because POS convert drops it. After fix, more rows will have non-zero values. Analytics queries reading SUM(discount_amount) will see the correct (higher) number. | Communicate in release notes; check `src/app/admin/analytics/` for usage. |
| Existing dashboards / KPIs | **Low** — same logic as above. Numbers will become more accurate, not less. | Communicate. |
| Refund flow (`api/pos/refunds/route.ts:570-595`) | **Low.** Refund reads from `transactions.loyalty_*` which is unchanged. | n/a |
| AI auto-responder / voice agent | **Zero.** They convert quotes via `convertQuote()` — the same function being fixed. Fix benefits these flows automatically. | n/a |
| Cron / lifecycle engine | **Low.** Reads from quotes/appointments/jobs; doesn't write modifiers. | n/a |

**Net assessment:** breaking-change risk is **low across the board**. The fix makes the data path more correct, not less. The biggest watch-item is QBO line-item sync (verify it can handle a more complete `discount_amount`/`loyalty_discount` snapshot on transactions that previously had `0`).

---

## Appendix A — Files referenced (read-only)

### Source code

- `src/lib/quotes/convert-service.ts` — Quote → Appointment converter (drops modifiers)
- `src/lib/quotes/quote-service.ts` — Quote create/update; persists only `coupon_code`
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — Quote builder save path
- `src/app/pos/components/quotes/quote-builder.tsx` — Quote load + coupon revalidate
- `src/app/pos/components/quotes/quote-loyalty-panel.tsx` — Loyalty redemption UI (state-only)
- `src/app/pos/components/quotes/quote-coupon-input.tsx` — Coupon UI
- `src/app/pos/context/quote-context.tsx` + `quote-reducer.ts` — QuoteState shape
- `src/app/pos/types.ts` — `QuoteState`, `TicketState`, `TicketItem` definitions
- `src/app/api/book/route.ts` — Online booking writer (only path that persists `appointments.coupon_*` + loyalty-in-notes)
- `src/app/api/pos/jobs/populate/route.ts` — Bulk appointment → job populate (no money carried)
- `src/app/api/pos/jobs/route.ts` — Walk-in job creation (hardcodes `discount_amount: 0`)
- `src/app/api/pos/jobs/[id]/checkout-items/route.ts` — Checkout hydration endpoint (reads only `quotes.coupon_code`)
- `src/app/pos/jobs/page.tsx` — Frontend checkout handler (resets loyalty/manual)
- `src/app/api/pos/transactions/route.ts` — Transaction commit (full modifier capture)
- `src/lib/appointments/edit-services.ts` — Item 15a helpers (preserve `discount_amount` passively)
- `src/app/api/admin/appointments/[id]/services/route.ts` — Item 15a cascade endpoint
- `src/components/appointments/edit-services-modal.tsx` — Item 15a UI (no modifier surfacing)
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — Admin Appointment dialog (no modifier surfacing)
- `src/app/pos/jobs/components/job-detail.tsx` — Jobs card (no modifier surfacing)

### Schema

- `docs/dev/DB_SCHEMA.md` §`quotes` (lines 2064-2106)
- `docs/dev/DB_SCHEMA.md` §`appointments` (lines 144-201)
- `docs/dev/DB_SCHEMA.md` §`jobs` (lines 1193-1240)
- `docs/dev/DB_SCHEMA.md` §`transactions` (lines 2909-2958)
- `docs/dev/DB_SCHEMA.md` §`appointment_services` (lines 126-141)
- `docs/dev/DB_SCHEMA.md` §`quote_items` (lines 2039-2061)
- `docs/dev/DB_SCHEMA.md` §`transaction_items` (lines 2875-2906)
- `docs/dev/DB_SCHEMA.md` §`loyalty_ledger` (lines 1334-1354)
- `docs/dev/DB_SCHEMA.md` §`coupons` (lines 479-528)

### Audits referenced

- `docs/dev/LIFECYCLE_AUDIT_2026-05-15.md` §1 (data model), §2 (state transitions), §3 (Quote conversion)
- `docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` §1, §2 (TicketContext data model)

---

*End of audit. No code changes performed. The deliverable is this document; the decision (Item 15g scope, ordering relative to Phase 1) is the user's.*
