/**
 * Phase 0b.1 composer tests.
 *
 * Two test layers:
 *
 *   1. Pure composer function tests (synthetic raw inputs → structured output).
 *      Lock down composer behavior independent of any renderer.
 *
 *   2. Fixture regression tests. For each of the 12 baseline scenarios:
 *      - Re-render the same ReceiptTransaction through generateReceiptHtml +
 *        generateReceiptLines → receiptToPlainText.
 *      - Assert byte-equal to the captured fixture.
 *      This is the safety net for the receipt-data.ts + checkout-items
 *      refactors in TASKs 4-5: any drift in renderer output will fail
 *      these tests immediately.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeReceiptPaymentLines,
  composeReceiptRefunds,
  composeReceiptTotals,
  detectPaymentSource,
  buildSuggestedPaymentLabel,
  sourceToLabel,
  RECEIPT_VOCAB,
  type ComposerPaymentInput,
  type ComposerRefundInput,
  type ComposerItemInput,
  type RenderedPaymentLine,
} from '../receipt-composer';
import {
  generateReceiptHtml,
  generateReceiptLines,
  receiptToPlainText,
} from '@/app/pos/lib/receipt-template';
import { RECEIPT_SCENARIOS } from './__fixtures__/receipt-baselines/inputs';

const FIXTURES_DIR = join(__dirname, '__fixtures__', 'receipt-baselines');

// ---------------------------------------------------------------------------
// 1. Pure composer functions
// ---------------------------------------------------------------------------

describe('composer: detectPaymentSource', () => {
  it('returns online_pay_link when notes start with the pay-link prefix', () => {
    expect(detectPaymentSource('Online payment link. PI: pi_abc.')).toBe('online_pay_link');
  });

  it('returns online_booking_deposit when notes start with the booking-deposit prefix', () => {
    expect(detectPaymentSource('Online booking deposit. Service total: $175.')).toBe('online_booking_deposit');
  });

  it('falls back to in_store for null/undefined/empty/unknown notes', () => {
    expect(detectPaymentSource(null)).toBe('in_store');
    expect(detectPaymentSource(undefined)).toBe('in_store');
    expect(detectPaymentSource('')).toBe('in_store');
    expect(detectPaymentSource('Some random POS note')).toBe('in_store');
  });
});

describe('composer: composeReceiptPaymentLines', () => {
  it('returns an empty block when no payments and no appointment', () => {
    const block = composeReceiptPaymentLines([], null);
    expect(block.lines).toEqual([]);
    expect(block.total_paid_cents).toBe(0);
    expect(block.balance_due_cents).toBe(0);
    expect(block.appointment_total_cents).toBe(0);
    expect(block.is_paid_in_full).toBe(false);
  });

  it('returns appointment-aware empty block when appointment is set but no payments', () => {
    const block = composeReceiptPaymentLines([], { total_amount: 175 });
    expect(block.lines).toEqual([]);
    expect(block.total_paid_cents).toBe(0);
    expect(block.balance_due_cents).toBe(17500);
    expect(block.appointment_total_cents).toBe(17500);
    // is_paid_in_full requires total_paid > 0; zero payments → false even
    // though balance_due is also "satisfied" by being unset.
    expect(block.is_paid_in_full).toBe(false);
  });

  it('sorts payments chronologically by created_at ASC', () => {
    const payments: ComposerPaymentInput[] = [
      { id: 'p2', method: 'cash', amount: 50, created_at: '2026-05-06T20:00:00.000-07:00' },
      { id: 'p1', method: 'card', amount: 30, created_at: '2026-05-04T13:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 80 });
    expect(block.lines.map((l) => l.payment_id)).toEqual(['p1', 'p2']);
  });

  it('marks first payment as is_first_payment + is_first_with_remainder when balance > 0 after applying', () => {
    const payments: ComposerPaymentInput[] = [
      { id: 'p1', method: 'card', amount: 50, created_at: '2026-05-04T13:00:00.000-07:00', source_notes: 'Online booking deposit. xyz' },
      { id: 'p2', method: 'cash', amount: 125, created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 175 });
    expect(block.lines[0].is_first_payment).toBe(true);
    expect(block.lines[0].is_first_with_remainder).toBe(true);
    expect(block.lines[1].is_first_payment).toBe(false);
    expect(block.lines[1].is_first_with_remainder).toBe(false);
  });

  it('does NOT flag is_first_with_remainder when first payment fully covers the appointment total', () => {
    const payments: ComposerPaymentInput[] = [
      { id: 'p1', method: 'cash', amount: 175, created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 175 });
    expect(block.lines[0].is_first_payment).toBe(true);
    expect(block.lines[0].is_first_with_remainder).toBe(false);
    expect(block.is_paid_in_full).toBe(true);
  });

  it('clamps balance_due to zero when total_paid > appointment total (overpay protection)', () => {
    const payments: ComposerPaymentInput[] = [
      { id: 'p1', method: 'cash', amount: 200, created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 175 });
    expect(block.total_paid_cents).toBe(20000);
    expect(block.balance_due_cents).toBe(0);
    expect(block.is_paid_in_full).toBe(true);
  });

  it('detects source from notes prefix per LOCKED-5', () => {
    const payments: ComposerPaymentInput[] = [
      { method: 'card', amount: 50, source_notes: 'Online booking deposit. Service total: $175.', created_at: '2026-05-04T13:00:00.000-07:00' },
      { method: 'card', amount: 75, source_notes: 'Online payment link. PI: pi_xyz.', created_at: '2026-05-05T17:00:00.000-07:00' },
      { method: 'cash', amount: 50, source_notes: 'Walk-in cash payment.', created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 175 });
    expect(block.lines[0].source).toBe('online_booking_deposit');
    expect(block.lines[1].source).toBe('online_pay_link');
    expect(block.lines[2].source).toBe('in_store');
  });

  it('falls back to source_label when source_notes is absent (back-compat shim)', () => {
    const payments: ComposerPaymentInput[] = [
      { method: 'card', amount: 50, source_label: 'Booking deposit', created_at: '2026-05-04T13:00:00.000-07:00' },
      { method: 'card', amount: 75, source_label: 'Online (pay link)', created_at: '2026-05-05T17:00:00.000-07:00' },
      { method: 'cash', amount: 50, source_label: 'Cash', created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, { total_amount: 175 });
    expect(block.lines[0].source).toBe('online_booking_deposit');
    expect(block.lines[1].source).toBe('online_pay_link');
    expect(block.lines[2].source).toBe('in_store');
  });

  it('preserves cash_tendered_cents and change_given_cents for cash rows', () => {
    const payments: ComposerPaymentInput[] = [
      { method: 'cash', amount: 25, cash_tendered: 30, change_given: 5, created_at: '2026-05-06T20:00:00.000-07:00' },
    ];
    const block = composeReceiptPaymentLines(payments, null);
    expect(block.lines[0].cash_tendered_cents).toBe(3000);
    expect(block.lines[0].change_given_cents).toBe(500);
    expect(block.lines[0].amount_cents).toBe(2500);
  });

  it('attaches suggested_primary_label per Phase 1 vocabulary', () => {
    // First-payment-with-remainder + booking deposit → DEPOSIT_ONLINE
    const block1 = composeReceiptPaymentLines(
      [
        { method: 'card', amount: 50, source_notes: 'Online booking deposit. x', created_at: '2026-05-04T13:00:00.000-07:00' },
        { method: 'cash', amount: 125, created_at: '2026-05-06T20:00:00.000-07:00' },
      ],
      { total_amount: 175 }
    );
    expect(block1.lines[0].suggested_primary_label).toBe(RECEIPT_VOCAB.DEPOSIT_ONLINE);
    // Second cash payment → 'Cash'
    expect(block1.lines[1].suggested_primary_label).toBe('Cash');

    // Pay-link → PAY_LINK_ONLINE
    const block2 = composeReceiptPaymentLines(
      [
        { method: 'card', amount: 50, source_notes: 'Online payment link. x', created_at: '2026-05-05T15:00:00.000-07:00' },
      ],
      { total_amount: 175 }
    );
    expect(block2.lines[0].suggested_primary_label).toBe(RECEIPT_VOCAB.PAY_LINK_ONLINE);
  });
});

describe('composer: composeReceiptRefunds', () => {
  const items: ComposerItemInput[] = [
    { id: 'item-a', quantity: 1, total_price: 25 },
    { id: 'item-b', quantity: 1, total_price: 25 },
  ];

  it('returns refund_status none when refunds empty', () => {
    const block = composeReceiptRefunds([], items);
    expect(block.refund_status).toBe('none');
    expect(block.refunded_item_map.size).toBe(0);
  });

  it('returns refund_status none when refunds list contains only non-processed entries', () => {
    const refunds: ComposerRefundInput[] = [
      {
        id: 'r1',
        amount: 25,
        status: 'pending',
        reason: null,
        points_clawed_back: 0,
        points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [{ id: 'ri1', transaction_item_id: 'item-a', quantity: 1, amount: 25 }],
      },
    ];
    const block = composeReceiptRefunds(refunds, items);
    expect(block.refund_status).toBe('none');
  });

  it('returns refund_status partial when only some items are refunded', () => {
    const refunds: ComposerRefundInput[] = [
      {
        id: 'r1',
        amount: 25,
        status: 'processed',
        reason: 'Skipped add-on',
        points_clawed_back: 0,
        points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [{ id: 'ri1', transaction_item_id: 'item-b', quantity: 1, amount: 25 }],
      },
    ];
    const block = composeReceiptRefunds(refunds, items);
    expect(block.refund_status).toBe('partial');
    expect(block.refunded_item_map.get('item-b')).toEqual({ qty: 1, amount_cents: 2500 });
    expect(block.refunded_item_map.has('item-a')).toBe(false);
  });

  it('returns refund_status full when every item is fully refunded', () => {
    const refunds: ComposerRefundInput[] = [
      {
        id: 'r1',
        amount: 50,
        status: 'processed',
        reason: 'Customer request',
        points_clawed_back: 0,
        points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [
          { id: 'ri1', transaction_item_id: 'item-a', quantity: 1, amount: 25 },
          { id: 'ri2', transaction_item_id: 'item-b', quantity: 1, amount: 25 },
        ],
      },
    ];
    const block = composeReceiptRefunds(refunds, items);
    expect(block.refund_status).toBe('full');
  });

  it('aggregates multiple processed refunds onto the same item', () => {
    const items2: ComposerItemInput[] = [{ id: 'item-x', quantity: 2, total_price: 50 }];
    const refunds: ComposerRefundInput[] = [
      {
        id: 'r1', amount: 25, status: 'processed', reason: null,
        points_clawed_back: 0, points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [{ id: 'ri1', transaction_item_id: 'item-x', quantity: 1, amount: 25 }],
      },
      {
        id: 'r2', amount: 25, status: 'processed', reason: null,
        points_clawed_back: 0, points_restored: 0,
        created_at: '2026-05-06T21:30:00.000-07:00',
        refund_items: [{ id: 'ri2', transaction_item_id: 'item-x', quantity: 1, amount: 25 }],
      },
    ];
    const block = composeReceiptRefunds(refunds, items2);
    expect(block.refund_status).toBe('full');
    expect(block.refunded_item_map.get('item-x')).toEqual({ qty: 2, amount_cents: 5000 });
  });
});

describe('composer: composeReceiptTotals', () => {
  it('splits manual+coupon discount from loyalty discount', () => {
    const totals = composeReceiptTotals({
      subtotal: 100,
      tax_amount: 8.25,
      discount_amount: 25, // 15 manual + 10 loyalty
      loyalty_discount: 10,
      loyalty_points_redeemed: 100,
      coupon_code: 'SAVE15',
      tip_amount: 5,
      total_amount: 88.25,
    });
    expect(totals.subtotal_cents).toBe(10000);
    expect(totals.tax_cents).toBe(825);
    expect(totals.discount_cents).toBe(1500);
    expect(totals.loyalty_discount_cents).toBe(1000);
    expect(totals.loyalty_points_redeemed).toBe(100);
    expect(totals.coupon_code).toBe('SAVE15');
    expect(totals.tip_cents).toBe(500);
    expect(totals.total_charged_cents).toBe(8825);
  });

  it('handles zero loyalty discount cleanly', () => {
    const totals = composeReceiptTotals({
      subtotal: 50, tax_amount: 0, discount_amount: 0,
      tip_amount: 0, total_amount: 50,
    });
    expect(totals.discount_cents).toBe(0);
    expect(totals.loyalty_discount_cents).toBe(0);
  });
});

describe('composer: buildSuggestedPaymentLabel', () => {
  function line(overrides: Partial<RenderedPaymentLine>): RenderedPaymentLine {
    return {
      payment_id: '', date_short: '', date_long: '',
      source: 'in_store', is_first_payment: false, is_first_with_remainder: false,
      method: 'cash', card_brand: null, card_last_four: null,
      amount_cents: 0, cash_tendered_cents: null, change_given_cents: null,
      tip_amount_cents: 0,
      suggested_primary_label: '', suggested_method_detail: '', suggested_label_combined: '',
      ...overrides,
    };
  }
  it('first-with-remainder + online_booking_deposit → DEPOSIT_ONLINE', () => {
    expect(buildSuggestedPaymentLabel(line({
      is_first_with_remainder: true, source: 'online_booking_deposit', method: 'card',
    }))).toBe(RECEIPT_VOCAB.DEPOSIT_ONLINE);
  });
  it('first-with-remainder + in_store → DEPOSIT_IN_STORE', () => {
    expect(buildSuggestedPaymentLabel(line({
      is_first_with_remainder: true, source: 'in_store', method: 'cash',
    }))).toBe(RECEIPT_VOCAB.DEPOSIT_IN_STORE);
  });
  it('online_pay_link → PAY_LINK_ONLINE', () => {
    expect(buildSuggestedPaymentLabel(line({
      source: 'online_pay_link', method: 'card',
    }))).toBe(RECEIPT_VOCAB.PAY_LINK_ONLINE);
  });
  it('cash + non-first → Cash', () => {
    expect(buildSuggestedPaymentLabel(line({ source: 'in_store', method: 'cash' }))).toBe('Cash');
  });
});

describe('composer: sourceToLabel', () => {
  it('round-trips composer source → receipt-data.ts source_label string', () => {
    expect(sourceToLabel('online_pay_link', 'card')).toBe('Online (pay link)');
    expect(sourceToLabel('online_booking_deposit', 'card')).toBe('Booking deposit');
    expect(sourceToLabel('in_store', 'cash')).toBe('Cash');
    expect(sourceToLabel('in_store', 'card')).toBe('Card');
    expect(sourceToLabel('in_store', 'check')).toBe('Check');
  });
});

// ---------------------------------------------------------------------------
// 2. Fixture regression — render the 12 baselines, assert byte-equal
// ---------------------------------------------------------------------------

describe('receipt fixtures: byte-fidelity regression', () => {
  for (const scenario of RECEIPT_SCENARIOS) {
    describe(`scenario ${String(scenario.id).padStart(2, '0')} — ${scenario.name}`, () => {
      it('generateReceiptHtml matches the captured baseline', () => {
        const expected = readFileSync(join(FIXTURES_DIR, `${scenario.slug}.html`), 'utf-8');
        const actual = generateReceiptHtml(scenario.tx);
        expect(actual).toBe(expected);
      });

      it('generateReceiptLines → receiptToPlainText matches the captured baseline', () => {
        const expected = readFileSync(join(FIXTURES_DIR, `${scenario.slug}.thermal.txt`), 'utf-8');
        const lines = generateReceiptLines(scenario.tx);
        const actual = receiptToPlainText(lines);
        expect(actual).toBe(expected);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Integration — composer-driven payment block reaches the renderer
//                  with byte-fidelity for an appointment-aggregated scenario.
// ---------------------------------------------------------------------------

describe('composer integration: appointment-aggregated payment block round-trips through the renderer', () => {
  it('scenario 5 (deposit + close-out) — composer-built payments[] renders identically to the fixture', () => {
    const scenario = RECEIPT_SCENARIOS.find((s) => s.id === 5)!;
    // Re-derive the payments[] via composer using the same raw-ish inputs the
    // upstream pipeline would feed (source_label preserved on inputs.ts to
    // simulate the joined-transaction notes resolution that receipt-data.ts
    // performs today).
    const block = composeReceiptPaymentLines(
      scenario.tx.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        tip_amount: p.tip_amount,
        card_brand: p.card_brand ?? null,
        card_last_four: p.card_last_four ?? null,
        cash_tendered: p.cash_tendered ?? null,
        change_given: p.change_given ?? null,
        created_at: p.created_at ?? null,
        source_label: p.source_label ?? null,
      })),
      { total_amount: scenario.tx.appointment_total ?? 0 }
    );

    // Map composer's RenderedPaymentLine[] back to the ReceiptPayment shape
    // the renderer consumes today. The renderer keys off:
    //   method, amount, tip_amount, card_brand, card_last_four,
    //   cash_tendered, change_given, created_at, source_label
    const reconstructed = block.lines.map((l, idx) => {
      const original = scenario.tx.payments[idx];
      return {
        method: l.method,
        amount: l.amount_cents / 100,
        tip_amount: l.tip_amount_cents / 100,
        card_brand: l.card_brand,
        card_last_four: l.card_last_four,
        cash_tendered: l.cash_tendered_cents != null ? l.cash_tendered_cents / 100 : null,
        change_given: l.change_given_cents != null ? l.change_given_cents / 100 : null,
        created_at: original.created_at ?? null,
        source_label: sourceToLabel(l.source, l.method as 'cash' | 'card' | 'check' | 'split'),
      };
    });

    const tx = {
      ...scenario.tx,
      payments: reconstructed,
      appointment_balance_due: block.balance_due_cents,
      appointment_total: block.appointment_total_cents / 100,
    };

    const expectedHtml = readFileSync(join(FIXTURES_DIR, `${scenario.slug}.html`), 'utf-8');
    const expectedThermal = readFileSync(join(FIXTURES_DIR, `${scenario.slug}.thermal.txt`), 'utf-8');

    expect(generateReceiptHtml(tx)).toBe(expectedHtml);
    expect(receiptToPlainText(generateReceiptLines(tx))).toBe(expectedThermal);
  });
});
