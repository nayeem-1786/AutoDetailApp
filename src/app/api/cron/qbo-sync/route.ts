import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isQboSyncEnabled, getQboSetting } from '@/lib/qbo/settings';
import { syncTransactionToQbo } from '@/lib/qbo/sync-transaction';
import { syncCustomerToQbo } from '@/lib/qbo/sync-customer';
import { syncAllCatalog } from '@/lib/qbo/sync-catalog';

/**
 * QBO Auto-Sync cron endpoint.
 *
 * Runs periodically to sync records that missed POS fire-and-forget hooks
 * (failed, skipped, or created outside POS).
 *
 * Steps:
 *   1. Sync unsynced transactions (limit 50)
 *   2. Sync unsynced customers (limit 50)
 *   3. Sync catalog changes
 *   4. Retry failed transactions with backoff (limit 10)
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Guard: check if QBO sync is enabled and connected
  const enabled = await isQboSyncEnabled();
  if (!enabled) {
    return NextResponse.json({ skipped: true, reason: 'QBO sync disabled or disconnected' });
  }

  // Check auto-sync interval setting
  const interval = await getQboSetting('qbo_auto_sync_interval');
  if (interval === 'disabled') {
    return NextResponse.json({ skipped: true, reason: 'Auto-sync disabled' });
  }

  // If interval is > 30 min, check if we should skip this run
  const intervalMinutes = parseInt(interval || '30', 10);
  if (intervalMinutes > 30) {
    const supabase = createAdminClient();
    const { data: lastAutoSync } = await supabase
      .from('qbo_sync_log')
      .select('created_at')
      .eq('source', 'auto')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastAutoSync) {
      const lastRunAt = new Date(lastAutoSync.created_at).getTime();
      const minSinceLastRun = (Date.now() - lastRunAt) / 60_000;
      if (minSinceLastRun < intervalMinutes) {
        return NextResponse.json({
          skipped: true,
          reason: `Last auto-sync was ${Math.round(minSinceLastRun)}m ago, interval is ${intervalMinutes}m`,
        });
      }
    }
  }

  console.log('[QBO Auto-Sync] Starting...');
  const supabase = createAdminClient();

  const summary = {
    transactions: { synced: 0, failed: 0, skipped: 0 },
    customers: { synced: 0, failed: 0, skipped: 0 },
    catalog: { services: 0, products: 0 },
    retried: { synced: 0, failed: 0 },
  };

  // ── Step 1: Sync unsynced transactions ──
  try {
    const { data: unsyncedTxns } = await supabase
      .from('transactions')
      .select('id, total_amount')
      .eq('status', 'completed')
      .or('qbo_sync_status.is.null,qbo_sync_status.eq.failed')
      .order('created_at', { ascending: true })
      .limit(50);

    for (const txn of unsyncedTxns || []) {
      if (!txn.total_amount || Number(txn.total_amount) === 0) {
        await supabase
          .from('transactions')
          .update({ qbo_sync_status: 'skipped' })
          .eq('id', txn.id);
        summary.transactions.skipped++;
        continue;
      }

      try {
        const result = await syncTransactionToQbo(txn.id, 'auto');
        if (result.success) summary.transactions.synced++;
        else summary.transactions.failed++;
      } catch {
        summary.transactions.failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (err) {
    console.error('[QBO Auto-Sync] Transaction sync error:', err);
  }

  // ── Step 2: Sync unsynced customers ──
  try {
    const { data: unsyncedCustomers } = await supabase
      .from('customers')
      .select('id')
      .is('qbo_id', null)
      .or('first_name.not.is.null,last_name.not.is.null')
      .order('created_at', { ascending: true })
      .limit(50);

    for (const customer of unsyncedCustomers || []) {
      try {
        const result = await syncCustomerToQbo(customer.id, 'auto');
        if (result.success) summary.customers.synced++;
        else summary.customers.failed++;
      } catch {
        summary.customers.failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (err) {
    console.error('[QBO Auto-Sync] Customer sync error:', err);
  }

  // ── Step 3: Sync catalog changes ──
  try {
    const catalogResult = await syncAllCatalog('auto');
    summary.catalog.services = catalogResult.services.synced;
    summary.catalog.products = catalogResult.products.synced;
  } catch (err) {
    console.error('[QBO Auto-Sync] Catalog sync error:', err);
  }

  // ── Step 4: Retry failed transactions (older than 1 hour) ──
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: failedTxns } = await supabase
      .from('transactions')
      .select('id')
      .eq('qbo_sync_status', 'failed')
      .lt('qbo_synced_at', oneHourAgo)
      .order('qbo_synced_at', { ascending: true })
      .limit(10);

    for (const txn of failedTxns || []) {
      try {
        const result = await syncTransactionToQbo(txn.id, 'auto');
        if (result.success) summary.retried.synced++;
        else summary.retried.failed++;
      } catch {
        summary.retried.failed++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (err) {
    console.error('[QBO Auto-Sync] Retry error:', err);
  }

  console.log('[QBO Auto-Sync] Completed:', JSON.stringify(summary));

  return NextResponse.json(summary);
}
