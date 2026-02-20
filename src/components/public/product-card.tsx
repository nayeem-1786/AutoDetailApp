import Link from 'next/link';
import Image from 'next/image';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo } from '@/lib/utils/sale-pricing';
import { AddToCartButton } from './cart/add-to-cart-button';
import type { Product } from '@/lib/supabase/types';

interface ProductCardProps {
  product: Product;
  categorySlug: string;
}

export function ProductCard({ product, categorySlug }: ProductCardProps) {
  const href = `/products/${categorySlug}/${product.slug}`;
  const saleStatus = getSaleStatus(product);
  const saleInfo = getTierSaleInfo(product.retail_price, product.sale_price, saleStatus.isOnSale);
  const effectivePrice = saleInfo?.isDiscounted ? saleInfo.currentPrice : product.retail_price;

  return (
    <div className="group h-full overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm">
      {/* Image — links to detail */}
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] w-full bg-brand-surface overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-site-text-faint" />
            </div>
          )}
          {/* Sale badge */}
          {saleInfo?.isDiscounted && (
            <span className="absolute top-3 left-3 z-10 inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
              Sale
            </span>
          )}
          {/* Price badge */}
          <div className="absolute top-3 right-3 rounded-full bg-black/80 backdrop-blur-sm px-3 py-1 shadow-sm">
            {saleInfo?.isDiscounted ? (
              <>
                <span className="text-xs text-white/60 line-through mr-1.5">
                  {formatCurrency(saleInfo.originalPrice)}
                </span>
                <span className="text-sm font-bold text-lime">
                  {formatCurrency(saleInfo.currentPrice)}
                </span>
              </>
            ) : (
              <span className="text-sm font-bold text-lime">
                {formatCurrency(product.retail_price)}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="p-5">
        <Link href={href}>
          <h3 className="font-display text-base font-bold text-site-text group-hover:text-lime transition-colors">
            {product.name}
          </h3>
        </Link>
        {product.description && (
          <p className="mt-1.5 text-sm text-site-text-muted line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="mt-4">
          <AddToCartButton
            product={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              categorySlug,
              price: effectivePrice,
              stockQuantity: product.quantity_on_hand,
              imageUrl: product.image_url,
            }}
            variant="compact"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
