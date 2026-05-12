# Phase Mobile-1.9.1 — Zone-dropdown shows correct selection in edit mode

> Targeted UI fix on top of Phase Mobile-1.9 (`c55bd987`). Production
> testing surfaced that the edit modal's zone dropdown rendered
> "Custom…" as the selected option for valid zone records on the POS
> jobs detail surface, even when the appointment's `mobile_zone_id`
> matched a real, available zone.

## Bug reproduction

1. Open existing mobile job with `mobile_zone_id` pointing to a real
   zone (e.g., "Mobile Service (4-6 miles)" $60).
2. Click ✏️ on the Mobile Service card → edit modal opens.
3. Zone dropdown should show the matching zone selected.
4. **Actual:** Dropdown showed "Custom…" as selected. Save flow still
   worked (admin could pick the correct zone manually), but re-opens
   kept showing "Custom…" for an appointment that was clearly tied to
   a real zone.

Card display elsewhere was correct: zone name + price rendered fine
because they came from `mobile_zone_name_snapshot` + `mobile_surcharge`.
Only the dropdown's matching logic was broken.

## Root cause

Two-layered:

**Primary — POS data path missing `mobile_zone_id`.** The
`JOB_SELECT` constant in `src/app/api/pos/jobs/[id]/route.ts` joined
the appointment with `is_mobile`, `mobile_address`,
`mobile_surcharge`, `mobile_zone_name_snapshot` — but NOT
`mobile_zone_id`. So when `job-detail.tsx` constructed the modal's
`initial` prop, `job.appointment.mobile_zone_id` was `undefined`,
which `?? null` normalized to `null`. The modal's `isCustom`
useState initializer then computed:

```
isCustom = initial.is_mobile      // true
        && !initial.mobile_zone_id // !null → true
        && surcharge > 0           // true
        // → true (Custom path selected)
```

Admin path was unaffected — the admin appointments list uses
`select('*')` on `appointments`, which includes `mobile_zone_id`, so
the initial state was computed correctly there.

**Secondary — no deleted-zone recovery + no zones-load resync.** Even
with the data flow fixed, the modal had no provision for two edge
cases:

- A `mobile_zone_id` that references a zone deleted in Settings
  after the job was created (live zones list doesn't contain it).
  The dropdown would render `<select value="z-deleted">` with no
  matching `<option>` and fall back visually to whatever the browser
  picked (typically the first option).
- The state machine had only synchronous `useState` initialization,
  so the `isCustom` decision was frozen at mount time and couldn't
  re-derive after live zones loaded.

## Fix

### Server (one line)

`src/app/api/pos/jobs/[id]/route.ts:13` — added `mobile_zone_id` to
the appointment join. Same pattern as how Phase 1.6 added
`is_mobile, mobile_address` and Phase 1.7 added
`mobile_surcharge, mobile_zone_name_snapshot` to this same SELECT.
No schema change, no behavior change, no new endpoint — pure data
exposure. LOCKED-4 scope was expanded by operator approval for this
specific case.

### Client — zone-load resync effect

`src/components/jobs/edit-mobile-modal.tsx`:

1. Added a `zonesLoaded` state that flips true ONCE the zones fetch
   completes (success or error). Distinguishes "haven't fetched
   yet" (initial empty array) from "fetched and got empty list" —
   the prior code couldn't tell these apart, which would have caused
   the resync effect to incorrectly trigger Case 2 on first render.
2. Modified the reseed effect to set zone state to provisional
   defaults (`zoneId = initial.mobile_zone_id`, `isCustom = false`).
   The authoritative computation is deferred to the resync effect.
3. Added a resync effect keyed on `[open, zones, zonesLoaded,
   initial]` that derives `(zoneId, isCustom)` from `initial` +
   live zones. Four cases per LOCKED-1:

```
Case 1: initial.mobile_zone_id matches a live zone
        → setZoneId(match.id), setIsCustom(false)

Case 2: initial.mobile_zone_id set but NOT in live zones
        (deleted-zone recovery)
        → setZoneId(null), setIsCustom(true)
        custom inputs already pre-filled from snapshot by reseed
        effect; on save the server writes mobile_zone_id=null

Case 3: initial.mobile_zone_id null + surcharge > 0
        (existing Custom path record)
        → setIsCustom(true), setZoneId(null)
        custom inputs already pre-filled from initial

Case 4: initial.mobile_zone_id null + surcharge = 0 + is_mobile
        (bug state / enable mode reset)
        → leave provisional state (placeholder)
```

Skipped entirely when `!initial.is_mobile` — those opens (modal
closed or 'enable' mode) get a blank picker.

## Edge case — deleted zone

When `mobile_zone_id` references a zone that no longer exists in
the live zones list:

- The modal switches to Custom path.
- The custom label input is pre-filled with the
  `mobile_zone_name_snapshot` so admin sees the historical zone
  label preserved (not blank).
- The custom surcharge input is pre-filled with the snapshot
  surcharge so the dollar amount is preserved.
- Admin can re-pick a fresh zone OR save as Custom.
- On save the server writes `mobile_zone_id = null` (Custom path),
  `mobile_surcharge` preserved, `mobile_zone_name_snapshot`
  preserved.

This preserves the snapshot architecture (Option α — historical
accuracy) while giving admin a recovery path.

## Files changed

- `src/app/api/pos/jobs/[id]/route.ts` — added `mobile_zone_id`
  to the appointment join in `JOB_SELECT`.
- `src/components/jobs/edit-mobile-modal.tsx` — added `zonesLoaded`
  flag; split reseed effect from zone-resync effect.
- `src/components/jobs/__tests__/edit-mobile-modal.test.tsx` —
  5 new cases:
  - Edit mode + matching zone: dropdown selects that zone (not Custom)
  - Edit mode + Custom path record: dropdown selects Custom + inputs
    pre-filled
  - Deleted-zone recovery: defaults to Custom with snapshot pre-fill
  - Enable mode: dropdown stays at placeholder
  - End-to-end save body shape: `mobile_zone_id` flows from matched
    live zone to the save body (regression check for the
    primary-bug fix)

## Verification

- `npx tsc --noEmit` — clean
- `npx eslint` on 3 changed files — clean
- `npx vitest run` — 813 pass (was 808 in Phase 1.9; +5 new)

## Out of scope

- Toast / banner when deleted-zone recovery fires (silent fallback
  per spec; admin notices via the dropdown landing on Custom)
- Visual indicator that the dropdown auto-resolved a stale zone id
- Server-side soft-reject of `mobile_zone_id` referencing a deleted
  zone (the existing zone-id-not-found path covers this on PATCH)
- Any other modal logic

## Reference

- Phase Mobile-1.9 — `c55bd987` — full picker edit + enable
  affordance.
- Phase Mobile-1.7 — JOB_SELECT extended to include
  `mobile_surcharge, mobile_zone_name_snapshot`.
- Phase Mobile-1.6 — JOB_SELECT extended to include `is_mobile,
  mobile_address`.
- This phase — JOB_SELECT extended to include `mobile_zone_id`;
  modal resync effect lands.
