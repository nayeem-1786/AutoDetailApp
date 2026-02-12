# Role Experience Audit — Dashboard & POS

**Date:** 2026-02-11
**Scope:** What each role (super_admin, admin, cashier, detailer) actually sees and can do in both the Admin Dashboard and POS interfaces. Documents the current truth, not what PROJECT.md says should exist.

---

## Table of Contents

1. [Dashboard Experience Matrix](#1-dashboard-experience-matrix)
2. [POS Experience Matrix](#2-pos-experience-matrix)
3. [Detailer Workflow Assessment](#3-detailer-workflow-assessment)
4. [Cashier Workflow Assessment](#4-cashier-workflow-assessment)
5. [Cross-Interface Gaps](#5-cross-interface-gaps)
6. [Permission vs Route Conflicts](#6-permission-vs-route-conflicts)

---

## 1. Dashboard Experience Matrix

### 1A. Sidebar Navigation Per Role

**Source:** `src/lib/auth/roles.ts` — `SIDEBAR_NAV` array + `getNavForRole()`

| Sidebar Item | super_admin | admin | cashier | detailer |
|---|:---:|:---:|:---:|:---:|
| Dashboard | Y | Y | Y | Y |
| Appointments | Y | Y | Y | Y |
| Transactions | Y | Y | - | - |
| Quotes | Y | Y | - | - |
| Customers | Y | Y | Y | - |
| Messaging | Y | Y | Y | Y |
| Marketing (Coupons, Automations, Campaigns, Compliance, Analytics) | Y | Y | - | - |
| Catalog (Products, Services, Categories) | Y | Y | - | - |
| Inventory (Stock Overview, Purchase Orders, Stock History, Vendors) | Y | Y | - | - |
| Staff | Y | - | - | - |
| Migration | Y | - | - | - |
| Settings | Y | - | - | - |

**Notes:**
- Messaging sidebar item is additionally gated by `two_way_sms` feature flag (hidden when OFF)
- Inventory sidebar item is additionally gated by `inventory_management` feature flag (hidden when OFF)
- Sidebar items for restricted roles are completely hidden, never grayed out

### 1B. Dashboard Home Page Per Role

**Source:** `src/app/admin/page.tsx` (577 lines)

#### What Everyone Sees (All 4 Roles)
- **Welcome header** with employee first name and current date
- **Needs Attention banner** — amber banner with count of pending appointments (no role gate)
- **Stock Alert banner** — amber banner with low/out-of-stock counts, links to `/admin/catalog/products?stock=low-stock` (NO role gate — see [Cross-Interface Gaps](#5-cross-interface-gaps))
- **4 Appointment Stat Cards** — Today's Appointments, Remaining, In Progress, Completed Today
- **Week at a Glance** — 7-day grid with appointment counts and status dots
- **Today's Schedule** — Confirmed + in_progress appointments with clickable detail cards

#### Role-Specific Differences

| Dashboard Element | super_admin | admin | cashier | detailer |
|---|:---:|:---:|:---:|:---:|
| Appointment stat cards (4) | Y | Y | Y | Y |
| Quote/Customer stat cards (4) | Y | Y | Y | **HIDDEN** |
| Stock Alert banner | Y | Y | Y | Y |
| Quick Action: Appointments | Y | Y | Y | "My Schedule" |
| Quick Action: Customers | Y | Y | Y | - |
| Quick Action: Catalog | Y | Y | - | - |
| Quick Action: Settings | Y | - | - | - |
| "View Calendar" link text | "View Calendar" | "View Calendar" | "View Calendar" | "View All" |

**Detailer-specific:** Line 338 gates quote/customer cards with `role !== 'detailer'`. Quick action shows "My Schedule" instead of "Appointments" with description "View today's appointments" (line 201-202).

**Dashboard appointment detail dialog** (line 564-573): When clicking a schedule item from the dashboard, ALL roles get `canReschedule={false}` and `canCancel={false}`. This is a read-only preview — full editing is on the Appointments page.

**Data scope:** ALL dashboard data is global (not filtered by assigned employee). A detailer sees total appointment counts for the whole business, not just their own.

### 1C. Page-Level Route Gating

**Source:** `src/app/admin/admin-shell.tsx` (line ~297-301)

```typescript
useEffect(() => {
  if (role && !canAccessRoute(role, pathname)) {
    router.push('/admin');
  }
}, [role, pathname, router]);
```

**Behavior:** Silent redirect to `/admin`. **No toast, no error message, no flash.** User simply lands on dashboard with no explanation of why they were redirected.

#### Route Access Matrix (from `ROUTE_ACCESS` in roles.ts)

| Route | super_admin | admin | cashier | detailer |
|---|:---:|:---:|:---:|:---:|
| `/admin` | Y | Y | Y | Y |
| `/admin/appointments` | Y | Y | Y | Y |
| `/admin/customers` | Y | Y | Y | - |
| `/admin/messaging` | Y | Y | Y | Y |
| `/admin/transactions` | Y | Y | - | - |
| `/admin/quotes` | Y | Y | - | - |
| `/admin/marketing/*` | Y | Y | - | - |
| `/admin/catalog/*` | Y | Y | - | - |
| `/admin/inventory/*` | Y | Y | - | - |
| `/admin/settings/*` | Y | - | - | - |
| `/admin/staff` | Y | - | - | - |
| `/admin/migration` | Y | - | - | - |
| `/pos` | Y | Y | Y | - |

**Route resolution:** `canAccessRoute()` checks exact match first, then walks up parent segments. This means `/admin/customers/123` inherits from `/admin/customers`.

### 1D. Per-Page Role Behavior

#### Appointments Page (`/admin/appointments`)

**Source:** `src/app/admin/appointments/page.tsx` (lines 34-37)

| Permission | super_admin | admin | cashier | detailer |
|---|:---:|:---:|:---:|:---:|
| View full calendar | Y | Y | Y | - |
| View today only | - | - | - | Y |
| Reschedule | Y | Y | Y | - |
| Cancel | Y | Y | - | - |
| Update status | Y | Y | Y | Y |
| Add/edit notes | Y | Y | Y | Y |
| Filter/search | Y | Y | Y | - |

**Detailer view** (lines 282-327): Gets a simplified "Today's Schedule" page with just a date header and list of today's appointments. No calendar, no filters, no week view. But `onSave={handleSave}` IS wired, so detailer CAN update status and notes via the detail dialog.

**No assignment filtering:** Detailer sees ALL of today's appointments, not just ones assigned to them. No server-side or client-side check that `appointment.employee_id === currentEmployeeId`.

#### Customers Page (`/admin/customers`)

**Access:** super_admin, admin, cashier (detailer blocked at route level)

**Within the page:** No role-conditional rendering. All three roles have identical capabilities:
- View customer list with all filters
- Create new customers (Add Customer button, no role gate)
- Edit customer details
- Delete customers
- Bulk tag actions
- Full customer detail page with all tabs (Info, Vehicles, Transactions, Quotes, Loyalty, Appointments, History)

#### Messaging Page (`/admin/messaging`)

**Access:** All 4 roles (if `two_way_sms` feature flag is ON)

**Within the page:** No role-conditional rendering. All roles see identical shared team inbox:
- View all conversations (no scoping by customer assignment)
- Send SMS replies
- Toggle AI auto-responder per conversation
- Change conversation status (open/close/archive)
- View customer summary card

#### Transactions Page (`/admin/transactions`)

**Access:** super_admin, admin only. Cashier and detailer blocked at route level.

**Within the page:** No role-conditional rendering. All financial data (revenue, tips, payment methods) visible to any role that reaches the page.

---

## 2. POS Experience Matrix

### 2A. POS Authentication

**Source:** `src/app/pos/login/page.tsx`, `src/app/api/pos/auth/pin-login/route.ts`, `src/lib/pos/session.ts`

| Aspect | Detail |
|---|---|
| Auth method | 4-digit PIN (not Supabase session) |
| Employee lookup | `employees` table by `pin_code` where `status = 'active'` |
| Token type | Custom JWT, 12-hour lifetime |
| Token storage | `localStorage` key `pos_session` |
| Role detection | `employee.role` from DB, stored in JWT and exposed via `usePosAuth()` |
| Idle timeout | Configurable via `business_settings.pos_idle_timeout_minutes` (default 15 min), triggers PIN lock screen |
| Cross-tab sync | Storage events sync login/logout/lock across tabs |
| Auth context | Separate from admin auth — `PosAuthProvider` / `usePosAuth()`, NOT `useAuth()` |

**Route gate** (`pos-shell.tsx` line ~177): After login, checks `canAccessRoute(role, '/pos')`. Detailer is NOT in ROUTE_ACCESS for `/pos` and sees a red shield error page: "You don't have access to the POS" with "Back to Admin" link.

### 2B. POS Navigation Per Role

**Source:** `src/app/pos/components/bottom-nav.tsx`, `src/app/pos/pos-shell.tsx`

All POS tabs are visible to all POS-authenticated users. No role-based tab hiding.

| Bottom Nav Tab | Route | super_admin | admin | cashier | detailer |
|---|---|:---:|:---:|:---:|:---:|
| Log Out | N/A (signs out) | Y | Y | Y | N/A |
| Register (EOD) | `/pos/end-of-day` | Y | Y | Y | N/A |
| Transactions | `/pos/transactions` | Y | Y | Y | N/A |
| Quotes | `/pos/quotes` | Y | Y | Y | N/A |
| More > Go to Admin | `/admin` | Y | Y | Y | N/A |
| More > Settings | `/admin/settings` | Y | Y | Y | N/A |

**Role badge in header** (`pos-shell.tsx` lines 436-438):
- super_admin → "Admin"
- admin → "Admin"
- cashier → "Cashier"
- detailer → never reaches POS

### 2C. POS Action Gating Per Role

| POS Action | Who can do it? | Gating mechanism | File:Line |
|---|---|---|---|
| Create ticket/sale | All POS roles | API: auth only, no role check | `api/pos/transactions/route.ts` |
| Add items to ticket | All POS roles | No gating | `ticket-context.tsx` |
| Apply coupon | All POS roles | API: auth only, no role check | `api/pos/coupons/validate/route.ts` |
| Redeem loyalty points | All POS roles (if flag ON) | API: auth + feature flag, no role check | `api/pos/loyalty/redeem/route.ts` |
| Hold/park ticket | All POS roles | No gating | `ticket-actions.tsx:54` |
| View transaction history | All POS roles | No gating | `transactions/transaction-detail.tsx` |
| **Apply manual discount** | **super_admin, admin only** | **UI: `isManager` check** | `ticket-panel.tsx:39,195` |
| **Process refund** | **super_admin, admin only** | **UI: `canRefund` check** | `transaction-detail.tsx:98-100` |
| **Void transaction** | **super_admin, admin only** | **UI: `canVoid` check** | `transaction-detail.tsx:102-104` |
| Open register (EOD) | All POS roles | No gating | `end-of-day/page.tsx:127` |
| View day summary (EOD) | All POS roles | No gating | `end-of-day/page.tsx:360-365` |
| **Close register (EOD)** | **super_admin, admin only** | **UI: `isManager` check** | `end-of-day/page.tsx:37,368-377` |
| Create/edit quote | All POS roles | No gating | `quote-ticket-panel.tsx` |
| **Send quote** | **All POS roles** | **No gating** | `quote-ticket-panel.tsx:488-494` |
| Access POS settings | super_admin only | Route gate (links to `/admin/settings`) | `bottom-nav.tsx:157-164` |

**Security note:** Manual discount, refund, and void are UI-gated only (buttons hidden for cashier). The underlying API routes (`/api/pos/refunds`, `/api/pos/transactions/[id]`) do NOT check role — only `authenticatePosRequest()`. A cashier with a valid token could bypass UI restrictions by calling APIs directly.

### 2D. EOD (End-of-Day) Detail

**Source:** `src/app/pos/end-of-day/page.tsx` (540 lines)

| EOD Function | super_admin | admin | cashier |
|---|:---:|:---:|:---:|
| Open register (count float) | Y | Y | Y |
| View day summary (revenue, tips, payment breakdown) | Y | Y | Y |
| Count drawer cash | Y | Y | **BLOCKED** |
| Set next-day float | Y | Y | **BLOCKED** |
| Set deposit amount | Y | Y | **BLOCKED** |
| Add closing notes | Y | Y | **BLOCKED** |
| Close register button | Y | Y | **BLOCKED** |

Cashier sees an amber banner (line 368-377): "Manager access required to close the register. Ask a manager to close out for the day." with a lock icon.

---

## 3. Detailer Workflow Assessment

### What a Detailer's Day Should Look Like (Ideal)

1. Clock in at start of shift
2. View today's schedule and assigned jobs
3. See customer contact info and vehicle details
4. Take before photos
5. Perform the service
6. Update job status to in_progress / completed
7. Take after photos and add notes
8. View tips earned
9. Move to next appointment
10. Clock out

### What the System Actually Provides

| Step | Status | Details |
|---|---|---|
| Clock in/out | **NOT BUILT** | No time tracking, attendance, or work session tables/UI exist |
| View today's schedule | **WORKS** | Appointments page shows today-only view for detailer |
| See assigned jobs only | **PARTIAL** | Shows ALL appointments today, not filtered by assigned detailer |
| Customer contact info | **WORKS** | Available in appointment detail dialog |
| Vehicle details | **WORKS** | Available in appointment detail dialog |
| Take before/after photos | **NOT BUILT** | Phase 8 (Photo Documentation) — no tables, no upload UI |
| Update job status | **WORKS** | Status dropdown in detail dialog, `onSave` is wired |
| Add job notes | **WORKS** | Internal notes and job notes textareas in detail dialog |
| View tips earned | **NOT BUILT** | `tip_amount` exists in transactions table but no tip UI for detailers |
| Quick action buttons | **NOT BUILT** | No "Start Job" / "Complete Job" buttons — generic dropdown only |
| SMS customer directly | **WORKS** | Via Messaging page (if `two_way_sms` flag ON) |
| View calendar/upcoming | **NOT BUILT** | Only sees today, no forward planning |

### Detailer Dashboard Summary

| Dashboard Widget | Visible | Useful? |
|---|---|---|
| 4 Appointment stat cards | Y | Somewhat (shows global counts, not personal) |
| Quote/Customer stat cards | HIDDEN | N/A |
| Stock Alert banner | Y | **NOT useful** (links to catalog page detailer can't access) |
| Week at a Glance | Y | Somewhat (shows global week, not personal assignments) |
| Today's Schedule | Y | Yes (main useful widget) |
| Quick Actions | "My Schedule" only | Yes |

### Detailer Verdict: **30-40% Complete**

The detailer has a minimally functional read-and-update workflow: view today's schedule, click into appointments, update status, add notes, message customers. But critical daily workflow features are missing: no personal assignment filtering, no clock in/out, no photos, no tip visibility, no quick-action buttons, no forward schedule planning.

**Key permission gap:** Detailer can update status on ANY appointment (not just ones assigned to them). No `appointment.employee_id === currentEmployeeId` validation exists on client or server side.

---

## 4. Cashier Workflow Assessment

### Dashboard Access

The cashier dashboard shows the same content as admin minus:
- No Catalog quick action
- No Settings quick action
- Otherwise identical widgets, stats, and banners

### Per-Page Capabilities

| Page | Access | Capabilities |
|---|---|---|
| Dashboard | Y | All widgets, all stats, all banners |
| Appointments | Y | Full calendar, reschedule (NOT cancel), update status, add notes |
| Customers | Y | Full CRUD: create, view, edit, delete, bulk tag, all detail tabs |
| Messaging | Y | Full inbox: view all conversations, send/receive SMS, toggle AI |
| Transactions | BLOCKED | N/A (route redirect) |
| Quotes (admin) | BLOCKED | N/A (route redirect) |
| Catalog | BLOCKED | N/A (route redirect) |
| Inventory | BLOCKED | N/A (route redirect) |
| Marketing | BLOCKED | N/A (route redirect) |
| Staff | BLOCKED | N/A (route redirect) |
| Settings | BLOCKED | N/A (route redirect) |

### POS Capabilities

| POS Feature | Cashier Can? | Notes |
|---|---|---|
| Process sales (create tickets) | Y | Same as admin |
| Apply coupons | Y | Same as admin |
| Redeem loyalty points | Y | Same as admin (if flag ON) |
| Hold/park tickets | Y | Same as admin |
| View transaction history | Y | Same as admin |
| Create/edit/send quotes | Y | Via POS builder — full capability |
| Open register | Y | Same as admin |
| View day summary | Y | Same as admin |
| Apply manual discount | **NO** | Button hidden (`isManager` check) |
| Process refund | **NO** | Button hidden (`canRefund` check) |
| Void transaction | **NO** | Button hidden (`canVoid` check) |
| Close register | **NO** | "Manager access required" message shown |
| Access settings | **NO** | Link exists but `/admin/settings` is super_admin only |

### Cashier Verdict: **~80% Complete**

The cashier has a strong POS workflow (sell, apply coupons, hold tickets, create and send quotes) and solid admin access (customers, appointments, messaging). The main design restrictions (no refund/void/manual discount/close register) appear intentional for loss prevention.

**Key gaps:**
1. Cannot cancel appointments (only reschedule) — likely intentional
2. Cannot view stock levels anywhere useful — dashboard banner links to blocked page
3. Quote stat cards on dashboard link to `/admin/quotes` which cashier can't access
4. POS Settings link in bottom nav leads to blocked page

---

## 5. Cross-Interface Gaps

These are places where one interface references or links to pages the role cannot access.

### Gap 1: Dashboard Stock Alert Banner → Catalog Products

| Detail | Value |
|---|---|
| **Where:** | Dashboard (`/admin/page.tsx` lines 245-268) |
| **What happens:** | Amber banner shows stock alert counts, entire banner is a `<Link>` to `/admin/catalog/products?stock=low-stock` |
| **Problem:** | **No role check.** Banner is visible to ALL roles including cashier and detailer. Cashier clicking it gets silently redirected to `/admin`. Detailer same. |
| **Affected roles:** | cashier, detailer |

### Gap 2: Dashboard Quote Cards → Admin Quotes

| Detail | Value |
|---|---|
| **Where:** | Dashboard (`/admin/page.tsx` lines 340, 357) |
| **What happens:** | "Open Quotes" card links to `/admin/quotes`, "Drafts" card links to `/admin/quotes?status=draft` |
| **Problem:** | Cards are visible to cashier (`role !== 'detailer'` is the only gate, line 338). But `/admin/quotes` ROUTE_ACCESS is `[super_admin, admin]` only. Cashier clicking these gets silently redirected. |
| **Affected roles:** | cashier |

### Gap 3: POS Settings Link → Admin Settings

| Detail | Value |
|---|---|
| **Where:** | POS bottom nav (`bottom-nav.tsx` lines 157-164) |
| **What happens:** | "More" dropdown has "Settings" link to `/admin/settings` |
| **Problem:** | Link is visible to ALL POS roles (no role check). `/admin/settings` ROUTE_ACCESS is `[super_admin]` only. Admin and cashier clicking it get redirected to `/admin` dashboard. |
| **Affected roles:** | admin, cashier |

### Gap 4: POS "Go to Admin" → Limited Dashboard

| Detail | Value |
|---|---|
| **Where:** | POS bottom nav (`bottom-nav.tsx` lines 149-156) |
| **What happens:** | "Go to Admin" links to `/admin` |
| **Problem:** | Not broken, but cashier lands on dashboard with only 4 sidebar items (Dashboard, Appointments, Customers, Messaging). May confuse users expecting full admin access. |
| **Severity:** | Low (functional, just potentially confusing) |

### Gap 5: Detailer Dashboard Data Scope

| Detail | Value |
|---|---|
| **Where:** | Dashboard (`/admin/page.tsx`) and Appointments page |
| **What happens:** | All queries fetch global data (no `employee_id` filter) |
| **Problem:** | Detailer sees appointment counts and schedules for the entire business, not just their assignments. "Today's Appointments: 8" might mean 2 for them and 6 for others. No way to distinguish. |
| **Affected roles:** | detailer |

---

## 6. Permission vs Route Conflicts

Places where PROJECT.md (or reasonable expectations) suggest a role should have access but code blocks or allows something unexpected.

### Conflict 1: Cashier Quote Access

| Aspect | Detail |
|---|---|
| **PROJECT.md says:** | Cashier should be able to create/edit/send quotes |
| **Code reality:** | `/admin/quotes` ROUTE_ACCESS blocks cashier. BUT POS quote builder (`/pos/quotes`) is accessible and includes "Save Draft" AND "Send Quote" buttons with no role check. |
| **Net effect:** | Cashier CAN create and send quotes (via POS only). Cannot view quote list, stats, or manage quotes from admin. |
| **Assessment:** | Mostly fine — POS is the primary quote workflow. Admin quotes page is read-only anyway. Dashboard quote cards linking to blocked page is the only issue. |

### Conflict 2: Cashier Inventory Receiving

| Aspect | Detail |
|---|---|
| **PROJECT.md says:** | Cashier should be able to receive inventory |
| **Code reality:** | All `/admin/inventory/*` routes are `[super_admin, admin]` only. No POS-based receiving flow exists. |
| **Net effect:** | Cashier has ZERO inventory access — cannot receive POs, view stock levels, or adjust quantities. |
| **Assessment:** | Gap — cashier needs inventory receiving if they handle deliveries. |

### Conflict 3: Cashier Stock Visibility

| Aspect | Detail |
|---|---|
| **Expected:** | Cashier should see if a product is out of stock before selling it |
| **Code reality:** | POS product selection does not check or display stock levels. No out-of-stock warnings during checkout. Dashboard stock alert banner is visible but links to blocked page. |
| **Net effect:** | Cashier can sell products regardless of stock status with no visibility. |
| **Assessment:** | Gap — POS should show stock indicators on product tiles. |

### Conflict 4: Detailer POS Access

| Aspect | Detail |
|---|---|
| **PROJECT.md says:** | Detailer has no POS access (by design) |
| **Code reality:** | `/pos` ROUTE_ACCESS excludes detailer. `pos-shell.tsx` shows error page if detailer attempts access. |
| **Net effect:** | Correctly blocked with clear error message. |
| **Assessment:** | Working as designed. |

### Conflict 5: Messaging Access Scope

| Aspect | Detail |
|---|---|
| **Expected:** | SMS messaging might be admin-level only |
| **Code reality:** | All 4 roles have ROUTE_ACCESS to `/admin/messaging`. No role-scoping inside the page. Cashier and detailer can read/reply to ANY conversation. |
| **Net effect:** | Shared team inbox accessible to all roles with full read/write. |
| **Assessment:** | Potentially intentional (delegation model). Document and confirm with business. |

### Conflict 6: API-Level Role Enforcement

| Aspect | Detail |
|---|---|
| **Expected:** | If UI hides a button, API should also enforce the restriction |
| **Code reality:** | Refund, void, manual discount, and register close are UI-gated only. API routes check auth token validity but NOT role. |
| **Gap:** | A cashier with a valid POS token could call `POST /api/pos/refunds` directly and process a refund. |
| **Affected APIs:** | `POST /api/pos/refunds`, `PATCH /api/pos/transactions/[id]` (void), `POST /api/pos/end-of-day` (close register) |
| **Assessment:** | Low risk in practice (requires API knowledge) but violates defense-in-depth. Server-side role checks should be added. |

### Conflict 7: Detailer Appointment Scope

| Aspect | Detail |
|---|---|
| **Expected:** | Detailer should only see/edit appointments assigned to them |
| **Code reality:** | Appointments page shows ALL appointments for today. Status update API (`PATCH /api/appointments/{id}`) does not check if the requesting user is the assigned employee. |
| **Net effect:** | Detailer can view and update status on any appointment, including ones assigned to other detailers. |
| **Assessment:** | Permission gap — should filter by `employee_id` and validate on save. |

---

## Appendix: Permissions System Architecture

**Source:** `src/lib/auth/permissions.ts`

The app has a two-tier permission system:

1. **Route Access (Active):** `ROUTE_ACCESS` map in `roles.ts` — coarse page-level gating by role. This is the primary access control mechanism used throughout the app.

2. **Granular Permissions (Dormant):** `permissions` table with `hasPermission()`, `hasAnyPermission()`, `hasAllPermissions()` functions. Supports user-level overrides and role-level defaults.

**Currently used granular permissions:**
- `inventory.view_cost_data` — Gates cost/margin visibility on product detail page

**Not used:** All other permission checks. Customer CRUD, appointment actions (except cancel), messaging, quote operations — none check granular permissions. Role-based route access is the sole enforcement mechanism for everything except cost data visibility.

**`usePermission()` hook:** Exists at `src/hooks/use-permission.ts` for client-side permission checks. Used sparingly.

---

## Appendix: File Reference

| Topic | File | Key Lines |
|---|---|---|
| Route access map | `src/lib/auth/roles.ts` | 5-37 |
| Sidebar navigation | `src/lib/auth/roles.ts` | 48-193 |
| Nav filtering function | `src/lib/auth/roles.ts` | 195-200 |
| Route access check | `src/lib/auth/roles.ts` | 202-222 |
| Admin shell redirect | `src/app/admin/admin-shell.tsx` | ~297-301 |
| Dashboard role logic | `src/app/admin/page.tsx` | 198-214, 338 |
| Appointments permissions | `src/app/admin/appointments/page.tsx` | 34-37 |
| Detailer today-only view | `src/app/admin/appointments/page.tsx` | 282-327 |
| POS auth context | `src/app/pos/context/pos-auth-context.tsx` | Full file |
| POS shell access check | `src/app/pos/pos-shell.tsx` | ~177 |
| POS role badge | `src/app/pos/pos-shell.tsx` | 436-438 |
| POS bottom nav | `src/app/pos/components/bottom-nav.tsx` | Full file |
| POS manual discount gate | `src/app/pos/components/ticket-panel.tsx` | 39, 195 |
| POS refund/void gate | `src/app/pos/components/transactions/transaction-detail.tsx` | 98-104 |
| EOD manager gate | `src/app/pos/end-of-day/page.tsx` | 37, 368-377 |
| POS quote send | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | 488-494 |
| Granular permissions | `src/lib/auth/permissions.ts` | Full file |
