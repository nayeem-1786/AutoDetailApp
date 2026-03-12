'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  CreditCard,
  Truck,
  User,
  Clock,
  FileText,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import type { Order, OrderItem, OrderEvent } from '@/lib/supabase/types';

interface OrderDetail extends Omit<Order, 'customer'> {
  order_items: OrderItem[];
  events: Array<OrderEvent & { created_by_name?: string | null }>;
  customer: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
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

const FULFILLMENT_OPTIONS = [
  'unfulfilled',
  'processing',
  'ready_for_pickup',
  'shipped',
  'delivered',
  'cancelled',
];

const EVENT_LABELS: Record<string, string> = {
  created: 'Order Created',
  paid: 'Payment Received',
  fulfillment_updated: 'Fulfillment Updated',
  shipped: 'Order Shipped',
  delivered: 'Order Delivered',
  ready_for_pickup: 'Ready for Pickup',
  refunded: 'Refund Processed',
  partially_refunded: 'Partial Refund',
  note_added: 'Note Updated',
  tracking_updated: 'Tracking Updated',
  cancelled: 'Order Cancelled',
};

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fulfillment form
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [shippingCarrier, setShippingCarrier] = useState('');

  // Notes
  const [internalNotes, setInternalNotes] = useState('');

  // Refund dialog
  const [showRefund, setShowRefund] = useState(false);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch(`/api/admin/orders/${id}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data);
      setFulfillmentStatus(data.fulfillment_status);
      setTrackingNumber(data.tracking_number || '');
      setTrackingUrl(data.tracking_url || '');
      setShippingCarrier(data.shipping_carrier || '');
      setInternalNotes(data.internal_notes || '');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleSaveFulfillment = async () => {
    if (!order) return;
    setSaving(true);
    const res = await adminFetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulfillment_status: fulfillmentStatus,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        shipping_carrier: shippingCarrier,
      }),
    });
    if (res.ok) {
      toast.success('Fulfillment updated');
      fetchOrder();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update');
    }
    setSaving(false);
  };

  const handleSaveNotes = async () => {
    if (!order) return;
    setSaving(true);
    const res = await adminFetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_notes: internalNotes }),
    });
    if (res.ok) {
      toast.success('Notes saved');
      fetchOrder();
    } else {
      toast.error('Failed to save notes');
    }
    setSaving(false);
  };

  const handleRefund = async () => {
    if (!order) return;
    setRefunding(true);
    const body: Record<string, unknown> = {};
    if (refundType === 'partial') {
      const cents = Math.round(parseFloat(refundAmount) * 100);
      if (isNaN(cents) || cents <= 0) {
        toast.error('Enter a valid amount');
        setRefunding(false);
        return;
      }
      body.amount = cents;
    }
    if (refundReason) body.reason = refundReason;

    const res = await adminFetch(`/api/admin/orders/${id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success('Refund processed');
      setShowRefund(false);
      setRefundType('full');
      setRefundAmount('');
      setRefundReason('');
      fetchOrder();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Refund failed');
    }
    setRefunding(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-24 text-center">
        <p className="text-gray-500">Order not found</p>
        <button onClick={() => router.push('/admin/orders')} className="mt-4 text-sm text-blue-600 hover:underline">
          Back to Orders
        </button>
      </div>
    );
  }

