// Shared Twilio SMS helper — ALL SMS sends MUST go through this file.
// TODO: add sms_log table for full audit trail of all SMS sends

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
    return { success: true, sid: data.sid };
  } catch (err) {
    console.error('[SMS] Send error:', err);
    console.log(`[SMS] type=transactional to=${to} status=error`);
    return { success: false, error: 'SMS send failed' };
  }
}

/**
 * Send a marketing SMS with TCPA opt-out footer.
 * If customerId is provided, verifies sms_consent and frequency cap before sending.
 */
export async function sendMarketingSms(to: string, body: string, customerId?: string): Promise<SendSmsResult> {
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

  const result = await sendSms(to, `${body}\nReply STOP to unsubscribe`);

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
