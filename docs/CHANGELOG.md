# Changelog — Auto Detail App

Archived session history and bug fixes. Moved from CLAUDE.md to keep handoff context lean.

---

## Session J — 2026-02-16 (Public Frontend Reskin — Premium Dark Design)

### Changed: Complete visual overhaul of all public-facing components
- **Design direction**: Premium dark automotive aesthetic with framer-motion animations, scroll-aware header, animated hero carousel, and refined footer
- **New dependency**: `framer-motion` installed for AnimatePresence, motion.div slide/fade transitions, animated labels

### Component: AnnouncementTicker (`src/components/public/cms/announcement-ticker.tsx`)
- Replaced marquee scroll with framer-motion animated rotation (y-axis slide transitions)
- `AnimatePresence mode="wait"` with 4000ms auto-rotate interval
- Session storage persistence for dismissal
- Dot indicators for multiple tickers
- Kept `TopBarTicker` and `SectionTicker` named exports, `tickers: AnnouncementTicker[]` prop interface

### Component: SiteHeader (server/client split)
- **`src/components/public/site-header.tsx`** (server wrapper): Thin async component fetching `getBusinessInfo()` and customer name via Supabase auth. Passes `navItems`, `businessName`, `phone`, `logoUrl`, `customerName` to client component
- **`src/components/public/header-client.tsx`** (new client component): Scroll-aware backdrop blur header, animated dropdown menus, mobile hamburger with framer-motion height animation, red gradient "Book Now" CTA, desktop utility bar with phone and "Mobile Service" info, account link (Hi {name} or Sign In), logo fallback with red gradient "S" icon

### Component: HeroCarousel (`src/components/public/cms/hero-carousel.tsx`)
- Replaced CSS opacity transitions with framer-motion slide transitions using `custom` direction prop
- Bottom-aligned content (flex items-end pb-16), red gradient CTA buttons with shadow effects
- `overlay_opacity` correctly handled as 0-100 scale
- First slide uses `<h1>`, subsequent slides use `<p>` for SEO
- `<picture>` element preserved for mobile image variants
- HeroBeforeAfter sub-component with clip-path slider

### Component: SiteFooter (server/client split)
- **`src/components/public/site-footer.tsx`** (server wrapper): Async component fetching business info, reviews, cities. Builds navColumns and reviewBadges from data
- **`src/components/public/footer-client.tsx`** (new client component): Dark premium footer with trust badges strip (Shield, Award, Leaf, Clock icons), 12-column grid layout, contact info with red icon accents, review badges (Google/Yelp stars), service area city links, legal links bottom bar

### Component: BeforeAfterSlider (`src/components/before-after-slider.tsx`)
- Added framer-motion animated labels (slide-in from left/right)
- Enhanced with `rounded-2xl` container, improved drag handle
- Red "After" label badge, scale animation on drag handle (hover → scale-105, dragging → scale-110)
- Kept named export and props: `beforeSrc`, `afterSrc`, `beforeLabel`, `afterLabel`

### Dark Theme Scoping
- `bg-black text-white min-h-screen` wrapper applied to 3 layouts:
  - `src/app/(public)/layout.tsx`
  - `src/app/(customer-auth)/layout.tsx`
  - `src/app/(account)/layout.tsx`

### CMS Cache Revalidation
- Added `revalidateTag()` calls to all CMS admin API routes for instant public page updates:
  - Hero slides, themes, navigation, pages, tickers, ads/creatives
  - SEO pages, SEO cities, catalog (services/products/categories)
  - About page, terms page, content blocks

### Files Created
- `src/components/public/header-client.tsx` — animated client header component

### Files Modified
- `src/components/public/cms/announcement-ticker.tsx` — framer-motion rotation
- `src/components/public/site-header.tsx` — server wrapper for header-client
- `src/components/public/header-client.tsx` — new animated client header
- `src/components/public/cms/hero-carousel.tsx` — framer-motion slide transitions
- `src/components/public/site-footer.tsx` — server wrapper for footer-client
- `src/components/public/footer-client.tsx` — redesigned premium footer
- `src/components/before-after-slider.tsx` — framer-motion labels + improved UX
- `src/app/(public)/layout.tsx` — dark theme wrapper
- `src/app/(customer-auth)/layout.tsx` — dark theme wrapper
- `src/app/(account)/layout.tsx` — dark theme wrapper
- Multiple CMS API routes — revalidateTag() calls added

### Old Components (orphaned but not deleted)
- `src/components/public/header-shell.tsx` — old scroll-aware header wrapper
- `src/components/public/mobile-menu.tsx` — old mobile menu
- `src/components/public/nav-dropdown.tsx` — old nav dropdown

### Session J (continued — Session 3) — Scroll Animations, Auth Dark Theme & Final Polish

#### AnimatedSection Wrapper (`src/components/public/animated-section.tsx`)
- NEW reusable client component for scroll-triggered framer-motion animations in server component pages
- `AnimatedSection` — wraps content with `whileInView` fade-in, supports `stagger` mode for grids
- `AnimatedItem` — child wrapper for staggered grid items
- Uses `fadeInUp` and `staggerContainer` variants from `@/lib/animations`
- `viewport={{ once: true, margin: '-80px' }}` for natural trigger point

#### Customer Auth Dark Theme (3 pages)
- **signin/page.tsx**: Removed all `dark:` prefixed classes, permanent dark theme. Cards: `bg-brand-surface border-white/10`. Buttons: `bg-lime text-black font-bold`. Links: `text-lime`. Error: `bg-red-950 text-red-300`. Session expired: `bg-amber-950 border-amber-800 text-amber-200`.
- **signup/page.tsx**: Same conversion pattern across all 4 form states (full registration, phone-otp, phone-verify, otp-profile)
- **reset-password/page.tsx**: Same conversion pattern

#### Content Block Renderer CTA Fix
- Fixed CTA block gradient: `from-brand-600 to-brand-800` → `from-brand-grey to-black border-white/10`
- Added radial lime glow overlay (`bg-lime/5 rounded-full blur-3xl`)

#### Ad Zone Polish
- Container: `rounded` → `rounded-2xl`

#### Scroll Animations Added To
- City page (`areas/[citySlug]`): Hero, services grid, reviews — lime gradient city name
- Areas index (`areas/page`): Hero, staggered city card grid — lime gradient, hover lift effects
- Services index + category: Hero heading, staggered card grids
- Products index + category: Hero heading, staggered card grids
- Gallery: Hero heading
- Terms: Hero heading

#### Animations Library Fix (`src/lib/animations.ts`)
- Added explicit `Variants` type annotations to all exported variants
- Fixed `ease` array type: `number[]` → `[number, number, number, number]` tuple for framer-motion compatibility

#### Files Created
- `src/components/public/animated-section.tsx`

#### Files Modified
- `src/app/(customer-auth)/signin/page.tsx` — permanent dark theme
- `src/app/(customer-auth)/signup/page.tsx` — permanent dark theme
- `src/app/(customer-auth)/signin/reset-password/page.tsx` — permanent dark theme
- `src/components/public/content-block-renderer.tsx` — CTA block gradient fix
- `src/components/public/cms/ad-zone.tsx` — rounded-2xl
- `src/app/(public)/areas/[citySlug]/page.tsx` — AnimatedSection + lime gradient
- `src/app/(public)/areas/page.tsx` — AnimatedSection + lime gradient
- `src/app/(public)/terms/page.tsx` — AnimatedSection
- `src/app/(public)/services/page.tsx` — AnimatedSection
- `src/app/(public)/services/[categorySlug]/page.tsx` — AnimatedSection
- `src/app/(public)/products/page.tsx` — AnimatedSection
- `src/app/(public)/products/[categorySlug]/page.tsx` — AnimatedSection
- `src/app/(public)/gallery/page.tsx` — AnimatedSection
- `src/lib/animations.ts` — Variants type annotations

### Session J (continued — Session 2) — Hero/Card/Page Polish & Animations

#### HeroCarousel Enhancements
- Taller hero: `min-h-[500px] sm:min-h-[600px] lg:min-h-[85vh]`
- Slow image zoom effect via `motion.div` scale animation (1.0 → 1.05 over 6s)
- `renderTitle()` splits last word with `text-gradient-lime` highlight
- Staggered content animations (subtitle 0.35s, CTA 0.5s delay)
- Arrow hover: `hover:border-lime/30`
- Before/after divider: white → lime with glow shadow
- CTA arrow appended: `<span aria-hidden="true">&rarr;</span>`

