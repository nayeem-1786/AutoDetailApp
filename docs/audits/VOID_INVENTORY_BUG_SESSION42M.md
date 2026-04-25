# Void Inventory Restoration Bug — Investigation Audit (Session 42M)

> **Status:** READ-ONLY audit. No code or migration changes in this commit.
>
> **Scope:** Trace the inventory side-effect (or absence thereof) of voiding a
> POS transaction, in response to forensic data from transaction SD-006223
> (2026-04-24 smoke test).
>
> **Headline finding:** The void path **does not touch inventory at all**. It
> flips `transactions.status` to `'voided'` and reverses loyalty points —
> nothing else. Every void since launch has silently failed to restore stock.
>
> **Caveat:** The user-reported 1 → 4 silent jump in
> `products.quantity_on_hand` for White Wall Tire Cleaner *cannot* be
> explained by the void code as it currently exists. That jump implicates
> some path *outside* the void handler. Both findings are documented below
> separately so they don't get conflated.

---

## TL;DR

| Question | Answer |
|---|---|
| Does the void path write `stock_adjustments` rows? | **No.** Zero writes to that table. |
| Does the void path UPDATE `products.quantity_on_hand`? | **No.** Zero writes to `products`. |
| Does the void path call any RPC or trigger that mutates inventory? | **No.** Only `tr_transactions_updated_at` fires (timestamp-only). |
| Does the refund path correctly restore inventory? | **Yes** for POS refunds (with disposition + audit rows). **Partially** for admin online-order refunds (updates qty, no audit row). |
| Does the Square import path replay voided sales' inventory effects? | **No.** Square import never touches inventory at all (sales OR voids). |
| Does the 1 → 4 silent jump fit any code path we found? | **No.** Cannot be explained by the void handler. Real cause is unknown — see Phase 5. |
| Has this been silently corrupting inventory since launch? | **Yes** for all POS voids. Magnitude per Phase 7 query the user runs. |

---

## Phase 1 — The void path

### Code location

`src/app/api/pos/transactions/[id]/route.ts:89-197` — the entire `PATCH`
handler. The relevant `action === 'void'` branch:

```ts
// src/app/api/pos/transactions/[id]/route.ts:105-184
if (action === 'void') {
  const denied = await requirePermission(employeeId, 'pos.void_transactions');
  if (denied) return denied;
  const { data: transaction, error } = await supabase
    .from('transactions')
    .update({ status: 'voided' })
    .eq('id', id)
    .eq('status', 'completed')
    .select('*')
    .single();

  if (error || !transaction) {
    return NextResponse.json(
      { error: 'Transaction not found or already voided' },
      { status: 400 }
    );
  }

  // Restore loyalty points on void
  if (transaction.customer_id) {
    const { data: custForLoyalty } = await supabase
      .from('customers')
      .select('loyalty_points_balance')
      .eq('id', transaction.customer_id)
      .single();

    if (custForLoyalty) {
      let currentBalance = custForLoyalty.loyalty_points_balance ?? 0;

      // Restore redeemed points
      if (transaction.loyalty_points_redeemed > 0) {
        currentBalance += transaction.loyalty_points_redeemed;
        await supabase.from('loyalty_ledger').insert({
          customer_id: transaction.customer_id,
          transaction_id: id,
          action: 'adjusted',
          points_change: transaction.loyalty_points_redeemed,
          points_balance: currentBalance,
          description: `Void: restored ${transaction.loyalty_points_redeemed} redeemed pts`,
        });
      }

      // Reverse earned points
      if (transaction.loyalty_points_earned > 0) {
        currentBalance = Math.max(0, currentBalance - transaction.loyalty_points_earned);
        await supabase.from('loyalty_ledger').insert({
          customer_id: transaction.customer_id,
          transaction_id: id,
          action: 'adjusted',
          points_change: -transaction.loyalty_points_earned,
          points_balance: currentBalance,
          description: `Void: reversed ${transaction.loyalty_points_earned} earned pts`,
        });
      }

      // Update customer balance
      if (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0) {
        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', transaction.customer_id);
      }
    }
  }

  logAudit({ /* ...audit row to audit_log table — NOT stock_adjustments... */ });

  return NextResponse.json({ data: transaction });
}
```

### What it touches (verified by reading every line)

| Side effect | Write target | Yes/No |
|---|---|---|
| Flip transaction status | `transactions.status` | Yes (`'voided'`) |
| Update transaction timestamp | `transactions.updated_at` (via `tr_transactions_updated_at` trigger) | Yes |
| Restore redeemed loyalty points | `loyalty_ledger` row + `customers.loyalty_points_balance` | Yes |
| Reverse earned loyalty points | `loyalty_ledger` row + `customers.loyalty_points_balance` | Yes |
| Audit log entry | `audit_log` (via `logAudit`) | Yes |
| **Restore product inventory** | `products.quantity_on_hand` | **NO** |
| **Audit row for inventory restoration** | `stock_adjustments` | **NO** |
| Reverse coupon `use_count` | `coupons.use_count` | **NO** (compare with refund path) |
| Reverse campaign metrics | `campaigns.redeemed_count`, `revenue_attributed` | **NO** |

### POS UI path that triggers it

