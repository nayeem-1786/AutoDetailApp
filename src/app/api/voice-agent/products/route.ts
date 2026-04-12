import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

/**
 * GET /api/voice-agent/products
 *
 * Lightweight product catalog browse. Returns ALL active products with minimal
 * fields for the voice agent to answer "what do you carry?" questions.
 * For detailed product info, use /api/voice-agent/products/details?search=...
 *
 * Target response size: ~38KB for ~300 deduped products.
 */
export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/products');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const supabase = createAdminClient();

    const t = perf.now();
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        retail_price,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        quantity_on_hand,
        variant_label,
        product_group_id,
        product_categories ( name )
      `)
      .eq('is_active', true)
      .order('name', { ascending: true });
    perf.mark('query:products', t);

    if (error) {
      console.error('Voice agent products query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    const allProducts = products ?? [];

    // Build variant group index for O(n) grouping
    const groupMap = new Map<string, typeof allProducts>();
    for (const p of allProducts) {
      const gid = p.product_group_id as string | null;
      if (gid) {
        const group = groupMap.get(gid);
        if (group) group.push(p);
        else groupMap.set(gid, [p]);
      }
    }

    // Deduplicate variant groups — keep only the cheapest (primary) product per group
    const skipIds = new Set<string>();
    for (const [, members] of groupMap) {
      if (members.length > 1) {
        const sorted = [...members].sort((a, b) => Number(a.retail_price) - Number(b.retail_price));
        for (let i = 1; i < sorted.length; i++) {
          skipIds.add(sorted[i].id);
        }
      }
    }

    const productsToReturn = allProducts.filter((p) => !skipIds.has(p.id));

    const formatted = productsToReturn.map((p) => {
      const saleWindow = {
        sale_starts_at: p.sale_starts_at as string | null,
        sale_ends_at: p.sale_ends_at as string | null,
      };
      const { isOnSale } = getSaleStatus(saleWindow);
      const retailPrice = Number(p.retail_price);
      const salePrice = p.sale_price != null ? Number(p.sale_price) : null;
      const isActiveSale = isOnSale && salePrice != null && salePrice < retailPrice;

      const cat = p.product_categories as unknown as { name: string } | null;

      // Build compact variant summary
      const gid = p.product_group_id as string | null;
      const groupMembers = gid ? groupMap.get(gid) : undefined;
      let variantSummary: string | null = null;
      if (groupMembers && groupMembers.length > 1) {
        const others = groupMembers
          .filter((m) => m.id !== p.id)
          .map((m) => {
            const label = m.variant_label || m.name;
            return `${label} ($${Number(m.retail_price).toFixed(2)})`;
          });
        if (others.length > 0) {
          variantSummary = `Also in: ${others.join(', ')}`;
        }
      }

      return {
        name: p.name,
        category: cat?.name ?? null,
        price: retailPrice,
        on_sale: isActiveSale,
        in_stock: (p.quantity_on_hand as number) > 0,
        variants: variantSummary,
      };
    });

    const responseData = { products: formatted };
    const responseBody = JSON.stringify(responseData);
    console.log(`[VoiceAgent] Products browse: ${formatted.length} products, ${(responseBody.length / 1024).toFixed(1)}KB`);

    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('Voice agent products error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
