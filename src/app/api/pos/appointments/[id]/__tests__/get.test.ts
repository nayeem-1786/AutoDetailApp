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
  appointment: null as
    | null
    | {
        id: string;
        scheduled_date: string;
        // Supabase returns the embedded `jobs` relation as an ARRAY (no UNIQUE FK)
        // OR a SINGLE OBJECT / null (1:1, when the FK column is UNIQUE — the case
        // jobs.appointment_id is). The handler must handle both shapes.
        jobs?: Array<{ id: string; status: string }> | { id: string; status: string } | null;
      },
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () => {
            if (!state.appointment) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: state.appointment, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { GET } from '../route';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/pos/appointments/appt-1', {
    method: 'GET',
  });
}

const params = Promise.resolve({ id: 'appt-1' });

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
  state.appointment = {
    id: 'appt-1',
    scheduled_date: '2026-05-16',
  };
});

describe('GET /api/pos/appointments/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 403 when view permission denied', async () => {
    state.viewGranted = false;
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(403);
  });

  it('returns 404 when appointment not found', async () => {
    state.appointment = null;
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(404);
  });

  it('returns the joined appointment on success', async () => {
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe('appt-1');
    expect(json.data.scheduled_date).toBe('2026-05-16');
  });

  // Item 15e Phase 2C-β-2 — has_active_job derivation + jobs-array stripping.
  describe('has_active_job derivation', () => {
    it('false when the appointment has no jobs', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16' };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(false);
    });

    it('true when a non-terminal (scheduled) job exists', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: [{ id: 'j1', status: 'scheduled' }] };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(true);
    });

    it('false when the only job is terminal (completed)', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: [{ id: 'j1', status: 'completed' }] };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(false);
    });

    it('true when ANY job is non-terminal (mixed)', async () => {
      state.appointment = {
        id: 'appt-1',
        scheduled_date: '2026-05-16',
        jobs: [{ id: 'j1', status: 'completed' }, { id: 'j2', status: 'intake' }],
      };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(true);
    });

    it('strips the raw jobs array from the response', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: [{ id: 'j1', status: 'scheduled' }] };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.jobs).toBeUndefined();
    });

    // Session #110 corrective — the production crash shape. jobs.appointment_id
    // has a UNIQUE constraint, so Supabase returns `jobs` as a SINGLE OBJECT
    // (or null), not an array. `.some()` on the object threw at runtime.
    it('true when Supabase returns jobs as a single object (1:1 cardinality)', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: { id: 'j1', status: 'scheduled' } };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(true);
      expect(json.data.jobs).toBeUndefined();
    });

    it('false when the single-object job is terminal', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: { id: 'j1', status: 'completed' } };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(false);
    });

    it('false when jobs is null (no related job)', async () => {
      state.appointment = { id: 'appt-1', scheduled_date: '2026-05-16', jobs: null };
      const json = await (await GET(makeReq(), { params })).json();
      expect(json.data.has_active_job).toBe(false);
    });
  });
});
