# 4. Point of Sale (POS)

The POS is the daily operations hub. Staff use it to ring up services, process payments, manage jobs, create quotes, and reconcile the cash drawer. It is optimized for iPad in landscape orientation and runs as a Progressive Web App (PWA) in fullscreen mode.

---

## 4.1 POS Overview

### What the POS Handles

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

### Accessing the POS

Navigate to `/pos` on any device. The POS is designed for iPad but works on desktop browsers as well.

### PWA Setup on iPad

For the best experience, add the POS to the iPad home screen:

1. Open Safari and navigate to your site's `/pos` URL
2. Tap the **Share** button (square with up-arrow)
3. Scroll down and tap **Add to Home Screen**
4. Name it (e.g., "POS") and tap **Add**

The POS will now launch in fullscreen mode without Safari's address bar. The viewport is locked to prevent zoom, and the status bar is set to black for a native-app feel.

> If you use a pfSense firewall, a DNS exception is required for the Stripe Terminal card reader to work in PWA mode. Add `private-domain: "stripe-terminal-local-reader.net"` in Unbound custom options. Without this, iPad Safari PWA cannot resolve Stripe's local reader DNS. Desktop browsers bypass this via DNS-over-HTTPS.

### PIN Login

1. Open the POS (on the home screen icon or at `/pos`)
2. The PIN screen appears with 4 dot indicators
3. Enter your **4-digit PIN** on the keypad
4. The PIN auto-submits after the 4th digit — no "Submit" button needed
5. On success, the workspace loads with your name and role in the header

If the PIN is wrong, the dots shake and clear. Re-enter the correct PIN.

> PINs are set by an admin in **Admin > Staff > [name] > Profile tab > POS PIN Code**. A staff member without a PIN cannot access the POS. PIN presence = POS access.

---

## 4.2 POS Layout

The POS screen is divided into four regions:

### Header Bar (Top)

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

### Catalog Panel (Left Side)

The left side of the screen shows the product and service catalog. Its content depends on the active tab:

- **Register** — Favorites grid + numeric keypad for custom amounts
- **Products** — Full product catalog with category browsing and search
- **Services** — Full service catalog with category browsing and search
- **Promotions** — Available coupons and promotions for the selected customer

### Ticket Panel (Right Side, 380px Fixed Width)

The right side always shows the current ticket:

- Customer and vehicle summary (top)
- Line items with prices and quantities (scrollable middle)
- Coupon, loyalty, and discount controls
- Subtotal, tax, discounts, and total
- Clear, Hold, and Checkout buttons (bottom)

### Bottom Navigation (Fixed Bottom)

Five tabs across the bottom of the screen:

| Tab | Icon | Destination |
|-----|------|-------------|
| **Transactions** | Receipt | Transaction history and search |
| **Quotes** | FileText | Quote list, builder, and detail |
| **Sale** | ShoppingCart | Main register (catalog + ticket) |
| **Jobs** | ClipboardList | Active job queue and management |
| **More (...)** | Ellipsis | Theme toggle, cash drawer, EOD, keyboard shortcuts, dashboard link |

Tapping the **Sale** tab when you are already on it resets the Register tab and clears the search bar.

### More Menu

The More button (...) opens a popover with:

- **Theme selector** — Light / Dark / System (3-way toggle)
- **Cash Drawer** — Shows status (green = open, red = closed). Links to End of Day page.
- **Refresh App** — Visible only in PWA standalone mode. Forces a page reload.
- **Fullscreen** — Visible only on desktop (non-PWA). Toggles fullscreen mode.
- **Keyboard Shortcuts** — Opens a shortcuts reference dialog
- **Go to Dashboard** — Links to `/admin`

---

## 4.3 Daily Workflow — Opening

1. **Log in with your PIN** at the PIN screen
2. **Check the card reader** — Look at the header. A green Wifi icon with the reader name means connected. If it shows "No Reader" or a red icon, tap it to reconnect.
3. **Open the cash drawer** — Navigate to **More > Cash Drawer** (or the End of Day page). Count your starting float by denomination and tap **Open Register**. The drawer status turns green.

> The cash drawer session is stored locally on the iPad. It syncs across tabs automatically, so opening the drawer on one tab updates the status on all tabs.

---

## 4.4 Register Tab — Building a Ticket

