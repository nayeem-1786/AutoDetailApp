'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { CouponCard } from '@/components/account/coupon-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { formatPoints, formatCurrency } from '@/lib/utils/format';
import { LOYALTY } from '@/lib/utils/constants';
import { ArrowRight, Camera } from 'lucide-react';

interface CouponRewardData {
  applies_to: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  target_product_name?: string;
  target_service_name?: string;
  target_product_category_name?: string;
  target_service_category_name?: string;
}

interface CouponData {
  id: string;
  code: string;
  name: string | null;
  min_purchase: number | null;
  expires_at: string | null;
  is_single_use: boolean;
  coupon_rewards?: CouponRewardData[];
}

interface LastServiceData {
  date: string;
  vehicle: { year: number; make: string; model: string; color: string | null } | null;
  services: { name: string }[];
  beforeSrc: string | null;
  afterSrc: string | null;
}

export default function AccountDashboardPage() {
  const { customer } = useCustomerAuth();
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  >([]);
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [lastService, setLastService] = useState<LastServiceData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!customer) return;

    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];

    // Load appointments, coupons, and last service photos in parallel
    const [apptResult, couponResult, photosResult] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          `id, status, scheduled_date, scheduled_start_time, scheduled_end_time,
           total_amount, is_mobile, mobile_address,
           appointment_services(price_at_booking, services(name)),
           vehicles(year, make, model, color)`
        )
        .eq('customer_id', customer.id)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(3),
      fetch('/api/customer/coupons').then(async (res) => {
        if (!res.ok) return { data: [] };
        return res.json();
      }),
      fetch('/api/account/photos?limit=1&page=1').then(async (res) => {
        if (!res.ok) return { visits: [] };
        return res.json();
      }),
    ]);

    setUpcomingAppointments(apptResult.data ?? []);
    setCoupons(couponResult.data ?? []);

    // Extract last service with before/after pair
    const visits = photosResult.visits || [];
    if (visits.length > 0) {
      const visit = visits[0];
      // Find a zone with both before + after (prefer exterior)
      let beforeSrc: string | null = null;
      let afterSrc: string | null = null;

      // Try to find exterior before/after first, then any zone
      const intakePhotos = visit.photos?.intake || [];
      const completionPhotos = visit.photos?.completion || [];

      for (const intake of intakePhotos) {
        if (intake.zone.startsWith('exterior_')) {
          const match = completionPhotos.find((c: { zone: string }) => c.zone === intake.zone);
          if (match) {
            beforeSrc = intake.image_url;
            afterSrc = match.image_url;
            break;
          }
        }
      }

      // Fallback to any zone pair
      if (!beforeSrc) {
        for (const intake of intakePhotos) {
          const match = completionPhotos.find((c: { zone: string }) => c.zone === intake.zone);
          if (match) {
            beforeSrc = intake.image_url;
            afterSrc = match.image_url;
            break;
          }
        }
      }

      setLastService({
        date: visit.date,
        vehicle: visit.vehicle,
        services: visit.services,
        beforeSrc,
        afterSrc,
      });
    }

    setLoading(false);
  }, [customer]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!customer) return null;

  return (
    <div className="space-y-8">
      {/* Welcome Banner + Book Button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {customer.first_name}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your appointments, vehicles, and profile.
          </p>
        </div>
        <Link href="/book" className="flex-shrink-0">
          <Button>Book New Appointment</Button>
        </Link>
      </div>

      {/* Loyalty Points */}
      <Link href="/account/loyalty" className="block">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium text-gray-600">Loyalty Points</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatPoints(customer.loyalty_points_balance)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            That&apos;s {formatCurrency(customer.loyalty_points_balance * LOYALTY.REDEEM_RATE)} off your next visit
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Tap to view rewards details
          </p>
        </div>
      </Link>

      {/* Last Service Card */}
      {lastService && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Your Last Service
            </h2>
            <Link href="/account/photos">
              <Button variant="ghost" size="sm" className="gap-1">
                View all photos <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-3 rounded-lg border border-gray-200 p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-900">
                {new Date(lastService.date).toLocaleDateString('en-US', {
                  timeZone: 'America/Los_Angeles',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p className="text-sm text-gray-500">
                {lastService.vehicle
                  ? `${lastService.vehicle.year} ${lastService.vehicle.make} ${lastService.vehicle.model}${lastService.vehicle.color ? ` — ${lastService.vehicle.color}` : ''}`
                  : ''}
                {lastService.vehicle && lastService.services.length > 0 ? ' · ' : ''}
                {lastService.services.map((s) => s.name).join(', ')}
              </p>
            </div>

            {lastService.beforeSrc && lastService.afterSrc ? (
              <div className="max-w-md">
                <BeforeAfterSlider
                  beforeSrc={lastService.beforeSrc}
                  afterSrc={lastService.afterSrc}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                <Camera className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">
                  No before/after photos available for this service
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Coupons */}
      {coupons.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Your Coupons
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            These discounts are ready to use on your next booking.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={{ ...coupon, rewards: coupon.coupon_rewards }} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Appointments */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Upcoming Appointments
          </h2>
          <Link href="/account/appointments">
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        ) : upcomingAppointments.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No upcoming appointments.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingAppointments.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                onStatusChange={loadDashboard}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
