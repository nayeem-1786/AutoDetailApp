'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, RefreshCw, User, Clock, Calendar, Footprints, ShoppingCart, Check,
  ChevronLeft, ChevronRight, Camera, Timer, DollarSign, AlertTriangle, Archive,
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
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS, APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import { toast } from 'sonner';
import type { PosScheduleEntry, PosUnstartedAppointment } from './schedule-types';
// Session 2.2 (AC-3 second half) — Today scope absorbs un-started appointments.
// The card encapsulates the Start Intake button + the 422 future_date popup
// (defense-in-depth: server filters today's date, but the popup wires the
// PATCH-date + retry affordance for race cases).
import { UnstartedAppointmentCard } from './unstarted-appointment-card';
// Item 15e Phase 2B — reuse the dual-context-safe admin dialog (parameterized
// in Phase 2A) inside the POS Jobs Schedule scope. The dialog is the same
// component admin mounts; POS passes `hostContext="pos"` (Session 1.1 unified
// prop, replaces the legacy trio `mobileModalMode` / `modifierVariant` /
// would-be `unmaterializeContext` per parity audit b346d34b Concern 2 +
// Memory #2) and `returnToPath="/pos/jobs"` — sends the Edit-in-POS deep-link's
// return navigation back to Schedule instead of admin. Cancel hands off to
// the existing POS cancel dialog (Item 15b). See
// docs/dev/ITEM_15E_PHASE_2_REUSE_VERIFICATION.md and the post-Phase-2B
// fix in docs/dev/EDIT_IN_POS_BUTTON_AUDIT.md.
import { AppointmentDetailDialog } from '@/app/admin/appointments/components/appointment-detail-dialog';
import { CancelAppointmentDialog } from '../../components/appointments/cancel-appointment-dialog';
// N+1 (Session #148) — Schedule filter bar + date pills. Status + detailer + search land in N+2.
import { SchedulePillRow, type ScheduleFilterState } from './schedule-pill-row';
import {
  computeScheduleDateRange,
  type SchedulePillId,
  type ScheduleDateRange,
} from '@/lib/utils/schedule-date-range';
// N+2 (Session #149) — search/status/detailer client-side filtering. Endpoint
// unchanged per Target A; status/detailer/search are CLIENT-SIDE filters over
// the date-window fetch (audit D.6/D.7 lock, mirrors admin appointments pattern).
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { entryMatchesFilters } from '@/lib/utils/schedule-entry-matches';
import type { PosAppointment } from '../../components/appointments/types';
import type { AppointmentWithRelations } from '@/lib/appointments/types';
import type { AppointmentUpdateInput } from '@/lib/utils/validation';
import type { Employee, AppointmentStatus } from '@/lib/supabase/types';

type FilterType = 'mine' | 'all' | 'unassigned';
type ViewMode = 'list' | 'timeline';
type ScopeMode = 'today' | 'schedule';

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

