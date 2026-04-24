# Revert Committed Stock Count — Session 42K Audit

**Date:** 2026-04-24
**Scope:** Design the revert path for committed inventory counts. Admin-only feature that undoes the quantity-on-hand changes a committed count applied, writes inverse adjustments to preserve the audit trail, and flips the count header to `cancelled`. Warn if post-commit drift exists; require type-to-confirm.
**Kind:** READ-ONLY design audit. Zero code changes. Drives Session 42K-rewrite.

---

## Executive summary

**Problem.** `stock_counts` supports create / active → review → commit and active → cancel transitions, but no way to reverse a `committed` count once applied. Test data cleanup (Session 42K-diagnostic, 2026-04-24) surfaced this gap — committed test counts leave quantity-on-hand drift with no in-app undo. Root-cause fix: add a proper revert flow.

**Recommended approach.** Mirror the existing `commit_stock_count` RPC pattern with a new `revert_stock_count(p_count_id uuid, p_user_id uuid, p_confirmed_drift boolean)` function. Every committed count has a self-contained ledger of `stock_adjustments` rows with `reference_type='stock_count'`, `reference_id=<count_id>`, `quantity_before`, `quantity_change`, `quantity_after` — enough to reverse atomically without consulting `stock_count_items`. API route mirrors `/commit`. UI reuses the existing `<ConfirmDialog>` shared component with `requireConfirmText={count.section_label}` — no new components, no new primitives.

**Locked product decisions** (per session prompt):
- No time limit on revert eligibility
- New permission `inventory.counts.revert` (separate from `.manage`)
- Warn-and-confirm when post-commit activity touched the same products
- UI surface: count detail page only (no list-page row action)

**Scope of 42K-rewrite:** 1 migration + 2 API routes + 1 page diff + tests. Estimated single coherent session.

---

## Phase 1 — Count detail page

**File:** `src/app/admin/inventory/counts/[id]/page.tsx` (709 lines).

### 1.1 Architecture — single unified layout, not four view blocks

Contrary to the audit-prompt's framing, this page is NOT structured as four separate state-view blocks. It's a **single unified layout** that conditionally renders action buttons + scan bar + review strip based on `count.status`. Layout structure:

```
<PageHeader>
<Status + Info Bar>          ← action buttons live here (right side)
{isReview && <ReviewSummaryStrip>}
{isActive && <ScanBar>}
<FilterBar>
<ItemsTable>                  ← always rendered; columns toggle on isCommitted/canEditQty
{ConfirmDialogs × 3}          ← review, commit, cancel
{isCommitted && <DeferredAuditNote>}
```

### 1.2 Status + Info Bar action-area contents by status (lines 400-435)

| Status | Current buttons | Revert button? |
|---|---|---|
| `active` (401-417) | `Cancel` (outline) + `Move to Review` (primary) | N/A |
| `review` (418-434) | `Cancel` (outline) + `Commit Count` (primary) | N/A |
| `committed` | **empty** | ✅ **This is the home for the Revert button.** |
| `cancelled` | **empty** | — |

The action area is already a flex container (`<div className="flex items-center gap-2">`) inside a card-like strip. Adding `{isCommitted && <RevertButton />}` is a 3-line diff in the same shape as the existing active/review branches.

**Recommended button shape:**

```tsx
{isCommitted && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => setRevertOpen(true)}
    disabled={acting || !canRevert}
  >
    <Undo2 className="h-4 w-4 text-red-500" />
    Revert Count
  </Button>
)}
```

Icon: `Undo2` (lucide). Variant: `outline` (matches existing destructive-intent buttons on this page like Cancel — which also uses `variant="outline"` with a red-tinted icon, not `variant="destructive"`). Destructive intent lives in the ConfirmDialog itself, not the trigger.

### 1.3 Permission hook — NOT currently imported on this page

The page has **no permission hook import**. Permissions are enforced at the API layer only (via `requirePermission(employee.id, 'inventory.counts.manage')` — see `commit/route.ts:24`). For the revert button to conditionally render, the page needs to add `usePermission`:

```tsx
import { usePermission } from '@/lib/hooks/use-permission';
// ...inside component:
const { granted: canRevert } = usePermission('inventory.counts.revert');
```

Pattern confirmed at `src/app/admin/inventory/counts/page.tsx:71`:
```ts
const { granted: canManage } = usePermission('inventory.counts.manage');
```
Same hook works here. No new hook author work needed.

### 1.4 Cancelled-view informativeness

Current cancelled rendering (lines 391-397) — inside the Status + Info Bar:

```tsx
{isCancelled && count.cancelled_at && (
  <span>
    • Cancelled by{' '}
    <span className="font-medium">{employeeName(count.cancelled_by_employee)}</span>{' '}
    on {formatDateTime(count.cancelled_at)}
  </span>
)}
```

