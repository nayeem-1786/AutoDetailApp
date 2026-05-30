# Exotic / Classic Handling Audit (2026-05-29)

> Read-only diagnostic. No source / migration / test changes.
> Branch: `audit/exotic-classic-create-form-and-public-site-leak`
> Performed in an isolated `git worktree` off `origin/main` (`1599e1af`,
> the #124 merge) so the shared checkout stays undisturbed.

## Context

Two related concerns, audited together because they share the same domain
model (`size_class` taxonomy) and pivot on a single existing constant
(`CUSTOMER_SELF_SERVICE_SIZE_CLASSES`):

**CONCERN A — Admin create form.** Already diagnosed in
`docs/dev/POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md` Target 3 (Issue 1,
2026-05-28): the Add-New-Service form's `pricing_model === 'vehicle_size'`
branch hard-codes exactly three tier inserts (sedan / truck_suv_2row /
suv_3row_van) at `src/app/admin/catalog/services/new/page.tsx:231-237`.
Operators must use the Edit page afterward to add exotic / classic.
This audit confirms the citation still holds, captures the Edit
reference implementation, and shapes a surgical fix.

**CONCERN B — Public website leak.** Operator constraint, locked
2026-05-29: the public, customer-facing website MUST NOT show exotic or
classic pricing or labels. Those size classes are operator-internal only
(admin / POS / quotes / jobs visible). This audit enumerates every public
surface that currently leaks, ranks by severity, and recommends a
chokepoint fix.

## TL;DR

**CONCERN A** — The gap holds: `new/page.tsx:231-237` writes only the 3
standard tiers, even though the shared `ServicePricingForm` component
already collects exotic and classic inputs (`src/components/service-pricing-form.tsx:117-145`).
The user's typed exotic / classic prices are **silently dropped at
insert time** — not a "form doesn't collect" gap, an **"insert handler
ignores collected data" gap**. Surgical fix: mirror the Edit page's
upsert pattern (`[id]/page.tsx:608-655`) — append `specialtyUpserts` to
the insert array when the operator entered a price. ~10 lines, one file.

**CONCERN B** — Three public surfaces leak machine-readable exotic /
classic prices, all at the catalog-services public path (`/services/[cat]/[svc]`),
and one customer-facing booking surface has a latent path:

| # | Surface | Severity | What leaks |
|---|---------|----------|------------|
| 1 | `src/lib/seo/json-ld.ts:160-178` — `AggregateOffer.lowPrice` / `highPrice` / `offerCount` | **HIGH (SEO)** | Exotic ceiling indexed by Google Knowledge Graph; `offerCount` reveals 5 tiers exist |
| 2 | `src/components/public/service-pricing-display.tsx:54-113` — `VehicleSizePricing` table | **HIGH** | Exotic / Classic columns rendered in the public price table |
| 3 | `src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx:32` — `Math.min` floor | LOW | Min over all prices — only mathematical floor risk; no label leak |
| 4 | `src/components/booking/step-service-select.tsx:995-1021` — `vehicle_size` top-level picker | LATENT | Renders Exotic / Classic buttons IF Step-1 vehicle is not yet known; Zod schema rejects upstream so unreachable in normal flow |

**The single source of truth already exists** — `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`
(`src/lib/utils/constants.ts:65-79`) was added Session 30 with explicit
intent: *"Restricted 3-value size_class subset used in customer-facing
flows ONLY... Customers cannot self-identify as exotic or classic —
those require staff quote handoff per business policy."* The booking
wizard, customer portal vehicle form, public ServiceCard, and the
booking API all import and respect it. The 3 high-stakes leaks above are
**unadopted public surfaces, not missing infrastructure**. Fix is to
route each leaked surface through that constant — ~15-25 lines total.
**`json-ld.ts` is the highest-priority leak** (machine-readable,
indexable).

**Open operator-decision questions** — two:
1. **B6 — customer's own exotic/classic quote.** When a customer with an
   actually-exotic vehicle receives a quote / receipt / pay link, the
   tier label "Exotic" is currently surfaced via `renderTierToken`
   (`src/lib/quotes/tier-display.ts:90`). Should this be (A) always
   masked to a generic label like "Custom" or "Your Vehicle" even for
   the customer it applies to, or (B) shown only on personalized links
   to that customer, never on public catalog pages? The catalog leaks
   are unambiguous bugs; the per-customer link rendering is a UX choice.
2. **C1 — DB-layer guard.** Should `service_pricing` rows have a
   `customer_facing` boolean (default true), or a CHECK constraint that
   rejects `tier_name IN ('exotic','classic')` outside size-class context?
   Application-layer-only is fine if the catalog filter is centralized;
   probably overkill to bake into Postgres.

---

## CONCERN A — Admin create form

### A1 — Confirm the gap

`src/app/admin/catalog/services/new/page.tsx:231-237`:

```ts
if (formData.pricing_model === 'vehicle_size' && pricingValue.model === 'vehicle_size') {
  const pricingRows = [
    { service_id: service.id, tier_name: 'sedan', tier_label: 'Sedan', price: typeof pricingValue.data.sedan === 'number' ? pricingValue.data.sedan : 0, display_order: 0, is_vehicle_size_aware: false },
    { service_id: service.id, tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price: typeof pricingValue.data.truck_suv_2row === 'number' ? pricingValue.data.truck_suv_2row : 0, display_order: 1, is_vehicle_size_aware: false },
    { service_id: service.id, tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price: typeof pricingValue.data.suv_3row_van === 'number' ? pricingValue.data.suv_3row_van : 0, display_order: 2, is_vehicle_size_aware: false },
  ];
  const { error: pricingError } = await supabase.from('service_pricing').insert(pricingRows);
  if (pricingError) throw pricingError;
}
```

Hard-coded 3-element array. No exotic / classic.

**Refinement on the prior audit's finding.** That audit said the form
"doesn't collect" exotic / classic. Re-reading the shared form
component, the gap is sharper than that: the form **already collects**
all 5 size keys via `VehicleSizeForm` in
`src/components/service-pricing-form.tsx:117-145`, which maps over
`VEHICLE_SIZE_CLASS_KEYS` (all 5) and renders an input per key:

```ts
// src/components/service-pricing-form.tsx:116
const sizeKeys: readonly (keyof VehicleSizePricing)[] = VEHICLE_SIZE_CLASS_KEYS;

// :123
{sizeKeys.map((key) => (
  <FormField key={key} label={VEHICLE_SIZE_LABELS[key]}>
    ...
    <Input ... value={data[key]} onChange={...} />
  </FormField>
))}
```

And the value shape includes all 5 keys (`VehicleSizePricing` at
`service-pricing-form.tsx:14-20`):

```ts
export interface VehicleSizePricing {
  sedan: number | '';
  truck_suv_2row: number | '';
  suv_3row_van: number | '';
  exotic: number | '';
  classic: number | '';
}
```

So `pricingValue.data.exotic` and `pricingValue.data.classic` are
populated when the operator types a price — and then **silently
discarded** by `new/page.tsx:231-237` because the insert array only
references the 3 standard keys. The operator's input is not validated
away, not warned about, just dropped on the floor.

This is materially worse than "the form is incapable of writing it" —
the form **collects** the data and the save handler **ignores** it.

The other branches at `new/page.tsx:241-261` (`scope`) and `:263-278`
(`specialty`) DO handle exotic / classic via their `vehicle_size_*_price`
columns when `is_vehicle_size_aware` is true. The gap is `vehicle_size`-
model-specific.

### A2 — Reference implementation in Edit

`src/app/admin/catalog/services/[id]/page.tsx:608-655` (model ===
'vehicle_size'). The shape is:

1. **Standard tiers always upserted** (sedan / truck_suv_2row /
   suv_3row_van) — empty values become 0 (lines 610-614).
2. **Specialty tiers conditional** (exotic / classic) — array drives a
   loop (lines 617-640):
   ```ts
   const specialtyTiers = [
     { name: 'exotic' as const, label: 'Exotic', display_order: 3 },
     { name: 'classic' as const, label: 'Classic', display_order: 4 },
   ];
   const specialtyUpserts: typeof standardRows = [];
   const specialtyDeletes: string[] = [];
   for (const { name, label, display_order } of specialtyTiers) {
     const priceValue = pricingValue.data[name];
     const hasPrice = typeof priceValue === 'number' && priceValue > 0;
     if (hasPrice) {
       specialtyUpserts.push({ service_id: serviceId, tier_name: name, tier_label: label, price: priceValue, ..., display_order });
     } else {
       specialtyDeletes.push(name);
     }
   }
   ```
3. **Deletes run before upserts** (lines 643-649) — clears specialty
   rows the operator emptied.
4. **Single upsert call** on `service_pricing` with
   `onConflict: 'service_id,tier_name'` (lines 651-655).

**Empty semantics.** The Edit page treats `priceValue > 0` as "include"
and anything else (null / empty string / 0) as "exclude / delete".
That's the cleanest binary: "no price entered" = no row written. A
literal `0` is also treated as "no price" by the same predicate — which
matches the operator intent (free-of-charge services would use `flat`
with 0, not a tier with 0). The Create fix should mirror this exact
predicate so the two pages behave identically.

The Edit form's INPUTS are rendered through the same shared
`<ServicePricingForm>` component that Create uses, so there is no
separate UI to mirror — just the persistence logic.

### A3 — Validation schema

`src/lib/utils/validation.ts:158-179` — `serviceCreateSchema` defines
service-row fields only (name, slug, classification, pricing_model,
flat_price, custom_starting_price, per_unit_*, etc.). It does **not**
define per-tier price fields. Per-tier pricing flows through the form's
`pricingValue` state and is inserted into `service_pricing` separately
from the validated payload (the schema gates only the `services` row).

`servicePricingSchema` (validation.ts:184-194) — separately defines per-
tier rows, but is missing `vehicle_size_exotic_price` and
`vehicle_size_classic_price` fields. It is **not** consumed by either the
Create or Edit forms today (they pass plain objects to `.insert()` /
`.upsert()`), so this gap is independent of the A4 fix. Worth a
follow-up patch to bring the schema in line with the live columns —
flagged here, not blocking.

**Fix-scope verdict.** The Create-form fix is purely persistence-layer:
no schema change required, no UI change required. Just extend the
existing `pricingRows` array construction to mirror Edit's
`specialtyUpserts` loop.

### A4 — Fix recommendation

**Shape.** In `new/page.tsx:231-237`, replace the 3-element hard-coded
array with the same standard-tiers + specialty-tiers pattern Edit uses,
adapted for INSERT (no UPSERT / no delete branch — a brand-new service
has no rows to update or delete):

```ts
if (formData.pricing_model === 'vehicle_size' && pricingValue.model === 'vehicle_size') {
  const standardRows = [
    { service_id: service.id, tier_name: 'sedan', tier_label: 'Sedan', price: typeof pricingValue.data.sedan === 'number' ? pricingValue.data.sedan : 0, display_order: 0, is_vehicle_size_aware: false },
    { service_id: service.id, tier_name: 'truck_suv_2row', tier_label: 'Truck/SUV (2-Row)', price: typeof pricingValue.data.truck_suv_2row === 'number' ? pricingValue.data.truck_suv_2row : 0, display_order: 1, is_vehicle_size_aware: false },
    { service_id: service.id, tier_name: 'suv_3row_van', tier_label: 'SUV (3-Row) / Van', price: typeof pricingValue.data.suv_3row_van === 'number' ? pricingValue.data.suv_3row_van : 0, display_order: 2, is_vehicle_size_aware: false },
  ];
  const specialtyTiers = [
    { name: 'exotic' as const, label: 'Exotic', display_order: 3 },
    { name: 'classic' as const, label: 'Classic', display_order: 4 },
  ];
  const specialtyRows = specialtyTiers
    .filter(({ name }) => typeof pricingValue.data[name] === 'number' && (pricingValue.data[name] as number) > 0)
    .map(({ name, label, display_order }) => ({
      service_id: service.id,
      tier_name: name,
      tier_label: label,
      price: pricingValue.data[name] as number,
      display_order,
      is_vehicle_size_aware: false,
    }));
  const { error: pricingError } = await supabase
    .from('service_pricing')
    .insert([...standardRows, ...specialtyRows]);
  if (pricingError) throw pricingError;
}
```

- 1 file, ~15 lines net change.
- Empty semantics exactly match Edit (`> 0` → include, anything else →
  skip).
- No schema extension needed (`serviceCreateSchema` doesn't touch tier
  rows; the insert is a plain `.from('service_pricing').insert()`).
- No UI change needed (shared `<ServicePricingForm>` already renders
  exotic / classic inputs).

**Edge cases.**
- *Operator enters 0 explicitly to mean "free":* skipped, same as Edit.
  If "free exotic" is ever a real product, both Create and Edit need a
  separate fix; flag for operator confirmation.
- *Operator enters a price for exotic but not classic (or vice versa):*
  works correctly — `.filter()` is per-tier.
- *Migration backfill:* not required — the prior audit's DB query
  confirmed Paint Correction Prep has only the 3 standard rows, but
  other `vehicle_size` services could already have exotic / classic
  added via Edit. New services created post-fix follow the new path;
  existing services are unaffected.

**Test coverage.** Add a unit test (mirroring the prior Track A pattern):
create a `vehicle_size` service with `pricingValue.data.exotic = 250`
and `classic = 300`, assert 5 rows inserted with correct
`tier_name` / `display_order`. Assert 3-row insertion when exotic /
classic are empty / 0 / null.

---

## CONCERN B — Public-site leak sweep

### B1 — Surface enumeration

The route tree was walked under `src/app/(public)/`. The single
short-link redirect `src/app/q/[token]/page.tsx` just redirects to
`/quote/[token]` (no rendering). `src/app/s/[code]/route.ts` is a
service-code redirect (no rendering).

| # | Public surface | File:line | Iterates all `service_pricing`? | Filters to `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`? | Leak? | Severity |
|---|----------------|-----------|----------------------------------|--------------------------------------------------|-------|----------|
| 1 | Service detail JSON-LD `AggregateOffer` (Google Knowledge Graph) | `src/lib/seo/json-ld.ts:161-178` | YES (`pricingRows.map(p => p.price)`) | NO | **YES** | **HIGH (SEO)** |
| 2 | Service detail price table — `VehicleSizePricing` | `src/components/public/service-pricing-display.tsx:54-113` | YES (`tiers.map(...)` over header + body) | NO | **YES** | **HIGH** |
| 3 | Service detail price table — `ScopeTierRow` (vehicle-size-aware scope tier) | `src/components/public/service-pricing-display.tsx:158-199` | NO (3 hardcoded rows: Sedan / Truck-SUV / SUV-Van) | YES (by hardcoding the 3) | NO | — |
| 4 | Service detail OpenGraph image | `src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx:32` | YES (`Math.min` over all `price` values) | NO | **MATHEMATICAL ONLY** | LOW |
| 5 | Service detail page chrome (sidebar / breadcrumbs / FAQ) | `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:1-321` | n/a | n/a | NO | — |
| 6 | Service detail JSON-LD `Service` schema (non-Offer fields) | `src/lib/seo/json-ld.ts:85-117` | n/a | n/a | NO | — |
| 7 | Service detail JSON-LD FAQ schema | `src/lib/seo/json-ld.ts` (FAQ branch) | n/a | n/a | NO | — |
| 8 | Service detail "Recommended Add-Ons" section | `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:228-285` | NO — uses `flat_price` / `custom_starting_price` / `combo_price` only | n/a | NO | — |
| 9 | Service detail "You May Also Like" — `ServiceCard` | `src/components/public/service-card.tsx:43-216` (via `relatedServices`) | NO (engine + `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) | YES | NO | — |
| 10 | Category page `/services/[categorySlug]` — `ServiceCard` grid | `src/app/(public)/services/[categorySlug]/page.tsx:105-118` | NO (delegates to `ServiceCard`) | YES (transitively) | NO | — |
| 11 | Services index `/services` — `ServiceCategoryCard` | `src/app/(public)/services/page.tsx` + `src/components/public/service-category-card.tsx` | n/a (no pricing) | n/a | NO | — |
| 12 | Sitemap `/sitemap.xml` | `src/app/sitemap.xml/route.ts:127-139` | n/a (one URL per service, no size variants) | n/a | NO | — |
| 13 | robots.txt | `src/app/robots.txt/route.ts` | n/a | n/a | NO | — |
| 14 | City landing pages `/areas/[citySlug]` | `src/app/(public)/areas/[citySlug]/page.tsx` (483 lines, 0 matches for price/tier/size) | n/a | n/a | NO | — |
| 15 | Booking wizard vehicle-size picker (vehicle_size model, top-level) | `src/components/booking/step-service-select.tsx:995-1021` | YES (`tiers.map(...)`) | NO | **LATENT** | LOW (gated by Zod) |
| 16 | Booking wizard vehicle-size picker (scope-tier nested) | `src/components/booking/step-service-select.tsx:1082-1117` | NO (uses `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`) | YES | NO | — |
| 17 | Booking wizard `<ScopeTierCard>` "From X" floor | `src/components/booking/step-service-select.tsx:1247-1255` | NO (filters to customer subset) | YES | NO | — |
| 18 | Public `/book` page — vehicle pre-fill from logged-in customer | `src/app/(public)/book/page.tsx:96-99, 134-138` | n/a (reads stored `size_class`, doesn't render tiers) | n/a | NO | — |
| 19 | Public quote `/quote/[token]` — line-item tier label | `src/app/(public)/quote/[token]/page.tsx:286-294` via `renderTierToken` | n/a (renders the quote's actual `tier_name`) | n/a | **B6 QUESTION** | (operator decision) |
| 20 | Public receipt `/receipt/[token]` — line-item tier label | `src/app/(public)/receipt/[token]/page.tsx:238-252` via `renderTierToken` | n/a | n/a | **B6 QUESTION** | (operator decision) |
| 21 | Public pay `/pay/[token]` — line-item tier label | `src/app/(public)/pay/[token]/page.tsx:304` via `renderTierToken` | n/a | n/a | **B6 QUESTION** | (operator decision) |
| 22 | Booking submit API `/api/book` | `src/app/api/book/route.ts:441-443` | n/a | YES (validates `size_class` against the constant) | NO | — |
| 23 | Bookings Zod schema | `src/lib/utils/validation.ts:342-345`, `:433-436` | n/a | YES (`bookingVehicleSchema` + `customerVehicleSchema` enum) | NO | — |

The **three rows worth fixing** are #1, #2, and #4 (active leaks on
public, indexed catalog pages). Row #15 is a latent leak — the path is
unreachable in normal booking flow because Step-1's vehicle picker
already restricts to customer-facing sizes, but the picker buttons
would render exotic / classic if a flow ever entered with no vehicle
chosen and a `vehicle_size` service that has exotic / classic rows. Worth
patching defensively in the same arc as #1-#4.

Rows #19-#21 are the B6 operator-decision class — see §B6.

### B2 — The taxonomy module

`src/lib/utils/constants.ts:42-79` is the single source of truth and
**already has the customer-facing subset built**:

```ts
// constants.ts:57-63
export const VEHICLE_SIZE_CLASS_KEYS: readonly VehicleSizeClass[] = [
  'sedan',
  'truck_suv_2row',
  'suv_3row_van',
  'exotic',
  'classic',
] as const;

// constants.ts:65-79
/**
 * Restricted 3-value size_class subset used in customer-facing flows ONLY:
 * booking wizard, account portal, /api/book validation, customer vehicle save.
 *
 * This is a deliberate UX/trust boundary. Customers cannot self-identify as
 * exotic or classic — those require staff quote handoff per business policy.
 *
 * Do NOT collapse this into VEHICLE_SIZE_CLASS_KEYS. The two are semantically
 * different — one is the full taxonomy, one is the customer-exposed subset.
 */
export const CUSTOMER_SELF_SERVICE_SIZE_CLASSES: readonly VehicleSizeClass[] = [
  'sedan',
  'truck_suv_2row',
  'suv_3row_van',
] as const;
```

There is a **unit test** that pins the boundary
(`src/lib/utils/__tests__/constants.test.ts:16-34`): "contains exactly 3
customer-exposed values" and "strict subset of VEHICLE_SIZE_CLASS_KEYS".
Anyone adding a 4th customer-facing size value would have to touch the
test deliberately.

**Adopters today** (grep across `src/`):
- `src/lib/utils/validation.ts:343, 434` — booking + customer-portal Zod
  enums.
- `src/app/api/book/route.ts:441` — server-side defense (transaction-item
  size_class normalize / reject).
- `src/components/booking/step-service-select.tsx:1082, 1248` — wizard
  size picker + scope "From X" floor.
- `src/components/public/service-card.tsx:81` — catalog card "From X"
  floor.
- `src/components/account/vehicle-form-dialog.tsx:33` — customer portal
  vehicle form size dropdown.
- `src/app/admin/customers/[id]/page.tsx:294` — admin customer-facing
  vehicle form (the comment at :294 explicitly invokes the constant by
  name).

**Non-adopters** (the leaks):
- `src/lib/seo/json-ld.ts` (B1 row #1).
- `src/components/public/service-pricing-display.tsx` (B1 row #2).
- `src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx` (B1 row #4).
- `src/components/booking/step-service-select.tsx:995-1021` for the
  `vehicle_size`-model top-level picker (B1 row #15).

### B3 — Booking wizard

The wizard's customer-flow size selection (where the customer's vehicle
size influences pricing or selection) is correctly gated:

- **Vehicle picker (Step 1 / vehicle modal):** `customerVehicleSchema`
  (validation.ts:433-436) restricts `size_class` to the 3-value subset.
  A customer cannot enter exotic / classic at vehicle-creation time
  through the public surface.
- **Service step nested size picker (scope, vehicle-size-aware tier):**
  `step-service-select.tsx:1082-1083`:
  ```ts
  {CUSTOMER_SELF_SERVICE_SIZE_CLASSES.map((sc) => {
    if (!isVehicleSizeOffered(current, sc)) return null;
  ```
  Iterates the 3-value subset — clean. ✅
- **"From X" floor on scope tier cards** (`step-service-select.tsx:1247-1252`):
  iterates the 3-value subset — clean. ✅
- **`vehicle_size`-model top-level picker** (`step-service-select.tsx:995-1021`):
  iterates `tiers.map(...)` directly from `service.pricing`, which is
  unfiltered. **LATENT LEAK** — but:
  - Reaches the `tiers.map` branch only when `hideSizePicker === false`,
    i.e. when the customer's vehicle size is not yet known.
  - Backed by `bookingVehicleSchema` enum validation at submit, so an
    exotic / classic selection would be rejected server-side with a
    validation error.
  - Still surfaces an exotic / classic BUTTON to the customer in that
    transient state, which is the leak the operator constraint
    forbids.
  - **Recommended fix:** filter the row-pattern tier list to
    `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` before `.map`. ~3-line patch.

### B4 — Pricing-display logic (`service-pricing-display.tsx`)

This is the public service-detail page's pricing-table renderer (mounted
at `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:132`).
It dispatches on `service.pricing_model`:

- **`VehicleSizePricing`** (`service-pricing-display.tsx:54-113`):
  ```ts
  const tiers = service.pricing
    ? [...service.pricing].sort((a, b) => a.display_order - b.display_order)
    : [];
  ...
  {tiers.map((tier) => (
    <th key={tier.id} ...>{tier.tier_label ?? tier.tier_name}</th>
  ))}
  ...
  {tiers.map((tier) => { ... })}
  ```
  **Iterates ALL `service_pricing` rows.** If an admin has added exotic
  / classic prices via the Edit page, those become additional columns
  (label + price) in the public price table. This is the catalog-page
  visual leak.

- **`ScopeTierRow`** (`service-pricing-display.tsx:158-199`): for
  `is_vehicle_size_aware` scope tiers, renders **only** three explicit
  rows — Sedan, Truck/SUV, SUV/Van — by hand. Exotic / classic are
  silently omitted. Clean (by-construction filter, but a fragile one —
  if a future size is added to the customer set, this would also need
  hand-editing).

- **`SpecialtyPricing`** (`service-pricing-display.tsx:258-322`):
  iterates all tiers. `specialty` pricing model is for non-automobile
  vehicle types (boats, RVs, motorcycles, aircraft), so it doesn't carry
  `exotic` / `classic` tier names by convention. Not a leak surface
  today, but iterates without filter — flagged for consistency.

- **`FlatPricing`** / **`PerUnitPricing`** / **`CustomPricing`**: no
  tier-row iteration. Clean.

**Data layer.** `src/lib/data/services.ts:117, 159` projects
`service_pricing(*)` with no per-row filter, so the consumer
(ServicePricingDisplay) receives ALL rows including exotic / classic.
Filtering at the data layer is the alternative chokepoint to filtering
at the display layer; see C1.

### B5 — SEO concerns (highest stakes)

**`src/lib/seo/json-ld.ts:160-178`** (`buildServiceOffers` for tiered
pricing):

```ts
if (pricingRows.length > 0) {
  const prices = pricingRows.map((p) => p.price).filter((p) => p > 0);
  if (prices.length === 1) {
    return {
      '@type': 'Offer',
      price: prices[0],
      priceCurrency: 'USD',
    };
  }
  if (prices.length > 1) {
    return {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      priceCurrency: 'USD',
      offerCount: prices.length,
    };
  }
}
```

This is the structured-data block injected into the service detail page
by `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:97`
(`<JsonLd data={generateServiceSchema(service, category, ...)} />`).
**Google parses this for rich results and the Knowledge Graph.**

**Specific leak:**
- `highPrice = Math.max(...prices)` — if exotic ($400+) exists, Google
  sees and may surface the exotic ceiling.
- `offerCount = prices.length` — reveals 5 tiers exist when customers
  only see 3.
- `lowPrice` is usually the sedan and is fine.

**Severity: HIGH.** This is the indexable, machine-readable surface.
Even if the visual leak in B4 is patched, this is what Google's crawler
sees. **Fix this first.**

**Sitemap (`src/app/sitemap.xml/route.ts:127-139`):** one URL per
service — no per-size variant URLs. Clean. ✅

**OpenGraph image (B1 row #4 — `opengraph-image.tsx:32`):**
```ts
const prices = (service.service_pricing ?? []).map((p) => p.price).filter((p) => p > 0);
if (prices.length > 0) {
  return `Starting from ${formatCurrency(Math.min(...prices))}`;
}
```
Uses `Math.min`. Exotic / classic are typically MORE expensive, so the
floor remains the sedan price in practice — no observable leak in the
rendered image. But the iteration is unfiltered as a matter of principle,
and an adversarial sale scenario (operator runs a one-day exotic-only
sale that prices exotic below sedan) would invert the floor.
Inconsistent with the catalog `ServiceCard`'s engine-routed floor — fix
for parity even though severity is low.

**Twitter / Facebook Open Graph metadata** (the `openGraph` and
`twitter` blocks in `generateMetadata` at
`/services/[categorySlug]/[serviceSlug]/page.tsx` — flows through
`generateServiceMetadata` in `src/lib/seo/metadata.ts`): does NOT
include pricing in titles or descriptions, just the service name and
description. Not a leak. ✅

### B6 — Quote / receipt / pay customer-facing links

This is a **distinct UX question**, not a catalog leak. When a customer
receives a personalized link (`/quote/[token]` or `/receipt/[token]` or
`/pay/[token]`) for a transaction priced as exotic or classic (because
their actual vehicle IS exotic / classic — staff-quoted, legitimate),
the per-line tier label is rendered via `renderTierToken`
(`src/lib/quotes/tier-display.ts:64-91`):

```ts
// :90
return item.tier_label || titleCase(item.tier_name);
```

So a quote line with `tier_name='exotic'`, `tier_label='Exotic'` renders
**"Exotic"** to the customer on these surfaces:
- `src/app/(public)/quote/[token]/page.tsx:286-294`
- `src/app/(public)/receipt/[token]/page.tsx:238-252`
- `src/app/(public)/pay/[token]/page.tsx:298-310`

**This is not a leak of others' pricing** — it's the customer seeing the
tier their OWN vehicle was priced at, on a personalized link tied to
their transaction. The operator constraint ("MUST NOT show exotic or
classic pricing or references to customers") is unambiguous about
catalog browse paths; this per-customer surface is the genuine
question.

**Two coherent operator stances:**
- **A — Never show "Exotic"/"Classic" to customers, anywhere.** Mask to
  a generic label like "Custom" or "Your Vehicle" or simply suppress
  the tier sub-line. Implementation: extend `renderTierToken` with a
  `customerFacing` flag that returns null (or a configured generic
  label) when `tier_name ∈ {exotic, classic}`. Slight loss of
  transparency on the customer's own quote ("the customer can't see why
  their truck-class quote is priced differently from a sedan-class
  quote"), but enforces brand boundary uniformly.
- **B — Show the tier on personalized links only.** Customer with an
  exotic Lamborghini sees "Exotic" on their quote (it applies to
  their specific vehicle); strangers browsing the catalog never see the
  label. Status quo + the catalog leaks fixed.

The audit takes no stance — surface for operator decision.

**Adjacent thread:** the prerequisite-PIN dialogs and the `tier_label`
in JOIN'd metadata (Issue 41's D45 unified rendering) all flow through
`renderTierToken`. Whichever decision the operator makes propagates
through a single helper.

### B7 — Fix recommendation (chokepoint strategy)

**The infrastructure exists.** `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` is
the established source of truth (§B2). The fix is to route the three
non-adopting public surfaces through it. Estimated total: ~30 lines
across 3-4 files.

**Recommended order (highest stakes first):**

1. **`src/lib/seo/json-ld.ts:160-178`** (`buildServiceOffers`). Filter
   `pricingRows` to those whose `tier_name ∈
   CUSTOMER_SELF_SERVICE_SIZE_CLASSES` for the `vehicle_size` model.
   Also handle the column-pattern (`is_vehicle_size_aware` single row
   with per-size columns): synthesize per-customer-size offers from the
   3 columns. ~10-15 lines. **SEO-critical.**

2. **`src/components/public/service-pricing-display.tsx:54-113`**
   (`VehicleSizePricing`). Filter `tiers` to `tier_name ∈
   CUSTOMER_SELF_SERVICE_SIZE_CLASSES` before sorting / mapping.
   ~3-line patch. For the column-pattern (size-aware single row),
   `VehicleSizePricing` doesn't render that shape today — `ScopePricing`'s
   `ScopeTierRow` does, and it's already hand-restricted to 3 rows.
   No further change needed for scope.

3. **`src/components/booking/step-service-select.tsx:995-1021`**
   (`vehicle_size` top-level picker). Same pattern: filter `tiers`
   before `.map`. ~3-line patch. Defense-in-depth even though the API
   already rejects.

4. **`src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx:32`**
   (OG image `Math.min`). Filter the price list to customer-facing
   tiers for `vehicle_size` model before `Math.min`. ~5 lines (need to
   handle column-pattern too if any current service uses it for
   `vehicle_size`). Lowest stakes; bundle with the others.

**Single chokepoint feasibility.** Two candidate chokepoints exist; the
trade-off is between "centralized but coarse" and "per-surface but
explicit":

- **(a) Centralize in the data layer** (`src/lib/data/services.ts:117, 159`):
  filter `service_pricing` rows server-side for any code path that
  reads on behalf of a public page. **Pro:** every public consumer
  becomes safe by default. **Con:** the same data layer feeds the
  customer's personalized quote/receipt link (where their exotic /
  classic line items legitimately appear under the B6-B stance) — would
  need a flag or duplicate functions, and any future
  unfiltered-tier consumer would silently break.
- **(b) Centralize in the engine** (`src/lib/services/picker-engine.ts`):
  add a `customerFacingOnly` flag to `selectPricingTierForVehicle` /
  `resolveServicePriceWithSale` callers. **Pro:** money math is already
  there. **Con:** display surfaces (B4 table render, JSON-LD field
  enumeration) aren't engine consumers — they iterate raw rows.

**Recommendation: per-surface filter using the existing constant, NOT
data-layer filter.** Rationale:
- The data layer feeds quotes / receipts / pay links (B6 surfaces) AND
  admin / POS — those legitimately need the full 5-row set. A blanket
  filter at the data layer would require duplicate functions.
- The 4 non-adopting surfaces are well-bounded and self-explanatory.
  Each adopt the constant with a 3-line patch.
- The constant's docblock and the `constants.test.ts` guard ensure
  meaning doesn't drift; future surfaces only need to import the
  constant and use it.

**Defensive snapshot test.** Add an integration / snapshot test that
fetches a `vehicle_size` service with exotic + classic populated and
asserts the rendered service-detail page (JSON-LD + table + OG image)
contains no "Exotic" or "Classic" strings and no exotic-priced numbers.
Mirror the existing `constants.test.ts` "strict subset" pattern.

---

## TARGET C — Structural concerns

### C1 — Single source of truth

**Already exists**: `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` in
`src/lib/utils/constants.ts:75-79`, added Session 30 with explicit
intent (lines 65-74).

**Recommendation:** do NOT add a new constant or a DB-layer flag. The
shape is right; the gap is adoption coverage. The audit identifies the
3-4 surfaces that need to import and filter through it. After those
land, the constant becomes the architectural chokepoint by simple
universality: every public surface filters through one identifier.

**One small constant-side improvement:** consider adding a
`CUSTOMER_FACING_TIER_NAMES = new Set([...CUSTOMER_SELF_SERVICE_SIZE_CLASSES])`
helper next to the readonly array. Saves callers from re-constructing a
Set in hot loops (JSON-LD, table render). ~2-line addition; pure
optimization. Not blocking.

### C2 — Test coverage to prevent regression

Existing coverage:
- `src/lib/utils/__tests__/constants.test.ts:16-34` pins the 3-value
  subset and the strict-subset relationship. Catches accidental
  promotion of exotic / classic to the public set.
- `src/app/api/book/__tests__/booking-combo.test.ts:93` asserts the
  booking flow respects `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`.

**Gap:** no per-surface regression test. A future contributor could
re-introduce an unfiltered iteration in `service-pricing-display.tsx`
or `json-ld.ts` and unit tests would not catch it.

**Recommendation — minimal viable safety net (the Track B structural-
guard pattern):**
- Add a snapshot / contract test that constructs a `vehicle_size`
  service fixture with all 5 tier rows populated (sedan / truck / van /
  exotic / classic), renders `<ServicePricingDisplay>` to a string,
  and asserts the output contains "Sedan" / "Truck" / "SUV" but
  contains NEITHER "Exotic" NOR "Classic".
- Add an equivalent JSON-LD test: call `generateServiceSchema` on the
  same fixture, assert the serialized JSON's `offers.highPrice` equals
  the highest of the 3 customer-facing prices (not the exotic price)
  and `offerCount === 3`.
- Add a booking-wizard test asserting `vehicle_size`-model top-level
  picker only shows 3 buttons even when the underlying service has 5
  rows.

These three tests (~80-120 lines total) would block any future
regression at PR time.

### C3 — Schema-layer guard

**Currently none.** `service_pricing.tier_name` is plain TEXT with no
CHECK constraint restricting values. Any tier name can be inserted.
The customer-facing boundary is application-layer-only (the constant
plus its adoption pattern).

**This is fine.** Adding a CHECK constraint at the DB layer would couple
the catalog visibility decision to schema migrations, which over-rotates
on a soft product rule. The operator can rename "exotic" tomorrow (per
admin category management) without a migration; same posture should
hold for the customer-visibility cut.

The cleanest hardening, if ever desired, would be a `customer_facing
boolean DEFAULT true` column on `service_pricing`, defaulted true,
explicitly set false for exotic / classic. Filter-by-column at the
public surface layer. But this duplicates information already encoded
in the constant for no functional gain — flagged for completeness; do
not implement.

---

## Severity ranking

| Rank | Finding | Surface | Why this rank |
|------|---------|---------|---------------|
| 1 | **B5 — JSON-LD `AggregateOffer.highPrice`** leaks exotic | `src/lib/seo/json-ld.ts:160-178` | Machine-readable, crawled by Google, hard to undo once indexed |
| 2 | **B4 — `VehicleSizePricing` table renders exotic / classic columns** | `src/components/public/service-pricing-display.tsx:54-113` | Direct visual leak on the highest-traffic public pages |
| 3 | **A — Admin Create form silently drops exotic / classic** | `src/app/admin/catalog/services/new/page.tsx:231-237` | Confusing UX (operator typed it, saw nothing wrong, data lost); creates dependence on Edit-after-Create workflow |
| 4 | **B5 — OG image min-floor unfiltered** | `src/app/(public)/services/[categorySlug]/[serviceSlug]/opengraph-image.tsx:32` | Cached / regenerated occasionally; not directly indexed but renders on every share preview |
| 5 | **B3 — Booking wizard vehicle_size picker iterates all tiers** | `src/components/booking/step-service-select.tsx:995-1021` | Latent — unreachable in normal flow because Zod schema rejects, but exists as a defensive gap |
| 6 | **B6 — Personalized quote / receipt / pay rendering of "Exotic"** | `src/lib/quotes/tier-display.ts:90` via 3 public token routes | Operator-decision, not a bug; ranks lowest because the path is gated to the customer the price applies to |

## Open questions for the operator

1. **B6 — Personalized-link tier label.** When a customer with an
   actually-exotic vehicle receives `/quote/[token]`, `/receipt/[token]`,
   or `/pay/[token]`, should the line-item tier render as **"Exotic"**
   (status quo — shows the customer the tier their vehicle was priced
   at) or as a **generic label / suppressed sub-line** ("Your Vehicle",
   "Custom", or nothing)? Affects `renderTierToken` and the 3 public
   token routes (`quote/[token]/page.tsx:286-294`,
   `receipt/[token]/page.tsx:238-252`, `pay/[token]/page.tsx:304`).
2. **A4 — Empty-price semantics for exotic / classic at Create.**
   Confirm: typing `0` (or leaving blank) means "no exotic / classic
   tier exists for this service." Matches Edit's predicate
   (`priceValue > 0`). Different intent (e.g., "exotic costs $0
   because of a comp") would need an explicit nullable-vs-zero
   distinction in BOTH pages.
3. **B5 — `AggregateOffer.offerCount` after the fix.** Once filtered,
   `offerCount` will be 3 for `vehicle_size` services with 5 rows
   (counting only customer-facing). Confirm this is the intent (not
   "show 5 to hint richness").
4. **C1 — Add `CUSTOMER_FACING_TIER_NAMES` Set helper?** Pure
   optimization next to the existing readonly array. Operator may
   prefer to keep the constant surface minimal.

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes; no SELECTs executed in this session (prior audit's
  Paint-Correction-Prep live data referenced from
  `POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md`).
- ✅ file:line citations throughout.
- ✅ Reuse-over-duplication observed: §B7 recommends per-surface
  adoption of the existing `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`
  constant, not a new constant or DB column.
- ✅ Worktree isolation off `origin/main` (`1599e1af`).
- ✅ B6 customer-facing-label intent surfaced as operator decision; not
  decided in the audit.
