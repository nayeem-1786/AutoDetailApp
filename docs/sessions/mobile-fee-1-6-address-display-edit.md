# Phase Mobile-1.6 — Mobile address display + edit + canonical diff

> UI + endpoint + diff-helper follow-up on top of Phase Mobile-1.5
> (`74ed5cbd`). No schema changes, no migration. Two concerns landed
> in one commit:
>
>  - **Concern 1** — replace the "concat + `normalizeAddressForCompare`"
>    diff path in `mobile-address-action.ts` with a structured
>    field-by-field comparison via the new `addressesDiffer` helper.
>  - **Concern 2** — surface `appointments.mobile_address` on the POS
>    jobs detail page and the admin appointment dialog, with an edit
>    affordance on both surfaces backed by two new PATCH endpoints.

## Concern 1 — canonical structured-field diff (`addressesDiffer`)

`mobile-address-action.ts:resolveMobileAddressAction` is the single
helper that decides whether the save-to-customer prompt fires on a
mobile-service write. Pre-1.6 it ran both sides through
`normalizeAddressForCompare` (lowercase + strip punctuation +
collapse whitespace on the full string). That worked for most cases
but was vulnerable to false positives when the customer's stored
fields didn't round-trip through `formatCustomerAddress` to a
character-identical string as what the cashier typed — e.g. when
line_2 punctuation differed, or when the cashier omitted commas the
formatter would have inserted.

**The fix.** A new exported helper in `format-address.ts`:

```ts
export function addressesDiffer(
  customer: CustomerLike,
  enteredString: string
): boolean {
  const parsedEntered = parseAddressString(enteredString);
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  return (
    norm(customer.address_line_1) !== norm(parsedEntered.address_line_1) ||
    norm(customer.address_line_2) !== norm(parsedEntered.address_line_2) ||
    norm(customer.city)           !== norm(parsedEntered.city)           ||
    norm(customer.state)          !== norm(parsedEntered.state)          ||
    norm(customer.zip)            !== norm(parsedEntered.zip)
  );
}
```

Both sides go through `parseAddressString` for the entered side
(canonical extraction; title-cased line/city; uppercased state;
"CA" default on Format E) and direct field reads for the customer
side. The `norm` per-field lowercases + trims for case- and
whitespace-insensitive equality. Reuses the existing `CustomerLike`
type — no new type needed.

**Swap site.** `mobile-address-action.ts` line 98 — one call site
changes from the two `normalizeAddressForCompare` calls to a single
`addressesDiffer(profile, entered)`. The 4 server endpoints listed
in the original spec (`/api/pos/jobs/route.ts`,
`/api/pos/quotes/route.ts`, `/api/pos/quotes/[id]/route.ts`,
`/api/book/route.ts`) all reach the diff path through this helper,
so swapping at the helper covers all four endpoint surfaces in a
single change.

**`normalizeAddressForCompare` retained.** Still exported as a
general loose-string utility; its tests stay; nothing else in the
codebase consumes it for diff detection. A comment block on the
function points future readers at `addressesDiffer` for new diff
use cases.

