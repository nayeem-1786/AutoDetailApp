'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Phone } from 'lucide-react';

const ACCOUNT_TABS = [
  { label: 'Dashboard', href: '/account' },
  { label: 'Appointments', href: '/account/appointments' },
  { label: 'Vehicles', href: '/account/vehicles' },
  { label: 'Transactions', href: '/account/transactions' },
  { label: 'Service History', href: '/account/services' },
  { label: 'Loyalty', href: '/account/loyalty' },
  { label: 'Profile', href: '/account/profile' },
] as const;

// Format phone for display: +13109551779 -> (310) 955-1779
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return phone;
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { user, customer, loading, signOut } = useCustomerAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [businessPhone, setBusinessPhone] = useState<string | null>(null);

  // Fetch business info
  useEffect(() => {
    fetch('/api/public/business-info')
      .then((res) => res.json())
      .then((info) => setBusinessPhone(info.phone))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Only redirect to signin if not logged in at all
    if (!loading && !user) {
      router.push('/signin?redirect=' + encodeURIComponent(pathname));
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not logged in - will redirect
  if (!user) {
    return null;
  }

  // Logged in but account is deactivated (no linked customer record)
  if (!customer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            Account Access Unavailable
          </h1>
          <p className="mt-3 text-gray-600">
            Your portal access has been temporarily deactivated. This may be due to an account update or administrative action.
          </p>
          <p className="mt-4 text-gray-600">
            Please contact us to restore access to your account.
          </p>
          <div className="mt-8 space-y-3">
            {businessPhone && (
              <a
                href={`tel:${businessPhone.replace(/\D/g, '')}`}
                className="flex items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                <Phone className="h-4 w-4" />
                Call {formatPhone(businessPhone)}
              </a>
            )}
            <Button
              variant="outline"
              onClick={signOut}
              className="w-full rounded-full"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
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
