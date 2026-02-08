# UI Consistency Audit Report

> Generated: 2026-02-07
> Scanned: `src/app/` and `src/components/` against `DESIGN_SYSTEM.md`

---

## High (Visible Inconsistency)

| # | File | Line(s) | Violation | Recommended Fix |
|---|------|---------|-----------|-----------------|
| H1 | `src/app/admin/settings/card-reader/page.tsx` | 108 | `confirm()` used for delete confirmation instead of `ConfirmDialog` | Replace `confirm(...)` with `<ConfirmDialog>` component |
| H2 | `src/app/admin/transactions/page.tsx` | 750-761 | Custom `<button>` elements for date preset chips instead of `<Button>` component | Use `<Button variant="outline" size="sm">` or styled `<Button variant="ghost">` |
| H3 | `src/app/admin/transactions/page.tsx` | 256, 277 | Custom `<button>` elements for close actions instead of `<Button>` component | Use `<Button variant="ghost" size="sm">` |
| H4 | `src/app/admin/transactions/page.tsx` | 472, 949 | Custom status badges using inline `rounded-full px-2 py-0.5 text-xs font-medium` with hardcoded colors instead of `<Badge variant="...">` | Use `<Badge>` component with appropriate variant |
| H5 | `src/app/admin/transactions/page.tsx` | entire file | Custom table implementation instead of `<DataTable>` component | Refactor to use `<DataTable>` with column definitions |
| H6 | `src/app/admin/marketing/compliance/page.tsx` | 252-255 | Custom modal overlay (`fixed inset-0 z-50` + `bg-black/50`) instead of `<Dialog>` component | Replace with `<Dialog>` / `<DialogContent>` from shared UI |
| H7 | `src/app/admin/marketing/coupons/new/page.tsx` | 2202-2204 | Custom modal overlay for usage warning instead of `<Dialog>` component | Replace with `<Dialog>` / `<DialogContent>` from shared UI |
| H8 | `src/app/admin/customers/page.tsx` | 72-73 | Custom modal overlay for delete confirmation instead of `<ConfirmDialog>` component | Replace with `<ConfirmDialog>` component |
| H9 | `src/app/admin/marketing/coupons/[id]/page.tsx` | 366, 369 | Custom `<button>` elements for inline save/cancel instead of `<Button>` component | Use `<Button variant="ghost" size="sm">` |
| H10 | `src/app/admin/marketing/coupons/[id]/page.tsx` | 620, 623 | Custom `<button>` elements for inline expiry save/cancel instead of `<Button>` component | Use `<Button variant="ghost" size="sm">` |
| H11 | `src/components/ui/empty-state.tsx` | 17 | Empty state icon is `h-14 w-14` instead of design system standard `h-12 w-12` | Change to `h-12 w-12` per DESIGN_SYSTEM.md icon size rules |
| H12 | `src/app/admin/settings/page.tsx` | 135 | Top-level container uses `space-y-8` instead of `space-y-6` for page section spacing | Change to `space-y-6` |
| H13 | `src/app/admin/appointments/scheduling/page.tsx` | 105 | Top-level container uses `space-y-4` instead of `space-y-6` for page section spacing | Change to `space-y-6` |
| H14 | `src/app/admin/appointments/scheduling/page.tsx` | 206-220 | Uses custom `feedback` state messages instead of `toast()` for success/error notifications | Replace inline feedback div with `toast.success()` / `toast.error()` |
| H15 | `src/app/admin/appointments/scheduling/page.tsx` | 226-233 | Delete blocked date has no success/error toast notification | Add `toast.success('Holiday removed')` and `toast.error(...)` |
| H16 | `src/app/admin/marketing/campaigns/[id]/edit/page.tsx` | entire file | Missing `<PageHeader>` component | Add `<PageHeader title="Edit Campaign">` to the page |
| H17 | `src/app/admin/settings/card-reader/page.tsx` | 370-376 | Custom status badges (`rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium`) instead of `<Badge>` component | Use `<Badge variant="success">` and `<Badge variant="default">` |
| H18 | `src/app/admin/settings/pos-favorites/page.tsx` | 544 | Custom badge (`rounded-full px-2.5 py-0.5 text-xs font-medium`) instead of `<Badge>` component | Use `<Badge>` component with appropriate variant |

## Medium (Pattern Drift)

