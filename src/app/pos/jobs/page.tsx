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
import type { Customer, Vehicle } from '@/lib/supabase/types';

type View =
  | { mode: 'queue' }
  | { mode: 'detail'; jobId: string };

export default function JobsPage() {
  const router = useRouter();
  const { dispatch } = useTicket();
  const [view, setView] = useState<View>({ mode: 'queue' });
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCheckout = useCallback(async (jobId: string) => {
    // Fetch checkout items from API
    let res: Response;
    try {
      res = await posFetch(`/api/pos/jobs/${jobId}/checkout-items`);
    } catch (err) {
      console.error('Checkout fetch error:', err);
      toast.error('Failed to load checkout items');
      return;
    }

    if (!res.ok) {
      try {
        const err = await res.json();
        if (res.status === 403) {
          toast.error(err.error || "You don't have permission to checkout jobs. Ask your admin to update your permissions.");
        } else if (res.status === 404) {
          toast.error('Job not found');
        } else {
          toast.error(err.error || 'Failed to load checkout items');
        }
      } catch {
        toast.error('Failed to load checkout items');
      }
      return;
    }

    // Parse response
    let json: Record<string, unknown>;
    try {
      json = await res.json();
    } catch (err) {
      console.error('Checkout JSON parse error:', err);
      toast.error('Failed to parse checkout response');
      return;
    }

    const data = json.data as {
      job_id: string;
      customer_id: string | null;
      vehicle_id: string | null;
      customer: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null; customer_type: string | null; tags: string[] | null } | null;
      vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null; size_class: string | null } | null;
      items: Array<{
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
      coupon_code: string | null;
      status: string;
    } | undefined;

    if (!data || !Array.isArray(data.items)) {
      console.error('Unexpected checkout response shape:', json);
      toast.error('Failed to load checkout items');
      return;
    }

    try {
      const ticketItems: TicketItem[] = data.items.map((item) => {
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
        ? {
            ...data.customer,
            id: data.customer_id ?? data.customer.id,
            phone: data.customer.phone ?? null,
            email: data.customer.email ?? null,
            customer_type: data.customer.customer_type ?? null,
            tags: data.customer.tags ?? null,
          } as Customer
        : null;

      const subtotal = ticketItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const taxAmount = ticketItems.reduce((sum, i) => sum + i.taxAmount, 0);
      const total = Math.max(0, subtotal + taxAmount);

      const newTicket: TicketState = {
        items: ticketItems,
        customer: ticketCustomer,
        vehicle: (data.vehicle || null) as Vehicle | null,
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

      // Auto-apply coupon from linked quote if present
      if (data.coupon_code) {
        try {
          const validateRes = await posFetch('/api/pos/coupons/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: data.coupon_code,
              subtotal: newTicket.subtotal,
              customer_id: data.customer_id,
              items: ticketItems.map((ti) => ({
                item_type: ti.itemType,
                product_id: ti.productId || undefined,
                service_id: ti.serviceId || undefined,
                category_id: ti.categoryId || undefined,
                unit_price: ti.unitPrice,
                quantity: ti.quantity,
                item_name: ti.itemName,
              })),
            }),
          });
          if (validateRes.ok) {
            const couponJson = await validateRes.json();
            const couponData = couponJson.data;
            if (couponData && couponData.total_discount > 0) {
              dispatch({
                type: 'SET_COUPON',
                coupon: {
                  id: couponData.id,
                  code: couponData.code,
                  discount: couponData.total_discount,
                },
              });
            }
          }
        } catch {
          // Coupon auto-apply failed — continue without it
        }
      }

      toast.success('Job items loaded into register');
      router.push('/pos');
    } catch (err) {
      console.error('Checkout processing error:', err);
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
