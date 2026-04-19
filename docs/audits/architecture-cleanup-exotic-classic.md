# Architecture Cleanup Audit — Exotic / Classic as Size Taxonomy

> **Scope:** Inventory-only audit. Produces intelligence for a future cleanup plan.
> **Status:** No code changes, no migrations, no deletions. Read-only.
> **Date:** 2026-04-18
> **Trigger:** Sessions 26–28 built exotic/classic handling on a flawed premise that `is_exotic` / `is_classic` should be independent boolean flags with a parallel gate/modal/badge/block-page/SMS-pivot system layered on top of normal pricing. The correct architecture is that `exotic` and `classic` are simply additional vehicle types in the existing `size_class` taxonomy — same shape as `sedan`, `truck_suv_2row`, `suv_3row_van`.

---

## Section 1 — Existing Vehicle Size Taxonomy (the Reuse Target)

How sedan / truck_suv_2row / suv_3row_van are implemented end-to-end. This is the pattern exotic/classic should have mirrored.

### 1.1 Schema

**File:** `supabase/migrations/20260201000001_create_enums.sql:4`

```sql
CREATE TYPE vehicle_size_class AS ENUM ('sedan', 'truck_suv_2row', 'suv_3row_van');
```

Postgres ENUM type. Three fixed values. No CHECK constraint, no text alias.

**File:** `supabase/migrations/20260201000004_create_vehicles.sql`

```sql
size_class vehicle_size_class,  -- NULL for specialty (motorcycle/rv/boat/aircraft which use specialty_tier)
```

Nullable column on `vehicles`. Index `idx_vehicles_type` on `vehicle_type` (not size_class).

**File:** `supabase/migrations/20260201000010_create_service_pricing.sql`

Keyed by `(service_id, tier_name)` UNIQUE. Stores one row per tier. The three size tiers are just three rows with `tier_name IN ('sedan','truck_suv_2row','suv_3row_van')` — plain text, no constraint on tier_name values. Additional columns for scope pricing fan-out:

- `is_vehicle_size_aware BOOLEAN`
- `vehicle_size_sedan_price DECIMAL(10,2)` (nullable)
- `vehicle_size_truck_suv_price DECIMAL(10,2)` (nullable)
- `vehicle_size_suv_van_price DECIMAL(10,2)` (nullable)

These three columns exist so a scope tier (e.g., "Complete Interior") can carry per-size prices without spawning three separate tier rows. Only three columns today — no exotic/classic equivalents.

**File:** `supabase/migrations/20260219000009_sale_pricing.sql`

Adds `service_pricing.sale_price DECIMAL(10,2)` per tier row. CHECK constraint `sale_price < price`. Sale price is per tier row, NOT per size variant inside a vehicle-size-aware scope tier.

### 1.2 TypeScript Constants & Types

**File:** `src/lib/utils/constants.ts:32-39`

```typescript
export const VEHICLE_SIZE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  truck_suv_2row: 'Truck/SUV (2-Row)',
  suv_3row_van: 'SUV (3-Row) / Van',
  exotic: 'Exotic',
  classic: 'Classic',
};
```

Already includes `exotic`/`classic` display labels (Session 28 extension).

**File:** `src/lib/utils/constants.ts:141-147`

```typescript
export const VEHICLE_TYPE_SIZE_CLASSES: Record<string, string[]> = {
  standard: ['sedan', 'truck_suv_2row', 'suv_3row_van'],
  motorcycle: [],
  rv: [],
  boat: [],
  aircraft: [],
};
```

Automobile entry still 3 values — has NOT been extended to include exotic/classic.

**File:** `src/lib/utils/vehicle-categories.ts`

- Lines 9–15: `VEHICLE_CATEGORIES` = `['automobile','motorcycle','rv','boat','aircraft']`.
- Lines 116–193: `MODEL_SIZE_HINTS: Record<string, string[]>` — keyword map per size_class. Sedan ≈ 87 models, truck_suv_2row ≈ 131 models, suv_3row_van ≈ 37 models. Longest-match-wins.
- Lines 625–635: `VehicleClassification` interface output of the classifier — currently has parallel fields `size_class: string | null`, `is_exotic: boolean`, `is_classic: boolean`, `requires_custom_quote: boolean`, `needs_year_confirmation: boolean`.
- Lines 668–761: `resolveVehicleClassification(supabase, make, model?, year?)` — 5-layer pipeline: (1) category lookup from `vehicle_makes`, (2) size_class via MODEL_SIZE_HINTS (automobiles only), (3) specialty_tier default, (4) exotic detection overlay, (5) classic detection overlay.
- Lines 637–646: `getSeatRows(sizeClass, vehicleCategory)` — returns 2 (sedan / truck_suv_2row) or 3 (suv_3row_van). No exotic/classic branch.
- Lines 767–800: `canonicalizeMake()` — misspelling/abbreviation map (Chevy→Chevrolet, VW→Volkswagen).
- Lines 826–865: `detectFieldInversion(make, model)` — warns when make/model appear swapped.

### 1.3 Vehicle Assignment (how size_class gets set)

**Customer booking (auto-classify):**
- `src/components/booking/step-vehicle.tsx:109-128,130-140` — debounced 400ms classifier call as customer types make/model. Customer does NOT pick size directly. The classifier output populates `VehicleSelection.size_class`.

