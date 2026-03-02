# 5. Customers

Customers are the central entity in Smart Details Auto Spa. Every appointment, job, transaction, quote, vehicle, and loyalty balance ties back to a customer record. This chapter covers the customer list, creating and editing customers, the detail page and its tabs, vehicle management, duplicate detection and merging, the customer portal, and customer types.

---

## 5.1 Customer Overview

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

## 5.2 Customer List

Navigate to **Admin** → **Customers** to view the full customer list.

### Stats Row

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

### Table Columns

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

### Search and Sort

- **Search** — Filter by name, phone number, or email. Matches partial strings.
- **Sort** — Name (alphabetical, default), Last Visit (most recent first), or Spend (highest first)

### Filters

Four filter dropdowns let you narrow the list:

| Filter | Options |
|--------|---------|
| **Customer Type** | All Types, Enthusiast, Professional, No Type Set |
| **Visit Status** | All Visits, New (0 visits), Returning (1–5 visits), Loyal (6+ visits), Inactive (90+ days since last visit) |
| **Activity** | All Activity, Has Open Quotes, Has Upcoming Appointments |
| **Tags** | Multi-select tag filter with search. Uses AND logic — selecting "VIP" and "fleet" shows only customers with both tags. |

A **Reset filters** link appears when any filter is active.

### Bulk Actions

Select multiple customers using the checkboxes, then use these bulk actions (requires `customers.edit` permission):

| Action | What It Does |
|--------|-------------|
| **Add Tag** | Opens a dialog to add a tag to all selected customers. Choose an existing tag or type a new one. |
| **Remove Tag** | Opens a dialog to remove a tag from all selected customers. |

### Header Actions

| Button | Permission | What It Does |
|--------|-----------|-------------|
| **Review Duplicates** | `customers.merge` | Opens the duplicate detection page |
| **Add Customer** | `customers.create` | Opens the new customer form |

---

## 5.3 Creating a Customer

Navigate to **Admin** → **Customers** → **Add Customer** to create a new customer record.

### Form Layout

The form is organized into three cards:

#### Card 1: Contact Information

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

#### Card 2: Marketing Info

| Field | Notes |
|-------|-------|
| **Customer Type** | Required. Choose Enthusiast or Professional. |
| **Birthday** | Month and day dropdowns + optional year text field. If month is provided, day is required (and vice versa). Year must be between 1920 and the current year if provided. |
| **SMS Marketing** | Toggle. Auto-enables when a phone number is entered; auto-disables when phone is cleared. |
| **Email Marketing** | Toggle. Auto-enables when an email is entered; auto-disables when email is cleared. |

#### Card 3: Notes & Tags

| Field | Notes |
|-------|-------|
| **Notes** | Free-text internal notes |
| **Tags** | Comma-separated list of tags (e.g., "VIP, fleet, referral") |

### Duplicate Prevention

The form performs real-time duplicate checking as you type:

- **Phone** — After entering 10+ digits, checks against existing customers. If a match is found, shows a warning: "Phone already belongs to [Name]"
- **Email** — After entering a valid email format, checks against existing customers. If a match is found, shows a warning: "Email already belongs to [Name]"

The **Create Customer** button is disabled when duplicate warnings or validation errors are present.

### What Happens on Submit

1. Phone is normalized to standard format
2. Phone and email uniqueness are verified server-side
3. Customer record is created in the database
4. If SMS or email consent is granted, marketing consent log entries are recorded
5. An audit log entry is created
6. You are redirected to the new customer's detail page

---

## 5.4 Customer Detail Page

Click any customer name from the list (or navigate to **Admin** → **Customers** → **[customer]**) to open their detail page. The page shows the customer's name, type badge, and contact info in the header, with six tabs below.

### Info Tab

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

### Vehicles Tab

