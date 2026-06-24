// Item 4 / 4a-cash — in-checkout cash tip capture (Session #165).
//
// Consumer regressions over the UAT scenarios from the Item 4 audit §3.8.
// Before this slice, the cash flow hardcoded `tip_amount: 0` at both the
// transaction and payment-row grain (and the offline queue wrote no tip at
// all), so every cash tip was silently lost. These lock the recovered behavior.
//
// Strategy: mount the real <CashPayment/> wrapped in the REAL CheckoutProvider
// (the canonical tip-amount container — Memory: read from checkout-context, do
// NOT introduce a second container) and assert the request bodies. Heavy/
// external deps (posFetch, ticket-context, online-status, offline-queue,
// PinPad) are mocked. Cash is tendered via the inline denomination chips
// because PinPad is stubbed out.
//
// Covered UAT rows: #1 (cash + tip persists at both grains), #2 (cash + $0 tip,
// zero friction), #5 (UX defaults to $0, optional, never blocks checkout),
// #6 (change_given excludes the tip). Plus: preset basis = % of subtotal, and
// #4 (offline payload carries tip_amount). Split (#3) is out of S1 scope.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { TicketState } from '../../../types';

const posFetchMock = vi.hoisted(() => vi.fn());
const queueMock = vi.hoisted(() => vi.fn());
const dispatchMock = vi.hoisted(() => vi.fn());
const onlineMock = vi.hoisted(() => ({ value: true }));
const mockTicket = vi.hoisted(() => ({ value: null as unknown as TicketState }));

vi.mock('../../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));
vi.mock('@/lib/pos/offline-queue', () => ({ queueTransaction: queueMock }));
vi.mock('@/lib/hooks/use-online-status', () => ({ useOnlineStatus: () => onlineMock.value }));
vi.mock('../../../context/ticket-context', () => ({
  useTicket: () => ({ ticket: mockTicket.value, dispatch: dispatchMock }),
}));
vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: false }),
}));
vi.mock('../../pin-pad', () => ({ PinPad: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CashPayment } from '../cash-payment';
import { CheckoutProvider } from '../../../context/checkout-context';

function makeTicket(overrides: Partial<TicketState> = {}): TicketState {
  return {
    items: [],
    customer: null,
    vehicle: null,
    coupon: null,
    loyaltyPointsToRedeem: 0,
    loyaltyDiscount: 0,
    depositCredit: 0,
    notes: null,
    subtotal: 40,
    taxAmount: 0,
    discountAmount: 0,
    total: 40,
    ...overrides,
  } as unknown as TicketState;
}

function renderCash() {
  return render(
    <CheckoutProvider>
      <CashPayment />
    </CheckoutProvider>
  );
}

function txnBody() {
  const call = posFetchMock.mock.calls.find((c) => c[0] === '/api/pos/transactions');
  return JSON.parse((call![1] as { body: string }).body);
}

beforeEach(() => {
  posFetchMock.mockReset();
  posFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'tx-1', receipt_number: 'R-1' } }),
  });
  queueMock.mockReset();
  queueMock.mockResolvedValue('offline-abc123');
  dispatchMock.mockReset();
  onlineMock.value = true;
  mockTicket.value = makeTicket();
});
afterEach(cleanup);

describe('CashPayment — cash tip capture (Item 4 / 4a-cash)', () => {
  it('UAT#1 + #6: custom $5 tip persists at both grains; change excludes the tip', async () => {
    renderCash(); // $40 service total

    // Enter a $5 custom tip.
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '5' } });
    // The Custom chip is the active selection and the summary reflects the amount.
    expect(screen.getByRole('button', { name: 'Custom' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('$5.00')).toBeTruthy(); // tip summary line renders

    // Tender $50 via a denomination chip, then complete.
    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    const body = txnBody();
    expect(body.payment_method).toBe('cash');
    expect(body.tip_amount).toBe(5); // transaction grain
    expect(body.payments[0].tip_amount).toBe(5); // payment-row grain
    expect(body.payments[0].amount).toBe(40); // service total, NOT total + tip
    expect(body.payments[0].cash_tendered).toBe(50);
    // Locked change-math decision: change = tendered - service total (50-40),
    // NOT tendered - (service total + tip) (which would be 5).
    expect(body.payments[0].change_given).toBe(10);
  });

  it('UAT#2 + #5: a no-tip cash sale needs zero tip taps and writes 0 at both grains', async () => {
    renderCash();

    // "No tip" is the default selection — $0, no friction.
    expect(screen.getByRole('button', { name: 'No tip' }).getAttribute('aria-pressed')).toBe('true');
    // Complete is gated only on tender, never on a tip choice.
    expect((screen.getByRole('button', { name: 'Complete' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    const body = txnBody();
    expect(body.tip_amount).toBe(0);
    expect(body.payments[0].tip_amount).toBe(0);
  });

  it('preset tip is a percentage of subtotal (matching the card on-reader basis)', async () => {
    mockTicket.value = makeTicket({ subtotal: 40, total: 40 });
    renderCash();

    fireEvent.click(screen.getByRole('button', { name: '25%' })); // 25% of $40 = $10
    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    const body = txnBody();
    expect(body.tip_amount).toBe(10);
    expect(body.payments[0].tip_amount).toBe(10);
  });

  it('UAT#4: offline cash sale queues the tip in its payload (no network call)', async () => {
    onlineMock.value = false;
    renderCash();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(queueMock).toHaveBeenCalledTimes(1));
    expect(posFetchMock).not.toHaveBeenCalled(); // offline path takes no network
    const queued = queueMock.mock.calls[0][0] as { tip_amount: number };
    expect(queued.tip_amount).toBe(5);
  });

  it('preset tip rounds to the nearest cent (15% of $33.33 = $5.00)', async () => {
    mockTicket.value = makeTicket({ subtotal: 33.33, total: 33.33 });
    renderCash();

    fireEvent.click(screen.getByRole('button', { name: '15%' })); // 33.33 * 0.15 = 4.9995 → 5.00
    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    expect(txnBody().tip_amount).toBe(5);
  });

  it('tapping "No tip" after entering a tip resets the amount to $0', async () => {
    renderCash();

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '5' } });
    expect(screen.getByText('$5.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'No tip' }));
    expect(screen.queryByText(/^Tip:/)).toBeNull(); // summary gated on tipAmount > 0

    fireEvent.click(screen.getByRole('button', { name: '$50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    expect(txnBody().tip_amount).toBe(0);
  });

  it('rehydrates the chip selection from checkout-context after a step remount (no silent over-charge)', async () => {
    // The overlay conditionally renders <CashPayment/>, so it unmounts on step
    // change while checkout.tipAmount persists. The chip UI must come back in
    // agreement with the canonical amount — never "No tip" highlighted while a
    // tip is still charged.
    const { rerender } = render(
      <CheckoutProvider>
        <CashPayment />
      </CheckoutProvider>
    );

    // Pick 20% (of $40 = $8), then unmount CashPayment while keeping the provider.
    fireEvent.click(screen.getByRole('button', { name: '20%' }));
    expect(screen.getByText('$8.00')).toBeTruthy();
    rerender(
      <CheckoutProvider>
        <div />
      </CheckoutProvider>
    );

    // Remount: the 20% chip is restored (not "No tip"), and the summary agrees.
    rerender(
      <CheckoutProvider>
        <CashPayment />
      </CheckoutProvider>
    );
    expect(screen.getByRole('button', { name: '20%' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'No tip' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('$8.00')).toBeTruthy();
  });
});
