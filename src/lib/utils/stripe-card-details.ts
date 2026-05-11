import type Stripe from 'stripe';

/**
 * Phase 1A.5 Part B — Stripe brand/last4 extraction for online card payments.
 *
 * Online Stripe paths (pay-link webhook, booking deposit /api/book) historically
 * inserted payments rows with only stripe_payment_intent_id and let the
 * composer fall through to a generic "Card" label. This helper does the
 * Stripe.charges.retrieve round-trip and returns a normalized
 * { card_brand, card_last_four } pair ready to write to payments columns.
 *
 * Title-cases brand strings ("visa" → "Visa", "amex" → "Amex") for storage
 * consistency with the in-store Stripe Terminal path (split-payment.tsx,
 * card-payment.tsx — verified-correct baseline in Phase 1A byte-diff).
 *
 * LOCKED-B4: returns { card_brand: null, card_last_four: null } on any
 * extraction failure (missing latest_charge, non-card payment_method_details,
 * Stripe API error). Caller writes nulls; composer's existing fallback
 * renders "Card" generic. NEVER throws — webhook processing must not block
 * on this enrichment.
 */
export interface ExtractedCardDetails {
  card_brand: string | null;
  card_last_four: string | null;
}

const EMPTY: ExtractedCardDetails = { card_brand: null, card_last_four: null };

/**
 * Title-case a Stripe brand string. Stripe returns lowercase ("visa",
 * "mastercard", "amex"). Single-word output keeps it simple — no need for
 * the general toTitleCase here.
 */
function titleCaseBrand(brand: string): string {
  if (brand.length === 0) return brand;
  return brand[0].toUpperCase() + brand.slice(1).toLowerCase();
}

/**
 * Retrieve a Stripe Charge and pull card.brand + card.last4 from
 * payment_method_details. Returns nulls and logs a warning on any
 * extraction issue.
 *
 * Caller supplies the latest_charge id (from PaymentIntent.latest_charge).
 * If null/undefined, returns empty without making a Stripe call.
 */
export async function extractCardDetailsFromCharge(
  stripe: Stripe,
  chargeId: string | null | undefined,
  context: string
): Promise<ExtractedCardDetails> {
  if (!chargeId) {
    console.warn(`[stripe-card-details] ${context}: latest_charge missing — falling back to null brand/last4`);
    return EMPTY;
  }
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const card = charge.payment_method_details?.card;
    if (!card) {
      console.warn(
        `[stripe-card-details] ${context}: charge ${chargeId} payment_method_details.card missing (likely non-card method) — falling back to null brand/last4`
      );
      return EMPTY;
    }
    const brand = card.brand ? titleCaseBrand(card.brand) : null;
    const last4 = card.last4 ?? null;
    return { card_brand: brand, card_last_four: last4 };
  } catch (err) {
    console.error(
      `[stripe-card-details] ${context}: charge retrieve failed for ${chargeId} — falling back to null brand/last4`,
      err
    );
    return EMPTY;
  }
}
