'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { selectPricingTierForVehicle } from '@/lib/services/picker-engine';
import {
  usePrerequisiteCheck,
  type PrerequisiteCheckResult,
} from './use-prerequisite-check';
import { PrerequisiteWarningDialog } from '../components/prerequisite-warning-dialog';
import { ManagerPinDialog } from '../components/manager-pin-dialog';
import type { CatalogService } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Optional provenance forwarded to the surface's `onAdd` and on to the
 * reducer's `ADD_SERVICE` action. `prerequisiteNote` is the
 * "Prereq met: …" / "Prereq overridden by …" line; `prerequisiteForServiceId`
 * tags an auto-added prerequisite with the dependent service it unlocks.
 */
export interface ValidatedAddOpts {
  prerequisiteNote?: string;
  prerequisiteForServiceId?: string;
}

/** Pending "add-on added solo" warning awaiting a manager-PIN decision. */
interface AddOnSoloWarning {
  service: CatalogService;
  pricing: ServicePricing;
  vehicleSizeClass: VehicleSizeClass | null;
  perUnitQty?: number;
}

interface UseValidatedServiceAddOptions {
  /** Surface context — Sale ticket OR quote customer/vehicle/line-items. */
  customerId: string | null | undefined;
  vehicleId: string | null | undefined;
  /** Service IDs already on the surface's ticket/quote (for prereq + anchor detection). */
  serviceIds: string[];
  /** Catalog — used to resolve add-on anchors and to find/price auto-added prerequisites. */
  services: CatalogService[];
  /** Resolved vehicle size class for prerequisite auto-add tier selection. */
  vehicleSizeClass: VehicleSizeClass | null;
  /**
   * Commit primitive. Owns surface-specific dispatch/dup-check/per-unit logic.
   * The helper calls this AFTER validation passes (or after an override).
   */
  onAdd: (
    service: CatalogService,
    pricing: ServicePricing,
    vehicleSizeClass: VehicleSizeClass | null,
    perUnitQty?: number,
    opts?: ValidatedAddOpts,
  ) => void | Promise<void>;
  /**
   * True when `onAdd` shows its own "Added …" success toast (callback / quote
   * mode). When false (dispatch mode — Sale ticket, register tab), the helper
   * fires the success toast for the prerequisite auto-add and override paths it
   * owns, mirroring catalog-browser's legacy `!onAddService` guard.
   */
  onAddHandlesToast?: boolean;
}

/**
 * Surface-agnostic add-with-validation helper (canonical add-time gate —
 * CLAUDE.md Rule 22). The gate order is LOCKED (#122 corrective):
 *
 *   1. **Prerequisite check is PRIMARY.** Delegates to `usePrerequisiteCheck`.
 *      - Prereqs configured + unmet → the `PrerequisiteWarningDialog` (add a
 *        prerequisite, or manager-override behind its own Override button). The
 *        add-on-only gate NEVER fires in this case.
 *      - Prereqs configured + satisfied → commit directly (gate skipped).
 *   2. **Add-on-only gate is conditional.** It fires ONLY when the service has
 *      **no prerequisites configured** (a pure add-on with no parent
 *      dependency) AND is classified `addon_only` AND is solo (no `primary`/
 *      `both` anchor on the order) → warn with a manager-PIN override (reuses
 *      `pos.override_prerequisites`). On confirm it commits; on cancel it aborts.
 *
 * Rationale (#122): when prerequisites exist they ARE the gate — a satisfied or
 * overridden prerequisite implicitly authorizes the add-on, so a second
 * manager-PIN for the add-on-only classification would be redundant and put the
 * PIN dialog wrongly in front of the prerequisite dialog.
 *
 * The helper OWNS both dialogs (returned as `dialogs`) and the prerequisite
 * auto-add orchestration that was previously duplicated in catalog-browser and
 * quote-builder.
 *
 * Consumers call `addService(...)` for direct add funnels and pass
 * `runValidations` to sub-dialogs (e.g. `<ServiceDetailDialog onPrerequisiteCheck>`)
 * that build their own pricing but must route validation through here.
 */
