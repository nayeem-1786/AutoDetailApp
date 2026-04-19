import { describe, it, expect } from 'vitest';
import {
  VEHICLE_SIZE_CLASS_KEYS,
  CUSTOMER_SELF_SERVICE_SIZE_CLASSES,
  VEHICLE_SIZE_LABELS,
} from '@/lib/utils/constants';
import { bookingVehicleSchema, customerVehicleSchema } from '@/lib/utils/validation';

describe('Vehicle size class constants (Session 30)', () => {
  it('VEHICLE_SIZE_CLASS_KEYS contains exactly 5 canonical values', () => {
    expect(VEHICLE_SIZE_CLASS_KEYS).toEqual([
      'sedan', 'truck_suv_2row', 'suv_3row_van', 'exotic', 'classic',
    ]);
  });

  it('CUSTOMER_SELF_SERVICE_SIZE_CLASSES contains exactly 3 customer-exposed values', () => {
    expect(CUSTOMER_SELF_SERVICE_SIZE_CLASSES).toEqual([
      'sedan', 'truck_suv_2row', 'suv_3row_van',
    ]);
  });

  it('every VEHICLE_SIZE_CLASS_KEYS value has a label in VEHICLE_SIZE_LABELS', () => {
    for (const key of VEHICLE_SIZE_CLASS_KEYS) {
      expect(VEHICLE_SIZE_LABELS[key]).toBeDefined();
      expect(typeof VEHICLE_SIZE_LABELS[key]).toBe('string');
    }
  });

  it('CUSTOMER_SELF_SERVICE_SIZE_CLASSES is a strict subset of VEHICLE_SIZE_CLASS_KEYS', () => {
    for (const key of CUSTOMER_SELF_SERVICE_SIZE_CLASSES) {
      expect(VEHICLE_SIZE_CLASS_KEYS).toContain(key);
    }
    expect(CUSTOMER_SELF_SERVICE_SIZE_CLASSES.length).toBeLessThan(VEHICLE_SIZE_CLASS_KEYS.length);
  });
});

describe('Customer trust boundary enforcement (Session 30)', () => {
  const minimalBookingPayload = {};
  const minimalCustomerPayload = {};

  it('bookingVehicleSchema rejects exotic size_class with size_class-path error', () => {
    const result = bookingVehicleSchema.safeParse({
      ...minimalBookingPayload,
      size_class: 'exotic',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const sizeClassErrors = result.error.issues.filter((i) =>
        i.path.includes('size_class')
      );
      expect(sizeClassErrors.length).toBeGreaterThan(0);
    }
  });

  it('bookingVehicleSchema rejects classic size_class with size_class-path error', () => {
    const result = bookingVehicleSchema.safeParse({
      ...minimalBookingPayload,
      size_class: 'classic',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const sizeClassErrors = result.error.issues.filter((i) =>
        i.path.includes('size_class')
      );
      expect(sizeClassErrors.length).toBeGreaterThan(0);
    }
  });

  it('bookingVehicleSchema accepts sedan size_class', () => {
    const result = bookingVehicleSchema.safeParse({
      ...minimalBookingPayload,
      size_class: 'sedan',
    });
    if (!result.success) {
      const sizeClassErrors = result.error.issues.filter((i) =>
        i.path.includes('size_class')
      );
      expect(sizeClassErrors).toHaveLength(0);
    }
  });

  it('customerVehicleSchema rejects exotic size_class with size_class-path error', () => {
    const result = customerVehicleSchema.safeParse({
      ...minimalCustomerPayload,
      size_class: 'exotic',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const sizeClassErrors = result.error.issues.filter((i) =>
        i.path.includes('size_class')
      );
      expect(sizeClassErrors.length).toBeGreaterThan(0);
    }
  });

  it('customerVehicleSchema accepts sedan size_class', () => {
    const result = customerVehicleSchema.safeParse({
      ...minimalCustomerPayload,
      size_class: 'sedan',
    });
    if (!result.success) {
      const sizeClassErrors = result.error.issues.filter((i) =>
        i.path.includes('size_class')
      );
      expect(sizeClassErrors).toHaveLength(0);
    }
  });
});
