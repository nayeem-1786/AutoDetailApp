'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FeatureFlag } from '@/lib/supabase/types';

// Client-side cache with 60s TTL
let flagCache: Record<string, FeatureFlag> = {};
let lastFetched = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function fetchFlags(): Promise<Record<string, FeatureFlag>> {
  const now = Date.now();
  if (now - lastFetched < CACHE_TTL_MS && Object.keys(flagCache).length > 0) {
    return flagCache;
  }

  const supabase = createClient();
  const { data } = await supabase.from('feature_flags').select('*');

  if (data) {
    const map: Record<string, FeatureFlag> = {};
    for (const flag of data as FeatureFlag[]) {
      map[flag.key] = flag;
    }
    flagCache = map;
    lastFetched = now;
  }

  return flagCache;
}

export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlags().then((flags) => {
      setEnabled(flags[key]?.enabled ?? false);
      setLoading(false);
    });
  }, [key]);

  return { enabled, loading };
}

export function useFeatureFlags(): {
  flags: Record<string, FeatureFlag>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Force cache invalidation
    lastFetched = 0;
    const updated = await fetchFlags();
    setFlags({ ...updated });
  }, []);

  useEffect(() => {
    fetchFlags().then((f) => {
      setFlags(f);
      setLoading(false);
    });
  }, []);

  return { flags, loading, refresh };
}

// Invalidate cache (call after updating flags)
export function invalidateFeatureFlagCache() {
  lastFetched = 0;
  flagCache = {};
}
