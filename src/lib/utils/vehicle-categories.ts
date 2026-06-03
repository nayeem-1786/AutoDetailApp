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

// ~160 keywords (Session 26: expanded Honda/Yamaha/Suzuki/Kawasaki/BMW gaps)
const MOTORCYCLE_MODEL_KEYWORDS = [
  // Harley-Davidson
  'sportster', 'softail', 'road king', 'road glide', 'street glide', 'fat boy', 'fat bob',
  'iron', 'nightster', 'breakout', 'heritage', 'electra glide', 'ultra limited', 'low rider',
  'night rod', 'pan america', 'livewire',
  // Honda motorcycle
  'cbr', 'crf', 'cb500', 'cb650', 'cb300', 'cb1000', 'cb125',
  'africa twin', 'gold wing', 'goldwing',
  'rebel', 'grom', 'monkey', 'trail', 'shadow', 'fury', 'valkyrie',
  'vtx', 'ctx', 'nc700', 'nc750', 'vfr', 'st1100', 'st1300', 'rune',
  'pcx', 'forza', 'navi', 'adv150',
  // BMW motorcycle
  'r1250', 'r1200', 'f850', 'f750', 'f900', 'g310', 'c400', 's1000', 'r nine', 'rninet',
  'k1600', 'ce 04', 'r18', 'f800', 'f650',
  // Yamaha motorcycle
  'yzf', 'mt-', 'mt0', 'mt1', 'tenere', 'r1', 'r6', 'r7', 'r3', 'fz', 'xsr',
  'bolt', 'v-star', 'vstar', 'drag star', 'vmax', 'tw200', 'wr250', 'wr450',
  'star venture', 'star eluder',
  // Suzuki motorcycle
  'gsx', 'gsxr', 'gsx-r', 'v-strom', 'vstrom', 'hayabusa', 'katana', 'boulevard',
  'burgman', 'dr-z', 'drz', 'sv650', 'sv1000', 'tu250', 'gs500', 'bandit',
  // Kawasaki motorcycle
  'ninja', 'zx-', 'zx6', 'zx10', 'zx14', 'z900', 'z650', 'z400', 'versys',
  'klr', 'klx', 'vulcan', 'concours', 'eliminator', 'w800', 'w650', 'er-6', 'er6',
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
  // KTM
  'duke', 'adventure', 'exc', 'sx-f', 'enduro',
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
 *
 * Returns `{ category, matched }`:
 * - `matched: true` when a keyword hint resolved the category positively
 *   (either via category-keyword match or via the automobile MODEL_SIZE_HINTS
 *   list — both are evidence the classifier knows what the vehicle is).
 * - `matched: false` when the function fell through to its automobile
 *   default (no model OR model didn't match any keyword for any of the
 *   provided categories). The #131 Layer 2 caller (resolveVehicleClassification)
 *   uses this flag to flag the classification as `category_confident: false`,
 *   which in turn tells UI callers (step-vehicle.tsx, vehicle-form-dialog.tsx)
 *   not to auto-override the user's explicit category pick.
 */
function disambiguateCategory(
  categories: string[],
  model: string | null | undefined
): { category: VehicleCategory; matched: boolean } {
  if (!model) {
    // Dev-warn (#129 Q7): one of the silent fall-throughs to 'automobile'.
    // #131 Layer 2 made this path explicit via `matched: false`, so the
    // resolver's caller never auto-overrides a user category from this
    // fall-through. The dev-warn stays as data-drift telemetry — see
    // VEHICLE_FORM_UNIFICATION_AUDIT.md S9.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[VehicleClassify] Dual-category make with no model — defaulting to automobile');
    }
    return { category: 'automobile', matched: false };
  }

  const modelLower = model.toLowerCase();

  // Check motorcycle models
  if (categories.includes('motorcycle')) {
    if (MOTORCYCLE_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return { category: 'motorcycle', matched: true };
    }
  }

  // Check boat models
  if (categories.includes('boat')) {
    if (BOAT_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return { category: 'boat', matched: true };
    }
  }

  // Check RV models
  if (categories.includes('rv')) {
    if (RV_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return { category: 'rv', matched: true };
    }
  }

  // Check aircraft models
  if (categories.includes('aircraft')) {
    if (AIRCRAFT_MODEL_KEYWORDS.some((kw) => modelLower.includes(kw))) {
      return { category: 'aircraft', matched: true };
    }
  }

  // Check automobile models (existing MODEL_SIZE_HINTS)
  if (categories.includes('automobile')) {
    const allAutoModels = Object.values(MODEL_SIZE_HINTS).flat();
    if (allAutoModels.some((hint) => modelLower.includes(hint.toLowerCase()))) {
      return { category: 'automobile', matched: true };
    }
  }

  // No model match — default to automobile (Layer 2: flagged as not matched).
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[VehicleClassify] Dual-category make + model="${model}" matched no keyword — defaulting to automobile`);
  }
  return { category: 'automobile', matched: false };
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
  // Session 26 additions
  'maserati', 'maybach', 'mercedes-maybach',
];

/**
 * Specific exotic models from standard makes. Short names use exact match.
 * Session 26: expanded BMW M, Audi RS, Mercedes-AMG, Tesla, Dodge, Porsche.
 * Maserati removed — now full-make exotic.
 * NOTE: Corvette Stingray (base C8) is NOT flagged — under judgment.
 *       The Z06/ZR1/E-Ray variants are flagged. Owner can override in POS.
 */
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
    { model: '911 turbo', matchType: 'substring' },
    { model: 'taycan turbo s', matchType: 'substring' },
    { model: 'panamera turbo s', matchType: 'substring' },
  ],
  dodge: [
    { model: 'viper', matchType: 'substring' },
    { model: 'srt viper', matchType: 'substring' },
    { model: 'hellcat', matchType: 'substring' },
    { model: 'demon', matchType: 'substring' },
    { model: 'srt', matchType: 'substring' },
    { model: 'jailbreak', matchType: 'substring' },
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
    { model: 'm3', matchType: 'exact' },
    { model: 'm4', matchType: 'exact' },
    { model: 'm5', matchType: 'exact' },
    { model: 'm8', matchType: 'exact' },
    { model: 'xm', matchType: 'exact' },
    { model: 'm3 ', matchType: 'substring' },
    { model: 'm4 ', matchType: 'substring' },
    { model: 'm5 ', matchType: 'substring' },
    { model: 'm8 ', matchType: 'substring' },
  ],
  mercedes: [
    { model: 'amg gt', matchType: 'substring' },
    { model: 'amg one', matchType: 'substring' },
    { model: 'sls', matchType: 'exact' },
    { model: 'slr', matchType: 'exact' },
    { model: 'black series', matchType: 'substring' },
    { model: 's63', matchType: 'substring' },
    { model: 's65', matchType: 'substring' },
    { model: 'gt 4-door', matchType: 'substring' },
    { model: 'gt 63', matchType: 'substring' },
  ],
  'mercedes-benz': [
    { model: 'amg gt', matchType: 'substring' },
    { model: 'amg one', matchType: 'substring' },
    { model: 'sls', matchType: 'exact' },
    { model: 'slr', matchType: 'exact' },
    { model: 'black series', matchType: 'substring' },
    { model: 's63', matchType: 'substring' },
    { model: 's65', matchType: 'substring' },
    { model: 'gt 4-door', matchType: 'substring' },
    { model: 'gt 63', matchType: 'substring' },
  ],
  audi: [
    { model: 'r8', matchType: 'exact' },
    { model: 'rs6', matchType: 'substring' },
    { model: 'rs7', matchType: 'substring' },
    { model: 'rs e-tron', matchType: 'substring' },
    { model: 'rs etron', matchType: 'substring' },
  ],
  tesla: [
    { model: 'model s plaid', matchType: 'substring' },
    { model: 'roadster', matchType: 'substring' },
  ],
  toyota: [
    { model: '2000gt', matchType: 'substring' },
  ],
  jaguar: [
    { model: 'xj220', matchType: 'substring' },
  ],
  lucid: [
    { model: 'air sapphire', matchType: 'substring' },
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
// Classic vehicle detection — curated make+model list (Session 26 rewrite)
//
// Classic requires BOTH: year <= threshold AND make+model on curated list.
// Does NOT blanket-classify every old car — a 2001 Civic is not a classic.
// Stored as TypeScript constants (not DB) — stable domain taxonomy that
// changes a few times per year at most. Promotes to DB table if needed later.
// ---------------------------------------------------------------------------

/** Dynamic threshold — vehicles 25+ years old are classic-eligible */
export const CLASSIC_YEAR_THRESHOLD = new Date().getFullYear() - 25;

/**
 * Curated list of makes + models eligible for classic classification.
 * Both year threshold AND make+model match are required.
 * Use '*' for makes where ALL old models qualify as classic.
 * Array entries are case-insensitive substring matches against the model field.
 */
export const CLASSIC_ELIGIBLE_MAKES: Readonly<Record<string, readonly string[] | '*'>> = {
  // ── American Muscle & Classic ──────────────────────────────────────────
  ford: ['mustang', 'bronco', 'f-100', 'f100', 'thunderbird', 'fairlane', 'galaxie',
    'torino', 'falcon', 'gt40', 'shelby', 'cobra', 'ranchero', 'boss', 'mach 1',
    'model t', 'model a', 'pinto'],
  chevrolet: ['camaro', 'corvette', 'chevelle', 'nova', 'impala', 'bel air', 'el camino',
    'blazer', 'c10', 'c-10', 'k5', 'monte carlo', 'malibu ss', '3100', 'apache',
    'step side', 'stepside', 'split window', 'ss'],
  pontiac: ['gto', 'firebird', 'trans am', 'lemans', 'catalina', 'grand prix', 'tempest'],
  plymouth: ['barracuda', 'cuda', 'hemi cuda', 'road runner', 'gtx', 'duster', 'satellite',
    'superbird', 'fury', 'valiant'],
  dodge: ['charger', 'challenger', 'dart', 'coronet', 'super bee', 'daytona', 'power wagon',
    'd100', 'd-100', 'lil red'],
  amc: ['amx', 'javelin', 'gremlin', 'pacer', 'rebel', 'scrambler', 'hornet'],
  oldsmobile: ['442', 'cutlass', 'toronado', 'hurst', 'delta 88', 'w-30', 'w30'],
  buick: ['skylark', 'gs', 'gsx', 'riviera', 'grand national', 'gnx', 'wildcat', 'century'],
  mercury: ['cougar', 'cyclone', 'comet', 'monterey'],
  shelby: '*',
  delorean: '*',
  studebaker: '*',
  hudson: '*',
  nash: '*',
  jeep: ['cj', 'willys', 'wagoneer', 'j-10', 'j10', 'j-20', 'j20'],
  'international harvester': '*',
  international: ['scout'],
  lincoln: ['continental', 'mark'],

  // ── European Classic ───────────────────────────────────────────────────
  porsche: '*',
  bmw: ['2002', 'e30', 'e28', 'e24', 'e9', 'isetta', 'm3', 'm5', 'm6', 'z3 m', 'z8',
    '3.0', 'tii'],
  'mercedes-benz': ['300sl', 'gullwing', 'pagoda', '190sl', '280sl', '560', 'w123', 'w124',
    'w113', 'w107', 'w111', '190e'],
  mercedes: ['300sl', 'gullwing', 'pagoda', '190sl', '280sl', '560', 'w123', 'w124',
    'w113', 'w107', 'w111', '190e'],
  volkswagen: ['beetle', 'bus', 'karmann ghia', 'thing', 'type 3', 'type 1', 'type 2',
    'microbus', 'vanagon', 'westfalia'],
  jaguar: ['e-type', 'xke', 'xk120', 'xk140', 'xk150', 'xk', 'mark ii', 'mk ii', 'xjs'],
  mg: '*',
  triumph: ['tr6', 'tr4', 'tr3', 'tr2', 'spitfire', 'gt6', 'stag', 'herald'],
  'austin-healey': '*',
  'alfa romeo': ['spider', 'giulietta', 'gtv', 'gta', 'montreal', 'duetto', 'giulia sprint'],
  fiat: ['124 spider', '124', '500', 'x1/9', 'dino'],
  lotus: ['elan', 'europa', 'seven', 'elite', 'esprit', 'turbo esprit'],
  mini: ['cooper', 'classic'],
  'land rover': ['series', 'defender'],
  volvo: ['p1800', '1800', 'amazon', '122s', '544'],
  ac: ['cobra'],
  'de tomaso': ['pantera', 'mangusta'],

  // ── Japanese Classic ───────────────────────────────────────────────────
  datsun: '*',
  nissan: ['240z', '260z', '280z', '280zx', '300zx', '510', 'skyline', 'r32', 'r33',
    'r34', 'hakosuka', 'kenmeri', 'fairlady', '240sx'],
  toyota: ['land cruiser', 'fj40', 'fj60', 'fj80', '2000gt', 'celica', 'supra', 'ae86',
    'mr2', 'te27', 'hilux'],
  honda: ['s600', 's800', 's2000', 'n600', 'z600', 'prelude', 'crx'],
  mazda: ['rx-7', 'rx7', 'rx-3', 'rx3', 'rx-2', 'rx2', 'cosmo', 'miata'],
  subaru: ['brat', '360', 'svx'],
  mitsubishi: ['starion', '3000gt', 'gto', 'eclipse gsx', 'evo'],

  // ── Exotic makes (old models get both exotic + classic per coexistence rule) ──
  ferrari: '*',
  lamborghini: '*',
  mclaren: '*',
  'aston martin': '*',
  bentley: '*',
  'rolls-royce': '*',
  'rolls royce': '*',
  maserati: '*',
  bugatti: '*',
  // Packard & Duesenberg already in EXOTIC_MAKES — classic too
  packard: '*',
  duesenberg: '*',
};

function isClassicByYear(year: number | undefined | null): boolean {
  return typeof year === 'number' && year > 0 && year <= CLASSIC_YEAR_THRESHOLD;
}

/**
 * Check if a vehicle qualifies as classic.
 * Requires BOTH year threshold AND curated make+model match.
 */
function isClassicVehicle(
  make: string | undefined | null,
  model: string | undefined | null,
  year: number | undefined | null
): boolean {
  if (!isClassicByYear(year)) return false;
  if (!make) return false;
  const makeLower = make.trim().toLowerCase();
  const eligible = CLASSIC_ELIGIBLE_MAKES[makeLower];
  if (!eligible) return false;
  if (eligible === '*') return true;
  if (!model) return false;
  const modelLower = model.trim().toLowerCase();
  return (eligible as readonly string[]).some((pattern) => modelLower.includes(pattern));
}

/**
 * Check if a vehicle MIGHT be classic (model matches curated list, year unconfirmed).
 * Used to set needs_year_confirmation when year is not provided.
 */
function mightBeClassicVehicle(
  make: string | undefined | null,
  model: string | undefined | null
): boolean {
  if (!make) return false;
  const makeLower = make.trim().toLowerCase();
  const eligible = CLASSIC_ELIGIBLE_MAKES[makeLower];
  if (!eligible) return false;
  if (eligible === '*') return true;
  if (!model) return false;
  const modelLower = model.trim().toLowerCase();
  return (eligible as readonly string[]).some((pattern) => modelLower.includes(pattern));
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
  /**
   * Canonical vehicle size taxonomy after Session 29 cleanup.
   * Values: 'sedan' | 'truck_suv_2row' | 'suv_3row_van' | 'exotic' | 'classic' | null.
   * Exotic and classic are first-class members of this taxonomy — no parallel flags.
   */
  size_class: string | null;
  specialty_tier: string | null;
  seat_rows: number;
  /**
   * Orthogonal UX signal — NOT a size_class value itself.
   * True when the model matches a curated classic candidate but the year is unknown.
   * The caller should prompt the customer to confirm the year before the classification
   * locks in as 'classic'. Survives the Session 29 flag cull because it describes
   * classifier confidence, not vehicle attributes.
   */
  needs_year_confirmation: boolean;
  /**
   * #131 Layer 2 — confidence signal for `vehicle_category` resolution.
   *
   * `true` when the resolver matched a single `vehicle_makes` row OR
   * disambiguated a dual-category match via a known model keyword. Callers
   * that auto-write category from this result (e.g. `step-vehicle.tsx`'s
   * classifier effect) may trust `vehicle_category` and override the user's
   * pick.
   *
   * `false` when the resolver fell through to its automobile default
   * (no make, 0-row `vehicle_makes` lookup, dual-category make with
   * empty/unmatched model, DB error). Callers MUST NOT auto-override
   * the user's explicit non-automobile category from a non-confident
   * result — that was the F1 form-reset bug
   * (PUBLIC_BOOKING_FLOW_AUDIT.md, #127) that #129 C1's empty-model gate
   * only partially fixed and #131 promotes to a structural Layer 2 fix.
   *
   * Note: this flag is scoped to CATEGORY confidence only. `size_class`
   * (Layers 4+5 — exotic/classic detection) is independent of category
   * resolution and stays authoritative on server writes via the
   * `/api/customer/vehicles` POST/PATCH routes (Session 29 anti-gaming).
   * See CLAUDE.md Rule 19.
   */
  category_confident: boolean;
  /**
   * S1 (Session #142, Vehicle Classifier Restoration, 2026-06-02) —
   * telemetry signal for why `category_confident` is false. Disambiguates
   * "Layer 1 ran successfully but found no matching make" (operator
   * typo, make missing from `vehicle_makes` taxonomy) from "Layer 1's
   * `vehicle_makes` query failed entirely" (DB error, RLS denial pre-C1
   * fix). Pre-S1 the resolver swallowed Supabase's `error` field and
   * the caller couldn't tell the two cases apart — both fell through
   * to the same dev-warn-then-silent-default path.
   *
   * **Values:**
   *   - `undefined` / absent on confident classifications — `category_confident=true`
   *     means Layer 1 found positive evidence; no reason field needed.
   *   - `'no_match'` — Layer 1's `vehicle_makes` query SUCCEEDED but
   *     returned 0 valid rows for the supplied make. Typically a make
   *     typo or a make missing from the curated taxonomy. The classifier
   *     defaults to `automobile` + `category_confident=false` and the
   *     caller leaves the user's category pick alone (#131 Layer 2).
   *   - `'query_failed'` — Layer 1's `vehicle_makes` query threw OR
   *     returned a non-null `error` field. The caller should
   *     `console.warn` for telemetry; UI behavior is identical to
   *     `'no_match'` (default to automobile + don't override user's
   *     category).
   *
   * Backward compatible: existing callers that read only
   * `category_confident` continue to work unchanged.
   */
  classifier_reason?: 'no_match' | 'query_failed';
}

export function getSeatRows(sizeClass: string | null, vehicleCategory: string): number {
  if (vehicleCategory === 'motorcycle') return 0;
  if (vehicleCategory !== 'automobile') return 0;
  switch (sizeClass) {
    case 'sedan': return 2;
    case 'truck_suv_2row': return 2;
    case 'suv_3row_van': return 3;
    // Session 29: exotic and classic default to 2 seat rows (most specialty vehicles are 2-seaters).
    // Current EXOTIC_MAKE_MODELS and CLASSIC_ELIGIBLE_MAKES contain no known 3-row exceptions.
    case 'exotic': return 2;
    case 'classic': return 2;
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
 * 4. Exotic detection overrides automobile size_class → 'exotic'
 * 5. Classic detection overrides automobile size_class → 'classic' (exotic wins dual-flag)
 *
 * Session 29: size_class is the canonical taxonomy. Exotic and classic are first-class
 * members, not parallel boolean flags. A vehicle matching BOTH criteria (e.g., a 1972
 * Ferrari) resolves to 'exotic' — exotic takes precedence.
 *
 * Examples:
 *   ("Toyota", "Camry")              → { automobile, standard, sedan }
 *   ("Ferrari", "488 GTB")           → { automobile, standard, exotic }
 *   ("Porsche", "Cayenne")           → { automobile, standard, truck_suv_2row }
 *   ("Chevrolet", "Camaro", 1967)    → { automobile, standard, classic }
 *   ("Ferrari", "Dino 246", 1972)    → { automobile, standard, exotic }  // exotic wins dual-flag
 *   ("Harley-Davidson", "Sportster") → { motorcycle, motorcycle, null, standard_cruiser }
 *   ("Winnebago", "View")            → { rv, rv, null, rv_up_to_24 }
 */
export async function resolveVehicleClassification(
  supabase: { from: (table: string) => unknown },
  make: string,
  model?: string,
  year?: number
): Promise<VehicleClassification> {
  // --- Layer 1: resolve category from vehicle_makes table ---
  let category: VehicleCategory = 'automobile';
  // #131 Layer 2 — start unconfident; only the two positive-evidence
  // branches below (single-row match, disambiguation match) flip this to
  // true. Every other path (no make, 0-row lookup, DB error, ambiguous
  // disambiguation fallback) leaves it false, and the UI callers refuse
  // to auto-override the user's category in that case.
  let categoryConfident = false;
  // S1 (Session #142, 2026-06-02) — telemetry signal disambiguating
  // the two non-confident paths. `undefined` for confident results,
  // `'no_match'` for 0-row Layer-1, `'query_failed'` for any error
  // surfaced by Supabase (RLS denial pre-C1 fix, network, schema
  // mismatch). Browser callers `console.warn` on `'query_failed'`
  // for telemetry; UI behavior between the two reasons is identical.
  let classifierReason: 'no_match' | 'query_failed' | undefined;

  if (make) {
    try {
      // S1 — destructure `error` too so we can detect non-throw failure
      // paths (RLS denial, table-missing, etc. — Supabase returns
      // `{data: null, error: {...}}` without throwing). Pre-S1 the
      // resolver only read `data`, making `{data:[], error:null}`
      // indistinguishable from `{data:null, error:RLS}` — both fell
      // through to the dev-warn-and-default path with no caller signal.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: makeRows, error: makeErr } = await (supabase as any)
        .from('vehicle_makes')
        .select('category')
        .ilike('name', make.trim())
        .eq('is_active', true);

      if (makeErr) {
        // Non-throw failure path — Supabase surfaced an error object
        // (RLS denial, network, schema mismatch). Treat as query_failed.
        classifierReason = 'query_failed';
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[VehicleClassify] vehicle_makes query returned error for make="${make.trim()}" — defaulting to automobile`,
            makeErr
          );
        }
      } else {
        const validRows = (makeRows || []).filter(
          (r: { category: string }) => VEHICLE_CATEGORIES.includes(r.category as VehicleCategory)
        );

        if (validRows.length === 1) {
          category = validRows[0].category as VehicleCategory;
          categoryConfident = true;
        } else if (validRows.length > 1) {
          const categories = validRows.map((r: { category: string }) => r.category);
          const disambiguated = disambiguateCategory(categories, model);
          category = disambiguated.category;
          categoryConfident = disambiguated.matched;
          // disambiguation fall-through (matched=false) counts as no_match
          // — Layer 1 returned data, but couldn't pin the category.
          if (!disambiguated.matched) classifierReason = 'no_match';
        } else {
          // Dev-warn (#129 Q7): no `vehicle_makes` row matched — signals
          // data drift between the combobox source (also `vehicle_makes`)
          // and this resolver's ilike lookup (whitespace, accents,
          // deactivation). Silently defaults to automobile in production.
          // See PUBLIC_BOOKING_FLOW_AUDIT.md F4. The #131 Layer 2 fix
          // prevents UI callers from acting on this silent default.
          classifierReason = 'no_match';
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[VehicleClassify] No vehicle_makes row matched make="${make.trim()}" — defaulting to automobile`);
          }
        }
      }
    } catch (err) {
      // Throw path — DB unavailable, JS error, etc. Treat as query_failed
      // (sibling to the makeErr non-throw branch above).
      classifierReason = 'query_failed';
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[VehicleClassify] vehicle_makes lookup failed — defaulting to automobile', err);
      }
    }
  } else {
    // No make supplied — caller invoked the classifier with empty make.
    // Layer 1 couldn't run; semantically closer to no_match than to
    // query_failed.
    classifierReason = 'no_match';
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
      needs_year_confirmation: false,
      category_confident: categoryConfident,
      // S1 — telemetry signal. Omitted on confident results so callers
      // can use `!result.classifier_reason` as the success check.
      ...(categoryConfident ? {} : { classifier_reason: classifierReason }),
    };
  } else {
    // **Layer 3 — specialty_tier (M1, Session #142, 2026-06-02 — INTENTIONAL
    // MANUAL-PICK by design, NOT a fallback).** For non-automobile categories
    // (motorcycle / rv / boat / aircraft) the classifier seeds the smallest
    // tier from `DEFAULT_SPECIALTY_TIERS` as a placeholder, and the operator
    // or customer picks the actual tier manually from the SPECIALTY_TIERS UI
    // dropdown. There is **no DB lookup** that maps `(make, model)` → specialty
    // tier — the make/model→tier relationship is operator domain knowledge
    // that doesn't scale into a curated table (RV lengths, motorcycle
    // body-types, boat sizes, aircraft seat-counts are all 1:N with model
    // variants AND change per model-year). Layers 1 (category), 2 (automobile
    // size_class hints), 4 (exotic), 5 (classic) ARE classifier-derived;
    // Layer 3 is the lone manual-pick layer by design. Operator-facing
    // surfaces should make this distinction clear (`step-vehicle.tsx`'s
    // specialty-tier section now carries a "Please select your size" label
    // framed as required input, NOT as a fallback because detection failed).
    // See CLAUDE.md Rule 22.
    baseResult = {
      vehicle_category: category,
      vehicle_type: category,
      size_class: null,
      specialty_tier: DEFAULT_SPECIALTY_TIERS[category],
      seat_rows: getSeatRows(null, category),
      needs_year_confirmation: false,
      category_confident: categoryConfident,
      ...(categoryConfident ? {} : { classifier_reason: classifierReason }),
    };
  }

  // --- Layer 4: exotic detection (automobile only — overrides size_class to 'exotic') ---
  if (category === 'automobile' && make) {
    const exotic = isExoticMake(make) || (model ? isExoticModel(make, model) : false);
    if (exotic) {
      baseResult.size_class = 'exotic';
      baseResult.seat_rows = getSeatRows('exotic', 'automobile');
    }
  }

  // --- Layer 5: classic detection (exotic already set → skip; exotic wins dual-flag) ---
  if (category === 'automobile' && baseResult.size_class !== 'exotic') {
    if (isClassicVehicle(make, model, year)) {
      baseResult.size_class = 'classic';
      baseResult.seat_rows = getSeatRows('classic', 'automobile');
    } else if (!year && mightBeClassicVehicle(make, model)) {
      // Model is on curated classic list but year unknown — caller should prompt customer
      baseResult.needs_year_confirmation = true;
    }
  }

  return baseResult;
}

// ---------------------------------------------------------------------------
// Make canonicalization — normalize common abbreviations/misspellings
// ---------------------------------------------------------------------------

const MAKE_CANONICAL_MAP: Record<string, string> = {
  'chevy': 'Chevrolet',
  'mercedes': 'Mercedes-Benz',
  'merc': 'Mercedes-Benz',
  'vw': 'Volkswagen',
  'beemer': 'BMW',
  'bimmer': 'BMW',
  'caddy': 'Cadillac',
  'lambo': 'Lamborghini',
  'rolls': 'Rolls-Royce',
  'aston': 'Aston Martin',
  'alfa': 'Alfa Romeo',
  'porshe': 'Porsche',
  'porche': 'Porsche',
  'lexis': 'Lexus',
  'infinti': 'Infiniti',
  'infinity': 'Infiniti',
  'acurra': 'Acura',
  'toyata': 'Toyota',
  'hyundia': 'Hyundai',
  'hundai': 'Hyundai',
};

/**
 * Canonicalize a vehicle make string.
 * Maps common abbreviations (Chevy → Chevrolet) and misspellings.
 * Returns the original (trimmed) value if no canonical mapping exists.
 */
export function canonicalizeMake(make: string): string {
  const trimmed = make.trim();
  if (!trimmed) return trimmed;
  const canonical = MAKE_CANONICAL_MAP[trimmed.toLowerCase()];
  return canonical ?? trimmed;
}

// ---------------------------------------------------------------------------
// Field inversion detection — flag swapped make/model fields
// ---------------------------------------------------------------------------

/** Known vehicle makes for inversion detection */
const KNOWN_MAKES_SET = new Set([
  // Major auto manufacturers
  'acura', 'alfa romeo', 'amc', 'aston martin', 'audi', 'bentley', 'bmw', 'buick',
  'cadillac', 'chevrolet', 'chrysler', 'dodge', 'ferrari', 'fiat', 'ford',
  'genesis', 'gmc', 'honda', 'hyundai', 'infiniti', 'jaguar', 'jeep', 'kia',
  'lamborghini', 'land rover', 'lexus', 'lincoln', 'lotus', 'lucid', 'maserati',
  'maybach', 'mazda', 'mclaren', 'mercedes-benz', 'mini', 'mitsubishi', 'nissan',
  'oldsmobile', 'plymouth', 'pontiac', 'porsche', 'ram', 'rivian',
  'rolls-royce', 'subaru', 'suzuki', 'tesla', 'toyota', 'volkswagen', 'volvo',
  // Motorcycle makes
  'harley-davidson', 'ducati', 'triumph', 'indian', 'aprilia', 'ktm',
  'royal enfield', 'kawasaki', 'yamaha',
  // RV/Boat/Aircraft
  'winnebago', 'airstream', 'thor', 'cessna', 'piper', 'beechcraft', 'cirrus',
  'boston whaler', 'sea ray', 'bayliner', 'mastercraft',
  // Other exotic
  'bugatti', 'pagani', 'koenigsegg', 'datsun', 'delorean',
]);

export interface FieldInversionResult {
  isInverted: boolean;
  reason: string;
}

/**
 * Detect if make/model fields are likely swapped.
 * Checks if `model` starts with a known make AND `make` is NOT a known make.
 * Returns null if no inversion detected.
 * Does NOT auto-correct — flags for human review.
 */
export function detectFieldInversion(
  make: string | null | undefined,
  model: string | null | undefined
): FieldInversionResult | null {
  if (!make || !model) return null;
  const makeTrimmed = make.trim();
  const modelTrimmed = model.trim();
  if (!makeTrimmed || !modelTrimmed) return null;

  const makeLower = makeTrimmed.toLowerCase();
  const modelLower = modelTrimmed.toLowerCase();

  // Is the provided make NOT a known make?
  const makeIsKnown = KNOWN_MAKES_SET.has(makeLower);

  // Does the model field start with a known make?
  const modelFirstWord = modelLower.split(/[\s,]+/)[0];
  const modelStartsWithKnownMake = KNOWN_MAKES_SET.has(modelFirstWord) ||
    [...KNOWN_MAKES_SET].some((m) => modelLower.startsWith(m + ' '));

  if (!makeIsKnown && modelStartsWithKnownMake) {
    return {
      isInverted: true,
      reason: `make="${makeTrimmed}" is not recognized; model="${modelTrimmed}" starts with a known make — fields may be swapped`,
    };
  }

  return null;
}
