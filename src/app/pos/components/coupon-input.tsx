'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, X, Loader2, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../lib/pos-fetch';
import { useTicket } from '../context/ticket-context';

interface CouponInputProps {
  renderCollapsedInline?: React.ReactNode;
}

export function CouponInput({ renderCollapsedInline }: CouponInputProps) {
  const { ticket, dispatch } = useTicket();
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleValidate() {
    if (!code.trim()) return;

    setValidating(true);
    try {
      const cartItems = ticket.items.map((item) => ({
        item_type: item.itemType,
        product_id: item.productId || undefined,
        service_id: item.serviceId || undefined,
        category_id: item.categoryId || undefined,
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

      setExpanded(false);
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
      <div className="flex items-center justify-between rounded-md bg-green-50 dark:bg-green-900/30 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
          <Tag className="h-3.5 w-3.5" />
          <span className="font-medium">{ticket.coupon.code}</span>
          {ticket.coupon.isAutoApplied && (
            <span className="text-[10px] text-green-500 dark:text-green-400">(auto)</span>
          )}
          <span className="text-green-600 dark:text-green-400">
            -${ticket.coupon.discount.toFixed(2)}
          </span>
        </div>
        <button
          onClick={handleRemove}
          className="flex h-11 w-11 items-center justify-center rounded text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-700 dark:hover:text-green-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Show collapsed link — optionally inline with another element
  if (!expanded) {
    if (renderCollapsedInline) {
      return (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(true)}
            className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <TicketPercent className="h-4 w-4" />
            Add Coupon
          </button>
          {renderCollapsedInline}
        </div>
      );
    }
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex min-h-[44px] items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <TicketPercent className="h-4 w-4" />
        Add Coupon
      </button>
    );
  }

  // Show expanded input
  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Coupon code"
        className="min-h-[44px] text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleValidate();
          if (e.key === 'Escape') {
            setExpanded(false);
            setCode('');
          }
        }}
      />
      <Button
        variant="outline"
        onClick={handleValidate}
        disabled={!code.trim() || validating}
        className="min-h-[44px] shrink-0 px-3"
      >
        {validating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          'Apply'
        )}
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setExpanded(false);
          setCode('');
        }}
        className="min-h-[44px] shrink-0 px-2"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
