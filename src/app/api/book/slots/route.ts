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

    const dayOfWeek = dateObj.getUTCDay(); // 0=Sun, 6=Sat
    const dayName = DAY_NAMES[dayOfWeek];
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

    // --- Enhanced slot availability: employee schedules + blocked dates ---

    // Get employee schedules for this day of week
    const { data: employeeSchedules } = await supabase
      .from('employee_schedules')
      .select('employee_id, start_time, end_time, is_available')
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true);

    // Get blocked dates for this date
    const { data: blockedDates } = await supabase
      .from('blocked_dates')
      .select('employee_id')
      .eq('date', dateStr);

    // Determine the availability window
    let openMin: number;
    let closeMin: number;

    const hasEmployeeSchedules = employeeSchedules && employeeSchedules.length > 0;

    if (hasEmployeeSchedules) {
      // Build set of blocked employee IDs (including those blocked by "all staff" entries)
      const blockedEmployeeIds = new Set<string>();
      let allStaffBlocked = false;

      for (const bd of blockedDates ?? []) {
        if (bd.employee_id === null) {
          // All staff blocked on this date
          allStaffBlocked = true;
          break;
        }
        blockedEmployeeIds.add(bd.employee_id);
      }

      if (allStaffBlocked) {
        // Everyone is blocked -- no slots
        return NextResponse.json({ slots: [] });
      }

      // Filter out employees who are individually blocked
      const availableSchedules = employeeSchedules.filter(
        (es) => !blockedEmployeeIds.has(es.employee_id)
      );

      if (availableSchedules.length === 0) {
        // All available employees are blocked on this date
        return NextResponse.json({ slots: [] });
      }

      // Compute the UNION window (widest possible from all available employees)
      let earliestOpen = Infinity;
      let latestClose = -Infinity;

      for (const es of availableSchedules) {
        const esOpen = timeToMinutes(es.start_time);
        const esClose = timeToMinutes(es.end_time);
        if (esOpen < earliestOpen) earliestOpen = esOpen;
        if (esClose > latestClose) latestClose = esClose;
      }

      // Clamp to business hours (don't exceed the business's overall window)
      const businessOpen = timeToMinutes(dayHours.open);
      const businessClose = timeToMinutes(dayHours.close);

      openMin = Math.max(earliestOpen, businessOpen);
      closeMin = Math.min(latestClose, businessClose);
    } else {
      // No employee schedules configured: fall back to business hours (backward compatible)
      openMin = timeToMinutes(dayHours.open);
      closeMin = timeToMinutes(dayHours.close);
    }

    // Generate time slots
    const slots: string[] = [];

    for (let t = openMin; t + totalNeeded <= closeMin; t += slotInterval) {
      const slotEnd = t + totalNeeded;

      // Check for overlap with any existing appointment
      const hasConflict = appointments.some(
        (appt) => t < appt.end && slotEnd > appt.start
      );

      if (!hasConflict) {
        // If employee schedules exist, verify at least one available (non-blocked)
        // employee covers this specific slot time range
        if (hasEmployeeSchedules) {
          const blockedEmployeeIds = new Set<string>();
          for (const bd of blockedDates ?? []) {
            if (bd.employee_id !== null) {
              blockedEmployeeIds.add(bd.employee_id);
            }
          }

          const slotCovered = employeeSchedules!.some((es) => {
            if (blockedEmployeeIds.has(es.employee_id)) return false;
            const esOpen = timeToMinutes(es.start_time);
            const esClose = timeToMinutes(es.end_time);
            return t >= esOpen && (t + totalNeeded) <= esClose;
          });

          if (slotCovered) {
            slots.push(minutesToTime(t));
          }
        } else {
          slots.push(minutesToTime(t));
        }
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
