'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type ApptStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

interface Appt {
  id: string;
  status: ApptStatus;
  channel?: string | null;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  total_amount: number;
  is_mobile: boolean;
  mobile_address: string | null;
  appointment_services: { price_at_booking: number; services: { name: string } }[];
  vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
}

export default function AccountAppointmentsPage() {
  const { customer } = useCustomerAuth();
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAppointments = useCallback(async () => {
    if (!customer) return;

    const supabase = createClient();

    // Phase 0a-2: walk-ins are visible to the customer alongside booked
    // appointments. The channel column is selected so each row can render
    // its channel badge (Walk-In Visit / Phone / Online).
    const { data } = await supabase
      .from('appointments')
      .select(
        `id, status, channel, scheduled_date, scheduled_start_time, scheduled_end_time,
         total_amount, is_mobile, mobile_address,
         appointment_services(price_at_booking, services(name)),
         vehicles(year, make, model, color)`
      )
      .eq('customer_id', customer.id)
      .order('scheduled_date', { ascending: false });

    setAppointments((data as unknown as Appt[]) ?? []);
    setLoading(false);
  }, [customer]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  if (!customer) return null;

  // Phase 0a-2: 3-section layout — Active (in_progress), Upcoming
  // (pending/confirmed), Past (completed/cancelled/no_show). Status drives
  // the bucket; date is the secondary sort within each.
  const active = [...appointments]
    .filter((a) => a.status === 'in_progress')
    .sort((a, b) =>
      // Most recently started first
      b.scheduled_start_time.localeCompare(a.scheduled_start_time)
    );

  const upcoming = [...appointments]
    .filter((a) => a.status === 'pending' || a.status === 'confirmed')
    .sort((a, b) => {
      // Earliest first
      const dateCmp = a.scheduled_date.localeCompare(b.scheduled_date);
      if (dateCmp !== 0) return dateCmp;
      return a.scheduled_start_time.localeCompare(b.scheduled_start_time);
    });

  const past = [...appointments]
    .filter(
      (a) =>
        a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'
    )
    .sort((a, b) => {
      // Most recent first
      const dateCmp = b.scheduled_date.localeCompare(a.scheduled_date);
      if (dateCmp !== 0) return dateCmp;
      return b.scheduled_start_time.localeCompare(a.scheduled_start_time);
    });

  return (
    <div>
      <h1 className="text-2xl font-bold text-site-text">Appointments</h1>
      <p className="mt-1 text-sm text-site-text-faint">
        View your active service, upcoming appointments, and full service history.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Active — currently in service */}
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-medium uppercase text-site-text-dim">
              Currently in Service
            </h2>
            {active.length > 0 ? (
              <div className="space-y-3">
                {active.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={loadAppointments}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-site-text-dim">
                No service currently in progress.
              </p>
            )}
          </div>

          {/* Upcoming */}
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-medium uppercase text-site-text-dim">
              Upcoming Appointments
            </h2>
            {upcoming.length > 0 ? (
              <div className="space-y-3">
                {upcoming.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={loadAppointments}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-site-text-dim">
                  No upcoming appointments.
                </p>
                <Link href="/book">
                  <Button size="sm">Book your next service</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Past — service history */}
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-medium uppercase text-site-text-dim">
              Service History
            </h2>
            {past.length > 0 ? (
              <div className="space-y-3">
                {past.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={loadAppointments}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-site-text-dim">No past services yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
