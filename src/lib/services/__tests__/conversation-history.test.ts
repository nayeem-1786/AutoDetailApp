import { describe, it, expect, beforeEach, vi } from 'vitest';

interface MockMessage {
  id: string;
  sender_type: 'customer' | 'staff' | 'ai' | 'system';
  direction: 'inbound' | 'outbound';
  body: string;
  channel: string | null;
  created_at: string;
}

const state = {
  conversationByPhone: null as { id: string } | null,
  messages: [] as MockMessage[],
  lastSelectArgs: null as { conversationId?: string; limit?: number } | null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: state.conversationByPhone, error: null }),
            }),
          }),
        };
      }
      if (table === 'messages') {
        const chain = {
          _conversationId: undefined as string | undefined,
          _limit: undefined as number | undefined,
          select(_cols: string) { return chain; },
          eq(_col: string, val: string) { chain._conversationId = val; return chain; },
          order(_col: string, _opts: { ascending: boolean }) { return chain; },
          limit(n: number) {
            chain._limit = n;
            state.lastSelectArgs = { conversationId: chain._conversationId, limit: chain._limit };
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

import { getConversationHistory } from '@/lib/services/conversation-history';

const MSG = (id: string, sender: MockMessage['sender_type'], created: string, extras?: Partial<MockMessage>): MockMessage => ({
  id,
  sender_type: sender,
  direction: sender === 'customer' ? 'inbound' : 'outbound',
  body: `body-${id}`,
  channel: 'sms',
  created_at: created,
  ...extras,
});

beforeEach(() => {
  state.conversationByPhone = null;
  state.messages = [];
  state.lastSelectArgs = null;
});

describe('getConversationHistory', () => {
  it('returns [] when neither conversationId nor phone provided', async () => {
    const out = await getConversationHistory({});
    expect(out).toEqual([]);
  });

  it('returns [] when phone is unparseable', async () => {
    const out = await getConversationHistory({ phone: 'garbage' });
    expect(out).toEqual([]);
  });

  it('returns [] when phone has no conversation', async () => {
    state.conversationByPhone = null;
    const out = await getConversationHistory({ phone: '+14245551234' });
    expect(out).toEqual([]);
  });

  it('fetches by conversationId when provided', async () => {
    state.messages = [
      MSG('m1', 'customer', '2026-05-18T10:00:00Z'),
      MSG('m2', 'ai', '2026-05-18T10:01:00Z'),
    ];
    const out = await getConversationHistory({ conversationId: 'c-1' });
    expect(out).toHaveLength(2);
    expect(state.lastSelectArgs?.conversationId).toBe('c-1');
  });

  it('falls back to phone lookup when no conversationId', async () => {
    state.conversationByPhone = { id: 'c-from-phone' };
    state.messages = [MSG('m1', 'customer', '2026-05-18T10:00:00Z')];
    const out = await getConversationHistory({ phone: '+14245551234' });
    expect(out).toHaveLength(1);
    expect(state.lastSelectArgs?.conversationId).toBe('c-from-phone');
  });

  it('returns messages in chronological order (oldest first)', async () => {
    state.messages = [
      MSG('latest', 'ai', '2026-05-18T10:03:00Z'),
      MSG('middle', 'customer', '2026-05-18T10:02:00Z'),
      MSG('earliest', 'system', '2026-05-18T10:01:00Z'),
    ];
    const out = await getConversationHistory({ conversationId: 'c-1' });
    expect(out.map((m) => m.id)).toEqual(['earliest', 'middle', 'latest']);
  });

  it('defaults limit to 20', async () => {
    state.messages = Array.from({ length: 30 }, (_, i) =>
      MSG(`m${i}`, 'customer', `2026-05-18T10:${String(i).padStart(2, '0')}:00Z`),
    );
    await getConversationHistory({ conversationId: 'c-1' });
    expect(state.lastSelectArgs?.limit).toBe(20);
  });

  it('honors custom limit', async () => {
    state.messages = Array.from({ length: 30 }, (_, i) =>
      MSG(`m${i}`, 'customer', `2026-05-18T10:${String(i).padStart(2, '0')}:00Z`),
    );
    await getConversationHistory({ conversationId: 'c-1', limit: 5 });
    expect(state.lastSelectArgs?.limit).toBe(5);
  });

  it('excludes sender_type=system when excludeSystemMessages=true', async () => {
    state.messages = [
      MSG('c1', 'customer', '2026-05-18T10:00:00Z'),
      MSG('s1', 'system', '2026-05-18T10:01:00Z'),
      MSG('a1', 'ai', '2026-05-18T10:02:00Z'),
    ];
    const out = await getConversationHistory({
      conversationId: 'c-1',
      excludeSystemMessages: true,
    });
    expect(out.map((m) => m.id)).toEqual(['c1', 'a1']);
  });

  it('keeps sender_type=system by default', async () => {
    state.messages = [
      MSG('c1', 'customer', '2026-05-18T10:00:00Z'),
      MSG('s1', 'system', '2026-05-18T10:01:00Z'),
    ];
    const out = await getConversationHistory({ conversationId: 'c-1' });
    expect(out.map((m) => m.id)).toEqual(['c1', 's1']);
  });
});
