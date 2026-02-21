'use client';

import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { getQueueCount, syncAllTransactions } from '@/lib/pos/offline-queue';
import { toast } from 'sonner';

export function OfflineQueueBadge() {
  const isOnline = useOnlineStatus();
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Poll queue count
  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const n = await getQueueCount();
        if (mounted) setCount(n);
      } catch {
        // IndexedDB not available
      }
    }

    check();
    const interval = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline || count === 0) return;

    let cancelled = false;

    async function sync() {
      setSyncing(true);
      try {
        const result = await syncAllTransactions();
        if (cancelled) return;

        if (result.synced > 0) {
          toast.success(`${result.synced} offline transaction${result.synced > 1 ? 's' : ''} synced`);
        }
        if (result.failed > 0) {
          toast.error(`${result.failed} transaction${result.failed > 1 ? 's' : ''} failed to sync — will retry`);
        }

        // Refresh count
        const newCount = await getQueueCount();
        if (!cancelled) setCount(newCount);
      } catch {
        // Will retry next time
      } finally {
        if (!cancelled) setSyncing(false);
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [isOnline, count]);

  if (count === 0) return null;

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700"
      title={`${count} offline transaction${count > 1 ? 's' : ''} pending sync`}
    >
      <CloudOff className={`h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
      <span className="text-xs font-medium">{count} pending</span>
    </div>
  );
}
