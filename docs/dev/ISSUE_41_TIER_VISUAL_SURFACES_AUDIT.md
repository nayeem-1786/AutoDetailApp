# Issue 41 — Tier Visual Surface Rendering Audit (2026-05-26)

> Read-only diagnostic audit. Verifies every surface that renders
> `quote_items.tier_name` (or related `appointment_services.tier_name` /
> `transaction_items.tier_name`) across the codebase, characterizes
> current behavior + per-surface constraints, and recommends a unified
> two-helper architecture serving BOTH Issue 39's chip composition AND
> Issue 41's per-line visual rendering.
>
> Companion to `docs/dev/ISSUE_39_SERVICES_CHIP_AUDIT.md`. This audit's
> deliverable feeds the COMBINED Issue 39 + Issue 41 implementation
> session that follows (recommended as a sequenced 2-session split per
> memory feedback-parallel-doc-sessions-use-worktree and scope-threshold
> sizing — see Target 8).
>
> No source code modified. Evidence cited inline with `file:line` refs.

---

## TL;DR

**Surface count: 15 visual surfaces render `tier_name` as a raw
snake_case slug to humans today.** Issue 39's audit Target 9
identified 5 of them; this audit identifies **10 NEW surfaces**
across receipt-template rendering (3 receipts × 1 helper file × 2
render sites), appointment-confirmation notify routes (2 routes × 2-3
contexts each), POS transaction detail, public pay page, and admin
quote detail page. The customer-facing failure mode is uniform across
all of them: customer sees `"per_row"`, `"floor_mats"`,
`"touring_bagger"`, etc. instead of the operator-curated `tier_label`
or pluralized `qty_label`.

**Recommended architecture: Option U (two-layer helper split).** A
new low-level `renderTierToken(item) → string | null` extracted into
`src/lib/quotes/tier-display.ts` becomes the single rendering source
of truth — returns "Per Seat Row" / "2 Rows" / null. Issue 39's
`formatServicesSummary` (the chip helper) consumes it internally for
its parenthetical content. The 15 visual surfaces consume
`renderTierToken` directly, wrapping the returned token in the
surface-appropriate format (em-dash for receipt page, parens for
admin slide-over, dedicated PDF column, monospace ` - ` for thermal
print, `<span>` for HTML, etc.). The surface-wrapping presentation
stays at the surface; the token VALUE is centralized. Mirrors Session
71's `line-item-pricing.ts` precedent (predicate + label helper
separate from per-surface rendering).

**Combined implementation scope: split into 2 sequenced sessions**
(memory threshold: ~300 LOC or >3 files = split; combined estimate
crosses both). Session 1 = helpers + Issue 39 chip adoption (foundation,
~30 tests, 90-120 min). Session 2 = Issue 41 visual surface adoption
(~15 adoption sites, ~25 tests, 90-120 min). Sequenced (not parallel)
to honor the parallel-session worktree-fragility lesson learned during
the D43 A/B/C arc (~today). Sessions do not need to fire on the same
day; Session 2 only fires after Session 1 lands the helpers.

**Memory #15 (4 receipt surfaces) honored:** of the 4 POS receipt
surfaces (Print/Copier, SMS, Email HTML, Receipt thermal), 3 share
`src/app/pos/lib/receipt-template.ts` (Print/Copier + Email HTML +
Receipt thermal all consume `generateReceiptHtml` and/or
`generateReceiptLines`). The 4th — SMS receipt — uses
`buildSummaryLine()` which renders "vehicle — total" only and never
references `tier_name`. **Effective receipt-surface edits: 2 sites
in 1 file** (`receipt-template.ts:599-600` thermal +
`receipt-template.ts:1063-1064` HTML), reaching all 3 tier-rendering
receipt consumers. Memory #15's "touch all 4" discipline is satisfied
by the audit-time verification that surface #4 needs no change (the
SMS receipt doesn't render tier_name).

**Issue 41 is the same architectural class as Issue 39**, different
surface. Issue 39 = "the chip `{services}` reads only `item_name`,
duplicates on multi-tier same-service". Issue 41 = "the per-line
display reads only `tier_name`, surfaces the raw slug". Both are
fixed by exposing tier_label / qty_label via a shared rendering
helper that joins the right `service_pricing` data and applies the
operator-locked rendering rules.

**Customer-visible TODAY:** Q-0084's quote link
(`/quote/<token>`) renders `"per_row"` and `"floor_mats"` raw slugs
in muted text under the service name. Q-0084's receipt page (when
the quote converts and is paid) will render `" — per_row"` em-dashed.
Any appointment confirmation email from a multi-tier same-service
quote will render `"(per_row)"` / `"(floor_mats)"` in the services
table — both customer-facing HTML emails and plain-text fallback
bodies.

