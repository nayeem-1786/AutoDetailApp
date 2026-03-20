# Enter-Key-as-Submit Audit

> **Date:** 2026-03-19
> **Purpose:** Complete inventory of every text input in the app, classified by Enter-key behavior.
> **Next step:** Implementation session using this audit as the work list.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Total input locations audited** | ~155 |
| **Category F — Already Working** | ~52 |
| **Category A — Search boxes (missing Enter)** | 14 |
| **Category B — Dialog/modal forms (missing Enter)** | 10 |
| **Category C — Standalone forms (missing Enter)** | 18 |
| **Category D — Inline edits (missing Enter)** | 12 |
| **Category E — Do Not Touch** | ~20 |
| **Needs implementation (A+B+C+D)** | **54** |

### Multi-action pages requiring special handling
- `admin/settings/business-profile/page.tsx` — single `<form>` wraps only the main profile card; hours, booking, SEO, OG Image cards have separate save buttons without form wrapping
- `admin/settings/shipping/page.tsx` — multiple config sections with individual saves, no form wrapping
- `admin/settings/receipt-printer/page.tsx` — multiple config sections, no form wrapping
- `admin/website/homepage/page.tsx` — 5 settings sections with individual saves, no form wrapping
- `admin/website/seo/page.tsx` — per-page SEO editor, no form wrapping
- `admin/website/seo/cities/page.tsx` — city SEO forms, no form wrapping

### Multi-step wizards needing step-aware Enter
- `components/booking/booking-wizard.tsx` — 4 steps; auth forms already have `<form>` wrapping; coupon input in step-confirm-book needs Enter handler
- `admin/marketing/campaigns/_components/campaign-wizard.tsx` — multi-step campaign creation, no `<form>` wrapping at all

---

## Category Legend

| Category | Meaning | Enter Behavior |
|----------|---------|----------------|
| **A** | Search box | Enter triggers immediate search (bypasses debounce) |
| **B** | Dialog/modal form | Enter triggers primary action (Save/Apply/Confirm) |
| **C** | Standalone/section form | Enter submits the form |
| **D** | Inline edit | Enter saves; Escape cancels |
| **E** | Do Not Touch | Enter has existing semantic meaning (rich text, combobox, PIN, chat) |
| **F** | Already Working | Enter already handled correctly |

---

## 1. POS Components

### Category A — Search Boxes

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/app/pos/components/search-bar.tsx` | 40-48 | Product/service search | Debounced onChange | missing | Add Enter to trigger immediate search |
| `src/app/pos/components/customer-lookup.tsx` | 95-105 | Phone/name search | Debounced onChange (300ms) | missing | Add Enter to call `searchCustomers()` immediately |
| `src/app/pos/components/transactions/transaction-list.tsx` | 213-218 | Receipt #/phone search | Debounced onChange (400ms) | missing | Add Enter for immediate search |
| `src/app/pos/components/quotes/quote-list.tsx` | 147-153 | Quote #/customer search | Debounced onChange (300ms) | missing | Add Enter for immediate search |
| `src/app/pos/jobs/components/flag-issue-flow.tsx` | 444-450 | Service/product catalog search | onChange | missing | Add Enter for immediate search |

### Category B — Dialog/Modal Forms

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/app/pos/components/customer-create-dialog.tsx` | 228-271 | Name/phone/email inputs | "Create" button | works | Inside `<form onSubmit>` |
| `src/app/pos/components/vehicle-create-dialog.tsx` | 223-308 | Year/model/color inputs | "Add Vehicle" button | works | Inside `<form onSubmit>` |
| `src/components/quotes/quote-book-dialog.tsx` | 166-195 | Date/time/duration inputs | "Book" button | skip | Date/time/number inputs only — native behavior OK |

