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

/**
 * Item 15f Phase 1 Layer 8c — optional modifier fields.
 *
 * All six fields are `.optional().nullable()`, encoding three states:
 *   - **field omitted** (`undefined`) → preserve existing column value
 *     (Layer 15g-iii's modifier-preservation contract — services-only edits
 *     must not touch modifiers).
 *   - **field = null** → clear the column. For coupon/manual this means
 *     "remove the modifier"; for loyalty it means "zero the redemption."
 *   - **field = value** → write the value.
 *
 * Per the loyalty reversibility audit (`docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md`):
 * pre-transaction loyalty/coupon edits do NOT mutate `customers.loyalty_points_balance`,
 * `loyalty_ledger`, or `coupons.use_count`. The appointment row is a planned-
 * redemption snapshot; the actual customer-state writes happen at transaction
 * commit (which the cascade endpoint does not touch). This is why the schema
 * accepts arbitrary modifier values without consulting the customer record.
 *
 * Coherence (mirroring the `appointments_manual_discount_coherent` DB CHECK):
 * `manual_discount_value` and `manual_discount_label` must travel together.
 * `(value=null, label=null)` clears both; `(value>0, label=string)` writes both.
 * Mixed states are rejected at the Zod layer before the DB ever sees them.
 */
const modifierFieldsShape = {
  coupon_code: z.string().max(50).nullable().optional(),
  coupon_discount: z
    .number()
    .nonnegative({ message: 'coupon_discount must be non-negative' })
    .finite()
    .nullable()
    .optional(),
  loyalty_points_to_redeem: z
    .number()
    .int({ message: 'loyalty_points_to_redeem must be an integer' })
    .nonnegative({ message: 'loyalty_points_to_redeem must be non-negative' })
    .finite()
    .nullable()
    .optional(),
  loyalty_discount: z
    .number()
    .nonnegative({ message: 'loyalty_discount must be non-negative' })
    .finite()
    .nullable()
    .optional(),
  manual_discount_value: z
    .number()
    .positive({ message: 'manual_discount_value must be > 0' })
    .finite()
    .nullable()
    .optional(),
  manual_discount_label: z.string().min(1).max(100).nullable().optional(),
} as const;

export const editServicesBodySchema = z
  .object({
    services: z
      .array(serviceEditItemSchema)
      .min(1, { message: 'At least one service is required' })
      .max(50, { message: 'Too many services in a single edit' }),
    ...modifierFieldsShape,
  })
  .superRefine((data, ctx) => {
    // Manual-discount coherence: value and label travel together. Mirrors
    // the `appointments_manual_discount_coherent` DB CHECK constraint so
    // the rejection surfaces a structured Zod error (400) instead of an
    // opaque DB error (500). Only checked when at least one of the two
    // fields is explicitly present (undefined-undefined = preserve, no
    // coherence concern).
    const valuePresent = 'manual_discount_value' in data;
    const labelPresent = 'manual_discount_label' in data;
    if (!valuePresent && !labelPresent) return;
    const v = data.manual_discount_value;
    const l = data.manual_discount_label;
    const valueIsSet = v != null;
    const labelIsSet = l != null && l.length > 0;
    if (valueIsSet !== labelIsSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'manual_discount_value and manual_discount_label must be both set (with value > 0 + non-empty label) or both null',
        path: ['manual_discount_value'],
      });
    }
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
  /**
   * Combined discount carried forward unchanged from the current row.
   *
   * Item 15g Layer 15g-iii: prefer the per-modifier fields below over
   * this combined value when available — the cascade endpoint now reads
   * `coupon_discount` + `loyalty_discount` + `manual_discount_value`
   * directly so it stays authoritative even if a separate code path drifted
   * the combined `discount_amount` column. This field stays in the input
   * for backwards compatibility with the original Item 15a callers; when
   * any per-modifier value is set, the sum overrides this field.
   */
  discountAmount: number;
  /** Tax carried forward unchanged from the current row (booking flow uses 0). */
  taxAmount: number;
  /**
   * Item 15g Layer 15g-iii — per-modifier preservation. Optional so legacy
   * callers (`computeTotalsForServiceEdit` is exported, may be re-used) keep
   * working unchanged. When any of these is non-null, the canonical combined
   * discount is `coupon + loyalty + manual` and `discountAmount` above is
   * ignored. When all are nullish, fall back to `discountAmount`.
   */
  couponDiscount?: number | null;
  loyaltyDiscount?: number | null;
  manualDiscountValue?: number | null;
}

export interface ComputeTotalsResult {
  /** items + mobile surcharge, pre-tax/discount */
  subtotal: number;
  /** subtotal - discount + tax */
  totalAmount: number;
  /**
   * Item 15g Layer 15g-iii — canonical combined discount used to compute
   * `totalAmount`. Equals `coupon + loyalty + manual` when any of those
   * was supplied; otherwise equals `discountAmount` input. Callers should
   * write this back to `appointments.discount_amount` so the combined
   * column stays in sync with the per-modifier snapshot.
   */
  discountAmount: number;
}

/**
 * Recompute appointment subtotal + total_amount from the new service list.
 * Cents-internal arithmetic mirrors `mobile-service-edit.ts` so float drift
 * stays out. Mobile fee is non-taxable (LOCKED-2, Phase Mobile-1).
 *
 * Item 15g Layer 15g-iii: when per-modifier fields are supplied, recompute
 * the combined discount as their sum so the cascade endpoint can write the
 * authoritative combined value back to `appointments.discount_amount`.
 * `total_amount` is clamped to ≥ 0 (over-discount safety, matches
 * convert-service.ts's resolveModifiers path).
 */
export function computeTotalsForServiceEdit(
  input: ComputeTotalsInput
): ComputeTotalsResult {
  const serviceCents = input.services.reduce(
    (sum, s) => sum + toCents(s.price_at_booking),
    0
  );
  const subtotalCents = serviceCents + toCents(input.mobileSurcharge);

  // Prefer per-modifier sum when any of the three is supplied; otherwise
  // fall back to the combined `discountAmount` input (legacy callers).
  const hasPerModifier =
    input.couponDiscount != null ||
    input.loyaltyDiscount != null ||
    input.manualDiscountValue != null;

  const discountCents = hasPerModifier
    ? toCents(Number(input.couponDiscount ?? 0)) +
      toCents(Number(input.loyaltyDiscount ?? 0)) +
      toCents(Number(input.manualDiscountValue ?? 0))
    : toCents(input.discountAmount);

  const totalCentsRaw = subtotalCents - discountCents + toCents(input.taxAmount);
  const totalCents = Math.max(0, totalCentsRaw);
  return {
    subtotal: subtotalCents / 100,
    totalAmount: totalCents / 100,
    discountAmount: discountCents / 100,
  };
}
