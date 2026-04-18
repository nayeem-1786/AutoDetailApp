#!/usr/bin/env tsx
/**
 * Backfill vehicle classification flags (is_exotic, is_classic, make canonicalization).
 *
 * DRY-RUN by default — logs proposed changes without writing to DB.
 * Pass --apply to execute writes (NOT approved for this session).
 *
 * Usage:
 *   npx tsx scripts/backfill-vehicle-classification.ts          # dry-run
 *   npx tsx scripts/backfill-vehicle-classification.ts --apply  # LIVE (requires approval)
 */

import { createClient } from '@supabase/supabase-js';

// Load env
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const isDryRun = !process.argv.includes('--apply');

if (isDryRun) {
  console.log('=== DRY-RUN MODE — no writes will be made ===\n');
} else {
  console.log('=== LIVE MODE — changes will be written to the database ===\n');
}

// We need to dynamically import the classifier since it uses path aliases
// Build the classifier inline to avoid import issues with tsx + path aliases

// --- Inline exotic/classic detection (mirrors vehicle-categories.ts) ---

const EXOTIC_MAKES = [
  'ferrari', 'lamborghini', 'mclaren', 'bugatti', 'pagani', 'koenigsegg',
  'rimac', 'hennessey', 'ssc', 'saleen', 'noble', 'spyker', 'w motors',
  'czinger', 'de tomaso', 'hispano suiza', 'pininfarina', 'aston martin',
  'bentley', 'rolls-royce', 'rolls royce', 'lotus', 'duesenberg', 'packard',
  'maserati', 'maybach', 'mercedes-maybach',
];

const EXOTIC_MAKE_MODELS: Record<string, Array<{ model: string; matchType: 'exact' | 'substring' }>> = {
  porsche: [
    { model: '918', matchType: 'exact' }, { model: '959', matchType: 'exact' },
    { model: 'carrera gt', matchType: 'substring' }, { model: '911 gt3', matchType: 'substring' },
    { model: '911 gt2', matchType: 'substring' }, { model: 'gt3 rs', matchType: 'substring' },
    { model: 'gt2 rs', matchType: 'substring' }, { model: '911 turbo s', matchType: 'substring' },
    { model: '911 turbo', matchType: 'substring' }, { model: 'taycan turbo s', matchType: 'substring' },
    { model: 'panamera turbo s', matchType: 'substring' },
  ],
  dodge: [
    { model: 'viper', matchType: 'substring' }, { model: 'srt viper', matchType: 'substring' },
    { model: 'hellcat', matchType: 'substring' }, { model: 'demon', matchType: 'substring' },
    { model: 'srt', matchType: 'substring' }, { model: 'jailbreak', matchType: 'substring' },
  ],
  ford: [{ model: 'gt', matchType: 'exact' }],
  chevrolet: [
    { model: 'corvette z06', matchType: 'substring' }, { model: 'corvette zr1', matchType: 'substring' },
    { model: 'corvette e-ray', matchType: 'substring' },
  ],
  nissan: [{ model: 'gt-r', matchType: 'substring' }, { model: 'gtr', matchType: 'exact' }],
  acura: [{ model: 'nsx', matchType: 'exact' }],
  lexus: [{ model: 'lfa', matchType: 'exact' }],
  bmw: [
    { model: 'i8', matchType: 'exact' }, { model: 'm3', matchType: 'exact' },
    { model: 'm4', matchType: 'exact' }, { model: 'm5', matchType: 'exact' },
    { model: 'm8', matchType: 'exact' }, { model: 'xm', matchType: 'exact' },
    { model: 'm3 ', matchType: 'substring' }, { model: 'm4 ', matchType: 'substring' },
    { model: 'm5 ', matchType: 'substring' }, { model: 'm8 ', matchType: 'substring' },
  ],
  mercedes: [
    { model: 'amg gt', matchType: 'substring' }, { model: 'amg one', matchType: 'substring' },
    { model: 'sls', matchType: 'exact' }, { model: 'slr', matchType: 'exact' },
    { model: 'black series', matchType: 'substring' }, { model: 's63', matchType: 'substring' },
    { model: 's65', matchType: 'substring' }, { model: 'gt 4-door', matchType: 'substring' },
    { model: 'gt 63', matchType: 'substring' },
  ],
  'mercedes-benz': [
    { model: 'amg gt', matchType: 'substring' }, { model: 'amg one', matchType: 'substring' },
    { model: 'sls', matchType: 'exact' }, { model: 'slr', matchType: 'exact' },
    { model: 'black series', matchType: 'substring' }, { model: 's63', matchType: 'substring' },
    { model: 's65', matchType: 'substring' }, { model: 'gt 4-door', matchType: 'substring' },
    { model: 'gt 63', matchType: 'substring' },
  ],
  audi: [
    { model: 'r8', matchType: 'exact' }, { model: 'rs6', matchType: 'substring' },
    { model: 'rs7', matchType: 'substring' }, { model: 'rs e-tron', matchType: 'substring' },
    { model: 'rs etron', matchType: 'substring' },
  ],
  tesla: [
    { model: 'model s plaid', matchType: 'substring' }, { model: 'roadster', matchType: 'substring' },
  ],
  toyota: [{ model: '2000gt', matchType: 'substring' }],
  jaguar: [{ model: 'xj220', matchType: 'substring' }],
  lucid: [{ model: 'air sapphire', matchType: 'substring' }],
};

