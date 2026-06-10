/**
 * Session #147 Commit B — CancelAppointmentDialog two-mode regression tests.
 *
 * Locks the four contract surfaces operator authorized in the Bug 1 design:
 *
 *   1. Mode A (amount_paid_cents === 0) renders chip group + fee field +
 *      notify toggle. Refund Pathway radiogroup is NOT rendered.
 *   2. Mode B (amount_paid_cents > 0) renders chip group + Refund Pathway
 *      radiogroup + fee field (refund branch) + notify toggle. Same chip
 *      set as Mode A — operator-muscle-memory parity.
 *   3. Mode A submit body STRICTLY OMITS the `pathway` field. Defense-in-
 *      depth: orchestrator defaults to 'refund' and resolves the no-payment
 *      case correctly, but the absence is structural.
 *   4. Mode B submit body INCLUDES the `pathway` field.
 *
 * Plus a source-text lock that the dialog imports CANCELLATION_REASONS
 * from the shared module — prevents a future refactor from re-introducing
 * a local const and silently drifting from job-detail's chip set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { CancelAppointmentDialog } from '../cancel-appointment-dialog';
import { posFetch } from '../../../lib/pos-fetch';
import type { PosAppointment } from '../types';

// ---------------------------------------------------------------------------
// posFetch mock — capture per-URL request bodies + return shape that the
// dialog consumer expects (cancel_result for the toast composition).
// ---------------------------------------------------------------------------

interface CapturedPost {
  url: string;
  body: Record<string, unknown>;
}
const captured: CapturedPost[] = [];

vi.mock('../../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.includes('cancellation-fee-default')) {
      return {
        ok: true,
        json: async () => ({ default_cents: 0 }),
      };
    }
    if (
      typeof url === 'string' &&
      url.includes('/cancel') &&
      init?.method === 'POST'
    ) {
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      captured.push({ url, body: body as Record<string, unknown> });
      return {
        ok: true,
        json: async () => ({
          data: { id: 'appt-1', status: 'cancelled' },
          cancel_result: {
            pathway: 'refund',
            amount_paid_cents: 0,
            refund_amount_cents: 0,
            cancellation_fee_cents: 0,
            job_cancelled: false,
          },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(posFetch).mockClear();
  captured.length = 0;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function makeAppointment(overrides: Partial<PosAppointment> = {}): PosAppointment {
  return {
    id: 'appt-1',
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    employee_id: null,
    service_id: null,
    scheduled_date: '2026-06-10',
    scheduled_start_time: '10:00',
    scheduled_end_time: '11:00',
    status: 'confirmed',
    payment_status: 'unpaid',
    total_amount: 100,
    cancellation_reason: null,
    cancellation_fee: null,
    notes: null,
    job_notes: null,
    internal_notes: null,
    created_at: '2026-06-09T00:00:00Z',
    updated_at: '2026-06-09T00:00:00Z',
    customer: {
      id: 'cust-1',
      first_name: 'Ian',
      last_name: 'Austria',
      phone: '+14244010094',
      email: 'ian@example.com',
    },
    vehicle: {
      id: 'veh-1',
      year: 2024,
      make: 'Toyota',
      model: 'Camry',
      color: 'Blue',
      size_class: 'sedan',
    },
    employee: null,
    appointment_services: [],
    amount_paid_cents: 0,
    ...overrides,
  } as PosAppointment;
}

async function renderAndWaitForDefaults(appointment: PosAppointment) {
  const onClose = vi.fn();
  const onCancelled = vi.fn();
  render(
    <CancelAppointmentDialog
      open
      appointment={appointment}
      onClose={onClose}
      onCancelled={onCancelled}
    />
  );
  // The dialog fires a posFetch for the default-fee on mount; wait for the
  // effect to settle so the input value is stable before assertions.
  await waitFor(() => {
    expect(vi.mocked(posFetch)).toHaveBeenCalledWith(
      expect.stringContaining('cancellation-fee-default')
    );
  });
  return { onClose, onCancelled };
}

// ---------------------------------------------------------------------------
// Mode A — amount_paid_cents === 0
// ---------------------------------------------------------------------------

describe('CancelAppointmentDialog — Mode A (amount_paid_cents === 0)', () => {
  it('renders the chip group + cancellation fee + notify toggle, BUT NOT the Refund Pathway radiogroup', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 0 }));

    // Chip group present — assert every canonical chip label is rendered
    // (single source of truth from @/lib/appointments/cancellation-reasons).
    expect(screen.getByText('Customer no-show')).toBeTruthy();
    expect(screen.getByText('Created by mistake')).toBeTruthy();
    expect(screen.getByText('Customer changed mind')).toBeTruthy();
    expect(screen.getByText('Schedule conflict')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();

    // Cancellation Fee field present (Mode A always renders it).
    expect(screen.getByLabelText(/Cancellation Fee/i)).toBeTruthy();

    // Notify toggle present.
    expect(
      screen.getByText(/Notify customer/i, { selector: 'span' })
    ).toBeTruthy();

    // Refund Pathway radiogroup MUST NOT render — the lone-mode UI test.
    expect(screen.queryByText('Refund (cash back via Stripe)')).toBeNull();
    expect(
      screen.queryByText('Customer Credit (apply to future visit)')
    ).toBeNull();
  });

  it('submit body STRICTLY OMITS the pathway field (defense-in-depth contract)', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 0 }));

    // Pick a chip + click Cancel Appointment.
    fireEvent.click(screen.getByLabelText('Customer no-show'));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Cancel Appointment/i })
      );
    });

    // Find the cancel POST.
    const cancelPost = captured.find((c) => c.url.includes('/cancel'));
    expect(cancelPost, 'cancel POST not found in captured requests').toBeTruthy();

    // The locked contract: Mode A body has NO `pathway` key whatsoever.
    // `pathway: undefined` would deserialize through JSON.stringify as
    // absent too, but the source contract is to never set the key in the
    // first place — the test asserts the stronger property.
    expect(
      Object.prototype.hasOwnProperty.call(cancelPost!.body, 'pathway'),
      'Mode A submit body must not contain a `pathway` key (orchestrator defaults to refund + amountPaidCents===0 branch handles it)'
    ).toBe(false);

    // Sanity check the rest of the body shape — Mode A still sends reason +
    // notify + fee, just not pathway.
    expect(cancelPost!.body.cancellation_reason).toBe('Customer no-show');
    expect(cancelPost!.body.notify_customer).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        cancelPost!.body,
        'cancellation_fee_cents'
      )
    ).toBe(true);
  });

  it('Other chip expands the textarea and gates submit on non-empty trimmed text', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 0 }));

    // Initially: no Other textarea visible.
    expect(screen.queryByPlaceholderText('Describe the reason...')).toBeNull();

    // Click Other.
    fireEvent.click(screen.getByLabelText('Other'));

    // Now the textarea renders.
    const textarea = screen.getByPlaceholderText('Describe the reason...');
    expect(textarea).toBeTruthy();

    // Cancel Appointment button is disabled (empty custom text).
    const submitBtn = screen.getByRole('button', {
      name: /Cancel Appointment/i,
    });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);

    // Type custom text → button enables.
    fireEvent.change(textarea, { target: { value: 'Operator dispatched' } });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    // Submit → body carries the trimmed custom text as cancellation_reason.
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    const cancelPost = captured.find((c) => c.url.includes('/cancel'));
    expect(cancelPost!.body.cancellation_reason).toBe('Operator dispatched');
  });
});

// ---------------------------------------------------------------------------
// Mode B — amount_paid_cents > 0
// ---------------------------------------------------------------------------

describe('CancelAppointmentDialog — Mode B (amount_paid_cents > 0)', () => {
  it('renders the chip group AND the Refund Pathway radiogroup', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 5000 }));

    // Chip group present — same chips, operator-muscle-memory parity.
    expect(screen.getByText('Customer no-show')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();

    // Refund Pathway radiogroup PRESENT (Mode B-only).
    expect(screen.getByText('Refund (cash back via Stripe)')).toBeTruthy();
    expect(
      screen.getByText('Customer Credit (apply to future visit)')
    ).toBeTruthy();
  });

  it('submit body INCLUDES the pathway field', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 5000 }));

    fireEvent.click(screen.getByLabelText('Schedule conflict'));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Cancel Appointment/i })
      );
    });

    const cancelPost = captured.find((c) => c.url.includes('/cancel'));
    expect(cancelPost).toBeTruthy();
    expect(
      Object.prototype.hasOwnProperty.call(cancelPost!.body, 'pathway')
    ).toBe(true);
    // Default pathway is 'refund'.
    expect(cancelPost!.body.pathway).toBe('refund');
    expect(cancelPost!.body.cancellation_reason).toBe('Schedule conflict');
  });

  it('selecting credit pathway hides the cancellation fee field', async () => {
    await renderAndWaitForDefaults(makeAppointment({ amount_paid_cents: 5000 }));

    // Initially fee field visible (refund is default pathway).
    expect(screen.getByLabelText(/Cancellation Fee/i)).toBeTruthy();

    // Switch to credit.
    fireEvent.click(screen.getByLabelText(/Customer Credit/i));

    // Fee field hidden on credit pathway (matches D.1 contract: credit holds
    // full paid amount, no fee deduction).
    expect(screen.queryByLabelText(/Cancellation Fee/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shared chip set source-text regression
// ---------------------------------------------------------------------------

describe('CancelAppointmentDialog — shared chip-set source-text lock', () => {
  it('the dialog source imports CANCELLATION_REASONS from the shared module (not a local const)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'cancel-appointment-dialog.tsx'),
      'utf-8'
    );

    // Asserting the import line is present. The full pattern matches the
    // shared module path; if anyone reintroduces a local const, the
    // import disappears AND the local const reappears — both surfaced
    // here.
    expect(source).toMatch(
      /import\s*{\s*[\s\S]*?CANCELLATION_REASONS[\s\S]*?}\s*from\s*['"]@\/lib\/appointments\/cancellation-reasons['"]/
    );
    // The local const declaration MUST NOT exist in the dialog source.
    // (It can legitimately appear in job-detail.tsx until that file's
    // import is verified separately — covered below.)
    expect(source).not.toMatch(/const\s+CANCELLATION_REASONS\s*=/);
  });

  it('job-detail.tsx ALSO imports CANCELLATION_REASONS from the shared module (single-source-of-truth lock)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'jobs',
        'components',
        'job-detail.tsx'
      ),
      'utf-8'
    );
    expect(source).toMatch(
      /import\s*{\s*CANCELLATION_REASONS\s*}\s*from\s*['"]@\/lib\/appointments\/cancellation-reasons['"]/
    );
    expect(source).not.toMatch(/const\s+CANCELLATION_REASONS\s*=/);
  });
});
