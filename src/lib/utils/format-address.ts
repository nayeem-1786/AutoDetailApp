// Address utilities for Phase Mobile-1.1 (Option X+).
//
// Single TEXT mobile_address stays on appointments + quotes; customers keep
// the existing 5 structured columns. These helpers bridge the two
// representations:
//
//   formatCustomerAddress       : structured → display string (pre-fill source)
//   parseAddressString          : display string → structured (best-effort save)
//   normalizeAddressForCompare  : both → compare-safe string (diff detection)
//
// Parser is intentionally best-effort. High confidence requires a recognizable
// "<line1>[, <line2>], <city>, <ST> <zip>" shape; anything else falls back to
// {address_line_1: full, rest: null, confidence: 'low'}. Callers store the
// fallback as-is — Square import did the same with sloppy CSV rows.

export type CustomerLike = {
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type ParsedAddress = {
  address_line_1: string;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  confidence: 'high' | 'low';
};

/**
 * Join a customer's structured address columns into the canonical display form.
 * Returns null when there is no line1 — treated as "no address on file".
 *
 * "<line1>[, <line2>], <city>, <STATE> <zip>" with each segment skipped when
 * empty. Partial inputs degrade gracefully — line1 alone returns "line1".
 */
export function formatCustomerAddress(customer: CustomerLike): string | null {
  const line1 = (customer.address_line_1 ?? '').trim();
  if (!line1) return null;

  const line2 = (customer.address_line_2 ?? '').trim();
  const city = (customer.city ?? '').trim();
  const state = (customer.state ?? '').trim().toUpperCase();
  const zip = (customer.zip ?? '').trim();

  const street = line2 ? `${line1}, ${line2}` : line1;

  // Tail = "City, STATE Zip" with each piece optional. We only emit a comma
  // between street and tail when the tail has content. STATE+Zip join with a
  // space; either can be missing.
  const stateZip = [state, zip].filter(Boolean).join(' ');
  const tailParts = [city, stateZip].filter(Boolean);
  if (tailParts.length === 0) return street;

  return `${street}, ${tailParts.join(', ')}`;
}

/**
 * Parse a display address into structured fields. Confidence is 'high' when
 * a 2-letter state + 5-digit (or 5+4) zip suffix is found AND the remainder
 * before that suffix has at least 2 comma-separated segments (street + city,
 * with optional line_2 in between). Anything else returns {line1: trimmed
 * input, rest: null, confidence: 'low'} so the save still preserves what
 * the user typed.
 *
 * Phase Mobile-1.4 (anchored-from-end strategy): handles four common US
 * address formats as HIGH confidence:
 *   A. "Line1, City, ST ZIP"           — canonical
 *   B. "Line1, City ST ZIP"            — single comma (what users type)
 *   C. "Line1, City, ST, ZIP"          — Square import legacy
 *   D. "Line1, City, ST ZIP-NNNN"      — ZIP+4
 * Apt/line_2 is supported via "Line1, Line2, City, ST ZIP".
 */
export function parseAddressString(input: string): ParsedAddress {
  const trimmed = (input ?? '').trim();
  if (!trimmed) {
    return {
      address_line_1: '',
      address_line_2: null,
      city: null,
      state: null,
      zip: null,
      confidence: 'low',
    };
  }

  const lowFallback: ParsedAddress = {
    address_line_1: trimmed,
    address_line_2: null,
    city: null,
    state: null,
    zip: null,
    confidence: 'low',
  };

  // Anchor from end: locate state code + zip suffix. The optional comma
  // between state and zip handles the legacy Square import pattern
  // "City, ST, ZIP". ZIP+4 ("ZIP-NNNN") is preserved when present. The
  // \b before the state code prevents matching a 2-letter substring
  // embedded inside a longer word (e.g. "Lo" inside "Lomita").
  const stateZipMatch = trimmed.match(
    /\s*\b([A-Za-z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)\s*$/
  );
  if (!stateZipMatch || stateZipMatch.index === undefined) {
    return lowFallback;
  }

  const state = stateZipMatch[1].toUpperCase();
  const zip = stateZipMatch[2];

  // Everything before the matched state+zip suffix. Comma-split into
  // address segments; filter(Boolean) drops empty pieces caused by
  // trailing commas ("..., CA 90501" or "..., CA, 90501").
  const beforeStateZip = trimmed.slice(0, stateZipMatch.index).trim();
  if (!beforeStateZip) {
    // "CA 90501" alone — no street or city to attribute.
    return lowFallback;
  }
  const segments = beforeStateZip
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    // Single segment can't disambiguate street from city without a comma
    // ("123 Main St Torrance CA 90501" is too ambiguous to segment).
    return lowFallback;
  }

  const city = segments[segments.length - 1];
  const address_line_1 = segments[0];
  const address_line_2 =
    segments.length > 2 ? segments.slice(1, -1).join(', ') : null;

  return {
    address_line_1,
    address_line_2,
    city,
    state,
    zip,
    confidence: 'high',
  };
}

/**
 * Normalize a string for diff-detection (LOCKED-5):
 *  - trim, lowercase
 *  - strip punctuation
 *  - collapse all internal whitespace to a single space
 *
 * Two strings producing the same normalized form are treated as "same
 * address" for prompt-suppression purposes (e.g. "123 Main St." vs
 * "123 main st"). null/undefined normalize to "" so empty values match.
 */
export function normalizeAddressForCompare(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
