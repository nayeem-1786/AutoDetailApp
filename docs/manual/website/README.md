# Smart Details Auto Spa — Website System Reference

This document explains how the public-facing website works: where content comes from, how pages are generated, and how the CMS admin controls map to the public output.

For detailed CMS admin instructions, see [Chapter 7: CMS & Website Management](../07-cms-website.md).

---

## Architecture

The website is built with **Next.js Server Components** for SEO-optimized, server-rendered pages. Content is stored in **Supabase (PostgreSQL)** and fetched at request time via server-side data functions.

```
[Supabase DB] --> [Server Components / Data Layer] --> [Public Pages]
                       ^                                    ^
                [Admin Panel]                       [Client Components]
                (writes data)                    (interactive features only)
```

### Three Supabase Client Types

| Client | File | Used For |
|--------|------|----------|
| **Browser** | `src/lib/supabase/client.ts` | Client components — real-time features, interactive UI |
| **Server** | `src/lib/supabase/server.ts` | Server components and API routes — respects RLS |
| **Admin** | `src/lib/supabase/admin.ts` | Trusted server-side code after permission checks — bypasses RLS |
| **Anon** | `src/lib/supabase/anon.ts` | Static generation / build-time fetching without cookies |

---

## Content Sources (Single Source of Truth)

Every piece of data on the public site comes from exactly one place:

| Data Type | Source | Admin Location |
|-----------|--------|----------------|
| Business name, phone, address, email, logo | `business_settings` table | Admin > Settings > Business Profile |
| Business hours | `business_settings` table | Admin > Settings > Business Profile > Business Hours |
| Google review data (rating, count) | `business_settings` (cached from Google Places API) | Admin > Settings > Reviews |
| Yelp review data (rating, count) | `business_settings` (manually entered) | Admin > Settings > Reviews |
| Hero slides | `hero_slides` table | Admin > Website > Hero |
| Announcement tickers | `announcement_tickers` table | Admin > Website > Tickers |
| Ad creatives and placements | `ad_creatives`, `ad_placements` tables | Admin > Website > Ads |
| Seasonal themes and color overrides | `seasonal_themes` table | Admin > Website > Seasonal Themes |
| Base theme (colors, fonts, buttons) | `business_settings` (theme JSON) | Admin > Website > Theme & Styles |
| Navigation menus | `navigation_links` table | Admin > Website > Navigation |
| Footer columns and links | `footer_columns` table | Admin > Website > Footer |
| Homepage settings (hero tagline, CTAs, differentiators) | `business_settings` table | Admin > Website > Homepage |
| CMS pages | `cms_pages` table | Admin > Website > Pages |
| Global content blocks | `global_blocks` table | Admin > Website > Global Blocks |
| Team member bios | `team_members` table | Admin > Website > Team Members |
| Credentials/testimonials | `credentials` table | Admin > Website > Credentials |
| Service catalog | `services`, `service_categories` tables | Admin > Catalog > Services |
| Product catalog | `products`, `product_categories` tables | Admin > Catalog > Products |
| Website visibility toggles | `show_on_website`, `is_featured` columns | Admin > Website > Catalog Display |
| Per-page SEO overrides | `page_seo` table | Admin > Website > SEO |
| City landing pages | `city_landing_pages` table | Admin > Website > City Pages |
| Featured photos (before/after) | `job_photos` table with `is_featured` flag | Admin > Photos |
| Terms & Conditions | `business_settings` (terms JSON key) | Admin > Website > Terms (if exists) |

---

## Public Page Inventory

### Main Site (`src/app/(public)/`)

| Page | Route | What It Displays |
|------|-------|-----------------|
| **Homepage** | `/` | Hero section, trust bar, services grid, team, reviews, CTA |
| **Services Index** | `/services` | Service category listing (filtered by `show_on_website`) |
| **Service Category** | `/services/[categorySlug]` | Services in a category with pricing |
| **Service Detail** | `/services/[categorySlug]/[serviceSlug]` | Full service page with pricing tiers, gallery, related services |
| **Products Index** | `/products` | Product category listing (filtered by `show_on_website`) |
| **Product Category** | `/products/[categorySlug]` | Products in a category |
| **Product Detail** | `/products/[categorySlug]/[productSlug]` | Product page with images, pricing, add-to-cart |
| **Gallery** | `/gallery` | Photo gallery with zone-level before/after pairing, tag filtering, infinite scroll |
| **Service Areas** | `/areas` | List of service area cities |
| **City Detail** | `/areas/[citySlug]` | City-specific landing page with local SEO |
| **Team Member** | `/team/[memberSlug]` | Individual team member profile |
| **Booking** | `/book` | Multi-step booking wizard (service, schedule, customer, payment) |
| **Cart** | `/cart` | Shopping cart contents with coupon input |
| **Checkout** | `/checkout` | 3-step checkout (contact + fulfillment, shipping/pickup, review + payment) |
| **Order Confirmation** | `/checkout/confirmation` | Post-purchase confirmation |
| **Terms** | `/terms` | Terms & conditions page |
| **CMS Pages** | `/p/[...slug]` | Dynamic pages built with the CMS page builder |
| **Quote View** | `/quote/[token]` | Public quote acceptance page (token-based, no login) |
| **Receipt View** | `/receipt/[token]` | Public receipt view (token-based, no login) |

