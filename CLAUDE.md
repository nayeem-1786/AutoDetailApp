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
| `docs/DESIGN_SYSTEM.md` | Visual consistency rules — color palette, typography, spacing, component patterns, page layouts, status indicators, dark mode, responsive breakpoints, anti-patterns. Reference when building any UI. |
| `docs/QBO-INTEGRATION.md` | QuickBooks Online integration guide — architecture, entity mapping, OAuth setup, POS hooks, sync API, troubleshooting. Reference when touching QBO code. |
| `docs/PHASE8_JOB_MANAGEMENT.md` | Phase 8 job management & photo documentation spec — schema, workflows, UI specs, zone system, authorization flow. Reference when touching job/photo code. |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| **1** | Foundation, Auth & Data Model | Done |
| **2** | POS Application | Done |
| **3** | Booking, Quotes & 11 Labs API | Done |
| **4** | Customer Portal | Done |
| **5** | Marketing, Coupons & Campaigns | Done |
| **6** | Inventory Management | Done |
| **7** | QuickBooks Integration & Reporting | Done |
| **8** | Job Management & Photo Documentation | Done |
| **9** | Native Online Store | Not started |
| **10** | Recurring Services (Dormant) | Not started |
| **11** | Intelligence & Growth | Done |
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
- Performance fix: middleware eliminated self-fetch cascade (5-13s → 2-64ms) by querying Supabase directly instead of fetching `/api/internal/allowed-ips`. Excluded API routes from middleware matcher, externalized pdfkit/sharp via `serverExternalPackages`.
- **Middleware IP restriction**: `getClientIp()` treats `::1`/`127.0.0.1`/`::ffff:127.0.0.1` as null (local dev). IP check only enforces when a real public IP is present (`clientIp && !ips.includes(clientIp)`). Local/dev connections always pass through. Cache TTL is 10 seconds.
- **business_settings RLS**: `settings_write` policy uses `is_admin_or_above()` — both `super_admin` and `admin` roles can write. All 12 settings pages use `createClient()` (browser RLS), so this policy must allow admin writes.
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
- Duplicate toast fix — `catalog-browser.tsx` and `service-detail-dialog.tsx` skip local toasts when `onAddService`/`onAdd` callbacks are provided (callback mode). Toast ownership belongs to the caller.
- Service quantity enforcement — all non-per-unit services limited to qty=1 per ticket (one-per-vehicle rule). Per-unit services (Scratch Repair) increment `perUnitQty` up to `per_unit_max`. Visual checkmark badge on already-added services in catalog grid. Stepper restrictions in item rows: hidden for regular services, max-enforced for per-unit, unrestricted for products. New `TicketItem.perUnitMax` field + `UPDATE_PER_UNIT_QTY` reducer action. Applied to both quote-reducer and ticket-reducer.

### Verified Complete (previously listed as pending)
- Product edit/new pages — full forms with all fields, image upload, Zod validation, soft-delete
- Service edit/new pages — full forms (1,371 + 543 lines), most substantial catalog pages
- All 12 settings sub-pages built and functional: Business Profile (419), Tax Config (217), Mobile Zones (454), POS Favorites (594), POS Idle Timeout (155), Receipt Printer (574), POS Security (458), Card Reader (407), Coupon Enforcement (137), Feature Toggles (112), Audit Log (184), Messaging (new)
- Staff management (list, new, edit pages) with role-based auth (roles.ts + permissions.ts + use-permission hook)
- POS session caching bug — FIXED (cross-tab sync, 60s token expiry check, mount validation)
- Merge duplicate customers — BUILT (/admin/customers/duplicates with smart scoring, confidence levels, bulk merge)
- URL shortening — BUILT (/s/[code] redirect, short_links table, 6-char codes)

### Phase 6 — What's Done
- Stock overview page (`/admin/inventory` — 315 lines): product list with stock levels, low/out-of-stock filters, manual stock adjustment dialog, vendor column, reorder threshold display
- Vendor management: `/admin/inventory/vendors` (CRUD with search, address, lead time, min order amount fields).
- Purchase order system: list page with status filters/badge counts, create/edit forms with multi-product line items, approve/send workflow with status tracking (draft → sent → partial → received → cancelled)
- PO receiving workflow: receive-against-PO with quantity verification, variance flagging, auto-status update (partial/received), cost price updates on receive
- Low stock email alerts: daily cron (8 AM PST) with anti-spam logic (7-day cooldown per product unless stock changes), HTML email template with dark mode support
- Notification recipients settings (`/admin/settings/notifications`): CRUD for stock alert recipients, toggle active/inactive, auto-populate business email
- Dashboard low stock alert banner: links to filtered products view (`/admin/catalog/products?stock=low-stock`)
- Products page URL param support: `?stock=` query param initializes stock filter from external links
- COGS margin visibility: permission-gated Cost & Margin card on product detail page with margin calculation, color coding (green >40%, amber 20-40%, red <20%), cost history from PO receiving with clickable PO links
- Product forms: `min_order_qty` field added to both create and edit forms with Zod validation. `is_active` toggle added to create and edit forms (was missing — Services already had it).
- Stock status indicators: Unicode circle icons (🟢/🟡/🔴) on Products page and Vendor detail page
- DB tables: `purchase_orders`, `purchase_order_items`, `stock_adjustments`, `notification_recipients`, `stock_alert_log`
- Nav: Inventory section in admin sidebar (gated by `inventory_management` feature flag)
- Cron: stock-alerts job registered in scheduler (daily 16:00 UTC / 8 AM PST)
- `view_cost_data` permission: admin always sees cost/margin, grantable to other roles. Gates: Products page cost/margin columns, Vendor detail cost/margin columns, Product detail Cost & Margin card
- Vendor detail page (`/admin/inventory/vendors/[id]`): header with vendor info, products table with stock data, permission-gated cost/margin columns, last order date/qty from POs (clickable to PO detail)
- Stock Adjustment History (`/admin/inventory/stock-history`): full audit log of all stock changes (manual, PO received, count correction, damage, return). Filterable by product, reason, date range. Color-coded +/- changes, reference links to POs
- Quick Adjust dialog on Products page logs to `stock_adjustments` with reason selection (was silent direct update)
- PO create: product search scoped to selected vendor (strict filter — no null vendor leak). Vendor change clears line items with confirmation dialog
- PO display fix: nested product data reshaped (`products` → `product`) in both detail and list API routes. Was causing `--` display for product names/SKUs.
- PO receive updates `cost_price` on product (was only updating `quantity_on_hand`)
- Stock History: reason shows PO number (not UUID), clickable "View PO" reference link column added
- New PO page: "Create & Submit" (status=ordered) + "Save as Draft" buttons replace single create button

### Phase 7 — What's Done
- QBO client library with automatic OAuth token refresh (`src/lib/qbo/client.ts`)
- Settings helpers: `isQboSyncEnabled()`, `isQboConnected()`, `getQboSettings()` (`src/lib/qbo/settings.ts`)
- Sync engines: customer (`syncCustomerToQbo`, `syncCustomerBatch`), catalog (`syncServiceToQbo`, `syncProductToQbo`, `syncAllCatalog`), transaction (`syncTransactionToQbo`, `syncUnsynced`)
- OAuth routes: connect, callback, disconnect, status, settings, accounts
- Manual sync + retry + log API routes under `/api/admin/integrations/qbo/sync/`
- POS transaction hook: fire-and-forget QBO sync after completion
- POS customer creation hook: fire-and-forget sync when auto-sync enabled
- Settings UI: `/admin/settings/integrations/quickbooks` — connection management, sync toggles, account mapping (income + bank from QBO API), sync stats cards, sync log viewer with filters and expandable payloads. Links to Feature Toggles for master enable/disable.
- QBO sync badge component (`src/components/qbo-sync-badge.tsx`) on transaction detail page
- DB migration: `qbo_id`, `qbo_sync_status`, `qbo_sync_error`, `qbo_synced_at` columns; `qbo_sync_log` table; `business_settings` seeds
- Credential architecture: `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` stored as env vars (not in DB). Master toggle via `feature_flags` table (shown on Feature Toggles page). Sync-specific settings (auto-sync toggles, account mapping) in `business_settings`.
- `isQboSyncEnabled()` reads `qbo_enabled` from `feature_flags` table, then verifies connection via `isQboConnected()`
- QBO Auto-Sync cron job (`/api/cron/qbo-sync`): Runs every 30 min via internal scheduler. Catches unsynced transactions (limit 50), unsynced customers (limit 50), catalog changes, and retries failed transactions (1hr backoff, limit 10). Configurable interval via `qbo_auto_sync_interval` business setting (disabled/15/30/60 min).
- QBO Reporting dashboard: Reports tab on QuickBooks settings page with sync health cards, entity coverage progress bars, revenue chart (recharts area chart), recent sync activity table, and error summary. Period selector (7d/30d/90d/all). API: `GET /api/admin/integrations/qbo/reports?period=30d`
- CSV exports: Sync log export (`GET /api/admin/integrations/qbo/sync/log/export`) and revenue report export (`GET /api/admin/integrations/qbo/reports/export`). Both respect current filters, 5k row limit, entity name resolution.
- `source` column on `qbo_sync_log` table: tracks `auto` (cron), `manual` (admin UI), `pos_hook` (POS fire-and-forget), `eod_batch` (EOD close). Displayed in sync log table.
- Settings UI: Tab bar (Settings | Reports) on connected state. Auto-sync interval selector in Sync Settings section. Export CSV buttons on sync log and reports tab.
- EOD batch sync: `batchSyncDayTransactions()` in `src/lib/qbo/sync-batch.ts`, fire-and-forget from `src/app/api/pos/end-of-day/route.ts`. Syncs unsynced customers first, then transactions in batches of 25. Handles PST/PDT timezone correctly. Source: `eod_batch`. Never blocks register close.
- Realtime sync toggle: `qbo_realtime_sync` business setting (default: `true`). When OFF, POS transaction + customer hooks skip immediate QBO sync — transactions only sync at EOD close or via background cron. Toggle in Sync Settings section of QuickBooks settings page.

### Phase 11 — What's Done
Intelligence & Growth features were built organically across Phases 3, 5, 6, and 7:
- **Analytics dashboards**: Admin KPI overview, campaign analytics (delivery/clicks/A/B), customer analytics (lifetime value, repeat rate, at-risk), QBO reporting dashboard
- **AI & Automation**: Claude-powered SMS auto-responder with dynamic context (service catalog, hours, coupons, product knowledge), auto-quote generation, conversation summaries, multi-message splitting
- **Lifecycle automation engine**: 2-phase cron (schedule + execute), review request automation (Google/Yelp), template variables, 30-day dedup, coupon injection
- **Growth tools**: SMS + email campaign system with A/B testing, coupon/promo codes with eligibility rules, click tracking with link shortening, delivery status tracking (Twilio + Mailgun webhooks)
- **Customer intelligence**: Segmentation (enthusiast/professional), lifetime spend tracking, vehicle history, at-risk identification (90+ days inactive)
- **Operational intelligence**: Low stock alerts (daily cron, anti-spam, email notifications), PO workflow with receiving, QBO sync monitoring with error tracking, feature flag system (14 flags)

**Deferred to future phase**: Staff performance metrics (revenue/services per staff), predictive analytics (churn prediction, revenue forecasting, demand forecasting), service recommendation engine, automated re-engagement campaigns, sentiment analysis.

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
| ~~Consolidate duplicate vendor pages~~ | ~~Cleanup~~ | ~~Done~~ |
| Configure Twilio webhook URL for production (`/api/webhooks/twilio/inbound`) | Configuration | High |
| Add `ANTHROPIC_API_KEY` to production environment variables | Configuration | High |
| Edge case: customer wanting to modify an already-accepted quote — needs design | Feature | Low |
| Add `CRON_API_KEY` to production environment variables | Configuration | High |
| Design/UX audit — modern auto detailing aesthetic | Design | High |
| Add `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` to production env vars | Configuration | High |

