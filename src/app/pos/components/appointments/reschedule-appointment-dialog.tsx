'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { ROLE_LABELS } from '@/lib/utils/constants';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { posFetch } from '../../lib/pos-fetch';
import type { PosAppointment, PosStaff } from './types';

interface RescheduleAppointmentDialogProps {
  open: boolean;
  appointment: PosAppointment;
  staff: PosStaff[];
  staffLoading: boolean;
  onClose: () => void;
  onSaved: (updated: PosAppointment) => void;
}

// Strip an HH:MM:SS time string down to HH:MM for the native time input.
function toTimeInputValue(time: string): string {
  return time?.slice(0, 5) ?? '';
}

export function RescheduleAppointmentDialog({
  open,
  appointment,
  staff,
  staffLoading,
  onClose,
  onSaved,
}: RescheduleAppointmentDialogProps) {
  const [date, setDate] = useState(appointment.scheduled_date);
  const [startTime, setStartTime] = useState(
    toTimeInputValue(appointment.scheduled_start_time)
  );
  const [endTime, setEndTime] = useState(
    toTimeInputValue(appointment.scheduled_end_time)
  );
  const [employeeId, setEmployeeId] = useState(appointment.employee_id ?? '');
  const [saving, setSaving] = useState(false);

  // Re-seed local state if the modal is opened against a different appt.
  useEffect(() => {
    setDate(appointment.scheduled_date);
    setStartTime(toTimeInputValue(appointment.scheduled_start_time));
    setEndTime(toTimeInputValue(appointment.scheduled_end_time));
    setEmployeeId(appointment.employee_id ?? '');
  }, [appointment]);

  const dirty =
    date !== appointment.scheduled_date ||
    startTime !== toTimeInputValue(appointment.scheduled_start_time) ||
    endTime !== toTimeInputValue(appointment.scheduled_end_time) ||
    (employeeId || null) !== (appointment.employee_id ?? null);

  const vehicleSummary = useMemo(() => {
    if (!appointment.vehicle) return null;
    return cleanVehicleDescription({
      year: appointment.vehicle.year,
      make: appointment.vehicle.make,
      model: appointment.vehicle.model,
    });
  }, [appointment.vehicle]);

  async function handleSave() {
    if (!dirty) {
      onClose();
      return;
    }

    if (!date || !startTime || !endTime) {
      toast.error('Date, start time, and end time are required');
      return;
    }

    if (endTime <= startTime) {
      toast.error('End time must be after start time');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      if (date !== appointment.scheduled_date) payload.scheduled_date = date;
      if (startTime !== toTimeInputValue(appointment.scheduled_start_time))
        payload.scheduled_start_time = startTime;
      if (endTime !== toTimeInputValue(appointment.scheduled_end_time))
        payload.scheduled_end_time = endTime;
      const newEmp = employeeId || null;
      if (newEmp !== (appointment.employee_id ?? null)) payload.employee_id = newEmp;

      const res = await posFetch(
        `/api/pos/appointments/${appointment.id}/reschedule`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json.error || 'Failed to update appointment');
        return;
      }

      toast.success('Appointment updated');
      onSaved(json.data as PosAppointment);
    } catch (err) {
      console.error('Reschedule error:', err);
      toast.error('Failed to update appointment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <DialogTitle>Edit Appointment</DialogTitle>
        <DialogDescription>
          {appointment.customer.first_name} {appointment.customer.last_name}
          {vehicleSummary ? ` — ${vehicleSummary}` : ''}
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        <div className="space-y-4">
          <FormField label="Date" htmlFor="reschedule-date">
            <Input
              id="reschedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-base sm:text-sm"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start" htmlFor="reschedule-start">
              <Input
                id="reschedule-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-base sm:text-sm"
              />
            </FormField>
            <FormField label="End" htmlFor="reschedule-end">
              <Input
                id="reschedule-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="text-base sm:text-sm"
              />
            </FormField>
          </div>

          <FormField label="Assigned Detailer" htmlFor="reschedule-employee">
            <Select
              id="reschedule-employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={staffLoading}
            >
              <option value="">Unassigned</option>
              {staff.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({ROLE_LABELS[emp.role] ?? emp.role})
                </option>
              ))}
            </Select>
          </FormField>

          <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Customer is <strong>not</strong> automatically notified when you
            reschedule from POS. Send the new time via SMS or call after
            saving.
          </p>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </DialogFooter>
      <DialogClose onClose={onClose} />
    </Dialog>
  );
}
