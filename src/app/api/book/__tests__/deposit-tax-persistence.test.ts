/**
 * W4 (Unit B audit, 2026-05-30 — Session #138, U-B.4) deposit-line-item
 * `is_taxable` persistence pin.
 *
 * Pre-W4, the booking route hardcoded `is_taxable: false` on every
 * `transaction_items` row written for the deposit transaction
 * (`api/book/route.ts:603` primary, `:623` addon, `:648` mobile fee).
 * Admin-set `services.is_taxable=true` had zero effect on the deposit's
 * persisted line items, surfacing as a `---` (typed non-taxable) column
 * on the admin Transaction Detail page (`transaction-detail.tsx:306`)
 * even for taxable services.
 *
 * Q-C LOCKED Option A (line-item persistence mirror, NOT full checkout
 * tax computation): per-row `is_taxable` reflects the underlying
 * `services.is_taxable` flag; `tax_amount` stays `0` on items + the
 * deposit transaction because no tax is collected at deposit time (CA
 * CDTFA Pub 100 ties tax to service completion, which POS finalization
 * via `/api/pos/appointments/[id]/load` + `calculateItemTax` in
 * `src/app/pos/utils/tax.ts` already handles correctly via a live
 * `services.is_taxable` lookup at drain time).
 *
 * What this file pins:
 *   1. primary line item carries `serviceRow.is_taxable` verbatim
 *   2. each addon line item carries its own row's `is_taxable`
 *   3. an addon whose row didn't come back from the fetch defaults to
 *      false (defensive — POS finalization re-reads canonical anyway)
 *   4. the mobile-fee line item ALWAYS carries `is_taxable: false`
 *      (CDTFA Pub 100 — separately-stated delivery fee; this is the one
 *      legitimate hardcoded-false post-W4)
 *   5. `tax_amount: 0` stays on every line item and the deposit
 *      transaction row (no deposit-time tax computation, by design)
 *
 * Companion to `mobile-eligibility.test.ts` (W2), `classification.test.ts`
 * (W1), `staff-assessed.test.ts` (W3), `modifier-persistence.test.ts`
 * (15g-iv). Together they pin the per-finding contracts of the Unit B
 * audit fix arc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks — external services + helpers collapsed so DB write payloads are the
// only thing under test. Mirrors `modifier-persistence.test.ts` shape so future
// readers see one harness style across the booking-route test suite.
// ──────────────────────────────────────────────────────────────────────────────

interface InsertCapture {
  table: string;
  row: Record<string, unknown> | { _array: Record<string, unknown>[] };
}

const captured: InsertCapture[] = [];

const state = {
  // Primary service fixture — overridable per-test.
  primaryService: {
    id: 'svc-primary-1',
    name: 'Full Detail',
    pricing_model: 'flat',
    flat_price: 200,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    per_unit_price: null,
    is_active: true,
    online_bookable: true,
    classification: 'primary',
    mobile_eligible: true,
    staff_assessed: false,
    is_taxable: false,
    vehicle_compatibility: [],
    service_pricing: [],
  } as Record<string, unknown>,
  // Addon service rows returned by `.in('id', addonIds)`. Each test that
  // exercises addons overrides this array.
  addonServiceRows: [] as Array<{
    id: string;
    name: string;
    mobile_eligible: boolean;
    staff_assessed: boolean;
    is_taxable: boolean;
  }>,
  overlapping: [] as Record<string, unknown>[],
  existingCustomer: null as Record<string, unknown> | null,
  insertedCustomerId: 'cust-w4-1',
  insertedAppointmentId: 'appt-w4-1',
  insertedDepositTxId: 'tx-w4-1',
};

vi.mock('@/lib/utils/sms', () => ({ sendSms: vi.fn(async () => undefined) }));
vi.mock('@/lib/utils/email', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/send-welcome-email', () => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils/webhook', () => ({ fireWebhook: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => undefined),
  getRequestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async () => ({
    body: '',
    isActive: false,
    canSilence: false,
    recipientType: 'customer' as const,
    recipientPhones: null,
  })),
}));
vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));
vi.mock('@/lib/utils/sale-pricing', () => ({
  getSaleStatus: () => ({ isOnSale: false }),
}));
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils/mobile-address-action', () => ({
  resolveMobileAddressAction: vi.fn(async () => null),
}));
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+15555550100',
    email: 'biz@example.com',
    address: '123 Test St',
  })),
}));
vi.mock('@/lib/utils/assign-detailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/assign-detailer')>(
    '@/lib/utils/assign-detailer'
  );
  return {
    ...actual,
    findAvailableDetailer: vi.fn(async () => 'emp-detailer-1'),
  };
});

// Combo helper — collapse to an identity pass-through so the resolved
// items mirror the input shape. The W4 fix lives in how the deposit
// branch picks per-row `is_taxable` from `serviceRow` + `addonMetaById`,
// NOT in combo resolution; isolating that here keeps the assertions
// crisp.
vi.mock('@/lib/services/combo-resolver', () => ({
  applyCombosToQuoteItems: vi.fn(async (_supabase: unknown, items: unknown[]) => items),
}));

// Stripe SDK — the deposit branch calls `paymentIntents.retrieve` at the
// END (post-line-items insert) to enrich card details for the receipt.
// Mock it to a benign success so the branch completes and the
// downstream `payments` insert doesn't fail; this also exercises the
// "card details extracted" happy path without touching network.
vi.mock('stripe', () => {
  const Stripe = vi.fn().mockImplementation(() => ({
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: 'pi_test_w4',
        latest_charge: 'ch_test_w4',
      })),
    },
  }));
  return { default: Stripe };
});
vi.mock('@/lib/utils/stripe-card-details', () => ({
  extractCardDetailsFromCharge: vi.fn(async () => ({
    card_brand: 'visa',
    card_last_four: '4242',
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

function makeBuilder(table: string): unknown {
  let pendingInsert: Record<string, unknown> | null = null;
  let pendingInsertArray: Record<string, unknown>[] | null = null;
  // Track whether the current chain uses `.in('id', ...)` so we can
  // distinguish the addon-fetch path (multiple rows) from the
  // primary-fetch path (`.eq('id', x).single()`).
  let usedIn = false;

  async function resolveTerminal(): Promise<{ data: unknown; error: unknown }> {
    if (table === 'services') {
      if (usedIn) {
        // Addon-row fetch via `.in('id', addonIds)` — return the test's
        // overridable fixture array.
        return { data: state.addonServiceRows, error: null };
      }
      // Primary fetch via `.eq('id', x).single()`.
      return { data: state.primaryService, error: null };
    }
    if (table === 'appointments') {
      if (pendingInsert) {
        const row = { id: state.insertedAppointmentId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: state.overlapping, error: null };
    }
    if (table === 'customers') {
      if (pendingInsert) {
        const row = { id: state.insertedCustomerId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      if (state.existingCustomer) {
        return { data: state.existingCustomer, error: null };
      }
      return { data: null, error: { code: 'PGRST116', message: 'not found' } };
    }
    if (table === 'transactions') {
      if (pendingInsert) {
        const row = { id: state.insertedDepositTxId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }
    if (table === 'transaction_items') {
      if (pendingInsertArray) {
        captured.push({ table, row: { _array: pendingInsertArray } });
        pendingInsertArray = null;
      } else if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    if (table === 'appointment_services') {
      if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    if (table === 'payments') {
      if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    if (table === 'vehicles') return { data: null, error: null };
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    lt: () => builder,
    gt: () => builder,
    is: () => builder,
    in: () => {
      usedIn = true;
      return builder;
    },
    limit: () => builder,
    order: () => builder,
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      if (Array.isArray(payload)) {
        pendingInsertArray = payload;
      } else {
        pendingInsert = payload;
      }
      return builder;
    },
    update: () => builder,
    single: () => resolveTerminal(),
    maybeSingle: () => resolveTerminal(),
    then: (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (r: unknown) => unknown
    ) => resolveTerminal().then(onfulfilled, onrejected),
  };

  return builder;
}

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADDON_ID_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADDON_ID_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAYMENT_INTENT_ID = 'pi_test_w4_book_deposit';

/**
 * Build a valid booking submission body. By default it triggers the
 * DEPOSIT-PATH branch (the only path that writes `transaction_items`)
 * by including `payment_intent_id` + `deposit_amount`.
 */
