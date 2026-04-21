# Quick Edit Drawer + Inline Cells — Read-Only Audit (Session 41A)

**Scope:** admin catalog products list and edit pages, admin products API surface, numeric keypad patterns, scanner reusability, drawer component availability, toast/undo patterns, tests.

**Status:** read-only. No code changes.

---

## Section 1 — Products list page current state

**File:** `src/app/admin/catalog/products/page.tsx` (699 lines). Client component.

**Table engine:** shadcn-style `DataTable` wrapping TanStack `useReactTable` (`src/components/ui/data-table.tsx:124`). Columns are defined declaratively as `ColumnDef<ProductWithRelations, unknown>[]` (page.tsx:339–534). Adding inline-editable cells is **additive** — each column's `cell: ({ row }) => …` is free-form JSX, so replacing a display span with an inline-editable control is a drop-in substitution. No table refactor required.

### Columns rendered today

| # | Header | Field(s) | Permission gate | Editable today? |
|---|---|---|---|---|
| 1 | _(blank)_ | `image_url` | none | no — thumbnail only |
| 2 | Name | `name` | none for view; `products.edit` controls whether the row button links into the edit page | no in list (tap navigates to edit page) |
| 3 | SKU | `sku` | none | no |
| 4 | Category | `product_categories.name` | none | no (foreign key) |
| 5 | Vendor | `vendors.name` | none | no (foreign key) |
| 6 | Price | `retail_price` | none | no |
| 7 | Cost | `cost_price` | `inventory.view_costs` | no |
| 8 | Margin | derived from `cost_price` / `retail_price` | `inventory.view_costs` | no — computed |
| 9 | Stock | `quantity_on_hand` | `inventory.view_stock` | partial — `inventory.adjust_stock` makes the cell a button that opens the "Adjust Stock" dialog (page.tsx:440–452). |
| 10 | Reorder At | `reorder_threshold` | `inventory.view_stock` | no |
| 11 | Status | `is_active` + stock icon | none for display; `products.edit` shows "Activate" button on inactive rows | partial — "Activate" button on inactive rows only |

Column-building code (page.tsx:339–534) — each block is a clean ColumnDef slice, so any individual cell can be swapped without affecting the rest.

### Strong candidates for inline editing

| Field | Why | Input recommendation |
|---|---|---|
| `retail_price` | Single decimal, most frequently edited in daily ops (sales, repricing) | `type="text"` + `inputMode="decimal"` + `pattern="[0-9]*\.?[0-9]*"` (matches the POS cash pattern at `src/app/pos/components/checkout/cash-payment.tsx:230–233`) |
| `cost_price` | Single decimal, updated on vendor-price changes | same as above |
| `quantity_on_hand` | Already gated into the "Adjust Stock" dialog. **Keep dialog**, don't inline — adjustments are *deltas* (+10, −3) and require a reason for the audit trail. Inline would encourage setting an absolute value, which bypasses the audit log. Flag this explicitly. | — |
| `reorder_threshold` | Integer, rarely-but-not-never edited, no audit requirement | `type="text"` + `inputMode="numeric"` + `pattern="[0-9]*"` |

