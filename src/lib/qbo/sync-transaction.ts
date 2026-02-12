import { createAdminClient } from '@/lib/supabase/admin';
import { QboClient } from './client';
import { isQboSyncEnabled, getQboSetting, setQboSetting } from './settings';
import { logSync } from './sync-log';
import { syncCustomerToQbo } from './sync-customer';
import { syncServiceToQbo, syncProductToQbo } from './sync-catalog';

// Cache for generic fallback items in QBO
let miscServiceQboId: string | null = null;
let miscProductQboId: string | null = null;
let walkInCustomerQboId: string | null = null;

/**
 * Convert ISO timestamp to YYYY-MM-DD in America/Los_Angeles timezone.
 */
function formatDatePST(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * Build a private note for the QBO Sales Receipt.
 * Max 4000 chars per QBO spec.
 */
function buildPrivateNote(transaction: {
  receipt_number?: string;
  payment_method?: string;
  coupon_code?: string;
  employee_name?: string;
}): string {
  const parts: string[] = [];
  if (transaction.receipt_number) parts.push(`POS #${transaction.receipt_number}`);
  if (transaction.payment_method) parts.push(`Payment: ${transaction.payment_method}`);
  if (transaction.employee_name) parts.push(`Employee: ${transaction.employee_name}`);
  if (transaction.coupon_code) parts.push(`Coupon: ${transaction.coupon_code}`);
  return parts.join(' | ').substring(0, 4000);
}

/**
 * Get or create a "Walk-in Customer" in QBO for transactions with no customer_id.
 */
async function getWalkInCustomerQboId(client: QboClient): Promise<string> {
  if (walkInCustomerQboId) return walkInCustomerQboId;

  const existing = await client.findCustomerByName('Walk-in Customer');
  if (existing) {
    walkInCustomerQboId = existing.Id;
    return walkInCustomerQboId;
  }

  const created = await client.createCustomer({
    DisplayName: 'Walk-in Customer',
    GivenName: 'Walk-in',
    FamilyName: 'Customer',
  });
  walkInCustomerQboId = created.Id;
  return walkInCustomerQboId;
}

/**
 * Get or create a "Miscellaneous Service" item in QBO for deleted services.
 */
async function getMiscServiceQboId(client: QboClient, incomeAccountId: string): Promise<string> {
  if (miscServiceQboId) return miscServiceQboId;

  const existing = await client.findItemByName('Miscellaneous Service');
  if (existing) {
    miscServiceQboId = existing.Id;
    return miscServiceQboId;
  }

  const created = await client.createItem({
    Name: 'Miscellaneous Service',
    Type: 'Service',
    IncomeAccountRef: { value: incomeAccountId, name: '' },
  } as never);
  miscServiceQboId = created.Id;
  return miscServiceQboId;
}

/**
 * Get or create a "Miscellaneous Product" item in QBO for deleted products.
 */
async function getMiscProductQboId(client: QboClient, incomeAccountId: string): Promise<string> {
  if (miscProductQboId) return miscProductQboId;

  const existing = await client.findItemByName('Miscellaneous Product');
  if (existing) {
    miscProductQboId = existing.Id;
    return miscProductQboId;
  }

  const created = await client.createItem({
    Name: 'Miscellaneous Product',
    Type: 'NonInventory',
    IncomeAccountRef: { value: incomeAccountId, name: '' },
  } as never);
  miscProductQboId = created.Id;
  return miscProductQboId;
}

/**
 * Get the QBO Item ID for a transaction line item.
 * If the referenced service/product exists and has a qbo_id, use it.
 * Otherwise, sync it first or fall back to a generic item.
 */
async function getQboItemId(
  item: {
    service_id?: string | null;
    product_id?: string | null;
    item_name?: string;
  },
  client: QboClient,
  incomeAccountId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string> {
  // Try service first
  if (item.service_id) {
    const { data: service } = await supabase
      .from('services')
      .select('qbo_id')
      .eq('id', item.service_id)
      .single();

    if (service?.qbo_id) return service.qbo_id;

    // Service exists but no qbo_id — sync it
    if (service) {
      const result = await syncServiceToQbo(item.service_id);
      if (result.qbo_id) return result.qbo_id;
    }

    // Service was deleted — use generic
    return getMiscServiceQboId(client, incomeAccountId);
  }

  // Try product
  if (item.product_id) {
    const { data: product } = await supabase
      .from('products')
      .select('qbo_id')
      .eq('id', item.product_id)
      .single();

    if (product?.qbo_id) return product.qbo_id;

    if (product) {
      const result = await syncProductToQbo(item.product_id);
      if (result.qbo_id) return result.qbo_id;
    }

    return getMiscProductQboId(client, incomeAccountId);
  }

  // No reference — use generic service
  return getMiscServiceQboId(client, incomeAccountId);
}

/**
 * Sync a single transaction to QuickBooks Online as a Sales Receipt.
 */
export async function syncTransactionToQbo(
  transactionId: string,
  source: 'manual' | 'auto' | 'pos_hook' | 'eod_batch' = 'manual'
): Promise<{ success: boolean; qbo_id?: string; error?: string }> {
  const startTime = Date.now();
  const supabase = createAdminClient();

  try {
    const enabled = await isQboSyncEnabled();
    if (!enabled) return { success: false, error: 'QBO sync not enabled' };

    // Fetch transaction with related data
    const { data: transaction, error: txnErr } = await supabase
      .from('transactions')
      .select(`
        id, total_amount, discount_amount, created_at, customer_id,
        status, payment_method, receipt_number, coupon_id,
        qbo_id, qbo_sync_status
      `)
      .eq('id', transactionId)
      .single();

    if (txnErr || !transaction) {
      return { success: false, error: `Transaction not found: ${transactionId}` };
    }

    // Skip already synced
    if (transaction.qbo_sync_status === 'synced') {
      return { success: true, qbo_id: transaction.qbo_id };
    }

    // Skip $0 transactions
    if (!transaction.total_amount || Number(transaction.total_amount) === 0) {
      await supabase
        .from('transactions')
        .update({ qbo_sync_status: 'skipped' })
        .eq('id', transactionId);
      return { success: true };
    }

    // Mark as pending
    await supabase
      .from('transactions')
      .update({ qbo_sync_status: 'pending' })
      .eq('id', transactionId);

    const client = new QboClient();
    const incomeAccountId = await getQboSetting('qbo_income_account_id');
    if (!incomeAccountId) {
      return { success: false, error: 'Income account not configured in QBO settings' };
    }

    // Ensure customer has QBO ID
    let customerQboId: string;
    if (transaction.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('qbo_id')
        .eq('id', transaction.customer_id)
        .single();

      if (customer?.qbo_id) {
        customerQboId = customer.qbo_id;
      } else {
        // Sync customer first
        const custResult = await syncCustomerToQbo(transaction.customer_id);
        if (!custResult.qbo_id) {
          throw new Error(`Failed to sync customer: ${custResult.error}`);
        }
        customerQboId = custResult.qbo_id;
      }
    } else {
      // No customer — use Walk-in
      customerQboId = await getWalkInCustomerQboId(client);
    }

    // Fetch transaction items
    const { data: items } = await supabase
      .from('transaction_items')
      .select('id, service_id, product_id, quantity, unit_price, item_name')
      .eq('transaction_id', transactionId);

    // Fetch employee name
    let employeeName = '';
    if (transaction.receipt_number) {
      // Try to get employee from the transaction's employee_id if it exists
      const { data: txnWithEmp } = await supabase
        .from('transactions')
        .select('employee_id')
        .eq('id', transactionId)
        .single();

      if (txnWithEmp?.employee_id) {
        const { data: emp } = await supabase
          .from('employees')
          .select('first_name, last_name')
          .eq('id', txnWithEmp.employee_id)
          .single();
        if (emp) employeeName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      }
    }

    // Fetch coupon code if applicable
    let couponCode = '';
    if (transaction.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('code')
        .eq('id', transaction.coupon_id)
        .single();
      if (coupon) couponCode = coupon.code;
    }

    // Build Sales Receipt line items
    const lines: unknown[] = [];
    for (const item of items || []) {
      const itemQboId = await getQboItemId(item, client, incomeAccountId, supabase);
      lines.push({
        Amount: (item.unit_price || 0) * (item.quantity || 1),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: itemQboId },
          Qty: item.quantity || 1,
          UnitPrice: item.unit_price || 0,
        },
      });
    }

    // Add discount line if applicable
    const discountAmount = Number(transaction.discount_amount) || 0;
    if (discountAmount > 0) {
      lines.push({
        Amount: discountAmount,
        DetailType: 'DiscountLineDetail',
        DiscountLineDetail: {
          PercentBased: false,
        },
      });
    }

    // Build Sales Receipt payload
    const depositAccountId = await getQboSetting('qbo_default_payment_method_id');
    const receiptPayload: Record<string, unknown> = {
      TxnDate: formatDatePST(transaction.created_at),
      CustomerRef: { value: customerQboId },
      Line: lines,
      PrivateNote: buildPrivateNote({
        receipt_number: transaction.receipt_number,
        payment_method: transaction.payment_method,
        coupon_code: couponCode,
        employee_name: employeeName,
      }),
    };

    if (depositAccountId) {
      receiptPayload.DepositToAccountRef = { value: depositAccountId };
    }

    // Create Sales Receipt in QBO
    const qboReceipt = await client.createSalesReceipt(receiptPayload as never);
    const qboId = qboReceipt.Id;

    // Update our transaction
    const now = new Date().toISOString();
    await supabase
      .from('transactions')
      .update({
        qbo_id: qboId,
        qbo_sync_status: 'synced',
        qbo_sync_error: null,
        qbo_synced_at: now,
      })
      .eq('id', transactionId);

    await logSync({
      entity_type: 'transaction',
      entity_id: transactionId,
      action: 'create',
      qbo_id: qboId,
      status: 'success',
      error_message: null,
      request_payload: receiptPayload as Record<string, unknown>,
      response_payload: { qbo_id: qboId, total: qboReceipt.TotalAmt },
      duration_ms: Date.now() - startTime,
      source,
    });

    return { success: true, qbo_id: qboId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Mark as failed
    await supabase
      .from('transactions')
      .update({
        qbo_sync_status: 'failed',
        qbo_sync_error: errorMsg.substring(0, 1000),
      })
      .eq('id', transactionId);

    await logSync({
      entity_type: 'transaction',
      entity_id: transactionId,
      action: 'create',
      qbo_id: null,
      status: 'failed',
      error_message: errorMsg,
      request_payload: null,
      response_payload: null,
      duration_ms: Date.now() - startTime,
      source,
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Sync all unsynced transactions to QBO.
 * Finds completed transactions that are not yet synced or previously failed.
 */
export async function syncUnsynced(
  source: 'manual' | 'auto' | 'pos_hook' | 'eod_batch' = 'manual'
): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  const supabase = createAdminClient();

  // Determine date range: last 30 days or since last sync
  const lastSyncAt = await getQboSetting('qbo_last_sync_at');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceDate = lastSyncAt && lastSyncAt > thirtyDaysAgo ? lastSyncAt : thirtyDaysAgo;

  // Find eligible transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, total_amount')
    .eq('status', 'completed')
    .or('qbo_sync_status.is.null,qbo_sync_status.eq.failed')
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: true });

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const txn of transactions || []) {
    // Skip $0
    if (!txn.total_amount || Number(txn.total_amount) === 0) {
      skipped++;
      await supabase
        .from('transactions')
        .update({ qbo_sync_status: 'skipped' })
        .eq('id', txn.id);
      continue;
    }

    const result = await syncTransactionToQbo(txn.id, source);
    if (result.success) {
      synced++;
    } else {
      failed++;
    }

    // 100ms delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Update last sync timestamp
  await setQboSetting('qbo_last_sync_at', new Date().toISOString());

  return { synced, failed, skipped };
}
