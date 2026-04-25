'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatDateTime } from '@/lib/utils/format';
import { STOCK_ADJUSTMENT_TYPE_LABELS } from '@/lib/utils/constants';
import type { StockAdjustment } from '@/lib/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DataTable } from '@/components/ui/data-table';
import { ReceiptDialog } from '@/components/admin/receipt-dialog';

const STOCK_HISTORY_PAGE_SIZE = 50;

export default function StockHistoryCard({ productId }: { productId: string }) {
  const router = useRouter();
  const { granted: canViewStock, loading: loadingPerm } = usePermission('inventory.view_stock');
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [receiptTransactionId, setReceiptTransactionId] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
  }, [typeFilter]);

  useEffect(() => {
    if (!canViewStock) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          product_id: productId,
          limit: String(STOCK_HISTORY_PAGE_SIZE),
          offset: String(page * STOCK_HISTORY_PAGE_SIZE),
        });
        if (typeFilter) params.set('type', typeFilter);
        const res = await adminFetch(`/api/admin/stock-adjustments?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed');
        if (cancelled) return;
        setAdjustments(json.data ?? []);
        setTotal(json.total ?? 0);
      } catch (err) {
        if (cancelled) return;
        console.error('Load product stock history error:', err);
        toast.error('Failed to load stock history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [productId, typeFilter, page, canViewStock]);

  if (loadingPerm || !canViewStock) return null;

  const totalPages = Math.ceil(total / STOCK_HISTORY_PAGE_SIZE);

  const columns: ColumnDef<StockAdjustment, unknown>[] = [
    {
      accessorKey: 'created_at',
      header: 'Date',
      size: 150,
      cell: ({ row }) => formatDateTime(row.original.created_at),
    },
    {
      id: 'type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => {
        const type = row.original.adjustment_type as string;
        let variant: 'default' | 'info' | 'success' | 'warning' | 'destructive' | 'secondary' = 'default';
        if (type === 'received') variant = 'success';
        else if (type === 'sold') variant = 'info';
        else if (type === 'damaged' || type === 'voided') variant = 'destructive';
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
        if (qty === 0) {
          return <span className="text-gray-500 font-medium">0</span>;
        }
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
      size: 120,
      cell: ({ row }) => {
        const adj = row.original;
        if (adj.reference_type === 'purchase_order' && adj.reference_id) {
          return (
            <button
              type="button"
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
              onClick={() => router.push(`/admin/inventory/purchase-orders/${adj.reference_id}`)}
            >
              View PO
            </button>
          );
        }
        if (adj.reference_type === 'stock_count' && adj.reference_id) {
          return (
            <button
              type="button"
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
              onClick={() => router.push(`/admin/inventory/counts/${adj.reference_id}`)}
            >
              View Count
            </button>
          );
        }
        if (adj.reference_type === 'transaction' && adj.reference_id) {
          return (
            <button
              type="button"
              className="text-blue-600 hover:text-blue-800 hover:underline text-sm"
              onClick={() => setReceiptTransactionId(adj.reference_id)}
            >
              View Receipt
            </button>
          );
        }
        if (adj.reference_type === 'refund') {
          return <span className="text-gray-500 text-sm">Refund</span>;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5" />
          Stock History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <span className="text-sm text-gray-500">
            {total} adjustment{total !== 1 ? 's' : ''}
          </span>
        </div>

        {loading && adjustments.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={adjustments}
            emptyTitle="No stock adjustments"
            emptyDescription="This product has no stock adjustment history yet."
          />
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
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
      </CardContent>

      <ReceiptDialog
        open={!!receiptTransactionId}
        onOpenChange={(open) => { if (!open) setReceiptTransactionId(null); }}
        transactionId={receiptTransactionId}
      />
    </Card>
  );
}
