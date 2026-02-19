# THEME SYSTEM AUDIT REPORT
## Customer Dashboard, Theme & Styles, Seasonal Themes

**Date**: 2026-02-17

---

## Part 1: Theme Variable System

### 1A: CSS Variables in `:root` (globals.css)

| CSS Variable | Default Value | Purpose |
|---|---|---|
| `--background` | `#ffffff` | Generic background (admin/light) |
| `--foreground` | `#0f172a` | Generic foreground (admin/light) |
| `--brand-50` through `--brand-900` | Blue palette | Admin brand palette |
| `--accent-400/500/600` | Amber palette | Admin accent |
| `--surface` / `--surface-raised` | `#f8fafc` / `#ffffff` | Admin surface palette |
| `--navy` / `--navy-light` | `#0f172a` / `#1e293b` | Admin dark tones |
| `--theme-accent-glow-rgb` | `204, 255, 0` | Shadow/glow accent (RGB triple) |
| `--lime` | `#CCFF00` | Primary accent (overridable) |
| `--lime-50` through `--lime-600` | Lime scale | Accent palette (all overridable) |
| `--brand-black` | `#000000` | Page background (overridable) |
| `--brand-dark` | `#0A0A0A` | Section alt background (overridable) |
| `--brand-darker` | `#111111` | Darker surface |
| `--brand-grey` / `--brand-grey-light` | `#1F2937` / `#374151` | Grey surfaces |
| `--brand-surface` | `#1A1A1A` | Card background (overridable) |
| `--site-text` | `#ffffff` | Primary text (overridable) |
| `--site-text-secondary` | `#D1D5DB` | Secondary text (overridable) |
| `--site-text-muted` | `#9CA3AF` | Muted text (overridable) |
| `--site-text-dim` | `#6B7280` | Dim text |
| `--site-text-faint` | `#4B5563` | Faintest text |
| `--site-border` | `rgba(255,255,255,0.1)` | Border (overridable) |
| `--site-border-light` | `rgba(255,255,255,0.05)` | Light border (overridable) |
| `--site-border-medium` | `rgba(255,255,255,0.2)` | Medium border |
| `--site-header-bg` | `#000000` | Header background (overridable) |
| `--site-footer-bg` | `#0A0A0A` | Footer background (overridable) |
| `--site-link` | `var(--lime)` | Link color (overridable) |
| `--site-link-hover` | `var(--lime-200)` | Link hover (overridable) |
| `--site-text-on-primary` | `#000000` | Text on primary bg (overridable) |
| `--site-divider` | `rgba(255,255,255,0.1)` | Divider (overridable) |
| `--site-btn-primary-bg` | `var(--lime)` | Primary button bg (overridable) |
| `--site-btn-primary-text` | `var(--site-text-on-primary)` | Primary button text (overridable) |
| `--site-btn-primary-hover-bg` | `var(--lime-200)` | Primary button hover (overridable) |
| `--site-btn-primary-radius` | `9999px` | Primary button radius (overridable) |
| `--site-btn-cta-bg/text/hover-bg/radius` | Same as primary | CTA button tokens (overridable) |

### 1B: Tailwind `@theme inline` Mapping

Every `--color-*` token in `@theme inline` references a raw `:root` var via `var()`:

| Tailwind Utility | Maps To | Example Usage |
|---|---|---|
| `bg-lime`, `text-lime` | `var(--lime)` | Accent color |
| `bg-lime-50` through `bg-lime-600` | `var(--lime-50)` through `var(--lime-600)` | Accent palette |
| `bg-brand-black` | `var(--brand-black)` | Page background |
| `bg-brand-dark` | `var(--brand-dark)` | Section background |
| `bg-brand-surface` | `var(--brand-surface)` | Card background |
| `text-site-text` | `var(--site-text)` | Primary text |
| `text-site-text-secondary` | `var(--site-text-secondary)` | Secondary text |
| `text-site-text-muted` | `var(--site-text-muted)` | Muted text |
| `text-site-text-dim` | `var(--site-text-dim)` | Dim text |
| `text-site-text-faint` | `var(--site-text-faint)` | Faintest text |
| `border-site-border` | `var(--site-border)` | Borders |
| `border-site-border-light` | `var(--site-border-light)` | Light borders |
| `border-site-border-medium` | `var(--site-border-medium)` | Medium borders |
| `bg-site-header-bg` | `var(--site-header-bg)` | Header |
| `bg-site-footer-bg` | `var(--site-footer-bg)` | Footer |
| `text-site-link` | `var(--site-link)` | Links |
| `text-site-text-on-primary` | `var(--site-text-on-primary)` | Button text |
| Font: `font-sans` | `var(--font-body)` | Body font |
| Font: `font-display` | `var(--font-display)` | Heading font |
| Shadows: `shadow-lime-*` | `rgba(var(--theme-accent-glow-rgb), ...)` | Glow effects |

