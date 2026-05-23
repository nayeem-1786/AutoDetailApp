/**
 * Tests for GET /api/admin/orphan-conversations and
 * POST /api/admin/orphan-conversations/purge.
 *
 * Endpoints are the operator's only path to clean conversations whose
 * customer record was never created (e.g. send_quote_sms failed before its
 * side-effect customer INSERT could run). The main /api/admin/customers/purge
 * tool cannot reach these because its lookup walks customer.phone →
 * conversation, and there is no customer to walk from.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface ConvRow {
  id: string;
  customer_id: string | null;
  phone_number: string;
  last_message_at: string | null;
  created_at: string;
  status: string;
}

interface MsgRow {
  conversation_id: string;
}

const state = {
  employee: null as null | {
    id: string;
    auth_user_id: string;
    email: string;
    first_name: string;
    last_name: string;
  },
  permissionDenied: false,
  convsForList: [] as ConvRow[],
  convsForValidate: [] as ConvRow[],
  messagesForCount: [] as MsgRow[],

  // Failure injection
  failConvSelect: false,
  failMessageSelect: false,
  failConvValidate: false,
  failMessagesDelete: false,
  failConvDelete: false,

  // Captured side effects
  deletes: [] as Array<{ table: string; filter: { col: string; vals: unknown } }>,
  deleteCounts: { messages: 0, conversations: 0 },
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      : null,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildTableMock(table),
  }),
}));

function buildTableMock(table: string) {
  if (table === 'conversations') {
    return {
      select: (_cols: string) => ({
        // GET endpoint: .select().is('customer_id', null).order(...)
        is: (_col: string, _val: unknown) => ({
          order: (_orderCol: string, _opts: unknown) =>
            Promise.resolve(
              state.failConvSelect
                ? { data: null, error: { message: 'list failed' } }
                : { data: state.convsForList, error: null }
            ),
        }),
        // POST endpoint validation: .select().in('id', conversationIds)
        in: (_col: string, _vals: string[]) =>
          Promise.resolve(
            state.failConvValidate
              ? { data: null, error: { message: 'validate failed' } }
              : { data: state.convsForValidate, error: null }
          ),
      }),
      delete: (_opts?: unknown) => ({
        in: (col: string, vals: unknown) => {
          state.deletes.push({ table, filter: { col, vals } });
          if (state.failConvDelete) {
            return Promise.resolve({ count: 0, error: { message: 'conv delete failed' } });
          }
          return Promise.resolve({ count: state.deleteCounts.conversations, error: null });
        },
      }),
    };
  }

  if (table === 'messages') {
    return {
      select: (_cols: string) => ({
        in: (_col: string, _vals: string[]) =>
          Promise.resolve(
            state.failMessageSelect
              ? { data: null, error: { message: 'msg count failed' } }
              : { data: state.messagesForCount, error: null }
          ),
      }),
      delete: (_opts?: unknown) => ({
        in: (col: string, vals: unknown) => {
          state.deletes.push({ table, filter: { col, vals } });
          if (state.failMessagesDelete) {
            return Promise.resolve({ count: 0, error: { message: 'msg delete failed' } });
          }
          return Promise.resolve({ count: state.deleteCounts.messages, error: null });
        },
      }),
    };
  }

  return { select: () => ({}) };
}

// Import handlers AFTER mocks
import { GET } from '@/app/api/admin/orphan-conversations/route';
import { POST } from '@/app/api/admin/orphan-conversations/purge/route';
import { NextRequest } from 'next/server';

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/orphan-conversations', { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/orphan-conversations/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'a@b.com',
    first_name: 'A',
    last_name: 'B',
  };
  state.permissionDenied = false;
  state.convsForList = [];
  state.convsForValidate = [];
  state.messagesForCount = [];
  state.failConvSelect = false;
  state.failMessageSelect = false;
  state.failConvValidate = false;
  state.failMessagesDelete = false;
  state.failConvDelete = false;
  state.deletes = [];
  state.deleteCounts = { messages: 0, conversations: 0 };
});

// ---------------------------------------------------------------------------
// GET /api/admin/orphan-conversations
// ---------------------------------------------------------------------------

describe('GET /api/admin/orphan-conversations', () => {
  it('returns 401 when unauthenticated', async () => {
    state.employee = null;
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller lacks settings.manage permission', async () => {
    state.permissionDenied = true;
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('returns empty array when there are no orphan conversations', async () => {
    state.convsForList = [];
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversations).toEqual([]);
  });

  it('returns conversations with per-conversation message counts', async () => {
    state.convsForList = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: '2026-05-23T23:02:24Z',
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
      {
        id: 'conv-2',
        customer_id: null,
        phone_number: '+13105739274',
        last_message_at: '2026-05-20T15:42:14Z',
        created_at: '2026-05-20T15:00:00Z',
        status: 'open',
      },
    ];
    // 24 messages on conv-1, 2 on conv-2
    state.messagesForCount = [
      ...Array(24).fill(0).map(() => ({ conversation_id: 'conv-1' })),
      { conversation_id: 'conv-2' },
      { conversation_id: 'conv-2' },
    ];

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversations).toHaveLength(2);
    expect(body.conversations[0]).toMatchObject({
      id: 'conv-1',
      phone_number: '+13107564789',
      message_count: 24,
    });
    expect(body.conversations[1]).toMatchObject({
      id: 'conv-2',
      phone_number: '+13105739274',
      message_count: 2,
    });
  });

  it('returns 500 when conversations select fails', async () => {
    state.failConvSelect = true;
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });

  it('returns conversations with zero count when message-count query fails (non-fatal)', async () => {
    state.convsForList = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: '2026-05-23T23:02:24Z',
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
    ];
    state.failMessageSelect = true;
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversations[0].message_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orphan-conversations/purge
// ---------------------------------------------------------------------------

describe('POST /api/admin/orphan-conversations/purge', () => {
  it('returns 401 when unauthenticated', async () => {
    state.employee = null;
    const res = await POST(makePostRequest({ conversationIds: ['conv-1'] }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller lacks settings.manage permission', async () => {
    state.permissionDenied = true;
    const res = await POST(makePostRequest({ conversationIds: ['conv-1'] }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when conversationIds is missing', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('conversationIds');
  });

  it('returns 400 when conversationIds is empty', async () => {
    const res = await POST(makePostRequest({ conversationIds: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when conversationIds exceeds the 100-row cap', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `conv-${i}`);
    const res = await POST(makePostRequest({ conversationIds: ids }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Maximum 100');
  });

  it('returns 400 when one or more IDs do not exist', async () => {
    state.convsForValidate = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: null,
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
    ];
    const res = await POST(makePostRequest({ conversationIds: ['conv-1', 'conv-missing'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not found');
    expect(body.error).toContain('conv-missing');
  });

  it('REFUSES to delete customer-bound conversations (server-side defense)', async () => {
    state.convsForValidate = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: null,
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
      {
        id: 'conv-2',
        customer_id: 'cust-99', // customer-bound!
        phone_number: '+13105739274',
        last_message_at: null,
        created_at: '2026-05-20T15:00:00Z',
        status: 'open',
      },
    ];
    const res = await POST(makePostRequest({ conversationIds: ['conv-1', 'conv-2'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('customer-bound');
    expect(body.customerBoundIds).toEqual(['conv-2']);
    // No DELETE issued because validation failed
    expect(state.deletes).toEqual([]);
  });

  it('deletes messages then conversations in order; returns success counts', async () => {
    state.convsForValidate = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: null,
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
      {
        id: 'conv-2',
        customer_id: null,
        phone_number: '+13105739274',
        last_message_at: null,
        created_at: '2026-05-20T15:00:00Z',
        status: 'open',
      },
    ];
    state.deleteCounts = { messages: 26, conversations: 2 };
    const res = await POST(makePostRequest({ conversationIds: ['conv-1', 'conv-2'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.purgedCount).toBe(2);

    // Order: messages first (count visibility), then conversations
    expect(state.deletes).toEqual([
      { table: 'messages', filter: { col: 'conversation_id', vals: ['conv-1', 'conv-2'] } },
      { table: 'conversations', filter: { col: 'id', vals: ['conv-1', 'conv-2'] } },
    ]);
    expect(body.details).toEqual([
      { table: 'messages', deleted: 26 },
      { table: 'conversations', deleted: 2 },
    ]);
  });

  it('records partial errors when a delete step fails but does not throw', async () => {
    state.convsForValidate = [
      {
        id: 'conv-1',
        customer_id: null,
        phone_number: '+13107564789',
        last_message_at: null,
        created_at: '2026-05-23T20:00:00Z',
        status: 'open',
      },
    ];
    state.failMessagesDelete = true;
    state.deleteCounts.conversations = 1;
    const res = await POST(makePostRequest({ conversationIds: ['conv-1'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].table).toBe('messages');
  });

  it('returns 500 on validation failure', async () => {
    state.failConvValidate = true;
    const res = await POST(makePostRequest({ conversationIds: ['conv-1'] }));
    expect(res.status).toBe(500);
  });
});
