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
    <section className="border-t border-b border-white/5 bg-brand-dark py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:gap-x-16">
          {/* Google */}
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-lime text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-white">{googleRating}</span>
            <span className="text-sm text-gray-400">
              Google (<CountUp end={parseInt(googleCount) || 0} className="font-semibold text-white" /> reviews)
            </span>
          </div>

          <span className="hidden sm:block h-6 border-r border-white/10" />

          {/* Yelp */}
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-lime text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-white">{yelpRating}</span>
            <span className="text-sm text-gray-400">
              Yelp (<CountUp end={parseInt(yelpCount) || 0} className="font-semibold text-white" /> reviews)
            </span>
          </div>

          <span className="hidden sm:block h-6 border-r border-white/10" />

          {/* Vehicles */}
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-lime" />
            <span className="text-xl sm:text-2xl font-bold text-white">
              <CountUp end={6000} suffix="+" />
            </span>
            <span className="text-sm text-gray-400">Vehicles</span>
          </div>

          <span className="hidden sm:block h-6 border-r border-white/10" />

          {/* Same-Day */}
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-lime" />
            <span className="text-sm text-gray-400">Same-Day Available</span>
          </div>
        </div>
      </div>
    </section>
  );
}
