'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Check } from 'lucide-react';
import type { PhotoPair } from '@/lib/email/types';

interface GalleryPhoto {
  before_url: string;
  before_thumbnail?: string;
  after_url: string;
  after_thumbnail?: string;
  zone: string;
  tags: string[];
  created_at: string;
}

interface PhotoGalleryPickerProps {
  selectedPairs: PhotoPair[];
  onSelect: (pairs: PhotoPair[]) => void;
  maxPairs?: number;
}

export function PhotoGalleryPicker({ selectedPairs, onSelect, maxPairs = 4 }: PhotoGalleryPickerProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneFilter, tagFilter]);

  async function loadPhotos() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (zoneFilter) params.set('zone', zoneFilter);
      if (tagFilter) params.set('tag', tagFilter);

      const res = await adminFetch(`/api/admin/email-templates/gallery-photos?${params}`, { cache: 'no-store' });
      const json = await res.json();
      setPhotos(json.pairs || []);
      if (json.filters) {
        setZones(json.filters.zones || []);
        setTags(json.filters.tags || []);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  function isSelected(photo: GalleryPhoto): boolean {
    return selectedPairs.some(
      (p) => p.before_url === photo.before_url && p.after_url === photo.after_url
    );
  }

  function togglePhoto(photo: GalleryPhoto) {
    if (isSelected(photo)) {
      onSelect(selectedPairs.filter(
        (p) => p.before_url !== photo.before_url || p.after_url !== photo.after_url
      ));
    } else if (selectedPairs.length < maxPairs) {
      onSelect([
        ...selectedPairs,
        {
          before_url: photo.before_url,
          after_url: photo.after_url,
          caption: photo.zone ? photo.zone.replace(/_/g, ' ') : undefined,
        },
      ]);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="w-40">
          <option value="">All Zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
          ))}
        </Select>
        <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="w-40">
          <option value="">All Tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-gray-400">
          {selectedPairs.length}/{maxPairs} selected
        </span>
      </div>

      {/* Photo grid */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No featured before/after pairs found.</p>
          <p className="mt-1 text-xs text-gray-400">Mark photos as featured in the Photos admin.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo, i) => {
            const selected = isSelected(photo);
            const disabled = !selected && selectedPairs.length >= maxPairs;
            return (
              <button
                key={`${photo.before_url}-${i}`}
                type="button"
                onClick={() => !disabled && togglePhoto(photo)}
                className={`relative rounded-lg border-2 p-2 text-left transition ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : disabled
                    ? 'cursor-not-allowed border-gray-200 opacity-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {selected && (
                  <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">Before</p>
                    <img
                      src={photo.before_thumbnail || photo.before_url}
                      alt="Before"
                      className="h-20 w-full rounded object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">After</p>
                    <img
                      src={photo.after_thumbnail || photo.after_url}
                      alt="After"
                      className="h-20 w-full rounded object-cover"
                    />
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{photo.zone?.replace(/_/g, ' ') || 'Unknown zone'}</span>
                  {photo.tags?.length > 0 && (
                    <span className="text-xs text-gray-400">{photo.tags.join(', ')}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected summary */}
      {selectedPairs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Selected pairs:</p>
          {selectedPairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5">
              <span className="flex-1 text-xs text-gray-600">{pair.caption || `Pair ${i + 1}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelect(selectedPairs.filter((_, j) => j !== i))}
                className="h-6 px-2 text-xs text-gray-400"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
