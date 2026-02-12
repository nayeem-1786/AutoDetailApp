# POS vs Dashboard Feature Boundary Audit

**Date:** 2026-02-11
**Auditor:** Claude Code (Session 3)
**Scope:** Complete feature location map, duplication analysis, misplaced features, messaging integration feasibility, detailer gap analysis

---

## 1. Complete Feature Location Map

### 1A. POS Features (`/pos`)

| # | Feature | POS Location | What It Does | Who Uses It |
|---|---------|-------------|--------------|-------------|
| 1 | PIN Login | `pos/login/page.tsx`, `pin-pad.tsx` | 4-digit PIN login with rate limiting (5 fails = 15min lockout) | All POS staff |
| 2 | Register/Checkout | `register-tab.tsx`, `ticket-panel.tsx`, `ticket-actions.tsx` | Main selling workspace: add items, manage cart, apply discounts | Cashier |
| 3 | Catalog Browser | `catalog-browser.tsx`, `catalog-panel.tsx`, `catalog-grid.tsx` | Browse products/services by category with images and prices | Cashier |
| 4 | Product Detail | `product-detail.tsx` | View product details, price, taxability, stock status | Cashier |
| 5 | Service Detail | `service-detail-dialog.tsx`, `service-pricing-picker.tsx` | View service pricing by vehicle size, tiers, add-ons, per-unit options | Cashier |
| 6 | Favorites Bar | `register-tab.tsx`, `use-favorites.ts` | Quick-access buttons for frequently used products/services (12 colors x 6 intensities) | Cashier |
| 7 | Customer Lookup | `customer-lookup.tsx` | Search customers by name/phone (2-char min, 300ms debounce) | Cashier |
| 8 | Customer Create | `customer-create-dialog.tsx` | Quick create with name, phone, email, consent defaults | Cashier |
| 9 | Customer Type Badge | `customer-type-badge.tsx`, `customer-type-prompt.tsx` | Set/cycle customer type (null -> enthusiast -> professional -> null) | Cashier |
| 10 | Vehicle Create | `vehicle-create-dialog.tsx` | Add vehicle for customer (year, make, model, color, size class) | Cashier |
| 11 | Vehicle Selector | `vehicle-selector.tsx`, `customer-vehicle-summary.tsx` | Select from customer's vehicles for service pricing | Cashier |
| 12 | Coupon Validation | `coupon-input.tsx` | Enter/validate coupon codes, apply discounts to ticket | Cashier |
| 13 | Promotions Tab | `promotions-tab.tsx` | View auto-apply coupons and available promotions | Cashier |
| 14 | Addon Suggestions | `addon-suggestions.tsx`, `use-addon-suggestions.ts` | AI-powered product recommendations based on cart contents | Cashier |
| 15 | Loyalty Panel | `loyalty-panel.tsx` | View/redeem customer loyalty points | Cashier |
| 16 | Payment Processing | `checkout-overlay.tsx`, `payment-method-screen.tsx` | Full checkout flow: method selection -> payment -> tip -> complete | Cashier |
| 17 | Cash Payment | `cash-payment.tsx` | Cash tendered entry, change calculation | Cashier |
| 18 | Card Payment | `card-payment.tsx` | Stripe Terminal EMV integration, card-present transactions | Cashier |
| 19 | Check Payment | `check-payment.tsx` | Check number and bank info entry | Cashier |
| 20 | Split Payment | `split-payment.tsx` | Divide total between cash and card | Cashier |
| 21 | Tip Entry | `tip-screen.tsx` | Tip amount/percentage (15%, 18%, 20% presets) | Cashier |
| 22 | Receipt Options | `receipt-options.tsx` | Send receipt via print/email/SMS after transaction | Cashier |
| 23 | Thermal Print | `/api/pos/receipts/print` | ESC/POS commands for Star printer with branding | Cashier |
| 24 | Email Receipt | `/api/pos/receipts/email` | HTML receipt via Mailgun with dark mode | Cashier |
| 25 | SMS Receipt | `/api/pos/receipts/sms` | Text receipt via Twilio with payment short link | Cashier |
| 26 | Refund Processing | `refund-dialog.tsx`, `refund-item-row.tsx`, `refund-summary.tsx` | Item-level refund with reason, Stripe reversal | Manager |
| 27 | Held Tickets | `held-tickets-panel.tsx`, `held-tickets-context.tsx` | Park/resume tickets, localStorage persistence | Cashier |
| 28 | End-of-Day | `end-of-day/page.tsx`, `cash-count-form.tsx`, `day-summary.tsx` | Open/close register, cash count, reconciliation, variance tracking | Manager |
| 29 | Quote List | `quotes/quote-list.tsx` | View all quotes with status badges, search, filter | Cashier |
| 30 | Quote Builder | `quotes/quote-builder.tsx` | Create/edit quotes: customer, vehicle, services, coupons, notes | Cashier |
| 31 | Quote Detail | `quotes/quote-detail.tsx` | View quote, convert to transaction, send, edit, delete | Cashier |
| 32 | Quote Send | `quotes/quote-send-dialog.tsx` | Send quote via email/SMS/both with public link | Cashier |
| 33 | Quote Convert | `/api/pos/quotes/[id]/convert` | Convert accepted quote to completed transaction | Cashier |
| 34 | Transaction List | `transactions/page.tsx`, `transaction-list.tsx` | View past transactions with search, date/payment filters | Cashier |
| 35 | Transaction Detail | `transactions/[id]/page.tsx`, `transaction-detail.tsx` | Full transaction view with items, payments, refunds | Cashier |
| 36 | Barcode Scanner | `use-barcode-scanner.ts` | Keyboard listener for barcode scanner input -> product lookup | Cashier |
| 37 | Search Bar | `search-bar.tsx` | Quick search for customers or products | Cashier |
| 38 | Keypad Tab | `keypad-tab.tsx` | Custom amount entry via keypad (discounts, surcharges) | Cashier |
| 39 | Idle Timeout | `pos-shell.tsx` | Configurable per-role idle lock with PIN re-entry | All POS |
| 40 | Appointment Notify | `/api/pos/appointments/[id]/notify` | Send SMS notification about appointment | Cashier |

