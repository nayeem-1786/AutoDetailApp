# Phase 2 (Option A) — Supplementary Audit: Reuse-First & Evidence Completeness

> **Status:** AUDIT-ONLY. No code changed. No consumer migrated. Read-only, on branch
> `audit/phase-2-supplementary`.
> **Date:** 2026-06-22
> **Companion to:** `docs/dev/PHASE_2_CONSUMER_MIGRATION_AUDIT_2026-06-22.md` (the first
> Phase-2 audit; committed `3da5b7f2`). This addendum **does not modify** that doc — it
> closes its open questions with file:line evidence and a **reuse-first** lens.
> **Method:** 9 parallel gap investigators + 1 completeness critic (10 agents) + first-hand
> orchestrator reads of `money.ts`, `refund-math.ts`, `customer-context.ts`,
> `transaction-totals.test.ts`, `redemption-math.test.ts`, `loyalty-panel.tsx`.
> **Governing principle:** REUSE-FIRST — existing helpers win unless empirically shown
> unsuitable. Every "add new code" recommendation had to survive that test.

---

## 1. Executive Summary

The first audit's strategic conclusions **survive intact** — Batch M (money: H1+H2+latent-bug
fixes) is the value; H3/H5 defer to Phase 3; the loyalty batch is a unit-mismatch question.
This supplementary audit changes **three operational things** and **resolves two questions in
the operator's favor (smaller scope than feared):**

1. **Q-C (composer dual-gate) is much smaller than expected — LOCK as trivial.** The composer
   has exactly **two real callers**; only one (`receipt-data.ts:285`) needs a change (+1
   SELECT field + pass-through), the other already passes `null`. **~10–12 LoC across 2
   files, zero prop-drilling.** And the reuse-first move is to import the existing
   `computeBalanceDue` at `receipt-composer.ts:658` rather than re-inline the gate.

2. **The first audit's "pointsToDollars variant" is confirmed NET-NEW code (it does not
   exist), and on reuse-first grounds it should NOT be built for Phase 2.** But — and this is
   the audit's most important correction — **the Gap-5 investigator's counter-proposal to
   wrap all 29 loyalty sites in `fromCents(pointsToCents(x))` composition is ALSO wrong, and
   partly unsafe.** It is verbosity-for-zero-behavior-gain on display lines, and at the 3
   floor-cap sites it would silently flip `Math.floor`→`Math.ceil` (a behavior change).
   **My lock: Q-A → DEFER the loyalty batch (option iii).** Leave the 29 display sites on
   `LOYALTY.REDEEM_RATE`; they work and `formatCurrency` handles precision. Migrate loyalty
   display wholesale during Money-Unify, where a variant or composition becomes natural.

