import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

// ---------------------------------------------------------------------------
// Review data shape
// ---------------------------------------------------------------------------

export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
}

export interface ReviewData {
  google: {
    rating: string;
    count: string;
    reviews: GoogleReview[];
  };
  yelp: {
    rating: string;
    count: string;
  };
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// getReviewData
// Reads cached Google + Yelp review data from business_settings.
// Google data is populated by /api/cron/google-reviews (daily).
// Yelp data is manually entered by admin.
// ---------------------------------------------------------------------------

async function fetchReviewData(): Promise<ReviewData> {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    supabase = createAnonClient();
  }

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', [
      'google_review_rating',
      'google_review_count',
      'google_reviews_data',
      'google_reviews_updated_at',
      'yelp_review_rating',
      'yelp_review_count',
    ]);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Parse Google reviews array
  let googleReviews: GoogleReview[] = [];
  const rawReviews = settings.google_reviews_data;
  if (Array.isArray(rawReviews)) {
    googleReviews = rawReviews as GoogleReview[];
  } else if (typeof rawReviews === 'string') {
    try {
      googleReviews = JSON.parse(rawReviews) as GoogleReview[];
    } catch {
      // Invalid JSON — use empty
    }
  }

  return {
    google: {
      rating: (settings.google_review_rating as string) || '5.0',
      count: (settings.google_review_count as string) || '44',
      reviews: googleReviews,
    },
    yelp: {
      rating: (settings.yelp_review_rating as string) || '5.0',
      count: (settings.yelp_review_count as string) || '84',
    },
    updatedAt: (settings.google_reviews_updated_at as string) || null,
  };
}

export const getReviewData = cache(fetchReviewData);
