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
      <DialogClose onClose={onClose} className="hidden pointer-fine:flex items-center justify-center h-8 w-8" />

      <div className="p-5">
        {/* Product info */}
        <div className="flex gap-4">
          {/* Image */}
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-10 w-10 text-gray-300 dark:text-gray-500" />
            )}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{product.name}</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${product.retail_price.toFixed(2)}
            </p>
            {product.sku && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">SKU: {product.sku}</p>
            )}
            <p className={cn('mt-1 text-sm', inStock ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
              {inStock ? `${product.quantity_on_hand} in stock` : 'Out of stock'}
            </p>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {product.description}
          </p>
        )}

        {/* Qty + Add button */}
        <div className="mt-5 border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="mb-3 flex items-center justify-center gap-4">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Qty:</span>
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              disabled={qty <= 1}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                qty <= 1
                  ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95'
              )}
            >
              <Minus className="h-5 w-5" />
            </button>
            <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800">
              <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{qty}</span>
            </div>
            <button
              onClick={() => setQty(qty + 1)}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl border-2 transition-all',
                'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95'
              )}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="w-full rounded-xl bg-blue-600 dark:bg-blue-500 py-3 text-base font-semibold text-white transition-all hover:bg-blue-700 dark:hover:bg-blue-600 active:scale-[0.99]"
          >
            + Add to Ticket — ${(product.retail_price * qty).toFixed(2)}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
