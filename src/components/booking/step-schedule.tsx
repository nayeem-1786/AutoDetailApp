'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isBefore,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/utils/format';
import type { BusinessHours, BookingConfig } from '@/lib/data/booking';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

interface StepScheduleProps {
  businessHours: BusinessHours;
  bookingConfig: BookingConfig;
  durationMinutes: number;
  initialDate: string | null;
  initialTime: string | null;
  onContinue: (date: string, time: string) => void;
  onBack: () => void;
}

export function StepSchedule({
  businessHours,
  bookingConfig,
  durationMinutes,
  initialDate,
  initialTime,
  onContinue,
  onBack,
}: StepScheduleProps) {
  const today = new Date();
  const minDate = addDays(today, bookingConfig.advance_days_min);
  const maxDate = addDays(today, bookingConfig.advance_days_max);

  const [currentMonth, setCurrentMonth] = useState(
    initialDate ? new Date(initialDate + 'T12:00:00') : minDate
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialDate ? new Date(initialDate + 'T12:00:00') : null
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(
    initialTime
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Fetch slots when date changes
  const fetchSlots = useCallback(async (date: Date) => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedTime(null);

    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      const res = await fetch(
        `/api/book/slots?date=${dateStr}&duration=${durationMinutes}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        console.error('Slots API error:', res.status);
        setSlots([]);
        return;
      }
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch (err) {
      console.error('Failed to fetch slots:', err);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [durationMinutes]);

  useEffect(() => {
    if (selectedDate) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, fetchSlots]);

  function isDateDisabled(date: Date): boolean {
    if (isBefore(date, minDate) && !isSameDay(date, minDate)) return true;
    if (isBefore(maxDate, date)) return true;
    const dayName = DAY_NAMES[getDay(date)];
    const hours = businessHours[dayName];
    if (!hours) return true;
    return false;
  }

  function handleDateClick(date: Date) {
    if (isDateDisabled(date)) return;
    setSelectedDate(date);
  }

  function handleContinue() {
    if (!selectedDate || !selectedTime) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    onContinue(dateStr, selectedTime);
  }

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div>
      <h2 className="text-xl font-semibold text-site-text">
        Pick a Date & Time
      </h2>
      <p className="mt-1 text-sm text-site-text-secondary">
        Select an available date and time for your appointment.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-md p-1.5 hover:bg-brand-surface"
            >
              <ChevronLeft className="h-5 w-5 text-site-text-secondary" />
            </button>
            <h3 className="text-sm font-semibold text-site-text">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-md p-1.5 hover:bg-brand-surface"
            >
              <ChevronRight className="h-5 w-5 text-site-text-secondary" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-site-text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {calDays.map((day) => {
              const inMonth = isSameMonth(day, currentMonth);
              const disabled = !inMonth || isDateDisabled(day);
              const selected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDateClick(day)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-md text-sm transition-colors',
                    !inMonth && 'text-site-text-dim',
                    inMonth && !disabled && !selected && 'text-site-text hover:bg-brand-surface',
                    disabled && inMonth && 'text-site-text-dim cursor-not-allowed',
                    selected && 'bg-lime text-site-text-on-primary font-semibold'
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time slots */}
        <div>
          {!selectedDate ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-site-text-muted">
                Select a date to see available times
              </p>
            </div>
          ) : loadingSlots ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-site-text-muted" />
            </div>
          ) : slots.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-sm text-site-text-muted">
                No available times on this date. Try another day.
              </p>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-site-text-secondary">
                Available Times
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedTime(slot)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      selectedTime === slot
                        ? 'border-lime bg-lime text-site-text-on-primary'
                        : 'border-site-border text-site-text-secondary hover:border-lime/50 hover:bg-brand-surface'
                    )}
                  >
                    {formatTime(slot)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info note */}
      <div className="mt-6 flex gap-3 rounded-lg border-l-4 border-blue-400 bg-blue-50 p-3 dark:bg-blue-900/20">
        <Info className="h-4 w-4 flex-shrink-0 text-blue-400 mt-0.5" />
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Don&apos;t see a time that works? Pick the closest option — our team will
          call to confirm your exact appointment time.
        </p>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={onBack} className="border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface dark:border-site-border dark:bg-transparent dark:text-site-text-secondary dark:hover:bg-brand-surface">
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime}
          className="bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
