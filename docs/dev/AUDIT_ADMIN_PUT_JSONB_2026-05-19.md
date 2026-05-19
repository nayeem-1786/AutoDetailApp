# Audit: Admin PUT/POST routes for the JSON.stringify-into-JSONB anti-pattern

**Date:** 2026-05-19
**Branch:** `audit/admin-put-jsonb-encoding`
**Companion to:** commit `3da3183e` (homepage-settings double-encoding fix) and migration `20260518225000_normalize_homepage_settings_double_encoding.sql`.
**Scope as briefed:** all admin PUT/POST handlers under `src/app/api/admin/` that write to a JSONB column. Audit-only — no code or test changes in this session.

## 1. Executive summary

- **Routes audited (admin PUT/POST/PATCH under `src/app/api/admin/` that touch a Supabase write):** 10 distinct route files.
- **Confirmed-broken (anti-pattern present + target is JSONB):** **5 routes** + 1 cross-cutting `lib/` module used by 4 of them. Grouped by table:
  - **`business_settings.value` (JSONB):** `cms/seo/ai-txt/route.ts`, `integrations/qbo/callback/route.ts`, `integrations/qbo/connect/route.ts`, `integrations/qbo/disconnect/route.ts`, `integrations/qbo/settings/route.ts`, plus the shared `src/lib/qbo/{client,settings}.ts` writers.
- **Suspected-broken:** 0 — every confirmed case was unambiguous on inspection (matched the exact `JSON.stringify(x)` → `.upsert/.update/.insert({ value: x })` shape; column type confirmed JSONB via `supabase/migrations/20260201000034_create_business_settings.sql`).
- **Safe (anti-pattern looks present but target is TEXT, or value is correctly passed raw):** **4 routes.**
- **Direct-read exposure (consumer that reads JSONB without quote-strip / JSON.parse compensation):**
  - **`ai_txt_content` ← `src/app/ai.txt/route.ts:54`** — **public crawler-facing endpoint.** Same severity profile as the google-reviews cron exposure that motivated the homepage-settings fix. **Highest priority.**
  - All QBO consumers compensate via `replace(/^"|"$/g, '')` — the bug is **self-contained** inside the QBO module. Lower priority but the anti-pattern should still be removed.
- **Stop conditions:** brief said to STOP and report if 5+ confirmed-broken found. We have 5 admin routes confirmed-broken. **Stopping here, reporting as-is, recommending batched fix by table (all five `business_settings.value` JSONB writers in one PR + migration).**

The audit reproduces the exact pattern that broke `homepage-settings`: the route calls `JSON.stringify(x)` on a JS value before passing it as `value:` into a Supabase `.upsert()/.update()/.insert()` against a JSONB column. The Supabase JS client serializes the JS value as JSON for the wire, so a pre-stringified string is double-encoded (`"foo"` becomes JSONB `"\"foo\""` whose deserialized JS value carries literal `"` characters). Different consumers compensate differently (or not at all), which is why some bugs manifest immediately and others stay hidden until a non-compensating reader appears (cron, `lib/` consumer, public endpoint).

## 2. Per-route detail

Routes are listed in order of fix priority. The "Direct-read exposure" column is what should drive the fix order — a confirmed-broken route whose value is read by a non-compensating consumer is materially worse than one whose entire read/write cycle is internally consistent.

### 2.1 CONFIRMED-BROKEN

#### Route A — `src/app/api/admin/cms/seo/ai-txt/route.ts` (PATCH)

| Field | Value |
|-------|-------|
| Write call site | line 90 — `{ key: 'ai_txt_content', value: JSON.stringify(content) }` inside `upsert(...)` |
| Target table + column | `business_settings.value` |
| Column type | **JSONB** (verified — `supabase/migrations/20260201000034_create_business_settings.sql:4`) |
| GET handler compensation | **NO COMPENSATION** at lines 63-64 — reads `data.value` directly, no JSON.parse, no strip-regex, casts to string and returns to client |
| Direct-read consumers | **`src/app/ai.txt/route.ts:54`** — public crawler-facing endpoint. Reads `data.value` raw and returns it as the `text/plain` body. **No compensation.** Customer-facing impact identical to the google-reviews cron breakage from yesterday. |
| Test coverage of round-trip integrity | None found |
| Bug status | **CONFIRMED-BROKEN with customer-facing direct-read exposure.** Highest priority. |

**Why customer-facing matters here:** AI crawlers (GPTBot, Google-Extended, CCBot, anthropic-ai) hit `/ai.txt` to discover access rules. If admin has ever saved ai.txt content via the broken PATCH, every crawler request renders the body as a JSON-stringified blob with literal `"` characters bracketing the content. Crawlers' directive parsers will at best fail to recognize any `User-agent:` lines (because the whole body is one long quoted string with escaped `\n` sequences), at worst expand crawl scope (no recognized `Disallow:` directives). Net effect: site's AI crawler policy is silently inoperative if the operator ever saved through the admin UI.

