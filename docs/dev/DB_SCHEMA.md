# Smart Details Auto Spa — Database Schema Reference

> Auto-generated from `supabase/migrations/*.sql`  
> Last updated: Feb 24, 2026

---

## Core Business

### employees
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| auth_user_id | UUID | UNIQUE, FK → auth.users(id) ON DELETE SET NULL | |
| first_name | TEXT | NOT NULL | |
| last_name | TEXT | NOT NULL | |
| email | TEXT | UNIQUE, NOT NULL | |
| phone | TEXT | | |
| role | user_role (enum) | NOT NULL, DEFAULT 'detailer' | super_admin, admin, cashier, detailer |
| role_id | UUID | NOT NULL, FK → roles(id) | Added later via ALTER |
| status | employee_status (enum) | NOT NULL, DEFAULT 'active' | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### customers
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| auth_user_id | UUID | UNIQUE, FK → auth.users(id) ON DELETE SET NULL | Portal login |
| deactivated_auth_user_id | UUID | | Stores auth ID when portal access disabled |
| first_name | TEXT | NOT NULL | |
| last_name | TEXT | NOT NULL | |
| phone | TEXT | | Primary phone (auth identity) |
| mobile_2 | TEXT | | Secondary mobile |
| email | TEXT | | |
| birthday | DATE | | |
| customer_type | TEXT | CHECK ('enthusiast','professional') | Was 'detailer', renamed to 'professional' |
| address_line_1 | TEXT | | |
| address_line_2 | TEXT | | |
| city | TEXT | | |
| state | TEXT | | |
| zip | TEXT | | |
| sms_consent | BOOLEAN | NOT NULL, DEFAULT false | |
| email_consent | BOOLEAN | NOT NULL, DEFAULT false | |
| notify_promotions | BOOLEAN | NOT NULL, DEFAULT true | |
| notify_loyalty | BOOLEAN | NOT NULL, DEFAULT true | |
| qbo_id | TEXT | | QuickBooks Online ID |
| qbo_synced_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | "Customer Since" date |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### vehicles
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| vehicle_type | vehicle_type (enum) | NOT NULL, DEFAULT 'standard' | |
| vehicle_category | TEXT | NOT NULL, DEFAULT 'automobile', CHECK IN (automobile, motorcycle, rv, boat, aircraft) | |
| specialty_tier | TEXT | CHECK valid tier keys or NULL | NULL for automobiles; maps to service_pricing.tier_name |
| year | INTEGER | | |
| make | TEXT | | |
| model | TEXT | | |
| color | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

---

## Catalog

### product_categories
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | UNIQUE, NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | |
| description | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### products
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| sku | TEXT | UNIQUE | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| cost_price | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| quantity_on_hand | INTEGER | NOT NULL, DEFAULT 0 | |
| image_url | TEXT | | Synced from product_images primary |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### product_images
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| image_url | TEXT | NOT NULL | |
| storage_path | TEXT | NOT NULL | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_primary | BOOLEAN | NOT NULL, DEFAULT false | Unique per product |
| created_at | TIMESTAMPTZ | | |

### service_categories
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | UNIQUE, NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | |
| description | TEXT | | |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

**Current categories (6):** Express & Detail Services, Paint Correction & Restoration, Ceramic Coatings, Exterior Enhancements, Interior Enhancements, Specialty Vehicles. (Precision Express and Signature Detail merged into "Express & Detail Services" — owner performed via Admin UI, cleaned up in Session 10.)

### services
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| mobile_eligible | BOOLEAN | NOT NULL, DEFAULT false | |
| vehicle_compatibility | JSONB | DEFAULT '["standard"]' | Array of vehicle_type values |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### service_pricing

