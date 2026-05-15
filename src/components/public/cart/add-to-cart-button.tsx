'use client';

import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { cn } from '@/lib/utils/cn';

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    categorySlug: string;
    price: number; // retail_price in dollars
    stockQuantity: number;
    imageUrl: string | null;
  };
  variant?: 'default' | 'compact' | 'icon-only';
  className?: string;
}

export function AddToCartButton({
  product,
  variant = 'default',
  className,
}: AddToCartButtonProps) {
  const { items, addItem } = useCart();

  const cartItem = items.find((i) => i.id === product.id);
  const inCart = !!cartItem;
  const cartQty = cartItem?.quantity ?? 0;
  const atMax = cartQty >= product.stockQuantity;
  const outOfStock = product.stockQuantity <= 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (outOfStock || atMax) return;

    addItem({
      id: product.id,
      name: product.name,
      slug: product.slug,
      categorySlug: product.categorySlug,
      price: product.price,
      maxQuantity: product.stockQuantity,
      imageUrl: product.imageUrl,
    });
  };

  // Out of stock
  if (outOfStock) {
    if (variant === 'icon-only') {
      return (
        <button
          type="button"
          disabled
          className={cn(
            'flex items-center justify-center rounded-xl bg-brand-surface border border-site-border text-site-text-faint cursor-not-allowed h-10 w-10',
            className
          )}
          aria-label="Out of stock"
        >
          <ShoppingCart className="h-4 w-4" />
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl bg-brand-surface border border-site-border text-site-text-faint cursor-not-allowed font-medium',
          variant === 'compact' ? 'text-xs px-3 py-2' : 'text-sm px-5 py-2.5',
          className
        )}
      >
        Out of Stock
      </button>
    );
  }

  // At max quantity
  if (atMax) {
    if (variant === 'icon-only') {
      return (
        <button
          type="button"
          disabled
          className={cn(
            'flex items-center justify-center rounded-xl bg-accent-brand/20 border border-accent-brand/30 text-accent-brand cursor-not-allowed h-10 w-10',
            className
          )}
          aria-label="Maximum reached"
        >
          <Check className="h-4 w-4" />
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        className={cn(
          'flex items-center justify-center gap-2 rounded-xl bg-accent-brand/20 border border-accent-brand/30 text-accent-brand cursor-not-allowed font-medium',
          variant === 'compact' ? 'text-xs px-3 py-2' : 'text-sm px-5 py-2.5',
          className
        )}
      >
        <Check className="h-3.5 w-3.5" />
        Max Reached
      </button>
    );
  }

  // Icon-only variant
  if (variant === 'icon-only') {
    return (
      <button
        type="button"
        onClick={handleAdd}
        className={cn(
          'flex items-center justify-center rounded-xl border transition-all duration-200 h-10 w-10',
          inCart
            ? 'bg-accent-brand/20 border-accent-brand/30 text-accent-brand hover:bg-accent-brand/30'
            : 'bg-brand-surface border-site-border text-site-text-muted hover:bg-accent-brand hover:text-site-text-on-primary hover:border-accent-brand',
          className
        )}
        aria-label={inCart ? `In cart (${cartQty}), add another` : 'Add to cart'}
      >
        {inCart ? (
          <span className="text-xs font-bold">{cartQty}</span>
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
      </button>
    );
  }

  // Default & compact variants
  return (
    <button
      type="button"
      onClick={handleAdd}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200',
        variant === 'compact' ? 'text-xs px-3 py-2' : 'text-sm px-5 py-2.5',
        inCart
          ? 'bg-accent-brand/20 border border-accent-brand/30 text-accent-brand hover:bg-accent-brand/30'
          : 'bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover shadow-lg shadow-accent-brand/20 hover:shadow-accent-brand/30',
        className
      )}
    >
      {inCart ? (
        <>
          <Check className="h-3.5 w-3.5" />
          In Cart ({cartQty})
        </>
      ) : (
        <>
          <ShoppingCart className="h-3.5 w-3.5" />
          Add to Cart
        </>
      )}
    </button>
  );
}
