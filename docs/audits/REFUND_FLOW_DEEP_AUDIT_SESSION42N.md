# Refund Flow — Deep Audit (Session 42N)

> **Status:** READ-ONLY audit. No code or migration changes in this commit.
>
> **Scope:** Comprehensive trace of the refund path in this app — POS refund
> (`/api/pos/refunds`), admin online-order refund (`/api/admin/orders/[id]/refund`),
> and the math/Stripe/coupon/loyalty side-effects of each — to produce a
> mirror-spec for the eventual void inventory fix tracked in Session 42M.
>
> **Companion:** `docs/audits/VOID_INVENTORY_BUG_SESSION42M.md`. The void path
> currently does NOT touch inventory at all (verified Session 42M). Before
> mirroring "what refund does" into void, this audit nails down what refund
> *actually* does so the future fix copies the right things and skips the
> wrong things.
>
> **Headline finding:** The POS refund route is largely correct (single-
> rounding money math, server-side recompute with exact match enforcement,
> per-line disposition with audit rows, Stripe-before-DB ordering). It does
> have **non-atomic side effects** — every step is a separate Supabase call,
> with no transaction wrapper — so partial failures in steps 2–7 leave
> orphaned rows. The admin online-order refund is **simpler and worse** —
> silently mutates inventory with no `stock_adjustments` audit row, has no
> Stripe-failure rollback for the inventory mutation, and does not reverse
> coupons/loyalty/lifetime-spend at all.

---

## TL;DR

| Question | Answer |
|---|---|
| Does refund call Stripe before DB writes? | **Yes** — Stripe refund runs first, error returns 400 with no DB rows created. |
| Is the refund flow atomic if Stripe succeeds but a later DB write fails? | **No.** No SQL transaction wrapper. Steps 2–7 are independent Supabase calls. Stripe is already debited. |
| Does the partial refund math correctly pro-rate tax / discount? | **Yes** — `computePerUnitRefundableCents` includes `itemSubtotalCents + itemTaxCents - itemDiscountShare`, with single-rounding and residual-cent redistribution. |
| Are loyalty earned points clawed back proportionally on partials? | **Yes** — `Math.floor(loyalty_points_earned * totalRefundAmount / transaction.total_amount)`. |
| Are coupons/campaigns reversed on partial refunds? | **No** — only on full refund (`newStatus === 'refunded'`). Partial refund leaves `coupons.use_count` and `campaigns.redeemed_count` untouched. |
| Can the same refund be submitted twice? | **No idempotency key on Stripe call.** Two clicks within the request window can issue two Stripe refunds. The aggregate-cap check protects against over-refund only after the first row lands in `refunds`. |
| Does refund handle Stripe Terminal vs CNP differently? | **No** — both use the same `payment_intent` id. Stripe's API handles routing internally. |
| Does the admin online-order refund write `stock_adjustments`? | **No** — silent qty mutation. Same defect as the void path. |
| Does the admin online-order refund reverse coupons/loyalty? | **No** — neither. |

---

## Phase 1 — POS refund full flow

### File and handler

`src/app/api/pos/refunds/route.ts` (460 lines, single `POST` handler — no `GET`,
`PATCH`, or `DELETE`). Refund retrieval happens via the standard transaction
fetch (`refunds` and `refund_items` joined when reading transactions for the
detail page); there is no dedicated `GET /api/pos/refunds` endpoint.

### Full quote of the POST handler

