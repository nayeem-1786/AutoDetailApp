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
  MousePointerClick,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { createClient } from '@/lib/supabase/client';
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

// ─── Types ──────────────────────────────────────────────────────────────────

interface PhotoResponse {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  zone: string;
  phase: string;
  notes: string | null;
  annotation_data: Annotation[] | null;
  is_featured: boolean;
  is_internal: boolean;
  created_at: string;
  job: {
    id: string;
    status: string;
    services: { id: string; name: string; price: number }[];
    created_at: string;
  } | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    color: string | null;
  } | null;
  taken_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PHASE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'intake', label: 'Intake' },
  { value: 'progress', label: 'Progress' },
  { value: 'completion', label: 'Completion' },
] as const;

const PHASE_COLORS: Record<string, string> = {
  intake: 'bg-blue-500',
  progress: 'bg-yellow-500',
  completion: 'bg-green-500',
};

const PHASE_PILL_COLORS: Record<string, string> = {
  '': 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  intake: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  progress: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  completion: 'bg-green-50 text-green-700 hover:bg-green-100',
};

const PHASE_PILL_ACTIVE: Record<string, string> = {
  '': 'bg-gray-900 text-white',
  intake: 'bg-blue-600 text-white',
  progress: 'bg-yellow-500 text-white',
  completion: 'bg-green-600 text-white',
};

