import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { resolveVehicleClassification } from '@/lib/utils/vehicle-categories';

/**
 * GET /api/voice-agent/vehicle-classify?make=Honda&model=Ridgeline&year=2024&color=Red
 *
 * Classifies a vehicle by make/model/year and returns the pricing tier,
 * exotic/classic flags, and whether a custom quote is needed.
 *
 * Used by the voice agent after collecting vehicle info and before quoting pricing.
 */
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/vehicle-classify');

  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const make = searchParams.get('make')?.trim() || '';
  const model = searchParams.get('model')?.trim() || null;
  const yearParam = searchParams.get('year')?.trim() || null;
  const color = searchParams.get('color')?.trim() || null;

  if (!make) {
    return NextResponse.json({ error: 'make is required' }, { status: 400 });
  }

  const year = yearParam ? parseInt(yearParam, 10) || null : null;

  const supabase = createAdminClient();

  let t = perf.now();
  const classification = await resolveVehicleClassification(
    supabase,
    make,
    model || undefined,
    year || undefined
  );
  perf.mark('classify', t);

  // Map classification to human-friendly tier name for the voice agent.
  // Session 29: tier_name is derived from size_class (the canonical taxonomy).
  // needs_year_confirmation remains an orthogonal UX signal for ambiguous-year
  // classic candidates.
  let tierName: string;

  if (classification.size_class === 'exotic') {
    tierName = 'Exotic (Custom Quote)';
  } else if (classification.needs_year_confirmation) {
    tierName = 'Possible Classic — confirm year with customer';
  } else if (classification.size_class === 'classic') {
    tierName = 'Classic (Custom Quote)';
  } else if (classification.vehicle_category === 'rv') {
    tierName = 'RV (Custom Quote)';
  } else if (classification.vehicle_category === 'boat') {
    tierName = 'Boat (Custom Quote)';
  } else if (classification.vehicle_category === 'aircraft') {
    tierName = 'Aircraft (Custom Quote)';
  } else if (classification.vehicle_category === 'motorcycle') {
    tierName = 'Motorcycle';
  } else if (classification.size_class === 'truck_suv_2row') {
    tierName = 'Truck/SUV';
  } else if (classification.size_class === 'suv_3row_van') {
    tierName = 'Oversized';
  } else if (classification.size_class === 'sedan') {
    tierName = 'Sedan';
  } else {
    tierName = 'Unknown — ask customer to confirm vehicle type';
  }

  const responseData = {
    make,
    model,
    year,
    color,
    vehicle_category: classification.vehicle_category,
    size_class: classification.size_class,
    specialty_tier: classification.specialty_tier,
    tier_name: tierName,
    seat_rows: classification.seat_rows,
    needs_year_confirmation: classification.needs_year_confirmation,
  };

  perf.done(responseData);
  return NextResponse.json(responseData);
}
