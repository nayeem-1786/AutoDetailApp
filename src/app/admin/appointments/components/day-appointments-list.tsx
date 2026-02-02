'use client';

import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatTime } from '@/lib/utils/format';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import type { AppointmentWithRelations } from '../types';
import type { AppointmentStatus } from '@/lib/supabase/types';

const STATUS_BADGE_VARIANT: Record<AppointmentStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  pending: 'warning',
  confirmed: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'secondary',
};

interface DayAppointmentsListProps {
  selectedDate: Date | null;
  appointments: AppointmentWithRelations[];
  onSelect: (appointment: AppointmentWithRelations) => void;
}

export function DayAppointmentsList({
  selectedDate,
  appointments,
  onSelect,
}: DayAppointmentsListProps) {
  if (!selectedDate) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 p-8">
        <p className="text-sm text-gray-400">Select a date to view appointments</p>
      </div>
    );
  }

  const sorted = [...appointments].sort((a, b) =>
    a.scheduled_start_time.localeCompare(b.scheduled_start_time)
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        {sorted.length} appointment{sorted.length !== 1 ? 's' : ''}
      </p>

      {sorted.length === 0 ? (
        <div className="mt-6 flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-8">
          <p className="text-sm text-gray-400">No appointments on this day</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {sorted.map((appt) => {
            const services = appt.appointment_services
              .map((as) => as.service?.name || 'Service')
              .join(', ');

            return (
              <button
                key={appt.id}
                type="button"
                onClick={() => onSelect(appt)}
                className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {formatTime(appt.scheduled_start_time)}
                    {' - '}
                    {formatTime(appt.scheduled_end_time)}
                  </span>
                  <Badge variant={STATUS_BADGE_VARIANT[appt.status]}>
                    {APPOINTMENT_STATUS_LABELS[appt.status]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-gray-700">
                  {appt.customer.first_name} {appt.customer.last_name}
                </p>
                <p className="truncate text-xs text-gray-500">{services}</p>
                {appt.vehicle && (
                  <p className="truncate text-xs text-gray-400">
                    {[appt.vehicle.year, appt.vehicle.make, appt.vehicle.model]
                      .filter(Boolean)
                      .join(' ')}
                    {appt.vehicle.color ? ` (${appt.vehicle.color})` : ''}
                  </p>
                )}
                {appt.employee && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    Detailer: {appt.employee.first_name} {appt.employee.last_name}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
