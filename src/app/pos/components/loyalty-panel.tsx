'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { LOYALTY } from '@/lib/utils/constants';
import { useTicket } from '../context/ticket-context';

export function LoyaltyPanel() {
  const { ticket, dispatch } = useTicket();
  const [redeeming, setRedeeming] = useState(false);

  const customer = ticket.customer;
  const balance = customer?.loyalty_points_balance ?? 0;
  const canRedeem = balance >= LOYALTY.REDEEM_MINIMUM;
  const redeemDiscount = Math.round(balance * LOYALTY.REDEEM_RATE * 100) / 100;
  const isRedeeming = ticket.loyaltyPointsToRedeem > 0;

  // Preview earned points
  const earnPreview = Math.floor(ticket.subtotal * LOYALTY.EARN_RATE);

  // Reset loyalty redeem if customer changes
  useEffect(() => {
    if (!customer && isRedeeming) {
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
    }
  }, [customer, isRedeeming, dispatch]);

  if (!customer) return null;

  function handleToggleRedeem() {
    if (isRedeeming) {
      // Remove redemption
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
      setRedeeming(false);
    } else if (canRedeem) {
      // Apply full balance redemption
      dispatch({
        type: 'SET_LOYALTY_REDEEM',
        points: balance,
        discount: redeemDiscount,
      });
      setRedeeming(true);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium text-amber-800">
            {balance} pts
          </span>
          {canRedeem && !isRedeeming && (
            <span className="text-xs text-amber-600">
              (worth ${redeemDiscount.toFixed(2)})
            </span>
          )}
        </div>

        {canRedeem && (
          <button
            onClick={handleToggleRedeem}
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium transition-colors',
              isRedeeming
                ? 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            )}
          >
            {isRedeeming ? `Redeeming -$${redeemDiscount.toFixed(2)}` : 'Redeem'}
          </button>
        )}
      </div>

      {earnPreview > 0 && !isRedeeming && (
        <p className="mt-1 text-xs text-amber-600">
          Will earn ~{earnPreview} pts from this purchase
        </p>
      )}
    </div>
  );
}
