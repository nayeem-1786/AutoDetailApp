# Ad Management System Audit
Date: 2026-02-20

## Summary

Contrary to initial assumption, the ad management system is **substantially built and wired**. The database schema (3 tables), full CRUD API (14 routes), admin UI (3-tab management hub + creative editor), and public `AdZone` component are all functional. Ads are rendered on 7 of 8 defined pages. However, there are **6 issues** found: 2 missing page zones, 2 missing toggle guards, no RPC functions for atomic counter increments, and the seasonal-theme ad integration is admin-only with no frontend rendering.

## Database Schema

### Tables

**1. `ad_creatives`** — Ad creative assets
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| name | TEXT | NO | — | Display name |
| image_url | TEXT | NO | — | Desktop image (cms-assets bucket) |
| image_url_mobile | TEXT | YES | NULL | Mobile-optimized image |
| link_url | TEXT | YES | NULL | Click destination URL |
| alt_text | TEXT | YES | NULL | Accessibility text |
| ad_size | TEXT | NO | — | CHECK: 10 IAB sizes |
| starts_at | TIMESTAMPTZ | YES | NULL | Campaign start |
| ends_at | TIMESTAMPTZ | YES | NULL | Campaign end |
| is_active | BOOLEAN | NO | true | Master toggle |
| impression_count | INTEGER | NO | 0 | Denormalized counter |
| click_count | INTEGER | NO | 0 | Denormalized counter |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | Trigger-managed |

Valid `ad_size` values: `728x90`, `300x250`, `336x280`, `160x600`, `300x600`, `320x50`, `320x100`, `970x90`, `970x250`, `250x250`

Index: `idx_ad_creatives_active` on `is_active` WHERE `is_active = true`

**2. `ad_placements`** — Maps creatives to page zones
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| ad_creative_id | UUID | NO | — | FK → ad_creatives ON DELETE CASCADE |
| page_path | TEXT | NO | — | e.g., `/`, `/services` |
| zone_id | TEXT | NO | — | e.g., `below_hero`, `sidebar` |
| device | TEXT | NO | 'all' | CHECK: all/desktop/mobile |
| priority | INTEGER | NO | 0 | Higher = shown first |
| is_active | BOOLEAN | NO | true | |
| created_at | TIMESTAMPTZ | NO | now() | |
| updated_at | TIMESTAMPTZ | NO | now() | Trigger-managed |

Index: `idx_ad_placements_lookup` on `(page_path, zone_id, is_active)` WHERE `is_active = true`

**3. `ad_events`** — Impression/click event log (immutable)
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | UUID | NO | gen_random_uuid() | PK |
| ad_creative_id | UUID | NO | — | FK → ad_creatives ON DELETE CASCADE |
| ad_placement_id | UUID | YES | NULL | FK → ad_placements ON DELETE SET NULL |
| event_type | TEXT | NO | — | CHECK: impression/click |
| page_path | TEXT | YES | NULL | Denormalized for analytics |
| zone_id | TEXT | YES | NULL | Denormalized for analytics |
| ip_hash | TEXT | YES | NULL | SHA256 hash (impressions only) |
| created_at | TIMESTAMPTZ | NO | now() | |

Indexes: `idx_ad_events_creative` on `(ad_creative_id, event_type, created_at)`, `idx_ad_events_dedup` on `(ip_hash, ad_creative_id, created_at)` WHERE `event_type = 'impression'`

### RLS Policies
All 3 tables have RLS enabled:
- **ad_creatives**: Public SELECT where `is_active = true`; authenticated ALL
- **ad_placements**: Public SELECT where `is_active = true`; authenticated ALL
- **ad_events**: Public INSERT (unconditional); authenticated ALL

### Foreign Keys
- `ad_placements.ad_creative_id` → `ad_creatives(id)` ON DELETE CASCADE
- `ad_events.ad_creative_id` → `ad_creatives(id)` ON DELETE CASCADE
- `ad_events.ad_placement_id` → `ad_placements(id)` ON DELETE SET NULL
- `seasonal_themes.themed_ad_creative_id` → `ad_creatives(id)` ON DELETE SET NULL

### Migration File
`supabase/migrations/20260214000003_cms_ads.sql`

## API Routes