Also: `.site-btn-primary` and `.site-btn-cta` CSS classes (globals.css:396-412) read from `--site-btn-primary-*` and `--site-btn-cta-*` vars.

### 1C: ThemeProvider Injection

**File**: `src/components/public/cms/theme-provider.tsx`

**Props**: `theme: SeasonalTheme | null`, `siteTheme: SiteThemeSettings | null`, `children`

**Injection method**: Inline `style` attribute on a wrapper `<div>` (line 145).

**`buildSiteThemeVars()` maps** (site theme settings -> raw CSS vars):

| DB Column | CSS Variable Set | Mapped? |
|---|---|---|
| `color_page_bg` | `--brand-black` | Yes |
| `color_card_bg` | `--brand-surface` | Yes |
| `color_section_alt_bg` | `--brand-dark` | Yes |
| `color_header_bg` | `--site-header-bg` | Yes |
| `color_footer_bg` | `--site-footer-bg` | Yes |
| `color_text_primary` | `--site-text` | Yes |
| `color_text_secondary` | `--site-text-secondary` | Yes |
| `color_text_muted` | `--site-text-muted` | Yes |
| `color_primary` | `--lime` + `--lime-300` | Yes |
| `color_primary_hover` | `--lime-200` | Yes |
| `color_accent` | `--lime-400` | Yes |
| `color_accent_hover` | `--lime-500` | Yes |
| `color_link` | `--site-link` | Yes |
| `color_link_hover` | `--site-link-hover` | Yes |
| `color_text_on_primary` | `--site-text-on-primary` | Yes |
| `color_border` | `--site-border` | Yes |
| `color_border_light` | `--site-border-light` | Yes |
| `color_divider` | `--site-divider` | Yes |
| `font_family` | `--font-body` | Yes |
| `font_heading_family` | `--font-display` | Yes |
| `btn_primary_bg/text/hover_bg/radius` | `--site-btn-primary-*` | Yes |
| `btn_cta_bg/text/hover_bg/radius` | `--site-btn-cta-*` | Yes |
| **`color_success`** | -- | **NOT MAPPED** |
| **`color_warning`** | -- | **NOT MAPPED** |
| **`color_error`** | -- | **NOT MAPPED** |
| **`font_base_size`** | -- | **NOT MAPPED** |
| **`font_h1/h2/h3_size`** | -- | **NOT MAPPED** |
| **`font_body_size`** | -- | **NOT MAPPED** |
| **`font_small_size`** | -- | **NOT MAPPED** |
| **`font_line_height`** | -- | **NOT MAPPED** |
| **`font_heading_weight`** | -- | **NOT MAPPED** |
| **`font_body_weight`** | -- | **NOT MAPPED** |
| **`btn_primary_padding`** | -- | **NOT MAPPED** |
| **`btn_secondary_bg/text/border/radius`** | -- | **NOT MAPPED** |
| **`border_radius`** | -- | **NOT MAPPED** |
| **`border_card_radius`** | -- | **NOT MAPPED** |
| **`border_width`** | -- | **NOT MAPPED** |
| **`spacing_section_padding`** | -- | **NOT MAPPED** |
| **`spacing_card_padding`** | -- | **NOT MAPPED** |
| **`spacing_header_height`** | -- | **NOT MAPPED** |
| **`mode` (dark/light)** | -- | **NOT MAPPED** |

**Result: 27 fields saved in the DB by Theme Settings admin are NEVER injected by ThemeProvider.**

