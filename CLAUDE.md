# Auto Detail App — Session Context

## Project
Smart Detail Auto Spa — custom POS, booking, portal, and admin system replacing Square.

## Companion Documents
| Document | When to Use |
|----------|-------------|
| `docs/PROJECT.md` | Master spec — architecture, tech stack, features, all 12 build phases, RBAC permissions, database schema. Start here for any planning. |
| `docs/CONVENTIONS.md` | Component APIs, auth patterns, file naming, project conventions. Reference when writing new code. |
| `docs/SERVICE_CATALOG.md` | All 30 services with pricing, vehicle compatibility, add-on rules, combo pricing. Reference when touching service/pricing logic. |
| `docs/DASHBOARD_RULES.md` | Admin dashboard navigation and UI structure — every page, section, feature. Reference when building admin pages. |
| `docs/DATA_MIGRATION_RULES.md` | Square data import rules — customer tiers, phone normalization, product mapping. Reference if revisiting migration. |
| `docs/COUPONS.md` | Coupon engine rules, types, validation logic, lifecycle. Reference when touching coupon/discount code. |
| `docs/POS_SECURITY.md` | POS IP whitelist, HMAC auth, idle timeout. Reference when touching POS auth or security. |
| `docs/iPAD.md` | iPad POS optimization features — touch targets, PWA, offline support, gestures. Reference for Phase 12. |
| `docs/TCPA_AUDIT.md` | TCPA compliance audit report — SMS consent capture, opt-out handling, audit log, all sending paths reviewed. |
| `docs/CHANGELOG.md` | Archived session history — all bug fixes (44+), feature details, file lists. Reference for "what changed" questions. |
| `docs/MEMORY.md` | Session memory and context carryover notes. |
| `docs/AUDIT_VARIABLE_DATA.md` | Template variable data audit — customer/transaction/vehicle data coverage, business settings keys, live template usage, loyalty data. Reference when adding or modifying template variables. |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| **1** | Foundation, Auth & Data Model | Done |
| **2** | POS Application | Done |
| **3** | Booking, Quotes & 11 Labs API | Done |
| **4** | Customer Portal | Done |
| **5** | Marketing, Coupons & Campaigns | Done |
| **6** | Inventory Management | In Progress |
| **7** | QuickBooks Integration & Reporting | Not started |
| **8** | Photo Documentation | Not started |
| **9** | Native Online Store | Not started |
| **10** | Recurring Services (Dormant) | Not started |
| **11** | Intelligence & Growth | Not started |
| **12** | iPad POS Optimization | Not started |

### Phase 5 — What's Done
- Coupon engine (CRUD, validation, types, POS integration, wizard with duplicate/usage warnings)
- Campaign system (CRUD, audience filters, scheduling, SMS/email, deep-links)
- Dynamic receipt config (branding from DB, logo upload, printer settings)
- Customer management (portal access toggle, auto-link by phone, delete with cascade)
- Notification preferences (4-toggle system, public unsubscribe page)
- Dark mode (all public pages + email templates + shared UI components)
- Password reset flows (admin + customer login pages)
- Unified SendMethodDialog (single component for all send flows, default "both")
- Session expiry protection (3-layer: periodic check, focus check, fetch interceptor)
- Dynamic business info (zero hardcoded values, 28 files use `getBusinessInfo()`)
- Quote soft-delete (`deleted_at` timestamp), number reuse fix, email dark mode fix
- Square → Supabase image migration: 408 product images + 27 service images imported. Stored in Supabase storage buckets (`product-images/`, `service-images/`)
- Missing-image alert banners on Products and Services list pages (amber warning with count)
- Info tooltips on Transactions revenue card and Customers lifetime revenue card explaining data source differences
- POS session management: cross-tab sync via storage events, 60s token expiry check, mount validation (was listed as pending bug — verified fixed)
- Merge duplicate customers: `/admin/customers/duplicates` with smart scoring, confidence levels, phone/email/name matching, bulk merge
- URL shortening: `short_links` table, 6-char codes via `crypto.getRandomValues()`, `/s/[code]` redirect route, collision retry
- Two-way SMS messaging system: shared team inbox at `/admin/messaging` with split-pane UI (conversation list + thread view), real-time updates via Supabase Realtime, unread badges in sidebar
- AI auto-responder for unknown numbers: Claude API integration using dynamic system prompt built from live service catalog, business info, and hours. STOP word detection, rate limiting (10/hr per conversation), auto-disable when staff takes over
- After-hours auto-responder for known customers: uses business hours from settings, configurable message template with variables ({business_name}, {business_hours}, {booking_url})
- Messaging settings page (`/admin/settings/messaging`): Unified "AI Assistant" card with master toggle, audience pills (Unknown/Customers), full editable prompt textarea, "Apply Standard Template" reset link. Conversation Lifecycle card with side-by-side auto-close/auto-archive dropdowns.
- Business hours helper (`src/lib/data/business-hours.ts`): getBusinessHours(), isWithinBusinessHours(), formatBusinessHoursText()
- AI system prompt architecture: `getDefaultSystemPrompt()` in `messaging-ai-prompt.ts` (pure function, no server deps, client-importable). `buildSystemPrompt()` in `messaging-ai.ts` uses saved DB prompt or falls back to default, then appends live service catalog + business info + hours + open/closed status + active coupons (with resolved reward target names) at runtime.
- Conversation lifecycle automation: pg_cron function auto-closes conversations after configurable hours (default 48h), auto-archives after configurable days (default 30d). System messages logged on each transition. Inbound messages auto-reopen closed/archived conversations.
- Auto-quote via SMS: AI collects full name (first + last required), vehicle info, and service → generates real quote with `[GENERATE_QUOTE]` block → creates quote record, vehicle, and customer (if new) → sends short link via SMS
- Auto-quote customer defaults: new customers created via SMS auto-quote get `sms_consent: true`, `email_consent: false` (CAN-SPAM requires explicit email opt-in), `customer_type: 'enthusiast'`
- Quote communications logging: auto-quote SMS sends are logged in `quote_communications` table (channel, sent_to, status)
- Quote acceptance SMS: when customer accepts quote via public page, confirmation SMS is sent automatically and logged in `quote_communications`
- Contextual product knowledge: AI searches `products` table on demand when product-related keywords detected (27 keywords: spray, wax, cleaner, towel, etc.). Zero overhead for service-only conversations. Matches product name/description, returns up to 10 results with price and category.
- SMS multi-message splitting: long AI responses split at natural break points (paragraph, newline, sentence) instead of truncating at 320 chars. Each chunk sent as separate SMS and stored as separate message row.
- Performance fix: renamed `middleware.ts` → `proxy.ts` (Next.js 16 convention), eliminated self-fetch cascade (proxy.ts 5-13s → 2-64ms), excluded API routes from proxy matcher, externalized pdfkit/sharp via `serverExternalPackages`.
- Active coupon/promo injection into AI context (Enhancement 3): `buildSystemPrompt()` queries `coupons` + `coupon_rewards` with FK joins to resolve target product/service/category names. Filters: `status='active'`, `customer_id IS NULL`, not expired. AI sees formatted lines like `Code "G72XVMKV" — Ceramic Coating Offer: 30% off entire order (max $200)`. Structured promo rules: responds to deal/discount/sale inquiries, matches targeted coupons to discussed services, mentions at booking moments, never in first message.
- Product catalog link in AI prompt (Enhancement 4): AI directs product-interested customers to `${NEXT_PUBLIC_SITE_URL}/products` for online browsing.
- Quote follow-up reminder cron (Enhancement 1): `GET /api/cron/quote-reminders` with `CRON_API_KEY` auth. Sends one-time SMS nudge for quotes with `status='sent'`, `sent_at` > 24hrs ago, `viewed_at IS NULL`. Deduplicates via `quote_communications` check for "reminder" in `message` column. Uses `createShortLink()` for quote URL. Migration added `message` TEXT column to `quote_communications`.
- Conversation summary card (Enhancement 2): `GET /api/admin/messaging/[conversationId]/summary` returns customer, latest vehicle, and latest quote with services. `thread-view.tsx` fetches on conversation change and renders compact card above messages — customer name + vehicle on line 1, quote number + services + amount + status on line 2. Handles all display states (no customer, no vehicle, no quote, viewed/accepted).
- Google review request automation (Enhancement): Full lifecycle automation engine built and wired.
  - Settings page: `/admin/settings/reviews` — configurable Google/Yelp review URLs stored in `business_settings` (`google_review_url`, `yelp_review_url`). Shows feature flag status and links to automations.
  - Lifecycle execution engine: `/api/cron/lifecycle-engine` — cron endpoint (every 10 min) with two phases: Phase 1 schedules executions from completed appointments (`service_completed`) and POS transactions (`after_transaction`) within 24h window. Phase 2 sends pending SMS with template variable replacement (`{first_name}`, `{service_name}`, `{vehicle_info}`, `{google_review_link}`, `{yelp_review_link}`).
  - `lifecycle_executions` tracking table: prevents duplicates per trigger event, enforces 30-day per-customer-per-rule cooldown, tracks status (`pending`/`sent`/`failed`/`skipped`).
  - `delay_minutes` column added to `lifecycle_rules` for sub-day granularity (total delay = delay_days * 1440 + delay_minutes).
  - Automations form updated: `delay_minutes` input alongside `delay_days`, `after_transaction` trigger condition added, SMS template variable helper text.
  - Two seed rules: "Google Review Request — After Service" (30 min) and "Google Review Request — After Purchase" (30 min). Editable from Admin > Marketing > Automations.
  - Uses `sendMarketingSms()` (appends STOP footer), `createShortLink()` for review URLs, respects `google_review_requests` feature flag and `sms_consent`.
  - Prepayment-safe: only triggers on status change to completed, not on payment.
  - Trigger condition standardized to `service_completed` (single canonical value — `after_service` removed from DB, forms, and cron engine).
  - Template variables standardized to snake_case via `renderTemplate()` (e.g., `{first_name}`, `{google_review_link}`).
