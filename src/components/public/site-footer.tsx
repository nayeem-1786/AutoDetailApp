import Link from 'next/link';
import { MapPin, Phone as PhoneIcon, Mail, Shield, Award, Leaf, Clock, Star } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';
import { getActiveCities } from '@/lib/data/cities';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

export async function SiteFooter() {
  const [biz, reviews, cities] = await Promise.all([
    getBusinessInfo(),
    getReviewData(),
    getActiveCities(),
  ]);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-navy text-white">
      {/* Trust badges strip */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              { icon: Shield, label: 'Fully Insured' },
              { icon: Award, label: 'IDA Certified' },
              { icon: Leaf, label: 'Eco-Friendly Products' },
              { icon: Clock, label: '100% Satisfaction' },
            ].map((badge) => {
              const Icon = badge.icon;
              return (
                <div key={badge.label} className="flex items-center gap-2 text-sm text-gray-400">
                  <Icon className="h-4 w-4 text-brand-500" />
                  <span className="font-medium">{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        {/* 3-column grid */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div>
            <h2 className="font-display text-lg font-bold">{biz.name}</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Professional auto detailing and ceramic coating specialists serving the South Bay area.
              We bring premium car care directly to you.
            </p>
            {/* Review badges */}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{reviews.google.rating}</span>
                <span className="text-gray-500">on Google</span>
                <span className="text-gray-600">&middot;</span>
                <span className="text-gray-500">{reviews.google.count} reviews</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold">{reviews.yelp.rating}</span>
                <span className="text-gray-500">on Yelp</span>
                <span className="text-gray-600">&middot;</span>
                <span className="text-gray-500">{reviews.yelp.count} reviews</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2.5">
              {[
                { href: '/services', label: 'All Services' },
                { href: '/products', label: 'Shop Products' },
                { href: '/gallery', label: 'Our Work' },
                { href: '/book', label: 'Book Appointment' },
                { href: '/signin', label: 'Customer Login' },
                { href: '/account', label: 'My Account' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Contact
            </h3>
            <div className="mt-4 space-y-3">
              <a
                href={`tel:${phoneToE164(biz.phone)}`}
                className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <PhoneIcon className="h-4 w-4 flex-shrink-0 text-brand-500" />
                {formatPhone(biz.phone)}
              </a>
              {biz.email && (
                <a
                  href={`mailto:${biz.email}`}
                  className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  <Mail className="h-4 w-4 flex-shrink-0 text-brand-500" />
                  {biz.email}
                </a>
              )}
              <div className="flex items-start gap-2.5 text-sm text-gray-300">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
                <span>{biz.address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Service Areas */}
        {cities.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Service Areas
            </h3>
            <p className="mt-3 text-sm text-gray-400">
              Mobile Detailing in{' '}
              {cities.map((city, i) => (
                <span key={city.id}>
                  {i > 0 && <span className="text-gray-600"> | </span>}
                  <Link
                    href={`/areas/${city.slug}`}
                    className="text-gray-300 hover:text-white transition-colors"
                  >
                    {city.city_name}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Bottom Bar */}
        <div className="mt-14 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {currentYear} {biz.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <Link href="/terms" className="hover:text-gray-300 transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link href="/unsubscribe" className="hover:text-gray-300 transition-colors">
              Unsubscribe
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
