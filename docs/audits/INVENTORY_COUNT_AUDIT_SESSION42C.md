# Inventory Count Feature Audit — Session 42C

> **Scope.** Design audit for a new "Inventory Count" feature.
> Maps current `stock_adjustments` state, references industry conventions,
> proposes data model + UI + multi-counter semantics, and splits MVP
> from future scope for implementation in Session 42D.
>
> **Date.** 2026-04-21. **Author.** Claude (Session 42C).
>
> **Read-only.** No code changes, no migrations, no doc edits outside
> this file.

---

## Section 1 — Current `stock_adjustments` state

### 1.1 Table schema

Base: `supabase/migrations/20260211000005_purchase_orders_stock_adjustments.sql` L81-99.
Extended: `supabase/migrations/20260420000001_extend_stock_adjustments.sql` L1-31.

| # | Column | Type | Nullable | Default | Constraint | Source |
|---|---|---|---|---|---|---|
| 1 | `id` | UUID | NO | `gen_random_uuid()` | PRIMARY KEY | base |
| 2 | `product_id` | UUID | NO | — | FK `products(id) ON DELETE RESTRICT` | base |
| 3 | `adjustment_type` | TEXT | NO | — | CHECK (8 values — see 1.2) | base + extended |
| 4 | `quantity_change` | INTEGER | NO | — | signed; 0 allowed (damage/kept) | base |
| 5 | `quantity_before` | INTEGER | NO | — | — | base |
| 6 | `quantity_after` | INTEGER | NO | — | — | base |
| 7 | `reason` | TEXT | YES | — | — | base |
| 8 | `reference_id` | UUID | YES | — | — | base |
| 9 | `reference_type` | TEXT | YES | — | CHECK (4 values — see 1.2) | base + extended |
| 10 | `created_by` | UUID | YES | — | FK `employees(id) ON DELETE SET NULL` | base |
| 11 | `created_at` | TIMESTAMPTZ | NO | `now()` | — | base |
| 12 | `unit_cost` | NUMERIC(10,2) | YES | `NULL` | Snapshot of `products.cost_price` at call | extended |

No triggers. No FKs into stock_adjustments from other tables.

### 1.2 Enum values (TEXT columns with CHECK)

`adjustment_type` — 8 valid values (`20260420000001:5-12`):

```
'manual', 'received', 'sold', 'returned',
'damaged', 'recount', 'shop_use', 'customer_retained'
```

`reference_type` — 4 valid values (`20260420000001:14-21`):

```
'purchase_order', 'transaction', 'refund', 'shop_use'
```

Mirror in TypeScript at `src/lib/utils/stock-adjustments.ts:3-18`:

```ts
export type AdjustmentType =
  | 'manual' | 'received' | 'sold' | 'returned'
  | 'damaged' | 'recount' | 'shop_use' | 'customer_retained';

export type ReferenceType =
  | 'purchase_order' | 'transaction' | 'refund' | 'shop_use' | null;
```

**The existing `'recount'` value is the natural fit for an Inventory Count feature.** No new enum entry needed.

### 1.3 Indexes

All in base migration except the last (extended):

| Index | Columns | Notes |
|---|---|---|
| `idx_stock_adj_product` | `(product_id)` | — |
| `idx_stock_adj_type` | `(adjustment_type)` | — |
| `idx_stock_adj_created` | `(created_at DESC)` | — |
| `idx_stock_adj_reference` | `(reference_id)` WHERE `reference_id IS NOT NULL` | partial |
| `idx_stock_adjustments_type_created` | `(adjustment_type, created_at DESC)` | composite, added in extended migration |

### 1.4 RLS

Base migration `20260211000005:107`:

```sql
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sa_select ON stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY sa_write  ON stock_adjustments FOR ALL    TO authenticated USING (true) WITH CHECK (true);
```

Fully permissive for authenticated users. Role/permission gating happens
at the API layer, not RLS.

### 1.5 Centralized helper — `logStockAdjustment`

File: `src/lib/utils/stock-adjustments.ts:46-72`.

```ts
export async function logStockAdjustment(input: StockAdjustmentInput):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { supabase, ...row } = input;
  const { data, error } = await supabase
    .from('stock_adjustments')
    .insert({
      product_id: row.product_id,
      adjustment_type: row.adjustment_type,
      quantity_change: row.quantity_change,
      quantity_before: row.quantity_before,
      quantity_after: row.quantity_after,
      reason: row.reason,
      reference_id: row.reference_id ?? null,
      reference_type: row.reference_type ?? null,
      created_by: row.created_by,
      unit_cost: row.unit_cost ?? null,
    })
    .select('id').single();
  ...
}
```

