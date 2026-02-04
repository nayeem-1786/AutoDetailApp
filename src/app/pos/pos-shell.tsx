'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  ScanLine,
  PauseCircle,
  Keyboard,
  X,
  Lock,
} from 'lucide-react';
import { canAccessRoute } from '@/lib/auth/roles';
import { PosAuthProvider, usePosAuth } from './context/pos-auth-context';
import { TicketProvider, useTicket } from './context/ticket-context';
import { CheckoutProvider, useCheckout } from './context/checkout-context';
import { HeldTicketsProvider, useHeldTickets } from './context/held-tickets-context';
import { CheckoutOverlay } from './components/checkout/checkout-overlay';
import { BottomNav } from './components/bottom-nav';
import { HeldTicketsPanel } from './components/held-tickets-panel';
import { PinPad } from './components/pin-pad';
import { cn } from '@/lib/utils/cn';

function PosShellInner({ children }: { children: React.ReactNode }) {
  const { employee, role, loading, locked, lock, replaceSession, signOut } = usePosAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [clock, setClock] = useState('');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { idleTimeoutMinutes } = usePosAuth();

  // Lock screen state
  const [lockDigits, setLockDigits] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockSubmitting, setLockSubmitting] = useState(false);
  const [lockShake, setLockShake] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (loading) return;
    if (!employee) {
      router.replace('/pos/login');
    }
  }, [loading, employee, router]);

  // Idle timeout — set locked = true (shows PIN overlay)
  const handleIdleTimeout = useCallback(() => {
    lock();
  }, [lock]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(handleIdleTimeout, idleTimeoutMinutes * 60 * 1000);
  }, [handleIdleTimeout, idleTimeoutMinutes]);

  useEffect(() => {
    if (!employee || locked) return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => resetIdleTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer(); // Start initial timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [employee, locked, resetIdleTimer]);

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

  // Lock screen PIN submit
  const handleLockPinSubmit = useCallback(
    async (pin: string) => {
      setLockSubmitting(true);
      setLockError(null);

      try {
        const res = await fetch('/api/pos/auth/pin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Invalid PIN');
        }

        // Replace session with new employee (handles both same and different employee)
        replaceSession({
          token: data.token,
          employee: data.employee,
          idleTimeoutMinutes: data.idle_timeout_minutes,
        });

        setLockDigits('');
      } catch (err) {
        setLockError(err instanceof Error ? err.message : 'Invalid PIN');
        setLockDigits('');
        setLockShake(true);
        setTimeout(() => setLockShake(false), 500);
      } finally {
        setLockSubmitting(false);
      }
    },
    [replaceSession]
  );

  function handleLockDigit(d: string) {
    if (d === '.' || lockSubmitting) return;
    const next = lockDigits + d;
    if (next.length > 4) return;

    setLockDigits(next);
    setLockError(null);

    if (next.length === 4) {
      handleLockPinSubmit(next);
    }
  }

  function handleLockBackspace() {
    if (lockSubmitting) return;
    setLockDigits(lockDigits.slice(0, -1));
    setLockError(null);
  }

  function handleLockLogout() {
    signOut();
    router.replace('/pos/login');
  }

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
        <HeldTicketsProvider>
          <PosShellContent displayName={displayName} clock={clock} role={role}>
            {children}
          </PosShellContent>

          {/* Lock screen overlay */}
          {locked && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/95">
              <div className="w-full max-w-sm px-4">
                <div className="mb-6 flex flex-col items-center gap-2">
                  <Lock className="h-10 w-10 text-gray-400" />
                  <h2 className="text-xl font-bold text-white">Screen Locked</h2>
                  <p className="text-sm text-gray-400">
                    Enter PIN to continue as {employee.first_name} or switch user
                  </p>
                </div>

                {/* Dot indicators */}
                <div
                  className={cn(
                    'mb-6 flex items-center justify-center gap-4',
                    lockShake && 'animate-shake'
                  )}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-4 w-4 rounded-full border-2 transition-all duration-150',
                        i < lockDigits.length
                          ? 'border-white bg-white'
                          : 'border-gray-500 bg-transparent'
                      )}
                    />
                  ))}
                </div>

                {lockError && (
                  <p className="mb-4 text-center text-sm text-red-400">{lockError}</p>
                )}

                {lockSubmitting && (
                  <p className="mb-4 text-center text-sm text-gray-400">Verifying...</p>
                )}

                <PinPad
                  onDigit={handleLockDigit}
                  onBackspace={handleLockBackspace}
                  size="lg"
                />

                <button
                  onClick={handleLockLogout}
                  className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-300"
                >
                  Sign out instead
                </button>
              </div>

              <style jsx>{`
                @keyframes shake {
                  0%, 100% { transform: translateX(0); }
                  10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
                  20%, 40%, 60%, 80% { transform: translateX(8px); }
                }
                .animate-shake {
                  animation: shake 0.5s ease-in-out;
                }
              `}</style>
            </div>
          )}
        </HeldTicketsProvider>
      </CheckoutProvider>
    </TicketProvider>
  );
}

