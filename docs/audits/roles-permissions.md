# Roles & Permissions Audit Report

> **Date:** 2026-03-21
> **Scope:** Full audit of every permission toggle in Admin > Settings > Roles & Permissions — verifying enforcement, accuracy of name/description, and identifying gaps.

---

## 1. System Architecture

### Permission Check Mechanisms

| Layer | Utility | File | Used By |
|-------|---------|------|---------|
| **Server (Admin)** | `checkPermission()` / `requirePermission()` | `src/lib/auth/check-permission.ts` / `require-permission.ts` | Admin API routes |
| **Server (POS)** | `checkPosPermission()` | `src/lib/pos/check-permission.ts` | POS API routes |
| **Client (Admin)** | `usePermission()` / `useAnyPermission()` / `useAllPermissions()` | `src/lib/hooks/use-permission.ts` | Admin React components |
| **Client (POS)** | `usePosPermission()` | `src/app/pos/context/pos-permission-context.tsx` | POS React components |

**Resolution order** (all layers): super_admin bypass > employee override > role default > deny

### Role Assignment

- **4 system roles**: `super_admin`, `admin`, `cashier`, `detailer`
- Custom roles can be created via Admin > Staff > Role Management
- Roles stored in `roles` table, linked to employees via `role_id` FK
- Role > permissions mapping stored in `permissions` table (role-level rows where `employee_id IS NULL`)
- Employee-level overrides stored in same table (where `employee_id IS NOT NULL`)

### Permission Definitions

- **DB table**: `permission_definitions` (key, name, description, category, sort_order)
- **TS reference**: `src/lib/utils/role-defaults.ts` (used for "Reset to Defaults" feature)
- **Total defined**: 96 keys (80 foundation + 17 added - 1 removed)

---

## 2. Complete Permission Audit Table

### POS Operations (14 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `pos.open_close_register` | Open/Close Register | Open and close the cash register | **DEAD** | None found | None found | N/A |
| `pos.create_tickets` | Create Tickets | Start new sales transactions | **DEAD** | None found | None found | N/A |
| `pos.add_items` | Add Items | Add products and services to a ticket | **DEAD** | None found | None found | N/A |
| `pos.apply_coupons` | Apply Coupons | Apply coupon codes to transactions | **DEAD** | None found | None found | N/A |
| `pos.apply_loyalty` | Apply Loyalty | Apply loyalty point redemptions | **DEAD** | None found | None found | N/A |
| `pos.process_card` | Process Card Payments | Accept card payments via terminal | **DEAD** | None found | None found | N/A |
| `pos.process_cash` | Process Cash Payments | Accept cash payments | **DEAD** | None found | None found | N/A |
| `pos.process_split` | Process Split Payments | Split payments between methods | **DEAD** | None found | None found | N/A |
| `pos.manual_discounts` | Manual Discounts | Show Add Discount button in POS | Yes | None (client-only gating) | `pos/components/ticket-panel.tsx`, `pos/components/quotes/quote-ticket-panel.tsx` | **CLIENT-ONLY**: Button hidden |
| `pos.discount_override` | Discount Override | Allow discounts on special-priced items | Yes | `api/pos/auth/verify-override` (via manager PIN) | `pos/components/ticket-panel.tsx`, `pos/components/quotes/quote-ticket-panel.tsx` | Manager PIN dialog, 403 on verify |
| `pos.issue_refunds` | Issue Refunds | Process refunds on completed transactions | Yes | `api/pos/refunds/route.ts:18` | `pos/components/transactions/transaction-detail.tsx` | 403 server + disabled button client |
| `pos.void_transactions` | Void Transactions | Void entire transactions | Yes | `api/pos/transactions/[id]/route.ts:106` | `pos/components/transactions/transaction-detail.tsx` | 403 server + disabled button client |
| `pos.end_of_day` | End of Day | End-of-day cash count and reconciliation | Yes | `api/pos/end-of-day/route.ts:17` | `pos/end-of-day/page.tsx` | 403 server + disabled client |
| `pos.override_prerequisites` | Override Service Prerequisites | Add services when prerequisites not met | Yes | `api/pos/auth/verify-override` (via manager PIN) | `pos/components/prerequisite-warning-dialog.tsx` | Manager PIN dialog, 403 on verify |

