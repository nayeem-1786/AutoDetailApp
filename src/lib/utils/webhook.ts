import { createAdminClient } from '@/lib/supabase/admin';

export type WebhookEvent =
  | 'booking_created'
  | 'quote_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_completed'
  | 'campaign_send'
  | 'lifecycle_rule_trigger';

/**
 * Fire-and-forget webhook to n8n.
 * Fetches the configured URL from business_settings and POSTs the payload.
 * Silently fails — never blocks the caller.
 */
export async function fireWebhook(
  event: WebhookEvent,
  payload: unknown,
  supabase?: ReturnType<typeof createAdminClient>
): Promise<void> {
  const client = supabase ?? createAdminClient();

  const { data: setting } = await client
    .from('business_settings')
    .select('value')
    .eq('key', 'n8n_webhook_urls')
    .single();

  if (!setting?.value) return;

  const urls = (typeof setting.value === 'string'
    ? JSON.parse(setting.value)
    : setting.value) as Record<string, string | null>;

  const url = urls[event];
  if (!url) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.error(`Webhook ${event} failed: ${res.status} ${res.statusText}`);
  }
}
