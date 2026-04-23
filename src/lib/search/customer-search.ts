import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isMultiWord,
  firstWordPattern,
  multiWordMatch,
  normalizePhoneDigits,
  isPhoneQuery,
} from './tokenize';

/**
 * Unified customer search.
 *
 * Three code paths:
 *  - Phone branch (digits with only phone formatting chars): substring match
 *    on the `phone` column only.
 *  - Name single-word branch: OR ILIKE across [first_name, last_name, email,
 *    phone] ∪ nameFields.
 *  - Name multi-word branch: broad-fetch first-word OR across the same
 *    field union up to `broadLimit`, then client-side intersect every word
 *    against the concatenation of the same field union. Order-independent.
 *
 * The baseline intersect fields [first_name, last_name, email, phone] are
 * always included. `nameFields` adds to the baseline — it does not replace
 * it.
 *
 * See docs/audits/SEARCH_UNIFICATION_SESSION42H.md §4 Strategy B.
 */

export interface SearchCustomersOptions {
  /** Maximum rows returned. Default 10. */
  limit?: number;
  /** DB-side broad-fetch cap for multi-word intersect. Default 50. */
  broadLimit?: number;
  /** Include soft-deleted customers. Default false. */
  includeDeleted?: boolean;
  /**
   * Supabase column projection. Default
   * `'id, first_name, last_name, phone, email'`.
   */
  select?: string;
  /**
   * Extra fields to participate in name-branch DB search AND in multi-word
   * intersect. Added to the baseline — never replaces it. Default `[]`.
   */
  nameFields?: string[];
}

export interface CustomerSearchResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  [key: string]: unknown;
}

const DEFAULT_SELECT = 'id, first_name, last_name, phone, email';
const DEFAULT_LIMIT = 10;
const DEFAULT_BROAD_LIMIT = 50;
const BASELINE_FIELDS = ['first_name', 'last_name', 'email', 'phone'];

export async function searchCustomers(
  supabase: SupabaseClient,
  rawQuery: string,
  options: SearchCustomersOptions = {}
): Promise<{ data: CustomerSearchResult[]; error: Error | null }> {
  const query = (rawQuery ?? '').trim();
  if (!query) return { data: [], error: null };

  const {
    limit = DEFAULT_LIMIT,
    broadLimit = DEFAULT_BROAD_LIMIT,
    includeDeleted = false,
    select = DEFAULT_SELECT,
    nameFields = [],
  } = options;

  const searchFields = Array.from(new Set([...BASELINE_FIELDS, ...nameFields]));

  // Phone branch: substring match on phone column only.
  if (isPhoneQuery(query)) {
    const digits = normalizePhoneDigits(query);
    let q = supabase
      .from('customers')
      .select(select)
      .like('phone', `%${digits}%`)
      .order('last_name')
      .limit(limit);
    if (!includeDeleted) q = q.is('deleted_at', null);
    const { data, error } = await q;
    return {
      data: (data ?? []) as unknown as CustomerSearchResult[],
      error: (error as Error | null) ?? null,
    };
  }

  // Name multi-word branch: broad fetch first word, intersect all words.
  if (isMultiWord(query)) {
    const pattern = firstWordPattern(query);
    const orExpr = searchFields.map((f) => `${f}.ilike.${pattern}`).join(',');
    let q = supabase
      .from('customers')
      .select(select)
      .or(orExpr)
      .order('last_name')
      .limit(broadLimit);
    if (!includeDeleted) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) return { data: [], error: error as Error };
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const matched = multiWordMatch(rows, query, searchFields, limit);
    return { data: matched as unknown as CustomerSearchResult[], error: null };
  }

  // Name single-word branch: OR across all search fields.
  const pattern = `%${query}%`;
  const orExpr = searchFields.map((f) => `${f}.ilike.${pattern}`).join(',');
  let q = supabase
    .from('customers')
    .select(select)
    .or(orExpr)
    .order('last_name')
    .limit(limit);
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  return {
    data: (data ?? []) as unknown as CustomerSearchResult[],
    error: (error as Error | null) ?? null,
  };
}
