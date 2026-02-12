import { createAdminClient } from '@/lib/supabase/admin';
import { isQboSyncEnabled } from './settings';
import { syncCustomerToQbo } from './sync-customer';
import { syncTransactionToQbo } from './sync-transaction';

export interface BatchSyncResult {
  total: number;
  synced: number;
  failed: number;
  already_synced: number;
  customers_synced: number;
  customers_failed: number;
}

/**
 * Batch-sync all unsynced transactions for a given day to QBO.
 * Called from the POS end-of-day route as a fire-and-forget catch-all.
 * Syncs associated customers first, then transactions in batches of 25.
 */
export async function batchSyncDayTransactions(date?: string): Promise<BatchSyncResult> {
  const result: BatchSyncResult = {
    total: 0,
    synced: 0,
    failed: 0,
    already_synced: 0,
    customers_synced: 0,
    customers_failed: 0,
  };

  if (!(await isQboSyncEnabled())) {
    console.log('[QBO] EOD batch sync skipped — QBO disabled or disconnected');
    return result;
  }

  const supabase = createAdminClient();

  // Use today in America/Los_Angeles if no date provided
  const pstDate =
    date ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

  // Get the correct UTC offset for the given date (handles PST vs PDT)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(new Date(`${pstDate}T12:00:00`));
  const offsetPart = parts.find((p) => p.type === 'timeZoneName');
  // offsetPart.value is like "GMT-8" or "GMT-7"
  const offsetMatch = offsetPart?.value?.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1], 10) : -8;
  const offsetStr = `${offsetHours < 0 ? '-' : '+'}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;

  const startOfDay = `${pstDate}T00:00:00${offsetStr}`;
  const endOfDay = `${pstDate}T23:59:59${offsetStr}`;

  console.log(`[QBO] EOD batch sync starting for ${pstDate}`);

  // 1. Find all unsynced transactions for the day
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id, customer_id')
    .gte('transaction_date', startOfDay)
    .lte('transaction_date', endOfDay)
    .or('qbo_sync_status.is.null,qbo_sync_status.eq.failed,qbo_sync_status.eq.pending')
    .order('transaction_date', { ascending: true });

  if (txError) {
    console.error('[QBO] EOD batch sync — failed to query transactions:', txError);
    return result;
  }

  if (!transactions || transactions.length === 0) {
    console.log('[QBO] EOD batch sync — no unsynced transactions for', pstDate);
    return result;
  }

  result.total = transactions.length;

  // 2. Sync any associated customers first (QBO needs them for Sales Receipt references)
  const customerIds = [
    ...new Set(
      transactions.map((t) => t.customer_id).filter((id): id is string => id !== null)
    ),
  ];

  if (customerIds.length > 0) {
    // Find customers without a qbo_id
    const { data: unsyncedCustomers } = await supabase
      .from('customers')
      .select('id')
      .in('id', customerIds)
      .is('qbo_id', null);

    for (const customer of unsyncedCustomers || []) {
      try {
        await syncCustomerToQbo(customer.id, 'eod_batch');
        result.customers_synced++;
      } catch (err) {
        console.error(`[QBO] EOD batch — customer ${customer.id} sync failed:`, err);
        result.customers_failed++;
      }
    }
  }

  // 3. Sync transactions in batches of 25
  for (let i = 0; i < transactions.length; i += 25) {
    const batch = transactions.slice(i, i + 25);
    for (const tx of batch) {
      try {
        const syncResult = await syncTransactionToQbo(tx.id, 'eod_batch');
        if (syncResult.success) {
          // Check if it was already synced (qbo_id existed before)
          if (syncResult.qbo_id && syncResult.error === undefined) {
            result.synced++;
          } else {
            result.already_synced++;
          }
        } else {
          result.failed++;
        }
      } catch (err) {
        console.error(`[QBO] EOD batch — transaction ${tx.id} sync failed:`, err);
        result.failed++;
      }
    }

    // 100ms delay between batches to avoid rate limiting
    if (i + 25 < transactions.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`[QBO] EOD batch sync complete for ${pstDate}:`, result);
  return result;
}