The Register tab is the default view when you open the POS. It has two columns: **Favorites** on the left and a **Keypad** on the right.

### Favorites Grid

Up to 15 quick-action tiles arranged in a 3x5 grid. Each tile is color-coded and has an icon. Favorites are configured in **Admin > Settings > POS Favorites**. Tile types include:

| Type | What It Does |
|------|-------------|
| **Product** | Adds the product to the ticket immediately |
| **Service** | Adds the service (may open a pricing picker if multiple tiers exist) |
| **Custom Amount** | Scrolls to the keypad for entering a dollar amount |
| **Customer Lookup** | Opens the customer search dialog |
| **Surcharge** | Calculates a percentage of the current subtotal and adds it as a line item |

### Browsing the Catalog

Switch to the **Products** or **Services** tab to browse the full catalog:

1. **Categories** — The default view shows large tiles for each category with the item count and a preview image. Tap a category to see its items.
2. **Back to categories** — Tap the back arrow labeled "All Categories" to return to the category view.
3. **Category pills** — A scrollable row of category filter buttons appears above the item grid. Tap "All" to show everything or tap a specific category.

### Searching

The search bar at the top accepts text input or barcode scans:

- **Text search** — Type at least 2 characters. Products are searched by name, SKU, and barcode. Services are searched by name. Results appear after a 200ms debounce.
- **Barcode scanning** — Point the scanner at a product barcode. The POS detects the rapid input and automatically adds the matching product to the ticket.
- **Global search** — When on the Register tab, searching shows results from both products and services combined.
- **Clear** — Tap the X button to clear the search and return to category view.

### Adding Services

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

### Adding Products

Tap a product card to add it. Products are added immediately with a quantity of 1. To add multiple, tap the product detail dialog (shown for catalog-browser views) and adjust the quantity before adding.

Products show stock status on their cards. "Out of stock" appears in red when quantity is zero.

### Using the Keypad for Custom Amounts

The right column of the Register tab (or the standalone Keypad tab) provides a numeric keypad:

1. Enter an amount using the digit buttons (stored in cents internally)
2. Optionally tap **+ Note** to add a description (max 100 characters)
3. Tap **Add to Ticket** to add the custom amount as a line item

The dollar display adapts its font size to the number of digits entered. Maximum amount is $99,999.99.

### Editing Line Items

In the ticket panel, each line item shows:

- **Item name** with tier/size info and per-unit breakdown
- **Quantity** — Products and custom items have +/- stepper controls. Tap the count to type a quantity directly. Services are locked at 1 (per-unit services show unit controls).
- **Notes** — Tap the sticky note icon to add or edit a note on the item. Notes appear in italic gray below the item name.
- **Price** — Right-aligned total with tax breakdown.
- **Delete** — On desktop, a trash icon appears. On iPad, swipe left on the item to reveal a red delete zone. Swipe past the 100px threshold to remove the item. A 5-second undo toast appears after deletion.

### Add-On Suggestions

When services on the ticket have configured add-on suggestions, a blue "Suggested Add-Ons" banner appears in the ticket panel. Each suggestion shows as a tappable chip with the add-on name and combo price (if set). Tapping a chip opens the service detail dialog for that add-on.

Add-on suggestions filter out services already on the ticket and are deduplicated if multiple parent services suggest the same add-on. The banner can be dismissed and reappears when new services are added.

Individual line items also show an expandable "N add-ons available" section with addon suggestions specific to that service, including combo pricing and savings calculations.

### Applying Coupons

Below the line items in the ticket panel:

1. Tap **Add Coupon**
2. Enter the coupon code (auto-uppercased)
3. Tap **Apply** or press Enter
4. The system validates the code against the current cart items, customer, and subtotal
5. On success, a green badge shows the code and discount amount
6. Tap the X on the badge to remove the coupon

If a different coupon is already applied and you try to apply a new one, a confirmation dialog asks whether to replace it.

### Promotions Tab

Switch to the **Promotions** tab (requires a customer to be selected) to see available promotions organized in three sections:

- **Exclusive (For You)** — Customer-specific offers (green accent)
- **Available** — Promotions the current cart qualifies for (blue accent)
- **Add to Unlock** — Promotions that require adding specific items to qualify (amber accent, shows what to add)

Each promotion card shows the code, discount amount, expiry badge, and an **Apply** or **Remove** button. Promotions refresh automatically when the customer or cart items change.

