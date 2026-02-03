import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Missing required parameter: phone' },
        { status: 400 }
      );
    }

    const e164Phone = normalizePhone(phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find customer by phone
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select(
        'id, first_name, last_name, phone, email, loyalty_points_balance'
      )
      .eq('phone', e164Phone)
      .limit(1)
      .single();

    if (custErr || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Get vehicles
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    // Get upcoming appointments count
    const today = new Date().toISOString().split('T')[0];

    const { count: upcomingAppointments } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled');

    return NextResponse.json({
      customer: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        email: customer.email,
        loyalty_points_balance: customer.loyalty_points_balance,
        vehicles: (vehicles ?? []).map((v) => ({
          id: v.id,
          vehicle_type: v.vehicle_type,
          size_class: v.size_class,
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color,
        })),
        upcoming_appointments: upcomingAppointments ?? 0,
      },
    });
  } catch (err) {
    console.error('Voice agent customers error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
