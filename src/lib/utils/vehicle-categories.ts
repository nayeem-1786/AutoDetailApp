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
  // 87 entries
  sedan: [
    // Japanese
    'Accord', 'Civic', 'Camry', 'Corolla', 'Altima', 'Sentra', 'Elantra',
    'Sonata', 'Maxima', 'Avalon', 'Prius', 'GR86', 'Supra', 'Miata',
    'Mazda3', 'Impreza', 'Legacy', 'WRX', 'Forte', 'Rio', 'Versa', 'Fit',
    'Insight', 'BRZ', '86', 'K5', 'Stinger', 'Ioniq 6',
    // American
    'Malibu', 'Cruze', 'Focus', 'Fusion', 'Charger', '300', 'Mustang',
    'Challenger', 'Camaro', 'Lucid Air',
    // German
    'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'S4', 'S5', '3 Series', '5 Series',
    '7 Series', '8 Series', 'C-Class', 'E-Class', 'S-Class', 'EQS', 'EQE',
    'Jetta', 'Golf', 'Beetle', 'Passat', 'Arteon', 'Polestar 2',
    // Luxury / Import
    'IS', 'ES', 'LS', 'GS', 'LC 500', 'RC 350', 'RC F', 'Genesis G80', 'G90',
    'TLX', 'ILX', 'Integra', 'Q50', 'Q60', 'CT4', 'CT5', 'G70',
    'Model 3', 'Model S',
    // European / Niche
    'Giulia', 'Ghibli', 'Quattroporte', 'Jaguar XE', 'Jaguar XF',
    'Mini Cooper', 'Fiat 500',
  ],
  // 131 entries
  truck_suv_2row: [
    // Full-size trucks
    'F-150', 'F150', 'F-250', 'F250', 'F-350', 'F350',
    'Silverado', 'Silverado 2500', 'Silverado 3500',
    'Sierra', 'Sierra 2500', 'Sierra 3500',
    'Ram 1500', 'Ram1500', 'Ram 2500', 'Ram2500', 'Ram 3500', 'Ram3500',
    'Tundra', 'Tacoma', 'Ranger', 'Colorado', 'Frontier', 'Gladiator',
    'Ridgeline', 'Maverick', 'Santa Cruz', 'Cybertruck',
    // Compact / Subcompact SUV
    'RAV4', 'CR-V', 'CRV', 'HR-V', 'HRV', 'Tucson', 'Santa Fe', 'Kona',
    'Venue', 'Sportage', 'Seltos', 'Niro', 'CX-5', 'CX5',
    'Forester', 'Outback', 'Crosstrek', 'Solterra',
    'Kicks', 'Rogue', 'Ariya', 'Venza', 'bZ4X',
    'Compass', 'Renegade', 'Bolt EUV',
    // Mid-size SUV
    'Cherokee', 'Grand Cherokee', 'Wrangler', 'Bronco',
    'Escape', 'Explorer', 'Edge', 'Equinox', 'Blazer',
    'Pilot', 'Passport', '4Runner', 'Pathfinder', 'Murano',
    'Sorento', 'CX-9', 'CX9', 'Atlas', 'Tiguan',
    // EV SUV / Crossover
    'Model X', 'Model Y', 'Ioniq 5', 'EV6', 'ID.4', 'ID4',
    'Mustang Mach-E', 'Mach-E', 'MachE', 'iX', 'Lyriq',
    'R1T', 'R1S', 'Polestar 3', 'Lucid Gravity',
    // German luxury SUV
    'X1', 'X3', 'X4', 'X5', 'X6', 'Q3', 'Q4', 'Q5', 'Q7', 'e-tron',
    'GLA', 'GLB', 'GLC', 'GLE', 'EQB',
    // Japanese luxury SUV
    'NX', 'RX', 'UX', 'RDX', 'MDX', 'QX50', 'QX55', 'QX60',
    // American luxury SUV
    'XT4', 'XT5', 'XT6', 'Corsair', 'Nautilus',
    // European luxury SUV
    'Cayenne', 'Macan', 'Stelvio', 'Levante',
    'F-Pace', 'E-Pace', 'XC40', 'XC60', 'XC90',
    'Defender', 'Range Rover Sport', 'Range Rover Velar', 'Discovery Sport',
    // Korean luxury
    'GV70', 'GV80',
  ],
  // 37 entries
  suv_3row_van: [
    // Full-size SUV
    'Suburban', 'Tahoe', 'Yukon', 'Expedition', 'Sequoia', 'Armada',
    'Highlander', 'Palisade', 'Telluride', 'Ascent', 'Traverse',
    'Wagoneer', 'Grand Wagoneer', 'Land Cruiser',
    // Luxury full-size SUV
    'Escalade', 'Escalade ESV', 'Navigator', 'LX', 'QX80', 'GLS', 'X7',
    // Vans
    'Sienna', 'Odyssey', 'Pacifica', 'Carnival', 'Grand Caravan', 'Voyager',
    // Commercial / Cargo vans
    'Transit', 'Sprinter', 'ProMaster', 'NV', 'NV200', 'Metris',
    'E-Transit', 'Savana', 'Express',
    // EV 3-row
    'EV9',
  ],
};

