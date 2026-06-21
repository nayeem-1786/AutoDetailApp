/**
 * Transaction totals derivation helpers — consolidated per Phase 1 of the
 * Job Receipt Unification arc (Option A).
 *
 * See docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md for the full
 * architectural context. This module is the single source of truth for:
 *
 *   - computeGrandTotal     (Helper 1 — Section 0 row 1, 6 inlined sites)
 *   - computeBalanceDue     (Helper 2 — Section 0 row 5, 3 inlined sites)
 *   - deriveSubtotalFromItems (Helper 3 — Section 0 row 2, divergent semantics)
 *   - computeDisplayTotals  (Helper 5 — synthesizing surface shape)
 *
 * Phase 1 ADDS these helpers. Phase 2 migrates consumers to call them.
 * Phase 3 implements the single-transaction lifecycle and populates the
 * granular discount-breakdown fields that are placeholders today.
 *
 * SUBTOTAL DIVERGENCE NOTE (audit Section 0 row 2):
 * Three current write sites use different semantics for "subtotal":
 *   1. api/book/route.ts:662 — post-discount (totalAfterDiscount)
 *   2. api/pos/transactions/route.ts:190 — client-supplied (pre-operator-discount)
 *   3. api/webhooks/stripe/route.ts:170 — appointment snapshot (post-discount)
 * These converge under Phase 3. In the interim, deriveSubtotalFromItems()
 * establishes the canonical definition: subtotal := sum(items.total_price).
 *
 * UNITS:
 *   - computeGrandTotal, deriveSubtotalFromItems, computeDisplayTotals: DOLLARS
 *     (matches all current consumer sites + DB NUMERIC(10,2))
 *   - computeBalanceDue: CENTS (matches all 3 current consumer sites:
 *     send.ts:349, webhooks/stripe/route.ts:151, pay/[token]/page.tsx:127)
 *
 * The mismatch is intentional — Money-Unify will migrate the dollars-side
 * helpers to cents in a later phase.
 */

// ---------------------------------------------------------------------------
// Helper 1 — Grand Total
// ---------------------------------------------------------------------------

/**
 * Canonical grand-total formula. Replaces 6 inlined sites (audit Section 0
 * row 1). Phase 1 audit found those sites are NOT byte-identical — three
 * variants exist (see audit doc Phase 1 addendum). The most defensive
 * variant `?? 0`s the tip; the others don't and could throw NaN if
 * upstream data drifts. This helper bakes in the defensive variant.
 *
 * Formula: max(appointment_total, total_amount) + tip
 *
 * The Math.max guard handles close-out-shell transactions where
 * total_amount=$0 but appointment_total carries the real service value
 * (locked by Session #155 test transaction-detail-total-with-tip.test.tsx
 * case 3). Falls back to total_amount for walk-in transactions where
 * appointment_total is absent.
 *
 * Dollars. Phase 2 migrates the 6 consumer sites to this helper.
 */
