'use client';

import { useState } from 'react';
import { X, Play, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useHeldTickets } from '../context/held-tickets-context';
import { useTicket } from '../context/ticket-context';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

interface HeldTicketsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function HeldTicketsPanel({ open, onClose }: HeldTicketsPanelProps) {
  const { heldTickets, resumeTicket, removeHeldTicket, holdTicket } = useHeldTickets();
  const { ticket, dispatch } = useTicket();
  const [confirmResumeId, setConfirmResumeId] = useState<string | null>(null);

  if (!open) return null;

  function handleResume(id: string) {
    const currentHasItems = ticket.items.length > 0;

    if (currentHasItems) {
      // Ask to hold current ticket first
      setConfirmResumeId(id);
      return;
    }

    doResume(id);
  }

  function doResume(id: string) {
    const restored = resumeTicket(id);
    if (restored) {
      dispatch({ type: 'RESTORE_TICKET', state: restored });
      toast.success('Ticket resumed');
    }
    setConfirmResumeId(null);
    onClose();
  }

  function handleHoldCurrentAndResume() {
    if (!confirmResumeId) return;
    holdTicket(ticket);
    dispatch({ type: 'CLEAR_TICKET' });
    doResume(confirmResumeId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Held Tickets ({heldTickets.length})
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Ticket list */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {heldTickets.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No held tickets
            </p>
          ) : (
            <div className="space-y-3">
              {heldTickets.map((held) => {
                const customerName = held.ticket.customer
                  ? `${held.ticket.customer.first_name} ${held.ticket.customer.last_name}`.trim()
                  : 'Walk-in';
                const itemCount = held.ticket.items.length;
                const total = held.ticket.total;

                return (
                  <div
                    key={held.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {customerName}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-500">
                          {itemCount} item{itemCount !== 1 ? 's' : ''} &middot; ${total.toFixed(2)}
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(held.heldAt)}
                        </div>
                      </div>
                      <div className="ml-3 flex items-center gap-1.5">
                        <button
                          onClick={() => handleResume(held.id)}
                          className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Resume
                        </button>
                        <button
                          onClick={() => {
                            removeHeldTicket(held.id);
                            toast.success('Held ticket removed');
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Hold current & resume confirmation */}
      {confirmResumeId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Current ticket has items
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Hold the current ticket and resume the selected one?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmResumeId(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleHoldCurrentAndResume}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Hold & Resume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
