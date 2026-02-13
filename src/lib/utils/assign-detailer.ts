import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Add minutes to a time string (HH:MM) and return the resulting time string.
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Fall back to the business owner (super_admin role).
 */
async function getFallbackOwner(supabase: SupabaseClient): Promise<string | null> {
  const { data: superAdmin } = await supabase
    .from('employees')
    .select('id')
    .eq('role', 'super_admin')
    .eq('status', 'active')
    .limit(1)
    .single();

  return superAdmin?.id ?? null;
}

/**
 * Find an available detailer for a given date/time slot.
 *
 * Logic:
 * 1. Get all active detailers with bookable_for_appointments = true
 * 2. Filter to those scheduled to work on this day/time (if schedules exist)
 * 3. If 1 scheduled detailer → assign them regardless of conflicts
 * 4. If multiple → check appointment conflicts AND active jobs, pick first available
 * 5. If all busy → assign first scheduled detailer anyway
 * 6. If no bookable/scheduled detailers → fall back to super_admin (owner)
 */
export async function findAvailableDetailer(
  supabase: SupabaseClient,
  date: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  // 1. Get all active detailers who can be booked
  const { data: detailers } = await supabase
    .from('employees')
    .select('id')
    .eq('role', 'detailer')
    .eq('status', 'active')
    .eq('bookable_for_appointments', true)
    .order('created_at', { ascending: true });

  if (!detailers || detailers.length === 0) {
    return getFallbackOwner(supabase);
  }

  const detailerIds = detailers.map((d) => d.id);

  // 2. Check employee schedules for this day of week
  const dateObj = new Date(date + 'T12:00:00');
  const dayOfWeek = dateObj.getUTCDay(); // 0=Sun, 6=Sat

  const { data: schedules } = await supabase
    .from('employee_schedules')
    .select('employee_id, start_time, end_time')
    .eq('day_of_week', dayOfWeek)
    .eq('is_available', true)
    .in('employee_id', detailerIds);

  // Filter to detailers whose schedule covers the requested time window
  let candidateIds: string[];

  if (schedules && schedules.length > 0) {
    candidateIds = schedules
      .filter((s) => s.start_time <= startTime && s.end_time >= endTime)
      .map((s) => s.employee_id);
  } else {
    // No schedules configured — all bookable detailers are candidates (backward compatible)
    candidateIds = detailerIds;
  }

  if (candidateIds.length === 0) {
    return getFallbackOwner(supabase);
  }

  if (candidateIds.length === 1) {
    return candidateIds[0];
  }

  // 3. Check for conflicting appointments on this date
  const { data: busyAppointments } = await supabase
    .from('appointments')
    .select('employee_id')
    .eq('scheduled_date', date)
    .in('employee_id', candidateIds)
    .neq('status', 'cancelled')
    .lt('scheduled_start_time', endTime)
    .gt('scheduled_end_time', startTime);

  const busyFromAppointments = new Set(
    busyAppointments?.map((a) => a.employee_id) ?? []
  );

  // 4. Check for active jobs (in_progress or intake) assigned today
  const { data: activeJobs } = await supabase
    .from('jobs')
    .select('assigned_staff_id')
    .in('assigned_staff_id', candidateIds)
    .in('status', ['in_progress', 'intake']);

  const busyFromJobs = new Set(
    activeJobs?.map((j) => j.assigned_staff_id) ?? []
  );

  // 5. Find first available (not busy from either source)
  const busyIds = new Set([...busyFromAppointments, ...busyFromJobs]);
  const available = candidateIds.find((id) => !busyIds.has(id));

  // Return available detailer, or first scheduled one if all busy
  return available ?? candidateIds[0];
}