- Internal cron scheduler: `node-cron` + `src/instrumentation.ts` runs all scheduled jobs inside the Next.js process — no external schedulers needed. Jobs defined in `src/lib/cron/scheduler.ts`, self-fetch API endpoints with `CRON_API_KEY` auth. Lifecycle engine every 10 min, quote reminders hourly at :30.
- SMS verified end-to-end: appointment completed → `lifecycle_executions` scheduled → cron fires → review SMS delivered with Google + Yelp links via `sendMarketingSms()`.
- Automations coupon refactor: replaced inline coupon fields (coupon_type/coupon_value/coupon_expiry_days) with `coupon_id` FK selector pulling from existing coupons. Forms show coupon name + code + discount summary. "Manage coupons →" link to `/admin/marketing/coupons`.
- TCPA compliance — full audit and all 9 issues fixed:
  - `sms_consent_log` audit table: records every SMS consent change with `customer_id`, `phone`, `action` (opt_in/opt_out), `keyword`, `source`, `previous_value`, `new_value`, `notes`. Indexes on `(customer_id, created_at DESC)` and `(phone, created_at DESC)`.
  - `updateSmsConsent()` shared helper (`src/lib/utils/sms-consent.ts`): centralized function for all consent changes — updates `customers.sms_consent` + inserts `sms_consent_log` row. Skips if value unchanged.
  - STOP/START keyword handling fixed: inbound webhook now handles STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT (opt-out) and START, YES, UNSTOP (opt-in). Updates `sms_consent` on customer record + logs via `updateSmsConsent()`.
  - Quote reminders switched from `sendSms()` to `sendMarketingSms()` with `sms_consent` check before sending.
  - `sendMarketingSms()` consent safety net: accepts optional `customerId` param, looks up `sms_consent` from DB, blocks if `false`. Defense-in-depth — all callers also pass `customerId`.
  - Consent logging wired into ALL paths: inbound webhook (STOP/START), unsubscribe page, compliance opt-out, admin customer edit/new, customer portal profile, booking form.
  - Booking form consent capture: SMS + email opt-in checkboxes (checked by default) with TCPA disclosure text using dynamic business name from `/api/public/business-info`. Consent upgrade-only for existing customers (never downgrades via booking).
  - Source tracking: `inbound_sms`, `admin_manual`, `unsubscribe_page`, `booking_form`, `customer_portal`, `system`.
  - Twilio signature validation enabled: `false &&` bypass removed from inbound webhook. Validation active in production, skipped in `NODE_ENV=development`.
  - All SMS routed through shared utility: 3 direct Twilio API calls (admin appt notify, POS appt notify, quote send-service) replaced with `sendSms()`. Zero direct Twilio calls outside `sms.ts`.
  - `sendSms()` extended with MMS support (`mediaUrl` option) and structured console logging for all sends.
  - Per-customer daily SMS frequency cap: `checkFrequencyCap()` in `sendMarketingSms()` — checks `campaign_recipients` + `lifecycle_executions` against `business_settings.sms_daily_cap_per_customer` (default 5). PST timezone.
  - Phone type validation utility: `isValidMobileNumber()` in `src/lib/utils/phone-validation.ts` — Twilio Lookup API v2. Off by default (`TWILIO_LOOKUP_ENABLED=true`). ~$0.005/lookup. Fails open.
  - Auto-quote email consent: changed `email_consent: true` to `email_consent: false` for SMS-initiated customer creation (CAN-SPAM compliance).
