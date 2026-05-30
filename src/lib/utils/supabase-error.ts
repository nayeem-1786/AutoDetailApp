// Item: Catalog S3 (Session #111) — surface the REAL Postgres/Supabase error
// instead of a fixed generic toast string, so future constraint violations are
// visible at the UI (generic "Failed to create service" toasts hid the C1
// missing-slug NOT-NULL bug for months). Generalizes the one-off message
// inspection at `admin/catalog/categories/page.tsx:252-253`.
//
// Browser-client + RLS pattern (architecture LOCKED): catalog mutations run via
// `createClient()` and surface `PostgrestError`s in the catch block. This helper
// maps the well-known SQLSTATE codes + named constraints to operator-friendly
// text, and otherwise falls back to the raw message, then the caller's fallback.

interface PostgrestLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

function asPostgrestLike(err: unknown): PostgrestLike | null {
  if (err && typeof err === 'object') return err as PostgrestLike;
  return null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// Friendly text for specific named constraints (checked before the generic
// per-SQLSTATE wording). Match against message/details which include the
// constraint name for 23xxx violations.
const CONSTRAINT_MESSAGES: Array<{ match: RegExp; message: string }> = [
  { match: /chk_service_sale_price|service.*sale.*price/i, message: 'Sale price must be lower than the regular price.' },
  { match: /services_slug_key|services_slug/i, message: 'A service with this URL slug already exists. Choose a different slug.' },
  { match: /products_slug_key|products_slug/i, message: 'A product with this URL slug already exists. Choose a different slug.' },
  { match: /_slug_key|_slug_unique/i, message: 'That URL slug is already in use. Choose a different one.' },
  // Session #124 — Admin Services Edit duplicate-add guards (sibling to the
  // #123 prereq dropdown fix). Live constraint names per docs/dev/DB_SCHEMA.md:
  //   service_prerequisites_service_id_prerequisite_service_id_key
  //   service_addon_suggestions_primary_service_id_addon_service__key
  // (the add-on name has a double underscore — Postgres truncates auto-generated
  // names at 63 chars, dropping characters mid-name). The regexes are written
  // permissively (`.*key` tail) so a future rename / re-truncation does not
  // silently downgrade to the generic 23505 wording.
  { match: /service_prerequisites_service_id_prerequisite_service_id.*key/i, message: 'That prerequisite is already configured for this service.' },
  { match: /service_addon_suggestions_primary_service_id_addon_service.*key/i, message: 'That add-on is already configured for this service.' },
];

/**
 * Extract an operator-useful message from a Supabase/Postgres error.
 *
 * Resolution order:
 *  1. Known named-constraint match (sale-price check, slug unique, …).
 *  2. SQLSTATE-class wording: 23502 NOT NULL, 23505 unique, 23514 check, 23503 FK.
 *  3. The raw `.message` (often the most informative).
 *  4. The caller's `fallback` string.
 */
export function describeSupabaseError(err: unknown, fallback: string): string {
  const e = asPostgrestLike(err);
  if (!e) return fallback;

  const message = str(e.message);
  const details = str(e.details);
  const code = str(e.code);
  const haystack = `${message} ${details}`;

  // 1. Named constraints (most specific).
  for (const c of CONSTRAINT_MESSAGES) {
    if (c.match.test(haystack)) return c.message;
  }

  // 2. SQLSTATE class wording. For NOT-NULL, surface the offending column when present.
  switch (code) {
    case '23502': {
      // PostgREST NOT-NULL detail/message often names the column.
      const col = /column "([^"]+)"/.exec(haystack)?.[1];
      return col
        ? `Required field "${col}" is missing.`
        : 'A required field is missing.';
    }
    case '23505':
      return 'That value must be unique — a record with the same value already exists.';
    case '23514':
      return 'A value failed a database rule (check constraint). Review the entered values.';
    case '23503':
      return 'A referenced record does not exist (foreign key).';
    default:
      break;
  }

  // 3. Raw message, then 4. fallback.
  return message || fallback;
}
