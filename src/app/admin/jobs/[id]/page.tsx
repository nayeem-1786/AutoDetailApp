'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { getZoneLabel } from '@/lib/utils/job-zones';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import {
  ArrowLeft,
  User,
  Car,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  Camera,
  Footprints,
  CalendarDays,
  ExternalLink,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JobService {
  id: string;
  name: string;
  price: number;
}

interface JobAddonEnriched {
  id: string;
  service_id: string | null;
  product_id: string | null;
  custom_description: string | null;
  price: number;
  discount_amount: number;
  status: string;
  message_to_customer: string | null;
  issue_type: string | null;
  issue_description: string | null;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  pickup_delay_minutes: number;
  photo_ids: string[];
  created_at: string;
  service_name: string | null;
  product_name: string | null;
}

interface JobPhoto {
  id: string;
  job_id: string;
  zone: string;
  phase: string;
  image_url: string;
  thumbnail_url: string | null;
  storage_path: string;
  notes: string | null;
  annotation_data: unknown;
  is_featured: boolean;
  is_internal: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

interface JobDetail {
  id: string;
  status: string;
  services: JobService[];
  timer_seconds: number;
  work_started_at: string | null;
  work_completed_at: string | null;
  intake_started_at: string | null;
  intake_completed_at: string | null;
  intake_notes: string | null;
  estimated_pickup_at: string | null;
  actual_pickup_at: string | null;
  pickup_notes: string | null;
  appointment_id: string | null;
  transaction_id: string | null;
  gallery_token: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  customer: { id: string; first_name: string; last_name: string; phone: string; email: string } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null; size_class: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  addons: JobAddonEnriched[];
  photos_by_phase: Record<string, JobPhoto[]>;
  photo_creators: Record<string, string>;
  transaction: { id: string; total: number; payment_method: string; transaction_date: string } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  intake: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  pending_approval: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  intake: 'Intake',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const ADDON_STATUS_CLASSES: Record<string, string> = {
  approved: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-600',
  pending: 'bg-orange-50 text-orange-700',
  expired: 'bg-gray-100 text-gray-500',
};

const ADDON_STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  declined: 'Declined',
  pending: 'Pending',
  expired: 'Expired',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h} hour${h > 1 ? 's' : ''} ${m} min`;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''}`;
  return `${m} min`;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Los_Angeles',
  });
}

function formatJobDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function formatVehicle(
  v: { year: number | null; make: string | null; model: string | null; color: string | null } | null
): string {
  if (!v) return 'No vehicle';
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.join(' ') || 'No vehicle';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [lightboxPhoto, setLightboxPhoto] = useState<JobPhoto | null>(null);
  const [togglingFeatured, setTogglingFeatured] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await adminFetch(`/api/admin/jobs/${id}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job);
        }
      } catch (err) {
        console.error('Failed to load job:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleToggleFeatured = async (photo: JobPhoto) => {
    if (togglingFeatured.has(photo.id)) return;
    const newValue = !photo.is_featured;

    // Optimistic update
    setJob((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, photos_by_phase: { ...prev.photos_by_phase } };
      for (const phase of Object.keys(updated.photos_by_phase)) {
        updated.photos_by_phase[phase] = updated.photos_by_phase[phase].map((p) =>
          p.id === photo.id ? { ...p, is_featured: newValue } : p
        );
      }
      return updated;
    });

    setTogglingFeatured((prev) => new Set(prev).add(photo.id));
    try {
      const res = await adminFetch(`/api/admin/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: newValue }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(newValue ? 'Photo featured' : 'Photo unfeatured');
    } catch {
      // Revert on error
      setJob((prev) => {
        if (!prev) return prev;
        const reverted = { ...prev, photos_by_phase: { ...prev.photos_by_phase } };
        for (const phase of Object.keys(reverted.photos_by_phase)) {
          reverted.photos_by_phase[phase] = reverted.photos_by_phase[phase].map((p) =>
            p.id === photo.id ? { ...p, is_featured: !newValue } : p
          );
        }
        return reverted;
      });
      toast.error('Failed to update photo');
    } finally {
      setTogglingFeatured((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/admin/jobs')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
        </Button>
        <div className="py-12 text-center text-gray-400">Job not found</div>
      </div>
    );
  }

  const servicesTotal = job.services.reduce((sum, s) => sum + s.price, 0);
  const approvedAddons = job.addons.filter((a) => a.status === 'approved');
  const addonsTotal = approvedAddons.reduce((sum, a) => sum + a.price - a.discount_amount, 0);
  const grandTotal = servicesTotal + addonsTotal;

  const intakePhotos = job.photos_by_phase.intake || [];
  const progressPhotos = job.photos_by_phase.progress || [];
  const completionPhotos = job.photos_by_phase.completion || [];
  const totalPhotos = intakePhotos.length + progressPhotos.length + completionPhotos.length;

  // Group photos by zone for before/after matching
  const photosByZone: Record<string, { intake: JobPhoto[]; completion: JobPhoto[] }> = {};
  for (const p of intakePhotos) {
    if (!photosByZone[p.zone]) photosByZone[p.zone] = { intake: [], completion: [] };
    photosByZone[p.zone].intake.push(p);
  }
  for (const p of completionPhotos) {
    if (!photosByZone[p.zone]) photosByZone[p.zone] = { intake: [], completion: [] };
    photosByZone[p.zone].completion.push(p);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/jobs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {job.customer
                  ? `${job.customer.first_name} ${job.customer.last_name}`
                  : 'Unknown Customer'}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[job.status] || 'bg-gray-100 text-gray-700'}`}
              >
                {STATUS_LABELS[job.status] || job.status}
              </span>
              {job.appointment_id ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                  <CalendarDays className="h-3 w-3" /> Appointment
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Footprints className="h-3 w-3" /> Walk-In
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {formatJobDate(job.created_at)}
              {job.vehicle && ` \u2022 ${formatVehicle(job.vehicle)}`}
              {job.vehicle?.color && ` (${job.vehicle.color})`}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="photos">
            Photos {totalPhotos > 0 && `(${totalPhotos})`}
          </TabsTrigger>
        </TabsList>

        {/* ====================== OVERVIEW TAB ====================== */}
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column — main content */}
            <div className="space-y-6 lg:col-span-2">
              {/* Job Summary */}
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-lg font-semibold text-gray-900">Job Summary</h2>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Customer</p>
                        {job.customer ? (
                          <Link
                            href={`/admin/customers/${job.customer.id}`}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {job.customer.first_name} {job.customer.last_name}
                          </Link>
                        ) : (
                          <p className="text-sm text-gray-600">-</p>
                        )}
                        {job.customer?.phone && (
                          <p className="text-xs text-gray-400">{job.customer.phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Car className="mt-0.5 h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Vehicle</p>
                        <p className="text-sm text-gray-700">{formatVehicle(job.vehicle)}</p>
                        {job.vehicle?.color && (
                          <p className="text-xs text-gray-400">{job.vehicle.color}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Assigned Staff</p>
                        <p className="text-sm text-gray-700">
                          {job.assigned_staff
                            ? `${job.assigned_staff.first_name} ${job.assigned_staff.last_name || ''}`.trim()
                            : 'Unassigned'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Timer className="mt-0.5 h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium uppercase text-gray-500">Duration</p>
                        <p className="text-sm text-gray-700">
                          {formatDuration(job.timer_seconds)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardContent className="space-y-3 p-6">
                  <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
                  <div className="space-y-2">
                    <TimelineRow
                      label="Job Created"
                      timestamp={job.created_at}
                      icon={<Calendar className="h-4 w-4" />}
                      color="gray"
                    />
                    {job.intake_started_at && (
                      <TimelineRow
                        label="Intake Started"
                        timestamp={job.intake_started_at}
                        icon={<Camera className="h-4 w-4" />}
                        color="blue"
                      />
                    )}
                    {job.intake_completed_at && (
                      <TimelineRow
                        label="Intake Completed"
                        timestamp={job.intake_completed_at}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        color="blue"
                      />
                    )}
                    {job.work_started_at && (
                      <TimelineRow
                        label="Work Started"
                        timestamp={job.work_started_at}
                        icon={<Clock className="h-4 w-4" />}
                        color="yellow"
                      />
                    )}
                    {job.work_completed_at && (
                      <TimelineRow
                        label="Work Completed"
                        timestamp={job.work_completed_at}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        color="green"
                      />
                    )}
                    {job.actual_pickup_at && (
                      <TimelineRow
                        label="Customer Pickup"
                        timestamp={job.actual_pickup_at}
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        color="green"
                      />
                    )}
                    {job.cancelled_at && (
                      <TimelineRow
                        label="Cancelled"
                        timestamp={job.cancelled_at}
                        icon={<XCircle className="h-4 w-4" />}
                        color="red"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Services */}
              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-lg font-semibold text-gray-900">Original Services</h2>
                  <div className="divide-y">
                    {job.services.map((svc, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <span className="text-sm text-gray-700">{svc.name}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(svc.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium text-gray-700">Services Subtotal</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(servicesTotal)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Add-ons */}
              {job.addons.length > 0 && (
                <Card>
                  <CardContent className="space-y-4 p-6">
                    <h2 className="text-lg font-semibold text-gray-900">Add-On Services</h2>
                    <div className="divide-y">
                      {job.addons.map((addon) => (
                        <div key={addon.id} className="space-y-1 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700">
                                {addon.service_name ||
                                  addon.product_name ||
                                  addon.custom_description ||
                                  'Custom Item'}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ADDON_STATUS_CLASSES[addon.status] || 'bg-gray-100 text-gray-600'}`}
                              >
                                {ADDON_STATUS_LABELS[addon.status] || addon.status}
                              </span>
                            </div>
                            <div className="text-right">
                              {addon.discount_amount > 0 ? (
                                <div>
                                  <span className="mr-2 text-xs text-gray-400 line-through">
                                    {formatCurrency(addon.price)}
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {formatCurrency(addon.price - addon.discount_amount)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm font-medium text-gray-900">
                                  {formatCurrency(addon.price)}
                                </span>
                              )}
                            </div>
                          </div>
                          {addon.responded_at && (
                            <p className="text-xs text-gray-400">
                              {addon.status === 'approved'
                                ? `Approved ${formatTimestamp(addon.responded_at)}`
                                : addon.status === 'declined'
                                  ? `Declined ${formatTimestamp(addon.responded_at)}`
                                  : ''}
                            </p>
                          )}
                          {addon.issue_type && (
                            <p className="text-xs text-gray-400">
                              Issue: {addon.issue_type.replace(/_/g, ' ')}
                              {addon.issue_description ? ` - ${addon.issue_description}` : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {approvedAddons.length > 0 && (
                      <div className="flex items-center justify-between border-t pt-3">
                        <span className="text-sm font-medium text-gray-700">
                          Add-ons Subtotal (approved)
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(addonsTotal)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pickup Notes */}
              {job.pickup_notes && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="mb-2 text-lg font-semibold text-gray-900">Pickup Notes</h2>
                    <p className="text-sm text-gray-600">{job.pickup_notes}</p>
                    {job.actual_pickup_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        Picked up {formatTimestamp(job.actual_pickup_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Cancellation */}
              {job.cancellation_reason && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="mb-2 text-lg font-semibold text-red-700">Cancellation</h2>
                    <p className="text-sm text-gray-600">{job.cancellation_reason}</p>
                    {job.cancelled_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        Cancelled {formatTimestamp(job.cancelled_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column — sidebar */}
            <div className="space-y-6">
              {/* Totals Card */}
              <Card>
                <CardContent className="space-y-3 p-6">
                  <h3 className="text-sm font-semibold uppercase text-gray-500">Totals</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Services</span>
                    <span className="text-sm text-gray-700">{formatCurrency(servicesTotal)}</span>
                  </div>
                  {approvedAddons.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Add-ons</span>
                      <span className="text-sm text-gray-700">{formatCurrency(addonsTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-sm font-semibold text-gray-900">Grand Total</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                  {job.transaction && (
                    <Link
                      href={`/admin/transactions?txn=${job.transaction.id}`}
                      className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Transaction ({formatCurrency(job.transaction.total)})
                    </Link>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardContent className="space-y-3 p-6">
                  <h3 className="text-sm font-semibold uppercase text-gray-500">Quick Stats</h3>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Camera className="h-3.5 w-3.5" /> Photos
                    </span>
                    <span className="text-sm font-medium text-gray-700">{totalPhotos}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Clock className="h-3.5 w-3.5" /> Duration
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {formatDuration(job.timer_seconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Services</span>
                    <span className="text-sm font-medium text-gray-700">{job.services.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Add-ons</span>
                    <span className="text-sm font-medium text-gray-700">{job.addons.length}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Intake Notes */}
              {job.intake_notes && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                      Intake Notes
                    </h3>
                    <p className="text-sm text-gray-600">{job.intake_notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ====================== PHOTOS TAB ====================== */}
        <TabsContent value="photos">
          {totalPhotos === 0 ? (
            <div className="py-16 text-center">
              <Camera className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-gray-400">No photos for this job</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Photo summary */}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{intakePhotos.length} Intake</span>
                <span className="text-gray-300">&middot;</span>
                <span>{progressPhotos.length} Progress</span>
                <span className="text-gray-300">&middot;</span>
                <span>{completionPhotos.length} Completion</span>
              </div>

              {/* Before/After zones */}
              {Object.keys(photosByZone).length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900">Before & After</h3>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {Object.entries(photosByZone).map(([zone, photos]) => {
                      if (photos.intake.length === 0 || photos.completion.length === 0) return null;
                      return (
                        <div key={zone} className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">{getZoneLabel(zone)}</p>
                          <BeforeAfterSlider
                            beforeSrc={photos.intake[0].image_url}
                            afterSrc={photos.completion[0].image_url}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Intake Photos */}
              {intakePhotos.length > 0 && (
                <PhotoSection
                  title="Intake Photos"
                  photos={intakePhotos}
                  creators={job.photo_creators}
                  onPhotoClick={setLightboxPhoto}
                  onToggleFeatured={handleToggleFeatured}
                />
              )}

              {/* Progress Photos */}
              {progressPhotos.length > 0 && (
                <PhotoSection
                  title="Progress Photos"
                  subtitle="Internal documentation"
                  photos={progressPhotos}
                  creators={job.photo_creators}
                  onPhotoClick={setLightboxPhoto}
                  onToggleFeatured={handleToggleFeatured}
                />
              )}

              {/* Completion Photos */}
              {completionPhotos.length > 0 && (
                <PhotoSection
                  title="Completion Photos"
                  photos={completionPhotos}
                  creators={job.photo_creators}
                  onPhotoClick={setLightboxPhoto}
                  onToggleFeatured={handleToggleFeatured}
                />
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            >
              <XCircle className="h-5 w-5" />
            </button>
            <img
              src={lightboxPhoto.image_url}
              alt={`${getZoneLabel(lightboxPhoto.zone)} - ${lightboxPhoto.phase}`}
              className="max-h-[70vh] w-full object-contain"
            />
            <div className="border-t bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {getZoneLabel(lightboxPhoto.zone)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lightboxPhoto.phase.charAt(0).toUpperCase() + lightboxPhoto.phase.slice(1)}
                    {lightboxPhoto.created_by && job.photo_creators[lightboxPhoto.created_by]
                      ? ` \u2022 ${job.photo_creators[lightboxPhoto.created_by]}`
                      : ''}
                    {' \u2022 '}
                    {formatTimestamp(lightboxPhoto.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {lightboxPhoto.is_featured && (
                    <Badge variant="warning">Featured</Badge>
                  )}
                  {lightboxPhoto.is_internal && (
                    <Badge variant="secondary">Internal</Badge>
                  )}
                </div>
              </div>
              {lightboxPhoto.notes && (
                <p className="mt-2 text-sm text-gray-600">{lightboxPhoto.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimelineRow({
  label,
  timestamp,
  icon,
  color,
}: {
  label: string;
  timestamp: string;
  icon: React.ReactNode;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    gray: 'text-gray-400',
    blue: 'text-blue-500',
    yellow: 'text-yellow-500',
    green: 'text-green-500',
    red: 'text-red-500',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`${colorClasses[color] || colorClasses.gray}`}>{icon}</div>
      <div className="flex-1">
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className="text-xs text-gray-400">{formatTimestamp(timestamp)}</span>
    </div>
  );
}

function PhotoSection({
  title,
  subtitle,
  photos,
  creators,
  onPhotoClick,
  onToggleFeatured,
}: {
  title: string;
  subtitle?: string;
  photos: JobPhoto[];
  creators: Record<string, string>;
  onPhotoClick: (photo: JobPhoto) => void;
  onToggleFeatured: (photo: JobPhoto) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
            onClick={() => onPhotoClick(photo)}
          >
            <img
              src={photo.thumbnail_url || photo.image_url}
              alt={getZoneLabel(photo.zone)}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
              <p className="text-xs font-medium text-white">{getZoneLabel(photo.zone)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFeatured(photo);
              }}
              className="absolute right-1.5 top-1.5 rounded-full p-1 transition-colors hover:bg-black/30"
              title={photo.is_featured ? 'Remove from featured' : 'Feature for marketing'}
            >
              <Star
                className={`h-4 w-4 ${photo.is_featured ? 'fill-yellow-400 text-yellow-400' : 'text-white/70 hover:text-white'}`}
              />
            </button>
            {photo.is_internal && (
              <div className="absolute left-1 top-1 rounded-full bg-gray-700 p-0.5">
                <AlertCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
