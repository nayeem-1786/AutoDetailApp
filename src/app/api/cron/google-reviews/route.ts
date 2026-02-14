import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CRON_API_KEY = process.env.CRON_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DEFAULT_PLACE_ID = 'ChIJf7qNDhW1woAROX-FX8CScGE';

interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  relative_time_description: string;
  time: number;
  profile_photo_url?: string;
}

interface GooglePlacesResponse {
  result?: {
    rating?: number;
    user_ratings_total?: number;
    reviews?: GoogleReview[];
  };
  status: string;
  error_message?: string;
}

interface StoredReview {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
}

export async function GET(request: Request) {
  try {
    // Auth check
    const apiKey = request.headers.get('x-api-key');
    if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
      console.error('[CRON] google-reviews: Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!GOOGLE_API_KEY) {
      console.error('[CRON] google-reviews: GOOGLE_PLACES_API_KEY not configured');
      return NextResponse.json(
        { error: 'GOOGLE_PLACES_API_KEY not configured' },
        { status: 500 }
      );
    }

    const supabase = createAdminClient();

    // Get place ID from settings or use default
    const { data: placeIdSetting, error: settingsError } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'google_place_id')
      .maybeSingle();

    if (settingsError) {
      console.error('[CRON] google-reviews: Error fetching place ID:', settingsError);
    }

    const placeId = (placeIdSetting?.value as string) || DEFAULT_PLACE_ID;
    console.log('[CRON] google-reviews: Using place ID:', placeId);

    // Fetch from Google Places API
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[CRON] google-reviews: HTTP error from Google API:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch from Google Places API', status: response.status },
        { status: 502 }
      );
    }

    const data = await response.json() as GooglePlacesResponse;

    if (data.status !== 'OK') {
      console.error('[CRON] google-reviews: Google API error:', data.status, data.error_message);
      return NextResponse.json(
        {
          error: 'Google API error',
          details: data.status,
          message: data.error_message
        },
        { status: 502 }
      );
    }

    if (!data.result) {
      console.error('[CRON] google-reviews: No result in Google API response');
      return NextResponse.json(
        { error: 'No result returned from Google Places API' },
        { status: 502 }
      );
    }

    const result = data.result;
    const rating = String(result.rating ?? '5.0');
    const count = String(result.user_ratings_total ?? '0');

    // Map reviews to our format (up to 5)
    const reviews: StoredReview[] = (result.reviews ?? []).slice(0, 5).map((r) => ({
      author: r.author_name,
      rating: r.rating,
      text: r.text,
      relativeTime: r.relative_time_description,
    }));

    const now = new Date().toISOString();

    // Upsert all settings
    const settings = [
      { key: 'google_review_rating', value: rating },
      { key: 'google_review_count', value: count },
      { key: 'google_reviews_data', value: reviews },
      { key: 'google_reviews_updated_at', value: now },
    ];

    for (const s of settings) {
      const { error: upsertError } = await supabase
        .from('business_settings')
        .upsert(
          { key: s.key, value: s.value as any, updated_at: now },
          { onConflict: 'key' }
        );

      if (upsertError) {
        console.error(`[CRON] google-reviews: Error upserting ${s.key}:`, upsertError);
        return NextResponse.json(
          { error: `Failed to update setting: ${s.key}`, details: upsertError.message },
          { status: 500 }
        );
      }
    }

    console.log('[CRON] google-reviews: Success - rating:', rating, 'count:', count, 'reviews:', reviews.length);

    return NextResponse.json({
      success: true,
      rating,
      count,
      reviewsFetched: reviews.length,
      updatedAt: now,
    });
  } catch (error) {
    console.error('[CRON] google-reviews failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal error', details: errorMessage },
      { status: 500 }
    );
  }
}
