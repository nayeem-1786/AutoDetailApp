/**
 * PUT /api/admin/cms/homepage-settings — google_place_id input guard.
 *
 * Pins the Place ID normalization contract: the route must reject malformed
 * Place IDs with HTTP 400 and must normalize accepted values via
 * `normalizeGooglePlaceId` BEFORE passing them to Supabase upsert.
 *
 * Post-double-encoding-fix: values are passed RAW to Supabase (no
 * JSON.stringify) — the Supabase JS client serializes for JSONB itself.
 * Earlier versions of this test pinned the JSON.stringify behavior, which
 * was the bug. See migration
 * 20260518225000_normalize_homepage_settings_double_encoding.sql.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  employee: { id: 'e-1', auth_user_id: 'u-1', email: 'e@x', first_name: 'E', last_name: 'X' },
  upsertedRows: [] as Array<{ key: string; value: unknown }>,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
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
      upsert: (rows: Array<{ key: string; value: unknown }>) => {
        state.upsertedRows = rows;
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { PUT } from '../route';

const CLEAN_ID = 'ChIJ1bR4uWNK3YAReKepydOFb20';

function put(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/cms/homepage-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.upsertedRows = [];
});

describe('PUT /api/admin/cms/homepage-settings — google_place_id guard', () => {
  it('accepts a clean Place ID and stores it raw (Supabase serializes for JSONB)', async () => {
    const res = await PUT(put({ google_place_id: CLEAN_ID }));
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'google_place_id');
    expect(stored?.value).toBe(CLEAN_ID);
  });

  it('unwraps a quoted Place ID before storing', async () => {
    const res = await PUT(put({ google_place_id: `"${CLEAN_ID}"` }));
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'google_place_id');
    expect(stored?.value).toBe(CLEAN_ID);
  });

  it('extracts a Place ID from a Google Maps URL before storing', async () => {
    const res = await PUT(
      put({
        google_place_id: `https://search.google.com/local/reviews?placeid=${CLEAN_ID}`,
      })
    );
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'google_place_id');
    expect(stored?.value).toBe(CLEAN_ID);
  });

  it('returns 400 for an invalid Place ID', async () => {
    const res = await PUT(put({ google_place_id: 'not-a-place-id' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid place id/i);
    expect(state.upsertedRows).toHaveLength(0);
  });

  it('allows null to clear the Place ID', async () => {
    const res = await PUT(put({ google_place_id: null }));
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'google_place_id');
    // Raw null passed through — Supabase will store JSONB null.
    expect(stored?.value).toBeNull();
  });

  it('allows empty string and stores it raw', async () => {
    const res = await PUT(put({ google_place_id: '' }));
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'google_place_id');
    expect(stored?.value).toBe('');
  });

  it('does not gate other keys on Place ID format', async () => {
    const res = await PUT(put({ homepage_hero_tagline: 'free-form text' }));
    expect(res.status).toBe(200);
    const stored = state.upsertedRows.find((r) => r.key === 'homepage_hero_tagline');
    expect(stored?.value).toBe('free-form text');
  });
});