export function computeGrandTotal(input: {
  appointment_total?: number | null;
  total_amount?: number | null;
  tip_amount?: number | null;
}): number {
  return (
    Math.max(input.appointment_total ?? 0, input.total_amount ?? 0) +
    (input.tip_amount ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Helper 2 — Balance Due (cents)
// ---------------------------------------------------------------------------

/**
 * Canonical balance-due formula in CENTS. Replaces 3 inlined sites
 * (audit Section 0 row 5):
 *   - src/lib/payment-link/send.ts:349
 *   - src/app/api/webhooks/stripe/route.ts:151
 *   - src/app/(public)/pay/[token]/page.tsx:127
 *
 * Base formula: max(0, appointmentTotalCents - totalPaidCents)
 *
 * DUAL-GATE semantics (Q1 locked):
 * When paymentStatus === 'paid', returns 0 regardless of numeric balance.
 * This protects against stale-cache scenarios where the appointment's
 * payment_status flag is authoritative (e.g., webhook-stamped) but the
 * payment-sum lookup hasn't yet settled. Today, only pay/[token]:191
 * cross-checks the flag; under Phase 2 migration the other two consumers
 * inherit the dual-gate by virtue of calling this helper.
 *
 * ASYMMETRY (by design):
 *   - Render/read callers (pay-page, receipt UIs) pass `paymentStatus` to
 *     get the authoritative answer.
 *   - DECISION callers (the webhook computing the NEW payment_status from
 *     inbound payment) OMIT `paymentStatus` or pass `null` — passing 'paid'
 *     would self-reference and break the decision logic.
 *
 * Cents-canonical. Callers convert via toCents() at input boundaries
 * (matches all 3 current consumer sites which already work in cents).
 */
export function computeBalanceDue(input: {
  appointmentTotalCents: number;
  totalPaidCents: number;
  paymentStatus?: string | null;
}): number {
  if (input.paymentStatus === 'paid') return 0;
  return Math.max(
    0,
    input.appointmentTotalCents - input.totalPaidCents
  );
}

// ---------------------------------------------------------------------------
// Helper 3 — Subtotal Derivation
// ---------------------------------------------------------------------------

/**
 * Canonical subtotal definition: sum of transaction line-item total_price.
 *
 * SCOPE-LIMITED for Phase 1 per audit Section 0 row 2. See module-header
 * divergence note. This helper establishes the canonical derivation; Phase 2
 * migrates writers to either compute via this helper at insert OR assert
 * the invariant (sum-of-items matches submitted subtotal).
 *
 * Mobile surcharge: already a transaction_items row (item_type='mobile_fee'),
 * naturally included in the sum when callers pass all items. Do NOT add
 * separately — that's a bug pattern that double-counts.
 *
 * Tax: per-item concern (transaction_items.tax_amount), out of scope here.
 *
 * Dollars (matches DB NUMERIC(10,2) and POS reducer conventions at
 * ticket-reducer.ts:94 and quote-reducer.ts:44).
 */
export function deriveSubtotalFromItems(
  items: ReadonlyArray<{ total_price: number | null | undefined }>
): number {
  return items.reduce((sum, item) => sum + (item.total_price ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Helper 5 — Display Totals
// ---------------------------------------------------------------------------

/**
 * Single shape returned across all "render a transaction summary" surfaces
 * — receipts, admin detail, customer portal, payments page, email/SMS
 * receipt-link pages.
 *
 * SCOPE-LIMITED for Phase 1:
 *   - manual_discount and coupon_discount are PLACEHOLDER fields (always 0
 *     today). They exist in the shape so Phase 3 schema work
 *     (transactions.manual_discount_value + manual_discount_label columns,
 *     plus per-component coupon snapshot) only has to POPULATE the fields
 *     — Phase 3 will not require a shape change touching every consumer.
 *   - loyalty_discount IS available today (transactions.loyalty_discount is
 *     a real column) and is populated by computeDisplayTotals.
 *   - total_discount is the combined bucket from transactions.discount_amount
 *     that exists today; it stays the single source for "how much was
 *     discounted in total" until Phase 3 splits it.
 *
 * All amounts in DOLLARS. computeBalanceDue (cents-canonical) is wrapped
 * with toCents/fromCents conversion inside this helper so consumers stay
 * in dollars.
 */
export interface DisplayTotals {
  /** Sum of line-item total_price (audit Section 0 row 2). */
  subtotal: number;
  /** Sum of line-item tax_amount (mirrors transactions.tax_amount). */
  tax: number;
  /** Combined discount bucket (transactions.discount_amount today). */
  total_discount: number;
  /** Manual discount component. PHASE 1 PLACEHOLDER — always 0; Phase 3 populates. */
  manual_discount: number;
  /** Coupon discount component. PHASE 1 PLACEHOLDER — always 0; Phase 3 populates. */
  coupon_discount: number;
  /** Loyalty redemption discount (transactions.loyalty_discount). */
  loyalty_discount: number;
  /** Tip collected on this transaction. */
  tip: number;
  /** Grand total via computeGrandTotal. */
  grand_total: number;
  /** Total paid against the appointment (sum of all payment rows). */
  paid_so_far: number;
  /** Outstanding balance via computeBalanceDue. */
  balance_due: number;
}

/**
 * Compose a canonical DisplayTotals from a transaction row + optional
 * payments aggregate.
 *
 * Internally calls computeGrandTotal (H1) and computeBalanceDue (H2).
 *
 * Cents conversion: computeBalanceDue is cents-canonical; this helper
 * converts the dollars-side `appointment_total` / `total_amount` /
 * `paidSoFarDollars` inputs to cents internally and converts the result
 * back to dollars on output. Centralizes the boundary so consumers stay
 * in dollars-context for now.
 *
 * Math.round(...*100)/100 is intentional rather than toCents() — keeps the
 * helper self-contained without importing from money.ts (which would
 * create a cross-module dependency for a one-off conversion). Same IEEE
 * 754 protection as toCents() because we round before integer math.
 */
export function computeDisplayTotals(input: {
  transaction: {
    appointment_total?: number | null;
    total_amount?: number | null;
    subtotal?: number | null;
    tax_amount?: number | null;
    tip_amount?: number | null;
    discount_amount?: number | null;
    loyalty_discount?: number | null;
  };
  paidSoFarDollars?: number;
  paymentStatus?: string | null;
}): DisplayTotals {
  const tx = input.transaction;

  const grand_total = computeGrandTotal({
    appointment_total: tx.appointment_total,
    total_amount: tx.total_amount,
    tip_amount: tx.tip_amount,
  });

  const paid_so_far = input.paidSoFarDollars ?? 0;

  // Phase 3 will replace `max(appointment_total, total_amount)` with the
  // open transaction's authoritative total. For Phase 1 we mirror the
  // grand-total input source for balance-due to stay consistent.
  // NOTE: balance-due intentionally excludes tip — tip is collected
  // separately and isn't "owed" the same way the service total is.
  const appointmentTotalForBalance = Math.max(
    tx.appointment_total ?? 0,
    tx.total_amount ?? 0
  );
  const balanceCents = computeBalanceDue({
    appointmentTotalCents: Math.round(appointmentTotalForBalance * 100),
    totalPaidCents: Math.round(paid_so_far * 100),
    paymentStatus: input.paymentStatus,
  });
  const balance_due = balanceCents / 100;

  return {
    subtotal: tx.subtotal ?? 0,
    tax: tx.tax_amount ?? 0,
    total_discount: tx.discount_amount ?? 0,
    manual_discount: 0,             // Phase 3 placeholder
    coupon_discount: 0,             // Phase 3 placeholder
    loyalty_discount: tx.loyalty_discount ?? 0,
    tip: tx.tip_amount ?? 0,
    grand_total,
    paid_so_far,
    balance_due,
  };
}