`src/app/pos/components/transactions/transaction-detail.tsx:136-156`:

```ts
async function handleVoid() {
  setVoiding(true);
  try {
    const res = await posFetch(`/api/pos/transactions/${transaction.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'void' }),
    });
    // ...
  }
}
```

The UI sends `{ action: 'void' }` only. There is no restock/disposition
parameter, no item-level data, and no second roundtrip — the entire void is
"set status, restore loyalty, log audit." Nothing surfaces inventory to the
user, and nothing in the API surfaces inventory either.

### Other code paths that flip `status` to `'voided'`

`grep -rn "'voided'\|\"voided\"" src/` results, manually classified:

| File:line | What it does |
|---|---|
| `src/app/api/pos/transactions/[id]/route.ts:110` | The void handler (above) — the only **production** mutator. |
| `src/app/api/migration/transactions/route.ts:120` | Square historical import — sets `status='voided'` on insert if the imported row was voided in Square. Never touches inventory. See Phase 8. |
| `src/lib/utils/role-defaults.ts` | Permission key string `pos.void_transactions` — no DB writes. |
| All other files (`receipt-template.ts`, `transaction-list.tsx`, `transaction-detail.tsx`, `(public)/receipt/[token]/page.tsx`, etc.) | Read-only display logic — render badges, hide buttons, etc. |

There is **one and only one** code path that flips a live transaction to
`voided`, and it does not touch inventory.

---

## Phase 2 — The refund path (and an unflattering comparison)

### POS refund — `src/app/api/pos/refunds/route.ts:253-308`

```ts
// 4. Inventory handling per disposition.
// - restock: increment products.quantity_on_hand, log 'returned' adjustment
// - damaged: no quantity change, log 'damaged' adjustment (quantity_change=0)
// - customer_retained: no quantity change, log 'customer_retained' adjustment (quantity_change=0)
// Non-product refund items skip this block entirely.
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
```

This is correct: per-item disposition (`restock` / `damaged` / `customer_retained`),
audit row written for every disposition (even when `quantity_change=0`),
products table updated only when disposition is `restock`.

The POS refund route also reverses coupons/campaigns and clawbacks loyalty
(see `route.ts:310-433`). The void route does **not** reverse coupons or
campaign metrics — also a defect, separate from the inventory hole.

### Admin online-order refund — `src/app/api/admin/orders/[id]/refund/route.ts:82-98`

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

Restores quantity but **does NOT write a `stock_adjustments` row**. This is a
secondary defect — not the bug under investigation, but worth noting because
it produces silent inventory mutations on the orders side that won't appear
in the stock-history UI.

### Stripe webhook on `payment_intent.succeeded` — `src/app/api/webhooks/stripe/route.ts:79-95`

```ts
// 4. Decrement stock for each item
const orderItems = (order as { order_items: Array<{ product_id: string; quantity: number }> }).order_items;
for (const item of orderItems) {
  if (item.product_id) {
    const { data: prod } = await admin
      .from('products')
      .select('quantity_on_hand')
      .eq('id', item.product_id)
      .single();

    if (prod) {
      const newQty = Math.max(0, prod.quantity_on_hand - item.quantity);
      await admin
        .from('products')
        .update({ quantity_on_hand: newQty })
        .eq('id', item.product_id);
    }
  }
}
```

Online-order paid: decrements quantity but **does NOT write a
`stock_adjustments` row** either. Symmetric to the admin orders refund:
silent.

### Refund vs void — step-by-step gap

| Step | POS refund | POS void | Gap |
|---|---|---|---|
| 1. Permission check | ✅ | ✅ | — |
| 2. Status flip | ✅ → `refunded`/`partial_refund` | ✅ → `voided` | — |
| 3. Per-line inventory restoration | ✅ Disposition-aware (`restock` / `damaged` / `customer_retained`) | ❌ Nothing | **Missing entirely** |
| 4. `stock_adjustments` audit row per item | ✅ Every disposition | ❌ Nothing | **Missing entirely** |
| 5. Loyalty: restore redeemed points | ✅ Pro-rated for partial | ✅ Always full | Behavioral diff (acceptable for void = always full) |
| 6. Loyalty: clawback earned points | ✅ Pro-rated for partial | ✅ Always full | Same |
| 7. Coupon `use_count` reversal | ✅ On full refund | ❌ Nothing | **Missing** (separate issue) |
| 8. Campaign metrics reversal | ✅ On full refund | ❌ Nothing | **Missing** (separate issue) |
| 9. Stripe refund call | ✅ Card refunds first, before any DB write | N/A — void is in-store concept; no Stripe touch | Not applicable for in-store |
| 10. Audit log row | ✅ | ✅ | — |

The void path is essentially "status flip + loyalty + log." It is missing the
entire inventory + commerce-state reversal block that refund executes.

---

## Phase 3 — Database triggers and RPCs

### Triggers on `transactions`

From `supabase/migrations/20260201000037_create_functions_triggers.sql`:

```sql
-- src/migrations:22
CREATE TRIGGER tr_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- src/migrations:50
CREATE TRIGGER tr_transaction_receipt_number
  -- (BEFORE INSERT, sets receipt_number)

