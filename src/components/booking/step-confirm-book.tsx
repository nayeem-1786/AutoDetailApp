'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatDate, formatTime, formatPhone } from '@/lib/utils/format';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { isSpecialtyCategory, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StepPayment } from './step-payment';
import { InlineAuth, type AuthCustomerData } from './inline-auth';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import {
  Gift,
  CheckCircle2,
  Info,
  Tag,
  Coins,
  AlertTriangle,
  ChevronDown,
  CalendarDays,
  Clock,
  Truck,
} from 'lucide-react';

// --- Types ---

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

export interface StepConfirmBookProps {
  // Service data
  serviceName: string;
  serviceId: string;
  tierName: string | null;
  price: number;
  durationMinutes: number;
  isMobile: boolean;
  mobileAddress: string | null;
  mobileSurcharge: number;
  addons: BookingAddonInput[];
  date: string;
  time: string;
  // Coupon
  couponCode: string | null;
  appliedCoupon: AppliedCoupon | null;
  onCouponApply: (coupon: AppliedCoupon | null) => void;
  availableCoupons: AvailableCoupon[];
  // Auth / Customer
  isPortal: boolean;
  isExistingCustomer: boolean;
  hasTransactionHistory: boolean;
  customerData: AuthCustomerData | null;
  onAuthComplete: (data: AuthCustomerData) => void;
  onSignOut: () => void;
  // Loyalty
  loyaltyPointsBalance: number;
  loyaltyPointsToUse: number;
  onLoyaltyPointsChange: (points: number) => void;
  // Payment
  requirePayment: boolean;
  paymentOption: 'full' | 'deposit' | 'pay_on_site' | null;
  onPaymentOptionChange: (option: 'full' | 'deposit' | 'pay_on_site') => void;
  // Actions
  onConfirm: (customer: BookingCustomerInput, vehicle: BookingVehicleInput, paymentIntentId?: string) => void | Promise<void>;
  onBack: () => void;
  // Auto-apply URL coupon
  autoApplyCouponOnMount?: boolean;
  onCouponAutoApplyAttempted?: () => void;
  // Vehicle category from Step 1
  vehicleCategory: string;
  selectedSizeClass: VehicleSizeClass | null;
}

// --- Component ---

