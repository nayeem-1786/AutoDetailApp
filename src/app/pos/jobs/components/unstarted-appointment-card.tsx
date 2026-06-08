'use client';

import { useState, useCallback } from 'react';
import { Calendar, Clock, Play, Send, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { posFetch } from '../../lib/pos-fetch';
import { toast } from 'sonner';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { canSendPaymentLink } from '@/components/jobs/can-send-payment-link';
import type { PosUnstartedAppointment } from './schedule-types';

/**
 * Session 2.2 (AC-3 second half) — appointment card rendered in Today scope
 * for confirmed/in_progress appointments that have NOT yet been materialized
 * into a job. Session #145 (Ian-Austria-unblock) extended the card from a
 * single-pill ("Start Intake") footer to a three-pill row: [Cancel] (red),
 * [Send Payment Link] (green), [Start Intake] (blue). All three pills route
 * through EXISTING flows — Cancel uses the same `cancelAppointmentOrchestrated`
 * path the AppointmentDetailDialog calls; Send Payment Link mounts the same
 * `PaymentLinkAmountModal` + `SendPaymentLinkDialog` chain JobDetail uses;
 * Start Intake hits the same `/api/pos/jobs/start-intake` endpoint. The card
 * itself owns zero new business logic — every affordance is a thin parent
 * callback dispatch.
 *
 * Three button-level callbacks + one card-body tap callback:
 *  - `onMaterialized(jobId)` — after a successful Start Intake, parent
 *    routes to JobDetail with `autoStartIntake=true` so ZonePicker mounts
 *    directly (Gap A — closes the "Start Intake button doesn't navigate to
 *    intake" UX break that Stage 2 exposed).
 *  - `onSendPaymentLink(appointmentId)` — parent mounts the existing
 *    PaymentLinkAmountModal -> SendPaymentLinkDialog two-step flow.
 *  - `onCancelAppointment(appointmentId)` — parent fetches the full
 *    appointment + mounts the existing CancelAppointmentDialog (Pathway B
 *    for never-materialized appointments).
 *  - `onTapCardBody(appointmentId)` — parent fetches the full appointment
 *    and mounts AppointmentDetailDialog (same wire-up Schedule scope uses).
 *
 * Each of the three action buttons stops event-propagation so the outer
 * card-body click handler does NOT also fire. Card body becomes the "more
 * info / edit" surface; pills become the action surface.
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
  /** Session #145 Gap A — called after a successful materialization WITH the
   *  new `job_id` from the start-intake response. Parent routes to JobDetail
   *  with `autoStartIntake=true` so the operator lands directly on the
   *  ZonePicker (zero JobDetail-header detour). Pre-#145 this was zero-arg
   *  and the parent only refetched the Today scope. */
  onMaterialized: (jobId: string) => void;
  /** Session #145 — parent mounts the existing PaymentLinkAmountModal +
   *  SendPaymentLinkDialog chain for this appointment. Same shape JobDetail
   *  has used since Pay-Link Session 5. */
  onSendPaymentLink: (appointmentId: string) => void;
  /** Session #145 — parent fetches the full appointment + mounts the
   *  existing CancelAppointmentDialog (Pathway B for never-materialized
   *  appointments per Phase 3 Theme D.1). */
  onCancelAppointment: (appointmentId: string) => void;
  /** Session #145 — parent mounts AppointmentDetailDialog (Schedule-scope
   *  wire-up extended to also fire from the unstarted strip). */
  onTapCardBody: (appointmentId: string) => void;
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
  onSendPaymentLink,
  onCancelAppointment,
  onTapCardBody,
}: UnstartedAppointmentCardProps) {
  const [busy, setBusy] = useState(false);
  const [futureDatePromptDate, setFutureDatePromptDate] = useState<string | null>(null);

  const serviceNames = appointment.appointment_services
    .map((s) => s.service?.name)
    .filter(Boolean)
    .join(', ');
  const serviceTotal = Number(appointment.total_amount ?? 0);
  const time = formatTime12h(appointment.scheduled_start_time);

  // Session #145 Gap A — `callStartIntake` now returns the materialized
  // `job_id` on success (was: returned just `true`). The strip's Start Intake
  // path hands the jobId to the parent's `onMaterialized` callback so the
  // page-level view-state can route directly to JobDetail with
  // `autoStartIntake=true`. The endpoint's `already_materialized` flag is
  // handled transparently — the parent navigates identically either way.
  const callStartIntake = useCallback(async (): Promise<
    { ok: true; jobId: string } | { ok: false }
  > => {
    const res = await posFetch('/api/pos/jobs/start-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointment.id }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      job_id?: string;
      appointment_id?: string;
      already_materialized?: boolean;
      error?: string;
      appointment_date?: string;
      appointment_status?: string;
    };

    if (res.ok) {
      if (typeof body.job_id !== 'string') {
        // Defensive — endpoint contract guarantees `job_id` on 200/201, but
        // a future server-side regression that omits the field would otherwise
        // crash navigation. Surface as a generic failure; operator retries.
        toast.error('Materialization succeeded but no job id returned. Please refresh.');
        return { ok: false };
      }
      return { ok: true, jobId: body.job_id };
    }

    if (res.status === 422 && body.error === 'future_date') {
      // Defense-in-depth — race between fetch and click. Surface the
      // "Move to today and start?" affordance.
      setFutureDatePromptDate(body.appointment_date ?? 'a future date');
      return { ok: false };
    }

    if (res.status === 422 && body.error === 'invalid_status') {
      toast.error(`This appointment is "${body.appointment_status ?? 'not eligible'}" and cannot be started.`);
      return { ok: false };
    }

    toast.error('Failed to start intake. Please refresh and try again.');
    return { ok: false };
  }, [appointment.id]);

  const handleStartIntake = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await callStartIntake();
      if (result.ok) {
        toast.success('Intake started');
        onMaterialized(result.jobId);
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
      const result = await callStartIntake();
      if (result.ok) {
        toast.success('Moved to today + intake started');
        onMaterialized(result.jobId);
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
  // it), so the actions row is suppressed and the card visually mutes.
  const isTerminal =
    appointment.status === 'cancelled' ||
    appointment.status === 'completed' ||
    appointment.status === 'no_show';

  // Session #145 — Send Payment Link pill visibility. Same predicate JobDetail
  // and AppointmentDetailDialog use, via the shared `canSendPaymentLink`
  // helper (Q5 extraction). No date gate — the helper's contract is
  // explicitly date-agnostic (the "only day-of" behavior pre-#145 was a
  // JobDetail-scope artifact, not a predicate).
  const showSendPaymentLink = canSendPaymentLink({
    appointmentId: appointment.id,
    paymentStatus: appointment.payment_status,
    appointmentStatus: appointment.status,
    customerEmail: appointment.customer?.email ?? null,
    customerPhone: appointment.customer?.phone ?? null,
  });

  // Card-body tap → parent mounts AppointmentDetailDialog. Buttons inside
  // stopPropagation so their tap doesn't also fire the body handler. Mirrors
  // the Schedule-scope card pattern (ScheduleScopeList in job-queue.tsx).
  const handleCardBodyTap = useCallback(() => {
    if (busy || isTerminal) return;
    onTapCardBody(appointment.id);
  }, [busy, isTerminal, onTapCardBody, appointment.id]);

  const handleCardBodyKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCardBodyTap();
      }
    },
    [handleCardBodyTap]
  );

  return (
    <>
      <div
        data-testid={`unstarted-appointment-card-${appointment.id}`}
        role="button"
        tabIndex={isTerminal ? -1 : 0}
        onClick={handleCardBodyTap}
        onKeyDown={handleCardBodyKey}
        className={cn(
          'w-full rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-900/10 p-3 text-left shadow-sm transition-colors',
          busy && 'opacity-60 pointer-events-none',
          isTerminal && !busy && 'opacity-60 cursor-default',
          !isTerminal && !busy && 'cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500'
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
          // Three-pill action row — color hierarchy locked across surfaces
          // (Q2): red Cancel, green Send Link, blue Start Intake. Mirrors the
          // AppointmentDetailDialog footer pattern (Cancel left, Send Link
          // middle, Save Changes right). On narrow viewports labels collapse
          // to icon-only at the `sm:` breakpoint via the hidden-sm-inline
          // pattern (Q-Layout-1 fallback — preserves discoverability on iPad
          // portrait without overflow).
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelAppointment(appointment.id);
              }}
              disabled={busy}
              data-testid={`cancel-appointment-btn-${appointment.id}`}
              className="flex items-center gap-1 rounded-full bg-red-600 dark:bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 active:bg-red-800 dark:active:bg-red-700 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
            {showSendPaymentLink && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSendPaymentLink(appointment.id);
                }}
                disabled={busy}
                data-testid={`send-payment-link-btn-${appointment.id}`}
                className="flex items-center gap-1 rounded-full bg-green-600 dark:bg-green-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 dark:hover:bg-green-600 active:bg-green-800 dark:active:bg-green-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Send Link</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartIntake();
              }}
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
          onClick={(e) => e.stopPropagation()}
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
