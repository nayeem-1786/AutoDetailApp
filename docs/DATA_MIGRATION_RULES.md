# Data Migration Rules — Auto Detail

## Purpose

This document is the **single source of truth** for how inbound data from Square is handled during migration to the Auto Detail platform. All decisions regarding data cleaning, field mapping, classification, deduplication, and import logic are documented here.

---

## Source Data Overview

### Square Export Files

| File | Records | Description |
|---|---|---|
| `Customers/export-*.csv` | 1,670 | Full customer directory |
| `Products/ML665*_catalog-*.csv` | 433 | Product catalog (physical goods only) |
| `Transactions/transactions-*.csv` | 679 | Transaction-level data (payments, totals) |
| `Transactions/items-*.csv` | 1,415 | Line-item detail per transaction |
| `Transactions/item-sales-summary-*.csv` | 298 | Aggregated summary (validation only) |

### Which Transaction Files to Use

**PRIMARY: `items-*.csv`** — This is the most valuable file. It contains line-item detail with:
- Individual products and services per transaction
- `Itemization Type` field that distinguishes "Physical Good" from "Service"
- `Price Point Name` field that indicates vehicle size for services
- Category, SKU, employee, and customer linkage

**SECONDARY: `transactions-*.csv`** — Used for:
- Payment method (cash vs card vs split)
- Tips
- Fees
- Discount totals
- Deposit information

**VALIDATION ONLY: `item-sales-summary-*.csv`** — Aggregated totals per item. Used to verify import accuracy but NOT as a source for migration.

**IMPORT INSTRUCTION:** When pulling additional years of data from Square, download both the `items-*.csv` and `transactions-*.csv` files for each date range. The `item-sales-summary` is NOT needed — skip it.

### Files to Download Per Year

| Date Range | File 1 (PRIMARY) | File 2 (SECONDARY) | File 3 |
|---|---|---|---|
| 2020-01-01 to 2021-01-01 | items-2020-*.csv | transactions-2020-*.csv | SKIP summary |
| 2021-01-01 to 2022-01-01 | items-2021-*.csv | transactions-2021-*.csv | SKIP summary |
| 2022-01-01 to 2023-01-01 | items-2022-*.csv | transactions-2022-*.csv | SKIP summary |
| 2023-01-01 to 2024-01-01 | items-2023-*.csv | transactions-2023-*.csv | SKIP summary |
| 2024-01-01 to 2025-01-01 | items-2024-*.csv | transactions-2024-*.csv | SKIP summary |
| 2025-01-01 to 2026-01-01 | ALREADY HAVE | ALREADY HAVE | — |

**Status: ALL CSV FILES DOWNLOADED** — Owner confirmed all years (2020-2025) are available.

Place files in: `/Square_Data/Transactions/` — organized by year subfolders if preferred.

### Square API Access Token (Required for Image Migration)

A production API access token is needed to extract product images via the Catalog API (see Rule P-6).