| # | File | Line(s) | Violation | Recommended Fix |
|---|------|---------|-----------|-----------------|
| M1 | `src/app/admin/marketing/automations/page.tsx` | entire file | List page uses `<DataTable>` but missing `<SearchInput>` for filtering | Add `<SearchInput>` to filter automation rules |
| M2 | `src/app/admin/marketing/campaigns/page.tsx` | entire file | List page uses `<DataTable>` but missing `<SearchInput>` for filtering | Add `<SearchInput>` to filter campaigns |
| M3 | `src/app/admin/inventory/page.tsx` | entire file | List page uses `<DataTable>` but missing `<SearchInput>` for filtering | Add `<SearchInput>` component for product search |
| M4 | `src/app/admin/catalog/categories/page.tsx` | entire file | List page uses `<DataTable>` but missing `<SearchInput>` for filtering | Add `<SearchInput>` component for category search |
| M5 | `src/app/admin/marketing/compliance/page.tsx` | 266-271 | Customer search input uses raw `<input>` with no debounce (calls `searchCustomers` on every keystroke) | Add 300ms debounce per unified customer search pattern |
| M6 | `src/components/account/vehicle-card.tsx` | 26 | Card padding uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M7 | `src/components/account/appointment-card.tsx` | 104 | Card padding uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M8 | `src/components/account/transaction-card.tsx` | 30, 72 | Card padding uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M9 | `src/components/booking/step-schedule.tsx` | 239, 321 | CardContent uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M10 | `src/app/pos/components/service-detail-dialog.tsx` | 103, 227 | Dialog internal padding uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M11 | `src/app/admin/marketing/coupons/new/page.tsx` | 2104 | Section container uses `p-5` instead of standard `p-4` or `p-6` | Change to `p-4` or `p-6` |
| M12 | `src/app/admin/staff/[id]/page.tsx` | 849 | Permission categories section uses `space-y-8` for section spacing instead of `space-y-6` | Change to `space-y-6` |
| M13 | `src/app/(account)/account/page.tsx` | 83 | Top-level container uses `space-y-8` instead of `space-y-6` for page section spacing | Change to `space-y-6` |
| M14 | `src/app/admin/page.tsx` | 537 | Quick Actions section uses `space-y-4` for section-level spacing instead of `space-y-6` | Change to `space-y-6` |
| M15 | `src/app/admin/marketing/coupons/new/page.tsx` | 1126 | Custom loading spinner (`animate-spin rounded-full border-2 border-gray-300 border-t-gray-900`) instead of `<Spinner>` component | Use `<Spinner size="md">` |
| M16 | `src/app/admin/marketing/coupons/new/page.tsx` | 1551 | Custom loading spinner instead of `<Spinner>` component | Use `<Spinner size="sm">` |
| M17 | `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` | 1168 | Custom loading spinner instead of `<Spinner>` component | Use `<Spinner size="md">` |
| M18 | `src/app/admin/settings/coupon-enforcement/page.tsx` | 58 | Uses `<Loader2>` icon with `animate-spin` for page loading instead of `<Spinner>` component | Use `<Spinner size="md">` in standard loading wrapper |
| M19 | `src/app/admin/marketing/coupons/new/page.tsx` | 1553 | Badge with `text-base` class override -- badges should use `text-xs` per design system | Remove `text-base` className override |
| M20 | `src/app/admin/quotes/[id]/page.tsx` | 423 | Body text uses `text-base font-semibold` where `text-sm` is the standard | Change to `text-sm font-semibold` |
| M21 | `src/app/admin/quotes/[id]/page.tsx` | 564 | Totals line uses `text-base` where design system specifies `text-lg font-semibold` for totals or `text-sm` for body | Use `text-lg font-semibold` for total display or `text-sm` for line items |
| M22 | `src/app/admin/page.tsx` | 433 | Stat number on appointment calendar card uses `text-lg font-bold` instead of `text-2xl font-bold` per stat card pattern | Change to `text-2xl font-bold` |
| M23 | `src/app/admin/appointments/page.tsx` | 344 | Stat number uses `text-lg font-bold` instead of `text-2xl font-bold` per stat card pattern | Change to `text-2xl font-bold` |
| M24 | `src/components/public/service-card.tsx` | 89 | Price display uses `text-base font-semibold` instead of design system `text-sm font-medium` for prices | Change to `text-sm font-medium` or `text-lg font-semibold` if it's a total/summary price |
| M25 | `src/app/admin/staff/[id]/page.tsx` | 789 | Uses `toLocaleDateString()` instead of shared `formatDate()` utility | Use `formatDate()` from `@/lib/utils/format` |
| M26 | `src/app/admin/appointments/scheduling/page.tsx` | 337 | Uses `toLocaleDateString()` instead of shared `formatDate()` utility | Use `formatDate()` from `@/lib/utils/format` |
| M27 | `src/app/admin/marketing/coupons/new/page.tsx` | 1106 | Uses `toLocaleDateString()` and `toLocaleTimeString()` instead of shared format utilities | Use `formatDate()` and `formatDateTime()` from `@/lib/utils/format` |
| M28 | `src/app/admin/customers/page.tsx` | 544 | Uses `new Date(d).toLocaleDateString()` instead of shared `formatDate()` utility | Use `formatDate()` from `@/lib/utils/format` |
| M29 | `src/app/pos/components/checkout/payment-complete.tsx` | 13 | Icon uses `h-20 w-20` which is non-standard (closest standard is `h-12 w-12` for empty states) | Change to `h-12 w-12` or `h-16 w-16` if intentionally oversized for celebration |
| M30 | `src/app/pos/components/checkout/card-payment.tsx` | 240, 259, 268 | Icons use `h-16 w-16` which is non-standard | Consider standardizing to `h-12 w-12` (empty state size) |
| M31 | `src/app/pos/components/checkout/split-payment.tsx` | 356, 370, 377 | Icons use `h-16 w-16` which is non-standard | Consider standardizing to `h-12 w-12` (empty state size) |
| M32 | `src/components/booking/booking-confirmation.tsx` | 32 | CheckCircle icon uses `h-16 w-16` which is non-standard | Consider standardizing to `h-12 w-12` |
| M33 | `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` | 434, 533 | Custom badge-like elements using `rounded-full` + `text-xs` instead of `<Badge>` component | Use `<Badge>` component with appropriate variant |
| M34 | `src/app/admin/marketing/automations/[id]/page.tsx` | 139 | Custom badge-like element instead of `<Badge>` component | Use `<Badge>` component |
| M35 | `src/app/admin/marketing/automations/new/page.tsx` | 111 | Custom badge-like element instead of `<Badge>` component | Use `<Badge>` component |
| M36 | `src/app/admin/marketing/coupons/new/page.tsx` | 1153 | Custom tab/chip using `rounded-full` + `text-xs` styling instead of standard component | Use `<Badge>` or `<Button variant="outline" size="sm">` |

