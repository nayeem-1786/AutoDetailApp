# Money-Unify Epic — Post-Epic Follow-ups

> Pre-existing issues discovered during Money-Audit-1 and Money-Audit-2
> that are **out of scope** for the money-unification epic. Tracked here
> so they don't get lost. Items are independent of the cents migration
> and can be addressed in standalone phases after the epic completes.
>
> Source: `docs/sessions/money-audit-2-subsystem-deep-dive.md` Priority 2/3
> open questions + LOCKED-5 of the playbook-revision session.

---

## Item 1 — `tax_rate` admin UI is dead code

**Audit-2 reference:** Q9.1
**Discovered in:** `src/app/admin/settings/tax-config/page.tsx:100`

The admin tax-config page writes `{ key: 'tax_rate', value: validated.tax_rate }` to `business_settings`. **No caller reads this key.** Runtime tax is the hardcoded constant `TAX_RATE = 0.1025` in `src/lib/utils/constants.ts:7`. Either the constant should be replaced by a DB read, or the admin UI is dead and should be removed.

- **Priority:** Medium. The disconnect means staff thinks tax changes are taking effect when they aren't.
- **Blast radius:** Low if deleting UI; Medium if wiring DB read (touches every tax computation site — `pos/utils/tax.ts`, `quote-service.ts`, `book/route.ts`).
- **Owner:** TBD
- **Estimated effort:** 1 session if deleting UI; 2 sessions if wiring DB read (because runtime read needs caching and the constant is consulted in many places).
- **Recommendation:** Decide intent first — should tax rate be admin-editable? If yes, wire it. If no, delete the UI + the unused `tax_products_only` UI alongside.

---

## Item 2 — `TAX_PRODUCTS_ONLY` constant declared but unused

**Audit-2 reference:** Q9.3
**Discovered in:** `src/lib/utils/constants.ts:8`

```ts
export const TAX_PRODUCTS_ONLY = true; // Only charge tax on products, not services
```

The constant is declared but **not consulted in any code path**. Actual taxability gating uses the per-item `is_taxable` boolean on products/services. If the constant were toggled to `false`, nothing would change.

- **Priority:** Low. Cosmetic. Delete-able with no behavior change.
- **Blast radius:** Trivial. Single export + a comment in `pos/utils/tax.ts:5-6` referencing it.
- **Owner:** TBD
- **Estimated effort:** 15 minutes. One commit deletes the constant + the stale comment.
- **Recommendation:** Bundle with Item 1 cleanup if the tax-config UI is being addressed.

---

## Item 3 — `coupons.combinable_with_sales` column appears dead

**Audit-2 reference:** Q1.4
**Discovered in:** `coupons` table (DB_SCHEMA.md:506) + `coupon-helpers.ts:259-264`

The schema has `combinable_with_sales BOOLEAN NOT NULL DEFAULT true`. The discount math at `coupon-helpers.ts:259-264` unconditionally excludes sale/combo items regardless of this flag. Either (a) the column is dead and should be dropped, (b) the column should gate the exclusion logic, or (c) the column is consulted somewhere the audit didn't find.

