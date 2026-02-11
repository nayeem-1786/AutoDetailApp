'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureFlagContext, invalidateFeatureFlagStorage } from './feature-flag-provider';
import type { FeatureFlag } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Module-level cache (shared across all hook instances in the same JS bundle)
// Used as fallback when no FeatureFlagProvider is present (POS, portal, public)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'feature_flags';
let flagCache: Record<string, FeatureFlag> = {};
let lastFetched = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// Hydrate module cache from localStorage on first import (instant, no async)
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, boolean> = JSON.parse(raw);
      for (const [key, enabled] of Object.entries(parsed)) {
        flagCache[key] = { key, enabled } as FeatureFlag;
      }
    }
  } catch {
    // ignore
  }
}

async function fetchFlags(): Promise<Record<string, FeatureFlag>> {
  const now = Date.now();
  if (now - lastFetched < CACHE_TTL_MS && Object.keys(flagCache).length > 0) {
    return flagCache;
  }

  const supabase = createClient();
  const { data } = await supabase.from('feature_flags').select('*');

  if (data) {
    const map: Record<string, FeatureFlag> = {};
    const storageMap: Record<string, boolean> = {};
    for (const flag of data as FeatureFlag[]) {
      map[flag.key] = flag;
      storageMap[flag.key] = flag.enabled;
    }
    flagCache = map;
    lastFetched = now;

    // Persist to localStorage for instant hydration on next page load
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageMap));
    } catch {
      // ignore
    }
  }

  return flagCache;
}

// ---------------------------------------------------------------------------
// useFeatureFlag — reads from context (if inside FeatureFlagProvider) or
// falls back to module-level cache with localStorage hydration.
// Defaults to TRUE while loading to prevent flash of hidden content.
// ---------------------------------------------------------------------------

export function useFeatureFlag(key: string): { enabled: boolean; loading: boolean } {
  // Try context first (available inside admin shell)
  const ctx = useFeatureFlagContext();

  // Standalone fallback state (POS, portal, public pages)
  const hasCachedValue = key in flagCache;
  const [enabled, setEnabled] = useState(hasCachedValue ? flagCache[key].enabled : true);
  const [loading, setLoading] = useState(!hasCachedValue);

  useEffect(() => {
    // If inside provider, context handles everything — skip standalone fetch
    if (ctx) return;

    fetchFlags().then((flags) => {
      setEnabled(flags[key]?.enabled ?? false);
      setLoading(false);
    });
  }, [key, ctx]);

  // If inside provider, use context values
  if (ctx) {
    if (key in ctx.flags) {
      return { enabled: ctx.flags[key], loading: false };
    }
    // Flags loading with no cached value — default to true (less jarring)
    if (ctx.loading) {
      return { enabled: true, loading: true };
    }
    // Flag doesn't exist in DB — fail closed
    return { enabled: false, loading: false };
  }

  // Standalone mode
  return { enabled, loading };
}

// ---------------------------------------------------------------------------
// useFeatureFlags — used by Feature Toggles settings page
// ---------------------------------------------------------------------------

export function useFeatureFlags(): {
  flags: Record<string, FeatureFlag>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  // Only use cache for initial state if it has full FeatureFlag objects (not localStorage stubs)
  const cacheHasFullData = Object.keys(flagCache).length > 0 && Object.values(flagCache).every((f) => f.name !== undefined);
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>(
    cacheHasFullData ? { ...flagCache } : {}
  );
  const [loading, setLoading] = useState(!cacheHasFullData);

  const refresh = useCallback(async () => {
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

// Invalidate all caches (module + localStorage)
export function invalidateFeatureFlagCache() {
  lastFetched = 0;
  flagCache = {};
  invalidateFeatureFlagStorage();
}