const CLASSIC_YEAR_THRESHOLD = new Date().getFullYear() - 25;

const CLASSIC_ELIGIBLE_MAKES: Record<string, readonly string[] | '*'> = {
  ford: ['mustang', 'bronco', 'f-100', 'f100', 'thunderbird', 'fairlane', 'galaxie',
    'torino', 'falcon', 'gt40', 'shelby', 'cobra', 'ranchero', 'boss', 'mach 1', 'model t', 'model a', 'pinto'],
  chevrolet: ['camaro', 'corvette', 'chevelle', 'nova', 'impala', 'bel air', 'el camino',
    'blazer', 'c10', 'c-10', 'k5', 'monte carlo', 'malibu ss', '3100', 'apache', 'step side', 'stepside', 'split window', 'ss'],
  pontiac: ['gto', 'firebird', 'trans am', 'lemans', 'catalina', 'grand prix', 'tempest'],
  plymouth: ['barracuda', 'cuda', 'hemi cuda', 'road runner', 'gtx', 'duster', 'satellite', 'superbird', 'fury', 'valiant'],
  dodge: ['charger', 'challenger', 'dart', 'coronet', 'super bee', 'daytona', 'power wagon', 'd100', 'd-100', 'lil red'],
  amc: ['amx', 'javelin', 'gremlin', 'pacer', 'rebel', 'scrambler', 'hornet'],
  oldsmobile: ['442', 'cutlass', 'toronado', 'hurst', 'delta 88', 'w-30', 'w30'],
  buick: ['skylark', 'gs', 'gsx', 'riviera', 'grand national', 'gnx', 'wildcat', 'century'],
  mercury: ['cougar', 'cyclone', 'comet', 'monterey'],
  shelby: '*', delorean: '*', studebaker: '*', hudson: '*', nash: '*',
  jeep: ['cj', 'willys', 'wagoneer', 'j-10', 'j10', 'j-20', 'j20'],
  'international harvester': '*', international: ['scout'],
  lincoln: ['continental', 'mark'],
  porsche: '*',
  bmw: ['2002', 'e30', 'e28', 'e24', 'e9', 'isetta', 'm3', 'm5', 'm6', 'z3 m', 'z8', '3.0', 'tii'],
  'mercedes-benz': ['300sl', 'gullwing', 'pagoda', '190sl', '280sl', '560', 'w123', 'w124', 'w113', 'w107', 'w111', '190e'],
  mercedes: ['300sl', 'gullwing', 'pagoda', '190sl', '280sl', '560', 'w123', 'w124', 'w113', 'w107', 'w111', '190e'],
  volkswagen: ['beetle', 'bus', 'karmann ghia', 'thing', 'type 3', 'type 1', 'type 2', 'microbus', 'vanagon', 'westfalia'],
  jaguar: ['e-type', 'xke', 'xk120', 'xk140', 'xk150', 'xk', 'mark ii', 'mk ii', 'xjs'],
  mg: '*', triumph: ['tr6', 'tr4', 'tr3', 'tr2', 'spitfire', 'gt6', 'stag', 'herald'],
  'austin-healey': '*',
  'alfa romeo': ['spider', 'giulietta', 'gtv', 'gta', 'montreal', 'duetto', 'giulia sprint'],
  fiat: ['124 spider', '124', '500', 'x1/9', 'dino'],
  lotus: ['elan', 'europa', 'seven', 'elite', 'esprit', 'turbo esprit'],
  mini: ['cooper', 'classic'], 'land rover': ['series', 'defender'],
  volvo: ['p1800', '1800', 'amazon', '122s', '544'],
  ac: ['cobra'], 'de tomaso': ['pantera', 'mangusta'],
  datsun: '*',
  nissan: ['240z', '260z', '280z', '280zx', '300zx', '510', 'skyline', 'r32', 'r33', 'r34', 'hakosuka', 'kenmeri', 'fairlady', '240sx'],
  toyota: ['land cruiser', 'fj40', 'fj60', 'fj80', '2000gt', 'celica', 'supra', 'ae86', 'mr2', 'te27', 'hilux'],
  honda: ['s600', 's800', 's2000', 'n600', 'z600', 'prelude', 'crx'],
  mazda: ['rx-7', 'rx7', 'rx-3', 'rx3', 'rx-2', 'rx2', 'cosmo', 'miata'],
  subaru: ['brat', '360', 'svx'], mitsubishi: ['starion', '3000gt', 'gto', 'eclipse gsx', 'evo'],
  ferrari: '*', lamborghini: '*', mclaren: '*', 'aston martin': '*',
  bentley: '*', 'rolls-royce': '*', 'rolls royce': '*', maserati: '*', bugatti: '*',
  packard: '*', duesenberg: '*',
};

