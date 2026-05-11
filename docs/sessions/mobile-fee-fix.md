# Mobile fee fix — Option D2 (materialized line item)

**Session date:** 2026-05-11
**Status:** Implementation complete; awaiting `supabase db push` + manual backfill.

## The bug story

Real production booking **SD-006253** exposed a critical data bug:

- Customer booked online: $85 Interior Detail + $60 Pet Hair addon + **$40 Mobile** = **$185** charged at booking via Stripe.
- When staff opened the ticket internally to close it out, only $145 of services appeared. The system computed "we owe customer $40 back" — a phantom refund state.
- Staff manually added a $40 line item titled **"Pet hair clean up"** (item_type='custom') to the close-out transaction **SD-006278** to balance.

The $40 was charged correctly but invisible to every downstream line-item renderer.

### Forensics

| Surface | Stored value | Bug? |
|---|---|---|
| `appointments.mobile_surcharge` | 40 | ✓ correct |
| `appointments.subtotal` / `total_amount` | 185 | ✓ correct |
| `transactions.subtotal` / `total_amount` | 185 | ✓ correct |
| `payments.amount` (Stripe) | 185 | ✓ correct |
| `appointment_services` rows | $85 + $60 = $145 | ❌ no $40 row |
| `transaction_items` rows | $85 + $60 = $145 | ❌ no $40 row |
| `jobs.services` JSONB | $85 + $60 = $145 | ❌ no $40 entry |

The $40 was an aggregate-only fact, never materialized as a renderable line. Every ticket / receipt renderer iterates line-item tables → sees $145 → reports overpayment.

## Architecture decision — Option D2

**Locked:** Materialize the mobile fee as a real `transaction_items` row with `item_type='mobile_fee'`, written by the server at every transaction creation point. Renderers iterate items[] already — zero composer/renderer changes needed for display.

Why D2 over alternatives (per prior audit session):
- **A** (per-zone catalog rows): would double zone maintenance — every zone edit needs a catalog edit.
- **B** (virtual line at render): would require patching 5+ render paths; each can drift.
- **C** (generic modifier system): overkill for one modifier; revisit if other modifiers materialize later.
- **D2** (materialize on write): single source of truth, no render-side fan-out, renderers untouched. Receipt's `Subtotal` line matches `sum(transaction_items.total_price)` by construction.

## Schema changes

Two migrations under `supabase/migrations/` (sequential timestamps so the enum extension commits before the column referencing it):

### `20260511000001_add_mobile_fee_item_type.sql`
```sql
ALTER TYPE transaction_item_type ADD VALUE IF NOT EXISTS 'mobile_fee';
```
Alone in its own file because Postgres requires `ALTER TYPE ... ADD VALUE` to commit outside the transaction that uses it.

### `20260511000002_add_mobile_zone_snapshot_and_quote_mobile.sql`
```sql
ALTER TABLE appointments ADD COLUMN mobile_zone_name_snapshot TEXT NULL;

ALTER TABLE quotes
  ADD COLUMN is_mobile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mobile_zone_id UUID NULL REFERENCES mobile_zones(id) ON DELETE SET NULL,
  ADD COLUMN mobile_address TEXT NULL,
  ADD COLUMN mobile_surcharge NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN mobile_zone_name_snapshot TEXT NULL;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_mobile_consistency CHECK (
    (is_mobile = false AND mobile_surcharge = 0)
    OR (is_mobile = true AND mobile_surcharge > 0)
  );

ALTER TABLE quotes
  ADD CONSTRAINT quotes_mobile_consistency CHECK (
    (is_mobile = false AND mobile_surcharge = 0)
    OR (is_mobile = true AND mobile_surcharge > 0)
  );
```
- `mobile_zone_name_snapshot` survives zone deletion / rename. Receipts read it; they never resolve the FK.
- CHECK constraints verified safe: 0 existing rows violate on either table.

## Three materialization write points

| # | Endpoint | When | Behavior |
|---|---|---|---|
| 1 | `POST /api/book` | Online booking with deposit | Inserts `mobile_fee` row directly when `is_mobile && mobile_surcharge > 0`. |
| 2 | `POST /api/pos/transactions` | Walk-in or quote close-out | **Defensive injection**: looks up linked appointment; if mobile and items[] lacks a matching `mobile_fee` row, injects one. Logs `[mobile-fee] Defensive injection fired for appointment <id>`. |
| 3 | `GET /api/pos/jobs/[id]/checkout-items` | POS ticket load before close-out | Server appends synthetic `mobile_fee` to `items[]` response so cashier sees the line, and it flows back through #2 naturally on submit. Idempotent. |

## Server-side security fix

`POST /api/book` previously trusted the client-supplied `mobile_surcharge`. A tampered request could send `is_mobile=true, mobile_surcharge=0` and skip the fee.

