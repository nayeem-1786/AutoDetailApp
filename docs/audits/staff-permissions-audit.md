# Staff Permissions Audit — Comprehensive Route & Page Analysis

> Date: 2026-04-11
> Scope: All admin API routes, admin pages, POS routes
> Status: Audit-only (no code changes)

---

## Summary

| Category | Total | With Permission Check | Without | Coverage |
|----------|-------|----------------------|---------|----------|
| Admin Pages | 96 | 42 | 54 | 44% |
| Admin API Routes | ~170 | ~90 | ~30 | ~85% (by route count) |
| POS Pages | 8 | 0 | 8 | 0% (PIN auth used instead) |

---

## 1. Hardcoded Role Checks (Should Use Permission System)

These routes bypass the permission system with direct role string comparisons:

| File | Line | Check | Should Use |
|------|------|-------|------------|
| `src/app/api/admin/staff/roles/route.ts` | 23 | `caller.role !== 'super_admin'` (GET) | `settings.roles_permissions` |
| `src/app/api/admin/staff/roles/route.ts` | 125 | `caller.role !== 'super_admin'` (POST) | `settings.roles_permissions` |
| `src/app/api/admin/staff/roles/[id]/route.ts` | 26 | `caller.role !== 'super_admin'` (PATCH) | `settings.roles_permissions` |
| `src/app/api/admin/staff/roles/[id]/route.ts` | 131 | `caller.role !== 'super_admin'` (DELETE) | `settings.roles_permissions` |
| `src/app/api/admin/staff/roles/[id]/reset/route.ts` | 32 | `caller.role !== 'super_admin'` (POST) | `settings.roles_permissions` |
| `src/app/api/admin/notification-recipients/route.ts` | — | `['super_admin', 'admin'].includes(role)` | New permission needed |
| `src/app/api/admin/notification-recipients/[id]/route.ts` | — | `['super_admin', 'admin'].includes(role)` | New permission needed |
| `src/app/api/admin/customers/search/route.ts` | — | `['super_admin', 'admin'].includes(role)` | `customers.view` |

**Status:** The staff/roles routes are intentionally super_admin-only (per CLAUDE.md "DO NOT modify the hardcoded super_admin checks on staff/roles routes — those are correct"). The notification-recipients and customer-search routes should migrate to the permission system.

---

## 2. Admin API Routes Without Permission Checks (Auth-Only)

These routes verify the user is an authenticated employee but do NOT check any specific permission:

### CRITICAL (Sensitive Data or Write Operations)

| Route | Methods | Risk | Recommended Permission |
|-------|---------|------|----------------------|
| `/api/admin/global-search/route.ts` | GET | Searches all 9 tables | `customers.view` (read-only, acceptable as-is) |
| `/api/admin/settings/business/route.ts` | GET, PATCH | Read/write ALL business settings | `settings.business_hours` (GET), `settings.feature_toggles` (PATCH) |
| `/api/admin/stripe/readers/[id]/route.ts` | DELETE | Delete Stripe readers | `settings.tax_payment` |
| `/api/admin/stripe/readers/route.ts` | GET, POST | List/register Stripe readers | `settings.tax_payment` |
| `/api/admin/stripe/locations/route.ts` | GET, POST | Stripe locations | `settings.tax_payment` |
| `/api/admin/receipt-logo/route.ts` | POST, DELETE | Upload/delete receipt logo | `settings.tax_payment` |
| `/api/admin/upload/content-image/route.ts` | POST, DELETE, GET | File uploads/deletions | `cms.pages.manage` |
| `/api/admin/staff/[id]/permissions/route.ts` | GET | View any employee's permissions | `settings.roles_permissions` |

### HIGH (Data Modification)

| Route | Methods | Risk | Recommended Permission |
|-------|---------|------|----------------------|
| `/api/admin/vehicle-makes/route.ts` | GET, POST, PATCH, DELETE | Full CRUD on vehicle makes | `services.edit` |
| `/api/admin/vehicle-categories/[id]/route.ts` | PATCH | Modify categories | `services.edit` |
| `/api/admin/sms-templates/route.ts` | GET | List SMS templates | `settings.feature_toggles` |
| `/api/admin/sms-templates/[slug]/route.ts` | GET, PATCH | View/edit templates | `settings.feature_toggles` |
| `/api/admin/sms-templates/[slug]/reset/route.ts` | POST | Reset template | `settings.feature_toggles` |
| `/api/admin/sms-templates/[slug]/test/route.ts` | POST | Send test SMS | `settings.feature_toggles` |
| `/api/admin/customers/[id]/restore/route.ts` | POST | Restore archived customer | `customers.edit` |
| `/api/admin/customers/[id]/photos/route.ts` | GET, POST | Customer photos | `photos.upload` |
| `/api/admin/cms/homepage-settings/route.ts` | GET, PUT | Modify homepage | `cms.hero.manage` |

