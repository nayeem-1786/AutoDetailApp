'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AddonSuggestionEntry {
  addonServiceId: string;
  addonServiceName: string;
  comboPrice: number | null;
  displayOrder: number;
}

// Module-level cache
let cachedSuggestionsMap: Map<string, AddonSuggestionEntry[]> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches and caches addon suggestions as a Map<primaryServiceId, AddonSuggestionEntry[]>.
 * Only returns auto_suggest=true, non-seasonal (or currently in-season) entries.
 */
export function useAddonSuggestions() {
  const [suggestionsMap, setSuggestionsMap] = useState<Map<string, AddonSuggestionEntry[]>>(
    cachedSuggestionsMap ?? new Map()
  );
  const [loading, setLoading] = useState(!cachedSuggestionsMap);

  const fetchSuggestions = useCallback(async () => {
    const now = Date.now();
    if (cachedSuggestionsMap && now - cacheTimestamp < CACHE_TTL) {
      setSuggestionsMap(cachedSuggestionsMap);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('service_addon_suggestions')
        .select('primary_service_id, addon_service_id, combo_price, display_order, auto_suggest, is_seasonal, seasonal_start, seasonal_end, addon_service:addon_service_id(id, name)')
        .eq('auto_suggest', true)
        .order('display_order');

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);
      const map = new Map<string, AddonSuggestionEntry[]>();

      for (const row of data ?? []) {
        // Filter seasonal: if seasonal, check if today is within range
        if (row.is_seasonal) {
          if (row.seasonal_start && today < row.seasonal_start) continue;
          if (row.seasonal_end && today > row.seasonal_end) continue;
        }

        const addonService = row.addon_service as unknown as { id: string; name: string } | null;
        if (!addonService) continue;

        const entry: AddonSuggestionEntry = {
          addonServiceId: addonService.id,
          addonServiceName: addonService.name,
          comboPrice: row.combo_price,
          displayOrder: row.display_order,
        };

        const existing = map.get(row.primary_service_id) ?? [];
        existing.push(entry);
        map.set(row.primary_service_id, existing);
      }

      cachedSuggestionsMap = map;
      cacheTimestamp = Date.now();
      setSuggestionsMap(map);
    } catch (err) {
      console.error('Failed to load addon suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return { suggestionsMap, loading };
}
