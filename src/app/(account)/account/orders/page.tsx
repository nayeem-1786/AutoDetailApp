'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';

interface OrderSummary {
  id: string;
  order_number: string;
  created_at: string;
  total: number;
  payment_status: string;
  fulfillment_status: string;
  fulfillment_method: string;
  item_count: number;
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

export default function AccountOrdersPage() {
  const { user } = useCustomerAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/account/orders?page=${page}&limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    if (user) fetchOrders();
  }, [user, fetchOrders]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const hasMore = page * limit < total;

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ShoppingCart className="h-12 w-12 text-site-text-dim" />
        <h2 className="mt-4 text-lg font-semibold text-site-text">No orders yet</h2>
        <p className="mt-1 text-sm text-site-text-faint">Browse our products to get started.</p>
        <Link
          href="/products"
          className="mt-6 rounded-lg bg-accent-brand px-6 py-2 text-sm font-medium text-site-text-on-primary hover:opacity-90"
        >
          Shop Products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-site-text">Orders</h1>
      <p className="mt-1 text-sm text-site-text-faint">{total} order{total !== 1 ? 's' : ''}</p>

      <div className="mt-6 space-y-3">
        {orders.map((order) => {
          const payment = PAYMENT_BADGES[order.payment_status] || { label: order.payment_status, variant: 'default' as const };
          const fulfillment = FULFILLMENT_BADGES[order.fulfillment_status] || { label: order.fulfillment_status, variant: 'default' as const };

          return (
            <Link
              key={order.id}
              href={`/account/orders/${order.id}`}
              className="flex items-center gap-4 rounded-xl border border-site-border bg-brand-surface p-4 transition-colors hover:border-site-border-medium"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-site-text">{order.order_number}</span>
                  <Badge variant={payment.variant}>{payment.label}</Badge>
                  <Badge variant={fulfillment.variant}>{fulfillment.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-site-text-faint">
                  {formatDate(order.created_at)} · {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                </p>
              </div>
              <span className="text-lg font-semibold text-site-text">
                {formatCurrency(order.total / 100)}
              </span>
              <ChevronRight className="h-4 w-4 text-site-text-faint" />
            </Link>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            className="rounded-lg border border-site-border px-6 py-2 text-sm font-medium text-site-text hover:bg-brand-surface disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
