 Plan to implement                                                                                                                                │
│                                                                                                                                                  │
│ Public Pages Redesign — Clean & Minimal                                                                                                          │
│                                                                                                                                                  │
│ Context                                                                                                                                          │
│                                                                                                                                                  │
│ Smart Details Auto Spa's public-facing pages currently use a 2020-era design aesthetic: multi-layer gradient backgrounds with decorative blur    │
│ circles, grid pattern overlays, vague trust stats ("5.0 stars", "100% satisfaction"), and no real before/after photography in the hero. The user │
│  wants an Apple-inspired clean & minimal redesign of ALL public pages — homepage, services, products, gallery, booking, and quote — using real   │
│ Google review data and a before/after showcase hero.                                                                                             │
│                                                                                                                                                  │
│ Goal: Elevate every public page from "functional" to "premium auto detailing brand" with generous whitespace, simplified color palette, bold     │
│ typography, real social proof, and the transformation photography that sells detailing services — while keeping the personal warmth and          │
│ credibility that the current WordPress site has.                                                                                                 │
│                                                                                                                                                  │
│ Key assets to preserve/enhance from WordPress site:                                                                                              │
│ - Logo: smartdetailsautospa.com/wp-content/uploads/2020/11/web_logo.png (also in Admin > Settings > Receipt Printer > Logo)                      │
│ - 5.0 stars on Yelp (84 reviews) + Google (44+ reviews) — display BOTH platforms                                                                 │
│ - Real work photos (interior, exterior, ceramic coating) — admin-controlled via is_featured                                                      │
│ - Team identity: Staff are trusted by customers and mentioned by name in reviews — feature them via admin-managed team section                   │
│ - Lomita Chamber of Commerce ribbon cutting, congressional recognition — credibility badges                                                      │
│ - Dark theme with blue/teal accents — keep the dark luxury feel                                                                                  │
│                                                                                                                                                  │
│ Content source architecture:                                                                                                                     │
│ - Business info (name, phone, address, email, logo): Admin > Settings > Business Profile + Receipt Printer (existing getBusinessInfo())          │
│ - Website-specific content (hero slides, tickers, ads, themes, team bios, certifications): Admin > Website (new CMS section)                     │
│ - No duplication — one source of truth per data point                                                                                            │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Design Principles                                                                                                                                │
│                                                                                                                                                  │
│ 1. Less is more — Remove decorative clutter (blur circles, grid overlays, gradient accent bars). Let content breathe.                            │
│ 2. Show the transformation — Before/after photos ARE the product. Lead with them.                                                                │
│ 3. Real social proof — Google + Yelp review data from actual platforms. Not self-reported stats.                                                 │
│ 4. Personal touch — Feature the team by name. Show the real people behind the work. Community credentials.                                       │
│ 5. One accent color — Brand blue for CTAs and interactive elements only. Everything else is near-black, white, and gray.                         │
│ 6. Generous spacing — 96-160px between major sections. Cards get 32-48px internal padding.                                                       │
│ 7. Typography hierarchy — Larger headlines (48-72px desktop), more weight contrast, tighter tracking on display text.                            │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Documentation Compliance                                                                                                                         │
│                                                                                                                                                  │
│ All implementation MUST follow the patterns documented in these project docs:                                                                    │
│                                                                                                                                                  │
│ - docs/ARCHITECTURE.md — Directory map, shared utility registry, API route patterns, 3 Supabase client types (Browser/Server/Admin), cron        │
│ infrastructure (node-cron via instrumentation.ts). New utilities go into existing shared files (types.ts, constants.ts, format.ts,               │
│ validation.ts) — never create duplicate utilities.                                                                                               │
│ - docs/CONVENTIONS.md — Tech stack (Next.js 16, TypeScript strict, Tailwind, react-hook-form + Zod, @tanstack/react-table, sonner toasts,        │
│ lucide-react icons). Auth patterns: Admin routes use createClient() → getUser() → role check → createAdminClient(). API response shapes: { data  │
│ }, { data, total, page, limit }, { error }. Page patterns: List pages use PageHeader + SearchInput + filters + DataTable. Detail pages use       │
│ PageHeader + info cards + content.                                                                                                               │
│ - docs/DESIGN_SYSTEM.md — Color palette (brand colors, semantic assignments), typography scale (text-2xl page titles, text-sm body, text-xs      │
│ badges), spacing (space-y-6 sections, p-4/p-6 card padding, gap-4 grids), component patterns (PageHeader, Search+Filter row, stat cards, status  │
│ badges). Anti-patterns: no inline styles, no custom CSS files, no alert(), no custom spinners/tables.                                            │
│ - docs/PERMISSIONS_AUDIT.md — 76-key permission system across 11 categories. Resolution: super_admin bypass → user override → role default →     │
│ deny. Server-side enforcement via requirePermission(). Client-side via usePosPermission() / usePermission().                                     │
│                                                                                                                                                  │
│ All new admin pages use shared UI components from src/components/ui/ (Button, Badge, DataTable, Dialog, Card, PageHeader, SearchInput, Switch,   │
│ etc.). All new API routes follow the auth + permission enforcement patterns documented above.                                                    │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 1: Foundation (Global Styles + Header + Footer)                                                                                             │
│                                                                                                                                                  │
│ 1.1 globals.css — Simplified Color & Spacing                                                                                                     │
│                                                                                                                                                  │
│ File: src/app/globals.css                                                                                                                        │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Remove decorative blur circle classes if any exist as utilities                                                                                │
│ - Simplify gradient definitions: keep bg-gradient-hero but make it a single clean gradient (navy to brand-900 only, drop the middle stop)        │
│ - Add new section spacing utility: .section-spacing { @apply py-24 sm:py-32 } for consistent rhythm                                              │
│ - Add .container-narrow { @apply mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 } for text-heavy sections                                                │
│ - Increase body line-height from default to 1.7 for body text                                                                                    │
│ - Update bg-gradient-cta to a subtler, single-direction gradient                                                                                 │
│                                                                                                                                                  │
│ 1.2 Site Header — Cleaner Navigation                                                                                                             │
│                                                                                                                                                  │
│ File: src/components/public/site-header.tsx (~129 lines)                                                                                         │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Simplify the header to: Logo | Nav links (Services, Products, Gallery) | Book Now CTA                                                          │
│ - Remove the second mobile nav row — use a clean hamburger menu overlay instead                                                                  │
│ - Make the "Book Now" button more prominent: slightly larger, pill-shaped, with subtle shadow                                                    │
│ - Transparent background on hero pages, transitioning to white/blur on scroll (already does this via HeaderShell)                                │
│ - Remove phone number from header (move to footer) — cleaner nav, less clutter                                                                   │
│ - Keep mobile: hamburger icon → full-screen overlay menu with large touch targets                                                                │
│                                                                                                                                                  │
│ 1.3 Site Footer — Streamlined                                                                                                                    │
│                                                                                                                                                  │
│ File: src/components/public/site-footer.tsx (~135 lines)                                                                                         │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Reduce from 4 columns to 3: Brand + Quick Links + Contact                                                                                      │
│ - Move trust badges (Insured, Certified, Eco, Satisfaction) into a horizontal strip ABOVE the footer columns                                     │
│ - Simplify styling: remove gradient accent line at top, use a clean border-t instead                                                             │
│ - Add Google review badge inline: "★ 4.8 on Google · 247 reviews"                                                                                │
│ - Keep navy background — it works well                                                                                                           │
│                                                                                                                                                  │
│ 1.4 Google + Yelp Reviews Integration (Live API)                                                                                                 │
│                                                                                                                                                  │
│ Google Place ID: ChIJf7qNDhW1woAROX-FX8CScGE (already stored in business_settings as google_review_url)                                          │
│ Yelp: Already stored in business_settings as yelp_review_url                                                                                     │
│                                                                                                                                                  │
│ New file: src/lib/data/reviews.ts                                                                                                                │
│                                                                                                                                                  │
│ Approach: Fetch real reviews from both platforms and cache them in business_settings.                                                            │
│                                                                                                                                                  │
│ - API endpoint: GET /api/cron/google-reviews — fetches from Google Places API, caches in business_settings                                       │
│   - Fetches: overall rating, review count, and up to 5 most recent/relevant reviews (author, rating, text, time)                                 │
│   - Stores as JSON in business_settings keys:                                                                                                    │
│       - google_review_rating — e.g., "5.0"                                                                                                       │
│     - google_review_count — e.g., "44"                                                                                                           │
│     - google_reviews_data — JSON array of review objects [{ author, rating, text, relativeTime }]                                                │
│     - google_reviews_updated_at — ISO timestamp                                                                                                  │
│ - Yelp data: Yelp doesn't have a free public review API. Store Yelp stats manually in business_settings:                                         │
│   - yelp_review_rating — e.g., "5.0"                                                                                                             │
│   - yelp_review_count — e.g., "84"                                                                                                               │
│   - Admin can update these from the Reviews settings page                                                                                        │
│ - Helper: getReviewData() — reads cached data from business_settings for server components                                                       │
│   - Returns { google: { rating, count, reviews }, yelp: { rating, count }, updatedAt }                                                           │
│ - Admin Settings: Update /admin/settings/reviews page:                                                                                           │
│   - Google section: cached rating + count + last updated time, "Refresh Now" button                                                              │
│   - Yelp section: manual rating + count inputs (editable)                                                                                        │
│   - Toggle: auto-refresh Google daily (on/off)                                                                                                   │
│ - Public display:                                                                                                                                │
│   - Trust bar: "★ 5.0 on Google · 44 reviews | ★ 5.0 on Yelp · 84 reviews"                                                                       │
│   - Review cards section: actual Google review text with author name, star rating, relative time                                                 │
│   - Platform logos next to ratings                                                                                                               │
│                                                                                                                                                  │
│ New env var: GOOGLE_PLACES_API_KEY (add to deployment checklist)                                                                                 │
│ Cron: Register in src/lib/cron/scheduler.ts — daily at 6 AM PST                                                                                  │
│                                                                                                                                                  │
│ 1.5 Team & About Content                                                                                                                         │
│                                                                                                                                                  │
│ Purpose: Feature the real people behind Smart Details — staff are mentioned by name in reviews, and customers trust the people behind the work.  │
│ All team content is admin-managed (add, edit, remove, reorder). Plus community credentials (Lomita Chamber ribbon cutting, congressional         │
│ recognition).                                                                                                                                    │
│                                                                                                                                                  │
│ New file: src/lib/data/team.ts                                                                                                                   │
│ - getTeamMembers() — reads from team_members table (or business_settings for simplicity)                                                         │
│ - Returns array of { name, role, bio, photoUrl }                                                                                                 │
│                                                                                                                                                  │
│ New migration addition to Wave 7: team_members table OR website_content JSONB in business_settings                                               │
│ - Simpler approach: store in business_settings as team_members (JSON array) and credentials (JSON array)                                         │
│ - Admin edits from Website > About section                                                                                                       │
│                                                                                                                                                  │
│ Admin page: /admin/website/about/page.tsx                                                                                                        │
│ - Team members: name, role, photo upload, short bio. Drag-to-reorder.                                                                            │
│ - Credentials/awards: title, description, optional image (Chamber logo, etc.)                                                                    │
│ - "About the Business" text area for the about section on the homepage                                                                           │
│                                                                                                                                                  │
│ Homepage integration:                                                                                                                            │
│ - "Meet the Team" section between Why Choose Us and CTA                                                                                          │
│ - Owner photo + brief intro, lead detailer photo + brief intro                                                                                   │
│ - Credentials strip: Lomita Chamber, congressional recognition, certifications                                                                   │
│                                                                                                                                                  │
│ About/Team page (optional): /about public page with full team bios and business story                                                            │
│                                                                                                                                                  │
│ 1.5 Photo Gallery — Admin-Controlled Pipeline                                                                                                    │
│                                                                                                                                                  │
│ How it works (existing infrastructure, clarified):                                                                                               │
│                                                                                                                                                  │
│ The public gallery and all before/after photos on the site are controlled by the admin through is_featured on job_photos:                        │
│                                                                                                                                                  │
│ 1. Detailer completes a job → photos are captured during intake/progress/completion phases                                                       │
│ 2. Admin reviews photos in either:                                                                                                               │
│   - /admin/jobs/[id] Photos tab → star toggle button (just added in Session G)                                                                   │
│   - /admin/photos gallery → featured/internal toggles + bulk actions                                                                             │
│ 3. Admin stars/features the best photos → sets is_featured = true                                                                                │
│ 4. Public site automatically shows featured photos:                                                                                              │
│   - Homepage hero: getFeaturedBeforeAfter() picks the best featured pair (intake + completion for same zone, prioritizes exterior, most recent)  │
│   - Public gallery (/gallery): Shows ALL is_featured = true AND is_internal = false photos with both intake + completion (before/after pairs)    │
│   - Service pages: Can show featured photos matching the service type                                                                            │
│ 5. Admin un-stars a photo → it disappears from the public site immediately                                                                       │
│                                                                                                                                                  │
│ New file: src/lib/data/featured-photos.ts                                                                                                        │
│ - getFeaturedBeforeAfter(options?) — queries job_photos for featured pairs                                                                       │
│   - Joins jobs for vehicle/service info                                                                                                          │
│   - Filters: is_featured = true, is_internal = false                                                                                             │
│   - Groups by (job_id, zone) — needs both intake AND completion phase                                                                            │
│   - Options: { limit?: number, serviceCategory?: string, zone?: string }                                                                         │
│   - Returns array of { beforeUrl, afterUrl, vehicleInfo, serviceName, zone }                                                                     │
│ - getHeroBeforeAfter() — calls getFeaturedBeforeAfter({ limit: 1 }) with exterior zone priority                                                  │
│ - Used by: homepage hero, service pages, gallery page (as data source supplement)                                                                │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 2: Homepage Redesign                                                                                                                        │
│                                                                                                                                                  │
│ 2.1 Hero Section — Before/After Showcase                                                                                                         │
│                                                                                                                                                  │
│ File: src/components/public/hero-section.tsx (~103 lines)                                                                                        │
│                                                                                                                                                  │
│ Current: Dark gradient background with decorative blur circles, grid pattern, pulsing badge, "Your Car Deserves the Best" headline.              │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Remove: Blur circles, grid pattern overlay, pulsing dot badge                                                                                  │
│ - Background: Clean single gradient (navy → brand-900), no decoration                                                                            │
│ - Left side (text): Large bold headline "Premium Mobile Detailing" (48-72px), one-line subtext with Google review stars inline ("★ 4.8 · 247     │
│ Google Reviews · Lomita, CA"), single CTA button "Book Appointment"                                                                              │
│ - Right side: Featured BeforeAfterSlider showing the best before/after pair from completed jobs                                                  │
│ - Layout: Split-screen on desktop (text left, slider right), stacked on mobile (text on top, slider below)                                       │
│ - Data: Server component fetches one featured before/after pair from job_photos (is_featured=true, has both intake + completion for same zone)   │
│                                                                                                                                                  │
│ New file: src/lib/data/featured-photos.ts                                                                                                        │
│ - getFeaturedBeforeAfter() — queries job_photos for the best featured pair (prioritizes exterior zones, most recent)                             │
│ - Returns { beforeUrl, afterUrl, vehicleInfo, serviceName } or null                                                                              │
│                                                                                                                                                  │
│ 2.2 Trust Bar — Real Review Stats (Both Platforms)                                                                                               │
│                                                                                                                                                  │
│ File: src/components/public/trust-bar.tsx (~43 lines)                                                                                            │
│                                                                                                                                                  │
│ Current: 4-stat card with CountUp animations (Years, Vehicles, Stars, Satisfaction).                                                             │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Simplify to a clean horizontal strip (not a floating card with negative margin)                                                                │
│ - Stats inline: "★ 5.0 Google (44 reviews)" | "★ 5.0 Yelp (84 reviews)" | "6,000+ Vehicles" | "Same-Day Available"                               │
│ - Small Google and Yelp platform icons next to ratings                                                                                           │
│ - Remove CountUp animation (cleaner, faster LCP)                                                                                                 │
│ - Use real data from getReviewData() (Google live + Yelp manual)                                                                                 │
│ - Subtle border-top and border-bottom separators, light gray background (bg-gray-50)                                                             │
│ - No negative margin hack — sits naturally in page flow                                                                                          │
│                                                                                                                                                  │
│ 2.3 Services Section — Bento-Style Grid                                                                                                          │
│                                                                                                                                                  │
│ File: src/app/(public)/page.tsx (~160 lines)                                                                                                     │
│                                                                                                                                                  │
│ Current: 3-column uniform grid of service category cards.                                                                                        │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Section header: "Our Services" with short descriptor line                                                                                      │
│ - Bento grid layout: 1 large featured card (e.g., Ceramic Coatings — the #1 SEO priority) spanning 2 columns + 2 smaller cards in right column,  │
│ then 3 equal cards in second row                                                                                                                 │
│ - Each card: clean white background, category name, short description, "starting from $X" price indicator, arrow icon                            │
│ - Remove gradient accent bar on hover — use subtle border-bottom color change instead                                                            │
│ - Cards link to /services/[categorySlug]                                                                                                         │
│                                                                                                                                                  │
│ 2.4 Why Choose Us → Simplified                                                                                                                   │
│                                                                                                                                                  │
│ Current: 4-column grid with icon badges.                                                                                                         │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Reduce to 3 items max (most impactful differentiators)                                                                                         │
│ - Larger icons, bolder text, more whitespace                                                                                                     │
│ - Consider: "Mobile Service" | "Ceramic Pro Certified" | "Eco-Friendly Products"                                                                 │
│ - Clean divider lines between items instead of card backgrounds                                                                                  │
│ - Or replace entirely with a single before/after showcase section showing 2-3 transformation examples from the gallery                           │
│                                                                                                                                                  │
│ 2.5 Meet the Team Section (NEW)                                                                                                                  │
│                                                                                                                                                  │
│ Purpose: Humanize the brand. Staff are mentioned by name in reviews — customers trust the people. All team content is admin-managed via Website  │
│ > About & Team.                                                                                                                                  │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Section header: "Meet the Team" or "The People Behind Your Detail"                                                                             │
│ - Team cards from admin CMS: photo (circular or rounded square), name, role, 1-2 sentence bio                                                    │
│ - Admin can add/remove/reorder team members at any time                                                                                          │
│ - First team member in sort order gets a slightly larger featured card                                                                           │
│ - Optional: Lomita Chamber ribbon cutting photo, congressional recognition mention                                                               │
│ - Credentials strip below: small logos/badges for certifications, Chamber membership                                                             │
│ - Clean, warm layout — not corporate, personal                                                                                                   │
│                                                                                                                                                  │
│ 2.6 Google Review Cards Section (NEW)                                                                                                            │
│                                                                                                                                                  │
│ Purpose: Show actual review text from happy customers — more persuasive than a star rating alone.                                                │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Section header: "What Our Customers Say"                                                                                                       │
│ - 3 review cards from Google (fetched via API, cached)                                                                                           │
│ - Each card: author first name, star rating (★★★★★), review text (truncated ~150 chars with "Read more" link to Google), relative time           │
│ - Google logo watermark in corner                                                                                                                │
│ - Below cards: "See all 44 reviews on Google" + "See all 84 reviews on Yelp" links with platform icons                                           │
│ - Clean white cards on subtle gray background                                                                                                    │
│                                                                                                                                                  │
│ 2.7 CTA Section — Cleaner                                                                                                                        │
│                                                                                                                                                  │
│ File: src/components/public/cta-section.tsx (~51 lines)                                                                                          │
│                                                                                                                                                  │
│ Current: Gradient background with 2 decorative circles, centered text, 2 buttons.                                                                │
│                                                                                                                                                  │
│ New design:                                                                                                                                      │
│ - Remove decorative circles                                                                                                                      │
│ - Single clean gradient or solid dark background                                                                                                 │
│ - Larger headline, single primary CTA button ("Book Your Detail")                                                                                │
│ - Phone number as a text link below, not a button                                                                                                │
│ - More padding (py-24 sm:py-32)                                                                                                                  │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 3: Service Pages                                                                                                                            │
│                                                                                                                                                  │
│ 3.1 Services Index (/services)                                                                                                                   │
│                                                                                                                                                  │
│ File: src/app/(public)/services/page.tsx (~77 lines)                                                                                             │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Simplify hero: smaller height, clean background, clear headline "Our Detailing Services"                                                       │
│ - Remove grid pattern overlay from hero                                                                                                          │
│ - Add a brief intro paragraph below hero explaining the service tiers                                                                            │
│ - Keep the 3-column category card grid but with cleaner card styling (remove gradient accent bars)                                               │
│                                                                                                                                                  │
│ 3.2 Service Category Page (/services/[categorySlug])                                                                                             │
│                                                                                                                                                  │
│ File: src/app/(public)/services/[categorySlug]/page.tsx (~97 lines)                                                                              │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner hero with category description                                                                                                         │
│ - Remove grid pattern overlay                                                                                                                    │
│ - Service cards in 2-column grid — cleaner styling with price + duration badges                                                                  │
│ - If category is Ceramic Coatings (SEO priority): add a before/after showcase above the service list                                             │
│                                                                                                                                                  │
│ 3.3 Service Detail Page (/services/[categorySlug]/[serviceSlug])                                                                                 │
│                                                                                                                                                  │
│ File: src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx (~260 lines)                                                               │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner hero with service name + breadcrumbs                                                                                                   │
│ - Remove grid pattern from hero background                                                                                                       │
│ - Two-column layout stays but cleaner:                                                                                                           │
│   - Main column: Service description, what's included list, before/after photo (if available for this service type)                              │
│   - Sidebar: Price display, duration, mobile eligibility, "Book This Service" CTA (sticky)                                                       │
│ - Add-on suggestions section: cleaner card styling                                                                                               │
│ - Remove hover animation on add-on cards where title turns blue — use underline instead                                                          │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 4: Product Pages                                                                                                                            │
│                                                                                                                                                  │
│ 4.1 Products Index (/products)                                                                                                                   │
│                                                                                                                                                  │
│ File: src/app/(public)/products/page.tsx (~77 lines)                                                                                             │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Same hero cleanup as services (remove grid overlay, simplify gradient)                                                                         │
│ - Cleaner category cards                                                                                                                         │
│                                                                                                                                                  │
│ 4.2 Product Category Page (/products/[categorySlug])                                                                                             │
│                                                                                                                                                  │
│ File: src/app/(public)/products/[categorySlug]/page.tsx (~94 lines)                                                                              │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner hero                                                                                                                                   │
│ - Product card grid: cleaner styling, price integrated naturally (not absolute-positioned badge)                                                 │
│ - 3-column on desktop, 2 on tablet, 1 on mobile                                                                                                  │
│                                                                                                                                                  │
│ 4.3 Product Detail Page (/products/[categorySlug]/[productSlug])                                                                                 │
│                                                                                                                                                  │
│ File: src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx (~169 lines)                                                               │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Two-column layout stays: image left, details right                                                                                             │
│ - Cleaner product image container (remove ring, simplify border)                                                                                 │
│ - Price display: larger, bolder                                                                                                                  │
│ - Availability badge: simpler styling                                                                                                            │
│ - Add "Need professional application?" section linking to relevant service                                                                       │
│ - CTA section at bottom: cleaner                                                                                                                 │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 5: Gallery, Booking, Quote                                                                                                                  │
│                                                                                                                                                  │
│ 5.1 Public Gallery (/gallery) — Admin-Controlled                                                                                                 │
│                                                                                                                                                  │
│ File: src/app/(public)/gallery/page.tsx (~164 lines) + gallery-client.tsx (~134 lines)                                                           │
│                                                                                                                                                  │
│ Data pipeline: Gallery shows ONLY photos where is_featured = true AND is_internal = false from job_photos. The admin controls what appears here  │
│ by toggling the star button on /admin/jobs/[id] or using /admin/photos bulk actions.                                                             │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner hero section — "Our Work" with subtitle showing total featured photo count                                                             │
│ - Filter pills: simpler styling (underline active state instead of filled pills)                                                                 │
│ - Gallery cards: remove ring-1 border, use subtle shadow only                                                                                    │
│ - Masonry grid stays — it works well                                                                                                             │
│ - Before/after sliders: already clean, keep as-is                                                                                                │
│ - Load More button: cleaner styling                                                                                                              │
│ - Add vehicle + service info below each before/after card (already partially there)                                                              │
│ - Consider adding a Google review card interspersed in the gallery (social proof alongside visual proof)                                         │
│                                                                                                                                                  │
│ 5.2 Booking Page (/book)                                                                                                                         │
│                                                                                                                                                  │
│ File: src/app/(public)/book/page.tsx + src/components/booking/booking-wizard.tsx (~644 lines)                                                    │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - This is a complex multi-step form — minimize visual changes, focus on:                                                                         │
│   - Cleaner step indicator styling                                                                                                               │
│   - More whitespace around form fields                                                                                                           │
│   - Cleaner card containers for each step                                                                                                        │
│   - "Powered by Stripe" badge already clean                                                                                                      │
│ - Do NOT restructure the booking wizard logic — it works and is well-tested                                                                      │
│                                                                                                                                                  │
│ 5.3 Public Quote Page (/quote/[token]) — EXISTING PAGE, CSS ONLY                                                                                 │
│                                                                                                                                                  │
│ File: src/app/(public)/quote/[token]/page.tsx (~293 lines)                                                                                       │
│                                                                                                                                                  │
│ Note: This page was built in Phase 3. NO new quote system is being created. This is purely minor CSS cleanup to match the updated site-wide      │
│ visual style.                                                                                                                                    │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner card styling (reduce shadow, simplify borders)                                                                                         │
│ - Cleaner status banners (subtle backgrounds)                                                                                                    │
│ - Quote line items table: tighter typography                                                                                                     │
│ - Business footer: simpler styling                                                                                                               │
│ - This page is functional and clean already — minimal changes needed                                                                             │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 6: Shared Components Cleanup                                                                                                                │
│                                                                                                                                                  │
│ 6.1 ServiceCategoryCard / ProductCategoryCard                                                                                                    │
│                                                                                                                                                  │
│ Files: Look for these in src/components/public/ or inline in page files                                                                          │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Remove gradient accent bar on hover                                                                                                            │
│ - Cleaner hover effect: subtle shadow lift only, no color changes on icons                                                                       │
│ - Card internal padding: consistent 24-32px                                                                                                      │
│ - Arrow icon: smaller, gray, moves slightly right on hover                                                                                       │
│                                                                                                                                                  │
│ 6.2 ServiceCard / ProductCard                                                                                                                    │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Cleaner price/duration badge styling                                                                                                           │
│ - Remove icon background circles — use inline icons                                                                                              │
│ - Simpler hover state                                                                                                                            │
│ - Consistent rounded corners (rounded-xl everywhere)                                                                                             │
│                                                                                                                                                  │
│ 6.3 Breadcrumbs                                                                                                                                  │
│                                                                                                                                                  │
│ File: src/components/public/breadcrumbs.tsx (if exists)                                                                                          │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Simpler styling, smaller text                                                                                                                  │
│ - Light variant: white/60 opacity on dark backgrounds                                                                                            │
│ - Separator: "/" or ">" instead of chevron icon                                                                                                  │
│                                                                                                                                                  │
│ 6.4 ScrollReveal / Animation Components                                                                                                          │
│                                                                                                                                                  │
│ File: src/components/public/scroll-reveal.tsx (~200 lines)                                                                                       │
│                                                                                                                                                  │
│ Changes:                                                                                                                                         │
│ - Keep ScrollReveal but reduce motion intensity: shorter translate distance (16px instead of 24px), shorter duration (0.4s instead of 0.6s)      │
│ - Keep CountUp for trust stats if we use it                                                                                                      │
│ - StaggerChildren: reduce stagger delay (0.08s instead of 0.1s) — feels snappier                                                                 │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Files Modified (Complete List)                                                                                                                   │
│                                                                                                                                                  │
│ Core Styling                                                                                                                                     │
│                                                                                                                                                  │
│ - src/app/globals.css — Simplified gradients, new spacing utilities                                                                              │
│ - src/app/layout.tsx — No changes needed (fonts are good)                                                                                        │
│                                                                                                                                                  │
│ Components                                                                                                                                       │
│                                                                                                                                                  │
│ - src/components/public/site-header.tsx — Cleaner nav, remove second mobile row                                                                  │
│ - src/components/public/site-footer.tsx — 3-column, Google review badge                                                                          │
│ - src/components/public/hero-section.tsx — Before/after split-screen hero                                                                        │
│ - src/components/public/trust-bar.tsx — Real Google stats strip                                                                                  │
│ - src/components/public/cta-section.tsx — Remove decoration                                                                                      │
│ - src/components/public/scroll-reveal.tsx — Subtler animations                                                                                   │
│ - Service/product card components (wherever they live)                                                                                           │
│                                                                                                                                                  │
│ Pages                                                                                                                                            │
│                                                                                                                                                  │
│ - src/app/(public)/page.tsx — Homepage with bento services grid                                                                                  │
│ - src/app/(public)/services/page.tsx — Cleaner hero                                                                                              │
│ - src/app/(public)/services/[categorySlug]/page.tsx — Cleaner hero + cards                                                                       │
│ - src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx — Cleaner detail layout                                                        │
│ - src/app/(public)/products/page.tsx — Cleaner hero                                                                                              │
│ - src/app/(public)/products/[categorySlug]/page.tsx — Cleaner cards                                                                              │
│ - src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx — Cleaner detail                                                               │
│ - src/app/(public)/gallery/page.tsx — Cleaner hero                                                                                               │
│ - src/app/(public)/gallery/gallery-client.tsx — Simpler filter pills + cards                                                                     │
│ - src/app/(public)/quote/[token]/page.tsx — Minor styling cleanup                                                                                │
│ - Booking wizard — Minimal styling touches only                                                                                                  │
│                                                                                                                                                  │
│ New Files                                                                                                                                        │
│                                                                                                                                                  │
│ - src/lib/data/google-reviews.ts — Google review data from business_settings                                                                     │
│ - src/lib/data/featured-photos.ts — Featured before/after pair for hero                                                                          │
│                                                                                                                                                  │
│ Migration                                                                                                                                        │
│                                                                                                                                                  │
│ - SQL to seed google_review_rating and google_review_count in business_settings                                                                  │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Execution Order                                                                                                                                  │
│                                                                                                                                                  │
│ 1. Foundation first: globals.css → header → footer → google-reviews helper → featured-photos helper                                              │
│ 2. Homepage: hero-section → trust-bar → homepage (bento grid + why choose us) → cta-section                                                      │
│ 3. Service pages: services index → service category → service detail                                                                             │
│ 4. Product pages: products index → product category → product detail                                                                             │
│ 5. Remaining: gallery → quote → booking (minimal)                                                                                                │
│ 6. Polish: ScrollReveal animation tuning, card component cleanup                                                                                 │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ ---                                                                                                                                              │
│ Wave 7: CMS Infrastructure                                                                                                                       │
│                                                                                                                                                  │
│ 7.1 Database Schema                                                                                                                              │
│                                                                                                                                                  │
│ 7 new migrations:                                                                                                                                │
│                                                                                                                                                  │
│ 1. 20260214000001_cms_hero_carousel.sql — hero_slides table                                                                                      │
│   - Columns: id, title, subtitle, cta_text, cta_url, content_type (image/video/before_after), image_url, image_url_mobile, image_alt, video_url, │
│  video_thumbnail_url, before_image_url, after_image_url, before_label, after_label, overlay_opacity, text_alignment, sort_order, is_active       │
│   - RLS: public read (active only), authenticated all                                                                                            │
│   - Business setting: hero_carousel_config = { mode, interval_ms, transition, pause_on_hover }                                                   │
│ 2. 20260214000002_cms_tickers.sql — announcement_tickers table                                                                                   │
│   - Columns: id, message, link_url, link_text, placement (top_bar/section), section_position, bg_color, text_color, scroll_speed, font_size,     │
│ target_pages, starts_at, ends_at, is_active, sort_order                                                                                          │
│   - Business setting: ticker_enabled (master toggle)                                                                                             │
│ 3. 20260214000003_cms_ads.sql — ad_creatives + ad_placements + ad_events tables                                                                  │
│   - ad_creatives: id, name, image_url, image_url_mobile, link_url, alt_text, ad_size (standard Google Display: 728x90, 300x250, 336x280,         │
│ 160x600, 300x600, 320x50, 320x100, 970x90, 970x250, 250x250), starts_at, ends_at, is_active, impression_count, click_count                       │
│   - ad_placements: id, ad_creative_id FK, page_path, zone_id, device (all/desktop/mobile), priority, is_active                                   │
│   - ad_events: id, ad_creative_id FK, ad_placement_id FK, event_type (impression/click), page_path, zone_id, ip_hash, created_at                 │
│   - Business setting: ads_enabled (master toggle)                                                                                                │
│ 4. 20260214000004_cms_themes.sql — seasonal_themes table                                                                                         │
│   - Columns: id, name, slug UNIQUE, description, color_overrides JSONB, gradient_overrides JSONB, particle_effect                                │
│ (snowfall/fireworks/confetti/hearts/leaves/stars/sparkles/null), particle_intensity, particle_color, ticker_message, ticker_bg_color,            │
│ ticker_text_color, themed_ad_creative_id FK, hero_bg_image_url, body_bg_color, starts_at, ends_at, auto_activate, is_active                      │
│ 5. 20260214000005_cms_catalog_controls.sql — add columns to existing tables                                                                      │
│   - products: show_on_website (default true), is_featured (default false), website_sort_order                                                    │
│   - services: show_on_website (default true), is_featured (default false)                                                                        │
│   - Services already have display_order for website sort                                                                                         │
│ 6. 20260214000006_cms_feature_flags.sql — 4 new feature flags in "Website" category                                                              │
│   - hero_carousel (default ON), announcement_tickers (default OFF), ad_placements (default OFF), seasonal_themes (default OFF)                   │
│ 7. 20260214000007_cms_storage.sql — cms-assets storage bucket                                                                                    │
│   - Public read, authenticated write, 10MB limit                                                                                                 │
│   - MIME: jpeg, png, webp, gif, svg+xml, video/mp4                                                                                               │
│                                                                                                                                                  │
│ 7.2 Data Layer                                                                                                                                   │
│                                                                                                                                                  │
│ New file: src/lib/data/cms.ts                                                                                                                    │
│ - getActiveHeroSlides() — cached, returns active slides sorted by sort_order                                                                     │
│ - getHeroCarouselConfig() — reads hero_carousel_config from business_settings                                                                    │
│ - getActiveTheme() — cached, returns active seasonal theme or null                                                                               │
│ - getCmsToggles() — reads all 4 CMS feature flags + master toggles                                                                               │
│ - getTopBarTickers(pagePath) — active top_bar tickers for this page                                                                              │
│ - getSectionTickers(pagePath, position) — active section tickers for this page/position                                                          │
│ - getAdsForZone(pagePath, zoneId) — active ad placement for a zone                                                                               │
│                                                                                                                                                  │
│ New file: src/lib/utils/cms-zones.ts                                                                                                             │
│ - Ad zone definitions per page (zone ID, label, description, compatible desktop/mobile ad sizes)                                                 │
│ - AVAILABLE_PAGES constant for the page map UI                                                                                                   │
│                                                                                                                                                  │
│ New file: src/lib/utils/cms-theme-presets.ts                                                                                                     │
│ - 8 preset themes: Christmas, Halloween, 4th of July, Memorial Day, Presidents Day, Valentine's Day, Fall/Autumn, New Year                       │
│ - Each has: color overrides, gradient overrides, particle effect, ticker message                                                                 │
│                                                                                                                                                  │
│ 7.3 Admin Sidebar                                                                                                                                │
│                                                                                                                                                  │
│ Add "Website" section to SIDEBAR_NAV in roles.ts (between Photo Gallery and Staff):                                                              │
│ Website (Globe icon)                                                                                                                             │
│   ├── Hero            (Image)                                                                                                                    │
│   ├── Tickers         (Megaphone)                                                                                                                │
│   ├── Ads             (RectangleHorizontal)                                                                                                      │
│   ├── Themes          (Palette)                                                                                                                  │
│   ├── About & Team    (Users)                                                                                                                    │
│   ├── Catalog Display (LayoutGrid)                                                                                                               │
│   ├── SEO             (Search)                                                                                                                   │
│   └── Terms & Conditions (FileText)                                                                                                              │
│                                                                                                                                                  │
│ Gate visibility: show if user has ANY cms.* permission granted. Individual sub-items gated by their specific permission key.                     │
│                                                                                                                                                  │
│ 7.4 TypeScript Types                                                                                                                             │
│                                                                                                                                                  │
│ Add to src/lib/supabase/types.ts:                                                                                                                │
│ - HeroSlide, AnnouncementTicker, AdCreative, AdPlacement, AdEvent, SeasonalTheme                                                                 │
│ - Update Product and Service interfaces with new columns                                                                                         │
│                                                                                                                                                  │
│ 7.5 CMS Permissions — Integrated Into Existing RBAC System                                                                                       │
│                                                                                                                                                  │
│ Approach: Add a new "Website" permission category to the existing 76-key permission system (documented in docs/PERMISSIONS_AUDIT.md). Does NOT   │
│ create a separate auth system. Uses the same infrastructure: permission_definitions table, permissions table, checkPermission(),                 │
│ requirePermission(), Role Management page, employee overrides.                                                                                   │
│                                                                                                                                                  │
│ New permission keys (7 keys, "Website" category):                                                                                                │
│                                                                                                                                                  │
│ ┌────────────────────────────┬────────────────────────┬────────────────────────────────────────────────────────────────────────┐                 │
│ │            Key             │          Name          │                              Description                               │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.hero.manage            │ Manage Hero            │ Create, edit, reorder, and delete hero slides                          │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.tickers.manage         │ Manage Tickers         │ Create, edit, and delete announcement tickers                          │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.ads.manage             │ Manage Ads             │ Create, edit, and delete ad creatives and placements                   │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.themes.manage          │ Manage Themes          │ Create, edit, activate, and deactivate seasonal themes                 │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.about.manage           │ Manage About & Team    │ Edit team members, credentials, and about content                      │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.catalog_display.manage │ Manage Catalog Display │ Toggle show_on_website, featured, and sort order for services/products │                 │
│ ├────────────────────────────┼────────────────────────┼────────────────────────────────────────────────────────────────────────┤                 │
│ │ cms.seo.manage             │ Manage SEO             │ Edit per-page SEO config, meta tags, alt tags, city pages              │                 │
│ └────────────────────────────┴────────────────────────┴────────────────────────────────────────────────────────────────────────┘                 │
│                                                                                                                                                  │
│ Role defaults:                                                                                                                                   │
│                                                                                                                                                  │
│ ┌────────────────────────────┬─────────────┬───────┬─────────┬──────────┐                                                                        │
│ │       Permission Key       │ super_admin │ admin │ cashier │ detailer │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.hero.manage            │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.tickers.manage         │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.ads.manage             │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.themes.manage          │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.about.manage           │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.catalog_display.manage │ true        │ true  │ false   │ false    │                                                                        │
│ ├────────────────────────────┼─────────────┼───────┼─────────┼──────────┤                                                                        │
│ │ cms.seo.manage             │ true        │ true  │ false   │ false    │                                                                        │
│ └────────────────────────────┴─────────────┴───────┴─────────┴──────────┘                                                                        │
│                                                                                                                                                  │
│ Migration: 20260214000008_cms_permissions.sql                                                                                                    │
│ - Insert 7 rows into permission_definitions (category: 'Website', sort_order starting after existing keys)                                       │
│ - Insert 28 rows into permissions (7 keys × 4 system roles) with defaults above                                                                  │
│ - Total permission count goes from 76 → 83                                                                                                       │
│                                                                                                                                                  │
│ Files to update:                                                                                                                                 │
│ - src/lib/utils/constants.ts — Add 'Website' to PERMISSION_CATEGORIES array                                                                      │
│ - src/lib/utils/role-defaults.ts — Add 7 CMS keys to ROLE_PERMISSION_DEFAULTS                                                                    │
│                                                                                                                                                  │
│ Server-side enforcement: Each CMS admin API route calls requirePermission() with the matching key:                                               │
│ - Hero routes → cms.hero.manage                                                                                                                  │
│ - Ticker routes → cms.tickers.manage                                                                                                             │
│ - Ad routes → cms.ads.manage                                                                                                                     │
│ - Theme routes → cms.themes.manage                                                                                                               │
│ - About routes → cms.about.manage                                                                                                                │
│ - Catalog display routes → cms.catalog_display.manage                                                                                            │
│ - SEO routes → cms.seo.manage                                                                                                                    │
│                                                                                                                                                  │
│ Admin sidebar gating: Website section shows if user has ANY cms.* permission granted. Individual sub-items show based on their specific          │
│ permission key.                                                                                                                                  │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 8: Hero Carousel System                                                                                                                     │
│                                                                                                                                                  │
│ 8.1 Admin Pages                                                                                                                                  │
│                                                                                                                                                  │
│ /admin/website/hero/page.tsx — Hero Manager                                                                                                      │
│ - Toggle between "Carousel" and "Single Display" mode                                                                                            │
│ - Carousel config: interval (3-10s slider), transition (fade/slide), pause on hover                                                              │
│ - Draggable slide list with thumbnails, content type badges, active toggles                                                                      │
│ - "Add Slide" button                                                                                                                             │
│                                                                                                                                                  │
│ /admin/website/hero/[id]/page.tsx — Slide Editor                                                                                                 │
│ - Content type tabs: Image | Video | Before/After                                                                                                │
│ - Image: upload + mobile image + alt text                                                                                                        │
│ - Video: YouTube/Vimeo URL + poster thumbnail upload                                                                                             │
│ - Before/After: two image uploads + custom labels                                                                                                │
│ - Title, subtitle, CTA text/URL                                                                                                                  │
│ - Overlay opacity slider (0-100%)                                                                                                                │
│ - Text alignment (left/center/right)                                                                                                             │
│ - Live preview panel                                                                                                                             │
│                                                                                                                                                  │
│ 8.2 API Routes                                                                                                                                   │
│                                                                                                                                                  │
│ - GET/POST /api/admin/cms/hero — list/create slides                                                                                              │
│ - GET/PATCH/DELETE /api/admin/cms/hero/[id] — CRUD single slide                                                                                  │
│ - PATCH /api/admin/cms/hero/reorder — batch sort_order update                                                                                    │
│ - GET/PATCH /api/admin/cms/hero/config — carousel config                                                                                         │
│ - GET /api/public/cms/hero — public: active slides + config                                                                                      │
│                                                                                                                                                  │
│ 8.3 Public Component                                                                                                                             │
│                                                                                                                                                  │
│ src/components/public/cms/hero-carousel.tsx (Client Component)                                                                                   │
│ - Props: slides, config                                                                                                                          │
│ - Carousel mode: auto-rotate with dot navigation, swipe on mobile, Framer Motion transitions                                                     │
│ - Single mode: static display of selected slide                                                                                                  │
│ - Supports all 3 content types: full-bleed image with overlay, embedded video iframe, BeforeAfterSlider                                          │
│ - First slide server-rendered for SEO (h1 in page source)                                                                                        │
│ - Pause on hover, keyboard accessible                                                                                                            │
│                                                                                                                                                  │
│ 8.4 Homepage Integration                                                                                                                         │
│                                                                                                                                                  │
│ In src/app/(public)/page.tsx:                                                                                                                    │
│ {heroCarouselEnabled && heroSlides.length > 0 ? (                                                                                                │
│   <HeroCarousel slides={heroSlides} config={carouselConfig} />                                                                                   │
│ ) : (                                                                                                                                            │
│   <HeroSection /> // existing fallback                                                                                                           │
│ )}                                                                                                                                               │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 9: Announcement Ticker System                                                                                                               │
│                                                                                                                                                  │
│ 9.1 Admin Pages                                                                                                                                  │
│                                                                                                                                                  │
│ /admin/website/tickers/page.tsx — Ticker Manager                                                                                                 │
│ - Master on/off toggle at top                                                                                                                    │
│ - List with placement badge (Top Bar / Section), message preview, schedule, active toggle                                                        │
│ - Inline quick-edit for messages                                                                                                                 │
│ - "Add Ticker" button                                                                                                                            │
│                                                                                                                                                  │
│ /admin/website/tickers/[id]/page.tsx — Ticker Editor                                                                                             │
│ - Message text, link URL + link text                                                                                                             │
│ - Placement selector (top bar / section) with section position dropdown                                                                          │
│ - Color pickers for background and text                                                                                                          │
│ - Scroll speed slider (slow/normal/fast mapped to px/s)                                                                                          │
│ - Font size selector (xs/sm/base/lg)                                                                                                             │
│ - Page targeting: all pages or multi-select specific pages                                                                                       │
│ - Date range pickers (start/end)                                                                                                                 │
│ - Live preview strip                                                                                                                             │
│                                                                                                                                                  │
│ 9.2 API Routes                                                                                                                                   │
│                                                                                                                                                  │
│ - GET/POST /api/admin/cms/tickers — list/create                                                                                                  │
│ - GET/PATCH/DELETE /api/admin/cms/tickers/[id] — CRUD                                                                                            │
│ - GET /api/public/cms/tickers?placement=X&page=Y — public active tickers                                                                         │
│                                                                                                                                                  │
│ 9.3 Public Components                                                                                                                            │
│                                                                                                                                                  │
│ src/components/public/cms/announcement-ticker.tsx (Client Component)                                                                             │
│ - Scrolling marquee animation (CSS @keyframes or Framer Motion)                                                                                  │
│ - Close/dismiss button (optional, per-session via sessionStorage)                                                                                │
│ - Respects color customization                                                                                                                   │
│ - placement='top_bar': renders above SiteHeader                                                                                                  │
│ - placement='section': renders inline between page sections                                                                                      │
│                                                                                                                                                  │
│ 9.4 Layout Integration                                                                                                                           │
│                                                                                                                                                  │
│ In src/app/(public)/layout.tsx:                                                                                                                  │
│ {tickerEnabled && <TopBarTicker pagePath={currentPath} />}                                                                                       │
│ <SiteHeader />                                                                                                                                   │
│ <main>{children}</main>                                                                                                                          │
│ <SiteFooter />                                                                                                                                   │
│                                                                                                                                                  │
│ Section tickers placed between sections in each page file.                                                                                       │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 10: Ad Placement System                                                                                                                     │
│                                                                                                                                                  │
│ 10.1 Standard Google Display Ad Sizes                                                                                                            │
│                                                                                                                                                  │
│ ┌─────────┬─────────────────────┬────────────────────────────┐                                                                                   │
│ │  Size   │        Name         │            Use             │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 728x90  │ Leaderboard         │ Between sections (desktop) │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 300x250 │ Medium Rectangle    │ Sidebar                    │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 336x280 │ Large Rectangle     │ Sidebar, inline            │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 160x600 │ Wide Skyscraper     │ Sidebar                    │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 300x600 │ Half Page           │ Sidebar                    │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 320x50  │ Mobile Leaderboard  │ Between sections (mobile)  │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 320x100 │ Large Mobile Banner │ Between sections (mobile)  │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 970x90  │ Large Leaderboard   │ Full-width (desktop)       │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 970x250 │ Billboard           │ Full-width (desktop)       │                                                                                   │
│ ├─────────┼─────────────────────┼────────────────────────────┤                                                                                   │
│ │ 250x250 │ Square              │ Sidebar, inline            │                                                                                   │
│ └─────────┴─────────────────────┴────────────────────────────┘                                                                                   │
│                                                                                                                                                  │
│ 10.2 Ad Zones Per Page                                                                                                                           │
│                                                                                                                                                  │
│ Homepage (/):                                                                                                                                    │
│ - below_hero — between Hero and TrustBar (970x250, 728x90 / 320x100, 320x50)                                                                     │
│ - between_sections_1 — between Services and Why Choose Us (728x90 / 320x100)                                                                     │
│ - above_cta — above CTA section (728x90 / 320x100)                                                                                               │
│                                                                                                                                                  │
│ Services pages: below_hero, between_categories, above_cta, sidebar (on detail pages)                                                             │
│                                                                                                                                                  │
│ Products pages: below_hero, between_categories, above_cta, sidebar (on detail pages)                                                             │
│                                                                                                                                                  │
│ Gallery: below_hero, between_rows (interspersed in photo grid)                                                                                   │
│                                                                                                                                                  │
│ Booking: sidebar only (desktop, hidden on mobile — don't distract from checkout)                                                                 │
│                                                                                                                                                  │
│ 10.3 Admin Pages                                                                                                                                 │
│                                                                                                                                                  │
│ /admin/website/ads/page.tsx — Ad Management Hub                                                                                                  │
│ - Master on/off toggle                                                                                                                           │
│ - Tabs: Creatives | Page Map | Analytics                                                                                                         │
│ - Creatives tab: grid of ad cards (thumbnail, name, size badge, impression/click stats, active toggle). Filter by size. "Create Ad" button.      │
│ - Page Map tab: visual page selector → click page → see wireframe with labeled zones → click zone → assign ad dropdown (filtered to compatible   │
│ sizes)                                                                                                                                           │
│ - Analytics tab: top-performing ads, CTR by zone, impression/click trends                                                                        │
│                                                                                                                                                  │
│ /admin/website/ads/creatives/[id]/page.tsx — Ad Creative Editor                                                                                  │
│ - Name, ad size selector (dropdown with dimension preview)                                                                                       │
│ - Image upload with dimension validation (must match selected size)                                                                              │
│ - Optional mobile image                                                                                                                          │
│ - Link URL, alt text                                                                                                                             │
│ - Date range                                                                                                                                     │
│ - Performance stats card                                                                                                                         │
│                                                                                                                                                  │
│ 10.4 API Routes                                                                                                                                  │
│                                                                                                                                                  │
│ - GET/POST /api/admin/cms/ads/creatives — CRUD creatives                                                                                         │
│ - GET/PATCH/DELETE /api/admin/cms/ads/creatives/[id] — single creative                                                                           │
│ - GET/POST /api/admin/cms/ads/placements — CRUD placements                                                                                       │
│ - GET/PATCH/DELETE /api/admin/cms/ads/placements/[id] — single placement                                                                         │
│ - GET /api/admin/cms/ads/zones — all zone definitions + current assignments                                                                      │
│ - GET /api/admin/cms/ads/analytics — performance data                                                                                            │
│ - GET /api/public/cms/ads?zone=X&page=Y — public: get active ad for zone                                                                         │
│ - POST /api/public/cms/ads/impression — record impression (fire-and-forget)                                                                      │
│ - POST /api/public/cms/ads/click — record click + redirect                                                                                       │
│                                                                                                                                                  │
│ 10.5 Public Component                                                                                                                            │
│                                                                                                                                                  │
│ src/components/public/cms/ad-zone.tsx (Client Component)                                                                                         │
│ - Props: zoneId, pagePath, className?                                                                                                            │
│ - Fetches ad for zone via public API (or receives as prop from server)                                                                           │
│ - IntersectionObserver: fires impression when 50% visible for 1 second                                                                           │
│ - Click handler: records click, then navigates to link URL                                                                                       │
│ - Responsive: shows desktop or mobile image based on viewport                                                                                    │
│ - Returns null if no ad assigned or ads system disabled                                                                                          │
│ - Basic anti-duplicate: ip_hash + creative ID + 1-hour window (server-side)                                                                      │
│                                                                                                                                                  │
│ 10.6 Page Integration                                                                                                                            │
│                                                                                                                                                  │
│ Each public page gets <AdZone> components inserted between sections:                                                                             │
│ <HeroSection />                                                                                                                                  │
│ {adsEnabled && <AdZone zoneId="below_hero" pagePath="/" />}                                                                                      │
│ <TrustBar />                                                                                                                                     │
│ {/* ... services section ... */}                                                                                                                 │
│ {adsEnabled && <AdZone zoneId="between_sections_1" pagePath="/" />}                                                                              │
│ {/* ... why choose us ... */}                                                                                                                    │
│ {adsEnabled && <AdZone zoneId="above_cta" pagePath="/" />}                                                                                       │
│ <CtaSection />                                                                                                                                   │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 11: Seasonal Theme Engine                                                                                                                   │
│                                                                                                                                                  │
│ 11.1 Theme Capabilities                                                                                                                          │
│                                                                                                                                                  │
│ When a theme is active, it changes:                                                                                                              │
│ - CSS color variables: brand-500 through brand-900, accent-400 through accent-600                                                                │
│ - Gradients: hero, CTA, brand gradient overrides                                                                                                 │
│ - Particle effects: snowfall, fireworks, confetti, hearts, leaves, stars, sparkles                                                               │
│ - Optional: themed ticker message, themed ad creative, hero background image, body background color                                              │
│                                                                                                                                                  │
│ 11.2 Pre-Built Theme Presets (8)                                                                                                                 │
│                                                                                                                                                  │
│ ┌─────────────────┬─────────────────┬───────────┬──────────────────────────────────────────────────┐                                             │
│ │      Theme      │     Colors      │ Particle  │                  Default Ticker                  │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Christmas       │ Red + Green     │ Snowfall  │ "Happy Holidays! Gift certificates available"    │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Halloween       │ Orange + Purple │ Sparkles  │ "Spooktacular October Special: 20% off interior" │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ 4th of July     │ Blue + Red      │ Fireworks │ "Independence Day detailing special!"            │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Memorial Day    │ Navy + Red      │ Stars     │ "Memorial Day Weekend Sale"                      │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Presidents Day  │ Navy + Gold     │ Stars     │ "15% off ceramic coating this weekend"           │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Valentine's Day │ Pink + Rose     │ Hearts    │ "Show your car some love"                        │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ Fall/Autumn     │ Amber + Red     │ Leaves    │ "Protect your paint before winter!"              │                                             │
│ ├─────────────────┼─────────────────┼───────────┼──────────────────────────────────────────────────┤                                             │
│ │ New Year        │ Gold + Black    │ Confetti  │ "Start fresh — book your New Year detail!"       │                                             │
│ └─────────────────┴─────────────────┴───────────┴──────────────────────────────────────────────────┘                                             │
│                                                                                                                                                  │
│ 11.3 Admin Pages                                                                                                                                 │
│                                                                                                                                                  │
│ /admin/website/themes/page.tsx — Theme Manager                                                                                                   │
│ - List of all themes with status badges, date ranges, particle effect icons                                                                      │
│ - Active theme highlighted with green border                                                                                                     │
│ - "Create Theme" button + "Use Preset" dropdown (pre-fills from preset)                                                                          │
│ - Only one active at a time — activating one deactivates the current                                                                             │
│                                                                                                                                                  │
│ /admin/website/themes/[id]/page.tsx — Theme Editor                                                                                               │
│ - Colors section: visual color pickers for each CSS variable                                                                                     │
│ - Gradients section: gradient builder (start/end colors, direction)                                                                              │
│ - Particles section: effect dropdown, intensity slider, color picker                                                                             │
│ - Ticker section: optional themed message + colors                                                                                               │
│ - Ad section: optional themed ad creative selector                                                                                               │
│ - Background section: hero bg image upload, body bg color                                                                                        │
│ - Schedule section: start/end dates, auto-activate toggle                                                                                        │
│ - Live Preview panel: miniature homepage preview showing theme applied                                                                           │
│                                                                                                                                                  │
│ 11.4 API Routes                                                                                                                                  │
│                                                                                                                                                  │
│ - GET/POST /api/admin/cms/themes — CRUD                                                                                                          │
│ - GET/PATCH/DELETE /api/admin/cms/themes/[id] — single theme                                                                                     │
│ - POST /api/admin/cms/themes/[id]/activate — activate (deactivates others)                                                                       │
│ - POST /api/admin/cms/themes/[id]/deactivate — deactivate                                                                                        │
│ - GET /api/public/cms/theme — public: active theme data                                                                                          │
│                                                                                                                                                  │
│ 11.5 Public Components                                                                                                                           │
│                                                                                                                                                  │
│ src/components/public/cms/particle-canvas.tsx (Client Component)                                                                                 │
│ - Canvas-based particle rendering using requestAnimationFrame                                                                                    │
│ - 7 effects with distinct behaviors (fall, explode, float, drift, etc.)                                                                          │
│ - Fixed overlay with pointer-events: none                                                                                                        │
│ - Respects prefers-reduced-motion (disables automatically)                                                                                       │
│ - Pauses when tab hidden (Page Visibility API)                                                                                                   │
│ - Reduces particle count on mobile                                                                                                               │
│                                                                                                                                                  │
│ src/components/public/cms/theme-provider.tsx (Client Component)                                                                                  │
│ - Wraps public layout children in a <div> with style overrides                                                                                   │
│ - Injects CSS custom properties from active theme's color_overrides                                                                              │
│ - Overrides gradient classes via inline <style> tag                                                                                              │
│ - Renders <ParticleCanvas> if theme has particle effect                                                                                          │
│ - Scoped to public layout ONLY — does NOT affect admin panel                                                                                     │
│                                                                                                                                                  │
│ 11.6 Layout Integration                                                                                                                          │
│                                                                                                                                                  │
│ In src/app/(public)/layout.tsx:                                                                                                                  │
│ <ThemeProvider theme={activeTheme}>                                                                                                              │
│   {tickerEnabled && <TopBarTicker />}                                                                                                            │
│   <SiteHeader />                                                                                                                                 │
│   <main>{children}</main>                                                                                                                        │
│   <SiteFooter />                                                                                                                                 │
│ </ThemeProvider>                                                                                                                                 │
│                                                                                                                                                  │
│ 11.7 Auto-Activation Cron                                                                                                                        │
│                                                                                                                                                  │
│ Register in src/lib/cron/scheduler.ts — every 15 minutes:                                                                                        │
│ - Check themes with auto_activate = true and starts_at <= now() < ends_at → activate                                                             │
│ - Check active themes with ends_at <= now() → deactivate                                                                                         │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 12: Catalog Display Controls                                                                                                                │
│                                                                                                                                                  │
│ 12.1 New Columns                                                                                                                                 │
│                                                                                                                                                  │
│ Products: show_on_website (bool, default true), is_featured (bool, default false), website_sort_order (int)                                      │
│ Services: show_on_website (bool, default true), is_featured (bool, default false)                                                                │
│ Services already have display_order — reuse it for website sort                                                                                  │
│                                                                                                                                                  │
│ 12.2 Admin Page                                                                                                                                  │
│                                                                                                                                                  │
│ /admin/website/catalog/page.tsx — Catalog Display Controls                                                                                       │
│ - Two tabs: Services | Products                                                                                                                  │
│ - Sortable table with columns: Name, Category, POS Active, Website Visible (toggle), Featured (star), Sort Order                                 │
│ - "Show on Website" toggle is INDEPENDENT from is_active (POS) — can sell in-store but hide from website                                         │
│ - Drag-to-reorder for website_sort_order / display_order                                                                                         │
│ - Bulk actions: "Show all on website", "Hide all from website"                                                                                   │
│ - Changes save immediately (optimistic UI)                                                                                                       │
│                                                                                                                                                  │
│ 12.3 API Routes                                                                                                                                  │
│                                                                                                                                                  │
│ - GET /api/admin/cms/catalog/services — services with CMS fields                                                                                 │
│ - PATCH /api/admin/cms/catalog/services — batch update visibility/featured/order                                                                 │
│ - GET /api/admin/cms/catalog/products — products with CMS fields                                                                                 │
│ - PATCH /api/admin/cms/catalog/products — batch update visibility/featured/order                                                                 │
│                                                                                                                                                  │
│ 12.4 Public Page Updates                                                                                                                         │
│                                                                                                                                                  │
│ All public pages that query services/products must add:                                                                                          │
│ - .eq('show_on_website', true) filter (in addition to existing is_active filter)                                                                 │
│ - Featured items appear first (sort by is_featured DESC, website_sort_order ASC)                                                                 │
│                                                                                                                                                  │
│ Files affected:                                                                                                                                  │
│ - src/lib/data/services.ts — add show_on_website filter                                                                                          │
│ - src/lib/data/products.ts — add show_on_website filter                                                                                          │
│ - src/app/(public)/page.tsx — homepage services section                                                                                          │
│ - All service/product page files                                                                                                                 │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 13: SEO Engine                                                                                                                              │
│                                                                                                                                                  │
│ Goal: Every public page must be a static, individually-indexed page optimized for maximum search engine ranking. Admin gets an SEO plugin-style  │
│ configuration per page (like Yoast/RankMath), plus city-based landing pages for local search dominance.                                          │
│                                                                                                                                                  │
│ 13.1 Existing SEO Infrastructure (Already Built — Enhance, Don't Rebuild)                                                                        │
│                                                                                                                                                  │
│ The app already has solid SEO foundations from Phase 1:                                                                                          │
│ - 13 generateMetadata() functions across all public pages                                                                                        │
│ - Dynamic sitemap.xml at src/app/sitemap.xml/route.ts (ceramic coatings at priority 1.0)                                                         │
│ - robots.txt at src/app/robots.txt/route.ts (blocks /admin, /api/, /login)                                                                       │
│ - 5 JSON-LD schemas in src/lib/seo/json-ld.ts (LocalBusiness, Service, Product, Breadcrumb, ImageGallery)                                        │
│ - 4 generateStaticParams() routes for static generation of service/product pages                                                                 │
│ - SEO metadata helpers in src/lib/seo/metadata.ts (4 builder functions)                                                                          │
│ - <JsonLd> component in src/components/public/json-ld.tsx                                                                                        │
│ - Constants: SITE_URL = 'https://smartdetailsautospa.com', SITE_DESCRIPTION                                                                      │
│                                                                                                                                                  │
│ What's missing:                                                                                                                                  │
│ - No per-page SEO configuration (admin can't customize titles/descriptions/keywords)                                                             │
│ - No OG images (no opengraph-image.tsx)                                                                                                          │
│ - No city-based landing pages                                                                                                                    │
│ - No ai.txt for AI crawlers                                                                                                                      │
│ - No image alt tag management for product/service images                                                                                         │
│ - No internal linking strategy                                                                                                                   │
│ - No canonical URL management                                                                                                                    │
│ - No admin SEO dashboard or audit tools                                                                                                          │
│                                                                                                                                                  │
│ 13.2 Database Schema                                                                                                                             │
│                                                                                                                                                  │
│ Migration: 20260214000009_seo_engine.sql                                                                                                         │
│                                                                                                                                                  │
│ Table: page_seo — Per-page SEO overrides                                                                                                         │
│ - id UUID PK                                                                                                                                     │
│ - page_path TEXT UNIQUE NOT NULL — e.g., /services/ceramic-coatings/5-year-shield                                                                │
│ - page_type TEXT — homepage, service_category, service_detail, product_category, product_detail, gallery, booking, city_landing, custom          │
│ - seo_title TEXT — custom  override (falls back to auto-generated if null)                                                                       │
│ - meta_description TEXT — custom meta description override                                                                                       │
│ - meta_keywords TEXT — comma-separated keywords                                                                                                  │
│ - og_title TEXT — OpenGraph title override                                                                                                       │
│ - og_description TEXT — OpenGraph description override                                                                                           │
│ - og_image_url TEXT — custom OG image URL                                                                                                        │
│ - canonical_url TEXT — canonical URL override (for duplicate content)                                                                            │
│ - robots_directive TEXT — e.g., index,follow (default), noindex,nofollow                                                                         │
│ - structured_data_overrides JSONB — additional JSON-LD properties                                                                                │
│ - focus_keyword TEXT — primary keyword for this page (for SEO scoring)                                                                           │
│ - internal_links JSONB — suggested internal links [{ text, url }]                                                                                │
│ - is_auto_generated BOOLEAN DEFAULT false — true for city pages                                                                                  │
│ - created_at, updated_at                                                                                                                         │
│ - RLS: public read, authenticated write                                                                                                          │
│                                                                                                                                                  │
│ Table: city_landing_pages — City-based SEO pages                                                                                                 │
│ - id UUID PK                                                                                                                                     │
│ - city_name TEXT NOT NULL — e.g., "Torrance"                                                                                                     │
│ - slug TEXT UNIQUE NOT NULL — e.g., "torrance"                                                                                                   │
│ - state TEXT DEFAULT 'CA'                                                                                                                        │
│ - distance_miles DECIMAL — distance from Lomita                                                                                                  │
│ - heading TEXT — "Mobile Auto Detailing in Torrance, CA"                                                                                         │
│ - intro_text TEXT — city-specific intro paragraph                                                                                                │
│ - service_highlights JSONB — featured services for this city                                                                                     │
│ - local_landmarks TEXT — mention of local landmarks (SEO localization)                                                                           │
│ - meta_title TEXT                                                                                                                                │
│ - meta_description TEXT                                                                                                                          │
│ - focus_keywords TEXT — "auto detailing torrance", "ceramic coating torrance"                                                                    │
│ - is_active BOOLEAN DEFAULT true                                                                                                                 │
│ - sort_order INT                                                                                                                                 │
│ - created_at, updated_at                                                                                                                         │
│ - RLS: public read, authenticated write                                                                                                          │
│                                                                                                                                                  │
│ Seed data — Cities within ~3-mile radius of Lomita:                                                                                              │
│                                                                                                                                                  │
│ ┌──────────────────────┬──────────┬───────────────────────────────────────────────────────────────────────────┐                                  │
│ │         City         │ Distance │                              Focus Keywords                               │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Lomita               │ 0 mi     │ auto detailing lomita, ceramic coating lomita                             │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Torrance             │ 1.5 mi   │ auto detailing torrance, ceramic coating torrance, car detailing torrance │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Harbor City          │ 1.2 mi   │ auto detailing harbor city, ceramic coating harbor city                   │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Carson               │ 2.5 mi   │ auto detailing carson, car wash carson                                    │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Gardena              │ 2.8 mi   │ auto detailing gardena, ceramic coating gardena                           │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Wilmington           │ 2.5 mi   │ auto detailing wilmington                                                 │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ San Pedro            │ 3.0 mi   │ auto detailing san pedro, ceramic coating san pedro                       │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Redondo Beach        │ 2.5 mi   │ auto detailing redondo beach, ceramic coating redondo beach               │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Palos Verdes Estates │ 2.8 mi   │ auto detailing palos verdes, ceramic coating palos verdes                 │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Rolling Hills        │ 2.0 mi   │ auto detailing rolling hills                                              │                                  │
│ ├──────────────────────┼──────────┼───────────────────────────────────────────────────────────────────────────┤                                  │
│ │ Rancho Palos Verdes  │ 3.0 mi   │ auto detailing rancho palos verdes                                        │                                  │
│ └──────────────────────┴──────────┴───────────────────────────────────────────────────────────────────────────┘                                  │
│                                                                                                                                                  │
│ 13.3 Per-Page SEO Configuration (Admin UI)                                                                                                       │
│                                                                                                                                                  │
│ /admin/website/seo/page.tsx — SEO Dashboard                                                                                                      │
│                                                                                                                                                  │
│ Scope: The SEO configuration covers EVERY public page — not just city pages. This includes:                                                      │
│ - Homepage (/)                                                                                                                                   │
│ - All 7 service category pages (/services/[categorySlug])                                                                                        │
│ - All 30 service detail pages (/services/[categorySlug]/[serviceSlug])                                                                           │
│ - All product category pages (/products/[categorySlug])                                                                                          │
│ - All product detail pages (/products/[categorySlug]/[productSlug])                                                                              │
│ - Gallery page (/gallery)                                                                                                                        │
│ - Booking page (/book)                                                                                                                           │
│ - All 11 city landing pages (/areas/[citySlug])                                                                                                  │
│ - Terms & Conditions page (/terms)                                                                                                               │
│ - Any future public pages                                                                                                                        │
│                                                                                                                                                  │
│ Every page gets its own row in the page_seo table. Auto-populated on first load with sensible defaults from the existing generateMetadata()      │
│ output, then customizable by admin.                                                                                                              │
│                                                                                                                                                  │
│ Overview tab:                                                                                                                                    │
│ - SEO health score summary — how many pages have custom SEO vs auto-generated                                                                    │
│ - List of ALL indexable pages with columns: Page, Title (truncated), Description (truncated), Focus Keyword, SEO Score (green/amber/red), Last   │
│ Updated                                                                                                                                          │
│ - Filter: by page type (service, product, city, gallery, etc.), by SEO score, by has/missing focus keyword                                       │
│ - "Audit All" button — runs SEO check across all pages                                                                                           │
│ - "Auto-Populate Missing" button — creates page_seo rows for any pages that don't have one yet (using current auto-generated metadata as         │
│ defaults)                                                                                                                                        │
│                                                                                                                                                  │
│ Page editor (inline expand or /admin/website/seo/edit?path=...):                                                                                 │
│ - SEO Plugin-style panel (similar to Yoast/RankMath):                                                                                            │
│   - Title — editable, live character count (50-60 chars optimal), Google SERP preview                                                            │
│   - Meta Description — editable, live character count (150-160 chars optimal), SERP preview                                                      │
│   - Focus Keyword — primary keyword, checks: in title? in description? in H1? in URL? keyword density                                            │
│   - Meta Keywords — comma-separated (less important but still included for completeness)                                                         │
│   - Canonical URL — override (usually auto-set to self)                                                                                          │
│   - Robots Directive — dropdown: index+follow (default), noindex, nofollow                                                                       │
│   - OG Image — upload custom social sharing image, or auto-generate from page content                                                            │
│   - OG Title/Description — override (falls back to SEO title/description)                                                                        │
│   - Structured Data — read-only preview of auto-generated JSON-LD + ability to add custom properties                                             │
│   - Internal Links — suggested links to add to the page content, editable                                                                        │
│   - SEO Score — real-time analysis:                                                                                                              │
│       - Title length (green: 50-60 chars)                                                                                                        │
│     - Description length (green: 150-160 chars)                                                                                                  │
│     - Focus keyword in title (yes/no)                                                                                                            │
│     - Focus keyword in description (yes/no)                                                                                                      │
│     - Focus keyword in URL slug (yes/no)                                                                                                         │
│     - Has OG image (yes/no)                                                                                                                      │
│     - Has internal links (yes/no)                                                                                                                │
│     - Content length estimate (based on description)                                                                                             │
│                                                                                                                                                  │
│ 13.4 City Landing Pages                                                                                                                          │
│                                                                                                                                                  │
│ Public route: /areas/[citySlug] — e.g., /areas/torrance                                                                                          │
│                                                                                                                                                  │
│ Page content (Server Component for SEO):                                                                                                         │
│ - H1: "Mobile Auto Detailing in {City}, {State}"                                                                                                 │
│ - Intro paragraph: city-specific text mentioning the city, distance from shop, local landmarks                                                   │
│ - Service highlights: 3-4 top services with "starting from $X" pricing, linking to service detail pages                                          │
│ - Google reviews section (reuse from homepage)                                                                                                   │
│ - Before/after showcase (reuse featured photos)                                                                                                  │
│ - CTA: "Book Your Detail in {City}" → link to /book                                                                                              │
│ - Business info footer with address + phone                                                                                                      │
│ - Breadcrumbs: Home > Service Areas > {City}                                                                                                     │
│ - generateMetadata() with city-specific title, description, keywords                                                                             │
│ - JSON-LD: LocalBusiness with areaServed including the city                                                                                      │
│ - generateStaticParams() for all active city pages                                                                                               │
│                                                                                                                                                  │
│ Admin page: /admin/website/seo/cities/page.tsx                                                                                                   │
│ - List of all city pages with status, distance, active toggle                                                                                    │
│ - Add/edit city: name, slug, distance, heading, intro text, service highlights, keywords                                                         │
│ - Reorder cities (for sitemap priority)                                                                                                          │
│                                                                                                                                                  │
│ Sitemap integration:                                                                                                                             │
│ - City pages added to sitemap.xml with priority 0.8                                                                                              │
│ - Change frequency: monthly                                                                                                                      │
│                                                                                                                                                  │
│ 13.5 ai.txt                                                                                                                                      │
│                                                                                                                                                  │
│ Route: src/app/ai.txt/route.ts                                                                                                                   │
│                                                                                                                                                  │
│ Purpose: Control AI crawler access (ChatGPT, Google Bard, Perplexity, etc.)                                                                      │
│                                                                                                                                                  │
│ Default content:                                                                                                                                 │
│ # ai.txt - Smart Details Auto Spa                                                                                                                │
│ # This file controls AI crawler access                                                                                                           │
│                                                                                                                                                  │
│ User-agent: GPTBot                                                                                                                               │
│ Allow: /                                                                                                                                         │
│ Allow: /services/                                                                                                                                │
│ Allow: /products/                                                                                                                                │
│ Allow: /areas/                                                                                                                                   │
│ Disallow: /admin/                                                                                                                                │
│ Disallow: /api/                                                                                                                                  │
│ Disallow: /pos/                                                                                                                                  │
│ Disallow: /account/                                                                                                                              │
│ Disallow: /login                                                                                                                                 │
│                                                                                                                                                  │
│ User-agent: Google-Extended                                                                                                                      │
│ Allow: /                                                                                                                                         │
│ Disallow: /admin/                                                                                                                                │
│ Disallow: /api/                                                                                                                                  │
│                                                                                                                                                  │
│ User-agent: CCBot                                                                                                                                │
│ Allow: /                                                                                                                                         │
│ Disallow: /admin/                                                                                                                                │
│ Disallow: /api/                                                                                                                                  │
│                                                                                                                                                  │
│ User-agent: anthropic-ai                                                                                                                         │
│ Allow: /                                                                                                                                         │
│ Disallow: /admin/                                                                                                                                │
│ Disallow: /api/                                                                                                                                  │
│                                                                                                                                                  │
│ Admin configurable: Stored in business_settings key ai_txt_content — editable from SEO settings page.                                            │
│                                                                                                                                                  │
│ 13.6 Enhanced Sitemap                                                                                                                            │
│                                                                                                                                                  │
│ Update: src/app/sitemap.xml/route.ts                                                                                                             │
│                                                                                                                                                  │
│ Add:                                                                                                                                             │
│ - City landing pages (/areas/[citySlug]) — priority 0.8, changefreq monthly                                                                      │
│ - Gallery page — priority 0.6                                                                                                                    │
│ - Booking page — priority 0.7                                                                                                                    │
│ - lastmod dates from actual content update timestamps (not just generated time)                                                                  │
│ - Product/service pages use updated_at from DB for lastmod                                                                                       │
│                                                                                                                                                  │
│ 13.7 Image Alt Tag Management                                                                                                                    │
│                                                                                                                                                  │
│ Enhancement to existing product/service pages:                                                                                                   │
│                                                                                                                                                  │
│ All product and service images should have descriptive alt text. Currently image_url exists but alt text is often empty.                         │
│                                                                                                                                                  │
│ Schema change (in 20260214000009_seo_engine.sql):                                                                                                │
│ - products: add image_alt TEXT column                                                                                                            │
│ - services: add image_alt TEXT column                                                                                                            │
│ - product_images: add alt_text TEXT column                                                                                                       │
│                                                                                                                                                  │
│ Admin integration:                                                                                                                               │
│ - Product edit page: alt text field below each image in MultiImageUpload                                                                         │
│ - Service edit page: alt text field below image upload                                                                                           │
│ - SEO dashboard: "Images Missing Alt Text" count with link to filtered list                                                                      │
│                                                                                                                                                  │
│ Public pages:                                                                                                                                    │
│ - All <Image> / <img> tags use the DB alt text, falling back to {product/service name} - Smart Details Auto Spa                                  │
│                                                                                                                                                  │
│ 13.8 Internal Linking Strategy                                                                                                                   │
│                                                                                                                                                  │
│ Automated internal links inserted by server components:                                                                                          │
│                                                                                                                                                  │
│ - Service detail pages → link to related services in same category ("You may also like")                                                         │
│ - Service category pages → link to other categories ("Explore Our Other Services")                                                               │
│ - Product detail pages → link to related service ("Need professional application?") — already planned in Wave 4.3                                │
│ - City landing pages → link to top service pages, especially ceramic coatings                                                                    │
│ - Homepage → links to all category pages, city pages footer strip ("We serve Torrance, Redondo Beach, Carson...")                                │
│ - Blog/content pages (future) → cross-link to service/product pages                                                                              │
│                                                                                                                                                  │
│ Footer "Service Areas" section:                                                                                                                  │
│ - New footer section listing all active city pages as links                                                                                      │
│ - "Mobile Detailing in Torrance | Carson | Redondo Beach | ..."                                                                                  │
│                                                                                                                                                  │
│ 13.9 Enhanced Schema Markup                                                                                                                      │
│                                                                                                                                                  │
│ Update src/lib/seo/json-ld.ts:                                                                                                                   │
│                                                                                                                                                  │
│ - AggregateRating — add to LocalBusiness schema using cached Google review data                                                                  │
│ "aggregateRating": {                                                                                                                             │
│   "@type": "AggregateRating",                                                                                                                    │
│   "ratingValue": "5.0",                                                                                                                          │
│   "reviewCount": 44,                                                                                                                             │
│   "bestRating": "5"                                                                                                                              │
│ }                                                                                                                                                │
│ - Review — add individual Google review objects to LocalBusiness                                                                                 │
│ - FAQPage — add to service detail pages (common questions about the service)                                                                     │
│ - GeoCircle — add areaServed to LocalBusiness showing 3-mile service radius                                                                      │
│ - sameAs — add social media profile URLs (Google Business, Yelp)                                                                                 │
│ - hasOfferCatalog — add service catalog reference to LocalBusiness                                                                               │
│                                                                                                                                                  │
│ 13.10 OG Image Generation                                                                                                                        │
│                                                                                                                                                  │
│ Route: src/app/opengraph-image.tsx (Next.js built-in OG image generation)                                                                        │
│                                                                                                                                                  │
│ Dynamic OG images for social sharing:                                                                                                            │
│ - Homepage: business logo + tagline + review stars                                                                                               │
│ - Service pages: service name + starting price + business branding                                                                               │
│ - Product pages: product image + name + price                                                                                                    │
│ - City pages: "Mobile Detailing in {City}" + business branding                                                                                   │
│                                                                                                                                                  │
│ Uses ImageResponse from next/og — generated at build time for static pages, on-demand for dynamic.                                               │
│                                                                                                                                                  │
│ If admin uploads a custom OG image via the SEO editor (13.3), that takes priority over auto-generated.                                           │
│                                                                                                                                                  │
│ 13.11 URL Strategy                                                                                                                               │
│                                                                                                                                                  │
│ Current URLs are already keyword-rich:                                                                                                           │
│ - /services/ceramic-coatings/5-year-ceramic-shield (excellent)                                                                                   │
│ - /products/exterior-care/ceramic-spray-sealant (excellent)                                                                                      │
│                                                                                                                                                  │
│ Enhancements:                                                                                                                                    │
│ - City pages use clean slugs: /areas/torrance, /areas/redondo-beach                                                                              │
│ - Canonical URLs auto-set to prevent duplicate content                                                                                           │
│ - Trailing slash consistency enforced via Next.js config                                                                                         │
│ - 301 redirects for any old URLs (if WordPress migration needs them)                                                                             │
│                                                                                                                                                  │
│ 13.12 API Routes                                                                                                                                 │
│                                                                                                                                                  │
│ - GET /api/admin/cms/seo/pages — list all pages with SEO data                                                                                    │
│ - GET/PATCH /api/admin/cms/seo/pages/[encodedPath] — get/update SEO for a specific page path                                                     │
│ - POST /api/admin/cms/seo/audit — run SEO audit across all pages, return scores                                                                  │
│ - GET/POST /api/admin/cms/seo/cities — list/create city landing pages                                                                            │
│ - GET/PATCH/DELETE /api/admin/cms/seo/cities/[id] — CRUD single city page                                                                        │
│ - GET/PATCH /api/admin/cms/seo/ai-txt — get/update ai.txt content                                                                                │
│                                                                                                                                                  │
│ All routes enforce cms.seo.manage permission.                                                                                                    │
│                                                                                                                                                  │
│ 13.13 Public Page Integration                                                                                                                    │
│                                                                                                                                                  │
│ Every public page's generateMetadata() enhanced to:                                                                                              │
│ 1. Check page_seo table for overrides (title, description, keywords, OG)                                                                         │
│ 2. Fall back to auto-generated metadata if no override exists                                                                                    │
│ 3. Include keywords meta tag from meta_keywords field                                                                                            │
│ 4. Include canonical URL                                                                                                                         │
│ 5. Include robots directive                                                                                                                      │
│ 6. Include OG image (custom or auto-generated)                                                                                                   │
│                                                                                                                                                  │
│ New helper: src/lib/seo/page-seo.ts                                                                                                              │
│ - getPageSeo(pagePath) — cached lookup of page_seo by path                                                                                       │
│ - mergeMetadata(autoGenerated, overrides) — merge auto metadata with admin overrides                                                             │
│ - Used by all 13+ generateMetadata() functions                                                                                                   │
│                                                                                                                                                  │
│ Static generation:                                                                                                                               │
│ - All service pages: generateStaticParams() (already exists)                                                                                     │
│ - All product pages: generateStaticParams() (already exists)                                                                                     │
│ - All city pages: generateStaticParams() (new)                                                                                                   │
│ - Gallery page: static by default (Server Component)                                                                                             │
│ - Homepage: static by default                                                                                                                    │
│                                                                                                                                                  │
│ 13.14 Files                                                                                                                                      │
│                                                                                                                                                  │
│ New files:                                                                                                                                       │
│ - src/app/ai.txt/route.ts — AI crawler rules                                                                                                     │
│ - src/app/(public)/areas/[citySlug]/page.tsx — city landing page                                                                                 │
│ - src/app/admin/website/seo/page.tsx — SEO dashboard                                                                                             │
│ - src/app/admin/website/seo/cities/page.tsx — city page manager                                                                                  │
│ - src/app/opengraph-image.tsx — dynamic OG image generator                                                                                       │
│ - src/lib/seo/page-seo.ts — per-page SEO data layer                                                                                              │
│ - src/lib/data/cities.ts — city landing page data                                                                                                │
│ - supabase/migrations/20260214000009_seo_engine.sql                                                                                              │
│                                                                                                                                                  │
│ Modified files:                                                                                                                                  │
│ - src/app/sitemap.xml/route.ts — add city pages, lastmod dates                                                                                   │
│ - src/app/robots.txt/route.ts — add reference to ai.txt                                                                                          │
│ - src/lib/seo/json-ld.ts — AggregateRating, FAQPage, GeoCircle, sameAs                                                                           │
│ - src/lib/seo/metadata.ts — integrate page_seo overrides                                                                                         │
│ - All 13+ generateMetadata() functions — merge with page_seo overrides                                                                           │
│ - src/components/public/site-footer.tsx — add Service Areas links section                                                                        │
│ - src/lib/auth/roles.ts — add SEO sub-item to Website sidebar                                                                                    │
│ - Product/service admin edit pages — add image alt text fields                                                                                   │
│ - src/lib/supabase/types.ts — PageSeo, CityLandingPage interfaces                                                                                │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Wave 14: Terms & Conditions Page                                                                                                                 │
│                                                                                                                                                  │
│ Purpose: Protect the business legally with a comprehensive, auto-detailing-specific Terms & Conditions page. Covers service liability, vehicle   │
│ pickup, SMS/email marketing consent, and standard business protections.                                                                          │
│                                                                                                                                                  │
│ 14.1 Public Page                                                                                                                                 │
│                                                                                                                                                  │
│ Route: /terms (also accessible via /terms-and-conditions redirect)                                                                               │
│                                                                                                                                                  │
│ File: src/app/(public)/terms/page.tsx — Server Component for SEO                                                                                 │
│                                                                                                                                                  │
│ generateMetadata(): "Terms & Conditions | Smart Details Auto Spa"                                                                                │
│                                                                                                                                                  │
│ Content sections (admin-editable via CMS):                                                                                                       │
│                                                                                                                                                  │
│ 1. Service Agreement & Liability                                                                                                                 │
│   - Smart Details Auto Spa exercises professional care but is NOT responsible for:                                                               │
│       - Pre-existing scratches, swirl marks, paint chips, or clear coat failure                                                                  │
│     - Items left in vehicles (valuables, personal property, electronics)                                                                         │
│     - Pre-existing mechanical or electrical issues                                                                                               │
│     - Damage from prior poor-quality paint work, vinyl wraps, or aftermarket modifications                                                       │
│     - Weather-related issues during mobile service (customer-chosen outdoor location)                                                            │
│   - Customer acknowledges vehicle condition at intake (documented via photo inspection)                                                          │
│   - Claims must be reported within 24 hours of service completion with supporting evidence                                                       │
│ 2. Vehicle Pickup & Storage                                                                                                                      │
│   - Vehicles must be picked up by end of business day unless prior arrangements have been made                                                   │
│   - After-hours pickup may be arranged — additional fee may apply                                                                                │
│   - Vehicles not picked up within 48 hours may incur daily storage fees                                                                          │
│   - Business is not responsible for vehicles left after scheduled pickup time                                                                    │
│ 3. Payment Terms                                                                                                                                 │
│   - Payment is due upon completion of service                                                                                                    │
│   - Accepted methods: cash, credit/debit card, check                                                                                             │
│   - Returned check fee applies                                                                                                                   │
│   - Deposits for ceramic coating services are non-refundable                                                                                     │
│ 4. Cancellation & No-Show Policy                                                                                                                 │
│   - Cancellation fee: $50 (as configured in business_settings, dynamic)                                                                          │
│   - 24-hour notice required for cancellation without fee                                                                                         │
│   - No-shows are charged the full cancellation fee                                                                                               │
│   - Repeated no-shows may result in a required deposit for future bookings                                                                       │
│ 5. SMS & Text Message Consent                                                                                                                    │
│   - By providing your phone number, you consent to receive:                                                                                      │
│       - Service-related messages (appointment confirmations, reminders, completion notifications)                                                │
│     - Marketing messages (promotions, special offers, seasonal deals) — optional opt-in                                                          │
│   - Message and data rates may apply                                                                                                             │
│   - Message frequency varies                                                                                                                     │
│   - Reply STOP to opt out of marketing messages at any time                                                                                      │
│   - Reply HELP for assistance                                                                                                                    │
│   - Opt-out from marketing does NOT affect service-related messages                                                                              │
│   - Full TCPA compliance disclosure                                                                                                              │
│ 6. Email Communications                                                                                                                          │
│   - By providing your email, you may receive:                                                                                                    │
│       - Transactional emails (booking confirmations, receipts, quote notifications)                                                              │
│     - Marketing emails (promotions, newsletters) — optional opt-in                                                                               │
│   - Unsubscribe link provided in every marketing email                                                                                           │
│   - CAN-SPAM compliance                                                                                                                          │
│ 7. Photo Documentation & Usage                                                                                                                   │
│   - Service photos are taken for quality documentation purposes                                                                                  │
│   - Photos may be used for marketing (website gallery, social media) unless customer opts out                                                    │
│   - Internal-only photos are never shared publicly                                                                                               │
│   - Customer can request photo removal at any time                                                                                               │
│ 8. Warranty & Service Guarantees                                                                                                                 │
│   - Ceramic coating warranty terms (varies by product tier: 1-year, 3-year, 5-year)                                                              │
│   - Warranty requires recommended maintenance schedule                                                                                           │
│   - Warranty void if: improper washing, chemical damage, physical damage, unauthorized touch-ups                                                 │
│   - Standard services: satisfaction guarantee within 24 hours                                                                                    │
│ 9. Mobile/On-Location Service                                                                                                                    │
│   - Customer must provide adequate workspace (shade preferred, flat surface)                                                                     │
│   - Water and electrical access required for certain services                                                                                    │
│   - Customer responsible for ensuring the location is safe and accessible                                                                        │
│   - Right to refuse service if location is deemed unsafe or inadequate                                                                           │
│ 10. Privacy Policy Reference                                                                                                                     │
│   - Brief statement referencing data handling                                                                                                    │
│   - Customer data stored securely (Supabase with RLS)                                                                                            │
│   - Data not sold to third parties                                                                                                               │
│   - Link to full privacy policy (if/when created)                                                                                                │
│ 11. General Terms                                                                                                                                │
│   - Right to refuse service                                                                                                                      │
│   - Pricing subject to change without notice                                                                                                     │
│   - Service estimates are approximations — final price may vary based on vehicle condition                                                       │
│   - Governing law: State of California                                                                                                           │
│   - Dispute resolution: mediation/arbitration preferred                                                                                          │
│                                                                                                                                                  │
│ 14.2 Admin CMS Integration                                                                                                                       │
│                                                                                                                                                  │
│ Storage: business_settings key terms_and_conditions (JSONB)                                                                                      │
│ - Each section: { title, content, is_active } — admin can enable/disable individual sections                                                     │
│ - Rich text content (stored as Markdown, rendered as HTML)                                                                                       │
│                                                                                                                                                  │
│ Admin page: /admin/website/terms/page.tsx                                                                                                        │
│ - Section editor with drag-to-reorder                                                                                                            │
│ - Rich text editor per section (Markdown)                                                                                                        │
│ - Enable/disable individual sections                                                                                                             │
│ - "Effective Date" field displayed on public page                                                                                                │
│ - "Last Updated" auto-set on save                                                                                                                │
│                                                                                                                                                  │
│ Alternative: Could use page_seo + a dedicated terms_content business_settings key. Simpler than a new table.                                     │
│                                                                                                                                                  │
│ 14.3 Integration Points                                                                                                                          │
│                                                                                                                                                  │
│ - Booking form: "I agree to the Terms & Conditions" checkbox with link to /terms (required)                                                      │
│ - Quote acceptance page: Terms link in footer                                                                                                    │
│ - Public pages footer: "Terms & Conditions" link                                                                                                 │
│ - SMS marketing footer: "Terms apply: {terms_url}" option                                                                                        │
│                                                                                                                                                  │
│ 14.4 Files                                                                                                                                       │
│                                                                                                                                                  │
│ New files:                                                                                                                                       │
│ - src/app/(public)/terms/page.tsx — T&C public page (Server Component)                                                                           │
│ - src/app/admin/website/terms/page.tsx — T&C admin editor                                                                                        │
│                                                                                                                                                  │
│ Modified files:                                                                                                                                  │
│ - src/components/public/site-footer.tsx — add Terms link                                                                                         │
│ - src/components/booking/step-review.tsx — add T&C checkbox                                                                                      │
│ - src/app/sitemap.xml/route.ts — add /terms page                                                                                                 │
│ - src/lib/auth/roles.ts — add Terms sub-item under Website sidebar                                                                               │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Updated Files Modified (Complete List)                                                                                                           │
│                                                                                                                                                  │
│ Waves 1-6 Files (Visual Redesign)                                                                                                                │
│                                                                                                                                                  │
│ (same as above — globals.css, header, footer, hero, trust bar, CTA, all public pages, shared components)                                         │
│                                                                                                                                                  │
│ Wave 7-12 Files (CMS System)                                                                                                                     │
│                                                                                                                                                  │
│ New Database Migrations (7):                                                                                                                     │
│ - 20260214000001_cms_hero_carousel.sql                                                                                                           │
│ - 20260214000002_cms_tickers.sql                                                                                                                 │
│ - 20260214000003_cms_ads.sql                                                                                                                     │
│ - 20260214000004_cms_themes.sql                                                                                                                  │
│ - 20260214000005_cms_catalog_controls.sql                                                                                                        │
│ - 20260214000006_cms_feature_flags.sql                                                                                                           │
│ - 20260214000007_cms_storage.sql                                                                                                                 │
│                                                                                                                                                  │
│ New Data/Utility Files:                                                                                                                          │
│ - src/lib/data/cms.ts — server-side CMS data layer                                                                                               │
│ - src/lib/utils/cms-zones.ts — ad zone definitions                                                                                               │
│ - src/lib/utils/cms-theme-presets.ts — seasonal theme presets                                                                                    │
│                                                                                                                                                  │
│ New Admin Pages (12):                                                                                                                            │
│ - src/app/admin/website/page.tsx — CMS index                                                                                                     │
│ - src/app/admin/website/hero/page.tsx — hero manager                                                                                             │
│ - src/app/admin/website/hero/[id]/page.tsx — slide editor                                                                                        │
│ - src/app/admin/website/tickers/page.tsx — ticker manager                                                                                        │
│ - src/app/admin/website/tickers/[id]/page.tsx — ticker editor                                                                                    │
│ - src/app/admin/website/ads/page.tsx — ad hub (creatives + page map + analytics)                                                                 │
│ - src/app/admin/website/ads/creatives/[id]/page.tsx — ad creative editor                                                                         │
│ - src/app/admin/website/themes/page.tsx — theme manager                                                                                          │
│ - src/app/admin/website/themes/[id]/page.tsx — theme editor                                                                                      │
│ - src/app/admin/website/catalog/page.tsx — catalog display controls                                                                              │
│                                                                                                                                                  │
│ New Admin API Routes (20+):                                                                                                                      │
│ - /api/admin/cms/hero/ (list, create, [id] CRUD, reorder, config)                                                                                │
│ - /api/admin/cms/tickers/ (list, create, [id] CRUD)                                                                                              │
│ - /api/admin/cms/ads/creatives/ (list, create, [id] CRUD)                                                                                        │
│ - /api/admin/cms/ads/placements/ (list, create, [id] CRUD)                                                                                       │
│ - /api/admin/cms/ads/zones, /api/admin/cms/ads/analytics                                                                                         │
│ - /api/admin/cms/themes/ (list, create, [id] CRUD, activate, deactivate)                                                                         │
│ - /api/admin/cms/catalog/services, /api/admin/cms/catalog/products                                                                               │
│                                                                                                                                                  │
│ New Public API Routes (6):                                                                                                                       │
│ - /api/public/cms/hero, /api/public/cms/tickers, /api/public/cms/ads, /api/public/cms/ads/impression, /api/public/cms/ads/click,                 │
│ /api/public/cms/theme                                                                                                                            │
│                                                                                                                                                  │
│ New Public Components (5):                                                                                                                       │
│ - src/components/public/cms/hero-carousel.tsx                                                                                                    │
│ - src/components/public/cms/announcement-ticker.tsx                                                                                              │
│ - src/components/public/cms/ad-zone.tsx                                                                                                          │
│ - src/components/public/cms/particle-canvas.tsx                                                                                                  │
│ - src/components/public/cms/theme-provider.tsx                                                                                                   │
│                                                                                                                                                  │
│ New SEO Files (Wave 13):                                                                                                                         │
│ - src/app/ai.txt/route.ts — AI crawler rules                                                                                                     │
│ - src/app/(public)/areas/[citySlug]/page.tsx — city landing pages                                                                                │
│ - src/app/admin/website/seo/page.tsx — SEO dashboard                                                                                             │
│ - src/app/admin/website/seo/cities/page.tsx — city page manager                                                                                  │
│ - src/app/opengraph-image.tsx — dynamic OG image generator                                                                                       │
│ - src/lib/seo/page-seo.ts — per-page SEO data layer                                                                                              │
│ - src/lib/data/cities.ts — city landing page data                                                                                                │
│ - supabase/migrations/20260214000009_seo_engine.sql — page_seo + city_landing_pages tables + image alt columns                                   │
│                                                                                                                                                  │
│ New T&C Files (Wave 14):                                                                                                                         │
│ - src/app/(public)/terms/page.tsx — Terms & Conditions public page                                                                               │
│ - src/app/admin/website/terms/page.tsx — Terms admin editor                                                                                      │
│                                                                                                                                                  │
│ New Permission Migration:                                                                                                                        │
│ - supabase/migrations/20260214000008_cms_permissions.sql — 7 CMS permission keys (83 total)                                                      │
│                                                                                                                                                  │
│ Modified Files:                                                                                                                                  │
│ - src/lib/auth/roles.ts — add Website sidebar section with SEO sub-item                                                                          │
│ - src/app/admin/admin-shell.tsx — new icons, feature flag gating, permission-based visibility                                                    │
│ - src/app/(public)/layout.tsx — theme provider, top bar ticker integration                                                                       │
│ - src/app/(public)/page.tsx — hero carousel, ad zones, section tickers                                                                           │
│ - All public service/product pages — ad zones + show_on_website filter                                                                           │
│ - src/lib/data/services.ts — show_on_website filter                                                                                              │
│ - src/lib/data/products.ts — show_on_website filter                                                                                              │
│ - src/lib/supabase/types.ts — new interfaces + updated Product/Service + PageSeo + CityLandingPage                                               │
│ - src/lib/utils/constants.ts — new feature flag keys + 'Website' permission category                                                             │
│ - src/lib/utils/role-defaults.ts — 7 CMS permission keys added                                                                                   │
│ - src/lib/cron/scheduler.ts — theme auto-activation cron                                                                                         │
│ - src/app/sitemap.xml/route.ts — city pages + lastmod dates                                                                                      │
│ - src/app/robots.txt/route.ts — ai.txt reference                                                                                                 │
│ - src/lib/seo/json-ld.ts — AggregateRating, FAQPage, GeoCircle, sameAs                                                                           │
│ - src/lib/seo/metadata.ts — page_seo override integration                                                                                        │
│ - All 13+ generateMetadata() functions — merge with page_seo overrides                                                                           │
│ - src/components/public/site-footer.tsx — Service Areas links section                                                                            │
│ - Product/service admin edit pages — image alt text fields                                                                                       │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Updated Execution Order & Session Parallelization                                                                                                │
│                                                                                                                                                  │
│ Each step is labeled with its session dependency:                                                                                                │
│ - SOLO = must run alone (touches shared infrastructure that other sessions depend on)                                                            │
│ - PARALLEL = can run simultaneously with other PARALLEL steps at the same level                                                                  │
│ - SEQUENTIAL = depends on the previous step completing first                                                                                     │
│                                                                                                                                                  │
│ Phase 1 — Visual Redesign (Waves 1-6)                                                                                                            │
│                                                                                                                                                  │
│ Step 1 — Foundation (SOLO — shared files)                                                                                                        │
│ - globals.css → header → footer → google-reviews helper → featured-photos helper                                                                 │
│ - Why solo: Header/footer are shared across all pages. Must be done first.                                                                       │
│                                                                                                                                                  │
│ Step 2 — Homepage + Shared Components (SOLO — must see new header/footer)                                                                        │
│ - Hero → trust bar → bento grid → team section → review cards → CTA → ScrollReveal tuning                                                        │
│                                                                                                                                                  │
│ Step 3 — Content Pages (3 PARALLEL sessions after Step 2)                                                                                        │
│ - Session A: Service pages (index → category → detail) — independent page group                                                                  │
│ - Session B: Product pages (index → category → detail) — independent page group                                                                  │
│ - Session C: Gallery + Quote (CSS only) + Booking (minimal) — independent page group                                                             │
│                                                                                                                                                  │
│ Phase 2 — CMS Infrastructure (Wave 7)                                                                                                            │
│                                                                                                                                                  │
│ Step 4 — Migrations + Types + Permissions (SOLO — database foundation)                                                                           │
│ - Run all 9 migrations (hero, tickers, ads, themes, catalog controls, feature flags, storage, permissions, SEO)                                  │
│ - TypeScript types → data layer → permission defaults → constants → admin sidebar                                                                │
│ - Why solo: Everything in Phase 3 depends on these tables/types existing.                                                                        │
│                                                                                                                                                  │
│ Phase 3 — CMS Features (Waves 8-12) + SEO + T&C                                                                                                  │
│                                                                                                                                                  │
│ Step 5 — CMS Features (4 PARALLEL sessions after Step 4)                                                                                         │
│ - Session D: Hero carousel — admin pages + API routes + public component                                                                         │
│ - Session E: Tickers — admin pages + API routes + public component                                                                               │
│ - Session F: Catalog display controls + About & Team — admin pages + API routes + public filter updates                                          │
│ - Session G: Terms & Conditions — public page + admin editor + booking form checkbox                                                             │
│                                                                                                                                                  │
│ Step 6 — CMS Features continued (2 PARALLEL sessions after Step 5)                                                                               │
│ - Session H: Ad placement — admin pages (creatives + page map + analytics) + API routes + public component + impression/click tracking           │
│ - Session I: Seasonal themes — admin pages + API routes + public components (particle canvas, theme provider) + cron                             │
│                                                                                                                                                  │
│ Why Step 6 after Step 5: Ads and themes are the most complex CMS features and may reference tickers/hero slides. Simpler features (D-G) should   │
│ be stable first.                                                                                                                                 │
│                                                                                                                                                  │
│ Phase 4 — SEO Engine (Wave 13)                                                                                                                   │
│                                                                                                                                                  │
│ Step 7 — SEO Core (SOLO — touches all generateMetadata functions)                                                                                │
│ - Per-page SEO data layer (page-seo.ts) + merge helper                                                                                           │
│ - Update all 13+ generateMetadata() functions to check page_seo table                                                                            │
│ - Enhanced sitemap (city pages + lastmod)                                                                                                        │
│ - ai.txt route                                                                                                                                   │
│ - robots.txt update                                                                                                                              │
│ - Why solo: Touches every public page's metadata function — conflicts with any page work.                                                        │
│                                                                                                                                                  │
│ Step 8 — SEO Features (3 PARALLEL sessions after Step 7)                                                                                         │
│ - Session J: City landing pages (public page + admin city manager + generateStaticParams)                                                        │
│ - Session K: SEO admin dashboard + page editor (list all pages, inline edit, scoring, audit)                                                     │
│ - Session L: OG image generation + image alt management + enhanced JSON-LD (AggregateRating, FAQPage, GeoCircle) + internal linking (footer city │
│  links, related services)                                                                                                                        │
│                                                                                                                                                  │
│ Summary: 12 execution steps across 4 phases                                                                                                      │
│                                                                                                                                                  │
│ ┌──────┬────────────┬───────────────────────┬────────────┐                                                                                       │
│ │ Step │  Sessions  │     Can Parallel?     │ Depends On │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 1    │ 1 session  │ SOLO                  │ —          │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 2    │ 1 session  │ SOLO                  │ Step 1     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 3    │ 3 sessions │ PARALLEL (A, B, C)    │ Step 2     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 4    │ 1 session  │ SOLO                  │ Step 3     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 5    │ 4 sessions │ PARALLEL (D, E, F, G) │ Step 4     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 6    │ 2 sessions │ PARALLEL (H, I)       │ Step 5     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 7    │ 1 session  │ SOLO                  │ Step 6     │                                                                                       │
│ ├──────┼────────────┼───────────────────────┼────────────┤                                                                                       │
│ │ 8    │ 3 sessions │ PARALLEL (J, K, L)    │ Step 7     │                                                                                       │
│ └──────┴────────────┴───────────────────────┴────────────┘                                                                                       │
│                                                                                                                                                  │
│ Total sessions: ~16 (4 solo + 12 parallel across 4 batches)                                                                                      │
│ Minimum wall-clock steps: 8 (each parallel batch counts as 1 step)                                                                               │
│                                                                                                                                                  │
│ ---                                                                                                                                              │
│ Verification                                                                                                                                     │
│                                                                                                                                                  │
│ Visual Redesign (Waves 1-6)                                                                                                                      │
│                                                                                                                                                  │
│ 1. npx tsc --noEmit — zero TypeScript errors                                                                                                     │
│ 2. Visual check every public page at 3 breakpoints: mobile (375px), tablet (768px), desktop (1440px)                                             │
│ 3. Dark mode check on all pages                                                                                                                  │
│ 4. Lighthouse score: target 90+ Performance, 100 Accessibility                                                                                   │
│ 5. Hero BeforeAfterSlider loads correctly (needs featured photos in DB)                                                                          │
│ 6. Google + Yelp review data displays from business_settings                                                                                     │
│ 7. Team section renders from admin-managed data (no hardcoded names)                                                                             │
│ 8. Google review cards show actual review text                                                                                                   │
│ 9. Booking flow end-to-end (no logic changes)                                                                                                    │
│ 10. All internal links work (breadcrumbs, nav, cards)                                                                                            │
│                                                                                                                                                  │
│ CMS System (Waves 7-12)                                                                                                                          │
│                                                                                                                                                  │
│ 11. CMS permissions: grant cms.hero.manage to a cashier → verify they can access Hero admin page                                                 │
│ 12. CMS permissions: deny cms.ads.manage to admin → verify 403 on ad routes                                                                      │
│ 13. Hero carousel: switch between carousel/single mode, all 3 content types render                                                               │
│ 14. Tickers: top bar + section tickers show on correct pages, respect schedule                                                                   │
│ 15. Ads: create creative, assign to zone, verify impression/click tracking                                                                       │
│ 16. Themes: activate a preset, verify color changes + particles render, deactivate                                                               │
│ 17. Catalog: toggle show_on_website off → product/service disappears from public site                                                            │
│ 18. Feature flags: disable each CMS feature → verify graceful fallback                                                                           │
│ 19. Cron: theme auto-activation fires on schedule                                                                                                │
│ 20. Mobile: all CMS features render correctly on mobile                                                                                          │
│ 21. Performance: particle effects don't degrade page speed (check FPS)                                                                           │
│                                                                                                                                                  │
│ SEO Engine (Wave 13)                                                                                                                             │
│                                                                                                                                                  │
│ 22. Per-page SEO: set custom title/description for a service page → verify in page source                                                        │
│ 23. SEO score: focus keyword in title + description → green score                                                                                │
│ 24. City pages: /areas/torrance renders with city-specific content, correct meta tags                                                            │
│ 25. City pages appear in sitemap.xml with priority 0.8                                                                                           │
│ 26. ai.txt accessible and contains correct crawler rules                                                                                         │
│ 27. robots.txt references ai.txt                                                                                                                 │
│ 28. OG images generate correctly for homepage, service, product, and city pages                                                                  │
│ 29. Image alt tags: product/service images have alt text from DB (not empty)                                                                     │
│ 30. Google SERP preview in admin matches actual page source                                                                                      │
│ 31. JSON-LD: AggregateRating appears on homepage with Google review data                                                                         │
│ 32. JSON-LD: FAQPage schema on service detail pages                                                                                              │
│ 33. Internal links: service pages link to related services, footer shows city links                                                              │
│ 34. Lighthouse SEO score: 100 on all public pages                                                                                                │
│ 35. Google Search Console: submit sitemap, verify all pages indexed (post-deployment)                                                            │
│                                                                                                                                                  │
│ Terms & Conditions (Wave 14)                                                                                                                     │
│                                                                                                                                                  │
│ 36. T&C page renders at /terms with all sections from admin CMS                                                                                  │
│ 37. Admin can enable/disable, reorder, and edit each T&C section                                                                                 │
│ 38. Booking form includes "I agree to Terms & Conditions" checkbox with link                                                                     │
│ 39. T&C link appears in public footer                                                                                                            │
│ 40. T&C page appears in sitemap.xml  