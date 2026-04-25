# Inventory Log Integrity — Audit (Session 42O)

> **Status:** READ-ONLY audit. No code, schema, or migration changes in this
> commit. Recommendations only.
>
> **Scope:** Catalog every code path that touches inventory state
> (`products.quantity_on_hand` or `stock_adjustments`), classify which paths
> write the audit row and which silently mutate, and propose a defense-in-
> depth design to prevent future silent mutations.
>
> **Predecessors:**
> - Session 42M (`docs/audits/VOID_INVENTORY_BUG_SESSION42M.md`) found that
>   **POS void** does not restore inventory at all and identified three
>   silent-mutation paths.
> - Session 42K (`docs/audits/REVERT_STOCK_COUNT_SESSION42K.md`) shipped the
>   `revert_stock_count` RPC with `FOR UPDATE` row locking + audit-row
>   writes, and is the design template proposed below.
>
> **Headline finding:** Six writers in production update `products.quantity_on_hand`
> without writing a `stock_adjustments` row, and two more paths flip
> transaction status to `voided` / process refunds without restoring stock
> at all. The audit log is therefore not a complete record of inventory
> movement, and the per-product stock history surfaced in the UI is missing
> rows for every online order paid, every online order refunded, every POS
> void, and every direct edit through the admin product form.

---

## TL;DR

| Question | Answer |
|---|---|
| How many code paths mutate `products.quantity_on_hand`? | **11 distinct call sites** (9 from app code, 2 from RPCs). |
| How many of those write a `stock_adjustments` row? | **8 out of 11**. The 3 that don't are admin-orders refund, Stripe webhook (online order paid), and the admin product edit form. |
| Is there a path that *should* mutate qty but does not? | **Yes.** POS void flips status but writes neither `products` nor `stock_adjustments` (Session 42M). |
| Does the UI surface stock history? | One global view: `/admin/inventory/stock-history`. **No per-product stock-history page**; no global "inventory activity log" beyond this. The global view's API supports `product_id` filter but the UI does not expose it. |
| Are any `adjustment_type` enum values unused? | All 8 enum values are written by some path. **Two values have no UI label** (`shop_use`, `customer_retained`) — they fall through to raw enum text in the badge and the type filter. |
| Is there a `voided` adjustment type? | **No.** Refund-restock and (proposed) void-restock both reuse `'returned'`. Recommendation in Phase 8. |
| Is there a `corrected` / `reconciliation` adjustment type for backfill? | **No.** `'manual'` is the closest existing match. Proposal in Phase 8. |
| Recommendation? | **Track A first** (plug per-path holes by adding `logStockAdjustment` calls). **Track B as a follow-up** once Track A is verified — adopt **Option B** (revoke direct UPDATE on `products.quantity_on_hand`, force all writes through a `apply_stock_movement` RPC modeled on `commit_stock_count`/`revert_stock_count`). |

---

## Phase 1 — Complete catalog of writers

### 1.1 — Writers that UPDATE `products.quantity_on_hand`

Source: `grep -rn "quantity_on_hand" src/` filtered to `.update(` and direct
INSERTs of `quantity_on_hand`.

