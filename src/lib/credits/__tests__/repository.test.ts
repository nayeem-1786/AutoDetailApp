/**
 * Phase 3 Theme E.1 — customer_credits repository + schema integrity tests.
 *
 * Live-DB integration suite. Pins both the schema invariants laid down by
 * 20260607184158_customer_credits_table.sql AND the repository surface in
 * src/lib/credits/repository.ts.
 *
 * Pattern mirrors src/lib/utils/__tests__/identifier-sequences.test.ts:
 * env-gated via describeIfCreds; runs against the live Supabase pointed
 * to by .env.local; skips cleanly when creds are absent. Creates a
 * disposable test customer in beforeAll + tears it down in afterAll —
 * but because the customer_id FK is ON DELETE RESTRICT, all credit rows
 * MUST be removed before the customer DELETE will succeed. The afterEach
 * removes credits issued by each test; afterAll removes the customer.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  createCustomerCredit,
  getCustomerCreditBalance,
  getCustomerCreditById,
} from '../repository';
import type { CustomerCredit } from '../types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('Theme E.1 — customer_credits schema + repository', () => {
  let supabase: SupabaseClient;
  let testCustomerId: string;

  beforeAll(async () => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Disposable customer for the credit-row tests. Phone left null to avoid
    // colliding with the partial-unique customers.phone index.
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        first_name: 'TestCredits',
        last_name: `E1_${Date.now()}`,
        email: `test-credits-e1-${Date.now()}@example.invalid`,
      })
      .select('id')
      .single();
    if (error || !customer) {
      throw new Error(`Failed to seed test customer: ${error?.message}`);
    }
    testCustomerId = customer.id as string;
  });

  afterEach(async () => {
    // Remove credit rows so the next test starts at zero balance AND so
    // the afterAll customer-DELETE can succeed (FK is ON DELETE RESTRICT).
    await supabase.from('customer_credits').delete().eq('customer_id', testCustomerId);
  });

  afterAll(async () => {
    if (testCustomerId) {
      await supabase.from('customers').delete().eq('id', testCustomerId);
    }
  });

  // ---------------------------------------------------------------------------
  // createCustomerCredit
  // ---------------------------------------------------------------------------

  it('createCustomerCredit inserts a new credit and returns the row', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 5000,
      reason: 'cancellation_refund',
      reason_note: 'Customer cancelled within 24h',
    });
    expect(credit.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(credit.customer_id).toBe(testCustomerId);
    expect(credit.amount_cents).toBe(5000);
    expect(credit.reason).toBe('cancellation_refund');
    expect(credit.reason_note).toBe('Customer cancelled within 24h');
    expect(credit.applied_at).toBeNull();
    expect(credit.applied_amount_cents).toBeNull();
    expect(credit.created_at).toBeTruthy();
    expect(credit.updated_at).toBeTruthy();
  });

  it('createCustomerCredit rejects amount_cents <= 0 via CHECK constraint', async () => {
    // The amount_cents > 0 CHECK fires at the DB layer; repository surfaces it
    // as a thrown Error. Both zero and negative are rejected.
    await expect(
      createCustomerCredit(supabase, {
        customer_id: testCustomerId,
        amount_cents: 0,
        reason: 'manual_adjustment',
      })
    ).rejects.toThrow();
    await expect(
      createCustomerCredit(supabase, {
        customer_id: testCustomerId,
        amount_cents: -100,
        reason: 'manual_adjustment',
      })
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // getCustomerCreditBalance
  // ---------------------------------------------------------------------------

  it('getCustomerCreditBalance returns zeros for a customer with no credits', async () => {
    const balance = await getCustomerCreditBalance(supabase, testCustomerId);
    expect(balance.customer_id).toBe(testCustomerId);
    expect(balance.total_issued_cents).toBe(0);
    expect(balance.total_applied_cents).toBe(0);
    expect(balance.available_balance_cents).toBe(0);
    expect(balance.unapplied_credits).toEqual([]);
  });

  it('getCustomerCreditBalance sums issued + applied across multiple credits', async () => {
    // Three credits totaling $150 issued; one fully applied ($50), one
    // partially applied ($20 of $60), one untouched ($40). Available = $80.
    const c1 = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 5000,
      reason: 'cancellation_refund',
    });
    const c2 = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 6000,
      reason: 'goodwill',
    });
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 4000,
      reason: 'promotional',
    });

    // Mark c1 as fully applied, c2 as partially applied. (E.2 will own this
    // path; here we patch directly to assemble the balance fixture.)
    const nowIso = new Date().toISOString();
    await supabase
      .from('customer_credits')
      .update({ applied_at: nowIso, applied_amount_cents: 5000 })
      .eq('id', c1.id);
    await supabase
      .from('customer_credits')
      .update({ applied_at: nowIso, applied_amount_cents: 2000 })
      .eq('id', c2.id);

    const balance = await getCustomerCreditBalance(supabase, testCustomerId);
    expect(balance.total_issued_cents).toBe(15000);
    expect(balance.total_applied_cents).toBe(7000);
    expect(balance.available_balance_cents).toBe(8000);
  });

  it('getCustomerCreditBalance.unapplied_credits excludes applied credits', async () => {
    const applied = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 5000,
      reason: 'cancellation_refund',
    });
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 3000,
      reason: 'goodwill',
    });
    await supabase
      .from('customer_credits')
      .update({ applied_at: new Date().toISOString(), applied_amount_cents: 5000 })
      .eq('id', applied.id);

    const balance = await getCustomerCreditBalance(supabase, testCustomerId);
    expect(balance.unapplied_credits.length).toBe(1);
    expect(balance.unapplied_credits[0]!.amount_cents).toBe(3000);
  });

  it('getCustomerCreditBalance.unapplied_credits excludes expired credits', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 1000,
      reason: 'promotional',
      expires_at: yesterday,
    });
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 2000,
      reason: 'promotional',
      expires_at: future,
    });

    const balance = await getCustomerCreditBalance(supabase, testCustomerId);
    // total_issued sums BOTH (expired credits are still "issued" historically),
    // but unapplied_credits drops the expired one — it's no longer usable.
    expect(balance.total_issued_cents).toBe(3000);
    expect(balance.unapplied_credits.length).toBe(1);
    expect(balance.unapplied_credits[0]!.amount_cents).toBe(2000);
  });

  it('getCustomerCreditBalance.unapplied_credits sorted by expires_at NULLS LAST then created_at', async () => {
    const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Insert in scrambled order to prove the SORT not the INSERT order is
    // what defines the output.
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 100,
      reason: 'promotional',
      // never_expires (NULL) — should sort LAST
    });
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 200,
      reason: 'promotional',
      expires_at: inTwoWeeks,
    });
    await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 300,
      reason: 'promotional',
      expires_at: inOneWeek,
    });

    const balance = await getCustomerCreditBalance(supabase, testCustomerId);
    expect(balance.unapplied_credits.length).toBe(3);
    // soonest-expiring first → never-expiring last (NULLS LAST)
    expect(balance.unapplied_credits[0]!.amount_cents).toBe(300);
    expect(balance.unapplied_credits[1]!.amount_cents).toBe(200);
    expect(balance.unapplied_credits[2]!.amount_cents).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // getCustomerCreditById
  // ---------------------------------------------------------------------------

  it('getCustomerCreditById returns the credit row when found', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 7500,
      reason: 'refund_as_credit',
    });
    const fetched = await getCustomerCreditById(supabase, credit.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(credit.id);
    expect(fetched!.amount_cents).toBe(7500);
  });

  it('getCustomerCreditById returns null when not found', async () => {
    const result = await getCustomerCreditById(
      supabase,
      '00000000-0000-0000-0000-000000000000'
    );
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Schema invariants (CHECK constraints + ENUM + FK behaviors)
  // ---------------------------------------------------------------------------

  it('CHECK constraint: applied_amount_cents must not exceed amount_cents', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 1000,
      reason: 'cancellation_refund',
    });
    // amount_cents = 1000; try to mark as fully applied with applied_amount_cents = 1500
    const { error } = await supabase
      .from('customer_credits')
      .update({
        applied_at: new Date().toISOString(),
        applied_amount_cents: 1500,
      })
      .eq('id', credit.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/customer_credits_applied_consistency/);
  });

  it('CHECK constraint: applied_at set without applied_amount_cents is rejected', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 1000,
      reason: 'cancellation_refund',
    });
    const { error } = await supabase
      .from('customer_credits')
      .update({
        applied_at: new Date().toISOString(),
        // applied_amount_cents intentionally omitted
      })
      .eq('id', credit.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/customer_credits_applied_consistency/);
  });

  it('CHECK constraint: applied_amount_cents must be > 0 when set', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 1000,
      reason: 'cancellation_refund',
    });
    const { error } = await supabase
      .from('customer_credits')
      .update({
        applied_at: new Date().toISOString(),
        applied_amount_cents: 0,
      })
      .eq('id', credit.id);
    expect(error).not.toBeNull();
  });

  it('ENUM customer_credit_reason rejects an unknown reason value', async () => {
    // Bypass the repository's type-safety to exercise the DB-level ENUM check.
    const { error } = await supabase
      .from('customer_credits')
      .insert({
        customer_id: testCustomerId,
        amount_cents: 100,
        reason: 'not_a_real_reason',
      } as never);
    expect(error).not.toBeNull();
  });

  it('updated_at trigger advances updated_at on UPDATE', async () => {
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 100,
      reason: 'goodwill',
    });
    const initialUpdatedAt = credit.updated_at;
    // Wait a tick so the timestamp comparison is meaningful even on fast hardware.
    await new Promise((r) => setTimeout(r, 50));
    await supabase
      .from('customer_credits')
      .update({ reason_note: 'edited' })
      .eq('id', credit.id);
    const { data: refetched } = await supabase
      .from('customer_credits')
      .select('updated_at')
      .eq('id', credit.id)
      .single();
    expect(new Date(refetched!.updated_at).getTime()).toBeGreaterThan(
      new Date(initialUpdatedAt).getTime()
    );
  });

  // ---------------------------------------------------------------------------
  // Migration integrity
  // ---------------------------------------------------------------------------

  it('migration integrity: all 5 customer_credit_reason ENUM values exist', async () => {
    // Insert one row per reason; if any value is missing from the ENUM, the
    // INSERT throws. Successful insertion of all five proves ENUM coverage.
    const reasons: CustomerCredit['reason'][] = [
      'cancellation_refund',
      'manual_adjustment',
      'goodwill',
      'promotional',
      'refund_as_credit',
    ];
    for (const reason of reasons) {
      const credit = await createCustomerCredit(supabase, {
        customer_id: testCustomerId,
        amount_cents: 100,
        reason,
      });
      expect(credit.reason).toBe(reason);
    }
  });

  it('migration integrity: customer_credits table exists with expected columns', async () => {
    // SELECT * on a row exercises every column in the schema; a missing column
    // would surface as undefined in the returned record.
    const credit = await createCustomerCredit(supabase, {
      customer_id: testCustomerId,
      amount_cents: 100,
      reason: 'goodwill',
      reason_note: 'integrity probe',
    });
    const { data } = await supabase
      .from('customer_credits')
      .select('*')
      .eq('id', credit.id)
      .single();
    // Every documented column present (TS won't catch missing DB columns).
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('customer_id');
    expect(data).toHaveProperty('amount_cents');
    expect(data).toHaveProperty('reason');
    expect(data).toHaveProperty('reason_note');
    expect(data).toHaveProperty('source_appointment_id');
    expect(data).toHaveProperty('source_transaction_id');
    expect(data).toHaveProperty('applied_at');
    expect(data).toHaveProperty('applied_to_appointment_id');
    expect(data).toHaveProperty('applied_to_transaction_id');
    expect(data).toHaveProperty('applied_amount_cents');
    expect(data).toHaveProperty('expires_at');
    expect(data).toHaveProperty('created_at');
    expect(data).toHaveProperty('created_by_employee_id');
    expect(data).toHaveProperty('updated_at');
  });
});
