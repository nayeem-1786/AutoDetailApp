'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CatalogProduct, CatalogService } from '../types';

interface UseCatalogReturn {
  products: CatalogProduct[];
  services: CatalogService[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

let cachedProducts: CatalogProduct[] | null = null;
let cachedServices: CatalogService[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useCatalog(): UseCatalogReturn {
  const [products, setProducts] = useState<CatalogProduct[]>(
    cachedProducts ?? []
  );
  const [services, setServices] = useState<CatalogService[]>(
    cachedServices ?? []
  );
  const [loading, setLoading] = useState(!cachedProducts);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedProducts && cachedServices && now - cacheTimestamp < CACHE_TTL) {
      setProducts(cachedProducts);
      setServices(cachedServices);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const [productsRes, servicesRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, category:product_categories(*)')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('services')
          .select('*, category:service_categories(*), pricing:service_pricing(*)')
          .eq('is_active', true)
          .order('display_order'),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      const prods = (productsRes.data ?? []) as CatalogProduct[];
      const servs = (servicesRes.data ?? []) as CatalogService[];

      cachedProducts = prods;
      cachedServices = servs;
      cacheTimestamp = Date.now();

      setProducts(prods);
      setServices(servs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const refresh = useCallback(() => fetchCatalog(true), [fetchCatalog]);

  return { products, services, loading, error, refresh };
}