### Data Notes
- **Revenue discrepancy:** Transactions Revenue = all transactions including anonymous walk-ins ($328,259 / 6,118 txns). Customer Lifetime Revenue = sum of `lifetime_spend` on named customers only ($187,617.47). 4,537 of 6,118 transactions have no `customer_id` (anonymous walk-ins).
- **Transaction date gap:** Square's first payment: May 8, 2021. Supabase `transaction_date` starts Dec 31, 2021 — early transactions may not have been imported.
- **Product/service images:** Stored in Supabase storage buckets `product-images/` and `service-images/`. 23 products have no images (never had them in Square). 2 services have no images (Excessive Cleaning Fee, Paint Decontamination & Protection — no Square counterparts). `service-images` bucket also allows `image/avif` MIME type (added accidentally, no impact).
- **product_images table:** Source of truth for multi-image support (up to 6 per product). Columns: `id`, `product_id` (FK CASCADE), `image_url`, `storage_path`, `sort_order`, `is_primary`, `created_at`. Partial unique index on `(product_id) WHERE is_primary = true`. DB trigger `sync_product_primary_image` auto-updates `products.image_url` on any change. 409 rows migrated from existing `products.image_url`. Storage path pattern: `products/{productId}/{uuid}.{ext}`.
- **Vendor pages consolidated:** `/admin/inventory/vendors` (moved from catalog, single canonical location).
- **sms_delivery_log:** Twilio delivery status tracking. Indexes on `(message_sid)` UNIQUE, `(campaign_id, status)`, `(lifecycle_execution_id, status)`, `(customer_id, created_at)`, `(created_at)`.
- **tracked_links:** URL shortener registry for click tracking. `(short_code)` UNIQUE index.
- **link_clicks:** Click event log. Indexes on `(short_code, clicked_at)`, `(campaign_id, clicked_at)`, `(customer_id, clicked_at)`.
- **email_delivery_log:** Mailgun event tracking. Indexes on `(campaign_id, event)`, `(customer_id, created_at)`, `(mailgun_message_id)`, `(created_at)`.
- **campaign_variants:** A/B test variants per campaign. `variant_id` column added to `campaign_recipients`.
- **Migrations added:** `20260210000005` (sms_delivery_log), `20260210000006` (tracked_links + link_clicks), `20260210000007` (email_delivery_log), `20260210000008` (campaign_variants), `20260210000009` (campaigns: auto_select_winner BOOLEAN, auto_select_after_hours INTEGER), `20260210000010` (variant_id UUID FK on tracked_links + link_clicks, with partial indexes), `20260211000010` (product_images table + trigger + data migration).
- **notification_recipients:** Email recipients for stock alerts. Unique constraint on `(email, notification_type)`. Types: `low_stock`, `all`. Toggle `is_active` to pause without deleting.
- **stock_alert_log:** Anti-spam tracker for stock alerts. Records `(product_id, stock_level, alert_type)`. Cron checks: skip if stock level unchanged AND last alert < 7 days ago.
- **Messaging tables:** `conversations` (unique per phone_number, linked to customer_id if known) and `messages` (CASCADE delete with conversation). Both have Supabase Realtime enabled. AI auto-replies stored with `sender_type: 'ai'`, staff replies with `sender_type: 'staff'`.
- **Key messaging files:** `src/lib/services/messaging-ai.ts` (AI response generation, product search, coupon injection, system prompt builder), `src/lib/services/messaging-ai-prompt.ts` (default prompt template), `src/app/api/webhooks/twilio/inbound/route.ts` (Twilio webhook: AI routing, auto-quote, SMS splitting), `src/app/api/quotes/[id]/accept/route.ts` (acceptance + confirmation SMS), `src/app/admin/settings/messaging/page.tsx` (unified AI settings UI), `src/app/api/cron/quote-reminders/route.ts` (24hr unviewed quote nudge), `src/app/api/admin/messaging/[conversationId]/summary/route.ts` (conversation summary for staff), `src/middleware.ts` (Next.js middleware — IP restriction, session refresh, auth redirects).
- **Quote communications:** `quote_communications` table tracks all SMS/email sends for quotes (channel, sent_to, status, error_message, message, sent_by). Used by `send-service.ts` (manual sends), inbound webhook (auto-quote), accept route (acceptance SMS), and quote-reminders cron. `sent_by` is nullable — null for AI/system-generated sends. `message` column added for storing SMS body text (used by reminder cron for deduplication).
- **Lifecycle executions:** `lifecycle_executions` table tracks all automated SMS sends. Unique constraint on `(lifecycle_rule_id, appointment_id, transaction_id)` prevents duplicate scheduling. Indexes: `(status, scheduled_for) WHERE status='pending'` for cron pickup, `(lifecycle_rule_id, customer_id, created_at)` for 30-day dedup. Review URL short links are created once per cron batch and reused.
- **lifecycle_rules.coupon_id:** nullable FK to `coupons` table with `ON DELETE SET NULL`. Partial index on non-null values. Legacy `coupon_type`/`coupon_value`/`coupon_expiry_days` columns remain but are unused — form uses `coupon_id` exclusively.
- **sms_consent_log:** Audit table tracking all SMS consent changes. Source CHECK constraint: `inbound_sms`, `admin_manual`, `unsubscribe_page`, `booking_form`, `customer_portal`, `system`. RLS: authenticated users can read/write (admin pages insert directly via browser client).
- **Key TCPA files:** `src/lib/utils/sms-consent.ts` (shared consent helper), `src/app/api/webhooks/twilio/inbound/route.ts` (STOP/START handling + signature validation), `src/lib/utils/sms.ts` (`sendSms()` with MMS + logging, `sendMarketingSms()` with consent + frequency cap), `src/lib/utils/phone-validation.ts` (Twilio Lookup landline detection), `docs/TCPA_AUDIT.md` (full audit report).
- **Key inventory files:** `src/app/admin/catalog/products/page.tsx` (products with stock management), `src/app/admin/inventory/vendors/page.tsx` (vendor list), `src/app/admin/inventory/vendors/[id]/page.tsx` (vendor detail with products), `src/app/admin/inventory/purchase-orders/` (PO list/create/detail+receive), `src/app/admin/inventory/stock-history/page.tsx` (stock adjustment log), `src/app/api/admin/purchase-orders/` (PO CRUD + receiving API), `src/app/api/admin/stock-adjustments/route.ts` (stock adjustment API), `src/app/api/cron/stock-alerts/route.ts` (daily stock alert cron), `src/app/api/admin/notification-recipients/route.ts` (recipients CRUD), `src/app/admin/settings/notifications/page.tsx` (notification settings UI).
- **Key QBO files:** `src/lib/qbo/client.ts` (API client with token refresh, query, CRUD methods), `src/lib/qbo/settings.ts` (read/write QBO settings, `isQboSyncEnabled()`, `isQboConnected()`), `src/lib/qbo/types.ts` (all QBO TypeScript types), `src/lib/qbo/sync-customer.ts` (customer sync engine), `src/lib/qbo/sync-catalog.ts` (service/product sync engine), `src/lib/qbo/sync-transaction.ts` (transaction → Sales Receipt sync), `src/lib/qbo/sync-log.ts` (sync log helpers with `source` param), `src/lib/qbo/index.ts` (barrel exports), `src/app/api/admin/integrations/qbo/` (OAuth + settings + sync + accounts + reports routes), `src/app/api/admin/integrations/qbo/reports/route.ts` (reporting dashboard API), `src/app/api/admin/integrations/qbo/reports/export/route.ts` (revenue CSV export), `src/app/api/admin/integrations/qbo/sync/log/export/route.ts` (sync log CSV export), `src/app/api/cron/qbo-sync/route.ts` (auto-sync cron endpoint), `src/app/admin/settings/integrations/quickbooks/page.tsx` (settings + reports UI with tabs), `src/components/qbo-sync-badge.tsx` (reusable sync status badge), `docs/QBO-INTEGRATION.md` (integration documentation).

---

## Key Architecture Notes

- **Supabase project:** `zwvahzymzardmxixyfim`
- **Super-Admin:** nayeem@smartdetailautospa.com
- **Staff:** Segundo Cadena (detailer), Joselyn Reyes (cashier), Joana Lira (cashier), Su Khan (admin)
- **Integrations:** Email: Mailgun | SMS: Twilio (+14244010094) | Payments: Stripe | AI: Anthropic Claude API (messaging auto-responder) | Accounting: QuickBooks Online (OAuth, env vars `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`) | Cron: node-cron via instrumentation.ts (lifecycle-engine every 10 min, quote-reminders hourly, stock-alerts daily 8 AM PST, qbo-sync every 30 min)
- **Public pages:** Server Components for SEO. Admin pages: `'use client'` behind auth.

### Auth Patterns
- **Admin routes:** `createClient()` (cookie-based) + `supabase.auth.getUser()`, then `createAdminClient()` (service role) for data access
- **POS routes:** `authenticatePosRequest()` (HMAC) + `createAdminClient()`. Components use `usePosAuth()` + `posFetch()`
- **Customer portal:** `createClient()` with RLS — customers only see their own data
- **Session checks:** Use `getUser()` (server-validated) NOT `getSession()` (cached)
- **Session expiry:** `adminFetch()` from `@/lib/utils/admin-fetch` auto-redirects on 401