- Campaign analytics dashboard (`/admin/marketing/analytics`) — overview KPIs, channel comparison (SMS vs Email), campaign/automation/coupon performance tables, audience health charts
- SMS delivery tracking — Twilio statusCallback on all sends, `sms_delivery_log` table, `/api/webhooks/twilio/status` webhook
- Click tracking — `tracked_links` + `link_clicks` tables, `/api/t/[code]` redirect endpoint, auto-URL wrapping in `sendMarketingSms()`
- Email delivery tracking — Mailgun webhook (`/api/webhooks/mailgun`), `email_delivery_log` table, signature verification
- Email consent helper — `updateEmailConsent()` mirrors SMS consent pattern
- Revenue attribution — `getAttributedRevenue()` links campaigns/automations to transactions within configurable window
- A/B testing — `campaign_variants` table, split recipients, auto-winner by CTR, variant stats comparison, full round-trip persistence (save/load/edit)
- A/B testing UI — campaign wizard toggle, variant B fields, split slider, auto-winner config, results display, preview shows both variants personalized
- Campaign coupon injection — unique coupon code per recipient, cloned from template coupon with rewards
- Lifecycle engine coupon injection — same pattern, generates per-customer coupon for rules with `coupon_id`
- Lifecycle engine URL tracking — passes `lifecycleExecutionId` to `sendMarketingSms()` so `wrapUrlsInMessage()` creates tracked short links
- Personalized booking links — `{book_url}` placeholder generates `/book?name=...&phone=...&email=...&coupon=...` per customer, auto-shortened by click tracker
- Campaign detail analytics drill-down (`/admin/marketing/campaigns/[id]/analytics`) — summary KPIs, delivery funnel, recipient table (filterable/paginated), A/B variant comparison, click details with link performance, engagement timeline chart
- Campaign duplicate action — copy icon on campaign list, creates draft copy with "(Copy)" suffix, copies A/B variants. Endpoint: `POST /api/marketing/campaigns/[id]/duplicate`
- Campaign list column width balanced (Name column expanded to 35%)
- Click-to-variant attribution — `variant_id` column added to `tracked_links` and `link_clicks` tables (migration 20260210000010), threaded through full chain: `createTrackedLink()` → `wrapUrlsInMessage()` → `sendMarketingSms()` → campaign send route → click redirect handler → `getVariantStats()`
- `campaign_recipients.clicked_at` updates on first click via `/api/t/[code]` redirect handler
- Template variables audit — consolidated `{vehicle_description}` into `{vehicle_info}`, context-aware variable chips (`CAMPAIGN_VARIABLES` in campaigns, `AUTOMATION_ONLY_VARIABLES` for event context only in automation editors), `cleanEmptyReviewLines()` strips blank lines from unused review URL placeholders
- All template variables now work in all 3 send routes (campaign immediate, campaign scheduled, lifecycle engine). Pre-loads `{vehicle_info}` (batch query per customer), `{service_name}` (from coupon target), `{google_review_link}` + `{yelp_review_link}` (from `business_settings`, shortened via `createShortLink()`). Fixed `{book_url}` missing from scheduled send. Fixed `SITE_URL` → `NEXT_PUBLIC_APP_URL` in scheduled send.
- `{offer_url}` smart routing — renamed from `{book_now_url}`. Service-targeted coupon → `/book`, product-targeted coupon → `/products/<cat>/<prod>`. Email CTA button adapts ("Book Now" vs "Shop Now"). `{book_now_url}` kept as backward-compat alias.
- Expanded template variable system: 21 total variables organized into 6 `VARIABLE_GROUPS` (Customer Info, Business, Links, Loyalty & History, Coupons, Event Context). New vars: `{business_phone}`, `{business_address}`, `{loyalty_points}`, `{loyalty_value}`, `{visit_count}`, `{days_since_last_visit}`, `{lifetime_spend}`, `{appointment_date}`, `{appointment_time}`, `{amount_paid}`. Helper formatters: `formatPhoneDisplay()`, `formatDollar()`, `formatNumber()`.
- Data audit saved to `docs/AUDIT_VARIABLE_DATA.md` — 1,316 customers, 97% vehicles incomplete, 393 with loyalty points, email only 6.4% coverage.
- Coupon auto-apply toggle styling fixed — both status and auto-apply toggles on coupon detail page now use system-wide Switch pattern (`bg-green-500` active, `bg-gray-200` inactive). Previously auto-apply used `bg-blue-500`/`bg-gray-300`.
- Coupon category validation fixed — `categoryId` added to `TicketItem` interface, populated from `product.category_id`/`service.category_id` in both ticket-reducer and quote-reducer, passed to all 5 cart item mapping locations (coupon-input, quote-coupon-input, ticket-context, promotions-tab ×2). POS validation endpoints already checked `category_id` but cart items never sent it.
- Powered by Stripe SVG logo on booking payment step (`step-payment.tsx`) — `h-9 w-auto opacity-20`

### Verified Complete (previously listed as pending)
- Product edit/new pages — full forms with all fields, image upload, Zod validation, soft-delete
- Service edit/new pages — full forms (1,371 + 543 lines), most substantial catalog pages
- All 12 settings sub-pages built and functional: Business Profile (419), Tax Config (217), Mobile Zones (454), POS Favorites (594), POS Idle Timeout (155), Receipt Printer (574), POS Security (458), Card Reader (407), Coupon Enforcement (137), Feature Toggles (112), Audit Log (184), Messaging (new)
- Staff management (list, new, edit pages) with role-based auth (roles.ts + permissions.ts + use-permission hook)
- POS session caching bug — FIXED (cross-tab sync, 60s token expiry check, mount validation)
- Merge duplicate customers — BUILT (/admin/customers/duplicates with smart scoring, confidence levels, bulk merge)
- URL shortening — BUILT (/s/[code] redirect, short_links table, 6-char codes)

### Phase 6 — What's Done
- Stock overview page (/admin/inventory — 315 lines): product list with stock levels, low/out-of-stock filters, manual stock adjustment dialog, vendor column, reorder threshold display
- Vendor management (2 pages): /admin/inventory/vendors (400 lines, more complete with search + address + lead time) AND /admin/catalog/vendors (372 lines, basic CRUD). Duplicate exists — inventory version is canonical.
- Nav links wired (roles.ts has routes + sidebar entries)
- DB tables exist for purchase orders (purchase_orders, po_items migrations)

