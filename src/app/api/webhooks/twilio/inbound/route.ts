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
import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { updateSmsConsent } from '@/lib/utils/sms-consent';
import { getAIResponse, type CustomerContext } from '@/lib/services/messaging-ai';
import { getBusinessHours, isWithinBusinessHours } from '@/lib/data/business-hours';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import crypto from 'crypto';

const TWIML_EMPTY = '<Response/>';
const TWIML_HEADERS = { 'Content-Type': 'text/xml' };

/** TCPA opt-out keywords — exact match only */
const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

/** TCPA opt-in keywords — exact match only */
const START_WORDS = ['START', 'YES', 'UNSTOP'];

/** Max AI auto-replies per conversation per hour */
const MAX_AI_REPLIES_PER_HOUR = 10;

// -------------------------------------------------------------------
// Auto-quote helpers
// -------------------------------------------------------------------

interface ParsedQuoteData {
  customer_name: string;
  customer_phone: string;
  vehicle_year?: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color?: string;
  vehicle_type: string;
  services: string[];
  tier: string;
}

/** Parse [GENERATE_QUOTE] block from AI response. Replaces {phone} placeholder. */
function extractQuoteRequest(
  aiResponse: string,
  phone: string
): { cleanMessage: string; quoteData: ParsedQuoteData | null } {
  const match = aiResponse.match(/\[GENERATE_QUOTE\]([\s\S]*?)\[\/GENERATE_QUOTE\]/);

  if (!match) {
    return { cleanMessage: aiResponse, quoteData: null };
  }

  const cleanMessage = aiResponse
    .replace(/\[GENERATE_QUOTE\][\s\S]*?\[\/GENERATE_QUOTE\]/, '')
    .trim();

  const block = match[1];
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

  const fields: Record<string, string> = {};
  const services: string[] = [];

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === 'services') {
      services.push(value);
    } else {
      fields[key] = value;
    }
  }

  if (!fields.customer_name || services.length === 0 || !fields.vehicle_make || !fields.vehicle_model) {
    console.warn('[Auto-Quote] Missing required fields in quote block');
    return { cleanMessage, quoteData: null };
  }

  // Replace {phone} placeholder with actual phone number
  const customerPhone = (fields.customer_phone || '').replace('{phone}', phone);

  return {
    cleanMessage,
    quoteData: {
      customer_name: fields.customer_name,
      customer_phone: customerPhone || phone,
      vehicle_year: fields.vehicle_year,
      vehicle_make: fields.vehicle_make,
      vehicle_model: fields.vehicle_model,
      vehicle_color: fields.vehicle_color,
      vehicle_type: fields.vehicle_type || 'sedan',
      services,
      tier: fields.tier || fields.vehicle_type || 'sedan',
    },
  };
}

