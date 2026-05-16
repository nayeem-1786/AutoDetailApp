'use client';

import { useEffect, useState } from 'react';
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
import { FormField } from '@/components/ui/form-field';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { posFetch } from '../../lib/pos-fetch';
import type { PosAppointment } from './types';

interface CancelAppointmentDialogProps {
  open: boolean;
  appointment: PosAppointment;
  onClose: () => void;
  onCancelled: (cancelled: PosAppointment) => void;
}

/**
 * POS-side cancel-appointment dialog (Roadmap Item 15b).
 *
 * Mirrors the architectural style of the Item 12 reschedule dialog: a single
 * focused operation with explicit messaging about notification behavior. The
 * "Notify customer" checkbox defaults to OFF — operators cancel quietly
 * unless they opt in, matching the same "POS surfaces don't auto-notify"
 * pattern Item 12 established for reschedule.
 *
 * The server endpoint (POST /api/pos/appointments/[id]/cancel) honors the
 * `notify_customer` flag by gating both `sendCancellationNotifications`
 * AND the `appointment_cancelled` webhook. When the box is unchecked, the
 * customer gets zero direct contact from this cancel action.
 */
export function CancelAppointmentDialog({
  open,
  appointment,
  onClose,
  onCancelled,
}: CancelAppointmentDialogProps) {
  const [reason, setReason] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed local state whenever the dialog is opened against a different
  // appointment (or re-opened after close).
  useEffect(() => {
    setReason('');
    setNotifyCustomer(false);
  }, [appointment.id]);

  const vehicleSummary = appointment.vehicle
    ? cleanVehicleDescription({
        year: appointment.vehicle.year,
        make: appointment.vehicle.make,
        model: appointment.vehicle.model,
      })
    : null;

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !saving;

  async function handleConfirm() {
    if (!canSubmit) {
      toast.error('Cancellation reason is required');
      return;
    }

    setSaving(true);
    try {
      const res = await posFetch(
        `/api/pos/appointments/${appointment.id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cancellation_reason: trimmedReason,
            notify_customer: notifyCustomer,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json.error || 'Failed to cancel appointment');
        return;
      }

      toast.success(
        notifyCustomer
          ? 'Appointment cancelled — customer notified'
          : 'Appointment cancelled'
      );
      onCancelled(json.data as PosAppointment);
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error('Failed to cancel appointment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <DialogTitle>Cancel Appointment</DialogTitle>
        <DialogDescription>
          {appointment.customer.first_name} {appointment.customer.last_name}
          {vehicleSummary ? ` — ${vehicleSummary}` : ''}
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        <div className="space-y-4">
          <FormField
            label="Cancellation Reason"
            required
            htmlFor="pos-cancel-reason"
          >
            <textarea
              id="pos-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation..."
              autoFocus
              className="flex w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
            />
          </FormField>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyCustomer}
              onChange={(e) => setNotifyCustomer(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Notify customer (send cancellation SMS + email)
            </span>
          </label>

          <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {notifyCustomer ? (
              <>
                Customer <strong>will</strong> receive a cancellation SMS and
                email automatically.
              </>
            ) : (
              <>
                Customer is <strong>not</strong> automatically notified. Send a
                message manually via SMS or call after cancelling if needed.
              </>
            )}
          </p>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Keep Appointment
        </Button>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={!canSubmit}
        >
          {saving ? 'Cancelling…' : 'Cancel Appointment'}
        </Button>
      </DialogFooter>
      <DialogClose onClose={onClose} />
    </Dialog>
  );
}
