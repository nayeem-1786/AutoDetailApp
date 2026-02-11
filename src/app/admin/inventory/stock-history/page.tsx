'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { StockAdjustment } from '@/lib/supabase/types';
import { formatDateTime } from '@/lib/utils/format';
import { STOCK_ADJUSTMENT_TYPE_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

const PAGE_SIZE = 50;

export default function StockHistoryPage() {
  const router = useRouter();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);

  async function loadAdjustments() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (typeFilter) params.set('type', typeFilter);

      const res = await adminFetch(`/api/admin/stock-adjustments?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAdjustments(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      console.error('Load stock adjustments error:', err);
      toast.error('Failed to load stock history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
  }, [typeFilter]);

  useEffect(() => {
    loadAdjustments();
  }, [typeFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns: ColumnDef<StockAdjustment, unknown>[] = [
    {
      accessorKey: 'created_at',
      header: 'Date',
      size: 150,
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'product',
      header: 'Product',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.product?.name || '--'}</div>
          {row.original.product?.sku && (
            <div className="font-mono text-xs text-gray-400">{row.original.product.sku}</div>
          )}
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => {
        const type = row.original.adjustment_type;
        let variant: 'default' | 'info' | 'success' | 'warning' | 'destructive' | 'secondary' = 'default';
        if (type === 'received') variant = 'success';
        else if (type === 'sold') variant = 'info';
        else if (type === 'damaged') variant = 'destructive';
        else if (type === 'returned') variant = 'warning';
        return (
          <Badge variant={variant}>
            {STOCK_ADJUSTMENT_TYPE_LABELS[type] || type}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      id: 'change',
      header: 'Change',
      size: 80,
      cell: ({ row }) => {
        const qty = row.original.quantity_change;
        return (
          <span className={`font-medium ${qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {qty > 0 ? `+${qty}` : qty}
          </span>
        );
      },
    },
    {
      id: 'stock_level',
      header: 'Stock Level',
      size: 130,
      cell: ({ row }) => (
        <span className="text-gray-600">
          {row.original.quantity_before} → {row.original.quantity_after}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="text-gray-500 text-sm">
          {row.original.reason || '--'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'reference',
      header: 'Reference',
      size: 100,
      cell: ({ row }) => {
        const adj = row.original;
        if (adj.reference_type === 'purchase_order' && adj.reference_id) {
          return (
            <button
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
              onClick={() => router.push(`/admin/inventory/purchase-orders/${adj.reference_id}`)}
            >
              View PO
            </button>
          );
        }
        return <span className="text-gray-400">--</span>;
      },
      enableSorting: false,
    },
    {
      id: 'created_by',
      header: 'By',
      size: 120,
      cell: ({ row }) => {
        const emp = row.original.created_by_employee;
        return emp ? `${emp.first_name} ${emp.last_name}` : '--';
      },
      enableSorting: false,
    },
  ];

  if (loading && adjustments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock History"
        description={`${total} stock adjustment${total !== 1 ? 's' : ''} recorded`}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Types</option>
          {Object.entries(STOCK_ADJUSTMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={adjustments}
        emptyTitle="No stock adjustments"
        emptyDescription="Stock adjustments will appear here as products are received, sold, or manually adjusted."
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
