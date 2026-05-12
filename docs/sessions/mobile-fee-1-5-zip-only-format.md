# Phase Mobile-1.5 — Parser Format E + CA state default

> Parser-only follow-up on top of Phase Mobile-1.4 (`86b37793`). No
> schema changes, no API contract changes, no new endpoints.
> `parseAddressString` extended with a second regex pass; one existing
> Phase 1.4 test re-asserted to reflect the new state-defaulting
> behavior.

## The state-less-shorthand bug

Phase 1.4 added support for four address shapes (Formats A–D), all
requiring a 2-letter state code immediately before the zip. Dev UAT
surfaced a fifth common shape that still fell to LOW: cashier typed
`"1234 test st., lomita 90717"` — no state code at all. This is a
realistic single-state shorthand. Smart Details Auto Spa operates
exclusively in California (LOCKED-3); cashiers commonly skip the
state when typing addresses because there is no other state in play.

## Format E (new)

| Format | Example | Phase 1.4 | Phase 1.5 |
|---|---|---|---|
| E — `Line1, City ZIP` | `1234 Main St, Lomita 90717` | LOW | **HIGH** (state defaulted to "CA") |

Apt/line_2 supported via `Line1, Line2, ..., City ZIP`. ZIP+4
preserved. Lowercase input has its case preserved for line_1 and city;
state is always uppercase `"CA"`.

LOCKED-2 stays in force: a comma between street and city is required.
Inputs with no commas anywhere stay LOW even when they end in a
recognizable zip — `"1234 Main St Lomita 90717"` cannot be safely
segmented (where does the street name end and the city begin?) and is
LOW with the full input in `address_line_1`.

## Two-pass strategy

```
trim input
if empty → LOW with line_1=""

Pass 1 — Formats A/B/C/D (Phase 1.4, unchanged):
  match /\s*\b([A-Za-z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)\s*$/
  if matched:
    if remainder.split(",").filter has >= 2 segments → HIGH
    else                                              → LOW
    # explicitly return LOW; do NOT fall through to Pass 2

Pass 2 — Format E (Phase 1.5, new):
  match /\s*(\d{5}(?:-\d{4})?)\s*$/
  if matched:
    if remainder.split(",").filter has >= 2 segments
      → HIGH with state="CA" (LOCKED-3)
    else                                              → (fall through)

LOW with line_1=full input
```

Two important non-fallthrough behaviors:

1. **Pass 1 success-but-LOW does not fall through to Pass 2.** When
   the input has a 2-letter state code at the end but the remainder
   only has one comma-segment (e.g. `"Lomita CA 90717"`), the state
   code was *detected* — falling through to Pass 2 would silently
   replace it with `"CA"` by default. The user's explicit state must
   not be overwritten by an assumption. Per LOCKED-5, return LOW
   (state=null) instead.

2. **Pass 2 partial extractions are discarded on LOW.** If Pass 2's
   regex hits but segmentation fails (e.g. `"Lomita 90717"` with
   single segment), the extracted zip is discarded and the fallback
   returns the full input as `address_line_1` with every other column
   null — including state. Per LOCKED-5: LOW never sets state to "CA";
   only HIGH-confidence Format E does.

## Title-casing on HIGH

HIGH-confidence returns title-case `address_line_1`, `address_line_2`,
and `city` so cashier input casing doesn't propagate into the
customer record. `state` is always uppercased separately. LOW returns
preserve the cashier's typed string verbatim — partial extractions
are already discarded, so re-casing what we couldn't parse would only
distort it.

Implementation: one-line `\b\w+` regex helper that splits on every
non-word character. Examples:
- `"1234 lomita blvd., lomita 90717"` → `line_1="1234 Lomita Blvd."`,
  `city="Lomita"`
- `"456 oak ave, apt 4b, santa monica, ca 90401"` →
  `line_1="456 Oak Ave"`, `line_2="Apt 4b"`, `city="Santa Monica"`

Known lossy edge cases (accepted per user decision):
- `"McDonald"` → `"Mcdonald"` (Mac/Mc names lose interior capital)
- `"Apt 4B"` → `"Apt 4b"` (apartment letters get lowercased)

A real-world dictionary-based capitalizer (Mc/Mac/O' handling, suffix
preservation) is out of scope. Cashier-friendly title-casing trumps
the rare edge cases.

## LOCKED-3: "CA" hardcoded

`state: 'CA'` is a literal in the Pass 2 HIGH return. No
`business_settings` lookup, no env var. Smart Details Auto Spa is a
California business; defaulting to CA is the operational reality.

Multi-state expansion (if ever needed) would require:
- Moving `'CA'` into a config lookup
- Threading the config through the parser (currently
  `parseAddressString` has zero dependencies)
- Updating every caller to provide the business context

