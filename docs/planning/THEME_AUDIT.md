# Theme System Audit

> **Audited:** 2026-02-28
> **Purpose:** Document the full theme system before E.7 simplification, preview, import/export, and dark/light mode improvements.

---

## Base Theme Settings

### Table: `site_theme_settings`

**Migration:** `20260216000003_site_theme_settings.sql`

| Column | Type | Default | Wired to ThemeProvider? | Wired to Admin UI? |
|--------|------|---------|------------------------|---------------------|
| id | UUID | gen_random_uuid() | N/A | N/A |
| name | TEXT | 'Custom Theme' | No | No (not editable) |
| is_active | BOOLEAN | false | Yes (gating) | Yes (via Save) |
| mode | TEXT | 'dark' | **No** — exists in DB, not consumed by ThemeProvider | **No** — hidden in admin UI comment |
| **Colors - Backgrounds** | | | | |
| color_page_bg | TEXT | NULL | Yes → `--brand-black` | Yes |
| color_card_bg | TEXT | NULL | Yes → `--brand-surface` | Yes |
| color_header_bg | TEXT | NULL | Yes → `--site-header-bg` | Yes |
| color_footer_bg | TEXT | NULL | Yes → `--site-footer-bg` | Yes |
| color_section_alt_bg | TEXT | NULL | Yes → `--brand-dark` | Yes |
| **Colors - Text** | | | | |
| color_text_primary | TEXT | NULL | Yes → `--site-text` | Yes |
| color_text_secondary | TEXT | NULL | Yes → `--site-text-secondary` | Yes |
| color_text_muted | TEXT | NULL | Yes → `--site-text-muted` | Yes |
| color_text_on_primary | TEXT | NULL | Yes → `--site-text-on-primary` | Yes |
| **Colors - Brand/Accent** | | | | |
| color_primary | TEXT | NULL | Yes → `--lime`, `--lime-300` | Yes |
| color_primary_hover | TEXT | NULL | Yes → `--lime-200` | Yes |
| color_accent | TEXT | NULL | Yes → `--lime-400` | Yes |
| color_accent_hover | TEXT | NULL | Yes → `--lime-500` | Yes |
| **Colors - Links** | | | | |
| color_link | TEXT | NULL | Yes → `--site-link` | Yes |
| color_link_hover | TEXT | NULL | Yes → `--site-link-hover` | Yes |
| **Colors - Borders** | | | | |
| color_border | TEXT | NULL | Yes → `--site-border` | Yes |
| color_border_light | TEXT | NULL | Yes → `--site-border-light` | Yes |
| color_divider | TEXT | NULL | Yes → `--site-divider` | Yes |
| **Colors - Status** | | | | |
| color_success | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| color_warning | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| color_error | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| **Typography** | | | | |
| font_family | TEXT | NULL | Yes → `--font-body` | Yes |
| font_heading_family | TEXT | NULL | Yes → `--font-display` | Yes |
| font_base_size | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| font_h1_size | TEXT | NULL | **No** | **No** |
| font_h2_size | TEXT | NULL | **No** | **No** |
| font_h3_size | TEXT | NULL | **No** | **No** |
| font_body_size | TEXT | NULL | **No** | **No** |
| font_small_size | TEXT | NULL | **No** | **No** |
| font_line_height | TEXT | NULL | **No** | **No** |
| font_heading_weight | TEXT | NULL | **No** | **No** |
| font_body_weight | TEXT | NULL | **No** | **No** |
| **Buttons - Primary** | | | | |
| btn_primary_bg | TEXT | NULL | Yes → `--site-btn-primary-bg` | Yes |
| btn_primary_text | TEXT | NULL | Yes → `--site-btn-primary-text` | Yes |
| btn_primary_hover_bg | TEXT | NULL | Yes → `--site-btn-primary-hover-bg` | Yes |
| btn_primary_radius | TEXT | NULL | Yes → `--site-btn-primary-radius` | Yes |
| btn_primary_padding | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| **Buttons - Secondary** | | | | |
| btn_secondary_bg | TEXT | NULL | **No** — not in ThemeProvider | **No** — hidden in admin UI comment |
| btn_secondary_text | TEXT | NULL | **No** | **No** |
| btn_secondary_border | TEXT | NULL | **No** | **No** |
| btn_secondary_radius | TEXT | NULL | **No** | **No** |
| **Buttons - CTA** | | | | |
| btn_cta_bg | TEXT | NULL | Yes → `--site-btn-cta-bg` | Yes |
| btn_cta_text | TEXT | NULL | Yes → `--site-btn-cta-text` | Yes |
| btn_cta_hover_bg | TEXT | NULL | Yes → `--site-btn-cta-hover-bg` | Yes |
| btn_cta_radius | TEXT | NULL | Yes → `--site-btn-cta-radius` | Yes |
| **Borders & Shapes** | | | | |
| border_radius | TEXT | NULL | **No** | **No** |
| border_card_radius | TEXT | NULL | **No** | **No** |
| border_width | TEXT | NULL | **No** | **No** |
| **Spacing** | | | | |
| spacing_section_padding | TEXT | NULL | **No** | **No** |
| spacing_card_padding | TEXT | NULL | **No** | **No** |
| spacing_header_height | TEXT | NULL | **No** | **No** |
| **Metadata** | | | | |
| is_default | BOOLEAN | false | N/A | N/A |
| created_at | TIMESTAMPTZ | NOW() | N/A | N/A |
| updated_at | TIMESTAMPTZ | NOW() | N/A | N/A |

