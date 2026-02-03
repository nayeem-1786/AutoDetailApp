import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { customerVehicleSchema } from '@/lib/utils/validation';

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

    const { data: vehicles, error } = await admin
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color, created_at')
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

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: vehicle, error } = await admin
      .from('vehicles')
      .insert({
        customer_id: customer.id,
        vehicle_type: parsed.data.vehicle_type,
        size_class: parsed.data.size_class ?? null,
        year: parsed.data.year ?? null,
        make: parsed.data.make ?? null,
        model: parsed.data.model ?? null,
        color: parsed.data.color ?? null,
      })
      .select('id, vehicle_type, size_class, year, make, model, color, created_at')
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
