'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  ScanLine,
  PauseCircle,
  Keyboard,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { PosAuthProvider, usePosAuth } from './context/pos-auth-context';
import type { PosSessionEmployee } from './context/pos-auth-context';
import { PosPermissionProvider } from './context/pos-permission-context';
import { TicketProvider, useTicket } from './context/ticket-context';
import { CheckoutProvider, useCheckout } from './context/checkout-context';
import { HeldTicketsProvider, useHeldTickets } from './context/held-tickets-context';
import { ReaderProvider, useReader } from './context/reader-context';
import { QuoteProvider } from './context/quote-context';
import { CheckoutOverlay } from './components/checkout/checkout-overlay';
import { BottomNav } from './components/bottom-nav';
import { HeldTicketsPanel } from './components/held-tickets-panel';
import { PinScreen } from './components/pin-screen';
import { OfflineIndicator } from './components/offline-indicator';
import { OfflineQueueBadge } from './components/offline-queue-badge';
import { cn } from '@/lib/utils/cn';

function PosShellInner({ children }: { children: React.ReactNode }) {
  const { employee, role, loading, locked, lock, replaceSession } = usePosAuth();
  const router = useRouter();
  const pathname = usePathname();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { idleTimeoutMinutes } = usePosAuth();

  // Redirect if not authenticated — preserve intended destination
  useEffect(() => {
    if (loading) return;
    if (!employee) {
      const dest = pathname + (typeof window !== 'undefined' && window.location.search ? window.location.search : '');
      const loginUrl = dest && dest !== '/pos' && dest !== '/pos/login'
        ? `/pos/login?next=${encodeURIComponent(dest)}`
        : '/pos/login';
      router.replace(loginUrl);
    }
  }, [loading, employee, router, pathname]);

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

  // Lock screen success handler
  const handleLockSuccess = useCallback(
    (data: { token: string; employee: PosSessionEmployee; idle_timeout_minutes: number }) => {
      const newName = data.employee.first_name || data.employee.email.split('@')[0];
      if (employee && data.employee.id !== employee.id) {
        toast.success(`Welcome, ${newName}`);
      }

      replaceSession({
        token: data.token,
        employee: data.employee,
        idleTimeoutMinutes: data.idle_timeout_minutes,
      });
    },
    [replaceSession, employee]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-800">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (!employee || !role) {
    return null;
  }

  const displayName = employee.first_name || employee.email.split('@')[0];

  return (
    <ReaderProvider>
      <TicketProvider>
        <CheckoutProvider>
          <HeldTicketsProvider>
            <QuoteProvider>
            <PosShellContent displayName={displayName} role={role}>
              {children}
            </PosShellContent>

          {/* Lock screen overlay */}
          {locked && (
            <PinScreen
              overlay
              onSuccess={handleLockSuccess}
              lastSessionName={`${employee.first_name}${employee.last_name ? ' ' + employee.last_name.charAt(0) + '.' : ''}`}
            />
          )}
          </QuoteProvider>
          </HeldTicketsProvider>
        </CheckoutProvider>
      </TicketProvider>
    </ReaderProvider>
  );
}

/** Inner component that has access to all providers */
function PosShellContent({
  children,
  displayName,
  role,
}: {
  children: React.ReactNode;
  displayName: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { ticket, dispatch } = useTicket();
  const { openCheckout, isOpen: checkoutOpen } = useCheckout();
  const { heldTickets } = useHeldTickets();
  const { connectedReader, isConnecting, discoverAndConnect } = useReader();
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
        case 'F3':
          e.preventDefault();
          router.push('/pos/quotes');
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
  }, [dispatch, ticket.items.length, openCheckout, checkoutOpen, shortcutsOpen, heldPanelOpen, router]);

  return (
    <div className="pos-standalone-safe flex h-dvh flex-col overflow-hidden bg-gray-100 dark:bg-gray-950 touch-manipulation pb-[env(safe-area-inset-bottom)]">
      {/* Offline indicator banner */}
      <OfflineIndicator />

      {/* Top Bar */}
      <header className="relative flex h-14 shrink-0 items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4">
        {/* Left: Employee identity */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {displayName}
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500">&middot;</span>
          <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
            {ROLE_LABELS[role] || role}
          </span>
        </div>

        {/* Center: Brand name (absolute centered) */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            <span className="hidden sm:inline">Smart Detail POS</span>
            <span className="sm:hidden">POS</span>
          </span>
        </div>

        {/* Right: Status indicators + actions */}
        <div className="ml-auto flex items-center gap-3">
          {/* Scanner indicator */}
          <div className="flex items-center gap-1" title="Scanner: disconnected">
            <ScanLine className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>

          {/* Card Reader Status */}
          {isConnecting ? (
            <div className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-blue-700 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden text-xs font-medium sm:inline">Connecting...</span>
            </div>
          ) : connectedReader ? (
            <div
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-1 text-green-700 dark:text-green-400"
              title={`Reader: ${connectedReader.label || 'Connected'}`}
            >
              <Wifi className="h-4 w-4" />
              <span className="hidden text-xs font-medium sm:inline">
                {connectedReader.label || 'Reader'}
              </span>
            </div>
          ) : (
            <button
              onClick={discoverAndConnect}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-2 py-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-400"
              title="Tap to connect reader"
            >
              <WifiOff className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">No Reader</span>
            </button>
          )}

          {/* Held Tickets */}
          <button
            onClick={() => setHeldPanelOpen(true)}
            className={cn(
              'flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-2.5 py-1',
              heldCount > 0
                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-400'
            )}
            title="Held tickets"
          >
            <PauseCircle className="h-4 w-4" />
            {heldCount > 0 && <span className="text-xs font-medium">{heldCount} held</span>}
          </button>

          {/* Offline queue badge */}
          <OfflineQueueBadge />
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-0 flex-1 overflow-hidden touch-pan-y">{children}</main>

      {/* Bottom Navigation */}
      <BottomNav onOpenShortcuts={() => setShortcutsOpen(true)} />

      {/* Checkout overlay renders on top of everything */}
      <CheckoutOverlay />

      {/* P3: Held Tickets Panel */}
      <HeldTicketsPanel open={heldPanelOpen} onClose={() => setHeldPanelOpen(false)} />

      {/* P7: Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShortcutsOpen(false)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-6 shadow-2xl dark:shadow-gray-950/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Keyboard Shortcuts
                </h3>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="rounded-full p-1 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">New ticket (clear current)</span>
                <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  F1
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Go to payment / checkout</span>
                <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  F2
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Go to quotes</span>
                <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  F3
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Cancel / go back / close</span>
                <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  Esc
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Toggle this help</span>
                <kbd className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
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
      <PosPermissionProvider>
        <PosShellInner>{children}</PosShellInner>
      </PosPermissionProvider>
    </PosAuthProvider>
  );
}
