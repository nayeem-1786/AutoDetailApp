import type { TicketState, TicketAction, TicketItem } from '../types';
import { calculateItemTax, calculateTicketTotals } from '../utils/tax';
import { resolveServicePriceWithSale } from '../utils/pricing';

export const initialTicketState: TicketState = {
  items: [],
  customer: null,
  vehicle: null,
  coupon: null,
  loyaltyPointsToRedeem: 0,
  loyaltyDiscount: 0,
  manualDiscount: null,
  depositCredit: 0,
  depositDate: null,
  priorPayments: [],
  priorPaymentsTotal: 0,
  notes: null,
  subtotal: 0,
  taxAmount: 0,
  discountAmount: 0,
  total: 0,
  // Item 15f Phase 1 Layer 8b — edit-mode fields default to "fresh ticket".
  // CLEAR_TICKET returns initialTicketState, so the 4 fields auto-reset on
  // every "New Sale" / F1 invocation — no state-leak from a prior edit.
  source: 'new',
  sourceId: null,
  returnTo: null,
  editMode: false,
};

function generateId(): string {
  // Fallback for older Safari/iPad that lack crypto.randomUUID()
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function recalculateTotals(state: TicketState): TicketState {
  // Calculate subtotal first for percentage-based manual discount
  const subtotal = state.items.reduce((sum, item) => sum + item.totalPrice, 0);

  let manualDiscountAmount = 0;
  if (state.manualDiscount) {
    if (state.manualDiscount.type === 'dollar') {
      manualDiscountAmount = state.manualDiscount.value;
    } else {
      manualDiscountAmount = Math.round(subtotal * state.manualDiscount.value / 100 * 100) / 100;
    }
  }

  const discountAmount =
    (state.coupon?.discount ?? 0) + state.loyaltyDiscount + manualDiscountAmount;
  const totals = calculateTicketTotals(
    state.items,
    discountAmount,
    state.depositCredit,
    state.priorPaymentsTotal
  );
  return { ...state, ...totals };
}

export function ticketReducer(
  state: TicketState,
  action: TicketAction
): TicketState {
  switch (action.type) {
    case 'ADD_PRODUCT': {
      const { product } = action;
      // Check if product already in ticket — increment quantity
      const existing = state.items.find(
        (i) => i.itemType === 'product' && i.productId === product.id
      );

      let items: TicketItem[];
      if (existing) {
        items = state.items.map((item) =>
          item.id === existing.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: item.unitPrice * (item.quantity + 1),
                taxAmount: calculateItemTax(
                  item.unitPrice * (item.quantity + 1),
                  item.isTaxable
                ),
              }
            : item
        );
      } else {
        const totalPrice = product.retail_price;
        const newItem: TicketItem = {
          id: generateId(),
          itemType: 'product',
          productId: product.id,
          serviceId: null,
          categoryId: product.category_id ?? null,
          itemName: product.name,
          quantity: 1,
          unitPrice: product.retail_price,
          totalPrice,
          taxAmount: calculateItemTax(totalPrice, product.is_taxable),
          isTaxable: product.is_taxable,
          tierName: null,
          vehicleSizeClass: null,
          notes: null,
          perUnitQty: null,
          perUnitLabel: null,
          perUnitPrice: null,
          perUnitMax: null,
          parentItemId: null,
          standardPrice: product.retail_price,
          pricingType: 'standard',
          comboSourcePrimaryId: null,
          saleEffectivePrice: null,
          prerequisiteNote: null,
          prerequisiteForServiceId: null,
        };
        items = [...state.items, newItem];
      }
      return recalculateTotals({ ...state, items });
    }

    case 'ADD_SERVICE': {
      const { service, pricing, vehicleSizeClass, perUnitQty, parentItemId, comboPrice, comboPrimaryServiceId, prerequisiteNote, prerequisiteForServiceId, customPrice, customNote } = action;

      // Duplicate guard: check if this service (same serviceId, same tier, same parent context) already exists
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
            // At max — no-op
            return state;
          }
          // Increment per-unit quantity inline
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
          return recalculateTotals({ ...state, items });
        }

        // Non-per-unit service already on ticket — no-op
        return state;
      }

      const isPerUnit = service.pricing_model === 'per_unit' && perUnitQty && service.per_unit_price != null;
      const isScopeTierWithQty = !isPerUnit && !!perUnitQty && !!pricing?.max_qty && pricing.max_qty > 1;

      // Custom price override from specialty gate modal — bypass normal pricing resolution
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
          saleEffectivePrice: null,
          pricingType: 'standard',
          comboSourcePrimaryId: null,
          isCustomPrice: true,
          prerequisiteNote: prerequisiteNote ?? null,
          prerequisiteForServiceId: prerequisiteForServiceId ?? null,
        };
        return recalculateTotals({ ...state, items: [...state.items, newItem] });
      }

      // Resolve pricing with sale awareness (always pass window — null dates = no time limit)
      const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
      const resolved = resolveServicePriceWithSale(pricing, vehicleSizeClass, saleWindow);

      // Determine effective price: lowest of sale vs combo wins
      let effectivePrice = resolved.effectivePrice;
      let pricingType: 'standard' | 'sale' | 'combo' = resolved.isOnSale ? 'sale' : 'standard';
      let comboSourceId: string | null = null;
      const saleEffective = resolved.isOnSale ? resolved.effectivePrice : null;

      if (!isPerUnit && !isScopeTierWithQty && comboPrice != null && comboPrice < resolved.standardPrice) {
        if (comboPrice <= effectivePrice) {
          // Combo price wins (or ties — prefer combo for display)
          effectivePrice = comboPrice;
          pricingType = 'combo';
          comboSourceId = comboPrimaryServiceId ?? null;
        }
        // else sale price is lower, keep sale
      }

      // When scope tier has qty, multiply prices by quantity
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

      // If this is a child addon, insert immediately after the parent's last child
      if (parentItemId) {
        const items = [...state.items];
        const parentIdx = items.findIndex((i) => i.id === parentItemId);
        if (parentIdx >= 0) {
          // Find the last consecutive child of this parent after parentIdx
          let insertIdx = parentIdx + 1;
          while (insertIdx < items.length && items[insertIdx].parentItemId === parentItemId) {
            insertIdx++;
          }
          items.splice(insertIdx, 0, newItem);
          return recalculateTotals({ ...state, items });
        }
      }

      return recalculateTotals({
        ...state,
        items: [...state.items, newItem],
      });
    }

    case 'ADD_CUSTOM_ITEM': {
      const { name, price, isTaxable } = action;
      const newItem: TicketItem = {
        id: generateId(),
        itemType: 'custom',
        productId: null,
        serviceId: null,
        categoryId: null,
        itemName: name,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        taxAmount: calculateItemTax(price, isTaxable),
        isTaxable,
        tierName: null,
        vehicleSizeClass: null,
        notes: null,
        perUnitQty: null,
        perUnitLabel: null,
        perUnitPrice: null,
        perUnitMax: null,
        parentItemId: null,
        standardPrice: price,
        pricingType: 'standard',
        comboSourcePrimaryId: null,
        saleEffectivePrice: null,
        prerequisiteNote: null,
        prerequisiteForServiceId: null,
      };
      return recalculateTotals({
        ...state,
        items: [...state.items, newItem],
      });
    }

    case 'UPDATE_ITEM_QUANTITY': {
      const { itemId, quantity } = action;
      if (quantity < 1) {
        // Remove item if quantity goes below 1
        const items = state.items.filter((i) => i.id !== itemId);
        return recalculateTotals({ ...state, items });
      }
      const items = state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity,
              totalPrice: item.unitPrice * quantity,
              taxAmount: calculateItemTax(
                item.unitPrice * quantity,
                item.isTaxable
              ),
            }
          : item
      );
      return recalculateTotals({ ...state, items });
    }

    case 'UPDATE_PER_UNIT_QTY': {
      const { itemId, perUnitQty } = action;
      if (perUnitQty < 1) {
        const items = state.items.filter((i) => i.id !== itemId);
        return recalculateTotals({ ...state, items });
      }
      const items = state.items.map((item) => {
        if (item.id !== itemId || !item.perUnitPrice) return item;
        const newStandardPrice = item.perUnitPrice * perUnitQty;
        // Use sale per-unit price when on sale
        const salePricePerUnit = item.pricingType === 'sale' && item.saleEffectivePrice != null && item.perUnitQty
          ? item.saleEffectivePrice / item.perUnitQty
          : null;
        const unitPrice = salePricePerUnit != null ? salePricePerUnit * perUnitQty : newStandardPrice;
        const newSaleEffective = salePricePerUnit != null ? salePricePerUnit * perUnitQty : null;
        return {
          ...item,
          perUnitQty,
          unitPrice,
          standardPrice: newStandardPrice,
          saleEffectivePrice: newSaleEffective,
          totalPrice: unitPrice * item.quantity,
          taxAmount: calculateItemTax(unitPrice * item.quantity, item.isTaxable),
        };
      });
      return recalculateTotals({ ...state, items });
    }

    case 'REMOVE_ITEM': {
      // Find any children of the removed item
      const children = state.items.filter((i) => i.parentItemId === action.itemId);

      // Combo-priced children get promoted to standalone; others are removed
      const promotedChildren = children
        .filter((child) => child.pricingType === 'combo')
        .map((child) => {
          // Revert to sale price if available, otherwise standard
          const revertPrice = child.saleEffectivePrice ?? child.standardPrice;
          const newPricingType: 'sale' | 'standard' = child.saleEffectivePrice != null ? 'sale' : 'standard';
          const totalPrice = revertPrice * child.quantity;
          return {
            ...child,
            parentItemId: null,
            unitPrice: revertPrice,
            totalPrice,
            taxAmount: calculateItemTax(totalPrice, child.isTaxable),
            pricingType: newPricingType,
            comboSourcePrimaryId: null,
          };
        });

      const removedChildIds = new Set(
        children.filter((child) => child.pricingType !== 'combo').map((c) => c.id)
      );

      const items = state.items
        .filter((i) => i.id !== action.itemId && !removedChildIds.has(i.id))
        .map((i) => {
          const promoted = promotedChildren.find((p) => p.id === i.id);
          return promoted ?? i;
        });

      return recalculateTotals({ ...state, items });
    }

    case 'RESTORE_ITEM': {
      const { item, index } = action;
      // Don't restore if item already exists (duplicate undo)
      if (state.items.some((i) => i.id === item.id)) return state;
      const items = [...state.items];
      // Insert at original index, or at end if index is out of range
      const insertAt = Math.min(index, items.length);
      items.splice(insertAt, 0, item);
      return recalculateTotals({ ...state, items });
    }

    case 'SET_CUSTOMER': {
      return { ...state, customer: action.customer };
    }

    case 'SET_VEHICLE': {
      // Session 31: atomic vehicle-change action — also reprices service items against the new size_class.
      // Belt-and-suspenders guard via action param (primary guard is UI disable at button level).
      if (action.blockedByPayment === true) {
        console.warn('[SET_VEHICLE] Refused: payment in flight');
        return state;
      }

      const { vehicle, services } = action;
      const sizeClass = vehicle?.size_class ?? null;

      // No items or clearing vehicle — just update the vehicle field.
      if (!vehicle || state.items.length === 0) {
        return { ...state, vehicle };
      }

      // Reprice service items against the new vehicle's size_class.
      const items = state.items.map((item) => {
        if (item.itemType !== 'service' || !item.serviceId || !item.tierName) {
          return item;
        }
        // Skip per-unit services (no vehicle-size pricing)
        if (item.perUnitQty != null && item.perUnitPrice != null) return item;
        // Skip custom-priced items — staff override is preserved
        if (item.isCustomPrice === true) return item;

        const service = services.find((s) => s.id === item.serviceId);
        if (!service) return item;

        // Session 32: branch tier lookup by pricing_model.
        // - vehicle_size: each tier row IS a size_class (separate rows, is_vehicle_size_aware:false).
        //   Match the NEW size_class — do NOT rely on the item's stored tierName (that's the OLD size).
        // - specialty: match the new vehicle's specialty_tier; fall back to stored tierName if unset.
        // - scope / others: keep Session 31.5 tierName-matching (label OR key) — those rows are shape-invariant
        //   across vehicle swaps; size variance lives in the per-size columns resolved by resolveServicePrice.
        let pricingTier: import('@/lib/supabase/types').ServicePricing | null = null;
        let repriceFailed: TicketItem['repriceFailed'] | undefined = undefined;

        if (service.pricing_model === 'vehicle_size') {
          pricingTier = service.pricing?.find((p) => p.tier_name === sizeClass) ?? null;
          if (!pricingTier) {
            repriceFailed = {
              reason: 'no_tier_for_size',
              attemptedSize: sizeClass,
              previousSize: item.vehicleSizeClass,
              previousTierName: item.tierName ?? '',
            };
            return { ...item, vehicleSizeClass: sizeClass, repriceFailed };
          }
        } else if (service.pricing_model === 'specialty') {
          const newSpecialtyTier = vehicle?.specialty_tier ?? null;
          if (newSpecialtyTier) {
            pricingTier = service.pricing?.find((p) => p.tier_name === newSpecialtyTier) ?? null;
          }
          if (!pricingTier) {
            pricingTier = service.pricing?.find(
              (p) => p.tier_name === item.tierName || p.tier_label === item.tierName
            ) ?? null;
          }
          if (!pricingTier) {
            repriceFailed = {
              reason: 'no_tier_for_size',
              attemptedSize: sizeClass,
              previousSize: item.vehicleSizeClass,
              previousTierName: item.tierName ?? '',
            };
            return { ...item, vehicleSizeClass: sizeClass, repriceFailed };
          }
        } else {
          pricingTier = service.pricing?.find(
            (p) => p.tier_name === item.tierName || p.tier_label === item.tierName
          ) ?? null;
          if (!pricingTier) return item;
        }

        // Resolve with sale awareness (always pass window — null dates = no time limit)
        const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
        const resolved = resolveServicePriceWithSale(pricingTier, sizeClass, saleWindow);

        // Re-evaluate combo vs sale (lowest wins)
        let effectivePrice = resolved.effectivePrice;
        let pricingType: 'standard' | 'sale' | 'combo' = resolved.isOnSale ? 'sale' : 'standard';
        let comboSourceId = item.comboSourcePrimaryId;
        const saleEffective = resolved.isOnSale ? resolved.effectivePrice : null;

        // If this was a combo item and still has a parent, check combo price
        if (item.comboSourcePrimaryId && item.parentItemId) {
          // Combo price doesn't change with vehicle size — it's a fixed value
          const currentComboPrice = item.unitPrice;
          if (currentComboPrice <= effectivePrice) {
            effectivePrice = currentComboPrice;
            pricingType = 'combo';
          } else {
            comboSourceId = null;
          }
        }

        const unitPrice = effectivePrice;
        const totalPrice = unitPrice * item.quantity;
        // For vehicle_size / specialty reprice, the tier row itself changed — update tierName too.
        // For scope / others, tierName is invariant across swaps.
        const updatedTierName =
          service.pricing_model === 'vehicle_size' || service.pricing_model === 'specialty'
            ? (pricingTier.tier_label || pricingTier.tier_name)
            : item.tierName;
        return {
          ...item,
          unitPrice,
          totalPrice,
          taxAmount: calculateItemTax(totalPrice, item.isTaxable),
          vehicleSizeClass: sizeClass,
          tierName: updatedTierName,
          standardPrice: resolved.standardPrice,
          pricingType,
          comboSourcePrimaryId: comboSourceId,
          saleEffectivePrice: saleEffective,
          // Clear any stale repriceFailed flag — this reprice succeeded.
          repriceFailed: undefined,
        };
      });

      return recalculateTotals({ ...state, vehicle, items });
    }

    case 'SET_COUPON': {
      return recalculateTotals({ ...state, coupon: action.coupon });
    }

    case 'SET_LOYALTY_REDEEM': {
      return recalculateTotals({
        ...state,
        loyaltyPointsToRedeem: action.points,
        loyaltyDiscount: action.discount,
      });
    }

    case 'APPLY_MANUAL_DISCOUNT': {
      return recalculateTotals({
        ...state,
        manualDiscount: {
          type: action.discountType,
          value: action.value,
          label: action.label,
        },
      });
    }

    case 'REMOVE_MANUAL_DISCOUNT': {
      return recalculateTotals({
        ...state,
        manualDiscount: null,
      });
    }

    case 'SET_NOTES': {
      return { ...state, notes: action.notes };
    }

    case 'UPDATE_ITEM_NOTE': {
      const items = state.items.map((item) =>
        item.id === action.itemId
          ? { ...item, notes: action.note }
          : item
      );
      return { ...state, items };
    }

    case 'RESTORE_TICKET': {
      // Defensive normalization for sessionStorage payloads predating the
      // priorPayments fields — older tickets in the held-tickets queue or
      // an open browser tab on deploy would otherwise have these as undefined.
      //
      // Item 15f Phase 1 Layer 8b: edit-mode is NEVER restored from
      // sessionStorage. The drain (`ENTER_EDIT_MODE`) is the only entry into
      // edit mode, and it always re-fetches the underlying record. A page
      // refresh that loses the deep-link URL (operator navigates to bare
      // `/pos`) would otherwise surface stale `editMode: true` with a sourceId
      // pointing at a record the operator can no longer save back to.
      return recalculateTotals({
        ...action.state,
        priorPayments: action.state.priorPayments ?? [],
        priorPaymentsTotal: action.state.priorPaymentsTotal ?? 0,
        source: 'new',
        sourceId: null,
        returnTo: null,
        editMode: false,
      });
    }

    case 'CLEAR_TICKET': {
      return { ...initialTicketState };
    }

    case 'ENTER_EDIT_MODE': {
      // Item 15f Phase 1 Layer 8b — replace state with hydrated `ticketData`
      // AND stamp the 4 edit-mode fields from the action params. The reducer
      // overwrites source/sourceId/returnTo/editMode unconditionally so the
      // caller can pass a `ticketData` shaped exactly like `RESTORE_TICKET`'s
      // payload without having to mirror the edit-mode fields.
      return recalculateTotals({
        ...action.ticketData,
        priorPayments: action.ticketData.priorPayments ?? [],
        priorPaymentsTotal: action.ticketData.priorPaymentsTotal ?? 0,
        source: action.source,
        sourceId: action.sourceId,
        returnTo: action.returnTo,
        editMode: true,
      });
    }

    case 'EXIT_EDIT_MODE': {
      return {
        ...state,
        source: 'new',
        sourceId: null,
        returnTo: null,
        editMode: false,
      };
    }

    default:
      return state;
  }
}