New behavior:
- Anonymous booking clients MUST supply a `mobile_zone_id` matching an existing `mobile_zones` row.
- Server re-fetches the zone, validates `zone.surcharge === client.mobile_surcharge` (with 1¢ tolerance), 400 on mismatch.
- Server snapshots `zone.name` into `mobile_zone_name_snapshot`.

Same validation logic in `POST /api/pos/jobs`, `POST /api/pos/quotes`, `PATCH /api/pos/quotes/[id]` via `resolveMobileForQuote()` helper.

## Walk-in custom override UX (LOCKED-3)

`POS > New Walk-In > Mobile service toggle` shows the picker:

```
Mobile service  [toggle]
  Address  [_________________________]
  Zone     ▼ Select zone…
              Zone 1 (0-5 miles) — $40.00
              Zone 2 (5-10 miles) — $80.00
              Custom…
  [If Custom selected:]
    Surcharge  $[___]    Label  [________]
```

- Zone path: zone re-fetched + validated server-side (same path as booking).
- Custom path: `mobile_zone_id = NULL`. Server trusts staff-supplied surcharge bounded $0 < x ≤ $500. Label defaults to `"Custom"` if blank.

Component: `src/app/pos/components/quotes/mobile-fee-picker.tsx`. Embedded in `QuoteTicketPanel`, so it serves both walk-in mode and quote builder mode without duplication.

## Quote → appointment conversion

`src/lib/quotes/convert-service.ts:73-74` previously hardcoded `is_mobile: false, mobile_surcharge: 0`. Replaced with reads from the quote row:

```ts
is_mobile: quote.is_mobile,
mobile_zone_id: quote.is_mobile ? quote.mobile_zone_id : null,
mobile_address: quote.is_mobile ? quote.mobile_address : null,
mobile_surcharge: quote.is_mobile ? quote.mobile_surcharge : 0,
mobile_zone_name_snapshot: quote.is_mobile ? quote.mobile_zone_name_snapshot : null,
```

No transaction is written at conversion — the materialization happens at close-out via Write Point #2.

## Admin appointment detail dialog

`src/app/admin/appointments/components/appointment-detail-dialog.tsx` previously rendered mobile as a metadata side-note ("Mobile Service: <address> (+$40 surcharge)") below the services list. Now renders the mobile fee as a **participating line item** so the list sums to the appointment subtotal. The address moved to a separate "Mobile Service Address:" line below.

## Tax treatment (LOCKED-2)

Mobile fee is **not** taxable. Per **CDTFA Publication 100**, separately-stated mobile/delivery fees are non-taxable when separately invoiced. Every `transaction_items` insert path sets `is_taxable=false`.

Verified: existing tax math (`src/app/pos/utils/tax.ts`) computes tax from items where `is_taxable=true`, so adding a non-taxable mobile_fee row does not perturb the tax base.

## Test coverage

- 668 tests pass (664 prior + 4 new receipt fixture asserts).
- Two new baseline scenarios:
  - **18** `18-online-mobile-deposit` — SD-006253 post-fix shape ($85 + $60 + $40 Zone 1 = $185, paid in full via Visa).
  - **19** `19-walkin-mobile-custom` — Custom-override path ($80 service + $65 "Custom (PV Estates)" = $145, paid cash).
- HTML + thermal fixtures generated via `npx tsx scripts/capture-receipt-baselines.ts`.

## Backfill (manual, post-deploy)

`scripts/fix-mobile-backfill.sql` — three-step template with verification queries. **Not** auto-run. Steps (all four name writes pull the **current** `mobile_zones.name` at backfill commit time — no hardcoded literal):

1. INSERT `mobile_fee` $40 row on SD-006253's deposit tx (`94773134-…`), `item_name = mobile_zones.name`.
2. UPDATE the manual workaround row on SD-006278 close-out (`565de2ac-…`): `item_type` `custom` → `mobile_fee`, `item_name` `"Pet hair clean up"` → `mobile_zones.name`.
3. UPDATE `appointments.mobile_zone_name_snapshot = mobile_zones.name` for every `is_mobile=true` row (single row in prod today).
4. UPDATE `jobs.services` JSONB to append the synthetic mobile entry on the affected job (`2aec1389-…`), `name = mobile_zones.name`.

All steps wrapped in `BEGIN; ... COMMIT;` block. STEP 2 is commented out by default — uncomment after running STEP 1 verification queries.

**Historical drift note.** SD-006253's mobile zone may have been renamed and/or re-ranged between the original 5/6/26 booking and the deploy of this fix. The backfill uses the **current** zone name — deliberate choice consistent with Option α architecture (snapshot on write). The original receipt emailed/sent to the customer at booking time may have shown a different zone label. For all **future** bookings, the snapshot freezes the zone name at booking time and never drifts. This script's "freeze point" is the backfill run itself; subsequent zone renames don't affect SD-006253's snapshot once this script commits.

