# Inventory System Audit — Session 34

> **Date:** 2026-04-20
> **Scope:** Full feature matrix of /admin/inventory and all inventory-adjacent systems
> **Mode:** Read-only. No code changes.

---

## Section 1 — Inventory Routes Inventory

| # | Path | Page Title | Purpose |
|---|------|-----------|---------|
| 1 | `/admin/inventory` | (redirect) | Redirects to `/admin/inventory/purchase-orders` via `router.replace()` |
| 2 | `/admin/inventory/purchase-orders` | Purchase Orders | List all POs with status filter, sortable data table |
| 3 | `/admin/inventory/purchase-orders/new` | New Purchase Order | Create PO: select vendor, add line items, save as draft or submit |
| 4 | `/admin/inventory/purchase-orders/[id]` | PO-XXXXXX (dynamic) | PO detail: view items, change status, receive items |
| 5 | `/admin/inventory/stock-history` | Stock History | Paginated audit log of all stock adjustments (type filter) |
| 6 | `/admin/inventory/vendors` | Vendors | CRUD for vendor records, soft-delete, product count |
| 7 | `/admin/inventory/vendors/[id]` | (vendor name, dynamic) | Vendor detail: contact info, product table, margin analysis |

**Layout:** `layout.tsx` gates all pages behind `FEATURE_FLAGS.INVENTORY_MANAGEMENT`. Shows disabled message with link to Feature Toggles if flag is off.

---

## Section 2 — DB Schema Reality Check

### `products` (inventory-relevant columns)

| Column | Type | Exists in DB | Surfaced in UI |
|--------|------|:---:|:---:|
| `quantity_on_hand` | INTEGER, DEFAULT 0 | YES | YES — product list, product edit, vendor detail |
| `reorder_threshold` | INTEGER, nullable | YES | YES — product edit, vendor detail, stock alerts |
| `min_order_qty` | INTEGER, nullable | YES | YES — PO new (default qty for line item) |
| `cost_price` | DECIMAL(10,2) | YES | YES — product edit, vendor detail (cost column) |
| `barcode` | TEXT, nullable | YES | YES — product edit, POS barcode lookup |
| `sku` | TEXT, UNIQUE | YES | YES — everywhere |
| `vendor_id` | UUID, FK → vendors | YES | YES — product edit, filters |

### `vendors`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| name | TEXT, UNIQUE, NOT NULL | |
| contact_name | TEXT | |
| email | TEXT | |
| phone | TEXT | |
| website | TEXT | |
| address | TEXT | |
| lead_time_days | INTEGER | |
| min_order_amount | NUMERIC(10,2) | Added Phase 6 migration |
| notes | TEXT | |
| is_active | BOOLEAN, DEFAULT true | Soft-delete flag |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**All columns surfaced in UI.** No orphaned columns.

### `purchase_orders`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| po_number | TEXT, UNIQUE | Auto-generated via DB trigger (PO-000001 format) |
| vendor_id | UUID, FK → vendors | |
| status | po_status enum | draft, ordered, received, cancelled |
| notes | TEXT | |
| ordered_at | TIMESTAMPTZ | Set on draft→ordered |
| received_at | TIMESTAMPTZ | Set on full receipt |
| created_by | UUID, FK → employees | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**DB_SCHEMA.md documents `expected_at`, `subtotal`, `shipping_cost`, `total_amount` — these DO NOT exist in the actual migration or code. DB_SCHEMA.md is out of sync.**

### `purchase_order_items`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| purchase_order_id | UUID, FK → purchase_orders | CASCADE delete |
| product_id | UUID, FK → products | |
| quantity_ordered | INTEGER, NOT NULL | |
| quantity_received | INTEGER, DEFAULT 0 | Incremented during receive flow |
| unit_cost | NUMERIC(10,2) | Propagated to product.cost_price on receipt |
| created_at | TIMESTAMPTZ | |

### `stock_adjustments`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| product_id | UUID, FK → products | |
| adjustment_type | TEXT | CHECK: manual, received, sold, returned, damaged, recount |
| quantity_change | INTEGER | Signed delta |
| quantity_before | INTEGER | Snapshot before |
| quantity_after | INTEGER | Snapshot after |
| reason | TEXT | Human-readable |
| reference_id | UUID | Links to PO/transaction/refund |
| reference_type | TEXT | CHECK: purchase_order, transaction, refund |
| created_by | UUID, FK → employees | |
| created_at | TIMESTAMPTZ | |