> **Qty caveat is significant.** Session 37 unified all stock movements through `stock_adjustments` + `logStockAdjustment()`. Inline-editing `quantity_on_hand` would require the user to still provide a reason (so the current dialog isn't replaceable by a plain cell). If inline qty is a must-have, it should open the existing dialog on focus — but at that point an inline cell is worse UX than the current stock-count button. Recommend **leave qty alone**.

### Columns that should NOT be inline-editable

| Field | Rationale |
|---|---|
| `name` | Long text, overflows cell, consequential — edit in drawer/page. |
| `sku` | Rarely changed, used as external identifier, changing silently is hazardous — require the drawer. |
| `category_id` | Foreign key — needs searchable dropdown. Fits drawer, not inline. |
| `vendor_id` | Same as category. |
| `image_url` | File upload — dedicated component. |
| `quantity_on_hand` | Audit-trail requirement (see above). |
| Margin | Derived — not writable. |
| Status | Composite of `is_active` + stock icon; "Activate" already handled. |
| Reactivation | Wizarded flow with confirm dialog — don't collapse. |

---

## Section 2 — Product edit page state management

**File:** `src/app/admin/catalog/products/[id]/page.tsx` (1876 lines).

### State library

`react-hook-form` with Zod resolver via the project's `formResolver` helper ([id]/page.tsx:6–10):

```ts
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
…
import { productCreateSchema, type ProductCreateInput } from '@/lib/utils/validation';
```

Plus `useState` for several out-of-form concerns: `product`, `costHistory`, `variants`, `specKeyFeatures`/`specSurfaceCompat` (tag inputs), `salePrice`/`saleStartsAt`/`saleEndsAt` (managed outside RHF), `productImages`. See [id]/page.tsx:62–105.

### Save trigger

**Single form submit.** No per-field autosave, no debounced writes. The form is wrapped at [id]/page.tsx:747 (`<form onSubmit={handleSubmit(onSubmit)} …>`) and `onSubmit` at [id]/page.tsx:421 sends the entire form.

### Endpoint

**There is no admin PATCH endpoint for products.** The edit page writes directly to Supabase (`[id]/page.tsx:454–475`):

```ts
const { error } = await supabase
  .from('products')
  .update({
    name: data.name,
    slug: newSlug,
    sku: data.sku || null,
    description: data.description || null,
    category_id: data.category_id || null,
    vendor_id: data.vendor_id || null,
    cost_price: data.cost_price,
    retail_price: data.retail_price,
    quantity_on_hand: data.quantity_on_hand,
    reorder_threshold: data.reorder_threshold ?? null,
    min_order_qty: data.min_order_qty ?? null,
    is_taxable: data.is_taxable,
    is_loyalty_eligible: data.is_loyalty_eligible,
    is_active: data.is_active,
    barcode: data.barcode || null,
    variant_label: data.variant_label || null,
    specs: cleanSpecs,
  })
  .eq('id', productId);
```

**`src/app/api/admin/products/` tree** contains only relationship routes:
```
src/app/api/admin/products/[id]/group/route.ts
src/app/api/admin/products/[id]/variants/route.ts
src/app/api/admin/products/group/route.ts
```
No `[id]/route.ts` exists. Verified via `find src/app/api/admin/products -type f`.

### RLS

`supabase/migrations/20260201000035_rls_policies.sql:82–83`:
```sql
CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_all    ON products FOR ALL    TO authenticated USING (true) WITH CHECK (true);
```

Any authenticated user can UPDATE. **No per-field permission gate at the DB level** — permission enforcement is UI-side via `usePermission('products.edit')`. A drawer that writes via the browser Supabase client inherits this exactly.

### Partial-update support

`supabase.from('products').update({...}).eq('id', …)` is already partial by nature (PostgREST only updates the columns in the object), so the drawer can send `{ retail_price: 29.99 }` and only that column changes. No endpoint extension required. However — if we want a server-side choke point (for rate limiting, audit-log writes, or future server-only validation), we'd introduce `PATCH /api/admin/products/[id]`. For the scope described, **reusing the direct Supabase pattern is consistent with the existing edit page and requires zero new server code.**

**Recommendation:** follow the existing pattern for the drawer; revisit server-side validation only if abuse surfaces.

---

## Section 3 — Numeric keypad verification

### Current state of `type` / `inputMode` on the numeric surfaces

Admin catalog products uses `type="number"` with **no** `inputMode`:

- `src/app/admin/catalog/products/[id]/page.tsx` at lines **804** (cost_price), **814** (retail_price), **824** (quantity_on_hand), **833** (reorder_threshold), **842** (min_order_qty), **1621** (sale_price), **1736** (discount_value)
- `src/app/admin/catalog/products/new/page.tsx` at lines **322, 333, 344, 353, 363**
- `src/app/admin/catalog/products/page.tsx` at line **669** (stock adjustment delta)

Example — [id]/page.tsx:802–808:
```tsx
<Input
  id="cost_price"
  type="number"
  step="0.01"
  min="0"
  {...register('cost_price')}
/>
```

### Why this is the "slow QWERTY" symptom

`type="number"` on iPad Safari is historically buggy: it renders a keypad but (a) shows the *telephone-style* numeric keypad (no decimal on some locales), (b) interacts poorly with form-level Enter, and (c) the spinner UI adds chrome that the user doesn't need. Worse, React Hook Form's coerce-to-number resolver can clash with empty-state typing. The *reliable* pattern in this codebase is:

```tsx
<input
  type="text"
  inputMode="decimal"
  pattern="[0-9]*\.?[0-9]*"
  …
/>
```

— `src/app/pos/components/checkout/cash-payment.tsx:230–234`. This is the POS cash-received field and is the only place currently confirmed to give a clean iPad decimal keypad.

**21 files** across POS and admin already use `inputMode="decimal"` or `inputMode="numeric"` (grep output includes ticket-item-row, split-payment, tip-screen, refund flag-issue, eod cash count, customer-lookup, signin, booking inline-auth, photos admin, staff admin, etc.). Admin catalog is the outlier.

### Shared `<Input>` forwards `inputMode`

`src/components/ui/input.tsx`:
```tsx
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input type={type} className={cn(…)} ref={ref} {...props} />
    );
  }
);
```

Spreads everything to the underlying `<input>`. No prop is stripped. So adding `inputMode="decimal"` to any admin `<Input>` instance works immediately — no component change needed.

### Reference call sites (known-good)

- Cash received: `src/app/pos/components/checkout/cash-payment.tsx:230–233`
- Split payment amount: `src/app/pos/components/checkout/split-payment.tsx`
- Tip amount: `src/app/pos/components/checkout/tip-screen.tsx`
- EOD cash count: `src/app/pos/components/eod/cash-count-form.tsx`
- Refund quantity: `src/app/pos/jobs/components/flag-issue-flow.tsx`

All use `type="text" + inputMode="decimal"` (or `"numeric"` for qty).

---

## Section 4 — Scanner integration feasibility

### Hook reuse

Hook lives at `src/lib/hooks/use-barcode-scanner.ts` since Session 40A (confirmed in FILE_TREE.md:847). Page-local mount pattern is established — Session 40A mounts it in `PosWorkspace`, `QuoteBuilder`, and `TransactionList`. `admin/catalog/products/page.tsx` does **not** mount it today. No conflict with any other hook on that page. Mount is a straightforward `useBarcodeScanner({ onScan: handleScan })` call plus a `data-barcode-target` attribute on the list's search input (the `TableToolbar`'s search input — needs a ref-through check; see "Gap" below).

