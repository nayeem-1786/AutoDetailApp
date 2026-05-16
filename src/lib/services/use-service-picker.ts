'use client';

import { createElement, useCallback, useMemo, useState } from 'react';
import { CatalogBrowser } from '@/app/pos/components/catalog-browser';
import { ServicePricingPicker } from '@/app/pos/components/service-pricing-picker';
import { CustomPriceDialog } from './custom-price-dialog';
import { routeServiceTap } from './picker-engine';
import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Item 15f Layer 1 — `useServicePicker` hook.
 *
 * Returns a small surface that operator UIs can mount instead of building
 * a bespoke service-picker. The hook wraps the existing `<CatalogBrowser>`
 * and `<ServicePricingPicker>` components rather than duplicating them
 * (Rule 11 — Component Reuse). Layer 1 was a pure refactor: no real
 * surface had been migrated to consume the hook yet. The hook exists so
 * Layers 3a / 3c / 3d can replace bespoke pickers with `useServicePicker`
 * mounts.
 *
 * Item 15f Layer 2 — `custom` pricing_model support.
 *
 * Layer 2 adds the operator staff-assessment prompt for services with
 * `pricing_model === 'custom'` (e.g., "Flood Damage / Mold Extraction").
 * `<CatalogBrowser>` itself does NOT route to the custom dialog yet —
 * Layer 3a/3d will migrate the surfaces that need it. The hook now
 * exposes an imperative `tapService(service)` method that consumers can
 * call to route a tap through the canonical decision tree
 * (`routeServiceTap`) and either fire `onServiceSelected` immediately
 * (quick-add cases) or open the appropriate dialog.
 *
 * File extension is `.ts` per spec — uses `React.createElement` so this
 * module stays JSX-free and can live alongside the other
 * `src/lib/services/` pure modules (audit.ts, shippo.ts, etc.).
 *
 * What this hook does NOT do in Layer 2:
 *  - Does NOT migrate any existing surface to the hook (Layer 3a does that).
 *  - Does NOT change `<CatalogBrowser>` or `<ServicePricingPicker>`.
 *  - Does NOT alter `<CatalogBrowser>`'s internal routing — for taps that
 *    flow through the wrapped browser, the browser's own
 *    `handleTapServiceDirect` still owns routing and the hook's `tapService`
 *    is the alternate path consumers can use directly.
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
   * `<CatalogPane>`. Returns `null` when no service has been routed to a
   * dialog. Self-managed open/close state. Renders one of:
   *  - `<ServicePricingPicker>` (per-unit / scope / specialty / fallback)
   *  - `<CustomPriceDialog>` (Layer 2 — `pricing_model === 'custom'`)
   */
  ActiveDialog: () => React.ReactElement | null;

  /**
   * Pass-through of the caller-supplied set. Re-exposed for convenience
   * so consumers don't need to thread it through twice.
   */
  selectedServiceIds: Set<string>;

  /**
   * Imperative tap entry point. Runs the canonical `routeServiceTap`
   * decision tree and either:
   *  - emits `onServiceSelected` directly (quick-add cases), or
   *  - opens the corresponding dialog (per-unit / custom / fallback).
   *
   * Layer 3a/3d consumers (e.g., the migrated Jobs card and Admin
   * Appointment dialog) call this in response to operator taps from
   * their own selected-services list or any other entry point that
   * isn't `<CatalogBrowser>`'s native grid.
   */
  tapService: (service: CatalogService) => void;

  /**
   * Clear the hook's internal active-service state — closes the picker
   * dialog if open. Idempotent; safe to call when no dialog is open.
   */
  reset: () => void;
}

/**
 * Discriminated state — which dialog (if any) is currently active.
 *  - `picker`: `<ServicePricingPicker>` is open (per-unit, fallback, scope)
 *  - `custom`: `<CustomPriceDialog>` is open (`pricing_model === 'custom'`)
 *  - `null`: no dialog
 */
type ActiveDialogState =
  | { kind: 'picker'; service: CatalogService }
  | { kind: 'custom'; service: CatalogService }
  | null;

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

  const [activeDialog, setActiveDialog] = useState<ActiveDialogState>(null);

  // `<CatalogBrowser>` already handles tap routing internally and only
  // ever invokes its `onAddService` callback once the operator has
  // committed to adding a specific pricing tier (including selections
  // made from a fallback picker dialog the browser opened). So the
  // hook's catalog pane simply forwards that callback to
  // `onServiceSelected`.
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

  // Imperative tap entry point — runs the canonical decision tree and
  // routes to the right outcome. Used by Layer 3a/3d surfaces that want
  // to drive the picker outside `<CatalogBrowser>`'s native grid.
  const tapService = useCallback(
    (service: CatalogService) => {
      const route = routeServiceTap(service, vehicleSizeClass);
      switch (route.action) {
        case 'quick-add':
        case 'quick-add-synthetic-flat':
          onServiceSelected(service, route.pricing, vehicleSizeClass, undefined);
          return;
        case 'open-per-unit-picker':
        case 'open-picker-dialog':
          setActiveDialog({ kind: 'picker', service });
          return;
        case 'open-custom-price-dialog':
          setActiveDialog({ kind: 'custom', service });
          return;
      }
    },
    [vehicleSizeClass, onServiceSelected],
  );

  // Selection handler shared by both dialogs. The dialog itself supplies
  // the (possibly synthetic) ServicePricing row; the hook closes the
  // dialog and forwards to the caller.
  const handleDialogSelect = useCallback(
    (
      pricing: ServicePricing,
      vsc: VehicleSizeClass | null,
      perUnitQty?: number,
    ) => {
      if (!activeDialog) return;
      const svc = activeDialog.service;
      setActiveDialog(null);
      onServiceSelected(svc, pricing, vsc, perUnitQty);
    },
    [activeDialog, onServiceSelected],
  );

  const reset = useCallback(() => {
    setActiveDialog(null);
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
      if (!activeDialog) return null;
      if (activeDialog.kind === 'custom') {
        return createElement(CustomPriceDialog, {
          open: true,
          service: activeDialog.service,
          vehicleSizeClass,
          onClose: () => setActiveDialog(null),
          onSelect: handleDialogSelect,
        });
      }
      // kind === 'picker'
      return createElement(ServicePricingPicker, {
        open: true,
        onClose: () => setActiveDialog(null),
        service: activeDialog.service,
        vehicleSizeClass,
        vehicleSpecialtyTier,
        onSelect: handleDialogSelect,
      });
    };

    return {
      CatalogPane,
      ActiveDialog,
      selectedServiceIds,
      tapService,
      reset,
    };
  }, [
    search,
    vehicleSizeClass,
    vehicleSpecialtyTier,
    selectedServiceIds,
    handleAddService,
    activeDialog,
    handleDialogSelect,
    tapService,
    reset,
  ]);
}
