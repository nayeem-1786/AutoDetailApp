/**
 * Title-case a card brand string for display on receipts and UI.
 *
 * Stripe's API returns card brands as lowercase identifiers
 * (`'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb'
 *  | 'unionpay' | 'unknown'`). Direct interpolation produces "visa ****8085"
 * which reads as a typo. The lookup table below maps each known Stripe brand
 * to its proper-noun form (Visa, Mastercard, Amex, Discover, Diners, JCB,
 * UnionPay). Unknown brands fall back to a generic "Card" label; non-Stripe
 * brand strings (defensive) get a naive title-case via
 * `charAt(0).toUpperCase() + slice(1)` so the receipt never prints a literal
 * lowercase brand name.
 *
 * Use everywhere card_brand is rendered: thermal receipt template, HTML
 * receipt template, public receipt page. Single source of truth — adding a
 * new Stripe-supported brand only requires updating this map.
 */
const BRAND_MAP: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
};

export function formatCardBrand(brand: string | null | undefined): string {
  if (!brand) return 'Card';
  const lower = brand.toLowerCase();
  return BRAND_MAP[lower] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}
