'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PauseCircle } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { useCheckout } from '../context/checkout-context';
import { useHeldTickets } from '../context/held-tickets-context';
import { CustomerTypePrompt } from './customer-type-prompt';

interface TicketActionsProps {
  onRequireVehicle?: () => void;
}

export function TicketActions({ onRequireVehicle }: TicketActionsProps) {
  const { ticket, dispatch } = useTicket();
  const { openCheckout } = useCheckout();
  const { holdTicket } = useHeldTickets();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [showTypePrompt, setShowTypePrompt] = useState(false);

  const hasItems = ticket.items.length > 0;

  function handleClearClick() {
    if (!hasItems) return;
    setConfirmClearOpen(true);
  }

  function handleConfirmClear() {
    dispatch({ type: 'CLEAR_TICKET' });
    setConfirmClearOpen(false);
    toast.success('Ticket cleared');
  }

  function handleHold() {
    if (!hasItems) return;
    holdTicket(ticket);
    dispatch({ type: 'CLEAR_TICKET' });
    toast.success('Ticket held');
  }

  return (
    <>
      <div className="flex gap-2 border-t border-gray-200 pt-3">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!hasItems}
          onClick={handleClearClick}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          className="shrink-0"
          disabled={!hasItems}
          onClick={handleHold}
          title="Hold ticket"
        >
          <PauseCircle className="h-4 w-4" />
        </Button>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          disabled={!hasItems}
          onClick={() => {
            // Require vehicle selection if customer is selected but no vehicle
            if (ticket.customer && !ticket.vehicle) {
              toast.error('Please select a vehicle before checkout');
              onRequireVehicle?.();
              return;
            }
            if (ticket.customer && !ticket.customer.customer_type) {
              setShowTypePrompt(true);
            } else {
              openCheckout();
            }
          }}
        >
          Checkout
        </Button>
      </div>

      {/* Customer Type Prompt at checkout */}
      {ticket.customer && (
        <CustomerTypePrompt
          open={showTypePrompt}
          onOpenChange={setShowTypePrompt}
          customerId={ticket.customer.id}
          customerName={`${ticket.customer.first_name} ${ticket.customer.last_name}`}
          onTypeSelected={(newType) => {
            if (newType && ticket.customer) {
              dispatch({ type: 'SET_CUSTOMER', customer: { ...ticket.customer, customer_type: newType } });
            }
            // Proceed to checkout after type selection or skip
            openCheckout();
          }}
        />
      )}

      {/* Clear Ticket Confirmation Modal */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Clear all items?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              This will remove all items from the current ticket.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
