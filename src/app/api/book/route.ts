import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingSubmitSchema } from '@/lib/utils/validation';
import { normalizePhone } from '@/lib/utils/format';
import { APPOINTMENT } from '@/lib/utils/constants';
import { fireWebhook } from '@/lib/utils/webhook';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bookingSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid booking data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    // 1. Normalize phone to E.164
    const e164Phone = normalizePhone(data.customer.phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // 2. Server-side price validation against actual service_pricing data
    const { data: serviceRow } = await supabase
      .from('services')
      .select('*, service_pricing(*)')
      .eq('id', data.service_id)
      .eq('is_active', true)
      .eq('online_bookable', true)
      .single();

    if (!serviceRow) {
      return NextResponse.json(
        { error: 'Service not found or not bookable' },
        { status: 400 }
      );
    }

    // Validate the primary service price
    const expectedPrice = computeExpectedPrice(serviceRow, data.tier_name, data.vehicle?.size_class);
    if (expectedPrice !== null && Math.abs(expectedPrice - data.price) > 0.01) {
      return NextResponse.json(
        { error: 'Price mismatch — please refresh and try again' },
        { status: 400 }
      );
    }

    // 3. Double-check slot availability
    const endTimeStr = addMinutesToTime(
      data.time,
      data.duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    const { data: overlapping } = await supabase
      .from('appointments')
      .select('id')
      .eq('scheduled_date', data.date)
      .neq('status', 'cancelled')
      .lt('scheduled_start_time', endTimeStr)
      .gt('scheduled_end_time', data.time)
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available' },
        { status: 409 }
      );
    }

    // 4. Find-or-create customer (match by phone, fallback to email)
    let customerId: string;
    let isNewCustomer = false;

    const { data: existingByPhone } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('phone', e164Phone)
      .limit(1)
      .single();

    if (existingByPhone) {
      customerId = existingByPhone.id;
      // Update any missing fields
      const updates: Record<string, unknown> = {};
      if (!existingByPhone.email && data.customer.email) {
        updates.email = data.customer.email;
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabase.from('customers').update(updates).eq('id', customerId);
      }
    } else {
      // Try matching by email
      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id, phone')
        .eq('email', data.customer.email)
        .is('phone', null)
        .limit(1)
        .single();

      if (existingByEmail) {
        customerId = existingByEmail.id;
        await supabase
          .from('customers')
          .update({ phone: e164Phone, updated_at: new Date().toISOString() })
          .eq('id', customerId);
      } else {
        // Create new customer - all online bookings are enthusiasts by default
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            first_name: data.customer.first_name,
            last_name: data.customer.last_name,
            phone: e164Phone,
            email: data.customer.email,
            customer_type: 'enthusiast',
          })
          .select('id')
          .single();

        if (custErr || !newCustomer) {
          console.error('Customer creation failed:', custErr?.message);
          return NextResponse.json(
            { error: 'Failed to create customer record' },
            { status: 500 }
          );
        }
        customerId = newCustomer.id;
        isNewCustomer = true;
      }
    }

    // 5. Create vehicle linked to customer
    let vehicleId: string | null = null;
    if (data.vehicle) {
      const { data: newVehicle, error: vehErr } = await supabase
        .from('vehicles')
        .insert({
          customer_id: customerId,
          vehicle_type: data.vehicle.vehicle_type || 'standard',
          size_class: data.vehicle.size_class || null,
          year: data.vehicle.year || null,
          make: data.vehicle.make || null,
          model: data.vehicle.model || null,
          color: data.vehicle.color || null,
        })
        .select('id')
        .single();

      if (vehErr) {
        console.error('Vehicle creation failed:', vehErr.message);
      } else {
        vehicleId = newVehicle?.id ?? null;
      }
    }

    // 6. Calculate totals
    const addonTotal = data.addons.reduce((sum, a) => sum + a.price, 0);
    const mobileSurcharge = data.is_mobile ? (data.mobile_surcharge || 0) : 0;
    const subtotal = data.price + addonTotal + mobileSurcharge;
    const scheduledEndTime = addMinutesToTime(
      data.time,
      data.duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    // 6b. Auto-assign detailer
    let assignedEmployeeId: string | null = null;

    // Get all active detailers who can be booked
    const { data: detailers } = await supabase
      .from('employees')
      .select('id')
      .eq('role', 'detailer')
      .eq('status', 'active')
      .eq('bookable_for_appointments', true)
      .order('created_at', { ascending: true });

    if (detailers && detailers.length > 0) {
      if (detailers.length === 1) {
        // Only one detailer - assign them regardless
        assignedEmployeeId = detailers[0].id;
      } else {
        // Multiple detailers - find one who's free at this time
        const detailerIds = detailers.map((d) => d.id);

        // Find detailers with overlapping appointments
        const { data: busyAppointments } = await supabase
          .from('appointments')
          .select('employee_id')
          .eq('scheduled_date', data.date)
          .in('employee_id', detailerIds)
          .neq('status', 'cancelled')
          .lt('scheduled_start_time', scheduledEndTime)
          .gt('scheduled_end_time', data.time);

        const busyIds = new Set(busyAppointments?.map((a) => a.employee_id) || []);

        // Find first available detailer
        const availableDetailer = detailers.find((d) => !busyIds.has(d.id));

        // Assign available detailer, or first one if all busy
        assignedEmployeeId = availableDetailer?.id ?? detailers[0].id;
      }
    }

    // 7. Create appointment
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        customer_id: customerId,
        vehicle_id: vehicleId,
        employee_id: assignedEmployeeId,
        status: 'pending',
        channel: data.channel || 'online',
        scheduled_date: data.date,
        scheduled_start_time: data.time,
        scheduled_end_time: scheduledEndTime,
        is_mobile: data.is_mobile,
        mobile_zone_id: data.is_mobile ? data.mobile_zone_id : null,
        mobile_address: data.is_mobile ? data.mobile_address : null,
        mobile_surcharge: mobileSurcharge,
        subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: subtotal,
        job_notes: data.notes || null,
      })
      .select('id, scheduled_date, scheduled_start_time, scheduled_end_time, total_amount, is_mobile, mobile_address, mobile_surcharge, status, channel, subtotal')
      .single();

    if (apptErr || !appointment) {
      console.error('Appointment creation failed:', apptErr?.message);
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 }
      );
    }

    // 8. Create appointment_services rows (primary + addons)
    const serviceRows = [
      {
        appointment_id: appointment.id,
        service_id: data.service_id,
        price_at_booking: data.price,
        tier_name: data.tier_name || null,
      },
      ...data.addons.map((addon) => ({
        appointment_id: appointment.id,
        service_id: addon.service_id,
        price_at_booking: addon.price,
        tier_name: addon.tier_name || null,
      })),
    ];

    const { error: junctionErr } = await supabase
      .from('appointment_services')
      .insert(serviceRows);

    if (junctionErr) {
      console.error('Appointment services insertion failed:', junctionErr.message);
    }

    // 8b. If payment was made online, update payment status
    if (data.payment_intent_id) {
      await supabase
        .from('appointments')
        .update({
          stripe_payment_intent_id: data.payment_intent_id,
          payment_status: 'paid',
        })
        .eq('id', appointment.id);
    }

    // 9. Fire n8n webhook (non-blocking)
    const webhookPayload = {
      event: 'booking.created',
      timestamp: new Date().toISOString(),
      appointment: {
        id: appointment.id,
        scheduled_date: appointment.scheduled_date,
        scheduled_start_time: appointment.scheduled_start_time,
        scheduled_end_time: appointment.scheduled_end_time,
        status: appointment.status,
        channel: appointment.channel,
        is_mobile: appointment.is_mobile,
        mobile_address: appointment.mobile_address,
        mobile_surcharge: Number(appointment.mobile_surcharge),
        subtotal: Number(appointment.subtotal),
        total_amount: Number(appointment.total_amount),
      },
      customer: {
        id: customerId,
        first_name: data.customer.first_name,
        last_name: data.customer.last_name,
        phone: e164Phone,
        email: data.customer.email,
        is_new: isNewCustomer,
      },
      services: [
        {
          id: data.service_id,
          name: serviceRow.name as string,
          price: data.price,
          tier_name: data.tier_name || null,
          is_primary: true,
        },
        ...data.addons.map((addon) => ({
          id: addon.service_id,
          name: addon.name,
          price: addon.price,
          tier_name: addon.tier_name || null,
          is_primary: false,
        })),
      ],
      vehicle: data.vehicle
        ? {
            type: data.vehicle.vehicle_type || 'standard',
            size_class: data.vehicle.size_class || null,
            year: data.vehicle.year || null,
            make: data.vehicle.make || null,
            model: data.vehicle.model || null,
            color: data.vehicle.color || null,
          }
        : null,
    };

    // Fire-and-forget: don't await, don't block the response
    fireWebhook('booking_created', webhookPayload, supabase).catch((err) =>
      console.error('Webhook fire failed:', err)
    );

    return NextResponse.json(
      {
        success: true,
        appointment: {
          id: appointment.id,
          date: appointment.scheduled_date,
          start_time: appointment.scheduled_start_time,
          end_time: appointment.scheduled_end_time,
          total: appointment.total_amount,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Booking API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function computeExpectedPrice(
  service: {
    pricing_model: string;
    flat_price: number | null;
    per_unit_price: number | null;
    service_pricing: { tier_name: string; price: number; is_vehicle_size_aware: boolean; vehicle_size_sedan_price: number | null; vehicle_size_truck_suv_price: number | null; vehicle_size_suv_van_price: number | null }[];
  },
  tierName: string | null | undefined,
  sizeClass: string | null | undefined
): number | null {
  switch (service.pricing_model) {
    case 'flat':
      return service.flat_price;

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      if (!tierName) return null;
      const tier = service.service_pricing.find((t) => t.tier_name === tierName);
      if (!tier) return null;
      if (tier.is_vehicle_size_aware && sizeClass) {
        if (sizeClass === 'sedan') return tier.vehicle_size_sedan_price;
        if (sizeClass === 'truck_suv_2row') return tier.vehicle_size_truck_suv_price;
        if (sizeClass === 'suv_3row_van') return tier.vehicle_size_suv_van_price;
      }
      return tier.price;
    }

    case 'per_unit':
      return null;

    default:
      return null;
  }
}
