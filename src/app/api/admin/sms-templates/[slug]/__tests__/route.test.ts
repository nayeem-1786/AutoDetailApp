import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  employee: { id: 'emp-1', auth_user_id: 'auth-1' } as { id: string; auth_user_id: string } | null,
  permissionDenied: null as Response | null,
  template: null as Record<string, unknown> | null,
  updateError: null as { message: string } | null,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () => state.permissionDenied,
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  invalidateSmsTemplateCache: () => {},
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () => ({ data: state.template, error: state.template ? null : { message: 'not found' } }),
        }),
      }),
      update: (_payload: Record<string, unknown>) => ({
        eq: (_col: string, _val: string) => ({
          select: (_cols: string) => ({
            single: async () => ({
              data: state.updateError ? null : { ...state.template, ..._payload },
              error: state.updateError,
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { PUT } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/sms-templates/booking_confirmed', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ slug: 'booking_confirmed' }) };

beforeEach(() => {
  state.employee = { id: 'emp-1', auth_user_id: 'auth-1' };
  state.permissionDenied = null;
  state.updateError = null;
  state.template = {
    id: 'tpl-1',
    slug: 'booking_confirmed',
    name: 'Online Booking Confirmed',
    category: 'booking',
    body_template: 'Hi {first_name}, your booking is confirmed.',
    default_body: 'Hi {first_name}, your booking is confirmed.',
    variables: ['first_name', 'business_name'],  // production flat string[] shape
    is_active: true,
    can_silence: false,
    recipient_type: 'customer',
    recipient_phones: null,
  };
});

describe('PUT /api/admin/sms-templates/[slug] — placeholder validation (C4)', () => {
  it('rejects unknown placeholder with 400 and lists valid variables', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {first_name}, ref {unknown_var}, {business_name}' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Unknown placeholder');
    expect(json.unknown).toEqual(['{unknown_var}']);
    expect(json.error).toContain('{first_name}');
    expect(json.error).toContain('{business_name}');
  });

  it('rejects malformed placeholder — uppercase letters', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {First_Name}!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Malformed placeholder');
    expect(json.malformed).toContain('{First_Name}');
  });

  it('rejects malformed placeholder — leading digit', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {1stName}!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Malformed placeholder');
  });

  it('rejects malformed placeholder — dot separator', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {first.name}!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.malformed).toContain('{first.name}');
  });

  it('rejects malformed placeholder — hyphen separator', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {first-name}!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.malformed).toContain('{first-name}');
  });

  it('rejects malformed placeholder — internal whitespace', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi { first_name }!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Malformed placeholder');
  });

  it('rejects empty placeholder {}', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Empty {} placeholder' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.malformed).toContain('{}');
  });

  it('rejects doubled-brace pattern {{key}}', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {{first_name}}!' }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Doubled braces');
    expect(json.error).toContain('{first_name}');  // suggested correction
  });

  it('accepts a valid body containing all required variables', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {first_name}, welcome to {business_name}!' }),
      ctx
    );
    expect(res.status).toBe(200);
  });

  it('rejects when a registered variable is missing from the body (every var treated as required)', async () => {
    const res = await PUT(
      makeReq({ body_template: 'Hi {first_name}!' }),  // missing {business_name}
      ctx
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing required variables');
    expect(json.missing).toEqual(['business_name']);
  });

  it('handles legacy object-shape variables in template registry', async () => {
    state.template!.variables = [
      { key: 'first_name', description: '', required: true },
      { key: 'business_name', description: '', required: true },
    ];

    const okRes = await PUT(
      makeReq({ body_template: 'Hi {first_name} from {business_name}!' }),
      ctx
    );
    expect(okRes.status).toBe(200);

    const unknownRes = await PUT(
      makeReq({ body_template: 'Hi {first_name} {business_name} {unknown}!' }),
      ctx
    );
    expect(unknownRes.status).toBe(400);
    const j = await unknownRes.json();
    expect(j.unknown).toEqual(['{unknown}']);
  });
});

describe('PUT /api/admin/sms-templates/[slug] — non-body fields untouched', () => {
  it('lets is_active toggle through (only validates can_silence)', async () => {
    state.template!.can_silence = true;
    const res = await PUT(makeReq({ is_active: false }), ctx);
    expect(res.status).toBe(200);
  });

  it('blocks is_active=false on non-silenceable template without confirm', async () => {
    state.template!.can_silence = false;
    const res = await PUT(makeReq({ is_active: false }), ctx);
    expect(res.status).toBe(400);
  });
});
