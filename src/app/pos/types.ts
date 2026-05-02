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
  categoryId: string | null; // product or service category_id — used for coupon category targeting
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number; // unitPrice * quantity
  taxAmount: number; // isTaxable ? totalPrice * TAX_RATE : 0
  isTaxable: boolean;
  tierName: string | null;
  vehicleSizeClass: VehicleSizeClass | null;
  notes: string | null;
  // Per-unit pricing display info (optional, for per_unit services)
  perUnitQty: number | null;        // e.g., 2 (headlights, panels)
  perUnitLabel: string | null;       // e.g., "panel", "headlight"
  perUnitPrice: number | null;       // e.g., 150 (price per single unit)
  perUnitMax: number | null;         // max units allowed (from service.per_unit_max)
  parentItemId: string | null;       // If set, this item is a child addon of the parent item
  // Pricing provenance
  standardPrice: number;                    // Always the catalog price (never changes)
  pricingType: 'standard' | 'sale' | 'combo';  // Which discount is active
  comboSourcePrimaryId: string | null;      // Which primary service triggered combo price
  saleEffectivePrice: number | null;        // Stored so combo→sale revert works without catalog lookup
  /** True if unitPrice was manually set by staff via the custom-price modal; skip in reprice. */
  isCustomPrice?: boolean;
  /**
   * Session 32: set when a vehicle-change reprice failed because the service has no
   * tier row for the new vehicle's size_class (or new specialty_tier). The item keeps
   * its previous price; the sidebar shows an amber warning badge.
   */
  repriceFailed?: {
    reason: 'no_tier_for_size';
    attemptedSize: VehicleSizeClass | null;
    previousSize: VehicleSizeClass | null;
    previousTierName: string;
  };
  // Prerequisite tracking
  prerequisiteNote: string | null;          // "Prereq met: ..." or "Prereq overridden by ..."
  prerequisiteForServiceId: string | null;  // When added as a prereq, the dependent service's ID
}

// ─── Prior Payments ───────────────────────────────────────────
// Surfaces every payments row that hit the linked appointment, regardless
// of source (pay-link webhook, booking deposit, prior in-store POS). Lets
// the ticket panel itemize a "Payments Received" block and the totals
// computation deduct the correct remaining balance — closes the pay-link
// double-charge gap that existed when only deposit_amount was surfaced.
// Populated server-side in /api/pos/jobs/[id]/checkout-items.

export interface PriorPayment {
  amount_cents: number;
  method: 'cash' | 'card' | 'check' | 'split';
  paid_at: string; // ISO timestamp
  source_label: string; // e.g. "Online (pay link)", "Booking deposit", "Cash"
  stripe_payment_intent_id: string | null;
}

// ─── Ticket State ──────────────────────────────────────────────

