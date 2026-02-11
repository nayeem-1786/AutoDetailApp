'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { LOYALTY, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { useQuote } from '../../context/quote-context';

export function QuoteLoyaltyPanel() {
  const { quote, dispatch } = useQuote();
  const [redeeming, setRedeeming] = useState(false);
  const { enabled: loyaltyEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.LOYALTY_REWARDS);

  const customer = quote.customer;
  const balance = customer?.loyalty_points_balance ?? 0;
  const canRedeem = balance >= LOYALTY.REDEEM_MINIMUM;
  const redeemDiscount = Math.round(balance * LOYALTY.REDEEM_RATE * 100) / 100;
  const isRedeeming = quote.loyaltyPointsToRedeem > 0;

  useEffect(() => {
    if (!customer && isRedeeming) {
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
    }
  }, [customer, isRedeeming, dispatch]);

  if (!customer || flagLoading || !loyaltyEnabled) return null;

  function handleToggleRedeem() {
    if (isRedeeming) {
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
      setRedeeming(false);
    } else if (canRedeem) {
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
    </div>
  );
}
