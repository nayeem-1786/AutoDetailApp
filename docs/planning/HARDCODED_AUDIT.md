# Hardcoded Items Audit

Generated: 2026-02-28
Auditor: Claude Code (Opus 4.6)

## Summary

- **Total hardcoded items found: 147**
- Recommended to move to admin: 29
- Recommended to keep hardcoded: 98
- Needs discussion: 20

---

## Items by Category

### Category 1: Business Information

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 1 | Business name (fallback) | `'Smart Detail Auto Spa & Supplies'` | `src/lib/data/business.ts:52` | KEEP HARDCODED | — | Fallback for `getBusinessInfo()` — acceptable default |
| 2 | Business name (fallback) | `'Smart Detail Auto Spa & Supplies'` | `src/lib/data/receipt-config.ts:149` | KEEP HARDCODED | — | Fallback in receipt config merge |
| 3 | Business name (fallback) | `'Smart Detail Auto Spa & Supplies'` | `src/app/api/public/business-info/route.ts:32` | KEEP HARDCODED | — | Fallback for public API |
| 4 | Business name (fallback) | `'Smart Detail Auto Spa & Supplies'` | `src/lib/services/ai-content-writer.ts:208` | KEEP HARDCODED | — | Fallback for AI features |
| 5 | Business name (fallback) | `'Smart Detail Auto Spa & Supplies'` | `src/app/api/cron/lifecycle-engine/route.ts:368` | KEEP HARDCODED | — | Fallback for cron SMS |
| 6 | OG image alt text | `'Smart Details Auto Spa — Professional Auto Detailing'` | `src/app/opengraph-image.tsx:6` | MOVE TO ADMIN | Medium | Should use dynamic `businessInfo.name` |
| 7 | POS page title | `'Smart Details POS'` | `src/app/pos/layout.tsx:7,13` | MOVE TO ADMIN | Low | Should use `businessInfo.name + ' POS'` |
| 8 | POS header text | `'Smart Details Auto Spa - POS'` | `src/app/pos/pos-shell.tsx:313` | MOVE TO ADMIN | Medium | Should fetch from `business_name` setting |
| 9 | LocalStorage key | `'smart-details-checkout'` | `src/app/(public)/checkout/page.tsx:40` | KEEP HARDCODED | — | Technical, not user-facing |
| 10 | LocalStorage key | `'smart-details-checkout-order'` | `src/app/(public)/checkout/page.tsx:41` | KEEP HARDCODED | — | Technical, not user-facing |
| 11 | LocalStorage key | `'smart-details-cart'` | `src/lib/contexts/cart-context.tsx:63` | KEEP HARDCODED | — | Technical, not user-facing |
| 12 | Phone (fallback) | `'+13109990000'` | `src/lib/data/business.ts:53` | KEEP HARDCODED | — | Fallback for `getBusinessInfo()` |
| 13 | Phone (fallback) | `'+13109990000'` | `src/lib/data/receipt-config.ts:144` | KEEP HARDCODED | — | Fallback for receipt config |
| 14 | Phone (fallback) | `'+13109990000'` | `src/app/api/public/business-info/route.ts:33` | KEEP HARDCODED | — | Fallback for public API |
| 15 | Phone (preview) | `'(310) 756-4789'` | `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx:498` | KEEP HARDCODED | — | Campaign preview fallback |
| 16 | Twilio number (comment) | `'+14244010094'` | `src/app/api/webhooks/twilio/inbound/route.ts:4,9` | KEEP HARDCODED | — | Documentation/setup comment |
| 17 | Address (fallback) | `{ line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' }` | `src/lib/data/business.ts:49` | KEEP HARDCODED | — | Fallback for `getBusinessInfo()` |
| 18 | Address (fallback) | Same address | `src/lib/data/receipt-config.ts:140` | KEEP HARDCODED | — | Fallback for receipt config |
| 19 | Address (fallback) | Same address | `src/app/api/public/business-info/route.ts:29` | KEEP HARDCODED | — | Fallback for public API |
| 20 | Address (fallback) | `{ city: 'Lomita', state: 'CA' }` | `src/lib/services/ai-content-writer.ts:205` | KEEP HARDCODED | — | Fallback for AI content |
| 21 | City in AI content | `'${distance} miles from Lomita'` | `src/lib/services/ai-content-writer.ts:621` | MOVE TO ADMIN | Medium | Should use `businessInfo.city` dynamically |
| 22 | City in AI content | `'${distance} miles from Lomita'` | `src/app/api/admin/cms/content/ai-generate/route.ts:211` | MOVE TO ADMIN | Medium | Should use `businessInfo.city` dynamically |
| 23 | City (fallback) | `{ city: 'Lomita', state: 'CA' }` | `src/app/api/admin/cms/seo/ai-generate/route.ts:63` | KEEP HARDCODED | — | Fallback for AI SEO |
| 24 | Default hours | `{ open: '08:00', close: '18:00' }` Mon-Sat | `src/lib/data/booking.ts:216-221` | KEEP HARDCODED | — | Reasonable default, overridden by DB |
| 25 | Default hours | Same | `src/app/admin/settings/business-profile/page.tsx:35-40` | KEEP HARDCODED | — | Form default values |

