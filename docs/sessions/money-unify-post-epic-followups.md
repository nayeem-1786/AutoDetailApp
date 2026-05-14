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

### 11. po_items typo in catalog/products/[id]/page.tsx:174

- **Discovered:** Phase Money-Unify-2 verification (out-of-scope
  finding)
- **Location:** src/app/admin/catalog/products/[id]/page.tsx:174
- **Bug:** Supabase query uses `.from('po_items')` but the
  actual table is `purchase_order_items`. Query always returns
  empty result; cost-history card on product detail page
  silently shows no data.
- **Risk profile:** Latent functional bug, not a money-unit
  problem. User-facing impact: admin product page hides PO
  history. No data corruption.
- **Priority:** Medium — user-facing feature is broken
- **Blast radius:** 1 file, ~5 lines
- **Estimated effort:** ~10 min (verify table name, update
  query, test)
- **Recommended fix:** Separate chore phase after Money-Unify
  epic, OR opportunistic fix during Unify-3 (Catalog) since
  that phase touches products.

---

### 12. Startup credential load failure (Supabase fetch)

- **Discovered:** During VPS alignment deploy for Unify-1+2;
  persisted across Unify-3 deploy.
- **Location:** `src/lib/data/credentials.ts:22`
- **Diagnosis:** `TypeError: fetch failed` / `SocketError: other
  side closed` (`UND_ERR_SOCKET`) on initial Supabase query at
  startup. Connection drops mid-request before response received.
  Subsequent on-demand calls succeed, so functionality unimpacted.
- **Probable cause:** Supabase pooler stale connection on first
  request after process start; DNS race; or transient network blip.
- **Risk profile:** Low — failure is non-blocking, soft fallback
  works. Logged warning is cosmetic.
- **Priority:** Low — defer to post-Money-Unify cleanup
- **Recommended fix:** Add retry-with-backoff to credential
  loader, OR make credential load lazy-on-first-use rather than
  at startup.
- **Estimated effort:** ~30 min

---

### 13. (reserved)

(Placeholder to keep #14 and #15 numerically aligned with their
introduction-order discovery; no item assigned.)

---

### 14. Lint warnings sweep before Unify-Final

- **Discovered:** Unify-3 introduced 35 new
  `money/no-unsuffixed-money-prop` warnings (29 pre-existing
  + 35 = 64 total in main).
- **Cause:** Internal-local variables that bind cents values
  without `_cents` suffix (e.g., `const min = ...; const sp = ...`).
  No canonical-model violations — values are correct, names don't
  advertise.
- **Top sites:** `step-service-select.tsx` (8),
  `booking-wizard.tsx` (5), `service-resolver.ts` (3),
  `sale-history.ts` (3).
- **Recommended fix:** Per-file rename pass before Unify-Final
  upgrades lint rule from `'warn'` to `'error'`. Expected each
  subsequent family phase will add similar internal-local
  warnings — sweep all at once at the end.
- **Priority:** Low — scheduled work, not optional but not
  blocking.
- **Estimated effort:** ~1–2 hours for full sweep at Unify-Final.

---

### 15. Audit other voice-agent routes for cents-as-dollars display bugs

- **Discovered:** Unify-3 fixed
  `src/app/api/voice-agent/products/route.ts` which was emitting
  `"$1599.00"` for $15.99 products (cents value string-formatted
  as dollars without conversion).
- **Risk:** Similar bugs may exist in other voice-agent routes
  (10 total) where post-Family-D cents values get rendered
  without `fromCents()` conversion.
- **Recommended check:** Audit all 10 routes under
  `src/app/api/voice-agent/` for any place where a money value
  is interpolated into a string without explicit `formatMoney(cents)`
  or `fromCents()` conversion.
- **Priority:** Medium — production bug class. Customer-facing
  voice quotes that mis-quote prices = real impact.
- **Estimated effort:** ~30 min audit, fixes minimal if no other
  instances.

---

## How these items relate to the Money-Unify epic

Items 1–11 are **independent** of the cents migration. They were discovered during the audit because money-handling code paths are dense and dovetail with adjacent concerns (tax, accounting, e-commerce, scheduling). Items 12, 14, 15 surfaced during deploy / Unify-3 execution: #12 is a pre-existing soft-failure log line that persisted across both deploys, #14 is scheduled cleanup intrinsic to the lint-rule upgrade plan, and #15 is a production bug class discovered via the products-route fix.

After Money-Unify-Final completes, recommend reviewing this list and prioritizing items based on business impact. Items 5 (QBO tax), 9 (booking coupon increment), and 8 (e-commerce campaign attribution) are the most impactful financially. Items 1, 2, 3, 4 are cleanup. Item 6 is policy-driven. Item 7 is defense-in-depth. Item 10 (REDEEM_MINIMUM shadow) is a small-blast-radius cleanup discovered during Unify-1 verification. Item 11 (po_items typo) was opportunistically fixed during Unify-3. Item 12 (credentials startup log) is a soft-failure pre-existing pattern — diagnosed from VPS logs as a stale-pooler-connection on initial fetch; functionality unimpacted; fix is retry-with-backoff or lazy-on-first-use. Item 14 (lint sweep) is a scheduled cleanup that grows incrementally per family phase and gets resolved before Unify-Final upgrades the rule from `'warn'` to `'error'`. Item 15 (voice-agent audit) is medium-priority — customer-facing voice quotes mis-quoting prices have real impact, and the bug class CC caught in Unify-3 may exist in sibling routes.

---

## Maintenance

When an item is addressed:
- Mark it `## Item N — [RESOLVED YYYY-MM-DD]` with a one-line resolution summary
- Cite the commit hash or session doc that closed it
- Do NOT delete the entry — preserve for historical reference

New post-epic discoveries during family-phase execution may be appended here following the same template.
