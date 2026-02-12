'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, User, Clock, Bell } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { usePosAuth } from '../../context/pos-auth-context';
import { posFetch } from '../../lib/pos-fetch';
import type { JobStatus } from '@/lib/supabase/types';

type FilterType = 'mine' | 'all' | 'unassigned';

interface JobListItem {
  id: string;
  status: JobStatus;
  services: { id: string; name: string; price: number }[];
  estimated_pickup_at: string | null;
  created_at: string;
  customer: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  addons: { id: string; status: string }[] | null;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-gray-100 text-gray-700' },
  intake: { label: 'Intake', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  pending_approval: { label: 'Pending Approval', color: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
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

interface JobQueueProps {
  onNewWalkIn: () => void;
  onSelectJob: (jobId: string) => void;
}

export function JobQueue({ onNewWalkIn, onSelectJob }: JobQueueProps) {
  const { employee } = usePosAuth();
  const [filter, setFilter] = useState<FilterType>('mine');
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);

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

  // Auto-populate on mount, then fetch jobs
  useEffect(() => {
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
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Jobs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              populateFromAppointments();
              fetchJobs();
            }}
            disabled={populating}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', populating && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={onNewWalkIn}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Walk-in
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        {(['mine', 'all', 'unassigned'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            )}
          >
            {f === 'mine' ? 'My Jobs' : f === 'all' ? 'All Jobs' : 'Unassigned'}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <User className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">No jobs for today</p>
            <p className="mt-1 text-xs text-gray-400">
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
              const hasPendingAddon = job.addons?.some((a) => a.status === 'pending');
              const statusConfig = STATUS_CONFIG[job.status];
              const serviceNames = job.services.map((s) => s.name).join(', ');
              const pickupTime = formatPickupTime(job.estimated_pickup_at);

              return (
                <button
                  key={job.id}
                  onClick={() => onSelectJob(job.id)}
                  className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md active:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Customer + Vehicle */}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {job.customer
                            ? `${job.customer.first_name} ${job.customer.last_name}`
                            : 'Unknown Customer'}
                        </span>
                        {hasPendingAddon && (
                          <Bell className="h-4 w-4 shrink-0 text-orange-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {formatVehicle(job.vehicle)}
                      </p>

                      {/* Services */}
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {serviceNames || 'No services'}
                      </p>
                    </div>

                    {/* Right side: status + pickup */}
                    <div className="ml-3 flex flex-col items-end gap-1">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          statusConfig.color
                        )}
                      >
                        {statusConfig.label}
                      </span>
                      {pickupTime && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {pickupTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Assigned staff */}
                  {job.assigned_staff && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      Assigned: {job.assigned_staff.first_name} {job.assigned_staff.last_name}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
