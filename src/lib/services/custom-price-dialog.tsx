'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { STRIPE_MIN_DOLLARS } from '@/lib/utils/money';
import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Item 15f Layer 2 — `<CustomPriceDialog>`.
 *
 * Operator-facing prompt for services with `pricing_model === 'custom'`
 * (e.g., "Flood Damage / Mold Extraction"). The DB only stores a
 * `custom_starting_price` reference — the actual price is staff-assessed
 * per-job. This dialog captures that assessment, synthesizes a
 * `ServicePricing` row carrying the entered amount, and emits it through
 * the same `onSelect` contract used by `<ServicePricingPicker>` /
 * `<PerUnitPicker>`. Mounted only by `useServicePicker`'s `ActiveDialog`
 * surface; never imported by an operator surface directly.
 *
 * Visual conventions mirror `<PerUnitPicker>` in
 * `src/app/pos/components/service-pricing-picker.tsx:290-451` — same
 * primitives, same dialog shell, same button layout.
 *
 * Validation: entered amount must be a positive number ≥
 * `STRIPE_MIN_DOLLARS` (= $0.50, derived from `STRIPE_MIN_AMOUNT_CENTS`
 * per CLAUDE.md Rule 20). Anything else surfaces an inline error and the
 * Add button stays disabled.
 */

export interface CustomPriceDialogProps {
  open: boolean;
  service: CatalogService;
  vehicleSizeClass: VehicleSizeClass | null;
  onClose: () => void;
  /**
   * Receives the synthesized `ServicePricing` row containing the operator-
   * entered amount. Matches the signature used by `<ServicePricingPicker>`
   * so callers can wire it through the same `onSelect` slot.
   */
  onSelect: (
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
  ) => void;
}

/** Build the synthetic ServicePricing row a custom assessment commits. */
export function buildCustomPricing(
  service: CatalogService,
  amount: number,
): ServicePricing {
  return {
    id: `custom-${service.id}-${Date.now()}`,
    service_id: service.id,
    tier_name: 'custom',
    tier_label: 'Custom Assessment',
    price: amount,
    sale_price: null,
    display_order: 0,
    is_vehicle_size_aware: false,
    vehicle_size_sedan_price: null,
    vehicle_size_truck_suv_price: null,
    vehicle_size_suv_van_price: null,
    vehicle_size_exotic_price: null,
    vehicle_size_classic_price: null,
    max_qty: null,
    qty_label: null,
    created_at: '',
  };
}

export function CustomPriceDialog({
  open,
  service,
  vehicleSizeClass,
  onClose,
  onSelect,
}: CustomPriceDialogProps) {
  const startingPrice = service.custom_starting_price;
  const [raw, setRaw] = useState<string>('');

  // Reset the input every time the dialog reopens (or the service changes)
  // so a stale value can't carry between sessions.
  useEffect(() => {
    if (open) setRaw('');
  }, [open, service.id]);

  const trimmed = raw.trim();
  const parsed = trimmed === '' ? NaN : Number(trimmed);

  let errorMessage: string | null = null;
  if (trimmed !== '') {
    if (!Number.isFinite(parsed)) {
      errorMessage = 'Enter a numeric amount';
    } else if (parsed <= 0) {
      errorMessage = 'Amount must be greater than $0';
    } else if (parsed < STRIPE_MIN_DOLLARS) {
      errorMessage = `Amount must be at least $${STRIPE_MIN_DOLLARS.toFixed(2)}`;
    }
  }

  const canSubmit = trimmed !== '' && errorMessage === null;

  function handleAdd() {
    if (!canSubmit) return;
    const pricing = buildCustomPricing(service, parsed);
    onSelect(pricing, vehicleSizeClass, undefined);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogClose
        onClose={onClose}
        className="hidden pointer-fine:flex items-center justify-center h-8 w-8"
      />
      <DialogHeader>
        <DialogTitle>{service.name}</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {/* Service description (when present) */}
        {service.description && (
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
            {service.description}
          </p>
        )}

        {/* Starting-price reference (when present) */}
        <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
          {startingPrice != null ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                Starting from ${startingPrice.toFixed(2)}
              </span>{' '}
              — staff assessment required
            </p>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Staff assessment required — enter the final price
            </p>
          )}
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label
            htmlFor="custom-price-amount"
            className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Final price ($)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">$</span>
            <input
              id="custom-price-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={STRIPE_MIN_DOLLARS}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={
                startingPrice != null ? startingPrice.toFixed(2) : '0.00'
              }
              className={cn(
                'flex-1 rounded-lg border bg-white dark:bg-gray-900 px-3 py-3 text-lg tabular-nums text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2',
                errorMessage
                  ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-200 dark:focus:ring-red-900'
                  : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200 dark:focus:ring-blue-900',
              )}
            />
          </div>
          {errorMessage && (
            <p
              role="alert"
              className="mt-2 text-sm text-red-600 dark:text-red-400"
            >
              {errorMessage}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canSubmit}
            className={cn(
              'flex-1 rounded-lg py-3 text-sm font-semibold text-white transition-all min-h-[48px]',
              canSubmit
                ? 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 active:scale-[0.99]'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed',
            )}
          >
            Add Service
            {canSubmit && ' — $' + parsed.toFixed(2)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
