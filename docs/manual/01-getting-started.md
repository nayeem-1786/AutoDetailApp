# 1. Getting Started

This chapter covers how to access the system, how authentication works for each user type, the role-based permission model, and a checklist for first-time setup.

---

## 1.1 Accessing the System

The platform has four entry points, each serving a different audience:

| Entry Point | URL Path | Who Uses It | Auth Method |
|-------------|----------|-------------|-------------|
| Admin Dashboard | `/admin` | Owner, managers, staff with admin access | Email + password (Supabase Auth) |
| Point of Sale | `/pos` | Cashiers, detailers working the register | 4-digit PIN code |
| Customer Portal | `/account` | End customers managing their profile | Phone OTP or email + password |
| Public Website | `/` | Anyone — customers, prospects, search engines | No auth required |

> The admin login page is at `/login`. The customer login page is at `/signin`. These are separate auth flows — a staff email cannot log in as a customer, and vice versa. The system checks the `employees` and `customers` tables respectively and blocks cross-login attempts.

---

## 1.2 Logging In

### Admin Login (Email + Password)

1. Navigate to `/login`
2. Enter your staff **email** and **password**
3. On success, you are redirected to `/admin`

If you forget your password, an admin with `settings.manage_users` permission can either:
- Set a new password directly from **Admin** → **Staff** → select staff member → **Security** tab → **Set Password**
- Send a password reset email from the same tab → **Send Reset Email**

### POS Login (PIN Code)

1. Navigate to `/pos` or `/pos/login`
2. Enter your **4-digit PIN** on the keypad
3. On success, the POS workspace loads with your name and role

> A PIN is set by the owner/admin in **Admin** → **Staff** → select staff member → **Profile** tab → **POS PIN Code** field. If a staff member has no PIN set, they cannot access the POS. PIN presence = POS access; no PIN = no POS access.

The POS has two timeout systems:
- **Idle timeout** — Configurable in Admin → Settings → POS Settings. Shows a transparent overlay after inactivity. The staff member re-enters their PIN to resume. The session stays alive.
- **JWT token expiry** — Hardcoded at 12 hours. After expiry, the user is fully redirected to `/pos/login` with a "session expired" toast message. A new PIN login is required.

### Customer Portal Login (Phone OTP)

1. Navigate to `/signin`
2. Enter your **mobile phone number** (the default sign-in method)
3. Receive a **6-digit SMS code** via Twilio
4. Enter the code to verify
5. On success, redirected to `/account`

Alternatively, customers can switch to **email + password** sign-in by clicking "Sign in with email" on the sign-in page. This mode also supports **Forgot password** which sends a reset link via email.

> New customers who don't have an account yet are directed to `/signup` to create one. The system checks the `customers` table before sending an OTP — if no matching phone number exists, it shows a "Create a new account" link instead of sending a code.

---

## 1.3 User Roles

The system defines four built-in roles. Each role has a set of default permissions that control access across the admin dashboard and POS.

### Role Overview

| Role | Display Name | Intended For | Description |
|------|-------------|--------------|-------------|
| `super_admin` | Super Admin | Business owner (Nayeem) | Full unrestricted access to everything. Bypasses all permission checks. |
| `admin` | Admin | Trusted managers | Near-full access to admin and POS. Cannot void transactions, override pricing, delete customers, or access system-level settings. |
| `cashier` | Cashier | Front-desk / register operators | POS-focused. Can process payments, create tickets, look up customers, create quotes. No access to marketing, inventory management, or CMS. |
| `detailer` | Detailer | Field technicians | Job-focused. Can view and manage assigned jobs, upload photos, flag issues, clock in/out. No POS payment processing. No admin panel access beyond job-related tasks. |

> Custom roles can be created in **Admin** → **Staff** → **Role Management**. Custom roles start with no permissions and are configured by toggling individual permission switches.

### Permission Categories

Permissions are organized into categories. Here is every permission key in the system with its category and what it controls:

#### POS Permissions (`pos.*`)

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
| `pos.manual_discounts` | Show the Add Discount button in POS tickets and quotes |
| `pos.discount_override` | Allow manual discounts on items with special pricing |
| `pos.end_of_day` | Run end-of-day cash reconciliation |
| `pos.jobs.view` | View job cards in POS |
| `pos.jobs.manage` | Start work, complete jobs, manage job flow |
| `pos.jobs.flag_issue` | Flag issues on a job (damage, customer complaint) |
| `pos.jobs.cancel` | Cancel an active job |

#### Customer Permissions (`customers.*`)

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

#### Appointment Permissions (`appointments.*`)

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

#### Product & Service Permissions

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

#### Inventory Permissions (`inventory.*`)

| Permission | What It Controls |
|------------|-----------------|
| `inventory.view_stock` | View stock levels |
| `inventory.adjust_stock` | Manual stock adjustments |
| `inventory.manage_po` | Create and manage purchase orders |
| `inventory.receive` | Receive inventory against purchase orders |
| `inventory.view_costs` | View product cost data |
| `inventory.view_cost_data` | View detailed cost/margin data |
| `inventory.manage_vendors` | Create and manage vendor records |

#### Marketing Permissions (`marketing.*`)

| Permission | What It Controls |
|------------|-----------------|
| `marketing.campaigns` | Create and send marketing campaigns |
| `marketing.coupons` | Create and manage coupon codes |
| `marketing.analytics` | View marketing analytics and reports |
| `marketing.lifecycle_rules` | Configure automated lifecycle rules (follow-ups, win-backs) |
| `marketing.two_way_sms` | Access the two-way SMS messaging inbox |

#### Quote Permissions (`quotes.*`)

| Permission | What It Controls |
|------------|-----------------|
| `quotes.create` | Create new quotes (via POS builder) |
| `quotes.send` | Send quotes to customers via SMS/email |
| `quotes.convert` | Convert accepted quotes into jobs |

