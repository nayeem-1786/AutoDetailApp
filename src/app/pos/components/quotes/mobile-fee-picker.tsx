'use client';

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/utils/format';
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
}

const CUSTOM_VALUE = '__custom__';

export function MobileFeePicker({ value, onChange, disabled }: MobileFeePickerProps) {
  const [zones, setZones] = useState<MobileZoneRow[]>([]);
  const [loading, setLoading] = useState(false);

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
      return;
    }
    onChange({ ...value, isMobile: true });
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
              Address
            </label>
            <Input
              placeholder="123 Main St, Torrance, CA"
              value={value.address}
              maxLength={200}
              onChange={(e) =>
                onChange({ ...value, address: e.target.value })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Zone
            </label>
            <select
              value={value.isCustom ? CUSTOM_VALUE : value.zoneId ?? ''}
              onChange={(e) => handleZoneSelect(e.target.value)}
              disabled={disabled || loading}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-ui"
            >
              <option value="">Select zone…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — {formatCurrency(Number(z.surcharge))}
                </option>
              ))}
              <option value={CUSTOM_VALUE}>Custom…</option>
            </select>
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
                    className="pl-6"
                  />
                </div>
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
