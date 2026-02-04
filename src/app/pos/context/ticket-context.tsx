'use client';

import { createContext, useContext, useReducer, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { TicketState, TicketAction } from '../types';
import { ticketReducer, initialTicketState } from './ticket-reducer';

interface TicketContextType {
  ticket: TicketState;
  dispatch: React.Dispatch<TicketAction>;
}

const TicketContext = createContext<TicketContextType | null>(null);

export function TicketProvider({ children }: { children: ReactNode }) {
  const [ticket, dispatch] = useReducer(ticketReducer, initialTicketState);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevItemsRef = useRef<string>('');
  const prevCustomerRef = useRef<string | null>(null);

  // Serialize items for change detection
  const itemsKey = ticket.items.map((i) => `${i.id}:${i.quantity}:${i.unitPrice}`).join(',');
  const customerId = ticket.customer?.id ?? null;

  const handleAutoApplyAndRecalc = useCallback(async () => {
    // No customer = no auto-apply
    if (!ticket.customer) return;

    const cartItems = ticket.items.map((item) => ({
      item_type: item.itemType,
      product_id: item.productId || undefined,
      service_id: item.serviceId || undefined,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      item_name: item.itemName,
    }));

    // If a coupon is applied, recalculate it
    if (ticket.coupon) {
      try {
        const res = await fetch('/api/pos/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: ticket.coupon.code,
            subtotal: ticket.subtotal,
            customer_id: ticket.customer.id,
            items: cartItems,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const newDiscount = json.data.total_discount;
          // Update discount if changed
          if (newDiscount !== ticket.coupon.discount) {
            dispatch({
              type: 'SET_COUPON',
              coupon: {
                ...ticket.coupon,
                discount: newDiscount,
              },
            });
          }
        } else {
          // Coupon no longer valid - remove it
          dispatch({ type: 'SET_COUPON', coupon: null });
          toast.info('Coupon removed — conditions no longer met');
        }
      } catch {
        // Silently fail recalculation
      }
      return;
    }

    // No coupon applied — try auto-apply
    // Only auto-apply if no manually-applied coupon was removed
    try {
      const res = await fetch('/api/pos/promotions/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer.id,
          items: cartItems,
          subtotal: ticket.subtotal,
        }),
      });

      if (!res.ok) return;

      const { data } = await res.json();
      const allEligible = [...(data.for_you || []), ...(data.eligible || [])];

      // Find the best auto-apply coupon
      const autoApplyCoupons = allEligible.filter(
        (p: { auto_apply: boolean; discount_amount: number; missing_items?: string[] }) =>
          p.auto_apply &&
          p.discount_amount > 0 &&
          (!p.missing_items || p.missing_items.length === 0)
      );

      if (autoApplyCoupons.length === 0) return;

      // Pick highest discount
      autoApplyCoupons.sort(
        (a: { discount_amount: number }, b: { discount_amount: number }) =>
          b.discount_amount - a.discount_amount
      );
      const best = autoApplyCoupons[0];

      // Validate it through the normal flow
      const validateRes = await fetch('/api/pos/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: best.code,
          subtotal: ticket.subtotal,
          customer_id: ticket.customer.id,
          items: cartItems,
        }),
      });

      if (validateRes.ok) {
        const validateJson = await validateRes.json();
        dispatch({
          type: 'SET_COUPON',
          coupon: {
            id: validateJson.data.id,
            code: validateJson.data.code,
            discount: validateJson.data.total_discount,
            isAutoApplied: true,
          },
        });
      }
    } catch {
      // Silently fail auto-apply
    }
  }, [ticket.customer, ticket.items, ticket.subtotal, ticket.coupon, dispatch]);

  useEffect(() => {
    // Only trigger on actual changes (not initial mount with empty state)
    const currentItemsKey = itemsKey;
    const currentCustomerId = customerId;

    if (prevItemsRef.current === currentItemsKey && prevCustomerRef.current === currentCustomerId) {
      return;
    }

    prevItemsRef.current = currentItemsKey;
    prevCustomerRef.current = currentCustomerId;

    // Don't auto-apply if no customer or no items
    if (!currentCustomerId || ticket.items.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleAutoApplyAndRecalc();
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [itemsKey, customerId, ticket.items.length, handleAutoApplyAndRecalc]);

  return (
    <TicketContext.Provider value={{ ticket, dispatch }}>
      {children}
    </TicketContext.Provider>
  );
}

export function useTicket() {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicket must be used within a TicketProvider');
  }
  return context;
}
