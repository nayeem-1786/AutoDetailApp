# Permissions System Audit — Ground Truth Report

**Date:** 2026-02-11
**Scope:** Complete audit of role-based permissions system across all layers
**Status:** Documentation only — no fixes applied

---

## 1. Permission Infrastructure Summary

### Architecture Overview

The system has **three separate access control layers** that operate independently:

| Layer | Mechanism | Where Defined | Where Enforced |
|-------|-----------|---------------|----------------|
| **Route Access** | Role → URL mapping | `src/lib/auth/roles.ts` (`ROUTE_ACCESS`) | `src/app/admin/admin-shell.tsx` (client redirect) |
| **Sidebar Nav** | Role → nav item filtering | `src/lib/auth/roles.ts` (`SIDEBAR_NAV`) | `src/app/admin/admin-shell.tsx` (render filter) |
| **Granular Permissions** | Permission key → boolean per role/user | `supabase/seed.sql` (80+ keys) | `usePermission()` hook (3 call sites total) |

### Data Layer

**Table:** `permissions` (migration `20260201000032_create_permissions.sql`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `permission_key` | TEXT | e.g., `pos.open_close_register` |
| `role` | user_role (nullable) | Set for role-level defaults, NULL for user overrides |
| `employee_id` | UUID (nullable) | Set for user overrides, NULL for role defaults |
| `granted` | BOOLEAN | Allow or deny |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraints:**
- `UNIQUE(permission_key, role)` — one role default per key
- `UNIQUE(permission_key, employee_id)` — one user override per key
- CHECK: either `role` is set OR `employee_id` is set, never both

### Permission Resolution Logic

File: `src/lib/auth/permissions.ts`

```
1. super_admin → always true (bypass)
2. User-level override (employee_id match) → highest priority
3. Role-level default (role match) → fallback
4. No match → deny
```

### Client-Side Checking

File: `src/lib/hooks/use-permission.ts`

- `usePermission(key)` — single permission check
- `useAnyPermission(keys[])` — OR check
- `useAllPermissions(keys[])` — AND check
- `useIsSuperAdmin()` — convenience (never used outside definition)
- `useIsAdminOrAbove()` — convenience (never used outside definition)

All hooks read from `AuthContext.permissions` which is loaded on login via:
```sql
SELECT * FROM permissions WHERE role = '{emp.role}' OR employee_id = '{emp.id}'
```

### Server-Side Checking

**There is NO server-side permission checking.** Zero API routes inspect the `permissions` table. All API routes only verify authentication (`getUser()` returns a valid session), then proceed with `createAdminClient()` which bypasses RLS entirely.

---

## 2. CRITICAL FINDING: Permission Key Mismatch

The Permissions Tab UI defines **27 permission keys** that are **completely different** from the **80+ keys** in the database seed data. The two sets do not share a single overlapping key (except `reports.export` by coincidence).

### Key Mapping: UI Keys vs Seed Data Keys

| UI Key (Permissions Tab) | Seed Data Key (Database) | Match? |
|--------------------------|--------------------------|--------|
| `pos.open_register` | `pos.open_close_register` | NO — different name |
| `pos.close_register` | `pos.open_close_register` | NO — UI splits into 2, seed has 1 |
| `pos.apply_discount` | `pos.manual_discounts` | NO — different name |
| `pos.void_transaction` | `pos.void_transactions` | NO — singular vs plural |
| `pos.process_refund` | `pos.issue_refunds` | NO — different name |
| `pos.apply_coupon` | `pos.apply_coupons` | NO — singular vs plural |
| `customer.view` | `customers.view` | NO — singular vs plural prefix |
| `customer.create` | `customers.create` | NO — singular vs plural prefix |
| `customer.edit` | `customers.edit` | NO — singular vs plural prefix |
| `customer.delete` | `customers.delete` | NO — singular vs plural prefix |
| `customer.view_financials` | *(no match)* | NO — doesn't exist in seed |
| `staff.view` | *(no match)* | NO — seed has `staff.clock_self` etc. |
| `staff.create` | *(no match)* | NO — doesn't exist in seed |
| `staff.edit` | *(no match)* | NO — doesn't exist in seed |
| `staff.deactivate` | *(no match)* | NO — doesn't exist in seed |
| `staff.permissions` | *(no match)* | NO — doesn't exist in seed |
| `catalog.products.manage` | `products.edit` | NO — different naming scheme |
| `catalog.services.manage` | `services.edit` | NO — different naming scheme |
| `catalog.categories.manage` | *(no match)* | NO — doesn't exist in seed |
| `inventory.view` | `inventory.view_stock` | NO — different name |
| `inventory.adjust` | `inventory.adjust_stock` | NO — different name |
| `inventory.purchase_orders` | `inventory.manage_po` | NO — different name |
| `reports.view` | `reports.revenue` | NO — different name |
| `reports.export` | `reports.export` | YES — only match |
| `settings.business` | `settings.business_hours` | NO — different name |
| `settings.features` | `settings.feature_toggles` | NO — different name |
| `settings.tax` | `settings.tax_payment` | NO — different name |

### Consequences

1. **The Permissions Tab shows "role default: denied" for ALL 27 permissions** — because `getRoleDefault()` searches `rolePermissions` for a matching `permission_key`, and none of the UI keys exist in the DB
2. **Overrides saved from the UI are stored under keys that nothing reads** — dead data
3. **The 80 seed data permissions have no UI** — they exist in the DB but can't be viewed or toggled from the admin panel
4. **The only working permission (`inventory.view_cost_data`) has no UI toggle** — it's in the seed data but NOT in the Permissions Tab

---

## 3. Complete Wiring Matrix

### Permissions Displayed in the Permissions Tab (27 keys)

Every permission listed in the UI Permissions Tab is traced through the full stack:

| Permission Key | UI Label | In Permissions Tab? | Client Enforcement? | Server Enforcement? | Verdict |
|----------------|----------|---------------------|---------------------|---------------------|---------|
| `pos.open_register` | Open Register | YES | NO | NO | **COSMETIC** |
| `pos.close_register` | Close Register | YES | NO | NO | **COSMETIC** |
| `pos.apply_discount` | Apply Discounts | YES | NO | NO | **COSMETIC** |
| `pos.void_transaction` | Void Transactions | YES | NO | NO | **COSMETIC** |
| `pos.process_refund` | Process Refunds | YES | NO | NO | **COSMETIC** |
| `pos.apply_coupon` | Apply Coupons | YES | NO | NO | **COSMETIC** |
| `customer.view` | View Customers | YES | NO | NO | **COSMETIC** |
| `customer.create` | Create Customers | YES | NO | NO | **COSMETIC** |
| `customer.edit` | Edit Customers | YES | NO | NO | **COSMETIC** |
| `customer.delete` | Delete Customers | YES | NO | NO | **COSMETIC** |
| `customer.view_financials` | View Financial Data | YES | NO | NO | **COSMETIC** |
| `staff.view` | View Staff | YES | NO | NO | **COSMETIC** |
| `staff.create` | Create Staff | YES | NO | NO | **COSMETIC** |
| `staff.edit` | Edit Staff | YES | NO | NO | **COSMETIC** |
| `staff.deactivate` | Deactivate Staff | YES | NO | NO | **COSMETIC** |
| `staff.permissions` | Manage Permissions | YES | NO | NO | **COSMETIC** |
| `catalog.products.manage` | Manage Products | YES | NO | NO | **COSMETIC** |
| `catalog.services.manage` | Manage Services | YES | NO | NO | **COSMETIC** |
| `catalog.categories.manage` | Manage Categories | YES | NO | NO | **COSMETIC** |
| `inventory.view` | View Inventory | YES | NO | NO | **COSMETIC** |
| `inventory.adjust` | Adjust Stock | YES | NO | NO | **COSMETIC** |
| `inventory.purchase_orders` | Purchase Orders | YES | NO | NO | **COSMETIC** |
| `reports.view` | View Reports | YES | NO | NO | **COSMETIC** |
| `reports.export` | Export Reports | YES | NO | NO | **COSMETIC** |
| `settings.business` | Business Settings | YES | NO | NO | **COSMETIC** |
| `settings.features` | Feature Flags | YES | NO | NO | **COSMETIC** |
| `settings.tax` | Tax Settings | YES | NO | NO | **COSMETIC** |

**Result: ALL 27 UI permissions are COSMETIC.** They are displayed as toggles, written to the DB on save, but nothing in the application reads them.

### Permissions in Seed Data but NOT in UI (80 keys)

These exist in the database but have no toggle in the Permissions Tab:

#### POS Operations (13 keys — 0 enforced)

| Seed Key | PROJECT.md Equivalent | In UI? | Enforced? | Verdict |
|----------|----------------------|--------|-----------|---------|
| `pos.open_close_register` | Open/close register | NO | NO | **DEAD** |
| `pos.create_tickets` | Create tickets | NO | NO | **DEAD** |
| `pos.add_items` | Add products/services | NO | NO | **DEAD** |
| `pos.apply_coupons` | Apply coupon codes | NO | NO | **DEAD** |
| `pos.apply_loyalty` | Apply loyalty rewards | NO | NO | **DEAD** |
| `pos.process_card` | Process card payments | NO | NO | **DEAD** |
| `pos.process_cash` | Process cash payments | NO | NO | **DEAD** |
| `pos.process_split` | Process split payments | NO | NO | **DEAD** |
| `pos.issue_refunds` | Issue refunds | NO | NO | **DEAD** |
| `pos.void_transactions` | Void transactions | NO | NO | **DEAD** |
| `pos.manual_discounts` | Apply manual discounts | NO | NO | **DEAD** |
| `pos.override_pricing` | Override pricing | NO | NO | **DEAD** |
| `pos.end_of_day` | End-of-day cash count | NO | NO | **DEAD** |

#### Customer Management (8 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `customers.view` | NO | NO | **DEAD** |
| `customers.create` | NO | NO | **DEAD** |
| `customers.edit` | NO | NO | **DEAD** |
| `customers.delete` | NO | NO | **DEAD** |
| `customers.view_history` | NO | NO | **DEAD** |
| `customers.view_loyalty` | NO | NO | **DEAD** |
| `customers.adjust_loyalty` | NO | NO | **DEAD** |
| `customers.export` | NO | NO | **DEAD** |

#### Appointments & Scheduling (10 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `appointments.view_today` | NO | NO | **DEAD** |
| `appointments.view_calendar` | NO | NO | **DEAD** |
| `appointments.create` | NO | NO | **DEAD** |
| `appointments.reschedule` | NO | NO | **DEAD** |
| `appointments.cancel` | NO | NO | **DEAD** |
| `appointments.waive_fee` | NO | NO | **DEAD** |
| `appointments.update_status` | NO | NO | **DEAD** |
| `appointments.add_notes` | NO | NO | **DEAD** |
| `appointments.manage_schedule` | NO | NO | **DEAD** |

#### Products & Inventory (10 keys — 1 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `products.view` | NO | NO | **DEAD** |
| `products.edit` | NO | NO | **DEAD** |
| `products.delete` | NO | NO | **DEAD** |
| `inventory.view_stock` | NO | NO | **DEAD** |
| `inventory.adjust_stock` | NO | NO | **DEAD** |
| `inventory.manage_po` | NO | NO | **DEAD** |
| `inventory.receive` | NO | NO | **DEAD** |
| `inventory.view_costs` | NO | NO | **DEAD** |
| `inventory.manage_vendors` | NO | NO | **DEAD** |
| **`inventory.view_cost_data`** | **NO** | **YES — CLIENT ONLY** | **MISSING FROM UI** |

**`inventory.view_cost_data` enforcement locations:**
- `src/app/admin/catalog/products/page.tsx:54` — hides cost/margin columns in product list
- `src/app/admin/catalog/products/[id]/page.tsx:48` — hides Cost & Margin card on product detail
- `src/app/admin/inventory/vendors/[id]/page.tsx:26` — hides cost/margin columns on vendor detail

No server-side enforcement — API routes return cost data regardless.

#### Services (5 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `services.view` | NO | NO | **DEAD** |
| `services.edit` | NO | NO | **DEAD** |
| `services.delete` | NO | NO | **DEAD** |
| `services.manage_addons` | NO | NO | **DEAD** |
| `services.set_pricing` | NO | NO | **DEAD** |

#### Marketing & Campaigns (5 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `marketing.campaigns` | NO | NO | **DEAD** |
| `marketing.coupons` | NO | NO | **DEAD** |
| `marketing.analytics` | NO | NO | **DEAD** |
| `marketing.lifecycle_rules` | NO | NO | **DEAD** |
| `marketing.two_way_sms` | NO | NO | **DEAD** |

#### Quotes (3 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `quotes.create` | NO | NO | **DEAD** |
| `quotes.send` | NO | NO | **DEAD** |
| `quotes.convert` | NO | NO | **DEAD** |

#### Photos (4 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `photos.upload` | NO | NO | **DEAD** |
| `photos.view` | NO | NO | **DEAD** |
| `photos.delete` | NO | NO | **DEAD** |
| `photos.approve_marketing` | NO | NO | **DEAD** |

#### Financial & Reporting (7 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `reports.revenue` | NO | NO | **DEAD** |
| `reports.financial_detail` | NO | NO | **DEAD** |
| `reports.cost_margin` | NO | NO | **DEAD** |
| `reports.employee_tips` | NO | NO | **DEAD** |
| `reports.own_tips` | NO | NO | **DEAD** |
| `reports.export` | NO | NO | **DEAD** |
| `reports.quickbooks_status` | NO | NO | **DEAD** |

#### Employee Management (4 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `staff.clock_self` | NO | NO | **DEAD** |
| `staff.view_own_hours` | NO | NO | **DEAD** |
| `staff.view_all_hours` | NO | NO | **DEAD** |
| `staff.edit_time` | NO | NO | **DEAD** |

#### System & Settings (8 keys — 0 enforced)

| Seed Key | In UI? | Enforced? | Verdict |
|----------|--------|-----------|---------|
| `settings.feature_toggles` | NO | NO | **DEAD** |
| `settings.tax_payment` | NO | NO | **DEAD** |
| `settings.manage_users` | NO | NO | **DEAD** |
| `settings.roles_permissions` | NO | NO | **DEAD** |
| `settings.business_hours` | NO | NO | **DEAD** |
| `settings.audit_log` | NO | NO | **DEAD** |
| `settings.api_keys` | NO | NO | **DEAD** |
| `settings.backup_export` | NO | NO | **DEAD** |

---

## 4. Role Defaults Matrix

### Seed Data Defaults (Actual)

The seed data defines 80 permission keys across 4 roles. Full matrix from `supabase/seed.sql`:

| Permission Key | super_admin | admin | cashier | detailer |
|----------------|-------------|-------|---------|----------|
| **POS Operations** | | | | |
| pos.open_close_register | true | true | true | false |
| pos.create_tickets | true | true | true | false |
| pos.add_items | true | true | true | false |
| pos.apply_coupons | true | true | true | false |
| pos.apply_loyalty | true | true | true | false |
| pos.process_card | true | true | true | false |
| pos.process_cash | true | true | true | false |
| pos.process_split | true | true | true | false |
| pos.issue_refunds | true | true | **false** | false |
| pos.void_transactions | true | **false** | false | false |
| pos.manual_discounts | true | true | **false** | false |
| pos.override_pricing | true | **false** | false | false |
| pos.end_of_day | true | true | true | false |
| **Customer Management** | | | | |
| customers.view | true | true | true | **true** |
| customers.create | true | true | true | false |
| customers.edit | true | true | **false** | false |
| customers.delete | true | **false** | false | false |
| customers.view_history | true | true | true | **false** |
| customers.view_loyalty | true | true | true | false |
| customers.adjust_loyalty | true | true | **false** | false |
| customers.export | true | **false** | false | false |
| **Appointments & Scheduling** | | | | |
| appointments.view_today | true | true | true | true |
| appointments.view_calendar | true | true | true | **false** |
| appointments.create | true | true | true | false |
| appointments.reschedule | true | true | true | false |
| appointments.cancel | true | true | **false** | false |
| appointments.waive_fee | true | true | **false** | false |
| appointments.update_status | true | true | true | true |
| appointments.add_notes | true | true | true | true |
| appointments.manage_schedule | true | true | **false** | false |
| **Products & Inventory** | | | | |
| products.view | true | true | true | true |
| products.edit | true | true | false | false |
| products.delete | true | **false** | false | false |
| inventory.view_stock | true | true | true | false |
| inventory.adjust_stock | true | true | false | false |
| inventory.manage_po | true | true | false | false |
| inventory.receive | true | true | **true** | false |
| inventory.view_costs | true | true | false | false |
| inventory.manage_vendors | true | true | false | false |
| inventory.view_cost_data | true | true | false | false |
| **Services** | | | | |
| services.view | true | true | true | true |
| services.edit | true | true | false | false |
| services.delete | true | **false** | false | false |
| services.manage_addons | true | true | false | false |
| services.set_pricing | true | true | false | false |
| **Marketing & Campaigns** | | | | |
| marketing.campaigns | true | true | false | false |
| marketing.coupons | true | true | false | false |
| marketing.analytics | true | true | false | false |
| marketing.lifecycle_rules | true | true | false | false |
| marketing.two_way_sms | true | true | false | false |
| **Quotes** | | | | |
| quotes.create | true | true | true | false |
| quotes.send | true | true | true | false |
| quotes.convert | true | true | true | false |
| **Photos** | | | | |
| photos.upload | true | true | true | true |
| photos.view | true | true | true | true |
| photos.delete | true | true | false | false |
| photos.approve_marketing | true | true | false | false |
| **Financial & Reporting** | | | | |
| reports.revenue | true | true | false | false |
| reports.financial_detail | true | **false** | false | false |
| reports.cost_margin | true | **false** | false | false |
| reports.employee_tips | true | **false** | false | false |
| reports.own_tips | true | true | true | true |
| reports.export | true | **false** | false | false |
| reports.quickbooks_status | true | **false** | false | false |
| **Employee Management** | | | | |
| staff.clock_self | true | true | true | true |
| staff.view_own_hours | true | true | true | true |
| staff.view_all_hours | true | true | false | false |
| staff.edit_time | true | **false** | false | false |
| **System & Settings** | | | | |
| settings.feature_toggles | true | false | false | false |
| settings.tax_payment | true | false | false | false |
| settings.manage_users | true | false | false | false |
| settings.roles_permissions | true | false | false | false |
| settings.business_hours | true | **true** | false | false |
| settings.audit_log | true | false | false | false |
| settings.api_keys | true | false | false | false |
| settings.backup_export | true | false | false | false |

### Comparison: Seed Data vs PROJECT.md Spec

The seed data **exactly matches** the PROJECT.md Default Permission Matrix. Every role/permission combination in the spec is faithfully represented in the seed SQL. No mismatches found.

The data model is correct — the problem is that nothing reads it.

---

## 5. Route Access vs Permissions Gap Analysis

### How Route Access Works

`ROUTE_ACCESS` in `roles.ts` maps URL paths to allowed roles. Enforced client-side in `admin-shell.tsx` via `canAccessRoute()` on every pathname change. Uses parent-path fallback (e.g., `/admin/catalog/products/new` inherits from `/admin/catalog/products` → `/admin/catalog`).

### Complete Route Access Map

| Route | super_admin | admin | cashier | detailer |
|-------|-------------|-------|---------|----------|
| `/admin` | YES | YES | YES | YES |
| `/admin/appointments` | YES | YES | YES | YES |
| `/admin/customers` | YES | YES | YES | NO |
| `/admin/messaging` | YES | YES | YES | YES |
| `/admin/transactions` | YES | YES | NO | NO |
| `/admin/quotes` | YES | YES | NO | NO |
| `/admin/catalog/*` | YES | YES | NO | NO |
| `/admin/inventory/*` | YES | YES | NO | NO |
| `/admin/marketing/*` | YES | YES | NO | NO |
| `/admin/staff` | YES | NO | NO | NO |
| `/admin/settings/*` | YES | NO | NO | NO |
| `/admin/migration` | YES | NO | NO | NO |
| `/pos` | YES | YES | YES | NO |

### Conflict Analysis: Route Access vs Granular Permissions

| Scenario | Route Layer | Permission Layer | Conflict |
|----------|-------------|------------------|----------|
| Cashier visits `/admin/customers` | ALLOWED | No permission checks on page | **Gap** — cashier can view/create/edit/delete customers with zero granular gates |
| Cashier visits `/admin/appointments` | ALLOWED | No permission checks on page | **Gap** — cashier can cancel appointments, waive fees, manage schedules |
| Detailer visits `/admin/appointments` | ALLOWED | No permission checks on page | **Gap** — detailer can see all appointment actions |
| Detailer visits `/admin/messaging` | ALLOWED | No permission checks on page | **Gap** — detailer has full messaging access |
| Admin visits `/admin/catalog/products` | ALLOWED | `inventory.view_cost_data` checked for cost columns only | **Partial** — only cost visibility is gated, all other CRUD is open |
| Admin visits `/admin/settings` | BLOCKED by route | N/A | No conflict — route blocks access entirely, making settings permissions irrelevant |
| Cashier visits `/admin/transactions` | BLOCKED by route | N/A | No conflict — route blocks access |
| Detailer visits `/pos` | BLOCKED by route | N/A | No conflict — route blocks access |

### Key Findings

1. **Route access is the ONLY enforced layer.** For routes where a role IS allowed, there are zero granular permission checks on the pages (except `inventory.view_cost_data`).

2. **Route access makes many permissions irrelevant.** Settings permissions (`settings.*`) are moot because the route layer already blocks all non-super_admin roles. Same for marketing, catalog, inventory, staff, and quotes pages.

3. **No action-level gating within accessible pages.** When a cashier visits `/admin/customers`, they see every button — create, edit, delete — regardless of what their role permissions say in the seed data.

4. **API routes have no authorization checks.** Even if the UI hid a "Delete" button, a direct API call to `DELETE /api/admin/customers/[id]` would succeed for any authenticated user.

---

## 6. Dead Permissions List

### Category 1: UI-Only Keys (27 keys)

These appear in the Permissions Tab but use different keys than the seed data, so:
- They show incorrect "role default" values (always "denied")
- Overrides saved under these keys are never read by any code
- **All 27 are dead**

Keys: `pos.open_register`, `pos.close_register`, `pos.apply_discount`, `pos.void_transaction`, `pos.process_refund`, `pos.apply_coupon`, `customer.view`, `customer.create`, `customer.edit`, `customer.delete`, `customer.view_financials`, `staff.view`, `staff.create`, `staff.edit`, `staff.deactivate`, `staff.permissions`, `catalog.products.manage`, `catalog.services.manage`, `catalog.categories.manage`, `inventory.view`, `inventory.adjust`, `inventory.purchase_orders`, `reports.view`, `reports.export`, `settings.business`, `settings.features`, `settings.tax`

### Category 2: Seed-Only Keys (79 of 80 keys)

These exist in the database seed but are never checked by any `usePermission()` call or API route:
- **79 of 80 seed keys are dead** (the only live one is `inventory.view_cost_data`)
- They occupy database rows but serve no functional purpose

### Category 3: Unused Hooks (2 functions)

- `useIsSuperAdmin()` — defined in `use-permission.ts:33`, never imported anywhere
- `useIsAdminOrAbove()` — defined in `use-permission.ts:38`, never imported anywhere

---

## 7. Security Holes List

### 7.1 Client-Only Enforcement (No Server-Side Protection)

| What's Gated | Client Gate | Server Gate | Risk |
|--------------|-------------|-------------|------|
| Cost/margin data visibility | `usePermission('inventory.view_cost_data')` hides columns | **NONE** — API returns cost data to all authenticated users | LOW — data exposure, not data modification |

### 7.2 No Permission Checks on Any API Route

Every admin API route follows this pattern:
```typescript
// Check authentication (is user logged in?)
const { data: { user } } = await supabaseSession.auth.getUser();
if (!user) return 401;

// Use service role — bypasses ALL RLS
const supabase = createAdminClient();
// Proceed with operation — no role or permission check
```

**Affected operations (any authenticated user can execute via direct API call):**

| Operation | API Route | Expected Gate | Actual Gate |
|-----------|-----------|---------------|-------------|
| Delete customer | `DELETE /api/admin/customers/[id]` | `customers.delete` (super_admin only per spec) | Auth only |
| Edit customer | `PATCH /api/admin/customers/[id]` | `customers.edit` (admin+ per spec) | Auth only |
| Update staff | `PATCH /api/admin/staff/[id]` | `settings.manage_users` (super_admin only per spec) | Auth only |
| Create staff | `POST /api/staff/create` | `settings.manage_users` (super_admin only per spec) | Auth only |
| Toggle permissions | Direct Supabase insert to `permissions` table | `settings.roles_permissions` (super_admin only per spec) | Auth only (via RLS) |
| Modify settings | Various `/api/admin/settings/*` | `settings.*` (super_admin only per spec) | Auth only |
| Delete products | Various `/api/admin/catalog/*` | `products.delete` (super_admin only per spec) | Auth only |
| Stock adjustments | `POST /api/admin/stock-adjustments` | `inventory.adjust_stock` (admin+ per spec) | Auth only |
| POS refunds | POS API routes | `pos.issue_refunds` (admin+ per spec) | HMAC auth only |
| POS void | POS API routes | `pos.void_transactions` (super_admin only per spec) | HMAC auth only |

### 7.3 Permissions Tab Uses Client-Side Supabase Directly

The Permissions Tab saves overrides by calling `supabase.from('permissions').delete()` and `.insert()` directly from the browser — not through an API route. This means:
- Any authenticated user with browser dev tools could modify the `permissions` table
- The RLS policy on `permissions` allows all authenticated users to read/write
- The Staff page is only accessible to super_admin via route access, but the underlying DB operations are not role-restricted

---

## 8. Missing Permissions List (Actions That Should Be Gated But Aren't)

Based on the PROJECT.md spec, these actions exist in the codebase with NO permission check:

| Action | Where It Exists | Spec Says Gate With | Currently Gated By |
|--------|----------------|--------------------|--------------------|
| Create customer | Admin customer pages + POS | `customers.create` | Route access only (cashier+ can access) |
| Edit customer | Admin customer detail | `customers.edit` | Route access only |
| Delete customer | Admin customer detail | `customers.delete` | Route access only |
| Cancel appointment | Admin appointment detail | `appointments.cancel` | Route access only (all roles can access) |
| Waive cancellation fee | Cancel dialog | `appointments.waive_fee` | Route access only |
| Reschedule appointment | Admin appointment detail | `appointments.reschedule` | Route access only |
| POS refunds | POS interface | `pos.issue_refunds` | POS route access only (cashier can access but spec says denied) |
| POS void | POS interface | `pos.void_transactions` | POS route access only |
| POS manual discounts | POS interface | `pos.manual_discounts` | POS route access only |
| POS price override | POS interface | `pos.override_pricing` | POS route access only |
| Delete product | Admin product detail | `products.delete` | Route access only |
| Delete service | Admin service detail | `services.delete` | Route access only |
| Adjust stock | Admin inventory | `inventory.adjust_stock` | Route access only |
| Export customer data | Admin customers | `customers.export` | Route access only |
| Adjust loyalty points | Admin customer detail | `customers.adjust_loyalty` | Route access only |
| View all employee hours | Staff management | `staff.view_all_hours` | Staff page is super_admin only via route |
| Send campaigns | Marketing campaigns | `marketing.campaigns` | Route access only |
| Create coupons | Marketing coupons | `marketing.coupons` | Route access only |
| Manage lifecycle rules | Marketing automations | `marketing.lifecycle_rules` | Route access only |

---

## 9. Summary Statistics

| Metric | Count |
|--------|-------|
| Permission keys in seed data | 80 |
| Permission keys in UI Permissions Tab | 27 |
| Keys that match between UI and seed | 1 (`reports.export`, coincidental) |
| Permissions actually enforced (client-side) | 1 (`inventory.view_cost_data`) |
| Permissions enforced server-side | 0 |
| API routes with permission checks | 0 |
| Permissions that are FULLY WIRED | 0 |
| Permissions that are CLIENT ONLY | 1 |
| Permissions that are COSMETIC | 27 (all UI keys) |
| Permissions that are DEAD in DB | 79 (seed keys never checked) |
| Permissions MISSING FROM UI | 1 (`inventory.view_cost_data`) |
| Convenience hooks never used | 2 (`useIsSuperAdmin`, `useIsAdminOrAbove`) |

### Bottom Line

The permissions system has solid infrastructure — the table schema, resolution logic, client hooks, and seed data are all well-designed and match the PROJECT.md spec. However, the system is **almost entirely non-functional** due to:

1. A complete key mismatch between the UI and the database
2. Only 1 of 80+ permissions being actually checked anywhere
3. Zero server-side enforcement
4. Route access being the only real authorization layer
