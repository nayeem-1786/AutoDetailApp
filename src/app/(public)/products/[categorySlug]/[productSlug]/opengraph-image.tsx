import { ImageResponse } from 'next/og';
import { getProductBySlug } from '@/lib/data/products';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';

export const alt = 'Product Details';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function ProductOGImage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, productSlug } = await params;
  const result = await getProductBySlug(categorySlug, productSlug);
  const biz = await getBusinessInfo();

  const productName = result?.product.name ?? 'Product';
  const categoryName = result?.category.name ?? '';
  const price = result?.product.retail_price;
  const inStock = result?.product ? result.product.quantity_on_hand > 0 : false;

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

        {/* Product Name */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.1,
            marginTop: 16,
            letterSpacing: '-1px',
          }}
        >
          {productName}
        </div>

        {/* Price + Stock */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginTop: 28,
          }}
        >
          {price != null && (
            <div
              style={{
                fontSize: 36,
                color: '#3b82f6',
                fontWeight: 700,
              }}
            >
              {formatCurrency(price)}
            </div>
          )}
          <div
            style={{
              fontSize: 18,
              color: inStock ? '#4ade80' : '#f87171',
              fontWeight: 600,
              padding: '4px 16px',
              borderRadius: '999px',
              background: inStock
                ? 'rgba(74, 222, 128, 0.15)'
                : 'rgba(248, 113, 113, 0.15)',
            }}
          >
            {inStock ? 'In Stock' : 'Out of Stock'}
          </div>
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
