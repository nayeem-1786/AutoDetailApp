import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * POST /api/pos/jobs/[id]/link-transaction
 * Links a transaction to a job and sets job status to 'closed'.
 * Called after POS payment completes (fire-and-forget).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    if (!body.transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Link transaction and close job
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        transaction_id: body.transaction_id,
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status, transaction_id')
      .single();

    if (updateError) {
      console.error('Job link-transaction error:', updateError);
      return NextResponse.json({ error: 'Failed to link transaction' }, { status: 500 });
    }

    console.log(`[JobCheckout] Job ${id} linked to transaction ${body.transaction_id}, status → closed`);
    return NextResponse.json({ data: updatedJob });
  } catch (err) {
    console.error('Job link-transaction route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
