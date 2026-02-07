import type { TicketState, TicketAction, TicketItem } from '../types';
import { calculateItemTax, calculateTicketTotals } from '../utils/tax';
import { resolveServicePrice } from '../utils/pricing';

export const initialTicketState: TicketState = {
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
  const totals = calculateTicketTotals(state.items, discountAmount);
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
          itemName: product.name,
          quantity: 1,
          unitPrice: product.retail_price,
          totalPrice,
          taxAmount: calculateItemTax(totalPrice, product.is_taxable),
          isTaxable: product.is_taxable,
          tierName: null,
          vehicleSizeClass: null,
          notes: null,
        };
        items = [...state.items, newItem];
      }
      return recalculateTotals({ ...state, items });
    }

    case 'ADD_SERVICE': {
      const { service, pricing, vehicleSizeClass } = action;
      const unitPrice = resolveServicePrice(pricing, vehicleSizeClass);
      const totalPrice = unitPrice;
      const newItem: TicketItem = {
        id: generateId(),
        itemType: 'service',
        productId: null,
        serviceId: service.id,
        itemName: service.name,
        quantity: 1,
        unitPrice,
        totalPrice,
        taxAmount: calculateItemTax(totalPrice, service.is_taxable),
        isTaxable: service.is_taxable,
        tierName: pricing.tier_label || pricing.tier_name,
        vehicleSizeClass,
        notes: null,
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
        itemName: name,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        taxAmount: calculateItemTax(price, isTaxable),
        isTaxable,
        tierName: null,
        vehicleSizeClass: null,
        notes: null,
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

    case 'RESTORE_TICKET': {
      return { ...action.state };
    }

    case 'CLEAR_TICKET': {
      return { ...initialTicketState };
    }

    default:
      return state;
  }
}
