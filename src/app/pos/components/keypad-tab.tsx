'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MessageSquarePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../context/ticket-context';
import { PinPad } from './pin-pad';

export function KeypadTab() {
  const { dispatch } = useTicket();
  const [cents, setCents] = useState(0);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  const dollars = cents / 100;
  const display = dollars.toFixed(2);

  function handleDigit(d: string) {
    if (d === '.') return; // Ignore decimal — cents-based input
    const next = cents * 10 + parseInt(d, 10);
    if (next > 9999999) return; // Cap at $99,999.99
    setCents(next);
  }

  function handleBackspace() {
    setCents(Math.floor(cents / 10));
  }

  function handleAddToTicket() {
    if (cents === 0) {
      toast.error('Enter an amount');
      return;
    }
    dispatch({
      type: 'ADD_CUSTOM_ITEM',
      name: note.trim() || 'Custom Item',
      price: dollars,
      isTaxable: false,
    });
    toast.success(`Added $${display}`);
    setCents(0);
    setNote('');
    setShowNote(false);
  }

  return (
    <div className="flex h-full flex-col items-center px-4 pt-6">
      {/* Dollar display */}
      <div className="mb-6 text-center">
        <span
          className={cn(
            'tabular-nums font-bold',
            cents === 0 ? 'text-gray-300' : 'text-gray-900',
            display.length > 8 ? 'text-4xl' : 'text-5xl'
          )}
        >
          ${display}
        </span>
      </div>

      {/* Note toggle / input */}
      <div className="mb-4 w-full max-w-xs">
        {showNote ? (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Item description..."
              className="flex-1 bg-transparent text-sm outline-none"
              maxLength={100}
              autoFocus
            />
            <button
              onClick={() => { setNote(''); setShowNote(false); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNote(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <MessageSquarePlus className="h-4 w-4" />
            + Note
          </button>
        )}
      </div>

      {/* Pin pad */}
      <div className="w-full max-w-xs">
        <PinPad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onAction={handleAddToTicket}
          actionLabel="Add to Ticket"
        />
      </div>
    </div>
  );
}
