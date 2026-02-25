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
  // Payment state
  paymentOption?: 'deposit' | 'pay_on_site' | 'full' | null;
  amountCharged?: number;
  grandTotal?: number;
  customerEmail?: string | null;
  isPortal?: boolean;
}

function getPaymentFootnote(
  paymentOption: string | null | undefined,
  amountCharged: number | undefined,
  grandTotal: number | undefined,
  appointmentTotal: number
): string {
  const total = grandTotal ?? appointmentTotal;

  // Fully covered by discounts
  if (total < 0.50) {
    return 'Fully covered by discounts — no payment required.';
  }

  // Deposit paid
  if (paymentOption === 'deposit' && amountCharged && amountCharged > 0) {
    const remaining = total - amountCharged;
    return `Your deposit of ${formatCurrency(amountCharged)} has been charged. Remaining balance of ${formatCurrency(remaining)} is due at time of service.`;
  }

  // Full payment made
  if (paymentOption === 'full' && amountCharged && amountCharged > 0) {
    return `Your payment of ${formatCurrency(amountCharged)} has been processed. No additional payment required.`;
  }

  // Pay on site or no payment required
  return 'Payment will be collected at time of service.';
}

export function BookingConfirmation({
  appointment,
  serviceName,
  isMobile,
  mobileAddress,
  couponCode,
  paymentOption,
  amountCharged,
  grandTotal,
  customerEmail,
  isPortal,
}: BookingConfirmationProps) {
  const footnote = getPaymentFootnote(paymentOption, amountCharged, grandTotal, appointment.total);

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mb-6 flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>

      <h2 className="text-2xl font-bold text-site-text">Booking Confirmed!</h2>
      <p className="mt-2 text-site-text-secondary">
        Your appointment has been scheduled. We&apos;ll see you soon!
      </p>
      {customerEmail && (
        <p className="mt-1 text-sm text-site-text-muted">
          A confirmation email has been sent to {customerEmail}.
        </p>
      )}

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
                {formatCurrency((grandTotal ?? appointment.total) < 0.50 ? 0 : (grandTotal ?? appointment.total))}
              </span>
            </div>
            <p className="mt-1 text-xs text-site-text-muted">
              {footnote}
            </p>
          </div>

          {couponCode && (
            <div className="mt-3 border-t border-site-border pt-3">
              <p className="text-sm text-site-text-secondary">
                Coupon <span className="font-mono font-bold text-site-text">{couponCode}</span> applied to your booking.
              </p>
            </div>
          )}
        </dl>
      </div>

      {isPortal && (
        <div className="mt-8 flex justify-center">
          <Link href="/account">
            <Button className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200">
              View My Appointments
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