#### Route B — `src/app/api/admin/integrations/qbo/callback/route.ts` (GET — OAuth callback writes 4 token settings)

| Field | Value |
|-------|-------|
| Write call sites | lines 84-87 — `qbo_access_token`, `qbo_refresh_token`, `qbo_realm_id`, `qbo_token_expires_at`, each `{ key, value: JSON.stringify(x) }`; line 99 clears OAuth state with `{ value: JSON.stringify('') }` |
| Target table + column | `business_settings.value` |
| Column type | **JSONB** |
| Read-side compensation | Same file line 36 reads `qbo_oauth_state` with `replace(/^"|"$/g, '')`; QBO client + settings + status + settings PATCH + disconnect all use the same strip-regex |
| Direct-read consumers | All compensate — see Routes C, D, E and shared `lib/qbo/` module below. **No non-compensating direct reader found in code search.** |
| Test coverage | None for round-trip integrity. |
| Bug status | **CONFIRMED-BROKEN but self-contained inside the QBO module.** The anti-pattern is consistent across both halves of every read/write pair, so the feature works in production. The risk is fragility: any new consumer that doesn't know to strip will silently break, AND any drift (e.g., a value that already contains a `"` character) would corrupt because the strip-regex only removes one leading + one trailing quote. |

#### Route C — `src/app/api/admin/integrations/qbo/connect/route.ts` (GET — writes CSRF state before OAuth redirect)

| Field | Value |
|-------|-------|
| Write call sites | line 38 — `.update({ value: JSON.stringify(state) })`; line 45 — `.upsert({ key: 'qbo_oauth_state', value: JSON.stringify(state) })` |
| Target table + column | `business_settings.value` (JSONB) |
| Read-side compensation | Callback route line 36 strips quotes before comparing against the OAuth `state` query param. Round-trip consistent. |
| Direct-read consumers | Only the callback. Self-contained. |
| Test coverage | None for round-trip integrity. |
| Bug status | **CONFIRMED-BROKEN but self-contained.** |

#### Route D — `src/app/api/admin/integrations/qbo/disconnect/route.ts` (POST — clears tokens)

| Field | Value |
|-------|-------|
| Write call site | line 68 — `.update({ value: JSON.stringify('') })` (clears tokens, writes `""` — which after the double-encoding becomes the literal 2-character JS string `""`) |
| Target table + column | `business_settings.value` (JSONB) |
| Read-side compensation | Same file line 34 (reads `qbo_refresh_token` for revocation) and all QBO consumers strip quotes. After clear, the stripped value is empty string. |
| Direct-read consumers | `isQboConnected` in `src/lib/qbo/settings.ts:65-69` checks `cleaned.length > 0` — the strip on `""` produces `""` (length 0), so the connection state correctly flips to disconnected. |
| Test coverage | None for round-trip integrity. |
| Bug status | **CONFIRMED-BROKEN but self-contained.** |

#### Route E — `src/app/api/admin/integrations/qbo/settings/route.ts` (PATCH — operator-editable QBO config)

| Field | Value |
|-------|-------|
| Write call site | line 95 — `.upsert({ key, value: JSON.stringify(value) })` where `value` may be a string OR a boolean cast to string at line 90 |
| Target table + column | `business_settings.value` (JSONB) |
| Read-side compensation | Same file line 58 (GET) — `val.replace(/^"|"$/g, '')`. POS validate route + promotions/available + QBO module all use similar strips (with one CAVEAT — see §3.1 below). |
| Direct-read consumers | QBO client + settings lib + status route all use strip-regex. Self-contained. |
| Test coverage | None for round-trip integrity. |
| Bug status | **CONFIRMED-BROKEN but self-contained.** |

#### Cross-cutting — `src/lib/qbo/client.ts` and `src/lib/qbo/settings.ts`

These are not admin routes but are the shared writers used by the routes above. For any fix to land cleanly, both must be migrated alongside the route changes — otherwise the QBO module will write clean values that the route-side reads (still using strip-regex) will accept fine, but the routes will write clean values that the lib-side `clearQboTokens` and `setQboSetting` would not (the lib writes `JSON.stringify(value)` and `value: '""'`, both of which would double-encode against a clean baseline).

| File | Write sites | Bug status |
|------|-------------|------------|
| `src/lib/qbo/settings.ts:26` (`setQboSetting`) | `.update({ value: JSON.stringify(value) })` | Confirmed-broken |
| `src/lib/qbo/settings.ts:94` (`clearQboTokens`) | `.update({ value: '""' })` (literal 2-char JS string) | Confirmed-broken |
| `src/lib/qbo/client.ts:144,145,150` (`refreshAccessToken`) | Same anti-pattern on token refresh | Confirmed-broken |
| `src/lib/qbo/client.ts:373` (`clearTokens` private helper) | `.update({ value: '""' })` | Confirmed-broken |

