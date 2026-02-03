import type {
  Customer,
  Vehicle,
  VehicleSizeClass,
  Product,
  Service,
  ServicePricing,
  ProductCategory,
  ServiceCategory,
} from '@/lib/supabase/types';

// ─── Ticket Item ───────────────────────────────────────────────

export interface TicketItem {
  id: string; // client-generated UUID
  itemType: 'product' | 'service' | 'custom';
  productId: string | null;
  serviceId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number; // unitPrice * quantity
  taxAmount: number; // isTaxable ? totalPrice * TAX_RATE : 0
  isTaxable: boolean;
  tierName: string | null;
  vehicleSizeClass: VehicleSizeClass | null;
  notes: string | null;
}

// ─── Ticket State ──────────────────────────────────────────────

export interface TicketState {
  items: TicketItem[];
  customer: Customer | null;
  vehicle: Vehicle | null;
  coupon: { id: string; code: string; discount: number } | null;
  loyaltyPointsToRedeem: number;
  loyaltyDiscount: number;
  manualDiscount: { type: 'dollar' | 'percent'; value: number; label: string } | null;
  notes: string | null;
  // Computed totals
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

// ─── Ticket Actions ────────────────────────────────────────────

export type TicketAction =
  | { type: 'ADD_PRODUCT'; product: Product }
  | { type: 'ADD_SERVICE'; service: Service; pricing: ServicePricing; vehicleSizeClass: VehicleSizeClass | null }
  | { type: 'ADD_CUSTOM_ITEM'; name: string; price: number; isTaxable: boolean }
  | { type: 'UPDATE_ITEM_QUANTITY'; itemId: string; quantity: number }
  | { type: 'REMOVE_ITEM'; itemId: string }
  | { type: 'SET_CUSTOMER'; customer: Customer | null }
  | { type: 'SET_VEHICLE'; vehicle: Vehicle | null }
  | { type: 'RECALCULATE_VEHICLE_PRICES'; vehicle: Vehicle | null; services: Service[] }
  | { type: 'SET_COUPON'; coupon: { id: string; code: string; discount: number } | null }
  | { type: 'SET_LOYALTY_REDEEM'; points: number; discount: number }
  | { type: 'SET_NOTES'; notes: string | null }
  | { type: 'UPDATE_ITEM_NOTE'; itemId: string; note: string | null }
  | { type: 'APPLY_MANUAL_DISCOUNT'; discountType: 'dollar' | 'percent'; value: number; label: string }
  | { type: 'REMOVE_MANUAL_DISCOUNT' }
  | { type: 'RESTORE_TICKET'; state: TicketState }
  | { type: 'CLEAR_TICKET' };

// ─── Catalog types ─────────────────────────────────────────────

export interface CatalogProduct extends Product {
  category?: ProductCategory;
}

export interface CatalogService extends Service {
  category?: ServiceCategory;
  pricing?: ServicePricing[];
}

// ─── Favorites ────────────────────────────────────────────────

export type FavoriteActionType = 'product' | 'service' | 'custom_amount' | 'customer_lookup' | 'discount' | 'surcharge';

export interface FavoriteItem {
  id: string;
  type: FavoriteActionType;
  referenceId: string | null;
  label: string;
  color: FavoriteColor;
  percentage?: number; // For surcharge type: X% of subtotal
}

export type FavoriteColor = 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'amber' | 'teal' | 'pink';