**Test coverage.** Seven new `addressesDiffer` cases in
`format-address.test.ts`:
- The bug case (Format B entered vs structured profile) → false
- Street differs between entered and profile → true
- Both sides empty/null → false
- Case-insensitive equivalence → false
- Whitespace tolerance → false
- Profile line_2 present, entered omits it → true
- Format E (no state) entered vs CA-state profile → false
  (Phase 1.5's CA default makes this correctly match)

## The invisible-address bug

`appointments.mobile_address` is stored at job creation (Phase
Mobile-1) but was never surfaced on the post-creation work surfaces:

| Surface | Pre-1.6 state | Real-world impact |
|---|---|---|
| POS jobs detail page | Mobile fee shows as a service line item; address text is nowhere on the page | Detailer dispatched to a mobile job has no way to see where to drive |
| Admin appointment dialog | Read-only one-line display only | Cashier can't fix typos; customer phone corrections have no admin path |

This phase adds a display section + edit affordance on both surfaces.
The zone snapshot (`mobile_zone_id`, `mobile_surcharge`,
`mobile_zone_name_snapshot`) stays locked at creation time per the
Phase Mobile-1 design — only the address text can change post-creation.

## Endpoints (LOCKED-C)

Two dedicated PATCH endpoints, one per audience. Single-purpose
endpoints — they only touch `appointments.mobile_address` and the
`updated_at` timestamp.

```
PATCH /api/pos/appointments/[id]/mobile-address
  Auth:       authenticatePosRequest
  Permission: pos.jobs.manage (mirrors the cashier-edit-job pattern)
  Body:       { mobile_address: string }, trimmed, ≤200, non-empty
  Guards:     existence + is_mobile=true
  Audit:      action="update", details={field, before, after}

PATCH /api/admin/appointments/[id]/mobile-address
  Auth:       getEmployeeFromSession
  Permission: appointments.add_notes (mirrors the notes-edit gate on
              the same admin dialog)
  Body:       same shape, same validation
  Guards:     same
  Audit:      same shape, source="admin"
```

Two endpoints rather than a unified one because the POS appointment
endpoints (notify, send-payment-link) already use the `[id]/<action>`
shape, and admin appointment edits today go through
`/api/appointments/[id]` PATCH (a different namespace and auth path
than `/api/admin/*`). Single-purpose endpoint isolates the
permission gate (admin uses `appointments.add_notes`, POS uses
`pos.jobs.manage`) and the audit shape from the broader
`appointments` update path.

**Defense in depth:** both endpoints reject when `is_mobile=false`.
The UI doesn't expose the edit on non-mobile jobs, but a guard at
the server prevents bypass.

**Permission-gate note.** The admin endpoint uses
`appointments.add_notes` as a pragmatic match for the established
notes-edit pattern on the same dialog (the notes textareas directly
below this card use the same gate). A broader permission-gating
audit for customer-edit and appointment-edit endpoints remains on
the deferred staff permissions audit queue — originally flagged
in Phase Mobile-1.2's "permission-gate cleanup note" — and is out
of scope here.

**LOCKED-D:** the edit does NOT trigger the Phase Mobile-1.1
save-to-customer prompt. That flow is for *create-time* address
capture; post-creation edits are explicit and don't need a re-prompt.

## POS jobs detail page

Layout: new section inserted between "Services" and "Timing", only
rendered when the linked appointment is mobile. Same optimistic-with-
revert flow as the admin dialog — the card flips immediately on
Save, reverts the visible `mobile_address` on the local `job` state
if the PATCH fails, and re-opens the modal with the typed text so
the cashier can retry.

```
┌──────────────────────────────────────────────────┐
│ 📍 Mobile Service Address                    ✏️ │
│ 2021 Lomita Blvd., Lomita, CA 90717             │
└──────────────────────────────────────────────────┘
```

Implementation follows the existing Notes pattern in
`job-detail.tsx`:
- `editingMobileAddress` state toggle
- `mobileAddressValue` for the input
- `savingMobileAddress` for the button state
- Pencil tap → opens a bottom-sheet/centered modal with text input,
  X clear button, Cancel/Save buttons
- Save calls `PATCH /api/pos/appointments/{appointmentId}/mobile-address`
- Optimistic local merge so the card reflects the new value without
  re-fetching the entire job

When `isEditable` is false (terminal-state jobs: completed, closed,
cancelled), the card renders read-only with no pencil — same gating
as Notes and other editable fields on this page.

`GET /api/pos/jobs/[id]` extends the joined appointment select to
include `is_mobile, mobile_address` so the data is available
client-side without an extra round-trip.

## Admin appointment detail dialog

Layout: the previously-read-only display block at the top of the
dialog is replaced with an editable card. Pencil swaps the read view
for an inline input + Save/Cancel buttons. Visibility is gated on
`canAddNotes` (matching the existing notes textarea on this dialog).

Optimistic update with revert via `mobileAddressOverride`:
- On Save click, override is set to the typed value immediately and
  the editor closes — the card flips to the new value before the
  request resolves.
- On failure (network error or non-OK response), the override is
  restored to its prior value, the editor re-opens with the typed
  text intact, and an error toast surfaces. The cashier can retry
  or cancel without losing what they typed.

The card visually distinguishes itself from the existing read-only
metadata grid (bordered box + map-pin icon) so the edit affordance
is discoverable without redesigning the whole dialog.

**Terminal-state edits allowed (admin).** The admin endpoint
intentionally does NOT gate on appointment status — historical
corrections to completed or cancelled appointments are part of the
use case (typo found post-completion, customer phoned in a fix on a
finished job). The corresponding POS endpoint is the same, but the
POS UI gates the edit at `isEditable` (`status not in
[completed/closed/cancelled]`), which the user described as an
acceptable UX choice for the cashier surface. Admin always edits.

## Out of scope

- Audit log surfaced in the customer-facing UI (server-side audit
  trail IS captured per the LOCKED endpoint specs above; admin
  audit-log page already reads these entries)
- Customer portal self-edit of mobile address (LOCKED-E — deferred)
- Map link / geocoding on display (Phase Mobile-2)
- Mobile zone change post-creation (refund/credit flow, separate)
- Multi-state config (still deferred from Phase 1.5 LOCKED-3)

## Files changed

```
src/lib/utils/format-address.ts                               (+addressesDiffer; doc on normalizeAddressForCompare)
src/lib/utils/mobile-address-action.ts                        (diff call site → addressesDiffer)
src/lib/utils/__tests__/format-address.test.ts                (+7 addressesDiffer tests)
src/app/api/pos/appointments/[id]/mobile-address/route.ts     (new)
src/app/api/admin/appointments/[id]/mobile-address/route.ts   (new)
src/app/api/pos/jobs/[id]/route.ts                            (JOB_SELECT: +is_mobile, +mobile_address)
src/app/pos/jobs/components/job-detail.tsx                    (display section + edit modal + optimistic+revert state)
src/app/admin/appointments/components/appointment-detail-dialog.tsx
                                                              (read-only block → editable card + optimistic+revert handler)
docs/sessions/mobile-fee-1-6-address-display-edit.md          (this file)
docs/dev/FILE_TREE.md                                         (session doc + endpoint entries)
docs/CHANGELOG.md                                             (entry)
```

## Testing

748 vitest tests pass (was 741 in Phase 1.5; +7 new `addressesDiffer`
cases). No new endpoint unit tests for the two PATCH routes: the
directly-analogous `/api/pos/customers/[id]/address` and
`/api/customer/profile/address` PATCH endpoints have no unit tests
in this codebase either, so this session matches that precedent.
Validation is straightforward (`trim`, length ≤200, `is_mobile=true`
check); endpoint integration is validated by dev UAT.

## Reference

- Phase Mobile-1   — `7056becd` — original mobile_fee materialization.
- Phase Mobile-1.1 — `35cb2127` — pre-fill + save-to-customer.
- Phase Mobile-1.2 — `0633be08` — UAT bug fixes.
- Phase Mobile-1.3 — `9b8d7aca` — pre-fill state recovery.
- Phase Mobile-1.4 — `86b37793` — anchored-from-end parser (Formats A–D).
- Phase Mobile-1.5 — `74ed5cbd` — zip-only Pass 2 + CA default + title-case.
- Phase Mobile-1.6 — this commit — mobile_address display + edit on POS / admin.
