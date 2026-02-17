import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { Product } from '@/lib/supabase/types';

interface ProductCardProps {
  product: Product;
  categorySlug: string;
}

function truncateDescription(text: string, maxLength: number = 120): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export function ProductCard({ product, categorySlug }: ProductCardProps) {
  return (
    <Link href={`/products/${categorySlug}/${product.slug}`} className="group block">
      <div className="h-full overflow-hidden rounded-2xl bg-brand-surface border border-white/10 transition-shadow hover:shadow-md">
        {/* Image or Placeholder */}
        <div className="relative aspect-[4/3] w-full bg-brand-surface overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-600" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-3 right-3 rounded-full bg-black/80 backdrop-blur-sm px-3 py-1 shadow-sm">
            <span className="text-sm font-bold text-lime">
              {formatCurrency(product.retail_price)}
            </span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-display text-base font-semibold text-white group-hover:text-lime transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-1.5 text-sm text-gray-400 line-clamp-2">
              {truncateDescription(product.description)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
