# Dashboard Rules — Auto Detail

## Purpose

This document is the **single source of truth** for how the Auto Detail admin dashboard and management interface should be designed, organized, and operated. It is informed by analysis of the existing Square Dashboard and expanded to cover all features of the new system.

All decisions regarding dashboard layout, navigation, reporting, and functionality are documented here.

---

## Source: Square Dashboard Analysis

Nine screenshots of the Square Dashboard were analyzed to map every feature currently available. This ensures the new system covers all existing functionality plus the expanded capabilities.

### Square Dashboard Navigation (Current)

From the screenshots, Square provides these main navigation sections:

```
HOME
├── Performance (daily metrics, chart)
├── Quick Actions (add item, take payment, send invoice)
└── Banking (balance, next transfer)

APPOINTMENTS
├── Overview
├── Calendar (weekly view, per-staff)
├── Waitlist
├── Online Booking
│   ├── Channels
│   ├── Settings
│   ├── Advanced Widget
│   └── Invite Clients
└── Settings
    ├── Calendar & Booking
    ├── Payments & Cancellations
    ├── Communications
    └── History

ITEMS & SERVICES
├── Item Library (all products with images, categories, pricing)
├── New Item
├── Customer Packages
├── Service Library
├── Packages
├── Image Library
├── Modifiers
├── Categories
├── Options
├── Units
├── Sales Tax
├── Inventory Management
│   ├── Stock Overview
│   ├── History
│   ├── Stock Alerts
│   ├── Purchase Orders
│   └── Vendors
└── Settings

PAYMENTS & INVOICES
├── Transactions
├── Orders (All, Active, Scheduled, Completed, Cancelled)
├── Shipments
├── Order Partners
├── Fulfillment Settings
├── Invoices
│   ├── Overview
│   ├── Projects
│   ├── Invoices
│   ├── Recurring Series
│   ├── Estimates
│   ├── Reports
│   ├── Apps
│   └── Settings
├── Virtual Terminal
│   ├── Overview
│   └── Settings
├── Payment Links
│   ├── Overview
│   └── Settings
├── Subscriptions
├── Disputes
└── Risk Manager
    ├── Overview
    ├── Analytics
    ├── Alerts
    ├── Rules
    ├── Block List
    ├── Allow List
    ├── Blocked Payments
    ├── Allowed Payments
    └── Settings

ONLINE
├── Websites
└── Sales Channels
    ├── Google Business Profile
    ├── DoorDash, Uber Eats, Grubhub (not relevant)
    ├── Google Ads
    ├── Local Listings on Google
    ├── Meta for Business
    └── Reserve with Google / Instagram (Appointments)

CUSTOMERS
├── Customer Directory (1,670 records, sortable)
├── Customer Directory
│   ├── Directory
│   ├── Feedback
│   ├── Insights
│   └── Settings
├── Contracts
│   ├── Contracts
│   ├── Templates
│   └── Clauses
├── Marketing
│   ├── Overview
│   ├── Campaigns
│   ├── Automations
│   ├── Google Reviews
│   ├── Coupons
│   ├── Assistant
│   ├── Contact Collection
│   └── Settings
├── Loyalty
│   ├── Overview
│   └── Settings
├── Activity
└── Reports
    ├── Marketing
    └── Promotions

REPORTS
├── Sales
│   ├── Sales Summary (detailed financial breakdown)
│   ├── Item Sales
│   ├── Sales Trends
│   ├── Category Sales
│   ├── Team Sales
│   ├── Modifier Sales
│   ├── Gift Cards
│   ├── Future Bookings
│   └── Deposit Bookings
├── Accounting
│   ├── Sales Taxes
│   ├── Fees
│   ├── Service Charges
├── Payments
│   ├── Transaction Status
│   ├── Discounts
│   ├── Comps
│   ├── Cash Drawers
├── Operations
│   ├── Activity Log
│   ├── Labor vs Sales
│   ├── Team Performance
│   ├── Purchase Funnel
│   ├── Traffic & Sources
├── Inventory
│   ├── Cost of Goods Sold
│   ├── Inventory by Category
│   ├── Product Profit
│   ├── Inventory Sell-Through
│   └── Aging Inventory
├── Custom
│   ├── Custom Fee Report
│   └── Custom Reports
└── Settings
    └── Reporting Timeframes

STAFF (Team)
├── Team Members (7 members, roles, locations, bookable status)
├── Staff
│   ├── Team Members
│   ├── Permissions
│   └── Onboarding
├── Scheduling
│   ├── Schedule
│   ├── Availability
│   ├── Time Off
├── Time Tracking
│   ├── Workday
│   ├── Timecards
├── Payroll
│   ├── Run Payroll
│   ├── Business Info
│   ├── Tax Info
│   ├── Pay Schedule
│   ├── Bank Account
│   ├── Benefits
│   ├── Tips
│   ├── Tax Forms
│   └── Settings
├── Announcements
└── Settings
    ├── Schedule
    ├── Clock Ticket
    ├── Breaks
    ├── Overtime
    ├── Messaging
    ├── Tips
    ├── Commissions
    └── Alerts

BANKING
├── Balance / Transfers

SETTINGS
├── Account & Settings
│   ├── Personal Information
│   ├── Sign In & Security (email, phone, password, POS passcode, passkeys, 2FA)
│   ├── Preferences
├── My Business
│   ├── About
│   ├── Security
│   ├── Locations
├── Pricing & Subscriptions
├── Payments
│   ├── Receipts
│   ├── Sales Taxes
│   ├── Service Charges
│   ├── Payment Methods
│   ├── Check Settlement
├── Banking
│   ├── Bank Accounts
│   └── Settings
├── Notifications
│   ├── Account
│   ├── Service Disruptions
│   ├── Invoices
│   └── Staff
├── Hardware
│   ├── Square Hardware
│   ├── Order Square Hardware
│   ├── My Orders
│   ├── Information Requests
│   ├── Get Free Processing
├── Device Management
│   ├── Devices
│   ├── Device Codes
│   ├── Modes
│   ├── Printer Profiles
│   ├── Kitchen Displays
│   ├── Photos
└── App Integrations
    ├── Release Manager
    └── Open Tickets
```

---

## Auto Detail Dashboard Structure

The new dashboard must cover everything Square does PLUS our expanded features. Here is the definitive navigation and organization:

### Primary Navigation

