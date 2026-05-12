# Phase Mobile-1.7 — Mobile fee on quote / appointment display surfaces

> Display-only composer fix on top of Phase Mobile-1.6 (`c1f18883`).
> No schema changes, no migration, no API contract changes. One new
> utility, eight renderer call-sites updated.

## The line-item-sum-doesn't-equal-subtotal bug

Phase Mobile-1 (`7056becd`) materialized `mobile_fee` rows into
`transaction_items` so receipts (POS Copier, thermal, SMS, email)
render a balanced item list. The parallel tables `quote_items` and
`appointment_services` (and the `jobs.services` JSONB) were NOT
given the same treatment — `quote_items` has no `item_type` column
to hold a synthetic-row tag.

Production case Q-0051: `quotes.is_mobile=true`, `mobile_surcharge=$40`,
`mobile_zone_name_snapshot="Mobile Service (0-3 miles)"` stored
correctly. But the quote PDF, public quote page, and quote email all
loop `quote_items` and produce a line-item sum of $75 while the
displayed subtotal reads $115. Customer sees a $40 gap with no line
accounting for it.

Same shape on three additional internal surfaces (admin quote
slide-over, POS jobs detail breakdown, admin appointment dialog —
the last one had an ad-hoc inline append that survived, but the
rendering was uncoordinated with the other surfaces).

## Audit + verification recap

Prior turn's audit and two verifications established the scope:

**Tier 1 — customer-facing, broken, must-fix:**
- Quote PDF (`/api/quotes/[id]/pdf/route.ts`)
- Quote public web page (`(public)/quote/[token]/page.tsx`)
- Quote email (`lib/quotes/send-service.ts` — three internal builders)

**Tier 2 — internal, broken, fix while we're here:**
- Admin quote slide-over (`admin/quotes/components/quote-slide-over.tsx`)
- POS jobs detail services breakdown (`pos/jobs/components/job-detail.tsx`)
- Admin appointment detail dialog (`appointment-detail-dialog.tsx`) —
  refactor the existing ad-hoc append to use the shared composer

**Verify 1 — Print (Copier) receipt path:** ✅ already correct. The
shared `generateReceiptHtml` reads `transaction_items` which carries
the materialized `mobile_fee` row from Phase Mobile-1. Receipt baseline
fixtures `18-online-mobile-deposit` and `19-walkin-mobile-custom` pin
the HTML and thermal forms; byte-equality tests in
`receipt-composer.test.ts` enforce the behavior.

**Verify 2 — Print Quote / Print Appointment / Print Job (copier
paths):** ✅ none exist. `/api/pos/receipts/print-copier` is invoked
exclusively for transaction receipts. Quote PDFs use `pdfkit` and
flow through email links or the access-token URL; the public quote
page has no print button; customer-portal Print button uses
`window.open` + `window.print()` on already-loaded receipt HTML
(same shared renderer).

## Strategy — composer, not migration (LOCKED-1)

```
src/lib/utils/compose-line-items.ts  (new)

  interface MobileFeeSource {
    is_mobile: boolean;
    mobile_surcharge: number | string | null;
    mobile_zone_name_snapshot: string | null;
  }

  interface DisplayLineItem {
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    tier_name?: string | null;
    is_mobile_fee?: boolean;  // stable exported flag for renderers
  }

  function composeLineItems(
    source: MobileFeeSource,
    rawItems: RawLineItem[]
  ): DisplayLineItem[]
```

Behavior:
1. Map raw rows to `DisplayLineItem` (`item_name` or `name` accepted;
   `unit_price` / `total_price` numeric-coerced from string DB values;
   `quantity` defaults to `1`; `tier_name` passes through).
2. If `source.is_mobile === true` AND surcharge > 0 (numeric-coerced),
   append synthetic row at the END with `is_mobile_fee: true`.
3. Synthetic name = `mobile_zone_name_snapshot` (trimmed), else
   `"Mobile Service Fee"` fallback.

