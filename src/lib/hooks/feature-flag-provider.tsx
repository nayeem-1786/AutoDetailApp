'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface FeatureFlagContextValue {
  flags: Record<string, boolean>;
  loading: boolean;
  refreshFlags: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

const STORAGE_KEY = 'feature_flags';

function readCache(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(flags: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // localStorage full or blocked — ignore
  }
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const cached = readCache();
  const [flags, setFlags] = useState<Record<string, boolean>>(cached);
  const [loading, setLoading] = useState(Object.keys(cached).length === 0);

  const fetchFlags = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('feature_flags').select('key, enabled');
    if (data) {
      const map: Record<string, boolean> = {};
      for (const f of data) {
        map[f.key] = f.enabled;
      }
      setFlags(map);
      setLoading(false);
      writeCache(map);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const refreshFlags = useCallback(async () => {
    await fetchFlags();
  }, [fetchFlags]);

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, refreshFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

/**
 * Access the FeatureFlagProvider context.
 * Returns null if called outside a provider (POS, portal, public pages).
 */
export function useFeatureFlagContext(): FeatureFlagContextValue | null {
  return useContext(FeatureFlagContext);
}

/**
 * Invalidate the localStorage cache.
 * Call after toggling flags so other tabs/pages pick up changes.
 */
export function invalidateFeatureFlagStorage() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
