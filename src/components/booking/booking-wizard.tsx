'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { LOYALTY } from '@/lib/utils/constants';
import { StepIndicator } from './step-indicator';
import { StepServiceSelect, type ConfigureResult } from './step-service-select';
import { StepSchedule } from './step-schedule';
import { StepConfirmBook } from './step-confirm-book';
import { BookingConfirmation } from './booking-confirmation';
import { Button } from '@/components/ui/button';
import type { AuthCustomerData } from './inline-auth';
import type { BookableCategory, BookableService, BusinessHours, BookingConfig, RebookData } from '@/lib/data/booking';
import type { MobileZone, VehicleSizeClass, VehicleType, VehicleCategoryRecord, VehicleCategory as VehicleCategoryType } from '@/lib/supabase/types';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';
import { categoryToCompatibilityKey, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { createClient } from '@/lib/supabase/client';

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
  paymentOption: 'full' | 'deposit' | 'pay_on_site' | null;
  appliedCoupon: AppliedCoupon | null;
  availableCoupons: AvailableCoupon[];
  loyaltyPointsBalance: number;
  loyaltyPointsToUse: number;
  hasTransactionHistory: boolean;
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

// Step mapping (3-step wizard):
// Step 1: Service Select + Configure
// Step 2: Schedule
// Step 3: Confirm & Book (customer info + order summary + coupon/loyalty + payment)

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

  // Whether this is a portal booking (logged-in customer) — starts from server data,
  // but can become true when user authenticates inline
  const [isPortalDynamic, setIsPortalDynamic] = useState(!!customerData);

  // Auth customer data — set by inline auth in step 3, or from portal customer data
  const [authCustomerData, setAuthCustomerData] = useState<AuthCustomerData | null>(
    customerData
      ? {
          customer: {
            first_name: customerData.customer.first_name,
            last_name: customerData.customer.last_name,
            phone: customerData.customer.phone ?? '',
            email: customerData.customer.email ?? '',
          },
          vehicles: customerData.vehicles.map((v) => ({
            id: v.id,
            vehicle_type: v.vehicle_type,
            vehicle_category: v.vehicle_category,
            size_class: v.size_class,
            specialty_tier: v.specialty_tier,
            year: v.year,
            make: v.make,
            model: v.model,
            color: v.color,
          })),
        }
      : rebookData
        ? {
            customer: {
              first_name: rebookData.customer.first_name,
              last_name: rebookData.customer.last_name,
              phone: rebookData.customer.phone ?? '',
              email: rebookData.customer.email ?? '',
            },
            vehicles: [],
          }
        : null
  );

  const isPortal = isPortalDynamic;

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
      hasTransactionHistory: false,
    };

    // Default step: rebook → step 2 (schedule), otherwise step 1
    const defaultStep = rebookService ? 2 : 1;

    // If no URL step param or rebook mode, use defaults
    if (!urlStep || isNaN(urlStep) || urlStep < 1 || urlStep > 3 || rebookData) {
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

        // Step 3: need config + date + time
        if (urlDate && urlTime) {
          return { step: 3, state: restoredState };
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
      // When editing from step 3, preserve date/time; otherwise reset
      date: editEntryStep !== null ? state.date : null,
      time: editEntryStep !== null ? state.time : null,
    };
    setState(newState);

    if (editEntryStep !== null) {
      // Editing from step 3 — go back to step 3
      setEditEntryStep(null);
      goToStep(3, newState);
    } else {
      goToStep(2, newState);
    }
  }

  // Step 2: Schedule → advance to Step 3
  // Fetch customer check / coupons / loyalty data before entering step 3
  async function handleScheduleContinue(date: string, time: string) {
    const newState = { ...state, date, time };
    setState(newState);

    if (editEntryStep !== null) {
      setEditEntryStep(null);
      goToStep(3, newState);
      return;
    }

    // Fetch customer data for step 3
    if (isPortal) {
      try {
        const couponParams = new URLSearchParams();
        if (newState.service?.id) couponParams.set('service_id', newState.service.id);
        const addonServiceIds = newState.config?.addons?.map((a) => a.service_id) || [];
        if (addonServiceIds.length > 0) couponParams.set('addon_ids', addonServiceIds.join(','));
        const couponUrl = `/api/customer/coupons${couponParams.toString() ? `?${couponParams.toString()}` : ''}`;

        const [couponsRes, loyaltyRes] = await Promise.all([
          fetch(couponUrl),
          fetch('/api/customer/loyalty'),
        ]);

        let coupons: AvailableCoupon[] = [];
        let loyaltyBalance = 0;
        let hasHistory = false;

        if (couponsRes.ok) {
          const data = await couponsRes.json();
          coupons = data.data || [];
        }

        if (loyaltyRes.ok) {
          const data = await loyaltyRes.json();
          loyaltyBalance = data.balance || 0;
          hasHistory = data.hasTransactionHistory || false;
        }

        const updatedState = {
          ...newState,
          availableCoupons: coupons,
          loyaltyPointsBalance: loyaltyBalance,
          hasTransactionHistory: hasHistory,
        };
        setState(updatedState);
        goToStep(3, updatedState);
      } catch (err) {
        console.error('Failed to fetch customer data:', err);
        goToStep(3, newState);
      }
    } else {
      // For guest bookings, customer check happens via phone lookup inside step-confirm-book
      // We also do check-customer when they fill in phone/email on the confirm page
      goToStep(3, newState);
    }
  }

  // Step 3: Confirm & Book — receives customer + vehicle + optional paymentIntentId
  async function handleConfirmBook(
    customer: BookingCustomerInput,
    vehicle: BookingVehicleInput,
    paymentIntentId?: string
  ) {
    // Update state with customer/vehicle
    const updatedState = { ...state, customer, vehicle, paymentIntentId: paymentIntentId ?? null };
    setState(updatedState);

    // If guest booking and we haven't checked customer yet, do it now for the API call
    if (!isPortal && !state.isExistingCustomer) {
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
          updatedState.isExistingCustomer = data.isExisting;
          setState((prev) => ({ ...prev, isExistingCustomer: data.isExisting }));
        }
      } catch {
        // Continue even if check fails
      }
    }

    // Submit booking
    await handleConfirm(customer, vehicle, paymentIntentId);
  }

  function handlePaymentOptionChange(option: 'full' | 'deposit' | 'pay_on_site') {
    setState((prev) => ({ ...prev, paymentOption: option }));
  }

  // Handle inline auth completion — fetch coupons & loyalty for the newly authenticated customer
  async function handleAuthComplete(data: AuthCustomerData) {
    setAuthCustomerData(data);
    setIsPortalDynamic(true);
    setState((prev) => ({ ...prev, isExistingCustomer: true }));

    // Fetch coupons and loyalty for the authenticated customer
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
      let hasHistory = false;

      if (couponsRes.ok) {
        const couponsData = await couponsRes.json();
        coupons = couponsData.data || [];
      }

      if (loyaltyRes.ok) {
        const loyaltyData = await loyaltyRes.json();
        loyaltyBalance = loyaltyData.balance || 0;
        hasHistory = loyaltyData.hasTransactionHistory || false;
      }

      setState((prev) => ({
        ...prev,
        availableCoupons: coupons,
        loyaltyPointsBalance: loyaltyBalance,
        hasTransactionHistory: hasHistory,
      }));
    } catch {
      // Non-critical — continue without coupons/loyalty
    }
  }

  // Handle sign out from inline auth
  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    // ALWAYS reset state, even if signOut fails
    setAuthCustomerData(null);
    setIsPortalDynamic(false);
    setState((prev) => ({
      ...prev,
      isExistingCustomer: null,
      availableCoupons: [],
      loyaltyPointsBalance: 0,
      loyaltyPointsToUse: 0,
    }));
  }

  function handleCouponApply(coupon: AppliedCoupon | null) {
    setState((prev) => {
      const couponDiscount = coupon?.discount ?? 0;
      const subtotal = (prev.config?.price ?? 0) +
        (prev.config?.addons ?? []).reduce((sum, a) => sum + a.price, 0) +
        (prev.config?.mobile_surcharge ?? 0);
      const remainingAfterCoupon = subtotal - couponDiscount;

      const maxPointsForBalance = Math.floor(remainingAfterCoupon / LOYALTY.REDEEM_RATE);
      const maxLoyaltyPointsRaw = Math.min(prev.loyaltyPointsBalance, maxPointsForBalance);
      const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / LOYALTY.REDEEM_MINIMUM) * LOYALTY.REDEEM_MINIMUM;
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

      const maxPointsForBalance = Math.floor(remainingAfterCoupon / LOYALTY.REDEEM_RATE);
      const maxLoyaltyPointsRaw = Math.min(prev.loyaltyPointsBalance, maxPointsForBalance);
      const maxLoyaltyPointsUsable = Math.floor(maxLoyaltyPointsRaw / LOYALTY.REDEEM_MINIMUM) * LOYALTY.REDEEM_MINIMUM;
      const cappedPoints = Math.min(points, maxLoyaltyPointsUsable);

      return { ...prev, loyaltyPointsToUse: cappedPoints };
    });
  }

  // Final: Confirm booking
  async function handleConfirm(
    customer: BookingCustomerInput,
    vehicle: BookingVehicleInput,
    paymentIntentId?: string
  ) {
    const { service, config, date, time, paymentOption, appliedCoupon, loyaltyPointsToUse } = state;
    if (!service || !config || !date || !time) {
      throw new Error('Missing booking data');
    }

    const loyaltyDiscount = loyaltyPointsToUse * LOYALTY.REDEEM_RATE;

    const grandTotal = config.price +
      config.addons.reduce((sum, a) => sum + a.price, 0) +
      (config.mobile_surcharge ?? 0) -
      (appliedCoupon?.discount ?? 0) -
      loyaltyDiscount;

    const STRIPE_MINIMUM = 0.50;
    const discountsCoverAmount = grandTotal < STRIPE_MINIMUM;

    // Determine effective payment option and deposit amount
    const effectivePaymentOption = discountsCoverAmount
      ? 'full'
      : paymentOption ?? (paymentIntentId ? 'full' : 'pay_on_site');

    let depositAmount: number | undefined;
    if (paymentIntentId) {
      if (effectivePaymentOption === 'full') {
        depositAmount = grandTotal;
      } else if (effectivePaymentOption === 'deposit') {
        depositAmount = bookingConfig.default_deposit_amount;
      }
    }

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
      ? (effectivePaymentOption === 'full' || discountsCoverAmount ? grandTotal : bookingConfig.default_deposit_amount)
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

    // Clear URL params so refresh doesn't restore the booking form
    window.history.replaceState(null, '', window.location.pathname);
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

  // Build order summary for step 2
  const orderSummary = state.service && state.config ? {
    serviceName: state.service.name,
    tierName: state.config.tier_label ?? state.config.tier_name ?? null,
    price: state.config.price,
    addons: (state.config.addons ?? []).map(a => ({ name: a.name, price: a.price })),
    mobileSurcharge: state.config.mobile_surcharge ?? 0,
    total: (state.config.price) +
      (state.config.addons ?? []).reduce((s, a) => s + a.price, 0) +
      (state.config.mobile_surcharge ?? 0),
  } : undefined;

  return (
    <div className={cn('mx-auto', step === 1 ? 'max-w-6xl' : 'max-w-5xl')}>
      <StepIndicator
        currentStep={step}
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
                onClick={() => { setEditEntryStep(null); goToStep(3); }}
                className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
              >
                Back to Booking
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
          onBack={() => editEntryStep === 2 ? (setEditEntryStep(null), goToStep(3)) : goToStep(1)}
          orderSummary={orderSummary}
        />
      )}

      {step === 3 &&
        state.service &&
        state.config &&
        state.date &&
        state.time && (
          <StepConfirmBook
            serviceName={state.service.name}
            serviceId={state.service.id}
            tierName={state.config.tier_label ?? state.config.tier_name}
            price={state.config.price}
            durationMinutes={totalDuration}
            isMobile={state.config.is_mobile}
            mobileAddress={state.config.mobile_address}
            mobileSurcharge={state.config.mobile_surcharge}
            addons={state.config.addons as BookingAddonInput[]}
            date={state.date}
            time={state.time}
            couponCode={couponCode ?? null}
            appliedCoupon={state.appliedCoupon}
            onCouponApply={handleCouponApply}
            availableCoupons={state.availableCoupons}
            isPortal={isPortal}
            isExistingCustomer={state.isExistingCustomer ?? false}
            hasTransactionHistory={state.hasTransactionHistory}
            customerData={authCustomerData}
            onAuthComplete={handleAuthComplete}
            onSignOut={handleSignOut}
            loyaltyPointsBalance={state.loyaltyPointsBalance}
            loyaltyPointsToUse={state.loyaltyPointsToUse}
            onLoyaltyPointsChange={handleLoyaltyPointsChange}
            requirePayment={requirePayment}
            paymentOption={state.paymentOption}
            onPaymentOptionChange={handlePaymentOptionChange}
            onConfirm={handleConfirmBook}
            onBack={() => goToStep(2)}
            autoApplyCouponOnMount={!!couponCode && !urlCouponAttempted}
            onCouponAutoApplyAttempted={() => setUrlCouponAttempted(true)}
            vehicleCategory={state.selectedCategory}
            selectedSizeClass={state.config.size_class ?? null}
            depositAmount={bookingConfig.default_deposit_amount}
          />
        )}
    </div>
  );
}
