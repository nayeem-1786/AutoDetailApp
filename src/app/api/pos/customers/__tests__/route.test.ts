import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface InsertCall {
  table: string;
  payload: Record<string, unknown>;
}

const state = {
  posEmployee: {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Detailer',
    email: 'pat@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  existingActiveByPhone: null as null | { id: string; first_name: string; last_name: string },
  archivedByPhone: null as null | { id: string; first_name: string; last_name: string; phone: string; email: string | null; deleted_at: string },
  insertedRows: [] as InsertCall[],
  insertCustomerError: null as null | { message: string },
  insertConsentLogError: null as null | { message: string },
  generatedCustomerId: 'cust-uuid-1',
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/utils/format', () => ({
  normalizePhone: (p: string) => {
    const digits = String(p).replace(/\D/g, '');
    if (digits.length < 10) return null;
    return `+1${digits.slice(-10)}`;
  },
}));

vi.mock('@/lib/qbo/settings', () => ({
  isQboSyncEnabled: async () => false,
  getQboSettings: async () => ({}),
  getQboSetting: async () => null,
}));

vi.mock('@/lib/qbo/sync-customer', () => ({
  syncCustomerToQbo: async () => undefined,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(),
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          is: (_isCol: string, _isVal: unknown) => ({
            maybeSingle: async () => {
              if (table === 'customers' && _col === 'phone' && _isCol === 'deleted_at' && _isVal === null) {
                return { data: state.existingActiveByPhone, error: null };
              }
              return { data: null, error: null };
            },
          }),
          not: (_notCol: string, _op: string, _notVal: unknown) => ({
            maybeSingle: async () => {
              if (table === 'customers' && _col === 'phone') {
                return { data: state.archivedByPhone, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        if (table === 'customers') {
          state.insertedRows.push({ table, payload });
          return {
            select: (_cols: string) => ({
              single: async () => {
                if (state.insertCustomerError) return { data: null, error: state.insertCustomerError };
                return {
                  data: {
                    id: state.generatedCustomerId,
                    ...payload,
                  },
                  error: null,
                };
              },
            }),
          };
        }
        if (table === 'sms_consent_log' || table === 'marketing_consent_log') {
          state.insertedRows.push({ table, payload });
          return Promise.resolve({ error: state.insertConsentLogError });
        }
        return { error: null };
      },
    }),
  }),
}));

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/pos/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Detailer',
    email: 'pat@example.com',
  };
  state.existingActiveByPhone = null;
  state.archivedByPhone = null;
  state.insertedRows = [];
  state.insertCustomerError = null;
  state.insertConsentLogError = null;
  state.generatedCustomerId = 'cust-uuid-1';
});

