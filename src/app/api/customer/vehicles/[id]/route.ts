import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { customerVehicleSchema } from '@/lib/utils/validation';
import { resolveVehicleClassification, canonicalizeMake } from '@/lib/utils/vehicle-categories';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = customerVehicleSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
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

    // Ownership check
    const { data: existing } = await admin
      .from('vehicles')
      .select('id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // #129 C3 — PATCH classifier parity with POST.
    // Without this, a customer who edits a vehicle (e.g. corrects a model
    // typo from "488" to "488 GTB") would never get the exotic/classic
    // re-classification that POST does. Session 29 anti-gaming: classifier's
    // 'exotic'/'classic' detection wins over client-supplied size_class
    // (customer-portal dropdown only exposes 3 values).
    const canonicalMake = parsed.data.make ? canonicalizeMake(parsed.data.make) : null;
    const trimmedModel = parsed.data.model ?? null;
    let classifierSizeClass: string | null = null;
    if (canonicalMake && trimmedModel) {
      const classification = await resolveVehicleClassification(
        admin, canonicalMake, trimmedModel, parsed.data.year || undefined
      );
      classifierSizeClass = classification.size_class;
    }
    const isClassifierSpecialty = classifierSizeClass === 'exotic' || classifierSizeClass === 'classic';
    const resolvedSizeClass = isClassifierSpecialty
      ? classifierSizeClass
      : (parsed.data.size_class !== undefined ? parsed.data.size_class : undefined);

    // #136 B3/B4 — preserve null-vs-undefined distinction. Supabase treats
    // `undefined` as "don't write this column" and `null` as "write NULL".
    // The prior implementation collapsed null→undefined via `?? undefined`
    // on vehicle_category + specialty_tier, which silently dropped the
    // client's null when the dialog sent `specialty_tier: null` after a
    // category change from specialty→automobile. Net effect: row ended up
    // with `vehicle_category='automobile'` AND `specialty_tier='rv_25_35'`
    // (DB inconsistency invisible until next read).
    //
    // The fix: spread parsed.data as-is (Zod's `.partial()` only includes
    // keys present in the request, so undefined = missing = skip, null =
    // explicit clear = write null). The classifier-derived overrides for
    // `make` (canonicalized) and `size_class` (specialty-detection) layer
    // on top and only fire when they have real values to write.
    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };
    if (canonicalMake !== null) {
      updateData.make = canonicalMake;
    }
    if (resolvedSizeClass !== undefined) {
      updateData.size_class = resolvedSizeClass;
    }

    const { data: vehicle, error } = await admin
      .from('vehicles')
      .update(updateData)
      .eq('id', id)
      .select('id, vehicle_category, vehicle_type, size_class, specialty_tier, year, make, model, color, vin, license_plate, notes, is_incomplete, created_at')
      .single();

    if (error) {
      console.error('Update vehicle error:', error.message);
      return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 });
    }

    return NextResponse.json({ data: vehicle });
  } catch (err) {
    console.error('Vehicle PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Ownership check
    const { data: existing } = await admin
      .from('vehicles')
      .select('id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { error } = await admin.from('vehicles').delete().eq('id', id);

    if (error) {
      console.error('Delete vehicle error:', error.message);
      return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Vehicle DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
