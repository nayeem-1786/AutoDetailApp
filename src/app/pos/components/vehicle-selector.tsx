'use client';

import { useState, useEffect } from 'react';
import { Car, Plus, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  VEHICLE_SIZE_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/lib/utils/constants';
import type { Vehicle } from '@/lib/supabase/types';
import { posFetch } from '../lib/pos-fetch';

interface VehicleSelectorProps {
  customerId: string;
  selectedVehicleId: string | null;
  onSelect: (vehicle: Vehicle) => void;
  onAddNew: () => void;
}

export function VehicleSelector({
  customerId,
  selectedVehicleId,
  onSelect,
  onAddNew,
}: VehicleSelectorProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await posFetch(`/api/pos/customers/${customerId}/vehicles`);
        const json = await res.json();
        setVehicles(json.data ?? []);
      } catch {
        setVehicles([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {vehicles.length === 0 && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">No vehicles on file</p>
      )}

      {vehicles.map((v) => {
        const label =
          [v.year, v.make, v.model].filter(Boolean).join(' ') ||
          VEHICLE_TYPE_LABELS[v.vehicle_type] ||
          'Vehicle';
        const isSelected = v.id === selectedVehicleId;

        return (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className={cn(
              'flex items-center justify-between rounded-lg border p-3 text-left transition-all',
              'min-h-[56px] active:scale-[0.99]',
              isSelected
                ? 'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-950/30'
            )}
          >
            <div className="flex items-center gap-2.5">
              <Car className={cn('h-4 w-4', isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')} />
              <div>
                <p className={cn('text-sm font-medium', isSelected ? 'text-blue-900 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100')}>
                  {label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {v.color && `${v.color} · `}
                  {v.size_class ? VEHICLE_SIZE_LABELS[v.size_class] : VEHICLE_TYPE_LABELS[v.vehicle_type]}
                </p>
              </div>
            </div>
            {isSelected && <Check className="h-4 w-4 text-blue-500 dark:text-blue-400" />}
          </button>
        );
      })}

      <Button variant="outline" size="sm" onClick={onAddNew} className="mt-1">
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Vehicle
      </Button>
    </div>
  );
}
