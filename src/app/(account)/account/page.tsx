'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatPoints } from '@/lib/utils/format';

export default function AccountDashboardPage() {
  const { customer } = useCustomerAuth();
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;

    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];

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
      .limit(3)
      .then((result: { data: unknown[] | null }) => {
        setUpcomingAppointments(result.data ?? []);
        setLoading(false);
      });
  }, [customer]);

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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm font-medium text-gray-600">Loyalty Points</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {formatPoints(customer.loyalty_points_balance)}
        </p>
      </div>

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
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/book">
          <Button>Book New Appointment</Button>
        </Link>
        <Link href="/account/appointments">
          <Button variant="outline">View All Appointments</Button>
        </Link>
      </div>
    </div>
  );
}
