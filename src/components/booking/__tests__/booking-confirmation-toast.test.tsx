/**
 * Path B Session 2 / Concern 2 (Session #141, 2026-06-02) — render
 * tests for the BookingConfirmation silent-save transparency toast.
 *
 * Locks the mount-effect's three-branch dispatch:
 *   (1) vehicleSaveAction.silently_saved + mobileAddressAction.silently_saved
 *       → ONE combined toast ("vehicle and address")
 *   (2) vehicleSaveAction.silently_saved only → vehicle toast (with "View →"
 *       action when isPortal=true)
 *   (3) mobileAddressAction.silently_saved only → Mobile-1.1's locked
 *       address toast (unchanged wording, no action button)
 *
 * Anti-regression coverage:
 *   - Two stacked toasts must NEVER fire (the combined message
 *     replaces them) — caught by asserting toast.success was called
 *     exactly once in the both-saved case.
 *   - Mobile-1.1's address-only wording is byte-stable — caught by
 *     a literal-string match (any future widening must update this
 *     test deliberately, not by accident).
 *   - Anonymous booking sessions (isPortal=false) do NOT receive a
 *     "View →" link — the link routes to /account/vehicles which
 *     requires auth; sending an anonymous customer to /signin from
 *     a confirmation page would be poor UX. Caught by checking
 *     `options.action` is undefined on the !isPortal path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BookingConfirmation } from '../booking-confirmation';

// ───────────────────────────────────────────────────────────────
// Mocks — sonner toast + canvas-confetti (BookingConfirmation
// triggers a 10-second confetti animation on mount which would
// pin the test event loop without this)
// ───────────────────────────────────────────────────────────────

const toastFns = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  default: vi.fn(),
};

vi.mock('sonner', () => {
  const toast = Object.assign(
    (msg: string, opts?: unknown) => toastFns.default(msg, opts),
    {
      success: (msg: string, opts?: unknown) => toastFns.success(msg, opts),
      error: (msg: string, opts?: unknown) => toastFns.error(msg, opts),
      info: (msg: string, opts?: unknown) => toastFns.info(msg, opts),
      warning: (msg: string, opts?: unknown) => toastFns.warning(msg, opts),
    },
  );
  return { toast };
});

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

// ───────────────────────────────────────────────────────────────
// Fixture
// ───────────────────────────────────────────────────────────────

const baseAppointment = {
  id: 'appt-1',
  date: '2026-06-10',
  start_time: '10:00',
  end_time: '11:00',
  total: 100,
};

beforeEach(() => {
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  toastFns.info.mockReset();
  toastFns.warning.mockReset();
  toastFns.default.mockReset();
});

afterEach(() => {
  cleanup();
});

// ───────────────────────────────────────────────────────────────
// Branch 1 — combined toast (both saves)
// ───────────────────────────────────────────────────────────────

describe('BookingConfirmation — toast: combined vehicle + address save', () => {
  it('fires ONE combined toast when both saves happened on the same booking', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={true}
        mobileAddress="123 Main St, Lomita, CA 90717"
        isPortal={true}
        mobileAddressAction={{
          diff: false,
          silently_saved: true,
          current_profile_address: null,
          entered_address: '123 Main St, Lomita, CA 90717',
          customer_id: 'cust-1',
        }}
        vehicleSaveAction={{
          silently_saved: true,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your vehicle and address to your account.",
      expect.objectContaining({
        action: expect.objectContaining({ label: 'View →' }),
      })
    );
  });

  it('combined toast OMITS the "View →" action on anonymous booking sessions (isPortal=false)', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={true}
        mobileAddress="123 Main St, Lomita, CA 90717"
        isPortal={false}
        mobileAddressAction={{
          diff: false,
          silently_saved: true,
          current_profile_address: null,
          entered_address: '123 Main St, Lomita, CA 90717',
          customer_id: 'cust-1',
        }}
        vehicleSaveAction={{
          silently_saved: true,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    // Anonymous session — no action arg, just the message.
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your vehicle and address to your account.",
      undefined
    );
  });
});

// ───────────────────────────────────────────────────────────────
// Branch 2 — vehicle-only toast
// ───────────────────────────────────────────────────────────────

describe('BookingConfirmation — toast: vehicle save only', () => {
  it('fires the vehicle-only toast when only vehicleSaveAction.silently_saved is true', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={false}
        isPortal={true}
        mobileAddressAction={null}
        vehicleSaveAction={{
          silently_saved: true,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your vehicle to your account.",
      expect.objectContaining({
        action: expect.objectContaining({ label: 'View →' }),
      })
    );
  });

  it('vehicle-only toast OMITS action on anonymous session', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={false}
        isPortal={false}
        mobileAddressAction={null}
        vehicleSaveAction={{
          silently_saved: true,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your vehicle to your account.",
      undefined
    );
  });

  it('vehicle-only toast also fires when mobileAddressAction is non-null but silently_saved=false (diff case)', () => {
    // Anti-regression: the address `diff=true, silently_saved=false`
    // path drives the inline banner, NOT a toast. If both action
    // objects are non-null but only vehicle's silently_saved is
    // true, we expect only the vehicle toast.
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={true}
        mobileAddress="999 Oak Rd"
        isPortal={true}
        mobileAddressAction={{
          diff: true,
          silently_saved: false,
          current_profile_address: '111 Existing Blvd',
          entered_address: '999 Oak Rd',
          customer_id: 'cust-1',
        }}
        vehicleSaveAction={{
          silently_saved: true,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your vehicle to your account.",
      expect.objectContaining({ action: expect.anything() })
    );
  });
});

// ───────────────────────────────────────────────────────────────
// Branch 3 — address-only toast (Mobile-1.1 wording lock)
// ───────────────────────────────────────────────────────────────

describe('BookingConfirmation — toast: address save only (Mobile-1.1 wording lock)', () => {
  it('fires the Mobile-1.1 address toast unchanged when only address save happened', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={true}
        mobileAddress="123 Main St"
        isPortal={true}
        mobileAddressAction={{
          diff: false,
          silently_saved: true,
          current_profile_address: null,
          entered_address: '123 Main St',
          customer_id: 'cust-1',
        }}
        vehicleSaveAction={null}
      />
    );

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    // Mobile-1.1 wording lock — byte-stable. The mock wrapper
    // forwards `(msg, opts)` so a single-arg `toast.success(msg)`
    // call surfaces here as `(msg, undefined)`. Locking the
    // explicit `undefined` is the byte-stability guard against an
    // accidental future addition of an action object on the
    // address-only branch.
    expect(toastFns.success).toHaveBeenCalledWith(
      "We've saved your address to your profile.",
      undefined
    );
  });
});

// ───────────────────────────────────────────────────────────────
// Branch 4 — neither (no toast)
// ───────────────────────────────────────────────────────────────

describe('BookingConfirmation — toast: neither save', () => {
  it('does NOT fire a toast when both actions are null', () => {
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={false}
        isPortal={true}
        mobileAddressAction={null}
        vehicleSaveAction={null}
      />
    );

    expect(toastFns.success).not.toHaveBeenCalled();
  });

  it('does NOT fire a toast when both silently_saved flags are false (matched-existing case)', () => {
    // Anti-regression for "vehicleSaveAction is non-null but
    // silently_saved=false." The helper's contract is to return
    // null when there's nothing to announce, so this should never
    // happen in production — but if a future caller emits a
    // populated false-flagged action, the effect must still no-op.
    render(
      <BookingConfirmation
        appointment={baseAppointment}
        serviceName="Express Wash"
        isMobile={true}
        mobileAddress="123 Main St"
        isPortal={true}
        mobileAddressAction={{
          diff: true,
          silently_saved: false,
          current_profile_address: '111 Existing',
          entered_address: '123 Main St',
          customer_id: 'cust-1',
        }}
        vehicleSaveAction={{
          silently_saved: false,
          vehicle_id: 'veh-1',
          customer_id: 'cust-1',
        }}
      />
    );

    expect(toastFns.success).not.toHaveBeenCalled();
  });
});
