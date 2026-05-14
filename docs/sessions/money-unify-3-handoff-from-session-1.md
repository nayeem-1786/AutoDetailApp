# Phase Money-Unify-3 — Handoff from Session 1

> Generated 2026-05-14. Session 1 paused mid-Task-4 (caller migration)
> after the schema migration applied cleanly to the shared Supabase
> project (reconciliation Checkpoint #2 zero divergence) but a
> substantial caller-code migration remained. This document hands off
> all open work + decisions for a Session 2 resumption.

---

## 1. Status summary

| State | Value |
|---|---|
| Migration UP applied to shared Supabase DB | ✅ `20260514071552_unify_3_catalog_family_to_cents.sql` |
| Reconciliation Checkpoint #2 | ✅ Zero divergence across all 15 columns |
| WIP commit hash | **`(see `git log` for the WIP commit hash — second commit after `14cb28f4`)`** — see §9 |
| Pushed to origin/main? | ❌ NO. **DO NOT push** until Session 2 completes |
| `origin/main` (remote) | `14cb28f4` (Unify-3 playbook v3 commit) |
| VPS production | `ec14ca8f` (VPS alignment for Unify-1+2 deploy) |
| Production DB schema | Has Unify-3 _cents columns + CHECKs + updated `void_transaction()` |
| Production VPS code | Does NOT yet read/write Unify-3 _cents columns |
| Local app code | WIP — 200 TypeScript errors remain in caller code |

**Misalignment window (active):** The shared Supabase DB has the Unify-3
schema applied; the VPS app code is still at pre-Unify-3 (it reads/writes
the legacy dollar columns). The legacy columns are still present with
their pre-migration values intact — the migration did NOT drop them
(two-phase commit pattern). **The VPS production app continues to work
correctly** against the legacy columns. The only concern is whether
catalog rows are CREATED or EDITED via the production admin UI during
this window — see §7.

---

## 2. Completed work

These checkpoints from Session 1 are settled. **Do not redo.**

| Item | Status |
|---|---|
| Migration UP applied to shared Supabase DB | ✅ |
| Reconciliation Checkpoint #2 | ✅ Zero divergence |
| DOWN migration staged at `supabase/migrations/_rollback/` | ✅ |
| `database.types.ts` regenerated | ✅ |
| `src/lib/supabase/types.ts` (Service/ServicePricing/Product) | ✅ Cents-canonical |
| `src/lib/utils/validation.ts` Zod schemas | ✅ Cents-canonical (`positiveInt` on `_cents` fields) |
| `src/lib/utils/sale-pricing.ts` (TierSaleInfo helpers) | ✅ Cents-canonical |
| `src/lib/services/service-resolver.ts` (ResolvedPrice) | ✅ Cents-canonical |
| `src/lib/services/ai-content-writer.ts` boundary | ✅ Renders `formatMoney(cents)` |
| `src/lib/qbo/sync-catalog.ts` boundary | ✅ `fromCents()` at QBO `UnitPrice` write |
| `src/lib/seo/json-ld.ts` | ✅ Offer.price uses `fromCents(...)` |
| `scripts/import-square-data.mjs` | ✅ Writes `_cents` columns via `parseDollarToCents` |
| 8 `TODO Unify-D` shim sites in `src/` | ✅ All cleared (`grep == 0`) |
| `po_items` typo (followups #11) | ✅ Fixed at `catalog/products/[id]/page.tsx:174` |
| Family C boundary shim in `/api/admin/jobs/[id]` | ✅ With 3 `TODO Unify-C` markers — see §4 |
| `CartItem.price` → `price_cents` (cart-context + 2 add-to-cart components) | ✅ |
| `getTierSaleInfo` renamed fields → `originalPriceCents` / `currentPriceCents` / `savingsCents` | ✅ |

---

## 3. Remaining work — file by file

200 TypeScript errors remain. Total open files: ~28 (plus tests).

### 3.1 Admin form pages — the biggest scope

#### `src/app/admin/catalog/services/[id]/page.tsx` — 37 errors

**Why it's broken:** The Unify-2 vendor-form pattern locked in this
phase: **form-state holds dollars; conversion to cents happens at submit**.
Session 1 reverted the form-state interface field names in
`src/components/service-pricing-form.tsx` back to dollar names
(`ScopeTier.price`, `SpecialtyTier.price`, `FlatPricing.flat_price`,
`CustomPricing.custom_starting_price`, `PerUnitPricing.per_unit_price`,
`VehicleSizePricing.sedan` etc. — all stay bare-name dollars). The parent
admin page still has mixed references and needs:

1. **Load path** (`buildPricingValue` + `reset()`):
   - Read `_cents` columns from DB
   - Convert via `fromCents(cents)` to populate form state
   - Sites: lines 245-247 (reset call), 270-274 (sale price state),
     292-296 (vehicle_size load), 302-316 (ScopeTier load), 320-345
     (per_unit / flat / custom / specialty load)

2. **Save path** (search for the supabase `.update()` / `.insert()` calls):
   - Read form state (dollars)
   - Convert via `toCents(dollars)` to write `_cents` columns
   - Honor whole-dollar CHECK constraints — submit should reject
     non-whole-dollar inputs for base-price fields (not sale_price)

3. **Validation feedback** lines 1387, 1391, 1412, 1515, 1520, 1522,
   1524, 1550, 1552, 1554, 1565:
   - These read `tier.price_cents` (broken — should be `tier.price`)
   - And `formatCurrency(tier.price_cents)` (broken — should be
     `formatCurrency(tier.price)` since form holds dollars)
   - Some may have been auto-renamed; verify each

**Pattern reference:** This is exactly the Unify-2 vendor form pattern.
See `src/app/admin/inventory/vendors/page.tsx` for the canonical
example — RHF holds `min_order_amount` as dollars, onSubmit converts via
`toCents()` to write `min_order_amount_cents`. CHANGELOG entry for
Unify-2 (`600a3655`) documents the boundary policy.

**Edge cases:**
- `service.flat_price_cents` may be `null` if `flat_price` was NULL in
  legacy — `fromCents(null)` is illegal; guard with `?? null` before
  divide, set form to `''` if null.
- `sale_price_cents` is genuinely nullable (no whole-dollar CHECK either)
- The vehicle-size scope tier has 5 size-specific `_cents` columns;
  each needs the same fromCents() guard.
- `validation.ts` `serviceCreateSchema` now expects `_cents`. The form
  submit path must convert before calling the schema. Either:
  (a) Convert at submit then validate
  (b) Keep using `serviceCreateSchema` against form-state dollars, but
      add a separate post-submit cents-conversion step
  (a) is cleaner; (b) preserves current code flow

#### `src/app/admin/catalog/services/new/page.tsx` — 6 errors

**Why it's broken:** Same pattern as `[id]/page.tsx` but starts from
empty state. No DB load — only save. Smaller scope.

**Pattern reference:** Same as above. After fixing `[id]/page.tsx`,
apply the analogous save-path conversion here.

### 3.2 API routes

#### `src/app/api/book/route.ts` — 17 errors

**Why it's broken:** Customer booking submission API. Reads service
pricing to compute total + tax + deposit; persists `appointments`
(Family C) and `appointment_services` (Family C). The route now sees:
- Family D columns (services.flat_price, etc.) — **migrated to cents**
- Family C columns (appointment_services.price_at_booking, mobile_zones.surcharge, appointments.mobile_surcharge, etc.) — **still dollars**

This is a **mixed-family boundary route.**

**Pattern to apply:**
- Service price reads: switch to `_cents` columns; do math in cents
- Mobile zone surcharge (Family C): still dollars — leave as-is OR add
  `toCents()` shim with `TODO Unify-C` marker
- appointment_services.price_at_booking write (Family C): still
  dollars — write dollars (current behavior) OR add shim
- Tax math: compute in cents at the end of the chain

**Reference:** Mirror the `/api/admin/jobs/[id]` shim pattern (Session 1
established this): at the API boundary, transform shapes to provide
cents to downstream consumers, with `// TODO Unify-C` markers at the
conversion sites.

**Decision needed at next session start:** Should `appointment_services.price_at_booking`
writes in this route be:
- (a) **kept as dollars** for now (matches DB column type) — minimal change
- (b) **converted via shim** (toCents inside the route, but write dollars to DB) — middle ground
- (c) **deferred** — leave route broken until Family C migrates

Recommendation: (a). The DB column is dollars; write dollars. Mark with
`// TODO Unify-C: convert to write _cents when Family C migrates` if
desired but not required.

#### `src/app/api/book/validate-coupon/route.ts` — 3 errors

**Why it's broken:** Reads service pricing for coupon-eligibility check.
Service prices now cents.

**Pattern:** Quick: switch service price reads to `_cents`, propagate
through `calculateCouponDiscount` (which takes cents per coupon-helpers'
existing contract).

#### `src/app/api/pos/jobs/[id]/checkout-items/route.ts` — 3 errors

**Why it's broken:** Reads `job_addons` (Family C, still dollars) and
returns a shape with `price` field that POS expects to render. Now POS
expects cents per the catalog-card / pricing-picker rewrites.

**Pattern:** Same Family C shim — at the route boundary, add
`price_cents: toCents(addon.price)` with `// TODO Unify-C` marker.

#### `src/app/api/voice-agent/services/route.ts` — 4 errors

**Why it's broken:** Emits service pricing to ElevenLabs as
human-readable strings. Service columns now cents.

**Pattern:** Replace dollar inline formatting with `formatMoney(cents)`.
Voice model reads `"$125.00"` or `"$125"`; either is fine.

### 3.3 Customer booking UI

#### `src/components/booking/booking-wizard.tsx` — 13 errors

**Why it's broken:** Customer booking flow's main state machine. Reads
service prices to compute estimate + deposit + total. Uses
`flat_price`/`per_unit_price`/`custom_starting_price` (all now `_cents`).

**Pattern:**
- All price reads: switch to `_cents`
- All math: operate on cents
- All display: `formatMoney(cents)`
- Deposit calc: convert deposit dollar setting → cents at use site

**Watch out for:** This file uses `STRIPE_MIN_DOLLARS` (line 915 per
Unify-1 consolidation). The booking submit may compare against deposit
dollars or cents — verify the comparison happens in the same unit.

#### `src/components/booking/step-service-select.tsx` — 4 errors

**Why it's broken:** Displays per-tier prices via `getTierSaleInfo` (now
returns cents-typed `originalPriceCents` etc.). Reads via `formatCurrency`
which expects dollars — needs swap to `formatMoney`.

**Pattern:** Replace `formatCurrency(info.originalPrice)` →
`formatMoney(info.originalPriceCents)`. Same for `currentPriceCents`,
`savingsCents`.

#### `src/components/booking/step-confirm-book.tsx` — 3 errors

**Why it's broken:** Booking summary screen — displays totals.

**Pattern:** Same swap. Likely 1-2 `formatCurrency` calls receiving
cents that should swap to `formatMoney`.

### 3.4 POS components

#### `src/app/pos/jobs/components/job-detail.tsx` — 4 errors

**Why it's broken:** Renders job services + addons (Family C territory
mostly). The JobService/JobAddon shapes from
`/api/admin/jobs/[id]` (Session 1 added cents shim) are now cents but
this file may still use bare names.

