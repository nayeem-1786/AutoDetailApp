import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { fireWebhook } from '@/lib/utils/webhook';
import { generateQuoteNumber } from '@/lib/utils/quote-number';
import { createPerfTimer } from '@/lib/utils/voice-perf';

interface QuoteServiceInput {
  service_id: string;
  tier_name?: string;
}

export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/quotes');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

const body = await request.json();
    const {
      customer_name,
      customer_phone,
      services: rawServices,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      notes,
      send_sms,
    } = body as {
      customer_name: string;
      customer_phone: string;
      services: QuoteServiceInput[] | string;
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      notes?: string;
      send_sms?: boolean | string;
    };

    const serviceInputs: QuoteServiceInput[] = typeof rawServices === 'string' ? JSON.parse(rawServices) : rawServices;

    // Validate required fields
    if (!customer_name || !customer_phone || !serviceInputs?.length) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: customer_name, customer_phone, services (non-empty array)',
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

    // Find-or-create customer by phone
    const { firstName, lastName } = splitName(customer_name);

    let customerId: string;

    let t = perf.now();
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', e164Phone)
      .is('deleted_at', null)
      .limit(1)
      .single();
    perf.mark('query:customers_find', t);

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      t = perf.now();
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
        })
        .select('id')
        .single();
      perf.mark('query:customers_create', t);

      if (custErr || !newCustomer) {
        console.error('Customer creation failed:', custErr?.message);
        return NextResponse.json(
          { error: 'Failed to create customer record' },
          { status: 500 }
        );
      }
      customerId = newCustomer.id;
    }

    // Find or create vehicle — shared dedup by make + model + category
    let vehicleId: string | null = null;
    if (vehicle_make) {
      const { findOrCreateVehicle } = await import('@/lib/utils/vehicle-helpers');
      t = perf.now();
      const vehicleResult = await findOrCreateVehicle(supabase, {
        customerId,
        make: vehicle_make,
        model: vehicle_model,
        year: vehicle_year,
        color: vehicle_color,
      });
      perf.mark('query:vehicles_findOrCreate', t);
      if (vehicleResult) vehicleId = vehicleResult.id;
    }

    // Look up each service + pricing tier to get prices
    const serviceIds = serviceInputs.map((s) => s.service_id);
    t = perf.now();
    const { data: servicesData, error: svcErr } = await supabase
      .from('services')
      .select('id, name, flat_price, pricing_model, service_pricing ( tier_name, price )')
      .in('id', serviceIds)
      .eq('is_active', true);
    perf.mark('query:services', t);

    if (svcErr) {
      console.error('Services query error:', svcErr.message);
      return NextResponse.json(
        { error: 'Failed to look up services' },
        { status: 500 }
      );
    }

    const servicesMap = new Map(
      (servicesData ?? []).map((s) => [s.id, s])
    );

    // Build quote items and calculate totals
    const quoteItems: {
      service_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      tier_name: string | null;
    }[] = [];

    for (const input of serviceInputs) {
      const svc = servicesMap.get(input.service_id);
      if (!svc) {
        return NextResponse.json(
          { error: `Service not found or inactive: ${input.service_id}` },
          { status: 400 }
        );
      }

      let price = 0;
      let tierName: string | null = null;

      if (input.tier_name) {
        // Look up tier price
        const tiers = (svc.service_pricing as { tier_name: string; price: number }[]) ?? [];
        const tier = tiers.find((tp) => tp.tier_name === input.tier_name);
        if (tier) {
          price = Number(tier.price);
          tierName = tier.tier_name;
        }
      } else if (svc.pricing_model === 'flat' && svc.flat_price !== null) {
        price = Number(svc.flat_price);
      } else {
        // For tiered pricing with no tier specified, use the first tier as default
        const tiers = (svc.service_pricing as { tier_name: string; price: number }[]) ?? [];
        if (tiers.length > 0) {
          price = Number(tiers[0].price);
          tierName = tiers[0].tier_name;
        }
      }

      quoteItems.push({
        service_id: input.service_id,
        item_name: svc.name as string,
        quantity: 1,
        unit_price: price,
        total_price: price,
        tier_name: tierName,
      });
    }

    const subtotal = quoteItems.reduce((sum, item) => sum + item.total_price, 0);

    // Generate quote number
    t = perf.now();
    const quoteNumber = await generateQuoteNumber(supabase);
    perf.mark('query:generateQuoteNumber', t);

    // Determine initial status and timestamps
    const now = new Date().toISOString();
    const shouldSendSms = send_sms === true || send_sms === 'true';
    const status = shouldSendSms ? 'sent' : 'draft';
    const sentAt = shouldSendSms ? now : null;

    // Read quote validity from admin settings
    t = perf.now();
    const { data: validitySetting } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'quote_validity_days')
      .maybeSingle();
    perf.mark('query:business_settings', t);

    let quoteValidityDays = 10; // fallback
    if (validitySetting?.value) {
      try {
        const parsed = JSON.parse(validitySetting.value);
        if (typeof parsed === 'number' && parsed > 0) quoteValidityDays = parsed;
      } catch { /* use fallback */ }
    }

    const validUntil = new Date(
      Date.now() + quoteValidityDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Create quote
    t = perf.now();
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        customer_id: customerId,
        vehicle_id: vehicleId,
        status,
        subtotal,
        tax_amount: 0,
        total_amount: subtotal,
        notes: notes || null,
        valid_until: validUntil,
        sent_at: sentAt,
      })
      .select('id, quote_number, status, subtotal, total_amount, valid_until, sent_at, created_at')
      .single();
    perf.mark('query:quotes_create', t);

    if (quoteErr || !quote) {
      console.error('Quote creation failed:', quoteErr?.message);
      return NextResponse.json(
        { error: 'Failed to create quote' },
        { status: 500 }
      );
    }

    // Create quote_items
    const itemRows = quoteItems.map((item) => ({
      quote_id: quote.id,
      service_id: item.service_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      tier_name: item.tier_name,
    }));

    t = perf.now();
    const { error: itemsErr } = await supabase
      .from('quote_items')
      .insert(itemRows);
    perf.mark('query:quote_items', t);

    if (itemsErr) {
      console.error('Quote items insertion failed:', itemsErr.message);
    }

    // Log system message to conversation thread (non-blocking)
    const serviceNames = quoteItems.map((i) => i.item_name).join(', ');
    logVoiceAction(supabase, e164Phone, `Quote ${quote.quote_number} created via phone: ${serviceNames} — $${Number(quote.total_amount).toFixed(2)}`).catch(() => {});

    // Fire webhook (non-blocking)
    const webhookEvent = shouldSendSms ? 'quote_sent' : 'quote_created';
    fireWebhook(
      webhookEvent,
      {
        event: shouldSendSms ? 'quote.sent' : 'quote.created',
        timestamp: now,
        source: 'voice_agent',
        quote: {
          id: quote.id,
          quote_number: quote.quote_number,
          status: quote.status,
          subtotal: Number(quote.subtotal),
          total_amount: Number(quote.total_amount),
          valid_until: quote.valid_until,
          sent_at: quote.sent_at,
        },
        customer: {
          id: customerId,
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
        },
        items: quoteItems.map((item) => ({
          service_id: item.service_id,
          name: item.item_name,
          price: item.total_price,
          tier_name: item.tier_name,
        })),
      },
      supabase
    ).catch((err) => console.error('Webhook fire failed:', err));

    const responseData = {
      success: true,
      quote: {
        id: quote.id,
        quote_number: quote.quote_number,
        status: quote.status,
        subtotal: Number(quote.subtotal),
        total_amount: Number(quote.total_amount),
        valid_until: quote.valid_until,
        sent_at: quote.sent_at,
        created_at: quote.created_at,
        items: quoteItems.map((item) => ({
          service_id: item.service_id,
          name: item.item_name,
          price: item.total_price,
          tier_name: item.tier_name,
        })),
      },
    };
    perf.done(responseData);
    return NextResponse.json(responseData, { status: 201 });
  } catch (err) {
    console.error('Voice agent quotes error:', err);
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
