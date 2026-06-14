// Shared Twilio SMS helper — ALL SMS sends MUST go through this file.
// Delivery tracking via sms_delivery_log table + Twilio status callback webhook.

import { wrapUrlsInMessage } from '@/lib/utils/link-tracking';
import { normalizePhone } from '@/lib/utils/format';

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
  const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  // TWILIO_PHONE_NUMBER kept for display/logging only (sms_delivery_log.from_phone).
  // Sends route via Messaging Service for A2P 10DLC compliance — the Service is
  // attached to the phone number + approved Brand/Campaign at the Twilio account
  // level. From: parameter would bypass that and trigger 30034 - Unregistered Number.
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth) {
    return { success: false, error: 'SMS service not configured' };
  }
  if (!twilioMessagingServiceSid) {
    return {
      success: false,
      error: 'TWILIO_MESSAGING_SERVICE_SID is not configured',
    };
  }

  // Phase Normalization-1: enforce E.164 at the chokepoint. Every caller passes
  // through here; reject malformed phones before touching Twilio so we don't
  // log unparseable numbers to sms_delivery_log (no SID to track anyway).
  const normalized = normalizePhone(to);
  if (!normalized) {
    console.warn(`[SMS] Rejected send to invalid phone: ${JSON.stringify(to)}`);
    return { success: false, error: 'Invalid phone number format' };
  }

  // Session #139 — Concern 4: self-send chokepoint. Refuse to send when
  // the recipient resolves to the same number Twilio sends FROM. The
  // pre-#139 specialty-callback route fell back to [biz.phone] for the
  // staff_assessed_service branch's recipients, which on production is
  // the business's own Twilio number — Twilio either rejected (21266
  // To==From) or self-routed the message into the inbound webhook,
  // silently dropping every staff notification. The route-level fix is
  // in the same session's route commit; this guard hardens EVERY
  // sendSms caller against the same class of bug recurring. Skipped
  // when TWILIO_PHONE_NUMBER env is unset (test environments / dev
  // without a configured number) so it never false-positives.
  if (twilioFrom) {
    const normalizedFrom = normalizePhone(twilioFrom);
    if (normalizedFrom && normalized === normalizedFrom) {
      console.warn(
        `[SMS] Self-send blocked — recipient ${normalized} matches ` +
        `TWILIO_PHONE_NUMBER. This usually means a notification was ` +
        `routed to the business's own Twilio line instead of a staff/` +
        `customer phone; check recipient_phones config and caller logic.`
      );
      return { success: false, error: 'Self-send blocked: recipient matches TWILIO_PHONE_NUMBER' };
    }
  }

  try {
    const formData = new URLSearchParams();
    // MessagingServiceSid and From are mutually exclusive — the Twilio API
    // rejects requests that include both. Sticking with the Service for A2P
    // 10DLC routing.
    formData.append('MessagingServiceSid', twilioMessagingServiceSid);
    formData.append('To', normalized);
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
      console.log(`[SMS] type=transactional to=${normalized} status=failed`);
      return { success: false, error: 'Failed to send SMS' };
    }

    const data = await res.json();
    console.log(`[SMS] type=transactional to=${normalized} status=sent sid=${data.sid}${options?.mediaUrl ? ' mms=true' : ''}`);

    // Insert initial delivery tracking row
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const adminClient = createAdminClient();
      await adminClient.from('sms_delivery_log').insert({
        message_sid: data.sid,
        to_phone: normalized,
        from_phone: twilioFrom ?? null,
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
        const { findOrCreateConversation, reactivateIfClosed } = await import('@/lib/utils/conversation-helpers');
        const admin = createAdmin();

        const convId = options.conversationId
          || await findOrCreateConversation(admin, normalized, options.customerId);

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

          // Class (a) Item #1 (Session #150) — reactivate the conversation
          // if it had been auto-closed or archived. This is the canonical
          // chokepoint for system-initiated outbound SMS; without this
          // call the conversation stays Closed even after the customer
          // visibly receives a fresh payment-link / receipt / reminder.
          // Default banner ('automated_activity') is the right choice
          // here — the trigger is system-initiated. Helper never throws;
          // own try/catch logs failures, conversation logging never
          // breaks the SMS send. See `reactivateIfClosed` jsdoc for the
          // AI-context invariant the banner respects.
          await reactivateIfClosed(admin, convId);
        }
      } catch (convErr) {
        // Never fail the SMS send due to conversation logging errors
        console.error('[SMS] Failed to log to conversation:', convErr);
      }
    }

    return { success: true, sid: data.sid };
  } catch (err) {
    console.error('[SMS] Send error:', err);
    console.log(`[SMS] type=transactional to=${normalized} status=error`);
    return { success: false, error: 'SMS send failed' };
  }
}

