'use client';

import { useState, useCallback, useRef } from 'react';
import { posFetch } from '../lib/pos-fetch';
import type { CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

export interface PrerequisiteInfo {
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

export interface PrerequisiteWarning {
  service: CatalogService;
  pricing: ServicePricing;
  vehicleSizeClass: VehicleSizeClass | null;
  perUnitQty?: number;
  prerequisites: PrerequisiteInfo[];
}

interface UsePrerequisiteCheckOptions {
  customerId?: string | null;
  vehicleId?: string | null;
  ticketServiceIds: string[];
}

export interface PrerequisiteCheckResult {
  canAdd: boolean;
  /** When satisfied by history, the note to display on the ticket item */
  prerequisiteNote?: string;
}

/**
 * Hook for checking service prerequisites before adding to ticket/quote.
 * Returns a check function and the warning state for the dialog.
 */
export function usePrerequisiteCheck(options: UsePrerequisiteCheckOptions) {
  const [warning, setWarning] = useState<PrerequisiteWarning | null>(null);
  const [checking, setChecking] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /**
   * Check prerequisites for a service. Returns { canAdd, prerequisiteNote }.
   * canAdd=true means the service can be added immediately.
   * canAdd=false means prerequisites are unmet (warning dialog will be shown).
   * prerequisiteNote is set when the prereq was satisfied by customer history.
   */
  const checkPrerequisites = useCallback(async (
    service: CatalogService,
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
  ): Promise<PrerequisiteCheckResult> => {
    const { customerId, vehicleId, ticketServiceIds } = optionsRef.current;

    setChecking(true);
    try {
      const res = await posFetch('/api/pos/services/check-prerequisites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: service.id,
          customer_id: customerId || undefined,
          vehicle_id: vehicleId || undefined,
          ticket_service_ids: ticketServiceIds,
        }),
      });

      if (!res.ok) {
        return { canAdd: true };
      }

      const data = await res.json();

      if (!data.has_prerequisites || data.satisfied) {
        // Build prerequisite note from history-satisfied prerequisites
        let prerequisiteNote: string | undefined;
        if (data.has_prerequisites && data.satisfied) {
          const historyMatch = (data.prerequisites as PrerequisiteInfo[]).find(
            (p) => p.met_by?.source === 'history'
          );
          if (historyMatch?.met_by) {
            const dateStr = historyMatch.met_by.date
              ? new Date(historyMatch.met_by.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
              : '';
            prerequisiteNote = `Prereq met: ${historyMatch.met_by.service_name || historyMatch.service_name}${dateStr ? ` (${dateStr})` : ''}`;
          }
        }
        return { canAdd: true, prerequisiteNote };
      }

      // Show warning dialog
      setWarning({
        service,
        pricing,
        vehicleSizeClass,
        perUnitQty,
        prerequisites: data.prerequisites,
      });
      return { canAdd: false };
    } catch {
      return { canAdd: true };
    } finally {
      setChecking(false);
    }
  }, []);

  const clearWarning = useCallback(() => {
    setWarning(null);
  }, []);

  return { warning, checking, checkPrerequisites, clearWarning };
}
