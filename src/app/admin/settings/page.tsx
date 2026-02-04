'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleLeft, Building2, Receipt, MapPin, Star, Timer, ChevronRight, ClipboardList } from 'lucide-react';

interface SettingsItem {
  title: string;
  description: string;
  href: string;
  icon: typeof ToggleLeft;
  roles: readonly string[];
}

interface SettingsGroup {
  label: string;
  items: SettingsItem[];
}

const settingsGroups: SettingsGroup[] = [
  {
    label: 'Business',
    items: [
      {
        title: 'Business Profile',
        description: 'Update your business name, phone number, and address.',
        href: '/admin/settings/business-profile',
        icon: Building2,
        roles: ['super_admin'],
      },
      {
        title: 'Tax Configuration',
        description: 'Set the tax rate and choose whether tax applies to products only.',
        href: '/admin/settings/tax-config',
        icon: Receipt,
        roles: ['super_admin'],
      },
      {
        title: 'Mobile Zones',
        description: 'Manage service zones, distance ranges, and mobile surcharges.',
        href: '/admin/settings/mobile-zones',
        icon: MapPin,
        roles: ['super_admin'],
      },
    ],
  },
  {
    label: 'POS',
    items: [
      {
        title: 'POS Favorites',
        description: 'Configure quick-action tiles on the POS Register tab.',
        href: '/admin/settings/pos-favorites',
        icon: Star,
        roles: ['super_admin'],
      },
      {
        title: 'POS Idle Timeout',
        description: 'Set how long the POS stays active before auto-logout.',
        href: '/admin/settings/pos-idle-timeout',
        icon: Timer,
        roles: ['super_admin'],
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        title: 'Feature Toggles',
        description: 'Enable or disable platform features for all users.',
        href: '/admin/settings/feature-toggles',
        icon: ToggleLeft,
        roles: ['super_admin'],
      },
      {
        title: 'Audit Log',
        description: 'View system activity history and user actions.',
        href: '/admin/settings/audit-log',
        icon: ClipboardList,
        roles: ['super_admin'],
      },
    ],
  },
];

export default function SettingsPage() {
  const { role } = useAuth();

  const visibleGroups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => role && item.roles.includes(role)
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage platform configuration and business preferences."
      />

      {visibleGroups.map((group) => (
        <div key={group.label}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {group.label}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Card className="cursor-pointer transition-shadow hover:shadow-md">
                    <CardContent className="flex items-center gap-4 p-6">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <Icon className="h-6 w-6 text-gray-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {item.title}
                        </h3>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {item.description}
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
      ))}
    </div>
  );
}
