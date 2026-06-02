/**
 * Path B Session 2 / Concern 2 (Session #141, 2026-06-02) — server-side
 * helper that synthesizes the `vehicle_save_action` response surface for
 * `/api/book` (and any future caller). Mirrors the SHAPE of
 * `mobile-address-action.ts` (Phase Mobile-1.1) so the client can use
 * one consistent transparency pattern for two distinct silent-save
 * paths.
 *
 * **Concern 2 context (architectural audit, 709befa5):** logged-in
 * customers who add a NEW vehicle during booking ARE already persisted
 * to the `vehicles` table linked to their `customer_id` via
 * `findOrCreateVehicle` (`vehicle-helpers.ts`). The gap was transparency:
 * the customer was never told it happened, so the perception was "this
 * never persisted." Path B Session 2 closes that gap with a toast on
 * the booking confirmation page — Q-PB-S2 LOCKED Option 1
 * (transparency-only; no opt-out toggle, because `vehicles.customer_id`
 * is `NOT NULL` and the existing dedup index is scoped by customer_id,
 * so a "vehicle not linked to a customer" data path doesn't exist
 * without a schema migration which is out of scope).
 *
 * **Why mirror Mobile-1.1 (Memory #2):** the operator-locked precedent
 * for silent-save UX is already shipped for addresses. Using the same
 * shape on the response (`silently_saved: boolean`) + the same toast
 * library (sonner) + the same call site (`booking-confirmation.tsx`'s
 * mount-effect) means there's ONE transparency pattern across the two
 * cases, not two parallel approaches.
 *
 * **When to return non-null:** when `findOrCreateVehicle` returned
 * `created: true` (a fresh insert, customer didn't have this vehicle
 * before) AND there's a `customer_id` to link it to AND we have the
 * resulting `vehicle_id`. Anything else → `null` (the booking matched
 * an existing vehicle the customer already knows about, or there's no
 * customer to attribute the save to — the latter shouldn't happen on
 * `/api/book` because anonymous bookings create a customer record
 * first, but the guard keeps the helper safe for future callers).
 *
 * Sync (no DB calls) — unlike `resolveMobileAddressAction` which
 * queries customers + may run an UPDATE. The vehicle case's work is
 * already done by `findOrCreateVehicle` upstream; this helper just
 * synthesizes the response shape that the client reads. The
 * `_supabase` param is intentionally omitted from the signature here
 * — adding it for symmetry-of-shape would be cargo culting; the test
 * surface is cleaner without it.
 */

export interface VehicleSaveAction {
  /**
   * True when a new vehicle row was just created during this booking
   * and silently linked to the customer's account. Drives the
   * "We've saved your vehicle to your account" toast on the
   * confirmation page. Always `true` when this object is non-null —
   * the helper returns `null` for any case where there was nothing to
   * announce (matched existing vehicle, no customer, no vehicle).
   * Kept as a discriminator field so the consumer's check shape
   * mirrors `MobileAddressAction.silently_saved` exactly.
   */
  silently_saved: boolean;
  vehicle_id: string;
  customer_id: string;
}

interface ResolveVehicleSaveOpts {
  customerId: string | null;
  vehicleId: string | null;
  /**
   * True when `findOrCreateVehicle` returned `created: true` (fresh
   * insert), false when it matched an existing row via the
   * `idx_vehicles_customer_make_model` unique index. The booking
   * route already destructures this from `FindOrCreateVehicleResult`
   * so plumbing it down to this helper is free.
   */
  vehicleCreated: boolean;
}

/**
 * Pure synth function. Returns `null` when there's nothing to
 * surface to the customer (matched existing vehicle, no customer
 * linkage, or no vehicle resolved); returns a `VehicleSaveAction`
 * with `silently_saved: true` when a fresh vehicle row was just
 * created + linked to a customer.
 *
 * Symmetric with `resolveMobileAddressAction` in two ways:
 *  - Returns `null` for the "not applicable" case (vs returning a
 *    blank action object) so the consumer can early-out cheaply.
 *  - The non-null shape carries `customer_id` + the entity id so
 *    the consumer can build a "View" deep-link without re-querying.
 */
export function resolveVehicleSaveAction(
  opts: ResolveVehicleSaveOpts
): VehicleSaveAction | null {
  if (!opts.vehicleCreated) return null;
  if (!opts.customerId || !opts.vehicleId) return null;
  return {
    silently_saved: true,
    vehicle_id: opts.vehicleId,
    customer_id: opts.customerId,
  };
}
