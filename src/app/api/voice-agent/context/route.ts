import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { createPerfTimer } from '@/lib/utils/voice-perf';

/**
 * GET /api/voice-agent/context?phone=+1XXXXXXXXXX
 * Unified customer context for the ElevenLabs voice agent.
 * Returns everything the voice agent needs in one call:
 * customer profile, vehicles, appointments, quotes, loyalty,
 * conversation history (SMS + voice), and conversation summary.
 */
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/context');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ error: 'Missing required parameter: phone' }, { status: 400 });
    }

    const e164Phone = normalizePhone(phone);
    if (!e164Phone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Find customer
    let t = perf.now();
    const { data: customer } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, customer_type, loyalty_points_balance, notes, tags, first_visit_date, last_visit_date, visit_count, lifetime_spend')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    perf.mark('query:customers', t);

    // Find conversation
    t = perf.now();
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, status, is_ai_enabled, summary, last_message_at, last_channel')
      .eq('phone_number', e164Phone)
      .maybeSingle();
    perf.mark('query:conversations', t);

    // If no customer and no conversation, return minimal response
    if (!customer && !conversation) {
      const responseData = {
        customer: null,
        conversation: null,
        is_new_caller: true,
      };
      perf.done(responseData);
      return NextResponse.json(responseData);
    }

    // Parallel data fetches for known customers
    let vehicles: unknown[] = [];
    let appointments: unknown[] = [];
    let quotes: unknown[] = [];
    let messages: unknown[] = [];

    if (customer) {
      t = perf.now();
      const [vehicleRes, apptRes, quoteRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('id, vehicle_type, size_class, year, make, model, color')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id, scheduled_date, scheduled_start_time, status, appointment_services(services(name))')
          .eq('customer_id', customer.id)
          .gte('scheduled_date', today)
          .neq('status', 'cancelled')
          .order('scheduled_date', { ascending: true })
          .limit(5),
        supabase
          .from('quotes')
          // Session 2D.2: vehicle JOIN added so the agent's recent_quotes payload
          // carries per-quote vehicle attribution. Pairs with the formatting
          // change in voice-agent/initiation/route.ts so both context surfaces
          // expose the same data shape to the agent.
          .select('quote_number, status, total_amount, valid_until, created_at, vehicle:vehicles!quotes_vehicle_id_fkey(id, year, make, model, color)')
          .eq('customer_id', customer.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);
      perf.mark('query:vehicles+appointments+quotes', t);
      vehicles = vehicleRes.data || [];
      appointments = apptRes.data || [];
      quotes = quoteRes.data || [];
    }

    if (conversation) {
      t = perf.now();
      const { data: msgData } = await supabase
        .from('messages')
        .select('direction, body, sender_type, channel, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(20);
      perf.mark('query:messages', t);
      messages = (msgData || []).reverse();
    }

    const responseData = {
      customer: customer ? {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        email: customer.email,
        customer_type: customer.customer_type,
        loyalty_points_balance: customer.loyalty_points_balance,
        notes: customer.notes,
        tags: customer.tags,
        first_visit_date: customer.first_visit_date,
        last_visit_date: customer.last_visit_date,
        visit_count: customer.visit_count,
        lifetime_spend: customer.lifetime_spend,
        vehicles,
        upcoming_appointments: appointments,
        recent_quotes: quotes,
      } : null,
      conversation: conversation ? {
        id: conversation.id,
        status: conversation.status,
        is_ai_enabled: conversation.is_ai_enabled,
        summary: conversation.summary,
        last_message_at: conversation.last_message_at,
        last_channel: conversation.last_channel,
        messages,
      } : null,
      is_new_caller: !customer,
    };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Voice agent context error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