#### TrustBar — Server/Client Split + CountUp Animations
- **`trust-bar.tsx`** refactored to thin server wrapper (fetches data, passes to client)
- **`trust-bar-client.tsx`** (NEW): Client component with `CountUp` animations for review counts and vehicle count (6000+), larger stat numbers (`text-xl sm:text-2xl font-bold`), vertical dividers

#### Card Components — Hover Lift Effects
- **ServiceCard**: Added optional image display (`h-48 sm:h-56 object-cover`), hover lift (`hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm`), border-t footer divider
- **ServiceCategoryCard**: Added hover lift + `font-bold` title
- **ProductCard**: Added hover lift, "View Details" pseudo-button (`group-hover:bg-lime group-hover:text-black`)
- **ProductCategoryCard**: Added hover lift + `font-bold` title

#### Page Dark Theme Pass
- **Services** (3 files): `bg-gradient-hero` → `bg-black`, "Our Detailing `<span class="text-gradient-lime">Services</span>`", lime accents
- **Products** (3 files): Same dark hero treatment, "Our `<span class="text-gradient-lime">Products</span>`"
- **Gallery**: Dark hero, "Our `<span class="text-gradient-lime">Work</span>`", rounded-full filter pills (active: `bg-lime text-black`), "Before / After" lime badge on cards
- **Areas** (2 files): Fixed `bg-gradient-hero`, blue text → `text-gray-400`
- **Terms**: Fixed `bg-gradient-hero`, blue text → `text-gray-400`
- **Hero Section**: `bg-gradient-hero` → `bg-black`, amber stars → lime stars

#### CTA Section + Breadcrumbs
- **CTA section**: Gradient bg (`bg-gradient-to-br from-brand-grey to-black`), radial lime glow (`bg-lime/5 rounded-full blur-3xl`), larger CTA button (`text-lg h-14 px-10`)
- **Breadcrumbs**: Simplified to single dark variant, removed `variant` logic, unified `hover:text-lime hover:decoration-lime`

#### Homepage Review Section
- Decorative quote mark: `text-6xl font-serif text-lime/20`
- Review text: italic, larger (`text-base sm:text-lg`)
- Google platform badge: `bg-white/5 border border-white/10 rounded-full`

#### Files Created
- `src/components/public/trust-bar-client.tsx` — CountUp animations client component

#### Files Modified
- `src/components/public/cms/hero-carousel.tsx` — zoom, gradient title, taller hero
- `src/components/public/trust-bar.tsx` — server wrapper delegation
- `src/components/public/service-card.tsx` — image support, hover lift
- `src/components/public/service-category-card.tsx` — hover lift
- `src/components/public/product-card.tsx` — hover lift, View Details button
- `src/components/public/product-category-card.tsx` — hover lift
- `src/app/(public)/services/page.tsx` — dark hero
- `src/app/(public)/services/[categorySlug]/page.tsx` — dark hero
- `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx` — dark hero + lime CTA
- `src/app/(public)/products/page.tsx` — dark hero
- `src/app/(public)/products/[categorySlug]/page.tsx` — dark hero
- `src/app/(public)/gallery/page.tsx` — dark hero, lime badge
- `src/app/(public)/gallery/gallery-client.tsx` — rounded pills, hover effects
- `src/app/(public)/page.tsx` — review section polish
- `src/components/public/cta-section.tsx` — gradient bg, radial glow
- `src/components/public/breadcrumbs.tsx` — single dark variant
- `src/components/public/hero-section.tsx` — bg-black, lime stars
- `src/app/(public)/areas/page.tsx` — dark theme fixes
- `src/app/(public)/areas/[citySlug]/page.tsx` — dark theme fixes
- `src/app/(public)/terms/page.tsx` — dark theme fixes

---

### Session J (first half) — Design Foundation, Lime Accent & Dark Theme Pass

#### Design System Foundation
- **Lime brand tokens** added to `globals.css` `@theme inline`: `--color-lime: #CCFF00`, lime-50 through lime-900, `--color-brand-dark: #0A0A0A`, `--color-brand-surface: #1A1A1A`
- **Lime glow shadows**: `--shadow-lime-glow`, `--shadow-lime-glow-lg` CSS custom properties
- **Brand CSS utilities**: `.text-gradient-lime`, `.btn-lime-glow` (box-shadow + hover scale), `.bg-gradient-hero` (radial blue/black), `.section-spacing` (responsive padding), `.animate-lime-pulse`
- **Animations library**: Created `src/lib/animations.ts` — Framer Motion variants (fadeIn, fadeInUp, fadeInDown, slideIn, scaleIn, stagger containers, premiumEase)

#### Accent Color: Red → Lime (#CCFF00)
- `header-client.tsx`: Logo fallback `bg-lime`, subtitle `text-lime`, dropdown `group-hover:text-lime`, Book Now CTA `bg-lime text-black btn-lime-glow`
- `footer-client.tsx`: All `text-red-500` → `text-lime`, logo fallback → `bg-lime`, nav links → `hover:text-lime`
- `announcement-ticker.tsx`: Default bg `#E53935` → `#CCFF00`, text `#FFFFFF` → `#000000`
- `hero-carousel.tsx`: CTA → `bg-lime text-black btn-lime-glow`, indicators → `bg-lime`
- `hero-section.tsx`: CTA → `bg-lime text-black btn-lime-glow`
- `before-after-slider.tsx`: Divider → `bg-lime` with lime glow, handle → `bg-black border-lime`, After label → `bg-lime/90 text-black`

#### Dark Theme Pass — All Public Pages
Replaced all dual `light/dark:` Tailwind patterns with permanent dark values (since layout forces `bg-black text-white`):

- **Homepage** (`page.tsx`): Sections → `bg-black`/`bg-brand-dark`, cards → `bg-brand-surface border-white/10`, stars → `fill-lime text-lime`, links → `text-lime`
- **Trust bar**: `bg-brand-dark`, stars/icons → `text-lime`
- **CTA section**: `bg-brand-dark`, CTA → `bg-lime text-black btn-lime-glow`
- **Service category card**: `bg-brand-surface border-white/10 hover:border-lime/30`, arrow → `group-hover:text-lime`
- **Services pages** (3 files): Headers → `bg-gradient-hero`, cards → `bg-brand-surface`, icons → `bg-lime/5 text-lime`, "Book This Service" → `bg-lime text-black btn-lime-glow`
- **Products pages** (4 files): Full dark theme, product cards → `bg-brand-surface border-white/10`
- **Product category card**: `bg-brand-surface`, title → `group-hover:text-lime`
- **Gallery** (2 files): Filter pills → `border-lime text-lime`, Load More → `bg-lime text-black`
- **Areas** (2 files): City cards → `bg-brand-surface border-white/10`, CTA → `bg-lime text-black btn-lime-glow`
- **Terms page**: Prose → `prose-invert`, headings → `text-white`
- **Custom pages** (`p/[...slug]`): Dark theme applied
- **Booking page**: Section → `bg-brand-dark`, heading → `text-white`
- **Quote pages** (2 files): Cards → `bg-brand-dark border-white/10`, status banners → dark variants (red-950, green-950, purple-950, amber-950)
- **Service pricing display**: Tables → `bg-brand-surface border-white/10`, prices → `text-lime`, alternating rows → `bg-white/[0.02]`
- **Content block renderer**: Prose → `prose-invert prose-a:text-lime`, FAQ → `border-white/10`, CTA → `bg-lime text-black btn-lime-glow`, quote icon → `text-lime`
- **Breadcrumbs**: Links → `hover:text-lime hover:decoration-lime`
- **Service card**: Dark theme applied

#### Files Created
- `src/lib/animations.ts` — Framer Motion animation variants library

