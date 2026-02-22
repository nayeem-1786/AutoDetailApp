'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Receipt,
  FileText,
  ShoppingCart,
  ClipboardList,
  MoreHorizontal,
  Vault,
  Sun,
  Moon,
  Monitor,
  RotateCw,
  Maximize2,
  Minimize2,
  Keyboard,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { usePosAuth } from '../context/pos-auth-context';
import { usePosTheme } from '../context/pos-theme-context';

interface BottomNavProps {
  onOpenShortcuts: () => void;
}

export function BottomNav({ onOpenShortcuts }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { employee, role, signOut: posSignOut } = usePosAuth();
  const { theme, setTheme } = usePosTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Cash drawer status
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  // PWA standalone mode
  const [isStandalone, setIsStandalone] = useState(false);

  const displayName = employee?.first_name || employee?.email?.split('@')[0] || '';

  // Read drawer session status from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos_drawer_session');
      if (raw) {
        const session = JSON.parse(raw);
        setDrawerOpen(session.status === 'open');
      }
    } catch { /* ignore */ }
  }, []);

  // Re-read drawer status every time More popover opens (fixes PWA stale state)
  useEffect(() => {
    if (!moreOpen) return;
    try {
      const raw = localStorage.getItem('pos_drawer_session');
      if (raw) {
        const session = JSON.parse(raw);
        setDrawerOpen(session.status === 'open');
      } else {
        setDrawerOpen(false);
      }
    } catch { /* ignore */ }
  }, [moreOpen]);

  // Listen for storage changes (when drawer opens/closes from other components)
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'pos_drawer_session') {
        try {
          if (e.newValue) {
            const session = JSON.parse(e.newValue);
            setDrawerOpen(session.status === 'open');
          } else {
            setDrawerOpen(false);
          }
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Detect PWA standalone mode
  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  // Detect fullscreen capability and state
  useEffect(() => {
    const supportsFullscreen = !!(
      document.documentElement.requestFullscreen ||
      (document.documentElement as any).webkitRequestFullscreen
    );
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setShowFullscreen(supportsFullscreen && hasFinePointer && !standalone);

    const handler = () =>
      setIsFullscreen(
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement
      );

    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  function handleLogout() {
    setMoreOpen(false);
    posSignOut();
    router.replace('/pos/login');
  }

  // Close more menu when clicking/tapping outside
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [moreOpen]);

  // Close popover on Escape
  useEffect(() => {
    if (!moreOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMoreOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [moreOpen]);

  const tabs = [
    {
      label: 'Transactions',
      icon: Receipt,
      href: '/pos/transactions',
      active: pathname.startsWith('/pos/transactions'),
    },
    {
      label: 'Quotes',
      icon: FileText,
      href: '/pos/quotes',
      active: pathname.startsWith('/pos/quotes'),
    },
    {
      label: 'Sale',
      icon: ShoppingCart,
      href: '/pos',
      active: pathname === '/pos',
    },
    {
      label: 'Jobs',
      icon: ClipboardList,
      href: '/pos/jobs',
      active: pathname.startsWith('/pos/jobs'),
    },
  ];

  return (
    <nav className="flex h-14 shrink-0 items-center border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          onClick={() => {
            if (tab.href === '/pos' && pathname === '/pos') {
              window.dispatchEvent(new CustomEvent('pos-reset-register'));
            }
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 min-h-[44px]',
            tab.active
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          )}
        >
          <tab.icon className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
        </Link>
      ))}

      {/* More */}
      <div className="relative flex-1" ref={moreRef}>
        <button
          onClick={() => setMoreOpen((prev) => !prev)}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-0.5 py-1 min-h-[44px]',
            moreOpen
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>

        {/* More popover menu */}
        {moreOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg dark:shadow-gray-950/50">
            {/* Theme segmented control */}
            <div className="px-4 py-3">
              <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
                {([
                  { value: 'light' as const, icon: Sun, label: 'Light' },
                  { value: 'dark' as const, icon: Moon, label: 'Dark' },
                  { value: 'system' as const, icon: Monitor, label: 'System' },
                ] as const).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors',
                      theme === value
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700" />

            {/* Cash Drawer */}
            <Link
              href="/pos/end-of-day"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Vault className={cn('h-5 w-5', drawerOpen ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')} />
              <span className="text-gray-700 dark:text-gray-300">
                Cash Drawer
                <span className={cn('ml-1', drawerOpen ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                  · {drawerOpen ? 'Open' : 'Closed'}
                </span>
              </span>
            </Link>

            <div className="border-t border-gray-100 dark:border-gray-700" />

            {/* Conditional: Refresh App (PWA standalone only) */}
            {isStandalone && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  window.location.reload();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RotateCw className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                Refresh App
              </button>
            )}

            {/* Conditional: Fullscreen (desktop non-standalone only) */}
            {showFullscreen && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  toggleFullscreen();
                }}
                className="flex w-full items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                ) : (
                  <Maximize2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                )}
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            )}

            {/* Keyboard Shortcuts */}
            <button
              onClick={() => {
                setMoreOpen(false);
                onOpenShortcuts();
              }}
              className="flex w-full items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Keyboard className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              Keyboard Shortcuts
            </button>

            <div className="border-t border-gray-100 dark:border-gray-700" />

            {/* Go to Dashboard */}
            <Link
              href="/admin"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ExternalLink className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              Go to Dashboard
            </Link>

            <div className="border-t border-gray-100 dark:border-gray-700" />

            {/* Log Out */}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-b-xl px-4 py-3 min-h-[44px] text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <LogOut className="h-5 w-5 text-red-500 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400">Log Out</span>
              <span className="ml-auto flex items-center gap-2">
                {role && (
                  <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {ROLE_LABELS[role] || role}
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">{displayName}</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