### Phase 6 — What's Remaining
- Purchase order UI (list, create, edit, approve workflow) — DB tables exist but no pages or API routes
- Receiving workflow (receive-against-PO, count verification, variance flagging)
- Cost/COGS tracking (margin reporting, COGS-per-transaction)
- Low stock proactive notifications/dashboard alerts (currently filter-only on stock page)
- Consolidate duplicate vendor pages (inventory version is more complete)

### Phase 9 — Native Online Store (NOT WooCommerce)
Build full e-commerce within the existing Next.js app. Product catalog pages already exist at `/products` with SEO, categories, and product detail pages. Needs: cart (React context), cart drawer/page, Stripe checkout flow, order management (`orders` table, status tracking), order confirmation + email, shipping/pickup selection, order history in customer dashboard, admin order management page. No WordPress/WooCommerce — everything stays in this app. Stripe is already integrated from booking payments.

---

## Testing Checklist

### Quotes (Implemented — Need Manual Testing)
- [ ] Send quote via both (email + SMS simultaneously)
- [ ] View public quote link (`/quote/[access_token]`)
- [ ] Accept quote from public page
- [ ] Delete draft quote via POS builder (soft-delete)
- [ ] Verify deleted quote shows "No Longer Available" page

### Verified Working
- Online Booking: payment flow, coupons, loyalty, edge cases (all pass)
- Staff Scheduling: profiles, blocked dates, "Who's Working Today"
- Dashboard widgets: all functional with live data
- Waitlist: full admin UI (437 lines), API endpoints, feature flag support
- Appointments: reschedule flow, mobile responsive layout
- 11 Labs Voice Agent: 5 endpoints (appointments endpoint handles GET + POST)

---

## Pending Tasks

| Task | Type | Priority |
|------|------|----------|
| Setup receipt printer hardware integration for POS | Hardware | Low |
| Admin appointment creation (currently only via booking/POS/voice agent) | Feature | Low |
| Consolidate duplicate vendor pages (catalog vs inventory) | Cleanup | Low |
| Configure Twilio webhook URL for production (`/api/webhooks/twilio/inbound`) | Configuration | High |
| Add `ANTHROPIC_API_KEY` to production environment variables | Configuration | High |
| Edge case: customer wanting to modify an already-accepted quote — needs design | Feature | Low |
| Add `CRON_API_KEY` to production environment variables | Configuration | High |
| Design/UX audit — modern auto detailing aesthetic | Design | High |
| Phase 7 — QuickBooks Integration & Reporting | Feature | Medium |

### Data Notes
- **Revenue discrepancy:** Transactions Revenue = all transactions including anonymous walk-ins ($328,259 / 6,118 txns). Customer Lifetime Revenue = sum of `lifetime_spend` on named customers only ($187,617.47). 4,537 of 6,118 transactions have no `customer_id` (anonymous walk-ins).
- **Transaction date gap:** Square's first payment: May 8, 2021. Supabase `transaction_date` starts Dec 31, 2021 — early transactions may not have been imported.
- **Product/service images:** Stored in Supabase storage buckets `product-images/` and `service-images/`. 23 products have no images (never had them in Square). 2 services have no images (Excessive Cleaning Fee, Paint Decontamination & Protection — no Square counterparts). `service-images` bucket also allows `image/avif` MIME type (added accidentally, no impact).
- **Duplicate vendor pages:** `/admin/catalog/vendors` (372 lines) and `/admin/inventory/vendors` (400 lines) both exist. Inventory version is more complete (search, address, lead time fields). Should consolidate.
- **sms_delivery_log:** Twilio delivery status tracking. Indexes on `(message_sid)` UNIQUE, `(campaign_id, status)`, `(lifecycle_execution_id, status)`, `(customer_id, created_at)`, `(created_at)`.
- **tracked_links:** URL shortener registry for click tracking. `(short_code)` UNIQUE index.
- **link_clicks:** Click event log. Indexes on `(short_code, clicked_at)`, `(campaign_id, clicked_at)`, `(customer_id, clicked_at)`.
- **email_delivery_log:** Mailgun event tracking. Indexes on `(campaign_id, event)`, `(customer_id, created_at)`, `(mailgun_message_id)`, `(created_at)`.
- **campaign_variants:** A/B test variants per campaign. `variant_id` column added to `campaign_recipients`.
- **Migrations added:** `20260210000005` (sms_delivery_log), `20260210000006` (tracked_links + link_clicks), `20260210000007` (email_delivery_log), `20260210000008` (campaign_variants), `20260210000009` (campaigns: auto_select_winner BOOLEAN, auto_select_after_hours INTEGER), `20260210000010` (variant_id UUID FK on tracked_links + link_clicks, with partial indexes).
- **Messaging tables:** `conversations` (unique per phone_number, linked to customer_id if known) and `messages` (CASCADE delete with conversation). Both have Supabase Realtime enabled. AI auto-replies stored with `sender_type: 'ai'`, staff replies with `sender_type: 'staff'`.
- **Key messaging files:** `src/lib/services/messaging-ai.ts` (AI response generation, product search, coupon injection, system prompt builder), `src/lib/services/messaging-ai-prompt.ts` (default prompt template), `src/app/api/webhooks/twilio/inbound/route.ts` (Twilio webhook: AI routing, auto-quote, SMS splitting), `src/app/api/quotes/[id]/accept/route.ts` (acceptance + confirmation SMS), `src/app/admin/settings/messaging/page.tsx` (unified AI settings UI), `src/app/api/cron/quote-reminders/route.ts` (24hr unviewed quote nudge), `src/app/api/admin/messaging/[conversationId]/summary/route.ts` (conversation summary for staff), `src/proxy.ts` (middleware, renamed from middleware.ts).
- **Quote communications:** `quote_communications` table tracks all SMS/email sends for quotes (channel, sent_to, status, error_message, message, sent_by). Used by `send-service.ts` (manual sends), inbound webhook (auto-quote), accept route (acceptance SMS), and quote-reminders cron. `sent_by` is nullable — null for AI/system-generated sends. `message` column added for storing SMS body text (used by reminder cron for deduplication).
- **Lifecycle executions:** `lifecycle_executions` table tracks all automated SMS sends. Unique constraint on `(lifecycle_rule_id, appointment_id, transaction_id)` prevents duplicate scheduling. Indexes: `(status, scheduled_for) WHERE status='pending'` for cron pickup, `(lifecycle_rule_id, customer_id, created_at)` for 30-day dedup. Review URL short links are created once per cron batch and reused.
- **lifecycle_rules.coupon_id:** nullable FK to `coupons` table with `ON DELETE SET NULL`. Partial index on non-null values. Legacy `coupon_type`/`coupon_value`/`coupon_expiry_days` columns remain but are unused — form uses `coupon_id` exclusively.
- **sms_consent_log:** Audit table tracking all SMS consent changes. Source CHECK constraint: `inbound_sms`, `admin_manual`, `unsubscribe_page`, `booking_form`, `customer_portal`, `system`. RLS: authenticated users can read/write (admin pages insert directly via browser client).
- **Key TCPA files:** `src/lib/utils/sms-consent.ts` (shared consent helper), `src/app/api/webhooks/twilio/inbound/route.ts` (STOP/START handling + signature validation), `src/lib/utils/sms.ts` (`sendSms()` with MMS + logging, `sendMarketingSms()` with consent + frequency cap), `src/lib/utils/phone-validation.ts` (Twilio Lookup landline detection), `docs/TCPA_AUDIT.md` (full audit report).