**Subtotal: 25 items (4 MOVE TO ADMIN, 21 KEEP)**

---

### Category 2: URLs & External Services

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 26 | Site URL | `'https://smartdetailsautospa.com'` | `src/lib/utils/constants.ts:2` | MOVE TO ADMIN | High | Should use `NEXT_PUBLIC_APP_URL` env var |
| 27 | Domain display | `'smartdetailsautospa.com'` | `src/app/admin/website/seo/page.tsx:210,580` | MOVE TO ADMIN | Medium | Should derive from SITE_URL or settings |
| 28 | Google Place ID | `'ChIJf7qNDhW1woAROX-FX8CScGE'` | `src/app/api/cron/google-reviews/route.ts:6` | KEEP HARDCODED | — | Fallback constant; DB is queried first |
| 29 | Google Place ID | `'ChIJf7qNDhW1woAROX-FX8CScGE'` | `src/lib/data/homepage-settings.ts:40` | KEEP HARDCODED | — | Default constant for homepage settings |
| 30 | Google Place ID | `'ChIJf7qNDhW1woAROX-FX8CScGE'` | `src/app/(public)/areas/[citySlug]/page.tsx:440` | MOVE TO ADMIN | High | Hardcoded in public page — should use DB setting like homepage does |
| 31 | Stripe dashboard link | `'https://dashboard.stripe.com/payments/${id}'` | `src/app/admin/orders/[id]/page.tsx:327` | KEEP HARDCODED | — | Third-party dashboard URL |
| 32 | Social media placeholders | `'https://facebook.com/...'` etc. | `src/components/admin/toolbar-items/social-links-dialog.tsx:44-51` | KEEP HARDCODED | — | Input placeholders for admin |
| 33 | Review URL placeholder | `'https://search.google.com/local/writereview?placeid=...'` | `src/app/admin/settings/reviews/page.tsx:202` | KEEP HARDCODED | — | Admin form placeholder |
| 34 | Yelp review placeholder | `'https://www.yelp.com/writeareview/biz/...'` | `src/app/admin/settings/reviews/page.tsx:234` | KEEP HARDCODED | — | Admin form placeholder |
| 35 | IPify API | `'https://api.ipify.org?format=json'` | `src/app/api/admin/current-ip/route.ts:21` | KEEP HARDCODED | — | IP detection service URL |
| 36 | Shippo settings link | `'https://apps.goshippo.com/settings/api'` | `src/app/admin/settings/shipping/page.tsx:528` | KEEP HARDCODED | — | Admin help link |
| 37 | Google Place docs link | `'https://developers.google.com/maps/...'` | `src/app/admin/website/homepage/page.tsx:312` | KEEP HARDCODED | — | Admin help link |
| 38 | whatismyip link | `'https://whatismyip.com'` | `src/app/admin/settings/pos-security/page.tsx:354` | KEEP HARDCODED | — | Admin help link |

**Subtotal: 13 items (3 MOVE TO ADMIN, 10 KEEP)**

---

