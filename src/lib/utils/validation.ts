import { z } from 'zod';

// Phone validation - accepts (XXX) XXX-XXXX format (also allows E.164 for backwards compat)
const phoneRegex = /^(\(\d{3}\) \d{3}-\d{4}|\+1\d{10})$/;

export const phoneSchema = z
  .string()
  .regex(phoneRegex, 'Enter a valid 10-digit phone number')
  .or(z.literal(''))
  .optional()
  .nullable();

// Common field schemas
export const emailSchema = z.string().email('Invalid email address').or(z.literal('')).optional().nullable();
export const requiredString = z.string().min(1, 'Required');
export const optionalString = z.string().optional().nullable();
export const positiveNumber = z.coerce.number().min(0, 'Must be 0 or greater');
export const positiveInt = z.coerce.number().int().min(0, 'Must be 0 or greater');

// Employee schemas
export const pinCodeSchema = z
  .string()
  .regex(/^\d{4}$/, 'PIN must be exactly 4 digits')
  .or(z.literal(''))
  .optional()
  .nullable();

export const employeeCreateSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  email: z.string().email('Invalid email'),
  phone: phoneSchema,
  role: z.enum(['super_admin', 'admin', 'cashier', 'detailer']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  pin_code: pinCodeSchema,
  hourly_rate: positiveNumber.optional().nullable(),
  bookable_for_appointments: z.boolean().default(true),
});

export const employeeUpdateSchema = employeeCreateSchema.omit({ password: true }).partial();

// Customer schemas
export const customerCreateSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: phoneSchema,
  email: emailSchema,
  birthday: z.string().optional().nullable(),
  address_line_1: optionalString,
  address_line_2: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  notes: optionalString,
  tags: z.array(z.string()).default([]),
  sms_consent: z.boolean().default(false),
  email_consent: z.boolean().default(false),
});

export const customerUpdateSchema = customerCreateSchema.partial();

// Vehicle schemas
export const vehicleSchema = z.object({
  customer_id: z.string().uuid(),
  vehicle_type: z.enum(['standard', 'motorcycle', 'rv', 'boat', 'aircraft']),
  size_class: z.enum(['sedan', 'truck_suv_2row', 'suv_3row_van']).optional().nullable(),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  make: optionalString,
  model: optionalString,
  color: optionalString,
  vin: optionalString,
  license_plate: optionalString,
  notes: optionalString,
});

// Product schemas
export const productCreateSchema = z.object({
  name: requiredString,
  sku: optionalString,
  description: optionalString,
  category_id: z.string().uuid().optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  cost_price: positiveNumber,
  retail_price: positiveNumber,
  quantity_on_hand: positiveInt.default(0),
  reorder_threshold: positiveInt.optional().nullable(),
  min_order_qty: positiveInt.optional().nullable(),
  is_taxable: z.boolean().default(true),
  is_loyalty_eligible: z.boolean().default(true),
  is_active: z.boolean().default(true),
  barcode: optionalString,
});

export const productUpdateSchema = productCreateSchema.partial();

// Vendor schemas
export const vendorSchema = z.object({
  name: requiredString,
  contact_name: optionalString,
  email: emailSchema,
  phone: phoneSchema,
  website: optionalString,
  address: optionalString,
  lead_time_days: positiveInt.optional().nullable(),
  min_order_amount: z.coerce.number().min(0).optional().nullable(),
  notes: optionalString,
});

// Service schemas
export const serviceCreateSchema = z.object({
  name: requiredString,
  description: optionalString,
  category_id: z.string().uuid().optional().nullable(),
  pricing_model: z.enum(['vehicle_size', 'scope', 'per_unit', 'specialty', 'flat', 'custom']),
  classification: z.enum(['primary', 'addon_only', 'both']).default('primary'),
  base_duration_minutes: positiveInt.default(60),
  flat_price: positiveNumber.optional().nullable(),
  custom_starting_price: positiveNumber.optional().nullable(),
  per_unit_price: positiveNumber.optional().nullable(),
  per_unit_max: positiveInt.optional().nullable(),
  per_unit_label: optionalString,
  mobile_eligible: z.boolean().default(false),
  online_bookable: z.boolean().default(true),
  staff_assessed: z.boolean().default(false),
  is_taxable: z.boolean().default(false),
  vehicle_compatibility: z.array(z.enum(['standard', 'motorcycle', 'rv', 'boat', 'aircraft'])).default(['standard']),
  special_requirements: optionalString,
  is_active: z.boolean().default(true),
  display_order: positiveInt.default(0),
});

