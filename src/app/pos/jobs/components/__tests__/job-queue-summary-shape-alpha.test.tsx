import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';

// ── Session 2.6 (AC-3 + Phase 0.3 F.1 LOCKED Shape α) — Daily summary cards ──
// Verifies that the POS Jobs Today scope's 4-card summary aggregates BOTH
// materialized jobs AND un-started confirmed/in_progress appointments returned
// alongside in the Today endpoint payload. Pre-2.6 (and pre-2.5 with populate
// still active in steady state) the cards aggregated jobs only; post-2.6 they
// reflect "today's EXPECTED work" per the operator-stated Shape α semantic.

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
const todayResponse = {
  data: [] as unknown[],
  unstarted_appointments: [] as unknown[],
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('../../../context/pos-auth-context', () => ({
  usePosAuth: () => ({ employee: { first_name: 'Pat', bookable_for_appointments: false } }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('@/lib/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ enabled: false, loading: false }),
}));

vi.mock('../job-timeline', () => ({
  JobTimeline: () => <div data-testid="job-timeline" />,
}));

vi.mock('@/app/admin/appointments/components/appointment-detail-dialog', () => ({
  AppointmentDetailDialog: () => <div />,
}));

vi.mock('@/app/pos/components/appointments/cancel-appointment-dialog', () => ({
  CancelAppointmentDialog: () => <div />,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    // Session 2.5 — populate retired; surface any reintroduced caller as 404.
    if (url.includes('/api/pos/jobs/populate')) {
      return { ok: false, status: 404, json: async () => ({ error: 'populate retired (Session 2.5)' }) };
    }
    if (url.match(/\/api\/pos\/jobs(\?|$)/)) {
      return { ok: true, json: async () => todayResponse };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function renderQueue() {
  return render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);
}

// ─── Job fixtures ──────────────────────────────────────────────────────────
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    status: 'in_progress',
    appointment_id: 'apt-job-1',
    transaction_id: null,
    services: [{ id: 's1', name: 'Wash', price: 100 }],
    estimated_pickup_at: null,
    created_at: '2026-06-06T12:00:00Z',
    timer_seconds: 0,
    work_started_at: '2026-06-06T12:00:00Z',
    timer_paused_at: null,
    customer: { id: 'c1', first_name: 'Job', last_name: 'Owner', phone: null },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    assigned_staff: { id: 'e1', first_name: 'Sam', last_name: 'Staff' },
    addons: [],
    appointment: { scheduled_start_time: '12:00:00' },
    photos: [],
    estimated_duration_minutes: 60,
    ...overrides,
  };
}

// ─── Un-started appointment fixtures ───────────────────────────────────────
function makeUnstartedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apt-1',
    scheduled_date: '2026-06-06',
    scheduled_start_time: '14:30:00',
    scheduled_end_time: '15:30:00',
    status: 'confirmed',
    channel: 'online',
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' },
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 50, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
    total_amount: 50,
    deposit_amount: null,
    scope: 'today_unstarted',
    ...overrides,
  };
}

beforeEach(() => {
  fetchCalls.length = 0;
  todayResponse.data = [];
  todayResponse.unstarted_appointments = [];
  localStorage.clear();
  // Force list view so the summary chrome renders deterministically.
  localStorage.setItem('pos-jobs-view', 'list');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Helper: wait for the summary bar to appear after fetch resolves, return its
// element so assertions can be scoped via `within(bar)`. Scoping avoids
// collisions with the un-started appointment card (which renders its own
// `formatCurrency(total_amount)`) and the job card (which renders the
// service price).
async function waitForSummaryBar() {
  await waitFor(() => expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true));
  return await waitFor(() => {
    const bar = screen.getByTestId('daily-summary-bar');
    expect(bar).toBeTruthy();
    return bar;
  });
}

describe('JobQueue — daily summary Shape α (Session 2.6)', () => {
  it('1. empty Today scope (no jobs, no un-started) → summary bar hidden gracefully', async () => {
    todayResponse.data = [];
    todayResponse.unstarted_appointments = [];
    renderQueue();
    await waitFor(() => expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true));
    // Summary bar's visibility gate is `summary.totalJobs > 0`; with zero on
    // both sides the bar must NOT render (regression against accidental
    // always-render after the dep-array widening).
    expect(screen.queryByTestId('daily-summary-bar')).toBeNull();
  });

  it('2. jobs-only (no un-started) → cards reflect jobs-only values (pre-Shape-α regression)', async () => {
    todayResponse.data = [makeJob({ id: 'job-A', services: [{ id: 's1', name: 'Wash', price: 100 }] })];
    todayResponse.unstarted_appointments = [];
    renderQueue();
    const bar = await waitForSummaryBar();
    // Total = 1 job; unassigned = 0 (assigned_staff present); revenue = $100;
    // completed = 0 (status='in_progress'). The bar shows "1 job" not "1 jobs".
    expect(within(bar).getByText('1 job')).toBeTruthy();
    expect(within(bar).queryByText(/\d+ unassigned/)).toBeNull(); // hidden when 0
    expect(within(bar).getByText('$100.00')).toBeTruthy();
    expect(within(bar).getByText('0/1 complete')).toBeTruthy();
  });

  it('3. un-started-only (no jobs) → cards aggregate appointment values (Shape α visible)', async () => {
    // Pre-2.6 this scenario would show "0 jobs" — the bar would not even
    // render, because the visibility gate was `totalJobs > 0` and totalJobs
    // counted only jobs. Post-2.6 Shape α: un-started appointments contribute
    // to totalJobs, so the bar renders and reflects expected work.
    todayResponse.data = [];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', total_amount: 75, detailer: null }), // unassigned
      makeUnstartedRow({ id: 'apt-B', total_amount: 125, detailer: { id: 'e1', first_name: 'Sam', last_name: 'Staff' } }),
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    expect(within(bar).getByText('2 jobs')).toBeTruthy();
    expect(within(bar).getByText('1 unassigned')).toBeTruthy();
    expect(within(bar).getByText('$200.00')).toBeTruthy();
    expect(within(bar).getByText('0/2 complete')).toBeTruthy();
  });

  it('4. mixed jobs + un-started → cards sum across both arrays', async () => {
    todayResponse.data = [
      // 1 in_progress, assigned, $100
      makeJob({ id: 'job-A', status: 'in_progress', services: [{ id: 's1', name: 'Wash', price: 100 }] }),
      // 1 completed, assigned, $80 — contributes to completedCount
      makeJob({ id: 'job-B', status: 'completed', services: [{ id: 's1', name: 'Wash', price: 80 }] }),
      // 1 in_progress, UNASSIGNED, $50
      makeJob({ id: 'job-C', status: 'in_progress', assigned_staff: null, services: [{ id: 's1', name: 'Wash', price: 50 }] }),
    ];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', total_amount: 75, detailer: null }), // unassigned
      makeUnstartedRow({ id: 'apt-B', total_amount: 125 }), // assigned by default
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    // totalJobs = 3 jobs + 2 unstarted = 5
    expect(within(bar).getByText('5 jobs')).toBeTruthy();
    // unassigned = 1 job (job-C) + 1 unstarted (apt-A) = 2
    expect(within(bar).getByText('2 unassigned')).toBeTruthy();
    // totalRevenue = $100 + $80 + $50 + $75 + $125 = $430
    expect(within(bar).getByText('$430.00')).toBeTruthy();
    // completedCount = 1 (job-B only) / total 5
    expect(within(bar).getByText('1/5 complete')).toBeTruthy();
  });

  it('5. cancelled job + cancelled un-started excluded from expected count', async () => {
    todayResponse.data = [
      makeJob({ id: 'job-A', status: 'in_progress', services: [{ id: 's1', name: 'Wash', price: 100 }] }),
      // cancelled job — excluded from all totals (pre-2.6 behavior preserved)
      makeJob({ id: 'job-X', status: 'cancelled', services: [{ id: 's1', name: 'Wash', price: 999 }] }),
    ];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', total_amount: 50 }),
      // cancelled appointment — excluded from Shape α expected count
      makeUnstartedRow({ id: 'apt-X', status: 'cancelled', total_amount: 999 }),
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    // 1 active job + 1 active unstarted = 2 expected
    expect(within(bar).getByText('2 jobs')).toBeTruthy();
    // Neither cancelled $999 contributes to revenue
    expect(within(bar).getByText('$150.00')).toBeTruthy();
  });

  it('6. no_show un-started appointment excluded from expected count', async () => {
    // no_show is appointment-side terminal (no jobs.status equivalent). Same
    // semantic as cancelled: "didn't / won't happen" → excluded from expected.
    todayResponse.data = [];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', total_amount: 100 }),
      makeUnstartedRow({ id: 'apt-X', status: 'no_show', total_amount: 999 }),
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    expect(within(bar).getByText('1 job')).toBeTruthy();
    expect(within(bar).getByText('$100.00')).toBeTruthy();
  });

  it('7. completed un-started appointment INCLUDED in expected (active-or-done)', async () => {
    // Post-Session-2.4 include_terminal=on can surface `status='completed'`
    // appointments. Per the Shape α semantic, completed work counts as
    // expected work that day (it happened — just no job materialized). Mirrors
    // the jobs side where `status='completed'` jobs ARE in nonCancelled.
    todayResponse.data = [];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', status: 'completed', total_amount: 200 }),
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    expect(within(bar).getByText('1 job')).toBeTruthy();
    expect(within(bar).getByText('$200.00')).toBeTruthy();
  });

  it('8. completedCount stays jobs-only (un-started never contributes)', async () => {
    // Even when 5 un-started appointments are present, completedCount only
    // tracks jobs with status in {completed, closed}. Regression-locks the
    // intentional "completedCount semantic is operational, not expected"
    // per the prompt's Phase 0.3 F.1 LOCKED Shape α table.
    todayResponse.data = [
      makeJob({ id: 'job-A', status: 'completed', services: [{ id: 's1', name: 'Wash', price: 80 }] }),
    ];
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A', total_amount: 50 }),
      makeUnstartedRow({ id: 'apt-B', total_amount: 50 }),
      makeUnstartedRow({ id: 'apt-C', total_amount: 50 }),
      makeUnstartedRow({ id: 'apt-D', total_amount: 50 }),
      makeUnstartedRow({ id: 'apt-E', total_amount: 50 }),
    ];
    renderQueue();
    const bar = await waitForSummaryBar();
    // 1 job + 5 unstarted = 6 total; 1 completed (jobs-only)
    expect(within(bar).getByText('6 jobs')).toBeTruthy();
    expect(within(bar).getByText('1/6 complete')).toBeTruthy();
  });
});
