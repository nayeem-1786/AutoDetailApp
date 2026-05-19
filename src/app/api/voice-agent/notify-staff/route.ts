import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import { createPerfTimer } from '@/lib/utils/voice-perf';
import {
  notifyStaff,
  isStaffNotificationReason,
} from '@/lib/services/staff-notification';

/**
 * POST /api/voice-agent/notify-staff
 * Mid-call escalation tool — sends an SMS alert to staff when the voice
 * agent hits a boundary it can't handle (cancellation, custom quote,
 * transfer request, etc.).
 *
 * Auth: Bearer token (voice_agent_api_key)
 *
 * Layer 1+2: refactored to thin HTTP wrapper around notifyStaff() helper
 * (src/lib/services/staff-notification.ts). Behavior preserved verbatim
 * for existing voice-agent callers; the helper now accepts a 7th reason
 * code `human_handoff` which the voice agent may pass forward-compatibly.
 */
export async function POST(request: NextRequest) {
  const perf = createPerfTimer('POST /voice-agent/notify-staff');
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json();
    const { customer_name, customer_phone, reason, details } = body as {
      customer_name: string;
      customer_phone: string;
      reason: string;
      details: string;
    };

    // Validate required fields. Preserved behavior: invalid input returns
    // { success: false } at HTTP 200 (not 4xx) so the ElevenLabs agent
    // doesn't retry on a malformed call.
    if (!isStaffNotificationReason(reason)) {
      return NextResponse.json({ success: false }, { status: 200 });
    }
    if (!details?.trim()) {
      return NextResponse.json({ success: false }, { status: 200 });
    }

    const result = await notifyStaff({
      reason,
      customerName: customer_name,
      customerPhone: customer_phone,
      details,
      source: 'voice_agent',
    });

    // Preserved behavior: existing voice-agent integration only inspects
    // `success`. The endpoint historically returned { success: true }
    // even when template was inactive or recipients failed — keeping that
    // contract for callers (the helper's structured result is for the
    // future SMS AI v2 runner that wants per-recipient detail).
    const responseData = { success: result.success || result.templateInactive === true };
    perf.done(responseData);
    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[NotifyStaff] Error:', err);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