| Route | Method | Status | Notes |
|-------|--------|--------|-------|
| `/api/admin/cms/ads/creatives` | GET | ✅ Working | Lists all creatives, ordered by created_at DESC |
| `/api/admin/cms/ads/creatives` | POST | ✅ Working | Creates creative; requires `cms.ads.manage` |
| `/api/admin/cms/ads/creatives/[id]` | GET | ✅ Working | Single creative |
| `/api/admin/cms/ads/creatives/[id]` | PATCH | ✅ Working | Updates creative; whitelist-validated fields |
| `/api/admin/cms/ads/creatives/[id]` | DELETE | ✅ Working | Hard-delete + storage cleanup (best-effort) |
| `/api/admin/cms/ads/placements` | GET | ✅ Working | Lists all placements with joined creatives |
| `/api/admin/cms/ads/placements` | POST | ✅ Working | Creates placement; auto-enables feature flag |
| `/api/admin/cms/ads/placements/[id]` | GET | ✅ Working | Single placement with creative |
| `/api/admin/cms/ads/placements/[id]` | PATCH | ✅ Working | Updates placement; auto-toggles feature flag |
| `/api/admin/cms/ads/placements/[id]` | DELETE | ✅ Working | Hard-delete; auto-disables flag if no active remain |
| `/api/admin/cms/ads/zones` | GET | ✅ Working | PAGE_ZONES definitions + active placements |
| `/api/admin/cms/ads/analytics` | GET | ✅ Working | Period-based stats (7d/30d/90d/all) |
| `/api/public/cms/ads` | GET | ✅ Working | Public: fetch ad for zone (cached 5min, tag: cms-ads) |
| `/api/public/cms/ads/impression` | POST | ✅ Working | Record impression (IP dedup within 1hr) |
| `/api/public/cms/ads/click` | POST | ✅ Working | Record click (no dedup) |

All admin routes use `getEmployeeFromSession()` + `requirePermission('cms.ads.manage')` for write operations. All routes use `createAdminClient()` for DB access.

## Admin UI (/admin/website/ads)

### Sidebar Navigation
- Listed under Website section as "Ads" with `RectangleHorizontal` icon
- Requires `cms.ads.manage` permission

### Features Present
- **Master toggle**: Global enable/disable switch (writes to `business_settings.ads_enabled`)
- **3 tabs**: Creatives, Page Map, Analytics

### Creatives Tab
- Grid display of all ad creatives with thumbnails
- Per-creative active/inactive toggle (optimistic UI)
- Stats: impressions, clicks, CTR per creative
- "Create Ad" button → `/admin/website/ads/creatives/new`
- Inactive creatives shown at 60% opacity

### Page Map Tab
- All 8 pages with zones displayed in grouped sections
- Each zone shows current assignment (creative thumbnail + name or "No ad assigned")
- Assignment dialog: dropdown of active creatives, live preview, save/remove
- Creates/updates/deletes placements via API

### Analytics Tab
- Period selector: 7d, 30d, 90d, All Time
- 3 summary cards: Total Impressions, Total Clicks, Average CTR
- Top creatives table sorted by impressions DESC

### Creative Editor (/admin/website/ads/creatives/[id])
- **Name** (required)
- **Ad Size** dropdown (10 IAB sizes)
- **Desktop Image** (required for new; drag-drop upload to `cms-assets` bucket)
- **Mobile Image** (optional; separate upload)
- **Alt Text** (optional)
- **Click URL** (optional; opens in new tab)
- **Start/End Dates** (optional datetime pickers for scheduling)
- **Active toggle** with status badge
- **Live preview** (scaled to fit, shows actual dimensions)
- **Performance stats sidebar** (impressions, clicks, CTR — existing creatives only)
- **Delete** with confirmation dialog (hard-delete + storage cleanup)

### Image Upload
- ✅ Working — drag-drop or click-to-upload
- Accepted: JPEG, PNG, WebP, GIF (max 10MB)
- Storage: `cms-assets` bucket, path: `ad-creatives/{storageId}/{timestamp}.{ext}`
- Replace/Remove buttons on hover

### Save/Persist
- ✅ Working — validates name + image (for new), calls POST or PATCH API

## Frontend Rendering

### Ad Slot Component
- ✅ Exists: `src/components/public/cms/ad-zone.tsx`
- Client component (`'use client'`)
- Accepts optional server-preloaded data or fetches client-side
- IntersectionObserver fires impression after 50% visible for 1 second
- Click handler opens link in new tab + records click event
- Responsive `<picture>` tag with mobile/desktop image variants
- Returns `null` gracefully when no ad assigned

### Pages with AdZone Wired

| Page | Zone(s) | Toggle Guard | Status |
|------|---------|-------------|--------|
| Homepage (`/`) | below_hero, between_sections_1, above_cta | ✅ `cmsToggles.adPlacements` | ✅ Wired |
| Services Index (`/services`) | below_hero, above_cta | ✅ `cmsToggles.adPlacements` | ✅ Wired |
| Service Category (`/services/:slug`) | below_hero, above_cta | ✅ `cmsToggles.adPlacements` | ✅ Wired |
| Service Detail (`/services/:cat/:svc`) | sidebar | ❌ No toggle guard | ⚠️ Issue |
| Products Index (`/products`) | below_hero, above_cta | ✅ `cmsToggles.adPlacements` | ✅ Wired |
| Product Detail (`/products/:cat/:prod`) | sidebar | ❌ No toggle guard | ⚠️ Issue |
| Gallery (`/gallery`) | below_hero | ✅ `cmsToggles.adPlacements` | ✅ Wired |
| Gallery (`/gallery`) | between_rows | — | ❌ NOT wired |
| Booking (`/book`) | sidebar | — | ❌ NOT wired |

### Data Fetching
- ✅ Working: `getAdsForZone()` in `src/lib/data/cms.ts` — cached 5min with tag `cms-ads`
- Queries `ad_placements` → join `ad_creatives`, filters `is_active=true`, validates date range

