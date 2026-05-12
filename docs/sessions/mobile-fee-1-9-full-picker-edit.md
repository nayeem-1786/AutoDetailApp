# Phase Mobile-1.9 — Full mobile picker edit on jobs detail + admin appointment dialog

> Expansion of Phase Mobile-1.6 (`c1f18883`). Replaces the
> address-only inline edit with the full picker (toggle, zone, custom
> pricing, address) so admin can correct or change mobile state on any
> job after creation. No schema changes — all needed columns exist
> since Phase Mobile-1 D2 materialization (`7056becd`).

## Scope expansion from Phase Mobile-1.6

Phase 1.6 deliberately froze the zone snapshot (`mobile_zone_id`,
`mobile_surcharge`, `mobile_zone_name_snapshot`) post-creation and
only opened `mobile_address` for edit. Rationale at the time:
"Mobile zone change post-creation (refund/credit flow, separate)".
Phase 1.9 reverses that lock now that admin (Nayeem) is the sole
operator and is comfortable handling money implications manually
(LOCKED-1). Server endpoint atomically updates the appointment +
`jobs.services` JSONB and reports a payment mismatch; admin
reconciles via existing refund / send-payment-link flows.

## LOCKED decisions

- **LOCKED-1: Edit everything anytime.** All mobile fields editable
  regardless of job status (scheduled, in-progress, checked-out,
  refunded, voided). No status gating server-side.
- **LOCKED-2: Auto-recalculate `appointment.total_amount`.** Delta
  strategy: `(newSubtotal, newTotal) += (newSurcharge - oldSurcharge)`.
  Tax and discount are preserved — mobile fee is non-taxable
  (LOCKED-2 Phase 1) so the surcharge delta does not perturb the
  tax base.
- **LOCKED-3: Payment-mismatch warning banner.** Non-blocking,
  informational. Triggered when `|newTotal - paidAmount| >= $0.005`.
  Does not auto-refund or auto-charge — admin uses existing flows.
- **LOCKED-4: Modal pattern.** Shared `EditMobileModal` component at
  `src/components/jobs/edit-mobile-modal.tsx`. Mode prop
  (`'pos' | 'admin'`) swaps the auth surface; endpoints have the
  same request/response shape so the submit logic is shared.
- **LOCKED-5: Validation rules.** Identical to creation-time picker
  (`MobileFeePicker`): zone required when on (unless Custom),
  surcharge bounded `0 < x ≤ $500` on Custom path, address required +
  ≤ 200 chars. Validation lives in the shared
  `resolveMobileFields` helper.
- **LOCKED-6: Two server endpoints.** `PATCH /api/pos/appointments/
  [id]/mobile-service` (HMAC POS, `pos.jobs.manage`) and `PATCH
  /api/admin/appointments/[id]/mobile-service` (session admin,
  `appointments.add_notes`). Same body shape, same response.
- **LOCKED-7.5: Picker reads LIVE zones.** Dropdown queries
  `/api/pos/mobile-zones` (or `/api/admin/mobile-zones`) on every
  open — Settings renames / repricing reflect immediately.
- **LOCKED-7.6: Snapshot at save time.** Server re-fetches the zone
  on PATCH and snapshots `mobile_zone_name_snapshot` +
  `mobile_surcharge` from the LIVE row at save time. Historical
  records are frozen against later Settings edits (Option α —
  Phase Mobile-1 architecture).
- **LOCKED-7.7: Historical records unaffected.** Zone renames /
  repricing in Settings do NOT cascade to existing appointments,
  quotes, jobs, transaction_items, or receipts.
- **LOCKED-8: `jobs.services` JSONB sync.** Re-materialized atomically
  with the appointment update. Toggle on appends, toggle off removes,
  zone change rewrites the existing entry (strip all
  `is_mobile_fee=true` rows, then append a fresh one).
- **LOCKED-9: `transaction_items` NOT modified.** Historical receipts
  remain accurate. Mismatch reconciliation is via refund / payment
  link flows.
- **LOCKED-10: Admin appointment dialog parity.** Same modal, same
  validation, same banner. Mode prop swaps the endpoint set.

## Server-side architecture

### Shared resolver (`src/lib/utils/resolve-mobile-fields.ts`)

Extracted from `quote-service.ts:resolveMobileForQuote`. Single
source of truth for the five-field validation now consumed by:

1. `createQuote` / `updateQuote` (quote-service.ts — thin wrapper
   that re-throws as `QuoteValidationError` for backward compat)
2. POS mobile-service PATCH (Phase 1.9)
3. Admin mobile-service PATCH (Phase 1.9)
4. The booking path (`/api/book`) still uses inline validation; it
   could migrate to the helper in a future tidy pass but the path
   is stable.

Throws `MobileFieldsError` on any rule violation. Callers map by
`instanceof`.

### Shared math + JSONB sync (`src/lib/utils/mobile-service-edit.ts`)

Pure functions split from the endpoints so the math is unit
testable in isolation:

- `computeAppointmentDelta` — cents-internal arithmetic to dodge
  float drift; preserves tax/discount by mutating only subtotal +
  total.
- `applyMobileEditToJobServices` — idempotent JSONB sync.
  Strips all `is_mobile_fee=true` entries, conditionally appends a
  fresh one. Handles the defensive "multiple stale entries from
  historical bug" case by collapsing to one row on next edit.
- `computePaidCentsForAppointment` — mirrors
  `attachAmountDueCents` in `/api/pos/jobs/[id]/route.ts`. Sum of
  payments.amount across every transaction linked to the
  appointment.

### Endpoint flow