**How to generate:**
1. Go to [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Select your application (or create one if none exists)
3. Go to Credentials → Production → Access Token
4. Copy and store securely — this token grants full API access
5. **Must be done before cancelling Square subscription** — API access is revoked on cancellation

### Why These Two Files

- **items file**: Line-item detail. Has `Itemization Type` (product vs service), `Price Point Name` (vehicle size), category, SKU, customer ID, employee. This is where we get service history and vehicle size inference.
- **transactions file**: Payment-level data. Has cash vs card, tips, fees, discounts, deposit info, card brand. This is where we get financial totals and payment method tracking.
- **Both files join on `Transaction ID`** to produce the complete transaction record.

---

## Data Quality Findings

### Customer Data Quality

| Metric | Count | Percentage |
|---|---|---|
| Total records | 1,670 | 100% |
| Has phone number | 1,367 | 81.9% |
| No phone number | 303 | 18.1% |
| Has email | 85 | 5.1% |
| No email | 1,585 | 94.9% |
| Has BOTH phone + email | 77 | 4.6% |
| Has NEITHER phone nor email | 295 | 17.7% |
| Phone only (no email) | 1,290 | 77.2% |
| Email only (no phone) | 8 | 0.5% |
| Has address | 156 | 9.3% |
| Has birthday | 1 | 0.1% |

**Key insight:** Customer base is overwhelmingly phone-number-driven. SMS is the primary communication channel. Only 5.1% have email addresses.

### Customer Activity Breakdown

| Bucket | Count | Percentage |
|---|---|---|
| 0 transactions (directory only) | 657 | 39.3% |
| 1 transaction (one-time) | 681 | 40.8% |
| 2–5 transactions | 259 | 15.5% |
| 6–10 transactions | 52 | 3.1% |
| 11+ transactions | 21 | 1.3% |

**Key insight:** 39.3% of customer records have never transacted — they are directory/contact entries only. Only 332 customers (19.9%) are repeat customers with 2+ transactions.

### Customer Creation Source

| Source | Count | Percentage |
|---|---|---|
| Directory | 708 | 42.4% |
| Instant Profile (via Payment) | 551 | 33.0% |
| Merge | 214 | 12.8% |
| Loyalty | 121 | 7.2% |
| Appointments | 66 | 4.0% |
| Marketing | 9 | 0.5% |
| Feedback | 1 | 0.1% |

### Email Subscription Status

| Status | Count |
|---|---|
| (blank/none) | 1,429 |
| unknown | 213 |
| unsubscribed | 21 |
| bounced | 7 |

**Zero confirmed active subscribers.** No one has an "active" or "subscribed" status. All marketing consent must be re-captured fresh in the new system.

### Product Data Quality

| Metric | Count | Percentage |
|---|---|---|
| Total products | 433 | 100% |
| Has cost price | 425 | 98.2% |
| Has vendor | 411 | 94.9% |
| Has SKU | 428 | 98.8% |
| Has stock qty > 0 | 365 | 84.3% |
| Has description | 140 | 32.3% |
| Archived | 0 | 0% |

Product data is in good shape. The main gap is descriptions (only 32.3% have one).

### Transaction Data Quality

| Metric | Value |
|---|---|
| Total transactions (2025) | 679 |
| Total line items (2025) | 1,415 |
| Gross sales | $67,594.18 |
| Total collected | $70,114.80 |
| Square fees paid | $1,272.29 |
| Transactions with customer linked | 455 (67%) |
| Transactions with NO customer | 224 (33%) |
| Line items that are services | 141 (10%) |
| Line items that are products | 1,237 (87.4%) |

---

## Phone Number Normalization Rules

Square exports phone numbers in multiple formats. All phone numbers must be normalized before import.

### Observed Formats

| Format | Example | Count |
|---|---|---|
| Quoted with +1 prefix | `'+15623972052` | 921 |
| 10-digit raw | `3106503746` | 253 |
| 11-digit with leading 1 | `13108921848` | 184 |
| Parentheses/dashes | `(310) 703-8944` | 9 |

### Normalization Algorithm

```
INPUT: raw phone string from Square

1. Remove all single quotes: ' → (empty)
2. Remove all non-numeric characters: (, ), -, spaces, +
3. Result is digits only

4. If length == 10 → prepend "1" → 11 digits
5. If length == 11 and starts with "1" → valid US number
6. If length != 10 and != 11 → FLAG AS INVALID

7. Store as: +1XXXXXXXXXX (E.164 format)
   Display as: (XXX) XXX-XXXX

EXAMPLES:
  '+15623972052  →  +15623972052
  3106503746     →  +13106503746
  13108921848    →  +13108921848
  (310) 703-8944 → +13107038944
```

### Duplicate Phone Detection

After normalization, check for duplicate phone numbers across customer records. If found:
- Flag for manual review
- Present both records with names, lifetime spend, and visit counts
- Owner decides: merge or keep separate

**Known duplicates:** "Adam Volvo" and "Adam" both share phone `+13106993032` with the same address. These are the same person — merge.

---

## Customer Import Rules

### Rule C-1: Phone is Primary Identifier

Phone number is the primary customer identifier in the new system. All lookups (POS, 11 Labs agent, portal login) use phone.

### Rule C-2: Import Tiers

Customers are imported in priority tiers:

**Tier 1 — Active Customers (import immediately)**
- Has phone number AND transaction count > 0
- These are real, contactable, paying customers
- Estimated: ~680 customers

**Tier 2 — Contactable Non-Transactors (import)**
- Has phone number but 0 transactions
- These are leads/contacts who haven't transacted
- Import but tag as "prospect"
- Estimated: ~687 customers

**Tier 3 — Email-Only Customers (import with flag)**
- Has email but no phone
- Import with "incomplete_profile" flag
- Prompt to capture phone on next interaction
- Estimated: ~8 customers

**Tier 4 — No Contact Info (do not import)**
- No phone AND no email
- Unreachable, no value in importing
- Archive in Square export for reference only
- Estimated: ~295 customers

### Rule C-3: Field Mapping

| Square Field | Auto Detail Field | Notes |
|---|---|---|
| Square Customer ID | square_customer_id | Keep for reference/linkage |
| Customer Reference ID | square_reference_id | Secondary reference |
| First Name | first_name | Trim whitespace |
| Last Name | last_name | Trim whitespace |
| Email Address | email | Lowercase, trim |
| Phone Number | phone | Normalize per phone rules above |
| Company Name | tags[] | Add as tag if present (e.g., "company:Pete Autohouse") |
| Street Address 1 | address_line_1 | Import if present |
| Street Address 2 | address_line_2 | Import if present |
| City | city | Import if present |
| State | state | Import if present |
| Postal Code | zip | Import if present |
| Birthday | birthday | Import if present (only 1 record has this) |
| Memo | notes | Import as internal note |
| Creation Source | tags[] | Add as tag (e.g., "source:loyalty", "source:appointments") |
| First Visit | first_visit_date | Import |
| Last Visit | last_visit_date | Import |
| Transaction Count | visit_count | Import as initial value |
| Lifetime Spend | lifetime_spend | Import as initial value |
| Email Subscription Status | — | DO NOT USE for consent (see Rule C-4) |
| Instant Profile | tags[] | If "Yes", add tag "instant_profile" |

### Rule C-4: Marketing Consent — Start Fresh

**DO NOT import Square's email subscription status as marketing consent.**

Reasons:
- Zero confirmed subscribers in the data
- TCPA requires explicit opt-in for SMS marketing
- CAN-SPAM requires opt-in for commercial email
- Importing old ambiguous consent creates legal risk

**Instead:**
- All imported customers default to `sms_consent = false` and `email_consent = false`
- Run a "Welcome to our new rewards program" campaign as the re-opt-in mechanism
- Customers opt in at POS on their next visit via the customer-facing screen
- Fresh consent is clean, documented, and legally defensible

### Rule C-5: Loyalty Points — Welcome Bonus

**Decision: CONFIRMED — Based on eligible spend history, or zero if none.**

**Loyalty-eligible purchases:** Retail products and services ONLY. Water purchases are **excluded** from loyalty point earning.

```
FOR each customer with transaction history:
  1. Sum all line items WHERE item is NOT water (SKU: 0000001)
     AND item is a retail product or service
  2. eligible_spend = SUM of qualifying line item totals
  3. loyalty_points = FLOOR(eligible_spend)
     (1 point per $1 eligible spend, rounded down)

IF customer has no eligible spend OR no transaction history:
  loyalty_points = 0

EXAMPLES:
  Maria Santos — $766.57 lifetime spend (all services) → 766 points ($35 in rewards)
  Rodrigo Pimentel — $3,468.91 (services + products) → 3,468 points ($170 in rewards)
  Kevin Miller — $15,075.27 total BUT almost entirely water → eligible spend ≈ $0 → ≈ 0 points
  Directory-only contact — $0 → 0 points
```

**No cap on retroactive points.** Since water is excluded, the concern about excessive point grants is resolved. All customers receive points proportional to their actual retail product and service spending.

**Water exclusion rule applies going forward too:** Water purchases at POS do not earn loyalty points. The POS must flag water (SKU: 0000001 or product category: Water) as loyalty-ineligible.

### Rule C-6: Notable Customer Records

| Customer | Notes | Action |
|---|---|---|
| Kevin Miller | $15,075 spend, 345 transactions | Likely wholesale/bulk water buyer. Tag as "VIP" or "wholesale" |
| Records with "." or "7/11" as name | Invalid/test entries | Exclude from import (Tier 4) |
| "Center 1067" | Business name, not person | Import with company tag |
| "Pete Autohouse" | Business name | Import with company tag |
| Duplicate phone entries | e.g., Adam Volvo / Adam | Merge during import review |

---

## Product Import Rules

### Rule P-1: All Catalog Items Are Physical Products

The Square catalog export (`catalog-*.csv`) contains **only physical goods**. Services are NOT in this export. All 433 items import as products.

### Rule P-2: Field Mapping

| Square Field | Auto Detail Field | Notes |
|---|---|---|
| Token | square_item_id | Keep for reference |
| Item Name | name | Trim whitespace, fix encoding |
| Customer-facing Name | — | Use if different from Item Name; otherwise ignore |
| Variation Name | — | Usually "Regular"; ignore unless meaningful |
| SKU | sku | Import directly |
| Description | description | Import if present (32.3% have this) |
| Categories | category | Map to new system categories (see Rule P-4) |
| Reporting Category | reporting_category | Secondary reference |
| Price | retail_price | Import, strip $ and commas |
| Online Sale Price | online_sale_price | Import if different from retail |
| Default Unit Cost | cost_price | Import, strip $ and commas |
| Default Vendor Name | vendor (lookup/create) | Match to vendor table or create new |
| Current Quantity SDASAS | quantity_on_hand | Import as current stock |
| Stock Alert Enabled SDASAS | — | Note threshold if set |
| Stock Alert Count SDASAS | reorder_threshold | Import if set |
| Archived | status | "N" → active, "Y" → archived |
| Sellable | — | Should match active status |
| Item Type | — | All are "Physical good" |
| Shipping Enabled | online_visible | "Y" = suitable for online store |
| Weight (lb) | weight | Import for shipping calculations |
| GTIN | barcode | Import if present |
| Tax - Tax (10.25%) | is_taxable | "Y" → true, "N" → false |
| Square Online Item Visibility | online_visible | "visible" → true |
| Modifier Set fields | — | Note for reference; may inform service setup |

### Rule P-3: Vendor Extraction

Extract unique vendors from the `Default Vendor Name` field and create vendor records:

**Known vendors from data:**
- MaxShine
- Detailer Stop
- Buff & Shine
- SD Auto Spa (internal/private label)
- P & S
- Gtechniq
- Autofiber
- Golden State Trading, Inc
- Renegade
- Sonax
- Nano

Each vendor gets a record with name only. Contact details, lead time, etc. are added later by the owner.

### Rule P-4: Category Mapping

Square categories map to the new system:

| Square Category | Auto Detail Category | Count |
|---|---|---|
| Accessories | Accessories | 92 |
| Paint Correction | Paint Correction | 69 |
| Brushes | Brushes | 45 |
| Microfibers | Microfibers | 40 |
| Paint Protection | Paint Protection | 39 |
| All Purpose Cleaners | Cleaners | 31 |
| Tires & Trims | Tires & Trims | 28 |
| Interior Care | Interior Care | 27 |
| Scents & Deodorizers | Scents & Deodorizers | 25 |
| Soaps & Shampoos | Soaps & Shampoos | 20 |
| Tools | Tools | 13 |
| Water | Water | 2 |
| (uncategorized) | Uncategorized | 2 |

Categories transfer 1:1 with minor renaming ("All Purpose Cleaners" → "Cleaners" for brevity). Owner may consolidate further after import.

### Rule P-5: Special Items

| Item | Notes | Action |
|---|---|---|
| WATER (SKU: 0000001) | RO water station, sold by gallon | Import as product. Category: Water. Not taxable. Note: high volume (1,422 units sold in 2025) |
| Credit card fees (SKU: 305152J) | CC fee pass-through at 5% | DO NOT import as a product. This is a fee line item, not inventory. Handle as a POS setting/rule |
| Custom Amount | One-off charges | DO NOT import as a product. These are handled as custom line items at POS |
| Items with 0 quantity and $0 cost | Dead/discontinued inventory | Import but mark as archived if no sales in 12+ months |

### Rule P-6: Image Migration (Via Square Catalog API)

Square's CSV export does NOT include image URLs. Images must be extracted via the Square Catalog API before the Square subscription is cancelled.

**Extraction process:**

```
Step 1: Generate a Square API access token
  → Square Developer Dashboard → Applications → Access Token
  → Requires: Production access token (not sandbox)
  → Must be done BEFORE cancelling Square subscription

Step 2: Fetch all catalog items and images
  → GET /v2/catalog/list?types=ITEM,IMAGE
  → Paginate through all results (100 per page)
  → Each ITEM object has an image_ids[] array
  → Each IMAGE object has image_data.url (public S3 URL)

Step 3: Download images
  → image_data.url is publicly accessible — no auth needed for download
  → Download each image, name by Square item token for mapping

Step 4: Upload to Supabase Storage
  → Upload to products/ bucket, organized by product ID
  → Link to product records via image URL field

Step 5: Verify
  → Compare count of images downloaded vs images in Square catalog
  → Flag products with no images for future re-photography
```

**Important:** The API access token must be generated before cancelling Square. Once cancelled, API access is revoked and images become inaccessible.

---

## Service Import Rules

### Rule S-1: Services Come From Transaction Data, Not Catalog

Square does NOT export services in the catalog CSV. Services are identified from the `items-*.csv` transaction file using:
- `Itemization Type` = "Service"
- Categories: "Detail Packages", "Core Services", "Interior Add-Ons", "Exterior Add-Ons", "Paint Services", "Services & Details"

### Rule S-2: Identified Services (From 2025 Transaction Data)

| Service Name | Category | Occurrences | Price Points Observed |
|---|---|---|---|
| Pro Detail | Services & Details | 57 | CAR, SUV, VAN, Regular |
| Signature Complete Detail (Pro Detail) | Detail Packages | 11 | Vehicle Size - SMALL, MEDIUM, LARGE |
| Hot Shampoo Extraction / 2 Seats | Interior Add-Ons | 13 | Various seat counts |
| Hot Shampoo Services | Interior Add-Ons | 6 | 4 Seats, Floor Mats Only |
| Interior Extra Care | Services & Details | 6 | CAR, SUV |
| Clay-Bar Treatment W/ Ceramic Wax | Services & Details | 6 | CAR, SUV |
| Paint Correction | Paint Services | 5 | CAR, SUV |
| Custom Service | Core Services | 4 | Regular |
| Custom | Services & Details | 7 | Various |
| Medium Depth Scratch Removal | Services & Details | 4 | CAR |
| Ceramic Coating | Services & Details | 3 | CAR |
| Engine Bay Steam Cleaned | Services & Details | 3 | Regular |
| Ozone Treatment | Services & Details | 2 | Regular |
| Undercarriage Steam Cleaning | Services & Details | 2 | Regular |
| Headlight Restoration | Services & Details | 2 | Regular |
| Scratch Repair | Services & Details | 2 | Regular |
| + 8 more with 1 occurrence each | — | — | — |

**Note:** "Pro Detail" and "Signature Complete Detail (Pro Detail)" appear to be the same service with different naming over time. Consolidate during import.

### Rule S-3: Vehicle Size Standardization

Square uses inconsistent size naming. Standardize to the Auto Detail 3-tier system (see SERVICE_CATALOG.md for full vehicle size classification):

| Square Price Point | Auto Detail Size Class |
|---|---|
| Vehicle Size - SMALL | Sedan |
| CAR | Sedan |
| Car/Truck | Sedan (default, override if known) |
| Regular | Sedan (default assumption) |
| Vehicle Size - MEDIUM | Truck/SUV (2-Row) |
| SUV | Truck/SUV (2-Row) |
| Suv and van | Truck/SUV (2-Row) |
| Truck | Truck/SUV (2-Row) |
| Vehicle Size - LARGE | SUV (3-Row) / Van |
| VAN | SUV (3-Row) / Van |

**3-tier mapping summary:**
- **Sedan** = sedans, coupes, compact cars (anything Small, CAR, Regular)
- **Truck/SUV (2-Row)** = SUVs, trucks, crossovers (anything Medium, SUV, Truck)
- **SUV (3-Row) / Van** = full-size vans, 3-row SUVs, extended trucks (anything Large, VAN)

**Rule:** When "Regular" is the price point for a service, default to Sedan. The actual size may not be determinable from Square data alone. Staff can correct the vehicle size class on the customer's next visit.

### Rule S-4: Service Creation Is Manual

Services should NOT be auto-created from transaction data. Instead:
1. Use the transaction data as **reference** for what services have been offered
2. Owner creates services manually in the admin panel with:
   - Correct name
   - Full description
   - Duration
   - Size-based pricing matrix
   - Add-on relationships
   - Category
3. The services list has already been prepared by the owner
4. Historical transactions link to services by name matching (best effort)

---

## Transaction Import Rules

### Rule T-1: Import Historical Transactions

Historical transactions provide:
- Customer lifetime spend verification
- Visit frequency data
- Last service date (critical for lifecycle marketing)
- Revenue trend data for reporting
- Service history per customer

### Rule T-2: Data Sources for Each Transaction

Each historical transaction is reconstructed from TWO files:

**From `items-*.csv`:**
- Line items (what was sold: products and services)
- Category and item name
- Quantity and price
- Itemization Type (product vs service)
- Price Point Name (vehicle size for services)
- Customer ID and name
- Employee
- Tax per item

**From `transactions-*.csv`:**
- Payment method (cash, card, split)
- Card brand and last 4 digits
- Tip amount
- Discount total
- Gross/net totals
- Fees
- Deposit info
- Transaction status

**Join key:** `Transaction ID` (exists in both files)

### Rule T-3: Transaction Field Mapping

| Source Field | Auto Detail Field | File |
|---|---|---|
| Transaction ID | square_transaction_id | Both |
| Date + Time + Time Zone | transaction_date (UTC) | transactions |
| Customer ID | customer_id (via square_customer_id lookup) | Both |
| Customer Name | — | Fallback for customer matching |
| Gross Sales | subtotal | transactions |
| Tax | tax_amount | transactions |
| Tip | tip_amount | transactions |
| Discounts | discount_amount | transactions |
| Total Collected | total_amount | transactions |
| Card (amount) | payment_card_amount | transactions |
| Cash (amount) | payment_cash_amount | transactions |
| Card Brand | card_brand | transactions |
| PAN Suffix | card_last_four | transactions |
| Fees | square_fees | transactions (reference only) |
| Staff Name | employee (lookup) | transactions |
| Transaction Status | status | transactions |
| Event Type | — | Filter: only import "Payment" events |

### Rule T-4: Transaction Line Item Mapping

| Source Field | Auto Detail Field | File |
|---|---|---|
| Item | item_name (stored as text) | items |
| Category | item_category | items |
| Qty | quantity | items |
| Gross Sales | unit_price (calculated: gross / qty) | items |
| Net Sales | total_price | items |
| Tax | tax_amount | items |
| Itemization Type | item_type ("product" or "service") | items |
| SKU | product_id (lookup by SKU) | items |
| Price Point Name | vehicle_size_class (for services) | items |
| Employee | employee (lookup) | items |
| Token | square_item_token | items |

### Rule T-5: Customer Matching for Transactions

Priority order for linking a transaction to a customer:
1. `Customer ID` in items/transactions file → match to `square_customer_id` in customers table
2. `Customer Reference ID` → match to `square_reference_id`
3. `Customer Name` → fuzzy match (last resort, flag for review)
4. No customer data → import as anonymous transaction

### Rule T-6: Special Transaction Items

| Item | Rule |
|---|---|
| WATER | Import as product sale. SKU: 0000001 |
| Credit card fees | DO NOT import as a line item. This is a business fee, not a sale. Note as metadata on the transaction if needed for QuickBooks reconciliation |
| Custom Amount / Custom Service | Import as a "custom" line item with the dollar amount. Tag as "custom_charge" for reporting |
| Items with $0.00 | Skip unless they represent a comp/freebie (check if discount was applied) |

### Rule T-7: Refund Identification

In the transactions file:
- `Partial Refunds` column shows refund amounts
- `Transaction Status` should be "Complete" (refunds are separate events in Square)
- `Items Refunded` in the summary file shows refund counts

Import refunds as separate records linked to the original transaction where possible.

---

## Vehicle Inference Rules

### Rule V-1: Infer Vehicles from Service Transactions

For customers with service transactions, infer vehicles from the `Price Point Name`:

```
FOR each customer with service transactions:
  1. Collect all (transaction_date, price_point_name) pairs
  2. Map price_point_name to size_class (per Rule S-3)
  3. Group by size_class
  4. Each unique size_class = 1 inferred vehicle

EXAMPLE:
  Customer: John M.
  Transactions:
    Jan 5:  "Pro Detail" — Price Point "SUV"     → SUV
    Mar 12: "Ceramic Coating" — Price Point "SUV" → SUV (same vehicle)
    Jun 8:  "Pro Detail" — Price Point "CAR"      → Sedan (different vehicle!)

  Result: 2 vehicles inferred
    Vehicle 1: SUV (make/model/year/color unknown)
    Vehicle 2: Sedan (make/model/year/color unknown)
```

### Rule V-2: Vehicle Records Are Minimal at Import

Inferred vehicles are created with:
- `customer_id` — linked to customer
- `size_class` — inferred from transactions
- `notes` — "Inferred from Square transaction history. Details to be captured on next visit."
- All other fields (year, make, model, color) left blank

### Rule V-3: Capture Full Vehicle Details on Next Visit

When an existing imported customer visits after migration:
- POS shows: "This customer has a vehicle on file with limited details"
- Prompt cashier/detailer to capture: year, make, model, color
- Update the vehicle record

### Rule V-4: Product-Only Customers

Customers who only purchased products (never had a service) get no vehicle record. A vehicle record is created on their first service visit.

---

## Employee Import Rules

### Rule E-1: Known Employees from Data

| Name | Role (from data) | Transactions | Notes |
|---|---|---|---|
| Nayeem Khan | Owner / Auto Shop Manager | 227 (33.4%) | Super-Admin in new system |
| Segundo Cadena | Auto Shop Manager / Detailer | 279 (41.1%) | Current detailer. Bookable for appointments |
| Mariah Arce | Admin | 60 (8.8%) | **Inactive — do not import** |
| Joana Lira | Admin | 17 (2.5%) | Active staff member |
| Crystal Lira | Sales | 7 (1.0%) | **Inactive — do not import** |
| David Torres | — | 141 items | **Inactive — former employee, do not import** |
| Su Khan | Admin | — | Active staff member |
| Joselyn | — (new hire) | — | **New employee — not in Square data. Create account during setup.** |

### Rule E-2: Employee Import — CONFIRMED

Active employee roster confirmed by owner. Import these 5 accounts:

| Name | System Role | Notes |
|---|---|---|
| Nayeem Khan | Super-Admin | Owner. Full unrestricted access. |
| Segundo Cadena | Detailer | Primary detailer. Bookable for appointments. |
| Joana Lira | Admin | Management access. |
| Su Khan | Admin | Management access. |
| Joselyn | Cashier | New hire — no Square history. POS operations. |

**Inactive employees (do NOT create accounts):** Mariah Arce, Crystal Lira, David Torres. Their names are retained as text on historical transactions — no data loss.

- Each active employee gets a user account with their assigned role
- Historical transactions retain the employee name as text (not broken if employee is deleted)

---

## Vendor Import Rules

### Rule VN-1: Extract and Create Vendors

Unique vendors from the product catalog:

| Vendor Name | Products | Notes |
|---|---|---|
| MaxShine | Multiple | Accessories, tools |
| Detailer Stop | Multiple | Various chemicals, tools |
| Buff & Shine | Multiple | Polishing pads |
| SD Auto Spa | Multiple | Private label / in-house brand |
| P & S | Multiple | Chemicals, coatings |
| Gtechniq | Multiple | Coatings, ceramics, soaps |
| Autofiber | Multiple | Microfibers, towels |
| Golden State Trading, Inc | Multiple | Accessories |
| Renegade | Multiple | Chemicals, coatings |
| Sonax | Multiple | Chemicals, protection |
| Nano | Multiple | Ceramic products |

Create vendor records with name only. Owner adds contact details, lead times, and preferred ordering information after import.

---

## Import Execution Order

The import must follow this sequence due to foreign key dependencies:

```
Step 1: VENDORS
  → Create vendor records from product catalog
  → No dependencies

Step 2: PRODUCTS
  → Import product catalog
  → Links to: vendors (by name match)
  → No customer dependency

Step 3: SERVICES
  → Owner creates manually from prepared services list
  → Reference transaction data for pricing history
  → No import dependency

Step 4: EMPLOYEES
  → Create user accounts for active staff
  → Owner confirms active roster

Step 5: CUSTOMERS
  → Import Tier 1 and Tier 2 customers
  → Normalize phone numbers
  → Deduplicate
  → Set marketing consent to false
  → Apply welcome bonus points (if chosen)

Step 6: VEHICLES
  → Run vehicle inference from transaction data
  → Create minimal vehicle records linked to customers
  → Requires: customers imported first

Step 7: TRANSACTIONS
  → Import historical transactions
  → Link to: customers (via Square Customer ID)
  → Link to: products (via SKU match)
  → Link to: services (via name match, best effort)
  → Link to: employees (via name match)
  → Requires: all above imported first

Step 8: VALIDATION
  → Compare imported totals vs Square summary data
  → Verify customer lifetime spend matches
  → Verify product inventory matches
  → Flag discrepancies for review
```

---

## Import Validation Checks

After import, run these validation queries:

| Check | Expected | Source |
|---|---|---|
| Total customers imported (Tier 1+2+3) | ~1,375 | Customers with phone or email |
| Total products imported | 433 | Full catalog |
| Total vendors created | ~11 | Unique vendors |
| Total transactions imported | Match per year | Transaction files |
| Total line items imported | Match per year | Items files |
| Customer lifetime spend (top 10) | Match Square values | Customer export |
| Product inventory totals | Match Square quantities | Catalog export |
| Revenue totals by year | Match Square reports | Transaction files |

---

## Post-Import Data Enrichment

After migration, the following data is captured organically through normal operations:

| Data Point | How It Gets Captured |
|---|---|
| Vehicle make/model/year/color | Cashier prompted on next visit |
| Marketing consent (SMS) | Customer-facing screen at POS checkout |
| Marketing consent (email) | Customer-facing screen at POS checkout |
| Email addresses | Customer portal signup, booking form |
| Birthday | Customer portal profile, POS prompt |
| Full vehicle details | Booking form, POS check-in |

The system is designed to progressively enrich customer profiles over time without requiring a large upfront data collection effort.

---

## Data Retention

### Square Reference IDs

All Square IDs (`square_customer_id`, `square_item_id`, `square_transaction_id`, `square_reference_id`) are stored permanently in the new system. This allows:
- Audit trail back to source data
- Troubleshooting import issues
- Re-importing if corrections are needed
- Historical verification

### Square CSV Archives

Original Square CSV export files should be archived permanently in a secure location (not in the application database, but stored as files). These are the source of truth for the pre-migration era.

---

## Open Decisions (Owner to Confirm)

| # | Decision | Options | Status |
|---|---|---|---|
| 1 | Loyalty welcome bonus | Based on history (1pt per $1 eligible spend), 0 if no history. Water purchases EXCLUDED. | CONFIRMED |
| 2 | Import Tier 2 customers? | Yes — import prospects with "prospect" tag | CONFIRMED |
| 3 | Historical data range | All available data from 2019/2020 onward | CONFIRMED |
| 4 | "Custom Amount" transactions | Import as custom line items with "custom_charge" tag | CONFIRMED |
| 5 | Kevin Miller classification | Regular customer. Water-only buyer — no loyalty points on water. | CONFIRMED |
| 6 | Loyalty point cap for retroactive grants | No cap. Water is excluded so Kevin's eligible spend is ~$0. | CONFIRMED |

---

## Document Version History

| Version | Date | Changes |
|---|---|---|
| v1 | 2026-02-01 | Initial document based on Square data analysis |
| v2 | 2026-02-01 | Fixed Rule S-3 vehicle size mapping to 3-tier system. Updated Rule C-5 loyalty points to exclude water purchases. All 6 open decisions confirmed (loyalty, Tier 2 import, historical range, custom amounts, Kevin Miller, points cap). |
| v3 | 2026-02-01 | Confirmed active employee roster (Nayeem, Segundo, Joana, Su, Joselyn). Added Joselyn as new Cashier hire. Marked Mariah, Crystal, David as inactive. Updated Rule P-6 image migration to use Square Catalog API. Added Square API token instructions. Noted all CSV files downloaded. |
