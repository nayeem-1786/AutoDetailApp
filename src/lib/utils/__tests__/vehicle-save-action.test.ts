/**
 * Path B Session 2 / Concern 2 (Session #141, 2026-06-02) — unit tests
 * for the `resolveVehicleSaveAction` helper that synthesizes the
 * `vehicle_save_action` response surface returned by `/api/book`.
 *
 * Locks Q-PB-S2 LOCKED Option 1 (transparency-only): the helper
 * returns a non-null action ONLY when a fresh `vehicles` row was
 * just inserted during this booking AND there's a customer to link
 * it to. Matched-existing-vehicle and no-customer cases return null
 * — there's nothing new to announce to the customer.
 *
 * Sync helper (no Supabase mock needed) — unlike
 * `mobile-address-action.ts` which queries customers + may run an
 * UPDATE. The vehicle case's work is already done by
 * `findOrCreateVehicle` upstream; this helper just synthesizes the
 * response shape. See header on `src/lib/utils/vehicle-save-action.ts`
 * for the full architectural rationale + Mobile-1.1 precedent
 * reference.
 */

import { describe, it, expect } from 'vitest';
import { resolveVehicleSaveAction } from '../vehicle-save-action';

describe('resolveVehicleSaveAction — null cases', () => {
  it('returns null when vehicleCreated is false (matched existing vehicle)', () => {
    // The booking used a saved vehicle (matched via the unique
    // make/model dedup index). Customer already knew about it; no
    // announcement.
    const result = resolveVehicleSaveAction({
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      vehicleCreated: false,
    });
    expect(result).toBeNull();
  });

  it('returns null when customerId is null (no linkage)', () => {
    // Defensive — shouldn't happen on /api/book in practice
    // (anonymous bookings create a customer record first), but the
    // helper guards against future callers.
    const result = resolveVehicleSaveAction({
      customerId: null,
      vehicleId: 'veh-1',
      vehicleCreated: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when vehicleId is null (no vehicle resolved)', () => {
    // Booking without a vehicle (e.g., a service that doesn't require
    // one). vehicleCreated stays at its default false in practice, but
    // the explicit null guard means a future bug that leaves
    // vehicleCreated true with a missing id can't synthesize an
    // invalid action.
    const result = resolveVehicleSaveAction({
      customerId: 'cust-1',
      vehicleId: null,
      vehicleCreated: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when BOTH ids missing and vehicleCreated true (defensive)', () => {
    const result = resolveVehicleSaveAction({
      customerId: null,
      vehicleId: null,
      vehicleCreated: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when vehicleCreated is false even with both ids present', () => {
    // Anti-regression: the vehicleCreated flag is the primary
    // discriminant. Even if the route accidentally passes a
    // populated customerId + vehicleId after matching an existing
    // vehicle, the helper must still return null — matched-existing
    // means no announcement.
    const result = resolveVehicleSaveAction({
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      vehicleCreated: false,
    });
    expect(result).toBeNull();
  });
});

describe('resolveVehicleSaveAction — silently_saved case', () => {
  it('returns silently_saved action when a fresh vehicle was inserted + linked', () => {
    const result = resolveVehicleSaveAction({
      customerId: 'cust-1',
      vehicleId: 'veh-new-1',
      vehicleCreated: true,
    });
    expect(result).toEqual({
      silently_saved: true,
      vehicle_id: 'veh-new-1',
      customer_id: 'cust-1',
    });
  });

  it('echoes back the exact ids supplied (no transformation)', () => {
    // Anti-regression for any future "look up the canonical
    // customer/vehicle id" temptation. The helper is a pure
    // synthesizer; it passes ids through verbatim.
    const result = resolveVehicleSaveAction({
      customerId: '00000000-0000-0000-0000-000000000001',
      vehicleId: '00000000-0000-0000-0000-000000000002',
      vehicleCreated: true,
    });
    expect(result?.customer_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(result?.vehicle_id).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('always sets silently_saved=true on non-null result (discriminator contract)', () => {
    // Shape lock: the consumer's check shape is
    // `action?.silently_saved === true`. A non-null action must
    // always carry this flag as true — the null branch is the
    // "nothing to announce" signal, not a `{silently_saved: false}`
    // payload. Mirrors MobileAddressAction's contract where
    // silently_saved represents the first-time-save event.
    const result = resolveVehicleSaveAction({
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      vehicleCreated: true,
    });
    expect(result).not.toBeNull();
    expect(result!.silently_saved).toBe(true);
  });
});
