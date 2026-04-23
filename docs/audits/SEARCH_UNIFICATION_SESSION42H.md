# Customer + Global Search Unification Audit — Session 42H

**Date:** 2026-04-22
**Scope:** Every customer-search surface in the app (POS, admin, booking, voice agent, messaging) + the admin command palette global search.
**Trigger:** Diagnostic session flagged POS customer lookup returning zero results for multi-word queries like `"omar cuvias"`. Root cause: per-column ILIKE with no name concatenation — the query matches neither `first_name ILIKE '%omar cuvias%'` nor `last_name ILIKE '%omar cuvias%'`. Investigation also surfaced a wasted `idx_customers_search` GIN index, a broken admin-photos customer filter, and duplicated tokenization logic across endpoints.
**Kind:** READ-ONLY design audit. Zero code changes. Output drives Session 42H-rewrite.

---

## Executive summary

**Problem.** Nine independent customer-search implementations exist across POS + admin. Five of them share the same multi-word bug: `.or('first_name.ilike.%TERM%,last_name.ilike.%TERM%')` cannot match a query that spans both name columns. The two that *do* work use different mechanisms:

- `/admin/customers` page — client-side filter on a 5000-row preload, concatenates `${first_name} ${last_name}` before matching.
- `/api/admin/global-search` — DB fetches broadly with the first word only, then client-side multi-word intersection.

Two additional issues surfaced during the inventory:
1. **`GET /api/admin/customers?search=...` is called by `/admin/photos` but that route has no `GET` handler.** The photos-page customer filter is currently broken (returns 405, swallowed by `res.ok` check — silent failure).
2. **The `idx_customers_search` GIN tsvector index exists but is never consulted.** Every caller uses per-column ILIKE sequential scans. At current volume (~5000 customers) this is correct but wasteful; at 10× the volume, none of these endpoints would scale.

**Recommendation — Strategy B (shared utility).** Create `src/lib/search/customer-search.ts` that implements the proven **first-word-broad-fetch + all-words-intersection-filter** pattern already used by `/api/admin/global-search`. Every API endpoint and direct Supabase call site delegates to it. No RPC, no new extension, no index changes. The existing GIN index remains unused (accept as dead weight for now — adding a tsvector/RPC path is a separable follow-up if 10× growth materializes).

Do **not** adopt Strategy C (Postgres RPC) in this round. Full-text tsvector is word-tokenized and stemmed: a typeahead query like `"cuvi"` would not match `"cuvias"` without trigrams, and `pg_trgm` is not currently installed. The RPC route becomes attractive only if the app grows past ~20k customers or adds typeahead UX requirements; until then it adds migration + testability cost without user-visible benefit.

**Secondary finding.** The audit premise — "fix the POS bug via architectural consolidation" — holds. A per-endpoint patch would also work (each broken endpoint needs the same 10-line change), but five callers is enough duplication to justify extracting the utility. The utility *is* the root-cause fix: the "bug" is that five callers each reimplement tokenization differently and four of them get it wrong.

---

## Problem statement (with evidence)

### The POS bug — `"omar cuvias"` returns zero results

`src/app/api/pos/customers/search/route.ts:27-42`

```ts
let query = supabase
  .from('customers')
  .select('id, first_name, last_name, phone, email, ...')
  .is('deleted_at', null)
  .order('last_name')
  .limit(10);

if (isPhoneSearch) {
  query = query.like('phone', `%${digits}%`);
} else {
  query = query.or(
    `first_name.ilike.%${term}%,last_name.ilike.%${term}%`
  );
}
```

For `term = "omar cuvias"`:
- `first_name ILIKE '%omar cuvias%'` → no match (first_name is `"Omar"`)
- `last_name  ILIKE '%omar cuvias%'` → no match (last_name is `"Cuvias"`)

Neither column contains the full string, so the row is dropped. There's no concatenation step that joins `first_name + ' ' + last_name` before matching.

Same bug, three more endpoints:
- `src/app/api/admin/customers/search/route.ts:42`
- `src/app/api/admin/jobs/route.ts:47` (customer-id lookup for jobs filter)
- `src/app/api/admin/photos/route.ts:45`
- `src/app/admin/transactions/page.tsx:262` (direct Supabase client)
- `src/app/admin/marketing/compliance/page.tsx:106` (direct Supabase client)

