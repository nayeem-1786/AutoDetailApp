#!/usr/bin/env tsx
/**
 * Backfill vehicle classification flags (is_exotic, is_classic, make canonicalization).
 *
 * DRY-RUN by default — logs proposed changes without writing to DB.
 * Pass --apply to execute writes (NOT approved for this session).
 *
 * Uses the REAL classifier from vehicle-categories.ts — no inline duplication.
 * Relative imports used instead of @/ path aliases (consistent with scripts/
 * convention — see import-square-data.mjs).
 *
 * Usage:
 *   npx tsx scripts/backfill-vehicle-classification.ts          # dry-run
 *   npx tsx scripts/backfill-vehicle-classification.ts --apply  # LIVE (requires approval)
 *
 * Prerequisites:
 *   - Migration 20260417000001 must be applied (is_exotic/is_classic columns)
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars set
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  resolveVehicleClassification,
  canonicalizeMake,
} from '../src/lib/utils/vehicle-categories';

// Load .env.local (same pattern as import-square-data.mjs)
config({ path: '.env.local' });

// --- Env + flags ---

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

// --- Types ---

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

// --- Main ---

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

    // Check make canonicalization (uses real canonicalizeMake from vehicle-categories.ts)
    const canonical = canonicalizeMake(v.make);
    if (canonical !== v.make) {
      changes.make = { old: v.make, new: canonical };
      canonicalizedCount++;
    }

    // Run the real classifier (same function production code uses)
    const classification = await resolveVehicleClassification(
      supabase,
      canonical,
      v.model || undefined,
      v.year || undefined
    );

    // Only update exotic/classic flags — not size_class, vehicle_category, etc.
    if (classification.is_exotic !== v.is_exotic) {
      changes.is_exotic = { old: v.is_exotic, new: classification.is_exotic };
      if (classification.is_exotic) exoticCount++;
    }

    if (classification.is_classic !== v.is_classic) {
      changes.is_classic = { old: v.is_classic, new: classification.is_classic };
      if (classification.is_classic) classicCount++;
    }

    if (classification.is_exotic && classification.is_classic) bothCount++;

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
