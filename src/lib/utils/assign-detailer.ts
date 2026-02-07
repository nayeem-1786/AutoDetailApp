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
 * Find an available detailer for a given date/time slot.
 *
 * Logic:
 * 1. Get all active detailers with bookable_for_appointments = true
 * 2. If 1 detailer → assign them regardless
 * 3. If multiple → check time conflicts on that date, pick first available
 * 4. If all busy → assign first anyway
 * 5. If no bookable detailers → fall back to super_admin
 */
export async function findAvailableDetailer(
  supabase: SupabaseClient,
  date: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  // Get all active detailers who can be booked
  const { data: detailers } = await supabase
    .from('employees')
    .select('id')
    .eq('role', 'detailer')
    .eq('status', 'active')
    .eq('bookable_for_appointments', true)
    .order('created_at', { ascending: true });

  if (detailers && detailers.length > 0) {
    if (detailers.length === 1) {
      return detailers[0].id;
    }

    // Multiple detailers — find one who's free at this time
    const detailerIds = detailers.map((d) => d.id);

    const { data: busyAppointments } = await supabase
      .from('appointments')
      .select('employee_id')
      .eq('scheduled_date', date)
      .in('employee_id', detailerIds)
      .neq('status', 'cancelled')
      .lt('scheduled_start_time', endTime)
      .gt('scheduled_end_time', startTime);

    const busyIds = new Set(busyAppointments?.map((a) => a.employee_id) || []);
    const availableDetailer = detailers.find((d) => !busyIds.has(d.id));

    // Assign available detailer, or first one if all busy
    return availableDetailer?.id ?? detailers[0].id;
  }

  // No bookable detailers — fall back to super_admin
  const { data: superAdmin } = await supabase
    .from('employees')
    .select('id')
    .eq('role', 'super_admin')
    .eq('status', 'active')
    .limit(1)
    .single();

  return superAdmin?.id ?? null;
}