### `stock_alert_log`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| product_id | UUID, FK → products | |
| stock_level | INTEGER | Snapshot at alert time |
| alert_type | TEXT | CHECK: low_stock, out_of_stock |
| created_at | TIMESTAMPTZ | |

### `notification_recipients`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID, PK | |
| email | TEXT, NOT NULL | |
| notification_type | TEXT | CHECK: low_stock, all |
| is_active | BOOLEAN, DEFAULT true | |
| created_at | TIMESTAMPTZ | |

### Tables that DO NOT exist

| Table | Status |
|-------|--------|
| `inventory_adjustments` | Does not exist (uses `stock_adjustments` instead) |
| `inventory_movements` | Does not exist (uses `stock_adjustments` instead) |
| `stock_counts` / `cycle_counts` | Do not exist |

---

## Section 3 — Feature Matrix

### Product Quantity Tracking

| Feature | Status | Evidence |
|---------|--------|----------|
| POS sale decrements `quantity_on_hand` | **WORKS (with caveat)** | `src/app/api/pos/transactions/route.ts` lines 189–222. Calls `rpc('decrement_product_quantity')` — RPC undefined, always falls back to manual fetch-and-update. Functionally works but has race condition. |
| POS refund increments `quantity_on_hand` | **WORKS (with caveat)** | `src/app/api/pos/refunds/route.ts` lines 170–184. Manual fetch-and-increment. Same race condition issue. |
| Manual product edit can adjust quantity | **WORKS** | `src/app/admin/catalog/products/[id]/page.tsx` — `quantity_on_hand` form field present and saveable. |
| Quantity shows on product list | **WORKS** | `src/app/admin/catalog/products/page.tsx` line 436–451. Column with stock indicator emoji (🔴🟡🟢). Gated by `inventory.view_stock` permission. |
| Quantity shows on product detail | **WORKS** | `src/app/admin/catalog/products/[id]/page.tsx` line 821–826. Editable form field. |
| Stock filter on product list | **WORKS** | `src/app/admin/catalog/products/page.tsx` lines 43–270. Filter: all/in-stock/low-stock/out-of-stock. |

### Purchase Orders

| Feature | Status | Evidence |
|---------|--------|----------|
| Create draft PO with line items | **WORKS** | `src/app/admin/inventory/purchase-orders/new/page.tsx` → `POST /api/admin/purchase-orders` |
| Edit draft PO | **WORKS** | `PATCH /api/admin/purchase-orders/[id]` allows item updates when status=draft |
| Change PO status draft→ordered→received | **WORKS** | State machine validated in `PATCH` endpoint. Status transitions enforced. |
| Receiving a PO increments stock + creates audit entry | **WORKS** | `POST /api/admin/purchase-orders/[id]/receive` — increments `quantity_on_hand`, inserts `stock_adjustments` record |
| PO list page filters by status | **WORKS** | Status filter dropdown on PO list page (All/Draft/Ordered/Received/Cancelled) |
| Supplier (vendor) selection on PO | **WORKS** | Required field on PO creation form |
| PO cost_price propagation | **WORKS** | Receive endpoint updates `products.cost_price` to `purchase_order_items.unit_cost` |

### Stock Adjustments / Manual Adjustments

| Feature | Status | Evidence |
|---------|--------|----------|
| Reason codes (damage, recount, return, etc.) | **WORKS** | Types: manual, received, sold, returned, damaged, recount. Enum enforced in `stock_adjustments.adjustment_type`. |
| Adjustment UI | **WORKS** | `src/app/admin/catalog/products/page.tsx` lines 206–236. Modal dialog on product list, calls `POST /api/admin/stock-adjustments`. Permission: `inventory.adjust_stock`. |
| Audit entry written | **WORKS** | `POST /api/admin/stock-adjustments` inserts full before/after record. |
| Stock changes reflected immediately | **WORKS** | UI refreshes product list after adjustment. |

### Low Stock Alerts

