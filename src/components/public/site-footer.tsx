import { getReviewData } from '@/lib/data/reviews';
import { formatPhone } from '@/lib/utils/format';
import { FooterClient } from './footer-client';
import type { FooterData } from '@/lib/supabase/types';

interface SiteFooterProps {
  footerData: FooterData;
}

export async function SiteFooter({ footerData }: SiteFooterProps) {
  const reviews = await getReviewData();

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

  return (
    <FooterClient
      footerData={footerData}
      phone={formatPhone(footerData.businessInfo.phone)}
      reviews={reviewBadges}
    />
  );
}
