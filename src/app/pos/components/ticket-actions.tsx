'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PauseCircle, Loader2, Star, Save } from 'lucide-react';
import { useTicket } from '../context/ticket-context';
import { serializeTicketEditSlice } from '../context/ticket-reducer';
import { useCheckout } from '../context/checkout-context';
import { useHeldTickets } from '../context/held-tickets-context';
import { usePosPermission } from '../context/pos-permission-context';
import { CustomerTypePrompt } from './customer-type-prompt';
import { posFetch } from '../lib/pos-fetch';
import { resolveManualDiscountAmount } from '@/lib/quotes/manual-discount';

interface TicketActionsProps {
  heldCount?: number;
  onRequireVehicle?: () => void;
}

export function TicketActions({ heldCount = 0, onRequireVehicle }: TicketActionsProps) {
  const router = useRouter();
  const { ticket, dispatch } = useTicket();
  const { openCheckout, setComplete } = useCheckout();
  const { holdTicket } = useHeldTickets();
  const { granted: canCreateTickets } = usePosPermission('pos.create_tickets');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [showTypePrompt, setShowTypePrompt] = useState(false);
  const [processingLoyalty, setProcessingLoyalty] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const hasItems = ticket.items.length > 0;
  const hasAnyTicketState = hasItems || !!ticket.customer || !!ticket.vehicle;
  const isFullyPaidByLoyalty = hasItems && ticket.total === 0 && ticket.loyaltyDiscount > 0;

  // Item 15f Phase 1 Layer 8c — edit-mode dirty detection. Compare the
  // currently-rendered serialized slice against the snapshot stamped at
  // MARK_EDIT_INITIAL_STATE (the drain's final dispatch). When the strings
  // diverge, the operator has made unsaved changes — affects Cancel UX.
  const isDirty =
    ticket.editMode &&
    ticket.editInitialSnapshot != null &&
    serializeTicketEditSlice(ticket) !== ticket.editInitialSnapshot;

  function handleClearClick() {
    if (!hasAnyTicketState) return;
    setConfirmClearOpen(true);
  }

  function handleConfirmClear() {
    dispatch({ type: 'CLEAR_TICKET' });
    setConfirmClearOpen(false);
    toast.success('Ticket cleared');
  }

  function handleHold() {
    if (!hasItems) {
      window.dispatchEvent(new CustomEvent('pos-open-held-panel'));
      return;
    }
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
          deposit_credit: ticket.depositCredit,
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
    // Require vehicle only when services are in the cart
    const hasServices = ticket.items.some((i) => i.itemType === 'service');
    if (hasServices && !ticket.vehicle) {
      toast.error('Please select a vehicle for service checkout');
      onRequireVehicle?.();
      return;
    }
    if (ticket.customer && !ticket.customer.customer_type) {
      setShowTypePrompt(true);
    } else {
      openCheckout();
    }
  }

  // -------------------------------------------------------------------------
  // Item 15f Phase 1 Layer 8c — Save Changes (edit-mode cascade endpoint POST)
  // -------------------------------------------------------------------------

  /**
   * Build the modifier portion of the cascade-endpoint payload from the
   * current cart. Mirrors the optional schema in
   * `src/lib/appointments/edit-services.ts` — six fields, all optional.
   * Manual discount value is client-resolved (% → $) via the canonical
   * resolver so the server contract stays single-dollar.
   *
   * Always sends ALL six fields so the cascade endpoint writes them
   * unconditionally. This is the "edit-mode save" contract — the operator's
   * cart is the source of truth at save time; preserving stale appointment
   * column values would defeat the whole edit flow.
   */
  function buildModifierPayload(): Record<string, unknown> {
    const md = ticket.manualDiscount;
    const manualValue = md
      ? resolveManualDiscountAmount(md.type, md.value, ticket.subtotal)
      : null;
    const manualLabel = md && manualValue != null && manualValue > 0 ? md.label : null;
    return {
      coupon_code: ticket.coupon?.code ?? null,
      coupon_discount: ticket.coupon?.discount ?? null,
      loyalty_points_to_redeem: ticket.loyaltyPointsToRedeem || 0,
      loyalty_discount: ticket.loyaltyDiscount || 0,
      manual_discount_value: manualValue,
      manual_discount_label: manualLabel,
    };
  }

  async function handleSaveChanges() {
    if (savingEdit) return;
    if (!ticket.editMode || !ticket.sourceId) {
      toast.error('Edit mode lost — refresh and try again');
      return;
    }
    if (!hasItems) {
      toast.error('At least one service or product is required to save');
      return;
    }

    // Only services persist via the cascade endpoint today. Products /
    // mobile_fee rows stay on the appointment via other code paths; the
    // cascade endpoint's Zod requires `services.length >= 1`. Filter to
    // service-type rows for the payload; surface a guard if none remain.
    const serviceItems = ticket.items.filter(
      (i) => i.itemType === 'service' && i.serviceId
    );
    if (serviceItems.length === 0) {
      toast.error('At least one service is required to save');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await posFetch(
        `/api/pos/appointments/${ticket.sourceId}/services`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            services: serviceItems.map((i) => ({
              service_id: i.serviceId!,
              price_at_booking: i.totalPrice,
              tier_name: i.tierName,
            })),
            ...buildModifierPayload(),
          }),
        }
      );
      if (!res.ok) {
        let msg = 'Failed to save changes';
        try {
          const errJson = await res.json();
          if (errJson?.error) msg = errJson.error;
        } catch {
          // ignore parse failure
        }
        throw new Error(msg);
      }

      const returnTo = ticket.returnTo;
      dispatch({ type: 'EXIT_EDIT_MODE' });
      dispatch({ type: 'CLEAR_TICKET' });
      toast.success('Changes saved');
      if (returnTo) {
        router.push(returnTo);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  }

  function handleCancelClick() {
    if (isDirty) {
      setConfirmCancelOpen(true);
    } else {
      doCancel();
    }
  }

  function doCancel() {
    const returnTo = ticket.returnTo;
    dispatch({ type: 'EXIT_EDIT_MODE' });
    dispatch({ type: 'CLEAR_TICKET' });
    setConfirmCancelOpen(false);
    if (returnTo) {
      router.push(returnTo);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Edit mode replaces the entire action bar. Hold is hidden (no mid-edit
  // holds), Clear becomes Cancel, Checkout becomes Save Changes. The
  // loyalty-only checkout (`isFullyPaidByLoyalty`) is unreachable in edit
  // mode by construction — saving doesn't commit a transaction.
  if (ticket.editMode) {
    return (
      <>
        <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={savingEdit}
            onClick={handleCancelClick}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600"
            disabled={!hasItems || savingEdit}
            onClick={handleSaveChanges}
          >
            {savingEdit ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Save className="h-4 w-4" />
                Save Changes
              </span>
            )}
          </Button>
        </div>

        {confirmCancelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 p-6 shadow-2xl dark:shadow-gray-950/60">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Discard unsaved changes?
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                You have unsaved changes to this {ticket.source === 'job' ? 'job' : 'appointment'}.
                Cancelling will lose them.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setConfirmCancelOpen(false)}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Keep editing
                </button>
                <button
                  onClick={doCancel}
                  className="flex-1 rounded-lg bg-red-600 dark:bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 dark:hover:bg-red-600"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!hasAnyTicketState || !canCreateTickets}
          onClick={handleClearClick}
          title={!canCreateTickets ? 'You do not have permission to create new tickets' : undefined}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          className="shrink-0 relative"
          onClick={handleHold}
          title={hasItems ? 'Hold ticket' : heldCount > 0 ? 'View held tickets' : 'Hold ticket'}
        >
          <PauseCircle className="h-4 w-4" />
          {heldCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {heldCount}
            </span>
          )}
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
              Clear ticket?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This will remove all items, customer, and vehicle from the current ticket.
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