Displays `cancelled_by` + `cancelled_at`. **Does NOT display `notes`** — even though the schema has a `notes` column (line 21 of migration 20260421000002). The revert flow should ideally append a note like `"Reverted 2026-04-24. 5 drifted products at revert time: A, B, C..."` so future auditors can see the drift context that led to revert. To surface this, either:

- **(a) Revert RPC writes to `notes`** (append-style) + cancelled view renders notes.
- **(b) Revert RPC writes to `notes`** + separate audit-log row (cleaner but adds a second paper trail).

**Recommend (a).** The notes field is already there and already persists for the life of the count. The cancelled view should be extended to render `count.notes` below the cancelled-by line:

```tsx
{isCancelled && count.notes && (
  <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{count.notes}</p>
)}
```

That's a 3-line Phase 1 edit alongside the button addition.

### 1.5 ConfirmDialog pattern already in use on this page

Lines 99-101 declare three local booleans (`reviewOpen`, `commitOpen`, `cancelOpen`) each wired to a `<ConfirmDialog>`. The commit confirm dialog at 639-686 demonstrates the rich-description pattern (JSX with top-5 variances) that the revert flow should mirror for its drift preview.

Revert adds a fourth: `revertOpen` + `revertPreview` state + `<ConfirmDialog>` block. Zero refactor of existing confirms.

---

## Phase 2 — Permission system

### 2.1 Existing `inventory.*` permission slots

From `supabase/migrations/20260211000007_roles_permissions_foundation.sql:121-127` and `20260421000002_create_stock_counts.sql:201-214`:

| sort_order | key | super_admin | admin | cashier | detailer |
|---|---|---|---|---|---|
| 500 | `inventory.view_stock` | ✅ | ✅ | ✅ | ❌ |
| 501 | `inventory.adjust_stock` | ✅ | ✅ | ❌ | ❌ |
| 502 | `inventory.manage_po` | ✅ | ✅ | ❌ | ❌ |
| 503 | `inventory.receive` | ✅ | ✅ | ✅ | ❌ |
| 504 | `inventory.view_costs` | ✅ | ✅ | ❌ | ❌ |
| 505 | `inventory.view_cost_data` (legacy) | ✅ | ✅ | ❌ | ❌ |
| 506 | `inventory.manage_vendors` | ✅ | ✅ | ❌ | ❌ |
| 507 | `inventory.counts.manage` | ✅ | ✅ | ❌ | ❌ |

**sort_order 508 is free.** Confirmed for `inventory.counts.revert`.

### 2.2 Seed pattern (quoted from `20260421000002_create_stock_counts.sql:201-215`)

```sql
INSERT INTO permission_definitions (key, name, description, category, sort_order)
VALUES (
  'inventory.counts.manage',
  'Manage Inventory Counts',
  'Start, edit, commit, and cancel inventory count sessions',
  'Inventory',
  507
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (permission_key, role, role_id, granted)
SELECT 'inventory.counts.manage', r.name::user_role, r.id,
  CASE WHEN r.name IN ('super_admin', 'admin') THEN true ELSE false END
FROM roles r
ON CONFLICT (permission_key, role) DO NOTHING;
```

The `FROM roles r` pattern handles custom roles too — any role not in the `CASE` defaults to `false`.

### 2.3 Recommended role defaults for `inventory.counts.revert`

⚠️ **Role-name clarification:** The prompt uses `owner` + `manager` language which doesn't map to this codebase. Actual roles: `super_admin`, `admin`, `cashier`, `detailer`. Mapping the intent:

- `super_admin` → `true` (highest-trust role, always gets destructive powers)
- `admin` → **decision point** (see Phase 8 Open Q-A)
- `cashier` → `false`
- `detailer` → `false`

**Lean: admin = true.** Admin already has `inventory.counts.manage=true` (can commit), and revert is the inverse of commit. Granting to admin keeps the mental model simple: admin = full inventory-count lifecycle control. If the reviewer wants higher bar, `super_admin` only is also reasonable and has precedent with no inventory.* perm currently being super-admin-only.

### 2.4 API route pattern (for enforcement)

Per `src/app/api/admin/inventory/counts/[id]/commit/route.ts:8, 24`:

```ts
const PERMISSION_KEY = 'inventory.counts.manage';
// ...
const denied = await requirePermission(employee.id, PERMISSION_KEY);
if (denied) return denied;
```

For revert routes, swap `PERMISSION_KEY` to `'inventory.counts.revert'`. Same pattern otherwise. Confirmed also by `/transition`, `/cancel`, `/items`, `/[id]`, `/route.ts` all using the same pattern.

---

## Phase 3 — Backend approach: `revert_stock_count` RPC

### 3.1 Reference implementation — `commit_stock_count` contract

From `supabase/migrations/20260421000002_create_stock_counts.sql:103-187`:

