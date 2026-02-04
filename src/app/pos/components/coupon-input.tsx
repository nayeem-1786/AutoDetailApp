'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import { useTicket } from '../context/ticket-context';

export function CouponInput() {
  const { ticket, dispatch } = useTicket();
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);

  async function handleValidate() {
    if (!code.trim()) return;

    setValidating(true);
    try {
      const cartItems = ticket.items.map((item) => ({
        item_type: item.itemType,
        product_id: item.productId || undefined,
        service_id: item.serviceId || undefined,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        item_name: item.itemName,
      }));

      const res = await posFetch('/api/pos/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.replace(/\s/g, '').trim(),
          subtotal: ticket.subtotal,
          customer_id: ticket.customer?.id || null,
          items: cartItems,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Invalid coupon');
        return;
      }

      dispatch({
        type: 'SET_COUPON',
        coupon: {
          id: json.data.id,
          code: json.data.code,
          discount: json.data.total_discount,
          isAutoApplied: false,
        },
      });

      if (json.data.warning) {
        toast.warning(json.data.warning);
      } else {
        toast.success(`Coupon applied: ${json.data.description}`);
      }
      setCode('');
    } catch {
      toast.error('Failed to validate coupon');
    } finally {
      setValidating(false);
    }
  }

  function handleRemove() {
    dispatch({ type: 'SET_COUPON', coupon: null });
  }

  // Show applied coupon
  if (ticket.coupon) {
    return (
      <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-sm text-green-700">
          <Tag className="h-3.5 w-3.5" />
          <span className="font-medium">{ticket.coupon.code}</span>
          {ticket.coupon.isAutoApplied && (
            <span className="text-[10px] text-green-500">(auto)</span>
          )}
          <span className="text-green-600">
            -${ticket.coupon.discount.toFixed(2)}
          </span>
        </div>
        <button
          onClick={handleRemove}
          className="rounded p-0.5 text-green-500 hover:bg-green-100 hover:text-green-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Show input
  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Coupon code"
        className="h-8 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleValidate();
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleValidate}
        disabled={!code.trim() || validating}
        className="h-8 shrink-0 px-2"
      >
        {validating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          'Apply'
        )}
      </Button>
    </div>
  );
}
