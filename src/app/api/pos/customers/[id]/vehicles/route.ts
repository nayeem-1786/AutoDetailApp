import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const posEmployee = authenticatePosRequest(request);
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

    const posEmployee = authenticatePosRequest(request);
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

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        customer_id: customerId,
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type,
        size_class: size_class || null,
        specialty_tier: specialty_tier || null,
        year: year ? parseInt(year, 10) : null,
        make: make?.trim() || null,
        model: model?.trim() || null,
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

    const posEmployee = authenticatePosRequest(request);
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

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update({
        vehicle_category: vehicle_category || 'automobile',
        vehicle_type: vehicle_type || 'standard',
        size_class: size_class || null,
        specialty_tier: specialty_tier || null,
        year: year ? parseInt(String(year), 10) : null,
        make: make?.trim() || null,
        model: model?.trim() || null,
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
