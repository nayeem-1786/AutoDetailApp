/**
 * getCustomerContext — unified single-call customer snapshot.
 *
 * Extracts the inline customer-context fetching block from
 * `src/app/api/webhooks/twilio/inbound/route.ts:520-558` into a shared
 * helper so the SMS AI v2 runner, the existing webhook handler, and the
 * voice-agent context endpoint all consume one canonical shape.
 *
 * Shape design notes (matched against actual DB columns — see deltas from
 * the Layer 1+2 brief):
 *   - `vehicles[].is_primary` is NOT included — the `vehicles` table has no
 *     such column today. Adding one is out of scope for Layer 1+2 (the brief
 *     mentioned it but the schema gap means the field would be unfillable).
 *     If a "primary vehicle" concept is needed by the v2 agent, it should
 *     be derived (most-recent? most-booked?) in a follow-up.
 *   - `upcoming_appointments[].scheduled_time` maps to the DB's
 *     `appointments.scheduled_start_time` (TIME). End time omitted — the
 *     v2 agent only needs the start.
 *   - `recent_transactions[].completed_at` maps to the DB's
 *     `transactions.transaction_date` (TIMESTAMPTZ). Filtered to status =
 *     'completed' so the array only carries finalized work.
 *   - All money values returned as integer cents (Smart Details Money-Unify
 *     convention; the underlying DB columns are NUMERIC(10,2) dollars).
 *
 * Cap policy:
 *   - `conversation_history` defaults to last 20 messages (down from the
 *     legacy SMS handler's 100 — see audit §6.7 for token-budget rationale).
 *   - `recent_transactions` capped at last 5, returned only when customer
 *     is known AND includeTransactions !== false.
 *   - `upcoming_appointments` capped at next 5 (today or later, not
 *     cancelled).
 *   - `recent_quotes` capped at last 3, soft-delete filtered.
 *
 * Unknown phone (no customer row): returns `customer: null` and empty
 * arrays for vehicles/appointments/quotes/transactions; `conversation_history`
 * is still populated from messages keyed by phone (lets the v2 agent see
 * prior staff/AI exchanges with the same unknown number).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import {
  getConversationHistory,
  type ConversationMessage,
} from '@/lib/services/conversation-history';

const DEFAULT_MAX_HISTORY = 20;
const RECENT_TRANSACTIONS_LIMIT = 5;
const UPCOMING_APPOINTMENTS_LIMIT = 5;
const RECENT_QUOTES_LIMIT = 3;

export interface CustomerContextCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  loyalty_points_balance: number;
  is_ai_enabled: boolean;
  sms_consent: boolean;
}

export interface CustomerContextVehicle {
  id: string;
  vehicle_type: string;
  size_class: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

export interface CustomerContextAppointment {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  services: string[];
  status: string;
}

export interface CustomerContextQuote {
  id: string;
  quote_number: string;
  services: string[];
  total_amount_cents: number;
  status: string;
  created_at: string;
}

export interface CustomerContextTransaction {
  id: string;
  completed_at: string;
  services: string[];
  total_amount_cents: number;
}

export interface CustomerContext {
  customer: CustomerContextCustomer | null;
  vehicles: CustomerContextVehicle[];
  upcoming_appointments: CustomerContextAppointment[];
  recent_quotes: CustomerContextQuote[];
  recent_transactions: CustomerContextTransaction[];
  conversation_history: ConversationMessage[];
}

export interface GetCustomerContextParams {
  phone: string;
  conversationId?: string;
  maxHistoryMessages?: number;
  includeTransactions?: boolean;
}

function dollarsToCents(input: number | string | null | undefined): number {
  if (input == null) return 0;
  const n = typeof input === 'string' ? Number(input) : input;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

function emptyContext(): CustomerContext {
  return {
    customer: null,
    vehicles: [],
    upcoming_appointments: [],
    recent_quotes: [],
    recent_transactions: [],
    conversation_history: [],
  };
}

export async function getCustomerContext(
  params: GetCustomerContextParams,
): Promise<CustomerContext> {
  const maxHistory = params.maxHistoryMessages ?? DEFAULT_MAX_HISTORY;
  const includeTransactions = params.includeTransactions !== false;

  const normalized = normalizePhone(params.phone);
  if (!normalized) {
    return emptyContext();
  }

  const admin = createAdminClient();

  // First: customer lookup + conversation lookup in parallel. We need
  // customer.id before the per-customer queries can fire.
  const [{ data: customer }, conversation] = await Promise.all([
    admin
      .from('customers')
      .select('id, first_name, last_name, phone, email, loyalty_points_balance, sms_consent')
      .eq('phone', normalized)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle(),
    (async () => {
      if (params.conversationId) {
        const { data } = await admin
          .from('conversations')
          .select('id, is_ai_enabled')
          .eq('id', params.conversationId)
          .maybeSingle();
        return data;
      }
      const { data } = await admin
        .from('conversations')
        .select('id, is_ai_enabled')
        .eq('phone_number', normalized)
        .maybeSingle();
      return data;
    })(),
  ]);

  // Conversation history is independently useful — fetch even when customer
  // is null (lets the agent see prior context for unknown numbers).
  const historyPromise = getConversationHistory({
    conversationId: conversation?.id,
    phone: conversation?.id ? undefined : normalized,
    limit: maxHistory,
  });

  if (!customer) {
    const history = await historyPromise;
    return {
      ...emptyContext(),
      conversation_history: history,
    };
  }

  const today = new Date().toISOString().split('T')[0];

  const [
    { data: vehicles },
    { data: appointments },
    { data: quotes },
    transactionsResult,
    history,
  ] = await Promise.all([
    admin
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false }),
    admin
      .from('appointments')
      .select(`
        id,
        scheduled_date,
        scheduled_start_time,
        status,
        appointment_services ( services ( name ) )
      `)
      .eq('customer_id', customer.id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_start_time', { ascending: true })
      .limit(UPCOMING_APPOINTMENTS_LIMIT),
    admin
      .from('quotes')
      .select(`
        id,
        quote_number,
        status,
        total_amount,
        created_at,
        quote_items ( item_name )
      `)
      .eq('customer_id', customer.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_QUOTES_LIMIT),
    includeTransactions
      ? admin
          .from('transactions')
          .select(`
            id,
            transaction_date,
            total_amount,
            transaction_items ( item_name )
          `)
          .eq('customer_id', customer.id)
          .eq('status', 'completed')
          .order('transaction_date', { ascending: false })
          .limit(RECENT_TRANSACTIONS_LIMIT)
      : Promise.resolve({ data: [] as unknown[] }),
    historyPromise,
  ]);

  const txnRows = (transactionsResult.data ?? []) as Array<{
    id: string;
    transaction_date: string;
    total_amount: number | string;
    transaction_items: Array<{ item_name: string }> | null;
  }>;

  return {
    customer: {
      id: customer.id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone ?? normalized,
      email: customer.email,
      loyalty_points_balance: customer.loyalty_points_balance ?? 0,
      is_ai_enabled: conversation?.is_ai_enabled ?? true,
      sms_consent: customer.sms_consent ?? false,
    },
    vehicles: (vehicles ?? []).map((v) => ({
      id: v.id,
      vehicle_type: v.vehicle_type,
      size_class: v.size_class,
      year: v.year,
      make: v.make,
      model: v.model,
      color: v.color,
    })),
    upcoming_appointments: (appointments ?? []).map((a) => {
      const svcRows = (a.appointment_services as unknown as Array<{
        services: { name: string } | null;
      }>) ?? [];
      return {
        id: a.id,
        scheduled_date: a.scheduled_date,
        scheduled_time: a.scheduled_start_time,
        services: svcRows
          .map((row) => row.services?.name)
          .filter((n): n is string => Boolean(n)),
        status: a.status,
      };
    }),
    recent_quotes: (quotes ?? []).map((q) => {
      const items = (q.quote_items as unknown as Array<{ item_name: string }>) ?? [];
      return {
        id: q.id,
        quote_number: q.quote_number,
        services: items.map((i) => i.item_name).filter(Boolean),
        total_amount_cents: dollarsToCents(q.total_amount),
        status: q.status,
        created_at: q.created_at,
      };
    }),
    recent_transactions: txnRows.map((t) => ({
      id: t.id,
      completed_at: t.transaction_date,
      services: (t.transaction_items ?? [])
        .map((i) => i.item_name)
        .filter(Boolean),
      total_amount_cents: dollarsToCents(t.total_amount),
    })),
    conversation_history: history,
  };
}