### Admin barcode lookup endpoint — **does not exist**

Searched `src/app/api/admin` for any file mentioning `barcode`: **zero matches**. The only endpoint is `src/app/api/pos/products/barcode-lookup/route.ts`, and its first act is `authenticatePosRequest(request)` — HMAC auth that admin pages cannot produce.

We therefore need a new cookie-authed endpoint. Proposed:

```
src/app/api/admin/products/barcode-lookup/route.ts
```

Pattern: same as the POS route but substituting `createClient()` → `createAdminClient()` after validating the admin session (see `src/app/admin/layout.tsx:15–27` for the session-check pattern), and gating on `products.view` via `requirePermission()` from `src/lib/auth/require-permission.ts`.

### Expected scan → action flow

1. `useBarcodeScanner({ onScan })` mounted in `ProductsPage`.
2. Scan arrives → `onScan(barcode)` → `adminFetch('/api/admin/products/barcode-lookup', { method: 'POST', body: JSON.stringify({ barcode }) })`.
3. On 200 → `setDrawerProductId(product.id)` → drawer opens with that product.
4. On 404 → `toast.error('No product matches barcode ' + barcode)`.

**Technically sound.** The drawer consumes a `productId` (opens → fetches full product via `supabase.from('products').select('*').eq('id', ...)`) or takes the full product via state. Either works.

### Gap: `data-barcode-target` on the list search input

The products list uses `<TableToolbar>` from `src/components/admin/table-toolbar.tsx`, which wraps a `<SearchInput>`. I did not verify `TableToolbar` forwards arbitrary DOM attributes to the inner input. If it doesn't, we have two options: (a) add prop passthrough on `SearchInput`/`TableToolbar`, or (b) mount the scanner with `requireTargetAttribute: false` (added in 40A) — any rapid burst anywhere on the page fires `onScan`. Option (b) is simpler; risk is user keyboard-typing rapid chars on the page. Since the page has almost no typing surface (just the toolbar search), this is fine. **Recommend (b).**

---

## Section 5 — Drawer component patterns

**Existing reusable component:** `src/components/ui/slide-over.tsx` (100 lines). `createPortal` to `document.body`, backdrop click-to-close, ESC-to-close, slide-from-right with `translate-x-full` → `translate-x-0`, width presets (`md|lg|xl|2xl`). No Radix, no external deps.

```tsx
interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
}
```

**Working reuse example:** `src/app/admin/quotes/components/quote-slide-over.tsx` (212 lines) uses it to display a quote detail view inline on the admin quotes list page. Same pattern we want for Quick Edit.