const MAKE_CANONICAL_MAP: Record<string, string> = {
  'chevy': 'Chevrolet', 'mercedes': 'Mercedes-Benz', 'merc': 'Mercedes-Benz',
  'vw': 'Volkswagen', 'beemer': 'BMW', 'bimmer': 'BMW', 'caddy': 'Cadillac',
  'lambo': 'Lamborghini', 'rolls': 'Rolls-Royce', 'aston': 'Aston Martin',
  'alfa': 'Alfa Romeo', 'porshe': 'Porsche', 'porche': 'Porsche',
  'lexis': 'Lexus', 'infinti': 'Infiniti', 'infinity': 'Infiniti',
  'acurra': 'Acura', 'toyata': 'Toyota', 'hyundia': 'Hyundai', 'hundai': 'Hyundai',
};

function canonicalize(make: string): string {
  const trimmed = make.trim();
  return MAKE_CANONICAL_MAP[trimmed.toLowerCase()] ?? trimmed;
}

function checkExotic(make: string, model: string | null): boolean {
  const makeLower = make.trim().toLowerCase();
  if (EXOTIC_MAKES.includes(makeLower)) return true;
  if (!model) return false;
  const entries = EXOTIC_MAKE_MODELS[makeLower];
  if (!entries) return false;
  const modelLower = model.trim().toLowerCase();
  return entries.some((e) =>
    e.matchType === 'exact' ? modelLower === e.model.toLowerCase() : modelLower.includes(e.model.toLowerCase())
  );
}

