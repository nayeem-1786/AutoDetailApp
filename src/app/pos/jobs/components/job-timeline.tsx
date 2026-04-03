'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { Check } from 'lucide-react';
import type { JobStatus } from '@/lib/supabase/types';
import type { JobListItem } from './job-queue';

// ─── Constants ──────────────────────────────────────────────────

// Business hours — 8 AM to 6 PM (10 hours)
// TODO: Could read from getBusinessHours() via an API call if dynamic hours are needed
const START_HOUR = 8;
const END_HOUR = 18;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60; // 600
const MIN_BLOCK_MINUTES = 30; // Minimum visual width for tappability
const LANE_HEIGHT = 72; // px per swim lane
const LABEL_WIDTH = 80; // px for detailer name column
const HOUR_WIDTH = 120; // px per hour on the grid

const TIMELINE_WIDTH = (END_HOUR - START_HOUR) * HOUR_WIDTH; // 1200px

const STATUS_BLOCK_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-gray-600 border-gray-500',
  intake: 'bg-amber-700 border-amber-600',
  in_progress: 'bg-blue-700 border-blue-500',
  pending_approval: 'bg-orange-700 border-orange-500',
  completed: 'bg-green-700 border-green-600',
  closed: 'bg-green-800 border-green-600',
  cancelled: 'bg-red-900 border-red-700',
};

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

function minutesToLeft(minutes: number): number {
  const offset = minutes - START_HOUR * 60;
  return Math.max(0, (offset / TOTAL_MINUTES) * TIMELINE_WIDTH);
}

function durationToWidth(durationMinutes: number): number {
  const effectiveDuration = Math.max(durationMinutes, MIN_BLOCK_MINUTES);
  return (effectiveDuration / TOTAL_MINUTES) * TIMELINE_WIDTH;
}

