'use client';

import { useContext } from 'react';
import { ShoppingBag } from 'lucide-react';
import { CartContext } from '@/lib/contexts/cart-context';

export function CartIconButton() {
  const ctx = useContext(CartContext);

  // Gracefully handle missing CartProvider (HMR edge cases, error boundaries)
  if (!ctx) {
    return (
      <span className="relative flex items-center justify-center h-10 w-10 rounded-xl text-site-text-muted">
        <ShoppingBag className="h-5 w-5" />
      </span>
    );
  }

  const { itemCount, toggleCart } = ctx;

  return (
    <button
      type="button"
      onClick={toggleCart}
      className="relative flex items-center justify-center h-10 w-10 rounded-xl text-site-text-muted hover:text-site-text hover:bg-site-border-light transition-colors"
      aria-label={`Shopping cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
    >
      <ShoppingBag className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-lime px-1 text-[10px] font-bold text-site-text-on-primary animate-in zoom-in duration-200">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  );
}