**Customer portal (manual + auto):**
- `src/components/account/vehicle-form-dialog.tsx:33` — hardcoded `AUTOMOBILE_SIZE_CLASSES = ['sedan', 'truck_suv_2row', 'suv_3row_van']` for manual dropdown. User can override classifier result.

**POS staff:**
- `src/app/pos/components/vehicle-create-dialog.tsx` — new vehicle dialog; relies on classifier via `findOrCreateVehicle`.
- `src/app/pos/components/vehicle-selector.tsx` — pick existing or create new.

**Admin staff:**
- `src/app/admin/customers/[id]/page.tsx` — customer detail with vehicles tab.

**Write path unification:**
- `src/lib/utils/vehicle-helpers.ts:72-202` `findOrCreateVehicle()` — dedup key `(customer_id, LOWER(make), LOWER(model), vehicle_category)`. Calls `resolveVehicleClassification()` at line 101. Persists size_class AND is_exotic/is_classic (lines 142–143, 162–163).

**API endpoints:**
- `src/app/api/pos/customers/[id]/vehicles/route.ts` — POST/PUT accept caller-provided `size_class` override; logs warning if override differs from classifier output.
- `src/app/api/customer/vehicles/route.ts` — customer portal vehicle CRUD.

### 1.4 Admin UI — Service Pricing Editor

**File:** `src/components/service-pricing-form.tsx`

Renders per-pricing-model form. For `pricing_model = 'vehicle_size'`:

- Iterates `VEHICLE_SIZE_TIER_KEYS` (Session 28 extended to 5 values including 'exotic' and 'classic').
- One numeric input per size key with label from `VEHICLE_SIZE_LABELS`.
- Storage: one `service_pricing` row per tier_name.

For `pricing_model = 'scope'`:

- Variable number of rows with admin-defined `tier_name` (e.g., 'Floor Mats Only', 'Complete Interior').
- Each row has `is_vehicle_size_aware` toggle.
- If toggled on: three per-size inputs show (`vehicle_size_sedan_price`, `vehicle_size_truck_suv_price`, `vehicle_size_suv_van_price`). **Still only 3 columns — no exotic/classic columns.**

For `pricing_model = 'flat'`:
- Single `flat_price` input on the service row itself. No `service_pricing` rows at all.

Sale pricing:
- `src/app/admin/catalog/services/[id]/page.tsx` separate card exposes `sale_price` per tier plus service-level `sale_starts_at` / `sale_ends_at`.

### 1.5 POS Pricing Resolution — Call Chain

**Staff taps service → price hits ticket line.**

1. `src/app/pos/components/service-pricing-picker.tsx:43-47` receives the service's pricing tier rows. Filters based on vehicle traits.
2. `src/app/pos/utils/pricing.ts:8-26` `resolveServicePrice(pricing, size_class)`:

```typescript
export function resolveServicePrice(
  pricing: ServicePricing,
  vehicleSizeClass: VehicleSizeClass | null
): number {
  if (!pricing.is_vehicle_size_aware || !vehicleSizeClass) {
    return pricing.price;
  }
  switch (vehicleSizeClass) {
    case 'sedan': return pricing.vehicle_size_sedan_price ?? pricing.price;
    case 'truck_suv_2row': return pricing.vehicle_size_truck_suv_price ?? pricing.price;
    case 'suv_3row_van': return pricing.vehicle_size_suv_van_price ?? pricing.price;
    default: return pricing.price;
  }
}
```

3. `resolveServicePriceWithSale()` at `pricing.ts:39-58` layers sale pricing on top — returns `{ standardPrice, effectivePrice, isOnSale, saleSavings }`.
4. `src/app/pos/context/ticket-reducer.ts:200-259` `ADD_SERVICE` case — applies sale, applies combo, picks lowest of (standard, sale, combo), writes `TicketItem` with `unitPrice`, `standardPrice`, `pricingType ∈ {standard, sale, combo}`.

The three-value switch at `resolveServicePrice` is the narrow choke point. Everything else is uniform for any tier_name value.

### 1.6 Customer-facing booking

- `src/components/public/service-pricing-display.tsx:54-200` — renders pricing table. For `vehicle_size` model: columns per size with labels from `VEHICLE_SIZE_LABELS`. For `scope` model with `is_vehicle_size_aware`: sub-rows per size under each named tier.
- `src/app/api/book/route.ts:71-78` — server recomputes expected price via `computeExpectedPrice(service, tier_name, vehicle.size_class)`, rejects mismatch with 400.
- `src/app/api/book/validate-coupon/route.ts` — coupon discount uses `size_class` indirectly via resolved price.

### 1.7 Voice agent + SMS

- `src/app/api/voice-agent/vehicle-classify/route.ts:63-87` — returns a full classification payload including `size_class`, `is_exotic`, `is_classic`, `requires_custom_quote`. Human-readable `tier_name` string built at lines 47–71 (already handles 'Exotic (Custom Quote)' / 'Classic (Custom Quote)').
- `src/app/api/voice-agent/services/route.ts` — returns services with per-size pricing.
- `src/app/api/webhooks/twilio/inbound/route.ts` — checks customer vehicles before falling through to AI responder.

---

## Section 2 — Sessions 26–28 Artifacts, Classified

Every artifact introduced by Sessions 26, 27, 28 + Session 28 post-build patch. Verdicts are based on the reused-architecture target (exotic/classic as additional `size_class` values).

