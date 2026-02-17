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

      <h2 className="text-2xl font-bold text-site-text">Booking Confirmed!</h2>
      <p className="mt-2 text-site-text-secondary">
        Your appointment has been scheduled. We&apos;ll see you soon!
      </p>

      <div className="mt-8 rounded-lg border border-site-border bg-brand-surface p-6 text-left">
        <h3 className="text-lg font-semibold text-site-text">{serviceName}</h3>

        <dl className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-site-text-muted" />
            <div>
              <dt className="sr-only">Date</dt>
              <dd className="text-sm text-site-text">
                {formatDate(appointment.date + 'T12:00:00')}
              </dd>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-site-text-muted" />
            <div>
              <dt className="sr-only">Time</dt>
              <dd className="text-sm text-site-text">
                {formatTime(appointment.start_time)} &ndash;{' '}
                {formatTime(appointment.end_time)}
              </dd>
            </div>
          </div>

          {isMobile && mobileAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-site-text-muted" />
              <div>
                <dt className="sr-only">Location</dt>
                <dd className="text-sm text-site-text">{mobileAddress}</dd>
              </div>
            </div>
          )}

          <div className="border-t border-site-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-site-text-secondary">Total</span>
              <span className="text-lg font-bold text-site-text">
                {/* Don't show amounts under $0.50 - will be collected at store */}
                {formatCurrency(appointment.total < 0.50 ? 0 : appointment.total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-site-text-muted">
              {appointment.total >= 0.50
                ? 'Payment collected at time of service'
                : 'Fully covered by discounts'}
            </p>
          </div>
          {couponCode && (
            <div className="mt-3 border-t border-site-border pt-3">
              <p className="text-sm font-medium text-site-text-secondary">
                Coupon: <span className="font-mono font-bold">{couponCode}</span>
              </p>
              <p className="text-xs text-site-text-muted">
                Mention this code — your discount will be applied at time of service.
              </p>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-8">
        <Link href="/">
          <Button variant="outline" className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">Back to Home</Button>
        </Link>
      </div>
    </div>
  );
}