**Pattern:** Verify shape coming from API; render with `formatMoney(cents)`.
If the same shape is fetched from a different route (POS-side), that
route may also need a cents shim — check `api/pos/jobs/[id]/checkout-items`
(above).

#### `src/app/pos/components/catalog-browser.tsx` — 3 errors

**Why it's broken:** Catalog price display.

**Pattern:** Swap to `formatMoney(cents)`.

#### `src/app/pos/utils/pricing.ts` — 1 error (per residual)

**Why it's broken:** `resolveServicePrice` was perl-renamed but type
signatures may not match. Verify.

### 3.5 AI messaging + assorted libs

#### `src/lib/services/messaging-ai.ts` — 3 errors

**Why it's broken:** AI conversation summary references service pricing.

**Pattern:** Swap to `_cents` reads + `formatMoney` output.

#### `src/lib/utils/compose-line-items.ts` — 2 errors

**Why it's broken:** Already imports cents-related helpers; small
residual mismatches.

**Pattern:** Inspect and fix per-error.

### 3.6 Tests (Task 5 territory — scheduled work, not surprise errors)

The 5 test files below total ~46 errors. Treat as **scheduled rewrites**
per v3 Part 8 + the test-fixture pattern locked in Unify-2's CHANGELOG.

| File | Errors | Pattern |
|---|---|---|
| `src/app/pos/utils/__tests__/pricing.test.ts` | 12 | Fixtures update from dollars → cents (× 100 each value); rename type-field accesses |
| `src/app/pos/components/__tests__/service-pricing-picker.test.tsx` | 9 | Same |
| `src/app/pos/components/__tests__/service-detail-dialog.test.tsx` | 9 | Same |
| `src/app/pos/context/__tests__/quote-reducer-vehicle-change.test.ts` | 5 | Same |
| `src/app/pos/context/__tests__/ticket-reducer-vehicle-change.test.ts` | 5 | Same |
| `src/app/admin/catalog/products/components/__tests__/quick-edit-drawer.test.tsx` | (verify) | Cost/retail prices × 100 |
| `src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts` | (verify) | cost_price → cost_price_cents in fixtures |
| `src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts` | (verify) | Same |

