'use client';

import { useState, useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { LOYALTY, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { useTicket } from '../context/ticket-context';

export function LoyaltyPanel() {
  const { ticket, dispatch } = useTicket();
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { enabled: loyaltyEnabled, loading: flagLoading } = useFeatureFlag(FEATURE_FLAGS.LOYALTY_REWARDS);

  const customer = ticket.customer;
  const balance = customer?.loyalty_points_balance ?? 0;
  const canRedeem = balance >= LOYALTY.REDEEM_MINIMUM;
  const fullDollarValue = Math.round(balance * LOYALTY.REDEEM_RATE * 100) / 100;
  const isRedeeming = ticket.loyaltyPointsToRedeem > 0;

  // Max redemption: lesser of balance value or ticket total
  const maxRedemption = Math.min(fullDollarValue, ticket.total + ticket.loyaltyDiscount);

  // Preview earned points
  const earnPreview = Math.floor(ticket.subtotal * LOYALTY.EARN_RATE);

  // Reset loyalty redeem if customer changes
  useEffect(() => {
    if (!customer && isRedeeming) {
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
    }
  }, [customer, isRedeeming, dispatch]);

  // Focus input when opened
  useEffect(() => {
    if (showInput) {
      inputRef.current?.select();
    }
  }, [showInput]);

  if (!customer || flagLoading || !loyaltyEnabled) return null;

  function handleApplyClick() {
    if (isRedeeming) {
      // Clear redemption
      dispatch({ type: 'SET_LOYALTY_REDEEM', points: 0, discount: 0 });
      setShowInput(false);
      return;
    }
    if (!canRedeem) return;
    // Open input with default = max
    setInputValue(maxRedemption.toFixed(2));
    setShowInput(true);
  }

  function handleConfirm() {
    const dollarAmount = parseFloat(inputValue) || 0;
    if (dollarAmount <= 0) {
      setShowInput(false);
      return;
    }

    // Clamp to max
    const clamped = Math.min(dollarAmount, maxRedemption);
    // Convert to points: dollars / rate
    const pointsToRedeem = Math.ceil(clamped / LOYALTY.REDEEM_RATE);
    // Actual discount (may be slightly adjusted by rounding)
    const actualDiscount = Math.round(Math.min(pointsToRedeem * LOYALTY.REDEEM_RATE, maxRedemption) * 100) / 100;

    dispatch({
      type: 'SET_LOYALTY_REDEEM',
      points: Math.min(pointsToRedeem, balance),
      discount: actualDiscount,
    });
    setShowInput(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setShowInput(false);
  }

  const minDollars = LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE;

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
              (worth ${fullDollarValue.toFixed(2)})
            </span>
          )}
          {!canRedeem && (
            <span className="text-xs text-amber-600/60 dark:text-amber-400/60">
              (Need {LOYALTY.REDEEM_MINIMUM} pts / ${minDollars.toFixed(2)} min)
            </span>
          )}
        </div>

        {canRedeem && (
          <button
            onClick={handleApplyClick}
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium transition-colors',
              isRedeeming
                ? 'bg-amber-200 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 hover:bg-amber-300 dark:hover:bg-amber-800/50'
                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
            )}
          >
            {isRedeeming ? `Clear -$${ticket.loyaltyDiscount.toFixed(2)}` : 'Redeem'}
          </button>
        )}
      </div>

      {/* Partial redemption input */}
      {showInput && !isRedeeming && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-amber-700 dark:text-amber-400">$</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              setInputValue(v);
            }}
            onKeyDown={handleKeyDown}
            className="h-8 w-20 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-amber-400 dark:focus:ring-amber-600"
            autoFocus
          />
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            max ${maxRedemption.toFixed(2)}
          </span>
          <button
            onClick={handleConfirm}
            className="rounded bg-amber-500 dark:bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600 dark:hover:bg-amber-500"
          >
            Apply
          </button>
          <button
            onClick={() => setShowInput(false)}
            className="rounded px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          >
            Cancel
          </button>
        </div>
      )}

      {isRedeeming && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Redeeming {ticket.loyaltyPointsToRedeem} pts for -${ticket.loyaltyDiscount.toFixed(2)} discount
        </p>
      )}

      {earnPreview > 0 && !isRedeeming && !showInput && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Will earn ~{earnPreview} pts from this purchase
        </p>
      )}
    </div>
  );
}