-- src/migrations:134
CREATE TRIGGER tr_update_customer_stats
  AFTER INSERT ON transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_customer_stats();
```

`update_customer_stats` body (functions_triggers.sql:119-132):

```sql
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.status = 'completed' THEN
    UPDATE customers SET
      last_visit_date = NEW.transaction_date::DATE,
      visit_count = visit_count + 1,
      lifetime_spend = lifetime_spend + NEW.total_amount,
      updated_at = now()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This trigger is **AFTER INSERT only** with `WHEN (NEW.status = 'completed')`.
It never fires on UPDATE, so void → `customer_lifetime_spend` is never
decremented. (Another secondary defect — out of scope here, but worth
recording.)

### Triggers on `transaction_items`

`grep -n "transaction_items" supabase/migrations/*.sql` shows the table is
created in `20260201000017_create_transaction_items.sql`. A search for
`CREATE TRIGGER` referencing `transaction_items` returned **zero** matches.
No triggers on this table.

### RPCs / functions related to void / refund / restore

`grep -rn "void\|refund\|restore" supabase/migrations/` — no functions
named anything like `void_transaction`, `restore_inventory`, `refund_*`. The
only inventory-related RPCs are:

- `commit_stock_count(p_count_id, p_employee_id)` —
  `supabase/migrations/20260421000002_create_stock_counts.sql:103-187`. Walks
  `stock_count_items`, computes delta, updates `products.quantity_on_hand`,
  writes `stock_adjustments` row with `adjustment_type='recount'`. Correct.
- `revert_stock_count(p_count_id, p_user_id, p_confirmed_drift)` —
  `supabase/migrations/20260424000002_revert_stock_count_structured_errors.sql:25-186`
  (overrides `20260424000001`). Two-pass: locks all affected products,
  pre-checks negative-quantity safety, optionally checks drift, then writes
  inverse adjustments. Correct.

Neither RPC has anything to do with transactions/void/refund.

### Functions touching `stock_adjustments` (allow-list of writers)

| Writer | Audit row? | Update products? |
|---|---|---|
| `commit_stock_count` RPC | ✅ `recount` | ✅ |
| `revert_stock_count` RPC | ✅ `recount` ("Reversal of...") | ✅ |
| `/api/admin/stock-adjustments` POST | ✅ `manual` (or specified) | ✅ |
| `/api/admin/purchase-orders/[id]/receive` | ✅ `received` | ✅ |
| `/api/pos/transactions` (sale) | ✅ `sold` | ✅ |
| `/api/pos/sync-offline-transaction` | ✅ `sold` | ✅ |
| `/api/pos/refunds` | ✅ `returned`/`damaged`/`customer_retained` | ✅ when `restock` |
| `/api/pos/shop-use` | ✅ `shop_use` | ✅ |
| `/api/pos/transactions/[id]` action=void | **❌ no audit** | **❌ no qty change** |
| `/api/admin/orders/[id]/refund` | **❌ no audit** | ✅ |
| `/api/webhooks/stripe` payment_intent.succeeded | **❌ no audit** | ✅ |

Three offenders. Void is the worst because it ALSO doesn't update qty —
it just leaves stock wrong forever.

### Verify against the live DB (user actions)

The migrations are the source of truth, but to rule out drift, please run
these queries in Supabase SQL Editor and confirm the output matches the
migration source:

```sql
-- (a) Triggers on transactions
SELECT trigger_name, event_manipulation, action_timing,
       action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
ORDER BY trigger_name;

-- (b) Triggers on transaction_items
SELECT trigger_name, event_manipulation, action_timing,
       action_statement
FROM information_schema.triggers
WHERE event_object_table = 'transaction_items'
ORDER BY trigger_name;

-- (c) Any function whose body mentions stock_adjustments
SELECT proname, pg_get_functiondef(oid) AS def
FROM pg_proc
WHERE prosrc LIKE '%stock_adjustments%'
ORDER BY proname;

-- (d) Any function whose name suggests void/refund/restore
SELECT proname, pg_get_functiondef(oid) AS def
FROM pg_proc
WHERE proname ILIKE '%void%'
   OR proname ILIKE '%refund%'
   OR proname ILIKE '%restore_inventory%'
   OR proname ILIKE '%revert_sale%';
```

Expected results:
- (a) `tr_transactions_updated_at`, `tr_transaction_receipt_number`,
  `tr_update_customer_stats`. **No** trigger named `*void*`.
- (b) Empty result set.
- (c) Only `commit_stock_count` and `revert_stock_count` (plus possibly
  triggers above).
- (d) Only `revert_stock_count` (the stock-count revert, **not** a
  transaction void). **No** function named `void_transaction`,
  `restore_inventory`, etc.

If the live DB returns more rows than expected for (a), (c), or (d), there's
schema drift — investigate before proceeding to a fix.

---

## Phase 4 — Cross-reference void timing for SD-006223

### Reported timeline (White Wall Tire Cleaner / 8oz, product
`acff6ac9-a14b-44c3-90e4-5af12da4c83d`, 2026-04-24)

