import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

// Matches the shape stored in business_settings → business_hours
// Each day is either { open, close } or null (closed that day)
export interface DayHours {
  open: string; // "08:00"
  close: string; // "18:00"
}

export type BusinessHours = Record<string, DayHours | null>;

export async function getBusinessHours(): Promise<BusinessHours | null> {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    supabase = createAnonClient();
  }

  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'business_hours')
    .single();

  if (!data?.value) return null;
  return data.value as BusinessHours;
}

export function isWithinBusinessHours(hours: BusinessHours): boolean {
  const now = new Date();
  // Business is in Pacific time — use America/Los_Angeles
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = days[pst.getDay()];
  const dayHours = hours[dayKey];

  if (!dayHours) return false;

  const currentMinutes = pst.getHours() * 60 + pst.getMinutes();
  const [openH, openM] = dayHours.open.split(':').map(Number);
  const [closeH, closeM] = dayHours.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

/**
 * Format business hours into a human-readable string for templates.
 * Example: "Mon-Fri 8:00 AM - 6:00 PM, Sat 8:00 AM - 6:00 PM"
 */
export function formatBusinessHoursText(hours: BusinessHours): string {
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayAbbr: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };

  const lines: string[] = [];
  let i = 0;

  while (i < dayOrder.length) {
    const day = dayOrder[i];
    const dh = hours[day];

    if (!dh) {
      i++;
      continue;
    }

    // Find consecutive days with same hours
    let j = i + 1;
    while (j < dayOrder.length) {
      const nextDh = hours[dayOrder[j]];
      if (!nextDh || nextDh.open !== dh.open || nextDh.close !== dh.close) break;
      j++;
    }

    const formatTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return m === 0 ? `${hour12} ${ampm}` : `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
    };

    const range = `${formatTime(dh.open)} - ${formatTime(dh.close)}`;
    if (j - i === 1) {
      lines.push(`${dayAbbr[day]} ${range}`);
    } else {
      lines.push(`${dayAbbr[dayOrder[i]]}-${dayAbbr[dayOrder[j - 1]]} ${range}`);
    }

    i = j;
  }

  return lines.length > 0 ? lines.join(', ') : 'Hours not available';
}
