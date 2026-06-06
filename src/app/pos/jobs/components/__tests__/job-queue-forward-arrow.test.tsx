import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ── Session 2.3 — AC-8 forward-arrow routes to Schedule on today-crossing ──
// Verifies that:
//   - Forward arrow from today → router.push to Schedule with tomorrow
//     pinned as a single-day "Other" range; scope flips to schedule.
//   - Forward arrow from yesterday → setDate(today) within Today scope.
//   - Forward arrow from -3 days → setDate(-2 days) within Today scope.
//   - Back arrow behavior is unchanged.
//   - Flag OFF disables the AC-8 routing (forward stays in Today scope).
// See AC-8 in docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md.

// ─── Today computed at test boot from the same Intl.DateTimeFormat path ──
function getTodayPst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = getTodayPst();
const TOMORROW = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);
const MINUS_3 = addDays(TODAY, -3);
const MINUS_2 = addDays(TODAY, -2);

// ── Mocks ──────────────────────────────────────────────────────────────────
const flagState = { enabled: true };
const searchParamsState: Record<string, string | null> = { date: null };
const pushCalls: Array<[string, unknown]> = [];
const replaceCalls: Array<[string, unknown]> = [];

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (k: string) => searchParamsState[k] ?? null,
    toString: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(searchParamsState)) {
        if (v != null) params.set(k, v);
      }
      return params.toString();
    },
  }),
  useRouter: () => ({
    push: (url: string, opts?: unknown) => {
      pushCalls.push([url, opts]);
    },
    replace: (url: string, opts?: unknown) => {
      replaceCalls.push([url, opts]);
    },
  }),
}));

vi.mock('../../../context/pos-auth-context', () => ({
  usePosAuth: () => ({ employee: { first_name: 'Pat', bookable_for_appointments: false } }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('@/lib/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ enabled: flagState.enabled, loading: false }),
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
  posFetch: vi.fn(async (url: string) => {
    if (url.includes('/api/pos/jobs/populate')) {
      return { ok: true, json: async () => ({ data: { created: 0, jobs: [] } }) };
    }
    if (url.includes('/api/pos/jobs/schedule')) {
      return { ok: true, json: async () => ({ data: [] }) };
    }
    if (url.match(/\/api\/pos\/jobs(\?|$)/)) {
      return { ok: true, json: async () => ({ data: [], unstarted_appointments: [] }) };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function renderQueue() {
  return render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);
}

beforeEach(() => {
  flagState.enabled = true;
  searchParamsState.date = null;
  pushCalls.length = 0;
  replaceCalls.length = 0;
  localStorage.clear();
  localStorage.setItem('pos-jobs-view', 'list');
  // Start in Today scope so the date-nav chrome (incl. forward arrow) renders.
  localStorage.setItem('pos-jobs-scope', 'today');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('JobQueue — forward-arrow AC-8 routing (Session 2.3)', () => {
  it('1. forward from TODAY routes to Schedule scope with tomorrow pinned', async () => {
    renderQueue();
    await waitFor(() => expect(screen.getByLabelText('Next day')).toBeTruthy());

    // Baseline router.replace count from the N+2 schedule-filter mount effect
    // — AC-8's contract is "no NEW replace from the click," not "zero replaces
    // ever observed" (the schedule-filter URL persistence runs at mount).
    const replaceBaseline = replaceCalls.length;
    const pushBaseline = pushCalls.length;

    fireEvent.click(screen.getByLabelText('Next day'));

    // router.push is the AC-8 signal — the routing-on-cross uses push (not
    // replace) so browser back returns to Today scope.
    await waitFor(() => expect(pushCalls.length).toBe(pushBaseline + 1));
    const [url] = pushCalls[pushCalls.length - 1];
    expect(url).toContain('sched_pills=other');
    expect(url).toContain(`sched_from=${TOMORROW}`);
    expect(url).toContain(`sched_to=${TOMORROW}`);
    // The Today-only ?date= param is stripped, not preserved.
    expect(url).not.toContain('date=');
    // Scope flipped to schedule and persisted to localStorage.
    expect(localStorage.getItem('pos-jobs-scope')).toBe('schedule');
    // No additional router.replace fires for the AC-8 cross — push is the
    // only navigation primitive used by the routing branch.
    expect(replaceCalls.length).toBe(replaceBaseline);
  });

  it('2. forward from YESTERDAY navigates to TODAY within Today scope (no scope flip)', async () => {
    searchParamsState.date = YESTERDAY;
    renderQueue();
    await waitFor(() => expect(screen.getByLabelText('Next day')).toBeTruthy());

    const replaceBaseline = replaceCalls.length;
    const pushBaseline = pushCalls.length;

    fireEvent.click(screen.getByLabelText('Next day'));

    // setDate path uses router.replace; no router.push for in-Today nav.
    await waitFor(() => expect(replaceCalls.length).toBe(replaceBaseline + 1));
    expect(pushCalls.length).toBe(pushBaseline);
    // Today drops the ?date= param entirely.
    const [url] = replaceCalls[replaceCalls.length - 1];
    expect(url).not.toContain('date=');
    // Scope unchanged.
    expect(localStorage.getItem('pos-jobs-scope')).toBe('today');
  });

  it('3. forward from -3 days navigates to -2 days within Today scope (no scope flip)', async () => {
    searchParamsState.date = MINUS_3;
    renderQueue();
    await waitFor(() => expect(screen.getByLabelText('Next day')).toBeTruthy());

    const replaceBaseline = replaceCalls.length;
    const pushBaseline = pushCalls.length;

    fireEvent.click(screen.getByLabelText('Next day'));

    await waitFor(() => expect(replaceCalls.length).toBe(replaceBaseline + 1));
    expect(pushCalls.length).toBe(pushBaseline);
    const [url] = replaceCalls[replaceCalls.length - 1];
    expect(url).toContain(`date=${MINUS_2}`);
    expect(localStorage.getItem('pos-jobs-scope')).toBe('today');
  });

  it('4. back arrow from TODAY navigates to YESTERDAY within Today scope (unchanged)', async () => {
    renderQueue();
    await waitFor(() => expect(screen.getByLabelText('Previous day')).toBeTruthy());

    const replaceBaseline = replaceCalls.length;
    const pushBaseline = pushCalls.length;

    fireEvent.click(screen.getByLabelText('Previous day'));

    // Back arrow uses setDate → router.replace; never push.
    await waitFor(() => expect(replaceCalls.length).toBe(replaceBaseline + 1));
    expect(pushCalls.length).toBe(pushBaseline);
    const [url] = replaceCalls[replaceCalls.length - 1];
    expect(url).toContain(`date=${YESTERDAY}`);
    expect(localStorage.getItem('pos-jobs-scope')).toBe('today');
  });

  it('5. flag OFF — forward from TODAY stays in Today scope (legacy behavior, no AC-8 route)', async () => {
    flagState.enabled = false;
    renderQueue();
    await waitFor(() => expect(screen.getByLabelText('Next day')).toBeTruthy());

    const replaceBaseline = replaceCalls.length;
    const pushBaseline = pushCalls.length;

    fireEvent.click(screen.getByLabelText('Next day'));

    // No router.push — flag OFF disables the Schedule routing.
    await waitFor(() => expect(replaceCalls.length).toBe(replaceBaseline + 1));
    expect(pushCalls.length).toBe(pushBaseline);
    const [url] = replaceCalls[replaceCalls.length - 1];
    expect(url).toContain(`date=${TOMORROW}`);
    // Scope is structurally pinned to today when the flag is OFF anyway.
    expect(localStorage.getItem('pos-jobs-scope')).toBe('today');
  });
});
