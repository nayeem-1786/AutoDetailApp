'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarDays, Clock, Truck, User, Car, Bike, Ship, Plane, Tag, CheckCircle2, Info, Gift, Coins, AlertTriangle, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/format';
import { VEHICLE_SIZE_LABELS, VEHICLE_TYPE_LABELS, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';

interface AvailableCoupon {
  id: string;
  code: string;
  name: string | null;
  min_purchase: number | null;
  expires_at: string | null;
  is_single_use: boolean;
  coupon_rewards: {
    applies_to: string;
    discount_type: string;
    discount_value: number;
    max_discount: number | null;
  }[];
}

interface AppliedCoupon {
  code: string;
  discount: number;
  description: string;
}

interface StepReviewProps {
  serviceName: string;
  serviceId: string;
  tierName: string | null;
  price: number;
  date: string;
  time: string;
  durationMinutes: number;
  isMobile: boolean;
  mobileAddress: string | null;
  mobileSurcharge: number;
  customer: BookingCustomerInput;
  vehicle: BookingVehicleInput;
  addons: BookingAddonInput[];
  couponCode?: string | null;
  onConfirm: () => void | Promise<void>;
  onBack: () => void;
  confirmButtonText?: string;
  // Payment options props
  isPortal: boolean;
  isExistingCustomer: boolean;
  paymentOption: 'deposit' | 'pay_on_site' | null;
  onPaymentOptionChange: (option: 'deposit' | 'pay_on_site') => void;
  appliedCoupon: AppliedCoupon | null;
  onCouponApply: (coupon: AppliedCoupon | null) => void;
  availableCoupons: AvailableCoupon[];
  requirePayment: boolean;
  // Loyalty points props
  loyaltyPointsBalance: number;
  loyaltyPointsToUse: number;
  onLoyaltyPointsChange: (points: number) => void;
  // Edit from review
  onEditService?: () => void;
  onEditSchedule?: () => void;
  onEditInfo?: () => void;
  // URL coupon auto-apply
  autoApplyCouponOnMount?: boolean;
  onCouponAutoApplyAttempted?: () => void;
}

export function StepReview({
  serviceName,
  serviceId,
  tierName,
  price,
  date,
  time,
  durationMinutes,
  isMobile,
  mobileAddress,
  mobileSurcharge,
  customer,
  vehicle,
  addons,
  couponCode,
  onConfirm,
  onBack,
  confirmButtonText = 'Confirm Booking',
  isPortal,
  isExistingCustomer,
  paymentOption,
  onPaymentOptionChange,
  appliedCoupon,
  onCouponApply,
  availableCoupons,
  requirePayment,
  loyaltyPointsBalance,
  loyaltyPointsToUse,
  onLoyaltyPointsChange,
  onEditService,
  onEditSchedule,
  onEditInfo,
  autoApplyCouponOnMount,
  onCouponAutoApplyAttempted,
}: StepReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { enabled: cancellationFeeEnabled } = useFeatureFlag(FEATURE_FLAGS.CANCELLATION_FEE);

  // Auto-apply coupon from URL on mount
  const couponAutoApplyRef = useRef(false);
  useEffect(() => {
    if (autoApplyCouponOnMount && couponCode && !appliedCoupon && !couponAutoApplyRef.current) {
      couponAutoApplyRef.current = true;
      onCouponAutoApplyAttempted?.();
      handleApplyCoupon(couponCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loyalty points constants
  const REDEEM_RATE = 0.05; // $0.05 per point
  const REDEEM_MINIMUM = 100; // Minimum 100 points to redeem

  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  const subtotal = price + addonTotal + mobileSurcharge;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const loyaltyDiscount = loyaltyPointsToUse * REDEEM_RATE;
  const grandTotal = Math.max(0, subtotal - couponDiscount - loyaltyDiscount);

  // Payment logic: Under $100 = full payment, $100+ = $50 deposit
  const isFullPaymentRequired = grandTotal < 100;
  const paymentAmount = isFullPaymentRequired ? grandTotal : 50;
  const remainingAmount = grandTotal - paymentAmount;

  // Calculate max loyalty points that can be used (can't exceed what they have or what would make total negative)
  // Round down to nearest REDEEM_MINIMUM so the slider can reach the max
  const maxLoyaltyPointsRaw = Math.min(
    loyaltyPointsBalance,
    Math.floor((subtotal - couponDiscount) / REDEEM_RATE)
  );
  const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / REDEEM_MINIMUM) * REDEEM_MINIMUM;
  const loyaltyPointsValue = loyaltyPointsBalance * REDEEM_RATE;

  // Validate and apply coupon
  async function handleApplyCoupon(code: string) {
    if (!code.trim()) return;

    setCouponLoading(true);
    setCouponError(null);

    try {
      const services = [
        { service_id: serviceId, name: serviceName, price },
        ...addons.map((a) => ({
          service_id: a.service_id,
          name: a.name,
          price: a.price,
        })),
      ];

      const res = await fetch('/api/book/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          subtotal,
          phone: customer.phone,
          email: customer.email,
          services,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setCouponError(result.error || 'Invalid coupon');
        return;
      }

      onCouponApply({
        code: result.data.code,
        discount: result.data.total_discount,
        description: result.data.description,
      });
      setCouponInput('');
    } catch (err) {
      setCouponError('Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    onCouponApply(null);
    setCouponError(null);
  }

  // Format reward label for available coupons
  function rewardLabel(reward: AvailableCoupon['coupon_rewards'][number]): string {
    const target = reward.applies_to === 'order' ? 'your order' :
                   reward.applies_to === 'service' ? 'services' : 'products';

    if (reward.discount_type === 'free') return `Free ${target}`;
    if (reward.discount_type === 'percentage') {
      const cap = reward.max_discount ? ` (max ${formatCurrency(reward.max_discount)})` : '';
      return `${reward.discount_value}% off ${target}${cap}`;
    }
    return `${formatCurrency(reward.discount_value)} off ${target}`;
  }

  // Build detailed description for a coupon
  function getCouponDetails(coupon: AvailableCoupon): string[] {
    const details: string[] = [];

    // Add reward descriptions
    coupon.coupon_rewards.forEach((r) => {
      details.push(rewardLabel(r));
    });

    // Add restrictions
    if (coupon.min_purchase && coupon.min_purchase > 0) {
      details.push(`Requires ${formatCurrency(coupon.min_purchase)} minimum purchase`);
    }
    if (coupon.is_single_use) {
      details.push('One-time use only');
    }
    if (coupon.expires_at) {
      const expiryDate = new Date(coupon.expires_at);
      const now = new Date();
      const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        details.push(`Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`);
      } else {
        details.push(`Expires ${formatDate(coupon.expires_at)}`);
      }
    }

    return details;
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-site-text">
        Review Your Booking
      </h2>
      <p className="mt-1 text-sm text-site-text-secondary">
        Please confirm everything looks correct before booking.
      </p>

      <div className="mt-6 space-y-6">
        {/* Service */}
        <div className="rounded-lg border border-site-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-site-text-secondary">Service</h3>
            {onEditService && (
              <button
                type="button"
                onClick={onEditService}
                className="flex items-center gap-1 text-xs text-lime hover:text-lime-200 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>
          <p className="mt-1 text-base font-medium text-site-text">
            {serviceName}
            {tierName && (
              <span className="ml-2 text-sm font-normal text-site-text-muted">
                ({tierName})
              </span>
            )}
          </p>
          {addons.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-site-text-muted">Add-ons:</p>
              <ul className="mt-0.5 space-y-0.5">
                {addons.map((addon) => (
                  <li key={addon.service_id} className="text-sm text-site-text-secondary flex items-center gap-1.5">
                    <span className="text-site-text-dim">&bull;</span>
                    {addon.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-site-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-site-text-secondary">Schedule</h3>
            {onEditSchedule && (
              <button
                type="button"
                onClick={onEditSchedule}
                className="flex items-center gap-1 text-xs text-lime hover:text-lime-200 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm text-site-text">
              <CalendarDays className="h-4 w-4 text-site-text-muted" />
              {formatDate(date + 'T12:00:00')}
            </div>
            <div className="flex items-center gap-2 text-sm text-site-text">
              <Clock className="h-4 w-4 text-site-text-muted" />
              {formatTime(time)}
              <span className="text-site-text-muted">
                ({durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ''}`
                  : `${durationMinutes}m`})
              </span>
            </div>
            {isMobile && mobileAddress && (
              <div className="flex items-start gap-2 text-sm text-site-text">
                <Truck className="mt-0.5 h-4 w-4 text-site-text-muted" />
                <span>Mobile: {mobileAddress}</span>
              </div>
            )}
          </div>
        </div>

        {/* Your Information (Customer + Vehicle combined) */}
        <div className="rounded-lg border border-site-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-site-text-secondary">Your Information</h3>
            {onEditInfo && (
              <button
                type="button"
                onClick={onEditInfo}
                className="flex items-center gap-1 text-xs text-lime hover:text-lime-200 transition-colors"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>

          {/* Contact info - only show for guest bookings */}
          {!isPortal && (
            <div className="mt-2 space-y-1.5 text-sm text-site-text">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-site-text-muted" />
                {customer.first_name} {customer.last_name}
              </div>
              <p className="pl-6">{customer.email} &middot; {customer.phone}</p>
            </div>
          )}

          {/* Vehicle */}
          <div className={`${!isPortal ? 'mt-3 pt-3 border-t border-site-border' : 'mt-2'} flex items-center gap-2 text-sm text-site-text`}>
            {(() => {
              const cat = vehicle.vehicle_category ?? (vehicle.vehicle_type === 'standard' ? 'automobile' : vehicle.vehicle_type);
              const IconComponent = cat === 'motorcycle' ? Bike
                : cat === 'rv' ? Truck
                : cat === 'boat' ? Ship
                : cat === 'aircraft' ? Plane
                : Car;
              return <IconComponent className="h-4 w-4 text-site-text-muted" />;
            })()}
            <span>
              {[
                vehicle.year,
                vehicle.make,
                vehicle.model,
              ]
                .filter(Boolean)
                .join(' ') || VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || 'Vehicle'}
              {vehicle.color && <span className="text-site-text-muted">, {vehicle.color}</span>}
              {vehicle.size_class && (
                <span className="text-site-text-muted">
                  {' '}
                  &middot; {VEHICLE_SIZE_LABELS[vehicle.size_class]}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Coupons & Discounts */}
        <div className="rounded-lg border border-site-border p-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-site-text-secondary">Save with a Coupon</h3>
          </div>
          <p className="mt-1 text-xs text-site-text-muted">
            Apply a coupon code to get a discount on your booking. The discount will be reflected in your total below.
          </p>

          {/* Applied coupon */}
          {appliedCoupon && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-300">
                    Saving {formatCurrency(appliedCoupon.discount)} with <span className="font-mono font-bold">{appliedCoupon.code}</span>
                  </p>
                  <p className="text-xs text-green-400">{appliedCoupon.description}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveCoupon}
                className="text-green-400 hover:text-green-300 hover:bg-green-500/10 dark:text-green-400 dark:hover:text-green-300"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Available coupons */}
          {!appliedCoupon && availableCoupons.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-site-text-secondary">Your Available Coupons</p>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-site-text-muted cursor-help" />
                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-48 p-2 bg-brand-grey text-site-text text-xs rounded shadow-lg z-10">
                    These coupons are assigned to your account. Click &quot;Apply&quot; to use one.
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {availableCoupons.map((coupon) => {
                  const details = getCouponDetails(coupon);
                  return (
                    <div
                      key={coupon.id}
                      className="rounded-lg border border-dashed border-purple-500/30 bg-purple-500/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 flex-shrink-0 text-purple-500" />
                            <span className="font-mono text-sm font-bold text-site-text">
                              {coupon.code}
                            </span>
                          </div>
                          {coupon.name && (
                            <p className="mt-0.5 text-sm text-site-text-secondary">{coupon.name}</p>
                          )}
                          <ul className="mt-2 space-y-0.5">
                            {details.map((detail, i) => (
                              <li key={i} className="text-xs flex items-start gap-1.5 text-site-text-secondary">
                                <span className="mt-0.5 text-purple-400">•</span>
                                {detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyCoupon(coupon.code)}
                          disabled={couponLoading}
                          className="flex-shrink-0 border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
                        >
                          {couponLoading ? <Spinner size="sm" /> : 'Apply'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Coupon code input */}
          {!appliedCoupon && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-site-text-secondary">
                  {availableCoupons.length > 0 ? 'Or enter a different code' : 'Enter a coupon code'}
                </p>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-site-text-muted cursor-help" />
                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-brand-grey text-site-text text-xs rounded shadow-lg z-10">
                    Enter a coupon code you received via email, SMS, or from our team. Some coupons may require specific services or minimum purchase.
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="e.g., SAVE20"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  className="flex-1 font-mono border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text dark:placeholder:text-site-text-dim"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleApplyCoupon(couponInput)}
                  disabled={couponLoading || !couponInput.trim()}
                  className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
                >
                  {couponLoading ? <Spinner size="sm" /> : 'Apply'}
                </Button>
              </div>
              {couponError && (
                <p className="mt-1.5 text-xs text-red-400 flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  {couponError}
                </p>
              )}
            </div>
          )}

          {/* No coupons message for empty state */}
          {!appliedCoupon && availableCoupons.length === 0 && !couponInput && (
            <p className="mt-2 text-xs text-site-text-muted italic">
              Don&apos;t have a code? No problem — you can still complete your booking without one.
            </p>
          )}
        </div>

        {/* Loyalty Points - only for portal users with points */}
        {isPortal && loyaltyPointsBalance >= REDEEM_MINIMUM && (
          <div className="rounded-lg border border-site-border p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-site-text-secondary">Use Your Loyalty Points</h3>
            </div>
            <p className="mt-1 text-xs text-site-text-muted">
              You have <span className="font-semibold text-amber-400">{loyaltyPointsBalance.toLocaleString()} points</span> worth{' '}
              <span className="font-semibold text-green-400">{formatCurrency(loyaltyPointsValue)}</span>.
              {maxLoyaltyPointsUsable > 0 ? ' Apply them to reduce your total.' : ''}
            </p>

            {maxLoyaltyPointsUsable > 0 ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-site-text-secondary">Points to use:</label>
                  <input
                    type="range"
                    min={0}
                    max={maxLoyaltyPointsUsable}
                    step={REDEEM_MINIMUM}
                    value={loyaltyPointsToUse}
                    onChange={(e) => onLoyaltyPointsChange(Number(e.target.value))}
                    className="flex-1 h-2 bg-brand-surface rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="text-sm font-medium text-site-text w-20 text-right">
                    {loyaltyPointsToUse.toLocaleString()} pts
                  </span>
                </div>

                {loyaltyPointsToUse > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
                    <span className="text-sm text-amber-300">Points discount:</span>
                    <span className="text-sm font-semibold text-amber-300">-{formatCurrency(loyaltyDiscount)}</span>
                  </div>
                )}

                {maxLoyaltyPointsUsable < loyaltyPointsBalance && (
                  <p className="mt-2 text-xs text-amber-400">
                    Only {maxLoyaltyPointsUsable.toLocaleString()} points needed to cover remaining balance.
                  </p>
                )}

                <p className="mt-2 text-xs text-site-text-muted">
                  Points are redeemed in increments of {REDEEM_MINIMUM}. Each {REDEEM_MINIMUM} points = {formatCurrency(REDEEM_MINIMUM * REDEEM_RATE)} off.
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-green-500/10 border border-green-500/30 p-2">
                <p className="text-xs text-green-400">
                  Your coupon already covers the remaining balance — no points needed! Your points will be saved for a future visit.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loyalty Points - message for users without enough points */}
        {isPortal && loyaltyPointsBalance > 0 && loyaltyPointsBalance < REDEEM_MINIMUM && (
          <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-400">
                You have <span className="font-semibold">{loyaltyPointsBalance} points</span>. Earn {REDEEM_MINIMUM - loyaltyPointsBalance} more to redeem for{' '}
                {formatCurrency(REDEEM_MINIMUM * REDEEM_RATE)} off!
              </p>
            </div>
          </div>
        )}

        {/* Payment Options */}
        {requirePayment && (
          <div className="rounded-lg border border-site-border p-4">
            <h3 className="text-sm font-semibold text-site-text-secondary">Payment Options</h3>
            <div className="mt-3 space-y-3">
              {/* Full payment required for services under $100 */}
              {isFullPaymentRequired ? (
                <div className="rounded-lg border border-lime/30 bg-brand-surface p-3">
                  <p className="text-sm font-medium text-lime">
                    Full Payment Required: {formatCurrency(grandTotal)}
                  </p>
                  <p className="text-xs text-lime/80 mt-1">
                    For services under $100, full payment is required to secure your appointment.
                  </p>
                </div>
              ) : (
                <>
                  {/* Deposit option */}
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      paymentOption === 'deposit'
                        ? 'border-lime bg-brand-surface'
                        : 'border-site-border hover:border-site-border-medium'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="deposit"
                      checked={paymentOption === 'deposit'}
                      onChange={() => onPaymentOptionChange('deposit')}
                      className="mt-0.5 h-4 w-4 text-lime focus:ring-lime"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-site-text">
                        {formatCurrency(paymentAmount)} Deposit
                        {paymentOption !== 'deposit' && (
                          <span className="ml-2 text-xs font-normal text-lime">Recommended</span>
                        )}
                      </p>
                      <p className="text-xs text-site-text-muted">
                        Pay {formatCurrency(paymentAmount)} now to reserve your spot, remaining {formatCurrency(remainingAmount)} at service
                      </p>
                    </div>
                  </label>

                  {/* Pay on Site - only for existing customers */}
                  {isExistingCustomer && (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        paymentOption === 'pay_on_site'
                          ? 'border-lime bg-brand-surface'
                          : 'border-site-border hover:border-site-border-medium'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentOption"
                        value="pay_on_site"
                        checked={paymentOption === 'pay_on_site'}
                        onChange={() => onPaymentOptionChange('pay_on_site')}
                        className="mt-0.5 h-4 w-4 text-lime focus:ring-lime"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-site-text">Pay on Site</p>
                        <p className="text-xs text-site-text-muted">
                          No payment now, pay the full amount when we&apos;re done
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Message for new customers */}
                  {!isExistingCustomer && (
                    <p className="text-xs text-site-text-muted italic">
                      A deposit is required for first-time customers. Pay on Site option becomes available after your first visit.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Cancellation Disclaimer */}
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-300">Cancellation & No-Show Policy</p>
                  <p className="text-xs text-amber-400 mt-0.5">
                    {cancellationFeeEnabled
                      ? <>Cancellations must be made at least 24 hours before your appointment. Late cancellations or no-shows will be charged a <span className="font-semibold">$50 fee</span>.</>
                      : 'Cancellations must be made at least 24 hours before your appointment.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Price Breakdown */}
        <div className="rounded-lg bg-brand-surface p-4">
          <h3 className="text-sm font-semibold text-site-text-secondary">
            Price Summary
          </h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-site-text-secondary">{serviceName}</span>
              <span className="font-medium text-site-text">
                {formatCurrency(price)}
              </span>
            </div>
            {addons.map((addon) => (
              <div key={addon.service_id} className="flex justify-between">
                <span className="text-site-text-secondary">{addon.name}</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(addon.price)}
                </span>
              </div>
            ))}
            {mobileSurcharge > 0 && (
              <div className="flex justify-between">
                <span className="text-site-text-secondary">Mobile surcharge</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(mobileSurcharge)}
                </span>
              </div>
            )}
            {appliedCoupon && appliedCoupon.discount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Coupon ({appliedCoupon.code})</span>
                <span className="font-medium">-{formatCurrency(appliedCoupon.discount)}</span>
              </div>
            )}
            {loyaltyPointsToUse > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Loyalty Points ({loyaltyPointsToUse.toLocaleString()} pts)</span>
                <span className="font-medium">-{formatCurrency(loyaltyDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-site-border pt-2 text-base font-semibold text-site-text">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            {/* Payment breakdown */}
            {requirePayment && paymentOption !== 'pay_on_site' && (
              <>
                <div className="flex justify-between pt-1 text-lime">
                  <span>{isFullPaymentRequired ? 'Amount Due' : 'Deposit now'}</span>
                  <span className="font-medium">{formatCurrency(paymentAmount)}</span>
                </div>
                {!isFullPaymentRequired && (
                  <div className="flex justify-between text-site-text-muted">
                    <span>Due at service</span>
                    <span className="font-medium">{formatCurrency(remainingAmount)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Terms & Conditions Agreement */}
        <div className="rounded-lg border border-site-border p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
            />
            <span className="text-sm text-site-text-secondary">
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime hover:text-lime-200 underline"
                onClick={(e) => e.stopPropagation()}
              >
                Terms &amp; Conditions
              </a>
            </span>
          </label>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={submitting}
            className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
          >
            Back
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !agreedToTerms} className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200">
            {submitting ? (
              <>
                <Spinner size="sm" className="text-white" />
                Processing...
              </>
            ) : (
              confirmButtonText
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