### POS Jobs (4 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `pos.jobs.view` | View Jobs Tab | View jobs in POS | Yes | `api/pos/jobs/[id]/checkout-items/route.ts:30` | — | 403 server |
| `pos.jobs.manage` | Manage Jobs | Create walk-in, edit, start/complete jobs | Yes | `api/pos/jobs/route.ts:84`, `api/pos/jobs/[id]/route.ts:97` | `pos/jobs/components/job-detail.tsx`, `pos/jobs/components/job-queue.tsx`, `pos/components/quotes/quote-detail.tsx` | 403 server + hidden buttons client |
| `pos.jobs.flag_issue` | Flag Issues | Create mid-service upsell requests | Yes | — | `pos/jobs/components/job-detail.tsx` | **CLIENT-ONLY**: Button hidden |
| `pos.jobs.cancel` | Cancel Jobs | Cancel scheduled/intake jobs | Yes | `api/pos/jobs/[id]/cancel/route.ts:80` | `pos/jobs/components/job-detail.tsx` | 403 server + hidden button client |

### Customer Management (8 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `customers.view` | View Customers | Access customer list and profiles | **DEAD** | None found | None found | N/A |
| `customers.create` | Create Customers | Add new customer records | Yes | `api/admin/customers/route.ts:16` | `admin/customers/page.tsx` | 403 server + hidden button client |
| `customers.edit` | Edit Customers | Modify customer information | Yes | `api/admin/customers/[id]/route.ts:19` | `admin/customers/page.tsx` | 403 server + hidden button client |
| `customers.delete` | Delete Customers | Remove customer records | Yes | `api/admin/customers/[id]/route.ts:203`, `api/admin/customers/[id]/restore/route.ts:19` | `admin/customers/[id]/page.tsx` | 403 server + hidden button client |
| `customers.view_history` | View Transaction History | See customer purchase history | **DEAD** | None found | None found | N/A |
| `customers.view_loyalty` | View Loyalty | See customer loyalty points | **DEAD** | None found | None found | N/A |
| `customers.adjust_loyalty` | Adjust Loyalty Points | Manually add or remove loyalty points | Yes | — | `admin/customers/[id]/page.tsx` | **CLIENT-ONLY**: Button hidden |
| `customers.export` | Export Customer Data | Download customer data as CSV | **DEAD** | None found | None found | N/A |

### Appointments & Scheduling (9 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `appointments.view_today` | View Today's Schedule | See today's appointments | **DEAD** | None found | None found | N/A |
| `appointments.view_calendar` | View Full Calendar | Access full appointment calendar | Yes | — | `admin/appointments/page.tsx:34` | **CLIENT-ONLY**: Detailer view (today only) |
| `appointments.create` | Create Appointments | Book new appointments | **DEAD** | None found | None found | N/A |
| `appointments.reschedule` | Reschedule Appointments | Change appointment date/time | Yes | `api/appointments/[id]/route.ts:39` | `admin/appointments/page.tsx:35` | 403 server + disabled client |
| `appointments.cancel` | Cancel Appointments | Cancel existing appointments | Yes | `api/appointments/[id]/cancel/route.ts:24` | `admin/appointments/page.tsx:36` | 403 server + hidden dialog client |
| `appointments.waive_fee` | Waive Cancellation Fee | Override cancellation fee | Yes | — | `admin/appointments/components/cancel-appointment-dialog.tsx:39` | **CLIENT-ONLY**: Waive option hidden |
| `appointments.update_status` | Update Status | Change appointment status | Yes | `api/appointments/[id]/route.ts:45` | — | 403 server |
| `appointments.add_notes` | Add Notes | Add notes to appointments | **DEAD** | None found | None found | N/A |
| `appointments.manage_schedule` | Manage Staff Schedules | Edit employee schedules | **DEAD** | None found | None found | N/A |