```sql
CREATE OR REPLACE FUNCTION commit_stock_count(
  p_count_id UUID,
  p_employee_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_delta INTEGER;
  v_new_qty INTEGER;
  v_adjustment_count INTEGER := 0;
BEGIN
  SELECT * INTO v_count
  FROM stock_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Count not found';
  END IF;

  IF v_count.status NOT IN ('active', 'review') THEN
    RAISE EXCEPTION 'Count not in committable status: %', v_count.status;
  END IF;

  FOR v_item IN
    SELECT sci.*, p.quantity_on_hand AS live_qty
    FROM stock_count_items sci
    JOIN products p ON p.id = sci.product_id
    WHERE sci.stock_count_id = p_count_id
    FOR UPDATE OF p
  LOOP
    v_delta := v_item.counted_qty - v_item.expected_qty;
    v_new_qty := v_item.live_qty + v_delta;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'Commit would set negative quantity for product %', v_item.product_id;
    END IF;

    IF v_delta <> 0 THEN
      UPDATE products SET quantity_on_hand = v_new_qty WHERE id = v_item.product_id;

      INSERT INTO stock_adjustments (
        product_id, adjustment_type, quantity_change, quantity_before, quantity_after,
        reason, reference_type, reference_id, created_by
      ) VALUES (
        v_item.product_id, 'recount', v_delta, v_item.live_qty, v_new_qty,
        'Stock count: ' || COALESCE(v_count.section_label, 'full store'),
        'stock_count', p_count_id, p_employee_id
      );

      v_adjustment_count := v_adjustment_count + 1;
    END IF;
  END LOOP;

  UPDATE stock_counts
  SET status = 'committed', committed_by = p_employee_id, committed_at = now()
  WHERE id = p_count_id;

  RETURN jsonb_build_object('count_id', p_count_id, 'adjustments_created', v_adjustment_count);
END;
$$;

GRANT EXECUTE ON FUNCTION commit_stock_count(UUID, UUID) TO authenticated;
```

Pattern highlights the revert RPC should mirror:
- `LANGUAGE plpgsql SECURITY DEFINER` — no explicit `SET search_path` (matches project convention, though this is arguably a minor security-hardening gap — out of scope for 42K)
- `FOR UPDATE` on the count header (row-lock it for the duration)
- `FOR UPDATE OF p` inside the loop cursor (serializes with POS sales that also `SELECT ... FROM products FOR UPDATE` — preventing race conditions where a sale reads old qty between the loop read and update)
- Negative-qty guard: `RAISE EXCEPTION` aborts the whole tx (Postgres implicit rollback)
- Skip zero-delta items (avoids audit-log noise)
- Returns structured JSONB

### 3.2 Proposed `revert_stock_count` RPC

```sql
CREATE OR REPLACE FUNCTION revert_stock_count(
  p_count_id UUID,
  p_user_id UUID,
  p_confirmed_drift BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count RECORD;
  v_adj RECORD;
  v_reverse_qty INTEGER;
  v_reversals_created INTEGER := 0;
  v_drift_count INTEGER := 0;
  v_drift_products INTEGER := 0;
  v_section_label TEXT;
BEGIN
  -- 1. Lock count header and verify status
  SELECT * INTO v_count
  FROM stock_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'Count not found';
  END IF;

  IF v_count.status <> 'committed' THEN
    RAISE EXCEPTION 'Count not in revertable status: %', v_count.status;
  END IF;

  v_section_label := COALESCE(v_count.section_label, 'full store');

  -- 2. Detect drift (same shape as preview endpoint)
  SELECT COUNT(*), COUNT(DISTINCT sa2.product_id)
    INTO v_drift_count, v_drift_products
  FROM stock_adjustments sa2
  WHERE sa2.product_id IN (
          SELECT DISTINCT product_id
          FROM stock_adjustments
          WHERE reference_type = 'stock_count'
            AND reference_id = p_count_id
            AND reason NOT LIKE 'Reversal of%'
        )
    AND sa2.created_at > v_count.committed_at
    AND sa2.reference_type IS DISTINCT FROM 'stock_count';

  IF v_drift_count > 0 AND NOT p_confirmed_drift THEN
    RAISE EXCEPTION 'Drift detected: % adjustment(s) on % product(s) since commit — confirm to proceed',
      v_drift_count, v_drift_products;
  END IF;

  -- 3. Loop over the count's adjustment rows, write inverses
  FOR v_adj IN
    SELECT sa.*, p.quantity_on_hand AS live_qty
    FROM stock_adjustments sa
    JOIN products p ON p.id = sa.product_id
    WHERE sa.reference_type = 'stock_count'
      AND sa.reference_id = p_count_id
      AND sa.reason NOT LIKE 'Reversal of%'
    FOR UPDATE OF p
  LOOP
    v_reverse_qty := v_adj.live_qty - v_adj.quantity_change;

    IF v_reverse_qty < 0 THEN
      RAISE EXCEPTION 'Revert would set negative quantity for product %', v_adj.product_id;
    END IF;

    UPDATE products SET quantity_on_hand = v_reverse_qty WHERE id = v_adj.product_id;

    INSERT INTO stock_adjustments (
      product_id, adjustment_type, quantity_change, quantity_before, quantity_after,
      reason, reference_type, reference_id, created_by
    ) VALUES (
      v_adj.product_id, 'recount', -v_adj.quantity_change, v_adj.live_qty, v_reverse_qty,
      'Reversal of stock count: ' || v_section_label,
      'stock_count', p_count_id, p_user_id
    );

    v_reversals_created := v_reversals_created + 1;
  END LOOP;

  -- 4. Flip header to cancelled + append drift context to notes
  UPDATE stock_counts
  SET
    status = 'cancelled',
    cancelled_by = p_user_id,
    cancelled_at = now(),
    notes = COALESCE(notes || E'\n\n', '') ||
            'Reverted ' || to_char(now(), 'YYYY-MM-DD HH24:MI TZ') ||
            '. ' || v_reversals_created || ' adjustment(s) inversed' ||
            CASE WHEN v_drift_count > 0
                 THEN '. Drift acknowledged: ' || v_drift_count || ' non-count adjustment(s) on '
                      || v_drift_products || ' product(s) since commit.'
                 ELSE '.'
            END
  WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'count_id', p_count_id,
    'reversals_created', v_reversals_created,
    'drift_count', v_drift_count,
    'drift_products', v_drift_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION revert_stock_count(UUID, UUID, BOOLEAN) TO authenticated;
```

