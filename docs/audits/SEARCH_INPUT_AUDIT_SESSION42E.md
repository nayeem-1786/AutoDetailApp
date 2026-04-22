# Search Input Clear-X Consistency Audit — Session 42E

**Date:** 2026-04-21
**Scope:** All admin search inputs in `src/app/admin/`. POS and public search inputs inventoried for awareness only — not in migration scope.
**Trigger:** Session 42D-2 smoke testing flagged inconsistent clear-X affordances across admin search boxes.

---

## Executive summary

- **Shared component already exists** at `src/components/ui/search-input.tsx` with built-in clear-X (conditional `<X>` button when `value.length > 0`). No component creation or extension required.
- **`TableToolbar`** (`src/components/admin/table-toolbar.tsx:99–106`) already consumes `SearchInput`, so every admin list page routed through the toolbar is compliant.
- **Gap:** 11 holdout pages hand-roll a bare `<input>` / `<Input>` with a `Search` icon and no clear-X.
- **Third-category check** (bare input + hand-rolled clear-X button): **zero hits in admin**. Every `<X>` icon in admin is a modal close, chip/item remove, multi-select deselect, or labeled action button ("Clear Sale") — never a search-input clear affordance.
- **Strategy:** Ship the existing component — migrate the 11 holdouts to import `SearchInput`. No API changes.

---

## 1. Shared component — already in place

`src/components/ui/search-input.tsx`

```ts
interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onEnter?: () => void;
}
```

Renders a left `Search` icon, an input, and a right `X` button that only appears when `value` is truthy. The X click calls `onChange('')` and, if supplied, `onClear()`. Because the component extends `InputHTMLAttributes` and spreads `...props` onto the underlying `<input>`, these pass through without any extra wiring:

- `autoFocus`
- `data-*` attributes (including `data-barcode-scan-target`)
- `inputMode`
- `aria-label`, `aria-*`
- `disabled`, `maxLength`, etc.

No test coverage exists yet for this component.

---

## 2. Inventory — admin search inputs

Legend: ✅ = uses `SearchInput` (compliant). ❌ = bare input (migration target). 🚫 = out of scope.

### 2.1 Already compliant (via `SearchInput` or `TableToolbar`)

| File | Line | Host / section | Via |
|---|---|---|---|
| `src/app/admin/appointments/components/appointment-filters.tsx` | 28 | Appointments filter | ✅ direct |
| `src/app/admin/catalog/products/enrichment-review/page.tsx` | 350 | Enrichment review | ✅ direct |
| `src/app/admin/inventory/purchase-orders/new/page.tsx` | 238 | PO product-add dialog | ✅ direct |
| `src/app/admin/marketing/compliance/page.tsx` | 246 | Primary compliance search | ✅ direct |
| `src/app/admin/marketing/coupons/page.tsx` | 358 | Coupons list | ✅ direct |
| `src/app/admin/messaging/components/conversation-list.tsx` | 107 | Messaging list | ✅ direct |
| `src/app/admin/catalog/products/page.tsx` | — | Products list | ✅ via `TableToolbar` |
| `src/app/admin/catalog/services/page.tsx` | — | Services list | ✅ via `TableToolbar` |
| `src/app/admin/customers/page.tsx` | — | Customers list header | ✅ via `TableToolbar` |
| `src/app/admin/inventory/vendors/page.tsx` | — | Vendors list | ✅ via `TableToolbar` |
| `src/app/admin/jobs/page.tsx` | — | Jobs list | ✅ via `TableToolbar` |
| `src/app/admin/marketing/campaigns/page.tsx` | — | Campaigns list | ✅ via `TableToolbar` |
| `src/app/admin/orders/page.tsx` | — | Orders list | ✅ via `TableToolbar` |
| `src/app/admin/quotes/page.tsx` | — | Quotes list | ✅ via `TableToolbar` |
| `src/app/admin/settings/audit-log/page.tsx` | — | Audit log | ✅ via `TableToolbar` |
| `src/app/admin/staff/page.tsx` | — | Staff list | ✅ via `TableToolbar` |
| `src/app/admin/transactions/page.tsx` | — | Transactions list | ✅ via `TableToolbar` |

### 2.2 Holdouts — migration scope (11 files)

