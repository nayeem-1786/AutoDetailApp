import { describe, it, expect } from 'vitest';
import {
  editServicesBodySchema,
  buildJobServicesJsonb,
  computeTotalsForServiceEdit,
} from '../edit-services';

describe('editServicesBodySchema', () => {
  it('accepts a well-formed single-service body', () => {
    const result = editServicesBodySchema.safeParse({
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          price_at_booking: 200,
          tier_name: 'sedan',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts null tier_name', () => {
    const result = editServicesBodySchema.safeParse({
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          price_at_booking: 200,
          tier_name: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts omitted tier_name', () => {
    const result = editServicesBodySchema.safeParse({
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          price_at_booking: 200,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty services array', () => {
    const result = editServicesBodySchema.safeParse({ services: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid service_id', () => {
    const result = editServicesBodySchema.safeParse({
      services: [{ service_id: 'not-a-uuid', price_at_booking: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = editServicesBodySchema.safeParse({
      services: [
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          price_at_booking: -1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects too-many services', () => {
    const services = Array.from({ length: 51 }, (_, i) => ({
      service_id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      price_at_booking: 100,
    }));
    const result = editServicesBodySchema.safeParse({ services });
    expect(result.success).toBe(false);
  });
});

describe('buildJobServicesJsonb', () => {
  const baseInput = {
    resolved: [
      { service_id: 'svc-1', service_name: 'Full Detail', price_at_booking: 250 },
      { service_id: 'svc-2', service_name: 'Wax', price_at_booking: 50 },
    ],
    isMobile: false,
    mobileSurcharge: 0,
    mobileZoneNameSnapshot: null,
  };

  it('returns one entry per resolved service in order', () => {
    const result = buildJobServicesJsonb(baseInput);
    expect(result).toEqual([
      { id: 'svc-1', name: 'Full Detail', price: 250 },
      { id: 'svc-2', name: 'Wax', price: 50 },
    ]);
  });

  it('appends a synthetic mobile-fee row when isMobile=true and surcharge>0', () => {
    const result = buildJobServicesJsonb({
      ...baseInput,
      isMobile: true,
      mobileSurcharge: 25,
      mobileZoneNameSnapshot: 'Zone A',
    });
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({
      id: null,
      name: 'Zone A',
      price: 25,
      is_mobile_fee: true,
    });
  });

  it('falls back to "Mobile Service Fee" when zone name is null but isMobile=true with surcharge', () => {
    const result = buildJobServicesJsonb({
      ...baseInput,
      isMobile: true,
      mobileSurcharge: 25,
      mobileZoneNameSnapshot: null,
    });
    expect(result[2]?.name).toBe('Mobile Service Fee');
  });

  it('omits the mobile-fee row when isMobile=true but surcharge is zero', () => {
    const result = buildJobServicesJsonb({
      ...baseInput,
      isMobile: true,
      mobileSurcharge: 0,
      mobileZoneNameSnapshot: 'Zone A',
    });
    expect(result.find((r) => r.is_mobile_fee)).toBeUndefined();
  });

  it('omits the mobile-fee row when isMobile=false even if surcharge>0', () => {
    const result = buildJobServicesJsonb({
      ...baseInput,
      isMobile: false,
      mobileSurcharge: 25,
    });
    expect(result.find((r) => r.is_mobile_fee)).toBeUndefined();
  });

  it('returns an empty array when no services are resolved and not mobile', () => {
    const result = buildJobServicesJsonb({
      ...baseInput,
      resolved: [],
    });
    expect(result).toEqual([]);
  });
});

describe('computeTotalsForServiceEdit', () => {
  it('sums service prices into subtotal and total when no mobile/discount/tax', () => {
    const result = computeTotalsForServiceEdit({
      services: [{ price_at_booking: 200 }, { price_at_booking: 50 }],
      mobileSurcharge: 0,
      discountAmount: 0,
      taxAmount: 0,
    });
    expect(result.subtotal).toBe(250);
    expect(result.totalAmount).toBe(250);
  });

  it('includes mobile surcharge in subtotal and total', () => {
    const result = computeTotalsForServiceEdit({
      services: [{ price_at_booking: 200 }],
      mobileSurcharge: 25,
      discountAmount: 0,
      taxAmount: 0,
    });
    expect(result.subtotal).toBe(225);
    expect(result.totalAmount).toBe(225);
  });

  it('subtracts discount and adds tax for total', () => {
    const result = computeTotalsForServiceEdit({
      services: [{ price_at_booking: 200 }],
      mobileSurcharge: 0,
      discountAmount: 20,
      taxAmount: 10,
    });
    expect(result.subtotal).toBe(200);
    expect(result.totalAmount).toBe(190);
  });

  it('handles empty services list (subtotal = mobile only)', () => {
    const result = computeTotalsForServiceEdit({
      services: [],
      mobileSurcharge: 25,
      discountAmount: 0,
      taxAmount: 0,
    });
    expect(result.subtotal).toBe(25);
    expect(result.totalAmount).toBe(25);
  });

  it('handles fractional dollar amounts without float drift', () => {
    const result = computeTotalsForServiceEdit({
      services: [
        { price_at_booking: 0.1 },
        { price_at_booking: 0.2 },
        { price_at_booking: 0.3 },
      ],
      mobileSurcharge: 0,
      discountAmount: 0,
      taxAmount: 0,
    });
    expect(result.subtotal).toBe(0.6);
    expect(result.totalAmount).toBe(0.6);
  });
});
