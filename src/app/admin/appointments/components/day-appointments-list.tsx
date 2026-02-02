'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { MoreVertical, Pencil, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
import { formatTime, formatCurrency, formatPhone } from '@/lib/utils/format';
import { APPOINTMENT_STATUS_LABELS, ROLE_LABELS } from '@/lib/utils/constants';
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

const CHANNEL_LABELS: Record<string, string> = {
  online: 'Client (Online Booking)',
  portal: 'Client (Customer Portal)',
  phone: 'Staff (Phone)',
  walk_in: 'Staff (Walk-in)',
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            const isExpanded = expandedId === appt.id;
            const services = appt.appointment_services
              .map((as) => as.service?.name || 'Service')
              .join(', ');

            return (
              <div
                key={appt.id}
                className="rounded-lg border border-gray-200 bg-white"
              >
                {/* Compact row — always visible */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                  className="flex w-full items-start justify-between gap-2 p-3 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
                >
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
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-3 pb-3 pt-2">
                    <dl className="space-y-1.5 text-xs">
                      {/* Customer */}
                      <div>
                        <dt className="font-medium text-gray-500">Customer</dt>
                        <dd className="text-gray-900">
                          {appt.customer.first_name} {appt.customer.last_name}
                          {appt.customer.phone && (
                            <span className="ml-2 text-gray-500">
                              {formatPhone(appt.customer.phone)}
                            </span>
                          )}
                        </dd>
                        {appt.customer.email && (
                          <dd className="text-gray-500">{appt.customer.email}</dd>
                        )}
                      </div>

                      {/* Vehicle */}
                      {appt.vehicle && (
                        <div>
                          <dt className="font-medium text-gray-500">Vehicle</dt>
                          <dd className="text-gray-900">
                            {[appt.vehicle.year, appt.vehicle.make, appt.vehicle.model]
                              .filter(Boolean)
                              .join(' ')}
                            {appt.vehicle.color ? ` — ${appt.vehicle.color}` : ''}
                          </dd>
                        </div>
                      )}

                      {/* Services */}
                      <div>
                        <dt className="font-medium text-gray-500">Services</dt>
                        {appt.appointment_services.map((as) => (
                          <dd key={as.id} className="flex justify-between text-gray-900">
                            <span>{as.service?.name || 'Service'}</span>
                            <span>{formatCurrency(as.price_at_booking)}</span>
                          </dd>
                        ))}
                      </div>

                      {/* Assigned Detailer */}
                      <div>
                        <dt className="font-medium text-gray-500">Assigned Detailer</dt>
                        <dd className="text-gray-900">
                          {appt.employee
                            ? `${appt.employee.first_name} ${appt.employee.last_name} (${ROLE_LABELS[appt.employee.role] || appt.employee.role})`
                            : 'Unassigned'}
                        </dd>
                      </div>

                      {/* Booked by */}
                      <div>
                        <dt className="font-medium text-gray-500">Booked By</dt>
                        <dd className="text-gray-900">
                          {CHANNEL_LABELS[appt.channel] || appt.channel}
                        </dd>
                      </div>

                      {/* Totals */}
                      <div>
                        <dt className="font-medium text-gray-500">Total</dt>
                        <dd className="text-gray-900 font-medium">{formatCurrency(appt.total_amount)}</dd>
                      </div>

                      {/* Mobile */}
                      {appt.is_mobile && (
                        <div>
                          <dt className="font-medium text-gray-500">Mobile Service</dt>
                          <dd className="text-gray-900">
                            {appt.mobile_address || 'Yes'}
                            {appt.mobile_surcharge > 0 && (
                              <span className="ml-1 text-gray-500">
                                (+{formatCurrency(appt.mobile_surcharge)} surcharge)
                              </span>
                            )}
                          </dd>
                        </div>
                      )}

                      {/* Notes */}
                      {appt.job_notes && (
                        <div>
                          <dt className="font-medium text-gray-500">Job Notes</dt>
                          <dd className="text-gray-900 whitespace-pre-wrap">{appt.job_notes}</dd>
                        </div>
                      )}
                      {appt.internal_notes && (
                        <div>
                          <dt className="font-medium text-gray-500">Internal Notes</dt>
                          <dd className="text-gray-900 whitespace-pre-wrap">{appt.internal_notes}</dd>
                        </div>
                      )}

                      {/* Cancellation info */}
                      {appt.status === 'cancelled' && appt.cancellation_reason && (
                        <div>
                          <dt className="font-medium text-red-500">Cancellation Reason</dt>
                          <dd className="text-gray-900">{appt.cancellation_reason}</dd>
                          {appt.cancellation_fee != null && appt.cancellation_fee > 0 && (
                            <dd className="text-gray-500">
                              Fee: {formatCurrency(appt.cancellation_fee)}
                            </dd>
                          )}
                        </div>
                      )}
                    </dl>

                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="outline" size="sm">
                            <MoreVertical className="mr-1 h-3.5 w-3.5" />
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
