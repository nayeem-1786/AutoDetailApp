'use client';

import { useState, useRef, useEffect } from 'react';
import { Minus, Plus, X, StickyNote } from 'lucide-react';
import type { TicketItem } from '../types';
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

  return (
    <div className="border-b border-gray-100 py-2">
      <div className="flex items-center gap-2">
        {/* Name + tier */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {item.itemName}
            </p>
            <button
              onClick={() => {
                setNoteValue(item.notes ?? '');
                setNoteOpen(!noteOpen);
              }}
              className={`shrink-0 rounded p-0.5 ${
                item.notes
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-gray-300 hover:text-gray-500'
              }`}
              title={item.notes ? `Note: ${item.notes}` : 'Add note'}
            >
              <StickyNote className="h-3 w-3" />
            </button>
          </div>
          {item.tierName && (
            <p className="truncate text-xs text-gray-500">{item.tierName}</p>
          )}
          {item.notes && !noteOpen && (
            <p className="truncate text-xs text-gray-400 italic">
              {item.notes}
            </p>
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
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              min="0"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="h-7 w-12 rounded border border-blue-400 bg-white text-center text-sm tabular-nums text-gray-900 outline-none focus:ring-1 focus:ring-blue-300"
              autoFocus
            />
          ) : (
            <button
              onClick={startEditing}
              className="flex h-7 min-w-[28px] items-center justify-center rounded px-1 text-sm tabular-nums text-gray-900 hover:bg-blue-50 hover:text-blue-700"
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

      {/* Inline note input */}
      {noteOpen && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-1">
          <input
            ref={noteInputRef}
            type="text"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            onBlur={handleNoteSave}
            onKeyDown={handleNoteKeyDown}
            placeholder="Add a note..."
            maxLength={200}
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          <button
            onClick={handleNoteSave}
            className="shrink-0 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            Save
          </button>
          <button
            onClick={() => {
              setNoteValue(item.notes ?? '');
              setNoteOpen(false);
            }}
            className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
