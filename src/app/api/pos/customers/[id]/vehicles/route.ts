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

    // Run classifier to get exotic/classic flags even for direct inserts
    let isExotic = false;
    let isClassic = false;
    if (canonicalMake) {
      const parsedYear = year ? parseInt(year, 10) : undefined;
      const classification = await resolveVehicleClassification(
        supabase, canonicalMake, trimmedModel || undefined, parsedYear || undefined
      );
      isExotic = classification.is_exotic;
      isClassic = classification.is_classic;

      // Log override mismatch
      if (vehicle_category && vehicle_category !== classification.vehicle_category) {
        console.warn(
          `[POS Vehicle Create] Override: caller sent vehicle_category="${vehicle_category}" ` +
          `but classifier resolved "${classification.vehicle_category}" for ${canonicalMake} ${trimmedModel || ''}`
        );
      }
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        customer_id: customerId,
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type,
        size_class: size_class || null,
        specialty_tier: specialty_tier || null,
        is_exotic: isExotic,
        is_classic: isClassic,
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

    // Canonicalize make + run classifier for exotic/classic flags on update
    const canonicalMake = make ? canonicalizeMake(make) : null;
    const trimmedModel = model?.trim() || null;
    let isExotic = false;
    let isClassic = false;
    if (canonicalMake) {
      const parsedYear = year ? parseInt(String(year), 10) : undefined;
      const classification = await resolveVehicleClassification(
        supabase, canonicalMake, trimmedModel || undefined, parsedYear || undefined
      );
      isExotic = classification.is_exotic;
      isClassic = classification.is_classic;
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update({
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type: vehicle_type || 'standard',
        size_class: size_class || null,
        specialty_tier: specialty_tier || null,
        is_exotic: isExotic,
        is_classic: isClassic,
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
