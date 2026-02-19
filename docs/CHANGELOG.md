# Changelog — Auto Detail App

Archived session history and bug fixes. Moved from CLAUDE.md to keep handoff context lean.

---

## Configurable Footer — Frontend Component — 2026-02-19

### Session 2: Dynamic footer rendering from database

**Migration (`20260219000003_footer_business_info_type.sql`):**
- Added `business_info` to `footer_columns.content_type` CHECK constraint
- Updated Contact column from `html` to `business_info` type

**Server component (`site-footer.tsx`):**
- Rewritten to accept `footerData: FooterData` prop instead of `navItems`
- Fetches review data internally (not part of FooterData — separate data source)
- Passes `footerData`, formatted `phone`, and `reviews` to client

**Client component (`footer-client.tsx`):**
- Full rewrite. All 3 sections render conditionally from `footer_sections.is_enabled`
- **Main Footer**: Brand column (logo, tagline, contact, reviews) + dynamic nav columns from `footer_columns`. Grid adapts to column count (1-4). Three column content types:
  - `links` — nav items from `website_navigation` via `footer_column_id`
  - `business_info` — auto-renders phone/email + Book Appointment/Get a Quote CTAs from BusinessInfo
  - `html` — dangerouslySetInnerHTML with styled link classes
- **Service Areas**: Configurable prefix text from `footer_sections.config.prefix_text`. Configurable dividers from `config.show_dividers`.
- **Bottom Bar**: Dynamic links from `footer_bottom_links`. Dead Unsubscribe link removed (was 404).
- **Trust badges**: Preserved as-is (hardcoded, not part of configurable system)
- All existing CSS classes preserved exactly — visual output identical with default data

**Layout updates:**
- All 3 layouts (public, account, customer-auth) now pass `footerData` prop directly to `SiteFooter`
- Removed intermediate `footerNav` extraction from Session 1

**Types:**
- `FooterColumn.content_type` updated: `'links' | 'html' | 'business_info'`

**Files modified (6):** `site-footer.tsx`, `footer-client.tsx`, 3 layouts, `types.ts`
**Files created (1):** migration `20260219000003`

**Verification:** TypeScript clean, build passes, Contact column confirmed as `business_info` in DB.

---

## Configurable Footer System — Database + API Routes — 2026-02-19

### Session 1: Database schema, API routes, and data layer for admin-configurable footer

**Database (migration `20260219000002_footer_sections.sql`):**
- `footer_sections` table — 3 seeded sections (main, service_areas, bottom_bar) with enable/disable, sort_order, JSONB config
- `footer_columns` table — configurable columns for main footer section (max 4 per section). 2 seeded: Quick Links (links type) + Contact (html type)
- `footer_bottom_links` table — legal/utility links in bottom bar. Seeded: Terms & Conditions only (dead Unsubscribe link removed)
- `footer_column_id` FK added to `website_navigation` — existing 6 footer_quick_links nav items migrated to Quick Links column
- RLS policies: public read, authenticated write (matches website_navigation pattern)
- `updated_at` triggers on all 3 new tables

**TypeScript types (`types.ts`):**
- `FooterSection`, `FooterColumn`, `FooterBottomLink`, `FooterData` interfaces
- `FooterSectionKey` type union
- `footer_column_id` added to `WebsiteNavItem`

**Data layer (`website-pages.ts`):**
- `getFooterData()` — cached with `unstable_cache`, `footer-data` tag, 60s revalidation. Fetches sections, enabled columns with attached links, bottom links, cities, and business info in parallel.

**API routes (5 new files under `/api/admin/footer/`):**
- `sections/route.ts` — GET (list), PATCH (update section enable/config)
- `columns/route.ts` — GET (list), POST (create, max 4 limit), PATCH (update), DELETE
- `columns/[columnId]/links/route.ts` — GET, POST, PATCH, DELETE for column links
- `columns/reorder/route.ts` — PATCH (batch reorder)
- `bottom-links/route.ts` — GET, POST, PATCH, DELETE
- All routes use `createAdminClient()`, `cms.pages.manage` permission, `revalidateTag('footer-data')`

**Layout updates:**
- `(public)/layout.tsx` — replaced `getNavigationItems('footer_quick_links')` with `getFooterData()`, extracts Quick Links for backward-compatible `navItems` prop
- `(account)/layout.tsx` — added `getFooterData()` fetch, passes `navItems` to SiteFooter (was not passing any before)
- `(customer-auth)/layout.tsx` — same as account layout

**Cache revalidation:**
- Added `revalidateTag('footer-data')` to all 3 existing navigation CMS routes (create, update, delete, reorder)

**Files created (6):** migration, 5 API route files
**Files modified (7):** `types.ts`, `website-pages.ts`, 3 layouts, `navigation/route.ts`, `navigation/[id]/route.ts`, `navigation/reorder/route.ts`

**Verification:** TypeScript clean, build passes, 3 sections + 2 columns + 1 bottom link + 6 migrated nav items confirmed in DB.

---

## Fix: Ticker Scroll, Section Tickers, Particle Rendering — 2026-02-19

### fix: ticker marquee scroll, section placement, particle flag reliability

**Bug 1 — Tickers Not Scrolling (FIXED)**
- Root cause: `TopBarTicker` used Framer Motion vertical fade transition instead of horizontal marquee scroll. Hardcoded `text-sm` — ignored `font_size` DB field. Ignored `scroll_speed` DB field.
- Fix: Rewrote `TopBarTicker` with CSS marquee animation (duplicated content, `animate-marquee` from globals.css). Scroll speed mapped: slow=35s, normal=20s, fast=10s. Font size mapped: xs/sm/base/lg → Tailwind text classes. Multiple tickers rotate every 8s.
- Also removed dismiss X button and sessionStorage logic — ticker no longer has a close button that permanently hides it for the session.

**Bug 2 — Section Tickers Not Appearing (FIXED)**
- Root cause: `SectionTicker` component existed but was NEVER rendered anywhere. `getSectionTickers()` data function existed but was never called from any public page.
- Fix: Homepage now fetches `getSectionTickers('/')` and renders `SectionTicker` between Services and "Why Choose Us" sections when placement is set to "Between Sections".

**Bug 3 — Particle Effects Still Not Rendering (IMPROVED)**
- Root cause: Previous `setFeatureFlag()` used `.update().select('id')` which may return ambiguous results from Supabase PostgREST.
- Fix: Changed to explicit check-then-update/insert pattern: `.select().maybeSingle()` to check existence, then `.update()` if exists or `.insert()` if not. More reliable than the previous update+select approach.

