'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { VEHICLE_TYPE_LABELS, VEHICLE_SIZE_LABELS } from '@/lib/utils/constants';
import { VehicleFormDialog } from '@/components/account/vehicle-form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Car, Bike, Truck, Ship, Plane } from 'lucide-react';
import type { VehicleType, VehicleSizeClass } from '@/lib/supabase/types';

interface Vehicle {
  id: string;
  vehicle_type: VehicleType;
  size_class: VehicleSizeClass | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  license_plate: string | null;
}

// Icons for each vehicle type
const VEHICLE_TYPE_ICONS: Record<VehicleType, React.ElementType> = {
  standard: Car,
  motorcycle: Bike,
  rv: Truck,
  boat: Ship,
  aircraft: Plane,
};

// Group order for display
const VEHICLE_TYPE_ORDER: VehicleType[] = ['standard', 'motorcycle', 'rv', 'boat', 'aircraft'];

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
      toast.error('Failed to load vehicles');
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

      toast.success('Vehicle removed');
      setDeleteId(null);
      loadVehicles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  if (!customer) return null;

  // Group vehicles by type
  const vehiclesByType = VEHICLE_TYPE_ORDER.reduce((acc, type) => {
    const typeVehicles = vehicles.filter((v) => v.vehicle_type === type);
    if (typeVehicles.length > 0) {
      acc[type] = typeVehicles;
    }
    return acc;
  }, {} as Record<VehicleType, Vehicle[]>);

  const hasVehicles = vehicles.length > 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Vehicles</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add all your vehicles here so we can track their service history and provide personalized recommendations.
          </p>
        </div>
        <Button onClick={handleAdd} className="flex-shrink-0">
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : !hasVehicles ? (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Car className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No vehicles yet</h3>
              <p className="mt-2 text-sm text-gray-500">
                Add your first vehicle to get started. We&apos;ll keep track of its service history for you.
              </p>
              <Button onClick={handleAdd} className="mt-4">
                <Plus className="h-4 w-4" />
                Add Your First Vehicle
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {Object.entries(vehiclesByType).map(([type, typeVehicles]) => {
            const Icon = VEHICLE_TYPE_ICONS[type as VehicleType];
            const typeLabel = VEHICLE_TYPE_LABELS[type];
            const count = typeVehicles.length;

            return (
              <Card key={type}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-gray-500" />
                    <CardTitle>{typeLabel}{count > 1 ? 's' : ''}</CardTitle>
                  </div>
                  <CardDescription>
                    {count} {typeLabel.toLowerCase()}{count > 1 ? 's' : ''} on your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {typeVehicles.map((vehicle) => {
                      const label = [vehicle.year, vehicle.make, vehicle.model]
                        .filter(Boolean)
                        .join(' ') || 'Unknown Vehicle';

                      return (
                        <div
                          key={vehicle.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-gray-900">{label}</h4>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {vehicle.color && (
                                <Badge variant="secondary">{vehicle.color}</Badge>
                              )}
                              {vehicle.size_class && (
                                <Badge variant="secondary">
                                  {VEHICLE_SIZE_LABELS[vehicle.size_class]}
                                </Badge>
                              )}
                            </div>
                            {vehicle.license_plate && (
                              <p className="mt-2 text-xs font-mono text-gray-500">
                                Plate: {vehicle.license_plate}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(vehicle)}
                              aria-label="Edit vehicle"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteId(vehicle.id)}
                              aria-label="Delete vehicle"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
        title="Remove Vehicle?"
        description="This will remove the vehicle from your account. Any service history will still be saved. You can add it back anytime."
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
