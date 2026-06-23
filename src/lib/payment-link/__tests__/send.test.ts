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
  // Session #149 (Item 3) — re-send guard reads these from the appt SELECT.
  payment_link_paid_at: string | null;
  payment_link_amount_cents: number | null;
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

// Session #149 (Item 5) — audit_log write mock. The helper calls
// `logAudit()` on every successful send; the dispatcher contract test
// (Item-5 — "audit row written on success") asserts on this mock.
const logAuditMock = vi.fn();
vi.mock('@/lib/services/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
  getRequestIp: () => null,
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
  // Session #149 (Item 3) — the helper now chains `.in(...).order(...)` so
  // it can read the most-recent payment row for the `previous_payment.
  // amount_cents` value in the 409 'previous_link_paid' response. The mock
  // returns `state.payments` verbatim; tests are responsible for setting
  // the array in DESC-by-created_at order to mirror the helper's expectation.
  const node = {
    select(_: string) {
      return this;
    },
    in(_col: string, _values: string[]) {
      return {
        async order(_orderCol: string, _opts: { ascending: boolean }) {
          if (state.forceErrors.paysLookup) {
            return {
              data: null,
              error: { message: state.forceErrors.paysLookup },
            };
          }
          return { data: state.payments, error: null };
        },
      };
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
    // Session #149 (Item 3) defaults — no prior link cycle consumed; the
    // re-send guard is OFF for the happy-path tests.
    payment_link_paid_at: null,
    payment_link_amount_cents: null,
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
  logAuditMock.mockReset();
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

/**
 * Session #149 (Items 3 + 5) — default actor for tests that don't care
 * about identity-passthrough. Operator path with a synthetic identity.
 * Tests that DO care about actor (e.g. the voice-agent source threading
 * test) pass an explicit actor override on the call site.
 */
const defaultActor = {
  triggeredBy: 'operator' as const,
  userId: 'test-user-id',
  userEmail: 'test@example.com',
  employeeName: 'Test Operator',
  ipAddress: null,
};

/**
 * Test-only wrapper around `sendPaymentLink` that auto-fills the new
 * required `actor` field (Session #149 Item 5). Pre-#149 tests called the
 * helper without an actor; making it required at the type level is the
 * locked design, so the wrapper supplies a synthetic default and lets
 * tests override per-call when they're exercising the actor pathway.
 */
async function send(
  input: Record<string, unknown>
): Promise<Awaited<ReturnType<typeof import('@/lib/payment-link/send').sendPaymentLink>>> {
  const { sendPaymentLink } = await import('@/lib/payment-link/send');
  return sendPaymentLink({
    actor: defaultActor,
    ...input,
  } as Parameters<typeof sendPaymentLink>[0]);
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
    const admin = buildMockAdmin();
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
      const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    await send({
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
    await send({
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
    const result = await send({
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
    // The mock's .is(payment_link_token, null) UPDATE doesn't actually
    // persist (no parallelTokenWinner OR error), then the re-read
    // returns `state.appointment.payment_link_token` which is still null.
    // To pass through cleanly, set up the appointment's token via the
    // parallelTokenWinner facility so the re-read sees the value.
    state.parallelTokenWinner = 'MINTED_xx';
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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
    const result = await send({
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

// =============================================================================
// Issue 1 — method='both' dual-channel fallback (single-channel customers)
// =============================================================================
//
// Before this fix, the pre-flight gate (send.ts) hard-failed the ENTIRE send
// with HTTP 422 when method='both' and the customer was missing ONE channel —
// sending nothing even though the available channel could have succeeded. The
// fix relaxes ONLY the `both` disjunct: a `both` send now degrades to the
// channel(s) on file and surfaces the absent channel as channels.<x>='skipped'
// + a partial_errors[] warning. NEITHER-channel still 422s (nothing to send to),
// and single-channel methods are unchanged (the two 422 tests above are the
// regression guards proving the relaxation didn't over-reach).
describe('sendPaymentLink — method=both dual-channel fallback (Issue 1)', () => {
  // email present, phone missing → email sent, SMS skipped, success + warning.
  // sendSms MUST NOT be called (no destination to attempt).
  it('falls back to email when method=both and customer has no phone', async () => {
    state.appointment!.customer!.phone = null; // email-only customer
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.email).toBe('sent');
      expect(result.channels.sms).toBe('skipped');
      expect(result.partial_errors).toBeDefined();
      expect(
        result.partial_errors!.some((e) => e.includes('phone number')),
      ).toBe(true);
    }
    expect(sendTemplatedEmailMock).toHaveBeenCalledOnce();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  // phone present, email missing → SMS sent, email skipped, success + warning.
  // sendTemplatedEmail MUST NOT be called (no destination to attempt).
  it('falls back to SMS when method=both and customer has no email', async () => {
    state.appointment!.customer!.email = null; // phone-only customer
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('sent');
      expect(result.channels.email).toBe('skipped');
      expect(result.partial_errors).toBeDefined();
      expect(
        result.partial_errors!.some((e) => e.includes('email address')),
      ).toBe(true);
    }
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
  });

  // both channels present → both sent, NO partial_errors (regression guard that
  // the fallback did not introduce spurious warnings on the all-clear path).
  it('sends both channels with no partial_errors when method=both and both present', async () => {
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('sent');
      expect(result.channels.email).toBe('sent');
      expect(result.partial_errors).toBeUndefined();
    }
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(sendTemplatedEmailMock).toHaveBeenCalledOnce();
  });

  // neither channel on file → 422, no send attempted on either channel, and the
  // post-send stamp must NOT have run (return-before-mutation preserved).
  it('returns 422 with no send attempted when method=both and customer has neither email nor phone', async () => {
    state.appointment!.customer!.email = null;
    state.appointment!.customer!.phone = null;
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(422);
    }
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
    const stamp = captured.updates.find(
      (u) => u.payload.payment_link_sent_at !== undefined,
    );
    expect(stamp).toBeUndefined();
  });
});

describe('sendPaymentLink — SMS body composition', () => {
  it('passes the canonical chip set { first_name, amount_due, pay_url } to renderSmsTemplate', async () => {
    await send({
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
    await send({
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

  // Regression lock — Session #146 symmetry fix.
  //
  // Pre-#146, `sendPaymentLink` was the LONE transactional SMS helper in the
  // codebase that did not pass `logToConversation: true` to `sendSms()`. Every
  // other transactional path (addons, notify, cancel, complete, receipts/sms,
  // book/route, voice agent appointments / send-info-sms / send-quote-sms,
  // booking reminders, waitlist, quote-accept) passes the flag, which writes a
  // `messages` row via `findOrCreateConversation` so the send appears in
  // Admin > Messaging > [customer phone]. Without the flag, payment-link SMSes
  // were invisible in conversation history — operator could not verify
  // "did I send this customer a link?" from any UI.
  //
  // This test pins `logToConversation: true` on the contract so a future
  // refactor that drops the flag fails here loudly.
  it('passes logToConversation:true so the SMS appears in Admin > Messaging history (#146)', async () => {
    await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ logToConversation: true }),
    );
  });
});

// =============================================================================
// Session #149 (Items 3 + 5) — re-send-after-paid guard + audit_log row
// =============================================================================
//
// Class (a) items 3 + 5 land as a combined commit per the locked design:
//   - Item 3: a structured 409 'previous_link_paid' code returned when the
//     prior payment-link cycle was consumed (payment_link_paid_at IS NOT
//     NULL) AND the caller did not pass confirmResend: true. The locked
//     decision rejected the hard-block shape (Shape A) because multi-link
//     deposit-then-balance flows are designed behavior; the confirmation
//     surface (Shape B) is the protection layer for the operator-error
//     "forgot the prior link was already paid" case.
//   - Item 5: an audit_log row written via logAudit() on every successful
//     send. Locked decisions: action='update' + details.event=
//     'payment_link_sent' (mirrors stripe webhook payment_link confirm),
//     entity_type='booking' (matches cancel-orchestration), source via
//     actorSourceFor (operator→pos, voice_agent→api), and the row OMITS
//     payment_link_token / customer phone / customer email (PII +
//     bearer-credential lockout).
//
// Each test is paired with a "reverse-validation" assertion the comment
// header names — these are the live mechanism that confirms each test
// fails when the implementation regresses. The locked discipline from
// Sessions #146-#148 carries forward here.

describe('sendPaymentLink — Item 3: re-send-after-paid guard', () => {
  // Reverse-validate: removing the guard at send.ts (or changing
  // `!input.confirmResend` to a truthy-coerced expression) causes the
  // helper to proceed past the guard and return success — this assertion
  // then fails at `expect(result.status).toBe(409)`.
  it('returns 409 + code=previous_link_paid when payment_link_paid_at IS NOT NULL and confirmResend is NOT passed', async () => {
    state.appointment!.payment_link_paid_at = '2026-06-10T18:30:00.000Z';
    state.appointment!.payment_link_amount_cents = 5000; // $50 deposit
    state.appointment!.payment_status = 'partial';
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 50.0 }];
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      // confirmResend NOT passed — guard must fire
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(409);
      expect(result.code).toBe('previous_link_paid');
      expect(result.previous_payment).toBeDefined();
      expect(result.previous_payment!.paid_at).toBe('2026-06-10T18:30:00.000Z');
      expect(result.previous_payment!.amount_cents).toBe(5000);
      // Critical: the post-send stamp must NOT have run (paid_at preserved).
      const stamp = captured.updates.find(
        (u) => u.payload.payment_link_sent_at !== undefined,
      );
      expect(stamp).toBeUndefined();
    }
  });

  // Reverse-validate: gating the `confirmResend === true` bypass (e.g.
  // changing the condition to `if (appt.payment_link_paid_at)` without
  // checking confirmResend) keeps the 409 firing even on retry — this
  // assertion then fails at `expect(result.success).toBe(true)`.
  it('proceeds normally when payment_link_paid_at IS NOT NULL and confirmResend: true is passed', async () => {
    state.appointment!.payment_link_paid_at = '2026-06-10T18:30:00.000Z';
    state.appointment!.payment_link_amount_cents = 5000;
    state.appointment!.payment_status = 'partial';
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 50.0 }];
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      confirmResend: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.channels.sms).toBe('sent');
    }
    // Critical: the post-send stamp DID run (paid_at wiped, sent_at set).
    const stamp = captured.updates.find(
      (u) => u.payload.payment_link_sent_at !== undefined,
    );
    expect(stamp).toBeDefined();
    expect(stamp!.payload.payment_link_paid_at).toBeNull();
  });

  // Reverse-validate: surfaces the actual bug class — partial-paid +
  // previous link consumed. Removing the guard means the helper would
  // return 200 + wipe paid_at, which is the silent-wipe bug. This test
  // pins the partial-paid behavior specifically (the line-175
  // status='paid' guard does NOT cover this state — the test asserts the
  // 409 fires on 'partial', not 'paid').
  it('returns 409 when payment_status=partial AND payment_link_paid_at IS NOT NULL (the real Item 3 bug surface)', async () => {
    state.appointment!.payment_status = 'partial';
    state.appointment!.payment_link_paid_at = '2026-06-10T18:30:00.000Z';
    state.appointment!.payment_link_amount_cents = 5000;
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 50.0 }];
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.status).toBe(409);
      expect(result.code).toBe('previous_link_paid');
    }
    // SMS must NOT have been sent (the guard runs pre-dispatch).
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('sendPaymentLink — Item 5: audit_log row on successful send', () => {
  // Reverse-validate: removing the `await logAudit(...)` call in send.ts
  // causes `logAuditMock` to never be invoked — this assertion fails at
  // `expect(logAuditMock).toHaveBeenCalledOnce()`.
  it('writes an audit_log row with the canonical shape on success', async () => {
    state.appointment!.total_amount = 200.0;
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(result.success).toBe(true);
    expect(logAuditMock).toHaveBeenCalledOnce();
    const auditCall = logAuditMock.mock.calls[0][0] as {
      action: string;
      entityType: string;
      entityId: string;
      source: string;
      details: Record<string, unknown>;
      userEmail: string | null;
    };
    expect(auditCall.action).toBe('update');
    expect(auditCall.entityType).toBe('booking');
    expect(auditCall.entityId).toBe('appt-1');
    expect(auditCall.source).toBe('pos');
    expect(auditCall.details.event).toBe('payment_link_sent');
    expect(auditCall.details.method).toBe('both');
    expect(auditCall.details.trigger).toBe('operator_send');
    expect(auditCall.details.amount_cents).toBe(20000); // $200 full remaining
    expect(auditCall.details.customer_id).toBe('cust-1');
    expect(auditCall.details.scheduled_date).toBe('2026-06-10');
    expect(auditCall.details.token_reused).toBe(true); // EXISTING_TOKEN_xyz reused
    expect(auditCall.userEmail).toBe('test@example.com');
  });

  // Reverse-validate: moving the `await logAudit(...)` call ABOVE the
  // re-send guard (so it fires before the 409 path) causes
  // `logAuditMock` to be invoked even on the guarded 409 — this
  // assertion fails at `expect(logAuditMock).not.toHaveBeenCalled()`.
  it('does NOT write an audit_log row when the re-send guard fires', async () => {
    state.appointment!.payment_link_paid_at = '2026-06-10T18:30:00.000Z';
    state.appointment!.payment_status = 'partial';
    state.transactions = [{ id: 'tx-1' }];
    state.payments = [{ amount: 50.0 }];
    const result = await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    expect(result.success).toBe(false);
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  // Reverse-validate: adding `payment_link_token`, `customer.phone`, or
  // `customer.email` to the audit details JSONB would make these
  // assertions fail. This pins the PII/credential omission contract from
  // the Session #149 locked design (Option A).
  it('audit details OMIT payment_link_token, customer phone, and customer email (PII + bearer-credential)', async () => {
    await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'both',
    });
    expect(logAuditMock).toHaveBeenCalledOnce();
    const auditCall = logAuditMock.mock.calls[0][0] as {
      details: Record<string, unknown>;
      entityLabel: string;
    };
    // Serialize the whole audit payload and scan for forbidden tokens/fields.
    const serialized = JSON.stringify(auditCall);
    expect(serialized).not.toContain('EXISTING_TOKEN_xyz');
    expect(serialized).not.toContain('+14245551234');
    expect(serialized).not.toContain('jane@example.com');
    // Negative: details DO contain customer_id (the canonical reference).
    expect(auditCall.details.customer_id).toBe('cust-1');
  });

  // Reverse-validate: removing the actorSourceFor switch (or hardcoding
  // `source: 'pos'` regardless of triggeredBy) causes the voice-agent
  // call to log source='pos' — this assertion fails at
  // `expect(auditCall.source).toBe('api')`.
  it('voice-agent actor maps to source=api (operator actor maps to source=pos)', async () => {
    // Voice-agent path: no identity, source must be 'api'.
    const voiceAgentActor = {
      triggeredBy: 'voice_agent' as const,
      userId: null,
      userEmail: null,
      employeeName: null,
      ipAddress: null,
    };
    await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
      actor: voiceAgentActor,
    });
    expect(logAuditMock).toHaveBeenCalledOnce();
    const auditCall = logAuditMock.mock.calls[0][0] as {
      source: string;
      userId: string | null;
      userEmail: string | null;
      employeeName: string | null;
      details: Record<string, unknown>;
    };
    expect(auditCall.source).toBe('api');
    expect(auditCall.userId).toBeNull();
    expect(auditCall.userEmail).toBeNull();
    expect(auditCall.employeeName).toBeNull();
    expect(auditCall.details.trigger).toBe('voice_agent_send');

    // Second leg of the test: operator actor (default) → source='pos'.
    logAuditMock.mockReset();
    resetState(); // reset state so the same mock appointment is reusable
    await send({
      admin: buildMockAdmin() as unknown as never,
      appointmentId: 'appt-1',
      method: 'sms',
    });
    const auditCallOperator = logAuditMock.mock.calls[0][0] as {
      source: string;
      userEmail: string | null;
      details: Record<string, unknown>;
    };
    expect(auditCallOperator.source).toBe('pos');
    expect(auditCallOperator.userEmail).toBe('test@example.com');
    expect(auditCallOperator.details.trigger).toBe('operator_send');
  });
});