That work is deferred — explicitly out of scope per LOCKED-6.

## Phase 1.4 regression — one test re-asserted

The Phase 1.4 test `"LOW: full state name instead of 2-letter code"`
(input `"23742 Falena Ave, Torrance, California 90501"`) changed
outcome under Phase 1.5:

- Phase 1.4: LOW (no 2-letter state code, Pass 1 fails, no Pass 2).
- Phase 1.5: HIGH with `line_1="23742 Falena Ave"`,
  `line_2="Torrance"`, `city="California"`, `state="CA"`,
  `zip="90501"`. Pass 2 matches the zip suffix and segments the
  3-comma remainder.

This is an algorithm artifact. With a state-default strategy, the
parser cannot distinguish `"City, FullStateName"` from
`"Line2, City"` without a state-name dictionary. Phase 1.5 did not
add one (LOCKED-6 stays narrow: no greedy parsing, no extra
heuristics). The new behavior is internally consistent — `"CA"` IS
California's abbreviation, so `formatCustomerAddress` will render the
saved structure back as `"23742 Falena Ave, Torrance, California, CA
90501"`. Cashier guidance: use the 2-letter state code, or omit state
entirely. Typing the full state name produces an oddly-shaped record.

The test was re-asserted with the new HIGH outcome under a renamed
title (`"Phase 1.5 artifact: full state name typed lands in city,
state defaulted to CA"`) and a header comment documenting the
algorithm-artifact rationale. No other Phase 1.4 test changed outcome.

## Test coverage

`src/lib/utils/__tests__/format-address.test.ts`: 33 → 42
`parseAddressString` cases (+9). Total file at 50 tests pass, full
project at 738 (up from 729).

New HIGH coverage (Format E):
- `"1234 Main St, Lomita 90717"` — basic shape, state defaulted
- `"1234 test st., lomita 90717"` — title-cased to "1234 Test St." / "Lomita"
- `"1234 Main St, Apt 4, Lomita 90717"` — with line_2
- `"1234 Main St, Lomita 90717-1234"` — ZIP+4 preserved

New title-case coverage:
- `"2012 lomita blvd., lomita 90717"` — lowercase Format E title-cased
- `"456 oak ave, apt 4b, santa monica, ca 90401"` — Format A line_1 +
  line_2 + city all title-cased
- `"random unparseable text"` — LOW preserved verbatim (no title-casing)

New LOW coverage:
- `"1234 Main St Lomita 90717"` — no comma anywhere
- `"1234 test st. lomita 90717"` — no comma, lowercase
- `"Lomita 90717"` — one segment after zip
- `"90717"` — bare zip
- `"Lomita CA 90717"` — Pass 1 detected state, segments=1; state stays
  null, NOT "CA" (the explicit-state-no-overwrite guard)

Re-asserted (Phase 1.4 regression):
- `"23742 Falena Ave, Torrance, California 90501"` — now HIGH with
  city=California, state=CA-defaulted (artifact, documented)
- `"23742 falena ave, torrance, ca 90501"` — title-cased to
  "23742 Falena Ave" / "Torrance" (was Phase 1.4 "city case preserved")

## Files changed

```
src/lib/utils/format-address.ts                                (+~45 / −~10)
src/lib/utils/__tests__/format-address.test.ts                 (+~85 / −~7)
docs/sessions/mobile-fee-1-5-zip-only-format.md                (this file)
docs/dev/FILE_TREE.md                                          (session doc entry)
docs/CHANGELOG.md                                              (entry)
```

## Out of scope

- Multi-state business configuration (deferred — see LOCKED-3).
- Greedy no-comma parsing — explicitly rejected in LOCKED-2. Inputs
  like `"1234 Main St Lomita 90717"` remain LOW.
- State-name dictionary to distinguish "Line2, City" from
  "City, FullStateName" — deferred; the algorithm-artifact case is
  rare enough that cashier guidance handles it.
- Default `state = "CA"` on new-customer creation forms (cosmetic UI
  default, still deferred from Phase 1.4 — separate issue).
- Customer profile UI state dropdown rendering.
- Migration of historical LOW-confidence records.
- Customer-portal self-edit of address.
- Geocoding integration.

## Reference

- Phase Mobile-1   — `7056becd` — original mobile_fee materialization.
- Phase Mobile-1.1 — `35cb2127` — pre-fill + save-to-customer + mandatory validation.
- Phase Mobile-1.2 — `0633be08` — UAT bug fixes.
- Phase Mobile-1.3 — `9b8d7aca` — pre-fill state recovery.
- Phase Mobile-1.4 — `86b37793` — anchored-from-end parser, Formats A–D.
- Phase Mobile-1.5 — this commit — zip-only Pass 2 + "CA" state default (Format E).