**Total columns: 49** (including id, metadata). **26 wired to frontend**, **21 unwired** (exist in DB but not consumed by ThemeProvider or shown in admin UI).

### Unwired Fields (Deprecated Candidates)

These fields exist in the DB and are referenced in the API allowlist and reset route, but are NOT consumed by ThemeProvider and NOT shown in the admin UI:

1. `mode` — has CHECK constraint for 'dark'/'light' but ThemeProvider doesn't read it
2. `color_success`, `color_warning`, `color_error` — status colors
3. `font_base_size`, `font_h1_size`, `font_h2_size`, `font_h3_size`, `font_body_size`, `font_small_size` — font sizes
4. `font_line_height`, `font_heading_weight`, `font_body_weight` — typography details
5. `btn_primary_padding` — button padding
6. `btn_secondary_bg`, `btn_secondary_text`, `btn_secondary_border`, `btn_secondary_radius` — secondary button
7. `border_radius`, `border_card_radius`, `border_width` — border shapes
8. `spacing_section_padding`, `spacing_card_padding`, `spacing_header_height` — spacing

**Recommendation:** Do NOT drop these columns yet. They were designed for future use. Mark as "reserved for future implementation" in comments. The admin UI already has HTML comments noting they're hidden until wired.

---

## Seasonal Themes

### Table: `seasonal_themes`

**Migration:** `20260214000004_cms_themes.sql`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | gen_random_uuid() | |
| name | TEXT | NOT NULL | e.g., "Christmas" |
| slug | TEXT | UNIQUE NOT NULL | e.g., "christmas" |
| description | TEXT | NULL | |
| color_overrides | JSONB | '{}' | Key-value pairs like `{"lime": "#dc2626", "brand-dark": "#0a1a0a"}` |
| gradient_overrides | JSONB | '{}' | Key-value pairs like `{"hero": "linear-gradient(...)"}` |
| particle_effect | TEXT | NULL | CHECK: snowfall, fireworks, confetti, hearts, leaves, stars, sparkles |
| particle_intensity | INTEGER | 50 | CHECK: 0–100 |
| particle_color | TEXT | NULL | |
| ticker_message | TEXT | NULL | Override ticker text |
| ticker_bg_color | TEXT | NULL | |
| ticker_text_color | TEXT | NULL | |
| themed_ad_creative_id | UUID | NULL | FK → ad_creatives(id) |
| hero_bg_image_url | TEXT | NULL | |
| body_bg_color | TEXT | NULL | Overrides `--brand-black` |
| starts_at | TIMESTAMPTZ | NULL | Auto-activate start |
| ends_at | TIMESTAMPTZ | NULL | Auto-deactivate end |
| auto_activate | BOOLEAN | false | When true, cron auto-activates/deactivates based on date range |
| is_active | BOOLEAN | false | Only one can be active at a time |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NOW() | |

### Activation Mechanism

1. **Manual:** Admin clicks Activate/Deactivate buttons on `/admin/website/themes`
   - Activate: deactivates all others, sets `is_active = true`, enables `seasonal_themes` feature flag
   - Deactivate: sets `is_active = false`, disables feature flag if no others active

