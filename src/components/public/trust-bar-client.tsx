'use client';

import { Star, Car, Clock } from 'lucide-react';
import { CountUp } from './scroll-reveal';

interface TrustBarClientProps {
  googleRating: string;
  googleCount: string;
  yelpRating: string;
  yelpCount: string;
}

export function TrustBarClient({
  googleRating,
  googleCount,
  yelpRating,
  yelpCount,
}: TrustBarClientProps) {
  return (
    <section className="border-t border-b border-site-border-light bg-brand-dark py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:gap-x-16">
          {/* Google */}
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-lime text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-site-text">{googleRating}</span>
            <span className="text-sm text-site-text-muted">
              Google (<CountUp end={parseInt(googleCount) || 0} className="font-semibold text-site-text" /> reviews)
            </span>
          </div>

          <span className="hidden sm:block h-6 border-r border-site-border" />

          {/* Yelp */}
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-lime text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-site-text">{yelpRating}</span>
            <span className="text-sm text-site-text-muted">
              Yelp (<CountUp end={parseInt(yelpCount) || 0} className="font-semibold text-site-text" /> reviews)
            </span>
          </div>

          <span className="hidden sm:block h-6 border-r border-site-border" />

          {/* Vehicles */}
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-site-text">
              <CountUp end={6000} suffix="+" />
            </span>
            <span className="text-sm text-site-text-muted">Vehicles</span>
          </div>

          <span className="hidden sm:block h-6 border-r border-site-border" />

          {/* Same-Day */}
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-lime" />
            <span className="text-sm text-site-text-muted">Same-Day Available</span>
          </div>
        </div>
      </div>
    </section>
  );
}
