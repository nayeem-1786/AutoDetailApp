import { createAdminClient } from '@/lib/supabase/admin';

interface AttributionResult {
  totalRevenue: number;
  transactionCount: number;
  uniqueCustomers: number;
}

/**
 * Get attributed revenue for a specific campaign or lifecycle rule.
 * Finds customers who received the campaign/automation, then finds
 * transactions by those customers within windowDays after receiving.
 */
export async function getAttributedRevenue(opts: {
  campaignId?: string;
  lifecycleRuleId?: string;
  periodStart: string;
  periodEnd: string;
  windowDays?: number;
}): Promise<AttributionResult> {
  const { campaignId, lifecycleRuleId, periodStart, periodEnd, windowDays = 7 } = opts;
  const supabase = createAdminClient();

  // Find customers who received this campaign/automation in the period
  const customerIds: string[] = [];
  const sentDates = new Map<string, string>(); // customerId -> sentDate

  if (campaignId) {
    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('customer_id, sent_at')
      .eq('campaign_id', campaignId)
      .gte('sent_at', periodStart)
      .lte('sent_at', periodEnd);

    if (recipients) {
      recipients.forEach((r: { customer_id: string; sent_at: string }) => {
        if (r.customer_id) {
          customerIds.push(r.customer_id);
          sentDates.set(r.customer_id, r.sent_at);
        }
      });
    }
  }

  if (lifecycleRuleId) {
    const { data: executions } = await supabase
      .from('lifecycle_executions')
      .select('customer_id, executed_at')
      .eq('lifecycle_rule_id', lifecycleRuleId)
      .eq('status', 'sent')
      .gte('executed_at', periodStart)
      .lte('executed_at', periodEnd);

    if (executions) {
      executions.forEach((e: { customer_id: string; executed_at: string | null }) => {
        if (e.customer_id && e.executed_at) {
          customerIds.push(e.customer_id);
          sentDates.set(e.customer_id, e.executed_at);
        }
      });
    }
  }

  if (customerIds.length === 0) {
    return { totalRevenue: 0, transactionCount: 0, uniqueCustomers: 0 };
  }

  return calculateAttributedRevenue(supabase, customerIds, sentDates, windowDays);
}

/**
 * Get total attributed revenue across all campaigns and automations for a period.
 */
export async function getAttributedRevenueForPeriod(
  periodStart: string,
  periodEnd: string,
  windowDays: number = 7
): Promise<AttributionResult> {
  const supabase = createAdminClient();

  // Get all campaign recipients in period
  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('customer_id, sent_at')
    .gte('sent_at', periodStart)
    .lte('sent_at', periodEnd);

  // Get all lifecycle executions in period
  const { data: executions } = await supabase
    .from('lifecycle_executions')
    .select('customer_id, executed_at')
    .eq('status', 'sent')
    .gte('executed_at', periodStart)
    .lte('executed_at', periodEnd);

  const sentDates = new Map<string, string>();

  recipients?.forEach((r: { customer_id: string; sent_at: string }) => {
    if (r.customer_id) {
      const existing = sentDates.get(r.customer_id);
      // Use earliest sent date for attribution window
      if (!existing || r.sent_at < existing) {
        sentDates.set(r.customer_id, r.sent_at);
      }
    }
  });

  executions?.forEach((e: { customer_id: string; executed_at: string | null }) => {
    if (e.customer_id && e.executed_at) {
      const existing = sentDates.get(e.customer_id);
      if (!existing || e.executed_at < existing) {
        sentDates.set(e.customer_id, e.executed_at);
      }
    }
  });

  const customerIds = [...sentDates.keys()];
  if (customerIds.length === 0) {
    return { totalRevenue: 0, transactionCount: 0, uniqueCustomers: 0 };
  }

  return calculateAttributedRevenue(supabase, customerIds, sentDates, windowDays);
}

/**
 * Shared logic: given customers and their sent dates, find transactions
 * within the attribution window.
 */
async function calculateAttributedRevenue(
  supabase: ReturnType<typeof createAdminClient>,
  customerIds: string[],
  sentDates: Map<string, string>,
  windowDays: number
): Promise<AttributionResult> {
  const uniqueIds = [...new Set(customerIds)];
  let totalRevenue = 0;
  let transactionCount = 0;
  const convertedCustomers = new Set<string>();

  // Process in batches to handle large recipient lists
  const batchSize = 100;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('id, customer_id, total_amount, transaction_date')
      .in('customer_id', batch)
      .eq('status', 'completed');

    if (transactions) {
      transactions.forEach((txn: { id: string; customer_id: string | null; total_amount: number; transaction_date: string }) => {
        if (!txn.customer_id) return;
        const sentDate = sentDates.get(txn.customer_id);
        if (sentDate) {
          const sentTime = new Date(sentDate).getTime();
          const txnTime = new Date(txn.transaction_date).getTime();
          const windowMs = windowDays * 24 * 60 * 60 * 1000;

          if (txnTime >= sentTime && txnTime <= sentTime + windowMs) {
            totalRevenue += Number(txn.total_amount) || 0;
            transactionCount++;
            convertedCustomers.add(txn.customer_id);
          }
        }
      });
    }
  }

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    transactionCount,
    uniqueCustomers: convertedCustomers.size,
  };
}