**Critical property** (documented in the helper's JSDoc L38-44):

> *"This helper does NOT update `products.quantity_on_hand`. Callers
> must update quantity separately and pass the before/after values here.
> Every inventory movement should pass through here, including
> movements that don't change quantity (damage write-offs,
> customer-retained refunds) — the purpose is the audit trail, not
> just the quantity delta."*

**Implication for Inventory Count.** The helper only writes the audit
row. Any batch commit path must:
1. Read current `products.quantity_on_hand` per product.
2. Update each product's qty.
3. Call `logStockAdjustment` with `before` / `after` / `change` values.

There is no DB-level transaction wrapping steps 2 and 3. See §1.8.

### 1.6 The `/api/admin/stock-adjustments` endpoint

File: `src/app/api/admin/stock-adjustments/route.ts`.

**Request (POST, single item):**

```ts
{ product_id, adjustment, reason?, adjustment_type? }
```

Validated against `adjustment` being a non-zero number (L105-107).

**Behavior (L109-148):**
1. `requirePermission(employee.id, 'inventory.adjust_stock')` at L99.
2. Fetch product's current `quantity_on_hand`.
3. Compute `quantityAfter = quantityBefore + adjustment`.
4. Reject if `quantityAfter < 0` (L123-125).
5. `UPDATE products SET quantity_on_hand = ...`.
6. Call `logStockAdjustment(...)`.
7. `logAudit(...)` for the admin audit log (L154-169).
8. Return 201 with `{ data: { id, product_id, quantity_before, quantity_after, adjustment } }`.

**Limitations for counting:**

- **Single adjustment per request.** No batch endpoint. A count of
  N products = N sequential HTTP calls.
- **Atomicity.** Steps 5 and 6 are not wrapped in a transaction. If
  step 5 succeeds and step 6 fails, the stock is updated but the audit
  row is missing. L150-152 acknowledges this: *"Stock was already
  updated — log error but don't fail"*.
- **Permission.** `inventory.adjust_stock` — same permission used by
  Quick Edit drawer and any future count feature.
- **Feature flag.** `INVENTORY_MANAGEMENT` at L11. If disabled,
  returns 403. The count feature will inherit the same gate.

### 1.7 Every code path that writes to `stock_adjustments`

All writes go through `logStockAdjustment`. Zero direct inserts found.

| Caller | File | Line | adjustment_type | Updates products.qty | Reference |
|---|---|---|---|---|---|
| Admin single adjust API | `src/app/api/admin/stock-adjustments/route.ts` | 139 | `'manual'` (default; accepts any type from body) | Yes (L128-131) | — |
| Quick Edit drawer | `src/app/admin/catalog/products/components/quick-edit-drawer.tsx` | 271 | `'manual' \| 'recount' \| 'damaged' \| 'shop_use'` (user-picked) | Via the admin API above | — |
| POS sale | `src/app/api/pos/transactions/route.ts` | 207 | `'sold'` | Yes (L202-205) | `reference_type='transaction'` |
| POS refund (restock) | `src/app/api/pos/refunds/route.ts` | 295 | `'returned'` | Yes | `reference_type='refund'` |
| POS refund (damaged) | `src/app/api/pos/refunds/route.ts` | 295 | `'damaged'` | No (qty_change = 0) | `reference_type='refund'` |
| POS refund (kept) | `src/app/api/pos/refunds/route.ts` | 295 | `'customer_retained'` | No | `reference_type='refund'` |
| PO receive | `src/app/api/admin/purchase-orders/[id]/receive/route.ts` | 131 | `'received'` | Yes (L115-121) | `reference_type='purchase_order'` |
| Shop use | `src/app/api/pos/shop-use/route.ts` | 66 | `'shop_use'` | Yes (L55-58) | `reference_type='shop_use'` |
| Offline sync | `src/app/api/pos/sync-offline-transaction/route.ts` | 167 | `'sold'` | Yes (L162-165) | `reference_type='transaction'` |

**Read-only log viewer** at `src/app/admin/inventory/stock-history/page.tsx`
paginates the table via the GET handler above. Filter by type; no edit UI.

### 1.8 Assessment — can batched counts use the current pattern?

**Answer.** Yes technically, **but with caveats** the MVP must own:

