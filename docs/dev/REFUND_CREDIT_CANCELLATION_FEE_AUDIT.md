# Refund, Credit, and Cancellation-Fee Logic — Targeted Audit

> Read-only Targeted audit (Memory #29 type 1), 2026-06-05.
> Branch: `audit/refund-credit-cancellation-fee-logic`.
>
> Context: AC-9 (cancel-with-partial-payment decision pathways) is
> LOCKED in `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md` v1.0, but
> the operator surfaced uncertainty on what infrastructure exists vs
> needs building. Operator-stated context: cancel-which-refunds-partial
> "works"; deposit-retained-as-credit "works when we cancel existing
> ticket and create a new one"; full-refund-on-cancel "uncertain";
> refund-of-paid-minus-fifty "uncertain".
>
> Audit job: trace all current cancel / refund / credit / cancellation-
> fee code paths; determine what's built vs needs building; surface
> edge-case gaps. **No source / migration / test changes. No fix
> recommendations.**

---

## Executive summary

There are FOUR cancel endpoints and ONE refund endpoint, and they are **completely disjoint**. The four cancel endpoints (`/api/pos/appointments/[id]/cancel`, `/api/appointments/[id]/cancel`, `/api/customer/appointments/[id]/cancel`, `/api/pos/jobs/[id]/cancel`) only flip `status='cancelled'` + optionally send notification — **none of them invoke any Stripe refund, none of them create any credit, and none of them deduct any cancellation fee from money paid**. The admin cancel endpoint persists `appointments.cancellation_fee` as a NUMERIC column, but the field is operator-typed in the dialog (no $50 default, no global config), and the value is treated as documentation only — there is no code path that reads `cancellation_fee` later and applies it against a refund amount, against the deposit, or against any subsequent transaction. The robust refund engine at `/api/pos/refunds` (756 lines, `src/app/api/pos/refunds/route.ts`) DOES exist with full `stripe.refunds.create` integration, partial-amount support, LIFO close-out resolution across sibling appointment transactions, and `refunds` table audit — but it is reachable **only by the operator navigating to POS > Transactions > {transaction} > Issue Refund**. The cancel flow does not call it. **Customer-level credit (account balance) infrastructure DOES NOT EXIST at all**: there is no `customer_credits` table, no `customers.credit_balance` column, and the only "credit" in the schema is `transactions.deposit_credit` — a per-transaction memo of how much deposit was applied at close-out time on the SAME appointment via `appointments.deposit_amount` loaded into the ticket. The operator's stated "deposit retained as credit, applied to new ticket" workflow does NOT route through a credit system — it works because they keep editing the SAME appointment rather than truly cancelling it. **AC-9 Pathway A is PARTIALLY IMPLEMENTED** (refund mechanism exists in isolation but is not wired into cancel; un-materialize-on-cancel is also a known gap per AC-2.1). **AC-9 Pathway B is essentially UNIMPLEMENTED** at the schema level — there is no portable credit primitive. **Cancellation-fee deduction logic does not exist anywhere**; the field is a memo without behavior. Six open operator decisions surfaced (F.1–F.6).

---

## Target A — Current cancel paths

Four cancel endpoints exist. Each is analyzed for status updates, payment actions, notifications, and webhooks.

### A.1 — `POST /api/pos/appointments/[id]/cancel`

**Source:** `src/app/api/pos/appointments/[id]/cancel/route.ts:48-182`. 182 lines total.

**What it does:**
- Auth: `authenticatePosRequest` + `appointments.cancel` permission (`:53-84`).
- Validation: `cancellation_reason` required (min 1 char); `notify_customer` optional, defaults to `false` (`:12-23`).
- Status guard: cannot cancel `completed` or `cancelled` appointments (`:99-104`).
- Update: `appointments.status='cancelled'`, `cancellation_reason`, `updated_at` (`:106-113`). **NO `cancellation_fee` field on this endpoint** — operator-typed fee is admin-only by explicit design comment (`:33-37`).
- Notifications: `sendCancellationNotifications(id, reason)` + `fireWebhook('appointment_cancelled', …)` — ONLY when `notify_customer=true` (`:127-144`). When false (default), both are suppressed.
- Audit log: `entityType: 'booking'`, `action: 'delete'`, includes `notification_suppressed` flag (`:146-160`).

**Payment-side actions:** NONE. No Stripe refund call. No `payments` table read. No transaction adjustment. No credit creation.

**Job cascade:** NONE. Cancelling the appointment leaves any linked job at its prior status (the AC-2.1 orphan gap surfaced in materialization audit `2293fb3d` Target G.4).

### A.2 — `POST /api/appointments/[id]/cancel` (admin)

**Source:** `src/app/api/appointments/[id]/cancel/route.ts:14-184`. 184 lines total.

**What it does:**
- Auth: `getEmployeeFromSession` + `appointments.cancel` permission (`:19-25`).
- Fee permission split: if `cancellation_fee` IS provided in body, also require `appointments.waive_fee` permission (`:41-44`).
- Validation via `appointmentCancelSchema` (`src/lib/utils/validation.ts:510`).
- Status guard: same as A.1 (`:62-68`).
- Fee gating: `cancellation_fee` only persisted if `FEATURE_FLAGS.CANCELLATION_FEE` is enabled (`:70-72`). When disabled, the operator-typed fee is dropped silently.
- Update: `appointments.status='cancelled'`, `cancellation_reason`, `cancellation_fee` (the gated value), `updated_at` (`:74-84`).
- Notifications: `sendCancellationNotifications` ALWAYS fires (no toggle, unlike A.1) (`:95-97`).
- Webhook: `fireWebhook('appointment_cancelled')` ALWAYS fires; payload INCLUDES `cancellation_fee` (`:100-108`).
- Waitlist side effect: if waitlist feature enabled, finds matching `waitlist_entries` for the services + date, marks them `status='notified'`, fires a second `fireWebhook('appointment_cancelled')` with `waitlist_notified[]` payload (`:110-161`).
- Audit log: `entityType: 'booking'`, includes `cancellation_fee` (`:163-174`).

**Payment-side actions:** NONE. The `cancellation_fee` column is persisted as a NUMBER, **but no code path reads it later to apply against a refund or deduct from the deposit**. Verified via `grep -rn "cancellation_fee" src/` — every reader either persists/displays the number or strips it. **There is no money movement triggered by setting this field.**

**Job cascade:** NONE. Same orphan gap as A.1.

### A.3 — `POST /api/customer/appointments/[id]/cancel` (customer self-serve)

**Source:** `src/app/api/customer/appointments/[id]/cancel/route.ts:10-111`. 111 lines total.

**What it does:**
- Auth: customer Supabase session (`supabase.auth.getUser`) + customer-ownership check (`:14-43`).
- Cancellable statuses: `pending`, `confirmed` only (`:8, :50-55`). Cannot cancel `in_progress` etc.
- **24-hour advance window:** rejects if `hoursUntil < APPOINTMENT.CANCELLATION_WINDOW_HOURS` (`:57-72`).
- Update: `appointments.status='cancelled'`, `cancellation_reason: 'Cancelled by customer'`, `updated_at` (`:74-87`).
- Notifications: `sendCancellationNotifications` always fires (`:89-92`).
- Webhook: `fireWebhook('appointment_cancelled', { cancelled_by: 'customer', customer_id })` (`:94-104`).

**Payment-side actions:** NONE. Even when the customer self-cancels within the 24-hour window, the deposit they paid online is NOT automatically refunded. No Stripe call. No credit.

**No fee logic at all.** Customer-self-cancel does not consult `cancellation_fee`.

**Job cascade:** NONE.

### A.4 — `POST /api/pos/jobs/[id]/cancel`

**Source:** `src/app/api/pos/jobs/[id]/cancel/route.ts:23-370`. 370 lines (largest of the four).

**What it does:**
- Auth: `authenticatePosRequest`; permission depends on job status (`:74-97`):
  - `CANCELLABLE_EARLY` (`scheduled`, `intake`): `pos.jobs.cancel` permission.
  - `CANCELLABLE_LATE` (`in_progress`, `pending_approval`): admin-or-super-admin role hard-check (NOT permission-grantable).
- Status guard: rejects all other statuses (`:67-72`).
- Job update: `jobs.status='cancelled'`, `cancellation_reason`, `cancelled_at`, `cancelled_by`, `updated_at` (`:102-118`).
- **Appointment cascade:** when `job.appointment_id` is set, also UPDATEs `appointments.status='cancelled'` + `cancellation_reason` (`:145-154`). This is the THIRD-of-three documented cross-table syncs per AC-2 (the others: un-materialize, walk-in atomic-create).
- Walk-in defense-in-depth: skips customer notification when `appointment.channel='walk_in'` (`:162-167`). Server-side guard against the cancellation-SMS-to-walk-in-customer phrasing bug.
- Notification: optional `notify_method ∈ {email, sms, both}`. When set + non-walk-in: renders `appointment_cancelled` SMS template + sends HTML email with red banner + rebook CTA (`:169-354`).
- Audit log: `entityType: 'job'`, includes previous_status (`:128-139`).

**Payment-side actions:** NONE. No Stripe refund call. No `payments` table read. No transaction adjustment.

### A summary table

| Endpoint | Status set | Cascade | Fee persisted? | Refund issued? | Credit created? | Webhook |
|---|---|---|---|---|---|---|
| A.1 POS appt cancel | `appointment.cancelled` | none | no field | no | no | `appointment_cancelled` (gated by `notify_customer`) |
| A.2 Admin appt cancel | `appointment.cancelled` + `cancellation_fee` value | none | yes (gated by feature flag + permission) | no | no | `appointment_cancelled` (always) + waitlist fire |
| A.3 Customer self-cancel | `appointment.cancelled` | none | no field | no | no | `appointment_cancelled` (always) |
| A.4 POS job cancel | `job.cancelled` + `appointment.cancelled` (cascade) | yes (appt) | no field | no | no | none (uses SMS/email template instead) |

**Aggregate finding:** the cancel-stage today is a STATUS-FLIP-AND-NOTIFY flow. Money movement is entirely manual and handled outside the cancel endpoints.

---

## Target B — Customer credit infrastructure

### B.1 — Does a `customer_credits` table or equivalent exist?

**No.** Verified via:
- `grep -in "credit" docs/dev/DB_SCHEMA.md` returns ONE result: `| deposit_credit | NUMERIC(10,2) | NOT NULL, DEFAULT 0 |` on the `transactions` table at `DB_SCHEMA.md:2966`.
- `grep -rln "customer_credit\|store_credit\|credit_balance\|account_balance" src/` returns ZERO matches.
- `customers` table at `DB_SCHEMA.md` has `loyalty_points_balance` but NO `credit_balance` or `store_credit_*` column.

**There is no DB-level customer-credit primitive.** No portable balance that can be created, applied, expired, or refunded. The system has loyalty points (handled separately, redemption-rate driven, integer-points balance), but credit dollars are not modeled.

### B.2 — How is `transactions.deposit_credit` used?

The single existing "credit" concept is per-transaction, NOT per-customer. Source: `src/app/api/pos/transactions/route.ts:188` writes `deposit_credit` from `data.deposit_credit` on transaction insert; `src/app/pos/jobs/page.tsx:180` populates it on the local ticket reducer from `appointments.deposit_amount`.

**Mechanism (verified at `pos/jobs/page.tsx:180-203`):**
1. When operator opens a job's checkout flow, the POS GETs the appointment data.
2. `data.deposit_amount` (from `appointments.deposit_amount`, set at booking time when the customer paid an online deposit) populates the ticket's `depositCredit` field.
3. The ticket's `total` math (`pos/utils/tax.ts:25-34`) subtracts `depositCredit` from `(subtotal + tax - discount)`.
4. At checkout completion, the new POS transaction row carries `deposit_credit: data.deposit_credit` as a documentation field.

**Critical constraint:** this works because the **deposit-paid appointment IS the same appointment being closed out**. The `deposit_amount` lives ON that appointment row. There is NO mechanism to transfer a deposit from a cancelled appointment to a new appointment.

### B.3 — How is credit "applied to a new ticket" (operator's stated workflow)?

**It is not.** The operator's stated workflow — *"works when we need to cancel existing ticket and create a new one, then apply that credit to that ticket"* — does NOT match any code path. The audit traced every reader of `appointments.deposit_amount`, `transactions.deposit_credit`, and `appointments.stripe_payment_intent_id`; none provide a cross-appointment transfer.

**What likely happens operationally (inferred, not code-verified — Memory #11 caveat):** the operator EDITS the existing appointment (changes services, date, etc.) rather than truly cancelling it. The deposit stays attached to the same `appointments.id` and continues to be applied as `depositCredit` on close-out. If they truly cancelled the appointment (set `status='cancelled'`) AND created a new appointment for the rebook, the deposit money would be stranded on the cancelled row with no automated way to apply it to the new appointment.

### B.4 — Edge cases

- **Partial credit application** (use $30 of $50): NOT SUPPORTED. `transactions.deposit_credit` is a single numeric memo at close-out; it doesn't track partial-use state across multiple tickets.
- **Credit expiration / time limit:** NOT MODELED. No `expires_at` column.
- **Credit refunded to original payment method later:** NOT SUPPORTED via credit path. The refund engine at A's `/api/pos/refunds` could refund the original deposit transaction, but that bypasses any "credit" concept.
- **Issuing credit (no original payment):** NOT SUPPORTED. There's no admin "manually add $X credit to customer" affordance.

---

## Target C — Stripe refund infrastructure

### C.1 — How are Stripe refunds issued?

**Single canonical endpoint:** `POST /api/pos/refunds` (`src/app/api/pos/refunds/route.ts:23-756`, 756 lines).

**Triggered by:** operator clicking **Issue Refund** on POS > Transactions > {transaction} (`src/app/pos/components/transactions/transaction-detail.tsx:585-592`). Permission: `pos.issue_refunds` (`/api/pos/refunds/route.ts:30`). Opens `<RefundDialog>` for item-mode or shell-mode amount entry.

**Secondary endpoint:** `POST /api/admin/orders/[id]/refund` (`src/app/api/admin/orders/[id]/refund/route.ts`, 169 lines) — order-specific (online-store orders), not appointment-related.

**Stripe call:** `stripe.refunds.create({ payment_intent: cardPmt.stripe_payment_intent_id, amount: stripeAmountCents })` at `pos/refunds/route.ts:395-398`. Partial refund supported via the `amount` parameter.

**Mode dispatch:** the endpoint handles two modes (`:48-66`):
- **Items mode:** client sends `items: [{transaction_item_id, amount, …}]`. Server recomputes per-line amounts.
- **Shell mode:** client sends empty `items: []` + `bulk_amount`. Used for shell-shaped transactions (pay-link, booking deposit, appointment-payment) that have no `transaction_items` rows — Stripe-style "refund $X against a PI". Booking deposits fall here.

**Close-out LIFO source plan:** when the transaction is a close-out (notes prefix + appointment_id linkage detected by `isCloseOutTransaction`, `pos/refunds/route.ts:256-260`), the engine resolves sibling transactions on the same appointment LIFO via `resolveRefundSourcePlan` (`src/lib/refunds/source-plan.ts:1-210`) and walks them newest-first, issuing one Stripe call per source. Mid-flight failure persists the partial-success state honestly (`:253-254` comment: *"Stripe doesn't allow rollback"*).

### C.2 — Refund webhook handling

**No `charge.refunded` or `refunds.*` listener.** Verified by `grep -n "case '" src/app/api/webhooks/stripe/route.ts` returning only `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`.

Refund-side flow is **synchronous-only**: the POS engine calls `stripe.refunds.create`, captures the synchronous response (`stripeRefund.id`), writes the `refunds` row, and considers the refund complete. There is no later reconciliation from Stripe-side events.

### C.3 — Refund accounting

**`refunds` table** at `DB_SCHEMA.md:2154-2173`:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `transaction_id` | UUID NOT NULL FK → `transactions(id) ON DELETE RESTRICT` | **Must point to a transaction — no standalone refunds** |
| `status` | `refund_status` enum (`pending`, `processed`, `failed`) | |
| `amount` | NUMERIC(10,2) | |
| `reason` | TEXT | |
| `stripe_refund_id` | TEXT | |
| `processed_by` | UUID FK → `employees` | |
| `points_clawed_back` / `points_restored` | INTEGER | Loyalty reversal |
| `notes` | TEXT | JSON breakdown for close-out multi-source refunds |

**Transaction status reflects refund state:** `transactions.status` enum at `DB_SCHEMA.md:2944` includes `partial_refund` and `refunded` states, set as the refund engine completes.

**Where refunds appear:** in Admin/POS Transactions view; the refund row links back to the original transaction by FK. Refund LINE-ITEM granularity is preserved via `refund_items` table (verified via `find src/app/api -path "*refund*" -name "*.ts"` returning `pos/refunds/source-plan/[id]/route.ts` and the refund route itself).

---

## Target D — Operator-stated scenarios verified

### D.1 — "Cancel which refunds partial payments" (operator says works)

**Verdict:** PARTIALLY ACCURATE. The infrastructure exists in pieces; no single endpoint performs both.

**What actually works:**
- The operator can cancel the appointment via Admin > Appointments dialog (path A.2) — sets `status='cancelled'`.
- The operator can SEPARATELY navigate to POS > Transactions, find the booking-deposit transaction (linked via `transactions.appointment_id`), click **Issue Refund**, and refund the deposit through Stripe via the engine at C.1.

**What does NOT happen:** the cancel endpoint does not invoke the refund engine. There is no single-click "cancel and refund" affordance. Verified by reading all 4 cancel endpoints — zero references to `stripe.refunds.create`, zero `from('refunds').insert`, zero call sites of the refund engine.

**File:line evidence:**
- Cancel A.2 at `src/app/api/appointments/[id]/cancel/route.ts:74-84` — only UPDATE statement is `appointments.status='cancelled'` + fee field.
- Refund engine at `src/app/api/pos/refunds/route.ts:23-756` — entry point is the `/api/pos/refunds` POST; not invoked from any cancel route.
- Refund button at `src/app/pos/components/transactions/transaction-detail.tsx:585-592` — requires operator to navigate to the transaction explicitly.

### D.2 — "Deposit retained as credit, applied to new ticket"

**Verdict:** ACCURATE FOR THE SAME-APPOINTMENT CASE; INACCURATE FOR THE CROSS-APPOINTMENT CASE.

**What actually works (same appointment):** when the operator opens the existing appointment in POS for checkout, `pos/jobs/page.tsx:180` reads `appointments.deposit_amount` and populates `ticketState.depositCredit`. The `ticket-totals.tsx:111-114` component renders it as a `-$X.XX` line above the Balance Due total. At checkout the new POS transaction row carries `deposit_credit` as documentation (`pos/api/transactions/route.ts:188`).

**What does NOT work (cross-appointment):** if the operator truly cancels appointment A (deposit on it) and creates a brand-new appointment B for the rebook, the deposit money cannot be transferred. The `appointments.deposit_amount` for B is 0; A's deposit stays attached to the now-cancelled A. No `customer_credits` table exists for the portable case. No "transfer deposit from A to B" endpoint exists.

**Inferred operator practice (Memory #11 — not code-verified):** the operator's workflow probably edits the original appointment in-place (changes services/date) rather than cancelling. The deposit stays attached to the same `appointments.id`. **No "credit" system is needed because no cancellation actually happened.**

### D.3 — "Cancel entirely, want a full refund"

**Verdict:** PARTIALLY POSSIBLE; NOT INTEGRATED.

The operator CAN refund the full deposit transaction via the POS refund engine — partial-refund vs full-refund is supported via the `amount` parameter or the items-mode shape. But:
- The cancel endpoint itself does not do this — operator must do TWO steps (cancel + refund).
- If the appointment has MULTIPLE prior payments (deposit at booking + additional payment via pay-link), the refund engine's close-out LIFO logic handles the multi-source case (`pos/refunds/route.ts:275-327`) — full-amount refund spans both sources.
- For pre-completion appointments (just a deposit, no close-out), this is shell-mode refund (`isShellMode` branch at `:57`).

**Gap:** no "Cancel & Refund Full" combined affordance. The "want full refund" decision is made implicitly by the operator typing the refund amount equal to the maximum refundable, not by a structured "full refund" path.

### D.4 — "Paid more than $50 cancellation fee, refund the difference"

**Verdict:** NOT SUPPORTED in any integrated way.

**What the audit found:**
- `appointments.cancellation_fee` is a NUMBER persisted by admin cancel (A.2 at `:79`). It is operator-typed in `cancel-appointment-dialog.tsx:106-114` — **no $50 default, no global config, no FEE_AMOUNT constant**. Grep for `5000|50.00|FIFTY|CANCELLATION_FEE_CENTS` in `src/lib` returns ZERO matches. The "$50" the operator referenced is a number THEY type per cancel; it is not a system default.
- **No code path computes `refund_amount = paid - cancellation_fee`.** Verified by `grep -rn "cancellation_fee" src/` — all 16 readers either persist the field, display the dollar amount on the appointment detail dialog (`appointment-detail-dialog.tsx:470-471`), include it in audit/webhook payloads, or define its Zod type. None subtract it from a refund amount or deposit.
- The refund engine does NOT consult `appointments.cancellation_fee` at all. `grep -n "cancellation_fee" src/app/api/pos/refunds/route.ts` returns zero matches.

**Operator workflow gap:** to achieve "$X paid minus $50 fee = $(X-50) refund," the operator must do the math themselves and type that refund amount into the refund dialog. The system does not derive it; the cancellation_fee field is decorative documentation in the current implementation.

---

## Target E — AC-9 alignment

AC-9 LOCKED at `QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:405-426` commits to two pathways. Gap analysis:

### E.1 — Pathway A (Cancel & Refund)

| AC-9 commitment | Current state | Verdict |
|---|---|---|
| Refund deposit/partial payment to original payment method | Refund engine exists (`/api/pos/refunds`, C.1); supports partial via `amount` parameter | **EXISTS but NOT WIRED to cancel** |
| If job exists: un-materialize | `executeUnMaterialize` exists at `src/lib/appointments/lifecycle-sync.ts:208-368` (referenced in materialization audit `2293fb3d` Target C.1); cancel endpoints do NOT invoke it | **EXISTS but NOT WIRED to cancel** (this is the AC-2.1 orphan gap) |
| Appointment marked cancelled with `cancellation_reason` | Cancel A.1/A.2/A.3/A.4 all do this | **EXISTS** |
| Customer notified of cancellation + refund | `sendCancellationNotifications` exists; **the cancellation SMS template does NOT include refund amount or stripe_refund_id chips** (verified by grepping the template engine — refund-specific chips would surface in `palette.ts`); refund-side notification is not currently a distinct customer notification path | **PARTIAL: cancel SMS exists; no refund-confirmation chip exists** |
| Operator UI affordance: single "Cancel & Refund" button | None | **MISSING** |

**Pathway A summary: COMPONENTS EXIST, INTEGRATION DOES NOT.** Refund engine works in isolation; cancel endpoints work in isolation; un-materialize works in isolation. Operator does 3 manual steps (cancel → un-materialize via Revert button → navigate to transaction → Issue Refund). Phase 3's AC-9 implementation will need an orchestration layer that calls all three primitives.

### E.2 — Pathway B (Cancel & Retain credit)

| AC-9 commitment | Current state | Verdict |
|---|---|---|
| Apply deposit/partial payment as credit to customer's account | **No `customer_credits` table; no `customers.credit_balance` column** | **MISSING entirely at schema level** |
| If job exists: job marked `cancelled` (NOT deleted) | A.4 does this (sets `jobs.status='cancelled'` + cancelled_at/cancelled_by); appointment also flipped via cascade | **EXISTS** |
| Appointment marked cancelled with reference to retained credit | `appointments.cancellation_reason` field exists but no `retained_credit_id` or similar FK; no credit-entity exists for the FK to point to | **MISSING (depends on credit table)** |
| Customer notified of cancellation + credit balance | Cancel SMS template carries no credit-balance chip; no credit-balance chip exists in the palette | **MISSING (depends on credit table)** |
| Operator UI affordance for "Apply credit to ticket" | The `depositCredit` field in `ticket-totals.tsx:111-114` is auto-populated FROM the SAME appointment's `deposit_amount`, NOT from a generic customer-credit balance | **MISSING (only same-appointment path exists)** |

**Pathway B summary: ESSENTIALLY UNIMPLEMENTED at the schema level.** Building it requires:
1. New `customer_credits` table (id, customer_id, balance_remaining, source_transaction_id?, source_appointment_id?, issued_at, expires_at?, status).
2. Credit-creation logic at cancel time (issue credit row referencing the deposit source).
3. Credit-application logic at new-ticket-checkout time (read customer's outstanding credit, deduct against amount due, decrement balance).
4. Operator UI affordance to view + apply credit during checkout (the `depositCredit` field is appointment-scoped today; a portable equivalent would need ticket-scoped affordance regardless of source appointment).
5. SMS template chip for credit balance announcement.

The audit makes no recommendation on whether Pathway B should be built, deferred, or scope-reduced — that is Phase 3 operator decision.

### E.3 — Cancellation fee handling

**Current state:**
- Persistence: YES, via admin cancel A.2 only (gated by feature flag + permission).
- Pre-fill / default: NONE. Operator types per cancel. No $50 system constant.
- Money movement: NONE. The field is decorative.
- UI display: shown on admin appointment detail dialog as a red `Fee: $X.XX` label below cancellation reason (`appointment-detail-dialog.tsx:470-471`).

**AC-9 implication:** the locked AC-9 text references "deposit/partial payment" but does NOT explicitly call out the fee-deduction sub-case operator surfaced. Whether the fee should be:
- A Pathway A subtype (Cancel & Refund minus Fee — `refund = paid - fee`),
- A Pathway B subtype (Cancel & Retain credit minus fee — `credit = paid - fee`),
- Its own Pathway C (Cancel & Charge Fee — keep all paid as fee revenue, no refund, no credit),
- A no-op modifier (track fee for reporting only, no money movement)

is unresolved by the locked doc. Surfaced as F.5 below.

---

## Target F — Open operator decisions surfaced

### F.1 — Should the $50 cancellation fee be operator-configurable per appointment, or fixed?

Current state: operator-typed per cancel, no default, no global config (D.4). The AC-9 doc references $50 informally but no constant exists in code. If Phase 3 wires fee → refund math, the operator must decide:
- Keep operator-typed per cancel (current shape)
- Add a `business_settings.cancellation_fee_amount` default + global toggle
- Per-service / per-tier fee schedules

### F.2 — Should the fee apply automatically, or be operator-toggleable per cancel?

Currently: dialog has the fee input optionally; admin cancel reads it if provided. The customer-self-cancel path (A.3) has NO fee logic — within the 24-hour window the cancel is free, outside the window the cancel is rejected entirely. Operator must decide:
- Make fee automatic at admin cancel time (operator must waive explicitly via permission)
- Keep fee optional (operator must apply explicitly per cancel)
- Fee scales by time-to-appointment

### F.3 — Should the refund-amount breakdown show in the operator UI?

Currently: refund dialog shows the refund amount; doesn't show "Paid: $X | Fee: $Y | Refund: $X-Y" breakdown. Operator must decide whether Phase 3's "Cancel & Refund" affordance presents:
- A simple "Issue Refund" button (operator does math)
- A computed breakdown (auto-derived from `appointments.deposit_amount`, `cancellation_fee`, prior payments)
- A two-input dialog (fee + refund both editable)

### F.4 — Credit expiration policy?

If Pathway B is implemented, credits need to know:
- Do they expire? Expiry window?
- Do they extend to family/transferable to spouse/etc.?
- Can they go negative (overdraft)?
- What happens when the customer's account is deleted (`customers.deleted_at`)?
- Refundable to original payment method later?

None of these are addressed by current infrastructure (B.4).

### F.5 — Cancellation fee semantics — Pathway A subtype / B subtype / Pathway C?

Per E.3 — the locked AC-9 doesn't lock the fee's pathway. Operator must choose whether the fee:
- Subtracts from refund (Pathway A: `refund = paid - fee`)
- Subtracts from credit (Pathway B: `credit = paid - fee`)
- Stands alone (Pathway C: `keep paid, issue $0 refund, $0 credit, fee = paid`)
- Reporting-only (no money movement, fee tracked as a number for analytics)

### F.6 — Customer-self-cancel within 24h window: deposit handling?

A.3 currently flips status without refunding. Operator decision:
- Auto-refund within 24h window
- Auto-credit within 24h window
- Require staff review before refund / credit issued
- Keep current behavior (no automatic money movement; staff handles separately)

---

## File:line reference index

### Cancel endpoints

| Endpoint | File | Range |
|---|---|---|
| POS appointment cancel | `src/app/api/pos/appointments/[id]/cancel/route.ts` | 48-182 |
| Admin appointment cancel | `src/app/api/appointments/[id]/cancel/route.ts` | 14-184 |
| Customer self-cancel | `src/app/api/customer/appointments/[id]/cancel/route.ts` | 10-111 |
| POS job cancel | `src/app/api/pos/jobs/[id]/cancel/route.ts` | 23-370 |

### Fee-related

| Topic | File | Range |
|---|---|---|
| Admin fee gating (feature flag + permission) | `src/app/api/appointments/[id]/cancel/route.ts` | 41-44, 70-72 |
| Fee column persistence | `src/app/api/appointments/[id]/cancel/route.ts` | 79 |
| Fee in admin webhook payload | `src/app/api/appointments/[id]/cancel/route.ts` | 106 |
| Cancel dialog fee input UI | `src/app/admin/appointments/components/cancel-appointment-dialog.tsx` | 99-115 |
| Appointment detail fee display | `src/app/admin/appointments/components/appointment-detail-dialog.tsx` | 470-471 |
| Zod schema | `src/lib/utils/validation.ts` | 510 |
| Feature-flag constant | `src/lib/utils/constants.ts` | 266 |
| **No hardcoded $50** | (grep -rn "5000\|FIFTY\|CANCELLATION_FEE_CENTS" → no matches) | — |

### Refund infrastructure

| Topic | File | Range |
|---|---|---|
| Canonical refund endpoint | `src/app/api/pos/refunds/route.ts` | 23-756 |
| Stripe call | `src/app/api/pos/refunds/route.ts` | 395-398 |
| Source-plan LIFO helper | `src/lib/refunds/source-plan.ts` | 1-210 |
| Source-plan GET | `src/app/api/pos/refunds/source-plan/[id]/route.ts` | (full file) |
| Admin order refund (online store) | `src/app/api/admin/orders/[id]/refund/route.ts` | 14-169 |
| Refund button mount | `src/app/pos/components/transactions/transaction-detail.tsx` | 585-592 |
| Refund dialog | `src/app/pos/components/refund/refund-dialog.tsx` | full file |
| Refund summary | `src/app/pos/components/refund/refund-summary.tsx` | full file |

### Deposit-credit infrastructure (per-transaction memo, NOT portable credit)

| Topic | File | Range |
|---|---|---|
| Ticket reducer field | `src/app/pos/types.ts` | 92 |
| Ticket math (subtracts deposit) | `src/app/pos/utils/tax.ts` | 17-34 |
| Loader: appointment → ticket | `src/app/pos/jobs/page.tsx` | 180-203 |
| Display in ticket totals | `src/app/pos/components/ticket-totals.tsx` | 111-114, 124 |
| Persistence on close-out tx | `src/app/api/pos/transactions/route.ts` | 188 |
| Zod schema | `src/lib/utils/validation.ts` | 571 |

### Booking deposit (the money A.1-A.4 cancel does not refund)

| Topic | File | Range |
|---|---|---|
| Transactions insert at booking | `src/app/api/book/route.ts` | 650-664 |
| Payments insert (carries PI) | `src/app/api/book/route.ts` | 845-854 |
| Appointment PI persistence | `src/app/api/book/route.ts` | 640-644 |

### Webhook handling

| Topic | File | Range |
|---|---|---|
| Stripe webhook | `src/app/api/webhooks/stripe/route.ts` | 38-371 |
| Events handled | `payment_intent.succeeded` (`:38`), `payment_intent.payment_failed` (`:358`), `payment_intent.canceled` (`:371`) |
| **No `charge.refunded` listener** | (verified by grep) | — |

### Schema anchors

| Topic | Anchor |
|---|---|
| `appointments.cancellation_fee` | `docs/dev/DB_SCHEMA.md:173` |
| `appointments.cancellation_reason` | `docs/dev/DB_SCHEMA.md:174` |
| `appointments.stripe_payment_intent_id` | `docs/dev/DB_SCHEMA.md:168` |
| `appointments.deposit_amount` | `docs/dev/DB_SCHEMA.md:180` |
| `transactions.deposit_credit` | `docs/dev/DB_SCHEMA.md:2966` |
| `transactions.status` enum (incl `partial_refund`, `refunded`) | `docs/dev/DB_SCHEMA.md:2944` |
| `payments` table | `docs/dev/DB_SCHEMA.md:1685+` |
| `refunds` table | `docs/dev/DB_SCHEMA.md:2154-2173` |
| `refund_status` enum (`pending`, `processed`, `failed`) | `docs/dev/DB_SCHEMA.md:2158` |
| **`customer_credits` table** | **DOES NOT EXIST** (verified by grep) |
| **`customers.credit_balance`** | **DOES NOT EXIST** (verified) |

### AC commitments referenced

| AC | Lifecycle doc anchor |
|---|---|
| AC-2.1 appointment cancel cascades via un-materialize | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:287-297` |
| AC-9 cancel-with-partial-payment pathways | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:405-426` |

### Sibling audit references

| Audit | Merge |
|---|---|
| Materialization lifecycle (cross-table sync inventory) | `2293fb3d` |
| Populate dependencies (un-materialize confirmation) | `98a5f30d` |

---

**End of audit.**
