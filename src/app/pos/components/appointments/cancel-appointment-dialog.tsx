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
import { cn } from '@/lib/utils/cn';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { formatMoney } from '@/lib/utils/format';
import {
  CANCELLATION_REASONS,
  isOtherReason,
  type CancellationReason,
} from '@/lib/appointments/cancellation-reasons';
import { posFetch } from '../../lib/pos-fetch';
import type { PosAppointment } from './types';

interface CancelAppointmentDialogProps {
  open: boolean;
  appointment: PosAppointment;
  onClose: () => void;
  onCancelled: (cancelled: PosAppointment) => void;
}

type Pathway = 'refund' | 'credit';
type Mode = 'A' | 'B';

/**
 * POS-side cancel-appointment dialog.
 *
 * Session #147 Commit B — two-mode shell (Option α single-component shape):
 *
 *   Mode A (`appointment.amount_paid_cents === 0`): no money to refund or
 *     credit. UI is chip-based reason picker + cancellation fee + notify
 *     toggle — mirrors the proven job-cancel modal UX (`job-detail.tsx`
 *     `CANCELLATION_REASONS`). Refund Pathway selector is NOT rendered.
 *     Submit body omits `pathway` field entirely (defense in depth: the
 *     orchestrator's amountPaidCents recompute also catches the absence).
 *     Fee, when entered, is recorded on `appointments.cancellation_fee`
 *     via the orchestrator's no-payment-with-fee branch.
 *
 *   Mode B (`appointment.amount_paid_cents > 0`): payment exists, the
 *     full Theme D.1/D.2 surface applies. UI is chip-based reason picker
 *     (same chips as Mode A for operator-muscle-memory parity) + Refund
 *     Pathway radiogroup + cancellation fee (Refund pathway only) +
 *     breakdown box + notify toggle. Submit body includes `pathway`.
 *
 * Mode-switch predicate: `appointment.amount_paid_cents > 0 ? 'B' : 'A'`.
 * Evaluated at component mount via the prop (frozen for dialog lifetime).
 * The orchestrator re-validates amountPaidCents server-side so any race
 * is caught — e.g. a webhook landing a payment mid-cancel still routes
 * through the canonical compute, and Mode A's submit-with-no-pathway
 * defaults the route to `pathway='refund'` which the orchestrator
 * resolves correctly via its `amountPaidCents === 0 && feeCents > 0`
 * branch (Commit B orchestrator change).
 *
 * History: pre-Theme-D.1 the dialog was a simple free-text + notify
 * toggle. Theme D.1 (2026-06-07) introduced the Refund Pathway selector,
 * which displaced the simpler shape for the no-payment case where the
 * pathway choice was meaningless. Commit B reframes: chip pattern from
 * the job-cancel modal (`pos/jobs/components/job-detail.tsx`) is now
 * shared via `@/lib/appointments/cancellation-reasons`; the Mode A
 * shape restores the pre-D.1 simplicity for unpaid cancels while
 * Mode B preserves D.1's full surface.
 *
 * Notification default: OFF in both modes. Pre-D.1 default, locked per
 * operator decision — cancel actions are sensitive; accidental
 * notifications are worse than missing notifications. Operator explicitly
 * opts in.
 */
