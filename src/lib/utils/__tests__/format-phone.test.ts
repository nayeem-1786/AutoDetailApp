import { describe, it, expect } from 'vitest';
import { formatPhone, formatPhoneInput, normalizePhone } from '@/lib/utils/format';

// Phase Phone-UX-1 (LOCKED-2): formatPhone() is the canonical display helper.
// Returns "" for null/undefined/empty/unparseable; "(XXX) XXX-XXXX" otherwise.
// Each renderer decides what to substitute for the empty case.
describe('formatPhone — null safety', () => {
  it('returns empty string for null', () => {
    expect(formatPhone(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatPhone(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(formatPhone('')).toBe('');
  });

  it('returns empty string for unparseable input', () => {
    expect(formatPhone('not-a-phone')).toBe('');
    expect(formatPhone('123')).toBe('');
    expect(formatPhone('+44 20 7946 0958')).toBe(''); // non-US (12 digits)
  });

  it('formats E.164 (+1 prefix) to pretty', () => {
    expect(formatPhone('+13105551234')).toBe('(310) 555-1234');
  });

  it('formats bare 10-digit input to pretty', () => {
    expect(formatPhone('3105551234')).toBe('(310) 555-1234');
  });

  it('formats 11-digit input starting with 1 to pretty', () => {
    expect(formatPhone('13105551234')).toBe('(310) 555-1234');
  });
});

describe('formatPhoneInput — live formatting while typing', () => {
  it('formats partial input progressively', () => {
    expect(formatPhoneInput('3')).toBe('(3');
    expect(formatPhoneInput('310')).toBe('(310');
    expect(formatPhoneInput('3105')).toBe('(310) 5');
    expect(formatPhoneInput('310555')).toBe('(310) 555');
    expect(formatPhoneInput('3105551')).toBe('(310) 555-1');
    expect(formatPhoneInput('3105551234')).toBe('(310) 555-1234');
  });

  it('strips leading country code 1 when 11 digits typed', () => {
    expect(formatPhoneInput('13105551234')).toBe('(310) 555-1234');
  });

  it('caps at 10 digits', () => {
    expect(formatPhoneInput('31055512349999')).toBe('(310) 555-1234');
  });

  it('strips non-digits while typing', () => {
    expect(formatPhoneInput('(310)555abc-1234')).toBe('(310) 555-1234');
  });

  it('returns empty for empty input', () => {
    expect(formatPhoneInput('')).toBe('');
  });
});

// Sanity check: formatted output round-trips through normalizePhone.
describe('formatPhone ↔ normalizePhone round-trip', () => {
  it('formatPhone output round-trips to E.164 via normalizePhone', () => {
    const formatted = formatPhone('+13105551234');
    expect(formatted).toBe('(310) 555-1234');
    expect(normalizePhone(formatted)).toBe('+13105551234');
  });
});
