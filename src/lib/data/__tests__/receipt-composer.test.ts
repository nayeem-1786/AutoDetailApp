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
  buildSuggestedLabelForPayment,
  buildCombinedPaymentLabel,
  composeLoyaltyFooter,
  mapDigitalPlatformToFriendly,
  sourceToLabel,
  RECEIPT_VOCAB,
  type ComposerPaymentInput,
  type ComposerRefundInput,
  type ComposerItemInput,
  type RenderedPaymentLine,
} from '../receipt-composer';
import { formatReceiptDateTimeCompact, toTitleCase } from '@/lib/utils/format';
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
    // REVISED LOCKED-3: is_paid_in_full fires when appointment_total > 0
    // AND balance_due === 0. Here balance is still $175 → false.
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

  it('REVISED LOCKED-3: is_paid_in_full = true when appointment_total > 0 and balance === 0, even with zero tender (loyalty-only path)', () => {
    // Loyalty-only paid scenario: appointment was billed at $20, but the
    // appointment_balance_due is pre-zeroed by an upstream loyalty discount
    // — caller passes appointment={ total_amount: 0 }-style scenarios to
    // simulate "no real bill". Here we use total_amount=20 with no payments
    // and expect balance=20 → not paid-in-full. The actual loyalty-only
    // paid case is covered by the renderer-side flag (it reads
    // tx.appointment_balance_due directly), not by the composer's
    // payments-only block.
    const block = composeReceiptPaymentLines([], { total_amount: 20 });
    expect(block.balance_due_cents).toBe(2000);
    expect(block.is_paid_in_full).toBe(false);
    // Verify the locked condition: when balance IS 0 with appointment_total>0
    // (e.g., a payment-only $20 scenario), is_paid_in_full fires.
    const block2 = composeReceiptPaymentLines(
      [{ method: 'cash', amount: 20, created_at: '2026-05-06T10:00:00.000-07:00' }],
      { total_amount: 20 }
    );
    expect(block2.is_paid_in_full).toBe(true);
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
      tip_amount_cents: 0, digital_platform: null,
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

// ---------------------------------------------------------------------------
// 4. Phase 1A LOCKED-6 + LOCKED-9 + REVISED LOCKED-7 — new behavior locks
// ---------------------------------------------------------------------------

describe('format: formatReceiptDateTimeCompact (LOCKED-6)', () => {
  it('emits M/D/YY h:MM AM/PM in PST', () => {
    // 2026-05-06 20:05 PDT (UTC-07:00) → "5/6/26 8:05 PM" in LA.
    expect(formatReceiptDateTimeCompact('2026-05-06T20:05:00.000-07:00'))
      .toBe('5/6/26 8:05 PM');
    // 10:32 AM PST (single-digit hour, no leading zero per spec).
    expect(formatReceiptDateTimeCompact('2026-05-06T10:32:00.000-07:00'))
      .toBe('5/6/26 10:32 AM');
    // Pre-DST date (Jan in PST = UTC-08:00).
    expect(formatReceiptDateTimeCompact('2026-01-15T13:43:00.000-08:00'))
      .toBe('1/15/26 1:43 PM');
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(formatReceiptDateTimeCompact(null)).toBe('');
    expect(formatReceiptDateTimeCompact(undefined)).toBe('');
    expect(formatReceiptDateTimeCompact('')).toBe('');
  });
});

describe('composer: buildCombinedPaymentLabel (LOCKED-9 format hierarchy)', () => {
  const ts = '2026-05-04T13:00:00.000-07:00'; // "5/4/26 1:00 PM"

  it('online booking deposit → 3 segments: primary · method_detail · date', () => {
    expect(buildCombinedPaymentLabel({
      primary: RECEIPT_VOCAB.DEPOSIT_ONLINE,
      methodDetail: 'Amex ****1074',
      source: 'online_booking_deposit',
      method: 'card',
      createdAt: ts,
    })).toBe('Deposit (Online) · Amex ****1074 · 5/4/26 1:00 PM');
  });

  it('in-store first-with-remainder deposit → 3 segments: primary · method_detail · date', () => {
    expect(buildCombinedPaymentLabel({
      primary: RECEIPT_VOCAB.DEPOSIT_IN_STORE,
      methodDetail: 'Cash',
      source: 'in_store',
      method: 'cash',
      createdAt: ts,
    })).toBe('Deposit (In-Store) · Cash · 5/4/26 1:00 PM');
  });

  it('pay-link → 3 segments: Pay Link (Online) · method_detail · date', () => {
    expect(buildCombinedPaymentLabel({
      primary: RECEIPT_VOCAB.PAY_LINK_ONLINE,
      methodDetail: 'Amex ****1074',
      source: 'online_pay_link',
      method: 'card',
      createdAt: ts,
    })).toBe('Pay Link (Online) · Amex ****1074 · 5/4/26 1:00 PM');
  });

  it('regular cash → 2 segments: Cash · date (primary IS method)', () => {
    expect(buildCombinedPaymentLabel({
      primary: 'Cash',
      methodDetail: 'Cash',
      source: 'in_store',
      method: 'cash',
      createdAt: ts,
    })).toBe('Cash · 5/4/26 1:00 PM');
  });

  it('regular card → 2 segments: method_detail · date (brand+last4 beats bare "Card")', () => {
    expect(buildCombinedPaymentLabel({
      primary: 'Card',
      methodDetail: 'Visa ****0001',
      source: 'in_store',
      method: 'card',
      createdAt: ts,
    })).toBe('Visa ****0001 · 5/4/26 1:00 PM');
  });

  it('regular check → 2 segments: Check · date', () => {
    expect(buildCombinedPaymentLabel({
      primary: 'Check',
      methodDetail: 'Check',
      source: 'in_store',
      method: 'check',
      createdAt: ts,
    })).toBe('Check · 5/4/26 1:00 PM');
  });

  it('omits timestamp when createdAt is null/missing', () => {
    expect(buildCombinedPaymentLabel({
      primary: RECEIPT_VOCAB.DEPOSIT_ONLINE,
      methodDetail: 'Amex ****1074',
      source: 'online_booking_deposit',
      method: 'card',
      createdAt: null,
    })).toBe('Deposit (Online) · Amex ****1074');
  });
});

describe('composer: buildSuggestedLabelForPayment (renderer-side helper)', () => {
  const ts = '2026-05-06T20:00:00.000-07:00';

  it('uses source_label fallback when source_notes absent and matches strict-readable path', () => {
    const label = buildSuggestedLabelForPayment(
      {
        method: 'card',
        card_brand: 'visa',
        card_last_four: '0001',
        source_label: 'Online (pay link)',
        created_at: ts,
      },
      false
    );
    expect(label).toBe('Pay Link (Online) · Visa ****0001 · 5/6/26 8:00 PM');
  });

  it('first-with-remainder + in_store cash → Deposit (In-Store) · Cash · date', () => {
    const label = buildSuggestedLabelForPayment(
      {
        method: 'cash',
        source_label: 'Cash',
        created_at: ts,
      },
      true
    );
    expect(label).toBe('Deposit (In-Store) · Cash · 5/6/26 8:00 PM');
  });

  it('non-first cash → Cash · date', () => {
    const label = buildSuggestedLabelForPayment(
      {
        method: 'cash',
        source_label: 'Cash',
        created_at: ts,
      },
      false
    );
    expect(label).toBe('Cash · 5/6/26 8:00 PM');
  });

  it('in-store card → "Amex ****1234 · date" (no "Card" primary leaks through)', () => {
    const label = buildSuggestedLabelForPayment(
      {
        method: 'card',
        card_brand: 'amex',
        card_last_four: '1234',
        source_label: 'Card',
        created_at: ts,
      },
      false
    );
    expect(label).toBe('Amex ****1234 · 5/6/26 8:00 PM');
  });
});

describe('composer: composeLoyaltyFooter (REVISED LOCKED-7)', () => {
  it('returns show=false when no redemption', () => {
    expect(composeLoyaltyFooter(0, null)).toEqual({
      show: false, redeemed_pts: 0, balance_after_pts: null,
    });
    expect(composeLoyaltyFooter(null, 50)).toEqual({
      show: false, redeemed_pts: 0, balance_after_pts: null,
    });
    expect(composeLoyaltyFooter(undefined, undefined)).toEqual({
      show: false, redeemed_pts: 0, balance_after_pts: null,
    });
  });

  it('returns show=true with balance when redemption + balance both present', () => {
    expect(composeLoyaltyFooter(200, 50)).toEqual({
      show: true, redeemed_pts: 200, balance_after_pts: 50,
    });
  });

  it('returns show=true with balance_after_pts=null when ledger lookup found no row', () => {
    expect(composeLoyaltyFooter(100, null)).toEqual({
      show: true, redeemed_pts: 100, balance_after_pts: null,
    });
    expect(composeLoyaltyFooter(100, undefined)).toEqual({
      show: true, redeemed_pts: 100, balance_after_pts: null,
    });
  });

  it('coerces string-like numeric inputs (Supabase NUMERIC casts)', () => {
    // Defensive: Supabase NUMERIC fields may arrive as strings depending on
    // client version. composeLoyaltyFooter must Number()-coerce.
    expect(composeLoyaltyFooter('150' as unknown as number, '75' as unknown as number)).toEqual({
      show: true, redeemed_pts: 150, balance_after_pts: 75,
    });
  });
});

describe('composer: combined-label assembly inside composeReceiptPaymentLines (LOCKED-6 + LOCKED-9 wiring)', () => {
  it('booking deposit + close-out — produces correct combined labels per the locked format hierarchy', () => {
    const block = composeReceiptPaymentLines(
      [
        {
          method: 'card', amount: 50,
          card_brand: 'amex', card_last_four: '1234',
          source_label: 'Booking deposit',
          created_at: '2026-05-04T13:00:00.000-07:00',
        },
        {
          method: 'cash', amount: 125,
          cash_tendered: 125, change_given: 0,
          created_at: '2026-05-06T20:00:00.000-07:00',
          source_label: 'Cash',
        },
      ],
      { total_amount: 175 }
    );
    expect(block.lines[0].suggested_label_combined)
      .toBe('Deposit (Online) · Amex ****1234 · 5/4/26 1:00 PM');
    expect(block.lines[1].suggested_label_combined)
      .toBe('Cash · 5/6/26 8:00 PM');
  });

  it('pay-link single-event running receipt produces "Pay Link (Online) · ... · date"', () => {
    const block = composeReceiptPaymentLines(
      [
        {
          method: 'card', amount: 50,
          card_brand: 'visa', card_last_four: '0001',
          source_label: 'Online (pay link)',
          created_at: '2026-05-05T15:00:00.000-07:00',
        },
      ],
      { total_amount: 175 }
    );
    expect(block.lines[0].suggested_label_combined)
      .toBe('Pay Link (Online) · Visa ****0001 · 5/5/26 3:00 PM');
  });
});

// ---------------------------------------------------------------------------
// 5. Phase 1A.5 Part A — digital payment label mapping + free-text rules
// ---------------------------------------------------------------------------

describe('format: toTitleCase (Phase 1A.5)', () => {
  it('capitalizes each whitespace-separated word and lowercases the rest', () => {
    expect(toTitleCase('cash app')).toBe('Cash App');
    expect(toTitleCase('wise transfer')).toBe('Wise Transfer');
    expect(toTitleCase('PAYPAL')).toBe('Paypal');
    expect(toTitleCase('bitcoin')).toBe('Bitcoin');
  });

  it('trims whitespace and collapses internal runs', () => {
    expect(toTitleCase('  bitcoin  ')).toBe('Bitcoin');
    expect(toTitleCase('cash   app')).toBe('Cash App');
  });

  it('returns empty for null / undefined / blank input', () => {
    expect(toTitleCase(null)).toBe('');
    expect(toTitleCase(undefined)).toBe('');
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase('   ')).toBe('');
  });
});

describe('composer: mapDigitalPlatformToFriendly (Phase 1A.5 LOCKED-A4)', () => {
  it('maps fixed canonical keys to brand wordmarks', () => {
    expect(mapDigitalPlatformToFriendly('zelle')).toBe('Zelle');
    expect(mapDigitalPlatformToFriendly('venmo')).toBe('Venmo');
    expect(mapDigitalPlatformToFriendly('apple_cash')).toBe('AppleCash');
  });

  it('title-cases free-text platform names', () => {
    expect(mapDigitalPlatformToFriendly('cash app')).toBe('Cash App');
    expect(mapDigitalPlatformToFriendly('wise transfer')).toBe('Wise Transfer');
    expect(mapDigitalPlatformToFriendly('PAYPAL')).toBe('Paypal');
    expect(mapDigitalPlatformToFriendly('bitcoin')).toBe('Bitcoin');
  });

  it('falls back to "Digital" on null/undefined/blank (defensive — DB CHECK should prevent)', () => {
    expect(mapDigitalPlatformToFriendly(null)).toBe('Digital');
    expect(mapDigitalPlatformToFriendly(undefined)).toBe('Digital');
    expect(mapDigitalPlatformToFriendly('')).toBe('Digital');
  });

  it('is case-insensitive on canonical key lookup', () => {
    expect(mapDigitalPlatformToFriendly('ZELLE')).toBe('Zelle');
    expect(mapDigitalPlatformToFriendly('Venmo')).toBe('Venmo');
    expect(mapDigitalPlatformToFriendly('APPLE_CASH')).toBe('AppleCash');
  });
});

describe('composer: digital payment combined-label assembly', () => {
  const ts = '2026-05-06T11:34:00.000-07:00';

  it('Zelle payment via composeReceiptPaymentLines → "Zelle · M/D/YY h:MM AM/PM"', () => {
    const block = composeReceiptPaymentLines(
      [
        {
          method: 'digital',
          amount: 245,
          digital_platform: 'zelle',
          created_at: ts,
          source_label: 'Digital',
        },
      ],
      { total_amount: 245 }
    );
    expect(block.lines[0].suggested_label_combined).toBe('Zelle · 5/6/26 11:34 AM');
  });

  it('free-text platform (Cash App) via buildSuggestedLabelForPayment renderer helper', () => {
    const label = buildSuggestedLabelForPayment(
      {
        method: 'digital',
        digital_platform: 'cash app',
        source_label: 'Digital',
        created_at: ts,
      },
      false
    );
    expect(label).toBe('Cash App · 5/6/26 11:34 AM');
  });

  it('Venmo first-payment-with-remainder does NOT get "Deposit (...)" wrapper (digital primary always wins)', () => {
    // Digital payments are not deposits even if they're first-with-remainder —
    // a $50 Venmo against a $175 appointment is still labeled "Venmo · date",
    // not "Deposit (In-Store) · Venmo · date". The composer's primary-label
    // short-circuit on method='digital' enforces this.
    const block = composeReceiptPaymentLines(
      [
        {
          method: 'digital',
          amount: 50,
          digital_platform: 'venmo',
          created_at: ts,
          source_label: 'Digital',
        },
      ],
      { total_amount: 175 }
    );
    expect(block.lines[0].suggested_primary_label).toBe('Venmo');
    expect(block.lines[0].suggested_label_combined).toBe('Venmo · 5/6/26 11:34 AM');
  });

  it('buildCombinedPaymentLabel for digital → primary + date (no method_detail repeat)', () => {
    expect(
      buildCombinedPaymentLabel({
        primary: 'Zelle',
        methodDetail: 'Zelle',
        source: 'in_store',
        method: 'digital',
        createdAt: ts,
      })
    ).toBe('Zelle · 5/6/26 11:34 AM');
  });

  it('end-to-end free-text "Other" path — POS payload shape → composer → combined label', () => {
    // Simulates the exact payment-row shape /api/pos/transactions persists
    // when a cashier picks "Other..." and types "wise transfer" into the
    // free-text input. The route lowercases + trims before insert, so the
    // composer ALWAYS sees the canonical lowercase form. End-to-end assertion:
    //   POS payload {method:'digital', digital_platform:'wise transfer', ...}
    //   → composer label = "Wise Transfer · M/D/YY h:MM AM/PM"
    const block = composeReceiptPaymentLines(
      [
        {
          method: 'digital',
          amount: 89.5,
          digital_platform: 'wise transfer', // canonical lowercase from /api/pos/transactions
          created_at: '2026-05-06T11:34:00.000-07:00',
          source_label: 'Digital',
        },
      ],
      { total_amount: 89.5 }
    );
    expect(block.lines[0].method).toBe('digital');
    expect(block.lines[0].digital_platform).toBe('wise transfer');
    expect(block.lines[0].suggested_primary_label).toBe('Wise Transfer');
    expect(block.lines[0].suggested_label_combined)
      .toBe('Wise Transfer · 5/6/26 11:34 AM');
    expect(block.is_paid_in_full).toBe(true);
    expect(block.balance_due_cents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Phase 1A.5 Part A — validation of free-text digital_platform input
//    Mirrors POS DigitalPayment screen's validateOtherPlatform but exercised
//    here as a pure-function lock to keep the canonical rules in one place.
// ---------------------------------------------------------------------------

describe('digital platform free-text validation rules', () => {
  // Mirror of validateOtherPlatform from src/app/pos/components/checkout/digital-payment.tsx.
  // Kept in sync with that copy; this test asserts the contract.
  function validate(input: string): string | null {
    const trimmed = input.trim();
    if (trimmed.length === 0) return 'empty';
    if (trimmed.length > 30) return 'too_long';
    if (!/^[a-zA-Z0-9 \-]+$/.test(trimmed)) return 'bad_chars';
    const lower = trimmed.toLowerCase();
    if (lower === 'zelle' || lower === 'venmo' || lower === 'applecash' || lower === 'apple cash' || lower === 'apple_cash') {
      return 'canonical_clash';
    }
    return null;
  }

  it('accepts valid free-text platform names', () => {
    expect(validate('Cash App')).toBeNull();
    expect(validate('Wise Transfer')).toBeNull();
    expect(validate('Bitcoin')).toBeNull();
    expect(validate('PayPal')).toBeNull();
    expect(validate('Western-Union')).toBeNull();
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validate('')).toBe('empty');
    expect(validate('   ')).toBe('empty');
  });

  it('rejects input longer than 30 characters', () => {
    expect(validate('a'.repeat(31))).toBe('too_long');
    expect(validate('a'.repeat(30))).toBeNull(); // boundary: 30 is allowed
  });

  it('rejects non-alphanumeric special characters', () => {
    expect(validate('Cash@App')).toBe('bad_chars');
    expect(validate('Pay/Pal')).toBe('bad_chars');
    expect(validate('emoji 🚀')).toBe('bad_chars');
  });

  it('rejects free-text that matches a canonical platform (case-insensitive)', () => {
    expect(validate('Zelle')).toBe('canonical_clash');
    expect(validate('ZELLE')).toBe('canonical_clash');
    expect(validate('venmo')).toBe('canonical_clash');
    expect(validate('Apple Cash')).toBe('canonical_clash');
    expect(validate('AppleCash')).toBe('canonical_clash');
  });
});

// ---------------------------------------------------------------------------
// 7. Phase 1A.5 Part B — Stripe brand/last4 extraction
// ---------------------------------------------------------------------------

describe('extractCardDetailsFromCharge (Phase 1A.5 Part B)', () => {
  // Lazy import so the rest of the test file doesn't load the helper if these
  // describe blocks are filtered out.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function run(stripeStub: any, chargeId: string | null | undefined) {
    const { extractCardDetailsFromCharge } = await import('@/lib/utils/stripe-card-details');
    return extractCardDetailsFromCharge(stripeStub, chargeId, 'test');
  }

  it('returns title-cased brand and last4 on successful card retrieve', async () => {
    const stub = {
      charges: {
        retrieve: async () => ({
          payment_method_details: { card: { brand: 'visa', last4: '4242' } },
        }),
      },
    };
    expect(await run(stub, 'ch_test')).toEqual({ card_brand: 'Visa', card_last_four: '4242' });
  });

  it('handles uppercase brand from Stripe gracefully (title-cases)', async () => {
    const stub = {
      charges: {
        retrieve: async () => ({
          payment_method_details: { card: { brand: 'AMEX', last4: '1074' } },
        }),
      },
    };
    expect(await run(stub, 'ch_test')).toEqual({ card_brand: 'Amex', card_last_four: '1074' });
  });

  it('returns nulls when chargeId is null/undefined (no Stripe call)', async () => {
    const stub = {
      charges: {
        retrieve: async () => {
          throw new Error('should not be called');
        },
      },
    };
    expect(await run(stub, null)).toEqual({ card_brand: null, card_last_four: null });
    expect(await run(stub, undefined)).toEqual({ card_brand: null, card_last_four: null });
  });

  it('returns nulls when charge has no payment_method_details.card (e.g., ACH / Apple Pay)', async () => {
    const stub = {
      charges: {
        retrieve: async () => ({
          payment_method_details: { ach_debit: { last4: '6789' } },
        }),
      },
    };
    expect(await run(stub, 'ch_test')).toEqual({ card_brand: null, card_last_four: null });
  });

  it('returns nulls on Stripe API error — does NOT throw', async () => {
    const stub = {
      charges: {
        retrieve: async () => {
          throw new Error('Stripe API down');
        },
      },
    };
    expect(await run(stub, 'ch_test')).toEqual({ card_brand: null, card_last_four: null });
  });

  it('returns nulls when card object exists but brand/last4 are missing', async () => {
    const stub = {
      charges: {
        retrieve: async () => ({
          payment_method_details: { card: {} },
        }),
      },
    };
    expect(await run(stub, 'ch_test')).toEqual({ card_brand: null, card_last_four: null });
  });
});
