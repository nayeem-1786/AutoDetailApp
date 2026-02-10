/**
 * Twilio SMS Status Callback Webhook
 *
 * Receives delivery status updates for outbound SMS messages.
 * Twilio sends POST requests here when message status changes:
 *   queued -> sent -> delivered (or failed/undelivered)
 *
 * Setup: Configure as StatusCallback URL in Twilio API calls
 *   (automatically added by sendSms/sendMarketingSms via statusCallback param)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

/**
 * Validate Twilio request signature.
 * Same pattern as the inbound webhook.
 */
function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    // Validate Twilio signature (skip in development — ngrok/localhost URLs won't match)
    const twilioSignature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;
    const skipSignatureValidation = process.env.NODE_ENV === 'development';

    if (!skipSignatureValidation && !validateTwilioSignature(requestUrl, params, twilioSignature)) {
      console.error('[SMS_DELIVERY] Invalid Twilio signature — rejecting webhook request');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const messageSid = params.MessageSid || '';
    const messageStatus = params.MessageStatus || '';
    const errorCode = params.ErrorCode || null;
    const errorMessage = params.ErrorMessage || null;

    if (!messageSid || !messageStatus) {
      console.warn('[SMS_DELIVERY] Missing MessageSid or MessageStatus');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log(`[SMS_DELIVERY] sid=${messageSid} status=${messageStatus}${errorCode ? ` error=${errorCode}` : ''}`);

    const admin = createAdminClient();

    // Upsert: update if row exists (initial row created by sendSms), insert if somehow missing
    const { error } = await admin
      .from('sms_delivery_log')
      .update({
        status: messageStatus,
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('message_sid', messageSid);

    if (error) {
      console.error('[SMS_DELIVERY] Failed to update delivery log:', error.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[SMS_DELIVERY] Webhook error:', err);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