## Image Storage

- **Bucket**: `cms-assets` (shared with other CMS assets)
- **Upload**: ✅ Working — drag-drop in creative editor
- **URL Persistence**: ✅ Working — stored in `ad_creatives.image_url` / `image_url_mobile`
- **Cleanup on Delete**: ✅ Working — best-effort storage removal via regex path extraction

## Feature Toggles

### Dual Toggle System
1. **`ad_placements` feature flag** (in `feature_flags` table)
   - Auto-enabled when first active placement created
   - Auto-disabled when last active placement deleted
   - Checked on frontend via `cmsToggles.adPlacements`
2. **`ads_enabled` business setting** (in `business_settings` table)
   - Manual toggle in admin UI header
   - Returned as `cmsToggles.adsEnabled` but **NOT checked on frontend**

**Default state**: Both off (false)

## Issues Found

1. **[Medium] Missing toggle guard on service detail page** — `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx:213` renders `<AdZone>` without `cmsToggles.adPlacements &&` check. Ad still won't display if no placement exists, but doesn't respect the global toggle.

2. **[Medium] Missing toggle guard on product detail page** — `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx:235` same issue as #1.

3. **[Low] Gallery `between_rows` zone not wired** — Zone is defined in `PAGE_ZONES` (`cms-zones.ts`) but no `<AdZone>` component is placed in `src/app/(public)/gallery/page.tsx` for this zone.

4. **[Low] Booking `/book` sidebar zone not wired** — Zone is defined in `PAGE_ZONES` as a desktop-only sidebar but no `<AdZone>` component exists in the booking page.

5. **[Low] No RPC functions for counter increments** — `increment_ad_impression` and `increment_ad_click` RPCs are referenced in API code but never created in any migration. Code falls back to manual `UPDATE` (fetch current count + set new count), which is safe but not atomic under concurrency.

6. **[Low] `ads_enabled` business setting not used on frontend** — `getCmsToggles()` returns `adsEnabled` but no public page checks it. Only `adPlacements` is checked. The admin master toggle switch sets `ads_enabled` but it has no effect on rendering. Either the frontend should check `adsEnabled` OR the toggle should control `ad_placements` instead.

7. **[Info] `themed_ad_creative_id` on seasonal_themes** — FK exists and admin theme editor can set it, but no frontend logic uses it to display a themed ad during seasonal themes. The field is stored but never consumed.

## Wiring Status Matrix

| Feature | DB | API | Admin UI | Frontend | Status |
|---------|:--:|:---:|:--------:|:--------:|--------|
| Create ad creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Upload image | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Edit/delete creative | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Set placement (assign to zone) | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Schedule ad (start/end dates) | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Display on homepage | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) |
| Display on services pages | ✅ | ✅ | ✅ | ✅ | ✅ Complete (5 zones) |
| Display on products pages | ✅ | ✅ | ✅ | ✅ | ✅ Complete (3 zones) |
| Display on gallery | ✅ | ✅ | ✅ | ⚠️ | ⚠️ 1 of 2 zones wired |
| Display on booking | ✅ | ✅ | ✅ | ❌ | ❌ Not wired |
| Sidebar ads (detail pages) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ Works but no toggle guard |
| Impression tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete (with IP dedup) |
| Click tracking | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Analytics dashboard | ✅ | ✅ | ✅ | N/A | ✅ Complete |
| Master toggle | ✅ | ✅ | ✅ | ❌ | ❌ UI toggle doesn't affect rendering |
| Responsive (mobile images) | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| Device targeting | ✅ | ✅ | ✅ | ❌ | ❌ AdZone doesn't filter by device |
| Themed ad (seasonal) | ✅ | ✅ | ✅ | ❌ | ❌ FK exists, not rendered |
| Atomic counter increments | ❌ | ⚠️ | N/A | N/A | ⚠️ RPC missing, manual fallback |

## Recommendations

1. **Add toggle guard to detail pages** — Wrap sidebar `<AdZone>` on service detail and product detail pages with `{cmsToggles.adPlacements && ...}` for consistency.

2. **Fix master toggle** — Either make frontend check `cmsToggles.adsEnabled` (in addition to `adPlacements`), or change the admin master toggle to control the `ad_placements` feature flag instead of `ads_enabled` setting.

3. **Wire gallery `between_rows` zone** — Add `<AdZone zoneId="between_rows" pagePath="/gallery" />` between photo grid rows, or remove the zone from PAGE_ZONES if not desired.

4. **Wire booking sidebar zone** — Add `<AdZone zoneId="sidebar" pagePath="/book" />` to the booking page sidebar (desktop only), or remove from PAGE_ZONES.

5. **Create RPC functions** — Add migration with `increment_ad_impression` and `increment_ad_click` RPCs for atomic counter increments under concurrency.

6. **Implement device targeting** — AdZone component currently ignores `ad_placements.device` field. Should check viewport and only render if device matches.

7. **[Optional] Implement themed ad rendering** — If seasonal themes should display a special ad, wire `themed_ad_creative_id` into the public theme rendering pipeline.
