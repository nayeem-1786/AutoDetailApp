'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Package, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';

const CHECKOUT_ORDER_KEY = 'smart-details-checkout-order';
const CHECKOUT_SESSION_KEY = 'smart-details-checkout-session';

interface OrderData {
  order_number: string | null;
  email: string;
  first_name: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  shipping_amount: number;
  total: number;
  coupon_code: string | null;
  fulfillment_method: string;
  payment_status: string;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_carrier: string | null;
  shipping_service: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    product_image_url: string | null;
  }>;
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  // Legacy support: also check ?order= for old links
  const orderNumber = searchParams.get('order');
  const { clearCart } = useCart();
  const clearedRef = useRef(false);

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clear cart and sessionStorage once on mount
  useEffect(() => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      clearCart();
      try {
        sessionStorage.removeItem(CHECKOUT_ORDER_KEY);
        sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
      } catch {
        // sessionStorage not available
      }
    }
  }, [clearCart]);

  // Fetch order details with retry for webhook timing
  useEffect(() => {
    if (!orderId && !orderNumber) {
      setError('No order identifier provided');
      setLoading(false);
      return;
    }

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000; // 2s between retries

    function fetchOrder() {
      const param = orderId
        ? `id=${encodeURIComponent(orderId)}`
        : `number=${encodeURIComponent(orderNumber!)}`;

      fetch(`/api/checkout/order?${param}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            setLoading(false);
          } else if (!data.order_number && retryCount < maxRetries) {
            // Order found but order_number not yet assigned (webhook hasn't fired)
            retryCount++;
            setTimeout(fetchOrder, retryDelay);
          } else {
            setOrder(data);
            setLoading(false);
          }
        })
        .catch(() => {
          setError('Failed to load order');
          setLoading(false);
        });
    }

    fetchOrder();
  }, [orderId, orderNumber]);

  if (loading) {
    return (
      <section className="bg-brand-dark py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-lime" />
            <p className="text-sm text-site-text-muted">
              Confirming your payment...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="bg-brand-dark py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <ShoppingBag className="h-12 w-12 text-site-text-faint" />
            <h1 className="font-display text-2xl font-bold text-site-text">
              Order Not Found
            </h1>
            <p className="text-site-text-muted">
              {error || 'We could not find this order.'}
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors"
            >
              Browse Products
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-brand-dark py-8 sm:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Success header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-950 border border-green-800">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
          </div>
          <h1 className="font-display text-2xl font-bold text-site-text sm:text-3xl">
            Order Confirmed!
          </h1>
          {order.order_number ? (
            <p className="mt-2 text-lg font-bold text-lime">
              {order.order_number}
            </p>
          ) : (
            <p className="mt-2 text-sm text-site-text-muted">
              Your order number will appear shortly
            </p>
          )}
          <p className="mt-2 text-sm text-site-text-muted">
            A confirmation email has been sent to{' '}
            <span className="text-site-text">{order.email}</span>
          </p>
        </div>

        {/* Order details */}
        <div className="rounded-2xl bg-brand-surface border border-site-border p-6 space-y-6">
          {/* Items */}
          <div>
            <h2 className="font-display text-base font-bold text-site-text mb-3">
              Items Ordered
            </h2>
            <div className="space-y-3">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-brand-dark overflow-hidden border border-site-border shrink-0">
                    {item.product_image_url ? (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-5 w-5 text-site-text-faint" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-site-text">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-site-text-muted">
                      {formatCurrency(item.unit_price / 100)} x {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-site-text tabular-nums">
                    {formatCurrency(item.line_total / 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-site-border pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-site-text-muted">Subtotal</span>
              <span className="text-site-text tabular-nums">
                {formatCurrency(order.subtotal / 100)}
              </span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-lime">
                  Discount
                  {order.coupon_code && ` (${order.coupon_code})`}
                </span>
                <span className="text-lime tabular-nums">
                  -{formatCurrency(order.discount_amount / 100)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-site-text-muted">Tax</span>
              <span className="text-site-text tabular-nums">
                {formatCurrency(order.tax_amount / 100)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-site-text-muted">Shipping</span>
              <span className={`tabular-nums ${order.shipping_amount > 0 ? 'text-site-text' : 'text-lime font-medium'}`}>
                {order.shipping_amount > 0
                  ? formatCurrency(order.shipping_amount / 100)
                  : 'FREE'}
              </span>
            </div>
            <div className="border-t border-site-border pt-3 flex justify-between">
              <span className="text-base font-bold text-site-text">Total</span>
              <span className="text-base font-bold text-lime tabular-nums">
                {formatCurrency(order.total / 100)}
              </span>
            </div>
          </div>

          {/* Fulfillment */}
          <div className="border-t border-site-border pt-4">
            <div className="flex items-center gap-2 text-sm mb-2">
              <Package className="h-4 w-4 text-lime" />
              <span className="font-medium text-site-text">
                {order.fulfillment_method === 'pickup'
                  ? 'Local Pickup'
                  : 'Shipping'}
              </span>
            </div>
            {order.fulfillment_method === 'shipping' &&
            order.shipping_address_line1 ? (
              <div className="ml-6 space-y-1">
                <p className="text-sm text-site-text">
                  {order.shipping_address_line1}
                </p>
                {order.shipping_address_line2 && (
                  <p className="text-sm text-site-text">
                    {order.shipping_address_line2}
                  </p>
                )}
                <p className="text-sm text-site-text">
                  {order.shipping_city}, {order.shipping_state}{' '}
                  {order.shipping_zip}
                </p>
                {order.shipping_carrier && (
                  <p className="text-xs text-site-text-muted mt-1">
                    {order.shipping_carrier.toUpperCase()}
                    {order.shipping_service && ` — ${order.shipping_service}`}
                  </p>
                )}
                <p className="text-xs text-site-text-muted">
                  Tracking info will be sent via email
                </p>
              </div>
            ) : (
              <p className="ml-6 text-sm text-site-text-muted">
                We&apos;ll notify you when your order is ready for pickup
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20"
          >
            Continue Shopping
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <section className="bg-brand-dark py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-lime" />
            </div>
          </div>
        </section>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
