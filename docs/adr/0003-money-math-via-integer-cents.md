# ADR-0003: Money math via integer cents

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Nayeem

## Context

The Session-35 refund shipped $17.60 instead of $17.64 on a quantity-40
line because a per-unit dollar value was rounded BEFORE multiplying by
quantity. The root cause was IEEE 754 floating-point arithmetic and
ad-hoc `x * 100` / `x / 100` conversions scattered across the refund
path. Client and server each computed the refund independently, and a
fractional-cent residual was redistributed inconsistently, so the two
sides disagreed by cents — small amounts that nonetheless trigger
"server amount mismatch" rejections and corrupt POS state.

Money handling spans POS refunds, transaction totals, deposits,
loyalty redemption, coupon discounts, and Stripe payment intents. Any
domain that does arithmetic on money is susceptible to the same class
of bugs.

## Decision

**All money arithmetic operates on integer cents.** Conversion at the
boundary only:

- `toCents(dollars)` — at every entry point that receives a dollar value
- `fromCents(cents)` — at every display or external-API boundary
- Both live in `src/lib/utils/refund-math.ts`

Four invariants enforced by the helpers and the test suite:

1. **No inline `* 100` or `/ 100`.** Always go through `toCents` /
   `fromCents`.
2. **Round once per line**, inside `computeRefundLineAmountCents`'s final
   `Math.round`. Intermediate per-unit and discount-share values carry
   fractional cents.
3. **Distribute residual cents** via `distributeResidualCents` so the sum
   of stored line cents equals the computed total exactly (no
   ±N-cent drift).
4. **Server recomputes independently** and enforces an exact match
   (`tolerance: 0`) against client-sent amounts. Disagreement is a bug.

Tax convention is documented in the file header: stored
`transaction_items.tax_amount` is computed on the pre-discount line
subtotal; transaction-level discounts (coupon, loyalty, manual) subtract
from `subtotal + tax` at the totals stage. The refund formula subtracts
`itemDiscountShare` from per-line refundable exactly once.

## Consequences

**Positive:**
- IEEE 754 artifacts are mathematically impossible — integers don't drift
- Refund client/server amounts match exactly; disagreement signals real bugs
- The four invariants are testable and have test coverage

**Negative:**
- Every money calculation route must `toCents` at entry; can't pass
  dollars deep into the call stack
- Discount-share residuals require a deliberate distribution step that
  callers must remember to invoke for multi-line refunds with discounts

**Neutral:**
- Stripe operates in cents natively; we already align with its
  representation at the payment boundary.

## Alternatives Considered

**`decimal.js` library.** Rejected for current scope. Adds a runtime
dependency for a pattern that integer cents already solves. Worth
revisiting if we ever need fractional cents (tax rules in some
jurisdictions) or non-USD currencies.

**Tolerance > 0 on server-side match (e.g., ±1 cent).** Rejected:
masks real bugs. With the residual distribution invariant in place,
exact match is achievable. The original Session-35 bug would have been
masked under a 1-cent tolerance and shipped to production.

**Keep dollars as the canonical type, format on output only.** This was
the pre-Session-35 state. Failed at scale: rounding order matters, and
floating-point arithmetic doesn't commute the way humans expect.

## Related ADRs

- ADR-0001 — Canonical form pattern (parent meta-pattern)
