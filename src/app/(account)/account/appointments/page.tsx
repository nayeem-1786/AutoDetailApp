'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { AppointmentCard } from '@/components/account/appointment-card';
import { Spinner } from '@/components/ui/spinner';

export default function AccountAppointmentsPage() {
  const { customer } = useCustomerAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;

    const supabase = createClient();

    supabase
      .from('appointments')
      .select(
        `id, status, scheduled_date, scheduled_start_time, scheduled_end_time,
         total_amount, is_mobile, mobile_address,
         appointment_services(price_at_booking, services(name)),
         vehicles(year, make, model, color)`
      )
      .eq('customer_id', customer.id)
      .order('scheduled_date', { ascending: false })
      .then((result: { data: unknown[] | null }) => {
        setAppointments(result.data ?? []);
        setLoading(false);
      });
  }, [customer]);

  if (!customer) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
      <p className="mt-1 text-sm text-gray-600">
        View your appointment history and rebook past services.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : appointments.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No appointments yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {appointments.map((appt) => (
            <AppointmentCard key={appt.id} appointment={appt} />
          ))}
        </div>
      )}
    </div>
  );
}
