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

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async () => undefined),
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
  const supabase = {
    from(table: string) {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: vi.fn(async () => ({ data: opts.quote, error: null })),
              }),
            }),
          }),
          update: () => ({
            eq: vi.fn(async () => ({ error: null })),
          }),
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

describe('convertQuote — Item 15g Layer 15g-i coupon propagation', () => {
  let inserts: InsertRecord[];

  beforeEach(() => {
    inserts = [];
  });

  it('writes coupon_code to the appointment when the quote has one', async () => {
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

  it('subtracts the runtime coupon discount from total when present on the input quote', async () => {
    // Forward-compatibility: if a caller (or Layer 15g-ii materialized
    // `quotes.coupon_discount`) hydrates `quote.coupon.discount`, convert
    // should reflect it in both `discount_amount` and `total_amount`.
    const quote = {
      ...BASE_QUOTE,
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
    expect(apptInsert!.row.total_amount).toBe(193); // 218 - 25
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
    expect(apptInsert.row.total_amount).toBe(213); // 218 - 5
  });

  it('propagates manual-discount type=dollar + value + label to the appointment', async () => {
    const quote = {
      ...BASE_QUOTE,
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
    expect(apptInsert.row.total_amount).toBe(188); // 218 - 30
  });

  it('propagates manual-discount type=percent — converts to dollar against subtotal', async () => {
    // 10% of $200 subtotal = $20 manual discount.
    const quote = {
      ...BASE_QUOTE,
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
    expect(apptInsert.row.total_amount).toBe(198); // 218 - 20
  });

  it('propagates persisted quotes.coupon_discount snapshot (preferred over runtime)', async () => {
    // The persisted snapshot is canonical at conversion time; runtime
    // coupon.discount is only a fallback for the immediate POS save path.
    const quote = {
      ...BASE_QUOTE,
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
    expect(apptInsert.row.total_amount).toBe(178); // 218 - 40
  });

  it('combines all three modifiers — coupon + loyalty + manual — into discount_amount', async () => {
    const quote = {
      ...BASE_QUOTE,
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
    expect(apptInsert.row.total_amount).toBe(173); // 218 - 45
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

  it('clamps total_amount to >= 0 when modifiers exceed quote total', async () => {
    // Defensive: a misconfigured manual discount equal-to-or-greater-than
    // subtotal must not produce a negative total on the appointment row.
    const quote = {
      ...BASE_QUOTE,
      subtotal: 50,
      total_amount: 50,
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
