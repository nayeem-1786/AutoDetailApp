# Smart Details Auto Spa — Website System Manual

## How the System Is Built & How to Use It

This document explains every component of the Smart Details Auto Spa website redesign system. It covers the architecture, data flow, admin controls, and how each piece connects to produce a premium auto detailing website with a full CMS, SEO engine, and content management system.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Phase 1 — Visual Redesign (Waves 1-6)](#3-phase-1--visual-redesign)
4. [Phase 2 — CMS Infrastructure (Wave 7)](#4-phase-2--cms-infrastructure)
5. [Phase 3 — CMS Features (Waves 8-12)](#5-phase-3--cms-features)
6. [Phase 4 — SEO Engine (Wave 13)](#6-phase-4--seo-engine)
7. [Phase 5 — Terms & Conditions (Wave 14)](#7-phase-5--terms--conditions)
8. [Database Schema Reference](#8-database-schema-reference)
9. [API Routes Reference](#9-api-routes-reference)
10. [Permission System](#10-permission-system)
11. [Execution Order & Session Plan](#11-execution-order--session-plan)
12. [Verification Checklist](#12-verification-checklist)

---

## 1. Architecture Overview

The system is a **Next.js 16 application** with TypeScript, Tailwind CSS, and Supabase as the backend. It has two distinct areas:

- **Public site** — Customer-facing pages served at `smartdetailsautospa.com` under the `(public)` route group. These are statically generated server components optimized for SEO.
- **Admin panel** — Staff-facing CMS at `/admin` with role-based permissions. Uses Supabase Auth with a 76-key (expanding to 83-key) permission system.

### Content Source Architecture (Single Source of Truth)

Every piece of data on the public site comes from exactly one place:

| Data Type | Source | Admin Location |
|-----------|--------|----------------|
| Business info (name, phone, address, email, logo) | `business_settings` table | Admin > Settings > Business Profile + Receipt Printer |
| Google review data (rating, count, review text) | `business_settings` (cached from Google Places API) | Admin > Settings > Reviews (manual refresh or daily cron) |
| Yelp review data (rating, count) | `business_settings` (manually entered) | Admin > Settings > Reviews |
| Hero slides, tickers, ads, themes | Dedicated CMS tables (`hero_slides`, `announcement_tickers`, etc.) | Admin > Website > [feature] |
| Team bios, credentials, about text | `business_settings` JSON keys | Admin > Website > About & Team |
| Service/product catalog | `services` / `products` tables | Admin > Services / Products (existing) |
| Service/product website visibility | `show_on_website`, `is_featured` columns | Admin > Website > Catalog Display |
| Featured photos (before/after) | `job_photos` table with `is_featured` flag | Admin > Jobs > Photos tab or Admin > Photos |
| Per-page SEO overrides | `page_seo` table | Admin > Website > SEO |
| City landing pages | `city_landing_pages` table | Admin > Website > SEO > Cities |
| Terms & Conditions | `business_settings` JSON key | Admin > Website > Terms |

### Data Flow Diagram

```
[Supabase DB] → [Server Components / Data Layer] → [Public Pages]
                     ↑                                    ↑
              [Admin Panel]                       [Client Components]
              (writes data)                    (interactive features only)
```

### Three Supabase Client Types

1. **Browser Client** (`createBrowserClient()`) — Used in client components for real-time features
2. **Server Client** (`createClient()`) — Used in server components/API routes, respects RLS
3. **Admin Client** (`createAdminClient()`) — Bypasses RLS, used only in trusted server-side code after permission checks

### Cron Infrastructure

All scheduled tasks run via `node-cron` registered in `src/lib/cron/scheduler.ts`, triggered by Next.js `instrumentation.ts`. No external schedulers (no n8n, no Vercel Cron).

| Cron Job | Schedule | Purpose |
|----------|----------|---------|
| Google Reviews Refresh | Daily 6 AM PST | Fetches latest Google review data via Places API |
| Theme Auto-Activation | Every 15 minutes | Activates/deactivates seasonal themes based on date range |

---

## 2. Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 16 | Framework (App Router, Server Components, Static Generation) |
| TypeScript (strict) | Type safety |
| Tailwind CSS | Styling (dark theme with blue/teal accents) |
| Supabase | Database (PostgreSQL), Auth, Storage, RLS |
| react-hook-form + Zod | Form handling + validation |
| @tanstack/react-table | Data tables in admin |
| sonner | Toast notifications |
| lucide-react | Icons |
| node-cron | Scheduled tasks |

### Key Project Files

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | Directory map, API patterns, Supabase clients, cron |
| `docs/CONVENTIONS.md` | Code patterns, auth flow, response shapes |
| `docs/DESIGN_SYSTEM.md` | Colors, typography, spacing, component patterns |
| `docs/PERMISSIONS_AUDIT.md` | 83-key permission system documentation |
| `src/lib/supabase/types.ts` | All TypeScript interfaces |
| `src/lib/utils/constants.ts` | Feature flags, permission categories |
| `src/lib/utils/role-defaults.ts` | Default permission assignments per role |
| `src/lib/auth/roles.ts` | Sidebar navigation, role definitions |
| `src/lib/cron/scheduler.ts` | All cron job registrations |

---

## 3. Phase 1 — Visual Redesign (Waves 1-6)

### What It Does

Transforms every public page from a 2020-era design (gradient backgrounds, blur circles, grid overlays) into a clean, Apple-inspired premium look with generous whitespace, real social proof, and transformation photography.

### Design Principles

1. **Less is more** — Remove decorative clutter. Let content breathe.
2. **Show the transformation** — Before/after photos lead every page.
3. **Real social proof** — Google + Yelp data from actual platforms.
4. **Personal touch** — Feature team members by name.
5. **One accent color** — Brand blue for CTAs only. Everything else: near-black, white, gray.
6. **Generous spacing** — 96-160px between sections. 32-48px card padding.
7. **Typography hierarchy** — 48-72px headlines, more weight contrast.

### Wave 1: Foundation (Global Styles + Header + Footer)

**globals.css** (`src/app/globals.css`):
- Simplified gradients (single clean navy-to-brand-900)
- New utility: `.section-spacing` (py-24 sm:py-32)
- New utility: `.container-narrow` (max-w-5xl)
- Body line-height increased to 1.7

**Header** (`src/components/public/site-header.tsx`):
- Simplified: Logo | Nav (Services, Products, Gallery) | Book Now CTA
- Single hamburger menu on mobile (no second row)
- Transparent on hero → blur on scroll (HeaderShell pattern)
- Phone number moved to footer

**Footer** (`src/components/public/site-footer.tsx`):
- 3 columns: Brand + Quick Links + Contact
- Trust badges in horizontal strip above columns
- Google review badge inline
- "Service Areas" links section (added in Wave 13)

**Google + Yelp Reviews Integration**:
- Data layer: `src/lib/data/reviews.ts` → `getReviewData()`
- Google: Fetched via Places API, cached in `business_settings`
- Yelp: Manually entered in admin (no free API)
- Cron: `/api/cron/google-reviews` runs daily at 6 AM PST
- Env var required: `GOOGLE_PLACES_API_KEY`
- Google Place ID: `ChIJf7qNDhW1woAROX-FX8CScGE`

**Team & About Content**:
- Data layer: `src/lib/data/team.ts` → `getTeamMembers()`
- Storage: `business_settings` JSON keys (team_members, credentials)
- Admin: `/admin/website/about/page.tsx`

**Photo Gallery Pipeline**:
- Data layer: `src/lib/data/featured-photos.ts`
- `getFeaturedBeforeAfter()` — Queries `job_photos` for best before/after pairs
- Admin stars photos in Jobs > Photos tab → `is_featured = true`
- Public site auto-shows featured photos (hero, gallery, service pages)
- Un-starring removes from public instantly

### Wave 2: Homepage Redesign

**Hero Section** (`src/components/public/hero-section.tsx`):
- Split-screen: text left, BeforeAfterSlider right
- Headline: "Premium Mobile Detailing" (48-72px)
- Inline Google stats: "★ 4.8 · 247 Google Reviews · Lomita, CA"
- Single CTA: "Book Appointment"
- Data: `getFeaturedBeforeAfter()` for the slider

**Trust Bar** (`src/components/public/trust-bar.tsx`):
- Horizontal strip with real data from `getReviewData()`
- Format: "★ 5.0 Google (44 reviews)" | "★ 5.0 Yelp (84 reviews)" | "6,000+ Vehicles" | "Same-Day Available"

**Services Section** — Bento-style grid:
- 1 large featured card (Ceramic Coatings) spanning 2 columns + 2 smaller cards
- Clean white cards with category name, description, price, arrow

**Meet the Team Section** — Admin-managed via Website > About & Team

**Google Review Cards** — 3 actual Google review cards with author, stars, text

**CTA Section** (`src/components/public/cta-section.tsx`):
- Clean gradient, larger headline, single CTA button

### Waves 3-4: Service & Product Pages

All pages follow the same cleanup pattern: remove grid overlays, simplify heroes, cleaner card styling.

**Service pages**: index → category → detail (2-column: main + sticky sidebar with price/CTA)
**Product pages**: index → category → detail (2-column: image left, details right)

### Waves 5-6: Gallery, Booking, Quote + Polish

Gallery gets simplified filter pills. Booking wizard gets minimal styling touches. Quote page gets minor cleanup. ScrollReveal animations tuned to be subtler.

---

## 4. Phase 2 — CMS Infrastructure (Wave 7)

### What It Does

Creates the database foundation, data layer, permissions, and admin sidebar for the entire CMS system. Everything in Phase 3 depends on this.

### Database Migrations (9 total)

| Migration | Table(s) Created | Purpose |
|-----------|-----------------|---------|
| `000001_cms_hero_carousel.sql` | `hero_slides` | Carousel slides (image/video/before-after) |
| `000002_cms_tickers.sql` | `announcement_tickers` | Top bar + section announcement tickers |
| `000003_cms_ads.sql` | `ad_creatives`, `ad_placements`, `ad_events` | Ad management + tracking |
| `000004_cms_themes.sql` | `seasonal_themes` | Holiday/seasonal theme engine |
| `000005_cms_catalog_controls.sql` | (adds columns to `products`, `services`) | Website visibility toggles |
| `000006_cms_feature_flags.sql` | (adds to `feature_flags`) | 4 CMS feature flags |
| `000007_cms_storage.sql` | (creates `cms-assets` bucket) | Storage for CMS uploads (10MB, images/video) |
| `000008_cms_permissions.sql` | (adds to `permission_definitions`, `permissions`) | 7 CMS permission keys |
| `000009_seo_engine.sql` | `page_seo`, `city_landing_pages` + alt text columns | SEO overrides + city pages |

### Data Layer

`src/lib/data/cms.ts` — Central CMS data access:
- `getActiveHeroSlides()` — Cached, sorted by sort_order
- `getHeroCarouselConfig()` — Mode, interval, transition settings
- `getActiveTheme()` — Current seasonal theme or null
- `getCmsToggles()` — All 4 feature flags + master toggles
- `getTopBarTickers(pagePath)` — Active tickers for page
- `getSectionTickers(pagePath, position)` — Section-level tickers
- `getAdsForZone(pagePath, zoneId)` — Active ad for a zone

### Admin Sidebar

Under "Website" (Globe icon) in the admin panel:
```
Website
  ├── Hero            (Image icon)
  ├── Tickers         (Megaphone icon)
  ├── Ads             (RectangleHorizontal icon)
  ├── Themes          (Palette icon)
  ├── About & Team    (Users icon)
  ├── Catalog Display (LayoutGrid icon)
  ├── SEO             (Search icon)
  └── Terms           (FileText icon)
```

Visibility: Shows if user has ANY `cms.*` permission. Individual items gated by specific permission key.

### Feature Flags

4 CMS feature flags (in "Website" category):
- `hero_carousel` (default ON)
- `announcement_tickers` (default OFF)
- `ad_placements` (default OFF)
- `seasonal_themes` (default OFF)

---

## 5. Phase 3 — CMS Features (Waves 8-12)

### Wave 8: Hero Carousel System

**How it works**: Admin creates slides with 3 content types (Image, Video, Before/After). Slides can be reordered, toggled active/inactive, and displayed as a carousel or single image.

**Admin pages**:
- `/admin/website/hero/page.tsx` — Slide list with drag reorder, mode toggle (carousel/single), interval config
- `/admin/website/hero/[id]/page.tsx` — Slide editor with content type tabs, overlay opacity, text alignment, live preview

**Public component**: `src/components/public/cms/hero-carousel.tsx`
- Modes: carousel (auto-advance with configurable interval, pause on hover) or single display
- Transitions: fade or slide
- Responsive: mobile image variant support
- Graceful fallback: if hero_carousel feature flag off, renders original static hero

**API routes**:
- `GET/POST /api/admin/cms/hero/` — List/create slides
- `GET/PATCH/DELETE /api/admin/cms/hero/[id]` — Single slide CRUD
- `PATCH /api/admin/cms/hero/reorder` — Reorder slides
- `GET/PATCH /api/admin/cms/hero/config` — Carousel settings
- `GET /api/public/cms/hero` — Public active slides

### Wave 9: Announcement Ticker System

**How it works**: Tickers are scrolling message banners. Two placement types:
- **Top bar** — Site-wide banner above the header
- **Section** — Inserted between page sections

**Admin page**: `/admin/website/tickers/page.tsx` and `[id]/page.tsx`
- Message, link, placement type, target pages, colors, scroll speed, schedule (starts_at/ends_at)

**Public component**: `src/components/public/cms/announcement-ticker.tsx`
- CSS animation-based scrolling
- Page-targeted (shows on specific pages or all)
- Schedule-aware (respects starts_at/ends_at)

### Wave 10: Ad Placement System

**How it works**: A lightweight internal ad system using standard Google Display sizes. Supports impression/click tracking with anti-duplicate protection.

**Three-part architecture**:
1. **Ad Creatives** — The actual ad images with metadata (name, size, link, date range)
2. **Ad Placements** — Assignments of creatives to specific zones on specific pages
3. **Ad Events** — Impression and click tracking with ip_hash deduplication

**Standard ad sizes supported**: 728×90, 300×250, 336×280, 160×600, 300×600, 320×50, 320×100, 970×90, 970×250, 250×250

**Ad zones per page**:
- Homepage: `below_hero`, `between_sections_1`, `above_cta`
- Service/product pages: `below_hero`, `between_categories`, `above_cta`, `sidebar`
- Gallery: `below_hero`, `between_rows`
- Booking: `sidebar` only (desktop, hidden on mobile)

**Public component**: `src/components/public/cms/ad-zone.tsx` (Client Component)
- IntersectionObserver fires impression when 50% visible for 1 second
- Click handler records click then navigates to link
- Anti-duplicate: ip_hash + creative ID + 1-hour window (server-side)

**Admin pages**:
- `/admin/website/ads/page.tsx` — Hub with 3 tabs: Creatives | Page Map | Analytics
- Page Map: visual wireframe → click zone → assign ad
- Analytics: top performers, CTR by zone, impression/click trends

### Wave 11: Seasonal Theme Engine

**How it works**: When a theme is active, it overrides CSS custom properties (colors, gradients) and optionally adds particle effects, themed tickers, and hero backgrounds. Only one theme active at a time.

**What a theme changes**:
- CSS color variables (brand-500 through brand-900, accent-400 through accent-600)
- Gradients (hero, CTA, brand)
- Particle effects (snowfall, fireworks, confetti, hearts, leaves, stars, sparkles)
- Optional: themed ticker message, themed ad creative, hero background, body bg color

**8 pre-built presets**:
| Theme | Colors | Particle | Ticker |
|-------|--------|----------|--------|
| Christmas | Red + Green | Snowfall | "Happy Holidays! Gift certificates available" |
| Halloween | Orange + Purple | Sparkles | "Spooktacular October Special: 20% off interior" |
| 4th of July | Blue + Red | Fireworks | "Independence Day detailing special!" |
| Memorial Day | Navy + Red | Stars | "Memorial Day Weekend Sale" |
| Presidents Day | Navy + Gold | Stars | "15% off ceramic coating this weekend" |
| Valentine's Day | Pink + Rose | Hearts | "Show your car some love" |
| Fall/Autumn | Amber + Red | Leaves | "Protect your paint before winter!" |
| New Year | Gold + Black | Confetti | "Start fresh — book your New Year detail!" |

**Public components**:
- `src/components/public/cms/particle-canvas.tsx` — Canvas-based particle rendering with requestAnimationFrame
  - Respects `prefers-reduced-motion`
  - Pauses when tab hidden (Page Visibility API)
  - Reduces particle count on mobile
- `src/components/public/cms/theme-provider.tsx` — Wraps public layout, injects CSS overrides
  - Scoped to public layout only (does NOT affect admin)

**Layout integration** (`src/app/(public)/layout.tsx`):
```jsx
<ThemeProvider theme={activeTheme}>
  {tickerEnabled && <TopBarTicker />}
  <SiteHeader />
  <main>{children}</main>
  <SiteFooter />
</ThemeProvider>
```

**Auto-activation cron**: Every 15 minutes checks themes with `auto_activate = true` and date ranges, activating/deactivating as needed.

### Wave 12: Catalog Display Controls

**How it works**: Decouples POS visibility from website visibility. A service can be active in the POS system but hidden from the website (and vice versa).

**New columns**:
- `products`: `show_on_website` (bool), `is_featured` (bool), `website_sort_order` (int)
- `services`: `show_on_website` (bool), `is_featured` (bool)

**Admin page**: `/admin/website/catalog/page.tsx`
- Two tabs: Services | Products
- Toggles for website visibility and featured status
- Drag-to-reorder for website sort order
- Bulk actions: "Show all" / "Hide all"

**Public page impact**: All service/product queries add `.eq('show_on_website', true)` filter. Featured items sort first.

---

## 6. Phase 4 — SEO Engine (Wave 13)

### What It Does

Adds a Yoast/RankMath-style SEO management system with per-page configuration, city landing pages for local search dominance, OG image generation, image alt text management, internal linking, and enhanced structured data.

### Existing SEO Foundation (Already Built)

The app already has:
- 13 `generateMetadata()` functions across all public pages
- Dynamic `sitemap.xml` (ceramic coatings at priority 1.0)
- `robots.txt` (blocks /admin, /api/, /login)
- 5 JSON-LD schemas (LocalBusiness, Service, Product, Breadcrumb, ImageGallery)
- 4 `generateStaticParams()` routes for static generation
- SEO metadata helpers in `src/lib/seo/metadata.ts`

### What Wave 13 Adds

**13.1 — Per-Page SEO Configuration**

Every public page gets a row in the `page_seo` table. Auto-populated with sensible defaults from existing `generateMetadata()`, then customizable by admin.

The admin SEO editor provides a Yoast-style panel per page:
- **Title** — Editable, live character count (50-60 optimal), SERP preview
- **Meta Description** — Editable, live character count (150-160 optimal), SERP preview
- **Focus Keyword** — Checks: in title? in description? in H1? in URL? keyword density
- **Meta Keywords** — Comma-separated
- **Canonical URL** — Override (usually auto-set)
- **Robots Directive** — index+follow / noindex / nofollow
- **OG Image** — Upload custom or auto-generate
- **OG Title/Description** — Override
- **Structured Data** — Read-only JSON-LD preview + custom properties
- **Internal Links** — Suggested links to add
- **SEO Score** — Real-time analysis (green/amber/red)

**SEO Score checks**: Title length, description length, focus keyword in title/description/URL/H1, has OG image, has internal links, content length estimate.

**Admin dashboard** (`/admin/website/seo/page.tsx`):
- Health score summary
- All indexable pages listed with SEO scores
- Filters: page type, SEO score, missing focus keyword
- "Audit All" button — runs check across all pages
- "Auto-Populate Missing" — creates rows for new pages

**Data flow**: `src/lib/seo/page-seo.ts` provides:
- `getPageSeo(pagePath)` — Cached lookup
- `mergeMetadata(autoGenerated, overrides)` — Merges auto metadata with admin overrides
- Used by all 13+ `generateMetadata()` functions

**13.2 — City Landing Pages**

Public route: `/areas/[citySlug]` (e.g., `/areas/torrance`)

Each city page is a Server Component with:
- H1: "Mobile Auto Detailing in {City}, {State}"
- City-specific intro paragraph (mentioning landmarks, distance)
- Service highlights with pricing, linked to service detail pages
- Reused Google reviews section
- Reused featured photos (before/after)
- CTA: "Book Your Detail in {City}"
- Breadcrumbs: Home > Service Areas > {City}
- City-specific meta tags + JSON-LD with `areaServed`
- `generateStaticParams()` for all active cities

**11 seed cities** (within ~3-mile radius of Lomita): Lomita, Torrance, Harbor City, Carson, Gardena, Wilmington, San Pedro, Redondo Beach, Palos Verdes Estates, Rolling Hills, Rancho Palos Verdes

**Admin**: `/admin/website/seo/cities/page.tsx` — Add/edit/reorder cities with name, slug, distance, heading, intro text, service highlights, keywords

**13.3 — ai.txt**

Route: `src/app/ai.txt/route.ts` — Controls AI crawler access. Admin-configurable via `business_settings` key `ai_txt_content`.

**13.4 — Enhanced Sitemap**

City pages added with priority 0.8, monthly changefreq. Product/service pages use `updated_at` from DB for `lastmod`.

**13.5 — Image Alt Tag Management**

New columns: `products.image_alt`, `services.image_alt`, `product_images.alt_text`. Admin can edit alt text per image. SEO dashboard shows "Images Missing Alt Text" count.

**13.6 — Internal Linking Strategy**

Automated server-side links:
- Service detail → related services ("You may also like")
- Service category → other categories ("Explore Our Other Services")
- Product detail → related service ("Need professional application?")
- City pages → top services (especially ceramic coatings)
- Footer → all active city page links

**13.7 — Enhanced Schema Markup**

Added to `src/lib/seo/json-ld.ts`:
- `AggregateRating` on LocalBusiness (from Google review data)
- Individual `Review` objects from Google
- `FAQPage` on service detail pages
- `GeoCircle` areaServed (3-mile radius)
- `sameAs` (Google Business, Yelp profiles)
- `hasOfferCatalog` service catalog reference

**13.8 — OG Image Generation**

`src/app/opengraph-image.tsx` using Next.js ImageResponse:
- Homepage: logo + tagline + review stars
- Service pages: service name + price + branding
- Product pages: product image + name + price
- City pages: "Mobile Detailing in {City}" + branding
- Custom admin upload overrides auto-generated

---

## 7. Phase 5 — Terms & Conditions (Wave 14)

### What It Does

Legal protection page with admin-editable sections covering service liability, vehicle pickup, payment, cancellation, SMS/email consent, and more.

**Public page**: `/terms` (Server Component for SEO)

**Content sections** (all admin-editable):
1. Service Agreement & Liability
2. Vehicle Pickup & Storage
3. Payment Terms
4. Cancellation & No-Show Policy
5. SMS & Text Message Consent (TCPA compliance)
6. Email Communications
7. Privacy & Data
8. General Provisions

**Storage**: `business_settings` key `terms_and_conditions` (JSONB). Each section: `{ title, content, is_active }`. Markdown content rendered as HTML.

**Admin page**: `/admin/website/terms/page.tsx` — Section editor with drag-to-reorder, rich text (Markdown), enable/disable per section, effective date.

**Integration points**:
- Booking form: "I agree to T&C" checkbox (required)
- Quote acceptance page: T&C link in footer
- Public footer: "Terms & Conditions" link
- Sitemap: `/terms` page included

---

## 8. Database Schema Reference

### CMS Tables

| Table | Key Columns | RLS |
|-------|-------------|-----|
| `hero_slides` | id, title, subtitle, cta_text, cta_url, content_type, image_url, sort_order, is_active | Public read (active), Auth all |
| `announcement_tickers` | id, message, placement, target_pages, starts_at, ends_at, is_active | Public read (active), Auth all |
| `ad_creatives` | id, name, image_url, ad_size, link_url, impression_count, click_count, is_active | Public read (active), Auth all |
| `ad_placements` | id, ad_creative_id FK, page_path, zone_id, device, priority, is_active | Public read (active), Auth all |
| `ad_events` | id, ad_creative_id FK, event_type, page_path, ip_hash | Insert only |
| `seasonal_themes` | id, name, slug, color_overrides JSONB, particle_effect, starts_at, ends_at, is_active | Public read (active), Auth all |

### SEO Tables

| Table | Key Columns | RLS |
|-------|-------------|-----|
| `page_seo` | id, page_path UNIQUE, page_type, seo_title, meta_description, focus_keyword, og_image_url, robots_directive | Public read, Auth write |
| `city_landing_pages` | id, city_name, slug UNIQUE, state, distance_miles, heading, intro_text, focus_keywords, is_active | Public read, Auth write |

### Modified Existing Tables

| Table | Added Columns |
|-------|--------------|
| `products` | `show_on_website`, `is_featured`, `website_sort_order`, `image_alt` |
| `services` | `show_on_website`, `is_featured`, `image_alt` |
| `product_images` | `alt_text` |

---

## 9. API Routes Reference

### Admin CMS Routes (all require `cms.*` permission)

| Route | Methods | Permission | Purpose |
|-------|---------|------------|---------|
| `/api/admin/cms/hero/` | GET, POST | cms.hero.manage | List/create hero slides |
| `/api/admin/cms/hero/[id]` | GET, PATCH, DELETE | cms.hero.manage | Single slide CRUD |
| `/api/admin/cms/hero/reorder` | PATCH | cms.hero.manage | Reorder slides |
| `/api/admin/cms/hero/config` | GET, PATCH | cms.hero.manage | Carousel settings |
| `/api/admin/cms/tickers/` | GET, POST | cms.tickers.manage | List/create tickers |
| `/api/admin/cms/tickers/[id]` | GET, PATCH, DELETE | cms.tickers.manage | Single ticker CRUD |
| `/api/admin/cms/ads/creatives/` | GET, POST | cms.ads.manage | List/create ad creatives |
| `/api/admin/cms/ads/creatives/[id]` | GET, PATCH, DELETE | cms.ads.manage | Single creative CRUD |
| `/api/admin/cms/ads/placements/` | GET, POST | cms.ads.manage | List/create placements |
| `/api/admin/cms/ads/placements/[id]` | GET, PATCH, DELETE | cms.ads.manage | Single placement CRUD |
| `/api/admin/cms/ads/zones` | GET | cms.ads.manage | Zone definitions + assignments |
| `/api/admin/cms/ads/analytics` | GET | cms.ads.manage | Performance data |
| `/api/admin/cms/themes/` | GET, POST | cms.themes.manage | List/create themes |
| `/api/admin/cms/themes/[id]` | GET, PATCH, DELETE | cms.themes.manage | Single theme CRUD |
| `/api/admin/cms/themes/[id]/activate` | POST | cms.themes.manage | Activate (deactivates others) |
| `/api/admin/cms/themes/[id]/deactivate` | POST | cms.themes.manage | Deactivate |
| `/api/admin/cms/catalog/services` | GET, PATCH | cms.catalog_display.manage | Service visibility/order |
| `/api/admin/cms/catalog/products` | GET, PATCH | cms.catalog_display.manage | Product visibility/order |
| `/api/admin/cms/seo/pages` | GET | cms.seo.manage | List all pages with SEO data |
| `/api/admin/cms/seo/pages/[path]` | GET, PATCH | cms.seo.manage | Per-page SEO CRUD |
| `/api/admin/cms/seo/audit` | POST | cms.seo.manage | Run SEO audit |
| `/api/admin/cms/seo/cities/` | GET, POST | cms.seo.manage | List/create city pages |
| `/api/admin/cms/seo/cities/[id]` | GET, PATCH, DELETE | cms.seo.manage | Single city CRUD |
| `/api/admin/cms/seo/ai-txt` | GET, PATCH | cms.seo.manage | ai.txt content |

### Public CMS Routes (no auth required)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/public/cms/hero` | GET | Active hero slides |
| `/api/public/cms/tickers` | GET | Active tickers for page |
| `/api/public/cms/ads?zone=X&page=Y` | GET | Active ad for zone |
| `/api/public/cms/ads/impression` | POST | Record impression |
| `/api/public/cms/ads/click` | POST | Record click + redirect |
| `/api/public/cms/theme` | GET | Active theme data |

---

## 10. Permission System

### Resolution Order

```
super_admin bypass → user override → role default → deny
```

### CMS Permissions (7 new keys, expanding system from 76 → 83)

| Key | super_admin | admin | cashier | detailer |
|-----|-------------|-------|---------|----------|
| cms.hero.manage | ✅ | ✅ | ❌ | ❌ |
| cms.tickers.manage | ✅ | ✅ | ❌ | ❌ |
| cms.ads.manage | ✅ | ✅ | ❌ | ❌ |
| cms.themes.manage | ✅ | ✅ | ❌ | ❌ |
| cms.about.manage | ✅ | ✅ | ❌ | ❌ |
| cms.catalog_display.manage | ✅ | ✅ | ❌ | ❌ |
| cms.seo.manage | ✅ | ✅ | ❌ | ❌ |

**Server-side enforcement**: Each API route calls `requirePermission()` with matching key.
**Client-side**: `usePosPermission()` / `usePermission()` hooks.
**Admin sidebar**: Website section shows if user has ANY `cms.*` permission.

---

## 11. Execution Order & Session Plan

### 4 Phases, 8 Steps, ~16 Sessions

| Step | Sessions | Parallelism | Depends On | Content |
|------|----------|-------------|------------|---------|
| 1 | 1 | SOLO | — | Foundation (globals, header, footer, reviews, photos helpers) |
| 2 | 1 | SOLO | Step 1 | Homepage + shared components |
| 3 | 3 | PARALLEL (A, B, C) | Step 2 | A: Service pages, B: Product pages, C: Gallery+Quote+Booking |
| 4 | 1 | SOLO | Step 3 | Migrations + Types + Permissions + Data layer + Constants + Sidebar |
| 5 | 4 | PARALLEL (D, E, F, G) | Step 4 | D: Hero carousel, E: Tickers, F: Catalog+About, G: Terms |
| 6 | 2 | PARALLEL (H, I) | Step 5 | H: Ad placements, I: Seasonal themes |
| 7 | 1 | SOLO | Step 6 | SEO core (page-seo data layer, all generateMetadata updates, sitemap, ai.txt) |
| 8 | 3 | PARALLEL (J, K, L) | Step 7 | J: City pages, K: SEO admin dashboard, L: OG images+alt tags+JSON-LD+linking |

**Minimum wall-clock steps**: 8 (parallel batches count as 1 step each)

---

## 12. Verification Checklist

### Visual Redesign (Waves 1-6)
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] Visual check at 3 breakpoints: 375px, 768px, 1440px
- [ ] Dark mode check on all pages
- [ ] Lighthouse: 90+ Performance, 100 Accessibility
- [ ] Hero BeforeAfterSlider loads (needs featured photos in DB)
- [ ] Google + Yelp review data displays
- [ ] Team section renders from admin data
- [ ] Google review cards show actual text
- [ ] Booking flow end-to-end
- [ ] All internal links work

### CMS System (Waves 7-12)
- [ ] CMS permissions grant/deny works correctly
- [ ] Hero: carousel/single mode, all 3 content types render
- [ ] Tickers: top bar + section show on correct pages, respect schedule
- [ ] Ads: create → assign to zone → impression/click tracking works
- [ ] Themes: activate preset → colors change + particles render → deactivate
- [ ] Catalog: toggle show_on_website → item disappears from public
- [ ] Feature flags: disable each → graceful fallback
- [ ] Theme cron auto-activation fires on schedule
- [ ] Mobile: all CMS features render correctly
- [ ] Performance: particles don't degrade FPS

### SEO Engine (Wave 13)
- [ ] Per-page SEO: custom title/description in page source
- [ ] SEO score: green when focus keyword in title + description
- [ ] City pages render at /areas/[slug] with city-specific content
- [ ] City pages in sitemap.xml with priority 0.8
- [ ] ai.txt accessible with correct rules
- [ ] robots.txt references ai.txt
- [ ] OG images generate for homepage, service, product, city pages
- [ ] Image alt tags from DB (not empty)
- [ ] SERP preview matches page source
- [ ] JSON-LD: AggregateRating, FAQPage, GeoCircle
- [ ] Internal links: related services, footer city links
- [ ] Lighthouse SEO: 100 on all public pages

### Terms & Conditions (Wave 14)
- [ ] T&C page at /terms with all admin sections
- [ ] Admin can enable/disable, reorder, edit sections
- [ ] Booking form has T&C checkbox with link
- [ ] T&C link in footer
- [ ] T&C in sitemap.xml
