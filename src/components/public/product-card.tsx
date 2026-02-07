import Link from 'next/link';
import { Package, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        {/* Image or Placeholder */}
        <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-gray-800">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            </div>
          )}
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
              {product.name}
            </CardTitle>
            <ArrowRight className="ml-2 mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </div>
          {product.description && (
            <CardDescription className="mt-1">
              {truncateDescription(product.description)}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(product.retail_price)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
