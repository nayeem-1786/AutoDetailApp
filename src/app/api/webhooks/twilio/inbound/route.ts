/**
 * Twilio Inbound SMS Webhook
 *
 * Setup: In Twilio Console → Phone Numbers → +14244010094 →
 *   Messaging Configuration → "A Message Comes In" → Webhook URL:
 *   POST https://[your-domain]/api/webhooks/twilio/inbound
 *
 * Local testing:
 *   twilio phone-numbers:update +14244010094 --sms-url http://localhost:3000/api/webhooks/twilio/inbound
 *   Or use ngrok: ngrok http 3000 → set webhook to ngrok URL
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { getAIResponse, type CustomerContext } from '@/lib/services/messaging-ai';
import { getBusinessHours, isWithinBusinessHours } from '@/lib/data/business-hours';
import crypto from 'crypto';

const TWIML_EMPTY = '<Response/>';
const TWIML_HEADERS = { 'Content-Type': 'text/xml' };

/** TCPA opt-out keywords — exact match only */
const STOP_WORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END'];

/** Max AI auto-replies per conversation per hour */
const MAX_AI_REPLIES_PER_HOUR = 10;

/**
 * Validate Twilio request signature.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = String(value);
    }

    // Validate Twilio signature
    const twilioSignature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = request.url;

    if (false && !validateTwilioSignature(requestUrl, params, twilioSignature)) {
      console.error('Invalid Twilio signature');
      return new Response(TWIML_EMPTY, { status: 403, headers: TWIML_HEADERS });
    }

    const from = params.From || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || '';
    const mediaUrl = params.MediaUrl0 || null;

    if (!from || !body) {
      return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
    }

    const admin = createAdminClient();
    const normalizedPhone = normalizePhone(from) || from;

    // -------------------------------------------------------------------
    // Find or create conversation
    // -------------------------------------------------------------------
    let { data: conversation } = await admin
      .from('conversations')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .single();

    // Try to match a customer by phone
    let customerId: string | null = null;
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    if (customer) {
      customerId = customer.id;
    }

    if (!conversation) {
      const { data: newConv, error: convError } = await admin
        .from('conversations')
        .insert({
          phone_number: normalizedPhone,
          customer_id: customerId,
          is_ai_enabled: true, // Per-conversation toggle — global settings control which audiences get AI
          status: 'open',
          last_message_at: new Date().toISOString(),
          last_message_preview: body.substring(0, 200),
          unread_count: 1,
        })
        .select()
        .single();

      if (convError) {
        console.error('Failed to create conversation:', convError);
        return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
      }

      conversation = newConv;
    } else {
      const wasClosedOrArchived = conversation.status === 'closed' || conversation.status === 'archived';

      const updates: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: body.substring(0, 200),
        unread_count: (conversation.unread_count || 0) + 1,
        status: 'open',
      };
      if (customerId && !conversation.customer_id) {
        updates.customer_id = customerId;
      }

      await admin
        .from('conversations')
        .update(updates)
        .eq('id', conversation.id);

      // Insert system message when a closed/archived conversation is reopened
      if (wasClosedOrArchived) {
        await admin.from('messages').insert({
          conversation_id: conversation.id,
          direction: 'outbound',
          body: 'Conversation reopened — customer re-engaged',
          sender_type: 'system',
          status: 'delivered',
        });
      }
    }

    // -------------------------------------------------------------------
    // STOP word detection — must run before storing the inbound message
    // so we can exit early without triggering auto-replies
    // -------------------------------------------------------------------
    if (STOP_WORDS.some((w) => body.toUpperCase().trim() === w)) {
      // Store the original inbound message
      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'inbound',
        body,
        media_url: mediaUrl,
        sender_type: 'customer',
        twilio_sid: messageSid,
        status: 'received',
      });

      // Log system message noting the opt-out
      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'inbound',
        body: `Customer sent "${body}" — auto-replies disabled`,
        sender_type: 'system',
        status: 'received',
      });

      // Disable AI on this conversation
      await admin
        .from('conversations')
        .update({ is_ai_enabled: false })
        .eq('id', conversation.id);

      return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
    }

    // -------------------------------------------------------------------
    // Store the inbound message
    // -------------------------------------------------------------------
    await admin.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      body,
      media_url: mediaUrl,
      sender_type: 'customer',
      twilio_sid: messageSid,
      status: 'received',
    });

    // -------------------------------------------------------------------
    // Auto-reply logic
    // -------------------------------------------------------------------
    const { data: settingsRows } = await admin
      .from('business_settings')
      .select('key, value')
      .in('key', [
        'messaging_ai_unknown_enabled',
        'messaging_ai_customers_enabled',
      ]);

    const settings: Record<string, string> = {};
    for (const row of settingsRows || []) {
      settings[row.key] = String(row.value);
    }

    const isUnknown = !conversation.customer_id;
    const isCustomer = !!conversation.customer_id;
    const aiEnabledForUnknown = settings.messaging_ai_unknown_enabled === 'true';
    const aiEnabledForCustomers = settings.messaging_ai_customers_enabled === 'true';
    const aiMasterEnabled = aiEnabledForUnknown || aiEnabledForCustomers;

    // Check business hours — after hours, AI handles ALL messages regardless of audience pills
    const hours = await getBusinessHours();
    const duringBusinessHours = hours ? isWithinBusinessHours(hours) : true;

    let autoReply: string | null = null;

    const shouldAiReply =
      conversation.is_ai_enabled &&
      aiMasterEnabled &&
      (!duringBusinessHours ||
        (isUnknown && aiEnabledForUnknown) ||
        (isCustomer && aiEnabledForCustomers));

    if (shouldAiReply) {
      // Rate limiting: count AI replies in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentAiCount } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'ai')
        .eq('direction', 'outbound')
        .gte('created_at', oneHourAgo);

      if ((recentAiCount ?? 0) < MAX_AI_REPLIES_PER_HOUR) {
        try {
          const { data: history } = await admin
            .from('messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: true })
            .limit(20);

          // Build customer context for known customers
          let customerCtx: CustomerContext | undefined;
          if (isCustomer && conversation.customer_id) {
            const { data: custData } = await admin
              .from('customers')
              .select('first_name, last_name, email')
              .eq('id', conversation.customer_id)
              .single();

            const { data: txns } = await admin
              .from('transactions')
              .select('transaction_date, total_amount, transaction_items(item_name)')
              .eq('customer_id', conversation.customer_id)
              .order('transaction_date', { ascending: false })
              .limit(10);

            if (custData) {
              customerCtx = {
                name: `${custData.first_name} ${custData.last_name}`.trim(),
                email: custData.email || undefined,
                transaction_history: (txns || []).map((t) => ({
                  date: new Date(t.transaction_date).toLocaleDateString(),
                  services: ((t.transaction_items as Array<{ item_name: string }>) || []).map(
                    (i) => i.item_name
                  ),
                  total: t.total_amount,
                })),
              };
            }
          }

          autoReply = await getAIResponse(history || [], body, customerCtx);
        } catch (err) {
          console.error('AI auto-reply failed:', err);
        }
      } else {
        console.warn(`[Messaging] Rate limit hit for conversation ${conversation.id}`);
      }
    }

    // Send the auto-reply if we have one
    if (autoReply) {
      const smsResult = await sendSms(normalizedPhone, autoReply);

      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: autoReply,
        sender_type: 'ai',
        twilio_sid: smsResult.success ? smsResult.sid : null,
        status: smsResult.success ? 'sent' : 'failed',
      });

      await admin
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: autoReply.substring(0, 100),
        })
        .eq('id', conversation.id);
    }

    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  } catch (err) {
    console.error('Twilio inbound webhook error:', err);
    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  }
}