### Critical Rules
- **POS access = PIN presence.** No role-based gating. Set a PIN on an employee → they can log into POS. Clear the PIN → they can't. `roles.can_access_pos` is unused. Staff detail page shows a single combined field (PIN input + Enabled/Disabled pill). Login and lock screens share `PinScreen` component (`src/app/pos/components/pin-screen.tsx`).
- **Customer types:** `enthusiast` (retail, personal use), `professional` (detailers, body shops, dealers, bulk buyers), and `unknown` (NULL, unclassified — targetable segment). The term "Detailer" as a customer type label is deprecated — always use "Professional". DB column: `customers.customer_type`. Badge cycles: `null → enthusiast → professional → null`.
- **NEVER hardcode** business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`
- **Mobile business name:** Site header (`site-header.tsx`) shows "SD Auto Spa & Supplies" on mobile (<640px) and full `biz.name` on sm:+ to prevent header overflow. Uses `hidden sm:inline` / `sm:hidden` pattern.
- **Supabase `.or()` on related tables** doesn't work. Query related table first, then `.in('foreign_key', ids)`
- **Admin quotes are READ-ONLY.** All creation/editing via POS builder deep-links
- **POS deep-links:** `/pos/quotes?mode=builder` (new), `?mode=builder&quoteId=<id>` (edit), `?mode=detail&quoteId=<id>` (view), `?mode=builder&walkIn=true` (walk-in mode)
- **Walk-in mode:** Jobs tab "New Walk-In" → opens quote builder in walk-in mode. Hides "Valid Until" + "Send Quote", shows "Create Job". Saves quote as `converted`, creates job via `POST /api/pos/jobs` with `quote_id`. Old walk-in wizard (`walk-in-flow.tsx`) deleted.
- **Quote-to-job conversion:** "Create Job" button on quote detail (draft/sent/viewed/accepted) creates job from quote services. `jobs.quote_id` FK for audit trail. Server-side duplicate prevention.
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
- **ALL cron/scheduling is internal** via `src/lib/cron/scheduler.ts` + `src/instrumentation.ts` — NEVER suggest n8n, Vercel Cron, or external schedulers. Jobs: lifecycle-engine (every 10 min), quote-reminders (hourly), stock-alerts (daily 8 AM PST), qbo-sync (every 30 min).
- **App operates in PST timezone** (America/Los_Angeles). All time displays, logs, and scheduling logic should use PST, not UTC.
- **Automations coupon**: uses `coupon_id` FK to existing coupons table. NEVER recreate inline coupon fields — always select from existing coupons via `/admin/marketing/coupons`.
- **SMS consent helper** (`updateSmsConsent()`): ALWAYS use this for any code path that changes `sms_consent` on a customer. Never update `sms_consent` directly without also logging to `sms_consent_log`. Import from `@/lib/utils/sms-consent`.
- **sendMarketingSms() consent + frequency check**: All callers MUST pass `customerId` param. Function does defense-in-depth DB lookup of `sms_consent` (blocks if false) AND daily frequency cap check (blocks if exceeded). Logs warning if called without `customerId`.
- **ALL SMS MUST go through `sendSms()`** in `src/lib/utils/sms.ts`. NEVER call the Twilio API directly. `sendSms()` supports MMS via optional `{ mediaUrl }` param. NEVER add new SMS sending code that bypasses this utility.
- **SMS frequency cap**: `sendMarketingSms()` automatically checks `business_settings.sms_daily_cap_per_customer` (default 5). Counts both `campaign_recipients` and `lifecycle_executions` for the current PST day. Marketing SMS blocked when cap reached.
- **Phone validation**: `isValidMobileNumber()` from `src/lib/utils/phone-validation.ts` — OFF by default (`TWILIO_LOOKUP_ENABLED=true` to enable). Costs ~$0.005/lookup. Fails open. Wire into customer creation flows when enabled.
- **QBO credentials**: `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` are env vars — NEVER store in DB. Settings UI shows "configured" status from env, not editable fields.
- **QBO master toggle**: `feature_flags` table `qbo_enabled` row is the sole on/off switch (Feature Toggles page). `isQboSyncEnabled()` checks `feature_flags` + connection status. No `qbo_enabled` in `business_settings`.
- **QBO sync engines**: All sync functions check `isQboSyncEnabled()` first. POS hooks are fire-and-forget (never block POS). Walk-in customer and miscellaneous item fallbacks for anonymous/deleted references. PST date formatting for QBO.
- **QBO API**: All requests go through `QboClient.request()` which handles token refresh on 401. `QboApiError` for structured error handling. Query method uses QBO SQL-like syntax.
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
- **QBO Integration**: Master toggle is `qbo_enabled` in `feature_flags` table (shown on Feature Toggles page). Credentials (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`) in env vars — NEVER in DB. OAuth tokens in `business_settings`. Source of truth is ALWAYS the Smart Details app (Supabase). QBO is a one-way accounting mirror. POS hooks are fire-and-forget — NEVER block POS for QBO. All TxnDate values in PST (America/Los_Angeles). Client library at `src/lib/qbo/`. `isQboSyncEnabled()` checks `feature_flags` + connection status.
- **Jobs store services as JSONB snapshots**: `services` column on `jobs` table holds `[{id, name, price}]` at creation time. Price changes in the catalog do NOT retroactively affect existing jobs.
- **Job auto-population**: When the Jobs tab loads, it calls `POST /api/pos/jobs/populate` to create job records from today's confirmed/in_progress appointments that don't already have matching jobs (deduped by `appointment_id`). This is the bridge between the booking/appointment system and the POS jobs queue. Endpoint is idempotent — uses `.upsert()` with `ignoreDuplicates: true` + partial unique index on `jobs(appointment_id)`. Client has `useRef` guard to prevent React strict mode double-fire.
- **POS Services API** (`GET /api/pos/services`): Dedicated endpoint for walk-in service selection. The existing `useCatalog()` hook uses direct Supabase (cookie auth) which doesn't work with HMAC-authenticated POS API context.
- **photo_documentation flag** (default ON): Core POS feature. Gates photo capture during intake/progress/completion phases.
- **photo_gallery flag** (default OFF): Gates the public gallery page at `/gallery`. When disabled, shows "Coming Soon" page. Does NOT affect admin photo gallery or customer portal photos (those use `photo_documentation` flag).
- **Internal photos** (`is_internal = true`): MUST NEVER appear in customer-facing views (portal, public gallery, customer detail Photos tab). Only visible in admin photo gallery and POS job detail. All customer-facing queries filter `is_internal = false`.
- **Admin photo gallery** (`/admin/photos`): Browse all job photos with filters. Permission-gated: `admin.photos.view` for viewing, `admin.photos.manage` for featured/internal toggles and bulk actions. Feature flag: `photo_documentation`.
- **Customer portal Service History** (`/account/services`): Clean row-style visit list of completed/closed jobs. Each row: date, vehicle, services, addon count, photo count, status pill. Vehicle filter dropdown. "Load more" pagination (10/page). Click → detail page.
- **Service Detail page** (`/account/services/[jobId]`): Full service summary (date, vehicle, services with prices, approved addons, duration, staff). Expandable before/after photos section with zone-by-zone BeforeAfterSliders. Link to public gallery. Auth: verifies job belongs to customer.
- **Old `/account/photos`**: Redirects to `/account/services`. API at `/api/account/photos` still exists (used by dashboard Last Service card).
- **Last Service card** on `/account` dashboard: Shows most recent completed job with date, vehicle, services, and 1 featured before/after `BeforeAfterSlider` (prefers exterior zones). "View service history" link to `/account/services`. Only visible when customer has completed jobs with photos.
- **Public gallery** (`/gallery`): Server Component for SEO. Only shows `is_featured = true` AND `is_internal = false` photos with both intake + completion (before/after pairs). NO customer data exposed — only vehicle make/model and service names.
- **AI addon authorization**: `buildSystemPrompt()` injects pending addon context when `customerId` provided. AI outputs `[AUTHORIZE_ADDON:uuid]` / `[DECLINE_ADDON:uuid]` blocks, parsed by `extractAddonActions()` in Twilio webhook. Blocks stripped before sending customer-facing message. Pattern mirrors `extractQuoteRequest()`.
- **Flag flow issue types**: Detailers select from 10 predefined issue types (scratches, water_spots, paint_damage, pet_hair_stains, interior_stains, odor, headlight_haze, wheel_damage, tar_sap_overspray, other) instead of picking from the service catalog. Stored as `issue_type` + `issue_description` on `job_addons` table. DB CHECK constraint enforces valid values. Utility: `src/lib/utils/issue-types.ts` — `getIssueHumanReadable()`, `getIssueLabel()`, `friendlyServiceName()`.
- **Flag flow steps**: issue-type → zone-select → photo → catalog → discount → delay → message → preview. First step uses large tappable 2-column grid buttons. "Other" shows textarea for custom description.
- **Addon SMS format**: Conversational tone, no MMS attachment (`mediaUrl` removed). Format: `Hi {first_name}, while working on your {make model} we noticed {issue}. We recommend {friendly_service} for ${price}. {auth_link} — {detailer_name}, {business_name}`. Detailer first name fetched from employees table.
- **Addon authorization page** (`/authorize/[token]`): Header "Additional Service Authorization Request". Shows detailer name, issue description, inspection photos, service name + description from catalog, "Additional Cost" (large), "New Ticket Total" (sum of all job services + approved addons + this addon). Full-width stacked Approve/Decline buttons (48px+ height). Business footer from `getBusinessInfo()`.
- **Job queue addon badges**: Pill badges on job cards. States: "⚑ Addon Pending" (amber), "✓ Addon Approved" (green), "✗ Addon Declined" (gray). Priority: pending > approved > declined. Function: `getAddonBadge()` in `job-queue.tsx`.
- **Checkout permission check**: `GET /api/pos/jobs/[id]/checkout-items` now has explicit `checkPosPermission(pos.jobs.view)` check. Frontend distinguishes 403/404/other errors with specific toast messages.
- **Migration**: `20260212000011_addon_issue_type.sql` — adds `issue_type` TEXT and `issue_description` TEXT columns to `job_addons` with CHECK constraint.
- **Job completion flow**: `POST /api/pos/jobs/[id]/complete` — generates `gallery_token`, auto-selects featured photos, fires-and-forgets SMS (MMS) + email notifications. Zone picker in completion mode shows intake photos for side-by-side reference.
- **Gallery token**: UUID on `jobs.gallery_token` column. Generated at completion time. Public gallery at `/jobs/[token]/photos` — Server Component, no auth required.
- **Job checkout auto-linking**: POS transactions route has fire-and-forget hook — after creating transaction for a customer, finds their most recent completed (unlinked) job, sets `transaction_id` and `status='closed'`. Never blocks POS.
- **Job status workflow**: `scheduled → intake → in_progress → pending_approval → completed → closed` (also `cancelled`). Jobs bridge appointments → jobs → transactions.
- **Job timer formula**: If paused → `timer_seconds` (static). If running → `timer_seconds + (now - work_started_at)`. All state in DB, client derives display.
- **Photo minimums**: Configurable via `business_settings`: `min_intake_photos_exterior` (4), `min_intake_photos_interior` (2), same for completion. Counts unique zones with >=1 photo.
- **Zone keys**: 8 exterior + 7 interior. Defined in `src/lib/utils/job-zones.ts`.
- **Supabase Storage bucket**: `job-photos/` with path `{job_id}/{uuid}.jpg` + `{job_id}/{uuid}_thumb.jpg`. Public read, authenticated write.
- **Phase 9 is Native Online Store** — NO WordPress/WooCommerce. Build cart, checkout, orders within this Next.js app. Product catalog pages already exist at `/products`.
- **Feature flag checks (server-side)**: Use `isFeatureEnabled(key)` from `src/lib/utils/feature-flags.ts` for all API route flag checks. Uses `createAdminClient()` (service role). Fails closed. Import `FEATURE_FLAGS` from constants for key names.
- **sms_marketing flag**: Gates campaign SMS sends (immediate + scheduled) and lifecycle engine Phase 2. Does NOT gate transactional SMS (appointment reminders, quote notifications, STOP/START processing).
- **email_marketing flag**: Gates campaign email sends (immediate + scheduled). Does NOT gate transactional emails (booking confirmations, password resets, quote PDFs).
- **two_way_sms flag**: Gates conversation creation, AI auto-responder, after-hours replies, auto-quote, staff inbox UI, and sidebar badges. STOP/START keyword processing and `sms_consent_log` updates are ALWAYS active regardless of this flag (TCPA compliance). The AI Assistant sub-toggle in messaging settings only applies when `two_way_sms` is ON. Inbound webhook order: signature validation → parse → customer lookup → STOP/START consent → feature flag check → conversation/AI/auto-quote.
- **Feature flag categories**: Core POS, Marketing, Communication, Booking, Integrations, Operations, Future. "Future" flags are placeholders for upcoming phases — visually distinct on the Feature Toggles page with "Coming Soon" badge.
- **inventory_management flag**: Gates inventory section visibility in admin sidebar. When disabled, hides Stock Overview and Vendors nav items.
- **online_store flag**: Phase 9 placeholder. Will gate shopping cart/checkout when built.
- **referral_program removed**: Dead flag with no code or roadmap. Deleted in Session 4 cleanup.
- **loyalty_rewards flag**: Gates points accumulation (POS earn route + transaction completion), redemption (POS redeem route), POS loyalty panel, quote loyalty panel, customer portal loyalty page, and portal loyalty API. Existing points preserved when disabled. Server-side: `isFeatureEnabled()` in earn/redeem/transaction routes + customer loyalty API. Client-side: `useFeatureFlag()` in loyalty-panel, quote-loyalty-panel, portal loyalty page.
- **cancellation_fee flag**: Gates the fee input field in cancel-appointment-dialog and fee processing in cancel API route. The cancel action itself still works — just without a fee. Server-side: cancel route sets fee to null when disabled. Client-side: `useFeatureFlag()` hides fee input. Booking flow disclaimer conditionally shows "$50 fee" text only when enabled.
- **mobile_service flag**: Gates mobile/on-location booking option. Server-side: `getMobileZones()` returns empty array when disabled; book API route rejects mobile bookings when disabled. Client-side: step-configure hides mobile toggle when no zones available. Mobile Zones settings page shows warning banner when disabled (page still accessible for configuration).

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
| `QBO_CLIENT_ID` | Set in .env.local | Must add to production env |
| `QBO_CLIENT_SECRET` | Set in .env.local | Must add to production env |

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

## Last Session: 2026-02-13 (Session 52 — Customer Portal: Service Records Restructure)
- **New `/account/services` page**: Clean row-style visit list — date, vehicle, services, addon count, photo count, status pill (green/slate). Vehicle filter dropdown. Load more pagination (10/page). Click → detail page.
- **New `/account/services/[jobId]` detail page**: Service summary with prices, approved addons ("Additional services added during your visit"), duration (formatted from timer_seconds), staff attribution. Expandable before/after photos section with zone-by-zone BeforeAfterSliders. Link to public gallery.
- **New APIs**: `GET /api/account/services` (paginated visit list with counts), `GET /api/account/services/[jobId]` (full detail with photos/addons/staff). Both use cookie auth + customer ownership verification.
- **Nav updated**: "Photos" → "Service History" in portal tabs. Dashboard link → "View service history". Old `/account/photos` redirects to `/account/services`.
- **Admin sidebar**: "Photos" → "Service Records" with children (All Jobs + Photo Gallery)
- Files created: `src/app/(account)/account/services/page.tsx`, `src/app/(account)/account/services/[jobId]/page.tsx`, `src/app/api/account/services/route.ts`, `src/app/api/account/services/[jobId]/route.ts`
- Files modified: `account-shell.tsx`, `account/page.tsx`, `account/photos/page.tsx` (redirect), `admin-shell.tsx`, `roles.ts`
- TypeScript clean (zero errors)

### Session 50 — 2026-02-13 (Customer Portal Photo History Enhancements)
- **Enhanced /api/account/photos API**: Added pagination (`page`/`limit`), vehicle filter (`vehicle_id`), restructured response with photos grouped by phase (intake/completion), added `zone_label`, `photo_count`, `vehicles` array for filter dropdown, excluded progress-phase photos
- **Enhanced /account/photos page**: Vehicle filter dropdown (shown when multiple vehicles), "Load more" pagination with count display, fullscreen photo lightbox (close, left/right navigation, counter, download), improved zone-by-zone before/after matching
- **Last Service card on /account dashboard**: Shows most recent completed job date, vehicle, services. Features 1 `BeforeAfterSlider` pair (prefers exterior zones). "View all photos" link. Only visible with completed jobs with photos.
- **Enhanced admin photos API**: Added search (customer name/phone), page/limit pagination, featured filter
- Files: `src/app/api/account/photos/route.ts`, `src/app/(account)/account/photos/page.tsx`, `src/app/(account)/account/page.tsx`, `src/app/api/admin/photos/route.ts`
- TypeScript clean (zero errors)