### Category 3: Pricing & Financial

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 39 | Tax rate | `0.1025` (10.25%) | `src/lib/utils/constants.ts:5` | NEEDS DISCUSSION | Medium | Already seeded in `business_settings` — constant may be redundant |
| 40 | Tax products only | `true` | `src/lib/utils/constants.ts:6` | NEEDS DISCUSSION | Medium | Already seeded in `business_settings` — constant may be redundant |
| 41 | Water SKU | `'0000001'` | `src/lib/utils/constants.ts:8` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 42 | CC fee rate | `0.05` (5%) | `src/lib/utils/constants.ts:10` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 43 | Tip presets | `[15, 20, 25]` | `src/lib/utils/constants.ts:12` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 44 | Loyalty earn rate | `1` (point/$1) | `src/lib/utils/constants.ts:15` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 45 | Loyalty redeem rate | `0.05` ($0.05/point) | `src/lib/utils/constants.ts:16` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 46 | Loyalty redeem minimum | `100` points | `src/lib/utils/constants.ts:17` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 47 | Loyalty redeem minimum (dup) | `100` | `src/components/booking/booking-wizard.tsx:703,726` | MOVE TO ADMIN | Medium | Hardcoded duplicate — should use constants or DB |
| 48 | Loyalty redeem rate (dup) | `0.05` | `src/components/booking/booking-wizard.tsx:747` | MOVE TO ADMIN | Medium | Hardcoded duplicate — should use `LOYALTY.REDEEM_RATE` |
| 49 | Deposit amount | `50` | `src/components/booking/step-confirm-book.tsx:130` | MOVE TO ADMIN | High | Should be configurable via `business_settings` |
| 50 | Deposit amount (dup) | `50` | `src/components/booking/booking-wizard.tsx:768` | MOVE TO ADMIN | High | Same — duplicate hardcode |
| 51 | Stripe minimum | `0.50` | `src/app/api/book/payment-intent/route.ts:17` | KEEP HARDCODED | — | Stripe technical minimum |
| 52 | Stripe minimum | `0.50` | `src/components/booking/step-confirm-book.tsx:155` | KEEP HARDCODED | — | Stripe technical minimum |
| 53 | Stripe minimum | `0.50` | `src/components/booking/booking-wizard.tsx:755` | KEEP HARDCODED | — | Stripe technical minimum |
| 54 | Stripe minimum check | `total < 0.50` | `src/components/booking/booking-confirmation.tsx:39,160` | KEEP HARDCODED | — | Stripe technical minimum |
| 55 | Buffer minutes | `30` | `src/lib/utils/constants.ts:21` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 56 | Travel buffer | `30` | `src/lib/utils/constants.ts:22` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |
| 57 | Cancellation window | `24` hours | `src/lib/utils/constants.ts:23` | NEEDS DISCUSSION | Low | Already seeded in `business_settings` |

**Subtotal: 19 items (4 MOVE TO ADMIN, 5 KEEP, 10 NEEDS DISCUSSION)**

---

### Category 4: Enums & Dropdown Options

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 58 | Role labels | `super_admin, admin, cashier, detailer` | `src/lib/utils/constants.ts:66-71` | KEEP HARDCODED | — | System roles tied to auth logic |
| 59 | Customer type labels | `enthusiast, professional` | `src/lib/utils/constants.ts:27-30` | KEEP HARDCODED | — | DB enum-backed labels |
| 60 | Vehicle size labels | `sedan, truck_suv_2row, suv_3row_van` | `src/lib/utils/constants.ts:33-37` | KEEP HARDCODED | — | Pricing tier identifiers |
| 61 | Vehicle type labels | `standard, motorcycle, rv, boat, aircraft` | `src/lib/utils/constants.ts:40-46` | KEEP HARDCODED | — | DB enum-backed |
| 62 | Pricing model labels | `vehicle_size, scope, per_unit, specialty, flat, custom` | `src/lib/utils/constants.ts:49-56` | KEEP HARDCODED | — | Core business logic |
| 63 | Classification labels | `primary, addon_only, both` | `src/lib/utils/constants.ts:59-63` | KEEP HARDCODED | — | Service classification logic |
| 64 | Appointment status labels | 6 statuses | `src/lib/utils/constants.ts:74-81` | KEEP HARDCODED | — | DB enum-backed |
| 65 | Transaction status labels | 5 statuses | `src/lib/utils/constants.ts:84-90` | KEEP HARDCODED | — | DB enum-backed |
| 66 | PO status labels | 4 statuses | `src/lib/utils/constants.ts:93-106` | KEEP HARDCODED | — | DB enum-backed |
| 67 | Stock adjustment types | 6 types | `src/lib/utils/constants.ts:109-116` | KEEP HARDCODED | — | DB enum-backed |
| 68 | Quote status labels | 6 statuses + badge variants | `src/lib/utils/constants.ts:119-136` | KEEP HARDCODED | — | DB enum-backed |
| 69 | Discount type labels | `percentage, flat, free` | `src/lib/utils/constants.ts:148-152` | KEEP HARDCODED | — | DB enum-backed |
| 70 | Applies-to labels | `order, product, service` | `src/lib/utils/constants.ts:154-158` | KEEP HARDCODED | — | DB enum-backed |
| 71 | Coupon status labels | `draft, active, disabled` | `src/lib/utils/constants.ts:161-165` | KEEP HARDCODED | — | DB enum-backed |
| 72 | Campaign status labels | 6 statuses | `src/lib/utils/constants.ts:168-175` | KEEP HARDCODED | — | DB enum-backed |
| 73 | Campaign channel labels | `sms, email, both` | `src/lib/utils/constants.ts:178-182` | KEEP HARDCODED | — | DB enum-backed |
| 74 | Consent action labels | `opt_in, opt_out` | `src/lib/utils/constants.ts:185-188` | KEEP HARDCODED | — | DB enum-backed |
| 75 | Permission categories | 12 category names | `src/lib/utils/constants.ts:191-204` | KEEP HARDCODED | — | UI grouping for role permissions |
| 76 | Conversation status labels | `open, closed, archived` | `src/lib/utils/constants.ts:236-246` | KEEP HARDCODED | — | DB enum-backed |
| 77 | Message sender types | `customer, staff, ai, system` | `src/lib/utils/constants.ts:248-253` | KEEP HARDCODED | — | DB enum-backed |
| 78 | Audit action labels | 9 actions + badge variants | `src/lib/utils/constants.ts:256-293` | KEEP HARDCODED | — | System audit logic |
| 79 | Audit entity types | 12 entity types | `src/lib/utils/constants.ts:268-281` | KEEP HARDCODED | — | System audit logic |
| 80 | Payment options | `deposit, pay_on_site, full` | `src/components/booking/step-confirm-book.tsx:83-84` | KEEP HARDCODED | — | Booking system logic |

