/**
 * Item 2 (2026-06-20) — `<PayForm>` tip chip selector + deferred Stripe
 * Elements mount on full-payment links. Partial-payment links keep the
 * pre-Item-2 auto-mount UX with no tip UI.
 *
 * Test focuses on the component's branching + tip-chip behavior, NOT the
 * Stripe Elements inner form (that's a thin wrapper around the third-party
 * `<PaymentElement>` and is exercised in the existing live-render path).
 * Both `@stripe/react-stripe-js` exports are mocked to render simple stubs
 * so the deferred-mount branch can be observed without a real Stripe.js
 * load.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="next-image">{alt}</span>,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve({}),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements-host">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element">[card form]</div>,
  useStripe: () => ({
    confirmPayment: vi.fn().mockResolvedValue({ error: null }),
  }),
  useElements: () => ({}),
}));

// Imported AFTER mocks
import { PayForm } from '../pay-form';

const TOKEN = 'tok_test_abc';

const fetchMock = vi.fn();
let savedFetch: typeof global.fetch;

beforeEach(() => {
  savedFetch = global.fetch;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterEach(() => {
  cleanup();
  global.fetch = savedFetch;
});

function mockIntentResponse(amountCents: number, tipCents = 0) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      clientSecret: 'cs_test_123',
      amountCents,
      tipCents,
      totalCents: amountCents + tipCents,
      alreadyPaid: false,
    }),
  });
}

function mockIntentError(message: string, status = 422) {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: message }),
  });
}

// -----------------------------------------------------------------------------
// Tests — partial-payment (auto-mount) branch
// -----------------------------------------------------------------------------

describe('<PayForm> isFullPayment=false (partial-payment / deposit link)', () => {
  it('auto-mounts Stripe Elements without showing tip UI', async () => {
    mockIntentResponse(5000);
    render(<PayForm token={TOKEN} amountDueCents={5000} isFullPayment={false} />);

    // Intent route called immediately on mount with NO body (legacy shape)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain(`/api/pay/${TOKEN}/intent`);
    expect((opts as { method: string }).method).toBe('POST');
    expect((opts as { body?: string }).body).toBeUndefined();

    // Elements host rendered
    await screen.findByTestId('stripe-elements-host');
    expect(screen.queryByText(/Add a tip/i)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Tests — full-payment (deferred-mount) branch
// -----------------------------------------------------------------------------

describe('<PayForm> isFullPayment=true (full-payment link)', () => {
  it('renders tip chip selector + does NOT call intent route on mount', async () => {
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    expect(screen.getByText(/Add a tip/i)).toBeTruthy();
    // 15 / 20 / 25 preset chips render
    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    // Custom chip
    expect(screen.getByText(/Custom/i)).toBeTruthy();
    // No Tip + Continue buttons
    expect(screen.getByText(/No Tip/i)).toBeTruthy();
    expect(screen.getByText(/Continue to Payment/i)).toBeTruthy();

    // Stripe Elements NOT mounted yet — deferred
    expect(screen.queryByTestId('stripe-elements-host')).toBeNull();
    // Fetch NOT fired yet
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selecting 20% chip → live tip display reflects 20% of amount', async () => {
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText('20%'));

    // $20.00 appears twice: the chip's own dollar-amount label AND the
    // tip row in the totals summary. The Total line ($120.00) is unique
    // and is the strongest assertion that the tip flowed through to the
    // summary math.
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$120.00')).toBeTruthy();
    // Amount due unchanged
    expect(screen.getByText('$100.00')).toBeTruthy();
  });

  it('clicking Continue with 20% preset → POSTs tipCents=2000', async () => {
    mockIntentResponse(10000, 2000);
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText('20%'));
    fireEvent.click(screen.getByText(/Continue to Payment/i));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain(`/api/pay/${TOKEN}/intent`);
    const body = JSON.parse((opts as { body: string }).body);
    expect(body).toEqual({ tipCents: 2000 });

    // Elements host mounts after intent route resolves
    await screen.findByTestId('stripe-elements-host');
  });

  it('clicking No Tip → POSTs tipCents=0 immediately (skips Continue step)', async () => {
    mockIntentResponse(10000, 0);
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText(/No Tip/i));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse((opts as { body: string }).body);
    expect(body).toEqual({ tipCents: 0 });

    await screen.findByTestId('stripe-elements-host');
  });

  it('selecting Custom chip + entering $7.50 → live total reflects custom tip', async () => {
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText(/Custom/i));
    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7.50' } });

    // $7.50 tip on $100 charge → Total $107.50
    expect(screen.getByText('$7.50')).toBeTruthy();
    expect(screen.getByText('$107.50')).toBeTruthy();
  });

  it('Custom with empty input → Continue button disabled', async () => {
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText(/Custom/i));

    const continueBtn = screen.getByText(/Continue to Payment/i).closest('button')!;
    expect(continueBtn.disabled).toBe(true);
  });

  it('Custom > 100% of amount → Continue disabled (client-side ceiling mirror)', async () => {
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText(/Custom/i));
    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '200' } }); // $200 tip on $100 charge

    const continueBtn = screen.getByText(/Continue to Payment/i).closest('button')!;
    expect(continueBtn.disabled).toBe(true);
  });

  it('server-side error on Continue → surfaces error message, stays on tip stage', async () => {
    mockIntentError('Tips are not accepted on partial-payment links.');
    render(<PayForm token={TOKEN} amountDueCents={10000} isFullPayment={true} />);

    fireEvent.click(screen.getByText('15%'));
    fireEvent.click(screen.getByText(/Continue to Payment/i));

    await waitFor(() =>
      expect(screen.getByText(/Tips are not accepted/i)).toBeTruthy()
    );

    // Tip selector still visible; no Elements host mounted
    expect(screen.getByText(/Add a tip/i)).toBeTruthy();
    expect(screen.queryByTestId('stripe-elements-host')).toBeNull();
  });
});
