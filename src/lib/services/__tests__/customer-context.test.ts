import { describe, it, expect, beforeEach, vi } from 'vitest';

// State used by both the supabase admin mock (this file) and the
// conversation-history helper's internal admin client. We mock
// '@/lib/supabase/admin' globally so both code paths share state.
type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  loyalty_points_balance: number;
  sms_consent: boolean;
} | null;

type Conversation = { id: string; is_ai_enabled: boolean } | null;

interface Vehicle {
  id: string;
  vehicle_type: string;
  size_class: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

interface Appointment {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  status: string;
  appointment_services: Array<{ services: { name: string } | null }>;
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  quote_items: Array<{ item_name: string }>;
}

interface Transaction {
  id: string;
  transaction_date: string;
  total_amount: number;
  transaction_items: Array<{ item_name: string }>;
}

interface MockMessage {
  id: string;
  sender_type: 'customer' | 'staff' | 'ai' | 'system';
  direction: 'inbound' | 'outbound';
  body: string;
  channel: string | null;
  created_at: string;
}

const state = {
  customer: null as Customer,
  conversationByPhone: null as Conversation,
  conversationById: null as Conversation,
  vehicles: [] as Vehicle[],
  appointments: [] as Appointment[],
  quotes: [] as Quote[],
  transactions: [] as Transaction[],
  messages: [] as MockMessage[],
  transactionsQueryFired: false,
  appointmentsLimit: undefined as number | undefined,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'customers') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: state.customer, error: null }),
        };
        return chain;
      }
      if (table === 'conversations') {
        const chain = {
          _lookupBy: undefined as 'id' | 'phone' | undefined,
          select: () => chain,
          eq(col: string) {
            chain._lookupBy = col === 'id' ? 'id' : 'phone';
            return chain;
          },
          async maybeSingle() {
            const result = chain._lookupBy === 'id'
              ? state.conversationById
              : state.conversationByPhone;
            return { data: result, error: null };
          },
        };
        return chain;
      }
      if (table === 'vehicles') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => Promise.resolve({ data: state.vehicles, error: null }),
        };
        return chain;
      }
      if (table === 'appointments') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          neq: () => chain,
          order: () => chain,
          limit: (n: number) => {
            state.appointmentsLimit = n;
            return Promise.resolve({ data: state.appointments, error: null });
          },
        };
        return chain;
      }
      if (table === 'quotes') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: state.quotes, error: null }),
        };
        return chain;
      }
      if (table === 'transactions') {
        state.transactionsQueryFired = true;
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: state.transactions, error: null }),
        };
        return chain;
      }
      if (table === 'messages') {
        // Used by conversation-history helper internally.
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: (n: number) => {
            const sorted = [...state.messages].sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            );
            return Promise.resolve({ data: sorted.slice(0, n), error: null });
          },
        };
        return chain;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { getCustomerContext } from '@/lib/services/customer-context';

beforeEach(() => {
  state.customer = null;
  state.conversationByPhone = null;
  state.conversationById = null;
  state.vehicles = [];
  state.appointments = [];
  state.quotes = [];
  state.transactions = [];
  state.messages = [];
  state.transactionsQueryFired = false;
  state.appointmentsLimit = undefined;
});