### Category C — Standalone Forms (POS Checkout)

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/app/pos/components/checkout/tip-screen.tsx` | 92-104 | Custom tip amount | "Continue" button | missing | No onKeyDown. Enter should call `handleContinue()` |
| `src/app/pos/components/checkout/cash-payment.tsx` | 217-228 | Cash tender amount | "Complete" button | missing | No onKeyDown. Enter should call `handleProcessCash()`. Respect `!isValid \|\| processing` disabled state |
| `src/app/pos/components/checkout/check-payment.tsx` | 115-123 | Check number (optional) | "Complete" button | missing | No onKeyDown. Enter should call `handleProcessCheck()`. Has autoFocus |
| `src/app/pos/components/checkout/split-payment.tsx` | 270-282 | Split amount | "Process Split" button | missing | No onKeyDown. Enter should call `handleProcessSplit()` |
| `src/app/pos/components/register-tab.tsx` | 265-273 | Custom item note | "Add to Ticket" button | missing | No onKeyDown |
| `src/app/pos/components/keypad-tab.tsx` | 66-74 | Custom item note | "Add to Ticket" button | missing | No onKeyDown |

### Category D — Inline Edits

| File | Line | Component | Primary Action | Enter Status | Escape? | Notes |
|------|------|-----------|----------------|--------------|---------|-------|
| `src/app/pos/components/ticket-item-row.tsx` | 218-236 | Quantity edit | commitEdit() | works | Yes | Enter + Escape both handled |
| `src/app/pos/components/ticket-item-row.tsx` | 316-326 | Note edit | handleNoteSave() | works | Yes | Enter + Escape both handled |
| `src/app/pos/end-of-day/page.tsx` / `eod/cash-count-form.tsx` | 103-113 | Denomination count inputs | Parent submit | missing | No | Consider Enter to move to next field |

### Category E — Do Not Touch

| File | Component | Reason |
|------|-----------|--------|
| `src/app/pos/components/pin-pad.tsx` | PIN digit buttons | Not text inputs — uses button grid, auto-submits on 4th digit |
| `src/app/pos/components/pin-screen.tsx` | PIN entry | Button-based, auto-submits via callback |
| `src/app/pos/components/manager-pin-dialog.tsx` | Manager PIN | Button-based, auto-submits on 4th digit |
| `src/app/pos/jobs/components/flag-issue-flow.tsx` | Issue description textarea (line 312) | Multi-line — Enter creates newline |
| `src/app/pos/jobs/components/flag-issue-flow.tsx` | Custom message textarea (line 722) | Multi-line — Enter creates newline |
| `src/app/pos/components/refund/refund-dialog.tsx` | Refund reason textarea (line 281) | Multi-line — Enter creates newline |
| `src/app/pos/jobs/components/photo-annotation.tsx` | Text label input (line 269) | Already has Enter handler (line 273) |

### Category F — Already Working

| File | Component | Method |
|------|-----------|--------|
| `src/app/pos/components/coupon-input.tsx` | Coupon code input | onKeyDown: Enter -> `handleValidate()`, Escape -> close |
| `src/app/pos/components/quotes/quote-coupon-input.tsx` | Quote coupon input | onKeyDown: Enter -> `handleValidate()` |
| `src/app/pos/components/receipt-options.tsx` | Email input | onKeyDown: Enter -> `handleEmail()` |
| `src/app/pos/components/receipt-options.tsx` | SMS phone input | onKeyDown: Enter -> `handleSms()` |
| `src/app/pos/components/loyalty-panel.tsx` | Partial redeem amount | onKeyDown: Enter -> `handleConfirm()`, Escape -> cancel |
| `src/app/pos/components/ticket-item-row.tsx` | Quantity & note edits | onKeyDown: Enter + Escape |
| `src/app/pos/components/customer-create-dialog.tsx` | All inputs | `<form onSubmit>` |
| `src/app/pos/components/vehicle-create-dialog.tsx` | All inputs | `<form onSubmit>` |
| `src/app/pos/components/ticket-panel.tsx` | Ticket note | onKeyDown handler present |

---

## 2. Admin Pages — Core

### Category A — Search Boxes

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/app/admin/admin-shell.tsx` | 242-250 | Global command palette search | Select item | works | onKeyDown handles Enter to select filtered item |
| `src/app/admin/customers/page.tsx` | ~688 | `<SearchInput>` customer search | Debounced onChange | missing | SearchInput component lacks Enter handler |
| `src/app/admin/jobs/page.tsx` | — | `<SearchInput>` job search | Debounced onChange | missing | Same SearchInput issue |
| `src/app/admin/quotes/page.tsx` | — | `<SearchInput>` quote search | Debounced onChange | missing | Same |
| `src/app/admin/orders/page.tsx` | — | `<SearchInput>` order search | Debounced onChange | missing | Same |
| `src/app/admin/photos/page.tsx` | 638 | Customer search input | Debounced onChange | missing | Custom input, not SearchInput |
| `src/app/admin/photos/page.tsx` | 664 | Text/tag search input | Debounced onChange | missing | Custom input |

