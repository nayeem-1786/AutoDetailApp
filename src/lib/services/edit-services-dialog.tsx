'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import { useServicePicker } from './use-service-picker';
import type { CatalogService } from '@/app/pos/types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Item 15f Layer 3a — `<EditServicesDialog>`.
 *
 * Shared 2-pane dialog wrapper around `useServicePicker`. The dialog is
 * UI-only and fully controlled — the caller owns the selected-services
 * state and the persistence call. Designed to be the canonical Edit
 * Services surface for any operator UI that needs to add/remove services
 * on an existing ticket (job, appointment, future POS-Appointments
 * modal). Per CLAUDE.md Rule 22, no pricing math happens here — the hook
 * routes through the canonical engine.
 *
 * **Layer 3a scope:** wired up on the POS Jobs card. The Admin Appointment
 * dialog continues to use Item 15a's `<EditServicesModal>` for now — that
 * surface lives outside the POS provider tree and the underlying
 * `<CatalogBrowser>` uses `useTicket()` which throws when no provider is
 * mounted. The Admin migration is deferred to a follow-up that decouples
 * `<CatalogBrowser>` from POS contexts (see ROADMAP-13-ITEMS Item 15f
 * Notes / decisions log for the trace).
 */

export interface SelectedService {
  /**
   * Stable identifier used to render + remove. For real catalog services
   * this is `services.id` (a UUID). For custom assessments built by
   * `<CustomPriceDialog>` this is the synthetic
   * `custom-${service.id}-${Date.now()}` id from `buildCustomPricing`.
   */
  id: string;
  name: string;
  price: number;
  tier_name?: string | null;
  quantity?: number;
}

export interface EditServicesDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  vehicleSizeClass: VehicleSizeClass | null;
  vehicleSpecialtyTier: string | null;
  /** Current selection — caller-owned. */
  selectedServices: SelectedService[];
  /** Fired when the hook resolves a tap (quick-add, picker confirm, custom-price confirm). */
  onServiceAdded: (
    service: CatalogService,
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
  ) => void;
  /**
   * Fired when the operator removes a service from the selected list.
   * Receives the same `id` value the caller wrote into `selectedServices`.
   */
  onServiceRemoved: (serviceId: string) => void;
  /** Fired when the operator presses Save. Caller persists. */
  onSave: () => void;
  /** Optional: disables Save + shows a spinner. */
  isSaving?: boolean;
  /** Optional: surfaced beneath the Save button. */
  saveError?: string | null;
  /** Optional override of the Save button label (default: "Save Changes"). */
  saveLabel?: string;
}

export function EditServicesDialog({
  open,
  onClose,
  title,
  vehicleSizeClass,
  vehicleSpecialtyTier,
  selectedServices,
  onServiceAdded,
  onServiceRemoved,
  onSave,
  isSaving = false,
  saveError = null,
  saveLabel = 'Save Changes',
}: EditServicesDialogProps) {
  const [search, setSearch] = useState('');

  // Derive the selected-service IDs Set the hook uses to render the
  // catalog-grid checkmark indicator + short-circuit duplicate adds.
  const selectedServiceIds = useMemo(
    () => new Set(selectedServices.map((s) => s.id)),
    [selectedServices],
  );

  const surface = useServicePicker({
    vehicleSizeClass,
    vehicleSpecialtyTier,
    selectedServiceIds,
    search,
    onServiceSelected: onServiceAdded,
  });

  const total = useMemo(
    () => selectedServices.reduce((sum, s) => sum + s.price * (s.quantity ?? 1), 0),
    [selectedServices],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      contentClassName="max-w-4xl"
    >
      <DialogClose
        onClose={onClose}
        className="hidden pointer-fine:flex items-center justify-center h-8 w-8"
      />
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 px-6 pb-2 pt-2 md:grid-cols-[1fr_320px]">
        {/* Left pane — catalog browser */}
        <div className="flex max-h-[60vh] min-h-[400px] flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services..."
                aria-label="Search services"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 py-2.5 pl-10 pr-4 text-base sm:text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800">
            <surface.CatalogPane />
          </div>
        </div>

        {/* Right pane — selected services list */}
        <div className="flex max-h-[60vh] min-h-[400px] flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="border-b border-gray-200 dark:border-gray-700 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Selected ({selectedServices.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {selectedServices.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                No services selected yet. Tap a service on the left to add it.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selectedServices.map((s) => {
                  const qty = s.quantity ?? 1;
                  const lineTotal = s.price * qty;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {s.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {qty > 1 && (
                            <span className="tabular-nums">×{qty} · </span>
                          )}
                          {formatCurrency(lineTotal)}
                          {s.tier_name && qty === 1 && (
                            <span className="ml-1 text-gray-400 dark:text-gray-500">
                              · {s.tier_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onServiceRemoved(s.id)}
                        aria-label={`Remove ${s.name}`}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        {saveError && (
          <p
            role="alert"
            className="mb-3 text-sm text-red-600 dark:text-red-400"
          >
            {saveError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={isSaving || selectedServices.length === 0}
            className={cn(
              'min-w-[140px]',
              isSaving && 'cursor-not-allowed',
            )}
          >
            {isSaving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </div>

      {/* Active dialog stack (picker / custom-price prompt) from the hook */}
      <surface.ActiveDialog />
    </Dialog>
  );
}