### 2.2 SAFE

#### Route F — `src/app/api/admin/settings/business/route.ts` (PATCH)

- Line 61 — `value` passed raw, no JSON.stringify.
- Same JSONB column (`business_settings.value`) as the broken routes.
- Conclusion: **SAFE.** This is the same pattern the homepage-settings fix migrated to. New code should follow this shape.

#### Route G — `src/app/api/admin/email-templates/brand-kit/route.ts` (PUT)

- Line 94 — `update({ value, ... })` raw.
- **SAFE.**

#### Route H — `src/app/api/admin/cms/hero/config/route.ts` (PUT)

- Line 77 — `value: merged as unknown` raw.
- **SAFE.**

#### Route I — `src/app/api/admin/cms/migrate-data/route.ts` (POST — one-time data migration tool)

- Three write sites at lines 197, 252, 364 all call `content: JSON.stringify(...)` when inserting into `page_content_blocks`.
- **`page_content_blocks.content` is `TEXT NOT NULL`** — verified at `supabase/migrations/20260214000010_page_content_blocks.sql:8`. Storing JSON-stringified data in a TEXT column is the **correct** pattern (the client-side renderer is expected to `JSON.parse` the string).
- Companion writer `src/app/api/admin/cms/content/route.ts:132` passes `content` raw — the API contract is "client sends the already-stringified JSON for the TEXT column."
- Conclusion: **SAFE.** Different column type (TEXT, not JSONB). The migrate-data file looks suspicious but is following the established TEXT contract.

#### Route J — `src/app/api/admin/cms/homepage-settings/route.ts` (PUT)

- The reference broken route, **already fixed in commit `9a9e4a02`** (merged via `3da3183e`).
- Listed here for completeness — it's no longer broken on `main`.

### 2.3 SUSPECTED

None. Every JSONB write site under `src/app/api/admin/` was unambiguous (the anti-pattern was either present or absent; column type was a definitive lookup).

## 3. Recommended fix order

The brief said "STOP and recommend batching by table if 5+ confirmed-broken." All 5 confirmed-broken admin routes write to **the same column (`business_settings.value`)**. The natural batch is a single PR + migration that does both:

### Batch 1 — Customer-facing exposure (P0, ship first as standalone fix)

**Single-file fix scoped to `ai_txt_content`** because the public `/ai.txt` endpoint exposes the bug directly to crawlers. Keep this PR narrow:

1. Code change at `src/app/api/admin/cms/seo/ai-txt/route.ts:90` — drop the `JSON.stringify` wrapper, write `value: content` raw.
2. One-time migration mirroring `20260518225000_normalize_homepage_settings_double_encoding.sql` but scoped to `WHERE key = 'ai_txt_content' AND jsonb_typeof(value) = 'string' AND value::text LIKE '"\"%\""'`.
3. Regression test in `src/app/api/admin/cms/seo/ai-txt/__tests__/` that mirrors the shape of the existing `place-id-guard.test.ts` + `jsonb-double-encoding.test.ts`: PUT then GET then assert the stored value is the raw content (not double-encoded).
4. Verify `/ai.txt` public endpoint returns plain text without surrounding `"` characters after migration applies in prod.

### Batch 2 — QBO module hardening (P1, single coordinated PR)

This is one logical change because all four route files + the two `lib/qbo/` files share the same anti-pattern + matching strip-regex. Splitting into smaller PRs risks half-migrated state where a route writes clean but the lib reader still expects double-encoded.

1. Code changes across 6 files: drop JSON.stringify in all writes (`qbo/callback/route.ts`, `qbo/connect/route.ts`, `qbo/disconnect/route.ts`, `qbo/settings/route.ts`, `lib/qbo/client.ts`, `lib/qbo/settings.ts`).
2. Drop the `replace(/^"|"$/g, '')` strip in all reads (same 6 files plus `qbo/status/route.ts`).
3. One-time migration scoped to QBO keys: `WHERE key LIKE 'qbo_%' AND jsonb_typeof(value) = 'string' AND value::text LIKE '"\"%\""'`.
4. Special-case the `'""'` (literal 2-char clear sentinel) in the migration — those rows should become a clean empty string. Test target: `value::text = '"\""\""'` (a JSONB string whose inner content is the 2-char string `""`).
5. Regression tests: at minimum a round-trip test on `setQboSetting` + `getQboSetting` (the unit closest to all callers), plus an integration test on the OAuth callback that pins token storage shape.

