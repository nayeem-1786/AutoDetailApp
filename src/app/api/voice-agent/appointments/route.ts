import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone, formatTime } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { fireWebhook } from '@/lib/utils/webhook';
import { APPOINTMENT } from '@/lib/utils/constants';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';

// ---------------------------------------------------------------------------
// GET — Look up upcoming appointments by customer phone
// ---------------------------------------------------------------------------
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
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (!customer) {
      return NextResponse.json({ appointments: [] });
    }

    // Get upcoming appointments (today or later, not cancelled)
    const today = new Date().toISOString().split('T')[0];

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        status,
        channel,
        is_mobile,
        mobile_address,
        total_amount,
        job_notes,
        appointment_services (
          service_id,
          price_at_booking,
          tier_name,
          services ( name )
        )
      `)
      .eq('customer_id', customer.id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_start_time', { ascending: true });

    if (error) {
      console.error('Voice agent appointments query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch appointments' },
        { status: 500 }
      );
    }

    const formatted = (appointments ?? []).map((appt) => ({
      id: appt.id,
      date: appt.scheduled_date,
      start_time: appt.scheduled_start_time,
      end_time: appt.scheduled_end_time,
      status: appt.status,
      channel: appt.channel,
      is_mobile: appt.is_mobile,
      mobile_address: appt.mobile_address,
      total_amount: Number(appt.total_amount),
      notes: appt.job_notes,
      services: (
        (appt.appointment_services as unknown as {
          service_id: string;
          price_at_booking: number;
          tier_name: string | null;
          services: { name: string } | null;
        }[]) ?? []
      ).map((as) => ({
        service_id: as.service_id,
        name: as.services?.name ?? 'Unknown',
        price: Number(as.price_at_booking),
        tier_name: as.tier_name,
      })),
    }));

    return NextResponse.json({ appointments: formatted });
  } catch (err) {
    console.error('Voice agent GET appointments error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Create a new appointment
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const {
      customer_name,
      customer_phone,
      service_id,
      date,
      time,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      notes,
    } = body as {
      customer_name: string;
      customer_phone: string;
      service_id: string;
      date: string;
      time: string;
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      notes?: string;
    };

    // Validate required fields
    if (!customer_name || !customer_phone || !service_id || !date || !time) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: customer_name, customer_phone, service_id, date, time',
        },
        { status: 400 }
      );
    }

    // Normalize phone
    const e164Phone = normalizePhone(customer_phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get service to determine duration
    const { data: service } = await supabase
      .from('services')
      .select('id, name, base_duration_minutes')
      .eq('id', service_id)
      .eq('is_active', true)
      .single();

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found or inactive' },
        { status: 400 }
      );
    }

    // Calculate end time
    const endTime = addMinutesToTime(
      time,
      service.base_duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    // Check for overlapping appointments
    const { data: overlapping } = await supabase
      .from('appointments')
      .select('id')
      .eq('scheduled_date', date)
      .neq('status', 'cancelled')
      .lt('scheduled_start_time', endTime)
      .gt('scheduled_end_time', time)
      .limit(1);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available' },
        { status: 409 }
      );
    }

    // Find-or-create customer by phone
    const { firstName, lastName } = splitName(customer_name);

    let customerId: string;
    let isNewCustomer = false;

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, sms_consent')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();

    let hasSmsConsent = false;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      hasSmsConsent = existingCustomer.sms_consent ?? false;
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
          sms_consent: true, // Implied consent — customer initiated phone call
        })
        .select('id')
        .single();
      hasSmsConsent = true;

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

    // Create vehicle if vehicle info provided
    let vehicleId: string | null = null;
    if (vehicle_make || vehicle_model || vehicle_year || vehicle_color) {
      const { data: newVehicle, error: vehErr } = await supabase
        .from('vehicles')
        .insert({
          customer_id: customerId,
          vehicle_type: 'standard',
          year: vehicle_year || null,
          make: vehicle_make || null,
          model: vehicle_model || null,
          color: vehicle_color || null,
        })
        .select('id')
        .single();

      if (vehErr) {
        console.error('Vehicle creation failed:', vehErr.message);
      } else {
        vehicleId = newVehicle?.id ?? null;
      }
    }

    // Create appointment
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        customer_id: customerId,
        vehicle_id: vehicleId,
        status: 'pending',
        channel: 'phone',
        scheduled_date: date,
        scheduled_start_time: time,
        scheduled_end_time: endTime,
        is_mobile: false,
        subtotal: 0,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: 0,
        job_notes: notes || null,
      })
      .select(
        'id, scheduled_date, scheduled_start_time, scheduled_end_time, status, channel'
      )
      .single();

    if (apptErr || !appointment) {
      console.error('Appointment creation failed:', apptErr?.message);
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 }
      );
    }

    // Create appointment_services row
    const { error: junctionErr } = await supabase
      .from('appointment_services')
      .insert({
        appointment_id: appointment.id,
        service_id: service.id,
        price_at_booking: 0,
        tier_name: null,
      });

    if (junctionErr) {
      console.error(
        'Appointment services insertion failed:',
        junctionErr.message
      );
    }

    // Format date and time for SMS and system message (PST, 12-hour)
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
    });
    const formattedTime = formatTime(time);

    // Send SMS confirmation and log it
    if (hasSmsConsent) {
      const smsBody = `Your appointment at Smart Details Auto Spa is confirmed! ${service.name} on ${formattedDate} at ${formattedTime}. We look forward to seeing you! Reply STOP to opt out.`;
      sendSms(e164Phone, smsBody)
        .then(() => logSmsMessage(supabase, e164Phone, smsBody))
        .catch((err) => console.error('Appointment SMS confirmation failed:', err));
    }

    // Log system message to conversation thread (non-blocking)
    logVoiceAction(supabase, e164Phone, `Appointment booked via phone: ${service.name} on ${formattedDate} at ${formattedTime}`).catch(() => {});

    // Fire webhook (non-blocking)
    fireWebhook(
      'booking_created',
      {
        event: 'booking.created',
        timestamp: new Date().toISOString(),
        source: 'voice_agent',
        appointment: {
          id: appointment.id,
          scheduled_date: appointment.scheduled_date,
          scheduled_start_time: appointment.scheduled_start_time,
          scheduled_end_time: appointment.scheduled_end_time,
          status: appointment.status,
          channel: appointment.channel,
        },
        customer: {
          id: customerId,
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
          is_new: isNewCustomer,
        },
        service: {
          id: service.id,
          name: service.name,
          duration_minutes: service.base_duration_minutes,
        },
      },
      supabase
    ).catch((err) => console.error('Webhook fire failed:', err));

    return NextResponse.json(
      {
        success: true,
        appointment: {
          id: appointment.id,
          date: appointment.scheduled_date,
          start_time: appointment.scheduled_start_time,
          end_time: appointment.scheduled_end_time,
          status: appointment.status,
          channel: appointment.channel,
          customer_id: customerId,
          service: {
            id: service.id,
            name: service.name,
          },
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Voice agent POST appointments error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const lastSpaceIdx = trimmed.lastIndexOf(' ');

  if (lastSpaceIdx === -1) {
    return { firstName: trimmed, lastName: '' };
  }

  return {
    firstName: trimmed.slice(0, lastSpaceIdx),
    lastName: trimmed.slice(lastSpaceIdx + 1),
  };
}

async function logVoiceAction(
  supabase: ReturnType<typeof createAdminClient>,
  phone: string,
  body: string
) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('phone_number', phone)
    .maybeSingle();

  if (!conv) return;

  await supabase.from('messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    body,
    sender_type: 'system',
    status: 'delivered',
    channel: 'voice',
  });

  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: body.substring(0, 200),
      last_channel: 'voice',
    })
    .eq('id', conv.id);
}

async function logSmsMessage(
  supabase: ReturnType<typeof createAdminClient>,
  phone: string,
  body: string
) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('phone_number', phone)
    .maybeSingle();

  if (!conv) return;

  await supabase.from('messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    body,
    sender_type: 'system',
    status: 'delivered',
    channel: 'sms',
  });
}
