'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { VehicleCard } from '@/components/account/vehicle-card';
import { VehicleFormDialog } from '@/components/account/vehicle-form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface Vehicle {
  id: string;
  vehicle_type: 'standard' | 'motorcycle' | 'rv' | 'boat' | 'aircraft';
  size_class: 'sedan' | 'truck_suv_2row' | 'suv_3row_van' | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

export default function AccountVehiclesPage() {
  const { customer } = useCustomerAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/vehicles');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setVehicles(json.data ?? []);
    } catch {
      // leave current state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    loadVehicles();
  }, [customer, loadVehicles]);

  const handleEdit = (vehicle: Vehicle) => {
    setEditVehicle(vehicle);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditVehicle(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/customer/vehicles/${deleteId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }

      toast.success('Vehicle deleted');
      setDeleteId(null);
      loadVehicles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  if (!customer) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Vehicles</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage vehicles on your account.
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      ) : vehicles.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">
          No vehicles saved yet. Add a vehicle to get started.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {vehicles.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              onEdit={() => handleEdit(v)}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}

      <VehicleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editVehicle}
        onSuccess={loadVehicles}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete Vehicle"
        description="Are you sure you want to remove this vehicle from your account? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
