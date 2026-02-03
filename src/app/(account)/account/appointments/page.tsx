'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { Spinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';

export default function AccountAppointmentsPage() {
  const { customer } = useCustomerAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAppointments = useCallback(async () => {
    if (!customer) return;

    const supabase = createClient();

    const { data } = await supabase
      .from('appointments')
      .select(
        `id, status, scheduled_date, scheduled_start_time, scheduled_end_time,
         total_amount, is_mobile, mobile_address,
         appointment_services(price_at_booking, services(name)),
         vehicles(year, make, model, color)`
      )
      .eq('customer_id', customer.id)
      .order('scheduled_date', { ascending: false });

    setAppointments(data ?? []);
    setLoading(false);
  }, [customer]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  if (!customer) return null;

  const today = new Date().toISOString().split('T')[0];

  const upcoming = appointments.filter(
    (a) =>
      a.scheduled_date >= today &&
      ['pending', 'confirmed', 'in_progress'].includes(a.status)
  );

  const past = appointments.filter(
    (a) =>
      a.scheduled_date < today ||
      ['completed', 'cancelled', 'no_show'].includes(a.status)
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
      <p className="mt-1 text-sm text-gray-600">
        View your upcoming and past appointments.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : appointments.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No appointments yet.</p>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-medium uppercase text-gray-500">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcoming.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={loadAppointments}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium uppercase text-gray-500">
                Past
              </h2>
              <div className="space-y-3">
                {past.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onStatusChange={loadAppointments}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