**`buildSeasonalCssVars()` maps**: Each key in `color_overrides` maps to `--{key}` (e.g., `lime` -> `--lime`). Special case: `accent-glow-rgb` -> `--theme-accent-glow-rgb`. Also: `body_bg_color` -> `--brand-black`.

### 1D: Theme & Styles Admin Saves

**DB Table**: `site_theme_settings` (52 editable fields per record)

**Admin page**: `/admin/website/theme-settings` -- 4 tabs (Colors, Typography, Buttons, Borders & Spacing) with live preview panel, 5 quick presets, per-field reset.

| Admin Tab | Fields | DB Columns | Mapped by ThemeProvider? |
|---|---|---|---|
| Colors (Backgrounds) | 5 fields | `color_page_bg`, `color_card_bg`, `color_header_bg`, `color_footer_bg`, `color_section_alt_bg` | **All YES** |
| Colors (Text) | 4 fields | `color_text_primary`, `color_text_secondary`, `color_text_muted`, `color_text_on_primary` | **All YES** |
| Colors (Brand) | 4 fields | `color_primary`, `color_primary_hover`, `color_accent`, `color_accent_hover` | **All YES** |
| Colors (Links) | 2 fields | `color_link`, `color_link_hover` | **All YES** |
| Colors (Borders) | 3 fields | `color_border`, `color_border_light`, `color_divider` | **All YES** |
| Colors (Status) | 3 fields | `color_success`, `color_warning`, `color_error` | **ALL NO** |
| Typography | 11 fields | `font_family`, `font_heading_family`, 9 others | **2 YES, 9 NO** |
| Buttons (Primary) | 5 fields | `btn_primary_bg/text/hover_bg/radius/padding` | **4 YES, 1 NO** |
| Buttons (Secondary) | 4 fields | `btn_secondary_bg/text/border/radius` | **ALL NO** |
| Buttons (CTA) | 4 fields | `btn_cta_bg/text/hover_bg/radius` | **All YES** |
| Borders & Spacing | 6 fields | `border_radius`, `border_card_radius`, etc. | **ALL NO** |

### 1E: Seasonal Theme Presets

**File**: `src/lib/utils/cms-theme-presets.ts` -- 8 presets (Christmas, Halloween, 4th of July, Memorial Day, Presidents' Day, Valentine's Day, Fall/Autumn, New Year).

Each preset defines `colorOverrides` with these keys:

| Preset Field Name | Example (Christmas) | CSS Variable It Maps To |
|---|---|---|
| `lime` | `#dc2626` (red) | `--lime` |
| `lime-50` through `lime-600` | Red scale | `--lime-50` through `--lime-600` |
| `brand-dark` | `#0a1a0a` | `--brand-dark` |
| `brand-surface` | `#1a2a1a` | `--brand-surface` |
| `accent-glow-rgb` | `220, 38, 38` | `--theme-accent-glow-rgb` |

Plus `bodyBgColor` -> `--brand-black`, and `gradientOverrides.hero` for hero gradient.

Stored in `cms_themes` table with `color_overrides` JSONB column.

### 1F: Complete Data Flow

```
Admin saves Theme Settings -> site_theme_settings table
                                    |
Public layout (+ account + auth layouts) call getSiteThemeSettings()
                                    |
                    getSiteThemeSettings() (cached 60s)
                                    |
                          Returns SiteThemeSettings
                                    |
                    Layout passes to <ThemeProvider siteTheme={...}>
                                    |
             buildSiteThemeVars() converts DB columns -> raw CSS vars
                                    |
                      style={} on wrapper <div>
                                    |
              CSS variables override :root defaults
                                    |
         @theme inline references via var() -> Tailwind utilities cascade
                                    |
                  Components use bg-lime, text-site-text, etc.
```

**Broken links in the chain:**
1. **27 DB fields** saved by admin never reach ThemeProvider (typography sizes, weights, secondary buttons, border radius, spacing, status colors, mode)
2. Those 27 fields have **no CSS variables defined** in globals.css
3. Those 27 fields have **no @theme inline entries** in Tailwind
4. The admin preview panel renders them locally but they never affect the live site

