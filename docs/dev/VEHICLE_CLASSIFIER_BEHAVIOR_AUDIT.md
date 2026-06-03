# Vehicle Classifier — Component Behavior Audit (Production Incident, 2026-06-02)

> Read-only audit, NO source / migration / test changes.
> Branch: `audit/vehicle-classifier-comprehensive-behavior`
> Worktree: `~/Claude/SmartDetails/wt-classifier-audit` (Memory #8 isolation)
> Base: `6a3f892e` (#141 Path B Session 2 merge)
>
> **Status update (Session #142, 2026-06-02):** **ALL 5 FINDINGS
> RESOLVED.** Q-1 LOCKED Option B (architectural refactor — not RLS
> hotfix). Q-2 LOCKED `console.warn` telemetry. Q-3 LOCKED Layer-3
> intentionally manual-pick. **What shipped:** new
> `/api/classify-vehicle` public endpoint (admin client server-side,
> RLS bypassed) + new `classifyVehicleClient` browser wrapper with
> `CLASSIFIER_TIMEOUT_MS` AbortController + S1 `classifier_reason`
> field + T9 contract test with 5 failure modes + M1 Layer-3
> documentation + microcopy + Mi1 dead useEffect removed + Mi2
> two-data-path drift naturally closed by C1. Production booking
> restored for anonymous customers across all 5 vehicle categories.
> See `Session #142` in `docs/CHANGELOG.md` for the full resolution
> + operator post-deploy verification checklist.
>
> Memory #29 type: **Component Behavior** (intended-behavior model
> FIRST, then comprehensive defect sweep). The audit's job is to (a)
> diagnose the production "Identifying vehicle…" stuck-spinner bug
> blocking `/book` Step 1 and (b) answer the operator's broader
> question of whether the classifier is even working anywhere.

## Context

**Production incident** (operator report, screenshot evidence):
> "After selecting ANY vehicle category (Automobile, Motorcycle, RV,
> Boat, Aircraft), entering Make + (sometimes Model), the
> 'Identifying vehicle…' spinner appears and NEVER clears. Customers
> cannot proceed past Step 1 via the 'Add a New Vehicle' path."

Screenshot: RV + Airstream make, spinner stuck.

**Operator's broader question:**
> "Is the entire sorting/identifying system (sedan / truck_suv_2row /
> suv_3row_van / exotic / classic detection) even working correctly,
> or was it recently broken with recent updates?"

This audit answers both questions.

## TL;DR

