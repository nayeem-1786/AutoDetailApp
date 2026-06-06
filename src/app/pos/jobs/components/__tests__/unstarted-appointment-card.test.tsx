import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ── Session 2.2 (AC-3 second half) — UnstartedAppointmentCard ───────────────
// Renders the appointment + Start Intake button; handles 422 future_date by
// surfacing the "Move to today and start?" popup (defense-in-depth path: the
// Today endpoint already filters to today's date, but the popup wires the
// PATCH-date + retry affordance for race cases).

const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
const fetchResponses: Array<{
  match: RegExp | string;
  method?: string;
  ok: boolean;
  status: number;
  body: unknown;
}> = [];

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const method = init?.method ?? 'GET';
    for (const r of fetchResponses) {
      const urlMatch = typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url);
      if (!urlMatch) continue;
      if (r.method && r.method !== method) continue;
      return {
        ok: r.ok,
        status: r.status,
        json: async () => r.body,
      };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
  }),
}));

const toastSpies = {
  success: vi.fn(),
  error: vi.fn(),
};
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSpies.success(...args),
    error: (...args: unknown[]) => toastSpies.error(...args),
    info: vi.fn(),
  },
}));

import { UnstartedAppointmentCard } from '../unstarted-appointment-card';
import type { PosUnstartedAppointment } from '../schedule-types';

const onMaterialized = vi.fn();

function makeAppt(overrides: Partial<PosUnstartedAppointment> = {}): PosUnstartedAppointment {
  return {
    id: 'apt-1',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '14:30:00',
    scheduled_end_time: '15:30:00',
    status: 'confirmed',
    channel: 'online',
    customer: { id: 'c1', first_name: 'Jane', last_name: 'Doe', phone: null, email: null },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    detailer: { id: 'e1', first_name: 'Pat', last_name: 'Cashier' },
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 120, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
    total_amount: 120,
    deposit_amount: 50,
    scope: 'today_unstarted',
    ...overrides,
  };
}

beforeEach(() => {
  fetchCalls.length = 0;
  fetchResponses.length = 0;
  onMaterialized.mockReset();
  toastSpies.success.mockReset();
  toastSpies.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UnstartedAppointmentCard — rendering', () => {
  it('renders customer, vehicle, services, time, and the Start Intake button', () => {
    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText(/Red 2022 Honda Civic/i)).toBeTruthy();
    expect(screen.getByText('Wash')).toBeTruthy();
    expect(screen.getByText(/2:30 PM/)).toBeTruthy();
    expect(screen.getByText(/Start Intake/i)).toBeTruthy();
  });

  it('renders the "Not Started" badge', () => {
    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    expect(screen.getByText('Not Started')).toBeTruthy();
  });

  it('renders the assigned detailer line when populated', () => {
    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    expect(screen.getByText(/Assigned: Pat Cashier/)).toBeTruthy();
  });

  it('omits the detailer line when null (unassigned)', () => {
    render(
      <UnstartedAppointmentCard
        appointment={makeAppt({ detailer: null })}
        onMaterialized={onMaterialized}
      />
    );
    expect(screen.queryByText(/Assigned:/)).toBeNull();
  });
});

describe('UnstartedAppointmentCard — Start Intake happy path', () => {
  it('POSTs to /api/pos/jobs/start-intake with the appointment_id and triggers onMaterialized on 201', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 201,
      body: { job_id: 'job-new', appointment_id: 'apt-1', already_materialized: false },
    });

    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(onMaterialized).toHaveBeenCalledTimes(1));
    expect(toastSpies.success).toHaveBeenCalledWith('Intake started');
    const call = fetchCalls.find((c) => c.url.includes('/start-intake'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ appointment_id: 'apt-1' });
  });
});

describe('UnstartedAppointmentCard — 422 future_date popup', () => {
  it('opens the popup when the endpoint returns 422 future_date', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });

    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());
    expect(screen.getByText(/scheduled for 2026-06-01/)).toBeTruthy();
    expect(onMaterialized).not.toHaveBeenCalled();
  });

  it('Cancel button closes the popup without action', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });

    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());

    fireEvent.click(screen.getByTestId('future-date-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('future-date-prompt')).toBeNull());

    expect(onMaterialized).not.toHaveBeenCalled();
    // Only the initial start-intake call was made; no PATCH, no retry.
    expect(fetchCalls.filter((c) => /\/start-intake$/.test(c.url))).toHaveLength(1);
    expect(fetchCalls.filter((c) => /\/api\/pos\/appointments\/apt-1$/.test(c.url))).toHaveLength(0);
  });

  it('Confirm button PATCHes the appointment date and retries Start Intake', async () => {
    // First start-intake: 422 future_date (queued for first call)
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });
    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());

    // Swap responses for the retry path: PATCH OK, second start-intake OK.
    fetchResponses.length = 0;
    fetchResponses.push({
      match: /\/api\/pos\/appointments\/apt-1$/,
      method: 'PATCH',
      ok: true,
      status: 200,
      body: { data: { id: 'apt-1' } },
    });
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 201,
      body: { job_id: 'job-new', appointment_id: 'apt-1', already_materialized: false },
    });

    fireEvent.click(screen.getByTestId('future-date-prompt-confirm'));
    await waitFor(() => expect(onMaterialized).toHaveBeenCalledTimes(1));

    const patchCall = fetchCalls.find(
      (c) => /\/api\/pos\/appointments\/apt-1$/.test(c.url) && c.init?.method === 'PATCH'
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(String(patchCall?.init?.body)) as { scheduled_date: string };
    expect(patchBody.scheduled_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(toastSpies.success).toHaveBeenCalledWith('Moved to today + intake started');
  });

  it('Confirm path shows error toast when PATCH fails (no retry attempted)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });
    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());

    fetchResponses.length = 0;
    fetchResponses.push({
      match: /\/api\/pos\/appointments\/apt-1$/,
      method: 'PATCH',
      ok: false,
      status: 409,
      body: { error: 'overlap detected' },
    });

    fireEvent.click(screen.getByTestId('future-date-prompt-confirm'));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(onMaterialized).not.toHaveBeenCalled();
    // No retry start-intake call.
    expect(fetchCalls.filter((c) => /\/start-intake$/.test(c.url))).toHaveLength(1);
  });
});

describe('UnstartedAppointmentCard — 422 invalid_status path', () => {
  it('shows specific error toast and does NOT open the future-date popup', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'invalid_status', appointment_status: 'pending' },
    });

    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(toastSpies.error.mock.calls[0][0]).toMatch(/pending/);
    expect(screen.queryByTestId('future-date-prompt')).toBeNull();
    expect(onMaterialized).not.toHaveBeenCalled();
  });
});

describe('UnstartedAppointmentCard — generic 500 path', () => {
  it('shows a generic error toast and does not open the popup', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 500,
      body: { error: 'unknown' },
    });

    render(<UnstartedAppointmentCard appointment={makeAppt()} onMaterialized={onMaterialized} />);
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(screen.queryByTestId('future-date-prompt')).toBeNull();
    expect(onMaterialized).not.toHaveBeenCalled();
  });
});
