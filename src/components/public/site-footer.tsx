import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';
import { getActiveCities } from '@/lib/data/cities';
import { formatPhone } from '@/lib/utils/format';
import { FooterClient } from './footer-client';
import type { WebsiteNavItem } from '@/lib/supabase/types';

interface SiteFooterProps {
  navItems?: WebsiteNavItem[];
}

const defaultQuickLinks = [
  { href: '/services', label: 'All Services' },
  { href: '/products', label: 'Shop Products' },
  { href: '/gallery', label: 'Our Work' },
  { href: '/book', label: 'Book Appointment' },
  { href: '/signin', label: 'Customer Login' },
  { href: '/account', label: 'My Account' },
];

export async function SiteFooter({ navItems = [] }: SiteFooterProps) {
  const [biz, reviews, cities] = await Promise.all([
    getBusinessInfo(),
    getReviewData(),
    getActiveCities(),
  ]);

  // Build quick links from nav items or defaults
  const quickLinks =
    navItems.length > 0
      ? navItems.map((item) => ({
          label: item.label,
          url: item.url,
          target: item.target,
        }))
      : defaultQuickLinks.map((l) => ({
          label: l.label,
          url: l.href,
          target: '_self' as const,
        }));

  // Build nav columns
  const navColumns = [
    {
      title: 'Quick Links',
      links: quickLinks,
    },
    {
      title: 'Contact',
      links: [
        { label: 'Book Appointment', url: '/book' },
        { label: 'Get a Quote', url: '/book' },
      ],
    },
  ];

  // Build review badges
  const reviewBadges = [
    {
      platform: 'Google',
      rating: reviews.google.rating,
      count: reviews.google.count,
    },
    {
      platform: 'Yelp',
      rating: reviews.yelp.rating,
      count: reviews.yelp.count,
    },
  ];

  // Map cities for the client component
  const cityLinks = cities.map((c) => ({
    id: c.id,
    slug: c.slug,
    city_name: c.city_name,
  }));

  return (
    <FooterClient
      businessName={biz.name}
      logoUrl={biz.logo_url}
      phone={formatPhone(biz.phone)}
      email={biz.email}
      address={biz.address}
      navColumns={navColumns}
      reviews={reviewBadges}
      cities={cityLinks}
    />
  );
}
