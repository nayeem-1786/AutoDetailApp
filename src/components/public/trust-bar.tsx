import { getReviewData } from '@/lib/data/reviews';
import { TrustBarClient } from './trust-bar-client';

export async function TrustBar() {
  const reviews = await getReviewData();

  return (
    <TrustBarClient
      googleRating={reviews.google.rating}
      googleCount={reviews.google.count}
      yelpRating={reviews.yelp.rating}
      yelpCount={reviews.yelp.count}
    />
  );
}
