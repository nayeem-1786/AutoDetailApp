'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { getZoneLabel } from '@/lib/utils/job-zones';
import { cn } from '@/lib/utils/cn';
import { X, ChevronDown } from 'lucide-react';

interface GalleryPair {
  job_id: string;
  zone: string;
  vehicle: { make: string; model: string; year: number | null } | null;
  service_names: string[];
  before_image: string;
  after_image: string;
  tags: string[];
}

interface GalleryClientProps {
  initialPairs: GalleryPair[];
  filterOptions: string[];
  initialTag: string;
  total: number;
}

const PAGE_SIZE = 12;

// Separate zone groups from service/tag options
function categorizeOptions(options: string[]) {
  const zoneGroups: string[] = [];
  const services: string[] = [];

  for (const opt of options) {
    if (opt === 'Interior' || opt === 'Exterior') {
      zoneGroups.push(opt);
    } else {
      services.push(opt);
    }
  }

  return { zoneGroups, services };
}

export function GalleryClient({ initialPairs, filterOptions, initialTag, total }: GalleryClientProps) {
  const [activeTag, setActiveTag] = useState(initialTag);
  const [pairs, setPairs] = useState<GalleryPair[]>(initialPairs);
  const [totalCount, setTotalCount] = useState(total);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialPairs.length < total);
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { zoneGroups, services } = categorizeOptions(filterOptions);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setServiceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch page from API
  const fetchPage = useCallback(async (tag: string, offset: number, replace: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tag) params.set('tag', tag);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const res = await fetch(`/api/gallery?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();

      if (replace) {
        setPairs(json.data);
      } else {
        setPairs((prev) => [...prev, ...json.data]);
      }
      setTotalCount(json.total);
      setHasMore(offset + json.data.length < json.total);
    } catch {
      // Silently fail — user can scroll back to loaded content
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle tag change
  const changeTag = useCallback((tag: string) => {
    setActiveTag(tag);
    setServiceDropdownOpen(false);

    // Update URL without full page reload
    const url = new URL(window.location.href);
    if (tag) {
      url.searchParams.set('tag', tag);
    } else {
      url.searchParams.delete('tag');
    }
    window.history.replaceState({}, '', url.toString());

    // Fetch page 1 for new filter
    fetchPage(tag, 0, true);
  }, [fetchPage]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPage(activeTag, pairs.length, false);
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, pairs.length, activeTag, fetchPage]);

  // Check if active tag is a service (not a zone group)
  const isServiceFilter = activeTag && activeTag !== 'Interior' && activeTag !== 'Exterior';

  if (total === 0 && !initialTag) {
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
      {/* Filter controls */}
      <div className="mb-10 space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Zone group pills: All | Interior | Exterior */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeTag('')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300',
                !activeTag
                  ? 'bg-accent-brand text-site-text-on-primary border-accent-brand'
                  : 'bg-site-border-light border-site-border text-site-text-secondary hover:border-accent-ui/30 hover:text-accent-ui'
              )}
            >
              All
            </button>
            {zoneGroups.map((group) => (
              <button
                key={group}
                onClick={() => changeTag(group)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300',
                  activeTag === group
                    ? 'bg-accent-brand text-site-text-on-primary border-accent-brand'
                    : 'bg-site-border-light border-site-border text-site-text-secondary hover:border-accent-ui/30 hover:text-accent-ui'
                )}
              >
                {group}
              </button>
            ))}
          </div>

          {/* Service dropdown */}
          {services.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setServiceDropdownOpen(!serviceDropdownOpen)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border transition-all duration-300',
                  isServiceFilter
                    ? 'bg-accent-brand text-site-text-on-primary border-accent-brand'
                    : 'bg-site-border-light border-site-border text-site-text-secondary hover:border-accent-ui/30 hover:text-accent-ui'
                )}
              >
                {isServiceFilter ? activeTag : 'Service Type'}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', serviceDropdownOpen && 'rotate-180')} />
              </button>

              {serviceDropdownOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full z-30 mt-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-site-border bg-brand-surface shadow-xl">
                  {services.map((service) => (
                    <button
                      key={service}
                      onClick={() => changeTag(service)}
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-sm transition-colors',
                        activeTag === service
                          ? 'bg-accent-brand/10 text-accent-ui font-medium'
                          : 'text-site-text-secondary hover:bg-site-border-light hover:text-site-text'
                      )}
                    >
                      {service}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active filter chip */}
        {activeTag && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-brand/10 px-3 py-1 text-xs font-medium text-accent-ui border border-accent-ui/20">
              Showing: {activeTag}
              <button
                onClick={() => changeTag('')}
                className="rounded-full p-0.5 hover:bg-accent-brand/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Gallery grid */}
      {pairs.length === 0 && !loading ? (
        <div className="py-16 text-center">
          <p className="text-lg text-site-text-muted">
            No photos for this category yet.
          </p>
          <button
            onClick={() => changeTag('')}
            className="mt-3 text-sm text-accent-ui hover:underline"
          >
            View all photos
          </button>
        </div>
      ) : (
        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {pairs.map((pair, i) => {
            const vehicleStr = pair.vehicle
              ? `${pair.vehicle.year ? pair.vehicle.year + ' ' : ''}${pair.vehicle.make} ${pair.vehicle.model}`
              : '';
            const altText = `Before and after ${pair.service_names[0] || 'detailing'}${vehicleStr ? ` on ${vehicleStr}` : ''}`;

            return (
              <div
                key={`${pair.job_id}:${pair.zone}:${i}`}
                className="mb-6 break-inside-avoid overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-accent-ui/30 hover:shadow-accent-sm group"
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
                  <p className="font-display text-sm font-semibold text-site-text group-hover:text-accent-ui transition-colors">
                    {pair.service_names.join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-site-text-muted">
                    {vehicleStr && <>{vehicleStr} &middot; </>}
                    {getZoneLabel(pair.zone)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="mb-6 break-inside-avoid overflow-hidden rounded-2xl bg-brand-surface border border-site-border"
            >
              <div className="aspect-[4/3] animate-pulse bg-site-border-light" />
              <div className="px-4 py-3 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-site-border-light" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-site-border-light" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentinel for infinite scroll */}
      {hasMore && <div ref={sentinelRef} className="h-1" />}

      {/* End of gallery indicator */}
      {!hasMore && pairs.length > 0 && totalCount > PAGE_SIZE && (
        <div className="mt-12 text-center">
          <p className="text-sm text-site-text-dim">
            Showing all {totalCount} transformations
          </p>
        </div>
      )}
    </>
  );
}
