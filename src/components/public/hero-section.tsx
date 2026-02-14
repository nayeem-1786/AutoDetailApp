import Link from 'next/link';
import { Star } from 'lucide-react';
import { getReviewData } from '@/lib/data/reviews';
import { getHeroBeforeAfter } from '@/lib/data/featured-photos';
import { HeroClient } from './hero-client';

export async function HeroSection() {
  const [reviews, heroPhoto] = await Promise.all([
    getReviewData(),
    getHeroBeforeAfter(),
  ]);

  return (
    <section className="relative bg-gradient-hero overflow-hidden">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — Text */}
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Premium Mobile
              <br />
              Detailing
            </h1>

            {/* Inline review stats */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-blue-100/70">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-white">{reviews.google.rating}</span>
                <span>&middot; {reviews.google.count} Google Reviews</span>
              </span>
              <span className="hidden sm:inline text-white/30">|</span>
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-white">{reviews.yelp.rating}</span>
                <span>&middot; {reviews.yelp.count} Yelp Reviews</span>
              </span>
            </div>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-blue-100/60">
              Expert ceramic coatings, paint correction, and premium detailing.
              We bring showroom results directly to your doorstep.
            </p>

            <div className="mt-8">
              <Link
                href="/book"
                className="inline-flex items-center justify-center rounded-full bg-white text-navy font-semibold text-base h-13 px-8 shadow-lg shadow-white/15 hover:shadow-xl hover:shadow-white/20 hover:-translate-y-0.5 transition-all duration-300"
              >
                Book Appointment
              </Link>
            </div>
          </div>

          {/* Right — Before/After Slider or placeholder */}
          <div className="hidden lg:block">
            {heroPhoto ? (
              <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/40">
                <HeroClient
                  beforeSrc={heroPhoto.beforeUrl}
                  afterSrc={heroPhoto.afterUrl}
                  vehicleInfo={heroPhoto.vehicleInfo}
                  serviceName={heroPhoto.serviceName}
                />
              </div>
            ) : (
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
                <p className="text-sm text-white/30">Before &amp; After showcase</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