**Subtotal: 23 items (0 MOVE TO ADMIN, 23 KEEP)**

---

### Category 5: UI Text & Labels

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 81 | Hero tagline | `"Expert ceramic coatings, paint correction, and premium detailing..."` | `src/components/public/hero-section.tsx:41-42` | MOVE TO ADMIN | High | Public-facing marketing copy |
| 82 | CTA default title | `"Ready to Transform Your Vehicle?"` | `src/components/public/cta-section.tsx:15` | MOVE TO ADMIN | Medium | Props-overridable but default is hardcoded |
| 83 | CTA default desc | `"Book your appointment today..."` | `src/components/public/cta-section.tsx:16` | MOVE TO ADMIN | Medium | Props-overridable but default is hardcoded |
| 84 | CTA button text | `"Book Your Detail"` | `src/components/public/cta-section.tsx:80` | MOVE TO ADMIN | Medium | Public-facing CTA |
| 85 | Services heading | `"Our Services"` | `src/app/(public)/page.tsx:110` | KEEP HARDCODED | — | Generic section heading |
| 86 | Services desc | `"From express washes to multi-year ceramic coating packages..."` | `src/app/(public)/page.tsx:113-114` | MOVE TO ADMIN | Medium | Service-specific marketing copy |
| 87 | Why choose heading | `"Why Choose {businessInfo.name}?"` | `src/app/(public)/page.tsx:153` | KEEP HARDCODED | — | Dynamic business name used |
| 88 | Service listing desc | `"From express washes to multi-year ceramic coating packages..."` | `src/app/(public)/services/page.tsx:63-64` | MOVE TO ADMIN | Medium | Service-specific marketing copy |
| 89 | City landing page copy | `"${businessInfo.name} proudly serves..."` | `src/app/(public)/areas/[citySlug]/page.tsx:141` | KEEP HARDCODED | — | Template with dynamic vars |
| 90 | City CTA copy | `"Ready for a showroom-quality detail?..."` | `src/app/(public)/areas/[citySlug]/page.tsx:457` | KEEP HARDCODED | — | Template with dynamic vars |
| 91 | Header CTA | `"Book Now"` | `src/components/public/header-client.tsx:275,376` | NEEDS DISCUSSION | Low | Common CTA text, could be CMS-editable |
| 92 | Mobile menu CTA | `"Book Now"` | `src/components/public/mobile-menu.tsx:132` | NEEDS DISCUSSION | Low | Same CTA as header |
| 93 | Footer CTA | `"Get a Quote"` | `src/components/public/footer-client.tsx:323` | NEEDS DISCUSSION | Low | Footer CTA link text |
| 94 | Content block default | `'Book Now'` | `src/components/admin/content/content-block-editor.tsx:126,1112` | KEEP HARDCODED | — | Default value for CMS blocks |
| 95 | Global block default | `'Book Now'` | `src/app/admin/website/global-blocks/page.tsx:59` | KEEP HARDCODED | — | Default value for CMS blocks |
| 96 | Gallery desc | `"See the difference professional detailing makes..."` | `src/app/(public)/gallery/page.tsx:162` | NEEDS DISCUSSION | Low | Could be CMS-editable |
| 97 | Theme preview text | `"Serving the South Bay area"` | `src/app/admin/website/theme-settings/_components/theme-preview.tsx:160` | KEEP HARDCODED | — | Admin preview only |

**Subtotal: 17 items (6 MOVE TO ADMIN, 7 KEEP, 4 NEEDS DISCUSSION)**

---

