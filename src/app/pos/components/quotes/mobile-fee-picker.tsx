'use client';

import { useEffect, useRef, useState } from 'react';
import { Truck, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatCurrency, formatMoney } from '@/lib/utils/format';
import { posFetch } from '../../lib/pos-fetch';
import type { QuoteMobileState } from '../../types';

interface MobileZoneRow {
  id: string;
  name: string;
  surcharge: number;
  is_available: boolean;
}

interface MobileFeePickerProps {
  value: QuoteMobileState;
  onChange: (next: QuoteMobileState) => void;
  /** Disabled when the cashier hasn't selected a customer yet, etc. */
  disabled?: boolean;
  /**
   * Customer's formatted profile address. Pre-fill source.
   *
   * Phase Mobile-1.2 revision of LOCKED-10: pre-fill OVERWRITES a prior
   * pre-fill, but NEVER overwrites user-typed input. The picker tracks
   * this via an internal `addressWasAutoPrefilled` flag. Behavior on
   * customer swap:
   *   - new customer has no profile address AND prior value was
   *     auto-prefilled → clear the field
   *   - new customer has a profile address AND (field empty OR prior
   *     value was auto-prefilled) → pre-fill with new address
   *   - otherwise (user typed something they want to keep) → preserve
   */
  customerProfileAddress?: string | null;
  /**
   * When true, the picker renders the "Address is required for mobile
   * service" inline error if the toggle is on and the field is empty.
   * Parent owns submit gating; this is the display-side hint.
   */
  showAddressRequiredError?: boolean;
  /**
   * When true, render "Please select a service area for the mobile fee"
   * under the zone dropdown. Used by the parent submit gate when mobile
   * is on but no zone is selected (and the cashier did NOT choose Custom).
   */
  showZoneRequiredError?: boolean;
  /**
   * When true, render "Enter a custom fee between $1 and $500" under the
   * Custom surcharge input. Used by the parent submit gate when the
   * cashier chose Custom but the surcharge is empty / 0 / > 500.
   */
  showCustomFeeError?: boolean;
}

const CUSTOM_VALUE = '__custom__';

