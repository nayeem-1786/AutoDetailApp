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
      <div className="h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 transition-shadow hover:shadow-md">
        {/* Image or Placeholder */}
        <div className="relative aspect-[4/3] w-full bg-gray-50 dark:bg-gray-800 overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-3 right-3 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-1 shadow-sm">
            <span className="text-sm font-bold text-brand-600">
              {formatCurrency(product.retail_price)}
            </span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-display text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-600 transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {truncateDescription(product.description)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
