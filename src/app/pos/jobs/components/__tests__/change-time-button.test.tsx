import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const permissionState = { granted: true, loading: false };
const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
const fetchResponses: Record<
  string,
  { ok: boolean; status?: number; json: () => Promise<unknown> }
> = {};

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => permissionState,
}));

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const resp = fetchResponses[url];
    if (!resp) {
      return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
    }
    return resp;
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Render-the-dialog spy. We don't actually render the full dialog (it pulls
// in Dialog primitives + sonner) — we just confirm the entry path invokes it
// with the joined appointment payload.
const dialogRenderSpy = vi.fn();
vi.mock('../../../components/appointments/reschedule-appointment-dialog', () => ({
  RescheduleAppointmentDialog: (props: Record<string, unknown>) => {
    dialogRenderSpy(props);
    return <div data-testid="reschedule-dialog-open" />;
  },
}));

import { ChangeTimeButton } from '../change-time-button';

const APPT_FIXTURE = {
  id: 'appt-1',
  scheduled_date: '2026-05-16',
  scheduled_start_time: '10:00:00',
  scheduled_end_time: '11:00:00',
  employee_id: null,
  customer: {
    id: 'c-1',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: null,
    email: null,
  },
  vehicle: null,
  employee: null,
  appointment_services: [],
};

const STAFF_FIXTURE = [
  {
    id: 'emp-1',
    first_name: 'Pat',
    last_name: 'Cashier',
    role: 'cashier',
    job_count_today: 0,
    is_busy: false,
  },
];

beforeEach(() => {
  permissionState.granted = true;
  permissionState.loading = false;
  fetchCalls.length = 0;
  for (const key of Object.keys(fetchResponses)) delete fetchResponses[key];
  fetchResponses['/api/pos/appointments/appt-1'] = {
    ok: true,
    json: async () => ({ data: APPT_FIXTURE }),
  };
  fetchResponses['/api/pos/staff/available'] = {
    ok: true,
    json: async () => ({ data: STAFF_FIXTURE }),
  };
  dialogRenderSpy.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ChangeTimeButton — guard logic', () => {
  it('renders for scheduled status with permission and appointment_id', () => {
    render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="scheduled"
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Change Time/i })).toBeTruthy();
  });

  it('renders for intake status', () => {
    render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="intake"
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Change Time/i })).toBeTruthy();
  });

  it('renders for in_progress status', () => {
    render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="in_progress"
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Change Time/i })).toBeTruthy();
  });

  it('hides for completed status', () => {
    const { container } = render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="completed"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides for closed status', () => {
    const { container } = render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="closed"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides for cancelled status', () => {
    const { container } = render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="cancelled"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides for pending_approval status', () => {
    const { container } = render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="pending_approval"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides when user lacks appointments.reschedule permission', () => {
    permissionState.granted = false;
    const { container } = render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="scheduled"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides when job has no appointment_id', () => {
    const { container } = render(
      <ChangeTimeButton
        appointmentId={null}
        jobStatus="scheduled"
        onSaved={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('ChangeTimeButton — entry path', () => {
  it('opens the reschedule dialog with the fetched appointment + staff on click', async () => {
    render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="scheduled"
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Change Time/i }));

    // Both endpoints fetched in parallel.
    await waitFor(() => {
      expect(
        fetchCalls.find((c) => c.url === '/api/pos/appointments/appt-1')
      ).toBeTruthy();
      expect(
        fetchCalls.find((c) => c.url === '/api/pos/staff/available')
      ).toBeTruthy();
    });

    // Dialog renders with the fetched appointment + staff list.
    await waitFor(() => {
      expect(screen.getByTestId('reschedule-dialog-open')).toBeTruthy();
    });

    const lastCall = dialogRenderSpy.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(lastCall.appointment).toEqual(APPT_FIXTURE);
    expect(lastCall.staff).toEqual(STAFF_FIXTURE);
    expect(lastCall.open).toBe(true);
  });

  it('shows a toast and does NOT open the dialog when appointment fetch fails', async () => {
    fetchResponses['/api/pos/appointments/appt-1'] = {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Appointment not found' }),
    };

    const { toast } = await import('sonner');

    render(
      <ChangeTimeButton
        appointmentId="appt-1"
        jobStatus="scheduled"
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Change Time/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Appointment not found');
    });

    expect(screen.queryByTestId('reschedule-dialog-open')).toBeNull();
  });
});
