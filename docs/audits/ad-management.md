# Ad Management System Audit (Functional Test)
Date: 2026-02-20
Method: Code-traced end-to-end execution paths, verified every function call chain

## Executive Summary

The ad system is **fully functional** with working admin CRUD, image upload, zone assignment, analytics, and a public `AdZone` component wired into all 8 defined pages (14 zones total). Seven issues were found and fixed across two sessions:

**Session 1 fixes**: Master toggle had no frontend effect, ad container clipped leaderboards, Page Map showed empty dropdown when no creatives existed, 2 detail pages lacked toggle guards.

**Session 2 fixes (critical)**: Dynamic route ads never rendered due to template-vs-actual page_path mismatch in `getAdsForZone()`. Gallery `between_rows` and booking `sidebar` zones were unwired.

Schedule date handling was already correct (null = always active).

## Test Results

### Creative Management
- **Create**: ✅ Working — form validates name + image, POST to `/api/admin/cms/ads/creatives`
- **Upload image**: ✅ Working — drag-drop to `cms-assets` bucket, path `ad-creatives/{storageId}/{timestamp}.{ext}`, max 10MB
- **Save/persist**: ✅ Working — POST (new) or PATCH (existing), revalidates `cms-ads` tag
- **Edit existing**: ✅ Working — loads via GET `/api/admin/cms/ads/creatives/[id]`, PATCH on save
- **Delete**: ✅ Working — hard-delete with storage cleanup (best-effort regex path extraction)
- **Active/inactive toggle**: ✅ Working — optimistic UI, PATCH `{ is_active: val }`

### Page Map / Zone Assignment
- **View zones**: ✅ Working — GET `/api/admin/cms/ads/zones` returns `PAGE_ZONES` + placements
- **Assign creative to zone**: ✅ Working — POST/PATCH/DELETE on placements API
- **Empty state (no creatives)**: ✅ **FIXED** — now shows "No ad creatives yet" + "Create New Ad" button
- **Save assignment**: ✅ Working — persists via API, revalidates cache
- **Persist on reload**: ✅ Working — placements stored in `ad_placements` table

### Frontend Rendering — All 14 Zones Verified

| Page | Zone | Renders | Toggle Guard | Notes |
|------|------|---------|-------------|-------|
| Homepage (`/`) | below_hero | ✅ | ✅ | Static path — direct match |
| Homepage (`/`) | between_sections_1 | ✅ | ✅ | Static path — direct match |
| Homepage (`/`) | above_cta | ✅ | ✅ | Static path — direct match |
| Services (`/services`) | below_hero | ✅ | ✅ | Static path — direct match |
| Services (`/services`) | above_cta | ✅ | ✅ | Static path — direct match |
| Service Category (`/services/:categorySlug`) | below_hero | ✅ | ✅ | Dynamic — `resolveTemplatePath()` **FIXED** |
| Service Category (`/services/:categorySlug`) | above_cta | ✅ | ✅ | Dynamic — `resolveTemplatePath()` **FIXED** |
| Service Detail (`/services/:categorySlug/:serviceSlug`) | sidebar | ✅ | ✅ | Dynamic — `resolveTemplatePath()` **FIXED** + toggle guard **FIXED** |
| Products (`/products`) | below_hero | ✅ | ✅ | Static path — direct match |
| Products (`/products`) | above_cta | ✅ | ✅ | Static path — direct match |
| Product Detail (`/products/:categorySlug/:productSlug`) | sidebar | ✅ | ✅ | Dynamic — `resolveTemplatePath()` **FIXED** + toggle guard **FIXED** |
| Gallery (`/gallery`) | below_hero | ✅ | ✅ | Static path — direct match |
| Gallery (`/gallery`) | between_rows | ✅ | ✅ | **FIXED** — zone was unwired, now wired |
| Booking (`/book`) | sidebar | ✅ | ✅ | **FIXED** — zone was unwired, now wired (desktop only) |

### Dynamic Route Resolution (Critical Fix)

