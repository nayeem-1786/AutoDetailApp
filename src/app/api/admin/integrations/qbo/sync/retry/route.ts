import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncTransactionToQbo } from '@/lib/qbo/sync-transaction';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { transactionId } = body as { transactionId?: string };

    const adminSupabase = createAdminClient();

    if (transactionId) {
      // Retry single transaction
      const result = await syncTransactionToQbo(transactionId);
      return NextResponse.json({
        retried: 1,
        succeeded: result.success ? 1 : 0,
        still_failed: result.success ? 0 : 1,
        error: result.error,
      });
    }

    // Retry all failed transactions
    const { data: failed } = await adminSupabase
      .from('transactions')
      .select('id')
      .eq('qbo_sync_status', 'failed')
      .order('transaction_date', { ascending: true });

    const txns = failed ?? [];
    let succeeded = 0;
    let stillFailed = 0;

    for (const txn of txns) {
      const result = await syncTransactionToQbo(txn.id);
      if (result.success) {
        succeeded++;
      } else {
        stillFailed++;
      }
      // 100ms delay between retries
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      retried: txns.length,
      succeeded,
      still_failed: stillFailed,
    });
  } catch (err) {
    console.error('[QBO Retry] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 }
    );
  }
}
