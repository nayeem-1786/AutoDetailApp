import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { resolveVehicleClassification, canonicalizeMake, detectFieldInversion } from '@/lib/utils/vehicle-categories';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Vehicles fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch vehicles' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: vehicles ?? [] });
  } catch (err) {
    console.error('Vehicles route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;

    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { vehicle_category, vehicle_type, size_class, specialty_tier, year, make, model, color } = body;

    if (!vehicle_type) {
      return NextResponse.json(
        { error: 'vehicle_type is required' },
        { status: 400 }
      );
    }

    // Canonicalize make + detect field inversions
    const canonicalMake = make ? canonicalizeMake(make) : null;
    const trimmedModel = model?.trim() || null;

    const inversion = detectFieldInversion(canonicalMake, trimmedModel);
    if (inversion) {
      console.warn(`[POS Vehicle Create] FIELD INVERSION DETECTED: ${inversion.reason}`);
    }

    // Run classifier to detect exotic/classic size_class (Session 29 — flags retired).
    // Staff-provided size_class is trusted, but classifier's 'exotic'/'classic' always
    // wins (prevents staff from accidentally saving a Ferrari as sedan and skipping the
    // specialty pricing path).
    let classifierSizeClass: string | null = null;
    if (canonicalMake) {
      const parsedYear = year ? parseInt(year, 10) : undefined;
      const classification = await resolveVehicleClassification(
        supabase, canonicalMake, trimmedModel || undefined, parsedYear || undefined
      );
      classifierSizeClass = classification.size_class;

      // Log override mismatch — #131 Layer 2: only when classifier is
      // confident. Its 'automobile' fall-through default is not a real
      // disagreement; logging mismatches against it would flood production
      // with false positives every time an operator entered a niche RV
      // / boat / motorcycle that isn't in `vehicle_makes`.
      if (
        vehicle_category &&
        classification.category_confident &&
        vehicle_category !== classification.vehicle_category
      ) {
        console.warn(
          `[POS Vehicle Create] Override: caller sent vehicle_category="${vehicle_category}" ` +
          `but classifier resolved "${classification.vehicle_category}" for ${canonicalMake} ${trimmedModel || ''}`
        );
      }
    }
    const isClassifierSpecialty = classifierSizeClass === 'exotic' || classifierSizeClass === 'classic';
    const resolvedSizeClass = isClassifierSpecialty
      ? classifierSizeClass
      : (size_class || classifierSizeClass);

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        customer_id: customerId,
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type,
        size_class: resolvedSizeClass,
        specialty_tier: specialty_tier || null,
        year: year ? parseInt(year, 10) : null,
        make: canonicalMake || null,
        model: trimmedModel,
        color: color?.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Vehicle create error:', error);
      return NextResponse.json(
        { error: 'Failed to create vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: vehicle }, { status: 201 });
  } catch (err) {
    console.error('Vehicle create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;

    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { vehicle_id, vehicle_category, vehicle_type, size_class, specialty_tier, year, make, model, color } = body;

    if (!vehicle_id) {
      return NextResponse.json(
        { error: 'vehicle_id is required' },
        { status: 400 }
      );
    }

    // Canonicalize make + run classifier to detect exotic/classic size_class.
    // Session 29: classifier's specialty detection wins over caller-provided size_class.
    const canonicalMake = make ? canonicalizeMake(make) : null;
    const trimmedModel = model?.trim() || null;
    let classifierSizeClass: string | null = null;
    if (canonicalMake) {
      const parsedYear = year ? parseInt(String(year), 10) : undefined;
      const classification = await resolveVehicleClassification(
        supabase, canonicalMake, trimmedModel || undefined, parsedYear || undefined
      );
      classifierSizeClass = classification.size_class;
    }
    const isClassifierSpecialty = classifierSizeClass === 'exotic' || classifierSizeClass === 'classic';
    const resolvedSizeClass = isClassifierSpecialty
      ? classifierSizeClass
      : (size_class || classifierSizeClass);

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update({
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type: vehicle_type || 'standard',
        size_class: resolvedSizeClass,
        specialty_tier: specialty_tier || null,
        year: year ? parseInt(String(year), 10) : null,
        make: canonicalMake || null,
        model: trimmedModel,
        color: color?.trim() || null,
      })
      .eq('id', vehicle_id)
      .eq('customer_id', customerId)
      .select('*')
      .single();

    if (error) {
      console.error('Vehicle update error:', error);
      return NextResponse.json(
        { error: 'Failed to update vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: vehicle });
  } catch (err) {
    console.error('Vehicle update route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