```
AUTO DETAIL — ADMIN DASHBOARD (/admin)

┌─────────────────────────────────────────────────────┐
│ MAIN NAVIGATION (Left Sidebar)                      │
│                                                      │
│ 📊 Dashboard (Home)                                 │
│ 🧾 POS Management                                  │
│ 📅 Appointments                                     │
│ 👥 Customers                                        │
│ 📦 Products & Services                              │
│ 📋 Inventory                                        │
│ 📣 Marketing                                        │
│ 💰 Financials                                       │
│ 📈 Reports                                          │
│ 👤 Staff                                            │
│ ⚙️ Settings                                         │
└─────────────────────────────────────────────────────┘
```

**Note:** Emojis shown above are for document readability only. The actual dashboard will use clean iconography, not emojis, unless the owner explicitly requests them.

---

### 1. DASHBOARD (Home)

The landing page when an admin/owner logs in. At-a-glance business health.

```
/admin

DASHBOARD
├── Today's Snapshot
│   ├── Revenue today (vs same day last week)
│   ├── Transactions today
│   ├── Average ticket
│   ├── New customers today
│   └── Appointments remaining today
│
├── Performance Chart
│   ├── Revenue chart (day/week/month selectable)
│   ├── Comparison toggle (vs prior period)
│   └── Breakdown: services vs products vs water
│
├── Quick Actions
│   ├── Take Payment (opens POS)
│   ├── Create Appointment
│   ├── Add Product
│   ├── Send Campaign
│   └── Run Report
│
├── Alerts & Notifications
│   ├── Low stock alerts (products below reorder threshold)
│   ├── Upcoming appointments (next 24 hours)
│   ├── Open POs awaiting delivery
│   ├── Pending refunds
│   ├── Cash drawer variance (if end-of-day not completed)
│   └── Campaign results (recent sends)
│
├── Recent Activity Feed
│   ├── Last 10 transactions
│   ├── New bookings
│   ├── Customer signups
│   └── Coupon redemptions
│
└── Business Banking
    ├── Stripe balance
    ├── Next payout date and amount
    └── QuickBooks sync status
```

**Square parity:** Covers Home screen (performance, quick actions, banking) with added alerts, activity feed, and QuickBooks status.

---

### 2. POS MANAGEMENT

Manage everything related to the point-of-sale system.

```
/admin/pos

POS MANAGEMENT
├── Open POS (/pos — launches tablet POS in new tab)
│
├── Held Tickets
│   ├── Currently held/parked tickets (resume or discard)
│   ├── Hold reason and timestamp
│   └── Quick-resume from POS main screen
│
├── Transactions
│   ├── All Transactions (searchable, filterable)
│   │   ├── Filter by: date range, payment method, staff, customer, status
│   │   ├── View details: line items, payment, customer, receipt
│   │   └── Actions: refund, void, resend receipt, view in QuickBooks
│   ├── Today's Transactions
│   └── Pending / Open Tickets
│
├── Refunds
│   ├── Recent Refunds
│   ├── Process New Refund (lookup transaction)
│   └── Refund History
│
├── Cash Drawer
│   ├── Current Status (open/closed)
│   ├── Expected vs Actual
│   ├── End-of-Day History
│   └── Cash Drop Log
│
├── Receipts
│   ├── Receipt Template (customize branding, footer message)
│   ├── Delivery Settings (email via Mailgun, SMS via Twilio)
│   └── Receipt History (searchable)
│
├── Tips
│   ├── Tip Summary (by employee, by period)
│   ├── CC Fee Deductions
│   └── Tip Payout Report
│
├── Quotes
│   ├── All Quotes (draft, sent, accepted, expired, converted)
│   ├── Create New Quote
│   └── Quote Templates
│
└── Settings
    ├── Tax Configuration (rate, product-only rule)
    ├── Tip Percentages (default options)
    ├── CC Fee Deduction Rate (currently 5%)
    ├── Cash Drawer Float Amount
    ├── Variance Tolerance
    ├── Receipt Footer Message
    ├── Customer-Facing Screen Settings
    ├── Quick-Tender Buttons (configure denominations: $20, $50, $100, exact)
    ├── Barcode Scanner Settings (connection status, test scan)
    └── POS Keyboard Shortcuts (view and customize)
```

**Built features:**

*Authentication & Security:*
- PIN-based login: 4-digit PIN pad with rate limiting (5 failures → 15-minute lockout), magic link token generation via Supabase Auth
- IP-based network restriction: `ALLOWED_POS_IPS` env var, enforced in middleware (production only)
- Idle timeout: configurable via `pos_idle_timeout_minutes` in business_settings (default 15 min), auto-logout on inactivity
- Role-based views: cashiers cannot see EOD, settings, or manual discounts; role badge in POS header

*Catalog & Ticket:*
- Product + service catalog: category tabs, grid/tile layout, product images, search by name/SKU/barcode
- Vehicle-aware service pricing: auto-price by vehicle size class from service_pricing tiers, pricing picker dialog
- Barcode scanner integration: USB/HID reader with connection status indicator in POS header
- Custom items: arbitrary name, price, taxability toggle, per-item notes
- Line items: add products, services, custom items with quantity, notes, pricing
- Customer & vehicle association with dynamic price recalculation on vehicle change
- Coupon application with validation (flat/$/%/free item, expiry, usage limits, minimum purchase)
- Loyalty points: display, redemption (100pts = $5), earn preview (gated by LOYALTY feature flag)
- Manual discount: dollar or percentage on active ticket, optional label (e.g., "Employee discount"), manager-only
- Ticket hold/park: suspend active ticket, resume from queue (max 10 held tickets with timestamps)
- Clear cart confirmation dialog, ticket-level notes field

*Checkout & Payment:*
- Payment methods: Cash, Card (Stripe Terminal), Check, Split (cash + card)
- Cash: amount tendered input, auto-calculate change, quick-tender buttons ($20, $50, $100, exact)
- Card: Stripe Payment Intent, card-present via Terminal, on-reader tipping (15%/18%/20% presets), auto-capture, card brand/last4 tracking
- Check: check number input with reference tracking
- Split: distribute between cash and card with split tip handling
- Tip screen: preset percentages, custom amount, displayed on total
- Payment complete screen: receipt number, customer type badge, loyalty points earned, receipt delivery options

