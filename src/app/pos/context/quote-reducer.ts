import type { QuoteState, QuoteAction, TicketItem } from '../types';
import { calculateItemTax, calculateTicketTotals } from '../utils/tax';
import { resolveServicePriceWithSale } from '../utils/pricing';

export const initialQuoteState: QuoteState = {
  items: [],
  customer: null,
  vehicle: null,
  coupon: null,
  loyaltyPointsToRedeem: 0,
  loyaltyDiscount: 0,
  manualDiscount: null,
  notes: null,
  subtotal: 0,
  taxAmount: 0,
  discountAmount: 0,
  total: 0,
  // Quote-specific
  quoteId: null,
  quoteNumber: null,
  validUntil: null,
  status: null,
  // Mobile (Option D2)
  mobile: {
    isMobile: false,
    zoneId: null,
    address: '',
    surcharge: 0,
    zoneNameSnapshot: '',
    isCustom: false,
  },
};

function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function recalculateTotals(state: QuoteState): QuoteState {
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
  const mobileSurcharge = state.mobile?.isMobile ? state.mobile.surcharge : 0;
  const totals = calculateTicketTotals(state.items, discountAmount, 0, 0, mobileSurcharge);
  return { ...state, ...totals };
}

export function quoteReducer(
  state: QuoteState,
  action: QuoteAction
): QuoteState {
  switch (action.type) {
    case 'ADD_PRODUCT': {
      const { product } = action;
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

      // Patch A — port ticket-reducer.ts:184-229 duplicate guard. Quote-builder.tsx:261
      // does component-layer dedup for isPerUnit only, missing scope-tier-with-qty.
      // This reducer-level guard is the canonical source of truth: same service +
      // same tier (scope/specialty) + same parent context → increment perUnitQty
      // (if applicable) or no-op. Mirrors ticket-reducer byte-for-byte so the two
      // reducers agree on duplicate semantics.
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
            return state;
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
          return recalculateTotals({ ...state, items });
        }

        // Non-per-unit service already on quote — no-op
        return state;
      }

      const isPerUnit = service.pricing_model === 'per_unit' && perUnitQty && service.per_unit_price != null;
      // Patch A — port ticket-reducer.ts:232. Scope-tier service with max_qty > 1
      // (e.g., "per_row" interior shampoo). Treated as per-unit-like for storage:
      // captures perUnitQty + perUnit metadata so the qty stepper in
      // quote-item-row.tsx:149 renders and SET_VEHICLE preserves the qty across
      // vehicle changes (see SET_VEHICLE skip-clause at quote-reducer.ts:384).
      const isScopeTierWithQty = !isPerUnit && !!perUnitQty && !!pricing?.max_qty && pricing.max_qty > 1;

      // Custom price override from specialty gate modal — bypass normal pricing
      // resolution. Quote-reducer preserves parentItemId-insert-at-correct-index
      // here (intentional divergence from ticket-reducer's custom-price branch,
      // which appends to the end of the items array — preserved per Class (b)
      // audit Finding 2; not part of the parity fix).
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
        if (parentItemId) {
          const items = [...state.items];
          const parentIdx = items.findIndex((i) => i.id === parentItemId);
          if (parentIdx >= 0) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < items.length && items[insertIdx].parentItemId === parentItemId) insertIdx++;
            items.splice(insertIdx, 0, newItem);
            return recalculateTotals({ ...state, items });
          }
        }
        return recalculateTotals({ ...state, items: [...state.items, newItem] });
      }

      // Resolve pricing with sale awareness (always pass window — null dates = no time limit)
      const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
      const resolved = resolveServicePriceWithSale(pricing, vehicleSizeClass, saleWindow);

      // Determine effective price: lowest of sale vs combo wins. Combo path is
      // excluded for per-unit AND scope-tier-with-qty (mirror ticket-reducer:278) —
      // combo prices are per-line-item fixed values and don't compose with per-row math.
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

      // Patch A — port ticket-reducer.ts:289-290. When scope-tier-with-qty, the
      // tier price is per-row; multiply by qty to get the line-item total.
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
        // Patch A — port ticket-reducer.ts:307-318. Scope-tier-with-qty captures
        // per-unit metadata using the tier's qty_label/tier_label + standardPrice +
        // max_qty so the stepper UI in quote-item-row.tsx:149 renders.
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
        // Patch A — port ticket-reducer.ts:320,323. standardPrice and
        // saleEffectivePrice both scale with qtyMultiplier so the line-item
        // totals are coherent with display state.
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

    case 'SET_CUSTOMER': {
      return { ...state, customer: action.customer };
    }

    case 'SET_VEHICLE': {
      // Session 31: atomic vehicle-change action — also reprices service items against the new size_class.
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

      const items = state.items.map((item) => {
        if (item.itemType !== 'service' || !item.serviceId || !item.tierName) {
          return item;
        }
        if (item.perUnitQty != null && item.perUnitPrice != null) return item;
        // Skip custom-priced items — staff override is preserved
        if (item.isCustomPrice === true) return item;

        const service = services.find((s) => s.id === item.serviceId);
        if (!service) return item;

        // Session 32: mirror of ticket-reducer.ts — see that file for rationale.
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

        // Always pass window — null dates = no time limit
        const saleWindow = { sale_starts_at: service.sale_starts_at, sale_ends_at: service.sale_ends_at };
        const resolved = resolveServicePriceWithSale(pricingTier, sizeClass, saleWindow);

        let effectivePrice = resolved.effectivePrice;
        let pricingType: 'standard' | 'sale' | 'combo' = resolved.isOnSale ? 'sale' : 'standard';
        let comboSourceId = item.comboSourcePrimaryId;
        const saleEffective = resolved.isOnSale ? resolved.effectivePrice : null;

        if (item.comboSourcePrimaryId && item.parentItemId) {
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

    case 'LOAD_QUOTE': {
      return { ...action.state };
    }

    case 'SET_VALID_UNTIL': {
      return { ...state, validUntil: action.date };
    }

    case 'SET_QUOTE_META': {
      // Metadata-only update — used after silent auto-save POST to capture the
      // server-assigned id/number so subsequent saves PATCH instead of POST.
      // Must NOT touch items, customer, vehicle, notes, totals, coupon, or
      // manualDiscount, which may have been edited during the in-flight save.
      return {
        ...state,
        quoteId: action.quoteId,
        quoteNumber: action.quoteNumber,
        status: action.status,
      };
    }

    case 'SET_MOBILE': {
      return recalculateTotals({ ...state, mobile: action.mobile });
    }

    case 'CLEAR_MOBILE': {
      return recalculateTotals({ ...state, mobile: initialQuoteState.mobile });
    }

    case 'CLEAR_QUOTE': {
      const days = action.validityDays ?? 10;
      const defaultValidUntil = new Date();
      defaultValidUntil.setDate(defaultValidUntil.getDate() + days);
      const validUntil = defaultValidUntil.toISOString().split('T')[0];
      return { ...initialQuoteState, validUntil };
    }

    default:
      return state;
  }
}
