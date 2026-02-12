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
    const statusFilter = searchParams.get('status') || 'all';
    const entityTypeFilter = searchParams.get('entity_type') || 'all';
    const sinceDate = getPeriodDate(period);

    const admin = createAdminClient();

    // Build query
    let query = admin
      .from('qbo_sync_log')
      .select('id, entity_type, entity_id, action, qbo_id, status, error_message, created_at, source')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (sinceDate) query = query.gte('created_at', sinceDate);
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (entityTypeFilter !== 'all') query = query.eq('entity_type', entityTypeFilter);

    const { data: logs } = await query;

    if (!logs || logs.length === 0) {
      const csv = 'Date,Entity Type,Entity ID,Entity Name,Action,Status,Error,QBO ID,Source\n';
      const today = new Date().toISOString().split('T')[0];
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="qbo-sync-log-${today}.csv"`,
        },
      });
    }

    // Gather entity IDs by type for name lookup
    const customerIds = [...new Set(logs.filter(l => l.entity_type === 'customer').map(l => l.entity_id))];
    const serviceIds = [...new Set(logs.filter(l => l.entity_type === 'service').map(l => l.entity_id))];
    const productIds = [...new Set(logs.filter(l => l.entity_type === 'product').map(l => l.entity_id))];
    const transactionIds = [...new Set(logs.filter(l => l.entity_type === 'transaction').map(l => l.entity_id))];

    // Batch fetch names
    const nameMap = new Map<string, string>();

    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from('customers')
        .select('id, first_name, last_name')
        .in('id', customerIds);
      for (const c of customers || []) {
        nameMap.set(c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown');
      }
    }

    if (serviceIds.length > 0) {
      const { data: services } = await admin
        .from('services')
        .select('id, name')
        .in('id', serviceIds);
      for (const s of services || []) {
        nameMap.set(s.id, s.name || 'Unknown Service');
      }
    }

    if (productIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, name')
        .in('id', productIds);
      for (const p of products || []) {
        nameMap.set(p.id, p.name || 'Unknown Product');
      }
    }

    if (transactionIds.length > 0) {
      const { data: transactions } = await admin
        .from('transactions')
        .select('id, receipt_number')
        .in('id', transactionIds);
      for (const t of transactions || []) {
        nameMap.set(t.id, t.receipt_number ? `POS #${t.receipt_number}` : t.id.slice(0, 8));
      }
    }

    // Build CSV
    const rows = ['Date,Entity Type,Entity ID,Entity Name,Action,Status,Error,QBO ID,Source'];
    for (const log of logs) {
      const date = new Date(log.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
      const name = nameMap.get(log.entity_id) || log.entity_id.slice(0, 8);
      rows.push([
        escapeCsv(date),
        escapeCsv(log.entity_type),
        escapeCsv(log.entity_id),
        escapeCsv(name),
        escapeCsv(log.action),
        escapeCsv(log.status),
        escapeCsv(log.error_message || ''),
        escapeCsv(log.qbo_id || ''),
        escapeCsv(log.source || 'manual'),
      ].join(','));
    }

    const csv = rows.join('\n') + '\n';
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="qbo-sync-log-${today}.csv"`,
      },
    });
  } catch (err) {
    console.error('[QBO Sync Log Export] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    );
  }
}
