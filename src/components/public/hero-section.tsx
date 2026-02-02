import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Professional Auto Detailing in Lomita, CA
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-300">
            Expert ceramic coatings, paint correction, interior detailing, and car
            care. Mobile detailing available throughout the South Bay.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/services"
              className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
                'border border-white text-white hover:bg-white hover:text-gray-900',
                'h-11 px-8'
              )}
            >
              View Services
            </Link>
            <Link
              href="/book"
              className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
                'bg-white text-gray-900 hover:bg-gray-100',
                'h-11 px-8'
              )}
            >
              Book Appointment
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