// Item 15e Phase 2B — pending/status pill for Schedule cards. POS-local
// (deliberately NOT sharing admin's STATUS_DOT_COLORS — admin uses small
// text-less calendar dots; POS uses labelled pills, a different visual
// treatment). Dark-aware per Rule #10. Pill text comes from
// APPOINTMENT_STATUS_LABELS.
function getAppointmentStatusPillClasses(status: AppointmentStatus): string {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
  switch (status) {
    case 'pending':
      return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`;
    case 'confirmed':
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`;
    case 'in_progress':
      return `${base} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300`;
    // Session 2.4 (AC-7) — terminal statuses, surfaced only with the operator's
    // include-terminal toggle. Distinct hues so the operator can scan the list
    // and spot recovery candidates at a glance.
    case 'cancelled':
      return `${base} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`;
    case 'completed':
      return `${base} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`;
    case 'no_show':
      return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300`;
    default:
      return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
  }
}

// Session 2.4 (AC-7) — terminal-state predicates for the per-card visual-mute
// treatment. Predicate scope is asymmetric by design:
// - JOBS axis: only `cancelled` is gated behind the toggle (completed/closed
//   jobs are part of the default Today view via the existing exclude list).
// - APPOINTMENTS axis: all three (cancelled/completed/no_show) are gated.
// Cards rendered behind the toggle get an opacity-60 visual mute so the
// operator's eye can distinguish review/recovery entries from active work.
const TERMINAL_APPT_STATUSES = new Set<AppointmentStatus>(['cancelled', 'completed', 'no_show']);

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
  // Item 15e Phase 2B — per-field gates for the Schedule-scope detail dialog.
  // Same keys admin uses; no new permission keys. The server PATCH (Phase 2A)
  // re-checks each independently, so these gates are UX-only.
  const { granted: canReschedule } = usePosPermission('appointments.reschedule');
  const { granted: canCancel } = usePosPermission('appointments.cancel');
  const { granted: canAddNotes } = usePosPermission('appointments.add_notes');
  // Session 1.3 — mirror admin/appointments/page.tsx; gate the status
  // dropdown on `appointments.update_status` (parity audit b346d34b Target
  // B.12). The parity contract test asserts both hosts pass this prop.
  const { granted: canUpdateStatus } = usePosPermission('appointments.update_status');
  const isBookable = employee?.bookable_for_appointments ?? false;

  // Date from URL or today
  const today = getTodayPst();
  const initialDate = searchParams.get('date') || today;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const isToday = selectedDate === today;
  const diff = daysDiff(selectedDate);

  const [filter, setFilter] = useState<FilterType>('all');
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

  // ─── Item 15e Phase 1B — Today / Schedule scope ───────────────────────────
  // Gated behind the pos_jobs_unified_schedule flag. When the flag is OFF,
  // effectiveScope is pinned to 'today' so behavior is byte-identical to
  // pre-15e: the toggle never renders and the Schedule code paths never run.
  const { enabled: scheduleScopeEnabled } = useFeatureFlag(FEATURE_FLAGS.POS_JOBS_UNIFIED_SCHEDULE);
  const [scope, setScope] = useState<ScopeMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pos-jobs-scope') as ScopeMode) || 'today';
    }
    return 'today';
  });
  const effectiveScope: ScopeMode = scheduleScopeEnabled ? scope : 'today';
  const handleScopeChange = useCallback((s: ScopeMode) => {
    setScope(s);
    localStorage.setItem('pos-jobs-scope', s);
  }, []);
  // Mirror effectiveScope into a ref so `pollJobs` reads the latest scope
  // without `scope` entering its dep array (avoids stale-closure churn on
  // the 5-second polling interval). Pre-2.5 this also served the populate
  // gate's defense-layer-3 short-circuit; populate retired in Session 2.5
  // but `pollJobs` still uses it (poll only fires in Today scope).
  const scopeRef = useRef<ScopeMode>(effectiveScope);
  useEffect(() => { scopeRef.current = effectiveScope; }, [effectiveScope]);

  const [scheduleEntries, setScheduleEntries] = useState<PosScheduleEntry[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // N+1 (Session #148) — Schedule date-pill filter state. URL-persistent per
  // F.2 LOCKED. Reads ?sched_pills + ?sched_from + ?sched_to on mount; defaults
  // to F.1's ['next_30_days']. URL write mirrors the existing `setDate` pattern
  // at :315-325 (preserve other params via `URLSearchParams(searchParams)` +
  // selective set/delete) rather than `useTableState`, whose URL effect builds
  // a fresh URLSearchParams and would clobber ?date / ?rebook. See CHANGELOG
  // #148 for the deviation rationale.
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilterState>(() => {
    const pillsParam = searchParams.get('sched_pills');
    const fromParam = searchParams.get('sched_from');
    const toParam = searchParams.get('sched_to');
    const selectedPills: SchedulePillId[] = pillsParam
      ? (pillsParam.split(',').filter(Boolean) as SchedulePillId[])
      : ['next_30_days'];
    const otherRange: ScheduleDateRange | null =
      fromParam && toParam ? { from: fromParam, to: toParam } : null;
    return { selectedPills, otherRange };
  });
  const handleScheduleFilterChange = useCallback(
    (next: ScheduleFilterState) => {
      setScheduleFilter(next);
      const params = new URLSearchParams(searchParams.toString());
      // Strip ?sched_pills for the F.1 default so the URL stays clean.
      const isDefault =
        next.selectedPills.length === 1 && next.selectedPills[0] === 'next_30_days';
      if (isDefault || next.selectedPills.length === 0) params.delete('sched_pills');
      else params.set('sched_pills', next.selectedPills.join(','));
      if (next.otherRange) {
        params.set('sched_from', next.otherRange.from);
        params.set('sched_to', next.otherRange.to);
      } else {
        params.delete('sched_from');
        params.delete('sched_to');
      }
      const qs = params.toString();
      router.replace(`/pos/jobs${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  // N+2 (Session #149) — search / status / detailer filter state.
  // URL keys mirror N+1: `sched_search`, `sched_status`, `sched_detailer`. URL
  // writes preserve other params via the setDate pattern (consistent with
  // handleScheduleFilterChange above).
  const [searchInput, setSearchInput] = useState<string>(() => searchParams.get('sched_search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState<string>(searchInput);
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('sched_status') ?? '');
  const [detailerFilter, setDetailerFilter] = useState<string>(() => searchParams.get('sched_detailer') ?? '');

  // Session 2.4 (AC-7) — terminal-state opt-in toggle. Scope-shared: a single
  // boolean URL key (`?include_terminal=1`) read by BOTH the Today fetch and
  // the Schedule fetch, so toggling on either scope honors the operator's
  // choice on the other (and on page refresh). The URL key is intentionally
  // separate from `?sched_*` because the gate applies to both scopes.
  const [includeTerminal, setIncludeTerminal] = useState<boolean>(
    () => searchParams.get('include_terminal') === '1' || searchParams.get('include_terminal') === 'true'
  );
  const handleIncludeTerminalChange = useCallback(
    (next: boolean) => {
      setIncludeTerminal(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set('include_terminal', '1');
      else params.delete('include_terminal');
      const qs = params.toString();
      router.replace(`/pos/jobs${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  // 300ms debounce on the search input — re-fetch/render fires after the last
  // keystroke. No external lib; useTableState's debounce was the audit's
  // suggestion but N+1 locked the file-local URL-state pattern instead.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // URL write — single helper for the three N+2 dimensions. Empty string = no
  // constraint = strip from URL.
  const writeN2FilterUrl = useCallback(
    (search: string, status: string, detailerId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) params.set('sched_search', search.trim());
      else params.delete('sched_search');
      if (status) params.set('sched_status', status);
      else params.delete('sched_status');
      if (detailerId) params.set('sched_detailer', detailerId);
      else params.delete('sched_detailer');
      const qs = params.toString();
      router.replace(`/pos/jobs${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Persist the debounced search (not every keystroke — keeps URL history
  // sane and re-fires only when the filter actually settles).
  useEffect(() => {
    writeN2FilterUrl(debouncedSearch, statusFilter, detailerFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, detailerFilter]);

  // Bookable-detailer list for the dropdown (F.6 LOCKED — uses the existing
  // /api/pos/staff/available endpoint that Phase 2B's card-tap already calls).
  // Fetched ONCE on Schedule-scope mount + cached; no re-fetch on filter
  // change. Loading/error states surface as a disabled dropdown / fallback
  // option so the surface degrades gracefully.
  type DetailerOption = { id: string; first_name: string; last_name: string };
  const [availableDetailers, setAvailableDetailers] = useState<DetailerOption[] | null>(null);
  const [detailersError, setDetailersError] = useState<boolean>(false);
  useEffect(() => {
    if (effectiveScope !== 'schedule') return;
    if (availableDetailers !== null) return; // cached
    let cancelled = false;
    (async () => {
      try {
        const res = await posFetch('/api/pos/staff/available');
        if (cancelled) return;
        if (res.ok) {
          const { data } = await res.json();
          setAvailableDetailers((data ?? []) as DetailerOption[]);
        } else {
          setDetailersError(true);
          setAvailableDetailers([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Schedule] detailer fetch failed:', err);
        setDetailersError(true);
        setAvailableDetailers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveScope, availableDetailers]);

  // ─── Item 15e Phase 2B — Schedule-scope appointment detail dialog ──────────
  // Tapping a Schedule card fetches the full appointment + bookable staff, then
  // mounts the reused admin AppointmentDetailDialog. Cancel hands off to the
  // POS CancelAppointmentDialog. `selectedAppointment` is typed as the admin
  // AppointmentWithRelations the dialog expects; the GET payload is structurally
  // a PosAppointment (only the nested `service` is nullable), which the dialog
  // reads via optional chaining — so the shapes interoperate safely.
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [detailEmployees, setDetailEmployees] = useState<
    Array<Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'>>
  >([]);
  const [loadingAppointment, setLoadingAppointment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PosAppointment | null>(null);

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  // Session 2.2 — un-started confirmed/in_progress appointments for TODAY
  // returned alongside `data` from /api/pos/jobs. Empty for past dates. Pre-2.5
  // this was also empty in steady state because populate raced ahead and
  // materialized confirmed appointments at status='scheduled' on Today-scope
  // mount; Session 2.5 retired populate, so the strip is now the canonical
  // surface for un-materialized today-appointments (operator presses Start
  // Intake to materialize per AC-3).
  const [unstartedAppointments, setUnstartedAppointments] = useState<PosUnstartedAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Polling state
  const POLL_MS_ACTIVE = 5_000;  // 5s for today/future
  const POLL_MS_PAST = 60_000;   // 60s for past dates
  const [timelineInteracting, setTimelineInteracting] = useState(false);
  const [highlightedJobs, setHighlightedJobs] = useState<Set<string>>(new Set());
  const localUpdatesRef = useRef<Map<string, number>>(new Map()); // jobId → timestamp of local action
  const prevJobsRef = useRef<string>(''); // JSON snapshot for change detection
  const failCountRef = useRef(0);
  const [pollStatus, setPollStatus] = useState<'ok' | 'error'>('ok');
  const [lastPollAt, setLastPollAt] = useState<number>(Date.now());

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

  // Session 2.3 — AC-8: forward-arrow routes to Schedule on today-crossing.
  // When the operator presses the forward arrow and navigation would cross
  // from today/past into tomorrow or later, route to Schedule scope with the
  // target date pinned as a single-day "Other" range — preserves the date
  // intent while moving to the surface that actually shows future work
  // (Today's forward-arrow into future dates was structurally inert under
  // Item 15e Phase 1A's populate-future-date guard, yielding empty lists).
  // Past-date forward navigation stays within Today scope (the legacy
  // "scroll through past jobs" affordance). Gated on `scheduleScopeEnabled`
  // so a flag rollback restores legacy behavior. See AC-8 in
  // docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md and Targets A.4 / E.1 /
  // G.1 in docs/dev/TODAY_VS_SCHEDULE_CONCEPTUAL_AUDIT.md.
  const handleForwardArrow = useCallback(() => {
    const nextDate = addDays(selectedDate, 1);
    if (scheduleScopeEnabled && nextDate > today) {
      handleScopeChange('schedule');
      setScheduleFilter({
        selectedPills: ['other'],
        otherRange: { from: nextDate, to: nextDate },
      });
      const params = new URLSearchParams(searchParams.toString());
      params.delete('date');
      params.set('sched_pills', 'other');
      params.set('sched_from', nextDate);
      params.set('sched_to', nextDate);
      const qs = params.toString();
      router.push(`/pos/jobs${qs ? `?${qs}` : ''}`, { scroll: false });
      return;
    }
    setDate(nextDate);
  }, [handleScopeChange, router, scheduleScopeEnabled, searchParams, selectedDate, setDate, today]);

  // Mark a job as locally updated (skip highlight animation on next poll)
  const markLocalUpdate = useCallback((jobId: string) => {
    localUpdatesRef.current.set(jobId, Date.now());
  }, []);

  const fetchJobs = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // Session 2.4 (AC-7) — `include_terminal=1` flips the Today endpoint to
      // surface cancelled jobs AND terminal-state un-started appointments.
      const terminalQs = includeTerminal ? '&include_terminal=1' : '';
      const res = await posFetch(`/api/pos/jobs?filter=${filter}&date=${date}${terminalQs}`);
      if (res.ok) {
        const payload = (await res.json()) as {
          data?: JobListItem[];
          unstarted_appointments?: PosUnstartedAppointment[];
        };
        const newJobs = payload.data ?? [];
        setJobs(newJobs);
        // Session 2.2 — surface un-started appointments alongside jobs. Defaults
        // to [] when the server omits the field (older clients / past-date
        // requests / pre-Session-2.2 deployments).
        setUnstartedAppointments(payload.unstarted_appointments ?? []);
        // Initialize snapshot for change detection
        const snapshot = JSON.stringify(newJobs.map((j: JobListItem) => j.id).sort());
        prevJobsRef.current = snapshot;
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, includeTerminal]);

  // Silent poll — no loading spinner, with change detection
  const pollJobs = useCallback(async () => {
    // Phase 1B: the Schedule scope does not poll the jobs list (defense in
    // depth — also gated at the interval/visibility effects).
    if (scopeRef.current !== 'today') return;
    if (document.visibilityState !== 'visible') return;
    if (timelineInteracting) return;

    try {
      const terminalQs = includeTerminal ? '&include_terminal=1' : '';
      const res = await posFetch(`/api/pos/jobs?filter=${filter}&date=${selectedDate}${terminalQs}`);
      if (!res.ok) {
        failCountRef.current++;
        if (failCountRef.current >= 3) setPollStatus('error');
        return;
      }

      failCountRef.current = 0;
      setPollStatus('ok');
      setLastPollAt(Date.now());

      const payload = (await res.json()) as {
        data?: JobListItem[];
        unstarted_appointments?: PosUnstartedAppointment[];
      };
      const newJobs: JobListItem[] = payload.data ?? [];
      // Session 2.2 — keep un-started in sync with each poll. No
      // change-detection animation needed: appointment cards either appear,
      // disappear (after Start Intake), or unchanged — a plain replace is
      // sufficient (the jobs list carries the visual-highlight semantics).
      setUnstartedAppointments(payload.unstarted_appointments ?? []);

      // Build a comparable snapshot — sort by ID, include key fields
      const makeKey = (j: JobListItem) =>
        `${j.id}|${j.status}|${j.assigned_staff?.id || ''}|${j.appointment?.scheduled_start_time || ''}`;
      const newSnapshot = JSON.stringify(newJobs.map(makeKey).sort());
      const oldSnapshot = prevJobsRef.current;

      if (newSnapshot === oldSnapshot) return; // No changes — skip state update

      // Detect which jobs changed for highlight animation
      const oldMap = new Map<string, string>();
      // Reconstruct old keys from current jobs state
      for (const j of jobs) {
        oldMap.set(j.id, makeKey(j));
      }

      const now = Date.now();
      const changed = new Set<string>();
      for (const j of newJobs) {
        const oldKey = oldMap.get(j.id);
        const newKey = makeKey(j);
        if (!oldKey) {
          // New job appeared
          const wasLocal = localUpdatesRef.current.get(j.id);
          if (!wasLocal || now - wasLocal > 15_000) changed.add(j.id);
        } else if (oldKey !== newKey) {
          // Job changed — skip if locally updated recently
          const wasLocal = localUpdatesRef.current.get(j.id);
          if (!wasLocal || now - wasLocal > 15_000) changed.add(j.id);
        }
      }

      // Clean up stale local update markers (>30s old)
      for (const [id, ts] of localUpdatesRef.current) {
        if (now - ts > 30_000) localUpdatesRef.current.delete(id);
      }

      prevJobsRef.current = newSnapshot;
      setJobs(newJobs);

      if (changed.size > 0) {
        setHighlightedJobs(changed);
        setTimeout(() => setHighlightedJobs(new Set()), 1500);
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 3) setPollStatus('error');
    }
  }, [filter, includeTerminal, selectedDate, timelineInteracting, jobs]);

  // Polling interval
  useEffect(() => {
    if (effectiveScope !== 'today') return; // Schedule scope is not live-polled.
    const interval = diff < 0 ? POLL_MS_PAST : POLL_MS_ACTIVE;
    const id = setInterval(pollJobs, interval);
    return () => clearInterval(id);
  }, [pollJobs, diff, effectiveScope]);

  // Fetch immediately when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !timelineInteracting) {
        pollJobs();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pollJobs, timelineInteracting]);

  // Schedule scope data source (Item 15e Phase 1B). PURE READ — never
  // materializes jobs. Window derived from the date-pill selection via
  // `computeScheduleDateRange` (N+1 Session #148); helper mirrors the
  // server's X1 future-only floor + X3 31-day ceiling.
  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const { from, to } = computeScheduleDateRange(
        scheduleFilter.selectedPills,
        scheduleFilter.otherRange,
        getTodayPst()
      );
      // Session 2.4 (AC-7) — schedule endpoint same toggle, same URL key.
      const terminalQs = includeTerminal ? '&include_terminal=1' : '';
      const res = await posFetch(`/api/pos/jobs/schedule?from=${from}&to=${to}${terminalQs}`);
      if (res.ok) {
        const { data } = await res.json();
        setScheduleEntries(data ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch schedule:', err);
    } finally {
      setScheduleLoading(false);
    }
  }, [scheduleFilter.selectedPills, scheduleFilter.otherRange, includeTerminal]);

  // ─── Item 15e Phase 2B — Schedule card tap → fetch → mount dialog ──────────
  // Mirrors the change-time-button.tsx template (Rule 11 reuse): parallel-fetch
  // the full appointment + bookable staff, then mount the reused dialog. All
  // fetches go through posFetch (401 → session-expiry redirect).
  const handleScheduleCardTap = useCallback(async (id: string) => {
    setSelectedAppointmentId(id);
    setLoadingAppointment(true);
    try {
      const [apptRes, staffRes] = await Promise.all([
        posFetch(`/api/pos/appointments/${id}`),
        posFetch('/api/pos/staff/available'),
      ]);
      if (!apptRes.ok) {
        const err = await apptRes.json().catch(() => ({}));
        toast.error(err.error || 'Failed to load appointment');
        setSelectedAppointmentId(null);
        return;
      }
      const { data } = await apptRes.json();
      setSelectedAppointment(data);
      if (staffRes.ok) {
        const { data: staffData } = await staffRes.json();
        setDetailEmployees(staffData ?? []);
      } else {
        setDetailEmployees([]);
      }
    } catch (err) {
      console.error('Failed to load appointment:', err);
      toast.error('Failed to load appointment');
      setSelectedAppointmentId(null);
    } finally {
      setLoadingAppointment(false);
    }
  }, []);

  const closeDetailDialog = useCallback(() => {
    setSelectedAppointmentId(null);
    setSelectedAppointment(null);
    setDetailEmployees([]);
  }, []);

  // onSave → the combined POS PATCH (Phase 2A). Returns true on success so the
  // dialog closes itself; the webhook firing happens server-side. On success we
  // also refetch the Schedule list so the card reflects the new status/time.
  const handleSaveAppointment = useCallback(
    async (id: string, data: AppointmentUpdateInput): Promise<boolean> => {
      try {
        const res = await posFetch(`/api/pos/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || 'Failed to save appointment');
          return false;
        }
        closeDetailDialog();
        await fetchSchedule();
        toast.success('Appointment updated');
        return true;
      } catch (err) {
        console.error('Failed to save appointment:', err);
        toast.error('Failed to save appointment');
        return false;
      }
    },
    [fetchSchedule, closeDetailDialog]
  );

  // onCancel → close the detail dialog, open the POS cancel dialog. The dialog
  // passes back the appointment it was mounted with (AppointmentWithRelations);
  // it is assignable to PosAppointment (the cancel dialog's prop type).
  const handleCancelAppointment = useCallback(
    (appointment: AppointmentWithRelations) => {
      setSelectedAppointmentId(null);
      setSelectedAppointment(null);
      setDetailEmployees([]);
      setCancelTarget(appointment);
    },
    []
  );

  // Init: fetch on mount and when date / scope changes. Session 2.5 retired
  // populate — Today endpoint now natively returns materialized jobs PLUS
  // un-started appointments for today (Session 2.2's `unstarted_appointments`
  // payload field), so `fetchJobs` alone covers what `populate + fetchJobs`
  // used to. Schedule scope branch is unchanged from Item 15e Phase 1B.
  useEffect(() => {
    async function init() {
      if (effectiveScope === 'schedule') {
        await fetchSchedule();
        return;
      }
      await fetchJobs(selectedDate);
    }
    init();
  }, [selectedDate, effectiveScope, fetchJobs, fetchSchedule]);

  // Sort by status priority
  const sortedJobs = useMemo(() =>
    [...jobs].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)),
  [jobs]);

  // N+2 (Session #149) — client-side filter over the server's date-window
  // fetch. AND across categories per audit D.6; helper at
  // `lib/utils/schedule-entry-matches.ts` encapsulates the per-row predicate
  // (incl. OR-within-search across first/last/phone/make/model).
  const filteredScheduleEntries = useMemo(
    () =>
      scheduleEntries.filter((entry) =>
        entryMatchesFilters(entry, {
          search: debouncedSearch,
          status: statusFilter || null,
          detailerId: detailerFilter || null,
        })
      ),
    [scheduleEntries, debouncedSearch, statusFilter, detailerFilter]
  );

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
          {/* Session 2.5 — Refresh re-fetches the active scope's endpoint.
              Schedule scope: pure read of upcoming appointments. Today scope:
              re-fetches /api/pos/jobs which natively returns jobs +
              un-started appointments (Session 2.2). Pre-2.5 the Today branch
              also triggered populate via `populateFromAppointments`; that
              path retired with AC-3. The pre-2.5 `disabled={populating}` +
              spin state tracked populate's in-flight window; post-2.5 a
              click triggers an idempotent re-fetch — double-click is benign,
              and the existing `loading` / `scheduleLoading` body indicators
              cover visible-progress UX. */}
          <button
            onClick={() => {
              if (effectiveScope === 'schedule') {
                fetchSchedule();
                return;
              }
              fetchJobs(selectedDate);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
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

      {/* Scope toggle (Item 15e Phase 1B — flag-gated; mirrors the view-mode toggle) */}
      {scheduleScopeEnabled && (
        <div className="flex items-center justify-center gap-1 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-1.5">
          <button
            onClick={() => handleScopeChange('today')}
            className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              effectiveScope === 'today'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Today
          </button>
          <button
            onClick={() => handleScopeChange('schedule')}
            className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              effectiveScope === 'schedule'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Schedule
          </button>
        </div>
      )}

      {/* Today-scope chrome — date nav, summary, filters, view toggle. Hidden in
          Schedule scope (which shows a 30-day range, not a single day). When the
          flag is OFF, effectiveScope is always 'today' so this renders unchanged. */}
      {effectiveScope === 'today' && (
      <>
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
            <span className={cn(
              'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
              pollStatus === 'ok' ? 'bg-green-500' : 'bg-amber-500'
            )} />
            {formatDateLabel(selectedDate)}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        {!isToday && (
          <button
            onClick={() => setDate(today)}
            className="rounded-lg bg-blue-600 dark:bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Today
          </button>
        )}

        <button
          onClick={handleForwardArrow}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700"
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
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
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2">
        {(['all', 'mine', 'unassigned'] as const)
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
        {/* Session 2.4 (AC-7) — terminal-state opt-in. Scope-shared toggle:
            URL-persistent via `?include_terminal=1`. Adds cancelled jobs +
            terminal-state un-started appointments (cancelled/completed/no_show)
            to the visible list. Off by default per AC-7. */}
        <button
          type="button"
          role="switch"
          aria-checked={includeTerminal}
          data-testid="include-terminal-toggle-today"
          onClick={() => handleIncludeTerminalChange(!includeTerminal)}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            includeTerminal
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
        >
          <Archive className="h-3.5 w-3.5" />
          {includeTerminal ? 'Showing terminal' : 'Show terminal'}
        </button>
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
      </>
      )}

      {/* Content area */}
      {effectiveScope === 'schedule' ? (
        <>
          {/* Schedule filter bar — fixed above the list per F.4. Three rows:
              Row 1 search (N+2), Row 2 date pills (N+1), Row 3 status +
              detailer (N+2). */}
          <div
            data-testid="schedule-filter-bar"
            className="space-y-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3"
          >
            {/* Row 1 — debounced search across customer/vehicle (N+2). */}
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search by customer or vehicle..."
              className="h-11"
              aria-label="Filter schedule by customer or vehicle"
            />
            {/* Row 2 — date pills (N+1). */}
            <SchedulePillRow
              selectedPills={scheduleFilter.selectedPills}
              otherRange={scheduleFilter.otherRange}
              todayYmd={today}
              onChange={handleScheduleFilterChange}
            />
            {/* Row 3 — status + detailer dropdowns (N+2). h-11 touch sizing
                matches the search input. Wraps to stack vertically below sm.  */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 flex-1"
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {/* X2 LOCKED — by default only 3 valid Schedule statuses (server
                    excludes cancelled/completed/no_show). Session 2.4 (AC-7):
                    when the terminal-state toggle is on, the three terminal
                    options are appended so the status filter can narrow into
                    just-cancelled or just-completed views. */}
                <option value="pending">{APPOINTMENT_STATUS_LABELS.pending}</option>
                <option value="confirmed">{APPOINTMENT_STATUS_LABELS.confirmed}</option>
                <option value="in_progress">{APPOINTMENT_STATUS_LABELS.in_progress}</option>
                {includeTerminal && (
                  <>
                    <option value="cancelled">{APPOINTMENT_STATUS_LABELS.cancelled}</option>
                    <option value="completed">{APPOINTMENT_STATUS_LABELS.completed}</option>
                    <option value="no_show">{APPOINTMENT_STATUS_LABELS.no_show}</option>
                  </>
                )}
              </Select>
              <Select
                value={detailerFilter}
                onChange={(e) => setDetailerFilter(e.target.value)}
                className="h-11 flex-1"
                aria-label="Filter by detailer"
                disabled={availableDetailers === null}
              >
                <option value="">All Detailers</option>
                <option value="unassigned">Unassigned</option>
                {detailersError && (
                  <option value="" disabled>
                    Failed to load detailers
                  </option>
                )}
                {(availableDetailers ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                  </option>
                ))}
              </Select>
            </div>
            {/* Session 2.4 (AC-7) — terminal-state toggle, scope-shared. Same
                URL key + handler as the Today chrome; toggling either surface
                updates the other on the next mount. */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                role="switch"
                aria-checked={includeTerminal}
                data-testid="include-terminal-toggle-schedule"
                onClick={() => handleIncludeTerminalChange(!includeTerminal)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  includeTerminal
                    ? 'bg-blue-600 dark:bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                {includeTerminal ? 'Showing terminal' : 'Show terminal'}
              </button>
            </div>
          </div>
          <ScheduleScopeList
            entries={filteredScheduleEntries}
            loading={scheduleLoading}
            onSelectAppointment={handleScheduleCardTap}
            busyAppointmentId={loadingAppointment ? selectedAppointmentId : null}
          />
        </>
      ) : (
        <>
          {/* Session 2.2 (AC-3 second half) — un-started today appointments
              strip. Rendered above BOTH timeline + list views so an operator
              on either default mode sees the cards. Suppressed when empty so
              there's no visual noise on a quiet day. Suppressed for past dates
              too — the server omits the field unless `targetDate === today_pst`,
              so the empty default doubles as the past-date suppression. */}
          {isToday && unstartedAppointments.length > 0 && (
            <div
              data-testid="unstarted-strip"
              className="border-b border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-950/20 px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  Not Started — Confirmed for today
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {unstartedAppointments.length} appointment{unstartedAppointments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {unstartedAppointments.map((apt) => (
                  <UnstartedAppointmentCard
                    key={apt.id}
                    appointment={apt}
                    onMaterialized={() => {
                      // Refresh the Today scope so the new job replaces this
                      // card. Mirrors the existing Refresh-button path; the
                      // localUpdates marker suppresses the highlight animation
                      // (the operator just authored the materialization, no
                      // need to draw attention to the resulting job card).
                      markLocalUpdate(`__intake_${apt.id}__`);
                      fetchJobs(selectedDate);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {viewMode === 'timeline' ? (
        <JobTimeline
          jobs={sortedJobs}
          loading={loading}
          selectedDate={selectedDate}
          isToday={isToday}
          filter={filter}
          onSelectJob={onSelectJob}
          onCheckout={onCheckout}
          onRefresh={() => { markLocalUpdate('__refresh__'); fetchJobs(selectedDate); }}
          onInteractionChange={setTimelineInteracting}
          highlightedJobs={highlightedJobs}
          onLocalUpdate={markLocalUpdate}
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

              // Session 2.4 (AC-7) — mute cancelled jobs so the toggle-surfaced
              // entries read visually as review/recovery candidates, not
              // active work. Completed/closed jobs were already in the default
              // Today view; muting them would change unrelated UX.
              const isTerminalCard = job.status === 'cancelled';
              return (
                <div
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectJob(job.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectJob(job.id); } }}
                  className={cn(
                    'w-full cursor-pointer rounded-lg border bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-all hover:shadow-md dark:hover:shadow-gray-950/40 active:bg-gray-50 dark:active:bg-gray-800',
                    highlightedJobs.has(job.id)
                      ? 'border-blue-400 dark:border-blue-500 ring-1 ring-blue-400/50 dark:ring-blue-500/30'
                      : 'border-gray-200 dark:border-gray-700',
                    isTerminalCard && 'opacity-60'
                  )}
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
        </>
      )}
      {/* Item 15e Phase 2B — Schedule-scope detail dialog. The reused admin
          AppointmentDetailDialog with POS context props. Only reachable in
          Schedule scope (flag-gated); admin behavior is unaffected because the
          admin parent never passes these props. */}
      {selectedAppointment && (
        <AppointmentDetailDialog
          open={selectedAppointmentId !== null}
          onOpenChange={(open) => {
            if (!open) closeDetailDialog();
          }}
          appointment={selectedAppointment}
          employees={detailEmployees}
          onSave={handleSaveAppointment}
          onCancel={handleCancelAppointment}
          canReschedule={canReschedule}
          canCancel={canCancel}
          canAddNotes={canAddNotes}
          canUpdateStatus={canUpdateStatus}
          hostContext="pos"
          returnToPath="/pos/jobs"
        />
      )}

      {/* Item 15e Phase 2B — POS cancel dialog (Item 15b), opened from the
          detail dialog's onCancel handoff. */}
      {cancelTarget && (
        <CancelAppointmentDialog
          open
          appointment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={async () => {
            setCancelTarget(null);
            await fetchSchedule();
          }}
        />
      )}
    </div>
  );
}

// ─── Item 15e Phase 1B / 2B — Schedule scope list ────────────────────────────
// Renders upcoming appointments (PosScheduleEntry) in the same card visual
// language as the Today job list. Phase 2B: a tap fetches the full appointment
// and opens the reused detail dialog (was a placeholder toast in Phase 1B).
// Each card carries an appointment-status pill. No job-specific chrome (timer,
// photos, addons, checkout) since these are not yet materialized jobs.

interface ScheduleScopeListProps {
  entries: PosScheduleEntry[];
  loading: boolean;
  onSelectAppointment: (id: string) => void;
  // Item 15e Phase 2B — the appointment currently being fetched (tap → load),
  // so its card can show a loading affordance. null when idle.
  busyAppointmentId: string | null;
}

function ScheduleScopeList({ entries, loading, onSelectAppointment, busyAppointmentId }: ScheduleScopeListProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50 dark:bg-gray-800 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 py-16 text-gray-500 dark:text-gray-400">
        <Calendar className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-500" />
        <p className="text-sm font-medium">No upcoming appointments</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">The next 30 days are clear.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4">
      <div className="space-y-2">
        {entries.map((entry) => {
          const serviceNames = entry.appointment_services
            .map((s) => s.service?.name)
            .filter(Boolean)
            .join(', ');
          const serviceTotal = Number(entry.total_amount ?? 0);
          const time = formatTime12h(entry.scheduled_start_time);
          const dateLabel = new Date(entry.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          const isBusy = busyAppointmentId === entry.id;
          // Session 2.4 (AC-7) — mute terminal-state appointments so they read
          // visually as review/recovery candidates, not actionable bookings.
          const isTerminal = TERMINAL_APPT_STATUSES.has(entry.status);
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              aria-busy={isBusy}
              onClick={() => onSelectAppointment(entry.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAppointment(entry.id); } }}
              className={cn(
                'w-full cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-all hover:shadow-md dark:hover:shadow-gray-950/40 active:bg-gray-50 dark:active:bg-gray-800',
                isBusy && 'opacity-60 pointer-events-none',
                isTerminal && !isBusy && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {entry.customer
                      ? `${entry.customer.first_name} ${entry.customer.last_name}`
                      : 'Unknown Customer'}
                  </span>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{formatVehicle(entry.vehicle)}</p>
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
                <div className="ml-3 flex flex-col items-end gap-1">
                  {/* Item 15e Phase 2B — appointment-status pill (pending = amber, etc.) */}
                  <span className={getAppointmentStatusPillClasses(entry.status)}>
                    {APPOINTMENT_STATUS_LABELS[entry.status] ?? entry.status}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    <Calendar className="h-3 w-3" />
                    Schedule
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {dateLabel}{time ? ` · ${time}` : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
