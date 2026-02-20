'use client';

import { Phone, Mail, MapPin, Clock, Star, Shield, Award, Leaf } from 'lucide-react';
import Link from 'next/link';
import type { FooterData, FooterColumn as FooterColumnType, FooterBottomLink } from '@/lib/supabase/types';
import type { BusinessInfo } from '@/lib/data/business';

interface ReviewBadge {
  platform: string;
  rating: string;
  count: string;
}

interface FooterClientProps {
  footerData: FooterData;
  phone: string; // Pre-formatted phone number
  reviews: ReviewBadge[];
}

const trustBadges = [
  { icon: Shield, label: 'Fully Insured' },
  { icon: Award, label: 'IDA Certified' },
  { icon: Leaf, label: 'Eco-Friendly Products' },
  { icon: Clock, label: '100% Satisfaction' },
] as const;

export function FooterClient({ footerData, phone, reviews }: FooterClientProps) {
  const { sections, columns, bottomLinks, cities, businessInfo } = footerData;

  const mainSection = sections.find((s) => s.section_key === 'main');
  const serviceAreasSection = sections.find((s) => s.section_key === 'service_areas');
  const bottomBarSection = sections.find((s) => s.section_key === 'bottom_bar');

  return (
    <footer className="bg-site-footer-bg border-t border-site-border-light">
      {/* Trust badges strip */}
      <div className="border-b border-site-border">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustBadges.map((badge) => {
              const Icon = badge.icon;
              return (
                <div
                  key={badge.label}
                  className="flex items-center gap-2 text-sm text-site-text-muted"
                >
                  <Icon className="h-4 w-4 text-site-icon-accent" />
                  <span className="font-medium">{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      {mainSection?.is_enabled !== false && (
        <MainFooterSection
          columns={columns}
          businessInfo={businessInfo}
          phone={phone}
          reviews={reviews}
        />
      )}

      {/* Service Areas */}
      {serviceAreasSection?.is_enabled !== false && cities.length > 0 && (
        <ServiceAreasSection
          cities={cities}
          config={serviceAreasSection?.config ?? {}}
        />
      )}

      {/* Bottom Bar */}
      {bottomBarSection?.is_enabled !== false && (
        <BottomBarSection
          links={bottomLinks}
          businessName={businessInfo.name}
        />
      )}
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Main Footer Section — All columns from DB (brand, links, html, business_info)
// ---------------------------------------------------------------------------

function MainFooterSection({
  columns,
  businessInfo,
  phone,
  reviews,
}: {
  columns: FooterColumnType[];
  businessInfo: BusinessInfo;
  phone: string;
  reviews: ReviewBadge[];
}) {
  const enabledColumns = columns.filter((c) => c.is_enabled);

  if (enabledColumns.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-12 sm:gap-8">
        {enabledColumns.map((column) => {
          const span = (column.config?.col_span as number) || Math.floor(12 / enabledColumns.length);
          return (
            <div
              key={column.id}
              className="footer-col"
              style={{ '--footer-col-span': String(span) } as React.CSSProperties}
            >
              <FooterColumnRenderer
                column={column}
                businessInfo={businessInfo}
                phone={phone}
                reviews={reviews}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer Column Renderer — dispatches to brand, links, html, or business_info
// ---------------------------------------------------------------------------

function FooterColumnRenderer({
  column,
  businessInfo,
  phone,
  reviews,
}: {
  column: FooterColumnType;
  businessInfo: BusinessInfo;
  phone: string;
  reviews: ReviewBadge[];
}) {
  if (column.content_type === 'brand') {
    return (
      <BrandColumn column={column} businessInfo={businessInfo} phone={phone} reviews={reviews} />
    );
  }

  return (
    <div>
      {column.title && (
        <h4 className="text-site-text font-bold text-sm uppercase tracking-wider mb-4">
          {column.title}
        </h4>
      )}

      {column.content_type === 'links' && (
        <ul className="space-y-2.5">
          {column.links?.map((link) => (
            <li key={link.id}>
              <Link
                href={link.url}
                target={link.target || '_self'}
                className="text-sm text-site-text-muted hover:text-lime transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {column.content_type === 'business_info' && (
        <BusinessInfoColumn businessInfo={businessInfo} phone={phone} />
      )}

      {column.content_type === 'html' && column.html_content && (
        <div
          className="text-sm text-site-text-muted space-y-2 [&_a]:text-lime [&_a]:hover:underline"
          dangerouslySetInnerHTML={{ __html: column.html_content }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand Column — logo, tagline, contact info, review badges
// ---------------------------------------------------------------------------

function BrandColumn({
  column,
  businessInfo,
  phone,
  reviews,
}: {
  column: FooterColumnType;
  businessInfo: BusinessInfo;
  phone: string;
  reviews: ReviewBadge[];
}) {
  const config = column.config || {};
  const showLogo = config.show_logo !== false;
  const logoWidth = (config.logo_width as number) || 160;
  const showPhone = config.show_phone !== false;
  const showEmail = config.show_email !== false;
  const showAddress = config.show_address !== false;
  const showReviews = config.show_reviews !== false;
  const tagline = (config.tagline as string) || '';

  return (
    <div>
      {/* Logo */}
      {showLogo && (businessInfo.logo_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={businessInfo.logo_url}
          alt={businessInfo.name}
          style={{ width: logoWidth, height: 'auto' }}
          className="mb-4"
        />
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-lime flex items-center justify-center">
            <span className="text-site-text-on-primary font-black text-lg">S</span>
          </div>
          <span className="text-site-text font-bold text-lg">
            {businessInfo.name}
          </span>
        </div>
      ))}

      {/* Tagline */}
      {tagline && (
        <p className="text-site-text-muted text-sm leading-relaxed max-w-xs">
          {tagline}
        </p>
      )}

      {/* Contact info */}
      {(showPhone || showEmail || showAddress) && (
        <div className="mt-6 space-y-3">
          {showPhone && (
            <a
              href={`tel:${businessInfo.phone}`}
              className="flex items-center gap-3 text-sm text-site-text-muted hover:text-site-text transition-colors"
            >
              <Phone className="w-4 h-4 text-site-icon-accent shrink-0" />
              {phone}
            </a>
          )}
          {showEmail && businessInfo.email && (
            <a
              href={`mailto:${businessInfo.email}`}
              className="flex items-center gap-3 text-sm text-site-text-muted hover:text-site-text transition-colors"
            >
              <Mail className="w-4 h-4 text-site-icon-accent shrink-0" />
              {businessInfo.email}
            </a>
          )}
          {showAddress && businessInfo.address && (
            <div className="flex items-start gap-3 text-sm text-site-text-muted">
              <MapPin className="w-4 h-4 text-site-icon-accent shrink-0 mt-0.5" />
              {businessInfo.address}
            </div>
          )}
        </div>
      )}

      {/* Review badges */}
      {showReviews && reviews.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {reviews.map((r) => (
            <div
              key={r.platform}
              className="flex items-center gap-1.5 text-sm text-site-text-secondary"
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span>
                <span className="font-semibold">{parseFloat(r.rating).toFixed(1)}</span>
                {' '}
                <span className="text-site-text-dim">on {r.platform} &middot; {r.count} reviews</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Business Info Column — auto-renders contact details + CTA buttons
// ---------------------------------------------------------------------------

function BusinessInfoColumn({
  businessInfo,
  phone,
}: {
  businessInfo: BusinessInfo;
  phone: string;
}) {
  return (
    <div className="space-y-2.5">
      <Link
        href="/book"
        className="text-sm text-site-text-muted hover:text-lime transition-colors"
      >
        Book Appointment
      </Link>
      <br />
      <Link
        href="/book"
        className="text-sm text-site-text-muted hover:text-lime transition-colors"
      >
        Get a Quote
      </Link>
      <div className="mt-4 space-y-2">
        <a
          href={`tel:${businessInfo.phone}`}
          className="flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text transition-colors"
        >
          <Phone className="w-3.5 h-3.5 text-site-icon-accent shrink-0" />
          {phone}
        </a>
        {businessInfo.email && (
          <a
            href={`mailto:${businessInfo.email}`}
            className="flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-site-icon-accent shrink-0" />
            {businessInfo.email}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service Areas Section
// ---------------------------------------------------------------------------

function ServiceAreasSection({
  cities,
  config,
}: {
  cities: FooterData['cities'];
  config: Record<string, unknown>;
}) {
  const prefixText = (config?.prefix_text as string) ?? '';
  const showDividers = config?.show_dividers !== false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="border-t border-site-border pt-8 pb-10">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-site-text-muted">
          Service Areas
        </h4>
        <p className="mt-3 text-sm text-site-text-muted">
          {prefixText && <>{prefixText}{' '}</>}
          {cities.map((city, i) => (
            <span key={city.id}>
              {i > 0 && showDividers && (
                <span className="text-site-text-faint"> | </span>
              )}
              {i > 0 && !showDividers && ' '}
              <Link
                href={`/areas/${city.slug}`}
                className="text-site-text-secondary hover:text-site-text transition-colors"
              >
                {city.city_name}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom Bar Section
// ---------------------------------------------------------------------------

function BottomBarSection({
  links,
  businessName,
}: {
  links: FooterBottomLink[];
  businessName: string;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="border-t border-site-border-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-site-text-dim">
          &copy; {year} {businessName}. All rights reserved.
        </p>
        {links.length > 0 && (
          <div className="flex items-center gap-4">
            {links.map((link) => (
              <Link
                key={link.id}
                href={link.url}
                target={link.open_in_new_tab ? '_blank' : undefined}
                rel={link.open_in_new_tab ? 'noopener noreferrer' : undefined}
                className="text-xs text-site-text-dim hover:text-site-text transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
