'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Phone, ArrowLeft, CheckCircle } from 'lucide-react';
import { formatPhone } from '@/lib/utils/format';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import type { VehicleSelection } from './step-vehicle';

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

  // Fire block-view audit event on mount (denominator for conversion tracking)
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

  const [callbackName, setCallbackName] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');
  const [callbackEmail, setCallbackEmail] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const vehicleDesc = cleanVehicleDescription({
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  });

  async function handleCallbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!callbackName.trim() || !callbackPhone.trim()) return;

    setSubmitting(true);
    try {
      await fetch('/api/public/specialty-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: callbackName.trim(),
          phone: callbackPhone.trim(),
          email: callbackEmail.trim() || null,
          preferred_time: callbackTime.trim() || null,
          vehicle_year: vehicle.year,
          vehicle_make: vehicle.make,
          vehicle_model: vehicle.model,
          size_class: vehicle.size_class,
        }),
      });
      setSubmitted(true);
    } catch {
      // Silently fail — staff notification is best-effort
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

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

      {/* Phone CTA */}
      <a
        href={`tel:${businessPhone}`}
        className="inline-flex items-center gap-2 rounded-lg bg-lime-600 px-6 py-3 text-lg font-semibold text-white shadow-md hover:bg-lime-700 transition-colors"
      >
        <Phone className="h-5 w-5" />
        Call us now: {formatPhone(businessPhone)}
      </a>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-sm text-gray-500">or</span>
        </div>
      </div>

      {/* Callback form */}
      {submitted ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <p className="font-medium text-green-800">Callback requested!</p>
          <p className="text-sm text-green-700">
            One of our specialists will reach out soon.
          </p>
        </div>
      ) : (
        <form onSubmit={handleCallbackSubmit} className="space-y-3 text-left">
          <p className="text-sm font-medium text-gray-700 text-center">Request a callback</p>
          <FormField label="Name" required>
            <Input
              value={callbackName}
              onChange={(e) => setCallbackName(e.target.value)}
              placeholder="Your name"
              required
              className="text-base sm:text-sm"
            />
          </FormField>
          <FormField label="Phone" required>
            <Input
              type="tel"
              value={callbackPhone}
              onChange={(e) => setCallbackPhone(e.target.value)}
              placeholder="(555) 555-5555"
              required
              className="text-base sm:text-sm"
            />
          </FormField>
          <FormField label="Email">
            <Input
              type="email"
              value={callbackEmail}
              onChange={(e) => setCallbackEmail(e.target.value)}
              placeholder="you@example.com"
              className="text-base sm:text-sm"
            />
          </FormField>
          <FormField label="Best time to reach you">
            <Input
              value={callbackTime}
              onChange={(e) => setCallbackTime(e.target.value)}
              placeholder="e.g., Weekday afternoons"
              className="text-base sm:text-sm"
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Sending...' : 'Request Callback'}
          </Button>
        </form>
      )}

      {/* Edit vehicle link */}
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