---

## 4.5 Customer Management in POS

### Looking Up a Customer

Tap the dashed "Guest" area at the top of the ticket panel (or use a Customer Lookup favorite tile) to open the search dialog:

1. Type a name or phone number (minimum 2 characters, 300ms debounce)
2. If the input looks like a phone number (all digits), it searches the phone field
3. Otherwise, it searches first and last name
4. Results show: name, phone, visit count, and loyalty points balance
5. Tap a result to select that customer

Each result row also shows a **customer type badge** that cycles through: Unknown (gray) > Enthusiast (blue) > Professional (purple) > Unknown. Tap the badge to change the type.

### Creating a New Customer

From the customer lookup dialog, tap **New Customer**:

1. Fill in **First Name**, **Last Name**, and **Mobile** (required)
2. Optionally add an **Email**
3. Select **Customer Type** — Enthusiast (blue) or Professional (purple)
4. The form runs a **duplicate check** as you type the phone number (after 10 digits) or email. If a match is found, a red warning appears and the Create button is disabled.
5. Tap **Create** to save

The newly created customer is automatically selected for the ticket.

### Customer Type Prompt

If you proceed to checkout and the selected customer has no type set, a prompt appears:

- **Enthusiast** — "Personal vehicle owner who cares about their car"
- **Professional** — "Detailer, dealer, fleet manager, or other business customer"
- **Skip for now** — Proceeds without setting a type

### Guest Checkout

Tap **Guest** in the customer lookup dialog to proceed without a customer. The ticket header shows "Guest — tap to add customer."

### Vehicle Selection

After selecting a customer, a vehicle selector appears showing their vehicles on file:

- Each vehicle shows year, make, model, color, and size/category
- The currently selected vehicle is highlighted in blue with a checkmark
- Tap a vehicle to select it
- Tap **Add Vehicle** to create a new one

When a vehicle is selected, service prices automatically recalculate based on the vehicle's size class (for automobiles) or specialty tier (for motorcycles, RVs, boats, aircraft).

### Creating a New Vehicle

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

### Customer & Vehicle Summary

Once a customer and vehicle are set, the ticket header shows:

- Customer name, phone, and type badge
- Vehicle label (year make model) with size or category in parentheses
- **X** button to clear the customer and vehicle
- Tap the vehicle row to change vehicles or the customer row to change customers

---

## 4.6 Checkout Flow

Tap **Checkout** at the bottom of the ticket panel. If a customer is selected but no vehicle is attached, an error toast appears and the vehicle selector opens. If the customer has no type set, the type prompt appears first.

### Tip Screen

Before payment method selection, an optional tip screen may appear (depending on configuration) showing:

- The current total
- Preset tip percentage buttons
- A custom tip amount option
- "No Tip" to skip

### Payment Method Selection

The checkout overlay opens with four payment method buttons:

| Method | Description | Availability |
|--------|-------------|-------------|
| **Cash** | Enter tendered amount, view change | Always available (including offline) |
| **Card** | Process via Stripe Terminal reader | Online only |
| **Check** | Record check number | Online only |
| **Split** | Part cash + part card | Online only |

When offline, only Cash is enabled. Card, Check, and Split show as disabled.

### Cash Payment

1. Enter the tendered amount using quick buttons ($20, $50, $100, Exact) or type a custom amount
2. The change due calculates in real-time
3. Tap **Complete Payment** when the tendered amount meets or exceeds the total
4. **Online**: Transaction saves to the database immediately
5. **Offline**: Transaction queues to the device's local storage (IndexedDB) with an amber warning banner. It syncs automatically when connectivity returns.

### Card Payment

1. The system creates a Stripe PaymentIntent (minimum $0.50)
2. The screen shows "Waiting for card..." — present the card to the reader (tap, insert, or swipe)
3. The screen updates to "Processing..." while Stripe confirms the payment
4. On success, the transaction saves with the card brand, last 4 digits, and any on-reader tip
5. On failure, an error message appears with a retry option

> If the customer adds a tip on the card reader, the system captures it automatically by comparing the authorized amount to the original total.

### Check Payment

1. Optionally enter the check number
2. Tap **Complete Payment**
3. The check number is recorded in the transaction notes

### Split Payment

