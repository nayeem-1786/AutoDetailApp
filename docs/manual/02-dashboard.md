# 2. Dashboard

The admin dashboard is the landing page after logging into `/admin`. It provides an at-a-glance summary of today's operations — appointments, customers, quotes, online orders, and stock alerts — so you can quickly assess the business state and jump to whatever needs attention.

Data loads on page mount from the Supabase database via client-side queries. Refreshing the page reloads all metrics.

---

## 2.1 Dashboard Layout

The dashboard is organized into these sections (top to bottom):

1. **Welcome header** — Greeting with the logged-in employee's first name and today's date
2. **Alert banners** — Conditional banners for items needing attention
3. **Appointment stats row** — Four metric cards for today's appointments
4. **Quotes & Customers row** — Four cards showing quote and customer counts (requires `reports.view` permission)
5. **Online Orders widget** — Today's orders, revenue, pending fulfillment (requires `reports.view` permission)
6. **Week at a Glance** — 7-day appointment grid (Mon–Sun)
7. **Today's Schedule + Quick Actions** — Two-column layout with the day's confirmed appointments on the left and shortcut buttons on the right

---

## 2.2 Alert Banners

Two conditional banners appear at the top of the dashboard when action is needed:

### Needs Attention Banner

Appears when there are **pending** (unconfirmed) appointments scheduled for today.

- Shows the count of pending appointments (e.g., "3 appointments pending confirmation")
- Click **Review** to navigate to the Appointments page

### Stock Alert Banner

Appears when any active product has stock issues:

- **Low stock** — Products where `quantity_on_hand` is at or below `reorder_threshold` but not zero
- **Out of stock** — Products where `quantity_on_hand` is exactly 0
- Click the banner to navigate to the Products page filtered to low-stock items

---

## 2.3 Appointment Metrics (Stats Row)

Four cards showing today's appointment data. These are calculated from direct Supabase queries on the `appointments` table, filtered to today's date (`scheduled_date = today`) and excluding cancelled appointments.

| Card | Metric | How It's Calculated |
|------|--------|-------------------|
| **Today's Appointments** | Total count | All non-cancelled appointments scheduled for today |
| **Remaining** | Pending + Confirmed + In Progress | Appointments not yet completed — represents the day's remaining workload |
| **In Progress** | Currently active jobs | Appointments with status `in_progress` |
| **Completed Today** | Finished jobs | Appointments with status `completed` |

> "Today" is determined by the browser's local date at the time the dashboard loads. All appointment filtering uses the `scheduled_date` field.

### Appointment Statuses Explained

| Status | Meaning |
|--------|---------|
| `pending` | Booked but not yet confirmed by staff |
| `confirmed` | Confirmed and ready for the scheduled time |
| `in_progress` | Work has started on the vehicle |
| `completed` | Service finished |
| `cancelled` | Appointment was cancelled |
| `no_show` | Customer did not show up |

---

## 2.4 Quotes & Customers Row

This row appears only for users with the `reports.view` permission. It contains four clickable cards:

### Open Quotes

- **Metric**: Sum of quotes with status `sent`, `viewed`, or `accepted` (excludes drafts from the "open" total)
- **Badge**: If any quotes have `accepted` status, a green badge shows the count (e.g., "3 accepted")
- **Click**: Navigates to **Admin** → **Quotes**
- **Data source**: Queries the `quotes` table filtered to `status IN (draft, sent, viewed, accepted)` and `deleted_at IS NULL` (soft-delete filter)

### Drafts

- **Metric**: Count of quotes with status `draft`
- **Subtext**: Shows count of `sent` quotes alongside
- **Click**: Navigates to **Admin** → **Quotes** filtered to drafts (`?status=draft`)

### Total Customers

- **Metric**: Total count of all records in the `customers` table
- **Click**: Navigates to **Admin** → **Customers**

### New This Month

- **Metric**: Customers created since the 1st of the current month
- **Subtext**: Also shows how many were created this week (Mon–Sun)
- **Calculation**: Filters `customers.created_at >= first day of current month`. "This week" filters `customers.created_at >= Monday of current week`

---

## 2.5 Online Orders Widget

This widget appears only when there are orders to show (today's orders > 0 or pending fulfillment > 0 or recent orders exist) and the user has `reports.view` permission.

### Metrics Row

| Metric | What It Shows | How It's Calculated |
|--------|--------------|-------------------|
| **Orders Today** | Number of orders placed today | All orders with `created_at >= start of today (PST)` |
| **Revenue Today** | Dollar total from paid orders today | Sum of `total` for orders today where `payment_status = 'paid'`. Amounts are stored in cents and divided by 100 for display. |
| **Pending Fulfillment** | Orders waiting to be shipped/picked up | Count of orders where `fulfillment_status = 'unfulfilled'` AND `payment_status = 'paid'` |

> "Today" for orders uses PST timezone conversion (`America/Los_Angeles`), consistent with the project's timezone rule.

### Recent Orders List

Below the metrics, the 5 most recent orders are listed with:

- **Order number** (clickable, links to order detail page)
- **Customer name**
- **Total amount** (formatted as currency)
- **Fulfillment status badge** — Color-coded: `Unfulfilled` (warning/amber), `Shipped` (info/blue), `Delivered` (success/green), `Ready` (info/blue for ready-for-pickup)

Click **View All Orders** in the header to navigate to **Admin** → **Orders**.

---

## 2.6 Week at a Glance

A 7-day grid (Monday through Sunday) showing the appointment count for each day of the current week.

### How It Works

- Queries the `appointments` table for `scheduled_date` between Monday and Sunday of the current week
- Excludes cancelled appointments
- Today's column is highlighted with a blue border and background

### What Each Day Shows

- **Day label** — e.g., "Mon 3/2"
- **Appointment count** — Large bold number (grayed out if zero)
- **Up to 3 appointment previews** — Each shows a color dot (status indicator), the scheduled start time, and the customer's first name
- **Overflow indicator** — If more than 3 appointments, shows "+N more"

### Status Color Dots

| Color | Status |
|-------|--------|
| Green | Completed |
| Amber | In progress |
| Blue | Confirmed |
| Gray | Pending or other |

Click **View Calendar** to navigate to the full Appointments page.

---

## 2.7 Today's Schedule

A detailed list of today's confirmed and in-progress appointments (not pending, completed, no-show, or cancelled). This represents the active workload for the day.

### What Each Appointment Card Shows

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

## 2.8 Quick Actions

A sidebar panel (right column on desktop, stacked below on mobile) with shortcut buttons:

| Action | Navigates To | Description |
|--------|-------------|-------------|
| **Appointments** | `/admin/appointments` | Manage the appointment calendar |
| **Customers** | `/admin/customers` | View and manage customers |
| **Catalog** | `/admin/catalog` | Products and services |
| **Settings** | `/admin/settings` | System configuration |

These quick actions are the same for all admin users regardless of role.

---

## 2.9 Data Freshness

All dashboard data is fetched from Supabase when the page loads (component mount). The dashboard does not auto-refresh or poll for updates.

**To see updated data:** Refresh the browser page or navigate away and back to `/admin`.

> For real-time needs (e.g., monitoring appointments during a busy day), keep the Appointments page open instead — it provides more detailed views and can be manually refreshed.

---

*Previous: [Getting Started](./01-getting-started.md) | Next: [Job Management](./03-job-management.md)*