**Files modified (3):**
- `src/components/public/cms/announcement-ticker.tsx` — Complete rewrite: CSS marquee scroll, scroll_speed/font_size support, removed dismiss button, SectionTicker also uses marquee
- `src/app/(public)/page.tsx` — Added section ticker fetch + rendering between homepage sections
- `src/lib/utils/feature-flags.ts` — Changed to check-then-update/insert pattern for reliability

**Verification**: TypeScript clean (`tsc --noEmit`), build passes (`npm run build`).

---

## Verified Bug Fixes: Tickers + Particle Rendering — 2026-02-19

### fix: tickers "Failed to Update" error + desktop particle rendering

**Bug 1 — Tickers "Failed to Update" (ACTUAL ROOT CAUSE FOUND)**
- Previous session's "fix" only added a warning banner — never fixed the actual API call
- Root cause: Admin page (`/admin/website/tickers/page.tsx:67`) calls `PATCH /api/admin/settings/business` which **DID NOT EXIST**. Next.js returns 404 → catch block fires → "Failed to update" toast
- Also affects: Ads admin page (`/admin/website/ads/page.tsx:121`) — same missing endpoint
- Fix: Created `/api/admin/settings/business/route.ts` with GET (read by key) and PATCH (upsert by key) handlers. Uses `getEmployeeFromSession()` auth + `createAdminClient()` for DB. Upserts into `business_settings` table with `onConflict: 'key'`. Revalidates `cms-toggles` cache tag.
- Verified: Full chain traced — toggle click → `adminFetch('/api/admin/settings/business', { method: 'PATCH', body: { key: 'ticker_enabled', value: true } })` → new API route → `business_settings.upsert()` → `revalidateTag('cms-toggles')` → layout re-reads toggles

**Bug 2 — Desktop Particle Effects Not Rendering (ACTUAL ROOT CAUSE FOUND)**
- Previous session assumed hydration fix would resolve particles — it didn't
- Root cause: `setFeatureFlag()` in `src/lib/utils/feature-flags.ts` used `.update()` which silently does nothing if the flag row doesn't exist in the DB. When admin activates a seasonal theme → `setFeatureFlag('seasonal_themes', true)` → update affects 0 rows → flag stays `false` → `getCmsToggles()` returns `seasonalThemes: false` → layout passes `theme={null}` to ThemeProvider → ParticleCanvas never renders
- Fix: Changed `setFeatureFlag()` to check update result count. If 0 rows updated, falls back to INSERT with auto-generated name/description/category. Ensures flag is always set regardless of DB state.
- Additional fix: Changed ParticleCanvas z-index from `z-50` to `z-30` — particles now render above page content but below sticky header (z-50) and modal overlays (z-90+). Previous z-50 caused particles to compete with header's z-50.
- Verified: No desktop-blocking code in ParticleCanvas. Canvas sizes correctly to `window.innerWidth/Height`. Animation loop starts via `requestAnimationFrame`. Mobile check only reduces particle count (not blocks). Feature flag now reliably sets.

**Files modified (3 created/modified):**
- `src/app/api/admin/settings/business/route.ts` — **NEW** — GET + PATCH for business settings
- `src/lib/utils/feature-flags.ts` — `setFeatureFlag()` update → update+insert fallback
- `src/components/public/cms/particle-canvas.tsx` — z-index: z-50 → z-30

**Verification**: TypeScript clean (`tsc --noEmit`), build passes (`npm run build`).

---

## Theme System Bug Fixes — 2026-02-19

### fix: hydration error, dark/light toggle, seasonal indicator, tickers, desktop particles

**Bug 1 — Hydration Error (ThemeToggleInitializer)**
- Root cause: bare `<script>` tag inside the React component tree caused SSR/client DOM mismatch
- Fix: Replaced with Next.js `<Script strategy="beforeInteractive">` which hoists to `<head>`
- Moved `<ThemeToggleInitializer>` outside the `.public-theme` div in all 3 layouts (public, account, customer-auth)

**Bug 2 — Dark/Light Toggle Not Working**
- Root cause: ThemeProvider sets CSS variables via inline `style` on a parent div; the toggle only set a `data-user-theme` attribute on the child `.public-theme` div, relying on CSS selectors that couldn't reliably override inherited inline styles
- Fix: Toggle now uses `style.setProperty()` to apply all light mode CSS variable overrides directly on the `.public-theme` element, and `style.removeProperty()` to revert to dark mode
- ThemeToggleInitializer script also applies inline styles for flash-free light mode on page load

**Bug 3 — Seasonal Theme Override Without Indication**
- Added amber warning banner on Theme & Style Settings page when a seasonal theme is active
- Banner explains that seasonal theme overrides some colors, links to Manage Seasonal Themes
- Updated page description: "These settings control your site's base theme. Active seasonal themes may override some colors."
- Seasonal Themes list page badge text updated from "Active" to "Currently Active"

**Bug 5 — Tickers "Tickers Enabled" Toggle Doesn't Work**
- Root cause: Layout checks TWO conditions — `announcement_tickers` feature flag AND `ticker_enabled` business setting. Admin's toggle only controls `ticker_enabled`. The `announcement_tickers` flag defaults to `false` and must be enabled separately on Feature Toggles page.
- Fix: Added amber warning banner on Tickers admin page when `announcement_tickers` feature flag is disabled, with link to Feature Toggles page

**Bug 6 — Particles Not Rendering on Desktop**
- No code-level desktop bug found in `particle-canvas.tsx` — canvas sizes correctly, has more particles on desktop, no screen-size gating
- Most likely caused by Bug 1 hydration error preventing ParticleCanvas from properly mounting on client
- Expected to be resolved by Bug 1 fix

**Files modified (7):**
- `src/components/public/theme-toggle-initializer.tsx` — rewritten with Next.js Script
- `src/components/public/theme-toggle.tsx` — rewritten with style.setProperty()
- `src/app/(public)/layout.tsx` — moved ThemeToggleInitializer outside .public-theme
- `src/app/(account)/layout.tsx` — same
- `src/app/(customer-auth)/layout.tsx` — same
- `src/app/admin/website/theme-settings/page.tsx` — seasonal theme warning banner
- `src/app/admin/website/tickers/page.tsx` — feature flag warning banner
- `src/app/admin/website/themes/page.tsx` — "Currently Active" badge text

**Verification**: TypeScript clean, build passes.

---

## Account & Public Component Dark-Safe Colors — 2026-02-17

### fix: migrate remaining hardcoded colors in account pages and public components to dark-safe theme tokens