### The admin-customers-list escape hatch

`src/app/admin/customers/page.tsx:349-381`

```ts
let custQuery = supabase.from('customers').select('*').order('first_name').limit(5000);
// ...
let result = customers.filter((c) => {
  if (table.debouncedSearch) {
    const q = table.debouncedSearch.toLowerCase();
    const matchesName  = `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
    const matchesPhone = c.phone?.includes(q) || formatPhone(c.phone || '').includes(q);
    const matchesEmail = c.email?.toLowerCase().includes(q);
    if (!matchesName && !matchesPhone && !matchesEmail) return false;
  }
  // ...
});
```

This page does NOT call any search API. It loads all 5000 active customers into the browser and filters in-memory. **Multi-word works** because the filter concatenates names before `.includes()`. This is why "the app's main customer list page" doesn't expose the bug — users who only search there never notice the POS failing.

The 5000-row preload is out of scope for this audit per the prompt constraint.

### The global-search approach — already solves multi-word correctly

`src/app/api/admin/global-search/route.ts:20-33, 192-205`

```ts
function multiWordMatch(items, query, fields, limit) {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 1) return items.slice(0, limit);
  return items.filter((item) => {
    const text = fields.map(f => String(item[f] ?? '')).join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  }).slice(0, limit);
}

// Caller: DB fetches first-word-only broadly (50 rows), then intersects all words
const multi = isMultiWord(q);
const dbPattern = multi ? firstWordPattern(q) : `%${q}%`;
const broadLimit = multi ? 50 : 15;
```

For `"omar cuvias"`: DB fetches all customers matching `%omar%` across any of `first_name|last_name|email|phone` (~few rows). Then the in-memory filter keeps only those whose concatenated `first_name last_name email phone` also contains `"cuvias"`. Correct answer returned.

**This is the pattern the rest of the app should be using.** It is already proven and live in production.

---

## 1. Customer search surface inventory (Phase 1)

### 1a. API endpoints that search customers

| # | Endpoint | File | Fields searched | Tokenization | Concat? | Multi-word? | Scope | Result shape | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `GET /api/pos/customers/search` | `src/app/api/pos/customers/search/route.ts` | `first_name`, `last_name` OR `phone` (digits-only) | None | ❌ | ❌ **BROKEN** | active only (`deleted_at IS NULL`) | `id, first_name, last_name, phone, email, loyalty_points_balance, visit_count, tags, customer_type`, limit 10, order by `last_name` | POS main lookup. Phone branch works; name branch fails multi-word. |
| 2 | `GET /api/admin/customers/search` | `src/app/api/admin/customers/search/route.ts` | `first_name`, `last_name`, `email` OR `phone` (digits) | None | ❌ | ❌ **BROKEN** | active, toggleable via `?include_deleted=true` | `id, first_name, last_name, phone, email, created_at`, limit 10 | Permission: `customers.view`. Same bug. |
| 3 | `GET /api/admin/global-search` (customer block, rows 101-110) | `src/app/api/admin/global-search/route.ts` | `first_name`, `last_name`, `email`, `phone` (mixed) + special phone branch | First word pattern + client-side multi-word intersection | ✅ | ✅ | active only | `id, label, subtitle, href, type` (normalized to palette format), limit 15 | **The reference implementation.** |
| 4 | `GET /api/admin/jobs?search=...` | `src/app/api/admin/jobs/route.ts:33-55` | `first_name`, `last_name` OR `phone` (digits) | None | ❌ | ❌ **BROKEN** | NOT scoped to active | `id` only (then `.in('customer_id', ids)` on jobs) | Two-step: customer IDs → jobs. |
| 5 | `GET /api/admin/photos?search=...` | `src/app/api/admin/photos/route.ts:42-48` | `first_name`, `last_name` | None | ❌ | ❌ **BROKEN** | NOT scoped to active | `id` only, limit 100 | Customer-name filter for photos grid. |
| 6 | `GET /api/pos/transactions/search?q=...` | `src/app/api/pos/transactions/search/route.ts:33-41` | `phone` only (digits ≥ 7) | N/A (exact-ish phone match) | N/A | N/A | NOT scoped to active | `id` only | No name search; phone-only. |
| 7 | `GET /api/admin/orders?search=...` | `src/app/api/admin/orders/route.ts:37-41` | `order_number`, `first_name`, `last_name`, `email` on **orders** table (denormalized guest fields) | None | ❌ | ❌ | N/A | full order row | Not "customers" table but shares the shape. |
| 8 | `GET /api/messaging/conversations?search=...` | `src/app/api/messaging/conversations/route.ts:56-71` | Fetched conversations → filtered in-app on joined `customer.first_name + last_name` + `phone_number` | Single-pass `.includes(term)` on concatenated name | ✅ | ✅ (single token only) | All conversations of given status | full conversations | Works for single-word name or phone; multi-word still single `.includes`, so `"omar cuv"` would fail because name is `"Omar Cuvias"` → lowercase `"omar cuvias"` → `.includes("omar cuv")` ✓ matches. Actually **this one works by accident** for contiguous multi-word. Fails for out-of-order `"cuvias omar"`. |
| 9 | `GET /api/voice-agent/customers?phone=...` | `src/app/api/voice-agent/customers/route.ts:37-45` | `phone` exact (normalized E.164) | N/A | N/A | N/A | active only | single customer | Exact lookup, not search. Out of scope. |
| 10 | `GET /api/pos/customers/check-duplicate?phone=...&email=...` | `src/app/api/pos/customers/check-duplicate/route.ts` | `phone` eq + `email` ilike (both exact after normalize) | N/A | N/A | N/A | active only | single match or `{exists:false}` | Uniqueness check, not search. Out of scope. |

**Legend — "BROKEN" means the multi-word failure demonstrated above.** Single-word queries work for all of them.

### 1b. Client-side search implementations (direct Supabase, not via API)

| # | File | Lines | Fields | Concat? | Multi-word? | Notes |
|---|---|---|---|---|---|---|
| 11 | `src/app/admin/customers/page.tsx` | 370-413 | `${first_name} ${last_name}`, `phone` (raw + formatted), `email` | ✅ | ✅ | 5000-row preload; client-side filter. Works correctly. **Out of scope per prompt.** |
| 12 | `src/app/admin/transactions/page.tsx` | 253-276 | `first_name`, `last_name` OR `phone` (digits) — customer IDs first, then receipt OR customer_id.in(ids) | None | ❌ | ❌ **BROKEN** | Direct Supabase from client. Two-step like jobs route. |
| 13 | `src/app/admin/marketing/compliance/page.tsx` | 86-111 | `first_name`, `last_name` OR `phone` (digits) | None | ❌ | ❌ **BROKEN** | Direct Supabase from client. Returns 10 rows to select from for opt-out tool. |
| 14 | `src/app/admin/appointments/page.tsx` | 79-86 | `${a.customer.first_name} ${a.customer.last_name}` OR `phone` | ✅ | ❌ (single `.includes`) | Client-side filter on already-loaded appointments. Works for contiguous `"omar cuv"`; fails for `"cuvias omar"`. |
| 15 | `src/lib/quotes/quote-service.ts` | 86-98 | `quote_number` (DB) + `${first_name} ${last_name}` + `phone` (client-side on fetched quotes) | ✅ | ❌ (single `.includes`) | Post-fetch client filter on joined customer. Same partial correctness as #14. |

### 1c. Customer pickers / lookup UIs (by caller)

| Surface | File | Calls | Via |
|---|---|---|---|
| POS customer lookup | `src/app/pos/components/customer-lookup.tsx:59` | `/api/pos/customers/search` | #1 |
| POS customer-create-dialog (archived restore flow) | `src/app/pos/components/customer-create-dialog.tsx:345` | `/api/pos/customers/search` (just to refetch after restore) | #1 |
| Admin data-management purge tool | `src/app/admin/settings/data-management/page.tsx:68` | `/api/admin/customers/search?include_deleted=true` | #2 |
| Admin drip-campaign manual enroll | `src/app/admin/marketing/campaigns/drip/_components/drip-enrollments-table.tsx:160` | `/api/admin/customers/search` | #2 |
| Admin coupon-builder "specific customers" picker | `src/app/admin/marketing/coupons/new/page.tsx:562` | `/api/admin/customers/search` | #2 |
| Admin messaging conversation-list filter | `src/app/admin/messaging/...` → `/api/messaging/conversations?search=...` | | #8 |
| Admin command palette (⌘K) | `src/app/admin/admin-shell.tsx:228` | `/api/admin/global-search` | #3 |
| Admin photos customer-filter dropdown | `src/app/admin/photos/page.tsx:249` | `GET /api/admin/customers?search=...` | **BROKEN — route has no GET handler** |
| Admin transactions list search | `src/app/admin/transactions/page.tsx:253` | direct Supabase | #12 |
| Admin jobs list search | `/api/admin/jobs?search=...` | | #4 |
| Admin compliance opt-out tool | `src/app/admin/marketing/compliance/page.tsx:86` | direct Supabase | #13 |
| Admin appointments filter | `src/app/admin/appointments/page.tsx:79` | client-side filter (no API call) | #14 |
| Admin/POS quotes search | `src/lib/quotes/quote-service.ts:86` | post-fetch filter | #15 |

### Finding 1c-α: broken admin-photos customer filter

`src/app/admin/photos/page.tsx:249` hits `GET /api/admin/customers?search=...&limit=10` — but `src/app/api/admin/customers/route.ts` only exports `POST` (customer creation). Next.js returns 405 Method Not Allowed, which the page's `if (res.ok)` swallows; `setCustomerResults([])` fires and the dropdown stays empty. Silent regression. **Photos page customer-name filter is non-functional today.**

---

## 2. Global search / command palette (Phase 2)

### 2a. Admin ⌘K command palette

`src/app/admin/admin-shell.tsx:169-286` — `CommandPalette` component, opened on Cmd+K or ⌘K button, 300ms debounce, single fetch to `/api/admin/global-search?q=...`. Result shape is already normalized into `{ id, label, subtitle, href, type }` tuples. UI groups by type and renders sections.

**Entities searched (9):**

| Entity | Fields | Tokenization | Multi-word OK? |
|---|---|---|---|
| customers | `first_name`, `last_name`, `email`, `phone` | first-word broad fetch + intersect | ✅ |
| products | `name`, `sku`, `description` | first-word broad fetch + intersect | ✅ |
| services | `name`, `description` | first-word broad fetch + intersect | ✅ |
| transactions | `receipt_number` | single-token (no multi-word intent) | N/A |
| quotes | `quote_number` | single-token | N/A |
| appointments | joined `customer.first_name + last_name` + joined `service.name` | fetch 50 latest then multi-word intersect client-side | ✅ |
| conversations | `phone_number` only | single-token | phone-only |
| orders | `order_number`, `first_name`, `last_name`, `email` (denormalized on orders) | first-word broad fetch + intersect | ✅ |
| vehicles | `make`, `model`, `color`, (`year` via intersect only) | first-word broad fetch + intersect | ✅ |

**Special cases:**
- `Q-` prefix → searches `quote_number` literal (e.g. `Q-00123`).
- `#` prefix → searches `receipt_number` literal.
- 4–11 digit input → treated as phone query (routed to phone column on customers + conversations).

