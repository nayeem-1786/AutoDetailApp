import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL INVARIANT (Item 15e Phase 1B):
// The POS Jobs "Schedule" scope must NEVER trigger populate. If any test in the
// "populate gate" block below regresses, future appointments are being
// prematurely materialized as job rows — breaking the retire-and-absorb
// architecture (audit Risk matrix, HIGH severity). populate is only reachable
// via POST /api/pos/jobs/populate, so asserting that call never fires in
// Schedule scope is the observable proxy for the gate.
// ─────────────────────────────────────────────────────────────────────────────

const flagState = { enabled: true };
const permissionState = { granted: true, loading: false };
const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

const scheduleData: unknown[] = [];
const jobsData: unknown[] = [];

// Item 15e Phase 2B — controllable responses for the new tap → fetch → save flow.
const appointmentState = {
  ok: true,
  // Minimal truthy appointment payload (the real detail dialog is mocked below,
  // so only truthiness matters for mount; props are inspected via capture).
  data: { id: 'apt-1', status: 'pending', customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } } as unknown,
};
const staffState = { ok: true, data: [{ id: 'e1', first_name: 'Sam', last_name: 'Staff', role: 'detailer' }] as unknown[] };
const patchState = { ok: true, status: 200, error: 'conflict' };

// Captured props from the mocked dialogs (Phase 2B prop-wiring assertions).
let lastDetailProps: Record<string, unknown> | null = null;
let lastCancelProps: Record<string, unknown> | null = null;

vi.mock('@/app/admin/appointments/components/appointment-detail-dialog', () => ({
  AppointmentDetailDialog: (props: Record<string, unknown>) => {
    lastDetailProps = props;
    return <div data-testid="detail-dialog" />;
  },
}));

