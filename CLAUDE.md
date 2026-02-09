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
| `docs/CHANGELOG.md` | Archived session history — all bug fixes (44+), feature details, file lists. Reference for "what changed" questions. |
| `docs/MEMORY.md` | Session memory and context carryover notes. |

---

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| **1** | Foundation, Auth & Data Model | Done |
| **2** | POS Application | Done |
| **3** | Booking, Quotes & 11 Labs API | Done |
| **4** | Customer Portal | Done |
| **5** | Marketing, Coupons & Campaigns | Partial (see below) |
| **6** | Inventory Management | Partial (see below) |
| **7** | QuickBooks Integration & Reporting | Not started |
| **8** | Photo Documentation | Not started |
| **9** | Online Store (WooCommerce Sync) | Not started |
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
- Messaging settings page (`/admin/settings/messaging`): AI auto-reply toggle, after-hours toggle + message template, additional AI instructions textarea
- Business hours helper (`src/lib/data/business-hours.ts`): getBusinessHours(), isWithinBusinessHours(), formatBusinessHoursText()

### Verified Complete (previously listed as pending)
- Product edit/new pages — full forms with all fields, image upload, Zod validation, soft-delete
- Service edit/new pages — full forms (1,371 + 543 lines), most substantial catalog pages
- All 12 settings sub-pages built and functional: Business Profile (419), Tax Config (217), Mobile Zones (454), POS Favorites (594), POS Idle Timeout (155), Receipt Printer (574), POS Security (458), Card Reader (407), Coupon Enforcement (137), Feature Toggles (112), Audit Log (184), Messaging (new)
- Staff management (list, new, edit pages) with role-based auth (roles.ts + permissions.ts + use-permission hook)
- POS session caching bug — FIXED (cross-tab sync, 60s token expiry check, mount validation)
- Merge duplicate customers — BUILT (/admin/customers/duplicates with smart scoring, confidence levels, bulk merge)
- URL shortening — BUILT (/s/[code] redirect, short_links table, 6-char codes)

### Phase 5 — What's Remaining
- Lifecycle automation rules: UI scaffolding exists (pages + API + DB table) but **execution/triggers not wired**
- Google review request automation (post-service with direct link) — feature flag exists, no implementation
- Campaign analytics (delivery, opens, redemptions, revenue attribution, ROI) — no analytics dashboard
- A/B testing for campaigns — nothing built
- Full TCPA compliance audit (consent capture, opt-out handling, audit log) — consent tracking exists, no audit report
- Fix quote stats labels on quotes page ("Conversion Rate" → "Booking Rate" — already fixed in appointments context but not quotes page)

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
| Configure Twilio webhook URL for inbound SMS (`/api/webhooks/twilio/inbound`) | Configuration | High |

### Data Notes
- **Revenue discrepancy:** Transactions Revenue = all transactions including anonymous walk-ins ($328,259 / 6,118 txns). Customer Lifetime Revenue = sum of `lifetime_spend` on named customers only ($187,617.47). 4,537 of 6,118 transactions have no `customer_id` (anonymous walk-ins).
- **Transaction date gap:** Square's first payment: May 8, 2021. Supabase `transaction_date` starts Dec 31, 2021 — early transactions may not have been imported.
- **Product/service images:** Stored in Supabase storage buckets `product-images/` and `service-images/`. 23 products have no images (never had them in Square). 2 services have no images (Excessive Cleaning Fee, Paint Decontamination & Protection — no Square counterparts). `service-images` bucket also allows `image/avif` MIME type (added accidentally, no impact).
- **Duplicate vendor pages:** `/admin/catalog/vendors` (372 lines) and `/admin/inventory/vendors` (400 lines) both exist. Inventory version is more complete (search, address, lead time fields). Should consolidate.
- **Messaging tables:** `conversations` (unique per phone_number, linked to customer_id if known) and `messages` (CASCADE delete with conversation). Both have Supabase Realtime enabled. AI auto-replies stored with `sender_type: 'ai'`, staff replies with `sender_type: 'staff'`.

---

## Key Architecture Notes

- **Supabase project:** `zwvahzymzardmxixyfim`
- **Super-Admin:** nayeem@smartdetailautospa.com
- **Staff:** Segundo Cadena (detailer), Joselyn Reyes (cashier), Joana Lira (cashier), Su Khan (admin)
- **Integrations:** Email: Mailgun | SMS: Twilio (+14244010094) | Payments: Stripe | Workflows: N8N | AI: Anthropic Claude API (messaging auto-responder)
- **Public pages:** Server Components for SEO. Admin pages: `'use client'` behind auth.

### Auth Patterns
- **Admin routes:** `createClient()` (cookie-based) + `supabase.auth.getUser()`, then `createAdminClient()` (service role) for data access
- **POS routes:** `authenticatePosRequest()` (HMAC) + `createAdminClient()`. Components use `usePosAuth()` + `posFetch()`
- **Customer portal:** `createClient()` with RLS — customers only see their own data
- **Session checks:** Use `getUser()` (server-validated) NOT `getSession()` (cached)
- **Session expiry:** `adminFetch()` from `@/lib/utils/admin-fetch` auto-redirects on 401

### Critical Rules
- **NEVER hardcode** business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`
- **Supabase `.or()` on related tables** doesn't work. Query related table first, then `.in('foreign_key', ids)`
- **Admin quotes are READ-ONLY.** All creation/editing via POS builder deep-links
- **POS deep-links:** `/pos/quotes?mode=builder` (new), `?mode=builder&quoteId=<id>` (edit), `?mode=detail&quoteId=<id>` (view)
- **Customer search:** 2-char min, 300ms debounce, digits → phone search, text → name search
- **Quotes use soft-delete** (`deleted_at` column). All quote queries MUST include `.is('deleted_at', null)` — except `quote-number.ts` (needs all quotes to prevent number reuse) and public quote page (needs deleted quotes for friendly messaging)
- **Messaging inbound webhook** (`/api/webhooks/twilio/inbound`) is unauthenticated (called by Twilio) but validates Twilio HMAC signature. Uses `createAdminClient()` for DB operations.
- **Messaging AI auto-disable:** When staff sends a manual reply to an AI-enabled conversation, `is_ai_enabled` is automatically set to false (human takeover).
- **ANTHROPIC_API_KEY** must be in `.env.local` (and production env vars). Used by `src/lib/services/messaging-ai.ts`.

---

## Session Instructions
- Update this file at end of session or when asked
- Reference `docs/PROJECT.md` for full specs, `docs/DASHBOARD_RULES.md` for admin UI structure
- Follow patterns in `docs/CONVENTIONS.md` for component APIs and auth
- POS files: use `usePosAuth()` (not `useAuth`), `posFetch()` (not `fetch`), `authenticatePosRequest()` in API routes
