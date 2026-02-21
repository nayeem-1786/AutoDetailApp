# POS iPad Optimization Audit

**Date:** 2026-02-20
**Method:** Code review of all 128 POS files (~28,518 lines)
**Reference:** `docs/planning/iPAD.md` (Phase 12 spec)

---

## Executive Summary

**0% of the iPad optimization plan is implemented.** The POS is a fully functional desktop-first system with a two-column split-pane layout. However, it has no PWA support, no offline capability, no gesture handling, no dark mode, and ~46% of interactive elements are under the 44px Apple HIG minimum. Two features from the plan (New Customer inline form, Transactions access) are **already built** via existing POS flows and should be re-evaluated for scope.

---

## Current POS Overview

| Metric | Value |
|--------|-------|
| Total files | 128 |
| Total lines | ~28,518 |
| Layout type | Two-column split pane: `grid-cols-[1fr_380px]` |
| Theme | Light only (white bg, gray borders) |
| PWA | No (no manifest, no service worker, no meta tags) |
| Offline capability | None |
| Root container | `flex h-screen flex-col overflow-hidden` |
| Bottom nav height | `h-14` (56px) |
| Top header height | `h-14` (56px) |
| Responsive breakpoints | Minimal (`sm:` on 3 header labels only) |
| Orientation handling | None |

