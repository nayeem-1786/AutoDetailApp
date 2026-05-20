import { describe, it, expect, beforeEach, vi } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-ii regression — pins the modifier-snapshot persistence
// surface in createQuote + updateQuote. Both routes accept the new
// coupon_discount / loyalty_* / manual_discount_* fields from the schema
// migration and write them to the quotes table. Coherence between (type,
// value, label) and (points, discount) is enforced both server-side (in
// normalizeManualDiscount + normalizeLoyaltyRedemption) and at the DB layer
// (quotes_manual_discount_coherent + quotes_loyalty_coherent CHECK
// constraints).
//
// The Supabase client is mocked so this suite stays free of network /
// migration dependencies. Mobile-field resolution is also mocked because
// the modifier surface is independent of mobile state.
// ──────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils/quote-number', () => ({
  generateQuoteNumber: vi.fn(async () => 'Q-TEST-001'),
}));

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async () => undefined),
}));

vi.mock('@/lib/utils/resolve-mobile-fields', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/resolve-mobile-fields')>(
    '@/lib/utils/resolve-mobile-fields'
  );
  return {
    ...actual,
    resolveMobileFields: vi.fn(async () => ({
      isMobile: false,
      zoneId: null,
      address: null,
      surcharge: 0,
      snapshotName: null,
    })),
  };
});

import { createQuote, updateQuote } from '../quote-service';

interface InsertRecord {
  table: string;
  row: Record<string, unknown>;
}

interface UpdateRecord {
  table: string;
  patch: Record<string, unknown>;
  id?: string;
}

function makeSupabase(opts: {
  existingQuote?: Record<string, unknown>;
  inserts?: InsertRecord[];
  updates?: UpdateRecord[];
}) {
  const inserts = opts.inserts ?? [];
  const updates = opts.updates ?? [];
  let lastUpdateTable: string | null = null;
  let lastUpdatePatch: Record<string, unknown> | null = null;

  const supabase = {
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: vi.fn(async () => ({
                  data: opts.existingQuote ?? null,
                  error: opts.existingQuote ? null : { message: 'not found' },
                })),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserts.push({ table, row });
            return {
              select: () => ({
                single: vi.fn(async () => ({
                  data: { id: 'quote-new', quote_number: row.quote_number, ...row },
                  error: null,
                })),
              }),
            };
          },
          update: (patch: Record<string, unknown>) => {
            lastUpdateTable = table;
            lastUpdatePatch = patch;
            return {
              eq: (k: string, v: string) => {
                updates.push({ table: lastUpdateTable!, patch: lastUpdatePatch!, id: v });
                return {
                  select: () => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: v,
                        ...opts.existingQuote,
                        ...patch,
                        items: [],
                      },
                      error: null,
                    })),
                  }),
                };
              },
            };
          },
        };
      }
      if (table === 'quote_items') {
        return {
          insert: (rows: Record<string, unknown>[]) => {
            for (const r of rows) inserts.push({ table, row: r });
            return {
              select: vi.fn(async () => ({ data: rows, error: null })),
            };
          },
          delete: () => ({
            eq: vi.fn(async () => ({ error: null })),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return supabase;
}

const BASE_INSERT_INPUT = {
  customer_id: '00000000-0000-0000-0000-000000000001',
  vehicle_id: '00000000-0000-0000-0000-000000000002',
  items: [
    {
      service_id: '00000000-0000-0000-0000-000000000003',
      item_name: 'Test Service',
      quantity: 1,
      unit_price: 200,
    },
  ],
};

describe('createQuote — Item 15g Layer 15g-ii modifier persistence', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('persists coupon_discount snapshot when supplied', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
    } as Parameters<typeof createQuote>[1]);

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.coupon_code).toBe('SAVE25');
    expect(quoteInsert.row.coupon_discount).toBe(25);
  });

  it('persists loyalty_points_to_redeem + loyalty_discount coherently', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
    } as Parameters<typeof createQuote>[1]);

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.loyalty_points_to_redeem).toBe(100);
    expect(quoteInsert.row.loyalty_discount).toBe(5);
  });

  it('persists manual_discount type=dollar + value + label coherently', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'dollar',
      manual_discount_value: 30,
      manual_discount_label: 'First-time customer',
    } as Parameters<typeof createQuote>[1]);

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.manual_discount_type).toBe('dollar');
    expect(quoteInsert.row.manual_discount_value).toBe(30);
    expect(quoteInsert.row.manual_discount_label).toBe('First-time customer');
  });

  it('collapses partial manual-discount (type without value) to fully-null to satisfy CHECK constraint', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'dollar',
      manual_discount_value: null,
      manual_discount_label: 'Stale label',
    } as unknown as Parameters<typeof createQuote>[1]);

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.manual_discount_type).toBeNull();
    expect(quoteInsert.row.manual_discount_value).toBeNull();
    expect(quoteInsert.row.manual_discount_label).toBeNull();
  });

  it('collapses zero or negative manual-discount value to fully-null', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'percent',
      manual_discount_value: 0,
      manual_discount_label: 'Zero',
    } as unknown as Parameters<typeof createQuote>[1]);

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.manual_discount_value).toBeNull();
    expect(quoteInsert.row.manual_discount_type).toBeNull();
  });

  it('rejects percent manual-discount > 100 with QuoteValidationError', async () => {
    const supabase = makeSupabase({ inserts });
    await expect(
      createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
        ...BASE_INSERT_INPUT,
        manual_discount_type: 'percent',
        manual_discount_value: 150,
        manual_discount_label: 'Over the line',
      } as unknown as Parameters<typeof createQuote>[1])
    ).rejects.toThrow('Percent manual discount cannot exceed 100');
  });

  it('writes all-nulls for modifier columns when payload omits them', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(
      supabase as unknown as Parameters<typeof createQuote>[0],
      BASE_INSERT_INPUT as Parameters<typeof createQuote>[1]
    );

    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.coupon_discount).toBeNull();
    expect(quoteInsert.row.loyalty_points_to_redeem).toBeNull();
    expect(quoteInsert.row.loyalty_discount).toBeNull();
    expect(quoteInsert.row.manual_discount_type).toBeNull();
    expect(quoteInsert.row.manual_discount_value).toBeNull();
    expect(quoteInsert.row.manual_discount_label).toBeNull();
  });
});

