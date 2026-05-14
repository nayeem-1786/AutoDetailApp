import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatMoney,
  formatMoneyForInput,
} from '@/lib/utils/format';

describe('formatMoney (Phase Money-Unify-1)', () => {
  describe('edge cases', () => {
    it('formatMoney(0) === "$0.00"', () => {
      expect(formatMoney(0)).toBe('$0.00');
    });

    it('formatMoney(1) === "$0.01"', () => {
      expect(formatMoney(1)).toBe('$0.01');
    });

    it('formatMoney(50) === "$0.50" (Stripe minimum)', () => {
      expect(formatMoney(50)).toBe('$0.50');
    });

    it('formatMoney(99) === "$0.99"', () => {
      expect(formatMoney(99)).toBe('$0.99');
    });

    it('formatMoney(100) === "$1.00"', () => {
      expect(formatMoney(100)).toBe('$1.00');
    });

    it('formatMoney(1764) === "$17.64"', () => {
      expect(formatMoney(1764)).toBe('$17.64');
    });

    it('formatMoney(100000) === "$1,000.00" (comma separator)', () => {
      expect(formatMoney(100000)).toBe('$1,000.00');
    });

    it('formatMoney(100000000) === "$1,000,000.00"', () => {
      expect(formatMoney(100000000)).toBe('$1,000,000.00');
    });

    it('formatMoney(-1764) === "-$17.64" (negative refund display)', () => {
      expect(formatMoney(-1764)).toBe('-$17.64');
    });
  });

  describe('input validation', () => {
    it('throws TypeError on non-integer cents (e.g. 17.64)', () => {
      expect(() => formatMoney(17.64)).toThrow(TypeError);
      expect(() => formatMoney(17.64)).toThrow(/integer cents/);
    });

    it('throws TypeError on NaN', () => {
      expect(() => formatMoney(NaN)).toThrow(TypeError);
    });

    it('throws TypeError on Infinity', () => {
      expect(() => formatMoney(Infinity)).toThrow(TypeError);
    });

    it('throws TypeError on -Infinity', () => {
      expect(() => formatMoney(-Infinity)).toThrow(TypeError);
    });
  });

  describe('byte-identical equivalence to formatCurrency', () => {
    it('formatMoney(cents) === formatCurrency(cents / 100) for selected values', () => {
      const cases = [0, 1, 99, 100, 9999, 123456, 100000000];
      for (const cents of cases) {
        expect(formatMoney(cents)).toBe(formatCurrency(cents / 100));
      }
    });

    it('byte-identical across 0..1000000 cents in steps of 1', () => {
      // Hardened equivalence check — fails if any single integer-cent
      // value produces divergent output between the two formatters.
      // Long-running (~30s) because Intl.NumberFormat is called twice
      // per iteration; runs once per phase, not in CI hot loops.
      for (let c = 0; c <= 1_000_000; c++) {
        if (formatMoney(c) !== formatCurrency(c / 100)) {
          throw new Error(
            `Divergence at ${c} cents: formatMoney=${formatMoney(c)} vs formatCurrency=${formatCurrency(c / 100)}`,
          );
        }
      }
    }, 60_000);

    it('byte-identical for negatives (-1..-1000)', () => {
      for (let c = -1; c >= -1000; c--) {
        if (formatMoney(c) !== formatCurrency(c / 100)) {
          throw new Error(
            `Divergence at ${c} cents: formatMoney=${formatMoney(c)} vs formatCurrency=${formatCurrency(c / 100)}`,
          );
        }
      }
    });
  });
});

describe('formatMoneyForInput (Phase Money-Unify-1)', () => {
  it('formatMoneyForInput(0) === "0.00"', () => {
    expect(formatMoneyForInput(0)).toBe('0.00');
  });

  it('formatMoneyForInput(1) === "0.01"', () => {
    expect(formatMoneyForInput(1)).toBe('0.01');
  });

  it('formatMoneyForInput(50) === "0.50"', () => {
    expect(formatMoneyForInput(50)).toBe('0.50');
  });

  it('formatMoneyForInput(99) === "0.99"', () => {
    expect(formatMoneyForInput(99)).toBe('0.99');
  });

  it('formatMoneyForInput(100) === "1.00"', () => {
    expect(formatMoneyForInput(100)).toBe('1.00');
  });

  it('formatMoneyForInput(1764) === "17.64"', () => {
    expect(formatMoneyForInput(1764)).toBe('17.64');
  });

  it('formatMoneyForInput(100000000) === "1000000.00" (no commas)', () => {
    expect(formatMoneyForInput(100000000)).toBe('1000000.00');
  });

  it('throws on non-integer input', () => {
    expect(() => formatMoneyForInput(17.64)).toThrow(TypeError);
  });

  it('throws on NaN', () => {
    expect(() => formatMoneyForInput(NaN)).toThrow(TypeError);
  });
});
