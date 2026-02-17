export interface ShippingRate {
  id: string;                    // Shippo rate object ID
  carrier: string;               // e.g. "usps", "ups", "fedex"
  carrierName: string;           // e.g. "USPS", "UPS", "FedEx"
  carrierLogo?: string;          // carrier logo URL from Shippo
  service: string;               // e.g. "usps_priority"
  serviceName: string;           // e.g. "Priority Mail"
  amount: number;                // in cents (converted from Shippo's dollar amount)
  currency: string;
  estimatedDays: number | null;
  estimatedDeliveryDate?: string;
  handlingFee: number;           // in cents
  totalAmount: number;           // amount + handlingFee in cents
}

export interface ShippingAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ShippingParcel {
  length: number;
  width: number;
  height: number;
  distanceUnit: string;
  weight: number;
  massUnit: string;
}

export interface ShippingSettings {
  id: string;
  shippo_api_key_live: string | null;
  shippo_api_key_test: string | null;
  shippo_mode: 'test' | 'live';
  ship_from_name: string;
  ship_from_company: string | null;
  ship_from_street1: string;
  ship_from_street2: string | null;
  ship_from_city: string;
  ship_from_state: string;
  ship_from_zip: string;
  ship_from_country: string;
  ship_from_phone: string | null;
  ship_from_email: string | null;
  default_parcel_length: number;
  default_parcel_width: number;
  default_parcel_height: number;
  default_parcel_distance_unit: string;
  default_parcel_weight: number;
  default_parcel_mass_unit: string;
  offer_free_shipping: boolean;
  free_shipping_threshold: number; // in cents
  flat_rate_enabled: boolean;
  flat_rate_amount: number;        // in cents
  enabled_carriers: string[];
  enabled_service_levels: string[];
  handling_fee_type: 'none' | 'flat' | 'percent';
  handling_fee_amount: number;
  show_estimated_delivery: boolean;
  show_carrier_logo: boolean;
  sort_rates_by: 'price' | 'speed';
  local_pickup_enabled: boolean;
  local_pickup_address: string | null;
  local_pickup_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarrierAccountInfo {
  objectId: string;
  carrier: string;
  carrierName: string;
  accountId: string;
  active: boolean;
  isShippoAccount: boolean;
}

export interface AddressValidationResult {
  isValid: boolean;
  messages: string[];
  suggestedAddress?: ShippingAddress;
}

export interface ShippingLabelResult {
  labelUrl: string;
  trackingNumber: string;
  trackingUrl: string;
}

export interface TrackingEvent {
  status: string;
  statusDetails: string;
  statusDate: string;
  location?: {
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface TrackingResult {
  carrier: string;
  trackingNumber: string;
  status: string;
  statusDetails: string;
  eta?: string;
  trackingHistory: TrackingEvent[];
}
