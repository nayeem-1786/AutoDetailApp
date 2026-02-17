'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Truck, MapPin } from 'lucide-react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import type { Order, OrderItem } from '@/lib/supabase/types';

type OrderDetail = Order & { order_items: OrderItem[] };

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

export default function AccountOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useCustomerAuth();
  const id = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/account/orders/${id}`);
    if (res.ok) {
      setOrder(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (user) fetchOrder();
  }, [user, fetchOrder]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-16 text-center">
        <p className="text-site-text-faint">Order not found</p>
        <button onClick={() => router.push('/account/orders')} className="mt-4 text-sm text-lime hover:underline">
          Back to Orders
        </button>
      </div>
    );
  }

  const payment = PAYMENT_BADGES[order.payment_status] || { label: order.payment_status, variant: 'default' as const };
  const fulfillment = FULFILLMENT_BADGES[order.fulfillment_status] || { label: order.fulfillment_status, variant: 'default' as const };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/account/orders')}
          className="rounded-lg border border-site-border p-2 hover:bg-brand-surface"
        >
          <ArrowLeft className="h-4 w-4 text-site-text" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-site-text">{order.order_number}</h1>
            <Badge variant={payment.variant}>{payment.label}</Badge>
            <Badge variant={fulfillment.variant}>{fulfillment.label}</Badge>
          </div>
          <p className="text-sm text-site-text-faint">{formatDate(order.created_at)}</p>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-site-border bg-brand-surface p-4 mb-4">
        <h2 className="text-sm font-semibold text-site-text mb-4 flex items-center gap-2">
          <Package className="h-4 w-4" />
          Items
        </h2>
        <div className="divide-y divide-white/5">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 py-3">
              {item.product_image_url ? (
                <img
                  src={item.product_image_url}
                  alt={item.product_name}
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/5">
                  <Package className="h-6 w-6 text-site-text-faint" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {item.product_slug && item.category_slug ? (
                  <Link
                    href={`/products/${item.category_slug}/${item.product_slug}`}
                    className="font-medium text-site-text hover:text-lime"
                  >
                    {item.product_name}
                  </Link>
                ) : (
                  <p className="font-medium text-site-text">{item.product_name}</p>
                )}
                <p className="text-xs text-site-text-faint">Qty: {item.quantity}</p>
              </div>
              <p className="font-medium text-site-text">{formatCurrency(item.line_total / 100)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-xl border border-site-border bg-brand-surface p-4 mb-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-site-text-faint">Subtotal</span>
            <span className="text-site-text">{formatCurrency(order.subtotal / 100)}</span>
          </div>
          {order.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-site-text-faint">Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
              <span className="text-green-400">-{formatCurrency(order.discount_amount / 100)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-site-text-faint">Tax</span>
            <span className="text-site-text">{formatCurrency(order.tax_amount / 100)}</span>
          </div>
          {order.shipping_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-site-text-faint">Shipping</span>
              <span className="text-site-text">{formatCurrency(order.shipping_amount / 100)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-white/10 pt-2 font-semibold">
            <span className="text-site-text">Total</span>
            <span className="text-lime">{formatCurrency(order.total / 100)}</span>
          </div>
        </div>
      </div>

      {/* Fulfillment Info */}
      <div className="rounded-xl border border-site-border bg-brand-surface p-4">
        <h2 className="text-sm font-semibold text-site-text mb-3 flex items-center gap-2">
          {order.fulfillment_method === 'pickup' ? (
            <><MapPin className="h-4 w-4" /> Pickup</>
          ) : (
            <><Truck className="h-4 w-4" /> Shipping</>
          )}
        </h2>

        {order.fulfillment_method === 'pickup' ? (
          <p className="text-sm text-site-text-faint">
            {order.fulfillment_status === 'ready_for_pickup'
              ? 'Your order is ready for pickup!'
              : order.fulfillment_status === 'delivered'
                ? 'Picked up — thank you!'
                : 'We\'ll notify you when your order is ready for pickup.'}
          </p>
        ) : (
          <div className="space-y-2">
            {order.shipping_address_line1 && (
              <div className="text-sm text-site-text-faint">
                <p>{order.shipping_address_line1}</p>
                {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                <p>{order.shipping_city}, {order.shipping_state} {order.shipping_zip}</p>
              </div>
            )}
            {order.tracking_url ? (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 rounded-lg bg-lime px-4 py-2 text-sm font-medium text-site-text-on-primary hover:opacity-90"
              >
                Track Package
              </a>
            ) : order.tracking_number ? (
              <p className="text-sm text-site-text-faint mt-2">
                Tracking: <span className="text-site-text font-medium">{order.tracking_number}</span>
                {order.shipping_carrier && ` (${order.shipping_carrier})`}
              </p>
            ) : order.fulfillment_status === 'shipped' ? (
              <p className="text-sm text-site-text-faint">Your order has shipped. Tracking info will be available soon.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
