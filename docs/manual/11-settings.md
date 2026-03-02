# 11. Settings & Configuration

This chapter covers every settings page in the admin panel, staff management, and the role-based permission system. Navigate to **Admin > Settings** to access the settings hub.

---

## 11.1 Settings Overview

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

## 11.2 Business Profile

**Path:** Admin > Settings > Business Profile

This page configures the core business identity. It has five sections:

### Business Information

| Field | Description |
|-------|-------------|
| Business Name | Displayed in header, footer, receipts, emails, and SEO |
| Phone | Customer-facing phone number |
| Email | Contact email for customer communications |
| Website | Public website URL |
| Address | Full street address (used in footer, SEO, JSON-LD, receipts) |

All fields save to the `business_settings` table and are fetched throughout the app via `getBusinessInfo()`. The business name, phone, address, and email are never hardcoded — every component reads from this central source.

### Business Hours

Per-day schedule editor with:
- Toggle switch for each day of the week (enabled/disabled)
- Start time and end time fields for enabled days
- Changes affect booking availability and the public-facing business hours display

### Booking & Quotes

| Field | Description |
|-------|-------------|
| Deposit Amount | Dollar amount required as a deposit when customers book online (default: $50) |
| Quote Validity (Days) | How many days a quote remains valid before expiring (default: 14) |

The deposit amount syncs to the booking payment step. The quote validity syncs across the POS date picker, voice agent, Twilio webhook, and email templates.

### SEO & Location

| Field | Description |
|-------|-------------|
| Site Description | Meta description used for the homepage and OG tags |
| Latitude / Longitude | GPS coordinates for JSON-LD structured data |
| Service Area (miles) | Radius used in JSON-LD geo data |
| Price Range | Price range indicator (e.g., "$$") for structured data |

### Social Share Image (OG Image)

Upload a custom image used when the site is shared on social media. Supports JPG, PNG, and WebP. If no custom image is uploaded, the system generates a fallback automatically.

---

## 11.3 Feature Toggles

**Path:** Admin > Settings > Feature Toggles

Feature toggles enable or disable entire sections of the platform. Each toggle is stored in the `feature_flags` table and checked at runtime via `isFeatureEnabled()` (server-side) or `useFeatureFlag()` (client-side).

Toggles are grouped by category:

### Core POS
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Cash Drawer Management | `cash_drawer` | Cash drawer open/close tracking in POS |
| Walk-In Flow | `walk_in_flow` | Walk-in job creation from POS Jobs tab |

### Marketing
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Marketing Campaigns | `marketing_campaigns` | Campaign creation and sending in Admin > Marketing |
| Marketing Automations | `marketing_automations` | Lifecycle automation rules |
| Coupons & Promotions | `coupons_promotions` | Coupon creation, validation, and POS application |
| Google Review Requests | `google_review_requests` | Automated review solicitation after completed jobs |

### Communication
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Two-Way SMS | `two_way_sms` | SMS inbox, AI auto-responder, and conversation management |

### Booking
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Online Booking | `online_booking` | Public booking wizard at `/book` |
| Mobile Services | `mobile_services` | Mobile zone selection during booking |

### Integrations
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| QuickBooks Online | `qbo_enabled` | QBO sync engines and auto-sync cron |

### Operations
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Photo Gallery | `photo_gallery` | Public gallery page and gallery API endpoint |

### Future
| Toggle | Key | What It Controls |
|--------|-----|-----------------|
| Recurring Services | `recurring_services` | Reserved for future recurring appointment feature |

Each toggle shows a status badge (Enabled/Disabled) and updates immediately when flipped. Disabling a toggle does not delete data — it only hides the UI and disables the related functionality.

---

## 11.4 Staff Management

**Path:** Admin > Staff

### Staff List

The staff list page shows all employees in a table:

| Column | Description |
|--------|-------------|
| Name | Full name (clickable link to detail) |
| Email | Staff email address |
| Role | Role badge (Super Admin, Admin, Cashier, Detailer, or custom) |
| POS PIN | Status indicator — green "Enabled" if PIN is set, gray "Disabled" if not |
| Status | Active or Inactive badge |

A **New Staff** button opens the creation form.

### Creating a Staff Account

**Path:** Admin > Staff > New Staff

Required fields:
- **First Name** and **Last Name**
- **Email** — Must be unique across all staff
- **Phone** — Optional
- **Role** — Dropdown populated from the `roles` table (supports custom roles)
- **POS PIN** — Optional 4-digit numeric code. Setting a PIN grants POS access.
- **Bookable for Appointments** — Toggle on if this staff member should appear in the booking calendar

On save, a Supabase Auth user is created and linked to the employee record. The staff member can then log in at `/login` with their email and a password set by the admin.

