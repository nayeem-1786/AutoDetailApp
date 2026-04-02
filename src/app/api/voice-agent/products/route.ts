import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import { getSaleStatus } from '@/lib/utils/sale-pricing';

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

    const formatted = (products ?? []).map((p) => {
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
