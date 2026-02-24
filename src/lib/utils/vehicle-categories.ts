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
