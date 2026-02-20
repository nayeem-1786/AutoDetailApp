import { getReviewData } from '@/lib/data/reviews';
import { getVehicleCount } from '@/lib/data/vehicle-count';
import { TrustBarClient } from './trust-bar-client';

export async function TrustBar() {
  const [reviews, vehicleCount] = await Promise.all([
    getReviewData(),
    getVehicleCount(),
  ]);

  return (
    <TrustBarClient
      googleRating={reviews.google.rating}
      googleCount={reviews.google.count}
      yelpRating={reviews.yelp.rating}
      yelpCount={reviews.yelp.count}
      vehicleCount={vehicleCount}
    />
  );
}
