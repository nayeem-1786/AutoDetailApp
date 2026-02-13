'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { JobQueue } from './components/job-queue';
import { JobDetail } from './components/job-detail';
import { useTicket } from '../context/ticket-context';
import { calculateItemTax } from '../utils/tax';
import { posFetch } from '../lib/pos-fetch';
import type { TicketItem, TicketState } from '../types';

type View =
  | { mode: 'queue' }
  | { mode: 'detail'; jobId: string };

export default function JobsPage() {
  const router = useRouter();
  const { dispatch } = useTicket();
  const [view, setView] = useState<View>({ mode: 'queue' });
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCheckout = useCallback(async (jobId: string) => {
    try {
      const res = await posFetch(`/api/pos/jobs/${jobId}/checkout-items`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to load checkout items');
        return;
      }

      const { data } = await res.json();
      const checkoutItems = data.items as Array<{
        item_type: 'service' | 'product' | 'custom';
        service_id?: string;
        product_id?: string;
        item_name: string;
        quantity: number;
        unit_price: number;
        is_addon?: boolean;
        tier_name?: string;
        is_taxable: boolean;
        category_id?: string;
      }>;

      const ticketItems: TicketItem[] = checkoutItems.map((item) => {
        const totalPrice = item.unit_price * item.quantity;
        const isTaxable = item.is_taxable ?? false;
        return {
          id: crypto.randomUUID(),
          itemType: item.item_type,
          productId: item.product_id || null,
          serviceId: item.service_id || null,
          categoryId: item.category_id || null,
          itemName: item.item_name + (item.is_addon ? ' (Add-on)' : ''),
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice,
          taxAmount: calculateItemTax(totalPrice, isTaxable),
          isTaxable,
          tierName: item.tier_name || null,
          vehicleSizeClass: null,
          notes: null,
          perUnitQty: null,
          perUnitLabel: null,
          perUnitPrice: null,
          perUnitMax: null,
        };
      });

      const ticketCustomer = data.customer
        ? { id: data.customer_id, ...data.customer }
        : null;

      const subtotal = ticketItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const taxAmount = ticketItems.reduce((sum, i) => sum + i.taxAmount, 0);
      const total = Math.max(0, subtotal + taxAmount);

      const newTicket: TicketState = {
        items: ticketItems,
        customer: ticketCustomer,
        vehicle: data.vehicle || null,
        coupon: null,
        loyaltyPointsToRedeem: 0,
        loyaltyDiscount: 0,
        manualDiscount: null,
        notes: null,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        discountAmount: 0,
        total: Math.round(total * 100) / 100,
      };

      dispatch({ type: 'RESTORE_TICKET', state: newTicket });
      toast.success('Job items loaded into register');
      router.push('/pos');
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Failed to load checkout items');
    }
  }, [dispatch, router]);

  if (view.mode === 'detail') {
    return (
      <JobDetail
        jobId={view.jobId}
        onBack={() => {
          setRefreshKey((k) => k + 1);
          setView({ mode: 'queue' });
        }}
        onCheckout={handleCheckout}
      />
    );
  }

  return (
    <JobQueue
      key={refreshKey}
      onNewWalkIn={() => router.push('/pos/quotes?mode=builder&walkIn=true')}
      onSelectJob={(jobId) => setView({ mode: 'detail', jobId })}
      onCheckout={handleCheckout}
    />
  );
}
