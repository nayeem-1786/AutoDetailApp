// Site-wide constants
export const SITE_URL = 'https://smartdetailsautospa.com';
export const SITE_DESCRIPTION = 'Professional auto detailing, ceramic coatings, and car care supplies in Lomita, CA. Mobile detailing available in the South Bay area.';

export const TAX_RATE = 0.1025; // 10.25% CA sales tax
export const TAX_PRODUCTS_ONLY = true; // Only charge tax on products, not services

export const WATER_SKU = '0000001'; // Water product SKU (excluded from loyalty)

export const CC_FEE_RATE = 0.05; // 5% CC fee deducted from card tips

export const TIP_PRESETS = [15, 20, 25] as const;

export const LOYALTY = {
  EARN_RATE: 1, // 1 point per $1 spent
  REDEEM_RATE: 0.05, // $0.05 per point ($5 per 100 points)
  REDEEM_MINIMUM: 100, // Minimum points to redeem
} as const;

export const APPOINTMENT = {
  BUFFER_MINUTES: 30,
  MOBILE_TRAVEL_BUFFER_MINUTES: 30,
  CANCELLATION_WINDOW_HOURS: 24,
} as const;

// Customer type labels
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  enthusiast: 'Enthusiast',
  professional: 'Professional',
} as const;

// Vehicle size class labels
export const VEHICLE_SIZE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  truck_suv_2row: 'Truck/SUV (2-Row)',
  suv_3row_van: 'SUV (3-Row) / Van',
} as const;

// Vehicle type labels
export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  motorcycle: 'Motorcycle',
  rv: 'RV',
  boat: 'Boat',
  aircraft: 'Aircraft',
} as const;

// Pricing model labels
export const PRICING_MODEL_LABELS: Record<string, string> = {
  vehicle_size: 'Vehicle Size',
  scope: 'Scope',
  per_unit: 'Per Unit',
  specialty: 'Specialty',
  flat: 'Flat Rate',
  custom: 'Custom Quote',
} as const;

// Service classification labels
export const CLASSIFICATION_LABELS: Record<string, string> = {
  primary: 'Primary (Standalone)',
  addon_only: 'Add-On Only',
  both: 'Both (Standalone or Add-On)',
} as const;

// User role labels
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  cashier: 'Cashier',
  detailer: 'Detailer',
} as const;

// Appointment status labels
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
} as const;

// Transaction status labels
export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  completed: 'Completed',
  voided: 'Voided',
  refunded: 'Refunded',
  partial_refund: 'Partial Refund',
} as const;

// PO status labels
export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  cancelled: 'Cancelled',
} as const;

// PO status badge variants
export const PO_STATUS_BADGE_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'default',
  ordered: 'info',
  received: 'success',
  cancelled: 'destructive',
} as const;

// Stock adjustment type labels
export const STOCK_ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  received: 'PO Received',
  sold: 'Sold',
  returned: 'Returned',
  damaged: 'Damaged',
  recount: 'Recount',
} as const;

// Quote status labels
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  expired: 'Expired',
  converted: 'Converted',
} as const;

// Quote status badge variants (maps to Badge component variants)
export const QUOTE_STATUS_BADGE_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'default',
  sent: 'info',
  viewed: 'warning',
  accepted: 'success',
  expired: 'destructive',
  converted: 'secondary',
} as const;

// Size classes valid for each vehicle type
export const VEHICLE_TYPE_SIZE_CLASSES: Record<string, string[]> = {
  standard: ['sedan', 'truck_suv_2row', 'suv_3row_van'],
  motorcycle: [],
  rv: [],
  boat: [],
  aircraft: [],
} as const;

// Coupon type labels
export const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  percentage: 'Percentage Off',
  flat: 'Dollar Amount Off',
  free: 'Free',
} as const;

export const APPLIES_TO_LABELS: Record<string, string> = {
  order: 'Entire Order',
  product: 'Product',
  service: 'Service',
} as const;

// Coupon status labels
export const COUPON_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  disabled: 'Disabled',
} as const;

// Campaign status labels
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
  cancelled: 'Cancelled',
} as const;

// Campaign channel labels
export const CAMPAIGN_CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  both: 'SMS + Email',
} as const;

// Consent action labels
export const CONSENT_ACTION_LABELS: Record<string, string> = {
  opt_in: 'Opt In',
  opt_out: 'Opt Out',
} as const;

// Permission categories (ordered for Role Management UI)
export const PERMISSION_CATEGORIES = [
  'POS Operations',
  'Customer Management',
  'Appointments & Scheduling',
  'Catalog',
  'Inventory',
  'Marketing',
  'Quotes',
  'Photos',
  'Reports',
  'Staff Management',
  'Settings',
  'Website',
] as const;

export type PermissionCategory = typeof PERMISSION_CATEGORIES[number];

// Feature flag keys
export const FEATURE_FLAGS = {
  LOYALTY_REWARDS: 'loyalty_rewards',
  RECURRING_SERVICES: 'recurring_services',
  ONLINE_BOOKING_PAYMENT: 'online_booking_payment',
  SMS_MARKETING: 'sms_marketing',
  EMAIL_MARKETING: 'email_marketing',
  GOOGLE_REVIEW_REQUESTS: 'google_review_requests',
  TWO_WAY_SMS: 'two_way_sms',
  WAITLIST: 'waitlist',
  PHOTO_DOCUMENTATION: 'photo_documentation',
  PHOTO_GALLERY: 'photo_gallery',
  CANCELLATION_FEE: 'cancellation_fee',
  MOBILE_SERVICE: 'mobile_service',
  QBO_ENABLED: 'qbo_enabled',
  ONLINE_STORE: 'online_store',
  INVENTORY_MANAGEMENT: 'inventory_management',
  HERO_CAROUSEL: 'hero_carousel',
  ANNOUNCEMENT_TICKERS: 'announcement_tickers',
  AD_PLACEMENTS: 'ad_placements',
  SEASONAL_THEMES: 'seasonal_themes',
} as const;

// Messaging
export const MESSAGE_DIRECTION = { INBOUND: 'inbound', OUTBOUND: 'outbound' } as const;
export const MESSAGE_SENDER_TYPE = { CUSTOMER: 'customer', STAFF: 'staff', AI: 'ai', SYSTEM: 'system' } as const;
export const CONVERSATION_STATUS = { OPEN: 'open', CLOSED: 'closed', ARCHIVED: 'archived' } as const;

export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
} as const;

export const CONVERSATION_STATUS_BADGE_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  open: 'success',
  closed: 'default',
  archived: 'secondary',
} as const;

export const MESSAGE_SENDER_TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  staff: 'Staff',
  ai: 'AI',
  system: 'System',
} as const;
