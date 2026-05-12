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
 * Title-case helper. Applied to line_1, line_2, and city on HIGH-confidence
 * returns so cashier-typed `"1234 lomita blvd., lomita 90717"` round-trips
 * as `"1234 Lomita Blvd., Lomita"` rather than the cashier's exact casing.
 * Word boundaries split on every non-`\w` character, so hyphens and
 * apostrophes split sub-words ("O'Brien" → "O'Brien"; "first-class" →
 * "First-Class"). Known lossy edge cases: "McDonald" → "Mcdonald", "Apt 4B"
 * → "Apt 4b" — accepted in Phase Mobile-1.5 in exchange for a single
 * one-line helper. LOW returns never call this — user's typed string is
 * preserved verbatim.
 */
function titleCase(s: string): string {
  return s.replace(
    /\b\w+/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

/**
 * Parse a display address into structured fields. Confidence is 'high' when
 * a recognized address shape is matched at the end of the input AND the
 * remainder before that suffix has at least 2 comma-separated segments
 * (street + city, with optional line_2 in between). Anything else returns
 * {line1: trimmed input, rest: null, confidence: 'low'} so the save still
 * preserves what the user typed.
 *
 * Two-pass strategy:
 *
 *   Pass 1 — Phase Mobile-1.4 — state code + zip suffix at end. Handles
 *     four formats:
 *       A. "Line1, City, ST ZIP"           — canonical
 *       B. "Line1, City ST ZIP"            — single comma (what users type)
 *       C. "Line1, City, ST, ZIP"          — Square import legacy
 *       D. "Line1, City, ST ZIP-NNNN"      — ZIP+4
 *
 *   Pass 2 — Phase Mobile-1.5 — zip-only suffix at end (no state code).
 *     Defaults state to "CA" because Smart Details Auto Spa operates
 *     exclusively in California (LOCKED-3). Multi-state support is deferred.
 *       E. "Line1, City ZIP"               — state-less single-state shorthand
 *
 * Apt/line_2 is supported via "Line1, Line2, ..., City, ..." in either pass.
 *
 * Per LOCKED-5: LOW-confidence returns NEVER default state — partial
 * extractions are discarded so callers don't mistake "we couldn't parse
 * this" for "we parsed it with CA assumed".
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

  // Pass 1 — Formats A/B/C/D. Anchor from end: state code + zip suffix.
  // The optional comma between state and zip handles the legacy Square
  // import pattern "City, ST, ZIP". ZIP+4 ("ZIP-NNNN") is preserved when
  // present. The \b before the state code prevents matching a 2-letter
  // substring buried inside a longer word (e.g. "Lo" inside "Lomita").
  const stateZipMatch = trimmed.match(
    /\s*\b([A-Za-z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)\s*$/
  );
  if (stateZipMatch && stateZipMatch.index !== undefined) {
    const state = stateZipMatch[1].toUpperCase();
    const zip = stateZipMatch[2];
    const beforeStateZip = trimmed.slice(0, stateZipMatch.index).trim();
    if (beforeStateZip) {
      const segments = beforeStateZip
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length >= 2) {
        const city = segments[segments.length - 1];
        const address_line_1 = segments[0];
        const address_line_2 =
          segments.length > 2 ? segments.slice(1, -1).join(', ') : null;
        return {
          address_line_1: titleCase(address_line_1),
          address_line_2: address_line_2 ? titleCase(address_line_2) : null,
          city: titleCase(city),
          state,
          zip,
          confidence: 'high',
        };
      }
    }
    // Pass 1 detected a state code but the remainder couldn't be segmented
    // into street + city. A state was found in the input, so we don't fall
    // through to Pass 2's CA-default — that would overwrite the user's
    // explicit state with an assumption. Return LOW per LOCKED-5.
    return lowFallback;
  }

  // Pass 2 — Format E (Phase Mobile-1.5). Anchor from end: zip-only suffix
  // with state defaulted. Cashiers commonly omit the state code when typing
  // addresses for a single-state business. LOCKED-3: "CA" is hardcoded —
  // multi-state support requires moving this to config and is deferred.
  const zipOnlyMatch = trimmed.match(/\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (zipOnlyMatch && zipOnlyMatch.index !== undefined) {
    const zip = zipOnlyMatch[1];
    const beforeZip = trimmed.slice(0, zipOnlyMatch.index).trim();
    if (beforeZip) {
      const segments = beforeZip
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length >= 2) {
        const city = segments[segments.length - 1];
        const address_line_1 = segments[0];
        const address_line_2 =
          segments.length > 2 ? segments.slice(1, -1).join(', ') : null;
        return {
          address_line_1: titleCase(address_line_1),
          address_line_2: address_line_2 ? titleCase(address_line_2) : null,
          city: titleCase(city),
          // LOCKED-3: single-state business default. LOW never sets this —
          // only HIGH-confidence Format E does.
          state: 'CA',
          zip,
          confidence: 'high',
        };
      }
    }
    // Pass 2 matched a zip but the remainder couldn't be segmented. Fall
    // through to LOW; do NOT keep the partial zip extraction (LOCKED-5).
  }

  return lowFallback;
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
