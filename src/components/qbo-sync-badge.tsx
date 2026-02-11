'use client';

import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

interface QboSyncBadgeProps {
  status: 'synced' | 'pending' | 'failed' | 'skipped' | null;
  qboId?: string | null;
  error?: string | null;
  syncedAt?: string | null;
  onRetry?: () => void;
  size?: 'sm' | 'md';
}

export function QboSyncBadge({
  status,
  qboId,
  error,
  syncedAt,
  onRetry,
  size = 'sm',
}: QboSyncBadgeProps) {
  if (!status) return null;

  const isSmall = size === 'sm';

  if (status === 'synced') {
    return (
      <span className="group relative inline-flex">
        <Badge variant="success" className={isSmall ? 'text-[10px] px-1.5 py-0' : ''}>
          QBO ✓
        </Badge>
        {(qboId || syncedAt) && (
          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
            {qboId && <span>QBO ID: {qboId}</span>}
            {qboId && syncedAt && <span> · </span>}
            {syncedAt && (
              <span>
                Synced:{' '}
                {new Date(syncedAt).toLocaleDateString('en-US', {
                  timeZone: 'America/Los_Angeles',
                })}
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <Badge
        variant="warning"
        className={`animate-pulse ${isSmall ? 'text-[10px] px-1.5 py-0' : ''}`}
      >
        QBO Pending
      </Badge>
    );
  }

  if (status === 'failed') {
    return (
      <span className="group relative inline-flex items-center gap-1">
        <Badge variant="destructive" className={isSmall ? 'text-[10px] px-1.5 py-0' : ''}>
          QBO Failed
        </Badge>
        {error && (
          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden max-w-xs -translate-x-1/2 whitespace-normal rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
            {error}
          </span>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-red-600 hover:bg-red-50"
            title="Retry QBO sync"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  if (status === 'skipped') {
    return (
      <Badge variant="secondary" className={isSmall ? 'text-[10px] px-1.5 py-0' : ''}>
        QBO Skipped
      </Badge>
    );
  }

  return null;
}
