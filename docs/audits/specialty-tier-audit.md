# Specialty Tier Classification Audit

> **Date:** 2026-04-17
> **Session:** 26 — Vehicle Classification Specialty Tier Audit
> **Status:** Complete — All phases implemented

**Storage decision (confirmed by owner):** Both exotic and classic detection lists are stored as TypeScript constants in `vehicle-categories.ts`, NOT in a DB table or admin UI. Rationale: stable domain taxonomy that changes a few times per year at most. Every admin-UI knob is attack surface for accidental misconfiguration. Promotion to DB-backed table is a 1-day refactor if needed later.

---

## 1.1 — Classifier Path

### File: `src/lib/utils/vehicle-categories.ts`

The classifier function `resolveVehicleClassification()` uses a **5-layer approach**:

1. **Layer 1 — Category resolution:** Queries `vehicle_makes` table by make name to determine `vehicle_category` (automobile/motorcycle/rv/boat/aircraft). For dual-category makes (e.g., Honda = automobile + motorcycle), uses `disambiguateCategory()` with model keyword matching.

2. **Layer 2+3 — Base classification:**
   - **Automobiles:** Sets `vehicle_type: 'standard'`, infers `size_class` from `MODEL_SIZE_HINTS` (sedan/truck_suv_2row/suv_3row_van), sets `specialty_tier: null`.
   - **Non-automobiles:** Sets `specialty_tier` to a default tier (e.g., `standard_cruiser` for motorcycles), `size_class: null`.

3. **Layer 4 — Exotic detection:** Checks `EXOTIC_MAKES` (24 makes) and `EXOTIC_MAKE_MODELS` (specific models from standard makes). Sets `is_exotic: true` and `requires_custom_quote: true`.

4. **Layer 5 — Classic detection:** Checks year (`<= currentYear - 25`, i.e., `<= 2001`) OR model keyword match against `CLASSIC_MODEL_KEYWORDS` (55 entries). Sets `is_classic: true` and `requires_custom_quote: true`.

### Return shape of `resolveVehicleClassification()`:

```typescript
interface VehicleClassification {
  vehicle_category: VehicleCategory;    // ✅ Persisted
  vehicle_type: string;                  // ✅ Persisted
  size_class: string | null;             // ✅ Persisted
  specialty_tier: string | null;         // ✅ Persisted (but always null for automobiles)
  seat_rows: number;                     // ❌ NOT persisted (derived at read time)
  is_exotic: boolean;                    // ❌ NOT PERSISTED — THE BUG
  is_classic: boolean;                   // ❌ NOT PERSISTED — THE BUG
  requires_custom_quote: boolean;        // ❌ NOT persisted (derived)
  needs_year_confirmation: boolean;      // ❌ NOT persisted (derived)
}
```

### Exotic detection — current coverage:

**Full-make exotic (all models):** Ferrari, Lamborghini, McLaren, Bugatti, Pagani, Koenigsegg, Rimac, Hennessey, SSC, Saleen, Noble, Spyker, W Motors, Czinger, De Tomaso, Hispano Suiza, Pininfarina, Aston Martin, Bentley, Rolls-Royce, Lotus, Duesenberg, Packard (24 makes)

**Missing full-make exotics:** Maybach (standalone brand — pre-merger), Maserati (partially — only specific models like MC20/MC12/GranTurismo Trofeo trigger exotic, but ALL Maseratis should arguably be exotic for detailing purposes)

**Specific model exotic detection:** Porsche (918/959/Carrera GT/911 GT3/GT2/Turbo S), Dodge (Viper), Ford (GT only), Chevrolet (Corvette Z06/ZR1/E-Ray), Nissan (GT-R), Acura (NSX), Lexus (LFA), BMW (i8/M8), Mercedes (AMG GT/AMG One/SLS/SLR), Audi (R8), Maserati (MC20/MC12/GranTurismo Trofeo), Toyota (2000GT), Jaguar (XJ220)