*Receipts:*
- Three delivery channels: Print (Star WebPRNT thermal printer), Email (Mailgun), SMS (Twilio)
- Receipt re-send: from transaction detail, print/email/SMS for completed/voided/refunded transactions

*Transactions & Refunds:*
- Admin Transactions page (`/admin/transactions`): full list with search, date presets, status filter, inline detail expansion, CSV export, receipt re-send (print/email/SMS)
- Void transaction: from POS transaction detail, admin/super-admin only, confirmation dialog, irreversible
- Partial or full item-level refunds: quantity and restock option, Stripe refund for card payments, proportional loyalty point deduction, reason required

*Cash Management:*
- Open register with starting float (cash count form)
- Day summary: total transactions, revenue, subtotal, tax, tips, payment method breakdown, refunds
- Close register: cash count, expected vs actual, variance, next-day float, deposit calculation
- Drawer session tracking in localStorage with green dot indicator in POS nav, auto-close on EOD submit, manager-only

*Favorites System:*
- Register tab with configurable favorites grid, 10 color themes with 6 intensity levels
- Action types: product, service, custom_amount, customer_lookup, discount, surcharge
- Edit mode with color shade picker, percentage-based surcharge support

*UI & Navigation:*
- Tablet-optimized layout with bottom navigation (Register, Products, Services tabs)
- Top bar: Admin↔POS toggle, business name, scanner indicator, held tickets badge, employee name, role badge, live clock
- Keyboard shortcuts: F1 (new ticket), F2 (checkout), Esc (close modals), ? (help)
- Customer type/tags system (enthusiast, detailer) with badges

*Quotes:*
- Quotes system (`/admin/quotes`): full CRUD with list/create/edit pages, status badges (draft/sent/viewed/accepted/expired/converted), customer picker, vehicle picker (with Add Vehicle dialog), line items with tiered service pricing (tier dropdown + vehicle size dropdown), auto-calculated totals, send via email (Mailgun) / SMS with PDF (Twilio MMS) / both, public quote view (`/quote/[token]`), accept online, convert to appointment, PDF generation endpoint
  - Valid Until defaults to 10 days from today
  - Quote numbers: sequential Q-0001 format
  - Public quote page: server-rendered for SEO, accessible via access_token (no auth required)

**Square parity:** Covers Transactions, Cash Drawers, Receipts, Tips. Adds quotes, refund management, and customer-facing screen config.

---

### 3. APPOINTMENTS

```
/admin/appointments

APPOINTMENTS
├── Calendar
│   ├── Day / Week / Month view
│   ├── Filter by: staff, service type, status
│   ├── Drag-and-drop rescheduling
│   ├── Click to view appointment details
│   └── Color-coded by status (confirmed, in-progress, completed, cancelled, no-show)
│
├── Upcoming (list view)
│   ├── Next 7 days
│   ├── Filter by status
│   └── Quick actions: confirm, cancel, reschedule, start
│
├── Waitlist (toggleable feature)
│   ├── Current waitlist entries
│   ├── Auto-notify settings
│   └── History
│
├── Cancellations
│   ├── Recent cancellations
│   ├── Cancellation fees collected
│   ├── No-show log
│   └── Fee waiver history
│
├── Online Booking
│   ├── Booking Page Preview
│   ├── Embeddable Widget Code (for WordPress)
│   ├── Booking Link (shareable URL)
│   ├── Channel Settings (which services bookable online, by phone)
│   └── Payment Settings (require payment for online bookings)
│
├── 11 Labs Voice Agent
│   ├── API Status (connected/disconnected)
│   ├── Recent Bookings via Phone
│   ├── API Logs
│   └── Configuration (endpoint URLs, auth keys)
│
└── Settings
    ├── Business Hours (store hours)
    ├── Detailer Schedule (per employee, per day)
    ├── Buffer Time Between Appointments
    ├── Cancellation Policy (fee amounts, time threshold)
    ├── Confirmation Message Templates (SMS + email)
    ├── Reminder Timing (default: 24 hours before)
    └── Blocked Dates (holidays, vacations)
```

**Built features:**
- Calendar: month view with status-colored dots, day appointment list, detail/edit dialog, cancel dialog (Phase 1)
- Staff scheduling page (`/admin/appointments/scheduling`): per-employee weekly schedule grid (Mon-Sun), blocked dates management with calendar picker and reason field
- Waitlist admin panel (`/admin/appointments/waitlist`): list with status badges, filter by status/service/date, notify/book/cancel actions (gated by WAITLIST feature flag)
- Enhanced slot availability: `/api/book/slots` checks employee_schedules + blocked_dates + business_hours
- Webhook events fire for confirmed/cancelled/rescheduled/completed appointments
- Cancellation auto-notifies matching waitlist entries via SMS

**Square parity:** Covers Calendar, Waitlist, Online Booking, Settings. Adds 11 Labs integration, cancellation tracking, staff scheduling, and widget embedding.

---

### 4. CUSTOMERS

```
/admin/customers

CUSTOMERS
├── Directory
│   ├── All Customers (searchable by name, phone, email)
│   │   ├── Sort by: name, last visit, lifetime spend, points balance
│   │   ├── Filter by: has phone, has email, opted-in, last visit range, tags
│   │   ├── Bulk actions: tag, export, send campaign
│   │   └── Duplicate Detection alerts
│   ├── Create Customer
│   └── Import Customers (CSV upload with migration rules)
│
├── Customer Profile (individual view)
│   ├── Contact Info (phone, email, address, birthday)
│   ├── Vehicles (list, add, edit — year/make/model/color/size)
│   ├── Visit History (all transactions, linked to vehicles)
│   ├── Service History per Vehicle
│   ├── Loyalty Points (balance, ledger, manual adjustment)
│   ├── Active Coupons
│   ├── Marketing Consent Status (SMS, email, audit log)
│   ├── Notes (internal)
│   ├── Tags
│   ├── Photos (before/after, linked to service tickets)
│   ├── Communication History (SMS sent, emails sent)
│   ├── Campaign History (which campaigns they received, redeemed)
│   └── Lifetime Metrics (total spend, avg ticket, visit frequency, first/last visit)
│
├── Segments & Groups
│   ├── Create Segment (reusable audience filter)
│   │   ├── Filter by: last visit, service type, vehicle type, spend, tags, consent
│   │   └── Preview count
│   ├── Saved Segments (for reuse in campaigns)
│   └── Predefined Segments
│       ├── VIP (top 10% by spend)
│       ├── At Risk (no visit in 60+ days)
│       ├── New (first visit in last 30 days)
│       ├── Repeat (2+ visits)
│       └── Product-Only (never had a service)
│
├── Vehicles
│   ├── All Vehicles (searchable)
│   ├── Vehicles with incomplete info (flagged for capture)
│   └── Vehicle makes/models breakdown
│
├── Feedback
│   ├── Google Reviews (linked from post-service automation)
│   └── Customer Notes/Complaints
│
└── Settings
    ├── Required Fields (what's mandatory at POS customer creation)
    ├── Customer-Facing Screen Text (loyalty pitch, marketing opt-in text)
    └── Auto-Tagging Rules
```