**POS API Routes: 28 total** under `/api/pos/` (auth, customers, transactions, quotes, receipts, refunds, loyalty, coupons, promotions, stripe, services, EOD, appointments)

---

### 1B. Dashboard Features (`/admin`)

| # | Feature | Dashboard Location | What It Does | Who Uses It | Also in POS? |
|---|---------|-------------------|--------------|-------------|-------------|
| 1 | Dashboard Home | `/admin` | Today's appointments, remaining/in-progress/completed counts, open quotes, customer metrics, low stock alerts, week-at-a-glance, quick actions | All staff | No |
| 2 | Customer List | `/admin/customers` | DataTable with search, sort, filters, bulk tag actions, stats cards | admin+ | No |
| 3 | Customer Detail | `/admin/customers/[id]` | Tabbed: Info/Vehicles/Loyalty/History/Quotes with full editing | admin+ | No |
| 4 | Customer Create | `/admin/customers/new` | Full form with consent toggles, consent logging | admin+ | **Yes** (simplified) |
| 5 | Customer Merge | `/admin/customers/duplicates` | Smart duplicate detection, scoring, bulk merge | admin+ | No |
| 6 | Appointment Calendar | `/admin/appointments` | Calendar + list view, status filters, reschedule/cancel | All staff | No |
| 7 | Waitlist | `/admin/appointments/waitlist` | Feature-flagged waitlist management with status tracking | admin+ | No |
| 8 | Staff Scheduling | `/admin/appointments/scheduling` | Weekly schedules, blocked dates, "Who's Working Today" | admin+ | No |
| 9 | Transaction List | `/admin/transactions` | DataTable with search, date/status filters, revenue stats, payment breakdown | admin+ | **Yes** (different UI) |
| 10 | Transaction Detail | `/admin/transactions` (expand) | Inline receipt preview with items, payments, refunds, receipt actions | admin+ | **Yes** (separate page) |
| 11 | Quote Pipeline | `/admin/quotes` | DataTable with pipeline stats, conversion metrics, slide-over detail | admin+ | **Yes** (different UI) |
| 12 | Quote Detail | `/admin/quotes/[id]` | Read-only view, links to POS builder for editing | admin+ | **Yes** (POS is editor) |
| 13 | Product List | `/admin/catalog/products` | DataTable with stock management, quick adjust, missing-image alerts | admin+ | **Partial** (browse only) |
| 14 | Product Create | `/admin/catalog/products/new` | Full form with images, pricing, stock, vendor, Zod validation | admin+ | No |
| 15 | Product Edit | `/admin/catalog/products/[id]` | Full edit + cost/margin card (permission-gated) | admin+ | No |
| 16 | Service List | `/admin/catalog/services` | DataTable with filters, missing-image alerts | admin+ | **Partial** (browse only) |
| 17 | Service Create | `/admin/catalog/services/new` | Full form with pricing models, classification, compatibility | admin+ | No |
| 18 | Service Edit | `/admin/catalog/services/[id]` | Full edit form | admin+ | No |
| 19 | Stock Overview | `/admin/inventory` | Product stock levels, low/out-of-stock filters, manual adjust | admin+ | No |
| 20 | Vendor List | `/admin/inventory/vendors` | Vendor CRUD with search | admin+ | No |
| 21 | Vendor Detail | `/admin/inventory/vendors/[id]` | Vendor info, products, cost/margin, PO links | admin+ | No |
| 22 | Purchase Orders | `/admin/inventory/purchase-orders` | PO list with status tabs, create/approve/receive workflow | admin+ | No |
| 23 | PO Create | `/admin/inventory/purchase-orders/new` | Vendor-scoped product selection, line items, draft/submit | admin+ | No |
| 24 | PO Detail/Receive | `/admin/inventory/purchase-orders/[id]` | PO detail with receiving workflow, cost updates | admin+ | No |
| 25 | Stock History | `/admin/inventory/stock-history` | Audit log of all stock changes with reference links | admin+ | No |
| 26 | Coupon List | `/admin/marketing/coupons` | DataTable with status filter, duplicate/usage warnings | admin+ | No |
| 27 | Coupon Create | `/admin/marketing/coupons/new` | Wizard: code, discount type, targeting, validity | admin+ | No |
| 28 | Coupon Edit | `/admin/marketing/coupons/[id]` | Full edit with status/auto-apply toggles | admin+ | No |
| 29 | Campaign List | `/admin/marketing/campaigns` | DataTable with status filters, create/edit/duplicate | admin+ | No |
| 30 | Campaign Create | `/admin/marketing/campaigns/new` | 4-step wizard: basics, message, A/B testing, scheduling | admin+ | No |
| 31 | Campaign Analytics | `/admin/marketing/campaigns/[id]/analytics` | KPIs, funnel, A/B comparison, recipient table, click details | admin+ | No |
| 32 | Automation List | `/admin/marketing/automations` | Lifecycle rule CRUD with triggers and delays | admin+ | No |
| 33 | Compliance | `/admin/marketing/compliance` | SMS consent audit log viewer | admin+ | No |
| 34 | Marketing Analytics | `/admin/marketing/analytics` | Overview KPIs, channel comparison, performance tables | admin+ | No |
| 35 | SMS Inbox | `/admin/messaging` | Split-pane conversation list + thread view, Realtime updates | All staff | **No** |
| 36 | Staff List | `/admin/staff` | DataTable with role/status filters | super_admin | No |
| 37 | Staff Create/Edit | `/admin/staff/new`, `[id]` | Full form with role, schedule, mobile zones | super_admin | No |
| 38 | Business Profile | `/admin/settings/business-profile` | Name, phone, email, hours, logo | super_admin | No |
| 39 | Tax Config | `/admin/settings/tax-config` | State, rate, applies-to toggle | super_admin | No |
| 40 | Mobile Zones | `/admin/settings/mobile-zones` | Zone CRUD with zip codes | super_admin | No |
| 41 | POS Favorites | `/admin/settings/pos-favorites` | Per-employee favorite products/services | super_admin | No |
| 42 | POS Idle Timeout | `/admin/settings/pos-idle-timeout` | Timeout slider (1-30 min) | super_admin | No |
| 43 | POS Security | `/admin/settings/pos-security` | IP whitelist, HMAC, PIN requirements | super_admin | No |
| 44 | Receipt Printer | `/admin/settings/receipt-printer` | Printer IP, logo, footer, test print | super_admin | No |
| 45 | Card Reader | `/admin/settings/card-reader` | Stripe Terminal reader registration | super_admin | No |
| 46 | Coupon Enforcement | `/admin/settings/coupon-enforcement` | Soft vs hard enforcement mode | super_admin | No |
| 47 | Feature Toggles | `/admin/settings/feature-toggles` | Master feature flag switches by category | super_admin | No |
| 48 | Audit Log | `/admin/settings/audit-log` | System event log viewer | super_admin | No |
| 49 | Messaging Settings | `/admin/settings/messaging` | AI assistant config, conversation lifecycle | super_admin | No |
| 50 | Notifications | `/admin/settings/notifications` | Stock alert email recipients | super_admin | No |
| 51 | Reviews Config | `/admin/settings/reviews` | Google/Yelp review URLs, automation link | super_admin | No |
| 52 | QuickBooks | `/admin/settings/integrations/quickbooks` | OAuth, sync toggles, account mapping, sync log | super_admin | No |