const LIMIT = 20;

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPhotosPage() {
  const { enabled: photoDocEnabled } = useFeatureFlag(FEATURE_FLAGS.PHOTO_DOCUMENTATION);
  const { granted: canView } = usePermission('admin.photos.view');
  const { granted: canManage } = usePermission('admin.photos.manage');

  const [photos, setPhotos] = useState<PhotoResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [phase, setPhase] = useState('');
  const [zone, setZone] = useState('');
  const [staffId, setStaffId] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Customer search
  const customerTimerRef = useRef<NodeJS.Timeout>(undefined);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Staff list for dropdown
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail modal
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Load staff list for dropdown
  useEffect(() => {
    async function loadStaff() {
      const supabase = createClient();
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('first_name');
      if (data) setStaffList(data);
    }
    loadStaff();
  }, []);

  // Fetch photos
  const fetchPhotos = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(LIMIT));
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (selectedCustomerId) params.set('customer_id', selectedCustomerId);
      if (zone) params.set('zone', zone);
      if (phase) params.set('phase', phase);
      if (staffId) params.set('staff_id', staffId);
      if (featuredOnly) params.set('featured', 'true');
      if (search.length >= 2) params.set('search', search);

      const res = await adminFetch(`/api/admin/photos?${params}`);
      if (!res.ok) throw new Error('Failed to load photos');
      const json = await res.json();
      setPhotos(json.photos);
      setTotal(json.total);
      setPage(targetPage);
    } catch {
      toast.error('Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedCustomerId, zone, phase, staffId, featuredOnly, search]);

  useEffect(() => {
    if (canView) fetchPhotos(1);
  }, [fetchPhotos, canView]);

  // Customer search with debounce
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

  const selectAll = () => setSelectedIds(new Set(photos.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectMode(true);
    }
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
      toast.success(`Updated ${json.updated} photo${json.updated !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      fetchPhotos(page);
    } catch {
      toast.error('Bulk update failed');
    }
  };

  // Single photo update (from modal)
  const updatePhoto = async (photoId: string, updates: { is_featured?: boolean; is_internal?: boolean }) => {
    try {
      const res = await adminFetch(`/api/admin/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
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
    setZone('');
    setPhase('');
    setStaffId('');
    setFeaturedOnly(false);
    setSearch('');
  };

  const hasActiveFilters = dateFrom || dateTo || selectedCustomerId || zone || phase || staffId || featuredOnly || search;

  // ─── Render Guards ──────────────────────────────────────────────────────

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

  const totalPages = Math.ceil(total / LIMIT);

  // ─── Main Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Photo Gallery"
        description={`${total} photo${total !== 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-2">
            {canManage && (
              <Button
                variant={selectMode ? 'default' : 'outline'}
                size="sm"
                onClick={toggleSelectMode}
              >
                <MousePointerClick className="mr-1.5 h-4 w-4" />
                {selectMode ? 'Done' : 'Select'}
              </Button>
            )}
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
          </div>
        }
      />

      {/* Phase pills */}
      <div className="flex items-center gap-1.5">
        {PHASE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPhase(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              phase === opt.value
                ? PHASE_PILL_ACTIVE[opt.value]
                : PHASE_PILL_COLORS[opt.value]
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

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

            {/* Zone dropdown */}
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

            {/* Staff dropdown */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Taken By</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              >
                <option value="">All Staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
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

            {/* Text search */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Customer name or vehicle..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
              />
            </div>

            {/* Featured toggle */}
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={featuredOnly}
                  onChange={(e) => setFeaturedOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-gray-600">Featured only</span>
              </label>
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

      {/* Select mode controls */}
      {selectMode && photos.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <button
            onClick={selectedIds.size === photos.length ? deselectAll : selectAll}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            {selectedIds.size === photos.length ? 'Deselect all' : 'Select all'}
          </button>
          {selectedIds.size > 0 && (
            <span>({selectedIds.size} selected)</span>
          )}
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
          <h3 className="mt-3 text-sm font-medium text-gray-900">
            {hasActiveFilters ? 'No photos match your filters' : 'No photos yet'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {hasActiveFilters ? (
              <button onClick={clearFilters} className="text-blue-600 hover:underline">
                Clear filters
              </button>
            ) : (
              'Photos will appear here as your team documents jobs.'
            )}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, i) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                selectMode={selectMode}
                selected={selectedIds.has(photo.id)}
                onToggleSelect={() => toggleSelect(photo.id)}
                onClick={() => setSelectedIndex(i)}
                canManage={canManage}
                onToggleFeatured={() => updatePhoto(photo.id, { is_featured: !photo.is_featured })}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => fetchPhotos(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => fetchPhotos(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-xl">
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-gray-200" />
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_featured: true })}>
              <Star className="mr-1 h-3.5 w-3.5" /> Feature
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_featured: false })}>
              <StarOff className="mr-1 h-3.5 w-3.5" /> Unfeature
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_internal: true })}>
              <EyeOff className="mr-1 h-3.5 w-3.5" /> Mark Internal
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkUpdate({ is_internal: false })}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Mark Public
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <button onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        </div>
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

// ─── Photo Card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo,
  selectMode,
  selected,
  onToggleSelect,
  onClick,
  canManage,
  onToggleFeatured,
}: {
  photo: PhotoResponse;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  canManage: boolean;
  onToggleFeatured: () => void;
}) {
  const customerName = photo.customer
    ? `${photo.customer.first_name} ${photo.customer.last_name}`
    : null;

  const vehicleStr = photo.vehicle
    ? `${photo.vehicle.year} ${photo.vehicle.make} ${photo.vehicle.model}`
    : null;

  const date = new Date(photo.created_at).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group">
      {/* Image container */}
      <div className="relative">
        {/* Selection checkbox */}
        {selectMode && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className="absolute left-1.5 top-1.5 z-10"
          >
            {selected ? (
              <CheckSquare className="h-5 w-5 text-blue-600" />
            ) : (
              <Square className="h-5 w-5 text-white drop-shadow" />
            )}
          </button>
        )}

        <button
          onClick={selectMode ? onToggleSelect : onClick}
          className={cn(
            'relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100 transition-all duration-200',
            'group-hover:shadow-md group-hover:scale-[1.02]',
            selected && 'ring-2 ring-blue-500 ring-offset-1'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbnail_url || photo.image_url}
            alt={`${getZoneLabel(photo.zone)} - ${photo.phase}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />

          {/* Phase badge — top left */}
          <span
            className={cn(
              'absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white capitalize',
              selectMode ? 'left-8' : 'left-1.5',
              PHASE_COLORS[photo.phase] || 'bg-gray-500'
            )}
          >
            {photo.phase}
          </span>

          {/* Zone badge — bottom overlay */}
          <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-medium text-white">
            {getZoneLabel(photo.zone)}
          </span>

          {/* Status icons — top right */}
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            {photo.is_internal && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/40">
                <Lock className="h-3 w-3 text-amber-300" />
              </span>
            )}
          </div>

          <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
        </button>

        {/* Featured star — outside image, overlapping bottom-right */}
        {canManage && !selectMode && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFeatured(); }}
            className="absolute -bottom-1 -right-1 z-10 rounded-full bg-white p-1 shadow-sm transition-transform hover:scale-110"
            title={photo.is_featured ? 'Remove from featured' : 'Add to featured'}
          >
            {photo.is_featured ? (
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ) : (
              <Star className="h-4 w-4 text-gray-300" />
            )}
          </button>
        )}
      </div>

      {/* Card info below image */}
      <div className="mt-1.5 px-0.5">
        {customerName && (
          <p className="truncate text-xs font-medium text-gray-900">{customerName}</p>
        )}
        {vehicleStr && (
          <p className="truncate text-[11px] text-gray-500">{vehicleStr}</p>
        )}
        <p className="text-[11px] text-gray-400">{date}</p>
      </div>
    </div>
  );
}