describe('getCustomerContext', () => {
  describe('unknown phone', () => {
    it('returns empty context for unparseable phone', async () => {
      const out = await getCustomerContext({ phone: 'garbage' });
      expect(out.customer).toBeNull();
      expect(out.vehicles).toEqual([]);
      expect(out.upcoming_appointments).toEqual([]);
      expect(out.recent_quotes).toEqual([]);
      expect(out.recent_transactions).toEqual([]);
      expect(out.conversation_history).toEqual([]);
    });

    it('returns customer=null and empty arrays when phone valid but no customer row', async () => {
      state.customer = null;
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.customer).toBeNull();
      expect(out.vehicles).toEqual([]);
      expect(out.recent_transactions).toEqual([]);
    });

    it('still populates conversation_history from prior messages keyed by phone', async () => {
      state.customer = null;
      state.conversationByPhone = { id: 'c-from-phone', is_ai_enabled: true };
      state.messages = [
        {
          id: 'm1',
          sender_type: 'customer',
          direction: 'inbound',
          body: 'hello?',
          channel: 'sms',
          created_at: '2026-05-18T10:00:00Z',
        },
      ];
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.customer).toBeNull();
      expect(out.conversation_history).toHaveLength(1);
      expect(out.conversation_history[0].body).toBe('hello?');
    });

    it('does NOT fire the transactions query when customer is unknown', async () => {
      state.customer = null;
      await getCustomerContext({ phone: '+14245551234' });
      expect(state.transactionsQueryFired).toBe(false);
    });
  });

  describe('known customer', () => {
    beforeEach(() => {
      state.customer = {
        id: 'cust-1',
        first_name: 'Alice',
        last_name: 'Anders',
        phone: '+14245551234',
        email: 'alice@example.com',
        loyalty_points_balance: 250,
        sms_consent: true,
      };
      state.conversationByPhone = { id: 'conv-1', is_ai_enabled: true };
    });

    it('returns full customer profile including is_ai_enabled from conversation', async () => {
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.customer).toMatchObject({
        id: 'cust-1',
        first_name: 'Alice',
        last_name: 'Anders',
        email: 'alice@example.com',
        loyalty_points_balance: 250,
        sms_consent: true,
        is_ai_enabled: true,
      });
    });

    it('defaults is_ai_enabled to true when no conversation exists', async () => {
      state.conversationByPhone = null;
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.customer?.is_ai_enabled).toBe(true);
    });

    it('shapes vehicles into output array', async () => {
      state.vehicles = [
        {
          id: 'v-1',
          vehicle_type: 'standard',
          size_class: 'sedan',
          year: 2020,
          make: 'Honda',
          model: 'Accord',
          color: 'Silver',
        },
      ];
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.vehicles).toHaveLength(1);
      expect(out.vehicles[0]).toEqual({
        id: 'v-1',
        vehicle_type: 'standard',
        size_class: 'sedan',
        year: 2020,
        make: 'Honda',
        model: 'Accord',
        color: 'Silver',
      });
    });

    it('shapes appointments with services flattened and limits to 5', async () => {
      state.appointments = [
        {
          id: 'a-1',
          scheduled_date: '2026-05-20',
          scheduled_start_time: '10:00:00',
          status: 'confirmed',
          appointment_services: [
            { services: { name: 'Express Wash' } },
            { services: { name: 'Tire Shine' } },
          ],
        },
      ];
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.upcoming_appointments).toEqual([
        {
          id: 'a-1',
          scheduled_date: '2026-05-20',
          scheduled_time: '10:00:00',
          services: ['Express Wash', 'Tire Shine'],
          status: 'confirmed',
        },
      ]);
      expect(state.appointmentsLimit).toBe(5);
    });

    it('converts quote dollars to cents', async () => {
      state.quotes = [
        {
          id: 'q-1',
          quote_number: 'Q-0001',
          status: 'sent',
          total_amount: 123.45,
          created_at: '2026-05-15T10:00:00Z',
          quote_items: [{ item_name: 'Premium Detail' }],
        },
      ];
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.recent_quotes[0].total_amount_cents).toBe(12345);
      expect(out.recent_quotes[0].services).toEqual(['Premium Detail']);
    });

    it('fires the transactions query when includeTransactions defaults to true', async () => {
      state.transactions = [
        {
          id: 't-1',
          transaction_date: '2026-05-10T14:30:00Z',
          total_amount: 200,
          transaction_items: [{ item_name: 'Standard Wash' }],
        },
      ];
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(state.transactionsQueryFired).toBe(true);
      expect(out.recent_transactions).toHaveLength(1);
      expect(out.recent_transactions[0]).toEqual({
        id: 't-1',
        completed_at: '2026-05-10T14:30:00Z',
        services: ['Standard Wash'],
        total_amount_cents: 20000,
      });
    });

    it('skips the transactions query when includeTransactions=false', async () => {
      state.transactions = [
        {
          id: 't-1',
          transaction_date: '2026-05-10T14:30:00Z',
          total_amount: 200,
          transaction_items: [],
        },
      ];
      const out = await getCustomerContext({
        phone: '+14245551234',
        includeTransactions: false,
      });
      expect(state.transactionsQueryFired).toBe(false);
      expect(out.recent_transactions).toEqual([]);
    });

    it('honors maxHistoryMessages cap (default 20)', async () => {
      state.messages = Array.from({ length: 25 }, (_, i) => ({
        id: `m${i}`,
        sender_type: 'customer' as const,
        direction: 'inbound' as const,
        body: `b${i}`,
        channel: 'sms',
        created_at: `2026-05-18T10:${String(i).padStart(2, '0')}:00Z`,
      }));
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.conversation_history).toHaveLength(20);
    });

    it('honors custom maxHistoryMessages', async () => {
      state.messages = Array.from({ length: 25 }, (_, i) => ({
        id: `m${i}`,
        sender_type: 'customer' as const,
        direction: 'inbound' as const,
        body: `b${i}`,
        channel: 'sms',
        created_at: `2026-05-18T10:${String(i).padStart(2, '0')}:00Z`,
      }));
      const out = await getCustomerContext({
        phone: '+14245551234',
        maxHistoryMessages: 5,
      });
      expect(out.conversation_history).toHaveLength(5);
    });

    it('looks up conversation by id when conversationId provided', async () => {
      state.conversationById = { id: 'conv-from-id', is_ai_enabled: false };
      const out = await getCustomerContext({
        phone: '+14245551234',
        conversationId: 'conv-from-id',
      });
      expect(out.customer?.is_ai_enabled).toBe(false);
    });

    it('reports is_ai_enabled=false when conversation has it disabled', async () => {
      state.conversationByPhone = { id: 'conv-1', is_ai_enabled: false };
      const out = await getCustomerContext({ phone: '+14245551234' });
      expect(out.customer?.is_ai_enabled).toBe(false);
    });
  });
});
