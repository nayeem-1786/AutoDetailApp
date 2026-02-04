'use client';

import { useState } from 'react';
import { CalendarDays, Clock, Truck, User, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/format';
import { VEHICLE_SIZE_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/utils/constants';
import type { BookingCustomerInput, BookingVehicleInput, BookingAddonInput } from '@/lib/utils/validation';

interface StepReviewProps {
  serviceName: string;
  tierName: string | null;
  price: number;
  date: string;
  time: string;
  durationMinutes: number;
  isMobile: boolean;
  mobileAddress: string;
  mobileSurcharge: number;
  customer: BookingCustomerInput;
  vehicle: BookingVehicleInput;
  addons: BookingAddonInput[];
  couponCode?: string | null;
  onConfirm: () => Promise<void>;
  onBack: () => void;
}

export function StepReview({
  serviceName,
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
}: StepReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
  const grandTotal = price + addonTotal + mobileSurcharge;

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

        {/* Customer */}
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

        {/* Price Breakdown */}
        <div className="rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700">
            Price Breakdown
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
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
            <p className="text-xs text-gray-500">
              Payment collected at time of service
            </p>
          </div>
        </div>

        {/* Coupon Code */}
        {couponCode && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-900">
              Coupon Code: <span className="font-mono font-bold">{couponCode}</span>
            </p>
            <p className="mt-1 text-xs text-green-700">
              Your discount will be applied when payment is collected at time of service.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

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
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Spinner size="sm" className="text-white" />
                Booking...
              </>
            ) : (
              'Confirm Booking'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