  const payment = PAYMENT_BADGES[order.payment_status] || { label: order.payment_status, variant: 'default' as const };
  const fulfillment = FULFILLMENT_BADGES[order.fulfillment_status] || { label: order.fulfillment_status, variant: 'default' as const };
  const canRefund = order.payment_status === 'paid' || order.payment_status === 'partially_refunded';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/admin/orders')}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{order.order_number}</h1>
            <Badge variant={payment.variant}>{payment.label}</Badge>
            <Badge variant={fulfillment.variant}>{fulfillment.label}</Badge>
          </div>
          <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
        </div>
        {canRefund && (
          <button
            onClick={() => setShowRefund(true)}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Issue Refund
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4" />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 py-3">
                    {item.product_image_url ? (
                      <img
                        src={item.product_image_url}
                        alt={item.product_name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                        <Package className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.unit_price / 100)} x {item.quantity}
                      </p>
                    </div>
                    <p className="font-medium">{formatCurrency(item.line_total / 100)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatCurrency(order.subtotal / 100)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                  <span className="text-green-600">-{formatCurrency(order.discount_amount / 100)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>{formatCurrency(order.tax_amount / 100)}</span>
              </div>
              {order.shipping_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Shipping</span>
                  <span>{formatCurrency(order.shipping_amount / 100)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total</span>
                <span>{formatCurrency(order.total / 100)}</span>
              </div>
              {order.stripe_payment_intent_id && (
                <div className="mt-3 pt-2 border-t">
                  <a
                    href={`https://dashboard.stripe.com/payments/${order.stripe_payment_intent_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    View in Stripe <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fulfillment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck className="h-4 w-4" />
                Fulfillment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={fulfillmentStatus}
                  onChange={(e) => setFulfillmentStatus(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                >
                  {FULFILLMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {FULFILLMENT_BADGES[opt]?.label || opt}
                    </option>
                  ))}
                </select>
              </div>

              {order.fulfillment_method === 'shipping' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Carrier</label>
                    <input
                      type="text"
                      value={shippingCarrier}
                      onChange={(e) => setShippingCarrier(e.target.value)}
                      placeholder="e.g. USPS, UPS, FedEx"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tracking Number</label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Tracking number"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tracking URL</label>
                    <input
                      type="text"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {order.fulfillment_method === 'pickup' && (
                <p className="text-sm text-gray-600">
                  This order is set for <strong>local pickup</strong>.
                </p>
              )}

              {order.shipping_address_line1 && (
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Shipping Address</p>
                  <p className="text-sm text-gray-900">{order.first_name} {order.last_name}</p>
                  <p className="text-sm text-gray-700">{order.shipping_address_line1}</p>
                  {order.shipping_address_line2 && <p className="text-sm text-gray-700">{order.shipping_address_line2}</p>}
                  <p className="text-sm text-gray-700">
                    {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
                  </p>
                </div>
              )}

              <button
                onClick={handleSaveFulfillment}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Fulfillment'}
              </button>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.events.length === 0 ? (
                <p className="text-sm text-gray-400">No activity recorded</p>
              ) : (
                <div className="space-y-4">
                  {order.events.map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="relative flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-gray-400 mt-1.5" />
                        <div className="flex-1 w-px bg-gray-200" />
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium text-gray-900">
                          {EVENT_LABELS[event.event_type] || event.event_type}
                        </p>
                        {event.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(event.created_at)}
                          {event.created_by_name && ` · ${event.created_by_name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar (1/3) */}
        <div className="space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium text-gray-900">
                {order.first_name} {order.last_name}
              </p>
              <p className="text-sm text-gray-500">{order.email}</p>
              {order.phone && <p className="text-sm text-gray-500">{order.phone}</p>}
              {order.customer && (
                <Link
                  href={`/admin/customers/${order.customer.id}`}
                  className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  View Customer Profile
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <span className="capitalize">{order.fulfillment_method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items</span>
                <span>{order.order_items.length}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>{formatCurrency(order.total / 100)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.customer_notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Customer Notes</p>
                  <p className="text-sm text-gray-700 rounded-lg bg-gray-50 p-2">{order.customer_notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Internal Notes</p>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  placeholder="Add internal notes..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={saving || internalNotes === (order.internal_notes || '')}
                  className="mt-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Save Notes
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Refund Dialog */}
      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Issue Refund</h2>
            <p className="mt-1 text-sm text-gray-500">
              Order {order.order_number} — Total: {formatCurrency(order.total / 100)}
            </p>

            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={() => setRefundType('full')}
                  className={`flex-1 rounded-lg border-2 p-3 text-sm font-medium ${
                    refundType === 'full' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                  }`}
                >
                  Full Refund
                  <p className="mt-1 text-xs font-normal text-gray-500">
                    {formatCurrency(order.total / 100)}
                  </p>
                </button>
                <button
                  onClick={() => setRefundType('partial')}
                  className={`flex-1 rounded-lg border-2 p-3 text-sm font-medium ${
                    refundType === 'partial' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                  }`}
                >
                  Partial Refund
                </button>
              </div>

              {refundType === 'partial' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-4 text-sm focus:border-gray-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={2}
                  placeholder="Reason for refund..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowRefund(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {refunding ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
