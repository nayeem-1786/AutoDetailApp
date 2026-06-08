/**
 * Phase 3 Theme E.3 — ApplyCreditDialog component tests.
 *
 * Covers:
 *   - balance is fetched and rendered on open
 *   - successful apply hits the E.2 endpoint with cents + customer_id
 *   - 0-balance state disables Apply button + amount input
 *   - over-balance amount is rejected before fetch (client-side guard)
 *   - maxApplyCents cap is enforced
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { ApplyCreditDialog } from '../apply-credit-dialog';

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

type FetchResponse = { ok: boolean; json: () => Promise<unknown> };
const posFetchMock = vi.fn();

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: (...args: unknown[]) =>
    (posFetchMock as unknown as (...a: unknown[]) => Promise<FetchResponse>)(
      ...args
    ),
}));

function mockBalance(availableCents: number): FetchResponse {
  return {
    ok: true,
    json: async () => ({
      customer_id: 'cust-1',
      total_issued_cents: availableCents,
      total_applied_cents: 0,
      available_balance_cents: availableCents,
      unapplied_credits: [],
    }),
  };
}

function mockApplySuccess(appliedCents: number): FetchResponse {
  return {
    ok: true,
    json: async () => ({
      success: true,
      total_applied_cents: appliedCents,
      remaining_balance_cents: 0,
      applied_credits: [{ id: 'credit-1' }],
    }),
  };
}

afterEach(() => {
  cleanup();
  posFetchMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe('ApplyCreditDialog', () => {
  it('fetches and displays available balance when opened', async () => {
    posFetchMock.mockResolvedValueOnce(mockBalance(5000));
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={() => {}}
        customerId="cust-1"
        transactionId="tx-1"
      />
    );

    await waitFor(() => {
      // POS-auth variant of the customer-credits endpoint — closes the
      // cross-surface 401-loop bug. See `apply-credit-dialog.tsx:62-69` for
      // the comment explaining the URL surface (and the new POS route at
      // `src/app/api/pos/customers/[id]/credits/route.ts`).
      expect(posFetchMock).toHaveBeenCalledWith(
        '/api/pos/customers/cust-1/credits'
      );
    });
    await waitFor(() => {
      expect(screen.getByText('$50.00')).toBeTruthy();
    });
  });

  it('disables Apply button when balance is zero', async () => {
    posFetchMock.mockResolvedValueOnce(mockBalance(0));
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={() => {}}
        customerId="cust-1"
        transactionId="tx-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('$0.00')).toBeTruthy();
    });

    const applyBtn = screen.getByRole('button', { name: /apply credit/i });
    expect((applyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('POSTs to E.2 apply-credit endpoint with cents on Apply click', async () => {
    posFetchMock
      .mockResolvedValueOnce(mockBalance(5000))
      .mockResolvedValueOnce(mockApplySuccess(2500));

    const onApplied = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={onOpenChange}
        customerId="cust-1"
        transactionId="tx-1"
        onApplied={onApplied}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('$50.00')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '25' } });

    const applyBtn = screen.getByRole('button', { name: /apply credit/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(posFetchMock).toHaveBeenCalledTimes(2);
    });

    const applyCall = posFetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(applyCall[0]).toBe('/api/pos/transactions/tx-1/apply-credit');
    expect(applyCall[1].method).toBe('POST');
    const body = JSON.parse(String(applyCall[1].body));
    expect(body.amount_cents).toBe(2500);
    expect(body.customer_id).toBe('cust-1');

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith(2500);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks apply when amount exceeds balance (client guard)', async () => {
    posFetchMock.mockResolvedValueOnce(mockBalance(1000));
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={() => {}}
        customerId="cust-1"
        transactionId="tx-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('$10.00')).toBeTruthy();
    });

    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } });

    const applyBtn = screen.getByRole('button', { name: /apply credit/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    // Only the balance fetch fired; no apply POST attempted.
    expect(posFetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps applicable amount at maxApplyCents (amount due)', async () => {
    posFetchMock.mockResolvedValueOnce(mockBalance(10_000));
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={() => {}}
        customerId="cust-1"
        transactionId="tx-1"
        maxApplyCents={3000}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Max applicable/i)).toBeTruthy();
    });
    expect(screen.getByText(/\$30\.00/)).toBeTruthy();

    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } });

    const applyBtn = screen.getByRole('button', { name: /apply credit/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(posFetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles balance fetch failure gracefully (sets balance to 0)', async () => {
    posFetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    } as FetchResponse);
    render(
      <ApplyCreditDialog
        open={true}
        onOpenChange={() => {}}
        customerId="cust-1"
        transactionId="tx-1"
      />
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('$0.00')).toBeTruthy();
    });
  });
});
