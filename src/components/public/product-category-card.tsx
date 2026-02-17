import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProductCategory } from '@/lib/supabase/types';

interface ProductCategoryCardProps {
  category: ProductCategory;
  productCount?: number;
}

export function ProductCategoryCard({ category, productCount }: ProductCategoryCardProps) {
  return (
    <Link href={`/products/${category.slug}`} className="group block">
      <div className="h-full rounded-2xl bg-brand-surface p-6 shadow-sm border border-white/10 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold text-white group-hover:text-lime transition-colors">
              {category.name}
            </h3>
            {category.description && (
              <p className="mt-2 text-sm leading-relaxed text-gray-400 line-clamp-2">
                {category.description}
              </p>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 text-gray-400 group-hover:text-lime transition-colors">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {typeof productCount === 'number' && (
          <div className="mt-4">
            <Badge variant="secondary">
              {productCount} {productCount === 1 ? 'product' : 'products'}
            </Badge>
          </div>
        )}
      </div>
    </Link>
  );
}