**Account pages (3 files)**
- `loyalty/page.tsx`: Points change colors `text-green-600`/`text-red-600` → `-400` variants
- `account-shell.tsx`: Deactivated account icon `bg-amber-100`/`text-amber-600` → `bg-amber-500/10`/`text-amber-400`
- `transaction-detail.tsx`: Error text `text-red-600` → `-400`, discount/loyalty rows `text-green-600` → `-400`, loyalty earned text → `-400`

**Account components (2 files)**
- `appointment-edit-dialog.tsx`: Error text `text-red-600` → `-400`, phone icon `text-blue-600` → `-400`
- `appointment-card.tsx`: Cancel button `text-red-600` → `text-red-400`

**Public components (3 files)**
- `mobile-menu.tsx`: Backdrop `bg-navy/95` → `bg-brand-black/95`, nav hover `text-brand-200` → `text-lime`, CTA button → `site-btn-cta`
- `hero-client.tsx`: Service name accent `text-brand-200` → `text-lime`
- `cta-section.tsx`: Gradient endpoint `to-black` → `to-brand-black`

**Verification**: Zero hardcoded matches in account/public scans, `tsc` + `build` pass clean.

---

## Contextual UI Theme System — 2026-02-17

### feat: contextual UI theme system with dark/light user toggle

**Step 1 — Contextual CSS variables in globals.css**
- Added ~35 `--ui-*` variables in `:root` as light defaults (admin pages)
- Added `.public-theme` block overriding UI vars to dark values via existing site vars
- Added `.public-theme[data-user-theme="light"]` block resetting UI vars to light + overriding site-level vars
- Added `@theme inline` mappings for all ui-* tokens plus `--shadow-ui` and `--shadow-ui-lg`

**Step 2 — Theme toggle components**
- Created `theme-toggle.tsx` — client component with sun/moon icon, localStorage persistence (`sd-user-theme`)
- Created `theme-toggle-initializer.tsx` — inline `<script>` to prevent flash of wrong theme

**Step 3 — Wired into layouts and headers**
- Added ThemeToggle to header-client.tsx (between Sign In and Cart icon)
- Added ThemeToggleInitializer to all 3 public layouts
- Fixed customer-auth layout missing `public-theme` class

**Step 4 — Migrated all 25 UI components to contextual tokens**
- card, dialog, input, textarea, select, table, button (6 variants), badge, tabs, dropdown-menu, checkbox, switch, skeleton, spinner, label, form-field, page-header, empty-state, search-input, data-table, pagination, slide-over, confirm-dialog, send-method-dialog, toggle-pill
- Replaced all `dark:`, `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*` with `ui-*` tokens
- Straggler scan: zero remaining hardcoded classes in `src/components/ui/`

**Step 5 — Verification**
- TypeScript: zero errors
- Build: passes clean
- Grep straggler scan: zero matches

---

## Theme Consistency Fix — 2026-02-17

### fix: theme consistency — login buttons, active tab, hardcoded classes, dead admin fields

**Fix 1 — Remove dead theme settings fields from admin UI**
- Removed Mode toggle (dark/light), Status Colors card (success/warning/error), Font Sizes card (h1-h3/body/small/base), Font Weights card, Line Height card, Primary Button Padding field, Secondary Button card, and entire Borders & Spacing tab
- These 27 fields are saved to DB but never injected by ThemeProvider — admin changes had zero effect
- DB columns preserved; only UI inputs removed. Comments document which fields to re-add when wired

**Fix 2 — Login buttons use `.site-btn-primary`**
- Replaced inline `bg-lime text-black rounded-full` on signin, signup, and reset-password pages with `.site-btn-primary` CSS class
- Buttons now respond to admin Theme Settings button color/radius overrides

**Fix 3 — Account shell active tab visibility**
- Changed active tab from `bg-brand-surface` (invisible against same-color container) to `bg-lime/10 text-lime border border-lime/20`
- Active state now uses accent color, updates with seasonal themes

**Fix 4 — Migrate 11 hardcoded color classes**
- `focus:border-blue-500 focus:ring-blue-500` → `focus:border-lime focus:ring-lime` (services page vehicle filter)
- `text-blue-600 hover:text-blue-800` → `text-site-link hover:text-site-link-hover` (transactions receipt link, service detail gallery link)
- `hover:border-white/20` → `hover:border-site-border-medium` (orders list)
- `divide-white/5` → `divide-site-border-light` (order detail items)
- `border-white/10` → `border-site-border` (order detail total)
- `bg-green-50 text-green-800` → `bg-green-500/10 text-green-400` (loyalty redeem message)

**Fix 5 — Add `public-theme` class to account layout**
- Added `public-theme` to wrapper div for custom scrollbar styles (matches public layout)

**Files modified (10):**
- `src/app/admin/website/theme-settings/page.tsx`
- `src/app/(customer-auth)/signin/page.tsx`
- `src/app/(customer-auth)/signup/page.tsx`
- `src/app/(customer-auth)/signin/reset-password/page.tsx`
- `src/components/account/account-shell.tsx`
- `src/app/(account)/layout.tsx`
- `src/app/(account)/account/services/page.tsx`
- `src/app/(account)/account/transactions/page.tsx`
- `src/app/(account)/account/services/[jobId]/page.tsx`
- `src/app/(account)/account/orders/page.tsx`
- `src/app/(account)/account/orders/[id]/page.tsx`
- `src/app/(account)/account/loyalty/page.tsx`

---

## Phase 9, Session 6 — 2026-02-17 (Fix Order & PaymentIntent Duplication)

### fix: prevent duplicate orders and PaymentIntents in checkout flow

**Root cause**: Every click of "Continue to Payment" created a NEW order + NEW Stripe PaymentIntent. Clicking "Back"/"Edit" wiped orderId/clientSecret state, making the old order unreusable. Result: orphaned orders, wasted order numbers (WO-XXXXX), dozens of "Incomplete" PaymentIntents in Stripe.

#### Fix 1: API accepts existing orderId for updates
- `create-payment-intent` route now accepts optional `orderId` in request body
- UPDATE path: verifies order is still pending, updates fields, replaces order_items, calls `stripe.paymentIntents.update()` on existing PI
- CREATE path: creates order with `order_number = NULL` (assigned after payment), creates PI with `idempotencyKey: order-${order.id}`

#### Fix 2: Checkout page persists order references in sessionStorage
- New `CHECKOUT_ORDER_KEY` sessionStorage stores `{ orderId, clientSecret, totals, cartHash }`
- `computeCartHash()` detects cart changes (sorted item IDs + quantities + coupon code)
- `handleBackFromPayment` no longer clears orderId/clientSecret — only changes step
- If cart hash unchanged and orderId exists, skips API call entirely (reuses existing PI)
- Cart empty redirect checks sessionStorage before redirecting (prevents premature redirect)

