'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { formatTime, formatCurrency, formatPhone } from '@/lib/utils/format';
import { appointmentUpdateSchema, type AppointmentUpdateInput } from '@/lib/utils/validation';
import { APPOINTMENT_STATUS_LABELS, ROLE_LABELS } from '@/lib/utils/constants';
import type { AppointmentWithRelations } from '../types';
import type { AppointmentStatus, Employee } from '@/lib/supabase/types';

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

interface AppointmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithRelations | null;
  employees: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'>[];
  onSave: (id: string, data: AppointmentUpdateInput) => Promise<boolean>;
  onCancel: (appointment: AppointmentWithRelations) => void;
  canReschedule: boolean;
  canCancel: boolean;
}

export function AppointmentDetailDialog({
  open,
  onOpenChange,
  appointment,
  employees,
  onSave,
  onCancel,
  canReschedule,
  canCancel,
}: AppointmentDetailDialogProps) {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AppointmentUpdateInput>({
    resolver: zodResolver(appointmentUpdateSchema),
  });

  useEffect(() => {
    if (appointment && open) {
      reset({
        status: appointment.status,
        scheduled_date: appointment.scheduled_date,
        scheduled_start_time: appointment.scheduled_start_time,
        scheduled_end_time: appointment.scheduled_end_time,
        employee_id: appointment.employee_id || '',
        job_notes: appointment.job_notes || '',
        internal_notes: appointment.internal_notes || '',
      });
    }
  }, [appointment, open, reset]);

  if (!appointment) return null;

  const allStatuses: AppointmentStatus[] = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
  const showCancelButton =
    canCancel && appointment.status !== 'cancelled';
  const services = appointment.appointment_services;

  async function onSubmit(data: AppointmentUpdateInput) {
    if (!appointment) return;
    setSaving(true);
    const payload = { ...data, employee_id: data.employee_id || null };
    const success = await onSave(appointment.id, payload);
    setSaving(false);
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Appointment Details</DialogTitle>
        <DialogDescription>
          {appointment.customer.first_name} {appointment.customer.last_name}
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        {/* Read-only info */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500">Customer</dt>
            <dd className="text-gray-900">
              {appointment.customer.first_name} {appointment.customer.last_name}
            </dd>
            {appointment.customer.phone && (
              <dd className="text-xs text-gray-500">{formatPhone(appointment.customer.phone)}</dd>
            )}
            {appointment.customer.email && (
              <dd className="text-xs text-gray-500">{appointment.customer.email}</dd>
            )}
          </div>

          <div>
            <dt className="text-xs font-medium text-gray-500">Booked By</dt>
            <dd className="text-gray-900">
              {CHANNEL_LABELS[appointment.channel] || appointment.channel}
            </dd>
          </div>

          {appointment.vehicle && (
            <div>
              <dt className="text-xs font-medium text-gray-500">Vehicle</dt>
              <dd className="text-gray-900">
                {[appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model]
                  .filter(Boolean)
                  .join(' ')}
                {appointment.vehicle.color ? ` — ${appointment.vehicle.color}` : ''}
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium text-gray-500">Total</dt>
            <dd className="text-gray-900 font-medium">{formatCurrency(appointment.total_amount)}</dd>
          </div>
        </dl>

        {/* Services list */}
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500">Services</p>
          <div className="mt-1 space-y-0.5">
            {services.map((as) => (
              <div key={as.id} className="flex justify-between text-sm">
                <span className="text-gray-900">{as.service?.name || 'Service'}</span>
                <span className="text-gray-500">{formatCurrency(as.price_at_booking)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile info */}
        {appointment.is_mobile && (
          <div className="mt-2 text-sm">
            <span className="text-xs font-medium text-gray-500">Mobile Service: </span>
            <span className="text-gray-900">
              {appointment.mobile_address || 'Yes'}
              {appointment.mobile_surcharge > 0 && (
                <span className="ml-1 text-gray-500">
                  (+{formatCurrency(appointment.mobile_surcharge)} surcharge)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Cancellation info */}
        {appointment.status === 'cancelled' && appointment.cancellation_reason && (
          <div className="mt-2 rounded-md bg-red-50 p-2 text-sm">
            <p className="text-xs font-medium text-red-600">Cancellation Reason</p>
            <p className="text-red-900">{appointment.cancellation_reason}</p>
            {appointment.cancellation_fee != null && appointment.cancellation_fee > 0 && (
              <p className="text-xs text-red-500">Fee: {formatCurrency(appointment.cancellation_fee)}</p>
            )}
          </div>
        )}

        {/* Editable fields */}
        <form id="detail-edit-form" onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3 border-t border-gray-200 pt-4">
          <div className={canReschedule ? 'grid grid-cols-2 gap-3' : ''}>
            <FormField label="Status" error={errors.status?.message} htmlFor="detail-status">
              <Select id="detail-status" {...register('status')}>
                {allStatuses.map((s) => (
                  <option key={s} value={s}>
                    {APPOINTMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>

            {canReschedule && (
              <FormField label="Assigned Detailer" error={errors.employee_id?.message} htmlFor="detail-employee">
                <Select id="detail-employee" {...register('employee_id')}>
                  <option value="">Unassigned</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({ROLE_LABELS[emp.role] || emp.role})
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          {canReschedule && (
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Date" error={errors.scheduled_date?.message} htmlFor="detail-date">
                <Input id="detail-date" type="date" {...register('scheduled_date')} />
              </FormField>
              <FormField label="Start" error={errors.scheduled_start_time?.message} htmlFor="detail-start">
                <Input id="detail-start" type="time" {...register('scheduled_start_time')} />
              </FormField>
              <FormField label="End" error={errors.scheduled_end_time?.message} htmlFor="detail-end">
                <Input id="detail-end" type="time" {...register('scheduled_end_time')} />
              </FormField>
            </div>
          )}

          <FormField label="Job Notes" error={errors.job_notes?.message} htmlFor="detail-job-notes">
            <textarea
              id="detail-job-notes"
              {...register('job_notes')}
              rows={2}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>

          <FormField label="Internal Notes" error={errors.internal_notes?.message} htmlFor="detail-internal-notes">
            <textarea
              id="detail-internal-notes"
              {...register('internal_notes')}
              rows={2}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        {showCancelButton && (
          <Button
            variant="destructive"
            size="sm"
            className="mr-auto"
            onClick={() => {
              onOpenChange(false);
              onCancel(appointment);
            }}
          >
            Cancel Appointment
          </Button>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Close
        </Button>
        <Button type="submit" form="detail-edit-form" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogFooter>
      <DialogClose onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
