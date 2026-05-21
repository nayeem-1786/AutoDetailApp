import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName, resolvePrice } from '@/lib/services/service-resolver';
import { getBusinessInfo } from '@/lib/data/business';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

/**
 * POST /api/voice-agent/send-quote-sms
 * Mid-call tool — sends the customer an SMS with a quote link.
 * Called by the ElevenLabs agent when the customer asks to be texted pricing.
 *
 * Auth: Bearer token (voice_agent_api_key)
 */
export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/send-quote-sms');
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

    // Find or create customer.
    // Session 2B: SELECT expanded with last_name/email/phone for forward
    // compatibility. Session 3C migrated quote_sms_midcall to chip-driven
    // (see line ~260 below) but today's contract only requires services +
    // short_url; the additional customer fields remain available for any
    // future operator-driven body edits without further engineering.
    let customerId: string | null = null;
    let t = perf.now();
    const { data: existingCustomer } = await admin
      .from('customers')
      .select('id, first_name, last_name, email, phone, sms_consent')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    perf.mark('query:customers_find', t);

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
        t = perf.now();
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', existingCustomer.id);
        perf.mark('query:customers_update_name', t);
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

      t = perf.now();
      const { data: newCustomer, error: insertError } = await admin
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName || '',
          phone: normalizedPhone,
          sms_consent: true,
        })
        .select('id, first_name, last_name, email, phone, sms_consent')
        .single();
      perf.mark('query:customers_create', t);

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

    // Find or create vehicle — shared dedup by make + model + category.
    // MUST run BEFORE service price resolution so the classified size_class
    // flows into resolvePrice. Defect history: prior to 2026-05-20, this
    // endpoint hardcoded sizeClass = 'sedan' and ran the price loop first,
    // silently underpricing every non-sedan quote (Bug A / Q-0076 Tahoe).
    let vehicleId: string | undefined;
    let vehicleSizeClass: string | null = null;
    if (vehicle_make) {
      const { findOrCreateVehicle } = await import('@/lib/utils/vehicle-helpers');
      t = perf.now();
      const vehicleResult = await findOrCreateVehicle(admin, {
        customerId: customerId!,
        make: sanitizeVehicleField(vehicle_make) || vehicle_make,
        model: sanitizeVehicleField(vehicle_model),
        year: sanitizeVehicleField(vehicle_year),
        color: sanitizeVehicleField(vehicle_color),
      });
      perf.mark('query:vehicles_findOrCreate', t);
      if (vehicleResult) {
        vehicleId = vehicleResult.id;
        vehicleSizeClass = vehicleResult.size_class;
      }
    } else {
      console.warn('[SendQuoteSMS] No vehicle_make supplied — pricing will fall back to sedan tier');
    }

    // Pricing tier is determined by the vehicle's classified size_class
    // (sedan / truck_suv_2row / suv_3row_van / exotic / classic). Fall back
    // to 'sedan' when no vehicle was supplied or findOrCreateVehicle failed —
    // matches prior behavior for the no-vehicle case but is now explicit, not
    // a silent universal default.
    const sizeClass = vehicleSizeClass ?? 'sedan';

    // Resolve services to quote items (sale-aware via resolvePrice)
    const quoteItems: Array<{
      service_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      tier_name: string | null;
      standard_price: number | null;
      pricing_type: 'standard' | 'sale' | 'combo' | null;
    }> = [];

    t = perf.now();
    for (const serviceName of serviceNames) {
      const service = await resolveServiceByName(admin, serviceName);
      if (!service) {
        console.warn(`[SendQuoteSMS] Service not found: "${serviceName}"`);
        continue;
      }
      const { price, salePrice, tierName, isOnSale } = resolvePrice(service, sizeClass);
      quoteItems.push({
        service_id: service.id,
        item_name: service.name,
        quantity: 1,
        unit_price: isOnSale ? salePrice! : price,
        tier_name: tierName,
        standard_price: isOnSale ? price : null,
        pricing_type: isOnSale ? 'sale' : 'standard',
      });
    }
    perf.mark('resolve:services_batch', t);

    if (quoteItems.length === 0) {
      return NextResponse.json(
        { error: 'None of the specified services were found' },
        { status: 400 }
      );
    }

    // Read quote validity
    t = perf.now();
    const { data: validitySetting } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'quote_validity_days')
      .maybeSingle();
    perf.mark('query:business_settings', t);

    let quoteValidityDays = 10;
    if (validitySetting?.value) {
      try {
        const parsed = JSON.parse(validitySetting.value);
        if (typeof parsed === 'number' && parsed > 0) quoteValidityDays = parsed;
      } catch { /* use fallback */ }
    }

    const validUntil = new Date(Date.now() + quoteValidityDays * 24 * 60 * 60 * 1000).toISOString();

    // Create quote
    t = perf.now();
    const { quote } = await createQuote(admin, {
      customer_id: customerId,
      vehicle_id: vehicleId,
      items: quoteItems,
      notes: 'Generated during phone call',
      valid_until: validUntil,
    });
    perf.mark('query:createQuote', t);

    const quoteRecord = quote as { id: string; quote_number: string; access_token: string };

    // Mark as sent
    t = perf.now();
    await admin
      .from('quotes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', quoteRecord.id);
    perf.mark('query:quotes_update_sent', t);

    // Generate short link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const quoteUrl = `${appUrl}/quote/${quoteRecord.access_token}`;
    let linkUrl = quoteUrl;
    t = perf.now();
    try { linkUrl = await createShortLink(quoteUrl); } catch { /* use full URL */ }
    perf.mark('fetch:createShortLink', t);

    // Send SMS
    t = perf.now();
    const biz = await getBusinessInfo();
    perf.mark('fetch:getBusinessInfo', t);

    // Session 3C: migrated from hardcoded body to chip-driven slug
    // `quote_sms_midcall`. `services` is a composite-style chip — caller
    // pre-builds the comma-joined string and passes verbatim. Engine treats
    // as opaque. business_name auto-injected.
    const serviceList = quoteItems.map((i) => i.item_name).join(', ');
    const fallback = `Here's your quote from ${biz.name} for ${serviceList}: ${linkUrl}`;

    const tpl = await renderSmsTemplate('quote_sms_midcall', {
      services: serviceList,
      short_url: linkUrl,
    }, fallback);

    t = perf.now();
    if (tpl.isActive && tpl.body) {
      await sendSms(normalizedPhone, tpl.body, {
        logToConversation: true,
        customerId: customerId || undefined,
        notificationType: 'voice_quote_sent',
        contextId: quoteRecord.id,
      });
    } else {
      console.log('[SendQuoteSMS] quote_sms_midcall template disabled — skipping SMS');
    }
    perf.mark('fetch:sendSms', t);

    // Log quote communication
    t = perf.now();
    await admin.from('quote_communications').insert({
      quote_id: quoteRecord.id,
      channel: 'sms',
      sent_to: normalizedPhone,
      status: 'sent',
    });
    perf.mark('query:quote_communications', t);

    console.log(`[SendQuoteSMS] Quote ${quoteRecord.quote_number} sent to ${normalizedPhone}`);

    const responseData = {
      success: true,
      quote_number: quoteRecord.quote_number,
      quote_link: linkUrl,
    };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[SendQuoteSMS] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
