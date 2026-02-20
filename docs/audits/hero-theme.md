# Hero Section + Theme Color Readability — Complete Audit Report

## Part 1: Hero Section Implementation

### 1A: Database Schema

**Table: `hero_slides`** (migration `20260214000001_cms_hero_carousel.sql`)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID PK | NO | `gen_random_uuid()` |
| `title` | TEXT | YES | — |
| `subtitle` | TEXT | YES | — |
| `cta_text` | TEXT | YES | — |
| `cta_url` | TEXT | YES | — |
| `content_type` | TEXT | NO | `'image'` (CHECK: image/video/before_after) |
| `image_url` | TEXT | YES | — |
| `image_url_mobile` | TEXT | YES | — |
| `image_alt` | TEXT | YES | — |
| `video_url` | TEXT | YES | — |
| `video_thumbnail_url` | TEXT | YES | — |
| `before_image_url` | TEXT | YES | — |
| `after_image_url` | TEXT | YES | — |
| `before_label` | TEXT | YES | `'Before'` |
| `after_label` | TEXT | YES | `'After'` |
| `overlay_opacity` | INTEGER | NO | `50` (CHECK: 0–100) |
| `text_alignment` | TEXT | NO | `'left'` (CHECK: left/center/right) |
| `sort_order` | INTEGER | NO | `0` |
| `is_active` | BOOLEAN | NO | `true` |
| `created_at` | TIMESTAMPTZ | NO | `now()` |
| `updated_at` | TIMESTAMPTZ | NO | `now()` |

**Config**: `hero_carousel_config` stored in `business_settings` as JSONB:
```json
{ "mode": "single", "interval_ms": 5000, "transition": "fade", "pause_on_hover": true }
```

**KEY FINDING**: NO color fields exist on `hero_slides`. No `text_color`, `accent_color`, `overlay_color`, or `cta_bg_color`. All colors come from theme tokens.

---

### 1B: Admin Hero Slide Editor

**File**: `src/app/admin/website/hero/[id]/page.tsx`

**Fields available to admin:**
- Content Type tabs (Image / Video / Before/After)
- Title (text input)
- Subtitle (text input)
- CTA Text + CTA URL
- Text Alignment (left / center / right)
- Overlay Opacity (0–100 slider)
- Image Upload (desktop + mobile variants) via `HeroImageUpload`
- Video URL + Video Thumbnail
- Before/After Image uploads

**Fields NOT available:**
- Text color — NO
- Accent/highlight color — NO
- Overlay color (always black) — NO
- CTA button color — NO
- Background color (behind image) — NO

---

### 1C: Frontend Hero Components

**Three hero components exist:**

#### 1. `hero-carousel.tsx` (CMS Carousel) — `src/components/public/cms/hero-carousel.tsx`

| Element | Line(s) | CSS Classes / Tokens | Resolved Color (Dark Default) |
|---------|---------|---------------------|------------------------------|
| Section bg | 81 | `bg-brand-black` | `var(--brand-black)` → `#000000` |
| Headline (h1/p) | 179, 183 | `text-site-text` | `var(--site-text)` → `#ffffff` |
| Last word gradient | 25 | `text-gradient-lime` | gradient `var(--color-lime)` → `var(--color-lime-500)` = `#CCFF00` → `#A3CC00` |
| Subtitle | 193 | `text-site-text-secondary` | `var(--site-text-secondary)` → `#D1D5DB` |
| CTA button | 206 | `site-btn-cta` + `btn-lime-glow` | bg: `var(--site-btn-cta-bg)` → `var(--lime)` → `#CCFF00`, text: `var(--site-btn-cta-text)` → `#000000` |
| Overlay gradient | 155 | `bg-gradient-to-t from-black via-black/50 to-black/20` | **HARDCODED** black gradient |
| Overlay solid | 159 | `bg-black` | **HARDCODED** `#000000` |
| Nav arrows bg | 225, 233 | `bg-white/10` + `text-white` | **HARDCODED** white on translucent |
| Nav arrows hover | 225, 233 | `hover:bg-white/20 hover:border-lime/30` | Hardcoded white bg + theme lime border |
| Active indicator | 251 | `bg-lime` | `var(--lime)` → `#CCFF00` |
| Inactive indicator | 253 | `bg-white/30` | **HARDCODED** `rgba(255,255,255,0.3)` |
| Fallback bg (no image) | 139 | `bg-gradient-to-br from-brand-grey to-brand-black` | Theme tokens |
| Before label | 344 | `bg-black/70 text-white` | **HARDCODED** |
| After label | 352 | `bg-lime/90 text-site-text-on-primary` | Lime bg (theme), text-on-primary (theme) |
| B/A divider | 326 | `bg-lime` | Theme token |
| B/A handle | 327 | `bg-black border-lime` | Hardcoded black + theme lime |