### Category 6: SEO & Metadata

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 98 | Site description | `'Professional auto detailing, ceramic coatings, and car care supplies in Lomita, CA...'` | `src/lib/utils/constants.ts:3` | MOVE TO ADMIN | High | Location-specific — should be in `business_settings` |
| 99 | JSON-LD price range | `'$$'` | `src/lib/seo/json-ld.ts:46` | MOVE TO ADMIN | Medium | Should be configurable |
| 100 | JSON-LD geo coords | `33.7922, -118.3151` | `src/lib/seo/json-ld.ts:52-53` | MOVE TO ADMIN | High | South Bay coordinates — should be configurable |
| 101 | JSON-LD geo radius | `'5 mi'` | `src/lib/seo/json-ld.ts:55` | MOVE TO ADMIN | Medium | Service radius — should be configurable |
| 102 | JSON-LD area served | `'South Bay, Los Angeles'` | `src/lib/seo/json-ld.ts:59,102` | MOVE TO ADMIN | High | Location-specific |
| 103 | JSON-LD sameAs | `[]` (empty array) | `src/lib/seo/json-ld.ts:62` | MOVE TO ADMIN | Medium | Should pull social links from DB |
| 104 | Booking meta desc | `"Schedule your auto detailing, ceramic coating..."` | `src/app/(public)/book/page.tsx:31` | NEEDS DISCUSSION | Low | SEO page override exists for this |
| 105 | Products meta desc | `"Shop premium car care products..."` | `src/app/(public)/products/page.tsx:31` | NEEDS DISCUSSION | Low | SEO page override exists for this |
| 106 | Services meta desc | `"Browse our full range of professional auto detailing services..."` | `src/app/(public)/services/page.tsx:40` | NEEDS DISCUSSION | Low | SEO page override exists for this |
| 107 | Sitemap ceramic priority | `priority: 1.0` for `ceramic-coatings` slug | `src/app/sitemap.xml/route.ts:113-118` | KEEP HARDCODED | — | Intentional SEO strategy per CLAUDE.md |
| 108 | AI.txt default content | `'# ai.txt - Smart Details Auto Spa'` | `src/app/ai.txt/route.ts:9` | KEEP HARDCODED | — | Fallback — DB value used when present |
| 109 | POS meta title | `'Smart Details POS'` / `'Smart Details Auto Spa Point of Sale'` | `src/app/pos/layout.tsx:7-8` | MOVE TO ADMIN | Low | Should use dynamic business name |

**Subtotal: 12 items (7 MOVE TO ADMIN, 2 KEEP, 3 NEEDS DISCUSSION)**

---

### Category 7: Email & SMS Templates

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 110 | Quote email subject | `'Estimate ${quote.quote_number} from ${business.name}'` | `src/lib/quotes/send-service.ts:125` | KEEP HARDCODED | — | Dynamic with business name |
| 111 | Quote validity text | `'This estimate is valid for 10 days.'` | `src/lib/quotes/send-service.ts:267,381` | MOVE TO ADMIN | High | Should be configurable duration |
| 112 | Appointment confirm subject | `'Appointment Confirmed — ${dateStr} at ${displayTime}'` | `src/app/api/appointments/[id]/notify/route.ts:201` | KEEP HARDCODED | — | Dynamic template |
| 113 | Order ready subject | `'Your Order ${order.order_number} is Ready for Pickup | ${biz.name}'` | `src/lib/utils/order-emails.ts:70` | KEEP HARDCODED | — | Dynamic template |
| 114 | Order shipped subject | `'Your Order ${order.order_number} Has Shipped | ${biz.name}'` | `src/lib/utils/order-emails.ts:99` | KEEP HARDCODED | — | Dynamic template |
| 115 | Order delivered subject | `'Your Order ${order.order_number} Has Delivered | ${biz.name}'` | `src/lib/utils/order-emails.ts:119` | KEEP HARDCODED | — | Dynamic template |
| 116 | Refund subject | `'Refund Processed — ${order.order_number} | ${biz.name}'` | `src/lib/utils/order-emails.ts:140` | KEEP HARDCODED | — | Dynamic template |
| 117 | Job complete subject | `'Your ${vehicleDisplay} is Ready!'` | `src/app/api/pos/jobs/[id]/complete/route.ts:308` | KEEP HARDCODED | — | Dynamic template |
| 118 | Receipt subject | `'Receipt #${number} from ${merged.name}'` | `src/app/api/pos/receipts/email/route.ts:116` | KEEP HARDCODED | — | Dynamic template |
| 119 | Receipt default zone 1 | `'Thank you for your business!\nYour Service Advisor, {staff_first_name}, Thanks You!'` | `src/lib/data/receipt-config.ts:74` | KEEP HARDCODED | — | Admin-editable via receipt settings |
| 120 | Receipt default zone 2 | `'Tell Us About Your Recent Visit\nLeave us a Review on Yelp or Google!'` | `src/lib/data/receipt-config.ts:80` | KEEP HARDCODED | — | Admin-editable via receipt settings |
| 121 | SMS unsubscribe footer | `'\nReply STOP to unsubscribe'` | `src/lib/utils/sms.ts:169` | KEEP HARDCODED | — | TCPA compliance requirement |
| 122 | Quote reminder SMS | `'Hey ${firstName}! Just checking if you had a chance to look at your quote: ${shortUrl}'` | `src/app/api/cron/quote-reminders/route.ts:75` | NEEDS DISCUSSION | Medium | Could be template-based |
| 123 | Job complete SMS | Multi-line with photo link, address, phone, hours | `src/app/api/pos/jobs/[id]/complete/route.ts:237` | KEEP HARDCODED | — | Dynamic template with business info |
| 124 | Appt confirm SMS | `'${business.name} — Appointment Confirmed...'` | `src/app/api/appointments/[id]/notify/route.ts:219-224` | KEEP HARDCODED | — | Dynamic template |
| 125 | Auth expired SMS | `'That authorization has expired...'` | `src/app/api/webhooks/twilio/inbound/route.ts:795,807` | KEEP HARDCODED | — | System message |
| 126 | AI messaging prompt | 99 lines of behavioral rules | `src/lib/services/messaging-ai-prompt.ts:6-99` | NEEDS DISCUSSION | Low | Large AI prompt — consider DB-stored prompt |

