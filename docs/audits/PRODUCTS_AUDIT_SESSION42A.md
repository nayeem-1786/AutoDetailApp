# Products Schema + Product Edit UI Audit — Session 42A

> **Scope.** Inventory of the `products` table schema + full product
> edit page + Quick Edit drawer, plus a data model proposal for
> vendor-SKU / white-label identity tracking. 100% read-only.
>
> **Date.** 2026-04-21.
>
> **Authored by.** Claude (Session 42A).
>
> **Deliverable only.** No code changes. No migrations proposed here
> without explicit Section 2 data to justify.

---

## Section 1 — `products` table schema

### 1.1 Columns (as of 2026-04-21)

Derived from the base migration `supabase/migrations/20260201000007_create_products.sql` plus every subsequent `ALTER TABLE products`.

| # | Column | Type | Nullable | Default | Constraint | Added in |
|---|---|---|---|---|---|---|
| 1 | `id` | UUID | NO | `gen_random_uuid()` | PRIMARY KEY | `20260201000007` |
| 2 | `square_item_id` | TEXT | YES | — | UNIQUE | `20260201000007` |
| 3 | `sku` | TEXT | YES | — | UNIQUE | `20260201000007` |
| 4 | `name` | TEXT | NO | — | — | `20260201000007` |
| 5 | `description` | TEXT | YES | — | — | `20260201000007` |
| 6 | `category_id` | UUID | YES | — | FK `product_categories(id) ON DELETE SET NULL` | `20260201000007` |
| 7 | `vendor_id` | UUID | YES | — | FK `vendors(id) ON DELETE SET NULL` | `20260201000007` |
| 8 | `cost_price` | DECIMAL(10,2) | NO | `0` | — | `20260201000007` |
| 9 | `retail_price` | DECIMAL(10,2) | NO | `0` | — | `20260201000007` |
| 10 | `quantity_on_hand` | INTEGER | NO | `0` | — | `20260201000007` |
| 11 | `reorder_threshold` | INTEGER | YES | — | — | `20260201000007` |
| 12 | `is_taxable` | BOOLEAN | NO | `true` | — | `20260201000007` |
| 13 | `is_loyalty_eligible` | BOOLEAN | NO | `true` | — | `20260201000007` |
| 14 | `image_url` | TEXT | YES | — | Synced by trigger from `product_images.is_primary` | `20260201000007` (trigger added `20260211000010`) |
| 15 | `barcode` | TEXT | YES | — | — | `20260201000007` |
| 16 | `is_active` | BOOLEAN | NO | `true` | — | `20260201000007` |
| 17 | `created_at` | TIMESTAMPTZ | NO | `now()` | — | `20260201000007` |
| 18 | `updated_at` | TIMESTAMPTZ | NO | `now()` | Set by `tr_products_updated_at` | `20260201000007` |
| 19 | `slug` | TEXT | NO | — | UNIQUE (backfilled then NOT NULL) | `20260201000038` |
| 20 | `qbo_id` | TEXT | YES | — | — | `20260210000011` |
| 21 | `min_order_qty` | INTEGER | YES | `NULL` | — | `20260211000004` |
| 22 | `show_on_website` | BOOLEAN | NO | `true` | — | `20260214000005` |
| 23 | `is_featured` | BOOLEAN | NO | `false` | — | `20260214000005` |
| 24 | `website_sort_order` | INTEGER | NO | `0` | — | `20260214000005` |
| 25 | `weight` | DECIMAL(8,2) | YES | — | — | `20260217000003` |
| 26 | `length` | DECIMAL(8,2) | YES | — | — | `20260217000003` |
| 27 | `width` | DECIMAL(8,2) | YES | — | — | `20260217000003` |
| 28 | `height` | DECIMAL(8,2) | YES | — | — | `20260217000003` |
| 29 | `weight_unit` | TEXT | YES | `'lb'` | — | `20260217000003` |
| 30 | `dimension_unit` | TEXT | YES | `'in'` | — | `20260217000003` |
| 31 | `sale_price` | DECIMAL(10,2) | YES | `NULL` | `CHECK chk_product_sale_price (sale_price IS NULL OR sale_price < retail_price)` | `20260219000009` |
| 32 | `sale_starts_at` | TIMESTAMPTZ | YES | `NULL` | — | `20260219000009` |
| 33 | `sale_ends_at` | TIMESTAMPTZ | YES | `NULL` | — | `20260219000009` |
| 34 | `specs` | JSONB | YES | `NULL` | — | `20260403000001` |
| 35 | `product_group_id` | UUID | YES | `NULL` | — (soft pointer, no FK) | `20260403000001` |
| 36 | `variant_label` | TEXT | YES | `NULL` | — | `20260403000001` |

Total: **36 columns**.

**Note on `specs` JSONB.** Used by the product edit page for 10 keys:
`overview`, `use_case`, `key_features` (array), `application_method`,
`size_volume`, `dilution_ratio`, `coverage_yield`, `scent`,
`surface_compatibility` (array), `pro_tips`. Empty/null values are
stripped before save (`[id]/page.tsx:441-451`).

**Note on `product_group_id`.** No FK constraint. Groups are ad-hoc
UUIDs generated at group-create time; a `product_images` view doesn't
exist. Presence of sibling rows with the same `product_group_id`
constitutes the "group".

### 1.2 Indexes

From `supabase/migrations/20260201000007_create_products.sql`,
`20260201000036_create_indexes.sql`, `20260214000005_cms_catalog_controls.sql`,
`20260312000002_add_products_barcode_index.sql`, and
`20260403000001_product_specs_and_variant_grouping.sql`.

