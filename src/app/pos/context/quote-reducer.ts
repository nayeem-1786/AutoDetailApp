import type { QuoteState, QuoteAction, TicketItem } from '../types';
import { calculateItemTax, calculateTicketTotals } from '../utils/tax';
import { resolveServicePrice } from '../utils/pricing';

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
  const totals = calculateTicketTotals(state.items, discountAmount);
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
        };
        items = [...state.items, newItem];
      }
      return recalculateTotals({ ...state, items });
    }

    case 'ADD_SERVICE': {
      const { service, pricing, vehicleSizeClass, perUnitQty } = action;
      const isPerUnit = service.pricing_model === 'per_unit' && perUnitQty && service.per_unit_price != null;
      const unitPrice = isPerUnit
        ? service.per_unit_price! * perUnitQty
        : resolveServicePrice(pricing, vehicleSizeClass);
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
        perUnitQty: isPerUnit ? perUnitQty : null,
        perUnitLabel: isPerUnit ? (service.per_unit_label ?? null) : null,
        perUnitPrice: isPerUnit ? service.per_unit_price! : null,
        perUnitMax: isPerUnit ? (service.per_unit_max ?? null) : null,
      };
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
        const unitPrice = item.perUnitPrice * perUnitQty;
        return {
          ...item,
          perUnitQty,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          taxAmount: calculateItemTax(unitPrice * item.quantity, item.isTaxable),
        };
      });
      return recalculateTotals({ ...state, items });
    }

    case 'REMOVE_ITEM': {
      const items = state.items.filter((i) => i.id !== action.itemId);
      return recalculateTotals({ ...state, items });
    }

    case 'SET_CUSTOMER': {
      return { ...state, customer: action.customer };
    }

    case 'SET_VEHICLE': {
      return { ...state, vehicle: action.vehicle };
    }

    case 'RECALCULATE_VEHICLE_PRICES': {
      const { vehicle, services } = action;
      const sizeClass = vehicle?.size_class ?? null;

      const items = state.items.map((item) => {
        if (item.itemType !== 'service' || !item.serviceId || !item.tierName) {
          return item;
        }
        const service = services.find((s) => s.id === item.serviceId);
        const pricingTier = service?.pricing?.find(
          (p) => p.tier_name === item.tierName
        );
        if (!pricingTier) return item;

        const unitPrice = resolveServicePrice(pricingTier, sizeClass);
        const totalPrice = unitPrice * item.quantity;
        return {
          ...item,
          unitPrice,
          totalPrice,
          taxAmount: calculateItemTax(totalPrice, item.isTaxable),
          vehicleSizeClass: sizeClass,
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

    case 'CLEAR_QUOTE': {
      const defaultValidUntil = new Date();
      defaultValidUntil.setDate(defaultValidUntil.getDate() + 10);
      const validUntil = defaultValidUntil.toISOString().split('T')[0];
      return { ...initialQuoteState, validUntil };
    }

    default:
      return state;
  }
}
