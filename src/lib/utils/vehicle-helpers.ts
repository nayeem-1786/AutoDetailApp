import { type SupabaseClient } from '@supabase/supabase-js';
import { resolveVehicleClassification } from '@/lib/utils/vehicle-categories';

/**
 * Sanitize a single vehicle field value.
 * Returns null if the value is null, undefined, empty, or any case of "unknown".
 */
export function sanitizeVehicleField(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || str.toLowerCase() === 'unknown') return null;
  return str;
}

/**
 * Build a clean vehicle description string, filtering out "Unknown" and empty values.
 *
 * Examples:
 *   { year: "2020", color: "Unknown", make: "Honda", model: "CRV" } → "2020 Honda CRV"
 *   { year: "Unknown", color: "", make: "Winnebago", model: "Travato" } → "Winnebago Travato"
 *   { year: 2025, color: "Black", make: "Chevrolet", model: "Camaro" } → "2025 Black Chevrolet Camaro"
 */
export function cleanVehicleDescription(parts: {
  year?: string | number | null;
  color?: string | null;
  make?: string | null;
  model?: string | null;
}): string {
  return [parts.year, parts.color, parts.make, parts.model]
    .map((v) => sanitizeVehicleField(v))
    .filter(Boolean)
    .join(' ');
}

export interface FindOrCreateVehicleParams {
  customerId: string;
  make: string;
  model?: string | null;
  year?: number | string | null;
  color?: string | null;
  /** Caller-provided overrides (e.g., from booking form UI) */
  vehicle_category?: string | null;
  vehicle_type?: string | null;
  size_class?: string | null;
  specialty_tier?: string | null;
}

export interface FindOrCreateVehicleResult {
  id: string;
  created: boolean;
}

/**
 * Shared vehicle find-or-create with dedup.
 *
 * Dedup key: customer_id + LOWER(make) + LOWER(model) + vehicle_category
 *
 * - Resolves classification BEFORE the dedup query so the correct
 *   vehicle_category is used in the SELECT (motorcycle vs automobile, etc.)
 * - Backfills NULL fields on existing records (size_class, color, year, etc.)
 * - Handles unique constraint violations gracefully (re-query on 23505)
 * - Never throws — returns null on failure so vehicle creation doesn't block callers
 */
export async function findOrCreateVehicle(
  supabase: SupabaseClient,
  params: FindOrCreateVehicleParams
): Promise<FindOrCreateVehicleResult | null> {
  try {
    const make = params.make?.trim();
    const model = params.model?.trim() || null;

    if (!make) {
      console.warn('[findOrCreateVehicle] No make provided — skipping');
      return null;
    }

    const year = params.year
      ? typeof params.year === 'number' ? params.year : parseInt(String(params.year), 10) || null
      : null;

    // Step 1: Resolve classification BEFORE the dedup query
    // Caller overrides take priority (e.g., booking form sends vehicle_category from UI)
    const classification = await resolveVehicleClassification(supabase, make, model || undefined);
    const resolvedCategory = params.vehicle_category || classification.vehicle_category;
    const resolvedVehicleType = params.vehicle_type || classification.vehicle_type;
    const resolvedSizeClass = params.size_class || classification.size_class;
    const resolvedSpecialtyTier = params.specialty_tier || classification.specialty_tier;

    // Step 2: Dedup query — customer_id + LOWER(make) + LOWER(model) + vehicle_category
    let query = supabase
      .from('vehicles')
      .select('id, vehicle_category, vehicle_type, size_class, specialty_tier, year, color')
      .eq('customer_id', params.customerId)
      .ilike('make', make)
      .eq('vehicle_category', resolvedCategory);

    if (model) {
      query = query.ilike('model', model);
    } else {
      query = query.is('model', null);
    }

    const { data: existing } = await query.limit(1).maybeSingle();

    if (existing) {
      // Step 3: Backfill NULL fields on existing record
      const updates: Record<string, unknown> = {};
      if (!existing.size_class && resolvedSizeClass) updates.size_class = resolvedSizeClass;
      if (!existing.specialty_tier && resolvedSpecialtyTier) updates.specialty_tier = resolvedSpecialtyTier;
      if (!existing.vehicle_type) updates.vehicle_type = resolvedVehicleType;
      if (!existing.year && year) updates.year = year;
      if (!existing.color && params.color) updates.color = params.color;

      if (Object.keys(updates).length > 0) {
        await supabase.from('vehicles').update(updates).eq('id', existing.id);
        console.log(`[findOrCreateVehicle] Backfilled vehicle ${existing.id}:`, updates);
      }

      return { id: existing.id, created: false };
    }

    // Step 4: Insert new vehicle with full classification
    const { data: newVehicle, error: insertErr } = await supabase
      .from('vehicles')
      .insert({
        customer_id: params.customerId,
        vehicle_category: resolvedCategory,
        vehicle_type: resolvedVehicleType,
        size_class: resolvedSizeClass,
        specialty_tier: resolvedSpecialtyTier,
        year: year,
        make: make,
        model: model,
        color: params.color || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      // Step 5: Handle unique constraint violation (race condition)
      if (insertErr.code?.includes('23505')) {
        console.log(`[findOrCreateVehicle] Constraint violation — re-querying for ${make} ${model}`);
        const { data: raceWinner } = await query.limit(1).maybeSingle();
        if (raceWinner) {
          return { id: raceWinner.id, created: false };
        }
      }
      console.error('[findOrCreateVehicle] Insert failed:', insertErr.message);
      return null;
    }

    if (!newVehicle) return null;

    console.log(`[findOrCreateVehicle] Created vehicle: ${year || ''} ${params.color || ''} ${make} ${model || ''} (${resolvedCategory}/${resolvedSizeClass || resolvedSpecialtyTier})`);
    return { id: newVehicle.id, created: true };
  } catch (err) {
    console.error('[findOrCreateVehicle] Unexpected error:', err);
    return null;
  }
}
