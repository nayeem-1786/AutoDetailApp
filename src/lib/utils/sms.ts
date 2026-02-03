// Shared Twilio SMS helper
// Extracted from src/app/api/pos/receipts/sms/route.ts

interface SmsResult {
  success: true;
  sid: string;
}

interface SmsError {
  success: false;
  error: string;
}

export type SendSmsResult = SmsResult | SmsError;

/**
 * Send an SMS via Twilio.
 * Validates env vars and returns a typed result.
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
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
      console.error('Twilio error:', errText);
      return { success: false, error: 'Failed to send SMS' };
    }

    const data = await res.json();
    return { success: true, sid: data.sid };
  } catch (err) {
    console.error('SMS send error:', err);
    return { success: false, error: 'SMS send failed' };
  }
}

/**
 * Send a marketing SMS with TCPA opt-out footer.
 */
export async function sendMarketingSms(to: string, body: string): Promise<SendSmsResult> {
  return sendSms(to, `${body}\nReply STOP to unsubscribe`);
}
