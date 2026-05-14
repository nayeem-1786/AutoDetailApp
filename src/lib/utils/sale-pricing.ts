// Sale pricing utilities — single source of truth for sale status + display logic.
// Money-Unify-3: helpers operate on integer cents. Inputs typed as `number`
// represent cents; callers pass `flat_price_cents`, `sale_price_cents`, etc.
// Discount-percent math is unit-agnostic — the formula (a - b) / a works
// equivalently in dollars or cents.

export interface SaleWindow {
  sale_starts_at: string | null;
  sale_ends_at: string | null;
}

export interface SaleStatus {
  isOnSale: boolean;
  isScheduled: boolean;
  isExpired: boolean;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

/** Check if a sale date window is currently active */
export function getSaleStatus(window: SaleWindow): SaleStatus {
  const now = new Date();
  const starts = window.sale_starts_at ? new Date(window.sale_starts_at) : null;
  const ends = window.sale_ends_at ? new Date(window.sale_ends_at) : null;

  const hasStarted = !starts || now >= starts;
  const hasEnded = ends ? now > ends : false;
  const isActive = hasStarted && !hasEnded;

  return {
    isOnSale: isActive,
    isScheduled: !hasStarted,
    isExpired: !!ends && hasEnded,
    saleStartsAt: starts,
    saleEndsAt: ends,
  };
}

export interface TierSaleInfo {
  /** Cents */
  originalPriceCents: number;
  /** Cents */
  currentPriceCents: number;
  isDiscounted: boolean;
  discountPercent: number;
  /** Cents */
  savingsCents: number;
}

/** Get display price and discount info for a single tier/product (cents). */
export function getTierSaleInfo(
  standardPriceCents: number | null,
  salePriceCents: number | null,
  isOnSale: boolean
): TierSaleInfo | null {
  if (!standardPriceCents) return null;

  const hasSalePrice = salePriceCents !== null && salePriceCents < standardPriceCents;

  return {
    originalPriceCents: standardPriceCents,
    currentPriceCents: isOnSale && hasSalePrice ? salePriceCents! : standardPriceCents,
    isDiscounted: isOnSale && hasSalePrice,
    discountPercent: hasSalePrice
      ? Math.round(((standardPriceCents - salePriceCents!) / standardPriceCents) * 100)
      : 0,
    savingsCents: hasSalePrice ? standardPriceCents - salePriceCents! : 0,
  };
}

/** Check if any tier in a service has a sale price set */
export function hasAnySalePrice(
  tiers: { sale_price_cents: number | null }[]
): boolean {
  return tiers.some((t) => t.sale_price_cents !== null);
}

/** Get the sale status label + color for admin display */
export function getSaleStatusDisplay(status: SaleStatus): {
  label: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
  emoji: string;
} {
  if (status.isOnSale) {
    return { label: 'Active', color: 'green', emoji: '🟢' };
  }
  if (status.isScheduled) {
    return { label: 'Scheduled', color: 'yellow', emoji: '🟡' };
  }
  if (status.isExpired) {
    return { label: 'Expired', color: 'red', emoji: '🔴' };
  }
  return { label: 'No Sale', color: 'gray', emoji: '⚪' };
}

/** Format a relative time description (e.g., "9 days left", "Ending soon!") */
export function getSaleEndDescription(endsAt: Date | null): string | null {
  if (!endsAt) return null;
  const now = new Date();
  const diffMs = endsAt.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ended';

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours <= 48) return 'Ending soon!';
  return `${diffDays} days left`;
}

/** Check if sale is ending within 48 hours */
export function isEndingSoon(endsAt: Date | null): boolean {
  if (!endsAt) return false;
  const now = new Date();
  const diffMs = endsAt.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 48 * 60 * 60 * 1000;
}
