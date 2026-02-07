'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';

interface QuoteConvertDialogProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  totalDurationMinutes: number;
  onConverted: (appointmentId: string) => void;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

export function QuoteConvertDialog({
  open,
  onClose,
  quoteId,
  totalDurationMinutes,
  onConverted,
}: QuoteConvertDialogProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(totalDurationMinutes || 60);
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [converting, setConverting] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // Set default date to tomorrow
  useEffect(() => {
    if (!date) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split('T')[0]);
    }
  }, [date]);

  // Fetch bookable employees from staff schedules endpoint
  useEffect(() => {
    if (!open) return;

    async function fetchEmployees() {
      try {
        const res = await fetch('/api/staff/schedules');
        if (res.ok) {
          const data = await res.json();
          // Extract unique employees from schedules response
          const schedules = data.schedules || [];
          const empMap = new Map<string, Employee>();
          for (const s of schedules) {
            if (s.employee_id && s.first_name) {
              empMap.set(s.employee_id, {
                id: s.employee_id,
                first_name: s.first_name,
                last_name: s.last_name || '',
              });
            }
          }
          setEmployees(Array.from(empMap.values()));
        }
      } catch {
        // Silently fail — employee assignment is optional
      } finally {
        setLoadingEmployees(false);
      }
    }

    fetchEmployees();
  }, [open]);

  async function handleConvert() {
    if (!date || !time) {
      toast.error('Select a date and time');
      return;
    }

    setConverting(true);
    try {
      const res = await posFetch(`/api/pos/quotes/${quoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time,
          duration_minutes: duration,
          assigned_employee_id: employeeId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to convert');
      }

      const data = await res.json();
      toast.success('Quote converted to appointment');
      onConverted(data.appointment.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert quote');
    } finally {
      setConverting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogClose onClose={onClose} />
      <DialogHeader>
        <DialogTitle>Convert to Booking</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Schedule an appointment from this accepted quote.
          </p>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
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
          </div>

          {/* Assigned Staff */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Assign Staff (optional)
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
                <option value="">Unassigned</option>
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
            <Button variant="outline" onClick={onClose} disabled={converting} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleConvert} disabled={converting || !date || !time} className="flex-1">
              {converting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create Booking'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
