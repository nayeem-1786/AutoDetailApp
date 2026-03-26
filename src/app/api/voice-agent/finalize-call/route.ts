import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { processVoiceCallEnd } from '@/lib/services/voice-post-call';

/**
 * POST /api/voice-agent/finalize-call
 * End-of-call tool — the ElevenLabs agent calls this before hanging up.
 * Logs the call summary, triggers auto-quote/confirmation SMS.
 *
 * Auth: Bearer token (voice_agent_api_key)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const {
      phone,
      customer_name,
      transcript_summary,
      services_discussed,
      appointment_booked,
      customer_interest,
      call_duration_seconds,
      elevenlabs_conversation_id,
    } = body as {
      phone: string;
      customer_name?: string;
      transcript_summary?: string;
      services_discussed?: string; // comma-separated
      appointment_booked?: boolean | string;
      customer_interest?: string;
      call_duration_seconds?: number;
      elevenlabs_conversation_id?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }

    // Normalize boolean — ElevenLabs may send "true"/"false" as strings
    const appointmentBooked =
      appointment_booked === true || appointment_booked === 'true';

    // Parse comma-separated services
    const servicesArr = services_discussed
      ? services_discussed.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    const result = await processVoiceCallEnd({
      phone,
      customerName: customer_name,
      transcriptSummary: transcript_summary,
      servicesDiscussed: servicesArr,
      appointmentBooked,
      customerInterest: customer_interest,
      durationSeconds: call_duration_seconds,
      elevenlabsConversationId: elevenlabs_conversation_id,
      source: 'tool',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      conversation_id: result.conversationId,
      skipped: result.skipped || false,
    });
  } catch (err) {
    console.error('[FinalizeCall] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
