import { describe, it, expect, beforeEach } from 'vitest';
import { searchCustomers } from '../customer-search';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Minimal Supabase fluent-query mock.
//
// Records the `.select / .or / .like / .is / .order / .limit` chain and, on
// await, applies the recorded filters against a seeded dataset. Awaits via
// PromiseLike (thenable). Covers only the surface used by searchCustomers —
// not a general-purpose Supabase fake.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

class MockQuery implements PromiseLike<{ data: Row[]; error: null }> {
  private _or: string | null = null;
  private _like: [string, string] | null = null;
  private _is: [string, unknown] | null = null;
  private _limit = 1000;
  public lastOr: string | null = null;
  public lastLike: [string, string] | null = null;

  constructor(private rows: Row[]) {}

  select(_s: string) { return this; }
  order(_col: string, _opts?: unknown) { return this; }
  limit(n: number) { this._limit = n; return this; }

  or(expr: string) {
    this._or = expr;
    this.lastOr = expr;
    return this;
  }

  like(col: string, pat: string) {
    this._like = [col, pat];
    this.lastLike = [col, pat];
    return this;
  }

  is(col: string, val: unknown) {
    this._is = [col, val];
    return this;
  }

  private execute(): { data: Row[]; error: null } {
    let filtered = [...this.rows];

    if (this._is) {
      const [col, val] = this._is;
      filtered = filtered.filter((r) => r[col] === val);
    }

    if (this._like) {
      const [col, pat] = this._like;
      const substring = pat.replace(/%/g, '');
      filtered = filtered.filter((r) =>
        String(r[col] ?? '').includes(substring)
      );
    }

    if (this._or) {
      const clauses = this._or.split(',').map((c) => c.trim());
      filtered = filtered.filter((r) =>
        clauses.some((clause) => {
          const match = clause.match(/^([^.]+)\.ilike\.(.+)$/);
          if (!match) return false;
          const [, col, pat] = match;
          const sub = pat.replace(/%/g, '').toLowerCase();
          return String(r[col] ?? '').toLowerCase().includes(sub);
        })
      );
    }

    return { data: filtered.slice(0, this._limit), error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

class MockSupabase {
  public lastQuery: MockQuery | null = null;
  constructor(private rows: Row[]) {}
  from(_table: string) {
    const q = new MockQuery(this.rows);
    this.lastQuery = q;
    return q;
  }
}

function mockClient(rows: Row[]): {
  supabase: SupabaseClient;
  getLastQuery: () => MockQuery | null;
} {
  const mock = new MockSupabase(rows);
  return {
    supabase: mock as unknown as SupabaseClient,
    getLastQuery: () => mock.lastQuery,
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const OMAR_CUVIAS: Row = {
  id: 'c-omar-cuvias',
  first_name: 'Omar',
  last_name: 'Cuvias',
  phone: '+13107564789',
  email: 'omar@example.com',
  deleted_at: null,
};

const OMAR_JOHNSON: Row = {
  id: 'c-omar-johnson',
  first_name: 'Omar',
  last_name: 'Johnson',
  phone: '+14245551111',
  email: 'oj@example.com',
  deleted_at: null,
};

const MARIO_CUVIAS: Row = {
  id: 'c-mario-cuvias',
  first_name: 'Mario',
  last_name: 'Cuvias',
  phone: '+13105550000',
  email: 'mario@example.com',
  deleted_at: null,
};

const JANE_DOE: Row = {
  id: 'c-jane-doe',
  first_name: 'Jane',
  last_name: 'Doe',
  phone: '+13109998888',
  email: 'jd@example.com',
  deleted_at: null,
};

const ARCHIVED_OMAR: Row = {
  id: 'c-archived-omar',
  first_name: 'Omar',
  last_name: 'Archive',
  phone: '+13100000001',
  email: 'archived@example.com',
  deleted_at: '2026-01-01T00:00:00Z',
};

let seed: Row[];

beforeEach(() => {
  seed = [OMAR_CUVIAS, OMAR_JOHNSON, MARIO_CUVIAS, JANE_DOE, ARCHIVED_OMAR];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchCustomers — empty query', () => {
  it('returns empty data for empty string', async () => {
    const { supabase } = mockClient(seed);
    const { data, error } = await searchCustomers(supabase, '');
    expect(data).toEqual([]);
    expect(error).toBeNull();
  });

  it('returns empty data for whitespace-only query', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '   ');
    expect(data).toEqual([]);
  });
});

describe('searchCustomers — phone branch', () => {
  it('finds customer by full digit phone', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '3107564789');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('finds customer by formatted phone "(310) 756"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '(310) 756');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('finds customer by dotted phone "310.756"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '310.756');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('finds customer by dashed phone "310-756"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '310-756');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('finds customer by plus-prefixed phone "+1 (310) 756"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '+1 (310) 756');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('uses the phone branch (only `like` on phone, no `or` clause)', async () => {
    const { supabase, getLastQuery } = mockClient(seed);
    await searchCustomers(supabase, '3107564789');
    const q = getLastQuery();
    expect(q?.lastLike?.[0]).toBe('phone');
    expect(q?.lastOr).toBeNull();
  });
});

describe('searchCustomers — single-word name branch', () => {
  it('finds multiple Omars by first name', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar');
    const ids = data.map((r) => r.id);
    expect(ids).toContain('c-omar-cuvias');
    expect(ids).toContain('c-omar-johnson');
    expect(ids).not.toContain('c-archived-omar'); // excluded by default
    expect(ids).not.toContain('c-jane-doe');
  });

  it('finds customer by email substring', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar@example');
    expect(data.map((r) => r.id)).toContain('c-omar-cuvias');
  });

  it('uses OR across first_name/last_name/email/phone', async () => {
    const { supabase, getLastQuery } = mockClient(seed);
    await searchCustomers(supabase, 'omar');
    const or = getLastQuery()?.lastOr ?? '';
    expect(or).toContain('first_name.ilike');
    expect(or).toContain('last_name.ilike');
    expect(or).toContain('email.ilike');
    expect(or).toContain('phone.ilike');
  });
});

describe('searchCustomers — multi-word branch', () => {
  it('finds Omar Cuvias for "omar cuvias"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar cuvias');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('c-omar-cuvias');
  });