---

## Key Architecture Notes

- **Supabase project:** `zwvahzymzardmxixyfim`
- **Super-Admin:** nayeem@smartdetailautospa.com
- **Staff:** Segundo Cadena (detailer), Joselyn Reyes (cashier), Joana Lira (cashier), Su Khan (admin)
- **Integrations:** Email: Mailgun | SMS: Twilio (+14244010094) | Payments: Stripe | AI: Anthropic Claude API (messaging auto-responder) | Cron: node-cron via instrumentation.ts (lifecycle-engine every 10 min, quote-reminders hourly)
- **Public pages:** Server Components for SEO. Admin pages: `'use client'` behind auth.

### Auth Patterns
- **Admin routes:** `createClient()` (cookie-based) + `supabase.auth.getUser()`, then `createAdminClient()` (service role) for data access
- **POS routes:** `authenticatePosRequest()` (HMAC) + `createAdminClient()`. Components use `usePosAuth()` + `posFetch()`
- **Customer portal:** `createClient()` with RLS — customers only see their own data
- **Session checks:** Use `getUser()` (server-validated) NOT `getSession()` (cached)
- **Session expiry:** `adminFetch()` from `@/lib/utils/admin-fetch` auto-redirects on 401

### Critical Rules
- **NEVER hardcode** business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`
- **Mobile business name:** Site header (`site-header.tsx`) shows "SD Auto Spa & Supplies" on mobile (<640px) and full `biz.name` on sm:+ to prevent header overflow. Uses `hidden sm:inline` / `sm:hidden` pattern.
- **Supabase `.or()` on related tables** doesn't work. Query related table first, then `.in('foreign_key', ids)`
- **Admin quotes are READ-ONLY.** All creation/editing via POS builder deep-links
- **POS deep-links:** `/pos/quotes?mode=builder` (new), `?mode=builder&quoteId=<id>` (edit), `?mode=detail&quoteId=<id>` (view)
- **Customer search:** 2-char min, 300ms debounce, digits → phone search, text → name search
- **Quotes use soft-delete** (`deleted_at` column). All quote queries MUST include `.is('deleted_at', null)` — except `quote-number.ts` (needs all quotes to prevent number reuse) and public quote page (needs deleted quotes for friendly messaging)
- **Messaging inbound webhook** (`/api/webhooks/twilio/inbound`) is unauthenticated (called by Twilio) but validates Twilio HMAC signature. Uses `createAdminClient()` for DB operations.
- **Messaging AI auto-disable:** When staff sends a manual reply to an AI-enabled conversation, `is_ai_enabled` is automatically set to false (human takeover).
- **Messaging AI prompt**: Behavioral rules in `src/lib/services/messaging-ai-prompt.ts` (client-importable, no server deps). Dynamic data (service catalog, products, business info, hours, active coupons with reward details) appended at runtime by `buildSystemPrompt()` in `src/lib/services/messaging-ai.ts`.
- **Auto-quote flow**: AI must collect first AND last name before generating `[GENERATE_QUOTE]` block. Block is parsed by `extractQuoteRequest()` in the inbound webhook. Creates customer (with consent + enthusiast tag), vehicle, quote record, and sends short link.
- **Quote acceptance SMS**: Sent automatically from `src/app/api/quotes/[id]/accept/route.ts` via `sendSms()`. Logged in `quote_communications`.
- **Product search in AI**: `searchRelevantProducts()` in `messaging-ai.ts` — keyword-triggered, searches `products` table with `.or()` on name/description, joins `product_categories` for category name. Only fires when product intent detected.
- **ANTHROPIC_API_KEY** must be in `.env.local` (and production env vars). Used by `src/lib/services/messaging-ai.ts`.
- **Lifecycle engine cron** (`/api/cron/lifecycle-engine`): Runs every 10 min via internal node-cron scheduler. Schedules + executes lifecycle rules. `lifecycle_executions` table tracks all scheduled/sent lifecycle SMS — 30-day per-customer-per-rule dedup. Never send review requests without checking: `sms_consent = true`, `google_review_requests` feature flag enabled, 30-day cooldown per customer per rule.
- **Review URLs**: Stored in `business_settings` as `google_review_url` and `yelp_review_url` (JSONB string values). Configurable from Admin > Settings > Reviews. Google Place ID: `ChIJf7qNDhW1woAROX-FX8CScGE`.
- **Lifecycle rules delay**: Total delay = `scheduled_for = triggered_at + (delay_days * 1440 + delay_minutes)` minutes. `delay_minutes` column added for sub-day granularity (e.g., 30-min review request delay).
- **Trigger condition canonical values**: `service_completed` (appointments) and `after_transaction` (transactions) — NEVER use `after_service`.
- **ALL cron/scheduling is internal** via `src/lib/cron/scheduler.ts` + `src/instrumentation.ts` — NEVER suggest n8n, Vercel Cron, or external schedulers.
- **App operates in PST timezone** (America/Los_Angeles). All time displays, logs, and scheduling logic should use PST, not UTC.
- **Automations coupon**: uses `coupon_id` FK to existing coupons table. NEVER recreate inline coupon fields — always select from existing coupons via `/admin/marketing/coupons`.
- **SMS consent helper** (`updateSmsConsent()`): ALWAYS use this for any code path that changes `sms_consent` on a customer. Never update `sms_consent` directly without also logging to `sms_consent_log`. Import from `@/lib/utils/sms-consent`.
- **sendMarketingSms() consent + frequency check**: All callers MUST pass `customerId` param. Function does defense-in-depth DB lookup of `sms_consent` (blocks if false) AND daily frequency cap check (blocks if exceeded). Logs warning if called without `customerId`.
- **ALL SMS MUST go through `sendSms()`** in `src/lib/utils/sms.ts`. NEVER call the Twilio API directly. `sendSms()` supports MMS via optional `{ mediaUrl }` param. NEVER add new SMS sending code that bypasses this utility.
- **SMS frequency cap**: `sendMarketingSms()` automatically checks `business_settings.sms_daily_cap_per_customer` (default 5). Counts both `campaign_recipients` and `lifecycle_executions` for the current PST day. Marketing SMS blocked when cap reached.
- **Phone validation**: `isValidMobileNumber()` from `src/lib/utils/phone-validation.ts` — OFF by default (`TWILIO_LOOKUP_ENABLED=true` to enable). Costs ~$0.005/lookup. Fails open. Wire into customer creation flows when enabled.
- **Twilio inbound webhook signature validation**: Active in production, skipped when `NODE_ENV=development`. Uses `crypto.timingSafeEqual()` for constant-time comparison. NEVER re-add `false &&` bypass.
- **Booking form consent**: SMS + email checkboxes are checked by default. For existing customers, consent only upgrades (true → true), never downgrades (true → false) via booking form. New customers get consent set from checkbox values. Admin "Add Customer" form also defaults both to checked.
- **sms_delivery_log** tracks Twilio delivery callbacks — always pass `statusCallback` URL in sends
- **tracked_links + link_clicks** for click tracking — `wrapUrlsInMessage()` auto-wraps URLs in marketing SMS
- **Mailgun webhook signing key**: `MAILGUN_WEBHOOK_SIGNING_KEY` env var required for production
- **Attribution window** configurable via `business_settings.attribution_window_days` (default: 7)
- **A/B testing**: `campaign_variants` table + `auto_select_winner`/`auto_select_after_hours` columns on `campaigns`. Winner determined by CTR via `determineWinner()`. Variants saved/loaded via POST/PATCH/GET routes (not in Zod schema — handled separately as they go to `campaign_variants` table).
- **Campaign wizard A/B round-trip**: `buildPayload()` always sends `variants` key (null when A/B off). PATCH checks `'variants' in body` to delete+reinsert. GET joins `campaign_variants` and maps to wizard format (`label`/`messageBody`/`emailSubject`/`splitPercentage`).
- **`{book_url}` placeholder**: Generates personalized booking link with customer name, phone, email, and coupon as query params. Auto-shortened by `wrapUrlsInMessage()`. Booking page (`/book`) accepts `?name`, `?phone`, `?email` params — tries email DB lookup first, falls back to URL params for pre-fill.
- **Click redirect is public** (no auth): `/api/t/[code]`
- **Dev testing requires ngrok running** — Twilio statusCallback and Mailgun webhooks need a public URL to receive callbacks during local development
- **CRON_SECRET** is a placeholder only used by `process-scheduled/route.ts` (falls back to admin session auth). **`CRON_API_KEY`** is the real auth key used by `scheduler.ts`, `lifecycle-engine`, and `quote-reminders`. Resolved in Session 4.
- **`{book_url}` vs `{offer_url}`**: Both use `NEXT_PUBLIC_APP_URL` as base. `{book_url}` = personalized (name, phone, email, coupon). `{offer_url}` = smart offer link with routing: service-targeted coupon → `/book?service=slug&coupon=code&email=...`, product-targeted coupon → `/products/<cat>/<prod>?coupon=code`, no coupon → `/book`. Email CTA button text adapts: "Book Now" vs "Shop Now". `{book_now_url}` kept as backward-compat alias in all send routes.
- **Template variable architecture**: `VARIABLE_GROUPS` object organizes vars into 6 groups (Customer Info, Business, Links, Loyalty & History, Coupons, Event Context). `CAMPAIGN_VARIABLES` = all groups except Event Context (16 vars). `AUTOMATION_ONLY_VARIABLES` = Event Context only (service_name, vehicle_info, appointment_date, appointment_time, amount_paid). `TEMPLATE_VARIABLES` = combined full set. `CAMPAIGN_GROUPS` / `ALL_GROUPS` arrays for UI rendering. `cleanEmptyReviewLines()` strips empty review link lines, orphaned connectors, and trailing colons.
- **New template variables**: `{business_phone}`, `{business_address}`, `{loyalty_points}`, `{loyalty_value}`, `{visit_count}`, `{days_since_last_visit}`, `{lifetime_spend}`, `{appointment_date}`, `{appointment_time}`, `{amount_paid}`. Added alongside existing vars.
- **`{vehicle_description}` removed**: Consolidated into `{vehicle_info}` everywhere. No code references `vehicle_description` anymore.
- **Campaign duplicate endpoint**: `POST /api/marketing/campaigns/[id]/duplicate` — creates draft copy with "(Copy)" suffix, copies A/B variants.
- **Campaign detail analytics paths**: `/admin/marketing/campaigns/[id]/analytics` — drill-down with summary KPIs, funnel, variant comparison, recipient table, click details, engagement timeline. API: `GET /api/admin/marketing/analytics/campaigns/[id]`
- **Coupon category validation**: `TicketItem.categoryId` holds `product.category_id` or `service.category_id`. Both ticket-reducer and quote-reducer populate this on `ADD_PRODUCT`/`ADD_SERVICE`. All cart item mappings pass `category_id` to validate/promotions endpoints. The validation logic in `coupon-helpers.ts` and `pos/coupons/validate` already matches on `item.category_id` — this field was just never sent before.
- **Phase 9 is Native Online Store** — NO WordPress/WooCommerce. Build cart, checkout, orders within this Next.js app. Product catalog pages already exist at `/products`.

---

## Production Deployment Checklist

### Environment Variables
| Variable | Dev Value | Production Value |
|----------|-----------|------------------|
| `NEXT_PUBLIC_APP_URL` | ngrok URL | `https://smartdetailsautospa.com` |
| `TWILIO_WEBHOOK_URL` | ngrok URL | `https://smartdetailsautospa.com/api/webhooks/twilio/inbound` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Already set | Verify matches Mailgun dashboard |
| `ANTHROPIC_API_KEY` | Set in .env.local | Must add to production env |
| `CRON_API_KEY` | Set in .env.local | Must add to production env |