### 2.1 Schema artifacts

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `supabase/migrations/20260417000001_vehicle_exotic_classic_flags.sql` | Adds `vehicles.is_exotic BOOL`, `vehicles.is_classic BOOL`, `vehicles.requires_custom_quote BOOL GENERATED` + 3 partial indexes | **REPURPOSE or DELETE** | All three columns become redundant if `size_class` extends to include `'exotic'` / `'classic'`. One-time backfill (`UPDATE vehicles SET size_class = 'exotic' WHERE is_exotic = true` etc.) then drop columns + indexes. Historical migration file stays in repo. |
| `supabase/migrations/20260417000002_service_exotic_classic_floor_prices.sql` | Adds `services.exotic_floor_price`, `services.classic_floor_price` | Already historical | Columns dropped by the following migration. File stays. |
| `supabase/migrations/20260418000001_drop_service_floor_price_columns.sql` | Drops the above | Already historical | Session 28 correction. Keep. |

**New migration needed:** add `'exotic'` and `'classic'` as ENUM values on `vehicle_size_class`. Postgres allows `ALTER TYPE ... ADD VALUE` (non-destructive); Postgres does NOT allow removing values. Alternative: convert from ENUM to CHECK-constrained TEXT (more flexible). Not proposed here — see Section 5.

### 2.2 Pricing helpers (`src/app/pos/utils/pricing.ts`)

| Symbol | Lines | Verdict | Justification |
|--------|-------|---------|---------------|
| `resolveServicePrice` | 8–26 | **KEEP + EXTEND** | Core resolver. Switch statement currently handles 3 sizes; needs 2 more cases OR rewrite as lookup keyed by VEHICLE_SIZE_TIER_KEYS. Also: there are no `vehicle_size_exotic_price` / `vehicle_size_classic_price` columns on `service_pricing` for scope tiers — adding those is a separate schema decision (see gap 3.2). |
| `resolveServicePriceWithSale` | 39–58 | **KEEP** | Generic sale overlay. Untouched by exotic/classic cleanup. |
| `selectPricingTierForVehicle` | 89–107 | **DELETE** | Parallel dispatcher: looks up `tier_name = 'exotic'` or `'classic'` based on boolean flags. If `size_class` simply becomes `'exotic'` / `'classic'`, the picker's existing size-match filter selects the right row through the same pathway as any other size. No need for a special selector. |
| `shouldOpenSpecialtyModal` | 118–130 | **DELETE** | Entire concept of a "specialty gate modal" evaporates when exotic/classic are sizes. A service missing an exotic/classic tier row is a pricing config problem (fix in admin), not a POS-time prompt. Same as if a service forgot to set a `sedan` price today. |
| `src/app/pos/utils/__tests__/pricing.test.ts` | 14 tests | **REPLACE** | Tests for selectPricingTierForVehicle + shouldOpenSpecialtyModal become dead. Keep `resolveServicePrice` tests; add parity tests asserting size_class='exotic' flows identically to size_class='sedan'. |

### 2.3 POS components

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/app/pos/components/specialty-badge.tsx` (43 lines) | Orange/slate pill for exotic/classic vehicle | **DELETE** (default) or **REPURPOSE** (as generic size label) | Today there is NO visual size label on vehicle cards — sedan/truck/van are just vehicle text. If the owner wants consistent per-size treatment, promote this to a generic `VehicleSizeBadge` used across all 5 sizes. Otherwise delete and let exotic/classic display as plain text like other sizes. This is a UX decision, not architectural. |
| `src/app/pos/components/__tests__/specialty-badge.test.tsx` (8 tests) | Badge tests | Follows badge decision | Delete or rewrite for generic badge. |
| `src/app/pos/components/custom-price-modal.tsx` (217 lines) | Modal that opens when staff adds a specialty service with missing/zero tier price | **DELETE** | Parallel architecture. Under size-as-taxonomy, "missing price for a size" is no different from any other missing price and should be caught by admin-side validation, not a POS-time override flow. Eliminates 217 lines of gate logic + prefill + dual-flag handling + reference labels + below-catalog confirmation. |
| `src/app/pos/context/ticket-context.tsx:40-76` | `dispatch` wrapper with `gateModalOpen` + `pendingAction` state + CustomPriceModal render at provider level | **DELETE gate wrapper, KEEP context** | 36 lines of interception logic disappear. 6 consumer files (pos-workspace, register-tab, catalog-browser, catalog-panel, service-detail-dialog, quote-builder) already dispatch ADD_SERVICE directly — they need no changes, the gate was a transparent wrapper. |
| `src/app/pos/context/quote-context.tsx` | Identical gate for quote builder | **DELETE gate wrapper** | Same as ticket-context. |
| `src/app/pos/components/service-pricing-picker.tsx:43-47` | Filter `tier.tier_name === 'exotic' ⇔ vehicleIsExotic` (ditto classic) | **REPURPOSE** | Should become a generic "show only the tier row that matches vehicle's size_class" filter. This already is the effective behavior for sedan/truck/van tiers implicitly (picker shows all, resolver picks one). Minor simplification. |
| `src/app/pos/components/vehicle-selector.tsx:94` | `<SpecialtyBadge />` render | Follows badge decision | |
| `src/app/pos/components/customer-vehicle-summary.tsx:122` | `<SpecialtyBadge />` render | Follows badge decision | |
| Catalog consumers (`pos-workspace.tsx`, `register-tab.tsx`, `catalog-browser.tsx`, `catalog-panel.tsx`, `quote-builder.tsx`) | Pass `vehicleIsExotic` + `vehicleIsClassic` to `ServicePricingPicker` | **REPURPOSE** | Replace with single `vehicleSizeClass` prop once flags retire. The picker will filter by size match. |

### 2.4 Booking / public-facing

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/components/booking/specialty-vehicle-block.tsx` (173 lines) | Full-screen block page with phone CTA, callback form, edit-vehicle link; fires `/specialty-block-view` audit event on mount | **KEEP** (business decision) | Architecturally, this is a customer-facing phone-first UX for high-value vehicles. Owner has already invested in the copy and flow. Architectural cleanup only rewrites the trigger condition from `requires_custom_quote` to `size_class IN ('exotic','classic')`. Page itself unchanged. |
| `src/components/booking/booking-wizard.tsx` routing | After step-vehicle, conditionally render `SpecialtyVehicleBlock` based on `requires_custom_quote` | **REPURPOSE** | Update trigger condition only. |
| `src/components/booking/step-vehicle.tsx:29-42` `VehicleSelection` interface | Carries `is_exotic`, `is_classic`, `requires_custom_quote` fields | **REPURPOSE** | Drop the parallel fields. `size_class` (already present) carries all the information. |
| `src/app/api/public/specialty-block-view/route.ts` (46 lines) | Logs `booking_blocked_specialty_vehicle` audit event; denominator for conversion funnel | **KEEP** | Useful telemetry. Payload shape refactor: switch from `is_exotic`/`is_classic` booleans to `vehicle_size_class: 'exotic' \| 'classic'`. |
| `src/app/api/public/specialty-callback/route.ts` (96 lines) | Logs `specialty_callback_requested`; sends staff SMS via `renderSmsTemplate('booking_staff_notify', ...)`; numerator for conversion funnel | **KEEP** | Business logic valuable. Same payload refactor. |

