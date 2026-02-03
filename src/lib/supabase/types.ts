// Database types - manually defined to match migration schema
// After connecting to Supabase, regenerate with: npx supabase gen types typescript --local > src/lib/supabase/database.types.ts

export type UserRole = 'super_admin' | 'admin' | 'cashier' | 'detailer';
export type VehicleType = 'standard' | 'motorcycle' | 'rv' | 'boat' | 'aircraft';
export type VehicleSizeClass = 'sedan' | 'truck_suv_2row' | 'suv_3row_van';
export type PricingModel = 'vehicle_size' | 'scope' | 'per_unit' | 'specialty' | 'flat' | 'custom';
export type ServiceClassification = 'primary' | 'addon_only' | 'both';
export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentChannel = 'online' | 'phone' | 'walk_in' | 'portal';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'partial_refund';
export type PaymentMethod = 'cash' | 'card' | 'check' | 'split';
export type TransactionStatus = 'open' | 'completed' | 'voided' | 'refunded' | 'partial_refund';
export type TransactionItemType = 'product' | 'service' | 'package' | 'custom';
export type RefundStatus = 'pending' | 'processed' | 'failed';
export type CouponType = 'flat' | 'percentage' | 'free_addon' | 'free_product';
export type CouponStatus = 'active' | 'redeemed' | 'expired' | 'disabled';
export type LoyaltyAction = 'earned' | 'redeemed' | 'adjusted' | 'expired' | 'welcome_bonus';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
export type CampaignChannel = 'sms' | 'email' | 'both';
export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'expired' | 'converted';
export type POStatus = 'draft' | 'submitted' | 'shipped' | 'partial' | 'received' | 'cancelled';
export type PhotoType = 'before' | 'after' | 'damage';
export type ConsentChannel = 'sms' | 'email';
export type ConsentAction = 'opt_in' | 'opt_out';
export type ConsentSource = 'pos' | 'online' | 'portal' | 'import' | 'manual';
export type PrerequisiteEnforcement = 'required_same_ticket' | 'required_history' | 'recommended';
export type EmployeeStatus = 'active' | 'inactive' | 'terminated';

// Row types for each table

export interface Employee {
  id: string;
  auth_user_id: string | null;
  square_employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: EmployeeStatus;
  pin_code: string | null;
  hourly_rate: number | null;
  bookable_for_appointments: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  auth_user_id: string | null;
  square_customer_id: string | null;
  square_reference_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[];
  sms_consent: boolean;
  email_consent: boolean;
  first_visit_date: string | null;
  last_visit_date: string | null;
  visit_count: number;
  lifetime_spend: number;
  loyalty_points_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  vehicle_type: VehicleType;
  size_class: VehicleSizeClass | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  vin: string | null;
  license_plate: string | null;
  notes: string | null;
  is_incomplete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  square_item_id: string | null;
  sku: string | null;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  vendor_id: string | null;
  cost_price: number;
  retail_price: number;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  is_taxable: boolean;
  is_loyalty_eligible: boolean;
  image_url: string | null;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined relations
  category?: ProductCategory;
  vendor?: Vendor;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  pricing_model: PricingModel;
  classification: ServiceClassification;
  base_duration_minutes: number;
  flat_price: number | null;
  custom_starting_price: number | null;
  per_unit_price: number | null;
  per_unit_max: number | null;
  per_unit_label: string | null;
  mobile_eligible: boolean;
  online_bookable: boolean;
  staff_assessed: boolean;
  is_taxable: boolean;
  vehicle_compatibility: VehicleType[];
  special_requirements: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Joined relations
  category?: ServiceCategory;
  pricing?: ServicePricing[];
  addon_suggestions?: ServiceAddonSuggestion[];
  prerequisites?: ServicePrerequisite[];
}

export interface ServicePricing {
  id: string;
  service_id: string;
  tier_name: string;
  tier_label: string | null;
  price: number;
  display_order: number;
  is_vehicle_size_aware: boolean;
  vehicle_size_sedan_price: number | null;
  vehicle_size_truck_suv_price: number | null;
  vehicle_size_suv_van_price: number | null;
  created_at: string;
}

export interface ServiceAddonSuggestion {
  id: string;
  primary_service_id: string;
  addon_service_id: string;
  combo_price: number | null;
  display_order: number;
  auto_suggest: boolean;
  is_seasonal: boolean;
  seasonal_start: string | null;
  seasonal_end: string | null;
  created_at: string;
  // Joined
  addon_service?: Service;
}

