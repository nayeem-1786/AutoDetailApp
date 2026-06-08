import type { Service, ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import type { TicketItem } from '../types';
import { calculateItemTax } from './tax';
import { resolveServicePriceWithSale } from './pricing';
import { generateId } from './generate-id';

/**
 * Phase 3 Class (b) Track A — shared ADD_SERVICE handler (C.1 step 1, ADD_SERVICE only).
 *
 * Memory #8 override authorized: this is the first of 13 shared-action
 * extractions that collapse byte-identical reducer cases into a single source
 * of truth. Background:
 *
 *   - Pre-extraction, ticket-reducer.ts and quote-reducer.ts each had a
 *     ~150-line ADD_SERVICE case. Patch A (commit 54ba39f4) brought
 *     quote-reducer to parity with ticket-reducer to fix Bug 1 (scope-tier-
 *     with-qty mispricing in POS Quote path), at the cost of duplicating
 *     the entire handler.
 *
 *   - Phase A audit found 13 of 14 shared reducer actions were byte-identical
 *     duplicates, with SET_VEHICLE carrying the same latent scope-tier-with-qty
 *     bug as a sibling. Patch A's copy-paste was the right semantic fix but
 *     perpetuated the structural defect.
 *
 *   - C.1 extraction shape: each shared action becomes a function in
 *     src/app/pos/utils/ (this file is the first); both reducers' case bodies
 *     collapse to thin delegators. Surface-specific recalculateTotals (which
 *     composes depositCredit / mobileSurcharge / etc. into totals) stays in
 *     each reducer file and wraps the helper's return.
 *
 * This file extracts ONLY ADD_SERVICE. C.1 steps 2-13 extract the remaining
 * shared actions following the same pattern.
 */

// ─── Shared action shape ─────────────────────────────────────────────

/**
 * Shared ADD_SERVICE action shape. Both `TicketAction` and `QuoteAction`
 * define this case inline with byte-identical fields (see types.ts:142, :264).
 * The `applyAddService` helper accepts this structural type so a narrowed
 * action from either reducer-specific union is assignable here without
 * changes to types.ts (no circular-import risk).
 */
export interface AddServiceAction {
  type: 'ADD_SERVICE';
  service: Service & { pricing?: ServicePricing[] };
  pricing: ServicePricing;
  vehicleSizeClass: VehicleSizeClass | null;
  perUnitQty?: number;
  parentItemId?: string;
  comboPrice?: number;
  comboPrimaryServiceId?: string;
  prerequisiteNote?: string;
  prerequisiteForServiceId?: string;
  customPrice?: number;
  customNote?: string;
}

// ─── Surface-specific behavior knobs ─────────────────────────────────

/**
 * Captures intentional divergences between Sale and Quote reducers that the
 * operator chose to preserve during C.1 extraction.
 *
 * - `customPriceChildBehavior`:
 *   - `'append'` — Sale path. A custom-priced service dispatched with a
 *     `parentItemId` lands at the END of items[], not next to its parent.
 *     Matches pre-extraction ticket-reducer.ts behavior. The DEFAULT branch
 *     (non-custom-price) always inserts after-parent regardless of this knob.
 *   - `'after-parent'` — Quote path. A custom-priced service dispatched with
 *     a `parentItemId` inserts immediately after the parent's last existing
 *     child. Matches pre-extraction quote-reducer.ts behavior.
 *
 * Phase B Mitigation #3 — operator-authorized "option (a)" design choice.
 * The honest caveat: Sale's custom-price-no-parent-insert is INCONSISTENT
 * with its own default-branch (which does parent-insert), suggesting the
 * divergence may be an oversight rather than intentional design. The knob
 * preserves Sale's byte-behavior either way; removing it is a one-line
 * refactor if we later confirm the inconsistency is an oversight to fix.
 */
export interface ApplyAddServiceOptions {
  customPriceChildBehavior: 'append' | 'after-parent';
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Insert `newItem` immediately after the parent's last existing child.
 * Falls back to append-at-end when the parent isn't found (a never-fire
 * defensive branch — caller validates parentItemId references a real item
 * before dispatching).
 */
function insertAfterParent(items: TicketItem[], parentItemId: string, newItem: TicketItem): TicketItem[] {
  const arr = [...items];
  const parentIdx = arr.findIndex((i) => i.id === parentItemId);
  if (parentIdx < 0) {
    return [...arr, newItem];
  }
  let insertIdx = parentIdx + 1;
  while (insertIdx < arr.length && arr[insertIdx].parentItemId === parentItemId) {
    insertIdx++;
  }
  arr.splice(insertIdx, 0, newItem);
  return arr;
}

// ─── Main handler ────────────────────────────────────────────────────

/**
 * Shared ADD_SERVICE handler. Both ticket-reducer.ts and quote-reducer.ts
 * delegate here from their `case 'ADD_SERVICE':` block. Returns:
 *
 *   - the state argument REFERENCE-EQUAL when no items change (duplicate
 *     non-per-unit-like no-op);
 *   - a new state `{ ...state, items: newItems }` when items change.
 *
 * Callers wrap a non-identity result in their surface-specific
 * `recalculateTotals` (which composes surface-specific concerns like
 * depositCredit/priorPaymentsTotal for Sale or mobileSurcharge for Quote
 * into the totals).
 *
 * Behavioral parity is byte-equivalent to ticket-reducer.ts:180-347
 * pre-extraction (the "Sale is the reference" rule from
 * POS_SALE_VS_QUOTES_PARITY_AUDIT.md) modulo the `customPriceChildBehavior`
 * knob controlling whether custom-priced child items insert after-parent or
 * append.
 *
 * Architectural notes:
 *   - The `<S extends { items: TicketItem[] }>` generic preserves surface-
 *     specific state fields (deposit/edit-mode/mobile/quote-meta/etc.) via
 *     spread; this helper only touches `state.items`.
 *   - The duplicate guard mirrors pre-extraction ticket-reducer.ts:184-229:
 *     same service + same tier (scope/specialty) + same parent context →
 *     increment perUnitQty for per-unit-like existing OR no-op for
 *     non-per-unit-like existing (silent — surface decides whether to toast).
 *   - `isScopeTierWithQty` captures the per-row tier case (Bug 1 root) and
 *     applies `qtyMultiplier` uniformly across unitPrice/standardPrice/
 *     saleEffectivePrice — the bug Patch A fixed and this extraction makes
 *     structural.
 *   - Combo guard excludes BOTH per-unit and scope-tier-with-qty (combo
 *     prices are per-line-item fixed values and don't compose with per-row
 *     math).
 */
export function applyAddService<S extends { items: TicketItem[] }>(
  state: S,
  action: AddServiceAction,
  options: ApplyAddServiceOptions,
): S {
  const { service, pricing, vehicleSizeClass, perUnitQty, parentItemId, comboPrice, comboPrimaryServiceId, prerequisiteNote, prerequisiteForServiceId, customPrice, customNote } = action;

  // Duplicate guard — mirror pre-extraction ticket-reducer.ts:184-229.
  const useTierMatching = service.pricing_model === 'scope' || service.pricing_model === 'specialty';
  const pricingTierName = pricing ? (pricing.tier_label || pricing.tier_name) : null;
  const existing = state.items.find(
    (i) =>
      i.itemType === 'service' &&
      i.serviceId === service.id &&
      i.parentItemId === (parentItemId ?? null) &&
      (!useTierMatching || !pricingTierName || i.tierName === pricingTierName)
  );

  if (existing) {
    const isExistingPerUnit = existing.perUnitQty != null && existing.perUnitPrice != null;

    if (isExistingPerUnit) {
      const max = existing.perUnitMax ?? service.per_unit_max ?? 10;
      if (existing.perUnitQty! >= max) {
        return state; // At max — no-op; reference-equal return.
      }
      const newQty = existing.perUnitQty! + 1;
      const newStdPrice = existing.perUnitPrice! * newQty;
      const salePPU = existing.pricingType === 'sale' && existing.saleEffectivePrice != null && existing.perUnitQty
        ? existing.saleEffectivePrice / existing.perUnitQty
        : null;
      const unitPrice = salePPU != null ? salePPU * newQty : newStdPrice;
      const newSaleEff = salePPU != null ? salePPU * newQty : null;
      const items = state.items.map((item) =>
        item.id === existing.id
          ? {
              ...item,
              perUnitQty: newQty,
              unitPrice,
              standardPrice: newStdPrice,
              saleEffectivePrice: newSaleEff,
              totalPrice: unitPrice * item.quantity,
              taxAmount: calculateItemTax(unitPrice * item.quantity, item.isTaxable),
            }
          : item
      );
      return { ...state, items };
    }

    // Non-per-unit-like existing → no-op (reference-equal return).
    return state;
  }

  const isPerUnit = service.pricing_model === 'per_unit' && perUnitQty && service.per_unit_price != null;
  const isScopeTierWithQty = !isPerUnit && !!perUnitQty && !!pricing?.max_qty && pricing.max_qty > 1;

  // Custom price override from specialty gate modal — bypass normal pricing
  // resolution. The customPriceChildBehavior knob governs the parentItemId
  // case for this branch only (see ApplyAddServiceOptions docs).
  if (typeof customPrice === 'number') {
    const totalPrice = customPrice;
    const newItem: TicketItem = {
      id: generateId(),
      itemType: 'service',
      productId: null,
      serviceId: service.id,
      categoryId: service.category_id ?? null,
      itemName: service.name,
      quantity: 1,
      unitPrice: totalPrice,
      totalPrice,
      taxAmount: calculateItemTax(totalPrice, service.is_taxable),
      isTaxable: service.is_taxable,
      tierName: pricing.tier_label || pricing.tier_name,
      vehicleSizeClass,
      notes: customNote || null,
      perUnitQty: null,
      perUnitLabel: null,
      perUnitPrice: null,
      perUnitMax: null,
      parentItemId: parentItemId ?? null,
      standardPrice: totalPrice,
      pricingType: 'standard',
      comboSourcePrimaryId: null,
      saleEffectivePrice: null,
      isCustomPrice: true,
      prerequisiteNote: prerequisiteNote ?? null,
      prerequisiteForServiceId: prerequisiteForServiceId ?? null,
    };
    if (parentItemId && options.customPriceChildBehavior === 'after-parent') {
      return { ...state, items: insertAfterParent(state.items, parentItemId, newItem) };
    }
    return { ...state, items: [...state.items, newItem] };
  }

  // Resolve pricing with sale awareness (always pass window — null dates = no time limit).
  const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
  const resolved = resolveServicePriceWithSale(pricing, vehicleSizeClass, saleWindow);

  // Effective price: lowest of sale vs combo wins. Combo excluded for per-unit
  // AND scope-tier-with-qty — combo prices are per-line-item fixed values and
  // don't compose with per-row math.
  let effectivePrice = resolved.effectivePrice;
  let pricingType: 'standard' | 'sale' | 'combo' = resolved.isOnSale ? 'sale' : 'standard';
  let comboSourceId: string | null = null;
  const saleEffective = resolved.isOnSale ? resolved.effectivePrice : null;

  if (!isPerUnit && !isScopeTierWithQty && comboPrice != null && comboPrice < resolved.standardPrice) {
    if (comboPrice <= effectivePrice) {
      effectivePrice = comboPrice;
      pricingType = 'combo';
      comboSourceId = comboPrimaryServiceId ?? null;
    }
  }

  // qtyMultiplier scales prices when scope-tier-with-qty (per-row tier).
  // For non-scope-tier-with-qty, multiplier is 1 (no-op).
  const qtyMultiplier = isScopeTierWithQty ? perUnitQty! : 1;
  const unitPrice = effectivePrice * qtyMultiplier;
  const totalPrice = unitPrice;
  const newItem: TicketItem = {
    id: generateId(),
    itemType: 'service',
    productId: null,
    serviceId: service.id,
    categoryId: service.category_id ?? null,
    itemName: service.name,
    quantity: 1,
    unitPrice,
    totalPrice,
    taxAmount: calculateItemTax(totalPrice, service.is_taxable),
    isTaxable: service.is_taxable,
    tierName: pricing.tier_label || pricing.tier_name,
    vehicleSizeClass,
    notes: null,
    perUnitQty: isPerUnit ? perUnitQty
      : isScopeTierWithQty ? perUnitQty
      : null,
    perUnitLabel: isPerUnit ? (service.per_unit_label ?? null)
      : isScopeTierWithQty ? (pricing.qty_label ?? pricing.tier_label ?? null)
      : null,
    perUnitPrice: isPerUnit ? service.per_unit_price!
      : isScopeTierWithQty ? resolved.standardPrice
      : null,
    perUnitMax: isPerUnit ? (service.per_unit_max ?? null)
      : isScopeTierWithQty ? pricing.max_qty
      : null,
    parentItemId: parentItemId ?? null,
    standardPrice: resolved.standardPrice * qtyMultiplier,
    pricingType,
    comboSourcePrimaryId: comboSourceId,
    saleEffectivePrice: saleEffective != null ? saleEffective * qtyMultiplier : null,
    prerequisiteNote: prerequisiteNote ?? null,
    prerequisiteForServiceId: prerequisiteForServiceId ?? null,
  };

  // Child addon → insert immediately after parent's last existing child.
  if (parentItemId) {
    return { ...state, items: insertAfterParent(state.items, parentItemId, newItem) };
  }

  return { ...state, items: [...state.items, newItem] };
}
