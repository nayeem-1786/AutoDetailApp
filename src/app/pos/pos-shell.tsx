'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
import { canAccessRoute } from '@/lib/auth/roles';
import { TicketProvider } from './context/ticket-context';
import { CheckoutProvider } from './context/checkout-context';
import { CheckoutOverlay } from './components/checkout/checkout-overlay';
import { BottomNav } from './components/bottom-nav';

function PosShellInner({ children }: { children: React.ReactNode }) {
  const { employee, role, loading } = useAuth();
  const router = useRouter();
  const [clock, setClock] = useState('');

  // Live clock
  useEffect(() => {
    function tick() {
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      );
    }
    tick();
    const interval = setInterval(tick, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !employee) {
      router.replace('/pos/login');
    }
  }, [loading, employee, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!employee || !role) {
    return null;
  }

  // Check POS access
  if (!canAccessRoute(role, '/pos')) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium text-gray-700">
          You don&apos;t have access to the POS
        </p>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          Back to Admin
        </Link>
      </div>
    );
  }

  const displayName = employee.first_name || employee.email.split('@')[0];

  return (
    <TicketProvider>
      <CheckoutProvider>
        <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
          {/* Top Bar — simplified: logo, employee name, clock */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
            {/* Left: Back to Admin + Logo */}
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
              <span className="text-lg font-semibold text-gray-900">
                Smart Detail POS
              </span>
            </div>

            {/* Right: Employee + Clock */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {displayName}
              </span>
              <span className="text-sm tabular-nums text-gray-400">{clock}</span>
            </div>
          </header>

          {/* Main Content */}
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

          {/* Bottom Navigation */}
          <BottomNav />
        </div>

        {/* Checkout overlay renders on top of everything */}
        <CheckoutOverlay />
      </CheckoutProvider>
    </TicketProvider>
  );
}

export function PosShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PosShellInner>{children}</PosShellInner>
    </AuthProvider>
  );
}
