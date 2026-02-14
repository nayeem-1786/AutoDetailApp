import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ServiceCategory } from '@/lib/supabase/types';

interface ServiceCategoryCardProps {
  category: ServiceCategory;
  serviceCount?: number;
  featured?: boolean;
}

export function ServiceCategoryCard({ category, featured }: ServiceCategoryCardProps) {
  return (
    <Link href={`/services/${category.slug}`} className="group block h-full">
      <div className="relative h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-7 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 transition-shadow duration-300 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className={`font-display font-semibold text-gray-900 dark:text-gray-100 ${featured ? 'text-xl' : 'text-lg'}`}>
              {category.name}
            </h3>
            {category.description && (
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
                {category.description}
              </p>
            )}
          </div>
          <div className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 group-hover:text-brand-600 transition-colors">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