**This endpoint is the already-solved version of the problem.** It already contains the shared tokenization logic (`multiWordMatch`, `firstWordPattern`, `isMultiWord`) — but only inline in this file. If we extract those to a shared util, the global-search endpoint becomes a consumer too, not a separate implementation.

### 2b. POS "global search" (Register tab)

`src/app/pos/components/pos-workspace.tsx:150-167` — client-side filter over already-loaded products + services. Matches `name`, `sku`, `barcode` for products and `name` for services. **Does NOT search customers or transactions** from the POS register. Customer search in POS is exclusively through the `CustomerLookup` dialog → `/api/pos/customers/search`.

### 2c. Other surfaces checked

- No other cross-entity global search endpoints exist.
- No `typeahead` / `Autocomplete` / `Combobox` components in shared UI.
- No `searchAll` / `globalSearch` helper functions outside `/api/admin/global-search`.

---

## 3. DB infrastructure review (Phase 3)

### 3a. Indexes on `customers`

From `supabase/migrations/20260201000003_create_customers.sql` + `20260201000036_create_indexes.sql` + `20260318000002_customer_soft_delete.sql` + `20260319000001_partial_unique_phone_email.sql`:

| Index | Definition | Used by search today? |
|---|---|---|
| `idx_customers_active` | btree(id) WHERE `deleted_at IS NULL` | indirectly |
| `idx_customers_active_phone` | btree(phone) WHERE `deleted_at IS NULL AND phone IS NOT NULL` | yes (phone branches) |
| `idx_customers_phone_unique` | UNIQUE btree(phone) WHERE active | exact match |
| `idx_customers_email_unique` | UNIQUE btree(lower(email)) WHERE active | exact match |
| `idx_customers_email` | btree(email) | ilike leading-anchor only |
| `idx_customers_phone` | btree(phone) | ilike leading-anchor only |
| `idx_customers_name` | btree(last_name, first_name) | `ORDER BY last_name` path |
| `idx_customers_last_visit` | btree(last_visit_date DESC) | N/A |
| `idx_customers_lifetime_spend` | btree(lifetime_spend DESC) | N/A |
| `idx_customers_loyalty` | btree(loyalty_points_balance DESC) | N/A |
| `idx_customers_square_id` | btree(square_customer_id) | exact |
| `idx_customers_qbo_id` | btree(qbo_id) WHERE qbo_id IS NOT NULL | exact |
| `idx_customers_auth_user_id` | btree(auth_user_id) | portal RLS |
| **`idx_customers_search`** | **GIN to_tsvector('english', coalesce(first_name,'') ‖ ' ' ‖ coalesce(last_name,'') ‖ ' ' ‖ coalesce(phone,'') ‖ ' ' ‖ coalesce(email,''))** | **NEVER USED** |

