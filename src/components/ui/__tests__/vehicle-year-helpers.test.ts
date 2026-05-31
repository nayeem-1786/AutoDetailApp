/**
 * #132 Issue 2 — customer-facing vehicle year text input.
 *
 * Supersedes #131's dropdown+Other... pattern. New rule: a single 4-digit
 * text input accepting `/^(19|20)\d{2}$/` (years 1900–2099). The "19/20"
 * prefix IS the range constraint.
 *
 * Operator-facing surfaces (POS, admin) continue to use the wider
 * `getVehicleYearOptions()` (1980→currentYear+2) per Memory #19's
 * "DRY within each trust boundary" finding — that helper is untouched
 * and its regression test stays.
 */
import { describe, it, expect } from 'vitest';
import {
  validateCustomerVehicleYear,
  getVehicleYearOptions,
} from '../vehicle-make-combobox';

describe('#132 Issue 2 — validateCustomerVehicleYear (text-input rule: 4 digits starting with 19/20)', () => {
  describe('accepts', () => {
    it('typical recent year', () => {
      expect(validateCustomerVehicleYear('2024')).toBeNull();
      expect(validateCustomerVehicleYear('2025')).toBeNull();
    });

    it('classic year (starts with 19)', () => {
      expect(validateCustomerVehicleYear('1965')).toBeNull();
      expect(validateCustomerVehicleYear('1900')).toBeNull(); // lower edge
      expect(validateCustomerVehicleYear('1999')).toBeNull();
    });

    it('upper edge (2099)', () => {
      expect(validateCustomerVehicleYear('2099')).toBeNull();
    });

    it('trims surrounding whitespace before validating', () => {
      expect(validateCustomerVehicleYear('  2024  ')).toBeNull();
      expect(validateCustomerVehicleYear('\t1965\n')).toBeNull();
    });
  });

  describe('rejects with "Year is required"', () => {
    it('empty string', () => {
      expect(validateCustomerVehicleYear('')).toBe('Year is required');
    });

    it('whitespace-only', () => {
      expect(validateCustomerVehicleYear('   ')).toBe('Year is required');
    });
  });

  describe('rejects with "Year must be 4 digits"', () => {
    it('3 digits', () => {
      expect(validateCustomerVehicleYear('199')).toBe('Year must be 4 digits');
    });

    it('5 digits', () => {
      // maxLength=4 prevents this UX-wise; validator covers it anyway.
      expect(validateCustomerVehicleYear('19655')).toBe('Year must be 4 digits');
    });

    it('non-digit characters', () => {
      expect(validateCustomerVehicleYear('abc')).toBe('Year must be 4 digits');
      expect(validateCustomerVehicleYear('19a5')).toBe('Year must be 4 digits');
      expect(validateCustomerVehicleYear('20.4')).toBe('Year must be 4 digits');
    });
  });

  describe('rejects with "Year must start with 19 or 20"', () => {
    it('1800s', () => {
      expect(validateCustomerVehicleYear('1899')).toBe('Year must start with 19 or 20');
      expect(validateCustomerVehicleYear('1500')).toBe('Year must start with 19 or 20');
    });

    it('2100+', () => {
      // 2100 starts with 21 — rejected by the prefix rule (the constraint
      // upper bound that replaces #131's numeric max).
      expect(validateCustomerVehicleYear('2100')).toBe('Year must start with 19 or 20');
      expect(validateCustomerVehicleYear('9999')).toBe('Year must start with 19 or 20');
    });

    it('zero-padded but invalid', () => {
      expect(validateCustomerVehicleYear('0001')).toBe('Year must start with 19 or 20');
    });
  });
});

describe('#132 Issue 2 — operator-facing year helper untouched (Memory #19 DRY-within-trust-boundary)', () => {
  // Regression: ensure the wide-range `getVehicleYearOptions()` for POS/admin
  // surfaces is not inadvertently narrowed by this session's customer-facing
  // changes. POS/admin operators still get classic-year coverage in their
  // dropdowns; the customer-facing text input handles 1900-2099 via free entry.
  const operatorOptions = getVehicleYearOptions();

  it('still returns the full operator range down to 1980', () => {
    expect(operatorOptions[operatorOptions.length - 1]).toBe(1980);
  });

  it('every entry is a unique integer', () => {
    const set = new Set(operatorOptions);
    expect(set.size).toBe(operatorOptions.length);
    for (const y of operatorOptions) expect(Number.isInteger(y)).toBe(true);
  });
});