**Overlay opacity formula** (lines 155–161):
- Gradient layer: `opacity: (overlayPct / 100) + 0.3` — ranges from 0.3 (min) to 1.3 (capped at 1.0)
- Solid layer: `opacity: (overlayPct / 100) * 0.5` — ranges from 0 to 0.5

At default `overlay_opacity=50`: gradient at 0.8 opacity, solid at 0.25 opacity. Effective overlay is very dark.

#### 2. `hero-section.tsx` (Static Hero) — `src/components/public/hero-section.tsx`

| Element | Line(s) | CSS Classes / Tokens | Resolved Color (Dark Default) |
|---------|---------|---------------------|------------------------------|
| Section bg | 14 | `bg-brand-black` | Theme token `#000000` |
| Headline | 19 | `text-site-text` | Theme token `#ffffff` |
| Review stars | 28, 34 | `fill-lime text-lime` | Theme token `#CCFF00` |
| Review rating | 29, 35 | `text-site-text` | Theme token `#ffffff` |
| Review text | 30, 36 | `text-site-text-muted` | Theme token `#9CA3AF` |
| Separator | 32 | `text-white/30` | **HARDCODED** `rgba(255,255,255,0.3)` |
| Description | 40 | `text-site-text-muted` | Theme token `#9CA3AF` |
| CTA button | 47–48 | `site-btn-cta` + `btn-lime-glow` | Theme tokens |
| Placeholder text | 68 | `text-white/30` | **HARDCODED** |

#### 3. `hero-client.tsx` (Before/After Wrapper) — `src/components/public/hero-client.tsx`

| Element | Line | CSS Classes | Resolved Color |
|---------|------|-------------|----------------|
| Info bar bg | 22 | `bg-white/10 text-white/80` | **HARDCODED** |
| Service name | 25 | `text-lime` | Theme token `#CCFF00` |

---

### 1D: Hero Data Flow

```
src/app/(public)/page.tsx
  ├─ getCmsToggles() → checks if heroCarousel feature is enabled
  ├─ If enabled:
  │    ├─ getHeroSlides() → hero_slides table (active, sorted)
  │    ├─ getHeroCarouselConfig() → business_settings
  │    └─ <HeroCarousel slides={slides} config={config} />
  │
  └─ If disabled:
       └─ <HeroSection /> (static hero, hardcoded content)
```

Homepage renders carousel OR static hero based on `cmsToggles.heroCarousel`. No other pages use hero components.

### 1E: Responsive Behavior

**Carousel (`hero-carousel.tsx`)**:
- Height: `min-h-[500px] sm:min-h-[600px] lg:min-h-[85vh]`
- Text sizes: `text-4xl sm:text-5xl lg:text-7xl xl:text-8xl` (headline)
- Subtitle: `text-base sm:text-lg lg:text-xl`
- Padding: `pb-16 sm:pb-24 lg:pb-32`
- Content max-width: `max-w-2xl` within `max-w-7xl` container
- Mobile images: `<picture>` with `image_url_mobile` srcset for `max-width: 639px`
- Nav arrows: always visible when carousel mode + multiple slides

**Static hero (`hero-section.tsx`)**:
- Side-by-side: 2-column grid on `lg:`, stacked on mobile
- Before/After slider: `hidden lg:block` — desktop only

---

## Part 2: Theme Color Variable System

### 2A: Complete CSS Variable Inventory

**Source**: `src/app/globals.css` `:root` block (lines 1–130)