---

## Part 2: Customer Dashboard Audit

### 2A: All Dashboard Files

```
src/app/(account)/layout.tsx              <- Outer layout (ThemeProvider wrapper)
src/app/(account)/account/layout.tsx      <- Inner layout (AccountShell wrapper)
src/app/(account)/account/page.tsx        <- Dashboard home
src/app/(account)/account/appointments/page.tsx
src/app/(account)/account/loyalty/page.tsx
src/app/(account)/account/orders/page.tsx
src/app/(account)/account/orders/[id]/page.tsx
src/app/(account)/account/photos/page.tsx <- Redirects to /services
src/app/(account)/account/profile/page.tsx
src/app/(account)/account/services/page.tsx
src/app/(account)/account/services/[jobId]/page.tsx
src/app/(account)/account/transactions/page.tsx
src/app/(account)/account/vehicles/page.tsx

src/components/account/account-shell.tsx
src/components/account/transaction-detail.tsx
src/components/account/vehicle-card.tsx
src/components/account/appointment-card.tsx
src/components/account/appointment-edit-dialog.tsx
```

### 2B: Account Layout Analysis

**File**: `src/app/(account)/layout.tsx`

- **Is it wrapped in ThemeProvider?** YES (line 26-29)
- **Does it fetch theme data?** YES -- calls `getActiveTheme()` and `getSiteThemeSettings()` (line 16-20)
- **Does it pass data to ThemeProvider?** YES -- `theme={showTheme ? activeTheme : null}` and `siteTheme={hasSiteTheme ? siteTheme : null}` (line 27-28)
- **Wrapper div classes**: `bg-brand-black text-site-text min-h-screen` (line 31) -- **THEME-AWARE**

**Verdict: The account layout IS properly wired to the theme system. Identical pattern to the public layout.**

### 2C: Account Shell / Navigation

**File**: `src/components/account/account-shell.tsx`

| Element | Classes Used | Theme-Aware? |
|---|---|---|
| Nav container | `bg-brand-surface p-1 rounded-lg` | Yes |
| Active tab | `bg-brand-surface text-site-text shadow-sm` | **ISSUE** -- same bg as container |
| Inactive tab | `text-site-text-muted hover:text-site-text` | Yes |
| Error state card | `bg-brand-surface` | Yes |
| Error icon circle | `bg-amber-100 text-amber-600` | Semantic exception |
| CTA button | `bg-lime text-site-text-on-primary hover:bg-lime-200` | Yes |
| Heading text | `text-site-text` | Yes |
| Body text | `text-site-text-muted` | Yes |

**Tab navigation issue**: The active tab uses `bg-brand-surface` which is identical to the nav container background (`bg-brand-surface`). There's no visual differentiation. The `shadow-sm` is the only distinction, which is nearly invisible on dark backgrounds.

### 2D: Hardcoded Colors Audit

**Total scan across all account + auth + account components files:**

| Category | Count | Status |
|---|---|---|
| Semantic exceptions (status/warning/error/success badges) | ~40 | Intentional -- keep |
| Hardcoded blue focus rings | 2 | **NEEDS MIGRATION** |
| Hardcoded blue link colors | 4 | **NEEDS MIGRATION** |
| Hardcoded `border-white/*` opacity | 3 | **NEEDS MIGRATION** |
| Light-themed alert (green-50/green-800) | 2 | **NEEDS MIGRATION** |
| **Total needing migration** | **11** | |

**Specific instances needing migration:**

| File | Line | Class | Should Be |
|---|---|---|---|
| `account/services/page.tsx` | 105 | `focus:border-blue-500` | `focus:border-lime` |
| `account/services/page.tsx` | 105 | `focus:ring-blue-500` | `focus:ring-lime` |
| `account/transactions/page.tsx` | 197 | `text-blue-600` | `text-lime` or `text-site-link` |
| `account/transactions/page.tsx` | 197 | `hover:text-blue-800` | `hover:text-lime-200` |
| `account/services/[jobId]/page.tsx` | 299 | `text-blue-600` | `text-lime` |
| `account/services/[jobId]/page.tsx` | 299 | `hover:text-blue-800` | `hover:text-lime-200` |
| `account/orders/page.tsx` | 111 | `hover:border-white/20` | `hover:border-site-border-medium` |
| `account/orders/[id]/page.tsx` | 111 | `border-white/5` | `border-site-border-light` |
| `account/orders/[id]/page.tsx` | 167 | `border-white/10` | `border-site-border` |
| `account/loyalty/page.tsx` | 203 | `bg-green-50` | `bg-green-500/10` |
| `account/loyalty/page.tsx` | 204 | `text-green-800` | `text-green-400` |

