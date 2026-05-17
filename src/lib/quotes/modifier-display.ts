/**
 * Item 15g Layer 15g-v — shared modifier-row resolution for quote receipt
 * surfaces.
 *
 * The 5 quote-rendering surfaces (public landing page, email HTML, email
 * text, PDF, POS quote-detail) all need to show the same coupon / loyalty /
 * manual-discount breakdown above the Total line. They all read from the
 * persisted columns added in Layer 15g-ii (`coupon_discount`,
 * `loyalty_points_to_redeem`, `loyalty_discount`, `manual_discount_*`).
 *
 * This helper centralizes:
 *   1. The conditional "should this row render" logic (each modifier renders
 *      only when its value is a positive number AND any required pairing
 *      field is present).
 *   2. The manual-discount percent → dollar resolution (delegated to
 *      `resolveManualDiscountAmount` from `convert-service.ts` — the
 *      canonical resolver also used by the writer and the converter).
 *
 * Each surface still builds its own visual representation (Tailwind JSX,
 * HTML, plain text, PDFKit) — the helper just supplies the data.
 */

import { resolveManualDiscountAmount } from './manual-discount';

export interface QuoteModifierSource {
  subtotal: number | string | null | undefined;
  coupon_code?: string | null;
  coupon_discount?: number | string | null;
  loyalty_points_to_redeem?: number | null;
  loyalty_discount?: number | string | null;
  manual_discount_type?: 'dollar' | 'percent' | null;
  manual_discount_value?: number | string | null;
  manual_discount_label?: string | null;
}

export type QuoteModifierKind = 'coupon' | 'loyalty' | 'manual';

export interface QuoteModifierRow {
  kind: QuoteModifierKind;
  /** Human label like "Coupon (SAVE25)", "Loyalty (152 pts)", or the operator's manual-discount label / "Manual discount" fallback. */
  label: string;
  /** Positive dollar amount to display (rendered as "−$X" by callers). */
  amount: number;
}

function isPositiveNumber(v: number | string | null | undefined): boolean {
  if (v == null) return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * Resolve the modifier rows for a single quote. Returns ONLY the rows that
 * should render (each modifier conditionally included). Order is fixed:
 * coupon → loyalty → manual, matching `<QuoteTotals>` (the operator UI
 * reference implementation).
 */
export function resolveQuoteModifierRows(
  source: QuoteModifierSource
): QuoteModifierRow[] {
  const rows: QuoteModifierRow[] = [];

  if (source.coupon_code && isPositiveNumber(source.coupon_discount)) {
    rows.push({
      kind: 'coupon',
      label: `Coupon (${source.coupon_code})`,
      amount: Number(source.coupon_discount),
    });
  }

  // Loyalty row renders when EITHER the points count OR the discount dollar
  // is positive. Points-but-no-discount and discount-but-no-points are both
  // surprising-but-recoverable shapes; render whichever we know.
  if (
    isPositiveNumber(source.loyalty_discount) ||
    isPositiveNumber(source.loyalty_points_to_redeem)
  ) {
    const pts = source.loyalty_points_to_redeem ?? 0;
    rows.push({
      kind: 'loyalty',
      label: pts > 0 ? `Loyalty (${pts} pts)` : 'Loyalty',
      amount: Number(source.loyalty_discount ?? 0),
    });
  }

  const manualDollar = resolveManualDiscountAmount(
    source.manual_discount_type ?? null,
    source.manual_discount_value != null
      ? Number(source.manual_discount_value)
      : null,
    Number(source.subtotal ?? 0) || 0
  );
  if (manualDollar != null && manualDollar > 0) {
    const trimmed = source.manual_discount_label?.trim();
    rows.push({
      kind: 'manual',
      label: trimmed && trimmed.length > 0 ? trimmed : 'Manual discount',
      amount: manualDollar,
    });
  }

  return rows;
}

export function hasQuoteModifierRows(source: QuoteModifierSource): boolean {
  return resolveQuoteModifierRows(source).length > 0;
}
