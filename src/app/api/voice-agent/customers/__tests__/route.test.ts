/**
 * POST /api/voice-agent/customers — upsert_customer endpoint tests.
 *
 * Workstream J Session 3. The endpoint backs the SMS-AI v2 tool that
 * persists the customer record as soon as the agent learns the customer's
 * first name. Tests pin: auth gating, required-field validation with
 * `instructions_for_agent` payloads, Policy B update semantics
 * (preserve human-curated values, only fill nulls), CREATE defaults,
 * customer_type overwrite-each-call, sms_consent re-opt-in path, and
 * retroactive conversation linkage.
 *
 * Pattern follows the existing send-quote-sms route test: chainable
 * Supabase admin stub driven by per-table state, real (pure)
 * `normalizePhone`. The stub is more fine-grained than send-quote-sms's
 * because the upsert path branches on existing-vs-new and we need to
 * assert different mutations per case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---- auth ---------------------------------------------------------------

const authState = { valid: true as boolean };
vi.mock('@/lib/auth/api-key', () => ({
  validateApiKey: async () => ({
    valid: authState.valid,
    error: authState.valid ? undefined : 'Invalid API key',
  }),
}));

// ---- sms-consent helper -------------------------------------------------

const updateSmsConsentMock = vi.fn(
  async (_params: unknown) => ({ changed: true }),
);
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: (params: unknown) => updateSmsConsentMock(params),
}));

// ---- supabase admin stub ------------------------------------------------
//
// Per-test inputs:
//   customerState.existing — the row returned by .maybeSingle() for the
//     customers SELECT (null = no existing customer).
//   customerState.insertResult / insertError — what .single() returns when
//     INSERTing into customers.
//   conversationState.updatedRows — what the conversations UPDATE returns
//     via .select('id') chain (drives whether conversation_linked is true).
//
// Captured for assertions:
//   customerState.insertPayload — last payload passed to .insert()
//   customerState.updatePayload — last payload passed to .update()
//   conversationState.linkAttempt — was the conversations UPDATE called?

interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string;
  sms_consent: boolean;
  customer_type: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  zip: string | null;
}

const customerState: {
  existing: CustomerRow | null;
  insertResult: { id: string } | null;
  insertError: { message: string } | null;
  updateError: { message: string } | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
} = {
  existing: null,
  insertResult: { id: 'customer-new-id' },
  insertError: null,
  updateError: null,
  insertPayload: null,
  updatePayload: null,
};

const conversationState: {
  updatedRows: Array<{ id: string }>;
  linkAttempt: { conversationId: string | null; payload: Record<string, unknown> | null };
  updateError: { message: string } | null;
} = {
  updatedRows: [{ id: 'conv-1' }],
  linkAttempt: { conversationId: null, payload: null },
  updateError: null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const builder = {
      _table: '',
      _action: '' as 'select' | 'insert' | 'update' | '',
      _filters: {} as Record<string, unknown>,

      from(table: string) {
        const b = Object.create(builder);
        b._table = table;
        b._action = '';
        b._filters = {};
        return b;
      },
      select(_cols?: string) {
        this._action = this._action || 'select';
        return this;
      },
      insert(payload: unknown) {
        this._action = 'insert';
        if (this._table === 'customers') {
          customerState.insertPayload = payload as Record<string, unknown>;
        }
        return this;
      },
      update(payload: unknown) {
        this._action = 'update';
        if (this._table === 'customers') {
          customerState.updatePayload = payload as Record<string, unknown>;
        } else if (this._table === 'conversations') {
          conversationState.linkAttempt.payload = payload as Record<string, unknown>;
        }
        return this;
      },
      eq(col: string, val: unknown) {
        this._filters[col] = val;
        if (this._table === 'conversations' && col === 'id' && this._action === 'update') {
          conversationState.linkAttempt.conversationId = String(val);
        }
        return this;
      },
      is(_col: string, _val: unknown) {
        return this;
      },
      limit(_n: number) {
        return this;
      },
      async maybeSingle() {
        if (this._table === 'customers' && this._action === 'select') {
          return { data: customerState.existing, error: null };
        }
        return { data: null, error: null };
      },
      async single() {
        if (this._table === 'customers' && this._action === 'insert') {
          if (customerState.insertError) {
            return { data: null, error: customerState.insertError };
          }
          return { data: customerState.insertResult, error: null };
        }
        return { data: null, error: null };
      },
      // Fire-and-forget UPDATE / SELECT-after-UPDATE: builder is thenable.
      then<TResolved = unknown>(
        onFulfilled?: (
          v: { data: unknown; error: { message: string } | null },
        ) => TResolved | PromiseLike<TResolved>,
        onRejected?: (reason: unknown) => TResolved | PromiseLike<TResolved>,
      ) {
        let payload: { data: unknown; error: { message: string } | null };
        if (this._table === 'customers' && this._action === 'update') {
          payload = { data: null, error: customerState.updateError };
        } else if (this._table === 'conversations' && this._action === 'update') {
          payload = {
            data: conversationState.updatedRows,
            error: conversationState.updateError,
          };
        } else {
          payload = { data: null, error: null };
        }
        return Promise.resolve(payload).then(onFulfilled, onRejected);
      },
    };
    return builder;
  },
}));

// Import the route AFTER all mocks are wired.
import { POST } from '@/app/api/voice-agent/customers/route';

function buildRequest(body: unknown, opts?: { auth?: boolean }): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.auth !== false) headers.Authorization = 'Bearer test-key';
  return new NextRequest('http://localhost/api/voice-agent/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const FRESH_CUSTOMER_ROW: CustomerRow = {
  id: 'customer-existing-id',
  first_name: 'Nayeem',
  last_name: 'Khan',
  email: 'nayeem@example.com',
  phone: '+14245551234',
  sms_consent: true,
  customer_type: 'enthusiast',
  address_line_1: '123 Main St',
  address_line_2: null,
  city: 'Torrance',
  zip: '90505',
};

beforeEach(() => {
  authState.valid = true;
  customerState.existing = null;
  customerState.insertResult = { id: 'customer-new-id' };
  customerState.insertError = null;
  customerState.updateError = null;
  customerState.insertPayload = null;
  customerState.updatePayload = null;
  conversationState.updatedRows = [{ id: 'conv-1' }];
  conversationState.linkAttempt = { conversationId: null, payload: null };
  conversationState.updateError = null;
  updateSmsConsentMock.mockClear();
  updateSmsConsentMock.mockResolvedValue({ changed: true });
});

// ---- Auth ---------------------------------------------------------------

describe('POST /api/voice-agent/customers — auth', () => {
  it('401 when Bearer missing/invalid', async () => {
    authState.valid = false;
    const res = await POST(
      buildRequest(
        { first_name: 'Nayeem', phone: '+14245551234' },
        { auth: false },
      ),
    );
    expect(res.status).toBe(401);
  });
});

// ---- Required-field validation -----------------------------------------

describe('POST /api/voice-agent/customers — required-field validation', () => {
  it('400 + instructions_for_agent when first_name missing', async () => {
    const res = await POST(
      buildRequest({ phone: '+14245551234', last_name: 'Khan' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('first_name is required');
    expect(body.missing_fields).toEqual(['first_name']);
    expect(typeof body.instructions_for_agent).toBe('string');
    expect(body.instructions_for_agent).toMatch(/ask the customer for their first name/i);
    expect(body.do_not_share_with_customer).toBe(true);
  });

  it('400 + instructions_for_agent when first_name is a generic placeholder', async () => {
    for (const placeholder of ['Customer', 'Caller', 'Unknown', 'Phone Caller', 'walk-in']) {
      const res = await POST(
        buildRequest({ first_name: placeholder, phone: '+14245551234' }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('placeholder');
      expect(typeof body.instructions_for_agent).toBe('string');
    }
  });

  it('400 + instructions_for_agent when phone missing (dispatcher injection regression)', async () => {
    const res = await POST(buildRequest({ first_name: 'Nayeem' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('phone is required');
    expect(typeof body.instructions_for_agent).toBe('string');
  });

  it('400 + instructions_for_agent when phone is not parseable to E.164', async () => {
    const res = await POST(
      buildRequest({ first_name: 'Nayeem', phone: 'not-a-phone' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid phone number');
    expect(typeof body.instructions_for_agent).toBe('string');
  });
});

// ---- CREATE path --------------------------------------------------------

describe('POST /api/voice-agent/customers — CREATE (new customer)', () => {
  it('inserts new customer with sms_consent=true, customer_type defaults to enthusiast', async () => {
    const res = await POST(
      buildRequest({
        first_name: 'Nayeem',
        phone: '+14245551234',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customer_id).toBe('customer-new-id');
    expect(body.was_created).toBe(true);
    // Defaults enforced
    expect(customerState.insertPayload).toMatchObject({
      first_name: 'Nayeem',
      last_name: '',
      phone: '+14245551234',
      sms_consent: true,
      customer_type: 'enthusiast',
    });
  });

  it('inserts new customer with customer_type=professional when provided', async () => {
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        phone: '+14245551234',
        customer_type: 'professional',
      }),
    );
    expect(customerState.insertPayload?.customer_type).toBe('professional');
  });

  it('persists all optional fields on INSERT when provided', async () => {
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        last_name: 'Khan',
        email: 'nayeem@example.com',
        phone: '+14245551234',
        address_1: '123 Main St',
        address_2: 'Apt 4',
        city: 'Torrance',
        zip_code: '90505',
      }),
    );
    expect(customerState.insertPayload).toMatchObject({
      first_name: 'Nayeem',
      last_name: 'Khan',
      email: 'nayeem@example.com',
      phone: '+14245551234',
      sms_consent: true,
      customer_type: 'enthusiast',
      address_line_1: '123 Main St',
      address_line_2: 'Apt 4',
      city: 'Torrance',
      zip: '90505',
    });
  });

  it('ignores invalid customer_type values (treats as omitted → enthusiast)', async () => {
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        phone: '+14245551234',
        customer_type: 'fleet_overlord',
      }),
    );
    expect(customerState.insertPayload?.customer_type).toBe('enthusiast');
  });

  it('returns 500 + instructions_for_agent when INSERT fails', async () => {
    customerState.insertResult = null;
    customerState.insertError = { message: 'duplicate phone' };
    const res = await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to create customer');
    expect(typeof body.instructions_for_agent).toBe('string');
  });
});

// ---- UPDATE path (Policy B) --------------------------------------------

describe('POST /api/voice-agent/customers — UPDATE (existing customer, Policy B)', () => {
  it('does NOT overwrite human-curated first_name', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW };
    const res = await POST(
      buildRequest({ first_name: 'Bob', phone: '+14245551234' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_created).toBe(false);
    expect(body.customer_id).toBe('customer-existing-id');
    // No UPDATE payload should have been built since nothing was eligible
    expect(customerState.updatePayload).toBeNull();
    expect(body.updated_fields).not.toContain('first_name');
  });

  it('DOES overwrite a generic placeholder first_name', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, first_name: 'Phone Caller' };
    await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    expect(customerState.updatePayload).toMatchObject({ first_name: 'Nayeem' });
  });

  it('adds email when currently null', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, email: null };
    const res = await POST(
      buildRequest({
        first_name: 'Nayeem',
        email: 'new@example.com',
        phone: '+14245551234',
      }),
    );
    expect(res.status).toBe(200);
    expect(customerState.updatePayload).toMatchObject({ email: 'new@example.com' });
    const body = await res.json();
    expect(body.updated_fields).toContain('email');
  });

  it('does NOT overwrite an existing email', async () => {
    customerState.existing = {
      ...FRESH_CUSTOMER_ROW,
      email: 'existing@example.com',
    };
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        email: 'tryingToOverwrite@example.com',
        phone: '+14245551234',
      }),
    );
    expect(customerState.updatePayload).toBeNull();
  });

  it('overwrites customer_type every call (latest classification wins)', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, customer_type: 'enthusiast' };
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        customer_type: 'professional',
        phone: '+14245551234',
      }),
    );
    expect(customerState.updatePayload).toMatchObject({ customer_type: 'professional' });
  });

  it('skips customer_type UPDATE when the value matches the current value', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, customer_type: 'enthusiast' };
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        customer_type: 'enthusiast',
        phone: '+14245551234',
      }),
    );
    expect(customerState.updatePayload).toBeNull();
  });

  it('adds address fields when currently null', async () => {
    customerState.existing = {
      ...FRESH_CUSTOMER_ROW,
      address_line_1: null,
      address_line_2: null,
      city: null,
      zip: null,
    };
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        address_1: '123 Main St',
        city: 'Torrance',
        zip_code: '90505',
        phone: '+14245551234',
      }),
    );
    expect(customerState.updatePayload).toMatchObject({
      address_line_1: '123 Main St',
      city: 'Torrance',
      zip: '90505',
    });
  });

  it('does NOT overwrite existing address fields', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW };
    await POST(
      buildRequest({
        first_name: 'Nayeem',
        address_1: '456 Other Ave',
        city: 'Beverly Hills',
        zip_code: '90210',
        phone: '+14245551234',
      }),
    );
    expect(customerState.updatePayload).toBeNull();
  });

  it('re-opt-in: existing customer with sms_consent=false → updateSmsConsent called with action=opt_in', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, sms_consent: false };
    const res = await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    expect(res.status).toBe(200);
    expect(updateSmsConsentMock).toHaveBeenCalledTimes(1);
    const call = updateSmsConsentMock.mock.calls[0][0];
    expect(call).toMatchObject({
      customerId: 'customer-existing-id',
      phone: '+14245551234',
      action: 'opt_in',
      source: 'inbound_sms',
    });
    const body = await res.json();
    expect(body.updated_fields).toContain('sms_consent');
  });

  it('does NOT call updateSmsConsent when existing sms_consent is already true (never auto-revoke)', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW, sms_consent: true };
    await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });
});

// ---- Conversation linkage ----------------------------------------------

describe('POST /api/voice-agent/customers — retroactive conversation linkage', () => {
  it('updates conversations.customer_id when conversation_id provided and row was null', async () => {
    customerState.existing = null; // CREATE path
    conversationState.updatedRows = [{ id: 'conv-orphan' }];
    const res = await POST(
      buildRequest({
        first_name: 'Nayeem',
        phone: '+14245551234',
        conversation_id: 'conv-orphan',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversation_linked).toBe(true);
    expect(conversationState.linkAttempt.conversationId).toBe('conv-orphan');
    expect(conversationState.linkAttempt.payload).toMatchObject({
      customer_id: 'customer-new-id',
    });
  });

  it('conversation_linked is false when the .is(null) guard rejects (already-linked conversation)', async () => {
    conversationState.updatedRows = []; // .is('customer_id', null) matched zero rows
    const res = await POST(
      buildRequest({
        first_name: 'Nayeem',
        phone: '+14245551234',
        conversation_id: 'conv-already-linked',
      }),
    );
    const body = await res.json();
    expect(body.conversation_linked).toBe(false);
  });

  it('skips the conversation UPDATE entirely when conversation_id is omitted', async () => {
    await POST(buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }));
    expect(conversationState.linkAttempt.conversationId).toBeNull();
    expect(conversationState.linkAttempt.payload).toBeNull();
  });
});

// ---- Response shape -----------------------------------------------------

describe('POST /api/voice-agent/customers — response shape', () => {
  it('CREATE success returns success + customer_id + was_created:true + updated_fields[]', async () => {
    const res = await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      customer_id: 'customer-new-id',
      was_created: true,
      conversation_linked: false,
    });
    expect(Array.isArray(body.updated_fields)).toBe(true);
    expect(body.updated_fields).toContain('first_name');
    expect(body.updated_fields).toContain('phone');
    expect(body.updated_fields).toContain('sms_consent');
    expect(body.updated_fields).toContain('customer_type');
  });

  it('UPDATE no-op returns was_created:false + empty updated_fields', async () => {
    customerState.existing = { ...FRESH_CUSTOMER_ROW };
    const res = await POST(
      buildRequest({ first_name: 'Nayeem', phone: '+14245551234' }),
    );
    const body = await res.json();
    expect(body.was_created).toBe(false);
    expect(body.updated_fields).toEqual([]);
  });
});
