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
    // Post-Phase-2B fix: the no-op `onEditInPos` was replaced by
    // `returnToPath="/pos/jobs"` so Save Changes inside the POS Sale tab
    // navigates back to Schedule. Regression-locks the no-op pattern:
    // a reintroduced `onEditInPos` would be a TypeScript error (prop
    // removed from the dialog interface), and a wrong returnToPath would
    // fail this assertion. The semantic contract (click → router.push)
    // is locked by the dialog's own tests in
    // `appointment-detail-dialog`/edit-services-disabled.test.tsx; this
    // assertion locks the prop hand-off.
    expect(lastDetailProps?.returnToPath).toBe('/pos/jobs');
    expect(lastDetailProps?.onEditInPos).toBeUndefined();
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
    // N+2 added a status `<Select>` with the same 3 labels — disambiguate the
    // card pills (`<span>`) from the dropdown `<option>` rows by selecting on
    // tag name. The card-pill rendering is the regression target here.
    const pillSpan = (label: string) =>
      screen.getAllByText(label).filter((el) => el.tagName === 'SPAN');
    expect(pillSpan('Pending').length).toBe(1);
    expect(pillSpan('Confirmed').length).toBe(1);
    expect(pillSpan('In Progress').length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N+1 (Session #148) — Schedule filter bar shell + date-pill row wiring.
//
// Lightweight integration checks. Detailed pill semantics + drawer behavior
// are exercised in `schedule-pill-row.test.tsx`; range math in
// `schedule-date-range.test.ts`. Here we lock the WIRING — the filter bar
// appears in the right place, the default pill mounts active, and
// fetchSchedule consumes the helper's envelope.
// ─────────────────────────────────────────────────────────────────────────────

describe('Item 15e N+1 (Session #148) — filter bar shell + default state', () => {
  it('renders the filter bar above the Schedule list (data-testid wiring locked)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(screen.getByTestId('schedule-filter-bar')).toBeTruthy();
  });

  it('default mount has "Next 30 Days" pill active (F.1 LOCKED)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const pill = screen.getByRole('button', { name: /Next 30 Days/i });
    expect(pill.getAttribute('aria-pressed')).toBe('true');
  });

  it('Tomorrow / This Week / Next Week / This Month / Other start INACTIVE on default mount', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    for (const label of ['Tomorrow', 'This Week', 'Next Week', 'This Month', 'Other']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') }).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('fetchSchedule calls the endpoint with from/to derived from the helper (NOT empty)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const url = scheduleCalls()[0].url;
    // Default = Next 30 Days = [tomorrow, today+30]. Don't pin specific
    // dates (the suite runs against the real clock); just lock that BOTH
    // params are present and look like YYYY-MM-DD.
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/to=\d{4}-\d{2}-\d{2}/);
  });

  it('clicking "Tomorrow" pill triggers a re-fetch with the new envelope', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const before = scheduleCalls().length;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Tomorrow/i }));
    });

    // Re-fetch fires because `fetchSchedule` is a useCallback dep of the
    // init effect, and its dep array (selectedPills, otherRange) changed.
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThan(before));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N+2 (Session #149) — search / status / detailer filter wiring.
//
// Per-row predicate behavior is exhaustively unit-tested in
// `src/lib/utils/__tests__/schedule-entry-matches.test.ts`. The tests here lock
// the WIRING: rows render in the right slots, dropdowns carry the locked
// option sets, and changing a control narrows the rendered list (proving the
// useMemo + entryMatchesFilters loop is connected). Endpoint stays unchanged
// (Target A — status/detailer/search are client-side filters per audit D.6/D.7).
// ─────────────────────────────────────────────────────────────────────────────

describe('Item 15e N+2 (Session #149) — search input + status + detailer dropdowns', () => {
  it('Row 1 renders the search input above the pill row', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    expect(screen.getByLabelText(/Filter schedule by customer or vehicle/i)).toBeTruthy();
  });

  it('Row 3 status dropdown carries exactly 4 options (All + 3 X2-locked statuses)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const statusSel = screen.getByLabelText(/Filter by status/i) as HTMLSelectElement;
    const labels = Array.from(statusSel.options).map((o) => o.textContent);
    expect(labels).toEqual(['All Statuses', 'Pending', 'Confirmed', 'In Progress']);
  });

  it('Row 3 status dropdown does NOT offer cancelled/completed/no_show (X2 lock)', async () => {
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
    const statusSel = screen.getByLabelText(/Filter by status/i) as HTMLSelectElement;
    const values = Array.from(statusSel.options).map((o) => o.value);
    expect(values).not.toContain('cancelled');
    expect(values).not.toContain('completed');
    expect(values).not.toContain('no_show');
  });

  it('Row 3 detailer dropdown fetches /api/pos/staff/available on mount + lists bookable detailers', async () => {
    setScope('schedule');
    renderQueue();
    // Detailer fetch runs alongside the Schedule fetch on mount.
    await waitFor(() => expect(staffCalls().length).toBeGreaterThanOrEqual(1));
    const detSel = screen.getByLabelText(/Filter by detailer/i) as HTMLSelectElement;
    const labels = Array.from(detSel.options).map((o) => o.textContent);
    // The mock returns one detailer "Sam Staff" — preceded by "All Detailers"
    // + "Unassigned" sentinels.
    expect(labels[0]).toBe('All Detailers');
    expect(labels[1]).toBe('Unassigned');
    expect(labels).toContain('Sam Staff');
  });

  it('default mount: search empty, status "All Statuses", detailer "All Detailers" — all entries visible', async () => {
    pushEntry({ id: 'apt-1', customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null } });
    pushEntry({ id: 'apt-2', customer: { id: 'c2', first_name: 'Bob', last_name: 'Smith', phone: null, email: null } });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect(screen.getByText('Bob Smith')).toBeTruthy();
  });

  it('selecting a status narrows the visible list to matches (client-side filter)', async () => {
    pushEntry({ id: 'apt-pending', status: 'pending', customer: { id: 'c1', first_name: 'Penny', last_name: 'Pending', phone: null, email: null } });
    pushEntry({ id: 'apt-confirmed', status: 'confirmed', customer: { id: 'c2', first_name: 'Conrad', last_name: 'Confirmed', phone: null, email: null } });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Penny Pending')).toBeTruthy());
    expect(screen.getByText('Conrad Confirmed')).toBeTruthy();

    act(() => {
      fireEvent.change(screen.getByLabelText(/Filter by status/i), { target: { value: 'pending' } });
    });

    await waitFor(() => expect(screen.queryByText('Conrad Confirmed')).toBeNull());
    expect(screen.getByText('Penny Pending')).toBeTruthy();
  });

  it('selecting a detailer narrows the list (and "Unassigned" surfaces entries with detailer: null)', async () => {
    pushEntry({ id: 'apt-1', customer: { id: 'c1', first_name: 'WithStaff', last_name: 'A', phone: null, email: null }, detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' } });
    pushEntry({ id: 'apt-2', customer: { id: 'c2', first_name: 'NoStaff', last_name: 'B', phone: null, email: null }, detailer: null });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('WithStaff A')).toBeTruthy());
    expect(screen.getByText('NoStaff B')).toBeTruthy();

    // Wait for the detailer fetch to populate the dropdown before selecting.
    await waitFor(() => {
      const sel = screen.getByLabelText(/Filter by detailer/i) as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThanOrEqual(3); // All / Unassigned / Sam
    });

    act(() => {
      fireEvent.change(screen.getByLabelText(/Filter by detailer/i), { target: { value: 'unassigned' } });
    });

    await waitFor(() => expect(screen.queryByText('WithStaff A')).toBeNull());
    expect(screen.getByText('NoStaff B')).toBeTruthy();
  });

  it('search input narrows the list after the 300ms debounce', async () => {
    pushEntry({ id: 'apt-1', customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null } });
    pushEntry({ id: 'apt-2', customer: { id: 'c2', first_name: 'Bob', last_name: 'Smith', phone: null, email: null } });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());

    // Fake timers ONLY for the debounce advance — real timers everywhere else
    // (other waitFor calls expect promises to flush).
    vi.useFakeTimers();
    try {
      act(() => {
        fireEvent.change(screen.getByLabelText(/Filter schedule by customer or vehicle/i), {
          target: { value: 'jane' },
        });
      });
      // Pre-debounce: both still visible.
      expect(screen.getByText('Jane Doe')).toBeTruthy();
      expect(screen.getByText('Bob Smith')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(300);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => expect(screen.queryByText('Bob Smith')).toBeNull());
    expect(screen.getByText('Jane Doe')).toBeTruthy();
  });

  it('AND-across-categories: status + detailer + (post-debounce) search all narrow simultaneously', async () => {
    pushEntry({ id: 'apt-match', status: 'pending', customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null }, detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' } });
    pushEntry({ id: 'apt-wrong-status', status: 'confirmed', customer: { id: 'c2', first_name: 'Jane', last_name: 'Smith', phone: null, email: null }, detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' } });
    pushEntry({ id: 'apt-wrong-det', status: 'pending', customer: { id: 'c3', first_name: 'Jane', last_name: 'Brown', phone: null, email: null }, detailer: null });
    pushEntry({ id: 'apt-wrong-search', status: 'pending', customer: { id: 'c4', first_name: 'Bob', last_name: 'White', phone: null, email: null }, detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' } });
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    await waitFor(() => {
      const sel = screen.getByLabelText(/Filter by detailer/i) as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThanOrEqual(3);
    });

    act(() => {
      fireEvent.change(screen.getByLabelText(/Filter by status/i), { target: { value: 'pending' } });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/Filter by detailer/i), { target: { value: 'e1' } });
    });
    vi.useFakeTimers();
    try {
      act(() => {
        fireEvent.change(screen.getByLabelText(/Filter schedule by customer or vehicle/i), { target: { value: 'jane' } });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
    } finally {
      vi.useRealTimers();
    }

    // Only apt-match passes ALL three constraints.
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());
    expect(screen.queryByText('Jane Smith')).toBeNull(); // status mismatch
    expect(screen.queryByText('Jane Brown')).toBeNull(); // detailer mismatch
    expect(screen.queryByText('Bob White')).toBeNull(); // search mismatch
  });

  it('URL restoration: sched_status + sched_detailer mount with the restored values', async () => {
    // Override the searchParams mock for this test to surface URL values.
    const original = (await import('next/navigation')) as { useSearchParams: () => unknown };
    const spy = vi
      .spyOn(original, 'useSearchParams')
      .mockReturnValue({
        get: (k: string) => {
          if (k === 'sched_status') return 'confirmed';
          if (k === 'sched_detailer') return 'e1';
          return null;
        },
        toString: () => 'sched_status=confirmed&sched_detailer=e1',
      });

    try {
      setScope('schedule');
      renderQueue();
      await waitFor(() => expect(scheduleCalls().length).toBeGreaterThanOrEqual(1));
      expect((screen.getByLabelText(/Filter by status/i) as HTMLSelectElement).value).toBe('confirmed');
      // Detailer value mounts immediately from URL even before the
      // /api/pos/staff/available fetch resolves — the select carries the
      // restored value; the matching option label appears once the fetch
      // completes.
      expect((screen.getByLabelText(/Filter by detailer/i) as HTMLSelectElement).value).toBe('e1');
    } finally {
      spy.mockRestore();
    }
  });

  it('Detailer fetch FAILURE leaves the dropdown usable (All / Unassigned remain)', async () => {
    staffState.ok = false;
    setScope('schedule');
    renderQueue();
    await waitFor(() => expect(staffCalls().length).toBeGreaterThanOrEqual(1));
    const detSel = screen.getByLabelText(/Filter by detailer/i) as HTMLSelectElement;
    const labels = Array.from(detSel.options).map((o) => o.textContent);
    // All Detailers + Unassigned MUST still be present so the operator can
    // filter by assignment even when the detailer roster failed to load.
    expect(labels).toContain('All Detailers');
    expect(labels).toContain('Unassigned');
    expect(labels).toContain('Failed to load detailers');
  });
});