### Staff Detail Page

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

### Deactivating Staff

Click **Deactivate** on the staff detail Profile tab:
- A confirmation dialog appears explaining the consequences
- Deactivated staff lose access to the system (admin and POS)
- Their account and data are preserved — not deleted
- Click **Reactivate** to restore access

---

## 11.5 Roles & Permissions

**Path:** Admin > Staff > Role Management

### Built-In Roles

The system ships with four built-in roles:

| Role | Display Name | Intended For | Key Characteristics |
|------|-------------|--------------|-------------------|
| `super_admin` | Super Admin | Business owner | Full unrestricted access. Bypasses all permission checks. |
| `admin` | Admin | Trusted managers | Near-full access. Cannot void transactions, override pricing, delete customers, or access system settings. |
| `cashier` | Cashier | Register operators | POS-focused. Can process payments, create tickets, create quotes. No marketing, inventory management, or CMS access. |
| `detailer` | Detailer | Field technicians | Job-focused. Can view/manage jobs, upload photos, clock in/out. No POS payment processing or admin panel access. |

### Permission Categories and Keys

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
| `pos.override_pricing` | Yes | No | No | No |
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

### Permission Resolution Order

When checking whether an employee has a permission:

1. **Super Admin** — Always returns `true`, bypasses all checks
2. **Employee-level override** — If an override exists for this specific employee, use it (grant or deny)
3. **Role-level default** — Fall back to the role's default for this permission
4. **Deny** — If no matching permission is found, access is denied

### Custom Role Creation

1. Navigate to **Admin > Staff > Role Management**
2. Click **Create Role**
3. Enter a role name and display name
4. The new role starts with no permissions (all denied)
5. Toggle individual permissions on/off for the role
6. Assign the role to staff members from their detail page

### Reset to Defaults

On the Role Management page, each built-in role has a **Reset to Defaults** button that restores all permissions for that role to their original values (as defined in the `ROLE_PERMISSION_DEFAULTS` constant).

---

## 11.6 Messaging Settings

**Path:** Admin > Settings > Messaging

Configures the AI auto-responder and conversation lifecycle. Shows a warning banner if the **Two-Way SMS** feature toggle is disabled.

### AI Assistant

| Setting | Description |
|---------|-------------|
| Enable AI Auto-Responder | Master toggle for automatic AI replies to inbound SMS |
| Audience — Business Hours | Toggle pills to select who gets AI replies during business hours: "Unknown Numbers" and/or "Known Customers" |
| AI Prompt | Textarea containing the system prompt that guides the AI's tone and behavior. An "Apply Standard Template" button resets it to the default prompt. |

### Conversation Lifecycle

| Setting | Description |
|---------|-------------|
| Auto-Close After | How many hours of inactivity before a conversation is automatically closed (dropdown: 1h to 72h) |
| Auto-Archive After | How many days after closing before a conversation is archived (dropdown: 1 to 30 days) |

---

## 11.7 Notification Recipients

**Path:** Admin > Settings > Notifications

Manages who receives automated notification emails (currently used for stock alerts).

### Recipient Table

| Column | Description |
|--------|-------------|
| Email | Recipient email address |
| Type | Badge showing notification type (e.g., "Low Stock") |
| Active | Toggle to enable/disable without deleting |
| Delete | Remove the recipient |

### Adding a Recipient

1. Enter an email address in the input field
2. Select the alert type from the dropdown (Low Stock or All)
3. Click **Add**

Duplicate email + type combinations are rejected.

### Alert Schedule

Stock alerts are sent daily at **8:00 AM PST** by the `stock-alerts` cron job. A 7-day cooldown prevents the same product from triggering repeated alerts. If no recipients exist, the business email is auto-populated as a default.

---

## 11.8 Mobile Zones

**Path:** Admin > Settings > Mobile Zones

Configures service zones for mobile detailing with distance-based surcharges.

### Zone Table

| Column | Description |
|--------|-------------|
| Zone Name | Display name (e.g., "Local — 0-10 miles") |
| Distance Range | Min and max distance in miles |
| Surcharge | Dollar amount added to the service price for travel |
| Available | Toggle to enable/disable the zone |

### Creating/Editing a Zone

Click **Add Zone** or the edit icon on an existing zone:
- **Zone Name** — Free text label
- **Min Distance** and **Max Distance** — Miles (numeric)
- **Surcharge** — Dollar amount (numeric)
- **Display Order** — Controls the sort order in the booking wizard

A warning banner appears if the **Mobile Services** feature toggle is disabled.

### How Zones Affect Pricing

During booking, the customer selects their service location. If they choose mobile service, the system matches their area to a zone and adds the zone's surcharge to the total. Zones are also used in the POS when creating mobile jobs.