| Feature | Status | Evidence |
|---------|--------|----------|
| Threshold column on product | **WORKS** | `products.reorder_threshold` — editable in product form |
| List view of low-stock items | **WORKS** | Product list stock filter = "Low Stock" or "Out of Stock" |
| Email notification | **WORKS** | `src/app/api/cron/stock-alerts/route.ts` — daily cron, anti-spam via `stock_alert_log` |
| Dashboard badge | **NOT_IMPLEMENTED** | No low-stock badge/widget on admin dashboard. Alerts are email-only. |

### Inventory Movements / Audit Log

| Feature | Status | Evidence |
|---------|--------|----------|
| Stock history page | **WORKS** | `src/app/admin/inventory/stock-history/page.tsx` — paginated, type-filtered |
| Shows +/- with reason, source, timestamp, user | **WORKS** | Columns: Date, Product, Type, Change, Stock Level (before→after), Reason, Reference, Created By |
| Filterable by type | **WORKS** | Filter: All/Manual/PO Received/Sold/Returned/Damaged/Recount |
| Clickable PO reference | **WORKS** | Reference column links to PO detail page |

### Suppliers (Vendors)

| Feature | Status | Evidence |
|---------|--------|----------|
| CRUD for vendor records | **WORKS** | `src/app/admin/inventory/vendors/page.tsx` — create/edit modal, soft-delete |
| Linked to PO | **WORKS** | `purchase_orders.vendor_id` FK. Vendor dropdown required on PO creation. |
| Linked to products | **WORKS** | `products.vendor_id` FK. Products filterable by vendor. |
| Contact info fields | **WORKS** | Name, contact name, email, phone, website, address, lead time, min order amount, notes |
| Vendor detail with product analytics | **WORKS** | `src/app/admin/inventory/vendors/[id]/page.tsx` — stock value, margins, last order info |

### Stock Counts / Cycle Counts

| Feature | Status | Evidence |
|---------|--------|----------|
| Scheduled count UI | **NOT_IMPLEMENTED** | No table, no API, no UI. |
| Physical vs system reconciliation | **NOT_IMPLEMENTED** | No reconciliation flow. Manual "recount" adjustment type exists but no guided count workflow. |
| Approval flow | **NOT_IMPLEMENTED** | No approval mechanism anywhere in inventory. |

### Reports / Dashboards

| Feature | Status | Evidence |
|---------|--------|----------|
| Stock-on-hand value | **PARTIAL** | Vendor detail page shows "Stock Retail Value" per vendor. No global inventory valuation report. |
| Top selling products | **NOT_IMPLEMENTED** | No inventory-specific report. (Transaction reports may show this elsewhere.) |
| Slow-moving inventory | **NOT_IMPLEMENTED** | No page or query. |
| Out-of-stock report | **WORKS** | Product list with "Out of Stock" filter effectively serves this purpose. |

---

## Section 4 — Bug List

### Bug 1: `decrement_product_quantity` RPC undefined

- **Page/feature:** POS sale → stock decrement
- **Symptom:** Every POS transaction logs an RPC error to console, then falls back to manual decrement. Functionally works but inefficient.
- **Root cause:** `supabase.rpc('decrement_product_quantity', {...})` called in `src/app/api/pos/transactions/route.ts` (line 189) but no Postgres function by that name exists in any migration under `supabase/migrations/`.
- **Severity:** **P2** — Works via fallback but: (a) unnecessary error on every sale, (b) fallback has race condition under concurrent sales of same product.

### Bug 2: POS sale does NOT create stock_adjustments record

- **Page/feature:** POS sale → audit trail
- **Symptom:** Sales decrement `quantity_on_hand` but no `stock_adjustments` row is created with `adjustment_type='sold'`. Stock history page shows PO receipts, manual adjustments, but NOT sales.
- **Root cause:** `src/app/api/pos/transactions/route.ts` only updates `products.quantity_on_hand`. Does not insert into `stock_adjustments`. The "sold" type exists in the enum but is never written by POS code.
- **Severity:** **P1** — Audit trail is incomplete. Cannot trace stock movements back to specific sales. Stock history page is missing the most common adjustment type.

### Bug 3: POS refund does NOT create stock_adjustments record

- **Page/feature:** POS refund → audit trail
- **Symptom:** Refunds increment stock but no `stock_adjustments` row is created with `adjustment_type='returned'`.
- **Root cause:** `src/app/api/pos/refunds/route.ts` only updates `products.quantity_on_hand`. Does not insert into `stock_adjustments`.
- **Severity:** **P1** — Same as Bug 2. Returns are invisible in stock history.

