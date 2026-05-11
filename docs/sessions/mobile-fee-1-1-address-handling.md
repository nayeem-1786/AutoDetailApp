# Phase Mobile-1.1 — Address handling

> Builds on Phase Mobile-1 (commit `7056becd`) which introduced a single
> TEXT `mobile_address` column on `appointments` and `quotes`, plus the
> `MobileFeePicker` UI.
>
> Phase Mobile-1.1 adds pre-fill, mandatory validation, an X clear button,
> and save-to-customer with a conflict prompt — across POS walk-in, POS
> quote, and online booking.

## Architecture — Option X+

Per the prior audit (see prompt context), the audit's recommendation was
**Option X+**: keep `mobile_address` as a single TEXT column everywhere,
but introduce a canonical formatter for pre-fill and a best-effort parser
for save-to-customer. The audit recorded these reasons:

- Customers table already has 5 structured columns
  (`address_line_1`, `address_line_2`, `city`, `state`, `zip`), but only
  ~11% of customers have a populated address (Square import data is
  sparse and inconsistent — only ~3% have a state, ~4% zip).
- No downstream consumers of customer address need structured data for
  service-delivery routing today.
- Forcing the cashier through five inputs to type a known address while
  a customer is waiting at the POS is friction with little payoff.
- A future migration to Option Y (fully structured everywhere) is still
  open — the structured columns continue to be the customer record;
  this phase just doesn't promote them to authoritative for mobile
  appointments yet.

Zero schema migration. `appointments.mobile_address`,
`quotes.mobile_address`, and `customers.address_line_1..zip` stay as-is.

## Utilities — `src/lib/utils/format-address.ts`

Three functions plus a server-only helper that uses them:

| Function | Direction | Purpose |
|---|---|---|
| `formatCustomerAddress(customer)` | structured → display | Pre-fill source. Returns `null` when `address_line_1` is empty. Degrades gracefully on partial input (line1 alone returns `"line1"`). State is upper-cased. |
| `parseAddressString(s)` | display → structured | Save-to-customer. Returns `{ confidence: 'high' \| 'low' }`. High when input matches `<line1>[, <line2>], <city>, <STATE> <zip>` with a 2-letter state and 5-digit (or 5+4) zip. Low input is preserved verbatim in `address_line_1` with `address_line_2`/`city`/`state`/`zip` set to `null`. |
| `normalizeAddressForCompare(s)` | both → compare key | Diff detection (LOCKED-5). Lowercases, strips punctuation, collapses whitespace. Two strings producing the same normalized form are treated as "same address" — `"123 Main St."` matches `"123 main st"` without prompting the user. |

Server-only: `src/lib/utils/mobile-address-action.ts` →
`resolveMobileAddressAction(supabase, opts)` performs the silent-save
UPDATE atomically when applicable and returns the
`MobileAddressAction` payload consumed by POS jobs / POS quotes / public
booking endpoints.

### Parser examples

| Input | Confidence | Fields |
|---|---|---|
| `23742 Falena Ave, Torrance, CA 90501` | high | line1=`23742 Falena Ave`, city=`Torrance`, state=`CA`, zip=`90501` |
| `23742 Falena Ave, Apt 4, Torrance, CA 90501` | high | line1, line2=`Apt 4`, city, state, zip |
| `23742 Falena Ave, Torrance, CA 90501-1234` | high | zip=`90501-1234` (zip+4 preserved) |
| `23742 falena ave, torrance, ca 90501` | high | state normalized to `CA` |
| `23742 Falena Ave Torrance California 90501` | low | line1=full string, rest=`null` |
| `23742 Falena Ave, Torrance, California 90501` | low | line1=full string (state must be 2-letter for high) |
| `23742 Falena Ave` | low | line1=full string |
| empty/whitespace | low | line1=`""` |

## Pre-fill timing per path

### POS walk-in & POS quote
`QuoteTicketPanel` (shared between walk-in and quote modes) memoizes
`customerProfileAddress` from `quote.customer` via `formatCustomerAddress`
and passes it to `MobileFeePicker`. The picker's `useEffect` pre-fills
the address input when:
1. The mobile toggle is on
2. The current address field is empty
3. `customerProfileAddress` is non-null

It re-runs when `customerProfileAddress` changes (customer swap mid-ticket),
but preserves a non-empty typed value (LOCKED-10) — the cashier's typed
input wins.

When the cashier flips the toggle ON, the toggle handler seeds the
address from the customer's profile directly (no extra render pass).

