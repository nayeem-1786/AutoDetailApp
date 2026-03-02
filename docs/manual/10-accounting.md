# 10. Accounting & Integrations

This chapter covers how financial data flows through the system, the QuickBooks Online integration for accounting sync, the Transactions list, and the Quotes system.

---

## 10.1 Accounting Overview

Financial data in Smart Details Auto Spa originates from three sources:

| Source | What It Creates | Where It Appears |
|--------|----------------|-----------------|
| POS transactions | Sales receipts, refunds | Admin > Transactions |
| Online store orders | Order payments via Stripe | Admin > Orders |
| Booking deposits | Payment intents via Stripe | Admin > Appointments |

All completed POS transactions can optionally sync to QuickBooks Online for bookkeeping. The sync is one-way — Smart Details is the source of truth; QBO is the accounting layer.

### What Syncs Automatically vs Manually

| Data | Auto-Sync | Manual Sync |
|------|-----------|-------------|
| POS transactions | Yes — fires in the background after each completed transaction | Yes — "Sync Transactions" button |
| Customers | Configurable — auto-sync can be enabled in QBO settings | Yes — "Sync Customers" button |
| Catalog items (services + products) | No | Yes — "Sync Catalog" button |

When QBO integration is disabled or disconnected, the POS works normally with zero impact. New transactions receive no sync status, and no API calls are made to Intuit.

---

## 10.2 QuickBooks Online Integration

Navigate to **Admin > Settings > Integrations > QuickBooks Online** to manage the QBO connection. The page has three tabs: **Settings**, **Sync**, and **Reports**.

### 10.2.1 Initial Setup — Connecting QBO

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

### 10.2.2 Account Mapping

After connecting, configure which QBO accounts receive your transaction data:

1. Go to the **Settings** tab
2. Under **Account Mapping**, set:
   - **Income Account** — The QBO income account where revenue is recorded (e.g., "Sales of Product Income" or "Services"). Dropdown loads all QBO accounts of type "Income".
   - **Deposit Account** — The QBO bank account where deposits land (e.g., "Undeposited Funds" or "Business Checking"). Dropdown loads all QBO accounts of type "Bank".
3. Click **Save Settings**

If these accounts are not mapped, transaction syncs will fail. The system validates mapping before attempting any sync.

### 10.2.3 Sync Settings

Also on the **Settings** tab:

- **Auto-Sync Customers** — Toggle on/off. When enabled, new customers created in the app are automatically pushed to QBO in the background.
- **Auto-Sync Transactions** — Toggle on/off. When enabled, completed POS transactions fire a background sync to QBO immediately after checkout. This is the primary sync mechanism.

Both toggles are saved independently and take effect immediately.

### 10.2.4 Auto-Sync (Cron)

A cron job runs every 30 minutes (`/api/cron/qbo-sync`) that:

