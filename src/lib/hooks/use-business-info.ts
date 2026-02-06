'use client';

import { useState, useEffect } from 'react';
import type { BusinessInfo } from '@/lib/data/business';

let cachedInfo: BusinessInfo | null = null;

export function useBusinessInfo() {
  const [info, setInfo] = useState<BusinessInfo | null>(cachedInfo);
  const [loading, setLoading] = useState(!cachedInfo);

  useEffect(() => {
    if (cachedInfo) {
      setInfo(cachedInfo);
      setLoading(false);
      return;
    }

    fetch('/api/public/business-info')
      .then((res) => res.json())
      .then((data) => {
        cachedInfo = data;
        setInfo(data);
      })
      .catch(() => {
        // Silently fail — pages will show nothing until retry
      })
      .finally(() => setLoading(false));
  }, []);

  return { info, loading };
}