### Catalog (8 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `products.view` | View Products | Browse products in catalog | **DEAD** | None found | None found | N/A |
| `products.edit` | Edit Products | Create and modify products | **DEAD** | None found | None found | N/A |
| `products.delete` | Delete Products | Remove products from catalog | Yes | — | `admin/catalog/products/[id]/page.tsx:57` | **CLIENT-ONLY**: Button hidden |
| `services.view` | View Services | Browse services in catalog | **DEAD** | None found | None found | N/A |
| `services.edit` | Edit Services | Create and modify services | **DEAD** | None found | None found | N/A |
| `services.delete` | Delete Services | Remove services from catalog | Yes | — | `admin/catalog/services/[id]/page.tsx:98` | **CLIENT-ONLY**: Button hidden |
| `services.manage_addons` | Manage Add-ons | Configure service add-on options | **DEAD** | None found | None found | N/A |
| `services.set_pricing` | Set Service Pricing | Modify service pricing tiers | **DEAD** | None found | None found | N/A |

### Inventory (7 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `inventory.view_stock` | View Stock Levels | See current inventory quantities | **DEAD** | None found | None found | N/A |
| `inventory.adjust_stock` | Adjust Stock | Manual stock adjustments | Yes | `api/admin/stock-adjustments/route.ts:90` | `admin/catalog/products/page.tsx:56` | 403 server + hidden client |
| `inventory.manage_po` | Manage Purchase Orders | Create and manage POs | Yes | — | `admin/inventory/purchase-orders/page.tsx:22` | **CLIENT-ONLY**: Buttons hidden |
| `inventory.receive` | Receive Inventory | Receive stock against POs | **DEAD** | None found | None found | N/A |
| `inventory.view_costs` | View Cost Prices | See product cost and margin data | Yes | — | `admin/catalog/products/page.tsx:55`, `admin/catalog/products/[id]/page.tsx:56`, `admin/inventory/vendors/[id]/page.tsx:26` | **CLIENT-ONLY**: Columns hidden |
| `inventory.view_cost_data` | View Cost Data (Legacy) | Legacy — same as view_costs | **DEAD** | None found | None found | N/A |
| `inventory.manage_vendors` | Manage Vendors | Add and edit vendor info | **DEAD** | None found | None found | N/A |

### Marketing (5 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `marketing.campaigns` | Manage Campaigns | Create and send campaigns | Yes | `api/marketing/campaigns/[id]/send/route.ts:84` | `admin/marketing/campaigns/[id]/page.tsx:58` | 403 server + hidden client |
| `marketing.coupons` | Manage Coupons | Create and edit coupon codes | **DEAD** | None found | None found | N/A |
| `marketing.analytics` | View Analytics | Access marketing analytics | **DEAD** | None found | None found | N/A |
| `marketing.lifecycle_rules` | Manage Automations | Configure lifecycle rules | **DEAD** | None found | None found | N/A |
| `marketing.two_way_sms` | Messaging Inbox | Access two-way SMS inbox | **DEAD** | None found | None found | N/A |

### Quotes (3 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `quotes.create` | Create Quotes | Create new quotes | **DEAD** | None found | None found | N/A |
| `quotes.send` | Send Quotes | Send quotes via SMS or email | **DEAD** | None found | None found | N/A |
| `quotes.convert` | Convert Quotes | Convert quotes to transactions | **DEAD** | None found | None found | N/A |

### Photos — POS context (4 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `photos.upload` | Upload Photos | Take and upload job photos | **DEAD** | None found | None found | N/A |
| `photos.view` | View Photos | View photo documentation | **DEAD** | None found | None found | N/A |
| `photos.delete` | Delete Photos | Remove uploaded photos | **DEAD** | None found | None found | N/A |
| `photos.approve_marketing` | Approve for Marketing | Approve photos for marketing use | **DEAD** | None found | None found | N/A |

