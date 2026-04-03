# Template Variable Audit — Complete Master List

> Definitive inventory of every template variable across SMS, email, lifecycle, drip, and campaign systems.
> Audited: 2026-04-03

---

## Architecture Summary

- **Single core renderer:** `renderTemplate()` in `src/lib/utils/template.ts` — regex `/\{(\w+)\}/g`
- **SMS wrapper:** `renderSmsTemplate()` in `src/lib/sms/render-sms-template.ts` — adds auto-injection + fallbacks + line cleanup
- **Email wrapper:** `sendTemplatedEmail()` in `src/lib/email/send-templated-email.ts` — adds template resolution + brand kit + layout
- **Variable format:** `{variable_name}` (single curly braces) — all systems
- **`variables` JSONB on `sms_templates`:** Purely cosmetic for admin UI chips. Does NOT control rendering.
- **Rendering is permission-permissive:** Caller can pass ANY variables. Unreplaced `{key}` → fallback or stripped with warning.

---

## Variable Definition Locations

| Location | Purpose |
|----------|---------|
| `src/lib/sms/sms-template-variables.ts` | SMS admin UI chips (per-template) |
| `src/lib/email/variables.ts` | Email admin UI chips (per-category) |
| `src/lib/utils/template.ts` → `VARIABLE_GROUPS` | Campaign/automation UI chips |
| `src/lib/sms/render-sms-template.ts` → `DEFAULT_VARIABLE_FALLBACKS` | SMS fallback safety net |

---

## Complete Variable Table (61 unique variables)