---

### 1C. Duplicated Features (Exist in Both POS and Dashboard)

| Feature | POS Implementation | Dashboard Implementation | In Sync? | Discrepancies |
|---------|-------------------|------------------------|----------|---------------|
| **Customer Create** | `customer-create-dialog.tsx` — quick form (name, phone, email, consent) via `/api/pos/customers` | `/admin/customers/new` — full form (name, phone, email, birthday, address, notes, tags, consent) via admin API | Partial | Dashboard has more fields (birthday, address, tags). Both log consent. Both default SMS/email consent to checked. Different APIs but same DB table. |
| **Customer Search** | `customer-lookup.tsx` via `/api/pos/customers/search` (HMAC auth) | `/admin/customers` page + `/api/admin/customers/search` (cookie auth) | **Yes** | Same search logic (2-char min, phone detection). Different auth. Same data returned. |
| **Transaction List** | `transactions/page.tsx` — dedicated page with date/payment filters | `/admin/transactions` — DataTable with expandable rows, revenue stats | Partial | POS has dedicated detail page. Dashboard has inline expansion. Dashboard adds revenue stats cards and payment breakdown chart. Different APIs but same `transactions` table. |
| **Transaction Detail** | `transactions/[id]/page.tsx` — full page with receipt actions | `/admin/transactions` — inline expand with receipt preview | Partial | POS shows as separate page. Dashboard shows inline. Both support print/email/SMS receipt. |
| **Quote List** | `quotes/quote-list.tsx` — table with status badges | `/admin/quotes` — DataTable with pipeline stats, conversion metrics | Partial | Dashboard adds stats cards (booking rate, booked revenue). Same data source. |
| **Quote Detail** | `quotes/quote-detail.tsx` — full editor with convert/send/edit/delete | `/admin/quotes/[id]` — read-only view, links to POS for editing | **Complementary** | Admin is intentionally read-only. POS is the single source of truth for quote editing. Admin deep-links to POS builder. |
| **Product/Service Browse** | `catalog-browser.tsx` — grid view for adding to cart | `/admin/catalog/products`, `/admin/catalog/services` — DataTable CRUD | **Different purpose** | POS is for selling (add to cart). Dashboard is for management (create/edit/delete). Same data tables. |
| **Coupon Validation** | `coupon-input.tsx` via `/api/pos/coupons/validate` | Coupon creation/editing at `/admin/marketing/coupons` | **Complementary** | POS validates/applies. Dashboard creates/manages. No duplication. |
| **Refund Processing** | `refund-dialog.tsx` via `/api/pos/refunds` | `/admin/transactions` — refund dialog accessible from expanded row | **Possible overlap** | Both can initiate refunds. Need to verify if dashboard refund uses POS API or separate admin API. |