/**
 * Split a long message into SMS-segment-sized chunks, preferring natural
 * break points (paragraph → line → sentence → space). Shared between the
 * legacy Twilio webhook auto-reply path and the SMS AI v2 background
 * dispatcher so both produce identical chunk shape.
 *
 * Default `maxLength` = 320 (2 SMS segments). Behavior is byte-identical
 * to the prior private helper in `twilio/inbound/route.ts`.
 */
export function splitSmsMessage(message: string, maxLength: number = 320): string[] {
  if (message.length <= maxLength) return [message];

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    let splitAt = -1;
    const searchArea = remaining.substring(0, maxLength);

    // Priority 1: Split at double newline (paragraph break)
    const doubleNewline = searchArea.lastIndexOf('\n\n');
    if (doubleNewline > maxLength * 0.3) {
      splitAt = doubleNewline;
    }
    // Priority 2: Split at single newline (line/bullet break)
    else {
      const singleNewline = searchArea.lastIndexOf('\n');
      if (singleNewline > maxLength * 0.3) {
        splitAt = singleNewline;
      }
      // Priority 3: Split at last sentence end
      else {
        const sentenceEnd = Math.max(
          searchArea.lastIndexOf('. '),
          searchArea.lastIndexOf('! '),
          searchArea.lastIndexOf('? ')
        );
        if (sentenceEnd > maxLength * 0.3) {
          splitAt = sentenceEnd + 1; // Include the punctuation
        }
        // Priority 4: Split at last space
        else {
          splitAt = searchArea.lastIndexOf(' ');
          if (splitAt <= 0) splitAt = maxLength; // No space found, hard break
        }
      }
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
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
  // Phase Normalization-1: normalize at the chokepoint. sendSms() also
  // normalizes, but we do it here too so the rejection logs surface the
  // marketing-specific context (customerId) and so the marketing-status logs
  // below display the cleaned number.
  const normalized = normalizePhone(to);
  if (!normalized) {
    console.warn(`[SMS] Rejected marketing send to invalid phone: ${JSON.stringify(to)}${customerId ? ` customerId=${customerId}` : ''}`);
    return { success: false, error: 'Invalid phone number format' };
  }

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

  const result = await sendSms(normalized, `${finalBody}\nReply STOP to unsubscribe`, {
    customerId: customerId || undefined,
    campaignId: marketingOptions?.campaignId,
    lifecycleExecutionId: marketingOptions?.lifecycleExecutionId,
    source: marketingOptions?.source || 'campaign',
  });

  if (result.success) {
    console.log(`[SMS] type=marketing to=${normalized} status=sent sid=${result.sid}${customerId ? ` customerId=${customerId}` : ''}`);
  } else {
    console.log(`[SMS] type=marketing to=${normalized} status=failed${customerId ? ` customerId=${customerId}` : ''}`);
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
  customerLastName?: string;
  vehicleDescription?: string;
  total?: string;
  detailerFirstName?: string;
}): Promise<string | null> {
  const { renderSmsTemplate } = await import('@/lib/sms/render-sms-template');
  const { buildAppointmentSummary } = await import('@/lib/sms/composites');
  const { businessName, businessPhone, date, time, serviceName, customerFirstName, customerLastName, vehicleDescription, total } = params;

  // Guard: serviceName is required by contract; missing returns null. Total
  // is OPTIONAL post-Session 2B (voice-agent ad-hoc bookings don't know total
  // at booking time — appointment.total_amount is 0 by design and the caller
  // passes service_total: undefined; engine REMOVE_LINEs the {service_total}
  // line cleanly, see migration 20260427000001).
  if (!serviceName) {
    return null;
  }

  const fallback =
    `${businessName} — Appointment Confirmed\n\n` +
    buildAppointmentSummary({ date, time, serviceName, total, firstName: customerFirstName }) +
    `\nQuestions? Call ${businessPhone}`;

  // Session 2D: forward last_name + vehicle_description cheap-adds when caller
  // provides them. Bodies don't reference these chips today; REMOVE_LINE
  // gracefully drops missing values. Operators can introduce {last_name} or
  // {vehicle_description} into the body via admin UI without any further
  // engineering work.
  const result = await renderSmsTemplate('appointment_confirmed', {
    first_name: customerFirstName,
    last_name: customerLastName,
    service_name: serviceName,
    appointment_date: date,
    appointment_time: time,
    service_total: total,
    vehicle_description: vehicleDescription,
  }, fallback);

  return result.isActive ? result.body : null;
}