// ─── Photo Detail Modal ───────────────────────────────────────────────────────

function PhotoDetailModal({
  photo,
  index,
  total,
  canManage,
  onClose,
  onNavigate,
  onUpdate,
}: {
  photo: PhotoResponse;
  index: number;
  total: number;
  canManage: boolean;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onUpdate: (id: string, updates: { is_featured?: boolean; is_internal?: boolean }) => void;
}) {
  const annotations = (photo.annotation_data ?? []) as Annotation[];

  const vehicleStr = photo.vehicle
    ? `${photo.vehicle.year} ${photo.vehicle.make} ${photo.vehicle.model}${photo.vehicle.color ? ` (${photo.vehicle.color})` : ''}`
    : 'N/A';

  const date = new Date(photo.created_at).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        onNavigate(index - 1);
      } else if (e.key === 'ArrowRight' && index < total - 1) {
        e.preventDefault();
        onNavigate(index + 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [index, total, onNavigate, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-black" onClick={onClose}>
      {/* Image area */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* Navigation arrows */}
        {index > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < total - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Metadata sidebar */}
      <div
        className="flex w-72 flex-col border-l border-gray-800 bg-gray-900 text-white"
        onClick={(e) => e.stopPropagation()}
      >
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
          {photo.job && (
            <div>
              <p className="text-xs text-gray-400">Job</p>
              <Link
                href={`/pos/jobs?jobId=${photo.job.id}`}
                className="text-blue-400 hover:underline"
                target="_blank"
              >
                {photo.job.status.charAt(0).toUpperCase() + photo.job.status.slice(1).replace(/_/g, ' ')}
              </Link>
              {photo.job.services && photo.job.services.length > 0 && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {photo.job.services.map((s) => s.name).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Customer */}
          {photo.customer && (
            <div>
              <p className="text-xs text-gray-400">Customer</p>
              <Link
                href={`/admin/customers/${photo.customer.id}`}
                className="text-blue-400 hover:underline"
              >
                {photo.customer.first_name} {photo.customer.last_name}
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
            <span className={cn('inline-block rounded px-2 py-0.5 text-xs font-medium text-white capitalize', PHASE_COLORS[photo.phase] || 'bg-gray-500')}>
              {photo.phase}
            </span>
          </div>

          {/* Taken by */}
          {photo.taken_by && (
            <div>
              <p className="text-xs text-gray-400">Taken by</p>
              <p className="text-gray-200">{photo.taken_by.first_name} {photo.taken_by.last_name}</p>
            </div>
          )}

          {/* Notes */}
          {photo.notes && (
            <div>
              <p className="text-xs text-gray-400">Notes</p>
              <p className="text-gray-200">{photo.notes}</p>
            </div>
          )}

          {/* Timestamp */}
          <div>
            <p className="text-xs text-gray-400">Date & Time</p>
            <p className="text-gray-200">{date}</p>
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div className="border-t border-gray-800 p-4 space-y-2">
            {/* Featured toggle */}
            <button
              onClick={() => onUpdate(photo.id, { is_featured: !photo.is_featured })}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors',
                photo.is_featured
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              <span className="flex items-center gap-1.5">
                {photo.is_featured ? <Star className="h-3.5 w-3.5 fill-current" /> : <Star className="h-3.5 w-3.5" />}
                Featured on website
              </span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px]',
                photo.is_featured ? 'bg-yellow-500/30' : 'bg-gray-700'
              )}>
                {photo.is_featured ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Internal toggle */}
            <button
              onClick={() => onUpdate(photo.id, { is_internal: !photo.is_internal })}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors',
                photo.is_internal
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              )}
            >
              <span className="flex items-center gap-1.5">
                {photo.is_internal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                Internal only
              </span>
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px]',
                photo.is_internal ? 'bg-amber-500/30' : 'bg-gray-700'
              )}>
                {photo.is_internal ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