export interface TicketState {
  items: TicketItem[];
  customer: Customer | null;
  vehicle: Vehicle | null;
  coupon: { id: string; code: string; discount: number; isAutoApplied?: boolean } | null;
  loyaltyPointsToRedeem: number;
  loyaltyDiscount: number;
  manualDiscount: { type: 'dollar' | 'percent'; value: number; label: string } | null;
  depositCredit: number; // Pre-paid deposit from online booking (separate from discounts)
  depositDate: string | null; // ISO date when the deposit was collected online
  priorPayments: PriorPayment[]; // Itemized prior payments for the linked appointment
  priorPaymentsTotal: number; // Sum in dollars (server-computed cents → fromCents)
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
  | { type: 'ADD_SERVICE'; service: Service & { pricing?: ServicePricing[] }; pricing: ServicePricing; vehicleSizeClass: VehicleSizeClass | null; perUnitQty?: number; parentItemId?: string; comboPrice?: number; comboPrimaryServiceId?: string; prerequisiteNote?: string; prerequisiteForServiceId?: string; customPrice?: number; customNote?: string }
  | { type: 'ADD_CUSTOM_ITEM'; name: string; price: number; isTaxable: boolean }
  | { type: 'UPDATE_ITEM_QUANTITY'; itemId: string; quantity: number }
  | { type: 'UPDATE_PER_UNIT_QTY'; itemId: string; perUnitQty: number }
  | { type: 'REMOVE_ITEM'; itemId: string }
  | { type: 'RESTORE_ITEM'; item: TicketItem; index: number }
  | { type: 'SET_CUSTOMER'; customer: Customer | null }
  | { type: 'SET_VEHICLE'; vehicle: Vehicle | null; services: Service[]; blockedByPayment?: boolean }
  | { type: 'SET_COUPON'; coupon: { id: string; code: string; discount: number; isAutoApplied?: boolean } | null }
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

export type FavoriteColorShade = 10 | 25 | 40 | 60 | 80 | 100;

export interface FavoriteItem {
  id: string;
  type: FavoriteActionType;
  referenceId: string | null;
  label: string;
  color: FavoriteColor;
  colorShade?: FavoriteColorShade; // Intensity: 10%–100%, default 80% (Tailwind 500)
  percentage?: number; // For surcharge type: X% of subtotal
  // Dark mode overrides (optional — uses automatic dark: variants when not set)
  darkColor?: FavoriteColor;
  darkColorShade?: FavoriteColorShade;
}

export type FavoriteColor = 'red' | 'orange' | 'fuchsia' | 'lime' | 'cyan' | 'teal' | 'blue' | 'indigo' | 'purple' | 'pink' | 'rose' | 'slate';

// ─── Quote Types ──────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'expired' | 'converted';

export interface QuoteState {
  // Same shape as TicketState for item management
  items: TicketItem[];
  customer: Customer | null;
  vehicle: Vehicle | null;
  coupon: { id: string; code: string; discount: number; isAutoApplied?: boolean } | null;
  loyaltyPointsToRedeem: number;
  loyaltyDiscount: number;
  manualDiscount: { type: 'dollar' | 'percent'; value: number; label: string } | null;
  notes: string | null;
  // Computed totals
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  // Quote-specific
  quoteId: string | null;
  quoteNumber: string | null;
  validUntil: string | null;
  status: QuoteStatus | null;
}

export type QuoteAction =
  | { type: 'ADD_PRODUCT'; product: Product }
  | { type: 'ADD_SERVICE'; service: Service & { pricing?: ServicePricing[] }; pricing: ServicePricing; vehicleSizeClass: VehicleSizeClass | null; perUnitQty?: number; parentItemId?: string; comboPrice?: number; comboPrimaryServiceId?: string; prerequisiteNote?: string; prerequisiteForServiceId?: string; customPrice?: number; customNote?: string }
  | { type: 'ADD_CUSTOM_ITEM'; name: string; price: number; isTaxable: boolean }
  | { type: 'UPDATE_ITEM_QUANTITY'; itemId: string; quantity: number }
  | { type: 'UPDATE_PER_UNIT_QTY'; itemId: string; perUnitQty: number }
  | { type: 'REMOVE_ITEM'; itemId: string }
  | { type: 'SET_CUSTOMER'; customer: Customer | null }
  | { type: 'SET_VEHICLE'; vehicle: Vehicle | null; services: Service[]; blockedByPayment?: boolean }
  | { type: 'SET_COUPON'; coupon: { id: string; code: string; discount: number; isAutoApplied?: boolean } | null }
  | { type: 'SET_LOYALTY_REDEEM'; points: number; discount: number }
  | { type: 'SET_NOTES'; notes: string | null }
  | { type: 'UPDATE_ITEM_NOTE'; itemId: string; note: string | null }
  | { type: 'APPLY_MANUAL_DISCOUNT'; discountType: 'dollar' | 'percent'; value: number; label: string }
  | { type: 'REMOVE_MANUAL_DISCOUNT' }
  | { type: 'LOAD_QUOTE'; state: QuoteState }
  | { type: 'SET_VALID_UNTIL'; date: string | null }
  | { type: 'CLEAR_QUOTE'; validityDays?: number };
