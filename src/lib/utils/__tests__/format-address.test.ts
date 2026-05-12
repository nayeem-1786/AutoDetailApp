import { describe, it, expect } from 'vitest';
import {
  formatCustomerAddress,
  parseAddressString,
  normalizeAddressForCompare,
  addressesDiffer,
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

  // Cross-format normalization + whitespace + title-casing
  it('normalizes lowercase state to uppercase and title-cases line/city', () => {
    const r = parseAddressString('23742 falena ave, torrance, ca 90501');
    expect(r.confidence).toBe('high');
    expect(r.state).toBe('CA');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.city).toBe('Torrance');
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

  // Phase Mobile-1.4 expected this input to be LOW because no 2-letter
  // state code is present. Phase Mobile-1.5 added Pass 2 (zip-only with
  // "CA" defaulted), which now matches the zip suffix and segments the
  // 3-comma remainder into line_1 / line_2 / city. The result: the full
  // state name "California" lands in the city field. This is an algorithm
  // artifact — distinguishing "Line2, City" from "City, FullStateName"
  // requires a state-name dictionary, which Phase 1.5 deliberately did
  // not add (LOCKED-6 stays narrow: no greedy parsing, no extra heuristics).
  // Cashier guidance: use the 2-letter state code, or omit state entirely.
  it('Phase 1.5 artifact: full state name typed lands in city, state defaulted to CA', () => {
    const r = parseAddressString(
      '23742 Falena Ave, Torrance, California 90501'
    );
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('23742 Falena Ave');
    expect(r.address_line_2).toBe('Torrance');
    expect(r.city).toBe('California');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90501');
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

  // Format E (Phase Mobile-1.5) — "Line1, City ZIP" (no state code), state
  // defaulted to "CA". Common cashier shorthand for a single-state business.
  it('Format E: "Street, City ZIP" defaults state to CA', () => {
    const r = parseAddressString('1234 Main St, Lomita 90717');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('1234 Main St');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717');
  });

  it('Format E: title-cases lowercase line/city; state defaulted to CA', () => {
    const r = parseAddressString('1234 test st., lomita 90717');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('1234 Test St.');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717');
  });

  it('Format E: with line_2', () => {
    const r = parseAddressString('1234 Main St, Apt 4, Lomita 90717');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('1234 Main St');
    expect(r.address_line_2).toBe('Apt 4');
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717');
  });

  it('Format E: preserves ZIP+4', () => {
    const r = parseAddressString('1234 Main St, Lomita 90717-1234');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('1234 Main St');
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717-1234');
  });

  // LOCKED-2: comma between street and city REQUIRED. Fully comma-less
  // inputs are LOW even when they end in a recognizable zip.
  // LOCKED-5: LOW never defaults state — partial extractions discarded.
  it('LOW: Format E shape without a comma — state stays null (not "CA")', () => {
    const r = parseAddressString('1234 Main St Lomita 90717');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('1234 Main St Lomita 90717');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: lowercase no-comma Format E shape — state stays null', () => {
    const r = parseAddressString('1234 test st. lomita 90717');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('1234 test st. lomita 90717');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: "City ZIP" alone (no comma, no street) — state stays null', () => {
    const r = parseAddressString('Lomita 90717');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('Lomita 90717');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  it('LOW: bare ZIP — state stays null', () => {
    const r = parseAddressString('90717');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('90717');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  // Title-casing — HIGH applies it to line_1/line_2/city; LOW preserves
  // the user's typed string verbatim.
  it('title-case: Format E lowercase input title-cases line_1 and city', () => {
    const r = parseAddressString('2012 lomita blvd., lomita 90717');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('2012 Lomita Blvd.');
    expect(r.city).toBe('Lomita');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90717');
  });

  it('title-case: Format A with line_2 title-cases all three fields', () => {
    const r = parseAddressString('456 oak ave, apt 4b, santa monica, ca 90401');
    expect(r.confidence).toBe('high');
    expect(r.address_line_1).toBe('456 Oak Ave');
    expect(r.address_line_2).toBe('Apt 4b');
    expect(r.city).toBe('Santa Monica');
    expect(r.state).toBe('CA');
    expect(r.zip).toBe('90401');
  });

  it('title-case: LOW input is preserved verbatim (no title-casing)', () => {
    const r = parseAddressString('random unparseable text');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('random unparseable text');
    expect(r.address_line_2).toBeNull();
    expect(r.city).toBeNull();
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
  });

  // Regression guard: Pass 1 matched a state code but couldn't segment.
  // After Phase 1.5 the two-pass strategy must NOT fall through to Pass 2's
  // CA default — the user typed a state, we don't overwrite it.
  it('LOW (Pass 1 detected state code, segments<2): state stays null, not "CA"', () => {
    const r = parseAddressString('Lomita CA 90717');
    expect(r.confidence).toBe('low');
    expect(r.address_line_1).toBe('Lomita CA 90717');
    expect(r.state).toBeNull();
    expect(r.zip).toBeNull();
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

describe('addressesDiffer (Phase Mobile-1.6 canonical diff)', () => {
  // The bug case that motivated Concern 1: cashier-typed Format-B input
  // against a profile holding the same structured fields. Pre-1.6 the
  // concat-then-normalize path was the diff source of truth; the new
  // path compares fields directly through parseAddressString.
  it('returns false when entered Format B matches structured profile (the bug case)', () => {
    const r = addressesDiffer(
      {
        address_line_1: '2021 Lomita Blvd.',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '2021 Lomita Blvd., Lomita CA 90717'
    );
    expect(r).toBe(false);
  });

  it('returns true when entered street differs from profile street', () => {
    const r = addressesDiffer(
      {
        address_line_1: '2021 Lomita Blvd.',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '456 Oak Ave, Lomita 90717'
    );
    expect(r).toBe(true);
  });

  it('returns false when both sides are empty/null', () => {
    const r = addressesDiffer(
      {
        address_line_1: null,
        address_line_2: null,
        city: null,
        state: null,
        zip: null,
      },
      ''
    );
    expect(r).toBe(false);
  });

  it('returns false on case-insensitive equivalence', () => {
    const r = addressesDiffer(
      {
        address_line_1: '2021 Lomita Blvd.',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '2021 LOMITA BLVD., LOMITA CA 90717'
    );
    expect(r).toBe(false);
  });

  it('returns false when entered string has surrounding whitespace', () => {
    const r = addressesDiffer(
      {
        address_line_1: '2021 Lomita Blvd.',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '  2021 Lomita Blvd., Lomita CA 90717  '
    );
    expect(r).toBe(false);
  });

  it('returns true when profile has line_2 but entered string omits it', () => {
    const r = addressesDiffer(
      {
        address_line_1: '2021 Lomita Blvd.',
        address_line_2: 'Apt 4',
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '2021 Lomita Blvd., Lomita CA 90717'
    );
    expect(r).toBe(true);
  });

  it('returns false when Format E (no state code) entered matches a CA-state profile', () => {
    // Phase 1.5: parseAddressString defaults state to "CA" when omitted.
    // A CA-state profile must therefore agree with the parsed default.
    const r = addressesDiffer(
      {
        address_line_1: '1234 Main St',
        address_line_2: null,
        city: 'Lomita',
        state: 'CA',
        zip: '90717',
      },
      '1234 Main St, Lomita 90717'
    );
    expect(r).toBe(false);
  });
});
