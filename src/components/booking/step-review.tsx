'use client';

import { useState } from 'react';
import { CalendarDays, Clock, Truck, User, Car, Tag, CheckCircle2, Info, Gift, Coins, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
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
  is_eligible?: boolean;
  ineligibility_reason?: string | null;
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
}: StepReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { enabled: cancellationFeeEnabled } = useFeatureFlag(FEATURE_FLAGS.CANCELLATION_FEE);

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
      <h2 className="text-xl font-semibold text-gray-900">
        Review Your Booking
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Please confirm everything looks correct before booking.
      </p>

      <div className="mt-6 space-y-6">
        {/* Service */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700">Service</h3>
          <p className="mt-1 text-base font-medium text-gray-900">
            {serviceName}
            {tierName && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({tierName})
              </span>
            )}
          </p>
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700">Schedule</h3>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-900">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              {formatDate(date + 'T12:00:00')}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-900">
              <Clock className="h-4 w-4 text-gray-400" />
              {formatTime(time)}
              <span className="text-gray-500">
                ({durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ''}`
                  : `${durationMinutes}m`})
              </span>
            </div>
            {isMobile && mobileAddress && (
              <div className="flex items-start gap-2 text-sm text-gray-900">
                <Truck className="mt-0.5 h-4 w-4 text-gray-400" />
                <span>Mobile: {mobileAddress}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer - only show for guest bookings */}
        {!isPortal && (
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700">Your Info</h3>
            <div className="mt-2 space-y-1.5 text-sm text-gray-900">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                {customer.first_name} {customer.last_name}
              </div>
              <p className="pl-6">{customer.phone}</p>
              <p className="pl-6">{customer.email}</p>
            </div>
          </div>
        )}

        {/* Vehicle */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700">Vehicle</h3>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-900">
            <Car className="h-4 w-4 text-gray-400" />
            <span>
              {[
                vehicle.year,
                vehicle.make,
                vehicle.model,
                vehicle.color,
              ]
                .filter(Boolean)
                .join(' ') || VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || 'Vehicle'}
              {vehicle.size_class && (
                <span className="text-gray-500">
                  {' '}
                  &middot; {VEHICLE_SIZE_LABELS[vehicle.size_class]}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Coupons & Discounts */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-700">Save with a Coupon</h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Apply a coupon code to get a discount on your booking. The discount will be reflected in your total below.
          </p>

          {/* Applied coupon */}
          {appliedCoupon && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Saving {formatCurrency(appliedCoupon.discount)} with <span className="font-mono font-bold">{appliedCoupon.code}</span>
                  </p>
                  <p className="text-xs text-green-700">{appliedCoupon.description}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveCoupon}
                className="text-green-700 hover:text-green-900"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Available coupons */}
          {!appliedCoupon && availableCoupons.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-gray-700">Your Available Coupons</p>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                    These coupons are assigned to your account. Click &quot;Apply&quot; to use one.
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {availableCoupons.map((coupon) => {
                  const details = getCouponDetails(coupon);
                  const isEligible = coupon.is_eligible !== false; // Default to eligible if not specified
                  return (
                    <div
                      key={coupon.id}
                      className={`rounded-lg border border-dashed p-3 ${
                        isEligible
                          ? 'border-purple-200 bg-purple-50/50'
                          : 'border-gray-200 bg-gray-50/50 opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Tag className={`h-4 w-4 flex-shrink-0 ${isEligible ? 'text-purple-500' : 'text-gray-400'}`} />
                            <span className={`font-mono text-sm font-bold ${isEligible ? 'text-gray-900' : 'text-gray-500'}`}>
                              {coupon.code}
                            </span>
                            {!isEligible && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                                Not applicable
                              </Badge>
                            )}
                          </div>
                          {coupon.name && (
                            <p className={`mt-0.5 text-sm ${isEligible ? 'text-gray-700' : 'text-gray-500'}`}>{coupon.name}</p>
                          )}

                          {/* Ineligibility reason */}
                          {!isEligible && coupon.ineligibility_reason && (
                            <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {coupon.ineligibility_reason}
                            </p>
                          )}

                          {/* Detailed description */}
                          <ul className="mt-2 space-y-0.5">
                            {details.map((detail, i) => (
                              <li key={i} className={`text-xs flex items-start gap-1.5 ${isEligible ? 'text-gray-600' : 'text-gray-400'}`}>
                                <span className={`mt-0.5 ${isEligible ? 'text-purple-400' : 'text-gray-300'}`}>•</span>
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
                          disabled={couponLoading || !isEligible}
                          className="flex-shrink-0"
                          title={!isEligible ? coupon.ineligibility_reason || 'Not applicable to selected services' : undefined}
                        >
                          {couponLoading ? <Spinner size="sm" /> : isEligible ? 'Apply' : 'N/A'}
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
                <p className="text-xs font-medium text-gray-700">
                  {availableCoupons.length > 0 ? 'Or enter a different code' : 'Enter a coupon code'}
                </p>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-52 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
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
                  className="flex-1 font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleApplyCoupon(couponInput)}
                  disabled={couponLoading || !couponInput.trim()}
                >
                  {couponLoading ? <Spinner size="sm" /> : 'Apply'}
                </Button>
              </div>
              {couponError && (
                <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  {couponError}
                </p>
              )}
            </div>
          )}

          {/* No coupons message for empty state */}
          {!appliedCoupon && availableCoupons.length === 0 && !couponInput && (
            <p className="mt-2 text-xs text-gray-400 italic">
              Don&apos;t have a code? No problem — you can still complete your booking without one.
            </p>
          )}
        </div>

        {/* Loyalty Points - only for portal users with points */}
        {isPortal && loyaltyPointsBalance >= REDEEM_MINIMUM && (
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-700">Use Your Loyalty Points</h3>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              You have <span className="font-semibold text-amber-600">{loyaltyPointsBalance.toLocaleString()} points</span> worth{' '}
              <span className="font-semibold text-green-600">{formatCurrency(loyaltyPointsValue)}</span>.
              {maxLoyaltyPointsUsable > 0 ? ' Apply them to reduce your total.' : ''}
            </p>

            {maxLoyaltyPointsUsable > 0 ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700">Points to use:</label>
                  <input
                    type="range"
                    min={0}
                    max={maxLoyaltyPointsUsable}
                    step={REDEEM_MINIMUM}
                    value={loyaltyPointsToUse}
                    onChange={(e) => onLoyaltyPointsChange(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <span className="text-sm font-medium text-gray-900 w-20 text-right">
                    {loyaltyPointsToUse.toLocaleString()} pts
                  </span>
                </div>

                {loyaltyPointsToUse > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 p-2">
                    <span className="text-sm text-amber-800">Points discount:</span>
                    <span className="text-sm font-semibold text-amber-800">-{formatCurrency(loyaltyDiscount)}</span>
                  </div>
                )}

                {maxLoyaltyPointsUsable < loyaltyPointsBalance && (
                  <p className="mt-2 text-xs text-amber-600">
                    Only {maxLoyaltyPointsUsable.toLocaleString()} points needed to cover remaining balance.
                  </p>
                )}

                <p className="mt-2 text-xs text-gray-400">
                  Points are redeemed in increments of {REDEEM_MINIMUM}. Each {REDEEM_MINIMUM} points = {formatCurrency(REDEEM_MINIMUM * REDEEM_RATE)} off.
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-2">
                <p className="text-xs text-green-700">
                  Your coupon already covers the remaining balance — no points needed! Your points will be saved for a future visit.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loyalty Points - message for users without enough points */}
        {isPortal && loyaltyPointsBalance > 0 && loyaltyPointsBalance < REDEEM_MINIMUM && (
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-700">
                You have <span className="font-semibold">{loyaltyPointsBalance} points</span>. Earn {REDEEM_MINIMUM - loyaltyPointsBalance} more to redeem for{' '}
                {formatCurrency(REDEEM_MINIMUM * REDEEM_RATE)} off!
              </p>
            </div>
          </div>
        )}

        {/* Payment Options */}
        {requirePayment && (
          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700">Payment Options</h3>
            <div className="mt-3 space-y-3">
              {/* Full payment required for services under $100 */}
              {isFullPaymentRequired ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-900">
                    Full Payment Required: {formatCurrency(grandTotal)}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    For services under $100, full payment is required to secure your appointment.
                  </p>
                </div>
              ) : (
                <>
                  {/* Deposit option */}
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      paymentOption === 'deposit'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="deposit"
                      checked={paymentOption === 'deposit'}
                      onChange={() => onPaymentOptionChange('deposit')}
                      className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(paymentAmount)} Deposit
                        {paymentOption !== 'deposit' && (
                          <span className="ml-2 text-xs font-normal text-blue-600">Recommended</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Pay {formatCurrency(paymentAmount)} now to reserve your spot, remaining {formatCurrency(remainingAmount)} at service
                      </p>
                    </div>
                  </label>

                  {/* Pay on Site - only for existing customers */}
                  {isExistingCustomer && (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        paymentOption === 'pay_on_site'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentOption"
                        value="pay_on_site"
                        checked={paymentOption === 'pay_on_site'}
                        onChange={() => onPaymentOptionChange('pay_on_site')}
                        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Pay on Site</p>
                        <p className="text-xs text-gray-500">
                          No payment now, pay the full amount when we&apos;re done
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Message for new customers */}
                  {!isExistingCustomer && (
                    <p className="text-xs text-gray-500 italic">
                      A deposit is required for first-time customers. Pay on Site option becomes available after your first visit.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Cancellation Disclaimer */}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800">Cancellation & No-Show Policy</p>
                  <p className="text-xs text-amber-700 mt-0.5">
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
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Price Summary
          </h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{serviceName}</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(price)}
              </span>
            </div>
            {addons.map((addon) => (
              <div key={addon.service_id} className="flex justify-between">
                <span className="text-gray-600">{addon.name}</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(addon.price)}
                </span>
              </div>
            ))}
            {mobileSurcharge > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Mobile surcharge</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(mobileSurcharge)}
                </span>
              </div>
            )}
            {appliedCoupon && appliedCoupon.discount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Coupon ({appliedCoupon.code})</span>
                <span className="font-medium">-{formatCurrency(appliedCoupon.discount)}</span>
              </div>
            )}
            {loyaltyPointsToUse > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Loyalty Points ({loyaltyPointsToUse.toLocaleString()} pts)</span>
                <span className="font-medium">-{formatCurrency(loyaltyDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            {/* Payment breakdown */}
            {requirePayment && paymentOption !== 'pay_on_site' && (
              <>
                <div className="flex justify-between pt-1 text-blue-700">
                  <span>{isFullPaymentRequired ? 'Amount Due' : 'Deposit now'}</span>
                  <span className="font-medium">{formatCurrency(paymentAmount)}</span>
                </div>
                {!isFullPaymentRequired && (
                  <div className="flex justify-between text-gray-500">
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Terms & Conditions Agreement */}
        <div className="rounded-lg border border-gray-200 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">
              I agree to the{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-700 underline"
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
          >
            Back
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !agreedToTerms}>
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
