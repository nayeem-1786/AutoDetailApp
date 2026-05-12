import { describe, it, expect } from 'vitest';
import {
  applyMobileEditToJobServices,
  computeAppointmentDelta,
} from '@/lib/utils/mobile-service-edit';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

// Phase Mobile-1.9 — pure-function helpers for the mobile-service PATCH
// endpoints. Tested in isolation so the math + JSONB sync logic is locked
// independently of the endpoint glue.

describe('computeAppointmentDelta', () => {
  it('toggle off (40 → 0): subtotal and total drop by 40', () => {
    const result = computeAppointmentDelta({
      currentSubtotal: 145,
      currentTotal: 145,
      currentSurcharge: 40,
      newSurcharge: 0,
    });
    expect(result.newSubtotal).toBe(105);
    expect(result.newTotal).toBe(105);
  });

  it('toggle on (0 → 40): subtotal and total rise by 40', () => {
    const result = computeAppointmentDelta({
      currentSubtotal: 105,
      currentTotal: 105,
      currentSurcharge: 0,
      newSurcharge: 40,
    });
    expect(result.newSubtotal).toBe(145);
    expect(result.newTotal).toBe(145);
  });

  it('zone change (40 → 80): subtotal and total rise by 40', () => {
    const result = computeAppointmentDelta({
      currentSubtotal: 185,
      currentTotal: 185,
      currentSurcharge: 40,
      newSurcharge: 80,
    });
    expect(result.newSubtotal).toBe(225);
    expect(result.newTotal).toBe(225);
  });

  it('preserves tax base: appointment with $10 tax + $40 surcharge → toggle off shifts subtotal+total by 40, tax unchanged elsewhere', () => {
    // Online booking shape: subtotal includes mobile (Phase 1 D2),
    // total = subtotal + tax - discount. The delta function only
    // mutates subtotal + total — the caller leaves tax_amount alone,
    // which is the correctness guarantee we're locking here.
    const result = computeAppointmentDelta({
      currentSubtotal: 185, // 145 items + 40 mobile
      currentTotal: 195, // 185 + 10 tax
      currentSurcharge: 40,
      newSurcharge: 0,
    });
    expect(result.newSubtotal).toBe(145);
    expect(result.newTotal).toBe(155); // 195 - 40 = 155 (tax of 10 preserved)
  });

  it('no surcharge change: delta is zero', () => {
    const result = computeAppointmentDelta({
      currentSubtotal: 145,
      currentTotal: 145,
      currentSurcharge: 40,
      newSurcharge: 40,
    });
    expect(result.newSubtotal).toBe(145);
    expect(result.newTotal).toBe(145);
  });

  it('float precision: 0.10 + 0.20 - 0.10 stays exact', () => {
    // toCents-internal arithmetic guards against the classic
    // 0.1 + 0.2 !== 0.3 problem.
    const result = computeAppointmentDelta({
      currentSubtotal: 0.1,
      currentTotal: 0.2,
      currentSurcharge: 0.1,
      newSurcharge: 0.2,
    });
    expect(result.newSubtotal).toBe(0.2);
    expect(result.newTotal).toBe(0.3);
  });
});

describe('applyMobileEditToJobServices', () => {
  const expressWash: JobServiceSnapshot = {
    id: 'svc-express',
    name: 'Express Exterior Wash',
    price: 75,
  };
  const interior: JobServiceSnapshot = {
    id: 'svc-interior',
    name: 'Interior Clean',
    price: 85,
  };
  const existingMobileFee: JobServiceSnapshot = {
    id: null,
    name: 'Mobile Service (0-3 miles)',
    price: 40,
    is_mobile_fee: true,
  };

  it('toggle on (no prior entry): appends mobile entry at end', () => {
    const result = applyMobileEditToJobServices({
      services: [expressWash, interior],
      isMobile: true,
      surcharge: 40,
      snapshotName: 'Mobile Service (0-3 miles)',
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(expressWash);
    expect(result[1]).toEqual(interior);
    expect(result[2]).toMatchObject({
      id: null,
      name: 'Mobile Service (0-3 miles)',
      price: 40,
      is_mobile_fee: true,
    });
  });

  it('toggle off (prior entry present): strips mobile entry, keeps real services', () => {
    const result = applyMobileEditToJobServices({
      services: [expressWash, existingMobileFee, interior],
      isMobile: false,
      surcharge: 0,
      snapshotName: null,
    });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.is_mobile_fee !== true)).toBe(true);
    expect(result.map((s) => s.id)).toEqual(['svc-express', 'svc-interior']);
  });

  it('zone change (40 → 80): replaces existing entry, name + price updated', () => {
    const result = applyMobileEditToJobServices({
      services: [expressWash, existingMobileFee],
      isMobile: true,
      surcharge: 80,
      snapshotName: 'Mobile Service (3-10 miles)',
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: null,
      name: 'Mobile Service (3-10 miles)',
      price: 80,
      is_mobile_fee: true,
    });
  });

  it('idempotent re-apply: applying same edit twice produces identical output', () => {
    const first = applyMobileEditToJobServices({
      services: [expressWash, existingMobileFee],
      isMobile: true,
      surcharge: 40,
      snapshotName: 'Mobile Service (0-3 miles)',
    });
    const second = applyMobileEditToJobServices({
      services: first,
      isMobile: true,
      surcharge: 40,
      snapshotName: 'Mobile Service (0-3 miles)',
    });
    expect(second).toEqual(first);
    expect(second.filter((s) => s.is_mobile_fee === true)).toHaveLength(1);
  });

  it('toggle on with surcharge=0: does NOT append (defensive, matches CHECK constraint)', () => {
    // The appointments.mobile_consistency CHECK rejects
    // (is_mobile=true AND mobile_surcharge=0) at the DB level. The
    // helper mirrors that defensively so a malformed input doesn't
    // produce a $0 line item.
    const result = applyMobileEditToJobServices({
      services: [expressWash],
      isMobile: true,
      surcharge: 0,
      snapshotName: 'Zone',
    });
    expect(result).toHaveLength(1);
    expect(result.some((s) => s.is_mobile_fee === true)).toBe(false);
  });

  it('snapshotName null/empty + isMobile=true: synthetic uses fallback "Mobile Service Fee"', () => {
    const result = applyMobileEditToJobServices({
      services: [],
      isMobile: true,
      surcharge: 40,
      snapshotName: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Mobile Service Fee');
    expect(result[0].is_mobile_fee).toBe(true);
  });

  it('multiple prior mobile_fee rows (defensive): strips ALL flagged entries before appending', () => {
    // Should never happen in prod, but defensive: a duplicate from a
    // historical bug must collapse to one row on the next edit.
    const result = applyMobileEditToJobServices({
      services: [
        expressWash,
        existingMobileFee,
        { ...existingMobileFee, name: 'Stale Old Name', price: 30 },
      ],
      isMobile: true,
      surcharge: 40,
      snapshotName: 'Fresh Zone',
    });
    expect(result.filter((s) => s.is_mobile_fee === true)).toHaveLength(1);
    expect(result[result.length - 1]).toMatchObject({
      name: 'Fresh Zone',
      price: 40,
    });
  });
});
