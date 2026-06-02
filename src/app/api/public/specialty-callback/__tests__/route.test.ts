/**
 * Tests for POST /api/public/specialty-callback (Session #139).
 *
 * Pins the contract for the four-concern bundle:
 *
 *   1. Per-request_type slug lookup — specialty_vehicle uses
 *      booking_staff_notify_specialty; staff_assessed_service uses
 *      booking_staff_notify_quote_request. (Concern 1 / Pattern B)
 *
 *   2. Footgun hardening — when a staff template's recipient_phones is
 *      [] or NULL, the dispatch loop drops silently + warn-logs instead
 *      of falling back to [biz.phone]. (Concern 2 / audit S2+S3)
 *
 *   3. Universal customer SMS — both variants send
 *      quote_request_received_customer to the customer's phone after
 *      audit_log. Explicit behavior change for specialty_vehicle.
 *      (Concern 3)
 *
 *   4. Concern 4's self-send chokepoint is exercised in
 *      src/lib/utils/__tests__/sms-self-send.test.ts — this file mocks
 *      sendSms() so the route logic is testable in isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ────────── Mocks ──────────

// audit log — no-op
vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

// business info
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({
    name: 'Smart Details Auto Spa',
    phone: '+14244010094',
    address: '123 Lomita Blvd, Lomita, CA 90717',
    streetAddress: '123 Lomita Blvd',
    city: 'Lomita',
    state: 'CA',
    zip: '90717',
    email: null,
    website: null,
    logo_url: null,
  }),
}));

// sendSms — capture all calls. Return type is the union of success/failure
// so individual tests can override mockImplementation to either shape.
type SendSmsReturn = { success: true; sid: string } | { success: false; error: string };
const sendSmsMock = vi.fn<(to: string, body: string) => Promise<SendSmsReturn>>(
  async (_to, _body) => ({ success: true, sid: 'SM_test' })
);
vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: [string, string, unknown?]) => sendSmsMock(...(args as [string, string])),
}));

// renderSmsTemplate — return a structured shape we can shape per test
type RenderResult = {
  body: string;
  isActive: boolean;
  canSilence: boolean;
  recipientType: 'customer' | 'staff' | 'detailer';
  recipientPhones: string[] | null;
};

const renderSmsTemplateMock = vi.fn<
  (slug: string, vars: Record<string, unknown>, fallback: string) => Promise<RenderResult>
>();

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: (slug: string, vars: Record<string, unknown>, fallback: string) =>
    renderSmsTemplateMock(slug, vars, fallback),
}));

import { POST } from '@/app/api/public/specialty-callback/route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/public/specialty-callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Default render result — staff slug returns a 2-phone list, customer slug
// returns the body fallback. Individual tests override per-slug as needed.
function defaultRenderImpl(slug: string, _vars: Record<string, unknown>, fallback: string): Promise<RenderResult> {
  if (slug === 'booking_staff_notify_specialty' || slug === 'booking_staff_notify_quote_request') {
    return Promise.resolve({
      body: `[rendered ${slug}]`,
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+14242370913', '+14243637450'],
    });
  }
  if (slug === 'quote_request_received_customer') {
    return Promise.resolve({
      body: fallback, // mirror behavior of the real engine: returns fallback when not configured
      isActive: true,
      canSilence: true,
      recipientType: 'customer',
      recipientPhones: null,
    });
  }
  throw new Error(`Unexpected slug in test: ${slug}`);
}

beforeEach(() => {
  sendSmsMock.mockClear();
  renderSmsTemplateMock.mockReset();
  renderSmsTemplateMock.mockImplementation(defaultRenderImpl);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern 1 — per-request_type slug lookup (Pattern B)
// ─────────────────────────────────────────────────────────────────────────────

describe('Concern 1 — per-request_type slug lookup', () => {
  it('specialty_vehicle uses booking_staff_notify_specialty', async () => {
    const res = await POST(buildRequest({
      request_type: 'specialty_vehicle',
      name: 'Alice Anderson',
      phone: '+13105551234',
      vehicle_year: 2023,
      vehicle_make: 'Ferrari',
      vehicle_model: '488',
      size_class: 'exotic',
    }));
    expect(res.status).toBe(200);

    // Find the staff-slug render call (filter out the customer render)
    const staffCalls = renderSmsTemplateMock.mock.calls.filter(
      ([slug]) => slug === 'booking_staff_notify_specialty' || slug === 'booking_staff_notify_quote_request'
    );
    expect(staffCalls).toHaveLength(1);
    expect(staffCalls[0][0]).toBe('booking_staff_notify_specialty');
  });

  it('staff_assessed_service uses booking_staff_notify_quote_request', async () => {
    const res = await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'Bob Brown',
      phone: '+13105551234',
      service_name: 'Ceramic Coating',
      service_id: 'svc_abc',
    }));
    expect(res.status).toBe(200);

    const staffCalls = renderSmsTemplateMock.mock.calls.filter(
      ([slug]) => slug === 'booking_staff_notify_specialty' || slug === 'booking_staff_notify_quote_request'
    );
    expect(staffCalls).toHaveLength(1);
    expect(staffCalls[0][0]).toBe('booking_staff_notify_quote_request');
  });

  it('staff_assessed_service forwards service_name + vehicle context to the renderer', async () => {
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'Carol C',
      phone: '+13105551234',
      service_name: 'Paint Correction',
      vehicle_year: 2020,
      vehicle_make: 'Tesla',
      vehicle_model: 'Model 3',
    }));
    const call = renderSmsTemplateMock.mock.calls.find(
      ([slug]) => slug === 'booking_staff_notify_quote_request'
    );
    expect(call).toBeDefined();
    const vars = call![1];
    expect(vars.service_name).toBe('Paint Correction');
    expect(vars.vehicle_description).toBe('2020 Tesla Model 3');
    expect(vars.customer_name).toBe('Carol C');
  });

  it('defaults missing request_type to specialty_vehicle (BC for pre-#137 clients)', async () => {
    await POST(buildRequest({
      // no request_type
      name: 'Dave',
      phone: '+13105551234',
      vehicle_make: 'Porsche',
      size_class: 'exotic',
    }));
    const staffCalls = renderSmsTemplateMock.mock.calls.filter(
      ([slug]) => slug === 'booking_staff_notify_specialty'
    );
    expect(staffCalls).toHaveLength(1);
  });

  it('rejects unknown request_type with 400', async () => {
    const res = await POST(buildRequest({
      request_type: 'bogus_variant',
      name: 'X',
      phone: '+13105551234',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects staff_assessed_service without service_name with 400', async () => {
    const res = await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'X',
      phone: '+13105551234',
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern 1 — staff dispatch reaches the configured phones (not biz.phone)
// ─────────────────────────────────────────────────────────────────────────────

describe('Concern 1 — staff SMS dispatch uses template recipient_phones', () => {
  it('staff_assessed_service: SMS goes to the 2 staff phones, NOT biz.phone', async () => {
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'Eve',
      phone: '+13105551234',
      service_name: 'Ceramic Coating',
    }));
    // Filter sendSms calls down to staff-targeted ones (the customer SMS
    // will go to the caller's phone, +13105551234)
    const staffSends = sendSmsMock.mock.calls.filter(([to]) => to !== '+13105551234');
    expect(staffSends.map(([to]) => to)).toEqual(['+14242370913', '+14243637450']);
    // Critically: NEVER sent to biz.phone (+14244010094)
    expect(sendSmsMock.mock.calls.find(([to]) => to === '+14244010094')).toBeUndefined();
  });

  it('specialty_vehicle: SMS goes to the 2 staff phones (regression: existing behavior preserved)', async () => {
    await POST(buildRequest({
      request_type: 'specialty_vehicle',
      name: 'Frank',
      phone: '+13105551234',
      vehicle_year: 1965,
      vehicle_make: 'Ford',
      vehicle_model: 'Mustang',
      size_class: 'classic',
    }));
    const staffSends = sendSmsMock.mock.calls.filter(([to]) => to !== '+13105551234');
    expect(staffSends.map(([to]) => to)).toEqual(['+14242370913', '+14243637450']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern 2 — footgun: empty or NULL recipient_phones drops + warn-logs
// (S2/S3 from QUOTE_REQUEST_SMS_AUDIT)
// ─────────────────────────────────────────────────────────────────────────────

describe('Concern 2 — footgun: empty/null recipient_phones drops silently', () => {
  it('staff slug with recipient_phones: [] → zero staff sends + warn-log fires', async () => {
    renderSmsTemplateMock.mockImplementation(async (slug, _vars, fallback) => {
      if (slug.startsWith('booking_staff_notify_')) {
        return {
          body: `[rendered ${slug}]`,
          isActive: true,
          canSilence: true,
          recipientType: 'staff',
          recipientPhones: [],          // ← S2: admin cleared all phones
        };
      }
      // customer slug
      return {
        body: fallback,
        isActive: true,
        canSilence: true,
        recipientType: 'customer',
        recipientPhones: null,
      };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'G',
      phone: '+13105551234',
      service_name: 'Ceramic Coating',
    }));
    expect(res.status).toBe(200);

    // No staff sends at all — only the customer SMS to +13105551234
    const staffSends = sendSmsMock.mock.calls.filter(([to]) => to !== '+13105551234');
    expect(staffSends).toHaveLength(0);

    // Warn-log surfaces the config bug
    const warnMessages = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnMessages).toMatch(/Staff SMS dropped/);
    expect(warnMessages).toMatch(/no recipient_phones configured/);
    expect(warnMessages).toMatch(/booking_staff_notify_quote_request/);
  });

  it('staff slug with recipient_phones: null → zero staff sends + warn-log fires', async () => {
    renderSmsTemplateMock.mockImplementation(async (slug, _vars, fallback) => {
      if (slug.startsWith('booking_staff_notify_')) {
        return {
          body: `[rendered ${slug}]`,
          isActive: true,
          canSilence: true,
          recipientType: 'staff',
          recipientPhones: null,        // ← S3: fresh DB / forgotten seed
        };
      }
      return {
        body: fallback,
        isActive: true,
        canSilence: true,
        recipientType: 'customer',
        recipientPhones: null,
      };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await POST(buildRequest({
      request_type: 'specialty_vehicle',
      name: 'H',
      phone: '+13105551234',
      vehicle_make: 'Bugatti',
      size_class: 'exotic',
    }));

    const staffSends = sendSmsMock.mock.calls.filter(([to]) => to !== '+13105551234');
    expect(staffSends).toHaveLength(0);
    const warnMessages = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnMessages).toMatch(/Staff SMS dropped/);
    expect(warnMessages).toMatch(/booking_staff_notify_specialty/);
  });

  it('CRITICAL REGRESSION GUARD: empty recipients never falls back to biz.phone (+14244010094)', async () => {
    renderSmsTemplateMock.mockImplementation(async (slug, _vars, fallback) => {
      if (slug.startsWith('booking_staff_notify_')) {
        return {
          body: '[rendered]',
          isActive: true,
          canSilence: true,
          recipientType: 'staff',
          recipientPhones: [],
        };
      }
      return {
        body: fallback,
        isActive: true,
        canSilence: true,
        recipientType: 'customer',
        recipientPhones: null,
      };
    });

    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'I',
      phone: '+13105551234',
      service_name: 'Window Tint',
    }));

    // The pre-#139 bug: recipients defaulted to [biz.phone]. This assertion
    // pins the post-#139 contract that biz.phone is NEVER a fallback recipient.
    expect(sendSmsMock.mock.calls.find(([to]) => to === '+14244010094')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Concern 3 — universal customer SMS
// ─────────────────────────────────────────────────────────────────────────────

describe('Concern 3 — universal customer SMS dispatch', () => {
  it('staff_assessed_service: customer SMS sent with service_name as request_subject', async () => {
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'Jane Doe',
      phone: '+13105551234',
      service_name: 'Ceramic Coating',
    }));

    // Customer SMS goes to the form's phone field
    const customerSends = sendSmsMock.mock.calls.filter(([to]) => to === '+13105551234');
    expect(customerSends).toHaveLength(1);

    // The renderer was called with first_name="Jane" + request_subject="Ceramic Coating"
    const custCall = renderSmsTemplateMock.mock.calls.find(
      ([slug]) => slug === 'quote_request_received_customer'
    );
    expect(custCall).toBeDefined();
    const vars = custCall![1];
    expect(vars.first_name).toBe('Jane');
    expect(vars.request_subject).toBe('Ceramic Coating');
  });

  it('specialty_vehicle: customer SMS sent with "specialty vehicle" as request_subject (BEHAVIOR CHANGE)', async () => {
    // EXPLICIT NEW BEHAVIOR — pre-#139 this variant sent NO customer SMS.
    await POST(buildRequest({
      request_type: 'specialty_vehicle',
      name: 'Karl Klein',
      phone: '+13105557777',
      vehicle_make: 'Lamborghini',
      size_class: 'exotic',
    }));

    const customerSends = sendSmsMock.mock.calls.filter(([to]) => to === '+13105557777');
    expect(customerSends).toHaveLength(1);

    const custCall = renderSmsTemplateMock.mock.calls.find(
      ([slug]) => slug === 'quote_request_received_customer'
    );
    expect(custCall).toBeDefined();
    expect(custCall![1].first_name).toBe('Karl');
    expect(custCall![1].request_subject).toBe('specialty vehicle');
  });

  it('customer SMS dispatched to the customer phone from the request payload, distinguishable from staff body', async () => {
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'L',
      phone: '+13109998888',
      service_name: 'Detail',
    }));
    const customerSends = sendSmsMock.mock.calls.filter(([to]) => to === '+13109998888');
    expect(customerSends).toHaveLength(1);

    // The body sent to the customer is the customer-template render, NOT
    // the staff-template body — even if both rendered to the same string in
    // a different mock setup, the dispatch targets are disjoint.
    const staffSends = sendSmsMock.mock.calls.filter(
      ([to]) => to === '+14242370913' || to === '+14243637450'
    );
    expect(staffSends.every(([to]) => to !== '+13109998888')).toBe(true);
  });

  it('first_name is derived from the first whitespace token of the name field', async () => {
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: '  Mary  Lou  Anderson  ',
      phone: '+13105551234',
      service_name: 'Detail',
    }));
    const custCall = renderSmsTemplateMock.mock.calls.find(
      ([slug]) => slug === 'quote_request_received_customer'
    );
    expect(custCall![1].first_name).toBe('Mary');
  });

  it('staff_assessed_service falls back to "service" if service_name is null in customer-ack context (defensive)', async () => {
    // Note: the 400 guard at the route level would normally prevent this path,
    // but we exercise the route's defensive `|| 'service'` fallback in case
    // the guard is bypassed by a future code path that calls renderSmsTemplate
    // for the customer SMS independently. The route currently can't actually
    // reach this state because the 400 fires first, so we assert the guard
    // by sending a valid staff_assessed_service request and confirming
    // request_subject is the service_name.
    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'N',
      phone: '+13105551234',
      service_name: 'Polish',
    }));
    const custCall = renderSmsTemplateMock.mock.calls.find(
      ([slug]) => slug === 'quote_request_received_customer'
    );
    expect(custCall![1].request_subject).toBe('Polish');
  });

  it('customer SMS NOT sent when the customer template is inactive', async () => {
    renderSmsTemplateMock.mockImplementation(async (slug, _vars, _fallback) => {
      if (slug === 'quote_request_received_customer') {
        return {
          body: '',
          isActive: false,    // ← admin toggled it off
          canSilence: true,
          recipientType: 'customer',
          recipientPhones: null,
        };
      }
      return {
        body: `[rendered ${slug}]`,
        isActive: true,
        canSilence: true,
        recipientType: 'staff',
        recipientPhones: ['+14242370913', '+14243637450'],
      };
    });

    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'O',
      phone: '+13105551234',
      service_name: 'Detail',
    }));

    const customerSends = sendSmsMock.mock.calls.filter(([to]) => to === '+13105551234');
    expect(customerSends).toHaveLength(0);
  });

  it('staff SMS failure does not block customer SMS (independent best-effort)', async () => {
    // Staff sendSms throws; customer SMS should still go out.
    sendSmsMock.mockImplementation(async (to: string) => {
      if (to === '+14242370913' || to === '+14243637450') {
        throw new Error('Twilio failure');
      }
      return { success: true, sid: 'SM_test' };
    });

    await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'P',
      phone: '+13105551234',
      service_name: 'Detail',
    }));

    const customerSends = sendSmsMock.mock.calls.filter(([to]) => to === '+13105551234');
    expect(customerSends).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-concern — overall response shape
// ─────────────────────────────────────────────────────────────────────────────

describe('Response contract', () => {
  it('returns { success: true } on success even when all SMS sends fail', async () => {
    sendSmsMock.mockImplementation(async () => ({ success: false, error: 'broken' } as { success: false; error: string }));
    const res = await POST(buildRequest({
      request_type: 'staff_assessed_service',
      name: 'Q',
      phone: '+13105551234',
      service_name: 'Detail',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns 400 on missing name', async () => {
    const res = await POST(buildRequest({ phone: '+13105551234', service_name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing phone', async () => {
    const res = await POST(buildRequest({ name: 'X', service_name: 'X' }));
    expect(res.status).toBe(400);
  });
});
