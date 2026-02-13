# Auto Detail — Project Document

> **Prerequisites:** See [`CONVENTIONS.md`](./CONVENTIONS.md) for component APIs, auth patterns, and project conventions.

## Business Overview

**Business Name:** Smart Detail Auto Spa & Supplies
**Owner:** Sole proprietor (100% ownership)
**Active Since:** 2020
**Location:** California (adjacent to owner's primary business)
**Staff:** 1 Detailer (experienced, flexible schedule up to 6 days/week)
**Annual Revenue:** ~$60,000
**Current Platform:** Square (POS, Appointments, Website integration) — $150/month

### What the Business Does

- Professional auto detailing services (wash, detail, ceramic coating, paint correction, etc.)
- Retail sales of detailing chemicals and products (in-store and online)
- Automated 24-hour self-service purified RO water station (coin-op, cash only)
- Serves DIY detailers, seasoned professionals, and general vehicle owners

### Current Challenges

- Revenue does not cover mortgage, property taxes, and payroll
- Paying $150/month for Square with insufficient business to justify the expense
- Zero advertising — relying solely on organic online discovery and repeat clients
- Limited data ownership and API access with Square
- Need to jumpstart positive cash flow

---

## Project Goal

Replace the Square platform entirely with a custom-built system that:

1. Eliminates the $150/month Square subscription ($1,800/year savings)
2. Provides full data ownership and control
3. Creates a professional POS, booking, and customer management system
4. Enables automated marketing to convert one-time customers into repeat customers
5. Integrates with QuickBooks for automated bookkeeping
6. Supports business growth through intelligent automation

---

## Companion Documents

This project is documented across multiple files. PROJECT.md is the master document. The companion files contain detailed rules for specific domains.

| Document | Purpose | When to Refer |
|---|---|---|
| **PROJECT.md** (this file) | Master project document — architecture, tech stack, features, build phases, RBAC, all high-level decisions | Always start here. This is the project overview and entry point for all planning. |
| **SERVICE_CATALOG.md** | Complete catalog of all 30 services with pricing, classifications, vehicle compatibility, add-on suggestion rules, combo pricing, mobile service rules, and service prerequisites | When building: service CRUD, POS service selection, booking service picker, pricing logic, add-on suggestion UI, mobile booking, or the 11 Labs service API endpoint |
| **DATA_MIGRATION_RULES.md** | Square data import rules — customer tiers, phone normalization, product field mapping, transaction import sequence, vehicle inference, loyalty point seeding, and validation checks | When building: Phase 1 migration tool, CSV parser, import validation, or any logic that touches Square export data |
| **DASHBOARD_RULES.md** | Complete admin dashboard navigation and UI structure — every page, every section, every feature organized by navigation area, with Square parity notes | When building: admin panel pages, designing navigation, or implementing any admin-facing feature |
| **iPAD.md** | iPad POS optimization features — touch targets, numeric keyboards, sticky cart, PWA/offline support, gestures, dark mode, and planning requirements | When building: Phase 12 iPad optimizations, or any POS UI improvements for tablet use |

**Rule:** If a decision is documented in a companion file, that file is the source of truth for that domain. PROJECT.md provides the overview; companion files provide the implementation detail.

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js + Tailwind CSS | POS, Booking, Portal, Admin |
| Backend/Database | Supabase (PostgreSQL + Auth + Storage + Realtime) | All data, authentication, file storage |
| Payments (Online) | Stripe | Online checkout, booking payments |
| Payments (In-Store) | Stripe Terminal | Card-present transactions on iPad |
| Email Delivery | Mailgun | Transactional emails, marketing campaigns, receipts |
| SMS Delivery | Twilio | Transactional SMS, marketing campaigns, OTP auth |
| Automation/Workflows | N8N (self-hosted or cloud) | Orchestrates all automated workflows |
| Notifications (Owner) | Telegram | Real-time alerts to owner |
| Accounting | QuickBooks Online (API) | Automated bookkeeping sync |
| Online Store | WooCommerce (existing WordPress site) | Product sales online |
| Voice Agent | 11 Labs | Inbound/outbound phone call handling |
| Website | WordPress (existing, self-hosted) | Marketing site, hosts booking embed |

---

## System Architecture

### Application Routes

| Route | Purpose | Users |
|---|---|---|
| `/pos` | Full POS interface | Cashier, Detailer, Admin, Super-Admin |
| `/book` | Customer-facing booking page | Public (embeddable in WordPress) |
| `/portal` | Customer self-service portal | Authenticated customers |
| `/admin` | Management and configuration panel | Admin, Super-Admin |

### Architecture Diagram

```
CUSTOMER TOUCHPOINTS
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Phone    │ │ Website  │ │ Walk-in  │ │ Customer │
│ (11Labs) │ │ Booking  │ │          │ │ Portal   │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │             │             │             │
     └──────┬──────┴──────┬──────┴─────────────┘
            │             │
            ▼             ▼
┌─────────────────────────────────────────────────┐
│              NEXT.JS APPLICATION                │
│                                                  │
│  /pos      — Staff POS (iPad)                   │
│  /book     — Public booking page                │
│  /portal   — Customer portal (auth required)    │
│  /admin    — Management panel (role-based)      │
│                                                  │
│  /api/*    — REST API (consumed by 11 Labs)     │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┼──────────────┐
     │             │              │
     ▼             ▼              ▼
┌─────────┐ ┌──────────┐ ┌────────────┐
│Supabase │ │ Stripe   │ │    N8N     │
│         │ │          │ │            │
│- Auth   │ │- Online  │ │- Mailgun   │
│- DB     │ │- Terminal│ │- Twilio    │
│- RLS    │ │- Refunds │ │- Telegram  │
│- Storage│ │- Billing │ │- QuickBooks│
│- Realtime│ │         │ │- WooCommerce│
└─────────┘ └──────────┘ └────────────┘

STAFF ACCESS (role-based)
┌────────────┐ ┌────────┐ ┌───────┐ ┌──────────┐
│Super-Admin │ │ Admin  │ │Cashier│ │ Detailer │
│(Owner)     │ │        │ │       │ │          │
│Everything  │ │Reports │ │POS    │ │Schedule  │
│Settings    │ │Campaigns│ │Checkout│ │Status   │
│Financials  │ │Inventory│ │Coupons│ │Photos   │
│Users       │ │POS     │ │Quotes │ │Notes    │
└────────────┘ └────────┘ └───────┘ └──────────┘
```

### Catalog Architecture (Decoupled Data Layer)

Products and services are stored as data in Supabase. Every surface (POS, booking, portal, online store, 11 Labs API) reads from the same source of truth dynamically. Changes in the admin panel are reflected immediately across all surfaces — no code changes, no rebuilds, no redeployment required.

```
Supabase (source of truth)
       │
       ├──► POS: real-time via Supabase Realtime
       ├──► Booking page: real-time query
       ├──► Customer portal: real-time query
       ├──► 11 Labs API: REST query
       └──► WooCommerce: synced via N8N (near real-time)
```

**Price locking:** When a service or product is added to a ticket or booked as an appointment, the price at that moment is stored on the transaction record. Future price changes do not affect existing tickets or bookings.

---

## Services & Pricing Overview

> **Full details:** See **SERVICE_CATALOG.md** for the complete catalog with all pricing, classifications, vehicle compatibility, and rules.

### Vehicle Size Classification

Standard vehicles use a 3-tier system:

| Tier | Label | Examples |
|---|---|---|
| 1 | Sedan | Sedans, coupes, compact cars — Civic, Accord, Model 3, Camry |
| 2 | Truck/SUV (2-Row) | SUVs, trucks, crossovers — RAV4, Explorer, F-150, Model Y |
| 3 | SUV (3-Row) / Van | Full-size vans, 3-row SUVs — Suburban, Escalade, Sprinter, Odyssey |

Specialty vehicles (Motorcycle, RV, Boat, Aircraft) use their own sizing tiers outside this classification.

### Pricing Models

| Model | How It Works | Example |
|---|---|---|
| `vehicle_size` | 3 tiers by vehicle size | Express Wash: $75 / $90 / $110 |
| `scope` | Named tiers by scope of work | Hot Shampoo: $75 / $125 / $175 / $350 |
| `per_unit` | Base price x count | Scratch Repair: $150/panel (1-4) |
| `specialty` | Vehicle-type-specific tiers | Boat Interior: $275 / $375 / $475 |
| `flat` | Single price | Headlight Restoration: $125/pair |
| `custom` | Manual quote after inspection | Flood/Mold: $475+ |

### Service Catalog Summary (30 Services, 7 Categories)

| Category | Count | Services |
|---|---|---|
| Precision Express | 2 | Express Exterior Wash, Express Interior Clean |
| Signature Detail | 1 | Signature Complete Detail |
| Paint Correction & Restoration | 2 | Single-Stage Polish, 3-Stage Paint Correction |
| Ceramic Coatings | 3 | 1-Year, 3-Year, 5-Year Ceramic Shield |
| Exterior Enhancements | 8 | Paint Decon, Booster Detail, Headlights, Engine Bay, Undercarriage, Scratch Repair, Trim, Water Spots |
| Interior Enhancements | 7 | Pet Hair, Leather Conditioning, Excessive Cleaning Fee, Ozone, Hot Shampoo, Organic Stain, Flood/Mold |
| Specialty Vehicles | 7 | Motorcycle, RV Int/Ext, Boat Int/Ext, Aircraft Int/Ext |

### Service Classifications

| Classification | Count | Description |
|---|---|---|
| Primary (Standalone) | 16 | Bookable as the main appointment service |
| Add-On Only | 5 | Must be paired with a primary service (Pet Hair, Leather, Ozone, Paint Decon, Excessive Cleaning Fee) |
| Both (Standalone or Add-On) | 9 | Can be standalone or add-on (Headlight, Engine Bay, Undercarriage, Scratch, Trim, Water Spot, Hot Shampoo, Organic Stain) |

### Service Prerequisites

| Service | Requires |
|---|---|
| All Ceramic Shields (1/3/5-Year) | Paint Correction on same ticket or in vehicle history (last 30 days) |
| Booster Detail | Existing ceramic coating (soft warning if no history — allows proceeding since coating may be from elsewhere) |

### Add-On Suggestion System

When a primary service is selected at POS, booking, or by the voice agent, the system suggests relevant add-ons with optional combo pricing. All suggestions and combo prices are configurable in admin. Combo prices are TBD — structure is built, owner configures pricing post-launch. Full suggestion maps in SERVICE_CATALOG.md.

### Mobile Service

| Rule | Value |
|---|---|
| Shop Address | 2021 Lomita Blvd, Lomita, CA |
| Zone 1 (0-5 mi) | +$40 per appointment |
| Zone 2 (5-10 mi) | +$80 per appointment |
| Beyond 10 mi | Declined |
| Surcharge | Once per appointment (not per service) |
| Calendar | Same as in-shop, with 30-min travel buffer each way |
| Eligible Services | 11 of 30 (see SERVICE_CATALOG.md) |

### Specialty Vehicle Add-On Rules

| Vehicle Type | Add-Ons Allowed? | Rule |
|---|---|---|
| Motorcycle | No | Motorcycle Detail is comprehensive |
| RV | Yes | All interior + select exterior (Headlight, Trim, Water Spot) |
| Boat | No | Boat services are comprehensive |
| Aircraft | No | Aircraft services are comprehensive |

---

## Database Schema (High-Level)

### Core Tables

- **customers** — profile, phone, email, birthday, marketing consent, tags
- **vehicles** — per customer: year, make, model, color, vehicle type (standard/motorcycle/rv/boat/aircraft), size class (Sedan / Truck-SUV 2-Row / SUV 3-Row Van for standard; type-specific tiers for specialty)
- **services** — name, description, category, base duration, active status, channel visibility, booking settings
- **service_pricing** — per service per vehicle size class: price
- **service_addon_suggestions** — links primary services to suggested add-ons with combo pricing, display order, auto-suggest flag, seasonal overrides
- **service_prerequisites** — enforces service dependencies with enforcement types (required_same_ticket, required_history, recommended)
- **mobile_zones** — defines mobile service zones with distance ranges and surcharges from shop address
- **packages** — bundled services at set price, linked services
- **products** — name, SKU, description, category, vendor, cost, retail price, tax flag, stock qty, reorder threshold, images
- **vendors** — name, contact info, lead time
- **appointments** — customer, vehicle, services, date/time, status, channel (online/phone/walk-in), payment status, job notes, cancellation fee settings
- **transactions** — linked to appointment or standalone, line items, payment method(s), tax, tips, coupons applied, loyalty points earned
- **transaction_items** — individual line items with price-locked amounts
- **payments** — per transaction: method (cash/card), amount, stripe payment ID, tip amount, tip net (after CC fee)
- **refunds** — linked to transaction, line items refunded, reason, restock flag
- **coupons** — code, type (flat/$/%/free item), value, expiry, single-use flag, minimum purchase, campaign link, status (draft/active/disabled); expiration derived from `expires_at`
- **loyalty_ledger** — points earned, redeemed, adjustments, running balance per customer
- **campaigns** — name, audience filters, message template (SMS/email), coupon link, schedule, status, metrics
- **lifecycle_rules** — service trigger, delay period, action (SMS/email), message template, coupon, chain order
- **quotes** — customer, vehicle, services, total, expiry, status (draft/sent/accepted/expired/converted)
- **photos** — linked to ticket + vehicle, type (before/after/damage), storage URL, marketing consent flag
- **employees** — user profile, role, active status
- **time_records** — employee, clock in, clock out, hours
- **purchase_orders** — vendor, line items, status (ordered/shipped/received), dates
- **po_items** — product, quantity ordered, quantity received, cost
- **feature_flags** — key, enabled boolean, config JSON
- **permissions** — role-level and user-level permission overrides
- **audit_log** — user, action, entity, timestamp, details
- **sms_conversations** — two-way SMS thread per customer
- **marketing_consent_log** — customer, channel, opt-in/out, timestamp, source (POS/online/portal)

---

## Feature Toggle System

Centralized in admin settings. Many features can be activated or deactivated without code changes:

| Toggle | Default |
|---|---|
| Loyalty & Rewards | Active |
| Recurring/Subscription Services | Inactive (dormant) |
| Online Booking Requires Payment | Active |
| SMS Marketing | Active |
| Email Marketing | Active |
| Google Review Requests | Active |
| Two-Way SMS | Active |
| Waitlist | Active |
| Photo Documentation | Inactive |
| Cancellation Fee Enforcement | Active |
| Referral Program | Inactive |
| Mobile Service | Active |

---

## SEO Requirements (CRITICAL)

All public-facing pages (services, products, booking) MUST be built for Google indexability. This is a business-critical requirement for organic discovery.

### Mandatory for Every Public Page

- **Server-side rendering:** All public pages must be Next.js Server Components (NOT client-side `'use client'` fetching). Google must be able to crawl full HTML content without JavaScript execution.
- **Individual URLs:** Every service and every product gets its own unique, crawlable URL with a human-readable slug (e.g., `/services/ceramic-coatings/5-year-ceramic-shield`, `/products/meguiars-gold-class-wax`)
- **`generateMetadata()`:** Every page must export Next.js `generateMetadata()` with unique `<title>`, `<meta description>`, and Open Graph tags
- **JSON-LD structured data:** Service pages use `Service` schema, product pages use `Product` schema with pricing, availability, reviews
- **`sitemap.xml`:** Auto-generated from database (all services + products + categories), submitted to Google Search Console
- **`robots.txt`:** Allow all public pages, block `/admin`, `/pos`, `/portal`, `/api`
- **Canonical URLs:** Every page has a canonical URL to prevent duplicate content
- **Image alt tags:** All product/service images must have descriptive alt text
- **Internal linking:** Category pages link to individual service/product pages, breadcrumbs on every page

### SEO Priority: Ceramic Coatings (HIGHEST)

Ceramic coating pages are the #1 SEO priority. These services have the highest margin and strongest search demand:
- `/services/ceramic-coatings` — Category landing page targeting "ceramic coating [city]" keywords
- `/services/ceramic-coatings/1-year-ceramic-shield` — Individual service page
- `/services/ceramic-coatings/3-year-ceramic-shield` — Individual service page
- `/services/ceramic-coatings/5-year-ceramic-shield` — Individual service page
- Each page must have rich content: service description, what's included, vehicle size pricing table, duration, prerequisites (paint correction required), before/after photos, FAQ section
- Target keywords: "ceramic coating Lomita", "ceramic coating Torrance", "ceramic coating South Bay", "best ceramic coating near me", "car ceramic coating cost"
- Google Business Profile and Google Analytics integration for ranking tracking

### Public Route Structure

| Route Pattern | Content | SEO Goal |
|---|---|---|
| `/services` | All service categories | Category index page |
| `/services/[category-slug]` | Services in category | Category landing page with local keywords |
| `/services/[category-slug]/[service-slug]` | Individual service detail | Target service + location keywords |
| `/products` | All product categories | Product index page |
| `/products/[category-slug]` | Products in category | Category landing page |
| `/products/[category-slug]/[product-slug]` | Individual product detail | Product + brand keywords |
| `/book` | Online booking | Booking conversion page |

### Implementation Notes

- Public pages are SEPARATE from admin pages — admin uses `'use client'` behind auth, public pages use Server Components for SEO
- Service/product data fetched server-side from Supabase in Server Components
- `generateStaticParams()` can be used for static generation of known services at build time
- Revalidation via `revalidatePath()` when admin updates service/product data
- Owner will submit sitemap to Google Search Console and connect Google Analytics for ranking tracking

---

## Payment Rules

### By Booking Channel

| Channel | Payment Rule |
|---|---|
| Online (website/portal) | Full payment at time of booking via Stripe |
| Phone (11 Labs agent) | No payment required, pay at POS when work is done |
| Walk-in | No booking needed, pay at POS when work is done |

### Tax Rules

- **Products:** 10.25% CA sales tax applied
- **Services:** No sales tax
- **Mixed tickets:** Tax calculated only on product line items

### Tip Handling

- Tip screen at POS: 15% / 20% / 25% / Custom / No Tip
- Card tips: Detailer receives tip minus 5% CC fee deduction
- Cash tips: Detailer receives full tip amount
- Tips tracked separately for payroll reporting and QuickBooks

### Split Payments

- Customers can pay with any combination of cash and card
- Each payment method recorded separately
- Tips only applicable on card portion

---

## Scheduling & Availability

### Business Hours

- Store hours: Tuesday–Saturday, 9am–5pm
- Detailer schedule: Configurable per day (currently 3 days/week, 9am–1pm, scalable to 6 days)
- Staff available on-call outside posted hours for product purchases

### Booking Rules

- Online/phone bookings only within detailer's scheduled hours
- Service duration determines time slot blocking
- Buffer time between appointments (configurable, e.g., 30 minutes)
- Admin can adjust detailer schedule weekly or set recurring patterns
- Holiday/vacation date blocking
- Admin can manually override and book any slot

### Mobile Appointment Scheduling

- Mobile appointments share the same calendar as in-shop appointments
- System blocks 30-minute travel buffer before and after each mobile appointment (configurable in admin)
- If any service on a mobile ticket is not mobile-eligible, the entire appointment must be in-shop
- Online booking: "Mobile Service" toggle → customer enters address → zone calculated → surcharge displayed
- See SERVICE_CATALOG.md for full mobile service rules, eligible services, and zone definitions

### Cancellation Policy

- Cancel > 24 hours before: Free cancellation, refund issued for online prepaid
- Cancel < 24 hours before: Cancellation fee applies (configurable per service)
- No-show: Cancellation fee applies
- Online prepaid: Partial refund (total minus fee)
- Phone bookings: Fee noted, collected at next visit or waived at owner discretion

---

## Loyalty System

- Earn: 1 point per $1 spent on **eligible purchases only**
- **Eligible:** Retail products and services
- **Excluded:** Water purchases (SKU: 0000001 / category: Water) do NOT earn points
- Redeem: 100 points = $5 off (stackable)
- Points earned after payment is processed
- Rewards redeemable on next visit (encourages return)
- Admin can manually adjust points
- Entire system toggleable on/off via feature flags
- Points deducted proportionally on refunds

---

## Marketing Engine

### Campaign System

- Audience targeting: filter by last service type, last visit date, vehicle type, spend level, custom tags
- Message composition: SMS template (Twilio) + email template (Mailgun, branded HTML)
- Coupon attachment: auto-generate unique codes per recipient
- Scheduling: immediate send or scheduled future send
- A/B testing: test two messages, measure redemption rates

### Coupon Engine

- Types: flat discount ($), percentage (%), free add-on service, free product
- Unique code per customer (prevents sharing/abuse)
- Configurable: expiry date, single-use vs multi-use, minimum purchase amount
- Validated and redeemed at POS checkout
- Full tracking: issued → delivered → redeemed → revenue attributed

### Lifecycle Automation Rules

Configurable per service type with timing and action:

| Service | Trigger Delay | Action |
|---|---|---|
| Ceramic Coating | 8 weeks | SMS+Email: booster wash reminder + coupon |
| Full Detail | 6 weeks | SMS+Email: return reminder + discount |
| Basic Wash | 3 weeks | SMS: wash reminder + booking link |
| Any service | 90 days no visit | Win-back campaign |
| Birthday | On date | Birthday reward (free item/discount) |

Rules are vehicle-aware (remind about the specific car that was serviced).

### Communication Channels

- **SMS (Twilio):** Transactional (confirmations, reminders, receipts) + Marketing campaigns
- **Email (Mailgun):** Transactional (confirmations, receipts, quotes) + Marketing campaigns (branded HTML)
- **Telegram:** Owner notifications (new bookings, cancellations, daily summaries)
- **Two-Way SMS:** Inbound customer SMS routed to Telegram, owner replies via Telegram, sent back as SMS

### TCPA Compliance

- Opt-in captured at POS checkout (customer-facing screen) and online booking
- Every marketing SMS includes opt-out instructions ("Reply STOP to unsubscribe")
- Opt-out immediately honored, synced across all channels
- Consent audit log: who opted in, when, where, method
- Separate consent tracking for SMS and email
- Marketing messages only sent to opted-in customers

---

## Inventory Management

### Stock Management

- Real-time quantities (decremented at POS sale, incremented on return/receiving)
- Low stock alerts (configurable threshold per product)
- Dashboard: products below reorder point

### Vendor Management

- Vendor directory (name, contact, lead time)
- Products linked to preferred vendor
- Cost price history tracking

### Purchase Orders

- Create PO from low-stock alerts or manually
- Send PO to vendor via email (Mailgun)
- Track status: ordered → shipped → received
- Receiving workflow with count verification and variance flagging
- Stock auto-updated on receive
- Cost of goods sold feeds into QuickBooks

---

## QuickBooks Online Integration

Automated sync via N8N:

| Data | Direction | Trigger |
|---|---|---|
| Sales receipts | → QB | On transaction complete |
| Refunds/credit memos | → QB | On refund processed |
| Sales tax liability | → QB | On transaction complete |
| Split payment recording | → QB | On transaction complete |
| Tip tracking (per employee) | → QB | On transaction complete |
| COGS (inventory) | → QB | On product sale/receive |
| Stripe payout reconciliation | → QB | On Stripe payout |
| Vendor bills | → QB | On PO received |

### Reporting Dashboard

- **Revenue:** daily, weekly, monthly, YTD, by service type, by product, by employee
- **Customers:** new vs returning, visit frequency, average ticket, lifetime value, churn risk
- **Services:** most popular, revenue per service, utilization rate
- **Inventory:** stock levels, turnover rate, margins, top sellers
- **Campaigns:** ROI per campaign, best-performing lifecycle rules
- **Comparisons:** period-over-period (month over month, year over year)
- **Employee:** hours worked, tip summaries (gross, CC fee deductions, net), productivity

### Data Export

- CSV export for all report types
- QuickBooks-compatible formats
- Scheduled reports via email (weekly summary, monthly P&L data)

---

## Photo Documentation

- Before/after photo capture at POS (iPad camera)
- Damage documentation (pre-existing issues — liability protection)
- Tagged to: service ticket + vehicle + customer
- Stored in Supabase Storage (organized by customer/vehicle/date)
- Customer consent toggle per photo set (marketing use permission)
- Viewable in: POS (staff review), customer portal (customer history), admin (marketing library)
- Feature toggleable on/off

---

## Quotes System

- Create quote from admin, POS, or via 11 Labs voice agent
- Customer, vehicle, selected services with pricing
- Send via SMS and/or email with unique link
- Customer can approve online → converts to booking
- Quote expiration (configurable)
- Status tracking: draft → sent → viewed → accepted → converted / expired

---

## 11 Labs Voice Agent Integration

Pre-built voice agent for inbound calls (outbound capable). Connects to the system via REST API:

| Endpoint | Purpose |
|---|---|
| `GET /api/services` | List services with pricing by vehicle size |
| `GET /api/availability` | Check open time slots for a date + service duration |
| `POST /api/appointments` | Create booking |
| `GET /api/customers` | Lookup customer by phone, retrieve vehicles |
| `POST /api/quotes` | Generate and send quote |
| `GET /api/business-hours` | Current operating hours |

Same booking and availability rules enforced regardless of channel. Appointments created by voice agent appear identically in POS.

---

## Customer Portal (`/account/*`) ✅ BUILT

- **Authentication:** Phone OTP as primary sign-in method (Supabase Auth + Twilio), email/password as secondary. Sign-up supports post-OTP simplified form (name + email, phone pre-filled) and full registration. Phone-based customer matching links POS/migration customers to auth accounts automatically.
- **Dashboard (`/account`):** Loyalty points balance (links to detail page), active coupons section, upcoming appointments with cancel action, quick actions (book, view transactions, view all appointments).
- **Vehicles (`/account/vehicles`):** Full CRUD — add/edit dialog (type, size class, year, make, model, color), delete with confirmation. All operations via authenticated API with ownership checks.
- **Appointments (`/account/appointments`):** Split into "Upcoming" and "Past" sections. Cancel button on pending/confirmed appointments with 24-hour advance window enforcement and confirmation dialog with policy text. Rebook action on completed/cancelled.
- **Transactions (`/account/transactions`):** Paginated list of completed/refunded transactions. Click-to-expand inline detail showing items, payments, tax, tip, discounts, loyalty earned.
- **Loyalty (`/account/loyalty`):** Current balance prominently displayed, redemption info (100 pts = $5.00 off), chronological ledger with action badges (earned/redeemed/adjusted/expired/bonus), signed points change with running balance.
- **Profile (`/account/profile`):** Editable form for name, phone, marketing preferences (SMS/email consent).
- **Navigation:** AccountShell with 6 tabs — Dashboard, Appointments, Vehicles, Transactions, Loyalty, Profile. Middleware protects all `/account/*` routes.
- **Photos:** Before/after photos of their vehicles (when feature active, Phase 8)
- **Online store link:** Browse and purchase products (WooCommerce, Phase 9)

---

## POS Checkout Flow

### Standard Checkout

1. Cashier creates ticket (from appointment or walk-in)
2. Adds services (price auto-set by vehicle size) and products
3. Applies coupons/rewards if applicable
4. Taps [READY FOR CUSTOMER]
5. **iPad flips to customer-facing screen:**
   - Displays total
   - Prompts for phone number (lookup or create profile)
   - Loyalty program opt-in
   - SMS marketing opt-in
   - Customer confirms
6. **iPad flips back to cashier:**
   - Tip screen (if card payment)
   - Payment method selection (card, cash, split)
   - Process payment
7. Receipt sent via email and/or SMS
8. Loyalty points credited
9. Transaction recorded → syncs to QuickBooks

### Refund Flow

1. POS → Refunds tab
2. Lookup transaction by receipt #, phone, or date
3. Select specific line items to refund (partial or full)
4. System processes: Stripe refund to original method (or cash), inventory restock for products, loyalty points deducted, QuickBooks credit memo
5. Refund receipt sent to customer

---

## End-of-Day Process

1. Cashier initiates end-of-day from POS
2. System displays expected cash based on day's cash transactions
3. Cashier enters actual cash count
4. Variance calculated and flagged if outside threshold
5. Cash drop/deposit amount recorded
6. Day summary generated:
   - Total transactions
   - Total revenue (card vs cash breakdown)
   - Tips collected (by employee, gross and net)
   - Refunds processed
   - Coupons redeemed
   - New customers added
   - Loyalty points issued
7. Summary posted to QuickBooks
8. Optional: summary sent to owner via Telegram

---

## Role-Based Access Control

### Roles

| Role | Description |
|---|---|
| Super-Admin | Owner. Full unrestricted access to everything. Cannot be limited. |
| Admin | Management. Most capabilities except system settings and sensitive financials. |
| Cashier | POS operations. Checkout, customer lookup, apply coupons, basic scheduling. |
| Detailer | Operational. View schedule, update service status, job notes, photos. |

### Permission System

- Each role has sensible default permissions
- Super-Admin can toggle individual permissions on/off per role
- Per-user overrides available (e.g., give one specific cashier refund ability)
- Resolution order: User-level override > Role-level setting > Role default
- Super-Admin permissions cannot be restricted

### Default Permission Matrix

#### POS Operations

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| Open/close register | Yes | Yes | Yes | No |
| Create tickets | Yes | Yes | Yes | No |
| Add products/services to ticket | Yes | Yes | Yes | No |
| Apply coupon codes | Yes | Yes | Yes | No |
| Apply loyalty rewards | Yes | Yes | Yes | No |
| Process card payments | Yes | Yes | Yes | No |
| Process cash payments | Yes | Yes | Yes | No |
| Process split payments | Yes | Yes | Yes | No |
| Issue refunds | Yes | Yes | No | No |
| Void transactions | Yes | No | No | No |
| Apply manual discounts | Yes | Yes | No | No |
| Override pricing | Yes | No | No | No |
| End-of-day cash count | Yes | Yes | Yes | No |

#### Customer Management

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View customer profiles | Yes | Yes | Yes | Yes |
| Create customers | Yes | Yes | Yes | No |
| Edit customer info | Yes | Yes | No | No |
| Delete customers | Yes | No | No | No |
| View customer history | Yes | Yes | Yes | No |
| View loyalty balances | Yes | Yes | Yes | No |
| Manually adjust loyalty points | Yes | Yes | No | No |
| Export customer data | Yes | No | No | No |

#### Appointments & Scheduling

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View today's schedule | Yes | Yes | Yes | Yes |
| View full calendar | Yes | Yes | Yes | No |
| Create appointments | Yes | Yes | Yes | No |
| Reschedule appointments | Yes | Yes | Yes | No |
| Cancel appointments | Yes | Yes | No | No |
| Waive cancellation fees | Yes | Yes | No | No |
| Update service status | Yes | Yes | Yes | Yes |
| Add job notes | Yes | Yes | Yes | Yes |
| Manage detailer schedule | Yes | Yes | No | No |

#### Products & Inventory

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View product catalog | Yes | Yes | Yes | Yes |
| Add/edit products | Yes | Yes | No | No |
| Delete/archive products | Yes | No | No | No |
| View stock levels | Yes | Yes | Yes | No |
| Adjust stock manually | Yes | Yes | No | No |
| Manage purchase orders | Yes | Yes | No | No |
| Receive inventory | Yes | Yes | Yes | No |
| View cost/margin data | Yes | Yes | No | No |
| Manage vendors | Yes | Yes | No | No |

#### Services

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View service catalog | Yes | Yes | Yes | Yes |
| Add/edit services | Yes | Yes | No | No |
| Delete/archive services | Yes | No | No | No |
| Manage add-ons/packages | Yes | Yes | No | No |
| Set size-based pricing | Yes | Yes | No | No |

#### Marketing & Campaigns

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View/create/send campaigns | Yes | Yes | No | No |
| Create coupons | Yes | Yes | No | No |
| View campaign analytics | Yes | Yes | No | No |
| Manage lifecycle rules | Yes | Yes | No | No |
| View/respond to 2-way SMS | Yes | Yes | No | No |

#### Quotes

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| Create/edit quotes | Yes | Yes | Yes | No |
| Send quotes to customer | Yes | Yes | Yes | No |
| Convert quote to appointment | Yes | Yes | Yes | No |

#### Photos

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| Take/upload photos | Yes | Yes | Yes | Yes |
| View photos | Yes | Yes | Yes | Yes |
| Delete photos | Yes | Yes | No | No |
| Approve for marketing | Yes | Yes | No | No |

#### Financial & Reporting

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| View revenue dashboard | Yes | Yes | No | No |
| View detailed financial reports | Yes | No | No | No |
| View cost/margin reports | Yes | No | No | No |
| View employee tip reports | Yes | No | No | No |
| View own tip summary | Yes | Yes | Yes | Yes |
| Export reports | Yes | No | No | No |
| View QuickBooks sync status | Yes | No | No | No |

#### Employee Management

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| Clock in/out (self) | Yes | Yes | Yes | Yes |
| View own hours | Yes | Yes | Yes | Yes |
| View all employee hours | Yes | Yes | No | No |
| Edit time records | Yes | No | No | No |

#### System & Settings

| Permission | Super-Admin | Admin | Cashier | Detailer |
|---|---|---|---|---|
| Feature toggles | Yes | No | No | No |
| Tax/payment configuration | Yes | No | No | No |
| Manage user accounts | Yes | No | No | No |
| Assign roles/edit permissions | Yes | No | No | No |
| Business hours settings | Yes | Yes | No | No |
| View audit log | Yes | No | No | No |
| API keys management | Yes | No | No | No |
| Backup/export all data | Yes | No | No | No |

---

## WooCommerce Online Store Integration

- Product catalog synced from Supabase to WooCommerce via N8N
- Synced fields: name, description, price, images, stock quantity, categories
- Online checkout via WooCommerce + Stripe payment gateway
- Inventory unified: sale on website decrements Supabase stock (and vice versa)
- Order fulfillment: online orders appear in admin for packing/shipping or in-store pickup
- Customer accounts linked to Supabase customer profiles

---

## Recurring Services (Dormant Infrastructure)

Built but toggled OFF. Activate when business warrants:

- Subscription plans: monthly wash membership, maintenance plans
- Stripe Billing for recurring charges
- Customer portal: manage subscription, pause, cancel
- POS awareness: subscription customers flagged, included services auto-applied

---

## Cost Projections (Post-Migration)

| Item | Cost |
|---|---|
| Square | $0 (cancelled) |
| Stripe processing | ~2.9% + 30c online, ~2.7% + 5c in-person |
| Stripe Terminal hardware | ~$59-249 one-time |
| WooCommerce + Stripe plugin | Free |
| Supabase | Free tier (upgrade ~$25/mo if needed) |
| N8N | Self-hosted = free, or cloud ~$20/mo |
| Twilio | Pay-per-message (~$0.0079/SMS) |
| Mailgun | Free tier up to 5,000 emails/mo |
| **Estimated monthly** | **$0-45/mo** (vs $150/mo Square) |
| **Annual savings** | **$1,260-1,800/year** |

---

## Build Phases

### Phase 1 — Foundation, Auth & Data Model ✅ COMPLETE

**Goal:** Solid base that everything else builds on.
**Status:** Complete (2026-02-02). 128+ files, 37 migrations applied to remote Supabase (project: zwvahzymzardmxixyfim), seed data loaded, build passes with zero errors. Super-Admin account seeded (nayeem@smartdetailautospa.com). Staff accounts seeded: Segundo Cadena (detailer), Joselyn Reyes (cashier), Joana Lira (cashier), Su Khan (admin).

- Project scaffolding: Next.js + Tailwind + Supabase + Stripe SDK
- Complete database schema (all tables listed above)
- Supabase Auth: phone OTP for customers, email/password for staff
- Role-based access control with Row Level Security policies
- Feature toggle system
- Square data migration tool — customers, products, transactions, vehicles (see DATA_MIGRATION_RULES.md for import rules and execution order)
- Admin panel foundation: user management, product CRUD, service CRUD with 6 pricing models, add-on suggestion management with combo pricing, service prerequisite rules, mobile zone configuration, vehicle size classification, tax configuration, business hours, feature toggles (see SERVICE_CATALOG.md for service details, DASHBOARD_RULES.md for UI structure)
- Admin dashboard: today's appointments snapshot, status breakdown, quick actions, pending-confirmation alerts (role-appropriate views per DASHBOARD_RULES.md)
- Appointments management: month calendar view with status-colored dots, day appointment list, appointment detail/edit dialog, cancel dialog with reason and fee
  - Role-based permissions enforced per permission matrix: detailers see today's schedule only (no calendar), cashiers cannot cancel, only admin/super-admin can cancel
  - Status dropdown shows recommended transitions by default with an "Override" group for staff to set any status (e.g. no_show back to confirmed)
  - Reschedule with overlap detection
  - API routes: PATCH `/api/appointments/[id]`, POST `/api/appointments/[id]/cancel`
- Admin shell: header bar with "Open POS" button (opens `/pos` in new tab, ready for Phase 2) and account dropdown (user initials, name, email, role, status, sign out) available on all admin pages
- Staff management: role reassignment (Cashier↔Admin↔Detailer↔Super Admin) via staff detail page, permission overrides per employee
- Public website: SEO-optimized server-rendered pages for services, products (individual URLs, generateMetadata, JSON-LD, sitemap.xml)
- Online booking page: service selection, vehicle, date/time picker, customer info, Stripe payment

**Known Gaps (to backfill):**
- Product and service edit pages partially implemented — list views exist but individual edit forms need completion
- Some settings sections are placeholder/incomplete (integrations, notifications, business profile)

### Phase 2 — POS Application ✅ COMPLETE

**Goal:** Replace Square's POS. Enables cancelling Square subscription.
**Status:** Complete (2026-02-03). Full POS system with 67+ files covering pages, components, API routes, context, utilities. Production-ready with multi-method payments, loyalty, coupons, receipts, cash management, and complete audit trail.

**Authentication & Security:**
- PIN-based login: 4-digit PIN pad with rate limiting (5 failures → 15-minute lockout), magic link token generation via Supabase Auth
- IP-based network restriction: configurable via Admin > Settings > POS Security (`pos_allowed_ips` + `pos_ip_whitelist_enabled` in `business_settings`), enforced in `src/middleware.ts`. Env var `ALLOWED_POS_IPS` as fallback. Local dev connections (::1/127.0.0.1) always pass through.
- Idle timeout: configurable via `pos_idle_timeout_minutes` in business_settings (default 15 min), auto-logout on inactivity
- Role-based access: admin/super_admin vs cashier, manager-only end-of-day close

**Catalog & Product Management:**
- Product + service catalog with category tabs, grid/tile layout, product images
- Vehicle-aware service pricing: auto-price by vehicle size class from service_pricing tiers
- Service pricing picker dialog for selecting tier and vehicle size
- Search by name, SKU, or barcode across products and services
- Barcode scanner integration (USB/HID reader, connection status indicator in header)
- Custom items: arbitrary name, price, taxability toggle, per-item notes

**Ticket Management:**
- Line items: add products, services, custom items with quantity, notes, pricing
- Customer & vehicle association with dynamic price recalculation on vehicle change
- Coupon application with validation (flat/$/%/free item, expiry, usage limits, minimum purchase)
- Loyalty points display, redemption (100pts = $5), and earn preview
- Manual discount: dollar or percentage with optional label (e.g., "Employee discount"), manager-only
- Ticket hold/park: suspend active ticket, resume from queue (max 10 held tickets with timestamps)
- Clear cart confirmation dialog
- Ticket-level notes field

**Checkout & Payment:**
- Payment methods: Cash, Card (Stripe Terminal), Check, Split (cash + card)
- Cash: amount tendered input, auto-calculate change, quick-tender buttons ($20, $50, $100, exact)
- Card: Stripe Payment Intent, card-present via Terminal, on-reader tipping (15%/18%/20% presets), auto-capture, card brand/last4 tracking
- Check: check number input with reference tracking
- Split: distribute between cash and card with split tip handling
- Tip screen: preset percentages, custom amount, displayed on total
- Payment complete screen: receipt number, customer type badge, loyalty points earned, receipt delivery options
- Button label: "Checkout" (renamed from "Pay Now")

**Receipts:**
- Three delivery channels: Print (Star WebPRNT thermal printer), Email (Mailgun), SMS (Twilio)
- Receipt template with business header, itemized list, tax, tip, payment breakdown
- Re-send from transaction detail (print/email/SMS for completed/voided/refunded transactions)
- Star printer IP configurable via business_settings

**Loyalty System (toggleable):**
- Earn: 1 point per $1 on eligible purchases (water SKU excluded)
- Redeem: 100 points = $5 discount (one-click full balance redeem)
- Ledger: per-transaction entries (earned, redeemed, adjusted) with balance snapshots
- Proportional point deduction on refunds

**Coupons:**
- Code validation at POS (`/api/pos/coupons/validate`)
- Types: flat dollar, percentage, free add-on, free product
- Enforcements: expiry date, single-use per customer, usage limits, minimum purchase, max discount cap

**Transaction Management:**
- Create: stores customer, vehicle, employee, items, payments, tax, tip, discount, coupon, loyalty
- Search: receipt number lookup, customer phone, date range, pagination (`/api/pos/transactions/search`)
- Transaction list: status badges, date presets (today/week/month/year/custom), search, pagination
- Transaction detail: full items, payments, customer, vehicle, refund history
- Void: admin/super-admin only, confirmation modal, irreversible
- Admin transactions page (`/admin/transactions`): full list with search, date/status filters, inline detail expansion, CSV export, receipt re-send

**Refunds:**
- Partial or full item-level refunds with quantity and restock option
- Stripe refund for card payments, inventory restock for products, proportional loyalty point deduction
- Reason entry required, status tracking (processed/failed)
- Over-refund prevention via per-item quantity tracking

**End-of-Day & Cash Management:**
- Open register with starting float (cash count form)
- Day summary API: total transactions, revenue, subtotal, tax, tips, payment method breakdown, refunds
- Close register: cash count, expected vs actual, variance, next-day float, deposit calculation
- Drawer session tracking in localStorage with green dot indicator in POS nav
- Auto-close drawer on EOD submit, manager-only access

**Favorites System:**
- Register tab with configurable favorites grid
- 10 color themes with 6 intensity levels (10%-100%)
- Action types: product, service, custom_amount, customer_lookup, discount, surcharge
- Edit mode with color shade picker
- Percentage-based surcharge support

**UI & Navigation:**
- Tablet-optimized layout with bottom navigation (Register, Products, Services tabs)
- Top bar: back nav (Admin↔POS toggle), business name, scanner indicator, held tickets badge, employee name, role badge, live clock
- Keyboard shortcuts: F1 (new ticket), F2 (checkout), Esc (close modals), ? (help)
- POS ↔ Admin bidirectional navigation
- Customer type/tags system (enthusiast, detailer) with badges
- Role-based views: cashiers restricted from EOD, manual discounts, settings; role badge in header

### Phase 3 — Booking System, Quotes & 11 Labs Integration ✅ COMPLETE

**Goal:** Enable customers to book through any channel.
**Status:** Complete (2026-02-03). Quotes system, voice agent API, staff scheduling, waitlist, webhook events, and online booking payment all built and verified.

- Shared infrastructure: webhook utility (`fireWebhook()`), API key auth for voice agent, quote number generator (`Q-0001` format), expanded types and validation schemas
- Database migrations: `waitlist_entries`, `employee_schedules`, `blocked_dates` tables, `quotes.access_token` column, `voice_agent_api_key` setting, expanded webhook event keys
- Quote system: full CRUD API (`/api/quotes`), admin list/create/edit pages (`/admin/quotes`), public quote view page (`/quote/[token]`), quote accept (public, via access_token), quote-to-appointment conversion
  - Line items with tiered pricing: services auto-populate price from service_pricing tiers, vehicle size-aware pricing, tier dropdown + vehicle size dropdown for multi-tier services
  - Add Vehicle dialog on both create and edit pages
  - Send via Email (Mailgun), SMS with PDF (Twilio MMS), or both — send method selection dialog
  - PDF generation endpoint (`/api/quotes/[id]/pdf`) using pdfkit — professional layout with business header, line items table, totals, footer
  - Valid Until defaults to 10 days from today (editable)
  - Status lifecycle: draft → sent → viewed → accepted → converted / expired
- 11 Labs Voice Agent REST API: 6 endpoints under `/api/voice-agent/` — services, availability, appointments (GET/POST), quotes, customers — all authenticated via API key (not Supabase session)
- Staff scheduling: admin page (`/admin/appointments/scheduling`), per-employee weekly schedule CRUD, blocked dates management with calendar picker, API routes for schedules and blocked dates
- Enhanced slot availability: `/api/book/slots` now checks employee_schedules + blocked_dates (backward compatible — falls back to business_hours if no schedules exist)
- Waitlist system: API routes (`/api/waitlist`), admin panel (`/admin/appointments/waitlist`), auto-notify on cancellation, booking wizard integration ("Join Waitlist" when no slots, gated by WAITLIST feature flag)
- Webhook events: `booking.created`, `appointment.confirmed`, `appointment.cancelled`, `appointment.rescheduled`, `appointment.completed`, `quote.created`, `quote.sent`, `quote.accepted` — fired from appointment and booking routes via shared `fireWebhook()` utility
- Online booking payment: Stripe Elements payment step in booking wizard (gated by `ONLINE_BOOKING_PAYMENT` feature flag), `POST /api/book/payment-intent` for PaymentIntent creation, payment_intent_id stored on appointment
- Admin nav: Quotes added to sidebar navigation (between Transactions and Customers), `/quote` added to public routes in middleware

### Phase 4 — Customer Portal ✅ COMPLETE

**Goal:** Customer self-service, reduce phone calls.

- Phone OTP sign-in redesigned as primary auth method (Supabase Auth + Twilio) with Square-style card layout, 60-second resend cooldown, email/password as secondary fallback
- Sign-up page supports post-OTP simplified profile completion (name + email only, phone pre-filled) and fresh phone OTP registration with full email/password alternative
- Link-account API matches customers by: (1) auth_user_id already linked, (2) phone match where auth_user_id is null, (3) email match where auth_user_id is null, (4) create new — enables POS/migration customers to claim their accounts via phone
- CustomerAuthProvider updated with `refreshCustomer()` method for post-profile-completion re-fetch
- Customer API endpoints: vehicles CRUD (GET/POST/PATCH/DELETE with ownership checks), paginated transactions (list + detail with items/payments/vehicle), loyalty ledger (balance + paginated entries), active coupons, appointment self-cancellation (24-hour advance window, webhook fired)
- Dashboard: points balance (links to loyalty detail page), active coupons section, upcoming appointments with cancel action, "View Transactions" quick action
- Vehicle management: add/edit dialog with react-hook-form validation, delete with confirmation, fetches via API instead of direct Supabase queries
- Appointments page: split into "Upcoming" and "Past" sections, cancel button with confirmation dialog and policy text, refreshes on status change
- Transaction history page: paginated list with expandable detail (items, payments, tax, tip, loyalty earned), click-to-expand inline
- Loyalty detail page: current balance prominently displayed, redemption info (100 pts = $5.00 off), chronological ledger with action badges (earned/redeemed/adjusted/expired/bonus), points change with running balance
- AccountShell tabs: Dashboard, Appointments, Vehicles, Transactions, Loyalty, Profile
- Validation schemas: phoneOtpSendSchema, phoneOtpVerifySchema, customerVehicleSchema
- 24 files total (13 new, 11 modified), `npm run build` passes with zero errors

### Phase 5 — Marketing, Coupons & Campaigns

**Goal:** Turn one-time customers into repeat customers.

- Campaign builder: audience filters, message composer, coupon attachment, scheduling
- Coupon engine: unique codes, validation at POS, full lifecycle tracking
- Lifecycle automation rules: service-based triggers, configurable timing, vehicle-aware
- SMS delivery (Twilio) + email delivery (Mailgun, branded HTML templates)
- Two-way SMS: inbound routed to Telegram, reply via Telegram
- Google review requests: post-service automation with direct link
- TCPA compliance: consent capture, opt-out handling, audit log
- Campaign analytics: delivery, opens, redemptions, revenue attribution, ROI

### Phase 6 — Inventory Management

**Goal:** Full supply chain visibility, COGS tracking.

- Stock management: real-time quantities, low stock alerts, reorder dashboard
- Vendor management: directory, product links, cost history
- Purchase orders: create, send to vendor, track status
- Receiving workflow: receive against PO, count verification, variance flagging
- Cost tracking: COGS per transaction, margin reporting

### Phase 7 — QuickBooks Integration & Reporting

**Goal:** Automated bookkeeping and business intelligence.

- QuickBooks Online API integration via N8N
- Auto-sync: sales receipts, refunds, tax, tips, COGS, split payments, Stripe payouts, vendor bills
- Employee time tracking: clock in/out, hours, exportable for payroll
- Tip reports: per employee, gross/net with CC fee deductions
- Reporting dashboard: revenue, customers, services, inventory, campaigns, comparisons
- Data export: CSV, QB-compatible, scheduled email reports
- Low stock alerts

### Phase 8 — Photo Documentation

**Goal:** Visual service records and marketing content.

- Photo capture at POS (before/after/damage)
- Supabase Storage (organized by customer/vehicle/date)
- Customer consent tracking for marketing use
- Viewable in POS, customer portal, admin marketing library
- Feature toggleable on/off

### Phase 9 — Online Store (WooCommerce Sync)

**Goal:** Sell products online with unified inventory.

- Product catalog sync: Supabase to WooCommerce via N8N
- Online checkout via WooCommerce + Stripe
- Unified inventory across POS and online store
- Order fulfillment workflow (ship or in-store pickup)
- Customer accounts linked

### Phase 10 — Recurring Services (Dormant)

**Goal:** Infrastructure ready for future activation.

- Subscription plan configuration in admin
- Stripe Billing integration for recurring charges
- Customer portal subscription management
- POS subscription awareness
- Built and tested but toggled OFF

### Phase 11 — Intelligence & Growth

**Goal:** Leverage data for strategic growth.

- Customer lifetime value scoring
- Churn risk identification
- Vehicle service history analytics
- Google Business Profile integration (post updates, monitor reviews)
- Automated win-back campaigns for at-risk customers
- Referral program: unique codes, track referrals, reward referrer
- Seasonality insights

### Phase 12 — iPad POS Optimization

**Goal:** Native-like iPad experience with offline resilience.

> **Detailed Spec:** See [`iPAD.md`](./iPAD.md) for full feature descriptions and planning requirements.

- Larger touch targets (44px minimum per Apple HIG)
- Numeric keyboard for quantity/amount fields (`inputMode="numeric"`)
- Sticky cart sidebar (always visible during browsing)
- PWA with offline support (service worker, sync queue, conflict resolution)
- Quick "New Customer" inline form (create without leaving checkout)
- Recent transactions shortcut (quick access for reprints/refunds)
- Swipe-to-delete on cart items (intuitive gesture with undo)
- Dark mode (system preference detection + manual toggle)

**Planning Required:** Component audit, offline strategy, design work, technical decisions. See iPAD.md for details.

---

## UX & Accessibility Standards (Cross-Phase)

These standards apply across all phases and should be implemented progressively:

- **Global search (Cmd+K):** Admin-wide search bar — customers, products, transactions, appointments
- **Bulk actions:** Every list/table page supports multi-select with bulk tag, export, and contextual actions
- **Multi-tag filtering:** All list pages support filtering by multiple tags simultaneously
- **CSV export:** Every list page has an export button (CSV format)
- **Breadcrumb navigation:** Consistent breadcrumbs on all admin pages with proper hierarchy
- **Loading states:** Consistent skeleton/spinner patterns across all data-loading views
- **Dialog accessibility:** All modals trap focus, support Escape to close, and restore focus on dismiss
- **Empty states:** Every section has a purposeful empty state with icon, description, and action button
- **Search placeholders:** All search inputs have descriptive placeholder text (e.g., "Search by name, phone, or email")
- **Login page consistency:** Staff and customer login pages use the same UI component library
- **Audit log viewer:** Admin page for viewing all system actions (who did what, when) — super-admin only

---

## Estimated Cost After Full Migration

| Before (Square) | After (Auto Detail) |
|---|---|
| $150/month fixed | $0-45/month variable |
| Limited data access | Full data ownership |
| API restrictions | Full API control |
| Square transaction fees | Comparable Stripe fees |
| Dependent on Square roadmap | Full feature control |

---

## Document Version History

| Version | Date | Changes |
|---|---|---|
| v1 | 2026-02-01 | Initial project document |
| v2 | 2026-02-01 | Added companion document references, services & pricing overview (30 services, 6 pricing models, 3 vehicle tiers, mobile service zones, add-on suggestion system, service prerequisites), updated database schema with new tables, updated build phases |
| v3 | 2026-02-01 | Updated loyalty system: water purchases (SKU: 0000001) excluded from earning points |
| v4 | 2026-02-01 | Phase 1 marked complete. Added SEO Requirements section — all public-facing pages must be SSR with individual URLs, generateMetadata, JSON-LD, sitemap.xml. Ceramic Coatings highest SEO priority. |
| v5 | 2026-02-02 | Added appointments management to Phase 1: calendar view with status dots, detail/edit dialog, cancel with reason/fee, API routes with status transition and overlap validation. Role-based permissions enforced per permission matrix (detailer=today only, cashier=no cancel, admin/super-admin=full). Dashboard updated with today's snapshot. Staff accounts seeded (4 employees). Public website and online booking page completed. |
| v6 | 2026-02-02 | Status dropdown shows recommended transitions with "Override" group for staff flexibility. Account dropdown added to admin header bar (all pages). Staff role reassignment documented. |
| v7 | 2026-02-02 | "Open POS" button added to admin header bar — opens `/pos` in new tab, navigation ready for Phase 2 POS build. |
| v8 | 2026-02-02 | Phase 1 known gaps documented (product/service edit pages, settings sections). Phase 2 expanded: ticket hold/park, clear cart confirmation, POS "More" menu, quick-tender buttons, scanner indicator, line-item notes, keyboard shortcuts, expanded split payment, bidirectional POS↔Admin nav. New "UX & Accessibility Standards" cross-phase section added: global search (Cmd+K), bulk actions, multi-tag filtering, CSV export, breadcrumbs, loading states, dialog focus trapping, empty states, search placeholders, login consistency, audit log viewer. Customer transaction history tab wired to live data. |
| v9 | 2026-02-02 | Phase 2 expanded: void transaction (admin-only, confirmation modal), receipt re-send from transaction detail (print/email/SMS), manual ticket discount (dollar/percent with label, manager-only), admin transactions page (search, filters, inline detail, CSV export, receipt actions), role-based POS views (cashier restrictions for EOD/discounts/settings, role badge in header), cash drawer open/close tracking (opening float, status banner, nav indicator, auto-close on EOD). |
| v10 | 2026-02-03 | Phase 3 marked complete. Quotes system (CRUD API, admin pages, public view, PDF generation, send via email/SMS/both), 11 Labs Voice Agent REST API (6 endpoints with API key auth), staff scheduling (weekly schedules, blocked dates, enhanced slot availability), waitlist system (API, admin panel, auto-notify, booking wizard integration), webhook events for appointment/quote lifecycle, online booking payment via Stripe Elements, shared webhook utility. |
| v11 | 2026-02-03 | Phase 2 marked complete with comprehensive documentation: 67+ files covering PIN auth, IP restriction, idle timeout, catalog with barcode scanner, vehicle-aware pricing, all payment methods, tip handling, receipts (print/email/SMS), loyalty system, coupon validation, item-level refunds, cash management, favorites system, keyboard shortcuts, tablet-optimized UI. DASHBOARD_RULES.md POS Management section expanded with full built-feature inventory. |
| v12 | 2026-02-03 | Phase 4 marked complete. Customer Portal: phone OTP sign-in (primary) with email fallback, Square-style card layout; sign-up with post-OTP simplified form and phone-based customer matching (POS/migration customers auto-linked); customer API endpoints for vehicles CRUD, paginated transactions with detail, loyalty ledger, coupons, appointment self-cancellation (24h window + webhook); dashboard with coupons section and loyalty link; vehicle management with add/edit/delete dialogs; appointments split into upcoming/past with cancel action; transaction history with inline expandable detail; loyalty page with balance + ledger; AccountShell expanded with Transactions and Loyalty tabs. 24 files (13 new, 11 modified). |
