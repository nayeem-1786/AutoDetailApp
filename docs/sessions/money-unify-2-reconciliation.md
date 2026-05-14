# Phase Money-Unify-2 — Reconciliation Output

> Generated 2026-05-14 from `supabase db query --linked` against the
> `AutoDetailApp` project. All queries reflect the state of the linked
> Supabase project immediately AFTER the migration
> `20260514051953_unify_2_inventory_family_to_cents.sql` was applied,
> BEFORE any caller-code migration. Saved per LOCKED-5 of the
> Unify-2 prompt.

## Pre-migration baseline (from Task 0 verification)

| Table | Total rows | Non-null | Min | Max | Sum |
|---|---|---|---|---|---|
| `purchase_order_items` | 2 | 2 | $7.30 | $11.39 | $18.69 |
| `stock_adjustments` | 271 | 106 | $0.00 | $145.00 | $856.47 |
| `vendors` | 23 | 0 | — | — | — |

**Anomalies pre-migration:** 0 negative values, 0 fractional-cent values
across all 3 tables. Backfill is exact.

## Post-migration reconciliation

### 1. Schema state — new + legacy columns both present

| Table | Column | Type | Nullable |
|---|---|---|---|
| `purchase_order_items` | `unit_cost` | NUMERIC(10,2) | YES (NOT NULL dropped per Decision A1) |
| `purchase_order_items` | `unit_cost_cents` | INTEGER | YES |
| `stock_adjustments` | `unit_cost` | NUMERIC(10,2) | YES |
| `stock_adjustments` | `unit_cost_cents` | INTEGER | YES |
| `vendors` | `min_order_amount` | NUMERIC(10,2) | YES |
| `vendors` | `min_order_amount_cents` | INTEGER | YES |

### 2. New CHECK constraints in place

```
purchase_order_items_unit_cost_cents_check:
  CHECK (((unit_cost_cents IS NULL) OR (unit_cost_cents >= 0)))

stock_adjustments_unit_cost_cents_check:
  CHECK (((unit_cost_cents IS NULL) OR (unit_cost_cents >= 0)))

vendors_min_order_amount_cents_check:
  CHECK (((min_order_amount_cents IS NULL) OR (min_order_amount_cents >= 0)))
```

### 3. SUM equivalence per LOCKED-5

| Table | `SUM(dollars)` | `SUM(cents)` | `ROUND(SUM(dollars)*100)` | divergence_cents |
|---|---|---|---|---|
| `purchase_order_items` | 18.69 | 1869 | 1869 | **0** |
| `stock_adjustments` | 856.47 | 85647 | 85647 | **0** |
| `vendors` | NULL | NULL | NULL | NULL (no rows with values) |

### 4. NULL parity per LOCKED-5

| Table | null_mismatch |
|---|---|
| `purchase_order_items` | **0** |
| `stock_adjustments` | **0** |
| `vendors` | **0** |

### 5. Both-columns row-level match per Requirement 2

| Table | both_columns_mismatch |
|---|---|
| `purchase_order_items` | **0** |
| `stock_adjustments` | **0** |
| `vendors` | **0** |

### 6. `void_transaction()` function verification

| Check | Result |
|---|---|
| Function body references `unit_cost_cents` (new column) | **true** |
| Function body contains `TODO Unify-D` marker | **true** |

## Verdict

**All reconciliation gates pass with zero divergence.** Migration is
correct; caller-code migration may proceed in Task 3.

## Notes for Unify-Final / post-migration audit

- The legacy `unit_cost` / `min_order_amount` columns retain their
  pre-migration values. From the next caller-code commit onward, those
  legacy columns will no longer receive new writes from app code
  (Decision A1). Their values become "frozen" snapshots from the
  pre-Unify-2 era for the duration of the epic.
- The Requirement-2 query asymmetry: a row with `unit_cost_cents` set
  but `unit_cost` NULL is **expected** going forward (those are new
  inserts from migrated app code or from `void_transaction()`). The
  reconciliation query is `AND` on both NOT NULL, so it correctly
  ignores these and only catches *both-set-but-disagreeing* rows.
- Re-run all five queries above before the Unify-Final cleanup
  migration to confirm no drift has accumulated.
