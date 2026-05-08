/**
 * Synthetic ReceiptTransaction inputs for the 12 Phase 0b.1 baseline
 * scenarios. Used by:
 *   - scripts/capture-receipt-baselines.ts (writes html + thermal fixtures)
 *   - src/lib/data/__tests__/receipt-composer.test.ts (asserts fixtures match)
 *
 * Each scenario has:
 *   - A stable scenario id (1..12) used for fixture filenames
 *   - A short human-readable name
 *   - A complete ReceiptTransaction object with FIXED ISO timestamps so
 *     the rendered output is byte-deterministic across machines/runs
 *
 * Timestamps are pinned to 2026-05-01..2026-05-06 PDT (UTC-07:00) to keep
 * fixtures stable against DST boundaries.
 */

import type { ReceiptTransaction } from '@/app/pos/lib/receipt-template';

const customerBase = {
  first_name: 'Sample',
  last_name: 'Customer',
  phone: '+13105551234',
  email: 'sample@example.com',
  customer_type: 'enthusiast' as const,
  created_at: '2024-08-15T17:00:00.000-07:00',
};

const employeeBase = { first_name: 'Staff', last_name: 'Member' };

const vehicleBase = {
  vehicle_type: 'standard',
  year: 2022,
  make: 'Tesla',
  model: 'Model 3',
  color: 'White',
};

const baseStandard = (overrides: Partial<ReceiptTransaction> = {}): ReceiptTransaction => ({
  status: 'completed',
  receipt_number: 'R-0001',
  transaction_date: '2026-05-06T20:00:00.000-07:00',
  subtotal: 0,
  tax_amount: 0,
  discount_amount: 0,
  coupon_code: null,
  loyalty_discount: 0,
  loyalty_points_redeemed: 0,
  tip_amount: 0,
  total_amount: 0,
  customer: customerBase,
  employee: employeeBase,
  vehicle: vehicleBase,
  items: [],
  payments: [],
  loyalty_points_earned: 0,
  refunds: [],
  ...overrides,
});

export interface ReceiptScenario {
  id: number;
  slug: string;
  name: string;
  description: string;
  tx: ReceiptTransaction;
}

// ===========================================================================
// Scenario 1 — Walk-in cash, single payment, $25 total
// ===========================================================================