2. **Automatic (cron):** `src/app/api/cron/theme-activation/route.ts` runs every 15 minutes
   - Activates themes where `auto_activate = true`, `is_active = false`, `starts_at <= now`, `ends_at > now` (or null)
   - Deactivates themes where `auto_activate = true`, `is_active = true`, `ends_at <= now`
   - Does NOT toggle the feature flag (potential bug — only manual toggle does)

3. **Feature flag gating:** `seasonal_themes` feature flag must be enabled for the ThemeProvider to apply the active seasonal theme. The public layout checks `cmsToggles.seasonalThemes && activeTheme !== null`.

### What Seasonal Themes Override

Seasonal themes override a **different set of CSS variables** than the base theme:

| Seasonal Theme Field | CSS Variable(s) |
|---------------------|-----------------|
| `color_overrides.lime` | `--lime` |
| `color_overrides['lime-50']` through `['lime-600']` | `--lime-50` through `--lime-600` |
| `color_overrides['brand-dark']` | `--brand-dark` |
| `color_overrides['brand-surface']` | `--brand-surface` |
| `color_overrides['accent-glow-rgb']` | `--theme-accent-glow-rgb` |
| `body_bg_color` | `--brand-black` |
| `gradient_overrides.hero` | `.bg-gradient-hero { background: ... !important }` |
| `gradient_overrides.cta` | `.bg-gradient-cta { background: ... !important }` |
| `gradient_overrides.brand` | `.bg-gradient-brand { background: ... !important }` |
| `particle_effect` + `particle_intensity` + `particle_color` | `<ParticleCanvas>` component |
| `ticker_message` + `ticker_bg_color` + `ticker_text_color` | Applied by ticker component (not CSS vars) |

### Overlap Between Base and Seasonal Themes

| Property | Base Theme Column | Seasonal Theme Field |
|----------|------------------|---------------------|
| Page background | `color_page_bg` → `--brand-black` | `body_bg_color` → `--brand-black` |
| Card background | `color_card_bg` → `--brand-surface` | `color_overrides['brand-surface']` → `--brand-surface` |
| Section alt bg | `color_section_alt_bg` → `--brand-dark` | `color_overrides['brand-dark']` → `--brand-dark` |
| Primary accent | `color_primary` → `--lime`, `--lime-300` | `color_overrides['lime']` → `--lime` |
| Primary hover | `color_primary_hover` → `--lime-200` | `color_overrides['lime-200']` → `--lime-200` |
| Accent | `color_accent` → `--lime-400` | `color_overrides['lime-400']` → `--lime-400` |
| Accent hover | `color_accent_hover` → `--lime-500` | `color_overrides['lime-500']` → `--lime-500` |
| Accent glow | (not in base) | `color_overrides['accent-glow-rgb']` → `--theme-accent-glow-rgb` |

**Key difference:** Seasonal themes also control particle effects, ticker overrides, hero background images, and gradient overrides — features that don't exist in the base theme. The base theme controls text colors, link colors, border colors, typography, and button styles — features that seasonal themes do NOT override.

**Current merging:** ThemeProvider applies base theme vars first, then seasonal theme vars on top. Since they target mostly the same CSS variable names for overlapping properties, seasonal themes win.

---

## CSS Variable Injection

### File: `src/components/public/cms/theme-provider.tsx`

**Method:** Client component wrapping all public layout children. Builds a `Record<string, string>` from site theme + seasonal theme data, passed as inline `style` prop on a `<div>`.

**Layer cascade:**
1. **CSS defaults** in `src/app/globals.css` `:root` block → `--lime: #CCFF00`, `--brand-black: #000000`, etc.
2. **Tailwind v4 `@theme inline`** in `globals.css` maps `--color-lime: var(--lime)`, etc.
3. **ThemeProvider inline styles** — `buildSiteThemeVars()` then `buildSeasonalCssVars()` override the raw `--lime`, `--brand-black`, etc.
4. **User light mode toggle** — `ThemeToggle` component applies light mode vars via `element.style.setProperty()`, which overrides everything above.

**Scoping:** The `<div style={...}>` wrapper is inside the public layout only. Admin panel is NOT wrapped by ThemeProvider — admin has its own styling.

### Gradient Overrides