### Session 45 — 2026-02-12 (Flag Flow Fixes)
- **Flag flow annotated images**: Annotations (circles, arrows, text) now rendered on customer-facing authorization page via `AnnotationOverlay`, and burned into MMS/email images server-side via `sharp` compositing (`src/lib/utils/render-annotations.ts`). Preview step also shows annotations.
- **Flag flow vehicle-size pricing**: Replaced flat $0.00 catalog list with `CatalogBrowser` + `ServicePricingPicker`. Tabs for Services/Products/Custom. Vehicle `size_class` passed through for correct pricing.
- **Flag flow quantity rules**: `addedServiceIds` built from `job.services` + approved `job.addons`. Duplicate services blocked with warning toast. Per-unit max enforced via `PerUnitPicker`.
- Files: `src/lib/utils/render-annotations.ts` (new), `src/app/authorize/[token]/page.tsx`, `src/app/api/pos/jobs/[id]/addons/route.ts`, `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts`, `src/app/pos/jobs/components/flag-issue-flow.tsx`, `docs/CHANGELOG.md`, `docs/PHASE8_JOB_MANAGEMENT.md`
- TypeScript clean (zero errors)

## Session 40 — 2026-02-12 (Completion SMS, Job-to-Checkout, Gallery Addons + Timestamp)
- **Completion SMS rewrite**: Removed MMS `mediaUrl` (no raw image link). Vehicle = make + model only. Added business name, address, phone, today's closing time (from `business_hours` setting, PST). Email updated with same business info footer.
- **Job → POS Checkout flow**: "Checkout" button on completed job detail (primary action). "Checkout" pill on completed job cards in queue. Loads checkout-items into POS register via `RESTORE_TICKET`. "Paid" badge on closed jobs. Double-checkout prevention (API returns 400 for closed jobs). Checkout-items response enriched with `is_taxable` + `category_id`.
- **Gallery addons**: Gallery page (`/jobs/[token]/photos`) and API now include approved addons in "Services Performed" section with resolved service names and final prices.
- **Gallery timestamp**: Completion date includes time — "Thursday, February 12, 2026 at 5:23 PM" (PST).

## Session 39 — 2026-02-12 (Walk-In Job Fix + Product & Coupon Checkout Bridge)
- **Walk-in job creation fix**: Added defensive `serviceId` null check in service item filter. Only items with `itemType === 'service' && serviceId` are mapped to job services. Prevents null service IDs from reaching the job creation API.
- **Product checkout bridge**: `GET /api/pos/jobs/[id]/checkout-items` now checks `job.quote_id`. If a linked quote exists, queries `quote_items` for product items (`product_id IS NOT NULL`) and includes them in the response with `item_type: 'product'`.
- **Coupon checkout bridge**: New `coupon_code TEXT` column on `quotes` table (migration `20260212000010`). All quote save paths (Save Draft, Send Quote, Create Job) now persist `coupon_code`. Checkout-items route reads `coupon_code` from linked quote and returns it so the register can auto-apply.
- **Quote→Job→Checkout flow**: Quote stores all items (services + products + coupon). Job stores only services. Checkout loads services from job JSONB + products from `quote_items` + coupon from `quotes.coupon_code`.
- TypeScript clean (zero errors)

### Session 37 — Job Source Badge + Editable Job Detail
- **Job source badge**: Walk-In (amber, Footprints icon) vs Appointment (purple, Calendar icon) pill badge on both job queue cards and job detail header. Derived from `appointment_id` presence.
- **Editable job detail card**: Customer, vehicle, services, and notes are now editable on the job detail page.
  - All edits gated by `pos.jobs.manage` permission (client-side `usePosPermission` + server-side `checkPosPermission`)
  - Edits blocked on terminal statuses (completed, closed, cancelled) — `isEditable` computed flag
  - Edit Customer: bottom sheet modal with `CustomerLookup` component
  - Edit Vehicle: bottom sheet modal with customer's vehicle list + "No vehicle" option
  - Edit Services: full modal with search, multi-select toggle, running total
  - Edit Notes: inline editable textarea with save/cancel
- **PATCH API enhanced**: `MANAGE_FIELDS` (customer_id, vehicle_id, services, intake_notes) separated from `WORKFLOW_FIELDS`. Manage fields require `pos.jobs.manage` + non-terminal status.
- **New Vehicle card**: Job detail now shows vehicle info in its own editable card section.
- TypeScript clean (zero errors)

### Session 34 — Detailer Reassignment + Cancel Permission Gating
- **Detailer reassignment on job detail**: Assigned staff card is now tappable (for users with `pos.jobs.manage`). Opens bottom sheet with all bookable staff — shows name, "(busy)" indicator for in_progress/intake, today's job count, checkmark on current assignee. "Unassigned" option at top removes assignment. PATCHes `assigned_staff_id` via existing PATCH route.
- **Cancel button permission-gated**: Uses `usePosPermission('pos.jobs.cancel')` and server-side `checkPosPermission()`.
  - **Permission matrix**: scheduled/intake = `pos.jobs.cancel` permission. in_progress/pending_approval = admin only. completed/closed = cannot cancel.
  - **Walk-in cancellation** (no `appointment_id`): Silent cancel. Sets `status='cancelled'`, `cancellation_reason`, `cancelled_at`, `cancelled_by`. Toast: "Job cancelled".
  - **Appointment-based cancellation** (has `appointment_id`): After selecting reason, shows `SendMethodDialog` (reused from quotes) to choose Email/SMS/Both. Cancels job + linked appointment (frees time slot). Sends cancellation notification. Toast: "Job cancelled -- customer notified".
  - **Cancel API**: `POST /api/pos/jobs/[id]/cancel` with HMAC auth. Body: `{ reason, notify_method? }`. Validates job is cancellable, role-based permission, cancels job + appointment, sends SMS/email notification.
  - **Cancellation email**: Professional HTML email with dark mode support, red header, appointment details box, "Rebook Appointment" CTA button, business contact info. Uses `getBusinessInfo()` for all business details.
  - **Cancellation SMS**: "Hi {first_name}, your {service_name} appointment on {date} at {time} has been cancelled. Please contact us to reschedule. - {business_name} {business_phone}"
  - **Reason dropdown**: "Customer no-show", "Created by mistake", "Customer changed mind", "Schedule conflict", "Other" (with custom text input).
  - **DB columns**: `cancellation_reason TEXT`, `cancelled_at TIMESTAMPTZ`, `cancelled_by UUID` added to `jobs` table. Migration: `20260212000006_jobs_cancellation_columns.sql`.
  - **Permission**: `pos.jobs.cancel` added to `permission_definitions` + `permissions` (all POS roles). API enforces admin-only for in_progress+.
  - **Queue filtering**: Cancelled and closed (paid) jobs excluded from job queue (`.neq('status', 'cancelled').neq('status', 'closed')` in GET handler). Paid jobs accessible via Transactions list and Customer History tab.
  - **Cancel button**: Red outline, positioned below action buttons. Hidden for completed/closed/cancelled jobs and non-admins for in_progress+ jobs.
- **Files created**: `supabase/migrations/20260212000006_jobs_cancellation_columns.sql`, `src/app/api/pos/jobs/[id]/cancel/route.ts`
- **Files modified**: `src/lib/utils/assign-detailer.ts` (schedule + jobs checks), `src/app/api/pos/jobs/route.ts` (auto-assign on walk-in), `src/lib/supabase/types.ts` (Job cancellation fields), `src/app/pos/jobs/components/job-detail.tsx` (cancel UI + SendMethodDialog)
- TypeScript clean (zero errors)

### Session 33 — Job Cancellation Flow + Auto-Assign Detailer to Walk-Ins
- **Auto-assign detailer to walk-ins**: Enhanced `findAvailableDetailer()` in `src/lib/utils/assign-detailer.ts` to also check `employee_schedules` (day/time coverage) and active `jobs` table (in_progress/intake) for conflicts. Wired into `POST /api/pos/jobs` — walk-in jobs auto-assign a detailer using current PST time + 60min estimated window.
- **Job cancellation flow**: Full cancel-with-notification system for POS jobs.

### Session 32 — Phase 8 Session 4: AI Authorization + Completion + Notifications + Checkout
- **Job-addons service** (`src/lib/services/job-addons.ts`): Central service for addon authorization handling via AI. `extractAddonActions(aiResponse)` regex-parses `[AUTHORIZE_ADDON:uuid]` and `[DECLINE_ADDON:uuid]` blocks. `approveAddon(addonId)` / `declineAddon(addonId)` validate status + expiration, update DB, send confirmation SMS. `getPendingAddonsForCustomer(customerId)` queries job_addons for active jobs. `buildAddonPromptSection(addons)` formats pending addons as AI prompt rules.
- **AI context injection**: `buildSystemPrompt()` in `messaging-ai.ts` now accepts optional `customerId` param. When provided, injects pending addon context into AI system prompt so AI can authorize/decline addons conversationally. `getAIResponse()` passes `customerId` through.
- **Webhook addon processing**: Twilio inbound webhook (`/api/webhooks/twilio/inbound`) — after AI generates response, `extractAddonActions()` parses authorize/decline blocks, processes each addon (with expiration handling), strips blocks from customer-facing message. Follows same block-extraction pattern as `extractQuoteRequest()`.
- **Completion photo flow**: Zone picker (`zone-picker.tsx`) gains `isCompletionFlow` prop. In completion mode: fetches intake photos for side-by-side reference, shows intake thumbnails in zone list, calls `POST /api/pos/jobs/[id]/complete` on finish. Job detail refactored from boolean `showZonePicker` to typed `zonePickerMode` ('intake' | 'completion' | 'progress' | null) to support all three modes.
- **Job completion API** (`POST /api/pos/jobs/[id]/complete`): Validates in_progress status, calculates final timer_seconds, generates `gallery_token` (UUID), auto-selects featured photos (first exterior + interior before/after pairs), updates job to 'completed', fires-and-forgets completion notifications.
- **Completion notifications**: SMS with MMS (featured completion photo) + gallery short link via `createShortLink()`. Rich HTML email with before/after photo pairs, service summary, timer display, approved addons list, "View All Photos" CTA button. All fire-and-forget — never blocks POS.
- **Customer-facing photo gallery** (`/jobs/[token]/photos`): Server Component with `generateMetadata()` for SEO. Looks up job by `gallery_token`. Groups photos by zone, renders `<BeforeAfterSlider>` for zones with both intake+completion photos. Shows services performed, completion date, business footer. Mobile-optimized (max-w-2xl). Public API at `GET /api/jobs/[token]/photos`.
- **Pickup sign-off** (`POST /api/pos/jobs/[id]/pickup`): Sets `actual_pickup_at` + `pickup_notes`. Job detail has pickup dialog modal with notes field, Cancel/Confirm buttons.
- **Checkout integration**: `GET /api/pos/jobs/[id]/checkout-items` returns job services (JSONB snapshot) + approved addons as POS line items + full customer data (id, first_name, last_name, phone, email, customer_type, tags) for receipt sending and type prompt skip. `POST /api/pos/jobs/[id]/link-transaction` links transaction_id and sets status to 'closed'. Fire-and-forget hook in POS transactions route auto-links most recent completed job for customer to newly created transaction.
- **Gallery token migration** (`20260212000005_add_gallery_token.sql`): Adds `gallery_token TEXT UNIQUE` column + index to jobs table.
- **Files created**: `src/lib/services/job-addons.ts`, `src/app/api/pos/jobs/[id]/complete/route.ts`, `src/app/api/pos/jobs/[id]/pickup/route.ts`, `src/app/api/pos/jobs/[id]/checkout-items/route.ts`, `src/app/api/pos/jobs/[id]/link-transaction/route.ts`, `src/app/api/jobs/[token]/photos/route.ts`, `src/app/jobs/[token]/photos/page.tsx`, `src/app/jobs/[token]/photos/gallery-client.tsx`, `supabase/migrations/20260212000005_add_gallery_token.sql`
- **Files modified**: `src/lib/services/messaging-ai.ts` (AI context injection), `src/app/api/webhooks/twilio/inbound/route.ts` (addon block processing), `src/app/pos/jobs/components/zone-picker.tsx` (completion flow), `src/app/pos/jobs/components/job-detail.tsx` (zone picker modes, pickup dialog, completion button), `src/lib/supabase/types.ts` (gallery_token field), `src/app/api/pos/transactions/route.ts` (fire-and-forget job linking)
- TypeScript clean (zero errors)

