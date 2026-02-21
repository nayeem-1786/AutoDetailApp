'use client';

import { useState, useEffect } from 'react';
import { RotateCw } from 'lucide-react';

export function PwaRefreshButton() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  if (!isStandalone) return null;

  return (
    <button
      onClick={() => window.location.reload()}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label="Refresh"
      title="Refresh"
    >
      <RotateCw className="h-5 w-5 text-gray-600 dark:text-gray-400" />
    </button>
  );
}