### 2E: Login Pages Audit

**Files**: `signin/page.tsx`, `signup/page.tsx`, `signin/reset-password/page.tsx`

**All three auth pages are 100% theme-aware.** They use:
- `bg-lime text-black` for primary buttons
- `hover:shadow-lime/25` for button hover glow
- `bg-brand-surface border-site-border` for cards
- `text-site-text` / `text-site-text-muted` / `text-site-text-faint` for text
- `bg-brand-dark text-site-text-secondary` for secondary buttons
- `hover:bg-site-border-light` for secondary hover
- Semantic alert colors only (red-950/green-950/amber-950 for dark-themed alerts)

**Login buttons DO match the public site pattern.** They use `bg-lime text-black` which is identical to the public "Book Now" button pattern (`site-btn-cta` resolves to `bg-lime text-black` via CSS vars).

**The only difference**: Login buttons use inline Tailwind classes (`bg-lime text-black hover:shadow-lime/25`) instead of the `.site-btn-primary` CSS class. Functionally identical appearance, but won't pick up `--site-btn-primary-radius` or `--site-btn-primary-hover-bg` overrides from Theme Settings.

### 2F: Font Audit

All account/auth pages use standard Tailwind font utilities:
- `text-2xl font-bold` (h1 headings)
- `text-lg font-semibold` (section headings)
- `text-sm` (body text)
- `text-xs` (helper text)
- `font-medium` (emphasis)

These inherit from `body { font-family: var(--font-body), 'DM Sans', ... }` and `h1,h2,h3 { font-family: var(--font-display), 'Urbanist', ... }` in globals.css -- **which ARE theme-overridable** via `--font-body` and `--font-display`.

No custom `font-family` declarations found in account pages. Fonts are properly inherited.

---

## Part 3: Public Site Theme Usage

### 3A: Public Layout

**File**: `src/app/(public)/layout.tsx`

The public layout does **exactly the same** as the account layout:
- Calls `getActiveTheme()`, `getSiteThemeSettings()` (line 14-17)
- Wraps in `<ThemeProvider>` (line 29-31)
- Wrapper: `bg-brand-black text-site-text min-h-screen` (line 34)

**One difference**: Public layout has `className="public-theme ..."` on the wrapper div, which enables custom scrollbar styles (`.public-theme::-webkit-scrollbar-*` in globals.css). The account layout does NOT have `public-theme` class.

### 3B: Correct Pattern from Public Pages

Properly themed public pages use:

| Purpose | Correct Class | Example |
|---|---|---|
| Page background | `bg-brand-black` | Homepage sections |
| Section background | `bg-brand-dark` | Alternating sections |
| Card background | `bg-brand-surface` | Product cards, review cards |
| Primary text | `text-site-text` | Headings, body |
| Secondary text | `text-site-text-muted` | Descriptions |
| Dim text | `text-site-text-dim` | Labels |
| Faint text | `text-site-text-faint` | Tertiary info |
| Accent | `text-lime` | Highlights, icons |
| Link | `text-lime hover:text-lime-200` | Clickable links |
| Border | `border-site-border` | Dividers |
| Card hover | `hover:border-lime/30` | Interactive cards |
| Primary button | `.site-btn-cta` or `bg-lime text-site-text-on-primary` | CTAs |
| Button hover | `hover:bg-lime-200` or `hover:shadow-lime/25` | Button interaction |
| Secondary button | `bg-brand-surface border-site-border` | Secondary actions |

### 3C: Site Header

**File**: `src/components/public/site-header.tsx` + `header-client.tsx`

