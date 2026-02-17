'use client';

import { useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ShoppingBag, Trash2, Package } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { formatCurrency } from '@/lib/utils/format';
import { QuantitySelector } from './quantity-selector';

export function CartDrawer() {
  const {
    items,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
    clearCart,
    isCartOpen,
    closeCart,
  } = useCart();

  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    closeCart();
  }, [pathname, closeCart]);

  // Close on Escape key
  useEffect(() => {
    if (!isCartOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCartOpen, closeCart]);

  // Lock body scroll when open
  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCartOpen]);

  // Focus trap
  const handleTabKey = useCallback(
    (e: KeyboardEvent) => {
      if (!isCartOpen || !drawerRef.current || e.key !== 'Tab') return;

      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [isCartOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [handleTabKey]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isCartOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`fixed top-0 right-0 z-[95] flex h-full w-full sm:w-[50vw] lg:w-[400px] flex-col bg-brand-dark border-l border-site-border shadow-2xl shadow-black/50 transition-transform duration-300 ease-out ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-site-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-lime" />
            <h2 className="font-display text-lg font-bold text-site-text">
              Your Cart
              {itemCount > 0 && (
                <span className="ml-1.5 text-sm font-normal text-site-text-muted">
                  ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeCart}
            className="flex items-center justify-center h-9 w-9 rounded-xl text-site-text-muted hover:text-site-text hover:bg-site-border-light transition-colors"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-surface border border-site-border">
              <ShoppingBag className="h-10 w-10 text-site-text-faint" />
            </div>
            <p className="text-site-text-muted text-sm">Your cart is empty</p>
            <Link
              href="/products"
              onClick={closeCart}
              className="text-sm font-medium text-lime hover:text-lime-200 transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-xl bg-brand-surface border border-site-border p-3"
              >
                {/* Thumbnail */}
                <Link
                  href={`/products/${item.categorySlug}/${item.slug}`}
                  onClick={closeCart}
                  className="shrink-0"
                >
                  <div className="h-16 w-16 rounded-lg bg-brand-dark overflow-hidden border border-site-border">
                    {item.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-6 w-6 text-site-text-faint" />
                      </div>
                    )}
                  </div>
                </Link>

                {/* Details */}
                <div className="flex flex-1 flex-col min-w-0">
                  <Link
                    href={`/products/${item.categorySlug}/${item.slug}`}
                    onClick={closeCart}
                    className="text-sm font-medium text-site-text hover:text-lime transition-colors truncate"
                  >
                    {item.name}
                  </Link>
                  <span className="text-xs text-site-text-muted mt-0.5">
                    {formatCurrency(item.price)} each
                  </span>

                  <div className="flex items-center justify-between mt-2">
                    <QuantitySelector
                      value={item.quantity}
                      max={item.maxQuantity}
                      onChange={(qty) => updateQuantity(item.id, qty)}
                      size="sm"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-site-text tabular-nums">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-site-text-faint hover:text-red-400 transition-colors"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-site-border px-5 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-site-text-muted">Subtotal</span>
              <span className="text-lg font-bold text-site-text tabular-nums">
                {formatCurrency(subtotal)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/cart"
                onClick={closeCart}
                className="flex items-center justify-center rounded-xl border border-site-border bg-brand-surface px-4 py-2.5 text-sm font-medium text-site-text hover:bg-site-border-light transition-colors"
              >
                View Cart
              </Link>
              <Link
                href="/checkout"
                onClick={closeCart}
                className="flex items-center justify-center rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-site-text-on-primary hover:bg-lime-200 transition-colors shadow-lg shadow-lime/20"
              >
                Checkout
              </Link>
            </div>

            <button
              type="button"
              onClick={clearCart}
              className="w-full text-center text-xs text-site-text-faint hover:text-red-400 transition-colors"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
