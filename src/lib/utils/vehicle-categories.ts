/**
 * Vehicle category definitions and tier mappings.
 *
 * Categories define what kind of vehicle it is (automobile, motorcycle, etc.)
 * Tiers define the pricing size class within each category.
 * Tier keys map directly to service_pricing.tier_name values in the database.
 */

export const VEHICLE_CATEGORIES = [
  'automobile',
  'motorcycle',
  'rv',
  'boat',
  'aircraft',
] as const;

export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  automobile: 'Automobile',
  motorcycle: 'Motorcycle',
  rv: 'RV',
  boat: 'Boat',
  aircraft: 'Aircraft',
};

/**
 * Specialty tier definitions per category.
 * - `key` maps directly to service_pricing.tier_name AND vehicles.specialty_tier
 * - `label` is the display text shown in forms and the POS
 * - Automobile is excluded — it uses vehicle_type/vehicle_size_class instead
 */
export interface SpecialtyTierOption {
  key: string;
  label: string;
}

export const SPECIALTY_TIERS: Record<Exclude<VehicleCategory, 'automobile'>, SpecialtyTierOption[]> = {
  motorcycle: [
    { key: 'standard_cruiser', label: 'Standard / Cruiser' },
    { key: 'touring_bagger', label: 'Touring / Bagger' },
  ],
  rv: [
    { key: 'rv_up_to_24', label: "Up to 24'" },
    { key: 'rv_25_35', label: "25-35'" },
    { key: 'rv_36_plus', label: "36'+" },
  ],
  boat: [
    { key: 'boat_up_to_20', label: "Up to 20'" },
    { key: 'boat_21_26', label: "21-26'" },
    { key: 'boat_27_32', label: "27-32'" },
  ],
  aircraft: [
    { key: 'aircraft_2_4', label: '2-4 Seater' },
    { key: 'aircraft_6_8', label: '6-8 Seater' },
    { key: 'aircraft_turboprop', label: 'Turboprop / Jet' },
  ],
};

/**
 * Label for the tier dropdown based on category.
 * Automobiles use "Size Class", specialty vehicles use category-specific labels.
 */
export const TIER_DROPDOWN_LABELS: Record<VehicleCategory, string> = {
  automobile: 'Size Class',
  motorcycle: 'Type',
  rv: 'Length',
  boat: 'Length',
  aircraft: 'Class',
};

/**
 * Dynamic model placeholder based on category.
 */
export const MODEL_PLACEHOLDERS: Record<VehicleCategory, string> = {
  automobile: 'e.g., Camry',
  motorcycle: 'e.g., Sportster',
  rv: 'e.g., View 24D',
  boat: 'e.g., Catalina 275',
  aircraft: 'e.g., Skyhawk 172',
};

/**
 * Maps vehicle_category to the corresponding vehicle_compatibility JSONB value.
 * The DB uses "standard" in service vehicle_compatibility for automobiles,
 * but "automobile" as the vehicle_category value.
 */
export function categoryToCompatibilityKey(category: VehicleCategory): string {
  return category === 'automobile' ? 'standard' : category;
}

/**
 * Check if a category is a specialty (non-automobile) category.
 */
export function isSpecialtyCategory(category: VehicleCategory): category is Exclude<VehicleCategory, 'automobile'> {
  return category !== 'automobile';
}

/**
 * Get the tier label for a given specialty tier key.
 * Returns the key itself if no match found.
 */
export function getSpecialtyTierLabel(category: VehicleCategory, tierKey: string): string {
  if (!isSpecialtyCategory(category)) return tierKey;
  const tiers = SPECIALTY_TIERS[category];
  return tiers.find((t) => t.key === tierKey)?.label ?? tierKey;
}

// ---------------------------------------------------------------------------
// Model → size_class hints (automobiles only)
// Used by resolveVehicleClassification() when a model is known but size_class
// is not explicitly set. Case-insensitive substring match handles variants
// like "Accord Sport", "CR-V EX-L", "F-150 XLT".
// ---------------------------------------------------------------------------

