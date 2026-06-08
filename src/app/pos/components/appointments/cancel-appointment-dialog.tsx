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
import { Input } from '@/components/ui/input';
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

type Pathway = 'refund' | 'credit';

/**
 * POS-side cancel-appointment dialog.
 *
 * Phase 3 Theme D.1 (AC-9): adds Pathway selector (Refund vs Credit) plus an
 * optional cents-typed fee input on the Refund branch. Pre-D.1 the dialog only
 * collected reason + notify-customer; the route did no money movement.
 *
 * Notification behavior unchanged: "Notify customer" defaults OFF on POS
 * (operator-driven; matches the pre-D.1 contract). Operators can opt in via
 * the checkbox.
 */
export function CancelAppointmentDialog({
  open,
  appointment,
  onClose,
  onCancelled,
}: CancelAppointmentDialogProps) {
  const [reason, setReason] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [pathway, setPathway] = useState<Pathway>('refund');
  const [feeDollarsInput, setFeeDollarsInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed local state whenever the dialog is opened against a different
  // appointment (or re-opened after close).
  useEffect(() => {
    setReason('');
    setNotifyCustomer(false);
    setPathway('refund');
    setFeeDollarsInput('');
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

    // Parse fee (Pathway A only). Empty / non-numeric → no fee.
    let feeCents: number | null = null;
    if (pathway === 'refund' && feeDollarsInput.trim().length > 0) {
      const dollars = Number(feeDollarsInput);
      if (!Number.isFinite(dollars) || dollars < 0) {
        toast.error('Cancellation fee must be a non-negative number');
        return;
      }
      feeCents = Math.round(dollars * 100);
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
            pathway,
            cancellation_fee_cents: feeCents,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(json.error || 'Failed to cancel appointment');
        return;
      }

      // D.1 — surface the money-movement summary in the toast so the operator
      // confirms what actually happened (refund issued vs credit issued vs
      // pay-on-site no-op). The orchestrator returns these in `cancel_result`.
      const cr = json.cancel_result;
      let summary = 'Appointment cancelled';
      if (cr) {
        if (cr.pathway === 'refund') {
          const cents = cr.refund_amount_cents ?? 0;
          if (cents > 0) {
            summary += ` — refund $${(cents / 100).toFixed(2)} issued`;
          } else if (cr.amount_paid_cents === 0) {
            summary += ' — no payment to refund';
          } else if ((cr.cancellation_fee_cents ?? 0) >= cr.amount_paid_cents) {
            summary += ' — entire paid amount retained as fee';
          }
        } else if (cr.pathway === 'credit') {
          const cents = cr.credit_amount_cents ?? 0;
          if (cents > 0) {
            summary += ` — $${(cents / 100).toFixed(2)} credit issued`;
          } else {
            summary += ' — no payment to credit';
          }
        }
      }
      if (notifyCustomer) {
        summary += ' (customer notified)';
      }
      toast.success(summary);
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

          <FormField label="Refund Pathway" required htmlFor="pos-cancel-pathway">
            <div
              className="grid grid-cols-1 gap-2"
              role="radiogroup"
              aria-labelledby="pos-cancel-pathway"
            >
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  pathway === 'refund'
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                    : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
                }`}
              >
                <input
                  type="radio"
                  value="refund"
                  checked={pathway === 'refund'}
                  onChange={() => setPathway('refund')}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Refund (cash back via Stripe)
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Refund the paid amount (minus optional fee) to the
                    customer&apos;s original payment method.
                  </div>
                </div>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  pathway === 'credit'
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                    : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
                }`}
              >
                <input
                  type="radio"
                  value="credit"
                  checked={pathway === 'credit'}
                  onChange={() => setPathway('credit')}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    Customer Credit (apply to future visit)
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    Retain the full paid amount as account credit. No cash
                    back; balance is applied at the next checkout.
                  </div>
                </div>
              </label>
            </div>
          </FormField>

          {pathway === 'refund' && (
            <FormField
              label="Cancellation Fee (optional)"
              description="Deducted from the refund amount. Leave blank for no fee."
              htmlFor="pos-cancel-fee"
            >
              <Input
                id="pos-cancel-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={feeDollarsInput}
                onChange={(e) => setFeeDollarsInput(e.target.value)}
              />
            </FormField>
          )}

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
