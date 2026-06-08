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
import { FormField } from '@/components/ui/form-field';
import {
  appointmentCancelSchema,
  type AppointmentCancelInput,
} from '@/lib/utils/validation';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatMoney } from '@/lib/utils/format';
import type { AppointmentWithRelations } from '../types';

interface CancelAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithRelations | null;
  onConfirm: (id: string, data: AppointmentCancelInput) => Promise<boolean>;
}

/**
 * Admin Cancel Appointment dialog.
 *
 * Phase 3 Theme D.1 (AC-9): adds a Pathway selector (Refund vs Credit) so the
 * operator can choose whether the cancel issues a Stripe refund (minus an
 * optional fee) or retains the paid amount as a customer credit. Pre-D.1 this
 * dialog only collected `cancellation_reason` + optional `cancellation_fee`;
 * the route did no money movement at all (audit `3e633156` Target A.2).
 *
 * Notification: pre-D.1 customer notifications fired unconditionally on the
 * admin path; D.1 surfaces a "Notify customer" checkbox (default ON) so the
 * operator can suppress in edge cases (e.g., they're calling the customer
 * directly).
 */
export function CancelAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onConfirm,
}: CancelAppointmentDialogProps) {
  const [saving, setSaving] = useState(false);
  const { enabled: feeEnabled } = useFeatureFlag(FEATURE_FLAGS.CANCELLATION_FEE);
  const { granted: canWaiveFee } = usePermission('appointments.waive_fee');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AppointmentCancelInput>({
    resolver: zodResolver(appointmentCancelSchema),
    defaultValues: {
      cancellation_reason: '',
      cancellation_fee: undefined,
      pathway: 'refund',
      notify_customer: true,
    },
  });

  // Phase 3 Theme D.2 (AC-14): fetch the configured default cancellation fee
  // on dialog open and pre-fill the fee input. The breakdown UI computes the
  // refund amount client-side using `appointment.deposit_amount` as the paid
  // proxy (most cancels are deposit-only); a multi-source actual is surfaced
  // in the post-submit toast which the orchestrator computes authoritatively.
  const [defaultFeeCents, setDefaultFeeCents] = useState<number | null>(null);
  // Local mirror of the fee dollars value (UI-only) for the live breakdown
  // computation. The form value still flows through `register()`; this state
  // is synced via the Input's onChange below. Pattern mirrors the existing
  // `selectedPathway` state at line 81 — `watch()` triggers React Compiler
  // "Compilation Skipped" warnings that count against the lint baseline.
  const [feeDollarsMirror, setFeeDollarsMirror] = useState<string>('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/cancellation-fee-default');
        if (!res.ok) return;
        const json = (await res.json()) as { default_cents?: number };
        if (cancelled) return;
        const cents = typeof json.default_cents === 'number' ? json.default_cents : 0;
        setDefaultFeeCents(cents);
        const dollars = (cents / 100).toFixed(2);
        setValue('cancellation_fee', cents / 100, { shouldDirty: false });
        setFeeDollarsMirror(dollars);
      } catch {
        // Graceful: the orchestrator's own default-read covers the server side.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, setValue]);

  // Live breakdown — depositAmount is the paid proxy. The mirror state drives
  // real-time refund computation as operator edits or clicks Waive.
  const depositPaidCents =
    appointment && appointment.deposit_amount != null
      ? Math.round(Number(appointment.deposit_amount) * 100)
      : 0;
  const feeInputCents = (() => {
    const num = Number(feeDollarsMirror);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.round(num * 100);
  })();
  const refundPreviewCents = Math.max(0, depositPaidCents - feeInputCents);

  // Local mirror of the radio's selected value drives the fee-input
  // visibility — fee deduction is a Pathway A concept (refund minus fee).
  // Pathway B issues the full paid amount as credit; the fee field is hidden
  // to avoid operator confusion. We keep this as plain useState rather than
  // react-hook-form's `watch()` because watch() triggers a "Compilation
  // Skipped" React Compiler warning that would inflate the lint baseline.
  // Form value still flows through `register('pathway')`; this useState is
  // a UI-only mirror that the radio onChange syncs.
  const [selectedPathway, setSelectedPathway] = useState<'refund' | 'credit'>(
    'refund'
  );
  const pathwayRegister = register('pathway');

  if (!appointment) return null;

  async function onSubmit(data: AppointmentCancelInput) {
    if (!appointment) return;
    setSaving(true);
    const success = await onConfirm(appointment.id, data);
    setSaving(false);
    if (success) {
      reset();
      setSelectedPathway('refund');
      setFeeDollarsMirror('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          reset();
          setSelectedPathway('refund');
        }
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
        <form
          id="cancel-appointment-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
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

          {/* D.1 — Pathway selector. Default = 'refund' (mirrors pre-D.1 intent
              for paid appointments). Operator switches to 'credit' for the
              "retain as credit for future visit" case. Uses register() instead
              of Controller so the React Compiler can statically analyze the
              radio inputs (Controller's render-prop pattern triggers
              "Compilation Skipped" warnings that count against the lint baseline). */}
          <FormField label="Refund Pathway" required htmlFor="cancel-pathway">
            <div
              className="grid grid-cols-1 gap-2"
              role="radiogroup"
              aria-labelledby="cancel-pathway"
            >
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  selectedPathway === 'refund'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  value="refund"
                  {...pathwayRegister}
                  onChange={(e) => {
                    pathwayRegister.onChange(e);
                    setSelectedPathway('refund');
                  }}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Refund (cash back via Stripe)
                  </div>
                  <div className="text-xs text-gray-600">
                    Refund the paid amount (minus optional fee) to the
                    customer&apos;s original payment method.
                  </div>
                </div>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  selectedPathway === 'credit'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  value="credit"
                  {...pathwayRegister}
                  onChange={(e) => {
                    pathwayRegister.onChange(e);
                    setSelectedPathway('credit');
                  }}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Customer Credit (apply to future visit)
                  </div>
                  <div className="text-xs text-gray-600">
                    Retain the full paid amount as account credit. No cash
                    back; balance is applied at the next checkout.
                  </div>
                </div>
              </label>
            </div>
          </FormField>

          {/* Fee input + breakdown — Pathway A only. Pathway B issues the
              FULL paid amount as credit, so a fee deduction here would be a
              usability trap. Hidden when 'credit' selected.

              Phase 3 Theme D.2 (AC-14): pre-filled with the configured
              default (fetched from /api/admin/settings/cancellation-fee-default
              on dialog open); operator can override the input; "Waive fee"
              button sets the fee to $0 explicitly. The breakdown line
              renders only when the appointment has a deposit_amount,
              showing the refund preview live as the fee changes. */}
          {feeEnabled && canWaiveFee && selectedPathway === 'refund' && (
            <FormField
              label="Cancellation Fee"
              error={errors.cancellation_fee?.message}
              description={
                defaultFeeCents !== null
                  ? `Pre-filled from default (${formatMoney(defaultFeeCents)}). Adjust per-cancel or waive.`
                  : 'Optional fee deducted from the refund amount'
              }
              htmlFor="cancel-fee"
            >
              <div className="flex items-center gap-2">
                {(() => {
                  const feeReg = register('cancellation_fee', { valueAsNumber: true });
                  return (
                    <Input
                      id="cancel-fee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="flex-1"
                      {...feeReg}
                      onChange={(e) => {
                        feeReg.onChange(e);
                        setFeeDollarsMirror(e.target.value);
                      }}
                    />
                  );
                })()}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setValue('cancellation_fee', 0, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setFeeDollarsMirror('0');
                  }}
                >
                  Waive
                </Button>
              </div>
              {depositPaidCents > 0 && (
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex justify-between text-gray-700">
                    <span>Deposit paid</span>
                    <span className="tabular-nums">{formatMoney(depositPaidCents)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Cancellation fee</span>
                    <span className="tabular-nums">
                      {feeInputCents > 0 ? `-${formatMoney(feeInputCents)}` : formatMoney(0)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 text-sm font-semibold text-gray-900">
                    <span>Refund to customer</span>
                    <span className="tabular-nums">{formatMoney(refundPreviewCents)}</span>
                  </div>
                </div>
              )}
            </FormField>
          )}

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register('notify_customer')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Notify customer (send cancellation SMS + email)
            </span>
          </label>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            setSelectedPathway('refund');
            setFeeDollarsMirror('');
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
          setSelectedPathway('refund');
          setFeeDollarsMirror('');
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
