# Inventory Pre-flight Audit — Session 37

> **Date:** 2026-04-20
> **Scope:** Fact-gathering for bundled inventory session (refund disposition rework, stock_adjustments wiring, shop-use feature)
> **Mode:** Read-only. No code changes.

---

## Section 1 — Refund Disposition Wiring (Part 1 Facts)

### 1.1 `restock` Field Definition

**File:** `src/app/pos/components/refund/refund-dialog.tsx:37–40`
```typescript
interface SelectedItemState {
  qty: number;
  restock: boolean;
}
```

**Default:** Initialized to `false` when an item is first selected (line 91):
```typescript
next.set(itemId, { qty: maxQty, restock: false });
```

### 1.2 State Flow Through Components

| Component | Role | File |
|-----------|------|------|
| `refund-dialog.tsx` | State owner. `Map<string, SelectedItemState>`. Passes `restock` + `onRestockChange` as props. | `src/app/pos/components/refund/refund-dialog.tsx` |
| `refund-item-row.tsx` | Renders checkbox. Calls `onRestockChange(bool)` on toggle. | `src/app/pos/components/refund/refund-item-row.tsx` |
| `refund-summary.tsx` | Reads `entry.restock` to show blue badge. Does NOT gate confirm button. | `src/app/pos/components/refund/refund-summary.tsx` |

### 1.3 Checkbox Rendering

**File:** `src/app/pos/components/refund/refund-item-row.tsx:121–132`
```typescript
{selected && item.item_type === 'product' && (
  <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
    <input
      type="checkbox"
      checked={restock}
      onChange={(e) => onRestockChange(e.target.checked)}
      className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
    />
    <span className="text-xs text-gray-600 dark:text-gray-400">Restock</span>
  </label>
)}
```

- **Visibility guard:** Only for `item_type === 'product'` AND item is selected.
- **Default state:** Unchecked (restock = false).
- **No visual badge on the checkbox itself** — badge appears only in the summary panel.

### 1.4 Summary Badge

**File:** `src/app/pos/components/refund/refund-summary.tsx:60–64`
```typescript
{entry.restock && (
  <span className="ml-2 rounded bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
    restock
  </span>
)}
```

### 1.5 Confirm Button State

**File:** `src/app/pos/components/refund/refund-summary.tsx:127–141`
```typescript
<Button
  variant="destructive"
  className="w-full"
  disabled={processing || items.length === 0}
  onClick={onConfirm}
>
```
Confirm button **does NOT depend on any restock-related field**. Disabled only when processing or zero items.

### 1.6 Client Payload Construction

**File:** `src/app/pos/components/refund/refund-dialog.tsx:215–227`
```typescript
const payload = {
  transaction_id: transaction.id,
  items: summaryItems.map((entry) => ({
    transaction_item_id: entry.item.id,
    quantity: entry.quantity,
    amount: entry.amountDollars,
    restock: entry.restock,
  })),
  tip_refund: tipRefund,
  reason: reason.trim(),
};
```

### 1.7 Server-Side Processing

**File:** `src/app/api/pos/refunds/route.ts:240–268`
```typescript
// 4. Restock products where applicable
for (const item of data.items) {
  if (!item.restock) continue;

  const { data: txItem } = await supabase
    .from('transaction_items')
    .select('product_id')
    .eq('id', item.transaction_item_id)
    .single();

  if (txItem?.product_id) {
    const { data: product } = await supabase
      .from('products')
      .select('quantity_on_hand')
      .eq('id', txItem.product_id)
      .single();

    if (product) {
      await supabase
        .from('products')
        .update({
          quantity_on_hand: product.quantity_on_hand + item.quantity,
        })
        .eq('id', txItem.product_id);
    }
  }
}
```

### 1.8 Validation Schema

**File:** `src/lib/utils/validation.ts:528–533`
```typescript
const refundItemSchema = z.object({
  transaction_item_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
  amount: positiveNumber,
  restock: z.boolean().default(true),
});
```

**Note:** Schema defaults `restock` to `true` if omitted; client always sends explicit `false`. This default is irrelevant today but will become semantically wrong with disposition rework.

### 1.9 Persistence

**File:** `src/app/api/pos/refunds/route.ts:224–230`
```typescript
const refundItemRows = data.items.map((item, i) => ({
  refund_id: refund.id,
  transaction_item_id: item.transaction_item_id,
  quantity: item.quantity,
  amount: fromCents(recomputed.lineAmountsCents[i]),
  restock: item.restock,
}));
```

