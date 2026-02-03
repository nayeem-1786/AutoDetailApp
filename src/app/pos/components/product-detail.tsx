'use client';

import { useState } from 'react';
import { ArrowLeft, Minus, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct } from '../types';

interface ProductDetailProps {
  product: CatalogProduct;
  categoryName: string;
  onBack: () => void;
}

export function ProductDetail({ product, categoryName, onBack }: ProductDetailProps) {
  const { dispatch } = useTicket();
  const [qty, setQty] = useState(1);

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      dispatch({ type: 'ADD_PRODUCT', product });
    }
    toast.success(`Added ${qty}x ${product.name}`);
    onBack();
  }

  const inStock = product.quantity_on_hand > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex shrink-0 items-center gap-1.5 px-4 pt-4 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {categoryName}
      </button>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-4">
          {/* Product image */}
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-10 w-10 text-gray-300" />
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              ${product.retail_price.toFixed(2)}
            </p>
            {product.sku && (
              <p className="mt-1 text-sm text-gray-500">SKU: {product.sku}</p>
            )}
            {product.barcode && (
              <p className="text-sm text-gray-500">Barcode: {product.barcode}</p>
            )}
            <p className={cn('mt-1 text-sm', inStock ? 'text-green-600' : 'text-red-500')}>
              {inStock ? `${product.quantity_on_hand} in stock` : 'Out of stock'}
            </p>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <p className="mt-4 text-sm leading-relaxed text-gray-600">
            {product.description}
          </p>
        )}
      </div>

      {/* Bottom: Qty + Add button */}
      <div className="shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-center gap-4">
          <span className="text-sm font-medium text-gray-600">Qty:</span>
          <button
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums">{qty}</span>
          <button
            onClick={() => setQty(qty + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={handleAdd}
          className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white transition-all hover:bg-blue-700 active:scale-[0.99]"
        >
          + Add to Ticket — ${(product.retail_price * qty).toFixed(2)}
        </button>
      </div>
    </div>
  );
}
