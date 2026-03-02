# 8. Online Store

The online store allows customers to browse and purchase products through the public website. It includes a full e-commerce flow — product catalog, shopping cart, checkout with Stripe payment, shipping via Shippo, and order management in the admin.

This chapter covers product management, inventory tracking, the customer shopping experience, checkout, order fulfillment, shipping configuration, and coupons.

---

## 8.1 Online Store Overview

The online store operates alongside the POS but serves a different channel:

| Aspect | Online Store | POS |
|--------|-------------|-----|
| **Channel** | Website (self-service) | In-person (staff-operated) |
| **Products** | Only products with `show_on_website` enabled | All active products |
| **Services** | Not sold online (booking flow is separate) | Full service catalog |
| **Payment** | Stripe (card only) | Stripe Terminal, cash, check |
| **Fulfillment** | Shipping or local pickup | Immediate in-person |
| **Order numbers** | `WO-XXXXX` prefix (e.g., WO-10001) | `SD-XXXXX` prefix |

### How It Works

1. Customers browse products on the public website by category
2. They add items to a cart (persisted in browser local storage)
3. At checkout, they provide contact info, choose shipping or pickup, and pay via Stripe
4. The system creates a pending order, then assigns an order number after payment succeeds
5. Staff fulfills the order from the admin (ship or prepare for pickup)
6. Automated emails notify the customer at each fulfillment stage

---

## 8.2 Product Management

Navigate to **Admin** → **Catalog** → **Products** to manage the product catalog.

### Products List

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

### Creating a Product

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

### Editing a Product

The edit page includes everything from creation plus:

- **Active/Inactive toggle** — Live-updates immediately (not tied to the save button). Inactive products are hidden from the POS catalog and website.
- **Multiple images** — Upload, remove, reorder, and set a primary image. Each image supports alt text for accessibility and SEO.
- **Sale pricing** — See [Section 8.2.1](#821-sale-pricing) below.
- **Cost & margin analysis** — Shows cost, retail, margin percentage, and cost history from purchase orders (permission-gated).

**Deleting a product** performs a soft-delete (deactivates it). The product remains in the database for historical records.

### 8.2.1 Sale Pricing

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

### Product Categories

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

## 8.3 Inventory Management

The inventory system tracks stock levels, records all stock movements, manages vendors, and supports purchase orders.

### Stock Levels

Every product has a `quantity_on_hand` field. Stock is automatically decremented when orders are paid and restored when refunds are processed.

**Stock status indicators:**

| Indicator | Condition |
|-----------|-----------|
| **In Stock** (green) | Quantity > 0 and above reorder threshold |
| **Low Stock** (yellow) | Quantity > 0 but at or below reorder threshold |
| **Out of Stock** (red) | Quantity = 0 |

### Stock History

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

### Manual Stock Adjustments

There are two ways to adjust stock manually:

1. **From the product list** — Click the stock number on any product row to open the quick adjust dialog
2. **From the product edit page** — Update the quantity on hand field

Both methods record the adjustment in stock history with the reason you provide.

### Low Stock Alerts

A cron job runs daily at 8:00 AM PST and sends email alerts when products need attention:

- **Low stock** — Active products where `quantity_on_hand` is at or below the `reorder_threshold`
- **Out of stock** — Active products with `quantity_on_hand` of 0

The alert email lists each product with its name, SKU, current stock, reorder threshold, vendor, and status. It includes a link to the products page filtered to low-stock items.

**Anti-spam protection:** Products are only re-alerted when their stock level changes or after 7 days have passed since the last alert.

**Recipients:** Emails go to staff configured in **Admin** → **Settings** → **Notifications** with the `low_stock` notification type. If none are configured, the business email is used as a fallback.

### Purchase Orders

Navigate to **Admin** → **Inventory** → **Purchase Orders** to create and track orders from vendors.

#### Purchase Order Statuses

| Status | Meaning | Badge Color |
|--------|---------|-------------|
| **Draft** | Created but not yet submitted | Gray |
| **Ordered** | Submitted to vendor, awaiting delivery | Blue |
| **Received** | All items received | Green |
| **Cancelled** | Order was cancelled | Red |

#### Creating a Purchase Order

1. Click **New Purchase Order**
2. Select a vendor from the dropdown
3. Search for products to add — results are filtered by the selected vendor
4. For each product added, set the quantity and unit cost (defaults to the product's cost price and minimum order quantity)
5. Click **Save as Draft** to save without submitting, or **Create & Submit** to create with "Ordered" status

#### Receiving Stock

When a shipment arrives:

1. Open the purchase order and click **Receive Items**
2. Enter the quantity received for each line item (or click **Fill All** to receive everything)
3. Click **Confirm Receive**

The system updates product stock levels, records stock history entries of type "PO Received", and marks the PO as "Received" if all items are fully received. Partial receives are supported — you can receive items in multiple batches.

#### Purchase Order Detail

The detail page shows:

- Vendor name and contact
- Total cost and received value
- Line items with ordered vs. received quantities
- Notes
- Status actions (submit, receive, cancel, delete)

### Vendor Management

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

## 8.4 Customer Shopping Experience

### Browsing Products

Customers browse products on the public website at `/products`. Products are organized by category and only products marked as both `is_active` and `show_on_website` appear. Products are sorted by `website_sort_order`, then alphabetically by name.

Each product page shows:

- Product images (with primary image featured)
- Name, price (with sale price if applicable), and description
- Stock availability
- Add to cart controls

### Add to Cart

The add-to-cart button has four states:

| State | Display | Condition |
|-------|---------|-----------|
| **Available** | "Add to Cart" button | Product is in stock |
| **In Cart** | Green "In Cart (qty)" button | Already added to cart |
| **Max Reached** | Disabled "Max Reached" button | Cart quantity equals available stock |
| **Out of Stock** | Disabled "Out of Stock" button | Stock is zero |

On the product detail page, a quantity selector appears alongside the add-to-cart button. If items are already in the cart, the page shows how many and limits the quantity to remaining stock.

### Cart Drawer

When a customer adds an item, a slide-in drawer opens from the right side of the screen. The cart drawer provides:

- Item list with thumbnails, names, prices, quantity selectors, and remove buttons
- Subtotal
- "View Cart" and "Checkout" buttons
- "Clear Cart" option

The drawer closes on escape key, backdrop click, or page navigation. It includes accessibility features (focus trap, ARIA attributes, body scroll lock).

### Cart Page

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

## 8.5 Checkout Flow

The checkout page at `/checkout` guides customers through a three-step process. Form data is saved to session storage, so customers can refresh the page or navigate back without losing their information.

### Step 1: Information

| Field | Required | Description |
|-------|----------|-------------|
| **Email** | Yes | Order confirmation and updates |
| **First Name** | Yes | Customer name |
| **Last Name** | Yes | Customer name |
| **Phone** | No | Contact number |
| **Customer Notes** | No | Special instructions for the order |

If the customer is logged in, these fields are auto-populated from their profile.

### Step 2: Fulfillment

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

### Step 3: Payment

The payment step uses Stripe's embedded payment element, which handles card entry, validation, and 3D Secure authentication.

The page displays trust badges ("256-bit SSL Encrypted", "PCI DSS Compliant") and a "Powered by Stripe" logo.

The submit button shows the final total: "Place Order — $X.XX".

### After Payment

On successful payment:

1. The Stripe webhook processes the `payment_intent.succeeded` event
2. An order number is assigned (sequential, starting at WO-10001)
3. Product stock is decremented for each item
4. The customer is redirected to the confirmation page
5. A confirmation email is sent (not implemented as a separate email — the order record serves as confirmation)

### Guest Checkout

Customers can check out without creating an account. If a logged-in customer checks out, the order is linked to their customer record.

---

## 8.6 Order Management

Navigate to **Admin** → **Orders** to view and manage online store orders.

### Orders List

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

### Payment Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Pending** | Payment not yet completed (abandoned checkout) | Yellow |
| **Paid** | Payment received via Stripe | Green |
| **Failed** | Payment attempt failed | Red |
| **Refunded** | Full refund processed | Gray |
| **Partial Refund** | Partial refund processed | Gray |

### Fulfillment Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Unfulfilled** | Order received, not yet processed | Yellow |
| **Processing** | Staff is preparing the order | Blue |
| **Ready for Pickup** | Order is ready for customer pickup | Blue |
| **Shipped** | Order has been shipped with carrier | Blue |
| **Delivered** | Order has been delivered | Green |
| **Cancelled** | Order was cancelled | Red |

### Order Detail Page

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

### Fulfilling an Order

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

### Processing Refunds

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

## 8.7 Shipping Configuration

Navigate to **Admin** → **Settings** → **Shipping** to configure shipping.

### Shippo API Setup

| Field | Description |
|-------|-------------|
| **API Mode** | Toggle between Test and Live mode |
| **Test API Key** | Shippo test API key (`shippo_test_...`) |
| **Live API Key** | Shippo live API key (`shippo_live_...`) |
| **Test Connection** | Verifies the API key works |

### Ship-From Address

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

### Default Package Dimensions

Fallback dimensions used when products do not have their own shipping dimensions:

| Field | Default |
|-------|---------|
| **Length** | 10 |
| **Width** | 8 |
| **Height** | 4 |
| **Dimension Unit** | Inches or centimeters |
| **Weight** | 1 |
| **Weight Unit** | Pounds, ounces, kilograms, or grams |

### Carrier Preferences

Click **Load Carriers** to fetch available carrier accounts from Shippo (e.g., USPS, UPS, FedEx). Enable or disable specific carriers with checkboxes.

**Service Level Filter:** Optionally restrict which service levels appear at checkout. Supports 14 common service levels across USPS, UPS, and FedEx (e.g., USPS Priority Mail, UPS Ground, FedEx 2Day).

### Pricing & Fees

| Setting | Description |
|---------|-------------|
| **Free Shipping** | Toggle + minimum order threshold. Orders above the threshold get a free "Free Standard Shipping" option. |
| **Flat Rate Shipping** | Toggle + fixed amount. Overrides live carrier rates with a single flat rate option. |
| **Handling Fee** | None, flat fee (cents), or percentage. Added to each shipping rate shown to customers. |

### Display Preferences

| Setting | Description |
|---------|-------------|
| **Show Estimated Delivery** | Display estimated delivery dates alongside shipping options |
| **Show Carrier Logos** | Display carrier logos next to shipping options at checkout |
| **Sort Shipping Options By** | Price (cheapest first) or Speed (fastest first) |

### Local Pickup

| Setting | Description |
|---------|-------------|
| **Enable Local Pickup** | Allow customers to select pickup instead of shipping |
| **Pickup Address** | Address shown to customers who choose pickup |
| **Pickup Instructions** | Additional instructions (e.g., hours, entrance location) |

---

## 8.8 Coupons & Discounts

Navigate to **Admin** → **Marketing** → **Coupons** to manage discount codes.

### Coupons List

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

### Creating a Coupon

Click **Create Coupon** to open a six-step wizard:

#### Step 1: Basics

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Descriptive name for the coupon |
| **Auto-generate code** | — | Checkbox (default: on). Generates an 8-character alphanumeric code. |
| **Coupon Code** | If auto-generate is off | Custom code (forced uppercase) |
| **Auto-apply at POS** | — | When enabled, automatically applies at POS when conditions are met |

#### Step 2: Targeting (Who)

Three targeting options:

| Option | Description |
|--------|-------------|
| **Everyone** | No restrictions |
| **Specific Customer** | Search and assign to one customer |
| **Customer Group** | Filter by customer tags with match mode (Any = OR, All = AND) |

**Customer type restriction** (optional): Limit to Enthusiast, Professional, or Unknown customer types. Enforcement behavior depends on the coupon enforcement setting (see [Section 8.8.3](#883-coupon-enforcement)).

A live **Eligible Customers** counter updates as you adjust targeting.

#### Step 3: Conditions (If)

Optional conditions that must be met before the coupon can be used:

| Condition | Description |
|-----------|-------------|
| **Required Products** | Cart must contain specific products or products from a category |
| **Required Services** | Cart must contain specific services or services from a category |
| **Minimum Purchase** | Minimum subtotal amount |
| **Maximum Customer Visits** | Limit by visit count (0 = new customers only) |

When multiple conditions exist, choose **ALL must be met** (AND) or **ANY suffices** (OR).

#### Step 4: Rewards (Then)

Define one or more discount rewards per coupon:

| Field | Options |
|-------|---------|
| **Applies To** | Entire Order, Specific Product, or Specific Service |
| **Discount Type** | Percentage Off, Dollar Amount Off, or Free |
| **Value** | Percentage or dollar amount (not needed for "Free") |
| **Max Discount** | Cap for percentage discounts (optional) |

Multiple rewards can be added to a single coupon (e.g., 20% off a product AND free service).

#### Step 5: Limits

| Field | Description |
|-------|-------------|
| **Expiration Date** | When the coupon expires (optional) |
| **Single Use per Customer** | Each customer can use it only once (default: yes) |
| **Maximum Total Uses** | Total usage cap across all customers (optional) |

#### Step 6: Review

Summary of all settings. Click **Create Coupon** to activate it.

**Draft auto-save:** The wizard silently saves as a draft on every step navigation. You can leave and resume editing any draft coupon later.

### 8.8.1 Coupon Types

Coupons support three discount types, each applicable to orders, products, or services:

| Discount Type | Behavior |
|---------------|----------|
| **Percentage Off** | Reduces price by a percentage. Optionally capped by a max discount amount. |
| **Dollar Amount Off** | Subtracts a fixed dollar amount. Cannot exceed the item price. |
| **Free** | Makes the target item free (100% discount). |

### 8.8.2 Coupon Statuses

| Status | Description |
|--------|-------------|
| **Draft** | Work in progress, not yet usable |
| **Active** | Available for use |
| **Disabled** | Manually deactivated (can be re-enabled) |
| **Expired** | Past the expiration date (computed, not stored) |

### 8.8.3 Coupon Enforcement

Navigate to **Admin** → **Settings** → **Coupon Enforcement** to control how customer type restrictions are handled at the POS.

| Mode | Behavior |
|------|----------|
| **Soft** (Recommended) | Coupon is applied but a warning toast is shown to the cashier |
| **Hard** | Coupon is rejected entirely if the customer type does not match |

This setting only affects coupons with a customer type restriction (e.g., "Enthusiast Only").

### Coupon Detail Page

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

### Coupon Usage at Checkout

When a customer applies a coupon code during online checkout (on the cart page or at checkout), the system validates:

1. Code exists and is active
2. Not expired
3. Usage limits not exceeded
4. Single-use per customer check
5. Customer targeting matches
6. Cart conditions are met (required items, minimum purchase, visit count)

If validation passes, the discount is calculated and shown in the order summary. The discount is reflected in the Stripe payment intent amount.

---

*Previous: [Website & CMS](./07-cms-website.md) | Next: [Marketing](./09-marketing.md)*