export const serviceUpdateSchema = serviceCreateSchema.partial();

// Service pricing tier schema
export const servicePricingSchema = z.object({
  service_id: z.string().uuid(),
  tier_name: requiredString,
  tier_label: optionalString,
  price: positiveNumber,
  display_order: positiveInt.default(0),
  is_vehicle_size_aware: z.boolean().default(false),
  vehicle_size_sedan_price: positiveNumber.optional().nullable(),
  vehicle_size_truck_suv_price: positiveNumber.optional().nullable(),
  vehicle_size_suv_van_price: positiveNumber.optional().nullable(),
});

// Service addon suggestion schema
export const addonSuggestionSchema = z.object({
  primary_service_id: z.string().uuid(),
  addon_service_id: z.string().uuid(),
  combo_price: positiveNumber.optional().nullable(),
  display_order: positiveInt.default(0),
  auto_suggest: z.boolean().default(true),
  is_seasonal: z.boolean().default(false),
  seasonal_start: z.string().optional().nullable(),
  seasonal_end: z.string().optional().nullable(),
});

// Service prerequisite schema
export const prerequisiteSchema = z.object({
  service_id: z.string().uuid(),
  prerequisite_service_id: z.string().uuid(),
  enforcement: z.enum(['required_same_ticket', 'required_history', 'recommended']),
  history_window_days: positiveInt.default(30),
  warning_message: optionalString,
});

// Mobile zone schema
export const mobileZoneSchema = z.object({
  name: requiredString,
  min_distance_miles: positiveNumber,
  max_distance_miles: positiveNumber,
  surcharge: positiveNumber,
  is_available: z.boolean().default(true),
  display_order: positiveInt.default(0),
});

// Product category schema
export const productCategorySchema = z.object({
  name: requiredString,
  slug: requiredString,
  description: optionalString,
  display_order: positiveInt.default(0),
});

// Business settings schema
export const businessProfileSchema = z.object({
  business_name: requiredString,
  business_phone: phoneSchema,
  business_address: z.object({
    line1: requiredString,
    city: requiredString,
    state: requiredString,
    zip: requiredString,
  }),
  business_email: emailSchema,
  business_website: z.string().url('Enter a valid URL').or(z.literal('')).optional().nullable(),
});

