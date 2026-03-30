// Shared Twilio SMS helper — ALL SMS sends MUST go through this file.
// Delivery tracking via sms_delivery_log table + Twilio status callback webhook.

import { wrapUrlsInMessage } from '@/lib/utils/link-tracking';

interface SmsResult {
  success: true;
  sid: string;
}

interface SmsError {
  success: false;
  error: string;
}

export type SendSmsResult = SmsResult | SmsError;

export interface SendSmsOptions {
  /** Twilio MediaUrl for MMS (e.g., PDF attachment) */
  mediaUrl?: string;
  /** Customer ID for delivery tracking */
  customerId?: string;
  /** Campaign ID for delivery tracking */
  campaignId?: string;
  /** Lifecycle execution ID for delivery tracking */
  lifecycleExecutionId?: string;
  /** Source label for delivery tracking (defaults to 'transactional') */
  source?: 'campaign' | 'lifecycle' | 'transactional' | 'manual';
  /** If true, auto-log this SMS to the messaging conversation thread */
  logToConversation?: boolean;
  /** Existing conversation ID (avoids phone lookup if known) */
  conversationId?: string;
  /** Notification type label for AI context (e.g., 'job_complete', 'booking_confirmed') */
  notificationType?: string;
  /** Related entity UUID (job, quote, appointment, addon) for traceability */
  contextId?: string;
}

/**
 * Send an SMS (or MMS) via Twilio.
 * Validates env vars and returns a typed result.
 * All SMS sends in the app MUST use this function or sendMarketingSms().
 */
export async function sendSms(to: string, body: string, options?: SendSmsOptions): Promise<SendSmsResult> {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('From', twilioFrom);
    formData.append('To', to);
    formData.append('Body', body);

    if (options?.mediaUrl) {
      formData.append('MediaUrl', options.mediaUrl);
    }

    // Register status callback for delivery tracking
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      formData.append('StatusCallback', `${appUrl}/api/webhooks/twilio/status`);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('[SMS] Twilio error:', errText);
      console.log(`[SMS] type=transactional to=${to} status=failed`);
      return { success: false, error: 'Failed to send SMS' };
    }

    const data = await res.json();
    console.log(`[SMS] type=transactional to=${to} status=sent sid=${data.sid}${options?.mediaUrl ? ' mms=true' : ''}`);

    // Insert initial delivery tracking row
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const adminClient = createAdminClient();
      await adminClient.from('sms_delivery_log').insert({
        message_sid: data.sid,
        to_phone: to,
        from_phone: twilioFrom,
        status: 'queued',
        customer_id: options?.customerId || null,
        campaign_id: options?.campaignId || null,
        lifecycle_execution_id: options?.lifecycleExecutionId || null,
        source: options?.source || 'transactional',
      });
    } catch (logErr) {
      // Don't fail the SMS send if delivery logging fails
      console.error('[SMS] Failed to insert delivery log:', logErr);
    }

    // Auto-log to conversation thread if requested
    if (options?.logToConversation) {
      try {
        const { createAdminClient: createAdmin } = await import('@/lib/supabase/admin');
        const { findOrCreateConversation } = await import('@/lib/utils/conversation-helpers');
        const admin = createAdmin();

        const convId = options.conversationId
          || await findOrCreateConversation(admin, to, options.customerId);

        if (convId) {
          const metadata: Record<string, string> = {};
          if (options.notificationType) metadata.notificationType = options.notificationType;
          if (options.contextId) metadata.contextId = options.contextId;

          await admin.from('messages').insert({
            conversation_id: convId,
            direction: 'outbound',
            body,
            media_url: options.mediaUrl || null,
            sender_type: 'system',
            twilio_sid: data.sid,
            status: 'sent',
            channel: 'sms',
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
          });

          // Update conversation tracking
          const convUpdate: Record<string, unknown> = {
            last_message_at: new Date().toISOString(),
            last_message_preview: body.substring(0, 200),
            last_channel: 'sms',
          };
          if (options.notificationType) {
            convUpdate.last_notification_type = options.notificationType;
            convUpdate.last_notification_at = new Date().toISOString();
          }
          await admin.from('conversations').update(convUpdate).eq('id', convId);
        }
      } catch (convErr) {
        // Never fail the SMS send due to conversation logging errors
        console.error('[SMS] Failed to log to conversation:', convErr);
      }
    }

    return { success: true, sid: data.sid };
  } catch (err) {
    console.error('[SMS] Send error:', err);
    console.log(`[SMS] type=transactional to=${to} status=error`);
    return { success: false, error: 'SMS send failed' };
  }
}

export interface MarketingSmsOptions {
  /** Campaign ID for delivery tracking */
  campaignId?: string;
  /** Lifecycle execution ID for delivery tracking */
  lifecycleExecutionId?: string;
  /** A/B test variant ID for click attribution */
  variantId?: string;
  /** Source label for delivery tracking (defaults to 'campaign') */
  source?: 'campaign' | 'lifecycle' | 'transactional' | 'manual';
}

/**
 * Send a marketing SMS with TCPA opt-out footer.
 * If customerId is provided, verifies sms_consent and frequency cap before sending.
 */
