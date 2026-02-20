# Navigation, Footer & Menu System — Complete Audit Report

## Part 1: Database Schema

### 1A: Navigation/Menu/Footer Tables

**Two tables exist**, created in migration `20260216000001_page_navigation_management.sql`:

#### Table: `website_pages`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID PK | NO | `gen_random_uuid()` |
| `title` | TEXT | NO | — |
| `slug` | TEXT (UNIQUE) | NO | — |
| `page_template` | TEXT | NO | `'content'` (CHECK: content/landing/blank) |
| `parent_id` | UUID FK→website_pages.id | YES | — (ON DELETE SET NULL) |
| `content` | TEXT | YES | `''` |
| `is_published` | BOOLEAN | NO | `false` |
| `show_in_nav` | BOOLEAN | NO | `false` |
| `sort_order` | INTEGER | NO | `0` |
| `meta_title` | TEXT | YES | — |
| `meta_description` | TEXT | YES | — |
| `og_image_url` | TEXT | YES | — |
| `created_at` | TIMESTAMPTZ | NO | `now()` |
| `updated_at` | TIMESTAMPTZ | NO | `now()` |

**RLS**: Public reads published pages. Authenticated can do anything.

#### Table: `website_navigation`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID PK | NO | `gen_random_uuid()` |
| `placement` | TEXT | NO | — (CHECK: header/footer_quick_links/footer_services) |
| `label` | TEXT | NO | — |
| `url` | TEXT | NO | `'#'` |
| `page_id` | UUID FK→website_pages.id | YES | — (ON DELETE CASCADE) |
| `parent_id` | UUID FK→website_navigation.id | YES | — (ON DELETE CASCADE) |
| `target` | TEXT | NO | `'_self'` (CHECK: _self/_blank) |
| `icon` | TEXT | YES | — |
| `is_active` | BOOLEAN | NO | `true` |
| `sort_order` | INTEGER | NO | `0` |
| `created_at` | TIMESTAMPTZ | NO | `now()` |

**RLS**: Public reads active items. Authenticated can do anything.

**Seed Data**:
- 3 header items: Services, Products, Gallery
- 6 footer_quick_links items: All Services, Shop Products, Our Work, Book Appointment, Customer Login, My Account

**Note**: `footer_services` placement is defined in the CHECK constraint and the TypeScript `NavPlacement` type but **no seed data** and **no admin UI** for it. It's unused.

### 1B: Page/Content Tables
The `website_pages` table IS the CMS page table. Pages have slugs, support nesting via `parent_id`, are rendered at `/p/{slug}`. However, **no `/p/[slug]` route file exists** — the Glob returned no results for `src/app/(public)/p/**/page.tsx`. The sitemap does reference `getPublishedPages()` though.

---

## Part 2: Admin Navigation Management

### 2A: Admin Pages Found

| File | Purpose |
|------|---------|
| `src/app/admin/website/page.tsx` | Website hub — cards linking to all sub-pages including "Pages" and "Navigation" |
| `src/app/admin/website/navigation/page.tsx` | **Navigation manager** — CRUD + reorder for nav items |
| `src/app/admin/website/pages/page.tsx` | **Pages list** — table with publish/nav toggles |
| `src/app/admin/website/pages/new/page.tsx` | **Create page** — full form |
| `src/app/admin/website/pages/[id]/page.tsx` | **Edit page** — full form + content blocks |

### 2B: Navigation Admin Page (navigation/page.tsx)

**What it lets admin configure:**
- Add, edit, delete, reorder navigation links
- Toggle active/inactive per link
- Switch between `header` and `footer_quick_links` placements via tabs
- Add links as: Custom URL, Existing Page, or Built-in Route
- Nest items under a parent (1-level deep)
- Set target (_self or _blank)

**DB Table**: `website_navigation` (via API routes)

**UI**: Flat list with drag-and-drop reorder (native HTML5 drag), inline edit for label/url, active toggle switch, delete button. Each row shows: grip handle, label, url, external link icon (if _blank), active switch, edit pencil, delete trash.

