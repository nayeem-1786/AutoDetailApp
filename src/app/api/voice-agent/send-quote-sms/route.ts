import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName, resolvePrice } from '@/lib/services/service-resolver';
import { applyCombosToQuoteItems } from '@/lib/services/combo-resolver';
import { getBusinessInfo } from '@/lib/data/business';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import {
  formatServicesSummary,
  type ServicesSummaryItem,
} from '@/lib/quotes/services-summary';

/**
 * Issue 38 D43 — stable idempotency comparison key for a quote's line items.
 *
 * The D36 60-second guard previously compared only the sorted set of
 * `service_id`s. With tier + quantity now part of the quote contract, two
 * quotes for the same services but DIFFERENT tiers or quantities are
 * meaningfully distinct (the agent legitimately re-quoted at a different
 * tier/count) and must NOT collapse into one. This key therefore compares the
 * `(service_id, tier_name, quantity)` TRIPLE per item.
 *
 * Backward compatibility: a legacy item with a null `tier_name` collapses to
 * `''` and a missing `quantity` collapses to `1` — exactly the shape of the
 * rows pre-D43 callers wrote — so the guard still fires for legacy
 * "no tiers/quantities" re-sends. A `|` separates the triple fields; the
 * value domains (UUID `service_id`, snake_case `tier_name`, integer
 * `quantity`) never contain a `|`, so fields cannot bleed across boundaries.
 */
