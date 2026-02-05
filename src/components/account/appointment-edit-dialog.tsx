'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { VEHICLE_TYPE_LABELS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
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
import { AlertTriangle, Phone } from 'lucide-react';
import type { VehicleType } from '@/lib/supabase/types';

interface Vehicle {
  id: string;
  vehicle_type: VehicleType;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
}

interface AppointmentService {
  service_id: string;
  price_at_booking: number;
  services: {
    name: string;
  };
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

  // Original service IDs (kept unchanged)
  const [serviceIds, setServiceIds] = useState<string[]>([]);

  // Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookedServices, setBookedServices] = useState<AppointmentService[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);

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
        setTotalAmount(appt.total_amount);
        setBookedServices(appt.appointment_services || []);

        const ids = appt.appointment_services?.map(
          (as: { service_id: string }) => as.service_id
        ) || [];
        setServiceIds(ids);

        setVehicles(json.vehicles || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, appointmentId]);

  // Format vehicle for display
  function formatVehicle(v: Vehicle): string {
    const parts = [v.year, v.make, v.model].filter(Boolean);
    const label = parts.length > 0 ? parts.join(' ') : 'Unknown Vehicle';
    return `${label} (${VEHICLE_TYPE_LABELS[v.vehicle_type]})`;
  }

  // Handle save
  async function handleSave() {
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
          service_ids: serviceIds, // Keep original services
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

      toast.success('Appointment rescheduled');
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
        <DialogTitle>Reschedule Appointment</DialogTitle>
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
              <h3 className="mb-3 text-sm font-semibold text-gray-700">New Date & Time</h3>
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

            {/* Current Services (Read-only) */}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Booked Services</h3>
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {bookedServices.map((as) => (
                  <div
                    key={as.service_id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">{as.services?.name}</span>
                    <span className="text-gray-600">
                      {formatCurrency(as.price_at_booking)}
                    </span>
                  </div>
                ))}
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-gray-700">Total</span>
                    <span className="text-gray-900">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Service Change Notice */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Need to change services?
                  </p>
                  <p className="mt-1 text-sm text-blue-700">
                    Please call us at <a href="tel:+13109551779" className="font-medium underline">(310) 955-1779</a> to
                    modify your services. Our team will help you find the best options for your vehicle.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
      {!loading && !error && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Reschedule'}
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
