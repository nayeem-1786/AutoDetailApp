import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Item 15f Phase 1 Layer 8b — deep-link drain tests.
 *
 *   - Pure validators (`isUuid`, `isSafeInternalPath`) — happy + malicious paths
 *   - `buildTicketStateFromLoad` — modifier columns zeroed, items mapped
 *   - `runEditModeDrain` — endpoint-pick by source, dispatch sequence
 *     (ENTER_EDIT_MODE → SET_LOYALTY_REDEEM → APPLY_MANUAL_DISCOUNT →
 *     SET_COUPON after validate)
 *   - Error paths — 403 / 404 / network failure return ok:false without
 *     dispatching ENTER_EDIT_MODE
 */

// Hoisted mock for posFetch — every test resets `fetchMock` to a queue of
// `Response` objects (or rejected promises) the SUT will consume in order.
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: fetchMock,
}));

// sonner toast — sentinel mock so the validators / error paths don't crash.
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  isUuid,
  isSafeInternalPath,
  buildTicketStateFromLoad,
  runEditModeDrain,
  type LoadResponseData,
} from '../use-edit-mode-drain';

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(JSON.stringify({ error: 'x' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeLoadData(overrides: Partial<LoadResponseData> = {}): LoadResponseData {
  return {
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+13105550000',
      email: 'jane@example.com',
      customer_type: null,
      tags: null,
    },
    vehicle: {
      id: 'veh-1',
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      color: 'Blue',
      size_class: 'sedan',
    },
    items: [
      {
        item_type: 'service',
        service_id: 'svc-1',
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 200,
        is_taxable: false,
        tier_name: 'sedan',
      },
    ],
    coupon_code: null,
    coupon_discount: null,
    loyalty_points_redeemed: null,
    loyalty_discount: null,
    manual_discount_value: null,
    manual_discount_label: null,
    deposit_amount: 0,
    deposit_date: null,
    status: 'scheduled',
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

describe('isUuid', () => {
  it('accepts canonical v4-shaped UUIDs', () => {
    expect(isUuid(APPT_UUID)).toBe(true);
    expect(isUuid('FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF')).toBe(true);
  });
  it('rejects empty / non-UUID strings', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('12345678-1234-1234-1234-12345678901')).toBe(false); // 35 chars
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('isSafeInternalPath — open-redirect defense', () => {
  it('accepts same-origin paths', () => {
    expect(isSafeInternalPath('/admin/appointments/' + APPT_UUID)).toBe(true);
    expect(isSafeInternalPath('/pos/jobs/' + JOB_UUID)).toBe(true);
    expect(isSafeInternalPath('/admin/appointments?id=x&date=2026-01-01')).toBe(true);
    expect(isSafeInternalPath('/pos')).toBe(true);
  });
  it('rejects absolute URLs (open-redirect attack surface)', () => {
    expect(isSafeInternalPath('https://evil.com/path')).toBe(false);
    expect(isSafeInternalPath('http://evil.com')).toBe(false);
  });
  it('rejects protocol-relative URLs', () => {
    expect(isSafeInternalPath('//evil.com/path')).toBe(false);
  });
  it('rejects dangerous schemes', () => {
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath('javascript:void(0)')).toBe(false);
    expect(isSafeInternalPath('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeInternalPath('vbscript:msgbox')).toBe(false);
    expect(isSafeInternalPath('file:///etc/passwd')).toBe(false);
  });
  it('rejects backslash legacy bypass', () => {
    expect(isSafeInternalPath('/\\evil.com')).toBe(false);
    expect(isSafeInternalPath('\\\\evil.com')).toBe(false);
  });
  it('rejects empty / non-string / non-leading-slash', () => {
    expect(isSafeInternalPath('')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath('admin/appointments')).toBe(false);
    expect(isSafeInternalPath('?source=appointment')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildTicketStateFromLoad
// ---------------------------------------------------------------------------

describe('buildTicketStateFromLoad', () => {
  it('maps items + customer + vehicle from the load response', () => {
    const state = buildTicketStateFromLoad(makeLoadData());
    expect(state.items).toHaveLength(1);
    expect(state.items[0].itemName).toBe('Full Detail');
    expect(state.items[0].unitPrice).toBe(200);
    expect(state.customer?.first_name).toBe('Jane');
    expect(state.vehicle?.make).toBe('Honda');
    expect(state.subtotal).toBe(200);
  });

  it('zeroes coupon / loyalty / manualDiscount on output even when present in response', () => {
    // The drain wires modifiers via follow-up dispatches (Layer 15g-iii
    // parity with handleCheckout). buildTicketStateFromLoad must NOT
    // propagate them into the ticketData payload — otherwise ENTER_EDIT_MODE
    // would set them AND the follow-up dispatches would set them again
    // (double-count on a re-render).
    const state = buildTicketStateFromLoad(
      makeLoadData({
        coupon_code: 'SUMMER10',
        coupon_discount: 20,
        loyalty_points_redeemed: 150,
        loyalty_discount: 7.5,
        manual_discount_value: 10,
        manual_discount_label: 'VIP',
      })
    );
    expect(state.coupon).toBeNull();
    expect(state.loyaltyPointsToRedeem).toBe(0);
    expect(state.loyaltyDiscount).toBe(0);
    expect(state.manualDiscount).toBeNull();
  });

  it('flows is_addon into the displayed item name (parity with handleCheckout)', () => {
    const state = buildTicketStateFromLoad(
      makeLoadData({
        items: [
          {
            item_type: 'service',
            service_id: 'svc-1',
            item_name: 'Headlight Restoration',
            quantity: 1,
            unit_price: 75,
            is_addon: true,
            is_taxable: false,
          },
        ],
      })
    );
    expect(state.items[0].itemName).toBe('Headlight Restoration (Add-on)');
  });

  it('applies deposit credit + prior payments to total', () => {
    const state = buildTicketStateFromLoad(
      makeLoadData({
        deposit_amount: 50,
        prior_payments: [],
        prior_payments_total_cents: 12500, // $125 prior payment
      })
    );
    // subtotal $200, no tax, deposit $50, prior $125 → total $25
    expect(state.depositCredit).toBe(50);
    expect(state.priorPaymentsTotal).toBe(125);
    expect(state.total).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// runEditModeDrain — dispatch contract
// ---------------------------------------------------------------------------

describe('runEditModeDrain — endpoint selection + dispatch sequence', () => {
  it('hits the appointments/load endpoint when source=appointment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: makeLoadData() }));
    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/pos/appointments/${APPT_UUID}/load`);
    const enterCall = dispatch.mock.calls.find((c) => c[0].type === 'ENTER_EDIT_MODE');
    expect(enterCall).toBeTruthy();
    expect(enterCall![0].source).toBe('appointment');
    expect(enterCall![0].sourceId).toBe(APPT_UUID);
    expect(enterCall![0].returnTo).toBe('/admin/appointments/' + APPT_UUID);
  });

  it('hits the jobs/checkout-items endpoint when source=job', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: makeLoadData() }));
    const dispatch = vi.fn();
    await runEditModeDrain(
      { source: 'job', id: JOB_UUID, returnTo: '/pos/jobs/' + JOB_UUID },
      dispatch
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/pos/jobs/${JOB_UUID}/checkout-items`);
    const enterCall = dispatch.mock.calls.find((c) => c[0].type === 'ENTER_EDIT_MODE');
    expect(enterCall).toBeTruthy();
    expect(enterCall![0].source).toBe('job');
  });

  it('dispatches SET_LOYALTY_REDEEM when loyalty points or discount present', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: makeLoadData({
          loyalty_points_redeemed: 100,
          loyalty_discount: 5,
        }),
      })
    );
    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    const loyaltyCall = dispatch.mock.calls.find(
      (c) => c[0].type === 'SET_LOYALTY_REDEEM'
    );
    expect(loyaltyCall).toBeTruthy();
    expect(loyaltyCall![0].points).toBe(100);
    expect(loyaltyCall![0].discount).toBe(5);
  });

  it('dispatches APPLY_MANUAL_DISCOUNT when manual discount value > 0', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: makeLoadData({
          manual_discount_value: 25,
          manual_discount_label: 'VIP',
        }),
      })
    );
    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    const manualCall = dispatch.mock.calls.find(
      (c) => c[0].type === 'APPLY_MANUAL_DISCOUNT'
    );
    expect(manualCall).toBeTruthy();
    expect(manualCall![0].discountType).toBe('dollar');
    expect(manualCall![0].value).toBe(25);
    expect(manualCall![0].label).toBe('VIP');
  });

  it('falls back manual_discount_label to "Manual discount" when null', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: makeLoadData({
          manual_discount_value: 25,
          manual_discount_label: null,
        }),
      })
    );
    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    const manualCall = dispatch.mock.calls.find(
      (c) => c[0].type === 'APPLY_MANUAL_DISCOUNT'
    );
    expect(manualCall).toBeTruthy();
    expect(manualCall![0].label).toBe('Manual discount');
  });

  it('re-validates coupon code via /api/pos/coupons/validate and dispatches SET_COUPON', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: makeLoadData({ coupon_code: 'SUMMER10' }),
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { id: 'coupon-1', code: 'SUMMER10', total_discount: 18 },
        })
      );
    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/pos/coupons/validate');
    const couponCall = dispatch.mock.calls.find((c) => c[0].type === 'SET_COUPON');
    expect(couponCall).toBeTruthy();
    expect(couponCall![0].coupon.code).toBe('SUMMER10');
    expect(couponCall![0].coupon.discount).toBe(18);
  });

  it('continues silently if coupon revalidate fails (cart still hydrated)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: makeLoadData({ coupon_code: 'EXPIRED' }),
        })
      )
      .mockResolvedValueOnce(emptyResponse(400));
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(result.ok).toBe(true);
    expect(dispatch.mock.calls.some((c) => c[0].type === 'ENTER_EDIT_MODE')).toBe(true);
    expect(dispatch.mock.calls.some((c) => c[0].type === 'SET_COUPON')).toBe(false);
  });
});

describe('runEditModeDrain — error paths', () => {
  it('returns ok:false with status 404 when record missing — no dispatch', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(404));
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(result).toEqual({ ok: false, status: 404 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns ok:false with status 403 when permission denied — no dispatch', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(403));
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(result).toEqual({ ok: false, status: 403 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns ok:false when network throws — no dispatch', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(result).toEqual({ ok: false });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns ok:false when response payload is malformed (no data.items)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { customer: null } }));
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments/' + APPT_UUID,
      },
      dispatch
    );
    expect(result.ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
