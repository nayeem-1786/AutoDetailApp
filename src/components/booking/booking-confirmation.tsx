'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { CheckCircle, CalendarDays, Clock, MapPin, Car, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils/format';
import Link from 'next/link';

interface MobileAddressActionProp {
  diff: boolean;
  silently_saved: boolean;
  current_profile_address: string | null;
  entered_address: string;
  customer_id: string;
}

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
  vehicleDescription?: string | null;
  // Phase Mobile-1.1: server-computed save-to-customer action.
  //   silently_saved=true → show toast on mount (first-time profile save)
  //   diff=true → render the inline save-address banner
  //   null → not applicable (no mobile / no customer / empty address)
  mobileAddressAction?: MobileAddressActionProp | null;
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
  vehicleDescription,
  mobileAddressAction,
}: BookingConfirmationProps) {
  const footnote = getPaymentFootnote(paymentOption, amountCharged, grandTotal, appointment.total);

  // Phase Mobile-1.1: save-to-customer banner state.
  // Dismissed locally once the user taps Update or Dismiss; either way we
  // collapse the banner so it doesn't reappear on re-render.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerSaved, setBannerSaved] = useState(false);

  // Silent-save toast — fires once on mount when the server already
  // persisted the first-time profile address (LOCKED-7).
  useEffect(() => {
    if (mobileAddressAction?.silently_saved) {
      toast.success("We've saved your address to your profile.");
    }
  }, [mobileAddressAction?.silently_saved]);

  async function handleUpdateProfileAddress() {
    if (!mobileAddressAction) return;
    setBannerSaving(true);
    try {
      const res = await fetch('/api/customer/profile/address', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entered_address: mobileAddressAction.entered_address,
          booking_id: appointment.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to update address');
      }
      setBannerSaved(true);
      toast.success('Your address has been updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update address');
    } finally {
      setBannerSaving(false);
    }
  }

  const showBanner =
    !!mobileAddressAction &&
    mobileAddressAction.diff &&
    !mobileAddressAction.silently_saved &&
    !bannerDismissed &&
    !bannerSaved;

  useEffect(() => {
    const duration = 10 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 15, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative z-10 mx-auto max-w-lg text-center">
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
          {vehicleDescription && (
            <div className="flex items-center gap-3">
              <Car className="h-5 w-5 text-site-text-muted" />
              <div>
                <dt className="sr-only">Vehicle</dt>
                <dd className="text-sm text-site-text">{vehicleDescription}</dd>
              </div>
            </div>
          )}

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

      {/* Phase Mobile-1.1: save-to-customer banner (LOCKED-6 Context B) */}
      {showBanner && mobileAddressAction && (
        <div className="mt-6 rounded-lg border border-site-border bg-brand-surface p-5 text-left">
          <div className="flex items-start gap-3">
            <Home className="mt-0.5 h-5 w-5 shrink-0 text-accent-brand" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-site-text">
                Save this address to your profile?
              </h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="grid grid-cols-[auto_1fr] gap-x-2">
                  <dt className="font-medium text-site-text-secondary">
                    Your account address:
                  </dt>
                  <dd className="text-site-text">
                    {mobileAddressAction.current_profile_address ?? '(none)'}
                  </dd>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-2">
                  <dt className="font-medium text-site-text-secondary">
                    Booking address:
                  </dt>
                  <dd className="text-site-text">
                    {mobileAddressAction.entered_address}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleUpdateProfileAddress}
                  disabled={bannerSaving}
                  className="bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover"
                >
                  {bannerSaving ? 'Saving…' : 'Update my address'}
                </Button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  disabled={bannerSaving}
                  className="text-sm font-medium text-site-text-secondary hover:text-site-text"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPortal && (
        <div className="mt-8 flex justify-center">
          <Link href="/account">
            <Button className="bg-accent-brand text-site-text-on-primary hover:bg-accent-brand-hover dark:bg-accent-brand dark:text-site-text-on-primary dark:hover:bg-accent-brand-hover">
              View My Appointments
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