**Pattern reference:** See Unify-2's test-fixture migration commits
(`600a3655` touched `stock-adjustments.test.ts`, `refund.test.ts`,
`payment-intent-succeeded.test.ts`) — fixture values × 100; type
shapes switch to `_cents` field names.

**New tests required per v3 Part 8 §Family D:**

1. **Vehicle-size pricing resolver returns cents**
   - `resolvePrice(service, sizeClass)` returns `priceCents` integer
   - Tier sale-aware path returns `salePriceCents` integer
   - File: `src/lib/services/__tests__/service-resolver.test.ts` (new)

2. **`chk_services_sale_price` CHECK rejects `sale_price_cents >= flat_price_cents`**
   - DB-level rejection test via supabase client INSERT with bad values
   - Also for `chk_service_pricing_sale_price` and `chk_product_sale_price`
   - File: integration test (location TBD; possibly new `src/lib/utils/__tests__/check-constraints.test.ts`)

3. **AI content writer reads cents and renders dollars correctly**
   - `buildServiceContext(category, slug)` produces price string matching
     `formatMoney(flat_price_cents).replace(/\.00$/, '')`
   - File: `src/lib/services/__tests__/ai-content-writer.test.ts` (new)

4. **POS pricing picker snapshot regenerated**
   - The existing `service-pricing-picker.test.tsx` has UI snapshots — after
     fixture update they should regenerate cleanly to the cents-rendered
     state

