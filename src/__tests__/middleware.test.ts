import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session 1.6 — POS > Appointments tab retired per AC-4. The middleware now
// short-circuits any request to /pos/appointments (or sub-paths) with a 308
// permanent redirect to /pos/jobs?scope=schedule, preserving bookmarks and
// browser history.
//
// The middleware's full code path is dominated by IP whitelisting,
// host-routing, and Supabase auth — none of which the redirect touches. We
// mock all downstream dependencies as no-ops and assert: (a) the redirect
// fires before any of them is invoked, (b) status is 308 (permanent), and
// (c) the location header carries the canonical schedule scope.

const { supabaseUpdateSessionMock } = vi.hoisted(() => ({
  supabaseUpdateSessionMock: vi.fn(async () => ({
    user: null,
    supabaseResponse: new Response(null, { status: 200 }),
  })),
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: supabaseUpdateSessionMock,
}));

vi.mock('@/lib/security/ip-whitelist', () => ({
  getIpWhitelistConfig: vi.fn(async () => ({ ips: [], enabled: false })),
  getClientIp: vi.fn(() => null),
}));

vi.mock('@/lib/security/host-routing', () => ({
  getHostType: vi.fn(() => 'dev'),
  STAFF_PATHS: ['/admin', '/pos'],
  APP_ALLOWED_PATHS: ['/admin', '/pos', '/auth', '/login', '/api'],
}));

import { middleware } from '../middleware';

function makeReq(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost'));
}

describe('middleware — Session 1.6 /pos/appointments retirement redirect', () => {
  it('redirects exact /pos/appointments to /pos/jobs?scope=schedule with status 308 (permanent)', async () => {
    const res = await middleware(makeReq('/pos/appointments'));
    expect(res.status).toBe(308);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location as string);
    expect(url.pathname).toBe('/pos/jobs');
    expect(url.searchParams.get('scope')).toBe('schedule');
    // Auth path must NOT have run — redirect short-circuits before updateSession.
    expect(supabaseUpdateSessionMock).not.toHaveBeenCalled();
  });

  it('redirects sub-paths under /pos/appointments/* (e.g. legacy deep links) to the same schedule scope', async () => {
    const res = await middleware(makeReq('/pos/appointments/123'));
    expect(res.status).toBe(308);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    const url = new URL(location as string);
    expect(url.pathname).toBe('/pos/jobs');
    expect(url.searchParams.get('scope')).toBe('schedule');
  });

  it('does NOT redirect /pos/appointmentsfoo (false-prefix safety check)', async () => {
    const res = await middleware(makeReq('/pos/appointmentsfoo'));
    // Falls through to the standard middleware path; should NOT be a 308.
    expect(res.status).not.toBe(308);
  });

  it('does NOT redirect adjacent POS routes (/pos/jobs, /pos/transactions, /pos)', async () => {
    for (const path of ['/pos/jobs', '/pos/jobs?scope=schedule', '/pos/transactions', '/pos']) {
      const res = await middleware(makeReq(path));
      expect(res.status).not.toBe(308);
    }
  });
});