#### Fix 3: Abandoned order cleanup cron
- New `GET /api/cron/cleanup-orders` with CRON_API_KEY auth
- Finds pending orders older than 24 hours, cancels their Stripe PIs, marks as 'cancelled'
- Registered in scheduler: every 6 hours

#### Fix 4: Order number assigned AFTER payment (webhook)
- Order numbers (`WO-XXXXX`) no longer assigned at checkout — only after `payment_intent.succeeded` webhook fires
- `order_number` column is now nullable (migration: `ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL`)
- `generateOrderNumber()` filters out NULL order_numbers to prevent incorrect sequence
- Added `payment_intent.canceled` webhook handler: marks order as 'cancelled'

#### Fix 5: Admin orders page excludes abandoned orders
- Default list query excludes `cancelled` and `pending` orders (unless filtered explicitly)
- Stats cards (Total Orders, Revenue, Orders Today) exclude cancelled/pending

#### Fix 6: Customer order history shows only completed orders
- Account orders API filters to `paid`, `refunded`, `partially_refunded` only

#### Fix 7: Confirmation page uses orderId
- Redirects to `/checkout/confirmation?orderId=xxx` (was `?order=WO-XXXXX`)
- Retries up to 3 times with 2s delay if order_number not yet assigned (webhook timing)
- Handles null order_number gracefully: "Your order number will appear shortly"
- Clears both checkout sessionStorage keys on mount
- Legacy `?order=` parameter still supported

**Files created (2):**
- `supabase/migrations/20260217000008_order_checkout_fixes.sql`
- `src/app/api/cron/cleanup-orders/route.ts`

**Files modified (8):**
- `src/app/api/checkout/create-payment-intent/route.ts` — UPDATE/CREATE paths
- `src/app/(public)/checkout/page.tsx` — sessionStorage, cart hash, back navigation
- `src/lib/utils/order-number.ts` — NULL filter
- `src/app/api/webhooks/stripe/route.ts` — order number in webhook, canceled handler
- `src/app/api/checkout/order/route.ts` — support `?id=` lookup
- `src/app/(public)/checkout/confirmation/page.tsx` — orderId param, retry, clear session
- `src/app/api/admin/orders/route.ts` — exclude cancelled/pending
- `src/app/api/account/orders/route.ts` — filter to paid/refunded
- `src/lib/cron/scheduler.ts` — register cleanup-orders cron

---

## Phase 9, Session 5 — 2026-02-17 (Cart/Checkout Bug Fixes + Dark Theme)

### fix: 11 bug fixes — dark theme, auto-populate, tax by state, auto-fetch rates, step navigation, session memory

#### Bug 1: Account pages dark theme
- Migrated ~17 account portal files from hardcoded `text-gray-*`, `bg-white`, `bg-gray-*`, `border-gray-*` to theme-aware classes (`text-site-text`, `text-site-text-muted`, `bg-brand-surface`, `border-site-border`, etc.)
- Files: `account-shell.tsx`, `account/page.tsx`, `profile/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx`, `appointments/page.tsx`, `services/page.tsx`, `services/[jobId]/page.tsx`, `loyalty/page.tsx`, `transactions/page.tsx`, `vehicles/page.tsx`, `appointment-card.tsx`, `coupon-card.tsx`, `vehicle-card.tsx`, `transaction-card.tsx`, `transaction-detail.tsx`, `appointment-edit-dialog.tsx`

#### Bug 2: Cart tax display contradiction
- Removed inline tax calculation from cart page. Now shows "Calculated at checkout" for both tax and shipping. Changed "Total" to "Estimated Total".

#### Bug 3: Cart "Shipping: Free" removed
- Cart page no longer shows a shipping line — fulfillment method is chosen at checkout, not cart.

#### Bug 4: Checkout auto-populate logged-in user
- New API endpoint `GET /api/checkout/customer-info` returns logged-in customer's contact info + address
- Checkout page fetches on mount and pre-fills contact form + shipping address

#### Bug 5: Checkout order summary premature tax/shipping
- Tax and shipping show as "—" until address is entered. Client-side CA tax estimate shows `~$X.XX` prefix.

#### Bug 6 & 7: Shipping rate UX
- Removed manual "Get Shipping Rates" button. Rates auto-fetch via useEffect with 500ms debounce when shipping address fields are valid.
- CTA button shows descriptive disabled states: "Enter shipping address", "Fetching rates...", "Select a shipping rate"

#### Bug 8: Only USPS showing despite enabled carriers
- Fixed carrier filtering in `shippo.ts` to match on `r.provider` (case-insensitive) instead of only `servicelevel.token` prefix
- Added raw rate logging for debugging
- Added amber info box on shipping settings page about UPS/FedEx requiring connected carrier accounts

#### Bug 9: Tax should be CA-only
- `create-payment-intent` route now uses destination-based tax: shipping orders use `shippingAddress.state`, pickup orders use `ship_from_state` from shipping settings
- Tax only applied when state is `CA` (10.25%)

#### Bug 10: Checkout step navigation + session memory
- 3-step breadcrumb navigation (Information → Fulfillment → Payment) with clickable completed steps
- Back button from Payment returns to Fulfillment (resets Stripe state)
- All checkout state persisted to `sessionStorage` (key: `smart-details-checkout`), survives browser back/forward

#### Bug 11: Payment step review
- Step 3 shows full review section: contact info, fulfillment method, shipping address (when applicable) with [Edit] buttons to jump back to relevant step

#### New File (1)
- `src/app/api/checkout/customer-info/route.ts` — GET endpoint for checkout auto-populate

#### Modified Files (5)
- `src/app/(public)/cart/page.tsx` — Removed tax calc, updated summary display
- `src/app/(public)/checkout/page.tsx` — Complete rewrite with 3-step flow, session persistence, auto-populate, auto-fetch rates
- `src/app/api/checkout/create-payment-intent/route.ts` — Destination-based CA tax
- `src/lib/services/shippo.ts` — Fixed carrier filtering, added rate logging
- `src/app/admin/settings/shipping/page.tsx` — Added carrier account info box

---

## Phase 9, Session 2 — 2026-02-17 (Cart Page + Checkout + Orders + Shipping)

### feat: Cart page, Stripe checkout, orders database, confirmation page, stock management, shipping integration

#### Migration (1)
- `20260217000001_orders.sql` — `orders` + `order_items` tables with RLS policies, indexes, `update_updated_at` trigger. Orders store financials in cents. RLS: customers view own orders (via `auth_user_id` join), service role full access.

