# Phase Lint-Hardening-1.2 + 1.3 — Leak Fixes + Rule Tightening

> Combined session: fix the 4 genuine phone display leaks from Phase 1.1
> triage, clear the 22 legitimate-opt-out sites mechanically, and tighten
> the `phone/no-raw-display` rule with 5 adjustments that eliminate the
> false-positive bulk.

## Context

The defense-in-depth phone-format stack landed across four prior commits:

- **Normalization-1** (`655d8631`) — chokepoint wire normalization
- **Phone-UX-1** (`426d8ed2`) — canonical display + input formatting
- **Lint-Hardening-1** (`dfd7713f`) — `phone/no-raw-display` ESLint rule at `warn`
- **Schema-Hardening-1** (`30b0947e`) — DB CHECK constraints

After all four shipped, `npx eslint src/` surfaced 90 warnings from the new
rule. Phase 1.1 categorized them — no commit, audit only — as:

- 4 GENUINE_LEAK (real bugs)
- 64 FALSE_POSITIVE (rule too eager)
- 22 LEGITIMATE_OPT_OUT (intentional patterns)
- 0 UNCERTAIN

This session resolves all three categories in one pass.

## Locked Decisions

### LOCKED-1: Fix 4 GENUINE_LEAK sites

| # | File:line | Before | After |
|---|---|---|---|
| 1 | `campaign-wizard.tsx:1744` | `{previewCustomers[previewIndex].phone \|\| 'N/A'}` | `{formatPhone(previewCustomers[previewIndex].phone) \|\| 'N/A'}` |
| 2 | `marketing/compliance/page.tsx:291` | `{c.phone \|\| c.email}` | `{formatPhone(c.phone) \|\| c.email}` |
| 3 | `receipt-printer/page.tsx:623` | `placeholder={defaults.business_phone \|\| 'Business Profile value'}` | `placeholder={formatPhone(defaults.business_phone) \|\| 'Business Profile value'}` |
| 4 | `send-method-dialog.tsx:93` | `{customerPhone \|\| 'No phone on file'}` | `{formatPhone(customerPhone) \|\| 'No phone on file'}` |

Fix #3 also wired `formatPhoneInput()` into the override_phone `onChange`,
added a `normalizePhone()` validation step to `handleSave()` (rejects
invalid phone before persist), reformatted the loaded value as
`(XXX) XXX-XXXX` on initial load, and added an inline error message under
the input when the typed value can't normalize to E.164.

Fix #4 is the high-leverage change — `SendMethodDialog` is consumed by
three flows (`QuoteSendDialog`, `NotifyCustomerDialog`,
`SendPaymentLinkDialog`), so one edit clears the SMS recipient label
across all three.

### LOCKED-2: Wrap 11 `tel:` href sites with `phoneToE164()`

`phoneToE164()` is the rule's documented canonical wrapper for `tel:` /
JSON-LD scheme contexts. It is permissive — returns E.164 if parseable,
input unchanged otherwise — so wrapping is behavior-neutral on already-E.164
input but makes the codebase consistent with the rule's own contract.

Sites (11):
- `src/app/(public)/pay/[token]/page.tsx:354, 408, 456`
- `src/app/(public)/quote/[token]/page.tsx:115`
- `src/app/(public)/terms/page.tsx:115`
- `src/app/authorize/[token]/page.tsx:121, 305`
- `src/components/booking/specialty-vehicle-block.tsx:106`
- `src/components/public/content-block-renderer.tsx:547`
- `src/components/public/footer-client.tsx:252, 327`

Added `phoneToE164` import to each file (none had it previously).

### LOCKED-3..7: Five rule adjustments

`eslint-rules/phone-no-raw-display.js` — file-level documentation block
updated to enumerate each new behavior.

**LOCKED-3 — Skip boolean / ternary test position**
- For `LogicalExpression` with operator `&&`: skip `node.left` (truthy
  guard), inspect `node.right`.
- For `ConditionalExpression`: skip `node.test`, inspect both branches.
- For `LogicalExpression` with operator `||`: behavior is asymmetric, see
  LOCKED-4.

**LOCKED-4 — Special-case `formatPhone(x) || x` and `|| 'literal'` fallbacks**

The `||` operator displays `left` when truthy, `right` when falsy — so
neither side is purely "test". Three sub-cases:

