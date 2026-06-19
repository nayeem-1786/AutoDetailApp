/**
 * Session #155 (Item 3): Total row regression-locking tests for the POS
 * admin Transactions detail surface (Surface D in the
 * RECEIPT_TIP_AUDIT_2026-06-19 matrix).
 *
 * Pre-fix bug: Total row rendered `transaction.total_amount` only, excluding
 * the tip — producing an S0 reconciliation discrepancy vs the receipt
 * surfaces (thermal / email HTML / SMS-link public page / browser-print /
 * print-copier) which add tip in the TOTAL line via the canonical formula
 * `Math.max(appointment_total ?? 0, total_amount) + tip_amount`.
 *
 * The 4 cases below pin:
 *   1. Total = total_amount + tip_amount when tip > 0 (bug guard)
 *   2. Total = total_amount when tip = 0 (zero-tip case)
 *   3. Total uses appointment_total via Math.max when appointment_total >
 *      total_amount (close-out shell)
 *   4. Tip row renders only when tip_amount > 0 (preserves the existing
 *      conditional at transaction-detail.tsx:381)
 *
 * Scaffold mirrors `transaction-detail-void.test.tsx` (posFetch mock +
 * permission mock + render harness).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const fetchedTransaction: { value: unknown } = { value: null };

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(JSON.stringify({ data: fetchedTransaction.value }), { status: 200 });
  }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('@/components/qbo-sync-badge', () => ({
  QboSyncBadge: () => null,
}));

vi.mock('../receipt-options', () => ({
  ReceiptOptions: () => null,
}));

vi.mock('../refund/refund-dialog', () => ({
  RefundDialog: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TransactionDetail } from '../transaction-detail';

function makeTransaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tx-1',
    receipt_number: 'SD-9999',
    status: 'completed',
    transaction_date: '2026-04-24T20:00:00Z',
    subtotal: 100,
    tax_amount: 9.75,
    total_amount: 109.75,
    discount_amount: 0,
    loyalty_discount: 0,
    tip_amount: 0,
    loyalty_points_earned: 0,
    loyalty_points_redeemed: 0,
    notes: null,
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '5551234567',
      email: 'jane@example.com',
    },
    vehicle: null,
    employee: { id: 'emp-1', first_name: 'Cash', last_name: 'Ier' },
    appointment: null,
    items: [],
    payments: [{ id: 'pay-1', method: 'cash', amount: 109.75, tip_amount: 0 }],
    refunds: [],
    jobs: [],
    qbo_sync_status: null,
    qbo_id: null,
    qbo_sync_error: null,
    qbo_synced_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
});

/**
 * Find the Total row's amount cell by walking up from the "Total" label
 * to the shared flex container. Locked to the on-page Totals block at
 * transaction-detail.tsx — the Total label appears twice in some snapshots
 * (header + totals block), so we anchor on the label inside the totals
 * panel by class match.
 */
function readTotalAmount(): string {
  const labels = screen.getAllByText('Total');
  // The Totals block label has font-semibold; the header/other Total
  // instances either don't render or use a different class. Pick the
  // semibold instance — the canonical Total row.
  const totalLabel = labels.find((el) =>
    Array.from(el.classList).some((c) => c.includes('font-semibold')),
  );
  expect(totalLabel, 'Total label not found in Totals block').toBeDefined();
  const row = totalLabel!.parentElement;
  expect(row, 'Total label has no parent row').toBeDefined();
  const amountCell = row!.querySelector('span:last-child');
  expect(amountCell, 'Total row has no amount cell').toBeDefined();
  return amountCell!.textContent ?? '';
}

describe('TransactionDetail — Total row tip math (Item 3 / Surface D / Session #155)', () => {
  it('case 1: Total = total_amount + tip_amount when tip > 0 (bug guard)', async () => {
    // Pre-fix this rendered $109.75 (total_amount only); post-fix renders
    // $129.75 (total_amount + tip_amount).
    fetchedTransaction.value = makeTransaction({
      total_amount: 109.75,
      tip_amount: 20,
      appointment: null, // no close-out shell — Math.max picks total_amount
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });

    expect(readTotalAmount()).toBe('$129.75');
  });

  it('case 2: Total = total_amount when tip_amount = 0 (zero-tip case)', async () => {
    fetchedTransaction.value = makeTransaction({
      total_amount: 109.75,
      tip_amount: 0,
      appointment: null,
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });

    expect(readTotalAmount()).toBe('$109.75');
  });

  it('case 3: Total uses appointment_total via Math.max when appointment_total > total_amount (close-out shell)', async () => {
    // Close-out shell scenario: the closing transaction has $0 total
    // (deposit covered everything in advance), but the appointment carries
    // the gross. Canonical formula picks the larger of the two via Math.max.
    // Receipt #SD-006297 was a real-world case of this shape with a $92 tip
    // on a $552 appointment-total — the bug example from the audit.
    fetchedTransaction.value = makeTransaction({
      total_amount: 0,
      tip_amount: 92,
      appointment: { total_amount: 460 },
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });

    // $460 (appointment.total_amount) + $92 (tip) = $552
    expect(readTotalAmount()).toBe('$552.00');
  });

  it('case 4: Tip row renders only when tip_amount > 0 (existing conditional preserved)', async () => {
    // Sub-case (a): tip > 0 — Tip row present.
    fetchedTransaction.value = makeTransaction({
      total_amount: 109.75,
      tip_amount: 20,
      appointment: null,
    });
    const { unmount } = render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    expect(screen.getAllByText('Tip').length).toBeGreaterThan(0);
    unmount();
    cleanup();

    // Sub-case (b): tip = 0 — Tip row absent. The existing conditional
    // at transaction-detail.tsx:381 (`transaction.tip_amount > 0 && ...`)
    // must continue to suppress the row entirely.
    fetchedTransaction.value = makeTransaction({
      total_amount: 109.75,
      tip_amount: 0,
      appointment: null,
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    expect(screen.queryByText('Tip')).toBeNull();
  });
});
