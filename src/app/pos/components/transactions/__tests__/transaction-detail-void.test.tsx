import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

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
    customer: { id: 'cust-1', first_name: 'Jane', last_name: 'Doe', phone: '5551234567', email: 'jane@example.com' },
    vehicle: null,
    employee: { id: 'emp-1', first_name: 'Cash', last_name: 'Ier' },
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

function getVoidButtonOnPage() {
  // Multiple buttons may be named "Void Transaction" (the action button +
  // the dialog confirm). The action button on the page is the first one.
  const buttons = screen.getAllByRole('button', { name: /void transaction/i });
  return buttons[0] as HTMLButtonElement;
}

describe('TransactionDetail — void button card block', () => {
  it('enables the void button for cash-only sales', async () => {
    fetchedTransaction.value = makeTransaction({
      payments: [{ id: 'p1', method: 'cash', amount: 109.75, tip_amount: 0 }],
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    const voidBtn = getVoidButtonOnPage();
    expect(voidBtn.disabled).toBe(false);
    // Inline disabled-state message must NOT render when void is allowed.
    expect(screen.queryByText(/Card sales must be refunded, not voided\./i)).toBeNull();
  });

  it('disables the void button when payment includes a card', async () => {
    fetchedTransaction.value = makeTransaction({
      payments: [{ id: 'p1', method: 'card', amount: 109.75, tip_amount: 0, card_brand: 'Visa', card_last_four: '4242' }],
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    const voidBtn = getVoidButtonOnPage();
    expect(voidBtn.disabled).toBe(true);
    // Desktop hover fallback — preserved.
    expect(voidBtn.title).toBe(
      'This sale included a card payment. Card transactions must be refunded, not voided.'
    );
    // iPad-friendly inline message — visible whenever the card-payment block applies.
    expect(
      screen.getByText(/Card sales must be refunded, not voided\./i),
    ).toBeDefined();
  });

  it('disables the void button for split-tender sales', async () => {
    fetchedTransaction.value = makeTransaction({
      payments: [{ id: 'p1', method: 'split', amount: 100, tip_amount: 0 }],
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    const voidBtn = getVoidButtonOnPage();
    expect(voidBtn.disabled).toBe(true);
    // Split tender includes a card by definition — inline message renders.
    expect(
      screen.getByText(/Card sales must be refunded, not voided\./i),
    ).toBeDefined();
  });
});

describe('TransactionDetail — void confirmation dialog language', () => {
  it('shows non-cascade language when no linked job exists', async () => {
    fetchedTransaction.value = makeTransaction({ jobs: [] });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    fireEvent.click(getVoidButtonOnPage());

    await waitFor(() => {
      const headings = screen.getAllByRole('heading');
      expect(headings.some((h) => h.textContent === 'Void Transaction')).toBe(true);
    });
    expect(screen.queryByText(/cancel the linked job/i)).toBeNull();
    expect(screen.getByText(/Restore inventory for any product items/i)).toBeTruthy();
    expect(screen.getByText(/Reverse loyalty points and coupon usage/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/type "VOID" to confirm/i)).toBeTruthy();
  });

  it('shows cascade language when an active linked job exists', async () => {
    fetchedTransaction.value = makeTransaction({
      jobs: [{ id: 'job-1', status: 'scheduled' }],
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    fireEvent.click(getVoidButtonOnPage());

    await waitFor(() => {
      const headings = screen.getAllByRole('heading');
      expect(
        headings.some((h) => h.textContent === 'Void will cancel job and notify customer')
      ).toBe(true);
    });
    expect(screen.getByText(/Cancel the linked job/)).toBeTruthy();
    expect(screen.getByText(/Send a cancellation notification to Jane Doe/)).toBeTruthy();
    expect(screen.getByText(/customer will receive an SMS or email/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/type "VOID" to confirm/i)).toBeTruthy();
  });

  it('treats already-cancelled job as no-cascade (uses non-cascade language)', async () => {
    fetchedTransaction.value = makeTransaction({
      jobs: [{ id: 'job-1', status: 'cancelled' }],
    });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    fireEvent.click(getVoidButtonOnPage());

    await waitFor(() => {
      const headings = screen.getAllByRole('heading');
      expect(headings.some((h) => h.textContent === 'Void Transaction')).toBe(true);
    });
    expect(screen.queryByText(/cancel the linked job/i)).toBeNull();
  });

  it('keeps confirm button disabled until VOID phrase is typed', async () => {
    fetchedTransaction.value = makeTransaction({ jobs: [] });
    render(<TransactionDetail transactionId="tx-1" onBack={() => {}} />);
    await screen.findByRole('button', { name: /void transaction/i });
    fireEvent.click(getVoidButtonOnPage());

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type "VOID" to confirm/i)).toBeTruthy();
    });

    // The dialog confirm is the LAST button labeled 'Void Transaction'
    const allVoidButtons = screen.getAllByRole('button', {
      name: 'Void Transaction',
    }) as HTMLButtonElement[];
    const dialogConfirm = allVoidButtons[allVoidButtons.length - 1];
    expect(dialogConfirm.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(/type "VOID" to confirm/i), {
      target: { value: 'VOID' },
    });
    expect(dialogConfirm.disabled).toBe(false);
  });
});