```ts
// src/app/api/pos/refunds/route.ts:19-460
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(posEmployee.employee_id, 'pos.issue_refunds');
    if (denied) return denied;

    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = refundCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Normalize disposition: new clients send disposition directly;
    // cached PWA clients may send legacy restock boolean instead.
    const normalizedItems = data.items.map((item) => {
      const disposition: RefundDisposition =
        item.disposition ??
        (item.restock === true ? 'restock' : 'customer_retained');
      return { ...item, disposition };
    });

    // Fetch the transaction with payments
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, payments(*)')
      .eq('id', data.transaction_id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify transaction status allows refunds
    if (!['completed', 'partial_refund'].includes(transaction.status)) {
      return NextResponse.json(
        { error: 'Transaction cannot be refunded (status: ' + transaction.status + ')' },
        { status: 400 }
      );
    }

    // Bulk fetch transaction_items — needed for server-side refund math
    // recompute. See src/lib/utils/refund-math.ts invariants.
    const { data: txItems, error: txItemsError } = await supabase
      .from('transaction_items')
      .select('id, unit_price, quantity, tax_amount')
      .eq('transaction_id', data.transaction_id);

    if (txItemsError || !txItems) {
      console.error('Transaction items fetch error:', txItemsError);
      return NextResponse.json(
        { error: 'Failed to load transaction items' },
        { status: 500 }
      );
    }

    const itemsById = new Map(
      txItems.map((row) => [row.id as string, row])
    );

    // Validate every payload item resolves to a real transaction_item row
    for (const payloadItem of data.items) {
      if (!itemsById.has(payloadItem.transaction_item_id)) {
        return NextResponse.json(
          { error: `Unknown transaction_item_id: ${payloadItem.transaction_item_id}` },
          { status: 400 }
        );
      }
    }

    // Recompute refund amounts server-side from stored transaction_items.
    const tipRefund = data.tip_refund ?? 0;
    const recomputed = computeTotalRefundCents({
      transaction: {
        subtotal: transaction.subtotal,
        discount_amount: transaction.discount_amount || 0,
        tip_amount: transaction.tip_amount || 0,
      },
      items: data.items.map((payloadItem) => {
        const row = itemsById.get(payloadItem.transaction_item_id)!;
        return {
          unit_price: row.unit_price,
          quantity: row.quantity,
          tax_amount: row.tax_amount || 0,
          refund_quantity: payloadItem.quantity,
        };
      }),
      tip_refund: tipRefund,
    });

    // Per-line exact-match check (tolerance 0).
    for (let i = 0; i < data.items.length; i++) {
      const clientCents = toCents(data.items[i].amount);
      const serverCents = recomputed.lineAmountsCents[i];
      if (clientCents !== serverCents) {
        return NextResponse.json(
          { error: `Refund line ${i + 1} amount mismatch: ...` },
          { status: 400 }
        );
      }
    }

    const totalRefundAmount = fromCents(recomputed.totalCents);

    // Allow $0 refunds when there's loyalty, coupon, or restock to reverse
    const hasLoyaltyToReverse = (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0);
    const hasCouponToReverse = !!transaction.coupon_id;
    const hasItemsToRestock = data.items.some((item) => item.restock);

    if (recomputed.totalCents <= 0 && !hasLoyaltyToReverse && !hasCouponToReverse && !hasItemsToRestock) {
      return NextResponse.json(
        { error: 'Nothing to refund — no payment, loyalty points, or items to restock' },
        { status: 400 }
      );
    }

    // Aggregate cap: refund total must not exceed amount paid minus already
    // refunded. +1¢ tolerance for legacy DB rows.
    if (recomputed.totalCents > 0) {
      const { data: existingRefunds } = await supabase
        .from('refunds')
        .select('amount')
        .eq('transaction_id', data.transaction_id)
        .eq('status', 'processed');
      const alreadyRefundedCents = (existingRefunds || []).reduce(
        (sum, r) => sum + toCents(r.amount), 0
      );
      const maxRefundableCents =
        toCents(transaction.total_amount) +
        toCents(transaction.tip_amount || 0) -
        alreadyRefundedCents;
      if (recomputed.totalCents > maxRefundableCents + 1) {
        return NextResponse.json(
          { error: `Refund amount ... exceeds maximum refundable ...` },
          { status: 400 }
        );
      }
    }

    // 1. If payment was card, issue Stripe refund FIRST
    const cardPayment = transaction.payments?.find(
      (p) => p.method === 'card'
    );
    let stripeRefundId: string | null = null;

    if (cardPayment?.stripe_payment_intent_id) {
      const stripeRefundAmount = Math.min(totalRefundAmount, cardPayment.amount || 0);
      if (stripeRefundAmount > 0) {
        try {
          const stripeRefund = await stripe.refunds.create({
            payment_intent: cardPayment.stripe_payment_intent_id,
            amount: Math.round(stripeRefundAmount * 100),
          });
          stripeRefundId = stripeRefund.id;
        } catch (stripeErr) {
          console.error('Stripe refund error:', stripeErr);
          return NextResponse.json(
            { error: 'Stripe refund failed. No records created.' },
            { status: 500 }
          );
        }
      }
    }

    // 2. Insert refund record
    const { data: refund, error: refundError } = await supabase
      .from('refunds')
      .insert({
        transaction_id: data.transaction_id,
        status: 'processed',
        amount: totalRefundAmount,
        reason: data.reason,
        processed_by: posEmployee.employee_id,
        stripe_refund_id: stripeRefundId,
      })
      .select('*')
      .single();

    if (refundError || !refund) {
      console.error('Refund insert error:', refundError);
      return NextResponse.json(
        { error: 'Failed to create refund record' },
        { status: 500 }
      );
    }

    // 3. Insert refund items
    const refundItemRows = normalizedItems.map((item, i) => ({
      refund_id: refund.id,
      transaction_item_id: item.transaction_item_id,
      quantity: item.quantity,
      amount: fromCents(recomputed.lineAmountsCents[i]),
      restock: item.disposition === 'restock',
      disposition: item.disposition,
    }));

    const { error: refundItemsError } = await supabase
      .from('refund_items')
      .insert(refundItemRows);

    if (refundItemsError) {
      console.error('Refund items insert error:', refundItemsError);
    }

    // 4. Inventory handling per disposition.
    for (const item of normalizedItems) {
      const { data: txItem } = await supabase
        .from('transaction_items')
        .select('product_id')
        .eq('id', item.transaction_item_id)
        .single();

      if (!txItem?.product_id) continue;

      const { data: prod } = await supabase
        .from('products')
        .select('quantity_on_hand, cost_price')
        .eq('id', txItem.product_id)
        .single();
      if (!prod) continue;

      const before = prod.quantity_on_hand;
      let after = before;
      let adjustmentType: AdjustmentType;
      let reasonPrefix: string;

      if (item.disposition === 'restock') {
        after = before + item.quantity;
        await supabase
          .from('products')
          .update({ quantity_on_hand: after })
          .eq('id', txItem.product_id);
        adjustmentType = 'returned';
        reasonPrefix = 'Refund — restocked';
      } else if (item.disposition === 'damaged') {
        adjustmentType = 'damaged';
        reasonPrefix = 'Refund — damaged / not resellable';
      } else {
        adjustmentType = 'customer_retained';
        reasonPrefix = 'Refund — customer kept item';
      }

      await logStockAdjustment({
        supabase,
        product_id: txItem.product_id,
        adjustment_type: adjustmentType,
        quantity_change: after - before,
        quantity_before: before,
        quantity_after: after,
        reason: `${reasonPrefix} (refund ${refund.id})`,
        reference_id: refund.id,
        reference_type: 'refund',
        created_by: posEmployee.employee_id,
        unit_cost: prod.cost_price ?? null,
      });
    }

    // 5. Adjust loyalty points if applicable
    let clawbackPoints = 0;
    let restoredPoints = 0;

    if (transaction.customer_id && (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0)) {
      const { data: customer } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', transaction.customer_id)
        .single();

      if (customer) {
        let runningBalance = customer.loyalty_points_balance;
        const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
        const isFullRefund = totalRefundAmount >= txFullAmount;

        // 5a. Restore redeemed points
        if (transaction.loyalty_points_redeemed > 0) {
          restoredPoints = isFullRefund
            ? transaction.loyalty_points_redeemed
            : Math.floor(transaction.loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));

          if (restoredPoints > 0) {
            runningBalance = runningBalance + restoredPoints;
            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: restoredPoints,
              points_balance: runningBalance,
              description: `Refund: restored ${restoredPoints} redeemed pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        // 5b. Claw back earned points
        if (transaction.loyalty_points_earned > 0) {
          clawbackPoints = isFullRefund
            ? transaction.loyalty_points_earned
            : Math.floor(transaction.loyalty_points_earned * (totalRefundAmount / transaction.total_amount));

          if (clawbackPoints > 0) {
            runningBalance = Math.max(0, runningBalance - clawbackPoints);
            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: -clawbackPoints,
              points_balance: runningBalance,
              description: `Refund: reversed ${clawbackPoints} earned pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: Math.max(0, runningBalance) })
          .eq('id', transaction.customer_id);
      }
    }

    // Store loyalty adjustments on the refund record
    if (clawbackPoints > 0 || restoredPoints > 0) {
      await supabase
        .from('refunds')
        .update({
          points_clawed_back: clawbackPoints,
          points_restored: restoredPoints,
        })
        .eq('id', refund.id);
    }

    // 6. Update transaction status
    const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
    const newStatus = totalRefundAmount >= txFullAmount
      ? 'refunded'
      : 'partial_refund';

    await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', transaction.id);

    // 7. Reverse coupon use_count + campaign metrics on full refund
    if (transaction.coupon_id && newStatus === 'refunded') {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('use_count, campaign_id')
        .eq('id', transaction.coupon_id)
        .single();

      if (coupon) {
        if (coupon.use_count > 0) {
          await supabase
            .from('coupons')
            .update({ use_count: coupon.use_count - 1 })
            .eq('id', transaction.coupon_id);
        }

        if (coupon.campaign_id) {
          const { data: camp } = await supabase
            .from('campaigns')
            .select('redeemed_count, revenue_attributed')
            .eq('id', coupon.campaign_id)
            .single();

          if (camp) {
            await supabase
              .from('campaigns')
              .update({
                redeemed_count: Math.max(0, (camp.redeemed_count || 0) - 1),
                revenue_attributed: Math.max(0, Math.round(((camp.revenue_attributed || 0) - transaction.total_amount) * 100) / 100),
              })
              .eq('id', coupon.campaign_id);
          }
        }
      }
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'refund',
      entityType: 'transaction',
      entityId: data.transaction_id,
      entityLabel: `Refund $${totalRefundAmount.toFixed(2)}`,
      details: {
        amount: totalRefundAmount,
        reason: data.reason,
        item_count: data.items.length,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: refund }, { status: 201 });
  } catch (err) {
    console.error('Refund create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### GET handler

There is **no** `GET` handler in `src/app/api/pos/refunds/route.ts`. Refund
retrieval is via the transaction fetch endpoints (which join `refunds` and
`refund_items` when populating the transaction-detail view). The receipt
templates also load refund rows through the transaction join, not via a
direct refund endpoint.

### Contract — request/response shape

**Request body** (`refundCreateSchema` from
`src/lib/utils/validation.ts:530-547`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `transaction_id` | UUID | yes | Must reference an existing transaction |
| `items` | array (≥1) | yes | One entry per refund line (see below) |
| `tip_refund` | number ≥ 0 | optional, default 0 | Dollars (not cents) |
| `reason` | required string | yes | Free-form text |

**Per-item shape** (`refundItemSchema`):

| Field | Type | Required | Notes |
|---|---|---|---|
| `transaction_item_id` | UUID | yes | Must match a row in `transaction_items` for this txn |
| `quantity` | int ≥ 1 | yes | Number of units to refund (≤ remaining unrefunded) |
| `amount` | number ≥ 0 | yes | Dollars; server enforces exact match against recomputed line cents |
| `disposition` | `'restock' \| 'damaged' \| 'customer_retained'` | optional | Required for products (UI gates send), legacy `restock` boolean fallback |
| `restock` | boolean | optional | Legacy field for cached PWA clients; mapped: true → `'restock'`, false → `'customer_retained'` |

**Response — success (201):**

```json
{ "data": { /* full refund row from refunds table */ } }
```

**Response — error (4xx/5xx):** `{ "error": "<message>" }` with status:

| Status | When |
|---|---|
| 400 | Missing/invalid Zod schema, unknown transaction_item_id, line-amount mismatch, status not in `['completed', 'partial_refund']`, nothing to refund, exceeds aggregate cap |
| 401 | Auth fail (`authenticatePosRequest` returned null) |
| 403 | Permission denied (`requirePermission('pos.issue_refunds')`) |
| 404 | Transaction not found |
| 500 | Stripe refund threw, refund insert failed, transaction_items fetch failed, generic catch |

### Order of operations (numbered list)

1. **Auth + permission gate.** `authenticatePosRequest` validates HMAC-signed
   POS JWT; `requirePermission('pos.issue_refunds')` checks role.
2. **Zod parse** of body into `data`. Reject 400 on schema fail.
3. **Disposition normalization.** Each item's `disposition` is set from
   `item.disposition` if present, else from legacy `item.restock` boolean
   (true → `'restock'`, false → `'customer_retained'`). Damaged is never
   inferred from the legacy field; legacy clients can't write damaged.
4. **Fetch transaction + payments** (`select('*, payments(*)')`).
5. **Status guard.** Reject if `transaction.status` ∉ `['completed', 'partial_refund']`.
6. **Fetch transaction_items.**
7. **Validate each payload item** has a matching `transaction_items.id`.
8. **Server recompute** refund amounts via `computeTotalRefundCents`.
9. **Per-line exact-match check** (tolerance 0) — client `amount * 100` must
   equal server-recomputed `lineAmountsCents[i]`. Reject 400 on any mismatch.
10. **Aggregate cap check.** Sum existing `refunds.amount` (status=`processed`)
    for this transaction. New refund + already-refunded must not exceed
    `total_amount + tip_amount` (with +1¢ legacy tolerance).
11. **Stripe refund call** (only if `transaction.payments[*].method === 'card'`
    and the row has a `stripe_payment_intent_id`). Capped at `cardPayment.amount`.
    On exception: return 500, **no DB rows created**. On success: capture
    `stripeRefundId`.
12. **Insert `refunds` row** with `status='processed'`, `amount`, `reason`,
    `stripe_refund_id`, `processed_by`. On error: return 500. **At this
    point, Stripe is debited but the DB row failed — money is out, no record.**
13. **Insert `refund_items` rows.** On error: log, but **continue silently**
    (no return). The refund row exists with no item children.
14. **For each refund item:** look up `product_id` from
    `transaction_items`, look up current `quantity_on_hand` and `cost_price`,
    branch on disposition:
    - `restock` → `UPDATE products SET quantity_on_hand = before + qty`,
      then `logStockAdjustment` with `adjustment_type='returned'`.
    - `damaged` → no products update, `logStockAdjustment` with
      `adjustment_type='damaged', quantity_change=0`.
    - `customer_retained` → no products update, `logStockAdjustment` with
      `adjustment_type='customer_retained', quantity_change=0`.
    Non-product refund items skip this block entirely (continue on
    `!txItem?.product_id`).
15. **Loyalty math + ledger writes.** If customer has redeemed/earned points
    on the original txn:
    - Restore redeemed (full or pro-rata of `totalRefundAmount /
      transaction.total_amount`) → ledger row + balance increment.
    - Claw back earned (same pro-rata formula, `Math.max(0, balance - …)`) →
      ledger row + balance decrement.
    - Single `customers.loyalty_points_balance` update at the end.
16. **Patch refund row** with `points_clawed_back`, `points_restored` if
    either non-zero.
17. **Update transaction status** to `'refunded'` (if total ≥ txn full amount)
    or `'partial_refund'`.
18. **Reverse coupon + campaign metrics** — *only* on full refund. Decrement
    `coupons.use_count` (clamped to ≥0) and, if linked, decrement
    `campaigns.redeemed_count` and subtract `transaction.total_amount` from
    `campaigns.revenue_attributed` (both clamped ≥0).
19. **Audit log row** to `audit_log` via `logAudit`.
20. **Return 201** with `{ data: refund }`.

### DB writes in order (with table + fields)

| # | Table | Op | Fields touched |
|---|---|---|---|
| 1 | `refunds` | INSERT | `transaction_id, status='processed', amount, reason, processed_by, stripe_refund_id` |
| 2 | `refund_items` | INSERT × N | `refund_id, transaction_item_id, quantity, amount, restock, disposition` |
| 3 | `products` | UPDATE × M (M = restocked items only) | `quantity_on_hand` |
| 4 | `stock_adjustments` | INSERT × P (P = product line refunds) | `product_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason, reference_id=refund.id, reference_type='refund', created_by, unit_cost` |
| 5 | `loyalty_ledger` | INSERT × 0–2 | `customer_id, transaction_id, action='adjusted', points_change, points_balance, description, created_by` |
| 6 | `customers` | UPDATE × 0–1 | `loyalty_points_balance` |
| 7 | `refunds` | UPDATE × 0–1 | `points_clawed_back, points_restored` |
| 8 | `transactions` | UPDATE × 1 | `status` |
| 9 | `coupons` | UPDATE × 0–1 (full refund only) | `use_count` |
| 10 | `campaigns` | UPDATE × 0–1 (full refund only) | `redeemed_count, revenue_attributed` |
| 11 | `audit_log` | INSERT × 1 (via `logAudit`) | per audit-log schema |

Implicit trigger writes:
- `tr_transactions_updated_at` fires on the `transactions` UPDATE → bumps
  `transactions.updated_at`.
- `tr_products_updated_at` fires on each `products` UPDATE.
- `tr_update_customer_stats` does **not** fire (it's `AFTER INSERT WHEN status =
  completed`, no UPDATE handling) — so `customers.lifetime_spend` and
  `visit_count` are **never reversed**, even on full refund. (Same defect as
  void path. Not in scope here, but worth noting.)

### Rollback story — what happens if step N fails?

There is **no SQL transaction wrapper** around any of this. Each Supabase
call is autocommitted. The Stripe call is also non-rollbackable from this
side (Stripe never gets told "actually, never mind"). Failure points:

| Step | Failure mode | Earlier writes |
|---|---|---|
| 1–10 (pre-Stripe) | Rejection paths return early; no DB writes attempted. | None. Safe. |
| 11 (Stripe call) | `stripe.refunds.create` throws → return 500 with `error: 'Stripe refund failed. No records created.'` | None. Safe. |
| 12 (insert `refunds` row) | DB insert error → return 500 `'Failed to create refund record'` | **Stripe is already debited.** No DB row exists. Customer's card has been refunded but the transaction is still `'completed'`. Operator must reconcile manually. |
| 13 (insert `refund_items`) | DB insert error → log, **continue without returning** | `refunds` row is orphaned (no children). Stripe debited. Inventory not yet touched. |
| 14 (inventory loop, per item) | Any sub-call (`txItem` lookup, `prod` lookup, `products UPDATE`, `logStockAdjustment`) silently fails | Earlier items in the loop already mutated `products` and wrote `stock_adjustments`. No retry. Inventory is partially restored. |
| 15 (loyalty) | Ledger insert or balance update silently fails | Some ledger rows written, others not. `customers.loyalty_points_balance` may not match the ledger sum. |
| 16 (refund patch) | Silently fails | `refunds.points_clawed_back / points_restored` stays at default `0` while ledger rows already wrote the deductions. |
| 17 (transactions UPDATE status) | Silently fails | Refund row exists with `processed`, but transaction status remains `completed`. Future refund-eligibility checks would still see it as refundable, breaking the aggregate cap. |
| 18 (coupons/campaigns) | Silently fails | Coupon `use_count` not decremented despite full refund. |
| 19 (audit log) | Silently fails (audit helper swallows errors) | Compliance trail incomplete. |

**Summary:** Steps 1–11 are atomic *together* (Stripe-before-DB). Steps 12–19
are a non-atomic chain. Once step 11 succeeds, Stripe is debited
unconditionally; subsequent DB failures leave the system in inconsistent
states with no automatic rollback. This is **acceptable in practice**
because the failures are rare and the audit log + Stripe dashboard provide
forensic recovery — but it is **not** an "all-or-nothing" guarantee.

### External service calls

Single external call: `stripe.refunds.create({ payment_intent, amount })` at
step 11. Position in flow: **before any DB writes, after all validation**.
No Mailgun, Twilio, QuickBooks, or other side-effects. (The admin online-
order refund route additionally fires `sendRefundEmail` — see Phase 7.)

---

## Phase 2 — Partial refund mathematics

### Detection: full vs partial

The route uses **two** distinct definitions of "full," and they don't agree:

1. **Loyalty pro-rata gate** (`route.ts:325`):
   `isFullRefund = totalRefundAmount >= transaction.total_amount + transaction.tip_amount`.
   When true, restore *all* redeemed and claw back *all* earned points.
   Otherwise, pro-rate by `totalRefundAmount / transaction.total_amount`.
2. **Final transaction status** (`route.ts:389-392`):
   `newStatus = totalRefundAmount >= txFullAmount ? 'refunded' : 'partial_refund'`,
   where `txFullAmount = transaction.total_amount + (transaction.tip_amount || 0)`.
   This matches the loyalty gate exactly.

The UI also has an **`isFullRefund`** check (`refund-dialog.tsx:197-205`)
that defines full as "every refundable line is selected at max-refundable
quantity." This drives whether `tip_refund` defaults to the full
`transaction.tip_amount` (full) or `0` (partial). The server doesn't
recompute that — it trusts the client's `tip_refund` value (with `≥ 0`
validation only) and re-derives full vs. partial from the resulting
`totalRefundAmount` against the transaction's total.

In practice these align: if the user selects every refundable unit and the
default tip refund is on, `totalRefundAmount = total_amount + tip_amount`,
so `isFullRefund` becomes true on the server. But edge cases (e.g.
two-step partial refunds that finally close out the transaction) can leave
the second refund satisfying the cap but with `isFullRefund = false` because
the second refund alone is not the full amount.

> **Edge case to flag:** A two-step refund (first partial, then close-out)
> where the *second* refund's `totalRefundAmount` does NOT exceed the txn
> total — the loyalty gate uses `totalRefundAmount`, not "cumulative refund
> total," so the second refund only restores pro-rated points. The first
> refund's pro-rated points were also restored. Sum may equal "full" or may
> drift by a `Math.floor` cent. This is per-call pro-rata, not cumulative.

### Refunded subtotal — derivation

Per `computePerUnitRefundableCents` (`refund-math.ts:61-82`):

```ts
const itemSubtotalCents = toCents(unit_price) * quantity;          // sale-time line subtotal cents
const itemTaxCents      = toCents(tax_amount);                     // sale-time line tax cents
const txSubtotalCents   = toCents(tx_subtotal);
const txDiscountCents   = toCents(tx_discount_amount);

const itemDiscountShare =
  txSubtotalCents > 0
    ? (itemSubtotalCents / txSubtotalCents) * txDiscountCents
    : 0;

const refundableCents = Math.max(0, itemSubtotalCents + itemTaxCents - itemDiscountShare);
return refundableCents / quantity;   // unrounded fractional cents per unit
```

Multiplied by `refund_quantity` then `Math.round()`'d *once* per line.

### Tax — proportional to selected refund quantity

Tax is **per-unit** in the per-unit refundable. There is no separate
"refunded tax" field on `refund_items` — it's baked into the single
`amount` column. The line's stored `tax_amount` is sale-time
`unit_price * quantity * TAX_RATE` rounded to cents (per the comment block at
`refund-math.ts:26-37`); refunding qty `r` of `q` returns `(r/q)`-share of
the tax, fractional, rolled into the per-unit refundable, then rounded once.

### Tip — flat, not pro-rated

Tip refund is **client-controlled**, captured as a top-level `tip_refund`
field. The UI defaults it to `transaction.tip_amount` when every
refundable line is selected at max qty (full refund), and `0` otherwise. The
server validates `tip_refund ≥ 0` but does not pro-rate. A partial refund
with non-zero `tip_refund` is technically valid; the UI just doesn't
construct one.

### Loyalty pro-ration

For partials (`!isFullRefund`):

```ts
restoredPoints   = Math.floor(loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));
clawbackPoints   = Math.floor(loyalty_points_earned   * (totalRefundAmount / transaction.total_amount));
```

Notes:
- The denominator is `transaction.total_amount`, **not** `total_amount +
  tip`. So a refund equaling `total_amount` exactly (no tip) yields ratio
  `1.0`, restoring 100% — but `isFullRefund` is false because the gate
  compared against `total_amount + tip`. So a refund of `total_amount` (no
  tip) takes the `Math.floor(... * 1.0)` path on the same numbers as the
  full-refund path. Result is the same in this case, but the path
  divergence is worth noting.
- `Math.floor` means the sum across multiple partial refunds may be **off
  by 1 point per partial**. Five partials of 20% on a 100-point earn could
  yield `Math.floor(100 * 0.2) * 5 = 100`, OR if the actual ratio is
  `19.999/100`, `Math.floor(19.999) * 5 = 95`. Each partial's
  `totalRefundAmount` is independent.

### Coupon / campaign on partial

Coupon `use_count` and campaign metrics are **NOT reversed on partial
refunds**. The check is `if (transaction.coupon_id && newStatus === 'refunded')`
— `'partial_refund'` falls through. The original sale's coupon usage is
preserved on the campaign attribution; only fully refunding a coupon-
discounted transaction backs it out. This is a deliberate behavioral
choice (the coupon was used, even if some money came back), but worth
flagging for the void mirror.

### Money-math principles in use

The route follows the four invariants documented at `refund-math.ts:1-38`:

1. **`toCents` / `fromCents` only** — no inline `* 100` / `/ 100` for money
   conversions.
2. **Single rounding per line** at `Math.round(perUnitCents *
   refund_quantity)` in `computeRefundLineAmountCents`. Per-unit values
   carry fractional cents up to the multiplication.
3. **Residual redistribution** — `distributeResidualCents` allocates any
   ±N¢ between the per-line rounding sum and the target rounded sum to the
   largest-abs lines first (stable: ties broken by index). Multi-line
   refunds with discounts always sum to the target total exactly.
4. **Server recompute + exact-match enforcement** — client-sent `amount`
   must equal server-recomputed `lineAmountsCents[i]` exactly (tolerance 0).
   Both client and server import the helpers from the same file.

### Quote of the math utility

```ts
// src/lib/utils/refund-math.ts:40-46
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
export function fromCents(cents: number): number {
  return cents / 100;
}

// :61-82
export function computePerUnitRefundableCents(params: PerUnitInput): number {
  const { unit_price, quantity, tax_amount, tx_subtotal, tx_discount_amount } = params;
  if (quantity <= 0) return 0;
  const itemSubtotalCents = toCents(unit_price) * quantity;
  const itemTaxCents      = toCents(tax_amount);
  const txSubtotalCents   = toCents(tx_subtotal);
  const txDiscountCents   = toCents(tx_discount_amount);
  const itemDiscountShare =
    txSubtotalCents > 0
      ? (itemSubtotalCents / txSubtotalCents) * txDiscountCents
      : 0;
  const refundableCents = Math.max(0, itemSubtotalCents + itemTaxCents - itemDiscountShare);
  return refundableCents / quantity;
}

// :92-95
export function computeRefundLineAmountCents(params: LineAmountInput): number {
  const perUnitCents = computePerUnitRefundableCents(params);
  return Math.round(perUnitCents * params.refund_quantity);
}

// :122-155
export function computeTotalRefundCents(params: TotalRefundInput): TotalRefundResult {
  const { transaction, items, tip_refund } = params;
  const tx = {
    tx_subtotal: transaction.subtotal,
    tx_discount_amount: transaction.discount_amount,
  };
  if (items.length === 0) {
    return { lineAmountsCents: [], totalCents: toCents(tip_refund) };
  }
  let totalRefundableCents = 0;
  for (const item of items) {
    const perUnit = computePerUnitRefundableCents({ ...item, ...tx });
    totalRefundableCents += perUnit * item.refund_quantity;
  }
  const targetTotalCents = Math.round(totalRefundableCents);
  const lineAmounts = items.map((item) =>
    computeRefundLineAmountCents({ ...item, ...tx })
  );
  const summedLines = lineAmounts.reduce((sum, n) => sum + n, 0);
  const residual = targetTotalCents - summedLines;
  const redistributed = distributeResidualCents(lineAmounts, residual);
  const tipRefundCents = toCents(tip_refund);
  const totalCents =
    redistributed.reduce((sum, n) => sum + n, 0) + tipRefundCents;
  return { lineAmountsCents: redistributed, totalCents };
}
```

### Worked example: 5 units × $10 + tax, refund 2 units

Assume:
- `unit_price = 10.00`
- `quantity = 5`
- `tax_amount = 5 * 10 * 0.0975 = 4.875` → stored as `4.88` (rounded once at sale time)
- `tx_subtotal = 50.00`
- `tx_discount_amount = 0.00`
- `tip_amount = 5.00` (not refunded for partial)
- `refund_quantity = 2`

Per-unit refundable:
- `itemSubtotalCents = 1000 * 5 = 5000`
- `itemTaxCents = 488`
- `itemDiscountShare = 0`
- `refundableCents = max(0, 5000 + 488 - 0) = 5488`
- per-unit cents = `5488 / 5 = 1097.6` (fractional)

Line amount (single rounding at the end):
- `Math.round(1097.6 * 2) = Math.round(2195.2) = 2195` cents → **$21.95**

Total (no tip on partial, `tip_refund = 0`):
- `targetTotalCents = Math.round(1097.6 * 2) = 2195` (only one line, so target = line)
- `summedLines = 2195`, `residual = 0`, no redistribution
- `totalCents = 2195 + 0 = 2195` → **$21.95**

If you instead refunded 5 units (full line):
- `Math.round(1097.6 * 5) = Math.round(5488) = 5488` → **$54.88**, exactly
  matching `unit_price * quantity + tax_amount` as expected.

### Worked example with discount

Same line but with `tx_discount_amount = $4.00` (e.g. a coupon $4 off the
subtotal). Single line so its discount share = full $4.

- `itemSubtotalCents = 5000`, `itemTaxCents = 488`, `itemDiscountShare = 400`
- `refundableCents = max(0, 5000 + 488 - 400) = 5088`
- per-unit cents = `5088 / 5 = 1017.6`
- refund 2: `Math.round(1017.6 * 2) = Math.round(2035.2) = 2035` → **$20.35**

Tax stayed at $4.88 (per-unit pro-rata $1.95 × 2 = $3.90 reflected in the
line), discount share is $1.60 (per-unit $0.80 × 2). Net:
`($10 × 2) + $3.90 - $1.60 = $22.30`. Hmm — that doesn't match $20.35. Let
me retrace:

- per-unit refundable cents = `5088 / 5 = 1017.6`
- × 2 = `2035.2` cents = $20.35

Versus expected:
- subtotal contribution: $10 × 2 = $20.00 (cents 2000)
- tax contribution per-unit: $4.88 / 5 = $0.976 → × 2 = $1.952 (cents 195.2)
- discount per-unit share: $4 × ($50/$50) = $4 total / 5 units × 2 = $1.60
  (cents 160)
- net: 2000 + 195.2 - 160 = 2035.2 cents = $20.35 ✅

Math checks out. The "expected" $22.30 above was my arithmetic mistake
(forgot to subtract the discount share). The formula is correct.

### Notes on edge cases

- **Items with `quantity = 0`** at sale time: `computePerUnitRefundableCents`
  returns 0 (guard at `:64`). Refund line for such an item would be $0.
- **Items where `unit_price = 0`** (free items, comp lines): per-unit is
  `Math.max(0, 0 + tax - discount/q)` — typically 0 for fully-free items.
  Refund is 0 dollars but disposition + audit row still write.
- **Negative discount** (rare but possible if storage allows): the formula
  doesn't guard against `txDiscountCents < 0`. If `tx_discount_amount` were
  negative, the refundable would be inflated. Not expected in practice;
  flag if sale flow ever stores a negative discount.

---

## Phase 3 — Stripe refund interaction

### Position in flow

Stripe is called at step 11, **before any of the 8 subsequent DB writes**.
Source (`route.ts:186-210`):

```ts
// 1. If payment was card, issue Stripe refund FIRST (before inserting records)
const cardPayment = transaction.payments?.find(
  (p: { method: string }) => p.method === 'card'
);
let stripeRefundId: string | null = null;

if (cardPayment?.stripe_payment_intent_id) {
  // Cap Stripe refund at card payment amount (rest was cash/check)
  const stripeRefundAmount = Math.min(totalRefundAmount, cardPayment.amount || 0);
  if (stripeRefundAmount > 0) {
    try {
      const stripeRefund = await stripe.refunds.create({
        payment_intent: cardPayment.stripe_payment_intent_id,
        amount: Math.round(stripeRefundAmount * 100),
      });
      stripeRefundId = stripeRefund.id;
    } catch (stripeErr) {
      console.error('Stripe refund error:', stripeErr);
      return NextResponse.json(
        { error: 'Stripe refund failed. No records created.' },
        { status: 500 }
      );
    }
  }
}
```

### Failure: Stripe call fails

The `try/catch` returns 500 with the error string, no DB writes have been
attempted yet. **Safe.** Customer's card was not refunded (or Stripe
rejected the refund). Operator sees the error toast, can retry.

Common Stripe failure modes the catch covers:
- Network error / timeout
- `payment_intent` not found (bad data)
- `amount` exceeds remaining refundable on Stripe's side (already partially
  refunded outside the app)
- `charge_already_refunded` (full refund issued externally)
- Decline due to negative balance (rare, but possible on a connected acct)

### Failure: Stripe succeeds but DB write fails

Step 12 (insert `refunds` row) is the first DB write. If it fails, the
error response is `'Failed to create refund record'` (500), but **Stripe is
already debited**. The customer's card sees the refund in their statement;
the app has no row recording it. There is no automatic rollback or
compensation.

Recovery requires an operator to:
1. Notice the discrepancy (Stripe dashboard shows refund, app shows none).
2. Insert the `refunds` row manually using the Stripe refund id from the
   dashboard, OR retry the refund — which would call Stripe again.

If the operator retries, the second call to `stripe.refunds.create` would
**not** be deduplicated (no idempotency key — see below), so Stripe issues a
*second* partial refund. If the second attempt's DB writes succeed, the app
records `refunds.amount = total` while Stripe has refunded `2 × total`.

> **Severity:** Real but rare. Step-12 failures happen primarily on
> transient DB outages or network issues. Adding an `idempotency_key:
> 'pos-refund-' + transaction_id + '-' + clientGeneratedId` to the Stripe
> call would make retries safe; it is currently not implemented.

### Idempotency

There is **no Stripe idempotency key** on `stripe.refunds.create`. Two
sequential calls with the same parameters issue two refunds. The route
relies on:
- The client wrapping the call in a `processing` boolean to disable the
  button while in flight (`refund-dialog.tsx:219-263`).
- The aggregate-cap check (step 10) to reject a re-submitted refund whose
  *first* attempt landed a `refunds` row (so the cap is reduced by the
  first refund's amount).

Neither helps for the "Stripe succeeded, DB failed" case where no
`refunds` row exists yet. A user retrying immediately would double-refund
on Stripe before the cap can save them.

There **is** a request-level guard from `posFetch` that doesn't retry 500s
automatically, but a user pressing the button twice rapidly bypasses that
entirely. Recommendation (out of scope here): add a Stripe idempotency key
based on transaction id + client request nonce.

### Terminal vs CNP

Stripe Terminal (in-store reader) and card-not-present (CNP, e.g. saved-on-
file payments via portal) both store their `payment_intent` id in
`payments.stripe_payment_intent_id` from the original sale. The refund
route **does not branch on terminal vs CNP** — it just calls
`stripe.refunds.create({ payment_intent, amount })`. Stripe's API handles
the routing based on the payment intent's metadata.

There is no special handling for:
- Terminal refunds requiring the physical card present (Stripe Terminal
  refund flows can require this for some card networks, but the API call
  shape is identical — it's the user-experience constraint that differs).
- Tip-on-tip card adjustments from Terminal (where the captured amount
  differs from the auth amount). The refund caps at `cardPayment.amount`
  which is the captured/charged amount on the original sale's payment
  row, so the cap stays correct.

### Non-card payments

If the sale was **cash** or **check** (no `stripe_payment_intent_id`), the
Stripe block is skipped. `stripeRefundId` stays null, and the refund row is
inserted with no Stripe link. The cashier is responsible for handing back
the physical cash/check. The app does not enforce or record the cash-back
event beyond the audit log.

### Mixed-payment transactions

Transactions can have multiple `payments` rows (e.g. $50 cash + $50 card).
The route uses `transaction.payments?.find((p) => p.method === 'card')` —
**first card payment only**. If a transaction has two card payments (rare
but allowed by schema), only the first is refunded via Stripe. The
`stripeRefundAmount = Math.min(totalRefundAmount, cardPayment.amount || 0)`
caps it at *that* one card payment's amount. The remainder is treated as
cash refund (no Stripe call, no automatic mechanism).

> **Edge case to flag:** Transactions split across two card payments would
> under-refund via Stripe. Not expected in current POS UX (single tender
> per sale typical), but the schema permits it.

---

## Phase 4 — Disposition logic

### UI selection

Disposition is selected in the "Confirm" step of the refund dialog
(`refund-dialog.tsx:62, 232; refund-summary.tsx:30-66, 184-215`). It has
**two layers**:

1. **All-items disposition** (top-level radio): `'restock' | 'damaged' |
   'customer_retained' | 'mixed' | null`. Default `null` (must select to
   proceed). When set to one of the first three, the same disposition
   applies to every product line.
2. **Per-line disposition** (radio per line, only visible when
   all-items = `'mixed'`): one of `'restock' | 'damaged' | 'customer_retained'`.

Service / non-product items always serialize to `'customer_retained'`
unconditionally (`refund-dialog.tsx:230-232`):

```ts
disposition:
  entry.item.item_type !== 'product'
    ? 'customer_retained'
    : allDisposition && allDisposition !== 'mixed'
      ? allDisposition
      : entry.disposition,
```

This is enforced both in the UI gate (`hasProductItems` check skips the
disposition picker entirely if no product items) and in the payload
construction.

### Storage on `refund_items`

`refund_items` table (`migrations/20260201000019_create_refunds.sql`,
extended by `migrations/20260420000001_extend_stock_adjustments.sql:33-39`):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `refund_id` | UUID NOT NULL | FK → refunds (cascade delete) |
| `transaction_item_id` | UUID NOT NULL | FK → transaction_items (restrict) |
| `quantity` | INT NOT NULL DEFAULT 1 | |
| `amount` | DECIMAL(10,2) NOT NULL | dollars |
| `restock` | BOOL NOT NULL DEFAULT false | **legacy column** |
| `disposition` | TEXT (CHECK in `('restock','damaged','customer_retained')`) | added Session 37 |
| `created_at` | TIMESTAMPTZ | |

The route (`route.ts:236-243`) writes **both** `restock` and `disposition`:

```ts
const refundItemRows = normalizedItems.map((item, i) => ({
  refund_id: refund.id,
  transaction_item_id: item.transaction_item_id,
  quantity: item.quantity,
  amount: fromCents(recomputed.lineAmountsCents[i]),
  restock: item.disposition === 'restock',
  disposition: item.disposition,
}));
```

The legacy `restock` boolean is `true` only when `disposition === 'restock'`.
`damaged` and `customer_retained` both write `restock = false`. Old code
that reads `restock` as the source of truth misclassifies damaged as
"customer kept" (both false), but no current code relies on `restock` over
`disposition`.

### Per-disposition effects

| Disposition | `products.quantity_on_hand` | `stock_adjustments` row | reason text |
|---|---|---|---|
| `restock` | `+= quantity` (UPDATE) | `adjustment_type='returned'`, `quantity_change=+qty`, `before` → `after` | `Refund — restocked (refund <id>)` |
| `damaged` | unchanged | `adjustment_type='damaged'`, `quantity_change=0`, `before==after` | `Refund — damaged / not resellable (refund <id>)` |
| `customer_retained` | unchanged | `adjustment_type='customer_retained'`, `quantity_change=0`, `before==after` | `Refund — customer kept item (refund <id>)` |
| (non-product line) | n/a | none — block skipped via `if (!txItem?.product_id) continue;` | n/a |

Every product disposition writes a row, even when quantity doesn't change.
That gives stock-history a complete refund footprint for every item, with
the disposition reason in plain text.

`stock_adjustments` audit row (consistent for all three product
dispositions):
- `reference_type = 'refund'`
- `reference_id = refund.id` (note: the refund row id, **not** the
  transaction id — refunds reference up to transactions, audit rows
  reference back to refunds)
- `created_by = posEmployee.employee_id`
- `unit_cost = prod.cost_price ?? null` (snapshot at refund time)

### Mutability after creation

There is **no API endpoint** to edit a refund or its disposition after
creation. No `PATCH`, no `PUT`, no admin override. To change disposition
on a refund that's already landed:
- Operator must manually correct via Supabase Studio (touches
  `refund_items.disposition`, `refund_items.restock`, possibly
  `products.quantity_on_hand`, and write a compensating `stock_adjustments`
  row).
- Or issue a *second* refund of zero dollars with a different disposition
  — but that requires a refundable line, which is gone after the first
  refund. Not actually doable through the UI.

In practice, errors are corrected by manual Supabase intervention. No code
path supports "change disposition on existing refund."

---

## Phase 5 — Coupon and campaign reversal

### When it fires

`route.ts:399-433`:

```ts
// 7. Reverse coupon use_count + campaign metrics on full refund
if (transaction.coupon_id && newStatus === 'refunded') {
  // ...decrement coupon use_count, decrement campaign metrics...
}
```

Two conditions, both must be true:
1. `transaction.coupon_id IS NOT NULL` — original sale used a coupon.
2. `newStatus === 'refunded'` — this refund makes the transaction fully
   refunded (i.e. `totalRefundAmount >= total_amount + tip_amount`).

**Partial refunds do not reverse coupons or campaigns.** A 99% partial
refund leaves `use_count` and `redeemed_count` incremented as if the coupon
was used in full. The reasoning (inferred from the design): a coupon is
"consumed" by the act of redemption; partial refund of money doesn't unwind
that.

### Coupon `use_count`

```ts
if (coupon.use_count > 0) {
  await supabase
    .from('coupons')
    .update({ use_count: coupon.use_count - 1 })
    .eq('id', transaction.coupon_id);
}
```

- Decrement by 1.
- Clamped at `> 0` — won't go negative even if `use_count` is somehow 0
  (corruption guard).
- **Race:** read `use_count`, write `use_count - 1`. Two concurrent full
  refunds of two different transactions sharing the same coupon could each
  read the same value and double-decrement (lost-update). Acceptable
  given low concurrency and the impossibility of two concurrent refunds
  from a single POS session.

### Campaign metrics

```ts
if (coupon.campaign_id) {
  const { data: camp } = await supabase
    .from('campaigns')
    .select('redeemed_count, revenue_attributed')
    .eq('id', coupon.campaign_id)
    .single();
  if (camp) {
    await supabase
      .from('campaigns')
      .update({
        redeemed_count: Math.max(0, (camp.redeemed_count || 0) - 1),
        revenue_attributed: Math.max(
          0,
          Math.round(((camp.revenue_attributed || 0) - transaction.total_amount) * 100) / 100
        ),
      })
      .eq('id', coupon.campaign_id);
  }
}
```

- `redeemed_count` decremented by 1, clamped ≥ 0.
- `revenue_attributed` decremented by `transaction.total_amount` (note:
  excludes tip), clamped ≥ 0, rounded to cents via `Math.round((x) *
  100) / 100`. This is the *only* money calculation in the route that
  uses the inline `* 100 / 100` pattern instead of `toCents` / `fromCents`
  — a minor inconsistency. Doesn't produce drift here because `Math.round`
  is the single rounding site, but it's stylistically out of step with
  refund-math.ts invariants.

### Multiple coupons stacked

`transactions.coupon_id` is a single column, not an array. The schema
permits **only one coupon per transaction**. The voucher / promo handling
in POS likewise only attaches one. So "multiple stacked coupons" is not a
case the refund code must handle — it's prevented at the sale level.

If the user combines a coupon with loyalty redemption, the loyalty
redemption is tracked separately (`loyalty_points_redeemed` on the
transaction) and is reversed via the loyalty block (Phase 6). The single
coupon block here only handles the `coupon_id` field.

### Percentage vs dollar coupon

The refund logic does not branch on coupon type. It decrements
`use_count` by 1 regardless, and decrements `revenue_attributed` by the
`transaction.total_amount`. The `transaction.total_amount` already
reflects the discount applied at sale time (it's net of the coupon
discount), so for both percentage and dollar-off coupons, the
attribution decrement matches what was originally attributed.

> **Implicit assumption:** The original sale's `revenue_attributed`
> contribution was `transaction.total_amount` (net total after the
> coupon's discount). If campaign tracking ever changes to track gross
> revenue or to add back the discount amount, this reversal logic would
> drift. The reversal mirrors whatever the sale-time addition does — but
> there's no shared helper, so a future change to one side could miss
> the other.

---

## Phase 6 — Loyalty reversal

### Earned-points clawback math

`route.ts:348-367`:

```ts
if (transaction.loyalty_points_earned > 0) {
  clawbackPoints = isFullRefund
    ? transaction.loyalty_points_earned
    : Math.floor(transaction.loyalty_points_earned * (totalRefundAmount / transaction.total_amount));
  if (clawbackPoints > 0) {
    runningBalance = Math.max(0, runningBalance - clawbackPoints);
    await supabase.from('loyalty_ledger').insert({
      customer_id: transaction.customer_id,
      transaction_id: transaction.id,
      action: 'adjusted',
      points_change: -clawbackPoints,
      points_balance: runningBalance,
      description: `Refund: reversed ${clawbackPoints} earned pts`,
      created_by: posEmployee.employee_id,
    });
  }
}
```

**Worked example:** Customer earned 10 points on a $100 sale and refunds
$40 (no tip).
- `isFullRefund = (40 >= 100) = false` → take pro-rata path.
- `clawbackPoints = Math.floor(10 * (40 / 100)) = Math.floor(4) = 4`.
- 4 points clawed back, ledger row written with `points_change = -4`.

If the customer's current balance is below 4, `Math.max(0, balance - 4)`
prevents going negative. The ledger row records the *attempted* clawback
(`points_change = -4`) but the balance might end at 0 instead of `balance
- 4`. Reconstruction-from-ledger would be off by `4 - balance` in that
case — a known-acceptable invariant violation when balance was already low.

### Redeemed-points restoration math

`route.ts:327-346`:

```ts
if (transaction.loyalty_points_redeemed > 0) {
  restoredPoints = isFullRefund
    ? transaction.loyalty_points_redeemed
    : Math.floor(transaction.loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));
  if (restoredPoints > 0) {
    runningBalance = runningBalance + restoredPoints;
    await supabase.from('loyalty_ledger').insert({
      customer_id: transaction.customer_id,
      transaction_id: transaction.id,
      action: 'adjusted',
      points_change: restoredPoints,
      points_balance: runningBalance,
      description: `Refund: restored ${restoredPoints} redeemed pts`,
      created_by: posEmployee.employee_id,
    });
  }
}
```

**Worked example:** Customer redeemed 50 points (= $5 off) on a $50 sale
and refunds $25.
- Sale's `total_amount` was the post-redemption amount: $50 - $5 = $45.
  Wait, that depends on whether the loyalty redemption is recorded as
  `loyalty_discount` or as a transaction-level discount. Reading the sale
  route's handling (out of scope here, but the convention is that
  `loyalty_discount` is captured separately from `discount_amount`),
  `transaction.total_amount` for this sale would be $45 (or $50 - $5 + tax,
  depending on tax-on-discount rules — but the structure stays the same).
- For a $25 refund on a $45 sale: ratio = 25/45 ≈ 0.5556.
- `restoredPoints = Math.floor(50 * 0.5556) = Math.floor(27.78) = 27`.
- 27 of the 50 redeemed points are restored. Ledger row with
  `points_change = +27`.

This is **proportional** restoration. Not 50, not 25. The user prompt
asked "are 25 points restored or 50?" — answer is **27** (or floor of the
proportional value, which depends on the exact `total_amount` used in the
denominator).

> **Subtle point:** The denominator is `transaction.total_amount`, and
> `transaction.total_amount` already reflects the loyalty discount applied
> at sale time (i.e. it's the post-redemption charge). So a $25 refund on
> a $45 sale where 50 points were redeemed yields 27 points restored — not
> 50 (which would be "everything") and not 25 (which doesn't have a
> grounding in any formula here).

### Single balance update

After both ledger rows write, a single `customers.loyalty_points_balance`
update sets the new balance:

```ts
await supabase
  .from('customers')
  .update({ loyalty_points_balance: Math.max(0, runningBalance) })
  .eq('id', transaction.customer_id);
