'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { JobQueue } from './components/job-queue';
import { JobDetail } from './components/job-detail';
import { useTicket } from '../context/ticket-context';
import { calculateItemTax } from '../utils/tax';
import { posFetch } from '../lib/pos-fetch';
import type { TicketItem, TicketState, PriorPayment } from '../types';
import type { Customer, Vehicle } from '@/lib/supabase/types';

type View =
  | { mode: 'queue' }
  | { mode: 'detail'; jobId: string };

function JobsPageInner() {
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
      // Item 15g Layer 15g-ii — modifier snapshot returned by checkout-items.
      // Layer 15g-iii (this layer) dispatches them to <TicketContext> after
      // RESTORE_TICKET so the operator sees pre-applied loyalty + manual
      // discount alongside the existing coupon flow.
      coupon_discount?: number | null;
      loyalty_points_redeemed?: number | null;
      loyalty_discount?: number | null;
      manual_discount_value?: number | null;
      manual_discount_label?: string | null;
      deposit_amount: number;
      deposit_date: string | null;
      prior_payments?: PriorPayment[];
      prior_payments_total_cents?: number;
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
          parentItemId: null,
          standardPrice: item.unit_price,
          pricingType: 'standard' as const,
          comboSourcePrimaryId: null,
          saleEffectivePrice: null,
          prerequisiteNote: null,
          prerequisiteForServiceId: null,
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

      const depositCredit = data.deposit_amount || 0;

      // Prior payments — itemized payments hitting the linked appointment.
      // Server returns amount_cents; we keep cents for the array (UI reads
      // amount_cents directly) but maintain priorPaymentsTotal in dollars to
      // match the depositCredit / total convention used by tax.ts.
      const priorPayments = (data.prior_payments ?? []) as PriorPayment[];
      const priorPaymentsTotalCents = (data.prior_payments_total_cents ?? 0) as number;
      const priorPaymentsTotal = priorPaymentsTotalCents / 100;

      const total = Math.max(
        0,
        subtotal + taxAmount - depositCredit - priorPaymentsTotal
      );

      const newTicket: TicketState = {
        items: ticketItems,
        customer: ticketCustomer,
        vehicle: (data.vehicle || null) as Vehicle | null,
        coupon: null,
        loyaltyPointsToRedeem: 0,
        loyaltyDiscount: 0,
        manualDiscount: null,
        depositCredit,
        depositDate: data.deposit_date || null,
        priorPayments,
        priorPaymentsTotal: Math.round(priorPaymentsTotal * 100) / 100,
        notes: null,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        discountAmount: 0,
        total: Math.round(total * 100) / 100,
      };

      dispatch({ type: 'RESTORE_TICKET', state: newTicket });

      // Item 15g Layer 15g-iii — dispatch loyalty + manual-discount from the
      // appointment snapshot. RESTORE_TICKET above resets these to 0/null so
      // re-running checkout for the same job stays idempotent (the dispatches
      // here replace state, they don't accumulate).
      //
      // Loyalty is dispatched whenever EITHER points or dollar discount is
      // non-zero. Booking wizard records both as a pair; older rows that only
      // recorded loyalty via plaintext-in-notes won't surface here (deferred
      // back-fill is Layer 15g-iv).
      const loyaltyPoints = Number(data.loyalty_points_redeemed ?? 0);
      const loyaltyDiscount = Number(data.loyalty_discount ?? 0);
      if (loyaltyPoints > 0 || loyaltyDiscount > 0) {
        dispatch({
          type: 'SET_LOYALTY_REDEEM',
          points: loyaltyPoints,
          discount: loyaltyDiscount,
        });
      }

      // Manual discount is dispatched as `dollar` type — the appointment
      // snapshot stores a resolved dollar amount (booking wizard never
      // captures percent; convert-service resolves percent to dollar against
      // subtotal before persisting). Label falls back to "Manual discount"
      // when the source dialog didn't record one.
      const manualValue = Number(data.manual_discount_value ?? 0);
      if (manualValue > 0) {
        dispatch({
          type: 'APPLY_MANUAL_DISCOUNT',
          discountType: 'dollar',
          value: manualValue,
          label: data.manual_discount_label?.trim() || 'Manual discount',
        });
      }

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

export default function JobsPage() {
  return (
    <Suspense>
      <JobsPageInner />
    </Suspense>
  );
}