| Time (PST/UTC mix in source) | Event | qty_before | Δ | qty_after |
|---|---|---|---|---|
| 22:40:48 | Stock count "Test 42-K-2" commit | 6 | −3 | 3 |
| 22:45:00 | Reversal of "Test 42-K-2" | 3 | +3 | 6 |
| 23:06:35 | Stock count "Test42k4" commit | 6 | +4 | 10 |
| 23:06:58 | Sale SD-006223 (qty 9) | 10 | −9 | **1** |
| ??? | Void of SD-006223 | ??? | ??? | ??? |
| 23:57:25 | Reversal of "Test42k4" | **4** | −4 | 0 |

Plus state-table reads:
- `products.quantity_on_hand = 0`
- `products.updated_at = 2026-04-24 23:57:25.824155+00` (matches reversal)
- `transactions{SD-006223}.status = 'voided'`
- `transactions{SD-006223}.updated_at = 2026-04-25 00:08:39.889146+00` (≈11
  minutes AFTER the reversal).

### Reading

The reversal of Test42k4 is implemented by `revert_stock_count`, which
computes per row: `v_reverse_qty := v_adj.live_qty - v_adj.quantity_change`,
then `UPDATE products SET quantity_on_hand = v_reverse_qty`, and writes an
audit row with `quantity_before = live_qty, quantity_after = v_reverse_qty`.

The Test42k4 commit row had `quantity_change = +4`. The reversal row has
`quantity_before = 4, quantity_after = 0`, so:

> `live_qty - quantity_change = 4 - 4 = 0` ✅
>
> ⇒ `live_qty` at the moment of reversal was **4**.

The sale's audit row recorded `quantity_after = 1` and the sale code does
`UPDATE products SET quantity_on_hand = quantityAfter`, so immediately after
the sale the live qty was **1**.

**Therefore qty went from 1 → 4 between 23:06:58 and 23:57:25 with no audit
row.**

### Where the void fits in time

`transactions.updated_at = 00:08:39` is set by `tr_transactions_updated_at`
on UPDATE. The void handler's only UPDATE on `transactions` is the
`status='voided'` flip, so 00:08:39 is when that flip ran.

`products.updated_at = 23:57:25` indicates `products` was last touched at
the time of the Test42k4 reversal, **not** at 00:08:39. If the void had
mutated `products.quantity_on_hand` at 00:08:39, the trigger
`tr_products_updated_at` would have moved `products.updated_at` to that
time. It did not. **The void at 00:08:39 did not write to `products`** —
which is consistent with reading the void code (it has no `UPDATE products`
statement).

### What that means for the original hypothesis

The original hypothesis was that the void handler restored qty by `+3`
(producing the 1 → 4 jump). That hypothesis is **rejected** by two
independent pieces of evidence:

1. The void handler source code has no `UPDATE products` and no
   `logStockAdjustment` call (Phase 1).
2. `products.updated_at = 23:57:25`, not 00:08:39 — so `products` was not
   written when the void's status flip ran.

The 1 → 4 jump did happen, but **not because of the void**. The cause is
unidentified from the evidence in this audit. See Phase 5.

The void path's defect remains real and severe — it just isn't the
mechanism that produced the +3.

---

## Phase 5 — The 1 → 4 jump: theories and what to check

> **Important:** Per the rule against declaring a root cause without
> supporting evidence, this section enumerates *theories*, not conclusions.
> The data we have rules out the void code as the source — but does not
> identify what *was* the source.

### Math

- After sale (23:06:58): qty = 1 (audit row + product update)
- Before reversal (23:57:25): qty = 4 (back-computed from reversal row)
- Δ in window = +3

### Code paths that *can* increment `products.quantity_on_hand`

From `grep -rn "\.update(.*quantity_on_hand" src/`:

| Path | Writes audit? | Could plausibly fire mid-window? |
|---|---|---|
| `/api/admin/stock-adjustments` POST | Yes | Yes — would have left an audit row. **None observed**, so ruled out (subject to user double-check). |
| `/api/pos/refunds` | Yes (when `restock`) | Yes — would leave a `returned` adjustment row. **None observed**, ruled out. |
| `/api/admin/purchase-orders/[id]/receive` | Yes | Yes — would leave a `received` row. **None observed**, ruled out. |
| `/api/pos/sync-offline-transaction` | Yes (decrement only — would go DOWN, not up) | Wrong sign. Ruled out. |
| `/api/admin/orders/[id]/refund` | **No audit row** | Yes — silent +qty. Possible if there was an online order refund for this product in the window. |
| `/api/webhooks/stripe` `payment_intent.canceled` (decrement-only path) | **No audit row** | Wrong sign. Ruled out. |
| Direct SQL via Supabase Studio / psql | No audit row | Possible if user ran an ad-hoc UPDATE during testing. |
| Migration scripts | No audit row | Migrations don't run unattended; ruled out unless one was applied today. |

### Plausible explanations, ranked by how well they fit the evidence

1. **Manual `UPDATE` via Supabase Studio.** An ad-hoc `UPDATE products SET
   quantity_on_hand = 4` during smoke testing would silently mutate qty,
   trigger `tr_products_updated_at` → `products.updated_at` would jump to
   that moment. But the user reports `products.updated_at = 23:57:25` (the
   reversal). For this theory to hold, the manual UPDATE must have happened
   *exactly at* the reversal moment, OR happened earlier and was overwritten
   by the reversal's own UPDATE. The latter is more likely: any UPDATE to
   the row before 23:57:25 would have its `updated_at` overwritten by the
   reversal's update at 23:57:25.