**Issue 42 (newly surfaced):** the **public pay page**
(`src/app/(public)/pay/[token]/page.tsx:290-291`) renders
`appointment_services.tier_name` raw — a customer-facing
checkout-stage surface NOT mentioned in any prior audit. Captured
here as a discovered Issue 41 sub-surface (no separate Issue 42
ticket needed; covered by Issue 41's helper adoption).

---

## Root cause statement

Across 15 customer-facing or operator-facing visual surfaces, the
inline rendering pattern is identical:

```ts
{item.tier_name && <span>... {item.tier_name}</span>}
// or
${item.item_name} - ${item.tier_name}
// or
doc.text(item.tier_name || '-', colTier, …)  // PDF
```

Each surface reads `quote_items.tier_name` (or the parallel column on
`appointment_services` / `transaction_items`) and renders the
snake_case slug verbatim. None of these surfaces JOIN
`service_pricing.tier_label` / `qty_label` / `display_order` — the
operator-curated human-readable presentation data exists on
`service_pricing` but is invisible to every visual surface today.

This is the SAME root-cause class as Issue 39's chip composition bug
(also rendering raw data because no shared helper joins the
presentation columns) at a different layer (per-line display, not
chip composition).

---

## Empirical evidence

**Operator source inspection 2026-05-26 (confirmed by source-quoted
operator brief):**

```ts
// src/app/(public)/quote/[token]/page.tsx:268-269
{displayItem.tier_name && (
  <div className="text-xs text-site-text-muted">{displayItem.tier_name}</div>
)}

// src/app/(public)/receipt/[token]/page.tsx:236-238
{item.tier_name && item.tier_name !== 'default' && (
  <span className="text-site-text-muted font-normal"> — {item.tier_name}</span>
)}
```

Both render `tier_name` (snake_case slug) directly to customers —
confirmed against current source on `main` (commit `8f01f3a7`, post
D43 Session C merge — Issue 38 fully shipped, so multi-tier
same-service quotes are now writable + customer-facing).

**Q-0084 reproduction (post-D43-deploy):**

After Session C deployed, a multi-tier Hot Shampoo Extraction quote
writes:
- `quote_items[0]: item_name="Hot Shampoo Extraction", tier_name="floor_mats", quantity=1, unit_price=75, total_price=75`
- `quote_items[1]: item_name="Hot Shampoo Extraction", tier_name="per_row", quantity=2, unit_price=125, total_price=250`

The quote DATA is correct (subtotal $325). The 15 visual surfaces
render `floor_mats` and `per_row` as raw slugs. Customer sees: row 1
labeled `"Hot Shampoo Extraction"` with sub-text `"floor_mats"`, row 2
labeled `"Hot Shampoo Extraction"` with sub-text `"per_row"`. The
operator-curated `tier_label` values (`"Floor Mats Only"`, `"Per Seat
Row"`) live on `service_pricing` but never reach any surface.

---

## Detailed findings per target

### Target 1 — Full inventory of `tier_name` rendering surfaces

Empirical grep (raw count: 437 `tier_name` references across `src/`;
filtered to rendering-context candidates only). The 15 rendering
surfaces:

#### Customer-facing (10 surfaces, 11 sites)

| # | File:line | Surface | Output context | Current rendering | Data source | tier_label joined? |
|---|---|---|---|---|---|---|
| 1 | `src/app/(public)/quote/[token]/page.tsx:268-269` | Public quote page | Web HTML | `<div>{displayItem.tier_name}</div>` (muted text) | `displayItem` derived from `quote_items` join; SELECT widened needed | NO |
| 2 | `src/app/(public)/pay/[token]/page.tsx:290-291` | Public pay page | Web HTML | ` — {line.tier_name}` (em-dash inline) | `appointment_services` via `appointments` route load | NO |
| 3 | `src/app/(public)/receipt/[token]/page.tsx:237-238` | Public receipt page | Web HTML | ` — {item.tier_name}` (em-dash inline) | `transaction_items` via receipt-data.ts | NO |
| 4 | `src/app/api/quotes/[id]/pdf/route.ts:304` | Quote PDF | PDFKit Helvetica column | `doc.text(item.tier_name \|\| '-', colTier, …)` | `quote_items(…, tier_name, …)` SELECT at line 536 | NO |
| 5 | `src/app/api/appointments/[id]/notify/route.ts:96` | Appointment confirm email (template HTML) | Email HTML | `({s.tier_name})` in services table row | `appointment_services` via admin notify | NO |
| 6 | `src/app/api/appointments/[id]/notify/route.ts:137` | Appointment confirm email (fallback plain text) | Email plain text | `(${s.tier_name})` after service name | same | NO |
| 7 | `src/app/api/appointments/[id]/notify/route.ts:160` | Appointment confirm email (fallback HTML) | Email HTML | `({s.tier_name})` in services table row | same | NO |
| 8 | `src/app/api/pos/appointments/[id]/notify/route.ts:102` | POS appointment confirm email (HTML) | Email HTML | `({s.tier_name})` in services table row | `appointment_services` via POS notify | NO |
| 9 | `src/app/api/pos/appointments/[id]/notify/route.ts:146` | POS appointment confirm email (plain text) | Email plain text | `(${s.tier_name})` after service name | same | NO |
| 10 | `src/app/pos/lib/receipt-template.ts:599-600` | Receipt thermal (generateReceiptLines) | Monospace thermal text | `${item.item_name} - ${item.tier_name}` | `transaction_items` via receipt-data.ts | NO |
| 11 | `src/app/pos/lib/receipt-template.ts:1063-1064` | Receipt HTML (generateReceiptHtml) | Email HTML / Print HTML | `${esc(item.item_name)} - ${esc(item.tier_name)}` | same | NO |

Surfaces #10-11 share one file and serve 4 of 4 receipt consumers (3
of which render tier_name; SMS receipt does not).

#### Operator-facing (4 surfaces)

| # | File:line | Surface | Output context | Current rendering | Data source |
|---|---|---|---|---|---|
| 12 | `src/app/admin/quotes/components/quote-slide-over.tsx:161-162` | Admin quote slide-over | Web HTML | `({item.tier_name})` (muted parens) | `quote_items` join in admin quotes page |
| 13 | `src/app/admin/quotes/[id]/page.tsx:405-406` | Admin quote detail page | Web HTML | `<div>{item.tier_name}</div>` (muted text) | same |
| 14 | `src/app/pos/components/quotes/quote-detail.tsx:557-558` | POS quote detail | Web HTML | `<p>{item.tier_name}</p>` (muted text) | `quote_items` via POS quote fetch |
| 15 | `src/app/pos/components/transactions/transaction-detail.tsx:276-277` | POS transaction detail | Web HTML | `({item.tier_name})` (muted parens inline) | `transaction_items` via POS transactions fetch |

