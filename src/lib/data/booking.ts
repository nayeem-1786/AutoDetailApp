import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import type {
  Service,
  ServiceCategory,
  ServicePricing,
  ServiceAddonSuggestion,
  MobileZone,
  VehicleSizeClass,
  VehicleType,
} from '@/lib/supabase/types';

async function getClient() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookableService extends Service {
  service_pricing: ServicePricing[];
  service_addon_suggestions: (ServiceAddonSuggestion & {
    addon_service: Pick<
      Service,
      | 'id'
      | 'name'
      | 'slug'
      | 'description'
      | 'pricing_model'
      | 'flat_price'
      | 'custom_starting_price'
      | 'per_unit_price'
      | 'per_unit_label'
      | 'per_unit_max'
      | 'base_duration_minutes'
      | 'classification'
      | 'mobile_eligible'
    > & {
      service_pricing: ServicePricing[];
    };
  })[];
}

export interface BookableCategory {
  category: ServiceCategory;
  services: BookableService[];
}

export interface BusinessHours {
  [day: string]: { open: string; close: string } | null;
}

export interface BookingConfig {
  advance_days_min: number;
  advance_days_max: number;
  slot_interval_minutes: number;
  require_payment: boolean;
}

// ---------------------------------------------------------------------------
// getBookableServices — all online_bookable services grouped by category
// ---------------------------------------------------------------------------

export async function getBookableServices(): Promise<BookableCategory[]> {
  const supabase = await getClient();

  const { data: services, error } = await supabase
    .from('services')
    .select(
      `*,
      service_pricing(*),
      service_categories!inner(*),
      service_addon_suggestions!service_addon_suggestions_primary_service_id_fkey(
        *,
        addon_service:services!service_addon_suggestions_addon_service_id_fkey(
          id, name, slug, description, pricing_model, flat_price,
          custom_starting_price, per_unit_price, per_unit_label, per_unit_max,
          base_duration_minutes, classification, mobile_eligible,
          service_pricing(*)
        )
      )`
    )
    .eq('is_active', true)
    .eq('online_bookable', true)
    .eq('service_categories.is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching bookable services:', error.message);
    return [];
  }

  // Group by category
  const categoryMap = new Map<string, BookableCategory>();

  for (const svc of services ?? []) {
    const cat = svc.service_categories as unknown as ServiceCategory;
    if (!categoryMap.has(cat.id)) {
      categoryMap.set(cat.id, { category: cat, services: [] });
    }

    // Sort pricing and addon suggestions
    const sorted: BookableService = {
      ...svc,
      service_pricing: [...(svc.service_pricing ?? [])].sort(
        (a: ServicePricing, b: ServicePricing) => a.display_order - b.display_order
      ),
      service_addon_suggestions: [...(svc.service_addon_suggestions ?? [])].sort(
        (a: { display_order: number }, b: { display_order: number }) =>
          a.display_order - b.display_order
      ),
    } as BookableService;

    categoryMap.get(cat.id)!.services.push(sorted);
  }

  // Sort categories by display_order
  return Array.from(categoryMap.values()).sort(
    (a, b) => a.category.display_order - b.category.display_order
  );
}

// ---------------------------------------------------------------------------
// getBookableServiceBySlug — single service for pre-selection via ?service=slug
// ---------------------------------------------------------------------------