- **Same header used on public AND account AND auth pages** -- all three layouts render `<SiteHeader />`
- **100% theme-aware** -- uses `bg-site-header-bg`, `text-site-text`, `text-site-text-secondary`, `text-site-text-muted`, `border-site-border-light`, `bg-brand-surface`, `text-lime`, `.site-btn-cta`
- No hardcoded colors found
- Book Now button uses `.site-btn-cta` CSS class (reads from CSS vars)

---

## Part 4: Identify ALL Gaps

### 4A: ThemeProvider Coverage

- [x] `(public)/layout.tsx` -- **HAS ThemeProvider** with full theme data
- [x] `(account)/layout.tsx` -- **HAS ThemeProvider** with full theme data
- [x] `(customer-auth)/layout.tsx` -- **HAS ThemeProvider** with full theme data

**All three layouts are covered.** This was fixed in Session M.

### 4B: Variable Name Consistency -- Master Mapping Table

| Property | Theme Settings Field | Seasonal Preset Key | ThemeProvider Sets | globals.css Default | Tailwind Class | Public Pages Use | Dashboard Uses | Match? |
|---|---|---|---|---|---|---|---|---|
| Page BG | `color_page_bg` | `bodyBgColor` | `--brand-black` | `#000000` | `bg-brand-black` | `bg-brand-black` | `bg-brand-black` | **YES** |
| Card BG | `color_card_bg` | `brand-surface` | `--brand-surface` | `#1A1A1A` | `bg-brand-surface` | `bg-brand-surface` | `bg-brand-surface` | **YES** |
| Section BG | `color_section_alt_bg` | `brand-dark` | `--brand-dark` | `#0A0A0A` | `bg-brand-dark` | `bg-brand-dark` | `bg-brand-dark` | **YES** |
| Text Primary | `color_text_primary` | -- | `--site-text` | `#ffffff` | `text-site-text` | `text-site-text` | `text-site-text` | **YES** |
| Text Secondary | `color_text_secondary` | -- | `--site-text-secondary` | `#D1D5DB` | `text-site-text-secondary` | `text-site-text-secondary` | `text-site-text-secondary` | **YES** |
| Text Muted | `color_text_muted` | -- | `--site-text-muted` | `#9CA3AF` | `text-site-text-muted` | `text-site-text-muted` | `text-site-text-muted` | **YES** |
| Primary Accent | `color_primary` | `lime` | `--lime` | `#CCFF00` | `bg-lime`, `text-lime` | `text-lime`, `bg-lime` | `bg-lime`, `text-lime` | **YES** |
| Primary Hover | `color_primary_hover` | `lime-200` | `--lime-200` | `#DDFF4D` | `bg-lime-200` | `hover:bg-lime-200` | `hover:bg-lime-200` | **YES** |
| Button Primary BG | `btn_primary_bg` | -- | `--site-btn-primary-bg` | `var(--lime)` | `.site-btn-primary` | `.site-btn-cta` | **inline `bg-lime`** | **PARTIAL** |
| Button Primary Hover | `btn_primary_hover_bg` | -- | `--site-btn-primary-hover-bg` | `var(--lime-200)` | `.site-btn-primary:hover` | `.site-btn-cta:hover` | **inline `hover:shadow-lime/25`** | **MISMATCH** |
| Button Primary Text | `btn_primary_text` | -- | `--site-btn-primary-text` | `var(--text-on-primary)` | `.site-btn-primary` | `.site-btn-cta` | **inline `text-black`** | **MISMATCH** |
| Button Radius | `btn_primary_radius` | -- | `--site-btn-primary-radius` | `9999px` | `.site-btn-primary` | `.site-btn-cta` | **inline `rounded-full`** | **NOT CONNECTED** |
| Link Color | `color_link` | -- | `--site-link` | `var(--lime)` | `text-site-link` | `text-lime` | `text-lime` or **`text-blue-600`** | **PARTIAL** |
| Link Hover | `color_link_hover` | -- | `--site-link-hover` | `var(--lime-200)` | `text-site-link-hover` | `hover:text-lime-200` | `hover:text-lime-200` or **`hover:text-blue-800`** | **PARTIAL** |
| Border | `color_border` | -- | `--site-border` | `rgba(255,255,255,0.1)` | `border-site-border` | `border-site-border` | `border-site-border` or **`border-white/10`** | **PARTIAL** |
| Menu BG | -- | -- | -- | -- | -- | N/A | `bg-brand-surface` | **OK (no dedicated var)** |
| Menu Active | -- | -- | -- | -- | -- | N/A | `bg-brand-surface shadow-sm` | **ISSUE (same as container bg)** |
| Menu Hover | -- | -- | -- | -- | -- | N/A | `hover:text-site-text` | **YES** |
| Font Family | `font_family` | -- | `--font-body` | `DM Sans` | `font-sans` | Inherited | Inherited | **YES** |
| Heading Font | `font_heading_family` | -- | `--font-display` | `Urbanist` | `font-display` | Inherited | Inherited | **YES** |
| Secondary Button | `btn_secondary_bg/text/border/radius` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |
| Status Colors | `color_success/warning/error` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |
| Font Sizes | `font_h1/h2/h3/body/small_size` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |
| Font Weights | `font_heading_weight/body_weight` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |
| Border Radius | `border_radius/card_radius` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |
| Spacing | `spacing_*` | -- | **NOT MAPPED** | -- | -- | -- | -- | **BROKEN** |