### Bug 4: Race condition on concurrent stock updates

- **Page/feature:** POS sale/refund stock changes
- **Symptom:** If two sales of the same product happen simultaneously, both read the same `quantity_on_hand`, both write `current - qty`, resulting in one decrement being lost.
- **Root cause:** Fallback code in `src/app/api/pos/transactions/route.ts` (lines 210–218) does `SELECT` then `UPDATE` without any locking or atomic operation. Same pattern in refunds.
- **Severity:** **P2** — Low probability for a small retail store (one iPad POS) but architecturally unsound. Would be P0 in a multi-register environment.

### Bug 5: DB_SCHEMA.md documents non-existent PO columns

- **Page/feature:** Documentation
- **Symptom:** `docs/dev/DB_SCHEMA.md` lists `expected_at`, `subtotal`, `shipping_cost`, `total_amount` columns on `purchase_orders` that don't exist in migrations or code.
- **Root cause:** Schema doc was written speculatively or from a plan, not from actual migrations.
- **Severity:** **P2** — Documentation error only. Misleads future development.

---

## Section 5 — Stub List

| # | Feature | What Exists | What's Missing | Recommendation |
|---|---------|-------------|----------------|----------------|
| 1 | `adjustment_type='sold'` in stock_adjustments | DB enum value exists, Stock History UI shows "Sold" filter option | POS transaction code never inserts a `stock_adjustments` record on sale | **Likely wanted** — complete the audit trail |
| 2 | `adjustment_type='returned'` in stock_adjustments | DB enum value exists, Stock History UI shows "Returned" filter option | POS refund code never inserts a `stock_adjustments` record on return | **Likely wanted** — complete the audit trail |
| 3 | `reference_type='transaction'` in stock_adjustments | DB CHECK constraint allows it | Never written. No sale-linked adjustments exist. | **Likely wanted** — needed for #1 |
| 4 | `reference_type='refund'` in stock_adjustments | DB CHECK constraint allows it | Never written. No refund-linked adjustments exist. | **Likely wanted** — needed for #2 |
| 5 | `decrement_product_quantity` RPC | Called in POS transaction + offline-sync code | Postgres function never created in any migration | **Likely wanted** — would provide atomic decrement and eliminate race condition |
| 6 | `notification_recipients` table | DB table exists, cron queries it | No admin UI to manage notification recipients. Fallback to business email means this table is always empty unless manually populated via SQL. | **Likely wanted** — add admin UI in Settings or Inventory section |
| 7 | Stock counts / cycle counts | Nothing exists | No table, no API, no UI | **Candidate for removal or deferral** — useful for larger retail ops but may be overkill for a mobile detailing shop with <50 SKUs |
| 8 | `expected_at` on purchase_orders | Documented in DB_SCHEMA.md | Column doesn't exist. UI doesn't reference it. | **Candidate for removal from docs** — or add if vendor lead-time tracking is wanted |
| 9 | `subtotal`/`shipping_cost`/`total_amount` on purchase_orders | Documented in DB_SCHEMA.md | Columns don't exist. PO total is calculated client-side from items. | **Candidate for removal from docs** — client-side calc is adequate for current needs |
| 10 | Dashboard low-stock badge/widget | Email alerts work | No visual indicator on admin dashboard home page | **Likely wanted** — quick wins for awareness without checking email |

---

## Section 6 — Priority Recommendation

The inventory system is significantly more complete than the owner's "many things not connected" impression suggests — PO creation, receiving, vendor management, manual adjustments, and stock history all function correctly. The critical gap is **audit trail completeness**: POS sales and refunds move stock but don't write to `stock_adjustments`, meaning the stock history page is missing its most important data source. Fix order should be: **(1)** Add `stock_adjustments` inserts to POS transaction and refund endpoints (P1, fixes Bugs 2 & 3, makes stock history actually useful); **(2)** Create the `decrement_product_quantity` RPC function for atomic stock operations (eliminates race condition and console errors); **(3)** Clean up DB_SCHEMA.md to match reality; **(4)** Add a low-stock badge to the admin dashboard. Cycle counts, advanced reporting, and notification recipient management are all nice-to-haves that can wait — for a small retail operation selling wax and towels alongside detailing services, the current PO + vendor + manual adjustment workflow is sufficient once the audit trail is wired up.
