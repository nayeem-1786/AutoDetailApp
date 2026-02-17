import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SITE_URL } from '@/lib/utils/constants';

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

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-site-text-muted">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-site-text-faint"
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  className="font-medium text-site-text"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="underline underline-offset-2 decoration-site-text-faint transition-colors hover:text-lime hover:decoration-lime"
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
