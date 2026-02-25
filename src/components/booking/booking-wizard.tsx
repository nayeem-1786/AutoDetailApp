'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { StepIndicator } from './step-indicator';
import { StepServiceSelect, type ConfigureResult } from './step-service-select';
import { StepSchedule } from './step-schedule';
import { StepCustomerInfo } from './step-customer-info';
import { StepReview } from './step-review';
import { StepPayment } from './step-payment';
import { BookingConfirmation } from './booking-confirmation';
import { Button } from '@/components/ui/button';
import type { BookableCategory, BookableService, BusinessHours, BookingConfig, RebookData } from '@/lib/data/booking';
import type { MobileZone, VehicleSizeClass, VehicleType, VehicleCategoryRecord, VehicleCategory as VehicleCategoryType } from '@/lib/supabase/types';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';
import { categoryToCompatibilityKey, type VehicleCategory } from '@/lib/utils/vehicle-categories';

interface CustomerDataProp {
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  };
  vehicles: {
    id: string;
    vehicle_type: VehicleType;
    vehicle_category?: VehicleCategoryType;
    size_class: VehicleSizeClass | null;
    specialty_tier?: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  }[];
}

interface BookingWizardProps {
  categories: BookableCategory[];
  mobileZones: MobileZone[];
  businessHours: BusinessHours;
  bookingConfig: BookingConfig;
  preSelectedService: BookableService | null;
  rebookData?: RebookData | null;
  customerData?: CustomerDataProp | null;
  couponCode?: string | null;
  vehicleCategories?: VehicleCategoryRecord[];
}

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

interface BookingState {
  selectedCategory: string;
  service: BookableService | null;
  config: ConfigureResult | null;
  date: string | null;
  time: string | null;
  customer: BookingCustomerInput | null;
  vehicle: BookingVehicleInput | null;
  paymentIntentId: string | null;
  isExistingCustomer: boolean | null;
  paymentOption: 'deposit' | 'pay_on_site' | null;
  appliedCoupon: AppliedCoupon | null;
  availableCoupons: AvailableCoupon[];
  loyaltyPointsBalance: number;
  loyaltyPointsToUse: number;
}

interface ConfirmationData {
  appointment: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    total: number;
  };
  serviceName: string;
  isMobile: boolean;
  mobileAddress: string | null;
  paymentOption: 'deposit' | 'pay_on_site' | 'full' | null;
  amountCharged: number;
  grandTotal: number;
  customerEmail: string | null;
}

// Step mapping (after merging service select + configure):
// Step 1: Service Select + Configure
// Step 2: Schedule
// Step 3: Customer Info
// Step 4: Review
// Step 5: Payment (optional)

