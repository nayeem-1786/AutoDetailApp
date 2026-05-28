import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CustomerTypeBadge } from '../customer-type-badge';

/**
 * Regression lock for docs/dev/POS_CUSTOMER_TYPE_PILL_PARITY_AUDIT.md (Session #118 fix).
 *
 * The customer-type pill (CustomerTypeBadge) is shared between Sale and Quotes.
 * On tap it (a) PATCHes customers.customer_type (a GLOBAL, permanent write) and
 * (b) calls onTypeChanged(newType) so the host can sync its LOCAL customer state
 * — which is what makes the badge cycle Unknown → Enthusiast → Professional →
 * Unknown across taps. The bug: the Quotes mount (quote-ticket-panel.tsx) never
 * passed onCustomerTypeChanged, so the local state was never synced → the badge
 * re-rendered from stale state → every tap repeated one transition (the operator
 * saw "Customer type cleared" because their customer was already professional).
 *
 * These tests pin the badge's contract (the seam the fix relies on): the callback
 * fires with the cycled value, the cycle order is correct, and — critically — the
 * stale-state failure mode when the callback is NOT wired (the pre-fix Quotes
 * condition). The Quotes panel now wires onCustomerTypeChanged exactly like Sale;
 * that wiring is guaranteed by the type-checker (the handler + prop) and confirmed
 * by manual POS verification (no QuoteTicketPanel render harness exists, and
 * standing one up — ~14 child components + 4 contexts — is disproportionate to a
 * ~9-line fix).
 */

const posFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/pos-fetch', () => ({ posFetch: posFetchMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

function okResponse(customer_type: string | null) {
  return { ok: true, json: async () => ({ data: { id: 'c1', customer_type } }) };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CustomerTypeBadge', () => {
  it('persists the change AND signals onTypeChanged when wired (professional → cleared)', async () => {
    posFetchMock.mockResolvedValue(okResponse(null));
    const onTypeChanged = vi.fn();
    render(<CustomerTypeBadge customerId="c1" customerType="professional" onTypeChanged={onTypeChanged} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onTypeChanged).toHaveBeenCalledWith(null));
    // Global persistence: PATCH to the customer record with the cycled value.
    expect(posFetchMock).toHaveBeenCalledWith(
      '/api/pos/customers/c1/type',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(JSON.parse(posFetchMock.mock.calls[0][1].body)).toEqual({ customer_type: null });
  });

  it('cycles null → enthusiast → professional → null', async () => {
    // null (Unknown) → enthusiast
    posFetchMock.mockResolvedValue(okResponse('enthusiast'));
    const cb1 = vi.fn();
    const r1 = render(<CustomerTypeBadge customerId="c1" customerType={null} onTypeChanged={cb1} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(cb1).toHaveBeenCalledWith('enthusiast'));
    r1.unmount();

    // enthusiast → professional
    posFetchMock.mockResolvedValue(okResponse('professional'));
    const cb2 = vi.fn();
    const r2 = render(<CustomerTypeBadge customerId="c1" customerType="enthusiast" onTypeChanged={cb2} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(cb2).toHaveBeenCalledWith('professional'));
    r2.unmount();

    // professional → null (Unknown) — closes the cycle
    posFetchMock.mockResolvedValue(okResponse(null));
    const cb3 = vi.fn();
    render(<CustomerTypeBadge customerId="c1" customerType="professional" onTypeChanged={cb3} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(cb3).toHaveBeenCalledWith(null));
  });

  it('REGRESSION (the Quotes bug): with NO onTypeChanged wired, a tap still PATCHes but the badge cannot advance — it stays stale', async () => {
    posFetchMock.mockResolvedValue(okResponse(null));
    // Pre-fix Quotes mount: onCustomerTypeChanged was never passed.
    render(<CustomerTypeBadge customerId="c1" customerType="professional" />);
    expect(screen.getByRole('button').textContent).toContain('Professional');

    fireEvent.click(screen.getByRole('button'));

    // The global write still happens (this is the data-integrity hazard: the
    // customer is silently demoted to Unknown in the DB)...
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    // ...but with no callback there is no way to sync local state, so the host
    // never re-renders with a new customerType prop and the pill lies — still
    // showing "Professional". Wiring onCustomerTypeChanged (the fix) is what lets
    // the parent update the prop so the displayed value advances.
    expect(screen.getByRole('button').textContent).toContain('Professional');
  });

  it('display follows the customerType prop (so a synced parent renders the cycle)', () => {
    const { rerender } = render(<CustomerTypeBadge customerId="c1" customerType={null} onTypeChanged={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain('Unknown');

    rerender(<CustomerTypeBadge customerId="c1" customerType="enthusiast" onTypeChanged={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain('Enthusiast');

    rerender(<CustomerTypeBadge customerId="c1" customerType="professional" onTypeChanged={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain('Professional');
  });
});