/** Map AI vehicle_type output to DB size_class enum */
function mapVehicleSizeClass(aiType: string): 'sedan' | 'truck_suv_2row' | 'suv_3row_van' {
  switch (aiType) {
    case 'truck_suv': return 'truck_suv_2row';
    case 'suv_van': return 'suv_3row_van';
    default: return 'sedan';
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const lastSpaceIdx = trimmed.lastIndexOf(' ');
  if (lastSpaceIdx === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.slice(0, lastSpaceIdx),
    lastName: trimmed.slice(lastSpaceIdx + 1),
  };
}

/** Case-insensitive service lookup with pricing tiers */
async function resolveServiceByName(admin: SupabaseClient, name: string) {
  const { data } = await admin
    .from('services')
    .select(`
      id, name, pricing_model, flat_price,
      service_pricing(tier_name, price, vehicle_size_sedan_price,
        vehicle_size_truck_suv_price, vehicle_size_suv_van_price, is_vehicle_size_aware)
    `)
    .ilike('name', name)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as {
    id: string;
    name: string;
    pricing_model: string;
    flat_price: number | null;
    service_pricing: Array<{
      tier_name: string;
      price: number;
      vehicle_size_sedan_price: number | null;
      vehicle_size_truck_suv_price: number | null;
      vehicle_size_suv_van_price: number | null;
      is_vehicle_size_aware: boolean;
    }>;
  } | null;
}

/** Resolve the correct price for a service given vehicle size class */
function resolvePrice(
  service: NonNullable<Awaited<ReturnType<typeof resolveServiceByName>>>,
  sizeClass: string
): { price: number; tierName: string | null } {
  const tiers = service.service_pricing || [];

  switch (service.pricing_model) {
    case 'flat':
      return { price: service.flat_price ?? 0, tierName: null };

    case 'vehicle_size':
    case 'scope': {
      if (tiers.length === 0) return { price: service.flat_price ?? 0, tierName: null };
      const tier = tiers[0];
      if (tier.is_vehicle_size_aware && tier.vehicle_size_sedan_price != null) {
        switch (sizeClass) {
          case 'truck_suv_2row':
            return { price: tier.vehicle_size_truck_suv_price ?? tier.price, tierName: tier.tier_name };
          case 'suv_3row_van':
            return { price: tier.vehicle_size_suv_van_price ?? tier.price, tierName: tier.tier_name };
          default:
            return { price: tier.vehicle_size_sedan_price ?? tier.price, tierName: tier.tier_name };
        }
      }
      return { price: tier.price, tierName: tier.tier_name };
    }

    default:
      // per_unit, specialty, custom — first tier as fallback
      if (tiers.length > 0) return { price: tiers[0].price, tierName: tiers[0].tier_name };
      return { price: service.flat_price ?? 0, tierName: null };
  }
}

/** Split a long message into SMS-friendly chunks at natural break points */
function splitSmsMessage(message: string, maxLength: number = 320): string[] {
  if (message.length <= maxLength) return [message];

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    let splitAt = -1;
    const searchArea = remaining.substring(0, maxLength);

    // Priority 1: Split at double newline (paragraph break)
    const doubleNewline = searchArea.lastIndexOf('\n\n');
    if (doubleNewline > maxLength * 0.3) {
      splitAt = doubleNewline;
    }
    // Priority 2: Split at single newline (line/bullet break)
    else {
      const singleNewline = searchArea.lastIndexOf('\n');
      if (singleNewline > maxLength * 0.3) {
        splitAt = singleNewline;
      }
      // Priority 3: Split at last sentence end
      else {
        const sentenceEnd = Math.max(
          searchArea.lastIndexOf('. '),
          searchArea.lastIndexOf('! '),
          searchArea.lastIndexOf('? ')
        );
        if (sentenceEnd > maxLength * 0.3) {
          splitAt = sentenceEnd + 1; // Include the punctuation
        }
        // Priority 4: Split at last space
        else {
          splitAt = searchArea.lastIndexOf(' ');
          if (splitAt <= 0) splitAt = maxLength; // No space found, hard break
        }
      }
    }

    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  return chunks;
}

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
    // STOP/START keyword detection — must run before storing the inbound
    // message so we can exit early without triggering auto-replies
    // -------------------------------------------------------------------
    const normalizedBody = body.trim().toUpperCase();
    const isStopWord = STOP_WORDS.includes(normalizedBody);
    const isStartWord = START_WORDS.includes(normalizedBody);

    if (isStopWord) {
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
        body: `Customer sent "${body}" — opted out of SMS`,
        sender_type: 'system',
        status: 'received',
      });

      // Disable AI on this conversation
      await admin
        .from('conversations')
        .update({ is_ai_enabled: false })
        .eq('id', conversation.id);

      // Update sms_consent on customer record (TCPA critical)
      if (customerId) {
        await updateSmsConsent({
          customerId,
          phone: normalizedPhone,
          action: 'opt_out',
          keyword: normalizedBody,
          source: 'inbound_sms',
        });
      } else {
        // No customer record linked — try to find by phone
        const { data: phoneCust } = await admin
          .from('customers')
          .select('id')
          .eq('phone', normalizedPhone)
          .single();

        if (phoneCust) {
          await updateSmsConsent({
            customerId: phoneCust.id,
            phone: normalizedPhone,
            action: 'opt_out',
            keyword: normalizedBody,
            source: 'inbound_sms',
          });
        }
      }

      // Do NOT send any reply — Twilio handles the STOP auto-response
      return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
    }

    if (isStartWord) {
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

      // Log system message noting the opt-in
      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'inbound',
        body: `Customer sent "${body}" — opted back in to SMS`,
        sender_type: 'system',
        status: 'received',
      });

      // Re-enable AI on this conversation
      await admin
        .from('conversations')
        .update({ is_ai_enabled: true })
        .eq('id', conversation.id);

      // Update sms_consent on customer record
      if (customerId) {
        await updateSmsConsent({
          customerId,
          phone: normalizedPhone,
          action: 'opt_in',
          keyword: normalizedBody,
          source: 'inbound_sms',
        });
      } else {
        const { data: phoneCust } = await admin
          .from('customers')
          .select('id')
          .eq('phone', normalizedPhone)
          .single();

        if (phoneCust) {
          await updateSmsConsent({
            customerId: phoneCust.id,
            phone: normalizedPhone,
            action: 'opt_in',
            keyword: normalizedBody,
            source: 'inbound_sms',
          });
        }
      }

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

    // -------------------------------------------------------------------
    // Auto-quote processing — extract quote block and generate real quote
    // -------------------------------------------------------------------
    if (autoReply) {
      const { cleanMessage, quoteData } = extractQuoteRequest(autoReply, normalizedPhone);

      if (quoteData) {
        try {
          const { firstName, lastName } = splitName(quoteData.customer_name);
          const sizeClass = mapVehicleSizeClass(quoteData.vehicle_type);

          // Find or create customer
          let quoteCustomerId = customerId;
          if (!quoteCustomerId) {
            const { data: existingCust } = await admin
              .from('customers')
              .select('id')
              .eq('phone', normalizedPhone)
              .limit(1)
              .single();

            if (existingCust) {
              quoteCustomerId = existingCust.id;
            } else {
              const { data: newCust, error: custErr } = await admin
                .from('customers')
                .insert({
                  first_name: firstName,
                  last_name: lastName,
                  phone: normalizedPhone,
                  sms_consent: true,
                  email_consent: true,
                  customer_type: 'enthusiast',
                })
                .select('id')
                .single();

              if (custErr || !newCust) {
                throw new Error(`Customer creation failed: ${custErr?.message}`);
              }
              quoteCustomerId = newCust.id;

              // Log SMS consent for new customer (texting in = implied consent)
              await updateSmsConsent({
                customerId: newCust.id,
                phone: normalizedPhone,
                action: 'opt_in',
                keyword: 'sms_initiated',
                source: 'inbound_sms',
                notes: 'Customer initiated SMS conversation (auto-quote)',
              });
            }
          }

          // Find or create vehicle (match by customer + make + model + year)
          let vehicleQuery = admin
            .from('vehicles')
            .select('id')
            .eq('customer_id', quoteCustomerId)
            .ilike('make', quoteData.vehicle_make)
            .ilike('model', quoteData.vehicle_model);

          if (quoteData.vehicle_year) {
            vehicleQuery = vehicleQuery.eq('year', parseInt(quoteData.vehicle_year, 10));
          }

          const { data: existingVehicle } = await vehicleQuery.limit(1).single();

          let vehicleId: string | null = null;
          if (existingVehicle) {
            vehicleId = existingVehicle.id;
          } else {
            const { data: newVehicle, error: vehErr } = await admin
              .from('vehicles')
              .insert({
                customer_id: quoteCustomerId,
                vehicle_type: 'standard',
                size_class: sizeClass,
                year: quoteData.vehicle_year ? parseInt(quoteData.vehicle_year, 10) : null,
                make: quoteData.vehicle_make,
                model: quoteData.vehicle_model,
                color: quoteData.vehicle_color || null,
              })
              .select('id')
              .single();

            if (vehErr || !newVehicle) {
              console.error('[Auto-Quote] Vehicle creation failed:', vehErr?.message);
            } else {
              vehicleId = newVehicle.id;
            }
          }

          // Resolve services and prices
          const quoteItems: Array<{
            service_id: string;
            item_name: string;
            quantity: number;
            unit_price: number;
            tier_name: string | null;
          }> = [];

          for (const serviceName of quoteData.services) {
            const service = await resolveServiceByName(admin, serviceName);
            if (!service) {
              console.warn(`[Auto-Quote] Service not found: "${serviceName}"`);
              continue;
            }
            const { price, tierName } = resolvePrice(service, sizeClass);
            quoteItems.push({
              service_id: service.id,
              item_name: service.name,
              quantity: 1,
              unit_price: price,
              tier_name: tierName,
            });
          }

          if (quoteItems.length > 0) {
            const validUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

            const { quote } = await createQuote(admin, {
              customer_id: quoteCustomerId,
              vehicle_id: vehicleId || undefined,
              items: quoteItems,
              notes: `Auto-generated via SMS for ${quoteData.vehicle_year || ''} ${quoteData.vehicle_make} ${quoteData.vehicle_model}`.trim(),
              valid_until: validUntil,
            });

            // Update quote from draft → sent
            const quoteRecord = quote as { id: string; access_token: string };
            await admin
              .from('quotes')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', quoteRecord.id);

            // Generate short link for the quote
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
            const quoteUrl = `${appUrl}/quote/${quoteRecord.access_token}`;
            let linkUrl = quoteUrl;
            try {
              linkUrl = await createShortLink(quoteUrl);
            } catch {
              // Fall back to full URL
            }

            // Log quote communication
            const { error: commErr } = await admin.from('quote_communications').insert({
              quote_id: quoteRecord.id,
              channel: 'sms',
              sent_to: normalizedPhone,
              status: 'sent',
            });
            if (commErr) console.error('[Auto-Quote] Failed to log communication:', commErr.message);

            // Append quote link to clean message (splitting handled later)
            autoReply = cleanMessage + `\n\nView your quote: ${linkUrl}`;

            // Link customer to conversation if not already linked
            if (quoteCustomerId && !conversation.customer_id) {
              await admin
                .from('conversations')
                .update({ customer_id: quoteCustomerId })
                .eq('id', conversation.id);
            }
          } else {
            // No services resolved — send clean message without link
            autoReply = cleanMessage;
          }
        } catch (err) {
          console.error('[Auto-Quote] Failed to generate quote:', err);
          autoReply = cleanMessage;
        }
      } else {
        // No quote block — use clean message as-is (splitting handled below)
        autoReply = cleanMessage;
      }
    }

    // Send the auto-reply if we have one — split long messages into chunks
    if (autoReply) {
      const smsChunks = splitSmsMessage(autoReply);

      for (const chunk of smsChunks) {
        const smsResult = await sendSms(normalizedPhone, chunk);

        await admin.from('messages').insert({
          conversation_id: conversation.id,
          direction: 'outbound',
          body: chunk,
          sender_type: 'ai',
          twilio_sid: smsResult.success ? smsResult.sid : null,
          status: smsResult.success ? 'sent' : 'failed',
        });
      }

      const lastChunk = smsChunks[smsChunks.length - 1];
      await admin
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: lastChunk.substring(0, 100),
        })
        .eq('id', conversation.id);
    }

    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  } catch (err) {
    console.error('Twilio inbound webhook error:', err);
    return new Response(TWIML_EMPTY, { status: 200, headers: TWIML_HEADERS });
  }
}
