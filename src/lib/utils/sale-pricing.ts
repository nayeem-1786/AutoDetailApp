// Sale pricing utilities — single source of truth for sale status + display logic

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
  originalPrice: number;
  currentPrice: number;
  isDiscounted: boolean;
  discountPercent: number;
  savings: number;
}

/** Get display price and discount info for a single tier/product */
export function getTierSaleInfo(
  standardPrice: number | null,
  salePrice: number | null,
  isOnSale: boolean
): TierSaleInfo | null {
  if (!standardPrice) return null;

  const hasSalePrice = salePrice !== null && salePrice < standardPrice;

  return {
    originalPrice: standardPrice,
    currentPrice: isOnSale && hasSalePrice ? salePrice : standardPrice,
    isDiscounted: isOnSale && hasSalePrice,
    discountPercent: hasSalePrice
      ? Math.round(((standardPrice - salePrice!) / standardPrice) * 100)
      : 0,
    savings: hasSalePrice ? standardPrice - salePrice! : 0,
  };
}

/** Check if any tier in a service has a sale price set */
export function hasAnySalePrice(
  tiers: { sale_price: number | null }[]
): boolean {
  return tiers.some((t) => t.sale_price !== null);
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