**Subtotal: 17 items (1 MOVE TO ADMIN, 14 KEEP, 2 NEEDS DISCUSSION)**

---

### Category 8: Configuration Constants

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 127 | Booking advance min | `1` day | `src/lib/data/booking.ts:253` | KEEP HARDCODED | — | Default — DB `booking_config` overrides |
| 128 | Booking advance max | `30` days | `src/lib/data/booking.ts:254` | KEEP HARDCODED | — | Default — DB `booking_config` overrides |
| 129 | Slot interval | `30` min | `src/lib/data/booking.ts:255` | KEEP HARDCODED | — | Default — DB `booking_config` overrides |
| 130 | Cron timeout | `30000` ms | `src/lib/cron/scheduler.ts:16` | KEEP HARDCODED | — | Technical constant |
| 131 | Cron retry delay | `5000` ms | `src/lib/cron/scheduler.ts:32` | KEEP HARDCODED | — | Technical constant |
| 132 | Audit log retention | `90` days | `src/app/api/cron/cleanup-audit-log/route.ts:18` | NEEDS DISCUSSION | Low | Could be admin-configurable |
| 133 | Abandoned order cleanup | `24` hours | `src/app/api/cron/cleanup-orders/route.ts:22-23` | KEEP HARDCODED | — | Reasonable fixed policy |
| 134 | Page revision retention | Last `20` revisions | `src/app/api/admin/cms/pages/[id]/route.ts:174-180` | KEEP HARDCODED | — | Reasonable fixed policy |
| 135 | Preview token TTL | `1` hour | `src/app/api/admin/cms/pages/[id]/preview/route.ts:26` | KEEP HARDCODED | — | Technical constant |
| 136 | Feature flag cache TTL | `60000` ms (60s) | `src/lib/hooks/use-feature-flag.ts:16` | KEEP HARDCODED | — | Technical constant |
| 137 | Audit log export limit | `5000` rows | `src/app/api/admin/audit-log/export/route.ts:59` | KEEP HARDCODED | — | Reasonable export cap |
| 138 | Photo bulk update max | `100` | `src/app/api/admin/photos/bulk/route.ts:28` | KEEP HARDCODED | — | Reasonable batch limit |
| 139 | Addon auth expiration | `30` min default | `src/app/api/pos/jobs/[id]/addons/route.ts:102-104` | KEEP HARDCODED | — | Default — DB `addon_auth_expiration_minutes` overrides |

**Subtotal: 13 items (0 MOVE TO ADMIN, 12 KEEP, 1 NEEDS DISCUSSION)**

---

### Category 9: Feature Flags & Toggles

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 140 | 19 feature flag keys | `loyalty_rewards`, `sms_marketing`, etc. | `src/lib/utils/constants.ts:209-229` | KEEP HARDCODED | — | Keys are identifiers — values stored in DB |
| 141 | Twilio lookup toggle | `TWILIO_LOOKUP_ENABLED` env var | `src/lib/utils/phone-validation.ts` | KEEP HARDCODED | — | Environment-controlled |

**Subtotal: 2 items (0 MOVE TO ADMIN, 2 KEEP)**

---

