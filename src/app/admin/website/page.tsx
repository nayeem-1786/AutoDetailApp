'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  Image,
  Megaphone,
  RectangleHorizontal,
  Palette,
  Users,
  LayoutGrid,
  Search,
  MapPin,
  FileText,
  ArrowRight,
} from 'lucide-react';

const sections = [
  {
    title: 'Hero',
    description: 'Manage hero slides and carousel images for your homepage.',
    icon: Image,
    href: '/admin/website/hero',
  },
  {
    title: 'Tickers',
    description: 'Configure announcement tickers and scrolling messages.',
    icon: Megaphone,
    href: '/admin/website/tickers',
  },
  {
    title: 'Ads',
    description: 'Manage ad creatives and placements across your site.',
    icon: RectangleHorizontal,
    href: '/admin/website/ads',
  },
  {
    title: 'Themes',
    description: 'Create seasonal themes with particle effects and styling.',
    icon: Palette,
    href: '/admin/website/themes',
  },
  {
    title: 'About & Team',
    description: 'Manage team members, credentials, and about page content.',
    icon: Users,
    href: '/admin/website/about',
  },
  {
    title: 'Catalog Display',
    description: 'Control website visibility for services and products.',
    icon: LayoutGrid,
    href: '/admin/website/catalog',
  },
  {
    title: 'SEO',
    description: 'Configure SEO settings for individual pages.',
    icon: Search,
    href: '/admin/website/seo',
  },
  {
    title: 'City Pages',
    description: 'Manage local city landing pages for regional SEO.',
    icon: MapPin,
    href: '/admin/website/seo/cities',
  },
  {
    title: 'Terms & Conditions',
    description: 'Edit terms and conditions page content.',
    icon: FileText,
    href: '/admin/website/terms',
  },
];

export default function WebsitePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Website"
        description="Manage your public-facing website content, SEO, and appearance."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <Icon className="h-6 w-6 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {section.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        {section.description}
                      </p>
                      <div className="flex items-center text-sm font-medium text-brand-600">
                        Manage
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
