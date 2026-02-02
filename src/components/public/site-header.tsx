import Link from 'next/link';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

export async function SiteHeader() {
  const biz = await getBusinessInfo();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Business Name */}
        <div className="flex-shrink-0">
          <Link
            href="/"
            className="text-lg font-bold text-gray-900 hover:text-gray-700 transition-colors"
          >
            {biz.name}
          </Link>
        </div>

        {/* Center: Navigation Links (hidden on mobile) */}
        <div className="hidden md:flex md:items-center md:gap-8">
          <Link
            href="/services"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Services
          </Link>
          <Link
            href="/products"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Products
          </Link>
        </div>

        {/* Right: Phone + Book Now */}
        <div className="flex items-center gap-4">
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Phone className="h-4 w-4" />
            <span>{formatPhone(biz.phone)}</span>
          </a>
          <a
            href={`tel:${phoneToE164(biz.phone)}`}
            className="inline-flex sm:hidden items-center justify-center h-9 w-9 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Call us"
          >
            <Phone className="h-5 w-5" />
          </a>
          <Link
            href="/book"
            className={cn(
              'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
              'bg-gray-900 text-white hover:bg-gray-800',
              'h-9 px-4 py-2'
            )}
          >
            Book Now
          </Link>
        </div>
      </nav>

      {/* Mobile Navigation Row */}
      <div className="flex md:hidden border-t border-gray-100">
        <Link
          href="/services"
          className="flex-1 py-2.5 text-center text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          Services
        </Link>
        <div className="w-px bg-gray-100" />
        <Link
          href="/products"
          className="flex-1 py-2.5 text-center text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
        >
          Products
        </Link>
      </div>
    </header>
  );
}