**Total: 15 surfaces, 11 customer-facing + 4 operator-facing.**

**Receipt-template.ts is 1 file with 2 render sites serving 4
receipt consumers** (Print/Copier, Email HTML, Customer Receipt HTML,
Print Server thermal — all funnel through `generateReceiptHtml` or
`generateReceiptLines`). Verified via:

```
$ grep -rln 'generateReceiptHtml\|receiptToPlainText\|generateReceiptLines' src/ | grep -v __tests__
src/app/admin/settings/receipt-printer/page.tsx     (admin preview)
src/app/api/pos/receipts/print-copier/route.ts      (uses generateReceiptHtml)
src/app/api/pos/receipts/html/route.ts              (uses generateReceiptHtml)
src/app/api/pos/receipts/email/route.ts             (uses generateReceiptHtml)
src/app/api/pos/receipts/print-server/route.ts      (uses generateReceiptLines)
src/app/api/customer/receipts/html/route.ts         (uses generateReceiptHtml)
src/app/pos/lib/receipt-template.ts                 (defines all)
```

### Target 2 — The 4 receipt surfaces (memory #15)

Memory #15: any receipt content change requires touching all 4
surfaces. Per-surface tier_name handling:

| # | Receipt surface | Code path | Tier_name rendered? | Effective edit site |
|---|---|---|---|---|
| 1 | **Print / Copier** | `print-copier/route.ts:44` → `generateReceiptHtml()` | YES (line 1063-1064 of receipt-template.ts) | `receipt-template.ts:1063-1064` |
| 2 | **SMS** | `sms/route.ts:107` → `renderSmsTemplate('receipt_sms', { summary_line, … })` via `buildSummaryLine()` | **NO** — receipt SMS body is "vehicle — total" + link; no item list, no tier rendering | (no edit needed) |
| 3 | **Email HTML** | `email/route.ts:37` → `generateReceiptHtml()` | YES (line 1063-1064 of receipt-template.ts) | `receipt-template.ts:1063-1064` |
| 4 | **Receipt thermal** | `print-server/route.ts:35` → `generateReceiptLines()` | YES (line 599-600 of receipt-template.ts) | `receipt-template.ts:599-600` |

**Memory #15 compliance:** 2 edits in 1 file (`receipt-template.ts`)
cover surfaces #1, #3, #4. Surface #2 (SMS) intentionally renders no
tier — verified at `src/lib/sms/composites.ts:113-136`
(`buildSummaryLine` reads only `vehicle.year/make/model` + `total`,
never touches items). The "4 surfaces" rule is honored by the
audit-time verification step: surface #2 explicitly inspected and
documented as no-change.

**Public receipt page** (`(public)/receipt/[token]/page.tsx:237-238`)
is a SEPARATE customer-facing React render — it's the web view of the
receipt that the customer sees via the receipt link in their SMS, NOT
the POS-generated print/email. This is **surface #3 from the
customer-facing inventory above**, distinct from the 4 POS-receipt
surfaces. Counted once in Target 1.

### Target 3 — Re-verification of Issue 39's Target 9 (5 visual surfaces)

Issue 39's audit listed 5 surfaces; all 5 confirmed against current
`main` source:

| Issue 39 claim | Verified location | Verified line | Match |
|---|---|---|---|
| Public quote page | `src/app/(public)/quote/[token]/page.tsx:268-269` | 268-269 | ✓ |
| Admin slide-over | `src/app/admin/quotes/components/quote-slide-over.tsx:161-162` | 161-162 | ✓ |
| POS quote detail | `src/app/pos/components/quotes/quote-detail.tsx:557-558` | 557-558 | ✓ |
| Quote PDF | `src/app/api/quotes/[id]/pdf/route.ts:304` | 304 | ✓ |
| Public receipt | `src/app/(public)/receipt/[token]/page.tsx:236-238` | 237-238 (line shifted +1) | ✓ |

All 5 still hold. Issue 39's audit was correct; this audit's wider
net adds 10 more surfaces.

### Target 4 — Wider net (surfaces missed by Issue 39's Target 9)

Cast wider with `grep -rn 'tier_name' src/app/ src/lib/ src/components/` +
content-context inspection. New surfaces discovered:

#### Discovered: admin quote DETAIL page (NEW)

`src/app/admin/quotes/[id]/page.tsx:405-406` — distinct from the
slide-over component. Issue 39's audit named the slide-over but not
the detail page; both render `tier_name` raw.

```ts
{item.tier_name && (
  <div className="text-xs text-gray-500">{item.tier_name}</div>
)}
```

#### Discovered: public PAY page (NEW)

`src/app/(public)/pay/[token]/page.tsx:290-291` — customer-facing
checkout stage when the customer pays an appointment online (separate
from the quote/receipt pages). Uses `appointment_services.tier_name`
not `quote_items.tier_name`.

```tsx
{line.tier_name && line.tier_name !== 'default' && (
  <span className="text-site-text-muted"> — {line.tier_name}</span>
)}
```

**This surface is Issue 42-class (separate ticket).** Captured here
as part of Issue 41's helper adoption — no new helper or audit
needed.

#### Discovered: appointment confirmation notify routes (NEW)

Two routes with nearly-identical code (admin + POS variants):

- `src/app/api/appointments/[id]/notify/route.ts`:
  - Line 96: template HTML services table row (`({s.tier_name})`)
  - Line 137: hardcoded plain-text email fallback (`(${s.tier_name})`)
  - Line 160: hardcoded HTML email fallback (`({s.tier_name})`)

