# Template Variable Data Audit

**Date:** 2026-02-10

## 1. CUSTOMER DATA COVERAGE (1,316 customers)

| Field | Count | % Coverage | Notes |
|-------|-------|-----------|-------|
| first_name | 1,316 | 100% | NOT NULL — always present |
| last_name | 1,316 | 100% | NOT NULL — always present (some are empty string or junk like "1067") |
| phone | 1,309 | 99.5% | Almost universal |
| email | 84 | **6.4%** | Very sparse — only 84 of 1,316 |
| birthday | 2 | **0.15%** | Effectively empty |
| visit_count > 0 | 750 | 57% | Migrated from Square |
| last_visit_date | 750 | 57% | Same 750 who have visits |
| lifetime_spend > 0 | 750 | 57% | Same set |
| loyalty_points > 0 | 393 | 30% | 393 customers have points |
| sms_consent | 2 | **0.15%** | Only 2 opted in |
| email_consent | 2 | **0.15%** | Only 2 opted in |
| customer_type | 967 | 73.5% | enthusiast: 694, professional: 273 (349 NULL) |

**Key insight:** Phone is nearly universal, email is extremely sparse. Loyalty points exist for ~400 customers with meaningful balances (top: 3,094 points).

## 2. TRANSACTION DATA (6,118 transactions)

| Metric | Value |
|--------|-------|
| Total transactions | 6,118 |
| Completed | 6,118 (100%) |
| With customer_id | 1,581 (25.8%) |
| Anonymous (no customer) | 4,537 (74.2%) |
| Earliest | 2021-05-07 |
| Latest | 2026-02-06 |
| Max spend | $4,750 |
| Min spend (>$0) | $0.10 |

## 3. TOP VISITORS (by visit_count on customer record)

| Customer | Visits | Last Visit | Lifetime Spend |
|----------|--------|------------|---------------|
| Kevin Miller | 331 | 2026-01-10 | $14,324 |
| Rodrigo Pimentel | 74 | 2024-04-23 | $3,395 |
| Javier Delgado | 65 | 2025-01-08 | $2,069 |
| Deivis Laurence | 61 | 2023-11-12 | $1,384 |
| "Unknown" (no last name) | 45 | 2022-08-16 | $1,200 |
| Diego Valenzuela | 34 | 2024-04-01 | $2,018 |

Days-since-last-visit is derivable from `last_visit_date` (already used in audience filters).

## 4. APPOINTMENTS (10 total)

| Metric | Value |
|--------|-------|
| Total | 10 |
| With customer | 10 |
| With vehicle | 9 |
| Status: pending | 5, confirmed: 3, completed: 1, cancelled: 1 |

Tracks: scheduled_date, scheduled_start_time, scheduled_end_time, vehicle_id, employee_id, status, services (via appointment_services join), payment_status, is_mobile, job_notes.

**Very few appointments** — this is primarily a walk-in/POS-driven business. Appointment data is sparse.

## 5. VEHICLES (134 total)

| Field | Count | % |
|-------|-------|---|
| Total vehicles | 134 | — |
| Has year | 4 | **3%** |
| Has make | 4 | **3%** |
| Has model | 4 | **3%** |
| Has color | 4 | **3%** |
| Has license_plate | 0 | 0% |
| is_incomplete | 130 | **97%** |

**Critical finding:** 130 of 134 vehicles are marked `is_incomplete`. Only 4 vehicles have year/make/model data. Vehicle info via `{vehicle_info}` will resolve to empty string for ~97% of customers.

## 6. LOYALTY DATA

| Metric | Value |
|--------|-------|
| Loyalty ledger entries | 410 |
| Customers with points > 0 | 393 |

**Top loyalty balances:** Roscoe Robles (3,094), Center 1067 (3,084), Rodrigo Pimentel (3,074), Kevin Miller (2,702).

**Schema columns on customers table:**
- `loyalty_points_balance` (INTEGER, default 0) — denormalized running balance
- Related: `transactions.loyalty_points_earned`, `transactions.loyalty_points_redeemed`, `transactions.loyalty_discount`

**Business settings for loyalty:**
- `loyalty_earn_rate` — points per dollar spent
- `loyalty_redeem_minimum` — minimum points to redeem
- `loyalty_redeem_rate` — dollar value per point

