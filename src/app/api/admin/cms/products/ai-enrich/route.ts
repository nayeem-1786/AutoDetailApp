import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import {
  ENRICHMENT_SYSTEM_PROMPT,
  ENRICHMENT_MODEL,
  buildEnrichmentUserPrompt,
} from '@/lib/services/ai-product-enrichment';

/**
 * POST /api/admin/cms/products/ai-enrich
 * Submit products for enrichment via Anthropic Message Batches API.
 * Body: { mode: "all" | "selected", productIds?: string[] }
 */
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { mode, productIds } = body as { mode: 'all' | 'selected'; productIds?: string[] };

  if (mode !== 'all' && mode !== 'selected') {
    return NextResponse.json({ error: 'mode must be "all" or "selected"' }, { status: 400 });
  }

  if (mode === 'selected' && (!Array.isArray(productIds) || productIds.length === 0)) {
    return NextResponse.json({ error: 'productIds required for "selected" mode' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Prevent duplicate batch submissions
  const { data: activeBatch } = await admin
    .from('enrichment_batches')
    .select('id, status, total_requests')
    .in('status', ['submitted', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeBatch) {
    return NextResponse.json(
      { error: `A batch is already ${activeBatch.status} (${activeBatch.total_requests} products). Wait for it to complete before submitting another.` },
      { status: 409 }
    );
  }

  // Build product query
  let query = admin
    .from('products')
    .select(`
      id, name, description, variant_label,
      vendors ( name, website ),
      product_categories ( name )
    `)
    .eq('is_active', true);

  if (mode === 'selected') {
    query = query.in('id', productIds!);
  }

  const { data: allProducts, error: fetchErr } = await query;

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!allProducts || allProducts.length === 0) {
    return NextResponse.json({ error: 'No active products found' }, { status: 404 });
  }

  // Skip products that already have applied or pending drafts
  const { data: existingDrafts } = await admin
    .from('product_enrichment_drafts')
    .select('product_id')
    .in('status', ['applied', 'pending']);

  const skipIds = new Set((existingDrafts ?? []).map((d: { product_id: string }) => d.product_id));
  const products = allProducts.filter((p) => !skipIds.has(p.id));

  if (products.length === 0) {
    return NextResponse.json({
      message: 'All products already enriched or pending review',
      skipped: skipIds.size,
      totalProducts: 0,
    });
  }

  // Build batch requests array
  const requests = products.map((product) => {
    const vendor = product.vendors as unknown as { name: string; website: string | null } | null;
    const category = product.product_categories as unknown as { name: string } | null;

    return {
      custom_id: product.id,
      params: {
        model: ENRICHMENT_MODEL,
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 3 }],
        system: ENRICHMENT_SYSTEM_PROMPT,
        messages: [{
          role: 'user' as const,
          content: buildEnrichmentUserPrompt({
            productName: product.name,
            vendorName: vendor?.name ?? 'Unknown',
            vendorWebsite: vendor?.website,
            categoryName: category?.name,
            currentDescription: product.description,
            variantLabel: product.variant_label,
          }),
        }],
      },
    };
  });

  // Submit to Anthropic Message Batches API
  const batchResponse = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ requests }),
  });

  if (!batchResponse.ok) {
    const errText = await batchResponse.text();
    console.error('Batch submission failed:', errText);
    return NextResponse.json(
      { error: `Batch submission failed: ${errText.slice(0, 300)}` },
      { status: batchResponse.status }
    );
  }

  const batchData = await batchResponse.json();

  // Store batch record
  const { data: batchRecord, error: insertErr } = await admin
    .from('enrichment_batches')
    .insert({
      anthropic_batch_id: batchData.id,
      status: 'submitted',
      total_requests: products.length,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('Failed to store batch record:', insertErr);
    return NextResponse.json(
      { error: 'Batch submitted to Anthropic but failed to store record locally' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    batchId: batchRecord.id,
    anthropicBatchId: batchData.id,
    totalProducts: products.length,
    skipped: skipIds.size,
    message: 'Batch submitted. Poll for results.',
  });
}
