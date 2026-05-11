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

const STATE_RE = /^[A-Za-z]{2}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

/**
 * Parse a display address into structured fields. Confidence is 'high' iff
 * the trailing segment matches "<STATE> <ZIP>" exactly (2-letter state +
 * 5-digit or 5+4 zip). Anything else returns {line1: trimmed input, rest:
 * null, confidence: 'low'} so the save still preserves what the user typed.
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

  const segments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 3) return lowFallback;

  // Trailing segment must be "<STATE> <ZIP>"
  const tail = segments[segments.length - 1];
  const tailParts = tail.split(/\s+/);
  if (tailParts.length < 2) return lowFallback;

  const zipRaw = tailParts[tailParts.length - 1];
  const stateRaw = tailParts.slice(0, -1).join(' ');
  if (!STATE_RE.test(stateRaw) || !ZIP_RE.test(zipRaw)) return lowFallback;

  // City is the segment before the state/zip tail.
  const city = segments[segments.length - 2];
  if (!city) return lowFallback;

  // Everything before the city is line1 [+ optional line2].
  const lineSegments = segments.slice(0, segments.length - 2);
  if (lineSegments.length === 0) return lowFallback;
  const line1 = lineSegments[0];
  const line2 =
    lineSegments.length > 1 ? lineSegments.slice(1).join(', ') : null;

  return {
    address_line_1: line1,
    address_line_2: line2,
    city,
    state: stateRaw.toUpperCase(),
    zip: zipRaw,
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
