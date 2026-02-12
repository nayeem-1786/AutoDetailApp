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

    // ── Sync Health ──
    let txnQuery = admin.from('transactions').select('id, total_amount, qbo_sync_status, qbo_synced_at', { count: 'exact' }).eq('status', 'completed');
    if (sinceDate) txnQuery = txnQuery.gte('created_at', sinceDate);
    const { data: allTxns, count: totalTransactions } = await txnQuery;

    const synced = (allTxns || []).filter(t => t.qbo_sync_status === 'synced');
    const failed = (allTxns || []).filter(t => t.qbo_sync_status === 'failed');
    const pending = (allTxns || []).filter(t => !t.qbo_sync_status || t.qbo_sync_status === 'pending');
    const total = totalTransactions || 0;

    // Last sync timestamps
    const { data: lastSyncRow } = await admin
      .from('transactions')
      .select('qbo_synced_at')
      .not('qbo_synced_at', 'is', null)
      .order('qbo_synced_at', { ascending: false })
      .limit(1)
      .single();

    const { data: lastAutoSyncRow } = await admin
      .from('qbo_sync_log')
      .select('created_at')
      .eq('source', 'auto')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const sync_health = {
      total_transactions: total,
      synced_transactions: synced.length,
      failed_transactions: failed.length,
      pending_transactions: pending.length,
      sync_rate: total > 0 ? Math.round((synced.length / total) * 1000) / 10 : 100,
      last_sync_at: lastSyncRow?.qbo_synced_at || null,
      last_auto_sync_at: lastAutoSyncRow?.created_at || null,
    };

    // ── Entity Counts ──
    const [
      { count: customersSynced },
      { count: customersTotal },
      { count: servicesSynced },
      { count: servicesTotal },
      { count: productsSynced },
      { count: productsTotal },
    ] = await Promise.all([
      admin.from('customers').select('*', { count: 'exact', head: true }).not('qbo_id', 'is', null),
      admin.from('customers').select('*', { count: 'exact', head: true }),
      admin.from('services').select('*', { count: 'exact', head: true }).eq('is_active', true).not('qbo_id', 'is', null),
      admin.from('services').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).not('qbo_id', 'is', null),
      admin.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    const entity_counts = {
      customers_synced: customersSynced || 0,
      customers_total: customersTotal || 0,
      services_synced: servicesSynced || 0,
      services_total: servicesTotal || 0,
      products_synced: productsSynced || 0,
      products_total: productsTotal || 0,
    };

    // ── Revenue Mirror ──
    const totalRevenue = (allTxns || []).reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);
    const syncedRevenue = synced.reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

    // Daily breakdown — group transactions by date
    const dailyMap = new Map<string, { revenue: number; synced_count: number; failed_count: number }>();
    for (const txn of allTxns || []) {
      // We don't have created_at in our select — use qbo_synced_at or approximate
      // Re-query to get created_at is expensive; use the txn data we have
    }

    // Get daily breakdown with a separate query
    let dailyQuery = admin
      .from('transactions')
      .select('created_at, total_amount, qbo_sync_status')
      .eq('status', 'completed');
    if (sinceDate) dailyQuery = dailyQuery.gte('created_at', sinceDate);
    const { data: dailyTxns } = await dailyQuery.order('created_at', { ascending: true });

    for (const txn of dailyTxns || []) {
      const date = new Date(txn.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      const entry = dailyMap.get(date) || { revenue: 0, synced_count: 0, failed_count: 0 };
      entry.revenue += Number(txn.total_amount) || 0;
      if (txn.qbo_sync_status === 'synced') entry.synced_count++;
      if (txn.qbo_sync_status === 'failed') entry.failed_count++;
      dailyMap.set(date, entry);
    }

    const daily_breakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const revenue = {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      synced_revenue: Math.round(syncedRevenue * 100) / 100,
      unsynced_revenue: Math.round((totalRevenue - syncedRevenue) * 100) / 100,
      daily_breakdown,
    };

    // ── Recent Sync Activity ──
    const { data: recentLogs } = await admin
      .from('qbo_sync_log')
      .select('id, entity_type, entity_id, action, status, error_message, created_at, source')
      .order('created_at', { ascending: false })
      .limit(20);

    const recent_activity = (recentLogs || []).map(log => ({
      id: log.id,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      status: log.status,
      error_message: log.error_message,
      created_at: log.created_at,
      source: log.source || 'manual',
    }));

    // ── Error Summary ──
    let errorQuery = admin
      .from('qbo_sync_log')
      .select('entity_type, error_message, created_at')
      .eq('status', 'failed')
      .not('error_message', 'is', null);
    if (sinceDate) errorQuery = errorQuery.gte('created_at', sinceDate);
    const { data: errorLogs } = await errorQuery.order('created_at', { ascending: false }).limit(200);

    const errorMap = new Map<string, { count: number; last_occurred: string; entity_type: string }>();
    for (const log of errorLogs || []) {
      const pattern = (log.error_message || '').substring(0, 100);
      const existing = errorMap.get(pattern);
      if (existing) {
        existing.count++;
      } else {
        errorMap.set(pattern, {
          count: 1,
          last_occurred: log.created_at,
          entity_type: log.entity_type,
        });
      }
    }

    const error_summary = Array.from(errorMap.entries())
      .map(([error_pattern, data]) => ({ error_pattern, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      sync_health,
      entity_counts,
      revenue,
      recent_activity,
      error_summary,
    });
  } catch (err) {
    console.error('[QBO Reports] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 }
    );
  }
}