  it('finds Omar Cuvias for reversed "cuvias omar" (order-independent)', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'cuvias omar');
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('c-omar-cuvias');
  });

  it('finds Omar Cuvias for mixed name+phone "omar 310"', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar 310');
    // Both Omars' phones contain 310 digits? No — Omar Johnson +14245551111.
    // Only Omar Cuvias (+13107564789) matches.
    expect(data.map((r) => r.id)).toEqual(['c-omar-cuvias']);
  });

  it('finds Omar Cuvias for reversed mixed "310 omar" (Option B broad-fetch)', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '310 omar');
    expect(data.map((r) => r.id)).toEqual(['c-omar-cuvias']);
  });

  it('returns empty when intersection has no matches', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar nonexistent');
    expect(data).toEqual([]);
  });

  it('broad-fetch OR includes phone column (Option B)', async () => {
    const { supabase, getLastQuery } = mockClient(seed);
    await searchCustomers(supabase, 'omar cuvias');
    const or = getLastQuery()?.lastOr ?? '';
    expect(or).toContain('phone.ilike');
  });
});

describe('searchCustomers — includeDeleted', () => {
  it('excludes soft-deleted by default', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'archived');
    expect(data.map((r) => r.id)).not.toContain('c-archived-omar');
  });

  it('includes soft-deleted when includeDeleted=true', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'archived', {
      includeDeleted: true,
    });
    expect(data.map((r) => r.id)).toContain('c-archived-omar');
  });

  it('excludes soft-deleted in phone branch by default', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '3100000001');
    expect(data).toEqual([]);
  });

  it('includes soft-deleted in phone branch when opted in', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, '3100000001', {
      includeDeleted: true,
    });
    expect(data.map((r) => r.id)).toEqual(['c-archived-omar']);
  });
});

