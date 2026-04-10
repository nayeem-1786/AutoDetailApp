# Admin Page Search, Filter & Sort Audit

> **Date:** 2026-04-10
> **Scope:** Every admin list page in `src/app/admin/`

---

## 1. Full Capabilities Matrix

### Data-Heavy List Pages (primary CRUD pages)

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Customers | `/admin/customers` | 100+ | ✅ name/phone/email | ✅ 5 (type, visits, activity, tags, archived) | ✅ 3 (name, last visit, spend) | ✅ DataTable | ✅ bulk tag | ❌ | DataTable |
| Products | `/admin/catalog/products` | 200+ | ✅ name/SKU | ✅ 5 (category, vendor, stock, active, images) | ❌ | ✅ DataTable | ❌ | ❌ | DataTable |
| Services | `/admin/catalog/services` | 20-50 | ✅ name/desc | ✅ 3 (category, classification, pricing model) | ❌ | ✅ DataTable | ❌ | ❌ | DataTable |
| Jobs | `/admin/jobs` | 500+ | ✅ debounced | ✅ 4 (status, staff, date from/to) | ✅ 3 cols (date, duration, status) | ✅ manual | ❌ | ❌ | HTML table |
| Transactions | `/admin/transactions` | 1000+ | ✅ debounced | ✅ 3 (status, date presets) | ❌ | ✅ manual | ❌ | ✅ CSV | Custom table |
| Quotes | `/admin/quotes` | 100+ | ✅ debounced | ✅ 3 (status, date from/to) | ❌ | ✅ manual | ❌ | ❌ | Custom table |
| Orders | `/admin/orders` | 100+ | ✅ | ✅ 4 (payment, fulfillment, date presets) | ❌ | ✅ manual | ❌ | ❌ | Custom table |
| Appointments | `/admin/appointments` | varies | ✅ customer/phone | ✅ 2 (status, employee) | ❌ | Calendar-based | ❌ | ❌ | Calendar + list |
| Staff | `/admin/staff` | 5-20 | ✅ name/email | ✅ 2 (role, status) | ❌ | ✅ DataTable | ❌ | ❌ | DataTable |
| Photos | `/admin/photos` | 500+ | ✅ debounced | ✅ 7+ (phase, zone, staff, dates, featured, tags, customer) | ❌ | ✅ manual | ✅ bulk tag | ❌ | Grid |

### Marketing & Campaigns

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Coupons | `/admin/marketing/coupons` | 20-50 | ✅ code/name | ✅ 1 (status) | ❌ | ✅ DataTable | ✅ inline toggle/delete | ❌ | DataTable |
| Campaigns | `/admin/marketing/campaigns` | 10-30 | ❌ | ✅ 2 (status, channel) | ❌ | ✅ DataTable | ❌ | ❌ | DataTable |
| Automations | `/admin/marketing/automations` | 5-15 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| Email Templates | `/admin/marketing/email-templates` | 10-20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card grid |

### Messaging & Conversations

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Messaging | `/admin/messaging` | 50+ | ✅ debounced | ✅ 1 (status) | ❌ | Infinite scroll | ❌ | ❌ | Conversation list |
| SMS Templates | `/admin/settings/messaging/sms-templates` | 16 | ❌ | ❌ (tabs by category) | ❌ | ❌ | ❌ | ❌ | Tabbed list |

### Inventory

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Vendors | `/admin/inventory/vendors` | 20-50 | ✅ name | ✅ 1 (active) | ❌ | ✅ DataTable | ❌ | ❌ | DataTable |
| Stock History | `/admin/inventory/stock-history` | 100+ | ❌ | ✅ 1 (type) | ❌ | ✅ manual | ❌ | ❌ | Custom table |
| Purchase Orders | `/admin/inventory/purchase-orders` | 20-50 | ❌ | ✅ 1 (status) | ❌ | ❌ | ❌ | ❌ | Custom table |

### Website / CMS

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Pages | `/admin/website/pages` | 10-30 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| SEO | `/admin/website/seo` | 20-40 | ❌ | ❌ | ❌ | ❌ | ✅ bulk AI generate | ❌ | Custom list |
| Navigation | `/admin/website/navigation` | 5-15 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Drag-drop list |
| Tickers | `/admin/website/tickers` | 3-10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| Global Blocks | `/admin/website/global-blocks` | 3-10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| Catalog (CMS) | `/admin/website/catalog` | 20-50 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Tabbed table |
| Team | `/admin/website/team` | 3-10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card grid |
| Credentials | `/admin/website/credentials` | 3-10 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| Cities (SEO) | `/admin/website/seo/cities` | 10-30 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Table |

