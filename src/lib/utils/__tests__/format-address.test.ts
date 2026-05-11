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
  it('parses canonical "line1, city, ST zip" as high confidence', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  it('parses with line2 — "line1, line2, city, ST zip" as high', () => {
    const r = parseAddressString('23742 Falena Ave, Apt 4, Torrance, CA 90501');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBe('Apt 4');
    expect(r.city).toBe('Torrance');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
  });

  it('preserves zip+4', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 90501-1234');
    expect(r.confidence).toBe('high');
    expect(r.zip).toBe('90501-1234');
  });

  it('normalizes lowercase state to uppercase', () => {
    const r = parseAddressString('23742 falena ave, torrance, ca 90501');
    expect(r.confidence).toBe('high');
    expect(r.state).toBe('CA');
    expect(r.address_line_1).toBe('23742 falena ave');
    expect(r.city).toBe('torrance');
  });

  it('falls back to low confidence — no commas', () => {
    const r = parseAddressString('23742 Falena Ave Torrance California 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('23742 Falena Ave Torrance California 90501');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('falls back to low confidence — just street', () => {
    const r = parseAddressString('23742 Falena Ave');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.city).toBeNull();
  });

  it('falls back to low confidence — full state name instead of 2-letter', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, California 90501');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('23742 Falena Ave, Torrance, California 90501');
  });

  it('falls back to low confidence — bad zip', () => {
    const r = parseAddressString('23742 Falena Ave, Torrance, CA 9050');
    expect(r.confidence).toBe('low');
  });

  it('empty string → low with empty line1', () => {
    const r = parseAddressString('');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('');
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

  it('trims surrounding whitespace', () => {
    const r = parseAddressString('  23742 Falena Ave, Torrance, CA 90501  ');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
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
