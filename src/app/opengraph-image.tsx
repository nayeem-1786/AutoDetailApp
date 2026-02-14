import { ImageResponse } from 'next/og';
import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';
import { SITE_DESCRIPTION } from '@/lib/utils/constants';

export const alt = 'Smart Details Auto Spa — Professional Auto Detailing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  const [biz, reviews] = await Promise.all([
    getBusinessInfo(),
    getReviewData(),
  ]);

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
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '60px 80px',
        }}
      >
        {/* Decorative top accent */}
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

        {/* Business Name */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
            letterSpacing: '-1px',
          }}
        >
          {biz.name}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 26,
            color: '#94a3b8',
            textAlign: 'center',
            marginTop: 24,
            maxWidth: 800,
            lineHeight: 1.4,
          }}
        >
          {SITE_DESCRIPTION}
        </div>

        {/* Review Stars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '4px',
            }}
          >
            {stars.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#fbbf24',
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: 22,
              color: '#e2e8f0',
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            {reviews.google.rating}
          </span>
          <span
            style={{
              fontSize: 20,
              color: '#64748b',
              marginLeft: 4,
              display: 'flex',
            }}
          >
            {`· ${reviews.google.count} Google Reviews`}
          </span>
        </div>

        {/* Location */}
        <div
          style={{
            fontSize: 18,
            color: '#475569',
            marginTop: 24,
          }}
        >
          {biz.address}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