### Admin Photos (2 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `admin.photos.view` | View Photo Gallery | View admin photo gallery | Yes | `api/admin/photos/route.ts:13`, `api/admin/photos/tags/route.ts:13`, `api/admin/jobs/[id]/route.ts:14`, `api/admin/jobs/route.ts:11`, `api/admin/customers/[id]/photos/route.ts:16` | `admin/photos/page.tsx:133` | 403 server + hidden client |
| `admin.photos.manage` | Manage Photos | Toggle featured, bulk actions | Yes | `api/admin/photos/[id]/route.ts:16`, `api/admin/photos/gallery-preview/route.ts:18`, `api/admin/photos/bulk/route.ts:13` | `admin/photos/page.tsx:134` | 403 server + hidden client |

### Reports (7 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `reports.revenue` | View Revenue Reports | Access revenue and sales reports | **DEAD** | None found | None found | N/A |
| `reports.financial_detail` | Financial Details | Detailed financial breakdowns | **DEAD** | None found | None found | N/A |
| `reports.cost_margin` | Cost & Margin Reports | Cost and margin analysis | **DEAD** | None found | None found | N/A |
| `reports.employee_tips` | All Employee Tips | View tip reports for all employees | **DEAD** | None found | None found | N/A |
| `reports.own_tips` | Own Tips | View your own tip summary | **DEAD** | None found | None found | N/A |
| `reports.export` | Export Reports | Download reports as files | Yes | — | `admin/transactions/page.tsx:110` | **CLIENT-ONLY**: Button hidden |
| `reports.quickbooks_status` | QuickBooks Status | View QBO sync status | **DEAD** | None found | None found | N/A |

### Staff Management (4 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `staff.clock_self` | Clock In/Out | Clock in and out for shifts | **DEAD** | None found | None found | N/A |
| `staff.view_own_hours` | View Own Hours | See your own timesheet | **DEAD** | None found | None found | N/A |
| `staff.view_all_hours` | View All Hours | See all employee timesheets | **DEAD** | None found | None found | N/A |
| `staff.edit_time` | Edit Timesheets | Modify timesheet entries | **DEAD** | None found | None found | N/A |

### Settings (8 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `settings.feature_toggles` | Feature Toggles | Enable/disable system features | Yes | — | `admin/settings/feature-toggles/page.tsx:30` | **CLIENT-ONLY**: Toggles hidden |
| `settings.tax_payment` | Tax & Payment Settings | Configure tax rates | **DEAD** | None found | None found | N/A |
| `settings.manage_users` | Manage Users | Create, edit, deactivate staff | Yes | `api/staff/create/route.ts:15`, `api/admin/staff/[id]/reset-password/route.ts:17`, `api/admin/staff/[id]/route.ts:17` | `admin/staff/page.tsx:28` | 403 server + hidden button client |
| `settings.roles_permissions` | Roles & Permissions | Manage role definitions | Yes | `api/admin/staff/[id]/permissions/route.ts:106` | — | 403 server |
| `settings.business_hours` | Business Hours | Set operating hours | **DEAD** | None found | None found | N/A |
| `settings.audit_log` | View Audit Log | Access system audit log | **DEAD** | None found | None found | N/A |
| `settings.api_keys` | API Keys | Manage API keys | **DEAD** | None found | None found | N/A |
| `settings.backup_export` | Backup & Export | Create backups | **DEAD** | None found | None found | N/A |

### CMS (8 keys)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `cms.pages.manage` | Manage Pages & Nav | Create/edit/delete custom pages | Yes | 24+ admin CMS routes (pages, navigation, footer, credentials, team-members) | — | 403 server |
| `cms.hero.manage` | Manage Hero | Manage hero slides | Yes | 5 admin CMS hero routes | — | 403 server |
| `cms.tickers.manage` | Manage Tickers | Manage ticker banners | Yes | 4 admin CMS ticker routes | — | 403 server |
| `cms.ads.manage` | Manage Ads | Manage ad placements | Yes | 6 admin CMS ads routes | — | 403 server |
| `cms.themes.manage` | Manage Themes | Manage seasonal themes | Yes | 8 admin CMS theme routes | — | 403 server |
| `cms.about.manage` | Manage About & Team | Manage about/team sections | **DEAD** | None found | None found | N/A — `cms.pages.manage` covers team-members routes instead |
| `cms.catalog_display.manage` | Manage Catalog Display | Manage catalog display settings | Yes | 2 admin CMS catalog routes | — | 403 server |
| `cms.seo.manage` | Manage SEO | Manage SEO settings | Yes | 20+ admin CMS content/SEO/global-blocks routes | — | 403 server |

