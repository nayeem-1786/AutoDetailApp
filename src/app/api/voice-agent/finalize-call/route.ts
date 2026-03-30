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
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vehicle_color,
      customer_type,
    } = body as {
      phone: string;
      customer_name?: string;
      transcript_summary?: string;
      services_discussed?: string; // comma-separated
      appointment_booked?: boolean | string;
      customer_interest?: string;
      call_duration_seconds?: number;
      elevenlabs_conversation_id?: string;
      vehicle_year?: number | string;
      vehicle_make?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      customer_type?: string;
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

    // Normalize vehicle_year — ElevenLabs may send as string
    const parsedVehicleYear = vehicle_year
      ? typeof vehicle_year === 'number' ? vehicle_year : parseInt(String(vehicle_year), 10) || undefined
      : undefined;

    // Return immediate 200 so ElevenLabs agent doesn't wait ~3s for processing.
    // PM2 keeps the Node process alive, so fire-and-forget runs to completion.
    // The polling cron is the safety net if background processing is interrupted.
    // Note: the previous 400 error path for dedup (already-processed) is removed —
    // ElevenLabs always gets 200. The dedup check inside processVoiceCallEnd
    // still prevents duplicate DB writes; it just logs and exits silently.
    console.log('[FINALIZE] Returning immediate response, processing async');
    const startTime = Date.now();

    const params = {
      phone,
      customerName: customer_name,
      transcriptSummary: transcript_summary,
      servicesDiscussed: servicesArr,
      appointmentBooked,
      customerInterest: customer_interest,
      durationSeconds: call_duration_seconds,
      elevenlabsConversationId: elevenlabs_conversation_id,
      vehicleYear: parsedVehicleYear,
      vehicleMake: vehicle_make,
      vehicleModel: vehicle_model,
      vehicleColor: vehicle_color,
      customerType: customer_type ? customer_type.trim().toLowerCase() : undefined,
      source: 'tool' as const,
    };

    processVoiceCallEnd(params)
      .then((result) => {
        console.log(
          `[FINALIZE] Background processing completed in ${Date.now() - startTime}ms` +
          ` (success=${result.success}, skipped=${result.skipped || false})`
        );
      })
      .catch((err) => {
        console.error(`[FINALIZE] Background processing failed after ${Date.now() - startTime}ms:`, err);
      });

    return NextResponse.json({
      success: true,
      message: 'Call logged, processing in background',
    });
  } catch (err) {
    console.error('[FinalizeCall] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
