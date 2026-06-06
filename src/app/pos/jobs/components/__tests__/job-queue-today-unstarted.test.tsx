import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// ── Session 2.2 (AC-3 second half) — Today scope un-started strip ──────────
// Verifies that JobQueue surfaces un-started appointments returned by the
// Today endpoint as a strip above the jobs view.

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
const todayResponse = {
  data: [] as unknown[],
  unstarted_appointments: [] as unknown[],
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  useRouter: () => ({ replace: vi.fn() }),
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

function makeUnstartedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'apt-1',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '14:30:00',
    scheduled_end_time: '15:30:00',
    status: 'confirmed',
    channel: 'online',
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    detailer: null,
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 120, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
    total_amount: 120,
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
  // Force list view so the strip renders above a deterministic content area.
  localStorage.setItem('pos-jobs-view', 'list');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('JobQueue — Today un-started strip (Session 2.2)', () => {
  it('does not render the strip when un-started array is empty', async () => {
    todayResponse.unstarted_appointments = [];
    renderQueue();
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true)
    );
    expect(screen.queryByTestId('unstarted-strip')).toBeNull();
  });

  it('renders the strip with one appointment card when un-started array has 1 row', async () => {
    todayResponse.unstarted_appointments = [makeUnstartedRow()];
    renderQueue();
    await waitFor(() => expect(screen.queryByTestId('unstarted-strip')).toBeTruthy());
    expect(screen.getByText('Not Started — Confirmed for today')).toBeTruthy();
    expect(screen.getByText('1 appointment')).toBeTruthy();
    expect(screen.getByTestId('unstarted-appointment-card-apt-1')).toBeTruthy();
    expect(screen.getByTestId('start-intake-btn-apt-1')).toBeTruthy();
  });

  it('renders multiple cards when multiple un-started appointments present', async () => {
    todayResponse.unstarted_appointments = [
      makeUnstartedRow({ id: 'apt-A' }),
      makeUnstartedRow({ id: 'apt-B' }),
      makeUnstartedRow({ id: 'apt-C' }),
    ];
    renderQueue();
    await waitFor(() => expect(screen.queryByTestId('unstarted-strip')).toBeTruthy());
    expect(screen.getByText('3 appointments')).toBeTruthy();
    expect(screen.getByTestId('unstarted-appointment-card-apt-A')).toBeTruthy();
    expect(screen.getByTestId('unstarted-appointment-card-apt-B')).toBeTruthy();
    expect(screen.getByTestId('unstarted-appointment-card-apt-C')).toBeTruthy();
  });

  it('passes the un-started field along even when the server omits it (backward compat default)', async () => {
    // Simulate an older server that returns only `data` — the client must
    // gracefully default the un-started array to [] without rendering the strip.
    todayResponse.data = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (todayResponse as any).unstarted_appointments;
    renderQueue();
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.match(/\/api\/pos\/jobs(\?|$)/))).toBe(true)
    );
    expect(screen.queryByTestId('unstarted-strip')).toBeNull();
    // Restore for subsequent tests' beforeEach reset.
    todayResponse.unstarted_appointments = [];
  });
});