#### New Files (7)
- `src/lib/utils/order-number.ts` — Sequential order number generator (SD-10001, SD-10002, ...)
- `src/app/(public)/cart/page.tsx` — Full cart page with qty controls, coupon input, order summary sidebar, tax calc, empty state
- `src/app/(public)/checkout/page.tsx` — Checkout with 3-step flow (contact → fulfillment → payment), dual fulfillment (Local Pickup FREE / Ship to Address), shipping address form with rate fetching, Stripe Payment Element, order summary sidebar
- `src/app/(public)/checkout/confirmation/page.tsx` — Post-payment confirmation with order details, shipping address display, dynamic shipping amount, clears cart
- `src/app/api/checkout/create-payment-intent/route.ts` — Server-side cart validation, stock check, coupon eval, tax calc, shipping address + rate + carrier saved on order, Stripe PI
- `src/app/api/checkout/order/route.ts` — GET order by number with shipping address fields for confirmation page
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook: payment_intent.succeeded (mark paid, decrement stock, coupon usage, customer spend, confirmation email) + payment_intent.payment_failed

#### Modified Files (1)
- `src/lib/supabase/types.ts` — Added `Order`, `OrderItem`, `OrderPaymentStatus`, `OrderFulfillmentStatus`, `OrderFulfillmentMethod` types

#### Checkout Shipping Flow
- Fulfillment radio: Local Pickup (free) or Ship to Address
- Shipping address form: street, apt, city, state, ZIP
- "Get Shipping Rates" button → `POST /api/checkout/shipping-rates` → shows carrier options (name, service, price, est. delivery)
- Selected rate passed to payment intent API → shipping amount added to total, address/carrier/service saved on order
- Confirmation page shows shipping address and carrier info when applicable
- Rate display in order summary updates live based on fulfillment method and selected rate

---

## Phase 9, Session 1 — 2026-02-17 (Cart System)

### feat: Shopping cart context, Add to Cart buttons, cart drawer, header cart icon

#### New Files (7)
- `src/lib/contexts/cart-context.tsx` — Cart state management (React Context + useReducer), localStorage persistence, SSR-safe hydration, sonner toasts, cart drawer open/close state
- `src/components/public/cart/cart-provider-wrapper.tsx` — Client component wrapper for server layout
- `src/components/public/cart/add-to-cart-button.tsx` — Add to Cart button with `default`/`compact`/`icon-only` variants, stock-aware disabled states
- `src/components/public/cart/quantity-selector.tsx` — Plus/minus quantity selector with `sm`/`md` sizes
- `src/components/public/cart/product-add-to-cart.tsx` — Product detail page CTA (qty selector + add button + "already in cart" indicator)
- `src/components/public/cart/cart-drawer.tsx` — Slide-out cart panel with item list, thumbnails, qty controls, remove, subtotal, View Cart + Checkout CTAs, empty state, focus trap, ESC/backdrop close, body scroll lock, responsive widths
- `src/components/public/cart/cart-icon-button.tsx` — Header cart icon with lime badge showing item count

#### Modified Files (4)
- `src/app/(public)/layout.tsx` — Wrapped with CartProviderWrapper, added CartDrawer
- `src/components/public/header-client.tsx` — Added CartIconButton between Sign In and Book Now
- `src/components/public/product-card.tsx` — Restructured from outer `<Link>` to `<div>` with separate image/title links + compact Add to Cart button
- `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx` — Enhanced stock status (In Stock / Low Stock / Out of Stock), added ProductAddToCart section

---

## Session R — 2026-02-17 (Fix Holiday Seasonal Themes)

### Fix: Holiday seasonal themes now apply to public frontend — full pipeline verified

#### Diagnosis
Full end-to-end audit of the seasonal theme pipeline: database records, feature flags, data layer (`cms.ts`), public layout, ThemeProvider, CSS variable indirection, Tailwind v4 compilation, admin pages, API routes, sidebar links, cron scheduler. All infrastructure verified present and correct. CSS compilation confirmed: `bg-lime` → `var(--lime)`, cascades properly.

