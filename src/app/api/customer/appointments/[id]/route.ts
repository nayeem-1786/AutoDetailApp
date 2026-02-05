import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APPOINTMENT } from '@/lib/utils/constants';

const EDITABLE_STATUSES = ['pending', 'confirmed'];

export async function GET(
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

    // Fetch appointment with full details
    const { data: appointment, error } = await admin
      .from('appointments')
      .select(`
        id, status, scheduled_date, scheduled_start_time, scheduled_end_time,
        total_amount, is_mobile, mobile_address, notes, vehicle_id,
        appointment_services(
          id, service_id, price_at_booking,
          services(id, name, base_price)
        ),
        vehicles(id, year, make, model, color)
      `)
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (error || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Get customer's vehicles for selection
    const { data: vehicles } = await admin
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });

    // Get available services
    const { data: services } = await admin
      .from('services')
      .select('id, name, base_price, category_id, is_active')
      .eq('is_active', true)
      .order('name');

    return NextResponse.json({
      data: appointment,
      vehicles: vehicles ?? [],
      services: services ?? [],
    });
  } catch (err) {
    console.error('Get appointment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch appointment with ownership check
    const { data: appointment, error: fetchErr } = await admin
      .from('appointments')
      .select('id, status, scheduled_date, scheduled_start_time, customer_id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (fetchErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Status check
    if (!EDITABLE_STATUSES.includes(appointment.status)) {
      return NextResponse.json(
        { error: `Cannot edit an appointment that is ${appointment.status}` },
        { status: 400 }
      );
    }

    // Check modification window (same as cancellation window)
    const appointmentDateTime = new Date(
      `${appointment.scheduled_date}T${appointment.scheduled_start_time}`
    );
    const now = new Date();
    const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntil < APPOINTMENT.CANCELLATION_WINDOW_HOURS) {
      return NextResponse.json(
        {
          error: `Appointments must be modified at least ${APPOINTMENT.CANCELLATION_WINDOW_HOURS} hours in advance.`,
          too_late: true,
        },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { scheduled_date, scheduled_start_time, scheduled_end_time, vehicle_id, service_ids } = body;

    // Validate required fields
    if (!scheduled_date || !scheduled_start_time || !scheduled_end_time) {
      return NextResponse.json({ error: 'Date and time are required' }, { status: 400 });
    }

    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    // Validate vehicle belongs to customer
    if (vehicle_id) {
      const { data: vehicle } = await admin
        .from('vehicles')
        .select('id')
        .eq('id', vehicle_id)
        .eq('customer_id', customer.id)
        .single();

      if (!vehicle) {
        return NextResponse.json({ error: 'Invalid vehicle' }, { status: 400 });
      }
    }

    // Get service prices
    const { data: services } = await admin
      .from('services')
      .select('id, base_price')
      .in('id', service_ids);

    if (!services || services.length !== service_ids.length) {
      return NextResponse.json({ error: 'Invalid services' }, { status: 400 });
    }

    const totalAmount = services.reduce((sum, s) => sum + (s.base_price || 0), 0);

    // Update appointment
    const { error: updateErr } = await admin
      .from('appointments')
      .update({
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        vehicle_id: vehicle_id || null,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Update appointment error:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    // Delete existing appointment_services and insert new ones
    await admin
      .from('appointment_services')
      .delete()
      .eq('appointment_id', id);

    const appointmentServices = services.map((s) => ({
      appointment_id: id,
      service_id: s.id,
      price_at_booking: s.base_price || 0,
    }));

    const { error: servicesErr } = await admin
      .from('appointment_services')
      .insert(appointmentServices);

    if (servicesErr) {
      console.error('Insert appointment_services error:', servicesErr.message);
      // Don't fail the whole request, appointment was updated
    }

    return NextResponse.json({ success: true, total_amount: totalAmount });
  } catch (err) {
    console.error('Update appointment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
