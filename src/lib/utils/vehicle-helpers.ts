import { type SupabaseClient } from '@supabase/supabase-js';
import {
  resolveVehicleClassification,
  canonicalizeMake,
  detectFieldInversion,
} from '@/lib/utils/vehicle-categories';

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
  /** Optional source identifier for override-mismatch logging */
  source?: string;
}

export interface FindOrCreateVehicleResult {
  id: string;
  created: boolean;
  /** Resolved vehicle category (automobile, motorcycle, rv, boat, aircraft) */
  vehicle_category: string;
  /**
   * Canonical pricing-tier value for automobiles. `null` for non-automobile
   * categories (motorcycle/RV/boat/aircraft). Callers performing money math
   * (e.g., resolvePrice) must read this rather than defaulting to 'sedan' —
   * see Bug A 2026-05-20 (Q-0076 mispriced because send-quote-sms hardcoded
   * 'sedan' instead of reading the classified value).
   */
  size_class: string | null;
  /**
   * Specialty pricing-tier value for non-automobile categories
   * (e.g., 'rv_25_35', 'boat_21_26'). `null` for automobiles. Pass into
   * resolvePrice's `options.specialtyTier` when pricing services with
   * `pricing_model === 'specialty'`.
   */
  specialty_tier: string | null;
}

/**
 * Shared vehicle find-or-create with dedup.
 *
 * Dedup key: customer_id + LOWER(make) + LOWER(model) + vehicle_category
 *
 * Session 29:
 * - Size taxonomy consolidated to size_class (includes 'exotic' and 'classic')
 * - Respects size_class_manual_override on existing rows (admin dropdown-wins)
 * - No more parallel flag writes (size_class carries specialty classification)
 */
export async function findOrCreateVehicle(
  supabase: SupabaseClient,
  params: FindOrCreateVehicleParams
): Promise<FindOrCreateVehicleResult | null> {
  try {
    // Canonicalize make before anything else
    const rawMake = params.make?.trim();
    if (!rawMake) {
      console.warn('[findOrCreateVehicle] No make provided — skipping');
      return null;
    }
    const make = canonicalizeMake(rawMake);
    if (make !== rawMake) {
      console.log(`[findOrCreateVehicle] Canonicalized make: "${rawMake}" → "${make}"`);
    }

    const model = params.model?.trim() || null;

    // Field inversion detection
    const inversion = detectFieldInversion(make, model);
    if (inversion) {
      console.warn(`[findOrCreateVehicle] FIELD INVERSION DETECTED: ${inversion.reason}`);
    }

    const year = params.year
      ? typeof params.year === 'number' ? params.year : parseInt(String(params.year), 10) || null
      : null;

    // Step 1: Resolve classification BEFORE the dedup query
    const classification = await resolveVehicleClassification(supabase, make, model || undefined, year || undefined);

    // Phase 5: Override path — log when caller-provided category contradicts classifier.
    // #131 Layer 2: skip the warn when the classifier is not confident — its
    // 'automobile' default is the silent fall-through, not a real disagreement.
    // Logging a "mismatch" against an unconfident default produces false-positive
    // noise in production (every Winnebago / niche RV maker / data-drift case
    // would warn). The caller's value is the right one to use, no surprise.
    const resolvedCategory = params.vehicle_category || classification.vehicle_category;
    if (
      params.vehicle_category &&
      classification.category_confident &&
      params.vehicle_category !== classification.vehicle_category
    ) {
      console.warn(
        `[findOrCreateVehicle] Override mismatch: caller sent vehicle_category="${params.vehicle_category}" ` +
        `but classifier resolved "${classification.vehicle_category}" for ${make} ${model || ''}` +
        (params.source ? ` (source: ${params.source})` : '')
      );
    }

    const resolvedVehicleType = params.vehicle_type || classification.vehicle_type;
    const resolvedSizeClass = params.size_class || classification.size_class;
    const resolvedSpecialtyTier = params.specialty_tier || classification.specialty_tier;

    // Step 2: Dedup query — customer_id + LOWER(make) + LOWER(model) + vehicle_category
    let query = supabase
      .from('vehicles')
      .select('id, vehicle_category, vehicle_type, size_class, specialty_tier, year, color, size_class_manual_override')
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
      // Step 3: Backfill NULL fields on existing record.
      // Respect size_class_manual_override: if staff manually set the size_class via the
      // admin dropdown, do not overwrite it from the classifier (Session 29 M5).
      const updates: Record<string, unknown> = {};
      if (!existing.size_class && resolvedSizeClass && !existing.size_class_manual_override) {
        updates.size_class = resolvedSizeClass;
      }
      if (!existing.specialty_tier && resolvedSpecialtyTier) updates.specialty_tier = resolvedSpecialtyTier;
      if (!existing.vehicle_type) updates.vehicle_type = resolvedVehicleType;
      if (!existing.year && year) updates.year = year;
      if (!existing.color && params.color) updates.color = params.color;

      if (Object.keys(updates).length > 0) {
        await supabase.from('vehicles').update(updates).eq('id', existing.id);
        console.log(`[findOrCreateVehicle] Backfilled vehicle ${existing.id}:`, updates);
      }

      // size_class: prefer existing row (respects size_class_manual_override),
      // fall back to just-backfilled classifier value.
      const finalSizeClass = existing.size_class || resolvedSizeClass || null;
      const finalSpecialtyTier = existing.specialty_tier || resolvedSpecialtyTier || null;

      return {
        id: existing.id,
        created: false,
        vehicle_category: resolvedCategory,
        size_class: finalSizeClass,
        specialty_tier: finalSpecialtyTier,
      };
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
          return {
            id: raceWinner.id,
            created: false,
            vehicle_category: resolvedCategory,
            size_class: raceWinner.size_class || resolvedSizeClass || null,
            specialty_tier: raceWinner.specialty_tier || resolvedSpecialtyTier || null,
          };
        }
      }
      console.error('[findOrCreateVehicle] Insert failed:', insertErr.message);
      return null;
    }

    if (!newVehicle) return null;

    console.log(
      `[findOrCreateVehicle] Created vehicle: ${year || ''} ${params.color || ''} ${make} ${model || ''} ` +
      `(${resolvedCategory}/${resolvedSizeClass || resolvedSpecialtyTier})`
    );
    return {
      id: newVehicle.id,
      created: true,
      vehicle_category: resolvedCategory,
      size_class: resolvedSizeClass ?? null,
      specialty_tier: resolvedSpecialtyTier ?? null,
    };
  } catch (err) {
    console.error('[findOrCreateVehicle] Unexpected error:', err);
    return null;
  }
}
