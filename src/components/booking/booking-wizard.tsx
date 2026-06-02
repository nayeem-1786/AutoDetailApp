'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { LOYALTY } from '@/lib/utils/constants';
import { STRIPE_MIN_DOLLARS } from '@/lib/utils/money';
import { StepIndicator } from './step-indicator';
import { StepVehicle, type VehicleSelection } from './step-vehicle';
import { StepServiceSelect, type ConfigureResult } from './step-service-select';
import { StepSchedule } from './step-schedule';
import { StepConfirmBook } from './step-confirm-book';
import { BookingConfirmation } from './booking-confirmation';
import { Button } from '@/components/ui/button';
import type { AuthCustomerData } from './inline-auth';
import type { BookableCategory, BookableService, BusinessHours, BookingConfig, RebookData } from '@/lib/data/booking';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import type { MobileZone, VehicleSizeClass, VehicleType, VehicleCategoryRecord, VehicleCategory as VehicleCategoryType } from '@/lib/supabase/types';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';
import { categoryToCompatibilityKey, type VehicleCategory } from '@/lib/utils/vehicle-categories';
import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
import type { ServicePricing } from '@/lib/supabase/types';
import { customerSignOut } from '@/lib/auth/customer-signout';
import { SpecialtyVehicleBlock } from './specialty-vehicle-block';
import { formatCustomerAddress } from '@/lib/utils/format-address';

interface CustomerDataProp {
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    // Phase Mobile-1.1: structured address fields for mobile-address pre-fill.
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
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
  businessPhone?: string;
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
  vehicleData: VehicleSelection | null;
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
  // Phase Mobile-1.1: server-computed save-to-customer action. Null when
  // mobile is off / no customer linked / empty address. Drives the
  // thank-you banner + silent-save toast on the confirmation screen.
  mobileAddressAction: {
    diff: boolean;
    silently_saved: boolean;
    current_profile_address: string | null;
    entered_address: string;
    customer_id: string;
  } | null;
  // Path B Session 2 / Concern 2 (Session #141, 2026-06-02) —
  // server-computed save-to-customer action for the vehicle. Mirrors
  // the shape of `mobileAddressAction.silently_saved` so the
  // confirmation page can fire a single combined transparency toast
  // when both saves happened, or one of two individual toasts.
  // Null when no new vehicle row was inserted (booking used a
  // pre-existing saved vehicle, OR the customer/vehicle linkage was
  // absent). See `src/lib/utils/vehicle-save-action.ts` for the
  // server-side rule.
  vehicleSaveAction: {
    silently_saved: boolean;
    vehicle_id: string;
    customer_id: string;
  } | null;
}

