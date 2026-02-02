'use client';

import { cn } from '@/lib/utils/cn';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppointmentWithRelations } from '../types';
import { STATUS_DOT_COLORS } from '../types';

interface AppointmentCalendarProps {
  currentMonth: Date;
  selectedDate: Date | null;
  appointmentsByDate: Record<string, AppointmentWithRelations[]>;
  onMonthChange: (date: Date) => void;
  onDateSelect: (date: Date) => void;
}

export function AppointmentCalendar({
  currentMonth,
  selectedDate,
  appointmentsByDate,
  onMonthChange,
  onDateSelect,
}: AppointmentCalendarProps) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div>
      {/* Header with month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(currentMonth, 1))}
          className="rounded-md p-1.5 hover:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const today = new Date();
              onMonthChange(today);
              onDateSelect(today);
            }}
          >
            Today
          </Button>
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(currentMonth, 1))}
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
          const selected = selectedDate && isSameDay(day, selectedDate);
          const today = isToday(day);
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayAppointments = appointmentsByDate[dateKey] || [];

          // Get unique statuses for dots (up to 3)
          const statuses = [...new Set(dayAppointments.map((a) => a.status))];
          const dotStatuses = statuses.slice(0, 3);
          const extraCount = dayAppointments.length > 3 ? dayAppointments.length - 3 : 0;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDateSelect(day)}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-md text-sm transition-colors',
                !inMonth && 'text-gray-300',
                inMonth && !selected && 'text-gray-900 hover:bg-gray-100',
                selected && 'bg-gray-900 text-white',
                today && !selected && 'font-bold ring-1 ring-inset ring-gray-300'
              )}
            >
              <span className="text-xs">{format(day, 'd')}</span>
              {inMonth && dayAppointments.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {dotStatuses.map((status, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        selected ? 'bg-white/80' : STATUS_DOT_COLORS[status]
                      )}
                    />
                  ))}
                  {extraCount > 0 && (
                    <span
                      className={cn(
                        'text-[9px] leading-none',
                        selected ? 'text-white/80' : 'text-gray-400'
                      )}
                    >
                      +{extraCount}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