5. **Public service/product page snapshots regenerated**
   - Same — existing snapshot tests should regenerate

---

## 4. Family C boundary detail

**3 `TODO Unify-C` markers** placed in Session 1 at the Family-C-to-cents
boundary. These mark sites where Unify-3 added a `toCents()` shim to
shape Family C data (still dollars in DB) into cents-suffixed shape for
the cents-canonical app surface.

| File | Line | Context |
|---|---|---|
| `src/app/admin/jobs/[id]/page.tsx` | 38 | Above `JobService` interface — explains why the type defines `_cents` fields |
| `src/app/api/admin/jobs/[id]/route.ts` | 72 | Inside `enrichedAddons.map()` — converts `addon.price` and `addon.discount_amount` to cents |
| `src/app/api/admin/jobs/[id]/route.ts` | 87 | Above the `shapedServices` block — converts each `jobs.services` JSONB entry's `price` to cents |

**Verbatim comment format used** (per user-locked instruction):
```
// TODO Unify-C: when Family C migrates appointment_services.
// price_at_booking and job_addons.price to cents, remove
// toCents() and read _cents columns directly. See docs/
// sessions/money-unify-0-migration-playbook-v3.md §Family C.
```

**For Unify-6 (Family C — Appointments) cleanup:**

When Family C migrates:
- `appointment_services.price_at_booking` → `price_at_booking_cents`
- `job_addons.price` → `price_cents`
- `job_addons.discount_amount` → `discount_amount_cents`
- `jobs.services` JSONB entries with `price` → `price_cents`

