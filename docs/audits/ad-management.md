# Ad Management System Audit (Functional Test)
Date: 2026-02-20
Method: Code-traced end-to-end execution paths, verified every function call chain

## Executive Summary

The ad system is **substantially built** with working admin CRUD, image upload, zone assignment, analytics, and a public `AdZone` component wired into 7 of 8 defined pages. However, 4 critical bugs prevented ads from working correctly end-to-end: the master toggle had zero frontend effect, ad containers clipped leaderboard images, the Page Map showed an empty dropdown with no guidance when no creatives existed, and 2 detail pages lacked the toggle guard. **All 4 issues are now fixed.**

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

### Frontend Rendering

| Page | Zone | Renders | Toggle Guard | Notes |
|------|------|---------|-------------|-------|
| Homepage (`/`) | below_hero | ✅ | ✅ | |
| Homepage (`/`) | between_sections_1 | ✅ | ✅ | |
| Homepage (`/`) | above_cta | ✅ | ✅ | |
| Services (`/services`) | below_hero | ✅ | ✅ | |
| Services (`/services`) | above_cta | ✅ | ✅ | |
| Service Category (`/services/:slug`) | below_hero | ✅ | ✅ | |
| Service Category (`/services/:slug`) | above_cta | ✅ | ✅ | |
| Service Detail (`/services/:cat/:svc`) | sidebar | ✅ | ✅ **FIXED** | Was missing toggle guard |
| Products (`/products`) | below_hero | ✅ | ✅ | |
| Products (`/products`) | above_cta | ✅ | ✅ | |
| Product Detail (`/products/:cat/:prod`) | sidebar | ✅ | ✅ **FIXED** | Was missing toggle guard |
| Gallery (`/gallery`) | below_hero | ✅ | ✅ | |
| Gallery (`/gallery`) | between_rows | ❌ Not wired | — | Zone defined in PAGE_ZONES but no AdZone in page |
| Booking (`/book`) | sidebar | ❌ Not wired | — | Zone defined in PAGE_ZONES but no AdZone in page |

### Schedule Date Handling
- **No dates set**: ✅ Ad displays — null handling is correct
- **Date filter location**: `src/lib/data/cms.ts:291-292` (`getAdsForZone`)
- **Logic**:
  ```ts
  if (creative.starts_at && new Date(creative.starts_at).getTime() > now) return null;
  if (creative.ends_at && new Date(creative.ends_at).getTime() < now) return null;
  ```
  The `&&` short-circuits: null `starts_at` = active immediately, null `ends_at` = never expires, both null = always active. **No fix needed.**

### Master Toggle (ads_enabled)
- **Current value**: Stored in `business_settings` table, key `ads_enabled`
- **Effect on frontend**: ✅ **FIXED** — now blocks rendering when off
- **Where checked**: `src/lib/data/cms.ts:218` — `adPlacements` is now `(flagMap.ad_placements) && (settingMap.ads_enabled ?? true)`
- **How it works**: `getCmsToggles()` merges both the auto-managed `ad_placements` feature flag AND the manual `ads_enabled` setting. Both must be true for `cmsToggles.adPlacements` to be true. Default for `ads_enabled` is `true` (so no row = ads allowed; explicit `false` = ads blocked).
- **Cache invalidation**: PATCH `/api/admin/settings/business` revalidates `cms-toggles` tag (line 67)

### Image Rendering Quality
- **Leaderboard (970x90)**: ✅ **FIXED** — removed `maxHeight` constraint that clipped, reduced `rounded-2xl` (16px) to `rounded-lg` (8px)
- **Container sizing**: `maxWidth` constrains width; height flows naturally from `h-auto w-full`
- **Padding/spacing**: ✅ **FIXED** — added `py-4` to AdZone container for vertical breathing room
- **Responsive**: ✅ Working — `<picture>` tag with `<source media="(max-width: 639px)">` for mobile images

## Issues Fixed

1. **[Critical] Master toggle had no frontend effect** — `ads_enabled` was written to `business_settings` but `getCmsToggles()` only returned it as `adsEnabled`; frontend pages only checked `adPlacements`. Fixed: merged both conditions into `adPlacements` in `getCmsToggles()`.
   - File: `src/lib/data/cms.ts:218`

2. **[Critical] Ad container clipping** — `overflow-hidden` + `maxHeight: 90` + `rounded-2xl` (16px radius) on a 90px leaderboard clipped bottom corners. Fixed: removed `maxHeight`, reduced to `rounded-lg` (8px), added `py-4` spacing.
   - File: `src/components/public/cms/ad-zone.tsx:131-156`

3. **[Medium] Page Map empty state** — Zone assignment dropdown showed only "-- No ad (remove) --" when no active creatives existed, with no guidance. Fixed: shows dashed-border empty state with icon + "No ad creatives yet" + "Create New Ad" button.
   - File: `src/app/admin/website/ads/page.tsx:761-797`

4. **[Medium] Missing toggle guard on service detail sidebar** — `AdZone` rendered unconditionally without `cmsToggles.adPlacements &&` check. Fixed: added import of `getCmsToggles`, fetched in parallel with other data, wrapped AdZone with guard.
   - File: `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:24,68,214`

5. **[Medium] Missing toggle guard on product detail sidebar** — Same issue as #4. Fixed identically.
   - File: `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx:18,62,237`

## Remaining Issues (Not Fixed)

1. **[Low] Gallery `between_rows` zone not wired** — Defined in `PAGE_ZONES` but no `<AdZone>` placed in gallery page. Either wire it or remove from zone definitions.

2. **[Low] Booking `/book` sidebar zone not wired** — Defined in `PAGE_ZONES` but no `<AdZone>` in booking page. Either wire it or remove from zone definitions.

3. **[Low] No RPC functions for counter increments** — `increment_ad_impression` and `increment_ad_click` are called by API routes but never created in migrations. Code safely falls back to manual `UPDATE` (select count + set count+1), which works but isn't atomic under concurrency.

4. **[Low] Device targeting not implemented** — `ad_placements.device` column supports `all`/`desktop`/`mobile` but `AdZone` component ignores it entirely. All placements render on all devices.

5. **[Info] `themed_ad_creative_id` on seasonal_themes** — FK exists and admin theme editor can set it, but no frontend logic renders the themed ad during seasonal themes.

## Wiring Status Matrix

| Feature | DB | API | Admin UI | Frontend | Status |
|---------|:--:|:---:|:--------:|:--------:|--------|
| Create ad creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Upload image | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Edit/delete creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Set placement (zone) | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Schedule (start/end) | ✅ | ✅ | ✅ | ✅ | ✅ Complete (null = always) |
| Display on homepage | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) |
| Display on services | ✅ | ✅ | ✅ | ✅ | ✅ Complete (5 zones) |
| Display on products | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) |
| Display on gallery | ✅ | ✅ | ✅ | ⚠️ | ⚠️ 1 of 2 zones wired |
| Display on booking | ✅ | ✅ | ✅ | ❌ | ❌ Not wired |
| Sidebar (detail pages) | ✅ | ✅ | ✅ | ✅ | ✅ **FIXED** — guard added |
| Impression tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete (IP dedup) |
| Click tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Analytics dashboard | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Master toggle | ✅ | ✅ | ✅ | ✅ | ✅ **FIXED** — wired to frontend |
| Responsive images | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Device targeting | ✅ | ✅ | ✅ | ❌ | ❌ Not implemented |
| Themed ad (seasonal) | ✅ | ✅ | ✅ | ❌ | ❌ Not rendered |
| Counter increments | ❌ | ⚠️ | N/A | N/A | ⚠️ RPC missing, manual fallback |