The GIN index is live in production but no query references it. The `%TERM%` ILIKE pattern used everywhere cannot consult a tsvector index — it needs either a `@@ to_tsquery(...)` call (word-stemmed, doesn't help partial-token typeahead) or a trigram (`% operator or ILIKE acceleration via pg_trgm GIN). Neither is in play.

### 3b. Generated columns / views / RPC functions

- No computed `full_name` column on `customers`.
- No materialized views related to search.
- No search-related RPC functions (`search_customers`, etc.).
- Only generated column found anywhere: `vehicles.is_specialty` (unrelated).

### 3c. pg_trgm extension

**Not installed.** Only `pg_cron` is installed (for conversation lifecycle). Installing `pg_trgm` would require a migration. It's safe to install on Supabase (it's a built-in superuser-owned extension), but not free — it expands index sizes and bloats writes.

---

## 4. Strategy analysis (Phase 4)

### Strategy A — Shared API endpoint (`/api/customers/search`)

Single endpoint consumed by both POS (HMAC auth) and admin (session auth). Query params for `include_deleted`, `limit`, maybe `fields`.

| Dimension | Verdict |
|---|---|
| Implementation cost | High. Needs an auth dispatch layer that accepts either POS HMAC or admin session. Today those live in `authenticatePosRequest` and `getEmployeeFromSession` respectively — merging them requires another abstraction. |
| Performance | Same as today (one DB round-trip). |
| Consistency | ✅ Guaranteed. |
| Migration cost | Medium. Every caller's fetch URL changes; auth semantics change subtly. |
| Failure modes | Auth layer is the bug surface. A POS caller accidentally routed through session auth would leak admin-only fields. |

