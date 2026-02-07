import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProductCategory } from '@/lib/supabase/types';

interface ProductCategoryCardProps {
  category: ProductCategory;
  productCount?: number;
}

export function ProductCategoryCard({ category, productCount }: ProductCategoryCardProps) {
  return (
    <Link href={`/products/${category.slug}`} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                {category.name}
              </CardTitle>
              {category.description && (
                <CardDescription className="mt-1.5">
                  {category.description}
                </CardDescription>
              )}
            </div>
            <ArrowRight className="ml-4 mt-1 h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </div>
        </CardHeader>
        {typeof productCount === 'number' && (
          <CardContent>
            <Badge variant="secondary">
              {productCount} {productCount === 1 ? 'product' : 'products'}
            </Badge>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
