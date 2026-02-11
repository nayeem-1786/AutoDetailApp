import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isQboConnected } from '@/lib/qbo/settings';
import { syncUnsynced } from '@/lib/qbo/sync-transaction';
import { syncCustomerBatch } from '@/lib/qbo/sync-customer';
import { syncAllCatalog } from '@/lib/qbo/sync-catalog';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connected = await isQboConnected();
    if (!connected) {
      return NextResponse.json(
        { error: 'QuickBooks is not connected. Connect via Settings first.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { type } = body as { type: 'all' | 'transactions' | 'customers' | 'catalog' };

    if (!type || !['all', 'transactions', 'customers', 'catalog'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid sync type. Must be: all, transactions, customers, or catalog' },
        { status: 400 }
      );
    }

    let result: Record<string, unknown> = {};

    switch (type) {
      case 'transactions': {
        result = await syncUnsynced();
        break;
      }
      case 'customers': {
        const adminSupabase = createAdminClient();
        const { data: customers } = await adminSupabase
          .from('customers')
          .select('id')
          .is('qbo_id', null)
          .limit(500);
        const ids = (customers ?? []).map((c) => c.id);
        result = await syncCustomerBatch(ids);
        break;
      }
      case 'catalog': {
        result = await syncAllCatalog();
        break;
      }
      case 'all': {
        // Run catalog first, then customers, then transactions
        const catalogResult = await syncAllCatalog();

        const adminSupabase = createAdminClient();
        const { data: customers } = await adminSupabase
          .from('customers')
          .select('id')
          .is('qbo_id', null)
          .limit(500);
        const ids = (customers ?? []).map((c) => c.id);
        const customerResult = await syncCustomerBatch(ids);

        const txnResult = await syncUnsynced();

        result = {
          catalog: catalogResult,
          customers: customerResult,
          transactions: txnResult,
        };
        break;
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('[QBO Sync] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
