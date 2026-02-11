'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';

export default function InventoryIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/inventory/purchase-orders');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
}