describe('updateQuote — Item 15g Layer 15g-ii modifier persistence', () => {
  let updates: UpdateRecord[];

  beforeEach(() => {
    updates = [];
  });

  it('updates coupon_discount when the field is supplied', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      { coupon_discount: 25 } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.coupon_discount).toBe(25);
  });

  it('clears coupon_discount when explicitly nulled', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      { coupon_discount: null } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.coupon_discount).toBeNull();
  });

  it('updates the full manual-discount triple coherently', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        manual_discount_type: 'percent',
        manual_discount_value: 10,
        manual_discount_label: 'Loyalty member',
      } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.manual_discount_type).toBe('percent');
    expect(apptUpdate.patch.manual_discount_value).toBe(10);
    expect(apptUpdate.patch.manual_discount_label).toBe('Loyalty member');
  });

  it('updates loyalty pair coherently when both supplied', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        loyalty_points_to_redeem: 50,
        loyalty_discount: 2.5,
      } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.loyalty_points_to_redeem).toBe(50);
    expect(apptUpdate.patch.loyalty_discount).toBe(2.5);
  });

  it('does NOT touch modifier columns when the payload omits them', async () => {
    // Surgical update guard: PATCHing only `notes` must not clobber a
    // previously-set manual-discount snapshot to null.
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      { notes: 'just a note change' } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect('coupon_discount' in apptUpdate.patch).toBe(false);
    expect('manual_discount_type' in apptUpdate.patch).toBe(false);
    expect('manual_discount_value' in apptUpdate.patch).toBe(false);
    expect('manual_discount_label' in apptUpdate.patch).toBe(false);
    expect('loyalty_points_to_redeem' in apptUpdate.patch).toBe(false);
    expect('loyalty_discount' in apptUpdate.patch).toBe(false);
  });

  it('collapses partial manual-discount on update to fully-null (matches createQuote behavior)', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        manual_discount_type: 'dollar',
        manual_discount_value: 0, // non-positive → collapse
        manual_discount_label: 'Will be discarded',
      } as unknown as Parameters<typeof updateQuote>[2]
    );

    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.manual_discount_type).toBeNull();
    expect(apptUpdate.patch.manual_discount_value).toBeNull();
    expect(apptUpdate.patch.manual_discount_label).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-v regression — pins the writer-side `total_amount`
// formula. createQuote + updateQuote now both compute
//   total_amount = subtotal + tax_amount
//                  − (coupon_discount + loyalty_discount + resolved_manual_discount),
// clamped to ≥ 0. Pre-Layer-15g-v writers wrote `subtotal + tax` with no
// modifier subtraction, leaving 17 of 18 readers (SMS link, email, PDF,
// public landing, voice agent, AI responder, analytics) displaying
// inflated pre-discount totals. The audit motivating this fix is
// `docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md`.
//
// Both writers route through the canonical `computeQuoteTotals` helper so
// the writer + the converter (`convert-service.ts`) + the in-memory POS
// reducer (`quote-reducer.ts`) all produce the same number for the same
// inputs.
// ──────────────────────────────────────────────────────────────────────────────

