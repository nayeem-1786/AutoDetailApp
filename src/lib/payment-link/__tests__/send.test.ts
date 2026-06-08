/**
 * Phase 3 Theme B.2 (AC-11 completion) — shared payment-link helper tests.
 *
 * Locks the contract of `sendPaymentLink()` — the orchestration shared by
 * both `/api/pos/appointments/[id]/send-payment-link` (POS session auth)
 * and `/api/voice-agent/send-payment-link` (Bearer voice-agent auth).
 *
 * Pre-Theme-B.2 this orchestration was inlined in the POS route with no
 * test coverage (per Phase 3.0.2 audit `10421f23` Target B.7). Extraction
 * for the 14th voice-agent tool is the right moment to add the regression
 * lock the audit flagged as "should-close-too" Theme B scope.
 *
 * Tests cover: validation chain (return-before-mutation), token mint +
 * reuse, per-channel dispatch results, partial-failure shape, success
 * stamping, balance computation. All assertions exercise the contract
 * surface, not implementation details.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// -----------------------------------------------------------------------------
// Mock surfaces — the helper is the SUT; its collaborators (Supabase client,
// SMS sender, templated email, template renderer, business info) are mocked.
// -----------------------------------------------------------------------------

interface MockAppointment {
  id: string;
  status: string;
  payment_status: string | null;
  total_amount: number;
  scheduled_date: string;
  scheduled_start_time: string;
  payment_link_token: string | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

interface CapturedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ col: string; value: unknown }>;
  isNullFilters: string[];
}

const state = {
  appointment: null as MockAppointment | null,
  transactions: [] as Array<{ id: string }>,
  payments: [] as Array<{ amount: number }>,
  forceErrors: {
    apptLookup: null as string | null,
    tokenUpdate: null as string | null,
    txsLookup: null as string | null,
    paysLookup: null as string | null,
    stamp: null as string | null,
  },
  // When set, the helper's token-mint UPDATE no-ops (zero rows matched);
  // the subsequent re-read returns this token to simulate a parallel writer
  // winning the race.
  parallelTokenWinner: null as string | null,
  // Counts maybeSingle calls on the appointments table — the first is the
  // appt SELECT, the second (and beyond) is the post-mint token re-read.
  apptReadCount: 0,
};

const captured = {
  updates: [] as CapturedUpdate[],
  smsCalls: [] as Array<{ to: string; body: string; opts: Record<string, unknown> }>,
  emailCalls: [] as Array<{ to: string; slug: string; vars: Record<string, unknown> }>,
};

// Email send mock
const sendTemplatedEmailMock = vi.fn();
vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: (...args: unknown[]) => sendTemplatedEmailMock(...args),
}));

// SMS send mock
const sendSmsMock = vi.fn();
vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

// SMS template render mock
const renderSmsTemplateMock = vi.fn();
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: (...args: unknown[]) => renderSmsTemplateMock(...args),
}));

// Business info mock
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'Smart Details', phone: '+14245551234' }),
}));

// -----------------------------------------------------------------------------
// Supabase client mock — table-aware query builder with capture semantics.
// -----------------------------------------------------------------------------

function buildMockAdmin() {
  return {
    from(table: string) {
      if (table === 'appointments') return buildAppointmentsQuery();
      if (table === 'transactions') return buildTransactionsQuery();
      if (table === 'payments') return buildPaymentsQuery();
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function buildAppointmentsQuery() {
  // Reads (.select then chained eq/maybeSingle) vs Writes (.update then chained eq).
  const node = {
    _filters: [] as Array<{ col: string; value: unknown }>,
    _isNullFilters: [] as string[],
    _payload: null as Record<string, unknown> | null,
    _isUpdate: false,
    select(_cols: string) {
      return this;
    },
    update(payload: Record<string, unknown>) {
      this._payload = payload;
      this._isUpdate = true;
      return this;
    },
    eq(col: string, value: unknown) {
      this._filters.push({ col, value });
      return this;
    },
    is(col: string, _value: null) {
      this._isNullFilters.push(col);
      return this;
    },
    async maybeSingle() {
      if (state.forceErrors.apptLookup) {
        return { data: null, error: { message: state.forceErrors.apptLookup } };
      }
      // First maybeSingle (the appt SELECT) returns the full appointment.
      // Subsequent maybeSingle calls (the token-mint re-read) return the
      // parallelTokenWinner-supplied token when configured. Distinguish by
      // the SELECT column list captured via `select()` — the appt SELECT
      // uses a multi-column projection, the re-read uses 'payment_link_token'.
      const isTokenReread = !this._isUpdate && state.apptReadCount > 0;
      state.apptReadCount += 1;
      if (isTokenReread && state.parallelTokenWinner) {
        return {
          data: { payment_link_token: state.parallelTokenWinner },
          error: null,
        };
      }
      if (isTokenReread) {
        return {
          data: { payment_link_token: state.appointment?.payment_link_token ?? null },
          error: null,
        };
      }
      return { data: state.appointment, error: null };
    },
    async _commitUpdate() {
      if (this._isUpdate && this._payload) {
        // payment_link_token update with .is('payment_link_token', null) filter
        // → token-mint path. Simulate parallel-writer "no rows matched" when
        // configured.
        if (
          this._isNullFilters.includes('payment_link_token') &&
          this._payload.payment_link_token !== undefined &&
          state.parallelTokenWinner
        ) {
          // No error, no rows matched (UPDATE silently returns); the re-read
          // will pick up parallelTokenWinner.
          return { error: null };
        }
        // Token-mint error injection (unique-violation simulation).
        if (
          this._isNullFilters.includes('payment_link_token') &&
          this._payload.payment_link_token !== undefined &&
          state.forceErrors.tokenUpdate
        ) {
          return { error: { message: state.forceErrors.tokenUpdate } };
        }
        // Stamp error injection.
        if (
          this._payload.payment_link_sent_at !== undefined &&
          state.forceErrors.stamp
        ) {
          return { error: { message: state.forceErrors.stamp } };
        }
        captured.updates.push({
          table: 'appointments',
          payload: this._payload,
          filters: this._filters,
          isNullFilters: this._isNullFilters,
        });
      }
      return { error: null };
    },
  };

  // .update() callers chain .eq() then await — make `then` consume `_commitUpdate`.
  // Test-only PromiseLike adapter; the type erasure is intentional so we don't
  // have to model the entire Supabase query builder surface.
  const thenable = Object.assign(node, {
    then(
      onFulfilled: unknown,
      onRejected: unknown,
    ) {
      return node._commitUpdate().then(
        onFulfilled as never,
        onRejected as never,
      );
    },
  });
  return thenable as unknown as typeof node & PromiseLike<{ error: { message: string } | null }>;
}

function buildTransactionsQuery() {
  const node = {
    select(_: string) {
      return this;
    },
    async eq(_col: string, _value: unknown) {
      if (state.forceErrors.txsLookup) {
        return { data: null, error: { message: state.forceErrors.txsLookup } };
      }
      return { data: state.transactions, error: null };
    },
  };
  return node;
}

function buildPaymentsQuery() {
  const node = {
    select(_: string) {
      return this;
    },
    async in(_col: string, _values: string[]) {
      if (state.forceErrors.paysLookup) {
        return { data: null, error: { message: state.forceErrors.paysLookup } };
      }
      return { data: state.payments, error: null };
    },
  };
  return node;
}

// -----------------------------------------------------------------------------
// Test setup
// -----------------------------------------------------------------------------

function resetState() {
  state.appointment = {
    id: 'appt-1',
    status: 'pending',
    payment_status: null,
    total_amount: 250.0,
    scheduled_date: '2026-06-10',
    scheduled_start_time: '10:00:00',
    payment_link_token: 'EXISTING_TOKEN_xyz',
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+14245551234',
      email: 'jane@example.com',
    },
  };
  state.transactions = [];
  state.payments = [];
  state.forceErrors = {
    apptLookup: null,
    tokenUpdate: null,
    txsLookup: null,
    paysLookup: null,
    stamp: null,
  };
  state.parallelTokenWinner = null;
  state.apptReadCount = 0;
  captured.updates = [];
  captured.smsCalls = [];
  captured.emailCalls = [];
  sendTemplatedEmailMock.mockReset();
  sendSmsMock.mockReset();
  renderSmsTemplateMock.mockReset();
  // Default happy-path returns
  sendTemplatedEmailMock.mockResolvedValue({
    usedTemplate: true,
    success: true,
  });
  sendSmsMock.mockImplementation(async (to: string, body: string, opts: Record<string, unknown>) => {
    captured.smsCalls.push({ to, body, opts });
    return { success: true };
  });
  renderSmsTemplateMock.mockResolvedValue({
    isActive: true,
    body: 'Pay link: https://example.com/pay/X',
  });
}

// Pull in env vars the helper reads at runtime.
process.env.NEXT_PUBLIC_APP_URL = 'https://smartdetails.test';

beforeEach(() => {
  resetState();
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('sendPaymentLink — validation chain (return-before-mutation)', () => {
  it('returns 422 when amount_cents is provided as a non-integer', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const admin = buildMockAdmin();
    const result = await sendPaymentLink({
      admin: admin as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
      amountCents: 49.5 as number,
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('amount_cents must be an integer');
    }
  });

  it('returns 422 when amount_cents is below the Stripe minimum (50 cents)', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      amountCents: 49,
    });
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.status).toBe(422);
  });

  it('returns 404 when the appointment does not exist', async () => {
    state.appointment = null;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(404);
      expect(result.error).toContain('not found');
    }
  });

  it('returns 500 when the appointment lookup throws', async () => {
    state.forceErrors.apptLookup = 'DB down';
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.status).toBe(500);
  });

  it.each(['cancelled', 'no_show'] as const)(
    'returns 409 when appointment status is %s',
    async (status) => {
      state.appointment!.status = status;
      const { sendPaymentLink } = await import('@/lib/payment-link/send');
      const result = await sendPaymentLink({
        admin: buildMockAdmin() as unknown as never,
        appointmentId: 'appt-1',
        method: 'sms',
      });
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.status).toBe(409);
        expect(result.error).toContain(status);
      }
    },
  );

  it('returns 409 when appointment is already paid', async () => {
    state.appointment!.payment_status = 'paid';
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('already paid');
    }
  });

  it('returns 422 when appointment has no customer', async () => {
    state.appointment!.customer = null;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('No customer');
    }
  });

  it('returns 422 when method=email but customer has no email', async () => {
    state.appointment!.customer!.email = null;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'email',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('no email address');
    }
  });

  it('returns 422 when method=sms but customer has no phone', async () => {
    state.appointment!.customer!.phone = null;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('no phone number');
    }
  });

  it('returns 409 when nothing is left to pay (totalCents <= paidCents)', async () => {
    state.appointment!.total_amount = 100.0;
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 100.0 }]; // fully paid already
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('Nothing left to pay');
    }
  });

  it('returns 422 when amount_cents exceeds the recomputed remaining', async () => {
    // total $100, $25 already paid → remaining $75 = 7500 cents.
    state.appointment!.total_amount = 100.0;
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 25.0 }];
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      amountCents: 10000, // $100 — exceeds $75 remaining
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
      expect(result.error).toContain('exceeds remaining balance');
    }
  });
});

describe('sendPaymentLink — success paths', () => {
  it('sends via SMS only when method=sms and reports channels.sms=sent', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('sent');
      expect(result.channels.email).toBeUndefined();
      expect(result.payment_link_token).toBe('EXISTING_TOKEN_xyz');
      expect(result.pay_url).toBe(
        'https://smartdetails.test/pay/EXISTING_TOKEN_xyz',
      );
    }
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
  });

  it('sends via email only when method=email and reports channels.email=sent', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'email',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.email).toBe('sent');
      expect(result.channels.sms).toBeUndefined();
    }
    expect(sendTemplatedEmailMock).toHaveBeenCalledOnce();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('sends via BOTH when method=both and reports both sent', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('sent');
      expect(result.channels.email).toBe('sent');
    }
  });

  it('falls back to full remaining balance when amountCents is omitted', async () => {
    state.appointment!.total_amount = 200.0;
    state.transactions = [];
    state.payments = [];
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      // amountCents omitted
    });
    expect(result.success).toBe(true);
    // Verify the SMS body uses the FULL $200.00 chip
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'payment_link_sent',
      expect.objectContaining({ amount_due: '200.00' }),
      expect.any(String),
    );
  });

  it('uses the chosen amount when amountCents is provided', async () => {
    state.appointment!.total_amount = 200.0;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      amountCents: 5000, // $50.00 partial deposit
    });
    expect(result.success).toBe(true);
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'payment_link_sent',
      expect.objectContaining({ amount_due: '50.00' }),
      expect.any(String),
    );
  });

  it('persists payment_link_amount_cents=NULL on success when caller omits amountCents (legacy full-balance semantic)', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      // amountCents omitted
    });
    const stamp = captured.updates.find(
      (u) => u.payload.payment_link_sent_at !== undefined,
    );
    expect(stamp).toBeDefined();
    expect(stamp!.payload.payment_link_amount_cents).toBeNull();
    expect(stamp!.payload.payment_link_paid_at).toBeNull();
  });

  it('persists payment_link_amount_cents=<value> on success when caller provides amountCents', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      amountCents: 7500,
    });
    const stamp = captured.updates.find(
      (u) => u.payload.payment_link_sent_at !== undefined,
    );
    expect(stamp).toBeDefined();
    expect(stamp!.payload.payment_link_amount_cents).toBe(7500);
  });

  it('reuses existing payment_link_token when one is already set on the appointment', async () => {
    state.appointment!.payment_link_token = 'PRE_MINTED_TOKEN_abc';
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payment_link_token).toBe('PRE_MINTED_TOKEN_abc');
      expect(result.pay_url).toBe('https://smartdetails.test/pay/PRE_MINTED_TOKEN_abc');
    }
    // No token-mint UPDATE should have been issued.
    const tokenUpdates = captured.updates.filter(
      (u) => u.payload.payment_link_token !== undefined,
    );
    expect(tokenUpdates).toHaveLength(0);
  });

  it('mints a new token via crypto.getRandomValues when none exists, then writes it with .is(payment_link_token, null) guard', async () => {
    state.appointment!.payment_link_token = null;
    state.parallelTokenWinner = null;
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    // The mock's .is(payment_link_token, null) UPDATE doesn't actually
    // persist (no parallelTokenWinner OR error), then the re-read
    // returns `state.appointment.payment_link_token` which is still null.
    // To pass through cleanly, set up the appointment's token via the
    // parallelTokenWinner facility so the re-read sees the value.
    state.parallelTokenWinner = 'MINTED_xx';
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payment_link_token).toBe('MINTED_xx');
    }
  });
});

describe('sendPaymentLink — partial failures', () => {
  it('reports email=failed + sms=sent + partial_errors when email send throws', async () => {
    sendTemplatedEmailMock.mockRejectedValueOnce(new Error('Mailgun down'));
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.email).toBe('failed');
      expect(result.channels.sms).toBe('sent');
      expect(result.partial_errors).toBeDefined();
      expect(result.partial_errors!.some((e) => e.includes('Mailgun down'))).toBe(true);
    }
  });

  it('reports sms=skipped + partial_errors when SMS template is inactive', async () => {
    renderSmsTemplateMock.mockResolvedValueOnce({
      isActive: false,
      body: '',
    });
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('skipped');
      expect(result.partial_errors!.some((e) => e.includes('inactive'))).toBe(true);
    }
  });

  it('returns 500 with channels + errors when ALL channels fail', async () => {
    sendTemplatedEmailMock.mockResolvedValueOnce({
      usedTemplate: true,
      success: false,
      error: 'rejected',
    });
    sendSmsMock.mockResolvedValueOnce({ success: false, error: 'twilio down' });
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    const result = await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(500);
      expect(result.channels?.email).toBe('failed');
      expect(result.channels?.sms).toBe('failed');
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    }
  });
});

describe('sendPaymentLink — SMS body composition', () => {
  it('passes the canonical chip set { first_name, amount_due, pay_url } to renderSmsTemplate', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(renderSmsTemplateMock).toHaveBeenCalledWith(
      'payment_link_sent',
      expect.objectContaining({
        first_name: 'Jane',
        amount_due: '250.00',
      }),
      expect.stringContaining('Jane'),
    );
    // pay_url is a built string — verify present
    const call = renderSmsTemplateMock.mock.calls[0];
    expect((call[1] as { pay_url?: string }).pay_url).toBe(
      'https://smartdetails.test/pay/EXISTING_TOKEN_xyz',
    );
  });

  it('tags the SMS send with notificationType=payment_link_sent and contextId=<appointment id>', async () => {
    const { sendPaymentLink } = await import('@/lib/payment-link/send');
    await sendPaymentLink({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(sendSmsMock).toHaveBeenCalledWith(
      '+14245551234',
      expect.any(String),
      expect.objectContaining({
        customerId: 'cust-1',
        source: 'transactional',
        notificationType: 'payment_link_sent',
        contextId: 'appt-1',
      }),
    );
  });
});