const MODEL_SIZE_HINTS: Record<string, string[]> = {
  sedan: [
    'Accord', 'Civic', 'Camry', 'Corolla', 'Altima', 'Sentra', 'Elantra',
    'Sonata', 'Model 3', 'Model S', 'A4', '3 Series', 'C-Class', 'Jetta',
    'Mazda3', 'Impreza', 'Legacy', 'Malibu', 'Cruze', 'Focus', 'Fusion',
    'Charger', '300', 'IS', 'ES', 'Prius', 'Mustang', 'Challenger', 'Camaro',
    'Golf', 'Beetle', 'Forte', 'Rio', 'Versa', 'Fit', 'Insight', 'BRZ', '86',
    'Miata', 'G70', 'TLX', 'ILX', 'A3', 'A5', 'S4', 'S5',
  ],
  truck_suv_2row: [
    'F-150', 'F150', 'Silverado', 'Sierra', 'Ram 1500', 'Ram1500', 'Tacoma',
    'Tundra', 'Ranger', 'Colorado', 'Frontier', 'Gladiator', 'Ridgeline',
    'RAV4', 'CR-V', 'CRV', 'Tucson', 'Santa Fe', 'Sportage', 'CX-5', 'CX5',
    'Forester', 'Outback', 'Crosstrek', 'Cherokee', 'Grand Cherokee',
    'Wrangler', 'Bronco', 'Escape', 'Explorer', 'Edge', 'Equinox', 'Blazer',
    'Model X', 'Model Y', 'X3', 'X5', 'Q5', 'Q7', 'GLC', 'GLE', 'Tiguan',
    'Atlas', 'Rogue', 'Pathfinder', 'Murano', 'Pilot', 'Passport', '4Runner',
    'Sorento', 'CX-9', 'CX9',
  ],
  suv_3row_van: [
    'Sienna', 'Odyssey', 'Pacifica', 'Carnival', 'Grand Caravan', 'Suburban',
    'Tahoe', 'Yukon', 'Expedition', 'Sequoia', 'Armada', 'Highlander',
    'Palisade', 'Telluride', 'Ascent', 'Traverse', 'Transit', 'Sprinter',
    'ProMaster', 'NV', 'Savana', 'Express',
  ],
};

// Default specialty tier per category — smallest/most common, correctable by staff
const DEFAULT_SPECIALTY_TIERS: Record<Exclude<VehicleCategory, 'automobile'>, string> = {
  motorcycle: 'standard_cruiser',
  rv: 'rv_up_to_24',
  boat: 'boat_up_to_20',
  aircraft: 'aircraft_2_4',
};

export interface VehicleClassification {
  vehicle_category: VehicleCategory;
  vehicle_type: string;
  size_class: string | null;
  specialty_tier: string | null;
}

/**
 * Resolve full vehicle classification from make and optional model.
 *
 * 3-layer approach:
 * 1. Query vehicle_makes table for category (automobile vs motorcycle vs rv etc.)
 * 2. For automobiles, infer size_class from model via MODEL_SIZE_HINTS
 * 3. For specialty vehicles, set default specialty_tier (staff corrects in POS)
 *
 * Returns: { vehicle_category, vehicle_type, size_class, specialty_tier }
 *
 * Examples:
 *   ("Toyota", "Camry")       → { automobile, standard, sedan, null }
 *   ("Toyota", "4Runner")     → { automobile, standard, truck_suv_2row, null }
 *   ("Honda", "Odyssey")      → { automobile, standard, suv_3row_van, null }
 *   ("Harley-Davidson", "Sportster") → { motorcycle, motorcycle, null, standard_cruiser }
 *   ("Winnebago", "View")     → { rv, rv, null, rv_up_to_24 }
 */
export async function resolveVehicleClassification(
  supabase: { from: (table: string) => unknown },
  make: string,
  model?: string
): Promise<VehicleClassification> {
  // Layer 1: resolve category from vehicle_makes table
  let category: VehicleCategory = 'automobile';

  if (make) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('vehicle_makes')
        .select('category')
        .ilike('name', make.trim())
        .eq('is_active', true)
        .order('category', { ascending: true }) // 'automobile' sorts first
        .limit(1)
        .maybeSingle();

      if (data?.category && VEHICLE_CATEGORIES.includes(data.category as VehicleCategory)) {
        category = data.category as VehicleCategory;
      }
    } catch {
      // DB unavailable — default to automobile
    }
  }

  // Layer 2: for automobiles, infer size_class from model
  if (category === 'automobile') {
    let sizeClass: string = 'sedan'; // safe default

    if (model) {
      const modelLower = model.toLowerCase();
      for (const [size, hints] of Object.entries(MODEL_SIZE_HINTS)) {
        if (hints.some((hint) => modelLower.includes(hint.toLowerCase()))) {
          sizeClass = size;
          break;
        }
      }
    }

    return {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: sizeClass,
      specialty_tier: null,
    };
  }

  // Layer 3: specialty vehicle — set default tier
  return {
    vehicle_category: category,
    vehicle_type: category,
    size_class: null,
    specialty_tier: DEFAULT_SPECIALTY_TIERS[category],
  };
}
