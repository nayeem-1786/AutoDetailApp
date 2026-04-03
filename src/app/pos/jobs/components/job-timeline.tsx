'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { Check, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import type { JobStatus } from '@/lib/supabase/types';
import type { JobListItem } from './job-queue';

// ─── Constants ──────────────────────────────────────────────────

const START_HOUR = 8;
const END_HOUR = 18;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
const MIN_BLOCK_MINUTES = 30;
const LANE_HEIGHT = 72;
const LABEL_WIDTH = 120;
const HOUR_WIDTH = 120;
const TIMELINE_WIDTH = (END_HOUR - START_HOUR) * HOUR_WIDTH;
const SNAP_MINUTES = 15;

const DRAGGABLE_STATUSES: JobStatus[] = ['scheduled', 'intake'];

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

interface PendingDrop {
  jobId: string;
  job: JobListItem;
  newTime: string | null;
  newStaffId: string | null;
  oldTime: string | null;
  oldStaffId: string | null;
  laneLabel: string;
  isUnschedule: boolean;
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
  const effective = Math.max(durationMinutes, MIN_BLOCK_MINUTES);
  return (effective / TOTAL_MINUTES) * TIMELINE_WIDTH;
}

function leftToMinutes(left: number): number {
  return START_HOUR * 60 + (left / TIMELINE_WIDTH) * TOTAL_MINUTES;
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToTimeStr(minutes: number): string {
  const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12h(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${period}`;
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

// ─── Draggable Block ────────────────────────────────────────────

function DraggableJobBlock({
  job,
  left,
  width,
  isDraggable,
  isSaving,
  onSelect,
}: {
  job: JobListItem;
  left: number;
  width: number;
  isDraggable: boolean;
  isSaving: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    disabled: !isDraggable || isSaving,
    data: { job },
  });

  const statusColor = STATUS_BLOCK_COLORS[job.status] || STATUS_BLOCK_COLORS.scheduled;
  const customerName = job.customer?.first_name || 'Customer';
  const vehicleDesc = job.vehicle
    ? cleanVehicleDescription({ make: job.vehicle.make, model: job.vehicle.model })
    : '';
  const serviceName = job.services[0]?.name || 'Service';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute top-1 rounded-md border px-1.5 py-1 text-left transition-all',
        statusColor,
        isDragging && 'opacity-30 border-dashed',
        isDraggable && !isSaving && 'cursor-grab active:cursor-grabbing',
        isSaving && 'opacity-60 animate-pulse',
      )}
      style={{
        left,
        width: Math.max(width, 60),
        height: LANE_HEIGHT - 8,
      }}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onSelect(); } }}
      title={`${customerName} — ${serviceName}`}
    >
      <div className="flex h-full items-start gap-0.5">
        {isDraggable && !isSaving && (
          <div
            {...attributes}
            {...listeners}
            className="shrink-0 pt-0.5 text-white/40 touch-none"
          >
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-white">
            {customerName}{vehicleDesc ? ` · ${vehicleDesc}` : ''}
          </p>
          <p className="truncate text-[10px] text-white/70">{serviceName}</p>
        </div>
        {job.status === 'closed' && (
          <Check className="absolute right-1 top-1 h-3 w-3 text-white/60" />
        )}
      </div>
    </div>
  );
}

// ─── Draggable Unscheduled Card ─────────────────────────────────

function DraggableUnscheduledCard({
  job,
  isDraggable,
  isSaving,
  onSelect,
  onCheckout,
}: {
  job: JobListItem;
  isDraggable: boolean;
  isSaving: boolean;
  onSelect: () => void;
  onCheckout?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `unsched-${job.id}`,
    disabled: !isDraggable || isSaving,
    data: { job, fromUnscheduled: true },
  });

  const statusColor = STATUS_BLOCK_COLORS[job.status] || STATUS_BLOCK_COLORS.scheduled;
  const customerName = job.customer
    ? `${job.customer.first_name} ${job.customer.last_name}`
    : 'Customer';
  const serviceName = job.services.map((s) => s.name).join(', ') || 'Service';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'shrink-0 rounded-lg border px-3 py-2 text-left transition-all',
        statusColor,
        isDragging && 'opacity-30',
        isDraggable && !isSaving && 'cursor-grab active:cursor-grabbing',
        isSaving && 'opacity-60 animate-pulse',
      )}
      style={{ minWidth: 160 }}
      onClick={() => !isDragging && onSelect()}
    >
      {isDraggable && !isSaving && (
        <div
          {...attributes}
          {...listeners}
          className="mb-1 text-white/40 touch-none"
        >
          <GripVertical className="h-3 w-3" />
        </div>
      )}
      <p className="truncate text-xs font-medium text-white">{customerName}</p>
      <p className="mt-0.5 truncate text-[10px] text-white/70">{serviceName}</p>
      {job.status === 'completed' && !job.transaction_id && onCheckout && (
        <div className="mt-1 text-right">
          <span
            onClick={(e) => { e.stopPropagation(); onCheckout(job.id); }}
            className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white cursor-pointer"
          >
            Checkout
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Droppable Lane ─────────────────────────────────────────────

function DroppableLane({
  laneId,
  children,
}: {
  laneId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${laneId}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative flex-1 transition-colors',
        isOver && 'bg-blue-900/20'
      )}
      style={{ width: TIMELINE_WIDTH }}
    >
      {children}
    </div>
  );
}

// ─── Droppable Unscheduled Zone ─────────────────────────────────

function DroppableUnscheduledZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled-zone' });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'border-t border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 transition-colors',
        isOver && 'bg-amber-900/20'
      )}
    >
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

interface JobTimelineProps {
  jobs: JobListItem[];
  loading: boolean;
  selectedDate: string;
  isToday: boolean;
  onSelectJob: (jobId: string) => void;
  onCheckout?: (jobId: string) => void;
  onRefresh?: () => void;
}

export function JobTimeline({ jobs, loading, selectedDate, isToday, onSelectJob, onCheckout, onRefresh }: JobTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);
  const [activeJob, setActiveJob] = useState<JobListItem | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [savingJobs, setSavingJobs] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Fetch staff
  useEffect(() => {
    async function loadStaff() {
      try {
        const res = await posFetch('/api/pos/staff/available');
        if (res.ok) {
          const { data } = await res.json();
          setStaff((data || []).map((s: StaffMember) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name })));
        }
      } catch { /* empty */ }
    }
    loadStaff();
  }, []);

  // Now line
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMinutes(getNowMinutes()), 60000);
    return () => clearInterval(id);
  }, [isToday]);

  // Auto-scroll
  useEffect(() => {
    if (!isToday || !scrollRef.current) return;
    const nowOffset = minutesToLeft(nowMinutes) - 100;
    scrollRef.current.scrollLeft = Math.max(0, nowOffset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, staff.length]);

  const { scheduledJobs, unscheduledJobs } = useMemo(() => {
    const scheduled: JobListItem[] = [];
    const unscheduled: JobListItem[] = [];
    for (const job of jobs) {
      if (job.appointment?.scheduled_start_time) scheduled.push(job);
      else unscheduled.push(job);
    }
    return { scheduledJobs: scheduled, unscheduledJobs: unscheduled };
  }, [jobs]);

  const lanes = useMemo(() => {
    const map = new Map<string, JobListItem[]>();
    for (const s of staff) map.set(s.id, []);
    map.set('__unassigned__', []);
    for (const job of scheduledJobs) {
      const laneId = job.assigned_staff?.id || '__unassigned__';
      if (!map.has(laneId)) map.set(laneId, []);
      map.get(laneId)!.push(job);
    }
    return map;
  }, [scheduledJobs, staff]);

  const laneOrder = useMemo(() => {
    const order: { id: string; label: string; initial: string }[] = [];
    for (const s of staff) {
      order.push({ id: s.id, label: s.first_name, initial: s.first_name.charAt(0).toUpperCase() });
    }
    order.push({ id: '__unassigned__', label: 'Unassigned', initial: '?' });
    return order;
  }, [staff]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) h.push(i);
    return h;
  }, []);

  // ─── Drag handlers ─────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { job: JobListItem } | undefined;
    if (data?.job) setActiveJob(data.job);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveJob(null);
    const { active, over, delta } = event;
    if (!over) return;

    const data = active.data.current as { job: JobListItem; fromUnscheduled?: boolean } | undefined;
    if (!data?.job) return;
    const job = data.job;

    const overIdStr = String(over.id);

    // Dropped on unscheduled zone
    if (overIdStr === 'unscheduled-zone') {
      if (job.appointment?.scheduled_start_time) {
        // Can't unschedule appointment-based jobs
        toast.error('Cannot unschedule appointment-based jobs');
      }
      return;
    }

    // Dropped on a lane
    if (overIdStr.startsWith('lane-')) {
      const targetLaneId = overIdStr.replace('lane-', '');
      const targetStaffId = targetLaneId === '__unassigned__' ? null : targetLaneId;

      // Calculate new time from drag delta
      let newTime: string | null = null;
      if (data.fromUnscheduled) {
        // Dragged from unscheduled — calculate time from drop position
        // Use the center of the lane as a reference — approximate with delta
        const dropMinutes = snapToGrid(leftToMinutes(Math.max(0, delta.x)));
        newTime = minutesToTimeStr(dropMinutes);
      } else if (job.appointment?.scheduled_start_time) {
        // Time block — calculate new time from current position + delta
        const currentMinutes = timeToMinutes(job.appointment.scheduled_start_time);
        const deltaMinutes = (delta.x / TIMELINE_WIDTH) * TOTAL_MINUTES;
        const newMinutes = snapToGrid(currentMinutes + deltaMinutes);
        newTime = minutesToTimeStr(newMinutes);
      }

      const oldStaffId = job.assigned_staff?.id || null;
      const oldTime = job.appointment?.scheduled_start_time || null;

      // Check if anything actually changed
      const timeChanged = newTime && newTime !== oldTime?.slice(0, 5);
      const staffChanged = targetStaffId !== oldStaffId;

      if (!timeChanged && !staffChanged) return;

      const targetLane = laneOrder.find((l) => l.id === targetLaneId);

      setPendingDrop({
        jobId: job.id,
        job,
        newTime: timeChanged ? newTime! : null,
        newStaffId: staffChanged ? targetStaffId : null,
        oldTime,
        oldStaffId,
        laneLabel: targetLane?.label || 'Unknown',
        isUnschedule: false,
      });
    }
  }, [laneOrder]);

  const handleDragCancel = useCallback(() => {
    setActiveJob(null);
  }, []);

  // ─── Confirm/Cancel drop ──────────────────────────────────

  const confirmDrop = useCallback(async () => {
    if (!pendingDrop) return;
    const { jobId, newTime, newStaffId } = pendingDrop;

    setSavingJobs((prev) => new Set(prev).add(jobId));
    setPendingDrop(null);

    try {
      const payload: Record<string, unknown> = {};
      if (newTime) payload.scheduled_start_time = newTime + ':00';
      if (newStaffId !== null && newStaffId !== undefined) payload.assigned_staff_id = newStaffId;
      // If newStaffId is explicitly being set (including to null for unassign)
      if (pendingDrop.newStaffId !== null || (pendingDrop.newStaffId === null && pendingDrop.oldStaffId !== null)) {
        payload.assigned_staff_id = newStaffId;
      }

      const res = await posFetch(`/api/pos/jobs/${jobId}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to reschedule' }));
        toast.error(err.error || 'Failed to reschedule');
      } else {
        toast.success('Job rescheduled');
        onRefresh?.();
      }
    } catch {
      toast.error('Failed to reschedule — please try again');
    } finally {
      setSavingJobs((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }, [pendingDrop, onRefresh]);

  const cancelDrop = useCallback(() => {
    setPendingDrop(null);
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
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-50 dark:bg-gray-800">
          {/* Timeline grid */}
          <div className="flex-1 overflow-auto" ref={scrollRef}>
            <div style={{ minWidth: LABEL_WIDTH + TIMELINE_WIDTH + 16 }}>
              {/* Hour header */}
              <div className="sticky top-0 z-10 flex border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
                <div className="shrink-0" style={{ width: LABEL_WIDTH }} />
                <div className="relative h-6" style={{ width: TIMELINE_WIDTH }}>
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
                    {/* Label */}
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

                    {/* Drop zone */}
                    <DroppableLane laneId={lane.id}>
                      {/* Gridlines */}
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
                        const isDraggable = DRAGGABLE_STATUSES.includes(job.status);
                        const isSaving = savingJobs.has(job.id);

                        return (
                          <DraggableJobBlock
                            key={job.id}
                            job={job}
                            left={left}
                            width={width}
                            isDraggable={isDraggable}
                            isSaving={isSaving}
                            onSelect={() => onSelectJob(job.id)}
                          />
                        );
                      })}
                    </DroppableLane>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unscheduled section */}
          {unscheduledJobs.length > 0 && (
            <DroppableUnscheduledZone>
              <div className="px-4 py-1.5">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Unscheduled ({unscheduledJobs.length})
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto px-4 pb-3">
                {unscheduledJobs.map((job) => {
                  const isDraggable = DRAGGABLE_STATUSES.includes(job.status);
                  const isSaving = savingJobs.has(job.id);
                  return (
                    <DraggableUnscheduledCard
                      key={job.id}
                      job={job}
                      isDraggable={isDraggable}
                      isSaving={isSaving}
                      onSelect={() => onSelectJob(job.id)}
                      onCheckout={onCheckout}
                    />
                  );
                })}
              </div>
            </DroppableUnscheduledZone>
          )}
        </div>

        {/* Drag overlay — ghost that follows cursor */}
        <DragOverlay dropAnimation={null}>
          {activeJob && (
            <div
              className={cn(
                'rounded-md border px-1.5 py-1 shadow-xl',
                STATUS_BLOCK_COLORS[activeJob.status] || STATUS_BLOCK_COLORS.scheduled,
                'opacity-80 scale-105'
              )}
              style={{
                width: durationToWidth(activeJob.estimated_duration_minutes || 60),
                height: LANE_HEIGHT - 8,
                maxWidth: 300,
              }}
            >
              <p className="truncate text-[11px] font-medium text-white">
                {activeJob.customer?.first_name || 'Customer'}
              </p>
              <p className="truncate text-[10px] text-white/70">
                {activeJob.services[0]?.name || 'Service'}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Confirmation dialog */}
      {pendingDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-100">Confirm Reschedule</h3>

            {/* Job info */}
            <div className="mt-3 rounded-lg bg-gray-800 p-3">
              <p className="text-sm font-medium text-gray-200">
                {pendingDrop.job.customer?.first_name} {pendingDrop.job.customer?.last_name}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {pendingDrop.job.services.map((s) => s.name).join(', ')}
              </p>
            </div>

            {/* Changes */}
            <div className="mt-3 space-y-2">
              {pendingDrop.newTime && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-gray-500">Time:</span>
                  <span>{pendingDrop.oldTime ? formatTime12h(pendingDrop.oldTime) : 'Unscheduled'}</span>
                  <span className="text-gray-500">→</span>
                  <span className="font-medium text-blue-400">{formatTime12h(pendingDrop.newTime)}</span>
                </div>
              )}
              {pendingDrop.newStaffId !== null && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="text-gray-500">Detailer:</span>
                  <span>{staff.find((s) => s.id === pendingDrop.oldStaffId)?.first_name || 'Unassigned'}</span>
                  <span className="text-gray-500">→</span>
                  <span className="font-medium text-blue-400">{pendingDrop.laneLabel}</span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={cancelDrop}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDrop}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