### Category 10: Image/Asset Paths

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 142 | Stripe badge | `'/images/powered-by-stripe.svg'` | `src/components/booking/step-payment.tsx:29`, `src/app/(public)/checkout/page.tsx:278` | KEEP HARDCODED | — | Third-party brand asset |
| 143 | Before/After defaults | `'/images/before-after-old.webp'`, `'/images/before-after-new.webp'` | `src/lib/data/homepage-settings.ts:41-42` | KEEP HARDCODED | — | Defaults — admin can override via homepage settings |
| 144 | POS touch icon | `'/icons/apple-touch-icon-pos.png'` | `src/app/pos/layout.tsx:16` | KEEP HARDCODED | — | PWA manifest asset |

**Subtotal: 3 items (0 MOVE TO ADMIN, 3 KEEP)**

---

### Category 11: Colors & Styling

| # | Item | Current Value | File:Line | Recommendation | Priority | Notes |
|---|------|--------------|-----------|----------------|----------|-------|
| 145 | Stripe payment form colors | `#CCFF00, #1A1A1A, #FFFFFF, #9CA3AF, #EF4444` | `src/components/booking/step-payment.tsx:196-200`, `src/app/(public)/checkout/page.tsx:1342-1346` | NEEDS DISCUSSION | Low | Should these follow theme? Duplicated in 2 files |
| 146 | OG image gradient | `#0f172a, #1e293b, #2563eb, #3b82f6, #60a5fa, #fbbf24` | `src/app/opengraph-image.tsx:29-127` | KEEP HARDCODED | — | Static OG image generation |
| 147 | Annotation default color | `'#FF0000'` | `src/lib/utils/job-zones.ts:83` | KEEP HARDCODED | — | Red marker for photo annotations |

**Subtotal: 3 items (0 MOVE TO ADMIN, 2 KEEP, 1 NEEDS DISCUSSION)**

---

### Category 12: Arrays & Lists

All major arrays are properly centralized in `src/lib/utils/constants.ts` and `src/lib/utils/vehicle-categories.ts`. The following are notable hardcoded data arrays:

| Location | Content | Status |
|----------|---------|--------|
| `src/lib/data/homepage-settings.ts:22-38` | Default differentiators (3 items: Mobile Service, Ceramic Pro Certified, Eco-Friendly) | Admin-editable via homepage settings |
| `src/lib/utils/vehicle-categories.ts:9-88` | Vehicle categories + specialty tiers (5 categories, 15 tiers) | System constants — rarely change |
| `src/lib/utils/job-zones.ts:11-32` | Photo zones (5 exterior + 5 interior) | System constants |
| `src/lib/utils/constants.ts:191-204` | Permission categories (12 groups) | System constants |
| `src/lib/utils/template.ts:5-71` | 50+ template variables for campaigns/messaging | System constants |

**All arrays in this category are properly hardcoded as system constants or have admin-editable DB overrides.**

---

## Recommendation Criteria

### Items marked **MOVE TO ADMIN** if:
- Business owner would reasonably want to change it without a developer
- Value is business-specific (not a universal constant)
- Value could change over time (prices, hours, contact info)
- Already has a natural home in an existing admin section

### Items marked **KEEP HARDCODED** if:
- Technical constant (timeout values, buffer sizes, Stripe minimums)
- UI framework requirement (Tailwind classes, component structure)
- DB enum-backed label (display text for database enum values)
- Fallback/default value with DB override already in place
- Security-related (auth config, API keys in .env)
- Rarely changes and changing it could break functionality

### Items marked **NEEDS DISCUSSION** if:
- Constants file has value AND it's already seeded in `business_settings` (redundant but harmless)
- Could go either way depending on business needs
- SEO page override system already exists for the value
- Would require significant refactoring

---

## Already Admin-Editable

These items are ALREADY properly managed via `business_settings`, CMS, or admin UI:

| Item | Admin Location | DB Key / Table |
|------|---------------|----------------|
| Business name, phone, email, address | Settings > Business Profile | `business_settings` (business_name, business_phone, etc.) |
| Business hours | Settings > Business Profile | `business_settings` (business_hours JSON) |
| Homepage differentiators | Website > Homepage | `business_settings` (homepage_differentiators JSON) |
| Homepage CTA before/after images | Website > Homepage | `business_settings` (cta_before_image, cta_after_image) |
| Team section title | Website > Homepage | `business_settings` (team_section_title) |
| Credentials section title | Website > Homepage | `business_settings` (credentials_section_title) |
| Google Place ID | Website > Homepage | `business_settings` (google_place_id) |
| Review request URLs | Settings > Reviews | `business_settings` (google_review_url, yelp_review_url) |
| Receipt text, logo, layout | Settings > Receipt Printer | `business_settings` (receipt_config JSON) |
| Tax rate | Settings > Tax Config | `business_settings` (tax_rate) |
| Loyalty rates | (Seeded in DB) | `business_settings` (loyalty_earn_rate, etc.) |
| Tip presets | (Seeded in DB) | `business_settings` (tip_presets JSON) |
| Booking buffer/advance/slot | (Seeded in DB) | `business_settings` (booking_config JSON) |
| Addon auth expiration | (Seeded in DB) | `business_settings` (addon_auth_expiration_minutes) |
| POS idle timeout | Settings > POS Settings | `business_settings` (pos_idle_timeout_minutes) |
| Feature flags (19 toggles) | Settings > Feature Toggles | `feature_flags` table |
| All CMS page content | Website > Pages | `page_content_blocks` table |
| SEO per-page overrides | Website > SEO | `page_seo` table |
| Navigation items | Website > Navigation | `website_navigation` table |
| Hero slides | Website > Hero | `hero_slides` table |
| Tickers | Website > Tickers | `announcement_tickers` table |
| Footer sections/columns | Website > Footer | `footer_sections`, `footer_columns` tables |
| Seasonal themes | Website > Themes | `seasonal_themes` table |
| Site theme colors | Website > Theme Settings | `site_theme_settings` table |
| AI crawler rules | Website > SEO | `business_settings` (ai_txt_content) |
| SMS daily cap | (Seeded in DB) | `business_settings` (sms_daily_cap_per_customer) |