**Missing specific model exotics:**
- Porsche: 911 Turbo (non-S), Taycan Turbo S, Panamera Turbo S
- Mercedes-AMG: Black Series models, S63/S65 AMG, GT 4-Door, C63 AMG Black
- BMW M: M3, M4, M5, XM (currently only i8, M8)
- Audi RS: RS6, RS7, RS e-tron GT (currently only R8)
- Tesla: Model S Plaid, Roadster
- Dodge: SRT Hellcat, Demon (currently only Viper)
- Chevrolet: Corvette Stingray (debatable — base C8 is $65K+)
- DeLorean: DMC-12 (listed in CLASSIC_MODEL_KEYWORDS but not in EXOTIC — and DeLorean isn't in EXOTIC_MAKES)
- Lucid: Air Sapphire

### Classic detection — current logic:

```typescript
const CLASSIC_YEAR_THRESHOLD = new Date().getFullYear() - 25; // 2001 in 2026
```

**Rule:** Any vehicle with `year <= 2001` is classified as classic. This is the standard 25-year rolling threshold used by most US states for antique/classic registration.

**Problem:** This is a blanket year-only check — a 2001 Honda Civic gets `is_classic: true` just like a 1967 Camaro SS. The model keyword list (`CLASSIC_MODEL_KEYWORDS`) catches specific collectible models regardless of year, but the year-based detection has no make/model gating.

**Classic + Exotic coexistence:** Both layers run independently. A 1972 Ferrari Dino 246 gets both `is_exotic: true` (Ferrari is in EXOTIC_MAKES) AND `is_classic: true` (year 1972 <= 2001). Both flags are set on the return object. This is correct behavior.

---

## 1.2 — Write Path

### Primary write path: `findOrCreateVehicle()` in `src/lib/utils/vehicle-helpers.ts`

This is the centralized vehicle creation function. It:
1. Calls `resolveVehicleClassification()` to get full classification
2. Maps `classification.specialty_tier` → DB `specialty_tier` column ✅
3. Maps `classification.vehicle_category` → DB `vehicle_category` column ✅
4. Maps `classification.vehicle_type` → DB `vehicle_type` column ✅
5. Maps `classification.size_class` → DB `size_class` column ✅
6. **Does NOT map `classification.is_exotic`** → No DB column exists ❌
7. **Does NOT map `classification.is_classic`** → No DB column exists ❌

**Caller-override support:** Accepts `vehicle_category`, `vehicle_type`, `size_class`, `specialty_tier` as optional params. Caller values take priority over classifier output.

### All callers of `findOrCreateVehicle()`:

| Caller | File | Notes |
|--------|------|-------|
| Booking API | `src/app/api/book/route.ts` | Passes vehicle_category, vehicle_type, size_class, specialty_tier from booking form |
| Voice agent appointments | `src/app/api/voice-agent/appointments/route.ts` | Creates vehicle during voice booking |
| Twilio inbound SMS | `src/app/api/webhooks/twilio/inbound/route.ts` | AI messaging creates vehicle from SMS |
| Voice agent quotes | `src/app/api/voice-agent/quotes/route.ts` | Creates vehicle during voice quote |
| Voice agent send-quote-sms | `src/app/api/voice-agent/send-quote-sms/route.ts` | Creates vehicle for SMS quote |
| Voice post-call service | `src/lib/services/voice-post-call.ts` | Post-call vehicle creation |

### Direct insert paths (bypass `findOrCreateVehicle()`):

| Path | File | Notes |
|------|------|-------|
| Customer portal | `src/app/api/customer/vehicles/route.ts` POST | Inserts directly with caller-provided fields — no classifier call |
| POS vehicle create | `src/app/api/pos/customers/[id]/vehicles/route.ts` POST | Inserts directly — no classifier call |
| POS vehicle update | `src/app/api/pos/customers/[id]/vehicles/route.ts` PATCH | Updates directly |
| Square import | `scripts/import-square-data.mjs` | Migration script — no classifier |
| Migration route | `src/app/api/migration/vehicles/route.ts` | Migration script — no classifier |

### Root cause of the `specialty_tier: null` bug:

**The `specialty_tier` column in the DB is designed for NON-automobile categories only** (motorcycle → `standard_cruiser`/`touring_bagger`, rv → `rv_up_to_24`/etc.). The CHECK constraint on the column only allows these specific tier keys. There is no 'exotic' or 'classic' value in the constraint.

**The classifier correctly detects exotic/classic** and returns `is_exotic: true` / `is_classic: true`, but:
1. These flags are **not persisted** because the `vehicles` table has **no `is_exotic` or `is_classic` columns**
2. The `specialty_tier` field is **not designed for exotic/classic** — it's for sizing sub-tiers within non-automobile categories
3. Every downstream consumer that needs exotic/classic status would need to re-run the classifier (and currently none do)

**This means:** A Ferrari 488 is classified as `vehicle_category: 'automobile'`, `vehicle_type: 'standard'`, `size_class: 'sedan'`, `specialty_tier: null` — identical to a Toyota Camry in the database.

---

## 1.3 — Pricing Path

### How pricing currently works (NO exotic/classic awareness):

The pricing engine operates on **three axes** for automobiles:
- `pricing_model` on the `services` table: `flat`, `vehicle_size`, `scope`, `specialty`, `per_unit`, `custom`
- `service_pricing` rows: Each service has pricing tiers with `tier_name` values
- `VehicleSizeClass`: `sedan` / `truck_suv_2row` / `suv_3row_van`

For non-automobiles, pricing uses `specialty_tier` (e.g., `standard_cruiser`) matched to `service_pricing.tier_name`.

### Pricing surfaces audited:

| Surface | File | Reads specialty_tier? | Exotic/classic aware? |
|---------|------|-----------------------|----------------------|
| POS ticket (add service) | `src/app/pos/utils/pricing.ts` | No — uses `VehicleSizeClass` only | **NO** |
| POS service picker | `src/app/pos/components/service-pricing-picker.tsx` | Yes — highlights matching tier for non-auto | **NO** |
| POS catalog browser | `src/app/pos/components/catalog-browser.tsx` | Yes — passes to picker | **NO** |
| POS quote builder | `src/app/pos/components/quotes/quote-builder.tsx` | Yes — passes to picker | **NO** |
| Booking flow | `src/app/api/book/route.ts` | Uses `size_class` for price validation | **NO** |
| Booking data | `src/lib/data/booking.ts` | Returns `service_pricing` tiers | **NO** |
| Voice agent classify | `src/app/api/voice-agent/vehicle-classify/route.ts` | Returns exotic/classic flags | **YES** — returns `requires_custom_quote` flag |
| Voice agent quotes | `src/app/api/voice-agent/quotes/route.ts` | Does not use specialty_tier at all | **NO** |
| Voice agent services | `src/app/api/voice-agent/services/route.ts` | Returns pricing by tier_name | **NO** |
| Service resolver | `src/lib/services/service-resolver.ts` | Uses `sizeClass` (sedan/truck/van) | **NO** |

### What happens when `specialty_tier` is null for an exotic:

1. **POS:** Operator adds Ferrari 488 to ticket → vehicle `size_class` is `sedan` → priced at sedan rate. No warning that this is exotic.
2. **Booking:** Customer books online with Ferrari → priced at sedan rate. No `requires_custom_quote` flag checked.
3. **Voice agent:** The `/vehicle-classify` endpoint correctly returns `is_exotic: true` and `requires_custom_quote: true`, so the voice agent DOES tell the caller they need a custom quote. But the vehicle is still persisted as a regular sedan.
4. **Quotes:** Voice quotes use `resolvePrice()` which checks `sizeClass` — Ferrari gets sedan pricing.

### Database schema for pricing:

**`service_pricing` table** — `tier_name` values in practice:
- Automobile sizes: `sedan`, `truck_suv_2row`, `suv_3row_van`
- Specialty tiers: `standard_cruiser`, `touring_bagger`, `rv_up_to_24`, etc.
- Scope tiers: `floor_mats`, `complete_interior`, `per_row`, etc.
- **No exotic or classic tiers exist in any `service_pricing` row**

**`vehicles.specialty_tier` CHECK constraint** only allows:
`standard_cruiser`, `touring_bagger`, `rv_up_to_24`, `rv_25_35`, `rv_36_plus`, `boat_up_to_20`, `boat_21_26`, `boat_27_32`, `aircraft_2_4`, `aircraft_6_8`, `aircraft_turboprop`

**There is no exotic or classic pricing model implemented anywhere in the codebase.**

---

## 1.4 — Summary of Findings

### The Three-Part Bug:

1. **Classifier is correct** — `resolveVehicleClassification()` properly detects exotic/classic vehicles and returns `is_exotic`/`is_classic` flags.

2. **Persistence layer is broken** — The `vehicles` table has no columns for `is_exotic` or `is_classic`. The `specialty_tier` column is designed for non-automobile sizing tiers only (motorcycle/rv/boat/aircraft). The exotic/classic flags from the classifier are computed but never stored.

3. **Pricing engine is unaware** — No pricing surface reads or acts on exotic/classic status. All automobile pricing runs through `VehicleSizeClass` (sedan/truck_suv/van). Even if the flags were persisted, no code would use them for pricing today.

### Motorcycle keyword gaps confirmed:

The `MOTORCYCLE_MODEL_KEYWORDS` list (123 entries) is missing several Honda series:
- `cb` (generic prefix — CB500F, CB650R, CB300R, CB1000R would match via `cb500`/`cb650`/`cb300` but NOT just `cb`)
- `shadow`, `fury`, `valkyrie`, `xr`, `ctx` (Honda cruiser/adventure models)
- Yamaha: `vmax`, `bolt` (already present as Yamaha-specific), `star` (Yamaha Star series)
- Note: Many keywords ARE already present (e.g., `rebel`, `grom`, `africa twin`, `gold wing`, `trail`)

### DB_SCHEMA.md is incomplete:

The `vehicles` table in `docs/dev/DB_SCHEMA.md` is missing columns added by migration `20260224000001`:
- `vehicle_category` (TEXT, NOT NULL, DEFAULT 'automobile')
- `specialty_tier` (TEXT, nullable)
- `size_class` (TEXT — added by an earlier migration, also missing from schema doc)

---

## Recommended Pricing Model Options

Based on audit findings, here are options for how to handle exotic/classic pricing. **Decision deferred to follow-up session.**

### Option A: Boolean flags + `requires_custom_quote` (Recommended)

Add `is_exotic BOOLEAN DEFAULT false` and `is_classic BOOLEAN DEFAULT false` columns to `vehicles` table. Persist the classifier flags. Pricing surfaces check these flags and:
- For POS: Show a warning badge ("EXOTIC — custom quote required") but allow manual pricing override
- For booking: Block online booking for exotic/classic, redirect to phone/quote
- For voice: Already works — just persist the flags

**Pros:** Minimal schema change, no pricing model change needed, matches real-world business process (exotics always get custom quotes, never catalog pricing)
**Cons:** No automated exotic pricing — always manual

### Option B: Exotic/Classic as pricing tiers

Add `exotic_sedan`, `exotic_suv`, `classic_sedan`, `classic_suv` tier rows to `service_pricing` for each service. Set exotic multipliers per service.

**Pros:** Fully automated pricing for exotics
**Cons:** Doubles `service_pricing` rows, complex admin UI, unrealistic (exotic pricing varies wildly by specific vehicle)

### Option C: Percentage multiplier

Add `exotic_multiplier` and `classic_multiplier` columns to `services` table (e.g., 1.5x for exotic, 1.3x for classic). Applied on top of the vehicle_size price.

**Pros:** Simple, per-service control, minimal schema change
**Cons:** Uniform multiplier doesn't capture reality (a Pagani Huayra needs more care than a Lotus Elise, even though both are "exotic")

### Recommendation:

**Option A** is the right fit for this business. In auto detailing:
- Exotic/classic pricing is always negotiated per vehicle — there's no "menu price" for a Bugatti Chiron detail
- The business already treats these as custom quotes (the voice agent does this correctly)
- The value of the `is_exotic`/`is_classic` flags is: (a) preventing accidental standard pricing, (b) flagging records for review, (c) enabling booking flow gating

The pricing model decision should be confirmed before Phase 2 proceeds.