**Root cause**: Admin stores placements with **template paths** from `PAGE_ZONES` (e.g., `/services/:categorySlug/:serviceSlug`), but frontend `AdZone` components pass **actual paths** (e.g., `/services/ceramic-coatings/ceramic-coating`). `getAdsForZone()` used `.eq('page_path', pagePath)` — exact string match — so dynamic routes **never matched**.

**Fix**: Added `resolveTemplatePath()` function to `src/lib/data/cms.ts` that converts actual paths back to template paths before querying:
```ts
function resolveTemplatePath(actualPath: string): string {
  // Exact match first (static pages like /, /services, /products, /gallery)
  const exact = PAGE_ZONES.find((p) => p.pagePath === actualPath);
  if (exact) return actualPath;
  // Pattern match for dynamic routes
  for (const page of PAGE_ZONES) {
    if (!page.pagePath.includes(':')) continue;
    const pattern = page.pagePath.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(actualPath)) return page.pagePath;
  }
  return actualPath;
}
```

This affected **5 zones across 3 dynamic-route pages** — none of them could display ads before this fix.

### Schedule Date Handling
- **No dates set**: ✅ Ad displays — null handling is correct
- **Date filter location**: `src/lib/data/cms.ts` (`getAdsForZone`)
- **Logic**:
  ```ts
  if (creative.starts_at && new Date(creative.starts_at).getTime() > now) return null;
  if (creative.ends_at && new Date(creative.ends_at).getTime() < now) return null;
  ```
  The `&&` short-circuits: null `starts_at` = active immediately, null `ends_at` = never expires, both null = always active. **No fix needed.**

### Master Toggle (ads_enabled)
- **Current value**: Stored in `business_settings` table, key `ads_enabled`
- **Effect on frontend**: ✅ **FIXED** — now blocks rendering when off
- **Where checked**: `src/lib/data/cms.ts:219` — `adPlacements` is now `(flagMap.ad_placements) && (settingMap.ads_enabled ?? true)`
- **How it works**: `getCmsToggles()` merges both the auto-managed `ad_placements` feature flag AND the manual `ads_enabled` setting. Both must be true for `cmsToggles.adPlacements` to be true. Default for `ads_enabled` is `true` (so no row = ads allowed; explicit `false` = ads blocked).
- **Cache invalidation**: PATCH `/api/admin/settings/business` revalidates `cms-toggles` tag

### Image Rendering Quality
- **Leaderboard (970x90)**: ✅ **FIXED** — removed `maxHeight` constraint that clipped, reduced `rounded-2xl` (16px) to `rounded-lg` (8px)
- **Container sizing**: `maxWidth` constrains width; height flows naturally from `h-auto w-full`
- **Padding/spacing**: ✅ **FIXED** — added `py-4` to AdZone container for vertical breathing room
- **Responsive**: ✅ Working — `<picture>` tag with `<source media="(max-width: 639px)">` for mobile images

## Issues Fixed

### Session 1 (Audit + Initial Fixes)

1. **[Critical] Master toggle had no frontend effect** — `ads_enabled` was written to `business_settings` but `getCmsToggles()` only returned it as `adsEnabled`; frontend pages only checked `adPlacements`. Fixed: merged both conditions into `adPlacements` in `getCmsToggles()`.
   - File: `src/lib/data/cms.ts:219`

2. **[Critical] Ad container clipping** — `overflow-hidden` + `maxHeight: 90` + `rounded-2xl` (16px radius) on a 90px leaderboard clipped bottom corners. Fixed: removed `maxHeight`, reduced to `rounded-lg` (8px), added `py-4` spacing.
   - File: `src/components/public/cms/ad-zone.tsx`

3. **[Medium] Page Map empty state** — Zone assignment dropdown showed only "-- No ad (remove) --" when no active creatives existed, with no guidance. Fixed: shows dashed-border empty state with icon + "No ad creatives yet" + "Create New Ad" button.
   - File: `src/app/admin/website/ads/page.tsx`