### 2.5 SMS pivot

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/app/api/webhooks/twilio/inbound/route.ts:611-659` | Pre-AI gate: if customer has any vehicle with `requires_custom_quote = true`, pivot to manual-quote handoff (sets auto-reply, sends staff SMS, disables AI on conversation) | **REPURPOSE (trigger only)** | Business decision: owner likely wants to preserve the pivot for high-value customers. Architectural change: query becomes `.in('size_class', ['exotic','classic'])` instead of `.eq('requires_custom_quote', true)`. |

### 2.6 Voice agent

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/app/api/voice-agent/vehicle-classify/route.ts:73-87` response shape | Returns `{ ..., size_class, is_exotic, is_classic, requires_custom_quote, needs_year_confirmation, tier_name }` | **REPURPOSE** | Drop the 4 parallel fields; let `size_class` carry `'exotic'` / `'classic'`. The human-readable `tier_name` label mapping at lines 47–71 already produces 'Exotic (Custom Quote)' / 'Classic (Custom Quote)' strings — keep. External ElevenLabs agent likely reads the payload; coordinate a contract change. |

### 2.7 Classifier output

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/lib/utils/vehicle-categories.ts` lines 353–479 `EXOTIC_MAKES` / `EXOTIC_MAKE_MODELS` | Curated list of exotic marques and models | **KEEP** | Data is the product of real research. Reuse to set `size_class = 'exotic'` rather than `is_exotic = true`. |
| Lines 481–616 `CLASSIC_ELIGIBLE_MAKES` + `CLASSIC_YEAR_THRESHOLD` | Curated make+model+year rules for classic eligibility | **KEEP** | Same as above — data is valuable; target field changes. |
| Lines 625–635 `VehicleClassification` interface | Fields: `size_class`, `is_exotic`, `is_classic`, `requires_custom_quote`, `needs_year_confirmation` | **REPURPOSE** | Drop the 4 parallel fields. `needs_year_confirmation` is useful standalone UX signal (ask customer to confirm year on boundary cases) — keep or migrate into a separate `classification_confidence` field. |
| Lines 668–761 `resolveVehicleClassification` | 5-layer pipeline | **REPURPOSE** | Layers 4 and 5 (exotic / classic overlays) should write to `size_class` directly rather than parallel flags. Automobile-only (specialty categories unchanged). |
| `src/lib/utils/vehicle-helpers.ts:142-143,162-163` | Persists `is_exotic` / `is_classic` on vehicle write | **DELETE** | Replaced by single `size_class` write. |
| Lines 637–646 `getSeatRows` | Returns 2 or 3 based on size_class | **REPURPOSE** | Add cases for `'exotic'` and `'classic'` — likely 2 rows each (sedan-equivalent default), OR infer from the underlying vehicle type. |

### 2.8 Admin surfaces

| File | Contents | Verdict | Justification |
|------|----------|---------|---------------|
| `src/app/admin/customers/[id]/page.tsx:1437` | `<SpecialtyBadge />` render on vehicle list | Follows badge decision | |
| `src/app/admin/catalog/services/[id]/page.tsx` + `src/components/service-pricing-form.tsx` | Vehicle size pricing already renders 5 rows (Session 28 post-build patch). | **KEEP** | Already correct. |

### 2.9 Add-on Pricing Pipeline — FIRST-CLASS GAP

Add-ons are **not a special type** in the schema — they are services with `classification ∈ ('addon_only','both')`. This gap existed before Sessions 26–28 and is exposed by the exotic/classic work because exotic/classic pricing makes size-parity expectations explicit. Every file that reads or writes add-on pricing, combo pricing, or add-on sale pricing is inventoried here.

#### Current add-on pricing storage

| Location | Shape | Size-aware? |
|----------|-------|-------------|
| `services.flat_price` (column) | Single scalar | No |
| `services.sale_price` (column, `20260317000001_add_services_sale_price.sql`) | Single scalar | No |
| `services.sale_starts_at` / `sale_ends_at` (columns) | Datetime window | N/A |
| `service_addon_suggestions.combo_price` (column, `20260201000011`) | Single scalar (optional) | No |
| `service_pricing` rows | Per tier | Yes via `is_vehicle_size_aware` + 3 per-size columns — but ONLY IF the add-on service uses `pricing_model = 'scope'` or `'vehicle_size'`. Flat-price add-ons have zero rows here. |

**Evidence that add-ons never honor vehicle size for flat/combo prices:**

1. **Seed data** — `supabase/migrations/20260201000039_seed_services.sql:507,529,551,574`: 4 flat add-ons (Pet Hair Removal, Leather Conditioning, Excessive Cleaning Fee, Ozone Odor Treatment) all stored as `flat_price = 75.00`, no tier rows.
2. **Combo seed** — `supabase/migrations/20260225000002_seed_addon_suggestions.sql:76-127`: every `combo_price` is a single scalar (e.g., "Pet Hair + Express Interior Clean = 60.00"). No per-size combo variants.
3. **Resolver** — `src/app/pos/utils/pricing.ts:8-26` `resolveServicePrice` returns `pricing.price` and never reads vehicle size when `is_vehicle_size_aware = false`. Flat-price add-ons have no `ServicePricing` row at all — POS builds a synthetic tier from `service.flat_price` (see ticket-reducer), which is not `is_vehicle_size_aware`.
4. **Suggestions hook** — `src/app/pos/hooks/use-addon-suggestions.ts:40-66`: `comboPrice: row.combo_price` — single scalar stored per suggestion.
5. **Admin form** — `src/app/admin/catalog/services/[id]/page.tsx:145-156`: `addonForm` state has a single `combo_price` field, no per-size inputs.
6. **Single exception** — "Hot Shampoo Extraction" (`classification = 'both'`, `pricing_model = 'scope'`): has a "Complete Interior" scope tier with `is_vehicle_size_aware = true` + 3 per-size prices (sedan $300, truck_suv_2row $350, suv_3row_van $450). But this is because the underlying service is scope-priced, not because it's an add-on. And even this tier has no exotic/classic per-size columns.

#### File-by-file inventory

| File | Role | Reads/Writes | Verdict | Justification |
|------|------|--------------|---------|---------------|
| `supabase/migrations/20260201000009_create_services.sql` | Services table with `classification`, `flat_price`, `per_unit_price`, `pricing_model` | Writes schema | **KEEP** | Foundation. Classification enum `('primary','addon_only','both')` is correct. |
| `supabase/migrations/20260201000011_create_service_addon_suggestions.sql` | `service_addon_suggestions` table with flat `combo_price` | Writes schema | **REPURPOSE (add size-aware columns)** | Gap: table has no per-size combo pricing. Options: add 3 more nullable columns (`combo_price_sedan`, `combo_price_truck_suv`, `combo_price_suv_van`) + `is_combo_size_aware` flag, OR convert to JSONB map, OR leave flat and accept the gap. Decision needed. |
| `supabase/migrations/20260317000001_add_services_sale_price.sql` | `services.sale_price` flat column | Writes schema | **REPURPOSE** | Flat `services.sale_price` cannot express per-size sale. Sale discounts for vehicle_size-model services already live in `service_pricing.sale_price` per tier; flat add-ons only have this column. |
| `supabase/migrations/20260314000003_add_transaction_items_is_addon.sql` | Historical `transaction_items.is_addon` marker | Writes schema | **KEEP** | Record-keeping flag, orthogonal to pricing model. |
| `supabase/migrations/20260225000002_seed_addon_suggestions.sql` | Seed rows | Writes data | **KEEP** | Data values valid; table shape is what needs consideration. |
| `src/app/pos/hooks/use-addon-suggestions.ts:22-88` | Fetch suggestions, surface `comboPrice` to UI | Reads `service_addon_suggestions` | **REPURPOSE** | If combo pricing becomes size-aware, return size-matched price. Signature changes from `comboPrice: number \| null` to `comboPrice: number \| null` (resolved for current vehicle). |
| `src/app/pos/components/addon-suggestions.tsx:85-150` | Chip UI; click opens detail dialog with `comboPrice` flat scalar | Reads | **REPURPOSE** | Adapt to resolved combo price. |
| `src/app/pos/components/service-detail-dialog.tsx` | Opens picker; receives `comboPrice` prop | Reads | **REPURPOSE** | Pass through resolved value. |
| `src/app/pos/context/ticket-reducer.ts:200-259` | `ADD_SERVICE` case; applies combo vs sale vs standard | Reads `service.flat_price`, `service.sale_price`, `comboPrice` | **KEEP + EXTEND** | Already picks lowest-of. If combo becomes size-aware, upstream resolution is all that changes; reducer keeps `pricingType: 'combo'` semantics. |
| `src/app/api/pos/jobs/[id]/addons/route.ts:59-296` | Job add-on creation (staff recommends add-on mid-job); `price` is manually entered | Writes `job_addons` | **KEEP** | Staff manually types the price for job-level add-on recommendations. Not a size-aware pathway today. Decision: either start size-resolving the pre-fill (requires the resolver change above) or leave manual entry as-is. |
| `src/app/api/admin/catalog/services/[id]/...` (inferred from `src/app/admin/catalog/services/[id]/page.tsx`) | Admin CRUD for services + suggestions | Writes `services`, `service_addon_suggestions` | **REPURPOSE** | If combo_price becomes size-aware, admin form renders 5 per-size inputs (gated by a toggle) same as `vehicle_size` pricing model. |
| `src/lib/services/job-addons.ts` | Service layer for job-level add-on suggestions | Reads | **KEEP** | Orthogonal to pricing resolution. |
| `src/lib/utils/sale-pricing.ts:43-62` `getTierSaleInfo` | Generic sale overlay — applied to ALL services including add-ons | Reads `standardPrice` + `salePrice` | **KEEP + EXTEND** | Becomes 5-sized when `resolveServicePrice` extends. |
| `src/components/service-pricing-form.tsx` | Admin pricing editor per `pricing_model` | Writes | **KEEP + EXTEND** | Already 5-row for vehicle_size. Scope tiers still have 3 per-size columns — extend to 5 if scope tiers need exotic/classic fan-out (see gap 3.2). Flat form has no per-size inputs — decision needed if flat add-ons need size awareness. |
| `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx` (lines around combo display) | Public service page shows combo suggestions with flat price | Reads | **REPURPOSE** | If combo becomes size-aware, show "Add Pet Hair for $60 (sedan) / $70 (truck)" or similar. Or stay flat. |

**Does any add-on currently honor vehicle size?**

One service ("Hot Shampoo Extraction") honors vehicle size in one of its scope tiers ("Complete Interior") — and this works equally when Hot Shampoo is used as a primary service OR as a combo add-on. But this is a side effect of scope + vehicle-size-aware flag, not an add-on-specific feature. For the 4 flat-price add-ons (Pet Hair, Leather Conditioning, Excessive Cleaning, Ozone), the answer is: **zero vehicle size awareness**, for base price, combo price, or sale price.

**Is this a real gap?**

Yes. A Ferrari and a Honda Civic both get "Pet Hair Removal" at the same $75 today. This may be intentional (pet hair effort is vehicle-independent), but the choice is not available to configure — the data model forbids size-aware add-on pricing, regardless of the business need. For an owner now shipping per-size pricing for exotic/classic, the mismatch is stark.

### 2.10 CHANGELOG / commit trail

Commits on the current branch for Sessions 26–28:
- `a79886ac fix(admin): extend VEHICLE_SIZE_TIER_KEYS to include exotic and classic (Session 28 gap)`
- `d8b8e522 refactor: promote exotic/classic to first-class pricing tiers + badge restyle`
- `e8c70e58 fix: split booking block into two audit events (view + callback)`
- `86a9f06a feat: exotic/classic consumer surfaces (POS badge + modal, booking block, SMS pivot)`

---

## Section 3 — Gaps (what the correct architecture still needs)

Items required to make exotic/classic fully mirror sedan/truck/van behavior. Each is listed as a specific missing piece; none have been implemented yet.

### 3.1 Size class domain extended to 5 values

**Current:** Postgres ENUM `vehicle_size_class = ('sedan','truck_suv_2row','suv_3row_van')` — 3 values.

**Needed:** either
- `ALTER TYPE vehicle_size_class ADD VALUE 'exotic'; ALTER TYPE vehicle_size_class ADD VALUE 'classic';` (non-destructive, ENUM preserved), OR
- convert `size_class` from ENUM to `TEXT` with a CHECK constraint listing all 5 values (more flexible for future additions, requires a table-rewrite migration).

Neither has been done. Session 28 extended the TypeScript constants but left the DB ENUM at 3 values — meaning today the 10 `service_pricing` rows with `tier_name IN ('exotic','classic')` are valid (tier_name is plain text) but you cannot yet set `vehicles.size_class = 'exotic'`.

### 3.2 Scope pricing size fan-out columns — 3 columns, not 5

**File:** `service_pricing` has:
- `vehicle_size_sedan_price DECIMAL(10,2)`
- `vehicle_size_truck_suv_price DECIMAL(10,2)`
- `vehicle_size_suv_van_price DECIMAL(10,2)`

**Needed (if scope tiers should support exotic/classic fan-out):**
- `vehicle_size_exotic_price DECIMAL(10,2)` and `vehicle_size_classic_price DECIMAL(10,2)` (additive), OR
- convert to JSONB `per_size_prices` column, OR
- leave at 3 and accept that scope-model services won't have per-size exotic/classic variants (exotic/classic go through vehicle_size model only).

Today only Hot Shampoo Extraction's "Complete Interior" tier uses this pattern — so the real-world cost of leaving it at 3 columns may be zero.

### 3.3 Admin vehicle edit — no manual size_class override

**File:** `src/app/admin/customers/[id]/page.tsx` — vehicle list shows `<SpecialtyBadge />` (currently) but has no UI to manually change a vehicle's size_class. If the classifier misfires on a 1972 Ferrari (e.g., detects make as "Ferrari" but misses the year for classic), staff cannot directly set `size_class = 'classic'`. They rely on classifier re-run or direct DB edit.

Decision needed: expose a size_class dropdown in the admin vehicle edit modal? Likewise for POS vehicle create dialog.

### 3.4 Customer portal vehicle form — size dropdown still 3 values

**File:** `src/components/account/vehicle-form-dialog.tsx:33` hardcodes `AUTOMOBILE_SIZE_CLASSES = ['sedan','truck_suv_2row','suv_3row_van']` for the manual dropdown shown to customers.

If this dropdown should include 'exotic' and 'classic', extend the array. Decision: probably NOT — customers shouldn't self-identify as exotic (game the pricing). Likely stays at 3 with exotic/classic reserved for classifier output.

### 3.5 Classifier output shape — parallel fields

**File:** `src/lib/utils/vehicle-categories.ts:625-635`. Current `VehicleClassification` interface has:

```typescript
size_class: string | null;
is_exotic: boolean;
is_classic: boolean;
requires_custom_quote: boolean;
needs_year_confirmation: boolean;
```

**Needed:** single source of truth. Either:
- drop the four booleans and let `size_class ∈ ('sedan','truck_suv_2row','suv_3row_van','exotic','classic')` carry everything, OR
- keep `needs_year_confirmation` as standalone UX signal (ambiguous classification requiring customer confirmation) — this is orthogonal to the classification verdict.

### 3.6 `getSeatRows()` — exotic/classic not handled

**File:** `src/lib/utils/vehicle-categories.ts:637-646`. Switch handles sedan/truck_suv_2row/suv_3row_van; default returns 2. Exotic and classic fall to default — probably correct (exotics are typically 2-seaters, classics vary), but should be explicit.

### 3.7 Add-on size awareness — see Section 2.9

No size-aware infrastructure for flat `flat_price`, `sale_price` on add-on services, or `combo_price` on suggestions. This is the biggest architectural gap exposed by the exotic/classic work and is a first-class decision for the cleanup plan.

### 3.8 POS resolver switch — 3 cases, not 5

**File:** `src/app/pos/utils/pricing.ts:8-26`. Switch covers sedan / truck_suv_2row / suv_3row_van; adding exotic and classic requires 2 more cases + 2 more column reads. Alternative: rewrite as key-driven lookup.

### 3.9 External consumers

Verified via grep on `is_exotic`, `is_classic`, `requires_custom_quote`: no external webhooks, analytics exports, or third-party consumers read these fields today. The Voice agent payload is the only "external" consumer (ElevenLabs reads the JSON response); contract change is self-contained.

---

## Section 4 — Data Inventory

Audit cannot execute SQL directly. Three queries should be run before the cleanup plan is finalized:

### 4.1 Vehicle flag counts vs size_class

```sql
SELECT
  COUNT(*) FILTER (WHERE is_exotic = true)  AS exotic_count,
  COUNT(*) FILTER (WHERE is_classic = true) AS classic_count,
  COUNT(*) FILTER (WHERE is_exotic = true AND is_classic = true) AS both_count,
  COUNT(*) FILTER (WHERE requires_custom_quote = true) AS requires_custom_quote_count,
  COUNT(*) AS total_vehicles
