import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';
import type { ProductSpecs } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  const perf = createPerfTimer('GET /voice-agent/products');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const supabase = createAdminClient();
    const search = request.nextUrl.searchParams.get('search')?.trim() || '';

    const t = perf.now();
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        description,
        sku,
        retail_price,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        quantity_on_hand,
        image_url,
        specs,
        variant_label,
        product_group_id,
        product_categories ( name, slug )
      `)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, error } = await query;
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

    const formatted = allProducts.map((p) => {
      const saleWindow = {
        sale_starts_at: p.sale_starts_at as string | null,
        sale_ends_at: p.sale_ends_at as string | null,
      };
      const { isOnSale } = getSaleStatus(saleWindow);
      const retailPrice = Number(p.retail_price);
      const salePrice = p.sale_price != null ? Number(p.sale_price) : null;
      const isActiveSale = isOnSale && salePrice != null && salePrice < retailPrice;

      const cat = p.product_categories as unknown as { name: string; slug: string } | null;
      const categorySlug = cat?.slug ?? null;
      const specs = p.specs as ProductSpecs | undefined;

      // Build variant siblings (exclude self)
      const gid = p.product_group_id as string | null;
      const groupMembers = gid ? groupMap.get(gid) : undefined;
      const variantSiblings = groupMembers && groupMembers.length > 1
        ? groupMembers
            .filter((m) => m.id !== p.id)
            .map((m) => {
              const mCat = m.product_categories as unknown as { name: string; slug: string } | null;
              return {
                name: m.name,
                variant_label: m.variant_label ?? null,
                retail_price: Number(m.retail_price),
                product_url: mCat?.slug && m.slug ? `/products/${mCat.slug}/${m.slug}` : null,
              };
            })
        : null;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category: cat?.name ?? null,
        category_slug: categorySlug,
        sku: p.sku,
        retail_price: retailPrice,
        ...(isActiveSale ? { sale_price: salePrice } : {}),
        is_on_sale: isActiveSale,
        in_stock: (p.quantity_on_hand as number) > 0,
        quantity_on_hand: p.quantity_on_hand,
        product_url: categorySlug && p.slug
          ? `/products/${categorySlug}/${p.slug}`
          : null,
        image_url: p.image_url,
        overview: specs?.overview || null,
        use_case: specs?.use_case || null,
        key_features: specs?.key_features || [],
        application_method: specs?.application_method || null,
        surface_compatibility: specs?.surface_compatibility || [],
        size_volume: specs?.size_volume || null,
        dilution_ratio: specs?.dilution_ratio || null,
        coverage_yield: specs?.coverage_yield || null,
        scent: specs?.scent || null,
        pro_tips: specs?.pro_tips || null,
        variant_label: p.variant_label ?? null,
        product_group_id: gid,
        variants: variantSiblings,
      };
    });

    const responseData = { products: formatted };
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
