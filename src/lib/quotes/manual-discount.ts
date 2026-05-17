/**
 * Item 15g Layer 15g-v — canonical resolver for the manual-discount dollar
 * amount.
 *
 * Extracted from `convert-service.ts` (where it originated in Layer 15g-ii)
 * so it can be imported from contexts that should NOT pull in convert-side
 * dependencies — specifically the modifier-display helper which is
 * consumed by client components (POS quote-detail).
 *
 * `convert-service.ts` re-exports this for backward compatibility.
 *
 * Used by:
 *   1. `quote-service.ts:computeQuoteTotals` — writer-side persisted total.
 *   2. `convert-service.ts:convertQuote` — appointment-side derived total.
 *   3. `modifier-display.ts:resolveQuoteModifierRows` — receipt rendering.
 *
 * Routing all three through the same resolver guarantees the writer, the
 * converter, and every receipt surface compute the same dollar amount for
 * the same `(type, value, subtotal)` triple — the consistency the audit
 * was motivated by.
 */
export function resolveManualDiscountAmount(
  type: 'dollar' | 'percent' | null | undefined,
  value: number | null | undefined,
  subtotal: number
): number | null {
  if (!type || value == null || !(value > 0)) return null;
  if (type === 'dollar') {
    return Math.min(value, subtotal);
  }
  // percent
  const pct = Math.min(value, 100);
  return Math.round(((subtotal * pct) / 100) * 100) / 100;
}