#### Files Modified (Dark Theme + Lime Accent)
- `src/app/globals.css` — lime tokens, brand utilities, glow shadows
- `src/app/(public)/layout.tsx` — added `public-theme antialiased` classes
- `src/components/public/header-client.tsx` — red → lime accent
- `src/components/public/footer-client.tsx` — red → lime accent
- `src/components/public/cms/announcement-ticker.tsx` — red → lime defaults
- `src/components/public/cms/hero-carousel.tsx` — red → lime CTA
- `src/components/public/hero-section.tsx` — red → lime CTA
- `src/components/before-after-slider.tsx` — lime accents + keyboard a11y
- `src/app/(public)/page.tsx` — full dark theme
- `src/components/public/trust-bar.tsx` — dark theme
- `src/components/public/cta-section.tsx` — dark theme + lime CTA
- `src/components/public/service-category-card.tsx` — dark theme
- `src/app/(public)/services/page.tsx` — dark theme
- `src/app/(public)/services/[categorySlug]/page.tsx` — dark theme
- `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx` — dark theme + lime CTA
- `src/app/(public)/products/page.tsx` — dark theme
- `src/app/(public)/products/[categorySlug]/page.tsx` — dark theme
- `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx` — dark theme
- `src/components/public/product-card.tsx` — dark theme
- `src/components/public/product-category-card.tsx` — dark theme
- `src/app/(public)/gallery/page.tsx` — dark theme
- `src/app/(public)/gallery/gallery-client.tsx` — dark theme
- `src/app/(public)/areas/page.tsx` — dark theme
- `src/app/(public)/areas/[citySlug]/page.tsx` — dark theme + lime CTA
- `src/app/(public)/terms/page.tsx` — dark theme
- `src/app/(public)/p/[...slug]/page.tsx` — dark theme
- `src/app/(public)/book/page.tsx` — dark theme
- `src/app/(public)/quote/[token]/page.tsx` — dark theme
- `src/app/(public)/quote/[token]/accept-button.tsx` — dark theme
- `src/components/public/breadcrumbs.tsx` — lime hover accents
- `src/components/public/service-card.tsx` — dark theme
- `src/components/public/service-pricing-display.tsx` — dark theme
- `src/components/public/content-block-renderer.tsx` — dark theme + lime accents

---

## Session I — 2026-02-14 (AI Content Writer for City Pages)

### New: AI Content Writer System
- **Content blocks schema** (`page_content_blocks` table): 5 block types (rich_text, faq, features_list, cta, testimonial_highlight), per-page ordering, active/inactive toggle, AI generation tracking. RLS: public read active blocks, authenticated manage.
- **Content data layer** (`src/lib/data/page-content.ts`): CRUD functions for content blocks — `getPageContentBlocks()` (public), `getPageContentBlocksAdmin()` (all), `createContentBlock()`, `updateContentBlock()`, `deleteContentBlock()`, `reorderContentBlocks()`, `bulkCreateContentBlocks()`.
- **AI Content Writer service** (`src/lib/services/ai-content-writer.ts`): Claude API integration for content generation. Context-aware prompts for city pages, service pages, and custom pages. Modes: full_page (multi-block), single_block, improve. Uses business info, city data, service data, and focus keywords for context.
- **Content API routes**: CRUD at `/api/admin/cms/content` (list + create), `/api/admin/cms/content/[id]` (get + patch + delete), `/api/admin/cms/content/reorder` (patch). AI generation at `/api/admin/cms/content/ai-generate` with 4 modes: full_page, single_block, improve, batch_cities.
- **Public content rendering** (`src/components/public/content-block-renderer.tsx`): Server Component rendering 5 block types — RichTextBlock (markdown→HTML), FaqBlock (accordion + FAQPage JSON-LD schema), FeaturesListBlock (grid cards), CtaBlock (gradient banner), TestimonialBlock (styled quote). `ContentBlocks` wrapper renders list with section spacing.
- **City page integration**: Content blocks rendered on public city landing pages between service highlights and reviews sections.
- **Admin content editors**: Markdown editor with toolbar (bold, italic, headings, links, lists) + live preview + word count + AI improve. FAQ editor with drag-reorder + AI generate. Features list, CTA, and testimonial editors with structured form fields.
- **Content Block Editor** (`src/components/admin/content/content-block-editor.tsx`): Full block management component — add/delete/reorder blocks, type-specific inline editors, per-block AI improve, full-page AI generate, drag-and-drop reordering.
- **City pages admin**: "Edit Content" button per city, "Generate All Content" batch button for AI content generation across all cities without content.
- **SEO page integration**: Collapsible "Page Content Blocks" section in each page's expanded editor, allowing content block management for any page type.

### Files Created
- `supabase/migrations/20260214000010_page_content_blocks.sql` — content blocks table + RLS
- `src/lib/data/page-content.ts` — content block data layer
- `src/lib/services/ai-content-writer.ts` — AI content writer service
- `src/app/api/admin/cms/content/route.ts` — content blocks list + create
- `src/app/api/admin/cms/content/[id]/route.ts` — content block CRUD
- `src/app/api/admin/cms/content/reorder/route.ts` — reorder blocks
- `src/app/api/admin/cms/content/ai-generate/route.ts` — AI content generation
- `src/components/public/content-block-renderer.tsx` — public content block renderer
- `src/components/admin/content/markdown-editor.tsx` — markdown editor with toolbar
- `src/components/admin/content/faq-editor.tsx` — FAQ Q&A pair editor
- `src/components/admin/content/content-block-editor.tsx` — admin content block management

### Files Modified
- `src/lib/supabase/types.ts` — `PageContentBlock` interface, `ContentBlockType` type, `body_content` on `CityLandingPage`
- `src/app/(public)/areas/[citySlug]/page.tsx` — content blocks fetch + render
- `src/app/admin/website/seo/cities/page.tsx` — content editor dialog, batch generate button
- `src/app/admin/website/seo/page.tsx` — page content blocks section in PageEditor

---

## Session H — 2026-02-14 (AI-Powered SEO Agent)

### New: AI SEO Generation System
- **Page content extractor** (`src/lib/services/page-content-extractor.ts`): Extracts text content from each page type for AI context. Master router function handles homepage, services (index/category/detail), products (index/category/detail), city landing pages, gallery, booking, terms. Queries DB for live data (services, products, categories, pricing, business info).
- **AI SEO service** (`src/lib/services/ai-seo.ts`): Claude API wrapper for SEO content generation. Detailed system prompt with rules for title (50-60 chars), description (150-160 chars), keywords, focus keyword, OG fields, local SEO priorities. Uses `claude-sonnet-4-20250514` model via `ANTHROPIC_API_KEY`.
- **AI Generate API** (`/api/admin/cms/seo/ai-generate`): POST endpoint with three modes — `single` (one page for inline preview), `global` (all pages with empty/auto-generated SEO), `batch` (specific page paths). Supports `overwriteExisting` flag.
- **AI Apply API** (`/api/admin/cms/seo/ai-apply`): POST endpoint to save AI-generated (admin-reviewed) SEO to `page_seo` table. Upserts each page, sets `is_auto_generated: false`.
- **Per-page AI Optimize**: "AI Optimize" button in PageEditor calls single-mode API, populates form fields with AI suggestions. "Revert" button restores original values. Amber "Fields updated by AI" banner. Blue "AI Recommendations" panel with actionable suggestions.
- **Global AI Generate All**: "AI Generate All" button in page header with confirmation dialog and "Overwrite existing?" checkbox. Opens AI Review Modal showing all results with side-by-side current vs generated diff, inline editing, select/deselect checkboxes, progress bar during generation, and "Apply N Pages" button.

### Files Created
- `src/lib/services/page-content-extractor.ts` — page content extraction for AI context
- `src/lib/services/ai-seo.ts` — Claude API wrapper for SEO generation
- `src/app/api/admin/cms/seo/ai-generate/route.ts` — AI SEO generation endpoint
- `src/app/api/admin/cms/seo/ai-apply/route.ts` — AI SEO apply endpoint

### Files Modified
- `src/app/admin/website/seo/page.tsx` — AI Optimize button, AI Review Modal, AI Generate All button, confirm dialog

---

## Phase 8 — Complete (Launch Ready)
- Phase 8 Job Management & Photo Documentation fully operational
- See `docs/POST_LAUNCH_ROADMAP.md` for deferred enhancements (marketing library, categories, collages, portfolio, vehicle SVG upgrade)

---

## Session G — 2026-02-13 (Service History Tab, Sidebar Cleanup, Photo Feature Button)

### Changed: Customer Detail — Photos tab → Service History tab
- Replaced the Photos tab (before/after sliders grouped by visit) with a full Service History table
- Table columns: Date, Vehicle, Services (truncated >2), Add-ons count, Photos count, Duration, Staff, Status pill
- All job statuses shown (scheduled, intake, in_progress, completed, closed, cancelled)
- Filters: status dropdown, vehicle dropdown (when customer has 2+ vehicles)
- Pagination: 20 per page
- Row click navigates to `/admin/jobs/[id]`
- Uses existing `/api/admin/jobs?customer_id=` endpoint (no new API)
- Removed unused imports: `BeforeAfterSlider`, `getZoneLabel`, `Camera` icon

### Changed: Admin Sidebar — Flatten Service Records
- "Service Records" is now a direct link to `/admin/jobs` (no dropdown, no chevron)
- Icon changed from `Briefcase` to `ClipboardList`
- "Photo Gallery" is now a standalone sidebar item (same level, `Camera` icon)
- Both gated behind `photo_documentation` feature flag

