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
import { ChevronLeft, ChevronRight, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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

// Generate time options in 30-minute increments for waitlist preference
const TIME_OPTIONS: string[] = [];
for (let h = 7; h <= 19; h++) {
  for (const m of ['00', '30']) {
    const hh = h.toString().padStart(2, '0');
    TIME_OPTIONS.push(`${hh}:${m}`);
  }
}

interface WaitlistPreference {
  preferred_date: string;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  notes: string | null;
}

interface StepScheduleProps {
  businessHours: BusinessHours;
  bookingConfig: BookingConfig;
  durationMinutes: number;
  initialDate: string | null;
  initialTime: string | null;
  onContinue: (date: string, time: string) => void;
  onBack: () => void;
  waitlistEnabled?: boolean;
  onJoinWaitlist?: (preference: WaitlistPreference) => void;
}

export function StepSchedule({
  businessHours,
  bookingConfig,
  durationMinutes,
  initialDate,
  initialTime,
  onContinue,
  onBack,
  waitlistEnabled = false,
  onJoinWaitlist,
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

  // Waitlist state
  const [waitlistTimeStart, setWaitlistTimeStart] = useState<string>('');
  const [waitlistTimeEnd, setWaitlistTimeEnd] = useState<string>('');
  const [waitlistNotes, setWaitlistNotes] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  // Fetch slots when date changes
  const fetchSlots = useCallback(async (date: Date) => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedTime(null);
    setWaitlistSubmitted(false);

    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      const res = await fetch(
        `/api/book/slots?date=${dateStr}&duration=${durationMinutes}`
      );
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
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
    if (!hours) return true; // Closed day
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
      <h2 className="text-xl font-semibold text-gray-900">
        Pick a Date & Time
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Select an available date and time for your appointment.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-md p-1.5 hover:bg-gray-100"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h3 className="text-sm font-semibold text-gray-900">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-md p-1.5 hover:bg-gray-100"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-gray-500">
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
                    !inMonth && 'text-gray-300',
                    inMonth && !disabled && !selected && 'text-gray-900 hover:bg-gray-100',
                    disabled && inMonth && 'text-gray-300 cursor-not-allowed',
                    selected && 'bg-gray-900 text-white font-semibold'
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
              <p className="text-sm text-gray-400">
                Select a date to see available times
              </p>
            </div>
          ) : loadingSlots ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : slots.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              {waitlistEnabled && onJoinWaitlist && !waitlistSubmitted ? (
                <Card className="w-full">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          No slots available on this date
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Join our waitlist and we&apos;ll notify you when a slot opens up.
                        </p>

                        <div className="mt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="wl-time-start">Preferred start</Label>
                              <Select
                                id="wl-time-start"
                                value={waitlistTimeStart}
                                onChange={(e) => setWaitlistTimeStart(e.target.value)}
                                className="mt-1"
                              >
                                <option value="">Any time</option>
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {formatTime(t)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="wl-time-end">Preferred end</Label>
                              <Select
                                id="wl-time-end"
                                value={waitlistTimeEnd}
                                onChange={(e) => setWaitlistTimeEnd(e.target.value)}
                                className="mt-1"
                              >
                                <option value="">Any time</option>
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {formatTime(t)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>

                          <div>
                            <Label htmlFor="wl-notes">Notes (optional)</Label>
                            <Textarea
                              id="wl-notes"
                              value={waitlistNotes}
                              onChange={(e) => setWaitlistNotes(e.target.value)}
                              placeholder="Any scheduling preferences..."
                              rows={2}
                              className="mt-1"
                            />
                          </div>

                          <Button
                            className="w-full"
                            onClick={() => {
                              if (!selectedDate) return;
                              const dateStr = format(selectedDate, 'yyyy-MM-dd');
                              onJoinWaitlist({
                                preferred_date: dateStr,
                                preferred_time_start: waitlistTimeStart || null,
                                preferred_time_end: waitlistTimeEnd || null,
                                notes: waitlistNotes || null,
                              });
                              setWaitlistSubmitted(true);
                            }}
                          >
                            Join Waitlist for This Date
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : waitlistSubmitted ? (
                <Card className="w-full">
                  <CardContent className="flex items-center gap-3 p-5">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Added to waitlist
                      </p>
                      <p className="text-sm text-gray-500">
                        We&apos;ll notify you when a slot opens up on this date.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-gray-500">
                  No available times on this date. Try another day.
                </p>
              )}
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-gray-700">
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
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
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

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