| # | Variable | Output Example | Format | Source | SMS Templates | Email Templates | Lifecycle/Drip/Campaign | Defined In | Fallback |
|---|----------|---------------|--------|--------|--------------|----------------|------------------------|------------|----------|
| 1 | `{first_name}` | "Nayeem" | Raw string | `customer.first_name` | All customer-facing (14 of 15) | All | Yes/Yes/Yes | sms-vars, email/vars, template.ts, FALLBACKS | `"there"` |
| 2 | `{last_name}` | "Khan" | Raw string | `customer.last_name` | None (not in SMS templates) | All | Yes/Yes/Yes | email/vars, template.ts | none |
| 3 | `{customer_name}` | "Nayeem Khan" | Composed | `` `${first_name} ${last_name}`.trim() `` | quote_accepted_staff_notify, booking_staff_notify | All | No/No/No | sms-vars, email/vars, FALLBACKS | `"Valued Customer"` |
| 4 | `{business_name}` | "Smart Details Auto Spa" | Raw string | `getBusinessInfo().name` | All (auto-injected) | All (auto-injected) | Yes/Yes/Yes | sms-vars, email/vars, template.ts | Auto-injected, never missing |
| 5 | `{business_phone}` | "(424) 401-0094" | Formatted phone | `getBusinessInfo().phone` or SMS override | All (auto-injected) | All (auto-injected) | Yes/Yes/Yes | sms-vars, email/vars, template.ts | Auto-injected |
| 6 | `{business_address}` | "2021 Lomita Blvd, Lomita, CA 90717" | One-line address | `getBusinessInfo().address` | job_complete, detailer_job_assigned (auto-injected) | All (auto-injected) | Yes/Yes/Yes | sms-vars, email/vars, template.ts | Auto-injected |
| 7 | `{business_email}` | "info@smartdetails.com" | Raw string | `getBusinessInfo().email` | None | All (auto-injected) | No/No/No | email/vars | Auto-injected |
| 8 | `{business_website}` | "https://smartdetailsautospa.com" | URL | `getBusinessInfo().website` | None | All (auto-injected) | No/No/No | email/vars | Auto-injected |
| 9 | `{appointment_date}` | "Monday, April 7, 2026" | Weekday, Month Day, Year | `new Date(scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })` | appointment_confirmed, booking_confirmed, appointment_cancelled, booking_staff_notify, detailer_job_assigned | Transactional | Yes/No/No | sms-vars, email/vars, template.ts, FALLBACKS | `"your scheduled date"` |
| 10 | `{appointment_time}` | "10:30 AM" | h:mm AM/PM | Manual 24h-to-12h conversion from `scheduled_start_time` | appointment_confirmed, booking_confirmed, appointment_cancelled, booking_reminder, booking_staff_notify, detailer_job_assigned | Transactional | Yes/No/No | sms-vars, email/vars, template.ts, FALLBACKS | `"your scheduled time"` |
| 11 | `{service_name}` | "Ceramic Coating" | Raw string (singular) | Primary service name or first service | appointment_confirmed, booking_reminder, addon_approved, addon_declined | Transactional, Review | Yes/No/Yes | sms-vars, email/vars, template.ts, FALLBACKS | `"your service"` |
| 12 | `{services}` | "Ceramic Coating, Interior Detail" | Comma-joined list | `appointment_services.map(s => s.service.name).join(', ')` | booking_confirmed, appointment_cancelled, booking_staff_notify, quote_accepted_staff_notify, detailer_job_assigned | None (uses `services_list`) | Yes/No/No | sms-vars, FALLBACKS | `"your scheduled services"` |
| 13 | `{services_list}` | "Ceramic Coating, Interior Detail" | Comma-joined list | Same source as `{services}` | None | Transactional | No/No/No | email/vars | none |
| 14 | `{service_total}` | "$299.00" | Formatted currency | `formatCurrency(appointment.total_amount)` | appointment_confirmed, booking_confirmed, quote_accepted_staff_notify, detailer_job_assigned | None (uses `appointment_total`) | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 15 | `{appointment_total}` | "$299.00" | Formatted currency | `formatCurrency(appointment.total_amount)` | None | Transactional | No/No/No | email/vars | none |
| 16 | `{vehicle_description}` | "2024 Tesla Model 3" | `cleanVehicleDescription({year, make, model})` | Vehicle record | booking_confirmed, job_complete, detailer_job_assigned | None (uses `vehicle_info`) | No/No/No | sms-vars, FALLBACKS | `"your vehicle"` |
| 17 | `{vehicle_info}` | "2024 Tesla Model 3" | `cleanVehicleDescription({year, make, model})` | Same source as `vehicle_description` | None | Transactional, Review | Yes/No/No | email/vars, template.ts | none |
| 18 | `{vehicle_type}` | "motorcycle" | Raw string | `vehicle.vehicle_category` | None (in FALLBACKS only) | None | No/No/No | FALLBACKS only | `"your vehicle"` |
| 19 | `{gallery_link}` | "https://sdas.co/g5678" | Shortened URL | `createShortLink(galleryUrl)` | job_complete | None | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 20 | `{gallery_url}` | "https://app.com/jobs/{token}/photos" | Full URL | `${appUrl}/jobs/${galleryToken}/photos` | None | Transactional | No/No/No | email/vars | none |
| 21 | `{short_url}` | "https://sdas.co/q1234" | Shortened URL | `createShortLink(quoteUrl)` | quote_reminder, quote_viewed_followup | None | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 22 | `{hours_line}` | "Open today until 6:00 PM" | Conditional string | Manual construction from business hours | job_complete | None | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 23 | `{address}` | "123 Main St, Torrance, CA" | Raw string | `appointment.mobile_address` | detailer_job_assigned | None | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 24 | `{item_name}` | "Ceramic Coating" | Raw string (singular) | `quoteItems[0].item_name` | quote_accepted_single | None | No/No/No | sms-vars, FALLBACKS | `"your selected service"` |
| 25 | `{quote_number}` | "001234" | Raw string | `quote.quote_number` | quote_accepted_staff_notify | Quote emails | No/No/No | sms-vars, email/vars, FALLBACKS | `"your quote"` |
| 26 | `{detailer_first_name}` | "Mike" | Raw string | `employee.first_name` | appointment_confirmed, booking_confirmed, job_complete, detailer_job_assigned | None | No/No/No | sms-vars, FALLBACKS | `"your detailer"` |
| 27 | `{deposit_info}` | "Deposit paid." or "Pay on site." | Conditional string | Logic based on payment_status | booking_staff_notify | None | No/No/No | sms-vars, FALLBACKS | `""` (line removed) |
| 28 | `{booking_url}` | "https://app.com/book" | URL | `${SITE_URL}/book` | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 29 | `{book_url}` | "https://app.com/book?name=John&phone=..." | Personalized URL | `${SITE_URL}/book?name=...&phone=...&coupon=...` | None | Marketing | Yes/Yes/Yes | template.ts | none |
| 30 | `{offer_url}` | "https://app.com/products/..." or "https://app.com/book?service=..." | Smart-routed URL | Product-targeted -> product page; else -> booking with service/coupon | None | Marketing | Yes/No/Yes | template.ts | none |
| 31 | `{book_now_url}` | Same as `{offer_url}` | URL alias | `= offer_url` (backward compat) | None | Marketing | Yes/No/Yes | template.ts | none |
| 32 | `{google_review_link}` | "https://sdas.co/gR3v" | Shortened URL | `createShortLink(googleReviewUrl)` | None | Review | Yes/No/Yes | email/vars, template.ts | none |
| 33 | `{yelp_review_link}` | "https://sdas.co/yR5k" | Shortened URL | `createShortLink(yelpReviewUrl)` | None | Review | Yes/No/Yes | email/vars, template.ts | none |
| 34 | `{unsubscribe_url}` | "https://app.com/unsubscribe/{id}" | URL | `${SITE_URL}/unsubscribe/${customerId}` | None | All (auto-injected in layout) | No/No/No | email/vars | none |
| 35 | `{loyalty_points}` | "500" | `formatNumber()` | `customer.loyalty_points_balance` | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 36 | `{loyalty_value}` | "$5.00" | `formatDollar()` | `loyalty_points * redeem_rate` | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 37 | `{visit_count}` | "12" | `formatNumber()` | `customer.visit_count` | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 38 | `{days_since_last_visit}` | "45" or "a while" | Computed string | `Math.floor((now - last_visit_date) / 86400000)` or `"a while"` if null | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 39 | `{lifetime_spend}` | "$2,340" | `formatDollar()` | `customer.lifetime_spend` | None | Marketing, Review | Yes/Yes/Yes | email/vars, template.ts | none |
| 40 | `{amount_paid}` | "$149.00" | `formatDollar()` | `payment.amount` or `transaction.total_amount` | None | Transactional | Yes/No/No | email/vars, template.ts | none |
| 41 | `{coupon_code}` | "SAVE15" or "A3X9K2P1" | Raw string | Generated per-customer or from campaign coupon | None | Marketing | Yes/Yes/Yes | email/vars, template.ts | none |
| 42 | `{cancellation_reason}` | "Customer requested reschedule" | Raw string | `appointment.cancellation_reason` | None | Transactional | No/No/No | email/vars | none |
| 43 | `{timer_display}` | "2h 15m" | Duration string | Computed from `job.timer_seconds` | None | Transactional | No/No/No | email/vars | none |
| 44 | `{order_number}` | "ORD-001234" | Raw string | `order.order_number` | None | Order emails | No/No/No | email/vars | none |
| 45 | `{tracking_url}` | "https://track.ups.com/..." | URL | `order.tracking_url` | None | Order emails | No/No/No | email/vars | none |
| 46 | `{tracking_number}` | "1Z999AA10123456784" | Raw string | `order.tracking_number` | None | Order emails | No/No/No | email/vars | none |
| 47 | `{shipping_carrier}` | "UPS" | Raw string | `order.shipping_carrier` | None | Order emails | No/No/No | email/vars | none |
| 48 | `{refund_amount}` | "$49.99" | `formatDollar()` | `refund.amount` | None | Order emails | No/No/No | email/vars | none |
| 49 | `{refund_type}` | "full" or "partial" | Raw string | Computed from refund vs order total | None | Order emails | No/No/No | email/vars | none |
| 50 | `{items_table}` | `<table>...</table>` | Pre-rendered HTML | `itemsTable(order.items)` | None | Order emails | No/No/No | email/vars | none |
| 51 | `{quote_date}` | "3/15/2026" | Short date | Quote created_at formatted | None | Quote emails | No/No/No | email/vars | none |
| 52 | `{quote_link}` | "https://app.com/quote/abc123" | URL | `${SITE_URL}/quote/${access_token}` | None | Quote emails | No/No/No | email/vars | none |
| 53 | `{quote_subtotal}` | "$450.00" | `formatDollar()` | `quote.subtotal` | None | Quote emails | No/No/No | email/vars | none |
| 54 | `{quote_tax}` | "$42.19" | `formatDollar()` | `quote.tax_amount` | None | Quote emails | No/No/No | email/vars | none |
| 55 | `{quote_total}` | "$492.19" | `formatDollar()` | `quote.total_amount` | None | Quote emails | No/No/No | email/vars | none |
| 56 | `{validity_days}` | "10" | Raw number string | `business_settings.quote_validity_days` | None | Quote emails | No/No/No | email/vars | none |
| 57 | `{products_table}` | `<table>...</table>` | Pre-rendered HTML | `buildProductsTable(lowStock, outOfStock)` | None | Stock alert email | No/No/No | email/vars | none |
| 58 | `{admin_products_url}` | "https://app.com/admin/catalog/products?stock=low-stock" | URL | Constructed from SITE_URL | None | Stock alert email | No/No/No | email/vars | none |
| 59 | `{low_stock_count}` | "3" | Raw number string | `lowStockToAlert.length` | None | Stock alert email | No/No/No | email/vars | none |
| 60 | `{out_of_stock_count}` | "1" | Raw number string | `outOfStockToAlert.length` | None | Stock alert email | No/No/No | email/vars | none |
| 61 | `{total_count}` | "4" | Raw number string | `lowStock + outOfStock` | None | Stock alert email | No/No/No | email/vars | none |