export function useValidatedServiceAdd(options: UseValidatedServiceAddOptions) {
  const {
    customerId,
    vehicleId,
    serviceIds,
    services,
    vehicleSizeClass,
    onAdd,
    onAddHandlesToast = false,
  } = options;

  const {
    warning: prereqWarning,
    checkPrerequisites,
    clearWarning: clearPrereqWarning,
  } = usePrerequisiteCheck({ customerId, vehicleId, ticketServiceIds: serviceIds });

  const [addOnSoloWarning, setAddOnSoloWarning] = useState<AddOnSoloWarning | null>(null);
  const [showAddOnSoloPin, setShowAddOnSoloPin] = useState(false);

  /**
   * An add-on is "solo" when it is classified `addon_only` and the ticket/quote
   * has no anchor service it could attach to. An anchor is any OTHER line item
   * whose classification is `primary` or `both` (i.e. can stand alone / act as
   * a parent). Unknown ids (custom items, products) are not anchors.
   */
  const servicesById = useMemo(() => {
    const map = new Map<string, CatalogService>();
    for (const s of services) map.set(s.id, s);
    return map;
  }, [services]);

  const isAddOnSolo = useCallback(
    (service: CatalogService): boolean => {
      if (service.classification !== 'addon_only') return false;
      const hasAnchor = serviceIds.some((id) => {
        if (id === service.id) return false;
        const other = servicesById.get(id);
        return other != null && (other.classification === 'primary' || other.classification === 'both');
      });
      return !hasAnchor;
    },
    [serviceIds, servicesById],
  );

  /**
   * Run the gates without committing (LOCKED order, #122). Returns a
   * `PrerequisiteCheckResult` so it can be passed straight to
   * `<ServiceDetailDialog onPrerequisiteCheck>`.
   *
   * 1. Prerequisite check FIRST (primary). Unmet → the prerequisite dialog is
   *    shown (`canAdd: false`); the add-on-only gate does not fire.
   * 2. Only when prereqs pass AND none are configured does the add-on-only gate
   *    apply: a solo `addon_only` add raises the add-on-solo warning
   *    (`canAdd: false`); its override re-enters the pipeline via `onAdd`.
   */
  const runValidations = useCallback(
    async (
      service: CatalogService,
      pricing: ServicePricing,
      vsc: VehicleSizeClass | null,
      perUnitQty?: number,
    ): Promise<PrerequisiteCheckResult> => {
      const result = await checkPrerequisites(service, pricing, vsc, perUnitQty);
      if (!result.canAdd) return result; // prerequisite dialog is showing
      // Prereqs passed. The add-on-only gate applies ONLY when the service has
      // no prerequisites configured (a pure add-on) — when prereqs exist, they
      // were the gate.
      if (!result.hasPrerequisites && isAddOnSolo(service)) {
        setAddOnSoloWarning({ service, pricing, vehicleSizeClass: vsc, perUnitQty });
        return { canAdd: false, hasPrerequisites: false };
      }
      return result;
    },
    [isAddOnSolo, checkPrerequisites],
  );

  /**
   * Full pipeline for direct add funnels: add-on gate → prerequisite check →
   * commit. Returns true when it proceeded to `onAdd` (the caller may then fire
   * its own success toast), false when blocked pending a dialog decision.
   */
  const addService = useCallback(
    async (
      service: CatalogService,
      pricing: ServicePricing,
      vsc: VehicleSizeClass | null,
      perUnitQty?: number,
    ): Promise<boolean> => {
      const result = await runValidations(service, pricing, vsc, perUnitQty);
      if (!result.canAdd) return false;
      await onAdd(service, pricing, vsc, perUnitQty, result.prerequisiteNote ? { prerequisiteNote: result.prerequisiteNote } : undefined);
      return true;
    },
    [runValidations, onAdd],
  );

  // ─── Prerequisite warning handlers ───────────────────────────────

  /** Override the prerequisite: add the original service with an override note. */
  const handlePrereqOverride = useCallback(
    async (managerName?: string) => {
      if (!prereqWarning) return;
      const { service, pricing, vehicleSizeClass: vsc, perUnitQty } = prereqWarning;
      clearPrereqWarning();
      const note = managerName ? `Prereq overridden by ${managerName}` : undefined;
      await onAdd(service, pricing, vsc, perUnitQty, note ? { prerequisiteNote: note } : undefined);
      if (!onAddHandlesToast) toast.success(`Added ${service.name}`);
    },
    [prereqWarning, clearPrereqWarning, onAdd, onAddHandlesToast],
  );

  /** Add a prerequisite service first (priced for this vehicle), then the original. */
  const handleAddPrerequisite = useCallback(
    async (prereqServiceName: string) => {
      if (!prereqWarning) return;
      const {
        service: originalService,
        pricing: originalPricing,
        vehicleSizeClass: originalVsc,
        perUnitQty: originalPerUnitQty,
      } = prereqWarning;
      clearPrereqWarning();

      const prereqService = services.find((s) => s.name === prereqServiceName);
      if (!prereqService) {
        toast.error(`Service "${prereqServiceName}" not found in catalog`);
        return;
      }

      // Tag the prerequisite with the dependent service. Select the tier for
      // THIS vehicle's size_class via the canonical engine — NOT prereqPricing[0]
      // (always the sedan/first tier), which mispriced size-aware prerequisites
      // (see docs/dev/POS_PREREQUISITE_PRICING_AUDIT.md).
      const prereqOpts: ValidatedAddOpts = { prerequisiteForServiceId: originalService.id };
      const prereqPricing = prereqService.pricing ?? [];
      if (prereqPricing.length > 0) {
        const tier = selectPricingTierForVehicle(prereqPricing, vehicleSizeClass);
        if (!tier) {
          // No tier matches this vehicle size (data gap). The prerequisite is
          // required-same-ticket, so if it can't be priced we block the whole
          // add — neither the prerequisite nor the dependent add-on is added.
          toast.error(`Cannot auto-add "${prereqService.name}": no price configured for this vehicle size. Add it manually.`);
          return;
        }
        await onAdd(prereqService, tier, vehicleSizeClass, undefined, prereqOpts);
        if (!onAddHandlesToast) toast.success(`Added ${prereqService.name}`);
      } else if (prereqService.flat_price != null) {
        await onAdd(prereqService, buildFlatPricing(prereqService), vehicleSizeClass, undefined, prereqOpts);
        if (!onAddHandlesToast) toast.success(`Added ${prereqService.name}`);
      } else {
        toast.error(`Cannot auto-add ${prereqService.name} — no pricing available`);
        return;
      }

      // Then add the original service (prerequisite is now satisfied).
      await onAdd(originalService, originalPricing, originalVsc, originalPerUnitQty);
      if (!onAddHandlesToast) toast.success(`Added ${originalService.name}`);
    },
    [prereqWarning, clearPrereqWarning, services, vehicleSizeClass, onAdd, onAddHandlesToast],
  );

  // ─── Add-on-solo warning handlers ────────────────────────────────

  const clearAddOnSoloWarning = useCallback(() => {
    setAddOnSoloWarning(null);
    setShowAddOnSoloPin(false);
  }, []);

  /**
   * Manager authorized selling the add-on solo. The add-on-solo warning only
   * appears when the service has NO prerequisites (already verified in
   * `runValidations`), so there is nothing further to check — commit directly.
   * The override is not annotated on the item (no schema field); the manager
   * identity is captured server-side by the verify-override endpoint.
   */
  const handleAddOnSoloOverride = useCallback(async () => {
    const w = addOnSoloWarning;
    if (!w) return;
    clearAddOnSoloWarning();
    await onAdd(w.service, w.pricing, w.vehicleSizeClass, w.perUnitQty);
    if (!onAddHandlesToast) toast.success(`Added ${w.service.name}`);
  }, [addOnSoloWarning, clearAddOnSoloWarning, onAdd, onAddHandlesToast]);

  // ─── Dialogs (owned by the helper, rendered by consumers) ────────

  const dialogs = (
    <>
      {prereqWarning && (
        <PrerequisiteWarningDialog
          warning={prereqWarning}
          onClose={clearPrereqWarning}
          onOverride={handlePrereqOverride}
          onAddPrerequisite={handleAddPrerequisite}
        />
      )}
      {addOnSoloWarning && (
        <Dialog open onOpenChange={(open) => { if (!open) clearAddOnSoloWarning(); }}>
          <DialogClose onClose={clearAddOnSoloWarning} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Add-On Service
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{addOnSoloWarning.service.name}</strong> is an
              add-on service and is meant to be sold alongside a primary service. There is no primary
              service on this order for it to attach to. Add it anyway?
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={clearAddOnSoloWarning}>
                Cancel
              </Button>
              <Button onClick={() => setShowAddOnSoloPin(true)} className="gap-1.5">
                <ShieldAlert className="h-4 w-4" />
                Manager Override
              </Button>
            </div>
          </div>
          {showAddOnSoloPin && (
            <ManagerPinDialog
              permissionKey="pos.override_prerequisites"
              onSuccess={() => {
                setShowAddOnSoloPin(false);
                handleAddOnSoloOverride();
              }}
              onCancel={() => setShowAddOnSoloPin(false)}
            />
          )}
        </Dialog>
      )}
    </>
  );

  return { addService, runValidations, dialogs };
}

/** Synthetic single-tier pricing row for a flat-price service (no pricing tiers). */
function buildFlatPricing(service: CatalogService): ServicePricing {
  return {
    id: 'flat',
    service_id: service.id,
    tier_name: 'default',
    tier_label: null,
    price: service.flat_price!,
    sale_price: service.sale_price ?? null,
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
