import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { customerVehicleSchema } from '@/lib/utils/validation';
import { resolveVehicleClassification, canonicalizeMake } from '@/lib/utils/vehicle-categories';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // #136 Q3/B11 — surface vin / license_plate / notes alongside the
    // existing fields so the portal can render + edit them. is_incomplete
    // surfaces so the portal can show a "complete this vehicle" affordance
    // on rows the admin marked incomplete.
    const { data: vehicles, error } = await admin
      .from('vehicles')
      .select('id, vehicle_category, vehicle_type, size_class, specialty_tier, year, make, model, color, vin, license_plate, notes, is_incomplete, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch vehicles error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
    }

    return NextResponse.json({ data: vehicles });
  } catch (err) {
    console.error('Vehicles GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = customerVehicleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // #136 Q2/B15 server defense-in-depth — schema fields stay
    // `.optional().nullable()` for form-state compat (RHF defaults need null
    // before user types), but POST requires year + make + model + color to
    // be present. This matches public booking's UI-level requirement and
    // closes the path where a non-form caller (curl, DevTools) could create
    // an empty vehicle row. PATCH stays partial — customers may edit one
    // field at a time without re-supplying the others.
    const missing: string[] = [];
    if (!parsed.data.year) missing.push('year');
    if (!parsed.data.make || !parsed.data.make.trim()) missing.push('make');
    if (!parsed.data.model || !parsed.data.model.trim()) missing.push('model');
    if (!parsed.data.color || !parsed.data.color.trim()) missing.push('color');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Canonicalize make + run classifier to detect exotic/classic size_class.
    // Session 29: classifier's 'exotic'/'classic' detection wins over client-provided
    // size_class to prevent gaming (customer portal dropdown only exposes 3 values).
    const canonicalMake = parsed.data.make ? canonicalizeMake(parsed.data.make) : null;
    const trimmedModel = parsed.data.model ?? null;
    let classifierSizeClass: string | null = null;
    if (canonicalMake) {
      const classification = await resolveVehicleClassification(
        admin, canonicalMake, trimmedModel || undefined, parsed.data.year || undefined
      );
      classifierSizeClass = classification.size_class;
    }
    const isClassifierSpecialty = classifierSizeClass === 'exotic' || classifierSizeClass === 'classic';
    const resolvedSizeClass = isClassifierSpecialty
      ? classifierSizeClass
      : (parsed.data.size_class ?? classifierSizeClass);

    const { data: vehicle, error } = await admin
      .from('vehicles')
      .insert({
        customer_id: customer.id,
        vehicle_category: parsed.data.vehicle_category ?? 'automobile',
        vehicle_type: parsed.data.vehicle_type,
        size_class: resolvedSizeClass,
        specialty_tier: parsed.data.specialty_tier ?? null,
        year: parsed.data.year ?? null,
        make: canonicalMake,
        model: trimmedModel,
        color: parsed.data.color ?? null,
        // #136 Q3/B11 — persist vin / license_plate / notes from the portal
        // dialog. All three are optional (Q3 locks "surface", not "require")
        // and may be empty strings — store null when blank to keep DB rows
        // unambiguous.
        vin: parsed.data.vin?.trim() || null,
        license_plate: parsed.data.license_plate?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        // #136 Q6 — customer-created vehicles always have all required
        // fields present (Q2 + the defense-in-depth check above guarantee
        // it), so they're complete on create. Admin paths may still flag
        // incomplete via their own dialogs.
        is_incomplete: false,
      })
      .select('id, vehicle_category, vehicle_type, size_class, specialty_tier, year, make, model, color, vin, license_plate, notes, is_incomplete, created_at')
      .single();

    if (error) {
      console.error('Create vehicle error:', error.message);
      return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 });
    }

    return NextResponse.json({ data: vehicle }, { status: 201 });
  } catch (err) {
    console.error('Vehicles POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