---

## True Duplicates (Same Output, Different Names)

| Pair | Notes |
|------|-------|
| `{services}` (SMS) = `{services_list}` (email) | Identical comma-joined output. Different names across SMS vs email. |
| `{service_total}` (SMS) = `{appointment_total}` (email) | Same `formatCurrency(total_amount)`. Different names across channels. |
| `{vehicle_description}` (SMS) = `{vehicle_info}` (email) | Both use `cleanVehicleDescription()`. Different names across channels. |
| `{offer_url}` = `{book_now_url}` | Exact alias. `book_now_url` is a backward-compat copy. |

---

## Near-Duplicates (Similar Name, Different Output)

| Variable | What It Is | Distinction |
|----------|-----------|-------------|
| `{service_name}` | Single primary service: "Ceramic Coating" | Singular -- one service |
| `{services}` / `{services_list}` | All services comma-joined: "Ceramic Coating, Interior Detail" | Plural -- all services |
| `{item_name}` | First quote item name: "Ceramic Coating" | Quote-specific singular |
| `{booking_url}` | Generic: `/book` | No query params |
| `{book_url}` | Personalized: `/book?name=...&phone=...&coupon=...` | Pre-fills customer info |
| `{offer_url}` | Smart-routed: product page OR booking with service | Product-aware routing |
| `{address}` | Mobile service location: "123 Main St, Torrance" | Customer's address for mobile jobs |
| `{business_address}` | Store address: "2021 Lomita Blvd, Lomita, CA 90717" | Business location |
| `{gallery_link}` | Shortened URL for SMS | `createShortLink()` applied |
| `{gallery_url}` | Full URL for email | No shortening |

