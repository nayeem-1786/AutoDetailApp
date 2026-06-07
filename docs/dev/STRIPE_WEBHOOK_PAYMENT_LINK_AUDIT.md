# Stripe Webhook + Payment-Link Infrastructure Audit (Phase 3.0.2)

**Audit identifier:** Phase 3.0.2 (foundational, read-only, descriptive)
**Audit type:** Targeted Component Behavior (Memory #29 type 3)
**Source-of-truth ref:** `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md` (v1.2)
**Informs:** [AC-11](QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md#ac-11-pending-vs-confirmed-semantic-enforcement-payment-driven) (Pending vs Confirmed semantic enforcement); Phase 3 Theme B detailing
**Verdict template:** descriptive only — no fix recommendations, no operator-decision pre-resolution

---

## Executive summary

Stripe is integrated through ONE webhook endpoint (`POST /api/webhooks/stripe`) and several discrete `paymentIntents.create` sites. The payment-link infrastructure already exists end-to-end and is product-shipped: operator UI (`SendPaymentLinkDialog` two-step with amount modal), POS server endpoint (`POST /api/pos/appointments/[id]/send-payment-link`), customer-facing token-based pay page (`/pay/[token]` Server Component + client `PayForm`), payment-intent creation endpoint (`POST /api/pay/[token]/intent`), and webhook-driven confirmation that writes a `transactions` + `payments` row pair and stamps `appointments.payment_link_paid_at`. The mechanism uses Smart Details' **own token-based pay flow** (random 16-char `payment_link_token` + the `/pay/[token]` page); it does NOT use Stripe's first-party `PaymentLink` object (`stripe.paymentLinks.create`). Payment is a standard `PaymentIntent` with metadata pinning back to the originating appointment.

Key findings relevant to AC-11:

1. **Appointment-status update path: missing on payment.** The webhook's `appointment_payment_link` branch updates `appointments.payment_status` to `'paid'` or `'partial'` based on the new payment, AND stamps `payment_link_paid_at`, AND clears `payment_link_amount_cents` — but **never reads or writes `appointments.status`**. A `status='pending'` appointment whose customer pays the link stays `status='pending'`. (Lifecycle doc line 472: "`confirmed` = deposit or full payment received...". For online booking this is enforced at create-time per `book/route.ts:559`. For payment-link payments arriving asynchronously via webhook, there is no equivalent post-payment status flip today.)

2. **Voice-agent tool surface: 13 tools at `src/lib/sms-ai/tools.ts:66-289`.** No payment-related tool (`send_payment_link`, `get_payment_status`, etc.) exists. The two voice agents (SMS AI v2 + Phone agent Tom) share this surface; appointments they create are hardcoded `status='pending'` at `voice-agent/appointments/route.ts:290` (quote-conversion branch) + `:516` (direct branch). Confirmed by the Phase 0.1 audit (`69b15b0f`) and re-verified in this audit.

3. **Webhook idempotency: per-PI lookup against `payments.stripe_payment_intent_id`.** No dedicated `stripe_events` dedup table exists. The pay-link branch's idempotency is enforced by `SELECT id FROM payments WHERE stripe_payment_intent_id = pi.id` and short-circuiting on hit (`route.ts:95-111`). The order branch idempotency is NOT enforced — duplicate `payment_intent.succeeded` for an order would re-run stock-decrement + customer-spend-update (`route.ts:249-353`). This is an existing gap, not introduced by AC-11.

4. **Test coverage:** the e-commerce order branch has 6 tests (`payment-intent-succeeded.test.ts`); the pay-link branch has **zero**; the `send-payment-link` endpoint has **zero**; the `/pay/[token]/intent` endpoint has **zero**. The pay-link branch carries non-trivial multi-table writes + error-rethrow-for-Stripe-retry semantics with no regression-lock.

5. **Payment-link Stripe metadata: `appointment_id` + `payment_link_token` ARE attached** (`pay/[token]/intent/route.ts:106-110`). The lookup-by-PI in the webhook works because of this metadata. AC-11 enforcement does NOT need metadata wiring — only the missing status-flip handler logic.

6. **Best-in-class assessment (E.1):** signature verification + per-PI idempotency + 500-rethrow-for-Stripe-retry on the pay-link branch are all best-in-class patterns. Gaps: missing dedup table for the order branch's idempotency; missing test coverage on the pay-link branch; missing post-payment status semantic. The operator's "no patch work" framing applies cleanly here — the architecture is sound; AC-11 extends rather than refactors.

AC-11 implementation scope **(Section D synthesis):** SMALL-to-MEDIUM. Two cleanly separable adds:
- Extend the existing webhook pay-link branch with an `appointments.status` flip when payment_intent.succeeded fires against a `status='pending'` appointment (E.2 question: deposit-or-full vs full-only).
- Add `send_payment_link` as the 14th voice-agent tool (likely a thin wrapper that invokes `POST /api/pos/appointments/[id]/send-payment-link` internally, since the existing endpoint is already complete).

The combination is well under "large/refactor" scope. Test gaps SHOULD be closed in the same Theme B session per the "no patch work" framing.

---

## Target A — Stripe webhook handler current state

### A.1 — Endpoint identity

- **File:line:** `src/app/api/webhooks/stripe/route.ts:19-386` (POST handler)
- **Route path:** `POST /api/webhooks/stripe`
- **HTTP methods accepted:** POST only (no GET / no others)
- **Public-internet-facing:** yes (signed by Stripe; no auth required beyond signature)
- **Total length:** 532 lines (the bottom 146 lines are the order-confirmation email HTML/text builder, not handler logic)

### A.2 — Signature verification

- **Mechanism:** `stripe.webhooks.constructEvent(body, signature, webhookSecret)` at `route.ts:29`
- **Signature header:** `request.headers.get('stripe-signature')` at `:21`; missing header → 400 with `{ error: 'Missing signature' }` at `:23-25`
- **Webhook secret env var:** `STRIPE_WEBHOOK_SECRET` (consumed at `:17` module-load time as `process.env.STRIPE_WEBHOOK_SECRET!`)
- **Failure path:** signature verification throws → caught at `:30-33`, logs `'Stripe webhook signature verification failed:'` + error, returns 400 with `{ error: 'Invalid signature' }`
- **Stripe SDK init:** `new Stripe(process.env.STRIPE_SECRET_KEY!)` at `:16` (module-load singleton)

### A.3 — Event subscriptions

| Event type | Handler location | Side effects |
|---|---|---|
| `payment_intent.succeeded` | `:38-356` | Three sub-branches via metadata inspection: |
| ↳ pay-link branch | `:63-244` | DB writes: `transactions` INSERT, `payments` INSERT (with card-detail enrichment), `appointments` UPDATE (`payment_link_paid_at`, `payment_link_amount_cents=NULL`, `payment_status`). Optional `stripe_payment_intent_id` UPDATE only when currently NULL (avoids overwriting deposit PI). |
| ↳ booking-deposit branch | `:42-57` | Log-only: looks up appointment by `stripe_payment_intent_id` and logs confirmation. The actual deposit insert is the synchronous booking route (`/api/book` writes `transactions` + `payments` rows at `route.ts:641, :851`); the webhook is a defense-in-depth confirmation log, not the writer. |
| ↳ e-commerce order branch | `:249-355` | DB writes: `orders` UPDATE (order_number generation, payment_status=paid, paid_at, stripe_charge_id), stock decrement loop per `order_items`, `stock_adjustments` INSERT per item, `coupons` `use_count++` if applicable, `customers` lifetime_spend + visit_count update. Fire-and-forget `sendOrderConfirmationEmail` (`:351-353`). |
| `payment_intent.payment_failed` | `:358-369` | Sets `orders.payment_status = 'failed'` if `metadata.order_id` present. No-op for booking deposits or pay-links. |
| `payment_intent.canceled` | `:371-382` | Sets `orders.payment_status = 'cancelled'` if `metadata.order_id` present. No-op for booking deposits or pay-links. |
| (others — `charge.refunded`, `payment_intent.requires_action`, etc.) | NOT subscribed | The `switch` has no default branch other than falling through to the 200 response (`:385`). Any other event type returns 200 with `{ received: true }` and is silently ignored. |

**Refund path note:** the explicit refund engine at `/api/pos/refunds/route.ts` calls `stripe.refunds.create` directly and writes back via the synchronous API response. The webhook does NOT process `charge.refunded` events, which means an asynchronous refund completion event from Stripe (e.g., for non-card payment methods, dispute-driven refunds) would be silently ignored.

### A.4 — Idempotency mechanism

**Dedup table:** none. `grep -rln "stripe_webhook_events\|stripe_event" supabase/migrations` returned zero matches. No `event.id`-keyed table exists.

**Per-branch idempotency analysis:**

1. **Pay-link branch (`:87-111`):** PROTECTED. Lookup `payments WHERE stripe_payment_intent_id = pi.id`; if found, log `pi_already_processed` and `break`. The `payments.stripe_payment_intent_id` column has a btree index (`DB_SCHEMA.md:1711` — `idx_payments_stripe`). Comment at `:87-94` documents this is per-PI not per-appointment (multi-link flows like deposit-then-balance issue distinct PIs against the same appointment).

2. **Booking-deposit branch (`:45-57`):** LOG-ONLY. No DB write; idempotent by construction (any number of identical events produce identical logs).

3. **E-commerce order branch (`:249-355`):** NOT PROTECTED. Re-running this branch on a duplicate event would:
   - Re-generate an order number (different each time — `generateOrderNumber` is monotonic) and overwrite `orders.order_number` (`:253-261`)
   - Re-decrement stock by the order quantities (stock would go below correct level)
   - Re-write `stock_adjustments` rows (duplicate audit rows)
   - Re-increment coupon `use_count` (over-counting)
   - Re-add to customer `lifetime_spend` + `visit_count` (over-counting)
   - Re-send confirmation email
   The order branch relies on Stripe NOT delivering duplicate events for the same `event.id` (Stripe documentation: at-least-once delivery; webhook endpoints SHOULD be idempotent). This is an existing gap, surfaced for documentation, NOT a finding introduced by AC-11.

4. **`payment_failed` / `canceled` branches:** idempotent at the UPDATE level (writing `payment_status='failed'` twice is benign).

### A.5 — Error handling

- **Success path:** returns `NextResponse.json({ received: true })` at `:385` with implicit 200.
- **Pay-link branch error path:** catches DB errors, logs structured `[Stripe Webhook] pay_link processing failed` with `payment_intent_id`, `appointment_id`, error message (`:237-241`), then **rethrows** (`:242` — `throw err`). The outer Next.js handler converts uncaught throw to 500 → Stripe retries the webhook per its standard exponential-backoff retry policy. This is the operator-stated intent (comment at `:242`: "rethrow → 500 → Stripe retries the webhook").
- **Order branch error path:** no try/catch wrapping the multi-step write. Any thrown error (DB error, stock-adjustment failure) propagates up and produces a 500. Stripe retries. But because the order branch is NOT idempotent (A.4 above), a retry after partial success risks the duplicate-write outcomes documented there.
- **Email send:** fire-and-forget with `.catch((err) => console.error(...))` at `:351-353`. Never blocks the 200 response.
- **Signature failure:** 400 (Stripe does NOT retry 4xx). Logs error.

### A.6 — Test coverage

- **Test file:** `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts` (257 lines, 6 tests)
- **Coverage:**
  - ✓ Stock decrement happy path (3-product order)
  - ✓ Decrement caps at 0 (no negative quantity)
  - ✓ Skips items with `product_id = null`
  - ✓ Booking-deposit PI (metadata.is_deposit) is a no-op for stock + order logic
  - ✓ Invalid signature returns 400
  - ✓ Missing signature header returns 400
- **Coverage gaps:**
  - ✗ Pay-link branch (`appointment_payment_link` metadata) — ZERO tests. The 60+ lines of pay-link logic at `:63-244` (transaction insert, payment insert, card-detail enrichment, appointment update with conditional PI-write, idempotency short-circuit) has no regression lock.
  - ✗ `payment_intent.payment_failed` event — no coverage
  - ✗ `payment_intent.canceled` event — no coverage
  - ✗ Order branch coupon increment + customer lifetime_spend update — not asserted (only stock + adjustments asserted)
  - ✗ Email send invocation — not asserted (mocked, but call wasn't verified)
- **Mock infrastructure:** Stripe SDK mocked with stub `constructEvent`; Supabase `from()` mocked with table-aware `select/update/insert` capture. The test infrastructure for the pay-link branch would need to extend `buildQuery` at `:61-99` to handle `appointments`, `transactions`, and `payments` tables with their query shapes.

---

## Target B — Payment-link infrastructure current state

### B.1 — Operator-facing surface

**Component:** `SendPaymentLinkDialog` at `src/components/jobs/send-payment-link-dialog.tsx:33-117` (117 lines total)

**Prop interface (`:8-25`):**
```typescript
interface SendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  amountDue: number;          // dollars, legacy fallback
  amountCents?: number | null; // cents, custom-amount selection
  onSent?: (result: { paymentLinkToken: string; payUrl: string }) => void;
}
```

**Mount site:** `src/app/pos/jobs/components/job-detail.tsx:1801-1832` — exclusively in the POS Jobs > Job Detail surface, gated on `job.appointment_id` (`:1775`).

**Operator UX flow (two-step):**
1. Operator presses a "Send Payment Link" button in `job-detail.tsx` → opens `PaymentLinkAmountModal` (`:1777-1800`) with `remainingCents` pre-filled.
2. Operator picks an amount (or accepts default = full remaining) → modal calls `onContinue(amountCents)` → records `selectedAmountCents` + opens `SendPaymentLinkDialog`.
3. `SendPaymentLinkDialog` wraps the generic `SendMethodDialog` primitive (`@/components/ui/send-method-dialog`) — operator picks Email / SMS / Both.
4. On submit, `handleSend(method)` at `:46-98` POSTs `/api/pos/appointments/{id}/send-payment-link` with `{ method, amount_cents? }`.
5. On success, calls `onSent({ paymentLinkToken, payUrl })`, shows toast `Payment link sent via {channels}`, surfaces any `partial_errors` array as warning toasts, sets `success=true` for 3 seconds, then auto-closes.
6. Parent `job-detail.tsx` clears `selectedAmountCents` and re-fetches the job (`:1828-1832`).

**Wrapper pattern:** the dialog is described in its own header comment as a `NotifyCustomerDialog`-pattern wrapper. Reuse via the shared `SendMethodDialog` primitive (Memory #2 component-reuse honored).

### B.2 — Server-side endpoint

**File:line:** `src/app/api/pos/appointments/[id]/send-payment-link/route.ts:44-388` (388 lines total)

**Request shape (`:54-85`):**
- URL param: `id` = appointment id
- Body: `{ method: 'email' | 'sms' | 'both', amount_cents?: number }`
- `amount_cents` is optional integer >= `STRIPE_MIN_AMOUNT_CENTS` (50)

**Response shape (`:374-380`):**
```typescript
{
  success: true,
  channels: { email?: 'sent'|'skipped'|'failed', sms?: 'sent'|'skipped'|'failed' },
  payment_link_token: string,
  pay_url: string,
  partial_errors?: string[],
}
```

**Auth/permission:**
- `authenticatePosRequest(request)` at `:49` — POS HMAC auth; 401 on failure (`:51`).
- No further per-permission gating (operator-trust boundary already passed at HMAC check).

**Validation chain (return-before-mutation):**
1. Method must be `email`/`sms`/`both` → 400 (`:58-63`)
2. `amount_cents` (if provided) must be integer >= 50 → 422 (`:71-83`)
3. Appointment must exist → 404 (`:106-108`)
4. Appointment NOT in `cancelled` / `no_show` → 409 (`:110-115`)
5. `payment_status != 'paid'` → 409 (`:116-121`)
6. Customer must exist → 422 (`:123-135`)
7. Requested channel has on-file address → 422 (`:138-150`)
8. Remaining balance > 0 → 409 (`:177-182`)
9. If `amount_cents` provided, must be `<= remainingCents` (server-side re-compute, never trusts client) → 422 (`:186-193`)

**Token generation (`:200-239`):**
- Reuses existing `payment_link_token` if set on the appointment (`:200`)
- Else mints 16-char `[A-Za-z0-9]` random token via `crypto.getRandomValues`
- Retry up to 3x on unique-violation against the partial unique index `appointments_payment_link_token_unique` (`DB_SCHEMA.md:202`)
- Race-safe via `UPDATE ... WHERE id = ? AND payment_link_token IS NULL` (the `is_null` guard means concurrent writers can't overwrite a winning token)

**Stamp on success (`:358-372`):**
- `payment_link_sent_at = NOW()`
- `payment_link_paid_at = NULL` (resets — the column means "is the CURRENT link paid?")
- `payment_link_amount_cents = chosenAmountCents` (NULL if caller omitted = legacy "use full remaining at pay time")
- Stamp errors are logged but don't fail the response (`:366-371` — customer-facing dispatch already succeeded)

### B.3 — Stripe API integration

**The send-payment-link endpoint itself does NOT call Stripe.** It generates a random token and persists state; the customer-facing pay page handles Stripe via a separate endpoint.

**Stripe call site:** `src/app/api/pay/[token]/intent/route.ts:102-112`
```typescript
const pi = await stripe.paymentIntents.create({
  amount: chargeCents,
  currency: 'usd',
  automatic_payment_methods: { enabled: true },
  metadata: {
    type: 'appointment_payment_link',
    appointment_id: appt.id,
    payment_link_token: token,
  },
  description: `${businessInfo.name} — Appointment ${appt.id.slice(0, 8)}`,
});
```

- **Stripe primitive:** `stripe.paymentIntents.create` (NOT `stripe.paymentLinks.create`; NOT `stripe.checkout.sessions.create`)
- **`automatic_payment_methods.enabled = true`** — Stripe surfaces all enabled payment methods (cards, ACH, Apple Pay, etc.)
- **`amount` is in cents** (integer); `chargeCents` derived from `appt.payment_link_amount_cents` (custom) or recomputed remaining (legacy full-balance), clamped to `remainingCents` defensively (`:88-91`)
- **Charge floor:** `STRIPE_MIN_AMOUNT_CENTS = 50` (from `src/lib/utils/money.ts`); endpoint returns 400 if `chargeCents < 50` (`:93-98`)

**Customer pays via:** `src/app/(public)/pay/[token]/page.tsx` (510 lines) — Server Component renders branded shell + `<PayForm clientSecret={...}>` client island. The client uses Stripe Elements (referenced via `clientSecret`) to confirm the PaymentIntent. Redirect-return URL pattern: Stripe redirects back to `/pay/{token}?redirect_status=succeeded`; page renders a "Processing" panel that polls for `payment_link_paid_at` (`:14-15` retry constants + processing-refresh component).

### B.4 — Metadata passed to Stripe

| Key | Set | Cite | Used by webhook? |
|---|---|---|---|
| `type` | `'appointment_payment_link'` | `pay/[token]/intent/route.ts:107` | YES — branch discriminator at `webhooks/stripe/route.ts:63` |
| `appointment_id` | `appt.id` | `pay/[token]/intent/route.ts:108` | YES — UUID-validated at `webhooks/stripe/route.ts:66`, looked up at `:74` |
| `payment_link_token` | the random token | `pay/[token]/intent/route.ts:109` | informational only (not currently read by webhook) |

**Booking-deposit metadata (separate path, `book/payment-intent/route.ts:28-35`):**
- `is_deposit: 'true'`
- `deposit_amount: amount.toString()`
- `total_amount: totalAmount?.toString()`
- Plus any caller-supplied `metadata` spread

The booking-deposit branch in the webhook uses metadata to ROUTE (`is_deposit === 'true'`) but does not write any state — actual writes happen synchronously from the booking route. The `appointments.stripe_payment_intent_id` link is established by the booking route at `book/route.ts:641, :851`.

**E-commerce order metadata:** `metadata.order_id` is the route key in the webhook. Not in scope for AC-11 (orders are out-of-scope for the Quote → POS lifecycle).

**Critical observation for AC-11:** the metadata wiring for the pay-link path is ALREADY complete. `appointment_id` is always present on `appointment_payment_link` PIs. The webhook can route by metadata and look up the appointment — that infrastructure exists. **AC-11 does NOT need to add metadata; only behavior on the looked-up appointment.**

### B.5 — Customer-facing dispatch

**Email branch (`send-payment-link/route.ts:268-292`):**
- Template: `payment_link_sent`
- Sender: `sendTemplatedEmail(customer.email, 'payment_link_sent', vars)` from `@/lib/email/send-templated-email`
- Vars: `first_name?`, `amount_due` (formatted dollars chip), `pay_url`, `scheduled_date`, `scheduled_time`
- Success requires `result.usedTemplate && result.success` — if the template isn't customized OR send fails, marks `channels.email = 'failed'` and records error message

**SMS branch (`:295-333`):**
- Template slug: `payment_link_sent` (slug shared with email by convention)
- SMS contract at `src/lib/sms/sms-contracts.source.ts:225-228`:
  ```
  required: ['amount_due', 'pay_url']
  optional: ['first_name']
  ```
- Engine: `renderSmsTemplate('payment_link_sent', vars, fallback)` — produces template-driven body OR falls back to a hardcoded `Hi {first_name}, Your {business.name} payment link for ${amount_due}: {pay_url}`
- `isActive=false` (template disabled) → `channels.sms = 'skipped'` + error
- `sendSms(customer.phone, rendered.body, { source: 'transactional', notificationType: 'payment_link_sent', contextId: appt.id })`

**At least one channel must succeed (`:335-349`):**
- `sentCount === 0` → 500 with full error array
- `sentCount >= 1` → 200 with `channels` and optional `partial_errors`

### B.6 — Status updates after payment

This is the central AC-11 question. **Current state:**

When customer pays via the link, the webhook's pay-link branch executes (`webhooks/stripe/route.ts:63-244`). Its DB writes are:

1. **`transactions` INSERT** (`:149-167`): full transaction row with appointment_id, customer_id, vehicle_id, status='completed', subtotal=appt.total_amount (full appointment total, NOT the link's charge amount), tax/tip/discount=0, total_amount=link's charge amount, payment_method='card', notes=`Online payment link. PI: {pi.id}`.

2. **`payments` INSERT** (`:187-198`): one payment row with `transaction_id`, method='card', amount=charge dollars, tip=0, `stripe_payment_intent_id=pi.id`, card_brand + card_last_four extracted via Stripe Charge round-trip.

3. **`appointments` UPDATE** (`:213-225`):
   ```typescript
   {
     payment_link_paid_at: NOW,
     payment_link_amount_cents: NULL,    // link is consumed
     payment_status: newPaymentStatus,    // 'paid' or 'partial'
     stripe_payment_intent_id: pi.id,     // ONLY when currently NULL (preserves deposit PI link)
   }
   ```

**What is NOT updated:** `appointments.status`. There is NO statement reading or writing the `status` column on this code path.

**Concrete AC-11 gap:** the lifecycle doc commitment at line 472 is "`confirmed` = deposit or full payment received via online booking, or operator manually confirms after collecting payment." Online booking is enforced at `book/route.ts:559` (`initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'`) — synchronous, at row-create-time. For payment-link payments arriving asynchronously via this webhook, the analogous flip is missing. A `status='pending'` appointment whose customer pays via the link gets `payment_status='paid'` but stays `status='pending'`, leaving the appointment in a logically inconsistent state per the AC-11 semantic.

**TODO marker:** `:231` carries `// TODO(payment-link-session-3): send payment_link_paid notification` — a separate notification gap, NOT the status-flip gap.

### B.7 — Test coverage

- **`send-payment-link/route.ts` test file:** does NOT exist. Grep `find src/app/api/pos/appointments -path '*send-payment-link*' -name "*.test.ts"` returns empty.
- **`pay/[token]/intent/route.ts` test file:** does NOT exist. Grep `find src/app/api/pay -name "*.test.ts"` returns empty.
- **`pay/[token]/page.tsx` test file:** does NOT exist.
- **Webhook pay-link branch test:** does NOT exist (see A.6). The existing test file covers only the e-commerce order branch + signature failures.

The pay-link infrastructure ships untested. The TypeScript types + the Memory #11 hot-grep-friendly structure provide some safety, but the multi-table-write semantics (idempotency + amount math + status updates + card-detail enrichment + token generation race-safety) have no regression lock.

---

## Target C — Voice-agent tool surface

### C.1 — Current tool inventory

**Tool registry file:** `src/lib/sms-ai/tools.ts:66-289`, **13 tools**:

| # | Tool name | Defined at | Maps to endpoint |
|---|---|---|---|
| 1 | `lookup_customer` | `:66` | `/api/voice-agent/customers` |
| 2 | `get_services` | `:81` | `/api/voice-agent/services` |
| 3 | `classify_vehicle` | `:97` | `/api/voice-agent/vehicle-classify` |
| 4 | `check_availability` | `:112` | `/api/voice-agent/availability` |
| 5 | `create_appointment` | `:135` | `/api/voice-agent/appointments` |
| 6 | `send_info_sms` | `:157` | `/api/voice-agent/send-info-sms` |
| 7 | `get_products` | `:178` | `/api/voice-agent/products` |
| 8 | `get_product_details` | `:187` | `/api/voice-agent/products/details` |
| 9 | `notify_staff` | `:199` | `/api/voice-agent/notify-staff` |
| 10 | `send_quote_sms` | `:229` | `/api/voice-agent/send-quote-sms` |
| 11 | `approve_addon` | `:257` | (POS addon endpoint) |
| 12 | `decline_addon` | `:273` | (POS addon endpoint) |
| 13 | `upsert_customer` | `:289` | `/api/voice-agent/customers` (POST) |

**Phase 0.1 audit count confirmed: 13 tools.** No drift since the audit.

**Endpoint count cross-check:** `find src/app/api/voice-agent -name "route.ts"` returns 14 route files. The discrepancy is:
- `context/route.ts` — initiation-time data hydration (not a tool; populates ElevenLabs `dynamic_variables` per `initiation/route.ts`)
- `initiation/route.ts` — ElevenLabs initiation webhook (not a tool, called by ElevenLabs on call ring)
- `finalize-call/route.ts` — call-end cleanup (not a tool, called when call ends)
- `products/details/route.ts` — tool #8 (`get_product_details`)

So tools = 13; "endpoints under `/api/voice-agent`" = 14. Both numbers are correct under their respective definitions; Phase 0.1's "13-tool surface" framing is the architecturally relevant one (these are the LLM-callable surfaces).

**The Phone agent Tom (ElevenLabs)** consumes the same 13 tools via ElevenLabs' webhook-tool mapping at the LLM config layer (not in this codebase). Both agents converge on the same server primitives — confirmed by Phase 0.1 audit.

### C.2 — Tool implementation pattern

**Tool definition shape (`tools.ts:66-77`, lookup_customer example):**
```typescript
{
  name: 'lookup_customer',
  description: '...natural language description...',
  input_schema: {
    type: 'object',
    properties: { phone: { type: 'string', description: '...' } },
    required: ['phone'],
  }
}
```

- **Tool definitions are static** Anthropic SDK tool-use schema objects (consumed by `runSmsAiV2Agent`)
- **Tool dispatch** happens in `src/lib/sms-ai/` (the `runSmsAiV2Agent` 6-iteration loop per Phase 0.1 audit) by name → matching internal handler that calls the corresponding HTTP endpoint
- **Endpoints validate inputs** independently of the tool schema (defense-in-depth; tool schemas are agent hints, the server is the trust boundary)

**Phone agent (Tom) pattern:** ElevenLabs maps tool names to HTTP endpoints via its UI configuration. Each tool call → outbound HTTPS POST to our endpoint with `validateApiKey` auth. Auth via API key (NOT POS HMAC — voice agents have their own credential). Endpoints under `/api/voice-agent/*` use `validateApiKey()` from `@/lib/auth/api-key` (verified in `initiation/route.ts:26`).

### C.3 — Existing payment-related tool?

**Greps:**
- `grep -rln "send_payment_link" src/` → only `src/app/admin/messaging/components/message-bubble.tsx` (admin UI label), `src/lib/sms-ai/system-prompt.ts` (template reference), `src/app/api/voice-agent/send-info-sms/route.ts` (unrelated). **NO tool definition.**
- `grep "name: 'payment" src/lib/sms-ai/tools.ts` → no matches.
- `grep "payment_link\|stripe" src/lib/sms-ai/tools.ts` → no matches.

**Verdict:** no existing payment-related voice-agent tool. The 14th tool slot is fully greenfield. The cleanest reuse pattern is wrapping the existing `POST /api/pos/appointments/[id]/send-payment-link` endpoint (which is auth'd by POS HMAC and assumes operator-trust context); a voice-agent variant would need either (a) a new `/api/voice-agent/send-payment-link` route that uses `validateApiKey` instead of `authenticatePosRequest`, or (b) extending the existing endpoint to accept either auth method. Both options are surfaced as F.1 below — not pre-resolved.

---

## Target D — Integration analysis for AC-11

### D.1 — The 14th tool (send payment link)

**Reuse surface inventory:**
- The token-generation + race-safe persistence + email/SMS dispatch + `payment_link_sent_at` stamp logic is ALL in `send-payment-link/route.ts` (388 lines).
- Token-by-token Stripe PaymentIntent creation is in `pay/[token]/intent/route.ts` (129 lines).
- Customer-facing pay page renders via `pay/[token]/page.tsx` (510 lines).
- Webhook reconciles via the pay-link branch (`webhooks/stripe/route.ts:63-244`).

**For a voice-agent tool to send a payment link, the integration approach choices are:**

- **Option (i) — new `/api/voice-agent/send-payment-link` route that internally calls the same primitives.** Mirrors the `send-quote-sms` / `send-info-sms` pattern (those are voice-agent-auth'd siblings that wrap shared sender logic). Pros: clean auth separation (each endpoint maps cleanly to ONE auth method); per-channel observability via distinct route paths; mirrors existing voice-agent endpoint shape. Cons: ~50-80 lines of code duplication for the orchestration shell unless extracted into a shared helper.
- **Option (ii) — extend `send-payment-link/route.ts` to accept either POS HMAC OR voice-agent API key.** Smaller diff. Cons: auth branching inside the route; mixed semantics; new caller would still need its own decision around whether amount_cents is computable agent-side or always omitted (full-remaining).
- **Option (iii) — extract a `lib/payment-link/send.ts` helper** that both a POS route and a voice-agent route call. Pros: zero duplication. Cons: introduces a new helper; the existing `send-payment-link/route.ts` is already pretty thin glue over `sendSms` + `sendTemplatedEmail` + token logic, so the extraction win is moderate.

**Not recommending; surfacing F.1 below.**

### D.2 — Post-payment status update path

**The question:** when the webhook's pay-link branch processes a `payment_intent.succeeded` for an `appointment_payment_link`-type PI, should it flip `appointments.status` from `'pending'` to `'confirmed'`?

**Webhook handler shape proposals (surfaced for discussion, not recommendation):**

- **Branch A — always flip on payment.** Read `appt.status` in the same lookup that already happens at `:74-78`. If `status === 'pending'`, write `status = 'confirmed'` in the same `apptUpdate` payload at `:213-225`. Idempotent (re-running the same UPDATE is benign; the per-PI dedup at `:106-111` already short-circuits the entire branch).
- **Branch B — flip only on full-payment.** Same as A but gated on `newPaymentStatus === 'paid'`. A partial-deposit link payment wouldn't auto-confirm. Operator decision F.3 below.
- **Branch C — flip only if appointment was created by a non-online channel.** Read `appointments.channel`; auto-confirm only when `channel IN ('sms', 'phone')` (the AC-11 gap path). The online channel is already correct via the synchronous booking route.

The webhook context has all the data it needs for any of the above (the appointment SELECT at `:74-78` returns `customer_id, vehicle_id, total_amount, payment_status, payment_link_paid_at, stripe_payment_intent_id`; extending the SELECT to include `status, channel` is a one-column-list edit). State-machine transition check (`src/lib/appointments/status-transitions.ts`) would need to be honored — but `pending → confirmed` is one of the canonical safe transitions per AC-1 and the state machine audit (`b0efd95f`).

**Idempotency on the status flip:** the per-PI dedup at `:106-111` short-circuits the ENTIRE pay-link branch on Stripe-retry duplicates. So a re-fired event for the same PI is already protected. The only way the status flip could fire twice is via the multi-link flow (deposit-then-balance link, distinct PIs) — and in that case the second flip is a no-op (pending → confirmed already happened on the first; confirmed → confirmed is benign at the UPDATE layer).

**Race condition: operator manual confirm + customer pays.** If operator presses "Confirm" on the appointment before/while customer pays:
- Pre-payment manual confirm: status already `confirmed`; the webhook's `pending → confirmed` flip is a no-op (idempotent UPDATE).
- Concurrent: standard SQL UPDATE semantics; whichever lands second wins (both writing `confirmed` → idempotent).
- Operator pre-confirms PENDING via a non-payment action AND customer pays differently (Terminal, cash, etc.): webhook's flip is still a no-op because the manual confirm already moved status.

No new race surface introduced by AC-11.

### D.3 — Voice-agent status pin removal

Phase 0.1 audit identified hardcoded `'pending'` at two voice-agent sites:
- `voice-agent/appointments/route.ts:516` (direct branch — agent creates appointment from scratch)
- `voice-agent/appointments/route.ts:290` (quote-conversion branch — via `convertQuote(... { appointmentStatus: 'pending' })`)

After AC-11 wiring, the options are:

- **Option α — Continue hardcoding `'pending'`; let webhook flip to `'confirmed'` on payment receipt.** Agents that successfully convince a customer to pay via the link will see the appointment flip to `confirmed` ~seconds later (Stripe webhook delivery latency, typically < 1s). Agents that close the call without payment leave the appointment at `'pending'` — semantically correct per AC-11.
- **Option β — Read an explicit payment-collected flag in the agent's call payload, set `confirmed` accordingly.** Requires the agent's tool call to include a `payment_collected` boolean (which the voice agent would derive from a `get_payment_status` tool — that tool doesn't exist either, and conflicts with the async webhook-driven status updates).
- **Option γ — Set `'confirmed'` only if a non-zero deposit was collected in the same flow.** Currently impossible because the voice-agent appointment-create endpoint doesn't take a `deposit_amount` parameter or interface with Stripe at all (see `voice-agent/appointments/route.ts:507-535`).

Option α is the simplest fit with the existing pattern; the webhook is the single source of truth for the pending → confirmed transition driven by payment. Options β and γ require parallel infrastructure (new tools, new payment-collection-in-agent-call semantics). Not recommending; surfacing F.3 below.

### D.4 — Risk surface

- **Stripe SDK version drift:** SDK is initialized as `new Stripe(process.env.STRIPE_SECRET_KEY!)` with no `apiVersion` pin (verified at `webhooks/stripe/route.ts:16`, `pay/[token]/intent/route.ts:8`, `book/payment-intent/route.ts:6`, etc. — all share the same un-pinned init). Upgrading the `stripe` npm package may bump the default API version and change webhook event shapes. The Stripe webhook handler does NOT pin `Stripe-Version` on outbound init calls either. **Surfaced finding, not introduced by AC-11.**
- **Webhook signing-secret rotation:** `STRIPE_WEBHOOK_SECRET` is consumed at module load (`route.ts:17`) — rotation requires app restart. **Surfaced finding, not introduced by AC-11.**
- **Race: operator manual confirm + customer pays:** analyzed in D.2; no new surface.
- **Customer pays, then cancels deposit (Stripe Pre-Auth) before capture:** the pay-link path uses `automatic_payment_methods` + immediate `paymentIntents.create` (no pre-auth + capture step). The PI succeeds OR fails synchronously from the customer's POV. Refund-after-success is the only undo path, which uses the standalone refund engine (`/api/pos/refunds`). The webhook doesn't process `charge.refunded` events (A.3), so an asynchronous refund completion would NOT auto-reverse the appointment's status. **Surfaced finding for F.4 / Theme B scoping.**
- **Customer abandons payment link, never pays:** appointment stays at whatever status it was created with (typically `'pending'`); `payment_link_token` persists indefinitely. No expiration mechanism for tokens. **Surfaced finding for F.4 (token TTL question).**
- **Multi-link flow (deposit-then-balance):** the pay-link branch is per-PI idempotent (A.4) but doesn't prevent the operator from sending a SECOND link for the same appointment before the first is consumed (the send route at `send-payment-link/route.ts:200-228` reuses the existing token and would clear `payment_link_paid_at` and overwrite `payment_link_amount_cents`). Two links pointing at the same token but with different chosen amounts could cause confusion if the customer pays the older link's URL after a new amount was set. **Surfaced finding, NOT a hard bug because the underlying PaymentIntents are distinct — but UX-relevant.**

---

## Target E — Best-in-class assessment

Per the operator's "invest the time NOW, no patch work" framing.

### E.1 — Stripe webhook handler best-in-class assessment

| Dimension | Rating | Evidence |
|---|---|---|
| Signature verification | ✅ best-in-class | `stripe.webhooks.constructEvent` at `:29`; missing header → 400 (`:23-25`); invalid sig → 400 (`:30-33`). Stripe does not retry 4xx — correct semantic. |
| Idempotency (pay-link) | ✅ best-in-class | Per-PI `payments` lookup at `:95-111`; indexed column (`idx_payments_stripe`); structured-log on hit; safe under Stripe-retry storms. |
| Idempotency (e-commerce order) | ⚠️ needs improvement | No dedup. Duplicate event → double stock decrement + double customer-spend increment + duplicate audit row + reissued order number. Not introduced by AC-11; surfaced for Theme B's "best-in-class" scoping. |
| Idempotency (deposit branch) | ✅ acceptable (log-only) | No DB write; safe by construction. |
| Error handling (pay-link) | ✅ best-in-class | Structured logs, rethrow → 500 → Stripe retry per Stripe-recommended pattern (`:236-243`). |
| Error handling (order) | ⚠️ acceptable | Errors bubble to 500; Stripe retries; but A.4 non-idempotency means retry compounds failure. |
| Logging | ✅ acceptable | Structured `console.log` and `console.error` with PI id + appointment id in pay-link path. No central observability hook (e.g., Sentry, Datadog) but at the operator's deployment scale, console-to-Hostinger-logs is acceptable. |
| Test coverage (order branch) | ✅ acceptable | 6 tests cover the happy path + edge cases. |
| Test coverage (pay-link branch) | ❌ missing | Zero tests on 60+ lines of multi-table-write logic. Theme B should close. |
| Test coverage (other events) | ⚠️ needs improvement | `payment_failed` / `canceled` have no tests. |
| Webhook secret rotation | ⚠️ needs improvement | Module-load consumption (`:17`); rotation requires restart. Per operator scale, acceptable. |
| Stripe API version pinning | ⚠️ needs improvement | No `apiVersion` argument to `new Stripe(...)` anywhere in src/ (verified). |

### E.2 — Payment-link infrastructure best-in-class assessment

| Dimension | Rating | Evidence |
|---|---|---|
| Customer-link delivery (Email) | ✅ best-in-class | Templated via `payment_link_sent` slug; failure surfaces as `partial_errors`; channel-agnostic UI. |
| Customer-link delivery (SMS) | ✅ best-in-class | Templated + active-toggle gated; transactional source; `contextId=appt.id` for audit trail; explicit `notificationType` for the SMS delivery log. |
| Multi-channel routing | ✅ best-in-class | `method='both'` sends both with per-channel result reporting; sentCount==0 → 500; mixed success → 200 with `partial_errors`. |
| Token race-safety | ✅ best-in-class | Partial unique index `appointments_payment_link_token_unique`; `WHERE payment_link_token IS NULL` guard + retry-on-23505. |
| Token format | ✅ acceptable | 16-char `[A-Za-z0-9]` via `crypto.getRandomValues` — 62^16 ≈ 4.8e28 possibilities; collision-resistant. |
| Token TTL/expiration | ❌ missing | Tokens persist indefinitely. No staff-side or auto-rotation. F.4 below. |
| Custom-amount support | ✅ best-in-class | `payment_link_amount_cents` column + server-side overpayment guard (`send-payment-link/route.ts:186-193`) + clamp on charge-time (`pay/[token]/intent/route.ts:88-91`). Multi-link flows (deposit + balance) supported via column reset on next send. |
| Webhook reconciliation | ✅ best-in-class | Server is sole writer of transaction + payment rows for pay-link flow; idempotency per-PI; full audit trail. |
| `appointments.status` flip on payment | ❌ missing | This is the AC-11 gap. B.6 above. |
| Multi-payment support | ✅ best-in-class | Webhook accommodates pay-in-pieces via `remainingCents` math at `:117-142`; `payment_status` correctly resolves to `'paid'` vs `'partial'`. |
| Reconciliation visibility | ✅ acceptable | Operator sees `payment_link_sent_at` and `payment_link_paid_at` on the appointment row; receipts/transactions accessible via standard admin tooling. |
| Test coverage | ❌ missing | Zero tests on `send-payment-link/route.ts`, zero on `pay/[token]/intent/route.ts`, zero on the webhook's pay-link branch. |

### E.3 — Gaps: Phase 3 scope vs future scope

**Phase 3 Theme B scope (BLOCK AC-11):**
- `appointments.status` flip on `payment_intent.succeeded` for the pay-link branch (E.2 missing item)
- `send_payment_link` voice-agent tool (no existing tool surface for this)
- Voice-agent status pin removal at the two `voice-agent/appointments/route.ts` sites (or operator decision per D.3)

**Phase 3 Theme B should-close-too (operator's "no patch work" framing):**
- Pay-link branch test coverage (B.7 — zero tests on critical multi-table-write logic)
- `send-payment-link` endpoint test coverage
- `pay/[token]/intent` endpoint test coverage
- Webhook idempotency table for the e-commerce order branch (A.4 gap, currently latent because Stripe doesn't realistically double-deliver successful events)

**Tangential (defer to future):**
- Stripe API version pinning (general hygiene, not AC-11 specific)
- Webhook secret rotation tooling (operator-scale: not urgent)
- `charge.refunded` event subscription (would tie into AC-9 refund work, not AC-11)
- Token TTL / expiration mechanism (D.4 finding; UX issue rather than correctness issue)
- `payment_link_paid` customer SMS notification per the `TODO(payment-link-session-3)` marker at `webhooks/stripe/route.ts:231`

---

## Target F — Open operator decisions surfaced

Surfaced for operator resolution before Phase 3 Theme B is detailed. Not pre-resolved.

### F.1 — Voice-agent payment-link tool: new endpoint vs extend existing endpoint vs shared helper?

Per D.1, three patterns:
- New `/api/voice-agent/send-payment-link` route that internally invokes the same primitives
- Extend `/api/pos/appointments/[id]/send-payment-link` to accept either auth method
- Extract `lib/payment-link/send.ts` helper consumed by both POS + voice-agent routes

### F.2 — `send_payment_link` tool input shape: amount choice agent-side or server-default?

The POS path lets the operator pick an amount via `PaymentLinkAmountModal` (custom amount vs full remaining). For the voice agent:
- (a) Agent provides `amount_cents` (requires the agent to know remaining balance — a separate `get_appointment_balance` tool may be needed)
- (b) Agent always sends "full remaining" (omits `amount_cents`; the existing default behavior)
- (c) Agent picks from a small set of canned options (full / 50% / fixed $50 deposit)

### F.3 — Pending → confirmed flip semantic: deposit-or-full or full-only?

Per D.2 Branch A vs B vs C:
- Always flip on any successful payment (`'partial'` payment_status still flips status to `'confirmed'`)
- Flip only on full-payment (`payment_status='paid'` required)
- Flip only when the appointment was created via a non-online channel (`channel IN ('sms', 'phone')`)

### F.4 — Webhook scope expansion: add `charge.refunded` subscription? Add e-commerce dedup table? Add token TTL?

The operator's "no patch work" framing suggests these are eligible for Theme B inclusion, but they're broader than AC-11's strict scope. Pre-resolution before planning:
- Subscribe `charge.refunded` to keep `payment_status` in sync with refunds (currently the refund engine writes synchronously, but an async refund completion would be ignored)
- Add a `stripe_events` table for cross-branch dedup (closes E.1 e-commerce idempotency gap)
- Add a `payment_link_expires_at` column + cron expiry to close the indefinite-token persistence gap

### F.5 — Idempotency posture: per-PI lookup (status quo) + handlers-must-be-idempotent vs dedup table?

The pay-link branch is per-PI safe; the order branch is implicitly trust-Stripe-doesn't-double-deliver. The handler-idempotency vs event-dedup question has architectural cost implications (event-dedup adds a write per event; handler-idempotency requires per-branch discipline). Pre-resolution before Theme B detailing.

### F.6 — Status-flip side effects: should `confirmed` trigger any downstream cascades?

Per AC-2 (three explicit syncs), `appointment.status` changes can fire SMS templates (appointment_confirmed customer SMS), update lifecycle-engine cron windows, drive booking-reminder cron eligibility, etc. The webhook context has no operator identity — `audit_log.actor_employee_id` would be `NULL` or `SYSTEM_EMPLOYEE_ID` (the existing pattern from the e-commerce order branch at `:302`). Pre-resolution: which side effects fire on the webhook-driven flip vs which are gated to operator-initiated flips?

---

## File:line reference index

### Stripe SDK init sites (un-pinned API version across all)
- `src/app/api/webhooks/stripe/route.ts:16` — webhook handler
- `src/app/api/pay/[token]/intent/route.ts:8` — pay-link PI creation
- `src/app/api/book/payment-intent/route.ts:6` — booking deposit PI creation
- `src/app/api/book/route.ts` — booking route
- `src/app/api/checkout/create-payment-intent/route.ts` — e-commerce checkout
- `src/app/api/pos/refunds/route.ts` — refund engine
- `src/app/api/pos/stripe/payment-intent/route.ts` — POS Terminal flow
- `src/app/api/pos/stripe/connection-token/route.ts` — POS Terminal connection
- `src/app/api/pos/stripe/capture-payment/route.ts` — POS Terminal capture
- `src/app/api/pos/card-customer/route.ts` — POS card-on-file
- `src/app/api/admin/orders/[id]/refund/route.ts` — admin order refund
- `src/app/api/admin/stripe/locations/route.ts` — Stripe Terminal locations
- `src/app/api/admin/stripe/readers/route.ts` — Stripe Terminal readers (LIST)
- `src/app/api/admin/stripe/readers/register/route.ts` — Stripe Terminal reader register
- `src/app/api/admin/stripe/readers/[id]/route.ts` — Stripe Terminal reader (single)
- `src/app/api/admin/stripe/debug/route.ts` — Stripe admin debug
- `src/app/api/cron/cleanup-orders/route.ts` — order cleanup cron

### Webhook handler
- `src/app/api/webhooks/stripe/route.ts:19-386` — POST handler
- `:13-14` — UUID regex for metadata validation
- `:16-17` — Stripe SDK init + webhook secret
- `:21-33` — signature verification (400 on missing/invalid)
- `:37` — event-type switch
- `:38-356` — `payment_intent.succeeded`
- `:42-57` — booking-deposit log-only branch
- `:63-244` — appointment_payment_link branch (idempotency, transaction insert, payment insert, appointment update)
- `:95-111` — per-PI idempotency lookup
- `:179-183` — card-detail extraction via Stripe Charge round-trip
- `:213-225` — `appointments` UPDATE (no `status` write)
- `:236-243` — error rethrow → Stripe retry
- `:249-355` — e-commerce order branch (NO idempotency dedup)
- `:358-369` — `payment_intent.payment_failed`
- `:371-382` — `payment_intent.canceled`
- `:385` — 200 response (also covers untyped events)
- `:412-532` — order confirmation email HTML/text builder

### Payment-link flow
- `src/components/jobs/send-payment-link-dialog.tsx:33-117` — POS operator dialog (wraps SendMethodDialog)
- `src/components/jobs/payment-link-amount-modal.tsx` — amount-picker modal
- `src/app/pos/jobs/components/job-detail.tsx:1777-1832` — operator UI mount
- `src/app/api/pos/appointments/[id]/send-payment-link/route.ts:44-388` — server endpoint
  - `:200-239` — race-safe token mint
  - `:268-292` — email send (templated)
  - `:295-333` — SMS send (templated)
  - `:358-372` — `payment_link_sent_at` + `payment_link_paid_at=NULL` + `payment_link_amount_cents` stamp
- `src/app/api/pay/[token]/intent/route.ts:10-129` — customer-facing PI creation
  - `:102-112` — `stripe.paymentIntents.create` with `type: 'appointment_payment_link'` + `appointment_id` + `payment_link_token` metadata
- `src/app/(public)/pay/[token]/page.tsx:1-510` — customer-facing pay page (Server Component)
  - `:51-143` — appointment lookup + remaining-balance math + processing-state derivation
  - `:171-310` — page render

### Voice-agent surface
- `src/lib/sms-ai/tools.ts:64-332` — 13-tool registry
- `src/app/api/voice-agent/appointments/route.ts:290` — quote-conversion branch (hardcoded `status='pending'` via `convertQuote`)
- `src/app/api/voice-agent/appointments/route.ts:507-535` — direct branch (hardcoded `status: 'pending'` at `:516`)
- `src/lib/quotes/convert-service.ts:240-256` — `convertQuote` helper + unconditional `appointment_confirmed` webhook fire

### DB schema (payment-link + Stripe columns)
- `docs/dev/DB_SCHEMA.md:168` — `appointments.stripe_payment_intent_id`
- `docs/dev/DB_SCHEMA.md:184-187` — `appointments.payment_link_token`, `payment_link_sent_at`, `payment_link_paid_at`, `payment_link_amount_cents`
- `docs/dev/DB_SCHEMA.md:198` — `payment_link_amount_cents_check` CHECK (NULL or >= 50)
- `docs/dev/DB_SCHEMA.md:202` — `appointments_payment_link_token_unique` partial unique index (WHERE NOT NULL)
- `docs/dev/DB_SCHEMA.md:1504-1505` — `transactions.stripe_payment_intent_id`, `stripe_charge_id`
- `docs/dev/DB_SCHEMA.md:1695-1696` — `payments.stripe_payment_intent_id`, `stripe_charge_id`
- `docs/dev/DB_SCHEMA.md:1711` — `idx_payments_stripe` btree index (drives the webhook's per-PI idempotency lookup)

### Test coverage
- `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts:1-257` — e-commerce order branch tests (6 cases) + signature failure tests (2 cases)
- (no test file) `src/app/api/pos/appointments/[id]/send-payment-link/__tests__/`
- (no test file) `src/app/api/pay/[token]/__tests__/`
- (no pay-link branch coverage) `src/app/api/webhooks/stripe/__tests__/`

### Supporting helpers
- `src/lib/utils/stripe-card-details.ts:47-75` — `extractCardDetailsFromCharge` (returns nulls on any failure; never throws)
- `src/lib/utils/money.ts` — `STRIPE_MIN_AMOUNT_CENTS = 50`, `STRIPE_MIN_DOLLARS = 0.50`, `toCents`, `fromCents`
- `src/lib/sms/sms-contracts.source.ts:225-228` — `payment_link_sent` slug contract
- `src/lib/auth/api-key.ts` — voice-agent endpoint auth (`validateApiKey`)
- `src/lib/pos/api-auth.ts` — POS endpoint auth (`authenticatePosRequest` HMAC)

### Related prior audits
- `docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md` (Phase 0.1, `69b15b0f`) — tool count, voice-agent hardcoded 'pending' identified
- `docs/dev/WEBHOOK_RECEIVERS_IDENTITY_AUDIT.md` (`f5e714a8`) — distinct from this audit; covers `business_settings.n8n_webhook_urls` (the `fireWebhook` outbound system), NOT Stripe inbound webhooks
- `docs/dev/REFUND_CREDIT_CANCELLATION_FEE_AUDIT.md` (`3e633156`) — touches `/api/pos/refunds` (the refund engine the webhook does NOT call; refunds are synchronous from operator action)