### MEDIUM (Read-Only or Low-Risk)

| Route | Methods | Risk | Recommended Permission |
|-------|---------|------|----------------------|
| `/api/admin/quotes/route.ts` | GET | List quotes | `quotes.create` (view access) |
| `/api/admin/quotes/stats/route.ts` | GET | Quote analytics | `quotes.create` |
| `/api/admin/customers/stats/route.ts` | GET | Customer stats | `customers.view` |
| `/api/admin/customers/check-duplicate/route.ts` | GET | Check duplicates | `customers.view` |
| `/api/admin/email-templates/[id]/preview/route.ts` | GET | Preview email | `marketing.campaigns` |
| `/api/admin/cms/seo/cities/route.ts` | GET, POST | SEO cities | `cms.seo.manage` |
| `/api/admin/current-ip/route.ts` | GET | Returns IP (debug) | Low risk, acceptable |

---

## 3. Admin Pages Without Permission Checks (54 pages)

### Settings Pages (16 — all unprotected)

| Page | Recommended Permission |
|------|----------------------|
| `/admin/settings/page.tsx` | Hub page — acceptable (links gate themselves) |
| `/admin/settings/business-profile/page.tsx` | `settings.business_hours` |
| `/admin/settings/pos-security/page.tsx` | `settings.manage_users` |
| `/admin/settings/pos-favorites/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/pos-settings/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/data-management/page.tsx` | `settings.backup_export` |
| `/admin/settings/shipping/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/receipt-printer/page.tsx` | `settings.tax_payment` |
| `/admin/settings/enrichment/page.tsx` | `products.edit` |
| `/admin/settings/mobile-zones/page.tsx` | `settings.business_hours` |
| `/admin/settings/messaging/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/messaging/sms-templates/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/notifications/page.tsx` | `settings.feature_toggles` |
| `/admin/settings/card-reader/page.tsx` | `settings.tax_payment` |
| `/admin/settings/coupon-enforcement/page.tsx` | `marketing.coupons` |
| `/admin/settings/reviews/page.tsx` | `settings.feature_toggles` |

### Website/CMS Pages (19 — all unprotected)

| Page | Recommended Permission |
|------|----------------------|
| `/admin/website/page.tsx` | Hub page — acceptable |
| `/admin/website/homepage/page.tsx` | `cms.hero.manage` |
| `/admin/website/pages/page.tsx` | `cms.pages.manage` |
| `/admin/website/pages/new/page.tsx` | `cms.pages.manage` |
| `/admin/website/pages/[id]/page.tsx` | `cms.pages.manage` |
| `/admin/website/team/page.tsx` | `cms.about.manage` |
| `/admin/website/credentials/page.tsx` | `cms.about.manage` |
| `/admin/website/global-blocks/page.tsx` | `cms.pages.manage` |
| `/admin/website/hero/page.tsx` | `cms.hero.manage` |
| `/admin/website/hero/[id]/page.tsx` | `cms.hero.manage` |
| `/admin/website/seo/page.tsx` | `cms.seo.manage` |
| `/admin/website/seo/cities/page.tsx` | `cms.seo.manage` |
| `/admin/website/navigation/page.tsx` | `cms.pages.manage` |
| `/admin/website/footer/page.tsx` | `cms.pages.manage` |
| `/admin/website/tickers/page.tsx` | `cms.tickers.manage` |
| `/admin/website/tickers/[id]/page.tsx` | `cms.tickers.manage` |
| `/admin/website/ads/page.tsx` | `cms.ads.manage` |
| `/admin/website/catalog/page.tsx` | `cms.catalog_display.manage` |
| `/admin/website/theme-settings/page.tsx` | `cms.themes.manage` |
| `/admin/website/themes/page.tsx` | `cms.themes.manage` |
| `/admin/website/themes/[id]/page.tsx` | `cms.themes.manage` |

### Jobs, Quotes, Orders (6 pages)

