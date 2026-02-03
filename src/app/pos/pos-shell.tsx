'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
import { canAccessRoute } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/client';
import { TicketProvider } from './context/ticket-context';
import { CheckoutProvider } from './context/checkout-context';
import { CheckoutOverlay } from './components/checkout/checkout-overlay';
import { BottomNav } from './components/bottom-nav';

const POS_SESSION_KEY = 'pos_session_authenticated';
const POS_SESSION_TIMESTAMP_KEY = 'pos_session_timestamp';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

function getPosSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(POS_SESSION_KEY) === 'true';
}

export function setPosSession() {
  sessionStorage.setItem(POS_SESSION_KEY, 'true');
  sessionStorage.setItem(POS_SESSION_TIMESTAMP_KEY, Date.now().toString());
}

export function clearPosSession() {
  sessionStorage.removeItem(POS_SESSION_KEY);
  sessionStorage.removeItem(POS_SESSION_TIMESTAMP_KEY);
}

function PosShellInner({ children }: { children: React.ReactNode }) {
  const { employee, role, loading, signOut } = useAuth();
  const router = useRouter();
  const [clock, setClock] = useState('');
  const [posAuthenticated, setPosAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(DEFAULT_IDLE_TIMEOUT_MINUTES);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load idle timeout setting from business_settings
  useEffect(() => {
    async function loadTimeout() {
      const supabase = createClient();
      const { data } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', 'pos_idle_timeout_minutes')
        .single();

      if (data?.value && typeof data.value === 'number' && data.value > 0) {
        setIdleTimeoutMinutes(data.value);
      }
    }
    loadTimeout();
  }, []);

  // Check POS session on mount
  useEffect(() => {
    setPosAuthenticated(getPosSession());
    setCheckingSession(false);
  }, []);

  // Redirect if not authenticated or no POS session
  useEffect(() => {
    if (loading || checkingSession) return;

    if (!employee || !posAuthenticated) {
      router.replace('/pos/login');
    }
  }, [loading, checkingSession, employee, posAuthenticated, router]);

  // Idle timeout — reset on user activity, sign out when expired
  const handleIdleTimeout = useCallback(() => {
    clearPosSession();
    signOut();
    router.replace('/pos/login');
  }, [signOut, router]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(handleIdleTimeout, idleTimeoutMinutes * 60 * 1000);
  }, [handleIdleTimeout, idleTimeoutMinutes]);

  useEffect(() => {
    if (!posAuthenticated) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetIdleTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer(); // Start initial timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [posAuthenticated, resetIdleTimer]);

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

  if (loading || checkingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!employee || !role || !posAuthenticated) {
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
