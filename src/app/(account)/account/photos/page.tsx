'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Camera, Download } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { getZoneLabel } from '@/lib/utils/job-zones';

interface PhotoData {
  id: string;
  job_id: string;
  zone: string;
  phase: string;
  image_url: string;
  thumbnail_url: string | null;
  notes: string | null;
  annotation_data: unknown;
  is_featured: boolean;
  created_at: string;
}

interface JobPhotoGroup {
  job_id: string;
  status: string;
  services: { id: string; name: string; price: number }[];
  vehicle: { id: string; year: number; make: string; model: string; color: string | null } | null;
  date: string;
  photos: PhotoData[];
}

export default function PortalPhotosPage() {
  const { customer } = useCustomerAuth();
  const [groups, setGroups] = useState<JobPhotoGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPhotos = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const res = await fetch('/api/account/photos');
      if (res.ok) {
        const json = await res.json();
        setGroups(json.data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Service Photos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse before and after photos from your visits
        </p>
      </div>

      {groups.length === 0 ? (
        <Card className="p-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No service photos yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Photos will appear here after your next visit!
          </p>
        </Card>
      ) : (
        groups.map((group) => {
          const vehicle = group.vehicle;
          const vehicleStr = vehicle
            ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` (${vehicle.color})` : ''}`
            : '';
          const serviceNames = group.services.map((s) => s.name).join(', ');
          const dateStr = new Date(group.date).toLocaleDateString('en-US', {
            timeZone: 'America/Los_Angeles',
            dateStyle: 'long',
          });

          // Group photos by zone
          const zoneMap = new Map<string, { intake: PhotoData[]; completion: PhotoData[]; other: PhotoData[] }>();
          for (const photo of group.photos) {
            if (!zoneMap.has(photo.zone)) {
              zoneMap.set(photo.zone, { intake: [], completion: [], other: [] });
            }
            const entry = zoneMap.get(photo.zone)!;
            if (photo.phase === 'intake') entry.intake.push(photo);
            else if (photo.phase === 'completion') entry.completion.push(photo);
            else entry.other.push(photo);
          }

          return (
            <Card key={group.job_id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dateStr}</CardTitle>
                <p className="text-sm text-gray-500">
                  {vehicleStr && <>{vehicleStr} · </>}
                  {serviceNames}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  {[...zoneMap.entries()].map(([zoneKey, zonePhotos]) => {
                    const hasBeforeAfter = zonePhotos.intake.length > 0 && zonePhotos.completion.length > 0;
                    const allPhotos = [...zonePhotos.intake, ...zonePhotos.completion, ...zonePhotos.other];

                    return (
                      <div key={zoneKey}>
                        <h4 className="mb-2 text-sm font-medium text-gray-700">
                          {getZoneLabel(zoneKey)}
                        </h4>
                        {hasBeforeAfter ? (
                          <div className="max-w-lg">
                            <BeforeAfterSlider
                              beforeSrc={zonePhotos.intake[0].image_url}
                              afterSrc={zonePhotos.completion[0].image_url}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {allPhotos.map((photo) => (
                              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-200">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={photo.thumbnail_url || photo.image_url}
                                  alt={`${getZoneLabel(zoneKey)} ${photo.phase}`}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                  {photo.phase}
                                </span>
                                {/* Download button */}
                                <a
                                  href={photo.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                  title="Download"
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
        })
      )}
    </div>
  );
}
