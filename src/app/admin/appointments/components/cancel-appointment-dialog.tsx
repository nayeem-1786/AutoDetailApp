'use client';

import { useState } from 'react';
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
import { FormField } from '@/components/ui/form-field';
import { appointmentCancelSchema, type AppointmentCancelInput } from '@/lib/utils/validation';
import type { AppointmentWithRelations } from '../types';

interface CancelAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithRelations | null;
  onConfirm: (id: string, data: AppointmentCancelInput) => Promise<boolean>;
}

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onConfirm,
}: CancelAppointmentDialogProps) {
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AppointmentCancelInput>({
    resolver: zodResolver(appointmentCancelSchema),
    defaultValues: {
      cancellation_reason: '',
      cancellation_fee: undefined,
    },
  });

  if (!appointment) return null;

  async function onSubmit(data: AppointmentCancelInput) {
    if (!appointment) return;
    setSaving(true);
    const success = await onConfirm(appointment.id, data);
    setSaving(false);
    if (success) {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        onOpenChange(val);
      }}
    >
      <DialogHeader>
        <DialogTitle>Cancel Appointment</DialogTitle>
        <DialogDescription>
          Cancel appointment for {appointment.customer.first_name}{' '}
          {appointment.customer.last_name} on {appointment.scheduled_date}
        </DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form id="cancel-appointment-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Cancellation Reason"
            error={errors.cancellation_reason?.message}
            required
            htmlFor="cancel-reason"
          >
            <textarea
              id="cancel-reason"
              {...register('cancellation_reason')}
              rows={3}
              placeholder="Reason for cancellation..."
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>

          <FormField
            label="Cancellation Fee"
            error={errors.cancellation_fee?.message}
            description="Optional fee to charge for late cancellation"
            htmlFor="cancel-fee"
          >
            <Input
              id="cancel-fee"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register('cancellation_fee', { valueAsNumber: true })}
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            onOpenChange(false);
          }}
          disabled={saving}
        >
          Keep Appointment
        </Button>
        <Button
          variant="destructive"
          type="submit"
          form="cancel-appointment-form"
          disabled={saving}
        >
          {saving ? 'Cancelling...' : 'Cancel Appointment'}
        </Button>
      </DialogFooter>
      <DialogClose
        onClose={() => {
          reset();
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