Key design choices:
- **Doesn't read `stock_count_items`.** Everything needed is in `stock_adjustments` (`quantity_change`, `product_id`, filtering via `reference_type='stock_count' AND reference_id=p_count_id`). Self-contained ledger.
- **`reason LIKE 'Reversal of%'` exclusion** — defensive against a hypothetical already-reverted count; also used in the drift query for consistency. Even though the status check should prevent double-revert, the LIKE filter hardens the math.
- **Drift detection inline in the RPC** — redundant with the preview endpoint's query but **intentionally duplicated**. The preview is advisory (shown to user). The RPC check is authoritative (prevents TOCTOU race where drift appears between preview and confirm). Same query shape in both; the RPC is the final gate.
- **`adjustment_type='recount'`** for the reverse row — reusing the same type as the original. An alternative would be a new `'revert'` type, but that would require extending the CHECK constraint. Not needed — `recount` + `reason='Reversal of...'` captures the intent readably.
- **Negative-quantity guard** — if drift has pushed quantity below what the reversal would remove, we abort. Rare but possible: e.g., count increased widget by +5, then sold 10 widgets post-commit leaving 0, now revert wants to subtract 5 → would go to -5. Abort with clear error.

### 3.3 API route — how to call the RPC

Pattern from `src/app/api/admin/inventory/counts/[id]/commit/route.ts:30-33`:

```ts
const { data: rpcResult, error: rpcErr } = await admin.rpc('commit_stock_count', {
  p_count_id: countId,
  p_employee_id: employee.id,
});
```

For revert:

```ts
const { data: rpcResult, error: rpcErr } = await admin.rpc('revert_stock_count', {
  p_count_id: countId,
  p_user_id: employee.id,
  p_confirmed_drift: body.confirmed_drift === true,
});
```

Error mapping (mirror the `/commit` pattern at lines 35-57):

| RPC message contains | HTTP | Client handling |
|---|---|---|
| `'Count not found'` | 404 | Toast + router.push back to list |
| `'not in revertable status'` | 409 | Toast "Count is already cancelled" |
| `'Drift detected'` | 400 (with `drift_count`, `drift_products` parsed from msg if possible) | Client re-POSTs with `confirmed_drift: true` |
| `'Revert would set negative quantity'` | 400 (with `product_id`) | Toast with product name (fetched client-side) |
| anything else | 500 | Generic toast |

### 3.4 Two API routes needed

1. **`GET /api/admin/inventory/counts/[id]/revert-preview`** — returns drift stats + top-5 drifted products. Read-only; safe to call repeatedly.
2. **`POST /api/admin/inventory/counts/[id]/revert`** — calls the RPC. Body: `{ confirmed_drift: boolean }`.

Both gated on `inventory.counts.revert` permission + `FEATURE_FLAGS.INVENTORY_MANAGEMENT` + `getEmployeeFromSession`.

---

## Phase 4 — Drift detection

### 4.1 Preview query (for `GET /revert-preview`)

Shape validated against the prompt's draft. Recommended final form:

