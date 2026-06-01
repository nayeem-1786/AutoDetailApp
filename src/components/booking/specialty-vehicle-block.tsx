'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { QuoteRequestForm } from './quote-request-form';
import type { VehicleSelection } from './step-vehicle';

/**
 * SpecialtyVehicleBlock — Step 1 callback CTA for exotic/classic
 * vehicles (Session 29).
 *
 * Session U-B.3 (2026-06-01): refactored to use the shared
 * `<QuoteRequestForm>` base introduced for W3. The component's
 * external API (props consumed by `booking-wizard.tsx`) is unchanged;
 * internally the form + network + success-state are now shared with
 * `<RequestQuoteCard>` instead of duplicated. The block-view
 * telemetry, the vehicle-specific headline/body copy, and the
 * Edit-my-vehicle footer link remain owned by this wrapper — those
 * are the Step-1-specific bits the shared base intentionally doesn't
 * know about.
 */
interface SpecialtyVehicleBlockProps {
  vehicle: VehicleSelection;
  businessPhone: string;
  onEditVehicle: () => void;
}

export function SpecialtyVehicleBlock({
  vehicle,
  businessPhone,
  onEditVehicle,
}: SpecialtyVehicleBlockProps) {
  // Session 29: vehicle specialty status is derived from size_class directly.
  // Exotic wins for dual-flag vehicles (classifier already resolved that precedence),
  // so we only need to check whether size_class is 'classic' or 'exotic'.
  const vehicleWord: 'exotic' | 'classic' = vehicle.size_class === 'classic' ? 'classic' : 'exotic';

  // Fire block-view audit event on mount (denominator for conversion tracking).
  // Stays in the wrapper rather than the shared base — RequestQuoteCard
  // doesn't have an equivalent tracking endpoint yet, and pushing this
  // into the base would force every consumer to opt in/out.
  const viewLoggedRef = useRef(false);
  useEffect(() => {
    if (viewLoggedRef.current) return;
    viewLoggedRef.current = true;
    fetch('/api/public/specialty-block-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicle_year: vehicle.year,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        size_class: vehicle.size_class,
      }),
    }).catch(() => {}); // Fire-and-forget
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicleDesc = cleanVehicleDescription({
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  });

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8 text-center">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">
          Let&apos;s talk about your {vehicleWord} vehicle
        </h2>
        <p className="text-gray-600">
          Because every {vehicleWord} vehicle deserves a custom quote, we&apos;d like to speak with
          you directly about detailing your <span className="font-medium">{vehicleDesc}</span>.
          Our pricing for specialty vehicles reflects the extra care, materials, and time required.
        </p>
      </div>

      <QuoteRequestForm
        // Session U-B.3 (2026-06-01): the endpoint now accepts two
        // request_type discriminators ('specialty_vehicle' |
        // 'staff_assessed_service'). It defaults missing values to
        // 'specialty_vehicle' for backward compatibility, but we pass
        // it explicitly so every call site is self-documenting and a
        // future audit can grep the field.
        payloadBase={{
          request_type: 'specialty_vehicle',
          vehicle_year: vehicle.year,
          vehicle_make: vehicle.make,
          vehicle_model: vehicle.model,
          size_class: vehicle.size_class,
        }}
        // eslint-disable-next-line phone/no-raw-display -- pass-through to QuoteRequestForm, which wraps with phoneToE164() (tel:) + formatPhone() (display) at the actual render sites; the wrapped uses live in quote-request-form.tsx
        businessPhone={businessPhone}
      />

      {/* Edit vehicle link — Step-1-specific affordance (lets the
          customer back-up out of the specialty-vehicle branch if they
          picked the wrong size_class). Lives in the wrapper because
          RequestQuoteCard has no equivalent. */}
      <button
        onClick={onEditVehicle}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Edit my vehicle
      </button>
    </div>
  );
}
