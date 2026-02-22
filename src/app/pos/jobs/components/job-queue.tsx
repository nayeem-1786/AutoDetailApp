'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RefreshCw, User, Clock, Calendar, Footprints, ShoppingCart, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePosAuth } from '../../context/pos-auth-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { posFetch } from '../../lib/pos-fetch';
import type { JobStatus } from '@/lib/supabase/types';

type FilterType = 'mine' | 'all' | 'unassigned';

interface JobListItem {
  id: string;
  status: JobStatus;
  appointment_id: string | null;
  transaction_id: string | null;
  services: { id: string; name: string; price: number }[];
  estimated_pickup_at: string | null;
  created_at: string;
  customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  addons: { id: string; status: string }[] | null;
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

// Status priority for sorting (lower = higher priority, shown first)
const STATUS_PRIORITY: Record<JobStatus, number> = {
  in_progress: 0,
  intake: 1,
  scheduled: 2,
  pending_approval: 3,
  completed: 4,
  closed: 5,
  cancelled: 6,
};

function formatVehicle(v: JobListItem['vehicle']): string {
  if (!v) return 'No vehicle';
  const parts = [v.year, v.make, v.model].filter(Boolean);
  const desc = parts.length > 0 ? parts.join(' ') : 'Vehicle';
  return v.color ? `${v.color} ${desc}` : desc;
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

/**
 * Determine the most relevant addon status for the badge.
 * Priority: pending > approved > declined > null
 */
function getAddonBadge(addons: { id: string; status: string }[] | null): {
  label: string;
  color: string;
} | null {
  if (!addons || addons.length === 0) return null;

  const hasPending = addons.some((a) => a.status === 'pending');
  const hasApproved = addons.some((a) => a.status === 'approved');
  const hasDeclined = addons.some((a) => a.status === 'declined');

  if (hasPending) {
    return { label: 'Addon Pending', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' };
  }
  if (hasApproved) {
    return { label: 'Addon Approved', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' };
  }
  if (hasDeclined) {
    return { label: 'Addon Declined', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' };
  }
  return null;
}

interface JobQueueProps {
  onNewWalkIn: () => void;
  onSelectJob: (jobId: string) => void;
  onCheckout?: (jobId: string) => void;
}

export function JobQueue({ onNewWalkIn, onSelectJob, onCheckout }: JobQueueProps) {
  const { employee } = usePosAuth();
  const { granted: canCreateWalkIn } = usePosPermission('pos.jobs.manage');
  const isBookable = employee?.bookable_for_appointments ?? false;
  const [filter, setFilter] = useState<FilterType>(isBookable ? 'mine' : 'all');
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);
  const populatedRef = useRef(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await posFetch(`/api/pos/jobs?filter=${filter}`);
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

  const populateFromAppointments = useCallback(async () => {
    setPopulating(true);
    try {
      const res = await posFetch('/api/pos/jobs/populate', { method: 'POST' });
      if (res.ok) {
        const { data } = await res.json();
        if (data.created > 0) {
          // Refresh the list to include newly created jobs
          await fetchJobs();
        }
      }
    } catch (err) {
      console.error('Failed to populate jobs:', err);
    } finally {
      setPopulating(false);
    }
  }, [fetchJobs]);

  // Auto-populate on mount (ref guard prevents React strict mode double-fire)
  useEffect(() => {
    if (populatedRef.current) return;
    populatedRef.current = true;
    async function init() {
      await populateFromAppointments();
      await fetchJobs();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filter changes (but not on mount — init handles that)
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Sort by status priority
  const sortedJobs = [...jobs].sort(
    (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Jobs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              populateFromAppointments();
              fetchJobs();
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

      {/* Job list */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <User className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-500" />
            <p className="text-sm font-medium">No jobs for today</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {filter === 'mine'
                ? `No jobs assigned to ${employee?.first_name ?? 'you'}`
                : filter === 'unassigned'
                  ? 'All jobs have been assigned'
                  : "Today's schedule is empty"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedJobs.map((job) => {
              const addonBadge = getAddonBadge(job.addons);
              const statusConfig = STATUS_CONFIG[job.status];
              const serviceNames = job.services.map((s) => s.name).join(', ');
              const pickupTime = formatPickupTime(job.estimated_pickup_at);

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

                      {/* Services */}
                      <p className="mt-1 truncate text-xs text-gray-400 dark:text-gray-500">
                        {serviceNames || 'No services'}
                      </p>
                    </div>

                    {/* Right side: source + status + pickup */}
                    <div className="ml-3 flex flex-col items-end gap-1">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            job.appointment_id
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                          )}
                        >
                          {job.appointment_id ? (
                            <><Calendar className="h-3 w-3" />Appt</>
                          ) : (
                            <><Footprints className="h-3 w-3" />Walk-In</>
                          )}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            statusConfig.color
                          )}
                        >
                          {statusConfig.label}
                        </span>
                      </div>
                      {pickupTime && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="h-3 w-3" />
                          {pickupTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Addon badge */}
                  {addonBadge && (
                    <div className="mt-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        addonBadge.color
                      )}>
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

                  {/* Checkout action for completed jobs / Paid indicator for closed */}
                  {job.status === 'completed' && !job.transaction_id && onCheckout && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckout(job.id);
                        }}
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
    </div>
  );
}