```sql
-- Part A: summary counts
WITH affected_products AS (
  SELECT DISTINCT product_id
  FROM stock_adjustments
  WHERE reference_type = 'stock_count'
    AND reference_id = $1
    AND reason NOT LIKE 'Reversal of%'
),
count_header AS (
  SELECT committed_at FROM stock_counts WHERE id = $1
),
drift AS (
  SELECT sa2.*
  FROM stock_adjustments sa2
  WHERE sa2.product_id IN (SELECT product_id FROM affected_products)
    AND sa2.created_at > (SELECT committed_at FROM count_header)
    AND sa2.reference_type IS DISTINCT FROM 'stock_count'
)
SELECT
  COUNT(*)                          AS drift_adjustments,
  COUNT(DISTINCT product_id)        AS drifted_products,
  (SELECT COUNT(*) FROM affected_products) AS original_products
FROM drift;

-- Part B: top-5 drifted products for the modal display
SELECT
  p.id                   AS product_id,
  p.name                 AS product_name,
  p.sku,
  COUNT(sa2.id)          AS adjustment_count,
  SUM(sa2.quantity_change) AS net_change
FROM stock_adjustments sa2
JOIN products p ON p.id = sa2.product_id
WHERE sa2.product_id IN (
        SELECT DISTINCT product_id
        FROM stock_adjustments
        WHERE reference_type = 'stock_count'
          AND reference_id = $1
          AND reason NOT LIKE 'Reversal of%'
      )
  AND sa2.created_at > (SELECT committed_at FROM stock_counts WHERE id = $1)
  AND sa2.reference_type IS DISTINCT FROM 'stock_count'
GROUP BY p.id, p.name, p.sku
ORDER BY COUNT(sa2.id) DESC
LIMIT 5;
```

Return shape:
```ts
{
  count: { id, section_label, committed_at },
  drift: {
    adjustments: number,         // total drift rows
    products: number,            // distinct products with drift
    original_products: number,   // products the count originally touched
    top_drifted: [
      { product_id, product_name, sku, adjustment_count, net_change }
    ]
  }
}
```

### 4.2 Clean-vs-drifted split

Client renders based on `drift.adjustments`:

- **`adjustments === 0`** → clean revert. Modal description says: *"This will reverse N inventory adjustments written when this count committed. Quantities will return to their pre-commit values."* No warning block, confirm phrase still required.
- **`adjustments > 0`** → drifted revert. Modal shows an amber warning block (mirroring the pattern at `counts/[id]/page.tsx:440-454` for the review summary strip) with:
  - Prominent text: *"⚠️ {drift.adjustments} adjustment(s) on {drift.products} product(s) since this count committed."*
  - List of top-5 drifted products with their net change since commit.
  - Explainer: *"Reverting will restore the pre-commit quantities, undoing the subsequent changes. This may result in quantities inconsistent with actual physical stock."*
  - Confirm phrase still required.

### 4.3 Reversal pattern exclusion — no existing precedent to migrate

`grep 'Reversal of|Reversed ' src/` → **zero matches.** No prior reversal convention exists. The `'Reversal of stock count: <section_label>'` reason string this audit proposes establishes the convention. Future reversal surfaces (if any) should follow the same `Reversal of <thing>: <identifier>` prefix so the `NOT LIKE 'Reversal of%'` filter remains correct.

### 4.4 Automated/background inserts — none

`grep stock_adjustments src/app/api/cron/` → **zero matches.** All `stock_adjustments` inserts are user-triggered (POS sale/refund/shop-use, PO receive, admin CRUD, commit RPC). Drift detection does NOT need to exclude any automated types. The `reference_type IS DISTINCT FROM 'stock_count'` filter is sufficient.

### 4.5 Stale TypeScript type to flag

`src/lib/utils/stock-adjustments.ts:13-18`:

```ts
export type ReferenceType =
  | 'purchase_order'
  | 'transaction'
  | 'refund'
  | 'shop_use'
  | null;
```

**Missing `'stock_count'`.** The DB CHECK constraint (migration 20260421000002:93-97) allows `'stock_count'`, but the TS type doesn't. Irrelevant to the RPC path (SQL-level writes don't use this helper), but relevant if any future app code wants to write `stock_count`-typed rows via `logStockAdjustment`. **Recommend 42K-rewrite fixes this type drift as a one-line amendment.** Not blocking.

---

## Phase 5 — UI flow (already resolved)

Per the amendment investigation (earlier in this session):

### 5.1 Shared component — already exists

`src/components/ui/confirm-dialog.tsx` exports `<ConfirmDialog>` with the full type-to-confirm pattern built in:

```ts
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;           // accepts JSX → drift warning block fits here
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';    // red confirm button
  loading?: boolean;
  onConfirm: () => void;
  requireConfirmText?: string;            // type-to-enable
}
```

Precedent: `src/app/admin/settings/data-management/page.tsx:345-355` uses `requireConfirmText="PURGE"` for customer purge. `src/app/admin/customers/[id]/page.tsx:2044` uses `requireConfirmText={customer?.first_name || ''}` for archive (dynamic, matches the specific customer).

**No new shared components. No data-management refactor.** The revert flow is a pure consumer.

### 5.2 Revert modal shape

