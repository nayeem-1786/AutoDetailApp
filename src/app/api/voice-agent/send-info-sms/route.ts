import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { createShortLink } from '@/lib/utils/short-link';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, formatBusinessHoursText } from '@/lib/data/business-hours';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { SITE_URL } from '@/lib/utils/constants';

const VALID_TYPES = ['store_info', 'product_link', 'category_link', 'service_page', 'booking_link', 'quote_link'] as const;
type InfoType = (typeof VALID_TYPES)[number];

/**
 * POST /api/voice-agent/send-info-sms
 * Universal mid-call tool — texts the caller a link or info based on type.
 * Replaces the single-purpose send_quote_sms tool with 6 info types.
 *
 * Auth: Bearer token (voice_agent_api_key)
 */
export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/send-info-sms');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { phone, type, identifier } = body as {
      phone: string;
      type: string;
      identifier?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type as InfoType)) {
      return NextResponse.json({ error: 'Invalid info type' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const admin = createAdminClient();
    const infoType = type as InfoType;

    // Look up customer for conversation logging
    let t = perf.now();
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    perf.mark('query:customers_find', t);

    const customerId = customer?.id || undefined;

    // Get business info once — used for all SMS templates
    t = perf.now();
    const biz = await getBusinessInfo();
    perf.mark('fetch:getBusinessInfo', t);

    let smsBody: string;
    let contextId: string | undefined;

    switch (infoType) {
      case 'store_info': {
        // Fetch hours
        t = perf.now();
        const hours = await getBusinessHours();
        perf.mark('fetch:getBusinessHours', t);

        const hoursStr = hours ? formatBusinessHoursText(hours) : 'Call for hours';

        // Build Google Maps link — prefer Place ID if available
        t = perf.now();
        const { data: placeIdSetting } = await admin
          .from('business_settings')
          .select('value')
          .eq('key', 'google_place_id')
          .maybeSingle();
        perf.mark('query:google_place_id', t);

        const rawPlaceId = placeIdSetting?.value as string | undefined;
        const placeId = rawPlaceId ? rawPlaceId.replace(/['"]/g, '').trim() : undefined;
        let mapsUrl: string;
        if (placeId) {
          mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.name)}&query_place_id=${placeId}`;
        } else {
          mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.address)}`;
        }

        t = perf.now();
        let shortMapsUrl = mapsUrl;
        try { shortMapsUrl = await createShortLink(mapsUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `${biz.name} — ${biz.address}. Hours: ${hoursStr}. Get directions: ${shortMapsUrl}`;
        break;
      }

      case 'product_link': {
        if (!identifier) {
          return NextResponse.json({ error: 'identifier is required for product_link' }, { status: 400 });
        }

        t = perf.now();
        // Try slug match first, then ILIKE name match
        let product = await admin
          .from('products')
          .select('id, name, slug, category:product_categories(slug)')
          .eq('slug', identifier)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
          .then(r => r.data);

        if (!product) {
          const { data } = await admin
            .from('products')
            .select('id, name, slug, category:product_categories(slug)')
            .ilike('name', `%${identifier}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          product = data;
        }
        perf.mark('query:products_find', t);

        if (!product || !product.slug) {
          return NextResponse.json(
            { error: `Could not find product matching '${identifier}'` },
            { status: 400 }
          );
        }

        const catData = product.category as unknown as { slug: string } | { slug: string }[] | null;
        const catSlug = Array.isArray(catData) ? catData[0]?.slug : catData?.slug;
        if (!catSlug) {
          return NextResponse.json(
            { error: `Could not find product matching '${identifier}'` },
            { status: 400 }
          );
        }

        const productUrl = `${SITE_URL}/products/${catSlug}/${product.slug}`;
        t = perf.now();
        let shortProductUrl = productUrl;
        try { shortProductUrl = await createShortLink(productUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `Check out ${product.name} from ${biz.name}: ${shortProductUrl}`;
        contextId = product.id;
        break;
      }

      case 'category_link': {
        if (!identifier) {
          return NextResponse.json({ error: 'identifier is required for category_link' }, { status: 400 });
        }

        t = perf.now();
        let category = await admin
          .from('product_categories')
          .select('id, name, slug')
          .eq('slug', identifier)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
          .then(r => r.data);

        if (!category) {
          const { data } = await admin
            .from('product_categories')
            .select('id, name, slug')
            .ilike('name', `%${identifier}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          category = data;
        }
        perf.mark('query:categories_find', t);

        if (!category) {
          return NextResponse.json(
            { error: `Could not find category matching '${identifier}'` },
            { status: 400 }
          );
        }

        const categoryUrl = `${SITE_URL}/products/${category.slug}`;
        t = perf.now();
        let shortCategoryUrl = categoryUrl;
        try { shortCategoryUrl = await createShortLink(categoryUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `Browse our ${category.name} at ${biz.name}: ${shortCategoryUrl}`;
        contextId = category.id;
        break;
      }

      case 'service_page': {
        if (!identifier) {
          return NextResponse.json({ error: 'identifier is required for service_page' }, { status: 400 });
        }

        t = perf.now();
        let service = await admin
          .from('services')
          .select('id, name, slug, category:service_categories(slug)')
          .eq('slug', identifier)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
          .then(r => r.data);

        if (!service) {
          const { data } = await admin
            .from('services')
            .select('id, name, slug, category:service_categories(slug)')
            .ilike('name', `%${identifier}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          service = data;
        }
        perf.mark('query:services_find', t);

        if (!service) {
          return NextResponse.json(
            { error: `Could not find service matching '${identifier}'` },
            { status: 400 }
          );
        }

        const svcCatData = service.category as unknown as { slug: string } | { slug: string }[] | null;
        const serviceCatSlug = Array.isArray(svcCatData) ? svcCatData[0]?.slug : svcCatData?.slug;
        // If service or category has no slug, fall back to booking page
        let serviceUrl: string;
        if (service.slug && serviceCatSlug) {
          serviceUrl = `${SITE_URL}/services/${serviceCatSlug}/${service.slug}`;
        } else {
          serviceUrl = `${SITE_URL}/book`;
        }

        t = perf.now();
        let shortServiceUrl = serviceUrl;
        try { shortServiceUrl = await createShortLink(serviceUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `Learn more about ${service.name} at ${biz.name}: ${shortServiceUrl}`;
        contextId = service.id;
        break;
      }

      case 'booking_link': {
        let bookingUrl = `${SITE_URL}/book`;
        if (identifier) {
          bookingUrl = `${SITE_URL}/book?service=${encodeURIComponent(identifier)}`;
        }

        t = perf.now();
        let shortBookingUrl = bookingUrl;
        try { shortBookingUrl = await createShortLink(bookingUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `Book your appointment at ${biz.name}: ${shortBookingUrl}`;
        break;
      }

      case 'quote_link': {
        // Find the most recent actionable quote for this phone number
        t = perf.now();
        const { data: quote } = await admin
          .from('quotes')
          .select('id, quote_number, access_token, customer_id')
          .eq('customer_id', customer?.id || '')
          .is('deleted_at', null)
          .in('status', ['sent', 'viewed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // If no match via customer_id, try via phone join
        let quoteRecord = quote;
        if (!quoteRecord) {
          const { data: custByPhone } = await admin
            .from('customers')
            .select('id')
            .eq('phone', normalizedPhone)
            .is('deleted_at', null);

          if (custByPhone && custByPhone.length > 0) {
            const custIds = custByPhone.map(c => c.id);
            const { data: phoneQuote } = await admin
              .from('quotes')
              .select('id, quote_number, access_token, customer_id')
              .in('customer_id', custIds)
              .is('deleted_at', null)
              .in('status', ['sent', 'viewed'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            quoteRecord = phoneQuote;
          }
        }
        perf.mark('query:quotes_find', t);

        if (!quoteRecord || !quoteRecord.access_token) {
          return NextResponse.json(
            { error: 'No recent quote found for this number' },
            { status: 400 }
          );
        }

        const quoteUrl = `${SITE_URL}/quote/${quoteRecord.access_token}`;
        t = perf.now();
        let shortQuoteUrl = quoteUrl;
        try { shortQuoteUrl = await createShortLink(quoteUrl); } catch { /* use full */ }
        perf.mark('fetch:createShortLink', t);

        smsBody = `View your ${biz.name} quote: ${shortQuoteUrl}`;
        contextId = quoteRecord.id;
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid info type' }, { status: 400 });
    }

    // Send SMS with conversation logging
    t = perf.now();
    const smsResult = await sendSms(normalizedPhone, smsBody, {
      logToConversation: true,
      customerId,
      notificationType: `voice_info_${infoType}`,
      contextId,
    });
    perf.mark('fetch:sendSms', t);

    if (!smsResult.success) {
      console.error(`[SendInfoSMS] SMS failed for ${infoType}:`, smsResult.error);
      return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
    }

    console.log(`[SendInfoSMS] Sent ${infoType} SMS to ${normalizedPhone}`);

    const responseData = { success: true, type: infoType };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[SendInfoSMS] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