```

`runningBalance` accumulates across the two ledger writes. Final clamp
prevents negative.

### `refunds` patch

If either `clawbackPoints > 0` or `restoredPoints > 0`, patch the refund
row (`route.ts:378-386`) to record the values:

```ts
await supabase
  .from('refunds')
  .update({
    points_clawed_back: clawbackPoints,
    points_restored: restoredPoints,
  })
  .eq('id', refund.id);
```

Schema columns from `migrations/20260318000001_refunds_loyalty_columns.sql`.

### `loyalty_ledger` rows

Per ledger row written:

| Column | Value |
|---|---|
| `customer_id` | `transaction.customer_id` |
| `transaction_id` | `transaction.id` (the original transaction, **not** the refund id) |
| `action` | `'adjusted'` |
| `points_change` | signed integer (positive for restore, negative for clawback) |
| `points_balance` | running balance after this row's change |
| `description` | `'Refund: restored N redeemed pts'` or `'Refund: reversed N earned pts'` |
| `created_by` | POS employee id |

Note: there is **no `refund_id` column** on `loyalty_ledger`. The link
back to the refund is via `transaction_id` and `description` text. If a
transaction has multiple partial refunds, all loyalty ledger rows from
all refunds share the same `transaction_id` — recovering "which ledger
row came from which refund" requires parsing the description or using
timestamps. Acceptable for current use cases; flag as forensic friction.

---

## Phase 7 — Admin online-order refund (separate route)

### File

`src/app/api/admin/orders/[id]/refund/route.ts` (137 lines, single `POST`).

### Why a separate route

POS refunds operate on `transactions` (in-store sales recorded via the POS
transaction create flow). Online-order refunds operate on `orders`
(e-commerce purchases via the storefront, paid via Stripe Checkout-like
flow with `payment_intent.succeeded` webhook). The two have:

- **Different schemas.** `orders` has `total` (in **cents** — note this
  contrast), `payment_status`, `stripe_payment_intent_id`, `order_items`.
  `transactions` has `total_amount` (in dollars), `status`, `payments(*)`,
  `transaction_items`.
- **Different state machines.** Online orders go through `pending → paid →
  fulfilled → shipped → delivered`, with `payment_status` separately tracking
  `paid → partially_refunded → refunded`. POS transactions go through
  `open → completed → voided | refunded | partial_refund`.
- **Different reversibility.** POS transactions can be voided;
  online orders cannot.
- **Different audit trail.** Orders use `order_events` (not `audit_log`) for
  state transitions; POS uses `audit_log` only.

### Differences from POS refund

| Aspect | POS refund (`/api/pos/refunds`) | Admin order refund (`/api/admin/orders/[id]/refund`) |
|---|---|---|
| Auth | POS HMAC + `pos.issue_refunds` perm | Admin session cookie + `orders.manage` perm |
| Money unit in body | dollars | **cents** (`body.amount` in cents) |
| Stripe call position | step 11 of ~20 (after validation) | early — after fetching order, before any DB writes |
| Per-item disposition | yes — `restock`/`damaged`/`customer_retained` | **no** — implicit "restock all" |
| `stock_adjustments` audit row | yes, per item, every disposition | **no — silent qty mutation** |
| Loyalty reversal | yes (full + pro-rata) | **no** |
| Coupon `use_count` reversal | yes (full only) | **no** |
| Campaign metrics reversal | yes (full only) | **no** |
| Customer lifetime spend reversal | no (defect) | no (defect) |
| Refund email | no | yes — `sendRefundEmail` fire-and-forget |
| Audit log entry | yes (`logAudit('refund', 'transaction')`) | yes (`logAudit('refund', 'order')`) |
| Order events row | n/a | yes — inserted into `order_events` |
| Per-line refund granularity | yes — array of items | **no — single aggregate `body.amount`** |
| Partials | yes | yes (via `body.amount < order.total`) |

### Quote of the silent qty-mutation block

`src/app/api/admin/orders/[id]/refund/route.ts:82-98`:

```ts
// Restore stock for each order item
const items = order.order_items || [];
for (const item of items) {
  if (item.product_id) {
    const { data: product } = await admin
      .from('products')
      .select('quantity_on_hand')
      .eq('id', item.product_id)
      .single();
    if (product) {
      await admin
        .from('products')
        .update({ quantity_on_hand: product.quantity_on_hand + item.quantity })
        .eq('id', item.product_id);
    }
  }
}
```

**Defects:**
1. Mutates `products.quantity_on_hand` with no `stock_adjustments` audit
   row. Stock-history will not reflect this restoration. (Verified Session
   42M.)
2. Does not branch on disposition — always full restock, even for damaged-
   on-arrival or customer-kept goodwill scenarios.
3. Restores **full original quantity per item**, regardless of partial
   refund amount. A $5 partial refund on a $50 order containing a 5-unit
   product line restores all 5 units to inventory. There is no per-item
   refund-quantity input — the route only takes a single aggregate
   `amount` in cents.

### Partials handling

The route supports `body.amount` (in cents). If omitted, full refund. If
provided and `< order.total`, partial. Logic:

```ts
const refundAmount = body.amount ? Math.min(body.amount, order.total) : order.total;
const isFullRefund = refundAmount >= order.total;
```

But the inventory restoration block runs **regardless of `isFullRefund`**.
Every partial refund restores 100% of every order item's quantity. This is
either a bug or a deliberately-coarse approximation — flagging.

`payment_status` is set to `'refunded'` if full, `'partially_refunded'` if
partial. There's no granularity on which lines are refunded; it's a single
aggregate dollar amount.

### Stripe interaction

Stripe is called via `stripe.refunds.create({ payment_intent, amount?,
reason: 'requested_by_customer' })` at line 60. **Position: before all DB
writes** (order status update, order_events insert, products mutation,
email).

If Stripe throws, the `try/catch` at lines 130-136 returns 500 with the
Stripe error message — no DB writes. Same shape as POS refund's pattern.

If Stripe succeeds and DB writes fail: same hazard as POS refund, but
worse because `order_events` row also won't be inserted, and the email
also won't fire (it's fire-and-forget after the events insert).

There's also an early-return guard:

```ts
if (order.payment_status === 'refunded') {
  return NextResponse.json({ error: 'Order has already been fully refunded' }, { status: 400 });
}
```

That blocks duplicate full refunds. There's **no check for
`partially_refunded` accumulation** — multiple partial refunds of the same
order can be issued, and the route doesn't deduct previously-refunded
amounts before calling Stripe. So `body.amount = order.total / 2` on a
fully-paid order with one prior 50% refund would attempt to refund 50%
again, and Stripe would presumably reject it as exceeding the remaining
refundable. Soft idempotency via Stripe rejection, not via app guard.

### `order_events` row

`route.ts:70-80`:

```ts
await admin.from('order_events').insert({
  order_id: id,
  event_type: isFullRefund ? 'refunded' : 'partially_refunded',
  description: `${isFullRefund ? 'Full' : 'Partial'} refund of $${(refundAmount / 100).toFixed(2)} processed${body.reason ? `: ${body.reason}` : ''}`,
  metadata: {
    refund_id: refund.id,
    amount: refundAmount,
    reason: body.reason || null,
  },
  created_by: employee.id,
});
```

This is the structured event log for orders. Refund details (Stripe id,
amount in cents, reason) live in metadata. There's no companion
`stock_adjustments` row — the only restoration audit is this single
`order_events` row, and it doesn't cite per-product restoration counts.

---

## Phase 8 — Refund vs Void: complete differences matrix

| # | Refund step | Void should | Annotation |
|---|---|---|---|
| 1 | Auth + HMAC + `pos.issue_refunds` perm | Auth + HMAC + `pos.void_transactions` perm | **Mirror with modification:** different permission key. Both already correct in their respective routes. |
| 2 | Zod parse refund body | Zod parse void body (currently no body — `{ action: 'void' }` only) | **New:** void could optionally accept a per-line override structure if Phase 9 Q1 says yes. Default: empty body still works (full restock). |
| 3 | Disposition normalization | n/a — void implies `restock` for every product line | **Skip:** void = always restock (per Phase 10 Q1 of Session 42M, recommended path). |
| 4 | Fetch transaction + payments | Fetch transaction (no payments needed for current "in-store concept" void) | **Mirror with modification:** void can skip the `payments(*)` join unless Phase 9 Q2 says void should also Stripe-refund. |
| 5 | Status guard `['completed', 'partial_refund']` | Status guard `['completed']` only | **Mirror with modification:** narrower allowed set. Voiding a partially-refunded transaction is a Phase 9 open question. |
| 6 | Bulk fetch `transaction_items` | Bulk fetch `transaction_items` | **Mirror exactly.** Already in current refund pattern; void needs this to know what to restore. |
| 7 | Validate payload items match transaction_items | n/a (no payload items) | **Skip.** |
| 8 | Server recompute refund amounts | n/a — void doesn't refund money in the current design | **Skip** (unless Phase 9 Q2 says yes). |
| 9 | Per-line exact-match check | n/a | **Skip.** |
| 10 | Aggregate cap check | Cap check: only allow if no prior refunds against this txn (open question) | **Mirror with modification.** See Phase 9 Q3. |
| 11 | Stripe refund call | TBD per Phase 9 Q2 | **Open question:** if yes, mirror exactly; if no, skip. |
| 12 | Insert `refunds` row | n/a — voiding doesn't create a refund row, just flips status | **Skip.** |
| 13 | Insert `refund_items` rows | n/a | **Skip.** |
| 14 | Inventory restoration loop (per-disposition) | Inventory restoration loop (always `restock`) | **Mirror with modification.** Strip the disposition branch; always do the `restock` path. Use `adjustment_type='returned'`, `reference_type='transaction'`, `reference_id=transaction.id`, `reason='Void of <receipt#>'`. |
| 15a | Loyalty: restore redeemed points (full or pro-rata) | Loyalty: restore ALL redeemed (void is always full) | **Mirror with modification.** Drop pro-rata; always full. Already correctly done in current void code (`/api/pos/transactions/[id]/route.ts:74-83`). |
| 15b | Loyalty: claw back earned points (full or pro-rata) | Loyalty: claw back ALL earned (void is always full) | **Mirror with modification.** Drop pro-rata; always full. Already correctly done in current void code. |
| 16 | Patch `refunds` row with loyalty columns | n/a | **Skip.** |
| 17 | Update transaction status to `'refunded'` / `'partial_refund'` | Already done as the **first** action in current void code (`status='voided'`) | **Mirror with modification:** different target status, and current void does it first while refund does it last. Either order works; if mirroring refund's order matters for atomicity (e.g. concurrent refund/void), put it last in void too. |
| 18 | Reverse coupon `use_count` (full only) | Reverse coupon `use_count` (always — void is always full) | **Mirror with modification.** Drop the `newStatus === 'refunded'` gate (always reverse). |
| 18b | Reverse campaign metrics (full only) | Reverse campaign metrics (always) | **Mirror with modification.** Same as above. |
| 19 | Audit log entry | Audit log entry | **Mirror exactly.** Already in current void code; just ensure the `details` block adds `inventory_restored: true`, `coupon_reversed: bool`, etc. for forensics. |
| 20 | Return 200/201 | Return 200 with updated transaction | **Mirror with modification.** Refund returns the new refund row; void returns the updated transaction (already current behavior). |
| — | n/a | **NEW: Concurrency lock on `products` rows during restoration** | **New (recommended):** wrap the inventory loop in an RPC with `FOR UPDATE` row locks on the affected products, matching `commit_stock_count` / `revert_stock_count` precedent. Refund route doesn't do this — improvement opportunity for void. (See Session 42M Phase 10 Q4.) |
| — | n/a | **NEW: `customer_lifetime_spend` and `visit_count` reversal** | **New:** the `tr_update_customer_stats` trigger doesn't fire on UPDATE, so neither void nor refund currently reverses these. Adding it for void is a fix; adding it for refund too is a separate ticket. Mirror only if user wants both fixed in this pass. |
| — | n/a | **NEW: `appointment` / `job` link disposition** | **Open question:** see Phase 9 Q4. |

### Net diff for void

The void path needs to add (in order):

1. `transaction_items` fetch (already doable from `transaction.id`).
2. Per-product-line inventory restoration loop, mirroring refund's
   `restock` branch only.
3. Coupon + campaign metrics reversal (mirror refund route's full-refund
   block, drop the `newStatus === 'refunded'` gate).

And keep what's already correct:

- Status flip (`status='voided'`).
- Loyalty restoration (already pro-rata-free, always full).
- Audit log row.

Skip:

- Refund table writes (`refunds`, `refund_items`).
- Stripe call (assumed in-store-only; reconsider per Q2).
- Refund-side disposition picker.

---

## Phase 9 — Open questions for void fix design

These need explicit decisions before code changes. Phrased to be answerable
yes/no or with a single-line preference.

### Q1. Should void support disposition (damaged / kept) or always `restock`?

The Session 42M audit recommended **always restock**, with the rationale
that "void" semantically means "the sale didn't happen" and goods retained
by the customer should be a *refund*, not a void. The cashier UX
(`transaction-detail.tsx:136-156`) sends `{ action: 'void' }` with no
disposition — a UI change would be required if disposition is added.

**Recommendation:** always `restock`. But if the user wants flexibility
(e.g. cashier voided after item was already taken from packaging and is no
longer resellable), expose `damaged`/`customer_retained` on the void
dialog too. **Decision needed.**

### Q2. Should void also issue a Stripe refund if the original was a card payment?

A POS void is conceptually "the sale didn't happen." If the customer paid
by card, leaving the funds with the merchant is wrong — the customer
should be made whole. But:
- A void is typically used *immediately* after a sale (cashier ring-up
  error, voiding before customer leaves). For Stripe Terminal, the
  conventional path is to *cancel* the payment intent (if not yet
  captured) rather than refund (if captured). The app captures
  immediately, so there's no "cancel" path.
- If void + auto-refund is the expected behavior, the refund path already
  exists. Why have void at all?
- One distinction: void doesn't create a `refunds` row. So Stripe-refund-
  on-void would leave no app-side record of the refund (other than the
  `stripe_refund_id` somewhere — currently nowhere on `transactions`).

**Three options:**
1. **Void = in-store only.** No Stripe refund. Cash sale only path. Card
   sales must be refunded, not voided. Block voiding card transactions
   in the UI. (Cleanest, but most restrictive.)
2. **Void = also Stripe refund.** Void does what refund does plus a
   `'voided'` status. Effectively makes void redundant. Add
   `transactions.stripe_void_refund_id` column to record the refund.
3. **Void = optionally Stripe refund.** UI prompt: "This sale was paid
   by card. Refund the customer too? [Yes/No]". If yes, call Stripe and
   record. If no, just status-flip.

**Recommendation:** Option 1 is cleanest but requires UX changes (block
void on card sales). **Decision needed.**

### Q3. Can a partially-refunded transaction be voided?

Currently the void path requires `status='completed'` (verified Session
42M). Refund path allows `'partial_refund'` to go to fully `'refunded'`,
but cannot go to `'voided'`. So partial refund + void is impossible by
status guard.

But what *should* happen? A transaction with one $20 partial refund
already issued ($80 still paid) — voiding it would mean restoring
inventory for the *unrefunded* lines (other 80%) and... ignoring the
already-restored 20%? Or restoring all 100% (double-restoring the 20%)?

**Three options:**
1. **Forbid void on `partial_refund` (current behavior).** Partial-refund
   transactions can only be fully refunded. Operator must "finish" the
   refund instead of voiding.
2. **Allow void on `partial_refund`, restoring only unrefunded lines.**
   Use refund_items to compute which lines have remaining unrefunded
   quantity, restore only those.
3. **Allow void, restore all 100%.** Simple but creates inventory drift
   if any items were already physically returned and counted.

**Recommendation:** Option 1. Keep the existing guard. **Decision needed.**

### Q4. How does void interact with appointments/jobs that link to this transaction?

Some transactions are linked to `jobs` (auto-detailing services). Voiding
a transaction doesn't currently:
- Cancel the linked job.
- Refund the deposit.
- Notify the customer.
- Revert the job's `status` from `'completed'` to `'in_progress'` or
  `'cancelled'`.

The smoke-test scenario (SD-006223) was a product sale, not a job-linked
sale, so this hasn't surfaced. But voiding a job-linked transaction in
production would leave the job in a "completed" state with no payment.

**Decision needed:** scope of void's job/appointment side effects. Could
be:
- Out of scope for this fix (note as separate defect, ship inventory fix
  in isolation).
- Add a guard: cannot void a job-linked transaction; must use
  refund-and-cancel-job flow instead.
- Add cascade: void the transaction → cancel the linked job → notify the
  customer.

**Recommendation:** Out of scope; add a guard later. **Decision needed.**

### Q5. Should `customer_lifetime_spend` / `visit_count` be reversed on void?

Currently neither void nor refund reverses these (the
`tr_update_customer_stats` trigger is INSERT-only). A customer who voids
a $500 detail still shows $500 on lifetime spend. This is the same defect
documented in Session 42M Phase 10 Q5.

**Decision needed:**
- Fix only for void in this pass.
- Fix for both void and refund in this pass.
- Defer both as a separate ticket.

**Recommendation:** Fix for both, in a separate commit after the void
inventory fix lands. The fix is small (an UPDATE in the appropriate
handler).

### Q6. Atomicity — wrap void in a Postgres transaction or RPC?

The refund route does NOT wrap step 2–7 in a transaction. The void route
currently does NOT either (it's three sequential calls). Mirroring refund
"as-is" preserves the same partial-failure hazard.

**Two paths:**
1. **Mirror refund's non-atomicity.** Faster, simpler, matches existing
   code shape. Same partial-failure hazards.
2. **Lift to an RPC** (Postgres function) that does all DB writes in one
   transaction with `FOR UPDATE` locks. Matches `commit_stock_count` /
   `revert_stock_count` precedent. More work; safer.

**Recommendation:** Option 2. The void fix is a good moment to set the
better pattern. Refund can be migrated to RPC in a follow-up. **Decision
needed.**

### Q7. Stripe idempotency — is this a separate ticket?

Phase 3 of this audit identified that POS refund's `stripe.refunds.create`
has no idempotency key. Two rapid retries can issue two Stripe refunds
before the aggregate-cap check protects. This is a real defect on the
refund path that the void mirror should NOT propagate.

**Decision needed:** add Stripe idempotency to refund as part of void fix
work, or separate ticket?

**Recommendation:** Separate ticket. Don't expand the void-fix scope.

### Q8. The non-atomic refund chain — separate ticket?

If the user wants refund to also be atomic (RPC), that's a much larger
refactor. Current behavior is acceptable per the audit's risk assessment,
just imperfect. **Decision needed:** roll into void fix or defer?

**Recommendation:** Defer. The void fix should ship narrowly.

---

## Appendix — Files inspected

- `src/app/api/pos/refunds/route.ts` — POS refund handler (full)
- `src/app/api/admin/orders/[id]/refund/route.ts` — admin online-order refund (full)
- `src/app/api/webhooks/stripe/route.ts` — `payment_intent.succeeded` for online orders (lines 60–119)
- `src/app/api/pos/transactions/[id]/route.ts` — void handler (Session 42M reference)
- `src/lib/utils/refund-math.ts` — money math utilities (full)
- `src/lib/utils/validation.ts` — `refundCreateSchema` and `RefundDisposition` (lines 520–547)
- `src/lib/utils/stock-adjustments.ts` — `logStockAdjustment` helper (full)
- `src/app/pos/components/refund/refund-dialog.tsx` — refund UI orchestration
- `src/app/pos/components/refund/refund-summary.tsx` — disposition selection UI
- `supabase/migrations/20260201000019_create_refunds.sql` — refunds + refund_items tables
- `supabase/migrations/20260318000001_refunds_loyalty_columns.sql` — `points_clawed_back`, `points_restored` columns
- `supabase/migrations/20260420000001_extend_stock_adjustments.sql` — `disposition` column on `refund_items`, `customer_retained` adjustment_type, `unit_cost` column
- `supabase/migrations/20260201000001_create_enums.sql` — `transaction_status`, `refund_status` enums
- `supabase/migrations/20260201000018_create_payments.sql` — `payments` table

No code or migration changes in this commit. Audit doc only.