// ---------------------------------------------------------------------------
// Non-automobile model keyword hints — used to disambiguate dual-category
// makes like Honda (automobile + motorcycle), BMW, Yamaha, etc.
// Case-insensitive substring match against the model string.
// ---------------------------------------------------------------------------

// 123 keywords
const MOTORCYCLE_MODEL_KEYWORDS = [
  // Harley-Davidson
  'sportster', 'softail', 'road king', 'road glide', 'street glide', 'fat boy', 'fat bob',
  'iron', 'nightster', 'breakout', 'heritage', 'electra glide', 'ultra limited', 'low rider',
  'night rod',
  // Honda motorcycle
  'cbr', 'crf', 'cb500', 'cb650', 'cb300', 'africa twin', 'gold wing', 'goldwing',
  'rebel', 'grom', 'monkey', 'trail',
  // BMW motorcycle
  'r1250', 'r1200', 'f850', 'f750', 'f900', 'g310', 'c400', 's1000', 'r nine', 'rninet',
  'k1600', 'ce 04',
  // Yamaha motorcycle
  'yzf', 'mt-', 'mt0', 'mt1', 'tenere', 'r1', 'r6', 'r7', 'r3', 'fz', 'xsr',
  'bolt', 'v-star', 'vstar', 'drag star',
  // Suzuki motorcycle
  'gsx', 'gsxr', 'gsx-r', 'v-strom', 'vstrom', 'hayabusa', 'katana', 'boulevard',
  'burgman', 'dr-z', 'drz',
  // Kawasaki motorcycle
  'ninja', 'zx-', 'zx6', 'zx10', 'zx14', 'z900', 'z650', 'z400', 'versys',
  'klr', 'klx', 'vulcan', 'concours', 'eliminator',
  // Ducati
  'panigale', 'monster', 'scrambler', 'multistrada', 'diavel', 'streetfighter',
  'hypermotard', 'desert x',
  // Indian
  'scout', 'chieftain', 'pursuit', 'springfield', 'roadmaster',
  // Triumph
  'street triple', 'speed triple', 'tiger', 'bonneville', 'thruxton', 'rocket',
  'trident',
  // Royal Enfield
  'interceptor', 'continental gt', 'himalayan', 'meteor', 'classic 350', 'hunter',
  // Can-Am (3-wheelers, detailed as motorcycles)
  'ryker', 'spyder',
  // Electric motorcycles — Zero, Energica
  'sr/f', 'fxe', 'fxs', 'dsr', 'ego', 'eva', 'experia',
  // Aprilia
  'tuono', 'rsv4', 'rs 660',
  // MV Agusta
  'f3', 'brutale', 'dragster',
  // Generic motorcycle terms
  'motorcycle', 'bike', 'motorbike',
];

const BOAT_MODEL_KEYWORDS = [
  'waverunner', 'wave runner', 'jet ski', 'jetski', 'fx', 'vx',
  'ar195', 'ar210', 'ar250', 'sx195', 'sx210', 'sx250',
  '190 fsh', '195s', '210 fsh', '212',
  'boat', 'watercraft', 'pwc',
];

