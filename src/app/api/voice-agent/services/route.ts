import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
import { resolvePrice, type ResolvedService } from '@/lib/services/service-resolver';
import { VEHICLE_SIZE_CLASS_KEYS } from '@/lib/utils/constants';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

const VEHICLE_SIZE_CLASS_SET = new Set<string>(VEHICLE_SIZE_CLASS_KEYS);

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

    // Optional `size_class` query parameter (Issue 33 Layer 2): when
    // provided and valid, size-aware addons (`pricing_model in
    // ('vehicle_size', 'scope')`) get a concrete `standard_price` +
    // `savings` instead of the legacy `null`. Invalid values are
    // silently ignored so the response stays backward-compatible.
    const sizeClassParam = request.nextUrl.searchParams.get('size_class');
    const sizeClass: VehicleSizeClass | null =
      sizeClassParam && VEHICLE_SIZE_CLASS_SET.has(sizeClassParam)
        ? (sizeClassParam as VehicleSizeClass)
        : null;

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
        flat_price,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        per_unit_price,
        per_unit_label,
        per_unit_max,
        custom_starting_price,
        base_duration_minutes,
        mobile_eligible,
        vehicle_compatibility,
        special_requirements,
        service_categories ( name ),
        service_pricing (
          id, service_id, tier_name, tier_label, price, sale_price, display_order,
          is_vehicle_size_aware,
          vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price,
          vehicle_size_exotic_price, vehicle_size_classic_price,
          max_qty, qty_label, created_at
        )
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
          id, name, flat_price, pricing_model, per_unit_price, custom_starting_price,
          sale_price, sale_starts_at, sale_ends_at,
          service_pricing (
            id, service_id, tier_name, tier_label, price, sale_price, display_order,
            is_vehicle_size_aware,
            vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price,
            vehicle_size_exotic_price, vehicle_size_classic_price,
            max_qty, qty_label, created_at
          )
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
        flat_price: number | null;
        pricing_model: string;
        per_unit_price: number | null;
        custom_starting_price: number | null;
        sale_price: number | null;
        sale_starts_at: string | null;
        sale_ends_at: string | null;
        service_pricing: ServicePricing[] | null;
      } | null;
      if (!addon) continue;

      // Derive standard price from addon's pricing model
      let standardPrice: number | null = null;
      if (addon.pricing_model === 'flat' && addon.flat_price != null) {
        standardPrice = Number(addon.flat_price);
      } else if (addon.pricing_model === 'per_unit' && addon.per_unit_price != null) {
        standardPrice = Number(addon.per_unit_price);
      } else if (addon.pricing_model === 'custom' && addon.custom_starting_price != null) {
        standardPrice = Number(addon.custom_starting_price);
      } else if (
        sizeClass &&
        (addon.pricing_model === 'vehicle_size' || addon.pricing_model === 'scope')
      ) {
        // Issue 33 Layer 2: size-aware addons resolve their standalone
        // price through the canonical engine via `resolvePrice` (per
        // CLAUDE.md Rule 22). Without `size_class` from the caller this
        // branch is skipped — preserving the legacy `null` return so
        // existing callers stay backward-compatible.
        const addonAsResolved: ResolvedService = {
          id: addon.id,
          name: addon.name,
          pricing_model: addon.pricing_model,
          flat_price: addon.flat_price,
          per_unit_price: addon.per_unit_price,
          custom_starting_price: addon.custom_starting_price,
          sale_price: addon.sale_price,
          sale_starts_at: addon.sale_starts_at,
          sale_ends_at: addon.sale_ends_at,
          service_pricing: addon.service_pricing ?? [],
        };
        const resolved = resolvePrice(addonAsResolved, sizeClass);
        standardPrice = resolved.price;
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

    // Item 15f Layer 4: pricing-array construction routes through
    // `resolveServicePriceWithSale` from the canonical engine per
    // CLAUDE.md Rule 22. Pre-Layer-4 the switch had inline sale-price
    // comparisons against `tier.price` / `service.flat_price` / etc. —
    // the same drift class Layer 3d fixed. Per-tier emission is
    // preserved (the voice agent's catalog response is a list of
    // configured tiers, not a per-vehicle resolved quote — the
    // per-vehicle dispatch lives in `service-resolver.ts:resolvePrice`
    // which already routes through the engine).
    //
    // Synthesize a `ServicePricing` row for `flat` / `per_unit` /
    // `custom` (services with no `service_pricing` row) so they can be
    // fed to the engine through the same path.
    function synthesizeForVoice(
      serviceId: string,
      tierName: string,
      amount: number,
      salePrice: number | null,
    ): ServicePricing {
      return {
        id: `synthetic-${tierName}-${serviceId}`,
        service_id: serviceId,
        tier_name: tierName,
        tier_label: null,
        price: amount,
        sale_price: salePrice,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        vehicle_size_exotic_price: null,
        vehicle_size_classic_price: null,
        max_qty: null,
        qty_label: null,
        created_at: '',
      };
    }

    // Format response
    const formatted = serviceList.map((s) => {
      const tiers = (s.service_pricing as ServicePricing[]) ?? [];
      const saleWindow = { sale_starts_at: s.sale_starts_at as string | null, sale_ends_at: s.sale_ends_at as string | null };

      // Build pricing array based on pricing_model. Each case body calls
      // `resolveServicePriceWithSale` directly so the canonical-engine
      // delegation is statically visible (Item 15f Layer 4 ESLint rule
      // looks for the engine call inside the switch body).
      let pricing: Array<{ tier_name: string; price: number | null; sale_price?: number | null; note?: string }>;

      switch (s.pricing_model) {
        case 'vehicle_size':
        case 'scope':
        case 'specialty':
          pricing = tiers.map((p) => {
            // Issue 36 D41 (2026-05-24): pass `sizeClass` so size-aware
            // tiers resolve to their per-size column value (e.g., Hot
            // Shampoo Extraction "complete" returns $450 for
            // suv_3row_van, not the $300 fallback). Pre-D41 this passed
            // `null`, silently disabling size-aware resolution for main
            // tiers even when size_class arrived at the endpoint.
            // Non-size-aware tiers (is_vehicle_size_aware=false) are
            // unaffected — engine short-circuits to pricing.price.
            // Audit: docs/dev/ISSUE_36_LAYER_2_PHASE_B_DIAGNOSTIC.md.
            const r = resolveServicePriceWithSale(p, sizeClass, saleWindow);
            return {
              tier_name: p.tier_name,
              price: r.standardPrice,
              ...(r.isOnSale ? { sale_price: r.effectivePrice } : {}),
            };
          });
          break;

        case 'flat': {
          const flatPrice = s.flat_price as number | null;
          if (flatPrice == null) {
            pricing = [{ tier_name: 'flat', price: null, note: 'Contact for pricing' }];
          } else {
            const synthetic = synthesizeForVoice(s.id as string, 'flat', flatPrice, (s.sale_price as number | null) ?? null);
            const r = resolveServicePriceWithSale(synthetic, null, saleWindow);
            pricing = [{
              tier_name: synthetic.tier_name,
              price: r.standardPrice,
              ...(r.isOnSale ? { sale_price: r.effectivePrice } : {}),
            }];
          }
          break;
        }

        case 'per_unit': {
          const unitPrice = s.per_unit_price as number | null;
          if (unitPrice == null) {
            pricing = [{ tier_name: 'per_unit', price: null, note: 'Contact for pricing' }];
          } else {
            const synthetic = synthesizeForVoice(s.id as string, 'per_unit', unitPrice, (s.sale_price as number | null) ?? null);
            const r = resolveServicePriceWithSale(synthetic, null, saleWindow);
            pricing = [{
              tier_name: synthetic.tier_name,
              price: r.standardPrice,
              ...(r.isOnSale ? { sale_price: r.effectivePrice } : {}),
              note: `Per ${s.per_unit_label || 'unit'}${s.per_unit_max ? ` (max ${s.per_unit_max})` : ''}`,
            }];
          }
          break;
        }

        case 'custom':
          // Custom services are operator-assessed — `custom_starting_price`
          // is a reference value; no sale logic applies. Engine not
          // invoked here.
          pricing = [{
            tier_name: 'custom',
            price: s.custom_starting_price != null ? Number(s.custom_starting_price) : null,
            note: s.custom_starting_price != null
              ? `Starting at $${Number(s.custom_starting_price)} — custom quote required`
              : 'Custom quote required — contact for pricing',
          }];
          break;

        default:
          // Issue 36 D41 (2026-05-24): mirrors the explicit case above so
          // any future pricing_model that lands without a switch case
          // update inherits the correct size-aware behavior.
          pricing = tiers.map((p) => {
            const r = resolveServicePriceWithSale(p, sizeClass, saleWindow);
            return {
              tier_name: p.tier_name,
              price: r.standardPrice,
              ...(r.isOnSale ? { sale_price: r.effectivePrice } : {}),
            };
          });
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