- The single-adjustment API is not a fit for batched commits of 50-500
  items. Sending N sequential requests would be slow (10-100x RTT
  cost) and leave the client holding partial-failure state.
- The helper and `UPDATE products` are not transactionally wrapped.
  For a single adjust this is tolerable (only one product can desync).
  For a batch of 500, mid-loop failure would leave a tangle of
  partially-updated products + partial audit rows.

**Resolution direction for 42D.** A new batch endpoint
(e.g. `POST /api/admin/stock-adjustments/batch`) that accepts an
array, writes all audit rows + product updates inside a single
`supabase.rpc(...)` call or a server-side function. Alternatively:
live with per-item calls and accept mid-count partial commits as a
risk documented in §9.

The simpler path for MVP is **the batch endpoint**. It's additive
(doesn't touch existing write paths), and the commit step is a single
blocking HTTP request which gives the user a clear done/not-done
signal.

---

## Section 2 — Industry pattern reference

Claude's training knowledge of the three systems below is sufficient
for the terminology and flow. Product details change quarterly, so
specifics below are **recent-memory accurate but not authoritative**.
When specifics matter, verify in vendor docs.

### 2.1 Shopify POS

- **Flow.** "Inventory adjustments" is a list view in Shopify admin.
  "Stocktake" is a paid add-on (Stocky) that provides the dedicated
  counting UI.
- **Stocky model.** Create a stocktake → assign locations + item
  filters (by vendor, type, or "all") → fill in counted qty per line
  → complete → system generates the reconciliation adjustments.
- **Data model.** Stocktake header + line items persisted. Resumable
  across sessions/devices.
- **Multi-device.** Stocktake is single-user-edited at a time in
  MVP memory; multiple staff can work the same stocktake but the
  conflict semantics are "last write wins per line."
- **Variance review.** Side-by-side `counted` vs `on hand` columns,
  variance column, filter by non-zero variance.
- **Scanner.** Barcode scan adds the product to the stocktake if
  absent; subsequent scans increment.

### 2.2 Square for Retail

- **Flow.** Retail-tier feature. "Inventory counts" in Square Dashboard
  and on POS hardware.
- **Model.** Each count is a session with a name + notes. Counts can
  be filtered to categories. Counted qty captured per SKU.
- **Multi-device.** Square supports multiple counts concurrently at
  the same location; each is a separate session. Merging two sessions
  into one final adjustment is manual (user picks authoritative
  number).
- **Partial counts.** Save partial, resume later. Pending counts
  visible on dashboard.
- **Commit.** "Apply count" replaces on-hand with counted. A
  variance ledger is written automatically. Underlying equivalent of
  our `stock_adjustments`.
- **Scanner.** First scan adds item at counted=1. Subsequent scans
  increment. Manual override available. Square's iPad UI is the
  closest analog to what user is asking for here.

### 2.3 Lightspeed Retail (X-Series / R-Series)

- **Flow.** "Stock Counts" tab. More formal: create count → filter
  products (supplier, tag, category, or full) → export PDF counting
  sheet (offline-friendly) → import counted values via CSV or
  in-app scanner → review → process.
- **Model.** Header + line items + status enum
  (scheduled, in_progress, completed, cancelled).
- **Multi-device.** Staff can count concurrently via the Lightspeed
  mobile app; each line is timestamped with the user.
- **Partial counts.** "Parked" counts can be resumed.
- **Commit.** "Process" generates journal entries + updates on-hand.
  Historical counts are kept as records.
- **Scanner.** Scan increments. "Batch entry" screen lets staff
  type SKU + qty if scanning isn't practical.

### 2.4 Synthesized conventions

Across all three:

1. **Persist the count.** Counts are table-backed, not browser-ephemeral.
   Resumable.
2. **Header + line items** data model is standard. Header tracks
   status, scope, and who; line items track per-product counted_qty,
   expected_qty at capture time, user, timestamp.
3. **Variance, not overwrite, is the UI focus.** Users see `counted`
   vs `on-hand` side by side before commit.
4. **Scan = +1** is universal. Manual override always available.
5. **"Freeze" of expected at count start** is the default behavior.
   Post-commit, the system knows "as of time T, expected was X,
   counted was Y, adjustment is Y-X."
6. **Concurrent counters** on different devices: independent sessions
   in Square; shared session with last-write-wins in Lightspeed.
   Neither does real-time conflict resolution for a shared session.
7. **No hard block on POS sales during a count** in any of the three.
   Stocktake variance reports do include an "adjustments made during
   count" note, but POS is never locked.

---

## Section 3 — Data model proposal

Three options to evaluate, given the requirements (mixed full/sectional,
1-3 concurrent counters, scan-driven +1, manual override, variance
review, batch commit).

### 3.1 Option A — lightweight: batch stock_adjustments, no new tables

**Model.** A count is ephemeral client-side state. Each counter works
in-memory on their iPad. At commit, the client sends a batch payload;
the server loops through, updates `products.quantity_on_hand`, and
writes `adjustment_type='recount'` rows.

**Pros.**
- No schema change.
- Minimal code footprint.

**Cons.**
- **Not resumable.** Browser refresh / iPad shutdown during a
  three-hour full-store count = loss of all counted data.
- **No multi-counter support** (beyond N separate in-memory sessions
  that can't see each other).
- **No historical record of the count itself.** Only the resulting
  adjustments are kept. Audit can't answer "how was this count
  organized?"
- **Variance review is in-memory only.** Pause = lose state.
- Requires the batch endpoint from §1.8 regardless.

**Verdict.** Rejected. Doesn't meet user's operational needs —
counts span hours and staff want to leave/come back.

### 3.2 Option B — full: `stock_counts` + `stock_count_items` tables

**Model.**

```sql
CREATE TABLE stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('draft','in_progress','review','committed','cancelled')),
  section_label TEXT,
  count_type TEXT CHECK (count_type IN ('full','sectional')),
  started_by UUID REFERENCES employees(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by UUID REFERENCES employees(id),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_qty INTEGER NOT NULL, -- snapshot at first scan / add
  counted_qty INTEGER NOT NULL DEFAULT 0,
  last_updated_by UUID REFERENCES employees(id),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE (stock_count_id, product_id)
);
```

Plus a separate header per counter (§5 option), or one header shared
with creator_id per line (Option C).

**Pros.**
- Resumable across sessions and devices.
- Survives browser refresh.
- Historical record retained for audit.
- Supports concurrent counters via multiple `stock_counts` rows.
- Variance review queries directly against the table.

**Cons.**
- Two new tables + migration + RLS + indexes.
- Commit logic = transaction across stock_counts.status, stock_count_items,
  products, stock_adjustments — the largest single write in the app
  outside of PO receive.

**Verdict.** Correct long-term model. Worth the complexity for this
use case.

### 3.3 Option C — hybrid: single shared header, creator_id per line

**Model.** Same tables as Option B, but **don't** split per-user. All
counters share one `stock_counts` row. `stock_count_items` has
`last_updated_by` for attribution. Conflicts resolved via
last-write-wins on `counted_qty`.

**Pros.**
- Simpler than full Option B (no merge step at commit).
- Staff physically dividing sections don't see each other's numbers —
  they just edit disjoint rows.
- If two counters scan the same product, both increments land (first
  scan adds to 1, second scan updates to 2). The timeline of
  `last_updated_at` is the audit trail.

**Cons.**
- If two counters start counting the same shelf without realizing,
  both are incrementing the same row — result is 2x the real count.
  User has to notice at variance review.
- No independent per-counter review (e.g., "show me what Alice
  counted vs what Bob counted" is not natively answered — you'd need
  to inspect `last_updated_by` history).

**Verdict.** Best fit for MVP. Matches user's stated model: 2-3 people
divide sections, not the same products. The risk of overlap is a
human-process problem, not a data-model problem.

### 3.4 Recommendation

**Option C for MVP.** Matches operational model. Avoids premature
per-counter complexity. The multi-counter merge problem can be lifted
later by adding a `counter_id` column to items + a merge-rules table,
without breaking backward compatibility.

**Dependencies on §1 findings.**
- Section 1.8 identified that the existing `/api/admin/stock-adjustments`
  POST is single-item only. The commit path for a count will need a
  new batch endpoint regardless of which option we pick.
- The `logStockAdjustment` helper is reusable at commit time — the
  new batch endpoint loops over items, updates `products.quantity_on_hand`,
  calls the helper with `adjustment_type='recount'` + `reference_type='stock_count'` + `reference_id=<stock_count.id>`.
- **`reference_type='stock_count'`** is not currently a valid enum
  value. Either extend the CHECK constraint in the 42D migration, or
  leave `reference_type=NULL` and rely on `reference_id` pointing
  into `stock_counts`. **Recommend extending the constraint** for
  query hygiene.

### 3.5 Proposed enum extensions for 42D

```sql
-- In the 42D migration:
ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_reference_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN ('purchase_order','transaction','refund','shop_use','stock_count'));
```

No change to `adjustment_type` — `'recount'` already covers it.

---

## Section 4 — UI surface proposal

### 4.1 Placement

**Recommend** `/admin/inventory/counts/` as a new section in the
Inventory group, alongside Purchase Orders, Stock History, Shop
Expenses, and Vendors.

Sidebar entry (source: `src/lib/auth/roles.ts:111-135`, per exploration):

```
Inventory
├── Purchase Orders
├── Inventory Counts    ← NEW
├── Stock History
├── Shop Expenses
└── Vendors
```

Icon: `ClipboardCheck` or `ListChecks` from lucide-react.

**Routes (mirrors PO pattern):**

| Route | Purpose | Status |
|---|---|---|
| `/admin/inventory/counts` | List view: all counts, filter by status | MVP |
| `/admin/inventory/counts/new` | Start-count screen | MVP |
| `/admin/inventory/counts/[id]` | Active count (in_progress / review) | MVP |
| `/admin/inventory/counts/[id]` (status=committed) | Frozen read-only view | MVP |

### 4.2 Start screen (`/counts/new`)

Minimal form:
- **Section label** (free text, e.g., "Shelf A1-A5" or "Full Store")
- **Count type**: radio — `full` / `sectional`
- **Started by**: read from current session; no UI field
- **Notes**: optional textarea
- Button: "Start Count" → POST `/api/admin/inventory/counts` →
  redirect to `/admin/inventory/counts/[id]` at `status='in_progress'`.

List page also shows any existing open counts (`status IN ('draft','in_progress','review')`)
with Resume link, so a counter whose iPad died can pick up where they
left off.

### 4.3 Active count screen (`/counts/[id]` while `status='in_progress'`)

Layout optimized for iPad landscape + scanner in hand.

**Top bar:**
- Count title + section label + count type badge
- Counter: "X products touched / Y in scope" (scope = total
  active products if full; total product count for now if sectional)
- Started timer (elapsed since `started_at`)
- Actions: "Pause" (returns to list; count stays `in_progress`),
  "Review" (→ review screen)

**Scan bar (sticky, top):**
- Visible or implicit via `useBarcodeScanner` hook
  (`src/lib/hooks/use-barcode-scanner.ts`) with
  `requireTargetAttribute=false` (list-view scanning pattern).
- Toast on scan: "Logged: {product name} (counted: N)".
- Error toast on scan-miss (barcode not found in products): **link
  to Quick Edit flow to add/correct the barcode**. See §6.

**Product list (main body):**
Each row = one `stock_count_items` line.
- Left: product name + variant label + SKU (small, monospace)
- Middle: **counted qty** (big, tap-to-edit opens numeric keypad)
- Right: **expected qty** (subtle), **variance** (colored — green
  zero, amber ±1-2, red >3)
- Row is only in the list once something is counted (scan added it,
  or user manually added).
- Tap-and-hold on row: remove from count (soft — sets
  `counted_qty=0` but keeps the row so variance isn't lost).

**Bottom bar (sticky):**
- "Add Product" (opens picker for manual add without scan)
- "Finish Counting" (→ review screen, sets `status='review'`)

### 4.4 Review screen (`/counts/[id]` while `status='review'`)

Same layout as active, but:
- Scan bar disabled (or re-enabled if user hits "Back to counting").
- Filter toggle: "All" / "Variances only".
- Each row is editable — tap any counted qty to adjust.
- Variance summary at top: "N products with variance, total delta Z
  units."
- Bottom bar actions:
  - "Back to Counting" (sets `status='in_progress'`).
  - "Commit" (confirm dialog → POST
    `/api/admin/inventory/counts/[id]/commit` → batch adjustments →
    `status='committed'`).
  - "Cancel Count" (confirm dialog → `status='cancelled'`, no
    stock_adjustments written).

### 4.5 Completed count view (`/counts/[id]` while `status='committed'`)

Frozen. No edit UI. Shows:
- Header metadata (started/completed, by whom, label, type, notes).
- Committed line items table: product, expected, counted, variance,
  last updated by.
- Link each row to the resulting `stock_adjustments` row
  (via `reference_id = stock_counts.id`).

Existing `/admin/inventory/stock-history` continues to surface these
individual adjustment rows alongside other types.

### 4.6 Scanner integration reference

The existing `useBarcodeScanner` hook in
`src/lib/hooks/use-barcode-scanner.ts` is already designed for
list-view scanning (non-input-targeted). Typical usage from POS
(`src/app/pos/components/pos-workspace.tsx:120-145`):

```ts
useBarcodeScanner({
  onScan: handleBarcodeScan,
  enabled: !locked,
});
```

Barcode lookup endpoint to reuse: `/api/admin/products/barcode-lookup`
(POST, returns product or null). Session 41C unified this with the
POS equivalent via `src/lib/products/barcode-lookup.ts`, which
matches on `barcode` OR `sku` for active products.

---

## Section 5 — Multi-counter support

### 5.1 MVP (Session 42D)

- **Single shared `stock_counts` row per count** (Option C).
- Multiple counters can open the same `/admin/inventory/counts/[id]`
  on different iPads and will see the same data on reload.
- Each increment writes `last_updated_by` and `last_updated_at` on
  the `stock_count_items` row.
- No real-time sync: each counter sees their own local state until
  they refresh, at which point they see the server state.
- **Conflict semantics.** Last write wins on `counted_qty`. In
  practice two counters hitting the same product is a process failure
  (they divided sections incorrectly); variance review surfaces the
  final value either way.

### 5.2 Deferred to 42E+

- **Real-time sync** via Supabase realtime channels — nice to have,
  not MVP.
- **Per-counter sub-sessions** — if user later says "I want to see
  exactly what Alice counted vs Bob counted," a `counter_id` column
  + merge step can be added.
- **Overlap warning on commit** — flag rows that were updated by 2+
  different staff within N minutes of each other; require
  confirmation.
- **Offline mode** — counters lose WiFi, data queues locally, syncs
  on reconnect. Hard problem; out of scope.

### 5.3 Proposed MVP vs future split

| Capability | MVP (42D) | Deferred |
|---|---|---|
| Single count, one user | ✓ | — |
| Single count, multiple users same iPad via account swap | ✓ | — |
| Multiple users different iPads, shared count, last-write-wins | ✓ | — |
| Real-time sync between iPads | — | ✓ (future) |
| Per-counter attribution beyond `last_updated_by` | — | ✓ |
| Offline counting | — | ✓ |
| Overlap warnings | — | ✓ |

---

## Section 6 — Scan-increment semantics

User's rule: **one scan = +1 to counted_qty for that product.**

### 6.1 Double-scan

**Design rule.** Always treat a scan as intentional (+1). Do not
debounce or de-duplicate scans by time.

**Rationale.** Inventory counting is the one time double-scans are
usually legitimate: the counter has two of the product in hand and
scans each. If the scanner misreads and ends up double-firing, that's
a hardware issue — and the variance review step will surface it.

### 6.2 Unknown product (not yet in count)

First scan of a product adds it to `stock_count_items` with
`counted_qty=1` and `expected_qty=` snapshot of current
`products.quantity_on_hand` at that moment. This is the natural
"expected freeze" point — see §9 for implications.

### 6.3 Inactive product (`is_active=false`)

Existing `lookupProductByScanCode` in `src/lib/products/barcode-lookup.ts:47-48`
hard-filters on `is_active=true`, so inactive products **currently
return null** from a scan.

**Recommendation for the count feature.** Do not override this filter
in the MVP; if an inactive product is physically present, it shouldn't
be counted — the user should reactivate it first. Flag this as a
potential future-scope item: "allow scanning of inactive products
with a confirmation dialog during a count."

### 6.4 Scan miss (barcode not in DB)

**Today.** Session 41C's drawer surfaces a "product not found" toast
and closes. There's no dedicated add-missing-barcode flow in admin.
(The POS catalog flow adds catalog entries via separate create form.)

**Recommendation for the count feature.** Toast + a button "Add
product with this barcode" that links to
`/admin/catalog/products/new?barcode={scanned}`. This is a
**soft dependency** on the catalog feature — the count doesn't fix
it, but it surfaces the gap cleanly.

### 6.5 Units vs packs

A product sold individually but received/counted by the case means
one scan of the case = 12 units, not 1. The products table has no
`pack_size` column today.

**Recommendation.** Out of scope for MVP. Users count by the unit the
product is priced at (same as how it's sold). Document as a future
feature if it recurs.

### 6.6 Manual qty entry

Tap any row's counted qty → numeric keypad modal → enter N → save
directly to `counted_qty`. Does not increment; it **overwrites**.
Attribution goes to the user who entered the value via
`last_updated_by`.

---

## Section 7 — Integration with Quick Edit drawer

The drawer (Sessions 41B/41C) is not touched by this feature.

**Confirmed.**

- Quick Edit drawer's qty change path remains at
  `POST /api/admin/stock-adjustments` with `adjustment_type='manual' |
  'recount' | 'damaged' | 'shop_use'`. Unchanged.
- Inventory Count feature writes adjustments with `adjustment_type='recount'`
  and `reference_type='stock_count'` (new) pointing to the
  `stock_counts.id`. Distinguishable in Stock History.
- Both surfaces share:
  - The `logStockAdjustment` helper.
  - The `products.quantity_on_hand` target.
  - The `inventory.adjust_stock` permission (optionally, the count
    feature could gate on a separate `inventory.run_count` permission;
    see 42D).
- **Use-case separation.**
  - **Drawer** = one-off correction during catalog work ("I noticed
    this product's qty is wrong, let me fix it"). Audited with
    reason category.
  - **Inventory Count** = scheduled/unscheduled physical count,
    multiple products at once, variance-before-commit review.

Both are valid, non-overlapping workflows. See §42A audit §4.4.1 for
the existing warning about Basic Info's direct-qty-write bypass;
that's a **separate** bug, and 42D's Inventory Count feature does
not fix or exacerbate it.

---

## Section 8 — Division of labor with Session 42D

### 8.1 Proposed MVP scope (42D)

**In:**
1. Migration: `stock_counts`, `stock_count_items` tables, RLS,
   indexes, enum extension on `stock_adjustments.reference_type`
   (add `'stock_count'`).
2. API routes:
   - `POST /api/admin/inventory/counts` — start count
   - `GET /api/admin/inventory/counts` — list
   - `GET /api/admin/inventory/counts/[id]` — load one
   - `PATCH /api/admin/inventory/counts/[id]` — update metadata,
     status transitions
   - `POST /api/admin/inventory/counts/[id]/items` — increment-or-upsert
     (scan handler) and manual override
   - `PATCH /api/admin/inventory/counts/[id]/items/[itemId]` —
     update single item (manual override)
   - `DELETE /api/admin/inventory/counts/[id]/items/[itemId]` —
     soft remove from count
   - `POST /api/admin/inventory/counts/[id]/commit` — batch apply
     (the §1.8 batch endpoint, loop-over-items + call
     `logStockAdjustment` per item + update `products.quantity_on_hand`
     + set `stock_counts.status='committed'`)
   - `POST /api/admin/inventory/counts/[id]/cancel` —
     `status='cancelled'`, no stock writes
3. UI:
   - `/admin/inventory/counts` list page
   - `/admin/inventory/counts/new` start-count form
   - `/admin/inventory/counts/[id]` — the one page that renders
     active/review/committed states based on `status`
4. Barcode scanner integration via existing `useBarcodeScanner` hook.
5. Permission hookup: either reuse `inventory.adjust_stock` or add a
   new `inventory.run_count` permission in the 42D migration. Pick
   at session start.
6. Sidebar entry + FILE_TREE + DB_SCHEMA updates.

**Out (deferred):**
- Real-time sync between iPads (§5.2).
- Per-counter sub-sessions (§5.2).
- Section templates / saved scopes (§8.2).
- Count history analytics / reports (§8.2).
- ABC cycle count automation (§8.2).
- Pre-count full inventory snapshot (§9).
- Offline counting (§5.2).

### 8.2 Future sessions (42E+)

- **42E — Section templates.** Save named scopes ("Back room", "Front
  display, tier 1") for repeated counts.
- **42F — Count history analytics.** Variance trends per product,
  identifies shrink hotspots.
- **42G — Real-time sync.** Supabase realtime channel broadcasts
  updates between iPads.
- **Later — Cycle counting.** ABC segmentation; auto-schedule
  counts.

### 8.3 Prompt size assessment

42D's MVP is **large**: 2 new tables, 8 API routes, 3 pages, scanner
wiring, variance UI, commit batch logic. Likely exceeds the ~300-line
prompt target in CLAUDE.md memory #15.

**Recommendation for 42D.** Split into **42D-1** and **42D-2**:

- **42D-1** — schema + API. Migration + all endpoints + a minimal
  list-only UI that confirms the routes work. Verifiable via curl or
  SQL.
- **42D-2** — full count UI (start screen + active count +
  scanner + review + commit confirmation dialogs). Consumes 42D-1's
  APIs.

This keeps each session's change surface bounded.

---

## Section 9 — Concurrent POS sales during an active count

### 9.1 The problem

While a count is `status='in_progress'`, the POS can continue making
sales. Each sale decrements `products.quantity_on_hand` via
`src/app/api/pos/transactions/route.ts:202-205`. Consequences:

- **Variance at review is wrong.** User counts a product, sees
  `expected=10, counted=8`. A POS sale of 2 happens mid-count. When
  user reviews, the display of `expected` may or may not re-read from
  live `products.quantity_on_hand`, but physically 8 is now correct
  (10 - 2 = 8).
- **Commit arithmetic breaks under live-expected.** If we compute
  `adjustment = counted - expected_at_commit`, a mid-count sale makes
  us write adjustment = 0 (8 - 8) — wrong. The physical count said 8,
  but the "expected" we've snapshotted at commit was already lowered
  by the POS sale; the delta lost.

### 9.2 Options

**Option 1 — Freeze at first-touch (RECOMMEND).** When a product is
added to `stock_count_items` (first scan or manual add),
`expected_qty` = current `products.quantity_on_hand` at that moment.
At commit, adjustment = `counted_qty - expected_qty`. POS sales
during the count update `products.quantity_on_hand` naturally; they
don't touch `stock_count_items.expected_qty`. So the count reflects
"what was counted" minus "what we knew was on hand when we started
counting this product."

- **Pro.** Correct math. Doesn't block POS.
- **Con.** Actual `products.quantity_on_hand` at commit time is
  `original - POS_sales`. Applying the count's adjustment
  (`counted - expected`) on top of live qty works cleanly as long as
  the math is signed: `new_qty = live_qty + (counted - expected)`.
  That's the right formula.
- **Con.** Reveals stale expected values in the review screen. User
  sees "expected 10, counted 8, variance -2" but if 2 got sold
  during count, actual shrink is 0. Not a data problem; a user-education
  problem. Add a note on the review screen: *"Expected values are
  snapshots from when each product was first counted. POS sales
  during the count are applied separately."*

**Option 2 — Re-compute expected at commit.** At commit, read live
qty for each product, compute adjustment = `counted - live_qty`.
Broken for the reason above — POS sales show up as phantom shrink.

**Option 3 — Lock POS on products in active count scope.** Either
full-store lock if `count_type='full'` or per-product if sectional.

- **Pro.** Math is pure.
- **Con.** Operationally unacceptable for a working retail spot.
  User explicitly said counts sometimes run during open hours.

**Option 4 — Full-inventory snapshot at count start.** For full
counts, take a point-in-time copy of `products.quantity_on_hand`
for all active products into `stock_count_items(expected_qty)` at
`status='in_progress'` entry. Sectional counts still use the
first-touch freeze.

- **Pro.** Deterministic expected values across the whole count.
- **Con.** Snapshotting 500+ rows upfront adds ~2s to the start
  step. Not fatal, but slows down sectional counts that only need
  20 rows.

### 9.3 Recommendation

**Option 1 (first-touch freeze) for MVP.** Clearest semantics, lowest
code footprint, no POS disruption. Commit math is
`new_qty = live_qty + (counted_qty - expected_qty)` per product.

If user-testing reveals variance-review confusion, upgrade sectional
counts to first-touch and full counts to Option 4 (full snapshot at
start). That's a one-table-column change if needed later.

Document the semantics on the start screen: *"Expected values are
captured when each product is first counted. Continue running POS
sales as normal."*

---

## Appendix — tempting fixes not implemented

Per audit rules: flagged, not acted.

1. **Batch endpoint for `/api/admin/stock-adjustments`.** 42D will
   build a dedicated `/counts/[id]/commit` route; the single-adjust
   endpoint stays as-is. Future: consolidate if other code paths
   need batching.
2. **Atomicity of `logStockAdjustment` + `products.quantity_on_hand`
   update.** 42D's commit should wrap the batch in a Postgres
   function or `supabase.rpc` to get real transaction semantics.
   Noted for the 42D implementer.
3. **RLS tightening on `stock_adjustments`.** Currently permissive
   for all authenticated users. Could gate writes by role. Out of
   scope; existing behavior preserved.
4. **Session 42A §4.4.1 qty footgun.** Basic Info direct-qty-write.
   Not this session. Not 42D either — 42D's Inventory Count only
   writes through the new `/commit` route and doesn't touch Basic
   Info.

No code changed. No migrations. No docs beyond this file.
