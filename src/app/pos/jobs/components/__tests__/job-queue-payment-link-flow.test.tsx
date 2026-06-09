import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ── Session #145 fix-forward — strip's Send Payment Link two-step modal chain ─
// Regression class locked by commit c209a709's broken-flow correction.
//
// THE BUG (pre-fix): the outer `{stripPaymentLinkTarget && (<>...</>)}` gate
// in JobQueue wrapped BOTH PaymentLinkAmountModal AND SendPaymentLinkDialog.
// `PaymentLinkAmountModal.handleContinue` fires `onOpenChange(false)` BEFORE
// `onContinue(chosen)` (modal source, lines 96-103). JobQueue's
// onOpenChange handler — pre-fix — cleared `stripPaymentLinkTarget` when
// the amount modal closed AND `stripLinkDialogOpen` was still false (the
// next-statement update hadn't yet flipped it true). Result: the gate
// went false during the synchronous Continue handler, unmounting both
// modals. The channel picker never mounted; the operator saw the amount
// modal disappear with nothing replacing it.
//
// THE FIX: don't clear `stripPaymentLinkTarget` in the amount modal's
// onOpenChange handler. Final cleanup is owned by
// `closeStripPaymentLinkFlow` on successful send (via SendPaymentLinkDialog
// onSent + stripPaymentLinkSentRef). Mirrors JobDetail's structural
// pattern (outer gate is `{job.appointment_id && ...}` — stable across
// the lifecycle).
//
// THE TEST (this file): mounts JobQueue with a populated unstarted
// appointment, taps the Send Link pill, picks an amount, clicks Continue,
// and asserts the channel picker mounts in the SAME continuous flow
// without an intermediate unmount. Locks the regression at integration
// level — unit tests on each modal in isolation didn't catch this
// composition bug.

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
  usePosAuth: () => ({
    employee: { first_name: 'Pat', bookable_for_appointments: false, role: 'detailer' },
  }),
}));

vi.mock('../../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: true, loading: false }),
}));

vi.mock('@/lib/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ enabled: false, loading: false }),
}));

vi.mock('../job-timeline', () => ({
  JobTimeline: () => <div data-testid="job-timeline-stub" />,
}));

// The AppointmentDetailDialog is heavy; stub it for this test. The strip's
// Send Link pill flow is what we're exercising, not the dialog footer's
// Send Link button. (The two share the same downstream state slots; fixing
// one fixes both, but the test should isolate the strip flow.)
vi.mock('@/app/admin/appointments/components/appointment-detail-dialog', () => ({
  AppointmentDetailDialog: () => null,
}));

vi.mock('@/app/pos/components/appointments/cancel-appointment-dialog', () => ({
  CancelAppointmentDialog: () => null,
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const APPT_ID = 'apt-ian-austria';
const APPOINTMENT_FETCH_BODY = {
  data: {
    id: APPT_ID,
    status: 'confirmed',
    scheduled_date: '2026-06-10',
    scheduled_start_time: '08:00:00',
    scheduled_end_time: '15:00:00',
    employee_id: null,
    total_amount: 535,
    deposit_amount: null,
    channel: 'customer_accept',
    payment_status: 'unpaid',
    customer: {
      id: 'c-ian',
      first_name: 'Ian',
      last_name: 'Austria',
      phone: '+18583355004',
      email: 'iaustria77@example.com',
    },
    vehicle: {
      id: 'v-ian',
      year: 2022,
      make: 'Tesla',
      model: 'Model X',
      color: 'Red',
      size_class: 'suv_3row_van',
    },
    employee: null,
    appointment_services: [],
    has_active_job: false,
  },
};

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (url.match(/\/api\/pos\/jobs(\?|$)/) && !url.includes('start-intake')) {
      return { ok: true, json: async () => todayResponse };
    }
    if (url.match(new RegExp(`/api/pos/appointments/${APPT_ID}$`))) {
      return { ok: true, json: async () => APPOINTMENT_FETCH_BODY };
    }
    if (url.match(/\/api\/pos\/staff\/available/)) {
      return { ok: true, json: async () => ({ data: [] }) };
    }
    if (url.match(/\/api\/pos\/appointments\/.+\/send-payment-link/)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          channels: { sms: 'sent' },
          payment_link_token: 'test-token',
          pay_url: 'https://example.com/pay/test-token',
        }),
      };
    }
    return { ok: false, status: 500, json: async () => ({ error: 'no mock for ' + url }) };
  }),
}));

import { JobQueue } from '../job-queue';

const noop = vi.fn();

function makeUnstartedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPT_ID,
    scheduled_date: '2026-06-10',
    scheduled_start_time: '08:00:00',
    scheduled_end_time: '15:00:00',
    status: 'confirmed',
    channel: 'customer_accept',
    payment_status: 'unpaid',
    customer: {
      id: 'c-ian',
      first_name: 'Ian',
      last_name: 'Austria',
      phone: '+18583355004',
      email: 'iaustria77@example.com',
    },
    vehicle: { id: 'v-ian', year: 2022, make: 'Tesla', model: 'Model X', color: 'Red' },
    detailer: null,
    appointment_services: [
      {
        id: 'as1',
        service_id: 's1',
        price_at_booking: 535,
        tier_name: null,
        quantity: 1,
        service: { id: 's1', name: 'Signature Complete Detail' },
      },
    ],
    total_amount: 535,
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
  localStorage.setItem('pos-jobs-view', 'list');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Helpers for the modal/strip disambiguation. The strip card's Cancel + Send
// Link pills are also buttons with the accessible names "Cancel" / "Send Link"
// (the visible-only-at-sm-breakpoint span text is in the DOM regardless of the
// `hidden sm:inline` class — jsdom does not honor display-rule visibility).
// Both modals (PaymentLinkAmountModal + SendPaymentLinkDialog's underlying
// SendMethodDialog) carry the same title "Send Payment Link". The reliable
// disambiguators are the Continue button (amount modal only) and the channel
// option text "SMS (with PDF)" (SendMethodDialog only — PaymentLinkAmountModal
// never renders this).

function amountModalIsOpen(): boolean {
  return screen.queryByRole('button', { name: 'Continue' }) !== null;
}

function channelPickerIsOpen(): boolean {
  return screen.queryByText('SMS (with PDF)') !== null;
}

function clickAmountModalCancel() {
  // Modal's Cancel renders AFTER the strip card's Cancel pill in DOM order
  // (modal is mounted after the queue list). The last "Cancel" button is the
  // modal's. If the modal isn't open, getAllByRole returns only the pill.
  const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
  fireEvent.click(cancelButtons[cancelButtons.length - 1]);
}

describe('JobQueue — strip Send Payment Link flow (Session #145 fix-forward regression-lock)', () => {
  it('Continue in amount modal opens the channel picker WITHOUT a second tap (no intermediate unmount)', async () => {
    todayResponse.unstarted_appointments = [makeUnstartedRow()];

    render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);

    const sendLinkBtn = await waitFor(() =>
      screen.getByTestId(`send-payment-link-btn-${APPT_ID}`)
    );

    // Tap the green Send Link pill → fetches PosAppointment → mounts amount modal.
    fireEvent.click(sendLinkBtn);

    // Amount modal mount.
    await waitFor(() => expect(amountModalIsOpen()).toBe(true));

    // Sanity pre-condition: channel picker is NOT yet mounted.
    expect(channelPickerIsOpen()).toBe(false);

    // Pick "Full balance" then click Continue.
    fireEvent.click(screen.getByText('Full balance'));
    const continueBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Continue' });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
      return btn;
    });
    fireEvent.click(continueBtn);

    // THE CRITICAL INVARIANT (Session #145 fix-forward regression-lock):
    // Channel picker mounts in the same continuous flow without intermediate
    // unmount. Pre-fix this assertion failed because the outer gate cleared
    // stripPaymentLinkTarget during the Continue transition, unmounting BOTH
    // modals.
    await waitFor(() => expect(channelPickerIsOpen()).toBe(true));

    // And the amount modal is no longer mounted (Continue button is gone).
    expect(amountModalIsOpen()).toBe(false);
  });

  it('amount modal Cancel button does NOT mount the channel picker (cancel-path is safe)', async () => {
    todayResponse.unstarted_appointments = [makeUnstartedRow()];

    render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);

    const sendLinkBtn = await waitFor(() =>
      screen.getByTestId(`send-payment-link-btn-${APPT_ID}`)
    );
    fireEvent.click(sendLinkBtn);

    await waitFor(() => expect(amountModalIsOpen()).toBe(true));

    clickAmountModalCancel();
    await waitFor(() => expect(amountModalIsOpen()).toBe(false));

    // No channel picker mounted (we never clicked Continue).
    expect(channelPickerIsOpen()).toBe(false);
  });

  it('re-tapping Send Link after a cancel re-opens the amount modal fresh (no stale-target side effect)', async () => {
    todayResponse.unstarted_appointments = [makeUnstartedRow()];

    render(<JobQueue onNewWalkIn={noop} onSelectJob={noop} onCheckout={noop} />);

    const sendLinkBtn = await waitFor(() =>
      screen.getByTestId(`send-payment-link-btn-${APPT_ID}`)
    );

    // First tap → amount modal opens.
    fireEvent.click(sendLinkBtn);
    await waitFor(() => expect(amountModalIsOpen()).toBe(true));

    // Cancel.
    clickAmountModalCancel();
    await waitFor(() => expect(amountModalIsOpen()).toBe(false));

    // Second tap → amount modal opens fresh. Lingering target on the
    // JobQueue's stripPaymentLinkTarget slot is harmless; the re-tap
    // overwrites it via handleStripSendLinkTap. (Documented in the fix
    // comment as "no visible side effect since both modals are gated on
    // their own open props".)
    fireEvent.click(sendLinkBtn);
    await waitFor(() => expect(amountModalIsOpen()).toBe(true));
  });
});
