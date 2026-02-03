'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate, formatTime, formatCurrency } from '@/lib/utils/format';
import { APPOINTMENT } from '@/lib/utils/constants';
import { toast } from 'sonner';
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
  onStatusChange?: () => void;
}

export function AppointmentCard({ appointment, onStatusChange }: AppointmentCardProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const statusConfig = STATUS_CONFIG[appointment.status];
  const canRebook =
    appointment.status === 'completed' || appointment.status === 'cancelled';
  const canCancel =
    appointment.status === 'pending' || appointment.status === 'confirmed';

  const serviceName =
    appointment.appointment_services?.[0]?.services?.name ?? 'Service';

  const vehicle = appointment.vehicles;
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : null;

  const handleCancel = async () => {
    setCancelling(true);

    try {
      const res = await fetch(`/api/customer/appointments/${appointment.id}/cancel`, {
        method: 'POST',
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.too_late) {
          toast.error(`Appointments must be cancelled at least ${APPOINTMENT.CANCELLATION_WINDOW_HOURS} hours in advance.`);
        } else {
          toast.error(json.error || 'Failed to cancel appointment');
        }
        return;
      }

      toast.success('Appointment cancelled');
      setCancelOpen(false);
      onStatusChange?.();
    } catch {
      toast.error('Failed to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
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
            <div className="mt-2 flex flex-col gap-1.5">
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  Cancel
                </Button>
              )}
              {canRebook && (
                <Link href={`/book?rebook=${appointment.id}`}>
                  <Button variant="outline" size="sm">
                    Rebook
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Appointment"
        description={`Cancellations must be made at least ${APPOINTMENT.CANCELLATION_WINDOW_HOURS} hours before the scheduled time. This action cannot be undone.`}
        confirmLabel="Cancel Appointment"
        variant="destructive"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </>
  );
}
