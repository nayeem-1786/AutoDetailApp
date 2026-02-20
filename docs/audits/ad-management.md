# Ad Management System Audit (Zone Placement Verification)
Date: 2026-02-20
Method: Layout inspection of every public page source code + cross-reference with PAGE_ZONES definitions

## Page Layout Analysis

Every public page was inspected to determine its actual layout structure and which ad zone types it can physically support.

| Page | Route | Layout Type | Has Sidebar? | Has Section Gaps? | Has Header Area? | Has Footer Area? |
|------|-------|-------------|--------------|-------------------|------------------|------------------|
| Homepage | `/` | single column, full-width | No | Yes (hero→trust→services→why→team→reviews→CTA) | Yes | Yes |
| Services listing | `/services` | single column, full-width | No | Yes (hero→grid→CTA) | Yes | Yes |
| Service category | `/services/:categorySlug` | single column, full-width | No | Yes (hero→grid→other cats→CTA) | Yes | Yes |
| Service detail | `/services/:cat/:slug` | two-column (`lg:grid-cols-3`) | **Yes** — `<aside>` col-span-1 | Yes (addons, related) | Yes | Yes |
| Products listing | `/products` | single column, full-width | No | Yes (hero→grid→CTA) | Yes | Yes |
| Product category | `/products/:categorySlug` | single column, full-width | No | Yes (hero→grid→CTA) | No zones defined | No zones defined |
| Product detail | `/products/:cat/:slug` | two-column (`lg:grid-cols-2`) | **No** — image + details, no aside | No | No | Yes (below grid) |
| Gallery | `/gallery` | single column, full-width | No | Yes (hero→grid) | Yes | Yes |
| Booking | `/book` | single column, centered (`max-w-3xl`) | **No** — single form column | No | No | Yes (below form) |
| Cart | `/cart` | two-column (`lg:grid-cols-3`) | Yes (order summary) | No | No | No |
| Checkout | `/checkout` | two-column (`lg:grid-cols-3`) | Yes (order summary) | No | No | No |
| Checkout confirmation | `/checkout/confirmation` | single column, narrow | No | No | No | No |
| Areas index | `/areas` | single column, full-width | No | Yes (hero→city grid→CTA) | Yes | Yes |
| City detail | `/areas/:citySlug` | single column, full-width | No | Yes (hero→services→content→reviews→CTA) | Yes | Yes |
| Terms | `/terms` | single column, narrow (`max-w-3xl`) | No | No | No | No |
| CMS pages | `/p/[...slug]` | variable (content/landing/blank) | No | Variable | Variable | Variable |
| Quote | `/quote/:token` | single column, narrow (`max-w-3xl`) | No | No | No | No |

**Notes:**
- Cart/Checkout: sidebar is the order summary — not suitable for ads (would distract from conversion)
- Terms, Quote, Confirmation: transactional/legal pages — ads not appropriate
- CMS pages: variable structure makes static zone definitions impractical
- Product category, Areas: could support zones but not currently defined (no issue — just not configured)

## Zone Map — Before vs After

### Before (invalid zones marked)

| Page | Zone ID | Zone Label | Desktop Sizes | Mobile Sizes | Valid? |
|------|---------|-----------|---------------|-------------|--------|
| `/` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | ✅ |
| `/` | `between_sections_1` | Between Sections | 728x90 | 320x100 | ✅ |
| `/` | `above_cta` | Above CTA | 728x90 | 320x100 | ✅ |
| `/services` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | ✅ |
| `/services` | `above_cta` | Above CTA | 728x90 | 320x100 | ✅ |
| `/services/:cat` | `below_hero` | Below Hero | 728x90 | 320x100 | ✅ |
| `/services/:cat` | `above_cta` | Above CTA | 728x90 | 320x100 | ✅ |
| `/services/:cat/:slug` | `sidebar` | Sidebar | 300x250, 336x280, 300x600 | 320x100 | ✅ Real `<aside>` in 3-col grid |
| `/products` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | ✅ |
| `/products` | `above_cta` | Above CTA | 728x90 | 320x100 | ✅ |
| `/products/:cat/:slug` | `sidebar` | Sidebar | 300x250, 336x280 | 320x100 | ❌ **MISMATCH** — No sidebar; ad placed outside 2-col grid as full-width |
| `/gallery` | `below_hero` | Below Hero | 728x90 | 320x100 | ✅ |
| `/gallery` | `between_rows` | Between Rows | 728x90, 970x90 | 320x100 | ✅ |
| `/book` | `sidebar` | Sidebar (Desktop) | 300x250, 160x600 | (none) | ❌ **INVALID** — No sidebar; page is single-column centered |

### After (corrected)

