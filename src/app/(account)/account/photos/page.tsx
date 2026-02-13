'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Camera, Download, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { getZoneLabel } from '@/lib/utils/job-zones';

interface PhotoItem {
  id: string;
  zone: string;
  zone_label: string;
  image_url: string;
  thumbnail_url: string | null;
  notes: string | null;
  annotation_data: unknown;
}

interface Visit {
  job_id: string;
  date: string;
  status: string;
  gallery_token: string | null;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    color: string | null;
  } | null;
  services: { name: string; price: number }[];
  photos: {
    intake: PhotoItem[];
    completion: PhotoItem[];
  };
  photo_count: {
    intake: number;
    completion: number;
  };
}

interface VehicleOption {
  id: string;
  year: number;
  make: string;
  model: string;
  color: string | null;
}

export default function PortalPhotosPage() {
  const { customer } = useCustomerAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<{
    photos: { src: string; label: string; phase: string }[];
    index: number;
  } | null>(null);
  const limit = 5;

  const loadPhotos = useCallback(async (pageNum: number, append: boolean = false) => {
    if (!customer) return;
    if (append) setLoadingMore(true); else setLoading(true);

    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) });
      if (selectedVehicle) params.set('vehicle_id', selectedVehicle);

      const res = await fetch(`/api/account/photos?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (append) {
          setVisits((prev) => [...prev, ...json.visits]);
        } else {
          setVisits(json.visits);
          setVehicles(json.vehicles || []);
        }
        setTotalVisits(json.total_visits);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [customer, selectedVehicle, limit]);

  useEffect(() => {
    setPage(1);
    loadPhotos(1, false);
  }, [loadPhotos]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPhotos(nextPage, true);
  };

  const openLightbox = (visitPhotos: Visit['photos'], startZone: string, startPhase: string) => {
    // Build flat list of all photos for this visit
    const photos: { src: string; label: string; phase: string }[] = [];
    for (const p of visitPhotos.intake) {
      photos.push({ src: p.image_url, label: `${p.zone_label} — Before`, phase: 'intake' });
    }
    for (const p of visitPhotos.completion) {
      photos.push({ src: p.image_url, label: `${p.zone_label} — After`, phase: 'completion' });
    }

    // Find starting index
    const allItems = [...visitPhotos.intake, ...visitPhotos.completion];
    const startItem = allItems.find((p) => p.zone === startZone && (
      (startPhase === 'intake' && visitPhotos.intake.includes(p)) ||
      (startPhase === 'completion' && visitPhotos.completion.includes(p))
    ));
    const idx = startItem ? allItems.indexOf(startItem) : 0;

    setLightbox({ photos, index: idx });
  };

  const closeLightbox = () => setLightbox(null);
  const prevPhoto = () => setLightbox((lb) => lb ? { ...lb, index: Math.max(0, lb.index - 1) } : null);
  const nextPhoto = () => setLightbox((lb) => lb ? { ...lb, index: Math.min(lb.photos.length - 1, lb.index + 1) } : null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasMore = visits.length < totalVisits;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Photos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Before &amp; after photos from your recent services
          </p>
        </div>

        {/* Vehicle filter — only show if multiple vehicles */}
        {vehicles.length > 1 && (
          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model}{v.color ? ` — ${v.color}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Empty state */}
      {visits.length === 0 ? (
        <Card className="p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No service photos yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Photos from your next visit will appear here!
          </p>
        </Card>
      ) : (
        <>
          {visits.map((visit) => {
            const vehicle = visit.vehicle;
            const vehicleStr = vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` — ${vehicle.color}` : ''}`
              : '';
            const serviceNames = visit.services.map((s) => s.name).join(', ');
            const dateStr = new Date(visit.date).toLocaleDateString('en-US', {
              timeZone: 'America/Los_Angeles',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            // Build zone pairs for before/after matching
            const zoneMap = new Map<string, { intake: PhotoItem | null; completion: PhotoItem | null; extras: PhotoItem[] }>();
            for (const p of visit.photos.intake) {
              if (!zoneMap.has(p.zone)) zoneMap.set(p.zone, { intake: null, completion: null, extras: [] });
              const entry = zoneMap.get(p.zone)!;
              if (!entry.intake) entry.intake = p;
              else entry.extras.push(p);
            }
            for (const p of visit.photos.completion) {
              if (!zoneMap.has(p.zone)) zoneMap.set(p.zone, { intake: null, completion: null, extras: [] });
              const entry = zoneMap.get(p.zone)!;
              if (!entry.completion) entry.completion = p;
              else entry.extras.push(p);
            }

            // Sort zones: exterior first, then interior
            const sortedZones = [...zoneMap.keys()].sort((a, b) => {
              if (a.startsWith('exterior_') && b.startsWith('interior_')) return -1;
              if (a.startsWith('interior_') && b.startsWith('exterior_')) return 1;
              return a.localeCompare(b);
            });

            const totalPhotos = visit.photo_count.intake + visit.photo_count.completion;

            return (
              <Card key={visit.job_id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{dateStr}</CardTitle>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {vehicleStr && <>{vehicleStr} &middot; </>}
                        {serviceNames}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {sortedZones.map((zoneKey) => {
                      const zoneData = zoneMap.get(zoneKey)!;
                      const hasBeforeAfter = zoneData.intake && zoneData.completion;

                      return (
                        <div key={zoneKey}>
                          <h4 className="mb-2 text-sm font-medium text-gray-700">
                            {getZoneLabel(zoneKey)}
                          </h4>

                          {hasBeforeAfter ? (
                            <div
                              className="max-w-lg cursor-pointer"
                              onClick={() => openLightbox(visit.photos, zoneKey, 'intake')}
                            >
                              <BeforeAfterSlider
                                beforeSrc={zoneData.intake!.image_url}
                                afterSrc={zoneData.completion!.image_url}
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {[zoneData.intake, zoneData.completion, ...zoneData.extras]
                                .filter(Boolean)
                                .map((photo) => (
                                  <div
                                    key={photo!.id}
                                    className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-200"
                                    onClick={() => openLightbox(
                                      visit.photos,
                                      photo!.zone,
                                      visit.photos.intake.includes(photo!) ? 'intake' : 'completion',
                                    )}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={photo!.thumbnail_url || photo!.image_url}
                                      alt={`${getZoneLabel(photo!.zone)}`}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] capitalize text-white">
                                      {visit.photos.intake.includes(photo!) ? 'before' : 'after'}
                                    </span>
                                    <a
                                      href={photo!.image_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                      title="Download"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </a>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${visits.length} of ${totalVisits})`
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Photo Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            onClick={closeLightbox}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Photo info */}
          <div className="absolute left-4 top-4 z-10">
            <span className="rounded bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
              {lightbox.photos[lightbox.index]?.label}
            </span>
            <span className="ml-2 rounded bg-black/40 px-2 py-1 text-xs text-white/70">
              {lightbox.index + 1} / {lightbox.photos.length}
            </span>
          </div>

          {/* Navigation arrows */}
          {lightbox.index > 0 && (
            <button
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightbox.index < lightbox.photos.length - 1 && (
            <button
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Full-size image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.photos[lightbox.index]?.src}
            alt={lightbox.photos[lightbox.index]?.label}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Download button */}
          <a
            href={lightbox.photos[lightbox.index]?.src}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/30"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
