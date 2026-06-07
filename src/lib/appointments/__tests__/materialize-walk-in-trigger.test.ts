import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { materializeJobFromAppointment } from '../lifecycle-sync';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

// ──────────────────────────────────────────────────────────────────────────────
// Session 2.1.1 — regression tests for the `trigger: 'walk_in'` branch of
// `materializeJobFromAppointment`. The Session 2.1 start_intake branch is
// covered by `src/app/api/pos/jobs/start-intake/__tests__/route.test.ts`; this
// file pins the walk_in branch's distinct semantics (different initial job
// state, optional fields forwarded, services snapshot bypass, no appointment
// status advance).
//
// These tests guard against future "let's unify the trigger logic" refactors
// that might silently regress one branch's initial-state contract.
// ──────────────────────────────────────────────────────────────────────────────

const PINNED_TODAY = '2026-05-15';
const PINNED_NOW_ISO = '2026-05-15T17:00:00.000Z';

const auditCalls: Array<Record<string, unknown>> = [];
vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
  },
}));

vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => PINNED_TODAY,
  pstStartOfDayLiteral: (d: string) => `${d}T00:00:00-08:00`,
}));

interface AppointmentRow {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  employee_id: string | null;
  scheduled_date: string;
  scheduled_end_time: string | null;
  status: string;
  is_mobile: boolean;
  mobile_surcharge: number;
  mobile_zone_name_snapshot: string | null;
}

const state = {
  appointment: null as AppointmentRow | null,
  existingJob: null as { id: string } | null,
  aptServicesFromDb: [] as Array<{
    service_id: string;
    price_at_booking: number;
    service: { id: string; name: string };
  }>,
  insertedJob: null as Record<string, unknown> | null,
  insertedJobId: 'job-walkin-new',
  appointmentUpdatePayload: null as Record<string, unknown> | null,
  fromTables: [] as string[],
  appointmentServicesQueried: false,
};

function makeBuilder(table: string) {
  state.fromTables.push(table);
  let pendingOp: 'select' | 'update' | 'upsert' | null = null;
  let pendingPayload: unknown = null;
  const b = {
    select(_cols?: string) {
      pendingOp = pendingOp ?? 'select';
      return b;
    },
    eq(_col: string, _val: unknown) {
      return b;
    },
    update(payload: Record<string, unknown>) {
      pendingOp = 'update';
      pendingPayload = payload;
      return b;
    },
    upsert(rows: unknown[]) {
      pendingOp = 'upsert';
      pendingPayload = rows;
      return b;
    },
    single() {
      return Promise.resolve(resolveSingle());
    },
    maybeSingle() {
      return Promise.resolve(resolveSingle());
    },
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      return Promise.resolve(resolveAwait()).then(onF, onR);
    },
  };

  function resolveSingle() {
    if (table === 'appointments' && pendingOp === 'select') {
      return state.appointment
        ? { data: state.appointment, error: null }
        : { data: null, error: { message: 'not found' } };
    }
    if (table === 'jobs' && pendingOp === 'select') {
      return state.existingJob
        ? { data: state.existingJob, error: null }
        : { data: null, error: null };
    }
    return { data: null, error: null };
  }

  function resolveAwait() {
    if (table === 'appointment_services' && pendingOp === 'select') {
      state.appointmentServicesQueried = true;
      return { data: state.aptServicesFromDb, error: null };
    }
    if (table === 'jobs' && pendingOp === 'upsert') {
      state.insertedJob = ((pendingPayload as unknown[])[0] ?? null) as Record<
        string,
        unknown
      > | null;
      // Subsequent idempotency-recovery SELECT (if upsert returns empty) would
      // find the new id; but our default path returns the array.
      state.existingJob = { id: state.insertedJobId };
      return { data: [{ id: state.insertedJobId }], error: null };
    }
    if (table === 'appointments' && pendingOp === 'update') {
      state.appointmentUpdatePayload = pendingPayload as Record<string, unknown>;
      if (state.appointment) {
        state.appointment = {
          ...state.appointment,
          status: String(
            (pendingPayload as Record<string, unknown>).status
          ),
        };
      }
      return { error: null };
    }
    return { data: null, error: null };
  }

  return b;
}

const mockSupabase = {
  from: (table: string) => makeBuilder(table),
} as unknown as SupabaseClient;

function appt(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'apt-walkin-1',
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    employee_id: 'emp-detailer-1',
    scheduled_date: PINNED_TODAY,
    scheduled_end_time: '17:00:00',
    status: 'in_progress',
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
    ...overrides,
  };
}

const walkInActor = {
  userId: 'auth-walk-1',
  userEmail: 'pat@example.com',
  employeeName: 'Pat Cashier',
  employeeId: 'emp-1',
};

let dateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.appointment = null;
  state.existingJob = null;
  state.aptServicesFromDb = [];
  state.insertedJob = null;
  state.insertedJobId = 'job-walkin-new';
  state.appointmentUpdatePayload = null;
  state.fromTables = [];
  state.appointmentServicesQueried = false;
  auditCalls.length = 0;
  dateSpy = vi
    .spyOn(Date.prototype, 'toISOString')
    .mockReturnValue(PINNED_NOW_ISO);
});

afterEach(() => {
  dateSpy.mockRestore();
});

