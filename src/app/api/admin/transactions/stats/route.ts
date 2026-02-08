import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Batch .in() queries to avoid PostgREST URL length limits
async function batchIn<T>(
  queryFn: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  allIds: string[],
  batchSize = 100
): Promise<T[]> {
  if (allIds.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    const { data } = await queryFn(batch);
    if (data) results.push(...data);
  }
  return results;
}

// Types for batched queries
interface ServiceItem { transaction_id: string; item_type: string }
interface TxRecord { id: string; customer_id: string; transaction_date: string; status: string }
interface TxItemId { transaction_id: string }

export async function GET(request: NextRequest) {
  try {
    // Auth: session + employee check
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Step 1: Fetch completed transactions in date range
    let query = supabase
      .from('transactions')
      .select('id, total_amount, tip_amount, payment_method, customer_id, status, transaction_date')
      .eq('status', 'completed');

    if (from) {
      const [y, m, d] = from.split('-').map(Number);
      query = query.gte('transaction_date', new Date(y, m - 1, d).toISOString());
    }
    if (to) {
      const [y, m, d] = to.split('-').map(Number);
      query = query.lte(
        'transaction_date',
        new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
      );
    }

    const { data: transactions, error: txError } = await query;
    if (txError) {
      console.error('Error fetching transactions:', txError);
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    const txList = transactions ?? [];

    // Step 2: Compute revenue, count, avg ticket, tips, payment methods
    const revenue = txList.reduce((sum, t) => sum + (t.total_amount || 0), 0);
    const transactionCount = txList.length;
    const avgTicket = transactionCount > 0 ? revenue / transactionCount : 0;
    const tips = txList.reduce((sum, t) => sum + (t.tip_amount || 0), 0);

    // Group by payment_method
    const methodMap = new Map<string, { total: number; count: number }>();
    for (const t of txList) {
      const method = t.payment_method || 'other';
      const existing = methodMap.get(method) || { total: 0, count: 0 };
      existing.total += t.total_amount || 0;
      existing.count += 1;
      methodMap.set(method, existing);
    }
    const paymentMethods = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
        percentage: revenue > 0 ? Math.round((data.total / revenue) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Step 3: Identify service customers in date range
    const transactionIds = txList.map((t) => t.id);

    const serviceItems = await batchIn<ServiceItem>(
      (ids) =>
        supabase
          .from('transaction_items')
          .select('transaction_id, item_type')
          .in('transaction_id', ids)
          .eq('item_type', 'service'),
      transactionIds
    );

    const serviceTransactionIds = new Set(serviceItems.map((i) => i.transaction_id));
    const serviceCustomerIds = [
      ...new Set(
        txList
          .filter((t) => t.customer_id && serviceTransactionIds.has(t.id))
          .map((t) => t.customer_id!)
      ),
    ];

    // Step 4: Classify new vs win-back
    let newCustomers = 0;
    let winBacks = 0;

    if (serviceCustomerIds.length > 0) {
      // Fetch all completed transactions for these customers (all time)
      const allServiceTx = await batchIn<TxRecord>(
        (ids) =>
          supabase
            .from('transactions')
            .select('id, customer_id, transaction_date, status')
            .in('customer_id', ids)
            .eq('status', 'completed'),
        serviceCustomerIds
      );

      // Filter to only those that have service items
      const allTxIds = allServiceTx.map((t) => t.id);
      const allServiceItemRows = await batchIn<TxItemId>(
        (ids) =>
          supabase
            .from('transaction_items')
            .select('transaction_id')
            .in('transaction_id', ids)
            .eq('item_type', 'service'),
        allTxIds
      );

      const historicalServiceTxIds = new Set(allServiceItemRows.map((i) => i.transaction_id));
      const historicalServiceTx = allServiceTx.filter((t) => historicalServiceTxIds.has(t.id));

      // Build per-customer: earliest ever, latest before range start
      const customerHistory = new Map<
        string,
        { earliest: string; latestBefore: string | null }
      >();

      for (const t of historicalServiceTx) {
        const cid = t.customer_id as string;
        const existing = customerHistory.get(cid) || {
          earliest: t.transaction_date,
          latestBefore: null,
        };

        if (t.transaction_date < existing.earliest) {
          existing.earliest = t.transaction_date;
        }

        // "before range start" means transaction_date < from
        if (from) {
          const [y, m, d] = from.split('-').map(Number);
          const rangeStart = new Date(y, m - 1, d).toISOString();
          if (t.transaction_date < rangeStart) {
            if (!existing.latestBefore || t.transaction_date > existing.latestBefore) {
              existing.latestBefore = t.transaction_date;
            }
          }
        }

        customerHistory.set(cid, existing);
      }

      // Classify each service customer
      const fromDate = from ? (() => { const [y, m, d] = from.split('-').map(Number); return new Date(y, m - 1, d); })() : null;
      const toDate = to ? (() => { const [y, m, d] = to.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); })() : null;

      for (const customerId of serviceCustomerIds) {
        const history = customerHistory.get(customerId);
        if (!history) continue;

        const earliestDate = new Date(history.earliest);

        // New: earliest service transaction ever falls within the active date range
        const isInRange =
          (!fromDate || earliestDate >= fromDate) && (!toDate || earliestDate <= toDate);
        if (isInRange) {
          newCustomers++;
          continue;
        }

        // Win-back: had prior service but gap >= 180 days
        if (history.latestBefore) {
          // Find this customer's first transaction in the current range
          const customerCurrentTx = txList
            .filter((t) => t.customer_id === customerId && serviceTransactionIds.has(t.id))
            .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

          if (customerCurrentTx.length > 0) {
            const lastBefore = new Date(history.latestBefore);
            const firstInRange = new Date(customerCurrentTx[0].transaction_date);
            const daysDiff =
              (firstInRange.getTime() - lastBefore.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff >= 180) {
              winBacks++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      revenue,
      transactionCount,
      avgTicket,
      tips,
      newCustomers,
      winBacks,
      paymentMethods,
    });
  } catch (err) {
    console.error('Admin transaction stats GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