function checkClassic(make: string, model: string | null, year: number | null): boolean {
  if (!year || year <= 0 || year > CLASSIC_YEAR_THRESHOLD) return false;
  const makeLower = make.trim().toLowerCase();
  const eligible = CLASSIC_ELIGIBLE_MAKES[makeLower];
  if (!eligible) return false;
  if (eligible === '*') return true;
  if (!model) return false;
  const modelLower = model.trim().toLowerCase();
  return (eligible as readonly string[]).some((p) => modelLower.includes(p));
}

// --- Main ---

interface VehicleRow {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicle_category: string;
  vehicle_type: string;
  size_class: string | null;
  specialty_tier: string | null;
  is_exotic: boolean;
  is_classic: boolean;
}

interface ProposedChange {
  id: string;
  make: string;
  model: string | null;
  year: number | null;
  changes: Record<string, { old: unknown; new: unknown }>;
}

async function main() {
  const supabase = createClient(supabaseUrl!, supabaseKey!);

  // Fetch all vehicles with a make
  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('id, make, model, year, vehicle_category, vehicle_type, size_class, specialty_tier, is_exotic, is_classic')
    .not('make', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch vehicles:', error.message);
    process.exit(1);
  }

  console.log(`Found ${vehicles.length} vehicles with make field.\n`);

  const proposedChanges: ProposedChange[] = [];
  let exoticCount = 0;
  let classicCount = 0;
  let canonicalizedCount = 0;
  let bothCount = 0;

  for (const v of vehicles as VehicleRow[]) {
    if (!v.make) continue;

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    // Check make canonicalization
    const canonical = canonicalize(v.make);
    if (canonical !== v.make) {
      changes.make = { old: v.make, new: canonical };
      canonicalizedCount++;
    }

    const makeForCheck = canonical;

    // Check exotic
    const shouldBeExotic = checkExotic(makeForCheck, v.model);
    if (shouldBeExotic !== v.is_exotic) {
      changes.is_exotic = { old: v.is_exotic, new: shouldBeExotic };
      if (shouldBeExotic) exoticCount++;
    }

    // Check classic
    const shouldBeClassic = checkClassic(makeForCheck, v.model, v.year);
    if (shouldBeClassic !== v.is_classic) {
      changes.is_classic = { old: v.is_classic, new: shouldBeClassic };
      if (shouldBeClassic) classicCount++;
    }

    if (shouldBeExotic && shouldBeClassic) bothCount++;

    if (Object.keys(changes).length > 0) {
      proposedChanges.push({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        changes,
      });
    }
  }

  // Print report
  console.log('=== PROPOSED CHANGES ===\n');

  for (const change of proposedChanges) {
    const desc = `${change.year || '????'} ${change.make} ${change.model || '(no model)'}`;
    console.log(`Vehicle: ${desc} [${change.id}]`);
    for (const [field, { old: oldVal, new: newVal }] of Object.entries(change.changes)) {
      console.log(`  ${field}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
    }
    console.log();
  }

  console.log('=== SUMMARY ===');
  console.log(`Total vehicles scanned: ${vehicles.length}`);
  console.log(`Vehicles with changes: ${proposedChanges.length}`);
  console.log(`  → Newly exotic: ${exoticCount}`);
  console.log(`  → Newly classic: ${classicCount}`);
  console.log(`  → Both exotic+classic: ${bothCount}`);
  console.log(`  → Make canonicalized: ${canonicalizedCount}`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);

  // Apply if not dry-run
  if (!isDryRun && proposedChanges.length > 0) {
    console.log('\nApplying changes...');
    let applied = 0;
    let failed = 0;

    for (const change of proposedChanges) {
      const updatePayload: Record<string, unknown> = {};
      for (const [field, { new: newVal }] of Object.entries(change.changes)) {
        updatePayload[field] = newVal;
      }

      const { error: updateErr } = await supabase
        .from('vehicles')
        .update(updatePayload)
        .eq('id', change.id);

      if (updateErr) {
        console.error(`  FAILED ${change.id}: ${updateErr.message}`);
        failed++;
      } else {
        applied++;
      }
    }

    console.log(`\nApplied: ${applied}, Failed: ${failed}`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
