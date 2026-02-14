import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SITE_URL } from '@/lib/utils/constants';
import { cn } from '@/lib/utils/cn';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  variant?: 'default' | 'light';
}

export function Breadcrumbs({ items, variant = 'default' }: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [{ label: 'Home', href: '/' }, ...items];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: allItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href
        ? { item: `${SITE_URL}${item.href}` }
        : {}),
    })),
  };

  const isLight = variant === 'light';

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className={cn(
        'flex flex-wrap items-center gap-1.5 text-sm',
        isLight ? 'text-blue-200/70' : 'text-gray-500 dark:text-gray-400'
      )}>
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5',
                    isLight ? 'text-blue-300/40' : 'text-gray-300 dark:text-gray-600'
                  )}
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  className={cn(
                    'font-medium',
                    isLight ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'underline underline-offset-2 transition-colors',
                    isLight
                      ? 'decoration-blue-300/30 hover:text-white hover:decoration-blue-300/60'
                      : 'decoration-gray-300 hover:text-gray-900 hover:decoration-gray-500 dark:decoration-gray-600 dark:hover:text-gray-100 dark:hover:decoration-gray-400'
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