**Square parity:** Covers Directory, Feedback, Insights. Adds vehicle management, segments, communication history, and profile enrichment tracking.

---

### 5. PRODUCTS & SERVICES

```
/admin/catalog

PRODUCTS & SERVICES
├── Products
│   ├── All Products (searchable, filterable by category, vendor, stock status)
│   │   ├── Thumbnail, name, SKU, category, stock, cost, retail, margin
│   │   ├── Quick edit (price, stock)
│   │   └── Bulk actions: adjust price, update category, archive
│   ├── Add Product
│   │   ├── Name, SKU, description, category
│   │   ├── Cost price, retail price
│   │   ├── Vendor selection
│   │   ├── Tax rule (taxable / non-taxable)
│   │   ├── Images (upload to Supabase Storage)
│   │   ├── Stock quantity, reorder threshold
│   │   ├── Visibility: POS, online store, both
│   │   ├── Weight (for shipping)
│   │   └── Barcode / GTIN
│   ├── Product Categories
│   │   ├── Manage categories (add, rename, reorder, archive)
│   │   └── Assign products to categories
│   └── Import Products (CSV with Square field mapping)
│
├── Services
│   ├── All Services (searchable by category)
│   │   ├── Name, category, duration, base price, status
│   │   └── Quick edit (pricing matrix, duration)
│   ├── Add Service
│   │   ├── Name, category, description (short + long)
│   │   ├── Base duration (hours, minutes)
│   │   ├── Pricing Matrix (per vehicle size class)
│   │   ├── Available Add-Ons (link to other services)
│   │   ├── Images
│   │   ├── Visibility: POS, online booking, phone agent
│   │   ├── Cancellation fee for this service
│   │   └── Lifecycle rule suggestion (remind in X weeks)
│   ├── Service Categories
│   │   └── Manage categories
│   └── Add-Ons & Packages
│       ├── Manage Add-On Services
│       └── Create/Edit Packages (bundled services at set price)
│
├── Service Categories (see SERVICE_CATALOG.md for full catalog)
│   ├── Precision Express (Express Wash, Express Interior)
│   ├── Signature Detail (Complete Detail)
│   ├── Paint Correction & Restoration (Single-Stage, 3-Stage)
│   ├── Ceramic Coatings (1-Year, 3-Year, 5-Year Shield)
│   ├── Exterior Enhancements (8 add-on/standalone services)
│   ├── Interior Enhancements (7 add-on/standalone services)
│   └── Specialty Vehicles (Motorcycle, RV, Boat, Aircraft)
│
├── Vehicle Size Classes (see SERVICE_CATALOG.md)
│   ├── 3 standard tiers: Sedan, Truck/SUV (2-Row), SUV (3-Row) / Van
│   ├── Specialty types: Motorcycle, RV, Boat, Aircraft (each with own sizing)
│   ├── Manage tier labels and examples
│   └── Default class for unknown vehicles (Sedan)
│
└── Settings
    ├── Tax Rate (10.25% CA, products only)
    ├── Default new product settings
    ├── Image requirements / sizing
    └── Online store sync settings (WooCommerce)
```

**Square parity:** Covers Item Library, Service Library, Categories, Modifiers, Sales Tax, Packages. Adds vehicle size class management, add-on relationships, and lifecycle rule linking.

---

### 6. INVENTORY

```
/admin/inventory

INVENTORY
├── Stock Overview
│   ├── All products with current quantities
│   ├── Filter: in-stock, low stock, out of stock, all
│   ├── Sort by: quantity, days until stockout, turnover rate
│   └── Quick adjust (manual stock correction with reason)
│
├── Low Stock Alerts
│   ├── Products below reorder threshold
│   ├── Projected stockout dates (based on sales velocity)
│   └── Quick action: create PO from alerts
│
├── Purchase Orders
│   ├── All POs (draft, submitted, shipped, received, partial)
│   ├── Create PO
│   │   ├── Select vendor
│   │   ├── Add products with quantities
│   │   ├── Auto-populate from low stock alerts
│   │   ├── Cost totals and margin preview
│   │   └── Notes to vendor
│   ├── Submit & Email PO to Vendor
│   ├── Receive Inventory
│   │   ├── Receive against PO
│   │   ├── Count verification (ordered vs received)
│   │   ├── Variance flagging (short, damaged)
│   │   ├── Partial receive support
│   │   └── Auto-update stock quantities
│   └── PO History
│
├── Vendors
│   ├── Vendor Directory
│   │   ├── Name, contact, email, phone, lead time
│   │   ├── Products linked to vendor
│   │   ├── PO history with vendor
│   │   └── Performance metrics (fill rate, avg delivery time)
│   ├── Add/Edit Vendor
│   └── Vendor Performance Report
│
├── History
│   ├── Stock adjustment log (who changed what, when, why)
│   ├── Receiving log
│   └── Sales deduction log
│
├── Cost of Goods Sold
│   ├── COGS by period
│   ├── COGS by category
│   ├── COGS by product
│   └── Margin analysis
│
└── Reports
    ├── Inventory Value (at cost, at retail)
    ├── Inventory by Category
    ├── Sell-Through Rate
    ├── Aging Inventory (slow movers)
    ├── Product Profit Margins
    ├── Top Sellers
    ├── Reorder Forecast (next 30 days)
    └── Vendor Performance Comparison
```

**Square parity:** Covers Stock Overview, History, Stock Alerts, Purchase Orders, Vendors, COGS, Inventory by Category, Product Profit, Sell-Through, Aging Inventory. Adds vendor performance, reorder forecasting, and margin analysis.

---

### 7. MARKETING

