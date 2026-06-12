import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// ── Session 2.2 (AC-3 second half) — UnstartedAppointmentCard ───────────────
// Renders the appointment + Start Intake button; handles 422 future_date by
// surfacing the "Move to today and start?" popup (defense-in-depth path: the
// Today endpoint already filters to today's date, but the popup wires the
// PATCH-date + retry affordance for race cases).
//
// Session #145 (Ian-Austria-unblock) extended this card from a single-pill
// footer ("Start Intake") to a three-pill row [Cancel] [Send Link] [Start
// Intake] plus card-body tap → AppointmentDetailDialog. The tests below also
// pin those new affordances (Gap A onMaterialized(jobId), canSendPaymentLink
// gating, event.stopPropagation correctness) so a regression in any pill
// surfaces here as a unit-level failure before it reaches the operator.

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
const onSendPaymentLink = vi.fn();
const onCancelAppointment = vi.fn();
const onTapCardBody = vi.fn();

function makeAppt(overrides: Partial<PosUnstartedAppointment> = {}): PosUnstartedAppointment {
  return {
    id: 'apt-1',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '14:30:00',
    scheduled_end_time: '15:30:00',
    status: 'confirmed',
    channel: 'online',
    payment_status: 'unpaid',
    customer: {
      id: 'c1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+13105551212',
      email: 'jane@example.com',
    },
    vehicle: { id: 'v1', year: 2022, make: 'Honda', model: 'Civic', color: 'Red' },
    detailer: { id: 'e1', first_name: 'Pat', last_name: 'Cashier' },
    appointment_services: [
      { id: 'as1', service_id: 's1', price_at_booking: 120, tier_name: null, quantity: 1, service: { id: 's1', name: 'Wash' } },
    ],
    total_amount: 120,
    deposit_amount: 50,
    // Session #149 (Item 3) — new required fields on PosUnstartedAppointment
    // for the PaymentLinkAmountModal inline advisory. Default to null
    // (no prior link cycle consumed) so the existing tests' behavior is
    // unchanged; tests that want to exercise the advisory pass overrides.
    payment_link_paid_at: null,
    payment_link_amount_cents: null,
    scope: 'today_unstarted',
    ...overrides,
  };
}

function renderCard(overrides: Partial<PosUnstartedAppointment> = {}) {
  return render(
    <UnstartedAppointmentCard
      appointment={makeAppt(overrides)}
      onMaterialized={onMaterialized}
      onSendPaymentLink={onSendPaymentLink}
      onCancelAppointment={onCancelAppointment}
      onTapCardBody={onTapCardBody}
    />
  );
}

beforeEach(() => {
  fetchCalls.length = 0;
  fetchResponses.length = 0;
  onMaterialized.mockReset();
  onSendPaymentLink.mockReset();
  onCancelAppointment.mockReset();
  onTapCardBody.mockReset();
  toastSpies.success.mockReset();
  toastSpies.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UnstartedAppointmentCard — rendering', () => {
  it('renders customer, vehicle, services, time, and the Start Intake button', () => {
    renderCard();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText(/Red 2022 Honda Civic/i)).toBeTruthy();
    expect(screen.getByText('Wash')).toBeTruthy();
    expect(screen.getByText(/2:30 PM/)).toBeTruthy();
    expect(screen.getByText(/Start Intake/i)).toBeTruthy();
  });

  it('renders the "Not Started" badge', () => {
    renderCard();
    expect(screen.getByText('Not Started')).toBeTruthy();
  });

  it('renders the assigned detailer line when populated', () => {
    renderCard();
    expect(screen.getByText(/Assigned: Pat Cashier/)).toBeTruthy();
  });

  it('omits the detailer line when null (unassigned)', () => {
    renderCard({ detailer: null });
    expect(screen.queryByText(/Assigned:/)).toBeNull();
  });
});

describe('UnstartedAppointmentCard — three-pill action row (Session #145)', () => {
  it('renders Cancel + Send Payment Link + Start Intake pills', () => {
    renderCard();
    expect(screen.getByTestId('cancel-appointment-btn-apt-1')).toBeTruthy();
    expect(screen.getByTestId('send-payment-link-btn-apt-1')).toBeTruthy();
    expect(screen.getByTestId('start-intake-btn-apt-1')).toBeTruthy();
  });

  it('hides Send Payment Link pill when canSendPaymentLink predicate is false (already paid)', () => {
    renderCard({ payment_status: 'paid' });
    expect(screen.queryByTestId('send-payment-link-btn-apt-1')).toBeNull();
    // Cancel + Start Intake still visible.
    expect(screen.getByTestId('cancel-appointment-btn-apt-1')).toBeTruthy();
    expect(screen.getByTestId('start-intake-btn-apt-1')).toBeTruthy();
  });

  it('hides Send Payment Link pill when customer has no contact channels', () => {
    renderCard({
      customer: {
        id: 'c1',
        first_name: 'Jane',
        last_name: 'Doe',
        phone: null,
        email: null,
      },
    });
    expect(screen.queryByTestId('send-payment-link-btn-apt-1')).toBeNull();
  });

  it('hides ALL three pills on terminal-status appointments (include-terminal toggle path)', () => {
    renderCard({ status: 'cancelled' });
    expect(screen.queryByTestId('cancel-appointment-btn-apt-1')).toBeNull();
    expect(screen.queryByTestId('send-payment-link-btn-apt-1')).toBeNull();
    expect(screen.queryByTestId('start-intake-btn-apt-1')).toBeNull();
  });

  it('Cancel pill click fires onCancelAppointment with the appointment id', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('cancel-appointment-btn-apt-1'));
    expect(onCancelAppointment).toHaveBeenCalledWith('apt-1');
    // Cancel click MUST NOT also trigger tap-card-body (stopPropagation).
    expect(onTapCardBody).not.toHaveBeenCalled();
  });

  it('Send Payment Link pill click fires onSendPaymentLink with the appointment id', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('send-payment-link-btn-apt-1'));
    expect(onSendPaymentLink).toHaveBeenCalledWith('apt-1');
    expect(onTapCardBody).not.toHaveBeenCalled();
  });

  it('Start Intake pill click does NOT also fire tap-card-body (stopPropagation)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 201,
      body: { job_id: 'job-new', appointment_id: 'apt-1', already_materialized: false },
    });
    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(onMaterialized).toHaveBeenCalled());
    expect(onTapCardBody).not.toHaveBeenCalled();
  });
});

