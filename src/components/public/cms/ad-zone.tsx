'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// AdZone — renders an ad for a specific zone on a page
// Props can receive server-fetched data or fetch client-side
// ---------------------------------------------------------------------------

interface AdData {
  creative: {
    id: string;
    image_url: string;
    image_url_mobile: string | null;
    link_url: string | null;
    alt_text: string | null;
    ad_size: string;
  };
  placement: {
    id: string;
    zone_id: string;
    page_path: string;
  };
}

interface AdZoneProps {
  zoneId: string;
  pagePath: string;
  className?: string;
  /** Pre-fetched ad data from server component */
  ad?: AdData | null;
}

export function AdZone({ zoneId, pagePath, className, ad: preloaded }: AdZoneProps) {
  const [ad, setAd] = useState<AdData | null>(preloaded ?? null);
  const [loaded, setLoaded] = useState(!!preloaded);
  const containerRef = useRef<HTMLDivElement>(null);
  const impressionFired = useRef(false);

  // Client-side fetch if not preloaded
  useEffect(() => {
    if (preloaded !== undefined) return;
    const fetchAd = async () => {
      try {
        const res = await fetch(
          `/api/public/cms/ads?zone=${encodeURIComponent(zoneId)}&page=${encodeURIComponent(pagePath)}`
        );
        if (res.ok) {
          const { data } = await res.json();
          setAd(data);
        }
      } catch {
        // silently fail — no ad is fine
      } finally {
        setLoaded(true);
      }
    };
    fetchAd();
  }, [zoneId, pagePath, preloaded]);

  // IntersectionObserver: fire impression when 50% visible for 1 second
  useEffect(() => {
    if (!ad || impressionFired.current) return;

    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionFired.current) {
          timer = setTimeout(() => {
            if (!impressionFired.current) {
              impressionFired.current = true;
              // Fire-and-forget impression
              fetch('/api/public/cms/ads/impression', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ad_creative_id: ad.creative.id,
                  ad_placement_id: ad.placement.id,
                  page_path: pagePath,
                  zone_id: zoneId,
                }),
              }).catch(() => {});
            }
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ad, pagePath, zoneId]);

  // Click handler
  const handleClick = () => {
    if (!ad?.creative.link_url) return;

    // Record click fire-and-forget
    fetch('/api/public/cms/ads/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_creative_id: ad.creative.id,
        ad_placement_id: ad.placement.id,
        page_path: pagePath,
        zone_id: zoneId,
      }),
    }).catch(() => {});

    // Navigate
    window.open(ad.creative.link_url, '_blank', 'noopener,noreferrer');
  };

  if (!loaded || !ad) return null;

  // Parse dimensions from ad_size (e.g., "728x90")
  const [width, height] = ad.creative.ad_size.split('x').map(Number);

  return (
    <div
      ref={containerRef}
      className={`flex justify-center ${className ?? ''}`}
    >
      <div
        className={`overflow-hidden rounded ${ad.creative.link_url ? 'cursor-pointer' : ''}`}
        onClick={handleClick}
        role={ad.creative.link_url ? 'link' : undefined}
        style={{ maxWidth: width, maxHeight: height }}
      >
        {/* Desktop image */}
        <picture>
          {ad.creative.image_url_mobile && (
            <source media="(max-width: 639px)" srcSet={ad.creative.image_url_mobile} />
          )}
          <img
            src={ad.creative.image_url}
            alt={ad.creative.alt_text || 'Advertisement'}
            width={width}
            height={height}
            className="h-auto w-full"
            loading="lazy"
          />
        </picture>
      </div>
    </div>
  );
}
