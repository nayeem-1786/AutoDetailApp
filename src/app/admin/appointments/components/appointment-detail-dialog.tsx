'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Pencil } from 'lucide-react';
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
import { STATUS_TRANSITIONS } from '../types';
import type { AppointmentWithRelations } from '../types';
import type { AppointmentStatus, Employee } from '@/lib/supabase/types';


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
  canAddNotes?: boolean;
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
}: AppointmentDetailDialogProps) {
  const [saving, setSaving] = useState(false);
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
        scheduled_start_time: appointment.scheduled_start_time,
        scheduled_end_time: appointment.scheduled_end_time,
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

  async function onSubmit(data: AppointmentUpdateInput) {
    if (!appointment) return;

    // If status is being changed to cancelled, redirect to cancel dialog
    if (data.status === 'cancelled' && appointment.status !== 'cancelled') {
      if (!canCancel) {
        // User doesn't have permission to cancel
        return;
      }
      onOpenChange(false);
      onCancel(appointment);
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
              <dd className="flex items-center gap-2 text-gray-900">
                <span>
                  {cleanVehicleDescription({ year: appointment.vehicle.year, make: appointment.vehicle.make, model: appointment.vehicle.model })}
                  {sanitizeVehicleField(appointment.vehicle.color) ? ` — ${appointment.vehicle.color}` : ''}
                </span>
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium text-gray-500">Total</dt>
            <dd className="text-gray-900 font-medium">{formatCurrency(appointment.total_amount)}</dd>
          </div>

          {appointment.deposit_amount != null && appointment.deposit_amount > 0 && (
            <div>
              <dt className="text-xs font-medium text-gray-500">Deposit Collected</dt>
              <dd className="text-green-700 font-medium">
                {formatCurrency(appointment.deposit_amount)}
                <span className="text-xs text-gray-500 font-normal ml-1">
                  (Balance: {formatCurrency(appointment.total_amount - appointment.deposit_amount)})
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* Services list — Phase Mobile-1.7 refactor: render through the
            shared composeLineItems so the synthetic mobile-fee row stays
            consistent across surfaces. Visual output identical to the
            prior ad-hoc append (Phase Mobile-1 Option D2). */}
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500">Services</p>
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
                  <span className="text-gray-900">{item.name}</span>
                  <span className="text-gray-500">{formatCurrency(item.total_price)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile Service — Phase Mobile-1.9 expanded card. Shows zone
            snapshot (frozen at save time per LOCKED-7.6) + surcharge +
            address. Pencil opens the shared full picker modal. The
            `appointments.add_notes` permission still gates the edit
            server-side (mirrors the Phase 1.6 endpoint pattern). */}
        {(mobileOverride?.is_mobile ?? appointment.is_mobile) && (
          <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                <span>Mobile Service</span>
              </div>
              {canAddNotes && (
                <button
                  type="button"
                  onClick={() => setEditingMobile('edit')}
                  aria-label="Edit mobile service"
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 space-y-0.5 text-sm text-gray-900">
              <p>
                <span className="text-gray-500">Zone: </span>
                {(mobileOverride?.mobile_zone_name_snapshot ??
                  appointment.mobile_zone_name_snapshot) || (
                  <span className="italic text-gray-400">Not set</span>
                )}
                {Number(
                  mobileOverride?.mobile_surcharge ?? appointment.mobile_surcharge ?? 0
                ) > 0 && (
                  <span className="text-gray-500">
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
                <span className="text-gray-500">Address: </span>
                {(mobileOverride?.mobile_address ??
                  appointment.mobile_address) || (
                  <span className="italic text-gray-400">
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
        {!(mobileOverride?.is_mobile ?? appointment.is_mobile) && canAddNotes && (
          <button
            type="button"
            onClick={() => setEditingMobile('enable')}
            className="mt-3 flex w-full items-center justify-between rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 text-left hover:bg-gray-100"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <MapPin className="h-3.5 w-3.5" />
              <span>Mobile Service</span>
              <span className="ml-2 text-gray-400">
                — not currently a mobile job
              </span>
            </div>
            <span className="text-xs font-medium text-blue-600">+ Enable</span>
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
              disabled={!canAddNotes}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50"
            />
          </FormField>

          <FormField label="Internal Notes" error={errors.internal_notes?.message} htmlFor="detail-internal-notes">
            <textarea
              id="detail-internal-notes"
              {...register('internal_notes')}
              rows={2}
              disabled={!canAddNotes}
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50"
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
          mode="admin"
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
    </Dialog>
  );
}