| Page | Zone ID | Zone Label | Desktop Sizes | Mobile Sizes | Orientation |
|------|---------|-----------|---------------|-------------|-------------|
| `/` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | Horizontal |
| `/` | `between_sections_1` | Between Sections | 728x90 | 320x100 | Horizontal |
| `/` | `above_cta` | Above CTA | 728x90 | 320x100 | Horizontal |
| `/services` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | Horizontal |
| `/services` | `above_cta` | Above CTA | 728x90 | 320x100 | Horizontal |
| `/services/:cat` | `below_hero` | Below Hero | 728x90 | 320x100 | Horizontal |
| `/services/:cat` | `above_cta` | Above CTA | 728x90 | 320x100 | Horizontal |
| `/services/:cat/:slug` | `sidebar` | Sidebar | 300x250, 336x280, 300x600 | 320x100 | Vertical |
| `/products` | `below_hero` | Below Hero | 970x250, 728x90 | 320x100, 320x50 | Horizontal |
| `/products` | `above_cta` | Above CTA | 728x90 | 320x100 | Horizontal |
| `/products/:cat/:slug` | `below_content` | Below Product Content | 728x90, 970x250 | 320x100, 320x50 | Horizontal |
| `/gallery` | `below_hero` | Below Hero | 728x90 | 320x100 | Horizontal |
| `/gallery` | `between_rows` | Between Rows | 728x90, 970x90 | 320x100 | Horizontal |
| `/book` | `below_form` | Below Booking Form | 728x90, 970x250 | 320x100, 320x50 | Horizontal |

## Changes Made

1. **Booking `/book` — zone `sidebar` → `below_form`**
   - **Problem**: Page is a single-column centered layout (max-w-3xl header, full-width BookingWizard). No sidebar element exists. The `<AdZone>` was wrapped in `hidden sm:block`, rendering as a full-width block below the form — not a sidebar.
   - **Fix**: Renamed zone to `below_form`, changed sizes to horizontal (728x90, 970x250 desktop; 320x100, 320x50 mobile), removed desktop-only wrapper so mobile users also see the ad.
   - **Files**: `src/lib/utils/cms-zones.ts`, `src/app/(public)/book/page.tsx`

2. **Product Detail `/products/:cat/:slug` — zone `sidebar` → `below_content`**
   - **Problem**: Page uses `lg:grid-cols-2` for image + product details (not a sidebar layout). The `<AdZone>` was placed outside the grid at the bottom of the `<article>` container, rendering as a full-width horizontal element — labeled "sidebar" but actually a banner.
   - **Fix**: Renamed zone to `below_content`, changed sizes to horizontal (728x90, 970x250 desktop; 320x100, 320x50 mobile). Component placement unchanged (already correct for horizontal).
   - **Files**: `src/lib/utils/cms-zones.ts`, `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx`

3. **Service Detail `/services/:cat/:slug` — zone `sidebar` — NO CHANGE**
   - This page genuinely has a sidebar: `<aside className="lg:col-span-1">` in a `lg:grid-cols-3` layout. The `<AdZone>` is correctly placed inside the aside element, below the "Service Details" card. Vertical ad sizes (300x250, 336x280, 300x600) are appropriate.

## Orphaned Placements

Any existing `ad_placements` rows with the old zone IDs (`sidebar` on `/book` or `/products/:cat/:slug`) will silently return no ads since:
- The frontend now requests the new zone IDs (`below_form`, `below_content`)
- The admin Page Map dropdown is driven by `PAGE_ZONES` and no longer offers the old zone names
- No DB migration needed — orphaned rows are harmless

## Pages Without Ad Zones (Intentional)

| Page | Route | Reason |
|------|-------|--------|
| Cart | `/cart` | Transactional — ads distract from checkout flow |
| Checkout | `/checkout` | Transactional — same as cart |
| Checkout Confirmation | `/checkout/confirmation` | Post-purchase — not appropriate |
| Terms | `/terms` | Legal page |
| Quote | `/quote/:token` | Private customer-facing document |
| CMS Pages | `/p/[...slug]` | Variable template structure; admin controls content |
| Product Category | `/products/:categorySlug` | Not configured (could add `below_hero`/`above_cta` if desired) |
| Areas Index | `/areas` | Not configured (could add zones if desired) |
| City Detail | `/areas/:citySlug` | Not configured (could add zones if desired) |

## Remaining Issues (from prior audit, not fixed here)

1. **[Low] No RPC functions for counter increments** — `increment_ad_impression` and `increment_ad_click` fallback to manual UPDATE
2. **[Low] Device targeting not implemented** — `ad_placements.device` column ignored by `AdZone` component
3. **[Info] `themed_ad_creative_id` on seasonal_themes** — FK exists but no frontend renders it
