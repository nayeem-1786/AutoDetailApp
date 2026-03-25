import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone, formatTime } from '@/lib/utils/format';

/**
 * POST /api/voice-agent/initiation
 * ElevenLabs conversation initiation webhook.
 * Called during ring period when a Twilio call comes in.
 * Must respond within 5 seconds.
 *
 * Returns dynamic_variables and a personalized first_message
 * so the voice agent greets returning customers by name.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const callerPhone = body.caller_id as string | undefined;

    if (!callerPhone) {
      return NextResponse.json(newCallerResponse(''), { status: 200 });
    }

    const e164Phone = normalizePhone(callerPhone);
    if (!e164Phone) {
      return NextResponse.json(newCallerResponse(callerPhone), { status: 200 });
    }

    const supabase = createAdminClient();

    // Lean parallel queries — must be fast (< 5s total)
    const [customerRes, conversationRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id, first_name, last_name, customer_type, loyalty_points_balance, notes, tags, first_visit_date, last_visit_date, visit_count, lifetime_spend')
        .eq('phone', e164Phone)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('conversations')
        .select('summary')
        .eq('phone_number', e164Phone)
        .maybeSingle(),
    ]);

    const customer = customerRes.data;

    if (!customer) {
      return NextResponse.json(newCallerResponse(e164Phone), { status: 200 });
    }

    // Parallel fetches for customer details
    const todayPST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // YYYY-MM-DD
    const [vehicleRes, apptRes, quoteRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('year, make, model, color, size_class')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('appointments')
        .select('scheduled_date, scheduled_start_time, appointment_services(services(name))')
        .eq('customer_id', customer.id)
        .gte('scheduled_date', todayPST)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('quotes')
        .select('quote_number, status, total_amount')
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Build customer summary string
    const summaryParts: string[] = ['Returning customer.'];
    const firstName = customer.first_name || '';
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');

    const vehicle = vehicleRes.data;
    if (vehicle) {
      const vParts = [vehicle.year, vehicle.color, vehicle.make, vehicle.model].filter(Boolean);
      const sizeLabel = vehicle.size_class ? ` (${vehicle.size_class})` : '';
      if (vParts.length > 0) summaryParts.push(`Vehicle: ${vParts.join(' ')}${sizeLabel}.`);
    }

    if (customer.visit_count > 0) {
      summaryParts.push(`${customer.visit_count} visits, $${(customer.lifetime_spend || 0).toFixed(0)} lifetime spend.`);
    }

    if (customer.loyalty_points_balance > 0) {
      summaryParts.push(`Loyalty: ${customer.loyalty_points_balance} points.`);
    }

    if (customer.tags && customer.tags.length > 0) {
      summaryParts.push(`Tags: ${customer.tags.join(', ')}.`);
    }

    if (customer.last_visit_date) {
      const lastVisit = new Date(customer.last_visit_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
      });
      summaryParts.push(`Last visit: ${lastVisit}.`);
    }

    const appt = apptRes.data;
    if (appt) {
      const apptDate = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
      });
      const apptTime = appt.scheduled_start_time ? formatTime(appt.scheduled_start_time) : 'TBD';
      const services = ((appt.appointment_services as unknown as Array<{ services: { name: string } }>) || [])
        .map((as) => as.services?.name).filter(Boolean);
      summaryParts.push(`Upcoming: ${services.join(', ') || 'appointment'} on ${apptDate} at ${apptTime}.`);
    }

    const quote = quoteRes.data;
    if (quote) {
      summaryParts.push(`Recent quote: ${quote.quote_number} (${quote.status}, $${Number(quote.total_amount).toFixed(0)}).`);
    }

    if (conversationRes.data?.summary) {
      summaryParts.push(`Context: ${conversationRes.data.summary}`);
    }

    // Build personalized first message
    const firstMessage = appt
      ? `Hey ${firstName}, welcome back to Smart Details! I see you have an upcoming appointment. How can I help you today?`
      : `Hey ${firstName}, welcome back to Smart Details! How can I help you today?`;

    return NextResponse.json({
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        customer_name: fullName,
        customer_phone: e164Phone,
        is_returning: 'true',
        customer_summary: summaryParts.join(' '),
      },
      conversation_config_override: {
        agent: {
          first_message: firstMessage,
        },
      },
    });
  } catch (err) {
    console.error('[Voice Initiation] Error:', err);
    // Return new-caller fallback on any error — don't block the call
    return NextResponse.json(newCallerResponse(''), { status: 200 });
  }
}

function newCallerResponse(phone: string) {
  return {
    type: 'conversation_initiation_client_data',
    dynamic_variables: {
      customer_name: '',
      customer_phone: phone,
      is_returning: 'false',
      customer_summary: 'New caller. No account on file.',
    },
    conversation_config_override: {
      agent: {
        first_message: 'Thank you for calling Smart Details Auto Spa! This is your virtual assistant. How can I help you today?',
      },
    },
  };
}
