import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { TicketItem } from '../../../types';
import type { VehicleSizeClass } from '@/lib/supabase/types';

/**
 * G3 (Track B) — reprice-failure badge parity in Quotes.
 *
 * On a vehicle change to a size with no configured tier, quote-reducer SET_VEHICLE
 * sets item.repriceFailed and KEEPS the stale price (identical to ticket-reducer).
 * Sale's ticket-item-row renders an amber "No <size> pricing" badge so the
 * operator sees the un-repriced line; Quotes' quote-item-row rendered NOTHING —
 * a silently mispriced, customer-facing quote. This pins the badge into the
 * forked Quotes row so it cannot drift away from Sale again.
 */

// quote-item-row only consumes `dispatch` from the quote context.
vi.mock('../../../context/quote-context', () => ({
  useQuote: () => ({ dispatch: vi.fn() }),
}));

import { QuoteItemRow } from '../quote-item-row';

function makeServiceItem(overrides: Partial<TicketItem> = {}): TicketItem {
  return {
    id: 'i1',
    itemType: 'service',
    serviceId: 's1',
    productId: null,
    itemName: 'Express Exterior Wash',
    quantity: 1,
    unitPrice: 75,
    totalPrice: 75,
    standardPrice: 75,
    taxAmount: 0,
    isTaxable: false,
    pricingType: 'standard',
    tierName: 'sedan',
    vehicleSizeClass: 'suv_3row_van',
    notes: null,
    ...overrides,
  } as unknown as TicketItem;
}

const REPRICE_FAILED = {
  reason: 'no_tier_for_size' as const,
  attemptedSize: 'suv_3row_van' as VehicleSizeClass,
  previousSize: 'sedan' as VehicleSizeClass,
  previousTierName: 'sedan',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuoteItemRow — reprice-failure badge (G3)', () => {
  it('renders the "No <size> pricing" badge when repriceFailed is set', () => {
    render(<QuoteItemRow item={makeServiceItem({ repriceFailed: REPRICE_FAILED })} />);
    expect(screen.getByText(/No .+ pricing/i)).toBeTruthy();
  });

  it('badge carries the explanatory title (previous-vehicle price kept)', () => {
    render(<QuoteItemRow item={makeServiceItem({ repriceFailed: REPRICE_FAILED })} />);
    const badge = screen.getByText(/No .+ pricing/i);
    expect(badge.getAttribute('title')).toMatch(/no price configured/i);
    expect(badge.getAttribute('title')).toMatch(/previous vehicle/i);
  });

  it('renders NO badge when the item has no repriceFailed flag (the common case)', () => {
    render(<QuoteItemRow item={makeServiceItem()} />);
    expect(screen.queryByText(/No .+ pricing/i)).toBeNull();
  });

  it('renders NO badge when repriceFailed carries an unrelated reason', () => {
    render(
      <QuoteItemRow
        item={makeServiceItem({
          // Only `no_tier_for_size` drives the badge (parity with ticket-item-row).
          repriceFailed: { ...REPRICE_FAILED, reason: 'something_else' } as unknown as TicketItem['repriceFailed'],
        })}
      />
    );
    expect(screen.queryByText(/No .+ pricing/i)).toBeNull();
  });
});
