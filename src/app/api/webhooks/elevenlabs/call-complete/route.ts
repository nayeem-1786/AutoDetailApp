import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { generateConversationSummary } from '@/lib/services/conversation-summary';

/**
 * POST /api/webhooks/elevenlabs/call-complete
 * After-call webhook — when an ElevenLabs voice call ends, it sends a summary.
 * Logs the call into the unified conversation thread so SMS AI has context.
 *
 * Auth: Bearer token matching business_settings.voice_agent_api_key
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key (same as voice-agent endpoints)
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7).trim();
    const admin = createAdminClient();

    const { data: setting } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'voice_agent_api_key')
      .single();

    const expectedKey = setting?.value
      ? String(setting.value).replace(/^"|"$/g, '')
      : '';

    if (!expectedKey || token !== expectedKey) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const {
      phone,
      transcript,
      summary,
      duration_seconds,
      call_id,
      outcome,
    } = body as {
      phone: string;
      transcript?: string;
      summary?: string;
      duration_seconds?: number;
      call_id?: string;
      outcome?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // Build the message body from transcript or summary
    const messageBody = buildCallMessage(summary, transcript, outcome, duration_seconds);

    // Find customer by phone
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    // Find or create conversation
    let { data: conversation } = await admin
      .from('conversations')
      .select('id, customer_id')
      .eq('phone_number', normalizedPhone)
      .single();

    const now = new Date().toISOString();

    if (!conversation) {
      const { data: newConv, error: convErr } = await admin
        .from('conversations')
        .insert({
          phone_number: normalizedPhone,
          customer_id: customer?.id || null,
          is_ai_enabled: true,
          status: 'open',
          last_message_at: now,
          last_message_preview: messageBody.substring(0, 200),
          last_channel: 'voice',
          unread_count: 1,
        })
        .select('id, customer_id')
        .single();

      if (convErr || !newConv) {
        console.error('[ElevenLabs Webhook] Failed to create conversation:', convErr);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }
      conversation = newConv;
    } else {
      // Update existing conversation
      const updates: Record<string, unknown> = {
        last_message_at: now,
        last_message_preview: messageBody.substring(0, 200),
        last_channel: 'voice',
        status: 'open',
      };

      // Link customer if not already linked
      if (!conversation.customer_id && customer?.id) {
        updates.customer_id = customer.id;
      }

      await admin
        .from('conversations')
        .update(updates)
        .eq('id', conversation.id);
    }

    // Insert the call summary as a voice message
    await admin.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      body: messageBody,
      sender_type: 'system',
      status: 'received',
      channel: 'voice',
      voice_duration_seconds: duration_seconds || null,
    });

    // Fire-and-forget: regenerate conversation summary with voice context
    generateConversationSummary(conversation.id).catch((err) => {
      console.error('[ElevenLabs Webhook] Summary generation failed:', err);
    });

    console.log(
      `[ElevenLabs Webhook] Call logged for ${normalizedPhone}` +
      (call_id ? ` (call_id: ${call_id})` : '') +
      (duration_seconds ? ` — ${duration_seconds}s` : '')
    );

    return NextResponse.json({
      success: true,
      conversation_id: conversation.id,
    });
  } catch (err) {
    console.error('[ElevenLabs Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildCallMessage(
  summary?: string,
  transcript?: string,
  outcome?: string,
  durationSeconds?: number
): string {
  const parts: string[] = ['Phone call'];

  if (durationSeconds) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    parts[0] += ` (${mins}:${String(secs).padStart(2, '0')})`;
  }

  if (outcome) {
    parts.push(`Outcome: ${outcome}`);
  }

  if (summary) {
    parts.push(`Summary: ${summary}`);
  } else if (transcript) {
    // Truncate long transcripts
    const truncated = transcript.length > 500
      ? transcript.substring(0, 500) + '...'
      : transcript;
    parts.push(`Transcript: ${truncated}`);
  }

  return parts.join('\n');
}