describe('createQuote — Item 15g Layer 15g-v total_amount = net', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  // subtotal: 1 × $200 = $200, tax: 0 (service items only)
  const NO_MOD_TOTAL = 200;

  it('writes subtotal + tax when no modifiers (regression baseline)', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(
      supabase as unknown as Parameters<typeof createQuote>[0],
      BASE_INSERT_INPUT as Parameters<typeof createQuote>[1]
    );
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.subtotal).toBe(NO_MOD_TOTAL);
    expect(quoteInsert.row.total_amount).toBe(NO_MOD_TOTAL);
  });

  it('subtracts coupon_discount from total_amount', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(175); // 200 - 25
  });

  it('subtracts loyalty_discount from total_amount', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(195); // 200 - 5
  });

  it('subtracts manual_discount type=dollar from total_amount', async () => {
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'dollar',
      manual_discount_value: 30,
      manual_discount_label: 'First-time customer',
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(170); // 200 - 30
  });

  it('resolves manual_discount type=percent against subtotal before subtracting', async () => {
    // 10% of $200 = $20 manual discount
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'percent',
      manual_discount_value: 10,
      manual_discount_label: 'Loyalty member',
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(180); // 200 - 20
  });

  it('combines all three modifiers: coupon + loyalty + manual', async () => {
    // Mirrors Q-0067-style scenario at smaller numbers (audit subject).
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
      manual_discount_type: 'dollar',
      manual_discount_value: 15,
      manual_discount_label: 'Cashier override',
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(155); // 200 - 45
  });

  it('clamps total_amount to >= 0 when modifiers exceed subtotal + tax', async () => {
    // Defensive: oversized manual dollar discount must not produce a
    // negative persisted total.
    const supabase = makeSupabase({ inserts });
    await createQuote(supabase as unknown as Parameters<typeof createQuote>[0], {
      ...BASE_INSERT_INPUT,
      manual_discount_type: 'dollar',
      manual_discount_value: 500, // > subtotal; resolveManualDiscountAmount clamps to 200
      manual_discount_label: 'Over-discount',
    } as Parameters<typeof createQuote>[1]);
    const quoteInsert = inserts.find((i) => i.table === 'quotes')!;
    expect(quoteInsert.row.total_amount).toBe(0); // 200 - 200, clamped
  });
});

describe('updateQuote — Item 15g Layer 15g-v total_amount recompute', () => {
  let updates: UpdateRecord[];

  beforeEach(() => {
    updates = [];
  });

  it('does NOT recompute total when ONLY non-financial fields change', async () => {
    // PATCH with notes only — formula inputs unchanged → no subtotal/tax/total
    // touched in patch.
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      { notes: 'just a note change' } as unknown as Parameters<typeof updateQuote>[2]
    );
    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect('subtotal' in apptUpdate.patch).toBe(false);
    expect('tax_amount' in apptUpdate.patch).toBe(false);
    expect('total_amount' in apptUpdate.patch).toBe(false);
  });

  it('recomputes total_amount when modifier-only PATCH lands (lifts pre-15g-v items-guard)', async () => {
    // Pre-15g-v, the recompute branch was gated behind `data.items` being
    // supplied — so a modifier-only PATCH wrote stale totals. Auto-save in
    // 15g-ii now hashes modifiers and PATCHes them without items, so the
    // gate had to be lifted.
    //
    // Existing-row fetch returns the mock's existingQuote (no items, no
    // mobile, no other modifiers); effective subtotal is 0, so the new
    // total_amount = max(0, 0 + 0 - 25) = 0. The point of this assertion is
    // that the recompute *fired* (total_amount key present), not that the
    // value matches a specific number — the mock doesn't reproduce real
    // existing-row data.
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      { coupon_discount: 25 } as unknown as Parameters<typeof updateQuote>[2]
    );
    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect('total_amount' in apptUpdate.patch).toBe(true);
    expect('subtotal' in apptUpdate.patch).toBe(true);
    expect('tax_amount' in apptUpdate.patch).toBe(true);
  });

  it('recomputes total_amount when loyalty-only PATCH lands', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        loyalty_points_to_redeem: 50,
        loyalty_discount: 2.5,
      } as unknown as Parameters<typeof updateQuote>[2]
    );
    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect('total_amount' in apptUpdate.patch).toBe(true);
  });

  it('recomputes total_amount when manual-discount-only PATCH lands', async () => {
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        manual_discount_type: 'percent',
        manual_discount_value: 10,
        manual_discount_label: 'Loyalty member',
      } as unknown as Parameters<typeof updateQuote>[2]
    );
    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect('total_amount' in apptUpdate.patch).toBe(true);
  });

  it('recomputes total_amount when items + all modifiers supplied (no DB fetch needed)', async () => {
    // Full-replacement PATCH: all formula inputs supplied. Computed math
    // is deterministic.
    const supabase = makeSupabase({
      existingQuote: { id: 'q-1', status: 'draft' },
      updates,
    });
    await updateQuote(
      supabase as unknown as Parameters<typeof updateQuote>[0],
      'q-1',
      {
        items: [
          {
            service_id: '00000000-0000-0000-0000-000000000003',
            item_name: 'Test Service',
            quantity: 1,
            unit_price: 300,
          },
        ],
        is_mobile: false,
        coupon_discount: 50,
        loyalty_points_to_redeem: 100,
        loyalty_discount: 5,
        manual_discount_type: 'dollar',
        manual_discount_value: 10,
        manual_discount_label: 'Manager comp',
      } as unknown as Parameters<typeof updateQuote>[2]
    );
    const apptUpdate = updates.find((u) => u.table === 'quotes')!;
    expect(apptUpdate.patch.subtotal).toBe(300);
    expect(apptUpdate.patch.tax_amount).toBe(0); // service items not taxable
    expect(apptUpdate.patch.total_amount).toBe(235); // 300 - 50 - 5 - 10
  });
});
