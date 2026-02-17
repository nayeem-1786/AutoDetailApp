'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Package, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';

interface OrderData {
  order_number: string;
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
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    product_image_url: string | null;
  }>;
}

export default function ConfirmationPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const { clearCart } = useCart();
  const clearedRef = useRef(false);

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clear cart once on mount
  useEffect(() => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      clearCart();
    }
  }, [clearCart]);

  // Fetch order details
  useEffect(() => {
    if (!orderNumber) {
      setError('No order number provided');
      setLoading(false);
      return;
    }

    fetch(`/api/checkout/order?number=${encodeURIComponent(orderNumber)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrder(data);
        }
      })
      .catch(() => setError('Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) {
    return (
      <section className="bg-brand-dark py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center">
            <svg
              className="h-8 w-8 animate-spin text-lime"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
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
          <p className="mt-2 text-lg font-bold text-lime">
            {order.order_number}
          </p>
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
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.product_image_url}
                        alt={item.product_name}
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
              <span className="text-lime font-medium">FREE</span>
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
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-lime" />
              <span className="text-site-text">
                {order.fulfillment_method === 'pickup'
                  ? 'Local Pickup — we\'ll notify you when ready'
                  : 'Shipping — tracking info will be sent via email'}
              </span>
            </div>
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
