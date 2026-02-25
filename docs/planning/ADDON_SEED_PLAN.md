# Add-On Suggestion Seed Plan — Owner Review (v2)

> Max 2-3 add-ons per primary service. All combo prices use ~20% off, rounded to clean numbers.
> This replaces ALL existing suggestion rows in `service_addon_suggestions`.

---

## Combo Price Strategy

| Add-On Standard Price | Combo Price | Savings | Discount |
|----------------------:|------------:|--------:|---------:|
| $75                   | $60         | $15     | 20%      |
| $125                  | $100        | $25     | 20%      |
| $175                  | $140        | $35     | 20%      |
| Hot Shampoo (scope)   | Standard    | —       | N/A — tier pricing already includes built-in bundle at Tier 4 |

---

## Combo Savings Display Requirement

When a customer adds an add-on at combo price, the savings must appear as a **separate line item** in the totals breakdown — visible in the booking flow, POS ticket, and printed/digital receipt.

**Booking flow (sticky footer):**
```
Signature Complete Detail (Sedan)    $210
Engine Bay Detail                    $175
Combo Savings                        -$35
                              ───────────
Total                                $350
```

**POS ticket:**
```
Signature Complete Detail (Sedan)    $210.00
Engine Bay Detail                    $175.00
  Combo Savings                      -$35.00
                              ─────────────
Subtotal                             $350.00
```

**Receipt:**
```
Signature Complete Detail (Sedan)   $210.00
Engine Bay Detail                   $175.00
  Combo Savings                     -$35.00
────────────────────────────────────────────
Subtotal                            $350.00
Tax                                   $0.00
Total                               $350.00
```

**Rules:**
- Add-on always shows at its STANDARD price as the line item
- Combo Savings shows as a separate negative line directly below the add-on
- If multiple add-ons have combo pricing, each gets its own savings line
- If an add-on has no combo price (e.g., Hot Shampoo), no savings line appears
- Receipt and POS must store both the standard price and the combo savings for audit trail

**Multiple add-ons example:**
```
Signature Complete Detail (Sedan)    $210.00
Engine Bay Detail                    $175.00
  Combo Savings                      -$35.00
Headlight Restoration                $125.00
  Combo Savings                      -$25.00
                              ─────────────
Subtotal                             $350.00
```

---

## Seed Plan

### Express Exterior Wash — Sedan $75 / Truck $90 / SUV $110

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Visible improvement customer can see immediately. Most common exterior upsell |
| 2 | Trim Restoration        | $125     | $100  | $25  | Faded trim is noticeable after a fresh wash — easy sell |

---

### Express Interior Clean — Sedan $85 / Truck $100 / SUV $120

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Hot Shampoo Extraction  | $75–$450 | —     | —    | Most natural interior upgrade. Customer picks tier (floor mats, per row, complete). Tier 4 already has built-in bundle savings |
| 2 | Pet Hair/Dander Removal | $75      | $60   | $15  | Pet owners know they need this. Self-selecting audience |
| 3 | Leather Conditioning    | $75      | $60   | $15  | Natural follow-up: "clean it then protect it" |

---

### Signature Complete Detail — Sedan $210 / Truck $260 / SUV $320

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Engine Bay Detail       | $175     | $140  | $35  | "Complete the full detail" — hood is already open during exterior work |
| 2 | Paint Decon & Protection| $175     | $140  | $35  | Protection upgrade after thorough wash/detail |
| 3 | Headlight Restoration   | $125     | $100  | $25  | Vehicle is already in shop for hours, quick add |

---

### Single-Stage Polish — Sedan $450 / Truck $550 / SUV $650

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | "Restore all exterior clarity" — headlights look dull next to corrected paint |
| 2 | Trim Restoration        | $125     | $100  | $25  | Faded trim stands out more after paint correction |

*Note: Ceramic Shield upsell is handled via prerequisite system, not add-on suggestions*

---

### 3-Stage Paint Correction — Sedan $650 / Truck $800 / SUV $950

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Same logic as Single-Stage — clarity everywhere |
| 2 | Trim Restoration        | $125     | $100  | $25  | Complete the exterior transformation |

*Note: Paint Decon & Protection is INCLUDED in 3-Stage — must NOT be suggested*

---

### 1-Year Ceramic Shield — Sedan $425 / Truck $525 / SUV $625

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Vehicle in shop for extended time anyway |
| 2 | Engine Bay Detail       | $175     | $140  | $35  | "Top-to-bottom service while we have it" |
| 3 | Trim Restoration        | $125     | $100  | $25  | Complete the exterior transformation |

---

### 3-Year Ceramic Shield — Sedan $625 / Truck $750 / SUV $875

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Same as 1-Year |
| 2 | Engine Bay Detail       | $175     | $140  | $35  | Same as 1-Year |
| 3 | Trim Restoration        | $125     | $100  | $25  | Same as 1-Year |

---

### 5-Year Ceramic Shield Plus — Sedan $825 / Truck $950 / SUV $1,075

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Same as 1-Year |
| 2 | Engine Bay Detail       | $175     | $140  | $35  | Same as 1-Year |
| 3 | Trim Restoration        | $125     | $100  | $25  | Same as 1-Year |

