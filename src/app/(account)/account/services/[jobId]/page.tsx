'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { getZoneLabel } from '@/lib/utils/job-zones';
import {
  ArrowLeft,
  Camera,
  Clock,
  User,
  Car,
  Wrench,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PhotoItem {
  id: string;
  zone: string;
  zone_label: string;
  image_url: string;
  thumbnail_url: string | null;
}

interface JobDetail {
  id: string;
  date: string;
  status: string;
  timer_seconds: number;
  vehicle: {
    year: number;
    make: string;
    model: string;
    color: string | null;
  } | null;
  services: { name: string; price: number }[];
  addons: { name: string; status: string }[];
  staff: { first_name: string } | null;
  gallery_token: string | null;
  photo_count: number;
  photos: {
    intake: PhotoItem[];
    completion: PhotoItem[];
  };
  picked_up_at: string | null;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && mins > 0) return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${mins} min`;
}

export default function ServiceDetailPage() {
  const { customer } = useCustomerAuth();
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const loadJob = useCallback(async () => {
    if (!customer || !jobId) return;
    try {
      const res = await fetch(`/api/account/services/${jobId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setJob(json.job);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [customer, jobId]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold text-site-text">Service not found</h2>
        <p className="mt-2 text-sm text-site-text-dim">
          This service record doesn&apos;t exist or isn&apos;t available.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/account/services')}>
          Back to Service History
        </Button>
      </div>
    );
  }

  const dateFormatted = new Date(job.date).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const vehicleStr = job.vehicle
    ? `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}${job.vehicle.color ? ` — ${job.vehicle.color}` : ''}`
    : null;

  const duration = formatDuration(job.timer_seconds);

  // Build zone pairs for photos section
  const zoneMap = new Map<string, { intake: PhotoItem | null; completion: PhotoItem | null }>();
  for (const p of job.photos.intake) {
    if (!zoneMap.has(p.zone)) zoneMap.set(p.zone, { intake: null, completion: null });
    if (!zoneMap.get(p.zone)!.intake) zoneMap.get(p.zone)!.intake = p;
  }
  for (const p of job.photos.completion) {
    if (!zoneMap.has(p.zone)) zoneMap.set(p.zone, { intake: null, completion: null });
    if (!zoneMap.get(p.zone)!.completion) zoneMap.get(p.zone)!.completion = p;
  }

  const sortedZones = [...zoneMap.keys()].sort((a, b) => {
    if (a.startsWith('exterior_') && b.startsWith('interior_')) return -1;
    if (a.startsWith('interior_') && b.startsWith('exterior_')) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/account/services')}
        className="flex items-center gap-1 text-sm text-site-text-dim hover:text-site-text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Service History
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-site-text">{dateFormatted}</h1>
        {vehicleStr && (
          <p className="mt-1 text-site-text-faint">{vehicleStr}</p>
        )}
      </div>

      {/* Service Summary Card */}
      <div className="rounded-lg border border-site-border bg-brand-surface">
        {/* Services Performed */}
        <div className="border-b border-site-border p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-site-text">
            <Wrench className="h-4 w-4 text-site-text-muted" />
            Services Performed
          </div>
          <ul className="space-y-1.5">
            {job.services.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-site-text-muted">{s.name}</span>
                <span className="font-medium text-site-text">${s.price.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Add-ons */}
        {job.addons.length > 0 && (
          <div className="border-b border-site-border p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-site-text">
              <Plus className="h-4 w-4 text-site-text-muted" />
              Additional Services
            </div>
            <p className="mb-2 text-xs text-site-text-muted">Added during your visit</p>
            <ul className="space-y-1.5">
              {job.addons.map((a, i) => (
                <li key={i} className="text-sm text-site-text-muted">{a.name}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Details row */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 p-5">
          {/* Vehicle */}
          {vehicleStr && (
            <div className="flex items-center gap-2 text-sm text-site-text-faint">
              <Car className="h-4 w-4 text-site-text-muted" />
              {vehicleStr}
            </div>
          )}

          {/* Duration */}
          {duration && (
            <div className="flex items-center gap-2 text-sm text-site-text-faint">
              <Clock className="h-4 w-4 text-site-text-muted" />
              {duration}
            </div>
          )}

          {/* Staff */}
          {job.staff && (
            <div className="flex items-center gap-2 text-sm text-site-text-faint">
              <User className="h-4 w-4 text-site-text-muted" />
              Serviced by {job.staff.first_name}
            </div>
          )}
        </div>
      </div>

      {/* Photos Section */}
      {job.photo_count > 0 && (
        <div className="rounded-lg border border-site-border bg-brand-surface">
          <button
            onClick={() => setShowPhotos(!showPhotos)}
            className="flex w-full items-center justify-between p-5 text-left"
          >
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-site-text-muted" />
              <span className="text-sm font-medium text-site-text">
                Before &amp; After Photos ({job.photo_count})
              </span>
            </div>
            {showPhotos ? (
              <ChevronUp className="h-5 w-5 text-site-text-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-site-text-muted" />
            )}
          </button>

          {showPhotos && (
            <div className="border-t border-site-border p-5">
              <div className="space-y-6">
                {sortedZones.map((zoneKey) => {
                  const zoneData = zoneMap.get(zoneKey)!;
                  const hasBeforeAfter = zoneData.intake && zoneData.completion;

                  return (
                    <div key={zoneKey}>
                      <h4 className="mb-2 text-sm font-medium text-site-text-muted">
                        {getZoneLabel(zoneKey)}
                      </h4>
                      {hasBeforeAfter ? (
                        <div className="max-w-lg">
                          <BeforeAfterSlider
                            beforeSrc={zoneData.intake!.image_url}
                            afterSrc={zoneData.completion!.image_url}
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[zoneData.intake, zoneData.completion].filter(Boolean).map((photo) => (
                            <div
                              key={photo!.id}
                              className="relative aspect-square overflow-hidden rounded-lg bg-brand-dark"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo!.thumbnail_url || photo!.image_url}
                                alt={getZoneLabel(photo!.zone)}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] capitalize text-white">
                                {photo === zoneData.intake ? 'before' : 'after'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Link to full gallery */}
              {job.gallery_token && (
                <div className="mt-6 border-t border-site-border pt-4">
                  <Link
                    href={`/jobs/${job.gallery_token}/photos`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    View full gallery page &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
