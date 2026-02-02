import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APPOINTMENT } from '@/lib/utils/constants';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const durationStr = searchParams.get('duration');

    if (!dateStr || !durationStr) {
      return NextResponse.json(
        { error: 'Missing date or duration parameter' },
        { status: 400 }
      );
    }

    const duration = parseInt(durationStr, 10);
    if (isNaN(duration) || duration < 1) {
      return NextResponse.json(
        { error: 'Invalid duration' },
        { status: 400 }
      );
    }

    // Parse the date to get day-of-week
    const dateObj = new Date(dateStr + 'T12:00:00');
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const dayName = DAY_NAMES[dateObj.getUTCDay()];
    const supabase = createAdminClient();

    // Fetch business_hours and booking_config
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['business_hours', 'booking_config']);

    const settingsMap: Record<string, unknown> = {};
    for (const row of settings ?? []) {
      // Handle double-serialized JSON (string instead of object)
      settingsMap[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }

    const hours = settingsMap.business_hours as Record<
      string,
      { open: string; close: string } | null
    > | undefined;

    const config = (settingsMap.booking_config as {
      slot_interval_minutes?: number;
    }) ?? {};

    const dayHours = hours?.[dayName];
    if (!dayHours) {
      // Closed on this day
      return NextResponse.json({ slots: [] });
    }

    const slotInterval = config.slot_interval_minutes ?? 30;
    const totalNeeded = duration + APPOINTMENT.BUFFER_MINUTES;

    // Fetch existing non-cancelled appointments for this date
    const { data: existing } = await supabase
      .from('appointments')
      .select('scheduled_start_time, scheduled_end_time')
      .eq('scheduled_date', dateStr)
      .neq('status', 'cancelled');

    const appointments = (existing ?? []).map((a) => ({
      start: timeToMinutes(a.scheduled_start_time),
      end: timeToMinutes(a.scheduled_end_time),
    }));

    // Generate time slots
    const openMin = timeToMinutes(dayHours.open);
    const closeMin = timeToMinutes(dayHours.close);
    const slots: string[] = [];

    for (let t = openMin; t + totalNeeded <= closeMin; t += slotInterval) {
      const slotEnd = t + totalNeeded;

      // Check for overlap with any existing appointment
      const hasConflict = appointments.some(
        (appt) => t < appt.end && slotEnd > appt.start
      );

      if (!hasConflict) {
        slots.push(minutesToTime(t));
      }
    }

    return NextResponse.json({ slots });
  } catch (err) {
    console.error('Slots API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
