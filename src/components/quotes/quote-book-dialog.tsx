'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { NotifyCustomerDialog } from './notify-customer-dialog';

interface QuoteBookDialogProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  defaultDuration: number;
  onBooked: (appointmentId: string) => void;
  fetchFn?: typeof fetch;
  apiBasePath: string; // "/api/quotes" or "/api/pos/quotes"
  customerEmail?: string | null;
  customerPhone?: string | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

export function QuoteBookDialog({
  open,
  onClose,
  quoteId,
  defaultDuration,
  onBooked,
  fetchFn = fetch,
  apiBasePath,
  customerEmail,
  customerPhone,
}: QuoteBookDialogProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(defaultDuration || 60);
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [booking, setBooking] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // Post-conversion notification
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [bookedAppointmentId, setBookedAppointmentId] = useState('');

  // Set default date to tomorrow on open
  useEffect(() => {
    if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split('T')[0]);
      setTime('09:00');
      setDuration(defaultDuration || 60);
      setEmployeeId('');
    }
  }, [open, defaultDuration]);

  // Fetch bookable employees
  useEffect(() => {
    if (!open) return;
    setLoadingEmployees(true);

    async function fetchEmployees() {
      try {
        const res = await fetch('/api/staff/schedules');
        if (res.ok) {
          const data = await res.json();
          const schedules = data.schedules || [];
          const detailers: Employee[] = [];
          for (const s of schedules) {
            const emp = s.employee;
            if (emp?.id && emp.role === 'detailer') {
              detailers.push({
                id: emp.id,
                first_name: emp.first_name,
                last_name: emp.last_name || '',
              });
            }
          }
          setEmployees(detailers);
        }
      } catch {
        // Employee assignment is optional — silently fail
      } finally {
        setLoadingEmployees(false);
      }
    }

    fetchEmployees();
  }, [open]);

  async function handleBook() {
    if (!date || !time) {
      toast.error('Select a date and time');
      return;
    }

    setBooking(true);
    try {
      const res = await fetchFn(`${apiBasePath}/${quoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time,
          duration_minutes: duration,
          employee_id: employeeId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to book appointment');
      }

      const data = await res.json();
      const apptId = data.appointment?.id ?? '';
      toast.success('Appointment booked successfully');

      // Show notification dialog if customer has contact info
      if (customerEmail || customerPhone) {
        setBookedAppointmentId(apptId);
        setShowNotifyDialog(true);
      } else {
        onBooked(apptId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to book appointment');
    } finally {
      setBooking(false);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Derive the notification API base path from the quotes API path
  const notifyApiBasePath = apiBasePath.includes('/pos/')
    ? '/api/pos/appointments'
    : '/api/appointments';

  return (
    <>
      <Dialog open={open && !showNotifyDialog} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Schedule an appointment from this quote.
            </p>

            {/* Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayStr}
                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
              />
            </div>

            {/* Time */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Duration (minutes)
              </label>
              <input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-gray-400">Estimated from services</p>
            </div>

            {/* Staff */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assign Detailer
              </label>
              {loadingEmployees ? (
                <div className="flex h-9 items-center text-sm text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading staff...
                </div>
              ) : (
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                >
                  <option value="">Auto-assign (recommended)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={booking} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleBook} disabled={booking || !date || !time} className="flex-1">
                {booking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Book Appointment'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NotifyCustomerDialog
        open={showNotifyDialog}
        onClose={() => {
          setShowNotifyDialog(false);
          onBooked(bookedAppointmentId);
        }}
        appointmentId={bookedAppointmentId}
        customerEmail={customerEmail ?? null}
        customerPhone={customerPhone ?? null}
        fetchFn={fetchFn}
        apiBasePath={notifyApiBasePath}
      />
    </>
  );
}
