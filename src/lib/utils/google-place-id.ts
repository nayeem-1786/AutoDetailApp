/**
 * Google Place ID — normalization, validation, extraction.
 *
 * Place IDs are 27-character opaque tokens that start with `ChIJ` (for the
 * Place Details JSON endpoint used by Smart Details). Bad inputs encountered
 * in production:
 *   1. Double-JSON-encoded values stored in business_settings.value (JSONB).
 *      Reads come back as `"ChIJ..."` (a JS string with embedded quote chars).
 *   2. Operator pastes the bare ID with surrounding quotes from a tool that
 *      copies values quoted.
 *   3. Operator pastes a Google Maps / search URL containing the ID as a
 *      `placeid`, `place_id`, or `query_place_id` query param.
 *   4. Trailing/leading whitespace or newlines from copy-paste.
 *
 * `normalizeGooglePlaceId` is the single point of truth for cleaning any
 * inbound value before it's stored, displayed, or sent to Google's API.
 */

/** Canonical format used by Smart Details (Place Details JSON endpoint). */
export const GOOGLE_PLACE_ID_REGEX = /^ChIJ[A-Za-z0-9_-]+$/;

export type NormalizationStep =
  | 'none'
  | 'unwrap-json'
  | 'strip-quotes'
  | 'trim'
  | 'extract-url'
  | 'invalid';

export interface NormalizationResult {
  value: string | null;
  steps: NormalizationStep[];
  error?: string;
}

/**
 * Strict validator. Use after normalization to gate writes / API requests.
 */
export function isValidGooglePlaceId(value: unknown): value is string {
  return typeof value === 'string' && GOOGLE_PLACE_ID_REGEX.test(value);
}

/**
 * Attempt to extract a Place ID from a URL string. Returns null if the URL
 * doesn't carry a recognized `placeid` / `place_id` / `query_place_id` param.
 */
function extractFromUrl(raw: string): string | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const params = url.searchParams;
  const candidate =
    params.get('place_id') ||
    params.get('placeid') ||
    params.get('query_place_id');
  return candidate ? candidate.trim() : null;
}

/**
 * Normalize an arbitrary inbound value to a clean Google Place ID, applying
 * (in order): JSON unwrap, URL extraction, trim, surrounding-quote strip,
 * and format validation. Returns the canonical value or null with an error.
 *
 * The `steps` array records which corrections were applied so callers can
 * log when stored data was malformed and required repair.
 */
export function normalizeGooglePlaceId(raw: unknown): NormalizationResult {
  const steps: NormalizationStep[] = [];

  if (raw === null || raw === undefined || raw === '') {
    return { value: null, steps, error: 'empty' };
  }

  if (typeof raw !== 'string') {
    return { value: null, steps: ['invalid'], error: 'not-a-string' };
  }

  let candidate = raw;

  // 1. JSON unwrap — handles double-encoded JSONB reads like `"ChIJ..."`.
  //    JSON.parse a JSON string returns the inner string; a plain ChIJ token
  //    is not valid JSON, so JSON.parse throws and we keep the candidate.
  if (candidate.startsWith('"') && candidate.endsWith('"') && candidate.length >= 2) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        candidate = parsed;
        steps.push('unwrap-json');
      }
    } catch {
      // Not JSON — fall through to manual quote-strip
    }
  }

  // 2. Trim whitespace.
  const trimmed = candidate.trim();
  if (trimmed !== candidate) {
    steps.push('trim');
    candidate = trimmed;
  }

  // 3. URL extraction — operator may paste a full Google Maps / search URL.
  const urlExtracted = extractFromUrl(candidate);
  if (urlExtracted) {
    candidate = urlExtracted;
    steps.push('extract-url');
  }

  // 4. Strip surrounding quote characters if any remain after JSON unwrap.
  //    Only strips one matched pair — never mid-string quotes.
  while (
    candidate.length >= 2 &&
    ((candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'")))
  ) {
    candidate = candidate.slice(1, -1).trim();
    if (!steps.includes('strip-quotes')) steps.push('strip-quotes');
  }

  // 5. Final validation.
  if (!GOOGLE_PLACE_ID_REGEX.test(candidate)) {
    return {
      value: null,
      steps: [...steps, 'invalid'],
      error: 'format',
    };
  }

  return { value: candidate, steps };
}
