'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      // Just came back online
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      setWasOffline(false);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-2 bg-green-500 dark:bg-green-600 py-2 text-center text-sm font-medium text-white">
        <Wifi className="h-4 w-4" />
        Back online — syncing queued transactions...
      </div>
    );
  }

  return (
    <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 dark:bg-amber-600 py-2 text-center text-sm font-medium text-black dark:text-white">
      <WifiOff className="h-4 w-4" />
      You&apos;re offline — Cash transactions only. Data will sync when reconnected.
    </div>
  );
}
