import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { generateConversationSummary } from '@/lib/services/conversation-summary';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName, resolvePrice } from '@/lib/services/service-resolver';
import { applyCombosToQuoteItems } from '@/lib/services/combo-resolver';
import { getBusinessInfo } from '@/lib/data/business';
import { sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { buildFirstNameGreeting } from '@/lib/sms/composites';
import { isRecentDuplicateSms } from '@/lib/sms/dedup';

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
  customerName?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  customerType?: string;
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

  // Session 2D.2: cross-check the messages-log for a recent duplicate postcall
  // SMS, before the elevenlabsConversationId dedup runs. Catches the case where
  // finalize-call (tool) doesn't pass elevenlabs_conversation_id and the
  // primary dedup is bypassed entirely — see voice_call_log evidence in the
  // 2D.2 Phase 0 report (33 rows ever, all source='poll'). Gated on
  // params.appointmentBooked because 'voice_followup' is only sent in that
  // branch; the auto-quote path uses a different notificationType and is not
  // subject to the same triple-source duplicate risk.
  if (params.appointmentBooked === true) {
    const isDuplicate = await isRecentDuplicateSms({
      phone: normalizedPhone,
      notificationType: 'voice_followup',
      supabase: admin,
    });
    if (isDuplicate) {
      console.log('[VoicePostCall] dedup-by-sms-log: skipping postcall SMS, recent send detected');
      return { success: true, skipped: true, reason: 'duplicate_sms_recently_sent' };
    }
  }

  // Dedup check: skip if this conversation was already processed or is in progress
  if (params.elevenlabsConversationId) {
    const { data: existing } = await admin
      .from('voice_call_log')
      .select('id, status, processed_at')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .maybeSingle();

    if (existing) {
      // Reclaimable states (Session VPC-1):
      //   - 'processing' older than 5 min (abandoned claim — recoverable)
      //   - 'awaiting_data' (cron pre-tracked the conversation while ElevenLabs
      //     finalized data; now phone is available via retry-tick or via
      //     finalize_call/webhook arriving after the cron's first poll)
      // Terminal states ('completed', 'failed_no_phone', legacy 'processed')
      // always skip.
      const isStaleProcessing = existing.status === 'processing' &&
        existing.processed_at &&
        Date.now() - new Date(existing.processed_at).getTime() > 5 * 60 * 1000;
      const isReclaimable = isStaleProcessing || existing.status === 'awaiting_data';

      if (!isReclaimable) {
        console.log(`[VoicePostCall] Already processed: ${params.elevenlabsConversationId} (status: ${existing.status})`);
        return { success: true, skipped: true, reason: 'Already processed' };
      }
      const reclaimReason = isStaleProcessing ? "stale 'processing' (>5min)" : "'awaiting_data'";
      console.log(`[VoicePostCall] Reclaiming ${reclaimReason} entry — reprocessing: ${params.elevenlabsConversationId}`);
    }

    // Immediately claim this conversation to close the race window.
    // If another process claimed it between our check and insert, the unique
    // constraint will catch it and we bail.
    const { error: claimErr } = existing
      ? await admin.from('voice_call_log')
          .update({ status: 'processing', source: params.source, processed_at: new Date().toISOString() })
          .eq('id', existing.id)
      : await admin.from('voice_call_log')
          .insert({
            elevenlabs_conversation_id: params.elevenlabsConversationId,
            phone: normalizedPhone,
            source: params.source,
            status: 'processing',
          });

    if (claimErr) {
      if (claimErr.code?.includes('23505')) {
        console.log(`[VoicePostCall] Lost race to claim ${params.elevenlabsConversationId} — skipping`);
        return { success: true, skipped: true, reason: 'Lost race' };
      }
      console.error('[VoicePostCall] Failed to claim voice_call_log:', claimErr);
    }
  }

  // Find customer by phone.
  // Session 2B: SELECT expanded with last_name/email/phone — only first_name is
  // consumed by the appointment_confirmed_postcall contract today (the L347
  // chip pass), but the rest are loaded into scope so Session 3D can chip-wire
  // any downstream caller refactor without an additional SELECT round-trip.
  const { data: customer } = await admin
    .from('customers')
    .select('id, first_name, last_name, email, phone, sms_consent, customer_type')
    .eq('phone', normalizedPhone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  // Auto-enable SMS consent for inbound callers — calling the business = transactional consent
  if (customer && !customer.sms_consent) {
    try {
      const { updateSmsConsent } = await import('@/lib/utils/sms-consent');
      await updateSmsConsent({
        customerId: customer.id,
        phone: normalizedPhone,
        action: 'opt_in',
        keyword: 'inbound_call',
        source: 'inbound_call',
        notes: 'Customer initiated phone call — auto-enabled transactional SMS consent',
      });
      customer.sms_consent = true;
      console.log(`[VoicePostCall] Auto-enabled SMS consent for customer ${customer.id} (inbound call)`);
    } catch (consentErr) {
      console.error('[VoicePostCall] Failed to auto-enable SMS consent:', consentErr);
    }
  }

  // Upgrade generic customer name if a real name is available
  if (customer && params.customerName && params.customerName.trim().length > 0) {
    const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
    if (
      customer.first_name &&
      GENERIC_FIRST_NAMES.includes(customer.first_name.toLowerCase())
    ) {
      const nameParts = params.customerName.trim().split(/\s+/);
      const newFirst = nameParts[0];
      const newLast = nameParts.slice(1).join(' ') || '';
      await admin
        .from('customers')
        .update({ first_name: newFirst, last_name: newLast })
        .eq('id', customer.id);
      customer.first_name = newFirst;
      console.log(`[VoicePostCall] Upgrading customer name from "${customer.first_name}" to "${params.customerName.trim()}" for ${normalizedPhone}`);
    }
  }

  // Classify customer type — tool params take priority, transcript inference as fallback
  const validTypes = ['enthusiast', 'professional'];
  if (customer && !customer.customer_type) {
    let resolvedType: string | null = null;

    if (params.customerType && validTypes.includes(params.customerType)) {
      resolvedType = params.customerType;
    } else {
      resolvedType = inferCustomerType(params.transcriptSummary || '');
    }

    if (resolvedType) {
      await admin
        .from('customers')
        .update({ customer_type: resolvedType })
        .eq('id', customer.id);
      console.log(`[VoicePostCall] Set customer_type to "${resolvedType}" for ${normalizedPhone} (source: ${params.customerType ? 'tool' : 'transcript'})`);
    }
  }

  // Resolve vehicle info — tool params take priority, transcript extraction as fallback
  // Sanitize all vehicle fields to strip "Unknown" values from LLM output
  let resolvedVehicleMake = sanitizeVehicleField(params.vehicleMake) ?? undefined;
  let resolvedVehicleModel = sanitizeVehicleField(params.vehicleModel) ?? undefined;
  let resolvedVehicleYear: number | undefined = undefined;
  let resolvedVehicleColor = sanitizeVehicleField(params.vehicleColor) ?? undefined;

  if (params.vehicleYear != null) {
    const sanitized = sanitizeVehicleField(params.vehicleYear);
    if (sanitized) resolvedVehicleYear = parseInt(sanitized, 10) || undefined;
  }

  if (!resolvedVehicleMake && !resolvedVehicleModel && params.transcriptSummary) {
    const extracted = extractVehicleFromTranscript(params.transcriptSummary);
    if (extracted) {
      resolvedVehicleMake = sanitizeVehicleField(extracted.vehicleMake) ?? undefined;
      resolvedVehicleModel = sanitizeVehicleField(extracted.vehicleModel) ?? undefined;
      resolvedVehicleYear = extracted.vehicleYear ? parseInt(extracted.vehicleYear, 10) || undefined : undefined;
      resolvedVehicleColor = sanitizeVehicleField(extracted.vehicleColor) ?? undefined;
      console.log(`[VoicePostCall] Extracted vehicle from transcript: ${extracted.vehicleYear || ''} ${extracted.vehicleColor || ''} ${extracted.vehicleMake || ''} ${extracted.vehicleModel || ''}`);
    }
  }

  // Track resolved customer ID — may be set later by autoGenerateQuote for new callers
  let resolvedCustomerId: string | null = customer?.id || null;

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

  console.log(
    `[VoicePostCall] Processing voice call end for ${normalizedPhone},` +
    ` services: [${servicesDiscussed.join(', ')}],` +
    ` interest: ${customerInterest},` +
    ` booked: ${appointmentBooked}`
  );

  // For new callers on non-auto-quote paths (appointment booked, not interested, no services),
  // create a customer record so vehicle info isn't lost
  if (!resolvedCustomerId && (resolvedVehicleMake || resolvedVehicleModel || params.customerName)) {
    const { data: phoneCustomer } = await admin
      .from('customers')
      .select('id, first_name')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (phoneCustomer) {
      resolvedCustomerId = phoneCustomer.id;
      // Upgrade generic name if real name available
      const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
      if (
        phoneCustomer.first_name &&
        GENERIC_FIRST_NAMES.includes(phoneCustomer.first_name.toLowerCase()) &&
        params.customerName &&
        params.customerName.trim().length > 0
      ) {
        const nameParts = params.customerName.trim().split(/\s+/);
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', phoneCustomer.id);
        console.log(`[VoicePostCall] Upgrading customer name from "${phoneCustomer.first_name}" to "${params.customerName.trim()}" for ${normalizedPhone}`);
      }
    } else {
      const fallbackName = params.customerName?.trim() || 'Phone Caller';
      const nameParts = fallbackName.split(/\s+/);
      const inferredType = inferCustomerType(params.transcriptSummary || '');
      const { data: newCust } = await admin
        .from('customers')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '',
          phone: normalizedPhone,
          sms_consent: true,
          customer_type: inferredType,
        })
        .select('id')
        .single();
      if (newCust) {
        resolvedCustomerId = newCust.id;
        console.log(`[VoicePostCall] Created customer "${fallbackName}" (${inferredType}) for ${normalizedPhone} (non-quote path)`);
      }
    }
  }

  // Find or create vehicle — runs BEFORE autoGenerateQuote so vehicle_id is available for quotes
  let resolvedVehicleId: string | undefined;
  if (resolvedCustomerId && resolvedVehicleMake) {
    const { findOrCreateVehicle } = await import('@/lib/utils/vehicle-helpers');
    const vehicleResult = await findOrCreateVehicle(admin, {
      customerId: resolvedCustomerId,
      make: resolvedVehicleMake,
      model: resolvedVehicleModel,
      year: resolvedVehicleYear,
      color: resolvedVehicleColor,
    });
    if (vehicleResult) resolvedVehicleId = vehicleResult.id;
  }

  if (appointmentBooked) {
    // Send confirmation SMS
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: appointment already booked`);
    if (customer?.sms_consent) {
      // Note: the voice-agent/appointments endpoint already sends a detailed
      // confirmation SMS with date/time/service during the call. This post-call
      // message is a brief follow-up.
      const biz = await getBusinessInfo();
      const name = buildFirstNameGreeting(customer.first_name);
      const smsFallback = `Thanks for calling ${biz.name}${name}! Your appointment is confirmed. Questions? Call ${biz.phone}`;
      const { renderSmsTemplate } = await import('@/lib/sms/render-sms-template');
      const templateResult = await renderSmsTemplate('appointment_confirmed_postcall', {
        first_name: customer.first_name || undefined,
        // Session 2D cheap-add (loaded by 2B's customer SELECT expansion).
        last_name: customer.last_name || undefined,
      }, smsFallback);
      const smsBody = templateResult.isActive ? templateResult.body : null;
      if (!smsBody) {
        console.log('[VoicePostCall] Post-call SMS template disabled — skipping SMS');
      }
      const smsResult = smsBody ? await sendSms(normalizedPhone, smsBody, {
        logToConversation: true,
        conversationId: conversation.id,
        customerId: customer.id,
        notificationType: 'voice_followup',
      }) : { success: false, error: 'template disabled' };
      console.log(`[VoicePostCall] SMS send result: ${smsResult.success ? 'success' : 'failure — ' + ('error' in smsResult ? smsResult.error : 'unknown')}`);
    } else {
      console.log(`[VoicePostCall] SMS send result: skipped — no SMS consent (customer: ${customer?.id || 'not found'})`);
    }
  } else if (servicesDiscussed.length === 0) {
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: no services discussed`);
  } else if (params.skipAutoQuote) {
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: skipAutoQuote flag set`);
  } else {
    // Check for recent quotes sent in the last 3 minutes (dedup with send_quote_sms)
    if (resolvedCustomerId) {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: recentQuotes } = await admin
        .from('quotes')
        .select('id')
        .eq('customer_id', resolvedCustomerId)
        .gte('created_at', threeMinutesAgo)
        .limit(1);

      if (recentQuotes && recentQuotes.length > 0) {
        console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: recent quote exists (last 3min)`);
      } else {
        console.log(`[VoicePostCall] Auto-quote decision: sending — reason: services discussed, no recent quote`);
        const createdId = await autoGenerateQuote(
          admin,
          normalizedPhone,
          servicesDiscussed,
          resolvedCustomerId,
          conversation.id,
          params.customerName,
          resolvedVehicleId,
          params.transcriptSummary
        );
        if (createdId) resolvedCustomerId = createdId;
      }
    } else {
      // No existing customer — create one and send auto-quote
      console.log(`[VoicePostCall] Auto-quote decision: sending — reason: services discussed, new caller (will create customer)`);
      const createdId = await autoGenerateQuote(
        admin,
        normalizedPhone,
        servicesDiscussed,
        null,
        conversation.id,
        params.customerName,
        resolvedVehicleId,
        params.transcriptSummary
      );
      if (createdId) resolvedCustomerId = createdId;
    }
  }

  // Backfill conversation customer_id if it was created before the customer existed
  if (resolvedCustomerId && conversation && !conversation.customer_id) {
    await admin
      .from('conversations')
      .update({ customer_id: resolvedCustomerId })
      .eq('id', conversation.id)
      .is('customer_id', null);
    conversation.customer_id = resolvedCustomerId;
  }

  // Mark voice_call_log as completed (was claimed as 'processing' at the top)
  if (params.elevenlabsConversationId) {
    await admin.from('voice_call_log')
      .update({ status: 'completed' })
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId);
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