#### Lime Accent Palette
| Variable | Default Value | Used By |
|----------|---------------|---------|
| `--lime` | `#CCFF00` | `bg-lime`, `text-lime`, `border-lime`, `fill-lime` |
| `--lime-50` | `#F5FFD6` | `bg-lime-50` |
| `--lime-100` | `#ECFF99` | `bg-lime-100` |
| `--lime-200` | `#DDFF4D` | `bg-lime-200` |
| `--lime-300` | `#CCFF00` | `bg-lime-300` |
| `--lime-400` | `#B8E600` | `bg-lime-400` |
| `--lime-500` | `#A3CC00` | `bg-lime-500`, `text-gradient-lime` endpoint |
| `--lime-600` | `#7A9900` | `bg-lime-600` |

#### Dark Brand Surfaces
| Variable | Default Value | Used By |
|----------|---------------|---------|
| `--brand-black` | `#000000` | `bg-brand-black` (page backgrounds, hero) |
| `--brand-dark` | `#0A0A0A` | `bg-brand-dark` (section alt backgrounds) |
| `--brand-darker` | `#111111` | `bg-brand-darker` |
| `--brand-grey` | `#1F2937` | `bg-brand-grey` |
| `--brand-grey-light` | `#374151` | `bg-brand-grey-light` |
| `--brand-surface` | `#1A1A1A` | `bg-brand-surface` (cards, modals) |

#### Site Text Hierarchy
| Variable | Default Value | WCAG vs #000000 | Usage |
|----------|---------------|-----------------|-------|
| `--site-text` | `#ffffff` | 21.0:1 ✅ AAA | Primary headings, body text |
| `--site-text-secondary` | `#D1D5DB` | 14.3:1 ✅ AAA | Subtitles, secondary content |
| `--site-text-muted` | `#9CA3AF` | 8.3:1 ✅ AAA | Descriptions, helper text |
| `--site-text-dim` | `#6B7280` | 4.4:1 ⚠️ AA large only | De-emphasized labels |
| `--site-text-faint` | `#4B5563` | 2.8:1 ❌ Fails AA | Decorative/disabled text |

#### Site Borders
| Variable | Default Value |
|----------|---------------|
| `--site-border` | `rgba(255,255,255,0.1)` |
| `--site-border-light` | `rgba(255,255,255,0.05)` |
| `--site-border-medium` | `rgba(255,255,255,0.2)` |

#### Site Header / Footer / Divider
| Variable | Default Value |
|----------|---------------|
| `--site-header-bg` | `#000000` |
| `--site-footer-bg` | `#0A0A0A` |
| `--site-divider` | `rgba(255,255,255,0.1)` |

#### Site Links
| Variable | Default Value |
|----------|---------------|
| `--site-link` | `var(--lime)` → `#CCFF00` |
| `--site-link-hover` | `var(--lime-200)` → `#DDFF4D` |

#### Button Tokens
| Variable | Default Value | Resolved |
|----------|---------------|----------|
| `--site-btn-primary-bg` | `var(--lime)` | `#CCFF00` |
| `--site-btn-primary-text` | `var(--site-text-on-primary)` | `#000000` |
| `--site-btn-primary-hover-bg` | `var(--lime-200)` | `#DDFF4D` |
| `--site-btn-primary-radius` | `9999px` | pill shape |
| `--site-btn-cta-bg` | `var(--lime)` | `#CCFF00` |
| `--site-btn-cta-text` | `var(--site-text-on-primary)` | `#000000` |
| `--site-btn-cta-hover-bg` | `var(--lime-200)` | `#DDFF4D` |
| `--site-btn-cta-radius` | `9999px` | pill shape |

#### Accent Glow
| Variable | Default Value |
|----------|---------------|
| `--theme-accent-glow-rgb` | `204, 255, 0` |
| `--site-text-on-primary` | `#000000` |

#### UI Context Variables (Layer 1: `:root` = admin light defaults, ~36 variables)
All `--ui-*` variables listed at `globals.css:94-129`. Overridden in `.public-theme` (Layer 2) and `.public-theme[data-user-theme="light"]` (Layer 3).