#### Issues Found & Fixed
1. **Page background never changed** — Presets and DB themes had no `body_bg_color`, so `bg-brand-black` (page background) stayed pure black. Added `bodyBgColor` field to `ThemePreset` interface and set distinct dark-tinted backgrounds for all 8 presets (e.g., Christmas = `#050f05` deep evergreen, Valentine's = `#0a0508` rose-tinted). Updated existing DB themes.
2. **Admin color preview swatch broken** — Theme list page referenced `brand-500` in `colorOverrides` which no preset has. Changed to `lime` key (the primary accent color).
3. **Editor showed only 6 of 11 color keys** — `COLOR_KEYS` was missing `lime-50`, `lime-100`, `lime-300`, `lime-600`. Expanded to all 10 palette keys.
4. **No hero gradient editor** — Added hero gradient override text input to theme editor page.
5. **Preset creation missing `body_bg_color`** — The "Use Preset" flow didn't pass `body_bg_color` to the API. Now included.

#### Files Modified (3)
- `src/lib/utils/cms-theme-presets.ts` — Added `bodyBgColor` field to interface + all 8 presets
- `src/app/admin/website/themes/page.tsx` — Fixed color swatch (`brand-500` → `lime`), pass `body_bg_color` on preset creation
- `src/app/admin/website/themes/[id]/page.tsx` — Expanded `COLOR_KEYS` (6 → 10), added hero gradient override input

#### DB Updates
- New Year theme: `body_bg_color = '#050503'`
- Halloween theme: `body_bg_color = '#0f050f'`

---

## Session Q — 2026-02-16 (Booking Module Theme Fix)

### Fix: Booking module now follows site dark theme — proper contrast, readable inputs and text

#### Root Cause
The booking page uses the site's always-dark background (`bg-brand-dark`) but shared UI components (Input, Select, Textarea, Card, Button, Tabs) used hardcoded light-theme colors (`bg-white`, `border-gray-300`, `text-gray-900`) that only adapt via `dark:` media query — not via the site's CSS-variable-based theme. Users with light OS mode saw white inputs, cards, and buttons on a dark background.

#### Changes
- **UI Components (bug fixes)**:
  - `select.tsx`: Added missing `dark:` variants (had none — bg-white with no dark mode)
  - `textarea.tsx`: Added missing `dark:` variants (same issue)
  - `tabs.tsx`: Added `dark:` variants to TabsList/TabsTrigger, added `data-state` attribute for per-instance overrides
  - `form-field.tsx`: Added `labelClassName` prop for per-instance label color overrides
- **Booking Components (theme overrides via className)**:
  - All Input/Select/Textarea → `bg-brand-surface border-site-border text-site-text` with dark: variants
  - All primary Buttons → `bg-lime text-site-text-on-primary hover:bg-lime-200`
  - All outline Buttons → `border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface`
  - All Card → `border-site-border bg-brand-surface`
  - FormField labels → `text-site-text-secondary`
  - TabsList → `bg-brand-surface`, TabsTrigger → `data-[state=active]:bg-brand-grey text-site-text-muted`
- **Semantic alert colors (dark-friendly)**:
  - Green alerts: `bg-green-50 border-green-200 text-green-800` → `bg-green-500/10 border-green-500/30 text-green-400`
  - Amber warnings: `bg-amber-50 border-amber-200 text-amber-800` → `bg-amber-500/10 border-amber-500/30 text-amber-400`
  - Red errors: `bg-red-50 border-red-200 text-red-700` → `bg-red-500/10 border-red-500/30 text-red-400`
  - N/A badge: `bg-amber-100 text-amber-700` → `bg-amber-500/10 text-amber-400`
  - Tooltips: `bg-gray-900` → `bg-brand-grey text-site-text`
- **step-payment.tsx**: Added `border-site-border` to Stripe divider, added `text-site-text` to payment header/amount

#### Files Modified (14)
- `src/components/ui/select.tsx` — dark mode variants
- `src/components/ui/textarea.tsx` — dark mode variants
- `src/components/ui/tabs.tsx` — dark mode variants + data-state attribute
- `src/components/ui/form-field.tsx` — labelClassName prop
- `src/components/booking/booking-wizard.tsx` — button + alert theme fixes
- `src/components/booking/booking-confirmation.tsx` — button theme fix
- `src/components/booking/step-service-select.tsx` — TabsList/TabsTrigger theme overrides
- `src/components/booking/step-configure.tsx` — input/select/button theme overrides
- `src/components/booking/step-schedule.tsx` — select/textarea/card/label/button theme overrides
- `src/components/booking/step-customer-info.tsx` — input/select/button/error theme overrides
- `src/components/booking/step-review.tsx` — input/button + all semantic alert colors
- `src/components/booking/step-payment.tsx` — card/button/border/text theme overrides
- `src/app/(public)/book/page.tsx` — no changes needed (already theme-aware)
- `src/components/booking/step-indicator.tsx` — no changes needed (already theme-aware)

---

## Session P — 2026-02-16 (Theme Variable Pipeline Fix)

### Fix: Complete theme variable pipeline — all public components respond to theme changes

#### Root Cause
Multiple broken links in the theme variable chain between admin Theme & Styles settings and public components:
1. **Header/Footer mismatch**: Header used `bg-brand-black` instead of `bg-site-header-bg`; footer used `bg-brand-dark` instead of `bg-site-footer-bg`. Admin "Header Background" and "Footer Background" settings had no effect.
2. **Buttons dead code**: ThemeProvider set `--site-btn-*` CSS variables but no component consumed them — all buttons hardcoded `bg-lime text-black rounded-full`.
3. **Missing ThemeProvider mappings**: `color_link`, `color_link_hover`, `color_text_on_primary`, `color_divider` fields from DB were not mapped to CSS variables.
4. **Hardcoded `text-black`**: Button text and badge text used `text-black` instead of theme-aware `text-site-text-on-primary`.

#### Changes
- **globals.css**: Added 12 new CSS variables (`--site-link`, `--site-link-hover`, `--site-text-on-primary`, `--site-divider`, `--site-btn-primary-bg/text/hover/radius`, `--site-btn-cta-bg/text/hover/radius`) with defaults referencing existing theme tokens. Added `@theme inline` entries for `site-link`, `site-link-hover`, `site-text-on-primary`, `site-divider`. Added `.site-btn-primary` and `.site-btn-cta` CSS classes.
- **theme-provider.tsx**: Added mappings for `color_link` → `--site-link`, `color_link_hover` → `--site-link-hover`, `color_text_on_primary` → `--site-text-on-primary`, `color_divider` → `--site-divider`.
- **header-client.tsx**: `bg-brand-black` → `bg-site-header-bg`, CTA buttons → `site-btn-cta`, logo text → `text-site-text-on-primary`.
- **footer-client.tsx**: `bg-brand-dark` → `bg-site-footer-bg`, logo text → `text-site-text-on-primary`.
- **9 CTA button instances** across hero-section, cta-section, content-block-renderer, hero-carousel, gallery, areas, services pages → replaced `bg-lime text-black rounded-full` with `site-btn-cta`.
- **product-card.tsx**: Hover text → `text-site-text-on-primary`.
- **gallery-client.tsx**: Filter pills active state → `text-site-text-on-primary`, badge → `site-btn-primary`.

#### Final Variable Chain (All Properties)
| Property | Admin Field → ThemeProvider → CSS Var → Component | Status |
|---|---|---|
| Page Background | `color_page_bg` → `--brand-black` → `bg-brand-black` | MATCH |
| Card Background | `color_card_bg` → `--brand-surface` → `bg-brand-surface` | MATCH |
| Header Background | `color_header_bg` → `--site-header-bg` → `bg-site-header-bg` | FIXED |
| Footer Background | `color_footer_bg` → `--site-footer-bg` → `bg-site-footer-bg` | FIXED |
| Text Primary | `color_text_primary` → `--site-text` → `text-site-text` | MATCH |
| Text Secondary | `color_text_secondary` → `--site-text-secondary` → `text-site-text-secondary` | MATCH |
| Text Muted | `color_text_muted` → `--site-text-muted` → `text-site-text-muted` | MATCH |
| Text on Primary | `color_text_on_primary` → `--site-text-on-primary` → `text-site-text-on-primary` | FIXED |
| Primary Color | `color_primary` → `--lime` → `bg-lime` / `text-lime` | MATCH |
| Link Color | `color_link` → `--site-link` → `text-site-link` | FIXED |
| Border Color | `color_border` → `--site-border` → `border-site-border` | MATCH |
| CTA Button BG | `btn_cta_bg` → `--site-btn-cta-bg` → `.site-btn-cta` | FIXED |
| Primary Button BG | `btn_primary_bg` → `--site-btn-primary-bg` → `.site-btn-primary` | FIXED |

---

## Session O — 2026-02-16 (Hero Image Upload)

### Feature: Image Upload for Hero Carousel Admin
Added drag-and-drop image upload to the hero slide editor, replacing plain URL text inputs.

### HeroImageUpload Component
- New reusable component at `src/app/admin/website/hero/components/hero-image-upload.tsx`
- Drag-and-drop zone with visual feedback (drag highlight, loading spinner)
- Click-to-browse alternative
- Image preview with hover overlay showing Replace/Remove buttons
- Client-side resize: images wider than 2560px are downscaled before upload (canvas API, 85% quality)
- File validation: JPEG, PNG, WebP only; max 10MB
- Uploads to `cms-assets` Supabase storage bucket (already existed)
- Storage path pattern: `{prefix}/{slideId}/{timestamp}.{ext}` — avoids cache issues on replace
- Old image automatically deleted from storage when replacing
- Landscape (16:9) or square aspect ratio modes

### Slide Editor Updates
- Desktop image: drag-drop upload with landscape preview
- Mobile image: drag-drop upload with square preview
- Before/After images: side-by-side drag-drop uploads
- Video thumbnail: drag-drop upload with landscape preview
- Alt text field preserved as manual text input

### Storage Cleanup on Slide Deletion
- DELETE endpoint now fetches slide data before deletion
- Extracts storage paths from all image URL fields (image_url, image_url_mobile, video_thumbnail_url, before_image_url, after_image_url)
- Removes all associated images from `cms-assets` bucket (best-effort, non-blocking)

### Files Changed
- `src/app/admin/website/hero/components/hero-image-upload.tsx` — new component
- `src/app/admin/website/hero/[id]/page.tsx` — replaced URL inputs with upload components
- `src/app/api/admin/cms/hero/[id]/route.ts` — storage cleanup on DELETE

---

## Session N — 2026-02-16 (Theme System Pipeline Fix)

### Root Cause: Two Critical Bugs
1. **`@theme inline` prevented CSS variable overrides**: Tailwind v4's `@theme inline` inlines values directly into utility classes (e.g., `bg-lime { background-color: #cf0 }`). ThemeProvider's CSS variable overrides on its wrapper div had zero effect because utilities didn't reference variables.
2. **Wrong color_overrides keys in database**: Admin theme editor had hardcoded `COLOR_KEYS = ['brand-500', 'brand-600', 'brand-700', 'accent-500']` — admin palette keys that public pages don't use. Valentine's Day theme was saved with these wrong keys instead of the correct `lime-*`, `brand-dark`, `brand-surface` keys.

### Fix: CSS Variable Indirection Pattern
- **globals.css**: Moved all public-theme-overridable tokens from hardcoded values in `@theme inline` to raw CSS custom properties in `:root` (e.g., `--lime: #CCFF00`), then reference via `var()` in `@theme inline` (e.g., `--color-lime: var(--lime)`). Now `bg-lime` compiles to `var(--lime)` which cascades properly.
- **ThemeProvider**: Updated `buildSeasonalCssVars()` and `buildSiteThemeVars()` to set raw variable names (`--lime`, `--brand-dark`) instead of `--color-*` names, matching the new `:root` indirection.
- **Database**: Updated Valentine's Day theme `color_overrides` to use correct preset keys (`lime`, `lime-50`...`lime-600`, `brand-dark`, `brand-surface`, `accent-glow-rgb`).
- **Admin theme editor**: Fixed `COLOR_KEYS` from wrong admin palette keys to correct public theme keys with human-friendly labels (Primary Accent, Accent Hover, Section BG, Card BG, etc.). Added `accent-glow-rgb` text input.

### Tokens now overridable via ThemeProvider
`--lime`, `--lime-50` through `--lime-600`, `--brand-black`, `--brand-dark`, `--brand-darker`, `--brand-grey`, `--brand-grey-light`, `--brand-surface`, `--site-text`, `--site-text-secondary`, `--site-text-muted`, `--site-text-dim`, `--site-text-faint`, `--site-border`, `--site-border-light`, `--site-border-medium`, `--site-header-bg`, `--site-footer-bg`, `--theme-accent-glow-rgb`

### Files Changed
- `src/app/globals.css` — raw vars in `:root`, `var()` refs in `@theme inline`
- `src/components/public/cms/theme-provider.tsx` — set raw var names
- `src/app/admin/website/themes/[id]/page.tsx` — fixed COLOR_KEYS

---

## Session M — 2026-02-16 (Complete Theme Variable Migration)

### Complete Component Migration
Migrated ALL remaining hardcoded colors across public-facing pages to CSS theme variables. Zero hardcoded colors remain in `(public)`, `(customer-auth)`, `(account)`, or `components/public` directories.

### CSS Variables
- Added `--color-site-border-medium: rgba(255, 255, 255, 0.2)` to `@theme inline` in `globals.css` for `border-white/20` replacements

### Layout Updates
- **Customer-auth layout** (`src/app/(customer-auth)/layout.tsx`): Rewrote to include `ThemeProvider` with site theme + seasonal theme support
- **Account layout** (`src/app/(account)/layout.tsx`): Rewrote to include `ThemeProvider` with site theme + seasonal theme support
- Both layouts now fetch `getCmsToggles()`, `getActiveTheme()`, `getSiteThemeSettings()` and pass to `ThemeProvider`

### Files Migrated (Color Mapping)
All files below had hardcoded Tailwind colors replaced with theme variables:
- `text-white` → `text-site-text`
- `text-gray-300` → `text-site-text-secondary`
- `text-gray-400` → `text-site-text-muted`
- `text-gray-500` → `text-site-text-dim`
- `text-gray-600` → `text-site-text-faint`
- `border-white/10` → `border-site-border`
- `border-white/20` → `border-site-border-medium`
- `hover:text-white` → `hover:text-site-text`
- `hover:bg-white/5` → `hover:bg-site-border-light`
- `bg-white/10` → `bg-site-border` (dividers)
- `bg-white/20` → `bg-site-border-medium`

**Customer Auth Pages (3 files):**
- `src/app/(customer-auth)/signin/page.tsx`
- `src/app/(customer-auth)/signup/page.tsx`
- `src/app/(customer-auth)/signin/reset-password/page.tsx`

**Quote Pages (2 files):**
- `src/app/(public)/quote/[token]/page.tsx`
- `src/app/(public)/quote/[token]/accept-button.tsx`

**Public Components (1 file):**
- `src/components/public/mobile-menu.tsx`

**Account Portal Pages (8 files):**
- `src/app/(account)/account/page.tsx`
- `src/app/(account)/account/profile/page.tsx`
- `src/app/(account)/account/vehicles/page.tsx`
- `src/app/(account)/account/appointments/page.tsx`
- `src/app/(account)/account/services/page.tsx`
- `src/app/(account)/account/services/[jobId]/page.tsx`
- `src/app/(account)/account/loyalty/page.tsx`
- `src/app/(account)/account/transactions/page.tsx`

### Preserved (Intentional Exceptions)
- **Status/semantic colors**: green (success), red (error), amber (warning), purple (converted) — kept as-is
- **Image overlays**: `bg-black/60`, `bg-white/10` on photo badges, hero carousel, product cards — design-specific
- **Standalone pages**: `/unsubscribe`, `/authorize`, `/jobs` — own light-mode design, not in public layout
- **Admin panel**: Not in scope for public theme migration

### Verification
- `npx tsc --noEmit` — zero errors
- Grep for hardcoded colors across all 4 directories — zero matches
- No `dark:` prefixed classes found (already removed in Session J)
- No FODT issue — ThemeProvider renders CSS variables during SSR via inline `style` attribute

---

## Session L — 2026-02-16 (Theme & Style Settings Admin Page)

### Database
- Created `site_theme_settings` table (migration `20260216000003`) with 50+ customizable fields: colors (backgrounds, text, brand, links, borders, status), typography (fonts, sizes, weights, line height), buttons (primary, secondary, CTA), borders & spacing
- Default row inserted with all NULL fields (NULL = use CSS defaults from globals.css)
- Unique index enforces single active custom theme
- RLS: public read, authenticated write

### API Routes
- `GET/PUT/POST /api/admin/cms/site-theme` — CRUD for site theme settings (permission: `cms.themes.manage`)
- `POST /api/admin/cms/site-theme/reset` — Reset all fields to NULL (defaults)
- `GET /api/public/cms/site-theme` — Public endpoint with cache headers

### Data Layer
- Added `getSiteThemeSettings()` to `src/lib/data/cms.ts` — cached with 60s revalidate, `site-theme` tag
- Added `SiteThemeSettings` interface to `src/lib/supabase/types.ts`

### ThemeProvider Update
- Accepts both `theme` (seasonal) and `siteTheme` (persistent) props
- Merges CSS variables: site theme settings first, then seasonal overrides on top
- Maps site theme fields to CSS custom properties (--color-*, --font-*, --site-*)
- Public layout updated to fetch and pass site theme settings

### Admin Page: Theme & Style Settings
- New page at `/admin/website/theme-settings` with tabbed UI:
  - **Colors**: Mode toggle, background/text/brand/link/border/status color pickers with per-field reset and default badges
  - **Typography**: Font family dropdowns (9 options), font size inputs, weight selectors, line height slider
  - **Buttons**: Primary/secondary/CTA button customization with live inline previews
  - **Borders & Spacing**: Border radius, width, section/card padding, header height
- **Live Preview Panel**: Right sidebar showing mini header, hero, card, links — updates in real-time
- **Quick Presets**: 5 built-in presets (Default Dark, Clean Light, Midnight Blue, Warm Dark, Professional)
- **Reset to Default**: Confirmation dialog, resets all fields to NULL
- **Per-field Reset**: Individual reset icons on each color picker

### Sidebar
- Added "Theme & Styles" entry with Paintbrush icon under Website section
- Renamed existing "Themes" to "Seasonal Themes" for clarity
- Added Paintbrush icon to admin-shell.tsx icon map

---

## Session K — 2026-02-16 (Theme System Audit + Fix Seasonal Themes)

### Theme System Audit (Parts 1A-1F)
- **1A Database**: PASS — `seasonal_themes` table exists with 8 presets defined
- **1B Data Flow**: PASS — `getActiveTheme()` queries correctly, layout passes to ThemeProvider
- **1B WARN**: `seasonalThemes` feature flag defaults to `false` — must enable to see themes
- **1C CSS Variables**: ROOT CAUSE FOUND — ThemeProvider was setting `--brand-500/600/700` (old design) but no component uses these. Session J redesigned to lime-on-black palette
- **1D Disconnect**: `.public-theme` block in globals.css explicitly set `--color-lime: #CCFF00`, BLOCKING ThemeProvider overrides due to CSS specificity
- **1E Particle Canvas**: PASS — reads theme colors correctly
- **1F Theme Cron**: PASS — activation route exists, scheduler registered

### Default Theme Baseline (Part 2)
- Created `src/lib/utils/default-theme.ts` — structured `DEFAULT_THEME` constant with all extracted values (accent palette, backgrounds, text, borders, typography, buttons, shadows, spacing)
- Exports `THEME_CSS_VARS` and `ThemeCssVar` type for reference

### Fix CSS Variable Pipeline (Part 3)

#### `src/app/globals.css`
- Added `--theme-accent-glow-rgb: 204, 255, 0` to `:root` for shadow/glow calculations
- Updated `@theme inline` shadow values to use `rgba(var(--theme-accent-glow-rgb), ...)` instead of hardcoded hex
- **REMOVED** `.public-theme { --color-lime: #CCFF00; }` block that was blocking ThemeProvider overrides
- Updated `.text-gradient-lime` to use `var(--color-lime)` and `var(--color-lime-500)`
- Updated `.btn-lime-glow` to use `var(--theme-accent-glow-rgb)`
- Updated scrollbar styles to use `var(--color-lime)` and `var(--color-brand-dark)`
- Updated `lime-pulse` animation to use `var(--theme-accent-glow-rgb)`

#### `src/components/public/cms/theme-provider.tsx` (rewritten)
- New `buildCssVars()` maps theme `colorOverrides` keys to `--color-{key}` CSS custom properties
- Special handling: `accent-glow-rgb` → `--theme-accent-glow-rgb`, `body_bg_color` → `--color-brand-black`
- Gradient overrides via scoped `<style>` tag with `!important`

#### `src/lib/utils/cms-theme-presets.ts` (rewritten)
- All 8 theme presets updated from old keys (`brand-500`, `accent-500`) to new Tailwind v4 token keys
- Each preset now includes: `lime` through `lime-600`, `brand-dark`, `brand-surface`, `accent-glow-rgb`

#### Component Migrations (`bg-black` → `bg-brand-black`)
- `src/app/(public)/layout.tsx` — main public wrapper
- 10 public page files (homepage, services ×3, products ×2, gallery, terms, areas ×2)
- `src/components/public/header-client.tsx` — header bg + scrolled state + dropdown + mobile menu
- `src/components/public/footer-client.tsx` — footer bg
- `src/components/public/hero-section.tsx` — section bg
- `src/components/public/cms/hero-carousel.tsx` — section bg
- **NOT changed**: Admin panel, customer auth, overlays, badges (intentional)

### Verification (Part 4)
- Valentine's Day preset: correct pink palette, hearts particles, rose-tinted surfaces
- ThemeProvider pipeline: `buildCssVars()` correctly generates `--color-lime`, `--color-brand-dark`, etc.
- CSS cascade: no blocking overrides, all utilities use `var()` references
- TypeScript: zero errors
- Next.js build: passes

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