### Session 31 — Phase 8 Session 5: Admin Gallery + Customer Photos + Portal + Public Showcase
- **Admin photo gallery** (`/admin/photos`): Browse all job photos with filters (date range, customer search, vehicle search, zone, phase). Photo grid with zone/phase badges, featured star, internal lock icons. Detail modal with metadata sidebar (customer link, vehicle, zone, phase, notes, staff, timestamp). Bulk actions (feature, unfeature, mark internal, mark public) with multi-select checkboxes. Gated by `photo_documentation` feature flag + `admin.photos.view`/`admin.photos.manage` permissions. Pagination.
- **Admin photo API routes**: `GET /api/admin/photos` (list with all filters, joined to jobs+customers+vehicles+employees), `PATCH /api/admin/photos/[id]` (single photo is_featured/is_internal update), `PATCH /api/admin/photos/bulk` (bulk update up to 100 photos). All require admin auth + permission enforcement.
- **Customer detail "Photos" tab** (6th tab): Photos grouped by job/visit (most recent first). Each group shows date, vehicle, services, status badge. Zone-by-zone layout with `<BeforeAfterSlider>` for zones with both intake+completion photos. Vehicle filter dropdown when customer has multiple vehicles. Excludes `is_internal = true` photos. API: `GET /api/admin/customers/[id]/photos`.
- **Customer portal photo history** (`/account/photos`): Customer's own service photos grouped by visit. `<BeforeAfterSlider>` for before/after pairs. Download button on each photo. Excludes internal photos (CRITICAL). Empty state for new customers. Added to portal tab navigation (between Transactions and Loyalty). API: `GET /api/account/photos` (authenticates via cookie session, looks up customer, filters completed/closed/pending_approval jobs only).
- **Public gallery** (`/gallery`): Server Component for SEO. `generateMetadata()` with business name. JSON-LD `ImageGallery` structured data. Hero section. Service type filter pills. Before/after cards with `<BeforeAfterSlider>`, service name, vehicle make/model (NO customer data). "Load More" pagination (12 per page). Gated by `photo_gallery` feature flag — shows "Coming Soon" when disabled. API: `GET /api/gallery` (public, no auth, returns only featured+non-internal before/after pairs).
- **Admin sidebar updated**: "Photos" nav item with ImageIcon, between Inventory and Staff. Gated by `photo_documentation` feature flag (hidden when disabled).
- **Files created**: `src/app/admin/photos/page.tsx`, `src/app/api/admin/photos/route.ts`, `src/app/api/admin/photos/[id]/route.ts`, `src/app/api/admin/photos/bulk/route.ts`, `src/app/api/admin/customers/[id]/photos/route.ts`, `src/app/api/account/photos/route.ts`, `src/app/api/gallery/route.ts`, `src/app/(account)/account/photos/page.tsx`, `src/app/(public)/gallery/page.tsx`, `src/app/(public)/gallery/gallery-client.tsx`
- **Files modified**: `src/lib/auth/roles.ts` (Photos nav item), `src/app/admin/admin-shell.tsx` (ImageIcon import + icon map + feature flag filter), `src/app/admin/customers/[id]/page.tsx` (Photos tab + CustomerPhotosTab component), `src/components/account/account-shell.tsx` (Photos tab in portal nav)
- TypeScript clean (zero errors)

### Session 30 — Phase 8 Session 3: Timer + In-Progress + Mid-Service Upsell + Authorization
- **Job timer**: Persistent HH:MM:SS clock on job detail header. Derived from DB fields (`timer_seconds`, `work_started_at`, `timer_paused_at`). Client-side `setInterval` for ticking, but all state lives in DB. Pause: calculates elapsed, accumulates `timer_seconds`, sets `timer_paused_at`. Resume: sets `work_started_at`, clears `timer_paused_at`. Visual states: running (green bg) and paused (yellow pulsing with "PAUSED" label).
- **Start Work button**: Visible when `status=intake` + `intake_completed_at` set. Calls `POST /api/pos/jobs/[id]/start-work` → sets `status=in_progress`, `work_started_at=now()`. Timer begins immediately.
- **Timer API** (`PATCH /api/pos/jobs/[id]/timer`): `action: 'pause'` or `'resume'`. Validates job is `in_progress`. Pause accumulates elapsed into `timer_seconds`. Resume restarts `work_started_at`.
- **Flag Issue flow** (`flag-issue-flow.tsx`): 7-step wizard — zone select → photo capture (reuses `PhotoCapture` with `phase='progress'`) → catalog search (services + products) or custom line item → discount (flat $ off) → pickup delay (auto-fills from service duration) → message template (3 prebuilt + custom) → preview (mock authorization page) → send.
- **Message templates**: 3 prebuilt with `{issue}`, `{service}`, `{price}` variable substitution. Plus "Custom message" textarea.
- **Addon creation** (`POST /api/pos/jobs/[id]/addons`): Creates `job_addons` record with `authorization_token` (UUID), expiration from `addon_auth_expiration_minutes` business setting (default 30). Sends SMS via `sendSms()` with MMS photo + email via `sendEmail()` with rich HTML template. Updates `estimated_pickup_at` if delay specified.
- **Addon list** (`GET /api/pos/jobs/[id]/addons`): Auto-expires stale pending addons where `expires_at < now()`. Returns all addons for job, newest first.
- **Addon re-send** (`POST /api/pos/jobs/[id]/addons/[addonId]/resend`): Clones expired/declined addon as new record with fresh token + expiration. Re-sends SMS + email.
- **Authorization page** (`/authorize/[token]`): Public Server Component page. Shows business branding, issue photo, message, price (with strikethrough discount), pickup delay, vehicle info, current services. Interactive Approve (green) / Decline (red outline) buttons via client component. Auto-submits if `?action=approve` or `?action=decline` query param (from email CTA links).
- **Authorization API**: `GET /api/authorize/[token]` (public, fetches addon + job + photos + catalog name), `POST .../approve` and `POST .../decline` (one-time status change, checks expiration). Returns 409 if already responded, 410 if expired.
- **Authorization states**: Active (buttons shown), already responded (approval/decline confirmation), expired (message with business phone contact link), not found (404 page).
- **Expiration logic**: On job detail load, client calls addons GET which auto-expires stale pending addons. Authorization page also checks expiration on approve/decline.
- **Job detail updated**: Timer in header (when in_progress), "Start Work" button now functional, "Flag Issue" (orange button) when in_progress, full addons section showing all addons with status pills (Pending=orange pulsing, Approved=green, Declined=red, Expired=gray), price, discount, delay, re-send button on expired/declined.
- **Job queue badge**: Bell icon on job card when any addon is `pending` (already existed from Session 1).
- **Email template**: Rich HTML authorization email with business logo, photo, price box (with discount), approve/decline CTA buttons linking to `/authorize/[token]?action=approve|decline`, expiration notice.
- **PATCH route update**: Job PATCH now returns full addon data (`addons:job_addons(*)`) instead of just `id, status`.
- **Files created**: `src/app/api/pos/jobs/[id]/start-work/route.ts`, `src/app/api/pos/jobs/[id]/timer/route.ts`, `src/app/api/pos/jobs/[id]/addons/route.ts`, `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts`, `src/app/api/authorize/[token]/route.ts`, `src/app/api/authorize/[token]/approve/route.ts`, `src/app/api/authorize/[token]/decline/route.ts`, `src/app/authorize/[token]/page.tsx`, `src/app/authorize/[token]/authorization-client.tsx`, `src/app/pos/jobs/components/job-timer.tsx`, `src/app/pos/jobs/components/flag-issue-flow.tsx`
- **Files modified**: `src/app/pos/jobs/components/job-detail.tsx` (complete rewrite — timer, start work, flag issue, addons section), `src/app/api/pos/jobs/[id]/route.ts` (PATCH select expanded to full addon data + email field)
- TypeScript clean (zero errors in Session 3 files; pre-existing errors only in concurrent Session 5 gallery files)
- **Phase 8 Session 4 next: AI authorization handling + completion flow + notifications + checkout**

### Session 29 — Phase 8 Session 2: Intake Flow + Camera + Zone Picker + BeforeAfterSlider
- **Zone system** (`src/lib/utils/job-zones.ts`): 8 exterior + 7 interior zone definitions with keys, labels, descriptions. Helper functions: `getZoneLabel()`, `getZoneGroup()`, `countCoveredZones()`. Annotation types: `CircleAnnotation`, `ArrowAnnotation`, `TextAnnotation`.
- **Photo upload API** (`POST /api/pos/jobs/[id]/photos`): Multipart form upload → `sharp` processing (resize 1920px max + 400px thumbnail, JPEG 80%) → Supabase Storage (`job-photos/` bucket) → `job_photos` DB record. Auto-increments `sort_order` per zone+phase.
- **Photo CRUD API**: `GET /api/pos/jobs/[id]/photos` (filterable by phase/zone), `PATCH .../photos/[photoId]` (annotation_data, notes, is_internal, is_featured), `DELETE .../photos/[photoId]` (removes storage files + DB record).
- **Job settings API** (`GET /api/pos/jobs/settings`): Returns configurable minimums from `business_settings` (min_intake_photos_exterior, min_intake_photos_interior, etc.).
- **Zone picker** (`zone-picker.tsx`): Full-screen with Exterior/Interior tabs. SVG vehicle diagrams (top-down exterior, layout interior) with tappable zone hotspots. Green/red coloring based on photo coverage. Photo count badges on SVG. Progress bar ("4/4 Exterior | 1/2 Interior"). Zone list below SVG with capture buttons. "Complete Intake" button disabled until minimums met.
- **Camera capture** (`photo-capture.tsx`): HTML5 `<input capture="environment">` for iPad rear camera. Preview screen with retake/annotate/save. Notes field, "Internal Only" toggle. Uploads via FormData to photo API.
- **Photo annotations** (`photo-annotation.tsx`): SVG overlay with circle, arrow, text tools. Pointer events for touch-friendly interaction. Undo/clear all. Normalized percentage coordinates. Separate `AnnotationOverlay` component for read-only rendering.
- **Zone photos view** (`zone-photos-view.tsx`): Grid of photos for a single zone. Tap to full-size with annotation overlay. Delete button. Add more photos.
- **Intake flow wired into JobDetail**: "Start Intake" sets `status='intake'` + `intake_started_at`, opens zone picker. "Continue Intake" resumes. "Complete Intake" sets `intake_completed_at`. After intake completion, shows "Start Work" placeholder for Session 3.
- **Reusable PhotoGallery** (`src/components/photo-gallery.tsx`): Grid thumbnails with `groupBy` (zone/phase), full-size modal with annotation overlay, navigation arrows, editable mode (toggle featured/internal). Used in 5+ contexts.
- **BeforeAfterSlider** (`src/components/before-after-slider.tsx`): Draggable vertical divider with before/after labels. Touch-friendly (pointer events). ResizeObserver for proper image sizing. Used in: public gallery, customer detail, portal, job completion (Session 4), authorization page (Session 3).
- **Storage bucket migration** (`20260212000004_job_photos_storage.sql`): Creates `job-photos` bucket with public read, authenticated write/update/delete policies. 10MB file limit, JPEG/PNG/WebP allowed.
- **Files created**: `src/lib/utils/job-zones.ts`, `src/app/api/pos/jobs/[id]/photos/route.ts`, `src/app/api/pos/jobs/[id]/photos/[photoId]/route.ts`, `src/app/api/pos/jobs/settings/route.ts`, `src/app/pos/jobs/components/zone-picker.tsx`, `src/app/pos/jobs/components/photo-capture.tsx`, `src/app/pos/jobs/components/photo-annotation.tsx`, `src/app/pos/jobs/components/zone-photos-view.tsx`, `src/components/photo-gallery.tsx`, `src/components/before-after-slider.tsx`, `supabase/migrations/20260212000004_job_photos_storage.sql`
- **Files modified**: `src/app/pos/jobs/components/job-detail.tsx` (wired intake flow, removed placeholder buttons)
- TypeScript clean (zero errors)
- **Phase 8 Sessions 3+5 next (can run concurrently)**: S3=Timer+Upsell, S5=Gallery pages

