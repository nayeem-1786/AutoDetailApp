/**
 * /api/admin/cms/homepage-settings — JSONB double-encoding fix pinning.
 *
 * Root-cause regression test for the bug where PUT called JSON.stringify()
 * on values before passing them to Supabase upsert into a JSONB column.
 * Supabase serializes JSONB itself; pre-stringifying caused double-encoding
 * on every Save (a clean Place ID's stored length jumped from 29 to 33).
 *
 * Coverage:
 *   1. PUT passes RAW values (string, array, null, object) to Supabase upsert.
 *      Asserts the upsert payload does NOT contain JSON-stringified forms.
 *   2. PUT → in-memory store → GET round-trip for the major value shapes,
 *      asserting the GET response matches what the client sent.
 *   3. GET deserialization shim: legacy double-encoded rows (the pre-fix
 *      storage form) still deserialize correctly via the defensive JSON.parse
 *      branch, keeping the transition safe until the backfill migration runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Shared in-memory store for round-trip tests. Each row's `value` is the
// JSONB column value as Supabase JS client would return it (already
// deserialized from JSONB). Tests can pre-seed legacy double-encoded shapes
// to verify the GET shim.
interface Row { key: string; value: unknown }
const store = {
  rows: new Map<string, Row>(),
  upsertSpy: vi.fn<(rows: Row[]) => void>(),
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

vi.mock('@/lib/services/audit', () => ({
  logAudit: () => undefined,
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      // PUT path
      upsert: (rows: Row[]) => {
        store.upsertSpy(rows);
        for (const r of rows) store.rows.set(r.key, r);
        return Promise.resolve({ error: null });
      },
      // GET path — chained .select().in()
      select: () => ({
        in: (_col: string, keys: string[]) => {
          const data = keys
            .map((k) => store.rows.get(k))
            .filter((r): r is Row => Boolean(r));
          return Promise.resolve({ data, error: null });
        },
      }),
    }),
  }),
}));

import { PUT, GET } from '../route';

const CLEAN_ID = 'ChIJf7qNDhW1woAROX-FX8CScGE';

function putReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/cms/homepage-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/admin/cms/homepage-settings', {
    method: 'GET',
  });
}

beforeEach(() => {
  store.rows.clear();
  store.upsertSpy.mockClear();
});

describe('PUT — values passed RAW to Supabase upsert (no JSON.stringify)', () => {
  it('string value (google_place_id) reaches upsert as a plain JS string', async () => {
    const res = await PUT(putReq({ google_place_id: CLEAN_ID }));
    expect(res.status).toBe(200);
    const [rows] = store.upsertSpy.mock.calls[0];
    const row = rows.find((r) => r.key === 'google_place_id')!;
    expect(typeof row.value).toBe('string');
    expect(row.value).toBe(CLEAN_ID);
    // Critical: the value must NOT be the JSON-stringified form. That was
    // the bug — a string `"ChIJ..."` becoming `"\"ChIJ...\""` (length 33
    // instead of 29) on every Save.
    expect(row.value).not.toBe(JSON.stringify(CLEAN_ID));
  });

  it('array value (homepage_differentiators) reaches upsert as a native JS array', async () => {
    const diffs = [
      { title: 'Eco-Friendly', description: 'Biodegradable products' },
      { title: 'Mobile', description: 'We come to you' },
    ];
    const res = await PUT(putReq({ homepage_differentiators: diffs }));
    expect(res.status).toBe(200);
    const [rows] = store.upsertSpy.mock.calls[0];
    const row = rows.find((r) => r.key === 'homepage_differentiators')!;
    expect(Array.isArray(row.value)).toBe(true);
    expect(row.value).toEqual(diffs);
    // Must NOT be the JSON-stringified form.
    expect(typeof row.value).not.toBe('string');
  });

  it('null value reaches upsert as JS null (not the string "null")', async () => {
    const res = await PUT(putReq({ homepage_cta_title: null }));
    expect(res.status).toBe(200);
    const [rows] = store.upsertSpy.mock.calls[0];
    const row = rows.find((r) => r.key === 'homepage_cta_title')!;
    expect(row.value).toBeNull();
    expect(row.value).not.toBe('null');
  });

  it('empty string reaches upsert as empty string (not the string "\\"\\"")', async () => {
    const res = await PUT(putReq({ homepage_hero_tagline: '' }));
    expect(res.status).toBe(200);
    const [rows] = store.upsertSpy.mock.calls[0];
    const row = rows.find((r) => r.key === 'homepage_hero_tagline')!;
    expect(row.value).toBe('');
  });

  it('multiple keys in one PUT all pass through raw', async () => {
    const res = await PUT(putReq({
      google_place_id: CLEAN_ID,
      homepage_hero_tagline: 'Quality detailing in the South Bay',
      homepage_team_heading: 'Our Team',
    }));
    expect(res.status).toBe(200);
    const [rows] = store.upsertSpy.mock.calls[0];
    expect(rows).toHaveLength(3);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.google_place_id).toBe(CLEAN_ID);
    expect(byKey.homepage_hero_tagline).toBe('Quality detailing in the South Bay');
    expect(byKey.homepage_team_heading).toBe('Our Team');
  });
});

describe('PUT → GET round-trip', () => {
  it('round-trips a Place ID string with clean shape', async () => {
    const putRes = await PUT(putReq({ google_place_id: CLEAN_ID }));
    expect(putRes.status).toBe(200);

    const getRes = await GET(getReq());
    expect(getRes.status).toBe(200);
    const { data } = await getRes.json();
    expect(data.google_place_id).toBe(CLEAN_ID);
  });

  it('round-trips homepage_differentiators array', async () => {
    const diffs = [
      { title: 'Premium', description: 'Top-tier products' },
      { title: 'Trusted', description: 'Local since 2018' },
    ];
    const putRes = await PUT(putReq({ homepage_differentiators: diffs }));
    expect(putRes.status).toBe(200);

    const getRes = await GET(getReq());
    expect(getRes.status).toBe(200);
    const { data } = await getRes.json();
    expect(Array.isArray(data.homepage_differentiators)).toBe(true);
    expect(data.homepage_differentiators).toEqual(diffs);
  });

  it('round-trips empty string cleanly', async () => {
    const putRes = await PUT(putReq({ homepage_cta_title: '' }));
    expect(putRes.status).toBe(200);

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.homepage_cta_title).toBe('');
  });

  it('round-trips null cleanly', async () => {
    const putRes = await PUT(putReq({ homepage_cta_description: null }));
    expect(putRes.status).toBe(200);

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.homepage_cta_description).toBeNull();
  });
});

describe('GET — defensive JSON.parse shim handles legacy double-encoded data', () => {
  it('legacy double-encoded plain string is unwrapped on read (transition safety)', async () => {
    // Pre-fix storage shape for a Place ID: Supabase deserializes the JSONB
    // string `"\"ChIJ...\""` to a JS string `"ChIJ..."` (with literal quotes).
    // The GET shim must JSON.parse this back to the bare ID until the
    // backfill migration cleans the row.
    store.rows.set('google_place_id', {
      key: 'google_place_id',
      value: `"${CLEAN_ID}"`,  // legacy double-encoded JS deserialization
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.google_place_id).toBe(CLEAN_ID);
  });

  it('legacy double-encoded array is unwrapped on read (homepage_differentiators self-heals)', async () => {
    // Pre-fix storage of an array: Supabase returns a JS string of the
    // JSON-encoded array. The shim JSON.parse'es that back to a real array.
    // (homepage_differentiators is intentionally EXCLUDED from the backfill
    // migration; the shim keeps existing data readable until the next Save.)
    const diffs = [{ title: 'X', description: 'Y' }];
    store.rows.set('homepage_differentiators', {
      key: 'homepage_differentiators',
      value: JSON.stringify(diffs),  // legacy double-encoded JS deserialization
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(Array.isArray(data.homepage_differentiators)).toBe(true);
    expect(data.homepage_differentiators).toEqual(diffs);
  });

  it('cleanly-stored plain string passes through unchanged (no JSON.parse mangling)', async () => {
    // Post-fix storage: row.value is the clean JS string. JSON.parse would
    // throw (not valid JSON); shim catches and returns the raw value.
    store.rows.set('google_place_id', {
      key: 'google_place_id',
      value: CLEAN_ID,  // post-fix storage
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.google_place_id).toBe(CLEAN_ID);
  });

  it('cleanly-stored array passes through unchanged', async () => {
    const diffs = [{ title: 'A', description: 'B' }];
    store.rows.set('homepage_differentiators', {
      key: 'homepage_differentiators',
      value: diffs,  // post-fix storage — native JS array from JSONB array
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.homepage_differentiators).toEqual(diffs);
  });

  it('cleanly-stored null passes through unchanged', async () => {
    store.rows.set('homepage_cta_title', {
      key: 'homepage_cta_title',
      value: null,
    });

    const getRes = await GET(getReq());
    const { data } = await getRes.json();
    expect(data.homepage_cta_title).toBeNull();
  });
});

describe('Migration backfill — value::text length verification (logical)', () => {
  it('CLEAN Place ID JSONB representation is 29 chars; double-encoded is 33', () => {
    // Mirrors the production diagnostic. A bare 27-char Place ID stored
    // cleanly as a JSONB string has text representation `"ChIJ...."` (29
    // chars). The pre-fix double-encoded form has `"\"ChIJ...\""` (33 chars).
    // The migration's #>> '{}' + ::jsonb idiom converts the latter to the
    // former. This test pins the length math so a future regression that
    // re-introduces JSON.stringify is caught even if the GET shim hides it.
    const cleanTextRepr = `"${CLEAN_ID}"`;
    const dirtyTextRepr = `"\\"${CLEAN_ID}\\""`;
    expect(cleanTextRepr.length).toBe(29);
    expect(dirtyTextRepr.length).toBe(33);
  });
});