FROM vehicles;

SELECT
  size_class,
  COUNT(*) FILTER (WHERE is_exotic = true) AS exotic,
  COUNT(*) FILTER (WHERE is_classic = true) AS classic,
  COUNT(*)
FROM vehicles
GROUP BY size_class
ORDER BY COUNT(*) DESC;
```

Expected shape: very small counts (this pathway is 1 day old at time of audit). If 0 across the board, backfill is moot.

### 4.2 service_pricing rows with exotic/classic tier

```sql
SELECT
  s.id,
  s.name,
  s.classification,
  s.pricing_model,
  sp.tier_name,
  sp.price,
  sp.sale_price,
  sp.is_vehicle_size_aware
FROM service_pricing sp
JOIN services s ON s.id = sp.service_id
WHERE sp.tier_name IN ('exotic', 'classic')
ORDER BY s.name, sp.tier_name;

SELECT
  tier_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT service_id) AS service_count
FROM service_pricing
WHERE tier_name IN ('exotic', 'classic')
GROUP BY tier_name;
```

Session 28 reports 10 rows across ~5 services. Confirm shape matches the existing pattern (tier_name text, per-service uniqueness, optional sale_price).

### 4.3 Historical transaction use

```sql
SELECT
  COUNT(*) AS transaction_count,
  COUNT(DISTINCT t.customer_id) AS unique_customers