…the shim sites become direct reads:
```ts
// Before (Unify-3 shim):
price_cents: addon.price != null ? toCents(addon.price) : 0,

// After (Unify-6 cleanup):
price_cents: addon.price_cents,
```

Cleanup steps:
1. Remove the `toCents()` calls + `// TODO Unify-C` comments
2. Switch SELECTs to read `_cents` columns
3. Drop the `shapedServices` intermediate transformation if all consumers
   already read the new JSONB shape

**Other API routes likely needing the same shim during Session 2 work:**
- `/api/pos/jobs/[id]/checkout-items` (Family C: addons + jobs.services)
- `/api/book/route.ts` mobile-zone surcharge writes (Family C)
- `/api/admin/appointments/...` if any (search at session start)

Each addition increments the TODO Unify-C count for Unify-6 to clean up.

---

## 5. The bulk-rename lesson

### What happened

Session 1 used a bulk perl regex pass on `.price` → `.price_cents` to
handle `service_pricing.price` and `packages.price` member-access
patterns across the codebase. The pattern was `\.price\b(?!_cents)` —
word boundary + negative lookahead. This was applied across **all
non-test source files** in `src/`.

**Outcome:** The rename touched:
- ✅ `service_pricing.price` access (Family D, correct)
- ✅ `packages.price` access (Family D, correct — but `packages` is
  empty so no live impact)