/** Returns the resolved customer ID (found or created) so the caller can use it */
async function autoGenerateQuote(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  servicesDiscussed: string[],
  customerId: string | null,
  conversationId: string,
  customerName?: string,
  vehicleId?: string,
  transcriptSummary?: string
): Promise<string | null> {
  // Get vehicle size_class for tier-aware pricing
  let sizeClass = 'sedan'; // safe default for unknown vehicles
  if (vehicleId) {
    const { data: vehicle } = await admin
      .from('vehicles')
      .select('size_class')
      .eq('id', vehicleId)
      .single();
    if (vehicle?.size_class) sizeClass = vehicle.size_class;
  }

  // Resolve service names to IDs with correct tier pricing (sale-aware)
  let quoteItems: Array<{
    service_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    tier_name: string | null;
    standard_price: number | null;
    pricing_type: 'standard' | 'sale' | 'combo' | null;
  }> = [];

  for (const serviceName of servicesDiscussed) {
    const service = await resolveServiceByName(admin, serviceName.trim());
    if (!service) {
      console.warn(`[VoicePostCall] Service not found: "${serviceName}"`);
      continue;
    }
    const { price, salePrice, tierName, isOnSale } = resolvePrice(service, sizeClass);
    quoteItems.push({
      service_id: service.id,
      item_name: service.name,
      quantity: 1,
      unit_price: isOnSale ? salePrice! : price,
      tier_name: tierName,
      standard_price: isOnSale ? price : null,
      pricing_type: isOnSale ? 'sale' : 'standard',
    });
  }

  // Issue 33 Layer 1: apply combo pricing from service_addon_suggestions.
  quoteItems = await applyCombosToQuoteItems(admin, quoteItems);

  if (quoteItems.length === 0) {
    console.log('[VoicePostCall] Auto-quote aborted — no services resolved to valid IDs');
    return customerId;
  }

  // Find or create customer.
  // Session 2B: SELECT expanded with last_name/email/phone for shape parity with
  // the outer processVoiceCallEnd customer SELECT — Session 3D will use these
  // fields when the hardcoded quote_sms_postcall send (line ~614 below) migrates
  // to chip-driven.
  let custId = customerId;
  if (!custId) {
    const { data: existing } = await admin
      .from('customers')
      .select('id, first_name, last_name, email, phone')
      .eq('phone', phone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      custId = existing.id;

      // Update generic name with real name if available
      const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
      if (
        existing.first_name &&
        GENERIC_FIRST_NAMES.includes(existing.first_name.toLowerCase()) &&
        customerName &&
        customerName.trim().length > 0
      ) {
        const nameParts = customerName.trim().split(/\s+/);
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', existing.id);
        console.log(`[VoicePostCall] Updated generic name to "${customerName.trim()}" for ${phone}`);
      }
    } else {
      // Create fallback customer — a quote with a generic name is better than no quote
      const fallbackName = customerName?.trim() || 'Phone Caller';
      const nameParts = fallbackName.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      const inferredType = inferCustomerType(transcriptSummary || '');

      const { data: newCust, error: custErr } = await admin
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone,
          sms_consent: true,
          customer_type: inferredType,
        })
        .select('id')
        .single();

      if (custErr || !newCust) {
        console.error('[VoicePostCall] Failed to create fallback customer:', custErr);
        return null;
      }
      custId = newCust.id;
      console.log(`[VoicePostCall] Created fallback customer "${firstName} ${lastName || ''}" (${inferredType}) for ${phone}`);
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

    // Send SMS if customer has consent.
    // Session 3A: migrated from hardcoded body to chip-driven slug
    // `quote_sms_postcall`. Mirrors the appointment_confirmed_postcall pattern
    // — first_name is OPTIONAL; when missing, REMOVE_LINE strips the body's
    // single line and the engine returns our `fallback` string (built with
    // buildFirstNameGreeting so the no-name case reads cleanly without an
    // orphan comma). short_url is the only required chip. last_name +
    // vehicle_description are cheap-adds (already loaded; body doesn't
    // reference them today, but operators can introduce via admin UI).
    const { data: custCheck } = await admin
      .from('customers')
      .select('id, first_name, last_name, email, phone, sms_consent')
      .eq('id', custId)
      .single();

    if (custCheck?.sms_consent) {
      const biz = await getBusinessInfo();
      // Prefer DB-record first_name (Session 2B SELECT expansion); fall back
      // to the agent-provided customerName param to preserve pre-3A behavior
      // when the DB record is missing first_name.
      const firstName = custCheck.first_name || customerName?.trim().split(/\s+/)[0] || undefined;
      const nameGreeting = buildFirstNameGreeting(firstName);
      const fallback = `Thanks for calling ${biz.name}${nameGreeting}! Here's a quote for what we discussed: ${linkUrl}`;

      const { renderSmsTemplate } = await import('@/lib/sms/render-sms-template');
      const tpl = await renderSmsTemplate('quote_sms_postcall', {
        first_name: firstName,
        last_name: custCheck.last_name || undefined,
        short_url: linkUrl,
      }, fallback);

      if (tpl.isActive && tpl.body) {
        const smsResult = await sendSms(phone, tpl.body, {
          logToConversation: true,
          conversationId,
          customerId: custId || undefined,
          notificationType: 'voice_quote_sent',
          contextId: quoteRecord.id,
        });
        console.log(`[VoicePostCall] SMS send result: ${smsResult.success ? 'success' : 'failure — ' + ('error' in smsResult ? smsResult.error : 'unknown')}`);
      } else {
        console.log(`[VoicePostCall] SMS send result: skipped — quote_sms_postcall template disabled`);
      }
    } else {
      console.log(`[VoicePostCall] SMS send result: skipped — no SMS consent (customer: ${custId})`);
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

  return custId;
}

// ---------------------------------------------------------------------------
// Transcript inference helpers
// ---------------------------------------------------------------------------

/** Infer customer type from transcript keywords. Defaults to 'enthusiast'. */
function inferCustomerType(transcript: string): 'enthusiast' | 'professional' {
  if (!transcript) return 'enthusiast';
  const lower = transcript.toLowerCase();
  const professionalKeywords = [
    'dealership', 'dealer', 'fleet', 'wholesale',
    'shop', 'we detail', 'our shop', 'my shop',
    'body shop', 'auto body', 'commercial',
    'multiple cars', 'multiple vehicles', 'bulk',
    'reseller', 'lot', 'car lot', 'used car',
    'detailing business', 'my business', 'our business',
  ];
  return professionalKeywords.some((kw) => lower.includes(kw)) ? 'professional' : 'enthusiast';
}

/** Extract vehicle info from transcript text. Best-effort, returns null if nothing found. */
export function extractVehicleFromTranscript(transcript: string): {
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
} | null {
  if (!transcript) return null;

  const MAKES: Record<string, string> = {
    honda: 'Honda', toyota: 'Toyota', bmw: 'BMW', mercedes: 'Mercedes',
    ford: 'Ford', chevrolet: 'Chevrolet', chevy: 'Chevrolet', tesla: 'Tesla',
    nissan: 'Nissan', hyundai: 'Hyundai', kia: 'Kia', lexus: 'Lexus',
    audi: 'Audi', volkswagen: 'Volkswagen', vw: 'Volkswagen', subaru: 'Subaru',
    mazda: 'Mazda', jeep: 'Jeep', dodge: 'Dodge', ram: 'Ram', gmc: 'GMC',
    cadillac: 'Cadillac', lincoln: 'Lincoln', acura: 'Acura', infiniti: 'Infiniti',
    porsche: 'Porsche', volvo: 'Volvo', buick: 'Buick', chrysler: 'Chrysler',
    mitsubishi: 'Mitsubishi', mini: 'Mini', 'land rover': 'Land Rover',
  };

  const MODELS: Record<string, string[]> = {
    Honda: ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Ridgeline', 'Fit', 'Passport', 'Element', 'S2000', 'Insight'],
    Toyota: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Tacoma', 'Tundra', '4Runner', 'Prius', 'Supra', 'Sienna', 'Avalon', 'Venza', 'GR86', 'Land Cruiser'],
    BMW: ['X1', 'X3', 'X5', 'X7', 'M3', 'M4', 'M5', 'M540i', 'M550i', '328i', '330i', '340i', '528i', '530i', '540i', '740i', '750i'],
    Mercedes: ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'GLS', 'A-Class', 'CLA', 'AMG', 'C300', 'E350', 'S500'],
    Ford: ['F-150', 'Mustang', 'Explorer', 'Escape', 'Bronco', 'Edge', 'Ranger', 'Expedition', 'Maverick', 'Focus', 'Fusion', 'F-250', 'F-350'],
    Chevrolet: ['Silverado', 'Camaro', 'Corvette', 'Equinox', 'Tahoe', 'Suburban', 'Traverse', 'Malibu', 'Blazer', 'Colorado', 'Impala', 'Trax'],
    Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
    Nissan: ['Altima', 'Maxima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Titan', '370Z', 'GT-R', 'Murano', 'Kicks', 'Armada'],
    Hyundai: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Ioniq', 'Venue', 'Genesis'],
    Kia: ['Forte', 'Optima', 'K5', 'Sorento', 'Sportage', 'Telluride', 'Soul', 'Stinger', 'Seltos', 'Carnival'],
    Lexus: ['IS', 'ES', 'GS', 'LS', 'RX', 'NX', 'UX', 'GX', 'LX', 'RC', 'LC'],
    Audi: ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'RS', 'S4', 'S5', 'TT', 'R8', 'e-tron'],
    Volkswagen: ['Jetta', 'Passat', 'Golf', 'GTI', 'Tiguan', 'Atlas', 'Arteon', 'ID.4', 'Taos'],
    Subaru: ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'WRX', 'Legacy', 'Ascent', 'BRZ'],
    Mazda: ['Mazda3', 'Mazda6', 'CX-5', 'CX-9', 'CX-30', 'CX-50', 'MX-5', 'Miata'],
    Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator'],
    Dodge: ['Charger', 'Challenger', 'Durango', 'Hornet'],
    Ram: ['1500', '2500', '3500'],
    GMC: ['Sierra', 'Yukon', 'Terrain', 'Acadia', 'Canyon', 'Denali'],
    Cadillac: ['Escalade', 'CT4', 'CT5', 'XT4', 'XT5', 'XT6', 'Lyriq'],
    Lincoln: ['Navigator', 'Aviator', 'Corsair', 'Nautilus'],
    Acura: ['TLX', 'MDX', 'RDX', 'Integra', 'NSX', 'ILX'],
    Infiniti: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
    Porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', 'Boxster', 'Cayman'],
    Volvo: ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'V60', 'V90'],
  };

  const COLORS = [
    'black', 'white', 'silver', 'gray', 'grey', 'red', 'blue', 'green',
    'gold', 'brown', 'orange', 'yellow', 'purple', 'beige', 'tan',
  ];

  // Split transcript into sentences for context-bounded searching
  const sentences = transcript.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);

  // Search sentences in reverse — last mention is most likely the actual vehicle
  let foundMake: string | undefined;
  let foundModel: string | undefined;
  let foundYear: string | undefined;
  let foundColor: string | undefined;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].toLowerCase();

    // Find make in this sentence
    for (const [key, canonical] of Object.entries(MAKES)) {
      if (sentence.includes(key)) {
        foundMake = canonical;

        // Look for model in same sentence
        const models = MODELS[canonical] || [];
        for (const model of models) {
          if (sentence.includes(model.toLowerCase())) {
            foundModel = model;
            break;
          }
        }

        // Look for year (4-digit 1990-2030) in same sentence
        const yearMatch = sentence.match(/\b(199\d|20[0-3]\d)\b/);
        if (yearMatch) foundYear = yearMatch[1];

        // Look for color in same sentence
        for (const color of COLORS) {
          if (sentence.includes(color)) {
            foundColor = color === 'grey' ? 'Gray' : color.charAt(0).toUpperCase() + color.slice(1);
            break;
          }
        }

        break; // Found a make in this sentence, stop searching makes
      }
    }

    if (foundMake) break; // Found in this sentence, stop searching sentences
  }

  if (!foundMake) return null;

  return {
    vehicleMake: foundMake,
    vehicleModel: foundModel,
    vehicleYear: foundYear,
    vehicleColor: foundColor,
  };
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