---

## 2. Feature Placement Assessment

### 2A. Staff-Facing Features Trapped in Dashboard

| Feature | Current Location | Who Needs It | Why It's Misplaced | Effort to Move |
|---------|-----------------|-------------|-------------------|----------------|
| **SMS Inbox** | `/admin/messaging` (dashboard only) | Cashier during checkout, all staff for context | Cashier may need to see recent customer messages during a sale. Currently must switch to a different browser tab/window to check. | **Medium** — Components exist (`thread-view.tsx`, `message-bubble.tsx`, `reply-input.tsx`) but use `adminFetch()` (cookie auth). POS uses `posFetch()` (HMAC auth). Would need: (1) POS-compatible messaging API routes, (2) adapter for auth, (3) modal/sidebar in POS. Supabase Realtime not currently used in POS. |
| **Appointment Calendar** | `/admin/appointments` (dashboard only) | Detailer (daily schedule), Cashier (check availability) | Detailer has zero visibility into their schedule from POS. Must log into dashboard separately. Cashier can't check appointment slots when customer asks. | **Medium** — Appointment data queries exist. Need a "Today's Schedule" panel or tab in POS. Read-only would be simplest. |
| **Customer Full Profile** | `/admin/customers/[id]` (dashboard only) | Cashier during checkout | During POS checkout, cashier only sees: name, phone, email, loyalty points, visit count, tags, customer type (from search result). Cannot see: full history, vehicles, quotes, loyalty ledger, notes. | **Low-Medium** — Could add a "View Customer" dialog in POS that shows a subset of the customer detail (history, vehicles, notes). |
| **Inventory Receiving** | `/admin/inventory/purchase-orders/[id]` (dashboard only) | Cashier (receives deliveries) | Per PROJECT.md, cashier should be able to receive inventory. Currently must switch to dashboard. | **Medium** — PO receiving requires vendor/PO context. Could add a "Receive PO" shortcut in POS if POs are pre-created in dashboard. |

#### Deep-Dive: Messaging in POS

**Current state:** Zero messaging functionality in POS. No imports of messaging components, no conversation references, no SMS inbox. POS only sends outbound SMS for receipts and appointment notifications — no two-way messaging.

**Auth incompatibility:** Messaging APIs (`/api/messaging/*`) use cookie-based admin auth (`createClient()` + `supabase.auth.getUser()`). POS uses HMAC auth (`authenticatePosRequest()`). POS cannot call messaging APIs directly.