const RV_MODEL_KEYWORDS = [
  // Class A
  'allegro', 'allegro bus', 'phaeton', 'ventana', 'discovery', 'palazzo', 'dutch star',
  'mountain aire', 'king aire', 'essex', 'zephyr', 'anthem',
  // Class B
  'revel', 'solis', 'boldt', 'paseo', 'interstate', 'era', 'beyond',
  'travato', 'tofino', 'ekko',
  // Class C
  'minnie winnie', 'spirit', 'forester', 'leprechaun', 'four winds', 'chateau',
  'sunseeker', 'prism', 'vita', 'navion',
  // Travel trailers
  'airstream', 'bambi', 'basecamp', 'caravel', 'flying cloud', 'globetrotter',
  // Sprinter/Transit based
  'sprinter rv', 'transit rv',
  // Generic RV terms
  'motorhome', 'motor home', 'camper', 'rv', 'class a', 'class b', 'class c',
  'fifth wheel', 'toy hauler', 'travel trailer',
];

const AIRCRAFT_MODEL_KEYWORDS = [
  // Cessna
  'skyhawk', 'skylane', 'citation', 'caravan', 'stationair', 'turbo stationair',
  // Piper
  'cherokee', 'archer', 'warrior', 'seneca', 'navajo', 'malibu', 'meridian', 'seminole',
  // Beechcraft
  'bonanza', 'baron', 'king air', 'kingair',
  // Cirrus
  'sr20', 'sr22', 'vision jet', 'sf50',
  // Honda
  'hondajet', 'ha-420',
  // Gulfstream
  'g280', 'g500', 'g600', 'g650', 'g700', 'g800',
  // Generic aircraft terms
  'aircraft', 'airplane', 'plane', 'jet', 'turboprop', 'helicopter', 'chopper', 'heli',
];

/**
 * Disambiguate vehicle category when a make exists in multiple categories.
 * Checks model against keyword hints for each possible category.
 * Falls back to automobile if model is unknown (most common case).
 */
function disambiguateCategory(
  categories: string[],
  model: string | null | undefined
): VehicleCategory {
  if (!model) {
    console.warn('[VehicleClassify] Dual-category make with no model — defaulting to automobile');
    return 'automobile';
  }

  const modelLower = model.toLowerCase();

  // Check motorcycle models
  if (categories.includes('motorcycle')) {
    if (MOTORCYCLE_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return 'motorcycle';
    }
  }

  // Check boat models
  if (categories.includes('boat')) {
    if (BOAT_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return 'boat';
    }
  }

  // Check RV models
  if (categories.includes('rv')) {
    if (RV_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return 'rv';
    }
  }

  // Check aircraft models
  if (categories.includes('aircraft')) {
    if (AIRCRAFT_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return 'aircraft';
    }
  }

  // Check automobile models (existing MODEL_SIZE_HINTS)
  if (categories.includes('automobile')) {
    const allAutoModels = Object.values(MODEL_SIZE_HINTS).flat();
    if (allAutoModels.some((hint) => modelLower.includes(hint.toLowerCase()))) {
      return 'automobile';
    }
  }

  // No model match — default to automobile
  return 'automobile';
}

// ---------------------------------------------------------------------------
// Exotic vehicle detection
// ---------------------------------------------------------------------------

/** Makes where ALL models are exotic — case-insensitive */
const EXOTIC_MAKES = [
  'ferrari', 'lamborghini', 'mclaren', 'bugatti', 'pagani', 'koenigsegg',
  'rimac', 'hennessey', 'ssc', 'saleen', 'noble', 'spyker', 'w motors',
  'czinger', 'de tomaso', 'hispano suiza', 'pininfarina', 'aston martin',
  'bentley', 'rolls-royce', 'rolls royce', 'lotus', 'duesenberg', 'packard',
];

