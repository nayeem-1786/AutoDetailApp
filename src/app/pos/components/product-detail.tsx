'use client';

import { useState } from 'react';
import { Minus, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { useTicket } from '../context/ticket-context';
import type { CatalogProduct } from '../types';

interface ProductDetailProps {
  product: CatalogProduct;
  open: boolean;
  onClose: () => void;
}

export function ProductDetail({ product, open, onClose }: ProductDetailProps) {
  const { dispatch } = useTicket();
  const [qty, setQty] = useState(1);

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      dispatch({ type: 'ADD_PRODUCT', product });
    }
    toast.success(`Added ${qty}x ${product.name}`);
    setQty(1);
    onClose();
  }

  const inStock = product.quantity_on_hand > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogClose onClose={onClose} />

      <div className="p-5">
        {/* Product info */}
        <div className="flex gap-4">
          {/* Image */}
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
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

        {/* Qty + Add button */}
        <div className="mt-5 border-t border-gray-100 pt-4">
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
    </Dialog>
  );
}
