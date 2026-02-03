'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils/format';
import { DollarSign, Lock } from 'lucide-react';

const DRAWER_SESSION_KEY = 'pos_drawer_session';

export interface DrawerSession {
  openedAt: string; // ISO timestamp
  openingFloat: number; // starting cash amount
  openedBy: string; // employee name
  status: 'open' | 'closed';
}

function getDrawerSession(): DrawerSession | null {
  try {
    const raw = localStorage.getItem(DRAWER_SESSION_KEY);
    if (raw) {
      return JSON.parse(raw) as DrawerSession;
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

function saveDrawerSession(session: DrawerSession): void {
  localStorage.setItem(DRAWER_SESSION_KEY, JSON.stringify(session));
}

/** Close the current drawer session in localStorage */
export function closeDrawerSession(): void {
  const session = getDrawerSession();
  if (session) {
    session.status = 'closed';
    saveDrawerSession(session);
  }
}

/** Get the last opening float from the most recent session (for pre-filling next-day float) */
export function getLastOpeningFloat(): number | null {
  const session = getDrawerSession();
  if (session) {
    return session.openingFloat;
  }
  return null;
}

interface DrawerStatusBannerProps {
  onStatusChange: (isOpen: boolean) => void;
  employeeName?: string;
}

export function DrawerStatusBanner({
  onStatusChange,
  employeeName = 'Staff',
}: DrawerStatusBannerProps) {
  const [session, setSession] = useState<DrawerSession | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [floatInput, setFloatInput] = useState('200.00');
  const [mounted, setMounted] = useState(false);

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = getDrawerSession();
    setSession(stored);
    setMounted(true);

    // If there's a previous session, pre-fill with the last float
    if (stored) {
      setFloatInput(stored.openingFloat.toFixed(2));
      onStatusChange(stored.status === 'open');
    } else {
      onStatusChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = useCallback(() => {
    const floatAmount = parseFloat(floatInput) || 0;
    const newSession: DrawerSession = {
      openedAt: new Date().toISOString(),
      openingFloat: floatAmount,
      openedBy: employeeName,
      status: 'open',
    };
    saveDrawerSession(newSession);
    setSession(newSession);
    setShowForm(false);
    onStatusChange(true);
  }, [floatInput, employeeName, onStatusChange]);

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return null;
  }

  const isOpen = session?.status === 'open';

  // Drawer is open - show green status banner
  if (isOpen && session) {
    const openedTime = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(session.openedAt));

    return (
      <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
              <DollarSign className="h-3.5 w-3.5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800">
                Drawer open since {openedTime}
              </p>
              <p className="text-xs text-green-600">
                Float: {formatCurrency(session.openingFloat)} &middot; Opened
                by {session.openedBy}
              </p>
            </div>
          </div>
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        </div>
      </div>
    );
  }

  // Drawer is closed or no session - show prompt
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
          <Lock className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <p className="text-sm font-medium text-blue-800">
          Cash drawer is not open. Open drawer to start accepting cash.
        </p>
      </div>

      {!showForm ? (
        <div className="mt-3">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            Open Drawer
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="opening-float"
              className="mb-1 block text-xs font-medium text-blue-700"
            >
              Opening Float
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                $
              </span>
              <Input
                id="opening-float"
                type="number"
                min={0}
                step={0.01}
                value={floatInput}
                onChange={(e) => setFloatInput(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>
          <Button variant="default" size="sm" onClick={handleOpen}>
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