| Pattern | Treatment |
|---|---|
| `formatPhone(x) \|\| anything` | Whole expression is the canonical staff-facing fallback. Left is wrapper (short-circuits); right is intentional. Skip right. |
| `x \|\| Literal` (string/number) | Right is a placeholder (`'No phone'`, `'—'`); left is in test position. Skip left. |
| `x \|\| anything-else` (e.g. `customer.phone \|\| formatPhone(...)`, `format(x) \|\| customer.phone`) | Inspect both sides — catches wrong-order swaps and double-leak patterns. |

**LOCKED-5 — Skip JSX `key={x}` attributes**

React keys are never visibly rendered. The rule's main `JSXExpressionContainer`
visitor now consults a `shouldSkipAttribute()` helper that returns `true`
for any `JSXAttribute` named `key`.

**LOCKED-6 — Skip `<input value={x}>` / `<Input value={x}>` bindings**

Form inputs hold state that tracks user typing (often via
`formatPhoneInput()`), not stored data. The `shouldSkipAttribute()` helper
also matches `JSXAttribute` named `value` when the enclosing
`JSXOpeningElement` is `input` or `Input` (covers shadcn/Radix wrappers).
Conservative — does not match arbitrary component names.

**LOCKED-7 — Remove `cell` and `mobile` from the identifier watchlist**

These two generic identifiers collided with unrelated semantics:
- `cell.getValue()` from TanStack React Table
- `quote.mobile.zone` / `vehicle.mobile.*` from the mobile-fee data model

Compound forms (`cell_phone`, `cellPhone`, `mobile_phone`, `mobilePhone`)
were ADDED to the watchlist as a backstop — they are unambiguous and worth
catching. Bare `cell` and `mobile` are now allowed; this is acceptable
given this codebase's convention of naming phone fields `phone`,
`phone_number`, or `phoneNumber`.

### LOCKED-9: Square import opt-out (single comment)

`src/app/admin/migration/steps/customer-step.tsx:347` — Square CSV import
preview shows pre-normalization phone duplicates in `font-mono` style.
This is an intentional technical surface. Single `// eslint-disable-next-line phone/no-raw-display` with rationale comment.

## Before / After Warning Counts

| Phase | Warnings |
|---|---|
| Phase Lint-Hardening-1 (initial) | 97 |
| After Phase Phone-UX-1 | 90 |
| **After this phase (1.2 + 1.3)** | **19** |

90 → 19 = 71 warnings cleared (79% reduction).

## Remaining 19 Warnings

All 19 fall into 2 patterns, both deferred to Phase Lint-Hardening-1.4:

### Pattern: Prop-pass-through (13)
Parent passes raw phone to a child component that formats internally.
The rule can't follow data flow across function boundaries.

- `src/app/(public)/book/page.tsx:196` → `BookingWizard.businessPhone`
- `src/app/(public)/pay/[token]/page.tsx:364, 371` → `PaidCard` / `LinkPaidCard`
- `src/app/admin/customers/[id]/page.tsx:1716` → `ReceiptDialog`
- `src/app/pos/components/checkout/payment-complete.tsx:101` → `ReceiptOptions`
- `src/app/pos/components/quotes/quote-send-dialog.tsx:88` → `SendMethodDialog`
- `src/components/booking/booking-wizard.tsx:1053` → `SpecialtyVehicleBlock`
- `src/components/jobs/send-payment-link-dialog.tsx:109` → `SendMethodDialog`
- `src/components/quotes/notify-customer-dialog.tsx:91` → `SendMethodDialog`
- `src/components/public/footer-client.tsx:64, 123, 151, 180` (4 internal forwards)

### Pattern: Display of pre-formatted local/prop (5)
The local variable is already formatted via `formatPhone()` or
`formatPhoneInput()` upstream in the same function, or is a prop typed as
"pre-formatted". Static analysis can't see the formatting.

- `src/app/(public)/checkout/page.tsx:1263` (state held formatted via
  `formatPhoneInput`)
- `src/app/admin/appointments/waitlist/page.tsx:310` (local var formatted
  one line up)
- `src/components/public/footer-client.tsx:257, 332` (prop documented as
  "Pre-formatted phone number")
- `src/components/public/header-client.tsx:149` (same)