2. **An online-order refund** for this product hit the admin orders refund
   route in that window. That route writes `quantity_on_hand` silently. But
   the increment would be the refunded item's `quantity` — for this product
   to land on 4, the refunded quantity would need to be 3. And there'd need
   to be an `order_events` row for it. Verifiable.
3. **Two separate test transactions**: the user may have run another small
   sale or another adjustment that reduced/increased qty in a way the recap
   missed. Inventory event log on this product is the source of truth.
4. **Race between sale and reversal**: a stale read by the reversal RPC.
   But `revert_stock_count` reads `live_qty` *inside* the same SQL statement
   that updates `products` (`SELECT ... FROM products p ... FOR UPDATE OF
   p`), so it cannot read a stale value. Ruled out.
5. **The void code IS doing it via some path we didn't inspect.** I read
   every line of the void handler and grepped every `quantity_on_hand`
   write site in `src/`. No void path mutates `products`. Ruled out by code
   review — but if the live system disagrees, the migrations/RPCs must
   have drifted (Phase 3 verification).

### Queries the user should run to nail down the cause

```sql
-- 1. ALL stock_adjustments rows for the product on 2026-04-24, ordered
--    by time. Confirms the audit timeline you have is complete.
SELECT id, created_at, adjustment_type, quantity_change,
       quantity_before, quantity_after,
       reason, reference_type, reference_id, created_by
FROM stock_adjustments
WHERE product_id = 'acff6ac9-a14b-44c3-90e4-5af12da4c83d'
  AND created_at::date = '2026-04-24'
ORDER BY created_at ASC;

-- 2. ALL audit_log entries that touch this product or this transaction
--    on 2026-04-24. Catches manual admin actions.
SELECT created_at, action, entity_type, entity_id, entity_label,
       user_email, source, details
FROM audit_log
WHERE created_at::date = '2026-04-24'
  AND (
    entity_id = 'acff6ac9-a14b-44c3-90e4-5af12da4c83d'
    OR entity_id = '<SD-006223 transaction id>'
    OR details::text LIKE '%acff6ac9%'
    OR details::text LIKE '%SD-006223%'
  )
ORDER BY created_at ASC;

-- 3. Any online order_events for this product on 2026-04-24.
SELECT oe.created_at, oe.event_type, oe.description, oi.product_id, oi.quantity
FROM order_events oe
JOIN orders o ON o.id = oe.order_id
JOIN order_items oi ON oi.order_id = o.id
WHERE oi.product_id = 'acff6ac9-a14b-44c3-90e4-5af12da4c83d'
  AND oe.created_at::date = '2026-04-24'
ORDER BY oe.created_at ASC;
```

If query 2 surfaces an `adjust` action between 23:06:58 and 23:57:25, that's
the source. If query 3 surfaces a refund event, that's the source. If both
are empty, the most likely remaining explanation is a direct DB UPDATE
outside the app (e.g., a dev tool / Studio session).

**Until that's confirmed, do not bake the +3 mechanism into the fix design.**

---

## Phase 6 — Refund vs void: the missing block, in one place

The void handler should add this block (rough shape; **do not implement
based on this — see Phase 9 for the proper fix scope and open questions**):

```ts
// AFTER the status flip succeeds, BEFORE returning
const { data: txItems } = await supabase
  .from('transaction_items')
  .select('id, product_id, quantity')
  .eq('transaction_id', id);

for (const item of txItems ?? []) {
  if (!item.product_id) continue;
  // ...read product, +item.quantity, UPDATE products, logStockAdjustment...
}
```

Plus two more blocks the refund route also has and void doesn't:

- **Coupon `use_count` decrement** (refund: `route.ts:400-413`) — for full
  refund only. Void = always full.
- **Campaign `redeemed_count` and `revenue_attributed` decrement** (refund:
  `route.ts:415-432`).

And one block where void *should differ* from refund:

- **Disposition.** A refund supports `restock` / `damaged` / `customer_retained`.
  A void is conceptually "the sale didn't happen" — there is no customer
  walking away with the product, so disposition is implicitly `restock` for
  every line. (Confirm in Phase 10.)

---

## Phase 7 — Historical audit: how bad is the drift?

Run these against the live DB (user action — Claude has no DB access).

