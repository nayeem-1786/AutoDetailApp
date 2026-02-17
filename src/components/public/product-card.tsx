import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { Product } from '@/lib/supabase/types';

interface ProductCardProps {
  product: Product;
  categorySlug: string;
}

export function ProductCard({ product, categorySlug }: ProductCardProps) {
  return (
    <Link href={`/products/${categorySlug}/${product.slug}`} className="group block">
      <div className="h-full overflow-hidden rounded-2xl bg-brand-surface border border-site-border transition-all duration-300 hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm">
        {/* Image */}
        <div className="relative aspect-[4/3] w-full bg-brand-surface overflow-hidden">
          {product.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-site-text-faint" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-3 right-3 rounded-full bg-black/80 backdrop-blur-sm px-3 py-1 shadow-sm">
            <span className="text-sm font-bold text-lime">
              {formatCurrency(product.retail_price)}
            </span>
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-display text-base font-bold text-site-text group-hover:text-lime transition-colors">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-1.5 text-sm text-site-text-muted line-clamp-2">
              {product.description}
            </p>
          )}
          <div className="mt-4">
            <span className="block w-full text-center py-2.5 bg-site-border-light border border-site-border text-site-text text-sm font-medium rounded-xl group-hover:bg-lime group-hover:text-black group-hover:border-lime transition-all duration-300">
              View Details
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