### Standalone Pages (outside route groups)

| Page | Route | What It Displays |
|------|-------|-----------------|
| **Short Quote URL** | `/q/[token]` | Redirects to the full quote page |
| **Job Authorization** | `/authorize/[token]` | Add-on authorization approval/decline |
| **Customer Photos** | `/jobs/[token]/photos` | Customer photo gallery for a completed job |
| **Unsubscribe** | `/unsubscribe/[customerId]` | Email/SMS unsubscribe preferences |

### Customer Portal (`src/app/(account)/`)

| Page | Route | What It Displays |
|------|-------|-----------------|
| **Dashboard** | `/account` | Welcome, loyalty points, last service, coupons, upcoming appointments |
| **Appointments** | `/account/appointments` | Upcoming and past appointments with reschedule/cancel |
| **Service History** | `/account/services` | Past service visits with before/after photos |
| **Service Detail** | `/account/services/[jobId]` | Individual service visit with photos and pricing |
| **Orders** | `/account/orders` | Online store order history |
| **Order Detail** | `/account/orders/[id]` | Order detail with tracking |
| **Transactions** | `/account/transactions` | Payment/transaction history |
| **Loyalty** | `/account/loyalty` | Loyalty point balance, earning/redemption history |
| **Photos** | `/account/photos` | All service photos organized by visit |
| **Vehicles** | `/account/vehicles` | Manage vehicles (add, edit, delete) |
| **Profile** | `/account/profile` | Edit name, phone, consent toggles, sign out |

---

## How CMS Controls Map to Public Output

| Admin Setting | Public Effect |
|---------------|--------------|
| Hero slides (active, sorted) | Homepage hero carousel or single display |
| Navigation links (header placement) | Site header navigation menu |
| Navigation links (footer placement) | Footer quick links |
| Footer columns (enabled, ordered) | Footer column layout with links, HTML, business info |
| Announcement tickers (active, targeted) | Scrolling banner above header or between sections |
| Theme & Styles colors/fonts | CSS custom properties applied to all public pages |
| Seasonal theme (active) | Color overrides + optional particle effects |
| Catalog Display toggles | Which services/products appear on the website |
| Page SEO overrides | Custom title, description, OG image per page |
| City pages (active) | City-specific landing pages at `/areas/[slug]` |
| CMS pages (published) | Custom pages at `/p/[slug]` |
| Global blocks (active) | Reusable content sections inserted into CMS pages |
| Team members (active, ordered) | Team section on homepage and individual profile pages |
| Homepage settings | Hero tagline, CTA text/images, differentiators, service descriptions |

---

## SEO Infrastructure

Every public page has:
- `generateMetadata()` for dynamic title, description, and OG tags
- JSON-LD structured data (LocalBusiness, Service, Product, Breadcrumb, etc.)
- Per-page SEO overrides from the `page_seo` table (merged with auto-generated metadata)

Additional SEO features:
- Dynamic `sitemap.xml` with all public pages, services, products, and city pages
- `robots.txt` blocking `/admin`, `/api/`, `/login`
- City landing pages for local search (`/areas/[citySlug]`)
- Image alt text management on products and services

---

## Feature Flags Affecting the Website

| Flag | What It Controls |
|------|-----------------|
| `hero_carousel` | Hero carousel vs static hero on homepage |
| `announcement_tickers` | Ticker banners on public pages |
| `ad_placements` | Ad zones on public pages |
| `seasonal_themes` | Seasonal theme color/particle overrides |
| `photo_gallery` | Public gallery page at `/gallery` |
| `online_booking` | Booking wizard at `/book` |

---

*Last updated: 2026-03-22*
