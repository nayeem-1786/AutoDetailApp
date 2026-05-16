'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, RefreshCw, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { posFetch } from '../../lib/pos-fetch';
import { usePosPermission } from '../../context/pos-permission-context';
import { formatTime } from '@/lib/utils/format';
import { getTodayPst } from '@/lib/utils/pst-date';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { RescheduleAppointmentDialog } from './reschedule-appointment-dialog';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import type { PosAppointment, PosStaff } from './types';

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Roadmap Item 15b: compute the last calendar day of the month that `dateStr`
 * (YYYY-MM-DD) lies in, returning YYYY-MM-DD. `new Date(y, m, 0)` rolls back
 * one day from the first of the following month, which is the standard
 * end-of-month idiom and stays accurate across leap years.
 */
function endOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getRelativeLabel(dateStr: string, today: string): string | null {
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  no_show: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function AppointmentsView() {
  const today = useMemo(() => getTodayPst(), []);
  const monthEnd = useMemo(() => endOfMonth(today), [today]);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 1));
  const [appointments, setAppointments] = useState<PosAppointment[]>([]);
  const [staff, setStaff] = useState<PosStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [editing, setEditing] = useState<PosAppointment | null>(null);
  const [cancelling, setCancelling] = useState<PosAppointment | null>(null);
  // Roadmap Item 15b: gate Cancel control. Hide entirely (not just disable)
  // for users without `appointments.cancel` — cashier role default is denied
  // per audit §9.1.
  const { granted: canCancel } = usePosPermission('appointments.cancel');

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posFetch(
        `/api/pos/appointments?start_date=${startDate}&end_date=${endDate}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load appointments');
        setAppointments([]);
        return;
      }
      const json = await res.json();
      setAppointments(json.data ?? []);
    } catch (err) {
      console.error('Load appointments error:', err);
      toast.error('Failed to load appointments');
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await posFetch('/api/pos/staff/available');
      if (!res.ok) {
        setStaff([]);
        return;
      }
      const json = await res.json();
      setStaff(json.data ?? []);
    } catch (err) {
      console.error('Load staff error:', err);
      setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  function handlePresetToday() {
    setStartDate(today);
    setEndDate(today);
  }

  function handlePresetTodayTomorrow() {
    setStartDate(today);
    setEndDate(addDays(today, 1));
  }

  function handlePresetWeek() {
    setStartDate(today);
    setEndDate(addDays(today, 6));
  }

  function handlePresetMonth() {
    setStartDate(today);
    setEndDate(monthEnd);
  }

  function handleSaved(updated: PosAppointment) {
    setAppointments((prev) =>
      prev.map((appt) => (appt.id === updated.id ? updated : appt))
    );
    setEditing(null);
  }

  function handleCancelled(cancelled: PosAppointment) {
    // The list endpoint (GET /api/pos/appointments) filters cancelled rows
    // server-side, so we drop the row locally to keep the UI in sync without
    // a full refetch round-trip.
    setAppointments((prev) => prev.filter((appt) => appt.id !== cancelled.id));
    setCancelling(null);
    // If the same appointment was open in the reschedule dialog, close it.
    setEditing((prev) => (prev?.id === cancelled.id ? null : prev));
  }

  // Group by date for the list rendering
  const grouped = useMemo(() => {
    const map = new Map<string, PosAppointment[]>();
    for (const appt of appointments) {
      const key = appt.scheduled_date;
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [appointments]);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header — date filters */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Appointments
          </h1>
          <button
            type="button"
            onClick={loadAppointments}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            aria-label="Refresh appointments"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePresetToday}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              startDate === today && endDate === today
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={handlePresetTodayTomorrow}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              startDate === today && endDate === addDays(today, 1)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Today + Tomorrow
          </button>
          <button
            type="button"
            onClick={handlePresetWeek}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              startDate === today && endDate === addDays(today, 6)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Next 7 Days
          </button>
          <button
            type="button"
            onClick={handlePresetMonth}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              startDate === today && endDate === monthEnd
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            This Month
          </button>

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              From
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-base sm:text-sm text-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              To
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-base sm:text-sm text-gray-900 dark:text-gray-100"
              />
            </label>
          </div>
        </div>
      </div>

      {/* List body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No appointments in this range"
            description="Adjust the date filter or create a booking from Admin Appointments."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {grouped.map(([date, list]) => {
              const relative = getRelativeLabel(date, today);
              return (
                <section key={date}>
                  <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {relative ? (
                      <>
                        <span className="mr-2">{relative}</span>
                        <span className="text-gray-500 dark:text-gray-500 font-normal">
                          {formatLongDate(date)}
                        </span>
                      </>
                    ) : (
                      formatLongDate(date)
                    )}
                  </h2>
                  <ul className="space-y-2">
                    {list.map((appt) => (
                      <li
                        key={appt.id}
                        className="flex items-stretch gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => setEditing(appt)}
                          className="flex flex-1 items-start justify-between gap-3 p-3 text-left rounded-l-lg"
                          aria-label={`Edit appointment for ${appt.customer.first_name} ${appt.customer.last_name}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {formatTime(appt.scheduled_start_time)} – {formatTime(appt.scheduled_end_time)}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  STATUS_COLORS[appt.status] ?? STATUS_COLORS.pending
                                }`}
                              >
                                {APPOINTMENT_STATUS_LABELS[appt.status] ?? appt.status}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-300">
                              {appt.customer.first_name} {appt.customer.last_name}
                            </p>
                            {appt.vehicle && (
                              <p className="truncate text-xs text-gray-500 dark:text-gray-500">
                                {cleanVehicleDescription({
                                  year: appt.vehicle.year,
                                  make: appt.vehicle.make,
                                  model: appt.vehicle.model,
                                })}
                              </p>
                            )}
                            {appt.appointment_services?.length > 0 && (
                              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-500">
                                {appt.appointment_services
                                  .map((s) => s.service?.name || 'Service')
                                  .join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                            <User className="h-3.5 w-3.5" />
                            <span>
                              {appt.employee
                                ? `${appt.employee.first_name} ${appt.employee.last_name}`
                                : 'Unassigned'}
                            </span>
                          </div>
                        </button>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => setCancelling(appt)}
                            className="flex shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 dark:border-gray-700 px-3 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            aria-label={`Cancel appointment for ${appt.customer.first_name} ${appt.customer.last_name}`}
                            title="Cancel appointment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <RescheduleAppointmentDialog
          open
          appointment={editing}
          staff={staff}
          staffLoading={staffLoading}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {cancelling && (
        <CancelAppointmentDialog
          open
          appointment={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={handleCancelled}
        />
      )}
    </div>
  );
}
