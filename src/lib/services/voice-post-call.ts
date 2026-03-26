import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { generateConversationSummary } from '@/lib/services/conversation-summary';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName } from '@/lib/services/service-resolver';
import { getBusinessInfo } from '@/lib/data/business';

// ---------------------------------------------------------------------------
// Shared post-call processing logic
// Used by: finalize_call tool, polling cron, call-complete webhook
// ---------------------------------------------------------------------------

export interface ProcessVoiceCallParams {
  phone: string;
  transcriptSummary?: string;
  servicesDiscussed?: string[];
  appointmentBooked?: boolean;
  customerInterest?: string;
  durationSeconds?: number;
  elevenlabsConversationId?: string;
  source: 'tool' | 'poll' | 'webhook';
  /** Skip auto-quote if send_quote_sms was already called during this call */
  skipAutoQuote?: boolean;
}

export interface ProcessVoiceCallResult {
  success: boolean;
  conversationId?: string;
  skipped?: boolean;
  reason?: string;
}

export async function processVoiceCallEnd(
  params: ProcessVoiceCallParams
): Promise<ProcessVoiceCallResult> {
  const admin = createAdminClient();
  const normalizedPhone = normalizePhone(params.phone);

  if (!normalizedPhone) {
    return { success: false, reason: 'Invalid phone number' };
  }

  // Dedup check: skip if this conversation was already processed
  if (params.elevenlabsConversationId) {
    const { data: existing } = await admin
      .from('voice_call_log')
      .select('id')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .maybeSingle();

    if (existing) {
      console.log(`[VoicePostCall] Already processed: ${params.elevenlabsConversationId}`);
      return { success: true, skipped: true, reason: 'Already processed' };
    }
  }

  // Find customer by phone
  const { data: customer } = await admin
    .from('customers')
    .select('id, first_name, sms_consent')
    .eq('phone', normalizedPhone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  // Build the message body
  const messageBody = buildCallMessage(
    params.transcriptSummary,
    params.durationSeconds
  );

  // Find or create conversation
  const now = new Date().toISOString();
  let conversation: { id: string; customer_id: string | null } | null = null;

  const { data: existingConv } = await admin
    .from('conversations')
    .select('id, customer_id')
    .eq('phone_number', normalizedPhone)
    .single();

  if (!existingConv) {
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
      console.error('[VoicePostCall] Failed to create conversation:', convErr);
      return { success: false, reason: 'Failed to create conversation' };
    }
    conversation = newConv;
  } else {
    const updates: Record<string, unknown> = {
      last_message_at: now,
      last_message_preview: messageBody.substring(0, 200),
      last_channel: 'voice',
      status: 'open',
    };
    if (!existingConv.customer_id && customer?.id) {
      updates.customer_id = customer.id;
    }
    await admin
      .from('conversations')
      .update(updates)
      .eq('id', existingConv.id);
    conversation = existingConv;
  }

  // Insert voice message
  await admin.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    body: messageBody,
    sender_type: 'system',
    status: 'received',
    channel: 'voice',
    voice_duration_seconds: params.durationSeconds || null,
  });

  // Regenerate conversation summary
  generateConversationSummary(conversation.id).catch((err) => {
    console.error('[VoicePostCall] Summary generation failed:', err);
  });

  // Post-call actions: auto-quote or confirmation SMS
  const servicesDiscussed = params.servicesDiscussed || [];
  const appointmentBooked = params.appointmentBooked === true;
  const customerInterest = params.customerInterest || 'interested';

  if (appointmentBooked) {
    // Send confirmation SMS
    if (customer?.sms_consent) {
      const biz = await getBusinessInfo();
      const name = customer.first_name ? `, ${customer.first_name}` : '';
      const smsBody = `Thanks for calling ${biz.name}${name}! Your appointment is confirmed. We look forward to seeing you! Reply STOP to opt out.`;
      await sendSms(normalizedPhone, smsBody);

      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: smsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    }
  } else if (
    servicesDiscussed.length > 0 &&
    customerInterest !== 'not_interested' &&
    !params.skipAutoQuote
  ) {
    // Check for recent quotes sent in the last 10 minutes (dedup with send_quote_sms)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentQuotes } = await admin
      .from('quotes')
      .select('id')
      .eq('customer_id', customer?.id || '')
      .gte('created_at', tenMinutesAgo)
      .limit(1);

    if (recentQuotes && recentQuotes.length > 0) {
      console.log('[VoicePostCall] Skipping auto-quote — recent quote exists');
    } else {
      await autoGenerateQuote(
        admin,
        normalizedPhone,
        servicesDiscussed,
        customer?.id || null,
        conversation.id
      );
    }
  }

  // Insert into voice_call_log for dedup
  if (params.elevenlabsConversationId) {
    await admin.from('voice_call_log').insert({
      elevenlabs_conversation_id: params.elevenlabsConversationId,
      phone: normalizedPhone,
      source: params.source,
    }).then(({ error }) => {
      if (error) {
        // Unique constraint violation = already processed (race condition), safe to ignore
        if (!error.code?.includes('23505')) {
          console.error('[VoicePostCall] Failed to insert voice_call_log:', error);
        }
      }
    });
  }

  console.log(
    `[VoicePostCall] Processed call for ${normalizedPhone}` +
    ` (source: ${params.source})` +
    (params.elevenlabsConversationId ? ` (conv: ${params.elevenlabsConversationId})` : '') +
    (params.durationSeconds ? ` — ${params.durationSeconds}s` : '')
  );

  return { success: true, conversationId: conversation.id };
}

// ---------------------------------------------------------------------------
// Auto-generate and send quote
// ---------------------------------------------------------------------------

async function autoGenerateQuote(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  servicesDiscussed: string[],
  customerId: string | null,
  conversationId: string
) {
  // Resolve service names to IDs
  const quoteItems: Array<{
    service_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    tier_name: string | null;
  }> = [];

  for (const serviceName of servicesDiscussed) {
    const service = await resolveServiceByName(admin, serviceName.trim());
    if (!service) {
      console.warn(`[VoicePostCall] Service not found: "${serviceName}"`);
      continue;
    }
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

  // Need a customer to create a quote
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
      console.log('[VoicePostCall] Skipping auto-quote — unknown caller, no name available');
      return;
    }
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

    // Send SMS if customer has consent
    const { data: custCheck } = await admin
      .from('customers')
      .select('sms_consent')
      .eq('id', custId)
      .single();

    if (custCheck?.sms_consent) {
      const biz = await getBusinessInfo();
      const quoteSmsBody = `Thanks for calling ${biz.name}! Here's a quote for what we discussed: ${linkUrl}\n\nReply STOP to opt out.`;
      await sendSms(phone, quoteSmsBody);

      await admin.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        body: quoteSmsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    }

    // Log system note
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

    console.log(`[VoicePostCall] Auto-quote ${quoteRecord.quote_number} sent to ${phone}`);
  } catch (err) {
    console.error('[VoicePostCall] Quote creation failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCallMessage(
  summary?: string,
  durationSeconds?: number
): string {
  const parts: string[] = ['Phone call'];

  if (durationSeconds) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    parts[0] += ` (${mins}:${String(secs).padStart(2, '0')})`;
  }

  if (summary) {
    parts.push(`Summary: ${summary}`);
  }

  return parts.join('\n');
}