**Realtime gap:** The messaging inbox uses Supabase Realtime for live message updates. POS does not use Supabase Realtime anywhere — no `subscribe()`, no channels, no realtime hooks.

**Component architecture:** Messaging UI is split into 5 components under `/admin/messaging/components/`:
- `conversation-list.tsx` — conversation sidebar with search/filters
- `conversation-row.tsx` — individual conversation preview
- `thread-view.tsx` — message thread with summary card, reply input
- `message-bubble.tsx` — individual message display
- `reply-input.tsx` — text input with send button

These use `adminFetch()` throughout. To use in POS, would need either:
1. Duplicate routes with HMAC auth under `/api/pos/messaging/`
2. Or a shared auth adapter that accepts either auth type

**Minimum viable POS messaging:**
- Unread badge on POS bottom nav or header (poll `/api/pos/messaging/unread-count`)
- "Messages" button that opens a modal with conversation list + thread view
- Would need 3-4 new POS API routes mirroring the messaging APIs with HMAC auth
- Supabase Realtime subscription for live updates (new capability for POS)

#### Deep-Dive: Quotes in POS

**Current state:** Quotes are FULLY built in POS. The POS quote system has: list, builder, detail, send, convert, delete, coupon input, loyalty panel. Admin quotes page is intentionally read-only and deep-links to POS for editing.

**Assessment:** Correctly placed. POS is the single editor for quotes. No changes needed.

#### Deep-Dive: Appointments in POS

**Current state:** POS has exactly ONE appointment-related feature: `POST /api/pos/appointments/[id]/notify` — send SMS notification about an appointment. That's it. No appointment viewing, no calendar, no schedule display, no status updates.

**Assessment:** Major gap. See Detailer Interface Gap Analysis (Section 5).

#### Deep-Dive: Customer Detail in POS

**Current state:** During POS checkout, customer data comes from the search result: `id, first_name, last_name, phone, email, loyalty_points_balance, visit_count, tags, customer_type`. The cashier can also see/add vehicles via `vehicle-selector.tsx` and `vehicle-create-dialog.tsx`.

**Missing in POS:** Transaction history, loyalty ledger, quote history, notes, birthday, address, portal access status. Cashier sees a name badge and loyalty points — not a complete customer picture.

#### Deep-Dive: Inventory Receiving in POS

**Current state:** No inventory features in POS. Stock adjustments and PO receiving are dashboard-only at `/admin/inventory/`.

**Assessment:** PROJECT.md envisions cashier receiving inventory. Current implementation requires admin dashboard access. This is a future enhancement, not critical for daily operations yet.

---

### 2B. Owner-Only Features Correctly in Dashboard

These features belong exclusively in the dashboard and do NOT need POS equivalents:

| Feature | Location | Rationale |
|---------|----------|-----------|
| Campaign Creation/Management | `/admin/marketing/campaigns` | Strategic marketing — owner/manager decision |
| Coupon Creation | `/admin/marketing/coupons` | Business rule creation — owner decision |
| Automation Rules | `/admin/marketing/automations` | Lifecycle setup — owner/manager decision |
| Marketing Analytics | `/admin/marketing/analytics` | Reporting — owner consumption |
| Compliance Audit | `/admin/marketing/compliance` | Legal compliance — owner responsibility |
| Staff Management | `/admin/staff` | HR function — owner only |
| Feature Toggles | `/admin/settings/feature-toggles` | System config — owner only |
| Tax/Payment Config | `/admin/settings/tax-config` | Business rule — owner only |
| Business Profile | `/admin/settings/business-profile` | Business identity — owner only |
| Receipt Printer Setup | `/admin/settings/receipt-printer` | Hardware config — owner only |
| Card Reader Setup | `/admin/settings/card-reader` | Hardware config — owner only |
| POS Security | `/admin/settings/pos-security` | Security policy — owner only |
| QuickBooks Integration | `/admin/settings/integrations/quickbooks` | Accounting — owner only |
| Vendor Management | `/admin/inventory/vendors` | Procurement — owner/manager decision |
| Purchase Order Creation | `/admin/inventory/purchase-orders/new` | Procurement — owner/manager decision |
| Stock History | `/admin/inventory/stock-history` | Audit trail — owner/manager review |
| Customer Merge | `/admin/customers/duplicates` | Data cleanup — owner/manager task |
| Staff Scheduling | `/admin/appointments/scheduling` | Schedule management — owner/manager |
| Waitlist | `/admin/appointments/waitlist` | Queue management — owner/manager |

---

### 2C. Shared Features That Legitimately Need Both Interfaces