---

### 2B: ThemeProvider Variable Mapping

**File**: `src/components/public/cms/theme-provider.tsx`

#### `buildSiteThemeVars(st: SiteThemeSettings)` — Site theme settings → CSS vars

| DB Column (`site_theme_settings`) | CSS Variable Set | Tailwind Utility |
|----------------------------------|-----------------|-----------------|
| `color_page_bg` | `--brand-black` | `bg-brand-black` |
| `color_card_bg` | `--brand-surface` | `bg-brand-surface` |
| `color_section_alt_bg` | `--brand-dark` | `bg-brand-dark` |
| `color_header_bg` | `--site-header-bg` | `bg-site-header-bg` |
| `color_footer_bg` | `--site-footer-bg` | `bg-site-footer-bg` |
| `color_text_primary` | `--site-text` | `text-site-text` |
| `color_text_secondary` | `--site-text-secondary` | `text-site-text-secondary` |
| `color_text_muted` | `--site-text-muted` | `text-site-text-muted` |
| `color_primary` | `--lime` + `--lime-300` | `bg-lime`, `text-lime` |
| `color_primary_hover` | `--lime-200` | `bg-lime-200` |
| `color_accent` | `--lime-400` | `bg-lime-400` |
| `color_accent_hover` | `--lime-500` | `bg-lime-500` |
| `color_link` | `--site-link` | `text-site-link` |
| `color_link_hover` | `--site-link-hover` | `text-site-link-hover` |
| `color_text_on_primary` | `--site-text-on-primary` | `text-site-text-on-primary` |
| `color_border` | `--site-border` | `border-site-border` |
| `color_border_light` | `--site-border-light` | `border-site-border-light` |
| `color_divider` | `--site-divider` | `border-site-divider` |
| `font_family` | `--font-body` | `font-body` |
| `font_heading_family` | `--font-display` | `font-display` |
| `btn_primary_bg` | `--site-btn-primary-bg` | `.site-btn-primary` |
| `btn_primary_text` | `--site-btn-primary-text` | `.site-btn-primary` |
| `btn_primary_hover_bg` | `--site-btn-primary-hover-bg` | `.site-btn-primary:hover` |
| `btn_primary_radius` | `--site-btn-primary-radius` | `.site-btn-primary` |
| `btn_cta_bg` | `--site-btn-cta-bg` | `.site-btn-cta` |
| `btn_cta_text` | `--site-btn-cta-text` | `.site-btn-cta` |
| `btn_cta_hover_bg` | `--site-btn-cta-hover-bg` | `.site-btn-cta:hover` |
| `btn_cta_radius` | `--site-btn-cta-radius` | `.site-btn-cta` |

#### `buildSeasonalCssVars(theme: SeasonalTheme)` — Seasonal overrides → CSS vars

Maps `color_overrides` keys directly:
- Key `accent-glow-rgb` → `--theme-accent-glow-rgb`
- All other keys → `--{key}` (e.g., `lime` → `--lime`, `brand-dark` → `--brand-dark`)
- `body_bg_color` → `--brand-black`

#### Gradient overrides (via `<style>` injection):
- `hero` → `.bg-gradient-hero { background: ... !important; }`
- `cta` → `.bg-gradient-cta { background: ... !important; }`
- `brand` → `.bg-gradient-brand { background: ... !important; }`

---

### 2C: Seasonal Theme Preset Overrides

**File**: `src/lib/utils/cms-theme-presets.ts` — 8 presets