`restock` boolean is stored in `refund_items` table per row.

---

## Section 2 — POS Transaction Endpoint Stock Writes (Part 2 Facts)

### 2.1 Stock Decrement Block

**File:** `src/app/api/pos/transactions/route.ts:182–223`
```typescript
// 4. Decrement product inventory
const productItems = (data.items ?? []).filter(
  (i: { item_type: string; product_id?: string | null; quantity: number }) =>
    i.item_type === 'product' && i.product_id
);

for (const item of productItems) {
  const { error: invError } = await supabase.rpc('decrement_product_quantity', {
    p_product_id: item.product_id,
    p_quantity: item.quantity,
  });

  // If RPC doesn't exist, fall back to manual update
  if (invError) {
    // Fetch and decrement manually
    const { data: prod } = await supabase
      .from('products')
      .select('quantity_on_hand')
      .eq('id', item.product_id)
      .single();

    if (prod) {
      await supabase
        .from('products')
        .update({
          quantity_on_hand: Math.max(0, prod.quantity_on_hand - item.quantity),
        })
        .eq('id', item.product_id);
    }
  }
}
```

### 2.2 Data Available in Scope at Decrement Point

| Variable | Source | Available |
|----------|--------|-----------|
| `posEmployee.employee_id` | `authenticatePosRequest()` at line ~75 | YES |
| `transaction.id` | Created at line ~93 (insert returns it) | YES |
| `item.product_id` | From `productItems` filter | YES |
| `item.quantity` | From request payload | YES |
| `item.item_name` | From request payload | YES (for `reason` text) |

### 2.3 Guard for Product-Only Items

Lines 183–186 filter:
```typescript
(i: { item_type: string; product_id?: string | null; quantity: number }) =>
  i.item_type === 'product' && i.product_id
```
Services and packages are excluded. Only actual inventoried products pass.

### 2.4 Transaction Isolation

**NOT in a Supabase transaction.** The decrement block is a series of independent calls:
1. `supabase.rpc()` — fails because RPC undefined
2. Fallback: `supabase.from('products').select(...)` → separate `supabase.from('products').update(...)`

This means a `stock_adjustments` insert would be a **separate call**, not atomic with the decrement. Same pattern used by manual adjustments and PO receive (both non-atomic, both work fine in practice).

### 2.5 Where to Insert stock_adjustments

Immediately after the stock update succeeds (inside the `if (prod)` block or after the RPC succeeds). The insert pattern from manual adjustments:

```typescript
await admin.from('stock_adjustments').insert({
  product_id,
  adjustment_type: 'sold',
  quantity_change: -item.quantity,
  quantity_before: prod.quantity_on_hand,
  quantity_after: Math.max(0, prod.quantity_on_hand - item.quantity),
  reason: `Sold via POS (${transaction.receipt_number || transaction.id})`,
  reference_id: transaction.id,
  reference_type: 'transaction',
  created_by: posEmployee.employee_id,
});
```

### 2.6 Refund Endpoint — Same Analysis

**File:** `src/app/api/pos/refunds/route.ts:240–268`

The restock block (quoted in Section 1.7) has the same characteristics:
- Guard: `if (!item.restock) continue` — only restocks when explicitly flagged
- Data available: `refund.id` (from earlier insert), `txItem.product_id`, `item.quantity`, employee from `posEmployee`
- Same non-atomic pattern (select → update → no adjustment insert)

**Where to insert stock_adjustments on refund:**
After the `quantity_on_hand` update succeeds, insert with:
- `adjustment_type: 'returned'`
- `reference_id: refund.id`
- `reference_type: 'refund'`

### 2.7 POS Offline Sync

**File:** `src/app/api/pos/sync-offline-transaction/route.ts:142–176`

Identical pattern to main transaction endpoint. Same RPC call + fallback. Same place to add stock_adjustments insert.

### 2.8 Existing Helpers / Reusable Patterns

**No shared helper function exists.** Grep for `adjustStock`, `createStockAdjustment`, or `stock_adjustments` in `src/lib/` returned zero matches. Each endpoint (manual adjustment, PO receive) implements its own inline insert.

**Candidate for extraction:** A `logStockAdjustment()` helper would DRY up 4+ call sites:
- `POST /api/admin/stock-adjustments` (manual)
- `POST /api/admin/purchase-orders/[id]/receive` (PO)
- `POST /api/pos/transactions` (sale — to be added)
- `POST /api/pos/refunds` (return — to be added)
- `POST /api/pos/shop-use` (new — to be added)

