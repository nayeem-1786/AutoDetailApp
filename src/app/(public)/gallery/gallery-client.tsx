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
        <p className="text-lg text-site-text-muted">
          Gallery photos coming soon. Check back after our next few services!
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Service filter pills */}
      {serviceOptions.length > 1 && (
        <div className="mb-10 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { setServiceFilter(''); setVisibleCount(ITEMS_PER_PAGE); }}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300',
              !serviceFilter
                ? 'bg-lime text-site-text-on-primary border-lime'
                : 'bg-site-border-light border-site-border text-site-text-secondary hover:border-lime/30 hover:text-lime'
            )}
          >
            All
          </button>
          {serviceOptions.map((s) => (
            <button
              key={s}
              onClick={() => { setServiceFilter(s); setVisibleCount(ITEMS_PER_PAGE); }}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300',
                serviceFilter === s
                  ? 'bg-lime text-site-text-on-primary border-lime'
                  : 'bg-site-border-light border-site-border text-site-text-secondary hover:border-lime/30 hover:text-lime'
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
          <p className="text-lg text-site-text-muted">No photos for this service type yet.</p>
        </div>
      ) : (
        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {visible.map((pair) => {
            const vehicleStr = pair.vehicle
              ? `${pair.vehicle.year ? pair.vehicle.year + ' ' : ''}${pair.vehicle.make} ${pair.vehicle.model}`
              : '';
            const altText = `Before and after ${pair.service_names[0] || 'detailing'}${vehicleStr ? ` on ${vehicleStr}` : ''}`;

            return (
              <div
                key={pair.job_id}
                className="mb-6 break-inside-avoid overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-lime/30 hover:shadow-lime-sm group"
              >
                <div aria-label={altText} className="relative">
                  <BeforeAfterSlider
                    beforeSrc={pair.before_image}
                    afterSrc={pair.after_image}
                  />
                  {/* Before / After badge */}
                  <div className="absolute top-3 left-3 z-10 pointer-events-none">
                    <span className="site-btn-primary text-xs font-bold px-3 py-1">
                      Before / After
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3">
                  <p className="font-display text-sm font-semibold text-site-text group-hover:text-lime transition-colors">
                    {pair.service_names.join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-site-text-muted">
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
        <div className="mt-12 text-center">
          <button
            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
            className="site-btn-cta px-8 py-3 text-sm font-bold hover:shadow-lime-lg hover:scale-[1.03] transition-all btn-lime-glow"
          >
            Load More
          </button>
        </div>
      )}
    </>
  );
}
