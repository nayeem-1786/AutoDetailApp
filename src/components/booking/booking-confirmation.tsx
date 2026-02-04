'use client';

import { CheckCircle, CalendarDays, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/format';
import Link from 'next/link';

interface BookingConfirmationProps {
  appointment: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    total: number;
  };
  serviceName: string;
  isMobile: boolean;
  mobileAddress?: string | null;
  couponCode?: string | null;
}

export function BookingConfirmation({
  appointment,
  serviceName,
  isMobile,
  mobileAddress,
  couponCode,
}: BookingConfirmationProps) {
  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mb-6 flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
      <p className="mt-2 text-gray-600">
        Your appointment has been scheduled. We&apos;ll see you soon!
      </p>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6 text-left">
        <h3 className="text-lg font-semibold text-gray-900">{serviceName}</h3>

        <dl className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-gray-400" />
            <div>
              <dt className="sr-only">Date</dt>
              <dd className="text-sm text-gray-900">
                {formatDate(appointment.date + 'T12:00:00')}
              </dd>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-gray-400" />
            <div>
              <dt className="sr-only">Time</dt>
              <dd className="text-sm text-gray-900">
                {formatTime(appointment.start_time)} &ndash;{' '}
                {formatTime(appointment.end_time)}
              </dd>
            </div>
          </div>

          {isMobile && mobileAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-gray-400" />
              <div>
                <dt className="sr-only">Location</dt>
                <dd className="text-sm text-gray-900">{mobileAddress}</dd>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total</span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(appointment.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Payment collected at time of service
            </p>
          </div>
          {couponCode && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-sm font-medium text-gray-700">
                Coupon: <span className="font-mono font-bold">{couponCode}</span>
              </p>
              <p className="text-xs text-gray-500">
                Mention this code — your discount will be applied at time of service.
              </p>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-8">
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>
    </div>
  );
}
