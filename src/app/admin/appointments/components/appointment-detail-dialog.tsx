'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, MonitorSmartphone, Pencil } from 'lucide-react';
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
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { formatCurrency, formatPhone } from '@/lib/utils/format';
import { appointmentUpdateSchema, type AppointmentUpdateInput } from '@/lib/utils/validation';
import { composeLineItems } from '@/lib/utils/compose-line-items';
import { APPOINTMENT_STATUS_LABELS, ROLE_LABELS } from '@/lib/utils/constants';
import {
  EditMobileModal,
  type EditMobileModalSavedResult,
} from '@/components/jobs/edit-mobile-modal';
import { PaymentMismatchBanner } from '@/components/jobs/payment-mismatch-banner';
import { ModifierSummary } from '@/components/appointments/modifier-summary';
// Item 15e Phase 2A — STATUS_TRANSITIONS + AppointmentWithRelations were
// lifted to shared lib so this dialog can be reused dual-context (admin + POS
// Schedule scope). Admin behavior is unchanged; the data is identical.
import { STATUS_TRANSITIONS, isServiceEditableStatus } from '@/lib/appointments/status-transitions';
import { isEarlierState } from '@/lib/appointments/lifecycle-sync';
import { UnMaterializeConfirmationDialog } from '@/components/appointments/un-materialize-confirmation-dialog';
import { canSendPaymentLink } from '@/components/jobs/can-send-payment-link';
import type { AppointmentWithRelations } from '@/lib/appointments/types';
import type { AppointmentStatus, Employee } from '@/lib/supabase/types';


const CHANNEL_LABELS: Record<string, string> = {
  online: 'Client (Online Booking)',
  portal: 'Client (Customer Portal)',
  phone: 'Staff (Phone)',
  walk_in: 'Staff (Walk-in)',
};

// Strip an HH:MM:SS time string down to HH:MM for the native time input
// (step=60 validator rejects seconds-precise values). Same helper shape as
// the POS reschedule dialog. Item 15f Phase 1 Layer 8e — defensive against
// any legacy walk-in row that pre-dates the minute-precision normalization.
function toTimeInputValue(time: string | null | undefined): string {
  return time?.slice(0, 5) ?? '';
}

