/**
 * Item 15a — Pure helpers for editing services on a scheduled appointment
 * from the Admin Appointment dialog (Wave 1.5 / lifecycle-audit gaps §10 #1
 * and #11).
 *
 * Concerns split out of the HTTP handler so the math + JSONB rebuild
 * logic can be unit-tested without Next.js / Supabase mocking. The endpoint
 * is thin glue around these helpers.
 *
 * Naming + JSONB-shape decisions mirror existing primitives:
 *   - `JobServiceSnapshot` shape (`{ id, name, price, is_mobile_fee? }`)
 *     matches what `/api/pos/jobs/populate/route.ts` writes at job-create
 *     time. We rebuild from scratch on every edit so a stale mobile-fee
 *     row or removed service can never linger.
 *   - Recompute-from-scratch (not delta) for totals because services are a
 *     bigger lever than the mobile-fee toggle — old subtotal isn't safely
 *     adjustable with a single delta when N items are added/removed.
 *   - Discount + tax pass through untouched (tax is 0 for booking-flow
 *     appointments today; discount may be non-zero from coupon redemption).
 */

import { z } from 'zod';
import type { JobServiceSnapshot } from '@/lib/supabase/types';
import { toCents } from '@/lib/utils/refund-math';

const MOBILE_FEE_FALLBACK_NAME = 'Mobile Service Fee';

export const serviceEditItemSchema = z.object({
  service_id: z.string().uuid({ message: 'Invalid service id' }),
  price_at_booking: z
    .number()
    .nonnegative({ message: 'Price must be non-negative' })
    .finite({ message: 'Price must be finite' }),
  tier_name: z.string().min(1).max(100).nullable().optional(),
});

export const editServicesBodySchema = z.object({
  services: z
    .array(serviceEditItemSchema)
    .min(1, { message: 'At least one service is required' })
    .max(50, { message: 'Too many services in a single edit' }),
});

export type EditServicesInput = z.infer<typeof editServicesBodySchema>;
export type EditServicesItem = z.infer<typeof serviceEditItemSchema>;

export interface ResolvedServiceForCascade {
  service_id: string;
  service_name: string;
  price_at_booking: number;
}

export interface BuildJobServicesInput {
  resolved: ResolvedServiceForCascade[];
  isMobile: boolean;
  mobileSurcharge: number;
  mobileZoneNameSnapshot: string | null;
}

/**
 * Rebuild the `jobs.services` JSONB from the current service list +
 * mobile state. Matches the shape produced by
 * `/api/pos/jobs/populate/route.ts:128-142` — the canonical writer this
 * file mirrors.
 */
export function buildJobServicesJsonb(
  input: BuildJobServicesInput
): JobServiceSnapshot[] {
  const base: JobServiceSnapshot[] = input.resolved.map((r) => ({
    id: r.service_id,
    name: r.service_name,
    price: r.price_at_booking,
  }));

  if (!input.isMobile || !(input.mobileSurcharge > 0)) return base;

  return [
    ...base,
    {
      id: null,
      name: input.mobileZoneNameSnapshot || MOBILE_FEE_FALLBACK_NAME,
      price: input.mobileSurcharge,
      is_mobile_fee: true,
    },
  ];
}

export interface ComputeTotalsInput {
  /** Service rows after the edit. */
  services: { price_at_booking: number }[];
  /** Mobile surcharge as it stands on the appointment (unchanged by this edit). */
  mobileSurcharge: number;
  /** Discount carried forward unchanged from the current row. */
  discountAmount: number;
  /** Tax carried forward unchanged from the current row (booking flow uses 0). */
  taxAmount: number;
}

export interface ComputeTotalsResult {
  /** items + mobile surcharge, pre-tax/discount */
  subtotal: number;
  /** subtotal - discount + tax */
  totalAmount: number;
}

/**
 * Recompute appointment subtotal + total_amount from the new service list.
 * Cents-internal arithmetic mirrors `mobile-service-edit.ts` so float drift
 * stays out. Mobile fee is non-taxable (LOCKED-2, Phase Mobile-1).
 */
export function computeTotalsForServiceEdit(
  input: ComputeTotalsInput
): ComputeTotalsResult {
  const serviceCents = input.services.reduce(
    (sum, s) => sum + toCents(s.price_at_booking),
    0
  );
  const subtotalCents = serviceCents + toCents(input.mobileSurcharge);
  const totalCents =
    subtotalCents - toCents(input.discountAmount) + toCents(input.taxAmount);
  return {
    subtotal: subtotalCents / 100,
    totalAmount: totalCents / 100,
  };
}
