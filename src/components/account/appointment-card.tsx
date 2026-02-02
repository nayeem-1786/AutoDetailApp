import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatTime, formatCurrency } from '@/lib/utils/format';
import type { AppointmentStatus } from '@/lib/supabase/types';

const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' }
> = {
  pending: { label: 'Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'info' },
  in_progress: { label: 'In Progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'secondary' },
};

interface AppointmentCardProps {
  appointment: {
    id: string;
    status: AppointmentStatus;
    scheduled_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    total_amount: number;
    is_mobile: boolean;
    mobile_address: string | null;
    appointment_services: {
      price_at_booking: number;
      services: {
        name: string;
      };
    }[];
    vehicles: {
      year: number | null;
      make: string | null;
      model: string | null;
      color: string | null;
    } | null;
  };
}

export function AppointmentCard({ appointment }: AppointmentCardProps) {
  const statusConfig = STATUS_CONFIG[appointment.status];
  const canRebook =
    appointment.status === 'completed' || appointment.status === 'cancelled';

  const serviceName =
    appointment.appointment_services?.[0]?.services?.name ?? 'Service';

  const vehicle = appointment.vehicles;
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {serviceName}
            </h3>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>

          <p className="mt-1 text-sm text-gray-600">
            {formatDate(appointment.scheduled_date)} &middot;{' '}
            {formatTime(appointment.scheduled_start_time)} &ndash;{' '}
            {formatTime(appointment.scheduled_end_time)}
          </p>

          {vehicleLabel && (
            <p className="mt-1 text-sm text-gray-500">
              {vehicle?.color ? `${vehicle.color} ` : ''}
              {vehicleLabel}
            </p>
          )}

          {appointment.is_mobile && appointment.mobile_address && (
            <p className="mt-1 text-xs text-gray-400">
              Mobile &middot; {appointment.mobile_address}
            </p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(appointment.total_amount)}
          </p>
          {canRebook && (
            <Link href={`/book?rebook=${appointment.id}`}>
              <Button variant="outline" size="sm" className="mt-2">
                Rebook
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
