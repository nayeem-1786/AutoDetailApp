import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks must be declared before importing the SUT.
// findAvailableDetailer hits the DB; bypass it with a fixed UUID so the
// appointment insert payload is deterministic.
vi.mock('@/lib/utils/assign-detailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/assign-detailer')>(
    '@/lib/utils/assign-detailer'
  );
  return {
    ...actual,
    findAvailableDetailer: vi.fn(async () => 'detailer-fixture-uuid'),
  };
});

// Theme G — fireWebhook removed from production; no longer needs mocking.

// Phase 3 Theme A (AC-10): convertQuote now generates appointment_number via
// next_identifier('appointment'). Mock the helper so the test's supabase
// stub doesn't need to implement .rpc().
vi.mock('@/lib/utils/appointment-number', () => ({
  generateAppointmentNumber: vi.fn(async () => 'A-TEST-10001'),
}));

import { convertQuote } from '../convert-service';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-i regression — pins coupon propagation through Quote →
// Appointment on conversion. `quotes.coupon_code` MUST land on
// `appointments.coupon_code` so the downstream checkout-items fallback can
// recover it when no `job.quote_id` bridge is available (online-booking path
// or any future divergence). Without this, a coupon applied at the Quote
// phase silently disappears from the customer-facing receipt.
//
// The quote DB row holds only `coupon_code` — discount is computed at load
// time on the client (runtime state on QuoteState.coupon). So at convert
// time `coupon_discount` and `discount_amount` resolve to 0 in this layer;
// Layer 15g-ii adds `quotes.coupon_discount` and revisits.
// ──────────────────────────────────────────────────────────────────────────────

interface InsertRecord {
  table: string;
  row: Record<string, unknown>;
}