```
/admin/marketing

MARKETING
├── Overview
│   ├── Active campaigns
│   ├── Recent sends
│   ├── Top performing campaigns (by redemption, revenue)
│   └── Upcoming scheduled sends
│
├── Campaigns
│   ├── All Campaigns (draft, scheduled, sent, completed)
│   ├── Create Campaign
│   │   ├── Name and goal
│   │   ├── Audience builder (filters, preview count)
│   │   ├── Coupon setup (create new or attach existing)
│   │   ├── Message composer (SMS + email templates)
│   │   ├── Variable insertion (name, vehicle, coupon code, etc.)
│   │   ├── A/B test setup (optional)
│   │   ├── Schedule (immediate or future)
│   │   └── Cost estimate and ROI projection
│   ├── Campaign Analytics
│   │   ├── Delivery metrics (sent, delivered, failed)
│   │   ├── Engagement (opens, clicks for email)
│   │   ├── Redemptions (coupon usage)
│   │   ├── Revenue attributed
│   │   ├── A/B test winner
│   │   └── ROI calculation
│   └── Duplicate Campaign (reuse with tweaks)
│
├── Automations (Lifecycle Rules)
│   ├── All Rules (active, paused)
│   ├── Create Rule
│   │   ├── Trigger: service type + time delay
│   │   ├── Audience filter (additional conditions)
│   │   ├── Action: SMS, email, or both
│   │   ├── Message template
│   │   ├── Coupon attachment
│   │   └── Chain rules (sequence of messages)
│   ├── Rule Performance
│   │   ├── Triggers fired
│   │   ├── Messages sent
│   │   ├── Redemptions
│   │   └── Revenue attributed
│   └── Predefined Templates
│       ├── Post-service thank you
│       ├── Ceramic booster reminder (8 weeks)
│       ├── Full detail reminder (6 weeks)
│       ├── Basic wash reminder (3 weeks)
│       ├── Win-back (90 days inactive)
│       └── Birthday reward
│
├── Coupons
│   ├── All Coupons (draft, active, expired via expires_at, disabled)
│   ├── Create Coupon
│   │   ├── Type: flat $, percentage %, free add-on, free product
│   │   ├── Applies to: any, specific services, specific products
│   │   ├── Code type: unique per customer or universal
│   │   ├── Usage: single-use or multi-use
│   │   ├── Minimum purchase
│   │   └── Expiration date
│   ├── Coupon Analytics
│   │   ├── Issued, redeemed, expired
│   │   ├── Revenue from redemptions
│   │   └── Redemption rate
│   └── Bulk Generate (for import/distribution)
│
├── Google Reviews
│   ├── Review Request Settings
│   │   ├── Timing (X hours after service completion)
│   │   ├── Message template
│   │   └── Google Business listing link
│   ├── Review Monitoring (if Google API connected)
│   └── Response Management
│
├── Two-Way SMS
│   ├── Conversations (threaded by customer)
│   ├── Unread messages
│   ├── Telegram routing settings
│   └── Auto-reply settings (after hours message)
│
├── Compliance
│   ├── Consent Audit Log
│   │   ├── All opt-ins and opt-outs with timestamp and source
│   │   └── Export for legal/compliance
│   ├── Opt-Out Management
│   │   ├── Current opt-outs
│   │   └── Manual opt-out (for phone/email requests)
│   └── TCPA/CAN-SPAM Settings
│       ├── Required footer text for SMS
│       ├── Unsubscribe link for email
│       └── Consent collection points
│
└── Settings
    ├── SMS Settings (Twilio credentials, sender number)
    ├── Email Settings (Mailgun credentials, sender address, domain)
    ├── Email Templates (branded HTML templates)
    ├── Default Campaign Settings
    └── Telegram Bot Settings (for owner notifications)
```

**Square parity:** Covers Campaigns, Automations, Google Reviews, Coupons, Contact Collection, Settings. Adds lifecycle rules engine, A/B testing, two-way SMS, compliance audit, Telegram routing, and ROI tracking.

---

### 8. FINANCIALS

```
/admin/financials

FINANCIALS
├── Overview
│   ├── Revenue this period (selectable: today, week, month, quarter, year)
│   ├── Revenue comparison (vs prior period)
│   ├── Gross margin
│   ├── Outstanding payables (open POs)
│   └── Stripe balance and next payout
│
├── QuickBooks Integration
│   ├── Connection Status
│   ├── Sync Log (last sync, items synced, errors)
│   ├── Manual Sync Trigger
│   ├── Mapping Configuration
│   │   ├── Service income account
│   │   ├── Product income account
│   │   ├── Tax liability account
│   │   ├── Tips payable account
│   │   ├── COGS account
│   │   └── Stripe deposit account
│   └── Error Queue (failed syncs, manual resolution)
│
├── Stripe
│   ├── Dashboard Link (external)
│   ├── Recent Charges
│   ├── Recent Refunds
│   ├── Payout Schedule
│   ├── Terminal Devices (status, last active)
│   └── Processing Fees Summary
│
├── Sales Tax
│   ├── Tax Collected (by period)
│   ├── Tax by Category
│   ├── Tax Filing Summary
│   └── Export for Filing
│
├── Tips
│   ├── Tip Summary by Employee
│   ├── Gross Tips vs Net Tips (after CC fee deduction)
│   ├── Cash Tips vs Card Tips
│   ├── Tip Payout Report (for payroll)
│   └── Export
│
├── Fees & Costs
│   ├── Stripe Processing Fees (by period)
│   ├── Compared to previous Square fees (savings tracking)
│   └── Other Business Costs (if tracked)
│
└── Data Export
    ├── Export Transactions (CSV, QuickBooks format)
    ├── Export Customer Data
    ├── Export Inventory
    ├── Scheduled Reports (weekly email, monthly email)
    └── Full Data Backup
```

**Square parity:** Covers Fees, Sales Taxes, Transaction Status, Banking. Adds QuickBooks integration management, Stripe dashboard, tip breakdowns, and savings tracking vs old Square costs.

---

### 9. REPORTS

