/**
 * Shared tokenization helpers for search utilities.
 *
 * Implements the first-word-broad-fetch + all-words-intersection pattern
 * originally inlined in /api/admin/global-search/route.ts. Extracted here
 * so per-entity search utilities (searchCustomers, future searchProducts,
 * etc.) can compose the same primitives.
 *
 * See docs/audits/SEARCH_UNIFICATION_SESSION42H.md §4 Strategy B.
 */

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
}

/** True iff the query has more than one non-empty whitespace-separated word. */
export function isMultiWord(query: string): boolean {
  return tokenize(query).length > 1;
}

/**
 * Returns an ILIKE-ready pattern built from the first word of the query,
 * e.g. `firstWordPattern('omar cuvias')` -> `'%omar%'`. Used to broadly
 * pre-fetch candidate rows before the client-side multi-word intersection.
 */
export function firstWordPattern(query: string): string {
  const first = query.split(/\s+/)[0] || query;
  return `%${first}%`;
}

/**
 * Keeps only items whose concatenation of `fields` (space-joined,
 * case-insensitive) contains every whitespace-separated word in `query`.
 * Order-independent: `"omar cuvias"` and `"cuvias omar"` match the same row.
 *
 * If the query has zero or one word the filter is skipped — caller should
 * use the single-word DB branch instead.
 */
export function multiWordMatch<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  fields: (keyof T & string)[],
  limit?: number
): T[] {
  const words = tokenize(query);
  if (words.length <= 1) {
    return limit != null ? items.slice(0, limit) : items;
  }
  const filtered = items.filter((item) => {
    const text = fields.map((f) => String(item[f] ?? '')).join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
  return limit != null ? filtered.slice(0, limit) : filtered;
}

/** Strips all non-digit characters. Empty string if the input has none. */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * True iff the query looks like a phone number:
 * (1) at least `minDigits` digits remain after stripping non-digits, AND
 * (2) every non-digit character is a recognized phone formatting char
 *     (whitespace, parens, dots, dashes, plus).
 *
 * Rejects anything with letters, so `"omar 310"` → false (routes to name
 * branch), while `"+1 (310) 756-4789"` → true (routes to phone branch).
 */
export function isPhoneQuery(query: string, minDigits = 2): boolean {
  const digits = normalizePhoneDigits(query);
  if (digits.length < minDigits) return false;
  const formattingStripped = query.replace(/[\s().\-+]/g, '');
  return digits.length === formattingStripped.length;
}