### Twilio Configuration
- **Inbound webhook URL**: Must be set in Twilio console → Phone Numbers → Active Numbers → +14244010094 → Messaging → "A Message Comes In" → `https://smartdetailsautospa.com/api/webhooks/twilio/inbound`
- **Status callback**: Does NOT need manual config in Twilio dashboard — it's passed per-message via `statusCallback` parameter in `sendSms()`, which reads from `NEXT_PUBLIC_APP_URL` automatically

### Mailgun Configuration
- **Webhook URL**: Must be updated from ngrok dev URL to production URL in Mailgun dashboard
- **Path**: Sending → Webhooks
- **Production URL**: `https://smartdetailsautospa.com/api/webhooks/mailgun`
- **Events to configure** (all pointing to the same endpoint):
  - Delivered
  - Permanent Failure
  - Temporary Failure
  - Clicked
  - Complained
  - Unsubscribed

---

## Last Session: 2026-02-10

### Session 8 — Coupon Toggle Styling + Category Validation Fix
- **FIX 1 ({offer_url})**: Verified already complete from Session 7 — no code changes needed.
- **FIX 2 (coupon toggle styling)**: Fixed 2 inline toggles on `coupons/[id]/page.tsx` — status toggle `bg-gray-300` → `bg-gray-200`, auto-apply toggle `bg-blue-500` → `bg-green-500` and `bg-gray-300` → `bg-gray-200`. Now matches system-wide `Switch` component pattern.
- **FIX 3 (coupon category validation)**: Root cause — POS cart items never included `category_id`, so category-targeted coupons couldn't match. Fix: added `categoryId: string | null` to `TicketItem` interface, populated from `product.category_id`/`service.category_id` in both `ticket-reducer.ts` and `quote-reducer.ts` (`ADD_PRODUCT`, `ADD_SERVICE`, `ADD_CUSTOM_ITEM`), added `category_id` mapping in all 5 cart item serialization locations (`coupon-input.tsx`, `quote-coupon-input.tsx`, `ticket-context.tsx`, `promotions-tab.tsx` ×2).
- 8 files changed, TypeScript clean, committed and pushed.

