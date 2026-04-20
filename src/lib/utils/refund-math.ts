/**
 * Refund math — shared between POS refund dialog (client) and /api/pos/refunds (server).
 *
 * CRITICAL INVARIANTS (do not violate without a follow-up audit):
 *
 * 1. Money conversions go through toCents() / fromCents(). Never use
 *    `x * 100` or `x / 100` inline — IEEE 754 artifacts corrupt totals
 *    (e.g. `17.64 * 100 === 1763.9999999999998`).
 *
 * 2. Rounding happens ONCE per line: at the final Math.round() inside
 *    computeRefundLineAmountCents. Intermediate values (per-unit, discount
 *    share) carry fractional cents. Rounding a per-unit value BEFORE
 *    multiplying by quantity is the Session-35 bug that shipped $17.60
 *    instead of $17.64 on a qty-40 line.
 *
 * 3. When multiple refund lines exist and any have a discount, call
 *    distributeResidualCents AFTER computing all line amounts. The sum of
 *    stored line cents MUST equal the computed total refund cents exactly.
 *    Residual ±N cents gets redistributed to the largest-abs lines, one cent
 *    per line.
 *
 * 4. The server recomputes independently and enforces an exact match
 *    (tolerance 0) against client-sent amounts. Any disagreement is a bug,
 *    not a tolerance issue. Both sides must import from this file.
 *
 * Tax convention (verified 2026-04-20, Session 36 Phase 0):
 *   Stored `transaction_items.tax_amount` is computed on the PRE-discount
 *   line subtotal: `Math.round(unit_price * quantity * TAX_RATE * 100) / 100`,
 *   per `src/app/pos/utils/tax.ts:8-11`. Transaction-level discounts (coupon,
 *   loyalty, manual) are subtracted from `subtotal + tax` at the totals
 *   stage (`src/app/pos/utils/tax.ts:23`) and never feed back into per-line
 *   tax_amount. Sale/combo pricing is baked into the stored unit_price at
 *   sale time — not a transaction-level discount.
 *
 *   Therefore the refund formula subtracts `itemDiscountShare` from the
 *   per-line refundable exactly once. If the tax convention ever changes,
 *   re-derive the formula here; do not patch callers.
 */

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

interface PerUnitInput {
  unit_price: number;
  quantity: number;
  tax_amount: number;
  tx_subtotal: number;
  tx_discount_amount: number;
}

/**
 * Returns the per-unit refundable amount in cents, UNROUNDED (may be
 * fractional). Caller multiplies by refund quantity then rounds ONCE via
 * computeRefundLineAmountCents. See invariant 2.
 */
export function computePerUnitRefundableCents(params: PerUnitInput): number {
  const { unit_price, quantity, tax_amount, tx_subtotal, tx_discount_amount } = params;

  if (quantity <= 0) return 0;

  const itemSubtotalCents = toCents(unit_price) * quantity;
  const itemTaxCents = toCents(tax_amount);
  const txSubtotalCents = toCents(tx_subtotal);
  const txDiscountCents = toCents(tx_discount_amount);

  const itemDiscountShare =
    txSubtotalCents > 0
      ? (itemSubtotalCents / txSubtotalCents) * txDiscountCents
      : 0;

  const refundableCents = Math.max(
    0,
    itemSubtotalCents + itemTaxCents - itemDiscountShare
  );

  return refundableCents / quantity;
}

interface LineAmountInput extends PerUnitInput {
  refund_quantity: number;
}

/**
 * Returns the refund line amount in integer cents. Single rounding site for
 * the whole pipeline. See invariant 2.
 */
export function computeRefundLineAmountCents(params: LineAmountInput): number {
  const perUnitCents = computePerUnitRefundableCents(params);
  return Math.round(perUnitCents * params.refund_quantity);
}

interface TotalRefundInput {
  transaction: {
    subtotal: number;
    discount_amount: number;
    tip_amount: number;
  };
  items: Array<{
    unit_price: number;
    quantity: number;
    tax_amount: number;
    refund_quantity: number;
  }>;
  tip_refund: number;
}

export interface TotalRefundResult {
  lineAmountsCents: number[];
  totalCents: number;
}

/**
 * Computes per-line refund amounts and the aggregate total refund in cents.
 * Redistributes any residual cents so the sum of stored line cents equals the
 * computed target exactly. See invariant 3.
 */
export function computeTotalRefundCents(params: TotalRefundInput): TotalRefundResult {
  const { transaction, items, tip_refund } = params;
  const tx = {
    tx_subtotal: transaction.subtotal,
    tx_discount_amount: transaction.discount_amount,
  };

  if (items.length === 0) {
    return { lineAmountsCents: [], totalCents: toCents(tip_refund) };
  }

  // Target total — fractional sum of per-unit × refund_qty, rounded ONCE.
  let totalRefundableCents = 0;
  for (const item of items) {
    const perUnit = computePerUnitRefundableCents({ ...item, ...tx });
    totalRefundableCents += perUnit * item.refund_quantity;
  }
  const targetTotalCents = Math.round(totalRefundableCents);

  // Per-line amounts — each rounded independently.
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

/**
 * Adjusts line amounts by `residual` total cents so their sum equals the
 * original sum + residual. Allocates cents to the lines with the largest
 * absolute amount first (stable: earlier indices win ties). Returns a new
 * array; does not mutate input.
 *
 * When |residual| > lineAmounts.length, multiple cents per line are
 * allocated via a full-sweep pass plus a leftover sweep. This is a
 * defensive guardrail; in practice residual magnitude ≤ items.length.
 */
export function distributeResidualCents(
  lineAmounts: number[],
  residual: number
): number[] {
  const result = lineAmounts.slice();
  if (residual === 0 || result.length === 0) return result;

  const sortedIndices = result
    .map((amount, index) => ({ amount, index }))
    .sort((a, b) => {
      const absDiff = Math.abs(b.amount) - Math.abs(a.amount);
      if (absDiff !== 0) return absDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.index);

  const direction = residual > 0 ? 1 : -1;
  let remaining = Math.abs(residual);

  // Full sweeps (±1 per line) until remaining fits in a single pass.
  while (remaining >= result.length) {
    for (const idx of sortedIndices) result[idx] += direction;
    remaining -= result.length;
  }

  // Leftover: top-|remaining| lines each get one more cent.
  for (let i = 0; i < remaining; i++) {
    result[sortedIndices[i]] += direction;
  }

  return result;
}