interface AppointmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithRelations | null;
  employees: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'>[];
  // Session 1.1 — `onSave` and `onCancel` are optional ONLY when
  // `readOnly={true}`. The dashboard quick-peek surface omits both
  // and passes `readOnly={true}`; every other caller MUST pass real
  // handlers. The form-submit path is statically unreachable in
  // read-only mode (the form + Save button aren't rendered), so
  // optional here is safe; a runtime guard at the submit site
  // protects against future regressions if a caller forgets both.
  onSave?: (id: string, data: AppointmentUpdateInput) => Promise<boolean>;
  onCancel?: (appointment: AppointmentWithRelations) => void;
  canReschedule: boolean;
  canCancel: boolean;
  canAddNotes?: boolean;
  // Session 1.3 — permission gate for the status dropdown. Parity audit
  // b346d34b Target B.12 found the dialog accepted `canReschedule`,
  // `canCancel`, `canAddNotes` but NOT `canUpdateStatus` — an operator
  // without `appointments.update_status` saw a fully-rendered status
  // dropdown, picked a value, hit Save, and got a 403 toast (useless
  // action surface). When `canUpdateStatus === false`, the status field
  // renders as a read-only `<dd>` block instead of a `<Select>` — the
  // form-submit path leaves `data.status` undefined and the PATCH
  // schema's optional status field is simply omitted. Default `true`
  // preserves byte-identical behavior for existing callers.
  canUpdateStatus?: boolean;
  // Session 1.1 — unified host-divergence prop. Replaces the legacy trio
  // (`mobileModalMode`, `modifierVariant`, and a would-be
  // `unmaterializeContext`) per parity audit b346d34b Concern 2 and
  // Memory #2 (one prop per dimension of host divergence). Default
  // `'admin'` preserves byte-identical admin behavior; POS Schedule host
  // passes `'pos'`. Threaded down to:
  //   - <EditMobileModal mode={...}> — auth surface (posFetch + POS mobile
  //     zones endpoint vs admin fetch)
  //   - <ModifierSummary variant={...}> — dark-aware POS styling
  //   - <UnMaterializeConfirmationDialog context={...}> — endpoint URL +
  //     auth (closes Target D Finding 1 — was hardcoded 'admin' literal,
  //     a no-op-equivalent that 401'd POS un-materialize → admin login
  //     redirect)
  hostContext?: 'admin' | 'pos';
  // Session 1.1 — view-only mode. When true (dashboard quick-peek mount):
  //   - Save button hidden (visible-but-disabled is itself misleading)
  //   - Cancel Appointment button hidden (no destructive action in view mode)
  //   - All editable form fields disabled
  //   - `onSave` / `onCancel` may be omitted (statically unreachable)
  // Default false — every other caller is read/write. Per parity audit
  // b346d34b Q1 (operator confirmed view-only over wire-real-handlers).
  readOnly?: boolean;
  // `returnToPath` — destination for the "Edit in POS" deep-link's `returnTo`
  // param. After the operator saves changes inside the POS Sale tab,
  // Layer 8c's "Save Changes → router.push(returnTo)" navigates here.
  // Admin default returns to `/admin/appointments`; POS Schedule host
  // passes `/pos/jobs`. MUST be a same-origin internal path — validated
  // by `isSafeInternalPath` in `use-edit-mode-drain.ts`. Replaces the
  // Phase 2B `onEditInPos` no-op suppression (see audit
  // `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md`). Kept separate from
  // `hostContext` per parity audit Concern 2 — it parameterizes a URL,
  // not a host.
  returnToPath?: string;
  // Session #145 (Ian-Austria-unblock) — optional Send Payment Link
  // affordance in the footer middle slot. When the prop is provided AND
  // the shared `canSendPaymentLink` predicate evaluates true, the footer
  // renders a green "Send Payment Link" button between Cancel Appointment
  // (red, left-aligned) and Save Changes (dark, right-aligned). The button
  // click closes the dialog and invokes this callback; the parent owns the
  // PaymentLinkAmountModal + SendPaymentLinkDialog two-step mount (mirrors
  // the existing onCancel handoff pattern). Omit this prop to keep the
  // pre-#145 footer shape (Close button preserved as the middle slot).
  // The POS Schedule scope passes it; admin paths can opt in by passing
  // a parent-side handler that mounts the same modal chain.
  onSendPaymentLink?: (appointment: AppointmentWithRelations) => void;
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
  canAddNotes = true,
  canUpdateStatus = true,
  hostContext = 'admin',
  readOnly = false,
  returnToPath = '/admin/appointments',
  onSendPaymentLink,
}: AppointmentDetailDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  // Item 15e Phase 2C-β-2: un-materialize intercept. When Save reverts the
  // status to an earlier lifecycle state AND an active job exists, open the
  // shared confirmation modal instead of the normal save.
  const [showUnMaterializeModal, setShowUnMaterializeModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<AppointmentUpdateInput | null>(null);
  // Phase Mobile-1.9: full mobile picker edit replaces the Phase 1.6
  // address-only inline editor. State drives the shared modal + the
  // post-save mismatch banner. Local overrides so the dialog reflects
  // the saved snapshot without waiting on a list re-fetch.
  // Phase Mobile-1.9 — union state distinguishes the two entry points:
  //  - 'edit'   — appointment already mobile, picker pre-fills snapshot
  //  - 'enable' — appointment non-mobile, picker opens with toggle ON +
  //               blank fields (creation-time parity follow-up)
  //  - null     — modal closed.
  const [editingMobile, setEditingMobile] = useState<'edit' | 'enable' | null>(
    null
  );
  const [mobileOverride, setMobileOverride] = useState<
    EditMobileModalSavedResult | null
  >(null);
  const [paymentMismatch, setPaymentMismatch] = useState<{
    amount: number;
    newTotal: number;
    paidAmount: number;
  } | null>(null);

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
        // Item 15f Phase 1 Layer 8e — truncate to HH:MM so the native
        // `<input type="time">` step=60 validator accepts legacy rows
        // that were stored at HH:MM:SS precision (walk-in path pre-Layer-8e
        // wrote seconds; backfill migration normalizes existing rows, but
        // this truncation keeps the form correct against any future drift).
        // Save round-trip stores HH:MM, which Postgres widens to HH:MM:00.
        scheduled_start_time: toTimeInputValue(appointment.scheduled_start_time),
        scheduled_end_time: toTimeInputValue(appointment.scheduled_end_time),
        employee_id: appointment.employee_id || '',
        job_notes: appointment.job_notes || '',
        internal_notes: appointment.internal_notes || '',
      });
      // Reset Phase Mobile-1.9 picker state when a different appointment
      // loads or the dialog reopens.
      setEditingMobile(null);
      setMobileOverride(null);
      setPaymentMismatch(null);
    }
  }, [appointment, open, reset]);

  // Phase Mobile-1.9 — modal owns its own PATCH + toast. This callback
  // merges the saved snapshot into the local override so the dialog
  // re-renders with the new state without re-fetching the appointment
  // list. Mismatch banner surfaces when the new total ≠ paid amount.
  function handleMobileEditSaved(result: EditMobileModalSavedResult) {
    setMobileOverride(result);
    if (Math.abs(result.mismatch_amount) >= 0.005) {
      setPaymentMismatch({
        amount: result.mismatch_amount,
        newTotal: result.total_amount,
        paidAmount: result.total_amount - result.mismatch_amount,
      });
    } else {
      setPaymentMismatch(null);
    }
  }

  if (!appointment) return null;

  const allStatuses: AppointmentStatus[] = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
  // Filter out 'cancelled' if user doesn't have permission to cancel (unless already cancelled)
  const availableStatuses = canCancel || appointment.status === 'cancelled'
    ? allStatuses
    : allStatuses.filter((s) => s !== 'cancelled');
  const recommendedStatuses = [appointment.status, ...STATUS_TRANSITIONS[appointment.status]].filter(s => availableStatuses.includes(s));
  const overrideStatuses = availableStatuses.filter((s) => !recommendedStatuses.includes(s));
  const showCancelButton =
    canCancel && appointment.status !== 'cancelled';
  const services = appointment.appointment_services;
  const displayedTotal = Number(appointment.total_amount);
  // Item 15a — service edit follows the reschedule role distribution
  // (admin/cashier/super_admin yes; detailer no). Server enforces too.
  // Hidden once the appointment hits a terminal status; the API would
  // reject those with a 400. The terminal set (completed / cancelled /
  // no_show) lives in `status-transitions.ts` and is shared with the
  // server cascade (`service-edit.ts`) so this render gate stays
  // lockstep with the load-endpoint refusal.
  const canEditServices = canReschedule && isServiceEditableStatus(appointment.status);

  async function onSubmit(data: AppointmentUpdateInput) {
    if (!appointment) return;
    // Session 1.1 — defense-in-depth guard. The Save button isn't rendered
    // when `readOnly={true}`, so this submit handler is statically
    // unreachable in view-only mode. The guard is here in case a future
    // caller forgets `onSave` AND `readOnly={true}` simultaneously.
    if (!onSave) return;

    // If status is being changed to cancelled, redirect to cancel dialog
    if (data.status === 'cancelled' && appointment.status !== 'cancelled') {
      if (!canCancel || !onCancel) {
        // User doesn't have permission to cancel, or no cancel handler wired
        return;
      }
      onOpenChange(false);
      onCancel(appointment);
      return;
    }

    // Item 15e Phase 2C-β-2 — un-materialize intercept. Fires ONLY when all
    // three hold: the status is actually changing, it is moving to an EARLIER
    // lifecycle state (a revert — not cancel/no_show, which `isEarlierState`
    // excludes), and a non-terminal job exists (`has_active_job === true`).
    // Otherwise this is byte-identical to the prior normal save path.
    if (
      data.status !== undefined &&
      data.status !== appointment.status &&
      isEarlierState(data.status, appointment.status) &&
      appointment.has_active_job === true
    ) {
      setPendingFormData(data);
      setShowUnMaterializeModal(true);
      return;
    }

    setSaving(true);
    const payload = { ...data, employee_id: data.employee_id || null };
    const success = await onSave(appointment.id, payload);
    setSaving(false);
    if (success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        {/* Item 15f Phase 1 Layer 8d-bis — "Edit in POS" promoted to a
            top-right button styled to match the admin shell's "Open POS"
            header pattern (MonitorSmartphone icon + same bordered button
            shape). The DialogClose component is positioned
            `absolute right-4 top-4`, so this button sits inside the header
            flow with right-padding reserved for the close icon.
            Click navigates to the POS deep-link drain
            (`use-edit-mode-drain.ts`), parameterized by `returnToPath` so
            both admin and POS Schedule hosts share one handler — admin
            returns to `/admin/appointments`, POS Schedule returns to
            `/pos/jobs`. Replaces the Phase 2B `onEditInPos` no-op
            suppression that left the button visible-but-inert on POS
            Schedule (see `docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md`). */}
        {canEditServices && appointment && (
          <button
            type="button"
            onClick={() =>
              router.push(
                `/pos?source=appointment&id=${appointment.id}&returnTo=${encodeURIComponent(returnToPath)}`
              )
            }
            className="absolute right-12 top-4 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <MonitorSmartphone className="h-4 w-4" />
            <span>Edit in POS</span>
          </button>
        )}
        <DialogTitle>Appointment Details</DialogTitle>
        <DialogDescription>
          {appointment.customer.first_name} {appointment.customer.last_name}
        </DialogDescription>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        {/* Read-only info */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Customer</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {appointment.customer.first_name} {appointment.customer.last_name}
            </dd>
            {appointment.customer.phone && (
              <dd className="text-xs text-gray-500 dark:text-gray-400">{formatPhone(appointment.customer.phone)}</dd>
            )}
            {appointment.customer.email && (
              <dd className="text-xs text-gray-500 dark:text-gray-400">{appointment.customer.email}</dd>
            )}
          </div>

          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Booked By</dt>
            <dd className="text-gray-900 dark:text-gray-100">
              {CHANNEL_LABELS[appointment.channel] || appointment.channel}
            </dd>
          </div>

          {appointment.vehicle && (
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Vehicle</dt>
              <dd className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <span>
                  {cleanVehicleDescription({ year: appointment.vehicle.year, make: appointment.vehicle.make, model: appointment.vehicle.model })}
                  {sanitizeVehicleField(appointment.vehicle.color) ? ` — ${appointment.vehicle.color}` : ''}
                </span>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Total</dt>
            <dd className="text-gray-900 dark:text-gray-100 font-medium">{formatCurrency(displayedTotal)}</dd>
          </div>

          {appointment.deposit_amount != null && appointment.deposit_amount > 0 && (
            <div>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Deposit Collected</dt>
              <dd className="text-green-700 dark:text-green-400 font-medium">
                {formatCurrency(appointment.deposit_amount)}
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-1">
                  (Balance: {formatCurrency(displayedTotal - appointment.deposit_amount)})
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* Services list — Phase Mobile-1.7 refactor: render through the
            shared composeLineItems so the synthetic mobile-fee row stays
            consistent across surfaces. Visual output identical to the
            prior ad-hoc append (Phase Mobile-1 Option D2).
            Item 15f Phase 1 Layer 8d-bis — Edit affordance moved to the
            top-right of the dialog header ("Edit in POS" button), matching
            the admin shell's "Open POS" pattern. The in-Services text link
            is gone; both single- and modifier-edit entry points go through
            that one promoted button. */}
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Services</p>
          </div>
          <div className="mt-1 space-y-0.5">
            {composeLineItems(
              appointment,
              services.map((as) => ({
                name: as.service?.name || 'Service',
                quantity: 1,
                unit_price: as.price_at_booking,
                total_price: as.price_at_booking,
              }))
            ).map((item, idx) => {
              const rowKey = item.is_mobile_fee
                ? `mobile-fee-${idx}`
                : (services[idx]?.id ?? `svc-${idx}`);
              return (
                <div key={rowKey} className="flex justify-between text-sm">
                  <span className="text-gray-900 dark:text-gray-100">{item.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatCurrency(item.total_price)}</span>
                </div>
              );
            })}
          </div>
          {/* Item 15g Layer 15g-iii — modifier summary block. Read-only display
              of coupon / loyalty / manual discount snapshotted on the
              appointment row (booking wizard + convertQuote populate these).
              Hidden when no modifier is applied. Edits go through POS
              (Phase 1 — Item 15f layers 8a-8f). */}
          <ModifierSummary
            coupon_code={appointment.coupon_code}
            coupon_discount={appointment.coupon_discount}
            loyalty_points_redeemed={appointment.loyalty_points_redeemed}
            loyalty_discount={appointment.loyalty_discount}
            manual_discount_value={appointment.manual_discount_value}
            manual_discount_label={appointment.manual_discount_label}
            variant={hostContext}
          />
        </div>

        {/* Mobile Service — Phase Mobile-1.9 expanded card. Shows zone
            snapshot (frozen at save time per LOCKED-7.6) + surcharge +
            address. Pencil opens the shared full picker modal. The
            `appointments.add_notes` permission still gates the edit
            server-side (mirrors the Phase 1.6 endpoint pattern). */}
        {(mobileOverride?.is_mobile ?? appointment.is_mobile) && (
          <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <MapPin className="h-3.5 w-3.5" />
                <span>Mobile Service</span>
              </div>
              {canAddNotes && !readOnly && (
                <button
                  type="button"
                  onClick={() => setEditingMobile('edit')}
                  aria-label="Edit mobile service"
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 space-y-0.5 text-sm text-gray-900 dark:text-gray-100">
              <p>
                <span className="text-gray-500 dark:text-gray-400">Zone: </span>
                {(mobileOverride?.mobile_zone_name_snapshot ??
                  appointment.mobile_zone_name_snapshot) || (
                  <span className="italic text-gray-400 dark:text-gray-500">Not set</span>
                )}
                {Number(
                  mobileOverride?.mobile_surcharge ?? appointment.mobile_surcharge ?? 0
                ) > 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {' '}— {formatCurrency(
                      Number(
                        mobileOverride?.mobile_surcharge ??
                          appointment.mobile_surcharge ??
                          0
                      )
                    )}
                  </span>
                )}
              </p>
              <p>
                <span className="text-gray-500 dark:text-gray-400">Address: </span>
                {(mobileOverride?.mobile_address ??
                  appointment.mobile_address) || (
                  <span className="italic text-gray-400 dark:text-gray-500">
                    No address on file
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Enable mobile service entry point — Phase Mobile-1.9. When
            the appointment is non-mobile, expose an "Enable" button so
            admin can convert it. Opens the same modal with is_mobile
            defaulting to true. Gated on `appointments.add_notes`, same
            as the edit pencil. */}
        {!(mobileOverride?.is_mobile ?? appointment.is_mobile) && canAddNotes && !readOnly && (
          <button
            type="button"
            onClick={() => setEditingMobile('enable')}
            className="mt-3 flex w-full items-center justify-between rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 text-left hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <MapPin className="h-3.5 w-3.5" />
              <span>Mobile Service</span>
              <span className="ml-2 text-gray-400 dark:text-gray-500">
                — not currently a mobile job
              </span>
            </div>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">+ Enable</span>
          </button>
        )}

        {paymentMismatch && (
          <div className="mt-3">
            <PaymentMismatchBanner
              mismatchAmount={paymentMismatch.amount}
              newTotal={paymentMismatch.newTotal}
              paidAmount={paymentMismatch.paidAmount}
              onDismiss={() => setPaymentMismatch(null)}
            />
          </div>
        )}

        {/* Cancellation info */}
        {appointment.status === 'cancelled' && appointment.cancellation_reason && (
          <div className="mt-2 rounded-md bg-red-50 p-2 text-sm dark:bg-red-950">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Cancellation Reason</p>
            <p className="text-red-900 dark:text-red-200">{appointment.cancellation_reason}</p>
            {appointment.cancellation_fee != null && appointment.cancellation_fee > 0 && (
              <p className="text-xs text-red-500 dark:text-red-400">Fee: {formatCurrency(appointment.cancellation_fee)}</p>
            )}
          </div>
        )}

        {/* Editable fields */}
        <form id="detail-edit-form" onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className={canReschedule ? 'grid grid-cols-2 gap-3' : ''}>
            {canUpdateStatus ? (
              <FormField label="Status" error={errors.status?.message} htmlFor="detail-status">
                <Select id="detail-status" disabled={readOnly} {...register('status')}>
                  {recommendedStatuses.map((s) => (
                    <option key={s} value={s}>
                      {APPOINTMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                  {overrideStatuses.length > 0 && (
                    <optgroup label="Override">
                      {overrideStatuses.map((s) => (
                        <option key={s} value={s}>
                          {APPOINTMENT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </FormField>
            ) : (
              // Session 1.3 — when canUpdateStatus is false, render the current
              // status as a read-only `<dd>` block (mirrors the
              // customer/vehicle/total readonly pattern in the upper dl). No
              // Select is registered with react-hook-form, so `data.status`
              // stays undefined on submit and the PATCH schema's optional
              // status field is omitted by the server. The operator can still
              // edit other fields they have permission for.
              <div>
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {APPOINTMENT_STATUS_LABELS[appointment.status]}
                </dd>
              </div>
            )}

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
              disabled={!canAddNotes || readOnly}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-800"
            />
          </FormField>

          <FormField label="Internal Notes" error={errors.internal_notes?.message} htmlFor="detail-internal-notes">
            <textarea
              id="detail-internal-notes"
              {...register('internal_notes')}
              rows={2}
              disabled={!canAddNotes || readOnly}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-800"
            />
          </FormField>
        </form>
      </DialogContent>
      <DialogFooter>
        {/* Session 1.1 — view-only mode (dashboard quick-peek) hides both
            the destructive Cancel Appointment button AND the Save Changes
            button. Visible-but-disabled is itself misleading; we render
            only the Close affordance. Editable mounts (admin appointments,
            POS Schedule + POS strip-card tap) get the editable footer:
            [Cancel] [Send Link?] [Save Changes] — Close removed per
            Session #145 (the DialogClose `<X>` icon top-right + Esc cover
            the dismiss affordance). The middle Send Payment Link button
            renders only when the parent passes `onSendPaymentLink` AND the
            shared `canSendPaymentLink` predicate evaluates true; same gate
            JobDetail uses. */}
        {!readOnly && showCancelButton && onCancel && (
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
        {readOnly && (
          // readOnly footer retains Close as the only dismiss button (no
          // Cancel, no Save). Without it the footer would be empty — the
          // `<X>` icon stays available top-right but having an explicit
          // Close button keeps the quick-peek surface familiar.
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
        )}
        {!readOnly &&
          onSendPaymentLink &&
          canSendPaymentLink({
            appointmentId: appointment.id,
            paymentStatus: appointment.payment_status,
            appointmentStatus: appointment.status,
            customerEmail: appointment.customer?.email ?? null,
            customerPhone: appointment.customer?.phone ?? null,
          }) && (
            <Button
              type="button"
              variant="default"
              className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
              onClick={() => {
                onOpenChange(false);
                onSendPaymentLink(appointment);
              }}
              disabled={saving}
            >
              Send Payment Link
            </Button>
          )}
        {!readOnly && (
          <Button type="submit" form="detail-edit-form" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </DialogFooter>
      <DialogClose onClose={() => onOpenChange(false)} />
      {/* Phase Mobile-1.9 full mobile picker modal. Rendered alongside
          the dialog so its own backdrop sits above the dialog content.
          Initial state reads from the optimistic `mobileOverride` when
          present (covers re-open after prior save in same session). In
          'enable' mode the initial is forced to is_mobile=true with
          blank fields so admin lands in the picker ready to fill in
          zone + address (creation-time parity). */}
      {editingMobile && (
        <EditMobileModal
          open
          mode={hostContext}
          appointmentId={appointment.id}
          initial={
            editingMobile === 'enable'
              ? {
                  is_mobile: true,
                  mobile_zone_id: null,
                  mobile_surcharge: 0,
                  mobile_address: null,
                  mobile_zone_name_snapshot: null,
                }
              : {
                  is_mobile: mobileOverride?.is_mobile ?? appointment.is_mobile,
                  mobile_zone_id:
                    mobileOverride?.mobile_zone_id ?? appointment.mobile_zone_id,
                  mobile_surcharge: Number(
                    mobileOverride?.mobile_surcharge ??
                      appointment.mobile_surcharge ??
                      0
                  ),
                  mobile_address:
                    mobileOverride?.mobile_address ?? appointment.mobile_address,
                  mobile_zone_name_snapshot:
                    mobileOverride?.mobile_zone_name_snapshot ??
                    appointment.mobile_zone_name_snapshot,
                }
          }
          onClose={() => setEditingMobile(null)}
          onSaved={handleMobileEditSaved}
        />
      )}
      {/* Item 15e Phase 2C-β-2 — un-materialize confirmation. Opened by the
          Save intercept when an earlier-status revert targets an appointment
          with an active job. On success the job is deleted + the appointment
          reverted to pending; close the detail dialog so the parent page
          refetches.
          Session 1.1 (parity audit b346d34b Target D Finding 1, HIGH): the
          `context` prop now threads from `hostContext` instead of the
          hardcoded `'admin'` literal that previously routed POS Schedule
          un-materialize through `adminFetch` → 401 → admin-login redirect,
          booting the POS operator. */}
      {showUnMaterializeModal && pendingFormData && (
        <UnMaterializeConfirmationDialog
          open={showUnMaterializeModal}
          onOpenChange={(o) => {
            if (!o) {
              setShowUnMaterializeModal(false);
              setPendingFormData(null);
            }
          }}
          appointment={appointment}
          context={hostContext}
          onSuccess={() => {
            setShowUnMaterializeModal(false);
            setPendingFormData(null);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}