### Outlier: 1 tel: href not in LOCKED-2 scope
- `src/components/public/header-client.tsx:145` — `tel:${phone}` where
  `phone` is the pre-formatted string `(310) 555-1234`. The spec LOCKED-2
  list did not include this site, so it was not wrapped this session.
  Works in practice (mobile OS strips non-digits before dialing) but is
  not strictly E.164.

**Recommended Phase 1.4 plan:** introduce a branded type
`PreFormattedPhone = string & { __formatted: true }`, mark
"pre-formatted" prop boundaries with the brand, and have the rule honor
the brand. This resolves both the prop-pass and pre-formatted-display
patterns architecturally without per-site opt-outs. Alternative:
per-site `// eslint-disable-next-line` with documented rationale on
each of the 19 sites — quicker but less durable.

## Tests

`eslint-rules/__tests__/phone-no-raw-display.test.js` — total cases
grew from 23 → **38** (+15):

**New valid cases (12):**
- 4 boolean/ternary test position (LOCKED-3): truthy guard, negated
  guard, OR fallback to literal, ternary with wrapped branches
- 2 `formatPhone(x) || x` and `formatPhone(x) || '—'` (LOCKED-4)
- 1 `key={phone}` (LOCKED-5)
- 2 `<input value={phone}>`, `<Input value={phone}>` (LOCKED-6)
- 3 `cell.getValue()`, `quote.mobile.zone`, bare `cell` (LOCKED-7)

**New invalid cases (5):**
- 2 LOCKED-4 negatives: wrong-order fallback, double-leak with non-allowed wrapper
- 1 LOCKED-6 negative: non-input element with `value={x}`
- 2 LOCKED-7 compound forms: `cell_phone`, `mobilePhone`

**Updated cases (3):**
- `computed property access` test moved from `<input value={...}>` context
  (which is now skipped) to `<span>{...}</span>` to keep the coverage
- `logical fallback (raw on left)` test moved to valid suite — its
  `customer.phone || 'N/A'` shape is now intentionally exempt per LOCKED-3
- `employee.cell` test removed — `cell` is no longer in the watchlist per
  LOCKED-7

Full test suite: 903 / 903 passing (was 888).

## Out of Scope (LOCKED-10)

- Severity upgrade from `'warn'` to `'error'` → Phase Lint-Hardening-**1.5**
- Prop-pass-through architectural decision (branded type vs per-site
  opt-out) → Phase Lint-Hardening-**1.4**
- Any other `formatPhone`/`phoneToE164` migration outside the 15 sites
  named in LOCKED-1 + LOCKED-2
- Schema changes
- Migration files

## Files Changed

**Rule + tests (2):**
- `eslint-rules/phone-no-raw-display.js`
- `eslint-rules/__tests__/phone-no-raw-display.test.js`

**LOCKED-1 leak fixes (4):**
- `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx`
- `src/app/admin/marketing/compliance/page.tsx`
- `src/app/admin/settings/receipt-printer/page.tsx`
- `src/components/ui/send-method-dialog.tsx`

**LOCKED-2 `tel:` wraps (8 files, 11 sites):**
- `src/app/(public)/pay/[token]/page.tsx` (3 sites)
- `src/app/(public)/quote/[token]/page.tsx`
- `src/app/(public)/terms/page.tsx`
- `src/app/authorize/[token]/page.tsx` (2 sites)
- `src/components/booking/specialty-vehicle-block.tsx`
- `src/components/public/content-block-renderer.tsx`
- `src/components/public/footer-client.tsx` (2 sites)

**LOCKED-9 single opt-out comment (1):**
- `src/app/admin/migration/steps/customer-step.tsx`

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 903 / 903 passing
- `npx eslint src/ 2>&1 | grep "phone/no-raw-display" | wc -l` — **19**
  (was 90 before this session)
- Remaining 19 are exclusively prop-pass-through and pre-formatted-display
  patterns, deferred to Phase 1.4 per LOCKED-10

## Next Phases

- **Phase Lint-Hardening-1.4** — Resolve the 19 prop-pass-through /
  pre-formatted-display warnings via branded type system or per-site
  opt-outs (decision needed).
- **Phase Lint-Hardening-1.5** — Flip rule severity from `'warn'` to
  `'error'` once Phase 1.4 lands warning count at zero. The TODO comment
  in `eslint.config.mjs` marks the exact line for the flip.
