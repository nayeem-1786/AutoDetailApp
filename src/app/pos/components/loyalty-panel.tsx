'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { LOYALTY, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { useTicket } from '../context/ticket-context';

export function LoyaltyPanel() {
  const { ticket, dispatch } = useTicket();
  const [_redeeming, setRedeeming] = useState(false);
  const { enabled: loyaltyEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.LOYALTY_REWARDS);

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

  if (!customer || flagLoading || !loyaltyEnabled) return null;

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
    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm">
          <Star className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
          <span className="font-medium text-amber-800 dark:text-amber-300">
            {balance} pts
          </span>
          {canRedeem && !isRedeeming && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
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
                ? 'bg-amber-200 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 hover:bg-amber-300 dark:hover:bg-amber-800/50'
                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
            )}
          >
            {isRedeeming ? `Redeeming -$${redeemDiscount.toFixed(2)}` : 'Redeem'}
          </button>
        )}
      </div>

      {earnPreview > 0 && !isRedeeming && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Will earn ~{earnPreview} pts from this purchase
        </p>
      )}
    </div>
  );
}