```
/admin/reports

REPORTS
├── Sales Reports
│   ├── Sales Summary
│   │   ├── Gross sales, discounts, net sales, tax, tips, total collected
│   │   ├── Breakdown: card vs cash vs prepaid
│   │   ├── Period selector (day, week, month, quarter, year, custom)
│   │   └── Comparison (vs prior period, vs same period last year)
│   ├── Sales by Service
│   │   ├── Revenue per service type
│   │   ├── Service count
│   │   └── Average ticket per service
│   ├── Sales by Product
│   │   ├── Units sold, revenue, margin
│   │   └── Top/bottom sellers
│   ├── Sales by Category
│   ├── Sales by Employee
│   ├── Sales Trends (chart: daily, weekly, monthly)
│   ├── Sales by Channel (POS, online, phone)
│   └── Sales by Day of Week / Hour of Day (heatmap)
│
├── Customer Reports
│   ├── New vs Returning Customers
│   ├── Customer Lifetime Value (distribution)
│   ├── Visit Frequency Distribution
│   ├── Average Ticket by Customer Segment
│   ├── Churn Risk (customers overdue for visit)
│   ├── Customer Acquisition Source
│   └── Top Customers (by spend, by visits)
│
├── Appointment Reports
│   ├── Bookings by Channel (online, phone, walk-in)
│   ├── Cancellation Rate
│   ├── No-Show Rate
│   ├── Utilization Rate (booked hours vs available hours)
│   ├── Average Service Duration (actual vs estimated)
│   └── Future Bookings (upcoming revenue)
│
├── Inventory Reports
│   ├── (same as Inventory > Reports section)
│   ├── COGS, sell-through, aging, margins
│   └── Stock level snapshots
│
├── Marketing Reports
│   ├── Campaign Performance Summary
│   ├── Coupon Redemption Rates
│   ├── Lifecycle Rule ROI
│   ├── SMS Delivery Rates
│   ├── Email Open/Click Rates
│   └── Revenue Attributed to Marketing
│
├── Employee Reports
│   ├── Hours Worked (by employee, by period)
│   ├── Revenue per Employee
│   ├── Transactions per Employee
│   ├── Tip Report (gross, deductions, net)
│   └── Service Completion Times
│
├── Financial Reports
│   ├── Revenue Summary
│   ├── Payment Method Breakdown
│   ├── Tax Collected
│   ├── Discount Impact
│   ├── Refund Summary
│   └── Processing Fee Analysis
│
├── Custom Reports
│   ├── Report Builder (select metrics, filters, grouping)
│   └── Saved Custom Reports
│
└── Scheduled Reports
    ├── Configure: daily, weekly, monthly email delivery
    ├── Select report types to include
    └── Recipient list (email addresses)
```

**Square parity:** Covers all Square report types: Sales Summary, Item Sales, Sales Trends, Category Sales, Team Sales, COGS, Inventory by Category, Product Profit, Sell-Through, Aging Inventory, Activity Log, Labor vs Sales, Team Performance, Traffic & Sources, Custom Reports, Reporting Timeframes. Adds customer analytics, appointment analytics, marketing ROI, and scheduled email delivery.

---

### 10. STAFF

```
/admin/staff

STAFF
├── Team Members
│   ├── All Staff (name, role, status, last active)
│   ├── Add Team Member
│   │   ├── Name, email, phone
│   │   ├── Role assignment (Super-Admin, Admin, Cashier, Detailer)
│   │   ├── Initial password
│   │   └── Bookable for appointments (yes/no)
│   ├── Edit Team Member
│   │   ├── Profile info
│   │   ├── Role change
│   │   ├── Custom permission overrides
│   │   └── Deactivate / reactivate
│   └── Permissions Matrix
│       ├── View per-role defaults
│       └── Toggle individual permissions per role or per user
│
├── Scheduling
│   ├── Weekly Schedule View
│   │   ├── Per-employee availability
│   │   ├── Drag-and-drop schedule editing
│   │   └── Recurring pattern setup
│   ├── Availability Management
│   │   ├── Set available days/hours per employee
│   │   └── Override for specific weeks
│   └── Time Off
│       ├── Request time off
│       ├── Approve/deny
│       └── Calendar blocked automatically
│
├── Time Tracking
│   ├── Today's Clock Status (who's in, who's out)
│   ├── Timecards (by employee, by period)
│   ├── Edit Timecards (admin/super-admin only)
│   └── Export for Payroll
│
├── Payroll Support
│   ├── Hours Summary (by pay period)
│   ├── Tip Summary (gross, CC deductions, net)
│   ├── Combined Payroll Report
│   └── Export to QuickBooks / CSV
│
└── Settings
    ├── Clock In/Out Rules
    ├── Break Settings
    ├── Overtime Rules
    └── POS Passcode Settings
```

**Square parity:** Covers Team Members, Permissions, Schedule, Availability, Time Off, Timecards, Payroll, Tips, Clock Ticket, Breaks, Overtime. Adds custom permission toggles and QuickBooks payroll export.

---

### 11. SETTINGS

```
/admin/settings

SETTINGS
├── Business Profile
│   ├── Business Name
│   ├── Address
│   ├── Phone Number
│   ├── Email
│   ├── Logo (upload)
│   ├── Business Hours (store hours display)
│   └── About / Description
│
├── Feature Toggles
│   ├── Loyalty & Rewards (on/off + config)
│   ├── Recurring/Subscription Services (on/off)
│   ├── Online Booking Requires Payment (on/off)
│   ├── SMS Marketing (on/off)
│   ├── Email Marketing (on/off)
│   ├── Google Review Requests (on/off)
│   ├── Two-Way SMS (on/off)
│   ├── Waitlist (on/off)
│   ├── Photo Documentation (on/off)
│   ├── Cancellation Fee Enforcement (on/off + config)
│   └── Referral Program (on/off)
│
├── Integrations
│   ├── Stripe
│   │   ├── API Keys
│   │   ├── Terminal Devices
│   │   └── Webhook Configuration
│   ├── Stripe Terminal
│   │   ├── Paired Devices
│   │   ├── Test Connection
│   │   └── Reader Settings
│   ├── QuickBooks Online
│   │   ├── Connection Status
│   │   ├── Account Mapping
│   │   └── Sync Schedule
│   ├── Twilio (SMS)
│   │   ├── Account SID, Auth Token
│   │   ├── Phone Number
│   │   └── Test Send
│   ├── Mailgun (Email)
│   │   ├── API Key, Domain
│   │   ├── Sender Address
│   │   └── Test Send
│   ├── Telegram (Owner Notifications)
│   │   ├── Bot Token
│   │   ├── Chat ID
│   │   └── Notification Preferences (what triggers a message)
│   ├── 11 Labs (Voice Agent)
│   │   ├── API Endpoint URL
│   │   ├── Authentication
│   │   └── Webhook URL for callbacks
│   ├── WooCommerce
│   │   ├── Site URL
│   │   ├── API Keys
│   │   ├── Sync Settings (frequency, what syncs)
│   │   └── Test Connection
│   ├── N8N
│   │   ├── Instance URL
│   │   ├── Workflow Status (list active workflows)
│   │   └── Error Log
│   └── Google Business Profile
│       ├── Connection Status
│       └── Review Link
│
├── Locations
│   ├── Store Address and Details
│   └── (future: multi-location support)
│
├── Notifications
│   ├── Owner Notification Preferences
│   │   ├── New booking → Telegram (on/off)
│   │   ├── Cancellation → Telegram (on/off)
│   │   ├── Large transaction → Telegram (on/off, threshold)
│   │   ├── Low stock → Telegram (on/off)
│   │   ├── End-of-day summary → Telegram (on/off)
│   │   ├── Campaign sent → Telegram (on/off)
│   │   └── Refund processed → Telegram (on/off)
│   └── Staff Notification Settings
│
├── Security
│   ├── POS Passcode Settings
│   ├── Session Timeout
│   ├── Two-Factor Authentication
│   ├── Password Policy
│   └── API Key Management
│
├── Data Management
│   ├── Import Data (Square migration tools)
│   ├── Export All Data
│   ├── Backup History
│   └── Audit Log (who did what, when — all system actions)
│
└── About
    ├── System Version
    ├── License
    └── Support Contact
```

