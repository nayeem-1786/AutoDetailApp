import { describe, it, expect } from 'vitest';
import {
  formatCustomerAddress,
  parseAddressString,
  normalizeAddressForCompare,
} from '@/lib/utils/format-address';

describe('formatCustomerAddress', () => {
  it('returns null when address_line_1 is null', () => {
    expect(
      formatCustomerAddress({
        address_line_1: null,
        address_line_2: null,
        city: null,
        state: null,
        zip: null,
      })
    ).toBeNull();
  });

  it('returns null when address_line_1 is empty/whitespace', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '   ',
        address_line_2: null,
        city: 'Torrance',
        state: 'CA',
        zip: '90501',
      })
    ).toBeNull();
  });

  it('formats line1 only when other fields empty', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '123 Main',
        address_line_2: null,
        city: null,
        state: null,
        zip: null,
      })
    ).toBe('123 Main');
  });

  it('formats canonical full address', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '123 Main',
        address_line_2: null,
        city: 'Torrance',
        state: 'CA',
        zip: '90501',
      })
    ).toBe('123 Main, Torrance, CA 90501');
  });

  it('formats with line2 when present', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '456 Oak Ave',
        address_line_2: 'Apt 4',
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      })
    ).toBe('456 Oak Ave, Apt 4, Lomita, CA 90717');
  });

  it('normalizes state to uppercase', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '1 Pine',
        address_line_2: null,
        city: 'Torrance',
        state: 'ca',
        zip: '90501',
      })
    ).toBe('1 Pine, Torrance, CA 90501');
  });

  it('handles partial — city only, no state/zip', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '789 Elm',
        address_line_2: null,
        city: 'Lomita',
        state: null,
        zip: null,
      })
    ).toBe('789 Elm, Lomita');
  });

  it('handles partial — zip only, no state', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '789 Elm',
        address_line_2: null,
        city: null,
        state: null,
        zip: '90717',
      })
    ).toBe('789 Elm, 90717');
  });

  it('handles partial — state only, no zip', () => {
    expect(
      formatCustomerAddress({
        address_line_1: '789 Elm',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: null,
      })
    ).toBe('789 Elm, Lomita, CA');
  });
});

describe('parseAddressString', () => {
  // Format A — canonical "Line1, City, ST ZIP"
  it('Format A: parses canonical "line1, city, ST zip" as high confidence', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  it('Format A: parses with line2 — "line1, line2, city, ST zip"', () => {
    const r = parseAddressString('23742 Falena Ave, Apt 4, Torrance, CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBe('Apt 4');
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  // Format B — single-comma "Line1, City ST ZIP" (the format users type)
  it('Format B: single comma "2021 Lomita Blvd., Lomita CA 90717"', () => {
    const r = parseAddressString('2021 Lomita Blvd., Lomita CA 90717');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('2021 Lomita Blvd.');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717');
  });

  it('Format B: single comma "1785 W. 220th St, Torrance CA 90501"', () => {
    const r = parseAddressString('1785 W. 220th St, Torrance CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('1785 W. 220th St');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  it('Format B: short street/city names "12 A St, B City CA 90501"', () => {
    const r = parseAddressString('12 A St, B City CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('12 A St');
    expect(r.city).toBe('B City');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  // Format C — Square import legacy "Line1, City, ST, ZIP"
  it('Format C: extra comma between state and zip', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA, 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  // Format D — ZIP+4
  it('Format D: preserves zip+4', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 90501-1234');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501-1234');
  });

  // Cross-format normalization + whitespace
  it('normalizes lowercase state to uppercase (city case preserved)', () => {
    const r = parseAddressString('23742 falena ave, torrance, ca 90501');
    expect(r.confidence).toBe('high');
    expect(r.state).toBe('CA');
    expect(r.address_line_1).toBe('23742 falena ave');
    expect(r.city).toBe('torrance');
  });

  it('trims surrounding whitespace', () => {
    const r = parseAddressString('  23742 Falena Ave, Torrance, CA 90501  ');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
  });

  it('tolerates extra interior whitespace and stray spaces around commas', () => {
    const r = parseAddressString(
      '  123 Main St ,  Torrance ,  CA   90501  '
    );
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('123 Main St');
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  // LOW-confidence fallbacks (must always leave non-line_1 fields null)
  it('LOW: no commas anywhere — too ambiguous to delimit street from city', () => {
    const r = parseAddressString('123 Main St Torrance CA 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('123 Main St Torrance CA 90501');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: just street, no city/state/zip', () => {
    const r = parseAddressString('23742 Falena Ave');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: state+zip but no street/city ("CA 90501" alone)', () => {
    const r = parseAddressString('CA 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('CA 90501');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: full state name instead of 2-letter code', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, California 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe(
      '23742 Falena Ave, Torrance, California 90501'
    );
  });

  it('LOW: malformed zip (4 digits)', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 9050');
    expect(r.confidence).toBe('low');
  });

  it('LOW: text with trailing digits but no state code', () => {
    const r = parseAddressString('Random text 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('Random text 90501');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('empty string → low with empty line1', () => {
    const r = parseAddressString('');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('whitespace-only string → low with empty line1', () => {
    const r = parseAddressString('   ');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('');
  });

  it('random text → low with text as line1', () => {
    const r = parseAddressString('Just some random text');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('Just some random text');
  });
});

describe('normalizeAddressForCompare', () => {
  it('null/undefined → empty string', () => {
    expect(normalizeAddressForCompare(null)).toBe('');
    expect(normalizeAddressForCompare(undefined)).toBe('');
    expect(normalizeAddressForCompare('')).toBe('');
  });

  it('punctuation/case-insensitive equivalence', () => {
    const a = normalizeAddressForCompare('123 Main St, Torrance, CA 90501');
    const b = normalizeAddressForCompare('123 Main St., torrance, ca 90501');
    expect(a).toBe(b);
  });

  it('whitespace collapse', () => {
    const a = normalizeAddressForCompare('123 Main St   Torrance');
    const b = normalizeAddressForCompare('123 Main St Torrance');
    expect(a).toBe(b);
  });

  it('different addresses do NOT match', () => {
    const a = normalizeAddressForCompare('123 Main St, Torrance, CA 90501');
    const b = normalizeAddressForCompare('456 Oak Ave, Lomita, CA 90717');
    expect(a).not.toBe(b);
  });

  it('empty values equal each other', () => {
    expect(normalizeAddressForCompare(null)).toBe(normalizeAddressForCompare(''));
    expect(normalizeAddressForCompare('   ')).toBe(normalizeAddressForCompare(undefined));
  });
});