export const taxConfigSchema = z.object({
  tax_rate: z.coerce.number().min(0).max(1),
  tax_products_only: z.boolean(),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// Coupon reward schema (the THEN — what discount the customer gets)
export const couponRewardSchema = z.object({
  applies_to: z.enum(['order', 'product', 'service']),
  discount_type: z.enum(['percentage', 'flat', 'free']),
  discount_value: positiveNumber.default(0),
  max_discount: positiveNumber.optional().nullable(),
  target_product_id: z.string().uuid().optional().nullable(),
  target_service_id: z.string().uuid().optional().nullable(),
  target_product_category_id: z.string().uuid().optional().nullable(),
  target_service_category_id: z.string().uuid().optional().nullable(),
});

// Coupon schema (code is optional — API auto-generates if empty)
export const couponSchema = z.object({
  // Basics
  name: optionalString,
  code: z.string().default(''),
  auto_apply: z.boolean().default(false),
  // Targeting (WHO)
  customer_id: z.string().uuid().optional().nullable(),
  customer_tags: z.array(z.string()).optional().nullable(),
  tag_match_mode: z.enum(['any', 'all']).default('any'),
  target_customer_type: z.enum(['enthusiast', 'professional']).optional().nullable(),
  // Conditions (IF)
  condition_logic: z.enum(['and', 'or']).default('and'),
  requires_product_ids: z.array(z.string().uuid()).optional().nullable(),
  requires_service_ids: z.array(z.string().uuid()).optional().nullable(),
  requires_product_category_ids: z.array(z.string().uuid()).optional().nullable(),
  requires_service_category_ids: z.array(z.string().uuid()).optional().nullable(),
  min_purchase: positiveNumber.optional().nullable(),
  max_customer_visits: z.coerce.number().int().min(0).optional().nullable(),
  // Constraints
  is_single_use: z.boolean().default(true),
  max_uses: positiveInt.optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Purchase Order schemas
// ---------------------------------------------------------------------------

export const purchaseOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity_ordered: z.coerce.number().int().min(1, 'Must order at least 1'),
  unit_cost: z.coerce.number().min(0, 'Must be 0 or greater'),
});

export const purchaseOrderCreateSchema = z.object({
  vendor_id: z.string().uuid('Select a vendor'),
  notes: optionalString,
  items: z.array(purchaseOrderItemSchema).min(1, 'Add at least one item'),
});

export const purchaseOrderUpdateSchema = z.object({
  notes: optionalString,
  status: z.enum(['draft', 'ordered', 'received', 'cancelled']).optional(),
});

// ---------------------------------------------------------------------------
// Booking schemas (online booking wizard)
// ---------------------------------------------------------------------------

// Phone required for booking (must be (XXX) XXX-XXXX format)
const bookingPhoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

export const bookingCustomerSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: z.string().regex(bookingPhoneRegex, 'Enter valid mobile number'),
  email: z.string().email('Invalid email address'),
  sms_consent: z.boolean().default(false),
  email_consent: z.boolean().default(false),
});

export const bookingVehicleSchema = z.object({
  vehicle_type: z.enum(['standard', 'motorcycle', 'rv', 'boat', 'aircraft']).default('standard'),
  size_class: z.enum(['sedan', 'truck_suv_2row', 'suv_3row_van']).optional().nullable(),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  make: optionalString,
  model: optionalString,
  color: optionalString,
});

export const bookingAddonSchema = z.object({
  service_id: z.string().uuid(),
  name: z.string(),
  price: positiveNumber,
  tier_name: z.string().optional().nullable(),
});

export const bookingSubmitSchema = z.object({
  service_id: z.string().uuid(),
  tier_name: z.string().optional().nullable(),
  price: positiveNumber,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  duration_minutes: z.coerce.number().int().min(1),
  is_mobile: z.boolean().default(false),
  mobile_zone_id: z.string().uuid().optional().nullable(),
  mobile_address: z.string().optional().nullable(),
  mobile_surcharge: positiveNumber.default(0),
  customer: bookingCustomerSchema,
  vehicle: bookingVehicleSchema,
  addons: z.array(bookingAddonSchema).default([]),
  notes: optionalString,
  channel: z.enum(['online', 'portal']).default('online'),
  payment_intent_id: optionalString,
  // Payment options
  payment_option: z.enum(['deposit', 'pay_on_site', 'full']).optional(),
  deposit_amount: positiveNumber.optional().nullable(),
  coupon_code: optionalString,
  coupon_discount: positiveNumber.optional().nullable(),
  // Loyalty points
  loyalty_points_used: z.number().int().min(0).optional(),
  loyalty_discount: positiveNumber.optional().nullable(),
});

// Business hours day schema (open/close times or null for closed)
const dayHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
}).nullable();

export const businessHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});

// Phone OTP schemas (customer portal phone authentication)
const otpPhoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

export const phoneOtpSendSchema = z.object({
  phone: z.string().regex(otpPhoneRegex, 'Enter valid mobile number'),
});

