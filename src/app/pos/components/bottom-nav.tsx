'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut,
  Vault,
  Receipt,
  MoreHorizontal,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/auth/auth-provider';
import { clearPosSession } from '../pos-shell';

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { employee, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const initials = employee
    ? `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase()
    : '';

  // Read drawer session status from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos_drawer_session');
      if (raw) {
        const session = JSON.parse(raw);
        setDrawerOpen(session.status === 'open');
      }
    } catch {
      /* ignore */
    }
  }, []);

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
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  async function handleLogout() {
    clearPosSession();
    await signOut();
    router.replace('/pos/login');
  }

  // Close more menu when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  return (
    <nav className="flex h-14 shrink-0 items-center justify-around border-t border-gray-200 bg-white px-2">
      {/* Log out */}
      <button
        onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-500 hover:text-gray-800"
      >
        <LogOut className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">{initials || 'Out'}</span>
      </button>

      {/* Register */}
      <Link
        href="/pos/end-of-day"
        className={cn(
          'flex flex-col items-center gap-0.5 px-3 py-1',
          pathname === '/pos/end-of-day' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        <div className="relative">
          <Vault className="h-5 w-5" />
          {drawerOpen && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-green-500" />
          )}
        </div>
        <span className="text-[10px] font-medium leading-tight">Register</span>
      </Link>

      {/* Transactions */}
      <Link
        href="/pos/transactions"
        className={cn(
          'flex flex-col items-center gap-0.5 px-3 py-1',
          pathname.startsWith('/pos/transactions') ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
        )}
      >
        <Receipt className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">Transactions</span>
      </Link>

      {/* More */}
      <div className="relative" ref={moreRef}>
        <button
          onClick={() => setMoreOpen((prev) => !prev)}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1',
            moreOpen ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>

        {/* More dropdown menu */}
        {moreOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <Link
              href="/admin"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
              Go to Admin
            </Link>
            <button
              onClick={() => {
                setMoreOpen(false);
                // Settings placeholder - no settings page yet
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4 text-gray-400" />
              Settings
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