```
PATCH /api/{pos|admin}/appointments/[id]/mobile-service
  1. Auth + permission gate
  2. resolveMobileFields(body) — zone re-fetch, snapshot live values
  3. Load current appointment row (for delta + audit before-state)
  4. UPDATE appointments (5 mobile fields + subtotal + total +
     updated_at)
  5. For each job linked by appointment_id:
       updatedServices = applyMobileEditToJobServices(...)
       UPDATE jobs.services
  6. paidCents = computePaidCentsForAppointment(appointmentId)
     mismatch_amount = totalCents - paidCents (dollars)
  7. logAudit({ field: 'mobile_service', before, after })
  8. Return { data: { ...saved snapshot }, mismatch_amount }
```

## "Enable mobile service" affordance (LOCKED-7 follow-up)

The original LOCKED-7 statement ("When is_mobile=false: card hidden
entirely") left no UI path to convert a previously non-mobile job
TO mobile. Phase 1.9 follow-up restores creation-time parity by
exposing a discreet "+ Enable" entry point on both surfaces when
the appointment is non-mobile:

```
┌────────────────────────────────────────────┐
│ 📍 Mobile Service               + Enable  │
│ This job is not currently a mobile job.   │
└────────────────────────────────────────────┘
```

Implementation:

- `editingMobile` state is a `'edit' | 'enable' | null` union on
  both `job-detail.tsx` and `appointment-detail-dialog.tsx`.
- Modal's `initial` prop is conditionally swapped: in `'enable'`
  mode it's forced to `is_mobile: true` with blank zone/surcharge/
  address so admin lands in the picker ready to fill in.
- POS gated on `isEditable` (job not in terminal state); admin
  gated on `appointments.add_notes` (same as the edit pencil).
- Server endpoints unchanged — they already accept a transition
  from `is_mobile=false` to `is_mobile=true` via the same flow.

## Modal component (`src/components/jobs/edit-mobile-modal.tsx`)

Reuses the visual + behavior patterns from
`mobile-fee-picker.tsx` (create-time picker) but as a self-contained
modal:

- Toggle, address with X-clear, zone dropdown, Custom-path inputs
- Pre-fills from snapshot props
- Fetches live zones every open (LOCKED-7.5)
- Validates client-side before PATCH (matches server rules to avoid
  round-trip on obvious errors)
- Forwards `mismatch_amount` from response to `onSaved` callback
- Mode prop selects `posFetch + /api/pos/...` vs `fetch +
  /api/admin/...`

## Payment-mismatch banner (`src/components/jobs/payment-mismatch-banner.tsx`)

Non-blocking, dismissable. Signed delta:

- `> 0` → "may need to be charged"
- `< 0` → "may need to be refunded"
- `≈ 0` → banner does not render

Admin reconciles via existing refund / send-payment-link flows.

## Files changed

### New

- `src/lib/utils/resolve-mobile-fields.ts` — shared validation
- `src/lib/utils/mobile-service-edit.ts` — math + JSONB sync helpers
- `src/lib/utils/__tests__/resolve-mobile-fields.test.ts` — 13 cases
- `src/lib/utils/__tests__/mobile-service-edit.test.ts` — 13 cases
- `src/app/api/pos/appointments/[id]/mobile-service/route.ts`
- `src/app/api/admin/appointments/[id]/mobile-service/route.ts`
- `src/app/api/admin/mobile-zones/route.ts`
- `src/components/jobs/edit-mobile-modal.tsx`
- `src/components/jobs/payment-mismatch-banner.tsx`
- `src/components/jobs/__tests__/edit-mobile-modal.test.tsx` — 11 cases
- `docs/sessions/mobile-fee-1-9-full-picker-edit.md` (this file)

### Modified

- `src/lib/quotes/quote-service.ts` — `resolveMobileForQuote` is now
  a thin wrapper around the shared helper; error type re-thrown for
  backward compat. `ResolvedMobile`/`MobileInput` types replaced by
  the imported equivalents.
- `src/app/pos/jobs/components/job-detail.tsx` — Phase 1.6 inline
  address modal removed; expanded Mobile Service card now shows zone +
  surcharge + address from the snapshot, pencil opens
  `EditMobileModal` (mode=pos), payment-mismatch banner renders
  post-save.
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx`
  — same expansion (mode=admin); inline address editor removed.
- `docs/dev/FILE_TREE.md` — new file entries.
- `docs/CHANGELOG.md` — entry.

## Out of scope (LOCKED-11)

- Auto-refund / auto-recharge of payment differences
- Modifying historical `transaction_items` rows
- Email / SMS customer notification of pricing change
- Schema changes (all columns already exist)
- Customer portal self-edit
- Voice agent or admin-new mobile creation paths
- Receipt regen on past transactions
- Audit trail UI (writes occur, no admin viewer)
- Bulk update of historical records on Settings rename / repricing
- Migration of `/api/book` to the shared resolver (works today; not
  load-bearing)

## Verification

- `npx tsc --noEmit` — clean
- `npx eslint` on 10 changed files — clean
- `npx vitest run` — 808 tests pass (was 771 in Phase 1.8; +37 new:
  13 resolve-mobile-fields + 13 mobile-service-edit + 11 modal)

## Reference

- Phase Mobile-1   — `7056becd` — D2 materialization, original
  mobile fields on quotes/appointments, three write points.
- Phase Mobile-1.6 — `c1f18883` — mobile_address display + edit,
  zone explicitly frozen.
- Phase Mobile-1.7 — `35d0fb3d` — `composeLineItems` display
  composer.
- Phase Mobile-1.8 — `c83db631` — composer idempotency + POS quote
  detail wiring.
- Phase Mobile-1.9 — this commit — full mobile picker edit + zone
  unlock + mismatch banner.