> **Note on `adjustment_type` values:** the code's adjustment types are
> bounded by the CHECK constraint in
> `supabase/migrations/20260420000001_extend_stock_adjustments.sql`:
> `'manual', 'received', 'sold', 'returned', 'damaged', 'recount',
> 'shop_use', 'customer_retained'`. There is **no** `'void'` or `'voided'`
> type. The original audit prompt's `IN ('void','voided','restored',
> 'returned')` won't return rows for the first three because they don't
> exist as adjustment types — only rows with `adjustment_type='returned'`
> would be matched, and those come from refunds (`reference_type='refund'`),
> not voids. Adjusted queries below.

### A. Count voided transactions and whether ANY restoration row exists for them

```sql
-- For every voided transaction with a product line, count how many
-- stock_adjustments rows exist that reference it (any type, any reason).
-- Expected (given the bug): zero for all voids.
SELECT
  t.id                AS transaction_id,
  t.receipt_number,
  t.status,
  t.transaction_date,
  t.updated_at        AS voided_at,
  ti.product_id,
  p.name              AS product_name,
  ti.quantity         AS sold_qty,
  (
    SELECT COUNT(*)
    FROM stock_adjustments sa
    WHERE sa.reference_type = 'transaction'
      AND sa.reference_id = t.id
      AND sa.adjustment_type <> 'sold'   -- exclude the original sale row
  ) AS restoration_rows_against_this_tx
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id
JOIN products p           ON p.id = ti.product_id
WHERE t.status = 'voided'
  AND ti.product_id IS NOT NULL
ORDER BY t.updated_at DESC;
```

If `restoration_rows_against_this_tx = 0` for every row returned, the void
path has been silently skipping inventory restoration since launch.

### B. Same for refunded / partial_refund — sanity check that refund path *did* leave audit

```sql
SELECT
  t.id, t.receipt_number, t.status, t.transaction_date,
  ti.product_id, p.name, ti.quantity AS sold_qty,
  (
    SELECT COUNT(*)
    FROM stock_adjustments sa
    JOIN refunds r ON r.id = sa.reference_id
    WHERE sa.reference_type = 'refund'
      AND r.transaction_id  = t.id
  ) AS refund_audit_rows
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id
JOIN products p           ON p.id = ti.product_id
WHERE t.status IN ('refunded', 'partial_refund')
  AND ti.product_id IS NOT NULL
ORDER BY t.updated_at DESC;
```

Expected: each refunded/partial_refund product line should have ≥1 audit
row attached via `refunds.id`. If a row shows 0, the refund path failed
silently for that row (would be a separate bug to investigate).

### C. Estimate aggregate inventory drift caused by the void bug

For each (product, voided txn) pair that has no restoration row, the missing
restoration is `+ ti.quantity`. Sum per product:

```sql
SELECT
  p.id                    AS product_id,
  p.sku,
  p.name,
  SUM(ti.quantity)        AS missing_restoration_units,
  COUNT(DISTINCT t.id)    AS voided_tx_count,
  p.quantity_on_hand      AS current_qty
FROM transactions t
JOIN transaction_items ti ON ti.transaction_id = t.id
JOIN products p           ON p.id = ti.product_id
WHERE t.status = 'voided'
  AND ti.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_adjustments sa
    WHERE sa.reference_type = 'transaction'
      AND sa.reference_id = t.id
      AND sa.adjustment_type <> 'sold'
  )
GROUP BY p.id, p.sku, p.name, p.quantity_on_hand
ORDER BY missing_restoration_units DESC;
```

The `missing_restoration_units` column is the per-product inventory drift
introduced by the void bug, assuming "void = full restock" is the intended
semantics (open question — Phase 10).

### Forensic queries for SD-006223 (the smoke-test transaction)

```sql
-- All stock_adjustments rows referencing SD-006223 directly:
SELECT id, created_at, adjustment_type, quantity_change,
       quantity_before, quantity_after, reason, reference_type
FROM stock_adjustments
WHERE reference_type = 'transaction'
  AND reference_id = (
    SELECT id FROM transactions WHERE receipt_number = 'SD-006223'
  )
ORDER BY created_at ASC;

-- The transaction_items for SD-006223:
SELECT id, item_name, product_id, quantity, unit_price, total_price
FROM transaction_items
WHERE transaction_id = (
  SELECT id FROM transactions WHERE receipt_number = 'SD-006223'
);
```

Expected: exactly one `'sold'` row from the original sale, no other rows.

---

## Phase 8 — Square-imported sales risk

`src/app/api/migration/transactions/route.ts` imports historical Square
sales. Reading lines 105-200 of that file:

- It inserts into `transactions` with a `square_transaction_id`, mapping
  Square's status string to `'completed'` / `'voided'` / `'refunded'`.
- It inserts `transaction_items` rows.
- It inserts a `payments` row for the historical method.
- **It does not touch `products.quantity_on_hand` for any line item**, and
  it does not insert any `stock_adjustments` rows.

Implication: the inventory cost basis at import time is whatever
`products.quantity_on_hand` is when the import runs — it's not derived from
historical Square sales. So Square-imported voids don't introduce inventory
drift, because Square-imported sales also didn't decrement inventory.

The user's launch plan (Phase 16 in CLAUDE.md) accounts for this: "Confirm
that deleting test product purchases restores inventory levels back to
correct counts before reimporting." That confirms the model — inventory is
managed entirely on the Smart Details side, and Square import is metadata-
only.

So **Square import does not amplify the void bug**, but it also does not
backfill historical restoration. The void bug only affects voids that were
processed *natively* in this app (transactions with no `square_transaction_id`).

To confirm scope, the user can run:

```sql
SELECT
  COUNT(*) FILTER (WHERE square_transaction_id IS NULL)  AS native_voids,
  COUNT(*) FILTER (WHERE square_transaction_id IS NOT NULL) AS imported_voids