**No Radix in `package.json`.** Grep for `@radix` in deps returned nothing. The app built its drawer from scratch rather than adopt shadcn `Sheet`. This is actually good news — reusing `SlideOver` keeps us dependency-free. Do not introduce `@radix-ui/*` for this session.

**Gaps to fill in Quick Edit use:**
- `SlideOver`'s header is a simple title string. Quick Edit may want action buttons in the header ("Scan next", "Open full page"). Either extend the component with an optional `headerActions` slot, or render actions inside `children`.
- No built-in footer slot. The quote-slide-over example adds a sticky footer via children CSS. Same pattern will work for Quick Edit (Save / Cancel if we keep an explicit save button in addition to on-blur autosave — though per the spec, autosave is the model, so no footer needed).
- Width `lg` (max-w-lg ≈ 32 rem) likely right for a form-based drawer on iPad. `xl` if we want room for two-column layout.

---

## Section 6 — Autosave + undo toast patterns

### Toast library

`sonner` v2.0.7 (confirmed in `package.json`). Global `<Toaster />` presumed mounted in root layout (grep of `toast.success`, `toast.error`, `toast.warning`, `toast.info` returns hundreds of call sites, all using the shared import).

### Existing undo-action usage

**None.** Grep for `toast\.\w+\([^)]*action` across `src/` returned zero matches. Sonner *does* support it natively (`toast(message, { action: { label: 'Undo', onClick: …}, duration: 5000 })`), but the pattern doesn't exist anywhere in this codebase yet. Quick Edit would be the first.

### Recommended autosave + undo pattern

```tsx
async function autosaveField(field: keyof Product, newValue: unknown, oldValue: unknown) {
  // 1) Optimistic UI update via local state / react-hook-form setValue
  updateLocal(field, newValue);

  // 2) Persist
  const { error } = await supabase
    .from('products')
    .update({ [field]: newValue })
    .eq('id', product.id);

  if (error) {
    updateLocal(field, oldValue);                     // revert on failure
    toast.error(`Save failed: ${error.message}`);
    return;
  }

  // 3) Undo toast (5 s)
  toast.success(`${HUMAN_FIELD[field]} saved`, {
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: async () => {
        updateLocal(field, oldValue);
        await supabase.from('products').update({ [field]: oldValue }).eq('id', product.id);
        toast('Reverted');
      },
    },
  });
}
```

Trigger point: `onBlur` on each Input inside the drawer. For inline cells, same on blur. Debounce is optional — if the field updates `retail_price`, a single blur write is sufficient; no need to debounce keystrokes when the write only happens on blur.

### Existing optimistic-update pattern (for reference)

`src/app/admin/photos/page.tsx:341` writes tags, then shows a success toast; on failure, `setPhotos` reverts. No "undo" button, but the mutate-then-toast-then-maybe-revert shape is there. This is the closest prior art.

**Open question (worth an explicit owner call in 41B):**
- Should undo be a full 5-second toast with action button, or a more permissive 15-second toast? Sonner's default toast stacks well; undo at 5 s matches Gmail/Trello conventions. Recommend 5 s.

---

## Section 7 — Test infrastructure

### Existing tests

Vitest + jsdom + `@testing-library/react` (v16.3.2). Current test files:

```
src/app/pos/utils/__tests__/pricing.test.ts
src/lib/utils/__tests__/vehicle-categories.test.ts
src/app/pos/components/__tests__/service-pricing-picker.test.tsx
src/app/pos/components/__tests__/service-detail-dialog.test.tsx
src/lib/utils/__tests__/constants.test.ts
src/app/pos/context/__tests__/ticket-reducer-vehicle-change.test.ts
src/app/pos/context/__tests__/quote-reducer-vehicle-change.test.ts
src/lib/utils/__tests__/refund-math.test.ts
src/lib/utils/__tests__/stock-adjustments.test.ts
src/lib/utils/__tests__/validation-refund-shopuse.test.ts
src/lib/hooks/__tests__/use-barcode-scanner.test.ts
```

**No tests for admin products list or edit page.** (Per grep — zero matches on "products" under `**/__tests__/**`.)

### Recommended test coverage for 41B+