---

## Existing Admin Sections That Could Host New Settings

| "MOVE TO ADMIN" Item | Recommended Admin Location | Notes |
|----------------------|---------------------------|-------|
| SITE_URL (#26) | `.env` as `NEXT_PUBLIC_APP_URL` | Environment variable, not admin UI |
| SITE_DESCRIPTION (#98) | Settings > Business Profile | Add `business_description` field |
| Google Place ID in city pages (#30) | Already in DB — fix code | Bug: should read from `business_settings` like homepage does |
| JSON-LD geo coords (#100) | Settings > Business Profile | Add `business_latitude`, `business_longitude` fields |
| JSON-LD area served (#102) | Settings > Business Profile | Add `service_area_name` field |
| JSON-LD price range (#99) | Settings > Business Profile | Add `price_range` field |
| JSON-LD sameAs (#103) | Website > Footer (social links) or Settings | Pull from footer social links |
| JSON-LD geo radius (#101) | Settings > Business Profile or Mobile Zones | Derive from max mobile zone radius |
| Hero tagline (#81) | Website > Hero or Homepage | Add hero default tagline field |
| CTA section text (#82-84) | Website > Homepage | Add CTA title/description/button text fields |
| Services homepage desc (#86) | Website > Homepage | Add services section description field |
| Services listing desc (#88) | Website > SEO (page-level override) | Already possible via `page_seo` table |
| OG image alt (#6) | Auto-generate | Use `businessInfo.name` dynamically |
| POS header text (#8) | Auto-generate | Use `businessInfo.name + ' - POS'` dynamically |
| Deposit amount (#49-50) | Settings > Business Profile or Booking Settings | Add `default_deposit_amount` to `business_settings` |
| Quote validity (#111) | Settings > Business Profile | Add `quote_validity_days` to `business_settings` |
| Loyalty duplication (#47-48) | Code fix | Import from `constants.ts` instead of re-hardcoding |
| AI city reference (#21-22) | Code fix | Use `businessInfo.city` from `getBusinessInfo()` |
| SEO domain display (#27) | Code fix | Derive from `SITE_URL` constant or env var |

---

## Priority Action Items

### P0 — Bug Fixes (no new settings needed)
1. **City pages Place ID** (#30): `areas/[citySlug]/page.tsx` hardcodes Place ID instead of using DB value
2. **Loyalty rate duplication** (#47-48): `booking-wizard.tsx` re-hardcodes values instead of importing from constants
3. **AI city reference** (#21-22): Two files hardcode "Lomita" instead of using `getBusinessInfo().city`

### P1 — Environment Variable
4. **SITE_URL** (#26): Move from `constants.ts` to `NEXT_PUBLIC_APP_URL` env var

### P2 — New Admin Settings
5. **Deposit amount** (#49-50): Add `default_deposit_amount` to `business_settings`
6. **Quote validity** (#111): Add `quote_validity_days` to `business_settings`
7. **SITE_DESCRIPTION** (#98): Add `business_description` to `business_settings`
8. **JSON-LD geo data** (#100-102): Add lat/lng/area served to `business_settings`

### P3 — Dynamic Generation (code changes only)
9. **OG image alt** (#6): Use `getBusinessInfo().name`
10. **POS header** (#8): Use `getBusinessInfo().name`
11. **JSON-LD sameAs** (#103): Pull from footer social links or credentials table

### P4 — Future Consideration
12. **Hero tagline** (#81): Consider making CMS-editable
13. **CTA section defaults** (#82-84): Consider homepage settings expansion
14. **Stripe payment colors** (#145): Consider theme-aware colors
