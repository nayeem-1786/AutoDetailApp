import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/services');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const supabase = createAdminClient();

    const t = perf.now();
    const { data: services, error } = await supabase
      .from('services')
      .select(`
        id,
        name,
        description,
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
        service_categories ( name ),
        service_pricing ( tier_name, price, sale_price )
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

    const formatted = (services ?? []).map((s) => {
      const tiers = (s.service_pricing as { tier_name: string; price: number; sale_price: number | null }[]) ?? [];
      const saleWindow = { sale_starts_at: s.sale_starts_at as string | null, sale_ends_at: s.sale_ends_at as string | null };
      const { isOnSale } = getSaleStatus(saleWindow);

      // Build pricing array based on pricing_model
      let pricing: Array<{ tier_name: string; price: number | null; sale_price?: number | null; note?: string }>;

      switch (s.pricing_model) {
        case 'vehicle_size':
        case 'scope':
        case 'specialty':
          // Tiered pricing — use service_pricing rows
          pricing = tiers.map((p) => ({
            tier_name: p.tier_name,
            price: Number(p.price),
            ...(isOnSale && p.sale_price != null && p.sale_price < p.price
              ? { sale_price: Number(p.sale_price) }
              : {}),
          }));
          break;

        case 'flat': {
          const flatSalePrice = s.sale_price as number | null;
          const flatPrice = s.flat_price as number | null;
          pricing = flatPrice != null
            ? [{
                tier_name: 'flat',
                price: Number(flatPrice),
                ...(isOnSale && flatSalePrice != null && flatSalePrice < flatPrice
                  ? { sale_price: Number(flatSalePrice) }
                  : {}),
              }]
            : [{ tier_name: 'flat', price: null, note: 'Contact for pricing' }];
          break;
        }

        case 'per_unit':
          pricing = s.per_unit_price != null
            ? [{
                tier_name: 'per_unit',
                price: Number(s.per_unit_price),
                note: `Per ${s.per_unit_label || 'unit'}${s.per_unit_max ? ` (max ${s.per_unit_max})` : ''}`,
              }]
            : [{ tier_name: 'per_unit', price: null, note: 'Contact for pricing' }];
          break;

        case 'custom':
          pricing = [{
            tier_name: 'custom',
            price: s.custom_starting_price != null ? Number(s.custom_starting_price) : null,
            note: s.custom_starting_price != null
              ? `Starting at $${Number(s.custom_starting_price)} — custom quote required`
              : 'Custom quote required — contact for pricing',
          }];
          break;

        default:
          pricing = tiers.map((p) => ({
            tier_name: p.tier_name,
            price: Number(p.price),
            ...(isOnSale && p.sale_price != null && p.sale_price < p.price
              ? { sale_price: Number(p.sale_price) }
              : {}),
          }));
      }

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        category: (s.service_categories as unknown as { name: string } | null)?.name ?? null,
        duration_minutes: s.base_duration_minutes,
        pricing_model: s.pricing_model,
        mobile_eligible: s.mobile_eligible,
        pricing,
      };
    });

    const responseData = { services: formatted };
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