1. Checks if QBO integration is enabled (`qbo_enabled` feature flag + valid tokens)
2. Finds all transactions with `qbo_sync_status = 'pending'` or `NULL` (completed transactions that haven't been synced)
3. Syncs each transaction to QBO as a Sales Receipt
4. Logs every sync attempt to the `qbo_sync_log` table

This catches any transactions that failed real-time sync or were created while QBO was temporarily unavailable. The cron processes transactions in chronological order with a small delay between each to respect QBO rate limits.

### 10.2.5 Manual Sync

On the **Sync** tab, four sync actions are available:

| Button | What It Does |
|--------|-------------|
| **Sync All** | Syncs unsynced transactions, customers, and catalog items in one batch |
| **Sync Customers** | Pushes all customers without a `qbo_id` to QBO |
| **Sync Transactions** | Pushes all unsynced completed transactions to QBO |
| **Sync Catalog** | Pushes all active services and products without a `qbo_id` to QBO |

Each button shows a loading state while the sync is in progress. When complete, a toast notification shows how many records were synced.

If there are any failed syncs, a **Retry Failed** button appears (red outline). Clicking it re-attempts all transactions with `qbo_sync_status = 'failed'`, processing them one at a time with a 100ms delay.

### 10.2.6 What Gets Synced

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

### 10.2.7 Sync Log

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

### 10.2.8 Retry Failed Syncs

Two retry options:

1. **Retry All Failed** — The "Retry Failed" button on the Sync tab re-processes every transaction with `qbo_sync_status = 'failed'`. Processes sequentially with 100ms delays.
2. **Retry Individual** — Specific transaction retries can be triggered via the API (`POST /api/admin/integrations/qbo/sync/retry` with `{ transactionId }`).

After retry, the sync log updates to show the new attempt's status.

### 10.2.9 Disconnecting QBO

1. On the **Settings** tab, click the **Disconnect** button
2. Confirm in the dialog: "This will revoke access tokens and disconnect from QuickBooks Online. Your sync history and settings will be preserved. You can reconnect at any time."
3. The OAuth tokens are cleared from the database
4. The connection status returns to "Not Connected"

Existing sync history and account mappings are preserved. If you reconnect later, you can resume syncing from where you left off.

### 10.2.10 Reports

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

### 10.2.11 OAuth Token Lifecycle

- **Access token** — Expires after 1 hour. The `QboClient` automatically refreshes it using the refresh token before making API calls. If the token is within 5 minutes of expiry, it's proactively refreshed.
- **Refresh token** — Expires after 100 days. If it expires, the connection becomes invalid and you must disconnect and reconnect via the Settings tab.
- Tokens are stored in the `business_settings` table (not environment variables) so they can be updated at runtime.

---

## 10.3 Transactions

Navigate to **Admin > Transactions** in the sidebar to view all POS transactions.

### 10.3.1 Transaction List

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

### 10.3.2 Transaction Types

| Type | Description |
|------|------------|
| `sale` | Standard POS sale — services, products, or both |
| `refund` | Partial or full refund of a previous transaction |

### 10.3.3 How Transactions Relate to Other Entities

- **Jobs** — A transaction is linked to a job via the `job_id` foreign key. When a POS ticket is checked out, a job record is created and the transaction is linked to it.
- **Appointments** — When a job is created from a booked appointment, the appointment's `appointment_id` is carried through to the job, creating an indirect link: Appointment → Job → Transaction.
- **Quotes** — When a quote is converted to a job via the POS, the job's `quote_id` links back to the originating quote. The transaction then links to the job.
- **Orders** — Online store orders have their own payment flow through Stripe Checkout, separate from POS transactions. They appear in Admin > Orders, not in Transactions.

---

## 10.4 Quotes

Quotes are estimates sent to customers before work is performed. Navigate to **Admin > Quotes** in the sidebar.

### 10.4.1 Quote List

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

### 10.4.2 Quotes Are Read-Only in Admin

All quote creation and editing happens through the POS quote builder. The admin panel provides a read-only view with the ability to:

- View quote details
- See communication history
- Navigate to the POS builder via deep-links for editing

To create a new quote from the admin, click the "New Quote" button which deep-links to `/pos/quotes?mode=builder`. To edit an existing quote, the detail page links to `/pos/quotes?mode=builder&quoteId=<id>`.

### 10.4.3 Quote Detail Page

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

### 10.4.4 Public Quote Page (Customer-Facing)

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

### 10.4.5 Quote-to-Job Conversion

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

### 10.4.6 Quote Reminders (Automated Cron)

A cron job runs hourly at the :30 minute mark (`/api/cron/quote-reminders`) that:

1. Finds quotes that are "sent" or "viewed" and approaching their expiry date
2. Sends reminder SMS/email to the customer
3. Marks expired quotes as "expired" when they pass their `valid_until` date

The quote validity period is configurable in **Admin > Settings > Business Profile > Booking & Quotes > Quote Validity (Days)**. The default is 14 days.

### 10.4.7 Quote Communications Log

Every quote tracks its communication history in the `quote_communications` table:

- **Type** — "sms" or "email"
- **Recipient** — Phone number or email address
- **Message** — The content sent (or a summary for emails)
- **Status** — Delivery status
- **Timestamp** — When the message was sent

This log is visible on the quote detail page under the Communications section.

### 10.4.8 Quote PDF Generation

Quotes can be generated as PDF documents via the API (`GET /api/quotes/[id]/pdf`). The PDF includes:

- Business header with name, address, and contact info
- Quote number and date
- Customer and vehicle details
- Line items table with quantities, unit prices, and totals
- Subtotal, tax, and grand total
- Notes
- Validity period

### 10.4.9 Resending Quotes

Quotes can be resent to customers from the POS:

- **Draft quotes** — Sending changes their status to "sent"
- **Non-draft quotes** — Resending keeps the current status unchanged
- The `sent_at` field is updated on every send/resend to track "Last Contacted"
- Both SMS and email delivery methods are available

### 10.4.10 Soft-Delete

Quotes use soft-delete via the `deleted_at` column. When a quote is deleted:

- It no longer appears in the admin quote list
- The public quote page shows a friendly "This Estimate Is No Longer Available" message with contact options
- The quote number remains reserved (the number generator queries by `quote_number DESC`, not `created_at`, to prevent number reuse after deletion)
