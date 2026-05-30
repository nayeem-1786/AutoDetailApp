/**
 * #131 Issue 2 — customer-facing vehicle year helpers.
 *
 * Operator ruling: customer dropdown shows 2028 → 2000 (29 entries) with an
 * "Other..." last option that reveals a write-in accepting 4-digit years
 * 1900–2028 inclusive. Operator-facing surfaces (POS, admin) continue to
 * use the wider `getVehicleYearOptions()` range and are NOT affected.
 */
import { describe, it, expect } from 'vitest';
import {
  getCustomerVehicleYearOptions,
  validateCustomerVehicleYear,
  getVehicleYearOptions,
  CUSTOMER_VEHICLE_YEAR_INPUT_MIN,
  CUSTOMER_VEHICLE_YEAR_INPUT_MAX,
} from '../vehicle-make-combobox';

describe('#131 Issue 2 — getCustomerVehicleYearOptions', () => {
  const options = getCustomerVehicleYearOptions();

  it('returns 29 years from 2028 down to 2000 (inclusive)', () => {
    expect(options.length).toBe(29);
    expect(options[0]).toBe(2028);
    expect(options[options.length - 1]).toBe(2000);
  });

  it('every entry is a unique integer', () => {
    const set = new Set(options);
    expect(set.size).toBe(options.length);
    for (const y of options) expect(Number.isInteger(y)).toBe(true);
  });

  it('strictly descending (no gaps)', () => {
    for (let i = 1; i < options.length; i++) {
      expect(options[i - 1] - options[i]).toBe(1);
    }
  });

  it('does NOT shrink the operator-facing range (POS/admin still see wide list)', () => {
    // Out-of-scope surfaces must retain the 1980+ range. If this fails, the
    // shared `getVehicleYearOptions()` was inadvertently narrowed and POS/admin
    // forms lose their classic-year coverage.
    const operatorOptions = getVehicleYearOptions();
    expect(operatorOptions[operatorOptions.length - 1]).toBe(1980);
    expect(operatorOptions.length).toBeGreaterThan(options.length);
  });
});

describe('#131 Issue 2 — validateCustomerVehicleYear (write-in bounds 1900–2028)', () => {
  it('exposes min/max constants the dialog renderers consume', () => {
    expect(CUSTOMER_VEHICLE_YEAR_INPUT_MIN).toBe(1900);
    expect(CUSTOMER_VEHICLE_YEAR_INPUT_MAX).toBe(2028);
  });

  it('accepts a 4-digit year inside the inclusive bounds', () => {
    expect(validateCustomerVehicleYear('1965')).toBeNull();
    expect(validateCustomerVehicleYear('2024')).toBeNull();
    expect(validateCustomerVehicleYear('1900')).toBeNull(); // lower edge
    expect(validateCustomerVehicleYear('2028')).toBeNull(); // upper edge
  });

  it('rejects empty/whitespace input', () => {
    expect(validateCustomerVehicleYear('')).toBe('Year is required');
    expect(validateCustomerVehicleYear('   ')).toBe('Year is required');
  });

  it('rejects non-4-digit inputs', () => {
    expect(validateCustomerVehicleYear('19')).toMatch(/4-digit/);
    expect(validateCustomerVehicleYear('19655')).toMatch(/4-digit/);
    expect(validateCustomerVehicleYear('abc')).toMatch(/4-digit/);
    expect(validateCustomerVehicleYear('19a5')).toMatch(/4-digit/);
  });

  it('rejects years below the lower bound', () => {
    expect(validateCustomerVehicleYear('1899')).toMatch(/between 1900 and 2028/);
    expect(validateCustomerVehicleYear('0001')).toMatch(/between 1900 and 2028/);
  });

  it('rejects years above the upper bound', () => {
    expect(validateCustomerVehicleYear('2029')).toMatch(/between 1900 and 2028/);
    expect(validateCustomerVehicleYear('9999')).toMatch(/between 1900 and 2028/);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateCustomerVehicleYear('  1965  ')).toBeNull();
  });
});