| Index | Columns / expression | Partial? | Purpose |
|---|---|---|---|
| `idx_products_category` | `category_id` | — | Category filter |
| `idx_products_vendor` | `vendor_id` | — | Vendor filter |
| `idx_products_sku` | `sku` | — | SKU lookup |
| `idx_products_active` | `is_active` | — | Active filter |
| `idx_products_name` | `name` | — | Name sort |
| `idx_products_low_stock` | `(quantity_on_hand, reorder_threshold)` | `WHERE is_active = true` | Stock alert cron |
| `idx_products_search` | `GIN(to_tsvector('english', name \|\| description \|\| sku))` | — | Full-text search |
| `idx_products_website` | `(show_on_website, is_featured, website_sort_order)` | `WHERE show_on_website = true` | Public catalog |
| `idx_products_barcode` | `barcode` | `WHERE barcode IS NOT NULL` | Barcode scan |
| `idx_products_group_id` | `product_group_id` | `WHERE product_group_id IS NOT NULL` | Variant sibling lookup |

Uniqueness: `sku UNIQUE`, `square_item_id UNIQUE`, `slug UNIQUE`
(column-level, shown in Section 1.1).

### 1.3 Foreign keys INTO `products`

Tables that reference `products.id`:

| Referring table.column | ON DELETE | Purpose |
|---|---|---|
| `transaction_items.product_id` | SET NULL | POS sale line |
| `quote_items.product_id` | SET NULL | Quote line |
| `po_items.product_id` | RESTRICT | Purchase order line |
| `purchase_order_items.product_id` | RESTRICT | PO line (alt table) |
| `stock_adjustments.product_id` | RESTRICT | Audit-logged qty change |
| `coupons.requires_product_id` | SET NULL | Coupon eligibility gate |
| `coupon_rewards.target_product_id` | SET NULL | Reward target |
| `product_images.product_id` | CASCADE | Image row |
| `sale_history.product_id` | CASCADE | Historical sale record |
| `product_enrichment_drafts.product_id` | CASCADE | AI draft |
| `order_items.product_id` (online store) | SET NULL | Online order line |

The `RESTRICT` relationships on `po_items` / `purchase_order_items` /
`stock_adjustments` mean a product cannot be hard-deleted if any PO
line or adjustment references it. The edit page's Delete button
(`[id]/page.tsx:706-710`, handler `handleDelete` at L560-579) handles
this correctly — it is a **soft delete** that flips `is_active = false`
rather than `DELETE FROM`.

### 1.4 RLS policies

From `supabase/migrations/20260201000035_rls_policies.sql` and
`20260201000038_public_seo_setup.sql`.

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_all    ON products FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY products_anon_select ON products FOR SELECT TO anon USING (is_active = true);
```

**Observation.** `products_all` is a single global policy for
authenticated users with no role-based differentiation. Admin role
gating happens at the API layer (`require-permission.ts`), not at
RLS. Fine for staff-only auth model; worth noting for future
customer-facing reads.

### 1.5 Triggers

From `supabase/migrations/20260201000037_create_functions_triggers.sql`
and `20260211000010_product_images.sql`.

| Trigger | Timing | Action |
|---|---|---|
| `tr_products_updated_at` | BEFORE UPDATE | `update_updated_at()` — stamps `updated_at = now()` |
| `trg_sync_product_primary_image` (on `product_images`, not on products) | AFTER INSERT/UPDATE | Syncs `products.image_url` from the primary `product_images` row |

No other triggers on the `products` table itself.

### 1.6 Tight couplings worth flagging

- **`WATER_SKU = '0000001'`** is a hardcoded sentinel in
  `src/lib/utils/constants.ts`, used by five POS paths
  (`sync-offline-transaction/route.ts:220`, `card-customer/route.ts:139`,
  `loyalty/earn/route.ts:49`, `pos/transactions/route.ts:260`, and the
  edit page itself at `[id]/page.tsx:121-124` to auto-disable loyalty
  for water). This is not a schema issue but will break if a user ever
  manually edits the water row's SKU.
- **`trg_sync_product_primary_image`** means writing directly to
  `products.image_url` will be overwritten by the next primary-image
  change. The edit page UI does not expose `image_url` as an editable
  field, so this is consistent — but confirms the column is effectively
  computed.

---

## Section 2 — Live data sampling

Claude Code has no direct DB access. Run these 10 queries in the
Supabase SQL Editor (project `zwvahzymzardmxixyfim`) and paste
results into the block at the end of this section. Results answer
the questions that drive Section 7's final recommendation.

### Query 1 — totals

Answers: how many products, how many active.

```sql
SELECT
  COUNT(*)                              AS total_products,
  COUNT(*) FILTER (WHERE is_active)     AS active_products,
  COUNT(*) FILTER (WHERE NOT is_active) AS soft_deleted
FROM products;
```

### Query 2 — sku/barcode population distribution

Answers: of active products, how many have sku-only, barcode-only, both, or neither.

```sql
SELECT
  COUNT(*) FILTER (WHERE sku IS NOT NULL AND barcode IS NOT NULL) AS both,
  COUNT(*) FILTER (WHERE sku IS NOT NULL AND barcode IS NULL)     AS sku_only,
  COUNT(*) FILTER (WHERE sku IS NULL AND barcode IS NOT NULL)     AS barcode_only,
  COUNT(*) FILTER (WHERE sku IS NULL AND barcode IS NULL)         AS neither
FROM products
WHERE is_active;
```

### Query 3 — sku == barcode (duplicate-data suspicion)

Answers: are any rows storing the same string in both columns? If yes, Square's import mapped the same identifier to both — informs data cleanup.

```sql
SELECT COUNT(*) AS same_value_in_both
FROM products
WHERE sku IS NOT NULL
  AND barcode IS NOT NULL
  AND sku = barcode;
