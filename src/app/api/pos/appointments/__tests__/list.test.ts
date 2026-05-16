import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  posEmployee: {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  viewGranted: true,
  capturedFilters: { gte: '', lte: '' },
  appointments: [] as unknown[],
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (
    _supabase: unknown,
    _role: string,
    _employeeId: string,
    permissionKey: string
  ) => {
    if (permissionKey === 'appointments.view_today') return state.viewGranted;
    return true;
  },
}));

// Pin "today" to a deterministic value so default-range tests don't drift.
vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => '2026-05-15',
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        gte: (_g: string, gv: string) => {
          state.capturedFilters.gte = gv;
          return {
            lte: (_l: string, lv: string) => {
              state.capturedFilters.lte = lv;
              return {
                neq: (_n: string, _nv: string) => ({
                  order: (_a: string) => ({
                    order: (_b: string) =>
                      Promise.resolve({ data: state.appointments, error: null }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }),
  }),
}));

import { GET } from '../route';

function makeReq(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/pos/appointments${query}`, {
    method: 'GET',
  });
}

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  };
  state.viewGranted = true;
  state.capturedFilters = { gte: '', lte: '' };
  state.appointments = [];
});

describe('GET /api/pos/appointments', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 403 when view permission denied', async () => {
    state.viewGranted = false;
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('defaults to today + tomorrow when no range supplied', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(state.capturedFilters.gte).toBe('2026-05-15');
    expect(state.capturedFilters.lte).toBe('2026-05-16');
  });

  it('honors explicit start_date and end_date', async () => {
    const res = await GET(
      makeReq('?start_date=2026-06-01&end_date=2026-06-03')
    );
    expect(res.status).toBe(200);
    expect(state.capturedFilters.gte).toBe('2026-06-01');
    expect(state.capturedFilters.lte).toBe('2026-06-03');
  });

  it('rejects malformed dates', async () => {
    const res = await GET(makeReq('?start_date=2026-13-99'));
    expect(res.status).toBe(400);
  });

  it('rejects start > end', async () => {
    const res = await GET(makeReq('?start_date=2026-06-10&end_date=2026-06-05'));
    expect(res.status).toBe(400);
  });

  it('rejects ranges over 31 days', async () => {
    const res = await GET(makeReq('?start_date=2026-01-01&end_date=2026-03-01'));
    expect(res.status).toBe(400);
  });
});
