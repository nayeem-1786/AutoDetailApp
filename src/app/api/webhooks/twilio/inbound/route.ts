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
 *
 * Feature flag: two_way_sms
 *   STOP/START keyword processing and consent updates ALWAYS run (TCPA compliance).
 *   Conversation creation, AI auto-responder (SMS AI v2; the v1 legacy path
 *   was removed in Phase C), after-hours replies, and message storage are
 *   gated by the two_way_sms feature flag.
 */

import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { updateSmsConsent } from '@/lib/utils/sms-consent';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { loadSmsAiV2Flags, shouldUseSmsAiV2 } from '@/lib/sms-ai/feature-flag';
import { runV2AgentInBackground } from '@/lib/sms-ai/background-dispatch';
import { getBusinessHours, isWithinBusinessHours } from '@/lib/data/business-hours';
import crypto from 'crypto';

const TWIML_EMPTY = '<Response/>';
const TWIML_HEADERS = { 'Content-Type': 'text/xml' };

// Keyword lists MUST stay aligned with Twilio Console compliance keywords
// (Twilio number +14244010094 > Messaging Service > Advanced Opt-Out > Keywords).
// Both Twilio and this app code intercept these messages independently;
// misalignment causes inconsistent behavior. When changing either, update
// both surfaces. Twilio Console state captured 2026-05-22.

/** TCPA opt-out keywords — exact match only */
const STOP_WORDS = [
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'OPTOUT',
  'REVOKE',
];

/** TCPA opt-in keywords — exact match only */
const START_WORDS = [
  'START',
  'SUBSCRIBE',
  'LETSGO',
  'SIGNMEUP',
];

