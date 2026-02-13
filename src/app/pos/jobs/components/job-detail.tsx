'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatPhone } from '@/lib/utils/format';
import {
  ArrowLeft,
  User,
  Clock,
  Wrench,
  Bell,
  Camera,
  Play,
  CheckCircle2,
  Image as ImageIcon,
  AlertTriangle,
  RotateCcw,
  Send,
  XCircle,
  ChevronRight,
  Check,
  X,
  Calendar,
  Footprints,
  Pencil,
  Car,
  FileText,
  Search,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { usePosAuth } from '../../context/pos-auth-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import { ZonePicker } from './zone-picker';
import { JobTimer } from './job-timer';
import { FlagIssueFlow } from './flag-issue-flow';
import { CustomerLookup } from '../../components/customer-lookup';
import type { JobStatus, JobAddonStatus, Customer, JobServiceSnapshot } from '@/lib/supabase/types';

type ZonePickerMode = 'intake' | 'completion' | 'progress' | null;

interface AddonData {
  id: string;
  status: JobAddonStatus;
  service_id: string | null;
  product_id: string | null;
  custom_description: string | null;
  price: number;
  discount_amount: number;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  pickup_delay_minutes: number;
  message_to_customer: string | null;
  customer_notified_via: string[];
}

interface JobDetailData {
  id: string;
  status: JobStatus;
  appointment_id: string | null;
  services: { id: string; name: string; price: number }[];
  estimated_pickup_at: string | null;
  actual_pickup_at: string | null;
  created_at: string;
  work_started_at: string | null;
  work_completed_at: string | null;
  timer_seconds: number;
  timer_paused_at: string | null;
  intake_started_at: string | null;
  intake_completed_at: string | null;
  intake_notes: string | null;
  pickup_notes: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    size_class: string | null;
  } | null;
  assigned_staff: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  addons: AddonData[] | null;
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

const ADDON_STATUS_CONFIG: Record<JobAddonStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-orange-100 text-orange-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-gray-100 text-gray-600' },
};

const CANCELLATION_REASONS = [
  'Customer no-show',
  'Created by mistake',
  'Customer changed mind',
  'Schedule conflict',
  'Other',
] as const;

const ADMIN_ROLES = ['super_admin', 'admin'];

interface AvailableStaffer {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  job_count_today: number;
  is_busy: boolean;
}

// Default minimums — overridden by business_settings fetched at runtime
const DEFAULT_MIN_EXTERIOR = 4;
const DEFAULT_MIN_INTERIOR = 2;

function formatDateTime(dt: string | null): string {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  } catch {
    return '—';
  }
}

function formatTime(dt: string | null): string {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  } catch {
    return '—';
  }
}

function formatVehicle(v: JobDetailData['vehicle']): string {
  if (!v) return 'No vehicle';
  const parts = [v.year, v.make, v.model].filter(Boolean);
  const desc = parts.length > 0 ? parts.join(' ') : 'Vehicle';
  return v.color ? `${v.color} ${desc}` : desc;
}

function timeAgo(dt: string | null): string {
  if (!dt) return '';
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
}

