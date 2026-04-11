import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/public/products/search?q=&category=
 * Public product search — no auth required.
 * Returns up to 10 matching products with image, name, slug, category info, price.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const categorySlug = searchParams.get('category') || '';

    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const supabase = createAdminClient();
    const pattern = `%${q}%`;

    // Build query: active products visible on website, joined with active categories
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        image_url,
        retail_price,
        sale_price,
        sale_starts_at,
        sale_ends_at,
        product_categories!inner(id, name, slug)
      `)
      .eq('is_active', true)
      .eq('show_on_website', true)
      .eq('product_categories.is_active', true)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .order('name')
      .limit(10);

    // Scope to specific category if provided
    if (categorySlug) {
      query = query.eq('product_categories.slug', categorySlug);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Product search error:', error);
      return NextResponse.json({ data: [] });
    }

    // If no results from name/description, also try matching category name
    // (only when not already scoped to a category)
    let results = data ?? [];
    if (results.length === 0 && !categorySlug) {
      const { data: catResults } = await supabase
        .from('products')
        .select(`
          id,
          name,
          slug,
          image_url,
          retail_price,
          sale_price,
          sale_starts_at,
          sale_ends_at,
          product_categories!inner(id, name, slug)
        `)
        .eq('is_active', true)
        .eq('show_on_website', true)
        .eq('product_categories.is_active', true)
        .ilike('product_categories.name', pattern)
        .order('name')
        .limit(10);

      results = catResults ?? [];
    }

    // Shape response
    const shaped = results.map((p) => {
      const cat = p.product_categories as unknown as { id: string; name: string; slug: string };
      // Determine effective price (check if sale is active)
      let effectivePrice = p.retail_price;
      if (p.sale_price != null) {
        const now = new Date();
        const saleStartOk = !p.sale_starts_at || new Date(p.sale_starts_at) <= now;
        const saleEndOk = !p.sale_ends_at || new Date(p.sale_ends_at) >= now;
        if (saleStartOk && saleEndOk) {
          effectivePrice = p.sale_price;
        }
      }

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        image_url: p.image_url,
        retail_price: p.retail_price,
        effective_price: effectivePrice,
        is_on_sale: effectivePrice < p.retail_price,
        category_name: cat.name,
        category_slug: cat.slug,
      };
    });

    return NextResponse.json({ data: shaped });
  } catch (err) {
    console.error('Product search route error:', err);
    return NextResponse.json({ data: [] });
  }
}
