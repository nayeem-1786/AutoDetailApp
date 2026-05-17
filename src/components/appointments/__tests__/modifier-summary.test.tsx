import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  ModifierSummary,
  hasAppliedModifiers,
} from '../modifier-summary';

afterEach(() => {
  cleanup();
});

describe('hasAppliedModifiers', () => {
  it('returns true when coupon code + non-zero discount are set', () => {
    expect(
      hasAppliedModifiers({
        coupon_code: 'SAVE25',
        coupon_discount: 25,
        loyalty_points_redeemed: 0,
        loyalty_discount: 0,
        manual_discount_value: 0,
        manual_discount_label: null,
      })
    ).toBe(true);
  });

  it('returns false when coupon code is set but discount is zero', () => {
    expect(
      hasAppliedModifiers({
        coupon_code: 'SAVE25',
        coupon_discount: 0,
        loyalty_points_redeemed: 0,
        loyalty_discount: 0,
        manual_discount_value: 0,
        manual_discount_label: null,
      })
    ).toBe(false);
  });

  it('returns true when loyalty points are redeemed', () => {
    expect(
      hasAppliedModifiers({
        coupon_code: null,
        coupon_discount: null,
        loyalty_points_redeemed: 100,
        loyalty_discount: 10,
        manual_discount_value: null,
        manual_discount_label: null,
      })
    ).toBe(true);
  });

  it('returns true when manual discount is applied', () => {
    expect(
      hasAppliedModifiers({
        coupon_code: null,
        coupon_discount: null,
        loyalty_points_redeemed: null,
        loyalty_discount: null,
        manual_discount_value: 15,
        manual_discount_label: 'Goodwill',
      })
    ).toBe(true);
  });

  it('returns false when no modifiers are applied (all null/zero)', () => {
    expect(
      hasAppliedModifiers({
        coupon_code: null,
        coupon_discount: null,
        loyalty_points_redeemed: null,
        loyalty_discount: null,
        manual_discount_value: null,
        manual_discount_label: null,
      })
    ).toBe(false);
  });
});

describe('<ModifierSummary>', () => {
  const noModifiers = {
    coupon_code: null,
    coupon_discount: null,
    loyalty_points_redeemed: null,
    loyalty_discount: null,
    manual_discount_value: null,
    manual_discount_label: null,
  };

  it('renders null when no modifiers are applied', () => {
    const { container } = render(<ModifierSummary {...noModifiers} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders coupon row when coupon code + discount are present', () => {
    const { getByTestId, queryByTestId } = render(
      <ModifierSummary
        {...noModifiers}
        coupon_code="SAVE25"
        coupon_discount={25}
      />
    );
    expect(getByTestId('modifier-coupon').textContent).toContain('SAVE25');
    expect(getByTestId('modifier-coupon').textContent).toContain('25.00');
    expect(queryByTestId('modifier-loyalty')).toBeNull();
    expect(queryByTestId('modifier-manual')).toBeNull();
  });

  it('renders loyalty row with points label when points are redeemed', () => {
    const { getByTestId } = render(
      <ModifierSummary
        {...noModifiers}
        loyalty_points_redeemed={100}
        loyalty_discount={10}
      />
    );
    const row = getByTestId('modifier-loyalty');
    expect(row.textContent).toContain('100 pts');
    expect(row.textContent).toContain('10.00');
  });

  it('renders manual row with custom label', () => {
    const { getByTestId } = render(
      <ModifierSummary
        {...noModifiers}
        manual_discount_value={15}
        manual_discount_label="Manager goodwill"
      />
    );
    const row = getByTestId('modifier-manual');
    expect(row.textContent).toContain('Manager goodwill');
    expect(row.textContent).toContain('15.00');
  });

  it('renders all three rows when all modifiers are present', () => {
    const { getByTestId } = render(
      <ModifierSummary
        coupon_code="SAVE25"
        coupon_discount={25}
        loyalty_points_redeemed={100}
        loyalty_discount={10}
        manual_discount_value={15}
        manual_discount_label="Goodwill"
      />
    );
    expect(getByTestId('modifier-coupon')).toBeTruthy();
    expect(getByTestId('modifier-loyalty')).toBeTruthy();
    expect(getByTestId('modifier-manual')).toBeTruthy();
  });

  it('uses default "Manual discount" label when none provided', () => {
    const { getByTestId } = render(
      <ModifierSummary
        {...noModifiers}
        manual_discount_value={15}
        manual_discount_label={null}
      />
    );
    expect(getByTestId('modifier-manual').textContent).toContain(
      'Manual discount'
    );
  });

  it('respects the pos variant prop (dark-mode classes present)', () => {
    const { container } = render(
      <ModifierSummary
        {...noModifiers}
        coupon_code="SAVE25"
        coupon_discount={25}
        variant="pos"
      />
    );
    // dark: variants must be present for the POS variant.
    const wrapper = container.querySelector(
      'div[class*="dark:border-gray-800"]'
    );
    expect(wrapper).toBeTruthy();
  });
});