describe('materializeJobFromAppointment — trigger=walk_in initial state', () => {
  it('lands the job at status=scheduled with NULL work_started_at / intake_started_at', async () => {
    state.appointment = appt({ status: 'in_progress' });
    const result = await materializeJobFromAppointment(
      mockSupabase,
      'apt-walkin-1',
      {
        trigger: 'walk_in',
        actor: walkInActor,
        source: 'pos',
        ipAddress: '127.0.0.1',
        servicesSnapshot: [{ id: 'svc-1', name: 'Full Detail', price: 200 }],
      }
    );
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(state.insertedJob).toMatchObject({
      status: 'scheduled',
      work_started_at: null,
      intake_started_at: null,
    });
  });

  it('does NOT advance appointment.status (walk-in is already in_progress by construction)', async () => {
    state.appointment = appt({ status: 'in_progress' });
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      servicesSnapshot: [{ id: 'svc-1', name: 'Wash', price: 100 }],
    });
    expect(state.appointmentUpdatePayload).toBeNull();
  });

  it('forwards quoteId + intakeNotes to the job INSERT', async () => {
    state.appointment = appt({ status: 'in_progress' });
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      quoteId: 'quote-bridge-1',
      intakeNotes: 'Customer noted scratch on driver door',
      servicesSnapshot: [{ id: 'svc-1', name: 'Wash', price: 100 }],
    });
    expect(state.insertedJob).toMatchObject({
      quote_id: 'quote-bridge-1',
      intake_notes: 'Customer noted scratch on driver door',
    });
  });

  it('defaults quoteId + intakeNotes to null when not supplied', async () => {
    state.appointment = appt({ status: 'in_progress' });
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      servicesSnapshot: [{ id: 'svc-1', name: 'Wash', price: 100 }],
    });
    expect(state.insertedJob).toMatchObject({
      quote_id: null,
      intake_notes: null,
    });
  });

  it('honors estimatedPickupAtOverride (walk-in NOW+15 vs Start Intake scheduled_end calc)', async () => {
    state.appointment = appt({ status: 'in_progress' });
    const overrideIso = '2026-05-15T14:15:00.000-07:00';
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      estimatedPickupAtOverride: overrideIso,
      servicesSnapshot: [{ id: 'svc-1', name: 'Wash', price: 100 }],
    });
    expect(state.insertedJob?.estimated_pickup_at).toBe(overrideIso);
  });

  it('bypasses the appointment_services + services join when servicesSnapshot is supplied', async () => {
    state.appointment = appt({ status: 'in_progress' });
    const snapshot: JobServiceSnapshot[] = [
      { id: 'svc-1', name: 'Full Detail', price: 200 },
      { id: 'svc-2', name: 'Wax', price: 50 },
    ];
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      servicesSnapshot: snapshot,
    });
    expect(state.appointmentServicesQueried).toBe(false);
    expect(state.insertedJob?.services).toEqual(snapshot);
  });

  it('still appends a mobile-fee entry from the appointment row when is_mobile + surcharge > 0', async () => {
    state.appointment = appt({
      status: 'in_progress',
      is_mobile: true,
      mobile_surcharge: 25,
      mobile_zone_name_snapshot: 'Torrance Zone A',
    });
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      servicesSnapshot: [{ id: 'svc-1', name: 'Wash', price: 100 }],
    });
    const services = state.insertedJob?.services as unknown[];
    expect(services).toHaveLength(2);
    expect(services[1]).toMatchObject({
      id: null,
      name: 'Torrance Zone A',
      price: 25,
      is_mobile_fee: true,
    });
  });

  it('writes an audit row with trigger=walk_in and customer_id in details', async () => {
    state.appointment = appt({ status: 'in_progress' });
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'walk_in',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
      servicesSnapshot: [
        { id: 'svc-1', name: 'Wash', price: 100 },
        { id: 'svc-2', name: 'Wax', price: 50 },
      ],
    });
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      action: 'create',
      entityType: 'job',
      entityId: 'job-walkin-new',
      source: 'pos',
    });
    expect(auditCalls[0].entityLabel).toMatch(/walk-in/);
    expect(auditCalls[0].details).toMatchObject({
      trigger: 'walk_in',
      appointment_id: 'apt-walkin-1',
      previous_appointment_status: 'in_progress',
      services_count: 2,
      customer_id: 'cust-1',
    });
  });

  // Differentiation guard: start_intake-specific behavior MUST NOT leak into
  // the walk_in branch. Pre-2.1.1 this branch did not exist; the test pins the
  // contract so a future "let's just always set work_started_at" refactor
  // breaks loudly.
  it('start_intake branch still produces its own initial state (regression guard for the union split)', async () => {
    state.appointment = appt({ status: 'confirmed' });
    state.aptServicesFromDb = [
      { service_id: 's1', price_at_booking: 100, service: { id: 's1', name: 'Wash' } },
    ];
    await materializeJobFromAppointment(mockSupabase, 'apt-walkin-1', {
      trigger: 'start_intake',
      actor: walkInActor,
      source: 'pos',
      ipAddress: '127.0.0.1',
    });
    expect(state.insertedJob).toMatchObject({
      status: 'intake',
      work_started_at: PINNED_NOW_ISO,
      intake_started_at: PINNED_NOW_ISO,
      quote_id: null,
      intake_notes: null,
    });
    // start_intake DOES advance the appointment (confirmed → in_progress).
    expect(state.appointmentUpdatePayload).toMatchObject({ status: 'in_progress' });
  });
});