**Reject.** Auth unification isn't worth the risk for this problem size.

### Strategy B — Shared utility function

`src/lib/search/customer-search.ts` exports `searchCustomers(supabase, { query, options })`. Each API endpoint and direct-Supabase caller delegates.

Proposed signature (descriptive, not prescriptive — final shape comes in 42H-rewrite):

```ts
interface SearchCustomersOptions {
  includeDeleted?: boolean;
  limit?: number;              // default 10
  select?: string;             // default 'id, first_name, last_name, phone, email'
  broadLimit?: number;         // default 50 — how many rows to pull for multi-word intersect
  fields?: ('first_name' | 'last_name' | 'email' | 'phone')[];
}

function searchCustomers(
  supabase: SupabaseClient,
  query: string,
  options?: SearchCustomersOptions
): Promise<{ data: CustomerSearchResult[]; error: PostgrestError | null }>
```

Internally implements:
1. Detect phone-like query (digits-only branch) — use `.like('phone', '%digits%')`.
2. Otherwise, split query into tokens.
3. If single token: `OR(first_name.ilike.%tok%, last_name.ilike.%tok%, email.ilike.%tok%, phone.ilike.%tok%)` limited to `options.limit`.
4. If multi-token: broad-fetch with the most-selective token (or first token by default) OR across all fields; then filter in-app with `words.every(w => (first_name+' '+last_name+' '+email+' '+phone).toLowerCase().includes(w))`.
5. Apply `deleted_at IS NULL` unless `options.includeDeleted`.