---

## Section 3 — Shop-Use Feature Placement (Part 3 Facts)

### 3.1 POS Shell Structure

**File:** `src/app/pos/pos-shell.tsx`

**Header (lines 333–402):**
- Left: Scanner indicator + Card Reader status
- Center: Business name
- Right: Offline badge, role badge, display name, logout button

**Bottom nav (separate component):** `src/app/pos/components/bottom-nav.tsx`

### 3.2 POS Bottom Nav — Current Tabs

**File:** `src/app/pos/components/bottom-nav.tsx:170–195`

Main tabs:
1. **Transactions** → `/pos/transactions` (Receipt icon)
2. **Quotes** → `/pos/quotes` (FileText icon)
3. **Sale** → `/pos` (ShoppingCart icon)
4. **Jobs** → `/pos/jobs` (ClipboardList icon)

**"More" dropdown menu (lines 235–339):**
- Theme selector (Light/Dark/System)
- Cash Drawer → `/pos/end-of-day`
- Refresh App (PWA only)
- Fullscreen (desktop only)
- Keyboard Shortcuts
- Go to Dashboard → `/admin`

### 3.3 Proposed Placement for "Shop Use" Button

**Option A (recommended): In the "More" dropdown menu**, after "Cash Drawer" and before "Refresh App". This follows the existing convention of utility actions in the overflow menu.

**File:** `src/app/pos/components/bottom-nav.tsx` — insert around line ~280 (after Cash Drawer menu item).

Permission gate: `usePosPermission('inventory.shop_use')` — same pattern as other POS features.

### 3.4 POS Permission Convention

**File:** `src/app/pos/context/pos-permission-context.tsx`

```typescript
export function usePosPermission(permissionKey: string): {
  granted: boolean;
  loading: boolean;
}
```

Usage example (`src/app/pos/components/coupon-input.tsx:18`):
```typescript
const { granted: canApplyCoupons } = usePosPermission('pos.apply_coupons');
```

Buttons are **disabled** (not hidden) when permission denied, with a title tooltip explaining why.

### 3.5 Admin Inventory Nav Structure

**File:** `src/lib/auth/roles.ts:110–130`
```typescript
{
  label: 'Inventory',
  href: '/admin/inventory',
  icon: 'Warehouse',
  children: [
    { label: 'Purchase Orders', href: '/admin/inventory/purchase-orders', icon: 'ClipboardList' },
    { label: 'Stock History', href: '/admin/inventory/stock-history', icon: 'History' },
    { label: 'Vendors', href: '/admin/inventory/vendors', icon: 'Truck' },
  ],
},
```

### 3.6 Where Shop Expenses Route Fits

Add after "Stock History" in the children array:
```typescript
{ label: 'Shop Expenses', href: '/admin/inventory/shop-expenses', icon: 'Receipt' },
```

This follows the convention: noun describing the data, icon from lucide-react.

### 3.7 Reusable Components

| Component | Exists | Path | Notes |
|-----------|--------|------|-------|
| Date Range Picker (shared) | **NO** | — | Inline date-preset logic in `src/app/admin/transactions/page.tsx:71–120` and `src/app/admin/settings/audit-log/page.tsx:82–104`. Copy pattern. |
| CSV Export API | **YES (pattern)** | `src/app/api/admin/audit-log/export/route.ts` | `escapeCsv()`, `formatPstDate()`, Content-Disposition attachment header. |
| DataTable | **YES** | `src/components/ui/data-table.tsx` | Column defs, pagination, sorting, export filename. |
| Permission gate (admin) | **YES** | `src/lib/hooks/use-permission.ts` | `usePermission('inventory.view_expense_report')` |

---

## Section 4 — Schema Extension Feasibility

### 4.1 adjustment_type CHECK Constraint

**File:** `supabase/migrations/20260211000005_purchase_orders_stock_adjustments.sql:84`
```sql
CHECK (adjustment_type IN ('manual', 'received', 'sold', 'returned', 'damaged', 'recount'))
```

**To add `'shop_use'`:** Must DROP and re-CREATE the constraint. Postgres does not support ALTER CHECK. Migration shape:

```sql
ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('manual', 'received', 'sold', 'returned', 'damaged', 'recount', 'shop_use'));
```

### 4.2 reference_type CHECK Constraint

**File:** Same migration, line 90:
```sql
CHECK (reference_type IN ('purchase_order', 'transaction', 'refund'))
```