describe('POST /api/pos/customers — Session 6b TCPA consent capture', () => {
  it('rejects 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await POST(makeReq({ first_name: 'A', last_name: 'B', phone: '4244010094', sms_consent: true }));
    expect(res.status).toBe(401);
  });

  it('rejects 400 when sms_consent is missing', async () => {
    const res = await POST(makeReq({ first_name: 'A', last_name: 'B', phone: '4244010094' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('sms_consent');
  });

  it('rejects 400 when sms_consent is null', async () => {
    const res = await POST(makeReq({ first_name: 'A', last_name: 'B', phone: '4244010094', sms_consent: null }));
    expect(res.status).toBe(400);
  });

  it('rejects 400 when sms_consent is a string instead of boolean', async () => {
    const res = await POST(makeReq({ first_name: 'A', last_name: 'B', phone: '4244010094', sms_consent: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('rejects 400 when email is provided but email_consent is missing', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      email: 'a@b.com', sms_consent: true,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('email_consent');
  });

  it('accepts no email + no email_consent — writes 1 sms_consent_log row + 1 marketing_consent_log row', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      sms_consent: true,
    }));
    expect(res.status).toBe(201);

    const customerInsert = state.insertedRows.find((r) => r.table === 'customers');
    expect(customerInsert?.payload.sms_consent).toBe(true);
    expect(customerInsert?.payload.email_consent).toBeUndefined();

    const smsLog = state.insertedRows.find((r) => r.table === 'sms_consent_log');
    expect(smsLog).toBeDefined();
    expect(smsLog?.payload.action).toBe('opt_in');
    expect(smsLog?.payload.keyword).toBe('VERBAL');
    expect(smsLog?.payload.source).toBe('pos_walkin');
    expect(smsLog?.payload.new_value).toBe(true);
    expect(smsLog?.payload.previous_value).toBeNull();
    expect((smsLog?.payload.notes as string) ?? '').toContain('staff_id=emp-uuid-1');
    expect((smsLog?.payload.notes as string) ?? '').toContain('customer_id=cust-uuid-1');

    const marketingLogs = state.insertedRows.filter((r) => r.table === 'marketing_consent_log');
    expect(marketingLogs).toHaveLength(1);
    expect(marketingLogs[0].payload.channel).toBe('sms');
    expect(marketingLogs[0].payload.action).toBe('opt_in');
    expect(marketingLogs[0].payload.source).toBe('pos');
    expect(marketingLogs[0].payload.recorded_by).toBe('emp-uuid-1');
  });

  it('writes opt_out (action + new_value=false) when sms_consent=false', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      sms_consent: false,
    }));
    expect(res.status).toBe(201);

    const customerInsert = state.insertedRows.find((r) => r.table === 'customers');
    expect(customerInsert?.payload.sms_consent).toBe(false);

    const smsLog = state.insertedRows.find((r) => r.table === 'sms_consent_log');
    expect(smsLog?.payload.action).toBe('opt_out');
    expect(smsLog?.payload.new_value).toBe(false);

    const marketingLog = state.insertedRows.find((r) => r.table === 'marketing_consent_log');
    expect(marketingLog?.payload.action).toBe('opt_out');
  });

  it('writes 2 sms-side logs + 1 email marketing log when email is provided and email_consent is true', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      email: 'a@b.com',
      sms_consent: true,
      email_consent: true,
    }));
    expect(res.status).toBe(201);

    const customerInsert = state.insertedRows.find((r) => r.table === 'customers');
    expect(customerInsert?.payload.email_consent).toBe(true);
    expect(customerInsert?.payload.email).toBe('a@b.com');

    const smsLogs = state.insertedRows.filter((r) => r.table === 'sms_consent_log');
    expect(smsLogs).toHaveLength(1);

    const marketingLogs = state.insertedRows.filter((r) => r.table === 'marketing_consent_log');
    expect(marketingLogs).toHaveLength(2);
    const channels = marketingLogs.map((l) => l.payload.channel).sort();
    expect(channels).toEqual(['email', 'sms']);

    const emailLog = marketingLogs.find((l) => l.payload.channel === 'email');
    expect(emailLog?.payload.action).toBe('opt_in');
    expect(emailLog?.payload.source).toBe('pos');
    expect(emailLog?.payload.recorded_by).toBe('emp-uuid-1');
  });

  it('writes opt_out for email when email is provided and email_consent=false', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      email: 'a@b.com',
      sms_consent: true,
      email_consent: false,
    }));
    expect(res.status).toBe(201);

    const emailLog = state.insertedRows
      .filter((r) => r.table === 'marketing_consent_log')
      .find((l) => l.payload.channel === 'email');
    expect(emailLog?.payload.action).toBe('opt_out');
  });

  it('does not write any email log when email is omitted (even if email_consent is in body)', async () => {
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      sms_consent: true,
      email_consent: true, // ignored when no email
    }));
    expect(res.status).toBe(201);

    const customerInsert = state.insertedRows.find((r) => r.table === 'customers');
    expect(customerInsert?.payload.email_consent).toBeUndefined();

    const marketingLogs = state.insertedRows.filter((r) => r.table === 'marketing_consent_log');
    expect(marketingLogs).toHaveLength(1);
    expect(marketingLogs[0].payload.channel).toBe('sms');
  });

  it('returns 409 if active customer with same phone exists (consent not required to short-circuit)', async () => {
    state.existingActiveByPhone = { id: 'existing-1', first_name: 'X', last_name: 'Y' };
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      sms_consent: true,
    }));
    expect(res.status).toBe(409);
    expect(state.insertedRows.find((r) => r.table === 'customers')).toBeUndefined();
  });

  it('returns customer 201 even if a consent-log insert fails (logs are non-blocking)', async () => {
    state.insertConsentLogError = { message: 'simulated log failure' };
    const res = await POST(makeReq({
      first_name: 'A', last_name: 'B', phone: '4244010094',
      sms_consent: true,
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe('cust-uuid-1');
  });
});
