import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone, formatTime, normalizeTimeTo24h, formatCurrency } from '@/lib/utils/format';
import { sendSms, buildAppointmentConfirmationSms } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';
import { APPOINTMENT } from '@/lib/utils/constants';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { categoryToCompatibilityKey } from '@/lib/utils/vehicle-categories';
import { generateAppointmentNumber } from '@/lib/utils/appointment-number';

// ---------------------------------------------------------------------------
// GET — Look up upcoming appointments by customer phone
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/appointments');
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
    let t = perf.now();
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();
    perf.mark('query:customers', t);

    if (!customer) {
      const responseData = { appointments: [] };
      perf.done(responseData);
      return NextResponse.json(responseData);
    }

    // Get upcoming appointments (today or later, not cancelled)
    const today = new Date().toISOString().split('T')[0];

    t = perf.now();
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
    perf.mark('query:appointments', t);

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

    const responseData = { appointments: formatted };
    perf.done(responseData);
    return NextResponse.json(responseData);
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
  const perf = createPerfTimer('POST /voice-agent/appointments');
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
      quote_id,
      date,
      time,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      notes,
      payment_intent_id,
    } = body as {
      customer_name: string;
      customer_phone: string;
      service_id?: string;
      quote_id?: string;
      date: string;
      time: string;
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      notes?: string;
      payment_intent_id?: string;
    };

    // Phase 3 Theme B.2 (AC-11 completion): payment-evidence-based initial
    // status, mirroring the online-booking path at `src/app/api/book/route.ts`
    // line 559 (`initialStatus = data.payment_intent_id ? 'confirmed' : 'pending'`).
    //
    // Pre-Theme-B.2 this was hardcoded 'pending' on both branches (direct at
    // :516 + quote-conversion at :290). The audit's Option α (Phase 3.0.2,
    // 10421f23, D.3) had two readings:
    //   (1) Continue hardcoding 'pending'; webhook flips on payment receipt.
    //   (2) Forward-compatible refactor: gate on explicit payment evidence
    //       in the request payload.
    // Theme B.2 picks (2) for parity with the online-booking path — the SAME
    // axis (presence of a Stripe payment_intent_id at create-time) drives
    // the SAME initial status decision regardless of channel. Today the
    // voice agent doesn't collect synchronous payment in-call (the send_payment_link
    // tool dispatches a link the customer pays asynchronously), so this
    // branch is forward-compatible for that future capability without
    // changing current behavior — payment_intent_id is undefined on every
    // current agent call, so initialStatus stays 'pending', and the webhook
    // (Theme B.1) handles the async pending → confirmed flip after the
    // customer pays. When the agent's tool surface ever evolves to collect
    // synchronous payment (e.g., reads Stripe Terminal in-call), passing
    // payment_intent_id in the request lands the appointment at 'confirmed'
    // synchronously — matching the online-booking path's behavior.
    const initialStatus: 'pending' | 'confirmed' =
      typeof payment_intent_id === 'string' && payment_intent_id.length > 0
        ? 'confirmed'
        : 'pending';

    // Validate required fields — service_id required unless quote_id provided
    if (!customer_name || !customer_phone || !date || !time) {
      return NextResponse.json(
        { error: 'Missing required fields: customer_name, customer_phone, date, time' },
        { status: 400 }
      );
    }
    if (!service_id && !quote_id) {
      return NextResponse.json(
        { error: 'Either service_id or quote_id must be provided' },
        { status: 400 }
      );
    }

    // Normalize time — ElevenLabs may send "09:00 AM" (12-hour) or "09:00" (24-hour)
    const normalizedTime = normalizeTimeTo24h(time);

    // Normalize phone
    const e164Phone = normalizePhone(customer_phone);
    if (!e164Phone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // -----------------------------------------------------------------------
    // QUOTE CONVERSION PATH — use shared convertQuote() service
    // When quote_id is provided, services/pricing come from the quote items.
    // This ensures the correct service appears in SMS (not LLM-hallucinated).
    // -----------------------------------------------------------------------
    if (quote_id) {
      // Session 2D.1: resolve incoming quote_id to a UUID. The voice agent
      // presents quotes to the customer by quote_number ("Q-0023") because
      // the agent's text context is built from voice-agent/initiation/route.ts:183
      // which formats each quote as `${q.quote_number}: …`. When the customer
      // says "I'd like to book Q-23", the agent passes the quote_number it
      // saw — not a UUID it never had access to. Both downstream calls below
      // (quote_items SELECT, convertQuote) require the UUID, so resolve once
      // here. Lookups by quote_number are unique-indexed (quotes_quote_number_key).
      let resolvedQuoteId = quote_id;
      if (/^Q-\d+$/i.test(quote_id)) {
        const tResolve = perf.now();
        const { data: quoteByNumber } = await supabase
          .from('quotes')
          .select('id')
          .eq('quote_number', quote_id.toUpperCase())
          .is('deleted_at', null)
          .maybeSingle();
        perf.mark('query:quotes_resolve_by_number', tResolve);
        if (!quoteByNumber) {
          return NextResponse.json(
            { error: `Quote ${quote_id} not found` },
            { status: 404 }
          );
        }
        resolvedQuoteId = quoteByNumber.id;
      }

      // Look up customer for SMS consent (convertQuote uses the quote's customer_id).
      // Session 2B: SELECT expanded with last_name/email/phone — last_name and
      // email aren't consumed by the appointment_confirmed contract today, but
      // they're loaded into scope so Session 3D can chip-wire any future caller
      // refactor without a second SELECT round-trip.
      let t = perf.now();
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone, sms_consent')
        .eq('phone', e164Phone)
        .is('deleted_at', null)
        .limit(1)
        .single();
      perf.mark('query:customers_find', t);

      const hasSmsConsent = existingCustomer?.sms_consent ?? false;
      const customerId = existingCustomer?.id;

      // Compute total duration from quote's service items
      t = perf.now();
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('service_id')
        .eq('quote_id', resolvedQuoteId)
        .not('service_id', 'is', null);
      perf.mark('query:quote_items', t);

      let totalDuration = 0;
      if (quoteItems && quoteItems.length > 0) {
        const serviceIds = quoteItems.map((qi) => qi.service_id).filter(Boolean) as string[];
        t = perf.now();
        const { data: svcDurations } = await supabase
          .from('services')
          .select('base_duration_minutes')
          .in('id', serviceIds);
        perf.mark('query:service_durations', t);
        totalDuration = (svcDurations ?? []).reduce(
          (sum, s) => sum + (s.base_duration_minutes || 0), 0
        );
      }
      if (totalDuration === 0) totalDuration = 60; // Fallback: 1 hour

      // Use shared conversion service — creates appointment, appointment_services,
      // updates quote status to 'converted', links converted_appointment_id.
      // Theme B.2 (AC-11 completion): appointmentStatus is now payment-evidence-
      // based via the `initialStatus` derived above — matches the online-booking
      // path's behavior on the SAME axis (presence of payment_intent_id at
      // create-time). When the agent doesn't carry payment evidence (today's
      // every call), this remains 'pending' and the webhook flips on async
      // payment receipt; when the agent ever passes a synchronous
      // payment_intent_id, this lands 'confirmed' immediately.
      const { convertQuote } = await import('@/lib/quotes/convert-service');
      t = perf.now();
      const result = await convertQuote(
        supabase,
        resolvedQuoteId,
        { date, time: normalizedTime, duration_minutes: totalDuration },
        { appointmentStatus: initialStatus, channel: 'phone' }
      );
      perf.mark('convertQuote', t);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      const appointment = result.appointment as {
        id: string;
        scheduled_date: string;
        scheduled_start_time: string;
        scheduled_end_time: string;
        status: string;
        channel: string;
        customer_id: string;
        total_amount: number;
      };
      const serviceNames = result.serviceNames;

      // Format date and time for SMS (PST, 12-hour)
      const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
      });
      const formattedTime = formatTime(normalizedTime);

      // Send SMS confirmation using service names from quote items
      t = perf.now();
      const biz = await getBusinessInfo();
      perf.mark('fetch:getBusinessInfo', t);

      if (hasSmsConsent && e164Phone) {
        // Session 2D: pass last_name cheap-add (loaded into scope by 2B's
        // existingCustomer SELECT expansion). Vehicle data is intentionally
        // not loaded in this voice-agent path (per Session 2B Q2 — contract
        // had no vehicle_description chip at that time; now it does as an
        // optional cheap-add but loading vehicle is out of scope for 2D —
        // vehicleDescription stays undefined here, REMOVE_LINE'd if/when
        // operators reference it in body).
        const smsBody = await buildAppointmentConfirmationSms({
          businessName: biz.name,
          businessPhone: biz.phone,
          date: formattedDate,
          time: formattedTime,
          serviceName: serviceNames,
          customerFirstName: existingCustomer?.first_name || undefined,
          customerLastName: existingCustomer?.last_name || undefined,
          vehicleDescription: undefined,
          total: Number(appointment.total_amount) > 0
            ? formatCurrency(Number(appointment.total_amount))
            : undefined,
        });
        if (smsBody) {
          sendSms(e164Phone, smsBody, {
            logToConversation: true,
            customerId: customerId || undefined,
            notificationType: 'appointment_confirmed',
            contextId: appointment.id,
          }).catch((err) => console.error('Appointment SMS confirmation failed:', err));
        }
      }

      // Log system message to conversation thread (non-blocking)
      logVoiceAction(supabase, e164Phone, `Appointment booked via phone (from quote): ${serviceNames} on ${formattedDate} at ${formattedTime}`).catch(() => {});

      const responseData = {
        success: true,
        converted_from_quote: quote_id,
        appointment: {
          id: appointment.id,
          date: appointment.scheduled_date,
          start_time: appointment.scheduled_start_time,
          end_time: appointment.scheduled_end_time,
          status: appointment.status,
          channel: appointment.channel,
          customer_id: appointment.customer_id,
          services: serviceNames,
        },
      };
      perf.done(responseData);
      return NextResponse.json(responseData, { status: 201 });
    }

    // -----------------------------------------------------------------------
    // DIRECT BOOKING PATH — service_id provided, no quote involved
    // -----------------------------------------------------------------------

    // Get service to determine duration
    let t = perf.now();
    const { data: service } = await supabase
      .from('services')
      .select('id, name, base_duration_minutes, vehicle_compatibility')
      .eq('id', service_id!)
      .eq('is_active', true)
      .single();
    perf.mark('query:services', t);

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found or inactive' },
        { status: 400 }
      );
    }

    // Calculate end time
    const endTime = addMinutesToTime(
      normalizedTime,
      service.base_duration_minutes + APPOINTMENT.BUFFER_MINUTES
    );

    // Check for overlapping appointments
    t = perf.now();
    const { data: overlapping } = await supabase
      .from('appointments')
      .select('id')
      .eq('scheduled_date', date)
      .neq('status', 'cancelled')
      .lt('scheduled_start_time', endTime)
      .gt('scheduled_end_time', normalizedTime)
      .limit(1);
    perf.mark('query:appointments_overlap', t);

    if (overlapping && overlapping.length > 0) {
      return NextResponse.json(
        { error: 'This time slot is no longer available' },
        { status: 409 }
      );
    }

    // Find-or-create customer by phone
    const { firstName, lastName } = splitName(customer_name);

    let customerId: string;

    // Session 2B: SELECT expanded with first_name/last_name/email/phone — only
    // first_name is consumed by the appointment_confirmed contract today, but
    // the rest are loaded into scope so Session 3D can chip-wire downstream
    // refactors without an additional SELECT round-trip. New-customer SELECT
    // below mirrors the same shape so both branches converge on a uniform
    // customer record.
    t = perf.now();
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, sms_consent')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();
    perf.mark('query:customers_find', t);

    let hasSmsConsent = false;
    let customerFirstName: string | undefined = existingCustomer?.first_name || undefined;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      hasSmsConsent = existingCustomer.sms_consent ?? false;
    } else {
      t = perf.now();
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
          sms_consent: true, // Implied consent — customer initiated phone call
        })
        .select('id, first_name, last_name, email, phone')
        .single();
      perf.mark('query:customers_create', t);
      hasSmsConsent = true;

      if (custErr || !newCustomer) {
        console.error('Customer creation failed:', custErr?.message);
        return NextResponse.json(
          { error: 'Failed to create customer record' },
          { status: 500 }
        );
      }

      customerId = newCustomer.id;
      customerFirstName = newCustomer.first_name || firstName || undefined;
    }

    // Find or create vehicle — shared dedup by make + model + category
    let vehicleId: string | null = null;
    let mismatchWarning: string | null = null;
    if (vehicle_make) {
      const { findOrCreateVehicle } = await import('@/lib/utils/vehicle-helpers');
      t = perf.now();
      const vehicleResult = await findOrCreateVehicle(supabase, {
        customerId,
        make: sanitizeVehicleField(vehicle_make) || vehicle_make,
        model: sanitizeVehicleField(vehicle_model),
        year: sanitizeVehicleField(vehicle_year),
        color: sanitizeVehicleField(vehicle_color),
      });
      perf.mark('query:vehicles_findOrCreate', t);
      if (vehicleResult) {
        vehicleId = vehicleResult.id;

        // Soft compatibility check — warn staff but don't block voice agent
        const compatKey = categoryToCompatibilityKey(vehicleResult.vehicle_category as 'automobile' | 'motorcycle' | 'rv' | 'boat' | 'aircraft');
        const compatibility = Array.isArray(service.vehicle_compatibility) ? service.vehicle_compatibility as string[] : [];
        if (compatibility.length > 0 && !compatibility.includes(compatKey)) {
          const vehicleDesc = [vehicle_make, vehicle_model].filter(Boolean).join(' ');
          console.warn(`[VoiceAgent] Vehicle/service mismatch: ${vehicleDesc} (${vehicleResult.vehicle_category}) booked for ${service.name}`);
          mismatchWarning = `⚠️ Possible vehicle/service mismatch: [${vehicleDesc}] booked for [${service.name}]. Please verify.`;
        }
      }
    }

    // Create appointment
    // Theme B.2 (AC-11 completion): `status` is payment-evidence-based via
    // `initialStatus` (derived above from the request body's optional
    // `payment_intent_id`). Pre-Theme-B.2 this was hardcoded 'pending' on
    // the assumption that staff would manually confirm after reviewing
    // details; that assumption was correct ONLY because the agent had no
    // synchronous payment path. Post-Theme-B.2: when `payment_intent_id`
    // is present in the body the appointment lands at 'confirmed'
    // synchronously, mirroring online-booking's behavior (book/route.ts:559);
    // when absent (the common case today) it stays 'pending' and the
    // webhook (Theme B.1) handles the async pending → confirmed flip after
    // the customer pays via the link the agent sent via `send_payment_link`.
    //
    // Phase 3 Theme A (AC-10 v1.4): appointment_number is NOT NULL — generate
    // it before the INSERT so the row can satisfy the constraint.
    t = perf.now();
    const appointmentNumber = await generateAppointmentNumber(supabase);
    perf.mark('query:generateAppointmentNumber', t);
    t = perf.now();
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        appointment_number: appointmentNumber,
        customer_id: customerId,
        vehicle_id: vehicleId,
        status: initialStatus,
        channel: 'phone',
        scheduled_date: date,
        scheduled_start_time: normalizedTime,
        scheduled_end_time: endTime,
        is_mobile: false,
        subtotal: 0,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: 0,
        job_notes: [mismatchWarning, notes].filter(Boolean).join('\n') || null,
      })
      .select(
        'id, scheduled_date, scheduled_start_time, scheduled_end_time, status, channel, total_amount'
      )
      .single();
    perf.mark('query:appointments_create', t);

    if (apptErr || !appointment) {
      console.error('Appointment creation failed:', apptErr?.message);
      return NextResponse.json(
        { error: 'Failed to create appointment' },
        { status: 500 }
      );
    }

    // Create appointment_services row
    t = perf.now();
    const { error: junctionErr } = await supabase
      .from('appointment_services')
      .insert({
        appointment_id: appointment.id,
        service_id: service.id,
        price_at_booking: 0,
        tier_name: null,
      });
    perf.mark('query:appointment_services', t);

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
    const formattedTime = formatTime(normalizedTime);

    // Send SMS confirmation and log it
    t = perf.now();
    const biz = await getBusinessInfo();
    perf.mark('fetch:getBusinessInfo', t);

    if (hasSmsConsent) {
      // total_amount is 0 here by design — voice-agent ad-hoc bookings don't
      // price the service at booking time. Pass total: undefined so the engine
      // REMOVE_LINEs the {service_total} line cleanly (per Session 2B contract
      // change demoting service_total to optional — migrations 20260427000001
      // + 20260427000002).
      // Session 2D: pass last_name cheap-add (loaded by 2B's customer SELECT
      // expansion). vehicleDescription stays undefined per Session 2B Q2's
      // skip-vehicle-load decision; if operators reference {vehicle_description}
      // in body, REMOVE_LINE drops the line cleanly.
      const customerLastName = existingCustomer?.last_name || undefined;
      const smsBody = await buildAppointmentConfirmationSms({
        businessName: biz.name,
        businessPhone: biz.phone,
        date: formattedDate,
        time: formattedTime,
        serviceName: service.name,
        customerFirstName,
        customerLastName,
        vehicleDescription: undefined,
        total: Number(appointment.total_amount) > 0
          ? formatCurrency(Number(appointment.total_amount))
          : undefined,
      });
      if (smsBody) {
        sendSms(e164Phone, smsBody, {
          logToConversation: true,
          customerId: customerId || undefined,
          notificationType: 'appointment_confirmed',
          contextId: appointment.id,
        }).catch((err) => console.error('Appointment SMS confirmation failed:', err));
      }
    }

    // Log system message to conversation thread (non-blocking)
    logVoiceAction(supabase, e164Phone, `Appointment booked via phone: ${service.name} on ${formattedDate} at ${formattedTime}`).catch(() => {});

    // Theme G — `booking_created` outbound webhook removed (no n8n receiver
    // in Smart Details; audit f5e714a8). Customer + staff SMS already
    // dispatched inline above; voice action logged to conversation thread.

    const responseData = {
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
    };
    perf.done(responseData);
    return NextResponse.json(responseData, { status: 201 });
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

// logSmsMessage removed — sendSms() auto-logs when logToConversation: true
