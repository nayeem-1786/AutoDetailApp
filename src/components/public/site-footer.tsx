import Link from 'next/link';
import { MapPin, Phone as PhoneIcon } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

export async function SiteFooter() {
  const biz = await getBusinessInfo();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Business Info */}
          <div>
            <h2 className="text-lg font-bold">{biz.name}</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-300">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>{biz.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <a
                  href={`tel:${phoneToE164(biz.phone)}`}
                  className="hover:text-white transition-colors"
                >
                  {formatPhone(biz.phone)}
                </a>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Mobile detailing available in the South Bay area
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/services"
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Services
                </Link>
              </li>
              <li>
                <Link
                  href="/products"
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Products
                </Link>
              </li>
              <li>
                <Link
                  href="/book"
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Book Appointment
                </Link>
              </li>
            </ul>
          </div>

          {/* Hours / Additional Info */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              About
            </h3>
            <p className="mt-4 text-sm text-gray-300">
              Professional auto detailing services including ceramic coatings, paint
              correction, interior detailing, and premium car care products.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 border-t border-gray-800 pt-6">
          <p className="text-center text-xs text-gray-400">
            &copy; {currentYear} {biz.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