/** Specific exotic models from standard makes. Short names use exact match. */
const EXOTIC_MAKE_MODELS: Record<string, Array<{ model: string; matchType: 'exact' | 'substring' }>> = {
  porsche: [
    { model: '918', matchType: 'exact' },
    { model: '959', matchType: 'exact' },
    { model: 'carrera gt', matchType: 'substring' },
    { model: '911 gt3', matchType: 'substring' },
    { model: '911 gt2', matchType: 'substring' },
    { model: 'gt3 rs', matchType: 'substring' },
    { model: 'gt2 rs', matchType: 'substring' },
    { model: '911 turbo s', matchType: 'substring' },
  ],
  dodge: [
    { model: 'viper', matchType: 'substring' },
    { model: 'srt viper', matchType: 'substring' },
  ],
  ford: [
    { model: 'gt', matchType: 'exact' },
  ],
  chevrolet: [
    { model: 'corvette z06', matchType: 'substring' },
    { model: 'corvette zr1', matchType: 'substring' },
    { model: 'corvette e-ray', matchType: 'substring' },
  ],
  nissan: [
    { model: 'gt-r', matchType: 'substring' },
    { model: 'gtr', matchType: 'exact' },
  ],
  acura: [
    { model: 'nsx', matchType: 'exact' },
  ],
  lexus: [
    { model: 'lfa', matchType: 'exact' },
  ],
  bmw: [
    { model: 'i8', matchType: 'exact' },
    { model: 'm8', matchType: 'exact' },
  ],
  mercedes: [
    { model: 'amg gt', matchType: 'substring' },
    { model: 'amg one', matchType: 'substring' },
    { model: 'sls', matchType: 'exact' },
    { model: 'slr', matchType: 'exact' },
  ],
  audi: [
    { model: 'r8', matchType: 'exact' },
  ],
  maserati: [
    { model: 'mc20', matchType: 'substring' },
    { model: 'mc12', matchType: 'substring' },
    { model: 'granturismo trofeo', matchType: 'substring' },
  ],
  toyota: [
    { model: '2000gt', matchType: 'substring' },
  ],
  jaguar: [
    { model: 'xj220', matchType: 'substring' },
  ],
};

export function isExoticMake(make: string): boolean {
  return EXOTIC_MAKES.includes(make.trim().toLowerCase());
}

export function isExoticModel(make: string, model: string): boolean {
  const entries = EXOTIC_MAKE_MODELS[make.trim().toLowerCase()];
  if (!entries) return false;
  const modelTrimmed = model.trim().toLowerCase();
  return entries.some((e) =>
    e.matchType === 'exact'
      ? modelTrimmed === e.model.toLowerCase()
      : modelTrimmed.includes(e.model.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Classic vehicle detection
// ---------------------------------------------------------------------------

/** Dynamic threshold — vehicles 25+ years old are classic */
const CLASSIC_YEAR_THRESHOLD = new Date().getFullYear() - 25;

/** Model keywords that strongly imply a classic vehicle (substring match) */
const CLASSIC_MODEL_KEYWORDS = [
  // Pre-War and Full Classics
  'model t', 'model a', 'silver ghost', 'phantom i', 'phantom ii', 'phantom iii',
  'type 35', 'type 57', 'atlantic',
  // Golden Age and Muscle Cars (1950s-1970s)
  'bel air', '300sl', 'gullwing', 'e-type', 'xke', 'road runner', 'hemi cuda',
  'barracuda', 'chevelle ss', 'el camino', 'nova ss', '442', 'skylark gs',
  'fairlane', 'galaxie', 'torino', 'boss 302', 'boss 429', 'mach 1',
  'shelby gt350', 'shelby gt500', 'cobra', 'ac cobra', 'daytona charger',
  'superbird', 'super bee', 'split window', '2002tii', 'karmann ghia',
  'vw thing', 'microbus',
  // Modern Classics (1980s-early 2000s)
  'f40', 'testarossa', '512 bb', 'countach', 'diablo', 'miura', 'delorean',
  'dmc-12', 'buick gnx', 'grand national', 'lotus esprit', 'turbo esprit',
  'e30 m3', '964', '993', 'rx-7 fd', 'supra a80', 'mr2', 'ae86', '240sx',
  '300zx', 'r32', 'r33', 'r34', 'skyline', 'fj40', 'fj60', 'fj80',
  'k5 blazer', 'jeep cj', 'willys',
];

function isClassicByYear(year: number | undefined | null): boolean {
  return typeof year === 'number' && year > 0 && year <= CLASSIC_YEAR_THRESHOLD;
}

function isClassicByModel(model: string | undefined | null): boolean {
  if (!model) return false;
  const modelLower = model.toLowerCase();
  return CLASSIC_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw));
}

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
  seat_rows: number;
  is_exotic: boolean;
  is_classic: boolean;
  requires_custom_quote: boolean;
  needs_year_confirmation: boolean;
}

