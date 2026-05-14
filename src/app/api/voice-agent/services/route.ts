import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';
import { fromCents } from '@/lib/utils/money';
import { formatMoney } from '@/lib/utils/format';

/**
 * GET /api/voice-agent/services
 *
 * Full service catalog with pricing, addon suggestions, prerequisites,
 * vehicle compatibility, and classification. Used for service inquiries,
 * pricing quotes, and upselling.
 *
 * Target response size: ~18KB for 29 services.
 */
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/services');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Query 1: Services with pricing tiers
    let t = perf.now();
    const { data: services, error } = await supabase
      .from('services')
      .select(`
        id,
        name,
        description,
        classification,
        pricing_model,
        flat_price_cents,
        sale_price_cents,
        sale_starts_at,
        sale_ends_at,
        per_unit_price_cents,
        per_unit_label,
        per_unit_max,
        custom_starting_price_cents,
        base_duration_minutes,
        mobile_eligible,
        vehicle_compatibility,
        special_requirements,
        service_categories ( name ),
        service_pricing ( tier_name, price_cents, sale_price_cents )
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    perf.mark('query:services', t);

    if (error) {
      console.error('Voice agent services query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch services' },
        { status: 500 }
      );
    }

    const serviceList = services ?? [];
    const serviceIds = serviceList.map((s) => s.id);

    // Query 2: Addon suggestions (auto_suggest only) with addon service details
    t = perf.now();
    const { data: addonRows } = await supabase
      .from('service_addon_suggestions')
      .select(`
        primary_service_id,
        addon_service_id,
        combo_price,
        is_seasonal,
        seasonal_start,
        seasonal_end,
        addon_service:services!service_addon_suggestions_addon_service_id_fkey (
          id, name, flat_price_cents, pricing_model, per_unit_price_cents, custom_starting_price_cents
        )
      `)
      .eq('auto_suggest', true)
      .in('primary_service_id', serviceIds)
      .order('display_order', { ascending: true });
    perf.mark('query:addon_suggestions', t);

    // Query 3: Prerequisites with prerequisite service names
    t = perf.now();
    const { data: prereqRows } = await supabase
      .from('service_prerequisites')
      .select(`
        service_id,
        enforcement,
        prerequisite_service:services!service_prerequisites_prerequisite_service_id_fkey (
          name
        )
      `)
      .in('service_id', serviceIds);
    perf.mark('query:prerequisites', t);

    // Build lookup maps
    const now = new Date();
    const addonMap = new Map<string, Array<{ addon_name: string; addon_id: string; standard_price: number | null; combo_price: number | null; savings: number | null }>>();

    for (const row of addonRows ?? []) {
      // Filter seasonal addons not in season
      if (row.is_seasonal) {
        const start = row.seasonal_start ? new Date(row.seasonal_start) : null;
        const end = row.seasonal_end ? new Date(row.seasonal_end) : null;
        if (start && now < start) continue;
        if (end && now > end) continue;
      }

      const addon = row.addon_service as unknown as {
        id: string;
        name: string;
        flat_price_cents: number | null;
        pricing_model: string;
        per_unit_price_cents: number | null;
        custom_starting_price_cents: number | null;
      } | null;
      if (!addon) continue;

      // Derive standard price from addon's pricing model. Voice agent wire
      // contract is dollars (LLM reads "$X" naturally); convert cents → dollars
      // at this output boundary.
      let standardPrice: number | null = null;
      if (addon.pricing_model === 'flat' && addon.flat_price_cents != null) {
        standardPrice = fromCents(addon.flat_price_cents);
      } else if (addon.pricing_model === 'per_unit' && addon.per_unit_price_cents != null) {
        standardPrice = fromCents(addon.per_unit_price_cents);
      } else if (addon.pricing_model === 'custom' && addon.custom_starting_price_cents != null) {
        standardPrice = fromCents(addon.custom_starting_price_cents);
      }

      const comboPrice = row.combo_price != null ? Number(row.combo_price) : null;
      const savings = standardPrice != null && comboPrice != null
        ? Math.round((standardPrice - comboPrice) * 100) / 100
        : null;

      const primaryId = row.primary_service_id as string;
      const entry = { addon_name: addon.name, addon_id: addon.id, standard_price: standardPrice, combo_price: comboPrice, savings };
      const existing = addonMap.get(primaryId);
      if (existing) existing.push(entry);
      else addonMap.set(primaryId, [entry]);
    }

    const prereqMap = new Map<string, Array<{ service_name: string; enforcement: string }>>();
    for (const row of prereqRows ?? []) {
      const prereqService = row.prerequisite_service as unknown as { name: string } | null;
      if (!prereqService) continue;
      const serviceId = row.service_id as string;
      const entry = { service_name: prereqService.name, enforcement: row.enforcement as string };
      const existing = prereqMap.get(serviceId);
      if (existing) existing.push(entry);
      else prereqMap.set(serviceId, [entry]);
    }

    // Format response
    const formatted = serviceList.map((s) => {
      const tiers = (s.service_pricing as { tier_name: string; price_cents: number; sale_price_cents: number | null }[]) ?? [];
      const saleWindow = { sale_starts_at: s.sale_starts_at as string | null, sale_ends_at: s.sale_ends_at as string | null };
      const { isOnSale } = getSaleStatus(saleWindow);

      // Build pricing array based on pricing_model.
      // Phase Money-Unify-3 wire contract: voice agent output keys are
      // `*_dollars`-suffixed (was: bare `price`, misleadingly-named
      // `sale_price_cents` that held dollars). The ElevenLabs system
      // prompt does NOT use template-variable substitution (the agent
      // reads the JSON shape contextually — see docs/dev/VOICE_AGENT.md
      // §2 "System Prompt"), so renaming output keys is non-coordinated
      // and preserves agent behavior. The rename eliminates the "field
      // named `_cents` but holds dollars" canonical-model violation that
      // would otherwise be the lone exception in the codebase.
      let pricing: Array<{ tier_name: string; price_dollars: number | null; sale_price_dollars?: number | null; note?: string }>;

      switch (s.pricing_model) {
        case 'vehicle_size':
        case 'scope':
        case 'specialty':
          pricing = tiers.map((p) => ({
            tier_name: p.tier_name,
            price_dollars: fromCents(p.price_cents),
            ...(isOnSale && p.sale_price_cents != null && p.sale_price_cents < p.price_cents
              ? { sale_price_dollars: fromCents(p.sale_price_cents) }
              : {}),
          }));
          break;

        case 'flat': {
          const flatSalePrice = s.sale_price_cents as number | null;
          const flatPrice = s.flat_price_cents as number | null;
          pricing = flatPrice != null
            ? [{
                tier_name: 'flat',
                price_dollars: fromCents(flatPrice),
                ...(isOnSale && flatSalePrice != null && flatSalePrice < flatPrice
                  ? { sale_price_dollars: fromCents(flatSalePrice) }
                  : {}),
              }]
            : [{ tier_name: 'flat', price_dollars: null, note: 'Contact for pricing' }];
          break;
        }

        case 'per_unit':
          pricing = s.per_unit_price_cents != null
            ? [{
                tier_name: 'per_unit',
                price_dollars: fromCents(s.per_unit_price_cents as number),
                note: `Per ${s.per_unit_label || 'unit'}${s.per_unit_max ? ` (max ${s.per_unit_max})` : ''}`,
              }]
            : [{ tier_name: 'per_unit', price_dollars: null, note: 'Contact for pricing' }];
          break;

        case 'custom':
          pricing = [{
            tier_name: 'custom',
            price_dollars: s.custom_starting_price_cents != null ? fromCents(s.custom_starting_price_cents as number) : null,
            note: s.custom_starting_price_cents != null
              ? `Starting at ${formatMoney(s.custom_starting_price_cents as number)} — custom quote required`
              : 'Custom quote required — contact for pricing',
          }];
          break;

        default:
          pricing = tiers.map((p) => ({
            tier_name: p.tier_name,
            price_dollars: fromCents(p.price_cents),
            ...(isOnSale && p.sale_price_cents != null && p.sale_price_cents < p.price_cents
              ? { sale_price_dollars: fromCents(p.sale_price_cents) }
              : {}),
          }));
      }

      const addons = addonMap.get(s.id) ?? null;
      const prerequisites = prereqMap.get(s.id) ?? null;

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        category: (s.service_categories as unknown as { name: string } | null)?.name ?? null,
        classification: s.classification,
        duration_minutes: s.base_duration_minutes,
        pricing_model: s.pricing_model,
        mobile_eligible: s.mobile_eligible,
        vehicle_compatibility: s.vehicle_compatibility ?? [],
        special_requirements: s.special_requirements ?? null,
        pricing,
        addon_suggestions: addons,
        prerequisites,
      };
    });

    const responseData = { services: formatted };
    const responseBody = JSON.stringify(responseData);
    console.log(`[VoiceAgent] Services response: ${formatted.length} services, ${(responseBody.length / 1024).toFixed(1)}KB`);

    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Voice agent services error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
