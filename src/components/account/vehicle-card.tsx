import { VEHICLE_TYPE_LABELS, VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import type { VehicleType, VehicleSizeClass } from '@/lib/supabase/types';
import { Pencil, Trash2 } from 'lucide-react';

interface VehicleCardProps {
  vehicle: {
    id: string;
    vehicle_type: VehicleType;
    size_class: VehicleSizeClass | null;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  };
  onEdit?: (vehicle: VehicleCardProps['vehicle']) => void;
  onDelete?: (vehicleId: string) => void;
}

export function VehicleCard({ vehicle, onEdit, onDelete }: VehicleCardProps) {
  const label = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {label || 'Unknown Vehicle'}
          </h3>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            {vehicle.color && <p>Color: {vehicle.color}</p>}
            <p>Type: {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}</p>
            {vehicle.size_class && (
              <p>Size: {VEHICLE_SIZE_LABELS[vehicle.size_class]}</p>
            )}
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(vehicle)}
                aria-label="Edit vehicle"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(vehicle.id)}
                aria-label="Delete vehicle"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