- `src/app/api/pos/appointments/[id]/notify/route.ts`:
  - Line 102: HTML services table row (`({s.tier_name})`)
  - Line 146: plain-text email fallback (`(${s.tier_name})`)

These render `appointment_services.tier_name` (NOT
`quote_items.tier_name`) — the data is copied from `quote_items` at
quote-conversion time via `convert-service.ts`. The helper must
accept either source.

#### Discovered: POS thermal + HTML receipt rendering (NEW)

`src/app/pos/lib/receipt-template.ts`:
- Line 599-600 (`generateReceiptLines`, thermal): `${item.item_name} - ${item.tier_name}`
- Line 1063-1064 (`generateReceiptHtml`, HTML): `${esc(item.item_name)} - ${esc(item.tier_name)}`

These flow through `transaction_items` (post-payment) and serve all 3
non-SMS receipt consumers (Print/Copier, Email HTML, Receipt thermal).

#### Discovered: POS transaction detail (NEW)

`src/app/pos/components/transactions/transaction-detail.tsx:276-277`
— operator viewing a past transaction in POS sees raw `({item.tier_name})`.

#### Surfaces NOT to fix (out of scope confirmed)

- **Admin quote LIST page** (`src/app/admin/quotes/page.tsx:347-349`):
  composes `itemNames.slice(0, 2).join(', ')` with `+N` overflow.
  This is a chip-style summary (Issue 39's surface, NOT a per-line
  tier rendering). Issue 39's helper covers this. Not an Issue 41
  surface.
- **Voice agent paths**
  (`voice-post-call.ts:508`, `voice-agent/quotes/route.ts:282/328/349`,
  `voice-agent/appointments/route.ts:82/123/550`): internal data flow,
  `tier_name` is passed as a STRUCTURED FIELD between writes — never
  rendered to humans. Not surfaces.
- **POS reducers / context** (`quote-reducer.ts:396-427`,
  `ticket-reducer.ts:526-557`, `register-tab.tsx:153`,
  `pos-workspace.tsx:94`, `catalog-browser.tsx:425/517`,
  `service-detail-dialog.tsx:80/84`): internal tier-matching logic
  (`.find((t) => t.tier_name === sizeClass)`). NOT rendering.
- **Admin marketing promotions** (`promotions/page.tsx:60/234`,
  `quick-sale-dialog.tsx:148/372`): operator-internal admin UI that
  ALREADY uses `tier.tier_label || tier.tier_name` pattern. Not
  buggy. Out of scope unless the helper's titleCase fallback is
  preferred over the raw `tier_name` fallback — operator decision.
- **Admin catalog services pages** (`catalog/services/new/page.tsx`,
  `catalog/services/[id]/page.tsx`, `service-pricing-form.tsx`,
  `catalog/services/[id]/page.tsx:1389-1519`): operator-internal
  forms where `tier_name` IS the editable slug and showing it raw is
  correct. Not a bug.
- **SMS template chips beyond `{services}`** (grep `{tier`, `{tier_label`,
  `{tier_name`): no SMS template body references tier chips. Issue 39's
  helper handles all SMS `{services}` rendering; there's no parallel
  `{tier}` chip to add.

### Target 5 — Constraint matrix per surface

| # | Surface | Width/length limit | Format | Style requirements | Audience |
|---|---|---|---|---|---|
| 1 | Public quote page | Responsive container (~600-1200px) | HTML+CSS, dark mode supported | Muted secondary text under primary item_name | Customer |
| 2 | Public pay page | Responsive container | HTML+CSS, dark mode | Em-dash inline ` — tier_name`, same row as item_name | Customer (checkout-critical) |
| 3 | Public receipt page | Responsive container | HTML+CSS, dark mode | Em-dash inline, line-through when refunded | Customer |
| 4 | Quote PDF | Fixed column width (`colTier`) | PDFKit Helvetica, ASCII-safe (Session 71 ASCII rule) | Single-column entry; `-` placeholder when null | Customer (printable) |
| 5 | Appointment email HTML (template) | Email-safe ~600px content area | HTML + inline CSS, mobile-responsive | Parens after service name in services-table row | Customer |
| 6 | Appointment email plain text (fallback) | Email body, ~80-char line wrap | Plain text | Parens after service name inline | Customer |
| 7 | Appointment email HTML (fallback) | Email-safe ~600px | HTML + inline CSS | Parens after service name | Customer |
| 8 | POS appointment email HTML | Email-safe ~600px | HTML + inline CSS | Parens after service name | Customer |
| 9 | POS appointment email plain text | Email body | Plain text | Parens after service name | Customer |
| 10 | Receipt thermal (generateReceiptLines) | **32-char wide** (truncate-prone) | Monospace ASCII; ESC/POS | ` - tier_name` after item_name on same line | Customer (printable) |
| 11 | Receipt HTML (generateReceiptHtml) | Email/print HTML, ~600px | HTML+CSS, inline | ` - tier_name` after item_name in single cell | Customer |
| 12 | Admin quote slide-over | Side panel, narrow | HTML+CSS | Parens after item name, muted | Operator |
| 13 | Admin quote detail page | Full-width table | HTML+CSS | Sub-line under item_name, muted | Operator |
| 14 | POS quote detail | Full-width tablet | HTML+CSS, dark mode | Sub-line under item.name, muted | Operator |
| 15 | POS transaction detail | Full-width tablet | HTML+CSS, dark mode | Parens after item.item_name, muted | Operator |
| (chip) | SMS chip `{services}` (Issue 39) | 160-char SMS preview budget | Plain text | Parens summary `Service (2 Rows + Floor Mats)` | Customer |

**Constraint divergence summary:**