vi.mock('@/app/pos/components/appointments/cancel-appointment-dialog', () => ({
  CancelAppointmentDialog: (props: Record<string, unknown>) => {
    lastCancelProps = props;
    return <div data-testid="cancel-dialog" />;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('../../../context/pos-auth-context', () => ({
  usePosAuth: () => ({ employee: { first_name: 'Pat', bookable_for_appointments: false } }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => permissionState,
}));

vi.mock('@/lib/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ enabled: flagState.enabled, loading: false }),
}));

vi.mock('../job-timeline', () => ({
  JobTimeline: () => <div data-testid="job-timeline" />,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (url.includes('/api/pos/jobs/schedule')) {
      return { ok: true, json: async () => ({ data: scheduleData }) };
    }
    if (url.includes('/api/pos/jobs/populate')) {
      return { ok: true, json: async () => ({ data: { created: 0, jobs: [] } }) };
    }
    if (url.includes('/api/pos/jobs')) {
      return { ok: true, json: async () => ({ data: jobsData }) };
    }
    // Item 15e Phase 2B — bookable staff (detail dialog employees source).
    if (url.includes('/api/pos/staff/available')) {
      return {
        ok: staffState.ok,
        status: staffState.ok ? 200 : 500,
        json: async () => ({ data: staffState.data }),
      };
    }
    // Item 15e Phase 2B — single appointment GET (tap) + PATCH (save).
    if (/\/api\/pos\/appointments\/[^/]+$/.test(url)) {
      if (init?.method === 'PATCH') {
        return {
          ok: patchState.ok,
          status: patchState.status,
          json: async () => (patchState.ok ? { data: {} } : { error: patchState.error }),
        };
      }
      return {
        ok: appointmentState.ok,
        status: appointmentState.ok ? 200 : 500,
        json: async () =>
          appointmentState.ok ? { data: appointmentState.data } : { error: 'load failed' },
      };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function renderQueue(overrides: { onSelectJob?: () => void } = {}) {
  return render(
    <JobQueue
      onNewWalkIn={noop}
      onSelectJob={overrides.onSelectJob ?? noop}
      onCheckout={noop}
    />
  );
}

const populateCalls = () => fetchCalls.filter((c) => c.url.includes('/api/pos/jobs/populate'));
const scheduleCalls = () => fetchCalls.filter((c) => c.url.includes('/api/pos/jobs/schedule'));
// Item 15e Phase 2B helpers — single-appointment GET (tap) vs PATCH (save).
const apptGetCalls = () =>
  fetchCalls.filter((c) => /\/api\/pos\/appointments\/[^/]+$/.test(c.url) && c.init?.method !== 'PATCH');
const apptPatchCalls = () =>
  fetchCalls.filter((c) => /\/api\/pos\/appointments\/[^/]+$/.test(c.url) && c.init?.method === 'PATCH');
const staffCalls = () => fetchCalls.filter((c) => c.url.includes('/api/pos/staff/available'));

function pushEntry(overrides: Record<string, unknown> = {}) {
  scheduleData.push({
    id: 'apt-1',
    scheduled_date: '2026-06-01',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    status: 'pending',
    channel: 'online',
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
    vehicle: { id: 'v1', year: 2021, make: 'Honda', model: 'Civic', color: 'Red' },
    detailer: null,
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 120, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
    total_amount: 120,
    deposit_amount: null,
    scope: 'schedule',
    ...overrides,
  });
}

function setScope(s: 'today' | 'schedule') {
  localStorage.setItem('pos-jobs-scope', s);
}

beforeEach(() => {
  flagState.enabled = true;
  permissionState.granted = true;
  fetchCalls.length = 0;
  scheduleData.length = 0;
  jobsData.length = 0;
  // Item 15e Phase 2B — reset tap/save fixtures + captured props.
  appointmentState.ok = true;
  appointmentState.data = { id: 'apt-1', status: 'pending', customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe' } };
  staffState.ok = true;
  staffState.data = [{ id: 'e1', first_name: 'Sam', last_name: 'Staff', role: 'detailer' }];
  patchState.ok = true;
  patchState.status = 200;
  lastDetailProps = null;
  lastCancelProps = null;
  localStorage.clear();
  localStorage.setItem('pos-jobs-view', 'list'); // deterministic content area
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Item 15e Phase 1B — Schedule scope populate gate (load-bearing invariant)', () => {
  it('1. Schedule scope mount does NOT trigger populate (and DOES fetch schedule)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(populateCalls().length).toBe(0);
  });

  it('2. Toggle Today → Schedule does NOT trigger a new populate', async () => {
    setScope('today');
    renderQueue();
    await waitFor(() => expect(populateCalls().length).toBeGreaterThanOrEqual(1));
    const before = populateCalls().length;

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(populateCalls().length).toBe(before); // no NEW populate during the transition
  });

  it('3. Toggle Schedule → Today DOES trigger populate (regression check)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(populateCalls().length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(populateCalls().length).toBeGreaterThanOrEqual(1));
  });

  it('4. Refresh in Schedule scope re-fetches schedule, never populate', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const before = scheduleCalls().length;

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThan(before));
    expect(populateCalls().length).toBe(0);
  });

  it('5. Date navigation is hidden in Schedule scope (no single-day nav to drive populate)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByLabelText('Previous day')).toBeNull();
    expect(screen.queryByLabelText('Next day')).toBeNull();
  });

  it('6. Flag OFF pins scope to Today even when localStorage says schedule (safety net)', async () => {
    setScope('schedule');
    flagState.enabled = false;
    renderQueue();
    // Behaves as Today: populate fires, schedule endpoint never called.
    await waitFor(() => expect(populateCalls().length).toBeGreaterThanOrEqual(1));
    expect(scheduleCalls().length).toBe(0);
    // Date nav (a Today-scope affordance) is present.
    expect(screen.getByLabelText('Previous day')).toBeTruthy();
  });
});

describe('Item 15e Phase 1B — scope toggle UI', () => {
  it('flag OFF → no Schedule scope toggle rendered', async () => {
    flagState.enabled = false;
    renderQueue();
    await waitFor(() => expect(populateCalls().length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
  });

  it('flag ON → Today + Schedule toggle buttons render', async () => {
    setScope('today');
    renderQueue();
    await waitFor(() => expect(populateCalls().length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
  });

  it('Schedule scope renders entry cards and a tap fetches the appointment (no job selection)', async () => {
    pushEntry({ status: 'confirmed' });
    setScope('schedule');
    const onSelectJob = vi.fn();
    renderQueue({ onSelectJob });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());

    // Phase 2B: a tap now fetches the appointment (was a placeholder toast in 1B).
    fireEvent.click(screen.getByText('Jane Doe'));
    await waitFor(() => expect(apptGetCalls().length).toBeGreaterThanOrEqual(1));
    // The card tap must NOT route to a materialized job.
    expect(onSelectJob).not.toHaveBeenCalled();
  });
});

describe('Item 15e Phase 2B — Schedule card tap mount + save flow', () => {
  async function tapFirstCard() {
    pushEntry();
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    fireEvent.click(screen.getByText('Jane Doe'));
  }

  it('1. tapping a Schedule card fetches the appointment + bookable staff', async () => {
    await tapFirstCard();
    await waitFor(() => expect(apptGetCalls().length).toBeGreaterThanOrEqual(1));
    expect(staffCalls().length).toBeGreaterThanOrEqual(1);
    expect(apptGetCalls()[0].url).toContain('/api/pos/appointments/apt-1');
  });

  it('2. a successful fetch mounts the detail dialog with POS context props', async () => {
    await tapFirstCard();
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeTruthy());
    expect(lastDetailProps?.mobileModalMode).toBe('pos');
    expect(lastDetailProps?.modifierVariant).toBe('pos');
    expect(typeof lastDetailProps?.onEditInPos).toBe('function');
    // Never triggers populate while in Schedule scope (invariant holds in 2B).
    expect(populateCalls().length).toBe(0);
  });

  it('3. a failed fetch shows an error toast and mounts no dialog', async () => {
    appointmentState.ok = false;
    await tapFirstCard();
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId('detail-dialog')).toBeNull();
  });

  it('4. dialog onSave calls the POS PATCH endpoint', async () => {
    await tapFirstCard();
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeTruthy());
    await act(async () => {
      await (lastDetailProps?.onSave as (id: string, data: unknown) => Promise<boolean>)('apt-1', {
        status: 'confirmed',
      });
    });
    expect(apptPatchCalls().length).toBe(1);
    expect(apptPatchCalls()[0].url).toContain('/api/pos/appointments/apt-1');
  });

  it('5. a successful save closes the dialog and refetches the Schedule list', async () => {
    await tapFirstCard();
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeTruthy());
    const before = scheduleCalls().length;
    let result: boolean | undefined;
    await act(async () => {
      result = await (lastDetailProps?.onSave as (id: string, data: unknown) => Promise<boolean>)('apt-1', {
        status: 'confirmed',
      });
    });
    expect(result).toBe(true);
    expect(scheduleCalls().length).toBeGreaterThan(before);
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeNull());
  });

  it('6. a failed save keeps the dialog open and shows an error toast', async () => {
    patchState.ok = false;
    patchState.status = 400;
    await tapFirstCard();
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeTruthy());
    let result: boolean | undefined;
    await act(async () => {
      result = await (lastDetailProps?.onSave as (id: string, data: unknown) => Promise<boolean>)('apt-1', {
        status: 'confirmed',
      });
    });
    const { toast } = await import('sonner');
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    expect(screen.queryByTestId('detail-dialog')).toBeTruthy();
  });

  it('7. dialog onCancel closes the detail dialog and opens the POS cancel dialog', async () => {
    await tapFirstCard();
    await waitFor(() => expect(screen.queryByTestId('detail-dialog')).toBeTruthy());
    const appt = lastDetailProps?.appointment;
    await act(async () => {
      (lastDetailProps?.onCancel as (a: unknown) => void)(appt);
    });
    await waitFor(() => expect(screen.queryByTestId('cancel-dialog')).toBeTruthy());
    expect(screen.queryByTestId('detail-dialog')).toBeNull();
    expect(lastCancelProps?.appointment).toBe(appt);
  });

  it('8. each Schedule card shows a status pill keyed on appointment status', async () => {
    pushEntry({ id: 'apt-pending', status: 'pending', customer: { id: 'c1', first_name: 'Penny', last_name: 'Pending', phone: null, email: null } });
    pushEntry({ id: 'apt-confirmed', status: 'confirmed', customer: { id: 'c2', first_name: 'Conrad', last_name: 'Confirmed', phone: null, email: null } });
    pushEntry({ id: 'apt-inprogress', status: 'in_progress', customer: { id: 'c3', first_name: 'Ingrid', last_name: 'Progress', phone: null, email: null } });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Penny Pending')).toBeTruthy());
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();
  });
});