function getNowMinutes(): number {
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return pst.getHours() * 60 + pst.getMinutes();
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

// ─── Component ──────────────────────────────────────────────────

interface JobTimelineProps {
  jobs: JobListItem[];
  loading: boolean;
  selectedDate: string;
  isToday: boolean;
  onSelectJob: (jobId: string) => void;
  onCheckout?: (jobId: string) => void;
}

export function JobTimeline({ jobs, loading, selectedDate, isToday, onSelectJob, onCheckout }: JobTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);

  // Fetch active detailers
  useEffect(() => {
    async function loadStaff() {
      try {
        const res = await posFetch('/api/pos/staff/available');
        if (res.ok) {
          const { data } = await res.json();
          setStaff((data || []).map((s: StaffMember) => ({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
          })));
        }
      } catch {
        // Staff list unavailable — show Unassigned lane only
      }
    }
    loadStaff();
  }, []);

  // Update "now" line every minute
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60000);
    return () => clearInterval(id);
  }, [isToday]);

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (!isToday || !scrollRef.current) return;
    const nowOffset = minutesToLeft(nowMinutes) - 100; // 100px before now
    scrollRef.current.scrollLeft = Math.max(0, nowOffset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, staff.length]); // Re-scroll when staff loads

  // Categorize jobs into scheduled (have time) vs unscheduled
  const { scheduledJobs, unscheduledJobs } = useMemo(() => {
    const scheduled: JobListItem[] = [];
    const unscheduled: JobListItem[] = [];
    for (const job of jobs) {
      if (job.appointment?.scheduled_start_time) {
        scheduled.push(job);
      } else {
        unscheduled.push(job);
      }
    }
    return { scheduledJobs: scheduled, unscheduledJobs: unscheduled };
  }, [jobs]);

  // Build swim lane data: staff ID → jobs[]
  const lanes = useMemo(() => {
    const map = new Map<string, JobListItem[]>();

    // Initialize lanes for all staff
    for (const s of staff) {
      map.set(s.id, []);
    }
    map.set('__unassigned__', []);

    for (const job of scheduledJobs) {
      const laneId = job.assigned_staff?.id || '__unassigned__';
      if (!map.has(laneId)) map.set(laneId, []);
      map.get(laneId)!.push(job);
    }

    return map;
  }, [scheduledJobs, staff]);

  // Build lane ordering: staff first (sorted), then unassigned
  const laneOrder = useMemo(() => {
    const order: { id: string; label: string; initial: string }[] = [];
    for (const s of staff) {
      order.push({ id: s.id, label: s.first_name, initial: s.first_name.charAt(0).toUpperCase() });
    }
    order.push({ id: '__unassigned__', label: 'Unassigned', initial: '?' });
    return order;
  }, [staff]);

  // Hour markers
  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) h.push(i);
    return h;
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50 dark:bg-gray-800 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 py-16 text-gray-500 dark:text-gray-400">
        <p className="text-sm font-medium">No jobs scheduled</p>
      </div>
    );
  }

  const nowLeft = minutesToLeft(nowMinutes);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-800">
      {/* Timeline grid */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div style={{ minWidth: LABEL_WIDTH + TIMELINE_WIDTH + 16 }}>
          {/* Hour header row */}
          <div className="sticky top-0 z-10 flex border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
            <div className="shrink-0" style={{ width: LABEL_WIDTH }} />
            <div className="relative" style={{ width: TIMELINE_WIDTH }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute top-0 bottom-0 border-l border-gray-300 dark:border-gray-600"
                  style={{ left: (h - START_HOUR) * HOUR_WIDTH }}
                >
                  <span className="px-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {formatHourLabel(h)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Swim lanes */}
          {laneOrder.map((lane) => {
            const laneJobs = lanes.get(lane.id) || [];

            return (
              <div
                key={lane.id}
                className="flex border-b border-gray-200/50 dark:border-gray-700/50"
                style={{ minHeight: LANE_HEIGHT }}
              >
                {/* Lane label */}
                <div
                  className="sticky left-0 z-[5] flex shrink-0 items-center gap-2 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2"
                  style={{ width: LABEL_WIDTH }}
                >
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                    lane.id === '__unassigned__'
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  )}>
                    {lane.initial}
                  </div>
                  <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                    {lane.label}
                  </span>
                </div>

                {/* Timeline area */}
                <div className="relative flex-1" style={{ width: TIMELINE_WIDTH }}>
                  {/* Half-hour gridlines */}
                  {hours.map((h) => (
                    <div key={`grid-${h}`}>
                      <div
                        className="absolute top-0 bottom-0 border-l border-gray-200/40 dark:border-gray-700/30"
                        style={{ left: (h - START_HOUR) * HOUR_WIDTH }}
                      />
                      <div
                        className="absolute top-0 bottom-0 border-l border-gray-200/20 dark:border-gray-700/15"
                        style={{ left: (h - START_HOUR) * HOUR_WIDTH + HOUR_WIDTH / 2 }}
                      />
                    </div>
                  ))}

                  {/* Now line */}
                  {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                    <div
                      className="absolute top-0 bottom-0 z-[3] w-0.5 bg-red-500"
                      style={{ left: nowLeft }}
                    />
                  )}

                  {/* Job blocks */}
                  {laneJobs.map((job) => {
                    const startTime = job.appointment?.scheduled_start_time;
                    if (!startTime) return null;

                    const startMinutes = timeToMinutes(startTime);
                    const duration = job.estimated_duration_minutes || 60;
                    const left = minutesToLeft(startMinutes);
                    const width = durationToWidth(duration);
                    const statusColor = STATUS_BLOCK_COLORS[job.status] || STATUS_BLOCK_COLORS.scheduled;

                    const customerName = job.customer?.first_name || 'Customer';
                    const vehicleDesc = job.vehicle
                      ? cleanVehicleDescription({ make: job.vehicle.make, model: job.vehicle.model })
                      : '';
                    const serviceName = job.services[0]?.name || 'Service';

                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => onSelectJob(job.id)}
                        className={cn(
                          'absolute top-1 rounded-md border px-1.5 py-1 text-left transition-opacity hover:opacity-90 active:opacity-75',
                          statusColor
                        )}
                        style={{
                          left,
                          width: Math.max(width, 60),
                          height: LANE_HEIGHT - 8,
                        }}
                        title={`${customerName} — ${serviceName} (${duration}min)`}
                      >
                        <p className="truncate text-[11px] font-medium text-white">
                          {customerName}{vehicleDesc ? ` · ${vehicleDesc}` : ''}
                        </p>
                        <p className="truncate text-[10px] text-white/70">
                          {serviceName}
                        </p>
                        {job.status === 'closed' && (
                          <Check className="absolute right-1 top-1 h-3 w-3 text-white/60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled section */}
      {unscheduledJobs.length > 0 && (
        <div className="border-t border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900">
          <div className="px-4 py-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Unscheduled ({unscheduledJobs.length})
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            {unscheduledJobs.map((job) => {
              const customerName = job.customer
                ? `${job.customer.first_name} ${job.customer.last_name}`
                : 'Customer';
              const serviceName = job.services.map((s) => s.name).join(', ') || 'Service';
              const statusColor = STATUS_BLOCK_COLORS[job.status] || STATUS_BLOCK_COLORS.scheduled;

              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onSelectJob(job.id)}
                  className={cn(
                    'shrink-0 rounded-lg border px-3 py-2 text-left transition-opacity hover:opacity-90 active:opacity-75',
                    statusColor
                  )}
                  style={{ minWidth: 160 }}
                >
                  <p className="truncate text-xs font-medium text-white">{customerName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-white/70">{serviceName}</p>
                  {job.status === 'completed' && !job.transaction_id && onCheckout && (
                    <div className="mt-1 text-right">
                      <span
                        onClick={(e) => { e.stopPropagation(); onCheckout(job.id); }}
                        className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white"
                      >
                        Checkout
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