### Session 28 — Phase 8 Session 1: Job Management Foundation
- **Database migration** (`20260212000003_phase8_jobs_schema.sql`): Created `jobs`, `job_photos`, `job_addons` tables with full columns, CHECK constraints, indexes, RLS policies. Seeded 5 `business_settings` keys (job defaults). Added 2 feature flags (`photo_documentation` default ON, `photo_gallery` default OFF). Added 6 permission definitions + 24 role defaults (4 roles × 6 keys).
- **Job status workflow**: `scheduled → intake → in_progress → pending_approval → completed → closed → cancelled`
- **Services snapshot**: Jobs store services as JSONB `[{id, name, price}]` array captured at creation time — survives catalog edits.
- **POS Jobs tab** (`/pos/jobs`): Queue view with filter pills (My Jobs / All Jobs / Unassigned), status-priority sorting (in_progress first → cancelled last). Auto-populates from today's confirmed appointments on tab load.
- **Walk-in creation flow**: 3-step wizard (Customer → Vehicle → Services). Customer search with quick-add. Vehicle select from customer's list with quick-add. Service multi-select with search, running total, and create button.
- **Job detail shell**: Header with customer name, vehicle, status pill. Info cards for assigned staff, services with price total, timing section, pending/approved addons, customer contact.
- **Auto-population**: POST `/api/pos/jobs/populate` finds today's confirmed/in_progress appointments without matching jobs, creates them with service snapshots and estimated pickup times. Deduplicates by `appointment_id`.
- **PST date filtering**: Jobs list API uses America/Los_Angeles timezone for "today" boundaries — all job queries are PST-aware.
- **Bottom nav updated**: Added Jobs tab (ClipboardList icon) between Quotes and More in POS bottom navigation.
- **Permission defaults**: super_admin/admin get all 6 job+photo keys ON (except admin.photos.manage for admin). Cashier gets pos.jobs.view only. Detailer gets pos.jobs.view/manage/flag_issue.
- **Files created**: `supabase/migrations/20260212000003_phase8_jobs_schema.sql`, `src/app/api/pos/jobs/route.ts`, `src/app/api/pos/jobs/[id]/route.ts`, `src/app/api/pos/jobs/populate/route.ts`, `src/app/api/pos/services/route.ts`, `src/app/pos/jobs/page.tsx`, `src/app/pos/jobs/components/job-queue.tsx`, `src/app/pos/jobs/components/walk-in-flow.tsx`, `src/app/pos/jobs/components/job-detail.tsx`
- **Files modified**: `src/lib/supabase/types.ts`, `src/lib/utils/constants.ts`, `src/lib/utils/role-defaults.ts`, `src/app/pos/components/bottom-nav.tsx`
- TypeScript clean (zero errors)

### Session 27 — Simplify POS Access, Unify PIN Screens
- **POS access simplified**: Removed `POS_ALLOWED_ROLES` hardcoded gate from `pos-shell.tsx`. Any employee with a PIN can now use the POS — no role-based gating. PIN login API already had no role filter, so this was the only blocker.
- **Staff detail page**: Combined "POS Access" and "POS PIN Code" into a single form field — narrow PIN input (`w-24`) with live Enabled/Disabled pill next to it. Moved to same grid row as "Bookable for Appointments". Removed dead `canAccessPos` state (was reading unused `can_access_pos` from roles table) and "Manage in Roles" link.
- **Unified PinScreen component** (`src/app/pos/components/pin-screen.tsx`): Shared by both login page and lock screen overlay. Business logo from receipt printer settings (centered, `h-32`), Lock icons flanking "Enter PIN" title, last session subtitle, dot indicators, shake animation, "Verifying..." label — all in one place. `overlay` prop toggles full-page vs fixed overlay rendering.
- **Login page** (`src/app/pos/login/page.tsx`): Reduced from ~140 lines to ~35 — just wraps `<PinScreen>` with `storePosSession()` callback.
- **Lock screen** in `pos-shell.tsx`: Replaced ~60 lines of inline state/handlers/UI with `<PinScreen overlay>` + `replaceSession()` callback with welcome toast on employee switch.
- **BusinessInfo.logo_url**: Added `logo_url` field to `BusinessInfo` interface, server-side `fetchBusinessInfo()`, and public API `/api/public/business-info` — reads from `receipt_config` in `business_settings`.
- **Files created**: `src/app/pos/components/pin-screen.tsx`
- **Files modified**: `src/app/pos/pos-shell.tsx`, `src/app/pos/login/page.tsx`, `src/app/admin/staff/[id]/page.tsx`, `src/lib/data/business.ts`, `src/app/api/public/business-info/route.ts`
- TypeScript clean (zero errors)

### Session 26c — POS Favorites Vehicle Prequalification Fix
- **Bug fix**: Favorites (and catalog search direct-add) now auto-add services at the correct vehicle-specific price when a vehicle is on the ticket — no dialog required. Previously, vehicle-size-aware services always opened the pricing picker dialog even when the vehicle was known.
- **Prequalification logic**: If vehicle is set: (1) vehicle-size tiers (sedan/truck_suv_2row/suv_3row_van) → match tier by name, auto-add; (2) single vehicle-size-aware tier → resolve price by vehicle size, auto-add. Falls back to picker only when no vehicle set or no matching tier.
- **Files modified**: `src/app/pos/components/register-tab.tsx`, `src/app/pos/components/catalog-browser.tsx`
- TypeScript clean (zero errors)

### Session 26c — Phase 11 Audit
- **Phase 11 (Intelligence & Growth) marked DONE** — audit confirmed 27/29 core features built across Phases 3, 5, 6, 7. Only gaps: staff performance metrics and advanced ML/predictive features (deferred).
- Updated CLAUDE.md: Phase 11 → Done, added "What's Done" section, updated Next Session Priorities.

### Session 26b — EOD Batch Sync + Realtime Toggle
- **EOD batch sync**: `batchSyncDayTransactions()` catches all unsynced transactions when POS register closes. Syncs customers first (those without `qbo_id`), then transactions in batches of 25. PST/PDT-aware date handling. Fire-and-forget from `end-of-day/route.ts` — never blocks register close.
- **Realtime sync toggle**: `qbo_realtime_sync` business setting. When OFF, POS transaction + customer hooks skip immediate QBO sync. Transactions sync at EOD close or via background cron instead. Toggle in Sync Settings section on QuickBooks settings page.
- **Source type expanded**: `eod_batch` added to sync source union type across all QBO sync engines and types.
- **Files created**: `src/lib/qbo/sync-batch.ts`, `supabase/migrations/20260212000002_qbo_realtime_sync.sql`
- **Files modified**: `src/app/api/pos/end-of-day/route.ts`, `src/app/api/pos/transactions/route.ts`, `src/app/api/pos/customers/route.ts`, `src/app/admin/settings/integrations/quickbooks/page.tsx`, `src/app/api/admin/integrations/qbo/settings/route.ts`, `src/lib/qbo/types.ts`, `src/lib/qbo/sync-transaction.ts`, `src/lib/qbo/sync-customer.ts`, `src/lib/qbo/sync-catalog.ts`
- TypeScript clean (zero errors)

### Session 26 — Phase 7.3: QBO Auto-Sync, Reporting Dashboard, CSV Exports
- **Phase 7 (QuickBooks Integration) COMPLETE**
- **QBO Auto-Sync cron job** (`/api/cron/qbo-sync`): Registered in scheduler at `*/30 * * * *`. Checks `isQboSyncEnabled()` + `qbo_auto_sync_interval` setting. Syncs unsynced transactions (50), unsynced customers (50), all catalog, retries failed txns (1hr backoff, 10). Each step wrapped in try/catch — one failure doesn't stop the batch. Configurable interval: disabled/15/30/60 min via Settings UI.
- **QBO Reporting dashboard** (Reports tab): Sync health cards (sync rate with color coding, synced/failed/pending counts, last sync times). Entity coverage progress bars (customers/services/products). Revenue chart (recharts AreaChart with daily breakdown). Recent sync activity (20 entries with source badges). Error summary (grouped by pattern with count + last occurred). Period selector: 7d/30d/90d/All.
- **CSV exports**: Sync log export with entity name resolution (joins customers/services/products/transactions tables). Revenue report export with customer names. Both respect filters, 5k row limit, proper CSV escaping. Download via `Content-Disposition` attachment headers.
- **`source` tracking on sync log**: New column on `qbo_sync_log` (default: `'manual'`). Values: `auto` (cron), `manual` (admin UI), `pos_hook` (POS fire-and-forget). Threaded through all sync engines: `logSync()`, `syncTransactionToQbo()`, `syncUnsynced()`, `syncCustomerToQbo()`, `syncCustomerBatch()`, `syncServiceToQbo()`, `syncProductToQbo()`, `syncAllCatalog()`. POS hooks updated to pass `'pos_hook'`.
- **Settings UI updates**: Tab bar (Settings | Reports) when connected. Auto-sync interval dropdown in Sync Settings section. Source column in sync log table. Export CSV buttons on sync log and reports tab.
- **Files created**: `src/app/api/cron/qbo-sync/route.ts`, `src/app/api/admin/integrations/qbo/reports/route.ts`, `src/app/api/admin/integrations/qbo/reports/export/route.ts`, `src/app/api/admin/integrations/qbo/sync/log/export/route.ts`, `supabase/migrations/20260212000001_qbo_sync_source.sql`
- **Files modified**: `src/lib/cron/scheduler.ts`, `src/lib/qbo/sync-log.ts`, `src/lib/qbo/types.ts`, `src/lib/qbo/sync-transaction.ts`, `src/lib/qbo/sync-customer.ts`, `src/lib/qbo/sync-catalog.ts`, `src/app/api/pos/transactions/route.ts`, `src/app/api/pos/customers/route.ts`, `src/app/api/admin/integrations/qbo/settings/route.ts`, `src/app/admin/settings/integrations/quickbooks/page.tsx`
- TypeScript clean (zero errors)

### Session 25 — Multi-Image, UX Fixes, Breadcrumb Audit
- **Multi-image product support (up to 6 images per product)**: New `product_images` table as source of truth. DB trigger `sync_product_primary_image` auto-syncs primary image back to `products.image_url` — all 8 existing display locations (POS, public pages, admin list, SEO) continue working unchanged.
- **New `MultiImageUpload` component** (`src/app/admin/catalog/components/multi-image-upload.tsx`): horizontal row of 176x176px image slots, drag-and-drop reorder, hover overlay with Set Primary (star badge) / Replace / Remove buttons, file validation (JPEG/PNG/WebP/GIF/AVIF, 5MB), loading spinners per slot.
- **Product edit page**: Replaced single `ImageUpload` with `MultiImageUpload`. All image operations are immediate (not deferred to form submit): upload to `products/{productId}/{uuid}.{ext}`, remove (with primary promotion), replace, reorder (batch `sort_order` update), set primary. Removed `image_url` from form submit payload — trigger handles sync.
- **Product create page**: After product creation with image, also inserts into `product_images` with `is_primary = true`.
- **Data migration**: 409 existing product images migrated into `product_images` table with `is_primary = true`.
- **DB**: `product_images` table, partial unique index (one primary per product), `idx_product_images_product_sort` index, RLS policies, trigger function.
- **Types**: `ProductImage` interface added to `types.ts`, optional `images?: ProductImage[]` on `Product`.
- **Toast close buttons**: Added `closeButton` prop to global `<Toaster>` in `layout.tsx` — all toasts site-wide now have an "x" dismiss button.
- **Products list Activate button**: Replaced `window.confirm()` with `ConfirmDialog` component (no more browser native popups).
- **Active toggle moved to page header**: Product edit page Active/Inactive toggle now in PageHeader action area, saves immediately to DB without form submit.
- **Breadcrumb audit and fix (3 implementations unified)**:
  - `admin-shell.tsx` (every admin page): URL-based breadcrumb was entirely non-clickable `<span>` elements. Now parent segments are clickable `<Link>` with underline styling. Skips folder groupings with no page (`NON_PAGE_PATHS`: `/admin/catalog`, `/admin/settings/integrations`). Smart current-page detection: only marks last item as non-clickable if its href matches the actual pathname (fixes UUID detail pages where parent was incorrectly treated as current page).
  - `components/public/breadcrumbs.tsx` (6 public pages): Added visible underline to clickable items for clear affordance.
  - `campaigns/[id]/analytics/page.tsx` (inline): Updated to match consistent `text-sm`, underline, and `aria` patterns.
