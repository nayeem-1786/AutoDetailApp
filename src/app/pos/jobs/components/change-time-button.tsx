'use client';

import { useCallback, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { usePosPermission } from '../../context/pos-permission-context';
import { RescheduleAppointmentDialog } from '../../components/appointments/reschedule-appointment-dialog';
import type {
  PosAppointment,
  PosStaff,
} from '../../components/appointments/types';

/**
 * Roadmap Item 15c — closes audit gap §10 #10. The Jobs card had no time-edit
 * affordance, forcing operators to switch to POS Appointments or Admin
 * Appointments to reschedule. This component is the bridge: it gates on the
 * existing `appointments.reschedule` permission (no new keys), gates on job
 * status (matches the POS Appointments tab — `scheduled` / `intake` /
 * `in_progress` only), and reuses the existing
 * `RescheduleAppointmentDialog` (component reuse — Rule 11). The dialog itself
 * is unmodified; this wrapper just fetches the joined `PosAppointment` + the
 * bookable-staff list on demand and feeds them in.
 *
 * Notification suppression is inherited from the reused dialog/endpoint pair
 * (Item 12): the underlying `PATCH /api/pos/appointments/[id]/reschedule`
 * does NOT fire the n8n `appointment_rescheduled` webhook and records
 * `notification_suppressed: true` in the audit log. No customer-facing SMS or
 * email is sent from this surface.
 */
export type ChangeTimeJobStatus =
  | 'scheduled'
  | 'intake'
  | 'in_progress'
  | 'pending_approval'
  | 'completed'
  | 'closed'
  | 'cancelled';

/** Statuses that allow time edits — matches `DRAGGABLE_STATUSES` in the
 *  timeline reschedule route and the implicit guard the POS Appointments
 *  reschedule endpoint enforces (rejects `completed`/`cancelled`). */
const RESCHEDULABLE_STATUSES = new Set<ChangeTimeJobStatus>([
  'scheduled',
  'intake',
  'in_progress',
]);

interface ChangeTimeButtonProps {
  appointmentId: string | null;
  jobStatus: ChangeTimeJobStatus;
  onSaved: () => void;
  className?: string;
}

export function ChangeTimeButton({
  appointmentId,
  jobStatus,
  onSaved,
  className,
}: ChangeTimeButtonProps) {
  const { granted: canReschedule } = usePosPermission('appointments.reschedule');
  const [opening, setOpening] = useState(false);
  const [appointment, setAppointment] = useState<PosAppointment | null>(null);
  const [staff, setStaff] = useState<PosStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const handleOpen = useCallback(async () => {
    if (!appointmentId || opening) return;
    setOpening(true);
    try {
      // Fetch single appointment + bookable staff in parallel. Staff list
      // reuses the same endpoint the POS Appointments tab uses, so the
      // dropdown options stay consistent across both surfaces.
      setStaffLoading(true);
      const [apptRes, staffRes] = await Promise.all([
        posFetch(`/api/pos/appointments/${appointmentId}`),
        posFetch('/api/pos/staff/available'),
      ]);

      if (!apptRes.ok) {
        const err = await apptRes.json().catch(() => ({}));
        toast.error(err.error || 'Could not load appointment');
        return;
      }

      const { data } = await apptRes.json();
      setAppointment(data as PosAppointment);

      if (staffRes.ok) {
        const { data: staffData } = await staffRes.json();
        setStaff(staffData ?? []);
      } else {
        setStaff([]);
      }
    } catch (err) {
      console.error('Open ChangeTime error:', err);
      toast.error('Could not load appointment');
    } finally {
      setStaffLoading(false);
      setOpening(false);
    }
  }, [appointmentId, opening]);

  const handleClose = useCallback(() => {
    setAppointment(null);
  }, []);

  const handleSaved = useCallback(() => {
    setAppointment(null);
    onSaved();
  }, [onSaved]);

  // Hide affordance entirely when:
  //  - permission missing (cashier/admin/super_admin have it by default;
  //    detailer doesn't — matches POS Appointments tab gate),
  //  - job has no linked appointment (defensive; pre-Phase-0a walk-ins),
  //  - job status is terminal/awaiting-approval (matches the audit §10 #3
  //    and the reschedule endpoint's own 400 guard for completed/cancelled).
  if (!canReschedule) return null;
  if (!appointmentId) return null;
  if (!RESCHEDULABLE_STATUSES.has(jobStatus)) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        className={
          className ??
          'flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'
        }
      >
        <CalendarClock className="h-3.5 w-3.5" />
        {opening ? 'Loading…' : 'Change Time'}
      </button>

      {appointment && (
        <RescheduleAppointmentDialog
          open
          appointment={appointment}
          staff={staff}
          staffLoading={staffLoading}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