export function StepConfirmBook({
  serviceName,
  serviceId,
  tierName,
  price,
  durationMinutes,
  isMobile,
  mobileAddress,
  mobileSurcharge,
  addons,
  date,
  time,
  couponCode,
  appliedCoupon,
  onCouponApply,
  availableCoupons,
  isPortal,
  isExistingCustomer,
  hasTransactionHistory,
  customerData,
  onAuthComplete,
  onSignOut,
  loyaltyPointsBalance,
  loyaltyPointsToUse,
  onLoyaltyPointsChange,
  requirePayment,
  paymentOption,
  onPaymentOptionChange,
  onConfirm,
  onBack,
  autoApplyCouponOnMount,
  onCouponAutoApplyAttempted,
  vehicleCategory,
  selectedSizeClass,
}: StepConfirmBookProps) {
  // --- State ---
  const [businessName, setBusinessName] = useState('our business');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToAll, setAgreedToAll] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Track whether user is authenticated (portal or inline auth completed)
  const isAuthenticated = isPortal || !!customerData;

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

  // Fetch business name
  useEffect(() => {
    fetch('/api/public/business-info')
      .then((res) => res.json())
      .then((data) => { if (data?.name) setBusinessName(data.name); })
      .catch(() => {});
  }, []);

  // --- Price calculations ---
  const REDEEM_RATE = 0.05;
  const REDEEM_MINIMUM = 100;

  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  const subtotal = price + addonTotal + mobileSurcharge;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const loyaltyDiscount = loyaltyPointsToUse * REDEEM_RATE;
  const grandTotal = Math.max(0, subtotal - couponDiscount - loyaltyDiscount);

  const isFullPaymentRequired = grandTotal < 100;
  const depositAmount = 50;
  // Payment amount based on selected option
  const paymentAmount = paymentOption === 'full' ? grandTotal
    : paymentOption === 'deposit' ? depositAmount
    : 0;
  const remainingAmount = paymentOption === 'deposit' ? grandTotal - depositAmount : 0;

  const maxLoyaltyPointsRaw = Math.min(
    loyaltyPointsBalance,
    Math.floor((subtotal - couponDiscount) / REDEEM_RATE)
  );
  const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / REDEEM_MINIMUM) * REDEEM_MINIMUM;
  const loyaltyPointsValue = loyaltyPointsBalance * REDEEM_RATE;

  // Loyalty-related flags
  const hasLoyaltyDiscount = loyaltyPointsToUse > 0 && loyaltyDiscount > 0;
  const pointsCoverOrder = grandTotal <= 0;

  // Determine if Stripe needed
  const STRIPE_MINIMUM = 0.50;
  const discountsCoverAmount = grandTotal < STRIPE_MINIMUM;
  const needsStripePayment = requirePayment && paymentOption !== 'pay_on_site' && paymentOption !== null && !discountsCoverAmount && grandTotal > 0 && !pointsCoverOrder;

  // Auto-switch from deposit when it becomes hidden (returning customer or loyalty active)
  useEffect(() => {
    if ((hasTransactionHistory || hasLoyaltyDiscount) && paymentOption === 'deposit') {
      onPaymentOptionChange('full');
    }
  }, [hasTransactionHistory, hasLoyaltyDiscount, paymentOption, onPaymentOptionChange]);

  // --- Coupon ---
  async function handleApplyCoupon(code: string) {
    if (!code.trim()) return;
    setCouponLoading(true);
    setCouponError(null);

    try {
      const customerPhone = customerData?.customer.phone ?? '';
      const customerEmail = customerData?.customer.email ?? '';
      const services = [
        { service_id: serviceId, name: serviceName, price },
        ...addons.map((a) => ({ service_id: a.service_id, name: a.name, price: a.price })),
      ];

      const res = await fetch('/api/book/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          subtotal,
          phone: customerPhone,
          email: customerEmail,
          services,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setCouponError(result.error || 'Invalid coupon');
        // If auto-apply failed, expand the section
        if (autoApplyCouponOnMount && !couponExpanded) {
          setCouponExpanded(true);
        }
        return;
      }

      onCouponApply({
        code: result.data.code,
        discount: result.data.total_discount,
        description: result.data.description,
      });
      setCouponInput('');
    } catch {
      setCouponError('Failed to validate coupon');
      if (autoApplyCouponOnMount && !couponExpanded) {
        setCouponExpanded(true);
      }
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    onCouponApply(null);
    setCouponError(null);
  }

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

  function getCouponDetails(coupon: AvailableCoupon): string[] {
    const details: string[] = [];
    coupon.coupon_rewards.forEach((r) => { details.push(rewardLabel(r)); });
    if (coupon.min_purchase && coupon.min_purchase > 0) {
      details.push(`Requires ${formatCurrency(coupon.min_purchase)} minimum purchase`);
    }
    if (coupon.is_single_use) details.push('One-time use only');
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

  // --- Vehicle construction ---
  function buildVehicle(): BookingVehicleInput {
    const cat = vehicleCategory as VehicleCategory;
    const specialty = isSpecialtyCategory(cat);
    return {
      vehicle_category: cat,
      vehicle_type: specialty ? cat : 'standard',
      size_class: selectedSizeClass ?? null,
      specialty_tier: null,
      year: null,
      make: null,
      model: null,
      color: null,
    } as BookingVehicleInput;
  }

  // --- Submit ---
  async function handleBookingSubmit() {
    if (!agreedToAll || !customerData) return;

    const customer: BookingCustomerInput = {
      first_name: customerData.customer.first_name,
      last_name: customerData.customer.last_name,
      phone: formatPhone(customerData.customer.phone),
      email: customerData.customer.email,
      sms_consent: true,
      email_consent: true,
    };

    // If Stripe payment needed, show inline payment form
    if (needsStripePayment && !showPaymentForm) {
      setShowPaymentForm(true);
      return;
    }

    // No payment needed — submit directly
    setSubmitting(true);
    setError(null);
    try {
      const vehicle = buildVehicle();
      await onConfirm(customer, vehicle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePaymentSuccess(paymentIntentId: string) {
    if (!customerData) return;
    const customer: BookingCustomerInput = {
      first_name: customerData.customer.first_name,
      last_name: customerData.customer.last_name,
      phone: formatPhone(customerData.customer.phone),
      email: customerData.customer.email,
      sms_consent: true,
      email_consent: true,
    };
    const vehicle = buildVehicle();
    onConfirm(customer, vehicle, paymentIntentId);
  }

  // --- Render helpers ---
  const getCtaText = () => {
    if (submitting) return null;
    if (needsStripePayment && showPaymentForm) return null;
    if (pointsCoverOrder) return 'Confirm Booking';
    if (requirePayment && paymentOption !== 'pay_on_site' && !discountsCoverAmount && paymentAmount > 0) {
      return `Pay ${formatCurrency(paymentAmount)} & Book My Detail`;
    }
    return 'Book My Detail';
  };

  const canSubmit = agreedToAll && !submitting && isAuthenticated &&
    (pointsCoverOrder || (requirePayment ? (discountsCoverAmount || paymentOption !== null) : true));

  // Reset payment form when switching payment options
  const handlePaymentOptionSwitch = (option: 'full' | 'deposit' | 'pay_on_site') => {
    onPaymentOptionChange(option);
    setShowPaymentForm(false);
  };

  // --- Order Summary renderer ---
  const renderOrderSummary = () => (
    <div className="space-y-2 text-sm">
      {/* Appointment info */}
      <div className="space-y-1.5 pb-3 border-b border-site-border">
        <div className="flex items-center gap-2 text-site-text">
          <CalendarDays className="h-4 w-4 text-site-text-muted" />
          {formatDate(date + 'T12:00:00')}
        </div>
        <div className="flex items-center gap-2 text-site-text">
          <Clock className="h-4 w-4 text-site-text-muted" />
          {formatTime(time)}
          <span className="text-site-text-muted">
            ({durationMinutes >= 60
              ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}m` : ''}`
              : `${durationMinutes}m`})
          </span>
        </div>
        {isMobile && mobileAddress && (
          <div className="flex items-start gap-2 text-site-text">
            <Truck className="mt-0.5 h-4 w-4 text-site-text-muted" />
            <span>Mobile: {mobileAddress}</span>
          </div>
        )}
      </div>

      {/* Price lines */}
      <div className="flex justify-between">
        <span className="text-site-text-secondary">{serviceName}</span>
        <span className="font-medium text-site-text">{formatCurrency(price)}</span>
      </div>
      {addons.map((addon) => (
        <div key={addon.service_id} className="flex justify-between">
          <span className="text-site-text-secondary">{addon.name}</span>
          <span className="font-medium text-site-text">{formatCurrency(addon.price)}</span>
        </div>
      ))}
      {mobileSurcharge > 0 && (
        <div className="flex justify-between">
          <span className="text-site-text-secondary">Mobile surcharge</span>
          <span className="font-medium text-site-text">{formatCurrency(mobileSurcharge)}</span>
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
      {requirePayment && paymentOption !== 'pay_on_site' && paymentOption !== null && !discountsCoverAmount && (
        <>
          <div className="flex justify-between pt-1 text-lime">
            <span>{paymentOption === 'full' ? 'Amount Due' : 'Deposit now'}</span>
            <span className="font-medium">{formatCurrency(paymentAmount)}</span>
          </div>
          {paymentOption === 'deposit' && (
            <div className="flex justify-between text-site-text-muted">
              <span>Due at service</span>
              <span className="font-medium">{formatCurrency(remainingAmount)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
        {/* Left column */}
        <div className="space-y-6">
          {/* Section 1: Auth / Customer Info */}
          <div>
            <h2 className="text-xl font-semibold text-site-text">Confirm & Book</h2>
            <p className="mt-1 text-sm text-site-text-secondary">
              {isAuthenticated
                ? 'Review your details and complete your booking.'
                : 'Sign in or create an account to complete your booking.'}
            </p>

            <div className="mt-6">
              <InlineAuth
                onAuthComplete={onAuthComplete}
                isAuthenticated={isAuthenticated}
                customerData={customerData}
                onSignOut={onSignOut}
                businessName={businessName}
              />
            </div>
          </div>

          {/* Rest of the page only visible after auth */}
          {isAuthenticated && (
            <>
              {/* Mobile Order Summary (collapsible) */}
              <div className="lg:hidden rounded-lg border border-site-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="flex w-full items-center justify-between p-4"
                >
                  <span className="text-sm font-semibold text-site-text-secondary">Order Summary</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-site-text">
                      {formatCurrency(grandTotal)}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-site-text-muted transition-transform',
                        summaryExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </button>
                {summaryExpanded && (
                  <div className="border-t border-site-border p-4">
                    {renderOrderSummary()}
                  </div>
                )}
              </div>

              {/* Section 2: Coupons & Discounts (collapsed by default) */}
              <div className="rounded-lg border border-site-border overflow-hidden">
                {/* Coupon header — always visible */}
                <button
                  type="button"
                  onClick={() => {
                    if (!appliedCoupon) setCouponExpanded(!couponExpanded);
                  }}
                  className="flex w-full items-center justify-between p-4"
                >
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-purple-500" />
                    {appliedCoupon ? (
                      <span className="text-sm font-semibold text-green-400">
                        Saving {formatCurrency(appliedCoupon.discount)} with {appliedCoupon.code}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-site-text-secondary">
                        Have a promo code?
                      </span>
                    )}
                  </div>
                  {appliedCoupon ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleRemoveCoupon(); }}
                      className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                    >
                      Remove
                    </Button>
                  ) : (
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-site-text-muted transition-transform',
                        couponExpanded && 'rotate-180'
                      )}
                    />
                  )}
                </button>

                {/* Coupon content — collapsible */}
                {couponExpanded && !appliedCoupon && (
                  <div className="border-t border-site-border p-4 space-y-4">
                    {/* Available coupons */}
                    {availableCoupons.length > 0 && (
                      <div>
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
                                          <span className="mt-0.5 text-purple-400">&bull;</span>
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
                                    className="flex-shrink-0 border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface"
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
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <p className="text-xs font-medium text-site-text-secondary">
                          {availableCoupons.length > 0 ? 'Or enter a different code' : 'Enter a coupon code'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="e.g., SAVE20"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          className="flex-1 font-mono border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleApplyCoupon(couponInput)}
                          disabled={couponLoading || !couponInput.trim()}
                          className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface"
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
                  </div>
                )}
              </div>

              {/* Section 3: Loyalty Points */}
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
                        <label className="text-xs font-medium text-site-text-muted whitespace-nowrap shrink-0">
                          Adjust slider to use Points:
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={maxLoyaltyPointsUsable}
                          step={REDEEM_MINIMUM}
                          value={loyaltyPointsToUse}
                          onChange={(e) => onLoyaltyPointsChange(Number(e.target.value))}
                          className="flex-1 min-w-0 h-2 bg-brand-surface rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <span className="text-xs font-semibold text-site-text whitespace-nowrap shrink-0">
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

              {/* Section 4: Payment (unified: options + cancellation + Stripe) */}
              {requirePayment && !pointsCoverOrder && (
                <div className="rounded-lg border border-site-border p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-site-text-secondary">Payment</h3>

                  {discountsCoverAmount ? (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                      <p className="text-sm font-medium text-green-400">
                        Remaining balance of {formatCurrency(grandTotal)} is below minimum — no payment required!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Pay in Full option — always shown */}
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          paymentOption === 'full'
                            ? 'border-lime bg-brand-surface'
                            : 'border-site-border hover:border-site-border-medium'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentOption"
                          value="full"
                          checked={paymentOption === 'full'}
                          onChange={() => handlePaymentOptionSwitch('full')}
                          className="mt-0.5 h-4 w-4 text-lime focus:ring-lime"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-site-text">
                            {hasLoyaltyDiscount
                              ? `Pay Balance in Full — ${formatCurrency(grandTotal)} now`
                              : `Pay in Full — ${formatCurrency(grandTotal)} now`}
                          </p>
                          <p className="text-xs text-site-text-muted">
                            {hasLoyaltyDiscount
                              ? 'Pay the remaining balance now after points redemption'
                              : "Pay the full amount now and you\u2019re all set"}
                          </p>
                        </div>
                      </label>

                      {/* Deposit option — hidden for: orders < $100, returning customers, loyalty active */}
                      {!isFullPaymentRequired && !hasTransactionHistory && !hasLoyaltyDiscount && (
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
                            onChange={() => handlePaymentOptionSwitch('deposit')}
                            className="mt-0.5 h-4 w-4 text-lime focus:ring-lime"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-site-text">
                              ${depositAmount} Deposit — ${depositAmount}.00 now, {formatCurrency(grandTotal - depositAmount)} at service
                            </p>
                            <p className="text-xs text-site-text-muted">
                              Reserve your spot with a deposit, pay the rest when we&apos;re done
                            </p>
                          </div>
                        </label>
                      )}

                      {/* Pay on Site — only for existing customers */}
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
                            onChange={() => handlePaymentOptionSwitch('pay_on_site')}
                            className="mt-0.5 h-4 w-4 text-lime focus:ring-lime"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-site-text">
                              {hasLoyaltyDiscount ? 'Pay Balance on Site' : 'Pay on Site'}
                            </p>
                            <p className="text-xs text-site-text-muted">
                              {hasLoyaltyDiscount
                                ? "Pay the remaining balance when we\u2019re done"
                                : "No payment now — pay when we\u2019re done"}
                            </p>
                          </div>
                        </label>
                      )}

                      {!isExistingCustomer && (
                        <p className="text-xs text-site-text-muted italic">
                          Pay on Site becomes available after your first visit.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cancellation Disclaimer — only for Pay on Site */}
                  {paymentOption === 'pay_on_site' && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
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
                  )}

                  {/* Stripe Payment Form (inline, directly below payment options) */}
                  {showPaymentForm && needsStripePayment && (
                    <StepPayment
                      key={`${paymentOption}-${paymentAmount}`}
                      amount={paymentAmount}
                      totalAmount={grandTotal}
                      remainingAmount={paymentOption === 'deposit' ? grandTotal - depositAmount : undefined}
                      isDeposit={paymentOption === 'deposit'}
                      onPaymentSuccess={handlePaymentSuccess}
                      onBack={() => setShowPaymentForm(false)}
                    />
                  )}
                </div>
              )}

              {/* Points cover full order — no payment needed */}
              {requirePayment && pointsCoverOrder && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <p className="text-sm font-medium text-green-400">
                    Your loyalty points cover the full amount — no payment required!
                  </p>
                </div>
              )}

              {/* Combined Agreement Checkbox + CTA (hide when Stripe form is active) */}
              {!showPaymentForm && (
                <>
                  {/* Combined consent + terms checkbox */}
                  <div className="rounded-lg border border-site-border p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedToAll}
                        onChange={(e) => setAgreedToAll(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
                      />
                      <span className="text-xs text-site-text-secondary leading-relaxed">
                        I agree to the{' '}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lime hover:text-lime-200 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Terms &amp; Conditions
                        </a>{' '}
                        and consent to receive appointment reminders, confirmations, and promotional offers from {businessName} via text and email. Msg &amp; data rates may apply. Reply STOP to opt out.
                      </span>
                    </label>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

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
                    <Button
                      type="button"
                      onClick={handleBookingSubmit}
                      disabled={!canSubmit}
                      className="hidden lg:inline-flex bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200"
                    >
                      {submitting ? (
                        <>
                          <Spinner size="sm" className="text-white" />
                          Processing...
                        </>
                      ) : (
                        getCtaText()
                      )}
                    </Button>
                  </div>

                  {/* Mobile spacer for sticky footer */}
                  <div className="h-24 lg:hidden" />
                </>
              )}
            </>
          )}
        </div>

        {/* Desktop right column: Order Summary (always expanded) */}
        <div className="hidden lg:block">
          <div className="sticky top-8 rounded-lg border border-site-border bg-brand-surface p-5">
            <h3 className="text-sm font-semibold text-site-text-secondary mb-3">
              Order Summary
            </h3>
            {renderOrderSummary()}
          </div>
        </div>
      </div>

      {/* Mobile sticky footer */}
      {isAuthenticated && !showPaymentForm && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-10 border-t border-site-border bg-brand-surface px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-site-text-muted">Total</p>
              <p className="text-lg font-bold text-site-text">{formatCurrency(grandTotal)}</p>
            </div>
            <Button
              type="button"
              onClick={handleBookingSubmit}
              disabled={!canSubmit}
              className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200"
            >
              {submitting ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  Processing...
                </>
              ) : (
                getCtaText()
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