### New: Job Detail — Star/Feature Button on Photos
- Each photo thumbnail now has a star icon button (top-right corner, overlaid)
- Unfeatured: outline star in white/gray; Featured: filled star in yellow/gold
- Click toggles `is_featured` via `PATCH /api/admin/photos/[id]`
- Optimistic UI with revert on error + success/error toasts
- Tooltip: "Feature for marketing" / "Remove from featured"
- Replaces the passive featured badge (yellow checkmark circle)

### API: /api/admin/jobs — Added vehicle_id filter
- New `vehicle_id` query param filters jobs by vehicle

### Files Modified
- `src/app/admin/customers/[id]/page.tsx` — Service History tab replaces Photos tab
- `src/app/admin/jobs/[id]/page.tsx` — Star toggle button on photo thumbnails
- `src/app/admin/admin-shell.tsx` — Photo Gallery feature flag gating
- `src/lib/auth/roles.ts` — Sidebar structure flattened
- `src/app/api/admin/jobs/route.ts` — vehicle_id filter

---

## Session D — 2026-02-13 (Admin Jobs / Service Records Detail Page)

### New: /admin/jobs/[id] — Job Detail Page
- **Overview tab**: Job summary card (customer link, vehicle, staff, duration), timeline with all status transitions (created → intake → work → completed → pickup → cancelled), original services list with pricing, add-ons section with status badges (approved/declined/pending/expired) + discount display + issue type, totals sidebar card with grand total + transaction link, quick stats card (photos/duration/services/addons), intake notes, pickup notes, cancellation info
- **Photos tab**: Before/after `BeforeAfterSlider` per zone (only zones with both intake + completion), photo grids grouped by phase (intake/progress/completion) with thumbnail grid, fullscreen lightbox with zone label, phase, creator name, timestamp, featured/internal badges, notes
- Source badge: Appointment (purple, CalendarDays icon) vs Walk-In (amber, Footprints icon)
- 3-column layout: main content (2 cols) + sidebar (1 col)
- Auth: `admin.photos.view` permission via API route

### Files
- Created: `src/app/admin/jobs/[id]/page.tsx` (860 lines)

---

## Session 52 — 2026-02-13 (Customer Portal: Service Records Restructure)

### New: /account/services — Service History page
- Clean row-style visit list (one row per completed/closed job, most recent first)
- Each row: date, vehicle, comma-separated services, addon count, photo count, status pill
- Status pills: Completed (green), Closed (slate)
- Vehicle filter dropdown (shown when 2+ vehicles)
- "Load more" pagination (10 per page)
- Row click navigates to service detail page

### New: /account/services/[jobId] — Service Detail page
- Full service summary: date (weekday + full date), vehicle, services with prices, approved add-ons
- Duration display (formatted from timer_seconds)
- Staff attribution ("Serviced by Segundo")
- Expandable "Before & After Photos" section with zone-by-zone BeforeAfterSliders
- Link to public gallery page for full gallery view
- Auth: verifies job belongs to logged-in customer, returns 404 otherwise

### New: GET /api/account/services — Visit list API
- Cookie-based customer auth
- Returns paginated job list with vehicle, services, addon_count, photo_count, gallery_token
- Supports page/limit/vehicle_id query params
- Only shows completed/closed jobs

### New: GET /api/account/services/[jobId] — Service detail API
- Returns full job details: services, addons, photos (grouped by phase), staff, timer, vehicle
- Excludes internal and progress-phase photos
- Auth: customer must own the job

### Updated: Customer portal navigation
- "Photos" tab renamed to "Service History" → `/account/services`
- Dashboard "View all photos" link changed to "View service history"
- Old `/account/photos` redirects to `/account/services`

### Updated: Admin sidebar
- "Photos" renamed to "Service Records" with children: "All Jobs" + "Photo Gallery"

### Files Created
- `src/app/(account)/account/services/page.tsx` — visit list page
- `src/app/(account)/account/services/[jobId]/page.tsx` — service detail page
- `src/app/api/account/services/route.ts` — visit list API
- `src/app/api/account/services/[jobId]/route.ts` — service detail API

### Files Modified
- `src/components/account/account-shell.tsx` — nav tab rename
- `src/app/(account)/account/page.tsx` — dashboard link update
- `src/app/(account)/account/photos/page.tsx` — replaced with redirect
- `src/app/admin/admin-shell.tsx` — Briefcase icon + nav filter key
- `src/lib/auth/roles.ts` — Service Records nav with children

---

## Session 51 — 2026-02-13 (Admin Photo Gallery Enhancement)

### Enhanced: /admin/photos page (full spec rewrite)
- **Phase toggle pills** — colored pill buttons (All | Intake | Progress | Completion) replace dropdown
- **Staff dropdown filter** — "Taken By" dropdown populated from active employees, filters by `created_by`
- **Featured toggle** — "Featured only" checkbox in filter bar
- **Search text input** — searches customer name or vehicle make/model
- **Enhanced photo cards** — customer name, vehicle (year make model), and date shown below each thumbnail
- **Hover effects** — subtle scale + shadow on card hover
- **Select mode toggle** — "Select" button in header toggles bulk selection (checkboxes hidden by default)
- **Floating bulk action bar** — fixed bottom bar with Feature/Unfeature/Mark Internal/Mark Public actions
- **Photo detail modal enhancements** — job link (clickable, opens POS), keyboard navigation (left/right arrows, Escape to close), "Featured on website" and "Internal only" as labeled toggle buttons with ON/OFF indicator, click-outside to close
- **Empty state differentiation** — "No photos yet" (with helpful message) vs "No photos match your filters" (with clear filters link)

### Enhanced: GET /api/admin/photos response shape
- Response now uses `{ photos: [...], total, page, limit }` format (was `{ data, total }`)
- Each photo includes nested `job`, `customer`, `vehicle`, `taken_by` objects
- `taken_by` fetched from `created_by` → employees join (who took the photo)

### Files Modified
- `src/app/admin/photos/page.tsx` — full rewrite (748 → 587 lines, significantly enhanced UI)
- `src/app/api/admin/photos/route.ts` — response shape transformation with `taken_by` employee lookup

---

## Session 50 — 2026-02-13 (Customer Portal Photo History Enhancements)

### Enhanced: /api/account/photos API
- Added pagination support (`page`, `limit` query params) with total count for load-more
- Added vehicle filter (`vehicle_id` query param) to filter photos by vehicle
- Restructured response: photos grouped by phase (`intake`/`completion`) instead of flat list
- Added `zone_label` to each photo for display convenience
- Added `vehicles` array in response for filter dropdown population
- Excluded `progress` phase photos from customer view (internal documentation only)
- Added `gallery_token` to each visit for potential future linking
- Added `photo_count` per visit with intake/completion breakdown

### Enhanced: /account/photos page
- **Vehicle filter dropdown** — only shown when customer has multiple vehicles with photos
- **"Load more" pagination** — shows count (e.g., "5 of 12"), appends next batch without full reload
- **Photo lightbox** — fullscreen overlay with close (X), left/right navigation arrows, photo counter, zone label, phase label, download button. Click any photo or slider to open.
- **Improved zone matching** — first matching intake+completion pair per zone shown as `BeforeAfterSlider`, extras in grid
- **Photo count** — shown on each visit card header

### New: "Your Last Service" card on /account dashboard
- Shows date, vehicle (year make model — color), services performed
- Features 1 before/after `BeforeAfterSlider` pair (prefers exterior zones)
- "View all photos" link to `/account/photos`
- Only visible when customer has at least 1 completed job with photos

### Enhanced: Admin photos API
- Added search support (customer name/phone lookup using related-table-first pattern)
- Added pagination via `page`/`limit` params
- Added `featured` filter param

### Files Modified
- `src/app/api/account/photos/route.ts` — rewritten with pagination, vehicle filter, phase grouping
- `src/app/(account)/account/photos/page.tsx` — rewritten with vehicle filter, load more, lightbox
- `src/app/(account)/account/page.tsx` — added Last Service card with before/after slider
- `src/app/api/admin/photos/route.ts` — enhanced with search, pagination, featured filter

---

## Session 49 — 2026-02-13 (Revert Vehicle SVG, Fix IP Restriction)

### Revert: Vehicle silhouette changes
- Previous session created a `feature/vehicle-silhouettes` branch with custom SVG vehicle zone picker components
- Changes were never merged to main — branch left as-is for future reference if needed
- No files on main were affected