FROM transactions
WHERE status = 'voided';
```

Only the `native_voids` count is exposed to the bug.

---

## Phase 9 — Recommended fix scope (no code in this commit)

### Code fix: void path

`src/app/api/pos/transactions/[id]/route.ts:105-184`. After the status flip
succeeds and BEFORE the loyalty block (or after — order doesn't matter as
long as both run), add inventory restoration:

1. Load `transaction_items` for this transaction (id, product_id, quantity).
2. For each item where `item_type = 'product'` and `product_id IS NOT NULL`:
   a. Load `products.quantity_on_hand` and `products.cost_price`.
   b. `quantityAfter = quantityBefore + item.quantity`.
   c. `UPDATE products SET quantity_on_hand = quantityAfter`.
   d. `await logStockAdjustment({ adjustment_type: 'returned',
      quantity_change: +item.quantity, reference_type: 'transaction',
      reference_id: transaction.id, reason: 'Void of <receipt#>' })`.
3. Reverse coupon `use_count` and campaign metrics (mirror refund route
   `route.ts:399-433`) — decision needed in Phase 10 whether to ship together.
4. Consider whether `customer_lifetime_spend` and `visit_count` should also
   be reversed (the `update_customer_stats` trigger is INSERT-only and never
   reversed by either void or refund — see Phase 10).

The shape exactly mirrors `pos/refunds/route.ts:253-308` minus disposition
choice. Use the existing `logStockAdjustment` helper from
`src/lib/utils/stock-adjustments.ts`. Do NOT introduce a new
`adjustment_type='void'` value — `'returned'` is the existing semantically-
correct choice (matches the constraint and matches refund-restock).

Concurrency: wrap in an RPC like `commit_stock_count`/`revert_stock_count`
do, with `FOR UPDATE` row locks on the affected products, so concurrent
sales don't race the restoration. (See Open Question on RPC vs JS.)

### Code fix: admin online-order refund

`src/app/api/admin/orders/[id]/refund/route.ts:82-98` should also call
`logStockAdjustment` with `adjustment_type='returned'`,
`reference_type='refund'`, `reference_id=<refund metadata>`. Currently
mutates qty silently. Same shape as POS refund.

### Code fix: Stripe webhook `payment_intent.succeeded`

`src/app/api/webhooks/stripe/route.ts:79-95` should call
`logStockAdjustment` with `adjustment_type='sold'`, `reference_type='transaction'`
(or a new reference_type='order' if appropriate — schema needs check). Currently
silent.

> Both of the above are *separate defects*, not in the user's reported
> symptom set. They can be ticketed independently. The void bug is the
> priority because (a) it leaves inventory permanently wrong and (b) it
> matches a user-reported smoke-test failure.

### Data reconciliation

For each `(product_id, voided_transaction_id)` pair where no restoration
audit row exists, the corrective action is:

```text
UPDATE products SET quantity_on_hand = quantity_on_hand + ti.quantity
WHERE id = ti.product_id
INSERT stock_adjustments (..., adjustment_type='returned',
   quantity_change=+ti.quantity, reason='Backfill: missed void
   restoration for <receipt>', reference_type='transaction',
   reference_id=<txn id>, created_by=<system user id>)
