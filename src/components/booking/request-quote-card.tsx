'use client';

import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { QuoteRequestForm } from './quote-request-form';

/**
 * RequestQuoteCard — generic "talk to staff for a quote" inline card.
 *
 * W3 (Unit B audit, 2026-05-30 — Session U-B.3, 2026-06-01) initially
 * uses this card on Step 2 of public booking when the selected
 * service has `staff_assessed=true` (rendered by
 * `step-service-select.tsx` in place of the configure panel + Continue
 * button). The component is intentionally generic — the same shape
 * applies to F2's future "non-priced vehicle category" use case
 * (RV / Boat / Aircraft without a configured price), so the prop
 * interface accepts a generic reason (`serviceName`, optionally
 * `vehicle`) rather than encoding "staff_assessed" in the identifier.
 *
 * Thin wrapper over `<QuoteRequestForm>` (the shared base) — the
 * wrapper composes the service-specific payload + headline/body copy.
 * `<SpecialtyVehicleBlock>` is the sibling consumer on Step 1.
 */
interface VehicleContext {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  /**
   * Loose-typed because Step-1's VehicleSelection.size_class is
   * `string | null` (it carries the canonical taxonomy plus, in
   * practice, the 'exotic' / 'classic' specialty values). The
   * endpoint accepts a free-form string for this field and the audit
   * log preserves whatever the client sent — no value-narrowing
   * happens client-side.
   */
  size_class?: string | null;
}

interface RequestQuoteCardProps {
  /** What the customer wants a quote for. Surfaced in the headline + the staff SMS body. */
  serviceName: string;
  /** Optional service ID — passed through to the audit log for traceability. */
  serviceId?: string | null;
  /** Business phone number for the Call CTA + tel: link. */
  businessPhone: string;
  /** Optional Step 1 vehicle context — included in the staff SMS when present. */
  vehicle?: VehicleContext | null;
}

export function RequestQuoteCard({
  serviceName,
  serviceId,
  businessPhone,
  vehicle,
}: RequestQuoteCardProps) {
  const vehicleDesc = vehicle
    ? cleanVehicleDescription({
        year: vehicle.year ?? undefined,
        make: vehicle.make ?? undefined,
        model: vehicle.model ?? undefined,
      })
    : null;

  return (
    <div className="space-y-6 py-4 text-center">
      <div className="space-y-3">
        <h3 className="text-xl font-bold text-site-text">
          Let&apos;s talk about your {serviceName}
        </h3>
        <p className="text-sm text-site-text-secondary">
          This service requires a custom quote so we can match pricing to the exact
          condition{vehicleDesc ? ` of your ${vehicleDesc}` : ''} and the
          materials and time it&apos;ll need. Call us or request a callback below.
        </p>
      </div>

      <QuoteRequestForm
        payloadBase={{
          request_type: 'staff_assessed_service',
          service_name: serviceName,
          service_id: serviceId ?? null,
          // Vehicle context (optional) — when the customer picked a
          // vehicle on Step 1, ship it so staff have full context on
          // the callback SMS.
          vehicle_year: vehicle?.year ?? null,
          vehicle_make: vehicle?.make ?? null,
          vehicle_model: vehicle?.model ?? null,
          size_class: vehicle?.size_class ?? null,
        }}
        // eslint-disable-next-line phone/no-raw-display -- pass-through to QuoteRequestForm, which wraps with phoneToE164() (tel:) + formatPhone() (display) at the actual render sites; the wrapped uses live in quote-request-form.tsx
        businessPhone={businessPhone}
        formIntroLabel="Request a quote"
        submitLabel="Request Quote"
        successHeadline="Quote request sent!"
        successBody="One of our specialists will reach out soon."
      />
    </div>
  );
}
