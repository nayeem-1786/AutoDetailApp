# Smart Details Auto Spa — Database Schema Reference

> Auto-generated from `supabase/migrations/*.sql`
> Last updated: Mar 3, 2026

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
| retail_price | DECIMAL(10,2) | | Used as standard price reference |
| sale_price | DECIMAL(10,2) | DEFAULT NULL | CHECK: sale_price < retail_price. Added via `20260219000009` |
| sale_starts_at | TIMESTAMPTZ | DEFAULT NULL | Added via `20260219000009` |
| sale_ends_at | TIMESTAMPTZ | DEFAULT NULL | Added via `20260219000009` |
| quantity_on_hand | INTEGER | NOT NULL, DEFAULT 0 | |
| image_url | TEXT | | Synced from product_images primary |
| barcode | TEXT | | UPC/EAN for barcode scanner lookup |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_products_barcode` on `(barcode)` WHERE `barcode IS NOT NULL`

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
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### services
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| category_id | UUID | FK → service_categories(id) ON DELETE SET NULL | |
| pricing_model | pricing_model (enum) | NOT NULL | flat, vehicle_size, scope, specialty, per_unit, custom |
| classification | service_classification (enum) | NOT NULL, DEFAULT 'primary' | primary, addon_only, both |
| base_duration_minutes | INTEGER | NOT NULL, DEFAULT 60 | |
| flat_price | DECIMAL(10,2) | | For pricing_model = 'flat' |
| custom_starting_price | DECIMAL(10,2) | | For pricing_model = 'custom' |
| per_unit_price | DECIMAL(10,2) | | For pricing_model = 'per_unit' |
| per_unit_max | INTEGER | | Max units for per_unit |
| per_unit_label | TEXT | | e.g. 'panel', 'seat' |
| mobile_eligible | BOOLEAN | NOT NULL, DEFAULT false | Can be performed at customer location |
| online_bookable | BOOLEAN | NOT NULL, DEFAULT true | Available for online scheduling |
| staff_assessed | BOOLEAN | NOT NULL, DEFAULT false | Requires staff evaluation for pricing |
| is_taxable | BOOLEAN | NOT NULL, DEFAULT false | Services generally not taxed |
| vehicle_compatibility | JSONB | NOT NULL, DEFAULT '["standard"]' | Array of vehicle_type values |
| special_requirements | TEXT | | E.g. "Aviation-approved products only" |
| image_url | TEXT | | Supabase storage URL |
| image_alt | TEXT | | Alt text for image |
| sale_starts_at | TIMESTAMPTZ | DEFAULT NULL | Shared sale date range for all tiers. Added via `20260219000009` |
| sale_ends_at | TIMESTAMPTZ | DEFAULT NULL | Added via `20260219000009` |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** category_id, pricing_model, classification, is_active

**Sale pricing note:** `sale_starts_at` / `sale_ends_at` on `services` define the sale window for ALL tiers. The actual sale prices per tier are stored on `service_pricing.sale_price`. Flat-priced services (pricing_model = 'flat') have NO sale_price mechanism — they have no `service_pricing` rows and no sale_price column on `services` itself. To discount flat-priced add-ons, use `service_addon_suggestions.combo_price` instead.

### service_pricing
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | |
| tier_name | TEXT | NOT NULL | e.g. 'sedan', 'truck_suv_2row', scope tier names, specialty tier names |
| tier_label | TEXT | | Display label e.g. 'Floor Mats Only', 'Per Row' |
| price | DECIMAL(10,2) | NOT NULL | Standard price for this tier |
| sale_price | DECIMAL(10,2) | DEFAULT NULL | CHECK: sale_price < price. Added via `20260219000009` |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_vehicle_size_aware | BOOLEAN | NOT NULL, DEFAULT false | For scope tiers that vary by vehicle size |
| vehicle_size_sedan_price | DECIMAL(10,2) | | Only when is_vehicle_size_aware = true |
| vehicle_size_truck_suv_price | DECIMAL(10,2) | | Only when is_vehicle_size_aware = true |
| vehicle_size_suv_van_price | DECIMAL(10,2) | | Only when is_vehicle_size_aware = true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**UNIQUE:** (service_id, tier_name)
**Index:** service_id

**Pricing model → tier usage:**
- `vehicle_size`: 3 rows per service (sedan, truck_suv_2row, suv_3row_van)
- `scope`: N rows per service (custom tier names like 'floor_mats', 'complete_interior')
- `specialty`: N rows per service (vehicle-type tiers like 'single_engine', 'turboprop')
- `flat` / `per_unit` / `custom`: NO rows in service_pricing (price lives on `services` table)

### service_addon_suggestions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| primary_service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | The primary service being booked |
| addon_service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | The suggested add-on service |
| combo_price | DECIMAL(10,2) | DEFAULT NULL | Reduced price when paired (null = use add-on's standard price) |
| display_order | INTEGER | NOT NULL, DEFAULT 0 | Lower = higher priority |
| auto_suggest | BOOLEAN | NOT NULL, DEFAULT true | Show automatically during booking/POS |
| is_seasonal | BOOLEAN | NOT NULL, DEFAULT false | Only suggest during specific dates |
| seasonal_start | DATE | | Start date for seasonal suggestion |
| seasonal_end | DATE | | End date for seasonal suggestion |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**UNIQUE:** (primary_service_id, addon_service_id)
**CHECK:** primary_service_id != addon_service_id
**Indexes:** primary_service_id, addon_service_id

**Admin UI:** Fully managed via Admin > Catalog > Services > [service] > Add-Ons tab. Supports create/edit/delete of suggestions with combo_price, auto_suggest toggle, seasonal date ranges, and display ordering. Add-on service dropdown filters to classification = 'addon_only' or 'both' only.

**Combo pricing note:** This is the ONLY mechanism for discounting flat-priced add-on services. The `combo_price` is contextual — it applies only when the specific primary + add-on pair are on the same ticket.

**Seeded data (28 rows):** Combo prices set at ~20% discount: Headlight/Trim $100 (from $125), Engine Bay/Paint Decon $140 (from $175), Pet Hair/Leather/Ozone $60 (from $75). Hot Shampoo Extraction has NULL combo_price (multi-tier scope pricing — owner configures per-tier discounts in admin). All rows have `auto_suggest = true`. Seeded via migration `20260225000002`.

### service_prerequisites
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | The service being booked |
| prerequisite_service_id | UUID | NOT NULL, FK → services(id) ON DELETE CASCADE | The required service |
| enforcement | prerequisite_enforcement (enum) | NOT NULL | required_same_ticket, required_history, recommended |
| history_window_days | INTEGER | | For required_history: how recent (e.g. 30 days) |
| warning_message | TEXT | | Custom message shown when prerequisite not met |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Admin UI:** Managed via Admin > Catalog > Services > [service] > Prerequisites tab.

**POS enforcement:** Checked via `POST /api/pos/services/check-prerequisites` before adding services to tickets/quotes. OR logic — any ONE prerequisite met satisfies the requirement. Warning dialog offers: add prerequisite to ticket, override (requires `pos.override_prerequisites` permission), or cancel.

**Enforcement types:**
- `required_same_ticket` — Must be on the same ticket (only checks current ticket, not history)
- `required_history` — Must exist in customer+vehicle service history within `history_window_days`
- `recommended` — System shows warning but allows proceeding without override permission

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
| access_token | UUID | NOT NULL, UNIQUE, DEFAULT gen_random_uuid() | Token for public receipt link |
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
| standard_price | DECIMAL(10,2) | DEFAULT NULL | Catalog price before sale/combo discount |
| pricing_type | TEXT | DEFAULT 'standard' | standard, sale, or combo |
| is_addon | BOOLEAN | DEFAULT false | Whether item is an add-on to another service |
| prerequisite_note | TEXT | DEFAULT NULL | Prereq context: "Prereq met: ..." or "Prereq overridden by ..." |
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
| tags | TEXT[] | NOT NULL, DEFAULT '{}' | Manual tags for gallery categorization. GIN indexed. |
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
| combinable_with_sales | BOOLEAN | NOT NULL, DEFAULT true | Added via `20260219000009` |
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

**Known keys:** business_name, business_address, business_phone, business_hours, business_email, business_website, business_description, business_latitude, business_longitude, service_area_name, service_area_radius, price_range, tax_rate, tax_products_only, tip_presets, cc_fee_rate, loyalty_earn_rate, loyalty_redeem_rate, loyalty_redeem_minimum, appointment_buffer_minutes, mobile_travel_buffer_minutes, cancellation_window_hours, receipt_email_enabled, receipt_sms_enabled, receipt_config, water_sku, ticker_enabled, ads_enabled, hero_carousel, announcement_tickers, ad_placements, seasonal_themes, homepage_team_heading, homepage_credentials_heading, homepage_differentiators, google_place_id, homepage_cta_before_image, homepage_cta_after_image, sms_daily_cap_per_customer, homepage_hero_tagline, homepage_cta_title, homepage_cta_description, homepage_cta_button_text, homepage_services_description, services_page_description, default_deposit_amount, quote_validity_days

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

---

## Website CMS

### cms_pages (table: `website_pages`)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| slug | TEXT | UNIQUE, NOT NULL | |
| title | TEXT | NOT NULL | |
| page_template | TEXT | CHECK ('content','landing','blank') | |
| parent_id | UUID | FK → website_pages(id) | |
| content | TEXT | | HTML content |
| is_published | BOOLEAN | DEFAULT false | |
| show_in_nav | BOOLEAN | DEFAULT false | Auto-creates header nav entry |
| sort_order | INTEGER | DEFAULT 0 | |
| meta_title | TEXT | | SEO title |
| meta_description | TEXT | | SEO description |
| og_image_url | TEXT | | OpenGraph image |
| preview_token | TEXT | | Short-lived preview token (UUID) |
| preview_token_expires_at | TIMESTAMPTZ | | Token expiry (1 hour from generation) |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### page_revisions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| page_id | UUID | NOT NULL, FK → website_pages(id) ON DELETE CASCADE | |
| revision_number | INTEGER | NOT NULL | Sequential per page |
| snapshot | JSONB | NOT NULL | Full page data + content blocks at time of save |
| change_summary | TEXT | | Auto-generated: "Updated title, added 2 blocks" |
| created_by | UUID | FK → employees(id) | Who saved |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

**Index:** `idx_page_revisions_page_id` on `(page_id, revision_number DESC)`.
**RLS:** Authenticated read/insert/delete. Auto-pruned to last 20 per page.

### page_content_blocks
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| page_path | TEXT | NOT NULL | Page path (e.g. `/p/about`). `__global__` for global blocks |
| page_type | TEXT | NOT NULL | 'page', 'city', 'global' |
| block_type | TEXT | CHECK constraint | 'rich_text', 'faq', 'features_list', 'cta', 'testimonial_highlight', 'team_grid', 'credentials', 'terms_sections', 'gallery' |
| title | TEXT | | Optional section title |
| content | TEXT | NOT NULL | Block content (HTML or JSON depending on type) |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| is_global | BOOLEAN | NOT NULL, DEFAULT false | If true, block can be shared across pages via placements |
| global_name | TEXT | | Human-readable name for global blocks (e.g. "Company FAQ") |
| ai_generated | BOOLEAN | DEFAULT false | |
| ai_last_generated_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**RLS:** Public read (active only), authenticated full access.

### page_block_placements
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| page_path | TEXT | NOT NULL | Page using this global block |
| page_type | TEXT | NOT NULL, DEFAULT 'page' | |
| block_id | UUID | NOT NULL, FK → page_content_blocks(id) ON DELETE CASCADE | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Position on the page |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `idx_page_block_unique` UNIQUE(page_path, block_id), `idx_page_block_path` (page_path, sort_order).
**RLS:** Public read, authenticated full access.

### announcement_tickers
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| message | TEXT | NOT NULL | Ticker text (supports inline HTML) |
| link_url | TEXT | | Optional CTA link |
| link_text | TEXT | | Optional link label |
| placement | TEXT | NOT NULL, DEFAULT 'top_bar', CHECK ('top_bar','section') | |
| section_position | TEXT | | Position for section tickers (e.g. 'before_footer') |
| bg_color | TEXT | DEFAULT '#1e3a5f' | |
| text_color | TEXT | DEFAULT '#ffffff' | |
| scroll_speed | TEXT | DEFAULT 'normal', CHECK ('slow','normal','fast') | Legacy enum |
| scroll_speed_value | INTEGER | DEFAULT 50 | Slider 1-100, overrides enum |
| message_gap | NUMERIC | NOT NULL, DEFAULT 5 | Space in rem between repeated copies in marquee |
| font_size | TEXT | DEFAULT 'sm', CHECK ('xs','sm','base','lg') | |
| target_pages | JSONB | DEFAULT '["all"]' | Page types to show on |
| starts_at | TIMESTAMPTZ | | Schedule start |
| ends_at | TIMESTAMPTZ | | Schedule end |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Index:** `idx_tickers_active` on `(is_active, placement, sort_order)` WHERE `is_active = true`.
**RLS:** Public read (active only), authenticated full access.

### homepage_config
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| page_type | TEXT | CHECK (homepage, service_category, etc.) | |
| service_highlights | JSONB | | |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### ad_creatives
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| created_at | TIMESTAMPTZ | | |

### ad_placements
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| created_at | TIMESTAMPTZ | | |

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

### team_members
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | Auto-generated from name (kebab-case) |
| role | TEXT | NOT NULL | |
| bio | TEXT | | HTML content |
| excerpt | TEXT | | Short 1-2 line summary for homepage display |
| photo_url | TEXT | | |
| years_of_service | INTEGER | | |
| certifications | JSONB | DEFAULT '[]' | Array of strings |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Auto-updated via trigger |

**RLS:** Public read (active only), authenticated full access.
**Migrated from:** `business_settings.team_members` JSON array.

### credentials
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| title | TEXT | NOT NULL | |
| description | TEXT | | HTML content |
| image_url | TEXT | | Badge/logo image |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Auto-updated via trigger |

**RLS:** Public read (active only), authenticated full access.
**Migrated from:** `page_content_blocks` where `block_type = 'credentials'` (JSON array).

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

### vehicle_makes
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | UNIQUE, NOT NULL | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

Seeded with 45 common makes. Used in POS, admin, booking, and customer portal vehicle dropdowns. RLS: authenticated read, admin-only write.

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
- **vehicle_type**: standard, motorcycle, rv, boat, aircraft
- **vehicle_size_class**: sedan, truck_suv_2row, suv_3row_van
- **pricing_model**: flat, vehicle_size, scope, specialty, per_unit, custom
- **service_classification**: primary, addon_only, both
- **prerequisite_enforcement**: required_same_ticket, required_history, recommended
- **transaction_status**: open, completed, voided, refunded, partial_refund
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
  "printer_ip": "192.168.1.100",     // Star TSP-100 WebPRNT IP (legacy)
  "print_server_url": "http://192.168.1.174:8080", // Local print server URL for ESC/POS
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

---

## Email Template System

### email_layouts
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | "Standard", "Minimal", "Promotional" |
| slug | TEXT | UNIQUE, NOT NULL | `standard`, `minimal`, `promotional` |
| description | TEXT | | Use case description |
| structure_html | TEXT | NOT NULL | HTML skeleton with `{{PLACEHOLDER}}` slots |
| color_overrides | JSONB | NOT NULL, DEFAULT '{}' | Layout-specific color overrides (layered on Brand Kit) |
| header_config | JSONB | NOT NULL, DEFAULT '{}' | `{ show_logo, logo_position, show_title, title_style }` |
| footer_config | JSONB | NOT NULL, DEFAULT '{}' | `{ show_social, compact, custom_text }` |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | One layout marked default |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Trigger: `update_updated_at()` |

3 system layouts seeded: Standard (default), Minimal, Promotional. Cannot be deleted.

### email_templates
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| template_key | TEXT | UNIQUE | NULL for custom; `booking_confirmation`, `review_request`, etc. for system |
| category | TEXT | NOT NULL, CHECK IN ('transactional','review','marketing','notification') | |
| name | TEXT | NOT NULL | Human-readable: "Booking Confirmation" |
| subject | TEXT | NOT NULL | Subject line with {variables} |
| preview_text | TEXT | NOT NULL, DEFAULT '' | 90-char inbox snippet |
| layout_id | UUID | NOT NULL, FK → email_layouts(id) ON DELETE RESTRICT | |
| body_blocks | JSONB | NOT NULL, DEFAULT '[]' | `[{ id, type, data }]` |
| body_html | TEXT | | Cached compiled HTML (regenerated on save) |
| variables | JSONB | NOT NULL, DEFAULT '[]' | Available variables for this template |
| segment_tag | TEXT | | NULL = universal; 'luxury', 'ceramic', etc. |
| is_system | BOOLEAN | NOT NULL, DEFAULT false | System templates can't be deleted |
| is_customized | BOOLEAN | NOT NULL, DEFAULT false | Edited from default → true |
| version | INTEGER | NOT NULL, DEFAULT 1 | Incremented on each save |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Trigger: `update_updated_at()` |
| updated_by | UUID | FK → auth.users(id) ON DELETE SET NULL | |

### email_template_assignments
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| trigger_key | TEXT | NOT NULL | `order_shipped`, `review_request`, `job_completion`, etc. |
| template_id | UUID | NOT NULL, FK → email_templates(id) ON DELETE CASCADE | |
| segment_filter | JSONB | | `{ vehicle_category: 'luxury' }` — optional |
| priority | INTEGER | NOT NULL, DEFAULT 0 | Higher priority wins |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### drip_sequences
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| trigger_condition | TEXT | NOT NULL, CHECK IN ('no_visit_days','after_service','new_customer','manual_enroll','tag_added') | |
| trigger_value | JSONB | | `{ days: 30 }`, `{ service_id: uuid }`, `{ tag: "vip" }` |
| stop_conditions | JSONB | NOT NULL, DEFAULT `{"on_purchase":true,"on_booking":true,"on_reply":false}` | |
| nurture_sequence_id | UUID | FK → drip_sequences(id) ON DELETE SET NULL | On stop, enroll here |
| is_active | BOOLEAN | NOT NULL, DEFAULT false | |
| audience_filters | JSONB | | Same format as campaigns |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Trigger: `update_updated_at()` |
| created_by | UUID | FK → auth.users(id) ON DELETE SET NULL | |

### drip_steps
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| sequence_id | UUID | NOT NULL, FK → drip_sequences(id) ON DELETE CASCADE | |
| step_order | INTEGER | NOT NULL | 0, 1, 2, 3... |
| delay_days | INTEGER | NOT NULL | Days after previous step (or trigger for step 0) |
| delay_hours | INTEGER | NOT NULL, DEFAULT 0 | Fine-tuned timing |
| channel | TEXT | NOT NULL, CHECK IN ('email','sms','both') | |
| template_id | UUID | FK → email_templates(id) ON DELETE SET NULL | |
| sms_template | TEXT | | SMS body with {variables} |
| coupon_id | UUID | FK → coupons(id) ON DELETE SET NULL | Optional per-step coupon |
| subject_override | TEXT | | Override template subject |
| exit_condition | TEXT | | Per-step: `has_transaction`, `has_appointment`, `opened_email`, `clicked_link` |
| exit_action | TEXT | CHECK IN ('stop','move','tag') | |
| exit_sequence_id | UUID | FK → drip_sequences(id) ON DELETE SET NULL | For exit_action = 'move' |
| exit_tag | TEXT | | For exit_action = 'tag' |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### drip_enrollments
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| sequence_id | UUID | NOT NULL, FK → drip_sequences(id) ON DELETE CASCADE | |
| customer_id | UUID | NOT NULL, FK → customers(id) ON DELETE CASCADE | |
| current_step | INTEGER | NOT NULL, DEFAULT 0 | |
| enrolled_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| next_send_at | TIMESTAMPTZ | | Calculated from cumulative delays |
| status | TEXT | NOT NULL, CHECK IN ('active','completed','stopped','paused') | |
| stopped_reason | TEXT | | `purchased`, `booked`, `replied`, `manual`, `unsubscribed` |
| stopped_at | TIMESTAMPTZ | | |
| nurture_transferred | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| UNIQUE | | (sequence_id, customer_id) | One enrollment per customer per sequence |

### drip_send_log
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, default gen_random_uuid() | |
| enrollment_id | UUID | NOT NULL, FK → drip_enrollments(id) ON DELETE CASCADE | |
| step_id | UUID | NOT NULL, FK → drip_steps(id) ON DELETE CASCADE | |
| step_order | INTEGER | NOT NULL | Denormalized for funnel queries |
| channel | TEXT | NOT NULL | |
| status | TEXT | NOT NULL, CHECK IN ('sent','failed','skipped') | |
| mailgun_message_id | TEXT | | For delivery/open/click tracking |
| coupon_code | TEXT | | Generated coupon if applicable |
| sent_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| error_message | TEXT | | |

### Altered tables (Email Template System)

**lifecycle_rules** — added:
| Column | Type | Notes |
|--------|------|-------|
| email_template_id | UUID | FK → email_templates(id) ON DELETE SET NULL |

**campaigns** — added:
| Column | Type | Notes |
|--------|------|-------|
| email_body_blocks | JSONB | Block-based email content (copy model) |
| email_layout_id | UUID | FK → email_layouts(id) ON DELETE SET NULL |
| email_preview_text | TEXT | Inbox preview snippet |

### Brand Kit (business_settings keys)

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `email_brand_primary_color` | string | `#1a1a2e` | Header bg, primary buttons |
| `email_brand_accent_color` | string | `#CCFF00` | Secondary buttons, highlights |
| `email_brand_text_color` | string | `#333333` | Body text |
| `email_brand_bg_color` | string | `#f5f5f5` | Outer background |
| `email_brand_font_family` | string | `Arial, Helvetica, sans-serif` | Email-safe fonts only |
| `email_brand_logo_url` | string | `""` | Empty = use receipt_config logo |
| `email_brand_logo_width` | number | `200` | Logo width in px |
| `email_brand_social_google` | string | `""` | Google Business URL |
| `email_brand_social_yelp` | string | `""` | Yelp page URL |
| `email_brand_social_instagram` | string | `""` | Instagram URL |
| `email_brand_social_facebook` | string | `""` | Facebook URL |
| `email_brand_footer_text` | string | `""` | Optional custom footer line |

### RLS Policies

All email template tables have RLS enabled. Write access is service-role only (via API routes). Read access for authenticated users:

| Table | Policy | Access |
|-------|--------|--------|
| email_layouts | `email_layouts_select` | SELECT for authenticated |
| email_templates | `email_templates_select` | SELECT for authenticated |
| email_template_assignments | `email_template_assignments_select` | SELECT for authenticated |
| drip_sequences | `drip_sequences_select` | SELECT for authenticated |
| drip_steps | `drip_steps_select` | SELECT for authenticated |
| drip_enrollments | `drip_enrollments_select` | SELECT for authenticated |
| drip_send_log | `drip_send_log_select` | SELECT for authenticated |

**Files:** `src/lib/email/types.ts` (types), `src/lib/email/block-renderers.ts` (11 block renderers), `src/lib/email/layout-renderer.ts` (full pipeline), `src/lib/email/photo-resolver.ts` (dynamic photo pairs), `src/lib/email/template-resolver.ts` (segment routing), `src/lib/email/send-templated-email.ts` (high-level send), `src/lib/email/variables.ts` (variable definitions)
