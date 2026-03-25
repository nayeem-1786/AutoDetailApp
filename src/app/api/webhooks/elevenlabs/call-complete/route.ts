import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { generateConversationSummary } from '@/lib/services/conversation-summary';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName } from '@/lib/services/service-resolver';

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

    // Fire-and-forget: post-call processing (auto-quote, confirmation SMS)
    if (transcript) {
      processPostCall(admin, normalizedPhone, transcript, conversation.id, customer?.id || null).catch((err) => {
        console.error('[ElevenLabs Webhook] Post-call processing failed:', err);
      });
    }

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

// ---------------------------------------------------------------------------
// Post-call processing — auto-quote and confirmation SMS
// ---------------------------------------------------------------------------

interface CallExtraction {
  services_discussed: string[];
  vehicle: { year?: number; make?: string; model?: string; color?: string } | null;
  appointment_booked: boolean;
  customer_interest: 'interested' | 'maybe' | 'not_interested';
}

async function extractCallInfo(transcript: string): Promise<CallExtraction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: 'Extract information from this auto detailing business phone call transcript. Return JSON only, no markdown.',
        messages: [{
          role: 'user',
          content: `Extract from this call transcript:
- services_discussed: array of service names mentioned (use common auto detailing service names like "Ceramic Coating", "Interior Detail", "Express Wash", etc.)
- vehicle: { year, make, model, color } if mentioned, or null
- appointment_booked: true/false (did they confirm a booking during the call?)
- customer_interest: "interested" | "maybe" | "not_interested"

Return JSON only:

${transcript}`,
        }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(jsonStr) as CallExtraction;
  } catch (err) {
    console.error('[PostCall] Extraction failed:', err);
    return null;
  }
}

async function processPostCall(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  transcript: string,
  conversationId: string,
  customerId: string | null
) {
  const extraction = await extractCallInfo(transcript);
  if (!extraction) return;

  // If appointment was booked, send confirmation SMS
  if (extraction.appointment_booked) {
    // Check SMS consent before sending
    if (customerId) {
      const { data: cust } = await admin
        .from('customers')
        .select('sms_consent, first_name')
        .eq('id', customerId)
        .single();

      if (cust?.sms_consent) {
        const name = cust.first_name ? `, ${cust.first_name}` : '';
        const smsBody = `Thanks for calling Smart Details Auto Spa${name}! Your appointment is confirmed. We look forward to seeing you! Reply STOP to opt out.`;
        await sendSms(phone, smsBody);

        // Log the actual SMS content
        await admin.from('messages').insert({
          conversation_id: conversationId,
          direction: 'outbound',
          body: smsBody,
          sender_type: 'system',
          status: 'delivered',
          channel: 'sms',
        });
      }
    }
    return;
  }

  // If services discussed and customer is interested, auto-generate quote
  if (
    extraction.services_discussed.length === 0 ||
    extraction.customer_interest === 'not_interested'
  ) {
    return;
  }

  // Resolve service names to IDs
  const quoteItems: Array<{
    service_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    tier_name: string | null;
  }> = [];

  for (const serviceName of extraction.services_discussed) {
    const service = await resolveServiceByName(admin, serviceName);
    if (!service) {
      console.warn(`[PostCall] Service not found: "${serviceName}"`);
      continue;
    }
    // Use flat price or first tier price as default
    let price = service.flat_price ?? 0;
    let tierName: string | null = null;
    if (service.service_pricing?.length > 0) {
      price = service.service_pricing[0].price;
      tierName = service.service_pricing[0].tier_name;
    }
    quoteItems.push({
      service_id: service.id,
      item_name: service.name,
      quantity: 1,
      unit_price: price,
      tier_name: tierName,
    });
  }

  if (quoteItems.length === 0) return;

  // Find or create customer
  let custId = customerId;
  if (!custId) {
    const { data: existing } = await admin
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      custId = existing.id;
    } else {
      // Can't create a customer without a name from just a phone call
      // Skip auto-quote for unknown callers who didn't provide name
      console.log('[PostCall] Skipping auto-quote — unknown caller, no name available');
      return;
    }
  }

  // Create vehicle if extracted
  let vehicleId: string | undefined;
  if (extraction.vehicle && (extraction.vehicle.make || extraction.vehicle.model)) {
    const { data: newVehicle } = await admin
      .from('vehicles')
      .insert({
        customer_id: custId,
        vehicle_type: 'standard',
        year: extraction.vehicle.year || null,
        make: extraction.vehicle.make || null,
        model: extraction.vehicle.model || null,
        color: extraction.vehicle.color || null,
      })
      .select('id')
      .single();
    vehicleId = newVehicle?.id;
  }

  // Read quote validity
  const { data: validitySetting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'quote_validity_days')
    .maybeSingle();

  let quoteValidityDays = 10;
  if (validitySetting?.value) {
    try {
      const parsed = JSON.parse(validitySetting.value);
      if (typeof parsed === 'number' && parsed > 0) quoteValidityDays = parsed;
    } catch { /* use fallback */ }
  }

  const validUntil = new Date(Date.now() + quoteValidityDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { quote } = await createQuote(admin, {
      customer_id: custId,
      vehicle_id: vehicleId,
      items: quoteItems,
      notes: 'Auto-generated after phone call',
      valid_until: validUntil,
    });

    const quoteRecord = quote as { id: string; quote_number: string; access_token: string };

    // Mark as sent
    await admin
      .from('quotes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', quoteRecord.id);

    // Generate short link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const quoteUrl = `${appUrl}/quote/${quoteRecord.access_token}`;
    let linkUrl = quoteUrl;
    try { linkUrl = await createShortLink(quoteUrl); } catch { /* use full URL */ }

    // Check SMS consent before sending
    const { data: custCheck } = await admin
      .from('customers')
      .select('sms_consent')
      .eq('id', custId)
      .single();

    if (custCheck?.sms_consent) {
      const quoteSmsBody = `Thanks for calling Smart Details Auto Spa! Here's a quote for what we discussed: ${linkUrl}\n\nReply STOP to opt out.`;
      await sendSms(phone, quoteSmsBody);

      // Log the actual SMS content
      await admin.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        body: quoteSmsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    }

    // Log system note to conversation
    const serviceNames = quoteItems.map((i) => i.item_name).join(', ');
    await admin.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      body: `Auto-quote ${quoteRecord.quote_number} generated after phone call: ${serviceNames}`,
      sender_type: 'system',
      status: 'delivered',
      channel: 'voice',
    });

    // Log quote communication
    await admin.from('quote_communications').insert({
      quote_id: quoteRecord.id,
      channel: 'sms',
      sent_to: phone,
      status: 'sent',
    });

    console.log(`[PostCall] Auto-quote ${quoteRecord.quote_number} sent to ${phone}`);
  } catch (err) {
    console.error('[PostCall] Quote creation failed:', err);
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
