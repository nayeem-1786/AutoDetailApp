'use client';

import { useState, useMemo } from 'react';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { getZoneLabel } from '@/lib/utils/job-zones';
import { cn } from '@/lib/utils/cn';

interface GalleryPair {
  job_id: string;
  vehicle: { make: string; model: string; year: number | null } | null;
  service_names: string[];
  before_image: string;
  after_image: string;
  zone: string;
}

interface GalleryClientProps {
  initialPairs: GalleryPair[];
  serviceOptions: string[];
}

const ITEMS_PER_PAGE = 12;

export function GalleryClient({ initialPairs, serviceOptions }: GalleryClientProps) {
  const [serviceFilter, setServiceFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const filtered = useMemo(() => {
    if (!serviceFilter) return initialPairs;
    return initialPairs.filter((p) =>
      p.service_names.some((s) => s === serviceFilter)
    );
  }, [initialPairs, serviceFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (initialPairs.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg text-gray-500">
          Gallery photos coming soon. Check back after our next few services!
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Service filter pills */}
      {serviceOptions.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => { setServiceFilter(''); setVisibleCount(ITEMS_PER_PAGE); }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              !serviceFilter
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            All
          </button>
          {serviceOptions.map((s) => (
            <button
              key={s}
              onClick={() => { setServiceFilter(s); setVisibleCount(ITEMS_PER_PAGE); }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                serviceFilter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-gray-500">No photos for this service type yet.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((pair) => {
            const vehicleStr = pair.vehicle
              ? `${pair.vehicle.year ? pair.vehicle.year + ' ' : ''}${pair.vehicle.make} ${pair.vehicle.model}`
              : '';
            const altText = `Before and after ${pair.service_names[0] || 'detailing'}${vehicleStr ? ` on ${vehicleStr}` : ''}`;

            return (
              <div
                key={pair.job_id}
                className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200"
              >
                <div aria-label={altText}>
                  <BeforeAfterSlider
                    beforeSrc={pair.before_image}
                    afterSrc={pair.after_image}
                  />
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">
                    {pair.service_names.join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {vehicleStr && <>{vehicleStr} · </>}
                    {getZoneLabel(pair.zone)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-10 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
            className="rounded-full bg-gray-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Load More
          </button>
        </div>
      )}
    </>
  );
}