- **Files created**: `supabase/migrations/20260211000010_product_images.sql`, `src/app/admin/catalog/components/multi-image-upload.tsx`
- **Files modified**: `src/app/admin/catalog/products/[id]/page.tsx`, `src/app/admin/catalog/products/new/page.tsx`, `src/lib/supabase/types.ts`, `src/app/layout.tsx`, `src/app/admin/catalog/products/page.tsx`, `src/app/admin/admin-shell.tsx`, `src/components/public/breadcrumbs.tsx`, `src/app/admin/marketing/campaigns/[id]/analytics/page.tsx`
- TypeScript clean (zero errors)

### Session 24 — Staff Nav, Permission Pills, Reset Defaults, Route Access Fix
- **Fix 1 (Staff Nav)**: Added "All Staff" child item to Staff dropdown in `SIDEBAR_NAV` (`roles.ts`). Staff now has 2 children: All Staff → `/admin/staff`, Role Management → `/admin/staff/roles`.
- **Fix 2 (Permission Pills)**: Replaced all permission Switch toggles on Role Management page with click-to-cycle `PermissionPill` component. Green pill = `[✓ Granted]`, red pill = `[✗ Denied]`. Single click cycles between states. Super Admin: all green + disabled. Category headers now show "Grant All | Deny All" links instead of All/None buttons.
- **Fix 3a (Reset to Defaults)**: Created `src/lib/utils/role-defaults.ts` — all 76 permission defaults for 4 system roles extracted from seed migration. Created `POST /api/admin/staff/roles/[id]/reset/route.ts` — resets system roles to seed defaults, custom roles to all-denied. "Reset to Defaults" / "Reset to All Denied" button added to Permissions card header.
- **Fix 3b (Edit Role Name)**: Custom role names are editable inline (pencil icon → input → Enter/blur saves). System roles show lock icon with tooltip "System role names cannot be changed".
- **Fix 3c (can_access_admin bug)**: Fixed PATCH route `api/admin/staff/roles/[id]/route.ts` — wasn't destructuring `can_access_admin` from request body. Toggle was silently not saving.
- **Fix 4 (route_access table)**: Migration `20260211000008_route_access.sql` was never applied to live DB. Pushed both pending migrations (route_access + permissions_rls). Fixed permissions_rls migration to be idempotent with `DROP POLICY IF EXISTS` before `CREATE POLICY`. Both migrations now applied successfully. Verified `route_access` table accessible via REST API.
- **Files created**: `src/lib/utils/role-defaults.ts`, `src/app/api/admin/staff/roles/[id]/reset/route.ts`
- **Files modified**: `src/lib/auth/roles.ts` (staff nav children), `src/app/admin/staff/roles/page.tsx` (pills + reset + edit name), `src/app/api/admin/staff/roles/[id]/route.ts` (can_access_admin), `supabase/migrations/20260211000009_permissions_rls.sql` (idempotent DROP IF EXISTS)
- TypeScript clean (zero errors)

### Session 23 — Role Management Reconciliation
- Reconciliation session fixing regressions from 5 parallel role management sessions
- **Task 1 (Staff List Page)**: Verified intact — 181 lines, properly styled DataTable with search/filters. No work needed.
- **Task 2 (Role Management Page Styling)**: Complete rewrite of `src/app/admin/staff/roles/page.tsx`:
  - Changed from 2-column sidebar layout → horizontal Tabs for role selection
  - Replaced ALL HTML checkboxes with Switch toggles in Route Access section
  - Added "Grant all sub-routes" text link next to parent route Switch
  - Added "X of 76 granted" badge to Permissions card header
  - Moved Delete Role button to PageHeader action area
  - Kept all existing logic: optimistic saves, debounced batch, create/delete dialogs
- **Task 3 (Route Access Section)**: Done as part of Task 2 — Switch toggles with green/gray styling
- **Task 4 (PermissionProvider Infrastructure)**: Verified complete — PermissionProvider exists in `permission-context.tsx`, wraps AdminShell, `/api/auth/my-permissions` endpoint exists
- **Task 5 (Employee Permission Overrides)**: Rewrote in `src/app/admin/staff/[id]/page.tsx`:
  - Replaced cycle-through button with three-state segmented control (Default/Granted/Denied)
  - Default = gray bg, Granted = green-500 bg white text, Denied = red-500 bg white text
  - Added debounced auto-save (300ms) using `overridesRef` for stale closure prevention
  - Added Super Admin amber banner in permissions tab
  - Added override count badge per category
  - Added role default hint text with colored dot (green/red)
  - Removed manual "Save Permission Overrides" button
- **Task 6 (Role Assignment Syncing)**: Verified complete — PATCH route already syncs both `role` enum and `role_id` FK
- **Task 7 (Hardcoded Role References)**:
  - `src/app/admin/page.tsx`: Replaced `role === 'detailer'` checks with `canAccessRoute()` using dynamic route patterns from auth context
  - `src/app/pos/pos-shell.tsx`: Replaced inline ternary role label (`role === 'super_admin' ? 'Admin' : ...`) with `ROLE_LABELS[role]` from constants
  - Remaining hardcoded refs are acceptable: API route fallbacks (`is_super ?? role === 'super_admin'`), staff detail page display checks
- **Task 8 (Cross-Session Conflicts)**: Zero TypeScript errors throughout. No duplicate migrations or import conflicts found.
- **Files modified**: `src/app/admin/staff/roles/page.tsx` (rewritten), `src/app/admin/staff/[id]/page.tsx` (permissions tab), `src/app/admin/page.tsx` (dashboard), `src/app/pos/pos-shell.tsx` (role label)

### Session 22 — Server-Side Permission Enforcement
- Server-side permission enforcement — closes security gap where API routes only checked "is user logged in?"
- **New utilities created**:
  - `src/lib/auth/check-permission.ts` — `checkPermission()`, `checkAnyPermission()`, `checkAllPermissions()`. Resolution: super_admin bypass → user override → role default → deny. Single optimized DB query for both user and role permissions.
  - `src/lib/auth/require-permission.ts` — `requirePermission()`, `requireAnyPermission()`. Returns null if granted, 403 NextResponse if denied. Drop-in for API routes.
  - `src/lib/auth/get-employee.ts` — `getEmployeeFromSession()`. Standardizes session → employee lookup pattern for admin API routes. Returns `AuthenticatedEmployee` with id, role, role_id, is_super.
- **Admin routes enforced**:
  - Customer DELETE → `customers.delete` (was: auth only, no role check)
  - Staff create POST → `settings.manage_users` (was: NO AUTH AT ALL)
  - Staff update PATCH → `settings.manage_users` (was: auth only, no role check)
  - Stock adjustments POST → `inventory.adjust_stock` (was: inline role array check)
  - Campaign send POST → `marketing.campaigns` (was: inline role array check)
- **POS routes enforced**:
  - Refunds POST → `pos.issue_refunds` (was: HMAC auth only, no permission)
  - End of day POST → `pos.end_of_day` (was: HMAC auth only, no permission)
  - Void transaction PATCH → `pos.void_transactions` (was: basic auth only, no permission)
- **Appointment routes enforced** (previously had NO authentication at all):
  - Cancel POST → `appointments.cancel` + auth added
  - Reschedule PATCH → `appointments.reschedule` (when date/time changes) + `appointments.update_status` (when status changes) + auth added
- **RLS fixed on `permissions` table** — was completely unprotected (RLS not enabled). Now: all authenticated can read, only super_admin can write (insert/update/delete). Same fix applied to `permission_definitions` table.
- Migration: `20260211000009_permissions_rls.sql`
- TypeScript clean (zero errors)
- **Key files modified**: `api/admin/customers/[id]/route.ts`, `api/staff/create/route.ts`, `api/admin/staff/[id]/route.ts`, `api/admin/stock-adjustments/route.ts`, `api/marketing/campaigns/[id]/send/route.ts`, `api/pos/refunds/route.ts`, `api/pos/end-of-day/route.ts`, `api/pos/transactions/[id]/route.ts`, `api/appointments/[id]/route.ts`, `api/appointments/[id]/cancel/route.ts`

### Session 21 — Role Management Page
- Built Role Management page at `/admin/staff/roles` — super_admin only
- **Route access**: Added `/admin/staff/roles` to `ROUTE_ACCESS` in `roles.ts`
- **Sidebar nav**: Added "Role Management" sub-item under Staff with Shield icon (Staff now has children array)
- **API routes** (4 endpoints):
  - `GET /api/admin/staff/roles` — lists all roles with permission grants, employee counts, and all 76 permission definitions grouped by 11 categories
  - `POST /api/admin/staff/roles` — creates custom role with slugified name, optional copy-from-existing permissions
  - `PATCH /api/admin/staff/roles/[id]` — updates role fields and/or upserts permissions. Blocks super_admin permission changes.
  - `DELETE /api/admin/staff/roles/[id]` — deletes custom roles only, blocks if employees assigned
- **Page features**:
  - Horizontal Tabs for role selection (reconciled from sidebar layout in Session 23)
  - Super Admin role: locked icon, amber notice, all toggles ON and disabled
  - Permission editor: all 76 permissions grouped by 11 categories
  - Category sections: collapsible with chevron toggle, All/None bulk buttons, granted count badge
  - Individual permissions: Switch toggle with green/gray dot indicator, name + description
  - Route Access: Switch toggles (reconciled from checkboxes in Session 23)
  - Optimistic UI: toggles update immediately, API calls debounced 300ms, batched changes, revert on error
  - Page Access section: can_access_pos and can_access_admin toggles per role
  - Create Role dialog: display name, description, can_access_pos toggle, copy-from-existing role dropdown
  - Delete Role confirmation dialog
- **Files created**: `src/app/admin/staff/roles/page.tsx`, `src/app/api/admin/staff/roles/route.ts`, `src/app/api/admin/staff/roles/[id]/route.ts`
- **Files modified**: `src/lib/auth/roles.ts` (route access + sidebar nav)
- TypeScript clean (zero errors)

### Session 20 — Roles & Permissions Database Foundation
- Database foundation for role management system — no UI changes
- **New table: `roles`** — defines system and custom roles. 4 system roles seeded: super_admin (is_super, can_access_pos), admin (can_access_pos), cashier (can_access_pos), detailer (no POS). RLS: all authenticated read, super_admin write.
- **New table: `permission_definitions`** — canonical permission key registry with metadata (name, description, category, sort_order) for Role Management UI. 76 keys across 11 categories seeded. RLS: all authenticated read.
- **Cleaned `permissions` table** — deleted ALL mismatched permission rows (both role defaults under wrong keys and dead employee overrides). Re-seeded 304 rows (76 keys × 4 system roles) matching exact PROJECT.md spec matrix.
- **Added `role_id` to `employees`** — UUID FK to `roles.id`, backfilled from existing `role` enum, set NOT NULL. Old `role` enum column kept for backward compatibility.
- **Added `role_id` to `permissions`** — UUID FK to `roles.id`, backfilled for role-level rows. Unique constraint on `(permission_key, role_id)`. Old `role` enum column kept.
- **TypeScript types updated** — `Role`, `PermissionDefinition` interfaces added to `supabase/types.ts`. `Employee` and `Permission` interfaces updated with `role_id`. New `src/lib/types/roles.ts` with `RolePermission`, `RoleWithPermissions`, `PermissionMatrix`, `SystemRoleName`, `isSystemRole()`.
- **Constants** — `PERMISSION_CATEGORIES` array (11 categories) and `PermissionCategory` type added to `constants.ts`.
- Migration: `20260211000007_roles_permissions_foundation.sql`
- TypeScript clean (zero errors), migration applied to live DB, all data verified
- **Key note**: The "80 keys" mentioned in audit/spec is actually 76 distinct keys when counted from the detailed listing. 76 × 4 = 304 permission rows.

### Session 19 — PO & Stock History Bug Fixes
- **BUG 1 (CRITICAL)**: Fixed PO detail API not reshaping nested `products` → `product` on items — caused product names/SKUs showing as `--` on PO detail page
- **BUG 2**: Fixed same reshape issue in PO list API for consistency
- **BUG 3**: Fixed PO receive route to update `cost_price` on product (was only updating `quantity_on_hand`)
- **BUG 4**: Fixed PO receive stock adjustment reason — now shows `Received from PO-XXXX` instead of raw UUID. Added `po_number` to receive query select.
- **BUG 5**: Added "Reference" column to Stock History page with clickable "View PO" links using `reference_id`/`reference_type`
- **IMPROVEMENT**: New PO page now has "Save as Draft" + "Create & Submit" buttons. POST API accepts optional `status` param with `ordered_at` timestamp.
- TypeScript clean, committed

### Session 18 — Phase 6 Complete + Post-Session Fixes
- Added permission-gated Cost & Margin card to product detail page (`inventory.view_cost_data` permission)
  - Shows cost price, retail price, margin % with color coding (green >40%, amber 20-40%, red <20%)
  - Cost history table from PO receiving with clickable PO links, unit cost, quantities, dates