- **Wrapping varies wildly per surface** (em-dash, parens, sub-line,
  monospace column, PDF column) — surface owns the wrapping.
- **Token VALUE is uniform**: every surface wants the same logical
  thing: "the human-readable label for this item's tier" — "Per Seat
  Row" or "2 Rows" or null.
- **Thermal width (32 char) constraint** is the most aggressive but
  only affects truncation behavior at the OUTER wrapping, not the
  token contents (thermal renders "Hot Shampoo Extraction" already at
  22 chars; adding ` - Per Seat Row` adds 16 chars → 38 total →
  exceeds 32 → wraps to two lines per existing receipt-template
  `wrapTextToWidth` helper at line 1620). The helper does not need to
  truncate; the surface's existing wrap logic handles it.
- **PDF ASCII rule** (Session 71 / D43 Q5 — PDFKit Helvetica needs
  ASCII) is satisfied because tier_labels are ASCII English. No
  Unicode escape needed.

**Implication for helper design:** ONE token returned by the helper
serves all surfaces; surface-specific wrapping stays at the surface.
This is exactly what Option U enables — see Target 7.

### Target 6 — Existing helpers / utilities

`grep -rn 'tier_label\|formatTier\|renderTier\|tierDisplay'` produced
140 matches. Categorized:

**Existing partial-solution patterns:**

- `src/lib/services/messaging-ai.ts:91, 106` — uses
  `t.tier_label || t.tier_name` pattern when assembling
  operator-facing AI message context. NO title-case fallback;
  no qty pluralization.
- `src/lib/services/page-content-extractor.ts:254` — same
  `t.tier_label || t.tier_name` pattern for service page rendering.
- `src/app/admin/catalog/services/[id]/page.tsx:1390, 1519` —
  admin UI uses `tier.tier_label || tier.tier_name` for operator-
  internal tier display. Same pattern.
- `src/app/admin/marketing/promotions/_components/promotion-row.tsx:255,
  258` — error messages use the same pattern.

**No existing helper exports the pattern** — every consumer inlines
it. The 4 places above repeat the same 2-token fallback chain. None
of them handles the qty>1 pluralization case (Issue 39's per_row × N
requirement) because none of them was designed for multi-tier
same-service rendering.

**Related Session-71-style helpers (precedent for Option U):**

- `src/lib/quotes/line-item-pricing.ts` (Session 71): exports
  `getLineItemPricingInfo()` (predicate + label), `sumLineItemSavings()`
  (aggregator), `computePreDiscountSubtotal()` — adopted across 10
  surfaces. This is the closest in-codebase architectural precedent.
- `src/lib/quotes/modifier-display.ts` (Layer 15g-v): exports
  `resolveQuoteModifierRows()` (coupon/loyalty/manual rows) and
  `hasQuoteModifierRows()` — adopted across 5 receipt surfaces.
  Same pattern: shared logic helper, per-surface rendering wrapper.
- `src/lib/utils/format-address.ts:72` has a private (non-exported)
  `titleCase()` function. A new helper would need its own
  `titleCaseTierSlug()` or use this one (extract to shared).

**No helper exists that returns "render this tier as a human-
readable token" — that's exactly the gap Issue 41 fills.**

### Target 7 — Recommended helper architecture (U / V / W / X)

**Recommendation: Option U (two-layer split).** Evidence-based, not
preference-based.

```ts
// src/lib/quotes/tier-display.ts  (NEW)
//
// Low-level: returns "the human-readable token for this tier",
// or null when there's nothing meaningful to render.
//
// Pure. No surface knowledge. No HTML, no PDF, no markdown.
export interface TierTokenInput {
  tier_name: string | null;
  tier_label?: string | null;
  qty_label?: string | null;
  quantity?: number;
}

export function renderTierToken(item: TierTokenInput): string | null;
//   item={tier_name:"per_row",   tier_label:"Per Seat Row",        qty:1}      → "Per Seat Row"
//   item={tier_name:"per_row",   tier_label:"Per Seat Row",        qty:2,
//          qty_label:"row"}                                                    → "2 Rows"
//   item={tier_name:"floor_mats", tier_label:"Floor Mats Only",    qty:1}      → "Floor Mats Only"
//   item={tier_name:"sedan",     tier_label:null,                  qty:1}      → "Sedan" (title-cased fallback)
//   item={tier_name:null}                                                      → null
//   item={tier_name:"default"}                                                 → null  (sentinel for "no tier")

// src/lib/quotes/services-summary.ts  (NEW — Issue 39)
//
// High-level: composes the `{services}` SMS chip. Uses renderTierToken
// internally for the parenthetical content of multi-tier same-service
// groups.
import { renderTierToken } from './tier-display';
export function formatServicesSummary(items: ServicesSummaryItem[]): string;
```

**Why Option U beats V and W:**

- **Option V (single helper with surface enum):** rejected. The
  surface wrapping is too varied (em-dash, parens, sub-line, mono ` - `,
  PDF column, dedicated table cell) — encoding 5+ surface variants
  in one helper enum couples the helper to surface presentation
  layers and inverts the dependency. A surface that wants a tiny
  presentation tweak (e.g., add color, change separator) shouldn't
  have to modify the helper.
- **Option W (parallel `services-summary.ts` and `tier-display.ts`
  with no dependency):** rejected. Issue 39's chip composition uses
  the SAME per-tier rendering rule that Issue 41's per-line display
  needs. Duplicating the rule across two helpers is the exact
  drift-trap that Session 71 explicitly closed by extracting one
  shared helper across 10 surfaces.
- **Option X (other):** considered "extend `line-item-pricing.ts`
  with a tier method" — rejected because it conflates two concerns
  (price discount vs tier identity). Session 71's helper is about
  PRICING; Issue 41's helper is about TIER IDENTITY. Keeping them
  separate keeps each file's purpose clean and the test fixtures
  manageable.

