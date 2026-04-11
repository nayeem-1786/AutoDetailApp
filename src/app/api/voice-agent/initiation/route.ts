import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone, formatTime } from '@/lib/utils/format';
import { getBusinessInfo } from '@/lib/data/business';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';

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
  const perf = createPerfTimer('POST /voice-agent/initiation');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    let t = perf.now();
    const biz = await getBusinessInfo();
    perf.mark('getBusinessInfo', t);
    const body = await request.json();
    const callerPhone = body.caller_id as string | undefined;

    if (!callerPhone) {
      return NextResponse.json(newCallerResponse('', biz.name), { status: 200 });
    }

    const e164Phone = normalizePhone(callerPhone);
    if (!e164Phone) {
      return NextResponse.json(newCallerResponse(callerPhone, biz.name), { status: 200 });
    }

    const supabase = createAdminClient();

    // Round 1: customer + conversation + greeting settings (parallel, must be fast)
    t = perf.now();
    const [customerRes, conversationRes, greetingSettingsRes] = await Promise.all([
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
      supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['voice_agent_first_message_returning', 'voice_agent_first_message_new']),
    ]);

    perf.mark('query:customer+conversation', t);
    const customer = customerRes.data;

    if (!customer) {
      // Use custom new-caller greeting if configured
      const newGreetingSettings = new Map(
        (greetingSettingsRes.data ?? []).map((r) => [r.key, String(r.value ?? '')])
      );
      const customNew = newGreetingSettings.get('voice_agent_first_message_new') || '';
      const newTimeOfDay = getTimeOfDay();
      const customMessage = customNew.trim()
        ? resolveGreetingVariables(customNew, { businessName: biz.name, customerName: '', firstName: '', timeOfDay: newTimeOfDay })
        : undefined;
      return NextResponse.json(newCallerResponse(e164Phone, biz.name, customMessage), { status: 200 });
    }

    // Round 2: all detail queries in parallel
    t = perf.now();
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

    perf.mark('query:details(vehicles+appts+quotes+txn)', t);
    const firstName = customer.first_name || '';
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');

    // Build enriched customer summary
    const sections: string[] = [];
    sections.push(`Returning customer: ${fullName}`);

    // Vehicles
    const vehicles = vehiclesRes.data || [];
    if (vehicles.length > 0) {
      const vehicleLines = vehicles.map((v) => {
        const desc = cleanVehicleDescription({ year: v.year, color: v.color, make: v.make, model: v.model });
        const size = v.size_class ? ` (${v.size_class})` : '';
        return `  ${desc}${size}`;
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

    // Build personalized first message — use custom greeting if configured
    const greetingSettings = new Map(
      (greetingSettingsRes.data ?? []).map((r) => [r.key, String(r.value ?? '')])
    );
    const customReturning = greetingSettings.get('voice_agent_first_message_returning') || '';
    const timeOfDay = getTimeOfDay();

    const firstMessage = customReturning.trim()
      ? resolveGreetingVariables(customReturning, { businessName: biz.name, customerName: fullName, firstName, timeOfDay })
      : `Thanks for calling ${biz.name}. It looks like you've called us before — is this ${firstName}?`;

    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });

    const responseData = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        customer_name: fullName,
        customer_phone: e164Phone,
        is_returning: 'true',
        customer_summary: customerSummary,
        time_of_day: getTimeOfDay(),
        current_date: currentDate,
      },
      conversation_config_override: {
        agent: {
          first_message: firstMessage,
        },
      },
    };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[Voice Initiation] Error:', err);
    // Return new-caller fallback on any error — don't block the call
    return NextResponse.json(newCallerResponse(''), { status: 200 });
  }
}

function getTimeOfDay(): string {
  const hour = parseInt(
    new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Los_Angeles' }),
    10
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function newCallerResponse(phone: string, businessName?: string, customMessage?: string) {
  const name = businessName || 'our business';
  const timeOfDay = getTimeOfDay();
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  return {
    type: 'conversation_initiation_client_data',
    dynamic_variables: {
      customer_name: '',
      customer_phone: phone,
      is_returning: 'false',
      customer_summary: 'New caller. No account on file.',
      time_of_day: timeOfDay,
      current_date: currentDate,
    },
    conversation_config_override: {
      agent: {
        first_message: customMessage || `Good ${timeOfDay}! Thank you for calling ${name}. This is Tom. Can I get your name before we get started?`,
      },
    },
  };
}

/** Replace {{variable}} placeholders in a greeting template */
function resolveGreetingVariables(
  template: string,
  vars: { businessName: string; customerName: string; firstName: string; timeOfDay: string }
): string {
  return template
    .replace(/\{\{business_name\}\}/g, vars.businessName)
    .replace(/\{\{customer_name\}\}/g, vars.customerName)
    .replace(/\{\{first_name\}\}/g, vars.firstName)
    .replace(/\{\{time_of_day\}\}/g, vars.timeOfDay);
}
