import { describe, it, expect, vi } from 'vitest';
import { findOrCreateConversation } from '@/lib/utils/conversation-helpers';

// Phase Normalization-1: findOrCreateConversation must normalize to E.164
// at the boundary so the conversations table can never accept a malformed
// phone_number. Returns null on unparseable input (per existing never-throws
// contract — logging must not break SMS sends).

type SupabaseStub = {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function stubSupabase(opts: {
  existing?: { id: string; customer_id: string | null } | null;
  inserted?: { id: string } | null;
  insertErr?: { code: string } | null;
}): SupabaseStub {
  const single = vi
    .fn()
    .mockResolvedValueOnce({ data: opts.existing ?? null, error: null })
    .mockResolvedValue({ data: opts.inserted ?? null, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq, single });
  const insertSelectSingle = vi.fn().mockResolvedValue({
    data: opts.inserted ?? null,
    error: opts.insertErr ?? null,
  });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSelectSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  });
  const from = vi.fn().mockReturnValue({ select, insert, update });
  return { from, select, eq, single, insert } as unknown as SupabaseStub;
}

describe('findOrCreateConversation — phone normalization at boundary', () => {
  it('returns null for invalid phone without touching the DB', async () => {
    const stub = stubSupabase({ existing: null, inserted: null });
    const result = await findOrCreateConversation(
      { from: stub.from } as unknown as Parameters<typeof findOrCreateConversation>[0],
      'not-a-phone'
    );
    expect(result).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it('returns null for empty string without touching the DB', async () => {
    const stub = stubSupabase({});
    const result = await findOrCreateConversation(
      { from: stub.from } as unknown as Parameters<typeof findOrCreateConversation>[0],
      ''
    );
    expect(result).toBeNull();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it('queries by normalized E.164 even when caller passes "(310) 756-4789"', async () => {
    const stub = stubSupabase({
      existing: { id: 'conv-existing', customer_id: null },
    });
    const result = await findOrCreateConversation(
      { from: stub.from } as unknown as Parameters<typeof findOrCreateConversation>[0],
      '(310) 756-4789'
    );
    expect(result).toBe('conv-existing');
    expect(stub.eq).toHaveBeenCalledWith('phone_number', '+13107564789');
  });

  it('inserts with normalized E.164 when no existing conversation found', async () => {
    const stub = stubSupabase({
      existing: null,
      inserted: { id: 'conv-new' },
    });
    const result = await findOrCreateConversation(
      { from: stub.from } as unknown as Parameters<typeof findOrCreateConversation>[0],
      '13107564789',
      'cust-abc'
    );
    expect(result).toBe('conv-new');
    // Inspect the insert payload
    const insertCall = stub.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertCall).toMatchObject({
      phone_number: '+13107564789',
      customer_id: 'cust-abc',
    });
  });
});
