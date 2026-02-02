'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';

const ACCOUNT_TABS = [
  { label: 'Dashboard', href: '/account' },
  { label: 'Appointments', href: '/account/appointments' },
  { label: 'Vehicles', href: '/account/vehicles' },
  { label: 'Profile', href: '/account/profile' },
] as const;

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { customer, loading } = useCustomerAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !customer) {
      router.push('/signin?redirect=' + encodeURIComponent(pathname));
    }
  }, [loading, customer, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Tab Navigation */}
      <nav className="mb-8 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        {ACCOUNT_TABS.map((tab) => {
          const isActive =
            tab.href === '/account'
              ? pathname === '/account'
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex-shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
