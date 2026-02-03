'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { CouponCard } from '@/components/account/coupon-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatPoints } from '@/lib/utils/format';

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

export default function AccountDashboardPage() {
  const { customer } = useCustomerAuth();
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  >([]);
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!customer) return;

    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];

    // Load appointments and coupons in parallel
    const [apptResult, couponResult] = await Promise.all([
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
    ]);

    setUpcomingAppointments(apptResult.data ?? []);
    setCoupons(couponResult.data ?? []);
    setLoading(false);
  }, [customer]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!customer) return null;

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {customer.first_name}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your appointments, vehicles, and profile.
        </p>
      </div>

      {/* Loyalty Points */}
      <Link href="/account/loyalty" className="block">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 transition-colors hover:bg-gray-100">
          <p className="text-sm font-medium text-gray-600">Loyalty Points</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatPoints(customer.loyalty_points_balance)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Tap to view rewards details
          </p>
        </div>
      </Link>

      {/* Active Coupons */}
      {coupons.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Your Coupons
          </h2>
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

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/book">
          <Button>Book New Appointment</Button>
        </Link>
        <Link href="/account/transactions">
          <Button variant="outline">View Transactions</Button>
        </Link>
        <Link href="/account/appointments">
          <Button variant="outline">View All Appointments</Button>
        </Link>
      </div>
    </div>
  );
}
