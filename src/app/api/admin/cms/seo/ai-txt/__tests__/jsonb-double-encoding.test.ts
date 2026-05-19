/**
 * /api/admin/cms/seo/ai-txt — JSONB double-encoding fix pinning.
 *
 * Root-cause regression test for the bug where PATCH called JSON.stringify()
 * on the ai.txt content before passing to Supabase upsert into a JSONB
 * column. The Supabase JS client serializes for JSONB itself; pre-stringifying
 * caused immediate double-encoding on every Save, and the public /ai.txt
 * route would then have served JSON-encoded garbage to AI crawlers.
 *
 * Coverage:
 *   1. PATCH passes RAW string value to Supabase upsert (no JSON.stringify).
 *   2. PATCH → in-memory store → GET round-trip preserves the exact body
 *      including newlines.
 *   3. GET deserialization shim: legacy double-encoded rows unwrap correctly;
 *      clean post-fix rows pass through unchanged; multi-line bodies that
 *      look like the legacy shape but aren't valid JSON also pass through.
 *   4. Length math pin so a future regression that re-introduces
 *      JSON.stringify is caught even if the shim hides it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface Row { key: string; value: unknown }
const store = {
  rows: new Map<string, Row>(),
  upsertSpy: vi.fn<(rows: Row[] | Row) => void>(),
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => ({
    id: 'e-1',
    auth_user_id: 'u-1',
    email: 'admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
  }),
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () => null,
}));

vi.mock('@/lib/utils/revalidate', () => ({
  revalidateTag: () => undefined,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      // PATCH path
      upsert: (row: Row, _opts: unknown) => {
        store.upsertSpy(row);
        store.rows.set(row.key, row);
        return Promise.resolve({ error: null });
      },
      // GET path — chained .select().eq().maybeSingle()
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: () => {
            const data = store.rows.get(key) ?? null;
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  }),
}));

import { PATCH, GET } from '../route';

const SAMPLE_AI_TXT = `# ai.txt - Smart Details
User-agent: GPTBot
Allow: /
Disallow: /admin/`;

function patchReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/cms/seo/ai-txt', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/admin/cms/seo/ai-txt', {
    method: 'GET',
  });
}

beforeEach(() => {
  store.rows.clear();
  store.upsertSpy.mockClear();
});

describe('PATCH — value passed RAW to Supabase upsert (no JSON.stringify)', () => {
  it('multi-line ai.txt body reaches upsert as a plain JS string', async () => {
    const res = await PATCH(patchReq({ content: SAMPLE_AI_TXT }));
    expect(res.status).toBe(200);
    const [row] = store.upsertSpy.mock.calls[0] as [Row];
    expect(row.key).toBe('ai_txt_content');
    expect(typeof row.value).toBe('string');
    expect(row.value).toBe(SAMPLE_AI_TXT);
    // Critical: must NOT be the JSON-stringified form. That was the bug —
    // a clean body becoming a quoted, escape-sequenced blob.
    expect(row.value).not.toBe(JSON.stringify(SAMPLE_AI_TXT));
  });

  it('empty string reaches upsert as empty string', async () => {
    const res = await PATCH(patchReq({ content: '' }));
    expect(res.status).toBe(200);
    const [row] = store.upsertSpy.mock.calls[0] as [Row];
    expect(row.value).toBe('');
  });

  it('rejects non-string content with 400', async () => {
    const res = await PATCH(patchReq({ content: 42 }));
    expect(res.status).toBe(400);
    expect(store.upsertSpy).not.toHaveBeenCalled();
  });
});

describe('PATCH → GET round-trip', () => {
  it('round-trips multi-line ai.txt body with clean shape', async () => {
    const patchRes = await PATCH(patchReq({ content: SAMPLE_AI_TXT }));
    expect(patchRes.status).toBe(200);

    const getRes = await GET(getReq());
    expect(getRes.status).toBe(200);
    const { data } = await getRes.json();
    expect(data.content).toBe(SAMPLE_AI_TXT);
    // Sanity check: the stored value must equal the input — no extra `"`
    // characters, no `\n` escape pairs.
    const stored = store.rows.get('ai_txt_content')!;
    expect(stored.value).toBe(SAMPLE_AI_TXT);
  });

  it('round-trips empty string cleanly', async () => {
    const patchRes = await PATCH(patchReq({ content: '' }));
    expect(patchRes.status).toBe(200);

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.content).toBe('');
  });

  it('GET returns DEFAULT_AI_TXT when no row exists', async () => {
    const getRes = await GET(getReq());
    expect(getRes.status).toBe(200);
    const { data } = await getRes.json();
    expect(data.content).toContain('User-agent: GPTBot');
    expect(data.default_content).toBe(data.content);
  });
});

describe('GET — defensive JSON.parse shim handles legacy double-encoded data', () => {
  it('legacy double-encoded body is unwrapped on read (transition safety)', async () => {
    // Pre-fix storage: Supabase deserializes the JSONB string `"\"...\""`
    // to a JS string `'"...."'` whose first/last chars are literal `"` and
    // whose interior `\n` are escape pairs. The shim unwraps via JSON.parse.
    store.rows.set('ai_txt_content', {
      key: 'ai_txt_content',
      value: JSON.stringify(SAMPLE_AI_TXT), // legacy double-encoded JS deserialization
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.content).toBe(SAMPLE_AI_TXT);
  });

  it('cleanly-stored multi-line body passes through unchanged (shim no-op)', async () => {
    // Post-fix storage: row.value is the raw multi-line body. Multi-line
    // strings are not valid JSON, so the shim's JSON.parse path is skipped
    // (the leading-quote check guards before parse is attempted).
    store.rows.set('ai_txt_content', {
      key: 'ai_txt_content',
      value: SAMPLE_AI_TXT,
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.content).toBe(SAMPLE_AI_TXT);
  });

  it('clean body that happens to start/end with `"` chars but is not JSON passes through', async () => {
    // Edge case: an operator pastes a body whose first/last lines are
    // quoted comments. The shim attempts JSON.parse, which throws, and
    // the catch returns the raw value.
    const quotedBody = '"User-agent: GPTBot\nAllow: /\nDisallow: /admin/"junk';
    store.rows.set('ai_txt_content', {
      key: 'ai_txt_content',
      value: quotedBody,
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    // The body starts with `"` and ends with `c` — leading-quote check
    // skips the unwrap path entirely; raw is returned.
    expect(data.content).toBe(quotedBody);
  });

  it('non-string JSONB value (defensive — should never happen post-fix) falls back to default', async () => {
    // The PATCH guard rejects non-strings, so this is purely defensive. If
    // some out-of-band write puts a non-string in the row, the shim falls
    // through to DEFAULT_AI_TXT rather than crashing.
    store.rows.set('ai_txt_content', {
      key: 'ai_txt_content',
      value: { unexpected: 'object' },
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.content).toContain('User-agent: GPTBot');
  });
});

describe('Length math pin — guards against silent JSON.stringify regression', () => {
  it('stored value length equals input length (not input + 2 wrapping quotes)', async () => {
    // The bug's signature: a 27-char Place ID became 29 chars on disk
    // (wrapped in `"..."`). For ai.txt the multi-line body would gain 2
    // wrapping `"` chars + 2 chars per `\n` (each `\n` becomes `\\n`).
    // Pin the post-fix invariant: stored length equals input length.
    await PATCH(patchReq({ content: SAMPLE_AI_TXT }));
    const stored = store.rows.get('ai_txt_content')!;
    expect((stored.value as string).length).toBe(SAMPLE_AI_TXT.length);

    // And the stored value must NOT match the JSON.stringify shape (which
    // would be SAMPLE_AI_TXT.length + 2 + N where N = number of newlines).
    expect((stored.value as string).length).not.toBe(JSON.stringify(SAMPLE_AI_TXT).length);
  });
});
