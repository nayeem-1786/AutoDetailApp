/**
 * Derive a human-readable source label for a payment row using the durable
 * notes-prefix discriminators set by the two non-POS transaction creators:
 *   - Pay-link webhook (src/app/api/webhooks/stripe/route.ts:144)
 *     'Online payment link. PI: <pi_id>.'
 *   - Booking deposit  (src/app/api/book/route.ts:393)
 *     'Online booking deposit. Service total: $X. Balance due at service: $Y.'
 *
 * Any other source falls through to a method-based label (in-store POS).
 *
 * Used by:
 *   - /api/pos/jobs/[id]/checkout-items (POS Payments Received block)
 *   - /lib/data/receipt-data           (receipt template paymentRows)
 *
 * If either prefix string ever changes in the source files above, this helper
 * stops recognizing those payments — keep the three sites in sync.
 */
export type PaymentMethodLike = 'cash' | 'card' | 'check' | 'split';

export function derivePaymentSourceLabel(
  notes: string | null | undefined,
  method: PaymentMethodLike
): string {
  if (notes && notes.startsWith('Online payment link.')) return 'Online (pay link)';
  if (notes && notes.startsWith('Online booking deposit.')) return 'Booking deposit';
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Card';
    case 'check':
      return 'Check';
    case 'split':
      return 'Split';
  }
}