- **Priority:** Low. Dead column doesn't hurt anything; just confusing for future maintainers.
- **Blast radius:** If dropping: 1 column drop + admin UI update (if it's exposed). If wiring: change to `coupon-helpers.ts` exclusion logic.
- **Owner:** TBD
- **Estimated effort:** 30 minutes to investigate + decide; 1 session to execute either path.
- **Recommendation:** Verify the column isn't read anywhere (full grep) → drop if confirmed dead.

---

## Item 4 — End-of-day "today" window uses UTC midnight, not PST

**Audit-2 reference:** Q7.4
**Discovered in:** `src/app/api/pos/end-of-day/route.ts:43-45`

```ts
const today = new Date();
const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
```

The `Date` constructor uses local time but `.toISOString()` converts to UTC. In a PST 11pm close, the window can end up shifted vs. the intent. The business operates in PST per CLAUDE.md rule 1.

- **Priority:** Medium. Affects daily cash drawer reconciliation accuracy.
- **Blast radius:** Single route. Fix uses `formatDatePST` or equivalent helper from `src/lib/utils/pst-date.ts`.
- **Owner:** TBD
- **Estimated effort:** 30 minutes + test.
- **Recommendation:** Address before/alongside any cash-drawer audit phase.

---

## Item 5 — QBO sync drops tax line entirely

**Audit-2 reference:** Q9.5
**Discovered in:** `src/lib/qbo/sync-transaction.ts:280-294`

The Sales Receipt payload sent to QBO contains line items + (optional) discount line, but **no TxnTaxDetail**. QBO either computes its own tax on the customer profile (acceptable) or records lower revenue than the POS shows (real gap).

```ts
// Current payload — NO tax detail
const receiptPayload: Record<string, unknown> = {
  TxnDate: ...,
  CustomerRef: { value: customerQboId },
  Line: lines,  // line items + discount line only
  PrivateNote: ...,
};
```

- **Priority:** Medium-High. Real revenue accounting gap if QBO isn't auto-computing tax.
- **Blast radius:** QBO sync module + possibly tax-mapping configuration on the QBO side.
- **Owner:** TBD (likely user with QBO admin access)
- **Estimated effort:** 1-2 sessions to investigate (does QBO auto-compute via customer's tax profile?) + 1 session to fix if real.
- **Recommendation:** Verify QBO Customer.TaxableRef setup before deciding. If QBO is auto-applying tax, no fix needed. If not, add TxnTaxDetail to payload.

---

## Item 6 — EOD max_variance threshold + manager override

**Audit-2 reference:** Q7.2
**Discovered in:** `src/app/api/pos/end-of-day/route.ts` (no current threshold)

Currently, a cash drawer with $10,000 variance closes just as cleanly as a $0 variance. No threshold-based manager-override flow exists. Business policy question: should there be an upper bound that requires manager PIN to close?

- **Priority:** Low-Medium. Operational hygiene; not a correctness issue.
- **Blast radius:** End-of-day route + UI + new `business_settings` key for the threshold.
- **Owner:** TBD (business decision required first)
- **Estimated effort:** 1 session if user decides on threshold + override flow.
- **Recommendation:** Discuss with user; if approved, add `business_settings.cash_drawer_max_variance` (now cents-typed after epic completes) + add manager-override modal in EOD page.

---

## Item 7 — Booking flow lacks server-side `deposit_amount <= total_amount` validation

**Audit-2 reference:** Q4.3
**Discovered in:** `src/app/api/book/route.ts:357,404`

The booking-wizard client clamps the deposit input to `default_deposit_amount` from `business_settings`. The server at `/api/book/route.ts` doesn't re-validate that `deposit_amount <= total_amount`. A malicious or buggy client could submit deposit > total.

- **Priority:** Low. No known exploit; client-side clamp covers normal use.
- **Blast radius:** Single validation check in the book route.
- **Owner:** TBD
- **Estimated effort:** 30 minutes + test.
- **Recommendation:** Add server-side validation in book route. Probably best to bundle with Item 4 of Money-Unify Family C's pre-flight (if rows surface with deposit > total).

---

## Item 8 — E-commerce coupon use doesn't update `campaigns.redeemed_count` or `revenue_attributed`

**Audit-2 reference:** Q1.7
**Discovered in:** `src/app/api/webhooks/stripe/route.ts:310-322`

When an e-commerce order applies a coupon and Stripe payment succeeds, the webhook increments `coupons.use_count` but doesn't update `campaigns.redeemed_count` or `campaigns.revenue_attributed`. The POS path does both (`api/pos/transactions/route.ts:571-595`). Either intentional omission or known bug.

- **Priority:** Medium. Marketing analytics undercounts e-commerce attribution.
- **Blast radius:** Stripe webhook handler.
- **Owner:** TBD
- **Estimated effort:** 1 session.
- **Recommendation:** Verify intent with business owner; if it's a bug, fix in a standalone phase.

---

## Item 9 — Booking flow coupon `use_count` verification

**Audit-2 reference:** Q1.6
**Discovered in:** `src/app/api/book/route.ts` (not exhaustively read in audit-2)

Audit-2 didn't fully trace whether the booking-completion path increments `coupons.use_count`. The POS, e-commerce webhook, and offline-sync paths all do. Whether booking does — unclear. If booking doesn't, coupons applied at booking would never count against `max_uses`.

- **Priority:** Medium-High. Affects coupon-limit enforcement on customer-facing booking flow.
- **Blast radius:** Booking route.
- **Owner:** TBD
- **Estimated effort:** 30 minutes investigation; 1 session to fix if missing.
- **Recommendation:** Grep `/api/book/route.ts` for `use_count` reference; if absent, add the increment + revisit `max_uses` enforcement.

---

### 10. REDEEM_MINIMUM local shadow in step-confirm-book.tsx

- **Discovered:** Phase Money-Unify-1 verification (out-of-scope
  finding)
- **Location:** src/components/booking/step-confirm-book.tsx:186
- **Pattern:** `const REDEEM_MINIMUM = 100;` shadowing
  `LOYALTY.REDEEM_MINIMUM`
- **Risk profile:** Identical to REDEEM_RATE shadow fixed in
  Unify-1. If LOYALTY.REDEEM_MINIMUM changes, this site silently
  retains old value.
- **Priority:** Low — loyalty minimum changes infrequently
- **Blast radius:** 1 client file
- **Estimated effort:** ~5 min (import LOYALTY, delete local
  const, rewrite reference)
- **Recommended fix:** Inline during next relevant Family C
  phase OR Unify-Final cleanup pass

---

## How these items relate to the Money-Unify epic

All 10 items are **independent** of the cents migration. None block any Money-Unify phase. They were discovered during the audit because money-handling code paths are dense and dovetail with adjacent concerns (tax, accounting, e-commerce, scheduling).

After Money-Unify-Final completes, recommend reviewing this list and prioritizing items based on business impact. Items 5 (QBO tax), 9 (booking coupon increment), and 8 (e-commerce campaign attribution) are the most impactful financially. Items 1, 2, 3, 4 are cleanup. Item 6 is policy-driven. Item 7 is defense-in-depth. Item 10 (REDEEM_MINIMUM shadow) is a small-blast-radius cleanup discovered during Unify-1 verification.

---

## Maintenance

When an item is addressed:
- Mark it `## Item N — [RESOLVED YYYY-MM-DD]` with a one-line resolution summary
- Cite the commit hash or session doc that closed it
- Do NOT delete the entry — preserve for historical reference

New post-epic discoveries during family-phase execution may be appended here following the same template.