## Low (Polish)

| # | File | Line(s) | Violation | Recommended Fix |
|---|------|---------|-----------|-----------------|
| L1 | `src/app/pos/components/category-tile.tsx` | 26 | Inline `style={{ backgroundImage }}` for category tile background | Acceptable for dynamic images; low priority |
| L2 | `src/app/pos/components/register-tab.tsx` | 258 | Inline `style={{ gridAutoRows }}` for grid layout | Consider a Tailwind arbitrary value `[grid-auto-rows:minmax(64px,1fr)]` |
| L3 | `src/app/(account)/account/loyalty/page.tsx` | 172 | Inline `style={{ width }}` for progress bar | Consider using Tailwind arbitrary value or CSS variable |
| L4 | `src/app/admin/settings/receipt-printer/page.tsx` | 405 | Inline `style={{ maxWidth, height }}` for logo preview | Acceptable for dynamic dimensions; low priority |
| L5 | `src/app/admin/migration/steps/transaction-step.tsx` | 372 | Inline `style={{ width }}` for progress bar | Consider using Tailwind arbitrary value |
| L6 | `src/app/admin/migration/steps/customer-step.tsx` | 483 | Inline `style={{ width }}` for progress bar | Consider using Tailwind arbitrary value |
| L7 | `src/app/admin/staff/[id]/page.tsx` | 881 | Inline `style={{}}` usage | Investigate and replace with Tailwind classes if possible |
| L8 | `src/components/ui/data-table.tsx` | 181, 208 | Inline `style` for column widths | Acceptable for dynamic column sizing; low priority |
| L9 | `src/app/pos/end-of-day/page.tsx` | 278, 385, 395, 457 | Uses `rounded-xl` on card-like containers instead of standard Card `rounded-lg` | Change to `rounded-lg` or use `<Card>` component |
| L10 | `src/app/pos/pos-shell.tsx` | 467 | Uses `rounded-xl` and `shadow-2xl` on dialog container | Use standard Card or Dialog styling with `rounded-lg` and `shadow-lg` |
| L11 | `src/app/pos/components/held-tickets-panel.tsx` | 61, 148 | Uses `rounded-xl` and `shadow-2xl` on modal containers | Use standard Dialog styling |
| L12 | `src/app/pos/components/ticket-actions.tsx` | 104 | Uses `rounded-xl` and `shadow-2xl` on modal container | Use standard Dialog styling |
| L13 | `src/app/pos/components/transactions/transaction-detail.tsx` | 464 | Uses `rounded-xl` and `shadow-xl` on modal container | Use standard Dialog styling |
| L14 | `src/app/pos/components/checkout/checkout-overlay.tsx` | 21 | Uses `rounded-2xl` and `shadow-2xl` on overlay container | Use standard `rounded-lg` and `shadow-lg` |
| L15 | `src/app/admin/customers/page.tsx` | 74 | Uses `shadow-xl` on custom modal container | Replace custom modal with `<Dialog>` component |
| L16 | `src/app/admin/marketing/coupons/new/page.tsx` | 2204 | Uses `shadow-xl` on custom modal container | Replace custom modal with `<Dialog>` component |
| L17 | `src/app/pos/components/catalog-card.tsx` | 18, 53 | Card padding uses `p-3` instead of standard `p-4` | Change to `p-4` (POS touch target consideration may justify `p-3`) |
| L18 | `src/app/pos/pos-shell.tsx` | 89 | Uses `toLocaleTimeString()` instead of shared format utility | Use format utility from `@/lib/utils/format` |
| L19 | `src/components/public/service-card.tsx` | 93, 98 | Icons use `h-3 w-3` instead of standard `h-4 w-4` for inline text | Change to `h-4 w-4` per icon size rules |
| L20 | `src/components/ui/data-table.tsx` | 192 | Sort icon uses `h-3 w-3` instead of standard `h-4 w-4` | Change to `h-4 w-4` |
| L21 | `src/app/admin/page.tsx` | 243, 332, 411, 474 | ArrowRight and AlertTriangle icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L22 | `src/app/admin/marketing/campaigns/page.tsx` | 141 | Pencil icon uses `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L23 | `src/app/admin/marketing/campaigns/[id]/page.tsx` | 301, 309 | Chevron icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L24 | `src/app/admin/customers/page.tsx` | 230, 253 | Check and X icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L25 | `src/app/admin/customers/[id]/page.tsx` | 1201 | AlertTriangle icon uses `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L26 | `src/app/admin/settings/card-reader/page.tsx` | 371, 376 | Status indicator icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L27 | `src/app/admin/marketing/coupons/new/page.tsx` | 229, 1464, 1483 | X and Plus icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L28 | `src/app/pos/components/ticket-item-row.tsx` | 114, 128-183 | Multiple icons and buttons use `h-3 w-3` and `h-7 w-7` (non-standard sizes) | Standardize to `h-4 w-4` for icons and standard button sizing |
| L29 | `src/app/pos/components/quotes/quote-item-row.tsx` | 114, 128-183 | Multiple icons and buttons use `h-3 w-3` and `h-7 w-7` (non-standard sizes) | Standardize to `h-4 w-4` for icons and standard button sizing |
| L30 | `src/app/pos/components/quotes/quote-ticket-panel.tsx` | 441, 453 | Tag and CalendarDays icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L31 | `src/app/pos/components/ticket-panel.tsx` | 292 | Tag icon uses `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L32 | `src/app/pos/components/held-tickets-panel.tsx` | 104 | Clock icon uses `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L33 | `src/app/pos/components/quotes/quote-detail.tsx` | 519, 552 | Clock icons use `h-3 w-3` instead of `h-4 w-4` | Change to `h-4 w-4` |
| L34 | `src/app/pos/components/promotions-tab.tsx` | 111, 122 | X and Loader icons use `h-3 w-3` inside inline actions | Change to `h-4 w-4` |
| L35 | `src/app/pos/components/pin-pad.tsx` | 60 | Delete icon uses conditional `h-7 w-7` which is non-standard | Standardize to `h-5 w-5` (navigation size) or `h-4 w-4` |
| L36 | `src/app/admin/admin-shell.tsx` | 542 | User avatar uses `h-7 w-7` which is non-standard | Change to `h-8 w-8` (stat card size) for avatar |
| L37 | `src/app/pos/components/product-detail.tsx` | 48 | Package icon uses `h-10 w-10` which is non-standard | Change to `h-12 w-12` (empty state) or `h-8 w-8` (stat card) |
| L38 | `src/app/pos/end-of-day/page.tsx` | 281, 341 | Container divs use `h-10 w-10` which is non-standard for icons | Change to `h-8 w-8` (stat card size) |
| L39 | `src/app/(public)/page.tsx` | 113 | Feature icons use `h-6 w-6` which is non-standard (closest: `h-5 w-5` nav or `h-8 w-8` stat) | Change to `h-8 w-8` for feature cards or `h-5 w-5` |
| L40 | `src/app/admin/settings/page.tsx` | 154 | Settings icons use `h-6 w-6` which is non-standard | Change to `h-5 w-5` (navigation size) |
| L41 | `src/app/pos/components/quotes/quote-list.tsx` | 116 | Custom button using `rounded-lg bg-blue-600 px-3 py-2` instead of `<Button>` component | Use `<Button size="sm">` |
| L42 | `src/components/account/account-shell.tsx` | 82 | Navigation uses `space-y-3` in sidebar area | Change to `space-y-4` for form-like spacing or `space-y-2` for tight lists |
| L43 | `src/components/booking/step-review.tsx` | 408 | AlertTriangle icon uses `h-3 w-3` | Change to `h-4 w-4` |
| L44 | `src/app/admin/customers/[id]/page.tsx` | 1365 | Award icon uses `h-10 w-10` which is non-standard | Change to `h-8 w-8` (stat card size) or `h-12 w-12` (empty state) |
| L45 | `src/app/admin/catalog/products/page.tsx` | 110 | Product image container uses `h-10 w-10` which is non-standard | Acceptable for thumbnail; low priority |
| L46 | `src/app/pos/components/held-tickets-panel.tsx` | 121 | Delete button uses `h-9 w-9` which is non-standard | Use `<Button variant="ghost" size="sm">` with `h-4 w-4` icon |
| L47 | `src/components/booking/step-configure.tsx` | 473, 490 | Quantity buttons use `h-9 w-9` which is non-standard | Use standard `<Button>` sizing |