**Option U honors Session 71 precedent (shared formatter, per-surface
rendering autonomous) at the right granularity:**

- `tier-display.ts` → low-level (tier identity token).
- `services-summary.ts` → high-level (composed chip), DEPENDS on
  tier-display.
- Per-surface adoption: each visual surface imports `renderTierToken`
  and wraps the returned string in its surface-appropriate
  presentation.

**Failure mode (helper returns null):** surfaces conditionally render
based on truthiness today (`{item.tier_name && <span>…</span>}`).
Helper-returning-null is the same control-flow; surfaces stay
`{tierToken && <span>… {tierToken}</span>}`. Zero new control-flow
complexity.

**Cross-data-source support:** `quote_items.tier_name` and
`appointment_services.tier_name` and `transaction_items.tier_name`
all live in the same table-row shape (tier_name TEXT). The helper
input type is a plain interface — every caller adapts its row to
that shape. Each callsite widens its SELECT to also fetch
`service_pricing.tier_label` + `qty_label` (via a nested
`service_pricing(tier_label, qty_label)` Supabase select on the
`service_id` join), then passes the joined row to the helper.

### Target 8 — Combined implementation scope estimate

Memory #8 threshold: ~300 LOC OR >3 files = split into multiple
sessions. Combined Issue 39 + Issue 41 exceeds BOTH:

**File count (combined):**
- 2 new helper files: `tier-display.ts`, `services-summary.ts`
- 4 new test files: `tier-display.test.ts`, `services-summary.test.ts`,
  `services-summary-adoption.test.ts`, `tier-display-adoption.test.ts`
  (or 2 if collapsed)
- 6 chip-composing routes modified (Issue 39: `send-quote-sms`,
  `accept`, `book`, `pos/jobs/cancel`, `voice-agent/appointments`,
  `convert-service`)
- 11-12 visual surface files modified (Issue 41: 15 surfaces but
  receipt-template.ts is 1 file × 2 sites, appointment notify routes
  are 2 files × 2-3 sites each, etc.)
- **Total files touched: ~17-19.** > 3 threshold.

**LOC estimate (combined):**
- `tier-display.ts`: ~60-80 LOC (helper + types + pluralize/titleCase)
- `services-summary.ts`: ~80-100 LOC (Issue 39 — depends on
  tier-display)
- Tests: ~700-900 LOC (combined unit + adoption)
- Adoption changes per site: ~5-10 LOC each × 17-19 sites = ~85-190
  LOC
- **Total ~ 925-1270 LOC.** >> 300 threshold.

Both thresholds exceeded by a wide margin. **Split is correct.**

**Recommended split: 2 sequenced sessions** (NOT parallel, per the
parallel-session-worktree memory):

#### Session 1 (D45): Helpers + Issue 39 chip adoption

**Scope:**
- Create `src/lib/quotes/tier-display.ts` + tests (~14 unit cases)
- Create `src/lib/quotes/services-summary.ts` + tests (~14 unit
  cases — from Issue 39 audit Target 7)
- Adopt at 6 chip-composing routes + tests (~6 adoption pin cases)
- Widen 6 SELECTs to include `service_pricing(tier_label, qty_label)`

**Files: ~9-10 modified, 4 created. LOC: ~500-650. Tests: ~34.**

**Time: 90-120 min.**

**Verification scenario:** Q-0084 reproduction. The send-quote-sms
path renders the `{services}` chip as "Hot Shampoo Extraction (2 Rows
+ Floor Mats)" — pinned by adoption test.

#### Session 2 (D46): Issue 41 visual surface adoption

**Scope:**
- Adopt `renderTierToken` at 15 visual surfaces (Target 1) — purely
  consumer-side; no new helpers
- Widen SELECTs at each surface to include
  `service_pricing(tier_label, qty_label)` (or join the joined row
  from `convert-service.ts` if the data has already been copied to
  `appointment_services.tier_label` / `qty_label`)
- Tests: ~15 adoption pin cases + thermal fixture regeneration
  (per receipt-baselines fixture pattern — captured at
  `src/lib/data/__tests__/__fixtures__/receipt-baselines/`)
- Fire AFTER Session 1 merges to main

**Files: ~10-12 modified (since receipt-template.ts covers 4
consumers, and notify routes cluster). LOC: ~250-350. Tests: ~25-30.**

**Time: 90-120 min.**

**Verification scenario:** Q-0084's quote link reloads and the per-line
tier text reads "Per Seat Row" / "Floor Mats Only" (or with Issue 40's
data edits, "Per Seat Row" / "Floor Mats") instead of raw slugs. Same
visible improvement on the public receipt page, public pay page,
admin slide-over, admin quote detail, POS quote detail, POS
transaction detail, quote PDF, appointment confirm email HTML, and
appointment confirm email plain text. Thermal receipt prints
"Hot Shampoo Extraction - Per Seat Row" instead of " - per_row".

**Why sequenced not parallel:** the parallel-session worktree-fragility
memory documents that parallel sessions on the same checkout aggressively
force-switch branches and stash. Session 2 depends on Session 1's helper
exports; running them in parallel would require either two worktrees AND
careful import discipline OR sequencing anyway. Sequential adds zero
wall-clock cost (Session 2 can't start until Session 1 deploys + the
helper API is locked) and avoids the coordination overhead the team
just paid for during the D43 A/B/C arc today.

**Alternative considered: single combined session (~3-4 hours, ~1000
LOC, ~60 tests).** Rejected on memory #8 grounds. The combined session
would also blast-radius too widely for one verification cycle.

### Target 9 — Pre-flight verification list