const scenario1: ReceiptScenario = {
  id: 1,
  slug: '01-walkin-cash-single',
  name: 'Walk-in cash, single payment, $25 total',
  description: 'Customer walks in for a quick service. One cash payment, no tip, no tax.',
  tx: baseStandard({
    receipt_number: 'R-0001',
    subtotal: 25,
    total_amount: 25,
    items: [
      {
        id: 'item-1-a',
        item_name: 'Express Wash',
        quantity: 1,
        unit_price: 25,
        total_price: 25,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'cash',
        amount: 25,
        tip_amount: 0,
        cash_tendered: 30,
        change_given: 5,
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 25,
  }),
};

// ===========================================================================
// Scenario 2 — Walk-in card (Amex ****1074), $50 total
// ===========================================================================

const scenario2: ReceiptScenario = {
  id: 2,
  slug: '02-walkin-card-amex',
  name: 'Walk-in card (Amex ****1074), $50 total',
  description: 'Customer walks in, pays full $50 with Amex card.',
  tx: baseStandard({
    receipt_number: 'R-0002',
    subtotal: 50,
    total_amount: 50,
    items: [
      {
        id: 'item-2-a',
        item_name: 'Standard Detail',
        quantity: 1,
        unit_price: 50,
        total_price: 50,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'amex',
        card_last_four: '1074',
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 50,
  }),
};

// ===========================================================================
// Scenario 3 — Walk-in split tender (Cash $30 + Card $20), $50 total
// ===========================================================================

const scenario3: ReceiptScenario = {
  id: 3,
  slug: '03-walkin-split-tender',
  name: 'Walk-in split tender (Cash $30 + Card $20), $50 total',
  description: 'Customer pays half cash, half card on a walk-in.',
  tx: baseStandard({
    receipt_number: 'R-0003',
    subtotal: 50,
    total_amount: 50,
    items: [
      {
        id: 'item-3-a',
        item_name: 'Premium Wash',
        quantity: 1,
        unit_price: 50,
        total_price: 50,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'cash',
        amount: 30,
        tip_amount: 0,
        cash_tendered: 30,
        change_given: 0,
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
      {
        method: 'card',
        amount: 20,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '4242',
        created_at: '2026-05-06T20:06:00.000-07:00',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 50,
  }),
};

// ===========================================================================
// Scenario 4 — Booking deposit only, no close-out (Amex ****1234, $50 of $175)
// ===========================================================================

const scenario4: ReceiptScenario = {
  id: 4,
  slug: '04-deposit-only-running',
  name: 'Booking deposit only, no close-out (Amex ****1234, $50 of $175)',
  description: 'Customer pays $50 deposit online during booking; service not yet performed. Receipt for the deposit.',
  tx: baseStandard({
    receipt_number: 'R-0004-DEP',
    transaction_date: '2026-05-04T13:00:00.000-07:00',
    subtotal: 175,
    total_amount: 50,
    is_deposit: true,
    deposit_amount: 50,
    balance_due: 125,
    deposit_date: '2026-05-04T13:00:00.000-07:00',
    employee: { first_name: 'Online', last_name: 'Booking' },
    items: [
      {
        id: 'item-4-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'amex',
        card_last_four: '1234',
        created_at: '2026-05-04T13:00:00.000-07:00',
        source_label: 'Booking deposit',
      },
    ],
    appointment_balance_due: 12500,
    appointment_total: 175,
  }),
};

// ===========================================================================
// Scenario 5 — Booking deposit + close-out paid in full
// ===========================================================================

const scenario5: ReceiptScenario = {
  id: 5,
  slug: '05-deposit-plus-closeout-paid',
  name: 'Booking deposit + close-out paid in full (Amex $50 deposit + Cash $125 final)',
  description: 'Final receipt at pickup. Shows the prior $50 deposit plus the $125 cash settle. Full appointment payment history.',
  tx: baseStandard({
    receipt_number: 'R-0005-FINAL',
    transaction_date: '2026-05-06T20:00:00.000-07:00',
    subtotal: 175,
    total_amount: 125,
    deposit_credit: 50,
    deposit_date: '2026-05-04T13:00:00.000-07:00',
    linked_receipt: { receipt_number: 'R-0005-DEP', label: 'Deposit Receipt' },
    items: [
      {
        id: 'item-5-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'amex',
        card_last_four: '1234',
        created_at: '2026-05-04T13:00:00.000-07:00',
        source_label: 'Booking deposit',
      },
      {
        method: 'cash',
        amount: 125,
        tip_amount: 0,
        cash_tendered: 125,
        change_given: 0,
        created_at: '2026-05-06T20:00:00.000-07:00',
        source_label: 'Cash',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 175,
  }),
};

// ===========================================================================
// Scenario 6 — Pay-link multi-event ($50 + $75 of $175), running state
// ===========================================================================

const scenario6: ReceiptScenario = {
  id: 6,
  slug: '06-paylink-multi-running',
  name: 'Pay-link multi-event ($50 + $75 of $175), running state',
  description: 'Customer paid $50 then $75 via separate pay-link sends. $50 still due.',
  tx: baseStandard({
    receipt_number: 'R-0006',
    transaction_date: '2026-05-05T17:00:00.000-07:00',
    subtotal: 175,
    total_amount: 75,
    items: [
      {
        id: 'item-6-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '0001',
        created_at: '2026-05-05T15:00:00.000-07:00',
        source_label: 'Online (pay link)',
      },
      {
        method: 'card',
        amount: 75,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '0001',
        created_at: '2026-05-05T17:00:00.000-07:00',
        source_label: 'Online (pay link)',
      },
    ],
    appointment_balance_due: 5000,
    appointment_total: 175,
  }),
};

// ===========================================================================
// Scenario 7 — Close-out only, no deposit, full payment at pickup ($175 cash)
// ===========================================================================

const scenario7: ReceiptScenario = {
  id: 7,
  slug: '07-closeout-no-deposit',
  name: 'Close-out only, no deposit, full payment at pickup ($175 cash)',
  description: 'Walk-in service: full $175 paid in cash at pickup, no prior payments.',
  tx: baseStandard({
    receipt_number: 'R-0007',
    transaction_date: '2026-05-06T20:00:00.000-07:00',
    subtotal: 175,
    total_amount: 175,
    items: [
      {
        id: 'item-7-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'cash',
        amount: 175,
        tip_amount: 0,
        cash_tendered: 200,
        change_given: 25,
        created_at: '2026-05-06T20:00:00.000-07:00',
        source_label: 'Cash',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 175,
  }),
};

// ===========================================================================
// Scenario 8 — $0 close-out, fully pre-paid (deposit + interim covered total)
// ===========================================================================

const scenario8: ReceiptScenario = {
  id: 8,
  slug: '08-zero-closeout-prepaid',
  name: '$0 close-out, fully pre-paid (deposit + pay-link covered total)',
  description: 'Booking deposit $50 + pay-link interim $125 = full $175 covered before pickup. Close-out is $0 collected.',
  tx: baseStandard({
    receipt_number: 'R-0008-FINAL',
    transaction_date: '2026-05-06T20:00:00.000-07:00',
    subtotal: 175,
    total_amount: 0,
    deposit_credit: 50,
    deposit_date: '2026-05-04T13:00:00.000-07:00',
    linked_receipt: { receipt_number: 'R-0008-DEP', label: 'Deposit Receipt' },
    items: [
      {
        id: 'item-8-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'amex',
        card_last_four: '1234',
        created_at: '2026-05-04T13:00:00.000-07:00',
        source_label: 'Booking deposit',
      },
      {
        method: 'card',
        amount: 125,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '0001',
        created_at: '2026-05-05T17:00:00.000-07:00',
        source_label: 'Online (pay link)',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 175,
  }),
};

// ===========================================================================
// Scenario 9 — Voided transaction
// ===========================================================================

const scenario9: ReceiptScenario = {
  id: 9,
  slug: '09-voided',
  name: 'Voided transaction',
  description: 'Walk-in card payment that was voided after the fact.',
  tx: baseStandard({
    status: 'voided',
    receipt_number: 'R-0009',
    subtotal: 50,
    total_amount: 50,
    items: [
      {
        id: 'item-9-a',
        item_name: 'Premium Wash',
        quantity: 1,
        unit_price: 50,
        total_price: 50,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '4242',
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 50,
  }),
};

// ===========================================================================
// Scenario 10 — Full refund
// ===========================================================================

const scenario10: ReceiptScenario = {
  id: 10,
  slug: '10-full-refund',
  name: 'Full refund',
  description: 'Walk-in card payment refunded in full back to the original card.',
  tx: baseStandard({
    receipt_number: 'R-0010',
    subtotal: 50,
    total_amount: 50,
    items: [
      {
        id: 'item-10-a',
        item_name: 'Premium Wash',
        quantity: 1,
        unit_price: 50,
        total_price: 50,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'visa',
        card_last_four: '4242',
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
    ],
    refunds: [
      {
        id: 'refund-10-1',
        amount: 50,
        status: 'processed',
        reason: 'Customer request',
        points_clawed_back: 0,
        points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [
          { id: 'ri-10-1', transaction_item_id: 'item-10-a', quantity: 1, amount: 50 },
        ],
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 50,
  }),
};

// ===========================================================================
// Scenario 11 — Partial refund
// ===========================================================================

const scenario11: ReceiptScenario = {
  id: 11,
  slug: '11-partial-refund',
  name: 'Partial refund',
  description: 'Two-item walk-in. One $25 item refunded, the other $25 kept.',
  tx: baseStandard({
    receipt_number: 'R-0011',
    subtotal: 50,
    total_amount: 50,
    items: [
      {
        id: 'item-11-a',
        item_name: 'Premium Wash',
        quantity: 1,
        unit_price: 25,
        total_price: 25,
        tax_amount: 0,
        item_type: 'service',
      },
      {
        id: 'item-11-b',
        item_name: 'Tire Shine Add-on',
        quantity: 1,
        unit_price: 25,
        total_price: 25,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'mastercard',
        card_last_four: '5555',
        created_at: '2026-05-06T20:05:00.000-07:00',
      },
    ],
    refunds: [
      {
        id: 'refund-11-1',
        amount: 25,
        status: 'processed',
        reason: 'Skipped add-on',
        points_clawed_back: 0,
        points_restored: 0,
        created_at: '2026-05-06T21:00:00.000-07:00',
        refund_items: [
          { id: 'ri-11-1', transaction_item_id: 'item-11-b', quantity: 1, amount: 25 },
        ],
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 50,
  }),
};

// ===========================================================================
// Scenario 12 — Synthetic future: deposit + interim + final split, paid-in-full
// ===========================================================================

const scenario12: ReceiptScenario = {
  id: 12,
  slug: '12-deposit-interim-split-final',
  name: 'Deposit ($50 Amex) + interim ($100 cash) + final split ($25 cash + $0 card), paid-in-full',
  description: 'Synthetic future scenario: customer paid online deposit $50, then $100 cash interim mid-service, final tender split $25 cash + $0 card stub. Total $175.',
  tx: baseStandard({
    receipt_number: 'R-0012-FINAL',
    transaction_date: '2026-05-06T20:00:00.000-07:00',
    subtotal: 175,
    total_amount: 25,
    deposit_credit: 50,
    deposit_date: '2026-05-04T13:00:00.000-07:00',
    linked_receipt: { receipt_number: 'R-0012-DEP', label: 'Deposit Receipt' },
    items: [
      {
        id: 'item-12-a',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 175,
        total_price: 175,
        tax_amount: 0,
        item_type: 'service',
      },
    ],
    payments: [
      {
        method: 'card',
        amount: 50,
        tip_amount: 0,
        card_brand: 'amex',
        card_last_four: '1234',
        created_at: '2026-05-04T13:00:00.000-07:00',
        source_label: 'Booking deposit',
      },
      {
        method: 'cash',
        amount: 100,
        tip_amount: 0,
        cash_tendered: 100,
        change_given: 0,
        created_at: '2026-05-06T18:00:00.000-07:00',
        source_label: 'Cash',
      },
      {
        method: 'cash',
        amount: 25,
        tip_amount: 0,
        cash_tendered: 25,
        change_given: 0,
        created_at: '2026-05-06T20:00:00.000-07:00',
        source_label: 'Cash',
      },
    ],
    appointment_balance_due: 0,
    appointment_total: 175,
  }),
};

export const RECEIPT_SCENARIOS: ReceiptScenario[] = [
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario6,
  scenario7,
  scenario8,
  scenario9,
  scenario10,
  scenario11,
  scenario12,
];