1. Choose mode: **Enter Cash Amount** or **Enter Card Amount**
2. Enter the primary amount — the remainder auto-calculates for the other method
3. Quick presets: 50/50 split, $20, $50, $100
4. Confirm the split and proceed
5. The card portion processes through Stripe Terminal (same as Card Payment)
6. Both payment methods are recorded on the transaction

### Payment Complete

After successful payment:

- A green checkmark and "Payment Complete" heading appear
- Receipt number (if synced) or "Offline" badge (if queued)
- Payment summary: tendered/change (cash), approved amount (card), or split breakdown
- Tip amount (if any)
- Receipt delivery options (see below)
- **New Ticket** button to clear and start fresh

---

## 4.7 Receipt Options

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

## 4.8 Held Tickets

### Holding a Ticket

Tap **Hold** at the bottom of the ticket panel to pause the current ticket. The ticket is saved to a local held list with the customer name (or "Walk-in"), item count, total, and timestamp.

### Viewing Held Tickets

Open held tickets from the bottom nav (or press Esc when the panel is open). The panel shows:

- **Ticket cards** with customer name, item count, total, and time held (e.g., "5m ago", "1h 20m ago")
- **Resume** button (blue) on each card
- **Remove** button (trash) on each card to discard

### Resuming a Held Ticket

Tap **Resume** on a held ticket:

- If the current ticket is **empty**, the held ticket restores immediately
- If the current ticket **has items**, a confirmation dialog asks whether to hold the current ticket and resume the selected one

---

## 4.9 Loyalty Program

When the loyalty program feature flag is enabled and a customer is selected, an amber loyalty panel appears in the ticket:

- **Points balance** (e.g., "250 pts")
- **Dollar equivalent** shown in parentheses (e.g., "worth $2.50") if the balance meets the redemption minimum
- **Redeem button** — Tap to apply loyalty points as a discount. Tap again to cancel. The button changes to show the discount amount (e.g., "Redeeming -$2.50").
- **Earn preview** — Shows how many points this purchase will earn (e.g., "Will earn ~25 pts from this purchase"), visible when not redeeming

Points are calculated at 1 point per $1 of eligible spend (water products excluded). Redemption value is $0.05 per point. Minimum redemption is 100 points.

> Loyalty points earned are recorded automatically at checkout. If a refund is later issued, points are proportionally adjusted.

---

## 4.10 Jobs Tab

The Jobs tab manages today's service appointments and walk-in jobs through their lifecycle.

### Job Queue

The default view shows today's jobs as a scrollable list of cards. Each card shows:

- Customer name and vehicle description
- Service names (truncated if many)
- **Source badge** — "Appt" (calendar icon) for booked appointments or "Walk-In" (footprints icon) for walk-ins
- **Status badge** — Color-coded (see below)
- Assigned staff name (if any)
- **Checkout** button on completed jobs that haven't been paid yet
- **Paid** checkmark on closed jobs

### Job Statuses

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

### Filtering Jobs

Three filter pills at the top of the queue:

- **My Jobs** — Jobs assigned to you (only shown if you are bookable for appointments)
- **All Jobs** — All of today's jobs
- **Unassigned** — Jobs with no assigned staff member

### Creating Walk-In Jobs

Tap **New Walk-In** in the job queue header (requires `pos.jobs.manage` permission). This navigates to the quote builder in walk-in mode, where you can build a ticket and directly create a job instead of sending a quote.

### Refreshing the Queue

Tap the refresh button to:

1. Sync any new appointments from the booking system into jobs (auto-populate)
2. Reload the job list

### Job Detail View

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

### Job Photo Capture

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

### Flagging Issues (Add-On Authorization)

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

### Job Checkout

When a job is complete and ready for payment:

1. Tap **Checkout** on the job card (in the queue) or detail view
2. The system fetches all job items and converts them to ticket line items
3. If the job's linked quote had a coupon, it auto-applies
4. You are navigated to the Sale tab with the ticket pre-filled
5. Proceed through the normal checkout flow

---

## 4.11 Quotes Tab

The Quotes tab manages price estimates that can be sent to customers and later converted to jobs.

### Quote List

The default view shows a searchable, paginated list of quotes:

- **Status filter pills** — All, Draft, Sent, Viewed, Accepted (tap to filter)
- **Search bar** — Search by quote number or customer phone (300ms debounce)
- **Table columns** — Quote #, Date, Customer, Vehicle, Total, Status badge
- **Pagination** — 20 results per page with Previous/Next buttons
- **New Quote** button in the header