| Preset | `lime` (Primary) | `brand-dark` | `brand-surface` | `accent-glow-rgb` | Hero Gradient |
|--------|-----------------|-------------|----------------|-------------------|---------------|
| **Default** | `#CCFF00` | `#0A0A0A` | `#1A1A1A` | `204, 255, 0` | none |
| **Christmas** | `#dc2626` (red) | `#0a1a0a` | `#1a2a1a` | `220, 38, 38` | red→green |
| **Halloween** | `#ea580c` (orange) | `#1a0a1a` | `#2a1a2a` | `234, 88, 12` | orange→purple |
| **4th of July** | `#3b82f6` (blue) | `#0a0a1a` | `#1a1a2a` | `59, 130, 246` | navy→red |
| **Memorial Day** | `#1e40af` (navy) | `#0a0a14` | `#1a1a2a` | `30, 64, 175` | navy→red |
| **Presidents' Day** | `#ca8a04` (gold) | `#0a0a0f` | `#1a1a24` | `202, 138, 4` | navy→gold |
| **Valentine's Day** | `#ec4899` (pink) | `#120a10` | `#1f1019` | `236, 72, 153` | pink→rose |
| **Fall/Autumn** | `#d97706` (amber) | `#120a05` | `#1f1a10` | `217, 119, 6` | amber→red |
| **New Year** | `#eab308` (gold) | `#0a0a05` | `#1a1a10` | `234, 179, 8` | navy→gold |

Each preset also overrides the full lime palette (`lime-50` through `lime-600`) with tinted variants matching the accent color.

**Seasonal presets do NOT override**: `--site-text`, `--site-text-secondary`, `--site-text-muted`, `--site-btn-cta-text`, `--site-text-on-primary`. Text colors always stay at CSS defaults unless the admin explicitly changes them via Site Theme Settings.

---

### 2D: Theme Toggle (Dark/Light)

**File**: `src/components/public/theme-toggle.tsx`

The `ThemeToggle` component applies `LIGHT_VARS` (~50 properties) via `style.setProperty()` on the `.public-theme` wrapper when user switches to light mode.

**Key overrides in light mode:**

| Variable | Dark Default | Light Override |
|----------|-------------|----------------|
| `--brand-black` | `#000000` | `#ffffff` |
| `--brand-dark` | `#0A0A0A` | `#f8fafc` |
| `--brand-surface` | `#1A1A1A` | `#ffffff` |
| `--site-text` | `#ffffff` | `#0f172a` |
| `--site-text-secondary` | `#D1D5DB` | `#374151` |
| `--site-text-muted` | `#9CA3AF` | `#6b7280` |
| `--site-text-dim` | `#6B7280` | `#9ca3af` |
| `--site-text-faint` | `#4B5563` | `#d1d5db` |
| `--site-header-bg` | `#000000` | `#ffffff` |
| `--site-footer-bg` | `#0A0A0A` | `#f8fafc` |
| `--site-text-on-primary` | `#000000` | `#000000` (unchanged) |
| `--site-btn-primary-bg` | — | `#65a30d` |
| `--site-btn-cta-bg` | — | `#65a30d` |
| `--site-btn-cta-text` | — | `#ffffff` |
| `--theme-accent-glow-rgb` | `204, 255, 0` | `101, 163, 13` |

**Light mode does NOT override**: `--lime`, `--lime-200`, `--lime-500`, or any lime palette variable. The accent gradient and accent colors stay the same.

---

### 2E: Site Theme Presets (Admin)

**File**: `src/app/admin/website/theme-settings/_components/theme-defaults.ts`

5 presets available in Theme Settings admin:

| Preset | Page BG | Text | Primary Accent | Button Text |
|--------|---------|------|---------------|-------------|
| **Default Dark** | `#000000` | `#ffffff` | `#CCFF00` (lime) | `#000000` |
| **Clean Light** | `#ffffff` | `#111827` | `#2563EB` (blue) | `#ffffff` |
| **Midnight Blue** | `#0B1120` | `#ffffff` | `#38BDF8` (sky) | `#0B1120` |
| **Warm Dark** | `#120E08` | `#ffffff` | `#F59E0B` (amber) | `#120E08` |
| **Professional** | `#ffffff` | `#0F172A` | `#1E40AF` (navy) | `#ffffff` |

---

## Part 3: Color Readability Audit

### 3A: WCAG Contrast Ratio Calculations

**Standard**: WCAG 2.1 Level AA requires **4.5:1** for normal text, **3.0:1** for large text (≥18px or ≥14px bold).

#### Dark Mode Default (text on `#000000` background)

