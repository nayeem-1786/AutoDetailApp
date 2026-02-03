import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
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
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const serviceId = searchParams.get('service_id');

    if (!dateStr) {
      return NextResponse.json(
        { error: 'Missing required parameter: date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // Parse the date to get day-of-week
    const dateObj = new Date(dateStr + 'T12:00:00');
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const dayName = DAY_NAMES[dateObj.getUTCDay()];
    const supabase = createAdminClient();

    // 1. Determine duration: from service if provided, otherwise default 60
    let duration = 60;
    if (serviceId) {
      const { data: service } = await supabase
        .from('services')
        .select('base_duration_minutes')
        .eq('id', serviceId)
        .single();

      if (service) {
        duration = service.base_duration_minutes;
      }
    }

    // 2. Get business_hours and booking_config from business_settings
    const { data: settings } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['business_hours', 'booking_config']);

    const settingsMap: Record<string, unknown> = {};
    for (const row of settings ?? []) {
      settingsMap[row.key] =
        typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }

    const hours = settingsMap.business_hours as
      | Record<string, { open: string; close: string } | null>
      | undefined;

    const config =
      (settingsMap.booking_config as { slot_interval_minutes?: number }) ?? {};

    // 3. Check day hours for the given date's day of week
    const dayHours = hours?.[dayName];
    if (!dayHours) {
      // Closed on this day
      return NextResponse.json({ date: dateStr, slots: [] });
    }

    const slotInterval = config.slot_interval_minutes ?? 30;
    const totalNeeded = duration + APPOINTMENT.BUFFER_MINUTES;

    // 4. Get existing non-cancelled appointments for the date
    const { data: existing } = await supabase
      .from('appointments')
      .select('scheduled_start_time, scheduled_end_time')
      .eq('scheduled_date', dateStr)
      .neq('status', 'cancelled');

    const appointments = (existing ?? []).map((a) => ({
      start: timeToMinutes(a.scheduled_start_time),
      end: timeToMinutes(a.scheduled_end_time),
    }));

    // 5. Generate slots at slot_interval_minutes, filtering conflicts
    const openMin = timeToMinutes(dayHours.open);
    const closeMin = timeToMinutes(dayHours.close);
    const slots: string[] = [];

    for (let t = openMin; t + totalNeeded <= closeMin; t += slotInterval) {
      const slotEnd = t + totalNeeded;

      const hasConflict = appointments.some(
        (appt) => t < appt.end && slotEnd > appt.start
      );

      if (!hasConflict) {
        slots.push(minutesToTime(t));
      }
    }

    return NextResponse.json({ date: dateStr, slots });
  } catch (err) {
    console.error('Voice agent availability error:', err);
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
