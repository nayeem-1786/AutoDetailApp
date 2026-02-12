'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Eye, EyeOff, Star, StarOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getZoneLabel, getZoneGroup } from '@/lib/utils/job-zones';
import type { Annotation } from '@/lib/utils/job-zones';
import type { JobPhoto } from '@/lib/supabase/types';

interface PhotoGalleryProps {
  photos: JobPhoto[];
  groupBy?: 'zone' | 'phase';
  showAnnotations?: boolean;
  editable?: boolean;
  onUpdatePhoto?: (photoId: string, updates: Partial<Pick<JobPhoto, 'is_featured' | 'is_internal'>>) => void;
}

export function PhotoGallery({
  photos,
  groupBy,
  showAnnotations = true,
  editable = false,
  onUpdatePhoto,
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <p className="text-sm">No photos</p>
      </div>
    );
  }

  // Group photos if needed
  let groups: { label: string; photos: JobPhoto[] }[] = [];

  if (groupBy === 'zone') {
    const zoneMap = new Map<string, JobPhoto[]>();
    for (const p of photos) {
      const existing = zoneMap.get(p.zone) ?? [];
      existing.push(p);
      zoneMap.set(p.zone, existing);
    }
    // Sort: exterior zones first, then interior
    const sortedKeys = [...zoneMap.keys()].sort((a, b) => {
      const groupA = getZoneGroup(a) === 'exterior' ? 0 : 1;
      const groupB = getZoneGroup(b) === 'exterior' ? 0 : 1;
      if (groupA !== groupB) return groupA - groupB;
      return a.localeCompare(b);
    });
    groups = sortedKeys.map((key) => ({
      label: getZoneLabel(key),
      photos: zoneMap.get(key)!,
    }));
  } else if (groupBy === 'phase') {
    const phaseOrder = ['intake', 'progress', 'completion'];
    const phaseLabels: Record<string, string> = {
      intake: 'Intake (Before)',
      progress: 'In Progress',
      completion: 'Completion (After)',
    };
    const phaseMap = new Map<string, JobPhoto[]>();
    for (const p of photos) {
      const existing = phaseMap.get(p.phase) ?? [];
      existing.push(p);
      phaseMap.set(p.phase, existing);
    }
    groups = phaseOrder
      .filter((phase) => phaseMap.has(phase))
      .map((phase) => ({
        label: phaseLabels[phase] ?? phase,
        photos: phaseMap.get(phase)!,
      }));
  } else {
    groups = [{ label: '', photos }];
  }

  // Flat list for navigation in modal
  const flatPhotos = groups.flatMap((g) => g.photos);

  return (
    <>
      <div className="space-y-4">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{group.label}</h3>
            )}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {group.photos.map((photo) => {
                const flatIndex = flatPhotos.indexOf(photo);
                const annotations = (photo.annotation_data ?? []) as Annotation[];
                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedIndex(flatIndex)}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-gray-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnail_url || photo.image_url}
                      alt={`${getZoneLabel(photo.zone)} photo`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {/* Badges */}
                    <div className="absolute right-1 top-1 flex gap-0.5">
                      {showAnnotations && annotations.length > 0 && (
                        <span className="rounded-full bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">
                          {annotations.length}
                        </span>
                      )}
                      {photo.is_featured && (
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    {photo.is_internal && (
                      <div className="absolute bottom-0 left-0 right-0 bg-amber-600/80 py-0.5 text-center text-[9px] text-white">
                        Internal
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Full-size modal */}
      {selectedIndex !== null && (
        <PhotoModal
          photos={flatPhotos}
          currentIndex={selectedIndex}
          showAnnotations={showAnnotations}
          editable={editable}
          onClose={() => setSelectedIndex(null)}
          onNavigate={setSelectedIndex}
          onUpdatePhoto={onUpdatePhoto}
        />
      )}
    </>
  );
}

// ─── Full-size Photo Modal ───────────────────────────────────────────────────

function PhotoModal({
  photos,
  currentIndex,
  showAnnotations,
  editable,
  onClose,
  onNavigate,
  onUpdatePhoto,
}: {
  photos: JobPhoto[];
  currentIndex: number;
  showAnnotations: boolean;
  editable: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onUpdatePhoto?: (photoId: string, updates: Partial<Pick<JobPhoto, 'is_featured' | 'is_internal'>>) => void;
}) {
  const photo = photos[currentIndex];
  if (!photo) return null;

  const annotations = (photo.annotation_data ?? []) as Annotation[];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div>
          <p className="text-sm font-medium text-white">{getZoneLabel(photo.zone)}</p>
          <p className="text-xs text-gray-400">
            {currentIndex + 1} of {photos.length}
            {photo.phase && ` — ${photo.phase}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable && onUpdatePhoto && (
            <>
              <button
                onClick={() =>
                  onUpdatePhoto(photo.id, { is_featured: !photo.is_featured })
                }
                className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
                title={photo.is_featured ? 'Remove from featured' : 'Mark as featured'}
              >
                {photo.is_featured ? (
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ) : (
                  <StarOff className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() =>
                  onUpdatePhoto(photo.id, { is_internal: !photo.is_internal })
                }
                className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
                title={photo.is_internal ? 'Make visible' : 'Mark as internal'}
              >
                {photo.is_internal ? (
                  <EyeOff className="h-5 w-5 text-amber-400" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.image_url}
          alt={`${getZoneLabel(photo.zone)} photo`}
          className="h-full w-full object-contain"
        />

        {/* Annotation overlay */}
        {showAnnotations && annotations.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="gallery-arrow"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
                fill="#FF0000"
              >
                <polygon points="0 0, 10 3.5, 0 7" />
              </marker>
            </defs>
            {annotations.map((ann, i) => {
              if (ann.type === 'circle') {
                return (
                  <ellipse
                    key={i}
                    cx={ann.x}
                    cy={ann.y}
                    rx={ann.radius}
                    ry={ann.radius}
                    fill="none"
                    stroke={ann.color}
                    strokeWidth="0.4"
                  />
                );
              }
              if (ann.type === 'arrow') {
                return (
                  <line
                    key={i}
                    x1={ann.x1}
                    y1={ann.y1}
                    x2={ann.x2}
                    y2={ann.y2}
                    stroke={ann.color}
                    strokeWidth="0.4"
                    markerEnd="url(#gallery-arrow)"
                  />
                );
              }
              if (ann.type === 'text') {
                return (
                  <text
                    key={i}
                    x={ann.x}
                    y={ann.y}
                    fill={ann.color}
                    fontSize="3"
                    fontWeight="bold"
                    style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '0.3px' }}
                  >
                    {ann.label}
                  </text>
                );
              }
              return null;
            })}
          </svg>
        )}

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Notes + metadata */}
      <div className="px-4 py-2">
        {photo.notes && (
          <p className="text-sm text-gray-300">{photo.notes}</p>
        )}
        {photo.is_internal && (
          <p className="text-xs text-amber-400">Internal Only</p>
        )}
      </div>
    </div>
  );
}
