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
      <div className="h-full rounded-2xl bg-brand-surface p-6 border border-site-border transition-all duration-300 hover:border-accent-ui/30 hover:-translate-y-1 hover:shadow-accent-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-site-text group-hover:text-accent-ui transition-colors">
              {category.name}
            </h3>
            {category.description && (
              <p className="mt-2 text-sm leading-relaxed text-site-text-muted line-clamp-2">
                {category.description}
              </p>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 text-site-text-muted group-hover:text-accent-ui transition-colors">
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
