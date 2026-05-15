import { z } from 'zod';
import { positiveInt } from '@/lib/utils/validation';

/**
 * Phase Money-Unify-3 Hotfix 2: wire contract for POST /api/book/payment-intent.
 *
 * `amountCents` is integer cents (post-Family-D-rename). The endpoint
 * forwards this value directly to Stripe — no `* 100` coercion. `.strict()`
 * rejects unknown keys so callers passing the legacy `amount` (dollars)
 * shape fail loudly with a 400 instead of silently producing a 100×
 * charge.
 *
 * Lives in a sibling module (not the route file) because Next.js App
 * Router rejects non-HTTP-method named exports from `route.ts`.
 */
export const paymentIntentRequestSchema = z
  .object({
    amountCents: positiveInt,
    currency: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    isDeposit: z.boolean().optional(),
    totalAmountCents: positiveInt.optional().nullable(),
  })
  .strict();

export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>;
