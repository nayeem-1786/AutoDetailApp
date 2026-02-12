'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Camera,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Lock,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { usePermission } from '@/lib/hooks/use-permission';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils/cn';
import {
  ALL_ZONES,
  getZoneLabel,
  getZoneGroup,
} from '@/lib/utils/job-zones';
import type { Annotation } from '@/lib/utils/job-zones';
import type { JobPhoto } from '@/lib/supabase/types';

interface PhotoWithJob extends JobPhoto {
  jobs: {
    id: string;
    status: string;
    services: { id: string; name: string; price: number }[];
    customer_id: string;
    vehicle_id: string | null;
    created_at: string;
    customers: { id: string; first_name: string; last_name: string } | null;
    vehicles: { id: string; year: number; make: string; model: string; color: string | null } | null;
    employees: { id: string; first_name: string; last_name: string } | null;
  };
}

const PHASE_OPTIONS = [
  { value: '', label: 'All Phases' },
  { value: 'intake', label: 'Intake' },
  { value: 'progress', label: 'Progress' },
  { value: 'completion', label: 'Completion' },
];

const PHASE_COLORS: Record<string, string> = {
  intake: 'bg-blue-500',
  progress: 'bg-yellow-500',
  completion: 'bg-green-500',
};

export default function AdminPhotosPage() {
  const { enabled: photoDocEnabled } = useFeatureFlag(FEATURE_FLAGS.PHOTO_DOCUMENTATION);
  const { granted: canView } = usePermission('admin.photos.view');
  const { granted: canManage } = usePermission('admin.photos.manage');

  const [photos, setPhotos] = useState<PhotoWithJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [zone, setZone] = useState('');
  const [phase, setPhase] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail modal
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Customer search debounce
  const customerTimerRef = useRef<NodeJS.Timeout>(undefined);
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const fetchPhotos = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(LIMIT));
      params.set('offset', String(newOffset));
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (selectedCustomerId) params.set('customer_id', selectedCustomerId);
      if (vehicleSearch.length >= 2) params.set('vehicle', vehicleSearch);
      if (zone) params.set('zone', zone);
      if (phase) params.set('phase', phase);

      const res = await adminFetch(`/api/admin/photos?${params}`);
      if (!res.ok) throw new Error('Failed to load photos');
      const json = await res.json();
      setPhotos(json.data);
      setTotal(json.total);
      setOffset(newOffset);
    } catch {
      toast.error('Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedCustomerId, vehicleSearch, zone, phase]);

  useEffect(() => {
    if (canView) fetchPhotos(0);
  }, [fetchPhotos, canView]);

  // Customer search
  const searchCustomers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const res = await adminFetch(`/api/admin/customers?search=${encodeURIComponent(term)}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const results = (json.data || []).map((c: { id: string; first_name: string; last_name: string }) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        }));
        setCustomerResults(results);
        setShowCustomerDropdown(true);
      }
    } catch { /* ignore */ }
  }, []);

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    if (customerTimerRef.current) clearTimeout(customerTimerRef.current);
    if (!value) {
      setSelectedCustomerId('');
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    customerTimerRef.current = setTimeout(() => searchCustomers(value), 300);
  };

  const selectCustomer = (c: { id: string; name: string }) => {
    setSelectedCustomerId(c.id);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(photos.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Bulk actions
  const bulkUpdate = async (updates: { is_featured?: boolean; is_internal?: boolean }) => {
    try {
      const res = await adminFetch('/api/admin/photos/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_ids: [...selectedIds], ...updates }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success(`Updated ${json.updated} photos`);
      setSelectedIds(new Set());
      fetchPhotos(offset);
    } catch {
      toast.error('Bulk update failed');
    }
  };

  // Single photo update (from modal)
  const updatePhoto = async (photoId: string, updates: Partial<Pick<JobPhoto, 'is_featured' | 'is_internal'>>) => {
    try {
      const res = await adminFetch(`/api/admin/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      // Optimistic update
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, ...updates } : p))
      );
    } catch {
      toast.error('Update failed');
    }
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setCustomerSearch('');
    setSelectedCustomerId('');
    setVehicleSearch('');
    setZone('');
    setPhase('');
  };

  const hasActiveFilters = dateFrom || dateTo || selectedCustomerId || vehicleSearch || zone || phase;

  if (!photoDocEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader title="Photo Gallery" description="Photo documentation is disabled" />
        <Card className="p-8 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            Enable the Photo Documentation feature flag in Settings to use this feature.
          </p>
        </Card>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Photo Gallery" description="Access denied" />
        <Card className="p-8 text-center">
          <Lock className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            You do not have permission to view photos.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photo Gallery"
        description={`${total} photo${total !== 1 ? 's' : ''}`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="mr-1.5 h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                !
              </span>
            )}
          </Button>
        }
      />

      {/* Filter bar */}
      {showFilters && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Date range */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>

            {/* Customer search */}
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-gray-500">Customer</label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => handleCustomerSearchChange(e.target.value)}
                onFocus={() => customerResults.length > 0 && setShowCustomerDropdown(true)}
                placeholder="Search customer..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border bg-white shadow-lg">
                  {customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vehicle search */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Vehicle</label>
              <input
                type="text"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Year make model..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>

            {/* Zone */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Zone</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              >
                <option value="">All Zones</option>
                <optgroup label="Exterior">
                  {ALL_ZONES.filter((z) => z.group === 'exterior').map((z) => (
                    <option key={z.key} value={z.key}>{z.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Interior">
                  {ALL_ZONES.filter((z) => z.group === 'interior').map((z) => (
                    <option key={z.key} value={z.key}>{z.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Phase */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              >
                {PHASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </Card>
      )}

      {/* Bulk actions bar */}
      {canManage && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_featured: true })}>
              <Star className="mr-1 h-3.5 w-3.5" /> Feature
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_featured: false })}>
              <StarOff className="mr-1 h-3.5 w-3.5" /> Unfeature
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_internal: true })}>
              <EyeOff className="mr-1 h-3.5 w-3.5" /> Internal
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_internal: false })}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Public
            </Button>
          </div>
          <button onClick={deselectAll} className="ml-auto text-xs text-blue-600 hover:underline">
            Deselect all
          </button>
        </div>
      )}

      {/* Select all control */}
      {canManage && photos.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={selectedIds.size === photos.length ? deselectAll : selectAll}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {selectedIds.size === photos.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      )}

      {/* Photo grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : photos.length === 0 ? (
        <Card className="p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            {hasActiveFilters ? 'No photos match your filters' : 'No job photos yet'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, i) => (
              <div key={photo.id} className="group relative">
                {/* Selection checkbox */}
                {canManage && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                    className="absolute left-1.5 top-1.5 z-10"
                  >
                    {selectedIds.has(photo.id) ? (
                      <CheckSquare className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Square className="h-5 w-5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                )}

                <button
                  onClick={() => setSelectedIndex(i)}
                  className={cn(
                    'relative aspect-square w-full overflow-hidden rounded-lg bg-gray-200',
                    selectedIds.has(photo.id) && 'ring-2 ring-blue-500'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnail_url || photo.image_url}
                    alt={`${getZoneLabel(photo.zone)} - ${photo.phase}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />

                  {/* Zone badge */}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {getZoneLabel(photo.zone)}
                  </span>

                  {/* Phase badge */}
                  <span
                    className={cn(
                      'absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white',
                      PHASE_COLORS[photo.phase] || 'bg-gray-500'
                    )}
                  >
                    {photo.phase}
                  </span>

                  {/* Status icons */}
                  <div className="absolute right-1 top-1 flex gap-0.5">
                    {photo.is_featured && (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    )}
                    {photo.is_internal && (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>

                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => fetchPhotos(Math.max(0, offset - LIMIT))}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + LIMIT >= total}
                onClick={() => fetchPhotos(offset + LIMIT)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Detail modal */}
      {selectedIndex !== null && photos[selectedIndex] && (
        <PhotoDetailModal
          photo={photos[selectedIndex]}
          index={selectedIndex}
          total={photos.length}
          canManage={canManage}
          onClose={() => setSelectedIndex(null)}
          onNavigate={setSelectedIndex}
          onUpdate={updatePhoto}
        />
      )}
    </div>
  );
}

// ─── Photo Detail Modal ────────────────────────────────────────────────────────

function PhotoDetailModal({
  photo,
  index,
  total,
  canManage,
  onClose,
  onNavigate,
  onUpdate,
}: {
  photo: PhotoWithJob;
  index: number;
  total: number;
  canManage: boolean;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onUpdate: (id: string, updates: Partial<Pick<JobPhoto, 'is_featured' | 'is_internal'>>) => void;
}) {
  const annotations = (photo.annotation_data ?? []) as Annotation[];
  const job = photo.jobs;
  const customer = job?.customers;
  const vehicle = job?.vehicles;
  const staff = job?.employees;

  const vehicleStr = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` (${vehicle.color})` : ''}`
    : 'N/A';

  const date = new Date(photo.created_at).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 flex bg-black">
      {/* Image area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.image_url}
          alt={`${getZoneLabel(photo.zone)} photo`}
          className="max-h-full max-w-full object-contain"
        />

        {/* Annotation overlay */}
        {annotations.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <marker id="detail-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" fill="#FF0000">
                <polygon points="0 0, 10 3.5, 0 7" />
              </marker>
            </defs>
            {annotations.map((ann, i) => {
              if (ann.type === 'circle') {
                return <ellipse key={i} cx={ann.x} cy={ann.y} rx={ann.radius} ry={ann.radius} fill="none" stroke={ann.color} strokeWidth="0.4" />;
              }
              if (ann.type === 'arrow') {
                return <line key={i} x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={ann.color} strokeWidth="0.4" markerEnd="url(#detail-arrow)" />;
              }
              if (ann.type === 'text') {
                return <text key={i} x={ann.x} y={ann.y} fill={ann.color} fontSize="3" fontWeight="bold" style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '0.3px' }}>{ann.label}</text>;
              }
              return null;
            })}
          </svg>
        )}

        {/* Navigation */}
        {index > 0 && (
          <button onClick={() => onNavigate(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < total - 1 && (
          <button onClick={() => onNavigate(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Metadata sidebar */}
      <div className="flex w-72 flex-col border-l border-gray-800 bg-gray-900 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <p className="text-sm font-medium">{index + 1} of {total}</p>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {/* Job link */}
          <div>
            <p className="text-xs text-gray-400">Job</p>
            <p className="text-gray-200">
              {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace(/_/g, ' ')}
            </p>
          </div>

          {/* Customer */}
          {customer && (
            <div>
              <p className="text-xs text-gray-400">Customer</p>
              <Link
                href={`/admin/customers/${customer.id}`}
                className="text-blue-400 hover:underline"
              >
                {customer.first_name} {customer.last_name}
              </Link>
            </div>
          )}

          {/* Vehicle */}
          <div>
            <p className="text-xs text-gray-400">Vehicle</p>
            <p className="text-gray-200">{vehicleStr}</p>
          </div>

          {/* Zone */}
          <div>
            <p className="text-xs text-gray-400">Zone</p>
            <p className="text-gray-200">
              {getZoneLabel(photo.zone)}{' '}
              <span className="text-gray-500">({getZoneGroup(photo.zone)})</span>
            </p>
          </div>

          {/* Phase */}
          <div>
            <p className="text-xs text-gray-400">Phase</p>
            <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium text-white', PHASE_COLORS[photo.phase] || 'bg-gray-500')}>
              {photo.phase}
            </span>
          </div>

          {/* Notes */}
          {photo.notes && (
            <div>
              <p className="text-xs text-gray-400">Notes</p>
              <p className="text-gray-200">{photo.notes}</p>
            </div>
          )}

          {/* Staff */}
          {staff && (
            <div>
              <p className="text-xs text-gray-400">Taken by</p>
              <p className="text-gray-200">{staff.first_name} {staff.last_name}</p>
            </div>
          )}

          {/* Timestamp */}
          <div>
            <p className="text-xs text-gray-400">Timestamp</p>
            <p className="text-gray-200">{date}</p>
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="border-t border-gray-800 p-4">
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate(photo.id, { is_featured: !photo.is_featured })}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  photo.is_featured
                    ? 'bg-yellow-500/20 text-yellow-300'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                )}
              >
                {photo.is_featured ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
                Featured
              </button>
              <button
                onClick={() => onUpdate(photo.id, { is_internal: !photo.is_internal })}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  photo.is_internal
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                )}
              >
                {photo.is_internal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                Internal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
