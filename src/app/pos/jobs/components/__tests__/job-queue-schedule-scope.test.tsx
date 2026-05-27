import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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

function setScope(s: 'today' | 'schedule') {
  localStorage.setItem('pos-jobs-scope', s);
}

beforeEach(() => {
  flagState.enabled = true;
  permissionState.granted = true;
  fetchCalls.length = 0;
  scheduleData.length = 0;
  jobsData.length = 0;
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

  it('Schedule scope renders entry cards and a tap shows the Phase 2 placeholder (no job selection)', async () => {
    scheduleData.push({
      id: 'apt-1',
      scheduled_date: '2026-06-01',
      scheduled_start_time: '10:00:00',
      scheduled_end_time: '11:00:00',
      status: 'confirmed',
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
    });
    setScope('schedule');
    const onSelectJob = vi.fn();
    renderQueue({ onSelectJob });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeTruthy());

    const { toast } = await import('sonner');
    fireEvent.click(screen.getByText('Jane Doe'));
    expect(toast.info).toHaveBeenCalledWith('Upcoming appointment detail — coming in Phase 2');
    expect(onSelectJob).not.toHaveBeenCalled();
  });
});
