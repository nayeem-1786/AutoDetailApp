'use client';

import { createElement, useCallback, useMemo, useState } from 'react';
import { CatalogBrowser } from '@/app/pos/components/catalog-browser';
import { ServicePricingPicker } from '@/app/pos/components/service-pricing-picker';
import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Item 15f Layer 1 — `useServicePicker` hook.
 *
 * Returns a small surface that operator UIs can mount instead of building
 * a bespoke service-picker. The hook wraps the existing `<CatalogBrowser>`
 * and `<ServicePricingPicker>` components rather than duplicating them
 * (Rule 11 — Component Reuse). Layer 1 is a pure refactor: no real surface
 * has been migrated to consume the hook yet. The hook exists so that
 * Layers 3a / 3c can replace bespoke pickers with `useServicePicker` mounts.
 *
 * File extension is `.ts` per spec — uses `React.createElement` so this
 * module stays JSX-free and can live alongside the other `src/lib/services/`
 * pure modules (audit.ts, shippo.ts, etc.).
 *
 * What this hook does NOT do in Layer 1:
 *  - Does NOT handle `pricing_model === 'custom'` (Layer 2 adds that UX).
 *  - Does NOT change the visual UX of either wrapped component.
 *  - Does NOT alter `<CatalogBrowser>`'s internal routing — taps still flow
 *    through `handleTapServiceDirect` / `handleTapService` inside the
 *    browser; the hook simply receives the `onAddService` callback the
 *    browser already emits and re-dispatches it.
 */

export interface ServicePickerOptions {
  /**
   * Vehicle size class on the ticket/appointment/job. Drives tier
   * resolution and the picker's per-size disable/highlight behavior.
   * `null` → no vehicle attached (operator sees all size buttons).
   */
  vehicleSizeClass: VehicleSizeClass | null;

  /**
   * Vehicle specialty tier (`vehicles.specialty_tier`). Drives the
   * `pricing_model === 'specialty'` highlight in `<ServicePricingPicker>`.
   * `null` → no specialty.
   */
  vehicleSpecialtyTier: string | null;

  /**
   * Service IDs already on the ticket/appointment/job. Renders a checkmark
   * indicator in the catalog grid and short-circuits "already added"
   * warnings inside `<CatalogBrowser>`.
   */
  selectedServiceIds: Set<string>;

  /**
   * Free-text search forwarded to `<CatalogBrowser>`. Caller owns the input.
   */
  search?: string;

  /**
   * Fired when the user picks (or quick-adds) a service. Receives the
   * resolved `ServicePricing` row, the size class the price was resolved
   * against, and the optional per-unit/tier quantity. The hook does not
   * mutate any external state — the caller is responsible for adding the
   * line item to their ticket / appointment / job.
   */
  onServiceSelected: (
    service: CatalogService,
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
  ) => void;
}

export interface ServicePickerSurface {
  /**
   * The catalog browsing pane. Mount inside whatever layout the caller
   * uses. Internally renders `<CatalogBrowser type="services">`.
   */
  CatalogPane: () => React.ReactElement;

  /**
   * The active picker dialog. Mount once at the same level as
   * `<CatalogPane>`. Returns `null` when no service has been routed to
   * `open-picker-dialog`. Self-managed open/close state.
   */
  ActiveDialog: () => React.ReactElement | null;

  /**
   * Pass-through of the caller-supplied set. Re-exposed for convenience
   * so consumers don't need to thread it through twice.
   */
  selectedServiceIds: Set<string>;

  /**
   * Clear the hook's internal active-service state — closes the picker
   * dialog if open. Idempotent; safe to call when no dialog is open.
   */
  reset: () => void;
}

export function useServicePicker(
  options: ServicePickerOptions,
): ServicePickerSurface {
  const {
    vehicleSizeClass,
    vehicleSpecialtyTier,
    selectedServiceIds,
    search = '',
    onServiceSelected,
  } = options;

  // `<CatalogBrowser>` already handles tap routing (per-unit / quick-add /
  // open-picker) internally and only ever invokes its `onAddService`
  // callback when the operator has committed to adding a specific pricing
  // tier — including selection from a fallback picker dialog the browser
  // opened. So the hook's catalog pane simply forwards that callback to
  // `onServiceSelected`.
  //
  // The `ActiveDialog` surface is reserved for callers that want to drive
  // the picker independently of the catalog pane (e.g., opening the
  // picker for a service the operator clicked from a different list).
  // It is wired through the `activeService` state below.
  const [activeService, setActiveService] = useState<CatalogService | null>(null);

  const handleAddService = useCallback(
    (
      service: CatalogService,
      pricing: ServicePricing,
      vsc: VehicleSizeClass | null,
      perUnitQty?: number,
    ) => {
      onServiceSelected(service, pricing, vsc, perUnitQty);
    },
    [onServiceSelected],
  );

  const handleDialogSelect = useCallback(
    (
      pricing: ServicePricing,
      vsc: VehicleSizeClass | null,
      perUnitQty?: number,
    ) => {
      if (!activeService) return;
      const svc = activeService;
      setActiveService(null);
      onServiceSelected(svc, pricing, vsc, perUnitQty);
    },
    [activeService, onServiceSelected],
  );

  const reset = useCallback(() => {
    setActiveService(null);
  }, []);

  return useMemo<ServicePickerSurface>(() => {
    const CatalogPane = function CatalogPane() {
      return createElement(CatalogBrowser, {
        type: 'services',
        search,
        vehicleSizeOverride: vehicleSizeClass,
        vehicleSpecialtyTierOverride: vehicleSpecialtyTier,
        addedServiceIds: selectedServiceIds,
        onAddService: handleAddService,
      });
    };

    const ActiveDialog = function ActiveDialog() {
      if (!activeService) return null;
      return createElement(ServicePricingPicker, {
        open: true,
        onClose: () => setActiveService(null),
        service: activeService,
        vehicleSizeClass,
        vehicleSpecialtyTier,
        onSelect: handleDialogSelect,
      });
    };

    return {
      CatalogPane,
      ActiveDialog,
      selectedServiceIds,
      reset,
    };
  }, [
    search,
    vehicleSizeClass,
    vehicleSpecialtyTier,
    selectedServiceIds,
    handleAddService,
    activeService,
    handleDialogSelect,
    reset,
  ]);
}
