import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { processVoiceCallEnd } from '@/lib/services/voice-post-call';
import crypto from 'crypto';

const ELEVENLABS_WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /api/webhooks/elevenlabs/call-complete
 * After-call webhook — when an ElevenLabs voice call ends, it sends a summary.
 * Logs the call into the unified conversation thread so SMS AI has context.
 *
 * Auth: HMAC signature via ElevenLabs-Signature header (primary),
 *       falls back to Bearer token if ELEVENLABS_WEBHOOK_SECRET not set.
 *
 * Uses shared processVoiceCallEnd() with dedup via voice_call_log table.
 */
export async function POST(request: NextRequest) {
  try {
    // Read raw body for HMAC verification (must be done before .json())
    const rawBody = await request.text();

    // Auth: HMAC signature verification (primary) or Bearer token (fallback)
    if (ELEVENLABS_WEBHOOK_SECRET) {
      const signatureHeader = request.headers.get('elevenlabs-signature') || '';
      if (!verifyElevenLabsSignature(signatureHeader, rawBody, ELEVENLABS_WEBHOOK_SECRET)) {
        console.error('[ElevenLabs Webhook] HMAC signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      // Fallback: Bearer token auth (backward compatibility)
      const auth = await validateApiKey(request);
      if (!auth.valid) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    // Session 2D.2: ElevenLabs's webhook payload uses `conversation_id`, not
    // `call_id`. The mismatch caused this path to never write a voice_call_log
    // row (Phase 0 evidence: 33 rows ever, 0 with source='webhook'). Renaming
    // the destructure restores the elevenlabsConversationId dedup.
    const {
      phone,
      transcript,
      summary,
      duration_seconds,
      conversation_id,
      outcome,
      services_discussed,
      appointment_booked,
      customer_interest,
    } = body as {
      phone: string;
      transcript?: string;
      summary?: string;
      duration_seconds?: number;
      conversation_id?: string;
      outcome?: string;
      services_discussed?: string;
      appointment_booked?: boolean | string;
      customer_interest?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }

    // Build transcript summary from available fields
    const transcriptSummary = summary || (transcript
      ? (transcript.length > 500 ? transcript.substring(0, 500) + '...' : transcript)
      : undefined);

    // Add outcome to summary if available
    const fullSummary = outcome && transcriptSummary
      ? `Outcome: ${outcome}\n${transcriptSummary}`
      : transcriptSummary;

    // Parse services if provided as comma-separated string
    const servicesArr = services_discussed
      ? services_discussed.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    // Normalize boolean
    const appointmentBooked =
      appointment_booked === true || appointment_booked === 'true';

    const result = await processVoiceCallEnd({
      phone,
      transcriptSummary: fullSummary,
      servicesDiscussed: servicesArr,
      appointmentBooked,
      customerInterest: customer_interest,
      durationSeconds: duration_seconds,
      elevenlabsConversationId: conversation_id,
      source: 'webhook',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    console.log(
      `[ElevenLabs Webhook] Call logged for ${phone}` +
      (conversation_id ? ` (conversation_id: ${conversation_id})` : '') +
      (result.skipped ? ' (dedup — already processed)' : '') +
      (duration_seconds ? ` — ${duration_seconds}s` : '')
    );

    return NextResponse.json({
      success: true,
      conversation_id: result.conversationId,
      skipped: result.skipped || false,
    });
  } catch (err) {
    console.error('[ElevenLabs Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Verify ElevenLabs webhook HMAC signature.
 * Header format: t=<timestamp>,v0=<hex_signature>
 * Signature = HMAC-SHA256("<timestamp>.<rawBody>", secret)
 */
function verifyElevenLabsSignature(
  signatureHeader: string,
  rawBody: string,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  // Parse "t=<timestamp>,v0=<signature>" pairs
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const [key, ...rest] = part.split('=');
    if (key && rest.length > 0) {
      parts[key.trim()] = rest.join('=').trim();
    }
  }

  const timestamp = parts['t'];
  const signature = parts['v0'];

  if (!timestamp || !signature) return false;

  // Replay attack protection: reject timestamps older than 5 minutes
  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > SIGNATURE_TOLERANCE_MS) {
    console.error('[ElevenLabs Webhook] Timestamp outside tolerance window');
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}
