import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobServiceSnapshot } from '@/lib/supabase/types';
import { toCents } from '@/lib/utils/refund-math';

/**
 * Phase Mobile-1.9 — pure-function helpers shared by the POS and admin
 * mobile-service PATCH endpoints.
 *
 * Split out of the endpoints so the math + JSONB sync logic can be unit
 * tested in isolation (no Next.js request mocking, no auth scaffolding).
 * The endpoints themselves are thin glue around these helpers.
 */

const MOBILE_FEE_FALLBACK_NAME = 'Mobile Service Fee';

interface ComputeAppointmentDeltaInput {
  /** Current `appointments.subtotal` (items + mobile, pre-tax/discount). */
  currentSubtotal: number;
  /** Current `appointments.total_amount`. */
  currentTotal: number;
  /** Current `appointments.mobile_surcharge`. 0 if is_mobile=false. */
  currentSurcharge: number;
  /** New mobile surcharge after the edit (0 if toggling off). */
  newSurcharge: number;
}

interface ComputeAppointmentDeltaResult {
  newSubtotal: number;
  newTotal: number;
}

/**
 * Adjust appointment subtotal/total by the surcharge delta only. Mobile
 * fee is non-taxable (LOCKED-2 Phase Mobile-1, see `docs/sessions/
 * mobile-fee-fix.md`) so tax and discount lines stay unchanged.
 *
 * Delta strategy (rather than recompute-from-scratch) preserves whatever
 * tax/discount math the original appointment landed on — important for
 * online-booking appointments that have a non-zero tax base.
 *
 * Cents-internal arithmetic dodges float drift (cf. refund-math
 * pattern). Returns dollar values rounded to 2 decimals.
 */
export function computeAppointmentDelta(
  input: ComputeAppointmentDeltaInput
): ComputeAppointmentDeltaResult {
  const deltaCents = toCents(input.newSurcharge) - toCents(input.currentSurcharge);
  const newSubtotalCents = toCents(input.currentSubtotal) + deltaCents;
  const newTotalCents = toCents(input.currentTotal) + deltaCents;
  return {
    newSubtotal: newSubtotalCents / 100,
    newTotal: newTotalCents / 100,
  };
}

interface ApplyMobileEditInput {
  services: JobServiceSnapshot[];
  isMobile: boolean;
  surcharge: number;
  snapshotName: string | null;
}

/**
 * Re-materialize the synthetic mobile-fee entry in `jobs.services`
 * JSONB after a mobile-fields edit. Idempotent — strips any existing
 * `is_mobile_fee=true` entries first, then appends a fresh one when the
 * new state has `is_mobile=true` AND `surcharge > 0`.
 *
 * Stripping by flag means a stale entry (e.g. wrong name after a zone
 * change before this fix shipped) is replaced cleanly. The append
 * mirrors the shape that `/api/pos/jobs/populate` produces
 * (`{ id: null, name, price, is_mobile_fee: true }`).
 */
export function applyMobileEditToJobServices(
  input: ApplyMobileEditInput
): JobServiceSnapshot[] {
  const stripped = input.services.filter((s) => s.is_mobile_fee !== true);
  if (!input.isMobile || !(input.surcharge > 0)) {
    return stripped;
  }
  const mobileEntry: JobServiceSnapshot = {
    id: null,
    name: input.snapshotName || MOBILE_FEE_FALLBACK_NAME,
    price: input.surcharge,
    is_mobile_fee: true,
  };
  return [...stripped, mobileEntry];
}

/**
 * Sum payments.amount for every transaction linked to this appointment.
 * Mirrors the `attachAmountDueCents` logic in /api/pos/jobs/[id]/route.ts
 * — the canonical "what has the customer paid" calculation across the
 * jobs/payments surfaces. Returns total in cents.
 */
export async function computePaidCentsForAppointment(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<number> {
  const { data: txs } = await supabase
    .from('transactions')
    .select('id')
    .eq('appointment_id', appointmentId);
  const txIds = (txs ?? []).map((t) => t.id);
  if (txIds.length === 0) return 0;
  const { data: pays } = await supabase
    .from('payments')
    .select('amount')
    .in('transaction_id', txIds);
  return (pays ?? []).reduce(
    (sum, p) => sum + toCents(Number(p.amount)),
    0
  );
}
