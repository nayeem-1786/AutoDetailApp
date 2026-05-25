/**
 * Issue 33 follow-up UX — shared line-item discount formatter.
 *
 * Single source of truth for the discount predicate, label derivation,
 * and savings arithmetic across all quote and receipt render surfaces.
 *
 * Predicate mirrors the verbatim copy used in the 4 receipt surfaces
 * pre-extraction:
 *   - src/app/(public)/receipt/[token]/page.tsx:230
 *   - src/app/pos/lib/receipt-template.ts:617, 1079
 *   - src/app/api/pos/receipts/email/route.ts:48
 *
 * The defective quote-page predicate at
 * src/app/(public)/quote/[token]/page.tsx:241 (which checked only 'sale')
 * is what motivated this helper. See docs/dev/COMBO_SALE_RENDER_AUDIT.md.
 *
 * Money math: dollars (Option A locked). The 4 receipt surfaces use
 * dollars subtraction today; the helper matches verbatim. When the quotes
 * family is migrated under the Money-Unify epic, this helper migrates with
 * it. See CLAUDE.md Rule 20 and docs/dev/MONEY.md.
 */

export interface LineItemPricingInput {
  unit_price: number;
  standard_price: number | null;
  pricing_type: 'standard' | 'sale' | 'combo' | null;
  quantity?: number;
}

export interface LineItemPricingInfo {
  /** True when a meaningful discount applies (combo or sale with standard_price > unit_price). */
  hasDiscount: boolean;
  /** Discount label ready for display ('Combo' / 'Sale'), null when no discount. */
  label: 'Combo' | 'Sale' | null;
  /** Original (pre-discount) price in dollars, null when no discount. */
  standardPrice: number | null;
  /** Per-unit savings amount in dollars, 0 when no discount. */
  savingsPerUnit: number;
  /** Total line savings (savingsPerUnit × quantity) in dollars, 0 when no discount. */
  totalSavings: number;
}

/**
 * Detect whether a line item has a customer-facing discount, and surface
 * the label + savings figures each render surface needs.
 *
 * `standard` pricing_type with a populated `standard_price` is treated as
 * NO discount — only `combo` and `sale` qualify (defensive: if a future
 * write path sets standard_price on a 'standard' line, we don't accidentally
 * render a strikethrough).
 *
 * Defensive against pathological data:
 *  - null pricing_type → no discount
 *  - null standard_price → no discount
 *  - standard_price <= unit_price → no discount (handles 0-savings rows and
 *    the inverted case where a future bug stores standard_price < unit_price)
 */
export function getLineItemPricingInfo(
  item: LineItemPricingInput,
): LineItemPricingInfo {
  const quantity = item.quantity ?? 1;

  const hasDiscount =
    (item.pricing_type === 'combo' || item.pricing_type === 'sale') &&
    item.standard_price !== null &&
    item.standard_price > item.unit_price;

  if (!hasDiscount) {
    return {
      hasDiscount: false,
      label: null,
      standardPrice: null,
      savingsPerUnit: 0,
      totalSavings: 0,
    };
  }

  const savingsPerUnit = (item.standard_price as number) - item.unit_price;
  return {
    hasDiscount: true,
    label: item.pricing_type === 'combo' ? 'Combo' : 'Sale',
    standardPrice: item.standard_price,
    savingsPerUnit,
    totalSavings: savingsPerUnit * quantity,
  };
}

/**
 * Sum the per-line `totalSavings` across an item array.
 * Returns 0 if no item qualifies as discounted.
 *
 * Used for the "You saved $X" totals row on customer-facing quote
 * surfaces and the "Total saved today: $X" footer on public receipts.
 * Both surfaces hide the row when this returns 0 — never render
 * "You saved $0".
 */
export function sumLineItemSavings(
  items: ReadonlyArray<LineItemPricingInput>,
): number {
  let total = 0;
  for (const item of items) {
    total += getLineItemPricingInfo(item).totalSavings;
  }
  return total;
}