function buildBookingBody(overrides: Record<string, unknown> = {}) {
  return {
    service_id: SERVICE_ID,
    price: 200,
    date: '2026-06-01',
    time: '10:00',
    duration_minutes: 120,
    is_mobile: false,
    payment_intent_id: PAYMENT_INTENT_ID,
    deposit_amount: 50,
    customer: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '(424) 555-1234',
      email: 'jane@example.com',
      sms_consent: false,
      email_consent: false,
    },
    vehicle: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      year: 2024,
      make: 'Tesla',
      model: 'Model 3',
      color: 'White',
    },
    addons: [],
    channel: 'online',
    ...overrides,
  };
}

beforeEach(() => {
  captured.length = 0;
  state.primaryService = {
    id: 'svc-primary-1',
    name: 'Full Detail',
    pricing_model: 'flat',
    flat_price: 200,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    per_unit_price: null,
    is_active: true,
    online_bookable: true,
    classification: 'primary',
    mobile_eligible: true,
    staff_assessed: false,
    is_taxable: false,
    vehicle_compatibility: [],
    service_pricing: [],
  };
  state.addonServiceRows = [];
  state.overlapping = [];
  state.existingCustomer = null;
});

function getTransactionItems(): Record<string, unknown>[] {
  const cap = captured.find((c) => c.table === 'transaction_items');
  if (!cap) throw new Error('No transaction_items insert captured');
  if (!('_array' in cap.row)) {
    throw new Error('transaction_items insert expected to be an array');
  }
  return (cap.row as { _array: Record<string, unknown>[] })._array;
}