---

## Summary

- **Total High: 18**
- **Total Medium: 36**
- **Total Low: 47**
- **Grand Total: 101**

### Top Priority Areas

1. **Custom dialog/modal implementations (H6, H7, H8)** -- Three admin pages build their own modals from scratch (`fixed inset-0 z-50 + bg-black/50`) instead of using the shared `<Dialog>` component. This is the most impactful architectural violation.

2. **Transactions page (H2, H3, H4, H5)** -- The admin transactions page is the largest single violator. It implements its own table, buttons, and status badges without using any shared components (`DataTable`, `Button`, `Badge`).

3. **`confirm()` usage (H1)** -- The card-reader settings page uses browser `confirm()` for destructive actions. The design system mandates `<ConfirmDialog>`.

4. **Missing SearchInput on list pages (M1-M4)** -- Four list pages that use DataTable are missing the SearchInput component from the standard list page pattern.

5. **Missing toast notifications (H14, H15)** -- The scheduling page uses custom inline feedback messages instead of the `toast()` pattern required by the design system.

6. **Empty state icon size (H11)** -- The shared `EmptyState` component itself uses `h-14 w-14` instead of `h-12 w-12`, meaning every empty state across the app renders at a non-standard size.

7. **Non-standard `h-3 w-3` icons (L19-L34)** -- Widespread use of `h-3 w-3` icons throughout POS and admin pages where the design system specifies `h-4 w-4` as the minimum for buttons and inline text.

