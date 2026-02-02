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
export const employeeCreateSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  email: z.string().email('Invalid email'),
  phone: phoneSchema,
  role: z.enum(['super_admin', 'admin', 'cashier', 'detailer']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
  is_taxable: z.boolean().default(true),
  is_loyalty_eligible: z.boolean().default(true),
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

// Coupon schema
export const couponSchema = z.object({
  code: requiredString,
  type: z.enum(['flat', 'percentage', 'free_addon', 'free_product']),
  value: positiveNumber,
  min_purchase: positiveNumber.optional().nullable(),
  max_discount: positiveNumber.optional().nullable(),
  is_single_use: z.boolean().default(true),
  max_uses: positiveInt.optional().nullable(),
  expires_at: z.string().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Booking schemas (online booking wizard)
// ---------------------------------------------------------------------------

// Phone required for booking (must be (XXX) XXX-XXXX format)
const bookingPhoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/;

export const bookingCustomerSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  phone: z.string().regex(bookingPhoneRegex, 'Enter phone as (XXX) XXX-XXXX'),
  email: z.string().email('Invalid email address'),
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

// Customer signup schema (customer portal registration)
export const customerSignupSchema = z.object({
  first_name: requiredString,
  last_name: requiredString,
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(bookingPhoneRegex, 'Enter phone as (XXX) XXX-XXXX'),
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
  phone: z.string().regex(bookingPhoneRegex, 'Enter phone as (XXX) XXX-XXXX'),
  sms_consent: z.boolean(),
  email_consent: z.boolean(),
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
export type CouponInput = z.infer<typeof couponSchema>;
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
