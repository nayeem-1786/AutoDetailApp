# Phase Mobile-1.4 — Address parser format improvements

> Parser-only follow-up on top of Phase Mobile-1.3 (`9b8d7aca`). No
> schema changes, no API contract changes, no new endpoints. Single
> function rewritten in `src/lib/utils/format-address.ts` plus test
> coverage for three additional input formats.

## The wedged-format bug

Dev UAT after Phase Mobile-1.3 surfaced a parser problem unrelated to
the auto-prefill state machine. A cashier typed
`"2021 Lomita Blvd., Lomita CA 90717"` as a mobile-service address.
The Phase 1.1 silent-save flow routed this through
`parseAddressString`, which classified it as **LOW confidence** —
falling back to `address_line_1 = <whole string>`, with every other
structured column left null.

Root cause: the Phase 1.1 parser split the entire input on commas and
required `segments.length >= 3` (street, city, "ST ZIP"). The user's
input has only one comma — Lomita commonly omits the comma between
city and state — so it never reached HIGH confidence.

Static review revealed three real-world formats falling through to
LOW for the same reason or close to it:

| Format | Example | Phase 1.1–1.3 verdict |
|---|---|---|
| A — `Line1, City, ST ZIP` | `123 Main St, Torrance, CA 90501` | HIGH ✓ |
| B — `Line1, City ST ZIP` | `2021 Lomita Blvd., Lomita CA 90717` | LOW ✗ |
| C — `Line1, City, ST, ZIP` | `23742 Falena Ave, Torrance, CA, 90501` | LOW ✗ |
| D — `Line1, City, ST ZIP-NNNN` | `123 Main St, Torrance, CA 90501-1234` | HIGH ✓ |

Format B is the most common — it's what real cashiers type at the
ticket panel when they bother to use commas at all. Format C is the
canonical legacy shape from the Square CSV import (`{city}, {state},
{zip}` was a separate cell in Square exports). Format D was already
covered by the old regex's ZIP+4 group, so this phase just verifies
it still works under the rewrite.

## Strategy: anchored-from-end

The Phase 1.1 strategy was "split by comma, then check trailing
segment shape." That conflates two questions — *where does the
state/zip suffix end?* and *how many comma-separated segments are
there?* — and forces both to share the same delimiter assumptions.

Phase 1.4 reverses the order. The parser first locates the
state-code + zip suffix anchored at the end of the trimmed input
using a single regex:

```ts
/\s*\b([A-Za-z]{2})\s*,?\s*(\d{5}(?:-\d{4})?)\s*$/
```

Breakdown:
- `\s*\b` — optional leading whitespace, then a word boundary.
  Prevents matching a 2-letter substring buried inside a longer word
  (e.g. `Lo` inside `Lomita`).
- `([A-Za-z]{2})` — the state code; uppercased on extract.
- `\s*,?\s*` — optional whitespace, optional comma, optional
  whitespace between state and zip. This single token covers
  `CA 90501` (Format A/B), `CA, 90501` (Format C), and `CA,90501`
  (rare typo).
- `(\d{5}(?:-\d{4})?)` — 5-digit zip with optional `-NNNN` suffix
  (Format D).
- `\s*$` — trailing whitespace, then end of string.

Once the suffix is located, the parser slices it off and splits the
remainder on commas. `filter(Boolean)` drops empty pieces caused by
trailing commas, so no separate "strip trailing comma" branch is
needed.

The segmentation rule is simple:
- `segments.length === 2` → `line_1 = segments[0]`, `city =
  segments[1]`, `line_2 = null`.
- `segments.length >= 3` → `line_1 = segments[0]`, `city =
  segments[last]`, `line_2 = segments.slice(1, -1).join(', ')`
  (handles `"123 Main St, Apt 4, Torrance, CA 90501"` and any
  number of interior segments).
- `segments.length < 2` → LOW (a single segment cannot disambiguate
  street from city without a comma).

HIGH confidence requires both: the state+zip suffix was extracted
AND the remainder has at least 2 comma-separated segments.

## LOW-confidence behavior — unchanged

Per LOCKED-2, the LOW-confidence fallback is byte-identical to Phase
1.1:

```ts
{
  address_line_1: <trimmed input>,
  address_line_2: null,
  city: null,
  state: null,
  zip: null,
  confidence: 'low',
}
```

If the input could not be parsed to HIGH, the entire trimmed string
lands in `address_line_1` and every other structured column stays
null. Downstream consumers (silent-save flow in
`mobile-address-action.ts`, save-to-customer dialog in the POS) treat
this as "the cashier's text is the address — save it verbatim, ask
nothing." This phase did not alter that contract.

Two notable LOW-trip cases beyond malformed input:
- `"CA 90501"` alone — state+zip suffix matches but the remainder
  before it is empty. No street or city to attribute → LOW with the
  full input as `address_line_1`.
- `"123 Main St Torrance CA 90501"` — state+zip suffix matches but
  the remainder has no commas. Cannot safely split street from city
  → LOW.

Both cases match the spirit of the old "preserve typed value, mark
LOW" contract.

## Test coverage

`src/lib/utils/__tests__/format-address.test.ts` rewritten from 12
`parseAddressString` cases to 17. All `formatCustomerAddress` and
`normalizeAddressForCompare` tests preserved unchanged.

New HIGH-confidence coverage:
- Format B single-comma — `"2021 Lomita Blvd., Lomita CA 90717"`,
  `"1785 W. 220th St, Torrance CA 90501"`, `"12 A St, B City CA
  90501"` (short street/city names).
- Format C Square import — `"23742 Falena Ave, Torrance, CA, 90501"`.
- Aggressive whitespace tolerance — `"  123 Main St ,  Torrance ,
  CA   90501  "`.

New LOW-confidence coverage:
- `"123 Main St Torrance CA 90501"` (no commas anywhere).
- `"CA 90501"` (state+zip alone, no street/city).
- `"Random text 90501"` (trailing digits, no state code).

Existing cases preserved (Format A canonical, line_2 apartment, ZIP+4,
state-case normalization, full state name → LOW, malformed zip → LOW,
empty / whitespace / random text fallbacks, surrounding whitespace
trim).

Total: 729 vitest tests pass (33 in this file).

## Files changed

```
src/lib/utils/format-address.ts                                (−~30 / +~30)
src/lib/utils/__tests__/format-address.test.ts                 (−~50 / +~80)
docs/sessions/mobile-fee-1-4-parser-improvements.md            (this file)
docs/dev/FILE_TREE.md                                          (session doc entry)
docs/CHANGELOG.md                                              (entry)
```

## Out of scope

- Default `state = "CA"` in new-customer creation forms (cosmetic UI
  default; tracked as a separate follow-up).
- Customer profile UI state dropdown rendering.
- Backfill / migration of historical records that landed at LOW
  confidence under the Phase 1.1 parser — those records keep their
  current shape until a customer next edits the address or the
  scheduled backfill script runs.
- Customer-portal self-edit of address.
- Geocoding integration.
- Anything beyond `parseAddressString` and its tests.

## Reference

- Phase Mobile-1   — `7056becd` — original mobile_fee materialization.
- Phase Mobile-1.1 — `35cb2127` — pre-fill + save-to-customer + mandatory validation.
- Phase Mobile-1.2 — `0633be08` — UAT bug fixes.
- Phase Mobile-1.3 — `9b8d7aca` — pre-fill state recovery.
- Phase Mobile-1.4 — this commit — parser format improvements.
