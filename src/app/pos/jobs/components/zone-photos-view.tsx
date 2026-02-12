'use client';

import { useState } from 'react';
import { ArrowLeft, Camera, Plus, Trash2, X } from 'lucide-react';
import { getZoneLabel } from '@/lib/utils/job-zones';
import { AnnotationOverlay } from './photo-annotation';
import { posFetch } from '../../lib/pos-fetch';
import type { JobPhoto, JobPhotoPhase } from '@/lib/supabase/types';
import type { Annotation } from '@/lib/utils/job-zones';

interface ZonePhotosViewProps {
  jobId: string;
  zone: string;
  phase: JobPhotoPhase;
  photos: JobPhoto[];
  onAddPhoto: () => void;
  onBack: () => void;
  onPhotosChanged: () => void;
}

export function ZonePhotosView({
  jobId,
  zone,
  phase,
  photos,
  onAddPhoto,
  onBack,
  onPhotosChanged,
}: ZonePhotosViewProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<JobPhoto | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(photoId: string) {
    setDeleting(photoId);
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onPhotosChanged();
        if (selectedPhoto?.id === photoId) setSelectedPhoto(null);
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
    } finally {
      setDeleting(null);
    }
  }

  // Full-size photo viewer
  if (selectedPhoto) {
    const annotations = (selectedPhoto.annotation_data ?? []) as Annotation[];
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex items-center justify-between bg-gray-900 px-4 py-2">
          <button onClick={() => setSelectedPhoto(null)} className="text-gray-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm text-gray-300">{getZoneLabel(zone)}</span>
          <button
            onClick={() => handleDelete(selectedPhoto.id)}
            disabled={deleting === selectedPhoto.id}
            className="text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedPhoto.image_url}
            alt={`${getZoneLabel(zone)} photo`}
            className="h-full w-full object-contain"
          />
          {annotations.length > 0 && <AnnotationOverlay annotations={annotations} />}
        </div>
        {selectedPhoto.notes && (
          <div className="bg-gray-900 px-4 py-2 text-sm text-gray-300">
            {selectedPhoto.notes}
          </div>
        )}
        {selectedPhoto.is_internal && (
          <div className="bg-amber-900/50 px-4 py-1 text-center text-xs text-amber-300">
            Internal Only
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{getZoneLabel(zone)}</h2>
          <p className="text-xs text-gray-500">
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onAddPhoto}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {/* Photo grid */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Camera className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No photos yet</p>
            <button
              onClick={onAddPhoto}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Take Photo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => {
              const annotations = (photo.annotation_data ?? []) as Annotation[];
              return (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnail_url || photo.image_url}
                    alt={`${getZoneLabel(zone)} photo`}
                    className="h-full w-full object-cover"
                  />
                  {annotations.length > 0 && (
                    <div className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {annotations.length}
                    </div>
                  )}
                  {photo.is_internal && (
                    <div className="absolute bottom-0 left-0 right-0 bg-amber-600/80 py-0.5 text-center text-[10px] text-white">
                      Internal
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