### Fix: Middleware missing `::ffff:127.0.0.1` localhost check
- `getClientIp()` treated `::1` and `127.0.0.1` as null (localhost) but missed `::ffff:127.0.0.1`
- `::ffff:127.0.0.1` is the IPv4-mapped IPv6 address Node.js commonly uses in dev
- Added to both `x-forwarded-for` and `x-real-ip` checks in `src/middleware.ts`

---

## Session 48 — 2026-02-13 (Fix POS IP Restriction — Dev Blocking + RLS)

### Fix: Middleware always blocked in dev due to IP mismatch
- `getClientIp()` returned `::1` or `127.0.0.1` in local dev — never matches whitelisted public IPs
- Now treats loopback addresses as `null` (same as "no IP detected")
- IP check logic flipped: `!clientIp || !ips.includes(clientIp)` → `clientIp && !ips.includes(clientIp)`
- Old: null IP = blocked (dev always blocked). New: null IP = allowed (local dev works), real IP checked in production
- Error message now includes the blocked IP for easier debugging
- Cache TTL reduced from 60s to 10s so settings changes take effect faster
- Files: `src/middleware.ts`

### Fix: RLS policy blocked non-super_admin from saving settings
- `settings_write` policy on `business_settings` required `is_super_admin()` — only 1 user (Nayeem)
- Admin users (Su Khan) got 42501 RLS violation on upsert, writes silently failed
- Affected ALL 12 settings pages (Tax Config, Business Profile, Messaging, etc.)
- Changed policy to use `is_admin_or_above()` — allows both `super_admin` and `admin` roles
- Migration: `20260213000001_fix_settings_rls.sql`

---

## Session 47 — 2026-02-12 (Fix POS IP Restriction — Dead Middleware)

### Fix: POS IP restriction was completely non-functional
- In Session (commit 26dd5b3), `src/middleware.ts` was incorrectly renamed to `src/proxy.ts` — Next.js has no "proxy.ts" convention
- The file became dead code: nothing imported it, the `proxy()` function never executed
- Admin > Settings > POS Security saved IPs correctly to `business_settings`, but enforcement never ran
- Fix: renamed `proxy.ts` → `middleware.ts`, renamed exported function `proxy()` → `middleware()`
- Deleted vestigial `src/app/api/internal/allowed-ips/route.ts` (was used by old self-fetch approach, nothing calls it)
- No logic changes — the IP check, cache, matcher, and Supabase query were all correct
- Files: `src/middleware.ts` (renamed from `src/proxy.ts`), deleted `src/app/api/internal/allowed-ips/route.ts`

---

## Session 46 — 2026-02-12 (Flag Flow UX Overhaul — Issue Dropdown, SMS Rewrite, Auth Page, Badge, Checkout Permission)

### Fix: Flag flow — issue type dropdown replaces service-name picker
- Step 1 of flag flow now asks "What did you find?" with 10 predefined issue types (Scratches, Water Spots, Paint Damage, Pet Hair/Stains, Interior Stains, Odor, Headlight Haze, Wheel Damage, Tar/Sap/Overspray, Other)
- Issue types are large tappable grid buttons (2x5 grid) designed for iPad with gloves — 72px min height
- "Other" shows free-text textarea for custom issue description
- New flow: Issue Type → Zone Select → Photo → Catalog → Discount → Delay → Message → Preview (was: Zone → Photo → Catalog → ...)
- DB migration adds `issue_type` and `issue_description` columns to `job_addons` table with CHECK constraint
- New utility: `src/lib/utils/issue-types.ts` — `ISSUE_TYPES` array, `getIssueHumanReadable()`, `getIssueLabel()`, `friendlyServiceName()`
- `friendlyServiceName()` converts catalog names to conversational descriptions ("Paint Correction Stage 1" → "a paint correction service")
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`, `src/lib/utils/issue-types.ts` (new), `src/lib/supabase/types.ts`, `supabase/migrations/20260212000011_addon_issue_type.sql`

### Fix: SMS rewrite — conversational tone, no MMS attachment
- Old SMS: `${message}\n\nApprove or decline here: ${url}\n\n— ${biz.name}` (with raw service name as "issue found" + confusing MMS attachment)
- New SMS: `Hi {first_name}, while working on your {make model} we noticed {issue_human_readable}.\nWe recommend {friendly_service} for an additional ${price} — shall we go ahead?\nView pictures and approve or decline here: {url}\n{detailer_first_name}\n{biz.name}`
- Removed `mediaUrl` from `sendSms()` call — no more extra Twilio media link at bottom of SMS
- Photos now only viewable on the authorization web page (much better UX)
- Detailer's first name added for personal touch
- Vehicle description uses make/model only (no year/color for SMS brevity)
- Email template also rewritten with conversational messaging and detailer name
- Files: `src/app/api/pos/jobs/[id]/addons/route.ts`

### Fix: Authorization page redesign — mobile-first, conversational
- Header: "Additional Service Authorization Request" (most prominent, large bold text)
- Conversational message: "Hi {name}, While working on your {make model}, {detailer} noticed {issue}. We'd like to take care of it while your vehicle is already here."
- Photos section: labeled "Photos from our inspection" with scrollable gallery
- Proposed Add-On Service section: service name + description in card, clear "Additional Cost" in large font
- New Ticket Total: shows original services + approved addons + this addon in blue info box
- Approve button: full-width green, 48px height for mobile touch
- Decline button: full-width secondary outline below (stacked, not side-by-side)
- Business footer: name, address, phone (from `getBusinessInfo()`)
- Files: `src/app/authorize/[token]/page.tsx`, `src/app/authorize/[token]/authorization-client.tsx`

### Fix: Addon status badge on job queue cards
- Replaced simple bell icon with proper badge pill showing addon status
- Badge states: "⚑ Addon Pending" (amber), "✓ Addon Approved" (green), "✗ Addon Declined" (gray)
- Priority: pending > approved > declined (shows most actionable status)
- Badge positioned below customer info, above assigned staff line
- Uses existing `addons:job_addons(id, status)` from jobs list API (no additional queries)
- Files: `src/app/pos/jobs/components/job-queue.tsx`

### Fix: Cashier checkout permission — explicit check + descriptive errors
- `checkout-items` route had NO permission check — only HMAC auth. Added `pos.jobs.view` check (all POS roles have this by default)
- Frontend now distinguishes error types: 403 → "You don't have permission..." / 404 → "Job not found" / other → generic
- Audit: all job-related API routes reviewed. Routes with explicit checks: `POST /jobs` (pos.jobs.manage), `PATCH /jobs/[id]` (pos.jobs.manage for editable fields), `POST /cancel` (pos.jobs.cancel), `GET /checkout-items` (pos.jobs.view, NEW)
- Files: `src/app/api/pos/jobs/[id]/checkout-items/route.ts`, `src/app/pos/jobs/page.tsx`

---

## Session 45 — 2026-02-12 (Flag Flow — Annotated Images, Vehicle-Size Pricing, Quantity Rules)

### Fix: Annotated images not sent to customer in flag flow
- Detailer markup (circles, arrows, text labels) was NOT visible to the customer — original unmarked photo was sent via MMS, shown in email, and displayed on the authorization page
- Root cause: `annotation_data` JSONB was stored in DB and `AnnotationOverlay` component existed, but was never used in customer-facing contexts
- **Authorization page** (`/authorize/[token]`): Added `AnnotationOverlay` SVG overlay on top of photos — annotations now visible when customer views the page
- **MMS/Email**: Created `src/lib/utils/render-annotations.ts` — server-side utility using `sharp` that composites SVG annotations onto the actual image pixels, uploads to Supabase Storage, and returns a public URL. Both addon create and resend routes now send the annotated version
- **Preview step**: Flag flow preview now shows `AnnotationOverlay` on the photo so detailer sees exactly what the customer will see
- Files: `src/lib/utils/render-annotations.ts` (new), `src/app/authorize/[token]/page.tsx`, `src/app/api/pos/jobs/[id]/addons/route.ts`, `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts`, `src/app/pos/jobs/components/flag-issue-flow.tsx`

### Fix: Flag flow service picker shows $0.00 prices and wrong UX
- Service prices showed as $0.00 because the flag flow used raw `base_price || price || 0` from `/api/pos/services` — most services use `service_pricing` table for vehicle-size-aware pricing, not `base_price`
- Replaced the flat catalog list with the existing `CatalogBrowser` component used by the quote builder
- Now has tabs (Services / Products / Custom) instead of a mixed flat list
- Services tab: full category browsing, search, `ServicePricingPicker` for multi-tier services, vehicle-size-aware pricing via `resolveServicePrice()`
- Products tab: full category browsing with proper `retail_price`
- Custom tab: retained custom line item form
- Vehicle `size_class` now flows from job detail → flag flow props → CatalogBrowser's `vehicleSizeOverride`
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`