Lists all vehicles associated with the customer. See [Section 5.5](#55-vehicle-management) for details.

### Loyalty Tab

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

### History Tab

Shows the customer's transaction history:

| Column | What It Shows |
|--------|--------------|
| **Date** | Transaction date and time |
| **Receipt #** | Receipt number (clickable — opens receipt dialog with full receipt preview) |
| **Employee** | Staff member who processed the transaction |
| **Method** | Payment method (Cash, Card, etc.) |
| **Status** | Badge — Completed (green), Open (blue), Voided (red), Refunded (red), Partial Refund (amber) |
| **Total** | Transaction amount |

### Quotes Tab

Shows all quotes associated with the customer (excluding soft-deleted quotes):

| Column | What It Shows |
|--------|--------------|
| **Quote #** | Quote number |
| **Date** | Creation date |
| **Status** | Badge — Draft, Sent, Viewed, Accepted, Expired, Converted |
| **Total** | Quote amount |

> Quotes are read-only in the admin. All quote creation and editing happens through the POS builder.

### Service History Tab

Displays a chronological record of all services the customer has received, organized by job. Each entry shows:

- Job date
- Vehicle serviced
- Services performed
- Before/after photo pairs (where available)
- Job status

---

## 5.5 Vehicle Management

Each customer can have multiple vehicles. Vehicles are managed from the **Vehicles** tab on the customer detail page.

### Vehicle Fields

| Field | Required | Notes |
|-------|----------|-------|
| **Category** | Yes | Automobile, Motorcycle, RV, Boat, or Aircraft |
| **Size Class** | For automobiles | Sedan, Truck/SUV (2-row), SUV 3-row/Van |
| **Specialty Tier** | For non-automobile categories | Category-specific tier dropdown (see below) |
| **Year** | No | Dropdown of recent years or "Other" for manual entry |
| **Make** | No | Auto-complete combobox with common vehicle makes |
| **Model** | No | Free text |
| **Color** | No | Free text |

### Specialty Tiers by Category

| Category | Tier Options |
|----------|-------------|
| **Motorcycle** | Standard Cruiser, Touring Bagger |
| **RV** | Based on vehicle length (multiple tiers) |
| **Boat** | Based on vessel length (multiple tiers) |
| **Aircraft** | Based on aircraft class (multiple tiers) |

### Vehicle Actions

| Action | What It Does |
|--------|-------------|
| **Add Vehicle** | Opens the vehicle form dialog in create mode |
| **Edit** (pencil icon) | Opens the vehicle form dialog pre-populated with existing data |
| **Delete** (trash icon) | Removes the vehicle after confirmation |

### How Vehicles Connect to Pricing

A vehicle's category and size class (or specialty tier) determine which pricing tier applies when booking services. See [Chapter 6: Services & Pricing](./06-services-pricing.md) for the full pricing model.

### Incomplete Vehicles

If a vehicle is saved without a make or model, it is flagged as `is_incomplete`. Incomplete vehicles still function normally but may display with limited information in job and appointment views.

---

## 5.6 Duplicate Detection & Merging

Over time, duplicate customer records can accumulate — the same person entered twice with slightly different information. The duplicate detection system finds and helps resolve these.

### Accessing the Tool

Navigate to **Admin** → **Customers** → **Review Duplicates** (requires `customers.merge` permission).

### How Duplicates Are Found

The system uses a Supabase database function (`find_duplicate_customers`) that identifies potential duplicates based on:

| Match Type | What It Checks | Confidence |
|-----------|---------------|-----------|
| **Phone** | Exact phone number match | High |
| **Email** | Exact email match (case-insensitive) | High |
| **Name + Phone** | Similar name and matching phone | High |
| **Name + Email** | Similar name and matching email | Medium |

Results are grouped into **duplicate groups**, each containing 2+ customer records that may be the same person.

### The Duplicate Review Interface

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

### Choosing Which Record to Keep

One record in each group is marked as **Keep** (the others will be merged into it). The system automatically pre-selects the best candidate based on a scoring algorithm that considers:

- Has a real first name (not a business name)
- Has a phone number
- Has an email address
- Has visit history
- Has the highest lifetime spend

You can override this by clicking a different record to select it as the keep target.

### Merging

Click **Merge** on a single group, or **Merge All** to process all groups at once.

When a merge executes:

1. All transactions, vehicles, appointments, quotes, and other linked records from the deleted records are transferred to the kept record
2. The duplicate records are deleted
3. Lifetime spend and visit counts are consolidated

> **Merging cannot be undone.** A confirmation dialog shows exactly which record will be kept and which will be deleted before proceeding.

---

## 5.7 Customer Portal

Customers can access their own account at `/account` after signing in. The portal is separate from the admin system — customers sign in via phone OTP or email + password at `/signin`.

### Portal Dashboard

The dashboard (`/account`) shows:

| Section | What It Shows |
|---------|--------------|
| **Welcome Banner** | Greeting with the customer's first name and a "Book New Appointment" button |
| **Loyalty Points** | Current point balance, dollar value equivalent, link to rewards detail |
| **Last Service** | Most recent service with vehicle info, service names, and a before/after photo slider (if photos exist) |
| **Your Coupons** | Any active coupon codes assigned to the customer, with discount details |
| **Upcoming Appointments** | Next 3 upcoming appointments (pending or confirmed) with appointment cards |

### Portal Pages

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

### Portal Authentication

Customers authenticate via:

1. **Phone OTP** (default) — Enter phone number → receive 6-digit SMS code → verify
2. **Email + password** — Alternative sign-in method with forgot password support

New customers create an account at `/signup`. The system verifies the phone number exists in the `customers` table before sending an OTP. If no matching customer record exists, the user is directed to create a new account.

> Admin and customer auth systems are completely separate. An admin email cannot be used to log into the customer portal, and vice versa.

### Managing Portal Access from Admin

From the customer detail page **Info** tab, admins can:

- **Send password reset** — Sends a reset email to the customer
- **Deactivate portal access** — Disables the customer's ability to log in (stores the `auth_user_id` as backup)
- **Reactivate portal access** — Restores previously deactivated access

---

## 5.8 Customer Types

Every customer is classified into one of two types (or left uncategorized):

| Type | Badge Color | Description |
|------|-------------|------------|
| **Enthusiast** | Green / Blue | Individual car owners who care about their vehicle's appearance |
| **Professional** | Blue / Purple | Business customers — fleet managers, dealerships, body shops |
| **Unknown** | Gray | Not yet categorized |

### Why Customer Type Matters

Customer type can be used for:

- **Filtering** — The customer list can filter by type
- **Segmentation** — Marketing campaigns can target specific customer types
- **Reporting** — Track which type drives more revenue
- **Service recommendations** — Professionals may need fleet pricing or recurring schedules

### Setting Customer Type

Customer type can be set in multiple places:

- **Create customer form** — Required field (Enthusiast or Professional)
- **Customer detail page** — Click type buttons on the Info tab
- **Customer list** — Click the type badge in the table to cycle: Unknown → Enthusiast → Professional → Unknown
- **POS** — Customer type badge in POS customer views

---

## 5.9 Tags

Tags are free-form text labels attached to customer records for flexible segmentation.

### Common Tags

While tags are completely free-form, common examples include:

- `VIP` — High-value customers
- `fleet` — Fleet/business accounts
- `referral` — Came from a referral
- `yelp` — Found through Yelp
- `ceramic` — Interested in ceramic coatings

### Managing Tags

| Where | How |
|-------|-----|
| **Create customer form** | Enter comma-separated tags |
| **Customer detail page** | Edit tags in the Notes & Tags card |
| **Customer list (bulk)** | Select multiple customers → Add Tag / Remove Tag |
| **Customer list (filter)** | Filter by tag to see all customers with a specific tag |

### Tag Filtering Behavior

Tag filters use **AND logic** — selecting multiple tags shows only customers who have **all** selected tags (not any).

---

## 5.10 Marketing Consent

Every customer has two independent consent toggles:

| Toggle | Controls | Default |
|--------|---------|---------|
| **SMS Consent** | Whether the customer can receive marketing SMS messages | Auto-enabled when phone is entered |
| **Email Consent** | Whether the customer can receive marketing emails | Auto-enabled when email is entered |

### Auto-Toggle Behavior

When creating or editing a customer:

- Entering a phone number automatically enables **SMS Consent**
- Clearing the phone number automatically disables **SMS Consent**
- Entering an email address automatically enables **Email Consent**
- Clearing the email address automatically disables **Email Consent**

Staff can manually override these toggles at any time.

### Consent Logging

All consent changes are logged in the `marketing_consent_log` and `sms_consent_log` tables for compliance. Logs record:

- Customer ID
- Channel (SMS or email)
- Action (opt_in or opt_out)
- Source (manual, admin_manual, customer self-service, keyword response)
- Timestamp

> Customers can also manage their own consent from the portal profile page (`/account/profile`). Turning off a consent toggle from the portal shows a confirmation dialog before applying.

---

## 5.11 Permissions Reference

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

*Previous: [Point of Sale (POS)](./04-pos.md) | Next: [Services & Pricing](./06-services-pricing.md)*
