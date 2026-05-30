import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import {
  VEHICLE_CATEGORIES,
  categoryToCompatibilityKey,
  type VehicleCategory,
} from '@/lib/utils/vehicle-categories';

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
  /**
   * V1+V2 (Session #130) — true when the prerequisite service's
   * `vehicle_compatibility` includes the ticket vehicle's category
   * (mapped via `categoryToCompatibilityKey`), OR when the prereq has
   * no compatibility restriction, OR when no ticket vehicle is attached.
   * False ONLY when there IS a ticket vehicle and the prereq's
   * compatibility list explicitly excludes its category. The client uses
   * this to block the "Add prerequisite" auto-add path with a clear,
   * category-specific message instead of falling through to the misleading
   * "no price configured for this vehicle size" toast that surfaces when
   * `selectPricingTierForVehicle` returns null for a cross-category prereq.
   *
   * The flag is per-prereq because each prereq can have its own
   * compatibility list. `compatible_categories` is the prereq's allowed
   * category list (translated back from the "standard ↔ automobile"
   * compat-key vocabulary into operator-facing category labels) — used by
   * the client to build the error message without a separate lookup.
   * Empty array means "no restriction" (already implied by `is_compatible_with_vehicle = true`).
   */
  is_compatible_with_vehicle: boolean;
  compatible_categories: VehicleCategory[];
}

const ALL_VEHICLE_CATEGORY_SET = new Set<string>(VEHICLE_CATEGORIES);

/** Translate a service's `vehicle_compatibility` JSONB (compat-key vocabulary
 *  with "standard" for automobile) back into the `VehicleCategory` vocabulary. */
function compatibilityKeysToCategories(keys: string[]): VehicleCategory[] {
  const out: VehicleCategory[] = [];
  for (const key of keys) {
    const cat = key === 'standard' ? 'automobile' : key;
    if (ALL_VEHICLE_CATEGORY_SET.has(cat)) out.push(cat as VehicleCategory);
  }
  return out;
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
 *   prerequisites: PrerequisiteResult[],
 *   ticket_vehicle_category: VehicleCategory | null,
 * }
 *
 * V2 (Session #130): each prerequisite carries `is_compatible_with_vehicle`
 * and `compatible_categories` so the client can block the "Add prerequisite"
 * auto-add path on cross-category mismatches without filtering the list out
 * (Option A — transparency over filtering).
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { service_id, customer_id, vehicle_id, ticket_service_ids = [] } = body;

    if (!service_id) {
      return NextResponse.json({ error: 'service_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch prerequisites for this service. Embed `vehicle_compatibility` on
    //    the prerequisite service so V2 can compute the compat flag per row.
    const { data: prereqs, error } = await supabase
      .from('service_prerequisites')
      .select(`
        id,
        prerequisite_service_id,
        enforcement,
        history_window_days,
        warning_message,
        prerequisite_service:services!prerequisite_service_id(id, name, vehicle_compatibility)
      `)
      .eq('service_id', service_id);

    if (error) {
      console.error('Prerequisites fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch prerequisites' }, { status: 500 });
    }

    // 2. Fetch the ticket vehicle's category once (when provided) so each
    //    prereq's compat flag is computed against the same key. The vehicle_id
    //    arriving here is the same one the client gates on, so a soft-deleted
    //    or missing vehicle is treated as "no vehicle attached" (skip compat).
    let ticketVehicleCategory: VehicleCategory | null = null;
    let ticketCompatKey: string | null = null;
    if (vehicle_id) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('vehicle_category')
        .eq('id', vehicle_id)
        .maybeSingle();
      const raw = vehicle?.vehicle_category;
      if (raw && ALL_VEHICLE_CATEGORY_SET.has(raw)) {
        ticketVehicleCategory = raw as VehicleCategory;
        ticketCompatKey = categoryToCompatibilityKey(ticketVehicleCategory);
      }
    }

    if (!prereqs || prereqs.length === 0) {
      return NextResponse.json({
        has_prerequisites: false,
        satisfied: true,
        prerequisites: [],
        ticket_vehicle_category: ticketVehicleCategory,
      });
    }

    const results: PrerequisiteResult[] = [];
    const ticketServiceIdSet = new Set(ticket_service_ids);

    for (const prereq of prereqs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prereqService = prereq.prerequisite_service as any;
      const prereqServiceName = prereqService?.name || 'Unknown Service';
      const prereqServiceId = prereq.prerequisite_service_id;

      // V2 compat computation: read the prereq's vehicle_compatibility JSONB,
      // mirror the booking-route + catalog-browser pattern. No restriction
      // (empty/missing list) is universally compatible. No ticket vehicle =
      // no axis to evaluate against → also compatible (the dialog itself can
      // still surface other issues like history-window mismatches).
      const prereqCompat = Array.isArray(prereqService?.vehicle_compatibility)
        ? (prereqService.vehicle_compatibility as string[])
        : [];
      const compatibleCategories = compatibilityKeysToCategories(prereqCompat);
      const isCompatibleWithVehicle =
        !ticketCompatKey || prereqCompat.length === 0 || prereqCompat.includes(ticketCompatKey);

      const result: PrerequisiteResult = {
        service_name: prereqServiceName,
        enforcement: prereq.enforcement,
        required_within_days: prereq.history_window_days,
        warning_message: prereq.warning_message,
        is_compatible_with_vehicle: isCompatibleWithVehicle,
        compatible_categories: compatibleCategories,
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
      ticket_vehicle_category: ticketVehicleCategory,
    });
  } catch (err) {
    console.error('Check prerequisites error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
