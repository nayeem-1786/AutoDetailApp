'use client';

import { useState, useRef, useEffect } from 'react';
import { Minus, Plus, X, StickyNote } from 'lucide-react';
import type { TicketItem } from '../types';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import { VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { useTicket } from '../context/ticket-context';

interface TicketItemRowProps {
  item: TicketItem;
}

export function TicketItemRow({ item }: TicketItemRowProps) {
  const { dispatch } = useTicket();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState(item.notes ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (noteOpen) {
      noteInputRef.current?.focus();
    }
  }, [noteOpen]);

  function startEditing() {
    setEditValue(String(item.quantity));
    setEditing(true);
  }

  function commitEdit() {
    const qty = parseInt(editValue, 10);
    if (!isNaN(qty) && qty > 0) {
      dispatch({ type: 'UPDATE_ITEM_QUANTITY', itemId: item.id, quantity: qty });
    } else if (editValue === '0' || editValue === '') {
      dispatch({ type: 'REMOVE_ITEM', itemId: item.id });
    }
    setEditing(false);
  }

  function handleNoteSave() {
    const trimmed = noteValue.trim();
    dispatch({
      type: 'UPDATE_ITEM_NOTE',
      itemId: item.id,
      note: trimmed || null,
    });
    setNoteOpen(false);
  }

  function handleNoteKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleNoteSave();
    } else if (e.key === 'Escape') {
      setNoteValue(item.notes ?? '');
      setNoteOpen(false);
    }
  }

  const sizeLabel = item.vehicleSizeClass
    ? VEHICLE_SIZE_LABELS[item.vehicleSizeClass as VehicleSizeClass]
    : null;

  // Build tier display: skip "default", skip if redundant with vehicle size
  let tierLabel: string | null = null;
  if (item.tierName && item.tierName !== 'default') {
    const formatted = item.tierName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    // Skip if it duplicates the vehicle size label (e.g., "Sedan" and "Sedan")
    if (!sizeLabel || formatted.toLowerCase() !== sizeLabel.toLowerCase()) {
      tierLabel = formatted;
    }
  }

  // Per-unit display: "2 panels x $150.00"
  const perUnitText = item.perUnitQty && item.perUnitPrice != null
    ? `${item.perUnitQty} ${item.perUnitLabel || 'unit'}${item.perUnitQty > 1 ? 's' : ''} \u00D7 $${item.perUnitPrice.toFixed(2)}`
    : null;

  const subParts = [sizeLabel, tierLabel, perUnitText].filter(Boolean);
  const subText = subParts.join(' \u00B7 ');

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 py-2">
      {/* Line 1: Full item name */}
      <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
        {item.itemName}
      </p>

      {/* Line 2: Sub-text + note icon | qty + price + remove */}
      <div className="mt-1 flex items-center gap-2">
        {/* Left: sub-text + note icon */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {subText && (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{subText}</span>
          )}
          <button
            onClick={() => {
              setNoteValue(item.notes ?? '');
              setNoteOpen(!noteOpen);
            }}
            className={`shrink-0 flex h-11 w-11 items-center justify-center rounded ${
              item.notes
                ? 'text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
                : 'text-gray-300 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
            }`}
            title={item.notes ? `Note: ${item.notes}` : 'Add note'}
          >
            <StickyNote className="h-4 w-4" />
          </button>
        </div>

        {/* Right: qty controls + price + remove */}
        <div className="flex shrink-0 items-center gap-2">
          {item.itemType === 'service' && item.perUnitQty != null && item.perUnitPrice != null ? (
            /* Per-unit service: stepper controls perUnitQty with max enforcement */
            <>
              <button
                onClick={() =>
                  item.perUnitQty! > 1
                    ? dispatch({ type: 'UPDATE_PER_UNIT_QTY', itemId: item.id, perUnitQty: item.perUnitQty! - 1 })
                    : dispatch({ type: 'REMOVE_ITEM', itemId: item.id })
                }
                className="flex h-11 w-11 items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex h-11 min-w-[44px] items-center justify-center px-1 text-sm tabular-nums text-gray-900 dark:text-gray-100">
                {item.perUnitQty}
              </span>
              <button
                onClick={() => {
                  const max = item.perUnitMax ?? 10;
                  if (item.perUnitQty! < max) {
                    dispatch({ type: 'UPDATE_PER_UNIT_QTY', itemId: item.id, perUnitQty: item.perUnitQty! + 1 });
                  }
                }}
                disabled={item.perUnitQty! >= (item.perUnitMax ?? 10)}
                className={`flex h-11 w-11 items-center justify-center rounded ${
                  item.perUnitQty! >= (item.perUnitMax ?? 10)
                    ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-500 cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </>
          ) : item.itemType === 'service' ? (
            /* Regular service: no stepper — always qty 1 */
            <span className="flex h-11 min-w-[44px] items-center justify-center px-1 text-sm tabular-nums text-gray-400 dark:text-gray-500">
              1
            </span>
          ) : (
            /* Products and custom items: full quantity stepper */
            <>
              <button
                onClick={() =>
                  dispatch({
                    type: 'UPDATE_ITEM_QUANTITY',
                    itemId: item.id,
                    quantity: item.quantity - 1,
                  })
                }
                className="flex h-11 w-11 items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Minus className="h-4 w-4" />
              </button>
              {editing ? (
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editValue}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setEditValue(v);
                  }}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="h-11 w-14 rounded border border-blue-400 bg-white dark:bg-gray-900 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-700"
                  autoFocus
                />
              ) : (
                <button
                  onClick={startEditing}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded px-1 text-sm tabular-nums text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400"
                >
                  {item.quantity}
                </button>
              )}
              <button
                onClick={() =>
                  dispatch({
                    type: 'UPDATE_ITEM_QUANTITY',
                    itemId: item.id,
                    quantity: item.quantity + 1,
                  })
                }
                className="flex h-11 w-11 items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Price */}
          <div className="w-16 text-right">
            <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
              ${item.totalPrice.toFixed(2)}
            </p>
            {item.taxAmount > 0 && (
              <p className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                +${item.taxAmount.toFixed(2)}
              </p>
            )}
          </div>

          {/* Remove */}
          <button
            onClick={() => dispatch({ type: 'REMOVE_ITEM', itemId: item.id })}
            className="flex h-11 w-11 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Note text (when exists and note input is closed) */}
      {item.notes && !noteOpen && (
        <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500 italic">
          {item.notes}
        </p>
      )}

      {/* Inline note input */}
      {noteOpen && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            ref={noteInputRef}
            type="text"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={handleNoteSave}
            onKeyDown={handleNoteKeyDown}
            placeholder="Add a note..."
            maxLength={200}
            className="min-h-[44px] min-w-0 flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800"
          />
          <button
            onClick={handleNoteSave}
            className="min-h-[44px] shrink-0 rounded bg-blue-500 dark:bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 dark:hover:bg-blue-500"
          >
            Save
          </button>
          <button
            onClick={() => {
              setNoteValue(item.notes ?? '');
              setNoteOpen(false);
            }}
            className="min-h-[44px] shrink-0 rounded px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