Before Session 1 (D45) fires, verify on main:

- [ ] D43 fully merged (Sessions A + B + C all on main). Current state
      ✓: commit `8f01f3a7` "Issue 38 D43 Session C" is HEAD on main.
- [ ] Issue 39 audit operator-read and locked.
      Current state ✓: `docs/dev/ISSUE_39_SERVICES_CHIP_AUDIT.md` exists
      on main.
- [ ] Issue 41 audit (THIS document) operator-read and locked.
      State: pending operator review of this audit.
- [ ] No competing parallel session touching
      `src/lib/quotes/` (would conflict with the new helper files).
      Verify via `git worktree list` + `git stash list` immediately
      before fire.
- [ ] Session 71 helpers (`line-item-pricing.ts`) and Layer 15g-v
      helpers (`modifier-display.ts`) still on main as architectural
      precedent. Current state ✓: `grep -rln 'line-item-pricing'`
      finds 11 consumers; helper file present.

Before Session 2 (D46) fires, additionally verify:

- [ ] Session 1 (D45) merged to main with green gates (tsc 0, lint 0/97,
      tests pass, build clean).
- [ ] `src/lib/quotes/tier-display.ts` exists and exports
      `renderTierToken` + `titleCaseTierSlug`.
- [ ] `src/lib/quotes/services-summary.ts` exists and exports
      `formatServicesSummary`.
