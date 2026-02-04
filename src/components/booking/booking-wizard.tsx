'use client';

import { useState } from 'react';
import { StepIndicator } from './step-indicator';
import { StepServiceSelect } from './step-service-select';
import { StepConfigure, type ConfigureResult } from './step-configure';
import { StepSchedule } from './step-schedule';
import { StepCustomerInfo } from './step-customer-info';
import { StepReview } from './step-review';
import { BookingConfirmation } from './booking-confirmation';
import type { BookableCategory, BookableService, BusinessHours, BookingConfig, RebookData } from '@/lib/data/booking';
import type { MobileZone, VehicleSizeClass, VehicleType } from '@/lib/supabase/types';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';

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
    size_class: VehicleSizeClass | null;
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
}

interface BookingState {
  service: BookableService | null;
  config: ConfigureResult | null;
  date: string | null;
  time: string | null;
  customer: BookingCustomerInput | null;
  vehicle: BookingVehicleInput | null;
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
}

export function BookingWizard({
  categories,
  mobileZones,
  businessHours,
  bookingConfig,
  preSelectedService,
  rebookData,
  customerData,
  couponCode,
}: BookingWizardProps) {
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

  // Rebook starts at step 3 (schedule) since service/config are pre-set
  const initialStep = rebookService ? 3 : preSelectedService ? 2 : 1;

  const [step, setStep] = useState(initialStep);
  const [state, setState] = useState<BookingState>({
    service: rebookService ?? preSelectedService,
    config: rebookData && rebookService
      ? {
          tier_name: rebookData.tier_name ?? null,
          price: 0, // Will be recalculated by StepConfigure or user must re-configure
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
  });

  // Whether this is a portal booking (logged-in customer)
  const isPortal = !!customerData;
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(
    null
  );

  // If booking confirmed, show confirmation screen
  if (confirmation) {
    return (
      <BookingConfirmation
        appointment={confirmation.appointment}
        serviceName={confirmation.serviceName}
        isMobile={confirmation.isMobile}
        mobileAddress={confirmation.mobileAddress}
        couponCode={couponCode ?? null}
      />
    );
  }

  // Step 1: Select service
  function handleServiceSelect(service: BookableService) {
    setState((prev) => ({
      ...prev,
      service,
      config: null, // reset downstream
      date: null,
      time: null,
    }));
    setStep(2);
  }

  // Step 2: Configure
  function handleConfigureContinue(result: ConfigureResult) {
    setState((prev) => ({ ...prev, config: result }));
    setStep(3);
  }

  // Step 3: Schedule
  function handleScheduleContinue(date: string, time: string) {
    setState((prev) => ({ ...prev, date, time }));
    setStep(4);
  }

  // Step 4: Customer info
  function handleCustomerContinue(
    customer: BookingCustomerInput,
    vehicle: BookingVehicleInput
  ) {
    setState((prev) => ({ ...prev, customer, vehicle }));
    setStep(5);
  }

  // Step 5: Confirm booking
  async function handleConfirm() {
    const { service, config, date, time, customer, vehicle } = state;
    if (!service || !config || !date || !time || !customer || !vehicle) {
      throw new Error('Missing booking data');
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

    setConfirmation({
      appointment: result.appointment,
      serviceName: service.name,
      isMobile: config.is_mobile,
      mobileAddress: config.mobile_address || null,
    });
  }

  // Compute duration for scheduling
  const totalDuration =
    (state.service?.base_duration_minutes ?? 60) +
    (state.config?.addons ?? []).reduce((sum, _a) => {
      // Look up addon duration from categories data
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
    <div className="mx-auto max-w-3xl">
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <StepServiceSelect
          categories={categories}
          selectedServiceId={state.service?.id ?? null}
          onSelect={handleServiceSelect}
        />
      )}

      {step === 2 && state.service && (
        <StepConfigure
          service={state.service}
          mobileZones={mobileZones}
          initialConfig={state.config ?? {}}
          onContinue={handleConfigureContinue}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepSchedule
          businessHours={businessHours}
          bookingConfig={bookingConfig}
          durationMinutes={totalDuration}
          initialDate={state.date}
          initialTime={state.time}
          onContinue={handleScheduleContinue}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
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
          onBack={() => setStep(3)}
        />
      )}

      {step === 5 &&
        state.service &&
        state.config &&
        state.date &&
        state.time &&
        state.customer &&
        state.vehicle && (
          <StepReview
            serviceName={state.service.name}
            tierName={state.config.tier_name}
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
            onConfirm={handleConfirm}
            onBack={() => setStep(4)}
          />
        )}
    </div>
  );
}
