/**
 * Phone type validation using Twilio Lookup API.
 *
 * OFF by default — each lookup costs ~$0.005.
 * Enable by setting TWILIO_LOOKUP_ENABLED=true in environment.
 *
 * Usage: call at customer creation/update to detect landlines.
 * Landlines cannot receive SMS, so sms_consent should be set to false.
 */

interface PhoneValidationResult {
  valid: boolean;
  type: string | null;
  error?: string;
}

/**
 * Check if a phone number is a valid mobile number (not a landline).
 * Returns { valid: true } if lookup is disabled or the number is mobile/voip.
 * Returns { valid: false, type: 'landline' } if the number is a landline.
 * Fails open — if the lookup API call fails, the number is allowed through.
 */
export async function isValidMobileNumber(phone: string): Promise<PhoneValidationResult> {
  if (process.env.TWILIO_LOOKUP_ENABLED !== 'true') {
    return { valid: true, type: null };
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioSid || !twilioAuth) {
    return { valid: true, type: null, error: 'Twilio credentials not configured' };
  }

  try {
    const encodedPhone = encodeURIComponent(phone);
    const res = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodedPhone}?Fields=line_type_intelligence`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
        },
      }
    );

    if (!res.ok) {
      console.warn('[PHONE] Lookup API error:', res.status, await res.text());
      return { valid: true, type: null, error: 'Lookup failed' };
    }

    const data = await res.json();
    const type = data.line_type_intelligence?.type || null;
    const isLandline = type === 'landline';

    return { valid: !isLandline, type };
  } catch (error) {
    console.warn('[PHONE] Lookup failed, allowing number:', error);
    return { valid: true, type: null, error: 'Lookup failed' };
  }
}