| Text Token | Hex | Contrast vs `#000000` | AA Normal | AA Large | Usage |
|------------|-----|----------------------|-----------|----------|-------|
| `--site-text` | `#ffffff` | **21.0:1** | ✅ Pass | ✅ Pass | Headings, primary body |
| `--site-text-secondary` | `#D1D5DB` | **14.3:1** | ✅ Pass | ✅ Pass | Subtitles |
| `--site-text-muted` | `#9CA3AF` | **8.3:1** | ✅ Pass | ✅ Pass | Descriptions |
| `--site-text-dim` | `#6B7280` | **4.4:1** | ⚠️ Fail | ✅ Pass | De-emphasized labels |
| `--site-text-faint` | `#4B5563` | **2.8:1** | ❌ Fail | ❌ Fail | Decorative/disabled |
| `--lime` | `#CCFF00` | **17.9:1** | ✅ Pass | ✅ Pass | Accent, highlights |
| `--lime-500` | `#A3CC00` | **13.2:1** | ✅ Pass | ✅ Pass | Gradient endpoint |

#### Dark Mode — Text on `#1A1A1A` (brand-surface, cards)

| Text Token | Hex | Contrast vs `#1A1A1A` | AA Normal | AA Large |
|------------|-----|----------------------|-----------|----------|
| `--site-text` | `#ffffff` | **18.3:1** | ✅ Pass | ✅ Pass |
| `--site-text-secondary` | `#D1D5DB` | **12.5:1** | ✅ Pass | ✅ Pass |
| `--site-text-muted` | `#9CA3AF` | **7.2:1** | ✅ Pass | ✅ Pass |
| `--site-text-dim` | `#6B7280` | **3.8:1** | ❌ Fail | ✅ Pass |
| `--site-text-faint` | `#4B5563` | **2.4:1** | ❌ Fail | ❌ Fail |

#### Light Mode — Text on `#ffffff` (page background)

| Text Token | Light Hex | Contrast vs `#ffffff` | AA Normal | AA Large |
|------------|-----------|----------------------|-----------|----------|
| `--site-text` | `#0f172a` | **16.9:1** | ✅ Pass | ✅ Pass |
| `--site-text-secondary` | `#374151` | **10.1:1** | ✅ Pass | ✅ Pass |
| `--site-text-muted` | `#6b7280` | **4.8:1** | ✅ Pass | ✅ Pass |
| `--site-text-dim` | `#9ca3af` | **2.7:1** | ❌ Fail | ❌ Fail |
| `--site-text-faint` | `#d1d5db` | **1.6:1** | ❌ Fail | ❌ Fail |

#### Button Contrast (CTA / Primary)

| Theme | Button BG | Button Text | Contrast | Pass? |
|-------|-----------|-------------|----------|-------|
| **Default Dark** | `#CCFF00` | `#000000` | **17.9:1** | ✅ |
| **Light Mode** | `#65a30d` | `#ffffff` | **3.6:1** | ⚠️ AA large only |
| **Christmas** | `#dc2626` | `#000000` | **5.6:1** | ✅ |
| **Halloween** | `#ea580c` | `#000000` | **5.8:1** | ✅ |
| **4th of July** | `#3b82f6` | `#000000` | **5.5:1** | ✅ |
| **Memorial Day** | `#1e40af` | `#000000` | **2.3:1** | ❌ FAIL |
| **Presidents' Day** | `#ca8a04` | `#000000` | **7.1:1** | ✅ |
| **Valentine's Day** | `#ec4899` | `#000000` | **5.8:1** | ✅ |
| **Fall/Autumn** | `#d97706` | `#000000` | **7.1:1** | ✅ |
| **New Year** | `#eab308` | `#000000` | **11.5:1** | ✅ |

---

### 3B: Specific Readability Problems

#### CRITICAL: Hero Carousel in Light Mode

**File**: `src/components/public/cms/hero-carousel.tsx:155,159,179,183`

**Problem**: The overlay is **hardcoded black** (`from-black via-black/50 to-black/20` + `bg-black`), but the text color (`text-site-text`) follows the theme token. In light mode, `--site-text` becomes `#0f172a` (dark navy).

**Result**: Dark text on dark overlay = **effectively invisible text**.