FROM transactions t
JOIN vehicles v ON v.id = t.vehicle_id
WHERE v.is_exotic = true OR v.is_classic = true;

SELECT
  COUNT(*) AS job_count
FROM jobs j
JOIN vehicles v ON v.id = j.vehicle_id
WHERE v.is_exotic = true OR v.is_classic = true;
```

Measures real-world volume of exotic/classic work. Informs whether the SMS pivot and booking block page have ever triggered (check `audit_log` for `booking_blocked_specialty_vehicle` and `specialty_callback_requested` events).

### 4.4 Orphan / inconsistency checks

```sql
-- Vehicles with is_exotic=true but size_class not in (nullable / 'automobile-default')
SELECT id, vehicle_category, size_class, make, model, is_exotic, is_classic
FROM vehicles
WHERE (is_exotic = true OR is_classic = true)
  AND vehicle_category <> 'automobile';

-- services with legacy exotic_floor_price / classic_floor_price references (should be zero after Session 28)
-- Expected: columns dropped; any lingering code references are orphans. Grep only.
```

---

## Section 5 — Minimum Delta (Options Listed; None Endorsed)

Four orthogonal decisions the cleanup plan will need to settle. Each decision is presented with its options — the cleanup plan will pick one per decision based on discussion with the owner.

### Decision A — `vehicle_size_class` domain

- **A1.** `ALTER TYPE vehicle_size_class ADD VALUE 'exotic'; ADD VALUE 'classic';`
  - Non-destructive, preserves enum safety.
  - Cannot remove values later if ever needed (e.g., rename).
- **A2.** Convert `size_class` from ENUM to `TEXT` with CHECK constraint.
  - More flexible (future additions trivial).
  - One-time table-rewrite migration.
- **A3.** Leave ENUM at 3 values; store `exotic`/`classic` in a different place.
  - Effectively what Session 28 did (tier_name is text; vehicles.size_class stays nullable; exotic/classic vehicles have NULL size_class + is_exotic/is_classic flags).
  - Keeps the parallel system — rejected by the cleanup premise.

### Decision B — Boolean flag columns

After backfilling `size_class` from `is_exotic` / `is_classic`:

- **B1.** Drop `vehicles.is_exotic`, `vehicles.is_classic`, `vehicles.requires_custom_quote` + all 3 partial indexes.
  - Cleanest; single source of truth.
  - Requires code update across every consumer (see Section 2 DELETE/REPURPOSE entries).
- **B2.** Keep the flags as generated columns computed from `size_class`.
  - Preserves existing query callsites (none external — audit verified).
  - Preserves parallel mental model (two ways to express the same concept).
  - Generated columns require the size_class domain extension (Decision A) first.

### Decision C — Existing `service_pricing` rows with tier_name IN ('exotic','classic')

These 10 rows already fit the existing pattern shape exactly. No options here:

- **C1.** Keep as-is. Same upsert flow as sedan/truck_suv_2row/suv_3row_van. No shape change, no data migration, no admin UI change (already extended in Session 28).

### Decision D — Badge / label treatment

- **D1.** Delete `SpecialtyBadge` and display exotic/classic as plain text, matching how sedan/truck/van are displayed today.
  - Simplest. Removes 43 lines + 8 tests + 3 render callsites.
- **D2.** Promote `SpecialtyBadge` to a generic `VehicleSizeBadge` used uniformly across all 5 sizes on vehicle cards.
  - Adds visual consistency; needs UX design for sedan/truck/van treatments.
  - New design surface, not just a cleanup.
- **D3.** Keep `SpecialtyBadge` only for exotic/classic (status quo).
  - Preserves parallel visual treatment contradicting the architectural cleanup's premise.

### Decision E — Add-on size awareness (first-class gap)

- **E1.** Leave add-ons flat (current state). Accept that exotic/classic/truck/van all pay the same for Pet Hair Removal.
  - Zero schema change. Zero code change.
- **E2.** Add per-size combo pricing columns to `service_addon_suggestions` (`combo_price_sedan`, etc.). Add per-size sale pricing to flat add-ons (either via new service_pricing rows or new `services.sale_price_*` columns).
  - Most surface area. Admin UI extensions, resolver changes, tests.
- **E3.** Hybrid: route all add-on pricing through `service_pricing` rows (force `pricing_model = 'vehicle_size'` or `'scope'` on any addon_only service, retire `services.flat_price` for add-ons).
  - Schema consolidation. Single pricing path across all services. Breaks the "flat add-on" shortcut used in seeds.

### Decision F — Business-logic preservation (booking block page, SMS pivot, voice agent asymmetry)

- **F1.** Preserve all three under the new trigger condition (`size_class IN ('exotic','classic')`).
  - Minimal customer-facing change. Owner's Session 27 UX investment is retained.
- **F2.** Delete one or more (e.g., drop the SMS pivot, let AI quote from service_pricing rows since exotic/classic tiers now exist).
  - Consistent with "exotic/classic is just another size" — AI can now quote them. But removes a high-touch UX for high-value customers.
- **F3.** Preserve block page but drop SMS pivot; voice agent returns size_class without asymmetry.
  - Mixed — cleanup plan can settle.

---

## Summary — What the Cleanup Plan Will Need

1. **One schema migration** — extend `vehicle_size_class` domain (Decision A), backfill `size_class` from flags, optionally drop flag columns (Decision B).
2. **Classifier rework** — `resolveVehicleClassification` writes a single `size_class`; output interface drops 4 parallel fields (decision on `needs_year_confirmation`).
3. **POS helper consolidation** — delete `selectPricingTierForVehicle` + `shouldOpenSpecialtyModal` + custom-price-modal + gate wrappers in ticket/quote contexts. Extend `resolveServicePrice` switch from 3 → 5 cases.
4. **Consumer updates** — 6 POS catalog files stop passing `vehicleIsExotic`/`vehicleIsClassic` to picker; picker filter becomes size-match.
5. **Booking / SMS / voice trigger rewrites** — change boolean check to `size_class IN (...)`. Preserve or remove per Decision F.
6. **Badge decision** — Decision D drives delete vs promote vs keep.
7. **Add-on gap** — Decision E is the biggest open question and is NOT a simple cleanup — it's a new capability. Cleanup plan should surface this as a separate phase.
8. **Test rewrite** — `pricing.test.ts` dropping gate tests, `specialty-badge.test.tsx` following badge decision, add size-parity tests for exotic/classic going through the normal resolver.

No external system consumers identified. Data backfill expected to be low-volume (flags are 1-day-old feature). No migrations need to be reverted.

---

**End of audit.**