- [ ] Issue 40 operator data edit DECISION made:
      - If "do data edits first" → operator clicks 2 admin edits,
        verifies, then Session 2 fires (visual surfaces render the
        post-edit labels on first verification).
      - If "do data edits later" → Session 2 fires against the
        verbose pre-edit labels ("Floor Mats Only", "Carpet & Mats
        Package"); visible improvement still real, just less polished.
      Audit recommends "data edits first" (Issue 40 is 2 admin clicks,
      30 seconds of work, immediately improves Session 2's
      verification screenshot quality).

### Target 10 — Risk + rollout

**Customer-facing rollout impact:**

- **Pre-deploy (today):** customer sees `"per_row"` raw slugs on
  Q-0084 quote link. Cosmetic only — quote totals correct.
- **Post-Session-1:** SMS chip improves
  (`"Hot Shampoo Extraction (2 Rows + Floor Mats)"` instead of
  `"Hot Shampoo Extraction, Hot Shampoo Extraction"`). Visual
  surfaces (web, PDF, email, thermal) STILL render raw slugs.
- **Post-Session-2:** all 15 visual surfaces render the operator-
  curated `tier_label` (or pluralized `qty_label` for qty>1). The
  customer-facing Issue 41 gap closes.

**Feature flag needed?** NO. The helper is additive at every site
(falls back to current `tier_name` rendering when `tier_label` join
data is unavailable — which is never on the new SELECT-widened
queries). Backward compatibility is automatic.

**Verification scenarios:**

| Surface | Verification |
|---|---|
| Public quote page | Visit `/quote/<Q-0084-token>` → per-line tier reads "Per Seat Row" / "Floor Mats Only" (or post-Issue-40 cleaner labels) |
| Public pay page | Convert quote to appointment, visit `/pay/<token>` → same per-line improvement |
| Public receipt page | Convert + pay, visit `/receipt/<token>` → same per-line improvement |
| Quote PDF | Generate PDF for Q-0084-class quote → Tier column reads "Per Seat Row" not "per_row" |
| Appointment email (HTML + text) | Trigger `/api/appointments/[id]/notify` → email body services table shows clean labels |
| POS appointment email | Trigger `/api/pos/appointments/[id]/notify` → same |
| Receipt thermal print | Print receipt for Q-0084-class transaction → ESC/POS output shows "Hot Shampoo Extraction - Per Seat Row" with correct 32-char wrap |
| Receipt HTML (Email/Copier/Customer) | Email / Copier-print / `/customer/receipts/html/...` paths all show clean labels |
| Admin quote slide-over | Open Q-0084 in admin → slide-over per-line tier reads cleanly |
| Admin quote detail | `/admin/quotes/<Q-0084-id>` → per-line tier reads cleanly |
| POS quote detail | Open Q-0084 in POS → per-line tier reads cleanly |
| POS transaction detail | Open paid Q-0084-derived transaction → per-line tier reads cleanly |
| SMS chip (Issue 39) | Re-send the quote SMS → preview reads "Hot Shampoo Extraction (2 Rows + Floor Mats)" |

**Empirical reproduction case (shared across all surfaces):** Q-0084
is the gift that keeps giving. The same multi-tier Hot Shampoo quote
that exposed Issue 38 (now closed), Issue 39 (audit done, fix
pending), and Issue 41 (this audit) — exposes all 15 visual surfaces
once they're loaded with the existing record. Operator does NOT need
to create new fixtures for verification; the live Q-0084 row
exercises every surface naturally.

**Rollout risk per session:**

| Session | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Session 1 (helpers + chip) | Helper returns wrong output for an unexpected input shape | Low | Medium (SMS preview wrong; data still correct) | 14 unit cases + 6 adoption pins; Q-0084 fixture in the unit tests |
| Session 1 | SELECT widening misses a join column at one of 6 sites | Medium | Low | adoption pin tests grep for the join in each route file |
| Session 2 (visual surfaces) | Helper return type change breaks an adoption site | Low | Low | TypeScript catches; per-surface pin test |
| Session 2 | Thermal receipt wrap exceeds 32-char width with longer tier_label | Medium | Low (wraps to second line, already supported) | existing `wrapTextToWidth` (line 1620 of receipt-template.ts) handles wrap |
| Session 2 | Email plain-text fallback renders helper return string but loses the trailing newline | Very low | Low | adoption test pins the newline in the output string |
| Session 2 | One of the 15 surfaces gets missed in adoption | Medium | Low (the surface still works, just doesn't improve) | adoption pin tests check the import is present in every Target-1 file |

**Overall risk: LOW.** Additive change. Backward-compatible. Single
deploy per session. No migration. No new tools or LLM-discipline
changes.

---

## Operator questions

**Target count: TWO** (both small refinements; neither blocks
implementation):

1. **Issue 40 data edits BEFORE or AFTER Session 1 ships?** Default
   recommendation: AFTER Session 1, BEFORE Session 2 (so Session 1's
   SMS chip is verified once with verbose labels and Session 2's
   visual surfaces are verified once with clean labels). Single
   yes/no needed.

2. **`vehicle_size` / `specialty` single-tier qty=1 quotes — surface
   tier in helper output?** Issue 39 audit Target 5 recommended NO
   (operator decision 6). Carrying forward to Issue 41: same rule.
   The helper returns `null` for these so the surfaces' existing
   conditional render (`{tierToken && <span>…</span>}`) hides the
   tier entirely. If operator wants uniform "always show tier"
   behavior (e.g., `"Express Interior Clean (SUV (3-Row) / Van)"` on
   a Suburban quote), one-line change to the helper. Default: NO,
   matches Issue 39 decision.

---

## Risk matrix

| Dimension | Severity | Probability | Notes |
|---|---|---|---|
| Customer-facing (per-line tier) | P2 | High (Active on every Q-0084-class multi-tier quote) | Visible NOW on quote link, receipt, PDF, email, pay page |
| Customer-facing (SMS chip) | P2 | High (Issue 39, separate fix) | Visible NOW on SMS preview |
| Implementation Session 1 | Low | Low | Additive helpers, no migration; mirrors Session 71 pattern |
| Implementation Session 2 | Low | Low | Pure adoption of Session 1's helper; per-surface pin tests |
| Verification | Low | Low | Q-0084 fixture exercises every surface naturally |
| Rollout | Very low | Low | Single deploy per session; no flags; no migration |
| Operational | Low | Low | Tier_label data already exists in DB on every multi-tier service; no operator data work blocking |

---

## Verification of audit hard rules

- ✅ NO source code changes in `src/`.
- ✅ NO migrations actually written or run.
- ✅ Only new file in this commit: this audit document + the doc
  updates per session brief.
- ✅ All findings cite `file:line` (or DB column / SQL query).
- ✅ Verified against current `main` source (commit `8f01f3a7`, post
  D43 Session C merge) — not against prior session summaries.
- ✅ Memory feedback-parallel-doc-sessions-use-worktree honored:
  worktree at `/Users/nayeem/Claude/SmartDetails/.issue-41-audit-wt`
  isolates this doc-only audit from any concurrent code session.
- ✅ Memory #15 (4 receipt surfaces) honored: per-surface
  inventory in Target 2 with explicit no-change finding for SMS
  receipt.
- ✅ Memory #8 (~300 LOC or >3 files = split) honored: Target 8
  recommends 2-session split.
- ✅ Helper-architecture question answered with EVIDENCE
  (constraint matrix, existing helper precedent) not preference —
  Target 7.
- ✅ Operator-locked decisions HONORED — Issue 39's 7 decisions
  carry forward unchanged; only 2 small follow-on refinements
  surfaced (operator questions above).

---

## Appendix — Full grep evidence

```
$ grep -rn 'tier_name' src/app/ src/lib/ src/components/ \
    | grep -v __tests__ | grep -v ".test."
(437 total references; filtered to 15 rendering-context surfaces — see Target 1)

$ grep -rn 'tier_label' src/ | wc -l
140

$ grep -rln 'generateReceiptHtml\|receiptToPlainText\|generateReceiptLines' src/ \
    | grep -v __tests__
src/app/admin/settings/receipt-printer/page.tsx
src/app/api/pos/receipts/print-copier/route.ts        ← uses generateReceiptHtml
src/app/api/pos/receipts/html/route.ts                ← uses generateReceiptHtml
src/app/api/pos/receipts/email/route.ts               ← uses generateReceiptHtml
src/app/api/pos/receipts/print-server/route.ts        ← uses generateReceiptLines
src/app/api/customer/receipts/html/route.ts           ← uses generateReceiptHtml
src/app/pos/lib/receipt-template.ts                   ← defines all

$ grep -rn '{tier\|{tier_label\|{tier_name' src/
(no SMS template body references tier chips — only admin UI tier_label || tier_name patterns)
```

```
=== Q-0084 reproduction data (post-D43 deploy, snapshot 2026-05-26) ===

Quote: Q-0084  status=accepted  source=sms_agent
  quote_items:
    [0] service_id=c4b22011  item_name="Hot Shampoo Extraction"
        tier_name="floor_mats"  quantity=1  unit_price=75    total_price=75
    [1] service_id=c4b22011  item_name="Hot Shampoo Extraction"
        tier_name="per_row"     quantity=2  unit_price=125   total_price=250

Customer-visible TODAY on /quote/<Q-0084-token>:
    Hot Shampoo Extraction              $75.00
      floor_mats                        ← raw slug, the Issue 41 bug
    Hot Shampoo Extraction              $250.00
      per_row                           ← raw slug, the Issue 41 bug
                              Subtotal: $325.00

Customer-visible POST-Issue-41-fix (Session 2 of D45/D46 split):
    Hot Shampoo Extraction              $75.00
      Floor Mats Only                   ← operator-curated tier_label
      (or "Floor Mats" post-Issue-40-edit)
    Hot Shampoo Extraction              $250.00
      2 Rows                            ← qty_label-pluralized
                              Subtotal: $325.00
```
