import type { Customer } from '@/lib/supabase/types';

/**
 * Phase 3 Class (b) Track A — shared SET_CUSTOMER handler (C.1 step 7).
 *
 * Both ticket-reducer.ts and quote-reducer.ts had truly byte-identical
 * SET_CUSTOMER cases pre-extraction — single-line `return { ...state,
 * customer: action.customer }`, no comment differences, no whitespace
 * differences. Phase A.1 audit classified this as byte-identical trivial.
 *
 * Memory #8 override authorized for multi-session structural extraction scope.
 * No surface-specific behavior knob required (no intentional divergences to
 * preserve).
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared SET_CUSTOMER action shape. Both `TicketAction` (types.ts:148) and
 * `QuoteAction` (types.ts:269) define this case inline byte-for-byte. The
 * helper accepts this structural type so a narrowed action from either
 * reducer-specific union is assignable without modifying types.ts.
 */
export interface SetCustomerAction {
  type: 'SET_CUSTOMER';
  customer: Customer | null;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared SET_CUSTOMER handler. Both reducers delegate here from their
 * `case 'SET_CUSTOMER':` block.
 *
 * Architectural notes:
 *   - The `<S extends { customer: Customer | null }>` generic constraint
 *     reflects exactly what the helper touches: only `state.customer`. Unlike
 *     the items-manipulating helpers (applyAddService et al.) this handler
 *     does not need an `items: TicketItem[]` constraint — preserving the
 *     "constraint reflects what the helper accesses" discipline. Surface-
 *     specific state fields (items[], deposit/edit-mode/mobile/quote-meta/etc.)
 *     are preserved via spread.
 *   - Customer change has **no pricing impact** (no per-customer pricing in
 *     the catalog), so neither reducer's pre-extraction case wraps the return
 *     in `recalculateTotals`. Delegators MUST preserve that: bare
 *     `return applySetCustomer(state, action);` — no recalculateTotals wrap.
 *   - No `next === state` reference-equal optimization needed. The helper
 *     unconditionally constructs new state via spread; there is no no-op path
 *     (passing the same customer reference still produces a new state object).
 *   - Behavior is byte-equivalent to pre-extraction ticket-reducer.ts:175-177
 *     and quote-reducer.ts:110-112 (the "Sale is the reference" rule from
 *     POS_SALE_VS_QUOTES_PARITY_AUDIT.md — and the two sides were already
 *     byte-equal).
 */
export function applySetCustomer<S extends { customer: Customer | null }>(
  state: S,
  action: SetCustomerAction,
): S {
  return { ...state, customer: action.customer };
}