```

### Query 4 — random sample of 10 products

Answers: what do real values look like side-by-side?

```sql
SELECT id, name, sku, barcode, vendor_id
FROM products
WHERE is_active
ORDER BY random()
LIMIT 10;
```

### Query 5 — SKU format distribution

Answers: are SKUs long numeric (UPC/EAN-shaped, 12-13 digits), short numeric (white-label), or alpha-containing (vendor codes)? A bimodal distribution tells us the current `sku` column is mixed semantics — which is the problem Session 42B has to clean up.

```sql
SELECT
  LENGTH(sku)                AS sku_len,
  (sku ~ '^[0-9]+$')         AS sku_is_numeric,
  COUNT(*)                   AS n
FROM products
WHERE is_active AND sku IS NOT NULL
GROUP BY 1, 2
ORDER BY 3 DESC;
```

Expected reference points:
- UPC-A: 12 digits. EAN-13: 13 digits.
- Internal white-label: commonly 4-8 digits or vendor-prefix alpha.
- Vendor SKUs: vary widely; often alpha.

### Query 6 — barcode format distribution

Answers: same analysis for `barcode` column. If it's cleanly 12-13-digit numeric, the column is being used as intended (UPC/EAN). If it's mixed, Square's GTIN import is inconsistent.

```sql
SELECT
  LENGTH(barcode)                AS bc_len,
  (barcode ~ '^[0-9]+$')         AS bc_is_numeric,
  COUNT(*)                       AS n
FROM products
WHERE is_active AND barcode IS NOT NULL
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### Query 7 — vendor linkage coverage

Answers: how many active products have a vendor assigned? This bounds the scope of any vendor-SKU feature (if most products have no vendor, the feature is partial).

```sql
SELECT
  COUNT(*) FILTER (WHERE vendor_id IS NOT NULL) AS with_vendor,
  COUNT(*) FILTER (WHERE vendor_id IS NULL)     AS no_vendor
FROM products
WHERE is_active;
```

### Query 8 — products-per-vendor top 10

Answers: how concentrated is the vendor distribution? If one vendor supplies most products, a simple `vendor_sku` column on products is fine. If many products switch vendors, Scenario C (separate listings table) becomes more attractive — but only if multi-vendor sourcing actually happens.

```sql
SELECT v.name AS vendor, COUNT(p.id) AS product_count
FROM vendors v
LEFT JOIN products p ON p.vendor_id = v.id AND p.is_active
WHERE v.is_active
GROUP BY v.name
ORDER BY product_count DESC
LIMIT 10;
```

### Query 9 — the test product (Product Rack / Bottle Holder)

Answers: what does the specific test row from Session 41C look like?

```sql
SELECT id, name, sku, barcode, vendor_id, category_id,
       retail_price, quantity_on_hand, created_at, updated_at
FROM products
WHERE name ILIKE '%rack%bottle%holder%'
   OR name ILIKE '%bottle holder%';
```

### Query 10 — column self-check

Answers: does the actual DB match the schema documented in Section 1? (Catches undocumented columns that slipped in without migration audit.)

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;
```

### Results block

<!-- FILL IN AFTER DATA RUN -->

```
Query 1: total_products=____  active=____  soft_deleted=____

Query 2: both=____  sku_only=____  barcode_only=____  neither=____

Query 3: same_value_in_both=____

Query 4: (paste 10-row sample here)

Query 5: (paste SKU format distribution here — flag any bimodal pattern)

Query 6: (paste barcode format distribution here)

Query 7: with_vendor=____  no_vendor=____

Query 8: (paste top-10 vendors here)

Query 9: (paste Bottle Holder row(s) here — specifically the sku value)