For shop-use, we could use `reference_type = NULL` (no reference entity) or add `'shop_use'`. If tracking by session/employee only, NULL suffices. If we create a `shop_use_logs` parent table, add it:

```sql
ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_reference_type_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN ('purchase_order', 'transaction', 'refund', 'shop_use'));
```

### 4.3 Cost Snapshot Column

**Does NOT exist** on `stock_adjustments`. No `cost_snapshot`, `cost_at_time`, or `unit_cost` column. The table is quantity-only.

**Needed?** For shop-use expense reporting, we need cost data. Options:
1. Add `unit_cost NUMERIC(10,2)` to `stock_adjustments` (captures cost at time of use)
2. JOIN to `products.cost_price` at query time (less accurate — cost may change between use and report)

Recommendation: Add `unit_cost` column. It's nullable (existing rows stay NULL), and the shop-use + sold adjustments can capture it going forward.

### 4.4 RLS Policies on stock_adjustments

**File:** Same migration, lines 115–116:
```sql
CREATE POLICY sa_select ON stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY sa_write ON stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**All authenticated users can INSERT.** No RLS barrier for detailer role writing shop-use records. Permission enforcement is at the API route level only.

---

## Section 5 — Permissions Audit (Cross-Cutting)

### 5.1 Existing Inventory Permission Keys

**File:** `src/lib/utils/role-defaults.ts:51–57`

```
inventory.view_stock
inventory.adjust_stock
inventory.manage_po
inventory.receive
inventory.view_costs
inventory.view_cost_data
inventory.manage_vendors
```

### 5.2 Role → Permission Mapping

| Permission | super_admin | admin | cashier | detailer |
|------------|:-----------:|:-----:|:-------:|:--------:|
| inventory.view_stock | true | true | true | false |
| inventory.adjust_stock | true | true | false | false |
| inventory.manage_po | true | true | false | false |
| inventory.receive | true | true | true | false |
| inventory.view_costs | true | true | false | false |
| inventory.view_cost_data | true | true | false | false |
| inventory.manage_vendors | true | true | false | false |

### 5.3 Permission Config Location

**Single file:** `src/lib/utils/role-defaults.ts` — defines default permission values per role. `permissions` DB table stores overrides.

### 5.4 Naming Convention for New Keys

Existing: `inventory.{verb}_{noun}` (e.g., `view_stock`, `adjust_stock`, `manage_po`).

Proposed additions:
- `inventory.shop_use` — detailer + cashier + admin + super_admin (all POS users)
- `inventory.view_expense_report` — admin + super_admin only

These fit the existing convention.

### 5.5 API Route Permission Check Pattern

**File:** `src/app/api/admin/stock-adjustments/route.ts:97–99`
```typescript
const { requirePermission } = await import('@/lib/auth/require-permission');
const denied = await requirePermission(employee.id, 'inventory.adjust_stock');
if (denied) return denied;
```

For POS routes using HMAC auth:
```typescript
const posEmployee = await authenticatePosRequest(request);
// Then check permission via:
const { checkPermission } = await import('@/lib/auth/check-permission');
const { granted } = await checkPermission(posEmployee.employee_id, 'inventory.shop_use');
if (!granted) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

---

## Section 6 — Test Infrastructure

### 6.1 Existing Refund Tests

**File:** `src/lib/utils/__tests__/refund-math.test.ts`

Tests refund calculation precision (`toCents`, `fromCents`, `computePerUnitRefundableCents`, etc.). Does NOT test dialog state shape or restock behavior.

### 6.2 POS Endpoint Tests

**None.** No test files exist for:
- `src/app/api/pos/transactions/route.ts`
- `src/app/api/pos/refunds/route.ts`
- `src/app/api/admin/stock-adjustments/route.ts`

### 6.3 Inventory Audit Trail Tests

**None.** Confirmed still absent. Session 34 flagged this gap.

### 6.4 Mocking Requirements

Supabase calls would need mocking for unit tests of stock_adjustments logic. Better approach: extract a pure `buildStockAdjustmentPayload()` helper and test that. The actual DB insert is standard Supabase boilerplate.

---

## Section 7 — Session 34 Cleanup Items

### 7.1 Bug 5 — Phantom PO Columns in DB_SCHEMA.md

**File:** `docs/dev/DB_SCHEMA.md`

Lines to remove from the `purchase_orders` table (lines 834, 836–838):
```
| expected_at | TIMESTAMPTZ | | |
| subtotal | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| shipping_cost | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
```

Keep `received_at` (line 835) — that one is real.