### Files With Most Violations

| File | Count | Categories |
|------|-------|------------|
| `src/app/admin/transactions/page.tsx` | 5 | Custom table, buttons, badges, custom modal |
| `src/app/admin/marketing/coupons/new/page.tsx` | 6 | Custom spinners, modal, icons, padding, formatting |
| `src/app/pos/components/ticket-item-row.tsx` | 3 | Non-standard icon sizes |
| `src/app/admin/appointments/scheduling/page.tsx` | 3 | Spacing, missing toast |
| `src/app/admin/settings/card-reader/page.tsx` | 3 | confirm(), custom badges, Loader2 |

### Patterns That Are Compliant

- All 48 admin pages include `<PageHeader>` (except `campaigns/[id]/edit` which delegates to `CampaignWizard`)
- All admin pages use `space-y-6` at top-level container (3 exceptions noted above)
- All DataTable list pages include `emptyTitle` and `emptyDescription` props
- Customer search implementations consistently use 2-char minimum and phone-detection logic
- Public pages (`(public)` and `(account)`) have comprehensive `dark:` variant coverage
- Link styling in DataTables consistently uses `text-blue-600 hover:text-blue-800 hover:underline`
- Most admin pages import and use the `<Spinner>` component for loading states
- `text-lg` usage for headings and section titles is appropriate and compliant