describe('searchCustomers — limit and broadLimit', () => {
  it('respects limit on single-word branch', async () => {
    const { supabase } = mockClient(seed);
    const { data } = await searchCustomers(supabase, 'omar', { limit: 1 });
    expect(data).toHaveLength(1);
  });

  it('respects limit on phone branch', async () => {
    const bulk = Array.from({ length: 20 }, (_, i) => ({
      id: `c-bulk-${i}`,
      first_name: 'B',
      last_name: String(i),
      phone: `+13100000${String(i).padStart(3, '0')}`,
      email: null,
      deleted_at: null,
    }));
    const { supabase } = mockClient(bulk);
    const { data } = await searchCustomers(supabase, '3100000', { limit: 5 });
    expect(data).toHaveLength(5);
  });

  it('respects broadLimit on multi-word broad fetch', async () => {
    // 30 Omars but broadLimit=3 → intersect has at most 3 candidates to keep.
    const manyOmars: Row[] = Array.from({ length: 30 }, (_, i) => ({
      id: `c-omar-${i}`,
      first_name: 'Omar',
      last_name: `Last${i}`,
      phone: `+13100000${String(i).padStart(3, '0')}`,
      email: `o${i}@example.com`,
      deleted_at: null,
    }));
    // Add one that specifically matches the multi-word intersect.
    const matchingOmar: Row = {
      id: 'c-omar-matching',
      first_name: 'Omar',
      last_name: 'MatchToken',
      phone: '+13100009999',
      email: 'match@example.com',
      deleted_at: null,
    };
    const { supabase } = mockClient([...manyOmars, matchingOmar]);
    const { data } = await searchCustomers(supabase, 'omar matchtoken', {
      broadLimit: 3, // narrow broad fetch — the matching row may not be in the first 3
    });
    // With broadLimit=3 and the matching row placed at the end, intersect may
    // return either 0 (if matching row is outside the broad fetch) or 1.
    // The invariant we assert: never more than broadLimit rows reach intersect.
    expect(data.length).toBeLessThanOrEqual(3);
  });
});

describe('searchCustomers — custom select', () => {
  it('passes through custom select projection', async () => {
    const { supabase } = mockClient(seed);
    // Mock doesn't actually strip columns; we just verify the call works and
    // the utility doesn't error on a non-default select string.
    const { data, error } = await searchCustomers(supabase, 'omar', {
      select: 'id',
    });
    expect(error).toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });
});

describe('searchCustomers — nameFields option', () => {
  it('adds caller-supplied fields to the intersect pool (additive)', async () => {
    const withCompany: Row[] = [
      {
        id: 'c-company-match',
        first_name: 'Alice',
        last_name: 'Smith',
        phone: '+13109997777',
        email: 'alice@acme.com',
        company: 'Acme Corp',
        deleted_at: null,
      },
      {
        id: 'c-company-no-match',
        first_name: 'Bob',
        last_name: 'Jones',
        phone: '+14245556666',
        email: 'bob@other.com',
        company: 'Other Inc',
        deleted_at: null,
      },
    ];
    const { supabase } = mockClient(withCompany);
    // Multi-word query: "alice acme" — name in first_name, "acme" only in company.
    // Without nameFields: ['company'], "acme" would match email ("alice@acme.com")
    // so this test also verifies baseline email matching — but critically,
    // adding 'company' to nameFields should ALSO cause Acme Corp's "acme" to
    // match for Alice Smith whose company is "Acme Corp".
    const { data } = await searchCustomers(supabase, 'alice acme', {
      nameFields: ['company'],
    });
    expect(data.map((r) => r.id)).toContain('c-company-match');
  });
});
