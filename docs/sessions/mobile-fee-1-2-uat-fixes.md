# Phase Mobile-1.2 — UX fixes from Phase Mobile-1.1 UAT

> Three UX bugs surfaced during dev UAT of Phase Mobile-1.1
> (commit `35cb2127`). No schema, no API contract changes (response
> shapes preserved; one new optional request field added). Builds on
> Phase Mobile-1 (`7056becd`) and Phase Mobile-1.1 (`35cb2127`).

## Bugs and fixes

### BUG-1 — Technical jargon in server validation message

**Symptom.** Two server endpoints surfaced the literal string
`"Mobile service address is required when is_mobile=true"` to the
user when mobile was on but the address field was empty.

**Root cause.** Defense-in-depth error strings written for developer
context — never rewritten for end-user audience.

**Fix.** Both server messages now match the existing client-side
canonical wording: `"Address is required for mobile service"`.
Total: 2 code changes; 4 other locations already used the canonical
text.

| File | Line | Before | After |
|---|---|---|---|
| `src/app/api/pos/jobs/route.ts` | 221 | `Mobile service address is required when is_mobile=true` | `Address is required for mobile service` |
| `src/lib/quotes/quote-service.ts` | 696 | (same) | (same) |

### BUG-2 — Address field doesn't clear when switching to a customer without a profile address

**Symptom.** Cashier links Customer A (with profile address), picker
pre-fills. Cashier swaps to Customer B (no profile address). A's
address remains in the field — would mistakenly send the wrong
service address to the wrong customer.

**Root cause.** Phase Mobile-1.1 LOCKED-10 guard
(`if (mobileAddress.trim().length > 0) return`) blocked overwriting
typed input. But the guard couldn't distinguish auto-prefilled values
from user-typed values.

**Fix — revised LOCKED-10 (LOCKED-A in this phase).** Added
`addressWasAutoPrefilled` state. Behavior on customer swap:

| New customer's profile | Current field | Prior value was auto-prefill | Action |
|---|---|---|---|
| has address | empty | n/a | pre-fill new address |
| has address | non-empty | true (prior pre-fill) | overwrite with new address |
| has address | non-empty | false (user typed) | preserve typed value |
| no address | empty | n/a | nothing to do |
| no address | non-empty | true (prior pre-fill) | **clear the field** |
| no address | non-empty | false (user typed) | preserve typed value |

The flag is flipped TRUE when the effect writes a profile address;
flipped FALSE when the cashier types, pastes, or clicks the X clear
button. Also reset on toggle-off, service-deselect, and
"Remove mobile service" in booking.

Applied to both:
- `src/app/pos/components/quotes/mobile-fee-picker.tsx` (POS)
- `src/components/booking/step-service-select.tsx` (online booking)

### BUG-3 — Misleading validation when no zone is selected

**Symptom.** When mobile was on, address was filled, but the zone
dropdown still showed the "Select zone…" placeholder, attempting to
save produced: `"Custom mobile surcharge must be a positive number
up to $500"`. The cashier hadn't picked the Custom path at all —
the server's `else` branch (meant for Custom validation) was firing
because `mobile_zone_id` was null for *both* "nothing selected" and
"Custom chosen".

**Fix.** Distinguish the two cases on both client and server.

| Condition | New message |
|---|---|
| Mobile on, no zone selected (placeholder), Custom not chosen | `Please select a service area for the mobile fee` |
| Mobile on, Custom path chosen, surcharge empty / 0 / > $500 | `Enter a custom fee between $1 and $500` |

**Server-side disambiguation.** Added optional `is_custom` boolean to
the request payload for POS jobs/quotes write paths. Backward
compatible — when absent, defaults to false (no-zone branch). The
flag mirrors the client `QuoteMobileState.isCustom` already present
in the picker state.

**Client-side gating.** `MobileFeePicker` accepts two new optional
prop flags `showZoneRequiredError` and `showCustomFeeError`. Parent
(`quote-ticket-panel.tsx`) flips them on at submit time when the
corresponding validation fails; clears them as the cashier resolves
the field via the existing reactive onChange wrapper.

**Server validation.** Three paths updated:

