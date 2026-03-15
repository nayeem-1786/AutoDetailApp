'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PauseCircle, Loader2, Star } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { useCheckout } from '../context/checkout-context';
import { useHeldTickets } from '../context/held-tickets-context';
import { CustomerTypePrompt } from './customer-type-prompt';
import { posFetch } from '../lib/pos-fetch';

interface TicketActionsProps {
  onRequireVehicle?: () => void;
}

export function TicketActions({ onRequireVehicle }: TicketActionsProps) {
  const { ticket, dispatch } = useTicket();
  const { openCheckout, setComplete } = useCheckout();
  const { holdTicket } = useHeldTickets();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [showTypePrompt, setShowTypePrompt] = useState(false);
  const [processingLoyalty, setProcessingLoyalty] = useState(false);

  const hasItems = ticket.items.length > 0;
  const isFullyPaidByLoyalty = hasItems && ticket.total === 0 && ticket.loyaltyDiscount > 0;

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

  async function handleCompleteLoyalty() {
    if (processingLoyalty) return;
    setProcessingLoyalty(true);

    try {
      const res = await posFetch('/api/pos/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer?.id || null,
          vehicle_id: ticket.vehicle?.id || null,
          subtotal: ticket.subtotal,
          tax_amount: ticket.taxAmount,
          tip_amount: 0,
          discount_amount: ticket.discountAmount,
          total_amount: 0,
          payment_method: 'cash',
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: ticket.notes,
          items: ticket.items.map((i) => ({
            item_type: i.itemType,
            product_id: i.productId,
            service_id: i.serviceId,
            item_name: i.itemName,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            total_price: i.totalPrice,
            tax_amount: i.taxAmount,
            is_taxable: i.isTaxable,
            tier_name: i.tierName,
            vehicle_size_class: i.vehicleSizeClass,
            notes: i.notes,
            standard_price: i.standardPrice,
            pricing_type: i.pricingType,
            is_addon: !!i.parentItemId,
          })),
          payments: [],
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to process transaction');
      }

      setComplete(
        json.data.id,
        json.data.receipt_number,
        ticket.customer?.email,
        ticket.customer?.phone,
        ticket.customer?.id,
        ticket.customer?.tags
      );
      dispatch({ type: 'CLEAR_TICKET' });
      toast.success('Transaction completed — paid by loyalty points');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setProcessingLoyalty(false);
    }
  }

  function handleCheckout() {
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
  }

  return (
    <>
      <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
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

        {isFullyPaidByLoyalty ? (
          <Button
            className="flex-1 bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-500 text-white"
            disabled={processingLoyalty}
            onClick={handleCompleteLoyalty}
          >
            {processingLoyalty ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4" />
                Complete (Loyalty)
              </span>
            )}
          </Button>
        ) : (
          <Button
            className="flex-1 bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
            disabled={!hasItems}
            onClick={handleCheckout}
          >
            Checkout
          </Button>
        )}
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
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-6 shadow-2xl dark:shadow-gray-950/60">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Clear all items?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This will remove all items from the current ticket.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="flex-1 rounded-lg bg-red-600 dark:bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600"
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
