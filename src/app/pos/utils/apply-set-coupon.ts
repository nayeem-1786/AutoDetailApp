/**
 * Phase 3 Class (b) Track A — shared SET_COUPON handler (C.1 step 8).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had truly byte-identical
 * SET_COUPON cases pre-extraction — single-line `return recalculateTotals({
 * ...state, coupon: action.coupon })`, no comment differences, no whitespace
 * differences. Phase A.1 audit classified this as byte-identical trivial.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 * No surface-specific behavior knob required (no intentional divergences to
 * preserve).
 */

// ─── Shared coupon shape ─────────────────────────────────────────────

/**
 * Coupon payload — duplicated inline in both `TicketState.coupon`
 * (types.ts:88) and `QuoteState.coupon` (types.ts:243), and in both
 * `TicketAction` (types.ts:150) and `QuoteAction` (types.ts:271). Kept inline
 * here rather than imported, mirroring the existing inline-shape pattern from
 * types.ts — extracting a named type from types.ts is out of scope for this
 * structural fix (Memory #8 boundary).
 */
type TicketCoupon = {
  id: string;
  code: string;
  discount: number;
  isAutoApplied?: boolean;
} | null;

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared SET_COUPON action shape. Both `TicketAction` (types.ts:150) and
 * `QuoteAction` (types.ts:271) define this case inline byte-for-byte. The
 * helper accepts this structural type so a narrowed action from either
 * reducer-specific union is assignable without modifying types.ts.
 */
export interface SetCouponAction {
  type: 'SET_COUPON';
  coupon: TicketCoupon;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared SET_COUPON handler. Both reducers delegate here from their
 * `case 'SET_COUPON':` block.
 *
 * Architectural notes:
 *   - The `<S extends { coupon: TicketCoupon }>` generic constraint reflects
 *     exactly what the helper touches: only `state.coupon`. Surface-specific
 *     state fields (items[], deposit/edit-mode/mobile/quote-meta/etc.) are
 *     preserved via spread.
 *   - **Coupon change DOES affect totals** (discount line). Both reducers'
 *     pre-extraction cases wrapped the return in `recalculateTotals`. The
 *     helper itself returns un-recalculated state; the surface-specific
 *     delegator MUST wrap the result in its surface-specific
 *     `recalculateTotals` to preserve byte-behavior — matching the locked
 *     delegator pattern from C.1 steps 4-6 (UPDATE_ITEM_QUANTITY,
 *     UPDATE_PER_UNIT_QTY, REMOVE_ITEM).
 *   - No `next === state` reference-equal optimization. The helper
 *     unconditionally constructs new state via spread; passing the same
 *     coupon reference still produces a new state object. Delegator
 *     unconditionally calls recalculateTotals.
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:308-310
 *     and quote-reducer.ts:229-231 (the "Sale is the reference" rule from
 *     POS_SALE_VS_QUOTES_PARITY_AUDIT.md — and the two sides were already
 *     byte-equal).
 */
export function applySetCoupon<S extends { coupon: TicketCoupon }>(
  state: S,
  action: SetCouponAction,
): S {
  return { ...state, coupon: action.coupon };
}