---

## 11.9 Tax Configuration

**Path:** Admin > Settings > Tax Configuration

Simple tax settings:

| Setting | Description |
|---------|-------------|
| Tax Rate | Percentage rate (displayed as %, stored as decimal). Example: entering "10.25" means 10.25% tax |
| Products Only | Toggle switch. When ON, tax applies only to products, not services. When OFF, tax applies to both products and services. |

Tax is calculated at checkout time (both POS and online store) using the rate stored in `business_settings`.

---

## 11.10 Card Reader (Stripe Terminal)

**Path:** Admin > Settings > Card Reader

Manages Stripe Terminal hardware for in-person card payments.

### Locations

Before registering a reader, you need at least one Stripe Terminal location:
- Click **Create Location** to add a new one
- Select the active location from the dropdown

### Registering a Reader

1. Power on the Stripe Terminal reader (WisePOS E)
2. The reader displays a **pairing code** on its screen
3. Enter the pairing code in the **Registration Code** field
4. Optionally set a label (default: "POS Reader")
5. Click **Register**

The reader appears in the registered readers list.

### Registered Readers

| Column | Description |
|--------|-------------|
| Label | Reader name |
| Device Type | Hardware model (e.g., "WisePOS E") |
| Status | Online (green) or Offline (gray) badge |
| Location | Assigned location name |
| Delete | Remove the reader registration |

### Troubleshooting

- **Reader shows offline**: Check that the reader has WiFi connectivity and is powered on. The status updates on page refresh.
- **DNS resolution in PWA**: On iPad PWA, Stripe Terminal requires a pfSense DNS exception for `stripe-terminal-local-reader.net`. Desktop browsers bypass this via DoH.

---

## 11.11 Receipt Printer

**Path:** Admin > Settings > Receipt Printer

Configures receipt printing for POS transactions.

### Printer Connection

- **Printer IP Address** — The network IP of the receipt printer

### Header Branding

Override the business profile defaults for receipt-specific branding:
- Business name override
- Phone number override
- Address override
- Email override
- Website URL override

Leave fields blank to use the values from Business Profile.

### Logo

- Upload a receipt logo (square format recommended)
- **Logo Width** — Size in pixels (adjustable)
- **Logo Placement** — Before or after the header text
- **Logo Alignment** — Left, center, or right

### Custom Text Zones

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

### Live Preview

Click **Preview Receipt** to see a rendered preview using sample transaction data. The preview dialog shows exactly how the receipt will print with all branding, logo, and custom text applied.

---

## 11.12 POS Settings

**Path:** Admin > Settings > POS Settings

### Auto-Logout Timer

Configure the idle timeout before the POS shows its lock screen:
- **Minutes** — 1 to 480 minutes
- When the POS is idle for this duration, a transparent overlay appears and the staff member must re-enter their PIN to continue
- This is the "idle timeout" system — the session stays alive, only the screen is locked

> The separate JWT token expiry (12 hours, hardcoded) is a different system that fully logs out the user.

### Vehicle Makes Management

Manage the list of vehicle makes available in POS and booking forms:

