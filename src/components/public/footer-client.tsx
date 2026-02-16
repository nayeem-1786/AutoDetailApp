'use client';

import { Phone, Mail, MapPin, Clock, Star, Shield, Award, Leaf } from 'lucide-react';
import Link from 'next/link';

interface FooterNavColumn {
  title: string;
  links: Array<{ label: string; url: string; target?: string }>;
}

interface ReviewBadge {
  platform: string;
  rating: string;
  count: string;
}

interface CityLink {
  id: string;
  slug: string;
  city_name: string;
}

interface FooterClientProps {
  businessName: string;
  logoUrl: string | null;
  phone: string;
  email: string | null;
  address: string;
  navColumns: FooterNavColumn[];
  reviews: ReviewBadge[];
  cities: CityLink[];
}

const trustBadges = [
  { icon: Shield, label: 'Fully Insured' },
  { icon: Award, label: 'IDA Certified' },
  { icon: Leaf, label: 'Eco-Friendly Products' },
  { icon: Clock, label: '100% Satisfaction' },
] as const;

export function FooterClient({
  businessName,
  logoUrl,
  phone,
  email,
  address,
  navColumns,
  reviews,
  cities,
}: FooterClientProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#0A0A0A] border-t border-white/5">
      {/* Trust badges strip */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustBadges.map((badge) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.label}
                  className="flex items-center gap-2 text-sm text-gray-400"
                >
                  <Icon className="h-4 w-4 text-red-500" />
                  <span className="font-medium">{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
          {/* Brand column */}
          <div className="lg:col-span-4">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt={businessName} className="h-12 w-auto mb-4" />
            ) : (
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                  <span className="text-white font-black text-lg">S</span>
                </div>
                <span className="text-white font-bold text-lg">{businessName}</span>
              </div>
            )}

            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Professional auto detailing and ceramic coating specialists serving
              the South Bay area. We bring premium car care directly to you.
            </p>

            {/* Contact info */}
            <div className="mt-6 space-y-3">
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <Phone className="w-4 h-4 text-red-500 shrink-0" />
                {phone}
              </a>
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <Mail className="w-4 h-4 text-red-500 shrink-0" />
                  {email}
                </a>
              )}
              <div className="flex items-start gap-3 text-sm text-gray-400">
                <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                {address}
              </div>
            </div>

            {/* Review badges */}
            {reviews.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                {reviews.map((r) => (
                  <div
                    key={r.platform}
                    className="flex items-center gap-1.5 text-sm text-gray-300"
                  >
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-semibold">{r.rating}</span>
                    <span className="text-gray-500">on {r.platform}</span>
                    <span className="text-gray-600">&middot;</span>
                    <span className="text-gray-500">{r.count} reviews</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nav columns */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {navColumns.map((col, i) => (
              <div key={i}>
                <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <Link
                        href={link.url}
                        target={link.target || '_self'}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Service Areas */}
        {cities.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-8">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Service Areas
            </h4>
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
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {year} {businessName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/terms"
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Terms &amp; Conditions
            </Link>
            <Link
              href="/unsubscribe"
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Unsubscribe
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