| Feature | POS Purpose | Dashboard Purpose | Same Data? | Same API? |
|---------|------------|------------------|-----------|-----------|
| Customer Lookup | Find customer during checkout | Browse/manage customer database | **Yes** (same `customers` table) | **No** — POS: `/api/pos/customers/search` (HMAC), Dashboard: `/api/admin/customers/search` (cookie). Same search logic. |
| Transaction History | View past transactions, reprint receipts | Revenue reporting, refund management | **Yes** (same `transactions` table) | **No** — POS: `/api/pos/transactions/search` (HMAC), Dashboard: admin API (cookie). |
| Product Catalog | Add products to cart for sale | CRUD product management | **Yes** (same `products` table) | **No** — POS browses read-only, Dashboard manages. |
| Service Catalog | Add services to cart for sale | CRUD service management | **Yes** (same `services` table) | **No** — POS browses read-only, Dashboard manages. |
| Quote Management | Create/edit/send/convert quotes | View pipeline, track metrics | **Yes** (same `quotes` table) | **No** — POS: `/api/pos/quotes/*` (HMAC), Dashboard: `/api/admin/quotes` (cookie). |
| Refunds | Process refund from transaction | View refund history | **Yes** (same `transactions` table) | **Possibly shared** — needs verification |

---

## 3. Messaging Integration Assessment

### 3A. Full Messaging Architecture

#### Inbound SMS Flow
```
Customer SMS → Twilio → POST /api/webhooks/twilio/inbound
  → Validate Twilio HMAC signature (production only)
  → Parse message body + from number
  → Customer lookup by phone number
  → STOP/START keyword processing (ALWAYS, regardless of feature flag)
  → Feature flag check (two_way_sms)
  → Find or create conversation (by phone_number, unique)
  → Link to customer_id if found
  → Insert message row (direction: 'inbound', sender_type: 'customer')
  → Auto-quote detection: if AI generates [GENERATE_QUOTE] block, create quote + customer + vehicle
  → AI auto-responder: if is_ai_enabled on conversation, generate AI response via Claude API
  → SMS splitting: long AI responses split at natural break points, each chunk sent separately
  → Update conversation.last_message_at, unread_count
  → Supabase Realtime broadcasts to subscribed clients
```

#### Outbound Reply Flow
```
Staff types message in thread-view.tsx → clicks Send
  → POST /api/messaging/send (cookie auth, checks employee role)
  → Load conversation to get phone_number
  → sendSms(phone_number, messageBody) via Twilio
  → Insert message row (direction: 'outbound', sender_type: 'staff', sent_by: employee.id)
  → Update conversation.last_message_at, unread_count = 0
  → Auto-disable AI: sets is_ai_enabled = false on conversation (human takeover)
```

#### AI Auto-Responder
- Triggered when `is_ai_enabled = true` on conversation AND inbound message is not a STOP/START keyword
- Uses Claude API with dynamic system prompt built from: service catalog, business info, hours, active coupons, product search results
- Can generate quotes via `[GENERATE_QUOTE]` block parsing
- Rate limited: 10 responses/hour per conversation
- Disabled automatically when staff sends a manual reply
- Controllable per conversation + globally via settings

#### Data Model
- `conversations` table: `id, phone_number, customer_id, status (open/closed/archived), unread_count, last_message_at, last_message_preview, is_ai_enabled, created_at`
- `messages` table: `id, conversation_id, direction (inbound/outbound), body, sender_type (customer/staff/ai/system), sent_by, twilio_sid, status, created_at`
- Both tables have Supabase Realtime enabled

#### Real-Time Updates
- Messaging page subscribes to Supabase Realtime channels for `conversations` and `messages` tables
- Live updates when: new inbound message arrives, AI responds, conversation status changes
- Unread badge in admin sidebar polls `/api/messaging/unread-count` (sums `unread_count` across open conversations)

### 3B. POS Integration Feasibility

#### Auth Incompatibility (Primary Blocker)
- **Messaging APIs** use cookie-based auth: `createClient()` -> `supabase.auth.getUser()` -> check employee role
- **POS APIs** use HMAC auth: `authenticatePosRequest()` -> validate HMAC token -> extract employee from token
- **Cannot share APIs directly.** Would need either:
  - Option A: Duplicate 4-5 messaging routes under `/api/pos/messaging/` with HMAC auth (cleaner, follows existing pattern)
  - Option B: Universal auth middleware that accepts either cookie or HMAC (more DRY but architectural change)

#### Realtime Gap
- POS currently has zero Supabase Realtime usage — no `subscribe()`, no channels, no realtime hooks
- Adding Realtime to POS would be the first instance, but technically straightforward (Supabase client is already available)
- Alternative: polling `/api/pos/messaging/unread-count` every 30-60 seconds (simpler, no Realtime needed)

