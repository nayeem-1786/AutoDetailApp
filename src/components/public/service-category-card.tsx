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
      <div className="relative h-full overflow-hidden rounded-2xl bg-brand-surface p-7 border border-site-border transition-all duration-300 hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className={`font-display font-bold text-site-text group-hover:text-lime transition-colors ${featured ? 'text-xl' : 'text-lg'}`}>
              {category.name}
            </h3>
            {category.description && (
              <p className="mt-2 text-sm leading-relaxed text-site-text-muted line-clamp-2">
                {category.description}
              </p>
            )}
          </div>
          <div className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-site-text-dim group-hover:text-lime transition-colors">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