```tsx
<ConfirmDialog
  open={revertOpen}
  onOpenChange={setRevertOpen}
  title="Revert Inventory Count"
  description={<RevertDescription count={count} preview={revertPreview} />}
  confirmLabel="Revert Count"
  variant="destructive"
  loading={reverting}
  requireConfirmText={count.section_label || count.id.slice(0, 8)}
  onConfirm={handleRevert}
/>
```

`<RevertDescription>` is a **local component** (not shared) that renders either the clean-revert text or the drifted-revert warning block based on `preview.drift.adjustments`. Scoped to this file; no extraction.

### 5.3 Confirmation phrase — locked to `count.section_label`

Per user decision in the amendment exchange: use `count.section_label`, fallback to `count.id.slice(0, 8)` if null (e.g., "full store" counts). Matches the customer-archive precedent of forcing the admin to read and type the identifier of the thing being acted on.

### 5.4 Preview fetch timing

`useEffect` on modal `open` flip:

```tsx
useEffect(() => {
  if (!revertOpen) return;
  adminFetch(`/api/admin/inventory/counts/${countId}/revert-preview`)
    .then((r) => r.json())
    .then(setRevertPreview);
}, [revertOpen, countId]);
```

Preview is fetched fresh every time the dialog opens. Stale data isn't a safety concern because the RPC re-checks drift authoritatively before applying.

### 5.5 Post-success behavior

Per user's Phase 8 lean: **stay on detail page, show toast, refresh data.** `handleRevert` calls `loadCount()` after success, so the page re-renders with `status='cancelled'` + the new note line. No redirect needed.

---

## Phase 6 — Test plan

### 6.1 RPC integration tests (DB-backed, not pure unit)

| # | Scenario | Expected |
|---|---|---|
| R1 | Revert clean count (no drift) | Quantities restored to pre-commit values. 1 inverse `stock_adjustments` row per original. Header: `status='cancelled'`, `cancelled_by=<user>`, `cancelled_at=now()`, `notes` contains "Reverted YYYY-MM-DD...". RPC returns `{reversals_created: N, drift_count: 0, drift_products: 0}`. |
| R2 | Revert with drift + `p_confirmed_drift=true` | Same as R1 but `notes` also contains "Drift acknowledged: X non-count adjustment(s) on Y product(s)". |
| R3 | Revert with drift + `p_confirmed_drift=false` | `RAISE EXCEPTION 'Drift detected: ...'`. No quantities touched. No rows inserted. Header unchanged. |
| R4 | Concurrent POS sale race | Transaction A (revert) and Transaction B (POS sale on affected product) start concurrently. Product's `FOR UPDATE` lock serializes. Whichever commits first wins; the other sees fresh qty and either completes safely or aborts with negative-qty if applicable. No deadlock. No lost update. |
| R5 | Already-cancelled count | `RAISE EXCEPTION 'Count not in revertable status: cancelled'`. No-op. |
| R6 | Non-existent count id | `RAISE EXCEPTION 'Count not found'`. |
| R7 | Revert that would cause negative qty | e.g., count +5 committed, then 10 units sold post-commit (qty=0 or less), revert requires -5 which would underflow → `RAISE EXCEPTION 'Revert would set negative quantity for product <uuid>'`. |
| R8 | Revert a count with zero-delta items only | Edge case: commit skipped all items (all at expected qty), so no `stock_adjustments` rows exist with this count's reference_id. Loop does nothing; `reversals_created=0`; header still flips to cancelled. Valid scenario. |

### 6.2 API route tests

| # | Scenario | Expected |
|---|---|---|
| A1 | Unauthenticated POST /revert | 401 |
| A2 | Authenticated w/o `inventory.counts.revert` | 403 |
| A3 | `INVENTORY_MANAGEMENT` feature flag disabled | 403 |
| A4 | Valid POST on clean count | 200 `{count, reversals_created, drift_count: 0}` |
| A5 | Valid POST on drifted count w/o `confirmed_drift` | 400 `{error: "Drift detected: ..."}` — message parseable to show counts |
| A6 | Valid POST on drifted count w/ `confirmed_drift: true` | 200 (same as A4 but with drift counts populated) |
| A7 | GET /revert-preview on clean count | 200 `{drift: {adjustments: 0, products: 0, top_drifted: []}}` |
| A8 | GET /revert-preview on drifted count | 200 with populated `drift` + `top_drifted` |
| A9 | GET /revert-preview on non-committed count | 409 or 200 with a flag — **reviewer decision**. Lean: 200 with `{count.status}` so the client shows "Revert only applies to committed counts." |
| A10 | POST /revert on non-existent count | 404 |

### 6.3 UI behavior tests (component-level, vitest + RTL)

