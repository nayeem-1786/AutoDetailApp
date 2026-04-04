import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

/**
 * GET /api/admin/cms/products/ai-enrich/status?batchId={id}
 * Check the status of an enrichment batch via Anthropic API.
 */
export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const batchId = request.nextUrl.searchParams.get('batchId');
  if (!batchId) {
    return NextResponse.json({ error: 'batchId query param required' }, { status: 400 });
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

  // If already completed locally, return stored data
  if (batch.status === 'completed' || batch.status === 'failed') {
    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      totalRequests: batch.total_requests,
      succeeded: batch.succeeded,
      errored: batch.errored,
      completedAt: batch.completed_at,
    });
  }

  // Poll Anthropic for current status
  const anthropicRes = await fetch(
    `https://api.anthropic.com/v1/messages/batches/${batch.anthropic_batch_id}`,
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }
  );

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return NextResponse.json(
      { error: `Anthropic status check failed: ${errText.slice(0, 200)}` },
      { status: anthropicRes.status }
    );
  }

  const anthropicBatch = await anthropicRes.json();
  const requestCounts = anthropicBatch.request_counts ?? {};

  // Update local status if Anthropic says it's processing
  if (anthropicBatch.processing_status === 'in_progress' && batch.status === 'submitted') {
    await admin
      .from('enrichment_batches')
      .update({ status: 'processing' })
      .eq('id', batch.id);
  }

  return NextResponse.json({
    batchId: batch.id,
    anthropicStatus: anthropicBatch.processing_status,
    status: anthropicBatch.processing_status === 'ended' ? 'ended' : batch.status,
    totalRequests: batch.total_requests,
    requestCounts: {
      processing: requestCounts.processing ?? 0,
      succeeded: requestCounts.succeeded ?? 0,
      errored: requestCounts.errored ?? 0,
      canceled: requestCounts.canceled ?? 0,
      expired: requestCounts.expired ?? 0,
    },
  });
}