| Dimension | Verdict |
|---|---|
| Implementation cost | Low. ~100 lines with tests. Pattern already exists in `/api/admin/global-search`. |
| Performance | Same as today for single-token (unchanged), better than today for multi-token on broken endpoints (works now where it didn't before). Unchanged vs. global-search. |
| Consistency | ✅ One source of truth. |
| Migration cost | Low. Five API endpoints + two direct-Supabase pages swap ~15 lines each for one call. |
| Failure modes | A caller passes wrong `select` → missing fields for that caller only. Type-safe if the select shape is surfaced through a generic. |
| Testability | ✅ Easy — pure function with Supabase mock. |

**Accept.**

### Strategy C — Postgres RPC function

`CREATE FUNCTION search_customers(q text, opts jsonb) RETURNS SETOF ...` using the existing `idx_customers_search` tsvector index, falling back to ILIKE when needed.

| Dimension | Verdict |
|---|---|
| Implementation cost | High. Migration file, RLS considerations (RPC bypasses RLS unless declared SECURITY INVOKER), retesting every caller against a new shape. |
| Performance | Better at scale (index-backed). Negligible today (5000 rows, ILIKE completes <10ms). |
| Consistency | ✅ Unified at DB layer. |
| Migration cost | High. Every caller switches to `.rpc('search_customers', {...})`. |
| Failure modes | **Full-text tokenization doesn't match typeahead UX.** `to_tsvector('english', 'Cuvias')` stems to `cuvia` lexeme; query `"cuvi"` won't hit it via `to_tsquery`. `to_tsquery('cuvi:*')` (prefix) matches `cuvia`, but only on token starts — `to_tsquery('uvi:*')` would not match `cuvias`. For partial-middle ILIKE behavior you still need trigrams. Phone numbers with punctuation tokenize unpredictably. **Trying to make this match ILIKE semantics requires the hybrid approach anyway.** |
| Testability | Medium. DB function tests require a live Postgres. Unit-testing the query builder is straightforward but integration testing needs DB. |

**Reject.** The existing GIN index is a tsvector, which doesn't give partial-substring matching. Retrofitting an RPC that matches today's UX expectations requires adding `pg_trgm` and a trigram GIN, which expands scope significantly. Revisit if volume grows 10×.

### Strategy D — Hybrid (tsvector + pg_trgm)

Same as C but installs `pg_trgm`, adds a trigram GIN on the same expression, and the function dispatches: tsvector for space-separated word queries, trigram-ILIKE for partial/typeahead.

| Dimension | Verdict |
|---|---|
| Implementation cost | Very high. Extension install + two new indexes + RPC + caller migration. |
| Performance | Best at scale. |
| Consistency | ✅ |
| Migration cost | High. |
| Failure modes | Index size roughly 2–4× today's footprint for customers. pg_trgm GIN is well-behaved but not free on writes. |
| Future extensibility | Same pattern generalizes to `products`, `services` trivially. |

**Defer.** Worth revisiting if/when growth pressure materializes.

### Comparison table

| Strategy | Impl cost | Perf (today) | Perf (scale) | Consistency | Migration cost | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| A — Shared API | High | = | = | ✅ | Medium | Auth merge | Reject |
| **B — Shared util** | **Low** | **=** | **=** | **✅** | **Low** | **Minimal** | **Accept** |
| C — Postgres RPC (tsvector only) | High | = | Better | ✅ | High | UX regression on typeahead | Reject |
| D — Hybrid (tsvector + pg_trgm) | Very high | = | Best | ✅ | High | Install + index cost | Defer |

### Root-cause sanity check

Prompt asks: if the problem is really just "four callers forgot tokenization", do we need a rewrite at all?

Answer: **the rewrite is the tokenization fix, just packaged as a utility.** A naive per-endpoint patch (add the same 15 lines to 5 endpoints) would also resolve the user-visible bug but leaves us with five copies of tokenization code and no regression protection when the 6th picker is added. Extracting the utility is the smallest step that delivers a durable fix. It is not over-engineering relative to the bug size.

---

## 5. Global search integration (Phase 5)

### Recommendation

The global-search endpoint is a **parallel-fetch coordinator** over N entities and should stay that way. Its role is orchestration + result normalization, not search primitives.

After 42H-rewrite ships, the customer block inside `/api/admin/global-search/route.ts:101-110` replaces its inline `.or(...)` with `searchCustomers(admin, q, { limit: 15, broadLimit: 50 })`. The `multiWordMatch` / `firstWordPattern` / `isMultiWord` helpers currently inlined in `admin/global-search/route.ts` move into `src/lib/search/shared.ts` and become shared infrastructure the util builds on.

Follow-up phases (not this session, not 42H-rewrite) can repeat this pattern for:
- `searchProducts` (single GIN index already exists → possibly index-backed later)
- `searchServices` (ditto)
- `searchOrders` (treated as denormalized "customer-ish" rows — first/last/email live on orders directly)
- `searchVehicles`, `searchAppointments`, etc.

Each extraction is independent. The global-search endpoint becomes a thin fan-out:

```ts
const [customers, products, services, ...] = await Promise.allSettled([
  searchCustomers(admin, q, { limit: 15, broadLimit: 50 }),
  searchProducts(admin, q, { ... }),
  searchServices(admin, q, { ... }),
  // ...
]);
```

### What global search should NOT do

It should not grow into a generic "search anything" RPC today. The per-entity utilities are easier to evolve independently — e.g., when products eventually wants embedding-based semantic search, only `searchProducts` changes, not the coordinator.

---

## 6. Migration plan (Phase 6)

### Session 42H-rewrite (immediate next session)

**Goal:** Ship the shared utility and migrate the five broken customer-search callers. Single session, one green run. Fixes the POS `"omar cuvias"` bug as a side effect.

Ordered task list:

1. **Extract shared helpers.** Move `multiWordMatch`, `firstWordPattern`, `isMultiWord` from `src/app/api/admin/global-search/route.ts` to `src/lib/search/tokenize.ts`. Global-search updates its imports.

2. **Create `src/lib/search/customer-search.ts`.** Implements `searchCustomers(supabase, query, options)` as described in Strategy B. Supports both active-only and include-deleted modes. Exports a `CustomerSearchResult` type.

3. **Migrate `src/app/api/pos/customers/search/route.ts`.** Replace the `.or(...)` block with `searchCustomers(...)`. Preserve the current select shape (`loyalty_points_balance, visit_count, tags, customer_type` required by POS lookup UI) via the `select` option.

4. **Migrate `src/app/api/admin/customers/search/route.ts`.** Same. Preserve `include_deleted` behavior via `options.includeDeleted`.

5. **Migrate `src/app/api/admin/jobs/route.ts:33-55`.** The two-step customer-IDs-then-jobs pattern: fetch IDs through `searchCustomers(..., { select: 'id' })`.

6. **Migrate `src/app/api/admin/photos/route.ts:42-48`.** Same two-step pattern. Also fixes the `searchVehicleIds` path by extracting a similar vehicle util (optional — can defer).

7. **Fix `src/app/admin/photos/page.tsx:249`.** Change fetch URL from broken `GET /api/admin/customers?search=...` to `GET /api/admin/customers/search?q=...`. Verifies the photos-page filter works.

8. **Migrate `src/app/admin/transactions/page.tsx:253-276`.** Direct-Supabase caller — import `searchCustomers` and call it against the client-side Supabase instance. (Or: route through `/api/admin/customers/search` — cleaner, one extra round-trip.)

9. **Migrate `src/app/admin/marketing/compliance/page.tsx:86-111`.** Same choice: direct call or go through the API. Match whichever #8 chose for consistency.

10. **Migrate `/api/admin/global-search` customer block.** Replace the inline customer `.or(...)` with `searchCustomers`. Also applies multiWord logic to all other entity blocks via the shared helpers from step 1.

11. **Single QA pass.** Manually run "omar cuvias" through:
    - POS customer lookup (selector #1)
    - Admin data-management purge search (#2)
    - Admin drip manual enroll (#2)
    - Admin coupon "specific customers" picker (#2)
    - Admin transactions page search (#12)
    - Admin compliance opt-out search (#13)
    - Admin photos customer filter (fixed in step 7)
    - Admin jobs list search (#4)
    - Admin ⌘K global search (unchanged behavior — regression check)

12. **Single commit** per session rules, plus FILE_TREE.md update for the new `src/lib/search/` directory.

### Session 42H-rewrite-extended (optional, if scope permits same session)

13. **Appointments search** (`admin/appointments/page.tsx:79-86`) — already client-side; swap the single `.includes` for a `multiWordMatch` call so `"cuvias omar"` out-of-order works.

14. **Quotes search** (`lib/quotes/quote-service.ts:86-98`) — same fix; swap the `.includes` for the shared token-intersect helper.

15. **Messaging conversations** (`/api/messaging/conversations?search=...`) — swap inline filter for shared helper.

Either bundle with 42H-rewrite or split to 42H-followup — user's call based on session energy.

### Out of scope for 42H

- Admin customers list page 5000-row preload (per prompt constraint — separate discussion).
- Products / services / orders / vehicles search utilities (future parallel of `searchCustomers`).
- pg_trgm installation or RPC migration (Strategy D — defer until scale pressure).
- Voice agent exact-match lookup (`/api/voice-agent/customers`) — not a search.
- POS register "global search" (products + services only, works correctly today).

### Testing surface

After 42H-rewrite, the regression surface is:
- `src/lib/search/tokenize.ts` — unit tests (pure functions).
- `src/lib/search/customer-search.ts` — unit tests with Supabase mock + integration test against a seeded DB.
- Every caller listed in step 11 above — smoke test.

A test for `"omar cuvias"` returning the Omar Cuvias row should land with `customer-search.ts` as the anchor regression.

---

## 7. Open questions for reviewer

1. **API vs. direct-Supabase for client-side callers.** Should the admin transactions page (#12) and marketing compliance page (#13) call the API endpoint (consistent auth surface, one extra round-trip) or import `searchCustomers` and run directly against their client-side Supabase instance (faster, but duplicates RLS assumptions)? Recommendation: **route through the API** — RLS boundaries + perms stay server-side.

2. **Admin-customers page 5000 preload.** Explicitly out of scope here. If it stays preload-based, it remains an outlier. If it ever switches to server-side search, it becomes a consumer of `searchCustomers`. Worth a separate audit — 5000 rows × 50 columns each is ~10MB JSON on every page load.

3. **Should `idx_customers_search` be dropped?** It's dead weight today (~bytes tolerable, but surprising on reading the migration history). Dropping it removes a "you already have full-text search!" foot-gun for future contributors. Keep-or-drop decision separable from this audit.

4. **Extended migration scope in 42H-rewrite.** Is the user OK with a single session touching 10+ files, or should 42H-rewrite stay narrow (just the 5 broken customer-search callers) and 42H-followup cover appointments/quotes/conversations? Author's preference: one session, since the helpers are new in both directions.

5. **Global-search refactor.** Extracting `multiWordMatch` from global-search into `src/lib/search/tokenize.ts` touches the file that just got shipped. Low regression risk but worth acknowledging — global search has the same multi-word handling before and after, just imports move.

6. **`customers` table `or()` with join-free performance.** Today every single-token `.or(first_name.ilike, last_name.ilike, email.ilike, phone.ilike)` is a 4-way sequential scan OR'd together on a 5000-row table — completes in <10ms. At 50k customers this becomes noticeable. **Worth installing `pg_trgm` on a `lower(first_name || ' ' || last_name || ' ' || email || ' ' || phone)` expression and adding a trigram GIN index as a scale-time upgrade.** Not today's problem.

7. **Phone normalization in search.** `searchCustomers` should treat `"424-401"` and `"4244010"` as equivalent. Current endpoints do this via `digits = term.replace(/\D/g, '')`. Worth codifying in the utility. Prompt does not flag this as a bug, but it's a subtle inconsistency — the admin-customers client filter matches the formatted phone string too (`formatPhone(c.phone).includes(q)`), while the API endpoints only match digits.

---

**End of audit.**
