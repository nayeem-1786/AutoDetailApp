'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPhone } from '@/lib/utils/format';
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
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
  ShoppingCart,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { usePosAuth } from '../../context/pos-auth-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { SendMethodDialog, type SendMethod } from '@/components/ui/send-method-dialog';
import { SendPaymentLinkDialog } from '@/components/jobs/send-payment-link-dialog';
import { PaymentLinkAmountModal } from '@/components/jobs/payment-link-amount-modal';
import {
  EditMobileModal,
  type EditMobileModalSavedResult,
} from '@/components/jobs/edit-mobile-modal';
import { PaymentMismatchBanner } from '@/components/jobs/payment-mismatch-banner';
import { fromCents } from '@/lib/utils/refund-math';
import { ZonePicker } from './zone-picker';
import { JobTimer } from './job-timer';
import { FlagIssueFlow } from './flag-issue-flow';
import { ChangeTimeButton } from './change-time-button';
import { CustomerLookup } from '../../components/customer-lookup';
import { EditServicesDialog } from '@/lib/services/edit-services-dialog';
import { ModifierSummary } from '@/components/appointments/modifier-summary';
import type { JobStatus, JobAddonStatus, Customer, JobServiceSnapshot, VehicleSizeClass } from '@/lib/supabase/types';
import { composeLineItems } from '@/lib/utils/compose-line-items';

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
  services: JobServiceSnapshot[];
  estimated_pickup_at: string | null;
  created_at: string;
  work_started_at: string | null;
  work_completed_at: string | null;
  timer_seconds: number;
  timer_paused_at: string | null;
  intake_started_at: string | null;
  intake_completed_at: string | null;
  intake_notes: string | null;
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
  appointment: {
    id: string;
    status: string;
    payment_status: string;
    total_amount: number;
    /** Synthetic walk-in appointments carry channel='walk_in'. */
    channel?: string;
    /** Server-computed remaining balance in integer cents. */
    amount_due_cents?: number;
    /** Phase Mobile-1.6: surface mobile address for display + edit. */
    is_mobile?: boolean;
    mobile_address?: string | null;
    /** Phase Mobile-1.7: surcharge + zone snapshot for the services
     * breakdown composer (renders synthetic mobile-fee row). */
    mobile_surcharge?: number | string | null;
    mobile_zone_name_snapshot?: string | null;
    /** Phase Mobile-1.9: surfaced for the full mobile picker edit
     * (zone re-select on existing job). The picker uses this to
     * pre-select the current zone in the dropdown. */
    mobile_zone_id?: string | null;
    /**
     * Item 15g Layer 15g-iii — modifier snapshot columns surfaced from the
     * linked appointment. Renders the read-only "Applied Discounts" block in
     * the Services tile so operators can see coupon / loyalty / manual
     * discount before clicking Checkout. Edits go through POS (Phase 1).
     */
    coupon_code?: string | null;
    coupon_discount?: number | null;
    loyalty_points_redeemed?: number | null;
    loyalty_discount?: number | null;
    manual_discount_value?: number | null;
    manual_discount_label?: string | null;
  } | null;
  addons: AddonData[] | null;
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

