# Service Catalog — Single Source of Truth

> **Project:** Auto Detail (Smart Detail Auto Spa & Supplies)
> **Last Updated:** 2026-02-01
> **Status:** Approved — Owner reviewed and confirmed 2026-02-01

---

## Table of Contents

1. [Vehicle Size Classifications](#vehicle-size-classifications)
2. [Pricing Models](#pricing-models)
3. [Service Categories & Complete Catalog](#service-categories--complete-catalog)
4. [Service Classifications](#service-classifications)
5. [Service Prerequisites](#service-prerequisites)
6. [Vehicle Compatibility Matrix](#vehicle-compatibility-matrix)
7. [Channel Availability](#channel-availability)
8. [Mobile Service Rules](#mobile-service-rules)
9. [Add-On Suggestion System](#add-on-suggestion-system)
10. [Combo Pricing Structure](#combo-pricing-structure)
11. [Data Model Reference](#data-model-reference)
12. [Public URL Structure & SEO](#public-url-structure--seo)

---

## Vehicle Size Classifications

Replaces Square's inconsistent S/M/L naming with clear, vehicle-based tiers.

| Tier | Label | Examples | Square Legacy Mapping |
|---|---|---|---|
| 1 | Sedan | Sedans, coupes, compact cars — Civic, Accord, Model 3, Camry, Mustang, Corolla, Mazda3 | Small, S, CAR, Vehicle Size - SMALL |
| 2 | Truck/SUV (2-Row) | SUVs, trucks, crossovers — RAV4, Explorer, F-150, Tahoe, Model Y, 4Runner, Tacoma | Medium, M, Vehicle Size - MEDIUM |
| 3 | SUV (3-Row) / Van | Full-size vans, 3-row SUVs, extended cab trucks — Suburban, Escalade, Sprinter, Odyssey, Sienna, Expedition | Large, L, Vehicle Size - LARGE |

**Rule:** Vehicle size is stored on the vehicle record. When a vehicle-size-priced service is added to a ticket, the system auto-selects the correct price tier based on the customer's vehicle. Staff can override if needed (e.g., a compact SUV priced as Sedan).

### Specialty Vehicle Types (Outside Standard Tiers)

These vehicles use their own pricing structures and are NOT classified into Sedan/Truck/SUV tiers.

| Type | Sizing Tiers |
|---|---|
| Motorcycle | Standard/Cruiser, Touring/Bagger |
| RV/Motorhome | Up to 24', 25-35', 36'+ |
| Boat | Up to 20', 21-26', 27-32'+ |
| Aircraft | 2-4 Seater, 6-8 Seater, Turboprop/Jet (Quote) |

---

## Pricing Models

Every service in the catalog uses one of these six pricing models. The model determines how the price is calculated and displayed at POS, booking, and voice agent.

| Model | How It Works | Example |
|---|---|---|
| `vehicle_size` | 3 price tiers based on Sedan / Truck-SUV / SUV-Van | Express Exterior Wash: $75 / $90 / $110 |
| `scope` | Named tiers representing scope of work | Hot Shampoo: Floor Mats $75, Per Row $125, Carpet+Mats $175, Complete $350 |
| `per_unit` | Base price multiplied by count | Scratch Repair: $150 x number of panels (1-4) |
| `specialty` | Size tiers specific to the vehicle type | Boat Interior: ≤20' $275, 21-26' $375, 27-32' $475 |
| `flat` | Single price regardless of vehicle | Headlight Restoration: $125/pair |
| `custom` | No preset price — requires inspection and manual quote | Flood Damage / Mold Extraction: $475+ starting, final price after inspection |

---

## Service Categories & Complete Catalog

### Category 1: Precision Express

Quick-turnaround services for customers who need their vehicle presentable fast.

#### 1. Express Exterior Wash

Premium foam wash with pH-balanced shampoo. Includes wheel and tire cleaning, window streak-free finish, and tire dressing.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $75 |
| Truck/SUV (2-Row) | $90 |
| SUV (3-Row) / Van | $110 |
| Duration | 45 minutes |
| Mobile Available | Yes |
| Classification | Primary (Standalone) |
| Tax | No (service) |

#### 2. Express Interior Clean

Complete vacuum of all surfaces including trunk. All interior surfaces wiped, cup holders and vents detailed, glass cleaned inside and out.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $85 |
| Truck/SUV (2-Row) | $100 |
| SUV (3-Row) / Van | $120 |
| Duration | 45 minutes |
| Mobile Available | Yes |
| Classification | Primary (Standalone) |
| Tax | No (service) |

---

### Category 2: Signature Detail

The flagship comprehensive service.

#### 3. Signature Complete Detail

Full interior and exterior rejuvenation. Interior: deep vacuum, all surfaces cleaned and conditioned, vents and crevices detailed, interior dressing. Exterior: spot-free RO water pre-rinse, hand wash, door jambs, wheel wells, premium liquid wax hand-applied.

**Interior includes:** Vacuum (seats, mats, carpets), all seating surfaces (leather or cloth), dashboard, door panels/pockets, cupholders, center console, glovebox, air vents — all cleaned and dressed.

**Exterior includes:** Spot-free water pre-rinse, pH-neutral foam hand wash, liquid wax, door jambs, gas cap/charge port, spot-free rinse, wheels/rims cleaned, tires and trim dressed, tire pressure check.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $210 |
| Truck/SUV (2-Row) | $260 |
| SUV (3-Row) / Van | $320 |
| Duration | 3-4 hours |
| Mobile Available | Yes |
| Classification | Primary (Standalone) |
| Tax | No (service) |

---

### Category 3: Paint Correction & Restoration

Professional machine polishing to restore paint finish. These services require controlled environment — not available as mobile service.

#### 4. Single-Stage Polish

50-70% defect removal. Removes light swirls and minor scratches, restores gloss and clarity. Your paint shows swirls, scratches, and oxidation that make your vehicle look years older than it is — single-stage machine polishing removes imperfections and restores the deep gloss and clarity your paint had when new.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $450 |
| Truck/SUV (2-Row) | $525 |
| SUV (3-Row) / Van | $600 |
| Duration | 4-5 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Tax | No (service) |

#### 5. 3-Stage Paint Correction

85-95% defect removal. Comprehensive correction process for dramatic transformation that removes up to 95% of defects. **Includes Paint Decontamination & Protection** (clay bar + protection) as part of the service.

**What's Included (Full Process):**
1. **Preparation** — Pre-rinse, premium foam wash, and hand wash
2. **Decontamination** — Clay bar and iron decontamination to remove embedded contaminants
3. **Surface Protection** — Precise taping of all plastic, vinyl, and glass surfaces
4. **Multi-Stage Machine Correction** — Progressive machine polishing stages to achieve desired paint perfection
5. **Finishing** — Final panel wipe, trim rejuvenation, crystal-clear glass cleaning
6. **Protection** — Application of Formula SiO2 protection to lock in results

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $650 |
| Truck/SUV (2-Row) | $750 |
| SUV (3-Row) / Van | $975 |
| Duration | 6-7 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Tax | No (service) |
| Bundled Add-On | Paint Decontamination & Protection (included) |

---

### Category 4: Ceramic Coatings

Professional-grade ceramic coating application. Creates an invisible shield against UV, contaminants, and environmental damage. Requires controlled environment — not available as mobile service.

**Prerequisite:** Paint Correction (Single-Stage or 3-Stage) required before any ceramic coating application. System enforces this.

#### 6. 1-Year Ceramic Shield

Entry-level ceramic protection. Repels contaminants, maintains gloss, and eases maintenance.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $425 |
| Truck/SUV (2-Row) | $525 |
| SUV (3-Row) / Van | $625 |
| Duration | 2-3 hours (coating only) |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Prerequisite | Paint Correction (any) |
| Tax | No (service) |

#### 7. 3-Year Ceramic Shield

Mid-tier ceramic protection with extended durability.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $625 |
| Truck/SUV (2-Row) | $750 |
| SUV (3-Row) / Van | $875 |
| Duration | 2-3 hours (coating only) |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Prerequisite | Paint Correction (any) |
| Tax | No (service) |

#### 8. 5-Year Ceramic Shield Plus

Premium ceramic protection with maximum longevity and enhanced hydrophobic properties.

| Field | Value |
|---|---|
| Pricing Model | `vehicle_size` |
| Sedan | $825 |
| Truck/SUV (2-Row) | $950 |
| SUV (3-Row) / Van | $1,075 |
| Duration | 3-4 hours (coating only) |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Prerequisite | Paint Correction (any) |
| Tax | No (service) |

---

### Category 5: Exterior Enhancements

Add-on and standalone services focused on exterior surfaces.

#### 9. Paint Decontamination & Protection

Clay bar treatment followed by ceramic wax application. Removes embedded contaminants, restores smooth glass-like finish with water-repelling protection.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $175 |
| Duration | 1-2 hours |
| Mobile Available | Yes (when paired with mobile-eligible primary) |
| Classification | Add-On Only |
| Tax | No (service) |
| Note | Included in 3-Stage Paint Correction — do not double-charge |

#### 10. Booster Detail for Ceramic Coated Vehicles

Decontaminates and rejuvenates existing ceramic coating performance. Restores hydrophobic properties and self-cleaning effect. Available to any vehicle with existing ceramic coating — whether applied by Smart Detail or elsewhere.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $125 |
| Duration | 1-2 hours |
| Mobile Available | Yes |
| Classification | Primary (Standalone) |
| Condition | Vehicle must have existing ceramic coating (any source) |
| Tax | No (service) |

#### 11. Headlight Restoration

Restores cloudy/yellowed headlights to crystal clarity. Improves visibility up to 70%.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $125 per pair |
| Duration | 45 minutes |
| Mobile Available | Yes |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 12. Engine Bay Detail

Steam clean and dress all engine bay components. Removes grease, dust, and grime for showroom-worthy appearance.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $175 |
| Duration | 1 hour |
| Mobile Available | No |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 13. Undercarriage Steam Cleaning

Removes road salt, mud, and grime from undercarriage. Prevents rust and corrosion.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $125 |
| Duration | 45 minutes |
| Mobile Available | No |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 14. Scratch Repair

Professional repair process for parking lot scratches and surface damage. Per-panel pricing.

| Field | Value |
|---|---|
| Pricing Model | `per_unit` |
| Price Per Panel | $150 |
| Maximum Panels | 4 per appointment |
| Price Range | $150 (1 panel) — $600 (4 panels) |
| Duration | 1-2 hours per panel |
| Mobile Available | No |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 15. Trim Restoration

Restores faded black trim and plastics to deep black finish. Creates sharp contrast across the vehicle.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $125 |
| Duration | 1 hour |
| Mobile Available | Yes |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 16. Water Spot Removal

Specialized treatment to dissolve mineral deposits from glass and paint surfaces.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $125 |
| Duration | 1 hour |
| Mobile Available | Yes |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

---

### Category 6: Interior Enhancements

Add-on services focused on interior surfaces. Most require a primary service; Hot Shampoo Extraction and Organic Stain Treatment can also be booked standalone.

#### 17. Pet Hair/Dander Removal

Specialized extraction of pet hair from carpets, upholstery, and hard-to-reach areas using dedicated tools.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $75 |
| Duration | 30-45 minutes |
| Mobile Available | Yes (when paired with mobile-eligible primary) |
| Classification | Add-On Only |
| Tax | No (service) |

#### 18. Leather Conditioning

Professional-grade conditioning treatment that restores suppleness and adds UV protection to leather surfaces.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $75 |
| Duration | 30 minutes |
| Mobile Available | Yes (when paired with mobile-eligible primary) |
| Classification | Add-On Only |
| Tax | No (service) |

#### 19. Excessive Cleaning Fee

Surcharge for vehicles with condition exceeding normal dirt levels — layers of grime, food debris, insects, contamination, or neglect. Ensures adequate time for proper results.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $75 |
| Duration | Additional 30-60 minutes |
| Mobile Available | N/A (surcharge, not standalone) |
| Classification | Add-On Only |
| Staff-Assessed | Yes — not customer-selectable at booking |
| Tax | No (service) |

#### 20. Ozone Odor Treatment

Eliminates lingering odors (smoke, food, pets) at the molecular level. Not a masking scent — genuine odor elimination.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $75 |
| Duration | 1-2 hours (machine run time) |
| Mobile Available | No (requires enclosed space) |
| Classification | Add-On Only |
| Tax | No (service) |

#### 21. Hot Shampoo Extraction

Hot water extraction process with enzyme pre-soak and citrus detergent. Lifts deep stains and embedded grime from fabric surfaces.

| Field | Value |
|---|---|
| Pricing Model | `scope` (Tiers 1-3 flat, Tier 4 by vehicle size) |
| Tier 1 — Floor Mats Only | $75 (flat) |
| Tier 2 — Per Seat Row | $125 (flat) |
| Tier 3 — Carpet & Mats Package | $175 (flat) |
| Tier 4 — Complete Interior: Sedan | $300 |
| Tier 4 — Complete Interior: Truck/SUV (2-Row) | $350 |
| Tier 4 — Complete Interior: SUV (3-Row) / Van | $450 |
| Duration | 1-4 hours depending on scope |
| Mobile Available | No (requires extraction equipment + drying) |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

**Scope tier breakdown:**
- **Floor Mats Only:** All floor mats scrubbed and deep cleaned
- **Per Seat Row:** Individual row of seating extracted (front or rear)
- **Carpet & Mats Package:** All carpeting plus all floor mats
- **Complete Interior Extraction:** All seat rows + all carpets + all mats — full interior (2 rows for Sedan/Truck-SUV, 3 rows for SUV 3-Row/Van)

**Built-in combo savings on Complete Interior:**

| Vehicle | Individual Price | Complete Price | Savings |
|---|---|---|---|
| Sedan | $425 (2 rows + carpet & mats) | $300 | **Save $125** |
| Truck/SUV (2-Row) | $425 (2 rows + carpet & mats) | $350 | **Save $75** |
| SUV (3-Row) / Van | $550 (3 rows + carpet & mats) | $450 | **Save $100** |

#### 22. Organic Stain Treatment

Enzyme treatment for organic stains from pets, children, or illness. Breaks down organic matter to eliminate both stain and odor.

| Field | Value |
|---|---|
| Pricing Model | `flat` |
| Price | $175 |
| Duration | 1-2 hours |
| Mobile Available | No |
| Classification | Both (Standalone or Add-On) |
| Tax | No (service) |

#### 23. Flood Damage / Mold Extraction

Comprehensive extraction and treatment for water-damaged vehicles. Eliminates mold spores, removes moisture, and sanitizes affected areas.

| Field | Value |
|---|---|
| Pricing Model | `custom` |
| Starting Price | $475+ |
| Final Price | Determined after inspection |
| Duration | Varies (inspection required) |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Online Booking | **No** — POS or Phone only, inspection required |
| Tax | No (service) |

---

### Category 7: Specialty Vehicles

Services designed for non-standard vehicles with vehicle-type-specific sizing and pricing. Motorcycle, Boat, and Aircraft services are comprehensive — no standard add-ons offered. RV services support standard add-ons (see [Vehicle Compatibility Matrix](#vehicle-compatibility-matrix)).

#### 24. Complete Motorcycle Detail

Comprehensive motorcycle service: hand wash, bug and tar removal, chrome polishing, engine brightening, and 1-year ceramic wax protection. This service covers everything — no separate add-ons for motorcycles.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| Standard/Cruiser | $275 |
| Touring/Bagger | $350 |
| Duration | 3 hours |
| Mobile Available | Yes |
| Classification | Primary (Standalone) |
| Add-Ons | None — service is comprehensive |
| Tax | No (service) |

#### 25. RV Interior Clean

Deep clean of cab, living spaces, kitchen, bathroom, and storage compartments using RV-safe products.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| Up to 24' | $350 |
| 25-35' | $450 |
| 36'+ | $550 |
| Duration | 3-4 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | Interior add-ons available (see compatibility matrix) |
| Tax | No (service) |

#### 26. RV Exterior Wash

Roof cleaning, oxidation removal, full body wash, tire and wheel detailing, sealant application.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| Up to 24' | $650 |
| 25-35' | $850 |
| 36'+ | $1,050+ |
| Duration | 6-12 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | Select exterior add-ons available (see compatibility matrix) |
| Tax | No (service) |

#### 27. Boat Interior Clean

Deep clean all surfaces, condition vinyl and leather with marine-grade UV protection, bilge cleaning, odor elimination. Comprehensive service — no separate add-ons.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| Up to 20' | $275 |
| 21-26' | $375 |
| 27-32' | $475 |
| Duration | 2-3 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | None — service is comprehensive |
| Tax | No (service) |

#### 28. Boat Exterior Wash

Hull washing and waxing, deck deep cleaning, brightwork polishing, vinyl protection. Comprehensive service — no separate add-ons.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| Up to 20' | $550 |
| 21-26' | $750 |
| 27-32' | $950+ |
| Duration | 5-7 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | None — service is comprehensive |
| Tax | No (service) |

#### 29. Aircraft Interior Clean

Comprehensive interior service using only aviation-approved products. Includes brightwork polishing and full interior detailing. Comprehensive service — no separate add-ons.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| 2-4 Seater | $850 |
| 6-8 Seater | $1,250 |
| Turboprop/Jet | Quote |
| Duration | 6-8 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | None — service is comprehensive |
| Special Requirement | Aviation-approved products only |
| Tax | No (service) |

#### 30. Aircraft Exterior Wash

Fuselage, wings, and belly wash using aviation-approved products. Contamination removal, brightwork polish, aerospace sealant application. Comprehensive service — no separate add-ons.

| Field | Value |
|---|---|
| Pricing Model | `specialty` |
| 2-4 Seater | $575 |
| 6-8 Seater | $975 |
| Turboprop/Jet | Quote |
| Duration | 3-6 hours |
| Mobile Available | No |
| Classification | Primary (Standalone) |
| Add-Ons | None — service is comprehensive |
| Special Requirement | Aviation-approved products only |
| Tax | No (service) |

---

## Service Classifications

Determines how each service can be sold.

| Classification | Definition |
|---|---|
| **Primary (Standalone)** | Can be booked as the main appointment service. Appears as a top-level booking option. |
| **Add-On Only** | Must be purchased with a Primary service on the same ticket. Cannot be booked independently. |
| **Both** | Can be booked standalone OR added to another service. Appears in both primary catalog and add-on suggestions. |

### Classification Summary

| # | Service | Classification | Notes |
|---|---------|---------------|-------|
| 1 | Express Exterior Wash | Primary | — |
| 2 | Express Interior Clean | Primary | — |
| 3 | Signature Complete Detail | Primary | — |
| 4 | Single-Stage Polish | Primary | — |
| 5 | 3-Stage Paint Correction | Primary | Includes Paint Decon & Protection |
| 6 | 1-Year Ceramic Shield | Primary | Requires Paint Correction |
| 7 | 3-Year Ceramic Shield | Primary | Requires Paint Correction |
| 8 | 5-Year Ceramic Shield Plus | Primary | Requires Paint Correction |
| 9 | Paint Decontamination & Protection | Add-On Only | Included in 3-Stage — don't double-charge |
| 10 | Booster Detail (Ceramic) | Primary | Vehicle must have existing ceramic coating (any source) |
| 11 | Headlight Restoration | Both | Per pair |
| 12 | Engine Bay Detail | Both | — |
| 13 | Undercarriage Steam Cleaning | Both | — |
| 14 | Scratch Repair | Both | Per panel (1-4) |
| 15 | Trim Restoration | Both | — |
| 16 | Water Spot Removal | Both | — |
| 17 | Pet Hair/Dander Removal | Add-On Only | — |
| 18 | Leather Conditioning | Add-On Only | — |
| 19 | Excessive Cleaning Fee | Add-On Only | Staff-assessed surcharge, not customer-selectable |
| 20 | Ozone Odor Treatment | Add-On Only | — |
| 21 | Hot Shampoo Extraction | Both | 4 scope tiers, substantial enough for standalone |
| 22 | Organic Stain Treatment | Both | Substantial enough for standalone |
| 23 | Flood Damage / Mold Extraction | Primary | POS/Phone only — inspection required |
| 24 | Motorcycle Detail | Primary | Comprehensive — no add-ons |
| 25 | RV Interior Clean | Primary | Standard add-ons available |
| 26 | RV Exterior Wash | Primary | Select add-ons available |
| 27 | Boat Interior Clean | Primary | Comprehensive — no add-ons |
| 28 | Boat Exterior Wash | Primary | Comprehensive — no add-ons |
| 29 | Aircraft Interior Clean | Primary | Comprehensive — no add-ons, aviation products |
| 30 | Aircraft Exterior Wash | Primary | Comprehensive — no add-ons, aviation products |

---

## Service Prerequisites

Some services require another service to be completed first.

| Service | Prerequisite | Enforcement |
|---|---|---|
| 1-Year Ceramic Shield | Paint Correction (Single-Stage or 3-Stage) | **Required** — must be on same ticket OR verified in vehicle's service history |
| 3-Year Ceramic Shield | Paint Correction (Single-Stage or 3-Stage) | **Required** — same rule |
| 5-Year Ceramic Shield Plus | Paint Correction (Single-Stage or 3-Stage) | **Required** — same rule |
| Booster Detail | Existing ceramic coating on vehicle | **Recommended** — system shows warning if no coating history found, but allows proceeding (coating may have been done elsewhere) |

### Enforcement Logic

1. When a Ceramic Shield is added to a ticket:
   - System checks if Paint Correction is already on the ticket → **OK, proceed**
   - System checks if vehicle has Paint Correction in service history within last 30 days → **OK, proceed**
   - Neither found → **Block with prompt:** "Paint Correction is required before ceramic coating. Add Single-Stage Polish or 3-Stage Paint Correction to this ticket?"
2. Admin can override prerequisite enforcement per-ticket (for edge cases like customer had paint correction done elsewhere)
3. Online booking: Ceramic Shield options only appear if Paint Correction is also selected in the same booking, or system prompts to add it
4. When Booster Detail is selected and no ceramic coating is in vehicle history:
   - System shows **soft warning:** "No ceramic coating found in this vehicle's history. Proceed anyway?"
   - Staff can confirm (customer had coating done elsewhere) — no block, just acknowledgment

---

## Vehicle Compatibility Matrix

Defines which services can be performed on which vehicle types.

**Legend:** Yes = Available | No = Not applicable

### Standard Vehicle Services (Sedan, Truck/SUV, SUV/Van)

All 30 services are available on standard vehicles (services #1-23). Specialty vehicle services (#24-30) are not applicable to standard vehicles.

### Specialty Vehicle Add-On Rules

| Rule | Motorcycle | Boat | Aircraft | RV |
|---|---|---|---|---|
| **Add-ons allowed?** | No | No | No | Yes |
| **Rationale** | Motorcycle Detail is comprehensive | Boat services are comprehensive | Aircraft services are comprehensive | RV has vehicle + living space — add-ons enhance both |

### RV-Compatible Add-Ons

The following standard add-ons can be added to RV Interior or RV Exterior service tickets:

**With RV Interior Clean:**

| # | Add-On | Available |
|---|--------|:-:|
| 17 | Pet Hair/Dander Removal | Yes |
| 18 | Leather Conditioning | Yes |
| 19 | Excessive Cleaning Fee | Yes |
| 20 | Ozone Odor Treatment | Yes |
| 21 | Hot Shampoo Extraction | Yes |
| 22 | Organic Stain Treatment | Yes |
| 23 | Flood Damage / Mold Extraction | Yes |

**With RV Exterior Wash:**

| # | Add-On | Available |
|---|--------|:-:|
| 11 | Headlight Restoration | Yes |
| 15 | Trim Restoration | Yes |
| 16 | Water Spot Removal | Yes |
| 19 | Excessive Cleaning Fee | Yes |

**Not available for RVs:** Paint Decontamination & Protection, Booster Detail, Engine Bay Detail, Undercarriage Steam Cleaning, Scratch Repair. These are designed for standard vehicle surfaces and do not apply to RV construction.

### Full Compatibility Matrix

| # | Service | Standard | Motorcycle | RV | Boat | Aircraft |
|---|---------|:-:|:-:|:-:|:-:|:-:|
| 1 | Express Exterior Wash | Yes | No | No | No | No |
| 2 | Express Interior Clean | Yes | No | No | No | No |
| 3 | Signature Complete Detail | Yes | No | No | No | No |
| 4 | Single-Stage Polish | Yes | No | No | No | No |
| 5 | 3-Stage Paint Correction | Yes | No | No | No | No |
| 6 | 1-Year Ceramic Shield | Yes | No | No | No | No |
| 7 | 3-Year Ceramic Shield | Yes | No | No | No | No |
| 8 | 5-Year Ceramic Shield Plus | Yes | No | No | No | No |
| 9 | Paint Decontamination & Protection | Yes | No | No | No | No |
| 10 | Booster Detail (Ceramic) | Yes | No | No | No | No |
| 11 | Headlight Restoration | Yes | No | Yes | No | No |
| 12 | Engine Bay Detail | Yes | No | No | No | No |
| 13 | Undercarriage Steam Cleaning | Yes | No | No | No | No |
| 14 | Scratch Repair | Yes | No | No | No | No |
| 15 | Trim Restoration | Yes | No | Yes | No | No |
| 16 | Water Spot Removal | Yes | No | Yes | No | No |
| 17 | Pet Hair/Dander Removal | Yes | No | Yes | No | No |
| 18 | Leather Conditioning | Yes | No | Yes | No | No |
| 19 | Excessive Cleaning Fee | Yes | No | Yes | No | No |
| 20 | Ozone Odor Treatment | Yes | No | Yes | No | No |
| 21 | Hot Shampoo Extraction | Yes | No | Yes | No | No |
| 22 | Organic Stain Treatment | Yes | No | Yes | No | No |
| 23 | Flood Damage / Mold Extraction | Yes | No | Yes | No | No |
| 24 | Motorcycle Detail | No | Yes | No | No | No |
| 25 | RV Interior Clean | No | No | Yes | No | No |
| 26 | RV Exterior Wash | No | No | Yes | No | No |
| 27 | Boat Interior Clean | No | No | No | Yes | No |
| 28 | Boat Exterior Wash | No | No | No | Yes | No |
| 29 | Aircraft Interior Clean | No | No | No | No | Yes |
| 30 | Aircraft Exterior Wash | No | No | No | No | Yes |

---

## Channel Availability

Defines where each service can be booked or purchased.

| Availability | Definition |
|---|---|
| **All Channels** | Online booking, POS, Phone (11 Labs), Customer Portal |
| **POS + Phone** | Not available for online self-service booking |
| **POS Only** | Staff-assessed, not customer-bookable |

| # | Service | Online Booking | POS | Phone (11 Labs) | Portal |
|---|---------|:-:|:-:|:-:|:-:|
| 1-8 | All Core Services | Yes | Yes | Yes | Yes |
| 9 | Paint Decontamination & Protection | Yes (as add-on) | Yes | Yes | Yes |
| 10 | Booster Detail | Yes | Yes | Yes | Yes |
| 11-16 | Exterior Enhancements (Headlight thru Water Spot) | Yes | Yes | Yes | Yes |
| 17-18 | Pet Hair, Leather Conditioning | Yes (as add-on) | Yes | Yes | Yes |
| 19 | Excessive Cleaning Fee | **No** | **Yes** | **No** | **No** |
| 20 | Ozone Odor Treatment | Yes (as add-on) | Yes | Yes | Yes |
| 21-22 | Hot Shampoo, Organic Stain | Yes | Yes | Yes | Yes |
| 23 | Flood Damage / Mold Extraction | **No** | **Yes** | **Yes** | **No** |
| 24-30 | All Specialty Vehicle Services | Yes | Yes | Yes | Yes |

**Rules:**
- **Add-On Only services** (9, 17, 18, 20) appear in online booking only after a primary service is selected — shown as suggested add-ons, not as standalone booking options
- Excessive Cleaning Fee is a staff-assessed surcharge — never appears as a bookable option on any channel
- Flood Damage / Mold Extraction requires in-person inspection — customer can call to discuss, staff creates a quote, but customer cannot self-book online
- Online booking for Ceramic Shields must include Paint Correction (prerequisite enforced)
- "Quote" pricing (Turboprop/Jet aircraft) channels to the quote system rather than direct booking

---

## Mobile Service Rules

Some services can be performed at the customer's location for an additional surcharge.

### Service Area & Zones

**Shop Address:** 2021 Lomita Blvd, Lomita, CA

| Zone | Distance from Shop | Surcharge | Status |
|---|---|---|---|
| Zone 1 | 0-5 miles | +$40 | Available |
| Zone 2 | 5-10 miles | +$80 | Available |
| Beyond 10 miles | 10+ miles | — | **Declined** |

**Zone rules:**
- Distance calculated from shop address to customer address
- Surcharge is per appointment (flat fee regardless of how many services on the ticket)
- Zone 2 surcharge is $80 total (not $40 + $40 stacked — single surcharge amount)
- Admin can adjust zone distances and surcharges in settings

### Scheduling

- Mobile appointments use the **same calendar** as in-shop appointments
- System blocks a **30-minute travel buffer** before and after each mobile appointment
- Example: Mobile appointment at 10am for a 45-min Express Wash blocks the calendar from 9:30am to 11:15am (30 min travel + 45 min service + 30 min return)
- Travel buffer duration is configurable in admin settings (default: 30 minutes each way)

### Mobile-Eligible Services

| # | Service | Mobile |
|---|---------|:------:|
| 1 | Express Exterior Wash | Yes |
| 2 | Express Interior Clean | Yes |
| 3 | Signature Complete Detail | Yes |
| 9 | Paint Decontamination & Protection | Yes (as add-on on mobile ticket) |
| 10 | Booster Detail (Ceramic) | Yes |
| 11 | Headlight Restoration | Yes |
| 15 | Trim Restoration | Yes |
| 16 | Water Spot Removal | Yes |
| 17 | Pet Hair/Dander Removal | Yes (as add-on on mobile ticket) |
| 18 | Leather Conditioning | Yes (as add-on on mobile ticket) |
| 24 | Motorcycle Detail | Yes |

### NOT Mobile-Eligible

| Services | Reason |
|---|---|
| Paint Correction (Single & 3-Stage) | Requires controlled environment, lighting, power |
| All Ceramic Shields (1/3/5-Year) | Requires dust-free controlled environment |
| Engine Bay Detail | Requires in-shop equipment |
| Undercarriage Steam Cleaning | Requires lift or ramp |
| Scratch Repair | Requires controlled environment |
| Ozone Odor Treatment | Requires enclosed treatment space |
| Hot Shampoo Extraction | Requires extraction equipment + drying facility |
| Organic Stain Treatment | Requires facility |
| Flood Damage / Mold Extraction | Requires facility |
| All RV Services | Customer brings RV to shop |
| All Boat Services | Service performed at marina/dock (separate logistics) |
| All Aircraft Services | Service performed at hangar/ramp (separate logistics) |

### Mobile Booking Rules

- Mobile surcharge is applied **once per appointment** — not per service
- Surcharge amount determined by zone ($40 for Zone 1, $80 for Zone 2)
- If ANY service on a mobile ticket is not mobile-eligible, the entire appointment must be in-shop
- Online booking: "Mobile Service" toggle during booking → customer enters address → system calculates zone → only mobile-eligible services shown → surcharge displayed
- POS: "Mobile" flag on ticket → enter customer address → zone auto-calculated → surcharge applied
- Phone (11 Labs): Voice agent asks for address → checks zone → quotes price with surcharge included

---

## Add-On Suggestion System

When a primary service is selected at POS, booking, or by the voice agent, the system automatically suggests relevant add-on services. Suggestions are configurable in admin.

### How It Works

1. Customer or staff selects a primary service
2. System queries the **suggestion map** for that primary service
3. Matching add-ons display as suggestion cards with:
   - Service name and brief description
   - Standard price
   - Combo price (if configured) with savings highlighted
   - One-tap add to ticket
4. Staff can dismiss suggestions or the customer can skip at booking
5. Admin can edit all suggestion rules: add/remove add-ons, change order, set combo prices, enable/disable

### Suggestion Map

Below defines which add-ons are suggested for each primary service. **Combo prices are TBD** — structure is established, specific discounts to be configured in admin.

#### Express Exterior Wash → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Paint Decontamination & Protection | $175 | TBD | Natural upgrade from basic wash |
| 2 | Headlight Restoration | $125 | TBD | While vehicle is being serviced |
| 3 | Trim Restoration | $125 | TBD | Complementary exterior work |
| 4 | Water Spot Removal | $125 | TBD | Common exterior issue |
| 5 | Engine Bay Detail | $175 | TBD | While hood is accessible |

#### Express Interior Clean → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Hot Shampoo - Floor Mats | $75 | TBD | Most common interior upgrade |
| 2 | Hot Shampoo - Complete Interior | $350 | TBD | Full extraction upsell |
| 3 | Pet Hair/Dander Removal | $75 | TBD | Common need with interior clean |
| 4 | Leather Conditioning | $75 | TBD | Protect after cleaning |
| 5 | Ozone Odor Treatment | $75 | TBD | Freshness upgrade |

#### Signature Complete Detail → Suggested Add-Ons

Since this is both interior and exterior, it gets suggestions from both sides.

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Hot Shampoo - Complete Interior | $350 | TBD | Top revenue upsell |
| 2 | Paint Decontamination & Protection | $175 | TBD | Protection upgrade |
| 3 | Engine Bay Detail | $175 | TBD | Complete the full detail |
| 4 | Headlight Restoration | $125 | TBD | While vehicle is in shop |
| 5 | Leather Conditioning | $75 | TBD | Protect leather after cleaning |
| 6 | Pet Hair/Dander Removal | $75 | TBD | Common need |
| 7 | Ozone Odor Treatment | $75 | TBD | Freshness upgrade |
| 8 | Trim Restoration | $125 | TBD | Exterior enhancement |

#### Single-Stage Polish → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Ceramic Shield (upsell to Primary) | varies | — | Natural next step after correction |
| 2 | Headlight Restoration | $125 | TBD | Restore all exterior clarity |
| 3 | Trim Restoration | $125 | TBD | Complete exterior refresh |
| 4 | Water Spot Removal | $125 | TBD | Address all paint issues together |

#### 3-Stage Paint Correction → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Ceramic Shield (upsell to Primary) | varies | — | Protect the corrected paint |
| 2 | Headlight Restoration | $125 | TBD | Restore all exterior clarity |
| 3 | Trim Restoration | $125 | TBD | Complete exterior refresh |

Note: Paint Decontamination & Protection is already **included** in 3-Stage — system must NOT suggest it as an add-on.

#### Ceramic Shield (any tier) → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Headlight Restoration | $125 | TBD | While vehicle is in shop for extended work |
| 2 | Trim Restoration | $125 | TBD | Complete the exterior transformation |
| 3 | Engine Bay Detail | $175 | TBD | Thorough top-to-bottom service |

Note: Paint Correction is a **prerequisite**, not a suggestion — handled by prerequisite enforcement.

#### Booster Detail → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Headlight Restoration | $125 | TBD | Maintain all exterior clarity |
| 2 | Trim Restoration | $125 | TBD | Complete exterior refresh |

#### RV Interior Clean → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Hot Shampoo Extraction | $75-$350 | TBD | Deep clean RV upholstery |
| 2 | Pet Hair/Dander Removal | $75 | TBD | Common need for RV travelers with pets |
| 3 | Ozone Odor Treatment | $75 | TBD | Eliminate RV odors |
| 4 | Leather Conditioning | $75 | TBD | Protect RV leather seating |
| 5 | Organic Stain Treatment | $175 | TBD | Address organic stains in living space |

#### RV Exterior Wash → Suggested Add-Ons

| Priority | Add-On | Standard Price | Combo Price | Rationale |
|:--------:|--------|---------------|-------------|-----------|
| 1 | Headlight Restoration | $125 | TBD | RV headlights prone to yellowing |
| 2 | Trim Restoration | $125 | TBD | Restore exterior trim |
| 3 | Water Spot Removal | $125 | TBD | Common RV exterior issue |

#### Motorcycle, Boat & Aircraft Services → No Add-Ons

These specialty services are comprehensive. The system does NOT suggest add-ons for:
- Complete Motorcycle Detail
- Boat Interior Clean
- Boat Exterior Wash
- Aircraft Interior Clean
- Aircraft Exterior Wash

### Admin Configuration

The suggestion system is fully configurable in the admin panel:

- **Add/remove** add-on suggestions per primary service
- **Reorder** suggestion priority (drag-and-drop)
- **Set combo prices** per primary+add-on pair
- **Toggle auto-suggest** on/off per suggestion (auto-suggest = shown without staff action)
- **Activate/deactivate** individual suggestions
- **Bulk edit** combo pricing (e.g., apply 15% discount across all combos)
- **Seasonal overrides** — different suggestions or combo pricing for specific date ranges

---

## Combo Pricing Structure

### How Combo Pricing Works

1. **Standard price** = the normal standalone price of the add-on
2. **Combo price** = reduced price when purchased with a specific primary service on the same ticket
3. **Savings** = Standard - Combo, displayed to customer as "Save $X"
4. **Price locking** = Combo price at time of ticket creation is locked, immune to future price changes

### Rules

- Combo price is optional per suggestion — if not set, add-on is suggested at standard price
- Combo discount applies only when the specific primary + add-on pair are on the same ticket
- If multiple primary services are on one ticket, the **best available combo price** applies (customer gets the lowest price)
- Combo prices are stored in `service_addon_suggestions.combo_price` — admin editable
- POS displays: ~~$175~~ **$150** (Save $25) when combo pricing is active
- Online booking displays the same savings information
- Receipt shows: service name, combo price paid, and savings amount

### Combo Price Template (To Be Completed)

All combo prices below are **TBD** — to be set by owner in admin panel after launch. The platform will support these combinations from day one with configurable pricing.

| Primary Service | Add-On | Standard | Combo | Savings |
|---|---|---|---|---|
| Express Interior | Hot Shampoo (Floor Mats) | $75 | $__ | $__ |
| Express Interior | Hot Shampoo (Complete) | $350 | $__ | $__ |
| Express Interior | Pet Hair Removal | $75 | $__ | $__ |
| Express Interior | Leather Conditioning | $75 | $__ | $__ |
| Express Interior | Ozone Treatment | $75 | $__ | $__ |
| Signature Complete | Hot Shampoo (Complete) | $350 | $__ | $__ |
| Signature Complete | Paint Decon & Protection | $175 | $__ | $__ |
| Signature Complete | Engine Bay Detail | $175 | $__ | $__ |
| Signature Complete | Headlight Restoration | $125 | $__ | $__ |
| Signature Complete | Leather Conditioning | $75 | $__ | $__ |
| Single-Stage Polish | Headlight Restoration | $125 | $__ | $__ |
| Single-Stage Polish | Trim Restoration | $125 | $__ | $__ |
| 3-Stage Correction | Headlight Restoration | $125 | $__ | $__ |
| 3-Stage Correction | Trim Restoration | $125 | $__ | $__ |
| Ceramic Shield (any) | Headlight Restoration | $125 | $__ | $__ |
| Ceramic Shield (any) | Trim Restoration | $125 | $__ | $__ |
| Express Exterior | Paint Decon & Protection | $175 | $__ | $__ |
| Express Exterior | Headlight Restoration | $125 | $__ | $__ |
| Express Exterior | Trim Restoration | $125 | $__ | $__ |
| Express Exterior | Engine Bay Detail | $175 | $__ | $__ |

---

## Data Model Reference

### New Tables for Add-On System

#### `service_addon_suggestions`

Links primary services to their suggested add-ons with optional combo pricing.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `primary_service_id` | UUID → services | The primary service being booked |
| `addon_service_id` | UUID → services | The suggested add-on service |
| `combo_price` | DECIMAL(10,2) | Reduced price when paired (nullable — null = standard price) |
| `combo_savings_label` | VARCHAR | Display text, e.g., "Save $25" (auto-calculated if null) |
| `display_order` | INTEGER | Sort priority (lower = higher priority) |
| `auto_suggest` | BOOLEAN | Show automatically (true) or only when staff browses add-ons (false) |
| `active` | BOOLEAN | Enable/disable this suggestion |
| `seasonal_start` | DATE | Optional: seasonal override start date |
| `seasonal_end` | DATE | Optional: seasonal override end date |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

**Unique constraint:** (`primary_service_id`, `addon_service_id`) — no duplicate suggestions.

#### `service_prerequisites`

Enforces service dependencies (e.g., Ceramic Shield requires Paint Correction).

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `service_id` | UUID → services | The service being booked |
| `prerequisite_service_id` | UUID → services | The required service |
| `enforcement` | ENUM | `required_same_ticket`, `required_history`, `recommended` |
| `history_window_days` | INTEGER | For `required_history`: how recent the prerequisite must be (e.g., 30 days) |
| `override_allowed` | BOOLEAN | Can admin/staff override this prerequisite? |
| `active` | BOOLEAN | Enable/disable |
| `created_at` | TIMESTAMPTZ | — |

**Enforcement types:**
- `required_same_ticket` — Prerequisite must be on the same ticket
- `required_history` — Prerequisite must exist in vehicle's service history within `history_window_days`
- `recommended` — System shows warning but allows proceeding

#### Updates to Existing `services` Table

| New Column | Type | Description |
|---|---|---|
| `classification` | ENUM | `primary`, `addon_only`, `both` |
| `mobile_eligible` | BOOLEAN | Can this service be performed mobile? |
| `online_bookable` | BOOLEAN | Can customers book this online? |
| `staff_assessed` | BOOLEAN | Only staff can add to ticket (e.g., Excessive Cleaning Fee) |
| `vehicle_compatibility` | JSONB | Array of compatible vehicle types: `["standard", "motorcycle", "rv", "boat", "aircraft"]` |
| `special_requirements` | TEXT | E.g., "Aviation-approved products only" |

#### `mobile_zones` (New Table)

Defines mobile service zones and surcharges.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `zone_name` | VARCHAR | Display name (e.g., "Zone 1", "Zone 2") |
| `min_distance_miles` | DECIMAL | Zone start distance |
| `max_distance_miles` | DECIMAL | Zone end distance |
| `surcharge` | DECIMAL(10,2) | Surcharge amount for this zone |
| `available` | BOOLEAN | Is this zone accepting bookings? |
| `created_at` | TIMESTAMPTZ | — |

**Default data:**

| Zone | Min | Max | Surcharge | Available |
|---|---|---|---|---|
| Zone 1 | 0 | 5 | $40.00 | Yes |
| Zone 2 | 5 | 10 | $80.00 | Yes |

**Shop origin:** 2021 Lomita Blvd, Lomita, CA (stored in business settings)

#### Updates to Existing `appointments` / `transactions` Table

| New Column | Type | Description |
|---|---|---|
| `is_mobile` | BOOLEAN | Was this a mobile service appointment? |
| `mobile_zone_id` | UUID → mobile_zones | Which zone, for surcharge lookup |
| `mobile_surcharge_applied` | DECIMAL(10,2) | Surcharge amount charged (price-locked) |
| `mobile_address` | TEXT | Customer's service location address |
| `travel_buffer_minutes` | INTEGER | Travel buffer applied (for calendar blocking) |

---

## Public URL Structure & SEO

Every service and product category has a `slug` column, and every service and product has a `slug` column (added in migration #38). Slugs are auto-generated from names: lowercase, hyphens, no special characters.

### URL Pattern

| Entity | URL | Example |
|---|---|---|
| Service category | `/services/[categorySlug]` | `/services/ceramic-coatings` |
| Individual service | `/services/[categorySlug]/[serviceSlug]` | `/services/ceramic-coatings/5-year-ceramic-shield` |
| Product category | `/products/[categorySlug]` | `/products/wash-supplies` |
| Individual product | `/products/[categorySlug]/[productSlug]` | `/products/wash-supplies/ph-neutral-car-soap` |

### Sitemap Priority

| Page Type | Priority | Changefreq |
|---|---|---|
| Homepage | 1.0 | weekly |
| Services index | 0.9 | weekly |
| Service categories | 0.8 | weekly |
| **Ceramic coatings services** | **1.0** | **weekly** |
| Other individual services | 0.7 | monthly |
| Products index | 0.8 | weekly |
| Product categories | 0.7 | monthly |
| Individual products | 0.6 | monthly |

### Pricing Display on Public Pages

The `service-pricing-display` component renders pricing differently for each of the 6 pricing models:

| Pricing Model | Public Display |
|---|---|
| `vehicle_size` | 3-column table: Sedan / Truck-SUV / SUV-Van |
| `scope` | Named tiers table; vehicle-size-aware tiers expand into sub-rows |
| `per_unit` | "Starting at $X per [unit]" with max units note |
| `specialty` | Named tiers table |
| `flat` | Single prominent price |
| `custom` | "Starting at $X — Contact for quote" |

### Dynamic Business Info on Public Pages

Public pages pull business name, phone number, and address from the `business_settings` table at render time via `getBusinessInfo()` (in `src/lib/data/business.ts`). This function is wrapped with `React.cache()` so multiple Server Components in the same render pass share a single DB query. JSON-LD structured data (LocalBusiness, Service schemas) also uses the live DB values for telephone and PostalAddress fields.

### RLS Policies for Public Access

Anonymous visitors (Supabase `anon` role) can read active services, categories, pricing, products, business settings, and addon suggestions. All anon policies filter on `is_active = true` where applicable. Added in migration #38.

---

## Open Items

| # | Item | Status |
|---|------|--------|
| 1 | Combo prices for all primary+add-on pairs | TBD — owner to configure in admin post-launch |

---

## Decisions Log

All classification and compatibility decisions confirmed by owner on 2026-02-01:

| Decision | Answer |
|---|---|
| Pet Hair, Leather Conditioning, Ozone — standalone? | **No** — Add-On Only |
| Hot Shampoo Extraction, Organic Stain — standalone? | **Yes** — Both (standalone or add-on) |
| Paint Decontamination & Protection — standalone? | **No** — Add-On Only |
| Booster Detail — standalone? | **Yes** — Primary, available to any vehicle with ceramic coating (any source) |
| Motorcycle add-ons? | **None** — Motorcycle Detail is comprehensive |
| Boat add-ons? | **None** — Boat services are comprehensive |
| Aircraft add-ons? | **None** — Aircraft services are comprehensive |
| RV add-ons? | **Yes** — All interior add-ons + Headlight, Trim, Water Spot exterior |
| Excessive Cleaning Fee on RVs? | **Yes** — applies to RV tickets |
| Mobile surcharge model? | **Once per appointment** (not per service) |
| Mobile service area? | 5 miles = $40, 5-10 miles = $80, 10+ miles = decline |
| Mobile scheduling? | Same calendar as in-shop, 30-min travel buffer each way |

---

## Document Version History

| Version | Date | Changes |
|---|---|---|
| v1 | 2026-02-01 | Initial catalog from Service_Add_On_Pricing.docx review |
| v2 | 2026-02-01 | Applied owner decisions: classifications, compatibility matrix, mobile zones, specialty vehicle add-on rules, decisions log |
| v3 | 2026-02-01 | Owner full review completed. Engine Bay Detail changed to in-shop only (mobile count 12→11). Hot Shampoo Complete Interior Extraction updated to vehicle-size pricing ($300/$350/$450). Removed marine/aviation product lists from open items. Document status: Approved. |
| v4 | 2026-02-01 | Added Public URL Structure & SEO section: slug system, URL patterns, sitemap priorities (ceramic coatings = 1.0), pricing display per model, anon RLS policies. |
| v5 | 2026-02-01 | Added Dynamic Business Info subsection: public pages fetch name/phone/address from `business_settings` table via `React.cache()`-deduped `getBusinessInfo()`. |
