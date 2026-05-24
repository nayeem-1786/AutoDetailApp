import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { updateSmsConsent } from '@/lib/utils/sms-consent';

export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/customers');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Missing required parameter: phone' },
        { status: 400 }
      );
    }

    const e164Phone = normalizePhone(phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find customer by phone
    let t = perf.now();
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select(
        'id, first_name, last_name, phone, email, loyalty_points_balance'
      )
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();
    perf.mark('query:customers', t);

    if (custErr || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Get vehicles
    t = perf.now();
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    perf.mark('query:vehicles', t);

    // Get upcoming appointments count
    t = perf.now();
    const today = new Date().toISOString().split('T')[0];
    const { count: upcomingAppointments } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled');
    perf.mark('query:appointments_count', t);

    const responseData = {
      customer: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        email: customer.email,
        loyalty_points_balance: customer.loyalty_points_balance,
        vehicles: (vehicles ?? []).map((v) => ({
          id: v.id,
          vehicle_type: v.vehicle_type,
          size_class: v.size_class,
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color,
        })),
        upcoming_appointments: upcomingAppointments ?? 0,
      },
    };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Voice agent customers error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/voice-agent/customers
 *
 * Workstream J Session 3 — `upsert_customer` tool backend. The SMS-AI-v2
 * agent calls this AS SOON AS it learns the customer's first name, then
 * AGAIN as it learns more fields (last_name, email, address, customer_type
 * signal). Replaces the prior side-effect path where customer creation
 * piggy-backed on `send_quote_sms` (Issue 26 root cause — orphan
 * conversations when quote send failed before customer write).
 *
 * Auth: Bearer token (voice_agent_api_key) — same as GET handler above
 * and all other voice-agent endpoints.
 *
 * Phone + conversation_id are injected by the dispatcher from runtime
 * context (see `src/lib/sms-ai/tool-dispatcher.ts`). The LLM does NOT
 * provide them. The endpoint defensively re-validates the phone shape.
 *
 * Update policy (Policy B per operator decision Q7, 2026-05-23):
 *   - `first_name` / `last_name`: UPDATE only if currently null/empty or
 *     matches a generic placeholder ('New Customer', 'Phone Caller', ...).
 *     Never overwrite a real human-curated name.
 *   - `email`: UPDATE only if currently null/empty. Never overwrite.
 *   - `address_line_1` / `address_line_2` / `city` / `zip`: UPDATE only
 *     if currently null/empty. Never overwrite.
 *   - `customer_type`: UPDATE on every call (classification may evolve
 *     as the conversation progresses; latest call wins).
 *   - `sms_consent`: UPDATE only if currently `false` (re-opt-in path);
 *     NEVER auto-revoke via this tool. Opt-out flows through the dedicated
 *     STOP-keyword handler.
 *
 * Conversation linkage: after the customer is found-or-created, the
 * caller-supplied `conversation_id` is backfilled into
 * `conversations.customer_id` IF that column is currently null. The
 * `.is('customer_id', null)` guard prevents stomping an existing link.
 *
 * Error shape: structured errors carry an `instructions_for_agent` string
 * so the agent (via the dispatcher's structured-error passthrough) can
 * react conversationally without leaking system details to the customer.
 */

const GENERIC_NAME_VALUES = new Set([
  'new customer',
  'customer',
  'phone caller',
  'caller',
  'walk-in',
  'walkin',
  'unknown',
  'phone',
  'valued',
]);

function isGenericName(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return GENERIC_NAME_VALUES.has(trimmed.toLowerCase());
}

function isEmptyString(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

interface UpsertCustomerBody {
  // Required
  first_name?: unknown;
  // Optional fields the LLM may provide
  last_name?: unknown;
  email?: unknown;
  customer_type?: unknown;
  address_1?: unknown;
  address_2?: unknown;
  city?: unknown;
  zip_code?: unknown;
  // Dispatcher-injected (NOT from the LLM)
  phone?: unknown;
  conversation_id?: unknown;
}

export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/customers');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = (await request.json()) as UpsertCustomerBody;

    const firstNameRaw = typeof body.first_name === 'string' ? body.first_name.trim() : '';
    if (!firstNameRaw) {
      return NextResponse.json(
        {
          error: 'first_name is required',
          missing_fields: ['first_name'],
          instructions_for_agent:
            'You called upsert_customer without a usable first_name. Ask the customer for their first name naturally in the conversation — do not mention this error or any system details to the customer. Once they answer, call upsert_customer again with their first_name.',
          do_not_share_with_customer: true,
        },
        { status: 400 }
      );
    }
    if (isGenericName(firstNameRaw)) {
      return NextResponse.json(
        {
          error: 'first_name is a placeholder value',
          instructions_for_agent:
            'You passed a generic placeholder as first_name (e.g. "Customer", "Caller", "Unknown"). Wait until the customer shares their actual first name, then call upsert_customer with it. Do not mention this to the customer.',
          do_not_share_with_customer: true,
        },
        { status: 400 }
      );
    }

    const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
    if (!phoneRaw) {
      return NextResponse.json(
        {
          error: 'phone is required (dispatcher injection failed)',
          instructions_for_agent:
            'Internal: the conversation phone was not supplied to upsert_customer. Do not retry upsert_customer this turn — proceed conversationally; the operator will reconcile the customer record manually.',
          do_not_share_with_customer: true,
        },
        { status: 400 }
      );
    }
    const e164Phone = normalizePhone(phoneRaw);
    if (!e164Phone) {
      return NextResponse.json(
        {
          error: 'Invalid phone number',
          instructions_for_agent:
            'Internal: the conversation phone was not valid E.164. Do not retry upsert_customer this turn — proceed conversationally.',
          do_not_share_with_customer: true,
        },
        { status: 400 }
      );
    }

    // Optional fields — accept only strings of useful length
    const lastNameRaw = typeof body.last_name === 'string' ? body.last_name.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    const customerTypeRaw = typeof body.customer_type === 'string' ? body.customer_type.trim().toLowerCase() : '';
    const customerType: 'enthusiast' | 'professional' | null =
      customerTypeRaw === 'enthusiast' || customerTypeRaw === 'professional' ? customerTypeRaw : null;
    const address1Raw = typeof body.address_1 === 'string' ? body.address_1.trim() : '';
    const address2Raw = typeof body.address_2 === 'string' ? body.address_2.trim() : '';
    const cityRaw = typeof body.city === 'string' ? body.city.trim() : '';
    const zipRaw = typeof body.zip_code === 'string' ? body.zip_code.trim() : '';
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';

    const admin = createAdminClient();

    // Find existing customer by phone (soft-delete-aware per CLAUDE.md rule 18).
    let t = perf.now();
    const { data: existingCustomer } = await admin
      .from('customers')
      .select(
        'id, first_name, last_name, email, phone, sms_consent, customer_type, address_line_1, address_line_2, city, zip'
      )
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    perf.mark('query:customers_find', t);

    let customerId: string;
    let wasCreated: boolean;
    const updatedFields: string[] = [];

    if (existingCustomer) {
      customerId = existingCustomer.id;
      wasCreated = false;

      // Build conditional UPDATE per Policy B (preserve human-curated values).
      const updatePayload: Record<string, string | null> = {};

      if (isGenericName(existingCustomer.first_name)) {
        updatePayload.first_name = firstNameRaw;
        updatedFields.push('first_name');
      }
      if (lastNameRaw && isGenericName(existingCustomer.last_name)) {
        updatePayload.last_name = lastNameRaw;
        updatedFields.push('last_name');
      }
      if (emailRaw && isEmptyString(existingCustomer.email)) {
        updatePayload.email = emailRaw;
        updatedFields.push('email');
      }
      if (customerType !== null) {
        // customer_type always overwrites (classification may evolve)
        if (existingCustomer.customer_type !== customerType) {
          updatePayload.customer_type = customerType;
          updatedFields.push('customer_type');
        }
      }
      if (address1Raw && isEmptyString(existingCustomer.address_line_1)) {
        updatePayload.address_line_1 = address1Raw;
        updatedFields.push('address_line_1');
      }
      if (address2Raw && isEmptyString(existingCustomer.address_line_2)) {
        updatePayload.address_line_2 = address2Raw;
        updatedFields.push('address_line_2');
      }
      if (cityRaw && isEmptyString(existingCustomer.city)) {
        updatePayload.city = cityRaw;
        updatedFields.push('city');
      }
      if (zipRaw && isEmptyString(existingCustomer.zip)) {
        updatePayload.zip = zipRaw;
        updatedFields.push('zip');
      }

      if (Object.keys(updatePayload).length > 0) {
        t = perf.now();
        const { error: updateError } = await admin
          .from('customers')
          .update(updatePayload)
          .eq('id', customerId);
        perf.mark('query:customers_update', t);
        if (updateError) {
          console.error('[upsert_customer] update error:', updateError);
          return NextResponse.json(
            {
              error: 'Failed to update customer record',
              instructions_for_agent:
                'Internal: the customer update failed. Proceed conversationally; the operator will reconcile.',
              do_not_share_with_customer: true,
            },
            { status: 500 }
          );
        }
      }

      // Re-opt-in path: existing customer had sms_consent=false; the fact
      // that they are texting (and the agent is now persisting their
      // identity) is an implicit re-opt-in signal. Routes through
      // updateSmsConsent so the audit row lands in sms_consent_log.
      if (existingCustomer.sms_consent === false) {
        try {
          await updateSmsConsent({
            customerId,
            phone: e164Phone,
            action: 'opt_in',
            keyword: 'sms_initiated',
            source: 'inbound_sms',
            notes: 'Implicit re-opt-in detected via upsert_customer (SMS-AI v2)',
          });
          updatedFields.push('sms_consent');
        } catch (err) {
          // Consent log failure is non-fatal — log and continue. The
          // customer record is still updated; only the audit row missed.
          console.error('[upsert_customer] sms_consent re-opt-in log failed:', err);
        }
      }
    } else {
      // NEW customer — INSERT with all provided fields plus defaults.
      const insertPayload: Record<string, string | boolean | null> = {
        first_name: firstNameRaw,
        last_name: lastNameRaw || '',
        phone: e164Phone,
        sms_consent: true,
        customer_type: customerType ?? 'enthusiast',
      };
      if (emailRaw) insertPayload.email = emailRaw;
      if (address1Raw) insertPayload.address_line_1 = address1Raw;
      if (address2Raw) insertPayload.address_line_2 = address2Raw;
      if (cityRaw) insertPayload.city = cityRaw;
      if (zipRaw) insertPayload.zip = zipRaw;

      t = perf.now();
      const { data: newCustomer, error: insertError } = await admin
        .from('customers')
        .insert(insertPayload)
        .select('id')
        .single();
      perf.mark('query:customers_insert', t);

      if (insertError || !newCustomer) {
        console.error('[upsert_customer] insert error:', insertError);
        return NextResponse.json(
          {
            error: 'Failed to create customer record',
            instructions_for_agent:
              'Internal: the customer create failed (likely a duplicate phone race or schema constraint). Proceed conversationally; the operator will reconcile.',
            do_not_share_with_customer: true,
          },
          { status: 500 }
        );
      }

      customerId = newCustomer.id;
      wasCreated = true;
      // Surface every persisted field for diagnostic clarity.
      updatedFields.push(...Object.keys(insertPayload));
    }

    // Retroactive conversation linkage. The `.is('customer_id', null)`
    // guard prevents stomping if another path has already linked.
    let conversationLinked = false;
    if (conversationId) {
      t = perf.now();
      const { data: updatedRows, error: convLinkError } = await admin
        .from('conversations')
        .update({ customer_id: customerId })
        .eq('id', conversationId)
        .is('customer_id', null)
        .select('id');
      perf.mark('query:conversations_link', t);
      if (convLinkError) {
        console.error('[upsert_customer] conversation link error:', convLinkError);
      } else if (Array.isArray(updatedRows) && updatedRows.length > 0) {
        conversationLinked = true;
      }
    }

    const responseData = {
      success: true as const,
      customer_id: customerId,
      was_created: wasCreated,
      updated_fields: updatedFields,
      conversation_linked: conversationLinked,
    };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[upsert_customer] error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        instructions_for_agent:
          'Internal: upsert_customer failed unexpectedly. Proceed conversationally; the operator will reconcile the customer record.',
        do_not_share_with_customer: true,
      },
      { status: 500 }
    );
  }
}
