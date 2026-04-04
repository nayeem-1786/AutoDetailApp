import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { enrichProduct } from '@/lib/services/ai-product-enrichment';

/**
 * POST /api/admin/cms/products/ai-enrich
 * Enrich 1-3 products with AI web search. Client manages the batch loop.
 * Body: { productIds: string[] }
 */
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { productIds } = body as { productIds: string[] };

  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > 3) {
    return NextResponse.json(
      { error: 'productIds must be an array of 1-3 UUIDs' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch products with vendor and category
  const { data: products, error: fetchErr } = await admin
    .from('products')
    .select(`
      id, name, description, variant_label,
      vendors ( name, website ),
      product_categories ( name )
    `)
    .in('id', productIds)
    .eq('is_active', true);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const results: Array<{
    productId: string;
    draftId: string | null;
    status: 'success' | 'error';
    error?: string;
  }> = [];

  for (const product of products ?? []) {
    const vendor = product.vendors as unknown as { name: string; website: string | null } | null;
    const category = product.product_categories as unknown as { name: string } | null;

    const enrichment = await enrichProduct({
      productName: product.name,
      vendorName: vendor?.name ?? 'Unknown',
      vendorWebsite: vendor?.website,
      categoryName: category?.name,
      currentDescription: product.description,
      variantLabel: product.variant_label,
    });

    if (enrichment.error === 'rate_limit') {
      // Signal rate limit so client can pause and retry
      return NextResponse.json(
        { error: 'rate_limit', results, rateLimitedAt: product.id },
        { status: 429 }
      );
    }

    // Remove any existing pending drafts for this product (dedup on re-enrich)
    await admin
      .from('product_enrichment_drafts')
      .delete()
      .eq('product_id', product.id)
      .eq('status', 'pending');

    // Insert draft
    const { data: draft, error: insertErr } = await admin
      .from('product_enrichment_drafts')
      .insert({
        product_id: product.id,
        short_description: enrichment.shortDescription,
        specs: enrichment.specs,
        source_url: enrichment.sourceUrl,
        error_message: enrichment.error || null,
        status: enrichment.error ? 'pending' : 'pending',
      })
      .select('id')
      .single();

    if (insertErr) {
      results.push({ productId: product.id, draftId: null, status: 'error', error: insertErr.message });
    } else {
      results.push({
        productId: product.id,
        draftId: draft.id,
        status: enrichment.error ? 'error' : 'success',
        error: enrichment.error || undefined,
      });
    }
  }

  return NextResponse.json({ results });
}
