import { describe, it, expect } from 'vitest';
import {
  composeLineItems,
  type DisplayLineItem,
} from '@/lib/utils/compose-line-items';

const noMobile = {
  is_mobile: false,
  mobile_surcharge: 0,
  mobile_zone_name_snapshot: null,
};

describe('composeLineItems', () => {
  it('non-mobile quote: returns items unchanged, no synthetic row', () => {
    const result = composeLineItems(noMobile, [
      {
        item_name: 'Express Interior Clean',
        quantity: 1,
        unit_price: 85,
        total_price: 85,
        tier_name: null,
      },
      {
        item_name: 'Pet Hair Add-on',
        quantity: 1,
        unit_price: 60,
        total_price: 60,
        tier_name: null,
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.is_mobile_fee !== true)).toBe(true);
    expect(result[0].name).toBe('Express Interior Clean');
    expect(result[1].name).toBe('Pet Hair Add-on');
  });

  it('mobile quote: appends synthetic mobile-fee row at END with is_mobile_fee=true', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
      },
      [
        { item_name: 'Service A', quantity: 1, unit_price: 50, total_price: 50 },
        { item_name: 'Service B', quantity: 1, unit_price: 25, total_price: 25 },
      ]
    );
    expect(result).toHaveLength(3);
    const synthetic = result[2];
    expect(synthetic.is_mobile_fee).toBe(true);
    expect(synthetic.name).toBe('Mobile Service (0-3 miles)');
    expect(synthetic.quantity).toBe(1);
    expect(synthetic.unit_price).toBe(40);
    expect(synthetic.total_price).toBe(40);
    expect(synthetic.tier_name).toBeNull();
    // Confirm synthetic is at END, not interleaved.
    expect(result[0].is_mobile_fee).not.toBe(true);
    expect(result[1].is_mobile_fee).not.toBe(true);
  });

  it('is_mobile=true but mobile_surcharge=0: no synthetic row', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 0,
        mobile_zone_name_snapshot: 'Zone A',
      },
      [{ item_name: 'Service', quantity: 1, unit_price: 50, total_price: 50 }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].is_mobile_fee).not.toBe(true);
  });

  it('is_mobile=true but mobile_surcharge=null: no synthetic row', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: null,
        mobile_zone_name_snapshot: 'Zone A',
      },
      [{ item_name: 'Service', quantity: 1, unit_price: 50, total_price: 50 }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].is_mobile_fee).not.toBe(true);
  });

  it('is_mobile=true, mobile_zone_name_snapshot=null: synthetic row uses "Mobile Service Fee" fallback', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: null,
      },
      [{ item_name: 'Service', quantity: 1, unit_price: 50, total_price: 50 }]
    );
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('Mobile Service Fee');
    expect(result[1].is_mobile_fee).toBe(true);
  });

  it('is_mobile=true, mobile_zone_name_snapshot is empty/whitespace: same fallback', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: '   ',
      },
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Mobile Service Fee');
  });

  it('mobile_surcharge as string "40.00" (DB numeric): converted to 40', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: '40.00',
        mobile_zone_name_snapshot: 'Zone A',
      },
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].unit_price).toBe(40);
    expect(result[0].total_price).toBe(40);
  });

  it('mobile_surcharge as malformed string: falls back to 0 → no synthetic row', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 'NaN',
        mobile_zone_name_snapshot: 'Zone A',
      },
      [{ item_name: 'Service', quantity: 1, unit_price: 50, total_price: 50 }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].is_mobile_fee).not.toBe(true);
  });

  it('empty rawItems with is_mobile=true: returns only synthetic row', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Zone A',
      },
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].is_mobile_fee).toBe(true);
    expect(result[0].name).toBe('Zone A');
  });

  it('empty rawItems with non-mobile source: returns empty array', () => {
    const result = composeLineItems(noMobile, []);
    expect(result).toHaveLength(0);
  });

  it('handles both item_name and name field shapes (mixed input)', () => {
    const result = composeLineItems(noMobile, [
      { item_name: 'From quote_items', unit_price: 50, total_price: 50 },
      { name: 'From jobs.services JSONB', unit_price: 25, total_price: 25 },
    ]);
    expect(result[0].name).toBe('From quote_items');
    expect(result[1].name).toBe('From jobs.services JSONB');
  });

  it('item_name takes precedence over name when both are set', () => {
    const result = composeLineItems(noMobile, [
      { item_name: 'item_name wins', name: 'name loses', unit_price: 0, total_price: 0 },
    ]);
    expect(result[0].name).toBe('item_name wins');
  });

  it('quantity defaults to 1 when missing', () => {
    const result = composeLineItems(noMobile, [
      { item_name: 'No qty field', unit_price: 50, total_price: 50 },
    ]);
    expect(result[0].quantity).toBe(1);
  });

  it('unit_price/total_price as strings from DB numeric: coerced to numbers', () => {
    const result = composeLineItems(noMobile, [
      {
        item_name: 'String-priced',
        quantity: 2,
        unit_price: '85.50',
        total_price: '171.00',
      },
    ]);
    expect(result[0].unit_price).toBe(85.5);
    expect(result[0].total_price).toBe(171);
    expect(typeof result[0].unit_price).toBe('number');
    expect(typeof result[0].total_price).toBe('number');
  });

  it('tier_name passes through (including null)', () => {
    const result = composeLineItems(noMobile, [
      { item_name: 'Sedan', tier_name: 'Sedan', unit_price: 0, total_price: 0 },
      { item_name: 'Flat', tier_name: null, unit_price: 0, total_price: 0 },
      { item_name: 'No field', unit_price: 0, total_price: 0 },
    ]);
    expect(result[0].tier_name).toBe('Sedan');
    expect(result[1].tier_name).toBeNull();
    expect(result[2].tier_name).toBeNull();
  });

  it('synthetic row has tier_name=null and is_mobile_fee=true (stable contract)', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Zone A',
      },
      [{ item_name: 'Service', tier_name: 'Sedan', unit_price: 50, total_price: 50 }]
    );
    const synthetic = result[1];
    expect(synthetic.tier_name).toBeNull();
    expect(synthetic.is_mobile_fee).toBe(true);
  });

  // Regression — the Q-0051 bug case verbatim
  it('Q-0051 bug case: $75 items + $40 mobile fee renders all 3 rows summing to $115', () => {
    const result: DisplayLineItem[] = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
      },
      [
        { item_name: 'Service A', quantity: 1, unit_price: 50, total_price: 50 },
        { item_name: 'Service B', quantity: 1, unit_price: 25, total_price: 25 },
      ]
    );
    const sum = result.reduce((acc, r) => acc + r.total_price, 0);
    expect(sum).toBe(115);
    expect(result).toHaveLength(3);
    expect(result[2].name).toBe('Mobile Service (0-3 miles)');
    expect(result[2].is_mobile_fee).toBe(true);
  });

  // Phase Mobile-1.8 — idempotency: composer must not duplicate the
  // mobile-fee row when the upstream items already carry it (notably the
  // `jobs.services` JSONB, materialized by /api/pos/jobs/populate).

  it('jobs.services JSONB shape WITH is_mobile_fee=true: composer does NOT append duplicate', () => {
    // Shape mirrors `JobServiceSnapshot` from jobs.services JSONB
    // (id, name, price, optional is_mobile_fee). RawLineItem ignores
    // the `id` field — only `name`, `price`, and `is_mobile_fee` matter
    // to the composer.
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
      },
      [
        { name: 'Express Exterior Wash', price: 75 },
        {
          name: 'Mobile Service (0-3 miles)',
          price: 40,
          is_mobile_fee: true,
        },
      ]
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Express Exterior Wash');
    expect(result[0].is_mobile_fee).not.toBe(true);
    expect(result[1].name).toBe('Mobile Service (0-3 miles)');
    expect(result[1].is_mobile_fee).toBe(true);
    const sum = result.reduce((acc, r) => acc + r.total_price, 0);
    expect(sum).toBe(115);
  });

  it('jobs.services JSONB shape: `price` field aliased to unit_price + total_price', () => {
    const result = composeLineItems(noMobile, [
      { name: 'From price field', price: 60 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].unit_price).toBe(60);
    expect(result[0].total_price).toBe(60);
  });

  it('jobs.services JSONB shape WITHOUT is_mobile_fee entry, source.is_mobile=true: composer appends synthetic', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
      },
      [{ name: 'Express Exterior Wash', price: 75 }]
    );
    expect(result).toHaveLength(2);
    expect(result[1].is_mobile_fee).toBe(true);
    expect(result[1].name).toBe('Mobile Service (0-3 miles)');
    expect(result[1].total_price).toBe(40);
  });

  it('quote_items shape (no is_mobile_fee anywhere), source.is_mobile=true: synthetic still appended (regression)', () => {
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Zone A',
      },
      [
        {
          item_name: 'Quote Item',
          quantity: 1,
          unit_price: 50,
          total_price: 50,
          tier_name: null,
        },
      ]
    );
    expect(result).toHaveLength(2);
    expect(result[1].is_mobile_fee).toBe(true);
  });

  it('mixed: input has is_mobile_fee=false entry + source.is_mobile=true: composer still appends synthetic', () => {
    // false-flagged entries don't count as pre-existing mobile fees;
    // the idempotency check is strict `=== true`.
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Zone A',
      },
      [
        {
          item_name: 'Regular Service',
          quantity: 1,
          unit_price: 50,
          total_price: 50,
          is_mobile_fee: false,
        },
      ]
    );
    expect(result).toHaveLength(2);
    // The false-flagged source row is NOT marked as mobile fee in output.
    expect(result[0].is_mobile_fee).not.toBe(true);
    expect(result[1].is_mobile_fee).toBe(true);
  });

  it('SD-jobs-detail bug repro: Express + materialized mobile entry renders TWO rows totaling $115, not three totaling $155', () => {
    // Production reproduction — appointment 524d02a5... (Nayeem Khan
    // walk-in mobile). jobs.services JSONB has Express + Mobile entry;
    // appointment.is_mobile=true with $40 surcharge. Before the fix,
    // composer appended a duplicate row → 3 rows summing to $155.
    const result = composeLineItems(
      {
        is_mobile: true,
        mobile_surcharge: 40,
        mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
      },
      [
        { name: 'Express Exterior Wash', price: 75 },
        {
          name: 'Mobile Service (0-3 miles)',
          price: 40,
          is_mobile_fee: true,
        },
      ]
    );
    expect(result).toHaveLength(2);
    const sum = result.reduce((acc, r) => acc + r.total_price, 0);
    expect(sum).toBe(115);
    // Confirm only ONE row is flagged mobile fee.
    expect(result.filter((r) => r.is_mobile_fee === true)).toHaveLength(1);
  });
});
