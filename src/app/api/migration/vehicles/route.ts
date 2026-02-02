import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface VehiclePayload {
  customer_reference_id: string;
  vehicle_type: 'standard';
  size_class: 'sedan' | 'truck_suv_2row' | 'suv_3row_van';
  is_incomplete: boolean;
  notes: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vehicles } = body as { vehicles: VehiclePayload[] };

    if (!vehicles || !Array.isArray(vehicles)) {
      return NextResponse.json(
        { error: 'Invalid request: vehicles array required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Resolve customer reference IDs to DB IDs
    const custRefIds = [...new Set(vehicles.map((v) => v.customer_reference_id))];
    const customerMap = new Map<string, string>();

    for (let i = 0; i < custRefIds.length; i += 100) {
      const batch = custRefIds.slice(i, i + 100);
      const { data: customers } = await adminClient
        .from('customers')
        .select('id, square_reference_id')
        .in('square_reference_id', batch);

      customers?.forEach((c) => {
        if (c.square_reference_id) {
          customerMap.set(c.square_reference_id, c.id);
        }
      });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Insert vehicles individually (need customer_id lookup)
    for (const vehicle of vehicles) {
      const customerId = customerMap.get(vehicle.customer_reference_id);

      if (!customerId) {
        skipped++;
        continue;
      }

      // Check if a vehicle with this size class already exists for the customer
      const { data: existing } = await adminClient
        .from('vehicles')
        .select('id')
        .eq('customer_id', customerId)
        .eq('size_class', vehicle.size_class)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await adminClient.from('vehicles').insert({
        customer_id: customerId,
        vehicle_type: vehicle.vehicle_type,
        size_class: vehicle.size_class,
        is_incomplete: vehicle.is_incomplete,
        notes: vehicle.notes,
      });

      if (error) {
        errors.push(`Vehicle for ${vehicle.customer_reference_id}: ${error.message}`);
      } else {
        created++;
      }
    }

    return NextResponse.json({
      created,
      skipped,
      customersResolved: customerMap.size,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('Vehicle migration route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
