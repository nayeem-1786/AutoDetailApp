import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, isWithinBusinessHours, formatBusinessHoursText } from '@/lib/data/business-hours';

/**
 * Returns an after-hours auto-reply message if applicable, or null.
 * Checks: after-hours feature enabled → currently outside business hours → returns template.
 */
export async function getAfterHoursReply(): Promise<string | null> {
  const supabase = createAdminClient();

  // Check if after-hours is enabled and get the template
  const { data: settings } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['messaging_after_hours_enabled', 'messaging_after_hours_message']);

  const settingsMap: Record<string, unknown> = {};
  for (const row of settings ?? []) {
    settingsMap[row.key] = row.value;
  }

  if (!settingsMap.messaging_after_hours_enabled) return null;

  // Check business hours
  const hours = await getBusinessHours();
  if (!hours) return null;
  if (isWithinBusinessHours(hours)) return null; // Not after hours

  // Get template and fill variables
  const template = (settingsMap.messaging_after_hours_message as string) ||
    "Thanks for reaching out! We're currently closed. We'll get back to you when we reopen.";

  const businessInfo = await getBusinessInfo();
  const hoursText = formatBusinessHoursText(hours);

  return template
    .replace('{business_name}', businessInfo.name)
    .replace('{business_hours}', hoursText)
    .replace('{booking_url}', `${businessInfo.website || ''}/book`);
}
