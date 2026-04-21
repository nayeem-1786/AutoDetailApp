'use client';

import { useState, useCallback } from 'react';
import { Search, Minus, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  quantity_on_hand: number;
}

interface ShopUseDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShopUseDialog({ open, onClose }: ShopUseDialogProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await posFetch(`/api/pos/products?search=${encodeURIComponent(query.trim())}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const products = (json.data ?? json ?? []) as Product[];
        setResults(products.filter((p) => p.quantity_on_hand > 0));
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    doSearch(value);
  }

  function selectProduct(product: Product) {
    setSelected(product);
    setQuantity(1);
    setSearch('');
    setResults([]);
  }

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);

    try {
      const res = await posFetch('/api/pos/shop-use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selected.id,
          quantity,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Failed with status ${res.status}`);
      }

      toast.success(`Logged ${quantity} × ${selected.name}`);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log shop use');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSearch('');
    setResults([]);
    setSelected(null);
    setQuantity(1);
    setNote('');
    setSubmitting(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogHeader>
        <DialogTitle>Log Shop Use</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          {/* Product selection */}
          {!selected ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Search product
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Name or SKU..."
                  autoFocus
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 py-2 pl-9 pr-3 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                )}
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
                  {results.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => selectProduct(product)}
                      className="flex w-full items-center justify-between px-3 py-2.5 min-h-[44px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{product.name}</p>
                        {product.sku && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{product.sku}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {product.quantity_on_hand} in stock
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {search.trim().length >= 2 && !searching && results.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No products with stock found.</p>
              )}
            </div>
          ) : (
            <>
              {/* Selected product display */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selected.name}</p>
                  {selected.sku && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selected.sku}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Quantity
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 sm:h-9 sm:w-9"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={selected.quantity_on_hand}
                    value={quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= selected.quantity_on_hand) {
                        setQuantity(val);
                      }
                    }}
                    className="w-16 rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center text-base sm:text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(selected.quantity_on_hand, quantity + 1))}
                    disabled={quantity >= selected.quantity_on_hand}
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 sm:h-9 sm:w-9"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    of {selected.quantity_on_hand}
                  </span>
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label htmlFor="shop-use-note" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Note <span className="text-gray-400 dark:text-gray-500">(optional)</span>
                </label>
                <input
                  id="shop-use-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., used on customer paint correction"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-gray-400 dark:focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500"
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              disabled={!selected || submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Logging...
                </>
              ) : (
                'Log Use'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