## 7. BUSINESS SETTINGS (39 keys)

```
appointment_buffer_minutes     loyalty_earn_rate
booking_config                 loyalty_redeem_minimum
business_address               loyalty_redeem_rate
business_email                 messaging_ai_*  (6 keys)
business_hours                 messaging_auto_archive_days
business_name                  messaging_auto_close_hours
business_phone                 mobile_travel_buffer_minutes
business_website               n8n_webhook_urls
cancellation_window_hours      pos_* (4 keys)
cc_fee_rate                    receipt_* (3 keys)
coupon_type_enforcement        stale_quote_days
google_review_url              tax_products_only / tax_rate
yelp_review_url                tip_presets / voice_agent_api_key / water_sku
```

**Potentially useful as template variables:**
- `business_name`, `business_phone`, `business_address`, `business_email`, `business_website` — already accessible via `getBusinessInfo()`
- `business_hours` — structured JSON, already has `formatBusinessHoursText()` helper
- `google_review_url` / `yelp_review_url` — already wired as template vars

## 8. COUPONS (10 total)

| Metric | Value |
|--------|-------|
| Total | 10 |
| Active | 8 |
| Customer-specific | 6 |
| Campaign-generated | 5 |

No `customer_coupons` junction table. Customer-coupon relationship is via `coupons.customer_id` (direct FK) or `coupons.customer_tags`. Can derive active coupons per customer via `customer_id` + `status='active'` + not expired.

## 9. SERVICES CATALOG (30 active services)

Full list: 1-Year/3-Year/5-Year Ceramic Shield, 3-Stage Paint Correction, Aircraft/Boat/RV Exterior+Interior, Booster Detail ($125), Complete Motorcycle Detail, Engine Bay ($175), Express Exterior/Interior, Flood Damage, Headlight Restoration ($125), Hot Shampoo, Leather Conditioning ($75), Organic Stain ($175), Ozone Odor ($75), Paint Decontamination ($175), Pet Hair ($75), Scratch Repair, Signature Complete Detail, Single-Stage Polish, Trim/Undercarriage/Water Spot ($125 each), Excessive Cleaning Fee ($75).

## 10. TEMPLATES ACTUALLY IN USE

**Campaign templates use these variables:**
- `{first_name}` — 5 of 6 campaigns
- `{coupon_code}` — 3 campaigns
- `{book_url}` — 2 campaigns
- `{booking_url}` — 1 campaign
- `{google_review_link}` — 2 campaigns (the "Copy" campaign)
- `{yelp_review_link}` — 2 campaigns
- `{book_now_url}` — 1 campaign

**Lifecycle rule templates use these variables:**
- `{first_name}` — all 3 rules
- `{business_name}` — 2 rules
- `{service_name}` — 1 rule
- `{vehicle_info}` — 1 rule
- `{google_review_link}` — all 3 rules
- `{yelp_review_link}` — all 3 rules
- `{coupon_code}` — 1 rule
- `{book_now_url}` — 1 rule

**Notable: The 3rd lifecycle rule** ("Post-Service Thank You") uses review links WITHOUT the `⭐ Google:` / `⭐ Yelp:` format — uses inline format `please leave us a review: {google_review_link} or {yelp_review_link}`. The `cleanEmptyReviewLines()` regex won't catch this pattern if links are empty (it only matches lines starting with `⭐`). The link would just be blank in the output: "please leave us a review:  or ".

## Summary of Findings for Variable Decisions

**Well-populated data (good for new variables):**
- `loyalty_points_balance` — 393 customers, meaningful balances up to 3,094
- `visit_count` / `last_visit_date` / `lifetime_spend` — 750 customers (57%)
- `customer_type` (enthusiast/professional) — 967 customers (73.5%)

**Sparse data (poor for personalization):**
- `email` — only 84 customers (6.4%)
- `birthday` — only 2 customers (effectively zero)
- `vehicle_info` (year/make/model) — only 4 of 134 vehicles complete (97% incomplete)
- `appointments` — only 10 total (business is walk-in/POS heavy)

**Existing but unused in templates:**
- `{last_name}` — defined but never used in any live template
- `{business_name}` — used in lifecycle only, not campaigns