describe('UnstartedAppointmentCard — tap-card-body → AppointmentDetailDialog', () => {
  it('clicking the card body (outside any pill) fires onTapCardBody', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('unstarted-appointment-card-apt-1'));
    expect(onTapCardBody).toHaveBeenCalledWith('apt-1');
  });

  it('Enter key on the card body fires onTapCardBody', () => {
    renderCard();
    const card = screen.getByTestId('unstarted-appointment-card-apt-1');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onTapCardBody).toHaveBeenCalledWith('apt-1');
  });

  it('does NOT fire onTapCardBody for a terminal-status appointment (card un-interactive)', () => {
    renderCard({ status: 'cancelled' });
    fireEvent.click(screen.getByTestId('unstarted-appointment-card-apt-1'));
    expect(onTapCardBody).not.toHaveBeenCalled();
  });
});

describe('UnstartedAppointmentCard — Gap A: Start Intake returns jobId', () => {
  it('POSTs to /api/pos/jobs/start-intake and calls onMaterialized WITH the job_id (Gap A)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 201,
      body: { job_id: 'job-new', appointment_id: 'apt-1', already_materialized: false },
    });

    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(onMaterialized).toHaveBeenCalledTimes(1));
    // Critical Gap A invariant: jobId is forwarded so the page can route to
    // JobDetail with autoStartIntake=true. Pre-#145 onMaterialized was zero-arg.
    expect(onMaterialized).toHaveBeenCalledWith('job-new');
    expect(toastSpies.success).toHaveBeenCalledWith('Intake started');
    const call = fetchCalls.find((c) => c.url.includes('/start-intake'));
    expect(call?.init?.method).toBe('POST');
    expect(JSON.parse(String(call?.init?.body))).toEqual({ appointment_id: 'apt-1' });
  });

  it('forwards the existing job_id when already_materialized=true (idempotent retap)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 200,
      body: { job_id: 'job-existing', appointment_id: 'apt-1', already_materialized: true },
    });

    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(onMaterialized).toHaveBeenCalled());
    // Idempotent retap navigates identically — operator lands at the same
    // jobId regardless of who won the materialize race.
    expect(onMaterialized).toHaveBeenCalledWith('job-existing');
  });

  it('does NOT call onMaterialized when the response is missing job_id (defensive)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: true,
      status: 201,
      body: { appointment_id: 'apt-1', already_materialized: false },
    });

    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(onMaterialized).not.toHaveBeenCalled();
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

    renderCard();
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

    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());

    fireEvent.click(screen.getByTestId('future-date-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('future-date-prompt')).toBeNull());

    expect(onMaterialized).not.toHaveBeenCalled();
    expect(fetchCalls.filter((c) => /\/start-intake$/.test(c.url))).toHaveLength(1);
    expect(fetchCalls.filter((c) => /\/api\/pos\/appointments\/apt-1$/.test(c.url))).toHaveLength(0);
  });

  it('Confirm button PATCHes the appointment date and retries Start Intake', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });
    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));
    await waitFor(() => expect(screen.getByTestId('future-date-prompt')).toBeTruthy());

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
    // Same Gap A invariant on the retry path — jobId forwarded.
    expect(onMaterialized).toHaveBeenCalledWith('job-new');
  });

  it('Confirm path shows error toast when PATCH fails (no retry attempted)', async () => {
    fetchResponses.push({
      match: '/api/pos/jobs/start-intake',
      method: 'POST',
      ok: false,
      status: 422,
      body: { error: 'future_date', appointment_date: '2026-06-01' },
    });
    renderCard();
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

    renderCard();
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

    renderCard();
    fireEvent.click(screen.getByTestId('start-intake-btn-apt-1'));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalled());
    expect(screen.queryByTestId('future-date-prompt')).toBeNull();
    expect(onMaterialized).not.toHaveBeenCalled();
  });
});