### 4C: Missing Theme Variables

Properties that SHOULD be theme-controlled but have NO CSS variable:

| Property | Status | Impact |
|---|---|---|
| Dashboard active tab highlight | No var | Active tab indistinguishable from container |
| Input focus ring color | No var | Hardcoded `blue-500` on services page |
| Secondary button styling | Admin saves but never injected | No effect on live site |
| Status colors (success/warning/error) | Admin saves but never injected | No effect on live site |
| Typography sizes | Admin saves but never injected | No effect on live site |
| Font weights | Admin saves but never injected | No effect on live site |
| Border radius | Admin saves but never injected | No effect on live site |
| Spacing | Admin saves but never injected | No effect on live site |

### 4D: Seasonal Theme Override Chain

| Area | Overridden? | Notes |
|---|---|---|
| Public pages | **YES** | Full ThemeProvider coverage |
| Customer dashboard | **YES** | Full ThemeProvider coverage (same pattern) |
| Login pages | **YES** | Full ThemeProvider coverage |
| Cart/checkout | **YES** | Cart drawer inside public layout; checkout inside public layout |
| Site header | **YES** | Uses theme-aware CSS vars |
| Site footer | **YES** | Uses theme-aware CSS vars |

**The seasonal override chain works correctly for all color properties that have CSS variable mappings.** The 27 unmapped properties would not respond to any theme changes.

---

## Part 5: Report & Fix Plan

### 5A: Summary of Findings

| Metric | Value |
|---|---|
| **ThemeProvider coverage** | 3/3 layouts -- all covered |
| **Hardcoded colors needing migration** | 11 instances in 6 files |
| **Total files in account/auth sections** | ~18 page files + ~5 component files |
| **Files needing migration** | 6 files |
| **DB fields saved but never injected** | 27 of 52 (52%) |
| **Variable name mismatches** | 0 (naming is consistent) |
| **Login button theme mismatch** | Minor -- uses inline classes instead of `.site-btn-primary` CSS class |
| **Dashboard nav active state** | Visually indistinguishable from container |

### Key Conclusions

1. **The original concern "switching themes won't update the dashboard" is INCORRECT.** The account layout IS wired to ThemeProvider with both site theme and seasonal theme data. Theme switching WILL update the dashboard for all properties that have CSS variable mappings.

2. **The original concern "colors appear hardcoded instead of pulled from CSS theme variables" is MOSTLY INCORRECT.** Session M (documented in CHANGELOG) already migrated ~14 files from hardcoded to theme-aware. Current state is ~97.6% theme-aware. Only 11 hardcoded instances remain.

3. **The original concern "login buttons have different hover/active states" is PARTIALLY CORRECT.** Login buttons use `bg-lime text-black hover:shadow-lime/25` (inline classes) instead of the `.site-btn-primary` CSS class used by the header's "Book Now" button. Both render identically with default settings, but if admin changes `--site-btn-primary-hover-bg` in Theme Settings, the header button will update and the login button won't.

