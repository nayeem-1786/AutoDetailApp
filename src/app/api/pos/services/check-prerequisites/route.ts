import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

interface PrerequisiteResult {
  service_name: string;
  enforcement: 'required_same_ticket' | 'required_history' | 'recommended';
  required_within_days: number | null;
  warning_message: string | null;
  met_by?: {
    source: 'ticket' | 'history';
    date?: string;
    service_name?: string;
  };
}

/**
 * POST /api/pos/services/check-prerequisites
 *
 * Checks whether a service's prerequisites are satisfied by
 * current ticket items and/or transaction history.
 *
 * Body: {
 *   service_id: string,
 *   customer_id?: string,
 *   vehicle_id?: string,
 *   ticket_service_ids: string[]
 * }
 *
 * Returns: {
 *   has_prerequisites: boolean,
 *   satisfied: boolean,
 *   prerequisites: PrerequisiteResult[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { service_id, customer_id, vehicle_id, ticket_service_ids = [] } = body;

    if (!service_id) {
      return NextResponse.json({ error: 'service_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch prerequisites for this service
    const { data: prereqs, error } = await supabase
      .from('service_prerequisites')
      .select(`
        id,
        prerequisite_service_id,
        enforcement,
        history_window_days,
        warning_message,
        prerequisite_service:services!prerequisite_service_id(id, name)
      `)
      .eq('service_id', service_id);

    if (error) {
      console.error('Prerequisites fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch prerequisites' }, { status: 500 });
    }

    if (!prereqs || prereqs.length === 0) {
      return NextResponse.json({
        has_prerequisites: false,
        satisfied: true,
        prerequisites: [],
      });
    }

    const results: PrerequisiteResult[] = [];
    const ticketServiceIdSet = new Set(ticket_service_ids);

    for (const prereq of prereqs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prereqService = prereq.prerequisite_service as any;
      const prereqServiceName = prereqService?.name || 'Unknown Service';
      const prereqServiceId = prereq.prerequisite_service_id;

      const result: PrerequisiteResult = {
        service_name: prereqServiceName,
        enforcement: prereq.enforcement,
        required_within_days: prereq.history_window_days,
        warning_message: prereq.warning_message,
      };

      // Check 1: Is the prerequisite already on the current ticket?
      if (ticketServiceIdSet.has(prereqServiceId)) {
        result.met_by = { source: 'ticket', service_name: prereqServiceName };
        results.push(result);
        continue;
      }

      // Check 2: For required_same_ticket, only check the ticket (no history)
      if (prereq.enforcement === 'required_same_ticket') {
        // Not on ticket — not satisfied
        results.push(result);
        continue;
      }

      // Check 3: For required_history and recommended, check transaction history
      if (customer_id && vehicle_id && prereq.history_window_days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - prereq.history_window_days);

        const { data: historyMatch } = await supabase
          .from('transaction_items')
          .select(`
            id,
            transactions!inner(
              id,
              transaction_date,
              vehicle_id,
              customer_id,
              status
            )
          `)
          .eq('service_id', prereqServiceId)
          .eq('transactions.customer_id', customer_id)
          .eq('transactions.vehicle_id', vehicle_id)
          .eq('transactions.status', 'completed')
          .gte('transactions.transaction_date', cutoffDate.toISOString())
          .order('transactions(transaction_date)', { ascending: false })
          .limit(1);

        if (historyMatch && historyMatch.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tx = (historyMatch[0] as any).transactions;
          result.met_by = {
            source: 'history',
            date: tx?.transaction_date,
            service_name: prereqServiceName,
          };
        }
      } else if (customer_id && prereq.history_window_days) {
        // No vehicle — check customer history without vehicle filter
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - prereq.history_window_days);

        const { data: historyMatch } = await supabase
          .from('transaction_items')
          .select(`
            id,
            transactions!inner(
              id,
              transaction_date,
              customer_id,
              status
            )
          `)
          .eq('service_id', prereqServiceId)
          .eq('transactions.customer_id', customer_id)
          .eq('transactions.status', 'completed')
          .gte('transactions.transaction_date', cutoffDate.toISOString())
          .order('transactions(transaction_date)', { ascending: false })
          .limit(1);

        if (historyMatch && historyMatch.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tx = (historyMatch[0] as any).transactions;
          result.met_by = {
            source: 'history',
            date: tx?.transaction_date,
            service_name: prereqServiceName,
          };
        }
      }

      results.push(result);
    }

    // OR logic: satisfied if ANY prerequisite is met
    const satisfied = results.some((r) => r.met_by != null);

    return NextResponse.json({
      has_prerequisites: true,
      satisfied,
      prerequisites: results,
    });
  } catch (err) {
    console.error('Check prerequisites error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
