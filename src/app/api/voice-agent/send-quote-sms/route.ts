import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName } from '@/lib/services/service-resolver';
import { getBusinessInfo } from '@/lib/data/business';

/**
 * POST /api/voice-agent/send-quote-sms
 * Mid-call tool — sends the customer an SMS with a quote link.
 * Called by the ElevenLabs agent when the customer asks to be texted pricing.
 *
 * Auth: Bearer token (voice_agent_api_key)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const {
      phone,
      customer_name,
      services,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
    } = body as {
      phone: string;
      customer_name?: string;
      services: string; // comma-separated
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }
    if (!services) {
      return NextResponse.json({ error: 'services is required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Parse comma-separated services
    const serviceNames = services.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (serviceNames.length === 0) {
      return NextResponse.json({ error: 'No valid services provided' }, { status: 400 });
    }

    // Resolve services to quote items
    const quoteItems: Array<{
      service_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      tier_name: string | null;
    }> = [];

    for (const serviceName of serviceNames) {
      const service = await resolveServiceByName(admin, serviceName);
      if (!service) {
        console.warn(`[SendQuoteSMS] Service not found: "${serviceName}"`);
        continue;
      }
      let price = service.flat_price ?? 0;
      let tierName: string | null = null;
      if (service.service_pricing?.length > 0) {
        price = service.service_pricing[0].price;
        tierName = service.service_pricing[0].tier_name;
      }
      quoteItems.push({
        service_id: service.id,
        item_name: service.name,
        quantity: 1,
        unit_price: price,
        tier_name: tierName,
      });
    }

    if (quoteItems.length === 0) {
      return NextResponse.json(
        { error: 'None of the specified services were found' },
        { status: 400 }
      );
    }

    // Find or create customer
    let customerId: string | null = null;
    const { data: existingCustomer } = await admin
      .from('customers')
      .select('id, first_name, sms_consent')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;

      // Update generic name with real name if available
      const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
      if (
        existingCustomer.first_name &&
        GENERIC_FIRST_NAMES.includes(existingCustomer.first_name.toLowerCase()) &&
        customer_name &&
        customer_name.trim().length > 0 &&
        !['new customer', 'customer', 'unknown', 'caller', 'phone caller'].includes(customer_name.trim().toLowerCase())
      ) {
        const nameParts = customer_name.trim().split(/\s+/);
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', existingCustomer.id);
        console.log(`[SendQuoteSMS] Updated generic name to "${customer_name.trim()}" for ${normalizedPhone}`);
      }
    } else {
      // Determine name — use provided name if real, otherwise fallback
      const GENERIC_NAMES = ['new customer', 'customer', 'unknown', 'caller', 'phone caller'];
      const nameIsGeneric = !customer_name
        || customer_name.trim().length === 0
        || GENERIC_NAMES.includes(customer_name.trim().toLowerCase());

      const finalName = nameIsGeneric ? 'Phone Caller' : customer_name!.trim();
      const nameParts = finalName.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      const { data: newCustomer, error: insertError } = await admin
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName || '',
          phone: normalizedPhone,
          sms_consent: true,
        })
        .select('id, sms_consent')
        .single();

      if (insertError) {
        console.error(`[SendQuoteSMS] Insert error detail:`, JSON.stringify(insertError));
      }

      if (newCustomer) {
        customerId = newCustomer.id;
        console.log(`[SendQuoteSMS] Created customer "${firstName} ${lastName || ''}" for ${normalizedPhone}`);
      }
    }

    if (!customerId) {
      console.error(`[SendQuoteSMS] Failed to find or create customer for ${normalizedPhone}`);
      return NextResponse.json(
        { error: 'Failed to create customer record' },
        { status: 500 }
      );
    }

    // Find or create vehicle — dedup by make + model (case-insensitive)
    let vehicleId: string | undefined;
    if (vehicle_make || vehicle_model) {
      let vehicleQuery = admin
        .from('vehicles')
        .select('id')
        .eq('customer_id', customerId);

      if (vehicle_make) vehicleQuery = vehicleQuery.ilike('make', vehicle_make);
      if (vehicle_model) vehicleQuery = vehicleQuery.ilike('model', vehicle_model);

      const { data: existingVehicle } = await vehicleQuery.limit(1).maybeSingle();

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
      } else {
        const { data: newVehicle } = await admin
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
        vehicleId = newVehicle?.id;
      }
    }

    // Read quote validity
    const { data: validitySetting } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'quote_validity_days')
      .maybeSingle();

    let quoteValidityDays = 10;
    if (validitySetting?.value) {
      try {
        const parsed = JSON.parse(validitySetting.value);
        if (typeof parsed === 'number' && parsed > 0) quoteValidityDays = parsed;
      } catch { /* use fallback */ }
    }

    const validUntil = new Date(Date.now() + quoteValidityDays * 24 * 60 * 60 * 1000).toISOString();

    // Create quote
    const { quote } = await createQuote(admin, {
      customer_id: customerId,
      vehicle_id: vehicleId,
      items: quoteItems,
      notes: 'Generated during phone call',
      valid_until: validUntil,
    });

    const quoteRecord = quote as { id: string; quote_number: string; access_token: string };

    // Mark as sent
    await admin
      .from('quotes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', quoteRecord.id);

    // Generate short link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const quoteUrl = `${appUrl}/quote/${quoteRecord.access_token}`;
    let linkUrl = quoteUrl;
    try { linkUrl = await createShortLink(quoteUrl); } catch { /* use full URL */ }

    // Send SMS
    const biz = await getBusinessInfo();
    const serviceList = quoteItems.map((i) => i.item_name).join(', ');
    const smsBody = `Here's your quote from ${biz.name} for ${serviceList}: ${linkUrl}`;
    await sendSms(normalizedPhone, smsBody);

    // Log SMS to conversation thread
    let { data: conversation } = await admin
      .from('conversations')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .single();

    if (!conversation) {
      const { data: newConv } = await admin
        .from('conversations')
        .insert({
          phone_number: normalizedPhone,
          customer_id: customerId,
          is_ai_enabled: true,
          status: 'open',
          last_message_at: new Date().toISOString(),
          last_message_preview: smsBody.substring(0, 200),
          last_channel: 'sms',
          unread_count: 0,
        })
        .select('id')
        .single();
      conversation = newConv;
    }

    if (conversation) {
      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: smsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    }

    // Log quote communication
    await admin.from('quote_communications').insert({
      quote_id: quoteRecord.id,
      channel: 'sms',
      sent_to: normalizedPhone,
      status: 'sent',
    });

    console.log(`[SendQuoteSMS] Quote ${quoteRecord.quote_number} sent to ${normalizedPhone}`);

    return NextResponse.json({
      success: true,
      quote_number: quoteRecord.quote_number,
      quote_link: linkUrl,
    });
  } catch (err) {
    console.error('[SendQuoteSMS] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