export function MobileFeePicker({
  value,
  onChange,
  disabled,
  customerProfileAddress,
  showAddressRequiredError,
  showZoneRequiredError,
  showCustomFeeError,
}: MobileFeePickerProps) {
  const [zones, setZones] = useState<MobileZoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  // Phase Mobile-1.2 (revised in 1.3): tracks whether the current value in
  // the address field is in an "auto-prefill state" — meaning a customer
  // swap may safely overwrite or clear it. Flag transitions:
  //   - TRUE: effect writes customerProfileAddress, OR effect observes
  //           value.address already equals customerProfileAddress (Phase
  //           1.3 — recovers the flag for loaded quotes / re-mounts where
  //           useState(false) would otherwise wedge it)
  //   - FALSE: cashier types, pastes, or clears the field; toggle off
  // Customer-swap behavior consults this flag to decide whether to
  // clear/overwrite (auto-prefilled) or preserve (user-typed).
  const [addressWasAutoPrefilled, setAddressWasAutoPrefilled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    posFetch('/api/pos/mobile-zones')
      .then((res) => (res.ok ? res.json() : { zones: [] }))
      .then((data) => {
        if (cancelled) return;
        setZones(
          ((data.zones ?? []) as MobileZoneRow[]).filter((z) => z.is_available)
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill / customer-swap handling (revised LOCKED-10 — see prop docs).
  // Re-runs when customerProfileAddress changes (e.g. cashier swaps the
  // linked customer mid-ticket) and when the toggle flips on.
  useEffect(() => {
    if (!value.isMobile) return;
    const fieldIsEmpty = (value.address ?? '').trim().length === 0;

    // Case 1: new customer has no profile address.
    if (!customerProfileAddress) {
      // Clear if the current value was auto-prefilled from a prior
      // customer (the cashier never typed it).
      if (addressWasAutoPrefilled && !fieldIsEmpty) {
        onChange({ ...value, address: '' });
        setAddressWasAutoPrefilled(false);
      }
      // Otherwise: nothing to do — empty field stays empty, typed field
      // stays as-is.
      return;
    }

    // Case 2: new customer has a profile address.
    // Phase Mobile-1.3 — extend the "auto-prefill" predicate to also
    // include the case where value.address already equals
    // customerProfileAddress. Without this, a picker mounted with a
    // pre-filled address (e.g. loaded quote, or toggle-on path) would
    // start with addressWasAutoPrefilled=false even though the field is
    // semantically in an auto-prefill state — wedging the customer-swap
    // clear behavior.
    if (
      fieldIsEmpty ||
      addressWasAutoPrefilled ||
      value.address === customerProfileAddress
    ) {
      // Either nothing to preserve, or prior value was auto-prefilled,
      // or the field already mirrors the customer's profile.
      if (value.address !== customerProfileAddress) {
        onChange({ ...value, address: customerProfileAddress });
      }
      setAddressWasAutoPrefilled(true);
    }
    // Otherwise: user typed something they want to keep, preserve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerProfileAddress, value.isMobile]);

  function handleToggle(checked: boolean) {
    if (!checked) {
      onChange({
        isMobile: false,
        zoneId: null,
        address: '',
        surcharge: 0,
        zoneNameSnapshot: '',
        isCustom: false,
      });
      setAddressWasAutoPrefilled(false);
      return;
    }
    // When turning the toggle on, seed the address from the customer's
    // profile if available — saves a round-trip through the effect above.
    const seedFromProfile =
      !value.address && !!customerProfileAddress;
    onChange({
      ...value,
      isMobile: true,
      address: value.address || customerProfileAddress || '',
    });
    if (seedFromProfile) {
      setAddressWasAutoPrefilled(true);
    }
  }

  function handleZoneSelect(selected: string) {
    if (selected === CUSTOM_VALUE) {
      onChange({
        ...value,
        isMobile: true,
        zoneId: null,
        isCustom: true,
        surcharge: 0,
        zoneNameSnapshot: '',
      });
      return;
    }
    if (!selected) {
      onChange({
        ...value,
        isMobile: true,
        zoneId: null,
        isCustom: false,
        surcharge: 0,
        zoneNameSnapshot: '',
      });
      return;
    }
    const zone = zones.find((z) => z.id === selected);
    if (!zone) return;
    onChange({
      ...value,
      isMobile: true,
      zoneId: zone.id,
      isCustom: false,
      surcharge: Number(zone.surcharge),
      zoneNameSnapshot: zone.name,
    });
  }

  function handleClearAddress() {
    onChange({ ...value, address: '' });
    setAddressWasAutoPrefilled(false);
    addressInputRef.current?.focus();
  }

  function handleAddressChange(next: string) {
    // Cashier typed (or pasted) — the value is no longer an auto-prefill.
    setAddressWasAutoPrefilled(false);
    onChange({ ...value, address: next });
  }

  const addressIsEmpty = !value.address || value.address.trim().length === 0;
  const showError = !!showAddressRequiredError && value.isMobile && addressIsEmpty;
  // Zone-required error fires only when the picker is on, no real zone is
  // selected, and the cashier hasn't chosen the Custom path.
  const showZoneError =
    !!showZoneRequiredError &&
    value.isMobile &&
    !value.zoneId &&
    !value.isCustom;
  // Custom-fee error fires only on the Custom path with an invalid surcharge.
  const showCustomError =
    !!showCustomFeeError &&
    value.isMobile &&
    value.isCustom &&
    !(value.surcharge > 0 && value.surcharge <= 500);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-3">
      <label className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Mobile service
          </span>
        </div>
        <Switch
          checked={value.isMobile}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
      </label>

      {value.isMobile && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Address <span className="text-red-500">*</span>
            </label>
            <div className="relative mt-1">
              <Input
                ref={addressInputRef}
                placeholder="123 Main St, Torrance, CA 90501"
                value={value.address}
                maxLength={200}
                onChange={(e) => handleAddressChange(e.target.value)}
                disabled={disabled}
                className={`pr-8 ${showError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                aria-invalid={showError || undefined}
                aria-describedby={showError ? 'mobile-address-error' : undefined}
              />
              {!addressIsEmpty && !disabled && (
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
            {showError && (
              <p
                id="mobile-address-error"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
              >
                Address is required for mobile service
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Zone
            </label>
            <select
              value={value.isCustom ? CUSTOM_VALUE : value.zoneId ?? ''}
              onChange={(e) => handleZoneSelect(e.target.value)}
              disabled={disabled || loading}
              aria-invalid={showZoneError || undefined}
              aria-describedby={showZoneError ? 'mobile-zone-error' : undefined}
              className={`mt-1 block w-full rounded-md border bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-ui ${
                showZoneError
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
            {showZoneError && (
              <p
                id="mobile-zone-error"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
              >
                Please select a service area for the mobile fee
              </p>
            )}
          </div>

          {value.isCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Surcharge
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    step="0.01"
                    value={value.surcharge || ''}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      onChange({
                        ...value,
                        surcharge: Number.isFinite(n) ? n : 0,
                      });
                    }}
                    disabled={disabled}
                    aria-invalid={showCustomError || undefined}
                    aria-describedby={showCustomError ? 'mobile-custom-fee-error' : undefined}
                    className={`pl-6 ${
                      showCustomError ? 'border-red-500 focus-visible:ring-red-500' : ''
                    }`}
                  />
                </div>
                {showCustomError && (
                  <p
                    id="mobile-custom-fee-error"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    Enter a custom fee between $1 and $500
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Label
                </label>
                <Input
                  placeholder="Custom"
                  maxLength={100}
                  value={value.zoneNameSnapshot}
                  onChange={(e) =>
                    onChange({ ...value, zoneNameSnapshot: e.target.value })
                  }
                  disabled={disabled}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {value.isMobile && value.surcharge > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Mobile fee
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(value.surcharge)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