#### Minimum Viable POS Messaging Integration
1. **Unread badge** on POS bottom nav (poll-based, new POS API route)
2. **Messages tab** in POS bottom nav opening a slide-out panel
3. **Conversation list** component (adapted from `conversation-list.tsx`, use `posFetch`)
4. **Thread view** component (adapted from `thread-view.tsx`, use `posFetch`)
5. **Reply input** for staff responses

**Estimated effort:** 4-5 new POS API routes + 3-4 POS components (could reuse UI logic from dashboard components, swap auth calls)

#### AI Auto-Responder
- No POS awareness needed — AI runs server-side in the Twilio inbound webhook
- POS would only display the conversation; AI responses appear automatically via Realtime/polling

### 3C. Customer-Context Messaging

**Current state:** No link between POS cart customer and messaging conversations. When a cashier has a customer in the POS cart, they cannot see if that customer has unread messages or recent SMS conversations.

**What exists:** The `conversations` table has a `customer_id` FK to `customers`. If the POS cart has a customer selected, we can query: "Does this customer have an active conversation? Are there unread messages?"

**Potential integration:**
- When cashier selects a customer in POS, check for active conversations
- Show "2 unread messages" badge on the customer card
- Click to open that customer's conversation in a modal
- Would require: `/api/pos/messaging/customer/[customerId]` route to fetch conversation by customer ID

---

## 4. Detailer Interface Gap Analysis

### 4A. What a Detailer Needs Daily

Based on business reality (1 detailer at Smart Detail Auto Spa):

1. See today's appointment schedule (jobs, times, vehicles, services)
2. See job details (services to perform, customer notes, vehicle info)
3. Update job status (confirmed -> in_progress -> completed)
4. Add job notes
5. Clock in/out (time tracking)
6. View tip summary / earnings
7. Take before/after photos (Phase 8, future)

### 4B. Where Does the Detailer Get This Today?

#### CRITICAL FINDING: Detailer is Excluded from POS

From `src/lib/auth/roles.ts` line 36:
```typescript
'/pos': ['super_admin', 'admin', 'cashier'],  // NO detailer
```

**The detailer role CANNOT access POS at all.** This means the detailer's entire daily experience is through the dashboard only.

#### Detailer's Dashboard Navigation (from `roles.ts`)

The detailer sees exactly **3 nav items**:
1. **Dashboard** (`/admin`) — with limited quick actions (only "My Schedule")
2. **Appointments** (`/admin/appointments`) — calendar view
3. **Messaging** (`/admin/messaging`) — SMS inbox (if `two_way_sms` flag enabled)

That's it. No transactions, no quotes, no customers, no catalog, no inventory, no marketing, no settings.

#### Detailer's Dashboard Experience

**Dashboard home** (`/admin/page.tsx`):
- Shows today's appointments count, remaining, in-progress, completed — **NOT filtered by employee** (shows ALL appointments)
- Quick actions: only "My Schedule" (links to `/admin/appointments`)
- Hides: Quotes & Customers stats row (`role !== 'detailer'` check)
- Shows: Week-at-a-glance calendar — **NOT filtered by employee**

**Appointments page** (`/admin/appointments`):
- Shows calendar/list view of ALL appointments — **NOT filtered to detailer's assignments**
- Has employee filter dropdown — detailer must manually filter to their name
- Can view appointment detail in a dialog
- Can see status (pending, confirmed, in_progress, completed, no_show, cancelled)
- **Cannot** update appointment status from this page (no status update UI found)
- **Cannot** add notes to appointments
- Reschedule/cancel are gated by role — detailer access unclear

**Messaging** (`/admin/messaging`):
- Full inbox access — can see all conversations, reply to customers
- Useful for communicating with customers about their jobs

### 4C. Gap Analysis

| Need | Available? | Where? | Quality | Notes |
|------|-----------|--------|---------|-------|
| **See today's schedule** | Partial | Dashboard home + `/admin/appointments` | **Poor** | Shows ALL appointments, not just detailer's. No employee pre-filter. |
| **See job details** | Yes | Appointment detail dialog | **Partial** | Shows customer, vehicle, services, time. Missing: service instructions, customer preferences/notes. |
| **Update job status** | **No** | Nowhere | **Missing** | No status update button or API accessible to detailer. Must ask owner/cashier to update. |
| **Add job notes** | **No** | Nowhere | **Missing** | No note-adding capability on appointments for detailer role. |
| **Clock in/out** | **No** | Nowhere | **Missing** | DB types exist (`clock_in`, `clock_out` on a table) but zero UI, zero API routes, zero implementation. Just type definitions from schema generation. |
| **View tip summary** | **No** | Nowhere | **Missing** | Tips are recorded on transactions, visible in dashboard transactions page — but detailer can't access transactions. No "My Tips" view. |
| **View earnings** | **No** | Nowhere | **Missing** | No payroll/earnings view for any role. |
| **Before/after photos** | **No** | Phase 8 (future) | **Not built** | Planned for Phase 8. |