### Online Store (2 keys — added via migration, NOT in `role-defaults.ts`)

| Permission Key | Display Name | Description | Enforced? | Server Location | Client Location | Denied Behavior |
|---|---|---|---|---|---|---|
| `orders.view` | View Orders | View online store orders | Yes | `api/admin/orders/route.ts:11`, `api/admin/orders/[id]/route.ts:16` | — | 403 server |
| `orders.manage` | Manage Orders | Update fulfillment, process refunds | Yes | `api/admin/orders/[id]/route.ts:91`, `api/admin/orders/[id]/refund/route.ts:21` | — | 403 server |

---

## 3. MISSING Permissions (enforced in code but not in `role-defaults.ts`)

| Permission Key | Where Enforced | Type | Risk |
|---|---|---|---|
| `orders.view` | Server (2 API routes) | Server-side | **Medium** — "Reset to Defaults" won't include this key; custom roles won't get seeded with it |
| `orders.manage` | Server (2 API routes) | Server-side | **Medium** — same as above |
| `customers.merge` | Client (`admin/customers/page.tsx:280`) | Client-only | **Low** — UI gating only, no API enforcement |
| `reports.view` | Client (`admin/page.tsx:52`) | Client-only | **Low** — dashboard stats visibility only |

Note: `orders.view` and `orders.manage` ARE in the DB `permission_definitions` table (added via migration) but are NOT in `role-defaults.ts`. The "Reset to Defaults" feature and custom role seeding use `role-defaults.ts`, so these permissions get lost on reset.

---

## 4. DEAD Permissions (defined but never enforced)

**42 permissions** are defined in `permission_definitions` / `role-defaults.ts` but have NO enforcement anywhere in the codebase:

| Category | Dead Permissions |
|---|---|
| **POS Operations** (8) | `pos.open_close_register`, `pos.create_tickets`, `pos.add_items`, `pos.apply_coupons`, `pos.apply_loyalty`, `pos.process_card`, `pos.process_cash`, `pos.process_split` |
| **Customer Mgmt** (4) | `customers.view`, `customers.view_history`, `customers.view_loyalty`, `customers.export` |
| **Appointments** (4) | `appointments.view_today`, `appointments.create`, `appointments.add_notes`, `appointments.manage_schedule` |
| **Catalog** (6) | `products.view`, `products.edit`, `services.view`, `services.edit`, `services.manage_addons`, `services.set_pricing` |
| **Inventory** (4) | `inventory.view_stock`, `inventory.receive`, `inventory.view_cost_data`, `inventory.manage_vendors` |
| **Marketing** (4) | `marketing.coupons`, `marketing.analytics`, `marketing.lifecycle_rules`, `marketing.two_way_sms` |
| **Quotes** (3) | `quotes.create`, `quotes.send`, `quotes.convert` |
| **Photos** (4) | `photos.upload`, `photos.view`, `photos.delete`, `photos.approve_marketing` |
| **Reports** (5) | `reports.revenue`, `reports.financial_detail`, `reports.cost_margin`, `reports.employee_tips`, `reports.own_tips`, `reports.quickbooks_status` |
| **Staff** (4) | `staff.clock_self`, `staff.view_own_hours`, `staff.view_all_hours`, `staff.edit_time` |
| **Settings** (5) | `settings.tax_payment`, `settings.business_hours`, `settings.audit_log`, `settings.api_keys`, `settings.backup_export` |
| **CMS** (1) | `cms.about.manage` |

These toggle on/off in the admin UI but flipping them has **no effect** — the underlying features don't check them.

---

## 5. CLIENT-ONLY Permissions (no server-side enforcement — security gaps)