/** Inner component that has access to all providers */
function PosShellContent({
  children,
  displayName,
  clock,
  role,
}: {
  children: React.ReactNode;
  displayName: string;
  clock: string;
  role: string;
}) {
  const pathname = usePathname();
  const { ticket, dispatch } = useTicket();
  const { openCheckout, isOpen: checkoutOpen } = useCheckout();
  const { heldTickets } = useHeldTickets();
  const [heldPanelOpen, setHeldPanelOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const heldCount = heldTickets.length;

  // P7: Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Escape should still work in inputs
        if (e.key !== 'Escape') return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          dispatch({ type: 'CLEAR_TICKET' });
          break;
        case 'F2':
          e.preventDefault();
          if (ticket.items.length > 0 && !checkoutOpen) {
            openCheckout();
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (shortcutsOpen) {
            setShortcutsOpen(false);
          } else if (heldPanelOpen) {
            setHeldPanelOpen(false);
          }
          break;
        case '?':
          // Only toggle shortcuts if no modifier keys
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            // Don't trigger when typing in inputs (already handled above except Escape)
            if (
              target.tagName !== 'INPUT' &&
              target.tagName !== 'TEXTAREA' &&
              !target.isContentEditable
            ) {
              e.preventDefault();
              setShortcutsOpen((prev) => !prev);
            }
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, ticket.items.length, openCheckout, checkoutOpen, shortcutsOpen, heldPanelOpen]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        {/* Left: Back navigation + Logo */}
        <div className="flex items-center gap-4">
          <Link
            href={pathname === '/pos' ? '/admin' : '/pos'}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{pathname === '/pos' ? 'Admin' : 'POS'}</span>
          </Link>
          <span className="text-lg font-semibold text-gray-900">
            Smart Detail POS
          </span>
        </div>

        {/* Right: Scanner indicator + Held tickets + Employee + Clock + Shortcuts help */}
        <div className="flex items-center gap-3">
          {/* P5: Scanner Connection Indicator */}
          <div className="flex items-center gap-1" title="Scanner: disconnected">
            <ScanLine className="h-4 w-4 text-gray-400" />
            <span className="hidden text-xs text-gray-400 sm:inline">Disconnected</span>
          </div>

          {/* P3: Held Tickets badge */}
          {heldCount > 0 && (
            <button
              onClick={() => setHeldPanelOpen(true)}
              className="relative flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 hover:bg-amber-100"
            >
              <PauseCircle className="h-4 w-4" />
              <span className="text-xs font-medium">{heldCount} held</span>
            </button>
          )}

          {/* Show held tickets panel even when count is 0 — the button just won't be visible */}
          {heldCount === 0 && (
            <button
              onClick={() => setHeldPanelOpen(true)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Held tickets"
            >
              <PauseCircle className="h-4 w-4" />
            </button>
          )}

          <span className="text-sm font-medium text-gray-700">
            {displayName}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {role === 'super_admin' ? 'Admin' : role === 'admin' ? 'Admin' : 'Cashier'}
          </span>
          <span className="text-sm tabular-nums text-gray-400">{clock}</span>

          {/* P7: Shortcuts help button */}
          <button
            onClick={() => setShortcutsOpen((prev) => !prev)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Checkout overlay renders on top of everything */}
      <CheckoutOverlay />

      {/* P3: Held Tickets Panel */}
      <HeldTicketsPanel open={heldPanelOpen} onClose={() => setHeldPanelOpen(false)} />

      {/* P7: Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Keyboard Shortcuts
                </h3>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">New ticket (clear current)</span>
                <kbd className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  F1
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Go to payment / checkout</span>
                <kbd className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  F2
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Cancel / go back / close</span>
                <kbd className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  Esc
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Toggle this help</span>
                <kbd className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                  ?
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PosShell({ children }: { children: React.ReactNode }) {
  return (
    <PosAuthProvider>
      <PosShellInner>{children}</PosShellInner>
    </PosAuthProvider>
  );
}
