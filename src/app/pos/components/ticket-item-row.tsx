'use client';

import { Minus, Plus, X } from 'lucide-react';
import type { TicketItem } from '../types';
import { useTicket } from '../context/ticket-context';

interface TicketItemRowProps {
  item: TicketItem;
}

export function TicketItemRow({ item }: TicketItemRowProps) {
  const { dispatch } = useTicket();

  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-2">
      {/* Name + tier */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.itemName}
        </p>
        {item.tierName && (
          <p className="truncate text-xs text-gray-500">{item.tierName}</p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() =>
            dispatch({
              type: 'UPDATE_ITEM_QUANTITY',
              itemId: item.id,
              quantity: item.quantity - 1,
            })
          }
          className="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-6 text-center text-sm tabular-nums text-gray-900">
          {item.quantity}
        </span>
        <button
          onClick={() =>
            dispatch({
              type: 'UPDATE_ITEM_QUANTITY',
              itemId: item.id,
              quantity: item.quantity + 1,
            })
          }
          className="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Price */}
      <div className="w-16 text-right">
        <p className="text-sm font-medium tabular-nums text-gray-900">
          ${item.totalPrice.toFixed(2)}
        </p>
        {item.taxAmount > 0 && (
          <p className="text-xs tabular-nums text-gray-400">
            +${item.taxAmount.toFixed(2)}
          </p>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={() => dispatch({ type: 'REMOVE_ITEM', itemId: item.id })}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
