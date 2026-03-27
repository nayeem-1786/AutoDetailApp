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
 *
 * The customer_summary is a multi-line natural language string
 * with structured sections (vehicles, history, quotes, etc.)
 * that the ElevenLabs LLM reads as conversation context.
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

    // Round 1: customer + conversation (parallel, must be fast)
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

    // Round 2: all detail queries in parallel
    const todayPST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const [vehiclesRes, apptsRes, quotesRes, lastTxnRes] = await Promise.all([
      supabase
        .from('vehicles')
        .select('year, make, model, color, size_class')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('scheduled_date, scheduled_start_time, appointment_services(services(name))')
        .eq('customer_id', customer.id)
        .gte('scheduled_date', todayPST)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .limit(5),
      supabase
        .from('quotes')
        .select('quote_number, status, total_amount, created_at, quote_items(item_name)')
        .eq('customer_id', customer.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('transactions')
        .select('transaction_date, total_amount, transaction_items(item_name)')
        .eq('customer_id', customer.id)
        .order('transaction_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstName = customer.first_name || '';
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');

    // Build enriched customer summary
    const sections: string[] = [];
    sections.push(`Returning customer: ${fullName}`);

    // Vehicles
    const vehicles = vehiclesRes.data || [];
    if (vehicles.length > 0) {
      const vehicleLines = vehicles.map((v) => {
        const parts = [v.year, v.color, v.make, v.model].filter(Boolean).join(' ');
        const size = v.size_class ? ` (${v.size_class})` : '';
        return `  ${parts}${size}`;
      });
      sections.push(`VEHICLES:\n${vehicleLines.join('\n')}`);
    }

    // History
    if (customer.visit_count > 0 || customer.lifetime_spend > 0) {
      let historyLine = `HISTORY: ${customer.visit_count || 0} visits, $${(customer.lifetime_spend || 0).toFixed(0)} lifetime spend.`;
      const lastTxn = lastTxnRes.data;
      if (lastTxn) {
        const txnDate = new Date(lastTxn.transaction_date).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
        const txnServices = ((lastTxn.transaction_items as Array<{ item_name: string }>) || [])
          .map((i) => i.item_name).filter(Boolean);
        const serviceStr = txnServices.length > 0 ? txnServices.join(', ') : 'service';
        historyLine += ` Last visit ${txnDate} (${serviceStr}, $${Number(lastTxn.total_amount).toFixed(0)}).`;
      } else if (customer.last_visit_date) {
        const lastVisit = new Date(customer.last_visit_date).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
        historyLine += ` Last visit ${lastVisit}.`;
      }
      sections.push(historyLine);
    }

    // Upcoming appointments
    const appts = apptsRes.data || [];
    if (appts.length > 0) {
      const apptLines = appts.map((a) => {
        const apptDate = new Date(a.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
        const apptTime = a.scheduled_start_time ? formatTime(a.scheduled_start_time) : 'TBD';
        const services = ((a.appointment_services as unknown as Array<{ services: { name: string } }>) || [])
          .map((as) => as.services?.name).filter(Boolean);
        return `  ${services.join(', ') || 'Appointment'} on ${apptDate} at ${apptTime}`;
      });
      sections.push(`UPCOMING APPOINTMENTS:\n${apptLines.join('\n')}`);
    }

    // Recent quotes
    const quotes = quotesRes.data || [];
    if (quotes.length > 0) {
      const quoteLines = quotes.map((q) => {
        const items = ((q.quote_items as Array<{ item_name: string }>) || [])
          .map((i) => i.item_name).filter(Boolean);
        const serviceStr = items.length > 0 ? items.join(' + ') : 'Services';
        const statusDate = new Date(q.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
        const statusLabel = q.status.charAt(0).toUpperCase() + q.status.slice(1);
        return `  ${q.quote_number}: ${serviceStr} — $${Number(q.total_amount).toFixed(0)} (${statusLabel} ${statusDate})`;
      });
      sections.push(`RECENT QUOTES:\n${quoteLines.join('\n')}`);
    }

    // Loyalty
    if (customer.loyalty_points_balance > 0) {
      sections.push(`LOYALTY: ${customer.loyalty_points_balance} points`);
    }

    // Tags
    if (customer.tags && customer.tags.length > 0) {
      sections.push(`TAGS: ${customer.tags.join(', ')}`);
    }

    // Staff notes
    if (customer.notes) {
      sections.push(`STAFF NOTES: ${customer.notes}`);
    }

    // Conversation summary (cross-channel memory)
    if (conversationRes.data?.summary) {
      sections.push(`PREVIOUS CONVERSATIONS: ${conversationRes.data.summary}`);
    }

    const customerSummary = sections.join('\n');

    // Build personalized first message
    const hasAppt = appts.length > 0;
    const firstMessage = hasAppt
      ? `Hey ${firstName}, welcome back to Smart Details! I see you have an upcoming appointment. How can I help you today?`
      : `Hey ${firstName}, welcome back to Smart Details! How can I help you today?`;

    return NextResponse.json({
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        customer_name: fullName,
        customer_phone: e164Phone,
        is_returning: 'true',
        customer_summary: customerSummary,
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