---

## Naming Inconsistencies

| Inconsistency | Details |
|---------------|---------|
| `{services}` (SMS) vs `{services_list}` (email) | Same data, different names across channels. Should unify. |
| `{service_total}` (SMS) vs `{appointment_total}` (email) | Same value, different names. |
| `{vehicle_description}` (SMS) vs `{vehicle_info}` (email) | Same data, different names. |
| `{gallery_link}` (SMS) vs `{gallery_url}` (email) | `_link` vs `_url` suffix inconsistency. |
| `{short_url}` | Generic name for quote-specific short link. |
| `{address}` vs `{business_address}` | `{address}` = customer mobile location, `{business_address}` = store. Naming not obvious. |

---

## System-Specific Variables

| Variable | Only In | Reason |
|----------|---------|--------|
| `{hours_line}` | SMS `job_complete` | Contextual: "Open today until 6 PM" -- pickup notifications only |
| `{deposit_info}` | SMS `booking_staff_notify` | Staff-only: "Deposit paid." / "Pay on site." |
| `{timer_display}` | Email transactional | Job duration -- could be useful in SMS too |
| `{items_table}`, `{products_table}` | Email only | Pre-rendered HTML tables -- cannot work in SMS |
| `{book_now_url}` | Lifecycle/campaigns | Backward-compat alias for `{offer_url}` |
| `{vehicle_type}` | FALLBACKS only | Not actively used by any template or callsite |
| All order vars (#44-50) | Email order templates | E-commerce specific |
| All stock vars (#57-61) | Email stock alerts | Admin notification specific |
| All quote email vars (#51-56) | Email quote templates | Quote detail fields |

---

## Format Consistency

All callsites use identical formatting -- no inconsistencies found:

| Format | Function | Example |
|--------|----------|---------|
| Date | `toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })` | "Monday, April 7, 2026" |
| Time | Manual 24h-to-12h conversion | "10:30 AM" |
| Currency | `formatDollar()` or `formatCurrency()` | "$299.00" |
| Phone | `formatPhoneDisplay()` | "(424) 401-0094" |
| Number | `formatNumber()` | "2,702" |

---

## SMS Template Callsite Gap Analysis

| Template Slug | Currently Passed | Available at Zero Cost But NOT Passed |
|---|---|---|
| `appointment_confirmed` | first_name, service_name, appointment_date, appointment_time, service_total, detailer_first_name | last_name, vehicle_description, services (all names), customer phone/email |
| `appointment_confirmed_postcall` | first_name | services discussed, vehicle info, call duration, customer_name |
| `booking_confirmed` | first_name, appointment_date, appointment_time, services, vehicle_description, service_total | last_name, detailer_first_name, deposit_info |
| `booking_staff_notify` | customer_name, services, appointment_date, appointment_time, deposit_info | vehicle_description, service_total, customer phone |
| `appointment_cancelled` | first_name, services, appointment_date, appointment_time | vehicle_description, service_total, cancellation_reason |
| `booking_reminder` | first_name, service_name, appointment_time | appointment_date, vehicle_description, services (all), service_total |
| `quote_reminder` | first_name, short_url | quote_number, service names, quote total |
| `quote_viewed_followup` | first_name, short_url | quote_number, service names, quote total |
| `quote_accepted_single/multi` | first_name, item_name | quote_number, service_total, all item names, vehicle description |
| `quote_accepted_staff_notify` | customer_name, quote_number, service_total, services | customer phone, vehicle description |
| `job_complete` | first_name, vehicle_description, gallery_link, hours_line, detailer_first_name | services list, service_total, job duration |
| `addon_approved` | service_name, first_name | addon price, vehicle_description |
| `addon_declined` | service_name, first_name | addon price, vehicle_description |
| `detailer_job_assigned` | services, vehicle_description, appointment_date, appointment_time, address, service_total | customer_name, customer phone |