### Out-of-band — not part of the admin-route batches

See §4. Three sibling instances of the same anti-pattern exist outside admin routes. They should be handled separately so the admin-route PRs stay focused.

## 4. Out of scope (sibling bug-class instances)

These are flagged per the brief's "out of scope" instruction. They are the same anti-pattern but outside the audit's `src/app/api/admin/` scope. **Recommend filing each as a separate ticket; do not bundle into the admin-route fix PRs.**

1. **`src/app/api/cron/voice-calls-poll/route.ts:264,269`** — cron writes `last_voice_poll_at` with `JSON.stringify(now)`. Read at line 153 uses `JSON.parse(pollSetting.value)` inside a try/catch — the round-trip happens to work because parsing a doubly-encoded string with a literal quote-wrapped ISO timestamp succeeds (`JSON.parse('"2026-..."')` → `'2026-...'`). **Self-consistent BUT brittle: if a future fix unilaterally drops the write-side stringify, this cron's reader silently catches the throw, defaults to "1 hour ago", and rewinds its cursor every tick.** Must be migrated alongside any other voice-poll writers.

2. **`src/app/admin/settings/coupon-enforcement/page.tsx:46`** — client-side admin page writes `JSON.stringify(mode)` directly via Supabase (not an API route). Two issues:
   - The same file's GET at line 33-34 does NOT strip quotes — admin UI shows wrong mode after the first save (`'hard'` is saved as `'"hard"'`, read back as `'"hard"'`, never matches `=== 'hard'`, defaults back to `'soft'` in the UI).
   - Downstream consumer `src/app/api/pos/coupons/validate/route.ts:207` compensates with `replace(/"/g, '')` (note: this version strips ALL quote chars, not just leading/trailing — more aggressive than the QBO strip).
   - Downstream consumer `src/app/api/pos/promotions/available/route.ts:138-142` does **NOT** strip — silently breaks under hard-mode enforcement. **Confirmed-broken with cross-consumer drift.**

3. **Direct Supabase upserts from admin page components in `src/app/admin/settings/pos-security/page.tsx`** at lines 97, 211, 221 — these are **SAFE** (value passed raw). Mentioned only because grep flagged them; they are not the anti-pattern.

## 5. Compensation-layer analysis (cross-cutting observation)

The audit surfaced a notable architecture-level smell: **three different compensation strategies exist in the codebase for the same JSONB-stored-as-double-encoded-string artifact:**

| Strategy | Where it's used | Failure mode |
|----------|-----------------|--------------|
| `JSON.parse(raw)` in try/catch | `cms/homepage-settings/route.ts:59`, `cron/voice-calls-poll/route.ts:153` | Throws on already-clean values → catch returns raw (homepage) or default (cron). Safe but defaults can mask the bug if a fix is partial. |
| `replace(/^"|"$/g, '')` (strips one leading + one trailing) | `qbo/settings/route.ts:58`, `qbo/disconnect/route.ts:34`, `qbo/callback/route.ts:36`, `qbo/status/route.ts:38`, `lib/qbo/settings.ts:18,41,67`, `lib/qbo/client.ts:67,184` | Only handles single-level double-encoding. Mid-string quotes break it. Cannot detect triple-encoding. |
| `replace(/"/g, '')` (strips ALL quote chars) | `pos/coupons/validate/route.ts:207` | Strips legitimate quote chars too. Acceptable for enum-shaped values like `'hard'/'soft'` but unsafe for free-text values. |
| No compensation | `/ai.txt/route.ts:54`, `pos/promotions/available/route.ts:138-142`, `admin/settings/coupon-enforcement/page.tsx:33`, `cms/seo/ai-txt/route.ts:63` | Silent corruption visible to end users / customers. |

The proliferation of compensation strategies confirms the underlying anti-pattern was never recognized as a single bug class — each consumer evolved its own ad-hoc fix. The cleanest path forward is to remove the JSON.stringify on all writes (the actual fix), then strip the compensation logic from every reader once the migration has cleaned legacy data, not before.

## 6. Verification this audit introduced zero regressions

Per the brief, only a documentation file was added. Confirmed via the lint and typecheck pipeline:

```bash
npm run lint        # 0 errors (99 pre-existing warnings, identical to pre-audit baseline)
npm run typecheck   # no new errors (pre-existing errors in quote-service.modifiers.test.ts only, unchanged)
```

No source files modified. No test files modified. No package.json changes. Only this audit doc was added.

## 7. Stop-condition declaration

Brief said: "If audit finds 5+ confirmed-broken routes: STOP, report findings as-is, recommend batching fixes by table rather than route-by-route." This audit found **5 confirmed-broken admin routes**, all writing to the same JSONB column. **Stopping per the brief.** Recommended batch organization is in §3 above. No code changes were made in this session.
