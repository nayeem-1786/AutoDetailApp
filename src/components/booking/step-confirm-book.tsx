'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { bookingCustomerSchema, type BookingCustomerInput, type BookingVehicleInput, type BookingAddonInput } from '@/lib/utils/validation';
import { cn } from '@/lib/utils/cn';
import { formatPhoneInput, normalizePhone, formatCurrency, formatDate, formatTime } from '@/lib/utils/format';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { isSpecialtyCategory, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { StepPayment } from './step-payment';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import {
  LogIn,
  X,
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
  // Customer pre-fill
  initialCustomer: Partial<BookingCustomerInput>;
  // Coupon
  couponCode: string | null;
  appliedCoupon: AppliedCoupon | null;
  onCouponApply: (coupon: AppliedCoupon | null) => void;
  availableCoupons: AvailableCoupon[];
  // Loyalty
  isPortal: boolean;
  isExistingCustomer: boolean;
  loyaltyPointsBalance: number;
  loyaltyPointsToUse: number;
  onLoyaltyPointsChange: (points: number) => void;
  // Payment
  requirePayment: boolean;
  paymentOption: 'deposit' | 'pay_on_site' | null;
  onPaymentOptionChange: (option: 'deposit' | 'pay_on_site') => void;
  // Actions
  onConfirm: (customer: BookingCustomerInput, vehicle: BookingVehicleInput, paymentIntentId?: string) => void;
  onBack: () => void;
  // Auto-apply URL coupon
  autoApplyCouponOnMount?: boolean;
  onCouponAutoApplyAttempted?: () => void;
  // Vehicle category from Step 1
  vehicleCategory: string;
  selectedSizeClass: VehicleSizeClass | null;
}

// --- Helpers ---

function isValidPhoneForLookup(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
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
  initialCustomer,
  couponCode,
  appliedCoupon,
  onCouponApply,
  availableCoupons,
  isPortal,
  isExistingCustomer,
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
  // --- Form ---
  const formatInitialPhone = (phone: string | undefined): string => {
    if (!phone) return '';
    if (/^\(\d{3}\) \d{3}-\d{4}$/.test(phone)) return phone;
    return formatPhoneInput(phone);
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<BookingCustomerInput>({
    resolver: formResolver(bookingCustomerSchema),
    mode: 'onTouched',
    defaultValues: {
      first_name: initialCustomer.first_name ?? '',
      last_name: initialCustomer.last_name ?? '',
      phone: formatInitialPhone(initialCustomer.phone),
      email: initialCustomer.email ?? '',
      sms_consent: true,
      email_consent: true,
    },
  });

  // --- State ---
  const [businessName, setBusinessName] = useState('our business');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [couponInput, setCouponInput] = useState(couponCode ?? '');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Phone lookup state
  const [phoneLookup, setPhoneLookup] = useState<{ exists: boolean; firstName?: string } | null>(null);
  const [phoneLookupDismissed, setPhoneLookupDismissed] = useState(false);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookedUpPhone = useRef<string | null>(null);

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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
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
  const paymentAmount = isFullPaymentRequired ? grandTotal : 50;
  const remainingAmount = grandTotal - paymentAmount;

  const maxLoyaltyPointsRaw = Math.min(
    loyaltyPointsBalance,
    Math.floor((subtotal - couponDiscount) / REDEEM_RATE)
  );
  const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / REDEEM_MINIMUM) * REDEEM_MINIMUM;
  const loyaltyPointsValue = loyaltyPointsBalance * REDEEM_RATE;

  // Determine if Stripe needed
  const STRIPE_MINIMUM = 0.50;
  const discountsCoverAmount = grandTotal < STRIPE_MINIMUM;
  const needsStripePayment = requirePayment && paymentOption !== 'pay_on_site' && !discountsCoverAmount && grandTotal > 0;

  // --- Phone lookup ---
  const doPhoneLookup = useCallback(async (phone: string) => {
    const e164 = normalizePhone(phone);
    if (!e164) return;
    if (lastLookedUpPhone.current === e164) return;
    lastLookedUpPhone.current = e164;

    try {
      const res = await fetch('/api/book/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.exists) {
        setPhoneLookup({ exists: true, firstName: data.firstName });
        setPhoneLookupDismissed(false);
      } else {
        setPhoneLookup(null);
      }
    } catch {
      // Fail silently
    }
  }, []);

  const schedulePhoneLookup = useCallback(
    (phone: string) => {
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      if (isPortal) return;

      const e164 = normalizePhone(phone);
      if (e164 && lastLookedUpPhone.current === e164) return;
      if (lastLookedUpPhone.current && e164 !== lastLookedUpPhone.current) {
        setPhoneLookup(null);
        setPhoneLookupDismissed(false);
        lastLookedUpPhone.current = null;
      }
      if (!isValidPhoneForLookup(phone)) return;

      lookupTimerRef.current = setTimeout(() => {
        doPhoneLookup(phone);
      }, 500);
    },
    [isPortal, doPhoneLookup]
  );

  function handlePhoneBlur() {
    const phone = watch('phone');
    if (phone && isValidPhoneForLookup(phone) && !isPortal) {
      if (lookupTimerRef.current) {
        clearTimeout(lookupTimerRef.current);
        lookupTimerRef.current = null;
      }
      doPhoneLookup(phone);
    }
  }

  function handleLoginClick() {
    const currentUrl = window.location.href;
    const redirectUrl = encodeURIComponent(currentUrl);
    const phone = watch('phone');
    const phoneParam = phone ? `&phone=${encodeURIComponent(phone)}` : '';
    window.location.href = `/signin?redirect=${redirectUrl}${phoneParam}`;
  }

  // --- Coupon ---
  async function handleApplyCoupon(code: string) {
    if (!code.trim()) return;
    setCouponLoading(true);
    setCouponError(null);

    try {
      const customerPhone = watch('phone');
      const customerEmail = watch('email');
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
      year: undefined,
      make: '',
      model: '',
      color: '',
    } as BookingVehicleInput;
  }

  // --- Submit ---
  function onFormSubmit(customer: BookingCustomerInput) {
    if (!agreedToTerms) return;

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
      onConfirm(customer, vehicle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  function handlePaymentSuccess(paymentIntentId: string) {
    const customer = watch();
    const vehicle = buildVehicle();
    onConfirm(customer, vehicle, paymentIntentId);
  }

  // --- Render helpers ---
  const showWelcomeBack = phoneLookup?.exists && !phoneLookupDismissed && !isPortal;

  const inputCls = 'border-site-border bg-brand-surface text-site-text placeholder:text-site-text-dim focus-visible:ring-lime dark:border-site-border dark:bg-brand-surface dark:text-site-text dark:placeholder:text-site-text-dim';
  const labelCls = 'text-site-text-secondary dark:text-site-text-secondary';

  // Determine CTA text
  const getCtaText = () => {
    if (submitting) return null; // handled separately
    if (needsStripePayment && showPaymentForm) return null; // Stripe form has its own button
    if (requirePayment && paymentOption !== 'pay_on_site' && !discountsCoverAmount) {
      return `Pay ${formatCurrency(paymentAmount)} & Book My Detail`;
    }
    return 'Book My Detail';
  };

  const canSubmit = agreedToTerms && !submitting &&
    (requirePayment ? (isFullPaymentRequired || paymentOption !== null) : true);

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
      {requirePayment && paymentOption !== 'pay_on_site' && !discountsCoverAmount && (
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
  );

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
        {/* Left column */}
        <div className="space-y-6">
          {/* Section 1: Customer Info */}
          <div>
            <h2 className="text-xl font-semibold text-site-text">Confirm & Book</h2>
            <p className="mt-1 text-sm text-site-text-secondary">
              Enter your details to complete your booking.
            </p>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-site-text-secondary">Your Information</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <FormField
                  label="First Name"
                  required
                  error={errors.first_name?.message}
                  htmlFor="confirm_first_name"
                  labelClassName={labelCls}
                >
                  <Input
                    id="confirm_first_name"
                    autoFocus
                    placeholder="John"
                    className={inputCls}
                    {...register('first_name')}
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  required
                  error={errors.last_name?.message}
                  htmlFor="confirm_last_name"
                  labelClassName={labelCls}
                >
                  <Input
                    id="confirm_last_name"
                    placeholder="Doe"
                    className={inputCls}
                    {...register('last_name')}
                  />
                </FormField>

                <FormField
                  label="Mobile"
                  required
                  error={errors.phone?.message}
                  htmlFor="confirm_phone"
                  labelClassName={labelCls}
                >
                  <Input
                    id="confirm_phone"
                    type="tel"
                    placeholder="(310) 555-1234"
                    className={inputCls}
                    {...register('phone', {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        const formatted = formatPhoneInput(e.target.value);
                        setValue('phone', formatted, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        schedulePhoneLookup(formatted);
                      },
                      onBlur: handlePhoneBlur,
                    })}
                  />
                </FormField>

                <FormField
                  label="Email"
                  required
                  error={errors.email?.message}
                  htmlFor="confirm_email"
                  labelClassName={labelCls}
                >
                  <Input
                    id="confirm_email"
                    type="email"
                    placeholder="john@example.com"
                    className={inputCls}
                    {...register('email')}
                  />
                </FormField>
              </div>

              {/* Welcome Back Notification */}
              {showWelcomeBack && (
                <div className="mt-4 relative rounded-lg border border-lime bg-lime/10 p-4">
                  <button
                    type="button"
                    onClick={() => setPhoneLookupDismissed(true)}
                    className="absolute top-2 right-2 text-site-text-muted hover:text-site-text transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <p className="text-sm font-medium text-site-text">
                    {phoneLookup.firstName
                      ? `Welcome back, ${phoneLookup.firstName}!`
                      : 'Welcome back!'}
                  </p>
                  <p className="mt-1 text-xs text-site-text-muted">
                    We found an account with this phone number. Log in to auto-fill your details and access your booking history.
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={handleLoginClick}
                      className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200 text-xs h-8 px-3"
                    >
                      <LogIn className="mr-1.5 h-3.5 w-3.5" />
                      Log In to Continue
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPhoneLookupDismissed(true)}
                      className="text-xs text-site-text-muted hover:text-site-text transition-colors"
                    >
                      Continue as Guest
                    </button>
                  </div>
                </div>
              )}

              {/* Consent Checkboxes */}
              <div className="mt-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
                    {...register('sms_consent')}
                  />
                  <span className="text-xs text-site-text-secondary">
                    I agree to receive text messages from {businessName} including appointment reminders and updates. Msg &amp; data rates may apply. Reply STOP to opt out.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-site-border text-lime focus:ring-lime"
                    {...register('email_consent')}
                  />
                  <span className="text-xs text-site-text-secondary">
                    I agree to receive emails from {businessName} including appointment confirmations and promotional offers.
                  </span>
                </label>
              </div>
            </div>
          </div>

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

          {/* Section 2: Coupons & Discounts */}
          <div className="rounded-lg border border-site-border p-4">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-site-text-secondary">Save with a Coupon</h3>
            </div>
            <p className="mt-1 text-xs text-site-text-muted">
              Apply a coupon code to get a discount on your booking.
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

            {!appliedCoupon && availableCoupons.length === 0 && !couponInput && (
              <p className="mt-2 text-xs text-site-text-muted italic">
                Don&apos;t have a code? No problem — you can still complete your booking without one.
              </p>
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

          {/* Section 4: Payment Options */}
          {requirePayment && (
            <div className="rounded-lg border border-site-border p-4">
              <h3 className="text-sm font-semibold text-site-text-secondary">Payment Options</h3>
              <div className="mt-3 space-y-3">
                {discountsCoverAmount ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                    <p className="text-sm font-medium text-green-400">
                      {grandTotal <= 0
                        ? 'Your discounts cover the full amount — no payment required!'
                        : `Remaining balance of ${formatCurrency(grandTotal)} is below minimum — no payment required!`}
                    </p>
                  </div>
                ) : isFullPaymentRequired ? (
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
                        onChange={() => { onPaymentOptionChange('deposit'); setShowPaymentForm(false); }}
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
                          onChange={() => { onPaymentOptionChange('pay_on_site'); setShowPaymentForm(false); }}
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

          {/* Section 5: Stripe Payment Form (inline) */}
          {showPaymentForm && needsStripePayment && (
            <div>
              <StepPayment
                amount={paymentAmount}
                totalAmount={grandTotal}
                remainingAmount={remainingAmount}
                isDeposit={!isFullPaymentRequired}
                onPaymentSuccess={handlePaymentSuccess}
                onBack={() => setShowPaymentForm(false)}
              />
            </div>
          )}

          {/* Section 6: Terms & CTA (hide when Stripe form is active — it has its own buttons) */}
          {!showPaymentForm && (
            <>
              {/* Terms */}
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
                  type="submit"
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
    </form>
  );
}
