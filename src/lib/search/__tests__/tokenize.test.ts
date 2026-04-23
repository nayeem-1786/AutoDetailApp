import { describe, it, expect } from 'vitest';
import {
  isMultiWord,
  firstWordPattern,
  multiWordMatch,
  normalizePhoneDigits,
  isPhoneQuery,
} from '../tokenize';

describe('isMultiWord', () => {
  it('returns false for single words', () => {
    expect(isMultiWord('omar')).toBe(false);
    expect(isMultiWord('Cuvias')).toBe(false);
  });

  it('returns true for multiple words', () => {
    expect(isMultiWord('omar cuvias')).toBe(true);
    expect(isMultiWord('john  doe smith')).toBe(true);
  });

  it('returns false for empty / whitespace-only input', () => {
    expect(isMultiWord('')).toBe(false);
    expect(isMultiWord('   ')).toBe(false);
    expect(isMultiWord('\t\n')).toBe(false);
  });

  it('ignores repeated whitespace', () => {
    expect(isMultiWord('  omar   cuvias  ')).toBe(true);
    expect(isMultiWord('  omar  ')).toBe(false);
  });
});

describe('firstWordPattern', () => {
  it('wraps the first word in ILIKE wildcards', () => {
    expect(firstWordPattern('omar cuvias')).toBe('%omar%');
    expect(firstWordPattern('john')).toBe('%john%');
  });

  it('preserves case for passthrough to ILIKE (case-insensitive at DB)', () => {
    expect(firstWordPattern('Omar CUVIAS')).toBe('%Omar%');
  });

  it('falls back to the whole query when first split token is empty', () => {
    // Split on whitespace for "  omar" yields ['', 'omar']; first element
    // is '', so the `|| query` fallback returns the whole string. Callers
    // trim before calling, so this path is defensive only.
    expect(firstWordPattern('  omar cuvias')).toBe('%  omar cuvias%');
  });
});

describe('multiWordMatch', () => {
  const rows = [
    { first_name: 'Omar', last_name: 'Cuvias', email: 'omar@example.com', phone: '+13107564789' },
    { first_name: 'Omar', last_name: 'Johnson', email: 'oj@example.com', phone: '+14245551111' },
    { first_name: 'Mario', last_name: 'Cuvias', email: 'mario@example.com', phone: '+13105550000' },
    { first_name: 'Jane', last_name: 'Doe', email: 'jd@example.com', phone: '+13109998888' },
  ];

  it('keeps rows containing every word across concatenated fields', () => {
    const result = multiWordMatch(rows, 'omar cuvias', [
      'first_name',
      'last_name',
      'email',
      'phone',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].first_name).toBe('Omar');
    expect(result[0].last_name).toBe('Cuvias');
  });

  it('is order-independent (cuvias omar === omar cuvias)', () => {
    const reverse = multiWordMatch(rows, 'cuvias omar', [
      'first_name',
      'last_name',
      'email',
      'phone',
    ]);
    expect(reverse).toHaveLength(1);
    expect(reverse[0].first_name).toBe('Omar');
  });

  it('intersects name fragment with phone fragment', () => {
    const result = multiWordMatch(rows, 'omar 310', [
      'first_name',
      'last_name',
      'email',
      'phone',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe('+13107564789');
  });

  it('is case-insensitive', () => {
    const result = multiWordMatch(rows, 'OMAR Cuvias', [
      'first_name',
      'last_name',
      'email',
      'phone',
    ]);
    expect(result).toHaveLength(1);
  });

  it('returns items unchanged for single-word queries (guard)', () => {
    const result = multiWordMatch(rows, 'omar', ['first_name']);
    expect(result).toEqual(rows);
  });

  it('respects the limit argument', () => {
    const result = multiWordMatch(rows, 'omar cuvias', ['first_name', 'last_name'], 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('gracefully handles missing fields on rows', () => {
    const sparse = [{ first_name: 'Omar', last_name: null, email: null, phone: null }];
    const result = multiWordMatch(
      sparse as unknown as typeof rows,
      'omar',
      ['first_name', 'last_name', 'email', 'phone']
    );
    expect(result).toEqual(sparse);
  });
});

describe('normalizePhoneDigits', () => {
  it('strips formatting characters', () => {
    expect(normalizePhoneDigits('(310) 756-4789')).toBe('3107564789');
    expect(normalizePhoneDigits('+1 310.756.4789')).toBe('13107564789');
  });

  it('returns empty string when no digits present', () => {
    expect(normalizePhoneDigits('abc')).toBe('');
    expect(normalizePhoneDigits('')).toBe('');
  });

  it('strips letters too', () => {
    expect(normalizePhoneDigits('ext 123')).toBe('123');
  });
});

describe('isPhoneQuery', () => {
  it('accepts pure digit queries with minDigits default 2', () => {
    expect(isPhoneQuery('310')).toBe(true);
    expect(isPhoneQuery('3107564789')).toBe(true);
  });

  it('accepts common phone formats', () => {
    expect(isPhoneQuery('(310) 756-4789')).toBe(true);
    expect(isPhoneQuery('310.756.4789')).toBe(true);
    expect(isPhoneQuery('+1 (310) 756-4789')).toBe(true);
    expect(isPhoneQuery('310-756')).toBe(true);
  });

  it('rejects queries with fewer than minDigits digits', () => {
    expect(isPhoneQuery('3')).toBe(false);
    expect(isPhoneQuery('')).toBe(false);
  });

  it('rejects queries that contain letters', () => {
    expect(isPhoneQuery('john.doe')).toBe(false);
    expect(isPhoneQuery('555-1234 ext 5')).toBe(false);
    expect(isPhoneQuery('omar')).toBe(false);
    expect(isPhoneQuery('omar 310')).toBe(false);
  });

  it('honors custom minDigits', () => {
    expect(isPhoneQuery('3', 1)).toBe(true);
    expect(isPhoneQuery('31', 3)).toBe(false);
    expect(isPhoneQuery('310', 3)).toBe(true);
  });
});