Query 10: (diff vs Section 1.1 — any surprises?)
```

<!-- END FILL IN AFTER DATA RUN -->

Downstream: the Section 7 recommendation (A / B / C) depends on
Queries 3, 5, 6, and 8. Queries 1-2 and 7-9 are descriptive context.

---

## Section 3 — `vendors` table schema

### 3.1 Columns

From `supabase/migrations/20260201000005_create_vendors.sql` +
`20260211000004_inventory_phase6_session1.sql`.

| # | Column | Type | Nullable | Default | Constraint | Added in |
|---|---|---|---|---|---|---|
| 1 | `id` | UUID | NO | `gen_random_uuid()` | PRIMARY KEY | `20260201000005` |
| 2 | `name` | TEXT | NO | — | UNIQUE | `20260201000005` |
| 3 | `contact_name` | TEXT | YES | — | — | `20260201000005` |
| 4 | `email` | TEXT | YES | — | — | `20260201000005` |
| 5 | `phone` | TEXT | YES | — | — | `20260201000005` |
| 6 | `website` | TEXT | YES | — | — | `20260201000005` |
| 7 | `address` | TEXT | YES | — | — | `20260201000005` |
| 8 | `lead_time_days` | INTEGER | YES | — | — | `20260201000005` |
| 9 | `notes` | TEXT | YES | — | — | `20260201000005` |
| 10 | `is_active` | BOOLEAN | NO | `true` | — | `20260201000005` |
| 11 | `created_at` | TIMESTAMPTZ | NO | `now()` | — | `20260201000005` |
| 12 | `updated_at` | TIMESTAMPTZ | NO | `now()` | Via `tr_vendors_updated_at` | `20260201000005` |
| 13 | `min_order_amount` | NUMERIC(10,2) | YES | `NULL` | — | `20260211000004` |

### 3.2 Indexes, RLS, Triggers

- Index: `idx_vendors_name ON vendors(name)`.
- RLS (`20260201000035`): `vendors_select` SELECT authenticated,
  `vendors_all` ALL authenticated.
- Trigger: `tr_vendors_updated_at` (same pattern as products).

### 3.3 Relationships

- `products.vendor_id → vendors.id` (SET NULL) — one vendor, many products.
- `purchase_orders.vendor_id → vendors.id` (RESTRICT) — PO history.

### 3.4 Gap confirmed

**There is no `vendor_sku`, `vendor_product_name`, or any vendor-identity
field on either `products` or `vendors`.** The relationship between a
product and its vendor is one-to-many via `products.vendor_id` only,
with no per-product-per-vendor metadata.

Current vendor detail page (`src/app/admin/inventory/vendors/[id]/page.tsx`)
lists products assigned to a vendor by querying `products WHERE
vendor_id = :id` and shows the **app-side** SKU. There is no way today
to record what the **vendor** calls the product, or what SKU the vendor
uses in their own system for reordering.

---

## Section 4 — Full product edit page structure

**File.** `src/app/admin/catalog/products/[id]/page.tsx` (1879 lines).

### 4.1 Sections (top → bottom)

| # | Section | Lines | DB columns written | Save behavior |
|---|---|---|---|---|
| 1 | PageHeader active toggle | 670-698 | `is_active` | **Auto-save on change** (Switch handler) |
| 2 | Website Visibility toggle | 715-744 | `show_on_website` (via `/api/admin/cms/catalog/products` PATCH) | **Auto-save on change** |
| 3 | Basic Info Card | 748-879 | `name`, `slug`, `sku`, `description`, `category_id`, `vendor_id`, `cost_price`, `retail_price`, `quantity_on_hand`, `reorder_threshold`, `min_order_qty`, `is_taxable`, `is_loyalty_eligible`, `barcode` | Button 1 "Save Changes" |
| 4 | Product Images | 881-933 | `product_images` rows (sort_order, is_primary, alt_text) | **Auto-save per op** (upload/reorder/delete/primary) |
| 5 | Variant Label | 935-949 | `variant_label` | Button 1 "Save Changes" |
| 6 | Variant Group | 950-1113 | `product_group_id` | Per-action API call (create/link/unlink) |
| 7 | Product Specs | 1115-1466 | `specs` JSONB (10 keys) | Button 1 "Save Changes" + AI Enrich |
| 8 | Main form footer (Cancel + Save) | 1469-1483 | — | Button 1 "Save Changes" |
| 9 | Sale Pricing Card | 1485-1687 | `sale_price`, `sale_starts_at`, `sale_ends_at` | **Button 2 "Save Sale Pricing"** (separate) |
| 10 | Cost & Margin Card | 1503-1506 | — (read-only display of `cost_history` from PO receiving) | N/A |

### 4.2 Save / submit buttons — complete enumeration

There are **nine** distinct action buttons that write to the DB. Two
are primary save buttons. Seven are contextual / destructive /
integration-triggered.

| # | Label | Line | Handler | Target |
|---|---|---|---|---|
| 1 | **Save Changes** | 1478 | `onSubmit(data)` L421-558 | `UPDATE products SET ... WHERE id=...` (L454-475) — writes 15 columns |
| 2 | **Save Sale Pricing** | 1679 | `onSaveSalePricing()` L581-632 | `UPDATE products SET sale_price, sale_starts_at, sale_ends_at WHERE id=...` (L602-609) |
| 3 | Clear Sale | 1673 | `clearSalePricing()` L634-656 | `UPDATE products SET sale_price=NULL, sale_starts_at=NULL, sale_ends_at=NULL` |
| 4 | Delete | 706-710 | `handleDelete()` L560-579 | `UPDATE products SET is_active=false` (soft delete) |
| 5 | Active toggle | 674-698 | Inline Switch `onCheckedChange` | Direct Supabase update of `is_active` |
| 6 | Show on Website toggle | 728-742 | Inline Switch | `adminFetch('/api/admin/cms/catalog/products', PATCH)` with `show_on_website` |
| 7 | AI Enrich | 1121-1193 | Polling batch flow L1130-1188 | Writes to `product_enrichment_drafts` (not `products` directly) |
| 8 | Accept Enrichment | 1196-1261 | `adminFetch('/api/admin/cms/products/ai-enrich/apply')` L1204-1214 | Writes `description` + `specs` via server route |
| 9 | Create Variant Group / Link / Unlink | 985, 1063-1097 | `/api/admin/products/group` (POST) and `/api/admin/products/[id]/group` (DELETE) | Writes `product_group_id` |

**Confirmed.** The two save buttons the user noted are the two that
write primary product data directly from this page: Basic Info
"Save Changes" (Button 1) and Sale Pricing "Save Sale Pricing"
(Button 2). Both call `supabase.from('products').update(...)` with
disjoint column sets. No third primary save button exists on this page.

### 4.3 Fields — compact enumeration

Across all sections, the page hosts **33 distinct form inputs**. Compact
table:

| # | Label | State / form field | DB column | Input type | Section | Saved by |
|---|---|---|---|---|---|---|
| 1 | Product Active/Inactive | Controller `is_active` | `is_active` | Switch | PageHeader | Inline (Switch onChange) |
| 2 | Show on Website | optimistic `product.show_on_website` | `show_on_website` | Switch | Website visibility | Inline (Switch onChange) |
| 3 | Product Name | `register('name')` | `name` | Input text | Basic Info | Button 1 |
| 4 | SKU | `register('sku')` | `sku` | Input text | Basic Info | Button 1 |
| 5 | URL Slug | `register('slug')` | `slug` | Input text | Basic Info | Button 1 |
| 6 | Short Description | `register('description')` | `description` | Textarea | Basic Info | Button 1 |
| 7 | Category | `register('category_id')` | `category_id` | Select | Basic Info | Button 1 |
| 8 | Vendor | `register('vendor_id')` | `vendor_id` | Select | Basic Info | Button 1 |
| 9 | Cost Price | `register('cost_price')` | `cost_price` | Input (decimal) | Basic Info | Button 1 |
| 10 | Retail Price | `register('retail_price')` | `retail_price` | Input (decimal) | Basic Info | Button 1 |
| 11 | Quantity on Hand | `register('quantity_on_hand')` | `quantity_on_hand` | Input (numeric) | Basic Info | Button 1 *(see conflict in 4.4)* |
| 12 | Reorder Threshold | `register('reorder_threshold')` | `reorder_threshold` | Input (numeric) | Basic Info | Button 1 |
| 13 | Min Order Qty | `register('min_order_qty')` | `min_order_qty` | Input (numeric) | Basic Info | Button 1 |
| 14 | Barcode | `register('barcode')` | `barcode` | Input text | Basic Info | Button 1 |
| 15 | Taxable | `register('is_taxable')` | `is_taxable` | Checkbox | Basic Info | Button 1 |
| 16 | Loyalty Eligible | `register('is_loyalty_eligible')` | `is_loyalty_eligible` | Checkbox | Basic Info | Button 1 |
| 17 | Product images (multi) | `productImages` state array | `product_images.*` | MultiImageUpload | Product Images | Inline (per op) |
| 18 | Image alt text | per-image Input | `product_images.alt_text` | Input | Product Images | Inline (onBlur) |
| 19 | Variant Label | `register('variant_label')` | `variant_label` | Input text | Variant Label | Button 1 |
| 20 | Specs: Overview | `watch('specs').overview` + `setValue` | `specs.overview` | Textarea | Specs | Button 1 |
| 21 | Specs: Use Case | `watch('specs').use_case` + `setValue` | `specs.use_case` | Textarea | Specs | Button 1 |
| 22 | Specs: Key Features | `specKeyFeatures[]` → `setValue('specs', ...)` | `specs.key_features[]` | Tag input | Specs | Button 1 |
| 23 | Specs: Application Method | `watch('specs').application_method` | `specs.application_method` | Input | Specs | Button 1 |
| 24 | Specs: Size/Volume | `watch('specs').size_volume` | `specs.size_volume` | Input | Specs | Button 1 |
| 25 | Specs: Dilution Ratio | `watch('specs').dilution_ratio` | `specs.dilution_ratio` | Input | Specs | Button 1 |
| 26 | Specs: Coverage/Yield | `watch('specs').coverage_yield` | `specs.coverage_yield` | Input | Specs | Button 1 |
| 27 | Specs: Scent | `watch('specs').scent` | `specs.scent` | Input | Specs | Button 1 |
| 28 | Specs: Surface Compatibility | `specSurfaceCompat[]` → `setValue('specs', ...)` | `specs.surface_compatibility[]` | Tag input | Specs | Button 1 |
| 29 | Specs: Pro Tips | `watch('specs').pro_tips` | `specs.pro_tips` | Textarea | Specs | Button 1 |
| 30 | Sale Price | `salePrice` state | `sale_price` | Input (decimal) | Sale Pricing | Button 2 |
| 31 | Sale Start Date | `saleStartsAt` state | `sale_starts_at` | Input (date, PST-adjusted) | Sale Pricing | Button 2 |
| 32 | Sale End Date | `saleEndsAt` state | `sale_ends_at` | Input (date, PST-adjusted) | Sale Pricing | Button 2 |
| 33 | Discount calc type/value | `saleDiscountType`, `saleDiscountValue` | (ephemeral; recalculates `salePrice`) | Button group + Input | Sale Pricing | **Not saved** — UI helper only |

### 4.4 Duplicates / overlaps

#### 4.4.1 `quantity_on_hand` conflict (HIGH severity)

- Basic Info writes it via Button 1 at `[id]/page.tsx:465`:
  ```ts
  quantity_on_hand: data.quantity_on_hand,
  ```
  This is a **direct UPDATE**, bypassing `stock_adjustments` audit log.
- Quick Edit drawer writes it via `POST /api/admin/stock-adjustments`
  (`quick-edit-drawer.tsx:271-280`):
  ```ts
  body: JSON.stringify({
    product_id, adjustment: qtyDelta, reason, adjustment_type: qtyReason,
  })
  ```
  This **creates an adjustment row** and uses the API to derive the new
  qty.

**Consequence.** A user who changes qty in Basic Info and clicks Save
Changes mutates the qty silently with no audit trail. The Quick Edit
path — Session 41B's explicit design goal — is the audit-preserving
one. Having both paths is a footgun.

**Resolution direction (not for this session).** Remove the
`quantity_on_hand` form input from Basic Info; display it read-only
with an "Open Quick Edit" CTA. Addressed in Section 6.

#### 4.4.2 `is_active` redundancy (LOW severity)

- `register('is_active')` registered at L210 **and** `reset({...
  is_active: p.is_active })` at L210 of `useEffect`.
- But the actual UI toggle is a `Controller`-wrapped Switch in the
  PageHeader at L674-698, which has its own inline save handler.
- The form binding is written to on submit at L470:
  `is_active: data.is_active`. That's fine — it's idempotent with the
  PageHeader toggle's state.

**But** there's no visible primary UI for toggling `is_active` through
the form body — only the PageHeader Switch. The form binding is
effectively dead state that happens to be kept in sync. Harmless but
confusing for future maintainers.

#### 4.4.3 `description` vs `specs.overview` overlap (LOW severity)

- `description` column is a short text field in Basic Info.
- `specs.overview` is a longer field in Specs card. Marketing copy.

Both describe the product. No technical overlap (they write to
different columns), but conceptually they blur: the AI Enrich flow
(`[id]/page.tsx:1196-1261`) can write to **both** based on the accept
flags `applyDescription: true, applySpecs: true`. Users may edit one
and forget the other.

#### 4.4.4 Sale pricing validation is duplicate-of-DB

`onSaveSalePricing()` at L585-595:

```ts
if (salePrice >= product.retail_price) {
  toast.error(`Sale price must be less than retail price (...)`);
  return;
}
if (salePrice <= 0) {
  toast.error('Sale price must be greater than $0');
  return;
}
```

The first check **duplicates** the DB constraint `chk_product_sale_price
CHECK (sale_price IS NULL OR sale_price < retail_price)`. The client
check only prevents a better error message; the DB would reject the
write regardless. Second check (`> 0`) is not in the DB; that one
exists only client-side.

Not a bug. Just noting that moving this save path into Button 1's
`onSubmit` would require hoisting both checks (or tolerating a worse
error message on the `>= retail_price` case, since the DB check returns
generic text).

### 4.5 Stale / unused fields

- **`register('is_active')`** — form-bound but real UI is elsewhere.
  See 4.4.2.
- **`discountType` / `discountValue`** (fields 33) — ephemeral UI
  helper; recalculates `salePrice` on change via a `useEffect`
  (L254-266). Not a bug, but not every user will realize these are
  throwaway. Labeled correctly in the UI.

No fields bind to vestigial columns.

### 4.6 Asymmetric save behavior

| Section | Save pattern | Rationale (observed, not judged) |
|---|---|---|
| PageHeader active toggle | Inline / Switch | Toggle-style UX; fits autosave |
| Website visibility | Inline / Switch | Same |
| Product images | Inline / per-op | Uploads cascade (storage + DB); each op needs immediate persistence |
| Basic Info, Variant Label, Specs | Explicit Button 1 | Structural edits; user wants commit point |
| Sale Pricing | **Explicit Button 2** | Multi-field validation (price + two dates); card is visually separated |
| Variant grouping | Per-action button | Write side-effects are non-trivial (touches sibling rows) |

Running tally: 3 save mechanisms (inline/Switch, explicit button,
per-action API call). Not excessive — but Button 1 and Button 2 both
write `products` and are both "explicit button," which is the
confusing asymmetry.

### 4.7 Integrations

| Integration | Lines | Purpose |
|---|---|---|
| **AI Enrich** | 1121-1272 | POST to `/api/admin/cms/products/ai-enrich`, poll `/status`, fetch `/results`, accept via `/apply`. Writes `description` + `specs`. Lives in Specs card. |
| **SEO path sync on save** | 479-548 | If `slug` or `category_id` change during Save Changes, rewrites `page_seo.page_path`, then triggers AI SEO regen via `/api/admin/cms/seo/ai-generate` + `/ai-apply`. Non-blocking — product save succeeds even if SEO fails. |
| **Multi-Image upload** | 268-419 | Supabase Storage (`product-images` bucket) + `product_images` table. Includes primary promotion on delete (L333-342). |
| **Variant group modal search** | 1013-1108 | Real-time Supabase search to pick sibling products; `POST /api/admin/products/group` to create. |
| **Stock adjustments bridge** | — | Not on this page. Quick Edit drawer handles qty changes. Basic Info's direct qty write bypasses this. |

Placement assessment:

- **AI Enrich belongs here.** It fills description + specs, which are
  the specs card's concern. Location is correct.
- **SEO path sync belongs here.** Slug + category are on this page;
  consequence is SEO.
- **Image upload belongs here.** Images are product-owned.
- **Variant grouping belongs here**, though the modal search UX could
  plausibly live in its own route. Not urgent.
- **Stock adjustments should not belong to the form Button 1 path.**
  That's the problem flagged in 4.4.1.

---

## Section 5 — Quick Edit drawer inventory

**File.** `src/app/admin/catalog/products/components/quick-edit-drawer.tsx` (426 lines).

### 5.1 Fields

| Field | State | DB column | Save trigger | Notes |
|---|---|---|---|---|
| Barcode | `barcodeStr` | `barcode` | onBlur | Uniqueness check + optimistic update + undo toast. `quick-edit-drawer.tsx:170` queries `.eq('barcode', next)` to prevent collisions (Session 41C hardening). |
| Price | `priceStr` | `retail_price` | onBlur | Via `saveField()` helper L93-150. Optimistic + undo. |
| Cost | `costStr` | `cost_price` | onBlur | **Permission-gated** on `inventory.view_costs` (L346-363). |
| Reorder Threshold | `thresholdStr` | `reorder_threshold` | onBlur | Same helper; optimistic + undo. |
| Quantity on Hand | `qtyStr` | `quantity_on_hand` (via stock_adjustments) | **Explicit "Save Quantity Change" button** | Only visible + enabled when `qtyChanged && qtyReason !== ''`. |
| Qty Reason Category | `qtyReason` | — (sent as `adjustment_type`) | Gated with qty save | Required; 4 options: manual, recount, damaged, shop_use. |
| Qty Notes | `qtyNotes` | — (appended to `reason` text) | Optional | Free-form detail. |

### 5.2 Save surface

- 4 onBlur autosaves (barcode, price, cost, threshold) writing
  directly to Supabase via the shared `saveField()` helper.
- 1 explicit button for quantity, which routes through
  `/api/admin/stock-adjustments` and creates an audit row.

This is the correct division: routine numeric edits autosave; qty
changes require a reason because they affect financial audit.

### 5.3 Conditional logic (confirmed against 41B/41C commit messages)

- **Cost field** gated on `inventory.view_costs` permission (L346-363).
- **Qty adjustment block** only renders when `qtyChanged` is true
  (L389-419); inside, the Save Quantity Change button is disabled
  until `qtyReason` is set.
- **Barcode uniqueness** check at L170 prevents scanning the same
  barcode into two active products.

No drift from the 41B/41C spec. The drawer is a clean fast-edit
surface.

---

## Section 6 — Division of labor proposal

Two surfaces exist today:

- **Quick Edit drawer** — daily operational edits. Autosave-on-blur
  for routine numerics. Audit-preserving for qty.
- **Full edit page** — structural / infrequent edits. Explicit save.

Recommendation below splits fields by **edit frequency**, not by
**complexity of input control**.

### 6.1 Belongs in drawer (fast daily edits)

Already there:
- Barcode
- Retail Price
- Cost Price (gated)
- Reorder Threshold
- Quantity on Hand (with reason)

### 6.2 Candidate for drawer — design decision required

- **`sale_price`** (plus dates). There is an argument for surfacing
  this as a daily edit: staff running weekly specials would benefit.
  **But** sale pricing has multi-field validation —
  `sale_price < retail_price` plus a date range
  (`sale_starts_at < sale_ends_at`) plus PST-timezone coercion
  (`dateToPstStartOfDay` / `dateToPstEndOfDay` at `[id]/page.tsx:598-599`).
  Single-field onBlur autosave doesn't fit that validation model.
  A mini-form with an explicit "Save Sale Pricing" row inside the
  drawer would work, but that duplicates the exact UX that exists on
  the full page. Treat this as a **design question**, not a free
  win.

### 6.3 Belongs only on full edit page (infrequent / structural)

- Name, slug, description
- Category, vendor
- Min order qty
- Taxable, loyalty eligible
- Variant label, variant grouping
- Specs JSONB (all 10 keys)
- Product images
- Shipping dimensions (weight/L/W/H/units) — *not currently edited
  on the page; probably a Phase 9 gap worth flagging separately*
- Show on website, is featured, website sort order
- AI Enrich and Accept Enrichment
- Sale pricing (until 6.2 is decided)

### 6.4 Currently in the wrong place

- **`quantity_on_hand` form field in Basic Info** (Field 11 in table
  4.3). **Remove.** Replace with a read-only display: current value
  + small "Open Quick Edit" CTA. This eliminates the 4.4.1 footgun
  without losing any functionality — users can still change qty, just
  through the audit-preserving path.

### 6.5 Two save buttons — consolidation analysis

Two save buttons exist because Sale Pricing sits in a separate
`ProductSalePricingCard` component rendered **outside** the `<form>`
element (`[id]/page.tsx:1483-1501` — note that the form tag closes at
L1483, then Sale Pricing is rendered as a sibling). The component
receives `onSave`, `onClear`, and state-setter props, so its lifecycle
is independent.

**Consolidation is plausible but not free.** To fold Sale Pricing
into Button 1:

1. Move the card inside the `<form>`, or hoist its state into
   `useForm` via a nested schema.
2. Merge `onSaveSalePricing()` validation (L585-595) into `onSubmit()`.
   The `sale_price < retail_price` check is already enforced by DB
   constraint; the `> 0` check needs to move.
3. Merge the PST-adjustment calls (L598-599) into `onSubmit`.
4. Keep "Clear Sale" as a separate destructive button — it's a
   semantic "remove this" action, not a save.

Result: one primary save button on the page. Sale Pricing card stays
visually distinct but commits via the shared Save Changes button.

**Alternative.** Keep the two buttons but rename for clarity: "Save
Product" (Basic Info + Specs) and "Save Sale" (Sale Pricing only).
Cheaper change, same confusion risk.

Recommendation deferred to the session that implements 42D.

---

## Section 7 — Vendor-SKU / white-label data model proposal

### 7.1 Problem statement

User needs to track, per product:

1. **White-label SKU** — what's printed on the user's shelf label;
   what gets scanned at POS.
2. **Vendor's original SKU** — used for reordering with the vendor.
3. **Vendor's product name** — used when calling the vendor (may
   differ from the user's internal name).
4. **Barcode / UPC / EAN** — the real standard barcode, if the product
   has one separate from any of the above.

Current schema supports (1) via `products.sku` and (4) via
`products.barcode`, but **not** (2) or (3).

### 7.2 Scenario A — add two columns to `products`

**Model.** Add `vendor_sku TEXT` and `vendor_product_name TEXT` to
`products`. Existing `sku` becomes **semantically** the white-label
code. `barcode` stays the real UPC/EAN.

**Pros.**
- Simplest possible change. Two nullable columns, no data loss, no FK
  churn.
- Fits current UI: vendor detail page already assumes one-vendor-per-product;
  a per-product vendor SKU slots in naturally as two extra columns in
  that table.
- Non-destructive migration. Existing products keep their data.

**Cons.**
- **Depends on existing `sku` values actually being white-label.** If
  Section 2 shows that `sku` currently holds a mix — some white-label,
  some vendor's SKU (because historical Square imports didn't
  distinguish) — we cannot drop `vendor_sku` into the schema without
  also **reconciling what's in `sku` today**. That's the Scenario B
  step.
- Assumes one vendor per product. If a product is sourced from two
  vendors (e.g., as a fallback for supply issues), this model can
  only remember one.

**When this is right.** Section 2 Query 5 shows `sku` values look
**homogeneously white-label-ish** (short numeric or consistent
internal format) and Query 8 confirms one-vendor-per-product is the
operational norm.

### 7.3 Scenario B — data reconciliation FIRST, then Scenario A

**Model.** Same end-state as A, but interpose a human audit: for each
product with a non-null `sku`, decide whether that string is the
user's white-label or the vendor's SKU. Move the vendor's SKU values
into the new `vendor_sku` column and leave white-label values in `sku`.

**Pros.**
- Handles the realistic case where `sku` today is mixed semantics.
- After reconciliation, `sku` has a clean meaning (white-label only),
  and `vendor_sku` has a clean meaning (vendor code).

**Cons.**
- Requires a human audit. Cannot be automated without guessing rules
  (length, numeric pattern, vendor membership) that will misclassify
  some rows.
- Touches every active product. For N products, ~N manual decisions
  (though many can be batched by vendor).
- Session 42B workload.

**When this is right.** Section 2 Query 5 shows bimodal SKU
distribution (e.g., a cluster of 4-5 digit numeric plus a cluster of
longer alphanumeric), indicating mixed semantics. Almost certainly
the actual state.

### 7.4 Scenario C — separate `product_vendor_listings` table

**Model.**

```sql
CREATE TABLE product_vendor_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vendor_id  UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_sku TEXT,
  vendor_product_name TEXT,
  last_cost DECIMAL(10,2),
  last_ordered_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, vendor_id)
);
```

Plus: drop `products.vendor_id` (or keep it as a denormalized pointer
to the primary listing).

**Pros.**
- Handles multi-vendor sourcing cleanly.
- Per-vendor cost history without coercing one last_cost into `products`.
- Natural home for vendor-specific metadata (MOQs, pack sizes, etc.).

**Cons.**
- Overkill if every product has exactly one vendor, which is the
  current UI assumption.
- Migration is more invasive: touches vendor detail page, PO creation
  (`po_items`), vendor dropdown on product edit page, Square import.
- Requires a `primary_listing` concept so existing code that reads
  `products.vendor_id` still works.

**When this is right.**
- Section 2 Query 8 shows operational evidence of multi-vendor
  products today (unlikely), **or**
- User confirms multi-vendor sourcing is a near-term operational need
  (e.g., supply resilience — if vendor X is out of stock, switch to
  vendor Y without losing their SKU/name mapping).
- **Revisit if operational need emerges.** Specifically: if the user
  starts sourcing the same product from multiple vendors for supply
  resilience, Scenario C becomes the correct model — earlier work
  under Scenario A+B will need to be migrated into the listings
  table, but the Scenario A columns map cleanly to listing columns,
  so the path is well-defined.

### 7.5 Recommendation

**Conditional on Section 2 results:**

- If Query 3 = 0 AND Query 5 shows homogeneous SKU format AND Query 8
  shows clean one-vendor-per-product distribution → **Scenario A**
  directly.
- If Query 5 shows bimodal SKU formats OR Query 3 > 0 (same value in
  both columns) → **Scenario B** first, then Scenario A migration.
- If user confirms multi-vendor sourcing is an active operational
  need → **Scenario C** (and skip A/B).

**Highest-probability outcome.** Scenario B then A. The stated facts —
Square imported some products, user has manually created others, and
a known test row ("Product Rack / Bottle Holder") has `sku='1234119'`
with unclear semantics — all point to mixed data that needs one
human pass before the schema can be cleaned up. Query 5's format
distribution will confirm.

---

## Section 8 — Session plan recommendation

### 8.1 Session 42B — Data reconciliation (blocks 42C)

- Run Section 2 queries 1-10. Paste results into this audit file.
- Export active products with non-null `sku` to CSV for manual pass.
- User decides per-product (or per-vendor batch) whether current `sku`
  is white-label or vendor code. Populate a staging column or CSV.
- No schema changes yet.
- Output: finalized Scenario (A, B+A, or C) for 42C to implement.

**Prompt size estimate.** Small (~150 lines): bulk of the work is the
user, not Claude Code. CC's job is to generate the CSV export and
help parse the results.

### 8.2 Session 42C — Vendor-SKU schema + UI wiring

Contingent on 42B's recommendation landing on Scenario A or B+A.

- Migration: `ALTER TABLE products ADD COLUMN vendor_sku TEXT, ADD
  COLUMN vendor_product_name TEXT`.
- Optional backfill from 42B's CSV.
- Update full product edit page: add `vendor_sku` and `vendor_product_name`
  fields to Basic Info (near the Vendor dropdown).
- Update Quick Edit drawer: add **read-only** display of `vendor_sku`
  (user mentioned they need to *see* it during picking, not edit it daily)
  — or add it as an editable field if daily edit matches workflow.
- Update Square import (`scripts/import-square-data.mjs`,
  `/api/migration/products/route.ts`) to populate `vendor_sku` from
  Square's SKU field and leave `sku` for white-label codes.
- Update vendor detail page (`admin/inventory/vendors/[id]/page.tsx`)
  to show vendor-SKU column.
- Update barcode-lookup helper: **keep** existing OR on `barcode`/`sku`,
  **do not add** `vendor_sku` to scan resolution (vendor's SKU is
  for human reference only, not scan-at-POS).
- Update `docs/dev/DB_SCHEMA.md` to reflect new columns.
- Update `docs/dev/FILE_TREE.md` if any new files land.

**Prompt size estimate.** Large but likely feasible in one session
(~250 lines): migration is small, UI wiring is the bulk.

**Blocking dependency.** Cannot start until 42B data is in hand —
otherwise backfill can't run.

### 8.3 Session 42D (optional) — Edit page consolidation

Independent from 42C; can run before, after, or interleaved. This is
the refactor work surfaced by Section 4.

- Remove `register('quantity_on_hand')` from Basic Info; replace with
  read-only display + "Open Quick Edit" link.
- Remove dead `register('is_active')` binding (Section 4.4.2).
- Decide and implement Section 6.5 consolidation: either fold Sale
  Pricing into Button 1's submit, or rename buttons for clarity.
- Audit shipping dimensions (weight/L/W/H) — they're in the schema
  (columns 25-30) but **not visible in the edit page**. Decide
  whether they need a section.
- Verify no regressions on AI Enrich, SEO path sync, variant grouping.

**Prompt size estimate.** Medium (~200 lines). Lower priority than
42B/C unless the qty-conflict footgun is actively biting.

### 8.4 Priority order

1. **42B** — data reconciliation. Required for 42C.
2. **42C** — vendor-SKU schema + UI. Addresses the user's stated
   business need (reordering).
3. **42D** — edit page consolidation. Addresses the user's stated
   UI concern. Can be deferred unless the qty-conflict footgun is
   causing active data quality issues.

---

## Appendix — tempting fixes not implemented

Per audit rules: things Session 42A **did not do** but noted for later.

1. **Remove dead `register('is_active')`** — Section 4.4.2. Defer to
   42D.
2. **Remove `quantity_on_hand` from Basic Info** — Section 4.4.1.
   Defer to 42D.
3. **Hoist `> 0` sale price check to DB** — Section 4.4.4. Low
   priority; DB-level validation in `chk_product_sale_price` already
   rejects impossible values implicitly.
4. **Document shipping dimension columns as unused-in-UI** — Section
   8.3. Noted here; no doc update committed this session.
5. **Tighten `products_all` RLS to role-based** — Section 1.4.
   Out of scope; auth is API-layer today and works.

No code changed. No migrations written. No docs beyond this audit
updated.
