import { describe, it, expect } from 'vitest';
import {
  normalizeGooglePlaceId,
  isValidGooglePlaceId,
  GOOGLE_PLACE_ID_REGEX,
} from '@/lib/utils/google-place-id';

const CLEAN_ID = 'ChIJ1bR4uWNK3YAReKepydOFb20';
const ALT_CLEAN_ID = 'ChIJf7qNDhW1woAROX-FX8CScGE';

describe('GOOGLE_PLACE_ID_REGEX', () => {
  it('matches canonical Smart Details Place IDs', () => {
    expect(GOOGLE_PLACE_ID_REGEX.test(CLEAN_ID)).toBe(true);
    expect(GOOGLE_PLACE_ID_REGEX.test(ALT_CLEAN_ID)).toBe(true);
  });

  it('rejects non-ChIJ-prefixed strings', () => {
    expect(GOOGLE_PLACE_ID_REGEX.test('EhIJ1bR4uWNK3YAReKepydOFb20')).toBe(false);
    expect(GOOGLE_PLACE_ID_REGEX.test('not-a-place-id')).toBe(false);
  });

  it('rejects values containing whitespace or quotes', () => {
    expect(GOOGLE_PLACE_ID_REGEX.test(`"${CLEAN_ID}"`)).toBe(false);
    expect(GOOGLE_PLACE_ID_REGEX.test(`${CLEAN_ID} `)).toBe(false);
    expect(GOOGLE_PLACE_ID_REGEX.test(`${CLEAN_ID}\n`)).toBe(false);
  });
});

describe('isValidGooglePlaceId', () => {
  it('returns true for a clean Place ID string', () => {
    expect(isValidGooglePlaceId(CLEAN_ID)).toBe(true);
  });

  it('returns false for non-string values', () => {
    expect(isValidGooglePlaceId(null)).toBe(false);
    expect(isValidGooglePlaceId(undefined)).toBe(false);
    expect(isValidGooglePlaceId(123)).toBe(false);
    expect(isValidGooglePlaceId({})).toBe(false);
  });

  it('returns false for malformed strings', () => {
    expect(isValidGooglePlaceId('')).toBe(false);
    expect(isValidGooglePlaceId(`"${CLEAN_ID}"`)).toBe(false);
    expect(isValidGooglePlaceId(`${CLEAN_ID}  `)).toBe(false);
  });
});

describe('normalizeGooglePlaceId — happy path', () => {
  it('returns clean string unchanged with no steps', () => {
    const result = normalizeGooglePlaceId(CLEAN_ID);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toEqual([]);
    expect(result.error).toBeUndefined();
  });
});

describe('normalizeGooglePlaceId — double-encoded JSON (the production bug)', () => {
  it('unwraps a JSON-encoded JSON string', () => {
    // Production case: JSONB read returned a JS string containing the
    // literal quote characters: `"ChIJ..."`.
    const result = normalizeGooglePlaceId(`"${CLEAN_ID}"`);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('unwrap-json');
  });

  it('handles values from JSON.stringify(JSON.stringify(id))', () => {
    // If something double-stringified the value at write time, the JSONB
    // value is `"\"ChIJ...\""`. The Supabase client deserializes JSONB once,
    // yielding the JS string `"ChIJ..."` — which is the first test case above.
    // This test pins that JSON.stringify round-trip parity.
    const doubly = JSON.stringify(JSON.stringify(CLEAN_ID));
    const supabaseReadEquivalent = JSON.parse(doubly);
    const result = normalizeGooglePlaceId(supabaseReadEquivalent);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('unwrap-json');
  });
});

describe('normalizeGooglePlaceId — whitespace', () => {
  it('trims leading/trailing whitespace', () => {
    const result = normalizeGooglePlaceId(`  ${CLEAN_ID}  `);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('trim');
  });

  it('trims newlines and tabs', () => {
    const result = normalizeGooglePlaceId(`\n${CLEAN_ID}\t`);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('trim');
  });
});