function makeSupabase(opts: {
  quote: Record<string, unknown>;
  inserts: InsertRecord[];
}) {
  // Phase 3 Theme F (F.7): the convertQuote update path now chains
  // `.update().eq().is().select()` so the mock's update builder needs
  // both the legacy `await .eq()` behavior AND a `.is(...).select(...)`
  // continuation. We model that with a thenable returned from `.eq()`:
  // the existing tests `await` it and resolve to `{ error: null }`;
  // the new F.7 paths chain `.is().select()` which then awaits to
  // `{ data: [{converted_appointment_id: 'appt-1'}], error: null }` —
  // simulating the happy-path "won the race" outcome (one row updated).
  const supabase = {
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: vi.fn(async () => ({ data: opts.quote, error: null })),
              }),
              // Used by F.7's race-loss path AND the F.7 pre-INSERT guard
              // (when quote.converted_appointment_id is set, the helper
              // re-reads from quotes to find the winning row).
              maybeSingle: vi.fn(async () => ({
                data: {
                  converted_appointment_id:
                    (opts.quote as { converted_appointment_id?: string | null })
                      .converted_appointment_id ?? null,
                },
                error: null,
              })),
            }),
          }),
          update: () => {
            const eqBuilder = {
              // Existing tests `await supabase.from('quotes').update().eq()`
              // → must resolve to `{ error: null }`. Modeled by adding
              // `then` so the object itself is a thenable.
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
              // New F.7 chain: `.eq().is().select()` returns rows.
              is: () => ({
                select: () =>
                  Promise.resolve({
                    data: [{ converted_appointment_id: 'appt-1' }],
                    error: null,
                  }),
              }),
            };
            return { eq: vi.fn(() => eqBuilder) };
          },
        };
      }
      if (table === 'appointments') {
        return {
          insert: (row: Record<string, unknown>) => {
            opts.inserts.push({ table, row });
            return {
              select: () => ({
                single: vi.fn(async () => ({
                  data: { id: 'appt-1', ...row },
                  error: null,
                })),
              }),
            };
          },
          // F.7 race-winner fetch (also pre-INSERT existing-appointment
          // probe when quote.converted_appointment_id is set on entry).
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'appt-existing', status: 'confirmed' },
                error: null,
              })),
            }),
          }),
          // F.7 orphan-rollback delete path.
          delete: () => ({
            eq: vi.fn(async () => ({ error: null })),
          }),
        };
      }
      if (table === 'appointment_services') {
        return {
          insert: vi.fn(async (rows: Record<string, unknown>[]) => {
            for (const r of rows) opts.inserts.push({ table, row: r });
            return { error: null };
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return supabase;
}

const BASE_QUOTE: Record<string, unknown> = {
  id: 'quote-1',
  customer_id: 'cust-1',
  vehicle_id: 'veh-1',
  status: 'sent',
  subtotal: 200,
  tax_amount: 18,
  total_amount: 218,
  notes: null,
  is_mobile: false,
  mobile_zone_id: null,
  mobile_address: null,
  mobile_surcharge: 0,
  mobile_zone_name_snapshot: null,
  items: [],
};

const CONVERT_INPUT = {
  date: '2026-05-20',
  time: '10:00',
  duration_minutes: 120,
  employee_id: null,
};

// ──────────────────────────────────────────────────────────────────────────────
// Post-Layer-15g-v fixture convention: `quote.total_amount` is now ALREADY
// net of all modifiers (the writer in `quote-service.ts:computeQuoteTotals`
// guarantees this). The previous test fixtures wrote `total_amount: 218`
// across the board (pre-discount), simulating the OLD writer behavior that
// `convert-service.ts` then defensively subtracted from. Layer 15g-v removed
// that subtraction; fixtures now reflect what a post-fix writer would have
// produced for each modifier combination. The assertion target — what lands
// on `appointments.total_amount` — is unchanged.
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — Item 15g Layer 15g-i coupon propagation', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('writes coupon_code to the appointment when the quote has one', async () => {
    // No modifier → writer's total_amount stays at subtotal + tax = 218.
    const quote = { ...BASE_QUOTE, coupon_code: 'SAVE25' };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    expect(result.success).toBe(true);
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert).toBeDefined();
    expect(apptInsert!.row.coupon_code).toBe('SAVE25');
    // Quote row has no discount snapshot in this layer — defaults preserved.
    expect(apptInsert!.row.discount_amount).toBe(0);
    expect(apptInsert!.row.coupon_discount).toBeNull();
    // total = subtotal + tax (- 0 discount) — unchanged from pre-fix behavior
    // when no discount info is available.
    expect(apptInsert!.row.total_amount).toBe(218);
  });

  it('writes null coupon_code to the appointment when the quote has none', async () => {
    const quote = { ...BASE_QUOTE, coupon_code: null };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    expect(result.success).toBe(true);
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert).toBeDefined();
    expect(apptInsert!.row.coupon_code).toBeNull();
    expect(apptInsert!.row.coupon_discount).toBeNull();
    expect(apptInsert!.row.discount_amount).toBe(0);
  });

  it('writes the persisted coupon discount to discount_amount + total_amount on convert', async () => {
    // Post-Layer-15g-v: the writer stores `total_amount` already net of
    // the runtime coupon, so the fixture reflects that. Convert pulls the
    // runtime `coupon.discount` for discount_amount provenance and trusts
    // `quote.total_amount` for the final appointment total.
    const quote = {
      ...BASE_QUOTE,
      total_amount: 193, // 218 - 25 (post-fix writer output)
      coupon_code: 'SAVE25',
      coupon: { discount: 25 },
    };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    expect(result.success).toBe(true);
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert!.row.coupon_code).toBe('SAVE25');
    expect(apptInsert!.row.coupon_discount).toBe(25);
    expect(apptInsert!.row.discount_amount).toBe(25);
    expect(apptInsert!.row.total_amount).toBe(193);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-ii regression — pins full modifier propagation through
// Quote → Appointment on conversion. Layer 15g-i shipped coupon-only; this
// layer extends to loyalty + manual-discount + coupon-discount snapshot
// (the schema migration in 15g-ii added the columns to both quotes and
// appointments). Each test asserts both the per-modifier dedicated column
// AND the aggregate `discount_amount` + `total_amount` for analytics-reader
// compatibility.
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — Item 15g Layer 15g-ii modifier propagation', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('propagates loyalty_points_to_redeem + loyalty_discount to the appointment', async () => {
    const quote = {
      ...BASE_QUOTE,
      total_amount: 213, // 218 - 5 (post-Layer-15g-v writer output)
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5, // 100 pts * $0.05 = $5
    };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    expect(result.success).toBe(true);
    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.loyalty_points_redeemed).toBe(100);
    expect(apptInsert.row.loyalty_discount).toBe(5);
    expect(apptInsert.row.discount_amount).toBe(5);
    expect(apptInsert.row.total_amount).toBe(213); // matches persisted net
  });

  it('propagates manual-discount type=dollar + value + label to the appointment', async () => {
    const quote = {
      ...BASE_QUOTE,
      total_amount: 188, // 218 - 30 (post-Layer-15g-v writer output)
      manual_discount_type: 'dollar' as const,
      manual_discount_value: 30,
      manual_discount_label: 'First-time customer',
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.manual_discount_value).toBe(30);
    expect(apptInsert.row.manual_discount_label).toBe('First-time customer');
    expect(apptInsert.row.discount_amount).toBe(30);
    expect(apptInsert.row.total_amount).toBe(188);
  });

  it('propagates manual-discount type=percent — converts to dollar against subtotal', async () => {
    // 10% of $200 subtotal = $20 manual discount.
    const quote = {
      ...BASE_QUOTE,
      total_amount: 198, // 218 - 20 (post-Layer-15g-v writer output)
      manual_discount_type: 'percent' as const,
      manual_discount_value: 10,
      manual_discount_label: 'Loyalty member',
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.manual_discount_value).toBe(20);
    expect(apptInsert.row.manual_discount_label).toBe('Loyalty member');
    expect(apptInsert.row.discount_amount).toBe(20);
    expect(apptInsert.row.total_amount).toBe(198);
  });

  it('propagates persisted quotes.coupon_discount snapshot (preferred over runtime)', async () => {
    // The persisted snapshot is canonical at conversion time; runtime
    // coupon.discount is only a fallback for the immediate POS save path.
    const quote = {
      ...BASE_QUOTE,
      total_amount: 178, // 218 - 40 (post-Layer-15g-v writer output)
      coupon_code: 'SAVE40',
      coupon_discount: 40,
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.coupon_code).toBe('SAVE40');
    expect(apptInsert.row.coupon_discount).toBe(40);
    expect(apptInsert.row.discount_amount).toBe(40);
    expect(apptInsert.row.total_amount).toBe(178);
  });

  it('combines all three modifiers — coupon + loyalty + manual — into discount_amount', async () => {
    const quote = {
      ...BASE_QUOTE,
      total_amount: 173, // 218 - 45 (post-Layer-15g-v writer output)
      coupon_code: 'SAVE25',
      coupon_discount: 25,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
      manual_discount_type: 'dollar' as const,
      manual_discount_value: 15,
      manual_discount_label: 'Cashier override',
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.coupon_discount).toBe(25);
    expect(apptInsert.row.loyalty_points_redeemed).toBe(100);
    expect(apptInsert.row.loyalty_discount).toBe(5);
    expect(apptInsert.row.manual_discount_value).toBe(15);
    expect(apptInsert.row.manual_discount_label).toBe('Cashier override');
    expect(apptInsert.row.discount_amount).toBe(45); // 25 + 5 + 15
    expect(apptInsert.row.total_amount).toBe(173);
  });

  it('writes default zeros / nulls when no modifiers are set', async () => {
    const supabase = makeSupabase({ quote: { ...BASE_QUOTE }, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.loyalty_points_redeemed).toBe(0);
    expect(apptInsert.row.loyalty_discount).toBe(0);
    expect(apptInsert.row.manual_discount_value).toBeNull();
    expect(apptInsert.row.manual_discount_label).toBeNull();
    expect(apptInsert.row.coupon_discount).toBeNull();
    expect(apptInsert.row.discount_amount).toBe(0);
    expect(apptInsert.row.total_amount).toBe(218); // unchanged
  });

  it('clamps total_amount to >= 0 when persisted quote total is exhausted by modifiers', async () => {
    // Defensive: a misconfigured manual discount equal-to-or-greater-than
    // subtotal must not produce a negative total on the appointment row.
    // Post-Layer-15g-v: the writer's clamp ensures persisted `total_amount`
    // is already 0 in this scenario; convert preserves it via its own
    // defense-in-depth `Math.max(0, …)`.
    const quote = {
      ...BASE_QUOTE,
      subtotal: 50,
      total_amount: 0, // post-fix writer clamps when discount exceeds subtotal+tax
      manual_discount_type: 'dollar' as const,
      manual_discount_value: 200, // > subtotal; resolver clamps to subtotal=50
      manual_discount_label: 'Over-discount',
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.manual_discount_value).toBe(50); // clamped to subtotal
    expect(apptInsert.row.discount_amount).toBe(50);
    expect(apptInsert.row.total_amount).toBe(0); // clamped to non-negative
  });

  it('clears manual_discount_label when manual_discount_value is null', async () => {
    // Coherence: if value is missing/zero, the label cannot be stored
    // (DB CHECK constraint appointments_manual_discount_coherent).
    const quote = {
      ...BASE_QUOTE,
      manual_discount_type: null,
      manual_discount_value: null,
      manual_discount_label: 'Stale label',
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.manual_discount_value).toBeNull();
    expect(apptInsert.row.manual_discount_label).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-v regression — post-fix convert trusts the persisted
// `quotes.total_amount` as net-of-modifiers (the writer now guarantees this
// via `computeQuoteTotals`). The previous workaround in convert-service.ts
// — `Number(quote.total_amount) - totalDiscount` — was removed; convert now
// reads the persisted total directly with a defense-in-depth `Math.max(0, …)`
// clamp. These tests pin the contract: for a modifier-bearing quote whose
// writer-produced `total_amount` IS net, convert produces an
// `appointments.total_amount` equal to that persisted net (no double-
// subtraction).
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — Item 15g Layer 15g-v writer-trust contract', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('appointment.total_amount equals persisted quotes.total_amount for coupon-only', async () => {
    const quote = {
      ...BASE_QUOTE,
      total_amount: 193,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
    };
    const supabase = makeSupabase({ quote, inserts });
    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );
    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.total_amount).toBe(193);
  });

  it('appointment.total_amount equals persisted quotes.total_amount for loyalty-only', async () => {
    const quote = {
      ...BASE_QUOTE,
      total_amount: 213,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
    };
    const supabase = makeSupabase({ quote, inserts });
    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );
    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.total_amount).toBe(213);
  });

  it('appointment.total_amount equals persisted quotes.total_amount for combined modifiers (Q-0067-style)', async () => {
    // Mirrors the audit's Q-0067 case at smaller numbers: subtotal $200,
    // coupon $25 + loyalty $5 + manual $15 = $45 discount → net $173.
    const quote = {
      ...BASE_QUOTE,
      total_amount: 173,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
      manual_discount_type: 'dollar' as const,
      manual_discount_value: 15,
      manual_discount_label: 'Cashier override',
    };
    const supabase = makeSupabase({ quote, inserts });
    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );
    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.total_amount).toBe(173);
  });

  it('defense-in-depth: legacy pre-fix quote with stale pre-discount total clamps to non-negative', async () => {
    // Edge case: a quote written BEFORE Layer 15g-v hasn't been auto-saved
    // yet — its persisted `total_amount` is still pre-discount. Convert
    // should still clamp the result to ≥ 0 even though it no longer
    // subtracts modifiers itself. The number will be "wrong-ish" until the
    // quote's next edit triggers a writer recompute (audit §5.5 watch-item),
    // but it won't be negative.
    const quote = {
      ...BASE_QUOTE,
      total_amount: -5, // hypothetical corrupt persisted value
      coupon_code: 'SAVE25',
      coupon_discount: 25,
    };
    const supabase = makeSupabase({ quote, inserts });
    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );
    const apptInsert = inserts.find((i) => i.table === 'appointments')!;
    expect(apptInsert.row.total_amount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// D48 (Issue 42) regression — pins per-row quantity propagation through
// Quote → Appointment on conversion. Before D48, `appointment_services`
// had no `quantity` column and `convert-service.ts:170-184` silently
// flattened multi-quantity `quote_items` to qty=1 rows. The schema
// migration (20260526182120) added the column with DEFAULT 1; convert
// now copies `item.quantity ?? 1` into the INSERT payload so per_row × N
// quotes preserve their qty signal end-to-end.
//
// Coverage:
//   1. per_row × 2 quote → appointment_services row with quantity=2
//   2. Single-quantity tiered quote → row with quantity=1 (regression)
//   3. Non-tiered service → row with quantity=1 (regression — pricing_model
//      doesn't affect quantity)
//   4. Multi-item quote (mix of qty=1 and qty>1) → row-per-row preservation
//   5. Item missing the optional `quantity` field → defaults to 1
//      (defensive; DB DEFAULT also handles, but the code path is `?? 1`)
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — D48 (Issue 42) appointment_services.quantity propagation', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('per_row × 2 quote → appointment_services row with quantity=2', async () => {
    const quote = {
      ...BASE_QUOTE,
      items: [
        {
          service_id: 'svc-hot-shampoo',
          unit_price: 60,
          tier_name: 'row',
          quantity: 2,
        },
      ],
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const svcInsert = inserts.find((i) => i.table === 'appointment_services');
    expect(svcInsert).toBeDefined();
    expect(svcInsert!.row.service_id).toBe('svc-hot-shampoo');
    expect(svcInsert!.row.tier_name).toBe('row');
    expect(svcInsert!.row.price_at_booking).toBe(60);
    expect(svcInsert!.row.quantity).toBe(2);
  });

  it('single-quantity tiered quote → appointment_services row with quantity=1', async () => {
    const quote = {
      ...BASE_QUOTE,
      items: [
        {
          service_id: 'svc-hot-shampoo',
          unit_price: 80,
          tier_name: 'floor_mats',
          quantity: 1,
        },
      ],
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const svcInsert = inserts.find((i) => i.table === 'appointment_services');
    expect(svcInsert).toBeDefined();
    expect(svcInsert!.row.tier_name).toBe('floor_mats');
    expect(svcInsert!.row.quantity).toBe(1);
  });

  it('non-tiered service (tier_name=null) → appointment_services row with quantity=1', async () => {
    // pricing_model doesn't affect quantity — flat/per_unit/custom services
    // still write quantity per the quote_item, defaulting to 1.
    const quote = {
      ...BASE_QUOTE,
      items: [
        {
          service_id: 'svc-express-wash',
          unit_price: 35,
          tier_name: null,
          quantity: 1,
        },
      ],
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const svcInsert = inserts.find((i) => i.table === 'appointment_services');
    expect(svcInsert).toBeDefined();
    expect(svcInsert!.row.tier_name).toBeNull();
    expect(svcInsert!.row.quantity).toBe(1);
  });

  it('multi-item quote with mixed quantities preserves row-by-row qty', async () => {
    const quote = {
      ...BASE_QUOTE,
      items: [
        {
          service_id: 'svc-hot-shampoo',
          unit_price: 60,
          tier_name: 'row',
          quantity: 2,
        },
        {
          service_id: 'svc-express-wash',
          unit_price: 35,
          tier_name: null,
          quantity: 1,
        },
        {
          service_id: 'svc-ceramic',
          unit_price: 300,
          tier_name: 'sedan',
          quantity: 1,
        },
      ],
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const svcInserts = inserts.filter((i) => i.table === 'appointment_services');
    expect(svcInserts).toHaveLength(3);

    const hotShampoo = svcInserts.find((i) => i.row.service_id === 'svc-hot-shampoo')!;
    expect(hotShampoo.row.quantity).toBe(2);
    expect(hotShampoo.row.tier_name).toBe('row');

    const expressWash = svcInserts.find((i) => i.row.service_id === 'svc-express-wash')!;
    expect(expressWash.row.quantity).toBe(1);

    const ceramic = svcInserts.find((i) => i.row.service_id === 'svc-ceramic')!;
    expect(ceramic.row.quantity).toBe(1);
  });

  it('item missing the quantity field defaults to 1 (defensive)', async () => {
    // The DB column has DEFAULT 1; the code path uses `item.quantity ?? 1`
    // as defense-in-depth so the INSERT payload is always explicit.
    const quote = {
      ...BASE_QUOTE,
      items: [
        {
          service_id: 'svc-flat',
          unit_price: 50,
          tier_name: null,
          // quantity intentionally omitted
        },
      ],
    };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT
    );

    const svcInsert = inserts.find((i) => i.table === 'appointment_services');
    expect(svcInsert).toBeDefined();
    expect(svcInsert!.row.quantity).toBe(1);
  });
});

// Theme G removed the entire `Session 1.7 conditional appointment_confirmed
// webhook fire` describe block (4 tests). The conditional gate those tests
// pinned has been deleted alongside the rest of the fireWebhook surface —
// Smart Details has no n8n receiver wired (audit f5e714a8). The bug class
// Session 1.7 closed (misleading-customer events fired against pending rows)
// is now structurally prevented: there is no outbound webhook to mis-fire.
// The "appointment row is still written + quote still updated to converted
// regardless of webhook gate" assertion folds into the unconditional happy-path
// tests above (the convertQuote contract for pending writes is verified by
// the surrounding describe blocks).

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme F (F.7) — race idempotency guard
//
// Two race surfaces, two test groups:
//
//   1. Pre-INSERT race-loss (the easy case): the quote already carries a
//      `converted_appointment_id` at convertQuote entry — a concurrent caller
//      (sibling convertQuote, OR the walk-in seam post-F.2) won. Return
//      success with the winner's appointment fetched fresh; `already_converted`
//      is true so downstream callers (voice-agent, Theme C) can suppress
//      duplicate side effects.
//
//   2. Post-INSERT race-loss (the hard case): we passed the pre-check,
//      INSERTed our appointment, but our UPDATE landed AFTER a sibling's
//      UPDATE — so the `.is('converted_appointment_id', null)` filter matches
//      zero rows. Our appointment is now an orphan; the helper rolls it
//      back and re-reads the race-winner.
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — Phase 3 Theme F (F.7) race idempotency guard', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('pre-INSERT: returns the race-winner appointment with already_converted=true when the quote enters with converted_appointment_id set', async () => {
    // Quote entered the helper already carrying the FK — pre-F.7 this hit
    // the `status==='converted'` guard and returned the 400 "already
    // converted" rejection. Post-F.7 the FK is the canonical signal: short-
    // circuit with the existing appointment fetched fresh from the DB.
    const quote = {
      ...BASE_QUOTE,
      status: 'converted',
      converted_appointment_id: 'appt-existing',
    };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.already_converted).toBe(true);
      expect((result.appointment as { id: string }).id).toBe('appt-existing');
    }
    // CRUCIAL: no new appointment INSERT happened — race-loss must not
    // create a duplicate row.
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert).toBeUndefined();
  });

  // Theme G removed the `pre-INSERT: webhook does NOT fire on the
  // already_converted path` test — fireWebhook no longer exists, so the
  // race-winner-already-fired assertion is moot.

  it('legacy guard still rejects the converted-without-FK shape (walk-in pre-F.2 historical state)', async () => {
    // A quote that's status='converted' but has converted_appointment_id=NULL
    // is the pre-F.2 walk-in artifact — there's no appointment row to
    // race-return. Fall through to the legacy 400. After F.2 ships, fresh
    // walk-ins always set the FK so this branch only protects historical data.
    const quote = {
      ...BASE_QUOTE,
      status: 'converted',
      converted_appointment_id: null,
    };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/already-converted/i);
    }
  });

  it('non-race happy path: no converted_appointment_id on entry → INSERT proceeds; success.already_converted is not true', async () => {
    // Defensive: the F.7 changes must not regress the standard happy path.
    // A fresh quote with no FK and status='sent' proceeds to the INSERT,
    // appointment lands, success has the new appointment row (NOT the mock's
    // 'appt-existing' row — that's only returned on the race-loss path).
    const quote = { ...BASE_QUOTE };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // already_converted is omitted on the happy path (the optional field
      // stays undefined). Existing callers that don't read it continue to
      // work identically to pre-F.7 behavior.
      expect(result.already_converted).toBeUndefined();
      expect((result.appointment as { id: string }).id).toBe('appt-1');
    }
    // The fresh INSERT did fire.
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme C.2 (AC-12) — pins the convertQuote-side wiring that supports
// customer-accept auto-conversion:
//
//   1. `appointments.quote_id` is ALWAYS written (every caller — operator POS,
//      voice agent, admin, customer accept). The new column carries a UNIQUE
//      partial index added by Theme C.1 — a missing write defeats DB-layer
//      race protection.
//   2. `scheduled_date_placeholder` defaults to `false` and follows the new
//      `placeholderDate` option when set. The customer-accept orchestrator
//      passes `true`; every other caller omits and gets `false`.
//   3. `options.channel='customer_accept'` lands on the appointment row.
//   4. `options.appointmentStatus='pending'` lands on the appointment row.
//
// These together pin the convertQuote contract that processCustomerAccept
// depends on; the orchestrator's own tests live in customer-accept-service.test.ts.
// ──────────────────────────────────────────────────────────────────────────────

describe('convertQuote — Phase 3 Theme C.2 (AC-12) wiring', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('writes appointments.quote_id on every conversion (no options)', async () => {
    const quote = { ...BASE_QUOTE };
    const supabase = makeSupabase({ quote, inserts });

    const result = await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
    );

    expect(result.success).toBe(true);
    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert).toBeDefined();
    // Theme C.1 UNIQUE backstop requires this on EVERY conversion.
    expect(apptInsert!.row.quote_id).toBe('quote-1');
  });

  it('defaults scheduled_date_placeholder to false when option not passed', async () => {
    const quote = { ...BASE_QUOTE };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert!.row.scheduled_date_placeholder).toBe(false);
  });

  it('sets scheduled_date_placeholder=true when placeholderDate option is passed', async () => {
    const quote = { ...BASE_QUOTE };
    const supabase = makeSupabase({ quote, inserts });

    await convertQuote(
      supabase as unknown as Parameters<typeof convertQuote>[0],
      'quote-1',
      CONVERT_INPUT,
      { placeholderDate: true, channel: 'customer_accept', appointmentStatus: 'pending' },
    );

    const apptInsert = inserts.find((i) => i.table === 'appointments');
    expect(apptInsert!.row.scheduled_date_placeholder).toBe(true);
    expect(apptInsert!.row.channel).toBe('customer_accept');
    expect(apptInsert!.row.status).toBe('pending');
    // quote_id still propagated.
    expect(apptInsert!.row.quote_id).toBe('quote-1');
  });
});
