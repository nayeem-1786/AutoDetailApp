'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { VEHICLE_TYPE_LABELS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import type { VehicleType, VehicleSizeClass } from '@/lib/supabase/types';

interface Vehicle {
  id: string;
  vehicle_type: VehicleType;
  size_class: VehicleSizeClass | null;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

interface Service {
  id: string;
  name: string;
  base_price: number;
  category_id: string | null;
  is_active: boolean;
}

interface AppointmentEditDialogProps {
  appointmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AppointmentEditDialog({
  appointmentId,
  open,
  onOpenChange,
  onSuccess,
}: AppointmentEditDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  // Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [originalTotal, setOriginalTotal] = useState(0);

  // Load appointment data
  useEffect(() => {
    if (!open || !appointmentId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/customer/appointments/${appointmentId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Failed to load appointment');
        }
        return res.json();
      })
      .then((json) => {
        const appt = json.data;
        setScheduledDate(appt.scheduled_date);
        setStartTime(appt.scheduled_start_time);
        setEndTime(appt.scheduled_end_time);
        setVehicleId(appt.vehicle_id);
        setOriginalTotal(appt.total_amount);

        const serviceIds = appt.appointment_services?.map(
          (as: { service_id: string }) => as.service_id
        ) || [];
        setSelectedServiceIds(serviceIds);

        setVehicles(json.vehicles || []);
        setServices(json.services || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, appointmentId]);

  // Calculate new total
  const newTotal = services
    .filter((s) => selectedServiceIds.includes(s.id))
    .reduce((sum, s) => sum + (s.base_price || 0), 0);

  const priceDiff = newTotal - originalTotal;

  // Format vehicle for display
  function formatVehicle(v: Vehicle): string {
    const parts = [v.year, v.make, v.model].filter(Boolean);
    const label = parts.length > 0 ? parts.join(' ') : 'Unknown Vehicle';
    return `${label} (${VEHICLE_TYPE_LABELS[v.vehicle_type]})`;
  }

  // Toggle service selection
  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  }

  // Handle save
  async function handleSave() {
    if (selectedServiceIds.length === 0) {
      toast.error('Please select at least one service');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/customer/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_date: scheduledDate,
          scheduled_start_time: startTime,
          scheduled_end_time: endTime,
          vehicle_id: vehicleId,
          service_ids: selectedServiceIds,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.too_late) {
          toast.error(json.error);
        } else {
          throw new Error(json.error || 'Failed to update');
        }
        return;
      }

      toast.success('Appointment updated');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update appointment');
    } finally {
      setSaving(false);
    }
  }

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Edit Appointment</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Date & Time */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Date & Time</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Date" required htmlFor="edit-date">
                  <Input
                    id="edit-date"
                    type="date"
                    value={scheduledDate}
                    min={today}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </FormField>
                <FormField label="Start Time" required htmlFor="edit-start">
                  <Input
                    id="edit-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </FormField>
                <FormField label="End Time" required htmlFor="edit-end">
                  <Input
                    id="edit-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </FormField>
              </div>
            </div>

            {/* Vehicle */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Vehicle</h3>
              <FormField label="Select Vehicle" htmlFor="edit-vehicle">
                <Select
                  id="edit-vehicle"
                  value={vehicleId || ''}
                  onChange={(e) => setVehicleId(e.target.value || null)}
                >
                  <option value="">No vehicle selected</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatVehicle(v)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {/* Services */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Services</h3>
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                {services.map((service) => {
                  const isSelected = selectedServiceIds.includes(service.id);
                  return (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleService(service.id)}
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {service.name}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {formatCurrency(service.base_price)}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selectedServiceIds.length === 0 && (
                <p className="mt-2 text-xs text-red-500">
                  Please select at least one service
                </p>
              )}
            </div>

            {/* Price Summary */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">New Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(newTotal)}
                </span>
              </div>
              {priceDiff !== 0 && (
                <p className={`mt-1 text-sm ${priceDiff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {priceDiff > 0
                    ? `This change will cost ${formatCurrency(priceDiff)} more`
                    : `You'll save ${formatCurrency(Math.abs(priceDiff))}`}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      {!loading && !error && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedServiceIds.length === 0}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