### Fix: Flag flow must follow service quantity rules
- Flag flow had zero duplicate prevention — could add services already on the job, no per-unit max enforcement
- Built `addedServiceIds` set from `job.services[]` + approved `job.addons[]` service IDs
- Passed to `CatalogBrowser`'s `addedServiceIds` prop — shows green checkmark badge on already-added services
- Added explicit duplicate guard in `handleAddService()` — shows warning toast and blocks selection
- Per-unit max enforcement handled by `ServicePricingPicker`'s built-in `PerUnitPicker`
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`

---

## Session 44 — 2026-02-12 (Customer Data Persistence Through Checkout + Hide Paid Jobs)

### Fix: Customer data persistence through job checkout flow
- Root cause: `checkout-items` API only selected `(id, first_name, last_name)` for the customer — missing `phone`, `email`, `customer_type`, `tags`
- This caused 3 downstream bugs:
  1. **Customer type prompt always shown**: `customer_type` was undefined → prompt appeared even for customers with type already set
  2. **Receipt modal couldn't send SMS/email**: `phone` and `email` were undefined → receipt options had no pre-filled contact data
  3. **Customer data gap through checkout**: The ticket customer object was missing critical fields for the entire checkout flow
- Fix: Added `phone, email, customer_type, tags` to the customer select in `checkout-items/route.ts`
- Fix: Updated `jobs/page.tsx` type definition and customer construction to explicitly include all fields
- Files: `src/app/api/pos/jobs/[id]/checkout-items/route.ts`, `src/app/pos/jobs/page.tsx`

### Fix: Hide paid/closed jobs from POS jobs queue
- Paid jobs (status `closed`) remained visible in the Jobs queue with a "Paid" badge
- Fix: Added `.neq('status', 'closed')` filter to the jobs list API query, matching existing `.neq('status', 'cancelled')` pattern
- Closed jobs are still accessible via POS Transactions list and Customer History tab
- File: `src/app/api/pos/jobs/route.ts`

---

## Session 43 — 2026-02-12 (Checkout Items Response Parsing Fix)

### Fix: Checkout items response parsing for job-to-register flow
- "Failed to load checkout items" toast was shown even when API returned 200
- Root cause: single overly-broad try/catch caught all errors (fetch, JSON parse, and processing) under one generic message, masking the actual failure point
- Fix: separated error handling into distinct phases — fetch, JSON parse, response shape validation, and processing — each with specific error messages and `console.error` logging
- Added explicit null/shape checks: validates `data` exists and `data.items` is an array before processing
- Fixed TypeScript errors: `Customer` and `Vehicle` types now properly cast from partial API join results
- Fixed `id` property duplication: spread `data.customer` first, then override `id` (was reversed, causing TS2783)

### Feature: Auto-apply coupon from linked quote at checkout
- When a job is linked to a quote that has a `coupon_code`, the coupon is now automatically validated and applied to the POS register ticket
- Uses existing `/api/pos/coupons/validate` endpoint to verify coupon is still valid
- Fails silently if coupon is expired/invalid — checkout still proceeds without discount
- Files: `src/app/pos/jobs/page.tsx`

---

## Session 42 — 2026-02-12 (Duplicate Toast Fix + Service Quantity Enforcement)

### Fix: Duplicate toast on add service
- Toast fired twice when adding a service from the catalog in the quote builder
- Root cause: `catalog-browser.tsx` and `service-detail-dialog.tsx` fired their own toasts AND the callback (`handleAddService` in `quote-builder.tsx`) also fired a toast
- Fix: When `onAddService`/`onAdd` callbacks are provided (callback mode), skip the local toast — let the caller own the notification
- Files: `catalog-browser.tsx` (5 toast sites), `service-detail-dialog.tsx` (2 toast sites)

### Feature: Service quantity enforcement in quote builder
- **Single-per-vehicle rule**: Most detailing services (28 of 30) are one-per-vehicle. Adding a duplicate now shows warning toast "Already added — remove it first to swap" instead of creating a duplicate line item
- **Per-unit services** (Scratch Repair): Tapping again increments `perUnitQty` up to `per_unit_max` (4 panels). At max, shows warning toast with max count
- **Visual indicator**: Already-added services show green highlight with checkmark badge in the catalog grid (both search results and category browse)
- **Stepper enforcement in item rows**:
  - Regular services: quantity stepper hidden (always qty 1, use X to remove)
  - Per-unit services: stepper controls `perUnitQty` with min 1 / max `per_unit_max`
  - Products: stepper unchanged (unrestricted)
- New reducer action: `UPDATE_PER_UNIT_QTY` — updates per-unit quantity and recalculates pricing
- New `TicketItem` field: `perUnitMax` — stores service's max units for stepper enforcement
- Applied to both quote builder (quote-reducer) and POS register (ticket-reducer)
- Files: `types.ts`, `quote-reducer.ts`, `ticket-reducer.ts`, `quote-builder.tsx`, `catalog-browser.tsx`, `catalog-grid.tsx`, `catalog-card.tsx`, `quote-item-row.tsx`, `ticket-item-row.tsx`, `jobs/page.tsx`

---

## Session 41 — 2026-02-12 (Toast Stacking Fix)

### Fix: Toast notifications stack vertically instead of overlapping
- Added `expand` prop to `<Toaster>` — toasts now always display in a fully expanded vertical stack instead of collapsing on top of each other
- Added `visibleToasts={5}` to allow up to 5 simultaneous toasts (sonner default was 3)
- File: `src/app/layout.tsx`

---

## Session 40 — 2026-02-12 (Completion SMS, Job-to-Checkout, Gallery Addons + Timestamp)

### Fix: Completion SMS — Business Info + Vehicle Name
- Removed MMS `mediaUrl` from `sendSms()` call — no more raw image link in SMS
- Vehicle display now uses make + model only (no year), fallback to "your vehicle"
- SMS template includes: gallery link, business name, address, phone, today's closing time
- Closing time derived from `business_hours` in `business_settings` (PST timezone)
- If business is closed today, shows "See our hours online"
- Email updated with same vehicle display and enhanced business info footer with hours
- Imported `getBusinessHours()` from `@/lib/data/business-hours`

### Fix: Job → POS Checkout Flow
- **Checkout button on job detail**: Prominent blue "Checkout" button for completed jobs, replaces "Customer Pickup" as primary action
- **Checkout pill on job queue**: Completed jobs show a "Checkout" pill button, tapping loads items directly into POS register
- **"Paid" indicator**: Closed jobs show green "Paid" badge instead of checkout button (both detail and queue)
- **Double-checkout prevention**: `GET /api/pos/jobs/[id]/checkout-items` returns 400 if job is already closed
- **Checkout-items enrichment**: Response now includes `is_taxable` and `category_id` per item (services, addons, products) for proper tax calculation and coupon eligibility
- **RESTORE_TICKET flow**: Checkout handler builds a full TicketState from checkout-items and dispatches RESTORE_TICKET, then navigates to `/pos` register
- **Auto-linking preserved**: Transaction creation route already auto-links most recent completed job → closed. No changes needed.
- Shared checkout handler in `src/app/pos/jobs/page.tsx` — used by both queue and detail views

### Fix: Gallery Page — Approved Addons in Services Performed
- Gallery page (`/jobs/[token]/photos`) now queries `job_addons` where `status = 'approved'`
- Addon service names resolved from `services` table (not just `custom_description`)
- Listed below original services with price (after discount)
- Gallery API route (`/api/jobs/[token]/photos`) also returns `addons` array

### Fix: Gallery Page — Completion Time
- Completion date now includes time: "Thursday, February 12, 2026 at 5:23 PM"
- Uses `Intl.DateTimeFormat` with `hour`, `minute`, `hour12` options in PST timezone

---

## Session 39 — 2026-02-12 (Walk-In Job Fix + Product & Coupon Checkout Bridge)

### Walk-In Job Creation Fix
- Added defensive `serviceId` null check in service item filter — `i.itemType === 'service' && i.serviceId` — prevents items with null service IDs from reaching the job creation API
- Validation message clarified: "At least one service is required to create a job"

### Product Carryover to Checkout (Quote → Job → Checkout Bridge)
- `GET /api/pos/jobs/[id]/checkout-items` now checks `job.quote_id`
- If linked quote exists, queries `quote_items` for product items (`product_id IS NOT NULL`)
- Product items returned alongside service items and addons with `item_type: 'product'`
- Services from JSONB now include `quantity` and `tier_name` when present
- Non-walk-in jobs (no `quote_id`) continue working as before — no product lookup

### Coupon Carryover to Checkout
- Migration `20260212000010_add_coupon_code_to_quotes.sql`: adds `coupon_code TEXT` column to `quotes` table
- `createQuoteSchema` and `updateQuoteSchema` accept optional `coupon_code` field
- `createQuote()` and `updateQuote()` service functions save `coupon_code` to DB
- All quote save paths (Save Draft, Send Quote, Create Job) now persist `coupon_code` from client state
- `checkout-items` route reads `coupon_code` from linked quote and returns it in the response
- POS register can auto-apply the coupon at checkout

### Checkout Bridge Summary
```
Quote (services + products + coupon) → Create Job (services only, quote_id saved)
→ Checkout Items (services from job JSONB + products from quote_items + coupon from quotes.coupon_code)
→ Register ticket (everything)
```

### Files Changed
- `supabase/migrations/20260212000010_add_coupon_code_to_quotes.sql` (new)
- `src/lib/supabase/types.ts` (Quote.coupon_code field)
- `src/lib/utils/validation.ts` (coupon_code in quote schemas)
- `src/lib/quotes/quote-service.ts` (save coupon_code in create/update)
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` (defensive filter, coupon_code in all save paths, updated toast)
- `src/app/api/pos/jobs/[id]/checkout-items/route.ts` (product + coupon bridge from linked quote)