**Drag-and-drop**: YES — implemented with `handleDragStart`/`handleDragOver`/`handleDrop` using HTML5 DnD API. Persists via `/api/admin/cms/navigation/reorder` endpoint.

### 2C: Footer Quick Links

**What admin currently controls**:
- The `footer_quick_links` placement tab in `/admin/website/navigation` lets the admin **add, remove, reorder, edit, and toggle** footer links
- Links are stored in `website_navigation` table with `placement = 'footer_quick_links'`
- **No column title field** — the column title "Quick Links" is **hardcoded** in `site-footer.tsx:47`
- **No column count control** — the footer renders exactly 2 columns: "Quick Links" (from DB nav items) and "Contact" (hardcoded)
- **No non-link content** can be added (no HTML/text blocks, only link items)

### 2D: Header Navigation Admin

Same page (`/admin/website/navigation`) — the `header` tab. Full CRUD + reorder + nesting (1 level). The header nav data flows from DB → layout → `SiteHeader` → `HeaderClient` which renders desktop nav + mobile menu with dropdown support.

---

## Part 3: Frontend Footer

### 3A-B: Footer Components

**Server component**: `src/components/public/site-footer.tsx` (async server component)
**Client component**: `src/components/public/footer-client.tsx`

**Column structure**: **2 nav columns, hardcoded**:
1. **"Quick Links"** — from DB nav items or default fallback (6 links)
2. **"Contact"** — hardcoded: "Book Appointment" (/book) + "Get a Quote" (/book)

Column count is **hardcoded** (grid with `grid-cols-2 sm:grid-cols-3`). The third column in the CSS grid would only appear if more `navColumns` were added, but only 2 are ever passed.

**Additional footer sections** (all hardcoded in `footer-client.tsx`):
- **Trust badges strip**: 4 badges (Fully Insured, IDA Certified, Eco-Friendly, 100% Satisfaction) — hardcoded
- **Brand column** (lg:col-span-4): Logo, tagline ("Professional auto detailing..."), phone, email, address, Google/Yelp review badges
- **Service Areas**: Dynamic city links from DB
- **Bottom bar**: Copyright, Terms & Conditions link, Unsubscribe link — **hardcoded**

### 3C: Data Flow

```
(public)/layout.tsx
  ├─ getNavigationItems('footer_quick_links')  →  website_navigation table (cached 60s, tag: cms-navigation)
  └─ passes `footerNav` to <SiteFooter navItems={footerNav} />
       └─ site-footer.tsx (server component)
            ├─ getBusinessInfo()  →  business_settings table
            ├─ getReviewData()   →  business_settings table
            ├─ getActiveCities() →  city_landing_pages table
            ├─ Builds navColumns array (Quick Links from DB, Contact hardcoded)
            └─ <FooterClient {...props} />  →  Renders everything
```

**IMPORTANT**: Only `(public)/layout.tsx` passes nav items. The `(customer-auth)/layout.tsx` and `(account)/layout.tsx` do **NOT** pass `navItems` props to `<SiteFooter />`, so those layouts always use the **hardcoded defaults**.

### 3D: Responsive Behavior

Mobile: Footer uses `grid-cols-1 lg:grid-cols-12`. On mobile, brand column and nav columns stack vertically. Nav columns use `grid-cols-2 sm:grid-cols-3`. No accordion or collapse — just stacking.

---

## Part 4: Frontend Header Navigation

### 4A-B: Header Components

**Server component**: `src/components/public/site-header.tsx`
**Client component**: `src/components/public/header-client.tsx`
**Shell wrapper**: `src/components/public/header-shell.tsx` (scroll state only, appears unused by current header-client)
**Mobile menu**: `src/components/public/mobile-menu.tsx` (standalone full-screen overlay, has its own hardcoded defaults)

**Data structure** (`WebsiteNavItem`):
```typescript
interface WebsiteNavItem {
  id: string;
  placement: NavPlacement;
  label: string;
  url: string;
  page_id: string | null;
  parent_id: string | null;
  target: '_self' | '_blank';
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  children?: WebsiteNavItem[];  // Runtime: built by buildNavTree()
}
```