- ❌ `job_addons.price` access (Family C, **incorrect** for Unify-3)
- ❌ `appointment_services.price_at_booking` — NOT renamed (different
  field name, regex didn't match) but the rename of `.price` on related
  local types (`JobService.price`, `JobAddonEnriched.price`) caused a
  cascading boundary issue
- ❌ Local domain types with bare `.price` (CartItem, ScopeTier,
  SpecialtyTier, ServicePricingRow, inline `{ price: number; }` in
  opengraph) — some were correct (Family D), others were correct-by-
  accident

### Resolution

**Option A (user-approved):** Treat Family C local types as cents now
with `toCents()` shims at the API boundary. Mark with `// TODO Unify-C`
verbatim comment. Family C migration (Unify-6) removes the shims.

**Form-state pattern (separate decision):** For admin form pages, the
form-state stays dollars-in-state (Unify-2 vendor pattern). Conversion
to cents happens at the save boundary. Form-state interface field names
revert to bare dollar names (`ScopeTier.price`, etc.).

### Critical warning for Unify-5 (Family A — Transactions)

**Do NOT use bulk regex on these property names:**

- `.amount`
- `.total`
- `.subtotal`
- `.tax`
- `.tip`
- `.fee`

These appear in **every transactional family**:
- transactions.subtotal/total_amount/tax_amount/tip_amount/discount_amount (Family A — Unify-5)
- payments.amount (Family A)
- refunds.amount/refund_items.amount (Family A)
- quotes.subtotal/total_amount/tax_amount (Family B — Unify-8)
- appointments.subtotal/total_amount/tax_amount/discount_amount (Family C — Unify-6)
- orders.subtotal/total/tax_amount/discount_amount/shipping_amount (Family E — Unify-4)
- coupon_rewards.discount_value/max_discount (Family F — Unify-7)

A bulk `.amount` rename would touch all six families simultaneously,
exactly the boundary issue Unify-3 surfaced — at **6× the blast radius**.

**Instead:** Surgical per-file edits. Tools to use:
- `grep -l` to inventory files
- `Edit` tool with full context blocks (not bulk perl)
- Per-file typecheck after edit to localize damage

A `.subtotal` rename plan for Unify-5 should list each file individually
and walk through each, not run a regex sweep.

---

## 6. Gate readiness checklist for Session 2

Per LOCKED-6 + Gate 16 (TODO Unify-C count):

| Gate | Status | Notes |
|---|---|---|
| Gate 1 — Pre-flight verification | ✅ Done | See `docs/sessions/money-unify-3-reconciliation.md` Checkpoint #1 |
| Gate 2 — Migration applied | ✅ Done | `supabase db push --linked` succeeded |
| Gate 3 — Reconciliation passes | ✅ Done | Checkpoint #2 — zero divergence |
| Gate 4 — Lint baseline documented | ⏳ Pending | Cannot run cleanly with 200 type errors; document new count post-typecheck-clean |
| Gate 5 — Typecheck clean | ❌ 200 errors | Session 2 primary work |
| Gate 6 — Existing tests pass | ❌ Tied to Gate 7 | Tests fail until fixture updates land |
| Gate 7 — New tests added + pass | ❌ Pending | Per v3 Part 8 §Family D — see §3.6 |
| Gate 8 — `TODO Unify-D` count in `src/` == 0 | ✅ Done | `grep -rn "TODO Unify-D" src/ \| wc -l` returns 0 |
| Gate 9 — `po_items` grep == 0 (active code) | ✅ Done | Only a comment reference remains explaining the fix |
| Gate 10 — Legacy NUMERIC columns untouched | ⏳ Verify | Re-run `information_schema.columns` check at Session 2 start |
| Gate 11 — `void_transaction()` updated | ✅ Done | Function reads `cost_price_cents` directly; `// TODO Unify-D` removed |
| Gate 12 — New CHECK constraints validate | ✅ Done | Via Checkpoint #2 reconciliation (sale-price discipline, whole-dollar, non-negative) |
| Gate 13 — `database.types.ts` regenerated | ✅ Done | `supabase gen types typescript --linked` ran clean |
| Gate 14 — No production deploy yet | ✅ Deferred | Will happen in Session 2 after gates 4-7 + 10 + 15 pass |
| Gate 15 — Smoke test passes | ❌ Pending | `npm run dev` + visit /services, /products, /admin/catalog/services |
| Gate 16 — `TODO Unify-C` count documented | ✅ **3 markers** | Locations in §4 above |

---

## 7. Production state notes for resumption

**Critical concern: misalignment window.**

The shared Supabase DB has Unify-3 schema applied. New cents columns
exist on `services`, `service_pricing`, `products`, `packages` — but
the VPS production app is unaware of them. When the VPS app reads, it
reads legacy dollar columns (still populated, unchanged). When the VPS
app writes (creates/edits a row in admin UI), it writes ONLY to legacy
dollar columns — the new `_cents` columns get `NULL` instead of
`ROUND(dollar * 100)`.

**User instruction during this window:** Avoid catalog edits via
production admin UI. Read-only operations are fine.

**At Session 2 start, verify:**

```sql
-- Should return 0 rows if no catalog edits happened
SELECT COUNT(*) FROM services
WHERE flat_price IS NOT NULL AND flat_price_cents IS NULL;

SELECT COUNT(*) FROM services
WHERE sale_price IS NOT NULL AND sale_price_cents IS NULL;

SELECT COUNT(*) FROM service_pricing
WHERE price IS NOT NULL AND price_cents IS NULL;

SELECT COUNT(*) FROM service_pricing
WHERE sale_price IS NOT NULL AND sale_price_cents IS NULL;

SELECT COUNT(*) FROM products
WHERE cost_price IS NOT NULL AND cost_price_cents IS NULL;

SELECT COUNT(*) FROM products
WHERE retail_price IS NOT NULL AND retail_price_cents IS NULL;

SELECT COUNT(*) FROM products
WHERE sale_price IS NOT NULL AND sale_price_cents IS NULL;

SELECT COUNT(*) FROM packages
WHERE price IS NOT NULL AND price_cents IS NULL;
```

**Backfill query if any rows surface:**

```sql
UPDATE services SET
  flat_price_cents = CASE WHEN flat_price IS NOT NULL THEN ROUND(flat_price * 100)::INTEGER ELSE NULL END,
  sale_price_cents = CASE WHEN sale_price IS NOT NULL THEN ROUND(sale_price * 100)::INTEGER ELSE NULL END,
  custom_starting_price_cents = CASE WHEN custom_starting_price IS NOT NULL THEN ROUND(custom_starting_price * 100)::INTEGER ELSE NULL END,
  per_unit_price_cents = CASE WHEN per_unit_price IS NOT NULL THEN ROUND(per_unit_price * 100)::INTEGER ELSE NULL END
WHERE (flat_price IS NOT NULL AND flat_price_cents IS NULL)
   OR (sale_price IS NOT NULL AND sale_price_cents IS NULL)
   OR (custom_starting_price IS NOT NULL AND custom_starting_price_cents IS NULL)
   OR (per_unit_price IS NOT NULL AND per_unit_price_cents IS NULL);

UPDATE service_pricing SET
  price_cents = CASE WHEN price IS NOT NULL THEN ROUND(price * 100)::INTEGER ELSE NULL END,
  sale_price_cents = CASE WHEN sale_price IS NOT NULL THEN ROUND(sale_price * 100)::INTEGER ELSE NULL END,
  vehicle_size_sedan_price_cents = CASE WHEN vehicle_size_sedan_price IS NOT NULL THEN ROUND(vehicle_size_sedan_price * 100)::INTEGER ELSE NULL END,
  vehicle_size_truck_suv_price_cents = CASE WHEN vehicle_size_truck_suv_price IS NOT NULL THEN ROUND(vehicle_size_truck_suv_price * 100)::INTEGER ELSE NULL END,
  vehicle_size_suv_van_price_cents = CASE WHEN vehicle_size_suv_van_price IS NOT NULL THEN ROUND(vehicle_size_suv_van_price * 100)::INTEGER ELSE NULL END,
  vehicle_size_exotic_price_cents = CASE WHEN vehicle_size_exotic_price IS NOT NULL THEN ROUND(vehicle_size_exotic_price * 100)::INTEGER ELSE NULL END,
  vehicle_size_classic_price_cents = CASE WHEN vehicle_size_classic_price IS NOT NULL THEN ROUND(vehicle_size_classic_price * 100)::INTEGER ELSE NULL END
WHERE (price IS NOT NULL AND price_cents IS NULL)
   OR (sale_price IS NOT NULL AND sale_price_cents IS NULL)
   OR (vehicle_size_sedan_price IS NOT NULL AND vehicle_size_sedan_price_cents IS NULL)
   OR (vehicle_size_truck_suv_price IS NOT NULL AND vehicle_size_truck_suv_price_cents IS NULL)
   OR (vehicle_size_suv_van_price IS NOT NULL AND vehicle_size_suv_van_price_cents IS NULL)
   OR (vehicle_size_exotic_price IS NOT NULL AND vehicle_size_exotic_price_cents IS NULL)
   OR (vehicle_size_classic_price IS NOT NULL AND vehicle_size_classic_price_cents IS NULL);

UPDATE products SET
  cost_price_cents = CASE WHEN cost_price IS NOT NULL THEN ROUND(cost_price * 100)::INTEGER ELSE NULL END,
  retail_price_cents = CASE WHEN retail_price IS NOT NULL THEN ROUND(retail_price * 100)::INTEGER ELSE NULL END,
  sale_price_cents = CASE WHEN sale_price IS NOT NULL THEN ROUND(sale_price * 100)::INTEGER ELSE NULL END
WHERE (cost_price IS NOT NULL AND cost_price_cents IS NULL)
   OR (retail_price IS NOT NULL AND retail_price_cents IS NULL)
   OR (sale_price IS NOT NULL AND sale_price_cents IS NULL);

UPDATE packages SET
  price_cents = CASE WHEN price IS NOT NULL THEN ROUND(price * 100)::INTEGER ELSE NULL END
WHERE price IS NOT NULL AND price_cents IS NULL;
```

If any row had to be backfilled, also re-run Checkpoint #2 reconciliation
to confirm zero divergence before continuing.

---

## 8. Continuation prompt template

Paste this verbatim to start Session 2:

```
Read CLAUDE.md and docs/dev/FILE_TREE.md first.
Read docs/sessions/money-unify-3-handoff-from-session-1.md.
Read docs/sessions/money-unify-3-reconciliation.md.
Read docs/sessions/money-unify-0-migration-playbook-v3.md
  §Family D (Part 6, Part 7, Part 8, Phase Sequence Summary
  §Unify-3, Decision E).
Read docs/dev/MONEY.md.

SESSION SCOPE — PHASE MONEY-UNIFY-3 SESSION 2: COMPLETE
CALLER MIGRATION + COMMIT + DEPLOY

Resume from WIP commit (see `git log` for the WIP commit hash — second commit after `14cb28f4`). Migration UP
already applied to shared Supabase DB; reconciliation Checkpoint
#2 zero divergence. 200 TypeScript errors remain in caller code.

Continue Task 4 (caller migration) from where Session 1 paused.
Then Tasks 5-15 per Session 1's original prompt.

Critical reminders:
- DO NOT re-apply migration; it's already applied.
- DO NOT use bulk regex renames on .price/.amount/.total.
- Family C boundary uses toCents() shim with TODO Unify-C
  markers; do not over-rename Family C types.
- Form-state boundary pattern: load cents from DB → convert
  to dollars for form state → convert back to cents on submit.
  Follow the Unify-2 vendor pages pattern.
- After fixing admin/catalog/services/[id]/page.tsx (largest
  file at 37 errors), PAUSE and report so user can verify
  form-state boundary pattern before continuing.
- Path 2 deploy per v3 Decision E: commit → push → user-
  performed deploy → CC verifies via curl, never SSH.
- DO NOT push commit until all 16 gates pass and user
  approves at Task 10.

Before starting work:
- Verify production state per handoff §7 (any rows with
  legacy column populated but _cents column NULL?). Run
  backfill queries if so + re-verify Checkpoint #2.

Estimated work: ~2 hours through commit gate, then user deploy
+ post-deploy verification.
```

---

## 9. WIP commit info

| Field | Value |
|---|---|
| Commit hash | **`(see `git log` for the WIP commit hash — second commit after `14cb28f4`)`** |
| Branch | `main` |
| Pushed | **NO** |
| Author | Session 1 (CC) |
| Message | `WIP: Unify-3 caller migration in progress — DO NOT DEPLOY` |

**DO NOT push** until Session 2 completes the remaining work and all 16
gates pass and user approves at Task 10.

---

End of handoff. Session 2 should resume by reading this document end-to-end,
verifying production state per §7, then resuming Task 4 per §3.