/** Max AI auto-replies per conversation per hour */
const MAX_AI_REPLIES_PER_HOUR = 25;


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

    // -------------------------------------------------------------------
    // 1. Validate Twilio signature (ALWAYS — security)
    // -------------------------------------------------------------------
    const twilioSignature = request.headers.get('x-twilio-signature') || '';
    const requestUrl = process.env.TWILIO_WEBHOOK_URL || request.url;
    const skipSignatureValidation = process.env.NODE_ENV === 'development';

    if (!skipSignatureValidation) {
      if (!validateTwilioSignature(requestUrl, params, twilioSignature)) {
        console.error('[Twilio] Invalid signature — rejecting webhook request');
        return new Response(TWIML_EMPTY, { status: 403, headers: TWIML_HEADERS });
      }
    }

    // -------------------------------------------------------------------
    // 2. Parse body (ALWAYS)
    // -------------------------------------------------------------------
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
    // 3. Customer lookup (ALWAYS — needed for STOP/START consent)
    //    sms_consent is pulled here so the START_WORDS gate (below) can
    //    distinguish "rejoining after opt-out" from "casual affirmative
    //    reply to an agent question". Cheap piggyback on an already-
    //    required SELECT — no extra round-trip.
    // -------------------------------------------------------------------
    let customerId: string | null = null;
    const { data: customer } = await admin
      .from('customers')
      .select('id, sms_consent')
      .eq('phone', normalizedPhone)
      .single();

    if (customer) {
      customerId = customer.id;
    }

    // -------------------------------------------------------------------
    // 4. STOP/START keyword handling (ALWAYS — TCPA compliance)
    //    This block MUST run before the feature flag check. Legally required
    //    regardless of whether two-way SMS messaging is enabled.
    //
    //    STOP_WORDS: unconditional interception (TCPA requires honoring
    //    STOP regardless of prior consent state).
    //
    //    START_WORDS: gated on customer being currently opted out
    //    (sms_consent === false). Prior to 2026-05-22 every inbound "YES"
    //    was unconditionally intercepted, silently breaking the agent's
    //    short-affirmative-reply flow (e.g., customer replies "Yes" to
    //    "want me to send the quote?" — agent never saw it, conversation
    //    stalled). For opted-in / unknown / new customers, START_WORDS
    //    fall through to the normal pipeline; the agent interprets them
    //    via its short-reply rules. See PROMPT_OBSERVATIONS Section 5 /
    //    Issue 16 for the diagnostic and live evidence (conv 23ee4f02
    //    had 6 'Yes' inbounds, 0 agent replies).
    // -------------------------------------------------------------------
    const normalizedBody = body.trim().toUpperCase();
    const isStopWord = STOP_WORDS.includes(normalizedBody);
    const isStartWordKeyword = START_WORDS.includes(normalizedBody);
    const customerIsOptedOut = customer?.sms_consent === false;
    const isStartWord = isStartWordKeyword && customerIsOptedOut;

    if (isStopWord || isStartWord) {
      // Update consent on customer record — TCPA critical
      const consentCustomerId = customerId || await (async () => {
        const { data: phoneCust } = await admin
          .from('customers')
          .select('id')
          .eq('phone', normalizedPhone)
          .single();
        return phoneCust?.id || null;
      })();

      if (consentCustomerId) {
        await updateSmsConsent({
          customerId: consentCustomerId,
          phone: normalizedPhone,
          action: isStopWord ? 'opt_out' : 'opt_in',
          keyword: normalizedBody,
          source: 'inbound_sms',
        });
      }

      // If two-way SMS is enabled, also log to conversation for staff visibility
      const twoWaySmsEnabled = await isFeatureEnabled(FEATURE_FLAGS.TWO_WAY_SMS);
      if (twoWaySmsEnabled) {
        // Find or create conversation for logging
        let { data: conversation } = await admin
          .from('conversations')
          .select('*')
          .eq('phone_number', normalizedPhone)
          .single();

        if (!conversation) {
          const { data: newConv } = await admin
            .from('conversations')
            .insert({
              phone_number: normalizedPhone,
              customer_id: customerId,
              is_ai_enabled: isStartWord, // false for STOP, true for START
              status: 'open',
              last_message_at: new Date().toISOString(),
              last_message_preview: body.substring(0, 200),
              unread_count: 1,
            })
            .select()
            .single();
          conversation = newConv;
        }

        if (conversation) {
          // Store the inbound message
          await admin.from('messages').insert({
            conversation_id: conversation.id,
            direction: 'inbound',
            body,
            media_url: mediaUrl,
            sender_type: 'customer',
            twilio_sid: messageSid,
            status: 'received',
            channel: 'sms',
          });

          // Log system message
          const action = isStopWord ? 'opted out of' : 'opted back in to';
          await admin.from('messages').insert({
            conversation_id: conversation.id,
            direction: 'inbound',
            body: `Customer sent "${body}" — ${action} SMS`,
            sender_type: 'system',
            status: 'received',
            channel: 'sms',
          });

          // Update AI status on conversation
          await admin
            .from('conversations')
            .update({ is_ai_enabled: isStartWord })
            .eq('id', conversation.id);
        }
      }

      return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
    }

    // -------------------------------------------------------------------
    // 5. Feature flag check — gate all inbox/messaging features
    //    Conversation creation, AI auto-responder, after-hours replies,
    //    auto-quote, and message storage are all gated.
    // -------------------------------------------------------------------
    const twoWaySmsEnabled = await isFeatureEnabled(FEATURE_FLAGS.TWO_WAY_SMS);
    if (!twoWaySmsEnabled) {
      console.log(`[Messaging] Inbound SMS from ${from} — two_way_sms disabled, skipping conversation processing`);
      return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
    }

    // -------------------------------------------------------------------
    // 6. Find or create conversation
    // -------------------------------------------------------------------
    let { data: conversation } = await admin
      .from('conversations')
      .select('*')
      .eq('phone_number', normalizedPhone)
      .single();

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
      // Class (a) Item #1 (Session #150) — reactivation was inline here
      // pre-#150 with channel='voice' on the banner as a render hack
      // (`message-bubble.tsx`'s `isNotification` predicate triggered on
      // either `channel='voice'` OR `sender_type='system'`; the OR makes
      // the channel hack redundant). The shared helper
      // `reactivateIfClosed` now owns status flip + banner insert with
      // canonical `channel='sms'` and the AI-context status-marker
      // contract (no `metadata.notificationType`). Banner mode
      // `'customer_re_engaged'` matches the existing copy for the
      // customer-initiated inbound case.
      //
      // Status flip is handled by the helper, NOT inline here, so the
      // `updates` object below drops `status: 'open'` — the conversation
      // row's `last_message_at`/`last_message_preview`/`unread_count`/
      // `customer_id` updates are independent of the reactivation write.
      const { reactivateIfClosed } = await import(
        '@/lib/utils/conversation-helpers'
      );
      await reactivateIfClosed(admin, conversation.id, {
        banner: 'customer_re_engaged',
      });

      const updates: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: body.substring(0, 200),
        last_channel: 'sms',
        unread_count: (conversation.unread_count || 0) + 1,
      };
      if (customerId && !conversation.customer_id) {
        updates.customer_id = customerId;
      }

      await admin
        .from('conversations')
        .update(updates)
        .eq('id', conversation.id);
    }

    // -------------------------------------------------------------------
    // 7. Store the inbound message
    // -------------------------------------------------------------------
    await admin.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      body,
      media_url: mediaUrl,
      sender_type: 'customer',
      twilio_sid: messageSid,
      status: 'received',
      channel: 'sms',
    });

    // -------------------------------------------------------------------
    // 8. Auto-reply logic
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
        // -------------------------------------------------------------
        // SMS AI v2 routing (Phase C — v1 legacy fallback removed).
        // Sits after ALL gating — signature, STOP, two_way_sms,
        // conversation create, inbound INSERT, is_ai_enabled, audience
        // (messaging_ai_unknown/customers_enabled), rate-limit. v2 is
        // the SOLE AI path. shouldUseSmsAiV2 returning false (kill
        // switch ON) OR a thrown flag-load / dispatch error both result
        // in no AI reply — the customer's inbound is stored, manual
        // inbox until fix. See docs/dev/SMS_AI_V2_ROLLBACK.md.
        // -------------------------------------------------------------
        try {
          const v2Flags = await loadSmsAiV2Flags();
          if (shouldUseSmsAiV2(normalizedPhone, v2Flags)) {
            // Fire-and-forget background dispatch. Twilio gets 200 now;
            // the agent loop + outbound SMS happen after this response
            // is flushed. Errors are swallowed and logged inside
            // runV2AgentInBackground — never propagate to the route.
            runV2AgentInBackground({
              inboundMessageBody: body,
              conversationId: conversation.id,
              phone: normalizedPhone,
            }).catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[SmsAiV2 background] dispatch caught: ${msg}`);
            });
            console.log(
              `[SmsAiV2 routing] conv=${conversation.id} phone=${normalizedPhone} → v2`,
            );
            return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
          }
        } catch (v2Err) {
          const msg = v2Err instanceof Error ? v2Err.message : String(v2Err);
          console.error(
            `[SmsAiV2 routing] flag/dispatch threw — dropping AI reply: ${msg}`,
          );
          // v1 legacy fallback was deleted in Phase C (Workstream A
          // Layer 5). On v2 flag-load / dispatch error, log + drop
          // the AI reply rather than fall through. The customer's
          // inbound message is already stored; manual inbox until
          // operator action. Kill switch behaves identically.
          return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
        }

      } else {
        console.warn(`[Messaging] Rate limit hit for conversation ${conversation.id}`);
      }
    }

    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  } catch (err) {
    console.error('Twilio inbound webhook error:', err);
    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  }
}