const ADDON_STATUS_CONFIG: Record<JobAddonStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' },
  approved: { label: 'Approved', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
  declined: { label: 'Declined', color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
  expired: { label: 'Expired', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
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
  const desc = cleanVehicleDescription({ year: v.year, make: v.make, model: v.model }) || 'Vehicle';
  const color = sanitizeVehicleField(v.color);
  return color ? `${color} ${desc}` : desc;
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
  onCheckout?: (jobId: string) => void;
}

export function JobDetail({ jobId, onBack, onCheckout }: JobDetailProps) {
  const router = useRouter();
  const { employee } = usePosAuth();
  const { granted: canManageJobs } = usePosPermission('pos.jobs.manage');
  const { granted: canCancelJobs } = usePosPermission('pos.jobs.cancel');
  const { granted: canFlagIssue } = usePosPermission('pos.jobs.flag_issue');
  const { enabled: photosEnabled } = useFeatureFlag(FEATURE_FLAGS.PHOTO_DOCUMENTATION);
  const [job, setJob] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingIntake, setStartingIntake] = useState(false);
  const [startingWork, setStartingWork] = useState(false);
  const [zonePickerMode, setZonePickerMode] = useState<ZonePickerMode>(null);
  const [showFlagIssue, setShowFlagIssue] = useState(false);
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

  // Payment link dialog state — two-step flow (Pay-Link Session 5):
  // (1) amount modal → (2) channel-pick dialog. selectedAmountCents persists
  // across the transition so Back from the channel dialog returns to the
  // amount modal with the prior choice intact.
  const [paymentAmountModalOpen, setPaymentAmountModalOpen] = useState(false);
  const [paymentLinkDialogOpen, setPaymentLinkDialogOpen] = useState(false);
  const [selectedAmountCents, setSelectedAmountCents] = useState<number | null>(null);
  // SendPaymentLinkDialog auto-closes 3s after a successful send via a
  // setTimeout inside its own handleSend. That timeout captures the parent's
  // onOpenChange prop in a closure at the moment the user tapped Send — when
  // selectedAmountCents was still non-null. Even though onSent clears the
  // amount synchronously, the stale closure later runs the "if !open &&
  // selectedAmountCents !== null → reopen amount modal" branch, which
  // re-surfaces the amount modal (Session 5-followup-2 Bug 1). A ref is
  // stable across renders, so the stale closure reads the latest value.
  const paymentLinkSentRef = useRef(false);

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
  // Item 15f Layer 3a — Edit Services now mounted via the canonical
  // `<EditServicesDialog>`. Local selection state holds the in-flight
  // edit; `handleSaveEditServices` PATCHes the job and closes the dialog.
  const [showEditServices, setShowEditServices] = useState(false);
  const [editSelectedServices, setEditSelectedServices] = useState<JobServiceSnapshot[]>([]);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Phase Mobile-1.9 — full mobile picker edit replaces the Phase 1.6
  // address-only modal. State drives the shared `EditMobileModal` and
  // the post-save mismatch banner.
  //
  // Union state distinguishes the two entry points:
  //  - 'edit'   — appointment is already mobile, picker pre-fills snapshot
  //  - 'enable' — appointment is non-mobile, picker opens with toggle ON
  //               and blank fields so admin can convert the job to mobile
  //               (creation-time parity per the Phase 1.9 follow-up).
  //  - null     — modal closed.
  const [editingMobile, setEditingMobile] = useState<'edit' | 'enable' | null>(
    null
  );
  const [paymentMismatch, setPaymentMismatch] = useState<{
    amount: number;
    newTotal: number;
    paidAmount: number;
  } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  async function handleCheckout() {
    if (!job || checkingOut || !onCheckout) return;
    setCheckingOut(true);
    try {
      await onCheckout(jobId);
    } finally {
      setCheckingOut(false);
    }
  }

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
        if (photosEnabled) {
          setZonePickerMode('intake');
        }
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

  async function handleCompleteJobDirect() {
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_photo_check: true }),
      });
      if (res.ok) {
        fetchJob();
        toast.success('Job completed');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to complete job');
      }
    } catch {
      toast.error('Failed to complete job');
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

  // Item 15f Phase 1 Layer 8d / 8d-bis — Edit Services routes to POS edit
  // mode via the deep-link drain (Layer 8b). The full POS Sale tab opens
  // with the appointment's services + modifiers pre-loaded; Save Changes
  // hits the cascade endpoint (Layer 8a/8c) which writes
  // appointment_services AND cascades to jobs.services.
  //
  // Layer 8d-bis (Option G4): deep-link `id` is the JOB UUID for source=job.
  // The drain calls `/api/pos/jobs/${id}/checkout-items` (which expects a
  // job UUID — Layer 8d shipped the appointment UUID and 404'd), then
  // resolves the linked appointment_id from the response and uses that as
  // `ticket.sourceId`. Invariant preserved: `sourceId` is ALWAYS an
  // appointment UUID — Layer 8c's save POSTs to
  // `/api/pos/appointments/${sourceId}/services`. The change is where
  // sourceId gets populated (response.appointment_id for source=job; URL
  // id for source=appointment).
  //
  // Walk-ins post-Phase-0a all carry a synthetic appointment_id. Legacy
  // pre-0a walk-ins (appointment_id IS NULL) can't be edited via this
  // path — toast a refusal and the existing dead `<EditServicesDialog>`
  // mount stays inert. Layer 8e deletes the mount entirely.
  function handleOpenEditServices() {
    if (!job) return;
    if (!job.appointment_id) {
      toast.error(
        'This legacy ticket has no underlying appointment. Service editing is not available.'
      );
      return;
    }
    // returnTo is `/pos/jobs?jobId=<id>` — the Jobs page reads the param on
    // mount and opens the detail view (Layer 8d adds this query-param hop
    // since the Jobs page doesn't have per-job URL segments).
    router.push(
      `/pos?source=job&id=${job.id}&returnTo=${encodeURIComponent(
        `/pos/jobs?jobId=${job.id}`
      )}`
    );
  }

  function handleEditServiceAdded(
    service: { id: string; name: string },
    pricing: { id: string; price: number; tier_name: string },
    _vsc: VehicleSizeClass | null,
    perUnitQty?: number,
  ) {
    setEditSelectedServices((prev) => {
      // Duplicate-guard: if the catalog service is already selected, no-op.
      // Custom assessments synthesize a unique id each time so they never
      // collide. Catalog services use their UUID as the id.
      if (prev.some((p) => p.id === service.id && !pricing.id.startsWith('custom-'))) {
        return prev;
      }
      const snapshot: JobServiceSnapshot = {
        id: service.id,
        name: service.name,
        price: Number(pricing.price),
        tier_name: pricing.tier_name || null,
      };
      if (perUnitQty != null) snapshot.quantity = perUnitQty;
      return [...prev, snapshot];
    });
  }

  function handleEditServiceRemoved(serviceId: string) {
    setEditSelectedServices((prev) => prev.filter((s) => s.id !== serviceId));
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

  // Phase Mobile-1.9 — full mobile picker edit. Modal owns its own
  // validation + PATCH lifecycle; this callback runs after the server
  // confirms the write, merging the saved snapshot into local state and
  // surfacing the payment-mismatch banner when the new total no longer
  // matches what's been paid.
  function handleMobileEditSaved(result: EditMobileModalSavedResult) {
    setJob((prev) =>
      prev && prev.appointment
        ? {
            ...prev,
            appointment: {
              ...prev.appointment,
              is_mobile: result.is_mobile,
              mobile_zone_id: result.mobile_zone_id,
              mobile_address: result.mobile_address,
              mobile_surcharge: result.mobile_surcharge,
              mobile_zone_name_snapshot: result.mobile_zone_name_snapshot,
              total_amount: result.total_amount,
            },
          }
        : prev
    );
    // Re-fetch in the background so derived fields (amount_due_cents,
    // jobs.services JSONB → composer-rendered list) reflect the
    // canonical server-side state. The optimistic merge above keeps
    // the card responsive in the meantime.
    fetchJob();
    if (Math.abs(result.mismatch_amount) >= 0.005) {
      setPaymentMismatch({
        amount: result.mismatch_amount,
        newTotal: result.total_amount,
        paidAmount: result.total_amount - result.mismatch_amount,
      });
    } else {
      setPaymentMismatch(null);
    }
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

    // If appointment-based (NOT a walk-in), show notification dialog instead of
    // cancelling immediately. Walk-ins (channel='walk_in') skip the dialog —
    // existing cancellation templates phrase the message as "your appointment
    // on <date>..." which is wrong for someone who walked in. Server enforces
    // the same suppression as defense-in-depth.
    const isWalkIn = !job.appointment_id || job.appointment?.channel === 'walk_in';
    if (!isWalkIn) {
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
  if (zonePickerMode && photosEnabled && job) {
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
        sizeClass={job.vehicle?.size_class}
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Job not found</p>
        <button onClick={onBack} className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Back to queue
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[job.status];
  // Phase Mobile-1.7: services list rendered through composeLineItems so
  // the synthetic mobile-fee row appears in the breakdown on mobile jobs.
  // Totals derive from the composed list so the sum matches the visible
  // rows (mobile surcharge included when applicable).
  //
  // Phase Mobile-1.8: pass raw `job.services` (the `jobs.services` JSONB)
  // directly — the composer handles the `price`-vs-`unit_price` field
  // aliasing and preserves the `is_mobile_fee=true` flag on the entry
  // materialized by /api/pos/jobs/populate. That flag signals the
  // composer to skip its synthetic-row append, preventing the duplicate
  // mobile-fee line that surfaced before this fix.
  const displayServices = composeLineItems(
    {
      is_mobile: job.appointment?.is_mobile ?? false,
      mobile_surcharge: job.appointment?.mobile_surcharge ?? 0,
      mobile_zone_name_snapshot:
        job.appointment?.mobile_zone_name_snapshot ?? null,
    },
    job.services
  );
  const servicesTotal = displayServices.reduce((sum, s) => sum + s.total_price, 0);
  const allAddons = job.addons ?? [];
  const pendingAddons = allAddons.filter((a) => a.status === 'pending');
  const _approvedAddons = allAddons.filter((a) => a.status === 'approved');
  const _declinedAddons = allAddons.filter((a) => a.status === 'declined');
  const _expiredAddons = allAddons.filter((a) => a.status === 'expired');

  const showTimer = job.status === 'in_progress' && (job.work_started_at || job.timer_paused_at);

  // Send Payment Link visibility — appointment-linked, unpaid, not cancelled,
  // and the customer has at least one contact channel. amount_due_cents is
  // server-computed to match the webhook + send-route + public-page math;
  // total_amount is the safe fallback if the field hasn't propagated yet
  // (e.g., older client cache during a deploy).
  const appt = job.appointment;
  const showPaymentLinkButton = !!(
    job.appointment_id &&
    appt &&
    appt.payment_status !== 'paid' &&
    appt.status !== 'cancelled' &&
    appt.status !== 'no_show' &&
    (job.customer?.email || job.customer?.phone)
  );
  const amountDueDollars = appt
    ? typeof appt.amount_due_cents === 'number'
      ? fromCents(appt.amount_due_cents)
      : Number(appt.total_amount)
    : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                {job.customer
                  ? `${job.customer.first_name} ${job.customer.last_name}`
                  : 'Unknown Customer'}
              </h1>
              {(() => {
                // Phase 0a: every walk-in carries a synthetic appointment_id,
                // so the pill discriminator is now the joined appointment's
                // channel. Legacy pre-0a walk-ins (appointment_id IS NULL) also
                // resolve to "Walk-In" via the negation.
                const isBookedAppt =
                  !!job.appointment_id && job.appointment?.channel !== 'walk_in';
                return (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      isBookedAppt
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                    )}
                  >
                    {isBookedAppt ? (
                      <><Calendar className="h-3 w-3" />Appointment</>
                    ) : (
                      <><Footprints className="h-3 w-3" />Walk-In</>
                    )}
                  </span>
                );
              })()}
              <span
                className={cn(
                  'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                  statusConfig.color
                )}
              >
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatVehicle(job.vehicle)}</p>
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
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4">
        <div className="space-y-3">
          {/* Intake completed banner */}
          {job.status === 'intake' && job.intake_completed_at && !job.work_started_at && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-3 text-sm text-blue-700 dark:text-blue-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Intake complete — ready to start work</span>
            </div>
          )}

          {/* Assigned Staff — tappable for users with pos.jobs.manage */}
          {canManageJobs && !['completed', 'closed', 'cancelled'].includes(job.status) ? (
            <button
              onClick={handleOpenReassign}
              className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <User className="h-4 w-4" />
                    <span>Assigned Detailer</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {job.assigned_staff
                      ? `${job.assigned_staff.first_name} ${job.assigned_staff.last_name}`
                      : 'Unassigned'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
            </button>
          ) : (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <User className="h-4 w-4" />
                <span>Assigned Detailer</span>
              </div>
              <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
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
              className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Wrench className="h-4 w-4" />
                  <span>Services</span>
                </div>
                <Pencil className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="mt-2 space-y-1">
                {displayServices.map((svc, idx) => {
                  const rowKey = svc.is_mobile_fee
                    ? `mobile-fee-${idx}`
                    : (job.services[idx]?.id ?? `svc-${idx}`);
                  return (
                    <div key={rowKey} className="flex items-center justify-between text-sm">
                      <span className="text-gray-900 dark:text-gray-100">{svc.name}</span>
                      <span className="text-gray-600 dark:text-gray-400">${svc.total_price.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div className="mt-1 border-t border-gray-100 dark:border-gray-800 pt-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="text-gray-700 dark:text-gray-300">Total</span>
                    <span className="text-gray-900 dark:text-gray-100">${servicesTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {/* Item 15g Layer 15g-iii — modifier summary block (coupon /
                  loyalty / manual discount). Hidden when no modifier is
                  applied. Read-only here — edits go through POS via Phase 1
                  edit-via-POS once it lands. */}
              <ModifierSummary
                coupon_code={job.appointment?.coupon_code}
                coupon_discount={job.appointment?.coupon_discount}
                loyalty_points_redeemed={job.appointment?.loyalty_points_redeemed}
                loyalty_discount={job.appointment?.loyalty_discount}
                manual_discount_value={job.appointment?.manual_discount_value}
                manual_discount_label={job.appointment?.manual_discount_label}
                variant="pos"
              />
            </button>
          ) : (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Wrench className="h-4 w-4" />
                <span>Services</span>
              </div>
              <div className="mt-2 space-y-1">
                {displayServices.map((svc, idx) => {
                  const rowKey = svc.is_mobile_fee
                    ? `mobile-fee-${idx}`
                    : (job.services[idx]?.id ?? `svc-${idx}`);
                  return (
                    <div key={rowKey} className="flex items-center justify-between text-sm">
                      <span className="text-gray-900 dark:text-gray-100">{svc.name}</span>
                      <span className="text-gray-600 dark:text-gray-400">${svc.total_price.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div className="mt-1 border-t border-gray-100 dark:border-gray-800 pt-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="text-gray-700 dark:text-gray-300">Total</span>
                    <span className="text-gray-900 dark:text-gray-100">${servicesTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <ModifierSummary
                coupon_code={job.appointment?.coupon_code}
                coupon_discount={job.appointment?.coupon_discount}
                loyalty_points_redeemed={job.appointment?.loyalty_points_redeemed}
                loyalty_discount={job.appointment?.loyalty_discount}
                manual_discount_value={job.appointment?.manual_discount_value}
                manual_discount_label={job.appointment?.manual_discount_label}
                variant="pos"
              />
            </div>
          )}

          {/* Mobile Service — Phase Mobile-1.9 expanded card. Replaces the
              Phase 1.6 address-only card. Shows zone snapshot (frozen at
              save time per LOCKED-7.6) + surcharge + address. Pencil opens
              the full picker modal. When is_mobile=false on an editable
              job, an "Enable mobile service" affordance is rendered in
              its place so admin can convert the job to mobile (creation-
              time parity). */}
          {job.appointment?.is_mobile && (
            isEditable ? (
              <button
                onClick={() => setEditingMobile('edit')}
                className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <MapPin className="h-4 w-4" />
                    <span>Mobile Service</span>
                  </div>
                  <Pencil className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="mt-1 space-y-0.5 text-sm">
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">
                      Zone:{' '}
                    </span>
                    {job.appointment.mobile_zone_name_snapshot || (
                      <span className="italic text-gray-400 dark:text-gray-500">
                        Not set
                      </span>
                    )}
                    {Number(job.appointment.mobile_surcharge ?? 0) > 0 && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {' '}— ${Number(job.appointment.mobile_surcharge).toFixed(2)}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    <span className="text-gray-500 dark:text-gray-400">
                      Address:{' '}
                    </span>
                    {job.appointment.mobile_address || (
                      <span className="italic text-gray-400 dark:text-gray-500">
                        Tap to add address
                      </span>
                    )}
                  </p>
                </div>
              </button>
            ) : (
              <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  <span>Mobile Service</span>
                </div>
                <div className="mt-1 space-y-0.5 text-sm">
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">
                      Zone:{' '}
                    </span>
                    {job.appointment.mobile_zone_name_snapshot || (
                      <span className="italic text-gray-400 dark:text-gray-500">
                        Not set
                      </span>
                    )}
                    {Number(job.appointment.mobile_surcharge ?? 0) > 0 && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {' '}— ${Number(job.appointment.mobile_surcharge).toFixed(2)}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    <span className="text-gray-500 dark:text-gray-400">
                      Address:{' '}
                    </span>
                    {job.appointment.mobile_address || (
                      <span className="italic text-gray-400 dark:text-gray-500">
                        No address on file
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )
          )}

          {/* Enable mobile service entry point — Phase Mobile-1.9. When the
              appointment is non-mobile but editable, expose a button to
              convert it. Opens the same EditMobileModal with is_mobile
              defaulting to true so admin lands in the picker ready to set
              zone + address. */}
          {job.appointment && !job.appointment.is_mobile && isEditable && (
            <button
              onClick={() => setEditingMobile('enable')}
              className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="h-4 w-4" />
                  <span>Mobile Service</span>
                </div>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  + Enable
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This job is not currently a mobile job.
              </p>
            </button>
          )}

          {/* Phase Mobile-1.9 — payment mismatch banner rendered after the
              picker save when the new total no longer matches what's been
              paid. Informational only; admin uses existing refund / send-
              payment-link flows to reconcile. */}
          {paymentMismatch && (
            <PaymentMismatchBanner
              mismatchAmount={paymentMismatch.amount}
              newTotal={paymentMismatch.newTotal}
              paidAmount={paymentMismatch.paidAmount}
              onDismiss={() => setPaymentMismatch(null)}
            />
          )}

          {/* Timing */}
          <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock className="h-4 w-4" />
                <span>Timing</span>
              </div>
              {/* Roadmap Item 15c — Change Time affordance lives here so the
                  edit control sits next to the time fields it edits. The
                  button hides itself when the user lacks
                  `appointments.reschedule`, the job has no appointment, or
                  the status is past `in_progress`. */}
              <ChangeTimeButton
                appointmentId={job.appointment_id}
                jobStatus={job.status}
                onSaved={fetchJob}
              />
            </div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Created</span>
                <span className="text-gray-900 dark:text-gray-100">{formatDateTime(job.created_at)}</span>
              </div>
              {job.estimated_pickup_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Est. Pickup</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatTime(job.estimated_pickup_at)}</span>
                </div>
              )}
              {job.intake_started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Intake Started</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatTime(job.intake_started_at)}</span>
                </div>
              )}
              {job.intake_completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Intake Completed</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatTime(job.intake_completed_at)}</span>
                </div>
              )}
              {job.work_started_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Work Started</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatTime(job.work_started_at)}</span>
                </div>
              )}
              {job.work_completed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Work Completed</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatTime(job.work_completed_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {isEditable ? (
            <button
              onClick={handleStartEditNotes}
              className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <FileText className="h-4 w-4" />
                  <span>Notes</span>
                </div>
                <Pencil className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {job.intake_notes || <span className="italic text-gray-400 dark:text-gray-500">Tap to add notes</span>}
              </p>
            </button>
          ) : job.intake_notes ? (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <FileText className="h-4 w-4" />
                <span>Notes</span>
              </div>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {job.intake_notes}
              </p>
            </div>
          ) : null}

          {/* Addons Section */}
          {allAddons.length > 0 && (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
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
                      className="rounded-lg border border-gray-100 dark:border-gray-800 p-2.5"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                Sent {timeAgo(addon.sent_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            ${finalPrice.toFixed(2)}
                          </span>
                          {canResend && (
                            <button
                              onClick={() => handleResendAddon(addon.id)}
                              disabled={resendingAddon === addon.id}
                              className="flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
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
                        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                          <span className="line-through">${addon.price.toFixed(2)}</span>
                          {' '}-${addon.discount_amount.toFixed(2)} discount
                        </p>
                      )}
                      {addon.pickup_delay_minutes > 0 && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">
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
            <div className="flex items-center gap-2 rounded-lg bg-orange-50 dark:bg-orange-900/30 p-3 text-sm text-orange-700 dark:text-orange-400">
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
              className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <User className="h-4 w-4" />
                    <span>Customer</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {job.customer
                      ? `${job.customer.first_name} ${job.customer.last_name}`
                      : 'No customer'}
                  </p>
                  {job.customer?.phone && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{formatPhone(job.customer.phone)}</p>
                  )}
                  {job.customer?.email && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">{job.customer.email}</p>
                  )}
                </div>
                <Pencil className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
            </button>
          ) : job.customer ? (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <User className="h-4 w-4" />
                <span>Customer</span>
              </div>
              <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                {job.customer.first_name} {job.customer.last_name}
              </p>
              {job.customer.phone && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatPhone(job.customer.phone)}</p>
              )}
              {job.customer.email && (
                <p className="text-sm text-gray-400 dark:text-gray-500">{job.customer.email}</p>
              )}
            </div>
          ) : null}

          {/* Vehicle */}
          {isEditable ? (
            <button
              onClick={handleOpenEditVehicle}
              className="w-full rounded-lg bg-white dark:bg-gray-900 p-3 text-left shadow-sm dark:shadow-gray-950/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Car className="h-4 w-4" />
                    <span>Vehicle</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {formatVehicle(job.vehicle)}
                  </p>
                </div>
                <Pencil className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
            </button>
          ) : (
            <div className="rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Car className="h-4 w-4" />
                <span>Vehicle</span>
              </div>
              <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                {formatVehicle(job.vehicle)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        {job.status === 'scheduled' && (
          <button
            onClick={handleStartIntake}
            disabled={startingIntake}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {startingIntake ? 'Starting...' : 'Start Intake'}
          </button>
        )}
        {job.status === 'intake' && !job.intake_completed_at && photosEnabled && (
          <button
            onClick={() => setZonePickerMode('intake')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            <Camera className="h-4 w-4" />
            Continue Intake
          </button>
        )}
        {job.status === 'intake' && job.intake_completed_at && (
          <button
            onClick={handleStartWork}
            disabled={startingWork}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 dark:bg-yellow-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-yellow-600 dark:hover:bg-yellow-500 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {startingWork ? 'Starting...' : 'Start Work'}
          </button>
        )}
        {job.status === 'in_progress' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {photosEnabled && (
                <button
                  onClick={() => setZonePickerMode('progress')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ImageIcon className="h-4 w-4" />
                  Photos
                </button>
              )}
              {canFlagIssue && (
                <button
                  onClick={() => setShowFlagIssue(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 dark:bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 dark:hover:bg-orange-500"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Flag Issue
                </button>
              )}
            </div>
            <button
              onClick={photosEnabled ? () => setZonePickerMode('completion') : handleCompleteJobDirect}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 dark:bg-green-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 dark:hover:bg-green-600"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Job
            </button>
          </div>
        )}
        {job.status === 'pending_approval' && photosEnabled && (
          <div className="flex gap-2">
            <button
              onClick={() => setZonePickerMode('progress')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <ImageIcon className="h-4 w-4" />
              View Photos
            </button>
          </div>
        )}
        {job.status === 'completed' && (() => {
          // Close-out vs Checkout: when the linked appointment is fully covered
          // by prior payments (pay-link, deposit, or paid-in-full at booking),
          // the action is "Close Out" — staff still enters POS to confirm, but
          // there's nothing to tender. amount_due_cents is server-computed in
          // /api/pos/jobs/[id] (Session 3b) so the gate is reliable.
          const isCloseOut =
            job.appointment_id !== null &&
            job.appointment?.amount_due_cents === 0;
          return (
            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50',
                isCloseOut
                  ? 'bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600'
                  : 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600'
              )}
            >
              {isCloseOut ? <CheckCircle2 className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              {checkingOut ? 'Loading...' : isCloseOut ? 'Close Out' : 'Checkout'}
            </button>
          );
        })()}
        {job.status === 'closed' && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2.5 text-sm font-medium text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            Paid
          </div>
        )}
        {job.status === 'cancelled' && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500">
            This job is cancelled
          </p>
        )}
        {/* Send Payment Link — appointment-linked, unpaid, has contact */}
        {showPaymentLinkButton && (
          <button
            onClick={() => setPaymentAmountModalOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 dark:border-blue-700 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          >
            <Send className="h-4 w-4" />
            Send Payment Link
          </button>
        )}

        {/* Cancel Job button */}
        {canCancel && (
          <button
            onClick={handleCancelClick}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <XCircle className="h-4 w-4" />
            Cancel Job
          </button>
        )}
      </div>

      {/* Reassign Detailer Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setShowReassignModal(false)}>
          <div className="w-full max-w-sm rounded-t-xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/50 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reassign Detailer</h3>
                <button
                  onClick={() => setShowReassignModal(false)}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loadingStaff ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Unassigned option */}
                  <button
                    onClick={() => handleReassign(null)}
                    disabled={reassigning}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-50',
                      !job?.assigned_staff && 'bg-blue-50 dark:bg-blue-900/30'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Unassigned</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Remove assignment</p>
                    </div>
                    {!job?.assigned_staff && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                          'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-50',
                          isCurrentlyAssigned && 'bg-blue-50 dark:bg-blue-900/30'
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {staff.first_name} {staff.last_name}
                            </p>
                            {staff.is_busy && (
                              <span className="rounded-full bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
                                busy
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {staff.job_count_today} job{staff.job_count_today !== 1 ? 's' : ''} today
                          </p>
                        </div>
                        {isCurrentlyAssigned && (
                          <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    );
                  })}

                  {availableStaff.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
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
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-5 shadow-xl dark:shadow-gray-950/50">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cancel Job</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Why is this job being cancelled?
            </p>

            <div className="mt-4 space-y-2">
              {CANCELLATION_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
                    cancelReason === r
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
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
                  <span className="text-gray-700 dark:text-gray-300">{r}</span>
                </label>
              ))}
            </div>

            {cancelReason === 'Other' && (
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the reason..."
                className="mt-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-red-500 dark:focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 dark:focus:ring-red-400"
                rows={2}
                autoFocus
              />
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
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
                className="flex-1 rounded-lg bg-red-600 dark:bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50"
              >
                {cancelling
                  ? 'Cancelling...'
                  : (job.appointment_id && job.appointment?.channel !== 'walk_in')
                    ? 'Next'
                    : 'Cancel Job'}
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

      {/* Send Payment Link — two-step flow (amount → channel) */}
      {job.appointment_id && (
        <>
          <PaymentLinkAmountModal
            open={paymentAmountModalOpen}
            onOpenChange={(open) => {
              setPaymentAmountModalOpen(open);
              if (!open) setSelectedAmountCents(null);
            }}
            remainingCents={
              typeof appt?.amount_due_cents === 'number'
                ? appt.amount_due_cents
                : Math.round(amountDueDollars * 100)
            }
            customerName={
              job.customer
                ? `${job.customer.first_name} ${job.customer.last_name}`.trim()
                : undefined
            }
            onContinue={(amountCents) => {
              // Modal closes itself via onOpenChange(false) inside handleContinue
              // (Session 5-followup Bug 1 fix). We just record the choice and
              // open the next dialog.
              setSelectedAmountCents(amountCents);
              setPaymentLinkDialogOpen(true);
            }}
          />
          <SendPaymentLinkDialog
            open={paymentLinkDialogOpen}
            onOpenChange={(open) => {
              setPaymentLinkDialogOpen(open);
              if (!open) {
                // After a successful send the dialog auto-closes; in that
                // case we must NOT reopen the amount modal. The ref is set
                // by onSent and consumed here so the stale-closure path
                // (3s setTimeout inside SendPaymentLinkDialog) sees current
                // state instead of the captured non-null amount.
                if (paymentLinkSentRef.current) {
                  paymentLinkSentRef.current = false;
                  setSelectedAmountCents(null);
                  return;
                }
                // Closing without sending → return to amount modal so staff
                // can adjust their selection rather than starting over.
                if (selectedAmountCents !== null) {
                  setPaymentAmountModalOpen(true);
                }
              }
            }}
            appointmentId={job.appointment_id}
            customerEmail={job.customer?.email ?? null}
            customerPhone={job.customer?.phone ?? null}
            amountDue={amountDueDollars}
            amountCents={selectedAmountCents}
            onSent={() => {
              paymentLinkSentRef.current = true;
              setSelectedAmountCents(null);
              fetchJob();
            }}
          />
        </>
      )}

      {/* Edit Customer Modal */}
      {showEditCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setShowEditCustomer(false)}>
          <div className="w-full max-w-sm rounded-t-xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/50 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Change Customer</h3>
                <button
                  onClick={() => setShowEditCustomer(false)}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <CustomerLookup
                onSelect={handleEditCustomerSelect}
                onCreateNew={() => {
                  // Job-detail "Change Customer" doesn't expose creation here;
                  // operator is directed back to the POS customer lookup flow.
                  toast.error('Create the customer first via POS customer lookup, then change customer here');
                }}
              />
              {savingEdit && (
                <div className="mt-3 flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {showEditVehicle && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setShowEditVehicle(false)}>
          <div className="w-full max-w-sm rounded-t-xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/50 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Change Vehicle</h3>
                <button
                  onClick={() => setShowEditVehicle(false)}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loadingVehicles ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-500 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* No vehicle option */}
                  <button
                    onClick={() => handleEditVehicleSelect(null)}
                    disabled={savingEdit}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-50',
                      !job?.vehicle && 'bg-blue-50 dark:bg-blue-900/30'
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No vehicle</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Remove vehicle assignment</p>
                    </div>
                    {!job?.vehicle && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
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
                          'flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-50',
                          isCurrentVehicle && 'bg-blue-50 dark:bg-blue-900/30'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                        </div>
                        {isCurrentVehicle && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </button>
                    );
                  })}

                  {editVehicles.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                      No vehicles for this customer
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Mobile Service Modal — Phase Mobile-1.9.
          Replaces the Phase 1.6 address-only modal. Shared component;
          admin appointment dialog uses the same one with mode='admin'.
          In 'enable' mode the initial state is forced to is_mobile=true
          with blank fields so admin starts in the picker ready to set
          zone + address (creation-time parity). */}
      {editingMobile && job?.appointment?.id && (
        <EditMobileModal
          open
          mode="pos"
          appointmentId={job.appointment.id}
          initial={
            editingMobile === 'enable'
              ? {
                  is_mobile: true,
                  mobile_zone_id: null,
                  mobile_surcharge: 0,
                  mobile_address: null,
                  mobile_zone_name_snapshot: null,
                }
              : {
                  is_mobile: job.appointment.is_mobile ?? false,
                  mobile_zone_id: job.appointment.mobile_zone_id ?? null,
                  mobile_surcharge: Number(
                    job.appointment.mobile_surcharge ?? 0
                  ),
                  mobile_address: job.appointment.mobile_address ?? null,
                  mobile_zone_name_snapshot:
                    job.appointment.mobile_zone_name_snapshot ?? null,
                }
          }
          onClose={() => setEditingMobile(null)}
          onSaved={handleMobileEditSaved}
        />
      )}

      {/* Edit Notes Modal */}
      {editingNotes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEditingNotes(false)}>
          <div className="w-full max-w-sm rounded-t-xl bg-white dark:bg-gray-900 shadow-xl dark:shadow-gray-950/50 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit Notes</h3>
                <button
                  onClick={() => setEditingNotes(false)}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes about this job..."
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                rows={5}
                autoFocus
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setEditingNotes(false)}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingEdit}
                  className="flex-1 rounded-lg bg-blue-600 dark:bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Services Dialog — Item 15f Layer 3a. Canonical 2-pane
          surface backed by `useServicePicker`. Tier-aware pricing for
          all 6 pricing_model values (including custom assessments).
          Per CLAUDE.md Rule 22, no bespoke pricing math lives here. */}
      <EditServicesDialog
        open={showEditServices}
        onClose={() => setShowEditServices(false)}
        title="Edit Services"
        vehicleSizeClass={(job.vehicle?.size_class ?? null) as VehicleSizeClass | null}
        vehicleSpecialtyTier={null}
        selectedServices={editSelectedServices
          .filter((s): s is JobServiceSnapshot & { id: string } => s.id != null)
          .map((s) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            tier_name: s.tier_name ?? null,
            quantity: s.quantity,
          }))}
        onServiceAdded={handleEditServiceAdded}
        onServiceRemoved={handleEditServiceRemoved}
        onSave={handleSaveEditServices}
        isSaving={savingEdit}
        saveLabel="Update Services"
      />
    </div>
  );
}