// Step mapping (4-step wizard):
// Step 1: Vehicle Select
// Step 2: Service Select + Configure
// Step 3: Schedule
// Step 4: Confirm & Book (customer info + order summary + coupon/loyalty + payment)

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
  businessPhone,
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

  // Whether this is a portal booking (logged-in customer) — starts from server data,
  // but can become true when user authenticates inline
  const [isPortalDynamic, setIsPortalDynamic] = useState(!!customerData);

  // Auth customer data — set by inline auth in step 4, or from portal customer data
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

  // --- Build initial vehicle data from rebook ---
  function buildRebookVehicle(): VehicleSelection | null {
    if (!rebookData?.vehicle) return null;
    const v = rebookData.vehicle;
    // RebookData.vehicle has vehicle_type but not vehicle_category/id/specialty_tier
    // Derive category from vehicle_type
    const vt = v.vehicle_type;
    const cat = vt === 'standard' ? 'automobile' : (vt as string);
    return {
      vehicle_category: cat,
      vehicle_type: vt,
      size_class: v.size_class ?? null,
      specialty_tier: null,
      make: v.make ?? null,
      model: v.model ?? null,
      year: v.year ?? null,
      color: v.color ?? null,
    };
  }

  // --- URL state restoration ---
  // E5 (Unit B audit, 2026-05-30): accept an optional URLSearchParams arg
  // so the popstate handler can rehydrate from a FRESH read of
  // `window.location.search` rather than the (potentially stale)
  // useSearchParams() hook value at popstate firing time. The default
  // (`searchParams`) preserves the original mount-time behavior.
  function getInitialState(paramsArg?: URLSearchParams): { step: number; state: BookingState } {
    const params: URLSearchParams | ReadonlyURLSearchParams = paramsArg ?? searchParams;
    const urlStep = parseInt(params.get('step') ?? '', 10);
    const urlVehicle = params.get('vehicle') as VehicleSizeClass | null;
    const urlDate = params.get('date');
    const urlTime = params.get('time');
    const urlAddons = params.get('addons');
    const urlCategory = params.get('category') ?? 'automobile';

    // URL vehicle data restoration
    const urlVehicleId = params.get('vehicle_id');
    const urlVehicleCategory = params.get('vehicle_category') ?? urlCategory;
    const urlSizeClass = params.get('size_class');
    const urlMake = params.get('make');
    const urlModel = params.get('model');

    const service = rebookService ?? preSelectedService;
    const rebookVehicle = buildRebookVehicle();

    // Restore vehicle data from URL params
    let restoredVehicleData: VehicleSelection | null = rebookVehicle;
    if (!restoredVehicleData && urlVehicleCategory && urlStep >= 2) {
      if (urlVehicleId && customerData?.vehicles) {
        // Find saved vehicle by ID
        const savedV = customerData.vehicles.find((v) => v.id === urlVehicleId);
        if (savedV) {
          restoredVehicleData = {
            id: savedV.id,
            vehicle_category: savedV.vehicle_category ?? 'automobile',
            vehicle_type: savedV.vehicle_type,
            size_class: savedV.size_class,
            specialty_tier: savedV.specialty_tier ?? null,
            make: savedV.make,
            model: savedV.model,
            year: savedV.year,
            color: savedV.color,
          };
        }
      }
      if (!restoredVehicleData) {
        // Restore from URL params
        restoredVehicleData = {
          vehicle_category: urlVehicleCategory,
          vehicle_type: urlVehicleCategory === 'automobile' ? 'standard' : urlVehicleCategory,
          size_class: urlSizeClass ?? urlVehicle ?? null,
          specialty_tier: null,
          make: urlMake ? decodeURIComponent(urlMake) : null,
          model: urlModel ? decodeURIComponent(urlModel) : null,
          year: null,
          color: null,
        };
      }
    }

    // Base state
    const baseState: BookingState = {
      vehicleData: restoredVehicleData,
      selectedCategory: restoredVehicleData?.vehicle_category ?? urlCategory,
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

    // Default step: rebook → step 3 (schedule), otherwise step 1
    const defaultStep = rebookService ? 3 : 1;

    // If no URL step param or rebook mode, use defaults
    if (!urlStep || isNaN(urlStep) || urlStep < 1 || urlStep > 4 || rebookData) {
      return { step: defaultStep, state: baseState };
    }

    // Step 1: Vehicle — no extra state needed
    if (urlStep === 1) {
      return { step: 1, state: baseState };
    }

    // Step 2+: Need vehicle data
    if (!restoredVehicleData) {
      return { step: 1, state: baseState };
    }

    // Step 2: Service — need vehicle data
    if (urlStep === 2) {
      return { step: 2, state: baseState };
    }

    // Step 3+: Need a service + config
    if (!service) {
      return { step: 2, state: baseState };
    }

    // Step 3+: Try to reconstruct config from URL params
    if (urlStep >= 3 && service) {
      const reconstructedConfig = reconstructConfig(service, urlVehicle, urlAddons);
      if (reconstructedConfig) {
        const restoredState = {
          ...baseState,
          config: reconstructedConfig,
          date: urlStep >= 3 ? urlDate : null,
          time: urlStep >= 3 ? urlTime : null,
        };

        // Step 3: schedule — need config
        if (urlStep === 3) {
          return { step: 3, state: restoredState };
        }

        // Step 4: need config + date + time
        if (urlDate && urlTime) {
          return { step: 4, state: restoredState };
        }

        // Have config but no date/time — go to step 3
        return { step: 3, state: restoredState };
      }

      // Couldn't reconstruct config — go to step 2
      return { step: 2, state: baseState };
    }

    return { step: defaultStep, state: baseState };
  }

  // Reconstruct config from URL params (vehicle size + addon IDs).
  //
  // Item 15f Layer 4: rewritten as a thin dispatcher around
  // `resolveServicePriceWithSale` from the canonical engine per CLAUDE.md
  // Rule 22. Pre-Layer-4 had the same drift bugs Layer 3d fixed in
  // `service-resolver.ts`:
  //   - Missing exotic/classic size_class branches — Ferrari deep-linking
  //     to a step landed at sedan tier price.
  //   - No sale-price handling — sale-active services reconstructed at
  //     standard price.
  //   - Direct `vehicle_size_*_price` column reads (Rule 22 violation).
  //
  // Behavior preserved: `vehicle_size` row-pattern reconstructs to the
  // matching tier; fallback to first tier when vehicle size not provided.
  // `scope` / `specialty` reconstructs to the first tier (the wizard
  // step lets the customer choose; reconstruct picks a deterministic
  // default that the step's auto-select then refines).
  function reconstructConfig(
    service: BookableService,
    vehicleSize: VehicleSizeClass | null,
    addonIdsStr: string | null
  ): ConfigureResult | null {
    const tiers = service.service_pricing;
    const saleWindow = {
      sale_starts_at: service.sale_starts_at,
      sale_ends_at: service.sale_ends_at,
    };

    let tier_name: string | null = null;
    let price = 0;
    let size_class: VehicleSizeClass | null = vehicleSize;

    function synthesize(amount: number, salePrice: number | null): ServicePricing {
      return {
        id: `synthetic-${service.id}`,
        service_id: service.id,
        tier_name: 'synthetic',
        tier_label: null,
        price: amount,
        sale_price: salePrice,
        display_order: 0,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        vehicle_size_exotic_price: null,
        vehicle_size_classic_price: null,
        max_qty: null,
        qty_label: null,
        created_at: '',
      };
    }

    switch (service.pricing_model) {
      case 'flat': {
        if (service.flat_price == null) break;
        price = resolveServicePriceWithSale(
          synthesize(service.flat_price, service.sale_price ?? null),
          null,
          saleWindow,
        ).effectivePrice;
        break;
      }

      case 'vehicle_size': {
        if (vehicleSize) {
          const tier = tiers.find((t) => t.tier_name === vehicleSize);
          if (tier) {
            tier_name = tier.tier_name;
            price = resolveServicePriceWithSale(tier, vehicleSize, saleWindow).effectivePrice;
          }
        }
        if (!price && tiers.length > 0) {
          tier_name = tiers[0].tier_name;
          price = resolveServicePriceWithSale(tiers[0], null, saleWindow).effectivePrice;
          size_class = tiers[0].tier_name as VehicleSizeClass;
        }
        break;
      }

      case 'scope':
      case 'specialty': {
        if (tiers.length > 0) {
          const tier = tiers[0];
          tier_name = tier.tier_name;
          // Engine routes both row + column patterns: passing vehicleSize
          // makes the per-size column dispatch fire for is_vehicle_size_aware
          // tiers; non-size-aware tiers ignore it.
          price = resolveServicePriceWithSale(tier, vehicleSize, saleWindow).effectivePrice;
        }
        break;
      }

      case 'per_unit': {
        if (service.per_unit_price == null) break;
        price = resolveServicePriceWithSale(
          synthesize(service.per_unit_price, service.sale_price ?? null),
          null,
          saleWindow,
        ).effectivePrice;
        break;
      }

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
  // Specialty vehicle block state (Phase 4 — exotic/classic booking gate).
  // Declared here (not below the confirmation early-return) so hook order is stable.
  const [showSpecialtyBlock, setShowSpecialtyBlock] = useState(false);

  // Phase Mobile-1.1: customer's formatted profile address used to pre-fill
  // the mobile address input in Step 2.
  //   - Initial source: customerData (portal user or campaign deep-link).
  //   - Backfill source: check-customer endpoint resolution at Step 4 when
  //     a guest's phone matches an existing customer with an address. The
  //     setter is invoked in handleConfirmBook below.
  const [matchedCustomerAddress, setMatchedCustomerAddress] =
    useState<string | null>(() =>
      customerData?.customer
        ? formatCustomerAddress({
            address_line_1: customerData.customer.address_line_1 ?? null,
            address_line_2: customerData.customer.address_line_2 ?? null,
            city: customerData.customer.city ?? null,
            state: customerData.customer.state ?? null,
            zip: customerData.customer.zip ?? null,
          })
        : null
    );

  // --- URL state sync ---
  // E5 (Unit B audit, 2026-05-30): `isInitial=true` calls use
  // `history.replaceState` so the mount doesn't add a duplicate history
  // entry on top of the bare `/book` URL the user actually navigated to.
  // Subsequent step transitions use `history.pushState` so browser
  // back walks the wizard step-by-step instead of exiting the booking
  // page entirely (the prior `replaceState`-everywhere behavior was the
  // root of the operator's "no way back" perception that surfaced in
  // the Unit B audit). Paired with the `popstate` listener below.
  const updateUrl = useCallback((newStep: number, newState: BookingState, isInitial = false) => {
    const params = new URLSearchParams();

    // Always set step
    params.set('step', String(newStep));

    // Vehicle data
    if (newState.vehicleData) {
      if (newState.vehicleData.id) {
        params.set('vehicle_id', newState.vehicleData.id);
      }
      params.set('vehicle_category', newState.vehicleData.vehicle_category);
      if (newState.vehicleData.size_class) {
        params.set('size_class', newState.vehicleData.size_class);
      }
      if (newState.vehicleData.make) {
        params.set('make', encodeURIComponent(newState.vehicleData.make));
      }
      if (newState.vehicleData.model) {
        params.set('model', encodeURIComponent(newState.vehicleData.model));
      }
    }

    // Service slug
    if (newState.service) {
      params.set('service', newState.service.slug);
    }

    // Vehicle size (for config reconstruction)
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

    // Vehicle category (also in vehicleData, but keep for backwards compat)
    if (newState.selectedCategory && newState.selectedCategory !== 'automobile') {
      params.set('category', newState.selectedCategory);
    }

    // Preserve rebook param
    const currentRebook = searchParams.get('rebook');
    if (currentRebook) {
      params.set('rebook', currentRebook);
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    if (isInitial) {
      window.history.replaceState(null, '', newUrl);
    } else {
      window.history.pushState(null, '', newUrl);
    }
  }, [couponCode, searchParams]);

  // Set initial URL on first render. Uses `isInitial=true` so the bare
  // `/book` URL is replaced (no duplicate history entry) — see updateUrl
  // header for the pushState/replaceState rationale.
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      updateUrl(step, state, true);
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // E5 (Unit B audit, 2026-05-30): popstate listener so browser back/
  // forward walks the wizard steps. Reads FRESH `window.location.search`
  // because `useSearchParams()` may not have settled by the time the
  // synchronous popstate handler fires. Re-derives step + full state via
  // `getInitialState(params)` so URL-bound data (vehicle, service slug,
  // date, time, addons) rehydrates exactly as it would on a deep-link
  // refresh — keeping the back/forward path symmetric with the deep-link
  // path. The closure captures the latest `getInitialState` via React's
  // re-render cycle; deps are intentionally empty (the listener is
  // attached once at mount and reads fresh URL on every fire).
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const restored = getInitialState(params);
      setStep(restored.step);
      setState(restored.state);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Custom setStep that also updates URL (push, not replace, so browser
  // back walks the wizard — see updateUrl header).
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
        vehicleDescription={state.vehicleData
          ? cleanVehicleDescription({ year: state.vehicleData.year, color: state.vehicleData.color, make: state.vehicleData.make, model: state.vehicleData.model }) || null
          : null}
        mobileAddressAction={confirmation.mobileAddressAction}
        vehicleSaveAction={confirmation.vehicleSaveAction}
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
    updateUrl(2, newState);
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

  // Step 1: Vehicle → advance to Step 2 (or block if specialty)
  function handleVehicleSelect(vehicle: VehicleSelection) {
    const newState: BookingState = {
      ...state,
      vehicleData: vehicle,
      selectedCategory: vehicle.vehicle_category,
      // Reset service/config only if category actually changed (not on first vehicle selection)
      service: state.vehicleData && state.vehicleData.vehicle_category !== vehicle.vehicle_category ? null : state.service,
      config: state.vehicleData && state.vehicleData.vehicle_category !== vehicle.vehicle_category ? null : state.config,
    };
    setState(newState);

    // Gate: if vehicle is exotic or classic, show block page instead of step 2.
    // Session 29: trigger keyed off size_class (canonical taxonomy), not parallel flags.
    if (vehicle.size_class === 'exotic' || vehicle.size_class === 'classic') {
      setShowSpecialtyBlock(true);
      return;
    }

    setShowSpecialtyBlock(false);
    // Always go to Step 2 — even during edit flow, so pricing recalculates
    // for the new vehicle size. editEntryStep stays set to enable "Back to Booking".
    goToStep(2, newState);
  }

  // Step 2: Select service + configure (merged)
  function handleServiceSelect(service: BookableService, config: ConfigureResult) {
    const newState: BookingState = {
      ...state,
      service,
      config,
      // When editing from step 4, preserve date/time; otherwise reset
      date: editEntryStep !== null ? state.date : null,
      time: editEntryStep !== null ? state.time : null,
    };
    setState(newState);

    // Always go to Step 3 — even during edit flow, so schedule validity
    // is verified for the new service duration. editEntryStep stays set.
    goToStep(3, newState);
  }

  // Step 3: Schedule → advance to Step 4
  // Fetch customer check / coupons / loyalty data before entering step 4
  async function handleScheduleContinue(date: string, time: string) {
    const newState = { ...state, date, time };
    setState(newState);

    if (editEntryStep !== null) {
      setEditEntryStep(null);
      goToStep(4, newState);
      return;
    }

    // Fetch customer data for step 4
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
        goToStep(4, updatedState);
      } catch (err) {
        console.error('Failed to fetch customer data:', err);
        goToStep(4, newState);
      }
    } else {
      // For guest bookings, customer check happens via phone lookup inside step-confirm-book
      goToStep(4, newState);
    }
  }

  // Step 4: Confirm & Book — receives customer + vehicle + optional paymentIntentId
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
          // Phase Mobile-1.1: backfill the matched customer's formatted
          // profile address so a return-to-Step-2 re-renders with pre-fill.
          if (data.customer) {
            const formatted = formatCustomerAddress({
              address_line_1: data.customer.address_line_1 ?? null,
              address_line_2: data.customer.address_line_2 ?? null,
              city: data.customer.city ?? null,
              state: data.customer.state ?? null,
              zip: data.customer.zip ?? null,
            });
            setMatchedCustomerAddress(formatted);
          }
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

  // Handle sign out from inline auth — stay on booking page
  async function handleSignOut() {
    await customerSignOut({
      skipRedirect: true,
      onSignOut: () => {
        setAuthCustomerData(null);
        setIsPortalDynamic(false);
        setState((prev) => ({
          ...prev,
          isExistingCustomer: null,
          availableCoupons: [],
          loyaltyPointsBalance: 0,
          loyaltyPointsToUse: 0,
        }));
      },
    });
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

    const discountsCoverAmount = grandTotal < STRIPE_MIN_DOLLARS;

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
      customerEmail: customer.email || null,
      mobileAddressAction: result.mobile_address_action ?? null,
      vehicleSaveAction: result.vehicle_save_action ?? null,
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

  // Build order summary for step 3
  const orderSummary = state.service && state.config ? {
    serviceName: state.service.name,
    tierName: state.config.tier_label ?? state.config.tier_name ?? null,
    price: state.config.price,
    addons: (state.config.addons ?? []).map(a => ({ name: a.name, price: a.price })),
    mobileSurcharge: state.config.mobile_surcharge ?? 0,
    total: (state.config.price) +
      (state.config.addons ?? []).reduce((s, a) => s + a.price, 0) +
      (state.config.mobile_surcharge ?? 0),
    durationMinutes: totalDuration,
    vehicleDescription: state.vehicleData
      ? [state.vehicleData.year, state.vehicleData.color, state.vehicleData.make, state.vehicleData.model].filter(Boolean).join(' ') || null
      : null,
  } : undefined;

  return (
    <div className={cn('mx-auto', step === 2 ? 'max-w-6xl' : 'max-w-5xl')}>
      <StepIndicator
        currentStep={step}
        onStepClick={handleStepClick}
      />

      {step === 1 && showSpecialtyBlock && state.vehicleData && businessPhone && (
        <SpecialtyVehicleBlock
          vehicle={state.vehicleData}
          businessPhone={businessPhone}
          onEditVehicle={() => setShowSpecialtyBlock(false)}
        />
      )}

      {step === 1 && !showSpecialtyBlock && (
        <>
          <StepVehicle
            customerData={authCustomerData}
            onContinue={handleVehicleSelect}
            initialVehicle={state.vehicleData}
          />
          {editEntryStep !== null && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => { setEditEntryStep(null); goToStep(4); }}
                className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
              >
                Back to Booking
              </Button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <StepServiceSelect
            categories={filteredCategories}
            selectedServiceId={state.service?.id ?? null}
            onSelect={handleServiceSelect}
            vehicleCategories={vehicleCategories}
            selectedCategoryKey={state.selectedCategory}
            mobileZones={mobileZones}
            initialConfig={state.config ?? undefined}
            vehicleSizeClass={(state.vehicleData?.size_class as VehicleSizeClass) ?? null}
            vehicleSpecialtyTier={state.vehicleData?.specialty_tier ?? null}
            customerProfileAddress={matchedCustomerAddress}
            // N1 (Unit B audit): wire the new Back-to-Step-1 affordance.
            // Suppressed during edit-from-Step-4 mode so the "Back to
            // Booking" button below remains the only backward path —
            // stacking two would be a UX regression.
            onBack={editEntryStep === null ? () => goToStep(1) : undefined}
            // W3 (Unit B audit — Session U-B.3): pass through business
            // phone + Step 1 vehicle context so RequestQuoteCard can
            // render the Call CTA + include the vehicle on the staff
            // notification SMS when the selected Step 2 service has
            // `staff_assessed=true`. Both are optional — RequestQuoteCard
            // degrades gracefully when either is missing.
            businessPhone={businessPhone}
            customerVehicle={state.vehicleData}
          />
          {editEntryStep !== null && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => { setEditEntryStep(null); goToStep(4); }}
                className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface"
              >
                Back to Booking
              </Button>
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <StepSchedule
          businessHours={businessHours}
          bookingConfig={bookingConfig}
          durationMinutes={totalDuration}
          initialDate={state.date}
          initialTime={state.time}
          onContinue={handleScheduleContinue}
          onBack={() => goToStep(2)}
          orderSummary={orderSummary}
        />
      )}

      {step === 4 &&
        state.service &&
        state.config &&
        state.date &&
        state.time && (
          <StepConfirmBook
            serviceName={state.service.name}
            serviceId={state.service.id}
            // W6 (Unit B audit): pass through so the order summary mirrors
            // the Step 2 service card's special-requirements note.
            serviceSpecialRequirements={state.service.special_requirements ?? null}
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
            onBack={() => goToStep(3)}
            onEditStep={(targetStep) => { setEditEntryStep(targetStep); goToStep(targetStep); }}
            autoApplyCouponOnMount={!!couponCode && !urlCouponAttempted}
            onCouponAutoApplyAttempted={() => setUrlCouponAttempted(true)}
            vehicleCategory={state.selectedCategory}
            selectedSizeClass={state.config.size_class ?? null}
            depositAmount={bookingConfig.default_deposit_amount}
            vehicleData={state.vehicleData}
          />
        )}
    </div>
  );
}