| # | Scenario | Expected |
|---|---|---|
| U1 | Committed count, no revert permission | Revert button NOT rendered |
| U2 | Committed count, has permission | Revert button rendered, enabled |
| U3 | Non-committed count (active/review/cancelled) | Revert button NOT rendered regardless of permission |
| U4 | Click Revert → modal opens, fetches preview | Loading spinner shown until preview returns |
| U5 | Preview returns drift=0 | Clean-revert copy rendered, no warning block |
| U6 | Preview returns drift>0 | Amber warning block rendered with top-5 list |
| U7 | Confirm button disabled until phrase typed | Button renders disabled; typing exact match enables |
| U8 | Type partial phrase, then backspace | Button re-disables |
| U9 | Type phrase + press Enter | Submits (useEnterSubmit pattern) |
| U10 | Successful revert | Toast success, modal closes, page refreshes to cancelled view |
| U11 | Revert fails with drift error | Inline error shown, modal stays open with confirm disabled |
| U12 | Modal Cancel button | Closes modal, no API call |

### 6.4 Test infrastructure notes

- RPC tests (R1-R8) require a live Postgres — run via the migration's local supabase stack or a dedicated Vitest integration-test config. Current project does not appear to have an integration test runner; **may need a new vitest config** or fall back to E2E-style testing via Playwright (not currently set up either). **Flag for reviewer: is DB-backed testing in scope for 42K-rewrite, or defer to manual smoke tests?**
- API route tests can use the existing Vitest setup with Supabase mocked (or the real `createAdminClient` against a test DB).
- UI tests fit the existing pattern at `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx` which already mocks `useBarcodeScanner` and `adminFetch`.

---

## Phase 7 — Migration sequencing

### 7.1 Recommended order (no broken-build windows)

| Step | Artifact | Dependency |
|---|---|---|
| 1 | Migration file: `supabase/migrations/20260424XXXXXX_revert_stock_count.sql` — seeds `inventory.counts.revert` permission + role grants + `revert_stock_count` RPC | None. Applied manually in Supabase SQL Editor. Inert until app code calls it. |
| 2 | API routes: `POST /api/admin/inventory/counts/[id]/revert` + `GET /api/admin/inventory/counts/[id]/revert-preview` | Step 1 (RPC must exist). |
| 3 | Page diff: `src/app/admin/inventory/counts/[id]/page.tsx` — add button, modal, preview fetch, revert handler, import `usePermission`, display `notes` on cancelled view | Step 2 (routes must exist). |
| 4 | Stock-adjustments TypeScript type fix: add `'stock_count'` to `ReferenceType` in `src/lib/utils/stock-adjustments.ts` | Independent cosmetic fix; include in same commit for coherence. |
| 5 | Tests — RPC (if in scope), API route, UI | Steps 1-3. |
| 6 | CHANGELOG + FILE_TREE.md updates | End. |

### 7.2 Migration-before-app-deploy is safe

