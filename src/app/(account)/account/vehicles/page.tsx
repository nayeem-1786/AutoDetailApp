'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { VehicleCard } from '@/components/account/vehicle-card';
import { Spinner } from '@/components/ui/spinner';

export default function AccountVehiclesPage() {
  const { customer } = useCustomerAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;

    const supabase = createClient();

    supabase
      .from('vehicles')
      .select('id, vehicle_type, size_class, year, make, model, color')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .then((result: { data: unknown[] | null }) => {
        setVehicles(result.data ?? []);
        setLoading(false);
      });
  }, [customer]);

  if (!customer) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Your Vehicles</h1>
      <p className="mt-1 text-sm text-gray-600">
        Vehicles saved from your previous appointments.
      </p>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : vehicles.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">
          No vehicles saved yet. Book an appointment to add a vehicle.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}