### Session 7 — {offer_url} Smart Routing
- **Renamed `{book_now_url}` → `{offer_url}`** with smart routing: service-targeted coupon → `/book?service=slug&coupon=code&email=...`, product-targeted coupon → `/products/<categorySlug>/<productSlug>?coupon=code`, no coupon → `/book`.
- **Product slug lookup**: All 3 send routes now check `coupon_rewards[0].target_product_id`, look up product + category slug for direct product page deep links.
- **Email CTA button**: Dynamically shows "Shop Now" (product target) or "Book Now" (service/no target).
- **Backward compat**: `{book_now_url}` kept as alias in all templateVars — existing saved templates continue to work.
- 5 files changed (template.ts, send/route.ts, process-scheduled/route.ts, lifecycle-engine/route.ts, campaign-wizard.tsx), TypeScript clean.

### Session 6 — Template Variable Audit & Comprehensive Fix
- **Full template variable audit**: Mapped all 12 variables across 4 replacement sites (campaign send, scheduled send, lifecycle engine, preview). Documented which vars were defined, replaced, and actually worked.
- **Consolidated `{vehicle_description}`** → removed (identical to `{vehicle_info}`). Removed from `TEMPLATE_VARIABLES` and lifecycle engine.
- **Split `TEMPLATE_VARIABLES` into context-aware groups**: `CAMPAIGN_VARIABLES` (10 vars shown in campaign wizard) + `AUTOMATION_ONLY_VARIABLES` (`{service_name}` — only automations have event context). `TEMPLATE_VARIABLES` still exported as combined set for automation editors.
- **Fixed `{book_url}` missing** from `process-scheduled/route.ts` — was completely absent, now builds personalized URL with name/phone/email/coupon.
- **Fixed `SITE_URL` → `NEXT_PUBLIC_APP_URL`** throughout `process-scheduled/route.ts` (was using hardcoded production domain).
- **Fixed lifecycle engine `{book_now_url}`** — was missing service slug and email params. Now includes service slug from `appointment_services` and customer email. Added `email` to customer select query, updated `appointment_services` query to also fetch `slug`.
- **Added all missing vars to both campaign send routes**: `{google_review_link}`, `{yelp_review_link}` (read from `business_settings`, shortened via `createShortLink()`), `{vehicle_info}` (batch-loads most recent vehicle per customer), `{service_name}` (derived from coupon target service).
- **Added `cleanEmptyReviewLines()`** utility to `template.ts` — strips empty `⭐ Google:` / `⭐ Yelp:` lines after rendering. Used by all 3 send routes.
- **Campaign preview** now shows sample values for `vehicle_info`, `google_review_link`, `yelp_review_link`.
- **Campaign duplicate action** added to campaign list (POST `/api/marketing/campaigns/[id]/duplicate`). Copies all fields, generates "(Copy)" / "(Copy N)" name, copies A/B variants with `is_winner` reset. Redirects to edit page.
- **Campaign list column widths** balanced: Name 320px (~35%), other columns proportional.
- **Data audit** (`docs/AUDIT_VARIABLE_DATA.md`): 1,316 customers, 6,118 transactions, 134 vehicles (97% incomplete), 393 with loyalty points, 30 active services, 39 business settings keys. Key finding: vehicle data is very sparse (only 4 complete), email coverage only 6.4%.
- 6 files changed, TypeScript clean, all pushed.

### Session 5 — Campaign Analytics Drill-Down, A/B Variant Attribution
- Reordered Marketing sidebar sub-pages: Coupons(1) → Automations(2) → Campaigns(3) → Compliance → Analytics. Numbered circle badges on first 3 items.
- Built campaign detail analytics drill-down (`/admin/marketing/campaigns/[id]/analytics`): summary KPI cards, delivery funnel chart, A/B variant comparison, filterable/paginated recipient table, click details (by URL + recent activity), engagement timeline (72h hourly Recharts AreaChart). New API: `GET /api/admin/marketing/analytics/campaigns/[id]` with pagination, filtering (clicked/converted/failed/opted_out/delivered), sorting, revenue attribution.
- Fixed `campaign_recipients.clicked_at` not updating — click redirect handler (`/api/t/[code]`) now updates on first click.
- Fixed A/B variant click attribution — added `variant_id` column to `tracked_links` and `link_clicks` (migration 20260210000010). Threaded variant_id through full chain: `createTrackedLink()` → `wrapUrlsInMessage()` → `sendMarketingSms()` → campaign send route → click redirect → `getVariantStats()`.
- Analytics overview campaign table now links to drill-down (not campaign detail page).
- Campaign detail page shows "View Analytics" button for sent/completed campaigns.
- 7 new component files, 1 new API route, 1 migration, multiple file updates. TypeScript clean, all pushed.

