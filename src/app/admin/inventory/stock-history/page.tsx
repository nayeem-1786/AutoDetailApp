'use client';

import { PageHeader } from '@/components/ui/page-header';
import { History } from 'lucide-react';

export default function StockHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock History"
        description="View all stock adjustments and changes"
      />
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 text-center">
        <History className="mb-4 h-12 w-12 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900">Coming Soon</h3>
        <p className="mt-1 text-sm text-gray-500">
          Stock adjustment history will be available in the next update.
        </p>
      </div>
    </div>
  );
}
