import { NextResponse } from 'next/server';
import { getBusinessInfo } from '@/lib/data/business';

/**
 * POST /api/webhooks/twilio/voice
 * TwiML fallback for inbound voice calls.
 * Used when ElevenLabs voice agent is not configured or unavailable.
 * Plays a greeting with business hours and prompts to leave a message or text.
 */
export async function POST() {
  try {
    const business = await getBusinessInfo();
    const businessName = business.name;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">
    Thank you for calling ${businessName}. We're sorry we can't take your call right now.
    You can also text us at this number for a faster response, or visit our website to book an appointment online.
    Please leave a message after the tone and we'll get back to you as soon as possible.
  </Say>
  <Record maxLength="120" transcribe="true" playBeep="true" />
  <Say voice="Polly.Joanna" language="en-US">
    Thank you for your message. We'll get back to you shortly. Goodbye!
  </Say>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch {
    // Minimal fallback if business info fetch fails
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Please leave a message after the tone.</Say>
  <Record maxLength="120" playBeep="true" />
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