**Note:** The `SearchInput` component (`src/components/ui/search-input.tsx`) has no onKeyDown handler. Adding Enter support there would fix all SearchInput instances globally. However, SearchInput drives debounced filtering — Enter would need to either (a) trigger an immediate re-filter or (b) be a no-op since results update live. Evaluate whether Enter adds value for search-as-you-type inputs.

### Category B — Dialog/Modal Forms

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/app/admin/photos/page.tsx` | 805-813 | Bulk tag "Add" popover input | `bulkTagAction('add')` | works | onKeyDown Enter handler |
| `src/app/admin/photos/page.tsx` | 835-843 | Bulk tag "Remove" popover input | `bulkTagAction('remove')` | works | onKeyDown Enter handler |
| `src/app/admin/photos/page.tsx` | 1287-1295 | Photo tag modal input | `addTag()` | works | onKeyDown Enter handler |
| `src/app/admin/settings/card-reader/page.tsx` | 228-233 | Location name input | `handleCreateLocation()` | works | onKeyDown Enter handler |
| `src/app/admin/appointments/components/cancel-appointment-dialog.tsx` | — | Cancel reason | "Confirm Cancel" | works | `<form onSubmit>` |
| `src/app/admin/appointments/components/appointment-detail-dialog.tsx` | — | Reschedule inputs | "Save" | works | `<form onSubmit>` |
| `src/components/ui/confirm-dialog.tsx` | 54-59 | Confirmation text input | "Confirm" button | missing | Not in `<form>`. When `requireConfirmText` is set, Enter should trigger `onConfirm` if text matches |
| `src/components/account/appointment-edit-dialog.tsx` | 199-222 | Date/time inputs | "Save Changes" | missing | No `<form>` wrapping. Only date/time inputs though |
| `src/components/ui/send-method-dialog.tsx` | — | Radio inputs only | — | skip | No text inputs |

### Category C — Standalone Forms (Already Working via `<form>`)

| File | Primary Action | Enter Status | Notes |
|------|----------------|--------------|-------|
| `src/app/admin/customers/new/page.tsx` | "Create Customer" | works | `<form onSubmit>` (line 331) |
| `src/app/admin/customers/[id]/page.tsx` | "Save" | works | `<form onSubmit>` (line 971, 1462) |
| `src/app/admin/staff/new/page.tsx` | "Create Staff" | works | `<form onSubmit>` (line 105) |
| `src/app/admin/staff/[id]/page.tsx` | "Save Changes" | works | `<form onSubmit>` (line 576) |
| `src/app/admin/settings/business-profile/page.tsx` | "Save" (main card only) | works | `<form onSubmit>` (line 388). Other cards (hours, booking, SEO) are NOT form-wrapped |
| `src/app/admin/settings/tax-config/page.tsx` | "Save" | works | `<form onSubmit>` (line 149) |
| `src/app/admin/settings/pos-settings/page.tsx` | "Save" | works | `<form onSubmit>` (line 300) |
| `src/app/admin/settings/mobile-zones/page.tsx` | "Save" | works | `<form onSubmit>` (line 376) |
| `src/app/admin/inventory/vendors/page.tsx` | "Save" | works | `<form onSubmit>` (line 359) |
| `src/app/admin/catalog/services/new/page.tsx` | "Create Service" | works | `<form onSubmit>` (line 274) |
| `src/app/admin/catalog/products/new/page.tsx` | "Create Product" | works | `<form onSubmit>` (line 200) |
| `src/app/admin/catalog/categories/page.tsx` | "Save" | works | `<form onSubmit>` (line 746) |
| `src/app/admin/marketing/automations/new/page.tsx` | "Create" | works | `<form onSubmit>` (line 190) |
| `src/app/admin/marketing/automations/[id]/page.tsx` | "Save" | works | `<form onSubmit>` |
| `src/app/admin/website/pages/[id]/page.tsx` | "Save" | works | `<form onSubmit>` (line 407) |
| `src/app/admin/website/global-blocks/page.tsx` | "Save" | works | `<form onSubmit>` (line 394) |

### Category C — Standalone Forms (MISSING — No `<form>` wrapping)

| File | Inputs | Primary Action | Enter Status | Notes |
|------|--------|----------------|--------------|-------|
| `src/app/admin/settings/shipping/page.tsx` | ~20 inputs across multiple sections | Individual "Save" per section | missing | No `<form>` wrapping. Multi-section page |
| `src/app/admin/settings/receipt-printer/page.tsx` | ~10 inputs | Individual "Save" per section | missing | No `<form>` wrapping |
| `src/app/admin/orders/[id]/page.tsx` | tracking_number, tracking_url, carrier | "Save" | missing | No `<form>` wrapping |
| `src/app/admin/marketing/coupons/new/page.tsx` | Name, code, min purchase, max visits, reward values (~12 inputs) | "Create Coupon" | missing | No `<form>` wrapping. Large multi-section form |
| `src/app/admin/marketing/coupons/[id]/page.tsx` | Various edit inputs | Per-field save | missing | No `<form>` wrapping |
| `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` | ~18 inputs across wizard steps | Step "Next" / "Send" | missing | No `<form>` wrapping. Multi-step wizard — Enter should trigger current step's action |
| `src/app/admin/inventory/purchase-orders/new/page.tsx` | PO fields | "Create PO" | missing | No `<form>` wrapping |
| `src/app/admin/website/homepage/page.tsx` | ~10 settings inputs | Individual "Save" per section | missing | No `<form>`. 5 sections with separate saves |
| `src/app/admin/website/seo/page.tsx` | ~15 SEO meta inputs | "Save" per page | missing | No `<form>` |
| `src/app/admin/website/seo/cities/page.tsx` | ~12 city SEO inputs | "Save" | missing | No `<form>` |
| `src/app/admin/website/hero/[id]/page.tsx` | ~11 hero slide inputs | "Save" | missing | No `<form>` |
| `src/app/admin/website/tickers/[id]/page.tsx` | ~12 ticker inputs | "Save" | missing | Textarea for message — Enter should NOT submit for that field |
| `src/app/admin/website/ads/creatives/[id]/page.tsx` | ~7 ad creative inputs | "Save" | missing | No `<form>` |
| `src/app/admin/website/themes/[id]/page.tsx` | ~19 theme inputs | "Save" | missing | No `<form>` |

### Category D — Inline Edits

| File | Line | Component | Primary Action | Enter Status | Escape? | Notes |
|------|------|-----------|----------------|--------------|---------|-------|
| `src/app/admin/marketing/coupons/[id]/page.tsx` | 409 | Inline coupon code edit | `saveCode()` | works | Yes | onKeyDown: Enter saves, Escape cancels |
| `src/app/admin/staff/roles/page.tsx` | ~210 | Role display_name edit | Save | missing | No | No Enter/Escape handlers |
| `src/app/admin/marketing/promotions/_components/promotion-row.tsx` | 323 | Sale price inputs | Save | missing | No | No Enter/Escape handlers on tier price inputs |
| `src/app/admin/marketing/promotions/_components/promotion-row.tsx` | 605-614 | Sale date inputs | Save | missing | No | No Enter/Escape handlers |
| `src/app/admin/website/footer/page.tsx` | 771, 1223 | Column/link title inline edits | Save | missing | No | No Enter/Escape handlers |
| `src/app/admin/website/team/page.tsx` | 467-501 | Name/role/excerpt inline edits | Save | missing | No | No Enter/Escape |
| `src/app/admin/website/credentials/page.tsx` | 425 | Credential title inline edit | Save | missing | No | No Enter/Escape |

### Category D — Already Working

| File | Component | Method |
|------|-----------|--------|
| `src/app/admin/marketing/coupons/[id]/page.tsx` | Inline code edit | onKeyDown: Enter -> save, Escape -> cancel |
| `src/app/admin/website/team/page.tsx` | Certifications input (line 634) | onKeyDown: Enter -> `addCert()` |
| `src/app/admin/photos/page.tsx` | Pagination "Go to" input (line 1508) | onKeyDown: Enter -> `handleInputSubmit()` |

### Category E — Do Not Touch

| File | Component | Reason |
|------|-----------|--------|
| `src/app/admin/messaging/components/reply-input.tsx` | Reply textarea | Already has Enter-to-send / Shift+Enter for newline (line 44-48) |
| `src/components/ui/vehicle-make-combobox.tsx` | Vehicle make combobox | Enter selects dropdown option — do not override |
| `src/app/admin/settings/reviews/page.tsx` | Review settings inputs | Likely auto-save pattern |

---

## 3. Marketing & CMS

### Category C — Forms Without `<form>` Wrapping

| File | Inputs | Primary Action | Enter Status | Notes |
|------|--------|----------------|--------------|-------|
| `src/app/admin/marketing/campaigns/drip/_components/drip-builder.tsx` | ~5 inputs | "Save" | missing | No `<form>` |
| `src/app/admin/marketing/campaigns/drip/_components/drip-step-card.tsx` | ~5 inputs | "Save Step" | missing | No `<form>` |
| `src/app/admin/marketing/email-templates/[id]/page.tsx` | ~4 inputs (name, subject) | "Save" | missing | No `<form>` |
| `src/app/admin/marketing/email-templates/_components/brand-settings.tsx` | ~9 inputs | "Save" | missing | No `<form>` |
| `src/app/admin/marketing/email-templates/layouts/[id]/page.tsx` | ~3 inputs | "Save" | missing | No `<form>` |
| `src/app/admin/website/footer/page.tsx` | ~20 inputs (column titles, link labels/URLs) | Individual saves | missing | No `<form>`. Mix of inline edits and modal forms |
| `src/app/admin/website/navigation/page.tsx` | ~4 inputs (nav item labels/URLs) | "Save" | missing | No `<form>` |

### Category D — Inline Edits (Missing)

| File | Line | Component | Notes |
|------|------|-----------|-------|
| `src/app/admin/marketing/promotions/_components/quick-sale-dialog.tsx` | ~296 | Sale percentage/amount inputs | Dialog — should be Category B. No `<form>` |

### Category E — Do Not Touch (Rich Text / Toolbar Dialogs)

| File | Component | Reason |
|------|-----------|--------|
| `src/components/admin/content/page-html-editor.tsx` | contentEditable HTML editor | Enter creates new paragraphs |
| `src/components/admin/content/content-block-editor.tsx` | Block editor (12 inputs) | Block management — complex editor |
| `src/components/admin/content/faq-editor.tsx` | FAQ question/answer inputs | Textarea for answers — Enter creates newlines |
| `src/components/admin/content/terms-sections-editor.tsx` | Terms section editor | Textarea content — Enter creates newlines |
| `src/components/admin/content/gallery-editor.tsx` | Gallery caption inputs | Part of complex editor |
| `src/components/admin/content/credentials-editor.tsx` | Credential fields | Part of complex editor |
| `src/components/admin/content/team-grid-editor.tsx` | Team grid fields | Part of complex editor |
| `src/components/admin/toolbar-items/link-dialog.tsx` | Link URL/text inputs | Feeds rich text editor |
| `src/components/admin/toolbar-items/button-dialog.tsx` | Button text/URL inputs | Feeds rich text editor |
| `src/components/admin/toolbar-items/embed-dialog.tsx` | Embed URL input | Feeds rich text editor |
| `src/components/admin/toolbar-items/accordion-dialog.tsx` | Accordion title/content | Feeds rich text editor |
| `src/components/admin/toolbar-items/callout-dialog.tsx` | Callout content | Feeds rich text editor |
| `src/components/admin/toolbar-items/columns-dialog.tsx` | Column content | Feeds rich text editor |
| `src/components/admin/toolbar-items/list-dialog.tsx` | List item inputs | Feeds rich text editor |
| `src/components/admin/toolbar-items/map-embed-dialog.tsx` | Map embed inputs | Feeds rich text editor |
| `src/components/admin/toolbar-items/social-links-dialog.tsx` | Social link URLs | Feeds rich text editor |
| `src/components/admin/toolbar-items/table-dialog.tsx` | Table cell inputs | Feeds rich text editor |
| `src/components/admin/toolbar-items/video-embed-dialog.tsx` | Video URL input | Feeds rich text editor |
| `src/components/admin/html-image-manager.tsx` | Image alt/caption inputs | Part of rich text editor flow |
| `src/app/admin/marketing/email-templates/_components/block-properties.tsx` | ~15 block property inputs | Email block editor — special structured data |
| `src/app/admin/marketing/email-templates/_components/variable-inserter.tsx` | Variable search | Dropdown selection |

---

## 4. Booking & Public Site

### Category B — Dialog/Modal Forms

| File | Line | Component | Primary Action | Enter Status | Notes |
|------|------|-----------|----------------|--------------|-------|
| `src/components/booking/step-confirm-book.tsx` | 631-637 | Coupon code input | "Apply" button | missing | Not in `<form>`. Enter should call `handleApplyCoupon(couponInput)`. Respect `couponLoading` disabled state |

### Category C — Standalone Forms (Already Working via `<form>`)

| File | Primary Action | Enter Status | Notes |
|------|----------------|--------------|-------|
| `src/app/(auth)/login/page.tsx` | "Sign In" / "Send Reset" | works | Two `<form onSubmit>` tags (lines 144, 179) |
| `src/app/(auth)/login/reset-password/page.tsx` | "Reset Password" | works | `<form onSubmit>` (line 58) |
| `src/app/auth/reset-password/page.tsx` | "Set Password" | works | `<form onSubmit>` |
| `src/app/(customer-auth)/signin/page.tsx` | "Send Code" / "Verify" / "Sign In" / "Send Reset" | works | 4 `<form onSubmit>` blocks |
| `src/app/(customer-auth)/signup/page.tsx` | "Create Account" / OTP steps | works | 4 `<form onSubmit>` blocks |
| `src/app/(customer-auth)/signin/reset-password/page.tsx` | "Reset Password" | works | `<form onSubmit>` |
| `src/components/booking/inline-auth.tsx` | Various auth actions | works | 8 `<form onSubmit>` blocks covering all auth flows |
| `src/components/booking/step-payment.tsx` | "Pay & Book" | works | `<form onSubmit>` (Stripe PaymentElement) |
| `src/app/(account)/account/profile/page.tsx` | "Save Changes" | works | `<form onSubmit>` (line 156) |
| `src/components/account/vehicle-form-dialog.tsx` | "Save" | works | `<form onSubmit>` (line 192) |
| `src/app/(public)/checkout/page.tsx` | "Place Order" | works | `<form onSubmit>` (line 262) |

### Category E — Do Not Touch

| File | Component | Reason |
|------|-----------|--------|
| `src/components/ui/vehicle-make-combobox.tsx` | Make autocomplete | Enter selects from dropdown |
| `src/components/booking/step-service-select.tsx` | Service search (if any) | Keyboard navigation for service selection |
| `src/app/(public)/cart/page.tsx` | Quantity input | Number stepper — native behavior |
| `src/app/(account)/account/transactions/page.tsx` | Date filter input | Date input — native behavior |

---

## 5. Shared UI Components

These components are used across the app. Fixing them has global impact.

| File | Component | Category | Enter Status | Notes |
|------|-----------|----------|--------------|-------|
| `src/components/ui/search-input.tsx` | `<SearchInput>` | A | missing | Used by customers, jobs, quotes, orders, staff, drip enrollments. No onKeyDown. **Fix here = fix ~8 search boxes globally.** However, all SearchInput instances drive live filtering — evaluate if Enter adds value beyond what debounce provides |
| `src/components/ui/confirm-dialog.tsx` | Confirmation text input | B | missing | When `requireConfirmText` is set, Enter should trigger confirm if input matches. Not in `<form>` |
| `src/components/ui/input.tsx` | `<Input>` primitive | — | N/A | Thin wrapper — no behavior to add here |
| `src/components/ui/textarea.tsx` | `<Textarea>` primitive | — | N/A | Thin wrapper — no behavior to add here |

---

## 6. Implementation Priority

### Tier 1 — High Impact (POS checkout flow, daily use)

These are used multiple times per day on iPad and blocking the checkout flow:

1. **POS checkout inputs** (4 files, 4 inputs):
   - `tip-screen.tsx` — Enter -> `handleContinue()`
   - `cash-payment.tsx` — Enter -> `handleProcessCash()` (respect `!isValid || processing`)
   - `check-payment.tsx` — Enter -> `handleProcessCheck()` (respect `processing`)
   - `split-payment.tsx` — Enter -> `handleProcessSplit()`

2. **Shared `confirm-dialog.tsx`** (1 file, global impact):
   - Enter -> `onConfirm()` when `!isConfirmDisabled`

### Tier 2 — High Impact (POS search, used constantly)

3. **POS search inputs** (5 files):
   - `search-bar.tsx`, `customer-lookup.tsx`, `transaction-list.tsx`, `quote-list.tsx`, `flag-issue-flow.tsx`
   - Enter triggers immediate search bypassing debounce

4. **POS custom item notes** (2 files):
   - `register-tab.tsx`, `keypad-tab.tsx` — Enter -> add to ticket

### Tier 3 — Medium Impact (Admin forms without `<form>`)

5. **Admin pages missing `<form>` wrapping** (~14 pages):
   - Best approach: wrap each save-button section in `<form onSubmit>` with `e.preventDefault()`
   - Key pages: shipping settings, receipt-printer settings, homepage settings, SEO pages, hero editor, ticker editor, theme editor, coupon creation, campaign wizard, order fulfillment, PO creation

### Tier 4 — Lower Impact (Inline edits, admin search)

6. **Inline edits missing Enter+Escape** (~7 locations):
   - staff roles name, promotion row prices/dates, footer titles, team member fields, credential titles

7. **Admin SearchInput** — evaluate if needed (search-as-you-type already works)

8. **Booking coupon input** — Enter -> apply coupon

### Tier 5 — Skip / Evaluate Later

9. **Marketing email template inputs** — complex editor context
10. **Multi-section settings pages** — may require per-card `<form>` wrapping which is a larger refactor

---

## 7. Recommended Implementation Approach

### Option 1: Shared `useEnterSubmit` hook (for inputs NOT in `<form>` tags)

```typescript
// src/lib/hooks/use-enter-submit.ts
export function useEnterSubmit(onSubmit: () => void, enabled = true) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && enabled) {
      e.preventDefault();
      onSubmit();
    }
  }, [onSubmit, enabled]);
  return { onKeyDown: handleKeyDown };
}
```

**Use for:** POS checkout inputs, coupon inputs, inline edits, search "immediate trigger" handlers.

### Option 2: Wrap in `<form onSubmit>` (for standalone forms)

For admin pages with a single save button and no `<form>`, wrap in `<form>` with the save handler. The browser handles Enter automatically.

**Use for:** Pages like coupon creation, campaign wizard steps, order fulfillment, hero editor, etc.

### Option 3: Fix `SearchInput` component

Add an optional `onEnter` callback prop to `SearchInput` that fires on Enter keypress. Callers can pass a function to trigger immediate search.

### Hybrid approach recommended

- **Tier 1-2:** `useEnterSubmit` hook (quick, surgical fixes)
- **Tier 3:** `<form>` wrapping where possible
- **Tier 4:** Individual onKeyDown handlers with Enter+Escape pattern