describe('normalizeGooglePlaceId — URL paste', () => {
  it('extracts Place ID from search.google.com placeid param', () => {
    const result = normalizeGooglePlaceId(
      `https://search.google.com/local/reviews?placeid=${CLEAN_ID}`
    );
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('extract-url');
  });

  it('extracts Place ID from maps API place_id param', () => {
    const result = normalizeGooglePlaceId(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${CLEAN_ID}&fields=name`
    );
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('extract-url');
  });

  it('extracts Place ID from query_place_id param', () => {
    const result = normalizeGooglePlaceId(
      `https://www.google.com/maps/search/?api=1&query=Smart+Details&query_place_id=${CLEAN_ID}`
    );
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('extract-url');
  });

  it('returns invalid when URL has no recognized Place ID param', () => {
    const result = normalizeGooglePlaceId(
      'https://www.google.com/maps/place/Smart+Details/@33.7,-118.4,17z'
    );
    expect(result.value).toBeNull();
    expect(result.error).toBe('format');
  });
});

describe('normalizeGooglePlaceId — surrounding quotes', () => {
  it('strips surrounding double-quote characters that survived JSON parse', () => {
    // After URL extraction the candidate could still be quoted in malformed
    // inputs — defense in depth.
    const result = normalizeGooglePlaceId(`'${CLEAN_ID}'`);
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('strip-quotes');
  });

  it('does not strip mid-string quotes', () => {
    const result = normalizeGooglePlaceId(`ChIJ"foo`);
    expect(result.value).toBeNull();
    expect(result.error).toBe('format');
  });
});

describe('normalizeGooglePlaceId — empty / null / wrong type', () => {
  it('returns null with error=empty for empty string', () => {
    const result = normalizeGooglePlaceId('');
    expect(result.value).toBeNull();
    expect(result.error).toBe('empty');
  });

  it('returns null with error=empty for null', () => {
    const result = normalizeGooglePlaceId(null);
    expect(result.value).toBeNull();
    expect(result.error).toBe('empty');
  });

  it('returns null with error=empty for undefined', () => {
    const result = normalizeGooglePlaceId(undefined);
    expect(result.value).toBeNull();
    expect(result.error).toBe('empty');
  });

  it('returns null for non-string types', () => {
    expect(normalizeGooglePlaceId(123).value).toBeNull();
    expect(normalizeGooglePlaceId({}).value).toBeNull();
    expect(normalizeGooglePlaceId([CLEAN_ID]).value).toBeNull();
  });
});

describe('normalizeGooglePlaceId — invalid format', () => {
  it('returns null with error=format for arbitrary text', () => {
    const result = normalizeGooglePlaceId('not-a-place-id');
    expect(result.value).toBeNull();
    expect(result.error).toBe('format');
  });

  it('rejects ID with valid prefix but invalid characters', () => {
    const result = normalizeGooglePlaceId('ChIJ1!@#$%^&');
    expect(result.value).toBeNull();
    expect(result.error).toBe('format');
  });

  it('rejects ID without ChIJ prefix', () => {
    const result = normalizeGooglePlaceId('EhIJ1bR4uWNK3YAReKepydOFb20');
    expect(result.value).toBeNull();
    expect(result.error).toBe('format');
  });
});

describe('normalizeGooglePlaceId — combined corrections', () => {
  it('handles double-encoded + trimmed value', () => {
    const result = normalizeGooglePlaceId(`  "${CLEAN_ID}"  `);
    expect(result.value).toBe(CLEAN_ID);
    // Whichever steps are recorded, the final value must be clean.
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('handles URL with trailing whitespace', () => {
    const result = normalizeGooglePlaceId(
      `  https://search.google.com/local/reviews?placeid=${CLEAN_ID}  `
    );
    expect(result.value).toBe(CLEAN_ID);
    expect(result.steps).toContain('trim');
    expect(result.steps).toContain('extract-url');
  });
});