**Dropdown support**: YES — `header-client.tsx` renders dropdowns for items with `children.length > 0`. Desktop uses hover, animated with framer-motion. Mobile renders children as indented sub-items.

**Nesting depth**: 1 level only (parent → children). The `buildNavTree()` function in `website-pages.ts` supports any depth, but the admin UI only allows selecting top-level items as parents, and the header rendering only goes 1 level deep.

### 4C: Nav Data Flow

```
(public)/layout.tsx
  ├─ getNavigationItems('header')  →  website_navigation table (cached 60s)
  └─ <SiteHeader navItems={headerNav} />
       └─ site-header.tsx (server component)
            ├─ Falls back to 3 hardcoded items if navItems empty
            ├─ Checks auth + customer name
            └─ <HeaderClient navItems={links} businessName phone logoUrl customerName />
                 ├─ Desktop nav with dropdowns
                 └─ Mobile menu (inline, not using mobile-menu.tsx)
```

**IMPORTANT**: `header-client.tsx` has its own inline mobile menu. The standalone `mobile-menu.tsx` component exists separately with its own hardcoded defaults but appears to not be used by the current header — it's likely a legacy/alternate component.

### 4D: Nav Item Type

Defined at `src/lib/supabase/types.ts:1275-1289` (shown above).

---

## Part 5: CMS Pages System

**Storage**: `website_pages` table
**Slugs**: Yes, unique. URL pattern: `/p/{slug}`
**Nesting**: Yes via `parent_id`. Child slugs auto-prefixed: `parent-slug/child-slug`
**Nav linkable**: Yes — `show_in_nav` toggle auto-creates/deletes a `website_navigation` entry (hardcoded to `header` placement, `sort_order: 99`)
**Rendering route**: **MISSING** — no `src/app/(public)/p/[slug]/page.tsx` found. Pages are in the DB and sitemap but may not render.

---

## Part 6: Summary Report

### 6A: Current Architecture Diagram

```
[Admin Website > Navigation]  →  saves to  →  [DB: website_navigation]
                                                    ↓
                                              fetched by getNavigationItems()
                                              (cached 60s, tag: cms-navigation)
                                                    ↓
                                              [(public)/layout.tsx]
                                                    ↓
                              ┌──────────────────────┴──────────────────────┐
                              ↓                                             ↓
                    [SiteHeader navItems={headerNav}]          [SiteFooter navItems={footerNav}]
                              ↓                                             ↓
                    [HeaderClient]                              [FooterClient]
                    (desktop nav + mobile menu)                 (2 hardcoded columns)

[Admin Website > Pages]  →  saves to  →  [DB: website_pages]
                                         show_in_nav toggle auto-creates/deletes
                                         website_navigation entries (header only)
```

### 6B: Current Capabilities

| Capability | Status | Details |
|-----------|--------|---------|
| Admin add/remove header nav items | **YES** | Via /admin/website/navigation, header tab |
| Admin reorder header nav items | **YES** | Drag-and-drop with persist |
| Admin nest header nav items (dropdowns) | **YES** | 1 level deep, parent selector in add dialog |
| Admin add/remove footer links | **YES** | Via /admin/website/navigation, footer_quick_links tab |
| Admin reorder footer links | **YES** | Same drag-and-drop |
| Admin change footer column count | **NO** | Hardcoded to 2 columns |
| Admin add footer column titles | **NO** | "Quick Links" and "Contact" are hardcoded |
| Admin add non-link content to footer (HTML/text) | **NO** | Only link items supported |
| Admin assign menus to locations (WordPress-style) | **PARTIAL** | Placement field exists (header/footer_quick_links/footer_services) but no true "menu → location" assignment |
| Drag-and-drop in admin | **YES** | HTML5 native DnD for nav items |
| Header and footer nav managed separately or together | **TOGETHER** | Same page with tab switching |

### 6C: Database Tables Involved

**Existing tables that need modification:**
| Table | What changes |
|-------|-------------|
| `website_navigation` | May need additional placements, menu_id FK, or column_title |
| `website_pages` | Could add `show_in_footer` or similar if column-level control needed |

