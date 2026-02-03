'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FavoriteItem } from '../types';

const SETTINGS_KEY = 'pos_favorites';

let cachedFavorites: FavoriteItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds — short TTL so admin changes appear quickly

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(cachedFavorites ?? []);
  const [loading, setLoading] = useState(!cachedFavorites);

  const fetchFavorites = useCallback(async () => {
    const now = Date.now();
    if (cachedFavorites && now - cacheTimestamp < CACHE_TTL) {
      setFavorites(cachedFavorites);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    if (error || !data) {
      cachedFavorites = [];
      cacheTimestamp = now;
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const items: FavoriteItem[] = Array.isArray(parsed) ? parsed : [];
      cachedFavorites = items;
      cacheTimestamp = now;
      setFavorites(items);
    } catch {
      cachedFavorites = [];
      cacheTimestamp = now;
      setFavorites([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const refresh = useCallback(() => {
    cachedFavorites = null;
    cacheTimestamp = 0;
    fetchFavorites();
  }, [fetchFavorites]);

  return { favorites, loading, refresh };
}