| Test target | Type | Covers |
|---|---|---|
| Drawer open/close behavior | Component (RTL + vitest) | `open` prop toggle, backdrop click, ESC closes, transition-complete unmount |
| Drawer field blur → autosave called | Component + mocked Supabase | `retail_price` change + blur triggers update with only that field; optimistic UI shows new value immediately |
| Undo toast reverts value | Component + mocked Supabase | Clicking "Undo" issues second PATCH with old value; local state reverts |
| Save failure reverts + toasts | Component + mocked Supabase | 4xx/5xx response → value rolls back, error toast fires |
| Inline cell keypad type | Unit (DOM snapshot) | Cell input has `inputMode="decimal"` and `pattern` attribute |
| Scanner → drawer open | Component | Dispatching a synthetic keydown burst + Enter on the page opens drawer with matched product; failed lookup shows error toast |
| Admin barcode lookup API | Route test (no E2E) | Valid session + `products.view` perm → 200 with product; missing perm → 403; invalid barcode → 404; malformed body → 400 |

Skip E2E. Everything above is deterministic under Vitest + `renderHook`/`render`.

---

## Section 8 — Bundled session feasibility / split recommendation

The session layout proposed in the brief is sound, but Sections 3 and 4 of this audit argue for one consolidation and one split:

- **Consolidate:** drawer + scanner wiring. The scanner is useful only because it opens the drawer. Wiring them separately means two commits that both rely on the drawer-open prop — and risks a "scanner landed but no drawer yet" half-state. Fold the admin `barcode-lookup` endpoint and scanner mount into the drawer session, since the drawer is the only consumer.
- **Keep separate:** inline cells. Different UX (cell-in-place vs. drawer) and a different risk profile (accidental edit of a cell in a dense table). A separate session lets 41B ship and bake first.
- **Numeric keypad fix:** Section 3 shows the `inputMode` gap is narrowly scoped to admin catalog (11 sites in 3 files). Bundle this into 41B's drawer work rather than a separate session — you'd be writing the drawer's fields with the correct `inputMode` anyway, and while there, patch the existing product-edit pages in the same PR. Small enough that a separate session is overkill.

### Recommended split

**Session 41B — Quick Edit drawer (drawer + autosave + undo + scanner wiring + admin barcode API + iPad keypad fixes):**
- New `src/app/api/admin/products/barcode-lookup/route.ts` (cookie-authed, `products.view` gate).
- New `src/app/admin/catalog/products/_components/quick-edit-drawer.tsx` (reuses `SlideOver`).
- Mount `useBarcodeScanner` on `products/page.tsx`; wire scan → lookup → open drawer.
- Fix `type="number"` → `type="text" + inputMode="decimal"` on all 11 numeric sites in the catalog pages (drawer + edit page + new page + the adjust-stock delta field).
- Tests: drawer component test; barcode-lookup route test; scanner-opens-drawer integration.

**Session 41C — Inline cells for `retail_price`, `cost_price`, `reorder_threshold`:**
- Cell components for each. Same autosave + undo pattern the drawer uses (extract helper).
- Leave `quantity_on_hand` alone (audit-trail requires the dialog flow).
- Tests: cell blur triggers save; keypad attributes are correct.

**Why not a separate 41D/41E:** the drawer's field logic and the inline cells' field logic are the same PATCH-via-supabase + undo flow. Session 41B will produce a reusable helper (`useProductFieldSave()` or similar); 41C applies it to cells. Any pre-existing numeric-keypad gaps elsewhere in admin (outside catalog) are out of scope — address reactively as they come up, not as a global sweep.

---

## Quick facts for implementers

- Products list: `src/app/admin/catalog/products/page.tsx` (shadcn `DataTable`)
- Product edit: `src/app/admin/catalog/products/[id]/page.tsx` (rhf + direct supabase update at :454–475)
- Admin products API: **no** `[id]/route.ts`; only `group/` and `[id]/variants/`
- Scanner hook: `src/lib/hooks/use-barcode-scanner.ts` (with `requireTargetAttribute: false` option)
- POS barcode lookup: `src/app/api/pos/products/barcode-lookup/route.ts` (HMAC — can't reuse on admin)
- Drawer: `src/components/ui/slide-over.tsx` (pure Tailwind, portal-based); working example: `src/app/admin/quotes/components/quote-slide-over.tsx`
- Toast: `sonner@2.0.7` — no existing `action:` usage in the codebase
- Keypad pattern reference: `src/app/pos/components/checkout/cash-payment.tsx:230–233`
- RLS on products: permissive (`products_all … USING (true) WITH CHECK (true)`). Permission enforcement is UI-side via `usePermission('products.edit')`.
