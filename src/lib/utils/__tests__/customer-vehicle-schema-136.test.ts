/**
 * #136 Q2/Q3/B11/B15/B31 — customerVehicleSchema field additions and
 * year-range alignment.
 */
import { describe, it, expect } from 'vitest';
import { customerVehicleSchema } from '../validation';

describe('#136 Q3/B11 — vin / license_plate / notes are optional schema fields', () => {
  it('accepts a vehicle WITH vin/license_plate/notes populated', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 2024,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
      vin: '1HGBH41JXMN109186',
      license_plate: '8ABC123',
      notes: 'Aftermarket wheels',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vin).toBe('1HGBH41JXMN109186');
      expect(result.data.license_plate).toBe('8ABC123');
      expect(result.data.notes).toBe('Aftermarket wheels');
    }
  });

  it('accepts a vehicle WITHOUT vin/license_plate/notes (optional)', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 2024,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
    });
    expect(result.success).toBe(true);
  });
});

describe('#136 B31 — year max aligned to 2099', () => {
  it('accepts year 2099', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 2099,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
    });
    expect(result.success).toBe(true);
  });

  it('rejects year 2100', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 2100,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const yearIssue = result.error.issues.find((i) => i.path[0] === 'year');
      expect(yearIssue?.message).toMatch(/between 1900 and 2099/);
    }
  });

  it('accepts year 1900 (lower edge)', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 1900,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
    });
    expect(result.success).toBe(true);
  });

  it('rejects year 1899', () => {
    const result = customerVehicleSchema.safeParse({
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      year: 1899,
      make: 'Honda',
      model: 'Civic',
      color: 'Silver',
    });
    expect(result.success).toBe(false);
  });
});
