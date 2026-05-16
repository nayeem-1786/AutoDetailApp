import { describe, it, expect } from 'vitest';
import { routeSearchInput } from '../customer-create-routing';

describe('routeSearchInput — empty', () => {
  it('returns field=none for empty string', () => {
    expect(routeSearchInput('')).toEqual({ field: 'none' });
  });

  it('returns field=none for whitespace-only', () => {
    expect(routeSearchInput('   ')).toEqual({ field: 'none' });
    expect(routeSearchInput('\t\n  ')).toEqual({ field: 'none' });
  });

  it('treats null/undefined as empty', () => {
    expect(routeSearchInput(null as unknown as string)).toEqual({ field: 'none' });
    expect(routeSearchInput(undefined as unknown as string)).toEqual({ field: 'none' });
  });
});

describe('routeSearchInput — phone', () => {
  it('routes 10 raw digits to formatted US Mobile', () => {
    expect(routeSearchInput('3105551212')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('routes pre-formatted US phone to formatted Mobile', () => {
    expect(routeSearchInput('(310) 555-1212')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('routes dashed US phone to formatted Mobile', () => {
    expect(routeSearchInput('310-555-1212')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('routes dotted US phone to formatted Mobile', () => {
    expect(routeSearchInput('310.555.1212')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('strips leading +1 from 11-digit US phone', () => {
    expect(routeSearchInput('+1 310 555 1212')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('preserves international phone shape verbatim', () => {
    const result = routeSearchInput('+44 20 1234 5678');
    expect(result.field).toBe('phone');
    expect(result.mobile).toBe('+44 20 1234 5678');
  });

  it('preserves whitespace-padded input after trim', () => {
    expect(routeSearchInput('  3105551212  ')).toEqual({
      field: 'phone',
      mobile: '(310) 555-1212',
    });
  });

  it('rejects fewer than 7 digits (routes as name instead)', () => {
    // 6 digits — too few for phone, treated as single-word name
    expect(routeSearchInput('123456')).toEqual({
      field: 'firstName',
      firstName: '123456',
    });
  });

  it('rejects more than 15 digits (routes as name instead)', () => {
    const sixteenDigits = '1234567890123456';
    expect(routeSearchInput(sixteenDigits)).toEqual({
      field: 'firstName',
      firstName: sixteenDigits,
    });
  });

  it('accepts 7-digit minimum boundary', () => {
    const result = routeSearchInput('5551212');
    expect(result.field).toBe('phone');
    expect(result.mobile).toBe('5551212');
  });
});

describe('routeSearchInput — email', () => {
  it('routes email to Email field verbatim', () => {
    expect(routeSearchInput('john@example.com')).toEqual({
      field: 'email',
      email: 'john@example.com',
    });
  });

  it('trims surrounding whitespace on email', () => {
    expect(routeSearchInput('  jane@example.com  ')).toEqual({
      field: 'email',
      email: 'jane@example.com',
    });
  });

  it('routes partial email-like string to Email', () => {
    expect(routeSearchInput('jane@')).toEqual({
      field: 'email',
      email: 'jane@',
    });
  });

  it('routes email with spaces to Email (verbatim minus outer trim)', () => {
    // Spaces in middle disqualify it from name-routing because of the @
    expect(routeSearchInput('jane doe@example.com')).toEqual({
      field: 'email',
      email: 'jane doe@example.com',
    });
  });
});

describe('routeSearchInput — first name only', () => {
  it('routes single word to First Name', () => {
    expect(routeSearchInput('Tom')).toEqual({
      field: 'firstName',
      firstName: 'Tom',
    });
  });

  it('preserves case', () => {
    expect(routeSearchInput('john')).toEqual({
      field: 'firstName',
      firstName: 'john',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(routeSearchInput('  Tom  ')).toEqual({
      field: 'firstName',
      firstName: 'Tom',
    });
  });
});

describe('routeSearchInput — first + last name', () => {
  it('splits two words on whitespace', () => {
    expect(routeSearchInput('Tom Jones')).toEqual({
      field: 'firstNameLastName',
      firstName: 'Tom',
      lastName: 'Jones',
    });
  });

  it('first token is First Name, remainder joined as Last Name', () => {
    expect(routeSearchInput('Tom Anderson Smith')).toEqual({
      field: 'firstNameLastName',
      firstName: 'Tom',
      lastName: 'Anderson Smith',
    });
  });

  it('collapses runs of whitespace in the remainder to single spaces', () => {
    expect(routeSearchInput('Tom   Anderson   Smith')).toEqual({
      field: 'firstNameLastName',
      firstName: 'Tom',
      lastName: 'Anderson Smith',
    });
  });

  it('trims outer whitespace before splitting', () => {
    expect(routeSearchInput('  Tom Jones  ')).toEqual({
      field: 'firstNameLastName',
      firstName: 'Tom',
      lastName: 'Jones',
    });
  });
});