**Row-based tier system.** Each service has N rows — one per pricing tier. The `price` column is the primary price for every tier. The `vehicle_size_*` columns are ONLY used when `is_vehicle_size_aware = true` (currently only Hot Shampoo Extraction's "Complete Interior" scope tier — a nested pricing edge case).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | |
| tier_name | TEXT | NOT NULL | e.g. 'sedan', 'rv_up_to_24', 'aircraft_2_4' |
| tier_label | TEXT | | Display label e.g. 'Sedan', "Up to 24'", '2-4 Seater' |
| price | DECIMAL(10,2) | NOT NULL | Primary price for this tier |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_vehicle_size_aware | BOOLEAN | NOT NULL, DEFAULT false | Only for scope tiers that ALSO vary by automobile size |
| vehicle_size_sedan_price | DECIMAL(10,2) | | Only used when is_vehicle_size_aware = true |
| vehicle_size_truck_suv_price | DECIMAL(10,2) | | Only used when is_vehicle_size_aware = true |
| vehicle_size_suv_van_price | DECIMAL(10,2) | | Only used when is_vehicle_size_aware = true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

UNIQUE constraint on (service_id, tier_name). Index on service_id.

**Tier examples by pricing model:**
- `vehicle_size`: 3 rows per service — `sedan`, `truck_suv_2row`, `suv_3row_van`
- `scope`: N rows with named tiers — `floor_mats`, `per_row`, `carpet_mats`, `complete`
- `specialty`: 2-3 rows with category-specific tier_names — `standard_cruiser`, `rv_up_to_24`, `boat_21_26`, `aircraft_2_4`, etc.
- `flat`, `per_unit`, `custom`: No rows in service_pricing — price stored on `services` table directly

### Pricing Models Reference

| Model | Price Storage | Price Resolution |
|-------|-------------|-----------------|
| `vehicle_size` | 3 rows in `service_pricing` (sedan, truck_suv_2row, suv_3row_van) | Match vehicle's `vehicle_type` to `tier_name` |
| `scope` | N rows in `service_pricing` with named tiers | Staff selects scope tier. If `is_vehicle_size_aware`, sub-prices from vehicle_size columns |
| `specialty` | 2-3 rows in `service_pricing` with category-specific tier_names | Match vehicle's `specialty_tier` to `tier_name`, or staff selects manually |
| `per_unit` | `per_unit_price` on `services` table | Multiply by quantity selected by staff |
| `flat` | `flat_price` on `services` table | Direct — single price regardless of vehicle |
| `custom` | `custom_starting_price` on `services` table | Starting price shown, staff enters final after inspection |

### packages
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| price | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### package_services
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |

---

## Transactions & Payments

### transactions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| receipt_number | TEXT | UNIQUE | Auto-generated 'SD-XXXXXX' via trigger |
| square_transaction_id | TEXT | UNIQUE | |
| appointment_id | UUID | FK → appointments(id) | |
| customer_id | UUID | FK → customers(id) | |
| vehicle_id | UUID | FK → vehicles(id) | |
| employee_id | UUID | FK → employees(id) | Service advisor / cashier |
| status | transaction_status (enum) | NOT NULL, DEFAULT 'open' | |
| subtotal | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| tax_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| tip_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| payment_method | payment_method (enum) | | |
| coupon_id | UUID | FK → coupons(id) | |
| coupon_code | TEXT | | Denormalized for receipt display |
| loyalty_points_earned | INTEGER | NOT NULL, DEFAULT 0 | |
| loyalty_points_redeemed | INTEGER | NOT NULL, DEFAULT 0 | |
| loyalty_discount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| notes | TEXT | | |
| offline_id | TEXT | | For offline POS sync |
| transaction_date | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| qbo_id | TEXT | | QuickBooks Online ID |
| qbo_sync_status | TEXT | DEFAULT NULL | |
| qbo_sync_error | TEXT | | |
| qbo_synced_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### transaction_items
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| transaction_id | UUID | NOT NULL, FK → transactions(id) ON DELETE CASCADE | |
| item_type | transaction_item_type (enum) | NOT NULL | product, service, package |
| product_id | UUID | FK → products(id) | |
| service_id | UUID | FK → services(id) | |
| package_id | UUID | FK → packages(id) | |
| item_name | TEXT | NOT NULL | Denormalized for history |
| quantity | INTEGER | NOT NULL, DEFAULT 1 | |
| unit_price | DECIMAL(10,2) | NOT NULL | |
| total_price | DECIMAL(10,2) | NOT NULL | |
| tax_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| is_taxable | BOOLEAN | NOT NULL, DEFAULT false | |
| tier_name | TEXT | | Pricing tier used |
| vehicle_size_class | vehicle_size_class (enum) | | |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | | |

### payments
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| transaction_id | UUID | NOT NULL, FK → transactions(id) ON DELETE CASCADE | |
| method | payment_method (enum) | NOT NULL | |
| amount | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### refunds
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| transaction_id | UUID | NOT NULL, FK → transactions(id) ON DELETE RESTRICT | |
| status | refund_status (enum) | NOT NULL, DEFAULT 'pending' | |
| amount | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### refund_items
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| transaction_item_id | UUID | NOT NULL, FK → transaction_items(id) | |
| quantity | INTEGER | NOT NULL, DEFAULT 1 | |
| amount | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

---

## Appointments & Jobs

### appointments
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| vehicle_id | UUID | FK → vehicles(id) | |
| employee_id | UUID | FK → employees(id) | |
| status | appointment_status (enum) | NOT NULL, DEFAULT 'pending' | |
| mobile_zone_id | UUID | FK → mobile_zones(id) | |
| mobile_address | TEXT | | |
| mobile_surcharge | DECIMAL(10,2) | DEFAULT 0 | |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| job_notes | TEXT | | |
| payment_type | TEXT | CHECK ('deposit','pay_on_site','full') | |
| deposit_amount | DECIMAL(10,2) | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### appointment_services
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| appointment_id | UUID | NOT NULL, FK → appointments(id) ON DELETE CASCADE | |
| price_at_booking | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### jobs
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| appointment_id | UUID | FK → appointments(id) | |
| transaction_id | UUID | FK → transactions(id) | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| vehicle_id | UUID | FK → vehicles(id) | |
| assigned_staff_id | UUID | FK → employees(id) | |
| status | TEXT | CHECK ('scheduled','intake','in_progress','pending_approval','completed','closed','cancelled') | |
| services | JSONB | NOT NULL, DEFAULT '[]' | Array of {id, name, price} |
| work_started_at | TIMESTAMPTZ | | |
| work_completed_at | TIMESTAMPTZ | | |
| timer_seconds | INTEGER | NOT NULL, DEFAULT 0 | |
| timer_paused_at | TIMESTAMPTZ | | |
| intake_started_at | TIMESTAMPTZ | | |
| intake_completed_at | TIMESTAMPTZ | | |

### job_photos
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| job_id | UUID | NOT NULL, FK → jobs(id) ON DELETE CASCADE | |
| zone | TEXT | NOT NULL | |
| phase | TEXT | CHECK ('intake','progress','completion') | |
| image_url | TEXT | NOT NULL | |
| thumbnail_url | TEXT | | |
| storage_path | TEXT | NOT NULL | |
| notes | TEXT | | |
| annotation_data | JSONB | | |
| is_featured | BOOLEAN | NOT NULL, DEFAULT false | |
| is_internal | BOOLEAN | NOT NULL, DEFAULT false | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_by | UUID | FK → employees(id) | |

### job_addons
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| job_id | UUID | NOT NULL, FK → jobs(id) ON DELETE CASCADE | |
| service_id | UUID | FK → services(id) | |
| product_id | UUID | FK → products(id) | |
| custom_description | TEXT | | |
| price | DECIMAL(10,2) | NOT NULL | |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| status | TEXT | CHECK ('pending','approved','declined','expired') | |
| authorization_token | TEXT | NOT NULL, UNIQUE | |
| message_to_customer | TEXT | | |
| sent_at | TIMESTAMPTZ | | |
| responded_at | TIMESTAMPTZ | | |
| expires_at | TIMESTAMPTZ | | |

---

## Coupons & Loyalty

### coupons
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| code | TEXT | UNIQUE, NOT NULL | |
| type | coupon_type (enum) | NOT NULL | |
| value | DECIMAL(10,2) | NOT NULL | Dollar amount or percentage |
| status | coupon_status (enum) | NOT NULL, DEFAULT 'active' | |
| target_customer_type | TEXT | CHECK ('enthusiast','professional') | |
| campaign_id | UUID | FK → campaigns(id) | |
| customer_id | UUID | FK → customers(id) | Customer-specific coupon |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### coupon_rewards
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| coupon_id | UUID | NOT NULL, FK → coupons(id) ON DELETE CASCADE | |
| discount_type | TEXT | CHECK ('percentage','flat','free') | |
| discount_value | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### loyalty_ledger
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| transaction_id | UUID | FK → transactions(id) | |
| action | loyalty_action (enum) | NOT NULL | |
| points_change | INTEGER | NOT NULL | Positive=earn, negative=redeem |
| points_balance | INTEGER | NOT NULL | Running balance |
| description | TEXT | | |
| created_at | TIMESTAMPTZ | | |

---

## Marketing & Communications

### campaigns
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| status | campaign_status (enum) | NOT NULL, DEFAULT 'draft' | |
| sms_template | TEXT | | |
| email_subject | TEXT | | |
| email_template | TEXT | | |
| coupon_id | UUID | FK → coupons(id) | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### campaign_variants
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| campaign_id | UUID | NOT NULL, FK → campaigns(id) ON DELETE CASCADE | |
| variant_label | TEXT | NOT NULL, DEFAULT 'A' | |
| message_body | TEXT | NOT NULL | |
| email_subject | TEXT | | |
| split_percentage | INTEGER | NOT NULL, DEFAULT 50 | |
| is_winner | BOOLEAN | DEFAULT false | |
| created_at | TIMESTAMPTZ | | |

### campaign_recipients
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| campaign_id | UUID | NOT NULL, FK → campaigns(id) ON DELETE CASCADE | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| variant_id | UUID | FK → campaign_variants(id) | |
| coupon_code | TEXT | | |
| created_at | TIMESTAMPTZ | | |

### lifecycle_rules
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| action | lifecycle_action (enum) | NOT NULL, DEFAULT 'sms' | |
| sms_template | TEXT | | |
| email_subject | TEXT | | |
| email_template | TEXT | | |
| coupon_type | coupon_type (enum) | | |
| coupon_value | DECIMAL(10,2) | | |
| coupon_expiry_days | INTEGER | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### lifecycle_executions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| appointment_id | UUID | FK → appointments(id) | |
| transaction_id | UUID | FK → transactions(id) | |
| status | TEXT | DEFAULT 'pending' | pending, sent, failed, skipped |
| created_at | TIMESTAMPTZ | | |

### conversations (Two-Way SMS)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| phone_number | TEXT | NOT NULL | |
| customer_id | UUID | FK → customers(id) | |
| status | TEXT | CHECK ('open','closed','archived') | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### messages
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| body | TEXT | NOT NULL | |
| status | TEXT | CHECK ('sent','delivered','failed','received') | |
| created_at | TIMESTAMPTZ | | |

### marketing_consent_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| action | consent_action (enum) | NOT NULL | |
| source | consent_source (enum) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### sms_consent_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| phone | TEXT | NOT NULL | |
| action | TEXT | CHECK ('opt_out','opt_in') | |
| keyword | TEXT | NOT NULL | |
| source | TEXT | CHECK ('inbound_sms','admin_manual','unsubscribe_page','booking_form','system') | |
| created_at | TIMESTAMPTZ | | |

### sms_delivery_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| status | TEXT | NOT NULL | queued, sent, delivered, undelivered, failed |
| customer_id | UUID | FK → customers(id) | |
| campaign_id | UUID | FK → campaigns(id) | |
| source | TEXT | NOT NULL | campaign, lifecycle, transactional, manual |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### email_delivery_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| mailgun_message_id | TEXT | | |
| to_email | TEXT | NOT NULL | |
| from_email | TEXT | NOT NULL | |
| subject | TEXT | | |
| event | TEXT | NOT NULL | delivered, failed, bounced, clicked, complained, unsubscribed |
| campaign_id | UUID | FK → campaigns(id) | |
| customer_id | UUID | FK → customers(id) | |
| error_code | TEXT | | |
| error_message | TEXT | | |
| click_url | TEXT | | Only for 'clicked' events |
| created_at | TIMESTAMPTZ | | |

### tracked_links
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| short_code | TEXT | NOT NULL, UNIQUE | |
| original_url | TEXT | NOT NULL | |
| customer_id | UUID | FK → customers(id) | |
| campaign_id | UUID | FK → campaigns(id) | |
| lifecycle_execution_id | UUID | FK → lifecycle_executions(id) | |
| source | TEXT | NOT NULL | campaign, lifecycle, manual |
| created_at | TIMESTAMPTZ | | |

### link_clicks
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| short_code | TEXT | NOT NULL | |
| original_url | TEXT | NOT NULL | |
| customer_id | UUID | FK → customers(id) | |
| campaign_id | UUID | FK → campaigns(id) | |
| lifecycle_execution_id | UUID | FK → lifecycle_executions(id) | |
| source | TEXT | NOT NULL | |
| clicked_at | TIMESTAMPTZ | | |
| ip_address | TEXT | | |
| user_agent | TEXT | | |

### short_links
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| code | TEXT | NOT NULL, UNIQUE | |
| created_at | TIMESTAMPTZ | | |

---

## Quotes

### quotes
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| quote_number | TEXT | UNIQUE, NOT NULL | Auto-generated |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| vehicle_id | UUID | FK → vehicles(id) | |
| status | quote_status (enum) | NOT NULL, DEFAULT 'draft' | |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### quote_items
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| quote_id | UUID | NOT NULL, FK → quotes(id) ON DELETE CASCADE | |
| quantity | INTEGER | NOT NULL, DEFAULT 1 | |
| total_price | DECIMAL(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### quote_communications
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| quote_id | UUID | NOT NULL, FK → quotes(id) ON DELETE CASCADE | |
| status | TEXT | CHECK ('sent','failed') | |
| created_at | TIMESTAMPTZ | | |

---

## Photos

### photos
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| appointment_id | UUID | FK → appointments(id) | |
| transaction_id | UUID | FK → transactions(id) | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| vehicle_id | UUID | FK → vehicles(id) | |
| type | photo_type (enum) | NOT NULL | |
| marketing_consent | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | | |

---

## Inventory & Purchasing

### purchase_orders
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| po_number | TEXT | UNIQUE, NOT NULL | Auto-generated 'PO-XXXXXX' |
| vendor_id | UUID | NOT NULL, FK → vendors(id) | |
| status | po_status (enum) | NOT NULL, DEFAULT 'draft' | |
| notes | TEXT | | |
| ordered_at | TIMESTAMPTZ | | |
| expected_at | TIMESTAMPTZ | | |
| received_at | TIMESTAMPTZ | | |
| subtotal | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| shipping_cost | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| created_by | UUID | FK → employees(id) | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### purchase_order_items
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| purchase_order_id | UUID | NOT NULL, FK → purchase_orders(id) ON DELETE CASCADE | |
| product_id | UUID | NOT NULL, FK → products(id) | |
| quantity_ordered | INTEGER | NOT NULL | |
| quantity_received | INTEGER | NOT NULL, DEFAULT 0 | |
| unit_cost | NUMERIC(10,2) | NOT NULL | |
| created_at | TIMESTAMPTZ | | |

### stock_adjustments
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| product_id | UUID | NOT NULL, FK → products(id) | |
| adjustment_type | TEXT | CHECK ('manual','received','sold','returned','damaged','recount') | |
| quantity_change | INTEGER | NOT NULL | |
| quantity_before | INTEGER | NOT NULL | |
| quantity_after | INTEGER | NOT NULL | |
| reason | TEXT | | |
| reference_id | UUID | | |
| reference_type | TEXT | CHECK ('purchase_order','transaction','refund') | |
| created_by | UUID | FK → employees(id) | |
| created_at | TIMESTAMPTZ | | |

### vendors
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | UNIQUE, NOT NULL | |
| email | TEXT | | |
| phone | TEXT | | |
| address | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### notification_recipients
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| email | TEXT | NOT NULL | |
| notification_type | TEXT | CHECK ('low_stock','all') | |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | |
| created_at | TIMESTAMPTZ | | |

### stock_alert_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| product_id | UUID | NOT NULL, FK → products(id) | |
| stock_level | INT | NOT NULL | |
| alert_type | TEXT | CHECK ('low_stock','out_of_stock') | |
| created_at | TIMESTAMPTZ | | |

---

## Employee Management

### time_records
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| employee_id | UUID | NOT NULL, FK → employees(id) ON DELETE CASCADE | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### employee_schedules
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| employee_id | UUID | NOT NULL, FK → employees(id) ON DELETE CASCADE | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### blocked_dates
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| employee_id | UUID | FK → employees(id) ON DELETE CASCADE | |
| created_at | TIMESTAMPTZ | | |

---

## Booking

### mobile_zones
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### waitlist_entries
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) | |
| status | TEXT | CHECK ('waiting','notified','booked','expired','cancelled') | |
| created_at | TIMESTAMPTZ | | |

### customer_payment_methods
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## Roles & Permissions

### roles
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | UNIQUE, NOT NULL | super_admin, admin, cashier, detailer |
| display_name | TEXT | NOT NULL | |
| description | TEXT | | |
| is_system | BOOLEAN | NOT NULL, DEFAULT false | |
| is_super | BOOLEAN | NOT NULL, DEFAULT false | |
| can_access_pos | BOOLEAN | NOT NULL, DEFAULT false | |
| can_access_admin | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### permission_definitions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| key | TEXT | UNIQUE, NOT NULL | e.g. 'pos.create_tickets' |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| category | TEXT | NOT NULL | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### permissions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| permission_key | TEXT | NOT NULL | |
| role | user_role (enum) | | NULL = user-level override |
| role_id | UUID | FK → roles(id) | |
| employee_id | UUID | FK → employees(id) ON DELETE CASCADE | NULL = role-level default |
| granted | BOOLEAN | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### route_access
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| role_id | UUID | NOT NULL, FK → roles(id) ON DELETE CASCADE | |
| route_pattern | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | | |
| UNIQUE | | (role_id, route_pattern) | |

---

## System & Settings

### business_settings
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| key | TEXT | UNIQUE, NOT NULL | |
| value | JSONB | NOT NULL | |
| description | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

**Known keys:** business_name, business_address, business_phone, business_hours, tax_rate, tax_products_only, tip_presets, cc_fee_rate, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_minimum, appointment_buffer_minutes, mobile_travel_buffer_minutes, cancellation_window_hours, receipt_email_enabled, receipt_sms_enabled, water_sku, ticker_enabled, ads_enabled, hero_carousel, announcement_tickers, ad_placements, seasonal_themes

### feature_flags
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| key | TEXT | UNIQUE, NOT NULL | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| enabled | BOOLEAN | NOT NULL, DEFAULT false | |
| config | JSONB | NOT NULL, DEFAULT '{}' | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### audit_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| employee_id | UUID | FK → employees(id) ON DELETE SET NULL | |
| action | TEXT | NOT NULL | |
| entity_type | TEXT | NOT NULL | |
| entity_id | UUID | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### idempotency_keys
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| key | TEXT | PK | |
| response | JSONB | NOT NULL | |
| status_code | INTEGER | NOT NULL, DEFAULT 201 | |
| created_at | TIMESTAMPTZ | | |

### qbo_sync_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| entity_type | TEXT | NOT NULL | |
| entity_id | UUID | NOT NULL | |
| action | TEXT | NOT NULL | |
| qbo_id | TEXT | | |
| status | TEXT | NOT NULL, DEFAULT 'pending' | |
| error_message | TEXT | | |
| request_payload | JSONB | | |
| response_payload | JSONB | | |
| created_at | TIMESTAMPTZ | | |
| duration_ms | INTEGER | | |

---

## Website / CMS

### website_pages
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| title | TEXT | NOT NULL | |
| slug | TEXT | NOT NULL, UNIQUE | |
| page_template | TEXT | CHECK ('content','landing','blank') | |
| parent_id | UUID | FK → website_pages(id) | |
| content | TEXT | DEFAULT '' | Rich HTML content |
| is_published | BOOLEAN | NOT NULL, DEFAULT false | |
| show_in_nav | BOOLEAN | NOT NULL, DEFAULT false | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| meta_title | TEXT | | |
| meta_description | TEXT | | |
| og_image_url | TEXT | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### website_navigation
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| placement | TEXT | CHECK ('header','footer_quick_links','footer_services') | |
| label | TEXT | NOT NULL | |
| url | TEXT | NOT NULL, DEFAULT '#' | |
| page_id | UUID | FK → website_pages(id) | |
| parent_id | UUID | FK → website_navigation(id) | |
| footer_column_id | UUID | FK → footer_columns(id) | Added later |
| target | TEXT | CHECK ('_self','_blank') | |
| icon | TEXT | | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### page_content_blocks
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| page_path | TEXT | NOT NULL | |
| page_type | TEXT | NOT NULL | |
| block_type | TEXT | CHECK ('rich_text','faq','features_list','cta','testimonial_highlight') | |
| title | TEXT | | |
| content | TEXT | NOT NULL | |
| sort_order | INT | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| ai_generated | BOOLEAN | NOT NULL, DEFAULT false | |
| ai_last_generated_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### page_seo
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| page_path | TEXT | UNIQUE, NOT NULL | |
| page_type | TEXT | CHECK (homepage, service_category, etc.) | |
| seo_title | TEXT | | |
| meta_description | TEXT | | |
| meta_keywords | TEXT | | |
| og_title | TEXT | | |
| og_description | TEXT | | |
| og_image_url | TEXT | | |
| canonical_url | TEXT | | |
| robots_directive | TEXT | DEFAULT 'index,follow' | |
| structured_data_overrides | JSONB | | |
| focus_keyword | TEXT | | |
| internal_links | JSONB | | |
| is_auto_generated | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | | |

### city_landing_pages
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| city_name | TEXT | NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | |
| state | TEXT | NOT NULL, DEFAULT 'CA' | |
| distance_miles | DECIMAL | | |
| heading | TEXT | | |
| intro_text | TEXT | | |
| service_highlights | JSONB | | |
| local_landmarks | TEXT | | |
| meta_title | TEXT | | |
| meta_description | TEXT | | |
| focus_keywords | TEXT | | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### hero_slides
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| title | TEXT | | |
| subtitle | TEXT | | |
| cta_text | TEXT | | |
| cta_url | TEXT | | |
| content_type | TEXT | CHECK ('image','video','before_after') | |
| image_url | TEXT | | |
| image_url_mobile | TEXT | | |
| image_alt | TEXT | | |
| video_url | TEXT | | |
| video_thumbnail_url | TEXT | | |
| before_image_url | TEXT | | |
| after_image_url | TEXT | | |
| before_label | TEXT | DEFAULT 'Before' | |
| after_label | TEXT | DEFAULT 'After' | |
| overlay_opacity | INTEGER | DEFAULT 40, CHECK 0-100 | |
| text_alignment | TEXT | CHECK ('left','center','right') | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### announcement_tickers
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| message | TEXT | NOT NULL | |
| link_url | TEXT | | |
| link_text | TEXT | | |
| placement | TEXT | CHECK ('top_bar','section') | |
| section_position | TEXT | | Changed from INT to TEXT |
| bg_color | TEXT | DEFAULT '#1e3a5f' | |
| text_color | TEXT | DEFAULT '#ffffff' | |
| scroll_speed | TEXT | CHECK ('slow','normal','fast') | |
| font_size | TEXT | CHECK ('xs','sm','base','lg') | |
| target_pages | JSONB | DEFAULT '["all"]' | |
| starts_at | TIMESTAMPTZ | | |
| ends_at | TIMESTAMPTZ | | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### seasonal_themes
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | |
| description | TEXT | | |
| color_overrides | JSONB | DEFAULT '{}' | |
| gradient_overrides | JSONB | DEFAULT '{}' | |
| particle_effect | TEXT | CHECK ('snowfall','fireworks','confetti','hearts','leaves','stars','sparkles') | |
| particle_intensity | INTEGER | DEFAULT 50, CHECK 0-100 | |
| particle_color | TEXT | | |

### site_theme_settings
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL, DEFAULT 'Custom Theme' | |
| is_active | BOOLEAN | NOT NULL, DEFAULT false | |
| mode | TEXT | CHECK ('dark','light') | |
| color_page_bg | TEXT | | |
| color_card_bg | TEXT | | |
| color_header_bg | TEXT | | |
| color_footer_bg | TEXT | | |
| color_section_alt_bg | TEXT | | |
| color_text_primary | TEXT | | |
| color_text_secondary | TEXT | | |
| color_text_muted | TEXT | | |
| color_text_on_primary | TEXT | | |

### ad_creatives
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| name | TEXT | NOT NULL | |
| image_url | TEXT | NOT NULL | |
| image_url_mobile | TEXT | | |
| link_url | TEXT | | |
| alt_text | TEXT | | |
| ad_size | TEXT | CHECK (standard IAB sizes) | |
| starts_at | TIMESTAMPTZ | | |
| ends_at | TIMESTAMPTZ | | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| impression_count | INTEGER | NOT NULL, DEFAULT 0 | |
| click_count | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### ad_placements
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| ad_creative_id | UUID | NOT NULL, FK → ad_creatives(id) ON DELETE CASCADE | |
| page_path | TEXT | NOT NULL | |
| zone_id | TEXT | NOT NULL | |
| device | TEXT | CHECK ('all','desktop','mobile') | |
| priority | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### ad_events
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| ad_creative_id | UUID | NOT NULL, FK → ad_creatives(id) ON DELETE CASCADE | |
| ad_placement_id | UUID | FK → ad_placements(id) | |
| event_type | TEXT | CHECK ('impression','click') | |
| page_path | TEXT | | |
| zone_id | TEXT | | |
| ip_hash | TEXT | | |
| created_at | TIMESTAMPTZ | | |

---

## Website Footer

### footer_sections
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| section_key | TEXT | UNIQUE, NOT NULL | 'main', 'service_areas', 'bottom_bar' |
| label | TEXT | NOT NULL | |
| is_enabled | BOOLEAN | DEFAULT true | |
| sort_order | INTEGER | DEFAULT 0 | |
| config | JSONB | DEFAULT '{}' | Section-specific config |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### footer_columns
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| section_id | UUID | NOT NULL, FK → footer_sections(id) ON DELETE CASCADE | |
| title | TEXT | NOT NULL, DEFAULT '' | |
| content_type | TEXT | CHECK ('links','html') | |
| html_content | TEXT | DEFAULT '' | Used when content_type = 'html' |
| sort_order | INTEGER | DEFAULT 0 | |
| is_enabled | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### footer_bottom_links
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| label | TEXT | NOT NULL | |
| url | TEXT | NOT NULL | |
| sort_order | INTEGER | DEFAULT 0 | |
| is_enabled | BOOLEAN | DEFAULT true | |
| open_in_new_tab | BOOLEAN | DEFAULT false | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

---

## Online Store (Orders)

### orders
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| order_number | TEXT | NOT NULL, UNIQUE | |
| customer_id | UUID | FK → customers(id) | |
| email | TEXT | NOT NULL | Captured at checkout |
| phone | TEXT | | |
| first_name | TEXT | NOT NULL | |
| last_name | TEXT | NOT NULL | |
| subtotal | INTEGER | NOT NULL | In cents |
| discount_amount | INTEGER | NOT NULL, DEFAULT 0 | |
| tax_amount | INTEGER | NOT NULL, DEFAULT 0 | |
| shipping_amount | INTEGER | NOT NULL, DEFAULT 0 | |
| total | INTEGER | NOT NULL | |
| coupon_id | UUID | FK → coupons(id) | |
| coupon_code | TEXT | | |
| created_at | TIMESTAMPTZ | | |

### order_items
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| order_id | UUID | NOT NULL, FK → orders(id) ON DELETE CASCADE | |
| product_id | UUID | FK → products(id) | |
| product_name | TEXT | NOT NULL | Snapshot |
| product_slug | TEXT | | |
| category_slug | TEXT | | |
| product_image_url | TEXT | | |
| unit_price | INTEGER | NOT NULL | In cents |
| quantity | INTEGER | NOT NULL | |
| line_total | INTEGER | NOT NULL | |
| discount_amount | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |

### order_events
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| order_id | UUID | NOT NULL, FK → orders(id) ON DELETE CASCADE | |
| event_type | TEXT | CHECK (created, paid, shipped, delivered, etc.) | |
| description | TEXT | NOT NULL, DEFAULT '' | |
| metadata | JSONB | | |
| created_by | UUID | FK → employees(id) | |
| created_at | TIMESTAMPTZ | | |

### shipping_settings
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| shippo_api_key_live | TEXT | | |
| shippo_api_key_test | TEXT | | |
| shippo_mode | TEXT | CHECK ('test','live') | |
| ship_from_name | TEXT | NOT NULL, DEFAULT '' | |
| ship_from_company | TEXT | | |
| ship_from_street1 | TEXT | NOT NULL, DEFAULT '' | |
| ship_from_street2 | TEXT | | |
| ship_from_city | TEXT | NOT NULL, DEFAULT '' | |
| ship_from_state | TEXT | NOT NULL, DEFAULT 'CA' | |
| ship_from_zip | TEXT | NOT NULL, DEFAULT '' | |
| ship_from_country | TEXT | NOT NULL, DEFAULT 'US' | |
| ship_from_phone | TEXT | | |
| ship_from_email | TEXT | | |

---

## Reference Data

### vehicle_categories
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| key | TEXT | NOT NULL, UNIQUE | Immutable: automobile, motorcycle, rv, boat, aircraft |
| display_name | TEXT | NOT NULL | Admin-editable display label |
| description | TEXT | | |
| image_url | TEXT | | Card image for booking flow category picker |
| image_alt | TEXT | | Alt text for the image |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Controls visibility in booking flow |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Fixed set of 5 categories — cannot be added or removed. Only metadata is editable. Seeded with automobile (1), motorcycle (2), rv (3), boat (4), aircraft (5). RLS: anon read active, authenticated read all, admin write. Trigger: update_updated_at().

### vehicle_makes
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | |
| category | TEXT | NOT NULL, DEFAULT 'automobile', CHECK IN (automobile, motorcycle, rv, boat, aircraft) | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

UNIQUE constraint on (name, category). Honda can exist as both automobile and motorcycle. Seeded with 45 automobile + 42 specialty makes (12 motorcycle, 10 RV, 10 boat, 10 aircraft). RLS: authenticated read, admin-only write.

---

## Key Triggers

| Trigger | Table | Function |
|---------|-------|----------|
| tr_transaction_receipt_number | transactions | generate_receipt_number() → 'SD-XXXXXX' |
| tr_po_number | purchase_orders | generate_po_number() → 'PO-XXXXXX' |
| Various _updated_at | Multiple | update_updated_at() |
| sync_product_primary_image | product_images | Syncs primary image to products.image_url |

---

## Key Enums (user-defined types)

- **user_role**: super_admin, admin, cashier, detailer
- **employee_status**: active, inactive, terminated
- **vehicle_type**: standard, truck_suv, suv_van, motorcycle, rv, boat, aircraft — For automobiles, stores the pricing size tier (standard/truck_suv/suv_van). For specialty vehicles, stores the category name (motorcycle/rv/boat/aircraft) and the actual pricing tier is in `vehicles.specialty_tier`.
- **vehicle_size_class**: sedan, truck_suv, suv_van
- **transaction_status**: open, completed, voided, refunded
- **transaction_item_type**: product, service, package
- **payment_method**: cash, card, split
- **refund_status**: pending, completed, failed
- **appointment_status**: pending, confirmed, in_progress, completed, cancelled, no_show
- **coupon_type**: (various)
- **coupon_status**: active, inactive, expired
- **loyalty_action**: earn, redeem, adjust, expire
- **campaign_status**: draft, scheduled, sending, sent, cancelled
- **lifecycle_action**: sms, email, both
- **consent_action**: (various)
- **consent_source**: (various)
- **photo_type**: (various)
- **po_status**: draft, ordered, partial, received, cancelled
- **quote_status**: draft, sent, accepted, declined, expired, converted

---

## Receipt-Related Fields Summary

Receipt settings are stored in `business_settings` as key-value pairs:
- `receipt_email_enabled` → JSONB boolean
- `receipt_sms_enabled` → JSONB boolean
- `business_name` → Company name for header
- `business_address` → `{line1, city, state, zip}` for header
- `business_phone` → Phone for header
- `receipt_config` → JSONB with full receipt branding config (see below)

### `receipt_config` JSONB structure (key: `receipt_config` in `business_settings`)

```jsonc
{
  "printer_ip": "192.168.1.100",     // Star TSP-100 IP
  "override_name": null,              // Override business name on receipt
  "override_phone": null,             // Override phone on receipt
  "override_address": null,           // Override address on receipt
  "override_email": null,             // Override email on receipt
  "override_website": null,           // Override website on receipt
  "logo_url": null,                   // Supabase storage URL
  "logo_width": 200,                  // px (100–400)
  "logo_placement": "above_name",     // above_name | below_name | above_footer
  "logo_alignment": "center",         // left | center | right
  "custom_text": null,                // Legacy single text (kept for backward compat)
  "custom_text_placement": "below_footer", // Legacy placement
  "custom_text_zones": [              // Multi-zone custom text with shortcodes
    {
      "id": "zone-1",
      "placement": "below_footer",    // below_header | above_footer | below_footer
      "content": "Thank you!\nYour advisor, {staff_first_name}",
      "enabled": true
    }
  ]
}
```

**Shortcodes** available in `custom_text_zones[].content`:
`{customer_name}`, `{customer_first_name}`, `{customer_type}`, `{customer_phone}`,
`{customer_email}`, `{customer_since}`, `{staff_name}`, `{staff_first_name}`,
`{receipt_number}`, `{transaction_date}`, `{total_amount}`, `{vehicle}`,
`{business_name}`, `{business_phone}`, `{business_email}`, `{business_website}`

**Files:** `src/lib/data/receipt-config.ts` (types + fetch), `src/app/pos/lib/receipt-template.ts` (renderers + shortcode resolver), `src/app/admin/settings/receipt-printer/page.tsx` (admin UI)
