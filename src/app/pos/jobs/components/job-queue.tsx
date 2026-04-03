'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, RefreshCw, User, Clock, Calendar, Footprints, ShoppingCart, Check,
  ChevronLeft, ChevronRight, Camera, Timer, DollarSign, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePosAuth } from '../../context/pos-auth-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { posFetch } from '../../lib/pos-fetch';
import { formatCurrency } from '@/lib/utils/format';
import type { JobStatus } from '@/lib/supabase/types';
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { JobTimeline } from './job-timeline';
import { List, CalendarDays } from 'lucide-react';

type FilterType = 'mine' | 'all' | 'unassigned';
type ViewMode = 'list' | 'timeline';

export interface JobListItem {
  id: string;
  status: JobStatus;
  appointment_id: string | null;
  transaction_id: string | null;
  services: { id: string; name: string; price: number }[];
  estimated_pickup_at: string | null;
  created_at: string;
  timer_seconds: number;
  work_started_at: string | null;
  timer_paused_at: string | null;
  customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  addons: { id: string; status: string }[] | null;
  appointment: { scheduled_start_time: string } | null;
  photos: { id: string; zone: string; phase: string }[] | null;
  estimated_duration_minutes: number;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
  intake: { label: 'Intake', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300' },
  pending_approval: { label: 'Pending Approval', color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' },
  completed: { label: 'Completed', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
  closed: { label: 'Closed', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
};

const STATUS_PRIORITY: Record<JobStatus, number> = {
  in_progress: 0,
  intake: 1,
  scheduled: 2,
  pending_approval: 3,
  completed: 4,
  closed: 5,
  cancelled: 6,
};

// ─── Helpers ────────────────────────────────────────────────────

function formatVehicle(v: JobListItem['vehicle']): string {
  if (!v) return 'No vehicle';
  const desc = cleanVehicleDescription({ year: v.year, make: v.make, model: v.model }) || 'Vehicle';
  const color = sanitizeVehicleField(v.color);
  return color ? `${color} ${desc}` : desc;
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

function formatPickupTime(dt: string | null): string {
  if (!dt) return '';
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  } catch {
    return '';
  }
}

function isPickupOverdue(dt: string | null, status: JobStatus): boolean {
  if (!dt) return false;
  if (status === 'completed' || status === 'closed' || status === 'cancelled') return false;
  return new Date(dt).getTime() < Date.now();
}

function computeElapsedSeconds(job: JobListItem): number {
  if (job.timer_paused_at || !job.work_started_at) return job.timer_seconds;
  const started = new Date(job.work_started_at).getTime();
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return job.timer_seconds + Math.max(0, elapsed);
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getPhotoProgress(photos: { id: string; zone: string; phase: string }[] | null): { count: number; total: number } | null {
  if (!photos || photos.length === 0) return null;
  const uniqueZones = new Set(photos.map((p) => p.zone));
  return { count: uniqueZones.size, total: 15 }; // 8 exterior + 7 interior
}

function getAddonBadge(addons: { id: string; status: string }[] | null): { label: string; color: string } | null {
  if (!addons || addons.length === 0) return null;
  const hasPending = addons.some((a) => a.status === 'pending');
  const hasApproved = addons.some((a) => a.status === 'approved');
  const hasDeclined = addons.some((a) => a.status === 'declined');
  if (hasPending) return { label: 'Addon Pending', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' };
  if (hasApproved) return { label: 'Addon Approved', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' };
  if (hasDeclined) return { label: 'Addon Declined', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' };
  return null;
}

// ─── Date helpers ───────────────────────────────────────────────

function getTodayPst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const today = getTodayPst();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const d = new Date(dateStr + 'T12:00:00');
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (dateStr === today) return `Today — ${formatted}`;
  if (dateStr === tomorrow) return `Tomorrow — ${formatted}`;
  if (dateStr === yesterday) return `Yesterday — ${formatted}`;
  return formatted;
}

function daysDiff(dateStr: string): number {
  const today = getTodayPst();
  const d1 = new Date(today + 'T12:00:00');
  const d2 = new Date(dateStr + 'T12:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ──────────────────────────────────────────────────

interface JobQueueProps {
  onNewWalkIn: () => void;
  onSelectJob: (jobId: string) => void;
  onCheckout?: (jobId: string) => void;
}

export function JobQueue({ onNewWalkIn, onSelectJob, onCheckout }: JobQueueProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { employee } = usePosAuth();
  const { granted: canCreateWalkIn } = usePosPermission('pos.jobs.manage');
  const isBookable = employee?.bookable_for_appointments ?? false;

  // Date from URL or today
  const today = getTodayPst();
  const initialDate = searchParams.get('date') || today;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const isToday = selectedDate === today;
  const diff = daysDiff(selectedDate);

  const [filter, setFilter] = useState<FilterType>(isBookable ? 'mine' : 'all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pos-jobs-view') as ViewMode) || 'timeline';
    }
    return 'timeline';
  });
  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('pos-jobs-view', mode);
  }, []);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);
  const populatedDates = useRef(new Set<string>());

  // Live timer tick for in_progress cards
  const [, setTick] = useState(0);
  const hasInProgress = jobs.some((j) => j.status === 'in_progress' && j.work_started_at && !j.timer_paused_at);
  useEffect(() => {
    if (!hasInProgress) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasInProgress]);

  // Sync date to URL
  const setDate = useCallback((date: string) => {
    setSelectedDate(date);
    const params = new URLSearchParams(searchParams.toString());
    if (date === today) {
      params.delete('date');
    } else {
      params.set('date', date);
    }
    const qs = params.toString();
    router.replace(`/pos/jobs${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [router, searchParams, today]);

  const fetchJobs = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await posFetch(`/api/pos/jobs?filter=${filter}&date=${date}`);
      if (res.ok) {
        const { data } = await res.json();
        setJobs(data ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const populateFromAppointments = useCallback(async (date: string) => {
    if (populatedDates.current.has(date)) return;
    populatedDates.current.add(date);
    setPopulating(true);
    try {
      const res = await posFetch('/api/pos/jobs/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        const { data } = await res.json();
        if (data.created > 0) {
          await fetchJobs(date);
        }
      }
    } catch (err) {
      console.error('Failed to populate jobs:', err);
    } finally {
      setPopulating(false);
    }
  }, [fetchJobs]);

  // Init: populate + fetch on mount and when date/filter changes
  useEffect(() => {
    async function init() {
      await populateFromAppointments(selectedDate);
      await fetchJobs(selectedDate);
    }
    init();
  }, [selectedDate, populateFromAppointments, fetchJobs]);

  // Sort by status priority
  const sortedJobs = useMemo(() =>
    [...jobs].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)),
  [jobs]);

  // Daily summary stats
  const summary = useMemo(() => {
    const nonCancelled = jobs.filter((j) => j.status !== 'cancelled');
    const totalJobs = nonCancelled.length;
    const unassigned = nonCancelled.filter((j) => !j.assigned_staff).length;
    const totalRevenue = nonCancelled.reduce((sum, j) => sum + j.services.reduce((s, svc) => s + svc.price, 0), 0);
    const completedCount = nonCancelled.filter((j) => j.status === 'completed' || j.status === 'closed').length;
    return { totalJobs, unassigned, totalRevenue, completedCount };
  }, [jobs]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Jobs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              populatedDates.current.delete(selectedDate);
              populateFromAppointments(selectedDate);
              fetchJobs(selectedDate);
            }}
            disabled={populating}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', populating && 'animate-spin')} />
            Refresh
          </button>
          {canCreateWalkIn && (
            <button
              onClick={onNewWalkIn}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
            >
              <Plus className="h-4 w-4" />
              New Walk-in
            </button>
          )}
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2">
        <button
          onClick={() => setDate(addDays(selectedDate, -1))}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="relative flex-1 text-center">
          <label className="cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100">
            {formatDateLabel(selectedDate)}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <button
          onClick={() => setDate(addDays(selectedDate, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700"
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {!isToday && (
          <button
            onClick={() => setDate(today)}
            className="rounded-lg bg-blue-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Today
          </button>
        )}
      </div>

      {/* Past/Future date indicator */}
      {diff < 0 && (
        <div className="bg-gray-100 dark:bg-gray-800/60 px-4 py-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
          Viewing {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} — {Math.abs(diff)} day{Math.abs(diff) !== 1 ? 's' : ''} ago
        </div>
      )}
      {diff > 1 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-1.5 text-center text-xs text-blue-600 dark:text-blue-400">
          Upcoming — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </div>
      )}

      {/* Daily Summary */}
      {!loading && summary.totalJobs > 0 && (
        <div className="flex flex-wrap gap-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2">
          <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Calendar className="h-3.5 w-3.5" />
            {summary.totalJobs} job{summary.totalJobs !== 1 ? 's' : ''}
          </span>
          {summary.unassigned > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <User className="h-3.5 w-3.5" />
              {summary.unassigned} unassigned
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <DollarSign className="h-3.5 w-3.5" />
            {formatCurrency(summary.totalRevenue)}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Check className="h-3.5 w-3.5" />
            {summary.completedCount}/{summary.totalJobs} complete
          </span>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2">
        {(['mine', 'all', 'unassigned'] as const)
          .filter((f) => f !== 'mine' || isBookable)
          .map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-blue-600 dark:bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {f === 'mine' ? 'My Jobs' : f === 'all' ? 'All Jobs' : 'Unassigned'}
            </button>
          ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-center gap-1 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-1.5">
        <button
          onClick={() => handleViewChange('list')}
          className={cn(
            'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
            viewMode === 'list'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          <List className="h-3.5 w-3.5" />
          List
        </button>
        <button
          onClick={() => handleViewChange('timeline')}
          className={cn(
            'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
            viewMode === 'timeline'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Timeline
        </button>
      </div>

      {/* Content area */}
      {viewMode === 'timeline' ? (
        <JobTimeline
          jobs={sortedJobs}
          loading={loading}
          selectedDate={selectedDate}
          isToday={isToday}
          onSelectJob={onSelectJob}
          onCheckout={onCheckout}
          onRefresh={() => fetchJobs(selectedDate)}
        />
      ) : (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <User className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-500" />
            <p className="text-sm font-medium">No jobs scheduled for {formatDateLabel(selectedDate).replace(/^(Today|Tomorrow|Yesterday) — /, '')}</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {filter === 'mine'
                ? `No jobs assigned to ${employee?.first_name ?? 'you'}`
                : filter === 'unassigned'
                  ? 'All jobs have been assigned'
                  : 'No appointments or walk-ins for this date'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedJobs.map((job) => {
              const addonBadge = getAddonBadge(job.addons);
              const statusConfig = STATUS_CONFIG[job.status];
              const serviceNames = job.services.map((s) => s.name).join(', ');
              const serviceTotal = job.services.reduce((sum, s) => sum + s.price, 0);
              const pickupTime = formatPickupTime(job.estimated_pickup_at);
              const overdue = isPickupOverdue(job.estimated_pickup_at, job.status);
              const scheduledTime = job.appointment?.scheduled_start_time
                ? formatTime12h(job.appointment.scheduled_start_time)
                : null;
              const photoProgress = ['intake', 'in_progress', 'pending_approval'].includes(job.status)
                ? getPhotoProgress(job.photos)
                : null;
              const showTimer = job.status === 'in_progress' || (job.status === 'completed' && job.timer_seconds > 0) || (job.status === 'closed' && job.timer_seconds > 0);
              const elapsed = showTimer ? computeElapsedSeconds(job) : 0;

              return (
                <div
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectJob(job.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectJob(job.id); } }}
                  className="w-full cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-shadow hover:shadow-md dark:hover:shadow-gray-950/40 active:bg-gray-50 dark:active:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Customer */}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {job.customer
                          ? `${job.customer.first_name} ${job.customer.last_name}`
                          : 'Unknown Customer'}
                      </span>
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {formatVehicle(job.vehicle)}
                      </p>

                      {/* Services + total */}
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

                    {/* Right side: source + status + scheduled time */}
                    <div className="ml-3 flex flex-col items-end gap-1">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {/* Scheduled time or Walk-In badge */}
                        {scheduledTime ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
                            <Clock className="h-3 w-3" />
                            {scheduledTime}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <Footprints className="h-3 w-3" />
                            Walk-In
                          </span>
                        )}
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusConfig.color)}>
                          {statusConfig.label}
                        </span>
                      </div>
                      {pickupTime && (
                        <span className={cn(
                          'flex items-center gap-1 text-xs',
                          overdue ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
                        )}>
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                          <Clock className="h-3 w-3" />
                          {pickupTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata row: timer + photo progress */}
                  {(showTimer || photoProgress) && (
                    <div className="mt-1.5 flex items-center gap-3">
                      {showTimer && (
                        <span className={cn(
                          'flex items-center gap-1 text-xs font-mono',
                          job.status === 'in_progress' && !job.timer_paused_at
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-gray-500 dark:text-gray-400'
                        )}>
                          <Timer className="h-3 w-3" />
                          {formatDuration(elapsed)}
                        </span>
                      )}
                      {photoProgress && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Camera className="h-3 w-3" />
                          {photoProgress.count}/{photoProgress.total}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Addon badge */}
                  {addonBadge && (
                    <div className="mt-1.5">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', addonBadge.color)}>
                        {addonBadge.label === 'Addon Pending' && '⚑ '}
                        {addonBadge.label === 'Addon Approved' && '✓ '}
                        {addonBadge.label === 'Addon Declined' && '✗ '}
                        {addonBadge.label}
                      </span>
                    </div>
                  )}

                  {/* Assigned staff */}
                  {job.assigned_staff && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      Assigned: {job.assigned_staff.first_name} {job.assigned_staff.last_name}
                    </p>
                  )}

                  {/* Checkout / Paid */}
                  {job.status === 'completed' && !job.transaction_id && onCheckout && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); onCheckout(job.id); }}
                        className="flex items-center gap-1.5 rounded-full bg-blue-600 dark:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 active:bg-blue-800 dark:active:bg-blue-700"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Checkout
                      </button>
                    </div>
                  )}
                  {job.status === 'closed' && (
                    <div className="mt-2 flex justify-end">
                      <span className="flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                        <Check className="h-3 w-3" />
                        Paid
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
