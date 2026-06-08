import type { QuoteState, QuoteAction, TicketItem } from '../types';
import { calculateItemTax, calculateTicketTotals } from '../utils/tax';
import { resolveServicePriceWithSale } from '../utils/pricing';
import { applyAddService } from '../utils/apply-add-service';
import { applyAddProduct } from '../utils/apply-add-product';
import { applyAddCustomItem } from '../utils/apply-add-custom-item';
import { applyUpdateItemQuantity } from '../utils/apply-update-item-quantity';
import { applyUpdatePerUnitQty } from '../utils/apply-update-per-unit-qty';
import { applyRemoveItem } from '../utils/apply-remove-item';
import { applySetCustomer } from '../utils/apply-set-customer';
import { generateId } from '../utils/generate-id';

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
      // C.1 step 2 — delegated to shared helper. ADD_PRODUCT always changes
      // items[] (existing match → quantity++; no match → append new item), so
      // the helper never returns reference-equal state and the delegator
      // unconditionally calls recalculateTotals (no `next === state` check
      // unlike ADD_SERVICE; this is structural, not optimization-related).
      return recalculateTotals(applyAddProduct(state, action));
    }

    case 'ADD_SERVICE': {
      // C.1 step 1 — delegated to shared helper. Returns state reference-equal
      // when no items change (duplicate non-per-unit-like no-op); otherwise a
      // new state object that we wrap in recalculateTotals (which composes
      // mobileSurcharge for Quote-side totals).
      // `customPriceChildBehavior: 'after-parent'` preserves Quote's pre-extraction
      // byte-behavior for custom-priced child items — see ApplyAddServiceOptions
      // docs for the operator-authorized divergence rationale.
      const next = applyAddService(state, action, { customPriceChildBehavior: 'after-parent' });
      return next === state ? state : recalculateTotals(next);
    }

    case 'ADD_CUSTOM_ITEM': {
      // C.1 step 3 — delegated to shared helper. ADD_CUSTOM_ITEM always
      // appends a new item (no dedup — custom items have no stable identity
      // to match), so the helper never returns reference-equal state.
      return recalculateTotals(applyAddCustomItem(state, action));
    }

    case 'UPDATE_ITEM_QUANTITY': {
      // C.1 step 4 — delegated to shared helper. Items[] always changes
      // (either filtered when quantity < 1, or mapped when quantity ≥ 1).
      return recalculateTotals(applyUpdateItemQuantity(state, action));
    }

    case 'UPDATE_PER_UNIT_QTY': {
      // C.1 step 5 — delegated to shared helper.
      return recalculateTotals(applyUpdatePerUnitQty(state, action));
    }

    case 'REMOVE_ITEM': {
      // C.1 step 6 — delegated to shared helper. Combo children promoted to
      // standalone; non-combo children removed alongside parent.
      return recalculateTotals(applyRemoveItem(state, action));
    }

    case 'SET_CUSTOMER': {
      // C.1 step 7 — delegated to shared helper. Truly byte-identical extraction.
      // Customer change has no totals impact, so no recalculateTotals wrap (mirrors
      // pre-extraction behavior). No `next === state` ref-equal check — helper
      // unconditionally returns a new object via spread.
      return applySetCustomer(state, action);
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