| # | File | Line | Placeholder | Notes |
|---|---|---|---|---|
| 1 | `src/app/admin/catalog/products/[id]/page.tsx` | 1075 | "Search by product name..." | Quick-edit dialog; plain migrate |
| 2 | `src/app/admin/customers/page.tsx` | 196 | "Search tags..." | BulkTagDialog tag filter; plain migrate |
| 3 | `src/app/admin/marketing/compliance/page.tsx` | 281 | "Search by name or phone..." | Customer sub-dialog; plain migrate |
| 4 | `src/app/admin/marketing/email-templates/_components/variable-inserter.tsx` | 58 | "Search variables..." | Pass `autoFocus` via spread |
| 5 | `src/app/admin/marketing/promotions/_components/quick-sale-dialog.tsx` | 300 | "Search to add items..." | Plain migrate |
| 6 | `src/app/admin/marketing/campaigns/drip/_components/drip-enrollments-table.tsx` | 386 | "Search by name, email, or phone..." | Wire existing Enter-handler to `onEnter` prop |
| 7 | `src/app/admin/photos/page.tsx` | 645 | "Search customer..." | Customer-lookup combobox |
| 8 | `src/app/admin/settings/data-management/page.tsx` | 240 | "Search by name, phone, or email..." | Keep `handleSearch` wrapper in `onChange` |
| 9 | `src/app/admin/settings/pos-settings/page.tsx` | 397 | "Search makes..." | Vehicle-makes filter |
| 10 | `src/app/admin/website/global-blocks/page.tsx` | 203 | "Search global blocks..." | Plain migrate |
| 11 | `src/app/admin/website/seo/page.tsx` | 1611 | "Search by path or title..." | SEO pages filter |

### 2.3 Out of scope

| File | Why |
|---|---|
| `src/app/admin/inventory/counts/[id]/page.tsx:460` | 🚫 Concurrent Session 42D-patch owns this file. Note: carries `data-barcode-scan-target="input"` — the shared component's `...props` spread already forwards `data-*` attributes, so eventual migration is safe. |
| `src/app/admin/admin-shell.tsx:312–329` | 🚫 Global command palette. The X on the right side closes the modal (`onOpenChange(false)`), not clears the query. An inline `Loader2` is shown while searching. Different UX contract; do not migrate. |
| `src/app/admin/marketing/coupons/new/page.tsx` (lines 1480, 1730, 1744, 1784, 1798, 1949, 2003) | 🚫 Custom `SearchableSelect` / `MultiSearchableSelect` widgets with keyboard navigation, click-outside, typeahead dropdowns. Migration would alter semantics. Consider a future dedicated pass. |
| `src/app/pos/components/search-bar.tsx` | 🚫 POS — per session brief. Already has its own clear-X and barcode/focus logic. |
| `src/app/pos/components/customer-lookup.tsx` | 🚫 POS — per session brief. Currently lacks clear-X; tracked for future POS pass. |
| `src/components/public/product-search.tsx` | 🚫 Public site — standalone component with own dropdown/keyboard navigation. Out of scope. |

### 2.4 Third-category check: bare input + hand-rolled clear-X

**Result: zero hits in admin.**

Searches performed:
- `rg "<X\s"` across `src/app/admin/` — all occurrences inspected.
- `rg "onClick=\{[^}]*set(Search|Query|SearchTerm|SearchQuery|Filter|TagSearch|BulkTagInput)\("` — no clear-query-to-empty-string handlers.
- Multi-line `(query|search).*&&.*<X` pattern — no matches.

Every admin `<X>` icon falls into one of these buckets (none of which is a search clear):

- **Modal/dialog close** — `admin-shell.tsx:328` (global search), `photos/page.tsx:1212` (lightbox), `website/navigation/page.tsx:533` (add-link dialog).
- **List-item / chip remove** — `settings/data-management/page.tsx:324` (purge queue), `settings/receipt-printer/page.tsx:802` (zones), `catalog/products/[id]/page.tsx:1350,1456` (spec chips), `photos/page.tsx:1290` (tag chips).
- **Multi-select deselect** — `marketing/coupons/new/page.tsx:118` (SearchableSelect deselect).
- **Labeled action button** — `catalog/services/[id]/page.tsx:1567`, `catalog/products/[id]/page.tsx:1713` (`<X /> Clear Sale`).
- **Mobile sidebar close** — `admin-shell.tsx:850`.
- **Cancel edit** — `website/navigation/page.tsx:787`.
- **File remove** — `migration/steps/upload-step.tsx:206`.

---

## 3. Recommendation

Migrate the 11 holdouts to `SearchInput` with per-file edits. Minimal code changes:
- Import `SearchInput` from `@/components/ui/search-input`.
- Replace the `<div class="relative"><Search /><input ... /></div>` block with `<SearchInput value={...} onChange={...} placeholder={...} />`.
- Drop the now-orphaned `Search` icon import (keep if used elsewhere on the page).
- Propagate `autoFocus`, `onEnter`, and other attributes via the component's prop surface or `{...rest}` spread.

Add first unit test at `src/components/ui/__tests__/search-input.test.tsx` covering: empty-value, non-empty-value X visibility, click-to-clear, typing, Enter handling, prop forwarding.

Future (not this session):
- Migrate `inventory/counts/[id]` search input after 42D-patch lands.
- Investigate POS `customer-lookup.tsx` for clear-X parity.
- Consider unifying the coupons/new `SearchableSelect` widgets on the shared primitive if/when a typeahead variant is added.