**Square parity:** Covers all Square settings: Account, Locations, Pricing, Payments, Receipts, Sales Taxes, Payment Methods, Bank Accounts, Notifications, Hardware, Device Management, App Integrations. Adds feature toggles, all new integrations, notification preferences, and audit log.

---

## Dashboard Design Principles

### 1. Role-Appropriate Views

Each role sees only what they need:
- **Super-Admin:** Full dashboard, all sections, all financial data
- **Admin:** Simplified operational view — today's appointments, recent transactions, inventory alerts, staff schedule. No revenue charts, banking info, or system settings.
- **Cashier:** Only POS Management and relevant Appointment views
- **Detailer:** Only their schedule, job details, and time clock

Navigation items not accessible to a role are hidden entirely (not grayed out).

### 2. Mobile Responsive

While the POS is tablet-optimized, the admin dashboard must also work on:
- Desktop (primary for owner)
- Tablet (secondary)
- Phone (for quick checks — view reports, see alerts)

### 3. Real-Time Data

All dashboard metrics update in real-time via Supabase Realtime subscriptions:
- Revenue counters
- Transaction feed
- Appointment status changes
- Stock levels
- Alert badges

### 4. Consistent Layout Pattern

Every list/table view follows the same pattern:
- Search bar at top
- Filters (collapsible)
- Sortable columns
- Pagination
- Bulk action bar (when items selected)
- Export button
- Create/Add button (top right)

### 5. Zero-State Handling

Every section has a helpful zero-state when empty:
- "No transactions yet today" (not a blank white screen)
- "Create your first campaign" with a guided flow
- "No low stock alerts — inventory is healthy"

### 6. Quick Navigation

- Global search (Cmd+K or top search bar): search customers, products, transactions, appointments by any field
- Recent items: last 5 viewed customers, transactions, products
- Breadcrumb navigation on all pages
- Keyboard shortcuts for power users

---

## Square Features NOT Carried Over

These Square features are intentionally excluded:

| Square Feature | Reason |
|---|---|
| DoorDash / Uber Eats / Grubhub | Food delivery — not applicable |
| Kitchen Displays | Restaurant feature — not applicable |
| Dining Options | Restaurant feature — not applicable |
| Square Gift Cards | Replaced by coupon/reward system. Gift cards may be added later |
| Square Loans / Banking | Using own bank + Stripe |
| Virtual Terminal | Replaced by POS + Stripe |
| Contracts / Clauses | Not needed currently (could add if fleet accounts arise) |
| Invoices / Recurring Series | Not needed currently. Dormant subscription system covers future need |
| Order Partners | Not applicable |
| Commissions | Not applicable currently |
| Food Pickup & Delivery | Not applicable |

---

## Square Features Carried Over (Improved)

| Square Feature | Auto Detail Equivalent | Improvement |
|---|---|---|
| Home / Performance | Dashboard Home | Added alerts, activity feed, QuickBooks status |
| Appointments Calendar | Appointments > Calendar | Added 11 Labs integration, cancellation tracking |
| Item Library | Products & Services | Split products from services, added vehicle-size pricing |
| Customer Directory | Customers > Directory | Added vehicles, segments, lifecycle tracking |
| Reports | Reports (expanded) | Added customer analytics, appointment metrics, marketing ROI |
| Campaigns | Marketing > Campaigns | Added A/B testing, lifecycle rules, two-way SMS |
| Loyalty | Feature toggle + POS integration | Configurable on/off, points visible at checkout |
| Coupons | Marketing > Coupons | Unique codes per customer, full redemption tracking |
| Stock Alerts | Inventory > Low Stock Alerts | Added predictive reorder forecasting |
| Purchase Orders | Inventory > Purchase Orders | Added vendor email, receiving workflow, COGS tracking |
| Team Members | Staff > Team Members | Added granular permissions, custom overrides |
| Time Tracking | Staff > Time Tracking | Added QuickBooks export, tip integration |
| Sales Tax | Settings + POS | Product-only tax rule, auto-calculated |
| Cash Drawers | POS > Cash Drawer | Added variance tracking, deposit log |
| Google Business | Settings > Integrations | Added review request automation |

---

## Public Website (SEO Pages)

The platform includes a public-facing website alongside the admin dashboard. All public pages are Next.js Server Components — no `'use client'` — optimized for search engine indexing.

### Public Route Structure

| Route | Page | Content |
|---|---|---|
| `/` | Homepage | Hero section, service category grid, "Why Choose Us", CTA |
| `/services` | Services index | All 7 service category cards |
| `/services/[categorySlug]` | Category page | Services in category with pricing preview |
| `/services/[categorySlug]/[serviceSlug]` | Service detail | Full description, pricing table, duration, add-ons, CTA |
| `/products` | Products index | All product category cards |
| `/products/[categorySlug]` | Category page | Products in category |
| `/products/[categorySlug]/[productSlug]` | Product detail | Full description, price, availability |
| `/sitemap.xml` | Dynamic sitemap | All pages with priority weighting |
| `/robots.txt` | Robots file | Allow public, disallow admin/api/login |