The customer-lookup search endpoint (`GET /api/pos/customers/search`)
now selects the structured address columns so the cast-from-SearchResult
to Customer carries them through.

### Online booking
Three sub-cases per LOCKED-8:

| Sub-case | Pre-fill source | Notes |
|---|---|---|
| Portal-logged-in user | `customerData.customer.address_*` from `src/app/(public)/book/page.tsx` | `BookingWizard` initializes `matchedCustomerAddress` from this in the initial state. `formatCustomerAddress` formats it. |
| Guest, matches an existing customer at Step 4 | `check-customer` response now returns `customer.address_*` columns. `BookingWizard.handleConfirmBook` calls `setMatchedCustomerAddress(formatted)`. | Only useful if the user navigates back to Step 2 — Step 2's address field re-renders with the pre-fill value when its own state is currently empty. |
| New guest | None | Customer is created at booking submit; their typed mobile address becomes their first profile address via the silent-save path (LOCKED-7). |

## Save-to-customer per context

### POS (LOCKED-6 Context A)
After `POST /api/pos/jobs` (walk-in) or POS quote save (`POST /api/pos/quotes`
or `PATCH /api/pos/quotes/[id]`), the response includes:

```ts
mobile_address_action: {
  diff: boolean,
  silently_saved: boolean,
  current_profile_address: string | null,
  entered_address: string,
  customer_id: string,
} | null
```

`null` when mobile is off, no customer linked, or the address field is
empty. Otherwise:

- `silently_saved=true` — server already wrote the parsed address to the
  customer record (first-time profile address). Client shows toast
  *"Address saved to customer profile"*.
- `diff=true` — entered ≠ profile. Client opens `SaveAddressDialog`
  (`src/app/pos/components/checkout/save-address-dialog.tsx`).
  **Update profile** PATCHes `/api/pos/customers/[id]/address`;
  **Skip** closes without writing.

The dialog defers navigation/cleanup until close so the cashier always
sees the prompt before the panel transitions.

### Online booking (LOCKED-6 Context B)
`POST /api/book` returns the same `mobile_address_action` shape.
`BookingConfirmation` (the thank-you page):

- `silently_saved=true` — fires a toast on mount.
- `diff=true` — renders an inline banner under the order summary.
  **Update my address** PATCHes `/api/customer/profile/address`;
  **Dismiss** removes the banner. The banner only shows once per render
  (local `bannerDismissed`/`bannerSaved` state).

## New endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `PATCH /api/pos/customers/[id]/address` | POS HMAC (`authenticatePosRequest`) | Save staff-confirmed address from `SaveAddressDialog`. Parses input via `parseAddressString`; low-confidence falls back to `address_line_1 = full input`. Audit-logged. Permission gating for customer edit endpoints is inconsistent across the codebase; full audit + cleanup deferred to staff permissions audit session. |
| `PATCH /api/customer/profile/address` | Customer Supabase session | Save customer-confirmed address from the booking confirmation banner. Verifies the supplied `booking_id` belongs to the authenticated customer (defense-in-depth — the session-derived customer is the actual write target). |

Both endpoints require `entered_address` ≤ 200 chars and reject empty
input. Both run the same parser; both audit/return the updated customer
record.

## Mandatory validation (LOCKED-3)

### Client-side
- POS: `gateMobileAddress()` in `quote-ticket-panel.tsx` is called by
  `handleSaveDraft`, `handleSendQuote`, and `handleCreateJob`. Flips
  `showAddressError` on; picker renders the inline error and red border.
  Cleared as soon as the cashier types.
- Booking: `step-service-select.tsx` `handleContinue` blocks advance when
  mobile is on and address is empty; the field gets red border + inline
  error via `FormField error=` prop.

### Server-side
- `/api/book/route.ts` — `bookingSubmitSchema` is now refined to require
  non-empty `mobile_address` when `is_mobile=true`, capped at 200 chars.
- `/api/pos/jobs` POST — existing trim + 400-empty validation stays.
- `/api/pos/quotes` create/update — `resolveMobileForQuote()` already
  throws `QuoteValidationError` on empty.

## X clear button (LOCKED-4)

Both pickers wrap their address input in `relative` + use absolute X
button (`right-2 top-1/2 -translate-y-1/2`) — mirrors
`src/components/ui/search-input.tsx`. The button is rendered only when
the field has content; click clears + focuses the input via a ref.
ARIA label *"Clear address"*.

## Server data flow changes