---

## Session 38 — 2026-02-12 (Walk-In Mode on Quote Builder + Quote-to-Job Conversion)

### Walk-In Mode on Quote Builder
- "New Walk-In" button on Jobs tab now navigates to `/pos/quotes?mode=builder&walkIn=true`
- Quote Builder accepts `walkInMode` prop: changes header to "New Walk-In", hides "Valid Until" date picker and "Send Quote" button, replaces "Save Draft" with "Create Job"
- On "Create Job": saves quote as `status='converted'` for audit trail, maps service items to job services, creates job via `POST /api/pos/jobs`, navigates to Jobs tab
- Customer required (validation enforced), at least one service required
- Products on quotes notify user via toast "Products will be added at checkout"
- Coupon code stored in job notes as "Coupon: {code}" for cashier reference

### Quote-to-Job Conversion (Quote Detail)
- "Create Job" button added to quote detail view for `draft`, `sent`, `viewed`, `accepted` statuses
- Permission-gated: requires `pos.jobs.manage` and quote must have a customer
- Maps service items to job services, creates job, updates quote status to `converted`
- "Converted" status section now shows "Converted to job" vs "Converted to appointment"

### Database Changes
- Migration `20260212000009_jobs_add_quote_id.sql`: adds `quote_id` UUID FK column + partial index to `jobs` table
- `POST /api/pos/jobs` now accepts `quote_id` and `notes` fields, includes server-side duplicate check (409 if job already exists for same quote)
- `createQuote()` service function now respects optional `status` field (supports 'draft' | 'converted')

### Old Walk-In Flow Removed
- Deleted `src/app/pos/jobs/components/walk-in-flow.tsx` (612 lines)
- Removed `WalkInFlow` import and `walkin` view mode from jobs page
- Zero orphaned references

### Files Changed
- `src/app/pos/quotes/page.tsx` — reads `walkIn` query param, passes to builder
- `src/app/pos/components/quotes/quote-builder.tsx` — accepts `walkInMode` prop, passes to ticket panel, updates header
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — walk-in mode UI changes, `handleCreateJob()` handler
- `src/app/pos/components/quotes/quote-detail.tsx` — "Create Job" button, `handleCreateJobFromQuote()` handler
- `src/app/pos/jobs/page.tsx` — routes walk-in to quote builder, removed WalkInFlow
- `src/app/api/pos/jobs/route.ts` — accepts `quote_id`/`notes`, duplicate check
- `src/lib/quotes/quote-service.ts` — respects `status` field on create
- `src/lib/utils/validation.ts` — added `status` to `createQuoteSchema`
- `supabase/migrations/20260212000009_jobs_add_quote_id.sql` — new migration

---

## Session 37 — 2026-02-12 (Job Source Badge + Editable Job Detail + Phone Format Fix)

### Notes Card Tap-to-Edit
- Notes card now follows same full-tap pattern as Customer, Detailer, Services cards — tap anywhere to open edit modal
- Removed standalone pencil icon — card itself is the button with hover/active feedback
- Empty notes show "Tap to add notes" placeholder; read-only when no `pos.jobs.manage` permission

### Duplicate Job Population Fix
- **Root cause**: React strict mode double-fired mount `useEffect`, calling `POST /api/pos/jobs/populate` twice concurrently. Both calls read DB before either inserted, creating duplicates.
- **DB fix**: Added partial unique index `idx_jobs_unique_appointment_id` on `jobs(appointment_id) WHERE appointment_id IS NOT NULL`
- **API fix**: Changed `.insert()` to `.upsert()` with `ignoreDuplicates: true` — safe for concurrent calls
- **Client fix**: Added `useRef` guard to prevent mount effect double-fire
- Migration: `20260212000008_jobs_unique_appointment_id.sql` (includes commented cleanup SQL for existing dupes)

### Notes Editing Modal (iPad UX)
- Replaced inline textarea editing with bottom sheet modal matching other edit modals (customer, vehicle, services)
- Full-width textarea (5 rows), auto-focus for immediate keyboard, Save/Cancel buttons
- Pencil icon button meets 44x44px iPad touch target minimum
- Notes card always read-only on the main view; pencil icon opens modal when `pos.jobs.manage` granted

### Phone Number Display Fix
- Fixed raw E.164 format (+14243637450) displaying on job detail — now shows (424) 363-7450
- Applied existing `formatPhone()` from `@/lib/utils/format` to both editable and read-only customer sections

### Job Source Badge (Walk-In vs Appointment)
- Source determined from `appointment_id` (NULL = Walk-In, NOT NULL = Appointment)
- Badge pill on job queue cards: purple "Appt" with Calendar icon, amber "Walk-In" with Footprints icon
- Badge pill on job detail header: same styling, right of status badge

### Editable Job Detail Card
- All edits gated by `pos.jobs.manage` permission (client + server)
- Edits blocked on terminal statuses (completed, closed, cancelled)
- **Edit Customer**: Tappable card opens bottom sheet with `CustomerLookup` component
- **Edit Vehicle**: Tappable card opens bottom sheet with customer's vehicle list + "No vehicle" option
- **Edit Services**: Tappable card opens full modal with search, multi-select toggle, running total, "Update Services" button
- **Edit Notes**: Inline editable `intake_notes` field with textarea + save/cancel buttons
- **API**: PATCH `/api/pos/jobs/[id]` now separates `MANAGE_FIELDS` (customer_id, vehicle_id, services, intake_notes) from `WORKFLOW_FIELDS`. Manage fields require `pos.jobs.manage` permission + non-terminal status check via `checkPosPermission()`.
- New Vehicle card section added to job detail (previously only showed vehicle inline with customer)

## Session 36 — 2026-02-12 (Consolidate Job Permissions)

- Consolidated `pos.jobs.create_walkin` into `pos.jobs.manage` — walk-in creation now gated by manage permission
- Updated `pos.jobs.manage` description: "Create walk-in jobs, start intake, begin work, complete jobs, reassign detailer"
- Fixed `pos.jobs.cancel` detailer default to `false` (only super_admin and admin get cancel by default)
- Removed all orphaned `create_walkin` references from code, role-defaults, and docs
- POS Jobs now has 4 permissions: view, manage, flag_issue, cancel

## Sessions 34-35 — 2026-02-12 (POS Job Permission Enforcement + Detailer Reassignment)

### Detailer Reassignment on Job Detail
- Assigned staff card is tappable (permission-gated by `pos.jobs.manage`)
- Bottom sheet modal with all bookable staff: busy indicators, today's job count, checkmark on current assignee
- "Unassigned" option removes assignment
- New endpoint: `GET /api/pos/staff/available`

### Job Cancellation Flow
- Cancel button with reason dropdown (5 reasons + custom), permission-gated by `pos.jobs.cancel`
- Walk-in cancellation: silent cancel with toast
- Appointment-based cancellation: SendMethodDialog for Email/SMS/Both notification, cancels job + frees appointment slot
- Professional cancellation email (dark mode, red header, rebook CTA) + SMS notification
- DB columns: `cancellation_reason`, `cancelled_at`, `cancelled_by`
- New endpoint: `POST /api/pos/jobs/[id]/cancel`