## Deferred / out of scope

- **Voice agent** (`/api/voice-agent/appointments`, `/api/voice-agent/quotes`) continues to hardcode `is_mobile=false`. Picker UI deferred to a future phase that touches the voice agent prompt.
- **Admin appointment creation UI**: doesn't exist today. Out of scope here.
- **Distance verification / geocoding** (Phase Mobile-2 deferred): no Google Maps / Mapbox / shop-coordinates today. Customer + cashier self-select zone; that intentional UX stays. A future session can integrate distance verification.
- **Dedicated `pos.process_mobile` permission**: gating piggybacks on existing `pos.jobs.manage` / `pos.process_cash` for now (matches the Phase 1A.5 digital-payment gating pattern).

## File changes

**Migrations:**
- `supabase/migrations/20260511000001_add_mobile_fee_item_type.sql` (new)
- `supabase/migrations/20260511000002_add_mobile_zone_snapshot_and_quote_mobile.sql` (new)

**Servers:**
- `src/app/api/book/route.ts` — zone re-fetch + validation, snapshot zone name, materialize mobile_fee on deposit tx.
- `src/app/api/pos/jobs/route.ts` — accept mobile fields on walk-in; persist to appointment; append mobile entry to `jobs.services`.
- `src/app/api/pos/jobs/populate/route.ts` — same JSONB append for cron-populated jobs.
- `src/app/api/pos/jobs/[id]/checkout-items/route.ts` — synth `mobile_fee` line for display + idempotency.
- `src/app/api/pos/transactions/route.ts` — defensive injection before transaction_items insert.
- `src/app/api/pos/quotes/route.ts` + `[id]/route.ts` — surface `QuoteValidationError` as 400.
- `src/app/api/pos/mobile-zones/route.ts` (new) — POS-auth zone list for picker.
- `src/lib/quotes/quote-service.ts` — `resolveMobileForQuote()` helper; createQuote + updateQuote persist mobile fields.
- `src/lib/quotes/convert-service.ts` — propagate mobile fields to appointment.
- `src/lib/utils/validation.ts` — `transaction_item_type` enum + `quoteMobileFields` schema additions.

**Types:**
- `src/lib/supabase/types.ts` — `Appointment.mobile_zone_name_snapshot`; `JobServiceSnapshot.id` nullable + `is_mobile_fee` flag.
- `src/app/pos/types.ts` — `QuoteMobileState` + reducer actions.

**UI:**
- `src/app/pos/components/quotes/mobile-fee-picker.tsx` (new) — discrete picker component.
- `src/app/pos/components/quotes/quote-builder.tsx` — rehydrate mobile from loaded quote.
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — embed picker; persist mobile through save + walk-in conversion.
- `src/app/pos/components/quotes/quote-totals.tsx` — render Items + Mobile fee + Subtotal breakdown.
- `src/app/pos/context/quote-reducer.ts` — initial mobile state; `SET_MOBILE` / `CLEAR_MOBILE` reducer cases.
- `src/app/pos/utils/tax.ts` — `calculateTicketTotals(...mobileSurcharge)` parameter.
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — mobile fee renders as line item.

**Tests / fixtures:**
- `src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts` — scenarios 18 + 19.
- `src/lib/data/__tests__/__fixtures__/receipt-baselines/18-online-mobile-deposit.{html,thermal.txt}` (new)
- `src/lib/data/__tests__/__fixtures__/receipt-baselines/19-walkin-mobile-custom.{html,thermal.txt}` (new)

**Backfill / docs:**
- `scripts/fix-mobile-backfill.sql` (new)
- `docs/sessions/mobile-fee-fix.md` (this doc)

## Verification (this session)

- `npx tsc --noEmit` — clean
- `npx vitest run` — 39 files, 668 tests pass
- `supabase db push` — **deferred to operator authorization**; migration files in place
- `docs/dev/DB_SCHEMA.md` regen — to run after `supabase db push` lands

## Operator UAT plan (4 paths, dev environment)

1. **Online booking + deposit + Zone 1 mobile**: book through the customer-facing flow; verify the receipt shows three line items summing to subtotal.
2. **Walk-in with Zone 2 selection**: New Walk-In → toggle Mobile → pick Zone 2 → close out → verify ticket and receipt show "Zone 2 (5-10 miles) $80".
3. **Walk-in with Custom override**: New Walk-In → toggle Mobile → pick Custom → enter $55, label "Lomita pickup" → close out → verify line item renders with custom label.
4. **Quote → convert with mobile**: Create a quote with mobile toggled on → convert to appointment from quote detail page → close out → verify mobile fee appears.