---

### Booster Detail (Ceramic Maintenance) — $125 flat

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | Maintain all exterior clarity |
| 2 | Trim Restoration        | $125     | $100  | $25  | Exterior refresh while servicing coating |

---

### RV Interior Clean — 24' $350 / 35' $450 / 36'+ $550

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Hot Shampoo Extraction  | $75–$450 | —     | —    | Deep clean RV upholstery. Customer picks tier. Tier 4 has built-in savings |
| 2 | Pet Hair/Dander Removal | $75      | $60   | $15  | RV travelers with pets — self-selecting |
| 3 | Ozone Odor Treatment    | $75      | $60   | $15  | Eliminate closed-space RV odors |

---

### RV Exterior Wash — 24' $650 / 35' $850 / 36'+ $1,050

| # | Add-On                  | Standard | Combo | Save | Rationale |
|:-:|-------------------------|:--------:|:-----:|:----:|-----------|
| 1 | Headlight Restoration   | $125     | $100  | $25  | RV headlights prone to yellowing |
| 2 | Trim Restoration        | $125     | $100  | $25  | Restore faded exterior trim |

---

## No Add-Ons (by design)

| Service                  | Reason |
|--------------------------|--------|
| Complete Motorcycle Detail | Comprehensive service — nothing to add |
| Boat Interior Clean      | Comprehensive — marine-specific products |
| Boat Exterior Wash       | Comprehensive — marine-specific products |
| Aircraft Interior Clean  | Comprehensive — aviation-specific products |
| Aircraft Exterior Wash   | Comprehensive — aviation-specific products |
| Flood Damage / Mold      | POS/phone only — custom quoted per inspection |

---

## Hot Shampoo Extraction — How It Appears in Booking

Hot Shampoo uses scope pricing (4 tiers). When shown as an add-on suggestion, the customer picks their tier inline. No combo discount — the tiers already have built-in value at higher levels.

**Booking flow display:**
```
┌──────────────────────────────────────────┐
│  🧼 Hot Shampoo Extraction               │
│  Deep steam extraction for upholstery    │
│                                          │
│  ○ Floor Mats Only         $75           │
│  ○ Per Seat Row            $125          │
│  ○ Carpet & Mats Package   $175          │
│  ○ Complete Interior        from $300    │
│                                          │
│                          [ Add ✓ ]       │
└──────────────────────────────────────────┘
```

If customer selects Tier 4 (Complete Interior), vehicle size pricing applies:
- Sedan: $300 (save $125 vs buying rows + carpet individually)
- Truck/SUV: $350 (save $75)
- SUV/Van: $450 (save $100)

These built-in tier savings are already documented in SERVICE_CATALOG.md.

---

## Totals

| Metric | Count |
|--------|------:|
| Primary services with add-ons | 11 |
| Primary services without add-ons | 6 |
| Total suggestion rows to seed | 30 |
| Rows with combo pricing | 26 |
| Rows without combo pricing (Hot Shampoo) | 4 (2 primaries × 1 suggestion + 2 extra... actually just 2) |

### Add-On Frequency (how often each appears)

| Add-On                  | Times Suggested | Has Combo Price | Classification |
|-------------------------|:---------------:|:---------------:|:--------------:|
| Headlight Restoration   | 9               | Yes ($100)      | Both           |
| Trim Restoration        | 8               | Yes ($100)      | Both           |
| Engine Bay Detail       | 3               | Yes ($140)      | Both           |
| Hot Shampoo Extraction  | 2               | No (tier pricing)| Both          |
| Pet Hair/Dander Removal | 2               | Yes ($60)       | Add-On Only    |
| Ozone Odor Treatment    | 2               | Yes ($60)       | Add-On Only    |
| Leather Conditioning    | 1               | Yes ($60)       | Add-On Only    |
| Paint Decon & Protection| 1               | Yes ($140)      | Add-On Only    |

---

## Implementation Notes

### Seed Migration
- Clear all existing rows: `DELETE FROM service_addon_suggestions;`
- Insert 30 rows with correct service UUIDs, combo_price values, display_order (1/2/3), and auto_suggest = true
- Hot Shampoo rows: combo_price = NULL (standard tier pricing applies)

### Combo Savings Line Item — Implementation Scope
This is a cross-cutting change touching booking flow, POS, and receipts:

**Booking flow:**
- Sticky footer shows each add-on at standard price with "Combo Savings -$X" line below
- Total reflects the discounted amount
- Booking submission must send both `standard_price` and `combo_savings` per add-on

**POS:**
- When staff adds a suggested add-on with combo pricing, the ticket shows standard price + savings line
- `transaction_items` records the standard `unit_price`
- Combo savings stored on the transaction (new field or in discount_amount breakdown)

**Receipt:**
- Receipt template renders the savings line between the add-on and subtotal
- Uses existing receipt template system — add combo savings rendering

**Database consideration:**
- `appointment_services` and `transaction_items` may need a `combo_savings` column to track the discount separately from coupon/loyalty discounts
- Alternatively, store in the existing `discount_amount` field with a `discount_type` indicator