The migration is purely additive:
- New permission row (ignored if app doesn't reference it)
- New RPC function (ignored if nothing calls it)
- No schema changes to existing tables
- No behavior change for existing code paths

Applying the migration first, then deploying the app code second, means **no broken-build window.** If the app deploy fails or is rolled back, the DB is still consistent — the RPC is just unused.

### 7.3 Rollback path

- Migration rollback: `DROP FUNCTION revert_stock_count(UUID, UUID, BOOLEAN); DELETE FROM permission_definitions WHERE key = 'inventory.counts.revert'; DELETE FROM permissions WHERE permission_key = 'inventory.counts.revert';` — reversible without data loss.
- App rollback: `git revert` the page + API route commit. The DB function remains but nothing calls it. Safe.

### 7.4 Recommended single-commit structure

Similar to Session 42F-migration: all changes in one atomic commit. Commit message: `feat(inventory): revert committed stock count (Session 42K-rewrite)`.

---

## Phase 8 — Open questions for reviewer

### Q-A. `admin` role default — grant `inventory.counts.revert` or super_admin only?

Current `inventory.counts.manage` grants to super_admin + admin. Reverting is the inverse operation of commit. Options:

- **(a) Grant to admin (matches `.manage` distribution).** Mental model: admin = full inventory-count lifecycle. Reviewer's prompt leans this way ("owner=true, manager=true").
- **(b) Super_admin only.** Higher bar for destructive action. Forces admin to request super_admin to revert.

**My lean: (a).** Admin already performs arguably higher-trust ops (archive customer, purge customer data). Adding revert to admin's toolkit matches the mental model; existing RBAC settings UI lets the owner tighten if they prefer.

### Q-B. RPC function name: `revert_stock_count` vs `cancel_committed_stock_count`

- `revert_stock_count` — matches UI verb ("Revert Count" button).
- `cancel_committed_stock_count` — distinguishes from `/cancel` which cancels active counts. But long, and the end-state IS `status='cancelled'` so there's no real confusion.

**My lean: `revert_stock_count`.** Matches UI verb, shorter, clear.

### Q-C. API path: `/revert` vs `/cancel`

- `/revert` — distinct new endpoint.
- Reuse `/cancel` — conditional on status.

**My lean: `/revert`.** `/cancel` today expects `status IN ('active', 'review')` and is permissioned on `inventory.counts.manage`. Revert needs different status + different permission. Conflating them risks an auth/status logic bug. Separate endpoints = separate concerns.

### Q-D. List page filter semantics after revert

After revert, `status='cancelled'`. Options for the list page (`src/app/admin/inventory/counts/page.tsx`):

- **(a) Only in "cancelled" filter.** Status truly is cancelled.
- **(b) Tagged separately as "reverted."** Would require a new status value ('reverted') and CHECK constraint change — more invasive.

**My lean: (a).** Keep the schema. "Cancelled" now means either "cancelled before commit" or "reverted after commit" — distinguishable by whether `committed_at` is populated. The list page UI can show a small badge "reverted" on rows where `committed_at IS NOT NULL AND status='cancelled'` if the reviewer wants visual distinction — that's a cosmetic follow-up, not a 42K blocker.

### Q-E. Post-success UX: redirect or stay?

- **Stay on detail page** + refresh data + toast. User sees the count flip to cancelled state with the new notes line.
- **Redirect to list** + toast. Keeps the list page as the "home" for counts.

**My lean: stay on detail page.** Immediate feedback that the revert worked — status badge flips, cancelled-by metadata appears, drift notes visible. Matches `handleMoveToReview` / `handleCommit` which also `loadCount()` + stay.

### Q-F. RPC DB-backed tests — in scope?

The test plan (Phase 6.1) includes 8 RPC scenarios that require a live Postgres instance. Current project doesn't have an integration-test runner configured. Options:

- **(a) Add a DB-backed Vitest integration config** + write R1-R8. Extra setup cost but correct engineering.
- **(b) Defer to manual smoke tests** documented in CHANGELOG. Fast; relies on human diligence.
- **(c) Add just the API-layer tests (Phase 6.2)** which can use Supabase mocks. Skip the RPC-internal scenarios.

**My lean: (b) + (c).** API-route tests via mocks give coverage of the error mapping and happy path; RPC internals are tight SQL that's worth reviewing carefully at migration time but not worth building a DB test harness for one function. Document the R1-R8 scenarios as manual smoke-test checklist in the CHANGELOG.

### Q-G. Stale `ReferenceType` TypeScript fix — include or defer?

`src/lib/utils/stock-adjustments.ts:13-18` is missing `'stock_count'` from the `ReferenceType` union. Not required for the revert RPC path (SQL-level writes), but needed if any future app code wants to write stock_count-typed rows through `logStockAdjustment`.

**My lean: include as a one-line amendment in the 42K-rewrite commit.** Zero risk, trivial fix, aligns the type with the DB CHECK constraint. If kept separate, it's a loose-end that'll decay.

### Q-H. `count.notes` rendering for ALL status values (not just cancelled)?

Phase 1.4 proposes rendering `count.notes` on the cancelled view. But `stock_counts.notes` is a first-class column usable in any status (active/review/committed/cancelled). Currently nothing in the app displays this column. Options:

- **(a) Render `notes` unconditionally** (one line below status bar if present) — simplest, consistent.
- **(b) Render `notes` only on cancelled** — scoped to the revert story's needs, doesn't expand scope.

**My lean: (a).** More useful + tiny UI addition. But (b) is narrower and stays strictly in scope. Reviewer's call.

---

## Scope summary for Session 42K-rewrite

**Files to create (1):**
- `supabase/migrations/20260424XXXXXX_revert_stock_count.sql` (permission + RPC + GRANT)

**Files to modify (4):**
- `src/app/admin/inventory/counts/[id]/page.tsx` — revert button + modal + preview fetch + notes display
- `src/lib/utils/stock-adjustments.ts` — add `'stock_count'` to `ReferenceType` (pending Q-G)
- `docs/CHANGELOG.md`
- `docs/dev/FILE_TREE.md` (if new API routes land)

**Files to add (2 API routes + tests):**
- `src/app/api/admin/inventory/counts/[id]/revert/route.ts` (POST)
- `src/app/api/admin/inventory/counts/[id]/revert-preview/route.ts` (GET)
- `src/app/api/admin/inventory/counts/[id]/__tests__/*` (tests pending Q-F scope)

**Files NOT touched:**
- `src/components/ui/confirm-dialog.tsx` — already has `requireConfirmText` (no extraction needed)
- `src/app/admin/settings/data-management/page.tsx` — already consumes ConfirmDialog correctly (no refactor needed)
- All other existing counts routes (`/commit`, `/cancel`, `/transition`, `/items`, `/[id]`, `/route.ts`) — unchanged
- `commit_stock_count` RPC — unchanged

Estimated size: one coherent session, ~400-600 lines of code + tests + docs.

---

**End of audit. Ready for 42K-rewrite on reviewer decisions for Q-A through Q-H.**
