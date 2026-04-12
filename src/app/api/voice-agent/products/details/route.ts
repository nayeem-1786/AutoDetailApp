import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

/**
 * GET /api/voice-agent/products/details?search=ceramic+coating
 *
 * Detailed product lookup for "tell me more about X" questions.
 * Returns up to 5 matching products with full description, specs, vendor, variants.
 *
 * Target response size: ~1-6KB (1.1KB per product × max 5).
 */
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/products/details');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get('search')?.trim() || '';
    if (!search) {
      return NextResponse.json(
        { error: 'Missing required parameter: search' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const pattern = `%${search}%`;

    const t = perf.now();
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        description,
        retail_price,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        quantity_on_hand,
        variant_label,
        product_group_id,
        specs,
        product_categories ( name, slug ),
        vendors ( name )
      `)
      .eq('is_active', true)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .order('name', { ascending: true })
      .limit(5);
    perf.mark('query:products', t);

    if (error) {
      console.error('Voice agent product details query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch product details' },
        { status: 500 }
      );
    }

    const matchedProducts = products ?? [];

    // For each matched product, fetch variant siblings if part of a group
    const groupIds = [...new Set(
      matchedProducts
        .map((p) => p.product_group_id as string | null)
        .filter((gid): gid is string => !!gid)
    )];

    let variantMap = new Map<string, Array<{ name: string; variant_label: string | null; retail_price: number; sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null; quantity_on_hand: number }>>();

    if (groupIds.length > 0) {
      const t2 = perf.now();
      const { data: siblings } = await supabase
        .from('products')
        .select('id, name, variant_label, retail_price, sale_price, sale_starts_at, sale_ends_at, quantity_on_hand, product_group_id')
        .eq('is_active', true)
        .in('product_group_id', groupIds);
      perf.mark('query:variants', t2);

      if (siblings) {
        for (const s of siblings) {
          const gid = s.product_group_id as string;
          const group = variantMap.get(gid);
          if (group) group.push(s as typeof group[0]);
          else variantMap.set(gid, [s as typeof group extends undefined ? never : NonNullable<typeof group>[0]]);
        }
      }
    }

    const formatted = matchedProducts.map((p) => {
      const saleWindow = {
        sale_starts_at: p.sale_starts_at as string | null,
        sale_ends_at: p.sale_ends_at as string | null,
      };
      const { isOnSale } = getSaleStatus(saleWindow);
      const retailPrice = Number(p.retail_price);
      const salePrice = p.sale_price != null ? Number(p.sale_price) : null;
      const isActiveSale = isOnSale && salePrice != null && salePrice < retailPrice;

      const cat = p.product_categories as unknown as { name: string; slug: string } | null;
      const vendor = p.vendors as unknown as { name: string } | null;

      // Build variant array from siblings
      const gid = p.product_group_id as string | null;
      const siblings = gid ? variantMap.get(gid) : undefined;
      let variants: Array<{ label: string; price: number; sale_price: number | null; in_stock: boolean }> | null = null;

      if (siblings && siblings.length > 1) {
        variants = siblings
          .sort((a, b) => Number(a.retail_price) - Number(b.retail_price))
          .map((s) => {
            const sSaleWindow = { sale_starts_at: s.sale_starts_at, sale_ends_at: s.sale_ends_at };
            const { isOnSale: sOnSale } = getSaleStatus(sSaleWindow);
            const sp = s.sale_price != null ? Number(s.sale_price) : null;
            const rp = Number(s.retail_price);
            return {
              label: s.variant_label || s.name,
              price: rp,
              sale_price: sOnSale && sp != null && sp < rp ? sp : null,
              in_stock: s.quantity_on_hand > 0,
            };
          });
      }

      return {
        name: p.name,
        category: cat?.name ?? null,
        retail_price: retailPrice,
        sale_price: isActiveSale ? salePrice : null,
        in_stock: (p.quantity_on_hand as number) > 0,
        stock_qty: p.quantity_on_hand as number,
        description: p.description ?? null,
        specs: p.specs ?? null,
        vendor: vendor?.name ?? null,
        product_url: cat?.slug && p.slug ? `/products/${cat.slug}/${p.slug}` : null,
        variants,
      };
    });

    const responseData = { products: formatted };
    const responseBody = JSON.stringify(responseData);
    console.log(`[VoiceAgent] Product details: ${formatted.length} products, ${(responseBody.length / 1024).toFixed(1)}KB`);

    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Voice agent product details error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
