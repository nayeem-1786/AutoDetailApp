import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ── Session #145 Q3 LOCKED Option (ii) — Edit Intake pill on regular card ──
// After the strip's Start Intake materializes a job, the strip card vanishes
// and the regular job card takes over. While the job sits at status='intake'
// with intake_completed_at NULL, the regular card surfaces an "Edit Intake"
// pill that routes to ZonePicker directly via `onOpenJobForIntake(jobId)` —
// the SAME parent callback the strip's Start Intake fires after a successful
// materialize. This closes the Option (ii) UX loop: strip → materialize →
// regular card carries the affordance forward → tap → ZonePicker.

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
    if (url.match(/\/api\/pos\/jobs(\?|$)/)) {
      return { ok: true, json: async () => todayResponse };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function renderQueue(overrides: { onOpenJobForIntake?: (jobId: string) => void } = {}) {
  return render(
    <JobQueue
      onNewWalkIn={noop}
      onSelectJob={noop}
      onCheckout={noop}
      onOpenJobForIntake={overrides.onOpenJobForIntake}
    />
  );
}

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    status: 'intake',
    appointment_id: 'apt-1',
    transaction_id: null,
    services: [{ id: 's1', name: 'Wash', price: 120 }],
    estimated_pickup_at: null,
    created_at: '2026-06-08T18:30:00Z',
    timer_seconds: 0,
    work_started_at: null,
    timer_paused_at: null,
    intake_completed_at: null,
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    assigned_staff: null,
    addons: [],
    appointment: { scheduled_start_time: '14:30:00' },
    photos: [],
    estimated_duration_minutes: 60,
    ...overrides,
  };
}

beforeEach(() => {
  fetchCalls.length = 0;
  todayResponse.data = [];
  todayResponse.unstarted_appointments = [];
  localStorage.clear();
  localStorage.setItem('pos-jobs-view', 'list');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('JobQueue — Edit Intake pill on regular job card (Session #145 Q3)', () => {
  it('renders Edit Intake pill on a status=intake job with intake_completed_at=null', async () => {
    todayResponse.data = [makeJobRow()];
    renderQueue({ onOpenJobForIntake: vi.fn() });
    await waitFor(() => {
      expect(screen.getByTestId('edit-intake-btn-job-1')).toBeTruthy();
    });
  });

  it('hides Edit Intake pill when intake_completed_at is non-null (intake done)', async () => {
    todayResponse.data = [
      makeJobRow({ intake_completed_at: '2026-06-08T19:00:00Z' }),
    ];
    renderQueue({ onOpenJobForIntake: vi.fn() });
    await waitFor(() => {
      expect(screen.queryByTestId('edit-intake-btn-job-1')).toBeNull();
    });
  });

  it('hides Edit Intake pill when job has moved past intake (status=in_progress)', async () => {
    todayResponse.data = [
      makeJobRow({ status: 'in_progress', work_started_at: '2026-06-08T18:35:00Z' }),
    ];
    renderQueue({ onOpenJobForIntake: vi.fn() });
    await waitFor(() => {
      expect(screen.queryByTestId('edit-intake-btn-job-1')).toBeNull();
    });
  });

  it('hides Edit Intake pill when onOpenJobForIntake is not wired (parent capability gate)', async () => {
    todayResponse.data = [makeJobRow()];
    renderQueue();
    // Wait for jobs to load.
    await waitFor(() => {
      expect(fetchCalls.some((c) => /\/api\/pos\/jobs(\?|$)/.test(c.url))).toBe(true);
    });
    expect(screen.queryByTestId('edit-intake-btn-job-1')).toBeNull();
  });

  it('clicking Edit Intake invokes onOpenJobForIntake with the job id (Q3 destination = ZonePicker via Gap A)', async () => {
    todayResponse.data = [makeJobRow()];
    const onOpenJobForIntake = vi.fn();
    renderQueue({ onOpenJobForIntake });
    await waitFor(() => {
      expect(screen.getByTestId('edit-intake-btn-job-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('edit-intake-btn-job-1'));
    expect(onOpenJobForIntake).toHaveBeenCalledWith('job-1');
  });

  it('clicking Edit Intake does NOT also invoke onSelectJob (event.stopPropagation pinned)', async () => {
    todayResponse.data = [makeJobRow()];
    const onSelectJob = vi.fn();
    const onOpenJobForIntake = vi.fn();
    render(
      <JobQueue
        onNewWalkIn={noop}
        onSelectJob={onSelectJob}
        onCheckout={noop}
        onOpenJobForIntake={onOpenJobForIntake}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('edit-intake-btn-job-1')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('edit-intake-btn-job-1'));
    expect(onOpenJobForIntake).toHaveBeenCalledWith('job-1');
    expect(onSelectJob).not.toHaveBeenCalled();
  });
});
