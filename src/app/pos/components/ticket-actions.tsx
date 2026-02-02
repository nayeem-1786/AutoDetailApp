'use client';

import { Button } from '@/components/ui/button';
import { useTicket } from '../context/ticket-context';
import { useCheckout } from '../context/checkout-context';

export function TicketActions() {
  const { ticket, dispatch } = useTicket();
  const { openCheckout } = useCheckout();

  const hasItems = ticket.items.length > 0;

  return (
    <div className="flex gap-2 border-t border-gray-200 pt-3">
      <Button
        variant="outline"
        className="flex-1"
        disabled={!hasItems}
        onClick={() => dispatch({ type: 'CLEAR_TICKET' })}
      >
        Clear
      </Button>
      <Button
        className="flex-1 bg-green-600 hover:bg-green-700"
        disabled={!hasItems}
        onClick={openCheckout}
      >
        Charge ${ticket.total.toFixed(2)}
      </Button>
    </div>
  );
}