4. **[Medium] Missing toggle guard on service detail sidebar** — `AdZone` rendered unconditionally without `cmsToggles.adPlacements &&` check. Fixed: added import of `getCmsToggles`, fetched in parallel with other data, wrapped AdZone with guard.
   - File: `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx`

5. **[Medium] Missing toggle guard on product detail sidebar** — Same issue as #4. Fixed identically.
   - File: `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx`

### Session 2 (Dynamic Route Fix + Zone Wiring)

6. **[Critical] Dynamic route ads never rendered — page_path mismatch** — Admin stores template paths (e.g., `/services/:categorySlug/:serviceSlug`) in `ad_placements.page_path`, but `getAdsForZone()` received actual paths (e.g., `/services/ceramic-coatings/ceramic-coating`) from frontend `AdZone` components. The `.eq('page_path', pagePath)` exact match never matched for any parameterized route. Fixed: added `resolveTemplatePath()` that converts actual paths to template paths using `PAGE_ZONES` pattern matching before querying the database.
   - File: `src/lib/data/cms.ts` — new `resolveTemplatePath()` function + import of `PAGE_ZONES`
   - Affected: 5 zones across 3 pages (service category, service detail, product detail)

7. **[Medium] Gallery `between_rows` zone unwired** — Defined in `PAGE_ZONES` but no `<AdZone>` placed in gallery page. Fixed: added `<AdZone zoneId="between_rows" pagePath="/gallery" />` wrapped in toggle guard.
   - File: `src/app/(public)/gallery/page.tsx`

8. **[Medium] Booking `sidebar` zone unwired** — Defined in `PAGE_ZONES` but no `<AdZone>` in booking page. Fixed: added imports, fetched `cmsToggles`, wired `<AdZone zoneId="sidebar" pagePath="/book" />` in desktop-only container.
   - File: `src/app/(public)/book/page.tsx`

## Remaining Issues (Not Fixed)

1. **[Low] No RPC functions for counter increments** — `increment_ad_impression` and `increment_ad_click` are called by API routes but never created in migrations. Code safely falls back to manual `UPDATE` (select count + set count+1), which works but isn't atomic under concurrency.

2. **[Low] Device targeting not implemented** — `ad_placements.device` column supports `all`/`desktop`/`mobile` but `AdZone` component ignores it entirely. All placements render on all devices.

3. **[Info] `themed_ad_creative_id` on seasonal_themes** — FK exists and admin theme editor can set it, but no frontend logic renders the themed ad during seasonal themes.

## Wiring Status Matrix

| Feature | DB | API | Admin UI | Frontend | Status |
|---------|:--:|:---:|:--------:|:--------:|--------|
| Create ad creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Upload image | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Edit/delete creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Set placement (zone) | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Schedule (start/end) | ✅ | ✅ | ✅ | ✅ | ✅ Complete (null = always) |
| Display on homepage | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) |
| Display on services | ✅ | ✅ | ✅ | ✅ | ✅ Complete (5 zones) — **dynamic route fix** |
| Display on products | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) — **dynamic route fix** |
| Display on gallery | ✅ | ✅ | ✅ | ✅ | ✅ Complete (2 zones) — **between_rows wired** |
| Display on booking | ✅ | ✅ | ✅ | ✅ | ✅ Complete (1 zone) — **sidebar wired** |
| Sidebar (detail pages) | ✅ | ✅ | ✅ | ✅ | ✅ Complete — guard + path fix |
| Impression tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete (IP dedup) |
| Click tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Analytics dashboard | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Master toggle | ✅ | ✅ | ✅ | ✅ | ✅ Complete — wired to frontend |
| Responsive images | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Device targeting | ✅ | ✅ | ✅ | ❌ | ❌ Not implemented |
| Themed ad (seasonal) | ✅ | ✅ | ✅ | ❌ | ❌ Not rendered |
| Counter increments | ❌ | ⚠️ | N/A | N/A | ⚠️ RPC missing, manual fallback |