export function JobDetail({ jobId, onBack }: JobDetailProps) {
  const { employee } = usePosAuth();
  const { granted: canManageJobs } = usePosPermission('pos.jobs.manage');
  const { granted: canCancelJobs } = usePosPermission('pos.jobs.cancel');
  const { granted: canFlagIssue } = usePosPermission('pos.jobs.flag_issue');
  const [job, setJob] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingIntake, setStartingIntake] = useState(false);
  const [startingWork, setStartingWork] = useState(false);
  const [zonePickerMode, setZonePickerMode] = useState<ZonePickerMode>(null);
  const [showFlagIssue, setShowFlagIssue] = useState(false);
  const [showPickupDialog, setShowPickupDialog] = useState(false);
  const [pickupNotes, setPickupNotes] = useState('');
  const [pickingUp, setPickingUp] = useState(false);
  const [resendingAddon, setResendingAddon] = useState<string | null>(null);
  const [minExterior, setMinExterior] = useState(DEFAULT_MIN_EXTERIOR);
  const [minInterior, setMinInterior] = useState(DEFAULT_MIN_INTERIOR);
  const [completionMinExterior, setCompletionMinExterior] = useState(DEFAULT_MIN_EXTERIOR);
  const [completionMinInterior, setCompletionMinInterior] = useState(DEFAULT_MIN_INTERIOR);

  // Cancellation state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);

  // Reassignment state
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [availableStaff, setAvailableStaff] = useState<AvailableStaffer[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  // Edit state
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);
  const [editVehicles, setEditVehicles] = useState<{ id: string; year: number | null; make: string | null; model: string | null; color: string | null }[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [showEditServices, setShowEditServices] = useState(false);
  const [allServices, setAllServices] = useState<{ id: string; name: string; flat_price: number | null; pricing_model: string; pricing?: { tier_name: string; price: number }[] }[]>([]);
  const [editSelectedServices, setEditSelectedServices] = useState<JobServiceSnapshot[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}`);
      if (res.ok) {
        const { data } = await res.json();
        setJob(data);
      }
    } catch (err) {
      console.error('Failed to fetch job:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Fetch minimum photo settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await posFetch('/api/pos/jobs/settings');
        if (res.ok) {
          const { data } = await res.json();
          if (data.min_intake_photos_exterior) setMinExterior(Number(data.min_intake_photos_exterior));
          if (data.min_intake_photos_interior) setMinInterior(Number(data.min_intake_photos_interior));
          if (data.min_completion_photos_exterior) setCompletionMinExterior(Number(data.min_completion_photos_exterior));
          if (data.min_completion_photos_interior) setCompletionMinInterior(Number(data.min_completion_photos_interior));
        }
      } catch {
        // Use defaults
      }
    }
    fetchSettings();
  }, []);

  // Expire stale pending addons on load
  useEffect(() => {
    if (!job?.addons) return;
    const now = Date.now();
    const stale = job.addons.filter(
      (a) => a.status === 'pending' && a.expires_at && new Date(a.expires_at).getTime() < now
    );
    if (stale.length > 0) {
      // Refresh from server which will expire them
      posFetch(`/api/pos/jobs/${jobId}/addons`).then(() => fetchJob());
    }
  }, [job?.addons, jobId, fetchJob]);

  async function handleStartIntake() {
    setStartingIntake(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'intake',
          intake_started_at: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setJob(data);
        setZonePickerMode('intake');
      }
    } catch (err) {
      console.error('Failed to start intake:', err);
    } finally {
      setStartingIntake(false);
    }
  }

  async function handleStartWork() {
    setStartingWork(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/start-work`, {
        method: 'POST',
      });
      if (res.ok) {
        const { data } = await res.json();
        setJob(data);
      }
    } catch (err) {
      console.error('Failed to start work:', err);
    } finally {
      setStartingWork(false);
    }
  }

  async function handleResendAddon(addonId: string) {
    setResendingAddon(addonId);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/addons/${addonId}/resend`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchJob();
      }
    } catch (err) {
      console.error('Failed to resend addon:', err);
    } finally {
      setResendingAddon(null);
    }
  }

  function handleZonePickerComplete() {
    setZonePickerMode(null);
    fetchJob();
  }

  function handleTimerUpdate(data: Record<string, unknown>) {
    setJob(data as unknown as JobDetailData);
  }

  function handleFlagIssueComplete() {
    setShowFlagIssue(false);
    fetchJob();
  }

  async function handlePickup() {
    setPickingUp(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: pickupNotes }),
      });
      if (res.ok) {
        setShowPickupDialog(false);
        setPickupNotes('');
        fetchJob();
      }
    } catch (err) {
      console.error('Failed to mark pickup:', err);
    } finally {
      setPickingUp(false);
    }
  }

  // Reassignment handlers
  async function handleOpenReassign() {
    setShowReassignModal(true);
    setLoadingStaff(true);
    try {
      const res = await posFetch('/api/pos/staff/available');
      if (res.ok) {
        const { data } = await res.json();
        setAvailableStaff(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
      toast.error('Failed to load staff list');
    } finally {
      setLoadingStaff(false);
    }
  }

  async function handleReassign(staffId: string | null) {
    setReassigning(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_staff_id: staffId }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setJob(data);
        setShowReassignModal(false);
        toast.success(staffId ? 'Detailer reassigned' : 'Assignment removed');
      } else {
        toast.error('Failed to reassign');
      }
    } catch {
      toast.error('Failed to reassign');
    } finally {
      setReassigning(false);
    }
  }

  // Determine if job fields are editable
  const isEditable = canManageJobs && job != null && !['completed', 'closed', 'cancelled'].includes(job.status);

  async function handlePatchJob(updates: Record<string, unknown>) {
    setSavingEdit(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const { data } = await res.json();
        setJob(data);
        toast.success('Job updated');
        return true;
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update job');
        return false;
      }
    } catch {
      toast.error('Failed to update job');
      return false;
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleEditCustomerSelect(customer: Customer) {
    const ok = await handlePatchJob({ customer_id: customer.id, vehicle_id: null });
    if (ok) setShowEditCustomer(false);
  }

  async function handleOpenEditVehicle() {
    if (!job?.customer) return;
    setShowEditVehicle(true);
    setLoadingVehicles(true);
    try {
      const res = await posFetch(`/api/pos/customers/${job.customer.id}/vehicles`);
      if (res.ok) {
        const { data } = await res.json();
        setEditVehicles(data ?? []);
      }
    } catch {
      toast.error('Failed to load vehicles');
    } finally {
      setLoadingVehicles(false);
    }
  }

  async function handleEditVehicleSelect(vehicleId: string | null) {
    const ok = await handlePatchJob({ vehicle_id: vehicleId });
    if (ok) setShowEditVehicle(false);
  }

  async function handleOpenEditServices() {
    if (!job) return;
    setShowEditServices(true);
    setEditSelectedServices([...job.services]);
    setServiceSearch('');
    setLoadingServices(true);
    try {
      const res = await posFetch('/api/pos/services');
      if (res.ok) {
        const { data } = await res.json();
        setAllServices(data ?? []);
      }
    } catch {
      toast.error('Failed to load services');
    } finally {
      setLoadingServices(false);
    }
  }

  function handleToggleEditService(svc: JobServiceSnapshot) {
    setEditSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === svc.id);
      if (exists) return prev.filter((s) => s.id !== svc.id);
      return [...prev, svc];
    });
  }

  function getServicePrice(svc: { flat_price: number | null; pricing?: { tier_name: string; price: number }[] }): number {
    if (svc.flat_price != null) return Number(svc.flat_price);
    if (svc.pricing && svc.pricing.length > 0) return Number(svc.pricing[0].price);
    return 0;
  }

  async function handleSaveEditServices() {
    if (editSelectedServices.length === 0) return;
    const ok = await handlePatchJob({ services: editSelectedServices });
    if (ok) setShowEditServices(false);
  }

  function handleStartEditNotes() {
    setNotesValue(job?.intake_notes || '');
    setEditingNotes(true);
  }

  async function handleSaveNotes() {
    const ok = await handlePatchJob({ intake_notes: notesValue.trim() || null });
    if (ok) setEditingNotes(false);
  }

  // Determine if cancel button should be visible (permission-gated)
  const canCancel = (() => {
    if (!job || !employee) return false;
    const { status } = job;
    if (['completed', 'closed', 'cancelled'].includes(status)) return false;
    const isEarly = ['scheduled', 'intake'].includes(status);
    if (isEarly) return canCancelJobs;
    // in_progress or pending_approval: admin only
    return ADMIN_ROLES.includes(employee.role);
  })();

  function handleCancelClick() {
    setCancelReason('');
    setCustomReason('');
    setShowCancelDialog(true);
  }

  async function handleCancelConfirm() {
    if (!job) return;
    const reason = cancelReason === 'Other' ? customReason.trim() : cancelReason;
    if (!reason) return;

    // If appointment-based, show notification dialog instead of cancelling immediately
    if (job.appointment_id) {
      setShowCancelDialog(false);
      setNotifySuccess(false);
      setShowNotifyDialog(true);
      return;
    }

    // Walk-in: silent cancel
    setCancelling(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success('Job cancelled');
        onBack();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to cancel job');
      }
    } catch {
      toast.error('Failed to cancel job');
    } finally {
      setCancelling(false);
      setShowCancelDialog(false);
    }
  }

  async function handleCancelWithNotify(method: SendMethod) {
    if (!job) return;
    const reason = cancelReason === 'Other' ? customReason.trim() : cancelReason;
    if (!reason) return;

    setNotifySending(true);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notify_method: method }),
      });
      if (res.ok) {
        setNotifySuccess(true);
        toast.success('Job cancelled \u2014 customer notified');
        setTimeout(() => {
          setShowNotifyDialog(false);
          onBack();
        }, 1200);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to cancel job');
      }
    } catch {
      toast.error('Failed to cancel job');
    } finally {
      setNotifySending(false);
    }
  }

  // Show zone picker (intake or completion flow)
  if (zonePickerMode && job) {
    const isCompletion = zonePickerMode === 'completion';
    return (
      <ZonePicker
        jobId={jobId}
        phase={isCompletion ? 'completion' : (job.status === 'intake' ? 'intake' : 'progress')}
        minExterior={isCompletion ? completionMinExterior : minExterior}
        minInterior={isCompletion ? completionMinInterior : minInterior}
        onComplete={handleZonePickerComplete}
        onBack={() => setZonePickerMode(null)}
        isCompletionFlow={isCompletion}
      />
    );
  }

  // Show flag issue flow
  if (showFlagIssue && job) {
    return (
      <FlagIssueFlow
        jobId={jobId}
        job={job}
        onComplete={handleFlagIssueComplete}
        onBack={() => setShowFlagIssue(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-gray-500">Job not found</p>
        <button onClick={onBack} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to queue
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[job.status];
  const servicesTotal = job.services.reduce((sum, s) => sum + s.price, 0);
  const allAddons = job.addons ?? [];
  const pendingAddons = allAddons.filter((a) => a.status === 'pending');
  const approvedAddons = allAddons.filter((a) => a.status === 'approved');
  const declinedAddons = allAddons.filter((a) => a.status === 'declined');
  const expiredAddons = allAddons.filter((a) => a.status === 'expired');

  const showTimer = job.status === 'in_progress' && (job.work_started_at || job.timer_paused_at);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-gray-900">
                {job.customer
                  ? `${job.customer.first_name} ${job.customer.last_name}`
                  : 'Unknown Customer'}
              </h1>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  job.appointment_id
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-amber-100 text-amber-700'
                )}
              >
                {job.appointment_id ? (
                  <><Calendar className="h-3 w-3" />Appointment</>
                ) : (
                  <><Footprints className="h-3 w-3" />Walk-In</>
                )}
              </span>
              <span
                className={cn(
                  'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  statusConfig.color
                )}
              >
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-gray-500">{formatVehicle(job.vehicle)}</p>
          </div>
        </div>

        {/* Timer in header */}
        {showTimer && (
          <div className="mt-2">
            <JobTimer
              jobId={jobId}
              timerSeconds={job.timer_seconds}
              workStartedAt={job.work_started_at}
              timerPausedAt={job.timer_paused_at ?? null}
              onUpdate={handleTimerUpdate}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="space-y-3">
          {/* Intake completed banner */}
          {job.status === 'intake' && job.intake_completed_at && !job.work_started_at && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Intake complete — ready to start work</span>
            </div>
          )}

          {/* Assigned Staff — tappable for users with pos.jobs.manage */}
          {canManageJobs && !['completed', 'closed', 'cancelled'].includes(job.status) ? (
            <button
              onClick={handleOpenReassign}
              className="w-full rounded-lg bg-white p-3 text-left shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <User className="h-4 w-4" />
                    <span>Assigned Detailer</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900">
                    {job.assigned_staff
                      ? `${job.assigned_staff.first_name} ${job.assigned_staff.last_name}`
                      : 'Unassigned'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          ) : (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <User className="h-4 w-4" />
                <span>Assigned Detailer</span>
              </div>
              <p className="mt-1 font-medium text-gray-900">
                {job.assigned_staff
                  ? `${job.assigned_staff.first_name} ${job.assigned_staff.last_name}`
                  : 'Unassigned'}
              </p>
            </div>
          )}

          {/* Services */}
          {isEditable ? (
            <button
              onClick={handleOpenEditServices}
              className="w-full rounded-lg bg-white p-3 text-left shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Wrench className="h-4 w-4" />
                  <span>Services</span>
                </div>
                <Pencil className="h-4 w-4 text-gray-400" />
              </div>
              <div className="mt-2 space-y-1">
                {job.services.map((svc) => (
                  <div key={svc.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{svc.name}</span>
                    <span className="text-gray-600">${svc.price.toFixed(2)}</span>
                  </div>
                ))}
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="text-gray-700">Total</span>
                    <span className="text-gray-900">${servicesTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Wrench className="h-4 w-4" />
                <span>Services</span>
              </div>
              <div className="mt-2 space-y-1">
                {job.services.map((svc) => (
                  <div key={svc.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{svc.name}</span>
                    <span className="text-gray-600">${svc.price.toFixed(2)}</span>
                  </div>
                ))}
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="text-gray-700">Total</span>
                    <span className="text-gray-900">${servicesTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timing */}
          <div className="rounded-lg bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Timing</span>
            </div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-900">{formatDateTime(job.created_at)}</span>
              </div>
              {job.estimated_pickup_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Est. Pickup</span>
                  <span className="text-gray-900">{formatTime(job.estimated_pickup_at)}</span>
                </div>
              )}
              {job.intake_started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Intake Started</span>
                  <span className="text-gray-900">{formatTime(job.intake_started_at)}</span>
                </div>
              )}
              {job.intake_completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Intake Completed</span>
                  <span className="text-gray-900">{formatTime(job.intake_completed_at)}</span>
                </div>
              )}
              {job.work_started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Work Started</span>
                  <span className="text-gray-900">{formatTime(job.work_started_at)}</span>
                </div>
              )}
              {job.work_completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Work Completed</span>
                  <span className="text-gray-900">{formatTime(job.work_completed_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {(isEditable || job.intake_notes) && (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FileText className="h-4 w-4" />
                  <span>Notes</span>
                </div>
                {isEditable && (
                  <button
                    onClick={handleStartEditNotes}
                    className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-gray-100"
                  >
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                {job.intake_notes || <span className="italic text-gray-400">No notes</span>}
              </p>
            </div>
          )}

          {/* Addons Section */}
          {allAddons.length > 0 && (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <AlertTriangle className="h-4 w-4" />
                <span>Add-ons / Issues Flagged</span>
              </div>
              <div className="mt-2 space-y-2">
                {allAddons.map((addon) => {
                  const addonConfig = ADDON_STATUS_CONFIG[addon.status];
                  const finalPrice = addon.price - addon.discount_amount;
                  const canResend = addon.status === 'expired' || addon.status === 'declined';
                  return (
                    <div
                      key={addon.id}
                      className="rounded-lg border border-gray-100 p-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {addon.custom_description || 'Service Add-on'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                                addonConfig.color,
                                addon.status === 'pending' && 'animate-pulse'
                              )}
                            >
                              {addonConfig.label}
                            </span>
                            {addon.sent_at && (
                              <span className="text-[11px] text-gray-400">
                                Sent {timeAgo(addon.sent_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            ${finalPrice.toFixed(2)}
                          </span>
                          {canResend && (
                            <button
                              onClick={() => handleResendAddon(addon.id)}
                              disabled={resendingAddon === addon.id}
                              className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                            >
                              {resendingAddon === addon.id ? (
                                <RotateCcw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="h-3 w-3" />
                              )}
                              Re-send
                            </button>
                          )}
                        </div>
                      </div>
                      {addon.discount_amount > 0 && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          <span className="line-through">${addon.price.toFixed(2)}</span>
                          {' '}-${addon.discount_amount.toFixed(2)} discount
                        </p>
                      )}
                      {addon.pickup_delay_minutes > 0 && (
                        <p className="text-[11px] text-gray-400">
                          +{addon.pickup_delay_minutes} min additional time
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Addons Alert */}
          {pendingAddons.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-700">
              <Bell className="h-4 w-4 shrink-0 animate-pulse" />
              <span>
                {pendingAddons.length} pending authorization{pendingAddons.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Customer */}
          {isEditable ? (
            <button
              onClick={() => setShowEditCustomer(true)}
              className="w-full rounded-lg bg-white p-3 text-left shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <User className="h-4 w-4" />
                    <span>Customer</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900">
                    {job.customer
                      ? `${job.customer.first_name} ${job.customer.last_name}`
                      : 'No customer'}
                  </p>
                  {job.customer?.phone && (
                    <p className="text-sm text-gray-500">{formatPhone(job.customer.phone)}</p>
                  )}
                  {job.customer?.email && (
                    <p className="text-sm text-gray-400">{job.customer.email}</p>
                  )}
                </div>
                <Pencil className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          ) : job.customer ? (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <User className="h-4 w-4" />
                <span>Customer</span>
              </div>
              <p className="mt-1 font-medium text-gray-900">
                {job.customer.first_name} {job.customer.last_name}
              </p>
              {job.customer.phone && (
                <p className="text-sm text-gray-500">{formatPhone(job.customer.phone)}</p>
              )}
              {job.customer.email && (
                <p className="text-sm text-gray-400">{job.customer.email}</p>
              )}
            </div>
          ) : null}

          {/* Vehicle */}
          {isEditable ? (
            <button
              onClick={handleOpenEditVehicle}
              className="w-full rounded-lg bg-white p-3 text-left shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Car className="h-4 w-4" />
                    <span>Vehicle</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatVehicle(job.vehicle)}
                  </p>
                </div>
                <Pencil className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          ) : (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Car className="h-4 w-4" />
                <span>Vehicle</span>
              </div>
              <p className="mt-1 font-medium text-gray-900">
                {formatVehicle(job.vehicle)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pickup Dialog */}
      {showPickupDialog && job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Customer Pickup</h3>
            <p className="mt-1 text-sm text-gray-500">
              Mark {job.customer ? `${job.customer.first_name}'s` : 'this'} {formatVehicle(job.vehicle)} as picked up?
            </p>
            <textarea
              value={pickupNotes}
              onChange={(e) => setPickupNotes(e.target.value)}
              placeholder="Optional notes (e.g., customer satisfied, noted concern about X)"
              className="mt-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setShowPickupDialog(false); setPickupNotes(''); }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePickup}
                disabled={pickingUp}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {pickingUp ? 'Processing...' : 'Confirm Pickup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        {job.status === 'scheduled' && (
          <button
            onClick={handleStartIntake}
            disabled={startingIntake}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {startingIntake ? 'Starting...' : 'Start Intake'}
          </button>
        )}
        {job.status === 'intake' && !job.intake_completed_at && (
          <button
            onClick={() => setZonePickerMode('intake')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Camera className="h-4 w-4" />
            Continue Intake
          </button>
        )}
        {job.status === 'intake' && job.intake_completed_at && (
          <button
            onClick={handleStartWork}
            disabled={startingWork}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {startingWork ? 'Starting...' : 'Start Work'}
          </button>
        )}
        {job.status === 'in_progress' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setZonePickerMode('progress')}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ImageIcon className="h-4 w-4" />
                Photos
              </button>
              {canFlagIssue && (
                <button
                  onClick={() => setShowFlagIssue(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Flag Issue
                </button>
              )}
            </div>
            <button
              onClick={() => setZonePickerMode('completion')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Job
            </button>
          </div>
        )}
        {job.status === 'pending_approval' && (
          <div className="flex gap-2">
            <button
              onClick={() => setZonePickerMode('progress')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ImageIcon className="h-4 w-4" />
              View Photos
            </button>
          </div>
        )}
        {job.status === 'completed' && (
          <button
            onClick={() => setShowPickupDialog(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Customer Pickup
          </button>
        )}
        {(job.status === 'closed' || job.status === 'cancelled') && (
          <p className="text-center text-sm text-gray-400">
            This job is {job.status}
          </p>
        )}
        {/* Cancel Job button */}
        {canCancel && (
          <button
            onClick={handleCancelClick}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" />
            Cancel Job
          </button>
        )}
      </div>

      {/* Reassign Detailer Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Reassign Detailer</h3>
                <button
                  onClick={() => setShowReassignModal(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loadingStaff ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Unassigned option */}
                  <button
                    onClick={() => handleReassign(null)}
                    disabled={reassigning}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50',
                      !job?.assigned_staff && 'bg-blue-50'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700">Unassigned</p>
                      <p className="text-xs text-gray-400">Remove assignment</p>
                    </div>
                    {!job?.assigned_staff && (
                      <Check className="h-4 w-4 text-blue-600" />
                    )}
                  </button>

                  {/* Staff list */}
                  {availableStaff.map((staff) => {
                    const isCurrentlyAssigned = job?.assigned_staff?.id === staff.id;
                    return (
                      <button
                        key={staff.id}
                        onClick={() => handleReassign(staff.id)}
                        disabled={reassigning}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50',
                          isCurrentlyAssigned && 'bg-blue-50'
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {staff.first_name} {staff.last_name}
                            </p>
                            {staff.is_busy && (
                              <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                                busy
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {staff.job_count_today} job{staff.job_count_today !== 1 ? 's' : ''} today
                          </p>
                        </div>
                        {isCurrentlyAssigned && (
                          <Check className="h-4 w-4 text-blue-600" />
                        )}
                      </button>
                    );
                  })}

                  {availableStaff.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400">
                      No bookable staff found
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reason Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Cancel Job</h3>
            <p className="mt-1 text-sm text-gray-500">
              Why is this job being cancelled?
            </p>

            <div className="mt-4 space-y-2">
              {CANCELLATION_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
                    cancelReason === r
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={r}
                    checked={cancelReason === r}
                    onChange={() => setCancelReason(r)}
                    className="accent-red-600"
                  />
                  <span className="text-gray-700">{r}</span>
                </label>
              ))}
            </div>

            {cancelReason === 'Other' && (
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason..."
                className="mt-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                rows={2}
                autoFocus
              />
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Keep Job
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={
                  cancelling ||
                  !cancelReason ||
                  (cancelReason === 'Other' && !customReason.trim())
                }
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : job.appointment_id ? 'Next' : 'Cancel Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Method Dialog (appointment-based jobs) */}
      <SendMethodDialog
        open={showNotifyDialog}
        onOpenChange={(isOpen) => {
          if (!isOpen && !notifySuccess) {
            setShowNotifyDialog(false);
          }
        }}
        title="Notify Customer"
        description={`How would you like to notify ${job.customer?.first_name ?? 'the customer'} about this cancellation?`}
        customerEmail={job.customer?.email ?? null}
        customerPhone={job.customer?.phone ?? null}
        onSend={handleCancelWithNotify}
        sending={notifySending}
        success={notifySuccess}
        sendLabel="Cancel & Notify"
        cancelLabel="Back"
      />

      {/* Edit Customer Modal */}
      {showEditCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Change Customer</h3>
                <button
                  onClick={() => setShowEditCustomer(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <CustomerLookup
                onSelect={handleEditCustomerSelect}
                onCreateNew={() => {
                  // For now, close the modal — quick-add is in the walk-in flow
                  toast.error('Create the customer first from the Walk-In flow, then change customer here');
                }}
              />
              {savingEdit && (
                <div className="mt-3 flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {showEditVehicle && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Change Vehicle</h3>
                <button
                  onClick={() => setShowEditVehicle(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loadingVehicles ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* No vehicle option */}
                  <button
                    onClick={() => handleEditVehicleSelect(null)}
                    disabled={savingEdit}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50',
                      !job?.vehicle && 'bg-blue-50'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700">No vehicle</p>
                      <p className="text-xs text-gray-400">Remove vehicle assignment</p>
                    </div>
                    {!job?.vehicle && <Check className="h-4 w-4 text-blue-600" />}
                  </button>

                  {editVehicles.map((v) => {
                    const isCurrentVehicle = job?.vehicle?.id === v.id;
                    const label = [v.color, v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle';
                    return (
                      <button
                        key={v.id}
                        onClick={() => handleEditVehicleSelect(v.id)}
                        disabled={savingEdit}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50',
                          isCurrentVehicle && 'bg-blue-50'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-gray-400" />
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                        </div>
                        {isCurrentVehicle && <Check className="h-4 w-4 text-blue-600" />}
                      </button>
                    );
                  })}

                  {editVehicles.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400">
                      No vehicles for this customer
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Notes Modal */}
      {editingNotes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Edit Notes</h3>
                <button
                  onClick={() => setEditingNotes(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes about this job..."
                className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={5}
                autoFocus
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setEditingNotes(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingEdit}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Services Modal */}
      {showEditServices && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex w-full max-w-md flex-col rounded-t-xl bg-white shadow-xl sm:max-h-[80vh] sm:rounded-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Edit Services</h3>
                <button
                  onClick={() => setShowEditServices(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '50vh' }}>
              {loadingServices ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1">
                  {allServices
                    .filter((s) => !serviceSearch.trim() || s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                    .map((svc) => {
                      const isSelected = editSelectedServices.some((s) => s.id === svc.id);
                      const price = getServicePrice(svc);
                      return (
                        <button
                          key={svc.id}
                          onClick={() => handleToggleEditService({ id: svc.id, name: svc.name, price })}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors',
                            isSelected
                              ? 'bg-blue-50 ring-1 ring-blue-200'
                              : 'hover:bg-gray-50'
                          )}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{svc.name}</p>
                            <p className="text-xs text-gray-500">
                              ${price.toFixed(2)}
                              {svc.pricing_model !== 'flat' && ' (starting)'}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                              <Check className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="border-t border-gray-200 px-5 py-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {editSelectedServices.length} service{editSelectedServices.length !== 1 ? 's' : ''}
                </span>
                <span className="font-medium text-gray-900">
                  ${editSelectedServices.reduce((sum, s) => sum + s.price, 0).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleSaveEditServices}
                disabled={editSelectedServices.length === 0 || savingEdit}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Update Services'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
