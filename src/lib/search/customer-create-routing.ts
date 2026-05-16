/**
 * Routes a Find Customer search query into the New Customer form when the
 * search returns no results. Pure function so it stays trivially testable.
 *
 * Rules (in priority order, applied to the trimmed query):
 *   1. Empty → no prefill
 *   2. Phone-shaped (7-15 digits with only `( ) - space + .` separators)
 *      → Mobile, formatted as `(XXX) XXX-XXXX` for US 10/11-digit input or
 *      raw-trimmed for anything else (operator edits international shapes)
 *   3. Contains `@` → Email (verbatim, trim only)
 *   4. Single word (no whitespace) → First Name verbatim
 *   5. Multi-word → split on first whitespace run; first token → First Name,
 *      remainder → Last Name
 *
 * Phone detection reuses {@link isPhoneQuery} from `./tokenize` (same
 * primitive used by the customer-search executor) so the two stay aligned.
 */

import { isPhoneQuery, normalizePhoneDigits } from './tokenize';
import { formatPhoneInput } from '@/lib/utils/format';

export type RoutedField =
  | 'none'
  | 'phone'
  | 'email'
  | 'firstName'
  | 'firstNameLastName';

export interface RoutedPrefill {
  field: RoutedField;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
}

const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

export function routeSearchInput(rawQuery: string): RoutedPrefill {
  const query = (rawQuery ?? '').trim();
  if (!query) return { field: 'none' };

  if (isPhoneQuery(query, PHONE_MIN_DIGITS)) {
    const digits = normalizePhoneDigits(query);
    if (digits.length <= PHONE_MAX_DIGITS) {
      return { field: 'phone', mobile: formatMobileForPrefill(query, digits) };
    }
  }

  if (query.includes('@')) {
    return { field: 'email', email: query };
  }

  const parts = query.split(/\s+/);
  if (parts.length === 1) {
    return { field: 'firstName', firstName: parts[0] };
  }

  const [firstName, ...rest] = parts;
  return {
    field: 'firstNameLastName',
    firstName,
    lastName: rest.join(' '),
  };
}

function formatMobileForPrefill(query: string, digits: string): string {
  if (digits.length === 10) return formatPhoneInput(query);
  if (digits.length === 11 && digits.startsWith('1')) {
    return formatPhoneInput(query);
  }
  // International or otherwise non-US shape — preserve operator's input
  // so they can correct or convert it manually. The Mobile field's
  // onChange will format-on-edit if they re-type any portion.
  return query;
}