| Element | Class | Dark Mode | Light Mode |
|---------|-------|-----------|------------|
| Headline | `text-site-text` | `#ffffff` on black overlay ✅ | `#0f172a` on black overlay ❌ |
| Subtitle | `text-site-text-secondary` | `#D1D5DB` on black overlay ✅ | `#374151` on black overlay ❌ |
| CTA text | `site-btn-cta` text | `#000000` on lime ✅ | `#ffffff` on `#65a30d` ⚠️ |

**Fix needed**: Either (a) force hero text to `text-white` regardless of theme, (b) make overlay color theme-aware, or (c) disable theme toggle effects inside the hero section.

#### MODERATE: Memorial Day CTA Button

**Problem**: Memorial Day seasonal preset sets `--lime` to `#1e40af` (dark navy). The CTA button uses `--site-btn-cta-bg: var(--lime)` and `--site-btn-cta-text: var(--site-text-on-primary)` = `#000000`. Black text on dark navy = **2.3:1 contrast ratio**.

**Affected**: All `site-btn-cta` and `site-btn-primary` buttons site-wide during Memorial Day theme.

**Fix needed**: Memorial Day preset should also override `--site-text-on-primary` to `#ffffff`.

#### MODERATE: Memorial Day `text-gradient-lime`

**File**: `src/components/public/cms/hero-carousel.tsx:25`

**Problem**: `text-gradient-lime` creates a gradient from `var(--color-lime)` to `var(--color-lime-500)`. During Memorial Day, this becomes `#1e40af` → `#1d4ed8` — a dark navy gradient on a dark overlay. Very low visibility.

**Also affects**: Any element using `text-lime`, `bg-lime`, `border-lime` during Memorial Day will be dark navy — hard to see on dark backgrounds.

#### LOW: `--site-text-faint` Below WCAG AA

**Global issue**: `--site-text-faint` fails AA in both dark mode (2.8:1 vs `#000000`) and light mode (1.6:1 vs `#ffffff`). Used for decorative/disabled text so this may be intentional, but any content-bearing text using `text-site-text-faint` is inaccessible.

#### LOW: `--site-text-dim` Below AA for Normal Text

**Issue**: `--site-text-dim` at 4.4:1 (dark) and 2.7:1 (light) fails AA for normal-sized text. Only passes AA for large text (≥18px or ≥14px bold).

#### LOW: Light Mode CTA Button

**Issue**: Light mode overrides CTA button to `bg: #65a30d`, `text: #ffffff`. Contrast ratio 3.6:1 — passes AA for large text but fails for normal text. Since CTA buttons typically use bold uppercase at 14px+, this borderline passes but could be improved.

---

### 3C: Hardcoded Colors That Bypass Theme System

These elements use hardcoded colors and will NOT respond to any theme override:

| File | Line | Element | Class | Issue |
|------|------|---------|-------|-------|
| `hero-carousel.tsx` | 155 | Overlay gradient | `from-black via-black/50 to-black/20` | Always black regardless of theme |
| `hero-carousel.tsx` | 159 | Overlay solid | `bg-black` | Always black regardless of theme |
| `hero-carousel.tsx` | 225,233 | Nav arrows | `bg-white/10 text-white` | Always white |
| `hero-carousel.tsx` | 253 | Inactive indicators | `bg-white/30` | Always white |
| `hero-carousel.tsx` | 344 | Before label | `bg-black/70 text-white` | Always black/white |
| `hero-section.tsx` | 32 | Review separator | `text-white/30` | Always white |
| `hero-section.tsx` | 68 | Placeholder text | `text-white/30` | Always white |
| `hero-client.tsx` | 22 | Info bar | `bg-white/10 text-white/80` | Always white |

**Note**: Most of these hardcoded whites are intentional (overlaid on images/dark overlays where theme tokens would break). The overlay colors being hardcoded black is the main concern — they don't adapt to light mode or non-dark site themes.

---

## Part 4: Summary Report

### 4A: Hero Section Capabilities

