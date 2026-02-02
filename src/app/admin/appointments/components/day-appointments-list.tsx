'use client';

import { format } from 'date-fns';
import { MoreVertical, Pencil, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { formatTime } from '@/lib/utils/format';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { STATUS_TRANSITIONS } from '../types';
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
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onEdit: (appointment: AppointmentWithRelations) => void;
  onCancel: (appointment: AppointmentWithRelations) => void;
}

export function DayAppointmentsList({
  selectedDate,
  appointments,
  onStatusChange,
  onEdit,
  onCancel,
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
            const transitions = STATUS_TRANSITIONS[appt.status];
            const canTransition = transitions.length > 0;
            const services = appt.appointment_services
              .map((as) => as.service?.name || 'Service')
              .join(', ');

            return (
              <div
                key={appt.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
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
                        Assigned: {appt.employee.first_name} {appt.employee.last_name}
                      </p>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canTransition && (
                        <>
                          <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                          {transitions
                            .filter((s) => s !== 'cancelled')
                            .map((status) => (
                              <DropdownMenuItem
                                key={status}
                                onClick={() => onStatusChange(appt.id, status)}
                              >
                                {APPOINTMENT_STATUS_LABELS[status]}
                              </DropdownMenuItem>
                            ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => onEdit(appt)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      {canTransition && transitions.includes('cancelled') && (
                        <DropdownMenuItem
                          destructive
                          onClick={() => onCancel(appt)}
                        >
                          <XCircle className="mr-2 h-3.5 w-3.5" />
                          Cancel
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