export function BookingWizard({
  categories,
  mobileZones,
  businessHours,
  bookingConfig,
  preSelectedService,
  rebookData,
  customerData,
  couponCode,
  vehicleCategories = [],
}: BookingWizardProps) {
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);

  // Determine initial step and pre-fill state
  const rebookService = rebookData
    ? findServiceById(rebookData.service_id)
    : null;

  function findServiceById(id: string): BookableService | null {
    for (const cat of categories) {
      const found = cat.services.find((s) => s.id === id);
      if (found) return found;
    }
    return null;
  }

  function findServiceBySlug(slug: string): BookableService | null {
    for (const cat of categories) {
      const found = cat.services.find((s) => s.slug === slug);
      if (found) return found;
    }
    return null;
  }

  // Whether this is a portal booking (logged-in customer)
  const isPortal = !!customerData;

  // Whether payment is required for online bookings
  const requirePayment = bookingConfig.require_payment;

  // --- URL state restoration ---
  function getInitialState(): { step: number; state: BookingState } {
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    const urlVehicle = searchParams.get('vehicle') as VehicleSizeClass | null;
    const urlDate = searchParams.get('date');
    const urlTime = searchParams.get('time');
    const urlAddons = searchParams.get('addons');
    const urlCategory = searchParams.get('category') ?? 'automobile';

    const service = rebookService ?? preSelectedService;

    // Base state
    const baseState: BookingState = {
      selectedCategory: urlCategory,
      service: service,
      config: rebookData && rebookService
        ? {
            tier_name: rebookData.tier_name ?? null,
            tier_label: rebookData.tier_name
              ? (rebookService.service_pricing.find((t) => t.tier_name === rebookData.tier_name)?.tier_label ?? null)
              : null,
            price: 0,
            is_mobile: rebookData.is_mobile,
            mobile_zone_id: rebookData.mobile_zone_id ?? null,
            mobile_address: rebookData.mobile_address ?? null,
            mobile_surcharge: rebookData.mobile_surcharge,
            size_class: rebookData.vehicle?.size_class ?? null,
            addons: rebookData.addons,
          } as ConfigureResult
        : null,
      date: null,
      time: null,
      customer: null,
      vehicle: null,
      paymentIntentId: null,
      isExistingCustomer: isPortal ? true : null,
      paymentOption: null,
      appliedCoupon: null,
      availableCoupons: [],
      loyaltyPointsBalance: 0,
      loyaltyPointsToUse: 0,
    };

    // Default step: rebook → step 2 (schedule), otherwise step 1
    const defaultStep = rebookService ? 2 : 1;

    // If no URL step param or rebook mode, use defaults
    if (!urlStep || isNaN(urlStep) || urlStep < 1 || urlStep > 5 || rebookData) {
      return { step: defaultStep, state: baseState };
    }

    // Step 1: No extra state needed
    if (urlStep === 1) {
      return { step: 1, state: baseState };
    }

    // Step 2+: Need a service + config
    if (!service) {
      return { step: 1, state: baseState };
    }

    // Step 2+: Try to reconstruct config from URL params
    if (urlStep >= 2 && service) {
      const reconstructedConfig = reconstructConfig(service, urlVehicle, urlAddons);
      if (reconstructedConfig) {
        const restoredState = {
          ...baseState,
          config: reconstructedConfig,
          date: urlStep >= 2 ? urlDate : null,
          time: urlStep >= 2 ? urlTime : null,
        };

        // Step 2: schedule — need config
        if (urlStep === 2) {
          return { step: 2, state: restoredState };
        }

        // Step 3+: need config + date + time
        if (urlDate && urlTime) {
          return { step: Math.min(urlStep, 3), state: restoredState };
        }

        // Have config but no date/time — go to step 2
        return { step: 2, state: restoredState };
      }

      // Couldn't reconstruct config — go to step 1
      return { step: 1, state: baseState };
    }

    return { step: defaultStep, state: baseState };
  }

  // Reconstruct config from URL params (vehicle size + addon IDs)
  function reconstructConfig(
    service: BookableService,
    vehicleSize: VehicleSizeClass | null,
    addonIdsStr: string | null
  ): ConfigureResult | null {
    const tiers = service.service_pricing;

    let tier_name: string | null = null;
    let price = 0;
    let size_class: VehicleSizeClass | null = vehicleSize;

    switch (service.pricing_model) {
      case 'flat':
        price = service.flat_price ?? 0;
        break;

      case 'vehicle_size': {
        if (vehicleSize) {
          const tier = tiers.find((t) => t.tier_name === vehicleSize);
          if (tier) {
            tier_name = tier.tier_name;
            price = tier.price;
          }
        }
        if (!price && tiers.length > 0) {
          tier_name = tiers[0].tier_name;
          price = tiers[0].price;
          size_class = tiers[0].tier_name as VehicleSizeClass;
        }
        break;
      }

      case 'scope':
      case 'specialty': {
        if (tiers.length > 0) {
          const tier = tiers[0];
          tier_name = tier.tier_name;
          if (tier.is_vehicle_size_aware && vehicleSize) {
            const vp = vehicleSize === 'sedan' ? tier.vehicle_size_sedan_price
              : vehicleSize === 'truck_suv_2row' ? tier.vehicle_size_truck_suv_price
              : vehicleSize === 'suv_3row_van' ? tier.vehicle_size_suv_van_price
              : null;
            price = vp ?? tier.price;
          } else {
            price = tier.price;
          }
        }
        break;
      }

      case 'per_unit':
        price = service.per_unit_price ?? 0;
        break;

      default:
        return null;
    }

    if (price <= 0) return null;

    // Reconstruct addons from IDs
    const addonIds = addonIdsStr ? addonIdsStr.split(',').filter(Boolean) : [];
    const addons = addonIds
      .map((id) => {
        for (const suggestion of service.service_addon_suggestions) {
          if (suggestion.addon_service?.id === id) {
            const addonSvc = suggestion.addon_service;
            return {
              service_id: id,
              name: addonSvc.name,
              price: suggestion.combo_price ?? addonSvc.flat_price ?? 0,
              tier_name: null,
            };
          }
        }
        return null;
      })
      .filter(Boolean) as ConfigureResult['addons'];

    const matchedTier = tier_name ? tiers.find((t) => t.tier_name === tier_name) : null;
    const tier_label = matchedTier?.tier_label ?? null;

    return {
      tier_name,
      tier_label,
      price,
      size_class,
      is_mobile: false,
      mobile_zone_id: null,
      mobile_address: '',
      mobile_surcharge: 0,
      addons,
      per_unit_quantity: 1,
    };
  }

  const initial = getInitialState();
  const [step, setStep] = useState(initial.step);
  const [state, setState] = useState<BookingState>(initial.state);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const [editEntryStep, setEditEntryStep] = useState<number | null>(null);
  const [urlCouponAttempted, setUrlCouponAttempted] = useState(false);

  // --- URL state sync ---
  const updateUrl = useCallback((newStep: number, newState: BookingState) => {
    const params = new URLSearchParams();

    // Always set step
    params.set('step', String(newStep));

    // Service slug
    if (newState.service) {
      params.set('service', newState.service.slug);
    }

    // Vehicle size
    if (newState.config?.size_class) {
      params.set('vehicle', newState.config.size_class);
    }

    // Date and time
    if (newState.date) params.set('date', newState.date);
    if (newState.time) params.set('time', newState.time);

    // Addon IDs
    if (newState.config?.addons && newState.config.addons.length > 0) {
      params.set('addons', newState.config.addons.map((a) => a.service_id).join(','));
    }

    // Preserve coupon param
    if (couponCode) {
      params.set('coupon', couponCode);
    }

    // Vehicle category (only if not default)
    if (newState.selectedCategory && newState.selectedCategory !== 'automobile') {
      params.set('category', newState.selectedCategory);
    }

    // Preserve rebook param
    const currentRebook = searchParams.get('rebook');
    if (currentRebook) {
      params.set('rebook', currentRebook);
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [couponCode, searchParams]);

  // Set initial URL on first render
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      updateUrl(step, state);
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom setStep that also updates URL
  function goToStep(newStep: number, updatedState?: BookingState) {
    const s = updatedState ?? state;
    setStep(newStep);
    updateUrl(newStep, s);
  }

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // --- Step click handler for stepper navigation ---
  function handleStepClick(targetStep: number) {
    if (targetStep >= step) return;
    goToStep(targetStep);
  }

  // --- Edit from Review step ---
  function handleEditFromReview(targetStep: number) {
    setEditEntryStep(targetStep);
    goToStep(targetStep);
  }

  // If booking confirmed, show confirmation screen
  if (confirmation) {
    return (
      <BookingConfirmation
        appointment={confirmation.appointment}
        serviceName={confirmation.serviceName}
        isMobile={confirmation.isMobile}
        mobileAddress={confirmation.mobileAddress}
        couponCode={state.appliedCoupon ? state.appliedCoupon.code : (couponCode ?? null)}
        paymentOption={confirmation.paymentOption}
        amountCharged={confirmation.amountCharged}
        grandTotal={confirmation.grandTotal}
        customerEmail={confirmation.customerEmail}
        isPortal={isPortal}
      />
    );
  }

  // Category change handler — resets service/config/schedule when category changes
  function handleCategoryChange(categoryKey: string) {
    const newState: BookingState = {
      ...state,
      selectedCategory: categoryKey,
      service: null,
      config: null,
      date: null,
      time: null,
    };
    setState(newState);
    updateUrl(1, newState);
  }

  // Filter services by selected vehicle category
  const compatibilityKey = categoryToCompatibilityKey(state.selectedCategory as VehicleCategory);
  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      services: cat.services.filter((svc) => {
        const compat = svc.vehicle_compatibility as string[];
        return compat && compat.length > 0 ? compat.includes(compatibilityKey) : true;
      }),
    }))
    .filter((cat) => cat.services.length > 0);

  // Step 1: Select service + configure (merged)
  function handleServiceSelect(service: BookableService, config: ConfigureResult) {
    const newState: BookingState = {
      ...state,
      service,
      config,
      // When editing from review, preserve date/time; otherwise reset
      date: editEntryStep !== null ? state.date : null,
      time: editEntryStep !== null ? state.time : null,
    };
    setState(newState);

    if (editEntryStep !== null) {
      // Editing from review — go back to review
      setEditEntryStep(null);
      goToStep(4, newState);
    } else {
      goToStep(2, newState);
    }
  }

  // Step 2: Schedule
  function handleScheduleContinue(date: string, time: string) {
    const newState = { ...state, date, time };
    setState(newState);
    if (editEntryStep !== null) {
      setEditEntryStep(null);
      goToStep(4, newState);
    } else {
      goToStep(3, newState);
    }
  }

  // Step 3: Customer info
  async function handleCustomerContinue(
    customer: BookingCustomerInput,
    vehicle: BookingVehicleInput
  ) {
    setState((prev) => ({ ...prev, customer, vehicle }));

    if (!isPortal) {
      try {
        const res = await fetch('/api/book/check-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: customer.phone,
            email: customer.email,
            service_id: state.service?.id,
            addon_ids: state.config?.addons?.map((a) => a.service_id) || [],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            isExistingCustomer: data.isExisting,
            availableCoupons: data.availableCoupons || [],
          }));
        }
      } catch (err) {
        console.error('Failed to check customer:', err);
        setState((prev) => ({
          ...prev,
          isExistingCustomer: false,
          availableCoupons: [],
        }));
      }
    } else {
      try {
        const couponParams = new URLSearchParams();
        if (state.service?.id) couponParams.set('service_id', state.service.id);
        const addonServiceIds = state.config?.addons?.map((a) => a.service_id) || [];
        if (addonServiceIds.length > 0) couponParams.set('addon_ids', addonServiceIds.join(','));
        const couponUrl = `/api/customer/coupons${couponParams.toString() ? `?${couponParams.toString()}` : ''}`;

        const [couponsRes, loyaltyRes] = await Promise.all([
          fetch(couponUrl),
          fetch('/api/customer/loyalty'),
        ]);

        let coupons: AvailableCoupon[] = [];
        let loyaltyBalance = 0;

        if (couponsRes.ok) {
          const data = await couponsRes.json();
          coupons = data.data || [];
        }

        if (loyaltyRes.ok) {
          const data = await loyaltyRes.json();
          loyaltyBalance = data.balance || 0;
        }

        setState((prev) => ({
          ...prev,
          availableCoupons: coupons,
          loyaltyPointsBalance: loyaltyBalance,
        }));
      } catch (err) {
        console.error('Failed to fetch customer data:', err);
      }
    }

    setEditEntryStep(null);
    goToStep(4, { ...state, customer, vehicle, date: state.date, time: state.time });
  }

  // Step 4: Review
  function handleReviewContinue() {
    if (state.paymentOption === 'pay_on_site') {
      handleConfirm();
    } else if (requirePayment) {
      goToStep(5);
    } else {
      handleConfirm();
    }
  }

  function handlePaymentOptionChange(option: 'deposit' | 'pay_on_site') {
    setState((prev) => ({ ...prev, paymentOption: option }));
  }

  function handleCouponApply(coupon: AppliedCoupon | null) {
    setState((prev) => {
      const couponDiscount = coupon?.discount ?? 0;
      const subtotal = (prev.config?.price ?? 0) +
        (prev.config?.addons ?? []).reduce((sum, a) => sum + a.price, 0) +
        (prev.config?.mobile_surcharge ?? 0);
      const remainingAfterCoupon = subtotal - couponDiscount;

      const REDEEM_RATE = 0.05;
      const REDEEM_MINIMUM = 100;
      const maxPointsForBalance = Math.floor(remainingAfterCoupon / REDEEM_RATE);
      const maxLoyaltyPointsRaw = Math.min(prev.loyaltyPointsBalance, maxPointsForBalance);
      const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / REDEEM_MINIMUM) * REDEEM_MINIMUM;
      const adjustedLoyaltyPoints = Math.min(prev.loyaltyPointsToUse, maxLoyaltyPointsUsable);

      return {
        ...prev,
        appliedCoupon: coupon,
        loyaltyPointsToUse: adjustedLoyaltyPoints,
      };
    });
  }

  function handleLoyaltyPointsChange(points: number) {
    setState((prev) => {
      const couponDiscount = prev.appliedCoupon?.discount ?? 0;
      const subtotal = (prev.config?.price ?? 0) +
        (prev.config?.addons ?? []).reduce((sum, a) => sum + a.price, 0) +
        (prev.config?.mobile_surcharge ?? 0);
      const remainingAfterCoupon = subtotal - couponDiscount;

      const REDEEM_RATE = 0.05;
      const REDEEM_MINIMUM = 100;
      const maxPointsForBalance = Math.floor(remainingAfterCoupon / REDEEM_RATE);
      const maxLoyaltyPointsRaw = Math.min(prev.loyaltyPointsBalance, maxPointsForBalance);
      const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / REDEEM_MINIMUM) * REDEEM_MINIMUM;
      const cappedPoints = Math.min(points, maxLoyaltyPointsUsable);

      return { ...prev, loyaltyPointsToUse: cappedPoints };
    });
  }

  // Step 5: Payment success
  function handlePaymentSuccess(paymentIntentId: string) {
    setState((prev) => ({ ...prev, paymentIntentId }));
    handleConfirm(paymentIntentId);
  }

  // Final: Confirm booking
  async function handleConfirm(paymentIntentId?: string) {
    const { service, config, date, time, customer, vehicle, paymentOption, appliedCoupon, loyaltyPointsToUse } = state;
    if (!service || !config || !date || !time || !customer || !vehicle) {
      throw new Error('Missing booking data');
    }

    const loyaltyDiscount = loyaltyPointsToUse * 0.05;

    const grandTotal = config.price +
      config.addons.reduce((sum, a) => sum + a.price, 0) +
      (config.mobile_surcharge ?? 0) -
      (appliedCoupon?.discount ?? 0) -
      loyaltyDiscount;

    const isFullPayment = grandTotal < 100;
    const depositAmount = paymentIntentId ? (isFullPayment ? grandTotal : 50) : undefined;

    const STRIPE_MINIMUM = 0.50;
    const discountsCoverAmount = grandTotal < STRIPE_MINIMUM;
    const effectivePaymentOption = discountsCoverAmount
      ? 'full'
      : paymentOption ?? (paymentIntentId ? (isFullPayment ? 'full' : 'deposit') : 'pay_on_site');

    const body = {
      service_id: service.id,
      tier_name: config.tier_name,
      price: config.price,
      date,
      time,
      duration_minutes: service.base_duration_minutes,
      is_mobile: config.is_mobile,
      mobile_zone_id: config.mobile_zone_id,
      mobile_address: config.mobile_address,
      mobile_surcharge: config.mobile_surcharge,
      customer,
      vehicle: {
        ...vehicle,
        size_class: config.size_class ?? vehicle.size_class ?? null,
      },
      addons: config.addons.map((a) => ({
        service_id: a.service_id,
        name: a.name,
        price: a.price,
        tier_name: a.tier_name,
      })),
      channel: isPortal ? 'portal' as const : 'online' as const,
      payment_intent_id: paymentIntentId ?? state.paymentIntentId ?? undefined,
      payment_option: effectivePaymentOption,
      deposit_amount: discountsCoverAmount ? 0 : depositAmount,
      coupon_code: appliedCoupon?.code ?? undefined,
      coupon_discount: appliedCoupon?.discount ?? undefined,
      loyalty_points_used: loyaltyPointsToUse > 0 ? loyaltyPointsToUse : undefined,
      loyalty_discount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
    };

    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Booking failed');
    }

    const confirmPaymentOption = discountsCoverAmount
      ? 'full' as const
      : effectivePaymentOption === 'full'
        ? 'full' as const
        : effectivePaymentOption === 'deposit'
          ? 'deposit' as const
          : effectivePaymentOption === 'pay_on_site'
            ? 'pay_on_site' as const
            : null;

    const amountCharged = paymentIntentId
      ? (isFullPayment || discountsCoverAmount ? grandTotal : 50)
      : 0;

    setConfirmation({
      appointment: result.appointment,
      serviceName: service.name,
      isMobile: config.is_mobile,
      mobileAddress: config.mobile_address || null,
      paymentOption: confirmPaymentOption,
      amountCharged,
      grandTotal,
      customerEmail: customer.email,
    });
  }

  // Compute duration for scheduling
  const totalDuration =
    (state.service?.base_duration_minutes ?? 60) +
    (state.config?.addons ?? []).reduce((sum, _a) => {
      const addonService = findAddonService(_a.service_id);
      return sum + (addonService?.base_duration_minutes ?? 0);
    }, 0);

  function findAddonService(id: string): BookableService['service_addon_suggestions'][number]['addon_service'] | null {
    for (const cat of categories) {
      for (const svc of cat.services) {
        for (const suggestion of svc.service_addon_suggestions) {
          if (suggestion.addon_service?.id === id) {
            return suggestion.addon_service;
          }
        }
      }
    }
    return null;
  }

  return (
    <div className={cn('mx-auto', step === 1 ? 'max-w-6xl' : 'max-w-3xl')}>
      <StepIndicator
        currentStep={step}
        requirePayment={requirePayment}
        onStepClick={handleStepClick}
      />

      {step === 1 && (
        <>
          <StepServiceSelect
            categories={filteredCategories}
            selectedServiceId={state.service?.id ?? null}
            onSelect={handleServiceSelect}
            vehicleCategories={vehicleCategories}
            selectedCategoryKey={state.selectedCategory}
            onCategoryChange={handleCategoryChange}
            mobileZones={mobileZones}
            initialConfig={state.config ?? undefined}
          />
          {editEntryStep === 1 && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => { setEditEntryStep(null); goToStep(4); }}
                className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
              >
                Back to Review
              </Button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <StepSchedule
          businessHours={businessHours}
          bookingConfig={bookingConfig}
          durationMinutes={totalDuration}
          initialDate={state.date}
          initialTime={state.time}
          onContinue={handleScheduleContinue}
          onBack={() => editEntryStep === 2 ? (setEditEntryStep(null), goToStep(4)) : goToStep(1)}
        />
      )}

      {step === 3 && (
        <StepCustomerInfo
          initialCustomer={
            state.customer ??
            (customerData
              ? {
                  first_name: customerData.customer.first_name,
                  last_name: customerData.customer.last_name,
                  phone: customerData.customer.phone ?? '',
                  email: customerData.customer.email ?? '',
                }
              : rebookData
                ? {
                    first_name: rebookData.customer.first_name,
                    last_name: rebookData.customer.last_name,
                    phone: rebookData.customer.phone ?? '',
                    email: rebookData.customer.email ?? '',
                  }
                : {})
          }
          initialVehicle={
            state.vehicle ??
            (rebookData?.vehicle
              ? {
                  vehicle_type: rebookData.vehicle.vehicle_type,
                  size_class: rebookData.vehicle.size_class,
                  year: rebookData.vehicle.year,
                  make: rebookData.vehicle.make,
                  model: rebookData.vehicle.model,
                  color: rebookData.vehicle.color,
                }
              : {})
          }
          requireSizeClass={
            state.service?.pricing_model === 'vehicle_size' ||
            (state.service?.pricing_model === 'scope' &&
              state.config?.size_class !== null &&
              state.config?.size_class !== undefined)
          }
          initialSizeClass={state.config?.size_class ?? null}
          savedVehicles={customerData?.vehicles ?? []}
          onContinue={handleCustomerContinue}
          onBack={() => editEntryStep === 3 ? (setEditEntryStep(null), goToStep(4)) : goToStep(2)}
          defaultVehicleCategory={state.selectedCategory}
          selectedService={state.service}
          onBackToServices={() => { goToStep(1); }}
        />
      )}

      {step === 4 &&
        state.service &&
        state.config &&
        state.date &&
        state.time &&
        state.customer &&
        state.vehicle && (
          <StepReview
            serviceName={state.service.name}
            serviceId={state.service.id}
            tierName={state.config.tier_label ?? state.config.tier_name}
            price={state.config.price}
            date={state.date}
            time={state.time}
            durationMinutes={totalDuration}
            isMobile={state.config.is_mobile}
            mobileAddress={state.config.mobile_address}
            mobileSurcharge={state.config.mobile_surcharge}
            customer={state.customer}
            vehicle={state.vehicle}
            addons={state.config.addons as BookingAddonInput[]}
            couponCode={couponCode ?? null}
            onConfirm={handleReviewContinue}
            onBack={() => goToStep(3)}
            confirmButtonText={
              state.paymentOption === 'pay_on_site'
                ? 'Confirm Booking'
                : requirePayment
                  ? 'Continue to Payment'
                  : 'Confirm Booking'
            }
            isPortal={isPortal}
            isExistingCustomer={state.isExistingCustomer ?? false}
            paymentOption={state.paymentOption}
            onPaymentOptionChange={handlePaymentOptionChange}
            appliedCoupon={state.appliedCoupon}
            onCouponApply={handleCouponApply}
            availableCoupons={state.availableCoupons}
            requirePayment={requirePayment}
            loyaltyPointsBalance={state.loyaltyPointsBalance}
            loyaltyPointsToUse={state.loyaltyPointsToUse}
            onLoyaltyPointsChange={handleLoyaltyPointsChange}
            onEditService={() => handleEditFromReview(1)}
            onEditSchedule={() => handleEditFromReview(2)}
            onEditInfo={() => handleEditFromReview(3)}
            autoApplyCouponOnMount={!!couponCode && !urlCouponAttempted}
            onCouponAutoApplyAttempted={() => setUrlCouponAttempted(true)}
          />
        )}

      {step === 5 && state.config && (() => {
          const loyaltyDiscount = state.loyaltyPointsToUse * 0.05;

          const grandTotal = Math.max(0,
            state.config.price +
            state.config.addons.reduce((sum, a) => sum + a.price, 0) +
            (state.config.mobile_surcharge ?? 0) -
            (state.appliedCoupon?.discount ?? 0) -
            loyaltyDiscount
          );

          const STRIPE_MINIMUM = 0.50;
          if (grandTotal < STRIPE_MINIMUM) {
            return (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                  <p className="text-sm font-medium text-green-400">
                    {grandTotal <= 0
                      ? 'Your discounts cover the full amount - no payment required!'
                      : `Remaining balance of $${grandTotal.toFixed(2)} is below minimum - no payment required!`}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => goToStep(4)} className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">
                    Back
                  </Button>
                  <Button onClick={() => handleConfirm()} className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200">
                    Complete Booking
                  </Button>
                </div>
              </div>
            );
          }

          const isFullPayment = grandTotal < 100;
          const paymentAmount = isFullPayment ? grandTotal : 50;
          const remainingAmount = grandTotal - paymentAmount;

          return (
            <StepPayment
              amount={paymentAmount}
              totalAmount={grandTotal}
              remainingAmount={remainingAmount}
              isDeposit={!isFullPayment}
              onPaymentSuccess={handlePaymentSuccess}
              onBack={() => goToStep(4)}
            />
          );
        })()}
    </div>
  );
}