export function CancelAppointmentDialog({
  open,
  appointment,
  onClose,
  onCancelled,
}: CancelAppointmentDialogProps) {
  // Mode is derived once from the canonical server-computed value. The
  // orchestrator owns the load-bearing recompute on submit — UI mode is
  // only for which surface to render. amount_paid_cents may be absent on
  // payloads from older callers (defensive ?? 0); falsy/absent means
  // Mode A which is the safer default (no Pathway selector → no
  // misleading affordance).
  const amountPaidCents = appointment.amount_paid_cents ?? 0;
  const mode: Mode = amountPaidCents > 0 ? 'B' : 'A';

  // Reason picker — shared across both modes. Chip-based; `'Other'`
  // expands a textarea fallback.
  const [reasonChip, setReasonChip] = useState<CancellationReason | null>(null);
  const [reasonCustomText, setReasonCustomText] = useState('');

  // Notify toggle — shared.
  const [notifyCustomer, setNotifyCustomer] = useState(false);

  // Cancellation fee — shared (Mode A always visible, Mode B visible
  // only when pathway === 'refund' to preserve D.1 credit-path
  // semantics).
  const [feeDollarsInput, setFeeDollarsInput] = useState('');
  const [defaultFeeCents, setDefaultFeeCents] = useState<number | null>(null);

  // Mode-B-only state. Slot exists in Mode A's memory (unused) — leak
  // guard lives at the submit body which strictly omits `pathway` in
  // Mode A. See dialog header comment for the contract.
  const [pathway, setPathway] = useState<Pathway>('refund');

  const [saving, setSaving] = useState(false);

  // Re-seed local state whenever the dialog is opened against a different
  // appointment (or re-opened after close).
  useEffect(() => {
    setReasonChip(null);
    setReasonCustomText('');
    setNotifyCustomer(false);
    setPathway('refund');
    setFeeDollarsInput('');
  }, [appointment.id]);

  // Phase 3 Theme D.2 (AC-14): fetch the configured default cancellation fee
  // on dialog open and pre-fill the input. Mirrors the admin dialog's
  // pattern; uses posFetch for HMAC auth against the POS-side endpoint at
  // `/api/pos/settings/cancellation-fee-default`. Graceful: a fetch failure
  // leaves the input empty + the orchestrator's own default-read covers
  // the server side. Applies in BOTH modes (Commit B locked decision —
  // D.2 fee policy applies regardless of payment state).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await posFetch('/api/pos/settings/cancellation-fee-default');
        if (!res.ok) return;
        const json = (await res.json()) as { default_cents?: number };
        if (cancelled) return;
        const cents = typeof json.default_cents === 'number' ? json.default_cents : 0;
        setDefaultFeeCents(cents);
        setFeeDollarsInput((cents / 100).toFixed(2));
      } catch {
        /* graceful */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, appointment.id]);

  // Fee parse — shared computation, surfaces in both breakdown box and
  // the canSubmit gate.
  const feeInputCents = (() => {
    const num = Number(feeDollarsInput);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.round(num * 100);
  })();
  const refundPreviewCents = Math.max(0, amountPaidCents - feeInputCents);

  const vehicleSummary = appointment.vehicle
    ? cleanVehicleDescription({
        year: appointment.vehicle.year,
        make: appointment.vehicle.make,
        model: appointment.vehicle.model,
      })
    : null;

  // Submit gate — chip selected AND (if Other, textarea has content).
  // Mirrors the job-cancel modal's gate semantics at
  // `pos/jobs/components/job-detail.tsx:1797-1801`.
  const trimmedCustomText = reasonCustomText.trim();
  const reasonValid = !!(
    reasonChip &&
    (!isOtherReason(reasonChip) || trimmedCustomText.length > 0)
  );
  const canSubmit = reasonValid && !saving;

  async function handleConfirm() {
    if (!canSubmit) {
      toast.error('Please select a cancellation reason');
      return;
    }

    // Resolve the cancellation_reason text: chip label or custom-text fallback.
    const cancellationReason = isOtherReason(reasonChip)
      ? trimmedCustomText
      : (reasonChip as string);

    // Parse fee — shown in both modes; Mode B's credit branch ignores it
    // server-side, but we still send it so the orchestrator can decide.
    // Mode A: fee is the no-refund-fee-only path (orchestrator's
    // `amountPaidCents === 0 && feeCents > 0` branch records to
    // `appointments.cancellation_fee`).
    let feeCents: number | null = null;
    if (feeDollarsInput.trim().length > 0) {
      const dollars = Number(feeDollarsInput);
      if (!Number.isFinite(dollars) || dollars < 0) {
        toast.error('Cancellation fee must be a non-negative number');
        return;
      }
      feeCents = Math.round(dollars * 100);
    }

    setSaving(true);
    try {
      // Mode-A body: pathway field STRICTLY OMITTED (Commit B contract).
      // The orchestrator defaults to 'refund' when pathway is absent, then
      // hits the `amountPaidCents === 0` branch and noops the money side
      // (fee recorded if > 0; nothing else). Defense in depth: the absence
      // is structural, not just a `pathway = null` value.
      // Mode-B body: pathway included as today.
      const body: {
        cancellation_reason: string;
        notify_customer: boolean;
        cancellation_fee_cents: number | null;
        pathway?: Pathway;
      } = {
        cancellation_reason: cancellationReason,
        notify_customer: notifyCustomer,
        cancellation_fee_cents: feeCents,
      };
      if (mode === 'B') {
        body.pathway = pathway;
      }

      const res = await posFetch(
        `/api/pos/appointments/${appointment.id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
            // Mode A path. If a fee was recorded, surface it.
            const feeShown = cr.cancellation_fee_cents ?? 0;
            summary += feeShown > 0
              ? ` — no payment to refund; $${(feeShown / 100).toFixed(2)} fee recorded`
              : ' — no payment to refund';
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

  // Mode B's fee field renders only when pathway === 'refund' (credit
  // pathway holds the full paid amount as credit, no deduction). Mode A
  // always renders fee (operator-collected separately per D.2 policy).
  const showFeeField = mode === 'A' || pathway === 'refund';

  // Breakdown box renders only in Mode B with a fee field visible AND
  // there's a paid amount to break down. Mode A omits the breakdown
  // entirely — there's nothing to deduct from.
  const showBreakdown =
    mode === 'B' && pathway === 'refund' && amountPaidCents > 0;

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
          {/* Reason picker (chips + Other fallback) — Both modes */}
          <FormField
            label="Cancellation Reason"
            required
            htmlFor="pos-cancel-reason-group"
          >
            <div
              id="pos-cancel-reason-group"
              className="space-y-2"
              role="radiogroup"
              aria-label="Cancellation reason"
            >
              {CANCELLATION_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                    reasonChip === r
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <input
                    type="radio"
                    name="pos-cancel-reason"
                    value={r}
                    checked={reasonChip === r}
                    onChange={() => setReasonChip(r)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>
            {isOtherReason(reasonChip) && (
              <textarea
                value={reasonCustomText}
                onChange={(e) => setReasonCustomText(e.target.value)}
                placeholder="Describe the reason..."
                rows={2}
                autoFocus
                className="mt-2 flex w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              />
            )}
          </FormField>

          {/* Refund Pathway — Mode B only */}
          {mode === 'B' && (
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
          )}

          {/* Cancellation Fee — Mode A always; Mode B only when refund pathway */}
          {showFeeField && (
            <FormField
              label="Cancellation Fee"
              description={
                mode === 'A'
                  ? defaultFeeCents !== null
                    ? `Pre-filled from default (${formatMoney(defaultFeeCents)}). Recorded on the appointment — collect separately (cash at next visit, future invoice) or waive.`
                    : 'Recorded on the appointment for reporting. Operator collects separately.'
                  : defaultFeeCents !== null
                    ? `Pre-filled from default (${formatMoney(defaultFeeCents)}). Adjust per-cancel or waive.`
                    : 'Deducted from the refund amount.'
              }
              htmlFor="pos-cancel-fee"
            >
              <div className="flex items-center gap-2">
                <Input
                  id="pos-cancel-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={feeDollarsInput}
                  onChange={(e) => setFeeDollarsInput(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFeeDollarsInput('0')}
                >
                  Waive
                </Button>
              </div>
              {showBreakdown && (
                <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>Amount paid</span>
                    <span className="tabular-nums">{formatMoney(amountPaidCents)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>Cancellation fee</span>
                    <span className="tabular-nums">
                      {feeInputCents > 0 ? `-${formatMoney(feeInputCents)}` : formatMoney(0)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <span>Refund to customer</span>
                    <span className="tabular-nums">{formatMoney(refundPreviewCents)}</span>
                  </div>
                </div>
              )}
            </FormField>
          )}

          {/* Notify toggle — Both modes (shared) */}
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