export function getSeatRows(sizeClass: string | null, vehicleCategory: string): number {
  if (vehicleCategory === 'motorcycle') return 0;
  if (vehicleCategory !== 'automobile') return 0;
  switch (sizeClass) {
    case 'sedan': return 2;
    case 'truck_suv_2row': return 2;
    case 'suv_3row_van': return 3;
    default: return 2;
  }
}

/**
 * Resolve full vehicle classification from make and optional model/year.
 *
 * 5-layer approach:
 * 1. Query vehicle_makes table for category (automobile vs motorcycle vs rv etc.)
 * 2. For automobiles, infer size_class from model via MODEL_SIZE_HINTS
 * 3. For specialty vehicles, set default specialty_tier (staff corrects in POS)
 * 4. Layer exotic detection on top (EXOTIC_MAKES + EXOTIC_MAKE_MODELS)
 * 5. Layer classic detection on top (year-based + model keyword)
 *
 * Returns full classification with exotic/classic flags.
 *
 * Examples:
 *   ("Toyota", "Camry")              → { automobile, standard, sedan, null, not exotic, not classic }
 *   ("Ferrari", "488 GTB")           → { automobile, standard, sedan, null, exotic, requires_custom_quote }
 *   ("Porsche", "Cayenne")           → { automobile, standard, truck_suv_2row, null, not exotic }
 *   ("Chevrolet", "Camaro", 1967)    → { automobile, standard, sedan, null, classic, requires_custom_quote }
 *   ("Harley-Davidson", "Sportster") → { motorcycle, motorcycle, null, standard_cruiser }
 *   ("Winnebago", "View")            → { rv, rv, null, rv_up_to_24, requires_custom_quote }
 */
export async function resolveVehicleClassification(
  supabase: { from: (table: string) => unknown },
  make: string,
  model?: string,
  year?: number
): Promise<VehicleClassification> {
  // --- Layer 1: resolve category from vehicle_makes table ---
  let category: VehicleCategory = 'automobile';

  if (make) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: makeRows } = await (supabase as any)
        .from('vehicle_makes')
        .select('category')
        .ilike('name', make.trim())
        .eq('is_active', true);

      const validRows = (makeRows || []).filter(
        (r: { category: string }) => VEHICLE_CATEGORIES.includes(r.category as VehicleCategory)
      );

      if (validRows.length === 1) {
        category = validRows[0].category as VehicleCategory;
      } else if (validRows.length > 1) {
        const categories = validRows.map((r: { category: string }) => r.category);
        category = disambiguateCategory(categories, model);
      }
    } catch {
      // DB unavailable — default to automobile
    }
  }

  // --- Layer 2+3: build base classification ---
  let baseResult: VehicleClassification;

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

    baseResult = {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: sizeClass,
      specialty_tier: null,
      seat_rows: getSeatRows(sizeClass, 'automobile'),
      is_exotic: false,
      is_classic: false,
      requires_custom_quote: false,
      needs_year_confirmation: false,
    };
  } else {
    baseResult = {
      vehicle_category: category,
      vehicle_type: category,
      size_class: null,
      specialty_tier: DEFAULT_SPECIALTY_TIERS[category],
      seat_rows: getSeatRows(null, category),
      is_exotic: false,
      is_classic: false,
      requires_custom_quote: category !== 'motorcycle', // rv, boat, aircraft need custom quotes
      needs_year_confirmation: false,
    };
  }

  // --- Layer 4: exotic detection (layered on top) ---
  if (make && isExoticMake(make)) {
    baseResult.is_exotic = true;
    baseResult.requires_custom_quote = true;
  } else if (make && model && isExoticModel(make, model)) {
    baseResult.is_exotic = true;
    baseResult.requires_custom_quote = true;
  }

  // --- Layer 5: classic detection (layered on top) ---
  if (isClassicByYear(year)) {
    baseResult.is_classic = true;
    baseResult.requires_custom_quote = true;
  } else if (isClassicByModel(model)) {
    baseResult.is_classic = true;
    baseResult.requires_custom_quote = true;
    if (!year) {
      baseResult.needs_year_confirmation = true;
    }
  }

  return baseResult;
}
