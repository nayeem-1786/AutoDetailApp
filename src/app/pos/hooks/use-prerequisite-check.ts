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
   * Check prerequisites for a service. Returns true if the service can be added
   * immediately (no prerequisites or all satisfied). Returns false if prerequisites
   * are unmet (warning dialog will be shown).
   */
  const checkPrerequisites = useCallback(async (
    service: CatalogService,
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
  ): Promise<boolean> => {
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
        // On API error, allow the add (fail open)
        return true;
      }

      const data = await res.json();

      if (!data.has_prerequisites || data.satisfied) {
        return true;
      }

      // Show warning dialog
      setWarning({
        service,
        pricing,
        vehicleSizeClass,
        perUnitQty,
        prerequisites: data.prerequisites,
      });
      return false;
    } catch {
      // Fail open on network errors
      return true;
    } finally {
      setChecking(false);
    }
  }, []);

  const clearWarning = useCallback(() => {
    setWarning(null);
  }, []);

  return { warning, checking, checkPrerequisites, clearWarning };
}