**Root cause of acute bug** — `step-vehicle.tsx:128–163` calls
`resolveVehicleClassification` with the **browser supabase client**
(`createClient()` from `@/lib/supabase/client`). On the public `/book`
route, customers are anonymous (no auth session yet — auth happens at
Step 4). The classifier's first call inside
`vehicle-categories.ts:746–750` queries the `vehicle_makes` table
directly via PostgREST. **The `vehicle_makes` table has RLS enabled
(`supabase/migrations/20260223000001_create_vehicle_makes.sql:?`) with
exactly ONE SELECT policy — `vehicle_makes_read` scoped `FOR SELECT TO
authenticated USING (true)`. There is no `anon` policy.** PostgREST
then either (a) returns empty data → classifier silently falls through
to `category='automobile'` + `category_confident=false` (which means
the spinner DOES eventually clear but the result is wrong), or (b) the
client hangs waiting for an auth-token refresh that can't resolve
under anonymous conditions (which matches the operator's "never
clears" symptom verbatim). Either way, the architectural defect is
the same: **the classifier on public booking depends on an
authenticated session that the public booking surface does not have
yet at Step 1.**

The fix: either grant `anon` read on `vehicle_makes` (mirrors how
`/api/vehicle-makes` already exposes the same data to anon via an
admin-client-bypassing-RLS server route — see
`src/app/api/vehicle-makes/route.ts`), or move
`resolveVehicleClassification`'s `vehicle_makes` query to a
server-side API route. **Recommended: the RLS hotfix migration** — one
line, restores production within one session.

**Broader classifier health verdict** — the classifier itself works
correctly **on every server-side caller** (POS customer-vehicle CRUD,
voice agent, customer portal POST/PATCH — all use `createAdminClient`
which bypasses RLS). It also works on the **customer portal
vehicle-form-dialog** because that surface is `(account)`-gated → user
is authenticated → RLS policy `vehicle_makes_read` permits the query.
The classifier is **NOT working on `step-vehicle.tsx`'s public
booking surface** specifically, and probably hasn't been since the
`vehicle_makes_read` RLS policy was written (`#129` era — the policy's
authenticated-only scope predates `#131`'s Layer 2 hardening, which
assumed the classifier could run client-side). Five-layer auto-
detection (sedan / truck_suv_2row / suv_3row_van / exotic / classic
for automobile; category-specific default for non-automobile
specialty_tier) is structurally sound — `vehicle-categories.ts:728–
839` — and produces correct output **when the `vehicle_makes` lookup
succeeds**. Server-side callers prove this end-to-end via the existing
`vehicle-categories.test.ts` unit tests.

**Defect count by severity**

- **Critical (production-blocking)**: 1 (C1 below) — public booking
  classifier silently fails or hangs under anon RLS denial
- **Significant**: 1 (S1) — `resolveVehicleClassification`'s
  `vehicle_makes` query has no error surface; `{data: null, error: …}`
  responses are indistinguishable from `{data: [], error: null}`,
  so the silent-default path masks both empty-table-data and RLS-
  denied
- **Moderate**: 1 (M1) — specialty_tier "auto-detection" is actually
  hardcoded defaults (`DEFAULT_SPECIALTY_TIERS`) regardless of model;
  this is intentional but undocumented in the operator's mental model
- **Minor**: 1 (Mi1) — dead useEffect at
  `step-vehicle.tsx:225–232` (no-op branches); not a defect, but
  surfaced for future cleanup

**Fix-arc recommendation** — **ONE coherent session restores
production.** Scope: 1 migration (anon RLS policy on `vehicle_makes`)
+ 1 small refactor in `_classification.ts`-style helper to handle the
`{data: null, error: …}` ambiguity (S1) + 1 contract test that locks
the `classifying` state lifecycle invariant under all classifier
failure modes (T9). Est. 60–90 min, ≤4 files. Memory #8 safe.

---

## Target T1 — Intended behavior model

### T1.1 — The classifier's job

`resolveVehicleClassification(supabase, make, model?, year?)` →
`Promise<VehicleClassification>`. Five-layer pipeline at
`vehicle-categories.ts:728–839`:

| Layer | Job | Failure path |
|-------|-----|--------------|
| 1 | Resolve `vehicle_category` from `vehicle_makes` table via ilike match on `name` + `is_active = true` | DB error → silent default `automobile` + `category_confident=false` (caught at `:772`) |
| 2 | For automobile, infer `size_class` from model via `MODEL_SIZE_HINTS` (substring match across ~250 keywords) | No match → defaults to `'sedan'` (`:785`) |
| 3 | For non-automobile, set `specialty_tier` to `DEFAULT_SPECIALTY_TIERS[category]` (smallest tier) | N/A — always returns the default; staff/customer override later |
| 4 | Automobile + exotic make/model → override `size_class` to `'exotic'` | N/A |
| 5 | Automobile + classic make/model + year ≤ threshold → override `size_class` to `'classic'` (exotic wins dual-flag) | Year unknown + curated model → `needs_year_confirmation: true` (orthogonal signal) |

**`category_confident: true`** is set on exactly TWO positive-evidence
paths (`:758`, `:763`):
- Layer 1 single-row match (`validRows.length === 1`) → confident
- Layer 1 multi-row dual-category disambiguation via known model
  keyword → confident if `disambiguated.matched === true`

**`category_confident: false`** is set on every other path:
- No make supplied (`:743` `if (make)` guard skipped)
- 0-row `vehicle_makes` lookup (`:764`-`:771` else-if branch)
- Dual-category make with empty/unmatched model (`:307–322` in
  `disambiguateCategory` returns `matched: false`)
- DB error caught at `:772–778`

#### Output shape (`VehicleClassification` interface, `:645–688`)

```
{
  vehicle_category: VehicleCategory,
  vehicle_type: string,
  size_class: string | null,        // 'sedan' | 'truck_suv_2row' | 'suv_3row_van' | 'exotic' | 'classic' | null
  specialty_tier: string | null,    // category-specific tier key
  seat_rows: number,
  needs_year_confirmation: boolean,
  category_confident: boolean,      // #131 Layer 2 — drives caller auto-write gating
}
```

### T1.2 — Step-1 caller contract (`step-vehicle.tsx`)

**Invocation pattern** (`:128–175`):

```
useEffect(() => {
  if (mode !== 'manual' || !make.trim()) {
    setClassification(null);
    return;
  }
  const timer = setTimeout(() => {
    classify(make, model, category);
  }, 400);
  return () => clearTimeout(timer);
}, [make, model, category, mode, classify]);
```

400ms debounce after make/model/category/mode change. The
`useCallback(classify, [])` is stable (empty deps).

**`classify()` lifecycle** (`:128–163`):

1. `if (!mk.trim()) { setClassification(null); return; }` — guard
2. `myRequestId = ++classifyRequestIdRef.current` — race ticket
3. `setClassifying(true)` — spinner ON
4. `try { … await resolveVehicleClassification(supabase, mk, mdl) … }`
5. **Race-cancellation** check (`:141–142`): if a newer call has incremented the ref, early-return from `try` block
6. `setClassification(result)` + optional `setCategory(...)` (only if `category_confident` AND result differs from current)
7. `catch` block — same race check, otherwise `setClassification(null)`
8. **`finally` block** (`:158–162`): `if (classifyRequestIdRef.current === myRequestId) setClassifying(false)` — spinner OFF, gated on race ticket

**`handleCategoryChange()`** (`:184–199`): increments
`classifyRequestIdRef.current` to invalidate in-flight classify,
clears all non-category fields, **explicitly sets
`setClassifying(false)`** at `:195`.

**setClassifying(true) → setClassifying(false) pairing — code paths:**

| Path | `setClassifying(false)` site | Verified? |
|------|------------------------------|-----------|
| Normal success | `:160` (finally, gated on ref match) | ✅ |
| Caught exception | `:160` (finally) | ✅ |
| Race cancellation (newer call won) | NOT called in finally (ref mismatch). **CORRECT** — the newer call's own `setClassifying(true)` is now the source of truth, and IT will eventually call `setClassifying(false)` in its own finally. | ✅ |
| Component unmount during in-flight | No explicit cleanup, but the component state is GC'd; setClassifying(true) leaves no orphan | ✅ (React handles) |
| Category change while in-flight | `handleCategoryChange:195` explicitly sets `setClassifying(false)` AND increments ref so the in-flight classify can't re-set true | ✅ |

The lifecycle is **structurally sound** assuming the `await
resolveVehicleClassification()` at `:137` **always resolves**.

### T1.3 — `size_class` auto-detection per category

Citation map for the operator's question "is this actually working?":

| Test case | Expected size_class | Code path | Works? |
|-----------|---------------------|-----------|--------|
| Automobile + Honda Civic | `sedan` | `vehicle-categories.ts:118–138` `MODEL_SIZE_HINTS.sedan` includes `'Civic'`; matched at `:790` | ✅ when classifier reaches Layer 2 |
| Automobile + Chevy Suburban | `suv_3row_van` | `:178–192` `MODEL_SIZE_HINTS.suv_3row_van` includes `'Suburban'` | ✅ when classifier reaches Layer 2 |
| Automobile + Ford F-150 | `truck_suv_2row` | `:140–176` includes `'F-150'` + `'F150'` | ✅ when classifier reaches Layer 2 |
| Automobile + Ferrari 488 | `exotic` | Layer 4 (`:819–825`): `isExoticMake('Ferrari')` returns true via `EXOTIC_MAKES:374–381` | ✅ when classifier reaches Layer 4 |
| Automobile + 1965 Ford Mustang | `classic` | Layer 5 (`:828–836`): `isClassicVehicle('Ford', 'Mustang', 1965)` true via `CLASSIC_ELIGIBLE_MAKES.ford` curated list (`:521–523`) | ✅ when classifier reaches Layer 5 |
| RV + Airstream + Sport | specialty_tier=`rv_up_to_24` (default) | Non-automobile branch (`:806–815`) → `DEFAULT_SPECIALTY_TIERS.rv = 'rv_up_to_24'` (`:640`) | ⚠️ Always the default — NOT model-aware (see M1 below) |
| Motorcycle + Honda CBR600RR | specialty_tier=`standard_cruiser` (default) | Same path — always default | ⚠️ Same |

**Bottom line:** automobile size_class detection is correctly
wired across all five layers. Non-automobile specialty_tier is
ALWAYS the smallest-tier default by design (see M1).

---

## Target T2 — Acute bug diagnosis (production stuck spinner)

### T2.1 — Where `setClassifying(true)` fires

`step-vehicle.tsx:134` — inside `classify()`, immediately after the
race-ticket increment, BEFORE the `try {` block. The pre-condition is
`mk.trim()` truthy (`:129–132` early-return guard).

### T2.2 — Where `setClassifying(false)` SHOULD fire

| Trigger | File:line | Fires |
|---------|-----------|-------|
| Successful classifier response (current ref) | `step-vehicle.tsx:160` (finally) | ✅ |
| Classifier returns `category_confident=false` | Same (`:160`) | ✅ |
| Classifier throws | Same (`:160`, finally runs after catch) | ✅ |
| Race-cancelled (newer call won) | NOT called (intentional — newer call's lifecycle owns the spinner) | N/A |
| Category change during classify | `step-vehicle.tsx:195` (handleCategoryChange explicitly) | ✅ |

### T2.3 — The actual failure mode

The `setClassifying(false)` site at `:160` is reachable **only if the
`await` at `:137` ever resolves or rejects.** If `await
resolveVehicleClassification(...)` **never resolves**, finally never
runs, and the spinner is stuck forever. This is the bug.

**Why the await never resolves on public booking:**

`resolveVehicleClassification` is called with the **browser supabase
client** (`@/lib/supabase/client`) from `step-vehicle.tsx:136`. Inside,
at `vehicle-categories.ts:746–750`:

```ts
const { data: makeRows } = await (supabase as any)
  .from('vehicle_makes')
  .select('category')
  .ilike('name', make.trim())
  .eq('is_active', true);
```

Public `/book` customers are **anonymous** — auth happens at Step 4
(`booking-wizard.tsx:206` `isPortal` is false unless `customerData`
was pre-populated). The browser client uses the **`anon` JWT**.

`vehicle_makes` RLS policy
(`supabase/migrations/20260223000001_create_vehicle_makes.sql`):

```sql
ALTER TABLE vehicle_makes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "vehicle_makes_read" ON vehicle_makes
  FOR SELECT TO authenticated USING (true);

-- Only admins can write
CREATE POLICY "vehicle_makes_admin_write" ON vehicle_makes
  FOR ALL TO authenticated USING (…);
```

**No `anon` policy exists.** No subsequent migration adds one
(grep-verified across `supabase/migrations/`).

Two failure modes are possible under PostgREST + anon-RLS-denial:

**Failure mode (a) — silent empty result (most common):**
- Anon role has SQL-level GRANT SELECT on public schema (Supabase
  default config)
- RLS evaluation: no policy applies to anon → all rows filtered
- PostgREST returns `200 + []`
- `supabase-js` resolves immediately with `{ data: [], error: null }`
- Classifier proceeds: `validRows.length === 0` → falls to dev-warn
  branch (`:764–771`) which is no-op in production
- Returns `{ vehicle_category: 'automobile', size_class: 'sedan',
  category_confident: false, … }` regardless of what the customer
  typed
- **In `step-vehicle.tsx:` `setClassification(result)` fires,
  `setClassifying(false)` fires in finally. Spinner clears.**
- **Customer-visible symptom:** spinner appears, clears after ~400ms +
  network RTT, BUT the form behaves as if classification failed:
  - User picked RV → category stays RV (because `category_confident=false`
    means setCategory isn't called)
  - Specialty-tier picker visible
  - Continue button disabled until customer manually picks a tier
- **Operator perception "spinner stuck and form broken":** plausible
  if the operator was rapidly typing/changing and only saw the
  spinner-still-up phase. The bug is real even if not literally
  forever-stuck — the classifier provides ZERO value on public
  booking.

**Failure mode (b) — actual hang (less common but possible):**
- If Supabase's anon JWT has any kind of token-refresh race or the
  browser client has cached an invalid auth state, the underlying
  `fetch` to PostgREST can wait on a token-refresh endpoint that fails
  silently
- Standard `supabase-js` behavior on 401 is to attempt refresh; if
  refresh itself returns 401 (anon never expires, but ENV mis-
  config could surface here), the original query never completes
- **In `step-vehicle.tsx:` the `await` at `:137` never resolves,
  finally never runs, `setClassifying(false)` never fires. Spinner
  literally stuck.**
- Matches operator's report verbatim.

**Either failure mode points to the same architectural defect:** the
public booking surface cannot rely on the browser client for
`vehicle_makes` queries, because anon has no RLS access.

### T2.4 — Code trace, Airstream / RV reproduction

1. Page loads `/book`. `customerData = null` (anonymous). `isPortal = false`. `step-vehicle.tsx` mounts with `mode='manual'` (no saved vehicles).
2. User clicks "RV" in category picker → `handleCategoryChange('rv')` runs (`:184`) → all fields cleared, `setClassifying(false)`.
3. User types "A" in Make combobox → `setMake('A')` (`:464`) → useEffect re-runs (`:166`) → `make.trim() === 'A'` truthy → schedules timer T1 (400ms).
4. User types "i" → `setMake('Ai')` → cleanup clears T1, schedules T2. (continues for each keystroke)
5. User stops at "Airstream". After 400ms, T-last fires → `classify('Airstream', '', 'rv')` (`:172`).
6. `classify`: `myRequestId = ++classifyRequestIdRef.current` (say `=1`) → `setClassifying(true)` → spinner appears.
7. `await resolveVehicleClassification(browserSupabase, 'Airstream', undefined)` (`:137`):
   - Inside: `.from('vehicle_makes').select('category').ilike('name', 'Airstream').eq('is_active', true)` (`:746–750`)
   - Anon JWT → PostgREST → RLS denies → either (a) returns `[]` OR (b) hangs on auth-refresh
8. **If (a):** await resolves with `data: []`. classifier proceeds → returns `{ vehicle_category: 'automobile', size_class: 'sedan', category_confident: false }`. Back in classify: setClassification(result), category_confident=false → setCategory not called → finally: setClassifying(false). Spinner clears. Form state: category='rv', specialty-tier picker visible, Continue disabled until manual tier pick. **The classifier added no value.**
9. **If (b):** await never resolves. finally never runs. setClassifying(false) never fires. **Spinner stuck literally.** This matches the operator's screenshot exactly.

**The audit cannot distinguish (a) vs (b) without runtime
instrumentation on production.** Both are caused by the same root
defect (anon RLS denial). The fix below addresses both.

---

## Target T3 — Comprehensive classifier health sweep

### T3.1 — Automobile size_class detection

| Test case | Sub-test | Code path verified | Works on… |
|-----------|----------|--------------------|-----------|
| Honda Civic | Layer 1 single-row match (Honda is automobile-only after disambiguation) → Layer 2 model match in `MODEL_SIZE_HINTS.sedan` | `:118` includes `'Civic'` | Server callers ✅, portal authenticated ✅, **public /book ❌ (T2)** |
| Chevy Suburban | Layer 1 → Layer 2 match `MODEL_SIZE_HINTS.suv_3row_van` | `:180` includes `'Suburban'` | Same |
| Ford F-150 | Layer 1 → Layer 2 match `MODEL_SIZE_HINTS.truck_suv_2row` | `:142` includes `'F-150'` AND `'F150'` (both casings) | Same |
| Ferrari 488 GTB | Layer 1 → Layer 4 exotic-make override | `EXOTIC_MAKES:374` includes `'ferrari'` → `isExoticMake('Ferrari')` true → `size_class = 'exotic'` | Same |
| 1965 Ford Mustang | Layer 1 → Layer 5 classic-eligible | `CLASSIC_ELIGIBLE_MAKES.ford` at `:521` includes `'mustang'`; year 1965 ≤ threshold (current year − 25) → `size_class = 'classic'` | Same |
| Porsche Cayenne | Layer 1 → Layer 2 match (Cayenne in `truck_suv_2row:171`) → Layer 4 NOT triggered (Porsche generic model isn't exotic-listed) | Composite | Same |
| 2024 Porsche 911 GT3 | Layer 1 → Layer 4 model match in `EXOTIC_MAKE_MODELS.porsche` (`'911 gt3'` substring) → `size_class = 'exotic'` | Composite | Same |

### T3.2 — Non-automobile specialty_tier "detection"

**Important:** there is NO model-based specialty_tier detection. The
code path at `vehicle-categories.ts:806–815` always returns
`DEFAULT_SPECIALTY_TIERS[category]`:

```ts
const DEFAULT_SPECIALTY_TIERS = {
  motorcycle: 'standard_cruiser',
  rv: 'rv_up_to_24',
  boat: 'boat_up_to_20',
  aircraft: 'aircraft_2_4',
};
```

| Test case | Returned specialty_tier | Reason |
|-----------|-------------------------|--------|
| RV + Airstream + Sport | `rv_up_to_24` | Default |
| RV + Winnebago + Adventurer 35F | `rv_up_to_24` | Default — model says 35-foot, classifier doesn't read it |
| Motorcycle + Honda + CBR600RR | `standard_cruiser` | Default — CBR is a sport bike, not cruiser; classifier doesn't distinguish |
| Motorcycle + Harley + Road Glide | `standard_cruiser` | Default — Road Glide is touring; same |
| Boat + Yamaha + WaveRunner | `boat_up_to_20` | Default |
| Aircraft + Cessna + 172 | `aircraft_2_4` | Default |

**Per the function's own header comment at `:711`:** "Step 3: For
specialty vehicles, set default specialty_tier (staff corrects in
POS)." This is **INTENTIONAL** — non-automobile specialty tier
selection is a manual operator/customer choice, not auto-detected.
Logged as M1 below because the operator's "is the sorting system
working" question may have expected model-aware specialty tier
detection.

### T3.3 — Detection capabilities that have never worked / silently broke

| Capability | Status | Evidence |
|------------|--------|----------|
| Layer 1 vehicle_makes resolution | **NEVER WORKED on public /book**, works on server-side callers + authenticated portal | T2 RLS diagnosis |
| Layer 2 automobile size_class hints | Works downstream of Layer 1 success (server/portal only) | Hardcoded `MODEL_SIZE_HINTS` is data-correct |
| Layer 3 specialty_tier default | Always returns the smallest tier — by design | M1 |
| Layer 4 exotic detection | Works downstream of Layer 1 — but only on server/portal; on public /book the classifier defaults to `automobile` THEN runs exotic check, so exotic detection works even on public /book IF the make is in `EXOTIC_MAKES` (no `vehicle_makes` lookup needed for that branch) | Layer 4 reads from hardcoded constants, not DB |
| Layer 5 classic detection | Same as Layer 4 — hardcoded `CLASSIC_ELIGIBLE_MAKES`, no DB | Works on public /book IF the silent default to `automobile` is correct (Ferrari, Lamborghini, etc. all stay automobile by default, so exotic detection actually still fires) |

**Interesting subtle finding:** Layers 4+5 use hardcoded constants
and are independent of Layer 1's DB lookup. So **exotic + classic
detection works even on anonymous public booking** when the make
happens to map to automobile by default. **But the category itself is
silently wrong for true non-automobile makes** (Airstream → defaults
to automobile, when it should be RV). This explains why the operator
might see "exotic Ferrari works" but "RV Airstream broken."

---

## Target T4 — Caller-side audit

### T4.1 — Caller inventory + `category_confident` honoring

| Caller | File:line | Client | Honors `category_confident=false`? |
|--------|-----------|--------|------------------------------------|
| Public booking Step 1 | `src/components/booking/step-vehicle.tsx:128–163, 285–306` | **Browser anon-capable** | ✅ — `:285` `useClassifierCategory = classification?.category_confident === true` gates `effectiveCat`; non-confident result does NOT override user's pick |
| Customer portal vehicle form | `src/components/account/vehicle-form-dialog.tsx:215–238` | **Browser (authenticated only)** | ⚠️ **Different pattern** — the dialog uses classifier only for the inline specialty-tier advisory; the server (POST/PATCH at `/api/customer/vehicles`) is authoritative for `size_class` writes and re-runs the classifier with admin client. No category-auto-override happens client-side. |
| Customer portal POST | `src/app/api/customer/vehicles/route.ts:?` | Server admin | ✅ — re-runs classifier server-side with admin client (RLS bypassed) |
| Customer portal PATCH | `src/app/api/customer/vehicles/[id]/route.ts` | Server admin | ✅ — same |
| POS customer vehicles | `src/app/api/pos/customers/[id]/vehicles/route.ts:?` | Server admin | ✅ — same |
| Voice agent | `src/app/api/voice-agent/vehicle-classify/route.ts:38–43` | Server admin | ✅ — uses classifier output directly for tier resolution; `category_confident` is not checked because voice flow trusts the classifier OR explicit user statement |

**Bottom line:** the four `#131`-tracked callers still honor
`category_confident`. The new caller `voice-agent/vehicle-classify`
does not check the flag, but it runs server-side where the classifier
is RLS-bypassed — the silent-default is rare and the voice agent's
prose downstream handles it.

### T4.2 — Race / double-invoke

`step-vehicle.tsx`: `classifyRequestIdRef.current` race ticket (#136
B5) cleanly handles in-flight cancellation. Cleanup of the debounce
timer at `:174` `clearTimeout(timer)` prevents stale scheduled
classifications. The `classify` useCallback at `:163` is stable (empty
deps).

`vehicle-form-dialog.tsx`: same race-ticket pattern (`:88`,
`:225–235`).

**Both surfaces are race-safe.** No double-invoke issue.

### T4.3 — Error handling at callers

| Caller | Try/catch wrapping classifier? |
|--------|-------------------------------|
| `step-vehicle.tsx` | ✅ `:135–162` |
| `vehicle-form-dialog.tsx` | ✅ `:227–235` (`.then().catch()`) |
| Server callers | ✅ — wrapped in outer try/catch via route-handler convention |

**All callers degrade gracefully on `throw` paths**, but **NONE of
them detect the `{ data: null, error: <RLS denial> }` non-throw path**
because `resolveVehicleClassification` itself silently swallows it
(see S1).

---

## Target T5 — DB / data layer health

### T5.1 — `vehicle_makes` table

- Schema: `id, name, category, is_active, sort_order, …`
  (`supabase/migrations/20260223000001_create_vehicle_makes.sql`)
- Table presumed populated (the operator's combobox shows makes →
  data exists). The combobox uses `/api/vehicle-makes` (server API,
  admin client) so it works regardless of RLS.
- **RLS policies:**
  - `vehicle_makes_read FOR SELECT TO authenticated USING (true)` —
    authenticated only
  - `vehicle_makes_admin_write FOR ALL TO authenticated USING (…)` —
    admin only
  - **NO anon policy.** ← root cause of T2

### T5.2 — Auth context required by classifier

- Server callers: pass admin client → service role JWT → bypasses RLS
  entirely. ✅
- Customer portal browser client: authenticated user → RLS policy
  permits. ✅
- **Public booking browser client: anon JWT → RLS denies. ❌** (T2)

---

## Target T6 — Recent change impact analysis

### T6.1 — Per-session changes

| Session | Date | Touched | Impact on classifier |
|---------|------|---------|----------------------|
| #129 (C1, Q7, C3) | 2026-04 | classifier + portal opt-in | Added `mdl.trim()` heuristic on classifier (later superseded by #131); added dev-warns on silent defaults |
| #131 (Layer 2) | 2026-05 | `vehicle-categories.ts` + 4 caller sites | Introduced `category_confident` flag and gated all auto-writes. **DID NOT address RLS gap** because the pattern shipped while the dev environment had session-cookies persisting from manual tests, masking the anon-denial path. |
| Session 29 (size_class consolidation) | 2026-04 | type changes | No classifier-logic changes |
| #132 (year input, model case) | 2026-05 | `step-vehicle.tsx` | No classifier changes |
| #136 (B2 height-reserved container, B5 race-cancellation) | 2026-05 | `step-vehicle.tsx` + dialog | The B2 fix MAKES THE BUG MORE VISIBLE — `:565–576`'s fixed-height spinner container means the spinner is **always rendered** (just empty when `classifying=false`), so a stuck `classifying=true` is more eye-catching than the pre-#136 collapsing-row design. |
| #140 (Path B Session 1) | 2026-06-02 | `_prereq-enforcement.ts`, `_addon-vehicle-compat.ts`, booking.ts, route.ts, `step-service-select.tsx` | **Did not touch** classifier or step-vehicle.tsx |
| #141 (Path B Session 2) | 2026-06-02 | `vehicle-save-action.ts`, route.ts, booking-wizard.tsx, booking-confirmation.tsx | **Did not touch** classifier or step-vehicle.tsx |

### T6.2 — Suspect ranking

1. **PRIMARY:** RLS policy authored in #129 era restricting
   `vehicle_makes_read` to `authenticated`. The anon access gap
   pre-dates `#131`'s Layer 2 hardening; the public-booking path has
   probably been broken since at least Session 29's consolidation.
2. **SECONDARY:** #136's B2 height-reserved container made the bug
   **more visible** to operators but did not cause it.
3. **TERTIARY:** No causal link to #140/#141 — those sessions did not
   touch the classifier or its Step 1 caller.

---

## Target T7 — Severity-ranked defect inventory

| ID | Severity | Defect | File:line | Cause | Fix shape |
|----|----------|--------|-----------|-------|-----------|
| **C1** | **Critical** | Public booking Step 1 classifier silently defaults to `automobile` + `category_confident=false` (failure mode a) OR literally hangs (failure mode b) under anonymous RLS denial | `step-vehicle.tsx:136–137` (browser client) → `vehicle-categories.ts:746–750` (`vehicle_makes` query) → migration `20260223000001_create_vehicle_makes.sql` (anon-not-granted RLS) | Anon JWT lacks SELECT policy on `vehicle_makes` | ✅ **RESOLVED Session #142** — **Q-1 LOCKED Option B (architectural refactor).** Classifier's Layer-1 `vehicle_makes` query moves server-side. NEW `/api/classify-vehicle` public endpoint (admin client server-side, RLS bypassed) + NEW `classifyVehicleClient` browser wrapper. `step-vehicle.tsx` + `vehicle-form-dialog.tsx` no longer import `@/lib/supabase/client` for classifier needs — both route through the wrapper. Server-side callers (POS, voice agent, customer portal POST/PATCH, `findOrCreateVehicle`) keep calling `resolveVehicleClassification` directly with admin client (unchanged). |
| **S1** | **Significant** | `resolveVehicleClassification` destructures `await ... ` as `const { data: makeRows }` and ignores the `error` field. This makes `{ data: [], error: null }` (no rows match) indistinguishable from `{ data: null, error: <RLS denial> }`. Both fall through to dev-warn + silent default. Caller cannot detect "classifier was denied" vs "classifier ran but found no matching make." | `vehicle-categories.ts:746–778` | Missing error introspection | ✅ **RESOLVED Session #142** — **Q-2 LOCKED `console.warn` (not audit_log).** `VehicleClassification` gains optional `classifier_reason?: 'no_match' \| 'query_failed'`. Set on Layer-1 0-row matches AND disambiguation fall-through (`'no_match'`), Supabase `error` non-null response (`'query_failed'` — the RLS-denial-equivalent path), and `catch` block throws (`'query_failed'`). Omitted on confident results (backward compatible). `classifyVehicleClient` wrapper emits `console.warn` with caller context on `classifier_reason === 'query_failed'`. 4 new unit tests pin the contract. |
| **M1** | **Moderate** | Non-automobile specialty_tier "auto-detection" is hardcoded `DEFAULT_SPECIALTY_TIERS[category]` (smallest tier) regardless of model. The function comment says this is intentional ("staff corrects in POS"), but the operator's mental model from the audit prompt ("is the sorting system working?") may expect model-aware detection. | `vehicle-categories.ts:706–839` (Layer 3) + `:638–643` defaults | By design | ✅ **RESOLVED Session #142** — **Q-3 LOCKED intentional manual-pick.** Code comment in `vehicle-categories.ts` at the Layer-3 site documents the intentional manual-pick design alongside the classifier-derived Layers 1/2/4/5. UI microcopy under non-automobile specialty tier picker in `step-vehicle.tsx`: `"Please select the size that matches your {category} — affects service pricing."` — framed as required information from the customer, NOT as a fallback because automatic detection "failed." CLAUDE.md Rule 22 updated. |
| **Mi1** | **Minor** | Dead no-op useEffect at `step-vehicle.tsx:225–232` — both `if` blocks are empty (comments only). Has been dead since the useEffect was written (no commit ever populated the bodies). | `step-vehicle.tsx:225–232` | Code smell | ✅ **RESOLVED Session #142** — useEffect removed cleanly. Auto-detect routing happens via `effectiveSizeClass`/`effectiveSpecialtyTier` derived values; no side-effect needed. Memory #11 verified no other code depended on its presence. |
| **Mi2** | **Minor** | The two `vehicle-makes` data paths (combobox via `/api/vehicle-makes`, classifier via direct browser client) are inconsistent. Combobox uses server admin client (works for anon); classifier uses browser client (fails for anon). Same logical operation, two different access patterns. | `src/app/api/vehicle-makes/route.ts` vs `vehicle-categories.ts:746` | Drift over time | ✅ **RESOLVED Session #142** — C1's Option B refactor naturally closes this. ALL browser-side classifier traffic now flows through `/api/classify-vehicle` (admin client server-side); the direct-browser-client path is gone. One canonical access pattern across all browser callers. |

---

## Target T8 — Fix-arc recommendation

### Single-session restore (RECOMMENDED)

**Scope:**
1. **Migration** (~10 lines): `CREATE POLICY "vehicle_makes_anon_read" ON vehicle_makes FOR SELECT TO anon USING (is_active = true);`. Add a parallel policy for `vehicle_models` if/when that table is added (currently not in schema). Update `docs/dev/DB_SCHEMA.md` with the new policy.
2. **S1 helper hardening** (~10–20 lines): refactor `vehicle-categories.ts:746–778` to inspect the `error` field; emit a non-throwing `classifier_error` signal on the result so callers (esp. step-vehicle.tsx) can log via `console.warn` in production for telemetry. Keep BC for the existing public shape.
3. **T9 contract test** (~30–50 lines): regression-locking integration test (see T9 below).
4. **Docs:** CHANGELOG entry, ROADMAP-13-ITEMS ledger row, this audit doc's "RESOLVED" markers, FILE_TREE.

**Files touched:** 1 migration + 1 prod (`vehicle-categories.ts`) + 1 new test + 4 docs. ≈70–100 prod lines net.

**Estimated time:** 60–90 minutes. Memory #8 safe (≤5 files, ≤300 lines).

**Why this is one session:** the C1 fix is one line (migration), the
S1 fix is small (helper hardening with no behavior change for the
success path), and the T9 test is the regression lock. Splitting
would delay production restore for no gain.

### Optional follow-up (Path B refactor, NOT urgent)

If/when operator decides anon-on-RLS is unacceptable for the
`vehicle_makes` table as a security posture, Path B is:

1. Move the `vehicle_makes` lookup out of `resolveVehicleClassification`'s
   client-runnable path. Create a public API route (mirror
   `/api/vehicle-makes`) that takes `make` + optional `model` and
   returns just `{ category, category_confident }`.
2. Change `step-vehicle.tsx` to call this new API route instead of the
   classifier directly. Layers 2–5 (size_class hints, exotic, classic)
   stay client-side since they're hardcoded constants.
3. Drop the anon RLS policy from Option A.

This eliminates the drift identified in Mi2 but is larger scope.

---

## Target T9 — Regression-locking contract test

**Test name:** `step-vehicle-classifier-lifecycle.test.tsx`

**Shape (recommendation, not draft code):**

The test should mount `<StepVehicle …>` in jsdom with a mocked
`createClient` returning a configurable Supabase mock. The mock
exposes a `from('vehicle_makes').select(…).ilike(…).eq(…)` chain
whose terminating thenable can be configured to:
- Resolve immediately with success
- Resolve immediately with `{ data: null, error: { code: 'PGRST301' /* RLS */ } }`
- Resolve immediately with `{ data: [], error: null }`
- **Reject with an exception**
- **Never resolve (hang)**

For each scenario, the test:
1. Selects category 'rv'
2. Types 'Airstream' in make (via `fireEvent` on the combobox input)
3. Advances `vi.useFakeTimers()` past 400ms to fire the debounce
4. Advances past a generous classifier timeout window
5. **Asserts that `aria-busy={false}` on the height-reserved spinner
   container at `:565–576` within a deterministic window.**

The "never resolve" case is the critical anti-regression: even when
the classifier hangs forever, the spinner MUST clear within a
bounded time. This implies the fix needs to add a defensive
timeout/abort to `classify()` — for example, `Promise.race([…,
new Promise((_, reject) => setTimeout(reject, 10_000))])`. Without
that defensive timeout, the contract test fails on the "never
resolve" branch (locking the architectural property).

Companion to the existing `vehicle-forms-reset-contract.test.tsx`
(#136 T8) which runs SAME assertions across both vehicle-form
surfaces. The new test runs SAME spinner-lifecycle assertions
across step-vehicle.tsx (the lone classifying-state owner; the
dialog has no spinner) under all five Supabase failure modes.

**Test count delta:** +5 tests (one per failure mode).

---

## Open operator questions

- **Q-1 (gates C1 fix shape):** Operator preference — Option A (RLS
  hotfix migration, restore production in one session) vs Option B
  (architectural API-route refactor, larger scope)?
- **Q-2 (gates S1):** Is `console.warn` on classifier RLS-denial
  acceptable telemetry for production? Or should the audit's S1 fix
  push the signal further (e.g., to the audit_log table)?
- **Q-3 (gates M1):** Is the operator's mental model "specialty_tier
  is auto-detected" — i.e., should Layer 3 be widened to read RV
  size from model string (e.g., "35F" or "Class A" model patterns)?
  Or is the current "always default + manual pick" intentional?

---

## Hard-rules verification

- ✅ **Worktree isolation** — audit performed in `~/Claude/SmartDetails/wt-classifier-audit` on branch `audit/vehicle-classifier-comprehensive-behavior`, base `6a3f892e` (#141 Path B Session 2 merge)
- ✅ **No source / migration / test changes** — read-only throughout
- ✅ **No DB writes** — no live DB queries either; all RLS evidence from migration source
- ✅ **File:line citations** for every claim
- ✅ **Verified against actual code** (Memory #11) — every "honored" claim is backed by the code path; every "fails" claim is backed by either grep absence or trace through control flow
- ✅ **Component Behavior framing** (Memory #29 type 3) — intended behavior model first (T1), defect sweep second (T2–T5), severity ranking + fix arc last (T6–T9)
- ✅ **T2 priority** — most thoroughly investigated target; T3–T4 sweep complete; T5 RLS evidence cited directly from migration source
- ✅ **T9 contract test** lockable against the bug class (all five classifier failure modes), not a single instance

## Cross-references

- `src/components/booking/step-vehicle.tsx` — Step 1 caller (lone client-side classifying-state owner)
- `src/components/account/vehicle-form-dialog.tsx` — portal caller (no spinner, authenticated-only)
- `src/lib/utils/vehicle-categories.ts:728–839` — `resolveVehicleClassification`
- `src/lib/utils/vehicle-categories.ts:746–750` — the RLS-affected query
- `supabase/migrations/20260223000001_create_vehicle_makes.sql` — the missing-anon RLS policy
- `src/app/api/vehicle-makes/route.ts` — the EXISTING server-side data path that works for anon (uses admin client) — proof that the same logical data CAN be exposed to anon via a server route
- `docs/dev/PUBLIC_BOOKING_FLOW_AUDIT.md` (d5ea9e65) F1 — prior Layer 2 confidence work
- `docs/dev/VEHICLE_FORMS_BEHAVIOR_AUDIT.md` (d3c65ae3) — #135's behavior audit
- `docs/dev/VEHICLE_TAXONOMY_AUDIT.md` (1dd4cac7) — two-axis schema
- `CLAUDE.md` Rule 19 — vehicle size taxonomy + classifier as context-driven optional feature