| File | Change |
|---|---|
| `src/app/api/book/check-customer/route.ts` | Response now includes `customer: { id, address_line_1, address_line_2, city, state, zip }` on match (or `null` for new customer). |
| `src/app/api/pos/customers/search/route.ts` | Select now includes the 5 address columns so the customer-lookup search result carries them. |
| `src/app/pos/components/customer-lookup.tsx` | `SearchResult` extended with the 5 address fields. |
| `src/lib/quotes/quote-service.ts` | `QUOTE_DETAIL_SELECT` adds `address_line_2` (others were already selected). |
| `src/lib/utils/validation.ts` | `bookingSubmitSchema` refined: mandatory + 200-char cap on `mobile_address`. |

## Permission model

- POS save-to-customer endpoint (`PATCH /api/pos/customers/[id]/address`):
  `authenticatePosRequest` only — mirrors the existing
  `/api/pos/customers/[id]/route.ts` PATCH (which edits name/email/type
  with no further permission gate). Avoids inconsistent UX where the
  cashier can edit name but not address. Permission gating for customer
  edit endpoints is inconsistent across the codebase; full audit +
  cleanup deferred to staff permissions audit session.
- Customer self-edit endpoint (`PATCH /api/customer/profile/address`):
  Supabase session auth (cookie) + booking-ownership check. Customers
  cannot use this endpoint to rewrite someone else's address by
  forging the `booking_id`.

## Integration mental UAT

| Scenario | Path | Expected |
|---|---|---|
| 1 | POS walk-in, mobile=on, customer has no profile address | Job creates; toast *"Address saved to customer profile"*; no dialog. Customer record now has the parsed address. |
| 2 | POS walk-in, mobile=on, customer's profile address matches typed | Job creates; no dialog, no toast. |
| 3 | POS walk-in, mobile=on, customer's profile address differs | Job creates; navigation to `/pos/jobs` deferred; dialog appears with diff. Skip → close + navigate. Update → PATCH + close + navigate. |
| 4 | POS quote save, mobile=on, customer profile differs | Quote saves; dialog appears; same flow. |
| 5 | Online booking, portal user with profile, mobile=on | Step 2 mobile field pre-fills from profile. Banner suppressed on thank-you (matches). |
| 6 | Online booking, portal user, types different mobile address | Submit succeeds; thank-you renders banner; Update my address PATCHes; banner replaced by toast. |
| 7 | Online booking, new guest | Customer created at submit; toast on thank-you *"We've saved your address to your profile."*; no banner. |
| 8 | POS walk-in, mobile=on, address field empty, cashier hits Create Job | Toast error *"Address is required for mobile service"*; picker shows red border + inline error; submit blocked. |
| 9 | Online booking, mobile=on, address empty, hit Continue at Step 2 | Step 2's address gets red border + *"Address is required for mobile service"* error; focus jumps to address; submit blocked. |
| 10 | Cashier swaps linked customer mid-ticket while mobile address has typed text | Picker keeps the typed text (LOCKED-10). New customer's profile address is not used. |

## Deferred

- Customer portal self-edit of structured address (deferred — portal
  profile UI currently edits name/phone/email/consents only).
- Geocoding / Google Places-style address validation (Phase Mobile-2).
- Structured address inputs (5 fields) — staying with single TEXT.
- Reverse-parser for partial addresses like `"Lomita, CA 90717"` — not
  attempted; partial parses remain low confidence and save full string
  into `address_line_1`.
- Voice agent and admin-new mobile paths still hardcode `is_mobile=false`.
- Receipt UX deferred work (Phase 1B).
- Schema migrations (Phase 1.5).

## Receipt baseline scenarios 20 + 21 — skipped

The session prompt called for two new fixtures in
`src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts`
covering pre-fill-matching and diff paths. Receipt rendering does not
consume `mobile_address` or `customers.address_*` — `formatReceipt` /
thermal / HTML emit only the line-item label (`"Zone 1 (0-5 miles)"` or
the custom override label) and customer name/phone. The two scenarios
would produce visually identical fixtures to scenario 18
(`18-online-mobile-deposit`). Coverage for Phase Mobile-1.1 lives in:

- `src/lib/utils/__tests__/format-address.test.ts` (26 cases)
- `src/lib/utils/__tests__/validation-mobile-address.test.ts` (7 cases)
- `src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx` (5 cases)
- `src/app/pos/components/checkout/__tests__/save-address-dialog.test.tsx` (4 cases)