### Session 4 — Campaign Bug Fixes + Personalized Booking Links
- Applied 5 tracking migrations to live DB (sms_delivery_log, tracked_links, link_clicks, email_delivery_log, campaign_variants)
- **BUG 1 — A/B testing persistence**: Added `auto_select_winner`/`auto_select_after_hours` columns to campaigns table (migration 20260210000009). Updated Zod schema, POST inserts campaign_variants, PATCH deletes+reinserts, GET joins and returns. `buildPayload()` always sends variants key (null when A/B off).
- **BUG 2 — Coupon codes**: Campaign send route was already correct. Fixed lifecycle engine — now generates unique coupon per recipient for rules with `coupon_id`, clones rewards from template.
- **BUG 3 — URL tracking**: Campaign sends already tracked. Fixed lifecycle engine — now passes `{ lifecycleExecutionId, source: 'lifecycle' }` to `sendMarketingSms()` so `wrapUrlsInMessage()` fires.
- **BUG 4 — Preview personalization**: `renderPreviewForCustomer()` now returns `{ variantA, variantB }`. Preview dialog shows both variants stacked. Sample coupon code only when coupon attached.
- **Personalized booking links**: New `{book_url}` template variable builds `/book?name=...&phone=...&email=...&coupon=...` per customer. Booking page accepts `?name`, `?phone` params with email DB lookup + URL fallback. URLs auto-shortened by click tracker.
- CRON_SECRET vs CRON_API_KEY audit: `CRON_API_KEY` is the active auth key (scheduler.ts, lifecycle-engine, quote-reminders). `CRON_SECRET` is a placeholder only used by process-scheduled route (falls back to admin session auth).
- Production deployment checklist added to CLAUDE.md
- 7 files changed, TypeScript clean, all pushed

### Session 3 — Phase 5 Completion (Campaign Analytics + A/B Testing)
- SMS delivery tracking: `sms_delivery_log` table + `/api/webhooks/twilio/status` webhook + `statusCallback` wired into all SMS sends
- Click tracking: `tracked_links` + `link_clicks` tables, `link-tracking.ts` utility (`createTrackedLink`, `wrapUrlsInMessage`), `/api/t/[code]` redirect endpoint, auto-wired into `sendMarketingSms()`
- Mailgun email tracking: `email_delivery_log` table, `mailgun-signature.ts` verification, `/api/webhooks/mailgun` webhook handler, `email-consent.ts` helper
- A/B testing backend: `campaign_variants` table + `variant_id` on `campaign_recipients`, `ab-testing.ts` (splitRecipients, determineWinner, getVariantStats)
- Revenue attribution: `attribution.ts` (getAttributedRevenue, getAttributedRevenueForPeriod), configurable window via `business_settings`
- Analytics APIs: 6 endpoints under `/api/admin/marketing/analytics/` — overview, campaigns, automations, coupons, audience, ab-tests
- Shared analytics helpers: `analytics-helpers.ts` (getPeriodDates, authenticateAdmin)
- 4 migrations: 20260210000005 through 20260210000008
- 15 commits, TypeScript clean (only pre-existing recharts module warning)

### Session 2 — TCPA High/Medium Issues (Issues 4-9)
- Enabled Twilio signature validation — removed `false &&` bypass, conditional on `NODE_ENV`
- Routed all SMS through shared utility — replaced 3 direct Twilio API calls:
  - `src/app/api/appointments/[id]/notify/route.ts` → `sendSms()`
  - `src/app/api/pos/appointments/[id]/notify/route.ts` → `sendSms()` (added import)
  - `src/lib/quotes/send-service.ts` → `sendSms()` with `{ mediaUrl }` for MMS PDF
- Extended `sendSms()` with optional `mediaUrl` param for MMS and structured console logging
- Added per-customer daily SMS frequency cap to `sendMarketingSms()` — checks `campaign_recipients` + `lifecycle_executions` against `business_settings.sms_daily_cap_per_customer` (default 5, PST timezone)
- Created `src/lib/utils/phone-validation.ts` — `isValidMobileNumber()` using Twilio Lookup API v2, off by default
- Fixed auto-quote email consent: `email_consent: false` for SMS-initiated customer creation
- Updated `docs/TCPA_AUDIT.md` — all 9 issues marked FIXED, scorecard updated to COMPLIANT
- Removed Twilio signature validation from CLAUDE.md pending tasks (resolved)
- TypeScript clean, committed and pushed (8 files, 129 insertions)

### Session 1 — TCPA Audit + Critical Fixes (Issues 1-3)
- TCPA compliance audit completed — all critical issues fixed
- Created `sms_consent_log` audit table with migration, TypeScript types, RLS policies
- Built `updateSmsConsent()` shared helper — centralized consent change logging
- Fixed STOP/START keyword handling in Twilio inbound webhook (added STOPALL, START, YES, UNSTOP)
- Switched quote reminders from `sendSms()` to `sendMarketingSms()` with consent check
- Added consent safety net to `sendMarketingSms()` — optional `customerId` for DB lookup
- Wired consent logging into all 6 paths: inbound SMS, unsubscribe page, compliance opt-out, admin customer pages, customer portal, booking form
- Added SMS + email consent checkboxes to booking form with TCPA disclosure text (dynamic business name)
- Added `customer_portal` to `sms_consent_log` source CHECK constraint
- Fixed customer profile API source from `'system'` to `'customer_portal'`
- Updated `docs/TCPA_AUDIT.md` with comprehensive audit report
- All migrations applied, type check clean, committed and pushed (21 files, 687 insertions)

### Next Session Priorities
1. Design/UX audit — modern auto detailing aesthetic (sleek, colorful, mobile-first). Must complete before Phase 9.
2. Phase 6 — Review stock & vendor pages, consolidate duplicate vendor pages (catalog vs inventory), then build PO/receiving/COGS.
3. Phase 7 — QuickBooks Integration & Reporting

---

## Session Instructions
- Update this file at end of session or when asked
- Reference `docs/PROJECT.md` for full specs, `docs/DASHBOARD_RULES.md` for admin UI structure
- Follow patterns in `docs/CONVENTIONS.md` for component APIs and auth
- POS files: use `usePosAuth()` (not `useAuth`), `posFetch()` (not `fetch`), `authenticatePosRequest()` in API routes