### SEO Features

Every public page includes:
- **`generateMetadata()`** — Title, description, canonical URL, OpenGraph, Twitter card
- **JSON-LD structured data** — LocalBusiness (homepage), Service (service pages), Product (product pages), BreadcrumbList (all pages)
- **Dynamic sitemap** — Ceramic coating pages get priority 1.0 (highest SEO priority)
- **Breadcrumb navigation** — With schema.org markup

### Ceramic Coatings SEO Priority

Ceramic coatings service pages are the **#1 SEO priority**:
- Target keywords: "ceramic coating Lomita", "ceramic coating South Bay", "ceramic coating Torrance"
- Priority 1.0 in sitemap (highest)
- Extended descriptions with keyword-rich content
- Full pricing transparency (no "call for quote")
- Complete JSON-LD with price ranges

### Dynamic Business Info

Public components pull business name, phone, and address from the `business_settings` database table at render time — not from hardcoded constants. Changes made in the admin Business Profile page are immediately reflected on the public site.

- **Data layer:** `src/lib/data/business.ts` exports `getBusinessInfo()` wrapped with `React.cache()` for per-request deduplication
- **Consumers:** SiteHeader (name, phone), SiteFooter (name, phone, address), CtaSection (phone), JSON-LD generators (all fields including structured address)
- **Fallback:** If the DB query fails, sensible defaults are used

### Public Components

11 async Server Components in `src/components/public/`:

| Component | Purpose |
|---|---|
| `site-header.tsx` | Sticky nav with business name, Services/Products links, phone (from DB), Book Now CTA |
| `site-footer.tsx` | Dark footer with address, phone (from DB), links, copyright |
| `hero-section.tsx` | Homepage hero with gradient, H1, subtitle, two CTA buttons |
| `service-category-card.tsx` | Card linking to category page |
| `service-card.tsx` | Card with name, starting price (all 6 models), duration, mobile badge |
| `service-pricing-display.tsx` | Renders pricing for all 6 models (vehicle_size, scope, per_unit, specialty, flat, custom) |
| `product-card.tsx` | Card with image, name, price |
| `product-category-card.tsx` | Card linking to product category |
| `breadcrumbs.tsx` | Breadcrumb nav with BreadcrumbList JSON-LD |
| `cta-section.tsx` | "Ready to Transform Your Vehicle?" banner with phone (from DB) + book CTA |
| `json-ld.tsx` | Renders `<script type="application/ld+json">` tags |

### Authentication Boundary

- Public pages (`/`, `/services/*`, `/products/*`) — no auth required, anonymous Supabase reads via RLS
- Admin pages (`/admin/*`) — Supabase Auth required, redirect to `/login` if unauthenticated
- Middleware handles the routing split

---

## Open Decisions (Owner to Confirm)

| # | Decision | Answer | Status |
|---|---|---|---|
| 1 | Dashboard color scheme / branding | Clean light theme — white/light gray background, dark text, brand color as accent. Modern SaaS-style. | CONFIRMED |
| 2 | Default dashboard view for admins | Simplified operational view — today's appointments, recent transactions, inventory alerts. No financial charts or banking info. | CONFIRMED |
| 3 | Email template branding | **Colors:** Black primary, gold/amber accent. **Header:** Business logo (pull from WordPress site) + tagline "Detail. Protect. Shine." **Footer:** Full — address, phone, hours, Google Business review link, unsubscribe link. **Tone:** Warm & personal (friendly language, approachable local shop feel, not corporate). **Social links:** Google Business only (review-focused). **Logo source:** Extract from existing WordPress site. | CONFIRMED |
| 4 | Scheduled report recipients | Owner + all Admin-role users receive scheduled reports automatically | CONFIRMED |
| 5 | POS passcode length | 4-digit PIN — standard for retail POS, quick entry | CONFIRMED |

---

## Document Version History

| Version | Date | Changes |
|---|---|---|
| v1 | 2026-02-01 | Initial document based on Square Dashboard analysis |
| v2 | 2026-02-01 | Fixed vehicle size classes (3-tier system), updated service categories (7 categories per SERVICE_CATALOG.md), updated admin view to simplified operational view, confirmed 4 of 5 open decisions (branding, admin view, POS passcode, report recipients). |
| v3 | 2026-02-01 | Confirmed email template branding: Black & Gold colors, logo + tagline "Detail. Protect. Shine.", full footer with Google review link, warm & personal tone. All 5 open decisions now CONFIRMED. |
| v4 | 2026-02-01 | Added Public Website (SEO Pages) section: route structure, SEO features, ceramic coatings priority, 11 public Server Components, authentication boundary. |
| v5 | 2026-02-01 | Public components now fetch business info (name, phone, address) from `business_settings` table via `getBusinessInfo()` with `React.cache()` deduplication. No more hardcoded business data in public pages. |
| v6 | 2026-02-02 | POS Management: added Held Tickets section (hold/park/resume tickets). POS Settings: added Quick-Tender Buttons, Barcode Scanner Settings, POS Keyboard Shortcuts. |
| v7 | 2026-02-02 | POS Management: admin transactions page built (search, date/status filters, inline detail, CSV export, receipt re-send). Void transaction from transaction detail. Receipt re-send (print/email/SMS). Manual ticket discount (dollar/percent, manager-only). Role-based POS views (cashier restrictions). Cash drawer open/close tracking with EOD integration. |
| v8 | 2026-02-03 | Phase 3 built features documented: Quotes system (admin CRUD pages, public view, PDF generation, send via email/SMS/both, tiered pricing in line items). Staff scheduling (weekly schedule grid, blocked dates). Waitlist admin panel. Enhanced slot availability. Webhook events for appointment lifecycle. 11 Labs Voice Agent API (6 endpoints). |
| v9 | 2026-02-03 | POS Management built features expanded: comprehensive Phase 2 documentation added — PIN auth with rate limiting, IP restriction, idle timeout, catalog with barcode scanner, vehicle-aware pricing, all payment methods (cash/card/check/split), tip screen, receipts (print/email/SMS), loyalty system, coupon validation, refunds, cash management (open/close/variance), favorites system (colors/actions/surcharges), keyboard shortcuts, tablet-optimized UI. |