export interface ServicePrerequisite {
  id: string;
  service_id: string;
  prerequisite_service_id: string;
  enforcement: PrerequisiteEnforcement;
  history_window_days: number | null;
  warning_message: string | null;
  created_at: string;
  // Joined
  prerequisite_service?: Service;
}

export interface MobileZone {
  id: string;
  name: string;
  min_distance_miles: number;
  max_distance_miles: number;
  surcharge: number;
  is_available: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  employee_id: string | null;
  status: AppointmentStatus;
  channel: AppointmentChannel;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_address: string | null;
  mobile_surcharge: number;
  payment_status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  cancellation_fee: number | null;
  cancellation_reason: string | null;
  job_notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  receipt_number: string | null;
  square_transaction_id: string | null;
  appointment_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  employee_id: string | null;
  status: TransactionStatus;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | null;
  coupon_id: string | null;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  loyalty_discount: number;
  notes: string | null;
  transaction_date: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  item_type: TransactionItemType;
  product_id: string | null;
  service_id: string | null;
  package_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  is_taxable: boolean;
  tier_name: string | null;
  vehicle_size_class: VehicleSizeClass | null;
  notes: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  transaction_id: string;
  method: PaymentMethod;
  amount: number;
  tip_amount: number;
  tip_net: number;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  created_at: string;
}

export interface Refund {
  id: string;
  transaction_id: string;
  status: RefundStatus;
  amount: number;
  reason: string | null;
  stripe_refund_id: string | null;
  processed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundItem {
  id: string;
  refund_id: string;
  transaction_item_id: string;
  quantity: number;
  amount: number;
  restock: boolean;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  min_purchase: number | null;
  max_discount: number | null;
  is_single_use: boolean;
  use_count: number;
  max_uses: number | null;
  status: CouponStatus;
  expires_at: string | null;
  campaign_id: string | null;
  customer_id: string | null;
  free_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyLedger {
  id: string;
  customer_id: string;
  transaction_id: string | null;
  action: LoyaltyAction;
  points_change: number;
  points_balance: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  channel: CampaignChannel;
  status: CampaignStatus;
  audience_filters: Record<string, unknown>;
  sms_template: string | null;
  email_subject: string | null;
  email_template: string | null;
  coupon_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  redeemed_count: number;
  revenue_attributed: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LifecycleRule {
  id: string;
  name: string;
  description: string | null;
  trigger_service_id: string | null;
  trigger_condition: string;
  delay_days: number;
  action: 'sms' | 'email' | 'both';
  sms_template: string | null;
  email_subject: string | null;
  email_template: string | null;
  coupon_type: CouponType | null;
  coupon_value: number | null;
  coupon_expiry_days: number | null;
  chain_order: number;
  is_active: boolean;
  is_vehicle_aware: boolean;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  vehicle_id: string | null;
  status: QuoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  converted_appointment_id: string | null;
  access_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  customer?: Customer;
  vehicle?: Vehicle;
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  service_id: string | null;
  product_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier_name: string | null;
  notes: string | null;
  created_at: string;
}

export type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  customer_id: string;
  service_id: string;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  status: WaitlistStatus;
  notified_at: string | null;
  notes: string | null;
  created_at: string;
  // Joined relations
  customer?: Customer;
  service?: Service;
}

export interface EmployeeSchedule {
  id: string;
  employee_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface BlockedDate {
  id: string;
  employee_id: string | null;
  date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Photo {
  id: string;
  appointment_id: string | null;
  transaction_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  type: PhotoType;
  storage_path: string;
  storage_url: string;
  thumbnail_url: string | null;
  marketing_consent: boolean;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface TimeRecord {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
  notes: string | null;
  edited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  status: POStatus;
  notes: string | null;
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  subtotal: number;
  shipping_cost: number;
  total_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vendor?: Vendor;
}

export interface POItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
  // Joined
  product?: Product;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  permission_key: string;
  role: UserRole | null;
  employee_id: string | null;
  granted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  employee_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface BusinessSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingConsentLog {
  id: string;
  customer_id: string;
  channel: ConsentChannel;
  action: ConsentAction;
  source: ConsentSource;
  ip_address: string | null;
  user_agent: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface SmsConversation {
  id: string;
  customer_id: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  message: string;
  twilio_sid: string | null;
  status: string;
  read: boolean;
  created_at: string;
}

// Generic action result pattern
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