---

## 5. Recommended Feature Placement

### Priority 1: Critical Fixes (High Impact, Quick Wins)

| # | Recommendation | Current | Proposed | Effort |
|---|---------------|---------|----------|--------|
| 1 | **Pre-filter detailer's appointments** | Dashboard shows ALL appointments for detailer | Auto-filter by `employee_id` when role is `detailer` | **Low** — add role check in appointments page, pass employee filter |
| 2 | **Add appointment status update** | No status update UI | Add status buttons (Confirm / Start / Complete) to appointment detail dialog, accessible to detailer role | **Low-Medium** — needs PATCH API route for status, permission check |
| 3 | **Add detailer POS access** | `roles.ts` excludes detailer from `/pos` | Add `'detailer'` to POS route access. Detailer needs to at least view appointments and potentially ring up sales | **Low** — one line change in `roles.ts`, but consider what POS features detailer should see |

### Priority 2: POS Enhancements (Medium Impact)

| # | Recommendation | Current | Proposed | Effort |
|---|---------------|---------|----------|--------|
| 4 | **Add "Today's Schedule" tab to POS** | POS has Register, EOD, Transactions, Quotes tabs | Add Appointments/Schedule tab showing today's appointments with status, customer, vehicle, services | **Medium** — new POS page/tab, new API route, read-only initially |
| 5 | **Add customer context in POS** | Cashier sees name + loyalty points during checkout | Add "View Profile" button on customer card showing history, vehicles, notes in a dialog | **Medium** — new dialog component, reuse admin customer detail data |
| 6 | **Add unread message indicator to POS** | Zero messaging awareness in POS | Add unread count badge to POS header/nav. Click opens simplified conversation view. | **Medium** — new POS API routes (HMAC auth), new components, polling for updates |

### Priority 3: Detailer Experience (Medium Impact, More Effort)

| # | Recommendation | Current | Proposed | Effort |
|---|---------------|---------|----------|--------|
| 7 | **Detailer "My Tips" view** | Tips only visible in transaction detail (detailer can't access) | Add tip summary to dashboard home for detailer role (today/week/month) | **Low-Medium** — query transactions by employee, sum tips, add card to dashboard |
| 8 | **Job notes** | No note capability | Allow detailer to add notes to appointments they're assigned to | **Low** — notes field likely exists on appointments table, add UI |
| 9 | **Clock in/out** | DB types exist, no implementation | Build basic time tracking: clock in/out buttons in POS or dashboard, `timesheets` table, daily log | **Medium-High** — full feature build (API, UI, table, reporting) |

### Priority 4: Future (Phase 7+ Alignment)

| # | Recommendation | Effort |
|---|---------------|--------|
| 10 | POS inventory receiving (cashier receives deliveries against existing POs) | **Medium** |
| 11 | Full POS messaging integration with Realtime | **High** |
| 12 | Detailer before/after photo capture (Phase 8) | **High** |
| 13 | Detailer earnings/payroll view | **Medium** |

---

## 6. Summary of Key Findings

### Architecture Strengths
- **Quote system** is perfectly placed: POS is the single editor, dashboard is read-only with deep-links. Clean separation.
- **Catalog** correctly split: POS browses for selling, dashboard manages for CRUD. Same data source.
- **Auth separation** (HMAC for POS, cookie for dashboard) provides proper security isolation but creates integration friction.

### Critical Issues
1. **Detailer is locked out of POS** (`roles.ts` line 36) — whether intentional or not, this means the detailer has a minimal dashboard-only experience
2. **No appointment status updates** — nobody (detailer, cashier, or admin) has a clear "Start Job" / "Complete Job" button visible in the current UI audit
3. **Dashboard appointments not filtered for detailer** — shows all appointments, detailer must manually filter to see their own schedule
4. **Zero messaging in POS** — cashier has no awareness of customer SMS conversations during checkout

### Integration Friction
- **Auth model mismatch** is the primary blocker for sharing features between POS and dashboard. Every shared feature requires duplicate API routes.
- **Realtime gap** in POS means live updates (new messages, appointment changes) require polling rather than push notifications.
- **Component reuse** is possible but requires swapping `adminFetch()` for `posFetch()` and adapting auth patterns.

### What's Working Well
- Customer search pattern is consistent across POS and dashboard (same logic, different auth)
- Quotes are cleanly separated (POS creates, dashboard views)
- Feature flags properly gate features across both interfaces
- Receipt handling works well from both POS (direct) and dashboard (via transaction detail)
