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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { appointmentUpdateSchema, type AppointmentUpdateInput } from '@/lib/utils/validation';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { STATUS_TRANSITIONS } from '../types';
import type { AppointmentWithRelations } from '../types';
import type { AppointmentStatus, Employee } from '@/lib/supabase/types';

interface EditAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithRelations | null;
  employees: Pick<Employee, 'id' | 'first_name' | 'last_name'>[];
  onSave: (id: string, data: AppointmentUpdateInput) => Promise<boolean>;
}

export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  employees,
  onSave,
}: EditAppointmentDialogProps) {
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

  const allowedStatuses = [
    appointment.status,
    ...STATUS_TRANSITIONS[appointment.status],
  ];

  async function onSubmit(data: AppointmentUpdateInput) {
    if (!appointment) return;
    setSaving(true);
    const success = await onSave(appointment.id, data);
    setSaving(false);
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Appointment</DialogTitle>
        <DialogDescription>
          {appointment.customer.first_name} {appointment.customer.last_name}
        </DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="edit-appointment-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Status" error={errors.status?.message} htmlFor="edit-status">
            <Select id="edit-status" {...register('status')}>
              {allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {APPOINTMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Date" error={errors.scheduled_date?.message} htmlFor="edit-date">
              <Input id="edit-date" type="date" {...register('scheduled_date')} />
            </FormField>
            <FormField label="Start" error={errors.scheduled_start_time?.message} htmlFor="edit-start">
              <Input id="edit-start" type="time" {...register('scheduled_start_time')} />
            </FormField>
            <FormField label="End" error={errors.scheduled_end_time?.message} htmlFor="edit-end">
              <Input id="edit-end" type="time" {...register('scheduled_end_time')} />
            </FormField>
          </div>

          <FormField label="Assigned Employee" error={errors.employee_id?.message} htmlFor="edit-employee">
            <Select id="edit-employee" {...register('employee_id')}>
              <option value="">Unassigned</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Job Notes" error={errors.job_notes?.message} htmlFor="edit-job-notes">
            <textarea
              id="edit-job-notes"
              {...register('job_notes')}
              rows={2}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>

          <FormField label="Internal Notes" error={errors.internal_notes?.message} htmlFor="edit-internal-notes">
            <textarea
              id="edit-internal-notes"
              {...register('internal_notes')}
              rows={2}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="edit-appointment-form" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogFooter>
      <DialogClose onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}