### Creating a Quote

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

### Sending a Quote

From the quote detail view, tap **Send Quote**. A dialog appears with delivery options:

- **SMS** — Sends a link to the customer's phone
- **Email** — Sends a formatted quote to the customer's email
- **Both** — Sends via both channels

The quote status changes from Draft to Sent. Resending a non-draft quote keeps its current status but updates the "Last Contacted" timestamp.

### Quote Detail View

Tap a quote from the list to see the full detail:

- Quote number, status badge, and last sent date
- Customer and vehicle summary
- Itemized table with quantities, unit prices, discounts, and totals
- Subtotal, tax, and total
- Notes (if any)
- **Communications history** — Log of when and how the quote was sent (email/SMS timestamps)

### Available Actions on a Quote

| Action | When Available | What It Does |
|--------|---------------|-------------|
| **Send Quote** | Any status (draft, sent, viewed, accepted) | Sends or resends via SMS/email |
| **Edit Quote** | Draft or sent | Opens the quote builder with items pre-filled |
| **Create Job** | Accepted + `pos.jobs.manage` permission | Converts the quote into an active job |
| **Delete** | Draft only | Soft-deletes the quote |

### Walk-In Mode

From the Jobs tab, tap **New Walk-In** to open the quote builder in walk-in mode. In this mode:

- The "Valid Until" field is hidden
- The "Send Quote" button is replaced with **Create Job**
- Saving creates the quote as "converted" status and immediately creates a job linked to it

---

## 4.12 Transactions Tab

### Transaction List

The Transactions tab shows a searchable history of all POS transactions:

- **Date presets** — Today, Yesterday, This Week, This Month, This Year, All, Custom
- **Custom date range** — Appears when "Custom" is selected (start and end date inputs)
- **Search bar** — Search by receipt number or customer phone (400ms debounce)
- **Table columns** — Receipt # (monospace, blue, clickable), Date, Customer, Payment Method, Total (right-aligned), Status badge
- **Pagination** — 20 results per page with Previous/Next buttons

### Transaction Detail

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

### Transaction Statuses

| Status | Meaning |
|--------|---------|
| **Completed** | Normal successful transaction |
| **Partial Refund** | Some items have been refunded |
| **Refunded** | Fully refunded |
| **Voided** | Transaction voided (entire amount reversed) |

---

## 4.13 Refunds

### Issuing a Refund

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

### What Happens During a Refund

- If the original payment was by card, a Stripe refund is issued automatically
- If restock is enabled for a product, inventory quantities are restored
- If the customer earned loyalty points on the original transaction, points are proportionally adjusted (deducted based on the refund-to-total ratio)
- The transaction status updates to "Partial Refund" or "Refunded"
- An audit log entry is recorded

### Voiding a Transaction

Tap **Void Transaction** (requires `pos.void_transactions` permission) to reverse the entire transaction. A confirmation dialog appears before processing. Voiding sets the status to "voided."

---

## 4.14 End of Day

Navigate to **More > Cash Drawer** or the End of Day page from the bottom nav.

### Opening the Register

If the drawer is closed:

1. Count your starting cash by denomination (bills: $100 through $1, coins: quarters through pennies)
2. Optionally check **Skip Change** to hide coin denomination rows
3. The total updates as you enter counts
4. Tap **Open Register**

The drawer session saves with the opening float, your name, and timestamp. The cash drawer status in the More menu turns green.

### Day Summary

When the register is open, the top of the page shows today's summary in four metric cards:

| Card | What It Shows |
|------|--------------|
| **Total Revenue** | Total revenue for the day plus tip total |
| **Transactions** | Transaction count and total refund amount |
| **Cash** | Total cash collected (sales + tips) and cash transaction count |
| **Card** | Total card collected (sales + tips) and card transaction count |

### Closing the Register

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

### After Closing

A success screen shows:

- Counted cash, expected cash, and variance
- **Open New Register** button to start the next day

The cash drawer status in the More menu turns red. A QuickBooks batch sync is triggered in the background to sync the day's transactions.

---

## 4.15 Offline Mode

### What Happens When Internet Drops

An amber banner appears at the top of the screen: "You're offline — Cash transactions only. Data will sync when reconnected."

