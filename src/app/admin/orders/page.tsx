'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShoppingCart,
  DollarSign,
  Clock,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

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

const DATE_RANGES = [
  { value: '', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<Stats>({ totalOrders: 0, revenue: 0, pendingFulfillment: 0, ordersToday: 0 });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('payment_status') || '');
  const [fulfillmentStatus, setFulfillmentStatus] = useState(searchParams.get('fulfillment_status') || '');
  const [dateRange, setDateRange] = useState(searchParams.get('date_range') || '');
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    if (fulfillmentStatus) params.set('fulfillment_status', fulfillmentStatus);
    if (dateRange) params.set('date_range', dateRange);

    const res = await adminFetch(`/api/admin/orders?${params}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setStats(data.stats);
    }
    setLoading(false);
  }, [page, search, paymentStatus, fulfillmentStatus, dateRange]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, paymentStatus, fulfillmentStatus, dateRange]);

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
        >
          <option value="">All Payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partial Refund</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={fulfillmentStatus}
          onChange={(e) => setFulfillmentStatus(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
        >
          <option value="">All Fulfillment</option>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="processing">Processing</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="flex gap-1">
          {DATE_RANGES.map((dr) => (
            <button
              key={dr.value}
              onClick={() => setDateRange(dr.value)}
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
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Order</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Items</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Payment</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Fulfillment</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Date</th>
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
                        <span className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
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
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
