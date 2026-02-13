'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Check, Camera, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import {
  EXTERIOR_ZONES,
  INTERIOR_ZONES,
  countCoveredZones,
} from '@/lib/utils/job-zones';
import { PhotoCapture } from './photo-capture';
import { ZonePhotosView } from './zone-photos-view';
import { getExteriorSilhouette, getInteriorSilhouette } from './vehicle-silhouettes';
import type { JobPhoto, JobPhotoPhase, VehicleSizeClass } from '@/lib/supabase/types';

type Tab = 'exterior' | 'interior';

interface ZonePickerProps {
  jobId: string;
  phase: JobPhotoPhase;
  minExterior: number;
  minInterior: number;
  onComplete: () => void;
  onBack: () => void;
  /** When true, calls the /complete API instead of PATCH */
  isCompletionFlow?: boolean;
  /** Vehicle size class determines which silhouette SVG to render. Falls back to sedan. */
  sizeClass?: VehicleSizeClass | string | null;
}

export function ZonePicker({
  jobId,
  phase,
  minExterior,
  minInterior,
  onComplete,
  onBack,
  isCompletionFlow = false,
  sizeClass,
}: ZonePickerProps) {
  const [tab, setTab] = useState<Tab>('exterior');
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [intakePhotos, setIntakePhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [captureZone, setCaptureZone] = useState<string | null>(null);
  const [viewZone, setViewZone] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/photos?phase=${phase}`);
      if (res.ok) {
        const { data } = await res.json();
        setPhotos(data ?? []);
      }
      // In completion mode, also load intake photos for side-by-side
      if (isCompletionFlow) {
        const intakeRes = await posFetch(`/api/pos/jobs/${jobId}/photos?phase=intake`);
        if (intakeRes.ok) {
          const { data } = await intakeRes.json();
          setIntakePhotos(data ?? []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch photos:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId, phase, isCompletionFlow]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Photo counts per zone
  const photoCounts: Record<string, number> = {};
  for (const p of photos) {
    photoCounts[p.zone] = (photoCounts[p.zone] ?? 0) + 1;
  }

  const exteriorCovered = countCoveredZones(photoCounts, 'exterior');
  const interiorCovered = countCoveredZones(photoCounts, 'interior');
  const exteriorMet = exteriorCovered >= minExterior;
  const interiorMet = interiorCovered >= minInterior;
  const allMet = exteriorMet && interiorMet;

  function handlePhotoSaved(photo: JobPhoto) {
    setPhotos((prev) => [...prev, photo]);
    setCaptureZone(null);
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      if (isCompletionFlow) {
        // Call the completion API which handles timer, gallery token, notifications
        const res = await posFetch(`/api/pos/jobs/${jobId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          onComplete();
        }
      } else {
        // Intake mode — just mark intake_completed_at
        const res = await posFetch(`/api/pos/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intake_completed_at: new Date().toISOString() }),
        });
        if (res.ok) {
          onComplete();
        }
      }
    } catch (err) {
      console.error(`Failed to complete ${isCompletionFlow ? 'job' : 'intake'}:`, err);
    } finally {
      setCompleting(false);
    }
  }

  // Show camera capture for a zone
  if (captureZone) {
    return (
      <PhotoCapture
        jobId={jobId}
        zone={captureZone}
        phase={phase}
        onSaved={handlePhotoSaved}
        onCancel={() => setCaptureZone(null)}
      />
    );
  }

  // Show photos for a zone
  if (viewZone) {
    return (
      <ZonePhotosView
        jobId={jobId}
        zone={viewZone}
        phase={phase}
        photos={photos.filter((p) => p.zone === viewZone)}
        onAddPhoto={() => {
          const z = viewZone;
          setViewZone(null);
          setCaptureZone(z);
        }}
        onBack={() => setViewZone(null)}
        onPhotosChanged={fetchPhotos}
      />
    );
  }

  const zones = tab === 'exterior' ? EXTERIOR_ZONES : INTERIOR_ZONES;

  // Get the correct silhouette component for this vehicle type
  const ExteriorSilhouette = getExteriorSilhouette(sizeClass);
  const InteriorSilhouette = getInteriorSilhouette(sizeClass);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">
            {phase === 'intake' ? 'Intake Photos' : phase === 'completion' ? 'Completion Photos' : 'Progress Photos'}
          </h1>
          <p className="text-xs text-gray-500">Tap a zone to capture photos</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              exteriorMet ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            )}
          >
            {exteriorCovered}/{minExterior} Exterior
          </span>
          <span className="text-gray-300">|</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              interiorMet ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            )}
          >
            {interiorCovered}/{minInterior} Interior
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {photos.length} photo{photos.length !== 1 ? 's' : ''} total
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {(['exterior', 'interior'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2.5 text-center text-sm font-medium transition-colors',
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'exterior' ? 'Exterior' : 'Interior'}
          </button>
        ))}
      </div>

      {/* SVG Vehicle Diagram + Zone List */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Vehicle SVG Diagram — vehicle-type-specific silhouette */}
            <div className="px-4 pt-4">
              {tab === 'exterior' ? (
                <ExteriorSilhouette photoCounts={photoCounts} onZoneTap={setCaptureZone} />
              ) : (
                <InteriorSilhouette photoCounts={photoCounts} onZoneTap={setCaptureZone} />
              )}
            </div>

            {/* Zone list */}
            <div className="space-y-1 px-4 pb-24 pt-3">
              {zones.map((zone) => {
                const count = photoCounts[zone.key] ?? 0;
                const hasPhotos = count > 0;
                // In completion mode, show intake photo thumbnail for reference
                const intakePhoto = isCompletionFlow
                  ? intakePhotos.find((p) => p.zone === zone.key)
                  : null;
                return (
                  <div
                    key={zone.key}
                    className="flex items-center rounded-lg bg-white shadow-sm"
                  >
                    {/* Zone info — taps to view existing photos */}
                    <button
                      onClick={() => hasPhotos ? setViewZone(zone.key) : setCaptureZone(zone.key)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                    >
                      {intakePhoto ? (
                        <img
                          src={intakePhoto.thumbnail_url || intakePhoto.image_url}
                          alt="Intake"
                          className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            hasPhotos ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {hasPhotos ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Camera className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{zone.label}</p>
                        <p className="text-xs text-gray-500">
                          {isCompletionFlow && intakePhoto
                            ? 'Tap to capture after photo'
                            : zone.description}
                        </p>
                      </div>
                      {hasPhotos && (
                        <span className="mr-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {count}
                        </span>
                      )}
                      {hasPhotos && <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </button>

                    {/* Quick capture button */}
                    <button
                      onClick={() => setCaptureZone(zone.key)}
                      className="flex items-center gap-1 border-l border-gray-100 px-3 py-3 text-blue-600 hover:bg-blue-50"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Complete button */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <button
          onClick={handleComplete}
          disabled={!allMet || completing}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
            allMet
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'cursor-not-allowed bg-gray-200 text-gray-400'
          )}
        >
          <Check className="h-4 w-4" />
          {completing
            ? (isCompletionFlow ? 'Completing Job...' : 'Completing...')
            : allMet
              ? (isCompletionFlow ? 'Complete Job' : `Complete ${phase === 'intake' ? 'Intake' : 'Photos'}`)
              : `Need ${!exteriorMet ? `${minExterior - exteriorCovered} more exterior` : ''} ${!exteriorMet && !interiorMet ? '& ' : ''}${!interiorMet ? `${minInterior - interiorCovered} more interior` : ''} zone${(!exteriorMet ? minExterior - exteriorCovered : 0) + (!interiorMet ? minInterior - interiorCovered : 0) !== 1 ? 's' : ''}`
          }
        </button>
      </div>
    </div>
  );
}
