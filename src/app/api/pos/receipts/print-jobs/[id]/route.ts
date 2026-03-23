import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/pos/receipts/print-jobs/[id] — Check print job status
 * Used by POS UI to poll for completion after queuing a print job.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auth: POS token or admin session
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = createAdminClient();
    const { data: job, error } = await supabase
      .from('print_jobs')
      .select('id, type, status, error_message, created_at, completed_at')
      .eq('id', id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ data: job });
  } catch (err) {
    console.error('Print job status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
