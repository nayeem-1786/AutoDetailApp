import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Mutable state for the usePosPermission mock so individual tests can flip
// the appointments.cancel grant.
const permState = {
  cancelGranted: true,
};

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: (key: string) => ({
    granted: key === 'appointments.cancel' ? permState.cancelGranted : true,
    loading: false,
  }),
}));

// Capture all posFetch calls so we can assert that the "This Month" preset
// fires a request with the correct end_date query param.
const posFetchCalls: Array<{ url: string; init?: RequestInit }> = [];

const sampleAppt = {
  id: 'appt-1',
  status: 'confirmed',
  scheduled_date: '2026-05-16',
  scheduled_start_time: '10:00:00',
  scheduled_end_time: '11:00:00',
  customer: { id: 'cust-1', first_name: 'Jane', last_name: 'Doe', phone: '+13105551212', email: null },
  vehicle: null,
  employee: null,
  appointment_services: [],
  employee_id: null,
};

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    posFetchCalls.push({ url, init });
    if (url.startsWith('/api/pos/appointments?')) {
      return { ok: true, json: async () => ({ data: [sampleAppt] }) };
    }
    if (url === '/api/pos/staff/available') {
      return { ok: true, json: async () => ({ data: [] }) };
    }
    return { ok: true, json: async () => ({ data: [] }) };
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Pin today to a known PST date so the "This Month" math is deterministic.
// Mid-May 2026 → endOfMonth = 2026-05-31.
vi.mock('@/lib/utils/pst-date', () => ({
  getTodayPst: () => '2026-05-16',
}));

import { AppointmentsView } from '../appointments-view';

beforeEach(() => {
  permState.cancelGranted = true;
  posFetchCalls.length = 0;
});

afterEach(() => {
  cleanup();
});

describe('AppointmentsView — Roadmap Item 15b', () => {
  it('renders "This Month" filter button between "Next 7 Days" and the Custom date inputs', async () => {
    render(<AppointmentsView />);

    const week = await screen.findByRole('button', { name: 'Next 7 Days' });
    const month = await screen.findByRole('button', { name: 'This Month' });
    expect(week).toBeTruthy();
    expect(month).toBeTruthy();

    // DOM order check: Next 7 Days appears before This Month.
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent);
    const weekIdx = buttons.indexOf('Next 7 Days');
    const monthIdx = buttons.indexOf('This Month');
    expect(weekIdx).toBeGreaterThanOrEqual(0);
    expect(monthIdx).toBeGreaterThan(weekIdx);
  });

  it('clicking "This Month" fires a list request with end_date = last calendar day of current PST month', async () => {
    render(<AppointmentsView />);

    // Wait for initial load.
    await waitFor(() => expect(posFetchCalls.length).toBeGreaterThan(0));
    posFetchCalls.length = 0;

    const month = await screen.findByRole('button', { name: 'This Month' });
    fireEvent.click(month);

    // The view re-runs loadAppointments when the date range changes.
    await waitFor(() => {
      const apptCall = posFetchCalls.find((c) => c.url.startsWith('/api/pos/appointments?'));
      expect(apptCall).toBeTruthy();
      expect(apptCall!.url).toContain('start_date=2026-05-16');
      // May has 31 days — endOfMonth math returns 2026-05-31.
      expect(apptCall!.url).toContain('end_date=2026-05-31');
    });
  });

  it('renders Cancel icon button on each row when appointments.cancel granted', async () => {
    permState.cancelGranted = true;
    render(<AppointmentsView />);

    const cancelBtn = await screen.findByRole('button', {
      name: /Cancel appointment for Jane Doe/,
    });
    expect(cancelBtn).toBeTruthy();
  });

  it('HIDES Cancel icon button when appointments.cancel denied (cashier role)', async () => {
    permState.cancelGranted = false;
    render(<AppointmentsView />);

    // Wait until the row has rendered (look for the row's reschedule button)
    await screen.findByRole('button', { name: /Edit appointment for Jane Doe/ });

    // The cancel button MUST be absent — Item 15b acceptance criterion
    // ("HIDDEN entirely for users without this permission, not just disabled").
    const cancelBtn = screen.queryByRole('button', {
      name: /Cancel appointment for Jane Doe/,
    });
    expect(cancelBtn).toBeNull();
  });
});
