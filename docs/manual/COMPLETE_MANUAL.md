# Smart Details Auto Spa — Complete User Manual

*Generated: March 2, 2026*

**Audience:** This manual is written for three audiences:
- **Owners & Admins** — Full system management including settings, staff, marketing, and integrations
- **Staff & Managers** — Daily operations including POS, jobs, customers, and appointments
- **Developers** — Architecture, codebase patterns, and deployment (Chapter 12)

---

## Table of Contents

- [1. Getting Started](#1-getting-started)
  - [1.1 Accessing the System](#11-accessing-the-system)
  - [1.2 Logging In](#12-logging-in)
  - [1.3 User Roles](#13-user-roles)
  - [1.4 First-Time Setup Checklist](#14-first-time-setup-checklist)
- [2. Dashboard](#2-dashboard)
  - [2.1 Dashboard Layout](#21-dashboard-layout)
  - [2.2 Alert Banners](#22-alert-banners)
  - [2.3 Appointment Metrics (Stats Row)](#23-appointment-metrics-stats-row)
  - [2.4 Quotes & Customers Row](#24-quotes-customers-row)
  - [2.5 Online Orders Widget](#25-online-orders-widget)
  - [2.6 Week at a Glance](#26-week-at-a-glance)
  - [2.7 Today's Schedule](#27-todays-schedule)
  - [2.8 Quick Actions](#28-quick-actions)
  - [2.9 Data Freshness](#29-data-freshness)
- [3. Job Management](#3-job-management)
  - [3.1 What Is a Job?](#31-what-is-a-job)
  - [3.2 Job Statuses](#32-job-statuses)
  - [3.3 Job Lifecycle](#33-job-lifecycle)
  - [3.4 Managing Jobs in Admin](#34-managing-jobs-in-admin)
  - [3.5 Managing Jobs in POS](#35-managing-jobs-in-pos)
  - [3.6 Photo Documentation](#36-photo-documentation)
  - [3.7 Add-On Authorization](#37-add-on-authorization)
  - [3.8 Customer Photo Gallery](#38-customer-photo-gallery)
  - [3.9 Vehicle Categories & Pricing](#39-vehicle-categories-pricing)
  - [3.10 Jobs and Appointments](#310-jobs-and-appointments)
  - [3.11 Permissions Reference](#311-permissions-reference)
- [4. Point of Sale (POS)](#4-point-of-sale-pos)
  - [4.1 POS Overview](#41-pos-overview)
  - [4.2 POS Layout](#42-pos-layout)
  - [4.3 Daily Workflow — Opening](#43-daily-workflow-opening)
  - [4.4 Register Tab — Building a Ticket](#44-register-tab-building-a-ticket)
  - [4.5 Customer Management in POS](#45-customer-management-in-pos)
  - [4.6 Checkout Flow](#46-checkout-flow)
  - [4.7 Receipt Options](#47-receipt-options)
  - [4.8 Held Tickets](#48-held-tickets)
  - [4.9 Loyalty Program](#49-loyalty-program)
  - [4.10 Jobs Tab](#410-jobs-tab)
  - [4.11 Quotes Tab](#411-quotes-tab)
  - [4.12 Transactions Tab](#412-transactions-tab)
  - [4.13 Refunds](#413-refunds)
  - [4.14 End of Day](#414-end-of-day)
  - [4.15 Offline Mode](#415-offline-mode)
  - [4.16 Security & Timeouts](#416-security-timeouts)
  - [4.17 Stripe Terminal Setup](#417-stripe-terminal-setup)
  - [4.18 Keyboard Shortcuts](#418-keyboard-shortcuts)
- [5. Customers](#5-customers)
  - [5.1 Customer Overview](#51-customer-overview)
  - [5.2 Customer List](#52-customer-list)
  - [5.3 Creating a Customer](#53-creating-a-customer)
  - [5.4 Customer Detail Page](#54-customer-detail-page)
  - [5.5 Vehicle Management](#55-vehicle-management)
  - [5.6 Duplicate Detection & Merging](#56-duplicate-detection-merging)
  - [5.7 Customer Portal](#57-customer-portal)
  - [5.8 Customer Types](#58-customer-types)
  - [5.9 Tags](#59-tags)
  - [5.10 Marketing Consent](#510-marketing-consent)
  - [5.11 Permissions Reference](#511-permissions-reference)
- [6. Services & Pricing](#6-services-pricing)
  - [6.1 Service Catalog Overview](#61-service-catalog-overview)
  - [6.2 Managing Service Categories](#62-managing-service-categories)
  - [6.3 Creating & Editing Services](#63-creating-editing-services)
  - [6.4 Pricing Tiers](#64-pricing-tiers)
  - [6.5 Add-On Suggestions](#65-add-on-suggestions)
  - [6.6 Service Prerequisites](#66-service-prerequisites)
  - [6.7 Packages / Combos](#67-packages-combos)
  - [6.8 Mobile Zones](#68-mobile-zones)
- [7. CMS & Website Management](#7-cms-website-management)
  - [7.1 Website Overview](#71-website-overview)
  - [7.2 Pages](#72-pages)
  - [7.3 HTML Editor Toolbar](#73-html-editor-toolbar)
  - [7.4 Hero Carousel](#74-hero-carousel)
  - [7.5 Navigation](#75-navigation)
  - [7.6 Footer](#76-footer)
  - [7.7 Announcement Tickers](#77-announcement-tickers)
  - [7.8 Themes](#78-themes)
  - [7.9 SEO Manager](#79-seo-manager)
  - [7.10 City Pages](#710-city-pages)
  - [7.11 Catalog Display](#711-catalog-display)
  - [7.12 Global Blocks](#712-global-blocks)
  - [7.13 Ads](#713-ads)
  - [7.14 Team Members](#714-team-members)
  - [7.15 Credentials](#715-credentials)
  - [7.16 Homepage Settings](#716-homepage-settings)
- [8. Online Store](#8-online-store)
  - [8.1 Online Store Overview](#81-online-store-overview)
  - [8.2 Product Management](#82-product-management)
  - [8.3 Inventory Management](#83-inventory-management)
  - [8.4 Customer Shopping Experience](#84-customer-shopping-experience)
  - [8.5 Checkout Flow](#85-checkout-flow)
  - [8.6 Order Management](#86-order-management)
  - [8.7 Shipping Configuration](#87-shipping-configuration)
  - [8.8 Coupons & Discounts](#88-coupons-discounts)
- [9. Marketing](#9-marketing)
  - [9.1 Marketing Overview](#91-marketing-overview)
  - [9.2 Campaigns](#92-campaigns)
  - [9.3 Automations (Lifecycle Engine)](#93-automations-lifecycle-engine)
  - [9.4 Promotions](#94-promotions)
  - [9.5 Two-Way SMS Messaging](#95-two-way-sms-messaging)
  - [9.6 Analytics Dashboard](#96-analytics-dashboard)
  - [9.7 TCPA Compliance](#97-tcpa-compliance)
  - [9.8 Google Reviews](#98-google-reviews)
- [10. Accounting & Integrations](#10-accounting-integrations)
  - [10.1 Accounting Overview](#101-accounting-overview)
  - [10.2 QuickBooks Online Integration](#102-quickbooks-online-integration)
  - [10.3 Transactions](#103-transactions)
  - [10.4 Quotes](#104-quotes)
- [11. Settings & Configuration](#11-settings-configuration)
  - [11.1 Settings Overview](#111-settings-overview)
  - [11.2 Business Profile](#112-business-profile)
  - [11.3 Feature Toggles](#113-feature-toggles)
  - [11.4 Staff Management](#114-staff-management)
  - [11.5 Roles & Permissions](#115-roles-permissions)
  - [11.6 Messaging Settings](#116-messaging-settings)
  - [11.7 Notification Recipients](#117-notification-recipients)
  - [11.8 Mobile Zones](#118-mobile-zones)
  - [11.9 Tax Configuration](#119-tax-configuration)
  - [11.10 Card Reader (Stripe Terminal)](#1110-card-reader-stripe-terminal)
  - [11.11 Receipt Printer](#1111-receipt-printer)
  - [11.12 POS Settings](#1112-pos-settings)
  - [11.13 POS Security](#1113-pos-security)
  - [11.14 POS Favorites](#1114-pos-favorites)
  - [11.15 Shipping Settings](#1115-shipping-settings)
  - [11.16 Review Settings](#1116-review-settings)
  - [11.17 Coupon Enforcement](#1117-coupon-enforcement)
  - [11.18 Audit Log](#1118-audit-log)
- [12. Developer Guide](#12-developer-guide)
  - [12.1 Architecture Overview](#121-architecture-overview)
  - [12.2 Getting Started (Local Development)](#122-getting-started-local-development)
  - [12.3 Project Structure](#123-project-structure)
  - [12.4 Database](#124-database)
  - [12.5 Authentication & Authorization](#125-authentication-authorization)
  - [12.6 API Route Patterns](#126-api-route-patterns)
  - [12.7 Key Patterns & Gotchas](#127-key-patterns-gotchas)
  - [12.8 Internal Cron System](#128-internal-cron-system)
  - [12.9 Integrations](#129-integrations)
  - [12.10 Theme & Design System](#1210-theme-design-system)
  - [12.11 Deployment](#1211-deployment)
  - [12.12 Troubleshooting](#1212-troubleshooting)
  - [12.13 Reference Docs Index](#1213-reference-docs-index)


---

## 1. Getting Started

This chapter covers how to access the system, how authentication works for each user type, the role-based permission model, and a checklist for first-time setup.

---

### 1.1 Accessing the System

The platform has four entry points, each serving a different audience:

| Entry Point | URL Path | Who Uses It | Auth Method |
|-------------|----------|-------------|-------------|
| Admin Dashboard | `/admin` | Owner, managers, staff with admin access | Email + password (Supabase Auth) |
| Point of Sale | `/pos` | Cashiers, detailers working the register | 4-digit PIN code |
| Customer Portal | `/account` | End customers managing their profile | Phone OTP or email + password |
| Public Website | `/` | Anyone — customers, prospects, search engines | No auth required |

> The admin login page is at `/login`. The customer login page is at `/signin`. These are separate auth flows — a staff email cannot log in as a customer, and vice versa. The system checks the `employees` and `customers` tables respectively and blocks cross-login attempts.

---

### 1.2 Logging In

#### Admin Login (Email + Password)

1. Navigate to `/login`
2. Enter your staff **email** and **password**
3. On success, you are redirected to `/admin`

If you forget your password, an admin with `settings.manage_users` permission can either:
- Set a new password directly from **Admin** → **Staff** → select staff member → **Security** tab → **Set Password**
- Send a password reset email from the same tab → **Send Reset Email**

#### POS Login (PIN Code)

1. Navigate to `/pos` or `/pos/login`
2. Enter your **4-digit PIN** on the keypad
3. On success, the POS workspace loads with your name and role

> A PIN is set by the owner/admin in **Admin** → **Staff** → select staff member → **Profile** tab → **POS PIN Code** field. If a staff member has no PIN set, they cannot access the POS. PIN presence = POS access; no PIN = no POS access.

The POS has two timeout systems:
- **Idle timeout** — Configurable in Admin → Settings → POS Settings. Shows a transparent overlay after inactivity. The staff member re-enters their PIN to resume. The session stays alive.
- **JWT token expiry** — Hardcoded at 12 hours. After expiry, the user is fully redirected to `/pos/login` with a "session expired" toast message. A new PIN login is required.

#### Customer Portal Login (Phone OTP)

1. Navigate to `/signin`
2. Enter your **mobile phone number** (the default sign-in method)
3. Receive a **6-digit SMS code** via Twilio
4. Enter the code to verify
5. On success, redirected to `/account`

Alternatively, customers can switch to **email + password** sign-in by clicking "Sign in with email" on the sign-in page. This mode also supports **Forgot password** which sends a reset link via email.

> New customers who don't have an account yet are directed to `/signup` to create one. The system checks the `customers` table before sending an OTP — if no matching phone number exists, it shows a "Create a new account" link instead of sending a code.

---

### 1.3 User Roles

The system defines four built-in roles. Each role has a set of default permissions that control access across the admin dashboard and POS.

#### Role Overview

| Role | Display Name | Intended For | Description |
|------|-------------|--------------|-------------|
| `super_admin` | Super Admin | Business owner (Nayeem) | Full unrestricted access to everything. Bypasses all permission checks. |
| `admin` | Admin | Trusted managers | Near-full access to admin and POS. Cannot void transactions, override pricing, delete customers, or access system-level settings. |
| `cashier` | Cashier | Front-desk / register operators | POS-focused. Can process payments, create tickets, look up customers, create quotes. No access to marketing, inventory management, or CMS. |
| `detailer` | Detailer | Field technicians | Job-focused. Can view and manage assigned jobs, upload photos, flag issues, clock in/out. No POS payment processing. No admin panel access beyond job-related tasks. |

> Custom roles can be created in **Admin** → **Staff** → **Role Management**. Custom roles start with no permissions and are configured by toggling individual permission switches.

#### Permission Categories

Permissions are organized into categories. Here is every permission key in the system with its category and what it controls:

##### POS Permissions (`pos.*`)

| Permission | What It Controls |
|------------|-----------------|
| `pos.open_close_register` | Open/close the cash register drawer |
| `pos.create_tickets` | Create new sales tickets |
| `pos.add_items` | Add products/services to a ticket |
| `pos.apply_coupons` | Apply coupon codes at checkout |
| `pos.apply_loyalty` | Redeem loyalty points |
| `pos.process_card` | Process card payments |
| `pos.process_cash` | Process cash payments |
| `pos.process_split` | Process split payments (part cash, part card) |
| `pos.issue_refunds` | Issue refunds on completed transactions |
| `pos.void_transactions` | Void entire transactions |
| `pos.manual_discounts` | Apply ad-hoc manual discounts |
| `pos.discount_override` | Allow manual discounts on items with special pricing |
| `pos.end_of_day` | Run end-of-day cash reconciliation |
| `pos.jobs.view` | View job cards in POS |
| `pos.jobs.manage` | Start work, complete jobs, manage job flow |
| `pos.jobs.flag_issue` | Flag issues on a job (damage, customer complaint) |
| `pos.jobs.cancel` | Cancel an active job |

##### Customer Permissions (`customers.*`)

| Permission | What It Controls |
|------------|-----------------|
| `customers.view` | View customer list and profiles |
| `customers.create` | Create new customer records |
| `customers.edit` | Edit customer details (name, phone, email, notes) |
| `customers.delete` | Delete customer records |
| `customers.view_history` | View a customer's transaction and service history |
| `customers.view_loyalty` | View loyalty point balance |
| `customers.adjust_loyalty` | Manually add/subtract loyalty points |
| `customers.export` | Export customer data to CSV |

##### Appointment Permissions (`appointments.*`)

| Permission | What It Controls |
|------------|-----------------|
| `appointments.view_today` | View today's appointment list |
| `appointments.view_calendar` | View the full appointment calendar |
| `appointments.create` | Create new appointments |
| `appointments.reschedule` | Reschedule existing appointments |
| `appointments.cancel` | Cancel appointments |
| `appointments.waive_fee` | Waive cancellation fees |
| `appointments.update_status` | Change appointment status (confirm, start, complete) |
| `appointments.add_notes` | Add notes to appointments |
| `appointments.manage_schedule` | Manage staff schedules and blocked dates |

##### Product & Service Permissions

| Permission | What It Controls |
|------------|-----------------|
| `products.view` | View product catalog |
| `products.edit` | Edit product details, pricing, images |
| `products.delete` | Delete products |
| `services.view` | View service catalog |
| `services.edit` | Edit service details, descriptions |
| `services.delete` | Delete services |
| `services.manage_addons` | Manage add-on suggestions and prerequisites |
| `services.set_pricing` | Set/modify service pricing tiers |

##### Inventory Permissions (`inventory.*`)

| Permission | What It Controls |
|------------|-----------------|
| `inventory.view_stock` | View stock levels |
| `inventory.adjust_stock` | Manual stock adjustments |
| `inventory.manage_po` | Create and manage purchase orders |
| `inventory.receive` | Receive inventory against purchase orders |
| `inventory.view_costs` | View product cost data |
| `inventory.view_cost_data` | View detailed cost/margin data |
| `inventory.manage_vendors` | Create and manage vendor records |

##### Marketing Permissions (`marketing.*`)

| Permission | What It Controls |
|------------|-----------------|
| `marketing.campaigns` | Create and send marketing campaigns |
| `marketing.coupons` | Create and manage coupon codes |
| `marketing.analytics` | View marketing analytics and reports |
| `marketing.lifecycle_rules` | Configure automated lifecycle rules (follow-ups, win-backs) |
| `marketing.two_way_sms` | Access the two-way SMS messaging inbox |

##### Quote Permissions (`quotes.*`)

| Permission | What It Controls |
|------------|-----------------|
| `quotes.create` | Create new quotes (via POS builder) |
| `quotes.send` | Send quotes to customers via SMS/email |
| `quotes.convert` | Convert accepted quotes into jobs |

##### Photo Permissions (`photos.*`)

| Permission | What It Controls |
|------------|-----------------|
| `photos.upload` | Upload job photos |
| `photos.view` | View job photos |
| `photos.delete` | Delete job photos |
| `photos.approve_marketing` | Approve photos for marketing use |
| `admin.photos.view` | View the admin photo gallery page |
| `admin.photos.manage` | Manage photo tags, featured status |

##### Report Permissions (`reports.*`)

| Permission | What It Controls |
|------------|-----------------|
| `reports.revenue` | View revenue reports and dashboard stats |
| `reports.financial_detail` | View detailed financial breakdowns |
| `reports.cost_margin` | View cost and margin analysis |
| `reports.employee_tips` | View all employee tip totals |
| `reports.own_tips` | View own tip totals only |
| `reports.export` | Export reports to CSV |
| `reports.quickbooks_status` | View QuickBooks sync status |

##### Staff Permissions (`staff.*`)

| Permission | What It Controls |
|------------|-----------------|
| `staff.clock_self` | Clock in/out for own shifts |
| `staff.view_own_hours` | View own time records |
| `staff.view_all_hours` | View all employees' time records |
| `staff.edit_time` | Edit time records |

##### Settings Permissions (`settings.*`)

| Permission | What It Controls |
|------------|-----------------|
| `settings.feature_toggles` | Enable/disable platform features |
| `settings.tax_payment` | Configure tax rates and payment settings |
| `settings.manage_users` | Add/edit/deactivate staff accounts |
| `settings.roles_permissions` | Manage roles and permission assignments |
| `settings.business_hours` | Set business hours |
| `settings.audit_log` | View the system audit log |
| `settings.api_keys` | Manage API keys |
| `settings.backup_export` | Access data backup and export |

##### CMS Permissions (`cms.*`)

| Permission | What It Controls |
|------------|-----------------|
| `cms.hero.manage` | Manage the hero carousel slides |
| `cms.tickers.manage` | Manage announcement tickers |
| `cms.ads.manage` | Manage ad zones and creatives |
| `cms.themes.manage` | Manage site themes and seasonal presets |
| `cms.about.manage` | Manage about/team pages |
| `cms.catalog_display.manage` | Configure catalog display settings |
| `cms.seo.manage` | Manage SEO settings and city pages |
| `cms.pages.manage` | Create and edit CMS pages |

#### Permission Resolution

Permissions are resolved in this order:

1. **Super Admin** — Always returns `true` regardless of any permission settings
2. **User-level override** — A permission set directly on the individual employee takes highest priority
3. **Role-level default** — Falls back to the default for the employee's assigned role
4. **Deny** — If no matching permission is found at either level, access is denied

#### Default Permission Summary by Role

| Category | Super Admin | Admin | Cashier | Detailer |
|----------|:-----------:|:-----:|:-------:|:--------:|
| All POS operations | All | All except void & override pricing | Payments, tickets, coupons, loyalty, EOD | Job view, manage, flag issues only |
| Customer management | All | All except delete & export | View, create, view history & loyalty | View only |
| Appointments | All | All | View, create, reschedule, status, notes | View today, status, notes |
| Products & Services | All | All except delete | View only | View only |
| Inventory | All | All | View stock, receive | None |
| Marketing | All | All | None | None |
| Quotes | All | All | Create, send, convert | None |
| Photos | All | All | Upload, view | Upload, view |
| Reports | All | Revenue, own tips | Own tips only | Own tips only |
| Settings | All | Business hours only | None | None |
| CMS | All | All | None | None |

#### How to Assign Roles

1. Navigate to **Admin** → **Staff** in the left sidebar
2. Click a staff member's name to open their detail page
3. On the **Profile** tab, find the **Role** dropdown
4. Select the desired role from the list (includes both system roles and any custom roles)
5. Click **Save Changes**

#### How to Override Individual Permissions

1. Navigate to **Admin** → **Staff** → select staff member
2. Click the **Permissions** tab
3. Each permission shows the role default (granted or denied)
4. Click the toggle to set a **user-level override** (grant or deny) that takes priority over the role default
5. Click **Save Permissions**

---

### 1.4 First-Time Setup Checklist

When setting up a fresh installation, complete these steps in order:

#### Step 1: Business Profile

Navigate to **Admin** → **Settings** → **Business Profile** and fill in:

| Field | What to Enter | Example |
|-------|--------------|---------|
| **Business Name** | Your legal or DBA business name | Smart Details Auto Spa |
| **Business Phone** | Main contact number | (310) 555-1234 |
| **Business Email** | Contact email displayed on the website | info@smartdetails.com |
| **Website** | Your website URL | https://smartdetailsautospa.com |
| **Street Address** | Physical or mailing address | 123 Main St |
| **City / State / ZIP** | Location details | Torrance, CA 90501 |

Save the **Business Information** card, then configure:

- **Business Hours** — Toggle each day on/off, set open and close times
- **Booking & Quotes** — Set the default deposit amount ($) and quote validity (days)
- **SEO & Location** — Business description, lat/lng coordinates, service area name and radius, price range tier
- **Social Share Image** — Upload a 1200x630px OG image for social media link previews

#### Step 2: Staff Accounts

1. Navigate to **Admin** → **Staff** → click **Add Staff Member**
2. Fill in first name, last name, email, and phone
3. Assign a **role** (Super Admin, Admin, Cashier, or Detailer)
4. Set a **POS PIN** (4-digit code) if this person needs POS access
5. Set whether the staff member is **Bookable** (appears in online booking as an available detailer)
6. Save, then go to the **Schedule** tab to set their weekly availability (Mon-Sun, start/end times)
7. Optionally add **Blocked Dates** for upcoming days off

> The first Super Admin account is typically created during Supabase project setup. Additional staff are added through this admin interface.

#### Step 3: Service Catalog

1. Navigate to **Admin** → **Catalog** → **Categories** to review/create service categories (e.g., "Exterior Detailing", "Interior Detailing", "Ceramic Coatings")
2. Navigate to **Admin** → **Catalog** → **Services** → **New Service** for each service you offer
3. Set the pricing model (vehicle size tiers, flat rate, per-unit, etc.)
4. Configure add-on suggestions and prerequisites where appropriate

> Service category management (create, rename, merge, reorder) is done through the Admin UI, not SQL migrations.

#### Step 4: Product Catalog (if selling products)

1. Navigate to **Admin** → **Catalog** → **Products** → **New Product**
2. Add product name, description, SKU, pricing, images
3. Set stock quantities and reorder thresholds
4. Assign to a product category

#### Step 5: Feature Toggles

Navigate to **Admin** → **Settings** → **Feature Toggles** to enable or disable platform features:

| Feature | What It Does | Default |
|---------|-------------|---------|
| Online Booking | Allows customers to book appointments on the website | Verify in the running application |
| Online Store | Enables the product store and checkout | Verify in the running application |
| Photo Gallery | Shows the public photo gallery at `/gallery` | Verify in the running application |
| Loyalty Program | Enables point earning and redemption | Verify in the running application |
| Two-Way SMS | Enables the messaging inbox for staff-customer conversations | Verify in the running application |
| Marketing Campaigns | Enables bulk SMS/email campaign sending | Verify in the running application |
| Lifecycle Automations | Enables automated follow-up and win-back messages | Verify in the running application |
| QuickBooks Sync | Enables automatic accounting sync to QBO | Verify in the running application |

> Toggle default states should be verified in the running application. Features can be safely toggled on/off at any time without data loss.

#### Step 6: Payment Integration (Stripe)

1. Set the `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variables
2. For POS card readers: navigate to **Admin** → **Settings** → **Card Reader** to register Stripe Terminal readers
3. Set the Stripe webhook endpoint URL and configure the `STRIPE_WEBHOOK_SECRET` env var
4. The webhook listens for `payment_intent.succeeded` and `payment_intent.failed` events

#### Step 7: SMS Setup (Twilio)

1. Set environment variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
2. Configure the Twilio webhook URL for inbound SMS (`TWILIO_WEBHOOK_URL`)
3. Navigate to **Admin** → **Settings** → **Messaging** to configure:
   - AI auto-reply toggle and personality settings
   - After-hours message template
   - Auto-reply cooldown period

#### Step 8: Email Setup (Mailgun)

1. Set environment variables: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`
2. Set `MAILGUN_WEBHOOK_SIGNING_KEY` for delivery tracking webhooks
3. Emails are used for: order confirmations, quote delivery, password resets, campaign sends, and receipt delivery

#### Step 9: Tax Configuration

Navigate to **Admin** → **Settings** → **Tax Configuration** to set:
- Tax rate percentage
- Whether tax applies to products only, services only, or both

#### Step 10: POS Configuration

1. **POS Favorites** — **Admin** → **Settings** → **POS Favorites**: Set up quick-action tiles for the POS Register tab
2. **POS Settings** — **Admin** → **Settings** → **POS Settings**: Configure idle timeout duration and other POS behavior
3. **Receipt Printer** — **Admin** → **Settings** → **Receipt Printer**: Upload receipt logo, set branding text, configure printer connection
4. **POS Security** — **Admin** → **Settings** → **POS Security**: Set IP whitelist if restricting POS access to specific networks

---


---

## 2. Dashboard

The admin dashboard is the landing page after logging into `/admin`. It provides an at-a-glance summary of today's operations — appointments, customers, quotes, online orders, and stock alerts — so you can quickly assess the business state and jump to whatever needs attention.

Data loads on page mount from the Supabase database via client-side queries. Refreshing the page reloads all metrics.

---

### 2.1 Dashboard Layout

The dashboard is organized into these sections (top to bottom):

1. **Welcome header** — Greeting with the logged-in employee's first name and today's date
2. **Alert banners** — Conditional banners for items needing attention
3. **Appointment stats row** — Four metric cards for today's appointments
4. **Quotes & Customers row** — Four cards showing quote and customer counts (requires `reports.view` permission)
5. **Online Orders widget** — Today's orders, revenue, pending fulfillment (requires `reports.view` permission)
6. **Week at a Glance** — 7-day appointment grid (Mon–Sun)
7. **Today's Schedule + Quick Actions** — Two-column layout with the day's confirmed appointments on the left and shortcut buttons on the right

---

### 2.2 Alert Banners

Two conditional banners appear at the top of the dashboard when action is needed:

#### Needs Attention Banner

Appears when there are **pending** (unconfirmed) appointments scheduled for today.

- Shows the count of pending appointments (e.g., "3 appointments pending confirmation")
- Click **Review** to navigate to the Appointments page

#### Stock Alert Banner

Appears when any active product has stock issues:

- **Low stock** — Products where `quantity_on_hand` is at or below `reorder_threshold` but not zero
- **Out of stock** — Products where `quantity_on_hand` is exactly 0
- Click the banner to navigate to the Products page filtered to low-stock items

---

### 2.3 Appointment Metrics (Stats Row)

Four cards showing today's appointment data. These are calculated from direct Supabase queries on the `appointments` table, filtered to today's date (`scheduled_date = today`) and excluding cancelled appointments.

| Card | Metric | How It's Calculated |
|------|--------|-------------------|
| **Today's Appointments** | Total count | All non-cancelled appointments scheduled for today |
| **Remaining** | Pending + Confirmed + In Progress | Appointments not yet completed — represents the day's remaining workload |
| **In Progress** | Currently active jobs | Appointments with status `in_progress` |
| **Completed Today** | Finished jobs | Appointments with status `completed` |

> "Today" is determined by the browser's local date at the time the dashboard loads. All appointment filtering uses the `scheduled_date` field.

#### Appointment Statuses Explained

| Status | Meaning |
|--------|---------|
| `pending` | Booked but not yet confirmed by staff |
| `confirmed` | Confirmed and ready for the scheduled time |
| `in_progress` | Work has started on the vehicle |
| `completed` | Service finished |
| `cancelled` | Appointment was cancelled |
| `no_show` | Customer did not show up |

---

### 2.4 Quotes & Customers Row

This row appears only for users with the `reports.view` permission. It contains four clickable cards:

#### Open Quotes

- **Metric**: Sum of quotes with status `sent`, `viewed`, or `accepted` (excludes drafts from the "open" total)
- **Badge**: If any quotes have `accepted` status, a green badge shows the count (e.g., "3 accepted")
- **Click**: Navigates to **Admin** → **Quotes**
- **Data source**: Queries the `quotes` table filtered to `status IN (draft, sent, viewed, accepted)` and `deleted_at IS NULL` (soft-delete filter)

#### Drafts

- **Metric**: Count of quotes with status `draft`
- **Subtext**: Shows count of `sent` quotes alongside
- **Click**: Navigates to **Admin** → **Quotes** filtered to drafts (`?status=draft`)

#### Total Customers

- **Metric**: Total count of all records in the `customers` table
- **Click**: Navigates to **Admin** → **Customers**

#### New This Month

- **Metric**: Customers created since the 1st of the current month
- **Subtext**: Also shows how many were created this week (Mon–Sun)
- **Calculation**: Filters `customers.created_at >= first day of current month`. "This week" filters `customers.created_at >= Monday of current week`

---

### 2.5 Online Orders Widget

This widget appears only when there are orders to show (today's orders > 0 or pending fulfillment > 0 or recent orders exist) and the user has `reports.view` permission.

#### Metrics Row

| Metric | What It Shows | How It's Calculated |
|--------|--------------|-------------------|
| **Orders Today** | Number of orders placed today | All orders with `created_at >= start of today (PST)` |
| **Revenue Today** | Dollar total from paid orders today | Sum of `total` for orders today where `payment_status = 'paid'`. Amounts are stored in cents and divided by 100 for display. |
| **Pending Fulfillment** | Orders waiting to be shipped/picked up | Count of orders where `fulfillment_status = 'unfulfilled'` AND `payment_status = 'paid'` |

> "Today" for orders uses PST timezone conversion (`America/Los_Angeles`), consistent with the project's timezone rule.

#### Recent Orders List

Below the metrics, the 5 most recent orders are listed with:

- **Order number** (clickable, links to order detail page)
- **Customer name**
- **Total amount** (formatted as currency)
- **Fulfillment status badge** — Color-coded: `Unfulfilled` (warning/amber), `Shipped` (info/blue), `Delivered` (success/green), `Ready` (info/blue for ready-for-pickup)

Click **View All Orders** in the header to navigate to **Admin** → **Orders**.

---

### 2.6 Week at a Glance

A 7-day grid (Monday through Sunday) showing the appointment count for each day of the current week.

#### How It Works

- Queries the `appointments` table for `scheduled_date` between Monday and Sunday of the current week
- Excludes cancelled appointments
- Today's column is highlighted with a blue border and background

#### What Each Day Shows

- **Day label** — e.g., "Mon 3/2"
- **Appointment count** — Large bold number (grayed out if zero)
- **Up to 3 appointment previews** — Each shows a color dot (status indicator), the scheduled start time, and the customer's first name
- **Overflow indicator** — If more than 3 appointments, shows "+N more"

#### Status Color Dots

| Color | Status |
|-------|--------|
| Green | Completed |
| Amber | In progress |
| Blue | Confirmed |
| Gray | Pending or other |

Click **View Calendar** to navigate to the full Appointments page.

---

### 2.7 Today's Schedule

A detailed list of today's confirmed and in-progress appointments (not pending, completed, no-show, or cancelled). This represents the active workload for the day.

#### What Each Appointment Card Shows

| Field | Description |
|-------|-------------|
| **Time range** | Scheduled start time – end time (formatted as 12-hour, e.g., "9:00 AM - 11:30 AM") |
| **Status badge** | Color-coded badge (Confirmed = blue, In Progress = amber) |
| **Customer name** | First and last name |
| **Services** | Comma-separated list of booked services |
| **Vehicle** | Year, make, model (if a vehicle is attached to the appointment) |
| **Detailer** | Assigned employee name, if assigned |

Click any appointment card to open the **Appointment Detail Dialog**, which shows full appointment information in a modal overlay.

If there are no confirmed or in-progress appointments for today, the section shows "No confirmed appointments for today" in a dashed border placeholder.

---

### 2.8 Quick Actions

A sidebar panel (right column on desktop, stacked below on mobile) with shortcut buttons:

| Action | Navigates To | Description |
|--------|-------------|-------------|
| **Appointments** | `/admin/appointments` | Manage the appointment calendar |
| **Customers** | `/admin/customers` | View and manage customers |
| **Catalog** | `/admin/catalog` | Products and services |
| **Settings** | `/admin/settings` | System configuration |

These quick actions are the same for all admin users regardless of role.

---

### 2.9 Data Freshness

All dashboard data is fetched from Supabase when the page loads (component mount). The dashboard does not auto-refresh or poll for updates.

**To see updated data:** Refresh the browser page or navigate away and back to `/admin`.

> For real-time needs (e.g., monitoring appointments during a busy day), keep the Appointments page open instead — it provides more detailed views and can be manually refreshed.

---


---

## 3. Job Management

Jobs are the core operational unit in Smart Details Auto Spa. A job represents a single vehicle service session — from the moment work begins on a vehicle through completion, including all documentation, add-on authorizations, and customer notifications.

This chapter covers the full job lifecycle, how to manage jobs from both the Admin dashboard and the POS, photo documentation, the add-on authorization flow, and how jobs connect to appointments.

---

### 3.1 What Is a Job?

A job is created when a vehicle is checked in for service. Every job tracks:

- **Customer** and **vehicle** being serviced
- **Services** performed (original booking + any add-ons)
- **Assigned detailer** performing the work
- **Photos** documenting before, during, and after states
- **Timer** tracking active work duration
- **Status** representing where the job is in its lifecycle
- **Financial totals** — service subtotal, add-on costs, discounts, tax, and final total

Jobs can originate from:

1. **Online bookings** — Customer books through the website; appointment is confirmed; job is created at check-in
2. **Walk-ins** — Staff creates the job directly in the POS when a customer arrives without a booking
3. **Quote conversions** — An accepted quote is converted into a job through the POS

---

### 3.2 Job Statuses

Every job has a status that reflects its current stage. The status drives what actions are available and what the POS interface displays.

| Status | Meaning | Who Sets It |
|--------|---------|-------------|
| `scheduled` | Job created, waiting for vehicle arrival | System (on creation) |
| `intake` | Vehicle has arrived; intake documentation in progress | Detailer (starts intake) |
| `in_progress` | Active work underway; timer is running | Detailer (starts work after intake) |
| `pending_approval` | Work complete; awaiting customer approval (reserved for future use) | — |
| `completed` | All work finished; customer notified | Detailer (completes job) |
| `closed` | Job fully settled and archived | System or admin |
| `cancelled` | Job was cancelled before completion | Staff (cancels job) |

#### Terminal Statuses

Jobs in **completed**, **closed**, or **cancelled** status are considered terminal. Terminal jobs:

- Cannot be edited (customer, vehicle, services are locked)
- Cannot have their status changed
- Still appear in history and reports

---

### 3.3 Job Lifecycle

A typical job flows through these stages:

```
scheduled → intake → in_progress → completed → closed
```

#### Step 1: Job Creation

Jobs are created in the POS via one of these paths:

- **From an appointment** — When a customer with a confirmed booking arrives, staff creates a job linked to that appointment
- **Walk-in** — Staff creates a new job directly, selecting the customer, vehicle, and services
- **From a quote** — An accepted quote is converted to a job, carrying over services and pricing

On creation, the system automatically assigns an available detailer if one is not specified. The job starts in **scheduled** status.

#### Step 2: Intake

When the vehicle arrives, the detailer begins the intake process:

1. Photographs the vehicle's current condition (intake photos)
2. Documents any existing damage or notable conditions
3. Records intake notes

The intake phase uses the zone-based photo system (see [Section 3.6](#36-photo-documentation)) to ensure comprehensive documentation. Once all intake photos are captured and notes recorded, the intake is marked complete (`intake_completed_at` is set).

#### Step 3: Start Work

After intake is complete, the detailer starts work:

- Status changes from `intake` to `in_progress`
- The work timer begins (`work_started_at` is recorded)
- The job appears as "In Progress" across all interfaces

> Intake must be completed before work can start. The system enforces this — attempting to start work without completing intake will be rejected.

#### Step 4: Work in Progress

While work is underway:

- The timer tracks elapsed time
- Progress photos can be captured
- **Add-on services** can be proposed if additional work is discovered (see [Section 3.7](#37-add-on-authorization))
- The detailer can pause and resume the timer as needed

#### Step 5: Completion

When all services are finished, the detailer completes the job:

1. Completion photos are captured (documenting the finished state)
2. Pickup notes are optionally added (e.g., "Keys are in the cupholder")
3. The detailer marks the job complete

On completion, the system automatically:

- Stops the work timer and records final `timer_seconds`
- Generates a **gallery token** — a unique link the customer can use to view their before/after photos
- Selects **featured photos** — automatically picks the first exterior and interior before/after pairs
- Sends a **completion SMS** to the customer with a short link to their photo gallery
- Sends a **completion email** with inline before/after photo pairs

#### Step 6: Closing

After completion, the job may be closed once all financial matters are settled (payment processed, any refunds handled). Closing is the final state.

#### Cancellation

Jobs can be cancelled at various stages with different permission requirements:

| Job Status | Who Can Cancel | Permission Required |
|------------|---------------|-------------------|
| `scheduled` or `intake` | Any staff with cancel permission | `pos.jobs.cancel` |
| `in_progress` or `pending_approval` | Admin-level roles only | Admin role required |

When a job is cancelled:

- If linked to an appointment, the appointment is also cancelled
- Optionally sends cancellation notification (SMS, email, or both) to the customer
- The cancellation reason and timestamp are recorded

---

### 3.4 Managing Jobs in Admin

The admin interface provides a read-only view of all jobs with powerful filtering and search capabilities.

#### Jobs List Page

Navigate to **Admin** → **Jobs** to see all jobs.

##### Columns

| Column | What It Shows |
|--------|--------------|
| **Date** | Scheduled or creation date |
| **Customer** | Customer name (linked to customer profile) |
| **Vehicle** | Year, make, model |
| **Services** | Comma-separated service names |
| **Add-ons** | Count of approved add-on services |
| **Photos** | Total photo count for the job |
| **Duration** | Work timer duration (formatted as hours:minutes) |
| **Staff** | Assigned detailer name |
| **Status** | Color-coded status badge |

##### Filters

| Filter | Options |
|--------|---------|
| **Search** | Customer name or phone number |
| **Status** | Scheduled, Intake, In Progress, Completed, Closed, Cancelled |
| **Staff** | Filter by assigned detailer |
| **Date range** | Start date and end date |

##### Sorting

Click column headers to sort by:

- Date (default, newest first)
- Duration
- Status

Results are paginated at 20 items per page.

#### Job Detail Page

Click any job in the list to view its full detail. The detail page has two tabs: **Overview** and **Photos**.

##### Overview Tab

The overview tab is organized into a main content area and a sidebar:

**Main Content:**

| Section | What It Contains |
|---------|-----------------|
| **Job Summary** | Customer name, vehicle, assigned staff, and work duration |
| **Timeline** | Chronological list of key events — created, intake started, intake completed, work started, completed, pickup/closed, or cancelled |
| **Original Services** | Services from the original booking with individual prices and a subtotal |
| **Add-ons** | Any add-on services with their status (Approved, Declined, Pending, Expired) and pricing |
| **Pickup Notes** | Notes left by the detailer for vehicle pickup |
| **Cancellation** | If cancelled — reason, timestamp, who cancelled it |

**Sidebar:**

| Card | What It Shows |
|------|--------------|
| **Totals** | Subtotal, add-on total, discount, tax, and grand total |
| **Quick Stats** | Photo count, work duration, number of services, number of add-ons |
| **Intake Notes** | Notes recorded during vehicle intake |

##### Photos Tab

The photos tab displays all job photos organized by phase:

- **Intake** — Before photos taken during vehicle check-in
- **Progress** — Photos taken during the work process
- **Completion** — After photos taken when work is finished

Photos are grouped by zone (e.g., "Exterior — Front", "Interior — Dashboard"). Where both intake and completion photos exist for the same zone, a **before/after slider** is displayed for easy comparison.

Each photo shows:

- The photo itself (clickable to open in a lightbox)
- Zone label
- Phase label
- A **featured star** toggle — marks the photo pair for use in the public gallery and marketing

---

### 3.5 Managing Jobs in POS

The POS is where detailers and staff actively manage jobs throughout the day. The POS Jobs tab provides a focused view of today's work.

#### Today's Jobs View

The POS shows jobs filtered to today (PST timezone) with three filter options:

| Filter | Shows |
|--------|-------|
| **My Jobs** | Jobs assigned to the logged-in staff member |
| **All** | All jobs for today |
| **Unassigned** | Jobs with no assigned detailer |

Each job card shows the customer name, vehicle, services, status badge, and assigned detailer.

#### Creating a Walk-In Job

To create a job for a walk-in customer:

1. Tap **New Job** in the POS Jobs tab
2. Select or create the customer
3. Select or add a vehicle
4. Choose services
5. Add intake notes if needed
6. Tap **Create Job**

The system automatically assigns an available detailer based on current workload and schedule. The job is created in **scheduled** status.

> Creating a job requires the `pos.jobs.manage` permission.

#### Job Workflow in POS

From the POS job detail view, staff can:

| Action | When Available | What Happens |
|--------|---------------|-------------|
| **Start Intake** | Job is in `scheduled` status | Opens the intake photo capture interface |
| **Complete Intake** | Intake photos are captured | Records `intake_completed_at` |
| **Start Work** | Intake is complete | Transitions to `in_progress`, starts timer |
| **Capture Photos** | Job is `in_progress` | Opens photo capture for progress/completion |
| **Propose Add-on** | Job is `in_progress` | Creates an add-on authorization request |
| **Complete Job** | Job is `in_progress` | Stops timer, sends notifications, generates gallery link |
| **Cancel Job** | Job is not terminal | Cancels the job (permission-dependent) |

#### Editing Job Details

While a job is in a non-terminal status, staff with `pos.jobs.manage` permission can edit:

- **Customer** — Reassign the job to a different customer
- **Vehicle** — Change the associated vehicle
- **Services** — Modify the service list
- **Intake notes** — Update intake documentation

Workflow fields (status, assigned staff, timer values, pickup notes) can be updated by any staff member working on the job.

---

### 3.6 Photo Documentation

Photos are a critical part of every job. They serve three purposes:

1. **Liability protection** — Intake photos document pre-existing conditions
2. **Quality proof** — Before/after pairs demonstrate the work performed
3. **Marketing** — Featured photos feed the public gallery and social media

#### Photo Zones

Every photo is tagged with a **zone** indicating which part of the vehicle it documents:

##### Exterior Zones (8)

| Zone | Label |
|------|-------|
| `exterior_front` | Front |
| `exterior_rear` | Rear |
| `exterior_driver_side` | Driver Side |
| `exterior_passenger_side` | Passenger Side |
| `exterior_hood` | Hood |
| `exterior_roof` | Roof |
| `exterior_trunk` | Trunk |
| `exterior_wheels` | Wheels |

##### Interior Zones (7)

| Zone | Label |
|------|-------|
| `interior_dashboard` | Dashboard |
| `interior_console` | Console |
| `interior_seats_front` | Front Seats |
| `interior_seats_rear` | Rear Seats |
| `interior_carpet` | Carpet |
| `interior_door_panels` | Door Panels |
| `interior_trunk_cargo` | Trunk / Cargo |

#### Photo Phases

Each photo belongs to one of three phases:

| Phase | When Captured | Purpose |
|-------|--------------|---------|
| **Intake** | During vehicle check-in | Document pre-existing condition ("before") |
| **Progress** | During active work | Document work in progress |
| **Completion** | After work is finished | Document final result ("after") |

#### Before/After Pairing

The system automatically pairs intake and completion photos by zone. If a job has an intake photo for `exterior_front` and a completion photo for `exterior_front`, they form a before/after pair. These pairs are used in:

- The job detail photos tab (admin)
- The customer photo gallery
- The completion email sent to the customer
- The public photo gallery (when featured)

#### Featured Photos

Photos can be marked as "featured" to appear in the public gallery. Featured status is set at the **pair level** — both the intake and completion photos for a zone must exist before the pair can be featured.

Featured photos are managed from:

- **Admin** → **Jobs** → job detail → **Photos** tab (per-job starring)
- **Admin** → **Photos** (bulk management across all jobs)

---

### 3.7 Add-On Authorization

When a detailer discovers additional work needed during a job (e.g., a stain requiring special treatment, a scratch that could be polished out), they can propose an **add-on service** to the customer for approval.

#### How It Works

1. **Detailer proposes add-on** — From the POS job detail, the detailer:
   - Selects the add-on service or product
   - Describes the issue found
   - Optionally attaches inspection photos with annotations
   - Sets the price

2. **System sends authorization request** — The system sends both:
   - **SMS** with a link to the authorization page
   - **Email** with details and a link

3. **Customer reviews and decides** — The customer visits the authorization page (`/authorize/[token]`) which shows:
   - A conversational message explaining what was found
   - Inspection photos with annotations (if provided)
   - The proposed service and pricing
   - The updated ticket total
   - **Approve** and **Decline** buttons

4. **Authorization expires** — If the customer doesn't respond within the configured timeout (default: 30 minutes), the add-on automatically expires

#### Authorization Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Awaiting customer response |
| `approved` | Customer approved the add-on; service will be performed |
| `declined` | Customer declined the add-on |
| `expired` | Customer did not respond before the timeout |

#### Issue Types

Add-on proposals include an issue type to help the customer understand the context:

- Stain or spot requiring treatment
- Scratch or swirl that could be addressed
- Odor requiring special treatment
- Damage found during inspection
- Other / general recommendation

> The authorization page is designed to be customer-friendly — it uses conversational language rather than technical terminology, and clearly shows what the customer is approving.

---

### 3.8 Customer Photo Gallery

When a job is completed, the system generates a **gallery token** — a unique URL that the customer can use to view their service photos.

#### How Customers Access It

- **Via SMS** — The completion text includes a short link
- **Via email** — The completion email includes a "View Your Photos" link
- **Via the customer portal** — Photos appear in the customer's service history

#### What the Gallery Shows

The customer gallery page (`/jobs/[token]/photos`) displays:

- **Vehicle information** — Year, make, model
- **Completion date**
- **Services performed** — Including any approved add-ons
- **Photos by zone** — Grouped by vehicle zone with before/after sliders where both phases exist

> The customer gallery only shows non-internal photos. Photos marked as internal are excluded. The page uses `noindex`/`nofollow` meta tags to prevent search engine indexing.

---

### 3.9 Vehicle Categories & Pricing

Jobs involve vehicles, and vehicle type affects service pricing. The system supports five vehicle categories:

| Category | Examples | Pricing Model |
|----------|---------|--------------|
| **Automobile** | Cars, trucks, SUVs | Based on size class (sedan, truck/SUV 2-row, SUV 3-row/van) |
| **Motorcycle** | Cruisers, touring bikes | Specialty tier (standard cruiser, touring bagger) |
| **RV** | Motorhomes, campers | Specialty tier (based on length) |
| **Boat** | Speedboats, yachts | Specialty tier (based on length) |
| **Aircraft** | Small planes, jets | Specialty tier (based on class) |

#### How Vehicle Type Affects Jobs

When a job is created, the vehicle's category and size/tier determine which pricing tier applies to each service. For automobiles, the `vehicle_type` and `size_class` fields drive pricing. For specialty categories (motorcycle, RV, boat, aircraft), the `specialty_tier` field maps to service pricing tiers.

> Vehicle category constants are defined in `src/lib/utils/vehicle-categories.ts`. See [Chapter 6: Services & Pricing](./06-services-pricing.md) for details on how pricing tiers work.

---

### 3.10 Jobs and Appointments

Jobs and appointments are closely linked but serve different purposes:

| Concept | Purpose | Created By |
|---------|---------|-----------|
| **Appointment** | Scheduled time slot for a customer | Online booking or admin |
| **Job** | Active work record for a vehicle | POS at check-in |

#### How They Connect

- An appointment exists before the customer arrives (scheduling)
- A job is created when the customer checks in (execution)
- The job is linked to the appointment via `appointment_id`
- If a job is cancelled, the linked appointment is also cancelled

#### Walk-In Jobs

Walk-in jobs have no linked appointment. They are created directly in the POS without a prior booking.

---

### 3.11 Permissions Reference

| Permission | What It Controls |
|------------|-----------------|
| `pos.jobs.view` | View job cards in POS |
| `pos.jobs.manage` | Create jobs, start work, complete jobs, edit job details |
| `pos.jobs.flag_issue` | Flag issues on a job (damage, customer complaint) |
| `pos.jobs.cancel` | Cancel jobs in `scheduled` or `intake` status |
| `admin.photos.view` | View the admin photos page |
| `admin.photos.manage` | Manage photo tags and featured status |

> Cancelling a job that is already `in_progress` or `pending_approval` requires an admin-level role, regardless of individual permissions.

---


---

## 4. Point of Sale (POS)

The POS is the daily operations hub. Staff use it to ring up services, process payments, manage jobs, create quotes, and reconcile the cash drawer. It is optimized for iPad in landscape orientation and runs as a Progressive Web App (PWA) in fullscreen mode.

---

### 4.1 POS Overview

#### What the POS Handles

- Building and pricing service/product tickets
- Processing card, cash, check, and split payments via Stripe Terminal
- Looking up and creating customer records
- Managing vehicles and vehicle-size-based pricing
- Holding and resuming in-progress tickets
- Creating, sending, and converting quotes
- Tracking active jobs through their lifecycle (intake, work, completion)
- Capturing before/after photos by vehicle zone
- Flagging on-the-job issues with customer authorization
- Applying coupons, loyalty redemptions, and manual discounts
- Printing, emailing, or texting receipts
- Processing refunds (partial or full)
- Running end-of-day cash reconciliation

#### Accessing the POS

Navigate to `/pos` on any device. The POS is designed for iPad but works on desktop browsers as well.

#### PWA Setup on iPad

For the best experience, add the POS to the iPad home screen:

1. Open Safari and navigate to your site's `/pos` URL
2. Tap the **Share** button (square with up-arrow)
3. Scroll down and tap **Add to Home Screen**
4. Name it (e.g., "POS") and tap **Add**

The POS will now launch in fullscreen mode without Safari's address bar. The viewport is locked to prevent zoom, and the status bar is set to black for a native-app feel.

> If you use a pfSense firewall, a DNS exception is required for the Stripe Terminal card reader to work in PWA mode. Add `private-domain: "stripe-terminal-local-reader.net"` in Unbound custom options. Without this, iPad Safari PWA cannot resolve Stripe's local reader DNS. Desktop browsers bypass this via DNS-over-HTTPS.

#### PIN Login

1. Open the POS (on the home screen icon or at `/pos`)
2. The PIN screen appears with 4 dot indicators
3. Enter your **4-digit PIN** on the keypad
4. The PIN auto-submits after the 4th digit — no "Submit" button needed
5. On success, the workspace loads with your name and role in the header

If the PIN is wrong, the dots shake and clear. Re-enter the correct PIN.

> PINs are set by an admin in **Admin > Staff > [name] > Profile tab > POS PIN Code**. A staff member without a PIN cannot access the POS. PIN presence = POS access.

---

### 4.2 POS Layout

The POS screen is divided into four regions:

#### Header Bar (Top)

From left to right:

| Element | What It Shows |
|---------|--------------|
| **Scanner icon** | Barcode scanner integration indicator |
| **Card reader status** | Green Wifi icon = connected, red WifiOff = disconnected, spinning loader = connecting. Tap to reconnect. Shows the reader name or "No Reader". |
| **Business name + "POS"** | Centered brand label |
| **Offline queue badge** | Amber pill with count of pending offline transactions (hidden when 0) |
| **Role badge** | Small pill showing your role (e.g., "Cashier", "Admin") |
| **Staff name** | Your first name |
| **Logout button** | LogOut icon — ends the session and returns to the PIN screen |

#### Catalog Panel (Left Side)

The left side of the screen shows the product and service catalog. Its content depends on the active tab:

- **Register** — Favorites grid + numeric keypad for custom amounts
- **Products** — Full product catalog with category browsing and search
- **Services** — Full service catalog with category browsing and search
- **Promotions** — Available coupons and promotions for the selected customer

#### Ticket Panel (Right Side, 380px Fixed Width)

The right side always shows the current ticket:

- Customer and vehicle summary (top)
- Line items with prices and quantities (scrollable middle)
- Coupon, loyalty, and discount controls
- Subtotal, tax, discounts, and total
- Clear, Hold, and Checkout buttons (bottom)

#### Bottom Navigation (Fixed Bottom)

Five tabs across the bottom of the screen:

| Tab | Icon | Destination |
|-----|------|-------------|
| **Transactions** | Receipt | Transaction history and search |
| **Quotes** | FileText | Quote list, builder, and detail |
| **Sale** | ShoppingCart | Main register (catalog + ticket) |
| **Jobs** | ClipboardList | Active job queue and management |
| **More (...)** | Ellipsis | Theme toggle, cash drawer, EOD, keyboard shortcuts, dashboard link |

Tapping the **Sale** tab when you are already on it resets the Register tab and clears the search bar.

#### More Menu

The More button (...) opens a popover with:

- **Theme selector** — Light / Dark / System (3-way toggle)
- **Cash Drawer** — Shows status (green = open, red = closed). Links to End of Day page.
- **Refresh App** — Visible only in PWA standalone mode. Forces a page reload.
- **Fullscreen** — Visible only on desktop (non-PWA). Toggles fullscreen mode.
- **Keyboard Shortcuts** — Opens a shortcuts reference dialog
- **Go to Dashboard** — Links to `/admin`

---

### 4.3 Daily Workflow — Opening

1. **Log in with your PIN** at the PIN screen
2. **Check the card reader** — Look at the header. A green Wifi icon with the reader name means connected. If it shows "No Reader" or a red icon, tap it to reconnect.
3. **Open the cash drawer** — Navigate to **More > Cash Drawer** (or the End of Day page). Count your starting float by denomination and tap **Open Register**. The drawer status turns green.

> The cash drawer session is stored locally on the iPad. It syncs across tabs automatically, so opening the drawer on one tab updates the status on all tabs.

---

### 4.4 Register Tab — Building a Ticket

The Register tab is the default view when you open the POS. It has two columns: **Favorites** on the left and a **Keypad** on the right.

#### Favorites Grid

Up to 15 quick-action tiles arranged in a 3x5 grid. Each tile is color-coded and has an icon. Favorites are configured in **Admin > Settings > POS Favorites**. Tile types include:

| Type | What It Does |
|------|-------------|
| **Product** | Adds the product to the ticket immediately |
| **Service** | Adds the service (may open a pricing picker if multiple tiers exist) |
| **Custom Amount** | Scrolls to the keypad for entering a dollar amount |
| **Customer Lookup** | Opens the customer search dialog |
| **Surcharge** | Calculates a percentage of the current subtotal and adds it as a line item |

#### Browsing the Catalog

Switch to the **Products** or **Services** tab to browse the full catalog:

1. **Categories** — The default view shows large tiles for each category with the item count and a preview image. Tap a category to see its items.
2. **Back to categories** — Tap the back arrow labeled "All Categories" to return to the category view.
3. **Category pills** — A scrollable row of category filter buttons appears above the item grid. Tap "All" to show everything or tap a specific category.

#### Searching

The search bar at the top accepts text input or barcode scans:

- **Text search** — Type at least 2 characters. Products are searched by name, SKU, and barcode. Services are searched by name. Results appear after a 200ms debounce.
- **Barcode scanning** — Point the scanner at a product barcode. The POS detects the rapid input and automatically adds the matching product to the ticket.
- **Global search** — When on the Register tab, searching shows results from both products and services combined.
- **Clear** — Tap the X button to clear the search and return to category view.

#### Adding Services

Tap a service card to add it to the ticket. What happens next depends on the service's pricing model:

| Scenario | Behavior |
|----------|----------|
| **Flat price, no tiers** | Added immediately with a success toast |
| **Single tier, not vehicle-size-aware** | Added immediately |
| **Per-unit service** (e.g., Scratch Repair) | Pricing picker opens with quantity selector (1 to max units) |
| **Multiple tiers or vehicle-size-aware** | Pricing picker opens for tier selection |
| **Vehicle set + tiers match vehicle sizes** | Auto-selects the matching tier based on the vehicle's size class |
| **Vehicle set + specialty tier** | Auto-selects the tier matching the vehicle's specialty tier name |

When a vehicle is attached to the ticket, the system automatically resolves pricing based on the vehicle size. For specialty vehicles (motorcycle, RV, boat, aircraft), pricing resolves by the vehicle's specialty tier.

**Duplicate prevention** — Each non-per-unit service can only be added once per ticket. Tapping a service that is already on the ticket shows a warning toast. Already-added services display a green highlight with a checkmark badge in the catalog grid.

**Vehicle compatibility** — If a service has a vehicle compatibility restriction and the ticket's vehicle does not match, a warning dialog appears. You can choose "Add Anyway" to override.

#### Adding Products

Tap a product card to add it. Products are added immediately with a quantity of 1. To add multiple, tap the product detail dialog (shown for catalog-browser views) and adjust the quantity before adding.

Products show stock status on their cards. "Out of stock" appears in red when quantity is zero.

#### Using the Keypad for Custom Amounts

The right column of the Register tab (or the standalone Keypad tab) provides a numeric keypad:

1. Enter an amount using the digit buttons (stored in cents internally)
2. Optionally tap **+ Note** to add a description (max 100 characters)
3. Tap **Add to Ticket** to add the custom amount as a line item

The dollar display adapts its font size to the number of digits entered. Maximum amount is $99,999.99.

#### Editing Line Items

In the ticket panel, each line item shows:

- **Item name** with tier/size info and per-unit breakdown
- **Quantity** — Products and custom items have +/- stepper controls. Tap the count to type a quantity directly. Services are locked at 1 (per-unit services show unit controls).
- **Notes** — Tap the sticky note icon to add or edit a note on the item. Notes appear in italic gray below the item name.
- **Price** — Right-aligned total with tax breakdown.
- **Delete** — On desktop, a trash icon appears. On iPad, swipe left on the item to reveal a red delete zone. Swipe past the 100px threshold to remove the item. A 5-second undo toast appears after deletion.

#### Add-On Suggestions

When services on the ticket have configured add-on suggestions, a blue "Suggested Add-Ons" banner appears in the ticket panel. Each suggestion shows as a tappable chip with the add-on name and combo price (if set). Tapping a chip opens the service detail dialog for that add-on.

Add-on suggestions filter out services already on the ticket and are deduplicated if multiple parent services suggest the same add-on. The banner can be dismissed and reappears when new services are added.

Individual line items also show an expandable "N add-ons available" section with addon suggestions specific to that service, including combo pricing and savings calculations.

#### Applying Coupons

Below the line items in the ticket panel:

1. Tap **Add Coupon**
2. Enter the coupon code (auto-uppercased)
3. Tap **Apply** or press Enter
4. The system validates the code against the current cart items, customer, and subtotal
5. On success, a green badge shows the code and discount amount
6. Tap the X on the badge to remove the coupon

If a different coupon is already applied and you try to apply a new one, a confirmation dialog asks whether to replace it.

#### Promotions Tab

Switch to the **Promotions** tab (requires a customer to be selected) to see available promotions organized in three sections:

- **Exclusive (For You)** — Customer-specific offers (green accent)
- **Available** — Promotions the current cart qualifies for (blue accent)
- **Add to Unlock** — Promotions that require adding specific items to qualify (amber accent, shows what to add)

Each promotion card shows the code, discount amount, expiry badge, and an **Apply** or **Remove** button. Promotions refresh automatically when the customer or cart items change.

---

### 4.5 Customer Management in POS

#### Looking Up a Customer

Tap the dashed "Guest" area at the top of the ticket panel (or use a Customer Lookup favorite tile) to open the search dialog:

1. Type a name or phone number (minimum 2 characters, 300ms debounce)
2. If the input looks like a phone number (all digits), it searches the phone field
3. Otherwise, it searches first and last name
4. Results show: name, phone, visit count, and loyalty points balance
5. Tap a result to select that customer

Each result row also shows a **customer type badge** that cycles through: Unknown (gray) > Enthusiast (blue) > Professional (purple) > Unknown. Tap the badge to change the type.

#### Creating a New Customer

From the customer lookup dialog, tap **New Customer**:

1. Fill in **First Name**, **Last Name**, and **Mobile** (required)
2. Optionally add an **Email**
3. Select **Customer Type** — Enthusiast (blue) or Professional (purple)
4. The form runs a **duplicate check** as you type the phone number (after 10 digits) or email. If a match is found, a red warning appears and the Create button is disabled.
5. Tap **Create** to save

The newly created customer is automatically selected for the ticket.

#### Customer Type Prompt

If you proceed to checkout and the selected customer has no type set, a prompt appears:

- **Enthusiast** — "Personal vehicle owner who cares about their car"
- **Professional** — "Detailer, dealer, fleet manager, or other business customer"
- **Skip for now** — Proceeds without setting a type

#### Guest Checkout

Tap **Guest** in the customer lookup dialog to proceed without a customer. The ticket header shows "Guest — tap to add customer."

#### Vehicle Selection

After selecting a customer, a vehicle selector appears showing their vehicles on file:

- Each vehicle shows year, make, model, color, and size/category
- The currently selected vehicle is highlighted in blue with a checkmark
- Tap a vehicle to select it
- Tap **Add Vehicle** to create a new one

When a vehicle is selected, service prices automatically recalculate based on the vehicle's size class (for automobiles) or specialty tier (for motorcycles, RVs, boats, aircraft).

#### Creating a New Vehicle

Tap **Add Vehicle** from the vehicle selector:

1. Select a **Category** — Automobile (default), Motorcycle, RV, Boat, or Aircraft
2. **For automobiles:**
   - Year (dropdown 2015–2026, or "Other" for manual entry)
   - Make (searchable combobox)
   - Model
   - Color
   - Size Class — Sedan, Truck/SUV 2-Row, or SUV 3-Row/Van
3. **For specialty vehicles:**
   - Same year/make/model/color fields
   - Specialty Tier — Options specific to the vehicle category
4. Tap **Create** to save

All text fields auto-capitalize (title case). The form validates that year, make, model, color, and tier/size are filled in.

#### Customer & Vehicle Summary

Once a customer and vehicle are set, the ticket header shows:

- Customer name, phone, and type badge
- Vehicle label (year make model) with size or category in parentheses
- **X** button to clear the customer and vehicle
- Tap the vehicle row to change vehicles or the customer row to change customers

---

### 4.6 Checkout Flow

Tap **Checkout** at the bottom of the ticket panel. If a customer is selected but no vehicle is attached, an error toast appears and the vehicle selector opens. If the customer has no type set, the type prompt appears first.

#### Tip Screen

Before payment method selection, an optional tip screen may appear (depending on configuration) showing:

- The current total
- Preset tip percentage buttons
- A custom tip amount option
- "No Tip" to skip

#### Payment Method Selection

The checkout overlay opens with four payment method buttons:

| Method | Description | Availability |
|--------|-------------|-------------|
| **Cash** | Enter tendered amount, view change | Always available (including offline) |
| **Card** | Process via Stripe Terminal reader | Online only |
| **Check** | Record check number | Online only |
| **Split** | Part cash + part card | Online only |

When offline, only Cash is enabled. Card, Check, and Split show as disabled.

#### Cash Payment

1. Enter the tendered amount using quick buttons ($20, $50, $100, Exact) or type a custom amount
2. The change due calculates in real-time
3. Tap **Complete Payment** when the tendered amount meets or exceeds the total
4. **Online**: Transaction saves to the database immediately
5. **Offline**: Transaction queues to the device's local storage (IndexedDB) with an amber warning banner. It syncs automatically when connectivity returns.

#### Card Payment

1. The system creates a Stripe PaymentIntent (minimum $0.50)
2. The screen shows "Waiting for card..." — present the card to the reader (tap, insert, or swipe)
3. The screen updates to "Processing..." while Stripe confirms the payment
4. On success, the transaction saves with the card brand, last 4 digits, and any on-reader tip
5. On failure, an error message appears with a retry option

> If the customer adds a tip on the card reader, the system captures it automatically by comparing the authorized amount to the original total.

#### Check Payment

1. Optionally enter the check number
2. Tap **Complete Payment**
3. The check number is recorded in the transaction notes

#### Split Payment

1. Choose mode: **Enter Cash Amount** or **Enter Card Amount**
2. Enter the primary amount — the remainder auto-calculates for the other method
3. Quick presets: 50/50 split, $20, $50, $100
4. Confirm the split and proceed
5. The card portion processes through Stripe Terminal (same as Card Payment)
6. Both payment methods are recorded on the transaction

#### Payment Complete

After successful payment:

- A green checkmark and "Payment Complete" heading appear
- Receipt number (if synced) or "Offline" badge (if queued)
- Payment summary: tendered/change (cash), approved amount (card), or split breakdown
- Tip amount (if any)
- Receipt delivery options (see below)
- **New Ticket** button to clear and start fresh

---

### 4.7 Receipt Options

After checkout completes, four receipt delivery options appear:

| Option | Icon | What It Does |
|--------|------|-------------|
| **Print** | Copier | Opens a new browser window with the HTML receipt and triggers the print dialog |
| **Email** | Mail | Sends the receipt to the customer's email (or prompts for one) |
| **SMS** | MessageSquare | Texts a formatted receipt to the customer's phone (or prompts for one) |
| **Receipt** | Printer | Sends ESC/POS data to the configured Star network receipt printer |

If the customer has an email or phone on file, those are pre-filled. Otherwise, an input field appears to enter the address or number. After sending, the button shows a green checkmark to prevent duplicate sends.

> The thermal receipt printer requires configuration in **Admin > Settings > Receipt Printer** (printer IP address, receipt logo, branding text).

---

### 4.8 Held Tickets

#### Holding a Ticket

Tap **Hold** at the bottom of the ticket panel to pause the current ticket. The ticket is saved to a local held list with the customer name (or "Walk-in"), item count, total, and timestamp.

#### Viewing Held Tickets

Open held tickets from the bottom nav (or press Esc when the panel is open). The panel shows:

- **Ticket cards** with customer name, item count, total, and time held (e.g., "5m ago", "1h 20m ago")
- **Resume** button (blue) on each card
- **Remove** button (trash) on each card to discard

#### Resuming a Held Ticket

Tap **Resume** on a held ticket:

- If the current ticket is **empty**, the held ticket restores immediately
- If the current ticket **has items**, a confirmation dialog asks whether to hold the current ticket and resume the selected one

---

### 4.9 Loyalty Program

When the loyalty program feature flag is enabled and a customer is selected, an amber loyalty panel appears in the ticket:

- **Points balance** (e.g., "250 pts")
- **Dollar equivalent** shown in parentheses (e.g., "worth $2.50") if the balance meets the redemption minimum
- **Redeem button** — Tap to apply loyalty points as a discount. Tap again to cancel. The button changes to show the discount amount (e.g., "Redeeming -$2.50").
- **Earn preview** — Shows how many points this purchase will earn (e.g., "Will earn ~25 pts from this purchase"), visible when not redeeming

Points are calculated at 1 point per $1 of eligible spend (water products excluded). Redemption value is $0.05 per point. Minimum redemption is 100 points.

> Loyalty points earned are recorded automatically at checkout. If a refund is later issued, points are proportionally adjusted.

---

### 4.10 Jobs Tab

The Jobs tab manages today's service appointments and walk-in jobs through their lifecycle.

#### Job Queue

The default view shows today's jobs as a scrollable list of cards. Each card shows:

- Customer name and vehicle description
- Service names (truncated if many)
- **Source badge** — "Appt" (calendar icon) for booked appointments or "Walk-In" (footprints icon) for walk-ins
- **Status badge** — Color-coded (see below)
- Assigned staff name (if any)
- **Checkout** button on completed jobs that haven't been paid yet
- **Paid** checkmark on closed jobs

#### Job Statuses

| Status | Color | Meaning |
|--------|-------|---------|
| **Scheduled** | Gray | Job created, not yet started |
| **Intake** | Blue | Intake photos in progress |
| **In Progress** | Yellow | Work has started |
| **Pending Approval** | Orange | Waiting on customer authorization for an add-on |
| **Completed** | Green | Work finished, ready for checkout |
| **Closed** | Slate | Paid and complete |
| **Cancelled** | Red | Job was cancelled |

Jobs are sorted by priority: In Progress first, then Intake, Scheduled, Pending Approval, Completed, Closed, and Cancelled last.

#### Filtering Jobs

Three filter pills at the top of the queue:

- **My Jobs** — Jobs assigned to you (only shown if you are bookable for appointments)
- **All Jobs** — All of today's jobs
- **Unassigned** — Jobs with no assigned staff member

#### Creating Walk-In Jobs

Tap **New Walk-In** in the job queue header (requires `pos.jobs.manage` permission). This navigates to the quote builder in walk-in mode, where you can build a ticket and directly create a job instead of sending a quote.

#### Refreshing the Queue

Tap the refresh button to:

1. Sync any new appointments from the booking system into jobs (auto-populate)
2. Reload the job list

#### Job Detail View

Tap a job card to open the full detail view with these sections:

**Job Info** — Customer name and phone, vehicle details, services list, appointment source

**Action Buttons** — Depend on the current job status:

| Status | Available Actions |
|--------|-------------------|
| **Scheduled** | Start Intake Photos |
| **Intake** | Continue intake photos, transition to In Progress |
| **In Progress** | Pause/resume timer, start completion photos, flag issue |
| **Pending Approval** | Approve or decline the pending add-on |
| **Completed** | Checkout (loads job items into register) |

**Timeline** — Vertical timeline showing status transitions with timestamps

**Photos** — Tabbed view (Intake / Progress / Completion) showing photo grids organized by vehicle zone

**Timer** — Visible during In Progress status. Shows elapsed time in HH:MM:SS format with pause/resume toggle.

**Add-Ons** — Shows any pending, approved, or declined add-on requests with full details (price, discount, photos, customer message)

**Notes** — Editable textarea for internal notes

#### Job Photo Capture

Photo capture follows a zone-based workflow:

1. Tap **Intake Photos** (or **Start Completion** for completion photos)
2. The **Zone Picker** opens showing:
   - Progress bar for exterior and interior zone minimums
   - An interactive vehicle diagram with tappable zones
   - Zone list with photo count badges
3. Tap a zone to view existing photos or capture new ones
4. The **Camera** opens — take a photo using the iPad's rear camera
5. **Review** — Optionally add notes, mark as "Internal Only" (not visible to customer), or annotate
6. **Annotate** — Draw circles, arrows, or text labels on the photo to mark issues (stored as percentage coordinates for any screen size)
7. **Save** — Uploads the photo to storage
8. Repeat for each zone until minimums are met
9. Tap **Complete** when all required zones have photos

#### Flagging Issues (Add-On Authorization)

While working on a job, tap **Flag Issue** to start the 7-step add-on wizard:

1. **Issue Type** — Select from predefined types (scratches, dents, stains, etc.) or enter a custom description
2. **Zone** — Select where the issue was found on the vehicle
3. **Photo** — Capture a photo of the issue with optional annotation
4. **Catalog** — Browse services, products, or enter a custom item to address the issue
5. **Discount** — Optionally apply a discount to the recommended service
6. **Pickup Delay** — Set additional minutes needed to address the issue
7. **Message** — Choose from 3 message templates or write a custom message. Variables like issue type, vehicle info, service name, and price auto-fill.
8. **Preview** — Review the authorization card that the customer will see, then submit

The customer receives an SMS or email with an authorization link where they can approve or decline the add-on.

#### Job Checkout

When a job is complete and ready for payment:

1. Tap **Checkout** on the job card (in the queue) or detail view
2. The system fetches all job items and converts them to ticket line items
3. If the job's linked quote had a coupon, it auto-applies
4. You are navigated to the Sale tab with the ticket pre-filled
5. Proceed through the normal checkout flow

---

### 4.11 Quotes Tab

The Quotes tab manages price estimates that can be sent to customers and later converted to jobs.

#### Quote List

The default view shows a searchable, paginated list of quotes:

- **Status filter pills** — All, Draft, Sent, Viewed, Accepted (tap to filter)
- **Search bar** — Search by quote number or customer phone (300ms debounce)
- **Table columns** — Quote #, Date, Customer, Vehicle, Total, Status badge
- **Pagination** — 20 results per page with Previous/Next buttons
- **New Quote** button in the header

#### Creating a Quote

Tap **New Quote** to open the quote builder:

- **Left side** — Catalog browser with Services and Products tabs, search bar, and item grid (same catalog as the register)
- **Right side** — Quote ticket panel with customer selection, vehicle selection, item list, discounts, and totals

Build the quote by adding services and products from the catalog. Set the customer and vehicle for accurate pricing.

Quote-specific features:

- **Valid Until** — Auto-set based on the configured quote validity days (from **Admin > Settings > Business Profile > Booking & Quotes**)
- **Coupon** — Apply a coupon code for a pre-discount
- **Loyalty** — Toggle loyalty point redemption if the customer has a balance
- **Manual Discount** — Dollar or percentage discount (requires `pos.manual_discounts` permission)
- **Notes** — Add internal notes to the quote

Tap **Save Quote** to save as a draft. The system assigns a quote number and saves to the database.

#### Sending a Quote

From the quote detail view, tap **Send Quote**. A dialog appears with delivery options:

- **SMS** — Sends a link to the customer's phone
- **Email** — Sends a formatted quote to the customer's email
- **Both** — Sends via both channels

The quote status changes from Draft to Sent. Resending a non-draft quote keeps its current status but updates the "Last Contacted" timestamp.

#### Quote Detail View

Tap a quote from the list to see the full detail:

- Quote number, status badge, and last sent date
- Customer and vehicle summary
- Itemized table with quantities, unit prices, discounts, and totals
- Subtotal, tax, and total
- Notes (if any)
- **Communications history** — Log of when and how the quote was sent (email/SMS timestamps)

#### Available Actions on a Quote

| Action | When Available | What It Does |
|--------|---------------|-------------|
| **Send Quote** | Any status (draft, sent, viewed, accepted) | Sends or resends via SMS/email |
| **Edit Quote** | Draft or sent | Opens the quote builder with items pre-filled |
| **Create Job** | Accepted + `pos.jobs.manage` permission | Converts the quote into an active job |
| **Delete** | Draft only | Soft-deletes the quote |

#### Walk-In Mode

From the Jobs tab, tap **New Walk-In** to open the quote builder in walk-in mode. In this mode:

- The "Valid Until" field is hidden
- The "Send Quote" button is replaced with **Create Job**
- Saving creates the quote as "converted" status and immediately creates a job linked to it

---

### 4.12 Transactions Tab

#### Transaction List

The Transactions tab shows a searchable history of all POS transactions:

- **Date presets** — Today, Yesterday, This Week, This Month, This Year, All, Custom
- **Custom date range** — Appears when "Custom" is selected (start and end date inputs)
- **Search bar** — Search by receipt number or customer phone (400ms debounce)
- **Table columns** — Receipt # (monospace, blue, clickable), Date, Customer, Payment Method, Total (right-aligned), Status badge
- **Pagination** — 20 results per page with Previous/Next buttons

#### Transaction Detail

Tap a receipt number to view the full transaction:

- **Header** — Receipt number, date, status badge, and QuickBooks sync badge (if applicable)
- **Customer & Employee** — Two-column display showing who was served and by whom
- **Items table** — Item name (with tier/size info), quantity, unit price, total, and tax for each line item
- **Payments** — Payment method, card details (brand and last 4 for card payments), and tip amount
- **Totals** — Subtotal, tax, discount, loyalty discount, tip, and grand total
- **Loyalty info** — Points earned or redeemed (if any)
- **Notes** — If present
- **Refund history** — Detailed records of any refunds issued against this transaction
- **Send Receipt** — Email and SMS buttons to deliver the receipt after the fact

#### Transaction Statuses

| Status | Meaning |
|--------|---------|
| **Completed** | Normal successful transaction |
| **Partial Refund** | Some items have been refunded |
| **Refunded** | Fully refunded |
| **Voided** | Transaction voided (entire amount reversed) |

---

### 4.13 Refunds

#### Issuing a Refund

From a transaction detail view, tap **Issue Refund** (requires `pos.issue_refunds` permission):

**Step 1 — Select Items:**

1. Check the items to refund
2. Each item shows the maximum refundable quantity (subtracts already-refunded amounts)
3. Adjust the quantity if doing a partial refund on a line item
4. For products, toggle **Restock** to return the items to inventory
5. Enter a **Reason** for the refund (required)

**Step 2 — Confirm:**

1. Review the summary of selected items, quantities, and amounts
2. See the reason displayed
3. Tap **Confirm Refund** to process

#### What Happens During a Refund

- If the original payment was by card, a Stripe refund is issued automatically
- If restock is enabled for a product, inventory quantities are restored
- If the customer earned loyalty points on the original transaction, points are proportionally adjusted (deducted based on the refund-to-total ratio)
- The transaction status updates to "Partial Refund" or "Refunded"
- An audit log entry is recorded

#### Voiding a Transaction

Tap **Void Transaction** (requires `pos.void_transactions` permission) to reverse the entire transaction. A confirmation dialog appears before processing. Voiding sets the status to "voided."

---

### 4.14 End of Day

Navigate to **More > Cash Drawer** or the End of Day page from the bottom nav.

#### Opening the Register

If the drawer is closed:

1. Count your starting cash by denomination (bills: $100 through $1, coins: quarters through pennies)
2. Optionally check **Skip Change** to hide coin denomination rows
3. The total updates as you enter counts
4. Tap **Open Register**

The drawer session saves with the opening float, your name, and timestamp. The cash drawer status in the More menu turns green.

#### Day Summary

When the register is open, the top of the page shows today's summary in four metric cards:

| Card | What It Shows |
|------|--------------|
| **Total Revenue** | Total revenue for the day plus tip total |
| **Transactions** | Transaction count and total refund amount |
| **Cash** | Total cash collected (sales + tips) and cash transaction count |
| **Card** | Total card collected (sales + tips) and card transaction count |

#### Closing the Register

Below the day summary:

1. **Count Your Drawer** — Enter the cash in the drawer by denomination (same form as opening)
2. **Reconciliation** — The system calculates:
   - Opening Float + Cash Sales + Cash Tips - Cash Refunds = **Expected Cash**
   - Your counted cash vs. expected = **Variance** (green if zero, red otherwise)
3. **Close Out Form:**
   - **Next Day Float** — Cash to leave for tomorrow's opening (pre-filled from last session)
   - **Deposit Amount** — Auto-calculated as Counted Cash minus Next Day Float
   - **Notes** — Optional end-of-day notes
4. Tap **Close Register** (red button, requires `pos.end_of_day` permission)

#### After Closing

A success screen shows:

- Counted cash, expected cash, and variance
- **Open New Register** button to start the next day

The cash drawer status in the More menu turns red. A QuickBooks batch sync is triggered in the background to sync the day's transactions.

---

### 4.15 Offline Mode

#### What Happens When Internet Drops

An amber banner appears at the top of the screen: "You're offline — Cash transactions only. Data will sync when reconnected."

- **Cash payments** remain available. Transactions are queued to the device's local storage (IndexedDB).
- **Card, Check, and Split payments** are disabled (grayed out in the payment method screen).
- The **offline queue badge** in the header shows the count of pending transactions (e.g., "2 pending").

#### Automatic Sync

When connectivity returns:

1. A green banner appears: "Back online — syncing queued transactions..." (auto-hides after 3 seconds)
2. The system automatically syncs all queued transactions to the server
3. Success toast: "N offline transaction(s) synced"
4. If any fail: "N transaction(s) failed to sync — will retry"

The offline queue badge polls every 5 seconds and auto-syncs whenever it detects connectivity with pending items.

#### Limitations While Offline

- No card or split payments
- No customer lookup or creation (requires server)
- No coupon validation
- No loyalty point operations
- No receipt delivery (email, SMS, or printer)
- Transactions show as "offline" in the completion screen and skip receipt options until synced

---

### 4.16 Security & Timeouts

#### Idle Timeout

Configurable in **Admin > Settings > POS Settings**. After the configured period of inactivity (no taps, key presses, or scrolls):

1. A transparent overlay appears over the POS
2. The PIN screen displays on top
3. Enter your PIN to resume the session
4. The session stays alive — no data is lost and the ticket is preserved

You can also re-enter as a different staff member during the lock screen, which replaces the active session.

#### JWT Token Expiry

POS sessions expire after **12 hours** regardless of activity. When the token expires:

1. Any API call returns 401
2. The POS redirects to `/pos/login` with a "session expired" toast
3. A full new PIN login is required
4. The Stripe SDK also triggers a redirect if it encounters an auth error

#### HMAC API Authentication

All POS API requests include an `X-POS-Session` header with a custom HMAC-SHA256 token. The token contains the employee's ID, role, and name, signed with the Supabase service role key. This token is verified on every API call. The system uses timing-safe comparison to prevent timing attacks.

#### Permission-Based Access

Each POS action is gated by a specific permission key. If a staff member's role does not grant a permission, the button or feature is hidden or disabled. Key permission gates in the POS:

| Permission | What It Controls |
|------------|-----------------|
| `pos.create_tickets` | Creating new tickets |
| `pos.add_items` | Adding items to a ticket |
| `pos.apply_coupons` | Applying coupon codes |
| `pos.apply_loyalty` | Redeeming loyalty points |
| `pos.process_card` | Processing card payments |
| `pos.process_cash` | Processing cash payments |
| `pos.process_split` | Processing split payments |
| `pos.issue_refunds` | Issuing refunds |
| `pos.void_transactions` | Voiding transactions |
| `pos.manual_discounts` | Applying manual discounts |
| `pos.discount_override` | Discount override on special-priced items |
| `pos.end_of_day` | Running end-of-day reconciliation |
| `pos.jobs.view` | Viewing the jobs tab |
| `pos.jobs.manage` | Managing jobs (start, complete, create walk-ins) |
| `pos.jobs.flag_issue` | Flagging issues and creating add-on requests |
| `pos.jobs.cancel` | Cancelling jobs |

#### IP Whitelist

The POS can be restricted to specific IP addresses. Configure in **Admin > Settings > POS Security**:

1. **Enable the toggle** — When on, only whitelisted IPs can access `/pos/*`
2. **Add your IP** — The page shows your current public IP with a one-click "Add My IP" button
3. **Manage the list** — Add IP addresses with friendly location names (e.g., "Shop", "Home")

Changes take effect within 10 seconds (settings are cached in-memory). If the database is unavailable, the system falls back to the `ALLOWED_POS_IPS` environment variable.

---

### 4.17 Stripe Terminal Setup

#### Registering a Card Reader

1. Navigate to **Admin > Settings > Card Reader**
2. Follow the Stripe Terminal registration flow to add your reader
3. Once registered, the reader appears in the POS header with a green Wifi icon when connected

#### Reader Status Indicators

| Icon | Meaning |
|------|---------|
| Green Wifi + reader name | Connected and ready |
| Red WifiOff + "No Reader" | Not connected — tap to reconnect |
| Spinning loader | Attempting to connect |

#### Troubleshooting

- **Reader not connecting in PWA mode** — Ensure the pfSense DNS exception is configured (see Section 4.1)
- **"No Reader" after page refresh** — Tap the reader icon in the header to reconnect
- **Payment stuck on "Waiting for card..."** — Check that the reader is powered on and on the same network. Cancel and retry if needed.
- **Minimum payment amount** — Stripe requires a minimum of $0.50. Transactions below this amount cannot process via card.

---

### 4.18 Keyboard Shortcuts

Press **?** to view the shortcuts reference dialog. Available shortcuts:

| Key | Action |
|-----|--------|
| **F1** | Clear the current ticket |
| **F2** | Open checkout (if items are on the ticket) |
| **F3** | Navigate to Quotes tab |
| **Esc** | Close the current dialog or panel |
| **?** | Toggle the keyboard shortcuts dialog |

---


---

## 5. Customers

Customers are the central entity in Smart Details Auto Spa. Every appointment, job, transaction, quote, vehicle, and loyalty balance ties back to a customer record. This chapter covers the customer list, creating and editing customers, the detail page and its tabs, vehicle management, duplicate detection and merging, the customer portal, and customer types.

---

### 5.1 Customer Overview

Customer records live in the `customers` table and store:

- **Contact info** — First name, last name, mobile phone (required), email (optional)
- **Address** — Street address, city, state, ZIP
- **Birthday** — Month/day required when set; year optional (stored as `1900` sentinel when omitted)
- **Customer type** — Enthusiast or Professional (see [Section 5.8](#58-customer-types))
- **Tags** — Free-form text labels for segmentation (e.g., "VIP", "fleet", "referral")
- **Marketing consent** — Separate SMS and email opt-in/opt-out toggles
- **Metrics** — Visit count, lifetime spend, first visit date, last visit date, loyalty points balance
- **Notes** — Free-text internal notes visible to staff only

> Mobile phone number is the unique identifier for customers. The system prevents duplicate phone numbers across customer records and normalizes all phone numbers to a standard format.

---

### 5.2 Customer List

Navigate to **Admin** → **Customers** to view the full customer list.

#### Stats Row

Eight metric cards appear at the top of the page:

| Metric | What It Shows | How It's Calculated |
|--------|--------------|-------------------|
| **Total Customers** | Total count of all customers | Count of all rows in `customers` table |
| **New This Month** | Customers created since the 1st of the current month | `created_at >= first of current month` |
| **Repeat Customers** | Customers with 2+ visits | `visit_count >= 2` |
| **Repeat Rate** | Percentage of customers who are repeat | `(repeat count / total) × 100`, rounded |
| **Lifetime Revenue** | Sum of all customers' lifetime spend | Sum of `lifetime_spend` across all customers |
| **Avg per Customer** | Average lifetime spend per customer | `lifetime revenue / total customers` |
| **At Risk** | Customers whose last visit was 90+ days ago | `last_visit_date <= 90 days ago` |
| **Uncategorized** | Customers with no type set | `customer_type IS NULL` |

The **At Risk** and **Uncategorized** cards are clickable — clicking them toggles the corresponding filter on the customer list below.

#### Table Columns

| Column | What It Shows |
|--------|--------------|
| **Name** | First and last name (clickable link to detail page) |
| **Type** | Customer type badge — Enthusiast (green), Professional (blue), Unknown (gray). Clickable to cycle through types. |
| **Mobile** | Phone number (formatted) |
| **Email** | Email address |
| **Visits** | Total visit count |
| **Lifetime Spend** | Total amount spent (formatted as currency) |
| **Points** | Current loyalty points balance |
| **Last Visit** | Relative date of last visit (e.g., "3 days ago", "2 months ago"), or "Never" |

#### Search and Sort

- **Search** — Filter by name, phone number, or email. Matches partial strings.
- **Sort** — Name (alphabetical, default), Last Visit (most recent first), or Spend (highest first)

#### Filters

Four filter dropdowns let you narrow the list:

| Filter | Options |
|--------|---------|
| **Customer Type** | All Types, Enthusiast, Professional, No Type Set |
| **Visit Status** | All Visits, New (0 visits), Returning (1–5 visits), Loyal (6+ visits), Inactive (90+ days since last visit) |
| **Activity** | All Activity, Has Open Quotes, Has Upcoming Appointments |
| **Tags** | Multi-select tag filter with search. Uses AND logic — selecting "VIP" and "fleet" shows only customers with both tags. |

A **Reset filters** link appears when any filter is active.

#### Bulk Actions

Select multiple customers using the checkboxes, then use these bulk actions (requires `customers.edit` permission):

| Action | What It Does |
|--------|-------------|
| **Add Tag** | Opens a dialog to add a tag to all selected customers. Choose an existing tag or type a new one. |
| **Remove Tag** | Opens a dialog to remove a tag from all selected customers. |

#### Header Actions

| Button | Permission | What It Does |
|--------|-----------|-------------|
| **Review Duplicates** | `customers.merge` | Opens the duplicate detection page |
| **Add Customer** | `customers.create` | Opens the new customer form |

---

### 5.3 Creating a Customer

Navigate to **Admin** → **Customers** → **Add Customer** to create a new customer record.

#### Form Layout

The form is organized into three cards:

##### Card 1: Contact Information

| Field | Required | Notes |
|-------|----------|-------|
| **First Name** | Yes | |
| **Last Name** | Yes | |
| **Mobile** | Yes | Auto-formatted as `(310) 555-1234`. Real-time duplicate check warns if the phone already belongs to another customer. |
| **Email** | No | Real-time duplicate check and format validation. |
| **Address Line 1** | No | |
| **Address Line 2** | No | |
| **City** | No | |
| **State** | No | Dropdown of US states. Defaults to CA. |
| **Zip Code** | No | |

##### Card 2: Marketing Info

| Field | Notes |
|-------|-------|
| **Customer Type** | Required. Choose Enthusiast or Professional. |
| **Birthday** | Month and day dropdowns + optional year text field. If month is provided, day is required (and vice versa). Year must be between 1920 and the current year if provided. |
| **SMS Marketing** | Toggle. Auto-enables when a phone number is entered; auto-disables when phone is cleared. |
| **Email Marketing** | Toggle. Auto-enables when an email is entered; auto-disables when email is cleared. |

##### Card 3: Notes & Tags

| Field | Notes |
|-------|-------|
| **Notes** | Free-text internal notes |
| **Tags** | Comma-separated list of tags (e.g., "VIP, fleet, referral") |

#### Duplicate Prevention

The form performs real-time duplicate checking as you type:

- **Phone** — After entering 10+ digits, checks against existing customers. If a match is found, shows a warning: "Phone already belongs to [Name]"
- **Email** — After entering a valid email format, checks against existing customers. If a match is found, shows a warning: "Email already belongs to [Name]"

The **Create Customer** button is disabled when duplicate warnings or validation errors are present.

#### What Happens on Submit

1. Phone is normalized to standard format
2. Phone and email uniqueness are verified server-side
3. Customer record is created in the database
4. If SMS or email consent is granted, marketing consent log entries are recorded
5. An audit log entry is created
6. You are redirected to the new customer's detail page

---

### 5.4 Customer Detail Page

Click any customer name from the list (or navigate to **Admin** → **Customers** → **[customer]**) to open their detail page. The page shows the customer's name, type badge, and contact info in the header, with six tabs below.

#### Info Tab

The Info tab is the editable customer profile, organized identically to the create form with these additions:

**Customer Type & Journey Card** — Shows:

- **Customer Type** buttons (Unknown, Enthusiast, Professional) — click to change immediately
- **Customer Journey** metrics: Customer Since date, visit count, lifetime spend, last visit date

**Contact Information Card** — Same as create form, with real-time duplicate checking that excludes the current customer.

**Marketing Info Card** — Same as create form (birthday, SMS/email consent toggles).

**Notes & Tags Card** — Same as create form.

**Portal Access Card** — Manages the customer's portal login:

| Action | When Available | What It Does |
|--------|---------------|-------------|
| **Send Password Reset** | Customer has an email address | Sends a password reset email so the customer can set up or change their portal login |
| **Deactivate Portal Access** | Customer has an active portal account (`auth_user_id` is set) | Disables the customer's ability to log into the portal. Two-step confirmation required. |
| **Reactivate Portal Access** | Customer's portal was previously deactivated | Restores portal login ability |

**Delete Customer Card** — Permanently deletes the customer and all associated records. Requires `customers.delete` permission. Uses a two-step confirmation dialog.

When a customer is deleted, the following happens:

1. Vehicles are deleted
2. Loyalty ledger entries are deleted
3. Transactions are unlinked (preserved for accounting, `customer_id` set to null)
4. Marketing consent logs are deleted
5. Appointments are deleted
6. Quotes are deleted
7. The customer record is deleted
8. An audit log entry is created

**Save Changes** button at the bottom saves all edits on the Info tab.

#### Vehicles Tab

Lists all vehicles associated with the customer. See [Section 5.5](#55-vehicle-management) for details.

#### Loyalty Tab

Displays the customer's loyalty program activity:

- **Current balance** shown prominently at the top
- **Adjust Points** button (requires `customers.adjust_loyalty` permission) opens a dialog to manually add or subtract points with a description
- **Ledger table** showing all point transactions:

| Column | What It Shows |
|--------|--------------|
| **Date** | When the entry was created |
| **Action** | Badge — Earned (green), Redeemed (blue), Adjusted (amber), Expired (red), Welcome Bonus (green) |
| **Points** | Change amount, positive in green, negative in red |
| **Balance** | Running balance after this entry |
| **Description** | Text description (e.g., "Service completed", "Manual adjustment by Nayeem") |

#### History Tab

Shows the customer's transaction history:

| Column | What It Shows |
|--------|--------------|
| **Date** | Transaction date and time |
| **Receipt #** | Receipt number (clickable — opens receipt dialog with full receipt preview) |
| **Employee** | Staff member who processed the transaction |
| **Method** | Payment method (Cash, Card, etc.) |
| **Status** | Badge — Completed (green), Open (blue), Voided (red), Refunded (red), Partial Refund (amber) |
| **Total** | Transaction amount |

#### Quotes Tab

Shows all quotes associated with the customer (excluding soft-deleted quotes):

| Column | What It Shows |
|--------|--------------|
| **Quote #** | Quote number |
| **Date** | Creation date |
| **Status** | Badge — Draft, Sent, Viewed, Accepted, Expired, Converted |
| **Total** | Quote amount |

> Quotes are read-only in the admin. All quote creation and editing happens through the POS builder.

#### Service History Tab

Displays a chronological record of all services the customer has received, organized by job. Each entry shows:

- Job date
- Vehicle serviced
- Services performed
- Before/after photo pairs (where available)
- Job status

---

### 5.5 Vehicle Management

Each customer can have multiple vehicles. Vehicles are managed from the **Vehicles** tab on the customer detail page.

#### Vehicle Fields

| Field | Required | Notes |
|-------|----------|-------|
| **Category** | Yes | Automobile, Motorcycle, RV, Boat, or Aircraft |
| **Size Class** | For automobiles | Sedan, Truck/SUV (2-row), SUV 3-row/Van |
| **Specialty Tier** | For non-automobile categories | Category-specific tier dropdown (see below) |
| **Year** | No | Dropdown of recent years or "Other" for manual entry |
| **Make** | No | Auto-complete combobox with common vehicle makes |
| **Model** | No | Free text |
| **Color** | No | Free text |

#### Specialty Tiers by Category

| Category | Tier Options |
|----------|-------------|
| **Motorcycle** | Standard Cruiser, Touring Bagger |
| **RV** | Based on vehicle length (multiple tiers) |
| **Boat** | Based on vessel length (multiple tiers) |
| **Aircraft** | Based on aircraft class (multiple tiers) |

#### Vehicle Actions

| Action | What It Does |
|--------|-------------|
| **Add Vehicle** | Opens the vehicle form dialog in create mode |
| **Edit** (pencil icon) | Opens the vehicle form dialog pre-populated with existing data |
| **Delete** (trash icon) | Removes the vehicle after confirmation |

#### How Vehicles Connect to Pricing

A vehicle's category and size class (or specialty tier) determine which pricing tier applies when booking services. See [Chapter 6: Services & Pricing](./06-services-pricing.md) for the full pricing model.

#### Incomplete Vehicles

If a vehicle is saved without a make or model, it is flagged as `is_incomplete`. Incomplete vehicles still function normally but may display with limited information in job and appointment views.

---

### 5.6 Duplicate Detection & Merging

Over time, duplicate customer records can accumulate — the same person entered twice with slightly different information. The duplicate detection system finds and helps resolve these.

#### Accessing the Tool

Navigate to **Admin** → **Customers** → **Review Duplicates** (requires `customers.merge` permission).

#### How Duplicates Are Found

The system uses a Supabase database function (`find_duplicate_customers`) that identifies potential duplicates based on:

| Match Type | What It Checks | Confidence |
|-----------|---------------|-----------|
| **Phone** | Exact phone number match | High |
| **Email** | Exact email match (case-insensitive) | High |
| **Name + Phone** | Similar name and matching phone | High |
| **Name + Email** | Similar name and matching email | Medium |

Results are grouped into **duplicate groups**, each containing 2+ customer records that may be the same person.

#### The Duplicate Review Interface

Each duplicate group shows:

- **Confidence badge** — High (red) or Medium (amber)
- **Match reason badge** — Phone Match, Email Match, Name + Phone, Name + Email
- **Record count** — How many customer records are in the group
- **Side-by-side comparison** of all records in the group, showing:
  - Name
  - Phone
  - Email
  - Visit count
  - Lifetime spend
  - Creation date

#### Choosing Which Record to Keep

One record in each group is marked as **Keep** (the others will be merged into it). The system automatically pre-selects the best candidate based on a scoring algorithm that considers:

- Has a real first name (not a business name)
- Has a phone number
- Has an email address
- Has visit history
- Has the highest lifetime spend

You can override this by clicking a different record to select it as the keep target.

#### Merging

Click **Merge** on a single group, or **Merge All** to process all groups at once.

When a merge executes:

1. All transactions, vehicles, appointments, quotes, and other linked records from the deleted records are transferred to the kept record
2. The duplicate records are deleted
3. Lifetime spend and visit counts are consolidated

> **Merging cannot be undone.** A confirmation dialog shows exactly which record will be kept and which will be deleted before proceeding.

---

### 5.7 Customer Portal

Customers can access their own account at `/account` after signing in. The portal is separate from the admin system — customers sign in via phone OTP or email + password at `/signin`.

#### Portal Dashboard

The dashboard (`/account`) shows:

| Section | What It Shows |
|---------|--------------|
| **Welcome Banner** | Greeting with the customer's first name and a "Book New Appointment" button |
| **Loyalty Points** | Current point balance, dollar value equivalent, link to rewards detail |
| **Last Service** | Most recent service with vehicle info, service names, and a before/after photo slider (if photos exist) |
| **Your Coupons** | Any active coupon codes assigned to the customer, with discount details |
| **Upcoming Appointments** | Next 3 upcoming appointments (pending or confirmed) with appointment cards |

#### Portal Pages

| Page | Path | What Customers Can Do |
|------|------|----------------------|
| **Dashboard** | `/account` | Overview of account status |
| **Profile** | `/account/profile` | Edit name, phone, manage SMS/email consent toggles, notification preferences, sign out |
| **Vehicles** | `/account/vehicles` | View, add, edit, and delete their vehicles |
| **Appointments** | `/account/appointments` | View upcoming and past appointments, cancel upcoming appointments |
| **Service History** | `/account/services` | View past service visits with before/after photos |
| **Photos** | `/account/photos` | Browse all their service photos organized by visit |
| **Transactions** | `/account/transactions` | View payment history |
| **Loyalty** | `/account/loyalty` | View loyalty point balance, earning/redemption history, program details |
| **Orders** | `/account/orders` | View online store order history |

#### Portal Authentication

Customers authenticate via:

1. **Phone OTP** (default) — Enter phone number → receive 6-digit SMS code → verify
2. **Email + password** — Alternative sign-in method with forgot password support

New customers create an account at `/signup`. The system verifies the phone number exists in the `customers` table before sending an OTP. If no matching customer record exists, the user is directed to create a new account.

> Admin and customer auth systems are completely separate. An admin email cannot be used to log into the customer portal, and vice versa.

#### Managing Portal Access from Admin

From the customer detail page **Info** tab, admins can:

- **Send password reset** — Sends a reset email to the customer
- **Deactivate portal access** — Disables the customer's ability to log in (stores the `auth_user_id` as backup)
- **Reactivate portal access** — Restores previously deactivated access

---

### 5.8 Customer Types

Every customer is classified into one of two types (or left uncategorized):

| Type | Badge Color | Description |
|------|-------------|------------|
| **Enthusiast** | Green / Blue | Individual car owners who care about their vehicle's appearance |
| **Professional** | Blue / Purple | Business customers — fleet managers, dealerships, body shops |
| **Unknown** | Gray | Not yet categorized |

#### Why Customer Type Matters

Customer type can be used for:

- **Filtering** — The customer list can filter by type
- **Segmentation** — Marketing campaigns can target specific customer types
- **Reporting** — Track which type drives more revenue
- **Service recommendations** — Professionals may need fleet pricing or recurring schedules

#### Setting Customer Type

Customer type can be set in multiple places:

- **Create customer form** — Required field (Enthusiast or Professional)
- **Customer detail page** — Click type buttons on the Info tab
- **Customer list** — Click the type badge in the table to cycle: Unknown → Enthusiast → Professional → Unknown
- **POS** — Customer type badge in POS customer views

---

### 5.9 Tags

Tags are free-form text labels attached to customer records for flexible segmentation.

#### Common Tags

While tags are completely free-form, common examples include:

- `VIP` — High-value customers
- `fleet` — Fleet/business accounts
- `referral` — Came from a referral
- `yelp` — Found through Yelp
- `ceramic` — Interested in ceramic coatings

#### Managing Tags

| Where | How |
|-------|-----|
| **Create customer form** | Enter comma-separated tags |
| **Customer detail page** | Edit tags in the Notes & Tags card |
| **Customer list (bulk)** | Select multiple customers → Add Tag / Remove Tag |
| **Customer list (filter)** | Filter by tag to see all customers with a specific tag |

#### Tag Filtering Behavior

Tag filters use **AND logic** — selecting multiple tags shows only customers who have **all** selected tags (not any).

---

### 5.10 Marketing Consent

Every customer has two independent consent toggles:

| Toggle | Controls | Default |
|--------|---------|---------|
| **SMS Consent** | Whether the customer can receive marketing SMS messages | Auto-enabled when phone is entered |
| **Email Consent** | Whether the customer can receive marketing emails | Auto-enabled when email is entered |

#### Auto-Toggle Behavior

When creating or editing a customer:

- Entering a phone number automatically enables **SMS Consent**
- Clearing the phone number automatically disables **SMS Consent**
- Entering an email address automatically enables **Email Consent**
- Clearing the email address automatically disables **Email Consent**

Staff can manually override these toggles at any time.

#### Consent Logging

All consent changes are logged in the `marketing_consent_log` and `sms_consent_log` tables for compliance. Logs record:

- Customer ID
- Channel (SMS or email)
- Action (opt_in or opt_out)
- Source (manual, admin_manual, customer self-service, keyword response)
- Timestamp

> Customers can also manage their own consent from the portal profile page (`/account/profile`). Turning off a consent toggle from the portal shows a confirmation dialog before applying.

---

### 5.11 Permissions Reference

| Permission | What It Controls |
|------------|-----------------|
| `customers.view` | View customer list and profiles |
| `customers.create` | Create new customer records |
| `customers.edit` | Edit customer details, manage tags (including bulk tag operations) |
| `customers.delete` | Delete customer records (two-step confirmation) |
| `customers.view_history` | View a customer's transaction and service history |
| `customers.view_loyalty` | View loyalty point balance |
| `customers.adjust_loyalty` | Manually add or subtract loyalty points |
| `customers.merge` | Access duplicate detection and merge customers |
| `customers.export` | Export customer data to CSV |

---


---

## 6. Services & Pricing

This chapter covers the service catalog — how services are organized, how to create and edit them, the six pricing models, add-on suggestions, prerequisites, and mobile service zones.

---

### 6.1 Service Catalog Overview

The service catalog is the foundation of the business. Every quote, booking, POS ticket, and public website listing draws from the same service data.

#### Organizational Hierarchy

Services are organized in three layers:

1. **Service Categories** — Top-level groupings (e.g., "Express & Detail Services", "Ceramic Coatings")
2. **Services** — Individual service offerings within a category (e.g., "Signature Complete Detail")
3. **Pricing Tiers** — Price breakdowns per vehicle size, scope, or specialty type

#### Where Services Appear

| Surface | What It Uses |
|---------|-------------|
| POS ticket builder | Active services, grouped by category, filtered by vehicle compatibility |
| Online booking | Active services with `online_bookable = true`, grouped by category |
| Public website | Active services with `show_on_website = true`, grouped by category |
| Quotes | Same service catalog as POS |
| Voice agent | Same catalog, pricing resolved by vehicle type |

#### Navigation

- **Service list**: **Admin** → **Catalog** → **Services**
- **Categories**: **Admin** → **Catalog** → **Categories** → **Service Categories** tab
- **Vehicle categories**: **Admin** → **Catalog** → **Categories** → **Vehicle Categories** tab
- **Mobile zones**: **Admin** → **Settings** → **Mobile Zones**

---

### 6.2 Managing Service Categories

Navigate to **Admin** → **Catalog** → **Categories** and select the **Service Categories** tab.

#### Viewing Categories

The table shows each category with its name, slug, display order, count of linked services, and active/inactive status. Categories are sorted by `display_order`.

#### Creating a Category

1. Click **Add Service Category**
2. Fill in the required fields:

| Field | Required | Description |
|-------|:--------:|-------------|
| Name | Yes | Display name shown in POS, booking, and website (e.g., "Ceramic Coatings") |
| Slug | Yes | URL-friendly identifier, auto-generated from the name (e.g., `ceramic-coatings`) |
| Description | No | Optional description of the category |
| Display Order | No | Controls sort order. Lower numbers appear first. Defaults to 0. |

3. Click **Create Category**

> The slug is used in public URLs for service pages: `/services/{category-slug}/{service-slug}`. Choose slugs carefully — changing a slug after the page is indexed by search engines will break existing links.

#### Editing a Category

Click the pencil icon next to any category to open the edit dialog. All fields are editable. Click **Save Changes** to apply.

#### Deleting a Category

Click the trash icon next to a category. The system checks for linked active services first:

- If the category has linked services, deletion is blocked. Reassign those services to another category first.
- If no services are linked, a confirmation dialog appears. Deleting a category sets `is_active = false` (soft delete).

#### Vehicle Categories

The **Vehicle Categories** tab displays the five fixed vehicle categories: Automobile, Motorcycle, RV, Boat, and Aircraft. These cannot be created or deleted — only their display settings can be edited.

Click the pencil icon on any vehicle category to edit:

| Field | Description |
|-------|-------------|
| Image | Upload a representative image (JPEG, PNG, or WebP, max 10 MB, recommended 800x600px) |
| Key | System identifier (read-only, e.g., `automobile`) |
| Display Name | Label shown in the booking flow |
| Description | Optional text displayed below the name |
| Image Alt Text | Accessibility text for the image |
| Active | Controls visibility in the booking flow |
| Display Order | Lower numbers appear first |

---

### 6.3 Creating & Editing Services

#### Service List

Navigate to **Admin** → **Catalog** → **Services** to view the full catalog.

The list page provides:

- **Search** — Filter by service name or description
- **Category filter** — Show only services in a specific category
- **Classification filter** — Filter by Primary, Add-On Only, or Both
- **Pricing model filter** — Filter by Vehicle Size, Scope, Per Unit, Specialty, Flat Rate, or Custom Quote
- **Show Inactive toggle** — Include deactivated services in the list

Each row shows the service image thumbnail, name (clickable link to edit page), category, classification badge, pricing model badge, duration, mobile eligibility, and status. Inactive services show a **Reactivate** button inline.

If any active services are missing images, an amber warning banner appears at the top with the count.

#### Creating a Service

1. Click **Add Service** on the services list page
2. Fill in the service details (see field reference below)
3. Select a pricing model and configure pricing (see section 6.4)
4. Click **Create Service**

#### Service Fields Reference

##### Service Details Card

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Service Name | Yes | — | Display name (e.g., "Express Exterior Wash") |
| Description | No | — | What the service includes. Shown on website and booking. |
| Category | No | None | Assign to a service category for grouping |
| Classification | Yes | Primary | How this service can be sold (see table below) |
| Base Duration (minutes) | Yes | 60 | Estimated time to complete. Used for calendar scheduling. Step: 15 min. |
| Vehicle Compatibility | Yes | Standard | Which vehicle types this service applies to. At least one must be selected. |
| Special Requirements | No | — | Notes about equipment or conditions needed (e.g., "Aviation-approved products only") |

##### Service Classifications

| Value | Label | Meaning |
|-------|-------|---------|
| `primary` | Primary (Standalone) | Can be booked as the main service on a ticket. Appears as a top-level booking option. |
| `addon_only` | Add-On Only | Must be purchased alongside a primary service. Cannot be booked independently. |
| `both` | Both (Standalone or Add-On) | Can be booked standalone or added to another service. Appears in both the primary catalog and add-on suggestions. |

##### Vehicle Compatibility

Select one or more vehicle types this service is compatible with:

| Value | Label | Notes |
|-------|-------|-------|
| `standard` | Standard | Automobiles (sedans, trucks, SUVs, vans) |
| `motorcycle` | Motorcycle | Motorcycles of all types |
| `rv` | RV | Recreational vehicles and motorhomes |
| `boat` | Boat | Boats of all sizes |
| `aircraft` | Aircraft | Fixed-wing aircraft and jets |

Most automobile services use `standard` only. Specialty vehicle services (motorcycle detail, boat wash, etc.) use their respective type.

##### Service Options Card

| Toggle | Default | Description |
|--------|---------|-------------|
| Mobile Eligible | Off | Can be performed at the customer's location. Mobile surcharge applies (see section 6.8). |
| Online Bookable | On | Appears in the online booking wizard. Turn off for services that require phone or POS only. |
| Staff Assessed | Off | Only staff can add this to a ticket. Hidden from customer-facing channels. Used for surcharges like "Excessive Cleaning Fee". |
| Taxable | Off | Whether sales tax applies. Services are generally not taxed. |

##### Display Settings Card

| Field | Default | Description |
|-------|---------|-------------|
| Display Order | 0 | Controls sort position in POS and booking. Lower numbers appear first. |
| Active | On | When off, the service is hidden from POS, booking, and the website. |

##### Service Image Card

Upload an image for the service. Images are stored in the `service-images` Supabase storage bucket. Accepted formats: JPEG, PNG, WebP. On the edit page, an **Image Alt Text** field appears after upload for accessibility and SEO.

#### Editing a Service

Click any service name in the list to open its detail page. The edit page has four tabs:

| Tab | What It Contains |
|-----|-----------------|
| **Details** | Service name, description, category, classification, duration, vehicle compatibility, options, display settings, image |
| **Pricing** | Standard pricing tiers, sale pricing, sale period dates |
| **Add-Ons** | Add-on suggestion configuration for this service |
| **Prerequisites** | Services that must be completed before this one |

Each tab saves independently. Click the relevant **Save** button after making changes on each tab.

#### Deactivating vs. Deleting

- **Deactivating** — Toggle the Active switch to off on the Details tab. A confirmation dialog appears. The service becomes invisible in POS and booking but its data is preserved.
- **Deleting** — Click the **Delete** button (requires `services.delete` permission). This also performs a soft delete (sets `is_active = false`) and redirects to the service list.
- **Reactivating** — On the services list, inactive services show a **Reactivate** button. Click it to restore the service to active status.

---

### 6.4 Pricing Tiers

Every service uses one of six pricing models. The pricing model is selected when creating a service and determines how prices are entered and resolved.

#### Pricing Models

| Model | Label | How It Works |
|-------|-------|-------------|
| `vehicle_size` | Vehicle Size | Three fixed price tiers based on vehicle size class: Sedan, Truck/SUV (2-Row), SUV (3-Row) / Van |
| `scope` | Scope | Named tiers representing scope of work. Each tier can optionally be vehicle-size-aware. |
| `per_unit` | Per Unit | A single price per unit (e.g., per panel, per seat) with an optional maximum |
| `specialty` | Specialty | Named tiers for specialty vehicle types (motorcycle, RV, boat, aircraft sizing) |
| `flat` | Flat Rate | One price regardless of vehicle size |
| `custom` | Custom Quote | A "starting at" price displayed to customers; final price determined after inspection |

#### Vehicle Size Pricing

This is the most common model. When selected, three price inputs appear:

| Tier | Label | Examples |
|------|-------|---------|
| `sedan` | Sedan | Sedans, coupes, compact cars (Civic, Camry, Model 3) |
| `truck_suv_2row` | Truck/SUV (2-Row) | SUVs, trucks, crossovers (RAV4, F-150, Tahoe) |
| `suv_3row_van` | SUV (3-Row) / Van | Full-size vans, 3-row SUVs (Suburban, Sprinter, Odyssey) |

Enter a dollar amount for each tier. Prices are stored in the `service_pricing` table with three rows per service.

When a vehicle-size-priced service is added to a POS ticket, the system auto-selects the correct tier based on the customer's vehicle. Staff can override if needed.

#### Scope Pricing

Scope pricing defines named tiers representing different levels of work. Each tier has:

| Field | Description |
|-------|-------------|
| Tier Name | Internal identifier (e.g., `floor_mats`) |
| Display Label | Label shown to customers (e.g., "Floor Mats Only") |
| Price | Dollar amount for this tier |
| Vehicle Size Aware | Toggle. When enabled, the tier uses three sub-prices (Sedan, Truck/SUV, SUV/Van) instead of a single price. |

Click **Add Tier** to add more tiers. Click the trash icon to remove a tier (minimum one required). Tiers are stored as rows in `service_pricing`.

> Scope pricing is used for services like Hot Shampoo Extraction, where the work scope varies significantly. The last tier ("Complete Interior") enables the vehicle-size-aware toggle so the price changes based on whether the vehicle is a sedan vs. a large SUV.

#### Per Unit Pricing

For services charged by count (e.g., scratch repair per panel):

| Field | Description |
|-------|-------------|
| Price Per Unit | Dollar amount per unit |
| Max Units | Maximum number of units per service (e.g., 4 panels). Optional. |
| Unit Label | What the unit is called (e.g., "panel", "seat", "row") |

Per unit pricing is stored directly on the `services` table (`per_unit_price`, `per_unit_max`, `per_unit_label`) — not in the `service_pricing` table.

In the POS, tapping the service again increments the unit count. When the maximum is reached, a warning appears.

#### Specialty Pricing

Specialty pricing is used for non-automobile vehicles. It defines named tiers specific to the vehicle category:

| Vehicle Category | Typical Tier Names |
|-----------------|-------------------|
| Motorcycle | Standard/Cruiser, Touring/Bagger |
| RV | Up to 24', 25-35', 36'+ |
| Boat | Up to 20', 21-26', 27-32' |
| Aircraft | 2-4 Seater, 6-8 Seater, Turboprop/Jet |

Each tier has a name, display label, and price. Click **Add Tier** to add more. Tiers are stored as rows in `service_pricing`.

> The tier name keys (e.g., `standard_cruiser`, `rv_up_to_24`, `boat_21_26`) map directly to the `vehicles.specialty_tier` column. When a specialty vehicle is on a ticket, the system resolves the price by matching the vehicle's `specialty_tier` to the `service_pricing.tier_name`.

#### Flat Rate Pricing

A single price for all vehicles. Enter the dollar amount in the **Flat Price** field. The price is stored on the `services.flat_price` column — no rows are created in `service_pricing`.

#### Custom Quote Pricing

For services that require inspection before final pricing (e.g., flood damage repair). Enter a **Starting Price** that displays to customers as "Starting at $X". The actual price is determined at the POS after inspection. Stored on `services.custom_starting_price`.

#### Where Pricing Data Lives

| Pricing Model | Storage Location |
|---------------|-----------------|
| `vehicle_size` | `service_pricing` table — 3 rows (sedan, truck_suv_2row, suv_3row_van) |
| `scope` | `service_pricing` table — N rows (one per scope tier) |
| `specialty` | `service_pricing` table — N rows (one per specialty tier) |
| `flat` | `services.flat_price` column |
| `per_unit` | `services.per_unit_price`, `per_unit_max`, `per_unit_label` columns |
| `custom` | `services.custom_starting_price` column |

#### Sale Pricing

Services that use the `service_pricing` table (vehicle_size, scope, and specialty models) support sale pricing. On the service edit page **Pricing** tab:

1. **Sale prices per tier** — Enter a reduced price for each tier. The sale price must be less than the standard price and greater than $0.
2. **Discount helpers** — Instead of entering each sale price manually, use the discount controls:
   - **Direct** — Enter each sale price individually
   - **Percentage** — Enter a percentage (e.g., 20%) and all sale prices auto-calculate from standard prices
   - **Fixed** — Enter a dollar amount (e.g., $25) to subtract from each standard price
3. **Sale period** — Optionally set a start date and/or end date. Leave dates empty for no time limit.

Sale pricing uses two fields on the `services` table:
- `sale_starts_at` — When the sale begins (applies to all tiers)
- `sale_ends_at` — When the sale ends

Each pricing row in `service_pricing` has a `sale_price` column that stores the reduced price.

##### Sale Status Indicators

The Pricing tab header shows a badge when sale prices are configured:

| Status | Meaning |
|--------|---------|
| Active | Sale is currently running (start date passed, end date not reached) |
| Scheduled | Sale has prices set but the start date is in the future |
| Expired | Sale end date has passed |

A **Sale Preview** panel shows the before/after prices with savings calculations.

To remove all sale prices, click **Clear All Sale Prices** and confirm.

> Flat-priced services do not have a sale pricing mechanism. To offer a discount on a flat-priced add-on, use the combo price on the add-on suggestion (see section 6.5).

---

### 6.5 Add-On Suggestions

Add-on suggestions are upsell prompts that appear when a primary service is selected in the POS or during booking.

#### How They Work

1. A customer or staff member selects a primary service
2. The system queries `service_addon_suggestions` for that primary service
3. Matching add-ons display as suggestion cards showing the service name, standard price, and combo price (if configured) with savings highlighted
4. Staff can add the suggestion with one tap, or the customer can select it during booking
5. If the suggestion is dismissed, the add-on can still be added manually

#### Configuring Add-On Suggestions

Navigate to the service edit page and select the **Add-Ons** tab. The tab badge shows the count of configured suggestions.

##### Adding a Suggestion

1. Click **Add Suggestion**
2. Fill in the form:

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Add-On Service | Yes | — | The service to suggest. Dropdown filters to services classified as `addon_only` or `both` that are not already configured as suggestions for this service. |
| Combo Price | No | None | Reduced price when this add-on is purchased with the primary service. Leave empty to suggest at the add-on's standard price. |
| Display Order | No | Next available | Lower numbers appear first in the suggestion list |
| Auto-Suggest | Yes | On | When on, the suggestion appears automatically. When off, it only appears when staff manually browses add-ons. |
| Seasonal | No | Off | When on, the suggestion only appears during the specified date range |
| Seasonal Start | No | — | Start date for seasonal suggestion (only when Seasonal is on) |
| Seasonal End | No | — | End date for seasonal suggestion |

3. Click **Save**

##### Editing a Suggestion

Click the pencil icon on any suggestion row to open the edit dialog. All fields are editable.

##### Removing a Suggestion

Click the trash icon and confirm. This is a hard delete — the suggestion is permanently removed.

#### Combo Pricing

Combo pricing is the mechanism for discounting add-on services when paired with a specific primary service:

- The `combo_price` is stored on `service_addon_suggestions` — it is contextual to the specific primary + add-on pair
- At POS, the system displays: ~~$175~~ **$140** (Save $35) when combo pricing is active
- If multiple primary services on one ticket have combo prices for the same add-on, the best (lowest) combo price applies
- Combo price applies only when both the primary and add-on are on the same ticket

> For flat-priced add-on services, combo pricing via `service_addon_suggestions.combo_price` is the only way to offer a discounted price. Flat-priced services do not have `service_pricing` rows and therefore no `sale_price` mechanism.

---

### 6.6 Service Prerequisites

Prerequisites enforce service dependencies. For example, ceramic coating services require paint correction to be completed first.

#### How They Work

When a service with a prerequisite is added to a ticket or booking:

1. The system checks the prerequisite conditions based on the enforcement type
2. If the condition is not met, the system responds according to the enforcement level (block, warn, or allow)

#### Configuring Prerequisites

Navigate to the service edit page and select the **Prerequisites** tab. The tab badge shows the count of configured prerequisites.

##### Adding a Prerequisite

1. Click **Add Prerequisite**
2. Fill in the form:

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Prerequisite Service | Yes | — | The service that must be completed first. Dropdown shows all active services except the current one and any already configured. |
| Enforcement | Yes | Recommended | How strictly the prerequisite is enforced (see enforcement types below) |
| History Window (days) | Conditional | 30 | Only for `required_history` enforcement. How recently the prerequisite must have been completed. |
| Warning Message | No | — | Custom message shown when the prerequisite is not met |

3. Click **Save**

#### Enforcement Types

| Type | Label | Behavior |
|------|-------|----------|
| `required_same_ticket` | Required (Same Ticket) | The prerequisite service must be on the same ticket. Blocks adding the service without it. |
| `required_history` | Required (History) | The prerequisite must exist in the vehicle's service history within the configured number of days. |
| `recommended` | Recommended | Shows a warning message but allows proceeding. Used when the prerequisite may have been done elsewhere. |

##### Example: Ceramic Coatings

All ceramic shield services (1-Year, 3-Year, 5-Year) have a prerequisite for Paint Correction (Single-Stage or 3-Stage):

- **Enforcement**: `required_same_ticket` or `required_history` (within 30 days)
- **Behavior**: If paint correction is not on the ticket and not in the vehicle's recent service history, the system blocks the ceramic coating and prompts the user to add paint correction

The Booster Detail uses `recommended` enforcement for ceramic coating history — it shows a warning if no coating history is found, but allows proceeding since the coating may have been applied elsewhere.

##### Editing and Removing Prerequisites

- Click the pencil icon to edit any prerequisite
- Click the trash icon and confirm to remove (hard delete)

---

### 6.7 Packages / Combos

The database includes `packages` and `package_services` tables for bundled service packages.

#### Package Structure

| Table | Purpose |
|-------|---------|
| `packages` | Defines the package (name, description, bundled price) |
| `package_services` | Links individual services to a package |

A package has a single bundled price that is less than the sum of the individual service prices, providing a built-in discount.

> The current catalog uses the add-on suggestion system with combo pricing (section 6.5) for most bundled discount scenarios. The packages table provides an additional mechanism for creating fixed-price bundles that include multiple services.

---

### 6.8 Mobile Zones

Mobile zones define geographic service areas with distance-based travel surcharges for mobile detailing appointments.

#### Overview

When a customer books a mobile service, the system determines which zone their address falls in and applies the corresponding surcharge. The surcharge is a flat fee applied once per appointment, regardless of how many services are on the ticket.

#### Feature Flag

Mobile service availability is controlled by the `MOBILE_SERVICE` feature flag. If disabled:

- Mobile zones are still manageable in settings, but a warning banner appears
- The mobile option is hidden from the booking flow
- The `getMobileZones()` data function returns an empty array

Enable mobile service in **Admin** → **Settings** → **Feature Toggles**.

#### Managing Mobile Zones

Navigate to **Admin** → **Settings** → **Mobile Zones**.

The page shows a table of all configured zones with columns for name, distance range, surcharge, and availability status.

##### Creating a Zone

1. Click **Add Zone**
2. Fill in the form:

| Field | Required | Description |
|-------|:--------:|-------------|
| Zone Name | Yes | Display name (e.g., "Zone 1 - Nearby") |
| Min Distance (mi) | Yes | Starting distance from the shop in miles |
| Max Distance (mi) | Yes | Ending distance from the shop in miles |
| Surcharge | Yes | Dollar amount added to the appointment total |
| Display Order | No | Controls sort position. Lower numbers appear first. |

3. Click **Create Zone**

##### Editing a Zone

Click the pencil icon on any zone row to open the edit dialog.

##### Toggling Availability

Use the inline toggle switch in the Status column to enable or disable a zone without deleting it. Unavailable zones are not shown to customers during booking.

##### Deleting a Zone

Click the trash icon and confirm. This is a hard delete — the zone is permanently removed.

#### Default Zone Configuration

| Zone | Min Distance | Max Distance | Surcharge |
|------|:----------:|:----------:|:---------:|
| Zone 1 | 0 mi | 5 mi | $40.00 |
| Zone 2 | 5 mi | 10 mi | $80.00 |

#### Mobile Booking Rules

- The surcharge is applied **once per appointment** — not per service
- If any service on a mobile ticket is not mobile-eligible, the entire appointment must be in-shop
- During online booking: the customer toggles "Mobile Service", enters their address, the system calculates the zone, and only mobile-eligible services are shown
- At POS: staff sets the "Mobile" flag on a ticket, enters the customer address, and the zone surcharge is auto-applied
- Customers beyond the maximum distance of all active zones cannot book mobile service

#### Mobile-Eligible Services

A service must have **Mobile Eligible** toggled on (section 6.3) to be available for mobile appointments. Services requiring controlled environments (paint correction, ceramic coatings), heavy equipment (extraction, undercarriage cleaning), or enclosed spaces (ozone treatment) are not mobile-eligible.

---


---

## 7. CMS & Website Management

The Website section of the admin dashboard is the central hub for managing the public-facing website. It covers page creation, navigation, hero carousel, footer layout, announcement tickers, themes, SEO, catalog display, ads, global content blocks, team members, and credentials.

All Website management pages are accessed from **Admin** →**Website** in the left sidebar. The sidebar groups Website tools into four collapsible sections: **Content**, **Data**, **Layout**, and **Appearance**.

> Changes to most Website settings are cached and may take up to 60 seconds to appear on the live site.

---

### 7.1 Website Overview

Navigate to **Admin** →**Website** to see the overview dashboard. This page displays 15 section cards organized into groups, each linking to its management page:

| Group | Sections |
|-------|----------|
| **Content** | Homepage, Pages, Team Members, Credentials, Global Blocks |
| **Data** | City Pages, SEO |
| **Layout** | Hero, Navigation, Footer, Tickers, Ads, Catalog Display |
| **Appearance** | Theme & Styles, Seasonal Themes |

Each card shows the section name, a brief description, and a link to the management page.

---

### 7.2 Pages

Navigate to **Admin** →**Website** →**Pages** to manage CMS pages.

#### Page List

The page list displays all custom pages in a table with these columns:

| Column | Description |
|--------|-------------|
| **Title** | Page title (clickable link to the editor) |
| **Slug** | URL path — pages are served at `/p/{slug}` |
| **Template** | Color-coded badge: `content` (blue), `landing` (purple), or `blank` (gray) |
| **Published** | Toggle switch — publishes or unpublishes the page |
| **In Nav** | Toggle switch — shows or hides the page in site navigation. Disabled when the page is unpublished. Auto-clears when a page is unpublished. |
| **Updated** | Last modification timestamp |

Click **New Page** to create a new page. This automatically creates a draft page titled "Untitled Page" with a timestamp-based slug and redirects to the page editor.

#### Page Editor

The page editor is divided into several sections:

##### Page Settings

| Field | Description |
|-------|-------------|
| **Title** | The page title displayed in the browser tab and page header |
| **Slug** | URL path segment. Only lowercase letters, numbers, and hyphens are allowed. The full URL is shown below the field as a preview (e.g., `https://yoursite.com/p/about-us`). |
| **Template** | Controls the page layout. See the template options below. |

**Template Options:**

| Template | Behavior |
|----------|----------|
| **Content** | Standard page with a centered container and prose-formatted text. Best for text-heavy pages like About Us or Terms. |
| **Landing** | Full-width layout without container constraints. Best for marketing pages with hero sections and wide content blocks. |
| **Blank** | Renders content blocks only with no wrapper. Best for pages built entirely from content blocks. |

##### Content (HTML Editor)

A rich HTML editor for the page's main body content. The editor includes the full HTML editor toolbar (see Section 7.3) and an AI Draft panel.

**AI Draft Panel:**
1. Click the AI wand button in the toolbar to open the AI Draft panel
2. Enter a prompt describing the content you want
3. Select a tone: Professional, Casual, or Friendly
4. Click **Generate**
5. If the page already has content, a confirmation dialog asks whether to replace it

##### Content Blocks

Below the main HTML content area, the Content Blocks section allows you to add structured content blocks to the page. Content blocks render below the HTML content area. See Section 7.11 for the full list of block types and their editors.

Actions available in the content blocks section:
- **AI Generate Content** — Generates a full set of content blocks for the page using AI. If blocks already exist, a confirmation dialog asks whether to regenerate.
- **Add block** — Click any block type button to add a new block of that type
- **Insert Global Block** — Insert a shared global block (see Section 7.12)
- **Drag to reorder** — Drag the grip handle on any block to change its position
- **Expand/collapse** — Click a block row to expand its editor
- **AI Improve** — Available on each block, uses AI to enhance the content
- **Toggle active** — Show or hide individual blocks without deleting them
- **Delete** — Permanently removes a page-scoped block. For global blocks, removes the block from this page only.

##### SEO

The SEO section within the page editor provides per-page search engine optimization fields:

| Field | Description | Ideal Length |
|-------|-------------|-------------|
| **Meta Title** | Title shown in search results | 50-60 characters |
| **Meta Description** | Description shown in search results | 150-160 characters |
| **OG Image** | Social sharing image (upload) | 1200x630px |

Character count indicators appear next to the title and description fields: green when within the ideal range, amber when below, and red when over the limit.

Click **AI Generate** to have AI populate the meta title and description based on the page content.

##### Publishing

| Control | Description |
|---------|-------------|
| **Published** | Toggle to publish or unpublish the page |
| **Show in Navigation** | Toggle to add or remove the page from the site navigation. Disabled when the page is unpublished. |

##### Revision History

An expandable section at the bottom of the page editor showing the history of saved versions. Each revision entry shows:
- The date and time the revision was created
- A **View** button to see the revision content
- A **Restore** button to revert the page to that revision

##### Preview

Click the **Preview** button in the page header to generate a preview URL. This opens the page in a new tab without requiring it to be published.

---

### 7.3 HTML Editor Toolbar

The HTML editor toolbar appears in the page content editor, footer column editors, credential descriptions, and other CMS content areas. The toolbar provides formatting and layout tools organized into button groups.

Some buttons are only available in certain contexts. Buttons marked "CMS only" appear when editing CMS pages but not in the footer editor.

#### Group 1 — Text Formatting

| Button | What It Does |
|--------|-------------|
| **Bold** | Wraps selected text in `<strong>` tags |
| **Italic** | Wraps selected text in `<em>` tags |
| **Heading** | Dropdown with three options: H2, H3, H4. Wraps selected text or inserts a heading tag at the appropriate level. |
| **Link** | Prompts for a URL, then wraps selected text in an `<a>` tag. If no text is selected, prompts for both link text and URL. |

#### Group 2 — Media

| Button | What It Does |
|--------|-------------|
| **Image** | Opens the image manager dialog for uploading or selecting images. Inserts an `<img>` tag with the selected image URL. |
| **Video Embed** | *(CMS only)* Prompts for a YouTube or Vimeo URL and inserts a responsive video embed. |
| **Icon** | Opens the Icon Picker dialog with a curated set of Lucide icons. Select an icon, choose size and color, then insert it as an inline SVG. |

#### Group 3 — Layout

| Button | What It Does |
|--------|-------------|
| **Button** | Inserts a styled button element. Prompts for button text and URL. |
| **Divider** | Inserts a horizontal rule (`<hr>`) for visual separation. |
| **Spacer** | Dropdown with four size options: Small (16px), Medium (32px), Large (48px), Extra Large (64px). Inserts a blank div of the selected height. |
| **Table** | Inserts an HTML table structure with header row and body rows. |
| **Columns** | *(CMS only)* Inserts a responsive multi-column layout container. |

#### Group 4 — Blocks

| Button | What It Does |
|--------|-------------|
| **Callout** | *(CMS only)* Inserts a styled callout/alert box for highlighting important information. |
| **Accordion/FAQ** | *(CMS only)* Inserts an expandable accordion section for FAQ-style content. |
| **Social Links** | Inserts a set of social media icon links. |
| **Map** | Inserts an embedded Google Maps iframe. Prompts for the map embed URL. |
| **Embed** | Inserts a generic embed block for third-party widgets or scripts. |
| **List** | Inserts a formatted list structure (ordered or unordered). |

#### Right Side

| Button | What It Does |
|--------|-------------|
| **Preview** | Toggles between the raw HTML editor and a rendered preview of the content. The icon switches between an eye (preview active) and an eye-off (editing active). |

#### AI Draft

The AI Draft button (wand icon) opens a panel below the toolbar:

1. **Prompt** — Textarea where you describe the content you want generated
2. **Tone** — Selector with three options: Professional, Casual, Friendly
3. **Generate** — Sends the prompt to the AI content writer and replaces the editor content with the result
4. If the editor already has content, a confirmation dialog appears before replacing

---

### 7.4 Hero Carousel

Navigate to **Admin** →**Website** →**Hero** to manage the hero section that appears at the top of the homepage.

#### Carousel Configuration

At the top of the page, the carousel settings control how slides are displayed:

| Setting | Options | Description |
|---------|---------|-------------|
| **Mode** | Single / Carousel | Single shows one static slide. Carousel rotates through all active slides. |
| **Interval** | 3-10 seconds | Time each slide is displayed before transitioning (carousel mode only) |
| **Transition** | Fade / Slide | Animation style between slides |
| **Pause on Hover** | On / Off | Whether the carousel pauses when the user hovers over it |

#### Slide List

Below the carousel settings, all slides are listed with:
- A thumbnail preview
- The slide title
- An **Active** toggle to enable or disable the slide
- **Up/Down** arrows to reorder slides
- A **Delete** button

Click a slide to open the slide editor, or click **New Slide** to create one.

#### Slide Editor

The slide editor is organized into sections based on the selected content type.

##### Content Type

Each slide has a content type that determines what is displayed:

| Content Type | Description |
|-------------|-------------|
| **Image** | A static background image with text overlay |
| **Video** | A video background (YouTube or Vimeo URL) with text overlay |
| **Before/After** | A side-by-side or slider comparison of two images |

##### Text Content

These fields appear for all content types:

| Field | Description |
|-------|-------------|
| **Title** | Main headline text displayed on the slide |
| **Subtitle** | Supporting text below the title |
| **CTA Text** | Button label (e.g., "Book Now") |
| **CTA URL** | Link destination when the button is clicked |
| **Text Alignment** | Left, Center, or Right alignment of the text overlay |
| **Overlay Opacity** | 0-100% — controls the darkness of the overlay behind the text |

##### Image Fields (Image content type)

| Field | Description |
|-------|-------------|
| **Desktop Image** | Primary background image (required) |
| **Mobile Image** | Optional smaller image optimized for mobile screens |
| **Alt Text** | Accessibility description for the image |

##### Video Fields (Video content type)

| Field | Description |
|-------|-------------|
| **Video URL** | YouTube or Vimeo video URL |
| **Poster Image** | Thumbnail/poster image shown before the video loads |

##### Before/After Fields (Before/After content type)

| Field | Description |
|-------|-------------|
| **Before Image** | The "before" comparison image |
| **After Image** | The "after" comparison image |
| **Before Label** | Text label for the before side (e.g., "Before") |
| **After Label** | Text label for the after side (e.g., "After") |

##### Color Overrides

Six optional color fields let you customize the slide's appearance without changing the site theme:

| Field | Description |
|-------|-------------|
| **Text Color** | Override the main title text color |
| **Subtitle Color** | Override the subtitle text color |
| **Accent Color** | Override the accent/highlight color |
| **Overlay Color** | Override the background overlay color |
| **CTA Background** | Override the CTA button background color |
| **CTA Text Color** | Override the CTA button text color |

Each field uses a hex color picker. Leave blank to use the site theme defaults.

---

### 7.5 Navigation

Navigate to **Admin** →**Website** →**Navigation** to manage the site's header and footer navigation menus.

#### Placements

The navigation manager has two placement tabs:

| Placement | Where It Appears |
|-----------|-----------------|
| **Header** | The main navigation bar at the top of every page |
| **Footer Quick Links** | A links column in the footer section |

Switch between placements by clicking the tab at the top of the page.

#### Navigation Items

Each placement shows a list of navigation items that can be reordered, nested, and edited. Each item displays:
- The link label
- The URL or route
- A target indicator (same tab or new tab)
- Drag handle for reordering

#### Adding a Link

Click **Add Link** to open the add link dialog. There are three link type options:

| Link Type | Description |
|-----------|-------------|
| **Custom URL** | Enter any URL path (e.g., `/about` or `https://external.com`). Supports both internal paths and external URLs. |
| **Existing Page** | Select from a dropdown of all published CMS pages. The URL is automatically set to `/p/{slug}`. |
| **Built-in Route** | Select from a list of predefined routes in the system. |

**Built-in Routes:**

| Route | URL Path |
|-------|----------|
| Services | `/services` |
| Products | `/products` |
| Gallery | `/gallery` |
| Book Now | `/book` |
| Sign In | `/signin` |
| My Account | `/account` |
| Terms & Conditions | `/terms` |

Additional fields when adding a link:

| Field | Description |
|-------|-------------|
| **Label** | The text displayed in the navigation menu |
| **Target** | `Same Tab` (_self) or `New Tab` (_blank) |
| **Parent** | Select a parent item to nest this link under it (max 2 levels deep) |

#### Bulk Add Published Pages

Click **Add Published Pages** to automatically create navigation items for all published CMS pages that are not already in the current placement.

#### Reordering and Nesting

- **Drag and drop** — Drag items by the grip handle to reorder them
- **Nesting** — Indent a navigation item under another to create a dropdown or submenu (maximum 2 levels of nesting)
- **Editing** — Click the edit button on any item to modify its label, URL, or target
- **Deleting** — Click the delete button to remove an item from the navigation

---

### 7.6 Footer

Navigate to **Admin** →**Website** →**Footer** to configure the site footer. The footer is built from three collapsible sections, each with its own enable/disable toggle.

#### Footer Sections

| Section | Description |
|---------|-------------|
| **Main Footer** | The primary footer area with configurable columns |
| **Service Areas** | A section listing the cities and areas the business serves |
| **Bottom Bar** | The copyright bar at the very bottom with legal links |

Each section has a toggle switch to enable or disable it independently.

#### Main Footer — Column Management

The main footer section uses a **12-unit grid system**. Columns are placed within this grid and their widths are controlled by span values.

##### Grid Rules

| Rule | Value |
|------|-------|
| **Maximum active columns** | 6 |
| **Grid units total** | 12 |
| **Minimum column span** | 2 |

The **Column Width Preview** bar at the top of the main footer panel shows a visual representation of how the columns fill the grid. The status indicator shows:
- Green with a checkmark when the total equals 12
- Amber when there are unused units
- Red when the total exceeds 12

##### Adding a Column

Click **Add Column** and fill in:

| Field | Description |
|-------|-------------|
| **Column Title** | The heading displayed above the column content |
| **Content Type** | The type of content the column will contain |

**Content Type Options:**

| Type | Description |
|------|-------------|
| **Links** | A list of clickable links. Links are managed through the navigation system. |
| **HTML** | Free-form HTML content. Uses the HTML editor toolbar for formatting. |
| **Business Info** | Automatically displays business contact information pulled from Business Settings. |
| **Brand** | Logo, tagline, and contact toggles. Only one brand column can exist. Configuration includes logo width, tagline text, and toggles for showing phone, email, address, and review badges. |

##### Column Controls

Each column card provides:
- **Drag handle** — Reorder columns by dragging
- **Title** — Click to edit inline
- **Content type badge** — Color-coded: Links (blue), HTML (default), Business Info (green), Brand (amber)
- **Span input** — Set the column width (2-12 grid units)
- **Enable/Disable toggle** — Disabled columns do not count toward grid units or the 6-column limit
- **Delete** — Remove the column (links are unassigned, not deleted)

##### Brand Column

The brand column has a specialized editor with:

| Setting | Description |
|---------|-------------|
| **Logo Width** | Width of the logo image (40-400px) |
| **Tagline** | Text displayed below the logo |
| **Show Phone** | Toggle to display the business phone number |
| **Show Email** | Toggle to display the business email |
| **Show Address** | Toggle to display the business address |
| **Show Reviews** | Toggle to display review badges |

#### Service Areas Section

When enabled, this section automatically displays the cities configured in the City Pages section (see Section 7.10). The layout and styling are managed through the section's settings.

#### Bottom Bar

The bottom bar section manages the copyright text and legal links displayed at the very bottom of the page.

**Bottom Links** are simple text + URL pairs (e.g., "Privacy Policy", "Terms of Service") that appear in the bottom bar alongside the copyright text.

---

### 7.7 Announcement Tickers

Navigate to **Admin** →**Website** →**Tickers** to manage scrolling announcement banners.

#### Prerequisites

Tickers require the **Announcement Tickers** feature flag to be enabled in **Admin** →**Settings** →**Feature Toggles**. If the feature is disabled, the tickers page shows a warning banner.

#### Master Toggle

A master toggle at the top of the page enables or disables all tickers globally. Individual tickers can be toggled on and off independently, but none will display if the master toggle is off.

#### Ticker List

Tickers are grouped by placement:

| Placement | Where It Appears |
|-----------|-----------------|
| **Top Bar** | A narrow banner above the site header |
| **Between Sections** | A banner inserted between content sections on the page |

Within each group, tickers are listed with:
- The message text
- Background and text color previews
- An active toggle
- Up/down arrows for reordering within the group

#### Multi-Ticker Rotation

When two or more tickers are active within the same placement, rotation options appear for that placement group:

| Setting | Options | Description |
|---------|---------|-------------|
| **Text Entry** | Scroll, Right-to-Left, Left-to-Right, Top-to-Bottom, Bottom-to-Top, Fade In | How each ticker's message enters the screen. "Scroll" uses a continuous marquee. Other options animate the message in, hold it centered, then transition. |
| **Background Transition** | Crossfade, Slide Down, None | How the background changes between tickers |
| **Hold Duration** | 1-30 seconds | How long each ticker is displayed before transitioning to the next |

When only one ticker is active in a placement, it always displays as a continuous scrolling marquee.

#### Creating / Editing a Ticker

Click **New Ticker** or click an existing ticker to open the ticker editor. The editor has a live preview at the top that shows the ticker as it will appear on the site.

##### Ticker Fields

| Field | Description |
|-------|-------------|
| **Message** | The text displayed in the ticker. Supports inline HTML for formatting. |
| **Link URL** | Optional URL — if set, the ticker becomes clickable |
| **Link Text** | Optional text for the link (displayed alongside or instead of the message) |
| **Placement** | Top Bar or Between Sections |
| **Section Position** | *(Between Sections only)* Where the ticker appears relative to page sections |
| **Font Size** | Extra Small, Small, Base, or Large |
| **Background Color** | Hex color for the ticker background (with color picker) |
| **Text Color** | Hex color for the ticker text (with color picker) |
| **Scroll Speed** | 1-100 slider controlling marquee speed (maps to 30-300 pixels/second) |
| **Message Gap** | 1-100 rem slider controlling the space between repeated message copies in the marquee |
| **Target Pages** | Which pages the ticker appears on (checkboxes) |
| **Start Date** | Optional date/time when the ticker becomes active |
| **End Date** | Optional date/time when the ticker automatically deactivates |

##### Section Positions

When placement is set to "Between Sections", the following positions are available:

| Position | Description |
|----------|-------------|
| **After Hero** | Below the hero carousel |
| **After Services** | Below the services section |
| **After Reviews** | Below the reviews/testimonials section |
| **Before CTA** | Above the call-to-action section |
| **Before Footer** | Above the footer |

> Not all positions are available on every page type. When a position is not available on a given page, the ticker falls back to the next available position in the chain.

##### Target Pages

Checkboxes let you control which pages display the ticker:

| Target | Description |
|--------|-------------|
| **All Pages** | Show on every page (overrides individual selections) |
| **Home** | Homepage only |
| **CMS Pages** | Custom CMS pages |
| **Products** | Product listing and detail pages |
| **Services** | Service listing and detail pages |
| **Areas** | City/service area landing pages |
| **Gallery** | Photo gallery page |
| **Cart** | Shopping cart page |
| **Checkout** | Checkout page |
| **Account** | Customer portal pages |

---

### 7.8 Themes

The theme system has two layers: **Site Theme Settings** (the permanent base theme) and **Seasonal Themes** (temporary overrides that activate on a schedule).

#### Site Theme Settings

Navigate to **Admin** →**Website** →**Theme & Styles** to configure the base site theme. The settings are organized into three tabs.

> When a seasonal theme is active, a warning banner appears at the top of this page indicating that seasonal overrides may be taking priority over site theme settings.

##### Colors Tab

The Colors tab organizes color settings into five groups:

**Background Colors:**

| Token | Description |
|-------|-------------|
| **Page Background** | Main page background color |
| **Card Background** | Background for card and container elements |
| **Header Background** | Site header background |
| **Footer Background** | Site footer background |
| **Alt Section Background** | Alternating section background for visual rhythm |

**Text Colors:**

| Token | Description |
|-------|-------------|
| **Primary Text** | Main body text color |
| **Secondary Text** | Subheadings and supporting text |
| **Muted Text** | Placeholder text, labels, captions |
| **On Primary** | Text color used on primary-colored backgrounds |

**Brand / Accent Colors:**

| Token | Description |
|-------|-------------|
| **Primary** | Main brand color used for buttons, links, and accents |
| **Primary Hover** | Hover state for primary-colored elements |
| **Accent** | Secondary accent color |
| **Accent Hover** | Hover state for accent-colored elements |

**Link Colors:**

| Token | Description |
|-------|-------------|
| **Link** | Default link text color |
| **Link Hover** | Hover state for links |

**Border Colors:**

| Token | Description |
|-------|-------------|
| **Border** | Standard border color |
| **Light Border** | Lighter border for subtle separations |
| **Divider** | Color for horizontal rules and dividers |

Each color field has a hex color picker.

##### Typography Tab

| Setting | Description |
|---------|-------------|
| **Body Font** | The font used for body text throughout the site |
| **Heading Font** | The font used for headings (H1-H6) |

Both fields are dropdown selectors with a curated list of web fonts.

##### Buttons Tab

Button styling is configured for two button types:

**Primary Button:**

| Setting | Description |
|---------|-------------|
| **Background** | Button background color |
| **Text** | Button text color |
| **Hover Background** | Background color on hover |
| **Border Radius** | Corner rounding (e.g., `0.375rem`, `9999px` for pill shape) |

**CTA Button:**

| Setting | Description |
|---------|-------------|
| **Background** | CTA button background color |
| **Text** | CTA button text color |
| **Hover Background** | Background color on hover |
| **Border Radius** | Corner rounding |

##### Quick Presets, Export, Import, and Reset

The theme settings page header includes four actions:

| Action | Description |
|--------|-------------|
| **Quick Presets** | Dropdown with predefined color schemes to apply as a starting point |
| **Export** | Downloads the current theme settings as a JSON file |
| **Import** | Uploads a previously exported JSON file to restore theme settings |
| **Reset** | Reverts all settings to the system defaults |
| **Preview** | Opens the site in a new tab to see the current theme |

#### Seasonal Themes

Navigate to **Admin** →**Website** →**Seasonal Themes** to manage temporary theme overrides that activate on a schedule.

##### Theme List

The seasonal themes page shows all themes with:
- Theme name and description
- Particle effect badge (if configured)
- "Auto" badge (if auto-activate is enabled)
- Start and end dates
- **Activate / Deactivate** toggle

##### Creating a Seasonal Theme

Click **New Theme** to create a theme from scratch, or select from one of eight built-in presets:

| Preset | Description |
|--------|-------------|
| **Christmas** | Red and green palette with snowfall particles |
| **Halloween** | Orange and purple palette with sparkle particles |
| **4th of July** | Red, white, and blue palette with fireworks particles |
| **Memorial Day** | Patriotic palette with star particles |
| **Presidents' Day** | Navy and gold palette with star particles |
| **Valentine's Day** | Pink and red palette with heart particles |
| **Fall / Autumn** | Warm orange and brown palette with leaf particles |
| **New Year** | Gold and black palette with confetti particles |

Each preset pre-fills the color overrides, particle effects, and themed ticker message.

##### Seasonal Theme Editor

The theme editor is organized into these sections:

**Basic Info:**

| Field | Description |
|-------|-------------|
| **Name** | Theme display name |
| **Slug** | URL-safe identifier (auto-generated from name) |
| **Description** | Optional description of the theme |

**Color Overrides:**

The color overrides section contains fields for overriding the site theme's brand colors during the seasonal period. Available color keys:

| Key | Description |
|-----|-------------|
| **lime** | Primary brand color |
| **lime-50** through **lime-600** | Brand color tints and shades |
| **brand-dark** | Dark brand variant |
| **brand-surface** | Brand surface/background color |
| **accent-glow-rgb** | RGB values for the accent glow effect |
| **Body Background** | Override the page background color |
| **Hero Gradient** | Override the hero section gradient |

Each field uses a hex color picker.

> Seasonal theme color overrides take the highest priority: CSS defaults < Site theme settings < Seasonal theme overrides.

**Particle Effect:**

| Setting | Description |
|---------|-------------|
| **Effect Type** | None, Snowfall, Fireworks, Confetti, Hearts, Leaves, Stars, Sparkles |
| **Intensity** | 10-100 slider controlling particle density |
| **Particle Color** | Hex color for the particles |

**Themed Ticker:**

| Setting | Description |
|---------|-------------|
| **Message** | Seasonal ticker message text |
| **Background Color** | Ticker background color |
| **Text Color** | Ticker text color |

When a seasonal theme is active and has a themed ticker configured, this ticker is displayed in addition to any manually created tickers.

**Schedule:**

| Setting | Description |
|---------|-------------|
| **Start Date** | Date and time the theme activates |
| **End Date** | Date and time the theme deactivates |
| **Auto-Activate** | When enabled, the theme automatically activates and deactivates based on the start/end dates |

**Background:**

| Setting | Description |
|---------|-------------|
| **Hero Background Image** | Upload a seasonal background image for the hero section |

**Actions:**

| Action | Description |
|--------|-------------|
| **Preview** | Opens the site with the seasonal theme applied for preview |
| **Export** | Downloads the theme configuration as a JSON file for backup or transfer |
| **Import** | Uploads a previously exported JSON file to restore a theme |

---

### 7.9 SEO Manager

Navigate to **Admin** →**Website** →**SEO** to manage search engine optimization settings for every page on the site.

#### Page List

The SEO manager displays all indexable pages in a searchable, filterable list. Each page row shows:
- Page path and page type badge
- SEO score badge (color-coded: green for Good 80+, amber for Needs Work 50-79, red for Poor 0-49)
- Focus keyword (if set)
- Expandable inline editor

##### Filters

| Filter | Options |
|--------|---------|
| **Search** | Search by page path |
| **Page Type** | All Types, Homepage, Service Category, Service Detail, Product Category, Product Detail, Gallery, Booking, City Landing, Custom |
| **Score** | All Scores, Good (80+), Needs Work (50-79), Poor (0-49) |
| **Focus Keyword** | All, Has Focus Keyword, Missing Focus Keyword |

#### SEO Score

Each page receives an SEO score out of 100 based on these criteria:

| Criterion | Points | Condition |
|-----------|--------|-----------|
| **Title length** | 20 | Title is 50-60 characters (10 points if under 70) |
| **Description length** | 20 | Description is 150-160 characters (10 points if under 200) |
| **Focus keyword in title** | 20 | The focus keyword appears in the SEO title |
| **Focus keyword in description** | 15 | The focus keyword appears in the meta description |
| **Focus keyword in URL** | 10 | The focus keyword appears in the page path |
| **OG image** | 10 | An OG image is set |
| **Internal links** | 5 | At least one internal link is configured |

#### Per-Page SEO Fields

Click a page row to expand the inline editor with these fields:

| Field | Description | Ideal Length |
|-------|-------------|-------------|
| **SEO Title** | Title tag for search engines | 50-60 characters |
| **Meta Description** | Description shown in search results | 150-160 characters |
| **Focus Keyword** | Primary keyword for this page. Shows green/red check marks for presence in title, description, and URL. | N/A |
| **Meta Keywords** | Comma-separated keywords | N/A |
| **Canonical URL** | The canonical URL for duplicate content resolution | N/A |
| **Robots Directive** | Indexing instruction for search engines | N/A |
| **OG Title** | Title for social media sharing | N/A |
| **OG Description** | Description for social media sharing | N/A |
| **OG Image** | Image for social media sharing | N/A |
| **Internal Links** | List of internal link text/URL pairs for cross-linking | N/A |

**Robots Directive Options:** `index,follow` (default), `noindex,nofollow`, `noindex,follow`, `index,nofollow`

#### SERP Preview

A Google search result preview appears within the page editor, showing how the page would appear in search results with the current title, URL, and description.

#### AI Optimization

Two AI modes are available:

| Mode | How to Use | What It Does |
|------|-----------|-------------|
| **Single Page** | Click **AI Optimize** on an expanded page | Generates optimized SEO title, meta description, keywords, focus keyword, OG title, and OG description. Shows suggestions for improvement. A **Revert** button appears to undo AI changes before saving. |
| **Bulk AI** | Select multiple pages using checkboxes, then click **AI Optimize Selected** | Generates SEO for all selected pages at once. Review and apply results individually. |

The live SEO score updates in real-time as you edit fields, so you can see the impact of changes before saving.

---

### 7.10 City Pages

Navigate to **Admin** →**Website** →**City Pages** (under the Data group in the sidebar) to manage city-specific landing pages for local SEO.

City landing pages are served at `/areas/{slug}` and help the business rank in search results for each city in the service area.

#### City List

The city list shows all configured cities with:
- City name and state
- Slug
- Active/inactive badge
- Distance from the business location
- An expand button to open the editor
- A content blocks button to manage the city page content

#### Creating / Editing a City

Click **Add City** or click an existing city to open the editor.

##### City Fields

| Field | Description |
|-------|-------------|
| **City Name** | Name of the city (e.g., "Torrance") |
| **Slug** | URL path segment — auto-generated from the city name (e.g., `torrance`) |
| **State** | Two-letter state abbreviation (default: CA) |
| **Distance** | Miles from the business location |
| **Heading** | Page heading displayed on the city landing page |
| **Intro Text** | Introductory paragraph for the city page |
| **Focus Keywords** | Primary keywords for SEO targeting |
| **Meta Title** | SEO title for the city page |
| **Meta Description** | SEO meta description |
| **Local Landmarks** | Comma-separated list of local landmarks to reference in content |
| **Active** | Toggle to publish or hide the city page |

##### Service Highlights

Each city page can have service highlights — featured services relevant to that specific city:

| Field | Description |
|-------|-------------|
| **Service Name** | Name of the service |
| **Description** | Description tailored to the city |
| **Featured** | Star toggle to feature this service prominently |

Click **Add Highlight** to add a new service highlight. Use the drag handle to reorder. Click the delete button to remove.

Click **Import Services** to automatically populate service highlights from the service catalog.

##### AI Content Generation

Click **AI Generate** on a city entry to have AI create the heading, intro text, and service highlight descriptions based on the city name, distance, and service catalog.

**Batch AI Generation** — Click **Batch Generate** to generate AI content for all cities that are missing content.

##### City Page Content Blocks

Click the content blocks button on a city row to open the content block editor for that city's landing page. This uses the same content block system described in Section 7.2 and Section 7.11.

##### Keyword Density

When a focus keyword is set, the editor shows a keyword density indicator counting the number of times the focus keyword appears in the city page content.

---

### 7.11 Catalog Display

Navigate to **Admin** →**Website** →**Catalog Display** to control which services and products appear on the public website.

#### Tabs

The page has two tabs: **Services** and **Products**.

#### Services Tab

A table listing all services with these columns:

| Column | Description |
|--------|-------------|
| **Name** | Service name |
| **Category** | Service category |
| **POS Active** | Whether the service is active in the POS (read-only indicator) |
| **Website** | Toggle — controls whether the service appears on the public website |
| **Featured** | Star toggle — featured services appear in prominent positions (e.g., homepage) |

#### Products Tab

A table listing all products with these columns:

| Column | Description |
|--------|-------------|
| **Name** | Product name |
| **Category** | Product category |
| **POS Active** | Whether the product is active in the POS (read-only indicator) |
| **Website** | Toggle — controls whether the product appears in the online store |
| **Featured** | Star toggle — featured products appear in prominent positions |

#### Bulk Actions

At the top of each tab:
- **Show All on Website** — Enables the website toggle for all items in the current tab
- **Hide All from Website** — Disables the website toggle for all items

---

### 7.12 Global Blocks

Navigate to **Admin** →**Website** →**Global Blocks** to manage shared content blocks that can be reused across multiple pages.

#### What Are Global Blocks

Global blocks are content blocks that exist independently of any specific page. When a global block is updated, the change is reflected everywhere it is used. This is useful for content like FAQ sections, CTAs, or credential displays that should be consistent across the site.

#### Block Types

Global blocks support all nine content block types:

| Block Type | Description |
|------------|-------------|
| **Rich Text** | Free-form HTML content with the full editor toolbar |
| **FAQ** | Question-and-answer pairs displayed as an accordion. Each FAQ item has a question field and an answer field. Items can be added, removed, and reordered. AI can generate FAQ content. |
| **Features List** | A list of features with title and description for each item. Items can be added, removed, and reordered. |
| **Call to Action** | A CTA section with heading, description, button text, and button URL |
| **Testimonial** | A customer testimonial with quote text, author name, star rating (1-5), and source |
| **Team Grid** | Displays team members from the Team Members table (see Section 7.14). Content is auto-populated. |
| **Credentials** | Displays business credentials from the Credentials table (see Section 7.15). Options include layout (grid), show descriptions toggle, and max items limit. |
| **Terms Sections** | Legal/terms content with an effective date and organized sections. Each section has a title and content body. |
| **Gallery** | An image gallery with uploadable images |

#### Creating a Global Block

1. Click **New Block**
2. Enter a **name** for the block
3. Select the **block type** from the dropdown
4. Click **Create**
5. The block appears in the list — expand it to edit its content

#### Managing Global Blocks

Each global block in the list shows:
- Block name
- Block type badge (with icon)
- Usage count — how many pages include this block, with page names listed
- **Active/Hidden** toggle
- **Expand** to edit content
- **Delete** — shows a warning if the block is used on any pages

#### Inserting a Global Block into a Page

From the page editor's Content Blocks section:
1. Click **Insert Global Block**
2. A dialog shows all available global blocks with their type and name
3. Click a block to add it to the page
4. If the block is already on the page, an error toast prevents duplicate insertion

Global blocks on a page show a special badge to distinguish them from page-scoped blocks. When removing a global block from a page, only the placement is removed — the block itself is not deleted.

---

### 7.13 Ads

Navigate to **Admin** →**Website** →**Ads** to manage advertising placements on the site.

#### Master Toggle

A master toggle at the top enables or disables all ads globally. When disabled, no ads are rendered on the site regardless of individual placement settings.

#### Tabs

The ads page has three tabs:

##### Creatives Tab

Displays all ad creatives in a grid of cards. Each card shows:
- Thumbnail preview of the creative image
- Creative name
- Size badge (dimensions)
- Performance stats: impressions, clicks, and click-through rate (CTR)

Click **New Creative** to create a new ad. Click an existing creative to edit it.

##### Page Map Tab

Shows every page on the site with its available ad zones. Each page entry lists its zones with:
- Zone name and position
- Currently assigned creative (if any)
- **Assign** button to open the assignment dialog

The assignment dialog lets you select a creative from a dropdown to place in a specific zone on a specific page. Click **Clear** to remove an existing assignment.

##### Analytics Tab

Displays ad performance data with:

| Control | Options |
|---------|---------|
| **Period Selector** | Last 7 days, Last 30 days, Last 90 days, All time |

**Stat Cards:**

| Metric | Description |
|--------|-------------|
| **Total Impressions** | Number of times ads were displayed |
| **Total Clicks** | Number of times ads were clicked |
| **Average CTR** | Click-through rate as a percentage |

**Top Creatives Table:** Lists the best-performing creatives ranked by impressions, with clicks and CTR for each.

---

### 7.14 Team Members

Navigate to **Admin** →**Website** →**Team Members** to manage the team section displayed on the website.

#### Team List

Team members are displayed in a list that supports drag-and-drop reordering. Each entry shows the member's photo, name, role, and active status.

#### Creating / Editing a Team Member

Click **Add Team Member** or click an existing member to expand their editor.

##### Team Member Fields

| Field | Description |
|-------|-------------|
| **Name** | Full name (required) |
| **Role** | Job title or role (required) |
| **Bio** | Full biography in HTML format. Uses the HTML editor toolbar. Click **AI Generate** to have AI write a bio based on the name and role. |
| **Excerpt** | Short summary for the homepage team section (150 characters recommended) |
| **Photo** | Profile photo (upload) |
| **Years of Service** | Number of years with the company |
| **Certifications** | Tag-style input for certifications (e.g., "IDA Certified", "PPF Specialist"). Type a certification and press Enter to add it as a tag. |
| **Slug** | URL-safe identifier, auto-generated from the name |
| **Active** | Toggle to show or hide the team member on the website |

#### Reordering

Drag team members by the grip handle to change their display order on the website.

---

### 7.15 Credentials

Navigate to **Admin** →**Website** →**Credentials** to manage the business certifications, awards, and credentials displayed on the website.

#### Credentials List

Credentials are displayed in a list that supports drag-and-drop reordering. Each entry shows the credential title, image/badge, and active status.

#### Creating / Editing a Credential

Click **Add Credential** or click an existing credential to expand its editor.

##### Credential Fields

| Field | Description |
|-------|-------------|
| **Title** | Credential name (required) — e.g., "IDA Certified Detailer", "5-Star Google Rating" |
| **Description** | Detailed description in HTML format. Uses the HTML editor toolbar. Click **AI Generate** to have AI write a description based on the title. |
| **Image** | Badge or logo image (upload) |
| **Active** | Toggle to show or hide the credential on the website |

#### Reordering

Drag credentials by the grip handle to change their display order on the website.

---

### 7.16 Homepage Settings

Navigate to **Admin** →**Website** →**Homepage** to configure content that appears on the homepage.

#### CTA Defaults

The Call-to-Action defaults section controls the CTA block displayed on the homepage:

| Field | Description |
|-------|-------------|
| **Title** | CTA heading text |
| **Description** | CTA body text |
| **Button Text** | CTA button label |
| **Before Image** | Image shown on the left/before side of the CTA |
| **After Image** | Image shown on the right/after side of the CTA |

#### Section Content

Controls text content for various homepage sections:

| Field | Description |
|-------|-------------|
| **Services Description (Homepage)** | Introductory text for the services section on the homepage |
| **Services Description (Listing Page)** | Introductory text for the services listing page (`/services`) |
| **Team Section Heading** | Heading for the team members section |
| **Credentials Section Heading** | Heading for the credentials section |

#### Differentiators

A list of "Why Choose Us" differentiators displayed on the homepage. Each differentiator has:

| Field | Description |
|-------|-------------|
| **Icon** | Selected from a set of 17 Lucide icons |
| **Title** | Short title (e.g., "Mobile Service") |
| **Description** | Brief description of the differentiator |

Differentiators can be added, removed, and reordered by dragging.

#### Google Reviews

| Field | Description |
|-------|-------------|
| **Google Place ID** | The Google Maps Place ID for the business. This enables the Google Reviews widget on the homepage, which automatically pulls and displays recent reviews. |

---


---

## 8. Online Store

The online store allows customers to browse and purchase products through the public website. It includes a full e-commerce flow — product catalog, shopping cart, checkout with Stripe payment, shipping via Shippo, and order management in the admin.

This chapter covers product management, inventory tracking, the customer shopping experience, checkout, order fulfillment, shipping configuration, and coupons.

---

### 8.1 Online Store Overview

The online store operates alongside the POS but serves a different channel:

| Aspect | Online Store | POS |
|--------|-------------|-----|
| **Channel** | Website (self-service) | In-person (staff-operated) |
| **Products** | Only products with `show_on_website` enabled | All active products |
| **Services** | Not sold online (booking flow is separate) | Full service catalog |
| **Payment** | Stripe (card only) | Stripe Terminal, cash, check |
| **Fulfillment** | Shipping or local pickup | Immediate in-person |
| **Order numbers** | `WO-XXXXX` prefix (e.g., WO-10001) | `SD-XXXXX` prefix |

#### How It Works

1. Customers browse products on the public website by category
2. They add items to a cart (persisted in browser local storage)
3. At checkout, they provide contact info, choose shipping or pickup, and pay via Stripe
4. The system creates a pending order, then assigns an order number after payment succeeds
5. Staff fulfills the order from the admin (ship or prepare for pickup)
6. Automated emails notify the customer at each fulfillment stage

---

### 8.2 Product Management

Navigate to **Admin** → **Catalog** → **Products** to manage the product catalog.

#### Products List

The product list displays all products in a sortable, filterable table.

**Header:** Shows total product count and a warning banner if any active products are missing images.

**Filters:**

| Filter | Options |
|--------|---------|
| **Search** | Name or SKU (case-insensitive) |
| **Category** | All Categories, or a specific product category |
| **Vendor** | All Vendors, or a specific vendor |
| **Stock** | All Stock, In Stock, Low Stock, Out of Stock |
| **Show Inactive** | Toggle to include deactivated products |

**Table columns:**

| Column | Description |
|--------|-------------|
| **Image** | Product thumbnail or placeholder icon |
| **Name** | Clickable link to the edit page |
| **SKU** | Monospaced text |
| **Category** | Product category name |
| **Vendor** | Vendor name |
| **Price** | Retail price |
| **Cost** | Cost price (permission-gated: `inventory.view_costs`) |
| **Margin** | Percentage margin, color-coded: green (>40%), yellow (20–40%), red (<20%) |
| **Stock** | Current quantity — clickable to open the quick adjust dialog |
| **Reorder At** | Reorder threshold |
| **Status** | Active indicator or "Inactive" badge with reactivate button |

**Quick Stock Adjust:** Click any stock number to open a dialog where you can add or subtract inventory with an optional reason. The adjustment is recorded in stock history.

#### Creating a Product

Click **Add Product** to open the creation form.

| Field | Required | Description |
|-------|----------|-------------|
| **Product Name** | Yes | Display name |
| **SKU** | No | Stock keeping unit identifier |
| **Description** | No | Product description |
| **Category** | No | Product category |
| **Vendor** | No | Supplier/vendor |
| **Cost Price** | Yes | Wholesale cost |
| **Retail Price** | Yes | Selling price |
| **Quantity on Hand** | No | Starting stock level |
| **Reorder Threshold** | No | Stock level that triggers low-stock alerts |
| **Min Order Qty** | No | Minimum quantity to order from vendor |
| **Barcode** | No | UPC or EAN barcode |
| **Taxable** | — | Whether tax applies (default: yes) |
| **Loyalty Eligible** | — | Whether purchase earns loyalty points (default: yes) |
| **Image** | No | Single image upload on creation |

After creation, the product is active by default.

#### Editing a Product

The edit page includes everything from creation plus:

- **Active/Inactive toggle** — Live-updates immediately (not tied to the save button). Inactive products are hidden from the POS catalog and website.
- **Multiple images** — Upload, remove, reorder, and set a primary image. Each image supports alt text for accessibility and SEO.
- **Sale pricing** — See [Section 8.2.1](#821-sale-pricing) below.
- **Cost & margin analysis** — Shows cost, retail, margin percentage, and cost history from purchase orders (permission-gated).

**Deleting a product** performs a soft-delete (deactivates it). The product remains in the database for historical records.

#### 8.2.1 Sale Pricing

Each product can have a sale price with optional scheduling.

**Discount types:**

| Type | How It Works |
|------|-------------|
| **Percentage off** | Reduces the retail price by a percentage |
| **Fixed amount off** | Subtracts a dollar amount from the retail price |
| **Direct price** | Sets an explicit sale price |

**Additional fields:**

- **Start Date** — When the sale begins (defaults to now)
- **End Date** — When the sale ends (optional)

**Sale status indicators:**

| Status | Meaning |
|--------|---------|
| **Active** | Sale is currently running |
| **Scheduled** | Sale has a future start date |
| **Expired** | Sale end date has passed |

The product page shows a preview of the sale: original price struck through, sale price in green, percentage saved, and dollar amount saved.

#### Product Categories

Navigate to **Admin** → **Catalog** → **Categories** and select the **Product Categories** tab.

Each category has:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Category display name |
| **Slug** | Yes | URL-friendly identifier (auto-generated from name) |
| **Description** | No | Category description |
| **Display Order** | No | Sort order (lower numbers appear first) |

Categories cannot be deleted if they have linked products. Deleting a category with no linked products performs a soft-delete.

---

### 8.3 Inventory Management

The inventory system tracks stock levels, records all stock movements, manages vendors, and supports purchase orders.

#### Stock Levels

Every product has a `quantity_on_hand` field. Stock is automatically decremented when orders are paid and restored when refunds are processed.

**Stock status indicators:**

| Indicator | Condition |
|-----------|-----------|
| **In Stock** (green) | Quantity > 0 and above reorder threshold |
| **Low Stock** (yellow) | Quantity > 0 but at or below reorder threshold |
| **Out of Stock** (red) | Quantity = 0 |

#### Stock History

Navigate to **Admin** → **Inventory** → **Stock History** to view a chronological log of all stock movements.

**Adjustment types:**

| Type | Description | Badge Color |
|------|-------------|-------------|
| **Manual** | Staff-initiated adjustment | Gray |
| **PO Received** | Stock received from a purchase order | Green |
| **Sold** | Deducted by a completed sale | Blue |
| **Returned** | Restored by a refund | Yellow |
| **Damaged** | Written off as damaged | Red |
| **Recount** | Physical inventory recount | Gray |

Each entry shows the product, change amount (positive or negative), before/after stock levels, reason, reference (e.g., linked purchase order), and the staff member who made the change. Results are paginated at 50 per page.

#### Manual Stock Adjustments

There are two ways to adjust stock manually:

1. **From the product list** — Click the stock number on any product row to open the quick adjust dialog
2. **From the product edit page** — Update the quantity on hand field

Both methods record the adjustment in stock history with the reason you provide.

#### Low Stock Alerts

A cron job runs daily at 8:00 AM PST and sends email alerts when products need attention:

- **Low stock** — Active products where `quantity_on_hand` is at or below the `reorder_threshold`
- **Out of stock** — Active products with `quantity_on_hand` of 0

The alert email lists each product with its name, SKU, current stock, reorder threshold, vendor, and status. It includes a link to the products page filtered to low-stock items.

**Anti-spam protection:** Products are only re-alerted when their stock level changes or after 7 days have passed since the last alert.

**Recipients:** Emails go to staff configured in **Admin** → **Settings** → **Notifications** with the `low_stock` notification type. If none are configured, the business email is used as a fallback.

#### Purchase Orders

Navigate to **Admin** → **Inventory** → **Purchase Orders** to create and track orders from vendors.

##### Purchase Order Statuses

| Status | Meaning | Badge Color |
|--------|---------|-------------|
| **Draft** | Created but not yet submitted | Gray |
| **Ordered** | Submitted to vendor, awaiting delivery | Blue |
| **Received** | All items received | Green |
| **Cancelled** | Order was cancelled | Red |

##### Creating a Purchase Order

1. Click **New Purchase Order**
2. Select a vendor from the dropdown
3. Search for products to add — results are filtered by the selected vendor
4. For each product added, set the quantity and unit cost (defaults to the product's cost price and minimum order quantity)
5. Click **Save as Draft** to save without submitting, or **Create & Submit** to create with "Ordered" status

##### Receiving Stock

When a shipment arrives:

1. Open the purchase order and click **Receive Items**
2. Enter the quantity received for each line item (or click **Fill All** to receive everything)
3. Click **Confirm Receive**

The system updates product stock levels, records stock history entries of type "PO Received", and marks the PO as "Received" if all items are fully received. Partial receives are supported — you can receive items in multiple batches.

##### Purchase Order Detail

The detail page shows:

- Vendor name and contact
- Total cost and received value
- Line items with ordered vs. received quantities
- Notes
- Status actions (submit, receive, cancel, delete)

#### Vendor Management

Navigate to **Admin** → **Inventory** → **Vendors** to manage suppliers.

**Vendor fields:**

| Field | Required | Description |
|-------|----------|-------------|
| **Vendor Name** | Yes | Company name |
| **Contact Name** | No | Primary contact person |
| **Email** | No | Contact email |
| **Phone** | No | Contact phone |
| **Website** | No | Vendor website URL |
| **Address** | No | Shipping address |
| **Lead Time (days)** | No | Typical delivery time |
| **Min Order Amount ($)** | No | Minimum order value |
| **Notes** | No | Internal notes |

The vendor detail page shows all products from that vendor with stock levels, pricing, margins, and recent purchase order history.

---

### 8.4 Customer Shopping Experience

#### Browsing Products

Customers browse products on the public website at `/products`. Products are organized by category and only products marked as both `is_active` and `show_on_website` appear. Products are sorted by `website_sort_order`, then alphabetically by name.

Each product page shows:

- Product images (with primary image featured)
- Name, price (with sale price if applicable), and description
- Stock availability
- Add to cart controls

#### Add to Cart

The add-to-cart button has four states:

| State | Display | Condition |
|-------|---------|-----------|
| **Available** | "Add to Cart" button | Product is in stock |
| **In Cart** | Green "In Cart (qty)" button | Already added to cart |
| **Max Reached** | Disabled "Max Reached" button | Cart quantity equals available stock |
| **Out of Stock** | Disabled "Out of Stock" button | Stock is zero |

On the product detail page, a quantity selector appears alongside the add-to-cart button. If items are already in the cart, the page shows how many and limits the quantity to remaining stock.

#### Cart Drawer

When a customer adds an item, a slide-in drawer opens from the right side of the screen. The cart drawer provides:

- Item list with thumbnails, names, prices, quantity selectors, and remove buttons
- Subtotal
- "View Cart" and "Checkout" buttons
- "Clear Cart" option

The drawer closes on escape key, backdrop click, or page navigation. It includes accessibility features (focus trap, ARIA attributes, body scroll lock).

#### Cart Page

The full cart page at `/cart` shows:

- All cart items with product images linked to their product pages
- Quantity selectors with stock limits
- Line totals and per-unit prices
- Remove and clear cart options

**Coupon application:** The cart page includes a coupon code input field. Enter a code and click "Apply" to validate it. Applied coupons show as a badge with a remove button. The discount is reflected in the order summary.

**Order summary sidebar:**

- Subtotal
- Discount (green text, when a coupon is applied)
- Tax — "Calculated at checkout"
- Shipping — "Calculated at checkout"
- Estimated Total
- "Proceed to Checkout" button

---

### 8.5 Checkout Flow

The checkout page at `/checkout` guides customers through a three-step process. Form data is saved to session storage, so customers can refresh the page or navigate back without losing their information.

#### Step 1: Information

| Field | Required | Description |
|-------|----------|-------------|
| **Email** | Yes | Order confirmation and updates |
| **First Name** | Yes | Customer name |
| **Last Name** | Yes | Customer name |
| **Phone** | No | Contact number |
| **Customer Notes** | No | Special instructions for the order |

If the customer is logged in, these fields are auto-populated from their profile.

#### Step 2: Fulfillment

The customer chooses between two fulfillment methods:

**Local Pickup:**
- No additional fields required
- Shows the pickup address and any pickup instructions (configured in shipping settings)

**Shipping:**

| Field | Required | Description |
|-------|----------|-------------|
| **Street Address** | Yes | Line 1 |
| **Street Address 2** | No | Suite, unit, etc. |
| **City** | Yes | City |
| **State** | Yes | State |
| **ZIP Code** | Yes | Postal code |

After entering the address:

1. The address is validated via Shippo (non-blocking — validation errors are displayed but do not prevent proceeding)
2. Available shipping rates are fetched from Shippo based on the address, package dimensions, and cart items
3. The customer selects a shipping option

Shipping rate options may include carrier name, service level, estimated delivery time, carrier logo (configurable), and price. Free shipping may appear if the order meets the configured threshold.

#### Step 3: Payment

The payment step uses Stripe's embedded payment element, which handles card entry, validation, and 3D Secure authentication.

The page displays trust badges ("256-bit SSL Encrypted", "PCI DSS Compliant") and a "Powered by Stripe" logo.

The submit button shows the final total: "Place Order — $X.XX".

#### After Payment

On successful payment:

1. The Stripe webhook processes the `payment_intent.succeeded` event
2. An order number is assigned (sequential, starting at WO-10001)
3. Product stock is decremented for each item
4. The customer is redirected to the confirmation page
5. A confirmation email is sent (not implemented as a separate email — the order record serves as confirmation)

#### Guest Checkout

Customers can check out without creating an account. If a logged-in customer checks out, the order is linked to their customer record.

---

### 8.6 Order Management

Navigate to **Admin** → **Orders** to view and manage online store orders.

#### Orders List

**Statistics cards** at the top show:

| Metric | Description |
|--------|-------------|
| **Total Orders** | Count of all orders (excludes cancelled and abandoned) |
| **Revenue** | Sum of paid order totals |
| **Pending Fulfillment** | Count of paid, unfulfilled orders |
| **Orders Today** | Orders created today (PST) |

**Filters:**

| Filter | Options |
|--------|---------|
| **Search** | Order number, customer name, or email |
| **Payment Status** | All, Paid, Pending, Refunded, Partial Refund, Failed |
| **Fulfillment Status** | All, Unfulfilled, Processing, Ready for Pickup, Shipped, Delivered, Cancelled |
| **Date Range** | All Time, Today, Last 7 Days, Last 30 Days, Last 90 Days |

By default, the list hides abandoned checkouts (orders with "pending" or "cancelled" payment status). These only appear when you explicitly filter by those payment statuses.

**Table columns:**

| Column | Description |
|--------|-------------|
| **Order** | Monospaced order number (e.g., WO-10001) |
| **Customer** | Name and email (name links to customer profile if linked) |
| **Items** | Item count |
| **Total** | Order total |
| **Payment** | Status badge |
| **Fulfillment** | Status badge |
| **Date** | Order date (PST) |

Results are paginated at 20 per page.

#### Payment Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Pending** | Payment not yet completed (abandoned checkout) | Yellow |
| **Paid** | Payment received via Stripe | Green |
| **Failed** | Payment attempt failed | Red |
| **Refunded** | Full refund processed | Gray |
| **Partial Refund** | Partial refund processed | Gray |

#### Fulfillment Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Unfulfilled** | Order received, not yet processed | Yellow |
| **Processing** | Staff is preparing the order | Blue |
| **Ready for Pickup** | Order is ready for customer pickup | Blue |
| **Shipped** | Order has been shipped with carrier | Blue |
| **Delivered** | Order has been delivered | Green |
| **Cancelled** | Order was cancelled | Red |

#### Order Detail Page

Click any order to view its full details. The page is organized into two columns.

**Left column:**

- **Order Items** — Product images, names, unit prices, quantities, and line totals
- **Payment Summary** — Subtotal, discount (with coupon code if used), tax, shipping, and total. Includes a "View in Stripe" link to the Stripe dashboard.
- **Fulfillment** — Status dropdown, carrier name, tracking number, tracking URL (for shipping orders). Shows the shipping address or a pickup notice.
- **Activity Timeline** — Chronological list of all order events (created, payment received, fulfillment updates, refunds, notes, tracking updates)

**Right column:**

- **Customer** — Name, email, phone, and a link to their profile
- **Order Summary** — Fulfillment method (pickup or shipping), item count, total
- **Notes** — Customer notes (read-only) and internal notes (editable)

#### Fulfilling an Order

To fulfill an order:

1. Open the order detail page
2. Update the **Fulfillment Status** dropdown:
   - Set to **Processing** when you begin preparing the order
   - Set to **Ready for Pickup** if the customer will pick it up
   - Set to **Shipped** if mailing it — add the carrier, tracking number, and tracking URL
   - Set to **Delivered** when confirmed delivered
3. Click **Save Fulfillment**

**Automated emails** are sent on fulfillment status changes:

| Status Change | Email Sent |
|---------------|-----------|
| Ready for Pickup | Pickup ready email with business location |
| Shipped | Shipped email with tracking information |
| Delivered | Delivery confirmation email |

#### Processing Refunds

To refund an order, click **Issue Refund** in the order header (only available for paid or partially refunded orders).

**Refund options:**

| Type | Description |
|------|-------------|
| **Full Refund** | Refunds the entire order total |
| **Partial Refund** | Refunds a specific dollar amount |

Both types accept an optional reason.

When a refund is processed:

1. A Stripe refund is created against the original payment intent
2. The order's payment status updates to "Refunded" or "Partial Refund"
3. Product stock is restored for each order item
4. A refund email is sent to the customer (mentions 5–10 business day processing time)
5. The refund event is recorded in the order's activity timeline

---

### 8.7 Shipping Configuration

Navigate to **Admin** → **Settings** → **Shipping** to configure shipping.

#### Shippo API Setup

| Field | Description |
|-------|-------------|
| **API Mode** | Toggle between Test and Live mode |
| **Test API Key** | Shippo test API key (`shippo_test_...`) |
| **Live API Key** | Shippo live API key (`shippo_live_...`) |
| **Test Connection** | Verifies the API key works |

#### Ship-From Address

The origin address used for all shipping rate calculations and labels:

| Field | Required |
|-------|----------|
| **Name** | Yes |
| **Company** | No |
| **Street Address** | Yes |
| **Street Address 2** | No |
| **City** | Yes |
| **State** | Yes |
| **ZIP Code** | Yes |
| **Phone** | No |
| **Email** | No |

A **Validate Address** button checks the address against Shippo's validation service.

#### Default Package Dimensions

Fallback dimensions used when products do not have their own shipping dimensions:

| Field | Default |
|-------|---------|
| **Length** | 10 |
| **Width** | 8 |
| **Height** | 4 |
| **Dimension Unit** | Inches or centimeters |
| **Weight** | 1 |
| **Weight Unit** | Pounds, ounces, kilograms, or grams |

#### Carrier Preferences

Click **Load Carriers** to fetch available carrier accounts from Shippo (e.g., USPS, UPS, FedEx). Enable or disable specific carriers with checkboxes.

**Service Level Filter:** Optionally restrict which service levels appear at checkout. Supports 14 common service levels across USPS, UPS, and FedEx (e.g., USPS Priority Mail, UPS Ground, FedEx 2Day).

#### Pricing & Fees

| Setting | Description |
|---------|-------------|
| **Free Shipping** | Toggle + minimum order threshold. Orders above the threshold get a free "Free Standard Shipping" option. |
| **Flat Rate Shipping** | Toggle + fixed amount. Overrides live carrier rates with a single flat rate option. |
| **Handling Fee** | None, flat fee (cents), or percentage. Added to each shipping rate shown to customers. |

#### Display Preferences

| Setting | Description |
|---------|-------------|
| **Show Estimated Delivery** | Display estimated delivery dates alongside shipping options |
| **Show Carrier Logos** | Display carrier logos next to shipping options at checkout |
| **Sort Shipping Options By** | Price (cheapest first) or Speed (fastest first) |

#### Local Pickup

| Setting | Description |
|---------|-------------|
| **Enable Local Pickup** | Allow customers to select pickup instead of shipping |
| **Pickup Address** | Address shown to customers who choose pickup |
| **Pickup Instructions** | Additional instructions (e.g., hours, entrance location) |

---

### 8.8 Coupons & Discounts

Navigate to **Admin** → **Marketing** → **Coupons** to manage discount codes.

#### Coupons List

The list shows all coupons with inline controls:

| Column | Description |
|--------|-------------|
| **Name** | Coupon name (clickable link) |
| **Code** | Coupon code (monospaced). "Auto-Generated" if system-generated. |
| **Discount** | Summary of rewards (e.g., "20% off", "Free", "$10 off") |
| **Status** | Clickable badge to toggle between Active and Disabled |
| **Auto-Apply** | Clickable badge to toggle auto-apply at POS |
| **Used / Limit** | Usage count vs. maximum uses |
| **Expires** | Expiration date or "Never" |

**Filters:** Search by name or code, filter by status (All, Draft, Active, Expired, Disabled).

#### Creating a Coupon

Click **Create Coupon** to open a six-step wizard:

##### Step 1: Basics

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Descriptive name for the coupon |
| **Auto-generate code** | — | Checkbox (default: on). Generates an 8-character alphanumeric code. |
| **Coupon Code** | If auto-generate is off | Custom code (forced uppercase) |
| **Auto-apply at POS** | — | When enabled, automatically applies at POS when conditions are met |

##### Step 2: Targeting (Who)

Three targeting options:

| Option | Description |
|--------|-------------|
| **Everyone** | No restrictions |
| **Specific Customer** | Search and assign to one customer |
| **Customer Group** | Filter by customer tags with match mode (Any = OR, All = AND) |

**Customer type restriction** (optional): Limit to Enthusiast, Professional, or Unknown customer types. Enforcement behavior depends on the coupon enforcement setting (see [Section 8.8.3](#883-coupon-enforcement)).

A live **Eligible Customers** counter updates as you adjust targeting.

##### Step 3: Conditions (If)

Optional conditions that must be met before the coupon can be used:

| Condition | Description |
|-----------|-------------|
| **Required Products** | Cart must contain specific products or products from a category |
| **Required Services** | Cart must contain specific services or services from a category |
| **Minimum Purchase** | Minimum subtotal amount |
| **Maximum Customer Visits** | Limit by visit count (0 = new customers only) |

When multiple conditions exist, choose **ALL must be met** (AND) or **ANY suffices** (OR).

##### Step 4: Rewards (Then)

Define one or more discount rewards per coupon:

| Field | Options |
|-------|---------|
| **Applies To** | Entire Order, Specific Product, or Specific Service |
| **Discount Type** | Percentage Off, Dollar Amount Off, or Free |
| **Value** | Percentage or dollar amount (not needed for "Free") |
| **Max Discount** | Cap for percentage discounts (optional) |

Multiple rewards can be added to a single coupon (e.g., 20% off a product AND free service).

##### Step 5: Limits

| Field | Description |
|-------|-------------|
| **Expiration Date** | When the coupon expires (optional) |
| **Single Use per Customer** | Each customer can use it only once (default: yes) |
| **Maximum Total Uses** | Total usage cap across all customers (optional) |

##### Step 6: Review

Summary of all settings. Click **Create Coupon** to activate it.

**Draft auto-save:** The wizard silently saves as a draft on every step navigation. You can leave and resume editing any draft coupon later.

#### 8.8.1 Coupon Types

Coupons support three discount types, each applicable to orders, products, or services:

| Discount Type | Behavior |
|---------------|----------|
| **Percentage Off** | Reduces price by a percentage. Optionally capped by a max discount amount. |
| **Dollar Amount Off** | Subtracts a fixed dollar amount. Cannot exceed the item price. |
| **Free** | Makes the target item free (100% discount). |

#### 8.8.2 Coupon Statuses

| Status | Description |
|--------|-------------|
| **Draft** | Work in progress, not yet usable |
| **Active** | Available for use |
| **Disabled** | Manually deactivated (can be re-enabled) |
| **Expired** | Past the expiration date (computed, not stored) |

#### 8.8.3 Coupon Enforcement

Navigate to **Admin** → **Settings** → **Coupon Enforcement** to control how customer type restrictions are handled at the POS.

| Mode | Behavior |
|------|----------|
| **Soft** (Recommended) | Coupon is applied but a warning toast is shown to the cashier |
| **Hard** | Coupon is rejected entirely if the customer type does not match |

This setting only affects coupons with a customer type restriction (e.g., "Enthusiast Only").

#### Coupon Detail Page

The coupon detail page shows:

- **Code** — Inline editable
- **Status** — Toggle switch to activate or disable. Re-enabling an expired coupon prompts you to update the expiration date.
- **Auto-Apply** — Toggle switch
- **Targeting** — Who can use the coupon
- **Conditions** — Requirements that must be met
- **Rewards** — Discount details
- **Limits** — Expiration, single use, max uses
- **Performance** — Times used, revenue attributed, top customers
- **Summary** — Auto-generated plain-English description of the coupon. Can be regenerated or manually edited.

#### Coupon Usage at Checkout

When a customer applies a coupon code during online checkout (on the cart page or at checkout), the system validates:

1. Code exists and is active
2. Not expired
3. Usage limits not exceeded
4. Single-use per customer check
5. Customer targeting matches
6. Cart conditions are met (required items, minimum purchase, visit count)

If validation passes, the discount is calculated and shown in the order summary. The discount is reflected in the Stripe payment intent amount.

---


---

## 9. Marketing

The marketing system handles customer outreach through SMS and email. It includes one-time campaigns, automated lifecycle sequences, two-way SMS messaging with an AI auto-responder, coupon distribution, promotions (sale pricing), compliance tracking, and analytics.

This chapter covers campaigns, automations, promotions, messaging, analytics, TCPA compliance, and Google review solicitation.

---

### 9.1 Marketing Overview

Navigate to **Admin** → **Marketing** to reach the marketing hub. The hub shows quick stats (active coupons, campaigns this month, active automations) and links to each section.

#### Marketing Sections

| Section | Purpose |
|---------|---------|
| **Campaigns** | One-time SMS/email blasts to targeted audiences |
| **Automations** | Automated lifecycle sequences triggered by customer activity |
| **Coupons** | Discount codes (see [Chapter 8, Section 8.8](./08-online-store.md#88-coupons--discounts)) |
| **Promotions** | Sale pricing across services and products |
| **Analytics** | Cross-campaign performance metrics |
| **Compliance** | SMS/email consent audit log |

#### Feature Flags

Marketing channels are controlled by feature flags in **Admin** → **Settings** → **Feature Toggles**:

| Flag | Controls |
|------|----------|
| **SMS Marketing** | All outbound marketing SMS (campaigns + automations) |
| **Email Marketing** | All outbound marketing email |
| **Two-Way SMS** | Messaging inbox and AI auto-responder |
| **Google Review Requests** | Review solicitation automation |

Disabling a flag prevents that channel from sending. Campaigns using a disabled channel show a warning in the wizard but can still be created (they will send once the flag is re-enabled).

#### SMS vs. Email

| Channel | Strengths | Considerations |
|---------|-----------|----------------|
| **SMS** | High open rate, immediate delivery | Character limits (160/segment), TCPA compliance required, per-message cost |
| **Email** | Rich content, no per-message cost | Lower open rate, spam filter risk |
| **Both** | Maximum reach | Customers receive on whichever channel they have consented to |

---

### 9.2 Campaigns

Navigate to **Admin** → **Marketing** → **Campaigns** to create and manage campaigns.

#### Campaign List

**Header:** Shows total campaign count and a **Create Campaign** button.

**Filters:** Status (All, Draft, Scheduled, Sent, Cancelled) and Channel (All, SMS, Email, SMS + Email).

**Table columns:**

| Column | Description |
|--------|-------------|
| **Name** | Campaign name (clickable link) |
| **Channel** | SMS, Email, or SMS + Email |
| **Status** | Status badge |
| **Recipients** | Number of recipients |
| **Delivered** | Number successfully delivered |
| **Sent** | Date sent |

**Row actions:** Edit/Resume (draft and scheduled only), Duplicate (all campaigns), Delete.

#### Campaign Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Draft** | Work in progress | Gray |
| **Scheduled** | Set to send at a future time | Blue |
| **Sending** | Currently being sent | Yellow |
| **Sent** | Delivery complete | Green |
| **Paused** | Temporarily paused | — |
| **Cancelled** | Campaign was cancelled | Red |

#### Creating a Campaign

The campaign wizard has five steps. Progress is auto-saved as a draft on every step navigation.

##### Step 1: Basics

| Field | Required | Description |
|-------|----------|-------------|
| **Campaign Name** | Yes | Descriptive name |
| **Channel** | Yes | SMS, Email, or SMS + Email |

If a selected channel's feature flag is disabled, a warning banner is shown.

##### Step 2: Audience

Build a targeted audience using these filters:

| Filter | Options |
|--------|---------|
| **Customer Type** | Any, Enthusiast, Professional |
| **Last Service** | Any service, or a specific service |
| **Vehicle Type** | Any, Standard, Motorcycle, RV, Boat, Aircraft |
| **Days Since Last Visit (min)** | Minimum days since last appointment |
| **Days Since Last Visit (max)** | Maximum days since last appointment |
| **Minimum Lifetime Spend** | Minimum total spend |

Click **Preview Audience** to see how many customers match and how many have the required consent for the selected channel. If customers match but none have consent, an amber warning explains the issue.

**Consent enforcement:** SMS requires `sms_consent = true` and a phone number. Email requires `email_consent = true` and an email address. "Both" requires at least one.

##### Step 3: Message

**SMS template fields (when SMS or Both):**

| Field | Description |
|-------|-------------|
| **SMS Message** | Message body with merge field support |

The editor shows a character counter and segment counter (SMS messages over 160 characters are split into multiple segments at 153 characters each).

**Email template fields (when Email or Both):**

| Field | Description |
|-------|-------------|
| **Email Subject** | Subject line with merge field support |
| **Email Body** | Message body with merge field support |

**Template merge fields** are inserted by clicking chips grouped by category:

| Category | Fields |
|----------|--------|
| **Customer Info** | `{first_name}`, `{last_name}` |
| **Business** | `{business_name}`, `{business_phone}`, `{business_address}` |
| **Links** | `{booking_url}`, `{book_url}` (personalized with customer data pre-filled), `{offer_url}` (routes to shop or booking based on coupon target), `{google_review_link}`, `{yelp_review_link}` |
| **Loyalty & History** | `{loyalty_points}`, `{loyalty_value}`, `{visit_count}`, `{days_since_last_visit}`, `{lifetime_spend}` |
| **Coupons** | `{coupon_code}` |

##### A/B Testing

Toggle **Enable A/B Testing** to test two message variants:

1. The original message becomes **Variant A**
2. A new **Variant B** section appears with its own SMS/email fields
3. Set the traffic split: 50/50, 60/40, 70/30, or 80/20
4. Optionally enable **Auto-select Winner** after 24 hours, 48 hours, 72 hours, or 1 week — the variant with the higher click-through rate is declared the winner

Recipients are randomly assigned to variants based on the split percentage.

##### Step 4: Coupon (Optional)

Attach an existing active coupon to the campaign, or create a new one inline. When a coupon is attached, each recipient receives a unique single-use coupon code generated from the template.

The inline coupon creation dialog supports:

- Discount type (percentage, dollar amount, free)
- Target (entire order, specific product, specific service)
- Max discount cap (for percentage type)
- Max uses and expiration
- Single use per customer

##### Step 5: Review & Send

The review step shows a summary of all settings:

- Campaign name, channel, audience counts, coupon info
- A/B testing configuration (if enabled)
- Message template previews

**Preview with Real Customer Data** opens a dialog that renders templates using actual audience member data, letting you see exactly what recipients will receive. Navigate through up to 50 sample customers.

**Sending options:**

| Option | Description |
|--------|-------------|
| **Send Now** | Sends immediately to all eligible recipients |
| **Schedule** | Set a future date/time and click "Schedule Now" |

#### Campaign Detail Page

After sending, the detail page shows:

- **Info cards:** Channel, status, sent date, created date
- **Performance metrics:** Recipients, delivered, opened, clicked, redeemed, revenue
- **Message previews:** SMS and/or email templates
- **Recipients table:** Customer name, contact info, channel, delivery status, open/click tracking, coupon code, sent date (paginated at 20 per page)

Click **View Analytics** for deeper campaign analysis.

#### Campaign Analytics

The analytics page (available for sent campaigns) includes:

- **Summary KPI cards** — Key performance indicators
- **Delivery funnel** — Visual breakdown from sent to delivered to opened to clicked
- **Variant comparison** — Side-by-side A/B test results (if applicable)
- **Click details** — Clicks by URL and recent click activity
- **Engagement timeline** — When engagement occurred over time
- **Recipient table** — Filterable, paginated list of all recipients with delivery details

---

### 9.3 Automations (Lifecycle Engine)

Navigate to **Admin** → **Marketing** → **Automations** to create automated messaging sequences.

#### How It Works

The lifecycle engine is a cron job that runs every 10 minutes. It operates in two phases:

1. **Schedule** — Scans for recent events (completed appointments, transactions) and creates pending executions with a scheduled delivery time (event time + configured delay)
2. **Execute** — Sends messages for any pending executions whose scheduled time has arrived

**Deduplication:** The engine prevents duplicate sends at two levels:
- **Source-level:** Same appointment/transaction + rule combination is never processed twice
- **Customer-level:** Same customer + rule combination is not repeated within 30 days

#### Automation List

The list shows all lifecycle rules with inline active/inactive toggles.

| Column | Description |
|--------|-------------|
| **Name** | Rule name (clickable link) |
| **Trigger** | Trigger condition |
| **Delay** | Time delay before sending ("Immediate" or days/minutes) |
| **Action** | Channel badge (SMS, Email, SMS + Email) |
| **Service** | Specific service or "Any" |
| **Coupon** | Attached coupon name or dash |
| **Active** | Toggle switch |

#### Creating an Automation

Click **Create Rule** to open the automation form.

**Trigger card:**

| Field | Required | Description |
|-------|----------|-------------|
| **Rule Name** | Yes | Descriptive name |
| **Description** | No | Optional description |
| **Trigger Condition** | Yes | What event starts the automation |
| **Trigger Service** | No | Limit to a specific service or "Any" |
| **Delay** | No | Days and minutes to wait before sending |
| **Chain Order** | No | Order in multi-step sequences |

**Available trigger conditions:**

| Trigger | Description |
|---------|-------------|
| **After Service** | Fires when an appointment is completed |
| **After Transaction** | Fires when a POS checkout is completed |
| **No Visit (Days)** | Fires when a customer hasn't visited for N days |
| **Birthday** | Fires on the customer's birthday |

**Action card:**

| Field | Required | Description |
|-------|----------|-------------|
| **Send Via** | Yes | SMS, Email, or SMS + Email |
| **SMS Template** | If SMS | Message body with merge fields |
| **Email Subject** | If Email | Subject line with merge fields |
| **Email Body** | If Email | Message body with merge fields |

Automation templates support all the same merge fields as campaigns, plus additional **Event Context** fields:

| Field | Description |
|-------|-------------|
| `{service_name}` | Name of the service that triggered the automation |
| `{vehicle_info}` | Customer's vehicle description |
| `{appointment_date}` | Date of the triggering appointment |
| `{appointment_time}` | Time of the triggering appointment |
| `{amount_paid}` | Transaction amount |

**Coupon card (optional):** Attach an active coupon. When triggered, the system generates a unique single-use code for each recipient.

**Options card:**

- **Active** — Enable immediately on creation
- **Vehicle-aware** — Include vehicle info in messages

#### Execution Flow

When the lifecycle engine fires for a rule:

1. Checks if the SMS Marketing feature flag is enabled (keeps executions pending if disabled)
2. Skips if the rule has been deactivated or deleted
3. Skips if the customer has no phone or has revoked SMS consent
4. Resolves all template variables (customer data, business info, loyalty points, event context)
5. Generates a unique coupon code if a coupon is attached
6. Sends the message via the configured channel
7. Records the execution status

**Execution statuses:**

| Status | Meaning |
|--------|---------|
| **Pending** | Scheduled, waiting for delivery time |
| **Sent** | Successfully delivered |
| **Failed** | Delivery failed (error recorded) |
| **Skipped** | Skipped (rule deactivated, consent revoked, etc.) |

---

### 9.4 Promotions

Navigate to **Admin** → **Marketing** → **Promotions** to manage sale pricing across services and products. This is separate from coupon codes — promotions are direct price reductions that apply automatically.

#### Promotions Page

**Filters:**

| Filter | Options |
|--------|---------|
| **Search** | Service or product name |
| **Type** | All, Services, Products |
| **Status** | All, Active, Scheduled, Expired, No Sale |

**Summary cards** show counts of Active, Scheduled, and Expired sales.

Items are grouped by status in collapsible sections. Each row shows the item type (service or product), name, pricing by tier (sedan, truck/SUV, SUV/van) with original price struck through and sale price in green, end date, and action buttons.

#### Sale Status Values

| Status | Meaning |
|--------|---------|
| **Active** | Sale is currently running |
| **Scheduled** | Sale has a future start date |
| **Expired** | Sale end date has passed |
| **No Sale** | No sale pricing configured |

#### Quick Sale

Click **Quick Sale** to apply sale pricing to multiple items at once:

1. **Select Items** — Search and select services and/or products
2. **Discount** — Choose percentage off or fixed amount off, then enter the value
3. **Apply to Tiers** (services only) — Choose which pricing tiers to apply the discount to (Sedan, Truck/SUV, SUV/Van)
4. **Sale Period** — Set start and end dates
5. **Preview** — Review before/after prices for all selected items

The preview flags "invalid" entries where the sale price would be zero or exceed the original price.

#### Ending a Sale

Click the red X button on any active or scheduled sale to clear all sale prices and dates for that item.

---

### 9.5 Two-Way SMS Messaging

Navigate to **Admin** → **Messaging** to access the SMS inbox. Requires the `two_way_sms` feature flag to be enabled.

#### Messaging Inbox

The inbox uses a two-panel layout:

- **Left panel:** Conversation list with search, status filter pills (Open, Closed, Archived with counts), and real-time updates via Supabase Realtime
- **Right panel:** Active conversation thread with message history

Conversations are sorted by most recent message. Each conversation shows the customer name (or phone number for unknown senders) and a preview of the latest message.

#### Conversation Statuses

| Status | Meaning |
|--------|---------|
| **Open** | Active conversation |
| **Closed** | Resolved (auto-closes after configurable inactivity period) |
| **Archived** | Archived (auto-archives after configurable period) |

#### Sending Messages

Type a message in the compose field and send. Messages are sent via Twilio and appear immediately in the thread (optimistic rendering). Delivery status is tracked.

#### AI Auto-Responder

When enabled, the AI assistant automatically replies to inbound SMS messages. The AI uses Claude to generate responses based on:

- Your business's service catalog with pricing
- Active coupons and promotions
- Business hours and contact info
- Conversation history (last 20 messages)
- Customer context (name, transaction history) for returning customers
- Product catalog (activated by keyword detection)

**Business hours behavior:**

| Caller Type | During Hours | After Hours |
|-------------|-------------|-------------|
| **Unknown numbers** | AI responds (configurable) | AI always responds |
| **Known customers** | AI responds (configurable) | AI always responds |

The AI keeps messages under 160 characters, asks only 1–2 questions per message, and uses a casual, friendly tone. It never makes up pricing — it only quotes prices from the service catalog.

#### Messaging Settings

Navigate to **Admin** → **Settings** → **Messaging** to configure:

**AI Assistant:**

| Setting | Description |
|---------|-------------|
| **Enable AI Assistant** | Master toggle for AI auto-responses |
| **Unknown numbers (business hours)** | Whether AI responds to unknown callers during open hours |
| **Customers (business hours)** | Whether AI responds to known customers during open hours |
| **AI Prompt** | Custom behavioral instructions for the AI. Service catalog and business info are appended automatically. |

Click **Apply Standard Template** to reset the AI prompt to the default.

**Conversation Lifecycle:**

| Setting | Options |
|---------|---------|
| **Auto-close after** | 24 hours, 48 hours, 72 hours, 1 week, 2 weeks, Never |
| **Auto-archive after** | 7 days, 14 days, 30 days, 60 days, 90 days, Never |

---

### 9.6 Analytics Dashboard

Navigate to **Admin** → **Marketing** → **Analytics** for a cross-campaign performance overview.

#### Period Selector

All metrics are scoped to a selectable time period (default: 30 days).

#### Overview KPIs

| Metric | Description |
|--------|-------------|
| **Total SMS Sent** | SMS messages sent in the period |
| **Total Email Sent** | Emails sent in the period |
| **SMS Delivery Rate** | Percentage of SMS successfully delivered |
| **Email Delivery Rate** | Percentage of emails successfully delivered |
| **Overall Delivery Rate** | Combined delivery rate across channels |
| **Click-Through Rate** | Percentage of delivered messages that were clicked |
| **Opt-Out Rate** | Percentage of recipients who opted out |
| **Revenue Attributed** | Revenue attributed to marketing activity |

#### Channel Comparison

Side-by-side SMS vs. Email comparison showing: sent, delivered, delivery rate, clicked, click rate, opted out, and estimated cost (SMS at $0.0079 per message).

#### Performance Tables

The dashboard includes five data sections:

| Section | What It Shows |
|---------|---------------|
| **Campaign Performance** | Per-campaign metrics |
| **Automation Performance** | Per-automation metrics |
| **Coupon Performance** | Per-coupon distributed, redeemed, redemption rate, discount given, revenue from orders |
| **Audience Health** | Consent and engagement metrics |
| **A/B Test Results** | Variant-level comparison with winner designation |

---

### 9.7 TCPA Compliance

The system tracks SMS and email consent to comply with TCPA (Telephone Consumer Protection Act) regulations.

#### Consent Collection

SMS consent is collected at these touchpoints:

| Source | How Consent Is Captured |
|--------|------------------------|
| **Booking form** | Customer checks consent box during online booking |
| **Customer portal** | Customer manages preferences in their account |
| **Inbound SMS** | Responding to a message implies consent |
| **Admin manual** | Staff manually sets consent in the compliance dashboard |

#### Consent Tracking

Every consent change is recorded in the `sms_consent_log` with:

- Customer ID
- Action (opt in or opt out)
- Source (booking form, admin manual, inbound SMS, unsubscribe page, customer portal)
- Keyword (e.g., "STOP" for opt-out)
- Previous and new consent values
- Timestamp

#### Opt-Out Handling

**STOP keyword:** When a customer texts "STOP", their SMS consent is automatically revoked. All marketing SMS includes a "\nReply STOP to unsubscribe" footer appended by the system.

**Unsubscribe page:** Each customer has a unique unsubscribe URL (`/unsubscribe/[customerId]`) included in marketing emails. The page allows customers to manage their preferences:

**Communication channels (toggleable):**
- SMS Messages
- Email Messages

**Notification types:**
- Appointment Reminders — Always on (required, cannot be disabled)
- Service Updates — Always on (required, cannot be disabled)
- Promotions & Offers — Toggleable
- Loyalty Updates — Toggleable

An **Unsubscribe from All** button disables all preferences at once.

#### Compliance Dashboard

Navigate to **Admin** → **Marketing** → **Compliance** to view the consent audit log.

**Summary stats:** SMS Opted In count and Email Opted In count.

**Consent log table:**

| Column | Description |
|--------|-------------|
| **Customer** | Customer name |
| **Channel** | SMS or Email |
| **Action** | Opt In (green badge) or Opt Out (red badge) |
| **Source** | How the consent change occurred |
| **Date** | When the change occurred |

The log shows the 100 most recent consent changes.

**Manual Opt-Out:** Click the **Manual Opt-Out** button to search for a customer and manually revoke their SMS or email consent. The dialog shows the customer's current consent status before you confirm.

#### Marketing vs. Transactional SMS

The system distinguishes between two types of SMS:

| Type | Consent Required | Examples |
|------|-----------------|----------|
| **Marketing** | Yes (sms_consent) | Campaigns, automations, promotions |
| **Transactional** | No | Appointment reminders, service updates, booking confirmations, completion notifications |

Marketing SMS is never sent to customers without explicit consent, regardless of how the message is triggered.

#### Daily Frequency Cap

To prevent over-messaging, the system enforces a daily cap on marketing SMS per customer (default: 5 messages per day, configurable via business settings). This counts both campaign sends and lifecycle automation sends.

---

### 9.8 Google Reviews

The system can automatically request Google reviews from customers after service.

#### How It Works

When the **Google Review Requests** feature flag is enabled:

1. After a service is completed, a lifecycle automation fires (configurable delay, default 30 minutes)
2. The customer receives an SMS with a link to leave a Google review
3. Each customer receives at most one review request per 30 days (enforced by the lifecycle engine's deduplication)

#### Review Settings

Navigate to **Admin** → **Settings** → **Reviews** to configure:

**Review Links:**

| Field | Description |
|-------|-------------|
| **Google Review URL** | Direct link to your Google review page |
| **Yelp Review URL** | Direct link to your Yelp review page |

These URLs are used in the `{google_review_link}` and `{yelp_review_link}` template merge fields.

**Website Review Data:**

| Field | Description |
|-------|-------------|
| **Google Reviews** | Rating and review count (read-only, fetched automatically) |
| **Yelp Reviews** | Rating and review count (manually entered) |

This data is displayed on the public website (trust bar, homepage).

**Google Review Requests:**

The settings page shows whether the feature flag is enabled and links to the automations page where review request rules are managed as lifecycle rules.

---


---

## 10. Accounting & Integrations

This chapter covers how financial data flows through the system, the QuickBooks Online integration for accounting sync, the Transactions list, and the Quotes system.

---

### 10.1 Accounting Overview

Financial data in Smart Details Auto Spa originates from three sources:

| Source | What It Creates | Where It Appears |
|--------|----------------|-----------------|
| POS transactions | Sales receipts, refunds | Admin > Transactions |
| Online store orders | Order payments via Stripe | Admin > Orders |
| Booking deposits | Payment intents via Stripe | Admin > Appointments |

All completed POS transactions can optionally sync to QuickBooks Online for bookkeeping. The sync is one-way — Smart Details is the source of truth; QBO is the accounting layer.

#### What Syncs Automatically vs Manually

| Data | Auto-Sync | Manual Sync |
|------|-----------|-------------|
| POS transactions | Yes — fires in the background after each completed transaction | Yes — "Sync Transactions" button |
| Customers | Configurable — auto-sync can be enabled in QBO settings | Yes — "Sync Customers" button |
| Catalog items (services + products) | No | Yes — "Sync Catalog" button |

When QBO integration is disabled or disconnected, the POS works normally with zero impact. New transactions receive no sync status, and no API calls are made to Intuit.

---

### 10.2 QuickBooks Online Integration

Navigate to **Admin > Settings > Integrations > QuickBooks Online** to manage the QBO connection. The page has three tabs: **Settings**, **Sync**, and **Reports**.

#### 10.2.1 Initial Setup — Connecting QBO

**Prerequisites:**
- An Intuit Developer account at developer.intuit.com
- A QuickBooks Online company (sandbox or production)
- An app created in the Intuit Developer portal with "QuickBooks Online and Payments" scope (`com.intuit.quickbooks.accounting`)
- The app's Client ID and Client Secret set as environment variables (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`)

**Steps to connect:**

1. Go to **Admin > Settings > QuickBooks Online**
2. In the **Connection** card, select the environment — **Sandbox** (for testing) or **Production** (for live accounting)
3. Click **Connect to QuickBooks**
4. A popup window opens showing the Intuit OAuth consent screen
5. Sign in to your QuickBooks account and authorize the connection
6. The popup closes and the page refreshes to show "Connected" status with the company name

The connection status card shows:
- Connection status (Connected / Not Connected)
- Company name (from QBO)
- Environment (Sandbox / Production)
- Last sync timestamp
- A **Disconnect** button (with confirmation dialog)

#### 10.2.2 Account Mapping

After connecting, configure which QBO accounts receive your transaction data:

1. Go to the **Settings** tab
2. Under **Account Mapping**, set:
   - **Income Account** — The QBO income account where revenue is recorded (e.g., "Sales of Product Income" or "Services"). Dropdown loads all QBO accounts of type "Income".
   - **Deposit Account** — The QBO bank account where deposits land (e.g., "Undeposited Funds" or "Business Checking"). Dropdown loads all QBO accounts of type "Bank".
3. Click **Save Settings**

If these accounts are not mapped, transaction syncs will fail. The system validates mapping before attempting any sync.

#### 10.2.3 Sync Settings

Also on the **Settings** tab:

- **Auto-Sync Customers** — Toggle on/off. When enabled, new customers created in the app are automatically pushed to QBO in the background.
- **Auto-Sync Transactions** — Toggle on/off. When enabled, completed POS transactions fire a background sync to QBO immediately after checkout. This is the primary sync mechanism.

Both toggles are saved independently and take effect immediately.

#### 10.2.4 Auto-Sync (Cron)

A cron job runs every 30 minutes (`/api/cron/qbo-sync`) that:

1. Checks if QBO integration is enabled (`qbo_enabled` feature flag + valid tokens)
2. Finds all transactions with `qbo_sync_status = 'pending'` or `NULL` (completed transactions that haven't been synced)
3. Syncs each transaction to QBO as a Sales Receipt
4. Logs every sync attempt to the `qbo_sync_log` table

This catches any transactions that failed real-time sync or were created while QBO was temporarily unavailable. The cron processes transactions in chronological order with a small delay between each to respect QBO rate limits.

#### 10.2.5 Manual Sync

On the **Sync** tab, four sync actions are available:

| Button | What It Does |
|--------|-------------|
| **Sync All** | Syncs unsynced transactions, customers, and catalog items in one batch |
| **Sync Customers** | Pushes all customers without a `qbo_id` to QBO |
| **Sync Transactions** | Pushes all unsynced completed transactions to QBO |
| **Sync Catalog** | Pushes all active services and products without a `qbo_id` to QBO |

Each button shows a loading state while the sync is in progress. When complete, a toast notification shows how many records were synced.

If there are any failed syncs, a **Retry Failed** button appears (red outline). Clicking it re-attempts all transactions with `qbo_sync_status = 'failed'`, processing them one at a time with a 100ms delay.

#### 10.2.6 What Gets Synced

**Customers:**
- Mapped to QBO Customer entities
- Display name: "FirstName LastName"
- Includes email and phone when available
- Duplicate name handling: if a QBO customer with the same name exists, the system appends the customer's phone number or ID as a suffix to avoid the Intuit "duplicate name" error (error 6240)
- Walk-in transactions (no customer) are mapped to a generic "Walk-in Customer" in QBO

**Transactions:**
- Mapped to QBO Sales Receipt entities
- Each line item (service or product) becomes a line on the Sales Receipt
- Coupon discounts become a Discount Line
- Tax is included as a tax line
- Payment method is recorded (card, cash, split)
- $0 transactions are automatically skipped (`qbo_sync_status = 'skipped'`)
- Transaction dates use the `America/Los_Angeles` timezone

**Catalog Items:**
- Services mapped to QBO Items of type "Service"
- Products mapped to QBO Items of type "NonInventory"
- Name and price are synced; descriptions are optional

#### 10.2.7 Sync Log

The lower section of the **Sync** tab shows the full sync history:

**Columns:**
- **Timestamp** — When the sync occurred (local time)
- **Entity** — Badge showing "customer", "service", "product", or "transaction"
- **Action** — "create" or "update"
- **Status** — Badge: green "success", red "failed", or yellow "pending"
- **Source** — "manual" (triggered by button) or "auto" (triggered by cron or POS hook)
- **QBO ID** — The QuickBooks entity ID if successful
- **Duration** — How long the API call took in milliseconds
- **Error** — Error message if the sync failed (truncated, expand for full text)

**Filtering:**
- Status pills: All, Success, Failed, Pending
- Entity type pills: All Types, Customers, Services, Products, Transactions

**Expanding a row** reveals the full request payload, response payload, and error details — useful for debugging sync issues.

**Controls:**
- **Auto-refresh** checkbox — Automatically reloads the log every few seconds
- **Export CSV** — Downloads the entire sync log as a CSV file with columns: Timestamp, Entity Type, Entity ID, Name, Action, Status, Error, QBO ID, Source
- **Clear Log** — Deletes all sync log entries (with confirmation)
- **Load More** — Paginated loading (20 entries at a time)

#### 10.2.8 Retry Failed Syncs

Two retry options:

1. **Retry All Failed** — The "Retry Failed" button on the Sync tab re-processes every transaction with `qbo_sync_status = 'failed'`. Processes sequentially with 100ms delays.
2. **Retry Individual** — Specific transaction retries can be triggered via the API (`POST /api/admin/integrations/qbo/sync/retry` with `{ transactionId }`).

After retry, the sync log updates to show the new attempt's status.

#### 10.2.9 Disconnecting QBO

1. On the **Settings** tab, click the **Disconnect** button
2. Confirm in the dialog: "This will revoke access tokens and disconnect from QuickBooks Online. Your sync history and settings will be preserved. You can reconnect at any time."
3. The OAuth tokens are cleared from the database
4. The connection status returns to "Not Connected"

Existing sync history and account mappings are preserved. If you reconnect later, you can resume syncing from where you left off.

#### 10.2.10 Reports

The **Reports** tab provides a dashboard view of sync health and revenue data. It includes a period selector (7 days, 30 days, 90 days, All Time).

**Sync Health Cards (row 1):**
- **Sync Rate** — Percentage of completed transactions that are synced (color-coded: green > 90%, yellow > 70%, red below)
- **Synced Transactions** — Count of synced out of total
- **Failed** — Count of failed syncs (red if > 0)
- **Last Sync** — Relative time since last sync, with auto-sync timestamp below

**Entity Coverage (row 2):**
Three progress bars showing how many customers, services, and products have been synced to QBO vs total count. Each bar shows "X/Y" with a colored fill.

**Revenue Sync Chart (row 3):**
An area chart showing daily revenue over the selected period. Displays total revenue, synced revenue, and unsynced revenue in the header.

**Recent Sync Activity + Error Summary (row 4):**
Two-column layout:
- **Recent Sync Activity** — Last 20 sync log entries with status badges, action, entity type, source, and relative timestamp
- **Error Summary** — Top 10 most frequent errors, grouped by error pattern with occurrence count and last-seen timestamp

**Export Revenue CSV:**
Button downloads a CSV with: Date, Transaction ID, Receipt, Customer, Amount, Payment Method, QBO Sync Status, QBO ID, Synced At. Up to 5,000 transactions per export.

#### 10.2.11 OAuth Token Lifecycle

- **Access token** — Expires after 1 hour. The `QboClient` automatically refreshes it using the refresh token before making API calls. If the token is within 5 minutes of expiry, it's proactively refreshed.
- **Refresh token** — Expires after 100 days. If it expires, the connection becomes invalid and you must disconnect and reconnect via the Settings tab.
- Tokens are stored in the `business_settings` table (not environment variables) so they can be updated at runtime.

---

### 10.3 Transactions

Navigate to **Admin > Transactions** in the sidebar to view all POS transactions.

#### 10.3.1 Transaction List

The transaction list page shows a searchable, filterable table of all completed transactions.

**Stats Row:**
Four metric cards at the top of the page:

| Card | What It Shows |
|------|--------------|
| **Total Revenue** | Sum of all transaction amounts in the filtered period |
| **Transaction Count** | Number of transactions in the filtered period |
| **Average Transaction** | Total revenue divided by transaction count |
| **Top Payment Method** | Most common payment method used |

**Filters and Search:**
- **Date range picker** — Filter transactions to a specific date range
- **Search** — Search by receipt number, customer name, or transaction ID
- **Payment method filter** — Filter by card, cash, or split payment
- **QBO sync status** — Filter by synced, failed, pending, or not synced

**Table Columns:**
- **Date** — Transaction date and time (PST)
- **Receipt #** — POS receipt number (e.g., "POS #1234")
- **Customer** — Customer name (clickable link to customer detail) or "Walk-in" for anonymous transactions
- **Items** — Count of line items
- **Amount** — Total transaction amount
- **Payment** — Payment method badge (Card, Cash, Split)
- **QBO Status** — Sync status badge if QBO integration is enabled

Clicking a row navigates to the transaction detail view.

#### 10.3.2 Transaction Types

| Type | Description |
|------|------------|
| `sale` | Standard POS sale — services, products, or both |
| `refund` | Partial or full refund of a previous transaction |

#### 10.3.3 How Transactions Relate to Other Entities

- **Jobs** — A transaction is linked to a job via the `job_id` foreign key. When a POS ticket is checked out, a job record is created and the transaction is linked to it.
- **Appointments** — When a job is created from a booked appointment, the appointment's `appointment_id` is carried through to the job, creating an indirect link: Appointment → Job → Transaction.
- **Quotes** — When a quote is converted to a job via the POS, the job's `quote_id` links back to the originating quote. The transaction then links to the job.
- **Orders** — Online store orders have their own payment flow through Stripe Checkout, separate from POS transactions. They appear in Admin > Orders, not in Transactions.

---

### 10.4 Quotes

Quotes are estimates sent to customers before work is performed. Navigate to **Admin > Quotes** in the sidebar.

#### 10.4.1 Quote List

The quote list page shows all quotes with status filters and search.

**Stats Row:**
Four metric cards:

| Card | What It Shows |
|------|--------------|
| **Total Quotes** | Total number of quotes (excluding soft-deleted) |
| **Pending** | Quotes in draft, sent, or viewed status |
| **Booking Rate** | Percentage of quotes that converted to jobs (`converted / total`) |
| **Booked Revenue** | Sum of `total_amount` for all converted quotes |

**Status Filters:**
Pill buttons to filter by status:

| Status | Color | Meaning |
|--------|-------|---------|
| `draft` | Gray | Created but not yet sent to the customer |
| `sent` | Blue | Delivered to the customer via SMS or email |
| `viewed` | Purple | Customer opened the quote link |
| `accepted` | Green | Customer clicked "Accept" on the public quote page |
| `expired` | Orange | Quote passed its `valid_until` date without acceptance |
| `declined` | Red | Customer explicitly declined |
| `converted` | Teal | Quote was converted to a job/appointment |

**Search:** Filters by customer name, quote number, or phone number.

**Table Columns:**
- **Quote #** — Quote number (e.g., "Q-0042"), clickable link to detail
- **Customer** — Customer name (clickable link to customer detail)
- **Vehicle** — Year, make, model
- **Total** — Quote total amount
- **Status** — Status badge (color-coded as above)
- **Date** — Created date
- **Last Contacted** — When the quote was last sent/resent (`sent_at` field)

#### 10.4.2 Quotes Are Read-Only in Admin

All quote creation and editing happens through the POS quote builder. The admin panel provides a read-only view with the ability to:

- View quote details
- See communication history
- Navigate to the POS builder via deep-links for editing

To create a new quote from the admin, click the "New Quote" button which deep-links to `/pos/quotes?mode=builder`. To edit an existing quote, the detail page links to `/pos/quotes?mode=builder&quoteId=<id>`.

#### 10.4.3 Quote Detail Page

Clicking a quote number opens the detail page which shows:

**Header:**
- Quote number, status badge, created date, valid-until date
- Customer name, phone, email
- Vehicle year, make, model, color

**Line Items Table:**
- Item name, tier/variant name if applicable
- Quantity and unit price
- Line total
- Per-item notes

**Totals Section:**
- Subtotal
- Tax amount
- Coupon discount (if applicable)
- Grand total

**Notes:** Free-text notes added during quote creation.

**Communications Tab:**
Shows the full history of quote-related messages:
- SMS messages sent to the customer (with timestamps)
- Email notifications (with timestamps)
- Status changes (sent, viewed, accepted)
- Resend actions

#### 10.4.4 Public Quote Page (Customer-Facing)

When a quote is sent to a customer, they receive a link to `/quote/[access_token]`. This page shows:

- Business name and address header
- Quote number, date, and validity period
- Customer and vehicle details
- Line items with quantities and prices
- Subtotal, tax, and total
- Notes from the business
- **Accept Quote** button (visible when status is "sent" or "viewed")

**Status banners on the public page:**
- **Expired** — Red banner: "This quote has expired. Please contact us if you would like a new quote."
- **Accepted** — Green banner: "Quote Accepted on [date]. Thank you! We will be in touch to schedule your appointment."
- **Converted** — Purple banner: "This quote has been converted to an appointment."
- **Deleted** — Friendly message: "This Estimate Is No Longer Available" with call and book-online buttons

When a customer first views a "sent" quote, the status automatically changes to "viewed" and the `viewed_at` timestamp is recorded.

When a customer clicks **Accept Quote**, the status changes to "accepted" and the `accepted_at` timestamp is recorded.

#### 10.4.5 Quote-to-Job Conversion

Once a quote is accepted (or even while in draft/sent/viewed status), it can be converted to a job:

1. From the POS quote detail view, click **Create Job**
2. The system creates a new appointment with:
   - Customer and vehicle from the quote
   - Services from the quote line items
   - Pricing from the quote
   - Auto-assigned detailer (or manually selected)
3. The quote status changes to "converted" with a link to the new appointment
4. A server-side duplicate check prevents the same quote from being converted twice (via the `quote_id` foreign key on the jobs table)

The conversion flow:
- Quote items with a `service_id` become appointment services
- The quote's subtotal, tax, and total carry over to the appointment
- The `converted_appointment_id` on the quote links back to the appointment
- A webhook fires for the new appointment confirmation

#### 10.4.6 Quote Reminders (Automated Cron)

A cron job runs hourly at the :30 minute mark (`/api/cron/quote-reminders`) that:

1. Finds quotes that are "sent" or "viewed" and approaching their expiry date
2. Sends reminder SMS/email to the customer
3. Marks expired quotes as "expired" when they pass their `valid_until` date

The quote validity period is configurable in **Admin > Settings > Business Profile > Booking & Quotes > Quote Validity (Days)**. The default is 14 days.

#### 10.4.7 Quote Communications Log

Every quote tracks its communication history in the `quote_communications` table:

- **Type** — "sms" or "email"
- **Recipient** — Phone number or email address
- **Message** — The content sent (or a summary for emails)
- **Status** — Delivery status
- **Timestamp** — When the message was sent

This log is visible on the quote detail page under the Communications section.

#### 10.4.8 Quote PDF Generation

Quotes can be generated as PDF documents via the API (`GET /api/quotes/[id]/pdf`). The PDF includes:

- Business header with name, address, and contact info
- Quote number and date
- Customer and vehicle details
- Line items table with quantities, unit prices, and totals
- Subtotal, tax, and grand total
- Notes
- Validity period

#### 10.4.9 Resending Quotes

Quotes can be resent to customers from the POS:

- **Draft quotes** — Sending changes their status to "sent"
- **Non-draft quotes** — Resending keeps the current status unchanged
- The `sent_at` field is updated on every send/resend to track "Last Contacted"
- Both SMS and email delivery methods are available

#### 10.4.10 Soft-Delete

Quotes use soft-delete via the `deleted_at` column. When a quote is deleted:

- It no longer appears in the admin quote list
- The public quote page shows a friendly "This Estimate Is No Longer Available" message with contact options
- The quote number remains reserved (the number generator queries by `quote_number DESC`, not `created_at`, to prevent number reuse after deletion)

---

## 11. Settings & Configuration

This chapter covers every settings page in the admin panel, staff management, and the role-based permission system. Navigate to **Admin > Settings** to access the settings hub.

---

### 11.1 Settings Overview

The settings hub is organized into six groups. Each card links to a dedicated configuration page.

| Group | Setting | Description |
|-------|---------|-------------|
| **Business** | Business Profile | Business name, phone, email, address, hours, SEO, social image |
| | Tax Configuration | Tax rate and product-only toggle |
| | Mobile Zones | Service zones, distance ranges, travel surcharges |
| | Shipping | Shippo API, carriers, rates, package dimensions |
| **Communications** | Messaging | AI auto-responder, conversation lifecycle, SMS settings |
| | Notifications | Stock alert recipients and notification preferences |
| **POS** | POS Favorites | Quick-action tiles on the POS Register tab |
| | POS Settings | Auto-logout timer, vehicle makes management |
| | Receipt Printer | Printer IP, receipt branding, logo, custom text |
| | POS Security | IP whitelist for POS access restriction |
| | Card Reader | Stripe Terminal reader registration and management |
| **Marketing** | Coupon Enforcement | Soft vs hard enforcement of customer type restrictions |
| | Reviews | Google/Yelp review links and automation settings |
| **Integrations** | QuickBooks Online | QBO connection, sync, and reports (see Chapter 10) |
| **Platform** | Feature Toggles | Enable/disable platform features globally |
| | Audit Log | System activity history and user action tracking |

All settings pages are restricted to the `super_admin` role. Changes take effect immediately unless otherwise noted.

---

### 11.2 Business Profile

**Path:** Admin > Settings > Business Profile

This page configures the core business identity. It has five sections:

#### Business Information

| Field | Description |
|-------|-------------|
| Business Name | Displayed in header, footer, receipts, emails, and SEO |
| Phone | Customer-facing phone number |
| Email | Contact email for customer communications |
| Website | Public website URL |
| Address | Full street address (used in footer, SEO, JSON-LD, receipts) |

All fields save to the `business_settings` table and are fetched throughout the app via `getBusinessInfo()`. The business name, phone, address, and email are never hardcoded — every component reads from this central source.

#### Business Hours

Per-day schedule editor with:
- Toggle switch for each day of the week (enabled/disabled)
- Start time and end time fields for enabled days
- Changes affect booking availability and the public-facing business hours display

#### Booking & Quotes

| Field | Description |
|-------|-------------|
| Deposit Amount | Dollar amount required as a deposit when customers book online (default: $50) |
| Quote Validity (Days) | How many days a quote remains valid before expiring (default: 14) |

The deposit amount syncs to the booking payment step. The quote validity syncs across the POS date picker, voice agent, Twilio webhook, and email templates.

#### SEO & Location

| Field | Description |
|-------|-------------|
| Site Description | Meta description used for the homepage and OG tags |
| Latitude / Longitude | GPS coordinates for JSON-LD structured data |
| Service Area (miles) | Radius used in JSON-LD geo data |
| Price Range | Price range indicator (e.g., "$$") for structured data |

#### Social Share Image (OG Image)

Upload a custom image used when the site is shared on social media. Supports JPG, PNG, and WebP. If no custom image is uploaded, the system generates a fallback automatically.

---

### 11.3 Feature Toggles

**Path:** Admin > Settings > Feature Toggles

Feature toggles enable or disable entire sections of the platform. Each toggle is stored in the `feature_flags` table and checked at runtime via `isFeatureEnabled()` (server-side) or `useFeatureFlag()` (client-side).

Toggles are grouped by category:

#### Core POS
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Cash Drawer Management | `cash_drawer` | Cash drawer open/close tracking in POS |
| Walk-In Flow | `walk_in_flow` | Walk-in job creation from POS Jobs tab |

#### Marketing
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Marketing Campaigns | `marketing_campaigns` | Campaign creation and sending in Admin > Marketing |
| Marketing Automations | `marketing_automations` | Lifecycle automation rules |
| Coupons & Promotions | `coupons_promotions` | Coupon creation, validation, and POS application |
| Google Review Requests | `google_review_requests` | Automated review solicitation after completed jobs |

#### Communication
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Two-Way SMS | `two_way_sms` | SMS inbox, AI auto-responder, and conversation management |

#### Booking
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Online Booking | `online_booking` | Public booking wizard at `/book` |
| Mobile Services | `mobile_services` | Mobile zone selection during booking |

#### Integrations
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| QuickBooks Online | `qbo_enabled` | QBO sync engines and auto-sync cron |

#### Operations
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Photo Gallery | `photo_gallery` | Public gallery page and gallery API endpoint |

#### Future
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Recurring Services | `recurring_services` | Reserved for future recurring appointment feature |

Each toggle shows a status badge (Enabled/Disabled) and updates immediately when flipped. Disabling a toggle does not delete data — it only hides the UI and disables the related functionality.

---

### 11.4 Staff Management

**Path:** Admin > Staff

#### Staff List

The staff list page shows all employees in a table:

| Column | Description |
|--------|-------------|
| Name | Full name (clickable link to detail) |
| Email | Staff email address |
| Role | Role badge (Super Admin, Admin, Cashier, Detailer, or custom) |
| POS PIN | Status indicator — green "Enabled" if PIN is set, gray "Disabled" if not |
| Status | Active or Inactive badge |

A **New Staff** button opens the creation form.

#### Creating a Staff Account

**Path:** Admin > Staff > New Staff

Required fields:
- **First Name** and **Last Name**
- **Email** — Must be unique across all staff
- **Phone** — Optional
- **Role** — Dropdown populated from the `roles` table (supports custom roles)
- **POS PIN** — Optional 4-digit numeric code. Setting a PIN grants POS access.
- **Bookable for Appointments** — Toggle on if this staff member should appear in the booking calendar

On save, a Supabase Auth user is created and linked to the employee record. The staff member can then log in at `/login` with their email and a password set by the admin.

#### Staff Detail Page

**Path:** Admin > Staff > [staff member]

The detail page has four tabs:

**Profile Tab:**
- Edit first name, last name, email, phone, role
- POS PIN Code field with Enabled/Disabled status indicator
- Bookable for Appointments toggle
- Deactivate/Reactivate button at the bottom

**Security Tab:**
Two options for password management:
1. **Set New Password** — Admin enters a new password directly (minimum 8 characters). Takes effect immediately.
2. **Send Password Reset Email** — Sends a reset link to the staff member's email address. They click the link and choose a new password.

If the staff member does not have a login account (no `auth_user_id`), the Security tab shows a message that password management is not available.

**Schedule Tab** (only visible if "Bookable for Appointments" is enabled):
- **Weekly Schedule** — Per-day grid with Available toggle and start/end time for each day of the week. Determines when customers can book this staff member.
- **Time Off / Blocked Dates** — Add specific dates when the staff member is unavailable (vacation, sick days). Each entry has a date and optional reason. Past dates are dimmed.

**Permissions Tab:**
- Shows the staff member's current role
- Lists all permissions grouped by category (POS, Customers, Appointments, etc.)
- Each permission has a click-to-cycle pill: **Default** (inherits from role) → **Granted** (override to allow) → **Denied** (override to block) → back to Default
- A green/red dot next to each permission name shows the effective value
- For Super Admin accounts, all overrides are disabled with a banner explaining "Super Admin bypasses all permission checks"
- Override count badges on each category header

#### Deactivating Staff

Click **Deactivate** on the staff detail Profile tab:
- A confirmation dialog appears explaining the consequences
- Deactivated staff lose access to the system (admin and POS)
- Their account and data are preserved — not deleted
- Click **Reactivate** to restore access

---

### 11.5 Roles & Permissions

**Path:** Admin > Staff > Role Management

#### Built-In Roles

The system ships with four built-in roles:

| Role | Display Name | Intended For | Key Characteristics |
|------|-------------|--------------|-------------------|
| `super_admin` | Super Admin | Business owner | Full unrestricted access. Bypasses all permission checks. |
| `admin` | Admin | Trusted managers | Near-full access. Cannot void transactions, override pricing, delete customers, or access system settings. |
| `cashier` | Cashier | Register operators | POS-focused. Can process payments, create tickets, create quotes. No marketing, inventory management, or CMS access. |
| `detailer` | Detailer | Field technicians | Job-focused. Can view/manage jobs, upload photos, clock in/out. No POS payment processing or admin panel access. |

#### Permission Categories and Keys

Permissions are organized into these categories:

**POS (`pos.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `pos.open_close_register` | Yes | Yes | Yes | No |
| `pos.create_tickets` | Yes | Yes | Yes | No |
| `pos.add_items` | Yes | Yes | Yes | No |
| `pos.apply_coupons` | Yes | Yes | Yes | No |
| `pos.apply_loyalty` | Yes | Yes | Yes | No |
| `pos.process_card` | Yes | Yes | Yes | No |
| `pos.process_cash` | Yes | Yes | Yes | No |
| `pos.process_split` | Yes | Yes | Yes | No |
| `pos.issue_refunds` | Yes | Yes | No | No |
| `pos.void_transactions` | Yes | No | No | No |
| `pos.manual_discounts` | Yes | Yes | No | No |
| `pos.discount_override` | Yes | No | No | No |
| `pos.end_of_day` | Yes | Yes | Yes | No |
| `pos.jobs.view` | Yes | Yes | Yes | Yes |
| `pos.jobs.manage` | Yes | Yes | No | Yes |
| `pos.jobs.flag_issue` | Yes | Yes | No | Yes |
| `pos.jobs.cancel` | Yes | Yes | No | No |

**Customers (`customers.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `customers.view` | Yes | Yes | Yes | Yes |
| `customers.create` | Yes | Yes | Yes | No |
| `customers.edit` | Yes | Yes | No | No |
| `customers.delete` | Yes | No | No | No |
| `customers.view_history` | Yes | Yes | Yes | No |
| `customers.view_loyalty` | Yes | Yes | Yes | No |
| `customers.adjust_loyalty` | Yes | Yes | No | No |
| `customers.export` | Yes | No | No | No |

**Appointments (`appointments.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `appointments.view_today` | Yes | Yes | Yes | Yes |
| `appointments.view_calendar` | Yes | Yes | Yes | No |
| `appointments.create` | Yes | Yes | Yes | No |
| `appointments.reschedule` | Yes | Yes | Yes | No |
| `appointments.cancel` | Yes | Yes | No | No |
| `appointments.waive_fee` | Yes | Yes | No | No |
| `appointments.update_status` | Yes | Yes | Yes | Yes |
| `appointments.add_notes` | Yes | Yes | Yes | Yes |
| `appointments.manage_schedule` | Yes | Yes | No | No |

**Catalog (`products.*`, `services.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `products.view` | Yes | Yes | Yes | Yes |
| `products.edit` | Yes | Yes | No | No |
| `products.delete` | Yes | No | No | No |
| `services.view` | Yes | Yes | Yes | Yes |
| `services.edit` | Yes | Yes | No | No |
| `services.delete` | Yes | No | No | No |
| `services.manage_addons` | Yes | Yes | No | No |
| `services.set_pricing` | Yes | Yes | No | No |

**Inventory (`inventory.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `inventory.view_stock` | Yes | Yes | Yes | No |
| `inventory.adjust_stock` | Yes | Yes | No | No |
| `inventory.manage_po` | Yes | Yes | No | No |
| `inventory.receive` | Yes | Yes | Yes | No |
| `inventory.view_costs` | Yes | Yes | No | No |
| `inventory.view_cost_data` | Yes | Yes | No | No |
| `inventory.manage_vendors` | Yes | Yes | No | No |

**Marketing (`marketing.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `marketing.campaigns` | Yes | Yes | No | No |
| `marketing.coupons` | Yes | Yes | No | No |
| `marketing.analytics` | Yes | Yes | No | No |
| `marketing.lifecycle_rules` | Yes | Yes | No | No |
| `marketing.two_way_sms` | Yes | Yes | No | No |

**Quotes (`quotes.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `quotes.create` | Yes | Yes | Yes | No |
| `quotes.send` | Yes | Yes | Yes | No |
| `quotes.convert` | Yes | Yes | Yes | No |

**Photos (`photos.*`, `admin.photos.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `photos.upload` | Yes | Yes | Yes | Yes |
| `photos.view` | Yes | Yes | Yes | Yes |
| `photos.delete` | Yes | Yes | No | No |
| `photos.approve_marketing` | Yes | Yes | No | No |
| `admin.photos.view` | Yes | Yes | No | No |
| `admin.photos.manage` | Yes | No | No | No |

**Reports (`reports.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `reports.revenue` | Yes | Yes | No | No |
| `reports.financial_detail` | Yes | No | No | No |
| `reports.cost_margin` | Yes | No | No | No |
| `reports.employee_tips` | Yes | No | No | No |
| `reports.own_tips` | Yes | Yes | Yes | Yes |
| `reports.export` | Yes | No | No | No |
| `reports.quickbooks_status` | Yes | No | No | No |

**Staff (`staff.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `staff.clock_self` | Yes | Yes | Yes | Yes |
| `staff.view_own_hours` | Yes | Yes | Yes | Yes |
| `staff.view_all_hours` | Yes | Yes | No | No |
| `staff.edit_time` | Yes | No | No | No |

**Settings (`settings.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `settings.feature_toggles` | Yes | No | No | No |
| `settings.tax_payment` | Yes | No | No | No |
| `settings.manage_users` | Yes | No | No | No |
| `settings.roles_permissions` | Yes | No | No | No |
| `settings.business_hours` | Yes | Yes | No | No |
| `settings.audit_log` | Yes | No | No | No |
| `settings.api_keys` | Yes | No | No | No |
| `settings.backup_export` | Yes | No | No | No |

**CMS (`cms.*`)**
| Key | Super Admin | Admin | Cashier | Detailer |
|-----|:-----------:|:-----:|:-------:|:--------:|
| `cms.hero.manage` | Yes | Yes | No | No |
| `cms.tickers.manage` | Yes | Yes | No | No |
| `cms.ads.manage` | Yes | Yes | No | No |
| `cms.themes.manage` | Yes | Yes | No | No |
| `cms.about.manage` | Yes | Yes | No | No |
| `cms.catalog_display.manage` | Yes | Yes | No | No |
| `cms.seo.manage` | Yes | Yes | No | No |
| `cms.pages.manage` | Yes | Yes | No | No |

#### Permission Resolution Order

When checking whether an employee has a permission:

1. **Super Admin** — Always returns `true`, bypasses all checks
2. **Employee-level override** — If an override exists for this specific employee, use it (grant or deny)
3. **Role-level default** — Fall back to the role's default for this permission
4. **Deny** — If no matching permission is found, access is denied

#### Custom Role Creation

1. Navigate to **Admin > Staff > Role Management**
2. Click **Create Role**
3. Enter a role name and display name
4. The new role starts with no permissions (all denied)
5. Toggle individual permissions on/off for the role
6. Assign the role to staff members from their detail page

#### Reset to Defaults

On the Role Management page, each built-in role has a **Reset to Defaults** button that restores all permissions for that role to their original values (as defined in the `ROLE_PERMISSION_DEFAULTS` constant).

---

### 11.6 Messaging Settings

**Path:** Admin > Settings > Messaging

Configures the AI auto-responder and conversation lifecycle. Shows a warning banner if the **Two-Way SMS** feature toggle is disabled.

#### AI Assistant

| Setting | Description |
|---------|-------------|
| Enable AI Auto-Responder | Master toggle for automatic AI replies to inbound SMS |
| Audience — Business Hours | Toggle pills to select who gets AI replies during business hours: "Unknown Numbers" and/or "Known Customers" |
| AI Prompt | Textarea containing the system prompt that guides the AI's tone and behavior. An "Apply Standard Template" button resets it to the default prompt. |

#### Conversation Lifecycle

| Setting | Description |
|---------|-------------|
| Auto-Close After | How many hours of inactivity before a conversation is automatically closed (dropdown: 1h to 72h) |
| Auto-Archive After | How many days after closing before a conversation is archived (dropdown: 1 to 30 days) |

---

### 11.7 Notification Recipients

**Path:** Admin > Settings > Notifications

Manages who receives automated notification emails (currently used for stock alerts).

#### Recipient Table

| Column | Description |
|--------|-------------|
| Email | Recipient email address |
| Type | Badge showing notification type (e.g., "Low Stock") |
| Active | Toggle to enable/disable without deleting |
| Delete | Remove the recipient |

#### Adding a Recipient

1. Enter an email address in the input field
2. Select the alert type from the dropdown (Low Stock or All)
3. Click **Add**

Duplicate email + type combinations are rejected.

#### Alert Schedule

Stock alerts are sent daily at **8:00 AM PST** by the `stock-alerts` cron job. A 7-day cooldown prevents the same product from triggering repeated alerts. If no recipients exist, the business email is auto-populated as a default.

---

### 11.8 Mobile Zones

**Path:** Admin > Settings > Mobile Zones

Configures service zones for mobile detailing with distance-based surcharges.

#### Zone Table

| Column | Description |
|--------|-------------|
| Zone Name | Display name (e.g., "Local — 0-10 miles") |
| Distance Range | Min and max distance in miles |
| Surcharge | Dollar amount added to the service price for travel |
| Available | Toggle to enable/disable the zone |

#### Creating/Editing a Zone

Click **Add Zone** or the edit icon on an existing zone:
- **Zone Name** — Free text label
- **Min Distance** and **Max Distance** — Miles (numeric)
- **Surcharge** — Dollar amount (numeric)
- **Display Order** — Controls the sort order in the booking wizard

A warning banner appears if the **Mobile Services** feature toggle is disabled.

#### How Zones Affect Pricing

During booking, the customer selects their service location. If they choose mobile service, the system matches their area to a zone and adds the zone's surcharge to the total. Zones are also used in the POS when creating mobile jobs.

---

### 11.9 Tax Configuration

**Path:** Admin > Settings > Tax Configuration

Simple tax settings:

| Setting | Description |
|---------|-------------|
| Tax Rate | Percentage rate (displayed as %, stored as decimal). Example: entering "10.25" means 10.25% tax |
| Products Only | Toggle switch. When ON, tax applies only to products, not services. When OFF, tax applies to both products and services. |

Tax is calculated at checkout time (both POS and online store) using the rate stored in `business_settings`.

---

### 11.10 Card Reader (Stripe Terminal)

**Path:** Admin > Settings > Card Reader

Manages Stripe Terminal hardware for in-person card payments.

#### Locations

Before registering a reader, you need at least one Stripe Terminal location:
- Click **Create Location** to add a new one
- Select the active location from the dropdown

#### Registering a Reader

1. Power on the Stripe Terminal reader (WisePOS E)
2. The reader displays a **pairing code** on its screen
3. Enter the pairing code in the **Registration Code** field
4. Optionally set a label (default: "POS Reader")
5. Click **Register**

The reader appears in the registered readers list.

#### Registered Readers

| Column | Description |
|--------|-------------|
| Label | Reader name |
| Device Type | Hardware model (e.g., "WisePOS E") |
| Status | Online (green) or Offline (gray) badge |
| Location | Assigned location name |
| Delete | Remove the reader registration |

#### Troubleshooting

- **Reader shows offline**: Check that the reader has WiFi connectivity and is powered on. The status updates on page refresh.
- **DNS resolution in PWA**: On iPad PWA, Stripe Terminal requires a pfSense DNS exception for `stripe-terminal-local-reader.net`. Desktop browsers bypass this via DoH.

---

### 11.11 Receipt Printer

**Path:** Admin > Settings > Receipt Printer

Configures receipt printing for POS transactions.

#### Printer Connection

- **Printer IP Address** — The network IP of the receipt printer

#### Header Branding

Override the business profile defaults for receipt-specific branding:
- Business name override
- Phone number override
- Address override
- Email override
- Website URL override

Leave fields blank to use the values from Business Profile.

#### Logo

- Upload a receipt logo (square format recommended)
- **Logo Width** — Size in pixels (adjustable)
- **Logo Placement** — Before or after the header text
- **Logo Alignment** — Left, center, or right

#### Custom Text Zones

The receipt supports multiple custom text zones with dynamic shortcodes. Available shortcodes (16 total):

| Shortcode | Value |
|-----------|-------|
| `{business_name}` | Business name |
| `{business_phone}` | Business phone |
| `{business_email}` | Business email |
| `{business_address}` | Business address |
| `{business_website}` | Business website |
| `{customer_name}` | Customer full name |
| `{customer_phone}` | Customer phone |
| `{customer_email}` | Customer email |
| `{vehicle_info}` | Year, make, model |
| `{receipt_number}` | POS receipt number |
| `{date}` | Transaction date |
| `{time}` | Transaction time |
| `{total}` | Transaction total |
| `{payment_method}` | Payment method used |
| `{employee_name}` | Staff who processed the transaction |
| `{tip_amount}` | Tip amount |

#### Live Preview

Click **Preview Receipt** to see a rendered preview using sample transaction data. The preview dialog shows exactly how the receipt will print with all branding, logo, and custom text applied.

---

### 11.12 POS Settings

**Path:** Admin > Settings > POS Settings

#### Auto-Logout Timer

Configure the idle timeout before the POS shows its lock screen:
- **Minutes** — 1 to 480 minutes
- When the POS is idle for this duration, a transparent overlay appears and the staff member must re-enter their PIN to continue
- This is the "idle timeout" system — the session stays alive, only the screen is locked

> The separate JWT token expiry (12 hours, hardcoded) is a different system that fully logs out the user.

#### Vehicle Makes Management

Manage the list of vehicle makes available in POS and booking forms:

- **Category Tabs** — Switch between vehicle categories: Automobile, Motorcycle, RV, Boat, Aircraft
- **Search** — Filter makes within the selected category
- **Add Make** — Enter a new make name. Auto-formats to title case with acronym handling (e.g., "bmw" → "BMW")
- **Toggle** — Enable/disable individual makes (disabled makes don't appear in dropdowns)
- **Delete** — Remove a make entirely

---

### 11.13 POS Security

**Path:** Admin > Settings > POS Security

Controls IP-based access restriction for the POS system.

#### IP Whitelist

| Setting | Description |
|---------|-------------|
| Enable IP Restriction | Master toggle. When OFF, POS is accessible from any IP. When ON, only whitelisted IPs can access the POS. |
| Current IP | Auto-detected. Shows your current IP address with an "Add My IP" button. |
| IP Entries | List of allowed IPs, each with a label name and the IP address. |

#### Adding an IP

1. Click **Add IP** or **Add My IP**
2. Enter a label (e.g., "Store iPad") and the IP address
3. IP validation supports both IPv4 and IPv6 formats

#### Warnings

- If the whitelist is enabled but empty, a warning appears: POS will be inaccessible from all IPs
- If your current IP is not in the whitelist, a warning appears: you may lose POS access

---

### 11.14 POS Favorites

**Path:** Admin > Settings > POS Favorites

Configures the quick-action tiles on the POS Register tab for fast access to common items.

#### Tile Types

| Type | Description |
|------|-------------|
| Product | Quick-add a specific product to the ticket |
| Service | Quick-add a specific service |
| Custom Amount | Enter a custom dollar amount |
| Customer Lookup | Open the customer search |
| Discount | Apply a percentage or fixed discount |
| Surcharge | Add an extra charge |

#### Creating/Editing a Tile

1. Click **Add Tile** or edit an existing one
2. Select the **type** from the dropdown
3. For Product/Service types, select the specific item from a picker
4. Set a **label** (displayed on the tile)
5. Choose a **color** from the 12-color × 6-shade palette
6. Optionally set a **dark mode color** override
7. Preview the tile appearance in real-time

#### Reordering

Use the up/down arrow buttons to reorder tiles. The order in the admin matches the order on the POS Register tab.

---

### 11.15 Shipping Settings

**Path:** Admin > Settings > Shipping

Full Shippo integration configuration for the online store.

#### API Key Management

- **Mode Toggle** — Switch between Test and Live mode
- **API Key** — Enter your Shippo API key (visibility toggle to show/hide)
- **Test Connection** — Validates the API key against Shippo

#### Ship-From Address

Full address form for the origin of shipments:
- Name, street, city, state (dropdown), zip code, country
- **Validate Address** — Checks the address against Shippo's address validation

#### Default Package Dimensions

Set default package measurements (length, width, height in inches, weight in pounds) used when individual products don't specify their own dimensions.

#### Carrier Preferences

- **Load Carriers** — Fetches your available carriers from Shippo
- Toggle individual carriers on/off (e.g., USPS, UPS, FedEx)

#### Service Level Filter

14 common service levels with checkbox toggles:
- USPS: Priority, Priority Express, First Class, Parcel Select, Media Mail, Ground Advantage
- UPS: Ground, 3 Day Select, 2nd Day Air, Next Day Air
- FedEx: Ground, Express Saver, 2Day, Standard Overnight

#### Pricing & Fees

| Setting | Description |
|---------|-------------|
| Free Shipping Threshold | Minimum order amount for free shipping ($0 = always free) |
| Flat Rate Shipping | Fixed shipping rate when not using calculated rates |
| Handling Fee | Additional fee added to every shipment |

#### Display Preferences

| Setting | Description |
|---------|-------------|
| Show Estimated Delivery | Display estimated delivery dates at checkout |
| Show Carrier Logos | Display carrier logos next to shipping options |
| Sort Order | How shipping options are sorted: by price (cheapest first) or speed (fastest first) |

#### Local Pickup

Toggle to enable local pickup as a shipping option at checkout.

---

### 11.16 Review Settings

**Path:** Admin > Settings > Reviews

#### Review Links

| Field | Description |
|-------|-------------|
| Google Review URL | Direct link to your Google Business review page. Preview link opens in new tab. |
| Yelp Review URL | Direct link to your Yelp review page. |

These URLs are used by the review solicitation automation and shared in post-service messages.

#### Website Review Data

**Google Section** (read-only):
- Rating (e.g., 4.8)
- Review count
- Last updated timestamp

**Yelp Section** (manually editable):
- Rating input
- Review count input

This data feeds the trust bar and review badges on the public website.

#### Google Review Requests

Shows the status of the `google_review_requests` feature flag. Links to:
- **Feature Toggles** — To enable/disable the automation
- **Automations** — To configure the review request lifecycle rules (timing, templates, etc.)

---

### 11.17 Coupon Enforcement

**Path:** Admin > Settings > Coupon Enforcement

Controls how customer type restrictions on coupons are handled:

| Mode | Behavior |
|------|----------|
| **Soft** (Recommended) | Shows a warning toast when a coupon is applied to the wrong customer type, but allows it to proceed |
| **Hard** | Rejects the coupon entirely if the customer type doesn't match |

This setting is stored as `coupon_type_enforcement` in `business_settings` with values `soft` or `hard`.

---

### 11.18 Audit Log

**Path:** Admin > Settings > Audit Log

The audit log tracks all significant user actions across the admin panel and POS. Restricted to `super_admin` role.

#### What Gets Logged

Every create, update, and delete action is logged with:

| Field | Description |
|-------|-------------|
| Timestamp | When the action occurred (PST), shown as relative time with full timestamp on hover |
| User | Email of the user who performed the action |
| Employee Name | Display name of the staff member |
| Action | Badge: Create (green), Update (blue), Delete (red) |
| Entity Type | What was affected: settings, employee, customer, product, service, appointment, etc. |
| Entity Label | Readable name of the affected record |
| Details | JSON object with specific field changes |
| Source | Where the action originated: "admin" or "pos" |
| IP Address | The user's IP address at the time of the action |

#### Viewing the Log

**Filters:**
- **Search** — Search by entity label, user email, or employee name
- **Entity Type** — Filter by type (settings, employee, customer, etc.)
- **Action** — Filter by create, update, or delete
- **Date Presets** — Quick filters: Today, Last 7 Days, Last 30 Days, All Time

**Table:** Paginated table (50 entries per page) with clickable rows that open a detail dialog showing the full entry including IP address and JSON details.

#### Exporting

Click **Export CSV** to download the filtered log entries (up to 5,000 records) as a CSV file with columns: Date, User, Employee, Action, Type, Entity, Details, Source, IP.

#### Log Retention

A cron job runs daily at **3:30 AM PST** (`/api/cron/cleanup-audit-log`) that automatically deletes audit log entries older than a configurable retention period. This prevents unbounded table growth.

---

## 12. Developer Guide

This chapter is for a developer inheriting or contributing to the codebase. It covers architecture, local setup, key patterns, and common gotchas — everything you need to be productive on day 1. For deep dives, each section links to the detailed reference doc in `docs/dev/`.

---

### 12.1 Architecture Overview

#### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 15.3.3 (pinned — do NOT upgrade) |
| Language | TypeScript (strict mode) | 5.x |
| UI | React | 19.x |
| Styling | Tailwind CSS with CSS variable theme system | 4.x |
| Database | PostgreSQL via Supabase (Auth + Storage + RLS) | — |
| Payments | Stripe (online checkout + POS Terminal) | SDK 20.x |
| SMS | Twilio (send/receive, signature validation) | — |
| Email | Mailgun (transactional + marketing, open/click tracking) | — |
| Shipping | Shippo (rates, label generation) | SDK 2.x |
| AI | Anthropic Claude (auto-responder, content writer, SEO) | — |
| Accounting | QuickBooks Online (OAuth, one-way sync) | — |
| Forms | react-hook-form + Zod validation | 7.x / 4.x |
| Tables | @tanstack/react-table | 8.x |
| Charts | Recharts | 3.x |
| Icons | lucide-react | — |
| Toasts | sonner | — |
| PDF | PDFKit | — |
| Animations | Framer Motion | — |

> Full architecture details: [`docs/dev/ARCHITECTURE.md`](../dev/ARCHITECTURE.md)

#### App Structure

The application serves five distinct audiences through route groups:

| Route Group | Path | Auth | Purpose |
|-------------|------|------|---------|
| Admin | `/admin/*` | Supabase Auth (email/password) | Back-office management |
| POS | `/pos/*` | PIN → JWT → HMAC | In-shop point-of-sale on iPad |
| Public | `/(public)/*` | None | Customer-facing website, SEO |
| Customer Portal | `/(account)/*` | Phone OTP or email/password | Customer self-service |
| API | `/api/*` | Varies by route | REST endpoints |

#### Server vs Client Components

- **Server Components** are the default. All public-facing pages are server-rendered for SEO.
- **`'use client'`** is added only when state or interactivity is needed. All admin and POS pages are client components.
- API routes (`route.ts`) are always server-only — never add `'use client'`.

---

### 12.2 Getting Started (Local Development)

#### Prerequisites

- **Node.js** — LTS version (20.x or later)
- **npm** — Comes with Node.js (no yarn/pnpm)
- **Git** — For version control

#### Clone & Install

```bash
git clone <repo-url>
cd AutoDetailApp
npm install
```

#### Environment Variables

Create `.env.local` in the project root. Every variable listed below is required for full functionality:

**Supabase (required)**
```env
NEXT_PUBLIC_SUPABASE_URL=https://zwvahzymzardmxixyfim.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**App URL (required)**
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Stripe (required for payments)**
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_live_or_test>
STRIPE_SECRET_KEY=<sk_live_or_test>
STRIPE_WEBHOOK_SECRET=<whsec_...>
```

**Twilio (required for SMS)**
```env
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_PHONE_NUMBER=+14244010094
TWILIO_WEBHOOK_URL=<public-url>/api/webhooks/twilio/inbound
```

**Mailgun (required for email)**
```env
MAILGUN_API_KEY=<key>
MAILGUN_DOMAIN=<domain>
MAILGUN_WEBHOOK_SIGNING_KEY=<signing-key>
```

**Anthropic (required for AI features)**
```env
ANTHROPIC_API_KEY=<key>
```

**Cron (required for scheduled jobs)**
```env
CRON_API_KEY=<random-secret>
```

**QuickBooks (optional — only if QBO sync enabled)**
```env
QBO_CLIENT_ID=<client-id>
QBO_CLIENT_SECRET=<client-secret>
```

**Shippo (optional — only if shipping enabled)**
```env
SHIPPO_API_KEY_LIVE=<key>
```

**Other (optional)**
```env
ALLOWED_POS_IPS=<comma-separated-ips>     # Fallback if DB unavailable
GOOGLE_PLACES_API_KEY=<key>                # Google Places/reviews
CRON_SECRET=<legacy-key>                   # Deprecated alias for CRON_API_KEY
```

#### Running the Dev Server

```bash
npm run dev
```

This starts the Next.js dev server on `http://localhost:3000` with Turbopack. The internal cron scheduler also boots via `instrumentation.ts`.

#### Accessing the App Locally

| Section | URL | Notes |
|---------|-----|-------|
| Public website | `http://localhost:3000` | No auth needed |
| Admin dashboard | `http://localhost:3000/admin` | Requires employee account |
| Admin login | `http://localhost:3000/login` | Email + password |
| POS | `http://localhost:3000/pos` | Requires PIN |
| Customer portal | `http://localhost:3000/account` | Requires customer account |

#### Build

```bash
npm run build     # Production build
npm run start     # Start production server
```

After deploying or switching branches, always clear the build cache:

```bash
rm -rf .next
npm run dev
```

---

### 12.3 Project Structure

> Full file tree with exact paths: [`docs/dev/FILE_TREE.md`](../dev/FILE_TREE.md)

```
src/
├── app/
│   ├── admin/           — Admin dashboard, CRUD, settings (12 sub-pages)
│   ├── (public)/        — Customer-facing website, CMS pages, store
│   ├── (account)/       — Customer portal (orders, services, loyalty)
│   ├── (customer-auth)/ — Login, signup, password reset
│   ├── pos/             — POS system (PIN auth, HMAC API)
│   ├── api/             — API routes (admin/, pos/, public/, cron/, webhooks/)
│   └── layout.tsx       — Root layout
├── components/
│   ├── admin/           — Admin-specific (icon-picker, html-editor-toolbar)
│   ├── public/          — Public site (header, footer, hero, CMS, cart)
│   └── ui/              — Shared primitives (shadcn/ui based)
├── lib/
│   ├── supabase/        — Client (browser), server (cookie), admin (service role)
│   ├── auth/            — Roles, permissions, check-permission, require-permission
│   ├── hooks/           — useFeatureFlag, usePermission, useIsSuperAdmin
│   ├── utils/           — Formatters, validators, sms, email, constants
│   ├── cron/            — Internal scheduler (node-cron)
│   ├── qbo/             — QuickBooks sync engines
│   ├── services/        — AI messaging, content writer, job-addons
│   └── data/            — Server data access (business info, CMS, etc.)
├── types/               — TypeScript definitions
└── supabase/
    └── migrations/      — Postgres migrations (append only, never delete)
```

#### Naming Conventions

- **Pages**: `page.tsx` — always `'use client'` for admin/POS pages
- **API routes**: `route.ts` — server-only, never `'use client'`
- **Components**: kebab-case (`customer-lookup.tsx`)
- **Utils**: kebab-case (`validation.ts`)
- **Dynamic segments**: `[id]/`, `[slug]/` (lowercase)
- **Page-specific components**: `_components/` directory (prefixed with `_`)
- **Imports**: Use `@/` path alias (maps to `./src/*`)

---

### 12.4 Database

#### Overview

- **Supabase Postgres** with Row Level Security (RLS)
- **70+ tables** — full schema documented in [`docs/dev/DB_SCHEMA.md`](../dev/DB_SCHEMA.md)
- **Hand-written TypeScript types** in `src/lib/supabase/types.ts` — this is the source of truth, not the auto-generated `database.types.ts`

#### Migration Workflow

Migrations live in `supabase/migrations/` with naming convention `YYYYMMDD######_description.sql`.

Rules:
1. **Always check `docs/dev/DB_SCHEMA.md` first** before creating new fields or tables. Reuse existing fields.
2. **If a new field IS needed**, create a migration and update `DB_SCHEMA.md`.
3. **If a new table IS needed**, document it fully in `DB_SCHEMA.md` with all columns, types, constraints.
4. **Extend JSONB fields** (like `receipt_config`, `business_settings.value`) before creating new columns — check if the data logically belongs in an existing JSONB structure.
5. **Never delete existing migrations** — append only.
6. **Enum changes**: prefer adding values over removing (removing requires `DROP TYPE`).
7. **Never guess** what fields exist — verify against `DB_SCHEMA.md` or the actual migrations.

#### Common Column Patterns

Every table has:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_at TIMESTAMPTZ DEFAULT now()`

Other conventions:
- Foreign keys: `_id` suffix (`customer_id`, `coupon_id`)
- Boolean flags: `is_` prefix (`is_active`, `is_single_use`)
- Timestamps: stored as `TIMESTAMPTZ`, represented as `string` (ISO 8601) in TypeScript
- Nullable arrays: `TEXT[]` or `UUID[]`

#### Key JSONB Structures

- **`business_settings`** table — key/value store for all configurable settings. The `value` column is JSONB. Used for business info, receipt config, POS settings, shipping config, QBO tokens, and more.
- **`receipt_config`** — Stored in `business_settings` with key `receipt_config`. Contains printer branding, custom text zones, and dynamic shortcodes.

---

### 12.5 Authentication & Authorization

Three separate auth contexts serve different user types:

#### Admin Auth

```
User visits /admin
  → middleware.ts checks for Supabase session (sb-* cookies)
  → If no session → redirect to /login
  → If session exists → updateSession() refreshes tokens
  → Page loads → API routes verify auth:
      createClient() → getUser() → getEmployee() → checkPermission()
      → createAdminClient() for data access (bypasses RLS)
```

Key files:
- `src/lib/supabase/server.ts` — Server client (cookie-based session)
- `src/lib/supabase/admin.ts` — Admin client (service role, bypasses RLS)
- `src/lib/auth/get-employee.ts` — `getEmployeeFromSession()` — gets auth user + employee record in one call
- `src/lib/auth/check-permission.ts` — `checkPermission()` with resolution order: super_admin bypass → user override → role default → denied
- `src/lib/auth/require-permission.ts` — `requirePermission()` — returns 403 NextResponse if denied, null if granted

**Important**: Always use `getUser()` (server-validated), never `getSession()` (cached and unreliable).

#### POS Auth

```
Employee enters 4-digit PIN at /pos/login
  → POST /api/pos/auth/pin-login validates PIN, rate-limits (5 failures = 15min lockout)
  → On success: generates JWT, returns employee data
  → POS components use posFetch() which adds HMAC signature to requests
  → POS API routes call authenticatePosRequest() to validate HMAC
  → Then createAdminClient() for data access
```

Key files:
- `src/lib/pos/api-auth.ts` — `authenticatePosRequest()` for server-side HMAC validation
- `src/lib/pos/session.ts` — POS session management, JWT handling

> Full POS security details: [`docs/dev/POS_SECURITY.md`](../dev/POS_SECURITY.md)

#### Customer Auth

```
Customer visits /signin
  → Enters phone number → receives SMS OTP via Twilio
  → Verifies 6-digit code → Supabase Auth session created
  → Customer portal uses createClient() (browser) with RLS
  → RLS policies scope all queries to the authenticated customer's data
```

#### `adminFetch()` — Session Expiry Handling

Client-side admin pages should use `adminFetch()` from `src/lib/utils/admin-fetch.ts` instead of raw `fetch()`. It intercepts 401 responses and redirects to `/login?reason=session_expired`.

```typescript
import { adminFetch } from '@/lib/utils/admin-fetch';

const res = await adminFetch('/api/admin/customers');
```

#### Permission Helpers

**Server-side** (API routes):
```typescript
import { requirePermission } from '@/lib/auth/require-permission';

const denied = await requirePermission(employee.id, 'customers.delete');
if (denied) return denied; // Returns 403 NextResponse
```

**Client-side** (components):
```typescript
import { usePermission, useIsSuperAdmin } from '@/lib/hooks/use-permission';

const canDelete = usePermission('customers.delete');
const isSuperAdmin = useIsSuperAdmin();
```

#### Super Admin

The `super_admin` role bypasses all permission checks. It is checked via `employee.role === 'super_admin'` — there is no separate flag.

---

### 12.6 API Route Patterns

#### Admin Routes

Every admin API route follows this pattern:

```typescript
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  // 1. Auth check (Supabase session via cookies)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Employee + role check
  const { data: employee } = await supabase
    .from('employees').select('id, role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 3. Data access with admin client (bypasses RLS)
  const admin = createAdminClient();
  const { data } = await admin.from('table').select('*');
  return NextResponse.json({ data });
}
```

Or using the convenience helper:
```typescript
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const employee = await getEmployeeFromSession();
if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

#### POS Routes

```typescript
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const auth = await authenticatePosRequest(request);
  if (!auth.success) return NextResponse.json({ error: auth.error }, { status: 401 });

  const admin = createAdminClient();
  // ... query logic
}
```

#### Public Routes

No auth check. Use `createAdminClient()` for read-only data access, or pass an `access_token` for specific resources (e.g., public quote pages).

#### Customer Portal Routes

Use `createClient()` (browser/server) with RLS. The authenticated customer can only see their own data.

#### Response Shapes

```typescript
// Success
{ data: item }                        // 200 single
{ data: items }                       // 200 list
{ data: items, total, page, limit }   // 200 paginated

// Errors
{ error: 'Unauthorized' }             // 401
{ error: 'Forbidden' }                // 403
{ error: 'Not found' }                // 404
{ error: 'Code already exists' }      // 409
{ error: 'Validation failed', details: {...} }  // 400
```

#### Idempotency

For mutation endpoints that must be safe to retry (e.g., payment processing), use the idempotency helpers from `src/lib/utils/idempotency.ts`:

```typescript
import { checkIdempotency, saveIdempotency } from '@/lib/utils/idempotency';

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get('idempotency-key');
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached; // Return cached response

  // ... perform mutation ...

  await saveIdempotency(idempotencyKey, responseBody, 201);
  return NextResponse.json(responseBody, { status: 201 });
}
```

Idempotency keys are auto-cleaned after 24 hours by the `cleanup-idempotency` cron job.

---

### 12.7 Key Patterns & Gotchas

#### Timezone

**All** scheduling, cron, logs, and time displays use `America/Los_Angeles` (PST/PDT). Never UTC. This applies to cron schedules in `scheduler.ts`, transaction dates sent to QBO, and all user-facing timestamps.

#### Business Info — Never Hardcode

Never hardcode the business name, phone, address, email, or website URL. Always fetch dynamically:

```typescript
// Server-side
import { getBusinessInfo } from '@/lib/data/business';
const info = await getBusinessInfo();

// Client-side
const res = await fetch('/api/public/business-info');
```

#### SMS — Always Use Centralized Utilities

Never write inline `fetch()` calls to the Twilio API. All SMS must go through:
- **`sendSms()`** — transactional messages (confirmations, receipts). Supports `mediaUrl` for MMS.
- **`sendMarketingSms()`** — marketing messages. Requires `customerId`, does DB consent check + daily frequency cap.
- **`updateSmsConsent()`** — consent changes. Updates customer record + inserts `sms_consent_log` audit row.

All in `src/lib/utils/sms.ts` and `src/lib/utils/sms-consent.ts`.

#### Supabase `.or()` on Related Tables — Doesn't Work

PostgREST's `.or()` with filters on related tables (e.g., `customer.first_name.ilike`) is silently ignored. Workaround: query the related table first for matching IDs, then use `.in('foreign_key', ids)` on the main table.

#### iOS Safari Quirks

- **Phone auto-linking**: Root layout includes `format-detection: telephone=no`. Always wrap phone numbers in `<a href="tel:...">` to prevent hydration mismatches.
- **Input zoom prevention**: All text inputs in customer-facing forms must use `text-base sm:text-sm` to prevent iOS auto-zoom on focus (iOS zooms inputs with font-size < 16px).

#### POS Dark Mode

Every `bg-white` in POS components must have a corresponding `dark:bg-gray-900` (or appropriate dark variant). Audit dropdowns, modals, popovers, and tooltips — these are commonly missed.

#### Soft-Delete

Quotes use `deleted_at` column. **All** quote queries must include `.is('deleted_at', null)` except:
- `quote-number.ts` (needs all quotes to prevent number reuse)
- Public quote page (shows a friendly "deleted" message)

#### Feature Flags

Server-side:
```typescript
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
if (await isFeatureEnabled('photo_gallery')) { ... }
```

Client-side:
```typescript
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
const { enabled, loading } = useFeatureFlag('photo_gallery');
```

Flags are stored in the `feature_flags` table and cached client-side with a 60-second TTL.

#### Auth Validation

Always use `getUser()` (server-validated) — never `getSession()` (cached and can be stale). This is a Supabase best practice for server-side code.

#### Component Reuse

Before writing any new component, search `src/components/` for existing reusable components. The shared UI library in `src/components/ui/` provides: Button, Badge, DataTable, Dialog, ConfirmDialog, Card, Input, Select, Textarea, Spinner, Skeleton, PageHeader, SearchInput, Tabs, and more.

> Full component APIs: [`docs/dev/CONVENTIONS.md`](../dev/CONVENTIONS.md)

#### Cache Revalidation

Use the wrapper from `src/lib/utils/revalidate.ts` instead of Next.js's `revalidateTag` directly — it provides the required cache-life profile argument for Next.js 15.x compatibility:

```typescript
import { revalidateTag } from '@/lib/utils/revalidate';
revalidateTag('footer-data');
```

---

### 12.8 Internal Cron System

All scheduled work runs through an internal cron system. **Never** suggest n8n, Vercel Cron, or any external scheduler.

#### How It Works

1. `src/instrumentation.ts` — Next.js hook that runs once on server startup. Calls `setupCronJobs()` when `NEXT_RUNTIME === 'nodejs'`.
2. `src/lib/cron/scheduler.ts` — Uses `node-cron` to define scheduled jobs. Each job calls an internal API endpoint via `fetch('http://localhost:PORT/api/cron/...')` with `CRON_API_KEY` auth.

Guards:
- `NEXT_RUNTIME === 'nodejs'` check skips build/edge runtime
- Module-level `initialized` flag prevents duplicate setup on hot reload
- Each endpoint call has a 30-second timeout and 1 retry with 5-second delay

#### Registered Cron Jobs

| Job | Schedule | Endpoint | Purpose |
|-----|----------|----------|---------|
| Lifecycle engine | Every 10 min | `/api/cron/lifecycle-engine` | Review requests, follow-ups, automations |
| Quote reminders | Hourly at :30 | `/api/cron/quote-reminders` | 24hr quote nudge SMS |
| Stock alerts | Daily 8:00 AM PST | `/api/cron/stock-alerts` | Low inventory notifications |
| QBO auto-sync | Every 30 min | `/api/cron/qbo-sync` | Push transactions/customers to QuickBooks |
| Theme activation | Every 15 min | `/api/cron/theme-activation` | Auto-activate/deactivate seasonal themes |
| Google reviews | Daily 6:00 AM PST | `/api/cron/google-reviews` | Refresh Google review data |
| Order cleanup | Every 6 hours | `/api/cron/cleanup-orders` | Cancel abandoned orders > 24h + cancel Stripe PIs |
| Idempotency cleanup | Daily 3:00 AM PST | `/api/cron/cleanup-idempotency` | Delete idempotency keys > 24h old |
| Audit log cleanup | Daily 3:30 AM PST | `/api/cron/cleanup-audit-log` | Retention policy (90 days) |

Additionally, **pg_cron** runs one database-level job:
- `conversation-lifecycle` — Hourly — auto-closes and archives stale SMS conversations (pure SQL, no HTTP)

#### Adding a New Cron Job

1. Create an API route at `src/app/api/cron/{job-name}/route.ts`
2. Add `CRON_API_KEY` auth check:
   ```typescript
   const apiKey = request.headers.get('x-api-key');
   if (apiKey !== process.env.CRON_API_KEY) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```
3. Add a `cron.schedule()` entry in `src/lib/cron/scheduler.ts`
4. Update `CLAUDE.md` cron jobs table and this document

---

### 12.9 Integrations

#### Stripe — Payments

- **Online checkout**: Payment Intents via `@stripe/react-stripe-js`
- **POS Terminal**: Stripe Terminal SDK for in-person card payments on iPad
- **Webhooks**: `POST /api/webhooks/stripe` — handles `payment_intent.succeeded` (generates order number, decrements stock, sends confirmation email) and `payment_intent.failed`
- **Signature validation**: All webhook payloads verified via `stripe.webhooks.constructEvent()`

#### Supabase — Database, Auth, Storage

- **Database**: PostgreSQL with 70+ tables and RLS policies
- **Auth**: Email/password for admin, phone OTP for customers, magic link for POS PIN auth
- **Storage**: Product images (`product-images/`), service images (`service-images/`), job photos (`job-photos/`), CMS uploads
- **Three clients**: browser (`client.ts`), server (`server.ts`), admin (`admin.ts`) — see [Section 12.5](#125-authentication--authorization)

#### Twilio — SMS

- **Send**: All through `sendSms()` / `sendMarketingSms()` in `src/lib/utils/sms.ts`
- **Receive**: `POST /api/webhooks/twilio/inbound` — handles inbound SMS, STOP/START keywords (TCPA), AI auto-responder, auto-quote generation
- **Status callbacks**: `POST /api/webhooks/twilio/status` — delivery status tracking
- **Signature validation**: Enforced in production (`NODE_ENV !== 'development'`), skipped in dev

#### Mailgun — Email

- **Send**: Via `sendEmail()` in `src/lib/utils/email.ts` with open/click tracking
- **Webhooks**: `POST /api/webhooks/mailgun` — handles delivered, failed, bounced, clicked, complained, unsubscribed events
- **Signature validation**: Via `verifyMailgunWebhook()` in `src/lib/utils/mailgun-signature.ts`

#### Shippo — Shipping

- **Rates**: Real-time shipping rate quotes at checkout
- **Labels**: Shipping label generation for fulfilled orders
- **Config**: API keys stored in `shipping_settings` table, managed via Admin > Settings > Shipping

> Shippo integration code: `src/lib/services/shippo.ts`

#### QuickBooks Online — Accounting

- **Direction**: One-way push (App → QBO)
- **Entities synced**: Transactions → Sales Receipts, Customers → Customers, Services/Products → Items
- **Timing**: Real-time fire-and-forget after POS completion + auto-sync cron every 30 minutes
- **OAuth**: Access token auto-refreshes (1hr expiry). Refresh token lasts 100 days — reconnect if expired.

> Full QBO details: [`docs/dev/QBO_INTEGRATION.md`](../dev/QBO_INTEGRATION.md)

#### Anthropic Claude — AI

- **SMS auto-responder**: `src/lib/services/messaging-ai.ts` — AI replies to customer SMS messages with service catalog awareness and product keyword detection
- **Content writer**: `src/lib/services/ai-content-writer.ts` — AI-generated CMS page content
- **SEO optimizer**: `src/lib/services/ai-seo.ts` — AI-generated meta titles, descriptions, and page analysis

---

### 12.10 Theme & Design System

#### CSS Variable Cascade (Critical)

Tailwind v4's `@theme inline` inlines values into utilities. To allow runtime CSS variable overrides, the codebase uses an **indirection pattern**:

1. **Raw vars in `:root`**: `--lime: #CCFF00`
2. **Referenced in `@theme inline`**: `--color-lime: var(--lime)`
3. **ThemeProvider sets raw vars**: `--lime`, `--brand-dark`, etc. (NOT `--color-lime`)

Without this indirection, CSS variable overrides from ThemeProvider don't cascade.

#### Theme Priority Chain

```
1. CSS :root defaults (globals.css)           — lowest priority
2. .public-theme overrides (globals.css)
3. Site Theme Settings (DB → buildSiteThemeVars())
4. Seasonal Theme Overrides (DB → buildSeasonalCssVars())
5. User Theme Toggle (localStorage → light mode vars)  — highest priority
```

#### Admin Theme Editor

The admin Theme & Styles page (`/admin/website/theme-settings`) lets the owner customize site colors. Changes are stored in the `site_theme_settings` table and applied via the `ThemeProvider` component.

Seasonal themes are stored in `cms_themes` with `color_overrides` JSONB. Eight presets are available in `src/lib/utils/cms-theme-presets.ts`.

> Full design system reference: [`docs/dev/DESIGN_SYSTEM.md`](../dev/DESIGN_SYSTEM.md)

---

### 12.11 Deployment

#### Current Setup

- **Development**: Local MacBook Pro running `npm run dev`
- **Production target**: Dedicated Hostinger server (not Vercel — never suggest Vercel)

#### Build & Deploy

```bash
npm run build          # Production build
rm -rf .next           # Clear stale cache before deploying
npm run start          # Start production server
```

**Post-deploy**: Always `rm -rf .next` to prevent stale chunk 404s. The Next.js config generates a unique build ID per build (`generateBuildId: () => Date.now().toString()`) so the service worker can detect new deploys.

#### Environment Variables

All env vars from [Section 12.2](#122-getting-started-local-development) must be set in the production environment. Key production-specific values:

- `NEXT_PUBLIC_APP_URL` — Must be the production domain (not localhost)
- `TWILIO_WEBHOOK_URL` — Must be the production domain for SMS callbacks
- `STRIPE_WEBHOOK_SECRET` — Must match the production Stripe webhook endpoint
- `MAILGUN_WEBHOOK_SIGNING_KEY` — Must match the production Mailgun webhook config

#### Next.js Version

**Do NOT upgrade Next.js.** Currently pinned to `15.3.3`. Next.js 16 requires major migration work (async params, proxy.ts replacing middleware.ts, caching changes). Only upgrade when explicitly instructed.

#### `next.config.ts` Notable Settings

- `serverExternalPackages: ['pdfkit', 'sharp']` — Prevents Turbopack from bundling heavy server-only packages
- `generateBuildId` — Uses timestamp for cache-busting
- `images.remotePatterns` — Allows Supabase storage URLs and external image hosts

---

### 12.12 Troubleshooting

> Full troubleshooting guide: [`docs/dev/TROUBLESHOOTING.md`](../dev/TROUBLESHOOTING.md)

#### White Screen of Death (WSOD)

**Most common cause**: Stale `.next` cache after bulk file changes.

```bash
rm -rf .next
npm run dev
```

**Other causes**: Supabase egress limit exhausted (check dashboard), stale auth cookies (clear `sb-*` cookies in browser).

#### Auth Redirect Loops

If the login page loops after entering valid credentials:
1. Verify `src/lib/supabase/client.ts` has the Web Locks bypass (`lock: async (_, __, fn) => fn()`)
2. Check that `onAuthStateChange` always calls `setLoading(false)`
3. Never call `signOut()` in error handlers — it's a server-side session invalidation
4. Check Supabase egress usage — exhausted egress causes auth failures that look like bugs

#### Build Failures

- Check if errors are in your modified files vs pre-existing lint issues
- TypeScript compilation succeeding but lint failing with 80+ errors is usually pre-existing

#### POS Card Reader Not Connecting

- Stripe Terminal requires `pfSense DNS exception` for `stripe-terminal-local-reader.net` in iPad Safari PWA
- Desktop browsers bypass this via DoH (DNS over HTTPS)
- Check Stripe dashboard for reader status

#### Stale .next Cache (404 on Chunks)

After commits that touch multiple files, the dev server's incremental compilation can get confused. Symptoms: 404 on `/_next/static/chunks/main-app.js` or CSS files. Fix: `rm -rf .next && npm run dev`.

#### Cron Not Running

- Verify `CRON_API_KEY` env var is set
- Check server console for `[CRON] Initializing internal cron scheduler...` on startup
- Cron uses `http://localhost:PORT` — ensure the dev server is running and the port matches
- Jobs have a 30-second timeout — long-running jobs will fail silently

---

### 12.13 Reference Docs Index

Every detailed reference doc lives in `docs/dev/`. Read the relevant doc when working on that system.

| Document | What It Covers |
|----------|---------------|
| [`ARCHITECTURE.md`](../dev/ARCHITECTURE.md) | System architecture, shared utilities registry, data access patterns, state management |
| [`DB_SCHEMA.md`](../dev/DB_SCHEMA.md) | Full database schema (70+ tables), column types, constraints, JSONB structures |
| [`CONVENTIONS.md`](../dev/CONVENTIONS.md) | Code style, naming, component APIs, page patterns, Zod validation, auth patterns |
| [`DESIGN_SYSTEM.md`](../dev/DESIGN_SYSTEM.md) | Theme system, CSS variables, color palette, typography, spacing, dark mode |
| [`DASHBOARD_RULES.md`](../dev/DASHBOARD_RULES.md) | Dashboard metric calculations, widget data sources, reporting rules |
| [`POS_SECURITY.md`](../dev/POS_SECURITY.md) | POS IP whitelist, HMAC auth, PIN login, timeout systems |
| [`QBO_INTEGRATION.md`](../dev/QBO_INTEGRATION.md) | QuickBooks OAuth, sync engines, entity mapping, troubleshooting |
| [`SERVICE_CATALOG.md`](../dev/SERVICE_CATALOG.md) | Service/pricing architecture, vehicle tiers, pricing models, add-ons |
| [`DATA_MIGRATION_RULES.md`](../dev/DATA_MIGRATION_RULES.md) | Square data import rules, field mapping, customer/product/transaction migration |
| [`TROUBLESHOOTING.md`](../dev/TROUBLESHOOTING.md) | WSOD, auth loops, build failures, Supabase egress, diagnostic commands |
| [`FILE_TREE.md`](../dev/FILE_TREE.md) | Exact file paths for every route, page, lib module, component, migration |
| [`CHANGELOG.md`](../../CHANGELOG.md) | Version history, session summaries, feature log |

---

