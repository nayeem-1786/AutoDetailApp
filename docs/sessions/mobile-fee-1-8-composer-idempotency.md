# Phase Mobile-1.8 — Composer idempotency + POS quote detail wiring

> Two display bugs that surfaced during production testing of Phase
> Mobile-1.7 (`35d0fb3d`). One regression introduced by the composer
> rollout, one surface missed in the Phase 1.7 audit. No schema
> changes, no API contract changes — composer behavior change is
> strictly additive (skip-if-already-present) so every other
> Phase 1.7 call site is unaffected.

## Bug A — Duplicate mobile fee on POS jobs detail

**Repro:** Walk-in mobile job for Nayeem Khan (appointment
`524d02a5...`). `jobs.services` JSONB has two entries: Express
Exterior Wash ($75) + Mobile Service (0-3 miles) ($40). Job
appointment row also has `is_mobile=true`, `mobile_surcharge=$40`.
POS jobs detail screen rendered THREE rows totaling $155: Express,
Mobile, Mobile (duplicate). Expected: TWO rows totaling $115.

**Root cause:** Two Phase 1.7-era assumptions collided.

1. Phase Mobile-1 (`/api/pos/jobs/populate`) materializes a mobile
   entry into the `jobs.services` JSONB at job creation, flagged
   `is_mobile_fee: true`. The shape is
   `{ id: null, name: "Mobile Service (0-3 miles)", price: 40,
   is_mobile_fee: true }`. This pre-dates the composer.
2. Phase Mobile-1.7 added `composeLineItems(source, items)` which
   unconditionally appends a synthetic mobile-fee row when
   `source.is_mobile === true` and `mobile_surcharge > 0`. The POS
   jobs detail call site (`pos/jobs/components/job-detail.tsx`)
   passed `job.services` through the composer + the appointment's
   mobile metadata as source. Composer didn't know the input already
   carried the row, so it appended a second one.

The composer mapper at the call site also stripped the
`is_mobile_fee` flag (manual projection: `{ name, quantity,
unit_price, total_price }`), so even an idempotency check on the
output items wouldn't have seen the pre-existing row without
mapper-side preservation.

`quote_items` and `appointment_services` never carry
`is_mobile_fee`, so Phase 1.7 call sites that draw from those tables
remained correct — the bug was unique to `jobs.services`.

## Bug B — POS quote detail page missed in Phase 1.7 audit

**Repro:** Open a mobile quote in POS (Q-0054 type page rendered by
`src/app/pos/components/quotes/quote-detail.tsx`, not the admin
slide-over). Services list iterates `quote_items` directly — no
mobile-fee row visible. Subtotal/Total include the surcharge so the
line-item sum doesn't match.

**Root cause:** Phase 1.7's audit identified the admin slide-over
(`admin/quotes/components/quote-slide-over.tsx`) but not the POS-side
counterpart. They share the same UX pattern (quote header + services
list + totals) but live in different routes; the POS view was
overlooked.

## Idempotency fix — composer detects pre-existing flagged row

```
composeLineItems(source, rawItems):
  1. Map rawItems → DisplayLineItem[]
     - Preserve `is_mobile_fee` strictly: copy onto output iff
       `raw.is_mobile_fee === true`. False / null / undefined stay
       absent (stable contract — renderers branch on `=== true`).
     - Accept `price` field as fallback for unit_price/total_price
       (jobs.services JSONB carries flat `price`, not unit/total).
  2. alreadyHasMobileFee = items.some(item => item.is_mobile_fee === true)
  3. If source.is_mobile === true AND surcharge > 0 AND
     !alreadyHasMobileFee → append synthetic row.
```

Why this is additive:

- `quote_items` and `appointment_services` callers never set
  `is_mobile_fee` on their raw items. `alreadyHasMobileFee` stays
  false; synthetic append fires; behavior identical to Phase 1.7.
- `jobs.services` callers DO set it (per Phase Mobile-1
  materialization). `alreadyHasMobileFee` flips true; synthetic
  append is skipped; the materialized row carries through verbatim.
- Strict `=== true` check means a `false`-flagged row doesn't
  poison the detection — only intentional mobile-fee rows count.

## POS quote detail wiring

`pos/components/quotes/quote-detail.tsx` now imports
`composeLineItems` and renders the services list through it, mirroring
the admin slide-over pattern from Phase 1.7. The component's
`QuoteData` type was widened to include `is_mobile`,
`mobile_surcharge`, `mobile_zone_name_snapshot` — the GET endpoint
already returned them (the quotes detail select is `SELECT *`), the
type was just narrower than reality.

Row keys preserve stability:

- Mobile fee row: `mobile-fee-${idx}` (synthetic — no stable id).
- Other rows: `quote.items[idx].id` (real DB id).

Notes display logic preserved — only real `quote_items` rows can
have a `notes` field; the synthetic mobile-fee row never does.

## What's NOT in this phase (deferred to 1.9)

- Mobile picker UI on the jobs detail card. Currently the only way to
  toggle / change mobile zone is via POS quote/appointment builder
  deep-link. Phase 1.9 will expose the picker directly on the jobs
  detail screen so cashiers can adjust mobile status post-creation
  (with the side-effects this implies for `jobs.services` JSONB,
  appointment row, and any downstream transaction items).
- Editing the materialized `jobs.services` mobile entry inline.
- Custom-amount path on the jobs detail mobile picker.
- SD-006253 backfill (still pending — defer to after Phase 1.8/1.9).

## Files changed

- `src/lib/utils/compose-line-items.ts` — accepts `price` and
  `is_mobile_fee` on `RawLineItem`; mapper preserves
  `is_mobile_fee === true`; idempotency check before synthetic
  append.
- `src/lib/utils/__tests__/compose-line-items.test.ts` — 6 new cases
  covering jobs.services JSONB shape with and without
  `is_mobile_fee`, `price`-field aliasing, quote_items regression,
  false-flagged idempotency edge, full SD jobs-detail repro.
- `src/app/pos/jobs/components/job-detail.tsx` — `JobDetailData`
  services widened to `JobServiceSnapshot[]` so the materialized
  `is_mobile_fee` flag is type-visible; composer call site
  simplified to pass `job.services` directly (composer handles field
  aliasing).
- `src/app/pos/components/quotes/quote-detail.tsx` — imports and
  applies `composeLineItems`; `QuoteData` widened with mobile-fee
  metadata fields; row-key logic mirrors admin slide-over.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` on changed files — clean.
- `npm test` — all tests pass, including 6 new idempotency cases and
  existing Phase 1.7 regression suite.
- Mental check:
  - Job-detail call site → no duplicate (mobile entry present in
    JSONB, composer skips synthetic).
  - Admin quote slide-over → synthetic appended (quote_items doesn't
    carry the flag).
  - Admin appointment dialog → synthetic appended (appointment_services
    doesn't carry the flag).
  - POS quote detail → mobile fee row now visible at end of list.