| File | Branch | Message |
|---|---|---|
| `src/app/api/pos/jobs/route.ts:249-265` | `else if (rawIsCustom === true)` then `else` | `Enter a custom fee between $1 and $500` / `Please select a service area for the mobile fee` |
| `src/lib/quotes/quote-service.ts:725-741` | matching split via `data.is_custom` | same two messages |
| `src/app/api/book/route.ts:283-288` | no-zone branch (no Custom path in booking) | `Please select a service area for the mobile fee` |

The Zod schema (`validation.ts:quoteMobileFields`) gains an optional
`is_custom: z.boolean().optional()` field for type-checked plumbing.

## Permission-gate cleanup note

The `/api/pos/customers/[id]/address` endpoint introduced in Phase
Mobile-1.1 was originally specced to gate on `pos.process_cash` but
landed using `authenticatePosRequest` only — mirroring the existing
`/api/pos/customers/[id]/route.ts` PATCH that edits name/email/type.
Permission gating for customer edit endpoints is inconsistent across
the codebase; full audit + cleanup deferred to a future staff
permissions audit session.

## Other rewordings (audit-driven)

Five additional user-facing strings cleaned up alongside the three
named bugs:

| File | Before | After |
|---|---|---|
| `src/app/api/pos/customers/[id]/address/route.ts` | `entered_address is required` | `Address is required` |
| `src/app/api/pos/customers/[id]/address/route.ts` | `entered_address must be 200 characters or fewer` | `Address is too long (max 200 characters)` |
| `src/app/api/customer/profile/address/route.ts` | `entered_address is required` | `Address is required` |
| `src/app/api/customer/profile/address/route.ts` | `entered_address must be 200 characters or fewer` | `Address is too long (max 200 characters)` |
| `src/app/api/customer/profile/address/route.ts` | `booking_id is required` | `Booking information is missing — please refresh and try again` |
| `src/app/api/book/route.ts` | `Mobile zone required for online booking` | `Please select a service area for the mobile fee` |

## Borderline messages left alone

These messages reference user-facing concepts (zone, surcharge) but
not internal field/flag names. Acceptable as-is:

- `Invalid mobile zone` (×3 files)
- `Mobile zone is not available` (×3 files)
- `Mobile surcharge mismatch — please refresh and try again` (×3 files)
- `Mobile service is not currently available`

## Test coverage

Added 10 tests total (8 new picker tests + 1 picker test refactor + 1 new
Zod test). All 720 vitest tests pass.

**Picker — `src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx`:**
- Phase 1.1 (5 existing): pre-fill on empty, preserve typed input,
  X clears, inline address-required error, error hides when filled
- Phase 1.2 (9 new): customer-swap clears prior pre-fill, swap-back
  re-pre-fills, A→B overwrites prior pre-fill, typed input preserved
  across swap, post-X-clear swap re-pre-fills, zone-required error
  renders, zone-required suppressed on Custom path, custom-fee error
  renders on invalid surcharge, custom-fee error suppressed on valid
  surcharge

**Zod — `src/lib/utils/__tests__/validation-mobile-address.test.ts`:**
- Phase 1.1 (7 existing): the refinement gates
- Phase 1.2 (1 new): assert refinement message text — `"Address is
  required for mobile service"`, no `is_mobile` / `=true` leak

## Files changed

```
src/app/api/book/route.ts                              (1 message)
src/app/api/pos/jobs/route.ts                          (2 messages + is_custom plumbing)
src/app/api/pos/customers/[id]/address/route.ts        (2 messages)
src/app/api/customer/profile/address/route.ts          (3 messages)
src/app/pos/components/quotes/mobile-fee-picker.tsx    (LOCKED-10 revision + 2 new props)
src/app/pos/components/quotes/quote-ticket-panel.tsx   (expanded gate + new state)
src/components/booking/step-service-select.tsx         (LOCKED-10 revision)
src/lib/quotes/quote-service.ts                        (is_custom + 2 messages)
src/lib/utils/validation.ts                            (is_custom in quoteMobileFields)
src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx (9 new tests)
src/lib/utils/__tests__/validation-mobile-address.test.ts (1 new test)
docs/CHANGELOG.md                                      (entry)
docs/dev/FILE_TREE.md                                  (session doc entry)
docs/sessions/mobile-fee-1-2-uat-fixes.md              (this file)
```

## Out of scope

- New features
- Receipt rendering changes
- Schema changes
- Response-shape changes
- Voice agent + admin-new mobile paths (still deferred from Phase
  Mobile-1)
- Permission-gate cleanup for customer edit endpoints (deferred)
