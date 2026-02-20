# Performance Audit
Date: 2026-02-20
Method: Bundle analysis + static code analysis + dependency review

## Build Output
- Total static JS: 6.9 MB (.next/static/)
- Largest JS chunks (shared across admin/POS/public):
  | Chunk | Size | Contents |
  |-------|------|----------|
  | 0d9f24ec | 332 KB | react-hook-form (admin forms) |
  | 3b058dcb | 332 KB | react-hook-form (admin forms) |
  | e6e09d69 | 266 KB | Zod validation library |
  | c7c80415 | 253 KB | React core |
  | 961311cb | 218 KB | Unknown |
  | 539ba0d1 | 178 KB | Unknown |

Note: These large chunks are admin/POS dependencies that are NOT loaded on public pages.

## Identified Bottlenecks (ranked by impact)

### Critical (causes visible lag)

1. **ZERO next/image usage across entire public site** -- FIXED
2. **framer-motion loaded on EVERY page (~110KB+) via header** -- FIXED
3. **Middleware calls `supabase.auth.getUser()` on EVERY request** -- FIXED

### High (slows initial load)

4. **Large before/after images (1.26MB total, uncompressed PNGs)** -- FIXED
5. **AdZone components make client-side API calls** -- not fixed (acceptable: fire-and-forget pattern)
6. **Duplicate `getCmsToggles()` on homepage** -- not fixed (verified: uses `unstable_cache`, no real overhead)

### Medium (affects specific pages)

7. **ParticleCanvas bundled even when particles disabled** -- FIXED (dynamic import)
8. **23 'use client' components in public directory** -- acceptable (justified for interactivity)

## Fixes Applied

### 1. next/image conversion (Critical)
- **Added `images.remotePatterns`** to `next.config.ts` for Supabase storage URLs
- **Converted ALL public `<img>` to `<Image>`** across 11 files:
  - `header-client.tsx` — logo with `priority`
  - `footer-client.tsx` — logo
  - `hero-carousel.tsx` — hero images, video thumbnails, before/after with `fill`
  - `before-after-slider.tsx` — CTA slider images with `fill`
  - `service-card.tsx` — service images with `fill` + responsive `sizes`
  - `product-card.tsx` — product images with `fill` + responsive `sizes`
  - `ad-zone.tsx` — ad creative images
  - `cart-drawer.tsx` — product thumbnails
  - `(public)/page.tsx` — team photos, credentials
  - `products/[...]/page.tsx` — product detail with `priority`
  - `cart/page.tsx` — cart item thumbnails
  - `checkout/page.tsx` — order items, Stripe logo, carrier logos
  - `checkout/confirmation/page.tsx` — order item thumbnails
- **Impact**: Automatic WebP conversion (~50-70% size reduction), lazy loading by default, responsive sizing, optimized LCP

### 2. framer-motion removed from header (Critical)
- **Replaced all `motion.div` / `AnimatePresence`** in `header-client.tsx` with CSS transitions
  - Dropdown menus: CSS `opacity + translate-y + scale` with `pointer-events-none`
  - Mobile menu: CSS `grid-rows-[0fr]` → `grid-rows-[1fr]` transition
- **Result**: framer-motion no longer loaded on every page. Only loaded on pages that use animations (homepage, services, products)
- **Impact**: ~110KB JS removed from every page load

### 3. Middleware optimized for anonymous visitors (Critical)
- **Added auth cookie check** before calling `updateSession()` on public routes
- Anonymous visitors (no `sb-*` cookie) get `NextResponse.next()` immediately
- Logged-in users on public routes still get session refresh
- **Impact**: Eliminates 50-200ms Supabase auth round-trip for all anonymous visitors

### 4. Before/after images compressed (High)
- **Converted PNGs to WebP** with quality 80:
  - `before-after-old.png`: 636 KB → `before-after-old.webp`: 64 KB (90% reduction)
  - `before-after-new.png`: 621 KB → `before-after-new.webp`: 65 KB (90% reduction)
- **Total savings**: 1.26 MB → 129 KB (1.13 MB saved per homepage load)

### 5. ParticleCanvas dynamically imported (Medium)
- Changed from static `import` to `next/dynamic` with `ssr: false`
- Only loaded when seasonal theme has `particle_effect` enabled
- **Impact**: ~10KB JS removed when particles not active

## What Was Already Good (no changes needed)

- **Font loading**: `next/font/google` with `display: "swap"`
- **Data caching**: `unstable_cache` with revalidation tags throughout
- **ISR**: `revalidate = 60` on homepage, `300` on services/products
- **Lucide icons**: Tree-shaken individual imports
- **Stripe JS**: Only loaded on `/checkout`
- **Server Components**: Used properly throughout
- **Parallel data fetching**: `Promise.all()` used consistently

## Summary of Improvements

| Metric | Before | After |
|--------|--------|-------|
| Header JS (every page) | Includes ~110KB framer-motion | CSS transitions only |
| Before/after images | 1.26 MB (PNG) | 129 KB (WebP) |
| Image optimization | 0 next/image usage | All public images optimized |
| Middleware latency (anonymous) | 50-200ms auth call | 0ms (cookie check only) |
| ParticleCanvas | Always bundled (~10KB) | Loaded on demand |
