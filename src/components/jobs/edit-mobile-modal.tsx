'use client';

import { useEffect, useRef, useState } from 'react';
import { Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/format';
import { posFetch } from '@/app/pos/lib/pos-fetch';

/**
 * Phase Mobile-1.9 — shared edit modal for the full mobile picker.
 *
 * Used by both the POS jobs detail card and the admin appointment
 * detail dialog. `mode` selects the underlying auth surface (HMAC POS
 * vs. session admin) and routes through the matching GET zones +
 * PATCH mobile-service endpoints. The two endpoints have identical
 * request/response shapes, so the modal's submit logic is shared.
 *
 * Live zone reads (LOCKED-7.5): the zone dropdown queries the live
 * `mobile_zones` table every time the modal opens — admin renames /
 * repricing are reflected the next time any picker opens.
 *
 * Snapshot at save time (LOCKED-7.6): the server snapshots zone name +
 * surcharge from the live row at save time and freezes them on the
 * appointment. Subsequent zone edits don't cascade to historical
 * records (LOCKED-7.7).
 */

interface MobileZoneRow {
  id: string;
  name: string;
  surcharge: number;
  is_available: boolean;
}

export interface EditMobileModalInitial {
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_surcharge: number | null;
  mobile_address: string | null;
  mobile_zone_name_snapshot: string | null;
}

export interface EditMobileModalSavedResult {
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_surcharge: number;
  mobile_address: string | null;
  mobile_zone_name_snapshot: string | null;
  subtotal: number;
  total_amount: number;
  mismatch_amount: number;
}

interface EditMobileModalProps {
  open: boolean;
  mode: 'pos' | 'admin';
  appointmentId: string;
  initial: EditMobileModalInitial;
  onClose: () => void;
  onSaved: (result: EditMobileModalSavedResult) => void;
}

const CUSTOM_VALUE = '__custom__';

export function EditMobileModal({
  open,
  mode,
  appointmentId,
  initial,
  onClose,
  onSaved,
}: EditMobileModalProps) {
  const [zones, setZones] = useState<MobileZoneRow[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  // `zonesLoaded` flips true ONCE the fetch completes (success or error)
  // so the resync effect can distinguish "haven't fetched yet" from
  // "fetched and got an empty list". Reset on every open so re-opens
  // wait for a fresh fetch.
  const [zonesLoaded, setZonesLoaded] = useState(false);

  const [isMobile, setIsMobile] = useState(initial.is_mobile);
  const [zoneId, setZoneId] = useState<string | null>(initial.mobile_zone_id);
  // `isCustom` is the picker's UI hint for the Custom path. True when
  // the cashier picked "Custom…" from the dropdown. Server uses this to
  // distinguish from "no zone selected" (Phase Mobile-1.2 rationale).
  const [isCustom, setIsCustom] = useState(
    initial.is_mobile && !initial.mobile_zone_id && Number(initial.mobile_surcharge ?? 0) > 0
  );
  const [surcharge, setSurcharge] = useState<number>(
    Number(initial.mobile_surcharge ?? 0)
  );
  const [customLabel, setCustomLabel] = useState(
    initial.mobile_zone_name_snapshot ?? ''
  );
  const [address, setAddress] = useState(initial.mobile_address ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    zone?: string;
    custom?: string;
    address?: string;
  }>({});

  const addressInputRef = useRef<HTMLInputElement>(null);

  // Re-seed non-zone state on open. Zone state (zoneId + isCustom) is
  // intentionally left provisional here — the resync effect below
  // computes its authoritative value once live zones are loaded, so
  // we don't have to guess from `initial` alone (which doesn't know
  // about Settings renames or deleted zones).
  useEffect(() => {
    if (!open) return;
    setIsMobile(initial.is_mobile);
    setSurcharge(Number(initial.mobile_surcharge ?? 0));
    setCustomLabel(initial.mobile_zone_name_snapshot ?? '');
    setAddress(initial.mobile_address ?? '');
    setErrors({});
    setZoneId(initial.mobile_zone_id);
    setIsCustom(false);
  }, [open, initial]);

  // Phase Mobile-1.9.1 — zone-dropdown resync. Runs after live zones
  // are loaded and derives the authoritative `(zoneId, isCustom)` pair
  // from `initial.mobile_zone_id` + `mobile_surcharge` + live zones.
  // Four cases:
  //   1. `mobile_zone_id` matches a live zone → select that zone.
  //   2. `mobile_zone_id` set but NOT in live zones (deleted-zone
  //      recovery): switch to Custom path. `surcharge` + `customLabel`
  //      are already populated from snapshot by the reseed effect, so
  //      admin sees the historical label preserved and can re-pick or
  //      save as Custom (server will write `mobile_zone_id = null`).
  //   3. `mobile_zone_id` null + `surcharge > 0` (Custom path record):
  //      select Custom; inputs already pre-filled from initial.
  //   4. `mobile_zone_id` null + `surcharge = 0` + `is_mobile = true`
  //      (bug state): leave placeholder.
  // Skipped entirely when modal is in enable mode (`!initial.is_mobile`)
  // — those opens get a blank picker.
  useEffect(() => {
    if (!open) return;
    if (!initial.is_mobile) return;
    // Wait for the zones fetch to actually complete before deciding.
    // Without this guard, the resync would fire on the first render
    // (when `zones` is still the initial empty array) and incorrectly
    // trigger Case 2 — flipping `isCustom=true` and clobbering a valid
    // `mobile_zone_id` until the fetch eventually resolved.
    if (!zonesLoaded) return;

    if (initial.mobile_zone_id) {
      const match = zones.find((z) => z.id === initial.mobile_zone_id);
      if (match) {
        setZoneId(match.id);
        setIsCustom(false);
      } else {
        // Case 2 — deleted-zone recovery.
        setZoneId(null);
        setIsCustom(true);
      }
    } else if (Number(initial.mobile_surcharge ?? 0) > 0) {
      // Case 3 — Custom path record.
      setIsCustom(true);
      setZoneId(null);
    }
    // Case 4 falls through; placeholder is the provisional state set by
    // the reseed effect.
  }, [open, zones, zonesLoaded, initial]);

  // Fetch live zones every time the modal opens (LOCKED-7.5 — admin
  // renames in Settings reflect immediately).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setZonesLoaded(false);
    setZonesLoading(true);
    const endpoint =
      mode === 'pos' ? '/api/pos/mobile-zones' : '/api/admin/mobile-zones';
    const fetcher = mode === 'pos' ? posFetch : fetch;
    fetcher(endpoint)
      .then((res) => (res.ok ? res.json() : { zones: [] }))
      .then((data) => {
        if (cancelled) return;
        setZones(
          ((data.zones ?? []) as MobileZoneRow[]).filter((z) => z.is_available)
        );
        setZonesLoaded(true);
      })
      .catch(() => {
        // Mark loaded even on error so the resync effect can fall back to
        // the deleted-zone recovery path (better to surface Custom inputs
        // than wedge the dropdown waiting forever).
        if (!cancelled) setZonesLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  function handleToggle(next: boolean) {
    setIsMobile(next);
    if (!next) {
      // Toggle off — reset zone/surcharge/custom but keep the address
      // typed so the cashier can re-enable without losing it.
      setZoneId(null);
      setIsCustom(false);
      setSurcharge(0);
      setCustomLabel('');
      setErrors({});
    }
  }

  function handleZoneSelect(selected: string) {
    setErrors((e) => ({ ...e, zone: undefined, custom: undefined }));
    if (selected === CUSTOM_VALUE) {
      setIsCustom(true);
      setZoneId(null);
      setSurcharge(0);
      setCustomLabel('');
      return;
    }
    if (!selected) {
      setIsCustom(false);
      setZoneId(null);
      setSurcharge(0);
      setCustomLabel('');
      return;
    }
    const zone = zones.find((z) => z.id === selected);
    if (!zone) return;
    setIsCustom(false);
    setZoneId(zone.id);
    setSurcharge(Number(zone.surcharge));
    setCustomLabel(zone.name);
  }

  function handleClearAddress() {
    setAddress('');
    addressInputRef.current?.focus();
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (isMobile) {
      if (!isCustom && !zoneId) {
        next.zone = 'Please select a service area for the mobile fee';
      }
      if (isCustom && !(surcharge > 0 && surcharge <= 500)) {
        next.custom = 'Enter a custom fee between $1 and $500';
      }
      if (!address.trim()) {
        next.address = 'Address is required for mobile service';
      } else if (address.trim().length > 200) {
        next.address = 'Address is too long (max 200 characters)';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const endpoint =
      mode === 'pos'
        ? `/api/pos/appointments/${appointmentId}/mobile-service`
        : `/api/admin/appointments/${appointmentId}/mobile-service`;
    const fetcher = mode === 'pos' ? posFetch : fetch;
    try {
      const res = await fetcher(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_mobile: isMobile,
          mobile_zone_id: isMobile && !isCustom ? zoneId : null,
          mobile_surcharge: isMobile ? surcharge : 0,
          mobile_address: isMobile ? address.trim() : null,
          mobile_zone_name_snapshot: isMobile
            ? isCustom
              ? customLabel.trim() || 'Custom'
              : customLabel
            : null,
          is_custom: isCustom,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(result.error || 'Failed to update mobile service');
        setSaving(false);
        return;
      }
      onSaved({
        is_mobile: result.data?.is_mobile ?? isMobile,
        mobile_zone_id: result.data?.mobile_zone_id ?? null,
        mobile_surcharge: Number(result.data?.mobile_surcharge ?? 0),
        mobile_address: result.data?.mobile_address ?? null,
        mobile_zone_name_snapshot:
          result.data?.mobile_zone_name_snapshot ?? null,
        subtotal: Number(result.data?.subtotal ?? 0),
        total_amount: Number(result.data?.total_amount ?? 0),
        mismatch_amount: Number(result.mismatch_amount ?? 0),
      });
      toast.success('Mobile service updated');
      onClose();
    } catch {
      toast.error('Failed to update mobile service');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/50 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit Mobile Service
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <label className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Mobile service
              </span>
            </div>
            <Switch checked={isMobile} onCheckedChange={handleToggle} />
          </label>

          {isMobile && (
            <>
              <div>
                <label
                  htmlFor="edit-mobile-address"
                  className="text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  Address <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <Input
                    id="edit-mobile-address"
                    ref={addressInputRef}
                    placeholder="123 Main St, Torrance, CA 90501"
                    value={address}
                    maxLength={200}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setErrors((prev) => ({ ...prev, address: undefined }));
                    }}
                    className={`pr-8 ${
                      errors.address
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : ''
                    }`}
                    aria-invalid={!!errors.address || undefined}
                    aria-describedby={
                      errors.address ? 'edit-mobile-address-error' : undefined
                    }
                  />
                  {address && (
                    <button
                      type="button"
                      onClick={handleClearAddress}
                      aria-label="Clear address"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {errors.address && (
                  <p
                    id="edit-mobile-address-error"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.address}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="edit-mobile-zone"
                  className="text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  Zone
                </label>
                <select
                  id="edit-mobile-zone"
                  value={isCustom ? CUSTOM_VALUE : zoneId ?? ''}
                  onChange={(e) => handleZoneSelect(e.target.value)}
                  disabled={zonesLoading}
                  aria-invalid={!!errors.zone || undefined}
                  aria-describedby={errors.zone ? 'edit-mobile-zone-error' : undefined}
                  className={`mt-1 block w-full rounded-md border bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-ui ${
                    errors.zone
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <option value="">Select zone…</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {formatCurrency(Number(z.surcharge))}
                    </option>
                  ))}
                  <option value={CUSTOM_VALUE}>Custom…</option>
                </select>
                {errors.zone && (
                  <p
                    id="edit-mobile-zone-error"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errors.zone}
                  </p>
                )}
              </div>

              {isCustom && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="edit-mobile-custom-surcharge"
                      className="text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      Surcharge
                    </label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        $
                      </span>
                      <Input
                        id="edit-mobile-custom-surcharge"
                        type="number"
                        min="0"
                        max="500"
                        step="0.01"
                        value={surcharge || ''}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setSurcharge(Number.isFinite(n) ? n : 0);
                          setErrors((prev) => ({ ...prev, custom: undefined }));
                        }}
                        className={`pl-6 ${
                          errors.custom
                            ? 'border-red-500 focus-visible:ring-red-500'
                            : ''
                        }`}
                        aria-invalid={!!errors.custom || undefined}
                        aria-describedby={
                          errors.custom
                            ? 'edit-mobile-custom-error'
                            : undefined
                        }
                      />
                    </div>
                    {errors.custom && (
                      <p
                        id="edit-mobile-custom-error"
                        className="mt-1 text-xs text-red-600 dark:text-red-400"
                      >
                        {errors.custom}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="edit-mobile-custom-label"
                      className="text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      Label
                    </label>
                    <Input
                      id="edit-mobile-custom-label"
                      placeholder="Custom"
                      maxLength={100}
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {surcharge > 0 && (
                <div className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Mobile fee
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(surcharge)}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