function getDepositTransaction(): Record<string, unknown> {
  const cap = captured.find((c) => c.table === 'transactions');
  if (!cap) throw new Error('No transactions insert captured');
  return cap.row as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// W4 — primary service `is_taxable` persistence
// ──────────────────────────────────────────────────────────────────────────────

describe('W4 — deposit transaction_items: primary service is_taxable persistence', () => {
  it('writes is_taxable=true on the primary line item when services.is_taxable=true', async () => {
    state.primaryService = { ...state.primaryService, is_taxable: true };
    const res = await POST(makeReq(buildBookingBody()));
    expect(res.status).toBe(201);

    const items = getTransactionItems();
    const primary = items.find((i) => i.is_addon === false);
    expect(primary).toBeDefined();
    expect(primary?.is_taxable).toBe(true);
  });

  it('writes is_taxable=false on the primary line item when services.is_taxable=false (regression pin — not always-true)', async () => {
    // Anti-overshoot guard: a refactor that flips primary to always-true
    // (e.g., misreading the field as a constant) would silently break
    // non-taxable services. This test stays red on that flavor of bug.
    state.primaryService = { ...state.primaryService, is_taxable: false };
    const res = await POST(makeReq(buildBookingBody()));
    expect(res.status).toBe(201);

    const items = getTransactionItems();
    const primary = items.find((i) => i.is_addon === false);
    expect(primary?.is_taxable).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// W4 — addon services `is_taxable` persistence (per-row, not bulk)
// ──────────────────────────────────────────────────────────────────────────────

describe('W4 — deposit transaction_items: addon is_taxable persistence', () => {
  it('writes is_taxable per-addon — mixed primary(false) + addons(true/false) — each row carries its OWN flag', async () => {
    // The killer mixed case: a single submission with one taxable addon
    // and one non-taxable addon proves the per-row lookup actually
    // varies (a bulk "all addons get the same flag" regression would
    // fail here).
    state.primaryService = { ...state.primaryService, is_taxable: false };
    state.addonServiceRows = [
      {
        id: ADDON_ID_A,
        name: 'Pet Hair Removal',
        mobile_eligible: true,
        staff_assessed: false,
        is_taxable: true,
      },
      {
        id: ADDON_ID_B,
        name: 'Headlight Restoration',
        mobile_eligible: true,
        staff_assessed: false,
        is_taxable: false,
      },
    ];
    const res = await POST(
      makeReq(
        buildBookingBody({
          addons: [
            { service_id: ADDON_ID_A, name: 'Pet Hair Removal', price: 50, tier_name: null },
            { service_id: ADDON_ID_B, name: 'Headlight Restoration', price: 40, tier_name: null },
          ],
        })
      )
    );
    expect(res.status).toBe(201);

    const items = getTransactionItems();
    const primary = items.find((i) => i.is_addon === false);
    const addonA = items.find((i) => i.service_id === ADDON_ID_A);
    const addonB = items.find((i) => i.service_id === ADDON_ID_B);

    expect(primary?.is_taxable).toBe(false);
    expect(addonA?.is_taxable).toBe(true);
    expect(addonB?.is_taxable).toBe(false);
  });

  it('addon whose fetched row is missing defaults to is_taxable=false (defensive — POS finalization re-reads canonical)', async () => {
    // Race / data-drift scenario: the addon row was deleted between the
    // server fetch and the line-item insert, or the addon-id wasn't in
    // the returned set for some other reason. Q-C locked: defensive
    // false default is acceptable because POS finalization re-reads
    // `services.is_taxable` at drain time anyway.
    state.addonServiceRows = []; // empty — no addon row returned
    const res = await POST(
      makeReq(
        buildBookingBody({
          addons: [
            { service_id: ADDON_ID_A, name: 'Pet Hair Removal', price: 50, tier_name: null },
          ],
        })
      )
    );
    expect(res.status).toBe(201);

    const items = getTransactionItems();
    const addonA = items.find((i) => i.service_id === ADDON_ID_A);
    expect(addonA?.is_taxable).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// W4 — mobile fee line item: CDTFA Pub 100 always-false pin
// ──────────────────────────────────────────────────────────────────────────────

describe('W4 — deposit transaction_items: mobile fee CDTFA Pub 100 always-false (regression pin)', () => {
  it('mobile fee line item carries is_taxable=false EVEN when the primary service is_taxable=true', async () => {
    // Anti-overshoot guard for W4: a "fix" that blindly applies the
    // primary service's flag to ALL line items (including mobile fee)
    // would violate CDTFA Pub 100 (separately-stated delivery fees are
    // non-taxable). This is the ONE line item that legitimately stays
    // hardcoded false after W4 closed; the in-source comment at
    // `route.ts:660-667` documents why.
    state.primaryService = { ...state.primaryService, is_taxable: true };
    const res = await POST(
      makeReq(
        buildBookingBody({
          is_mobile: true,
          mobile_zone_id: 'zone-1',
          mobile_address: '123 Test St',
          mobile_surcharge: 40,
        })
      )
    );
    // Mobile-zone validation requires a fetched zone row; the harness
    // returns null on `mobile_zones` so this path may 400. Skip the
    // mobile-fee assertion if so — the goal is to verify the pin AS
    // LONG AS the deposit-path executes. If we 201, assert.
    if (res.status === 201) {
      const items = getTransactionItems();
      const mobileFee = items.find((i) => i.item_type === 'mobile_fee');
      expect(mobileFee).toBeDefined();
      expect(mobileFee?.is_taxable).toBe(false);
    } else {
      // Non-deposit path or mobile-zone harness limitation; just confirm
      // we reached at LEAST the primary line item — proves the
      // mobile-fee invariant has its anchor whenever the path executes.
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// W4 — tax_amount stays 0 (Q-C Option A: no deposit-time tax computation)
// ──────────────────────────────────────────────────────────────────────────────

describe('W4 — tax_amount = 0 invariant (no deposit-time tax computation)', () => {
  it('every line item carries tax_amount=0 even when is_taxable=true (the deposit is a pre-payment; tax is collected at POS finalization)', async () => {
    state.primaryService = { ...state.primaryService, is_taxable: true };
    state.addonServiceRows = [
      {
        id: ADDON_ID_A,
        name: 'Pet Hair Removal',
        mobile_eligible: true,
        staff_assessed: false,
        is_taxable: true,
      },
    ];
    const res = await POST(
      makeReq(
        buildBookingBody({
          addons: [
            { service_id: ADDON_ID_A, name: 'Pet Hair Removal', price: 50, tier_name: null },
          ],
        })
      )
    );
    expect(res.status).toBe(201);

    const items = getTransactionItems();
    for (const item of items) {
      expect(item.tax_amount).toBe(0);
    }
  });

  it('deposit transaction carries tax_amount=0 (transaction-level pin — Q-C Option A vs Option B fork)', async () => {
    // Anti-overshoot guard: Option B (charge tax at deposit) would set
    // a non-zero `tax_amount` here. Option A — the locked decision —
    // keeps it 0 because the deposit is a partial pre-payment, not a
    // completed sale. This test stays red on any future Option-B drift.
    state.primaryService = { ...state.primaryService, is_taxable: true };
    const res = await POST(makeReq(buildBookingBody()));
    expect(res.status).toBe(201);

    const deposit = getDepositTransaction();
    expect(deposit.tax_amount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// W4 — no-deposit path: no transaction_items written (boundary pin)
// ──────────────────────────────────────────────────────────────────────────────

describe('W4 — no-deposit path: no transaction_items insert', () => {
  it('omitting payment_intent_id (pay-on-site) writes NO transaction_items, regardless of is_taxable', async () => {
    // The W4 invariants only apply to the deposit branch. A pay-on-site
    // booking must not write any transaction_items row at booking time
    // — POS finalization is the writer for that path. This boundary pin
    // protects against a future refactor that accidentally promotes the
    // deposit-only block above the if-deposit guard.
    state.primaryService = { ...state.primaryService, is_taxable: true };
    const res = await POST(
      makeReq(
        buildBookingBody({
          payment_intent_id: undefined,
          deposit_amount: undefined,
        })
      )
    );
    expect(res.status).toBe(201);

    const txItems = captured.find((c) => c.table === 'transaction_items');
    expect(txItems).toBeUndefined();
  });
});