**Tables that could be created (WordPress-style):**
| Potential Table | Purpose |
|----------------|---------|
| `menus` | Named menus ("Main Menu", "Footer Col 1", "Footer Col 2") |
| `menu_locations` | Location assignments ("header" → menu_id, "footer_col_1" → menu_id) |
| `footer_columns` | Column config (title, sort_order, content_type, menu_id) |

**Tables that exist but could be replaced:**
- None — the current `website_navigation` table works well, just needs extension

### 6D: Components Involved

**Admin pages (modify):**
- `src/app/admin/website/navigation/page.tsx` — add footer column management
- `src/app/admin/website/page.tsx` — possibly add "Footer" card

**Admin pages (create):**
- Possibly `src/app/admin/website/footer/page.tsx` for dedicated footer editor

**Frontend components (modify):**
- `src/components/public/site-footer.tsx` — make columns dynamic from DB
- `src/components/public/footer-client.tsx` — accept dynamic column count/titles
- `src/components/public/header-client.tsx` — minimal changes if header nav stays same
- `src/components/public/mobile-menu.tsx` — update or remove (appears unused)

**Layout files (modify):**
- `src/app/(public)/layout.tsx` — may need to fetch additional footer column data
- `src/app/(customer-auth)/layout.tsx` — needs to pass navItems (currently doesn't)
- `src/app/(account)/layout.tsx` — needs to pass navItems (currently doesn't)

**API routes (modify):**
- `src/app/api/admin/cms/navigation/route.ts` — if schema changes
- `src/app/api/admin/cms/navigation/[id]/route.ts` — if schema changes
- `src/app/api/admin/cms/navigation/reorder/route.ts` — if schema changes

**Type definitions (modify):**
- `src/lib/supabase/types.ts` — `NavPlacement`, `WebsiteNavItem`, new footer column types

**Data layer (modify):**
- `src/lib/data/website-pages.ts` — add footer column data fetching

### 6E: Risks & Concerns

**What breaks if we change the nav data structure:**
- All 3 layouts reference `SiteHeader` and `SiteFooter` — but only `(public)/layout.tsx` passes navItems
- The fallback defaults in `site-header.tsx:35-42`, `site-footer.tsx:12-18`, and `mobile-menu.tsx:13-17` act as safety nets
- The `buildNavTree()` function would need updating if nesting model changes
- Cache tag `cms-navigation` with 60s revalidation — changes take up to 60s to appear

**SEO implications:**
- Sitemap already includes published `website_pages` via `getPublishedPages()`
- No JSON-LD structured data for nav (SiteNavigationElement) currently exists
- Footer city links are important for local SEO — must not lose those

**Hardcoded links that bypass the nav system:**
- `header-client.tsx:150,164,233,243` — "Sign In"/"Hi, {name}" and "Book Now" are always hardcoded in the header
- `footer-client.tsx:51-52` — "Contact" column with "Book Appointment" and "Get a Quote" hardcoded
- `footer-client.tsx:196-206` — Bottom bar "Terms & Conditions" and "Unsubscribe" hardcoded
- `footer-client.tsx:34-38` — Trust badges hardcoded
- `footer-client.tsx:91-93` — Tagline paragraph hardcoded
- `mobile-menu.tsx:89,96` — "Sign In" and "Book Now" hardcoded
- `cta-section.tsx:34` — "/book" hardcoded
- `hero-section.tsx:47` — "/book" hardcoded
- Various product/service cards link to their dynamic routes

**Performance:**
- Public layout makes **2 navigation queries** per page (header + footer_quick_links), both cached 60s via `unstable_cache`
- Footer additionally makes 3 more queries: `getBusinessInfo()`, `getReviewData()`, `getActiveCities()`
- Total: **5 DB queries** per uncached page load related to header+footer (all behind `createAdminClient()` to bypass RLS)

**Missing CMS page route:**
- No `src/app/(public)/p/[slug]/page.tsx` was found. Pages can be created in admin and appear in the sitemap, but **may not have a rendering route**. This should be verified.