### POS Permission Enforcement (4 Job Permissions)
- Shared `checkPosPermission()` utility at `src/lib/pos/check-permission.ts`
- All POS job buttons now gated client-side (`usePosPermission()`) AND server-side (`checkPosPermission()`)
- Permission matrix:
  | Permission | Client Gate | Server Gate |
  |---|---|---|
  | `pos.jobs.view` | Jobs tab visibility | — |
  | `pos.jobs.manage` | Walk-in + reassign | POST /api/pos/jobs |
  | `pos.jobs.flag_issue` | Flag Issue button | — |
  | `pos.jobs.cancel` | Cancel button | POST /api/pos/jobs/[id]/cancel |
- Defaults: cashier denied for cancel, flag_issue, manage

## Session 7 — 2026-02-07 (POS UX Polish)

- **Service detail dialog:** Replaced full-page service detail with dialog popup (matching product flow)
- **Quote stale state fix:** New quotes always clear previous unsaved items on mount
- **Two-line item rows:** POS ticket and quote item rows show full title on line 1, sub-text + controls on line 2
- **Sub-text formatting:** Skip "default" tier, deduplicate vehicle size vs tier label, title-case raw DB names, store `tier_label || tier_name` in reducers
- **Quote "Valid Until" default:** Auto-populates to 10 days from today
- **Vehicle size tier enforcement:** Auto-select matching tier in service dialog, disable non-matching tiers (shaded out)

## Session 6 — 2026-02-07

### Admin Quotes Read-Only Refactor
- Deleted `admin/quotes/new/page.tsx` (790 lines) and `admin/quotes/_components/service-picker-dialog.tsx` (436 lines)
- Admin list/detail pages rewritten to read-only. "Edit in POS" opens POS builder via deep-link.
- POS deep-link support: `?mode=builder`, `?mode=builder&quoteId=<id>`, `?mode=detail&quoteId=<id>`
- Net result: ~1,700 lines removed

### Employee PIN Collision Safeguards
- Partial unique index on `pin_code WHERE pin_code IS NOT NULL`
- Duplicate PIN check in create + update APIs (returns 409)

### Dashboard & Appointments UI
- Dashboard open quotes excludes drafts (separate card for drafts)
- Week at a Glance: 7-day grid below calendar
- Calendar condensed: `h-14` → `h-10`

## Session 5 — 2026-02-06

### Password Reset Flows
- Auth callback route for Supabase recovery links (`/auth/callback`)
- Inline forgot-password on admin (`/login`) and customer (`/signin`) pages
- Reset password pages for both admin and customer
- Admin "Change Password" in account dropdown

### Other Fixes
- Accept quote confirmation dialog on public page
- Staff email updates sync to Supabase Auth via API route

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 44 | Auth | No "Forgot Password?" on login pages |
| 43 | Auth | Password reset redirectTo pointed to nonexistent path |
| 42 | Quotes | Accept quote has no confirmation dialog |
| 41 | Admin | Staff can't change their own password |
| 40b | Admin | Staff email updates don't sync to Auth |

## Session 4 — 2026-02-06

### Post-Conversion Confirmation Flow
- Quote-to-appointment creates as `confirmed` (was `pending`), fires webhook
- NotifyCustomerDialog: send appointment confirmation via email/SMS/both
- Notification API endpoints for admin and POS
- Detailer dropdown fixed, auto-assign logic added

### Dark Mode (All Public Pages)
- 19 customer-facing pages + 4 email templates + 8 shared UI components
- Pattern: `dark:` Tailwind v4 class variants

### Unified SendMethodDialog
- Single reusable send dialog replacing 5 separate implementations (-276 lines)
- Inline success states (green checkmark, auto-close)
- All `alert()` calls replaced with toast notifications

## Session 3 — 2026-02-06

### Dashboard & Admin Enhancements
- Quote conversion works for any open status (not just accepted)
- Dashboard: Week at a Glance, Quotes & Customers quick-stat cards
- Quotes list: Services column, clickable customer links, relative dates
- Customers list: type badges, relative dates, email truncation
- Transactions list: Services column, relative dates, CSV export includes services
- New utility: `formatRelativeDate()`

### Customer Search & Filters
- Unified search pattern across 5 implementations (2-char min, phone detection, debounce)
- Admin Transactions search fix (PostgREST `.or()` workaround)
- Admin Customers page: 4 filter dropdowns (Type, Visit Status, Activity, Tags)
- Quote validity changed from 30 days to 10 days

### POS Quotes Tab
- Full quote management at `/pos/quotes` (20 new files, 5 modified)
- QuoteProvider + useQuote() with useReducer pattern
- Quote builder, list, detail, send/convert/delete dialogs
- Bottom nav "Quotes" tab, F3 shortcut

### Other
- Quote service picker dialog (category → service → tier browsing)
- Quotes Last Contacted column + resend functionality
- Admin link styling unified (`text-blue-600 hover:text-blue-800 hover:underline`)
- Staff scheduling moved to individual profiles, "Who's Working Today" dashboard
- Booking payment: coupon + loyalty auto-cap, Stripe $0.50 minimum handling
- Phone → Mobile labeling (global)
- Booking: auto-assign detailer, vehicle selection UX, vehicle required
- Customer: portal access toggle, sign-in auto-link, delete with double confirmation
- POS IP whitelist security
- Dynamic business info (zero hardcoded values, `getBusinessInfo()` everywhere)
- Twilio SMS: use phone number directly (not Messaging Service SID)

## Session 2 — 2026-02-06

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 38 | Portal | Zero session expiry protection |
| 37 | Admin | Session check uses cached `getSession()` |
| 39 | Auth | Customer signin doesn't show session expired message |
| 40 | All | Business name/phone/address hardcoded across 26 files |

## Session 1 — 2026-02-06

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 36 | Appointments | Calendar doesn't show today's appointments |
| 35 | Appointments | Cancellation fee "expected number" error |
| 34 | Appointments | "Cancelled" status shows time format error |
| 33 | Appointments | No times available for same-day booking |
| 32 | Admin | Session expiry shows empty pages |
| 31 | Portal | Header shows "My Account" instead of greeting |
| 30 | Booking | Confirmation shows $0.01 with full discount |
| 29 | Booking | Booking fails when discounts cover amount |
| 28 | Booking | Payment fails for amounts under $0.50 |
| 27 | Booking | Loyalty points can exceed remaining balance |
| 26 | Booking | Pre-existing TypeScript errors |

## Session 0 — 2026-02-05

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 25 | Booking | Payment fails when coupon covers full amount |
| 24 | Coupons | Delete only disables instead of deleting |
| 23 | Coupons | Single-use error message unclear |
| 21 | Coupons | Customer search uses wrong auth endpoint |
| 22 | Coupons | Duplicate coupon code not validated |
| 20 | Coupons | Editing used coupon doesn't warn |
| 19 | Admin | Session expiry shows empty pages |
| 18 | Portal | Customer dashboard coupons not displaying |
| 1 | POS | Stripe Terminal "No established connection" |
| 2 | Booking | No fallback when no bookable detailers |
| 3 | Booking | Paid bookings start as "pending" |
| 4 | Booking | Payment step not in wizard |
| 5 | Marketing | Coupons/Campaigns pages show empty |
| 6 | Booking | No flexible payment options |
| 7 | Booking | Phone shows E.164 on prefill |
| 8 | Booking | Duplicate vehicles on repeat bookings |
| 9 | Booking | Coupon section unclear |
| 10 | Booking | Missing loyalty points redemption |
| 11 | Booking | Payment rules not enforced |
| 12 | Booking | "Your Info" shown for signed-in users |
| 13 | Booking | coupon_rewards missing RLS policies |
| 14 | Booking | Coupons not validated against services |
| 15 | Booking | Available coupons missing eligibility info |
| 16 | Booking | Loyalty slider can't reach max value |
| 17 | Booking | Payment step UI inconsistent |

## Customer Portal Redesign (All Complete)

- Phase 1: Profile page (4 cards: Personal Info, Communication, Notifications, Security)
- Phase 2: Transactions page (stat cards, DataTable, receipt popup)
- Phase 3: Loyalty page (balance card, "How it works", points history)
- Phase 4: Vehicles page (grouped by type, cleaner card layout)
- Phase 5: Appointments edit flow (change date/time/vehicle/services with price diff)
- Phase 6: Dashboard polish (coupons section, loyalty explanation, Book button in header)
