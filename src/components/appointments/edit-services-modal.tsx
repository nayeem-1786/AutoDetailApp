'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import type { VehicleSizeClass } from '@/lib/supabase/types';

/**
 * Item 15a — Edit Services modal for the Admin Appointment dialog.
 *
 * Mirrors the visual pattern of the POS Jobs card inline "Edit Services"
 * modal (`src/app/pos/jobs/components/job-detail.tsx:1920-2005`) but
 * targets `appointment_services` (with cascade to `jobs.services` JSONB
 * if a job is linked — handled server-side by
 * `/api/admin/appointments/[id]/services`).
 *
 * Pricing resolution: prefer the service tier matching the appointment's
 * vehicle size_class (when the service has vehicle-size-aware tiers);
 * otherwise fall back to flat_price, then to the first tier. Same
 * heuristic the Jobs card uses.
 *
 * Permission gating (`appointments.reschedule`) is enforced server-side;
 * the dialog gates the visibility of the trigger button.
 */

interface ServicePricingRow {
  id: string;
  tier_name: string;
  price: number;
}

interface AdminCatalogService {
  id: string;
  name: string;
  flat_price: number | null;
  pricing_model: string | null;
  pricing?: ServicePricingRow[];
}

export interface SelectedAppointmentService {
  service_id: string;
  service_name: string;
  price_at_booking: number;
  tier_name: string | null;
}

interface EditServicesModalProps {
  open: boolean;
  appointmentId: string;
  /**
   * Vehicle size class on the appointment — used to resolve the tier
   * price when a service has vehicle-size-aware pricing.
   */
  vehicleSizeClass: VehicleSizeClass | null;
  /** Initial selection — preloaded from the appointment's appointment_services rows. */
  initialServices: SelectedAppointmentService[];
  onClose: () => void;
  /**
   * Called after a successful PUT. Receives the cascaded job id (if any)
   * so the parent can decide whether to refetch downstream data.
   */
  onSaved: (result: {
    selected: SelectedAppointmentService[];
    cascadedToJobId: string | null;
    newSubtotal: number;
    newTotal: number;
  }) => void;
}

function resolveServicePrice(
  svc: AdminCatalogService,
  sizeClass: VehicleSizeClass | null
): { price: number; tier_name: string | null } {
  // 1. Try size-aware tier match.
  if (sizeClass && svc.pricing && svc.pricing.length > 0) {
    const sizeTier = svc.pricing.find((p) => p.tier_name === sizeClass);
    if (sizeTier) return { price: Number(sizeTier.price), tier_name: sizeTier.tier_name };
  }
  // 2. Flat price.
  if (svc.flat_price != null) return { price: Number(svc.flat_price), tier_name: null };
  // 3. First tier as fallback.
  if (svc.pricing && svc.pricing.length > 0) {
    const t = svc.pricing[0];
    return { price: Number(t.price), tier_name: t.tier_name };
  }
  return { price: 0, tier_name: null };
}

export function EditServicesModal({
  open,
  appointmentId,
  vehicleSizeClass,
  initialServices,
  onClose,
  onSaved,
}: EditServicesModalProps) {
  const [search, setSearch] = useState('');
  const [allServices, setAllServices] = useState<AdminCatalogService[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SelectedAppointmentService[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelected([...initialServices]);
    setSearch('');
    setLoading(true);
    fetch('/api/admin/services/active', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json = (await res.json()) as { data: AdminCatalogService[] };
        setAllServices(json.data ?? []);
      })
      .catch(() => {
        toast.error('Failed to load services');
        setAllServices([]);
      })
      .finally(() => setLoading(false));
  }, [open, initialServices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allServices;
    const q = search.toLowerCase();
    return allServices.filter((s) => s.name.toLowerCase().includes(q));
  }, [allServices, search]);

  function handleToggle(svc: AdminCatalogService) {
    setSelected((prev) => {
      const exists = prev.find((s) => s.service_id === svc.id);
      if (exists) return prev.filter((s) => s.service_id !== svc.id);
      const { price, tier_name } = resolveServicePrice(svc, vehicleSizeClass);
      return [
        ...prev,
        {
          service_id: svc.id,
          service_name: svc.name,
          price_at_booking: price,
          tier_name,
        },
      ];
    });
  }

  async function handleSave() {
    if (selected.length === 0) {
      toast.error('At least one service is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/services`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            services: selected.map((s) => ({
              service_id: s.service_id,
              price_at_booking: s.price_at_booking,
              tier_name: s.tier_name,
            })),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to update services');
        return;
      }
      const newSubtotal = Number(json?.data?.subtotal ?? 0);
      const newTotal = Number(json?.data?.total_amount ?? 0);
      toast.success('Services updated');
      onSaved({
        selected,
        cascadedToJobId: json?.cascaded_to_job_id ?? null,
        newSubtotal,
        newTotal,
      });
    } catch {
      toast.error('Failed to update services');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const total = selected.reduce((sum, s) => sum + s.price_at_booking, 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-t-xl bg-white shadow-xl sm:max-h-[80vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Services
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '50vh' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No services found
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((svc) => {
                const isSelected = selected.some(
                  (s) => s.service_id === svc.id
                );
                const { price } = resolveServicePrice(svc, vehicleSizeClass);
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => handleToggle(svc)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors',
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {svc.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(price)}
                        {svc.pricing_model && svc.pricing_model !== 'flat' &&
                          ' (starting)'}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-gray-200 px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {selected.length} service{selected.length !== 1 ? 's' : ''}
            </span>
            <span className="font-medium text-gray-900">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || selected.length === 0}
              className="flex-1"
            >
              {saving ? 'Saving...' : 'Update Services'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
