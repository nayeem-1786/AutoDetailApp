// Site-wide SEO constants
export const SITE_URL = 'https://smartdetailsautospa.com';
export const SITE_NAME = 'Smart Detail Auto Spa & Supplies';
export const SITE_DESCRIPTION = 'Professional auto detailing, ceramic coatings, and car care supplies in Lomita, CA. Mobile detailing available in the South Bay area.';

// Business constants for Smart Detail Auto Spa & Supplies

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

export const BUSINESS = {
  NAME: 'Smart Detail Auto Spa & Supplies',
  ADDRESS: '2021 Lomita Blvd, Lomita, CA 90717',
  PHONE: '+13109990000',
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
  submitted: 'Submitted',
  shipped: 'Shipped',
  partial: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
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
  CANCELLATION_FEE: 'cancellation_fee',
  REFERRAL_PROGRAM: 'referral_program',
  MOBILE_SERVICE: 'mobile_service',
} as const;