### Settings & Admin

| Page | Path | ~Items | Search | Filters | Sort | Pagination | Bulk | Export | UI Pattern |
|------|------|--------|--------|---------|------|------------|------|--------|------------|
| Audit Log | `/admin/settings/audit-log` | 1000+ | ✅ debounced | ✅ (action, employee, date range) | ❌ | ✅ manual | ❌ | ✅ CSV | Custom table |
| Categories | `/admin/catalog/categories` | 10-30 | ❌ | ❌ (tabs: product/service/vehicle) | ❌ | ✅ DataTable | ❌ | ❌ | Tabbed DataTable |
| Roles | `/admin/staff/roles` | 3-8 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Card list |
| Feature Toggles | `/admin/settings/feature-toggles` | 10-20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Toggle list |
| Duplicates | `/admin/customers/duplicates` | varies | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Custom list |
| Waitlist | `/admin/appointments/waitlist` | 5-20 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Custom list |

---

## 2. Existing Reusable Components

### DataTable (`src/components/ui/data-table.tsx`)
- **Foundation:** TanStack React Table
- **Built-in:** sorting, pagination (20/page default), row selection, empty state
- **Used by:** Customers, Services, Products, Staff, Coupons, Campaigns, Categories, Vendors
- **Strengths:** Consistent, handles sorting/pagination automatically
- **Gaps:** No search integration, no filter toolbar, no export, no column visibility toggle

### SearchInput (`src/components/ui/search-input.tsx`)
- Clear button, icon, enter callback
- Used by most pages independently alongside DataTable

### Pagination (`src/components/ui/pagination.tsx`)
- Smart ellipsis, prev/next
- Used by pages with manual pagination (Jobs, Quotes, Orders, Transactions)

### Key observation: No unified toolbar component
Every page implements its own search + filter bar as inline JSX. The patterns are similar but duplicated across ~15 pages.

---

## 3. Best Existing Implementations (reference for universal component)

| Rank | Page | File | Why |
|------|------|------|-----|
| 1 | Customers | `src/app/admin/customers/page.tsx` | Gold standard: 5 filters, bulk tag, stats cards, AND-logic tag filter |
| 2 | Transactions | `src/app/admin/transactions/page.tsx` | Best search (multi-field + related table), date presets, CSV export |
| 3 | Jobs | `src/app/admin/jobs/page.tsx` | Only page with clickable sortable column headers + direction arrows |
| 4 | Products | `src/app/admin/catalog/products/page.tsx` | Permission-aware columns, inline stock adjustment, 5 filters |
| 5 | Photos | `src/app/admin/photos/page.tsx` | 7+ filters, selection mode, bulk tag, gallery preview |
| 6 | Audit Log | `src/app/admin/settings/audit-log/page.tsx` | Search, filters, date range, CSV export, high-volume data |

---

## 4. Recommendations Per Page (Priority Order)

### HIGH PRIORITY (frequently used, many items, significant UX improvement)

| Page | Needs | Specific Filters to Add | Specific Sorts to Add |
|------|-------|------------------------|----------------------|
| **Products** | Sort | — | Name, price, stock qty, created date, last sold |
| **Transactions** | Sort | — | Date, amount, customer name |
| **Jobs** | — (already good) | — | — |
| **Customers** | Export CSV | — | — (sort already exists) |
| **Orders** | Sort, export | — | Date, amount, status |
| **Quotes** | Sort | — | Date, amount, days open, status |

### MEDIUM PRIORITY (moderate usage, would benefit from improvements)

| Page | Needs | Specific Filters to Add | Specific Sorts to Add |
|------|-------|------------------------|----------------------|
| **Appointments** | Sort (within day view) | Service type, date range | Time, customer name |
| **Campaigns** | Search | — | Name, date, status |
| **Stock History** | Search, date range filter | Product name search, date range | Date, product, qty |
| **Purchase Orders** | Search | Vendor filter, date range | Date, vendor, total |
| **Audit Log** | Sort | — | Date (already default), action |

### LOW PRIORITY (small item counts, rarely need search/filter)

| Page | Needs | Notes |
|------|-------|-------|
| Automations | Search (if list grows) | Only 5-15 items |
| Email Templates | Search (if list grows) | Only 10-20 items |
| Categories | Search (if many categories) | Tabs already group well |
| Website Pages | Search (if many pages) | Only 10-30 items |
| Cities (SEO) | Search | Only 10-30 items |
| Vendors | Sort | Name, product count |