#### Photo Permissions (`photos.*`)

| Permission | What It Controls |
|------------|-----------------|
| `photos.upload` | Upload job photos |
| `photos.view` | View job photos |
| `photos.delete` | Delete job photos |
| `photos.approve_marketing` | Approve photos for marketing use |
| `admin.photos.view` | View the admin photo gallery page |
| `admin.photos.manage` | Manage photo tags, featured status |

#### Report Permissions (`reports.*`)

| Permission | What It Controls |
|------------|-----------------|
| `reports.revenue` | View revenue reports and dashboard stats |
| `reports.financial_detail` | View detailed financial breakdowns |
| `reports.cost_margin` | View cost and margin analysis |
| `reports.employee_tips` | View all employee tip totals |
| `reports.own_tips` | View own tip totals only |
| `reports.export` | Export reports to CSV |
| `reports.quickbooks_status` | View QuickBooks sync status |

#### Staff Permissions (`staff.*`)

| Permission | What It Controls |
|------------|-----------------|
| `staff.clock_self` | Clock in/out for own shifts |
| `staff.view_own_hours` | View own time records |
| `staff.view_all_hours` | View all employees' time records |
| `staff.edit_time` | Edit time records |

#### Settings Permissions (`settings.*`)

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

#### CMS Permissions (`cms.*`)

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

### Permission Resolution

Permissions are resolved in this order:

1. **Super Admin** — Always returns `true` regardless of any permission settings
2. **User-level override** — A permission set directly on the individual employee takes highest priority
3. **Role-level default** — Falls back to the default for the employee's assigned role
4. **Deny** — If no matching permission is found at either level, access is denied

### Default Permission Summary by Role

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

### How to Assign Roles

1. Navigate to **Admin** → **Staff** in the left sidebar
2. Click a staff member's name to open their detail page
3. On the **Profile** tab, find the **Role** dropdown
4. Select the desired role from the list (includes both system roles and any custom roles)
5. Click **Save Changes**

### How to Override Individual Permissions

1. Navigate to **Admin** → **Staff** → select staff member
2. Click the **Permissions** tab
3. Each permission shows the role default (granted or denied)
4. Click the toggle to set a **user-level override** (grant or deny) that takes priority over the role default
5. Click **Save Permissions**

---

## 1.4 First-Time Setup Checklist

When setting up a fresh installation, complete these steps in order:

### Step 1: Business Profile

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

### Step 2: Staff Accounts

1. Navigate to **Admin** → **Staff** → click **Add Staff Member**
2. Fill in first name, last name, email, and phone
3. Assign a **role** (Super Admin, Admin, Cashier, or Detailer)
4. Set a **POS PIN** (4-digit code) if this person needs POS access
5. Set whether the staff member is **Bookable** (appears in online booking as an available detailer)
6. Save, then go to the **Schedule** tab to set their weekly availability (Mon-Sun, start/end times)
7. Optionally add **Blocked Dates** for upcoming days off

> The first Super Admin account is typically created during Supabase project setup. Additional staff are added through this admin interface.

### Step 3: Service Catalog

1. Navigate to **Admin** → **Catalog** → **Categories** to review/create service categories (e.g., "Exterior Detailing", "Interior Detailing", "Ceramic Coatings")
2. Navigate to **Admin** → **Catalog** → **Services** → **New Service** for each service you offer
3. Set the pricing model (vehicle size tiers, flat rate, per-unit, etc.)
4. Configure add-on suggestions and prerequisites where appropriate

> Service category management (create, rename, merge, reorder) is done through the Admin UI, not SQL migrations.

### Step 4: Product Catalog (if selling products)

1. Navigate to **Admin** → **Catalog** → **Products** → **New Product**
2. Add product name, description, SKU, pricing, images
3. Set stock quantities and reorder thresholds
4. Assign to a product category

### Step 5: Feature Toggles

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

### Step 6: Payment Integration (Stripe)

1. Set the `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variables
2. For POS card readers: navigate to **Admin** → **Settings** → **Card Reader** to register Stripe Terminal readers
3. Set the Stripe webhook endpoint URL and configure the `STRIPE_WEBHOOK_SECRET` env var
4. The webhook listens for `payment_intent.succeeded` and `payment_intent.failed` events

### Step 7: SMS Setup (Twilio)

1. Set environment variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
2. Configure the Twilio webhook URL for inbound SMS (`TWILIO_WEBHOOK_URL`)
3. Navigate to **Admin** → **Settings** → **Messaging** to configure:
   - AI auto-reply toggle and personality settings
   - After-hours message template
   - Auto-reply cooldown period

### Step 8: Email Setup (Mailgun)

1. Set environment variables: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`
2. Set `MAILGUN_WEBHOOK_SIGNING_KEY` for delivery tracking webhooks
3. Emails are used for: order confirmations, quote delivery, password resets, campaign sends, and receipt delivery

### Step 9: Tax Configuration

Navigate to **Admin** → **Settings** → **Tax Configuration** to set:
- Tax rate percentage
- Whether tax applies to products only, services only, or both

### Step 10: POS Configuration

1. **POS Favorites** — **Admin** → **Settings** → **POS Favorites**: Set up quick-action tiles for the POS Register tab
2. **POS Settings** — **Admin** → **Settings** → **POS Settings**: Configure idle timeout duration and other POS behavior
3. **Receipt Printer** — **Admin** → **Settings** → **Receipt Printer**: Upload receipt logo, set branding text, configure printer connection
4. **POS Security** — **Admin** → **Settings** → **POS Security**: Set IP whitelist if restricting POS access to specific networks

---

*Next: [Dashboard](./02-dashboard.md)*
