'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Check, Camera, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import {
  EXTERIOR_ZONES,
  INTERIOR_ZONES,
  countCoveredZones,
  getZoneLabel,
} from '@/lib/utils/job-zones';
import { PhotoCapture } from './photo-capture';
import { ZonePhotosView } from './zone-photos-view';
import type { JobPhoto, JobPhotoPhase } from '@/lib/supabase/types';

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
}

export function ZonePicker({
  jobId,
  phase,
  minExterior,
  minInterior,
  onComplete,
  onBack,
  isCompletionFlow = false,
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
            {/* Vehicle SVG Diagram */}
            <div className="px-4 pt-4">
              {tab === 'exterior' ? (
                <ExteriorDiagram photoCounts={photoCounts} onZoneTap={setCaptureZone} />
              ) : (
                <InteriorDiagram photoCounts={photoCounts} onZoneTap={setCaptureZone} />
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

// ─── Exterior SVG Diagram (Top-Down View) ────────────────────────────────────

function ExteriorDiagram({
  photoCounts,
  onZoneTap,
}: {
  photoCounts: Record<string, number>;
  onZoneTap: (zone: string) => void;
}) {
  function zoneColor(key: string) {
    return (photoCounts[key] ?? 0) > 0 ? '#dcfce7' : '#fee2e2';
  }
  function zoneBorder(key: string) {
    return (photoCounts[key] ?? 0) > 0 ? '#16a34a' : '#dc2626';
  }

  return (
    <svg viewBox="0 0 300 480" className="mx-auto w-full max-w-[260px]">
      {/* Vehicle body outline — top-down view */}
      <path
        d="M 90 60 Q 90 30 150 20 Q 210 30 210 60 L 220 120 L 225 180 L 225 300 L 220 360 L 210 420 Q 210 450 150 460 Q 90 450 90 420 L 80 360 L 75 300 L 75 180 L 80 120 Z"
        fill="none"
        stroke="#d1d5db"
        strokeWidth="2"
      />

      {/* Windshield */}
      <path
        d="M 100 110 Q 150 95 200 110 L 195 140 Q 150 130 105 140 Z"
        fill="#e5e7eb"
        stroke="#d1d5db"
        strokeWidth="1"
      />
      {/* Rear window */}
      <path
        d="M 105 350 Q 150 340 195 350 L 200 375 Q 150 385 100 375 Z"
        fill="#e5e7eb"
        stroke="#d1d5db"
        strokeWidth="1"
      />

      {/* Tappable zone hotspots */}

      {/* Front */}
      <rect
        x="85" y="20" width="130" height="65"
        rx="8" fill={zoneColor('exterior_front')} stroke={zoneBorder('exterior_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_front')}
      />
      <text x="150" y="55" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Front</text>

      {/* Hood */}
      <rect
        x="85" y="90" width="130" height="60"
        rx="6" fill={zoneColor('exterior_hood')} stroke={zoneBorder('exterior_hood')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_hood')}
      />
      <text x="150" y="125" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Hood</text>

      {/* Roof */}
      <rect
        x="90" y="160" width="120" height="80"
        rx="6" fill={zoneColor('exterior_roof')} stroke={zoneBorder('exterior_roof')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_roof')}
      />
      <text x="150" y="205" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Roof</text>

      {/* Driver Side */}
      <rect
        x="30" y="160" width="50" height="160"
        rx="6" fill={zoneColor('exterior_driver_side')} stroke={zoneBorder('exterior_driver_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_driver_side')}
      />
      <text x="55" y="240" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500" transform="rotate(-90, 55, 240)">Driver Side</text>

      {/* Passenger Side */}
      <rect
        x="220" y="160" width="50" height="160"
        rx="6" fill={zoneColor('exterior_passenger_side')} stroke={zoneBorder('exterior_passenger_side')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_passenger_side')}
      />
      <text x="245" y="240" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500" transform="rotate(90, 245, 240)">Passenger Side</text>

      {/* Trunk */}
      <rect
        x="85" y="340" width="130" height="60"
        rx="6" fill={zoneColor('exterior_trunk')} stroke={zoneBorder('exterior_trunk')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_trunk')}
      />
      <text x="150" y="375" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Trunk</text>

      {/* Rear */}
      <rect
        x="85" y="405" width="130" height="60"
        rx="8" fill={zoneColor('exterior_rear')} stroke={zoneBorder('exterior_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_rear')}
      />
      <text x="150" y="440" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Rear</text>

      {/* Wheels */}
      <rect
        x="30" y="340" width="50" height="50"
        rx="6" fill={zoneColor('exterior_wheels')} stroke={zoneBorder('exterior_wheels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('exterior_wheels')}
      />
      <text x="55" y="369" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Wheels</text>

      {/* Photo count badges */}
      {EXTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          exterior_front: { x: 200, y: 35 },
          exterior_hood: { x: 200, y: 105 },
          exterior_roof: { x: 195, y: 175 },
          exterior_driver_side: { x: 65, y: 175 },
          exterior_passenger_side: { x: 255, y: 175 },
          exterior_trunk: { x: 200, y: 355 },
          exterior_rear: { x: 200, y: 420 },
          exterior_wheels: { x: 65, y: 355 },
        };
        const pos = positions[z.key];
        if (!pos) return null;
        return (
          <g key={z.key}>
            <circle cx={pos.x} cy={pos.y} r="10" fill="#2563eb" />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{count}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Interior SVG Diagram (Layout View) ──────────────────────────────────────

function InteriorDiagram({
  photoCounts,
  onZoneTap,
}: {
  photoCounts: Record<string, number>;
  onZoneTap: (zone: string) => void;
}) {
  function zoneColor(key: string) {
    return (photoCounts[key] ?? 0) > 0 ? '#dcfce7' : '#fee2e2';
  }
  function zoneBorder(key: string) {
    return (photoCounts[key] ?? 0) > 0 ? '#16a34a' : '#dc2626';
  }

  return (
    <svg viewBox="0 0 300 400" className="mx-auto w-full max-w-[260px]">
      {/* Vehicle interior outline */}
      <rect
        x="30" y="20" width="240" height="360" rx="20"
        fill="none" stroke="#d1d5db" strokeWidth="2"
      />

      {/* Dashboard */}
      <rect
        x="40" y="30" width="220" height="55"
        rx="8" fill={zoneColor('interior_dashboard')} stroke={zoneBorder('interior_dashboard')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_dashboard')}
      />
      <text x="150" y="62" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Dashboard</text>

      {/* Center Console */}
      <rect
        x="110" y="95" width="80" height="120"
        rx="6" fill={zoneColor('interior_console')} stroke={zoneBorder('interior_console')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_console')}
      />
      <text x="150" y="152" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Console</text>

      {/* Front Seats */}
      <rect
        x="40" y="95" width="60" height="70"
        rx="6" fill={zoneColor('interior_seats_front')} stroke={zoneBorder('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />
      <text x="70" y="134" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Front</text>
      <text x="70" y="144" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Seats</text>

      <rect
        x="200" y="95" width="60" height="70"
        rx="6" fill={zoneColor('interior_seats_front')} stroke={zoneBorder('interior_seats_front')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_front')}
      />

      {/* Door Panels */}
      <rect
        x="40" y="175" width="60" height="40"
        rx="6" fill={zoneColor('interior_door_panels')} stroke={zoneBorder('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />
      <text x="70" y="199" textAnchor="middle" fontSize="9" fill="#374151" fontWeight="500">Doors</text>

      <rect
        x="200" y="175" width="60" height="40"
        rx="6" fill={zoneColor('interior_door_panels')} stroke={zoneBorder('interior_door_panels')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_door_panels')}
      />

      {/* Rear Seats */}
      <rect
        x="40" y="225" width="220" height="50"
        rx="6" fill={zoneColor('interior_seats_rear')} stroke={zoneBorder('interior_seats_rear')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_seats_rear')}
      />
      <text x="150" y="255" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Rear Seats</text>

      {/* Carpet/Floor */}
      <rect
        x="40" y="285" width="220" height="45"
        rx="6" fill={zoneColor('interior_carpet')} stroke={zoneBorder('interior_carpet')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_carpet')}
      />
      <text x="150" y="312" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Carpet / Floor</text>

      {/* Trunk/Cargo */}
      <rect
        x="40" y="340" width="220" height="30"
        rx="6" fill={zoneColor('interior_trunk_cargo')} stroke={zoneBorder('interior_trunk_cargo')}
        strokeWidth="1.5" opacity="0.7" cursor="pointer"
        onClick={() => onZoneTap('interior_trunk_cargo')}
      />
      <text x="150" y="360" textAnchor="middle" fontSize="10" fill="#374151" fontWeight="500">Trunk / Cargo</text>

      {/* Photo count badges */}
      {INTERIOR_ZONES.map((z) => {
        const count = photoCounts[z.key] ?? 0;
        if (count === 0) return null;
        const positions: Record<string, { x: number; y: number }> = {
          interior_dashboard: { x: 245, y: 45 },
          interior_console: { x: 175, y: 110 },
          interior_seats_front: { x: 85, y: 110 },
          interior_seats_rear: { x: 245, y: 240 },
          interior_carpet: { x: 245, y: 300 },
          interior_door_panels: { x: 85, y: 190 },
          interior_trunk_cargo: { x: 245, y: 350 },
        };
        const pos = positions[z.key];
        if (!pos) return null;
        return (
          <g key={z.key}>
            <circle cx={pos.x} cy={pos.y} r="10" fill="#2563eb" />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{count}</text>
          </g>
        );
      })}
    </svg>
  );
}