export async function getBookableServiceBySlug(
  slug: string
): Promise<BookableService | null> {
  const supabase = await getClient();

  const { data: service, error } = await supabase
    .from('services')
    .select(
      `*,
      service_pricing(*),
      service_categories!inner(*),
      service_addon_suggestions!service_addon_suggestions_primary_service_id_fkey(
        *,
        addon_service:services!service_addon_suggestions_addon_service_id_fkey(
          id, name, slug, description, pricing_model, flat_price,
          custom_starting_price, per_unit_price, per_unit_label, per_unit_max,
          base_duration_minutes, classification, mobile_eligible,
          service_pricing(*)
        )
      )`
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('online_bookable', true)
    .single();

  if (error || !service) return null;

  return {
    ...service,
    service_pricing: [...(service.service_pricing ?? [])].sort(
      (a: ServicePricing, b: ServicePricing) => a.display_order - b.display_order
    ),
    service_addon_suggestions: [...(service.service_addon_suggestions ?? [])].sort(
      (a: { display_order: number }, b: { display_order: number }) =>
        a.display_order - b.display_order
    ),
  } as BookableService;
}

// ---------------------------------------------------------------------------
// getMobileZones — available zones with surcharges
// ---------------------------------------------------------------------------

export async function getMobileZones(): Promise<MobileZone[]> {
  // If mobile service is disabled, return empty list — hides mobile option in booking
  if (!await isFeatureEnabled(FEATURE_FLAGS.MOBILE_SERVICE)) {
    return [];
  }

  const supabase = await getClient();

  const { data, error } = await supabase
    .from('mobile_zones')
    .select('*')
    .eq('is_available', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching mobile zones:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// getBusinessHours — from business_settings
// ---------------------------------------------------------------------------

export async function getBusinessHours(): Promise<BusinessHours> {
  const supabase = await getClient();

  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'business_hours')
    .single();

  if (!data?.value) {
    // Fallback defaults
    return {
      monday: { open: '08:00', close: '18:00' },
      tuesday: { open: '08:00', close: '18:00' },
      wednesday: { open: '08:00', close: '18:00' },
      thursday: { open: '08:00', close: '18:00' },
      friday: { open: '08:00', close: '18:00' },
      saturday: { open: '08:00', close: '18:00' },
      sunday: null,
    };
  }

  // Handle double-serialized JSON (string instead of object)
  const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  return val as BusinessHours;
}

// ---------------------------------------------------------------------------
// getBookingConfig — advance_days, slot_interval from business_settings
// ---------------------------------------------------------------------------

export async function getBookingConfig(): Promise<BookingConfig> {
  const supabase = await getClient();

  // Fetch booking config and payment feature flag in parallel
  const [configResult, flagResult] = await Promise.all([
    supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'booking_config')
      .single(),
    supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'online_booking_payment')
      .single(),
  ]);

  const defaults: BookingConfig = {
    advance_days_min: 1,
    advance_days_max: 30,
    slot_interval_minutes: 30,
    require_payment: true, // Default to requiring payment
  };

  if (!configResult.data?.value) {
    return {
      ...defaults,
      require_payment: flagResult.data?.enabled ?? true,
    };
  }

  // Handle double-serialized JSON (string instead of object)
  const val = typeof configResult.data.value === 'string'
    ? JSON.parse(configResult.data.value)
    : configResult.data.value;

  return {
    ...val,
    require_payment: flagResult.data?.enabled ?? true,
  } as BookingConfig;
}

// ---------------------------------------------------------------------------
// RebookData — for pre-filling the booking wizard from a past appointment
// ---------------------------------------------------------------------------

export interface RebookData {
  service_id: string;
  tier_name: string | null;
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_address: string | null;
  mobile_surcharge: number;
  vehicle: {
    vehicle_type: VehicleType;
    size_class: VehicleSizeClass | null;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  };
  addons: {
    service_id: string;
    name: string;
    price: number;
    tier_name: string | null;
  }[];
}

export async function getRebookData(
  appointmentId: string
): Promise<RebookData | null> {
  const supabase = await getClient();

  const { data: appt, error } = await supabase
    .from('appointments')
    .select(
      `id, is_mobile, mobile_zone_id, mobile_address, mobile_surcharge,
       customers(first_name, last_name, phone, email),
       vehicles(vehicle_type, size_class, year, make, model, color),
       appointment_services(service_id, price_at_booking, tier_name, services(name))`
    )
    .eq('id', appointmentId)
    .single();

  if (error || !appt) return null;

  // First appointment_service is the primary service
  const primaryService = appt.appointment_services?.[0];
  if (!primaryService) return null;

  const addonServices = (appt.appointment_services ?? []).slice(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = appt.customers as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicle = appt.vehicles as any;

  return {
    service_id: primaryService.service_id,
    tier_name: primaryService.tier_name,
    is_mobile: appt.is_mobile,
    mobile_zone_id: appt.mobile_zone_id,
    mobile_address: appt.mobile_address,
    mobile_surcharge: appt.mobile_surcharge,
    vehicle: vehicle
      ? {
          vehicle_type: vehicle.vehicle_type,
          size_class: vehicle.size_class,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
        }
      : null,
    customer: customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          email: customer.email,
        }
      : { first_name: '', last_name: '', phone: null, email: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addons: addonServices.map((a: any) => ({
      service_id: a.service_id,
      name: a.services?.name ?? 'Add-on',
      price: a.price_at_booking,
      tier_name: a.tier_name,
    })),
  };
}
