'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Trash2, ArrowRight, Package, Tag, X } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';
import { TAX_RATE } from '@/lib/utils/constants';
import { QuantitySelector } from '@/components/public/cart/quantity-selector';
import { toast } from 'sonner';

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem, clearCart } = useCart();
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    name: string | null;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Calculate totals
  const discountAmount = appliedCoupon?.discount ?? 0;
  const taxableSubtotal = subtotal; // All products are taxable
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxableAfterDiscount = taxableSubtotal * (1 - discountRatio);
  const taxAmount = Math.round(taxableAfterDiscount * TAX_RATE * 100) / 100;
  const total = subtotal - discountAmount + taxAmount;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);

    try {
      const cartItems = items.map((item) => ({
        item_type: 'product' as const,
        product_id: item.id,
        unit_price: item.price,
        quantity: item.quantity,
        item_name: item.name,
      }));

      const res = await fetch('/api/book/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim(),
          subtotal,
          services: cartItems,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setCouponError(data.error || 'Invalid coupon code');
        return;
      }

      setAppliedCoupon({
        code: data.data.code,
        discount: data.data.total_discount,
        name: data.data.name,
      });
      setCouponCode('');
      toast.success('Coupon applied!');
    } catch {
      setCouponError('Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
  };

  if (items.length === 0) {
    return (
      <section className="bg-brand-dark py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-6 py-12">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-brand-surface border border-site-border">
              <ShoppingBag className="h-12 w-12 text-site-text-faint" />
            </div>
            <h1 className="font-display text-2xl font-bold text-site-text">
              Your Cart is Empty
            </h1>
            <p className="text-site-text-muted">
              Browse our products and add items to your cart.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20"
            >
              Browse Products
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-brand-dark py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-bold text-site-text sm:text-3xl">
          Shopping Cart
          <span className="ml-2 text-lg font-normal text-site-text-muted">
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Cart items — left column */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 rounded-2xl bg-brand-surface border border-site-border p-4 sm:p-5"
              >
                {/* Thumbnail */}
                <Link
                  href={`/products/${item.categorySlug}/${item.slug}`}
                  className="shrink-0"
                >
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl bg-brand-dark overflow-hidden border border-site-border">
                    {item.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-8 w-8 text-site-text-faint" />
                      </div>
                    )}
                  </div>
                </Link>

                {/* Details */}
                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/products/${item.categorySlug}/${item.slug}`}
                      className="font-medium text-site-text hover:text-lime transition-colors truncate"
                    >
                      {item.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 text-site-text-faint hover:text-red-400 transition-colors p-1"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <span className="text-sm text-site-text-muted mt-0.5">
                    {formatCurrency(item.price)} each
                  </span>

                  <div className="flex items-center justify-between mt-3">
                    <QuantitySelector
                      value={item.quantity}
                      max={item.maxQuantity}
                      onChange={(qty) => updateQuantity(item.id, qty)}
                      size="sm"
                    />
                    <span className="text-base font-semibold text-site-text tabular-nums">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/products"
                className="text-sm font-medium text-lime hover:text-lime-200 transition-colors"
              >
                Continue Shopping
              </Link>
              <button
                type="button"
                onClick={clearCart}
                className="text-sm text-site-text-faint hover:text-red-400 transition-colors"
              >
                Clear Cart
              </button>
            </div>
          </div>

          {/* Order summary — right column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl bg-brand-surface border border-site-border p-6 space-y-5">
              <h2 className="font-display text-lg font-bold text-site-text">
                Order Summary
              </h2>

              {/* Coupon */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-xl bg-lime/10 border border-lime/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-lime" />
                      <span className="text-sm font-medium text-lime">
                        {appliedCoupon.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-site-text-faint hover:text-red-400 transition-colors"
                      aria-label="Remove coupon"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      placeholder="Coupon code"
                      className="flex-1 rounded-xl border border-site-border bg-brand-dark px-3 py-2 text-sm text-site-text placeholder:text-site-text-faint focus:border-lime focus:outline-none focus:ring-1 focus:ring-lime"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="rounded-xl border border-site-border bg-brand-dark px-4 py-2 text-sm font-medium text-site-text hover:bg-site-border-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="mt-1.5 text-xs text-red-400">{couponError}</p>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Subtotal</span>
                  <span className="text-site-text tabular-nums">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between">
                    <span className="text-lime">Discount</span>
                    <span className="text-lime tabular-nums">
                      -{formatCurrency(discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-site-text-muted">
                    Tax ({(TAX_RATE * 100).toFixed(2)}%)
                  </span>
                  <span className="text-site-text tabular-nums">
                    {formatCurrency(taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-site-text-muted">Shipping</span>
                  <span className="text-lime font-medium">FREE</span>
                </div>
                <div className="border-t border-site-border pt-3 flex justify-between">
                  <span className="text-base font-bold text-site-text">Total</span>
                  <span className="text-base font-bold text-site-text tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Checkout CTA */}
              <Link
                href={`/checkout${appliedCoupon ? `?coupon=${appliedCoupon.code}` : ''}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-6 py-3.5 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20 hover:shadow-lime/30"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Link>

              <p className="text-center text-xs text-site-text-faint">
                Taxes calculated at checkout
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