```

Two strategies:

- **Silent batch backfill:** run a one-off migration that walks all voided
  transactions, performs the above for each missing pair. Fast, but the
  user loses per-transaction visibility.
- **User-approved per-transaction backfill:** generate a CSV/UI report of
  drift, let the user approve product-by-product (similar to revert-stock-
  count UX). Slower, safer.

Recommendation: **batch backfill** for the historical drift. The volume is
manageable (9 voided + 7 refunded + 1 partial_refund = 17 transactions
worst-case), and the audit row leaves a permanent trail with reason text
that surfaces in stock-history. Per-transaction approval is overkill at
this volume. (Confirm in Phase 10.)

### Test plan (before shipping the code fix)

1. Unit-shaped test on the new void inventory block:
   - Single product line, qty 5, sold-then-voided → qty restored, audit row
     written with `adjustment_type='returned'`, `quantity_change=+5`,
     `reference_type='transaction'`, `reference_id=<txn>`.
   - Multi-line transaction (2 products) → both restored, two audit rows.
   - Mixed product + service line → only product restored.
   - No-product transaction (services only) → no inventory writes, no audit
     rows, status flip + loyalty still happen.
   - Already-voided transaction → 400 error (existing behavior preserved).
2. Concurrency test: void runs while a sale of the same product is in flight.
   Confirm the RPC's `FOR UPDATE` (or the JS-side `await` ordering) doesn't
   produce negative qty or lost updates.
3. Smoke test on a real POS: re-run SD-006223's scenario. Sale of qty 9,
   void, expect qty restored from 1 → 10, audit row visible in stock-
   history, transaction status `voided`.
4. Regression on the refund path: confirm refund still produces correct
   audit rows (no shared-helper changes regressed it).
5. UAT on the existing 9 voided transactions after backfill: spot-check a
   handful against expected qty values.

### Migration sequencing

- **Code fix first**, deployed and verified working on a fresh test void.
- **Backfill migration** runs second, after the code fix is live. (If the
  backfill ran before the code fix, the next void in production would
  re-introduce drift on a freshly-corrected product, immediately defeating
  the backfill.)

### Risk assessment

- **Code fix in isolation:** Low risk. Adds restoration that should have
  been there. Net effect on a void today: qty goes up by N and an audit
  row appears. Idempotency is per-call (only fires when status flip
  succeeds), so retried clicks won't double-restore.
- **Backfill in isolation:** Medium risk. Touches every voided historical
  transaction. Recommend dry-run mode (compute drift but don't write) so
  the user can review the diff before applying.
- **Combined:** Low-medium. The risk mostly lives in correctly identifying
  "missing restoration" rows — false-positives cause double-restoration.
  The query in Phase 7C is the canonical filter; review it carefully.

You **can** ship the code fix immediately and do data reconciliation later.
The code fix prevents new drift; the backfill closes the historical gap.
They are independent.

---

## Phase 10 — Open questions for reviewer decision

1. **Disposition for void-restored inventory.** Should void implicitly
   `restock` every line? Or should it ask the user (like refund does)
   whether the goods are being returned-clean vs. damaged vs. retained?
   The smoke-test scenario (cashier voids an erroneous ring-up before
   handing items over) clearly wants `restock`. But voiding a *delivered*
   sale where the customer already left with the product is conceptually
   `customer_retained` — though that's almost always actually a refund,
   not a void. Recommendation: **always `restock`**, document that
   "customer kept the product but you want to undo the sale" must be a
   refund instead, not a void. Confirm.

2. **Pro-rated restoration for partial refunds.** The refund route already
   handles partial-line refunds correctly (you specify the refunded
   `quantity` per line). Voids are always full-transaction. This is
   probably fine — but worth stating explicitly so the eventual fix
   doesn't accidentally introduce partial-void semantics.

3. **Reconciliation strategy.** Silent batch fix vs. user-approved per-
   transaction fix? Recommendation: silent batch with audit-row trail.
   Confirm.

4. **RPC vs JS for the new void inventory block.** The two precedents
   (`commit_stock_count`, `revert_stock_count`) both use RPCs with
   `FOR UPDATE` locks for concurrency safety. The current refund route
   does it in JS without explicit locks. New void code should match
   `commit_stock_count` semantics for safety, but matching the refund
   route is also defensible if we want symmetry. Recommendation: **RPC**
   for the void, and consider migrating refund to RPC in a follow-up.

5. **Reverse `customer_lifetime_spend` and `visit_count` on void.** The
   `tr_update_customer_stats` trigger is INSERT-only; nothing reverses
   those columns on void or refund. So a customer's lifetime spend
   permanently includes voided/refunded amounts. Out of scope for this
   audit, but a related defect — confirm whether the user wants it
   addressed in the same fix or as a separate ticket.

6. **Reverse coupon and campaign metrics on void.** Refund does this for
   full refunds (`pos/refunds/route.ts:399-432`). Should void do the
   same? Recommendation: **yes**, for symmetry. Confirm.

7. **What caused the 1 → 4 silent jump on White Wall Tire Cleaner?**
   Phase 5 lists theories but doesn't conclude. Run the queries in
   Phase 5 against the live DB to identify the cause before designing
   the fix — if a non-app code path is mutating `products.quantity_on_hand`
   silently, that's a separate bug to track down, and the void fix won't
   prevent it.

8. **Should we lock down direct `UPDATE products` from any code path
   without an audit row?** A DB constraint or trigger that requires a
   companion `stock_adjustments` insert would prevent the
   admin-orders-refund and Stripe-webhook silent-mutation defects from
   ever recurring. Worth considering as a defense-in-depth step after
   the immediate void fix lands.

---

## Appendix — Files inspected

- `src/app/api/pos/transactions/[id]/route.ts` (void handler)
- `src/app/api/pos/transactions/route.ts` (sale create)
- `src/app/api/pos/sync-offline-transaction/route.ts` (offline sale sync)
- `src/app/api/pos/refunds/route.ts` (POS refund — comparison)
- `src/app/api/pos/shop-use/route.ts`
- `src/app/api/admin/orders/[id]/refund/route.ts` (online-order refund)
- `src/app/api/admin/stock-adjustments/route.ts`
- `src/app/api/admin/purchase-orders/[id]/receive/route.ts`
- `src/app/api/webhooks/stripe/route.ts` (online-order paid)
- `src/app/api/migration/transactions/route.ts` (Square import)
- `src/app/pos/components/transactions/transaction-detail.tsx` (void UI)
- `src/lib/utils/stock-adjustments.ts` (audit helper contract)
- `supabase/migrations/20260201000001_create_enums.sql` (status enum)
- `supabase/migrations/20260201000037_create_functions_triggers.sql`
- `supabase/migrations/20260420000001_extend_stock_adjustments.sql` (CHECK
  constraint on `adjustment_type`)
- `supabase/migrations/20260421000002_create_stock_counts.sql`
  (`commit_stock_count` RPC)
- `supabase/migrations/20260424000001_revert_stock_count.sql`,
  `20260424000002_revert_stock_count_structured_errors.sql`
  (`revert_stock_count` RPC)

No code or migration changes in this commit. Audit doc only.