### 7.2 Deferred Items (Confirm NOT in Scope)

| Item | Status | Reason |
|------|--------|--------|
| `decrement_product_quantity` RPC creation | **Deferred** | Separate session. Fallback works; race condition is low-risk for single-register operation. |
| Dashboard low-stock badge | **Deferred** | Nice-to-have. Not blocking. |
| Cycle counts / stock counts | **Deferred permanently** | Overkill for <50 SKU retail operation. |
| Notification recipients admin UI | **Deferred** | Email alerts work with business email fallback. |

---

## Section 8 — Risk & Gotcha Surface

### 8.1 Files Touched by Multiple Parts

| File | Parts | Conflict Risk |
|------|-------|---------------|
| `src/app/api/pos/refunds/route.ts` | Part 1 (disposition payload change) + Part 2 (stock_adjustments insert) | **HIGH** — both modify the restock logic block (lines 240–268). Must be done together. |
| `src/lib/utils/validation.ts` | Part 1 (refund schema change: `restock` → `disposition`) | LOW — isolated schema block |
| `src/lib/utils/role-defaults.ts` | Part 3 (new permission keys) | LOW — additive |
| `src/lib/auth/roles.ts` | Part 3 (new nav item) | LOW — additive |

### 8.2 Destructive Migration Required

The `stock_adjustments` CHECK constraints **cannot be modified in-place**. Postgres requires DROP + re-ADD:

```sql
-- Migration: 2026XXXX_extend_stock_adjustment_types.sql

-- Extend adjustment_type to include 'shop_use'
ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('manual', 'received', 'sold', 'returned', 'damaged', 'recount', 'shop_use'));

-- Optionally extend reference_type (only if shop_use gets its own reference)
-- ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_reference_type_check;
-- ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_reference_type_check
--   CHECK (reference_type IN ('purchase_order', 'transaction', 'refund', 'shop_use'));

-- Add cost snapshot column for expense reporting
ALTER TABLE stock_adjustments ADD COLUMN unit_cost NUMERIC(10,2) DEFAULT NULL;
```

**Risk:** The DROP + ADD is atomic within a single migration. No data loss. Existing rows are unaffected (they already satisfy the new constraint which is a superset).

### 8.3 API Contract Change Risk

**Refund payload change (Part 1):**

Current client sends: `{ restock: boolean }`

New client will send: `{ disposition: 'restock' | 'damaged' | 'kept' }` (or similar)

**Risk:** If old client code (cached PWA) sends `restock: true/false` after new server code expects `disposition`, refunds will break.

**Mitigation:** Server should accept BOTH formats during transition:
```typescript
// Backwards compatibility: accept old `restock` boolean OR new `disposition` field
const disposition = item.disposition ?? (item.restock ? 'restock' : 'kept');
```

### 8.4 Disposition Semantics for stock_adjustments

| Disposition | Increment quantity_on_hand? | Write stock_adjustment? | adjustment_type | Notes |
|-------------|:---------------------------:|:-----------------------:|-----------------|-------|
| **Restock** | YES | YES | `'returned'` | Item goes back on shelf |
| **Damaged** | NO | YES | `'damaged'` | Item is disposed of — quantity stays decremented, but audit trail records loss |
| **Customer Kept** | NO | NO | — | No inventory action. Refund is financial only. |
| **Mixed** | Per-line | Per-line | Varies | Each line gets its own disposition |

**Key insight:** "Damaged" SHOULD write a stock_adjustment even though it doesn't increment stock — this provides the audit trail for write-offs. The `quantity_change` would be `0` (stock was already decremented at sale time), but the record documents why it wasn't restocked. Alternatively, skip the adjustment for damaged items since the quantity was already gone at sale time — the `refund_items.disposition` column serves as the audit trail.

**Recommended approach:** Only write `stock_adjustments` for `disposition = 'restock'` (the increment case). Damaged/kept dispositions are recorded in `refund_items.disposition` column — no inventory movement needed since the stock was already decremented at sale.

### 8.5 Bundled Session Feasibility

**Verdict: Feasible as one session.** The three features share a single migration (extend CHECK + add `unit_cost` column) and touch overlapping code (refund endpoint). Splitting would cause merge conflicts. The natural order is:

1. Migration first (schema extension)
2. Part 2 (wire stock_adjustments in transactions + refunds — enables audit trail)
3. Part 1 (refund disposition rework — builds on Part 2's refund changes)
4. Part 3 (shop-use — new feature, clean addition, references Part 2's helper)

No blockers identified.