- **Category Tabs** — Switch between vehicle categories: Automobile, Motorcycle, RV, Boat, Aircraft
- **Search** — Filter makes within the selected category
- **Add Make** — Enter a new make name. Auto-formats to title case with acronym handling (e.g., "bmw" → "BMW")
- **Toggle** — Enable/disable individual makes (disabled makes don't appear in dropdowns)
- **Delete** — Remove a make entirely

---

## 11.13 POS Security

**Path:** Admin > Settings > POS Security

Controls IP-based access restriction for the POS system.

### IP Whitelist

| Setting | Description |
|---------|-------------|
| Enable IP Restriction | Master toggle. When OFF, POS is accessible from any IP. When ON, only whitelisted IPs can access the POS. |
| Current IP | Auto-detected. Shows your current IP address with an "Add My IP" button. |
| IP Entries | List of allowed IPs, each with a label name and the IP address. |

### Adding an IP

1. Click **Add IP** or **Add My IP**
2. Enter a label (e.g., "Store iPad") and the IP address
3. IP validation supports both IPv4 and IPv6 formats

### Warnings

- If the whitelist is enabled but empty, a warning appears: POS will be inaccessible from all IPs
- If your current IP is not in the whitelist, a warning appears: you may lose POS access

---

## 11.14 POS Favorites

**Path:** Admin > Settings > POS Favorites

Configures the quick-action tiles on the POS Register tab for fast access to common items.

### Tile Types

| Type | Description |
|------|-------------|
| Product | Quick-add a specific product to the ticket |
| Service | Quick-add a specific service |
| Custom Amount | Enter a custom dollar amount |
| Customer Lookup | Open the customer search |
| Discount | Apply a percentage or fixed discount |
| Surcharge | Add an extra charge |

### Creating/Editing a Tile

1. Click **Add Tile** or edit an existing one
2. Select the **type** from the dropdown
3. For Product/Service types, select the specific item from a picker
4. Set a **label** (displayed on the tile)
5. Choose a **color** from the 12-color × 6-shade palette
6. Optionally set a **dark mode color** override
7. Preview the tile appearance in real-time

### Reordering

Use the up/down arrow buttons to reorder tiles. The order in the admin matches the order on the POS Register tab.

---

## 11.15 Shipping Settings

**Path:** Admin > Settings > Shipping

Full Shippo integration configuration for the online store.

### API Key Management

- **Mode Toggle** — Switch between Test and Live mode
- **API Key** — Enter your Shippo API key (visibility toggle to show/hide)
- **Test Connection** — Validates the API key against Shippo

### Ship-From Address

Full address form for the origin of shipments:
- Name, street, city, state (dropdown), zip code, country
- **Validate Address** — Checks the address against Shippo's address validation

### Default Package Dimensions

Set default package measurements (length, width, height in inches, weight in pounds) used when individual products don't specify their own dimensions.

### Carrier Preferences

- **Load Carriers** — Fetches your available carriers from Shippo
- Toggle individual carriers on/off (e.g., USPS, UPS, FedEx)

### Service Level Filter

14 common service levels with checkbox toggles:
- USPS: Priority, Priority Express, First Class, Parcel Select, Media Mail, Ground Advantage
- UPS: Ground, 3 Day Select, 2nd Day Air, Next Day Air
- FedEx: Ground, Express Saver, 2Day, Standard Overnight

### Pricing & Fees

| Setting | Description |
|---------|-------------|
| Free Shipping Threshold | Minimum order amount for free shipping ($0 = always free) |
| Flat Rate Shipping | Fixed shipping rate when not using calculated rates |
| Handling Fee | Additional fee added to every shipment |

### Display Preferences

| Setting | Description |
|---------|-------------|
| Show Estimated Delivery | Display estimated delivery dates at checkout |
| Show Carrier Logos | Display carrier logos next to shipping options |
| Sort Order | How shipping options are sorted: by price (cheapest first) or speed (fastest first) |

### Local Pickup

Toggle to enable local pickup as a shipping option at checkout.

---

## 11.16 Review Settings

**Path:** Admin > Settings > Reviews

### Review Links

| Field | Description |
|-------|-------------|
| Google Review URL | Direct link to your Google Business review page. Preview link opens in new tab. |
| Yelp Review URL | Direct link to your Yelp review page. |

These URLs are used by the review solicitation automation and shared in post-service messages.

### Website Review Data

**Google Section** (read-only):
- Rating (e.g., 4.8)
- Review count
- Last updated timestamp

**Yelp Section** (manually editable):
- Rating input
- Review count input

This data feeds the trust bar and review badges on the public website.

### Google Review Requests

Shows the status of the `google_review_requests` feature flag. Links to:
- **Feature Toggles** — To enable/disable the automation
- **Automations** — To configure the review request lifecycle rules (timing, templates, etc.)

---

## 11.17 Coupon Enforcement

**Path:** Admin > Settings > Coupon Enforcement

Controls how customer type restrictions on coupons are handled:

| Mode | Behavior |
|------|----------|
| **Soft** (Recommended) | Shows a warning toast when a coupon is applied to the wrong customer type, but allows it to proceed |
| **Hard** | Rejects the coupon entirely if the customer type doesn't match |

This setting is stored as `coupon_type_enforcement` in `business_settings` with values `soft` or `hard`.

---

## 11.18 Audit Log

**Path:** Admin > Settings > Audit Log

The audit log tracks all significant user actions across the admin panel and POS. Restricted to `super_admin` role.

### What Gets Logged

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

### Viewing the Log

**Filters:**
- **Search** — Search by entity label, user email, or employee name
- **Entity Type** — Filter by type (settings, employee, customer, etc.)
- **Action** — Filter by create, update, or delete
- **Date Presets** — Quick filters: Today, Last 7 Days, Last 30 Days, All Time

**Table:** Paginated table (50 entries per page) with clickable rows that open a detail dialog showing the full entry including IP address and JSON details.

### Exporting

Click **Export CSV** to download the filtered log entries (up to 5,000 records) as a CSV file with columns: Date, User, Employee, Action, Type, Entity, Details, Source, IP.

### Log Retention

A cron job runs daily at **3:30 AM PST** (`/api/cron/cleanup-audit-log`) that automatically deletes audit log entries older than a configurable retention period. This prevents unbounded table growth.