- **Cash payments** remain available. Transactions are queued to the device's local storage (IndexedDB).
- **Card, Check, and Split payments** are disabled (grayed out in the payment method screen).
- The **offline queue badge** in the header shows the count of pending transactions (e.g., "2 pending").

### Automatic Sync

When connectivity returns:

1. A green banner appears: "Back online — syncing queued transactions..." (auto-hides after 3 seconds)
2. The system automatically syncs all queued transactions to the server
3. Success toast: "N offline transaction(s) synced"
4. If any fail: "N transaction(s) failed to sync — will retry"

The offline queue badge polls every 5 seconds and auto-syncs whenever it detects connectivity with pending items.

### Limitations While Offline

- No card or split payments
- No customer lookup or creation (requires server)
- No coupon validation
- No loyalty point operations
- No receipt delivery (email, SMS, or printer)
- Transactions show as "offline" in the completion screen and skip receipt options until synced

---

## 4.16 Security & Timeouts

### Idle Timeout

Configurable in **Admin > Settings > POS Settings**. After the configured period of inactivity (no taps, key presses, or scrolls):

1. A transparent overlay appears over the POS
2. The PIN screen displays on top
3. Enter your PIN to resume the session
4. The session stays alive — no data is lost and the ticket is preserved

You can also re-enter as a different staff member during the lock screen, which replaces the active session.

### JWT Token Expiry

POS sessions expire after **12 hours** regardless of activity. When the token expires:

1. Any API call returns 401
2. The POS redirects to `/pos/login` with a "session expired" toast
3. A full new PIN login is required
4. The Stripe SDK also triggers a redirect if it encounters an auth error

### HMAC API Authentication

All POS API requests include an `X-POS-Session` header with a custom HMAC-SHA256 token. The token contains the employee's ID, role, and name, signed with the Supabase service role key. This token is verified on every API call. The system uses timing-safe comparison to prevent timing attacks.

### Permission-Based Access

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
| `pos.override_pricing` | Overriding prices |
| `pos.end_of_day` | Running end-of-day reconciliation |
| `pos.jobs.view` | Viewing the jobs tab |
| `pos.jobs.manage` | Managing jobs (start, complete, create walk-ins) |
| `pos.jobs.flag_issue` | Flagging issues and creating add-on requests |
| `pos.jobs.cancel` | Cancelling jobs |

### IP Whitelist

The POS can be restricted to specific IP addresses. Configure in **Admin > Settings > POS Security**:

1. **Enable the toggle** — When on, only whitelisted IPs can access `/pos/*`
2. **Add your IP** — The page shows your current public IP with a one-click "Add My IP" button
3. **Manage the list** — Add IP addresses with friendly location names (e.g., "Shop", "Home")

Changes take effect within 10 seconds (settings are cached in-memory). If the database is unavailable, the system falls back to the `ALLOWED_POS_IPS` environment variable.

---

## 4.17 Stripe Terminal Setup

### Registering a Card Reader

1. Navigate to **Admin > Settings > Card Reader**
2. Follow the Stripe Terminal registration flow to add your reader
3. Once registered, the reader appears in the POS header with a green Wifi icon when connected

### Reader Status Indicators

| Icon | Meaning |
|------|---------|
| Green Wifi + reader name | Connected and ready |
| Red WifiOff + "No Reader" | Not connected — tap to reconnect |
| Spinning loader | Attempting to connect |

### Troubleshooting

- **Reader not connecting in PWA mode** — Ensure the pfSense DNS exception is configured (see Section 4.1)
- **"No Reader" after page refresh** — Tap the reader icon in the header to reconnect
- **Payment stuck on "Waiting for card..."** — Check that the reader is powered on and on the same network. Cancel and retry if needed.
- **Minimum payment amount** — Stripe requires a minimum of $0.50. Transactions below this amount cannot process via card.

---

## 4.18 Keyboard Shortcuts

Press **?** to view the shortcuts reference dialog. Available shortcuts:

| Key | Action |
|-----|--------|
| **F1** | Clear the current ticket |
| **F2** | Open checkout (if items are on the ticket) |
| **F3** | Navigate to Quotes tab |
| **Esc** | Close the current dialog or panel |
| **?** | Toggle the keyboard shortcuts dialog |

---

*Previous: [Job Management](./03-job-management.md) | Next: [Customers](./05-customers.md)*
