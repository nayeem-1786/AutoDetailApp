import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function getPeriodDate(period: string): string | null {
  const now = Date.now();
  switch (period) {
    case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case '90d': return new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    case 'all': return null;
    default: return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const sinceDate = getPeriodDate(period);

    const admin = createAdminClient();

    // Fetch transactions with customer names
    let query = admin
      .from('transactions')
      .select('id, created_at, total_amount, payment_method, qbo_id, qbo_sync_status, qbo_synced_at, customer_id, receipt_number')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (sinceDate) query = query.gte('created_at', sinceDate);

    const { data: transactions } = await query;

    if (!transactions || transactions.length === 0) {
      const csv = 'Date,Transaction ID,Receipt,Customer,Amount,Payment Method,QBO Sync Status,QBO ID,Synced At\n';
      const today = new Date().toISOString().split('T')[0];
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="qbo-revenue-report-${today}.csv"`,
        },
      });
    }

    // Batch fetch customer names
    const customerIds = [...new Set(transactions.filter(t => t.customer_id).map(t => t.customer_id as string))];
    const customerMap = new Map<string, string>();

    if (customerIds.length > 0) {
      // Fetch in batches of 100
      for (let i = 0; i < customerIds.length; i += 100) {
        const batch = customerIds.slice(i, i + 100);
        const { data: customers } = await admin
          .from('customers')
          .select('id, first_name, last_name')
          .in('id', batch);
        for (const c of customers || []) {
          customerMap.set(c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown');
        }
      }
    }

    // Build CSV
    const rows = ['Date,Transaction ID,Receipt,Customer,Amount,Payment Method,QBO Sync Status,QBO ID,Synced At'];
    for (const txn of transactions) {
      const date = new Date(txn.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
      const customer = txn.customer_id ? (customerMap.get(txn.customer_id) || 'Unknown') : 'Walk-in';
      const syncedAt = txn.qbo_synced_at
        ? new Date(txn.qbo_synced_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
        : '';

      rows.push([
        escapeCsv(date),
        escapeCsv(txn.id),
        escapeCsv(txn.receipt_number ? `POS #${txn.receipt_number}` : ''),
        escapeCsv(customer),
        (Number(txn.total_amount) || 0).toFixed(2),
        escapeCsv(txn.payment_method || ''),
        escapeCsv(txn.qbo_sync_status || 'not synced'),
        escapeCsv(txn.qbo_id || ''),
        escapeCsv(syncedAt),
      ].join(','));
    }

    const csv = rows.join('\n') + '\n';
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="qbo-revenue-report-${today}.csv"`,
      },
    });
  } catch (err) {
    console.error('[QBO Revenue Export] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    );
  }
}