Injected via `<style dangerouslySetInnerHTML>` as CSS class overrides:
```css
.bg-gradient-hero { background: linear-gradient(...) !important; }
```

---

## Dark/Light Mode

### Current State: Functional

1. **Toggle button:** `src/components/public/theme-toggle.tsx` — Sun/Moon icon in the public site header
2. **Persistence:** `localStorage.getItem('sd-user-theme')` — values: `'dark'` or `'light'`
3. **Flash prevention:** `src/components/public/theme-toggle-initializer.tsx` — `<Script strategy="beforeInteractive">` runs before hydration to apply saved light mode preference
4. **Light mode overrides:** ~50 CSS variables hardcoded in `LIGHT_VARS` object in both `theme-toggle.tsx` and `theme-toggle-initializer.tsx` (duplicated!)
5. **Application:** `element.style.setProperty()` on `.public-theme` div — beats ThemeProvider's inherited vars
6. **`data-user-theme="light"` attribute:** Set on `.public-theme` div when light mode active (used for CSS `[data-user-theme="light"]` selectors in `globals.css`)

### Gaps

1. **LIGHT_VARS duplicated** between `theme-toggle.tsx` and `theme-toggle-initializer.tsx` — must stay in sync manually
2. **Light mode is hardcoded** — ignores base theme settings entirely. If admin sets a light-themed base theme, the user toggle replaces it with the hardcoded light vars
3. **`mode` column in `site_theme_settings`** is not consumed — the system doesn't know if the base theme is light or dark
4. **Seasonal theme + light mode interaction:** When a seasonal theme overrides `--lime` to red, and user toggles to light mode, the light toggle replaces lime-related button vars with its hardcoded green values, potentially conflicting with the seasonal theme's color scheme
5. **`globals.css` has `[data-user-theme="light"]` rules** at line ~275 that override brand/site vars — these AND the JS overrides both run, which is redundant but harmless (JS wins via inline specificity)

### Admin Isolation: Confirmed

The admin panel is NOT wrapped by ThemeProvider. Admin pages use their own Tailwind classes and are not affected by public theme changes. The admin layout (`src/app/admin/layout.tsx`) is completely separate from the public layout.

---

## Redundancies

1. **LIGHT_VARS duplicated** in two files (theme-toggle.tsx and theme-toggle-initializer.tsx) — 50+ identical values
2. **21 unwired DB columns** in `site_theme_settings` — stored in DB, referenced in API allowlists, but never consumed
3. **`mode` column** has no effect — ThemeProvider doesn't branch on dark/light mode
4. **THEME_DEFAULTS in admin** vs **DEFAULT_THEME in lib** — two separate default value objects that should stay in sync but aren't connected programmatically
5. **Cron doesn't toggle feature flag** — manual activate/deactivate toggles the `seasonal_themes` feature flag, but the cron auto-activate does not. If a theme auto-activates via cron, the feature flag may still be disabled, causing the theme not to show.

---

## Recommendations

### Phase 2: Simplify Overlaps
1. **Don't restructure seasonal themes to JSONB overrides** — the current system works well. Seasonal themes override `--lime-*` and `--brand-*` CSS variables, which is exactly what the color_overrides JSONB already provides. The architecture is clean.
2. **Add override indicators** — in the seasonal theme editor, show which base theme values are being overridden. Add a visual indicator (checkbox or "overriding base" badge) next to each color field.
3. **Fix cron feature flag gap** — the theme-activation cron should toggle the `seasonal_themes` feature flag when auto-activating/deactivating.

### Phase 3: Preview
1. Add `?theme_preview=base` and `?theme_preview={seasonalThemeId}` query parameter support to the public layout
2. Show a preview banner at the top with Apply/Close buttons
3. Preview is read-only — doesn't change the active theme for other visitors

### Phase 4: Import/Export
1. Export base theme settings as JSON
2. Export seasonal themes as JSON
3. Import with validation and diff preview

### Phase 5: Dark/Light Mode
1. **Extract LIGHT_VARS to a shared constant** — eliminate duplication between toggle and initializer
2. **Wire `mode` column** — when base theme `mode = 'light'`, auto-apply light mode vars server-side
3. **Make light mode theme-aware** — instead of hardcoded light vars, derive light mode from the base theme's actual colors (or store separate light variants in the DB)
