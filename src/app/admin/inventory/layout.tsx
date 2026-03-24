'use client';

import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { Warehouse } from 'lucide-react';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const { enabled, loading } = useFeatureFlag(FEATURE_FLAGS.INVENTORY_MANAGEMENT);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex h-[calc(100vh-7rem)] flex-col">
        <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="text-center px-6">
            <Warehouse className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">Inventory Management is Disabled</h2>
            <p className="mt-2 text-sm text-gray-500 max-w-md">
              Enable the Inventory Management feature flag to access purchase orders, vendors, and stock history.
            </p>
            <a
              href="/admin/settings/feature-toggles"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Go to Feature Toggles
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
