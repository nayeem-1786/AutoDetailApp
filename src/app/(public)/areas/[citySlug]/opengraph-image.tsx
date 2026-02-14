import { ImageResponse } from 'next/og';
import { getCityBySlug, getActiveCities } from '@/lib/data/cities';
import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';

export const alt = 'Mobile Auto Detailing Service Area';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const cities = await getActiveCities();
  return cities.map((city) => ({
    citySlug: city.slug,
  }));
}

export default async function CityOGImage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const [city, biz, reviews] = await Promise.all([
    getCityBySlug(citySlug),
    getBusinessInfo(),
    getReviewData(),
  ]);

  const cityName = city?.city_name ?? 'South Bay';
  const state = city?.state ?? 'CA';

  const starCount = Math.round(parseFloat(reviews.google.rating || '0'));
  const stars = Array(starCount).fill(null);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '60px 80px',
        }}
      >
        {/* Top accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #2563eb, #3b82f6, #60a5fa)',
          }}
        />

        {/* Location label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: '#60a5fa',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            Service Area
          </div>
        </div>

        {/* City headline */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.1,
            marginTop: 16,
            letterSpacing: '-1px',
          }}
        >
          {`Mobile Auto Detailing in ${cityName}, ${state}`}
        </div>

        {/* Review Stars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: 32,
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            {stars.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fbbf24',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 20, color: '#e2e8f0', fontWeight: 600, marginLeft: 8 }}>
            {reviews.google.rating}
          </span>
          <span style={{ fontSize: 18, color: '#64748b', marginLeft: 4, display: 'flex' }}>
            {`· ${reviews.google.count} Google Reviews`}
          </span>
        </div>

        {/* Business Name */}
        <div
          style={{
            fontSize: 22,
            color: '#64748b',
            marginTop: 'auto',
            paddingTop: 40,
          }}
        >
          {biz.name}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
