'use client';

import { useState, useCallback } from 'react';
import { Calendar, Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { posFetch } from '../../lib/pos-fetch';
import { toast } from 'sonner';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import type { PosUnstartedAppointment } from './schedule-types';

/**
 * Session 2.2 (AC-3 second half) — appointment card rendered in Today scope
 * for confirmed/in_progress appointments that have NOT yet been materialized
 * into a job. Includes a "Start Intake" button that calls the Session 2.1
 * endpoint at `POST /api/pos/jobs/start-intake`.
 *
 * Visual treatment intentionally distinct from job cards (no timer, no photo
 * progress, no addon badge — none apply pre-materialization) but reuses the
 * same primitives as Schedule-scope `ScheduleScopeList` (Memory #2). The
 * "Start Intake" call-to-action is the visible affordance that distinguishes
 * an un-started today appointment from a Schedule-scope future one.
 *
 * Future-date popup: in normal operation the endpoint can't return 422
 * future_date for a today-scoped appointment (the Today endpoint filters by
 * `scheduled_date === today_pst`), but the popup is wired anyway as a
 * defense-in-depth path — if a race shifts the date between fetch and click,
 * the server gate rejects and the popup offers "Move to today + retry"
 * (calls PATCH on the appointment to update scheduled_date, then re-calls
 * start-intake).
 */

interface UnstartedAppointmentCardProps {
  appointment: PosUnstartedAppointment;
  /** Called after a successful materialization so the parent can refetch the
   *  Today scope — the new job replaces this card. */
  onMaterialized: () => void;
}

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  try {
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m} ${period}`;
  } catch {
    return '';
  }
}

function formatVehicle(v: PosUnstartedAppointment['vehicle']): string {
  if (!v) return 'No vehicle';
  const desc = cleanVehicleDescription({ year: v.year, make: v.make, model: v.model }) || 'Vehicle';
  const color = sanitizeVehicleField(v.color);
  return color ? `${color} ${desc}` : desc;
}

function getTodayPst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function UnstartedAppointmentCard({
  appointment,
  onMaterialized,
}: UnstartedAppointmentCardProps) {
  const [busy, setBusy] = useState(false);
  const [futureDatePromptDate, setFutureDatePromptDate] = useState<string | null>(null);

  const serviceNames = appointment.appointment_services
    .map((s) => s.service?.name)
    .filter(Boolean)
    .join(', ');
  const serviceTotal = Number(appointment.total_amount ?? 0);
  const time = formatTime12h(appointment.scheduled_start_time);

  const callStartIntake = useCallback(async (): Promise<boolean> => {
    const res = await posFetch('/api/pos/jobs/start-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointment.id }),
    });
    if (res.ok) return true;

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      appointment_date?: string;
      appointment_status?: string;
    };

    if (res.status === 422 && body.error === 'future_date') {
      // Defense-in-depth — race between fetch and click. Surface the
      // "Move to today and start?" affordance.
      setFutureDatePromptDate(body.appointment_date ?? 'a future date');
      return false;
    }

    if (res.status === 422 && body.error === 'invalid_status') {
      toast.error(`This appointment is "${body.appointment_status ?? 'not eligible'}" and cannot be started.`);
      return false;
    }

    toast.error('Failed to start intake. Please refresh and try again.');
    return false;
  }, [appointment.id]);

  const handleStartIntake = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await callStartIntake();
      if (ok) {
        toast.success('Intake started');
        onMaterialized();
      }
    } catch (err) {
      console.error('[start-intake] failed:', err);
      toast.error('Failed to start intake');
    } finally {
      setBusy(false);
    }
  }, [busy, callStartIntake, onMaterialized]);

  const handleMoveToTodayAndStart = useCallback(async () => {
    setFutureDatePromptDate(null);
    setBusy(true);
    try {
      // PATCH the appointment's scheduled_date to today (PST). The existing
      // PATCH route at /api/pos/appointments/[id] enforces permissions +
      // overlap checks; Session 1.5's cascade is irrelevant here (we are not
      // changing status, only date).
      const patchRes = await posFetch(`/api/pos/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_date: getTodayPst() }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        toast.error(err.error || 'Failed to move appointment to today');
        return;
      }
      // Retry the Start Intake call now that the appointment is dated today.
      const ok = await callStartIntake();
      if (ok) {
        toast.success('Moved to today + intake started');
        onMaterialized();
      }
    } catch (err) {
      console.error('[start-intake/move-to-today] failed:', err);
      toast.error('Failed to move appointment and start intake');
    } finally {
      setBusy(false);
    }
  }, [appointment.id, callStartIntake, onMaterialized]);

  // Session 2.4 (AC-7) — terminal-state appointments may appear in this strip
  // when the operator opts in via the include-terminal toggle. They are not
  // actionable here (Start Intake on a cancelled/completed/no_show appointment
  // is structurally invalid — the server's invalid_status gate would reject
  // it), so the button is suppressed and the card visually mutes.
  const isTerminal =
    appointment.status === 'cancelled' ||
    appointment.status === 'completed' ||
    appointment.status === 'no_show';

  return (
    <>
      <div
        data-testid={`unstarted-appointment-card-${appointment.id}`}
        className={cn(
          'w-full rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-900/10 p-3 text-left shadow-sm',
          busy && 'opacity-60 pointer-events-none',
          isTerminal && !busy && 'opacity-60'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {appointment.customer
                ? `${appointment.customer.first_name} ${appointment.customer.last_name}`
                : 'Unknown Customer'}
            </span>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {formatVehicle(appointment.vehicle)}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-gray-400 dark:text-gray-500">
                {serviceNames || 'No services'}
              </p>
              {serviceTotal > 0 && (
                <span className="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                  {formatCurrency(serviceTotal)}
                </span>
              )}
            </div>
          </div>
          <div className="ml-1 flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              <Calendar className="h-3 w-3" />
              Not Started
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
              {APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status}
            </span>
            {time && (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                {time}
              </span>
            )}
          </div>
        </div>
        {appointment.detailer && (
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            Assigned: {appointment.detailer.first_name} {appointment.detailer.last_name}
          </p>
        )}
        {!isTerminal && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleStartIntake}
              disabled={busy}
              data-testid={`start-intake-btn-${appointment.id}`}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 active:bg-blue-800 dark:active:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {busy ? 'Starting…' : 'Start Intake'}
            </button>
          </div>
        )}
      </div>

      {/* Future-date popup. Defense-in-depth path: the Today endpoint only
          returns same-day appointments, so this should never fire in the
          steady state. Surfaces only if a race shifts the date between fetch
          and click (or the operator's clock skews around the PST midnight). */}
      {futureDatePromptDate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="future-date-prompt-title"
          data-testid="future-date-prompt"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-gray-900 p-5 shadow-xl">
            <h3
              id="future-date-prompt-title"
              className="text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              Move appointment to today?
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              This appointment is scheduled for {futureDatePromptDate}. Move it
              to today and start intake now?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFutureDatePromptDate(null)}
                data-testid="future-date-prompt-cancel"
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMoveToTodayAndStart}
                data-testid="future-date-prompt-confirm"
                className="rounded-lg bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
              >
                Move to Today and Start
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