### Layout Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Header (h-14, shrink-0)                                │
│  [Back] [Logo] ... [Reader] [Scanner] [Held] [Clock]   │
├────────────────────────────────┬────────────────────────┤
│  Left Panel (flex-1, min-w-0)  │  Right Panel (380px)  │
│  • Search bar (shrink-0)       │  Ticket Panel         │
│  • Tab bar (shrink-0)          │  • Customer/Vehicle   │
│  • Tab content                 │  • Items (scrollable) │
│    (overflow-y-auto)           │  • Coupon/Loyalty     │
│                                │  • Totals (fixed)     │
│  TABS: Register | Products     │  • Actions (fixed)    │
│        Services | Promotions   │                       │
├────────────────────────────────┴────────────────────────┤
│  Bottom Nav (h-14, shrink-0)                            │
│  [Logout] [Register] [Transactions] [Quotes] [Jobs]    │
└─────────────────────────────────────────────────────────┘
```

**Key layout classes:**
- Root shell: `flex h-screen flex-col overflow-hidden` (pos-shell.tsx:234)
- Main workspace: `grid h-full grid-cols-[1fr_380px]` (pos-workspace.tsx:147)
- Left panel: `flex min-w-0 flex-col overflow-hidden` → tab content: `min-h-0 flex-1 overflow-y-auto`
- Right panel: `flex h-full flex-col border-l` → items: `flex-1 overflow-y-auto` → totals/actions: `shrink-0`
- Bottom nav: `flex h-14 shrink-0 items-center justify-around`

---

## Feature-by-Feature Status

### 1. Touch Targets (44px minimum)

**Status:** ✅ Done

**84 interactive elements audited. 39 (46%) are under 44x44px.**

#### Critical Elements (under 20px effective touch area)

| Element | Component | Current Size | File |
|---------|-----------|-------------|------|
| Note icon button | ticket-item-row.tsx | ~13px (`h-3 w-3` + `p-0.5`) | :229 |
| Coupon remove button | coupon-input.tsx | ~14px (`p-0.5` + `h-3.5 w-3.5`) | |
| Search clear X | search-bar.tsx | ~16px (`h-4 w-4` icon, absolute) | |

#### Under 44px Elements (28-40px)

| Element | Component | Current Size | File |
|---------|-----------|-------------|------|
| Minus button (stepper) | ticket-item-row.tsx | 28px (`h-7 w-7`) | :134 |
| Plus button (stepper) | ticket-item-row.tsx | 28px (`h-7 w-7`) | :144 |
| Qty display button | ticket-item-row.tsx | 28px (`h-7 min-w-[28px]`) | :155 |
| Remove (X) button | ticket-item-row.tsx | 28px (`h-7 w-7`) | :229 |
| Note save button | ticket-item-row.tsx | ~32px (`px-2 py-1`) | |
| Note cancel button | ticket-item-row.tsx | ~32px (`px-2 py-1`) | |
| Print receipt button | receipt-options.tsx | 32px (`size="sm"` = h-8) | :157 |
| Email receipt button | receipt-options.tsx | 32px (`size="sm"`) | :170 |
| SMS receipt button | receipt-options.tsx | 32px (`size="sm"`) | :192 |
| Receipt printer button | receipt-options.tsx | 32px (`size="sm"`) | :214 |
| Email Send button | receipt-options.tsx | 32px (`size="sm"`) | :244 |
| SMS Send button | receipt-options.tsx | 32px (`size="sm"`) | :268 |
| Coupon Apply button | coupon-input.tsx | 32px (`size="sm"`) | |
| Split 50/50 button | split-payment.tsx | ~28px (`px-3 py-1.5`) | |
| Split $20 preset | split-payment.tsx | ~28px (`px-3 py-1.5`) | |
| Split $50 preset | split-payment.tsx | ~28px (`px-3 py-1.5`) | |
| Split $100 preset | split-payment.tsx | ~28px (`px-3 py-1.5`) | |
| Checkout close button | checkout-overlay.tsx | ~40px (`p-2` + icon) | :24 |
| Category scroll chevrons | category-tabs.tsx | ~36px (`h-4 w-4` + padding) | |
| Bottom nav items | bottom-nav.tsx | ~40x28px (`px-3 py-1`) | :91 |

#### Elements Meeting 44px Minimum (OK)

| Element | Component | Size |
|---------|-----------|------|
| Category tab buttons | category-tabs.tsx | 44px (`min-h-[44px] min-w-[44px]`) |
| PinPad digits (default) | pin-pad.tsx | 60px (`min-h-[60px]`) |
| PinPad digits (lg) | pin-pad.tsx | 72px (`min-h-[72px]`) |
| Service pricing buttons | service-pricing-picker.tsx | 48-56px |
| Payment method tiles | payment-method-screen.tsx | 128px (`h-32 w-32`) |
| Tip preset buttons | tip-screen.tsx | 96px (`h-24 w-24`) |
| Cash quick tender buttons | cash-payment.tsx | 56x80px (`h-14 w-20`) |
| All `size="lg"` buttons | Various checkout screens | 44px (`h-11`) |

**Files requiring changes:** 8 files, ~39 elements
**Estimated effort:** 3-4 hours (mostly padding/min-size adjustments)

---

### 2. Numeric Keyboard

**Status:** ✅ Done

**9 numeric inputs found. 0 have `inputMode="numeric"`. All use `type="number"` only.**

| Input Purpose | File | Line | type | inputMode | Needs Fix |
|---------------|------|------|------|-----------|-----------|
| Cash tendered amount | checkout/cash-payment.tsx | 147 | `number` | None | YES |
| Custom tip amount | checkout/tip-screen.tsx | 93 | `number` | None | YES |
| Split payment amount | checkout/split-payment.tsx | 261 | `number` | None | YES |
| Item quantity edit | ticket-item-row.tsx | 181 | `number` | None | YES |
| Discount value ($/%) | ticket-panel.tsx | 244 | `number` | None | YES |
| Quote item quantity | quotes/quote-item-row.tsx | 181 | `number` | None | YES |
| Quote discount value | quotes/quote-ticket-panel.tsx | 532 | `number` | None | YES |
| EOD cash count qty | eod/cash-count-form.tsx | 104 | `number` | None | YES |
| Vehicle year | vehicle-create-dialog.tsx | 146 | `number` | None | YES |

**Correctly handled (no change needed):**
- Check number input: `type="text"` (alphanumeric — correct)
- Phone fields: `type="tel"` (correct)
- Date fields: `type="date"` (correct)
- PIN entry: Custom `PinPad` button component (correct)
- Custom item amount: Uses `PinPad` button component in keypad-tab.tsx (correct)

**Estimated effort:** 1 hour (add `inputMode="numeric"` to 9 inputs)

---

### 3. Sticky Cart Sidebar

**Status:** ✅ Already implemented (different terminology)

The cart/ticket panel is **already fixed and always visible**. The current implementation achieves the iPAD.md goal:

| Requirement | Current State |
|-------------|---------------|
| Cart always visible | YES — 380px fixed right column in grid layout |
| Product/service grid scrolls independently | YES — left panel has `overflow-y-auto` |
| Cart totals always visible | YES — totals/actions use `shrink-0`, only items scroll |
| Items scroll within cart | YES — items area uses `flex-1 overflow-y-auto` |

**Remaining concerns (not in original spec but iPad-relevant):**
- 380px fixed sidebar may be too wide on iPad portrait (768px viewport = only 388px for catalog)
- No orientation-specific layout adjustments
- No responsive collapse of sidebar in portrait mode
- `grid-cols-3` catalog grid is fixed — may need `grid-cols-2` on narrow viewports

**Estimated effort:** 2-3 hours if portrait-responsive layout is desired; 0 if current layout is acceptable

---

### 4. PWA + Offline Support

**Status:** ❌ Not started (nothing exists)

| Component | Exists? | Details |
|-----------|---------|---------|
| `manifest.json` / `manifest.webmanifest` | NO | Not in `/public/` |
| Service worker (`sw.js`) | NO | No file, no registration code |
| `next-pwa` package | NO | Not in `package.json` |
| `workbox` | NO | Not in `package.json` |
| Apple meta tags (`apple-mobile-web-app-capable`) | NO | Not in any layout |
| `theme-color` meta tag | NO | Not in any layout |
| `apple-touch-icon` link | NO | No icon files in `/public/` |
| Offline detection (`navigator.onLine`) | NO | Not anywhere in codebase |
| IndexedDB usage in POS | NO | |
| localStorage usage in POS | YES | `pos_drawer_session` (drawer state only) |
| Sync queue | NO | |
| PWA icon files | NO | No icon-192.png, icon-512.png, etc. |

**What exists in `/public/`:** Only default Next.js SVGs (file.svg, globe.svg, next.svg, vercel.svg, window.svg) plus `/public/images/` for product/service images.

**Viewport meta:** Uses Next.js default metadata export — no custom viewport settings for POS.

**Estimated effort:** 20-30 hours (highest complexity feature)
- Manifest + icons: 2 hours
- Service worker + caching: 8-10 hours
- Offline queue + sync: 8-10 hours
- Conflict resolution: 4-6 hours
- Testing: 4+ hours

---

### 5. Quick "New Customer" Inline Form

**Status:** ✅ Already implemented

This feature is **fully built and working** in the current POS. The iPAD.md described a problem ("must go to admin to create") that has already been solved.

**Current flow:**
1. Search for customer in `CustomerLookup` component
2. No results → "No customers found" message appears
3. **"New Customer" button** is always visible at bottom (with `UserPlus` icon)
4. Click → `CustomerCreateDialog` opens as modal overlay (stays in POS)
5. Form fields: First Name (required, autofocused), Last Name (required), Mobile (required, auto-formatted), Customer Type (optional)
6. Submit → POST to `/api/pos/customers` → validates, creates customer
7. Duplicate phone check (409 error if exists)
8. On success → `onCreated(customer)` callback → customer immediately attached to ticket
9. Dialog closes → back in POS with customer selected
10. Vehicle selector appears for vehicle selection/creation

**Key files:**
- `src/app/pos/components/customer-lookup.tsx` — search + "New Customer" button
- `src/app/pos/components/customer-create-dialog.tsx` — inline creation dialog
- `src/app/api/pos/customers/route.ts` — POST endpoint

**Assessment:** Fully meets iPAD.md spec. No work needed. Consider removing from Phase 12 scope.

---

### 6. Recent Transactions Shortcut

**Status:** ✅ Done

Transactions are accessible via **one tap** from the bottom navigation bar, **plus** a new header dropdown for quick access without leaving the current view.

| Requirement from iPAD.md | Current State |
|---------------------------|---------------|
| Quick access to recent transactions | YES — 1 tap from bottom nav + header dropdown |
| Reprint receipt | YES — Star printer + browser print |
| Start refund | YES — Permission-gated refund dialog |
| Quick-access panel in header | YES — `RecentTransactionsDropdown` component |
| Shows last 5-10 transactions | YES — shows last 10 from today |
| One-tap to detail | YES — click row → deep-links to `/pos/transactions?id=` |

**Implementation:**
- `RecentTransactionsDropdown` component (`pos/components/recent-transactions-dropdown.tsx`)
- Clock icon in POS header (between held tickets badge and employee name)
- Fetches today's last 10 transactions via existing `/api/pos/transactions/search` endpoint
- Each row shows: customer name (or "Walk-in"), amount, receipt #, payment method, time ago, status dot
- Click row → navigates to transaction detail with `?id=` deep-link
- "View All Transactions" footer link → full transactions page
- Auto-refreshes every 60s while open
- Dismisses on outside click/tap
- Transactions page now supports `?id=` query parameter for direct detail navigation

---

### 7. Swipe-to-Delete on Cart Items

**Status:** ✅ Done

**Implementation:**
- `SwipeableCartItem` wrapper component (`pos/components/swipeable-cart-item.tsx`)
- Uses framer-motion `drag="x"` with `dragDirectionLock` for horizontal-only swipe
- Swipe threshold: 100px to trigger delete (prevents accidental removal)
- Red background with trash icon revealed progressively during swipe
- `AnimatePresence` with `mode="popLayout"` for smooth exit animation (slide out + collapse height)
- Auto-snap back if swipe doesn't reach threshold
- **Undo toast**: 5-second toast with "Undo" button restores item at original position
- `RESTORE_ITEM` reducer action added to `ticket-reducer.ts` and `TicketAction` type
- Existing X button kept as secondary delete method
- Swipe disabled during checkout (`checkoutOpen` state)
- Directional lock prevents conflict with vertical cart scrolling

---

### 8. Dark Mode

**Status:** ❌ Not started

**The POS is always light.** No dark mode support exists.

| Question | Answer |
|----------|--------|
| `dark:` classes in POS components? | ZERO (0 files with `dark:` in POS directory) |
| `prefers-color-scheme` detection? | NO |
| Theme toggle? | NO |
| Uses site theme system? | NO — POS uses hardcoded `bg-white`, `text-gray-900`, etc. |
| System preference detection? | NO |
| Current color scheme | White backgrounds, gray-200 borders, gray-900 text |

**Color palette currently used in POS:**
- Backgrounds: `bg-white`, `bg-gray-50`, `bg-gray-100`
- Text: `text-gray-900`, `text-gray-700`, `text-gray-500`, `text-gray-400`
- Borders: `border-gray-200`, `border-gray-100`
- Accents: `text-blue-600` (active nav), `bg-green-600` (checkout), `bg-amber-*` (focus rings)
- PIN screen: `bg-gray-900` (already dark)

**Site has a contextual UI variable system** (`--ui-bg`, `--ui-text`, etc. in globals.css) but POS does NOT use it. POS uses direct Tailwind color classes everywhere.

**Public site already supports dark/light toggle** via `.public-theme` and `data-user-theme="light"`. The POS is outside this system entirely.

**Receipt template:** Uses light-only styling (matches printed output) — should remain light per iPAD.md spec.

**Estimated effort:** 15-20 hours
- Design dark palette: 2 hours
- Refactor POS to use CSS variables or `dark:` variants: 8-12 hours (128 files to audit)
- Theme toggle + persistence: 2 hours
- Testing all screens: 3-4 hours

---

## Additional Findings

### iPad Portrait Mode Concern
The fixed `grid-cols-[1fr_380px]` layout leaves only 388px for the catalog on iPad portrait (768px wide). This will cause:
- Category grid (`grid-cols-3`) items to be ~120px wide (very cramped)
- Search bar + tabs squeezed
- Poor usability in portrait orientation

**Recommendation:** Add responsive breakpoint to stack layout vertically or reduce sidebar width on narrow viewports.

### No Safe Area Insets
No `env(safe-area-inset-*)` usage found. On iPad Pro with home indicator, bottom nav content may be obscured.

### Catalog Grid Fixed at 3 Columns
`grid-cols-3` in catalog-grid.tsx and catalog-browser.tsx is hardcoded. Should be responsive for different screen sizes.

### PinPad `size="sm"` Action Button Under 44px
`pin-pad.tsx` small variant action button uses `min-h-[38px]` — 6px under the 44px minimum.

### Held Tickets Badge
The held tickets count badge in the header uses `h-4 w-4 text-[10px]` — very small on iPad.

---

## Recommended Implementation Order

Based on current state — prioritized by value/effort ratio:

| Priority | Feature | Status | Effort | Impact | Notes |
|----------|---------|--------|--------|--------|-------|
| 1 | Numeric keyboard | ✅ Done | 1 hr | High | All 9 inputs converted to inputMode numeric/decimal |
| 2 | Touch targets | ✅ Done | 3-4 hrs | High | All 39 elements upgraded to 44px minimum |
| 3 | New Customer form | ✅ Done | 0 | — | Already fully implemented. Remove from scope. |
| 4 | Sticky cart sidebar | ✅ Done | 0 | — | Already implemented. Consider portrait-responsive variant. |
| 5 | Swipe-to-delete | ✅ Done | — | Medium | framer-motion swipe + undo toast |
| 6 | Recent transactions | ✅ Done | — | Medium | Header dropdown + deep-link to detail |
| 7 | PWA + offline | ❌ Not started | 20-30 hrs | High | Most complex; needs design decisions first |
| 8 | Dark mode | ❌ Not started | 15-20 hrs | Low-Med | Large refactor; POS uses hardcoded colors |

**Total estimated effort:** 47-67 hours (excluding the 2 already-complete features)

**Quick wins (can ship in one session):** Features 1 + 2 = ~4-5 hours for major UX improvement.
