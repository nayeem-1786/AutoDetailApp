# Audit: voice-calls-poll cron + coupon-enforcement JSONB bug investigation

**Date:** 2026-05-19
**Branch:** `audit/voice-poll-and-coupon-enforcement`
**Companion to:** `docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md` (parent audit, branch `audit/admin-put-jsonb-encoding`, available on origin since it wasn't merged to main — file is on the audit branch, not on main).
**Reference fixes:** commit `3da3183e` (homepage-settings) and commit `1b96405f` (ai.txt — branch `fix/aitxt-jsonb-double-encoding`).
**Scope:** characterize the bug shape and real production impact for the two sites the parent audit flagged as out-of-scope. Audit-only — no code, test, or migration changes.

## Executive summary

**voice-calls-poll cron** is **CONFIRMED-BROKEN but currently SELF-CONSISTENT** — every read in the codebase is paired with a `JSON.parse` and every write is paired with a `JSON.stringify`, so the round-trip works in production today. Production impact: **none observable** (the cron has been running since the route was created and is the sole reader/writer of `last_voice_poll_at`). Fix urgency: **P2 (this week)** — the bug is latent and the failure mode is bounded (a "1 hour ago" rewind on cursor read failure), but the brittleness becomes a real problem if any future change unilaterally drops the `JSON.stringify` on the write side. Recommended approach: drop both halves of the encoding plus an idempotent migration, then either delete the try/catch or keep it as a defensive shim.

**coupon-enforcement admin page** is **CONFIRMED-BROKEN with active user-visible corruption**. The admin form's own LOAD (`page.tsx:33`) reads `data.value` raw and short-circuits any value that isn't exactly `'hard'` back to `'soft'`. After any operator save of `hard`, the value on disk becomes the JS string `'"hard"'` (with embedded quote chars from the double-encoding), the admin LOAD treats this as `'soft'`, the textarea shows the wrong mode, and the next save permanently reverts to `'soft'`. Cross-consumer drift exists: the POS `validate/route.ts` consumer strips ALL `"` characters with `.replace(/"/g, '')` so it sees `'hard'` correctly during the brief window before the operator's next save flips it back; the POS `promotions/available/route.ts` consumer does NOT strip and reads `'"hard"'` directly — `evaluateCouponTargeting()` compares against bare `'hard'`, falls through, and treats the gate as **soft regardless of the operator's intent**. Production impact: **operators cannot make hard-mode enforcement stick** (it auto-reverts), AND while it is briefly stored as `'"hard"'`, the promotions list endpoint silently treats restricted coupons as soft-mode. **No incorrect-revenue exposure** because the canonical gate (`validate/route.ts` at POS apply-time) does compensate — a hard-restricted coupon that reaches the apply step gets blocked. The exposure is UX-confusion + inability-to-actually-enforce-hard-mode + cross-consumer drift in the promotions list. Fix urgency: **P1 (today/tomorrow)** — operator-facing functionality is broken right now, and the path to fix is small (mirror the ai.txt + homepage-settings pattern).

## Item 1: voice-calls-poll cron

### 1.1 File + line numbers

- **File:** `src/app/api/cron/voice-calls-poll/route.ts`
- **Write sites (cursor advance — Step D):**
  - Line 264: `.update({ value: JSON.stringify(now) })` (existing-row UPDATE branch)
  - Line 269: `value: JSON.stringify(now)` inside the INSERT object (first-run branch)
- **Read site (cursor consume — Step C):**
  - Lines 144–148: SELECT `business_settings.value` where `key = 'last_voice_poll_at'`
  - Lines 150–159: `JSON.parse(pollSetting.value)` inside a try/catch; on parse failure defaults to `new Date(Date.now() - 60 * 60 * 1000).toISOString()` (1 hour ago)

### 1.2 What value is being stringified

A plain ISO-8601 timestamp string produced by `new Date().toISOString()` at line 254:

```ts
const now = new Date().toISOString();
// ...
.update({ value: JSON.stringify(now) })  // line 264
```

`now` is a flat string like `'2026-05-19T20:57:08.123Z'`. **Not** a structured cursor object — just a single timestamp. The bug is therefore the simplest possible shape of the anti-pattern (no nested encoding issues, no array handling needed).

### 1.3 Target column

- **Table:** `business_settings`
- **Column:** `value`
- **Type:** `JSONB NOT NULL` — verified at `supabase/migrations/20260201000034_create_business_settings.sql:4`.
- **Row key:** `last_voice_poll_at` (no seed migration — row is created lazily by the cron's INSERT branch at line 267 on first ever tick).

### 1.4 Consumers

`grep -rn "last_voice_poll_at" src/` returns **only the cron itself** (lines 147, 258, 265, 268). No other reader. No admin UI exposes the value. No other cron consumes the cursor.

### 1.5 Failure modes

The bug is genuinely self-consistent for the timestamp shape because `JSON.parse` happens to work on a doubly-encoded ISO timestamp:

| State of stored value | `pollSetting.value` JS form (after Supabase JSONB deserialization) | `JSON.parse(...)` result | `lastPollAt` |
|-----------------------|---------------------------------------------------------------------|--------------------------|--------------|
| Pre-fix double-encoded (current production state) | `'"2026-05-19T..."'` (JS string with literal quote chars) | `'2026-05-19T...'` (clean) | Correct |
| Post-fix clean (no JSON.stringify on write) | `'2026-05-19T...'` (clean JS string from JSONB string) | throws (not valid JSON) — catch hits the 1-hour-ago fallback | Wrong (cursor rewinds 1h every tick) |
| Row missing | `undefined` | falls into the `else` branch | Correct (1-hour-ago fallback by design) |
| Row stored as a JSON null | `null` | falls into the `else` branch (because `pollSetting?.value` is falsy) | Correct |

The failure mode that matters: **if the write-side `JSON.stringify` is removed without coordinating a write to update the read side, the next cron tick reads the now-clean value, `JSON.parse('2026-...')` throws, the catch defaults to "1 hour ago", and the cron rewinds its cursor.** On `*/2 * * * *` cadence (verified `src/lib/cron/scheduler.ts:119`), this means:

- The cron would re-list every conversation from the past hour on every tick.
- Each conversation is skipped at the `voice_call_log` existence check (lines 189–198), so no duplicate processing occurs.
- The list query itself is a single ElevenLabs API call per tick (no fan-out), so the impact is at most 1 extra wasted API call per tick — **not** a runaway loop.
- The actual cursor never advances forward (it would always re-read the wrong value and stay 1 hour behind), so legitimately-new conversations slip through the time window IF they arrive after the tick but before the next list query advances the cursor… but actually, since each tick writes `JSON.stringify(now)` (still broken if the fix is partial), the persisted value gets overwritten on every tick, so a partial fix that only changes the read side would also flip-flop the persistence.

Net result if write-side fix lands alone: cursor permanently stuck at "1 hour ago" relative to the most recent tick. New conversations are still discovered because the 1-hour window is wide enough to catch a tick-period (2 minutes), but the cron does more redundant work than it needs to. No production data loss; just inefficiency.

### 1.6 Production impact assessment

**Today (current production state — both write and read are double-encoded):** **no observable problem.** The cursor advances on every successful tick. ElevenLabs polling works as designed.

**Potential failure if write-side fix lands alone:** cursor rewinds to 1-hour-ago every tick. ~30× redundant list operations per hour. ElevenLabs API rate limit is generous; not a deploy-blocker, but wasteful.

**Potential failure if read-side fix lands alone (drop `JSON.parse`):** the read would receive `'"2026-..."'` with embedded quotes, would coerce it to a Date via `new Date('"2026-..."')` at line 161 — which **succeeds** in modern Node (the `Date` constructor is lenient) but produces an `Invalid Date` from the leading quote, causing `getTime()` → `NaN`, `Math.floor(NaN / 1000)` → `NaN`, and the filter at line 183 (`c.start_time_unix_secs > lastPollUnix`) becomes `> NaN` which is always false. **Result: every conversation is treated as "before cursor" and skipped entirely.** This is worse than the rewind scenario — the cron silently stops processing new calls. Critical to coordinate the fix.

### 1.7 Recommended fix sketch

Mirror the ai.txt fix pattern. The bug shape is even simpler because there's only one consumer.

1. **Code change** — drop `JSON.stringify(now)` in both Step D branches (lines 264, 269); pass `value: now` raw.
2. **Code change** — adjust the read at lines 150–159. Two options:
   - **Option A (defensive shim, recommended for symmetry with ai.txt):** keep the try/catch but only attempt `JSON.parse` when the value looks like a JSON string (starts AND ends with `"`). For a clean post-fix ISO timestamp, the leading-quote check short-circuits and the raw value is used directly. For any legacy double-encoded row left over before the migration runs, `JSON.parse` unwraps it.
   - **Option B (clean removal):** drop the try/catch entirely; just `lastPollAt = pollSetting.value` with a string-type guard. Simpler, but requires the migration to land in the same deploy as the code change because any unmigrated row would yield a NaN cursor (see §1.6).
3. **Migration** — idempotent backfill mirroring `20260518225000_normalize_homepage_settings_double_encoding.sql`:
   ```sql
   UPDATE business_settings
   SET value = (value #>> '{}')::jsonb,
       updated_at = now()
   WHERE key = 'last_voice_poll_at'
     AND jsonb_typeof(value) = 'string'
     AND value::text LIKE '"\"%\""';
   ```
4. **Tests** — unit test covering: (a) cron read after migration (clean stored value yields correct `lastPollAt`); (b) cron read of a legacy double-encoded value (shim unwraps correctly); (c) round-trip (cron writes, next-tick reads, value matches).

Recommendation: **Option A** for the code change. Same shape as the ai.txt + homepage-settings fixes; consistent rollout pattern across the codebase; transition shim costs nothing in steady-state.

**Estimated effort:** 30–45 minutes (single-file code change + one migration + 3–4 tests).

---

## Item 2: coupon-enforcement admin page + POS consumers

### 2.1 Files + line numbers

- **Admin form (write + read):** `src/app/admin/settings/coupon-enforcement/page.tsx`
  - Lines 24–37: LOAD effect, reads `business_settings.value` where `key = 'coupon_type_enforcement'`, treats it as a bare string (no compensation)
  - Line 46: SAVE handler, writes `value: JSON.stringify(mode)` via direct Supabase call
- **Admin settings index (entry point only):** `src/app/admin/settings/page.tsx:121` — link to `/admin/settings/coupon-enforcement`; not a data path.
- **Admin coupon creation page (no read/write of the setting, just docs):** `src/app/admin/marketing/coupons/new/page.tsx:1397, 1399, 1400` — UI text referencing the setting indirectly.
- **POS consumer A — apply-time gate (CORRECT BEHAVIOR THANKS TO COMPENSATION):** `src/app/api/pos/coupons/validate/route.ts:199–215`. Reads the setting and applies `.replace(/"/g, '')` (strips ALL quote chars) to derive `enforcementMode`. Hard-blocks coupons in hard mode.
- **POS consumer B — promotions list (BROKEN, no compensation):** `src/app/api/pos/promotions/available/route.ts:131–142`. Reads the setting and casts the raw deserialized value directly to `'soft' | 'hard'`. No quote-strip.
- **Cross-cutting helper:** `src/lib/utils/coupon-helpers.ts:69–113` — `evaluateCouponTargeting(coupon, customer, enforcementMode)`. Compares `enforcementMode === 'hard'` at line 105. The helper takes `enforcementMode` as a typed parameter, so the bug surfaces at the call site, not the helper.
- **Seed migration:** `supabase/migrations/20260204000001_customer_type_and_promotions.sql:17–21` seeds the row with value `'"soft"'` — a SQL literal that Postgres parses as the JSONB string `"soft"`. Supabase reads back as the JS string `'soft'` (clean). **Initial state is therefore correct; the corruption is introduced only on the first operator save.**

### 2.2 What value is being mis-stored

A string enum: `'soft'` or `'hard'`. The form's `mode` state at line 20 is typed `EnforcementMode = 'soft' | 'hard'`. `JSON.stringify('hard')` returns the 6-char JS string `'"hard"'` (with literal quote chars at positions 0 and 5).

### 2.3 Target column

- **Table:** `business_settings`
- **Column:** `value`
- **Type:** `JSONB NOT NULL` (verified above).
- **Row key:** `coupon_type_enforcement`. Seeded with clean `"soft"` (JSONB string).

### 2.4 Consumers WITH compensation

| File:line | Compensation strategy | Effect on `'"hard"'` (post-bug stored) | Effect on `'hard'` (clean) |
|-----------|----------------------|----------------------------------------|----------------------------|
| `src/app/api/pos/coupons/validate/route.ts:207` | `rawValue.replace(/"/g, '')` (strip ALL quote chars) | yields `'hard'` ✓ | yields `'hard'` ✓ |

**Result:** the apply-time gate is robust under either bug state. The line at 210 (`if (enforcementMode === 'hard')`) correctly fires under both stored shapes.

### 2.5 Consumers WITHOUT compensation

| File:line | Behavior on `'"hard"'` | Behavior on `'hard'` | Behavior on `'soft'` |
|-----------|-----------------------|----------------------|----------------------|
| `src/app/admin/settings/coupon-enforcement/page.tsx:33-34` | `val === 'hard' ? 'hard' : 'soft'` → returns `'soft'` ✗ (admin UI shows wrong mode) | returns `'hard'` ✓ | returns `'soft'` ✓ |
| `src/app/api/pos/promotions/available/route.ts:138-142` | cast `enforcementMode = '"hard"'` → passed to helper. Helper compares `=== 'hard'` at line 105 → false. **Hard-restricted coupons appear in the "for you" / eligible list as if soft-mode were active.** ✗ | `'hard'` ✓ | `'soft'` ✓ |

### 2.6 Cross-consumer divergent behavior — concrete walkthrough

**Initial state (post-seed, no operator save):** JSONB stored as JSON string `"soft"`. Supabase reads as JS string `'soft'`. All consumers see `'soft'` correctly. ✓

**Operator selects "Hard" and clicks Save:**

1. `handleSave` (line 41–55) → `update({ value: JSON.stringify('hard') })` → wire body sends the 6-char JS string `'"hard"'` as a JSON-encoded JSON string. JSONB parses this and stores the JSON string `"\"hard\""` (whose inner content is `"hard"` with literal quotes). Supabase reads back: JS string `'"hard"'` (6 chars, embedded quotes).
2. Toast shows "Enforcement mode saved" — admin form thinks it succeeded.
3. **Brief window — until the operator reloads or re-saves — the stored shape is `'"hard"'`:**
   - `validate/route.ts:207` strips quotes → sees `'hard'` → **correctly enforces hard mode at apply time.**
   - `promotions/available/route.ts:138-142` reads raw `'"hard"'` → cast to `'soft' | 'hard'` (TypeScript-only cast, no runtime effect) → passed to `evaluateCouponTargeting` at line 159 → at helper line 105, `'"hard"' === 'hard'` is false → returns `{ passed: true, warning: ... }`. **Promotions list shows hard-restricted coupons as eligible for non-matching customers in this window.**
4. **Operator reloads the page** (any reason — they want to verify, they navigate away and back, etc.):
   - LOAD effect at lines 24–37 reads `'"hard"'` → conditional `val === 'hard' ? 'hard' : 'soft'` → sets `mode = 'soft'`. UI shows "Soft (Recommended)" selected. ✗
5. **Operator thinks save failed (or is testing) and saves again** — possibly with `mode = 'soft'` (because that's what the UI shows):
   - `update({ value: JSON.stringify('soft') })` → stored as `'"soft"'`.
6. Now all consumers see `'"soft"'`:
   - `validate/route.ts:207` strip → `'soft'` ✓
   - `promotions/available/route.ts:138-142` raw → `'"soft"'` → helper check `=== 'hard'` false → soft mode ✓ (correct, by coincidence — both happen to land at "soft warn-only")
   - Admin LOAD → `'"soft"' === 'hard'` false → `'soft'` ✓ (correct, by coincidence)
7. **Net effect: hard mode cannot be persistently set via the admin form.** Any attempt auto-reverts to soft on the very next reload or save.

### 2.7 Production revenue exposure

**Direct revenue exposure: NONE detectable from static analysis.** The canonical apply-time gate (`validate/route.ts`) compensates correctly, so even during the brief "stored as `'"hard"'`" window, a non-matching customer attempting to USE a hard-restricted coupon gets blocked with HTTP 400 and the error message "This coupon is for Enthusiast customers".

**Indirect exposure / UX harm:**
- **Operator-facing**: operators cannot make hard-mode stick. They likely believe the feature is broken or that their saves don't persist. Trust in the admin UI degrades.
- **Cashier-facing**: in the brief window between `hard` save and next reload, the POS Promotions tab (`promotions/available/route.ts`) displays restricted coupons as eligible. Cashier sees "this customer is eligible for X" but the apply step rejects with an error. Confusing UX but not financially harmful — the gate holds.
- **Customer-facing**: none — the customer never sees mid-state coupon errors directly; they see the cashier's final decision.

**No need to check `audit_log` or `transactions` for evidence of incorrect coupon applications** — the apply-time gate's compensation means no incorrect discount was ever granted. The bug's revenue path is: operator sets hard → it silently auto-reverts → from then on, soft-mode is enforced (warning shown but coupon applied). If operator policy required hard-mode enforcement and they believed it was active when it wasn't, **they may have granted soft-mode warnings for promotions they intended to be hard-blocked.** This is recoverable via subsequent operator behavior (manual override at POS), but it represents intended-strict-promotions silently behaving as warnings.

### 2.8 Production impact assessment

**Active today:** yes — the admin form has been in production since the seed migration shipped (2026-02-04, `20260204000001_customer_type_and_promotions.sql`). Any operator who has ever saved hard mode has experienced the auto-revert. If hard mode is not in use today, the bug is dormant.

**Severity:** P1 user-facing. The feature exists in the admin UI, is documented in marketing/coupons/new page text ("enforcement depends on the Coupon Enforcement setting in Settings"), and operators expect it to work.

**Recommended fix sketch:**

1. **Code change at admin form** (`src/app/admin/settings/coupon-enforcement/page.tsx`):
   - Line 46 — drop `JSON.stringify(mode)`; pass `value: mode`.
   - Lines 32–35 — add transition shim mirroring ai.txt: detect legacy double-encoded form (string starts/ends with `"`), `JSON.parse` it, otherwise pass through. Once migration runs, this path is dead but cheap.
2. **Code change at non-compensating consumer** (`src/app/api/pos/promotions/available/route.ts:138-142`):
   - Add a `.replace(/^"|"$/g, '')` strip OR (better) lift the read into a shared helper used by both `validate/route.ts` and `promotions/available/route.ts`. The shared helper avoids the "two different strip strategies" smell flagged in §5 of the parent audit.
3. **Suggested shared helper** (`src/lib/utils/coupon-enforcement.ts` — new file):
   ```ts
   export async function getCouponEnforcementMode(
     supabase: SupabaseClient
   ): Promise<'soft' | 'hard'> {
     const { data } = await supabase
       .from('business_settings')
       .select('value')
       .eq('key', 'coupon_type_enforcement')
       .single();
     const raw = data?.value;
     if (typeof raw !== 'string') return 'soft';
     // Defensive unwrap for any legacy double-encoded row left by the
     // pre-fix admin form. Post-migration this branch is dead code.
     if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
       try {
         const unwrapped = JSON.parse(raw);
         if (typeof unwrapped === 'string') {
           return unwrapped === 'hard' ? 'hard' : 'soft';
         }
       } catch { /* fall through */ }
     }
     return raw === 'hard' ? 'hard' : 'soft';
   }
   ```
   Wire `validate/route.ts:199-208` and `promotions/available/route.ts:131-142` through this helper. The helper enforces `'soft' | 'hard'` as the return type, so any future caller can't accidentally read a `'"hard"'` shape.
4. **Migration** — idempotent backfill mirroring `20260518225000_normalize_homepage_settings_double_encoding.sql`:
   ```sql
   UPDATE business_settings
   SET value = (value #>> '{}')::jsonb,
       updated_at = now()
   WHERE key = 'coupon_type_enforcement'
     AND jsonb_typeof(value) = 'string'
     AND value::text LIKE '"\"%\""';
   ```
5. **Tests:**
   - Helper round-trip: write 'hard', read via helper, expect 'hard'.
   - Helper legacy: seed `'"hard"'`, read via helper, expect 'hard'.
   - Admin form round-trip: PATCH 'hard', GET back 'hard'.
   - `promotions/available/route.ts` end-to-end: customer type mismatch + hard mode → coupon NOT included in eligible list (after fix). Pre-fix this test would have surfaced the bug.

**Estimated effort:** 1.5–2 hours (one new helper, two consumer migrations to use the helper, one admin form fix, one migration, 4–6 tests).

---

## 3. Fix urgency ranking

| Rank | Item | Justification | Estimated effort |
|------|------|---------------|------------------|
| **P1** | coupon-enforcement | Operator-facing UI corruption today. Operators cannot reliably set hard mode. Cross-consumer drift exposes hard-restricted coupons in promotions list during the brief window between save and reload. No active revenue loss because the apply-time gate compensates, but the *intended-strict-promotions silently behave as warnings* failure mode is real if hard mode is desired policy. | 1.5–2h |
| **P2** | voice-calls-poll | Latent, currently self-consistent, no observable production problem. Bug becomes acute only if someone unilaterally edits one half of the encoding. Fix is small and reduces a brittle dependency. | 30–45min |

**Order:** P1 first (coupon-enforcement) because operator-facing. P2 next (voice-calls-poll) because cheap, and bundling both fixes under one umbrella reduces cognitive overhead.

**Bundling consideration:** the two fixes are structurally identical (drop JSON.stringify on write + defensive shim on read + idempotent backfill migration). They could ship in a single PR if reviewer prefers. Recommended: ship as two separate PRs so each can be merged and deployed independently — coupon-enforcement may need operator UAT (test hard mode actually persists), voice-calls-poll just needs `pm2 logs smart-details | grep VoicePoll` confirmation post-deploy.

---

## 4. Out-of-scope items discovered during this investigation

None new. The QBO module's strip-regex anti-pattern (parent audit §2.1 routes B–E + §2.1 cross-cutting QBO lib) remains the largest unresolved batch. The parent audit's §3 recommendation (one coordinated QBO PR + migration) still stands.

Two minor observations that don't warrant separate audits but worth noting in the team's running knowledge:

1. **Strip-regex inconsistency.** The codebase uses three different strip strategies for the same double-encoded JSONB-string artifact:
   - `JSON.parse(...)` in try/catch — homepage-settings, voice-calls-poll, ai.txt (after the fix).
   - `replace(/^"|"$/g, '')` — QBO module (strips one leading + one trailing quote).
   - `replace(/"/g, '')` — POS validate route (strips all quote chars).
   The shared helper proposed in §2.8 would unify the coupon-enforcement case. A future cleanup could lift a single canonical helper used by the QBO module too. **Out of scope for the immediate fix; flagged for the eventual QBO migration.**

2. **`business_settings.last_voice_poll_at` has no seed migration.** The first cron tick creates the row via INSERT (lines 267–271). The row's `category: 'voice'` column is set on INSERT only — not preserved by the UPDATE branch. This is benign (the column is metadata) but worth noting if the schema for `business_settings.category` ever becomes load-bearing. **Out of scope.**

---

## 5. Verification this audit introduced zero regressions

Only `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md` was added. No source files, no tests, no migrations changed.

```bash
git status         # untracked file only
npm run lint       # 0 errors, 98 warnings (matches yesterday's baseline)
```

No build / typecheck / vitest run needed (docs-only addition).