Why a composer and not a migration:
- `quote_items` has no `item_type` column — adding one is a schema
  change with backfill. The synthetic-display approach already worked
  in the admin appointment dialog (Phase Mobile-1 Option D2), so the
  pattern is established.
- No risk to historical records: existing quotes / appointments
  render correctly the moment the renderer calls the composer.
- Receipts (the only surface with materialization) stay on their
  current path — no change there.

## Renderer wiring

**Tier 1 — customer-facing:**

| File | Change |
|---|---|
| `src/app/api/quotes/[id]/pdf/route.ts` | Added `is_mobile, mobile_surcharge, mobile_zone_name_snapshot` to the `quotes` SELECT and `QuoteData` interface. Replaced `quote.items.forEach(...)` with `composeLineItems(quote, quote.items).forEach(...)`. Items now reference `item.name` (was `item.item_name`). |
| `src/app/(public)/quote/[token]/page.tsx` | Loop runs through composer output. For sale-aware display fields (`pricing_type`, `standard_price`, `notes`), the renderer looks up the original `quote_items` row via index alignment — composer preserves order and appends the synthetic row at the end, so `displayItems[idx]` for `idx < quote.items.length` maps cleanly to `quote.items[idx]`. The synthetic row has no sale fields. |
| `src/lib/quotes/send-service.ts` | Composed once at the call site; the three private email builders (`buildItemsTableHtml`, `buildEmailText`, `buildEmailHtml`) now accept `DisplayLineItem[]` and read `i.name`. |

**Tier 2 — internal:**

| File | Change |
|---|---|
| `src/app/admin/quotes/components/quote-slide-over.tsx` | Items section renders `composeLineItems(quote, quote.items)`. |
| `src/app/pos/jobs/components/job-detail.tsx` | `JOB_SELECT` extended with `mobile_surcharge, mobile_zone_name_snapshot` on the appointment relation; `JobDetailData` interface mirrors. `displayServices` computed once from the appointment's mobile fields + `job.services` (mapped to the composer's raw shape). Both render copies (editable / read-only) iterate `displayServices`. `servicesTotal` re-derived from the composed list so the total matches the visible rows. |
| `src/app/admin/appointments/components/appointment-detail-dialog.tsx` | Existing ad-hoc inline append (lines 249-258 pre-1.7) refactored to a single `composeLineItems(appointment, services.map(...))` call. Visual output identical (synthetic row at end with same name fallback and same currency formatting). |

## What `quotes.is_mobile` and friends look like on the type

The hand-written `Quote` interface in `src/lib/supabase/types.ts`
predated Phase Mobile-1 D2 and was missing the mobile columns
(`Appointment` had them; `Quote` did not). Added in this phase:

```ts
export interface Quote {
  // ... existing fields ...
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_address: string | null;
  mobile_surcharge: number;
  mobile_zone_name_snapshot: string | null;
  // ... relations ...
}
```

This unblocks `composeLineItems(quote, ...)` typing without `as`
casts. The DB columns themselves are unchanged — they've existed
since Phase Mobile-1; only the TypeScript surface was stale.

## Synthetic row position + styling

Position: **bottom of the array, no separator.** Matches the existing
admin-appointment-dialog convention (which itself derived from the
Phase Mobile-1 Option D2 receipt design). Renderers loop the result
in order — the synthetic row falls into the last `<tr>` / `<div>`.

Styling: **visually identical to a regular item row for now.**
Renderers MAY branch on `displayItem.is_mobile_fee === true` for
future treatment (italic, label, dim background, etc.) — the flag
is exported on the type as a stable contract. Out of scope this
session per LOCKED-5.

## Test coverage

`src/lib/utils/__tests__/compose-line-items.test.ts` — 17 tests:
- Non-mobile source: items unchanged, no synthetic row
- Mobile source with valid surcharge: synthetic row appended at END
- `is_mobile=true` but `surcharge=0` / `null` / `"NaN"`: no synthetic
- `mobile_zone_name_snapshot=null` / empty / whitespace: name falls
  back to `"Mobile Service Fee"`