| Permission Key | Client File | What It Hides | Risk |
|---|---|---|---|
| `pos.manual_discounts` | `pos/components/ticket-panel.tsx` | "Add Discount" button | **Medium** — A crafted API call could bypass; discount itself may be validated server-side via checkout flow |
| `pos.jobs.flag_issue` | `pos/jobs/components/job-detail.tsx` | Flag issue/upsell button | **Low** — UI convenience only |
| `customers.adjust_loyalty` | `admin/customers/[id]/page.tsx` | Adjust loyalty button | **Medium** — API for loyalty adjustment may not check this permission |
| `customers.merge` | `admin/customers/page.tsx` | Merge customers button | **Low** — merge may require super_admin separately |
| `appointments.view_calendar` | `admin/appointments/page.tsx` | Full calendar vs today view | **Low** — data fetched is same, just UI layout |
| `appointments.waive_fee` | `admin/appointments/components/cancel-appointment-dialog.tsx` | Waive fee checkbox | **Medium** — waive flag sent in request body without server validation |
| `products.delete` | `admin/catalog/products/[id]/page.tsx` | Delete button | **High** — API likely doesn't check this permission |
| `services.delete` | `admin/catalog/services/[id]/page.tsx` | Delete button | **High** — API likely doesn't check this permission |
| `inventory.view_costs` | Multiple product/vendor pages | Cost columns | **Low** — display-only, not actionable |
| `inventory.manage_po` | `admin/inventory/purchase-orders/page.tsx` | PO management buttons | **Medium** — API may not check |
| `reports.view` | `admin/page.tsx` | Dashboard stats | **Low** — display-only |
| `reports.export` | `admin/transactions/page.tsx` | Export button | **Medium** — export API may not check |
| `settings.feature_toggles` | `admin/settings/feature-toggles/page.tsx` | Toggle controls | **Medium** — settings API may not check |

---

## 6. Summary Counts

| Category | Total | Enforced (Server+Client) | Server-Side | Client-Only | Dead |
|---|---|---|---|---|---|
| POS Operations | 14 | 6 | 4 | 1 | 8 |
| POS Jobs | 4 | 4 | 3 | 1 | 0 |
| Customer Mgmt | 8 | 4 | 3 | 1 | 4 |
| Appointments | 9 | 5 | 2 | 3 | 4 |
| Catalog | 8 | 2 | 0 | 2 | 6 |
| Inventory | 7 | 3 | 1 | 2 | 4 |
| Marketing | 5 | 1 | 1 | 0 | 4 |
| Quotes | 3 | 0 | 0 | 0 | 3 |
| Photos (POS) | 4 | 0 | 0 | 0 | 4 |
| Admin Photos | 2 | 2 | 2 | 0 | 0 |
| Reports | 7 | 2 | 0 | 2 | 5 |
| Staff | 4 | 0 | 0 | 0 | 4 |
| Settings | 8 | 3 | 2 | 1 | 5 |
| CMS | 8 | 7 | 7 | 0 | 1 |
| Online Store | 2 | 2 | 2 | 0 | 0 |
| **TOTAL** | **97** | **41** | **27** | **13** | **42 (+4 MISSING)** |

### Key Findings

1. **42 DEAD permissions** — defined but never checked anywhere. Toggling them in the UI has zero effect.
2. **13 CLIENT-ONLY permissions** — checked in React components but not enforced server-side. A user with browser dev tools or direct API access can bypass these.
3. **4 MISSING permissions** — enforced in code but not in `role-defaults.ts` (`orders.view`, `orders.manage`, `customers.merge`, `reports.view`). The first two also missing from "Reset to Defaults" logic.
4. **1 MISMATCH** — `cms.about.manage` is defined but team-members routes use `cms.pages.manage` instead.
5. **CMS permissions are the best enforced** — 7/8 have server-side checks across 60+ API routes.
6. **POS core operations are the worst** — 8/14 base POS operations (register, tickets, items, coupons, loyalty, payments) are completely unenforced. These were designed as future-proofing but never wired up.