| # | Path | Direction | Adjustment type written | reference_type | Audit row? | Notes |
|---|---|---|---|---|---|---|
| 1 | `src/app/api/admin/stock-adjustments/route.ts:128-148` | ± (signed `adjustment`) | `manual` (default) or caller-specified | `null` | ✅ | The canonical "admin manual adjustment" path. Used by both the row-level Adjust modal (`/admin/catalog/products` page list) and the Quick Edit drawer's quantity field. |
| 2 | `src/app/api/admin/purchase-orders/[id]/receive/route.ts:115-144` | + | `received` | `purchase_order` | ✅ | Also updates `cost_price` from PO unit cost. |
| 3 | `src/app/api/pos/transactions/route.ts:189-221` | − | `sold` | `transaction` | ✅ | POS sale (`tx.id` as reference). |
| 4 | `src/app/api/pos/sync-offline-transaction/route.ts:149-181` | − | `sold` | `transaction` | ✅ | Offline POS replay path. Mirror of #3. |
| 5 | `src/app/api/pos/refunds/route.ts:258-308` | + (only when `disposition='restock'`) | `returned` / `damaged` / `customer_retained` | `refund` | ✅ | Disposition-aware. Writes a row for every line, even when `quantity_change=0` (damaged / customer_retained). |
| 6 | `src/app/api/pos/shop-use/route.ts:51-78` | − | `shop_use` | `shop_use` | ✅ | Internal product consumption (e.g. detailing supplies used in shop). |
| 7 | `src/app/api/admin/orders/[id]/refund/route.ts:82-98` | + | n/a | n/a | **❌ silent** | Walks `order_items`, increments qty per item. **No `logStockAdjustment` call.** Same shape as POS refund, but the audit-row block is absent. |
| 8 | `src/app/api/webhooks/stripe/route.ts:79-95` | − | n/a | n/a | **❌ silent** | On `payment_intent.succeeded`, decrements qty per `order_item`. **No `logStockAdjustment` call.** |
| 9 | `src/app/admin/catalog/products/[id]/page.tsx:457-480` | absolute set (form value) | n/a | n/a | **❌ silent** | The full product edit page persists every form field including `quantity_on_hand`. If a user changes the displayed qty in this form, the new value lands directly on `products` with no audit row. The Quick Edit drawer in the products list (#1 above) goes through the API; the **full edit page does not**. |
| 10 | `src/app/admin/catalog/products/new/page.tsx:159-184` | absolute set (initial value) | n/a | n/a | n/a (initial creation) | New product insert with `quantity_on_hand: data.quantity_on_hand`. Defensible as the row's "starting balance," but currently leaves no audit row to anchor the timeline. See Phase 8. |
| 11 | `src/app/api/migration/products/route.ts:96-119` | absolute set (initial value, bulk) | n/a | n/a | n/a (bulk import) | Square import of products. Same defense as #10. |
| 12 | RPC `commit_stock_count(p_count_id, p_employee_id)` (`supabase/migrations/20260421000002_create_stock_counts.sql:103-187`) | ± (delta vs. snapshot) | `recount` | `stock_count` | ✅ (RPC writes inline) | Walks `stock_count_items`, locks affected `products` rows `FOR UPDATE`, computes delta, updates qty, inserts `stock_adjustments`. Atomic. |
| 13 | RPC `revert_stock_count(p_count_id, p_user_id, p_confirmed_drift)` (`supabase/migrations/20260424000002_revert_stock_count_structured_errors.sql:25-186`) | ± (inverse of original delta) | `recount` ("Reversal of …") | `stock_count` | ✅ (RPC writes inline) | Two-pass: locks all rows, validates negative-qty safety, then writes inverse adjustments. Atomic. |

**Special case: POS void** (`src/app/api/pos/transactions/[id]/route.ts:105-184`) — flips
`transactions.status` to `'voided'` and reverses loyalty, but **does NOT
update `products.quantity_on_hand` and does NOT write `stock_adjustments`**.
This is the Session 42M finding: an inventory side-effect that *should*
exist but doesn't. Listed here for completeness; not a "writer" in the
strict sense.

### 1.2 — Writers that INSERT into `stock_adjustments`

Two mechanisms:

1. **`logStockAdjustment` helper** (`src/lib/utils/stock-adjustments.ts`) —
   the canonical app-code entry point. Used by paths #1, #2, #3, #4, #5, #6
   above.
2. **Direct `INSERT INTO stock_adjustments`** inside RPCs `commit_stock_count`
   (#12) and `revert_stock_count` (#13). The RPCs do not call the JS helper
   because they execute server-side in plpgsql.

No other code path writes the table. Confirmed by
`grep -rn "stock_adjustments\|StockAdjustment\|stockAdjustment" src/` plus
the migration grep above.

### 1.3 — Callers of `logStockAdjustment` (the helper)

| Caller | Adjustment types it writes |
|---|---|
| `/api/admin/stock-adjustments` POST (manual + Quick Edit drawer) | `manual` (default) or any value passed by the caller (`adjustment_type` field on the request body) — **not validated against the enum on the server**, so a typo would 400 only at the DB layer via the CHECK constraint |
| `/api/admin/purchase-orders/[id]/receive` | `received` |
| `/api/pos/transactions` (sale) | `sold` |
| `/api/pos/sync-offline-transaction` (offline sale replay) | `sold` |
| `/api/pos/refunds` | `returned`, `damaged`, `customer_retained` |
| `/api/pos/shop-use` | `shop_use` |

Test coverage: `src/lib/utils/__tests__/stock-adjustments.test.ts` (helper
contract only — does not test the integrations above).

### 1.4 — Silent-mutation matrix (the gaps)

| Path | Mutates qty? | Writes audit? | Severity |
|---|---|---|---|
| Admin orders refund (#7) | ✅ + | ❌ | High — silent +qty per refund line. Customer-facing refund. |
| Stripe webhook order paid (#8) | ✅ − | ❌ | High — silent −qty on every paid online order. Far higher volume than #7. |
| Admin product edit form (#9) | ✅ absolute | ❌ | Medium — only fires when a human edits the qty field on the full edit page. Easy to do accidentally because the field is visible alongside name/price/etc. |
| New product creation (#10, #11) | ✅ initial | ❌ (n/a) | Low — defensible as "opening balance," but means the timeline has no anchor row. Annoying for reporting; not a correctness bug. |
| POS void | ❌ (should be ✅ +) | ❌ | Critical — never restores stock at all. Documented in detail in Session 42M. |

Five distinct defects across the four severity tiers.

---

## Phase 2 — UI surfaces showing inventory log

### 2.1 — Where stock-adjustment rows are read

`grep -rn "stock_adjustments\|StockAdjustment\|stockAdjustment\|inventory.*history" src/app/`:

| Surface | File | Purpose |
|---|---|---|
| Global stock-history page | `src/app/admin/inventory/stock-history/page.tsx` | Lists all `stock_adjustments` rows globally, paged 50 at a time, filter by `adjustment_type`, columns: date, product, type, change, before→after, reason, reference (PO/Count link), user. |
| Stock-history list API | `src/app/api/admin/stock-adjustments/route.ts:9-74` | Backs the page. Accepts `product_id`, `type`, `limit`, `offset` query params. **`product_id` is supported by the API but the UI does not expose a product filter** — there's no per-product drilldown wired up. |
| Stock-count revert preview API | `src/app/api/admin/inventory/counts/[id]/revert-preview/route.ts` | Reads `stock_adjustments` to detect drift before reverting a stock count. Internal use, not a log view. |
| Shop-expenses export | `src/app/api/admin/shop-expenses/export/route.ts` | Reads `adjustment_type IN ('shop_use','damaged')` rows for expense reporting. Not a stock-history view per se, but reuses the audit table as the source of truth for cost basis. |

### 2.2 — Per-product stock history

**Not implemented.** `grep -rn "stock-history\|stock_adjustments\|StockHistory" src/app/admin/catalog/` returns zero matches. The product detail page
(`src/app/admin/catalog/products/[id]/page.tsx`) has no "History" tab, no
link to `/admin/inventory/stock-history?product_id=…`, and no inline list of
recent adjustments.

If a user wants to know *why* a specific product's qty went from 6 to 3 (or
the SD-006223 1→4 jump from Session 42M), there is no UI route to find that
information except by going to the global stock-history page and visually
scanning for the product's name. With a 50-row page and the table sorted by
date, this scales poorly past a few hundred adjustments.

### 2.3 — Other inventory surfaces

| Surface | What it shows | Audit log connection |
|---|---|---|
| `/admin/inventory/purchase-orders/[id]` | PO header + items received | Linked from stock-history `reference_id`; not the inverse. |
| `/admin/inventory/counts/[id]` | Stock count items + drift on revert | Linked from stock-history `reference_id`; not the inverse. |
| `/admin/inventory/vendors/[id]` | Vendor's products + qty | No history. |
| `/admin/inventory/shop-expenses` | Aggregated `shop_use`/`damaged` expense report | Reads `stock_adjustments` directly but presents as $ totals, not as a movement log. |
| `/admin/catalog/products` (list) | Quick Edit drawer + Adjust modal | Both write through the audit-logging API (good). No inline history. |
| `/admin/catalog/products/[id]` (edit form) | Full product edit incl. qty | **Mutates qty silently — no history shown either.** |

### 2.4 — Recommendation

Two UI gaps emerge naturally from the writer audit:

1. **Per-product stock history.** Add a tab or panel on
   `/admin/catalog/products/[id]` (the existing detail page) that calls the
   already-supported `GET /api/admin/stock-adjustments?product_id=…`. Low
   cost (the API exists; the UI is the same `DataTable` shape as the global
   page). High value: users can answer "what happened to this product's qty"
   without scrolling the global log.
2. **Surface the user filter on the global page.** The global stock-history
   page filters by `adjustment_type` only. Add a product picker (typeahead
   on `products.name + sku`) and a date range to the toolbar. This also
   solves the per-product question if the per-product tab is too costly.

If the user wants only one, ship #1 — it's the tighter answer to the
forensic question that prompted this audit.

A "global inventory activity log" *already exists* — it's
`/admin/inventory/stock-history`. The gap is per-product drilldown, not a
new surface.

---

## Phase 3 — `adjustment_type` enum coverage

### 3.1 — The CHECK constraint (verbatim)

`supabase/migrations/20260420000001_extend_stock_adjustments.sql:6-12`:

```sql
ALTER TABLE stock_adjustments
  DROP CONSTRAINT stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN (
    'manual', 'received', 'sold', 'returned',
    'damaged', 'recount', 'shop_use', 'customer_retained'
  ));
```

(The original migration `20260211000005_purchase_orders_stock_adjustments.sql:84`
allowed only `'manual', 'received', 'sold', 'returned', 'damaged', 'recount'`.
Session 37 extended it to add `shop_use` and `customer_retained`.)

The TypeScript mirror is at `src/lib/utils/stock-adjustments.ts:3-11`.

### 3.2 — Per-value usage

| Value | Direction | Used by | Reason text written | UI label |
|---|---|---|---|---|
| `manual` | ± | `/api/admin/stock-adjustments` (default) — Quick Edit drawer + Adjust modal | Free text; Quick Edit prepends category label (e.g. "Damaged — bottle leaked") | "Manual" ✅ |
| `received` | + | `/api/admin/purchase-orders/[id]/receive` | `Received from PO-XXXXXX` | "PO Received" ✅ |
| `sold` | − | POS sale + offline replay | `Sold via POS (SD-XXXXXX)` | "Sold" ✅ |
| `returned` | + | POS refund (when disposition=`restock`) | `Refund — restocked (refund <id>)` | "Returned" ✅ |
| `damaged` | 0 (audit-only) | POS refund (when disposition=`damaged`); also accepted as a `manual` sub-type via Quick Edit category | `Refund — damaged / not resellable (refund <id>)` | "Damaged" ✅ |
| `recount` | ± | `commit_stock_count` + `revert_stock_count` RPCs | `Stock count: <name>` / `Reversal of stock count: <name>` | "Recount" ✅ |
| `shop_use` | − | `/api/pos/shop-use` | `Shop use` or `Shop use — <note>` | **Missing from `STOCK_ADJUSTMENT_TYPE_LABELS`** — falls through to the raw enum string `shop_use` in the badge and type filter dropdown. |
| `customer_retained` | 0 (audit-only) | POS refund (when disposition=`customer_retained`) | `Refund — customer kept item (refund <id>)` | **Missing from `STOCK_ADJUSTMENT_TYPE_LABELS`** — same fallthrough. |

### 3.3 — UI label gap (separate small bug)

`src/lib/utils/constants.ts:144-151`:

```ts
export const STOCK_ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  received: 'PO Received',
  sold: 'Sold',
  returned: 'Returned',
  damaged: 'Damaged',
  recount: 'Recount',
} as const;
```

`shop_use` and `customer_retained` are missing. Both are written in
production. The stock-history page renders them as raw enum strings — minor
UX bug, not a correctness issue. Worth fixing in a one-line PR alongside any
future enum extension.

### 3.4 — Gaps in the enum (proposed extensions)

| Proposed value | Why | Alternative (status quo) |
|---|---|---|
| `voided` | Distinguish "sale was undone" from "customer brought goods back" in reporting and forensics. Refund-restock and void-restock have different real-world causes (cashier mis-rang vs. customer dissatisfaction). | Reuse `returned`. Less precise but matches CHECK constraint without migration. |
| `reconciliation` (or `corrected`) | The upcoming backfill (Phase 6 of Session 42M) wants to insert audit rows that say "we discovered drift and corrected it" — distinct from a normal manual adjustment. | Reuse `manual` with `reason='Backfill: ...'`. Searchable but blurs the line between "I, the operator, manually changed this number on purpose" and "the system detected a missed write." |

Both are **optional**. Each would require a `DROP CONSTRAINT … ADD CONSTRAINT`
migration, an entry in the TypeScript union, and an entry in the labels map.

### 3.5 — Quantity-zero rows and reporting

`damaged` and `customer_retained` rows are inserted with `quantity_change=0`
(when written via the refund route — the qty doesn't change because the
stock was decremented at sale time and is not coming back). The audit row
exists purely to record the **disposition** of a refunded line.

This affects two existing surfaces:

1. **Stock-history UI.** The "Change" column shows `0`. Visually correct but
   easy to misread as "this row did nothing." The "Reason" column carries
   the meaning — fine.
2. **Shop-expenses export.** The export reads `adjustment_type IN ('shop_use','damaged')`
   to compute cost-of-goods-consumed. **`damaged` rows from refunds with
   `quantity_change=0` would inflate nothing** because the cost calculation
   should multiply by `|quantity_change|`. Verify that the export does not
   double-count: a damaged refund's cost was already accounted for when the
   sale was rung up (via the `sold` row's `unit_cost`). Out of scope for
   this audit but flagged for follow-up.

---

## Phase 4 — `reference_type` enum coverage

### 4.1 — TypeScript mirror

`src/lib/utils/stock-adjustments.ts:13-19`:

```ts
export type ReferenceType =
  | 'purchase_order'
  | 'transaction'
  | 'refund'
  | 'shop_use'
  | 'stock_count'
  | null;
```

### 4.2 — DB CHECK constraint (current state)

`supabase/migrations/20260421000002_create_stock_counts.sql:91-97`
(superseding `20260420000001_extend_stock_adjustments.sql:14-21`):

```sql
ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_reference_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_reference_type_check
  CHECK (reference_type IN (
    'purchase_order', 'transaction', 'refund', 'shop_use', 'stock_count'
  ));
```

### 4.3 — Per-value usage

| Value | Used by | Points to | Notes |
|---|---|---|---|
| `purchase_order` | `/api/admin/purchase-orders/[id]/receive` | `purchase_orders.id` | One row per received line. |
| `transaction` | POS sale + offline replay | `transactions.id` | One row per product line on the sale. |
| `refund` | POS refund | `refunds.id` | One row per refund line (regardless of disposition). |
| `shop_use` | `/api/pos/shop-use` | `null` (no second-table FK) | The reference_type tags it for filtering; reference_id is unused. |
| `stock_count` | `commit_stock_count` + `revert_stock_count` RPCs | `stock_counts.id` | Both commit and revert rows share the same reference. |
| `null` | `/api/admin/stock-adjustments` (manual via admin), Quick Edit drawer | n/a | Manual adjustments don't link to anything. |

### 4.4 — Gaps

The two silent-mutation paths from Phase 1 (`#7` admin orders refund and
`#8` Stripe webhook) sit awkwardly w.r.t. the existing reference types:

- **Online orders are tracked in `orders`, not `transactions`.** The
  `transactions` table is POS-only. So neither the Stripe-paid online order
  nor the admin orders refund can claim `reference_type='transaction'`
  without lying about the FK target.
- **Online order refunds use the `orders` flow, not `refunds`.** The POS
  refund route inserts into `refunds`; the admin orders refund route does
  **not** insert into `refunds` — it inserts into `order_events` with
  `event_type='refunded'` (`route.ts:69-80`). So `reference_type='refund'`
  would also be inaccurate for online refunds.

Two options to plug this:

1. **Extend the enum to include `'order'` and `'order_refund'`.**
   - `'order'` → `orders.id` for the Stripe-webhook decrement (`adjustment_type='sold'`, `reference_type='order'`).
   - `'order_refund'` → some FK that identifies the refund event.
     - The cleanest FK would be `order_events.id` for the `refunded` event,
       since that's where the refund metadata already lives
       (`refund_id`, `amount`, `reason`).
   - Cost: one migration adding both values to the CHECK constraint, plus
     TypeScript union update.
2. **Synthesize `transactions` rows for online orders so they reuse `'transaction'`.**
   - Means duplicating order data into `transactions`. Conflicts with the
     current model (transactions = POS, orders = e-com) and would require
     reconciling double-counting in dashboards. Not recommended.

**Recommendation: option 1.** Add `'order'` and `'order_refund'` as
reference_types alongside the per-path code fixes. Cheap, accurate, no
double-counting risk.

---

## Phase 5 — Defense-in-depth proposal

The status quo is "every writer is responsible for calling
`logStockAdjustment`." That's worked for the paths that remember to call it
and broken for the three that don't (#7, #8, #9). The pattern will keep
breaking on every future feature unless the discipline becomes
**impossible to bypass**.

Three structural options. Each evaluated below.

### Option A — `BEFORE UPDATE` trigger that requires a same-transaction adjustment row

A trigger on `products` that fires when `quantity_on_hand` changes, looks
for a matching `stock_adjustments` row inserted in the same DB transaction,
and `RAISE EXCEPTION` if it can't find one.

**Implementation:**

- Trigger `tr_products_qty_audit` `BEFORE UPDATE OF quantity_on_hand ON products`.
- Inside, search for a row in `stock_adjustments` where
  `product_id = NEW.id AND quantity_after = NEW.quantity_on_hand AND created_at >= now() - INTERVAL '1 second'`.
  If absent, abort.
- Caller order: insert audit row first, then update qty, OR coordinate via
  a transaction-local flag like `pg_temp.last_audit_row` (uglier).

**Hard problem:** the trigger fires *before* the update completes, but the
audit row isn't required to land before the qty update — the current code
inserts qty first, then audit (see `/api/pos/transactions/route.ts:202-219`).
Reordering is possible but means every caller must change. And matching
`quantity_after` is heuristic — concurrent updates to the same product would
race.

| Pros | Cons |
|---|---|
| No schema rewrite | Forces all 8 callers to reorder writes |
| No app-code rewrites except ordering | Heuristic match is racy; false-positives possible |
| Catches `service_role` bypass too (triggers fire regardless of role unless `SET session_replication_role = replica`) | Errors at runtime with cryptic "audit row not found" messages |
| | Doesn't catch *missing* audit rows when the writer simply doesn't update qty (POS void!) |

**What it prevents:** silent UPDATE-qty bypass (#7, #8, #9).
**What it doesn't prevent:** POS-void-style bugs where qty *should* change
but doesn't — there's no UPDATE to trigger on.

### Option B — Revoke direct UPDATE; force all writes through an RPC

Revoke `UPDATE(quantity_on_hand)` permission from `authenticated` and
`service_role`. Create an RPC `apply_stock_movement(product_id, delta,
adjustment_type, reference_type, reference_id, reason, user_id, unit_cost)`
that:

1. Acquires `SELECT ... FOR UPDATE` lock on the product row.
2. Reads current qty.
3. Computes new qty (`current + delta`, clamped at 0 if `clamp=true`).
4. Validates `adjustment_type` against the enum.
5. Validates `reference_type` against the enum.
6. UPDATEs the products row.
7. INSERTs the `stock_adjustments` row.
8. Returns the new state.

All writes (including `service_role` from API routes) call this RPC.

**Implementation:**

- One migration: `REVOKE UPDATE (quantity_on_hand) ON products FROM authenticated, service_role;` plus `CREATE FUNCTION apply_stock_movement(...) SECURITY DEFINER`.
- Refactor 8 call sites to call `supabase.rpc('apply_stock_movement', {...})` instead of `.update({ quantity_on_hand: ... }) + logStockAdjustment(...)`.
- The new product creation paths (#10, #11) need a separate RPC
  `create_product_with_initial_stock(...)` or an "opening balance" branch
  that's allowed to set initial qty as part of the row insert (since the
  REVOKE applies only to UPDATE, not INSERT).

**Concurrency story:** identical to `commit_stock_count` /
`revert_stock_count` — the existing pattern in the repo. `FOR UPDATE` locks
plus single-statement update means concurrent sales/refunds queue rather
than race.

| Pros | Cons |
|---|---|
| **Impossible to bypass without writing an audit row.** Even a `service_role` API route can't UPDATE the column. | Migration touches every writer (~8 files). |
| Validation is centralized in one RPC. Adds a single chokepoint for new rules. | If a new contributor doesn't know about the RPC, their `.update({ quantity_on_hand })` will fail with a permissions error — but the error is clear. |
| Matches existing pattern in the repo (`commit_stock_count`, `revert_stock_count`). | No protection against POS-void-style bugs (the writer who *forgets* to call the RPC at all). |
| Gives a clean home for cost-snapshotting (always compute `unit_cost` from `products.cost_price` at lock time). | Requires `SECURITY DEFINER` and careful permission scoping inside the RPC. |
| No performance penalty vs. status quo (one round-trip to the function instead of two queries). | Initial-stock case (#10, #11) needs a parallel "opening balance" path. |

**What it prevents:** all silent UPDATE bypass (#7, #8, #9, plus future
similar bugs). Direct ad-hoc `UPDATE` from psql / Studio is also blocked
unless the operator explicitly grants themselves the permission.
**What it doesn't prevent:** POS-void-style bugs (writer doesn't call the
RPC because they forgot to handle inventory at all). For that, a separate
defense (e.g., test-suite coverage requirement, or a "void inventory check"
step in code review) is needed.

### Option C — Make `quantity_on_hand` a derived view (`SUM(stock_adjustments.quantity_change)`)

Replace `products.quantity_on_hand` (column) with a computed expression
based on `stock_adjustments` history. Either:

- A `VIEW` over `products + SUM(stock_adjustments)`, or
- A materialized view refreshed on every adjustment, or
- A keep-the-column-but-compute-from-trigger-on-`stock_adjustments`-INSERT
  pattern (an `AFTER INSERT ON stock_adjustments` trigger updates `products`).

**Option C analysis:**

| Pros | Cons |
|---|---|
| Source-of-truth becomes the audit log itself. Drift is impossible by definition. | Performance: every read of qty pays for a SUM over historical adjustments (or relies on a materialized view that needs refreshing). Catalog has 100+ products; on iPad POS this matters. |
| No silent-mutation path can exist — there's no qty column to mutate. | Filters like `quantity_on_hand > 0` (used in store, voice agent, stock alerts) become aggregate queries. PostgREST `.gt('quantity_on_hand', 0)` won't work without an indexed expression or materialized view. |
| | Initial-stock (opening balance) becomes "insert an `'opening_balance'` adjustment row" — semantically clean but a Big Migration. |
| | Migration touches every reader (~30+ call sites of `quantity_on_hand`) plus every writer. Highest cost option. |
| | Race window when computing qty for booking eligibility (e.g., POS sale: "is there enough?"). With a column-based qty, `SELECT FOR UPDATE` locks that one row. With a SUM-based qty, you'd need a `SELECT pg_advisory_xact_lock(hashtext(product_id))` or similar. |

**What it prevents:** all silent mutation by design.
**What it doesn't prevent:** POS-void-style bugs (still a writer who
forgets to insert an adjustment row).

### Comparison table

| Option | Impl. cost | Code rewrites | Migration cost | Performance risk | Prevents silent UPDATE? | Prevents missing-write (void style)? |
|---|---|---|---|---|---|---|
| A — Trigger | Low (1 trigger) | Reorder writes in 8 callers | Low | None | Partially (heuristic match) | No |
| B — Revoke + RPC | Medium (1 RPC, 1 grant migration) | Switch 8 callers to `rpc()`; +1 RPC for initial stock | Medium | None (same number of round-trips) | Yes (hard) | No |
| C — Derived qty | High (rewrite reads + writes) | Every reader of `quantity_on_hand` (30+ call sites) | High | Real (SUM over history per read) | Yes (by design) | No |

### Recommendation: Option B

**Lean B.** It's the right balance:

- **Preserves the current schema** — `quantity_on_hand` stays a column, all
  reads continue to work unchanged, no PostgREST query rewrites.
- **Forces the audit-row write** — physically impossible to UPDATE qty
  without going through the RPC, which writes the audit row in the same
  transaction. The `service_role` bypass that `createAdminClient()` enjoys
  for everything else does NOT bypass column-level GRANTs unless we
  explicitly grant the role back, which we won't.
- **Matches existing precedent in the repo** — `commit_stock_count` and
  `revert_stock_count` are already RPCs. The pattern is familiar.
- **Cheap to retrofit** — 8 call sites, mechanical change. The existing
  `logStockAdjustment` helper can be deprecated and its callers redirected
  to `rpc('apply_stock_movement', ...)` with a thin TypeScript wrapper that
  preserves the signature.
- **Easy to teach** — "if you're updating qty, call `applyStockMovement()`.
  Otherwise the DB will reject your write." Clear and self-enforcing.

Option A is too heuristic and doesn't catch the writer-doesn't-update-qty
case (which we already have one of: POS void). Option C is a six-month
project disguised as a defense-in-depth tweak.

**Don't ship B before A's per-path holes are plugged** (Phase 7). If you
ship B first, the existing silent paths break in production with a
permission error before they get a chance to be migrated. Track A first,
then B.

---

## Phase 6 — Per-path silent-mutation quantification (queries for the user)

These run against the live DB. Claude has no DB access — paste them into
Supabase SQL Editor.

### 6.1 — Online orders paid (Stripe webhook silent decrement, path #8)

```sql
-- Number of order_items that should have produced a 'sold' audit row but
-- didn't, because the Stripe webhook silently decrements without logging.
-- Heuristic: every order_item with a paid order should have a
-- corresponding stock_adjustments row referencing the order. There is no
-- reference_type='order' yet, so we count via a join + NOT EXISTS against
-- whatever today's mechanism would be (which is nothing).
SELECT
  COUNT(*)             AS unaudited_order_lines,
  SUM(oi.quantity)     AS unaudited_units_decremented
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.payment_status IN ('paid', 'partially_refunded', 'refunded')
  AND oi.product_id IS NOT NULL;
```

This number is the **upper bound** on missing `sold` audit rows from online
orders. Every single one is missing right now (because no code path writes
audit rows for online order decrements).

### 6.2 — Admin orders refunded (silent increment, path #7)

```sql
-- Number of order_items affected by an admin orders refund that should
-- have produced a 'returned' audit row but didn't.
SELECT
  COUNT(*)             AS unaudited_refund_lines,
  SUM(oi.quantity)     AS unaudited_units_incremented
FROM order_events oe
JOIN orders o     ON o.id = oe.order_id
JOIN order_items oi ON oi.order_id = o.id
WHERE oe.event_type IN ('refunded', 'partially_refunded')
  AND oi.product_id IS NOT NULL;
```

### 6.3 — Per-product net silent drift from online order activity

```sql
-- Sums the silent decrements (from paid orders) and silent increments (from
-- refunded orders) per product. Net = current product position in the audit
-- vacuum. Negative net = qty has been silently drained; positive net =
-- silently restored.
WITH paid_decrements AS (
  SELECT oi.product_id, SUM(oi.quantity) AS units
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.payment_status IN ('paid', 'partially_refunded', 'refunded')
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
),
refund_increments AS (
  -- Admin orders refund increments by the full order_item.quantity per
  -- event_type='refunded' in the current code. (Partial refunds set
  -- payment_status to 'partially_refunded' but the route still increments
  -- by full quantity — see route.ts:82-98. Confirm by reading order_events
  -- if needed.)
  SELECT oi.product_id, SUM(oi.quantity) AS units
  FROM order_events oe
  JOIN orders o ON o.id = oe.order_id
  JOIN order_items oi ON oi.order_id = o.id
  WHERE oe.event_type IN ('refunded', 'partially_refunded')
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
)
SELECT
  p.id, p.sku, p.name, p.quantity_on_hand,
  COALESCE(pd.units, 0)               AS silent_decrements,
  COALESCE(ri.units, 0)               AS silent_increments,
  COALESCE(ri.units, 0) - COALESCE(pd.units, 0)
                                       AS net_silent_drift
FROM products p
LEFT JOIN paid_decrements pd  ON pd.product_id = p.id
LEFT JOIN refund_increments ri ON ri.product_id = p.id
WHERE COALESCE(pd.units, 0) + COALESCE(ri.units, 0) > 0
ORDER BY ABS(COALESCE(ri.units, 0) - COALESCE(pd.units, 0)) DESC;
```

### 6.4 — Admin product edit form silent absolute-set (path #9)

There's no log of *which* qty edits came from the form vs the API, so this
can't be quantified post-hoc directly. The closest signal:

```sql
-- Audit log entries from the admin source where action='update' on a
-- product entity, with a body that includes quantity_on_hand. The full
-- product edit page logs an audit_log row for the form save, but it's a
-- generic 'update' with the whole form body — not a stock_adjustments
-- proxy.
SELECT created_at, user_email, entity_id, entity_label, details
FROM audit_log
WHERE entity_type = 'product'
  AND action = 'update'
  AND details::text LIKE '%quantity_on_hand%'
ORDER BY created_at DESC
LIMIT 100;
```

This is a heuristic. The audit_log has the form payload only if the form-
save path explicitly logs it, which the current `[id]/page.tsx` does not
appear to do (it calls `supabase.from('products').update(...)` directly
from the browser with no `logAudit` wrapper). So path #9's drift may be
**entirely invisible** in any system except the `products.updated_at`
column, which only tells you "someone changed something."

**Practical implication:** for path #9 backfill, the user will have to rely
on `products.updated_at` plus tribal knowledge ("we know we edited Product
X yesterday") rather than a queryable record. This is a strong argument for
plugging path #9 *first* among Track A items — every day it stays open,
silent edits accumulate.

### 6.5 — POS void (already documented in Session 42M Phase 7)

See `docs/audits/VOID_INVENTORY_BUG_SESSION42M.md` Phase 7 for the canonical
queries.

---

## Phase 7 — Recommendations: two-track plan

### Track A — Plug the holes (per-path code fixes)

Each silent path gets a `logStockAdjustment` (or equivalent) call added
inline. Status quo schema, low risk, immediate effect.

| Order | Path | Fix shape | Effort | Risk |
|---|---|---|---|---|
| 1 | **POS void** (`/api/pos/transactions/[id]` action=`void`) | Mirror the refund route's inventory block. Disposition fixed at `restock` (see Session 42M Phase 10 q1). Wrap in an RPC for FOR UPDATE locks (matches `commit_stock_count`). | 1 PR | Low |
| 2 | **Admin product edit form** (`/admin/catalog/products/[id]/page.tsx`) | Stop including `quantity_on_hand` in the form's UPDATE payload. The qty field should be **read-only on the full edit page**, with a "Use Quick Edit / Adjust" link to the existing API-backed flow. (The Quick Edit drawer at `components/quick-edit-drawer.tsx` already does this correctly.) | 1 PR | Very low |
| 3 | **Admin orders refund** (`/api/admin/orders/[id]/refund`) | Add `logStockAdjustment` call after the qty update, with `adjustment_type='returned'`, `reference_type='order_refund'` (new — see Phase 4) or reuse `refund` (less accurate). | 1 PR | Low (no concurrency change) |
| 4 | **Stripe webhook** (`/api/webhooks/stripe` `payment_intent.succeeded`) | Add `logStockAdjustment` call after the qty decrement, with `adjustment_type='sold'`, `reference_type='order'` (new — see Phase 4). | 1 PR | Low |
| 5 | **Online order reference_type extension** | One small migration to extend the CHECK constraint to include `'order'` and `'order_refund'` (or just `'order'` if we collapse online refunds into a single value). Required by #3 + #4 if we don't reuse existing types. | 1 migration + 1 type union edit | Low |
| 6 | **UI label gap** | Add `shop_use: 'Shop Use'` and `customer_retained: 'Customer Retained'` to `STOCK_ADJUSTMENT_TYPE_LABELS`. | 2-line PR | None |
| 7 | **Per-product stock-history tab** | Add a "History" panel to `/admin/catalog/products/[id]` calling the existing `/api/admin/stock-adjustments?product_id=…` endpoint. Same `DataTable` shape as the global page. | 1 PR (UI only; no schema, no API change) | None |

After Track A, every active code path either writes an audit row or is
read-only. The silent-mutation surface is closed.

**Backfill** (one-off corrective writes for the historical drift in 6.1,
6.2, 6.3, 6.5 and Session 42M Phase 7) can run after Track A items 1–4 are
deployed and verified. Run as a single migration in dry-run mode first
(produce a CSV of intended writes; review; apply).

### Track B — Defense-in-depth (Option B from Phase 5)

After Track A is in production for a release cycle and no regressions have
appeared, retrofit to Option B:

1. New RPC `apply_stock_movement(...)` modeled on `commit_stock_count`.
2. New RPC `set_initial_stock_on_create(...)` for product creation
   (or grant INSERT privilege on the column and rely on creation paths).
3. Migration: `REVOKE UPDATE (quantity_on_hand) ON products FROM authenticated;`
   (and from `service_role` once all callers are migrated).
4. Refactor the 8 callers to use the RPC.
5. Remove the now-redundant `logStockAdjustment` helper (or keep as a
   private internal used only by the RPC).

**Why Track A first:**

- Every Track A item delivers value independent of Track B.
- Track A leaves the schema unchanged, so backing it out is a trivial
  revert.
- Track B's REVOKE migration will fail loudly in any test environment that
  still has unfixed callers — better to ship A's fixes first so B's deploy
  is a clean cutover.

**Why Track B at all:**

- Closes the door on this class of bug for new code. Without B, the same
  audit will be needed again in 12 months when someone adds a new "ship
  product" or "transfer between locations" feature and forgets the audit
  call.
- Aligns the schema with the stock-count pattern, making the codebase more
  consistent.

### Don't ship A+B together

Combining means a single PR with: 4 silent-path fixes + 1 enum migration +
1 REVOKE migration + 1 RPC migration + 8 caller refactors + 1 UI tab + UI
label fix + backfill migration. That's a 2,000-line PR with cross-cutting
concerns, hard to review, hard to revert. Ship Track A first as 7 small
PRs, verify in production, then ship Track B as a single coordinated PR.

---

## Phase 8 — Open questions for reviewer decision

1. **`'voided'` adjustment_type — add or reuse `'returned'`?**
   - **Add:** distinguishes void-restore from refund-restore in reporting.
     Future query `SELECT … WHERE adjustment_type='voided'` works directly.
     One migration, one TypeScript update.
   - **Reuse `'returned'`:** zero migrations. Distinguishability lives in
     the `reason` text (`'Void of SD-XXXXXX'` vs `'Refund — restocked …'`)
     and in the `reference_type` (`'transaction'` vs `'refund'`).
   - **Lean toward reuse.** The two events are both "stock comes back" and
     the reason text already disambiguates. Add `'voided'` only if a
     reporting requirement explicitly needs the column-level filter.

2. **`'reconciliation'` / `'corrected'` adjustment_type for backfill?**
   - The Track A backfill writes "phantom" audit rows for past silent
     mutations. Currently it would have to use `'manual'` with reason
     `'Backfill: missed restoration for SD-XXXXXX'`.
   - **Add:** clean reporting filter ("show me everything the system fixed
     vs. what humans did"). Useful for post-launch hygiene.
   - **Reuse `'manual'`:** searchable via reason; same end result.
   - **Lean toward add.** This is a one-time bulk insert; having a distinct
     type helps differentiate "we discovered drift" from "operator made a
     deliberate correction." If you later want to audit how much drift the
     backfill cleaned up, the type column is the easy filter.

3. **Defense-in-depth aggression — hard abort or warn-and-log?**
   - Option B as proposed is hard-abort: REVOKE the privilege; any direct
     UPDATE fails with a permissions error.
   - Soft variant: keep the privilege, add a `BEFORE UPDATE` trigger that
     `RAISE WARNING` (logs to Postgres logs) but allows the write. Catches
     bypass at observability layer rather than execution layer.
   - **Lean toward hard abort.** Warn-and-log is what we have today
     (silently). The whole point of B is that "the next contributor forgets
     to call the RPC" must be **caught at deploy time, not in a dashboard
     six weeks later**. A permissions error in a code-review smoke test is
     the loudest possible signal.

4. **Online order reference_type — `'order'`+`'order_refund'`, or one combined `'order'`?**
   - One value with `adjustment_type` distinguishing direction (`sold` for
     paid, `returned` for refund) is simpler.
   - Two values gives a stricter mapping (`'order'` always pairs with
     `'sold'`; `'order_refund'` always pairs with `'returned'`/`'damaged'`/
     `'customer_retained'` once the admin orders refund supports
     dispositions, which it currently doesn't).
   - **Lean toward one.** Keep `'order'` only. Direction is conveyed by
     `adjustment_type` already.

5. **Path #10/#11 (initial stock on creation) — write a baseline audit row?**
   - Currently silent for legitimate reasons (the row didn't exist before).
   - Adding a synthetic `'opening_balance'` (or `'manual'` with reason
     `'Initial stock on creation'`) row gives the timeline an anchor and
     simplifies any downstream "compute SUM of audit rows for this product"
     reconciliation.
   - **Lean yes** — write a baseline row when a product is created with
     `quantity_on_hand > 0`. Implementation: at the creation API, call
     `logStockAdjustment` with `adjustment_type='manual'`,
     `quantity_change=initial_qty`, `quantity_before=0`,
     `quantity_after=initial_qty`, `reason='Initial stock on creation'`.

6. **Per-product stock-history UI — a tab on the existing detail page, or a
   route like `/admin/catalog/products/[id]/stock-history`?**
   - Tab is in-context but adds vertical complexity to an already-large
     page.
   - Dedicated route is a cleaner split, more scalable to future inventory
     tabs (cost basis, valuation, vendor history).
   - **Lean toward route.** Mirrors the pattern at
     `/admin/inventory/stock-history` and avoids loading 50-row history on
     every product detail render.

7. **Should the global stock-history page expose a product filter?**
   - Yes. Two-line addition (the API supports it). Independent of #6.

---

## Appendix — Files inspected

### API routes
- `src/app/api/admin/stock-adjustments/route.ts` (manual + Quick Edit drawer entry)
- `src/app/api/admin/purchase-orders/[id]/receive/route.ts` (PO receive)
- `src/app/api/admin/orders/[id]/refund/route.ts` (online refund — silent)
- `src/app/api/pos/transactions/route.ts` (POS sale)
- `src/app/api/pos/transactions/[id]/route.ts` (POS void — Session 42M scope)
- `src/app/api/pos/sync-offline-transaction/route.ts` (offline sale replay)
- `src/app/api/pos/refunds/route.ts` (POS refund — disposition-aware reference)
- `src/app/api/pos/shop-use/route.ts`
- `src/app/api/webhooks/stripe/route.ts` (online order paid — silent)
- `src/app/api/admin/inventory/counts/[id]/commit/route.ts` (RPC dispatcher)
- `src/app/api/admin/inventory/counts/[id]/revert/route.ts` (RPC dispatcher)
- `src/app/api/admin/inventory/counts/[id]/revert-preview/route.ts` (drift detection reader)
- `src/app/api/admin/shop-expenses/export/route.ts` (audit-table reader)
- `src/app/api/migration/products/route.ts` (Square import — initial stock)

### Admin UI
- `src/app/admin/inventory/stock-history/page.tsx` (global log viewer)
- `src/app/admin/catalog/products/page.tsx` (product list + Adjust modal — uses API)
- `src/app/admin/catalog/products/[id]/page.tsx` (full edit form — silent qty mutation)
- `src/app/admin/catalog/products/new/page.tsx` (new product — initial qty)
- `src/app/admin/catalog/products/components/quick-edit-drawer.tsx` (Quick Edit — uses API correctly)
- `src/app/admin/migration/steps/product-step.tsx` (Square import UI driver)

### Library + types
- `src/lib/utils/stock-adjustments.ts` (helper + TS unions)
- `src/lib/utils/constants.ts` (STOCK_ADJUSTMENT_TYPE_LABELS — missing 2 values)
- `src/lib/utils/__tests__/stock-adjustments.test.ts` (helper contract)

### Migrations
- `supabase/migrations/20260211000005_purchase_orders_stock_adjustments.sql` (table creation)
- `supabase/migrations/20260420000001_extend_stock_adjustments.sql` (enum extension: `shop_use`, `customer_retained` + `unit_cost` column)
- `supabase/migrations/20260421000002_create_stock_counts.sql` (`commit_stock_count` RPC + `'stock_count'` reference_type)
- `supabase/migrations/20260424000001_revert_stock_count.sql` (`revert_stock_count` RPC v1)
- `supabase/migrations/20260424000002_revert_stock_count_structured_errors.sql` (`revert_stock_count` RPC v2 — current)
- `supabase/migrations/20260201000035_rls_policies.sql` (products RLS — open to authenticated)

### Predecessor audits
- `docs/audits/VOID_INVENTORY_BUG_SESSION42M.md` (this audit's prompt)
- `docs/audits/REVERT_STOCK_COUNT_SESSION42K.md` (reference RPC pattern)
- `docs/audits/INVENTORY_AUDIT_SESSION34.md`
- `docs/audits/INVENTORY_COUNT_AUDIT_SESSION42C.md`
- `docs/audits/INVENTORY_PREFLIGHT_SESSION37.md`

No code, schema, or migration changes in this commit. Audit doc only.
