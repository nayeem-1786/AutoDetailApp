'use client';

import { useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';
import { useCart } from '@/lib/contexts/cart-context';
import { QuantitySelector } from './quantity-selector';

interface ProductAddToCartProps {
  product: {
    id: string;
    name: string;
    slug: string;
    categorySlug: string;
    price: number;
    stockQuantity: number;
    imageUrl: string | null;
  };
}

export function ProductAddToCart({ product }: ProductAddToCartProps) {
  const { items, addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const cartItem = items.find((i) => i.id === product.id);
  const cartQty = cartItem?.quantity ?? 0;
  const remaining = product.stockQuantity - cartQty;
  const atMax = remaining <= 0;
  const outOfStock = product.stockQuantity <= 0;

  const handleAdd = () => {
    if (outOfStock || atMax) return;
    const qtyToAdd = Math.min(quantity, remaining);
    addItem(
      {
        id: product.id,
        name: product.name,
        slug: product.slug,
        categorySlug: product.categorySlug,
        price: product.price,
        maxQuantity: product.stockQuantity,
        imageUrl: product.imageUrl,
      },
      qtyToAdd
    );
    setQuantity(1);
  };

  if (outOfStock) {
    return (
      <div className="mt-6">
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-surface border border-site-border text-site-text-faint cursor-not-allowed font-bold text-base py-3.5"
        >
          Out of Stock
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-4">
        <QuantitySelector
          value={quantity}
          max={Math.max(remaining, 1)}
          onChange={setQuantity}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={atMax}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-base py-3.5 transition-all duration-200 ${
            atMax
              ? 'bg-lime/20 border border-lime/30 text-lime cursor-not-allowed'
              : 'bg-lime text-site-text-on-primary hover:bg-lime-200 shadow-lg shadow-lime/20 hover:shadow-lime/30'
          }`}
        >
          {atMax ? (
            <>
              <Check className="h-5 w-5" />
              Max Reached
            </>
          ) : cartQty > 0 ? (
            <>
              <ShoppingCart className="h-5 w-5" />
              Add More to Cart
            </>
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              Add to Cart
            </>
          )}
        </button>
      </div>

      {cartQty > 0 && (
        <p className="text-sm text-lime">
          {cartQty} already in your cart
        </p>
      )}

      <p className="text-xs text-site-text-muted">
        Local pickup available
      </p>
    </div>
  );
}
