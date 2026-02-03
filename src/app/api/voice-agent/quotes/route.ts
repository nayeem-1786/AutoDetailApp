import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { fireWebhook } from '@/lib/utils/webhook';
import { generateQuoteNumber } from '@/lib/utils/quote-number';

interface QuoteServiceInput {
  service_id: string;
  tier_name?: string;
}

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
      services: serviceInputs,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      notes,
      send_sms,
    } = body as {
      customer_name: string;
      customer_phone: string;
      services: QuoteServiceInput[];
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      notes?: string;
      send_sms?: boolean;
    };

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

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', e164Phone)
      .limit(1)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: e164Phone,
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
    }

    // Optionally create vehicle
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

    // Look up each service + pricing tier to get prices
    const serviceIds = serviceInputs.map((s) => s.service_id);
    const { data: servicesData, error: svcErr } = await supabase
      .from('services')
      .select('id, name, flat_price, pricing_model, service_pricing ( tier_name, price )')
      .in('id', serviceIds)
      .eq('is_active', true);

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
        const tier = tiers.find((t) => t.tier_name === input.tier_name);
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
    const quoteNumber = await generateQuoteNumber(supabase);

    // Determine initial status and timestamps
    const now = new Date().toISOString();
    const status = send_sms ? 'sent' : 'draft';
    const sentAt = send_sms ? now : null;

    // Set valid_until to 30 days from now
    const validUntil = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Create quote
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

    const { error: itemsErr } = await supabase
      .from('quote_items')
      .insert(itemRows);

    if (itemsErr) {
      console.error('Quote items insertion failed:', itemsErr.message);
    }

    // Fire webhook (non-blocking)
    const webhookEvent = send_sms ? 'quote_sent' : 'quote_created';
    fireWebhook(
      webhookEvent,
      {
        event: send_sms ? 'quote.sent' : 'quote.created',
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

    return NextResponse.json(
      {
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
      },
      { status: 201 }
    );
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
