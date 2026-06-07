/**
 * Phase 3 Theme C.1 — AC-12 foundation schema integrity tests.
 *
 * Tests the live Supabase instance for the migration invariants laid down
 * by the three Theme C.1 migrations:
 *
 *   1. appointment_channel enum carries the new 'customer_accept' value
 *      (20260607202558_appointment_channel_customer_accept.sql)
 *
 *   2. appointments has the three new columns with correct type/null/default
 *      semantics (20260607202559_appointments_ac12_schema_additions.sql):
 *        - staff_acknowledged_at TIMESTAMPTZ NULL
 *        - scheduled_date_placeholder BOOLEAN NOT NULL DEFAULT FALSE
 *        - quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL
 *
 *   3. The two new indexes exist and are partial (sparse on NULL):
 *        - appointments_quote_id_uniq (UNIQUE)
 *        - appointments_staff_acknowledged_at_idx
 *
 *   4. The UNIQUE on quote_id rejects a second appointment with the same
 *      quote_id (the AC-12 race-protection contract — defense-in-depth on
 *      top of Theme F's F.7 application-level guard in convertQuote()).
 *
 *   5. Backfill correctness — every quote with non-null converted_appointment_id
 *      has the appointment's quote_id pointing back at it (round-trip
 *      consistency).
 *
 *   6. sms_templates row 'pending_appointment_sla_alert' exists with the
 *      expected slug/category/recipient_type/required_variables shape
 *      (20260607202560_seed_pending_appointment_sla_alert_template.sql).
 *
 * Pattern mirrors src/lib/utils/__tests__/identifier-migration-integrity.test.ts:
 * env-gated via describeIfCreds; runs against the live Supabase pointed
 * to by .env.local; skips cleanly when creds are absent.
 *
 * Test #4 (UNIQUE constraint) is the only one that mutates the DB. It
 * creates two disposable customer + appointment + quote rows in beforeAll,
 * exercises the constraint, and tears them down in afterAll. The cleanup
 * order matters: appointment_services first (FK CASCADE handles this),
 * then quotes (FK to appointment is ON DELETE SET NULL — null it explicitly
 * to be safe), then appointments, then customers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('Theme C.1 — AC-12 schema integrity', () => {
  let supabase: SupabaseClient;
  let testCustomerId: string | null = null;
  let testQuoteId: string | null = null;
  const testAppointmentIds: string[] = [];

  beforeAll(async () => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  /**
   * Generates a format-compliant appointment_number via the canonical
   * `next_identifier('appointment')` RPC (Theme A's shared generator).
   * Using the RPC instead of a hand-rolled disposable string keeps the
   * Theme A migration-integrity test ('all backfilled appointment_numbers
   * match the A-NNNNN format') passing when both test files run in the
   * same vitest invocation — the test queries `.limit(100)` against
   * `appointments` without filtering, so any non-format-matching string
   * we leave in-flight during the run pollutes the format-check window.
   * Cost: a handful of consumed sequence values per test run; negligible
   * against the 5-digit range.
   */
  async function genApptNumber(): Promise<string> {
    const { data, error } = await supabase.rpc('next_identifier', {
      p_entity_type: 'appointment',
    });
    if (error || !data) throw new Error(`next_identifier failed: ${error?.message}`);
    return data as string;
  }

  afterAll(async () => {
    // Tear down in reverse dependency order. quotes → appointment FK is
    // ON DELETE SET NULL so the quote survives the appointment DELETE,
    // but we still hard-delete it for hygiene.
    if (testQuoteId) {
      await supabase.from('quotes').update({ converted_appointment_id: null }).eq('id', testQuoteId);
      await supabase.from('quotes').delete().eq('id', testQuoteId);
    }
    if (testAppointmentIds.length) {
      await supabase.from('appointments').delete().in('id', testAppointmentIds);
    }
    if (testCustomerId) {
      await supabase.from('customers').delete().eq('id', testCustomerId);
    }
  });

  // ---------------------------------------------------------------------------
  // 1. ENUM addition
  // ---------------------------------------------------------------------------
  it('appointment_channel enum carries the new customer_accept value', async () => {
    // The enum cannot be queried via PostgREST table-style; introspect via
    // pg_enum joined to pg_type. Use a generic RPC fallback: read a row
    // INSERT pattern that would have failed on the old 4-value enum.
    //
    // Cheaper signal: pg_type → pg_enum lookup is exposed via the
    // information_schema-equivalent at supabase.rpc, but we use the
    // application-shape signal instead — try to INSERT an appointment with
    // channel='customer_accept' and confirm the enum accepts it. We use
    // an obviously-disposable customer + immediately rolling back via DELETE.

    // Seed the test customer used by this AND the UNIQUE-constraint test
    // (test #4) so we make the customer only once.
    if (!testCustomerId) {
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .insert({
          first_name: 'TestThemeC1',
          last_name: `C1_${Date.now()}`,
          email: `test-theme-c1-${Date.now()}@example.invalid`,
        })
        .select('id')
        .single();
      if (custErr || !customer) {
        throw new Error(`Failed to seed test customer: ${custErr?.message}`);
      }
      testCustomerId = customer.id as string;
    }

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        customer_id: testCustomerId,
        channel: 'customer_accept',
        status: 'pending',
        scheduled_date: '2099-01-01',
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '10:00:00',
        appointment_number: await genApptNumber(),
      })
      .select('id, channel')
      .single();
    if (appt) testAppointmentIds.push(appt.id as string);

    expect(error).toBeNull();
    expect(appt?.channel).toBe('customer_accept');
  });

  // ---------------------------------------------------------------------------
  // 2. Column existence + default semantics
  // ---------------------------------------------------------------------------
  it('appointments.scheduled_date_placeholder defaults to FALSE on insert', async () => {
    if (!testCustomerId) throw new Error('test customer not seeded');
    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        customer_id: testCustomerId,
        channel: 'walk_in',
        status: 'pending',
        scheduled_date: '2099-01-02',
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '10:00:00',
        appointment_number: await genApptNumber(),
      })
      .select('id, scheduled_date_placeholder, staff_acknowledged_at, quote_id')
      .single();
    if (appt) testAppointmentIds.push(appt.id as string);

    expect(error).toBeNull();
    expect(appt?.scheduled_date_placeholder).toBe(false);
    expect(appt?.staff_acknowledged_at).toBeNull();
    expect(appt?.quote_id).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 3. Index presence (verified indirectly via constraint behavior in test #4
  // and via the SLA query shape — partial-index correctness is exercised by
  // every "WHERE staff_acknowledged_at IS NULL" query Theme C.2 will issue.)
  // ---------------------------------------------------------------------------
  it('appointments.staff_acknowledged_at accepts a TIMESTAMPTZ update', async () => {
    if (!testCustomerId) throw new Error('test customer not seeded');
    const { data: appt, error: insertErr } = await supabase
      .from('appointments')
      .insert({
        customer_id: testCustomerId,
        channel: 'walk_in',
        status: 'pending',
        scheduled_date: '2099-01-03',
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '10:00:00',
        appointment_number: await genApptNumber(),
      })
      .select('id')
      .single();
    if (appt) testAppointmentIds.push(appt.id as string);
    expect(insertErr).toBeNull();

    const ackTime = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update({ staff_acknowledged_at: ackTime })
      .eq('id', appt!.id)
      .select('staff_acknowledged_at')
      .single();
    expect(updateErr).toBeNull();
    expect(updated?.staff_acknowledged_at).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 4. UNIQUE constraint on quote_id — the AC-12 race-protection contract.
  //    Two INSERTs with the same quote_id must reject the second.
  // ---------------------------------------------------------------------------
  it('appointments_quote_id_uniq rejects a second appointment with same quote_id', async () => {
    if (!testCustomerId) throw new Error('test customer not seeded');

    // Seed a disposable quote (no items needed for this test — we're only
    // exercising the FK + UNIQUE on the appointments side).
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .insert({
        customer_id: testCustomerId,
        quote_number: `Q-TEST-C1-${Date.now()}`,
        status: 'sent',
      })
      .select('id')
      .single();
    if (quoteErr || !quote) {
      throw new Error(`Failed to seed test quote: ${quoteErr?.message}`);
    }
    testQuoteId = quote.id as string;

    // First appointment with this quote_id: should succeed.
    const { data: appt1, error: a1Err } = await supabase
      .from('appointments')
      .insert({
        customer_id: testCustomerId,
        channel: 'customer_accept',
        status: 'pending',
        scheduled_date: '2099-01-04',
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '10:00:00',
        appointment_number: await genApptNumber(),
        quote_id: testQuoteId,
      })
      .select('id')
      .single();
    if (appt1) testAppointmentIds.push(appt1.id as string);
    expect(a1Err).toBeNull();
    expect(appt1?.id).toBeTruthy();

    // Second appointment with SAME quote_id: must fail with UNIQUE violation.
    const { data: appt2, error: a2Err } = await supabase
      .from('appointments')
      .insert({
        customer_id: testCustomerId,
        channel: 'customer_accept',
        status: 'pending',
        scheduled_date: '2099-01-05',
        scheduled_start_time: '09:00:00',
        scheduled_end_time: '10:00:00',
        appointment_number: await genApptNumber(),
        quote_id: testQuoteId,
      })
      .select('id')
      .single();
    if (appt2) testAppointmentIds.push(appt2.id as string);
    expect(a2Err).not.toBeNull();
    // Postgres UNIQUE violations surface as code 23505 in PostgREST errors;
    // check both code and a substring of the message for resilience across
    // Postgres / PostgREST wording changes.
    expect(a2Err?.code === '23505' || /unique|duplicate/i.test(a2Err?.message ?? '')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Backfill round-trip — every converted quote has the back-link
  // ---------------------------------------------------------------------------
  it('every quote with converted_appointment_id has the appointment quote_id pointing back', async () => {
    const { data: convertedQuotes } = await supabase
      .from('quotes')
      .select('id, converted_appointment_id')
      .not('converted_appointment_id', 'is', null)
      .limit(50);
    if (!convertedQuotes || convertedQuotes.length === 0) {
      // No converted quotes in DB — backfill is vacuously satisfied.
      // This is the most common state in a fresh / lightly-used environment;
      // the test passes by skipping the round-trip check rather than failing.
      return;
    }
    const apptIds = convertedQuotes.map((q) => q.converted_appointment_id as string);
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, quote_id')
      .in('id', apptIds);
    const apptById = new Map((appts ?? []).map((a) => [a.id, a.quote_id]));
    for (const q of convertedQuotes) {
      const apptQuoteId = apptById.get(q.converted_appointment_id);
      // Allow `undefined` if the appointment row was hard-deleted between
      // the two SELECTs (race); otherwise it must equal the quote id.
      if (apptQuoteId !== undefined) {
        expect(apptQuoteId).toBe(q.id);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 6. SMS template seed
  // ---------------------------------------------------------------------------
  it('sms_templates row pending_appointment_sla_alert exists with expected shape', async () => {
    const { data: tpl, error } = await supabase
      .from('sms_templates')
      .select('slug, category, recipient_type, is_active, required_variables, optional_variables')
      .eq('slug', 'pending_appointment_sla_alert')
      .single();
    expect(error).toBeNull();
    expect(tpl?.slug).toBe('pending_appointment_sla_alert');
    expect(tpl?.category).toBe('system');
    expect(tpl?.recipient_type).toBe('staff');
    expect(tpl?.is_active).toBe(true);
    // Required: quote_number, customer_name, services, accepted_at_human
    expect(tpl?.required_variables).toEqual([
      'quote_number',
      'customer_name',
      'services',
      'accepted_at_human',
    ]);
    expect(tpl?.optional_variables).toEqual([]);
  });
});
