import { Star, Car, Clock } from 'lucide-react';
import { getReviewData } from '@/lib/data/reviews';

export async function TrustBar() {
  const reviews = await getReviewData();

  return (
    <section className="border-t border-b border-white/10 bg-brand-dark">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
          {/* Google */}
          <div className="flex items-center gap-1.5 text-gray-300">
            <Star className="h-4 w-4 fill-lime text-lime" />
            <span className="font-semibold text-white">{reviews.google.rating}</span>
            <span className="text-gray-400">Google ({reviews.google.count} reviews)</span>
          </div>

          <span className="hidden sm:inline text-white/20">|</span>

          {/* Yelp */}
          <div className="flex items-center gap-1.5 text-gray-300">
            <Star className="h-4 w-4 fill-lime text-lime" />
            <span className="font-semibold text-white">{reviews.yelp.rating}</span>
            <span className="text-gray-400">Yelp ({reviews.yelp.count} reviews)</span>
          </div>

          <span className="hidden sm:inline text-white/20">|</span>

          {/* Vehicles */}
          <div className="flex items-center gap-1.5 text-gray-300">
            <Car className="h-4 w-4 text-lime" />
            <span className="font-semibold text-white">6,000+</span>
            <span className="text-gray-400">Vehicles</span>
          </div>

          <span className="hidden sm:inline text-white/20">|</span>

          {/* Same-Day */}
          <div className="flex items-center gap-1.5 text-gray-300">
            <Clock className="h-4 w-4 text-lime" />
            <span className="text-gray-400">Same-Day Available</span>
          </div>
        </div>
      </div>
    </section>
  );
}