export const phoneOtpVerifySchema = z.object({
  phone: z.string().regex(otpPhoneRegex, 'Enter valid mobile number'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

// Customer vehicle schema (customer portal vehicle management)
export const customerVehicleSchema = z.object({
  vehicle_type: z.enum(['standard', 'motorcycle', 'rv', 'boat', 'aircraft']).default('standard'),
  size_class: z.enum(['sedan', 'truck_suv_2row', 'suv_3row_van']).optional().nullable(),
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  make: optionalString,
  model: optionalString,
  color: optionalString,
});

// Customer signup schema (customer portal registration)
export const customerSignupSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(bookingPhoneRegex, 'Enter valid mobile number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

// Customer profile update schema (portal profile edit)
export const customerProfileSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: z.string().regex(bookingPhoneRegex, 'Enter valid mobile number'),
  sms_consent: z.boolean(),
  email_consent: z.boolean(),
  notify_promotions: z.boolean(),
  notify_loyalty: z.boolean(),
});

// Appointment update schema (admin edit)
// Time regex accepts HH:MM or HH:MM:SS (database may return with seconds)
export const appointmentUpdateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  scheduled_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format').optional(),
  scheduled_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format').optional(),
  employee_id: z.union([z.string().uuid(), z.literal('')]).optional().nullable(),
  job_notes: optionalString,
  internal_notes: optionalString,
});

// Appointment cancel schema
export const appointmentCancelSchema = z.object({
  cancellation_reason: z.string().min(1, 'Cancellation reason is required'),
  cancellation_fee: z.union([
    z.number().min(0, 'Must be 0 or greater'),
    z.nan().transform(() => undefined),
    z.undefined(),
    z.null(),
  ]).optional().nullable(),
});

// ---------------------------------------------------------------------------
// POS Transaction schemas
// ---------------------------------------------------------------------------

const transactionItemSchema = z.object({
  item_type: z.enum(['product', 'service', 'package', 'custom']),
  product_id: z.string().uuid().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  item_name: requiredString,
  quantity: z.coerce.number().int().min(1),
  unit_price: positiveNumber,
  total_price: positiveNumber,
  tax_amount: positiveNumber,
  is_taxable: z.boolean(),
  tier_name: optionalString,
  vehicle_size_class: z.enum(['sedan', 'truck_suv_2row', 'suv_3row_van']).optional().nullable(),
  notes: optionalString,
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'check', 'split']),
  amount: positiveNumber,
  tip_amount: positiveNumber.default(0),
  stripe_payment_intent_id: optionalString,
  card_brand: optionalString,
  card_last_four: optionalString,
});

export const transactionCreateSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  subtotal: positiveNumber,
  tax_amount: positiveNumber,
  tip_amount: positiveNumber.default(0),
  discount_amount: positiveNumber.default(0),
  total_amount: positiveNumber,
  payment_method: z.enum(['cash', 'card', 'check', 'split']),
  coupon_id: z.string().uuid().optional().nullable(),
  coupon_code: z.string().optional().nullable(),
  loyalty_points_redeemed: positiveInt.default(0),
  loyalty_discount: positiveNumber.default(0),
  notes: optionalString,
  items: z.array(transactionItemSchema),
  payments: z.array(paymentSchema),
});

// ---------------------------------------------------------------------------
// POS Refund schemas
// ---------------------------------------------------------------------------

const refundItemSchema = z.object({
  transaction_item_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
  amount: positiveNumber,
  restock: z.boolean().default(true),
});

export const refundCreateSchema = z.object({
  transaction_id: z.string().uuid(),
  items: z.array(refundItemSchema).min(1, 'Select at least one item to refund'),
  reason: requiredString,
});

// ---------------------------------------------------------------------------
// Cash Drawer / End-of-Day schemas
// ---------------------------------------------------------------------------

export const cashDrawerCloseSchema = z.object({
  counted_cash: positiveNumber,
  deposit_amount: positiveNumber.default(0),
  next_day_float: positiveNumber.default(0),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Quote schemas
// ---------------------------------------------------------------------------

export const quoteItemSchema = z.object({
  item_name: requiredString,
  quantity: z.coerce.number().int().min(1).default(1),
  unit_price: positiveNumber,
  service_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  tier_name: optionalString,
  notes: optionalString,
});

export const createQuoteSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().optional().nullable(),
  items: z.array(quoteItemSchema).min(1, 'At least one item is required'),
  notes: optionalString,
  valid_until: z.string().optional().nullable(),
});

export const updateQuoteSchema = z.object({
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional().nullable(),
  items: z.array(quoteItemSchema).min(1).optional(),
  notes: optionalString,
  valid_until: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'expired', 'converted']).optional(),
});