function buildItemTripleKey(
  items: Array<{ service_id: string | null; tier_name?: string | null; quantity?: number | null }>,
): string {
  const triples = items
    .filter((it) => typeof it.service_id === 'string' && it.service_id.length > 0)
    .map((it) => `${it.service_id}|${it.tier_name ?? ''}|${it.quantity ?? 1}`)
    .sort();
  return JSON.stringify(triples);
}

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
      tiers,
      quantities,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      source,
    } = body as {
      phone: string;
      customer_name?: string;
      services: string; // comma-separated
      tiers?: string; // Issue 38 D43 — comma-separated tier_name values parallel to services
      quantities?: string; // Issue 38 D43 — comma-separated positive integers parallel to services
      vehicle_year?: number;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      // Issue 46 refinement (2026-05-26) — originating agent path. Set
      // to 'sms_agent' by the SMS-AI v2 dispatcher
      // (src/lib/sms-ai/tool-dispatcher.ts callSendQuoteSms); omitted by
      // the ElevenLabs voice-agent webhook caller, in which case the
      // route defaults to 'voice_quote_sent' for backward-compat with
      // pre-refinement audit history.
      source?: 'sms_agent' | 'voice_agent';
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

    // Issue 38 D43 — parse the optional parallel `tiers` + `quantities` CSVs.
    // Both are positional: token N corresponds to serviceNames[N]. An empty
    // tier token = "auto-pick" (legacy precedence); an empty/missing quantity
    // token defaults to 1. Arrays are padded to serviceNames.length so the
    // per-service loop can index them safely. Both params are optional, so a
    // caller that omits them gets byte-identical pre-D43 behavior.
    const tierTokens = (typeof tiers === 'string' ? tiers : '')
      .split(',')
      .map((s) => s.trim());
    const quantityTokens = (typeof quantities === 'string' ? quantities : '')
      .split(',')
      .map((s) => s.trim());
    while (tierTokens.length < serviceNames.length) tierTokens.push('');
    while (quantityTokens.length < serviceNames.length) quantityTokens.push('');

    // Validate quantities up front: each must be a positive integer. An empty
    // token defaults to 1. Reject zero, negatives, non-integers, and
    // non-canonical forms ("01", "2.0") so the agent's intent is unambiguous.
    // Hard reject with instructions_for_agent (no silent clamp) per the
    // operator-locked Issue 38 decision.
    const parsedQuantities: Array<number | null> = quantityTokens.map((q) => {
      const trimmed = q === '' ? '1' : q;
      const n = parseInt(trimmed, 10);
      if (!Number.isInteger(n) || n < 1 || String(n) !== trimmed) return null;
      return n;
    });
    if (parsedQuantities.some((q) => q === null)) {
      return NextResponse.json(
        {
          error: 'Invalid quantity',
          instructions_for_agent:
            'One or more quantities in your send_quote_sms call were not positive integers. Pass quantities as comma-separated positive integers parallel to services (e.g., quantities="2"). The default is 1 — only pass quantities when more than one unit was discussed with the customer. Do NOT inform the customer about this error — fix the call and retry.',
          do_not_share_with_customer: true,
        },
        { status: 400 },
      );
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

    // Resolve services to quote items (sale-aware via resolvePrice).
    let quoteItems: Array<{
      service_id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      tier_name: string | null;
      standard_price: number | null;
      pricing_type: 'standard' | 'sale' | 'combo' | null;
    }> = [];

    // D45 (Issue 39): per-(service_id, tier_name) display meta captured
    // during the resolution loop and used to enrich items for the
    // post-create chip composer. Kept as a parallel map so the
    // `quoteItems` shape passed into `createQuote` /
    // `applyCombosToQuoteItems` stays unchanged (those callees ignore
    // unknown fields at runtime but TS would lose them through
    // ResolvedQuoteItem[]'s return type). `resolveServiceByName` already
    // loads `services.pricing_model` and the full `service_pricing` rows
    // so no extra DB round-trip is needed at this site.
    type TierMeta = {
      service_pricing_model: string | null;
      tier_label: string | null;
      qty_label: string | null;
      display_order: number | null;
    };
    const tierMetaByItem = new Map<string, TierMeta>();
    const tierMetaKey = (serviceId: string, tierName: string | null) =>
      `${serviceId}::${tierName ?? ''}`;

    t = perf.now();
    for (let i = 0; i < serviceNames.length; i++) {
      const serviceName = serviceNames[i];
      const service = await resolveServiceByName(admin, serviceName);
      if (!service) {
        console.warn(`[SendQuoteSMS] Service not found: "${serviceName}"`);
        continue;
      }

      // Issue 38 D43 — explicit tier intent (empty token = auto-pick) and
      // per-item quantity (validated as a positive integer above).
      const requestedTier = tierTokens[i] || '';
      const quantity = parsedQuantities[i] ?? 1;

      // When the agent supplied a tier_name, opt into the resolver's
      // fail-loud overload: a non-matching tier returns null (typo /
      // hallucination / deleted tier) so we reject and let the agent
      // re-check the tier from get_services. When no tier is supplied, the
      // legacy auto-pick precedence runs and never returns null.
      const resolved = requestedTier
        ? resolvePrice(service, sizeClass, { tierName: requestedTier })
        : resolvePrice(service, sizeClass);

      if (resolved === null) {
        const availableTiers = (service.service_pricing ?? [])
          .map((tp) => tp.tier_name)
          .filter(Boolean)
          .join(', ');
        console.warn(
          `[SendQuoteSMS] Tier not found: "${requestedTier}" on "${service.name}" (available: ${availableTiers || 'none'})`,
        );
        return NextResponse.json(
          {
            error: 'Tier not found',
            instructions_for_agent: `The tier "${requestedTier}" was not found on service "${service.name}". Available tiers: ${availableTiers || '(none configured)'}. Re-check the tier_name from get_services (pass it verbatim) and retry. Do NOT inform the customer about this — silently retry with the correct tier.`,
            do_not_share_with_customer: true,
          },
          { status: 400 },
        );
      }

      const { price, salePrice, tierName, isOnSale } = resolved;

      // Issue 38 D43 — quantity bound check. Only meaningful when the resolved
      // tier exists in service_pricing AND carries a max_qty (e.g. per_row has
      // max_qty=3). flat/per_unit/custom resolve with a null tierName and have
      // no service_pricing row to bound against, so their quantity passes
      // through honored.
      if (quantity > 1 && tierName) {
        const chosenTier = (service.service_pricing ?? []).find(
          (tp) => tp.tier_name === tierName,
        );
        if (chosenTier && chosenTier.max_qty != null && quantity > chosenTier.max_qty) {
          const qtyLabel = chosenTier.qty_label || 'unit';
          console.warn(
            `[SendQuoteSMS] Quantity ${quantity} exceeds max_qty ${chosenTier.max_qty} for tier "${tierName}" on "${service.name}"`,
          );
          return NextResponse.json(
            {
              error: 'Quantity exceeds maximum',
              instructions_for_agent: `The tier "${tierName}" on "${service.name}" supports a maximum of ${chosenTier.max_qty} ${qtyLabel}(s). You attempted to quote ${quantity}. Clarify the count with the customer (most vehicles have ${chosenTier.max_qty} or fewer) and retry. Do NOT inform the customer about this error — clarify naturally.`,
              do_not_share_with_customer: true,
            },
            { status: 400 },
          );
        }
      }

      // D45 — capture chosen tier's display meta in the parallel map
      // for the post-create chip composer. service.service_pricing was
      // loaded by resolveServiceByName.
      const chosenTierRow = tierName
        ? (service.service_pricing ?? []).find((tp) => tp.tier_name === tierName)
        : null;
      tierMetaByItem.set(tierMetaKey(service.id, tierName), {
        service_pricing_model: service.pricing_model ?? null,
        tier_label: chosenTierRow?.tier_label ?? null,
        qty_label: chosenTierRow?.qty_label ?? null,
        display_order: chosenTierRow?.display_order ?? null,
      });

      quoteItems.push({
        service_id: service.id,
        item_name: service.name,
        quantity,
        unit_price: isOnSale ? salePrice! : price,
        tier_name: tierName,
        standard_price: isOnSale ? price : null,
        pricing_type: isOnSale ? 'sale' : 'standard',
      });
    }
    perf.mark('resolve:services_batch', t);

    // Issue 33 Layer 1: apply combo pricing across the resolved item set.
    // When both the anchor and an addon are in the quote, the addon's
    // unit_price is rewritten to the combo_price from
    // `service_addon_suggestions`. Mirrors POS reducer "lowest wins".
    t = perf.now();
    quoteItems = await applyCombosToQuoteItems(admin, quoteItems);
    perf.mark('resolve:combos', t);

    if (quoteItems.length === 0) {
      return NextResponse.json(
        { error: 'None of the specified services were found' },
        { status: 400 }
      );
    }

    // 60-second idempotency guard (Workstream J Session 4 — D36, Issue 31;
    // extended for tier+quantity in Issue 38 D43 Session C).
    // Same customer + same vehicle + same (service_id, tier_name, quantity)
    // set within 60 seconds returns the existing quote instead of creating a
    // duplicate. Catches the
    // intermittent double-send from LLM confabulation observed in Test 1
    // (2026-05-23) without overreaching into multi-day duplicate detection
    // (Issue 30 / Workstream I scope).
    //
    // Position: AFTER customer/vehicle/service resolution (so we can compare
    // against the actual computed service_id set) and BEFORE createQuote.
    // Match window: 60 seconds. Match scope: status in ('sent', 'viewed') —
    // never block on drafts (incomplete), accepted (already converted), or
    // expired/converted (lifecycle-terminal).
    //
    // Failure mode: wrapped in try/catch — if the dedup query errors, fall
    // through to normal create flow. A dedup-check failure must not block a
    // legitimate quote.
    try {
      // Issue 38 D43 — compare the (service_id, tier_name, quantity) TRIPLE
      // per item, not just the service_id set. Two quotes for the same
      // services at different tiers/quantities are legitimately distinct and
      // must NOT collapse into one dedup hit. buildItemTripleKey collapses
      // legacy null-tier / quantity-1 rows to the pre-D43 shape so dedup
      // still fires for legacy "no tiers/quantities" re-sends.
      const candidateKey = buildItemTripleKey(quoteItems);
      const candidateHasItems = quoteItems.some(
        (qi) => typeof qi.service_id === 'string' && qi.service_id.length > 0,
      );

      if (candidateHasItems) {
        t = perf.now();
        const dedupQuery = admin
          .from('quotes')
          .select(`
            id,
            quote_number,
            access_token,
            created_at,
            quote_items ( service_id, tier_name, quantity )
          `)
          .eq('customer_id', customerId)
          .in('status', ['sent', 'viewed'])
          .gte(
            'created_at',
            new Date(Date.now() - 60_000).toISOString(),
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5);

        // vehicle_id filter must be an explicit IS NULL when undefined —
        // PostgREST treats .eq(col, null) differently from .is(col, null).
        const dedupResult = vehicleId
          ? await dedupQuery.eq('vehicle_id', vehicleId)
          : await dedupQuery.is('vehicle_id', null);
        perf.mark('query:idempotency_check', t);

        const recentQuotes = (dedupResult.data ?? []) as Array<{
          id: string;
          quote_number: string;
          access_token: string | null;
          created_at: string;
          quote_items: Array<{ service_id: string | null; tier_name: string | null; quantity: number | null }> | null;
        }>;

        let duplicateQuote: (typeof recentQuotes)[number] | null = null;
        for (const existing of recentQuotes) {
          if (buildItemTripleKey(existing.quote_items ?? []) === candidateKey) {
            duplicateQuote = existing;
            break;
          }
        }

        if (duplicateQuote && duplicateQuote.access_token) {
          // Reconstruct the customer-facing link from the existing quote's
          // access_token. Try to short-link for parity with the original
          // send; fall back to the full URL on failure. The customer
          // already received the SMS during the original send — we do NOT
          // re-send Twilio here.
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
          const existingQuoteUrl = `${appUrl}/quote/${duplicateQuote.access_token}`;
          let existingLinkUrl = existingQuoteUrl;
          try {
            existingLinkUrl = await createShortLink(existingQuoteUrl);
          } catch {
            /* use full URL */
          }

          const ageSec = Math.round(
            (Date.now() - new Date(duplicateQuote.created_at).getTime()) /
              1000,
          );
          console.log(
            `[SendQuoteSMS] Idempotency guard hit: returning existing Q-${duplicateQuote.quote_number} for customer=${customerId} vehicle=${vehicleId ?? 'null'} (created ${ageSec}s ago) — no new quote created, no SMS sent`,
          );

          const dedupResponse = {
            success: true as const,
            was_duplicate: true as const,
            quote_number: duplicateQuote.quote_number,
            quote_link: existingLinkUrl,
            instructions_for_agent:
              'A duplicate quote for this customer + vehicle + service set was already sent within the last 60 seconds. Do NOT inform the customer that a duplicate was prevented. Acknowledge naturally as if the quote was just sent — it was, just moments ago and the customer already received the SMS. A short reply like "Quote sent — check your texts!" is fine. Do not call send_quote_sms again this turn.',
          };
          perf.done(dedupResponse);
          return NextResponse.json(dedupResponse);
        }
      }
    } catch (dedupErr) {
      // Dedup-check failure must NOT block a legitimate quote. Log and fall
      // through to the normal create flow.
      console.error(
        '[SendQuoteSMS] Idempotency check failed (non-blocking):',
        dedupErr instanceof Error ? dedupErr.message : String(dedupErr),
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
      valid_until: validUntil,
    }, 'sms_agent');
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
    //
    // D45 (Issue 39): formatServicesSummary replaces the naive
    // `items.map(i => i.item_name).join(', ')` pattern so multi-tier
    // same-service quotes (post-D43 contract) render as e.g.
    // "Hot Shampoo Extraction (2 Rows + Floor Mats)" instead of
    // "Hot Shampoo Extraction, Hot Shampoo Extraction". For
    // non-multi-tier single-service or multi-distinct-service quotes
    // the helper is byte-identical to the prior naive join (per
    // services-summary unit tests). Per-tier display meta was captured
    // in `tierMetaByItem` during the resolution loop above; combo
    // application may have rewritten unit_price but never touches
    // service_id / tier_name / quantity, so the same key still hits.
    const summaryItems: ServicesSummaryItem[] = quoteItems.map((i) => {
      const meta = tierMetaByItem.get(tierMetaKey(i.service_id, i.tier_name));
      return {
        service_id: i.service_id,
        service_name: i.item_name,
        service_pricing_model: meta?.service_pricing_model ?? null,
        tier_name: i.tier_name,
        tier_label: meta?.tier_label ?? null,
        qty_label: meta?.qty_label ?? null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.unit_price * i.quantity,
        display_order: meta?.display_order ?? undefined,
      };
    });
    const serviceList = formatServicesSummary(summaryItems);
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
        // Issue 46 refinement: channel-aware notificationType. SMS-AI v2
        // dispatcher passes source='sms_agent'; ElevenLabs voice webhook
        // omits source (or passes 'voice_agent' explicitly) → defaults to
        // 'voice_quote_sent'. Both values are STABLE machine identifiers
        // persisted in messages.metadata for dedup (src/lib/sms/dedup.ts)
        // + audit. The Admin Messages log renders each via
        // NOTIFICATION_LABEL_OVERRIDES in
        // src/app/admin/messaging/components/message-bubble.tsx.
        notificationType: source === 'sms_agent' ? 'sms_agent_quote_sent' : 'voice_quote_sent',
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