| Capability | Status | Notes |
|-----------|--------|-------|
| Admin can set hero title/subtitle | **YES** | Per-slide text input |
| Admin can set CTA text/URL | **YES** | Per-slide |
| Admin can choose content type | **YES** | Image, video, before/after |
| Admin can upload images (desktop+mobile) | **YES** | Via `HeroImageUpload` component |
| Admin can set overlay opacity | **YES** | 0–100 slider |
| Admin can set text alignment | **YES** | Left/center/right |
| Admin can control text color | **NO** | Follows theme tokens only |
| Admin can control accent/highlight color | **NO** | Follows `--lime` (theme) |
| Admin can control overlay color | **NO** | Always black |
| Admin can control CTA button color | **NO** | Follows site theme button tokens |
| Admin can set per-slide background color | **NO** | Only fallback gradient when no image |
| Admin can configure carousel mode | **YES** | Single/carousel in hero config |
| Admin can set auto-advance interval | **YES** | In hero config |
| Admin can toggle pause-on-hover | **YES** | In hero config |

### 4B: Theme Variable Hierarchy

```
Priority (lowest → highest):

1. CSS `:root` defaults (globals.css)
   └─ --lime: #CCFF00, --site-text: #ffffff, --brand-black: #000000, etc.

2. .public-theme overrides (globals.css)
   └─ --ui-* variables: dark mode values for public pages

3. Site Theme Settings (DB: site_theme_settings)
   └─ buildSiteThemeVars() → sets --brand-black, --lime, --site-text, etc.
   └─ Applied by ThemeProvider on wrapper <div> style attribute

4. Seasonal Theme Overrides (DB: seasonal_themes)
   └─ buildSeasonalCssVars() → sets --lime, --brand-dark, --brand-surface, etc.
   └─ Layered ON TOP of site theme (Object.assign merge)
   └─ Also injects gradient overrides via <style> tag

5. User Theme Toggle (localStorage)
   └─ LIGHT_VARS applied via style.setProperty() on .public-theme element
   └─ Overrides ALL: --brand-black, --site-text, --ui-*, buttons, etc.
   └─ Does NOT override: --lime palette (accent colors stay the same)
```

### 4C: Readability Issues Ranked

| # | Severity | Issue | Affected Users | File:Line |
|---|----------|-------|---------------|-----------|
| 1 | **CRITICAL** | Hero text invisible in light mode | All light-mode users | `hero-carousel.tsx:155-161,179,183,193` |
| 2 | **MODERATE** | Memorial Day CTA button: black on navy (2.3:1) | Users during Memorial Day theme | `cms-theme-presets.ts:121` (preset missing `--site-text-on-primary` override) |
| 3 | **MODERATE** | Memorial Day accent unreadable on dark backgrounds | Users during Memorial Day theme | `cms-theme-presets.ts:122` (`lime` = `#1e40af`) |
| 4 | **LOW** | Light mode CTA button borderline (3.6:1) | Light-mode users | `theme-toggle.tsx:40-41` |
| 5 | **LOW** | `text-site-text-faint` fails AA everywhere | Decorative; may be intentional | `globals.css:54` |
| 6 | **LOW** | `text-site-text-dim` fails AA for normal text | Informational labels | `globals.css:53` |

### 4D: Affected Files

**Would need modification to fix Issue #1 (hero light mode):**
- `src/components/public/cms/hero-carousel.tsx` — hero text and overlay classes

**Would need modification to fix Issue #2-3 (Memorial Day):**
- `src/lib/utils/cms-theme-presets.ts` — Memorial Day preset `colorOverrides`

**Would need modification to fix Issue #4 (light mode CTA):**
- `src/components/public/theme-toggle.tsx` — `LIGHT_VARS` CTA button values

**Read-only context files (no changes needed):**
- `src/app/globals.css` — CSS variable definitions
- `src/components/public/cms/theme-provider.tsx` — variable mapping logic
- `src/app/admin/website/hero/[id]/page.tsx` — hero slide editor
- `src/app/admin/website/theme-settings/_components/theme-defaults.ts` — site theme presets
- `src/components/public/hero-section.tsx` — static hero (no overlay issues)
- `src/components/public/hero-client.tsx` — before/after wrapper (hardcoded but correct)
- `src/app/(public)/page.tsx` — homepage (passes data, no color logic)
- `src/lib/supabase/types.ts` — type definitions
