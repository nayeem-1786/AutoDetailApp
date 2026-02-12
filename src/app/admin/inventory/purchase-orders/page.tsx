'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { usePermission } from '@/lib/hooks/use-permission';
import type { PurchaseOrder } from '@/lib/supabase/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { PO_STATUS_LABELS, PO_STATUS_BADGE_VARIANT } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { granted: canManagePO } = usePermission('inventory.manage_po');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  async function loadOrders() {
    setLoading(true);
    try {
      const url = statusFilter
        ? `/api/admin/purchase-orders?status=${statusFilter}`
        : '/api/admin/purchase-orders';
      const res = await adminFetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOrders(json.data ?? []);
    } catch (err) {
      console.error('Load POs error:', err);
      toast.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function getTotal(po: PurchaseOrder): number {
    if (!po.items) return 0;
    return po.items.reduce((sum, item) => sum + item.quantity_ordered * item.unit_cost, 0);
  }

  function getItemCount(po: PurchaseOrder): number {
    if (!po.items) return 0;
    return po.items.reduce((sum, item) => sum + item.quantity_ordered, 0);
  }

  const columns: ColumnDef<PurchaseOrder, unknown>[] = [
    {
      accessorKey: 'po_number',
      header: 'PO #',
      size: 110,
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/inventory/purchase-orders/${row.original.id}`)}
        >
          {row.original.po_number}
        </button>
      ),
    },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: ({ row }) => row.original.vendor?.name || '--',
    },
    {
      id: 'items',
      header: 'Items',
      size: 70,
      cell: ({ row }) => getItemCount(row.original),
      enableSorting: false,
    },
    {
      id: 'total',
      header: 'Total',
      size: 100,
      cell: ({ row }) => formatCurrency(getTotal(row.original)),
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      size: 100,
      cell: ({ row }) => (
        <Badge variant={PO_STATUS_BADGE_VARIANT[row.original.status] || 'default'}>
          {PO_STATUS_LABELS[row.original.status] || row.original.status}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'created_by',
      header: 'Created By',
      cell: ({ row }) => {
        const emp = row.original.created_by_employee;
        return emp ? `${emp.first_name} ${emp.last_name}` : '--';
      },
      enableSorting: false,
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      size: 100,
      cell: ({ row }) => formatDate(row.original.created_at),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Create and manage purchase orders from vendors"
        action={
          canManagePO ? (
            <Button onClick={() => router.push('/admin/inventory/purchase-orders/new')}>
              <Plus className="h-4 w-4" />
              New Purchase Order
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Statuses</option>
          {Object.entries(PO_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={orders}
        emptyTitle="No purchase orders"
        emptyDescription="Create your first purchase order to get started."
        emptyAction={
          canManagePO ? (
            <Button onClick={() => router.push('/admin/inventory/purchase-orders/new')}>
              <Plus className="h-4 w-4" />
              New Purchase Order
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
