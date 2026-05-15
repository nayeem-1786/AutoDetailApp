import { ImageResponse } from 'next/og';
import { getServiceBySlug } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';

export const alt = 'Service Details';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function getStartingPrice(service: {
  pricing_model: string;
  flat_price: number | null;
  custom_starting_price: number | null;
  per_unit_price: number | null;
  per_unit_label: string | null;
  service_pricing?: { price: number }[];
}): string | null {
  switch (service.pricing_model) {
    case 'flat':
      return service.flat_price != null ? formatCurrency(service.flat_price) : null;
    case 'custom':
      return service.custom_starting_price != null
        ? `Starting from ${formatCurrency(service.custom_starting_price)}`
        : null;
    case 'per_unit':
      return service.per_unit_price != null
        ? `${formatCurrency(service.per_unit_price)} per ${service.per_unit_label ?? 'unit'}`
        : null;
    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      const prices = (service.service_pricing ?? []).map((p) => p.price).filter((p) => p > 0);
      if (prices.length > 0) {
        return `Starting from ${formatCurrency(Math.min(...prices))}`;
      }
      return null;
    }
    default:
      return null;
  }
}

export default async function ServiceOGImage({
  params,
}: {
  params: Promise<{ categorySlug: string; serviceSlug: string }>;
}) {
  const { categorySlug, serviceSlug } = await params;
  const result = await getServiceBySlug(categorySlug, serviceSlug);
  const biz = await getBusinessInfo();

  const serviceName = result?.service.name ?? 'Service';
  const categoryName = result?.category.name ?? '';
  const priceLabel = result?.service ? getStartingPrice(result.service) : null;

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

        {/* Category label */}
        <div
          style={{
            fontSize: 20,
            color: '#60a5fa',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {categoryName}
        </div>

        {/* Service Name */}
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
          {serviceName}
        </div>

        {/* Price */}
        {priceLabel && (
          <div
            style={{
              fontSize: 30,
              color: '#3b82f6',
              fontWeight: 700,
              marginTop: 28,
            }}
          >
            {priceLabel}
          </div>
        )}

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
