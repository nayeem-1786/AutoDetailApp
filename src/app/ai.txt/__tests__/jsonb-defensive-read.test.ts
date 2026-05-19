/**
 * /ai.txt — defensive unwrap pinning.
 *
 * The public crawler-facing endpoint reads business_settings.ai_txt_content
 * (JSONB) and serves it as text/plain. If a legacy double-encoded row from
 * the pre-fix PATCH handler is still in the DB, this endpoint must unwrap it
 * before serving — otherwise crawlers see a quoted, escape-sequenced blob
 * instead of valid directives.
 *
 * Coverage:
 *   1. Clean stored body served verbatim with text/plain content-type.
 *   2. Legacy double-encoded body unwrapped before serving (transition safety).
 *   3. Empty row falls back to the default ai.txt template.
 *   4. DB error path still serves the default (catch block).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {
  value: undefined as unknown,
  throwOnSelect: false,
};

vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            if (store.throwOnSelect) throw new Error('boom');
            return Promise.resolve({
              data: store.value === undefined ? null : { value: store.value },
              error: null,
            });
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'Smart Details' }),
}));

import { GET } from '../route';

const SAMPLE_AI_TXT = `# ai.txt - Smart Details
User-agent: GPTBot
Allow: /
Disallow: /admin/`;

beforeEach(() => {
  store.value = undefined;
  store.throwOnSelect = false;
});

describe('GET /ai.txt — clean stored body', () => {
  it('serves the stored body verbatim with text/plain content-type', async () => {
    store.value = SAMPLE_AI_TXT;

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    const text = await res.text();
    expect(text).toBe(SAMPLE_AI_TXT);
    // The output must NOT start with a literal `"` character (the legacy
    // double-encoded signature that crawlers would have choked on).
    expect(text.startsWith('"')).toBe(false);
  });
});

describe('GET /ai.txt — legacy double-encoded row is defensively unwrapped', () => {
  it('unwraps a JSON-encoded body so crawlers see clean directives', async () => {
    // Pre-fix storage shape: Supabase deserialized JSONB string `"\"...\""`
    // returns the JS string `JSON.stringify(SAMPLE_AI_TXT)`.
    store.value = JSON.stringify(SAMPLE_AI_TXT);

    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(SAMPLE_AI_TXT);
    expect(text.startsWith('"')).toBe(false);
    expect(text).not.toContain('\\n');
  });

  it('keeps a clean body that happens to look quote-wrapped but isn\'t JSON', async () => {
    // Defensive: a body whose first char is `"` and last is `c` would fail
    // JSON.parse; the catch returns the raw value untouched.
    const quotedBody = '"User-agent: GPTBot\nAllow: /\nDisallow: /admin/"junk';
    store.value = quotedBody;

    const res = await GET();
    const text = await res.text();
    expect(text).toBe(quotedBody);
  });
});

describe('GET /ai.txt — fallbacks', () => {
  it('serves DEFAULT_AI_TXT when no row exists', async () => {
    store.value = undefined;

    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('User-agent: GPTBot');
    expect(text).toContain('Smart Details');
  });

  it('serves DEFAULT_AI_TXT when DB read throws', async () => {
    store.throwOnSelect = true;

    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('User-agent: GPTBot');
  });
});