| Page | Recommended Permission |
|------|----------------------|
| `/admin/jobs/page.tsx` | `pos.jobs.view` |
| `/admin/jobs/[id]/page.tsx` | `pos.jobs.view` |
| `/admin/quotes/page.tsx` | `quotes.create` |
| `/admin/quotes/[id]/page.tsx` | `quotes.create` |
| `/admin/orders/page.tsx` | `orders.view` |
| `/admin/orders/[id]/page.tsx` | `orders.view` |

### Staff Management (3 pages)

| Page | Recommended Permission |
|------|----------------------|
| `/admin/staff/[id]/page.tsx` | `settings.manage_users` |
| `/admin/staff/new/page.tsx` | `settings.manage_users` |
| `/admin/staff/roles/page.tsx` | `settings.roles_permissions` |

### Other (10 pages)

| Page | Recommended Permission |
|------|----------------------|
| `/admin/customers/new/page.tsx` | `customers.create` |
| `/admin/catalog/categories/page.tsx` | `services.edit` |
| `/admin/catalog/products/enrichment-review/page.tsx` | `products.edit` |
| `/admin/inventory/page.tsx` | Hub — acceptable |
| `/admin/marketing/page.tsx` | Hub — acceptable |
| `/admin/marketing/compliance/page.tsx` | `marketing.campaigns` |
| `/admin/marketing/email-templates/page.tsx` | `marketing.campaigns` |
| `/admin/marketing/email-templates/[id]/page.tsx` | `marketing.campaigns` |
| `/admin/appointments/waitlist/page.tsx` | `appointments.view_today` |
| `/admin/migration/page.tsx` | `settings.backup_export` |

---

## 4. POS Pages (8 — all unprotected)

POS uses PIN-based authentication, not role permissions. The POS permission context (`pos-permission-context.tsx`) resolves permissions per-session but individual pages don't gate rendering. This is by design — CLAUDE.md states "POS access = PIN presence. Set PIN → POS access. Clear PIN → no access."

POS API routes use HMAC authentication (`authenticatePosRequest()`) which is a separate security model from admin permissions. These are NOT gaps.

---

## 5. Legitimate Super-Admin Bypasses (Correct — Do Not Modify)

| File | Purpose |
|------|---------|
| `src/lib/auth/check-permission.ts` | Central permission resolver — super_admin always returns true |
| `src/lib/auth/permissions.ts` | Client-side `hasPermission()` — super_admin bypass |
| `src/app/api/admin/staff/roles/route.ts` | Role CRUD restricted to super_admin only |
| `src/app/api/admin/staff/roles/[id]/route.ts` | Role CRUD restricted to super_admin only |
| `src/app/api/admin/staff/roles/[id]/reset/route.ts` | Role reset restricted to super_admin only |

---

## 6. Existing Permission Definitions (104 keys, all seeded)

All 104 permission keys have:
- Rows in `permission_definitions` table (via migrations)
- Role defaults in `permissions` table for all 4 system roles
- No missing definitions found

Categories: POS Operations (14), Customer Management (9), Appointments (9), Catalog (8), Inventory (7), Marketing (5), Quotes (3), Photos (6), Reports (8), Staff (4), Settings (8), Website/CMS (8), Online Store (2), POS Jobs (4), Misc (9)

---

## 7. Recommendations (Priority Order)

### Phase 1 — Critical (Sensitive write operations)
1. Add `requirePermission` to business settings PATCH endpoint
2. Add `requirePermission` to Stripe reader/location endpoints
3. Add `requirePermission` to upload/content-image endpoints
4. Add `requirePermission` to staff/[id]/permissions GET endpoint

### Phase 2 — High (CMS + SMS template routes)
5. Add `requirePermission` to all SMS template endpoints
6. Add `requirePermission` to homepage-settings, SEO cities
7. Add `requirePermission` to vehicle-makes/categories CRUD
8. Add `usePermission` gating to Website/CMS admin pages (19 pages)

### Phase 3 — Medium (View-only routes + remaining pages)
9. Add `usePermission` gating to Settings admin pages (16 pages)
10. Add `usePermission` gating to Jobs/Quotes/Orders pages (6 pages)
11. Add `usePermission` gating to Staff new/edit/roles pages (3 pages)
12. Migrate notification-recipients and customer-search from hardcoded role checks to permission system

### Phase 4 — Low (Read-only, hub pages)
13. Add permission checks to remaining hub/index pages
14. Review global-search access level (currently any employee — acceptable for now)

---

## 8. No New Permission Definitions Needed

All recommended permission checks map to EXISTING permission keys (104 already defined). The gaps are in **enforcement** (missing `requirePermission`/`usePermission` calls), not in **definitions**.