3. **`customer-context.ts:127`'s local `dollarsToCents` should stay (keep-separate), NOT be
   folded into Batch M.** It is a *defensive superset* of `toCents` (handles
   `string|null|undefined` + `isFinite` guard) reading raw Supabase NUMERIC values; it is
   not a Batch-M file (it's voice-agent/SMS context); and consolidating to `toCents(Number(x))`
   **loses the `isFinite` guard**. Not a bug, not Batch M.

**Reuse-first net result: Phase 2 needs ZERO new helpers.** Every Batch-M need is met by an
existing canonical helper (`computeGrandTotal`, `computeBalanceDue`, `toCents`, `fromCents`,
`computeBalanceDue` for the composer gate). The only "new code" anyone proposed —
`pointsToDollars` and the composition rewrite — is either deferred (Q-A) or rejected as
unsafe/low-value. Test coverage is already sufficient at the helper level; Batch M adds only
thin consumer regressions.

**Confirmed unchanged from first audit:** H1 = 6 sites, H2 = 8 sites, the 2 SMS/email latent
bugs (L1/L2), H3/H5 deferred to Phase 3, loyalty helpers cents-canonical vs dollars consumers.

---

## 2. Helper Inventory (Gap 1)

**14 canonical/near-canonical money helpers across 5 files**, plus several private one-offs.
Reuse-first verdict: **no `pointsToDollars`/`centsToDollars` variant exists anywhere** — the
first audit's variant would be net-new.

### Converters

| Helper | File:line | Contract | Status |
|---|---|---|---|
| `toCents(dollars: number)` | `src/lib/utils/money.ts:79` | `Math.round(dollars*100)`; the only dollar→cent rounding site | **canonical** |
| `fromCents(cents: number)` | `src/lib/utils/money.ts:83` | `cents/100` | **canonical** |
| `pointsToCents(points)` | `src/lib/loyalty/redemption-math.ts:46` | `points * REDEEM_RATE_CENTS` (×5) | canonical (Q2-migrated: `redemption-guard.ts:69`) |
| `centsToPoints(cents, clampToBalance?)` | `src/lib/loyalty/redemption-math.ts:75` | `Math.ceil(cents/5)`, optional balance clamp | canonical (UNIT-mismatch vs dollars consumers) |
| `dollarsToCents(number\|string\|null\|undefined)` | `src/lib/services/customer-context.ts:127` | `Math.round(n*100)` + null/string/`isFinite` guards | **local one-off** (broader than `toCents`; see §8) |

### Aggregators / clamps / rounders

| Helper | File:line | Contract | Status |
|---|---|---|---|
| `computePerUnitRefundableCents` | `money.ts:100` | per-unit refundable, UNROUNDED | canonical (refund engine) |
| `computeRefundLineAmountCents` | `money.ts:131` | single rounding site per line | canonical |
| `computeTotalRefundCents` | `money.ts:161` | per-line + total, residual-corrected | canonical |
| `distributeResidualCents` | `money.ts:206` | allocate ±N residual cents | canonical |
| `computeGrandTotal` | `transaction-totals.ts:56` | `max(appt,total)+tip`, $ | canonical (Batch M, 6 sites) |
| `computeBalanceDue` | `transaction-totals.ts:98` | `max(0, apptC−paidC)` + dual-gate, ¢ | canonical (Batch M, 8 sites) |
| `deriveSubtotalFromItems` | `transaction-totals.ts:131` | `sum(items.total_price)`, $ | canonical (0 Phase-2 consumers) |
| `computeDisplayTotals` | `transaction-totals.ts:202` | 10-field shape | foundation (0 consumers) |
| `computeAppointmentDelta` | `src/lib/utils/mobile-service-edit.ts:44` | surcharge-delta to subtotal/total, cents-internal | canonical (mobile-fee) |
| `computePaidCentsForAppointment` | `src/lib/utils/mobile-service-edit.ts:98` | sum payments → cents | canonical |
| `getDefaultCancellationFeeCents` | `src/lib/appointments/cancel-orchestration.ts:106` | reads business_settings → cents | canonical (settings reader) |

### Display formatters

| Helper | File:line | Contract |
|---|---|---|
| `formatCurrency(dollars)` | `src/lib/utils/format.ts:25` | Intl USD; legacy dollars path (survives Money-Unify) |
| `formatMoney(cents)` | `src/lib/utils/format.ts:48` | canonical cents display; throws on non-integer |
| `formatMoneyForInput(cents)` | `src/lib/utils/format.ts:75` | `X.XX` for controlled inputs |

### Private one-offs (completeness critic) — none are Batch-M duplication risks

| Helper | File:line | Disposition |
|---|---|---|
| `round2(n)` | `src/lib/utils/coupon-helpers.ts:189` | private, coupon dollars-context — keep private |
| `formatDollar(n)` | `template.ts:143` | exported, marketing-DSL formatter — keep scoped |
| `toFiniteNumber(input, fallback)` | `src/lib/utils/compose-line-items.ts:147` | private, line-item coercion — keep local |
| `parseDollarAmount(str)` | `src/lib/utils/migration/phone-utils.ts:106` | Square-CSV import only — correctly scoped |
| inline round | `src/lib/quotes/manual-discount.ts:33` | local manual-discount math |

**Constant split (confirmed):** `LOYALTY.REDEEM_RATE = 0.05` (`constants.ts:49`) **42 usages**;
`LOYALTY.REDEEM_RATE_CENTS = 5` (`constants.ts:56`) **14 usages** (3 in the helpers, 11 in
tests/definition).

---

## 3. LOYALTY Constant Usage Matrix (Gap 2)

**Policy recommendation: LEAVE `REDEEM_RATE` (float) alone for Phase 2; the constant
migration belongs to Money-Unify-Final.** (Both constants coexist by design per
`redemption-math.ts` header.)

The 42 `REDEEM_RATE` sites split:

- **4–7 sites live in Batch-M-owned files** (`receipt-template.ts:923,933,1533,1539`;
  `receipts/email/route.ts:86,91`; `transactions/route.ts:586` SMS) — these are loyalty
  **display** lines (earned-points cash value) inside files Batch M already owns for H1/H2.
  Per the first audit's file-ownership rule, Batch M *touches* these files, but **it should
  NOT convert these display lines** (see Q-A, §6/§11) — leave them on `REDEEM_RATE`.
- **~25 sites are Batch-L display/calc** (`loyalty-panel`, `quote-loyalty-panel`,
  `booking-wizard`, `step-confirm-book`, `account/*`, `admin/*`, public receipt) — deferred
  with Batch L.
- **3 sites are intentional floor-cap divergences** (`booking-wizard:975,996`,
  `step-confirm-book:212`) — `Math.floor` (business-favoring), the OPPOSITE of `centsToPoints`'
  customer-favoring `Math.ceil`. **These must never be "simplified" into the helper** — doing
  so flips the rounding direction (a real behavior change). Recommend a code comment marking
  them as deliberate.

**Rounding/precision note:** the dollars-context sites that divide by `0.05`
(`loyalty-panel:70`, the floor-caps) carry IEEE-754 exposure that integer-cents math avoids.
This is a *hygiene* argument for Money-Unify, **not** a Phase-2 blocker — every such site is
either protected by an explicit `*100/round//100` or wrapped in `formatCurrency`, and none
has a demonstrated production rounding bug.

**Reuse-first:** no new constant needed; `REDEEM_RATE` + `formatCurrency` already fit display.

---

## 4. refund-math vs money Import Status (Gap 3)

**19 files import from the deprecated `@/lib/utils/refund-math` shim** (header says "21" —
drift; 2 already migrated). The shim is a one-line re-export: `export * from './money'`
(`refund-math.ts:10`). Every imported symbol (`toCents`, `fromCents`,
`computePerUnitRefundableCents`, `computeTotalRefundCents`) exists in `money.ts`.

**Policy recommendation: HYBRID (option c).** Swap `refund-math → money` imports **only in
files Batch M already opens** for a consumer migration — a free, mechanical cleanup. **Do NOT
open files solely to swap imports** (that's churn the shim exists to avoid; it survives to
Unify-Final regardless).

Batch-M-relevant refund-math importers (swap-on-touch):

| File:line | Symbols | Batch M reason to touch |
|---|---|---|
| `src/app/pos/lib/receipt-template.ts:13` | `toCents` | H1 (723,1482) + H2 (824,1226) |
| `src/lib/data/receipt-composer.ts:18` | `toCents` | H2 (658) + Q-C |
| `src/app/(public)/pay/[token]/page.tsx:6` | `toCents, fromCents` | H2 (127) + Q-B |
| `src/app/(public)/receipt/[token]/page.tsx:16` | `toCents` | H1 (361) |
| `src/app/api/pay/[token]/intent/route.ts:4` | `toCents` | H2 (110) |
| `src/app/api/pos/jobs/[id]/route.ts:6` | `toCents` | H2 (78) |

The other ~13 importers (refund UI, checkout, job-detail/queue, mobile-service routes,
`source-plan.ts`, `edit-services.ts`) are NOT Batch M files — leave them for Unify-Final.

**Optional guard:** an ESLint `no-restricted-imports` rule on `@/lib/utils/refund-math` (warn)
would prevent regrowth. Out of Phase-2 scope; flag for Money-Unify.

---

## 5. Composer Caller Surface — Q-C Scope LOCK (Gap 4)

**Q-C is trivial — LOCK it.** `composeReceiptPaymentLines` (`receipt-composer.ts:582`) has
exactly **two production callers**:

| Caller | Has `payment_status` at call site? | Change needed |
|---|---|---|
| `src/lib/data/receipt-data.ts:285` | NO — appointment fetched at `:253-257` but `payment_status` not in the SELECT | **+1 SELECT field + pass-through** (trivial; the appointment object is already the conduit) |
| `src/app/pos/jobs/[id]/checkout-items/route.ts:391` | passes `null` already | **none** (future-proof) |

**No prop-drilling exists.** Total Q-C scope: **~10–12 LoC across 2 files** —
`receipt-composer.ts` signature (accept optional `payment_status` on the appointment param) +
`:658` swap to `computeBalanceDue({...paymentStatus})`, plus `receipt-data.ts` SELECT + pass.
Test mocks +5–8 lines.

**Reuse-first:** the composer's `:658` `Math.max(0, apptC−paidC)` should call the existing
`computeBalanceDue` (passing `paymentStatus`) rather than re-inline the dual-gate — this *is*
the H2 migration for that site, and it closes Q-C in the same edit. No new helper.

**Conflict check:** none — this directly implements the first audit's Q-C "plumb it"
recommendation, and reveals it's smaller than the first audit implied (it called Q-C
"moderate"; evidence shows it's trivial — one SELECT field).

---

## 6. Reuse Evaluation per Loyalty Site — Q-A LOCK (Gap 5)

This is the section where the supplementary investigator and I **diverge**, so both views are
on the record per the hard rule.

### What the Gap-5 investigator recommended
Adopt **A1a composition** — rewrite all 29 dollars-context loyalty sites as
`fromCents(pointsToCents(x))` — and **defer the `pointsToDollars` variant**. Argument:
composition reuses existing helpers (no new code) and "prepares for a future cents-wholesale
display migration (A1c)."

### Why I do not adopt that recommendation (independent judgment + evidence)

1. **It is verbosity for zero behavior gain.** The 29 sites are overwhelmingly *display*:
   `formatCurrency(balance * REDEEM_RATE)` or `(points * REDEEM_RATE).toFixed(2)`. Composition
   turns `balance * 0.05` into `fromCents(pointsToCents(balance))` (= `balance*5/100`) —
   identical output, +1–2 calls and an import per site. On a display line that is strictly
   worse readability.

2. **It is UNSAFE at the 3 floor-cap sites.** `booking-wizard.tsx:975,996` and
   `step-confirm-book.tsx:212` use `Math.floor(dollars / REDEEM_RATE)` — a *business-favoring*
   cap. `centsToPoints` is `Math.ceil`-canonical (*customer-favoring*). The Gap-5 table itself
   labels these "divergent" yet still tags them "A1a composition" via `centsToPoints(toCents(...))`
   — which would **flip floor→ceil and change the redeemable cap**. Blanket composition is a
   latent behavior change here. (Flagged, not fixed.)

3. **Several sites are compile-time constants** (`REDEEM_MINIMUM * REDEEM_RATE` at
   `loyalty-panel:87`, `account/loyalty:197,240`, `step-confirm:823,843`). Wrapping a constant
   in `fromCents(pointsToCents(...))` is absurd; a named `REDEEM_MINIMUM_DOLLARS` constant
   would be the only sane "improvement," and even that is cosmetic.

4. **"A1c readiness" is speculative.** There is no scheduled cents-wholesale display phase.
   Refactoring 29 working sites now to ease a hypothetical future migration is exactly the
   over-engineering reuse-first is meant to prevent — and when A1c does happen, these sites get
   touched then regardless.

5. **Reuse-first, read honestly, points to DEFER.** The principle asks "does an existing
   helper already fit?" For *displaying points as dollars*, `REDEEM_RATE` + `formatCurrency`
   already fit perfectly. Composition isn't reuse-of-a-fitting-helper; it's forcing a
   cents pipeline through a dollars display.

### Q-A LOCK (my recommendation)
**DEFER the loyalty batch (first audit's option iii).** Concretely:
- Leave all ~29 display sites on `LOYALTY.REDEEM_RATE`. No behavior bug exists; `formatCurrency`/
  `toFixed(2)` handle precision.
- Do **not** build `pointsToDollars` now (net-new, low-value).
- Do **not** blanket-compose (verbose; unsafe at floor-caps).
- The floor-cap sites get a one-line "deliberate floor, not ceil" comment if/when touched —
  never migrated to `centsToPoints`.
- When Money-Unify schedules a cents-wholesale display pass, decide variant-vs-composition
  *then*, with the full refactor in scope. That's where the unit decision actually pays off.
- **The single genuinely-conversion loyalty site** (`loyalty-panel.tsx:70`, the one true
  `centsToPoints` semantic consumer) is handled in §10 — and it too rides with the deferred
  Batch L unless the operator wants it as a tiny standalone.

**Conflict surfaced:** Gap-5 (composition for all 29) ⟂ first audit (variant-or-defer) ⟂ this
lock (defer). I am siding with DEFER and explicitly rejecting blanket composition on safety +
value grounds.

---

## 7. Adjacent-Helper Inventory (Gap 6)

**No Batch-M duplication risk; no new adjacent helper needed.** Everything Batch M will touch
is already a reusable canonical helper or already composed:

| Territory | Existing helper | Verdict |
|---|---|---|
| Money display | `formatMoney`/`formatMoneyForInput`/`formatCurrency` (`format.ts:48/75/25`) | reuse |
| Receipt labels | `buildSuggestedLabelForPayment` (`receipt-composer.ts:472`), `composeReceiptPaymentLines` (`:582`), `derivePaymentSourceLabel` (`payment-source-label.ts:20`) | reuse |
| Line items / mobile fee | `composeLineItems` (`compose-line-items.ts:107`) | reuse |
| Tax | `calculateItemTax`/`calculateTicketTotals` (`pos/utils/tax.ts:8/22`) | no change |
| Grand total / balance | `computeGrandTotal` / `computeBalanceDue` | Batch M migrates into these |

The first audit's H3/H5 deferral is reinforced — no adjacent helper makes them more migratable.

---

## 8. `customer-context.ts` `dollarsToCents` Disposition — Gap 7 (I dissent from the agent)

### Line-by-line comparison (first-hand)
```
// customer-context.ts:127                          // money.ts:79
function dollarsToCents(input: number|string|null|undefined): number {
  if (input == null) return 0;                       export function toCents(dollars: number): number {
  const n = typeof input === 'string'                  return Math.round(dollars * 100);
    ? Number(input) : input;                         }
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);   // ← identical core
}
```
**Differences:** `dollarsToCents` adds (a) `null/undefined → 0`, (b) string→Number parse,
(c) `!isFinite → 0`. The rounding core is identical. Call sites: `:312` (`q.total_amount`,
untyped Supabase NUMERIC → may be string), `:323` (`t.total_amount`, typed `number|string`),
`:378`/`:379` (`a.price`/`a.discount_amount`, already `number`).

### Why it exists
Supabase returns NUMERIC columns as **strings** in some query shapes; `customer-context.ts`
(voice-agent / SMS context builder) reads raw rows. The broader signature is **intentional
boundary defense**, not an accident or a bug.

### The Gap-7 agent recommended Option A (consolidate to `toCents(Number(x))`). I recommend Option B (keep separate).
- **Option A loses the `isFinite` guard.** `toCents(Number("abc"))` = `Math.round(NaN*100)` =
  `NaN`; `dollarsToCents` returns `0`. Even `toCents(Number(x) || 0)` still differs on
  `Infinity` (`Infinity || 0 === Infinity`, but `dollarsToCents` → `0`). So consolidation is
  **not behavior-preserving** in the corner the guard was written for.
- **It's out of Batch-M scope.** `customer-context.ts` is voice-agent/SMS context — not a
  money-receipt file. Pulling it into Batch M widens the blast radius for no Batch-M benefit.
- **Reuse-first does not require it.** The existing canonical helper (`toCents`) does *not*
  fit this site's contract (it can't ingest string/null); the local function is the correct
  tool for a DB-boundary read.

**Disposition LOCK: Option B — keep `dollarsToCents` local, add a one-line comment noting it's
a Supabase-NUMERIC-boundary defensive wrapper of `toCents`. Not Batch M. Not a bug.** If a
*second* consumer ever needs the same coercion, promote a `toCentsLoose`/`toCentsSafe` to
`money.ts` then (YAGNI until then). **Conflict surfaced:** Gap-7 → Option A; this audit →
Option B.

---

## 9. Phase-1 Test Coverage vs Consumer Corner Cases (Gap 8)

**Phase-1 helper tests already cover every consumer corner case the first audit identified.**
First-hand confirmed in `transaction-totals.test.ts` (27 cases) + `redemption-math.test.ts`
(14 cases) + `redemption-guard.test.ts`:

| Corner case | Covered at | 
|---|---|
| NaN-via-undefined-tip (H1 Variant A) | `transaction-totals.test.ts:58` ("tip absent (undefined): defensive ?? 0 prevents NaN") |
| Close-out shell `total_amount=0` (H1) | `:27` |
| Walk-in fallback (H1) | `:38` |
| Dual-gate `paymentStatus='paid'` (H2) | `:112` |
| Dual-gate `partial` passthrough (H2) | `:124` |
| Webhook omit-flag pattern (H2) | `:134` |
| `paymentStatus=null` ≡ omitted (H2) | `:146` |
| Overpaid clamps to 0 (H2) | `:94` |
| IEEE boundary $230/$460 (H5) | `:295` |
| Negative clamp (loyalty) | `redemption-math.test.ts:57` |

**Test strategy LOCK (option c, scoped):** trust Phase-1 helper tests for all math; add only
**thin consumer regressions**:
- **L1/L2 (SMS/email close-out-shell):** render-level regression asserting a close-out-shell
  fixture shows `appointment_total`, not `$0.00 + tip`. *(Real behavior fix — must lock.)*
- **Q-B (pay-page), conditional:** if the operator passes `paymentStatus`, assert
  `remainingCents`→0 when the flag says paid but numeric disagrees.
- **Q-C (composer), conditional:** assert `balance_due` follows the flag once plumbed.
- **H1 sites 1–3 (Variant A):** no new test — the `:58` undefined-tip case covers the
  NaN→0 improvement; migration is a 1-line swap.

Per-site scope: H1 trivial (existing regressions hold), H2 trivial except the 2 conditional
gate sites, L1/L2 = 1 render regression each.

---

## 10. Q3-Deferred `loyalty-panel.tsx` Migration Plan (Gap 9)

`handleConfirm` (`loyalty-panel.tsx:60-80`), current:
```
const clamped = Math.min(dollarAmount, maxRedemption);                 // :68 dollars
const pointsToRedeem = Math.ceil(clamped / LOYALTY.REDEEM_RATE);       // :70 conversion
const actualDiscount = Math.round(Math.min(pointsToRedeem * LOYALTY.REDEEM_RATE, maxRedemption) * 100) / 100;  // :72 Q3-LOCKED
dispatch({ points: Math.min(pointsToRedeem, balance), discount: actualDiscount });  // :76 clamp
```

**Helper-replaceable (the conversion + balance clamp):**
`pointsToRedeem = centsToPoints(toCents(clamped), balance)` folds `:70`'s ceil and `:76`'s
`Math.min(_, balance)` into one call. **Stays at consumer per Q3 lock:** the `:72`
`actualDiscount` `Math.round(...)/100` UX-boundary rounding — do NOT move to a helper.

**Behavior equivalence — verified first-hand and by the agent's 5-case table:**

| Case | $ / max / bal | Current dispatch pts | `centsToPoints(toCents(clamped), bal)` |
|---|---|---|---|
| normal | 5.00/10/100 | 100 | 100 ✓ |
| ceil boundary | 5.01/10/100 | 100 | 100 ✓ |
| minimum | 0.05/10/5 | 1 | 1 ✓ |
| balance clamp | 5.00/10/80 | 80 | 80 ✓ |
| max clamp | 10.00/10/150 | 150 | 150 ✓ |

The helper path is also **more robust** (integer-cents intermediate avoids `/0.05` float
division). **Subtlety to preserve:** `actualDiscount` (`:72`) uses the (now balance-clamped)
`pointsToRedeem`; this is safe only because `clamped ≤ maxRedemption` and `maxRedemption` is
balance-bounded (`= min(balance*REDEEM_RATE, ticket…)`), so the clamp never makes
`actualDiscount` disagree with the dispatched points. Lock a redemption regression test
**before** the swap.

**Scheduling:** this migration is real and ready, but it is part of **Batch L (deferred per
Q-A §6).** Recommend it travels with Batch L. If the operator wants one concrete loyalty win
sooner, this single site is the only safe, behavior-equivalent, non-display loyalty migration —
it could ship as a tiny standalone. It does **not** require the Q-A unit decision (it uses
`toCents` + `centsToPoints`, both existing).

---

## 11. Updated Decision Matrix (Q-A … Q-D, evidence-locked)

| Q | First-audit framing | Supplementary evidence | **Locked recommendation** |
|---|---|---|---|
| **Q-A** loyalty unit direction | variant (i) or defer (iii) | no variant exists (net-new); blanket composition is verbose + **unsafe at 3 floor-caps** (floor→ceil flip); display sites have zero behavior gain | **DEFER (iii).** Keep `REDEEM_RATE` on display sites; no `pointsToDollars` now; revisit at Money-Unify cents-wholesale pass. Floor-caps never migrate. |
| **Q-B** pay-page dual-gate | "pass it" (moderate) | helper tests cover the gate; behavior change is only the displayed `remainingCents`/`chargeCents` when flag≠numeric | **Pass `paymentStatus`; simplify the `:191` OR-gate; add the conditional regression (§9).** Confirmed a real but contained display change. |
| **Q-C** composer dual-gate | "plumb it" (moderate) | only 2 callers; 1 needs +1 SELECT field; **no prop-drilling**; reuse `computeBalanceDue` at `:658` | **Plumb it — TRIVIAL (~10–12 LoC / 2 files).** Smaller than first audit implied. |
| **Q-D** L1/L2 latent bugs | fix in Batch M or hotfix | confirmed (`sms/route.ts:86`, `email/route.ts:80` missing `Math.max`); helper close-out-shell test exists | **Fix inside Batch M** (migrate to `computeGrandTotal`, gaining the clamp) + 1 render regression each. Standalone hotfix only if a close-out-shell receipt is imminent. |

Plus three new operational locks:
- **Refund-math imports:** swap `→ money` only in the 6 Batch-M files being touched (§4).
- **`dollarsToCents`:** keep local; not Batch M; not a bug (§8).
- **No new helpers in Phase 2** — reuse-first satisfied end to end.

---

## 12. Updated Batch M Scope Estimate

| Component | Files | Sites / change | LoC |
|---|---|---|---|
| H1 grand-total | `receipt-template.ts`, `receipt/[token]/page.tsx`, `transaction-detail.tsx`, `admin/transactions/page.tsx` | 6 swaps | ~30 |
| H1 latent-bug fix (L1/L2) | `receipts/sms/route.ts`, `receipts/email/route.ts` | 2 sites → helper (gains clamp) | ~15 |
| H2 balance-due | `payment-link/send.ts`, `webhooks/stripe/route.ts`, `pay/[token]/page.tsx`, `pay/[token]/intent/route.ts`, `pos/jobs/[id]/route.ts`, `receipt-template.ts`, `receipt-composer.ts` | 8 swaps | ~40 |
| Q-B pay-page gate | (in `pay/[token]/page.tsx`) | pass flag + simplify `:191` | ~8 |
| Q-C composer plumb | `receipt-composer.ts`, `receipt-data.ts` | signature + SELECT + pass | ~12 |
| refund-math→money import swaps | 6 Batch-M files (free, on touch) | import lines | ~6 |
| Consumer regressions | tests | L1/L2 render + conditional Q-B/Q-C | ~40 |

**Total: ~11–13 files, ~150–200 LoC** (incl. tests). **Memory #8:** within ceiling for one
session, but the Q-B (pay-page `isPaid`/`isLinkConsumed` interaction) + Q-C are the only
non-mechanical parts — if they feel heavy in implementation, peel them into **Batch M2** and
ship the ~11 trivial swaps + L1/L2 fixes as **Batch M1** first.

**Parallelization:** Batch M is one cohesive owner of the receipt/pay/webhook money files —
**run it solo and sequential.** No loyalty work runs alongside it (Batch L deferred), so the
cross-file collision risk the first audit flagged (receipt-template, email/sms) is moot for
now. H3/H5 remain Phase 3.

---

## 13. Open Questions Remaining

- **Q-A confirmation:** Do you accept **DEFER** for the loyalty batch (rejecting both the
  `pointsToDollars` variant and blanket composition)? If you'd still like *some* loyalty win in
  Phase 2, the only safe one is the `loyalty-panel.tsx:70` `centsToPoints` migration (§10) as a
  tiny standalone.
- **Q-B mechanics:** Passing `paymentStatus` at `pay/[token]:127` lets us simplify the `:191`
  `isPaid` OR-gate. Confirm you want the simplification (vs. leaving `:191` as belt-and-suspenders).
- **Floor-cap comments:** OK to add a one-line "deliberate `Math.floor` cap — do not convert to
  `centsToPoints`" comment at `booking-wizard:975/996` + `step-confirm-book:212` during a future
  pass, to prevent a well-meaning "simplification" from introducing the ceil/floor bug?
- **Refund-math lint guard:** Want a `no-restricted-imports` warn rule on the shim to stop
  regrowth (Money-Unify housekeeping, not Phase 2)?
- **Batch M1/M2 split:** Run Batch M as one session, or pre-split the trivial swaps (M1) from
  the Q-B/Q-C gate work (M2)?

---

### Appendix — provenance
- 9 gap investigators + 1 completeness critic (10 agents) + 6 first-hand orchestrator file
  reads. Every `file:line` cited was opened on branch `audit/phase-2-supplementary` at HEAD.
- Two investigator recommendations were **overridden with reasoning** (Gap-5 composition →
  DEFER; Gap-7 Option A → Option B) per the hard rule to surface, not silently override,
  conflicts. All other gap findings are adopted.
- **No code modified. No consumer migrated. The first Phase-2 audit doc is unchanged. This
  document is the only artifact.**
