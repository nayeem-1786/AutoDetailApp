'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleLeft, Building2, Receipt, MapPin, Star, Timer, ChevronRight } from 'lucide-react';

const settingsSections = [
  {
    title: 'Feature Toggles',
    description: 'Enable or disable platform features for all users.',
    href: '/admin/settings/feature-toggles',
    icon: ToggleLeft,
    roles: ['super_admin'] as const,
  },
  {
    title: 'Business Profile',
    description: 'Update your business name, phone number, and address.',
    href: '/admin/settings/business-profile',
    icon: Building2,
    roles: ['super_admin'] as const,
  },
  {
    title: 'Tax Configuration',
    description: 'Set the tax rate and choose whether tax applies to products only.',
    href: '/admin/settings/tax-config',
    icon: Receipt,
    roles: ['super_admin'] as const,
  },
  {
    title: 'Mobile Zones',
    description: 'Manage service zones, distance ranges, and mobile surcharges.',
    href: '/admin/settings/mobile-zones',
    icon: MapPin,
    roles: ['super_admin'] as const,
  },
  {
    title: 'POS Favorites',
    description: 'Configure quick-action tiles on the POS Register tab.',
    href: '/admin/settings/pos-favorites',
    icon: Star,
    roles: ['super_admin'] as const,
  },
  {
    title: 'POS Idle Timeout',
    description: 'Set how long the POS stays active before auto-logout.',
    href: '/admin/settings/pos-idle-timeout',
    icon: Timer,
    roles: ['super_admin'] as const,
  },
];

export default function SettingsPage() {
  const { role } = useAuth();

  const visibleSections = settingsSections.filter(
    (section) => role && section.roles.includes(role as (typeof section.roles)[number])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage platform configuration and business preferences."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Icon className="h-6 w-6 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {section.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {section.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
