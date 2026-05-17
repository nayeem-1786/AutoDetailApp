import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-i regression — pins the POS Jobs `handleCheckout` flow.
//
// When `checkout-items` returns a `coupon_code` (whether sourced from the
// linked quote or — post-fix — from the appointment fallback), the page MUST:
//   1. Restore the ticket with coupon: null first (defensive reset).
//   2. POST to /api/pos/coupons/validate with the items + customer.
//   3. Dispatch SET_COUPON with the validated discount.
//
// The reducer's SET_COUPON case is replace-based (not additive), and
// RESTORE_TICKET zeroes coupon ahead of the dispatch — so re-running checkout
// for the same job is idempotent and cannot double-discount.
// ──────────────────────────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const fetchCalls: FetchCall[] = [];
const fetchResponses: Record<
  string,
  { ok: boolean; status?: number; json: () => Promise<unknown> }
> = {};

const dispatchSpy = vi.fn();

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({
    ticket: {},
    dispatch: dispatchSpy,
  }),
}));

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const resp = fetchResponses[url];
    if (!resp) {
      return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
    }
    return resp;
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/pos/jobs',
}));

// Stub the child components so we can invoke `onCheckout` from a test trigger
// without rendering the real (data-heavy) queue / detail panes.
vi.mock('../components/job-queue', () => ({
  JobQueue: (props: { onCheckout: (jobId: string) => void }) => (
    <button data-testid="trigger-checkout" onClick={() => props.onCheckout('job-1')}>
      checkout
    </button>
  ),
}));

vi.mock('../components/job-detail', () => ({
  JobDetail: () => <div data-testid="job-detail" />,
}));

import JobsPage from '../page';

beforeEach(() => {
  fetchCalls.length = 0;
  for (const key of Object.keys(fetchResponses)) delete fetchResponses[key];
  dispatchSpy.mockReset();
  pushSpy.mockReset();
});

afterEach(() => {
  cleanup();
});

function buildCheckoutItemsResponse(couponCode: string | null) {
  return {
    ok: true,
    json: async () => ({
      data: {
        job_id: 'job-1',
        customer_id: 'cust-1',
        vehicle_id: 'veh-1',
        customer: {
          id: 'cust-1',
          first_name: 'Jane',
          last_name: 'Doe',
          phone: null,
          email: null,
          customer_type: null,
          tags: null,
        },
        vehicle: {
          id: 'veh-1',
          year: 2024,
          make: 'Tesla',
          model: 'Model 3',
          color: 'White',
          size_class: 'sedan',
        },
        items: [
          {
            item_type: 'service',
            service_id: 'svc-1',
            item_name: 'Detail',
            quantity: 1,
            unit_price: 200,
            is_taxable: false,
          },
        ],
        coupon_code: couponCode,
        deposit_amount: 0,
        deposit_date: null,
        prior_payments: [],
        prior_payments_total_cents: 0,
        status: 'in_progress',
      },
    }),
  };
}

describe('JobsPage handleCheckout — coupon re-validation (Item 15g Layer 15g-i)', () => {
  it('validates and dispatches SET_COUPON when checkout-items returns a coupon_code', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse('SAVE25');
    fetchResponses['/api/pos/coupons/validate'] = {
      ok: true,
      json: async () => ({
        data: { id: 'coup-1', code: 'SAVE25', total_discount: 25 },
      }),
    };

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url === '/api/pos/coupons/validate')).toBe(true);
    });

    // Validate request body shape — code + customer + items must be present.
    const validateCall = fetchCalls.find((c) => c.url === '/api/pos/coupons/validate');
    expect(validateCall).toBeDefined();
    const body = JSON.parse(validateCall!.init!.body as string);
    expect(body.code).toBe('SAVE25');
    expect(body.customer_id).toBe('cust-1');
    expect(Array.isArray(body.items)).toBe(true);

    // RESTORE_TICKET fires first with coupon: null (defensive reset), then
    // SET_COUPON fires with the validated discount. Order matters.
    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(dispatchedTypes).toContain('RESTORE_TICKET');
    expect(dispatchedTypes).toContain('SET_COUPON');

    const restoreCall = dispatchSpy.mock.calls.find((c) => c[0].type === 'RESTORE_TICKET');
    expect(restoreCall![0].state.coupon).toBeNull();

    const couponCall = dispatchSpy.mock.calls.find((c) => c[0].type === 'SET_COUPON');
    expect(couponCall![0].coupon).toEqual({
      id: 'coup-1',
      code: 'SAVE25',
      discount: 25,
    });
  });

  it('skips coupon validation when checkout-items returns no coupon_code', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(null);

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/pos');
    });

    expect(fetchCalls.some((c) => c.url === '/api/pos/coupons/validate')).toBe(false);
    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(dispatchedTypes).toContain('RESTORE_TICKET');
    expect(dispatchedTypes).not.toContain('SET_COUPON');
  });

  it('re-runs cleanly on a second checkout — RESTORE_TICKET resets coupon to null each time (idempotency)', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse('SAVE25');
    fetchResponses['/api/pos/coupons/validate'] = {
      ok: true,
      json: async () => ({
        data: { id: 'coup-1', code: 'SAVE25', total_discount: 25 },
      }),
    };

    const { getByTestId } = render(<JobsPage />);

    // First checkout
    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_COUPON')).toHaveLength(1)
    );

    // Second checkout — should not stack a second discount on top of the first;
    // each pass is fully reset → re-applied.
    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_COUPON')).toHaveLength(2)
    );

    const restoreCalls = dispatchSpy.mock.calls.filter((c) => c[0].type === 'RESTORE_TICKET');
    expect(restoreCalls).toHaveLength(2);
    for (const call of restoreCalls) {
      expect(call[0].state.coupon).toBeNull();
    }
  });
});
