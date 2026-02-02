'use client';

import { Minus, Plus } from 'lucide-react';
import type { TransactionItem } from '@/lib/supabase/types';

interface RefundItemRowProps {
  item: TransactionItem;
  maxRefundableQty: number;
  selected: boolean;
  refundQty: number;
  restock: boolean;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
  onRestockChange: (restock: boolean) => void;
}

const itemTypeBadgeColors: Record<string, string> = {
  product: 'bg-blue-50 text-blue-700',
  service: 'bg-green-50 text-green-700',
  package: 'bg-purple-50 text-purple-700',
  custom: 'bg-gray-50 text-gray-600',
};

export function RefundItemRow({
  item,
  maxRefundableQty,
  selected,
  refundQty,
  restock,
  onToggle,
  onQtyChange,
  onRestockChange,
}: RefundItemRowProps) {
  const disabled = maxRefundableQty <= 0;
  const displayAmount = selected
    ? (item.unit_price * refundQty).toFixed(2)
    : item.unit_price.toFixed(2);

  function decrement() {
    if (refundQty > 1) {
      onQtyChange(refundQty - 1);
    }
  }

  function increment() {
    if (refundQty < maxRefundableQty) {
      onQtyChange(refundQty + 1);
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        disabled
          ? 'border-gray-100 bg-gray-50 opacity-50'
          : selected
            ? 'border-red-200 bg-red-50/50'
            : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed"
      />

      {/* Item name + type badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-gray-900">
            {item.item_name}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              itemTypeBadgeColors[item.item_type] ?? itemTypeBadgeColors.custom
            }`}
          >
            {item.item_type}
          </span>
        </div>
        {disabled && (
          <p className="text-xs text-gray-400">Fully refunded</p>
        )}
      </div>

      {/* Quantity selector — only when selected */}
      {selected && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={decrement}
            disabled={refundQty <= 1}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40 sm:h-8 sm:w-8"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums text-gray-900">
            {refundQty}
          </span>
          <button
            type="button"
            onClick={increment}
            disabled={refundQty >= maxRefundableQty}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40 sm:h-8 sm:w-8"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Restock toggle — only for product items when selected */}
      {selected && item.item_type === 'product' && (
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={restock}
            onChange={(e) => onRestockChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">Restock</span>
        </label>
      )}

      {/* Amount display */}
      <div className="w-20 shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums text-gray-900">
          ${displayAmount}
        </p>
        {!selected && maxRefundableQty > 0 && (
          <p className="text-xs tabular-nums text-gray-400">
            max {maxRefundableQty}
          </p>
        )}
      </div>
    </div>
  );
}