- `mobile_surcharge` as DB string `"40.00"`: numeric-coerced to `40`
- Empty `rawItems` with mobile source: returns only synthetic row
- Empty `rawItems` with non-mobile source: returns empty array
- Both `item_name` and `name` field shapes accepted; `item_name`
  wins when both set
- `quantity` defaults to `1` when missing
- `unit_price` / `total_price` as DB strings: coerced to numbers
- `tier_name` passes through (incl. `null`)
- Synthetic row contract: `tier_name=null`, `is_mobile_fee=true`
- Q-0051 verbatim regression: $75 items + $40 mobile = 3 rows
  summing to $115

Total: 765 vitest tests pass (was 748 in Phase 1.6; +17 composer
tests).

No new tests for the rendering call-sites — PDF / HTML visual diffs
are hard to byte-test cheaply, and the composer is the only logic
that needed exercising. The admin appointment dialog refactor is a
visual no-op (same fallback name, same currency formatting); manual
regression check during dev UAT.

## Files changed

```
src/lib/utils/compose-line-items.ts                                (new)
src/lib/utils/__tests__/compose-line-items.test.ts                 (new)
src/lib/supabase/types.ts                                          (Quote: +5 mobile fields)
src/app/api/quotes/[id]/pdf/route.ts                               (Tier 1)
src/app/(public)/quote/[token]/page.tsx                            (Tier 1)
src/lib/quotes/send-service.ts                                     (Tier 1 — 3 email builders)
src/app/admin/quotes/components/quote-slide-over.tsx               (Tier 2)
src/app/api/pos/jobs/[id]/route.ts                                 (JOB_SELECT: +mobile_surcharge, +mobile_zone_name_snapshot)
src/app/pos/jobs/components/job-detail.tsx                         (Tier 2)
src/app/admin/appointments/components/appointment-detail-dialog.tsx (Tier 2 refactor)
docs/sessions/mobile-fee-1-7-display-composer.md                   (this file)
docs/dev/FILE_TREE.md                                              (new files entries)
docs/CHANGELOG.md                                                  (entry)
```

## Out of scope

- Schema migration to add `item_type` column to `quote_items`.
- Materialization of `mobile_fee` rows in `appointment_services` or
  `jobs.services` JSONB.
- Customer portal appointment cards line-item display (cards show
  only total).
- POS quote builder ticket panel items list (`QuoteTotals` adjacent
  component already shows mobile fee — cashier UX is already complete).
- Quote SMS / online booking confirmation / detailer SMS — no per-
  line enumeration on these surfaces; total already includes
  surcharge.
- Visual styling differentiation for the synthetic row.

## Future extension path

If a schema migration ever materializes `mobile_fee` rows in
`quote_items` / `appointment_services` (mirroring `transaction_items`):
1. Add `item_type` column to `quote_items` and `appointment_services`.
2. Backfill historical rows.
3. Update write paths to insert the `mobile_fee` row at quote /
   appointment creation.
4. Drop `composeLineItems` call sites OR keep them as a defensive
   layer that becomes a no-op when the table-side row exists.

The composer's `is_mobile_fee` flag would survive the migration —
it lets each renderer branch its rendering whether the row arrives
from the table or the composer.

## Reference

- Phase Mobile-1   — `7056becd` — original mobile_fee materialization in transaction_items.
- Phase Mobile-1.1 — `35cb2127` — pre-fill + save-to-customer + mandatory validation.
- Phase Mobile-1.2 — `0633be08` — UAT bug fixes.
- Phase Mobile-1.3 — `9b8d7aca` — pre-fill state recovery.
- Phase Mobile-1.4 — `86b37793` — parser Formats A–D.
- Phase Mobile-1.5 — `74ed5cbd` — parser Format E + CA default + title-case.
- Phase Mobile-1.6 — `c1f18883` — addressesDiffer + mobile_address display/edit on POS/admin.
- Phase Mobile-1.7 — this commit — display composer for quote / appointment surfaces.
