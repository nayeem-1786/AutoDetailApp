import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { parseEnrichmentResponse } from '@/lib/services/ai-product-enrichment';

/**
 * POST /api/admin/cms/products/ai-enrich/results
 * Download and process batch results from Anthropic, inserting drafts.
 * Body: { batchId: string }
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
  const { batchId } = body as { batchId: string };

  if (!batchId) {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch local batch record
  const { data: batch, error: fetchErr } = await admin
    .from('enrichment_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (fetchErr || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  // Don't re-process already completed batches
  if (batch.status === 'completed') {
    return NextResponse.json({ error: 'Batch already processed', status: 'completed' }, { status: 409 });
  }

  // Download results JSONL from Anthropic
  const resultsRes = await fetch(
    `https://api.anthropic.com/v1/messages/batches/${batch.anthropic_batch_id}/results`,
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }
  );

  if (!resultsRes.ok) {
    const errText = await resultsRes.text();
    return NextResponse.json(
      { error: `Failed to download results: ${errText.slice(0, 200)}` },
      { status: resultsRes.status }
    );
  }

  const resultsText = await resultsRes.text();
  const lines = resultsText.trim().split('\n').filter((line) => line.trim());

  let succeeded = 0;
  let errored = 0;

  for (const line of lines) {
    let entry: {
      custom_id: string;
      result: {
        type: string;
        message?: { content: Array<{ type: string; text?: string }> };
        error?: { error?: { message?: string } };
      };
    };

    try {
      entry = JSON.parse(line);
    } catch {
      console.error('Failed to parse JSONL line:', line.slice(0, 100));
      errored++;
      continue;
    }

    const productId = entry.custom_id;

    // Remove any existing pending drafts for this product (dedup on re-enrich)
    await admin
      .from('product_enrichment_drafts')
      .delete()
      .eq('product_id', productId)
      .eq('status', 'pending');

    if (entry.result.type === 'succeeded' && entry.result.message) {
      const parsed = parseEnrichmentResponse(entry.result.message.content);

      await admin
        .from('product_enrichment_drafts')
        .insert({
          product_id: productId,
          short_description: parsed.shortDescription,
          specs: parsed.specs,
          source_url: parsed.sourceUrl,
          error_message: parsed.error || null,
          status: parsed.error ? 'pending' : 'pending',
        });

      if (parsed.error) {
        errored++;
      } else {
        succeeded++;
      }
    } else if (entry.result.type === 'errored') {
      const errorMsg = entry.result.error?.error?.message ?? 'Unknown API error';
      await admin
        .from('product_enrichment_drafts')
        .insert({
          product_id: productId,
          short_description: null,
          specs: null,
          source_url: null,
          error_message: errorMsg,
          status: 'pending',
        });
      errored++;
    } else if (entry.result.type === 'canceled' || entry.result.type === 'expired') {
      await admin
        .from('product_enrichment_drafts')
        .insert({
          product_id: productId,
          short_description: null,
          specs: null,
          source_url: null,
          error_message: `Request ${entry.result.type}`,
          status: 'pending',
        });
      errored++;
    }
  }

  // Update local batch record
  await admin
    .from('enrichment_batches')
    .update({
      status: 'completed',
      succeeded,
      errored,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batch.id);

  return NextResponse.json({
    processed: lines.length,
    succeeded,
    errored,
  });
}
