import { VEHICLE_TYPE_LABELS, VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import type { VehicleType, VehicleSizeClass } from '@/lib/supabase/types';

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
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const label = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
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
  );
}
