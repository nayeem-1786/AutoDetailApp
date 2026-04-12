'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  DollarSign,
  Clock,
  Package,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useTableState } from '@/lib/hooks/useTableState';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import type { FilterValue } from '@/lib/hooks/useTableState';
import { usePermission } from '@/lib/hooks/use-permission';

interface OrderRow {
  id: string;
  order_number: string;
  first_name: string;
  last_name: string;
  email: string;
  customer_id: string | null;
  total: number;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  created_at: string;
  item_count: number;
}

interface Stats {
  totalOrders: number;
  revenue: number;
  pendingFulfillment: number;
  ordersToday: number;
}

const PAYMENT_BADGES: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
  partially_refunded: { label: 'Partial Refund', variant: 'secondary' },
};

const FULFILLMENT_BADGES: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  unfulfilled: { label: 'Unfulfilled', variant: 'warning' },
  processing: { label: 'Processing', variant: 'info' },
  ready_for_pickup: { label: 'Ready for Pickup', variant: 'info' },
  shipped: { label: 'Shipped', variant: 'info' },
  delivered: { label: 'Delivered', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const DEFAULT_FILTERS = {
  paymentStatus: '',
  fulfillmentStatus: '',
  dateRange: '',
};

export default function AdminOrdersPage() {
  const { granted: canAccess, loading: permLoading } = usePermission('orders.view');
  const router = useRouter();

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS, defaultPageSize: 20 });

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<Stats>({ totalOrders: 0, revenue: 0, pendingFulfillment: 0, ordersToday: 0 });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Convenience filter accessors
  const paymentStatus = (table.filters.paymentStatus as string) || '';
  const fulfillmentStatus = (table.filters.fulfillmentStatus as string) || '';
  const dateRange = (table.filters.dateRange as string) || '';

  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(table.page));
    params.set('limit', String(limit));
    if (table.debouncedSearch) params.set('search', table.debouncedSearch);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    if (fulfillmentStatus) params.set('fulfillment_status', fulfillmentStatus);
    if (dateRange) params.set('date_range', dateRange);
    if (table.sort) {
      params.set('sort', table.sort.column);
      params.set('dir', table.sort.direction);
    }

    const res = await adminFetch(`/api/admin/orders?${params}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setStats(data.stats);
    }
    setLoading(false);
  }, [table.page, table.debouncedSearch, paymentStatus, fulfillmentStatus, dateRange, table.sort]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Toolbar filters
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'paymentStatus',
      label: 'Payment',
      type: 'select',
      options: [
        { label: 'All Payments', value: '' },
        { label: 'Paid', value: 'paid' },
        { label: 'Pending', value: 'pending' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Partial Refund', value: 'partially_refunded' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      key: 'fulfillmentStatus',
      label: 'Fulfillment',
      type: 'select',
      options: [
        { label: 'All Fulfillment', value: '' },
        { label: 'Unfulfilled', value: 'unfulfilled' },
        { label: 'Processing', value: 'processing' },
        { label: 'Ready for Pickup', value: 'ready_for_pickup' },
        { label: 'Shipped', value: 'shipped' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
  ], []);

  // Date range quick filter chips
  const DATE_RANGES = [
    { value: '', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ];

  // Sort helpers
  function handleHeaderSort(column: string) {
    if (table.sort?.column === column) {
      if (table.sort.direction === 'asc') {
        table.setSort({ column, direction: 'desc' });
      } else {
        table.setSort(null);
      }
    } else {
      table.setSort({ column, direction: 'desc' });
    }
  }

  function SortIndicator({ column }: { column: string }) {
    if (table.sort?.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    return table.sort.direction === 'asc'
      ? <ChevronUp className="h-4 w-4 text-gray-700" />
      : <ChevronDown className="h-4 w-4 text-gray-700" />;
  }


  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Manage online store orders" />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <ShoppingCart className="h-4 w-4" />
              Total Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? '-' : stats.totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <DollarSign className="h-4 w-4" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {loading ? '-' : formatCurrency(stats.revenue / 100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Clock className="h-4 w-4" />
              Pending Fulfillment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {loading ? '-' : stats.pendingFulfillment}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Package className="h-4 w-4" />
              Orders Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{loading ? '-' : stats.ordersToday}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <TableToolbar
          state={table}
          defaultFilters={DEFAULT_FILTERS}
          config={{
            searchPlaceholder: 'Search orders...',
            filters: toolbarFilters,
          }}
        />
        {/* Date range chips */}
        <div className="flex gap-1">
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.value}
              onClick={() => {
                table.setFilter('dateRange', dr.value);
                table.setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateRange === dr.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {dr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No orders found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th
                    className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer select-none"
                    onClick={() => handleHeaderSort('order_number')}
                  >
                    <div className="flex items-center gap-1">
                      Order <SortIndicator column="order_number" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Items</th>
                  <th
                    className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer select-none"
                    onClick={() => handleHeaderSort('total')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total <SortIndicator column="total" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Payment</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Fulfillment</th>
                  <th
                    className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer select-none"
                    onClick={() => handleHeaderSort('created_at')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Date <SortIndicator column="created_at" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => {
                  const payment = PAYMENT_BADGES[order.payment_status] || { label: order.payment_status, variant: 'default' as const };
                  const fulfillment = FULFILLMENT_BADGES[order.fulfillment_status] || { label: order.fulfillment_status, variant: 'default' as const };

                  return (
                    <tr
                      key={order.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline">
                          {order.order_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {order.customer_id ? (
                          <Link
                            href={`/admin/customers/${order.customer_id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {order.first_name} {order.last_name}
                          </Link>
                        ) : (
                          <span className="text-gray-700">
                            {order.first_name} {order.last_name}
                          </span>
                        )}
                        <p className="text-xs text-gray-400">{order.email}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {order.item_count}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(order.total / 100)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={payment.variant}>{payment.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={fulfillment.variant}>{fulfillment.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(table.page - 1) * limit + 1}–{Math.min(table.page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.setPage(Math.max(1, table.page - 1))}
                disabled={table.page === 1}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {table.page} of {totalPages}
              </span>
              <button
                onClick={() => table.setPage(Math.min(totalPages, table.page + 1))}
                disabled={table.page === totalPages}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