export const convertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  duration_minutes: z.coerce.number().int().min(1, 'Duration must be at least 1 minute'),
  employee_id: z.string().uuid().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Waitlist schemas
// ---------------------------------------------------------------------------

export const waitlistEntrySchema = z.object({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid(),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional().nullable(),
  preferred_time_start: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional().nullable(),
  preferred_time_end: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional().nullable(),
  notes: optionalString,
});

// ---------------------------------------------------------------------------
// Employee schedule schemas
// ---------------------------------------------------------------------------

export const employeeScheduleSchema = z.object({
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  is_available: z.boolean().default(true),
});

export const employeeWeeklyScheduleSchema = z.object({
  schedules: z.array(employeeScheduleSchema),
});

export const blockedDateSchema = z.object({
  employee_id: z.string().uuid().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  reason: optionalString,
});

// ---------------------------------------------------------------------------
// Marketing schemas
// ---------------------------------------------------------------------------

export const campaignCreateSchema = z.object({
  name: requiredString,
  channel: z.enum(['sms', 'email', 'both']),
  audience_filters: z.record(z.string(), z.unknown()).default({}),
  sms_template: optionalString,
  email_subject: optionalString,
  email_template: optionalString,
  coupon_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  auto_select_winner: z.boolean().optional().nullable(),
  auto_select_after_hours: z.number().optional().nullable(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export const lifecycleRuleSchema = z.object({
  name: requiredString,
  description: optionalString,
  trigger_condition: requiredString,
  trigger_service_id: z.string().uuid().optional().nullable(),
  delay_days: positiveInt.default(7),
  delay_minutes: positiveInt.default(0),
  action: z.enum(['sms', 'email', 'both']),
  sms_template: optionalString,
  email_subject: optionalString,
  email_template: optionalString,
  coupon_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
  is_vehicle_aware: z.boolean().default(false),
  chain_order: positiveInt.default(0),
});

// Type inference helpers
export type BookingCustomerInput = z.infer<typeof bookingCustomerSchema>;
export type BookingVehicleInput = z.infer<typeof bookingVehicleSchema>;
export type BookingAddonInput = z.infer<typeof bookingAddonSchema>;
export type BookingSubmitInput = z.infer<typeof bookingSubmitSchema>;
export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type VehicleInput = z.infer<typeof vehicleSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;
export type ServicePricingInput = z.infer<typeof servicePricingSchema>;
export type AddonSuggestionInput = z.infer<typeof addonSuggestionSchema>;
export type PrerequisiteInput = z.infer<typeof prerequisiteSchema>;
export type MobileZoneInput = z.infer<typeof mobileZoneSchema>;
export type ProductCategoryInput = z.infer<typeof productCategorySchema>;
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type TaxConfigInput = z.infer<typeof taxConfigSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CouponRewardInput = z.infer<typeof couponRewardSchema>;
export type CouponInput = z.infer<typeof couponSchema>;
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;
export type AppointmentCancelInput = z.infer<typeof appointmentCancelSchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type RefundCreateInput = z.infer<typeof refundCreateSchema>;
export type CashDrawerCloseInput = z.infer<typeof cashDrawerCloseSchema>;
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type ConvertQuoteInput = z.infer<typeof convertSchema>;
export type WaitlistEntryInput = z.infer<typeof waitlistEntrySchema>;
export type EmployeeScheduleInput = z.infer<typeof employeeScheduleSchema>;
export type EmployeeWeeklyScheduleInput = z.infer<typeof employeeWeeklyScheduleSchema>;
export type BlockedDateInput = z.infer<typeof blockedDateSchema>;
export type PhoneOtpSendInput = z.infer<typeof phoneOtpSendSchema>;
export type PhoneOtpVerifyInput = z.infer<typeof phoneOtpVerifySchema>;
export type CustomerVehicleInput = z.infer<typeof customerVehicleSchema>;
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;
export type LifecycleRuleInput = z.infer<typeof lifecycleRuleSchema>;
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemSchema>;
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

// ---------------------------------------------------------------------------
// Messaging schemas
// ---------------------------------------------------------------------------

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1, 'Message is required').max(1600, 'SMS max 1600 characters'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