---

## 5. Universal Component Feature Specification

### CORE (every adopting page gets these)

1. **Text search** — debounced input (300ms), searches as you type, clear button
2. **Column sorting** — clickable headers, asc/desc toggle, visual arrow indicator
3. **Filter dropdowns** — configurable per-page (category, status, active/inactive, etc.)
4. **Pagination** — page size selector (10/25/50/100), "Showing 1-25 of 342" display
5. **Result count** — always visible, updates on filter/search

### HIGH VALUE (include in initial build)

6. **Bulk actions bar** — select rows → configurable actions (activate, deactivate, delete, export)
7. **Quick filter chips** — preset filters as clickable badges ("Active Only", "On Sale", "Out of Stock")
8. **Column visibility toggle** — dropdown to show/hide columns
9. **URL state sync** — filters, sort, page, search persist in URL query params

### NICE-TO-HAVE (build after core is stable)

10. **Saved views** — save filter/sort/column combo as named preset (per-user, stored in localStorage or DB)
11. **Export CSV** — export current filtered/sorted view
12. **Inline editing** — click cell to edit (toggle active, change display order)
13. **Date range filter** — calendar picker for date columns
14. **Keyboard navigation** — arrow keys between rows, Enter to open, Escape to deselect

---

## 6. Technical Architecture Recommendation

### Approach: Enhance existing DataTable + new `TableToolbar` component

**Why not TanStack Table from scratch:** DataTable already uses TanStack React Table. Replacing it would break 8+ pages. Instead, enhance what exists.

**Architecture:**

```
┌─────────────────────────────────────────┐
│ TableToolbar (new component)            │
│ ┌─────────┐ ┌────────┐ ┌─────────────┐ │
│ │ Search  │ │Filters │ │ Quick chips │ │
│ └─────────┘ └────────┘ └─────────────┘ │
│ ┌──────────────┐ ┌───────────────────┐  │
│ │ Bulk actions │ │ Column visibility │  │
│ └──────────────┘ └───────────────────┘  │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ DataTable (enhanced)                    │
│ - Sortable column headers (click)      │
│ - Row selection checkboxes             │
│ - Pagination with page size selector   │
│ - Result count display                 │
│ - URL state sync                       │
└─────────────────────────────────────────┘
```

**New files:**
- `src/components/admin/table-toolbar.tsx` — search + filters + chips + bulk actions + column toggle
- `src/lib/hooks/useTableState.ts` — URL state sync for search/filter/sort/page

**Client-side vs server-side filtering:**
- Pages with <500 items: client-side filtering (current pattern for Customers, Services, Products)
- Pages with 500+ items: server-side filtering via Supabase query params (current pattern for Jobs, Transactions, Quotes, Orders)
- The hook should support both modes

### Migration Path
1. Build `TableToolbar` + `useTableState` as standalone components
2. Migrate one DataTable page first (Products — good complexity, high impact)
3. Migrate remaining DataTable pages (Services, Staff, Coupons, Campaigns, Categories, Vendors)
4. Migrate manual-table pages (Jobs, Transactions, Quotes, Orders) — these need more work since they don't use DataTable

### Rollout Order (highest impact first)

| Order | Page | Why First |
|-------|------|-----------|
| 1 | Products | 200+ items, no sort, 5 existing filters to integrate, high daily usage |
| 2 | Customers | Gold standard already — add export CSV, test column visibility |
| 3 | Transactions | 1000+ items, already has export — add sort, test with large datasets |
| 4 | Jobs | Already has sort — integrate into unified pattern, add column visibility |
| 5 | Orders | Medium item count, good test of date range filters |
| 6 | Quotes | Similar to Orders, validates date filter reusability |
| 7 | Services | Small list, good for validating the simplest adoption path |
| 8 | Staff | Smallest list, validates minimal config |
| 9 | Campaigns | Add search, test with low-item-count DataTable page |
| 10 | Remaining pages | Audit Log, Stock History, Purchase Orders, etc. |

---

## 7. Summary Statistics

- **Total admin list pages audited:** 32
- **Pages with search:** 14 (44%)
- **Pages with filters:** 16 (50%)
- **Pages with sort:** 2 (6%) ← biggest gap
- **Pages with pagination:** 17 (53%)
- **Pages with bulk actions:** 3 (9%)
- **Pages with export:** 2 (6%)
- **Pages using DataTable:** 8 (25%)
- **Pages with manual tables:** 8 (25%)
- **Pages with other UI (cards, grids, lists):** 16 (50%)