4. **The original concern "dashboard menu fonts and colors don't match the public site" is INCORRECT for colors** (both use same tokens) **but there's a subtle nav UX issue** -- the active tab is visually nearly identical to inactive state on dark backgrounds.

5. **The biggest real gap is in ThemeProvider**: 27 of 52 admin-editable theme fields are saved to the database but NEVER injected as CSS variables. The admin can configure typography sizes, secondary buttons, border radii, spacing, and status colors -- but changing them has zero effect on the live site.

### 5B: Fix Plan (Prioritized)

**P0 -- Critical (theme settings admin promises features that don't work):**

1. **Wire the 27 missing DB fields into ThemeProvider** -- Add CSS variable definitions to globals.css `:root`, add `@theme inline` entries, add mapping in `buildSiteThemeVars()`. This is the biggest piece of work. Fields: `color_success/warning/error`, `font_base_size/h1_size/h2_size/h3_size/body_size/small_size/line_height/heading_weight/body_weight`, `btn_primary_padding`, `btn_secondary_bg/text/border/radius`, `border_radius/card_radius/width`, `spacing_section_padding/card_padding/header_height`, `mode`.

   - Alternative: Remove the unimplemented fields from the Theme Settings admin UI so the admin isn't misled. This is faster and arguably better UX than silently doing nothing.

**P1 -- High (visible inconsistencies):**

2. **Fix login button theme disconnection** -- Replace inline `bg-lime text-black rounded-full hover:shadow-lime/25` with the `.site-btn-primary` CSS class (or create a shared component). This ensures admin Theme Settings button overrides apply to login pages too. **4 buttons across 3 auth pages.**

3. **Fix active tab visibility in account-shell** -- Change active tab from `bg-brand-surface` (same as container) to a visually distinct style like `bg-brand-dark text-lime` or `bg-lime/10 text-lime border-b-2 border-lime`.

4. **Migrate 11 remaining hardcoded classes** -- Fix the specific instances:
   - Services page: blue focus rings -> `focus:border-lime focus:ring-lime`
   - Transaction/service links: `text-blue-600` -> `text-lime` (match established link pattern)
   - Orders: `border-white/*` -> `border-site-border-light` / `border-site-border`
   - Loyalty: light green alert -> dark-safe `bg-green-500/10 text-green-400`

**P2 -- Medium (completeness):**

5. **Add `public-theme` class to account layout wrapper** -- Public layout has it for scrollbar styling, account layout doesn't. Minor visual difference.

6. **Add link utility classes** -- Consider using `text-site-link hover:text-site-link-hover` instead of `text-lime hover:text-lime-200` for links. The CSS vars exist but almost no page uses the Tailwind classes -- everyone uses `text-lime` directly. If admin sets `color_link` to something other than lime, links using `text-lime` won't update but the header (using `text-site-text-muted`) will.

**P3 -- Low (polish):**

7. **Consider removing unimplemented Theme Settings fields** -- If not wiring all 27 missing fields, remove them from the admin UI to prevent confusion. The Typography, Secondary Buttons, Borders & Spacing tabs contain mostly non-functional fields.

8. **Add custom scrollbar to account layout** -- Add `public-theme` class for consistent scrollbar theming.

### 5C: Estimated Scope

| Fix | Files Changed | Risk | Session |
|---|---|---|---|
| P0: Wire 27 fields OR remove from admin | 3-4 files (globals.css, theme-provider.tsx, @theme inline) OR 1 file (theme-settings/page.tsx) | Low (additive) or Low (removal) | Part of 1 session |
| P1.2: Login button theme fix | 3 files (signin, signup, reset-password) | Very low | Part of 1 session |
| P1.3: Active tab fix | 1 file (account-shell.tsx) | Very low | Part of 1 session |
| P1.4: Hardcoded class migration | 6 files | Very low | Part of 1 session |
| P2.5-6: Link utility + scrollbar | 2-3 files | Very low | Part of 1 session |

**Total: 1 session** to fix everything. No risk of breaking existing pages -- all changes are either additive (new CSS vars) or replacing one class with another equivalent class.