- Added `min_order_qty` field to product create and edit forms with Zod validation (`positiveInt.optional().nullable()`)
- Verified vendor edit form already has `min_order_amount`, address, `lead_time_days` fields — no changes needed
- Dead code cleanup: no orphaned inventory/stock directories or broken path references found
- Updated CLAUDE.md: Phase 6 → Done, comprehensive completion notes, session history
- Products: `is_active` toggle added to create and edit forms (was missing — Services already had it). Switch with contextual helper text matching service page pattern.
- Stock status indicators: pill badges replaced with minimalistic Unicode circle icons (🟢 In Stock, 🟡 Low Stock, 🔴 Out of Stock) on Products page and Vendor detail page.
- PO create: product search now scoped to selected vendor (strict filter, null vendor_id no longer leaks through). Vendor change clears line items with confirmation dialog.
- TypeScript clean, committed

### Session 17 — Phase 6 Session 3: Low Stock Alerts + Notification Recipients
- Created DB migration `20260211000006`: `notification_recipients` table (email, type, active toggle) + `stock_alert_log` table (anti-spam tracking)
- Added `NotificationRecipient` and `StockAlertLog` TypeScript types
- Built notification recipients CRUD API (`/api/admin/notification-recipients` GET/POST, `[id]` PATCH/DELETE)
- Built stock-alerts cron endpoint (`/api/cron/stock-alerts`): queries low stock (qty > 0, qty <= threshold) + out of stock (qty = 0), anti-spam via `stock_alert_log` (7-day cooldown unless stock changes), HTML email with dark mode, business email fallback
- Registered stock-alerts job in scheduler: `0 16 * * *` (daily 8 AM PST)
- Built Notifications settings page (`/admin/settings/notifications`): recipient table, add form with email + type, toggle active/inactive, delete confirmation dialog, auto-populate business email when empty
- Added Notifications to Settings nav under Communications group
- Added dashboard low stock alert banner with link to `/admin/catalog/products?stock=low-stock`
- Added `?stock=` URL param support to Products page for external deep-linking
- Tested: 1 low stock + 72 out of stock detected, email sent, anti-spam confirmed (2nd run = 0 alerts)
- TypeScript clean, committed

### Session 16 — Phase 6 Sessions 1-2: PO System + Receiving Workflow
- Built purchase order list page with status filter tabs (draft/sent/partial/received/cancelled) and badge counts
- Built PO create/edit forms with multi-product line items, vendor selection, notes, expected delivery date
- Built PO approve/send workflow with status transitions
- Built receiving workflow: receive-against-PO, quantity verification, variance flagging, auto-status update, cost price updates
- Built all supporting API routes for PO CRUD, status updates, and receiving
- TypeScript clean, committed

### Session 15 — Feature Toggle Cleanup: Categories + Organization
- Removed `referral_program` dead flag (no code exists, not on roadmap)
- Added `online_store` placeholder flag (Phase 9, Future category)
- Added `inventory_management` flag (Operations category, default ON) — gates inventory sidebar nav
- Added `category` column to `feature_flags` table (migration `20260211000002`)
- Organized all 14 flags into 7 categories: Core POS, Marketing, Communication, Booking, Integrations, Operations, Future
- Updated all flag labels and descriptions to clearly describe what gets disabled
- Rewrote Feature Toggles page to group by category with "Coming Soon" badge for Future flags (opacity-60)
- Updated seed.sql with categories, new flags, removed referral_program
- Updated FeatureFlag TypeScript interface with `category` field
- Wired `inventory_management` into admin-shell.tsx sidebar nav filter
- TypeScript clean, 6 files changed + 1 migration

### Session 14 — Feature Toggle Fix: Two-Way SMS
- Wired `two_way_sms` feature flag to gate all messaging inbox features
- **Inbound webhook restructured**: STOP/START keyword processing + consent updates ALWAYS run (TCPA compliance). Moved before conversation creation. Feature flag check gates conversation creation, AI auto-responder, after-hours replies, auto-quote, and message storage.
- When flag is ON + STOP/START keyword: consent updated AND logged to conversation (staff visibility preserved)
- When flag is OFF + STOP/START keyword: consent updated only (no conversation created)
- **Admin sidebar**: Messaging nav item + unread badge hidden when flag is off. Unread count fetch skipped.
- **Messaging inbox** (`/admin/messaging`): Shows disabled state with `MessageSquareOff` icon and link to Feature Toggles
- **Messaging settings** (`/admin/settings/messaging`): Amber info banner when flag is off, settings still editable for pre-configuration
- **Staff reply API** (`POST /api/messaging/conversations/[id]/messages`): Returns 403 when flag is off
- Updated flag description: "Receive and respond to customer SMS messages. Includes team inbox, AI auto-responder, and auto-quotes. Disabling hides the messaging inbox and stops AI responses. STOP/START opt-out processing always remains active for compliance."
- Migration `20260211000003`, TypeScript clean, 7 files changed

### Session 13 — Feature Toggle Fix: Loyalty, Cancellation Fee, Mobile Service
- Wired `loyalty_rewards` flag into all loyalty code paths:
  - Server-side: POS earn route (returns 0 points when off), POS redeem route (returns 403), transaction route section 6 (skips earn/redeem logic), customer portal loyalty API (returns empty data)
  - Client-side: POS loyalty-panel + quote-loyalty-panel (hidden when off), portal loyalty page (shows "not available" message)
- Wired `cancellation_fee` flag into cancellation flow:
  - Server-side: cancel API route sets fee to null when disabled (ignores client-sent value)
  - Client-side: cancel-appointment-dialog hides fee input field when off
  - Booking step-review: cancellation disclaimer conditionally shows "$50 fee" text only when enabled
- Wired `mobile_service` flag into booking flow:
  - Server-side: `getMobileZones()` returns empty array when off (hides mobile option from booking wizard), book API route rejects `is_mobile: true` bookings with 400 when off
  - Client-side: step-configure hides mobile toggle when `mobileZones.length === 0`
  - Mobile Zones settings page shows amber warning banner with link to Feature Toggles when off (page still accessible for configuration)
- TypeScript clean, 14 files changed

### Session 12 — Feature Toggle Fix: Server Utility + Marketing Orphans
- Created `src/lib/utils/feature-flags.ts` — `isFeatureEnabled(key)` server-side utility using `createAdminClient()`, fail-closed
- Replaced ALL inline `feature_flags` queries in API routes with `isFeatureEnabled()`: `qbo/settings.ts`, `qbo/status/route.ts`, `lifecycle-engine/route.ts`, `waitlist/route.ts`, `appointments/[id]/cancel/route.ts`
- Wired `sms_marketing` flag into: campaign immediate send (`[id]/send/route.ts`), campaign scheduled send (`process-scheduled/route.ts`), lifecycle engine Phase 2 (skips all pending executions when disabled — Phase 1 scheduling still runs so executions send when re-enabled)
- Wired `email_marketing` flag into: campaign immediate send, campaign scheduled send
- For `channel === 'both'`: sends through whichever channel is enabled, skips disabled one. Only blocks entirely if all required channels are disabled.
- Added warning banners to campaign wizard (basics step) when selected channel's marketing flag is disabled
- Updated `sms_marketing` and `email_marketing` flag names/descriptions in seed.sql and live DB (migration `20260211000001`) to clearly communicate what gets disabled
- TypeScript clean, 10 files changed

### Session 11 — Feature Toggle Audit
- Created `docs/FEATURE_TOGGLE_AUDIT.md` — audited all 13 feature flags
- Found 5 orphan flags (feature built but flag not checked), 3 placeholders, 4 wired, 1 special (QBO)
- Identified critical gap: no server-side `isFeatureEnabled()` utility
- Documented recommended categories, missing infrastructure, and fix priorities

### Session 10b — QBO Architecture Fix
- Restored `qbo_enabled` feature flag as master toggle (was incorrectly deleted)
- Moved `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` to env vars (out of DB)
- Fixed `isQboSyncEnabled()` to check `feature_flags` (not `business_settings`)
- Removed credential inputs from settings UI, added env var status + Feature Toggles link
- Migration `20260210000013`, TypeScript clean, committed and pushed

### Session 9 — Coupon Wizard Customer Type Fixes
- **Eligible count fix**: `refreshEligibleCount()` now filters by `targetCustomerType` in all 3 branches (everyone, customer, group). Added to useEffect dependency array.
- **Unknown segment**: Added "Unknown Only" as 4th Customer Type button in coupon wizard. Targets customers with `customer_type = NULL` (349 of 1,316). POS validation handles unknown targeting with proper soft/hard enforcement.
- **Specific Customer hides Customer Type**: When targeting = "Specific Customer", the entire Customer Type section is hidden (not just disabled). `targetCustomerType` resets to '' when switching to specific customer.
- **Detailer → Professional**: Deprecated "Detailer" label replaced with "Professional" across coupon wizard, POS validate route, enforcement settings page, COUPONS.md, and CLAUDE.md.
- **POS validation refactored**: Section 6c now uses `typeLabels` map and `typeMismatch` boolean logic to handle all 3 types. Fixed enforcement mode parsing to strip JSON quotes.
- **Files modified**: `src/app/admin/marketing/coupons/new/page.tsx`, `src/app/api/pos/coupons/validate/route.ts`, `src/app/admin/settings/coupon-enforcement/page.tsx`, `docs/COUPONS.md`, `CLAUDE.md`

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

### Session 10 — Phase 7.2: QBO OAuth, Settings UI, Sync Engines
- Built 6 OAuth/admin API routes: connect (initiates OAuth flow with CSRF state), callback (token exchange + connection test), disconnect (revokes + clears tokens), status (connection + company info), settings (GET/PATCH), accounts (income/bank from QBO)
- Built 3 sync API routes: `/api/admin/integrations/qbo/sync` (bulk sync all/transactions/customers/catalog), `/sync/retry` (retry failed), `/sync/log` (paginated log with filters)
- Built full admin settings page at `/admin/settings/integrations/quickbooks` with 6 sections: connection management, sync toggles, account mapping, manual sync actions, sync stats cards, sync log viewer with expandable payloads and auto-refresh
- Built 3 sync engines: `sync-customer.ts` (create/update with duplicate detection + batch), `sync-catalog.ts` (services as QBO Service, products as NonInventory), `sync-transaction.ts` (POS → QBO Sales Receipt with line items, discounts, walk-in fallback, misc item fallback, PST dates)
- Added POS hooks: auto-sync customers on create, transactions on complete (fire-and-forget)
- Added QboSyncBadge component, updated Supabase Transaction types with QBO fields
- Added QuickBooks card to Settings index under new "Integrations" group
- Migration `20260210000012`: removed `qbo_enabled` from `feature_flags` (later restored by fix session)
- 22+ files, TypeScript clean, all pushed

### Session 10b — QBO Architecture Fix
- **Restored `qbo_enabled` feature flag** as master toggle (was incorrectly deleted in Session 10). Migration `20260210000013`: restores flag + deletes `qbo_client_id`/`qbo_client_secret`/`qbo_enabled` from `business_settings`
- **Moved credentials to env vars**: `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` now read from `process.env` in `client.ts`, `connect/route.ts`, `callback/route.ts`, `disconnect/route.ts` — NEVER stored in DB
- **Fixed `isQboSyncEnabled()`**: now reads from `feature_flags` table (not `business_settings`)
- **Updated settings UI**: removed credential input fields, added env var status indicator, added link to Feature Toggles page for master toggle
- **Updated `status/route.ts`**: reads `enabled` from `feature_flags`, added `credentials_configured` field
- **Cleaned `settings/route.ts`**: removed `qbo_enabled`, `qbo_client_id`, `qbo_client_secret` from `ALLOWED_KEYS`
- Restored `QBO_ENABLED` to `FEATURE_FLAGS` constant in `constants.ts`
- Added `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` to `.env.local`
- TypeScript clean, committed and pushed

### Next Session Priorities
1. Design/UX audit — modern auto detailing aesthetic (sleek, colorful, mobile-first). Must complete before Phase 9.
2. Phase 9 — Native Online Store (cart, checkout, orders within Next.js app)

---

## Session Instructions
- Update this file at end of session or when asked
- Reference `docs/PROJECT.md` for full specs, `docs/DASHBOARD_RULES.md` for admin UI structure
- Follow patterns in `docs/CONVENTIONS.md` for component APIs and auth
- POS files: use `usePosAuth()` (not `useAuth`), `posFetch()` (not `fetch`), `authenticatePosRequest()` in API routes