export async function sendMarketingSms(to: string, body: string, customerId?: string, marketingOptions?: MarketingSmsOptions): Promise<SendSmsResult> {
  // Lazy import to avoid circular deps — admin client is server-only
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('sms_consent')
      .eq('id', customerId)
      .single();

    if (customer && customer.sms_consent === false) {
      console.warn(`[SMS] Blocked marketing SMS to opted-out customer: ${customerId}`);
      return { success: false, error: 'SMS consent not granted — message blocked' };
    }

    // Check per-customer daily frequency cap
    const capResult = await checkFrequencyCap(admin, customerId);
    if (!capResult.allowed) {
      console.warn(`[SMS] Daily cap reached for customer ${customerId}: ${capResult.sentToday}/${capResult.cap}`);
      return { success: false, error: `Daily SMS cap reached (${capResult.sentToday}/${capResult.cap})` };
    }
  } else {
    console.warn('[SMS] sendMarketingSms called without customerId — no consent/frequency check performed');
  }

  // Wrap URLs with click tracking when campaign or lifecycle context is present
  let finalBody = body;
  if (marketingOptions?.campaignId || marketingOptions?.lifecycleExecutionId) {
    try {
      finalBody = await wrapUrlsInMessage(body, {
        customerId,
        campaignId: marketingOptions.campaignId,
        lifecycleExecutionId: marketingOptions.lifecycleExecutionId,
        variantId: marketingOptions.variantId,
        source: marketingOptions.source || 'campaign',
      });
    } catch (wrapErr) {
      // Don't block SMS send if URL wrapping fails — use original body
      console.error('[SMS] Failed to wrap URLs for tracking:', wrapErr);
    }
  }

  const result = await sendSms(to, `${finalBody}\nReply STOP to unsubscribe`, {
    customerId: customerId || undefined,
    campaignId: marketingOptions?.campaignId,
    lifecycleExecutionId: marketingOptions?.lifecycleExecutionId,
    source: marketingOptions?.source || 'campaign',
  });

  if (result.success) {
    console.log(`[SMS] type=marketing to=${to} status=sent sid=${result.sid}${customerId ? ` customerId=${customerId}` : ''}`);
  } else {
    console.log(`[SMS] type=marketing to=${to} status=failed${customerId ? ` customerId=${customerId}` : ''}`);
  }

  return result;
}

/**
 * Check if a customer has exceeded their daily SMS cap.
 * Cap is configurable via business_settings key 'sms_daily_cap_per_customer' (default: 5).
 */
async function checkFrequencyCap(
  admin: ReturnType<Awaited<typeof import('@/lib/supabase/admin')>['createAdminClient']>,
  customerId: string
): Promise<{ allowed: boolean; sentToday: number; cap: number }> {
  // Get cap from settings
  const { data: setting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'sms_daily_cap_per_customer')
    .single();

  const rawValue = setting?.value;
  const cap = parseInt(
    typeof rawValue === 'string' ? rawValue.replace(/"/g, '') : String(rawValue ?? '5'),
    10
  ) || 5;

  // Count today's marketing sends (PST timezone)
  const todayPST = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  );
  todayPST.setHours(0, 0, 0, 0);
  const todayStart = todayPST.toISOString();

  // Check campaign_recipients for today
  const { count: campaignCount } = await admin
    .from('campaign_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('delivered', true)
    .gte('sent_at', todayStart);

  // Check lifecycle_executions for today
  const { count: lifecycleCount } = await admin
    .from('lifecycle_executions')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('status', 'sent')
    .gte('executed_at', todayStart);

  const sentToday = (campaignCount || 0) + (lifecycleCount || 0);

  return { allowed: sentToday < cap, sentToday, cap };
}

// ---------------------------------------------------------------------------
// Shared SMS template builders
// ---------------------------------------------------------------------------

/**
 * Build a canonical appointment confirmation SMS used by all entry paths.
 * Returns null if the template is disabled (admin toggled off).
 */
export async function buildAppointmentConfirmationSms(params: {
  businessName: string;
  businessPhone: string;
  date: string;
  time: string;
  serviceName?: string;
  customerFirstName?: string;
  total?: string;
  detailerFirstName?: string;
}): Promise<string | null> {
  const { renderSmsTemplate } = await import('@/lib/sms/render-sms-template');
  const { businessName, businessPhone, date, time, serviceName, customerFirstName, total, detailerFirstName } = params;
  const greeting = customerFirstName ? `Hi ${customerFirstName}, your` : 'Your';
  const serviceLine = serviceName ? `${serviceName}\n` : '';
  const totalLine = total ? `Total: ${total}\n` : '';

  const fallback =
    `${businessName} — Appointment Confirmed\n\n` +
    `${greeting} appointment is scheduled:\n` +
    serviceLine +
    `${date} at ${time}\n` +
    totalLine +
    `\nQuestions? Call ${businessPhone}`;

  const result = await renderSmsTemplate('appointment_confirmed', {
    first_name: customerFirstName,
    service_name: serviceName,
    appointment_date: date,
    appointment_time: time,
    service_total: total,
    detailer_first_name: detailerFirstName,
  }, fallback);

  return result.isActive ? result.body : null;
}
